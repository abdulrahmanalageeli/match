export const CURRENT_BALANCED_SCORE_MODEL = "2026-08-25-v7-balanced-100" as const
export const CURRENT_OPPOSITES_SCORE_MODEL = `${CURRENT_BALANCED_SCORE_MODEL}|opposites-flip-v1` as const
export const CURRENT_BALANCED_VIBE_MODEL = "gpt-5.4-mini" as const
export const CURRENT_BALANCED_VIBE_VERSION = "balanced-vibe12-v1" as const
export const CURRENT_BALANCED_VIBE_TAG = `${CURRENT_BALANCED_VIBE_MODEL}|${CURRENT_BALANCED_VIBE_VERSION}` as const

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
  if (!hasPersistedProvenance) return true

  const snapshot = parseScoreObject(row?.score_snapshot ?? row?.scoreSnapshot)
  const contentHash = String(row?.score_content_hash ?? row?.scoreContentHash ?? "")
  const snapshotTotal = Number(snapshot?.totalScore ?? snapshot?.total_score)
  const storedTotalValue = [
    row?.compatibility_score,
    row?.phase2_score,
    row?.phase3_score,
    row?.score,
    row?.totalScore,
  ].find(value => value !== null && value !== undefined && value !== "")
  const storedTotal = Number(storedTotalValue)
  const isPlainObject = (value: unknown) => value !== null && typeof value === "object" && !Array.isArray(value)

  return !!snapshot
    && !!contentHash
    && snapshot.scoreModelVersion === CURRENT_BALANCED_SCORE_MODEL
    && snapshot.combinedContentHash === contentHash
    && isPlainObject(snapshot.scoreBreakdown)
    && isPlainObject(snapshot.questionScores)
    && isPlainObject(snapshot.vibeAxes)
    && snapshot.vibeModel === CURRENT_BALANCED_VIBE_MODEL
    && snapshot.vibeModelVersion === CURRENT_BALANCED_VIBE_VERSION
    && snapshot.vibeModelTag === CURRENT_BALANCED_VIBE_TAG
    && Number.isFinite(snapshotTotal)
    && Number.isFinite(storedTotal)
    && snapshotTotal === storedTotal
}

export function isCurrentOppositesScoreRow(row: any): boolean {
  if (row?.score_provenance_valid === false || row?.scoreProvenanceValid === false) return false
  if (scoreModelVersionFor(row) !== CURRENT_OPPOSITES_SCORE_MODEL) return false
  const snapshot = parseScoreObject(row?.score_snapshot ?? row?.scoreSnapshot)
  const contentHash = String(row?.score_content_hash ?? row?.scoreContentHash ?? "")
  const snapshotTotal = Number(snapshot?.totalScore ?? snapshot?.total_score)
  const storedTotalValue = [
    row?.compatibility_score,
    row?.phase2_score,
    row?.phase3_score,
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
