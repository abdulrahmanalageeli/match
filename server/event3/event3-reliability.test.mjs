import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { isIP } from 'node:net'
import { PGlite } from '@electric-sql/pglite'
import { createClient } from '@supabase/supabase-js'
import { protectPartnerPrivacy } from '../participants/result-privacy.mjs'
import { createDatabaseFetch } from '../security/database-fetch.mjs'
import { createAdminFetch } from '../../app/lib/admin-fetch.mjs'

test('non-mutual and unanswered results never disclose contact, answer, or private note', () => {
  for (const mutual of [false, null, undefined]) {
    const input = { mutual_match: mutual, partner_phone: 'PRIVATE_PHONE', partner_wants_match: false, partner_feedback: { wantConnect: false, organizerImpression: 'PRIVATE_NOTE', organizer_impression: 'LEGACY_NOTE', conversationQuality: 4 }, my_feedback: { organizerImpression: 'MY_NOTE' } }
    const result = protectPartnerPrivacy(input)
    assert.equal(result.partner_phone, null)
    assert.equal(result.partner_wants_match, null)
    assert.equal(result.partner_feedback.wantConnect, null)
    assert.equal(result.partner_feedback.organizerImpression, undefined)
    assert.equal(result.partner_feedback.organizer_impression, undefined)
    assert.equal(result.my_feedback.organizerImpression, 'MY_NOTE')
    assert.equal(input.partner_phone, 'PRIVATE_PHONE')
  }
})
test('mutual consent releases contact but never organizer notes', () => {
  const result = protectPartnerPrivacy({ mutual_match: true, partner_phone: 'SHARED_PHONE', partner_feedback: { wantConnect: true, organizerImpression: 'PRIVATE_NOTE' } })
  assert.equal(result.partner_phone, 'SHARED_PHONE')
  assert.equal(result.partner_wants_match, true)
  assert.equal(result.partner_feedback.organizerImpression, undefined)
})
test('verified attendees on one IP have independent limits; unknown callers retain IP limits', async () => {
  const source = await readFile(new URL('../security/request-security.mjs', import.meta.url), 'utf8')
  const limiter = runInNewContext(source.slice(source.indexOf('export function getClientIp'), source.indexOf('export async function recordSecurityEvent')).replaceAll('export function', 'function') + '\nenforceRateLimit', { isIP, buckets: new Map() })
  const req = { headers: { 'x-forwarded-for': '192.0.2.10' } }
  const res = { setHeader() {}, status() { return this }, json() {} }
  for (let n=1;n<=50;n++) for(let request=0;request<120;request++) assert.equal(limiter(req,res,{ key:'verified', identity:String(n), limit:120 }),true)
  assert.equal(limiter(req,res,{key:'verified',identity:'1',limit:120}),false)
  assert.equal(limiter(req,res,{key:'anonymous',limit:1}),true)
  assert.equal(limiter(req,res,{key:'anonymous',limit:1}),false)
})
const stalledFetch = (_input, {signal}) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once:true}))
test('database and admin reads abort stalled requests instead of waiting five minutes', async () => {
  await assert.rejects(createDatabaseFetch(stalledFetch,{readTimeoutMs:15})('https://db.invalid/rest/v1/table'))
  await assert.rejects(createAdminFetch(stalledFetch,{readTimeoutMs:15})('/api/admin',{method:'POST',body:JSON.stringify({action:'get-whatsapp-inbox'})}))
})
test('the real Supabase client does not retry a database deadline', async () => {
  let calls = 0
  const client = createClient('https://synthetic.invalid', 'synthetic-service-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: createDatabaseFetch((...args) => { calls++; return stalledFetch(...args) }, { readTimeoutMs: 15 }) },
  })
  const { error } = await client.from('synthetic_table').select('id')
  assert.match(error.message, /AbortError.*Database request timed out/)
  assert.equal(calls, 1)
})
test('overlapping admin reads share one request with independently readable bodies; writes never share', async () => {
  let calls=0, release
  const gate=new Promise(r=>release=r)
  const fetcher=createAdminFetch(async()=>{calls++;await gate;return Response.json({ok:true})})
  const options={method:'POST',body:JSON.stringify({action:'e3-cohost-dashboard',event_id:26}),headers:{Authorization:'Bearer synthetic'}}
  const reads=[fetcher('/api/admin',options),fetcher('/api/admin',options)]
  assert.equal(calls,1)
  release()
  assert.deepEqual(await Promise.all((await Promise.all(reads)).map(r=>r.json())),[{ok:true},{ok:true}])
  await Promise.all([fetcher('/api/admin',{...options,body:'{"action":"e3-send-notification"}'}),fetcher('/api/admin',{...options,body:'{"action":"e3-send-notification"}'})])
  assert.equal(calls,3)
})
test('read identity/event differences never share responses; outages never become empty successful data', async () => {
  let calls=0
  const fetcher=createAdminFetch(async()=>{calls++;return Response.json({error:'outage'},{status:503})})
  const result=await Promise.allSettled([fetcher('/api/admin',{method:'POST',body:'{"action":"e3-cohost-dashboard","event_id":26}'}),fetcher('/api/admin',{method:'POST',body:'{"action":"e3-cohost-dashboard","event_id":25}'})])
  assert.equal(calls,2)
  assert(result.every(r=>r.status==='rejected'))
})
test('database upstream HTML errors become a bounded structured outage, without retrying writes', async () => {
  let calls=0
  const fetcher=createDatabaseFetch(async()=>{calls++;return new Response('<html>connection timed out</html>',{status:522})})
  const response=await fetcher('https://db.invalid/rest/v1/table',{method:'POST'})
  assert.equal(calls,1)
  assert.equal(response.status,503)
  assert.equal((await response.json()).code,'DATABASE_UNAVAILABLE')
})
test('support RPC keeps both organizer replies, isolates events and callers, and serializes first messages', async () => {
  const db=new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table organizer_requests(id uuid primary key default gen_random_uuid(), event_id integer, participant_token text, participant_number integer, participant_name text, table_info text, message text, organizer_reply text, status text, request_type text, chat_history jsonb, created_at timestamptz default now(), updated_at timestamptz default now());`)
    const migration=await readFile(new URL('../../supabase/migrations/20260830093718_event3_atomic_support_chat.sql',import.meta.url),'utf8')
    await db.exec(migration)
    const send=(text)=>db.query("select send_event3_support_message(26,701,'synthetic-token','Synthetic attendee','table 4',$1,'chat') as result",[text])
    await Promise.all([send('First message'),send('Second message')])
    const initial=(await db.query('select * from organizer_requests')).rows
    assert.equal(initial.length,1)
    const id=initial[0].id
    const reply=(actor,message,event=26,number=null)=>db.query('select append_event3_support_message($1,$2,$3,$4,$5)',[id,event,message,actor,number])
    await Promise.all([reply('host','Host reply'),reply('cohost','Cohost reply')])
    const row=(await db.query('select * from organizer_requests')).rows[0]
    assert.deepEqual(row.chat_history.map(m=>m.text),['First message','Second message','Host reply','Cohost reply'])
    assert.equal(row.chat_history[2].organizer_role,'host')
    await assert.rejects(reply('host','Wrong event',27))
    await assert.rejects(reply('user','Wrong attendee',26,702))
    await db.query("update organizer_requests set status='resolved' where id=$1",[id])
    await assert.rejects(reply('cohost','Closed'))
    await send('New request after closure')
    assert.equal((await db.query('select count(*)::int as n from organizer_requests')).rows[0].n,2)
    for(const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(reply('host','Unauthorized'))
      await db.exec('reset role')
    }
  } finally { await db.close() }
})
