import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')

test('balanced compatibility migration persists every cache and match provenance field', async () => {
  const sql = await read('supabase/migrations/20260825140000_persist_balanced_compatibility_provenance.sql')

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
  assert.match(duplicatedEventStateSchema, /compatibility_cache_versioned_payload_complete/)
  assert.match(metadata, /p_score_model_version text default null/)
  assert.match(metadata, /create or replace view public\.v_cache_freshness/)
  assert.match(metadata, /scope\.score_model_version/)
  assert.match(metadata, /event_enrolled_at/)
  assert.match(metadata, /next_event_signup_timestamp/)
  assert.match(metadata, /drop function if exists public\.record_cache_session\([\s\S]*numeric, text[\s\S]*\);/)
  assert.match(metadata, /then 'STALE_MODEL'/)
  assert.match(matches, /score_snapshot jsonb null/)
  assert.match(matches, /score_content_hash text null/)
  assert.match(matches, /match_results_score_provenance_complete/)
  assert.match(event3, /phase2_score_snapshot jsonb/)
  assert.match(event3, /phase3_score_snapshot jsonb/)
  assert.match(event3, /event3_matches_phase2_score_provenance_complete/)
  assert.match(event3, /event3_matches_phase3_score_provenance_complete/)
  assert.match(event3, /event3_test_match_results_score_provenance_complete/)
  for (const snapshotField of ['scoreBreakdown', 'questionScores', 'vibeAxes', 'vibeModel', 'vibeModelVersion', 'vibeModelTag']) {
    assert.match(matches, new RegExp(`'${snapshotField}'`), `match schema must validate ${snapshotField}`)
    assert.match(event3, new RegExp(`'${snapshotField}'`), `Event3 schema must validate ${snapshotField}`)
  }
})
