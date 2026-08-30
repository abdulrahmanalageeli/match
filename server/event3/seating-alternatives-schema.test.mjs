import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { PGlite } from "@electric-sql/pglite"
import { canonicalSeating } from "./seating-alternatives.mjs"

test("database applies both rounds atomically and rejects stale, invalid, or active-event changes", async t => {
  const db = new PGlite()
  const event3 = "00000000-0000-0000-0000-000000000003"
  const main = "00000000-0000-0000-0000-000000000000"
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table public.event_state (match_id uuid primary key, current_event_id integer, phase text, global_timer_active boolean default false, groups_locked boolean default false, test_mode_active boolean default false, test_mode_snapshot jsonb);
      create table public.participants (assigned_number integer primary key, match_id uuid, gender text, survey_data jsonb);
      create table public.event3_participants (match_id uuid, event_id integer, participant_number integer, position integer, phase2_excluded boolean default false);
      create table public.session_assignments (id integer generated always as identity, match_id uuid, event_id integer, round integer, table_number integer, participant_id integer, unique(match_id,event_id,round,participant_id));
      create table public.participant_rankings (match_id uuid, event_id integer);
      create table public.event3_ranking_drafts (match_id uuid, event_id integer, session_key text);
      create table public.event3_group_member_feedback (match_id uuid, event_id integer, is_test_mode boolean);
      create table public.event3_cohost_notes (match_id uuid, event_id integer, test_mode boolean, test_session_key text, scope_type text, round integer);
      create table public.event3_matches (match_id uuid, event_id integer);
      create table public.locked_matches (match_id uuid, event_id integer, participant1_number integer, participant2_number integer);
      create table public.event3_exclusions (match_id uuid, event_id integer, participant_a_number integer, participant_b_number integer);
      insert into public.event_state (match_id,current_event_id,phase) values ('${event3}',26,'setup'),('${main}',26,'form');
      insert into public.participants select n,'${main}','male','{}'::jsonb from generate_series(1,8) n;
      insert into public.event3_participants (match_id,event_id,participant_number,position) select '${event3}',26,n,n-1 from generate_series(1,8) n;
      insert into public.event3_ranking_drafts values ('${event3}',26,'old-test-session');
      insert into public.session_assignments (match_id,event_id,round,table_number,participant_id) values ('${event3}',99,20,1,1);
    `)
    const baseline = canonicalSeating([
      ...[[1, 2], [3, 4], [5, 6], [7, 8]].flatMap((people, i) => people.map(participant_id => ({ round: 1, table_number: i + 1, participant_id }))),
      ...[[1, 3], [2, 5], [4, 7], [6, 8]].flatMap((people, i) => people.map(participant_id => ({ round: 2, table_number: i + 1, participant_id }))),
    ])
    for (const row of baseline) await db.query("insert into public.session_assignments (match_id,event_id,round,table_number,participant_id) values ($1,26,$2,$3,$4)", [event3, row.round, row.table_number, row.participant_id])
    const alternative = canonicalSeating(baseline.map(row => ({ ...row, participant_id: row.participant_id === 2 ? 4 : row.participant_id === 4 ? 2 : row.participant_id })))
    await db.exec(await readFile(new URL("../../supabase/migrations/20260830142020_event3_seating_alternatives.sql", import.meta.url), "utf8"))
    const current = async () => (await db.query("select round,table_number,participant_id from public.session_assignments where event_id=26 order by round,participant_id")).rows
    const apply = (expected = baseline, proposed = alternative, testMode = false, sessionKey = "live") => db.query("select public.apply_event3_seating_alternative($1,26,$2,$3,$4::jsonb,$5::jsonb) as result", [event3, testMode, sessionKey, JSON.stringify(expected), JSON.stringify(proposed)])

    await t.test("updates both rounds, keeps assignment IDs and other events, and tolerates a retry", async () => {
      await db.exec("begin")
      const beforeIds = (await db.query("select id,round,participant_id from public.session_assignments order by id")).rows
      assert.equal((await apply()).rows[0].result.updated_assignments, 4)
      assert.deepEqual(await current(), alternative)
      assert.deepEqual((await db.query("select id,round,participant_id from public.session_assignments order by id")).rows, beforeIds)
      assert.equal((await apply()).rows[0].result.already_applied, true)
      assert.equal((await db.query("select count(*)::int as n from public.event3_ranking_drafts")).rows[0].n, 1)
      await db.exec("rollback")
    })
    for (const [label, sql, error] of [
      ["stale seating", "update public.session_assignments set table_number=9 where event_id=26 and participant_id=1 and round=1", /Seating changed/],
      ["changed roster", `delete from public.event3_participants where participant_number=8`, /Every current attendee/],
      ["started groups", `update public.event_state set phase='round1' where match_id='${event3}'`, /groups have started/],
      ["active timer", `update public.event_state set global_timer_active=true where match_id='${event3}'`, /groups have started/],
      ["locked groups", `update public.event_state set groups_locked=true where match_id='${event3}'`, /groups have started/],
      ["different test mode", `update public.event_state set test_mode_active=true where match_id='${event3}'`, /test session changed/],
      ["live ranking draft", `insert into public.event3_ranking_drafts values ('${event3}',26,'live')`, /Existing rankings/],
      ["saved ranking", `insert into public.participant_rankings values ('${event3}',26)`, /Existing rankings/],
      ["group feedback", `insert into public.event3_group_member_feedback values ('${event3}',26,false)`, /Existing rankings/],
      ["table notes", `insert into public.event3_cohost_notes values ('${event3}',26,false,'','table',1)`, /Existing rankings/],
      ["one-to-one sessions", `insert into public.session_assignments (match_id,event_id,round,table_number,participant_id) values ('${event3}',26,20,1,1)`, /Existing rankings/],
      ["new exclusion", `insert into public.event3_exclusions values ('${event3}',26,1,4)`, /excluded or locked/],
      ["new locked pair", `insert into public.locked_matches values ('${main}',26,1,4)`, /excluded or locked/],
    ]) await t.test(`rejects ${label} without partially updating either round`, async () => {
      await db.exec("begin")
      await db.exec(sql)
      await assert.rejects(apply(), error)
      await db.exec("rollback")
      assert.deepEqual(await current(), baseline)
    })
    await t.test("rejects duplicates, a missing attendee, or altered gender counts", async () => {
      for (const malformed of [alternative.slice(1), [...alternative.slice(1), alternative[1]], alternative.map(row => row.participant_id === 1 ? { ...row, participant_id: 99 } : row)]) {
        await assert.rejects(apply(baseline, malformed), /Every current attendee/)
        assert.deepEqual(await current(), baseline)
      }
      await db.exec("begin; update public.participants set gender='female' where assigned_number=2")
      await assert.rejects(apply(), /gender counts changed/)
      await db.exec("rollback")
    })
    await t.test("test sessions apply only to the matching session and never delete live drafts", async () => {
      await db.exec(`begin; update public.event_state set test_mode_active=true,test_mode_snapshot='{"started_at":"session-a"}' where match_id='${event3}'; insert into public.event3_ranking_drafts values ('${event3}',26,'live')`)
      await assert.rejects(apply(baseline, alternative, true, "session-b"), /test session changed/)
      await db.exec("rollback")
      await db.exec(`begin; update public.event_state set test_mode_active=true,test_mode_snapshot='{"started_at":"session-a"}' where match_id='${event3}'; insert into public.event3_ranking_drafts values ('${event3}',26,'live')`)
      assert.equal((await apply(baseline, alternative, true, "session-a")).rows[0].result.success, true)
      assert.equal((await db.query("select count(*)::int as n from public.event3_ranking_drafts where session_key='live'")).rows[0].n, 1)
      await db.exec("rollback")
    })
    await t.test("browser roles cannot execute the mutation", async () => {
      const signature = "public.apply_event3_seating_alternative(uuid,integer,boolean,text,jsonb,jsonb)"
      const { rows } = await db.query("select has_function_privilege('anon',$1,'EXECUTE') as anon,has_function_privilege('authenticated',$1,'EXECUTE') as authenticated,has_function_privilege('service_role',$1,'EXECUTE') as service", [signature])
      assert.deepEqual(rows[0], { anon: false, authenticated: false, service: true })
    })
  } finally { await db.close() }
})
