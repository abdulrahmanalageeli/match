export const CURRENT_BALANCED_SCORE_MODEL = "2026-09-03-v12-event26-archetype-ai-chemistry-100" as const
export const CURRENT_OPPOSITES_SCORE_MODEL = `${CURRENT_BALANCED_SCORE_MODEL}|opposites-flip-v1` as const
export const CURRENT_BALANCED_VIBE_MODEL = "gpt-5.4-mini" as const
export const CURRENT_BALANCED_VIBE_VERSION = "balanced-vibe12-v1" as const
export const CURRENT_BALANCED_VIBE_TAG = `${CURRENT_BALANCED_VIBE_MODEL}|${CURRENT_BALANCED_VIBE_VERSION}` as const
export const AI_CHEMISTRY_HIGH_THRESHOLD = 0.75
export const AI_CHEMISTRY_LOW_THRESHOLD = 0.55
export const AI_CHEMISTRY_BOOST = 12
export const AI_CHEMISTRY_PENALTY = 8
export const BALANCED_SCORE_MAXIMA = {
  synergy: 20,
  vibe: 12,
  lifestyle: 12,
  humor: 10,
  disagreement: 5,
  focus: 4,
  similarity: 2,
  attachment: 8,
  communication: 5,
  core: 17,
  intent: 5,
} as const

export const LEGACY_SCORE_MAXIMA = {
  synergy: 30,
  vibe: 25,
  lifestyle: 10,
  humor: 15,
  disagreement: 4,
  focus: 5,
  similarity: 5,
  attachment: 3,
  communication: 3,
  core: 20,
  intent: 5,
} as const

export type CompatibilityDimension = {
  key: string
  label: string
  shortLabel: string
  value: number | null
  max: number
}

export type PersonalizedDirection = {
  score: number
  rawUtility?: number
  archetype?: { id?: number; key?: string; label?: string; probability?: number }
  archetypeMemberships?: Array<{ id?: number; key?: string; label?: string; probability?: number }>
  questionnaireCoverage?: number
  strongestDrivers?: Array<{ question?: string; contribution?: number }>
}

export type PersonalizedCompatibility = {
  scoreModelVersion: string
  totalScore: number
  calibration?: string
  mutualFormula?: string
  aToB: PersonalizedDirection
  bToA: PersonalizedDirection
}

export type AiChemistryDisplay = {
  ready: boolean
  score: number | null
  adjustment: number
  band: "high" | "neutral" | "low" | "pending"
  baseScore: number
  finalScore: number
}

export const CURRENT_BALANCED_DIMENSION_MAXIMA = {
  semantic: 12,
  interaction: 20,
  disagreement: 5,
  focus: 4,
  similarity: 2,
  attachment: 8,
  lifestyle: 12,
  humor: 10,
  communication: 5,
  values: 17,
  intent: 5,
} as const

const finiteOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const firstFinite = (...values: unknown[]): number | null => {
  for (const value of values) {
    const parsed = finiteOrNull(value)
    if (parsed !== null) return parsed
  }
  return null
}

function scorePayloadForDisplay(row: any) {
  const snapshot = parseScoreObject(row?.score_snapshot ?? row?.scoreSnapshot)
  const parsedBreakdown = parseScoreObject(
    snapshot?.scoreBreakdown
    ?? snapshot?.score_breakdown
    ?? row?.score_breakdown
    ?? row?.scoreBreakdown,
  )
  // Participant result payloads expose the score breakdown directly, while
  // admin/database rows nest it under score_snapshot/score_breakdown.
  const breakdown = parsedBreakdown ?? (
    row && typeof row === "object" && (
      "semanticCommonGround" in row
      || "interactionRhythm" in row
      || "interactionSynergy" in row
    ) ? row : null
  )
  const questions = parseScoreObject(
    snapshot?.questionScores
    ?? snapshot?.question_scores
    ?? row?.question_scores
    ?? row?.questionScores,
  )
  return { snapshot, breakdown, questions }
}

function isPersonalizedPayload(value: any): value is PersonalizedCompatibility {
  if (!value || value.scoreModelVersion !== CURRENT_BALANCED_SCORE_MODEL) return false
  const total = Number(value.totalScore)
  const aToB = Number(value.aToB?.score)
  const bToA = Number(value.bToA?.score)
  return Number.isFinite(total)
    && Number.isFinite(aToB)
    && Number.isFinite(bToA)
    && aToB >= 0 && aToB <= 100
    && bToA >= 0 && bToA <= 100
    && Math.abs(total - Math.round(Math.sqrt(aToB * bToA) * 1e6) / 1e6) <= 1e-6
}

/** Directional, archetype-aware evidence behind the current base percentage. */
export function personalizedCompatibilityForDisplay(row: any): PersonalizedCompatibility | null {
  const { breakdown, snapshot } = scorePayloadForDisplay(row)
  const direct = parseScoreObject(
    breakdown?.personalized
    ?? row?.personalizedCompatibility
    ?? row?.personalized_compatibility
    ?? snapshot?.personalizedCompatibility,
  )
  return isPersonalizedPayload(direct) ? direct : null
}

export function aiChemistryForDisplay(row: any): AiChemistryDisplay | null {
  const { breakdown, snapshot } = scorePayloadForDisplay(row)
  const personalized = personalizedCompatibilityForDisplay(row)
  if (!breakdown || !personalized) return null
  const axes = parseScoreObject(snapshot?.vibeAxes ?? row?.vibeAxes ?? row?.vibe_axes)
  const curiosity = axes?.current_curiosity
  const hobbies = axes?.hobbies
  const hasFallback = [curiosity, hobbies].some(axis => String(axis?.reason || "").trim())
  const confidence = Number(curiosity?.confidence || 0) + Number(hobbies?.confidence || 0)
  const ready = !!curiosity && !!hobbies && !hasFallback && confidence > 0
  const score = ready
    ? Math.round((0.5 * (Math.max(0, Math.min(5, Number(curiosity.score))) / 5)
      + 0.5 * (Math.max(0, Math.min(3, Number(hobbies.score))) / 3)) * 1e6) / 1e6
    : null
  const adjustment = score === null
    ? 0
    : score >= AI_CHEMISTRY_HIGH_THRESHOLD
      ? AI_CHEMISTRY_BOOST
      : score < AI_CHEMISTRY_LOW_THRESHOLD
        ? -AI_CHEMISTRY_PENALTY
        : 0
  const band: AiChemistryDisplay["band"] = score === null
    ? "pending"
    : adjustment > 0
      ? "high"
      : adjustment < 0
        ? "low"
        : "neutral"
  const baseScore = personalized.totalScore
  const finalScore = Math.round(Math.max(0, Math.min(100, baseScore + adjustment)) * 1e6) / 1e6
  const almostEqual = (left: unknown, right: number) => Number.isFinite(Number(left))
    && Math.abs(Number(left) - right) <= 1e-6
  if (!almostEqual(breakdown.personalizedBase, baseScore)
    || !almostEqual(breakdown.aiChemistryAdjustment, adjustment)
    || breakdown.aiChemistryReady !== ready
    || breakdown.aiChemistryBand !== band
    || (score === null ? breakdown.aiChemistryScore !== null : !almostEqual(breakdown.aiChemistryScore, score))
    || !almostEqual(breakdown.finalScore, finalScore)) return null
  return { ready, score, adjustment, band, baseScore, finalScore }
}

/**
 * Returns the authoritative displayed total. For a verified current-model row,
 * the immutable event-time snapshot wins over mutable compatibility aliases.
 */
export function compatibilityTotalForDisplay(row: any, fallback: number | null = null): number | null {
  const { snapshot } = scorePayloadForDisplay(row)
  if (isSupportedCurrentScoreRow(row)) {
    const snapshotted = firstFinite(snapshot?.totalScore, snapshot?.total_score)
    if (snapshotted !== null) return snapshotted
  }
  return firstFinite(
    row?.compatibility_score,
    row?.total_compatibility_score,
    row?.phase2_score,
    row?.phase3_score,
    row?.phase4_score,
    row?.score,
    row?.totalScore,
    fallback,
  )
}

/** Legacy expert diagnostics retained alongside the learned percentage. */
export function currentBalancedDimensionsForDisplay(row: any): CompatibilityDimension[] | null {
  if (!isCurrentBalancedScoreRow(row)) return null
  const { breakdown, questions } = scorePayloadForDisplay(row)
  const communicationItems = ["communication1", "communication2", "communication3", "communication4", "communication5"]
    .map(key => finiteOrNull(questions?.[key]))
  const directCommunication = communicationItems.every(value => value !== null)
    ? communicationItems.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : null
  const disagreement = firstFinite(questions?.disagreement, row?.disagreement_style_score)
  const communicationAggregate = firstFinite(
    breakdown?.communicationDisagreement,
    breakdown?.communication_disagreement,
  )
  const communication = firstFinite(
    directCommunication,
    communicationAggregate !== null && disagreement !== null
      ? Math.max(0, communicationAggregate - disagreement)
      : null,
    row?.communication_compatibility_score,
    row?.communication_score,
  )
  const valuesBoundaries = firstFinite(breakdown?.valuesBoundaries, breakdown?.values_boundaries)
  const language = firstFinite(breakdown?.language)
  const combinedValues = firstFinite(
    breakdown?.valuesBoundariesLanguage,
    breakdown?.values_boundaries_language,
    valuesBoundaries !== null || language !== null
      ? (valuesBoundaries ?? 0) + (language ?? 0)
      : null,
    row?.core_values_compatibility_score,
    row?.core_values_score,
  )

  return [
    { key: "synergy", label: "إيقاع التفاعل", shortLabel: "التفاعل", value: firstFinite(breakdown?.interactionRhythm, breakdown?.interaction_rhythm, row?.synergy_score), max: CURRENT_BALANCED_DIMENSION_MAXIMA.interaction },
    { key: "vibe", label: "التوافق الدلالي", shortLabel: "الدلالي", value: firstFinite(breakdown?.aiSemantic, breakdown?.ai_semantic, questions?.vibe, row?.vibe_compatibility_score, row?.vibe_score), max: CURRENT_BALANCED_DIMENSION_MAXIMA.semantic },
    { key: "disagreement", label: "إدارة الاختلاف", shortLabel: "الاختلاف", value: disagreement, max: CURRENT_BALANCED_DIMENSION_MAXIMA.disagreement },
    { key: "focus", label: "المرحلة الحالية", shortLabel: "المرحلة", value: firstFinite(questions?.currentFocus, questions?.current_focus, row?.current_life_overlap_score), max: CURRENT_BALANCED_DIMENSION_MAXIMA.focus },
    { key: "similarity", label: "تفضيل التشابه", shortLabel: "التشابه", value: firstFinite(questions?.similarityPreference, questions?.similarity_preference, row?.similarity_preference_score), max: CURRENT_BALANCED_DIMENSION_MAXIMA.similarity },
    { key: "attachment", label: "الراحة ووتيرة التقارب", shortLabel: "التقارب", value: firstFinite(breakdown?.attachmentComfort, breakdown?.attachment_comfort, row?.attachment_pace_score, row?.attachment_compatibility_score), max: CURRENT_BALANCED_DIMENSION_MAXIMA.attachment },
    { key: "lifestyle", label: "استدامة نمط الحياة", shortLabel: "نمط الحياة", value: firstFinite(breakdown?.lifestyleSustainability, breakdown?.lifestyle_sustainability, row?.lifestyle_compatibility_score, row?.lifestyle_score), max: CURRENT_BALANCED_DIMENSION_MAXIMA.lifestyle },
    { key: "humor", label: "الدعابة والانفتاح", shortLabel: "الدعابة", value: firstFinite(breakdown?.humorOpenness, breakdown?.humor_openness, row?.humor_open_score, row?.humor_open_compatibility_score), max: CURRENT_BALANCED_DIMENSION_MAXIMA.humor },
    { key: "communication", label: "التواصل", shortLabel: "التواصل", value: communication, max: CURRENT_BALANCED_DIMENSION_MAXIMA.communication },
    { key: "values", label: "القيم والحدود واللغة", shortLabel: "القيم/اللغة", value: combinedValues, max: CURRENT_BALANCED_DIMENSION_MAXIMA.values },
    { key: "intent", label: "هدف اللقاء", shortLabel: "الهدف", value: firstFinite(breakdown?.intent, questions?.intent, row?.intent_score), max: CURRENT_BALANCED_DIMENSION_MAXIMA.intent },
  ]
}

/** Grouped expert diagnostics; these do not add up to the learned final total. */
export function currentBalancedGroupedDimensionsForDisplay(row: any): CompatibilityDimension[] | null {
  if (!isCurrentBalancedScoreRow(row)) return null
  const { breakdown } = scorePayloadForDisplay(row)
  const detailed = currentBalancedDimensionsForDisplay(row) || []
  const value = (key: string) => detailed.find(dimension => dimension.key === key)?.value ?? null
  const sum = (...keys: string[]) => {
    const values = keys.map(value)
    return values.every(item => item !== null)
      ? values.reduce<number>((total, item) => total + (item ?? 0), 0)
      : null
  }
  return [
    { key: "commonGround", label: "الأرضية المشتركة", shortLabel: "الأرضية", value: firstFinite(breakdown?.semanticCommonGround, breakdown?.semantic_common_ground, sum("vibe", "focus", "similarity")), max: 18 },
    { key: "interaction", label: "إيقاع التفاعل", shortLabel: "التفاعل", value: value("synergy"), max: 20 },
    { key: "humor", label: "الدعابة والانفتاح", shortLabel: "الدعابة", value: value("humor"), max: 10 },
    { key: "attachment", label: "الراحة ووتيرة التقارب", shortLabel: "التقارب", value: value("attachment"), max: 8 },
    { key: "lifestyle", label: "استدامة نمط الحياة", shortLabel: "الحياة", value: value("lifestyle"), max: 12 },
    { key: "values", label: "القيم والحدود واللغة", shortLabel: "القيم/اللغة", value: value("values"), max: 17 },
    { key: "communication", label: "التواصل وإدارة الاختلاف", shortLabel: "التواصل/الاختلاف", value: sum("communication", "disagreement"), max: 10 },
    { key: "intent", label: "هدف اللقاء", shortLabel: "الهدف", value: value("intent"), max: 5 },
  ]
}

export function currentOppositesDimensionsForDisplay(row: any): CompatibilityDimension[] | null {
  if (!isCurrentOppositesScoreRow(row)) return null
  const { breakdown } = scorePayloadForDisplay(row)
  return [
    { key: "interactionSynergy", label: "إيقاع التفاعل", shortLabel: "التفاعل", value: firstFinite(breakdown?.interactionSynergy), max: 20 },
    { key: "coreValuesAlignment", label: "توافق القيم", shortLabel: "القيم", value: firstFinite(breakdown?.coreValuesAlignment), max: 17 },
    { key: "communicationAlignment", label: "توافق التواصل", shortLabel: "التواصل", value: firstFinite(breakdown?.communicationAlignment), max: 5 },
    { key: "lifestyleDifference", label: "اختلاف نمط الحياة", shortLabel: "اختلاف الحياة", value: firstFinite(breakdown?.lifestyleDifference), max: 12 },
    { key: "vibeDifference", label: "اختلاف الطاقة", shortLabel: "اختلاف الطاقة", value: firstFinite(breakdown?.vibeDifference), max: 12 },
    { key: "humorDifference", label: "اختلاف الدعابة", shortLabel: "اختلاف الدعابة", value: firstFinite(breakdown?.humorDifference), max: 10 },
  ]
}

export function currentBalancedDimensionValue(row: any, key: string): number | null {
  return currentBalancedDimensionsForDisplay(row)?.find(dimension => dimension.key === key)?.value ?? null
}

export function parseScoreObject(value: unknown): Record<string, any> | null {
  if (value && typeof value === "object") return value as Record<string, any>
  if (typeof value !== "string") return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" ? parsed as Record<string, any> : null
  } catch {
    return null
  }
}

export function scoreModelVersionFor(row: any): string {
  const hasDirectVersion = !!row && (
    Object.prototype.hasOwnProperty.call(row, "score_model_version")
    || Object.prototype.hasOwnProperty.call(row, "scoreModelVersion")
  )
  if (hasDirectVersion) {
    return String(row?.score_model_version ?? row?.scoreModelVersion ?? "")
  }

  const snapshot = parseScoreObject(row?.score_snapshot ?? row?.scoreSnapshot)
  return String(
    snapshot?.scoreModelVersion
    ?? snapshot?.score_model_version
    ?? "",
  )
}

export function isCurrentBalancedScoreRow(row: any): boolean {
  if (row?.score_provenance_valid === false || row?.scoreProvenanceValid === false) return false
  if (scoreModelVersionFor(row) !== CURRENT_BALANCED_SCORE_MODEL) return false

  const hasOwn = (key: string) => !!row && Object.prototype.hasOwnProperty.call(row, key)
  const hasPersistedProvenance = [
    "score_snapshot", "scoreSnapshot", "score_content_hash", "scoreContentHash",
  ].some(hasOwn)
  // Fresh in-memory calculations are versioned before they have a database
  // snapshot. Rows claiming persisted provenance must satisfy the full exact
  // event-time contract; a matching model label alone is not enough.
  if (!hasPersistedProvenance) {
    const chemistry = aiChemistryForDisplay(row)
    const total = firstFinite(row?.totalScore, row?.total_compatibility_score, row?.compatibility_score)
    return chemistry !== null && total !== null && Math.abs(total - chemistry.finalScore) <= 1e-6
  }

  const snapshot = parseScoreObject(row?.score_snapshot ?? row?.scoreSnapshot)
  const contentHash = String(row?.score_content_hash ?? row?.scoreContentHash ?? "")
  const snapshotTotal = Number(snapshot?.totalScore ?? snapshot?.total_score)
  const storedTotalValue = [
    row?.compatibility_score,
    row?.total_compatibility_score,
    row?.phase2_score,
    row?.phase3_score,
    row?.phase4_score,
    row?.score,
    row?.totalScore,
  ].find(value => value !== null && value !== undefined && value !== "")
  const storedTotal = Number(storedTotalValue)
  const isPlainObject = (value: unknown) => value !== null && typeof value === "object" && !Array.isArray(value)
  const scoreBreakdown = parseScoreObject(snapshot?.scoreBreakdown)

  const chemistry = aiChemistryForDisplay(row)
  const finalMatchesPersisted = chemistry !== null && (
    Math.abs(snapshotTotal - chemistry.finalScore) <= 1e-6
    || Math.abs(snapshotTotal - Math.round(chemistry.finalScore * 100) / 100) <= 1e-6
    || Math.abs(snapshotTotal - Math.round(chemistry.finalScore)) <= 1e-6
  )
  return !!snapshot
    && !!contentHash
    && snapshot.scoreModelVersion === CURRENT_BALANCED_SCORE_MODEL
    && snapshot.combinedContentHash === contentHash
    && isPlainObject(scoreBreakdown)
    && isPersonalizedPayload(scoreBreakdown?.personalized)
    && chemistry !== null
    && isPlainObject(snapshot.questionScores)
    && isPlainObject(snapshot.vibeAxes)
    && snapshot.vibeModel === CURRENT_BALANCED_VIBE_MODEL
    && snapshot.vibeModelVersion === CURRENT_BALANCED_VIBE_VERSION
    && snapshot.vibeModelTag === CURRENT_BALANCED_VIBE_TAG
    && Number.isFinite(snapshotTotal)
    && Number.isFinite(storedTotal)
    && snapshotTotal === storedTotal
    && finalMatchesPersisted
}

export function isCurrentOppositesScoreRow(row: any): boolean {
  if (row?.score_provenance_valid === false || row?.scoreProvenanceValid === false) return false
  if (scoreModelVersionFor(row) !== CURRENT_OPPOSITES_SCORE_MODEL) return false
  const snapshot = parseScoreObject(row?.score_snapshot ?? row?.scoreSnapshot)
  const contentHash = String(row?.score_content_hash ?? row?.scoreContentHash ?? "")
  const snapshotTotal = Number(snapshot?.totalScore ?? snapshot?.total_score)
  const storedTotalValue = [
    row?.compatibility_score,
    row?.total_compatibility_score,
    row?.phase2_score,
    row?.phase3_score,
    row?.phase4_score,
    row?.score,
    row?.totalScore,
  ].find(value => value !== null && value !== undefined && value !== "")
  const storedTotal = Number(storedTotalValue)
  const isPlainObject = (value: unknown) => value !== null && typeof value === "object" && !Array.isArray(value)
  const breakdown = parseScoreObject(snapshot?.scoreBreakdown)
  const questionScores = parseScoreObject(snapshot?.questionScores)
  const components = [
    "interactionSynergy",
    "coreValuesAlignment",
    "communicationAlignment",
    "lifestyleDifference",
    "vibeDifference",
    "humorDifference",
  ] as const
  const values = components.map(key => Number(breakdown?.[key]))
  const rawTotal = Number(breakdown?.rawTotal)
  const rawMaximum = Number(breakdown?.rawMaximum)
  const normalizedTotal = Number(breakdown?.normalizedTotal)

  return !!snapshot
    && !!contentHash
    && snapshot.scoreModelVersion === CURRENT_OPPOSITES_SCORE_MODEL
    && snapshot.combinedContentHash === contentHash
    && isPlainObject(breakdown)
    && isPlainObject(questionScores)
    && isPlainObject(snapshot.vibeAxes)
    && isPlainObject(snapshot.sourceScoreBreakdown)
    && isPlainObject(snapshot.sourceQuestionScores)
    && snapshot.vibeModel === CURRENT_BALANCED_VIBE_MODEL
    && snapshot.vibeModelVersion === CURRENT_BALANCED_VIBE_VERSION
    && snapshot.vibeModelTag === CURRENT_BALANCED_VIBE_TAG
    && snapshot.transformation === "opposites-flipped-v1"
    && snapshot.sourceScoreModelVersion === CURRENT_BALANCED_SCORE_MODEL
    && values.every(Number.isFinite)
    && components.every((key, index) => Number(questionScores?.[key]) === values[index])
    && Number.isFinite(rawTotal)
    && rawMaximum === 76
    && Math.abs(values.reduce((sum, value) => sum + value, 0) - rawTotal) < 1e-6
    && Number.isFinite(snapshotTotal)
    && Number.isFinite(storedTotal)
    && snapshotTotal === storedTotal
    && normalizedTotal === storedTotal
    && Math.round((rawTotal / rawMaximum) * 100) === normalizedTotal
}

export function isSupportedCurrentScoreRow(row: any): boolean {
  return isCurrentBalancedScoreRow(row) || isCurrentOppositesScoreRow(row)
}
