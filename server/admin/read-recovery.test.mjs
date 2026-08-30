import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createClient } from '@supabase/supabase-js'
import ts from 'typescript'
import { adminReadAction, createAdminFetch } from '../../app/lib/admin-fetch.mjs'

const source = await readFile(new URL('../../api/admin/index.mjs', import.meta.url), 'utf8')
const handlerSource = source.slice(source.indexOf('export default async function handler')).replace('export default ', '')
const matchId = '00000000-0000-0000-0000-000000000000'

async function maxEventResponse(rows, { authorized = true, failingTable } = {}) {
  const requests = []
  const supabase = createClient('https://synthetic.invalid', 'synthetic-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input)
      requests.push(url)
      assert.equal(init.method, 'GET', 'reading the maximum must never write event data')
      assert.equal(url.searchParams.get('match_id'), `eq.${matchId}`)
      const table = url.pathname.split('/').at(-1)
      if (table === failingTable) return Response.json({ message: 'synthetic outage', code: 'DATABASE_UNAVAILABLE' }, { status: 503 })
      return Response.json(rows[table] ? [rows[table]] : [])
    } },
  })
  const handler = runInNewContext(`${handlerSource}\nhandler`, {
    supabase, STATIC_MATCH_ID: matchId, EVENT3_COHOST_ACTIONS: new Set(),
    process: { env: { SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-key' } },
    console: { log() {}, warn() {}, error() {} },
    enforceRateLimit: () => true,
    requireAdmin: async (_req, res) => {
      if (!authorized) res.status(401).json({ error: 'Unauthorized' })
      return authorized
    },
  })
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
  await handler({ method: 'POST', query: {}, body: { action: 'get-max-event-id' }, headers: {} }, res)
  return { status: res.statusCode, body: res.body, requests }
}

test('the dashboard maximum-event read is routed and includes the current event without results', async () => {
  const result = await maxEventResponse({ participants: { event_id: 24 }, match_results: { event_id: 25 }, group_matches: { event_id: 19 }, event_state: { current_event_id: 26 } })
  assert.equal(result.status, 200)
  assert.equal(result.body.max_event_id, 26)
  assert.equal(result.requests.length, 4)
  for (const request of result.requests.filter(url => !url.pathname.endsWith('/event_state'))) {
    assert.equal(request.searchParams.get('limit'), '1')
    assert.equal(request.searchParams.get('order'), 'event_id.desc.nullslast')
  }
})

test('the maximum includes historical events after switching to an older event', async () => {
  const result = await maxEventResponse({ participants: { event_id: 26 }, match_results: { event_id: 28 }, group_matches: { event_id: 27 }, event_state: { current_event_id: 20 } })
  assert.equal(result.status, 200)
  assert.equal(result.body.max_event_id, 28)
})

test('an empty event history starts at one, but an outage never returns a false maximum', async () => {
  const empty = await maxEventResponse({})
  assert.equal(empty.status, 200)
  assert.equal(empty.body.max_event_id, 1)
  const failed = await maxEventResponse({ event_state: { current_event_id: 26 } }, { failingTable: 'match_results' })
  assert.equal(failed.status, 503)
  assert.equal(failed.body.max_event_id, undefined)
})

test('the maximum-event read requires admin authorization before any database access', async () => {
  const result = await maxEventResponse({}, { authorized: false })
  assert.equal(result.status, 401)
  assert.equal(result.requests.length, 0)
})

test('POST participants uses the read deadline and reports failures without retrying writes', async () => {
  const init = { method: 'POST', body: JSON.stringify({ action: 'participants' }) }
  assert.equal(adminReadAction('/api/admin', init), 'participants')
  const events = []
  const fetcher = createAdminFetch((_input, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })), { readTimeoutMs: 10, notify: event => events.push(event) })
  await assert.rejects(fetcher('/api/admin', init))
  assert.deepEqual(events.map(event => event.state), ['pending', 'error'])
  assert.equal(adminReadAction('/api/admin', { method: 'POST', body: '{"action":"set-current-event-id"}' }), null)
})

test('HTTP failures keep their status and report exactly one terminal health event', async () => {
  for (const status of [401, 403, 405, 423, 429, 503]) {
    const events = []
    const fetcher = createAdminFetch(async () => Response.json({ error: 'synthetic failure' }, { status }), { notify: event => events.push(event) })
    const read = fetcher('/api/admin', { method: 'POST', body: '{"action":"get-max-event-id"}' })
    if (status >= 500) await assert.rejects(read, error => error.status === status)
    else assert.equal((await read).status, status, 'auth/lock bodies must remain available to route guards')
    assert.deepEqual(events.map(event => event.state), ['pending', 'error'])
    assert.equal(events.at(-1).status, status)
  }
})

test('the dashboard keeps its participant rows and counts when a read is rejected or malformed', async () => {
  const route = await readFile(new URL('../../app/routes/admin.tsx', import.meta.url), 'utf8')
  const start = route.indexOf('const fetchParticipants = async () => {')
  const end = route.indexOf('  const calculateOptimalRounds', start)
  assert(start >= 0 && end > start)
  const { outputText } = ts.transpileModule(route.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } })
  for (const [status, body] of [[401, { error: 'Unauthorized' }], [405, { participants: [] }], [200, {}]]) {
    const fetchingParticipantsRef = { current: false }
    let rowUpdates = 0, countUpdates = 0, loading = false
    const refresh = runInNewContext(`${outputText}\nfetchParticipants`, {
      fetch: async () => Response.json(body, { status }),
      fetchingParticipantsRef,
      currentEventId: 26,
      setLoading: value => { loading = value },
      setParticipants: () => { rowUpdates++ },
      localStorage: { getItem: () => '0', setItem: () => { countUpdates++ } },
      console: { error() {} },
    })
    await refresh()
    assert.equal(rowUpdates, 0)
    assert.equal(countUpdates, 0)
    assert.equal(loading, false)
    assert.equal(fetchingParticipantsRef.current, false, 'a failed read must release the retry guard')
  }
})
