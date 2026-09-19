import { before, beforeEach, after, test } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"

const MAIN = "00000000-0000-0000-0000-000000000000"
const EVENT3 = "00000000-0000-0000-0000-000000000003"
let db
before(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table event_state(match_id uuid primary key,current_event_id integer,phase text default 'setup',test_mode_active boolean default false,global_timer_active boolean,global_timer_start_time timestamptz,global_timer_duration integer,global_timer_round integer,phase2_score_revealed boolean,phase3_score_revealed boolean);
    create table event3_event_settings(match_id uuid,event_id integer,event_format text,primary key(match_id,event_id));
    create table event3_participants(event_id integer);
    create table session_assignments(event_id integer);
    create table participants(event_id integer);
    create table match_results(event_id integer);
    create table group_matches(event_id integer);
    insert into event_state(match_id,current_event_id) values('${MAIN}',29),('${EVENT3}',29);
    insert into event3_event_settings values('${EVENT3}',28,'choice_only_three_groups');`)
  await db.exec(await readFile(new URL("../../supabase/migrations/20260919070805_event3_mutual_default_for_new_events.sql", import.meta.url), "utf8"))
})
after(async () => db?.close())
beforeEach(async () => {
  await db.exec(`truncate event3_event_settings;
    update event_state set current_event_id=29,phase='setup',test_mode_active=false;
    insert into event3_event_settings values('${EVENT3}',28,'choice_only_three_groups');`)
})
const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0].result
const switchEvent = (number, format = null) => scalar("select set_current_event_with_event3_sync_v2($1,$2) result", [number, format])
const setting = number => scalar("select coalesce((select event_format from event3_event_settings where event_id=$1),'classic') result", [number])

test("rollout records the boundary and leaves current and historical formats unchanged", async () => {
  assert.equal(await scalar("select first_event_id result from event3_new_event_default"), 30)
  assert.equal(await setting(29), "classic")
  assert.equal(await setting(28), "choice_only_three_groups")
  assert.equal(await scalar("select count(*)::integer result from event3_event_settings"), 1)
})

test("new editions default to mutual choice and atomically update both pointers", async () => {
  const result = await switchEvent(30)
  assert.equal(result.event_created, true)
  assert.equal(result.event_format, "mutual_choice_six_rounds")
  assert.equal(result.event3_reset, true)
  assert.equal(await setting(30), "mutual_choice_six_rounds")
  assert.equal(await scalar("select count(*)::integer result from event_state where current_event_id=30"), 2)
})

test("explicit creation formats are honored and cannot overwrite an existing edition", async () => {
  assert.equal((await switchEvent(30, "classic")).event_format, "classic")
  assert.equal((await switchEvent(31, "choice_only_three_groups")).event_format, "choice_only_three_groups")
  const revisit = await switchEvent(30, "mutual_choice_six_rounds")
  assert.equal(revisit.event_created, false)
  assert.equal(revisit.event_format, "classic")
  assert.equal(await setting(31), "choice_only_three_groups")
})

test("switching old editions never retroactively creates a format setting", async () => {
  const historical = await switchEvent(25, "mutual_choice_six_rounds")
  assert.equal(historical.event_created, false)
  assert.equal(historical.event_format, "classic")
  assert.equal(await scalar("select count(*)::integer result from event3_event_settings where event_id=25"), 0)
  assert.equal((await switchEvent(28, "classic")).event_format, "choice_only_three_groups")
})

test("older clients and direct pointer writes get the same default", async () => {
  const result = await scalar("select set_current_event_with_event3_sync(30) result")
  assert.equal(result.event_format, "mutual_choice_six_rounds")
  await db.query("update event_state set current_event_id=31 where match_id=$1", [EVENT3])
  assert.equal(await setting(31), "mutual_choice_six_rounds")
})

test("reopening the current edition preserves its active phase and explicit settings", async () => {
  await switchEvent(30)
  await db.query("update event_state set phase='round1' where match_id=$1", [EVENT3])
  const result = await switchEvent(30, "classic")
  assert.equal(result.event_created, false)
  assert.equal(result.event3_reset, false)
  assert.equal(result.event_format, "mutual_choice_six_rounds")
  assert.equal(await scalar("select phase result from event_state where match_id=$1", [EVENT3]), "round1")
})

test("test sessions and invalid formats fail without creating a setting", async () => {
  await assert.rejects(switchEvent(30, "unknown"), /Unknown event format/)
  await db.query("update event_state set test_mode_active=true where match_id=$1", [EVENT3])
  await assert.rejects(switchEvent(30), /End Event3 test mode/)
  assert.equal(await scalar("select count(*)::integer result from event3_event_settings where event_id=30"), 0)
  assert.equal(await scalar("select current_event_id result from event_state where match_id=$1", [MAIN]), 29)
})

test("default management remains inaccessible to browser database roles", async () => {
  for (const role of ["anon", "authenticated"]) {
    assert.equal(await scalar("select has_table_privilege($1,'event3_new_event_default','update') result", [role]), false)
    assert.equal(await scalar("select has_function_privilege($1,'set_current_event_with_event3_sync_v2(integer,text)','execute') result", [role]), false)
  }
})
