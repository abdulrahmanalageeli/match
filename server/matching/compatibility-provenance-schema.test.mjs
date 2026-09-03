import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const root = new URL('../../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')

test('balanced compatibility migration persists every cache and match provenance field', async () => {
  const sql = await read('supabase/migrations/20260825010911_persist_balanced_compatibility_provenance.sql')

  for (const field of [
    'score_model_version',
    'score_breakdown',
    'question_scores',
    'vibe_axes',
    'vibe_model_version',
    'score_snapshot',
    'score_content_hash',
    'phase2_score_model_version',
    'phase2_score_snapshot',
    'phase2_score_content_hash',
    'phase3_score_model_version',
    'phase3_score_snapshot',
    'phase3_score_content_hash',
  ]) {
    assert.match(sql, new RegExp(`\\b${field}\\b`), `migration must include ${field}`)
  }

  assert.match(sql, /p_score_model_version text default null/)
  assert.match(sql, /scope\.score_model_version is distinct from '2026-08-25-v7-balanced-100'[\s\S]*then 'STALE_MODEL'/)
  assert.match(sql, /compatibility_cache_versioned_payload_complete/)
  assert.match(sql, /score_model_version is null[\s\S]*score_breakdown is not null[\s\S]*jsonb_typeof\(score_breakdown\) = 'object'[\s\S]*question_scores is not null[\s\S]*jsonb_typeof\(question_scores\) = 'object'[\s\S]*vibe_axes is not null[\s\S]*jsonb_typeof\(vibe_axes\) = 'object'[\s\S]*vibe_model_version is not null/)
  assert.match(sql, /replace_event3_test_match_results[\s\S]*score_snapshot jsonb/)
  assert.match(sql, /replace_event3_participant_without_score_provenance/)
  assert.match(sql, /v_result := public\.replace_event3_participant_without_score_provenance/)
  assert.match(sql, /to_regprocedure\([\s\S]*replace_event3_participant_without_score_provenance/)
  for (const constraint of [
    'match_results_score_provenance_complete',
    'event3_matches_phase2_score_provenance_complete',
    'event3_matches_phase3_score_provenance_complete',
    'event3_test_match_results_score_provenance_complete',
  ]) {
    assert.match(sql, new RegExp(`\\b${constraint}\\b`), `migration must enforce ${constraint}`)
  }
  assert.match(sql, /score_snapshot ->> 'totalScore'\)::numeric = compatibility_score::numeric/)
  assert.match(sql, /phase2_score_snapshot ->> 'totalScore'\)::numeric = phase2_score::numeric/)
  assert.match(sql, /phase3_score_snapshot ->> 'totalScore'\)::numeric = phase3_score::numeric/)
  assert.match(sql, /create or replace function public\.apply_match_swap_plan_with_score_provenance/)
  assert.match(sql, /apply_match_swap_plan_with_score_provenance[\s\S]*security definer[\s\S]*set search_path = ''/)
  assert.match(sql, /affected participants must be a non-empty array of unique positive numbers/)
  assert.match(sql, /not \(v_a = any\(p_affected\)\)[\s\S]*not \(v_b = any\(p_affected\)\)/)
  assert.match(sql, /revoke all on function public\.apply_match_swap_plan\([\s\S]*service_role/)
  assert.match(sql, /create or replace function public\.swap_event3_match_partner/)
  assert.match(sql, /if p_phase is null or p_phase not in \('phase2', 'phase3'\)/)
  assert.match(sql, /grant execute on function public\.swap_event3_match_partner[\s\S]*to service_role/)
  assert.match(sql, /replace_event3_test_match_results[\s\S]*pg_advisory_xact_lock[\s\S]*event3-test-mode:/)
  assert.match(sql, /replace_event3_participant\([\s\S]*security definer[\s\S]*pg_advisory_xact_lock[\s\S]*event3-test-mode:/)
  assert.match(sql, /revoke all on function public\.replace_event3_participant_without_score_provenance\([\s\S]*service_role/)
  assert.match(sql, /revoke all on function public\.replace_event3_participant_live\([\s\S]*service_role/)
  assert.doesNotMatch(sql, /pg_catalog\.(?:least|greatest)\s*\(/i)
  for (const snapshotField of ['scoreBreakdown', 'questionScores', 'vibeAxes', 'vibeModel', 'vibeModelVersion', 'vibeModelTag']) {
    assert.match(sql, new RegExp(`'${snapshotField}'`), `migration must validate complete snapshot field ${snapshotField}`)
  }
  assert.match(sql, /Event3 replacement provenance expected two mirrored rows/)
  assert.match(sql, /Standard replacement provenance expected one row/)
})

test('canonical checked-in schemas describe the runtime provenance contract', async () => {
  const [cache, metadata, matches, event3, duplicatedEventStateSchema] = await Promise.all([
    read('database/compatibility_cache.sql'),
    read('database/cache_metadata.sql'),
    read('database/match_result_schema.sql'),
    read('database/event3_schema.sql'),
    read('database/event_state_schema.sql'),
  ])

  assert.match(cache, /model_used text null/)
  assert.match(cache, /score_model_version text null/)
  assert.match(cache, /question_scores jsonb null/)
  assert.match(cache, /compatibility_cache_versioned_payload_complete/)
  assert.match(cache, /compatibility_cache_v9_evidence_consistent/)
  assert.match(cache, /score_breakdown -> 'rawTotal'/)
  assert.match(cache, /score_breakdown -> 'neutralBaseline'/)
  assert.match(cache, /score_breakdown -> 'evidenceTotal'/)
  assert.match(duplicatedEventStateSchema, /compatibility_cache_versioned_payload_complete/)
  assert.match(duplicatedEventStateSchema, /compatibility_cache_v9_evidence_consistent/)
  assert.match(metadata, /p_score_model_version text default null/)
  assert.match(metadata, /create or replace view public\.v_cache_freshness/)
  assert.match(metadata, /scope\.score_model_version/)
  assert.match(metadata, /event_enrolled_at/)
  assert.match(metadata, /next_event_signup_timestamp/)
  assert.match(metadata, /2026-09-03-v12-event26-archetype-ai-chemistry-100/)
  assert.match(metadata, /drop function if exists public\.record_cache_session\([\s\S]*numeric, text[\s\S]*\);/)
  assert.match(metadata, /then 'STALE_MODEL'/)
  assert.match(matches, /score_snapshot jsonb null/)
  assert.match(matches, /score_content_hash text null/)
  assert.match(matches, /match_results_score_provenance_complete/)
  assert.match(matches, /match_results_v9_evidence_consistent/)
  assert.match(event3, /phase2_score_snapshot jsonb/)
  assert.match(event3, /phase3_score_snapshot jsonb/)
  assert.match(event3, /event3_matches_phase2_score_provenance_complete/)
  assert.match(event3, /event3_matches_phase3_score_provenance_complete/)
  assert.match(event3, /event3_test_match_results_score_provenance_complete/)
  assert.match(event3, /event3_matches_phase2_v9_evidence_consistent/)
  assert.match(event3, /event3_matches_phase3_v9_evidence_consistent/)
  assert.match(event3, /event3_matches_phase4_v9_evidence_consistent/)
  assert.match(event3, /event3_test_match_results_v9_evidence_consistent/)
  for (const snapshotField of ['scoreBreakdown', 'questionScores', 'vibeAxes', 'vibeModel', 'vibeModelVersion', 'vibeModelTag']) {
    assert.match(matches, new RegExp(`'${snapshotField}'`), `match schema must validate ${snapshotField}`)
    assert.match(event3, new RegExp(`'${snapshotField}'`), `Event3 schema must validate ${snapshotField}`)
  }
})

test('v12 AI chemistry activation validates the full base, correction, and final-score formula', async () => {
  const sql = await read('supabase/migrations/20260903150000_activate_v12_ai_chemistry_model.sql')
  assert.match(sql, /2026-09-03-v12-event26-archetype-ai-chemistry-100/)
  assert.match(sql, /v12_ai_chemistry_score_valid/)
  assert.match(sql, /expected_chemistry >= 0\.75 then 12/)
  assert.match(sql, /expected_chemistry < 0\.55 then -8/)
  assert.match(sql, /compatibility_cache_v12_ai_chemistry_consistent/)
  assert.match(sql, /match_results_v12_ai_chemistry_consistent/)
  assert.match(sql, /event3_matches_phase2_v12_ai_chemistry_consistent/)
  assert.match(sql, /event3_matches_phase3_v12_ai_chemistry_consistent/)
  assert.match(sql, /event3_test_match_results_v12_ai_chemistry_consistent/)
  assert.doesNotMatch(sql, /update\s+(?:public\.)?(?:compatibility_cache|match_results|event3_matches)/i)
})

test('v12 AI chemistry migration executes and rejects a total that bypasses its correction', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create table public.compatibility_cache (score_model_version text, score_breakdown jsonb, vibe_axes jsonb, total_compatibility_score numeric);
    create table public.match_results (score_model_version text, score_snapshot jsonb, compatibility_score numeric);
    create table public.event3_matches (
      phase2_score_model_version text, phase2_score_snapshot jsonb, phase2_score numeric,
      phase3_score_model_version text, phase3_score_snapshot jsonb, phase3_score numeric
    );
    create table public.event3_test_match_results (score_model_version text, score_snapshot jsonb, compatibility_score numeric);
    create function public.current_score_model() returns text language sql immutable
      as $$ select '2026-09-03-v11-event26-archetype-personalized-100'::text $$;
    create view public.v_cache_freshness with (security_invoker = true) as
      select '2026-09-03-v11-event26-archetype-personalized-100'::text as score_model_version;
  `)
  await db.exec(await read('supabase/migrations/20260903150000_activate_v12_ai_chemistry_model.sql'))

  const version = '2026-09-03-v12-event26-archetype-ai-chemistry-100'
  const personalized = { scoreModelVersion: version, totalScore: 80, aToB: { score: 80 }, bToA: { score: 80 } }
  const vibeAxes = {
    current_curiosity: { score: 5, confidence: 1 },
    hobbies: { score: 3, confidence: 1 },
  }
  const breakdown = {
    personalized,
    personalizedBase: 80,
    aiChemistryScore: 1,
    aiChemistryAdjustment: 12,
    aiChemistryBand: 'high',
    aiChemistryReady: true,
    finalScore: 92,
  }
  const validity = await db.query(
    'select public.v12_ai_chemistry_score_valid($1::jsonb, $2::jsonb, 92) as valid',
    [JSON.stringify(breakdown), JSON.stringify(vibeAxes)],
  )
  assert.equal(validity.rows[0].valid, true)
  await db.query(`
    insert into public.compatibility_cache (score_model_version, score_breakdown, vibe_axes, total_compatibility_score)
    values ($1, $2::jsonb, $3::jsonb, 92)
  `, [version, JSON.stringify(breakdown), JSON.stringify(vibeAxes)])
  await assert.rejects(() => db.query(`
    insert into public.compatibility_cache (score_model_version, score_breakdown, vibe_axes, total_compatibility_score)
    values ($1, $2::jsonb, $3::jsonb, 80)
  `, [version, JSON.stringify(breakdown), JSON.stringify(vibeAxes)]))

  const routine = await db.query('select public.current_score_model() as version')
  const freshness = await db.query('select score_model_version as version from public.v_cache_freshness')
  assert.equal(routine.rows[0].version, version)
  assert.equal(freshness.rows[0].version, version)
})

test('feedback-evidence model migration advances database provenance guards without rewriting historical scores', async () => {
  const sql = await read('supabase/migrations/20260902160000_advance_algorithm_feedback_score_model.sql')
  assert.match(sql, /2026-09-02-v9-feedback-evidence-100/)
  assert.match(sql, /compatibility_cache_v9_evidence_consistent/)
  assert.match(sql, /match_results_v9_evidence_consistent/)
  assert.match(sql, /event3_matches_phase2_v9_evidence_consistent/)
  assert.match(sql, /event3_matches_phase3_v9_evidence_consistent/)
  assert.match(sql, /event3_matches_phase4_v9_evidence_consistent/)
  assert.match(sql, /event3_test_match_results_v9_evidence_consistent/)
  assert.match(sql, /round\(\(score_breakdown ->> 'evidenceTotal'\)::numeric, 2\) = total_compatibility_score/)
  assert.match(sql, /pg_get_functiondef/)
  assert.match(sql, /create or replace view public\.v_cache_freshness/)
  assert.match(sql, /alter view public\.v_cache_freshness set \(security_invoker = true\)/)
  assert.match(sql, /revoke all on table public\.v_cache_freshness from public, anon, authenticated/)
  assert.doesNotMatch(sql, /update\s+(?:public\.)?(?:compatibility_cache|match_results|event3_matches)/i)
})

test('personalized model activation advances cache provenance without rewriting historical rows', async () => {
  const sql = await read('supabase/migrations/20260903090000_activate_event26_personalized_matching_model.sql')
  const followUpSql = await read('supabase/migrations/20260903100000_complete_event26_personalized_model_provenance.sql')
  assert.match(sql, /2026-08-25-v7-balanced-100/)
  assert.match(sql, /2026-09-02-v9-feedback-evidence-100/)
  assert.match(sql, /2026-09-03-v11-event26-archetype-personalized-100/)
  assert.match(sql, /v11_personalized_score_valid/)
  assert.match(sql, /compatibility_cache_v11_personalized_consistent/)
  assert.match(sql, /match_results_v11_personalized_consistent/)
  assert.match(sql, /event3_matches_phase2_v11_personalized_consistent/)
  assert.match(sql, /event3_matches_phase3_v11_personalized_consistent/)
  assert.match(sql, /event3_matches_phase4_v11_personalized_consistent/)
  assert.match(sql, /event3_test_match_results_v11_personalized_consistent/)
  assert.match(sql, /pg_get_functiondef/)
  assert.match(sql, /create or replace view public\.v_cache_freshness/)
  assert.match(sql, /alter view public\.v_cache_freshness set \(security_invoker = true\)/)
  assert.match(sql, /revoke all on table public\.v_cache_freshness from public, anon, authenticated/)
  assert.doesNotMatch(sql, /update\s+(?:public\.)?(?:compatibility_cache|match_results|event3_matches)/i)
  assert.match(followUpSql, /2026-08-25-v7-balanced-100/)
  assert.match(followUpSql, /2026-09-03-v11-event26-archetype-personalized-100/)
  assert.match(followUpSql, /Cache freshness view did not advance to v11/)
  assert.doesNotMatch(followUpSql, /update\s+(?:public\.)?(?:compatibility_cache|match_results|event3_matches)/i)
})

test('personalized provenance follow-up upgrades legacy v7 routines and freshness idempotently', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create function public.current_score_model()
      returns text
      language sql
      immutable
      as $$ select '2026-08-25-v7-balanced-100'::text $$;
    create view public.v_cache_freshness with (security_invoker = true) as
      select '2026-08-25-v7-balanced-100'::text as score_model_version;
  `)

  const sql = await read('supabase/migrations/20260903100000_complete_event26_personalized_model_provenance.sql')
  await db.exec(sql)
  await db.exec(sql)

  const routine = await db.query('select public.current_score_model() as score_model_version')
  const freshness = await db.query('select score_model_version from public.v_cache_freshness')
  assert.equal(routine.rows[0].score_model_version, '2026-09-03-v11-event26-archetype-personalized-100')
  assert.equal(freshness.rows[0].score_model_version, '2026-09-03-v11-event26-archetype-personalized-100')
})

test('personalized model migration executes and advances routines and cache freshness', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create table public.compatibility_cache (
      score_model_version text,
      score_breakdown jsonb,
      total_compatibility_score numeric
    );
    create table public.event3_matches (
      phase2_score numeric,
      phase2_score_model_version text,
      phase2_score_snapshot jsonb,
      phase3_score numeric,
      phase3_score_model_version text,
      phase3_score_snapshot jsonb
    );
    create function public.current_score_model()
      returns text
      language sql
      immutable
      as $$ select '2026-09-02-v9-feedback-evidence-100'::text $$;
    create view public.v_cache_freshness with (security_invoker = true) as
      select '2026-09-02-v9-feedback-evidence-100'::text as score_model_version;
  `)

  await db.exec(await read('supabase/migrations/20260903090000_activate_event26_personalized_matching_model.sql'))

  const routine = await db.query('select public.current_score_model() as score_model_version')
  const freshness = await db.query('select score_model_version from public.v_cache_freshness')
  const options = await db.query(`
    select reloptions
    from pg_catalog.pg_class
    where oid = 'public.v_cache_freshness'::regclass
  `)
  assert.equal(routine.rows[0].score_model_version, '2026-09-03-v11-event26-archetype-personalized-100')
  assert.equal(freshness.rows[0].score_model_version, '2026-09-03-v11-event26-archetype-personalized-100')
  assert.deepEqual(options.rows[0].reloptions, ['security_invoker=true'])

  const event3Constraints = await db.query(`
    select conname
    from pg_catalog.pg_constraint
    where conrelid = 'public.event3_matches'::regclass
      and conname like 'event3_matches_phase%_v11_personalized_consistent'
    order by conname
  `)
  assert.deepEqual(event3Constraints.rows.map(row => row.conname), [
    'event3_matches_phase2_v11_personalized_consistent',
    'event3_matches_phase3_v11_personalized_consistent',
  ])

  const validPersonalized = {
    scoreModelVersion: '2026-09-03-v11-event26-archetype-personalized-100',
    totalScore: 80,
    aToB: { score: 80 },
    bToA: { score: 80 },
  }
  await db.query(`
    insert into public.compatibility_cache (score_model_version, score_breakdown, total_compatibility_score)
    values ($1, $2::jsonb, 80)
  `, [routine.rows[0].score_model_version, JSON.stringify({ personalized: validPersonalized })])
  await assert.rejects(() => db.query(`
    insert into public.compatibility_cache (score_model_version, score_breakdown, total_compatibility_score)
    values ($1, $2::jsonb, 80)
  `, [routine.rows[0].score_model_version, JSON.stringify({ personalized: { ...validPersonalized, bToA: { score: 20 } } })]))
})

test('feedback-evidence migration executes and rejects inconsistent cache and match columns', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create table public.compatibility_cache (
      score_model_version text,
      score_breakdown jsonb,
      total_compatibility_score numeric
    );
    create table public.match_results (
      score_model_version text,
      score_snapshot jsonb
    );
    create table public.event3_matches (
      phase2_score_model_version text, phase2_score_snapshot jsonb,
      phase3_score_model_version text, phase3_score_snapshot jsonb,
      phase4_score_model_version text, phase4_score_snapshot jsonb
    );
    create table public.event3_test_match_results (
      score_model_version text,
      score_snapshot jsonb
    );
  `)
  await db.exec(await read('supabase/migrations/20260902160000_advance_algorithm_feedback_score_model.sql'))

  const version = '2026-09-02-v9-feedback-evidence-100'
  const rawTotal = 75.123456
  const evidenceTotal = 50.246912
  const scoreBreakdown = { rawTotal, neutralBaseline: 50, evidenceTotal }
  const wholeNumberSnapshot = { totalScore: 50, scoreBreakdown }
  const invalidSnapshot = { totalScore: 50, scoreBreakdown: { ...scoreBreakdown, evidenceTotal: 51.246912 } }

  await db.query(
    'insert into public.compatibility_cache values ($1, $2::jsonb, $3)',
    [version, JSON.stringify(scoreBreakdown), 50.25],
  )
  await assert.rejects(() => db.query(
    'insert into public.compatibility_cache values ($1, $2::jsonb, $3)',
    [version, JSON.stringify({ ...scoreBreakdown, neutralBaseline: 40 }), 50.25],
  ))

  await db.query('insert into public.match_results values ($1, $2::jsonb)', [version, JSON.stringify(wholeNumberSnapshot)])
  await assert.rejects(() => db.query('insert into public.match_results values ($1, $2::jsonb)', [version, JSON.stringify(invalidSnapshot)]))

  for (const phase of ['phase2', 'phase3', 'phase4']) {
    await db.query(
      `insert into public.event3_matches (${phase}_score_model_version, ${phase}_score_snapshot) values ($1, $2::jsonb)`,
      [version, JSON.stringify(wholeNumberSnapshot)],
    )
    await assert.rejects(() => db.query(
      `insert into public.event3_matches (${phase}_score_model_version, ${phase}_score_snapshot) values ($1, $2::jsonb)`,
      [version, JSON.stringify(invalidSnapshot)],
    ))
  }

  await db.query('insert into public.event3_test_match_results values ($1, $2::jsonb)', [version, JSON.stringify(wholeNumberSnapshot)])
  await assert.rejects(() => db.query('insert into public.event3_test_match_results values ($1, $2::jsonb)', [version, JSON.stringify(invalidSnapshot)]))
})
