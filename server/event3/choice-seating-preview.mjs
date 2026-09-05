import { createHash, createHmac, timingSafeEqual } from "node:crypto"

import { CHOICE_ONLY_SEATING_OBJECTIVE_VERSION } from "./choice-only-seating.mjs"
import { FLEXIBLE_CHOICE_SEATING_LIMITS } from "./flexible-choice-seating.mjs"
import { normalizedGender } from "./round2-age-optimizer.mjs"
import { getRoundLensProfileMissingFields } from "./round23-lenses.mjs"

const EVENT3_MATCH_ID = "00000000-0000-0000-0000-000000000003"
const STATIC_MATCH_ID = "00000000-0000-0000-0000-000000000000"
const EVENT_FORMAT = "choice_only_three_groups"
const PURPOSE = "event3-choice-seating-preview-v1"
const REPORT_SCHEMA_VERSION = "event3-choice-seating-report-v1"
const PREVIEW_TTL_MS = 15 * 60 * 1000
const MAX_TOKEN_LENGTH = 500_000

const fail = (message, status = 409, details = {}) => Object.assign(new Error(message), { status, ...details })
const pairKey = (left, right) => `${Math.min(Number(left), Number(right))}-${Math.max(Number(left), Number(right))}`
const rounded = value => Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : null

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]))
}

function parseSurveyData(value) {
  if (!value) return {}
  if (typeof value === "object") return value
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function canonicalAssignments(rows) {
  return (rows || []).map(row => ({
    round: Number(row.round),
    table_number: Number(row.table_number),
    participant_id: Number(row.participant_id),
  })).sort((left, right) => left.round - right.round
    || left.table_number - right.table_number
    || left.participant_id - right.participant_id)
}

function assignmentsForPlan(plan, expectedParticipantNumbers) {
  const assignments = []
  const expected = [...new Set((expectedParticipantNumbers || plan?.round1?.flat() || []).map(Number))]
  const expectedSet = new Set(expected)
  if (expected.length < FLEXIBLE_CHOICE_SEATING_LIMITS.minimumParticipants
    || expected.length > FLEXIBLE_CHOICE_SEATING_LIMITS.maximumParticipants) {
    throw fail("A seating candidate contained an unsupported participant count", 500)
  }
  for (const [roundIndex, groups] of [plan?.round1, plan?.round2, plan?.round3].entries()) {
    if (!Array.isArray(groups) || groups.length < 2
      || groups.some(group => !Array.isArray(group) || group.length < 1 || group.length > FLEXIBLE_CHOICE_SEATING_LIMITS.maximumGroupSize)) {
      throw fail("A seating candidate contained an invalid table layout", 500)
    }
    for (const [tableIndex, group] of groups.entries()) {
      for (const participantId of group) assignments.push({
        round: roundIndex + 1,
        table_number: tableIndex + 1,
        participant_id: Number(participantId),
      })
    }
  }
  const canonical = canonicalAssignments(assignments)
  if (canonical.length !== expected.length * 3) throw fail("A seating candidate omitted participants", 500)
  for (const round of [1, 2, 3]) {
    const seats = canonical.filter(row => row.round === round)
    const numbers = new Set(seats.map(row => row.participant_id))
    if (seats.length !== expected.length || numbers.size !== expected.length
      || [...numbers].some(number => !expectedSet.has(number))) {
      throw fail("A seating candidate repeated or omitted a participant", 500)
    }
  }
  return canonical
}

function groupsForAssignments(assignments) {
  const groups = new Map()
  for (const row of assignments) {
    const key = `${row.round}:${row.table_number}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row.participant_id)
  }
  return groups
}

function genderTargets(participantNumbers, genderMap, tableCount) {
  const counts = { female: 0, male: 0, unknown: 0 }
  for (const number of participantNumbers) counts[normalizedGender(genderMap.get(number))]++
  return Object.fromEntries(Object.entries(counts).map(([category, total]) => [category, {
    total,
    minimum_per_table: Math.floor(total / tableCount),
    maximum_per_table: Math.ceil(total / tableCount),
  }]))
}

function tableGender(group, genderMap, targets) {
  const counts = { female: 0, male: 0, unknown: 0 }
  for (const number of group) counts[normalizedGender(genderMap.get(number))]++
  const withinRosterTargets = ["female", "male", "unknown"].every(category =>
    counts[category] >= targets[category].minimum_per_table
      && counts[category] <= targets[category].maximum_per_table)
  return {
    ...counts,
    within_roster_targets: withinRosterTargets,
    complete: counts.unknown === 0,
    balanced: counts.unknown === 0 && withinRosterTargets,
  }
}

function protectedViolations(group, protectedPairs, round, tableNumber) {
  const members = new Set(group)
  return protectedPairs.filter(([left, right]) => members.has(left) && members.has(right)).map(([left, right]) => ({
    round,
    table_number: tableNumber,
    participant_a: Math.min(left, right),
    participant_b: Math.max(left, right),
  }))
}

function warningKeys(metrics = {}) {
  const checks = [
    ["lockedPairs", "protected_pair"],
    ["depthMismatch", "depth_mismatch"],
    ["initiatorMissing", "missing_initiator"],
    ["ageRangeViolation", "wide_age_range"],
    ["humorClash", "humor_clash"],
    ["depthCoverageIncomplete", "incomplete_depth_coverage"],
    ["roleCoverageIncomplete", "incomplete_role_coverage"],
    ["curiosityCoverageIncomplete", "incomplete_curiosity_coverage"],
    ["curiosityMixMissing", "missing_curiosity_mix"],
    ["roleTrioMissing", "missing_role_trio"],
    ["curiosityFlowMissing", "missing_curiosity_flow"],
  ]
  return checks.filter(([key]) => Number(metrics[key]) > 0 || metrics[key] === true).map(([, warning]) => warning)
}

function serializableMetrics(metrics = {}) {
  return Object.fromEntries(Object.entries(metrics)
    .filter(([key, value]) => key !== "groupScores" && ["boolean", "number", "string"].includes(typeof value))
    .map(([key, value]) => [key, typeof value === "number" ? rounded(value) : value]))
}

function uniquePartnerMetrics(assignments, participantNumbers) {
  const partners = new Map(participantNumbers.map(number => [number, new Set()]))
  for (const group of groupsForAssignments(assignments).values()) {
    for (const left of group) for (const right of group) if (left !== right) partners.get(left)?.add(right)
  }
  const byParticipant = [...partners].map(([participantNumber, values]) => ({
    participant_number: participantNumber,
    count: values.size,
  })).sort((left, right) => left.participant_number - right.participant_number)
  const counts = byParticipant.map(row => row.count)
  const distribution = {}
  for (const count of counts) distribution[count] = (distribution[count] || 0) + 1
  return {
    minimum: Math.min(...counts),
    maximum: Math.max(...counts),
    average: rounded(counts.reduce((sum, count) => sum + count, 0) / counts.length),
    distribution,
    by_participant: byParticipant,
  }
}

function roundReport({ round, lens, groups, groupScores, genderMap, genderTargetRanges, protectedPairs }) {
  const normalizedScores = groups.map((group, tableIndex) => {
    const metrics = groupScores?.[tableIndex] || {}
    const score = lens === "rhythm" ? metrics.qualityScore ?? metrics.score : metrics.score
    const violations = protectedViolations(group, protectedPairs, round, tableIndex + 1)
    const warnings = [...new Set([
      ...warningKeys(metrics),
      ...(violations.length ? ["protected_pair"] : []),
    ])]
    return {
      table_number: tableIndex + 1,
      participant_numbers: [...group],
      score: rounded(score),
      gender: tableGender(group, genderMap, genderTargetRanges),
      protected_pair_violations: violations.map(({ participant_a, participant_b }) => ({ participant_a, participant_b })),
      warnings,
      metrics: serializableMetrics(metrics),
    }
  })
  const finiteScores = normalizedScores.map(table => table.score).filter(Number.isFinite)
  const minimum = finiteScores.length ? Math.min(...finiteScores) : null
  for (const table of normalizedScores) table.weakest = minimum !== null && table.score === minimum
  return {
    round,
    lens,
    score: finiteScores.length ? rounded(finiteScores.reduce((sum, score) => sum + score, 0) / finiteScores.length) : null,
    tables: normalizedScores,
  }
}

export function buildChoiceSeatingReport({ candidate, genderMap, protectedPairs, participantNumbers, missingSurveyFields = [], generatedAt = new Date().toISOString() }) {
  const plan = candidate.plan
  const assignments = assignmentsForPlan(plan, participantNumbers)
  const genderTargetRanges = genderTargets(participantNumbers, genderMap, plan.round1.length)
  const rounds = [
    roundReport({ round: 1, lens: "spark", groups: plan.round1, groupScores: plan.round1Spark?.after?.groupScores, genderMap, genderTargetRanges, protectedPairs }),
    roundReport({ round: 2, lens: "depth", groups: plan.round2, groupScores: plan.round2Depth?.groupScores, genderMap, genderTargetRanges, protectedPairs }),
    roundReport({ round: 3, lens: "rhythm", groups: plan.round3, groupScores: plan.round3Rhythm?.groupScores, genderMap, genderTargetRanges, protectedPairs }),
  ]
  const allTables = rounds.flatMap(round => round.tables.map(table => ({ round: round.round, ...table })))
  const violations = allTables.flatMap(table => table.protected_pair_violations.map(pair => ({
    round: table.round,
    table_number: table.table_number,
    ...pair,
  })))
  const repeatMetrics = plan.round3Rhythm?.repeatMetrics || {}
  const lensScores = Object.fromEntries(rounds.map(round => [round.lens, round.score]))
  const finiteLensScores = Object.values(lensScores).filter(Number.isFinite)
  const weakestTables = rounds.flatMap(round => round.tables.filter(table => table.weakest).map(table => ({
    round: round.round,
    lens: round.lens,
    table_number: table.table_number,
    score: table.score,
    warnings: table.warnings,
  })))
  const rank = Number(candidate.rank)
  const labels = ["Best", "Second best", "Third best"]
  return {
    schema_version: REPORT_SCHEMA_VERSION,
    generated_at: generatedAt,
    candidate: {
      id: String(candidate.id),
      rank,
      label: labels[rank - 1] || `Option ${rank}`,
      objective: candidate.canonicalObjective || null,
      diversity: candidate.diversity || null,
    },
    summary: {
      participant_count: participantNumbers.length,
      assignment_count: assignments.length,
      overall_score: finiteLensScores.length ? rounded(finiteLensScores.reduce((sum, score) => sum + score, 0) / finiteLensScores.length) : null,
      lens_scores: lensScores,
      weakest_tables: weakestTables,
      all_gender_balanced: allTables.every(table => table.gender.balanced),
      protected_pair_violations: violations.length,
      missing_survey_field_count: missingSurveyFields.length,
    },
    rounds,
    repeats: {
      round1_round2: Number(repeatMetrics.round1Round2 || 0),
      round1_round3: Number(repeatMetrics.round1Round3 || 0),
      round2_round3: Number(repeatMetrics.round2Round3 || 0),
      total_repeated_pair_occurrences: Number(repeatMetrics.totalRepeatedPairOccurrences || 0),
      repeated_in_all_three: Number(repeatMetrics.repeatedInAllThree || 0),
      maximum_participant_repeat_burden: Number(repeatMetrics.maximumParticipantRepeatBurden || 0),
      unique_partners: uniquePartnerMetrics(assignments, participantNumbers),
    },
    gender_balance: {
      all_tables_balanced: allTables.every(table => table.gender.balanced),
      roster_targets: genderTargetRanges,
      tables: allTables.map(table => ({ round: table.round, table_number: table.table_number, ...table.gender })),
    },
    protected_pairs: {
      total_violations: violations.length,
      violations,
    },
    missing_survey_fields: missingSurveyFields,
  }
}

export function signChoiceSeatingPreview(payload, secret, now = Date.now()) {
  if (!secret) throw fail("Choice seating previews are unavailable because the server session secret is missing", 503)
  const encoded = Buffer.from(JSON.stringify({ ...payload, purpose: PURPOSE, expires_at: now + PREVIEW_TTL_MS })).toString("base64url")
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url")
  return `${encoded}.${signature}`
}

export function readChoiceSeatingPreview(token, secret, now = Date.now()) {
  try {
    if (!secret || typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) throw new Error()
    const [encoded, signature, extra] = token.split(".")
    if (!encoded || !signature || extra) throw new Error()
    const expected = createHmac("sha256", secret).update(encoded).digest()
    const actual = Buffer.from(signature, "base64url")
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error()
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString())
    if (payload.purpose !== PURPOSE || !Number.isFinite(payload.expires_at) || payload.expires_at <= now) throw new Error()
    return payload
  } catch {
    throw fail("This seating preview expired or changed; generate three new options")
  }
}

async function checked(query, message = "Failed to load choice seating context") {
  const { data, error } = await query
  if (error) throw fail(message, 503, { cause: error })
  return data
}

async function loadChoiceContext(db, eventId) {
  const [state, roster, currentAssignments, locks, exclusions] = await Promise.all([
    checked(db.from("event_state")
      .select("current_event_id,phase,global_timer_active,groups_locked,test_mode_active,test_mode_snapshot")
      .eq("match_id", EVENT3_MATCH_ID).single()),
    checked(db.from("event3_participants").select("participant_number,position")
      .eq("match_id", EVENT3_MATCH_ID).eq("event_id", eventId).order("position")),
    checked(db.from("session_assignments").select("round,table_number,participant_id")
      .eq("match_id", EVENT3_MATCH_ID).eq("event_id", eventId).in("round", [1, 2, 3])),
    checked(db.from("locked_matches").select("participant1_number,participant2_number")
      .eq("match_id", STATIC_MATCH_ID).eq("event_id", eventId)),
    checked(db.from("event3_exclusions").select("participant_a_number,participant_b_number")
      .eq("match_id", EVENT3_MATCH_ID).eq("event_id", eventId)),
  ])
  if (!state || Number(state.current_event_id) !== Number(eventId)) throw fail("The active Event3 event changed; refresh the page")
  if (state.phase !== "setup" || state.global_timer_active === true || state.groups_locked === true) {
    throw fail("Choice seating can only be previewed or approved during setup")
  }
  if (!Array.isArray(roster)
    || roster.length < FLEXIBLE_CHOICE_SEATING_LIMITS.minimumParticipants
    || roster.length > FLEXIBLE_CHOICE_SEATING_LIMITS.maximumParticipants
    || roster.length % 2 !== 0) {
    throw fail(`The three-round format requires an even roster of ${FLEXIBLE_CHOICE_SEATING_LIMITS.minimumParticipants} to ${FLEXIBLE_CHOICE_SEATING_LIMITS.maximumParticipants} selected participants`, 400)
  }
  const participantNumbers = roster.map(row => Number(row.participant_number))
  if (participantNumbers.some(number => !Number.isInteger(number) || number <= 0) || new Set(participantNumbers).size !== participantNumbers.length) {
    throw fail("The selected Event3 roster is invalid", 400)
  }
  const profiles = await checked(db.from("participants").select("*")
    .eq("match_id", STATIC_MATCH_ID).in("assigned_number", participantNumbers).order("assigned_number"))
  if (!Array.isArray(profiles) || profiles.length !== participantNumbers.length) throw fail("Participant profiles are incomplete", 400)
  const profileMap = new Map(profiles.map(profile => [Number(profile.assigned_number), {
    ...profile,
    survey_data: parseSurveyData(profile.survey_data),
  }]))
  if (profileMap.size !== participantNumbers.length || participantNumbers.some(number => !profileMap.has(number))) throw fail("Participant profiles are incomplete", 400)
  const profileVersions = participantNumbers.map(participantNumber => {
    const profile = profileMap.get(participantNumber)
    return {
      participant_number: participantNumber,
      updated_at: profile.updated_at || null,
      survey_data_updated_at: profile.survey_data_updated_at || null,
      gender: profile.gender == null ? null : String(profile.gender),
      age: profile.age == null ? null : String(profile.age),
    }
  })
  const missingSurveyFields = participantNumbers.map(participantNumber => ({
    participant_number: participantNumber,
    fields: getRoundLensProfileMissingFields(profileMap.get(participantNumber)),
  })).filter(row => row.fields.length)
  const genderMap = new Map(participantNumbers.map(number => {
    const profile = profileMap.get(number)
    const survey = profile.survey_data || {}
    return [number, profile.gender || survey?.answers?.gender || survey?.gender || "unknown"]
  }))
  const ageMap = new Map(participantNumbers.map(number => {
    const profile = profileMap.get(number)
    const survey = profile.survey_data || {}
    return [number, profile.age || survey?.answers?.age || survey?.age || null]
  }))
  const protectedPairs = [...new Map([
    ...(locks || []).map(row => [pairKey(row.participant1_number, row.participant2_number), [Number(row.participant1_number), Number(row.participant2_number)]]),
    ...(exclusions || []).map(row => [pairKey(row.participant_a_number, row.participant_b_number), [Number(row.participant_a_number), Number(row.participant_b_number)]]),
  ]).values()].filter(([left, right]) => participantNumbers.includes(left) && participantNumbers.includes(right))
    .map(([left, right]) => [Math.min(left, right), Math.max(left, right)])
    .sort((left, right) => left[0] - right[0] || left[1] - right[1])
  const testMode = state.test_mode_active === true
  const expectedStartedAt = testMode ? state.test_mode_snapshot?.started_at || null : null
  const sessionKey = testMode ? expectedStartedAt || "legacy-test" : "live"
  const latestReport = await checked(db.from("event3_choice_seating_reports").select("id")
    .eq("match_id", EVENT3_MATCH_ID).eq("event_id", eventId).eq("is_test_mode", testMode)
    .eq("session_key", sessionKey).order("id", { ascending: false }).limit(1).maybeSingle(),
  "The seating preview revision is unavailable until its database migration is installed")
  const expectedReportId = latestReport?.id == null ? null : String(latestReport.id)
  const canonicalCurrentAssignments = canonicalAssignments(currentAssignments)
  const fingerprint = stableValue({
    event_id: Number(eventId),
    event_format: EVENT_FORMAT,
    objective_version: CHOICE_ONLY_SEATING_OBJECTIVE_VERSION,
    test_mode: testMode,
    session_key: sessionKey,
    roster: roster.map(row => [Number(row.participant_number), Number(row.position)]),
    profiles: participantNumbers.map(number => profileMap.get(number)),
    protected_pairs: protectedPairs,
    current_assignments: canonicalCurrentAssignments,
    latest_report_id: expectedReportId,
  })
  const contextHash = createHash("sha256").update(JSON.stringify(fingerprint)).digest("hex")
  return {
    state,
    roster: roster.map(row => ({ participant_number: Number(row.participant_number), position: Number(row.position) })),
    participantNumbers,
    profiles,
    profileMap,
    profileVersions,
    genderMap,
    ageMap,
    protectedPairs,
    lockedPairsSet: new Set(protectedPairs.map(([left, right]) => pairKey(left, right))),
    missingSurveyFields,
    testMode,
    expectedStartedAt,
    sessionKey,
    contextHash,
    currentAssignments: canonicalCurrentAssignments,
    expectedReportId,
  }
}

function validateExpectedRequest(body, eventId) {
  if (body?.preview_event_id != null || Number(body?.expected_event_id) !== Number(eventId)) {
    throw fail("Choice seating previews are only available for the active event; refresh the page")
  }
  if (typeof body?.expected_test_mode !== "boolean") throw fail("expected_test_mode must be provided", 400)
}

async function withCurrentSeatingStatus(db, row, eventId) {
  const currentAssignments = canonicalAssignments(await checked(db.from("session_assignments")
    .select("round,table_number,participant_id")
    .eq("match_id", EVENT3_MATCH_ID).eq("event_id", eventId).in("round", [1, 2, 3])))
  const storedAssignments = canonicalAssignments(row?.assignments || [])
  const matchesCurrentSeating = Boolean(row)
    && storedAssignments.length >= FLEXIBLE_CHOICE_SEATING_LIMITS.minimumParticipants * 3
    && currentAssignments.length === storedAssignments.length
    && JSON.stringify(storedAssignments) === JSON.stringify(currentAssignments)
  return {
    report: row ? {
      ...row,
      matches_current_seating: matchesCurrentSeating,
      current_assignment_count: currentAssignments.length,
    } : null,
    matches_current_seating: matchesCurrentSeating,
    current_assignment_count: currentAssignments.length,
  }
}

async function loadAppliedReport(db, body, eventId) {
  const historicalEventId = body?.preview_event_id == null ? null : Number(body.preview_event_id)
  if (historicalEventId !== null) {
    if (!Number.isInteger(historicalEventId) || historicalEventId <= 0
      || historicalEventId !== Number(eventId)
      || Number(body?.expected_event_id) !== historicalEventId) {
      throw fail("The historical seating report event changed; refresh the page")
    }
    if (body.expected_test_mode !== false) throw fail("Historical seating reports only expose the saved live-event decision")
    const row = await checked(db.from("event3_choice_seating_reports")
      .select("id,candidate_id,candidate_rank,generator_version,context_hash,report,assignments,created_at")
      .eq("match_id", EVENT3_MATCH_ID).eq("event_id", historicalEventId).eq("is_test_mode", false)
      .eq("session_key", "live").order("created_at", { ascending: false })
      .order("id", { ascending: false }).limit(1).maybeSingle(),
    "The applied seating report is unavailable until its database migration is installed")
    return withCurrentSeatingStatus(db, row, historicalEventId)
  }
  validateExpectedRequest(body, eventId)
  const state = await checked(db.from("event_state")
    .select("current_event_id,test_mode_active,test_mode_snapshot")
    .eq("match_id", EVENT3_MATCH_ID).single())
  const testMode = state?.test_mode_active === true
  if (!state || Number(state.current_event_id) !== Number(eventId) || body.expected_test_mode !== testMode) {
    throw fail("The Event3 live/test context changed; refresh the page")
  }
  const sessionKey = testMode ? state.test_mode_snapshot?.started_at || "legacy-test" : "live"
  const row = await checked(db.from("event3_choice_seating_reports")
    .select("id,candidate_id,candidate_rank,generator_version,context_hash,report,assignments,created_at")
    .eq("match_id", EVENT3_MATCH_ID).eq("event_id", eventId).eq("is_test_mode", testMode)
    .eq("session_key", sessionKey).order("created_at", { ascending: false })
    .order("id", { ascending: false }).limit(1).maybeSingle(),
  "The applied seating report is unavailable until its database migration is installed")
  return withCurrentSeatingStatus(db, row, eventId)
}

export async function handleChoiceSeatingPreview({ db, action, body = {}, eventId, secret, buildCandidates }) {
  if (action === "e3-get-choice-seating-report") return loadAppliedReport(db, body, eventId)
  validateExpectedRequest(body, eventId)
  const applying = action === "e3-apply-choice-seating-preview"
  const preview = applying ? readChoiceSeatingPreview(body.token, secret) : null
  const context = await loadChoiceContext(db, eventId)
  if (body.expected_test_mode !== context.testMode) throw fail("The Event3 live/test context changed; refresh the page")

  if (applying) {
    if (preview.event_id !== Number(eventId)
      || preview.test_mode !== context.testMode
      || preview.session_key !== context.sessionKey
      || (preview.expected_started_at ?? null) !== context.expectedStartedAt
      || preview.context_hash !== context.contextHash) {
      throw fail("The roster, surveys, protected pairs, or seating changed since this preview; generate three new options")
    }
    const { data, error } = await db.rpc("apply_event3_choice_seating_preview", {
      p_match_id: EVENT3_MATCH_ID,
      p_static_match_id: STATIC_MATCH_ID,
      p_event_id: Number(eventId),
      p_expected_test_mode: context.testMode,
      p_expected_started_at: preview.expected_started_at,
      p_participants: preview.participants,
      p_expected_roster: preview.expected_roster,
      p_profile_versions: preview.profile_versions,
      p_expected_protected_pairs: preview.expected_protected_pairs,
      p_expected_assignments: preview.expected_assignments,
      p_expected_report_id: preview.expected_report_id,
      p_assignments: preview.assignments,
      p_context_hash: preview.context_hash,
      p_candidate_id: preview.candidate_id,
      p_candidate_rank: preview.candidate_rank,
      p_generator_version: preview.generator_version,
      p_report: preview.report,
    })
    if (error) {
      const migrationRequired = error.code === "PGRST202" || String(error.message || "").includes("apply_event3_choice_seating_preview")
      const conflict = ["55000", "22023", "P0001"].includes(error.code)
      throw fail(error.message || "The seating option could not be applied", migrationRequired ? 501 : conflict ? 409 : 500, { migration_required: migrationRequired })
    }
    return {
      ...(data || {}),
      success: true,
      candidate_rank: Number(preview.candidate_rank),
      report: preview.report,
      message: `Applied seating option ${preview.candidate_rank} and saved its audit report`,
    }
  }

  if (action !== "e3-preview-choice-seating") throw fail("Unknown choice seating preview action", 400)
  if (typeof buildCandidates !== "function") throw fail("Choice seating candidate generation is unavailable", 503)
  const incompleteProfiles = new Set(context.missingSurveyFields.map(row => Number(row.participant_number)))
  const lensProfileMap = new Map([...context.profileMap].filter(([participantNumber]) => !incompleteProfiles.has(participantNumber)))
  const generated = buildCandidates(context.participantNumbers, {
    genderMap: context.genderMap,
    ageMap: context.ageMap,
    profileMap: lensProfileMap,
    lockedPairsSet: context.lockedPairsSet,
    requireCompleteLensProfiles: false,
  })
  if (generated?.error) throw fail(generated.error, 400)
  if (![CHOICE_ONLY_SEATING_OBJECTIVE_VERSION, "spark-depth-rhythm-v1-flexible"].includes(generated?.objectiveVersion)) {
    throw fail("The seating scheduler objective version does not match the preview service", 503)
  }
  if (!Array.isArray(generated?.candidates) || generated.candidates.length !== 3) {
    throw fail("The scheduler did not produce three complete seating options", 500)
  }
  const generatedAt = new Date().toISOString()
  const preparedCandidates = generated.candidates.map(candidate => {
    const assignments = assignmentsForPlan(candidate.plan, context.participantNumbers)
    const positionMap = candidate.plan?.positionMap || {}
    const participants = context.participantNumbers.map((number, fallbackPosition) => ({
      participant_number: number,
      position: Number.isInteger(Number(positionMap[number])) ? Number(positionMap[number]) : fallbackPosition,
    }))
    const report = buildChoiceSeatingReport({
      candidate,
      genderMap: context.genderMap,
      protectedPairs: context.protectedPairs,
      participantNumbers: context.participantNumbers,
      missingSurveyFields: context.missingSurveyFields,
      generatedAt,
    })
    return { candidate, assignments, participants, report }
  })
  const alternativesSummary = preparedCandidates.map(({ candidate, report }) => ({
    candidate_id: String(candidate.id),
    rank: Number(candidate.rank),
    label: report.candidate.label,
    objective: candidate.canonicalObjective || null,
    diversity: candidate.diversity || null,
    overall_score: report.summary.overall_score,
    lens_scores: report.summary.lens_scores,
    weakest_tables: report.summary.weakest_tables,
    protected_pair_violations: report.protected_pairs.total_violations,
    all_gender_balanced: report.gender_balance.all_tables_balanced,
    repeats: {
      round1_round2: report.repeats.round1_round2,
      round1_round3: report.repeats.round1_round3,
      round2_round3: report.repeats.round2_round3,
      repeated_in_all_three: report.repeats.repeated_in_all_three,
      maximum_participant_repeat_burden: report.repeats.maximum_participant_repeat_burden,
      unique_partner_minimum: report.repeats.unique_partners.minimum,
      unique_partner_maximum: report.repeats.unique_partners.maximum,
    },
  }))
  const candidates = preparedCandidates.map(({ candidate, assignments, participants, report: baseReport }) => {
    const report = {
      ...baseReport,
      decision_context: {
        objective_version: String(generated.objectiveVersion),
        diversity_policy: generated.diversityPolicy || null,
        selected: { candidate_id: String(candidate.id), rank: Number(candidate.rank) },
        alternatives_summary: alternativesSummary,
      },
    }
    const token = signChoiceSeatingPreview({
      event_id: Number(eventId),
      test_mode: context.testMode,
      session_key: context.sessionKey,
      expected_started_at: context.expectedStartedAt,
      context_hash: context.contextHash,
      candidate_id: String(candidate.id),
      candidate_rank: Number(candidate.rank),
      generator_version: String(generated.objectiveVersion || candidate.canonicalObjective?.version || "unknown"),
      participants,
      expected_roster: context.roster.map(row => ({ ...row })),
      profile_versions: context.profileVersions,
      expected_protected_pairs: context.protectedPairs.map(([participantA, participantB]) => ({
        participant_a: participantA,
        participant_b: participantB,
      })),
      expected_assignments: context.currentAssignments,
      expected_report_id: context.expectedReportId,
      assignments,
      report,
    }, secret)
    return {
      candidate_id: String(candidate.id),
      rank: Number(candidate.rank),
      label: report.candidate.label,
      token,
      round1: candidate.plan.round1,
      round2: candidate.plan.round2,
      round3: candidate.plan.round3,
      report,
    }
  })
  return {
    event_format: EVENT_FORMAT,
    expires_at: Date.now() + PREVIEW_TTL_MS,
    objective_version: String(generated.objectiveVersion || "unknown"),
    diversity_policy: generated.diversityPolicy || null,
    missing_survey_fields: context.missingSurveyFields,
    candidates,
  }
}

export const choiceSeatingPreviewInternals = Object.freeze({
  canonicalAssignments,
  assignmentsForPlan,
  loadChoiceContext,
  REPORT_SCHEMA_VERSION,
  PREVIEW_TTL_MS,
})
