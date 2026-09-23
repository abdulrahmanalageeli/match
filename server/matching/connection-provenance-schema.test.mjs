import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import {
  calculateBalancedCompatibility,
  buildBalancedScoreSnapshot,
} from './balanced-compatibility.mjs'

const VERSION = '2026-09-23-v14-shared-connection-75-25-min-100'
const V12 = '2026-09-03-v12-event26-archetype-ai-chemistry-100'
const V13 = '2026-09-11-v13-events26-27-archetype-ai-chemistry-100'
const sql = await readFile(new URL('../../supabase/migrations/20260923130340_activate_v14_shared_connection_model.sql', import.meta.url), 'utf8')

function fixture(band = 'high') {
  const ratio = band === 'high' ? 1 : band === 'neutral' ? 0.6 : 0
  const vibeAxes = band === 'pending' ? null : {
    current_curiosity: { score: ratio * 5, confidence: 1 },
    hobbies: { score: ratio * 3, confidence: 1 },
  }
  const a = { assigned_number: 1, survey_data: { answers: {
    social_battery: 'A', humor_subtype: 'B', lifestyle_1: 'A',
    match_current_focus: ['career'], conversational_role: 'A',
  } } }
  const b = { assigned_number: 2, survey_data: { answers: {
    social_battery: 'B', humor_subtype: 'C', lifestyle_1: 'D',
    match_current_focus: ['creative'], conversational_role: 'B',
  } } }
  const result = calculateBalancedCompatibility(a, b, { vibeAxes })
  const snapshot = buildBalancedScoreSnapshot(result, { combinedContentHash: 'v14-schema-synthetic' })
  assert.equal(snapshot.scoreModelVersion, VERSION)
  return JSON.parse(JSON.stringify(snapshot))
}

async function setup(t, { phase4 = true, historical = true } = {}) {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.compatibility_cache (score_model_version text, score_breakdown jsonb, vibe_axes jsonb, total_compatibility_score numeric);
    create table public.match_results (score_model_version text, score_snapshot jsonb, compatibility_score numeric);
    create table public.event3_matches (
      phase2_score_model_version text, phase2_score_snapshot jsonb, phase2_score numeric,
      phase3_score_model_version text, phase3_score_snapshot jsonb, phase3_score numeric
      ${phase4 ? ', phase4_score_model_version text, phase4_score_snapshot jsonb, phase4_score numeric' : ''}
    );
    create table public.event3_test_match_results (score_model_version text, score_snapshot jsonb, compatibility_score numeric);
    create function public.current_score_v12() returns text language sql immutable as $$ select '${V12}'::text $$;
    create function public.current_score_v13() returns text language sql immutable as $$ select '${V13}'::text $$;
    create function public.v12_ai_chemistry_score_valid(jsonb,jsonb,numeric) returns boolean language sql immutable
      as $$ select $1->>'historicalVersion' = '${V12}' $$;
    create function public.v13_ai_chemistry_score_valid(jsonb,jsonb,numeric) returns boolean language sql immutable
      as $$ select $1->>'historicalVersion' = '${V13}' $$;
    create view public.v_cache_freshness with (security_invoker = true) as
      select '${V12}'::text as score_model_version, '${V13}'::text as other_version;
  `)
  if (historical) {
    await db.query('insert into public.compatibility_cache values ($1,$2::jsonb,null,44)', [V12, '{"historical":true}'])
    await db.query('insert into public.match_results values ($1,$2::jsonb,39)', [V13, '{"historical":true}'])
  }
  await db.exec(sql)
  await db.exec(sql)
  return db
}

async function valid(db, snapshot, total = snapshot?.totalScore) {
  const value = await db.query(
    'select public.v14_shared_connection_score_valid($1::jsonb,$2::jsonb,$3::numeric) as valid',
    [snapshot?.scoreBreakdown == null ? null : JSON.stringify(snapshot.scoreBreakdown),
      snapshot?.vibeAxes == null ? null : JSON.stringify(snapshot.vibeAxes), total ?? null],
  )
  return value.rows[0].valid
}

test('V14 guard applies twice, preserves historical rows/functions, and advances V12/V13 current routines and view', async t => {
  assert.doesNotMatch(sql, /update\s+(?:public\.)?(?:compatibility_cache|match_results|event3_matches|event3_test_match_results)\s/i)
  const db = await setup(t)
  const result = await db.query('select public.current_score_v12() as v12, public.current_score_v13() as v13')
  assert.deepEqual(result.rows[0], { v12: VERSION, v13: VERSION })
  const view = await db.query('select * from public.v_cache_freshness')
  assert.deepEqual(view.rows[0], { score_model_version: VERSION, other_version: VERSION })
  for (const [name, version] of [['v12_ai_chemistry_score_valid', V12], ['v13_ai_chemistry_score_valid', V13]]) {
    const result = await db.query(`select public.${name}($1::jsonb,'{}'::jsonb,0) as valid`, [JSON.stringify({ historicalVersion: version })])
    assert.equal(result.rows[0].valid, true)
  }
  const oldCache = await db.query('select * from public.compatibility_cache')
  assert.deepEqual(oldCache.rows[0], { score_model_version: V12, score_breakdown: { historical: true }, vibe_axes: null, total_compatibility_score: '44' })
  const oldMatch = await db.query('select * from public.match_results')
  assert.deepEqual(oldMatch.rows[0], { score_model_version: V13, score_snapshot: { historical: true }, compatibility_score: '39' })
  const constraints = await db.query("select conname, convalidated from pg_constraint where conname like '%v14_shared_connection_consistent' order by conname")
  assert.equal(constraints.rows.length, 6)
  assert.ok(constraints.rows.every(row => row.convalidated === false))
  await db.query('insert into public.compatibility_cache values ($1,null,null,null)', [V13])
})

test('V14 SQL accepts actual shared snapshots with diagnostic-only high/neutral/low/pending and6/2/0 decimals', async t => {
  const db = await setup(t)
  for (const band of ['high', 'neutral', 'low', 'pending']) {
    const snapshot = fixture(band)
    assert.equal(snapshot.scoreBreakdown.aiChemistryBand, band)
    assert.equal(snapshot.scoreBreakdown.aiChemistryAdjustment, 0)
    assert.equal(snapshot.scoreBreakdown.aiChemistryApplied, false)
    for (const total of [snapshot.totalScore, Math.round(snapshot.totalScore * 100) / 100, Math.round(snapshot.totalScore)]) {
      assert.equal(await valid(db, snapshot, total), true, `${band} total ${total}`)
      await db.query('insert into public.compatibility_cache values($1,$2::jsonb,$3::jsonb,$4)',
        [VERSION, JSON.stringify(snapshot.scoreBreakdown), JSON.stringify(snapshot.vibeAxes), total])
    }
    for (const table of ['match_results', 'event3_test_match_results']) {
      await db.query(`insert into public.${table} values($1,$2::jsonb,$3)`, [VERSION, JSON.stringify(snapshot), snapshot.totalScore])
    }
    for (const phase of [2, 3, 4]) {
      await db.query(`insert into public.event3_matches(phase${phase}_score_model_version,phase${phase}_score_snapshot,phase${phase}_score) values($1,$2::jsonb,$3)`,
        [VERSION, JSON.stringify(snapshot), snapshot.totalScore])
    }
  }
  const pending = fixture('pending')
  pending.vibeAxes = {}
  assert.equal(await valid(db, pending), true)
})

test('V14 SQL rejects absent metadata, wrong arithmetic, legacy AI boosts, invalid diagnostic claims and null totals', async t => {
  const db = await setup(t)
  const good = fixture('high')
  const mutations = {
    missingPersonalized: s => { delete s.scoreBreakdown.personalized },
    nullPersonalized: s => { s.scoreBreakdown.personalized = null },
    wrongVersion: s => { s.scoreBreakdown.personalized.scoreModelVersion = V13 },
    wrongSource: s => { s.scoreBreakdown.personalized.sourceArtifactSha256 = '0'.repeat(64) },
    missingSource: s => { delete s.scoreBreakdown.personalized.sourceArtifactSha256 },
    wrongMeaning: s => { s.scoreBreakdown.personalized.scoreMeaning = 'probability' },
    wrongCalibration: s => { s.scoreBreakdown.personalized.calibration = 'isotonic' },
    wrongMutualFormula: s => { s.scoreBreakdown.personalized.mutualFormula = 'geometric-mean' },
    historyApplied: s => { s.scoreBreakdown.personalized.personalHistoryApplied = true },
    historyNull: s => { s.scoreBreakdown.personalized.personalHistoryApplied = null },
    missingHistory: s => { delete s.scoreBreakdown.personalized.personalHistoryApplied },
    methodWrong: s => { s.scoreBreakdown.scoringMethod = 'archetype-ai' },
    methodMissing: s => { delete s.scoreBreakdown.scoringMethod },
    actualAI: s => { s.scoreBreakdown.aiChemistryAdjustment = 12 },
    aiApplied: s => { s.scoreBreakdown.aiChemistryApplied = true },
    aiAppliedMissing: s => { delete s.scoreBreakdown.aiChemistryApplied },
    wrongBase: s => { s.scoreBreakdown.personalizedBase += 1 },
    wrongFinal: s => { s.scoreBreakdown.finalScore += 1 },
    wrongPriority: s => { s.scoreBreakdown.personalized.priorityScore += 1 },
    wrongMin: s => { s.scoreBreakdown.personalized.totalScore += 1 },
    wrongRawMin: s => { s.scoreBreakdown.personalized.rawMutualUtility += 1 },
    rawMissing: s => { delete s.scoreBreakdown.personalized.aToB.rawUtility },
    rawNull: s => { s.scoreBreakdown.personalized.bToA.rawUtility = null },
    rawString: s => { s.scoreBreakdown.personalized.aToB.rawUtility = '0.2' },
    scoreOutsideRange: s => { s.scoreBreakdown.personalized.aToB.score = 101 },
    scoreBelowRange: s => { s.scoreBreakdown.personalized.bToA.score = -1 },
    scoreNull: s => { s.scoreBreakdown.personalized.bToA.score = null },
    scoreString: s => { s.scoreBreakdown.personalized.aToB.score = '30' },
    directionMissing: s => { delete s.scoreBreakdown.personalized.aToB },
    totalNull: s => { s.scoreBreakdown.personalized.totalScore = null },
    suggestedWrong: s => { s.scoreBreakdown.aiChemistrySuggestedAdjustment = -8 },
    suggestedMissing: s => { delete s.scoreBreakdown.aiChemistrySuggestedAdjustment },
    chemistryWrong: s => { s.scoreBreakdown.aiChemistryScore = 0.5 },
    chemistryMissing: s => { delete s.scoreBreakdown.aiChemistryScore },
    bandWrong: s => { s.scoreBreakdown.aiChemistryBand = 'low' },
    readyFalseDespiteAxes: s => { s.scoreBreakdown.aiChemistryReady = false },
    readyMissing: s => { delete s.scoreBreakdown.aiChemistryReady },
    readyNull: s => { s.scoreBreakdown.aiChemistryReady = null },
    axesMissingReady: s => { s.vibeAxes = null },
    confidenceMissingReady: s => { delete s.vibeAxes.hobbies.confidence },
    scoreMissingReady: s => { delete s.vibeAxes.current_curiosity.score },
    fallbackMarkedReady: s => { s.vibeAxes.hobbies.reason = 'fallback' },
  }
  for (const [name, change] of Object.entries(mutations)) {
    const snapshot = structuredClone(good)
    change(snapshot)
    assert.equal(await valid(db, snapshot), false, name)
    await assert.rejects(() => db.query('insert into public.compatibility_cache values($1,$2::jsonb,$3::jsonb,$4)',
      [VERSION, JSON.stringify(snapshot.scoreBreakdown), JSON.stringify(snapshot.vibeAxes), snapshot.totalScore]), undefined, name)
  }
  assert.equal(await valid(db, null), false)
  assert.equal(await valid(db, { scoreBreakdown: {} }), false)
  assert.equal(await valid(db, good, null), false)
  assert.equal(await valid(db, good, 'NaN'), false)
  assert.equal(await valid(db, good, 'Infinity'), false)
  assert.equal(await valid(db, good, good.totalScore + 1), false)
  for (const mutate of [
    s => { delete s.scoreBreakdown.aiChemistryScore },
    s => { s.scoreBreakdown.aiChemistrySuggestedAdjustment = 12 },
    s => { s.scoreBreakdown.aiChemistryBand = 'high' },
  ]) {
    const pending = fixture('pending')
    mutate(pending)
    assert.equal(await valid(db, pending), false)
  }
})

test('V14 constraints reject null snapshots in every persistence table and work without optional phase4 columns', async t => {
  const db = await setup(t, { phase4: false })
  const constraints = await db.query("select conname from pg_constraint where conname like '%v14_shared_connection_consistent'")
  assert.equal(constraints.rows.length, 5)
  await assert.rejects(() => db.query('insert into public.compatibility_cache values($1,null,null,20)', [VERSION]))
  for (const table of ['match_results', 'event3_test_match_results']) {
    await assert.rejects(() => db.query(`insert into public.${table} values($1,null,20)`, [VERSION]))
    await db.query(`insert into public.${table} values($1,null,20)`, [V12])
  }
  for (const phase of [2, 3]) {
    await assert.rejects(() => db.query(`insert into public.event3_matches(phase${phase}_score_model_version,phase${phase}_score_snapshot,phase${phase}_score) values($1,null,20)`, [VERSION]))
    await db.query(`insert into public.event3_matches(phase${phase}_score_model_version,phase${phase}_score_snapshot,phase${phase}_score) values($1,null,20)`, [V13])
  }
})
