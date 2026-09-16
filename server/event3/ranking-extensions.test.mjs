import { before, beforeEach, after, test } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"

const MATCH = "00000000-0000-0000-0000-000000000003"
const read = name => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8")
let db
before(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table event_state(match_id uuid primary key,current_event_id integer,phase text,test_mode_active boolean default false,test_mode_snapshot jsonb);
    create table event3_participants(match_id uuid,event_id integer,participant_number integer);
    create table session_assignments(match_id uuid,event_id integer,round integer,table_number integer,participant_id integer);
    create table participant_rankings(id uuid default gen_random_uuid() primary key,match_id uuid,event_id integer,ranker_number integer,ranked_number integer,rank integer,auto_saved boolean default false,submitted_at timestamptz default now(),unique(match_id,event_id,ranker_number,ranked_number));`)
  await db.exec(await read("20260830085709_complete_event3_rankings_on_phase_exit.sql"))
  const hardened = await read("20260905125242_harden_event3_variable_test_runtime.sql")
  await db.exec(hardened.match(/create or replace function public\.assert_event3_auxiliary_session\([\s\S]*?\$\$;/)[0])
  await db.exec(await read("20260916124110_individual_ranking_extensions.sql"))
})
after(async () => db?.close())
beforeEach(async () => {
  await db.exec("truncate event3_ranking_extensions,event3_ranking_drafts,participant_rankings,event_state,session_assignments,event3_participants")
  await db.query("insert into event_state values ($1,28,'ranking1',false,null)", [MATCH])
  await db.query("insert into event3_participants values ($1,28,1)", [MATCH])
  for (const [round, numbers] of [[1,[1,2,3,4]],[2,[1,5,6,7]]]) {
    for (const n of numbers) await db.query("insert into session_assignments values ($1,28,$2,1,$3)", [MATCH,round,n])
  }
  await db.query("select save_event3_ranking($1,28,1,1,array[2,3,4],1,false,true)", [MATCH])
  await db.query("insert into participant_rankings(match_id,event_id,ranker_number,ranked_number,rank) values ($1,27,1,9,1),($1,28,2,1,1)", [MATCH])
})
const scalar = async (sql,params=[]) => (await db.query(sql,params)).rows[0].result
const grant = (seconds=120,test=false,session=null) => scalar("select grant_event3_ranking_extension(28,1,$1,'admin',$2,$3) as result",[seconds,test,session])
const resolve = (id=null,order=null,revision=0,draft=true,test=false,session=null) => scalar("select resolve_event3_ranking_extension(28,1,$1,$2,$3,$4,$5,$6) as result",[test,session,id,order,revision,draft])
const ballot = async () => (await db.query("select ranked_number,auto_saved from participant_rankings where event_id=28 and ranker_number=1 order by rank")).rows
const phase = value => db.query("update event_state set phase=$1",[value])

test("a private timer keeps the auto-saved ballot and reopens only that person", async () => {
  const ext = await grant()
  assert.equal(ext.completed_rounds,1)
  assert.deepEqual((await ballot()).map(r=>r.ranked_number),[2,3,4])
  assert.equal((await resolve()).extension.id,ext.id)
  const other = await scalar("select resolve_event3_ranking_extension(28,2,false,null) as result")
  assert.equal(other.extension,null)
  assert.equal((await db.query("select phase from event_state")).rows[0].phase,"ranking1")
})
test("resubmission succeeds after everyone advances and preserves others and history", async () => {
  const ext = await grant()
  await phase("round2")
  const saved = await resolve(ext.id,[4,2,3],3,false)
  assert.equal(saved.complete,true)
  assert.deepEqual((await ballot()).map(r=>r.ranked_number),[4,2,3])
  assert.ok((await ballot()).every(r=>!r.auto_saved))
  assert.equal((await db.query("select phase from event_state")).rows[0].phase,"round2")
  assert.equal((await db.query("select count(*)::int n from participant_rankings where event_id=27 or ranker_number=2")).rows[0].n,2)
  assert.equal((await resolve()).extension,null)
})
test("drafts survive refresh and the global phase-exit autosave cannot consume them", async () => {
  const ext = await grant()
  await resolve(ext.id,[3,4,2],4,true)
  await phase("round2")
  assert.deepEqual((await resolve()).extension.ranked_numbers,[3,4,2])
  assert.deepEqual((await ballot()).map(r=>r.ranked_number),[2,3,4])
  await resolve(ext.id,[3,4,2],5,false)
  assert.deepEqual((await ballot()).map(r=>r.ranked_number),[3,4,2])
})
test("expired timers use the last synced draft, rejecting a late replacement", async () => {
  const ext = await grant()
  await resolve(ext.id,[4,3,2],4,true)
  await db.exec("update event3_ranking_extensions set expires_at=now()-interval '1 second'")
  const saved = await resolve(ext.id,[2,4,3],9,false)
  assert.equal(saved.expired,true)
  assert.deepEqual((await ballot()).map(r=>r.ranked_number),[4,3,2])
  assert.ok((await ballot()).every(r=>r.auto_saved))
  await resolve(ext.id,[2,3,4],10,false)
  assert.deepEqual((await ballot()).map(r=>r.ranked_number),[4,3,2])
})
test("expiry without a new draft keeps the original auto-save", async () => {
  await grant()
  await db.exec("update event3_ranking_extensions set expires_at=now()-interval '1 second'")
  assert.equal((await resolve()).extension,null)
  assert.deepEqual((await ballot()).map(r=>r.ranked_number),[2,3,4])
})
test("stale drafts, invalid ballots, replaced grants and old clients cannot overwrite", async () => {
  const ext = await grant()
  await resolve(ext.id,[4,3,2],10,true)
  assert.equal((await resolve(ext.id,[2,3,4],9,true)).stale,true)
  await assert.rejects(resolve(ext.id,[2,2,4],11,false),/each participant/)
  const next = await grant()
  assert.notEqual(next.id,ext.id)
  await assert.rejects(resolve(ext.id,[2,3,4],12,false),/timer changed/)
  await db.query("select save_event3_ranking_v2($1,28,1,1,array[4,3,2],100,false,false,false,null)",[MATCH])
  assert.deepEqual((await ballot()).map(r=>r.ranked_number),[2,3,4])
})
test("a later cumulative ranking closes an older extension", async () => {
  const ext = await grant()
  await phase("round2"); await phase("ranking2")
  assert.equal((await resolve(ext.id,[4,3,2],3,false)).saved,false)
  await db.query("select save_event3_ranking_v2($1,28,1,2,array[7,6,5,4,3,2],100,false,false,false,null)",[MATCH])
  assert.deepEqual((await ballot()).map(r=>r.ranked_number),[7,6,5,4,3,2])
})
test("test-session changes, setup and historical targets cannot reopen live ballots", async () => {
  await assert.rejects(scalar("select grant_event3_ranking_extension(27,1,120,'admin',false,null) as result"),/event changed/)
  await db.exec("update event_state set test_mode_active=true,test_mode_snapshot='{\"started_at\":\"test-one\"}'")
  const ext = await grant(120,true,"test-one")
  await assert.rejects(resolve(ext.id,[4,3,2],3,false,false,null),/session changed/)
  await db.exec("update event_state set test_mode_active=false")
  assert.equal((await db.query("select count(*)::int n from event3_ranking_extensions")).rows[0].n,0)
  await grant(); await phase("setup")
  assert.equal((await db.query("select count(*)::int n from event3_ranking_extensions")).rows[0].n,0)
})
test("only auto-saved rankings qualify and duration is bounded", async () => {
  await assert.rejects(grant(0),/between/)
  await assert.rejects(grant(601),/between/)
  await db.exec("update participant_rankings set auto_saved=false")
  await assert.rejects(grant(),/automatically saved/)
})
test("attendee database roles cannot grant, read or resolve extensions", async () => {
  await grant()
  for (const role of ["anon","authenticated"]) {
    await db.exec(`set role ${role}`)
    try {
      await assert.rejects(grant(),/permission denied/)
      await assert.rejects(resolve(),/permission denied/)
      await assert.rejects(db.query("select * from event3_ranking_extensions"),/permission denied/)
    } finally { await db.exec("reset role") }
  }
})
