import { before, beforeEach, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
const MATCH = '00000000-0000-0000-0000-000000000003'
let db
before(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table event_state(match_id uuid primary key,current_event_id integer,phase text,test_mode_active boolean default false,test_mode_snapshot jsonb);
    create table event3_participants(match_id uuid,event_id integer,participant_number integer);
    create table event3_matches(match_id uuid,event_id integer,participant_number integer,phase2_partner integer);
    create table participant_rankings(match_id uuid,event_id integer,ranker_number integer,ranked_number integer,rank integer);`)
  const hardened = await readFile(new URL('../../supabase/migrations/20260905125242_harden_event3_variable_test_runtime.sql', import.meta.url), 'utf8')
  await db.exec(hardened.match(/create or replace function public\.assert_event3_auxiliary_session\([\s\S]*?\$\$;/)[0])
  await db.exec(await readFile(new URL('../../supabase/migrations/20260916141223_event3_top_choice_rewards.sql', import.meta.url), 'utf8'))
})
after(async () => db?.close())
beforeEach(async () => {
  await db.exec('truncate event_state,event3_participants,event3_matches,participant_rankings,event3_choice_awards')
  await db.query("insert into event_state values ($1,28,'phase2_processing',false,null)", [MATCH])
  for (const n of [1,2,3,4,5,6]) await db.query('insert into event3_participants values ($1,28,$2)',[MATCH,n])
  await db.query('insert into event3_matches values ($1,28,1,2)', [MATCH])
})
const vote = (from,to,rank=1,event=28) => db.query('insert into participant_rankings values ($1,$2,$3,$4,$5)',[MATCH,event,from,to,rank])
const phase = name => db.query('update event_state set phase=$1',[name])
const awards = async () => (await db.query('select * from event3_choice_awards order by participant_number')).rows
const seed = async () => { await vote(2,1); await vote(3,1); await vote(4,2); await phase('break'); return (await awards())[0] }

test('awards the most distinct #1 votes only when the matching break opens', async () => {
  await vote(2,1); await vote(3,1); await vote(4,2); await vote(5,2,2); await vote(6,2,2)
  await phase('ranking3'); assert.equal((await awards()).length,0)
  await phase('phase2_processing'); assert.equal((await awards()).length,0)
  await phase('break')
  const [winner] = await awards()
  assert.equal(winner.participant_number,1)
  assert.equal(winner.first_choice_count,2)
  assert.equal(winner.discount_percent,50)
  assert.equal(winner.tied_winners,1)
  assert.match(winner.reward_code,/^BM-[A-F0-9]{12}$/)
})
test('every tied winner receives a separate 50% reward', async () => {
  await vote(3,1); await vote(4,1); await vote(5,2); await vote(6,2); await phase('break')
  const rows = await awards()
  assert.deepEqual(rows.map(row => row.participant_number),[1,2])
  assert.ok(rows.every(row => row.tied_winners === 2 && row.discount_percent === 50))
  assert.notEqual(rows[0].reward_code,rows[1].reward_code)
})
test('ignores self votes, outsiders, old events, duplicate votes and malformed double-first ballots', async () => {
  await vote(2,1); await vote(2,1); await vote(1,1); await vote(9,2); await vote(3,9); await vote(4,2,1,27)
  await vote(5,2); await vote(5,3); await phase('break')
  assert.deepEqual((await awards()).map(row => [row.participant_number,row.first_choice_count]),[[1,1]])
})
test('no fabricated reward without votes or generated choice matches', async () => {
  await phase('break'); assert.equal((await awards()).length,0)
  await phase('phase2_processing'); await vote(2,1); await db.exec('delete from event3_matches'); await phase('break')
  assert.equal((await awards()).length,0)
})
test('freeze winners and codes across refreshes, rematching and backwards phase jumps', async () => {
  const original = await seed()
  await phase('break'); await phase('ranking3'); await db.exec('delete from participant_rankings'); await vote(1,2); await phase('break')
  assert.deepEqual((await awards()).map(row => row.id),[original.id])
})
test('test sessions are isolated and can never redeem real discounts', async () => {
  const live = await seed()
  await phase('ranking3'); await db.exec(`update event_state set test_mode_active=true,test_mode_snapshot='{"started_at":"test-one"}'`); await phase('break')
  const rows = await awards()
  assert.equal(rows.length,2)
  const preview = rows.find(row => row.is_test_mode)
  assert.equal(preview.session_key,'test-one')
  await assert.rejects(db.query('select redeem_event3_choice_award($1,28)',[live.id]),/session changed/)
  await db.exec('update event_state set test_mode_active=false,current_event_id=29')
  assert.equal((await db.query('select redeem_event3_choice_award($1,29) as ok',[preview.id])).rows[0].ok,false)
})
test('only the owner can acknowledge; acknowledgement persists without consuming discount', async () => {
  const winner = await seed()
  const ack = number => db.query('select acknowledge_event3_choice_award($1,$2,28,false,null) as ok',[winner.id,number])
  assert.equal((await ack(2)).rows[0].ok,false)
  assert.equal((await ack(1)).rows[0].ok,true)
  assert.ok((await awards())[0].seen_at)
  assert.equal((await awards())[0].redeemed_at,null)
})
test('reward redeems once, in a later real event only', async () => {
  const winner = await seed()
  assert.equal((await db.query('select redeem_event3_choice_award($1,28) as ok',[winner.id])).rows[0].ok,false)
  await db.exec('update event_state set current_event_id=29')
  assert.equal((await db.query('select redeem_event3_choice_award($1,29) as ok',[winner.id])).rows[0].ok,true)
  assert.equal((await db.query('select redeem_event3_choice_award($1,29) as ok',[winner.id])).rows[0].ok,false)
  assert.equal((await awards())[0].redeemed_event_id,29)
})
test('participant database roles cannot read awards or invoke acknowledgement/redemption', async () => {
  for (const role of ['anon','authenticated']) {
    const { rows } = await db.query(`select has_table_privilege($1,'event3_choice_awards','select') as can_read,
      has_function_privilege($1,'acknowledge_event3_choice_award(uuid,integer,integer,boolean,text)','execute') as can_ack,
      has_function_privilege($1,'redeem_event3_choice_award(uuid,integer)','execute') as can_redeem`,[role])
    assert.deepEqual(rows[0],{can_read:false,can_ack:false,can_redeem:false})
  }
})
