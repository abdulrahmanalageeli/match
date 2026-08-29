import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')

function between(source, start, end) {
  const startIndex = source.indexOf(start)
  assert.notEqual(startIndex, -1, `missing source marker: ${start}`)
  const endIndex = source.indexOf(end, startIndex + start.length)
  assert.notEqual(endIndex, -1, `missing source marker: ${end}`)
  return source.slice(startIndex, endIndex)
}

test('recalc-vibe preserves old cache rows and only succeeds after an exact verified replacement', async () => {
  const source = await read('api/admin/trigger-match.mjs')
  const block = between(source, 'if (action === "recalc-vibe")', 'console.log(`🎯 MATCH GENERATION START')

  assert.doesNotMatch(block, /\.delete\s*\(/)
  assert.match(block, /result\?\.cacheStored !== true/)
  assert.match(block, /\.eq\('combined_content_hash', cacheKey\.combinedHash\)/)
  assert.match(block, /\.eq\('vibe_content_hash', cacheKey\.vibeHash\)/)
  assert.match(block, /\.eq\('score_model_version', COMPATIBILITY_SCORE_VERSION\)/)
  assert.match(block, /success:\s*errors === 0/)
})

test('every individual cache and vibe-retry scope excludes pairs blocked by the existing interaction gate', async () => {
  const source = await read('api/admin/trigger-match.mjs')
  const scopes = [
    between(source, 'async function verifyCurrentBalancedCacheCoverage', 'async function storeCachedCompatibility'),
    between(source, 'if (action === "pre-cache")', 'if (action === "cache-pairs-batched")'),
    between(source, 'if (action === "cache-pairs-batched")', '// CACHE STATUS BY GENDER MODE'),
    between(source, 'if (action === "cache-status-by-gender")', 'if (action === "cache-status-by-gender-batched")'),
    between(source, 'if (action === "cache-status-by-gender-batched")', 'if (action === "delta-pre-cache")'),
    between(source, 'if (action === "delta-pre-cache")', 'if (action === "delta-pre-cache-batched")'),
    between(source, 'if (action === "delta-pre-cache-batched")', 'if (action === "recalc-vibe")'),
    between(source, 'if (action === "recalc-vibe")', 'console.log(`🎯 MATCH GENERATION START'),
  ]

  for (const scope of scopes) {
    assert.match(scope, /checkInteractionStyleCompatibility\s*\(/)
  }
})

test('match generation hydrates exact snapshots and bulk-touches cache usage once', async () => {
  const source = await read('api/admin/trigger-match.mjs')
  const block = between(source, '// Calculate MBTI-based compatibility for all pairs', '// Log completion summary')
  const exactHit = between(block, 'if (cachedData) {', '} else if (reusableVibeData) {')
  const participantView = between(source, '// Calculate compatibility with all hard-gate-compatible potential matches', '// Sort by uncapped priority')

  assert.match(exactHit, /hydrateBalancedCompatibilityFromCacheRow\(cachedData\)/)
  assert.match(exactHit, /cacheUsageIds\.add\(cachedData\.id\)/)
  assert.doesNotMatch(exactHit, /\.update\s*\(/)
  assert.match(block, /await touchCompatibilityCacheUsage\(cacheUsageIds\)/)
  assert.match(block, /const MATCH_CALCULATION_CONCURRENCY = 12/)
  assert.match(block, /pairs\.slice\(batchStart, batchStart \+ MATCH_CALCULATION_CONCURRENCY\)/)
  assert.match(block, /Promise\.all\(pairBatch\.map\(async/)
  assert.match(block, /cacheRowsToStore\.push/)
  assert.match(block, /await storeCachedCompatibilities\(cacheRowsToStore\)/)
  assert.doesNotMatch(block, /storeCachedCompatibility\(a, b, compatibilityResult\)/)
  assert.match(participantView, /hydrateBalancedCompatibilityFromCacheRow\(cachedData\)/)
  assert.match(participantView, /viewCacheUsageIds\.add\(cachedData\.id\)/)
  assert.doesNotMatch(participantView, /\.update\s*\(/)
  assert.match(participantView, /await touchCompatibilityCacheUsage\(viewCacheUsageIds\)/)

  const previousMatchQuery = between(source, 'const { data: allPreviousMatches', '// Build a Set of previously matched pairs')
  assert.match(previousMatchQuery, /\.eq\("match_id", match_id\)/)
})

test('cache storage bulk-upserts arrays in bounded chunks', async () => {
  const source = await read('api/admin/trigger-match.mjs')
  const bulkStore = between(source, 'async function storeCachedCompatibilities', 'async function storeCachedCompatibility')

  assert.match(bulkStore, /chunk\.map\(item => item\.row\)/)
  assert.match(bulkStore, /\.upsert\([\s\S]*onConflict: 'participant_a_number,participant_b_number,combined_content_hash'/)
  assert.match(bulkStore, /Math\.min\(Number\(chunkSize\) \|\| 100, 500\)/)
})

test('bulk cache reads avoid wide-row sorts and Cartesian index probing', async () => {
  const source = await read('api/admin/trigger-match.mjs')
  const block = between(source, 'async function fetchAllCachedPairs', 'async function fetchCachedPairsForOuterParticipants')

  assert.match(source, /const MAX_SCOPED_CACHE_PARTICIPANTS = 200/)
  assert.match(block, /scanWholeTable = normalizedParticipantNumbers\.length > MAX_SCOPED_CACHE_PARTICIPANTS/)
  assert.match(block, /\.order\('id', \{ ascending: true \}\)/)
  assert.match(block, /query = query\.gt\('id', cursor\)/)
  assert.match(block, /participantSet\.has\(Number\(row\.participant_a_number\)\)/)
  assert.doesNotMatch(block, /\.range\(/)
  assert.doesNotMatch(block, /\.order\('combined_content_hash'/)
})

test('cache usage writes are bounded, throttled, and restricted to the service role', async () => {
  const [source, sql] = await Promise.all([
    read('api/admin/trigger-match.mjs'),
    read('supabase/migrations/20260829225406_bound_compatibility_cache_usage_writes.sql'),
  ])

  assert.match(source, /const MAX_CACHE_USAGE_TOUCH_IDS = 200/)
  assert.match(source, /ids\.length > MAX_CACHE_USAGE_TOUCH_IDS/)
  assert.match(sql, /from unnest\(coalesce\(p_ids, array\[\]::uuid\[\]\)\)/)
  assert.match(sql, /limit 200/)
  assert.match(sql, /use_count = coalesce\(cache\.use_count, 0\) \+ 1/)
  assert.match(sql, /last_used < now\(\) - interval '6 hours'/)
  assert.match(sql, /drop index if exists public\.idx_cache_usage/)
  assert.match(sql, /security invoker/)
  assert.match(sql, /revoke execute[^;]+from public/)
  assert.match(sql, /revoke execute[^;]+from anon/)
  assert.match(sql, /revoke execute[^;]+from authenticated/)
  assert.match(sql, /grant execute[^;]+to service_role/)
})

test('batched cache keeps cheap scans separate and delta reserves independent local and AI lanes', async () => {
  const [source, modalSource, adminSource] = await Promise.all([
    read('api/admin/trigger-match.mjs'),
    read('app/components/BatchedCacheModal.tsx'),
    read('app/routes/admin.tsx'),
  ])
  const full = between(source, 'if (action === "cache-pairs-batched")', '// CACHE STATUS BY GENDER MODE')
  const delta = between(source, 'if (action === "delta-pre-cache-batched")', 'if (action === "recalc-vibe")')

  assert.match(full, /const effectiveMaxPairsScanned[\s\S]+\|\| 20000[\s\S]+20000/)
  assert.match(full, /let pairsScanned = 0/)
  assert.match(full, /let cacheJobsStarted = 0/)
  assert.match(full, /pairsScanned >= effectiveMaxPairsScanned/)
  assert.match(full, /cacheJobsStarted >= effectiveMaxNewCaches/)
  assert.match(full, /pairs_processed: pairsScanned/)
  assert.match(full, /cache_jobs_started: cacheJobsStarted/)

  assert.match(delta, /const effectivePairWindowSize = Math\.min\(effectiveMaxPairsScanned, 1000\)/)
  assert.match(delta, /fetchCachedRowsForPairs\(cacheCandidatePairs\)/)
  assert.doesNotMatch(delta, /fetchCachedPairsForOuterParticipants/)
  assert.match(delta, /const effectiveMaxAICaches[\s\S]*12[\s\S]*16/)
  assert.match(delta, /const effectiveMaxLocalCaches[\s\S]*160[\s\S]*500/)
  assert.match(delta, /localJobs\.map\(executeJob\)/)
  assert.match(delta, /aiJobs\.slice\(start, start \+ effectiveMaxAICaches\)\.map\(executeJob\)/)
  assert.match(delta, /storeCachedCompatibilities\(completedJobs\.map/)
  assert.match(delta, /local_cache_jobs_started: localCacheJobsStarted/)
  assert.match(delta, /ai_cache_jobs_started: aiCallsMade/)

  for (const scope of [full, delta]) {
    assert.match(scope, /let pairsScanned = 0/)
    assert.match(scope, /let cacheJobsStarted = 0/)
    assert.match(scope, /pairs_processed: pairsScanned/)
    assert.match(scope, /cache_jobs_started: cacheJobsStarted/)
    assert.doesNotMatch(scope, /cacheUsageTouches|touchFullCacheHits|touchPrefetchedCacheRows/)
  }

  assert.match(full, /if \(exactCacheRow\) \{[\s\S]*alreadyCached\+\+[\s\S]*continue[\s\S]*\}/)
  assert.match(delta, /if \(exactCacheMap\.has\([\s\S]*alreadyCached\+\+[\s\S]*continue/)
  assert.match(modalSource, /maxPairsPerRequest: 20000/)
  assert.match(modalSource, /label="Pairs Scanned"/)
  assert.match(adminSource, /action: "delta-pre-cache-batched"[\s\S]*maxAICachesPerRequest: 12[\s\S]*maxLocalCachesPerRequest: 160[\s\S]*maxPairsPerRequest: 20000/)
  assert.match(adminSource, /<span>Scanned <strong/)
})

test('manual stale-cache audit cannot delete immutable compatibility history', async () => {
  const source = await read('api/admin/index.mjs')
  const block = between(source, 'if (action === "invalidate-stale-cache")', 'if (action === "get-participant-bonus-data")')

  assert.doesNotMatch(block, /\.delete\s*\(/)
  assert.match(block, /select\("id", \{ count: "exact", head: true \}\)/)
  assert.match(block, /invalidated_entries:\s*0/)
  assert.match(block, /preserved_history:\s*true/)
})

test('participant and admin current-cache selectors require exact profile hashes and scorer version', async () => {
  const [participantSource, adminSource] = await Promise.all([
    read('api/participant.mjs'),
    read('api/admin/index.mjs'),
  ])
  const participantBlock = between(
    participantSource,
    'async function fetchParticipantBalancedCacheBreakdown',
    'async function findParticipantsByExactPhone',
  )
  const adminBlock = between(
    adminSource,
    'const setPreferredCurrentVibeCacheRow',
    'function buildEvent3ScoreProvenance',
  )

  for (const required of [
    /combined_content_hash/,
    /vibe_content_hash/,
    /score_model_version/,
    /BALANCED_COMPATIBILITY_VERSION/,
    /BALANCED_VIBE_MODEL_TAG/,
  ]) {
    assert.match(participantBlock, required)
  }
  assert.match(adminBlock, /buildBalancedCacheIdentity\(profileA, profileB\)/)
  assert.match(adminBlock, /cacheRow\.vibe_content_hash !== identity\.vibeContentHash/)
  assert.match(adminBlock, /cacheRow\.combined_content_hash !== identity\.combinedContentHash/)
  assert.match(adminBlock, /cacheRow\?\.score_model_version !== BALANCED_COMPATIBILITY_VERSION/)
})

test('historical match payloads expose provenance only when version, hash, and total agree', async () => {
  const [matchSource, participantSource, modelSource] = await Promise.all([
    read('api/get-my-matches.mjs'),
    read('api/participant.mjs'),
    read('server/matching/balanced-compatibility.mjs'),
  ])

  assert.match(matchSource, /isSupportedCurrentScoreSnapshot\(\{/)
  assert.match(modelSource, /snapshot\.scoreModelVersion === modelVersion/)
  assert.match(modelSource, /snapshot\.combinedContentHash === contentHash/)
  assert.match(modelSource, /snapshot\.vibeModel === BALANCED_VIBE_MODEL/)
  assert.match(modelSource, /snapshot\.vibeModelVersion === BALANCED_VIBE_VERSION/)
  assert.match(modelSource, /snapshot\.vibeModelTag === BALANCED_VIBE_MODEL_TAG/)
  assert.match(modelSource, /snapshotTotal === rowTotal/)
  assert.match(modelSource, /isCurrentOppositesScoreSnapshot/)
  assert.match(matchSource, /score_model_version:\s*validSnapshot \? match\.score_model_version : null/)
  assert.match(participantSource, /scoreModelVersion !== rowScoreModelVersion/)
  assert.match(participantSource, /snapshotContentHash !== rowScoreContentHash/)
  assert.match(participantSource, /snapshotTotal !== rowTotal/)
  assert.match(participantSource, /snapshot\.vibeModel !== BALANCED_VIBE_MODEL/)
  assert.match(participantSource, /snapshot\.vibeModelVersion !== BALANCED_VIBE_VERSION/)
  assert.match(participantSource, /snapshot\.vibeModelTag !== BALANCED_VIBE_MODEL_TAG/)
})

test('UI model detection requires exact persisted provenance and Event3 never applies retired maxima', async () => {
  const [modelSource, event3Source] = await Promise.all([
    read('app/lib/compatibility-model.ts'),
    read('app/routes/event3.tsx'),
  ])
  const breakdownBlock = between(event3Source, 'function CompatibilityBreakdown', 'function DemoButton')
  const groupedDimensionsBlock = between(
    modelSource,
    'export function currentBalancedGroupedDimensionsForDisplay',
    'export function currentOppositesDimensionsForDisplay',
  )

  assert.match(modelSource, /snapshot\.combinedContentHash === contentHash/)
  assert.match(modelSource, /snapshot\.vibeModelTag === CURRENT_BALANCED_VIBE_TAG/)
  assert.match(modelSource, /snapshotTotal === storedTotal/)
  assert.doesNotMatch(breakdownBlock, /max:\s*(?:30|25|15)\b/)
  assert.match(breakdownBlock, /currentBalancedGroupedDimensionsForDisplay\(dimensionSource\)/)
  assert.match(event3Source, /breakdown=\{p2\.breakdown\} scoreRow=\{p2\}/)
  assert.match(event3Source, /breakdown=\{p3\.breakdown\} scoreRow=\{p3\}/)
  for (const maximum of [18, 20, 10, 8, 12, 17, 10, 5]) {
    assert.match(groupedDimensionsBlock, new RegExp(`max: ${maximum}\\b`))
  }
  assert.match(breakdownBlock, /نعرض المجموع التاريخي فقط/)
})

test('organizer result views never merge a historical total with a current cache breakdown', async () => {
  const [catalogSource, resultViewSource, pairAnalysisSource] = await Promise.all([
    read('app/lib/matchControl.ts'),
    read('app/components/ParticipantResultsModal.tsx'),
    read('app/components/PairAnalysisModalPro.tsx'),
  ])

  assert.match(catalogSource, /resultHash === calculatedHash/)
  assert.match(catalogSource, /compatibleCalculated = canMergeCalculatedScore \? calculated : \{\}/)
  assert.match(catalogSource, /score_provenance_valid:\s*resultHasValidSnapshot/)
  assert.doesNotMatch(resultViewSource, /\(calculatedPairs\s*\|\|\s*\[\]\)\.find|calculatedPairs\.find/)
  assert.match(resultViewSource, /const pair = getResultPairData\(participant\)/)
  assert.match(pairAnalysisSource, /const isBalanced = isCurrentBalancedScoreRow\(pair\)/)
  assert.match(pairAnalysisSource, /const isOpposites = isCurrentOppositesScoreRow\(pair\)/)
})

test('shared score presentation and swap planning use immutable balanced totals consistently', async () => {
  const [modelSource, controlSource, resultSource, feedbackSource, dualSource] = await Promise.all([
    read('app/lib/compatibility-model.ts'),
    read('app/components/MatchControlCenterModal.tsx'),
    read('app/components/ParticipantResultsModal.tsx'),
    read('app/components/FeedbackPairsModal.tsx'),
    read('app/components/ParticipantDualResultsModal.tsx'),
  ])
  const payloadBlock = between(modelSource, 'function scorePayloadForDisplay', '/**')

  assert.ok(payloadBlock.indexOf('snapshot?.scoreBreakdown') < payloadBlock.indexOf('row?.score_breakdown'))
  assert.ok(payloadBlock.indexOf('snapshot?.questionScores') < payloadBlock.indexOf('row?.question_scores'))
  assert.match(controlSource, /scoreMetric: "total_compatibility"/)
  assert.doesNotMatch(controlSource, /scoreMetric: "compound_lifestyle"/)
  assert.doesNotMatch(controlSource, /const applyPairs|await applyPairs/)
  assert.match(resultSource, /بوابات متجاهلة/)
  assert.match(resultSource, /currentBalancedDimensionsForDisplay/)
  assert.match(feedbackSource, /currentBalancedGroupedDimensionsForDisplay/)
  assert.match(dualSource, /currentBalancedGroupedDimensionsForDisplay/)
})

test('result modal APIs fetch only cache rows for participants in the requested event results', async () => {
  const source = await read('api/admin/index.mjs')
  const cachedResults = between(source, 'if (action === "get-cached-results")', '// SAVE ADMIN RESULTS ACTION')
  const freshResults = between(source, 'if (action === "get-fresh-results")', '// 🔹 CLEAN SLATE')

  for (const block of [cachedResults, freshResults]) {
    assert.match(block, /eventParticipantNumbers/)
    assert.match(block, /fetchAllCachedPairs\("compatibility_cache",/)
    assert.doesNotMatch(block, /from\("compatibility_cache"\)\s*\.select\("\*"\)/)
  }
  assert.match(freshResults, /const matchResultByPair = new Map/)
  assert.doesNotMatch(freshResults, /matchResults\?\.find/)
  assert.doesNotMatch(source, /repairMissingSwapInsightScores/)
})

test('swap-chain API accepts only the exact reviewed participant set and never mutates stats after the transaction', async () => {
  const source = await read('api/admin/index.mjs')
  const block = between(source, 'if (action === "apply-match-swap-plan")', 'if (action === "undo-match-swap-plan")')

  assert.match(block, /const reviewedNumbers = new Set/)
  assert.match(block, /affected\.length !== reviewedNumbers\.size/)
  assert.match(block, /affected\.some\(number => !reviewedNumbers\.has\(number\)\)/)
  assert.match(block, /apply_match_swap_plan_with_score_provenance_v2/)
  assert.doesNotMatch(block, /await repairMissingSwapInsightScores/)

  const undoBlock = between(source, 'if (action === "undo-match-swap-plan")', 'if (action === "get-excluded-pairs")')
  assert.match(undoBlock, /undo_match_swap_plan_v2/)
})
