export const HISTORY_CONFIDENCE_MIN_EVENT_ID = 21
export const HISTORY_CONFIDENCE_MODEL_VERSION = '2026-08-21-v1'

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0))
const clamp01 = value => clamp(value, 0, 1)
const round1 = value => Math.round((Number(value) || 0) * 10) / 10

const POSITIVE_GROUP_TAGS = new Set(['fun', 'comfortable', 'good_listener', 'respectful', 'engaging'])
const NEGATIVE_GROUP_TAGS = new Set(['hard_to_connect', 'interrupts', 'dominates', 'disrespectful'])
const GROUP_EXPERIENCE_VALUE = Object.freeze({ great: 0.9, good: 0.45, neutral: 0, uncomfortable: -1 })
const EXCLUDED_PROFILE_KEY = /(name|phone|email|contact|whatsapp|token|receipt|payment|timestamp|created|updated|organizer|note|feedback|photo|image|nationality|gender|age|description)/i

function asNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function recencyWeight(currentEventId, eventId) {
  const distance = Math.max(0, Number(currentEventId) - Number(eventId))
  return Math.max(0.35, Math.pow(0.9, distance))
}

function normalizeProfileValue(value) {
  if (value == null) return null
  if (typeof value === 'boolean') return { type: 'boolean', value }
  if (typeof value === 'number' && Number.isFinite(value)) return { type: 'number', value }
  if (Array.isArray(value)) {
    const values = [...new Set(value.map(item => String(item || '').trim().toLowerCase()).filter(Boolean))].sort()
    return values.length && values.length <= 12 ? { type: 'array', value: values } : null
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/\s+/g, ' ').trim().toLowerCase()
    if (!normalized || normalized.length > 40) return null
    if (/^-?\d+(?:\.\d+)?$/.test(normalized)) return { type: 'number', value: Number(normalized) }
    return { type: 'string', value: normalized }
  }
  return null
}

export function extractSurveyProfile(participant = {}) {
  const profile = new Map()
  const survey = participant?.survey_data || {}
  const answers = survey?.answers || {}
  const add = (key, value, weight = 1) => {
    if (!key || EXCLUDED_PROFILE_KEY.test(key)) return
    const normalized = normalizeProfileValue(value)
    if (normalized) profile.set(key, { ...normalized, weight })
  }

  for (const [key, value] of Object.entries(answers)) {
    add(`answer:${key}`, value, key.startsWith('match_') ? 1.5 : 1)
  }

  const derived = {
    mbti: participant?.mbti_personality_type ?? survey?.mbtiType,
    attachment_style: participant?.attachment_style ?? survey?.attachmentStyle,
    communication_style: participant?.communication_style ?? survey?.communicationStyle,
    humor_banter_style: participant?.humor_banter_style ?? answers?.humor_banter_style,
    early_openness_comfort: participant?.early_openness_comfort ?? answers?.early_openness_comfort,
  }
  for (const [key, value] of Object.entries(derived)) add(`derived:${key}`, value, 1.25)
  return profile
}

function valueSimilarity(left, right) {
  if (!left || !right || left.type !== right.type) return null
  if (left.type === 'boolean' || left.type === 'string') return left.value === right.value ? 1 : 0
  if (left.type === 'number') {
    const scale = Math.max(4, Math.abs(left.value), Math.abs(right.value))
    return clamp01(1 - (Math.abs(left.value - right.value) / scale))
  }
  if (left.type === 'array') {
    const a = new Set(left.value)
    const b = new Set(right.value)
    const union = new Set([...a, ...b]).size
    if (!union) return null
    const intersection = [...a].filter(value => b.has(value)).length
    return intersection / union
  }
  return null
}

export function calculateSurveyProfileSimilarity(participantA, participantB) {
  const profileA = participantA instanceof Map ? participantA : extractSurveyProfile(participantA)
  const profileB = participantB instanceof Map ? participantB : extractSurveyProfile(participantB)
  let weightedTotal = 0
  let weight = 0
  let commonFeatures = 0

  for (const [key, left] of profileA.entries()) {
    const right = profileB.get(key)
    const similarity = valueSimilarity(left, right)
    if (similarity == null) continue
    const featureWeight = Math.min(left.weight || 1, right.weight || 1)
    weightedTotal += similarity * featureWeight
    weight += featureWeight
    commonFeatures += 1
  }

  if (commonFeatures < 4 || weight <= 0) return { score: 0, common_features: commonFeatures }
  const reliability = Math.min(1, weight / 12)
  return {
    score: clamp01((weightedTotal / weight) * (0.72 + (0.28 * reliability))),
    common_features: commonFeatures,
  }
}

function addObservation(directionMap, observation) {
  const ranker = Number(observation.ranker)
  const target = Number(observation.target)
  const eventId = Number(observation.eventId)
  const value = clamp(observation.value, -1, 1)
  const weight = Math.max(0, Number(observation.weight) || 0)
  if (!Number.isInteger(ranker) || !Number.isInteger(target) || ranker <= 0 || target <= 0 || ranker === target || !weight) return
  const key = `${ranker}>${target}`
  if (!directionMap.has(key)) directionMap.set(key, { ranker, target, observations: [] })
  directionMap.get(key).observations.push({
    eventId,
    source: observation.source,
    value,
    weight,
    flags: observation.flags || [],
  })
}

function addRankingObservations(directionMap, rows, currentEventId) {
  const ballots = new Map()
  for (const row of rows || []) {
    const eventId = Number(row?.event_id)
    const ranker = Number(row?.ranker_number)
    const target = Number(row?.ranked_number)
    const rank = Number(row?.rank)
    if (row?.auto_saved || eventId < HISTORY_CONFIDENCE_MIN_EVENT_ID || eventId >= currentEventId) continue
    if (!Number.isInteger(ranker) || !Number.isInteger(target) || !Number.isFinite(rank) || rank < 1) continue
    const key = `${eventId}:${ranker}`
    if (!ballots.has(key)) ballots.set(key, { eventId, ranker, entries: [] })
    ballots.get(key).entries.push({ target, rank })
  }

  for (const ballot of ballots.values()) {
    if (ballot.entries.length < 2) continue
    const maxRank = Math.max(...ballot.entries.map(entry => entry.rank))
    if (maxRank <= 1) continue
    for (const entry of ballot.entries) {
      const percentile = clamp01((entry.rank - 1) / (maxRank - 1))
      const firstPlace = entry.rank === 1
      const lastPlace = entry.rank === maxRank
      addObservation(directionMap, {
        ranker: ballot.ranker,
        target: entry.target,
        eventId: ballot.eventId,
        source: 'ranking',
        value: 1 - (2 * percentile),
        weight: recencyWeight(currentEventId, ballot.eventId),
        flags: [firstPlace ? 'first_place' : null, lastPlace ? 'last_place' : null].filter(Boolean),
      })
    }
  }
}

function feedbackSignal(feedback) {
  if (!feedback || typeof feedback !== 'object') return null
  const parts = []
  if (typeof feedback.wantConnect === 'boolean') {
    parts.push({ value: feedback.wantConnect ? 1 : -1, weight: 0.4, flag: feedback.wantConnect ? 'want_connect' : 'do_not_connect' })
  }
  const compatibility = asNumber(feedback.compatibilityRate)
  const compatibilityWasAnswered = feedback.sliderMoved !== false || compatibility !== 50
  if (compatibilityWasAnswered && compatibility != null && compatibility >= 0 && compatibility <= 100) {
    parts.push({ value: clamp((compatibility - 50) / 50, -1, 1), weight: 0.18 })
  }
  for (const key of ['conversationQuality', 'personalConnection']) {
    const rating = asNumber(feedback[key])
    if (rating != null && rating >= 1 && rating <= 5) parts.push({ value: (rating - 3) / 2, weight: 0.1 })
  }
  for (const key of ['sharedInterests', 'comfortLevel', 'communicationStyle', 'wouldMeetAgain', 'overallExperience']) {
    const rating = asNumber(feedback[key])
    if (rating != null && rating >= 1 && rating <= 5) parts.push({ value: (rating - 3) / 2, weight: 0.04 })
  }
  if (!parts.length) return null
  const denominator = parts.reduce((sum, part) => sum + part.weight, 0)
  let value = parts.reduce((sum, part) => sum + (part.value * part.weight), 0) / denominator
  const explicitNo = parts.some(part => part.flag === 'do_not_connect')
  const explicitYes = parts.some(part => part.flag === 'want_connect')
  if (explicitNo) value = Math.min(value, -0.55)
  if (explicitYes) value = Math.max(value, 0.55)
  return {
    value,
    completeness: clamp01(denominator),
    flags: parts.map(part => part.flag).filter(Boolean),
  }
}

function addPairFeedbackObservations(directionMap, rows, currentEventId) {
  for (const row of rows || []) {
    const eventId = Number(row?.event_id)
    const ranker = Number(row?.participant_number)
    if (eventId < HISTORY_CONFIDENCE_MIN_EVENT_ID || eventId >= currentEventId || !Number.isInteger(ranker)) continue
    for (const phase of [2, 3]) {
      const target = Number(row?.[`phase${phase}_partner`])
      const signal = feedbackSignal(row?.[`phase${phase}_feedback`])
      if (!Number.isInteger(target) || target <= 0 || target === 9999 || !signal) continue
      addObservation(directionMap, {
        ranker,
        target,
        eventId,
        source: 'pair_feedback',
        value: signal.value,
        weight: 1.4 * (0.65 + (0.35 * signal.completeness)) * recencyWeight(currentEventId, eventId),
        flags: signal.flags,
      })
    }
  }
}

function addGroupFeedbackObservations(directionMap, rows, currentEventId) {
  for (const row of rows || []) {
    const eventId = Number(row?.event_id)
    if (row?.is_test_mode || eventId < HISTORY_CONFIDENCE_MIN_EVENT_ID || eventId >= currentEventId) continue
    const experience = String(row?.experience || '')
    if (!Object.hasOwn(GROUP_EXPERIENCE_VALUE, experience)) continue
    const tags = Array.isArray(row?.tags) ? row.tags : []
    const positiveTags = tags.filter(tag => POSITIVE_GROUP_TAGS.has(tag)).length
    const negativeTags = tags.filter(tag => NEGATIVE_GROUP_TAGS.has(tag)).length
    const value = clamp(GROUP_EXPERIENCE_VALUE[experience] + (0.08 * positiveTags) - (0.08 * negativeTags), -1, 1)
    addObservation(directionMap, {
      ranker: row?.reviewer_number,
      target: row?.member_number,
      eventId,
      source: 'group_feedback',
      value,
      weight: 0.8 * recencyWeight(currentEventId, eventId),
      flags: [experience === 'uncomfortable' ? 'uncomfortable' : null, experience === 'great' ? 'great_group_experience' : null].filter(Boolean),
    })
  }
}

function finalizeDirection(entry) {
  if (!entry?.observations?.length) return null
  const totalWeight = entry.observations.reduce((sum, observation) => sum + observation.weight, 0)
  const signal = entry.observations.reduce((sum, observation) => sum + (observation.value * observation.weight), 0) / totalWeight
  const sources = new Set(entry.observations.map(observation => observation.source))
  const flags = new Set(entry.observations.flatMap(observation => observation.flags || []))
  const events = new Set(entry.observations.map(observation => observation.eventId))
  const confidence = clamp01((1 - Math.exp(-totalWeight / 2.4)) * (sources.size > 1 ? 1 : 0.85))
  const negativeKinds = new Set([
    flags.has('last_place') ? 'last_place' : null,
    flags.has('do_not_connect') ? 'do_not_connect' : null,
    flags.has('uncomfortable') ? 'uncomfortable' : null,
  ].filter(Boolean))
  return {
    ranker: entry.ranker,
    target: entry.target,
    signal,
    score: 50 + (50 * signal),
    confidence,
    totalWeight,
    observationCount: entry.observations.length,
    sources,
    flags,
    events,
    corroboratedNegative: signal <= -0.35 && negativeKinds.size >= 2,
  }
}

function directionSummary(direction) {
  if (!direction) return null
  return {
    score: round1(direction.score),
    confidence: round1(direction.confidence * 100),
    evidence_count: direction.observationCount,
    event_count: direction.events.size,
    sources: [...direction.sources],
    first_place_count: direction.flags.has('first_place') ? 1 : 0,
    last_place_count: direction.flags.has('last_place') ? 1 : 0,
    wants_connection: direction.flags.has('want_connect'),
    rejected_connection: direction.flags.has('do_not_connect'),
    uncomfortable_group: direction.flags.has('uncomfortable'),
  }
}

function makeDisabledAnalyzer(reason = 'not_applicable') {
  return {
    enabled: false,
    reason,
    modelVersion: HISTORY_CONFIDENCE_MODEL_VERSION,
    analyzePair() {
      return {
        history_model_version: HISTORY_CONFIDENCE_MODEL_VERSION,
        history_confidence_enabled: false,
        history_confidence_status: reason,
        historical_outcome_score: null,
        historical_confidence: 0,
        predictive_outcome_score: null,
        predictive_confidence: 0,
        combined_history_score: null,
        combined_history_confidence: 0,
        history_priority_adjustment: 0,
        history_badges: [],
        history_explanations: [],
        historical_evidence: { total: 0, ranking: 0, pair_feedback: 0, group_feedback: 0, events: 0, predictor_neighbors: 0 },
        never_pair_recommended: false,
      }
    },
  }
}

export function createHistoricalMatchAnalyzer({
  currentEventId,
  participants = [],
  rankingRows = [],
  groupFeedbackRows = [],
  matchFeedbackRows = [],
  sourceErrors = [],
} = {}) {
  const eventId = Number(currentEventId)
  if (!Number.isFinite(eventId) || eventId < HISTORY_CONFIDENCE_MIN_EVENT_ID) return makeDisabledAnalyzer('event_before_history_model')

  const profileMap = new Map()
  for (const participant of participants || []) {
    const number = Number(participant?.assigned_number)
    if (Number.isInteger(number) && number > 0) profileMap.set(number, extractSurveyProfile(participant))
  }

  const rawDirections = new Map()
  addRankingObservations(rawDirections, rankingRows, eventId)
  addPairFeedbackObservations(rawDirections, matchFeedbackRows, eventId)
  addGroupFeedbackObservations(rawDirections, groupFeedbackRows, eventId)

  const directions = new Map()
  for (const [key, entry] of rawDirections.entries()) {
    const finalized = finalizeDirection(entry)
    if (finalized) directions.set(key, finalized)
  }
  const directionList = [...directions.values()]

  const similarityCache = new Map()
  const similarity = (a, b) => {
    if (a === b) return { score: 1, common_features: profileMap.get(a)?.size || 0 }
    const key = a < b ? `${a}-${b}` : `${b}-${a}`
    if (!similarityCache.has(key)) {
      similarityCache.set(key, calculateSurveyProfileSimilarity(profileMap.get(a) || new Map(), profileMap.get(b) || new Map()))
    }
    return similarityCache.get(key)
  }

  const predictDirection = (ranker, target) => {
    if (!profileMap.has(ranker) || !profileMap.has(target)) return null
    const personal = []
    const collaborative = []
    for (const direction of directionList) {
      // Keep the predictor independent from this pair's own direct history;
      // direct observations are already represented by the historical score.
      if (
        (direction.ranker === ranker && direction.target === target)
        || (direction.ranker === target && direction.target === ranker)
      ) continue
      if (direction.ranker === ranker && direction.target !== target) {
        const targetSimilarity = similarity(target, direction.target)
        if (targetSimilarity.score >= 0.5) {
          personal.push({
            signal: direction.signal,
            weight: direction.confidence * Math.pow(targetSimilarity.score, 3),
            similarity: targetSimilarity.score,
            kind: 'personal_analogue',
          })
        }
        continue
      }
      if (direction.ranker === ranker) continue
      const rankerSimilarity = similarity(ranker, direction.ranker)
      if (rankerSimilarity.score < 0.55) continue
      const targetSimilarity = similarity(target, direction.target)
      if (targetSimilarity.score < 0.5) continue
      collaborative.push({
        signal: direction.signal,
        weight: direction.confidence * Math.pow(rankerSimilarity.score, 2) * Math.pow(targetSimilarity.score, 2) * 0.65,
        similarity: (rankerSimilarity.score + targetSimilarity.score) / 2,
        kind: 'collaborative_neighbour',
      })
    }

    const neighbours = [
      ...personal.sort((a, b) => b.weight - a.weight).slice(0, 8),
      ...collaborative.sort((a, b) => b.weight - a.weight).slice(0, 12),
    ].filter(neighbour => neighbour.weight > 0.015)
    const totalWeight = neighbours.reduce((sum, neighbour) => sum + neighbour.weight, 0)
    if (!neighbours.length || totalWeight < 0.08) return null
    const signal = neighbours.reduce((sum, neighbour) => sum + (neighbour.signal * neighbour.weight), 0) / totalWeight
    const personalCount = neighbours.filter(neighbour => neighbour.kind === 'personal_analogue').length
    const confidence = clamp01((1 - Math.exp(-totalWeight / 1.8)) * (personalCount ? 1 : 0.8))
    return { signal, score: 50 + (50 * signal), confidence, neighbourCount: neighbours.length, personalCount }
  }

  return {
    enabled: true,
    reason: sourceErrors.length ? 'partial_history_sources' : 'ready',
    modelVersion: HISTORY_CONFIDENCE_MODEL_VERSION,
    stats: {
      directions: directions.size,
      profiles: profileMap.size,
      rankings: rankingRows.length,
      groupFeedback: groupFeedbackRows.length,
      pairFeedback: matchFeedbackRows.length,
      sourceErrors,
    },
    analyzePair(participantA, participantB) {
      const a = Number(participantA?.assigned_number ?? participantA)
      const b = Number(participantB?.assigned_number ?? participantB)
      const aToB = directions.get(`${a}>${b}`) || null
      const bToA = directions.get(`${b}>${a}`) || null
      const directDirections = [aToB, bToA].filter(Boolean)
      const directWeight = directDirections.reduce((sum, direction) => sum + direction.confidence, 0)
      const directSignal = directWeight > 0
        ? directDirections.reduce((sum, direction) => sum + (direction.signal * direction.confidence), 0) / directWeight
        : null
      const totalDirectEvidenceWeight = directDirections.reduce((sum, direction) => sum + direction.totalWeight, 0)
      const directConfidence = directDirections.length
        ? clamp01((1 - Math.exp(-totalDirectEvidenceWeight / 3.2)) * (directDirections.length === 2 ? 1 : 0.72))
        : 0

      const predictedA = predictDirection(a, b)
      const predictedB = predictDirection(b, a)
      const predictedDirections = [predictedA, predictedB].filter(Boolean)
      const predictionWeight = predictedDirections.reduce((sum, prediction) => sum + prediction.confidence, 0)
      const predictionSignal = predictionWeight > 0
        ? predictedDirections.reduce((sum, prediction) => sum + (prediction.signal * prediction.confidence), 0) / predictionWeight
        : null
      const predictiveConfidence = predictedDirections.length
        ? clamp01((1 - Math.exp(-predictionWeight / 1.15)) * (predictedDirections.length === 2 ? 1 : 0.78))
        : 0

      const mutualLike = !!(aToB && bToA && aToB.signal >= 0.45 && bToA.signal >= 0.45 && aToB.confidence >= 0.2 && bToA.confidence >= 0.2)
      const mutualNegative = !!(aToB && bToA && aToB.signal <= -0.5 && bToA.signal <= -0.5 && aToB.confidence >= 0.2 && bToA.confidence >= 0.2)
      // Old last-place flags must not permanently veto a pair after stronger,
      // newer positive evidence has moved both directional signals upward.
      const mutualLastPlace = !!(
        aToB?.flags.has('last_place')
        && bToA?.flags.has('last_place')
        && aToB.signal <= -0.25
        && bToA.signal <= -0.25
      )
      const corroboratedNegative = !!(aToB?.corroboratedNegative || bToA?.corroboratedNegative)
      const anyLastPlace = !!(aToB?.flags.has('last_place') || bToA?.flags.has('last_place'))
      const neverPair = mutualNegative || mutualLastPlace || corroboratedNegative

      const directAdjustment = directSignal == null ? 0 : directSignal * 12 * directConfidence
      const predictionAdjustment = predictionSignal == null
        ? 0
        : predictionSignal * 7 * predictiveConfidence * (1 - (0.6 * directConfidence))
      let priorityAdjustment = clamp(directAdjustment + predictionAdjustment, -16, 12)
      if (neverPair) priorityAdjustment = Math.min(priorityAdjustment, -16)

      const directCombineWeight = directConfidence
      const predictionCombineWeight = predictiveConfidence * (1 - (0.5 * directConfidence))
      const combinedWeight = directCombineWeight + predictionCombineWeight
      const combinedSignal = combinedWeight > 0
        ? (((directSignal || 0) * directCombineWeight) + ((predictionSignal || 0) * predictionCombineWeight)) / combinedWeight
        : null
      const combinedConfidence = clamp01(1 - ((1 - directConfidence) * (1 - (0.75 * predictiveConfidence))))

      const badges = []
      if (neverPair) badges.push({ code: 'never_pair', label_ar: 'لا تجمعهما', tone: 'danger' })
      else if (mutualLike) badges.push({ code: 'mutual_like', label_ar: 'إعجاب متبادل سابق', tone: 'positive' })
      if (anyLastPlace) badges.push({ code: 'least_ranked', label_ar: 'ترتيب أخير سابق', tone: 'warning' })
      if (!neverPair && directSignal != null && directSignal >= 0.35 && directConfidence >= 0.2) badges.push({ code: 'positive_history', label_ar: 'سجل إيجابي', tone: 'positive' })
      if (!neverPair && directSignal != null && directSignal <= -0.3 && directConfidence >= 0.2) badges.push({ code: 'negative_history', label_ar: 'سجل سلبي', tone: 'warning' })
      if (predictionSignal != null && predictiveConfidence >= 0.12 && predictionSignal >= 0.3) badges.push({ code: 'predicted_good', label_ar: 'توقع ذكي إيجابي', tone: 'info' })
      if (predictionSignal != null && predictiveConfidence >= 0.12 && predictionSignal <= -0.3) badges.push({ code: 'predicted_risk', label_ar: 'توقع ذكي حذر', tone: 'warning' })

      const explanations = []
      if (mutualLike) explanations.push('سبق أن أظهر الطرفان تفضيلاً إيجابياً متبادلاً.')
      if (mutualNegative) explanations.push('توجد إشارات سلبية قوية ومتبادلة من الطرفين.')
      else if (corroboratedNegative) explanations.push('تكرر رفض هذا الاقتران في مصدرين مستقلين على الأقل.')
      else if (anyLastPlace) explanations.push('وضع أحد الطرفين الآخر في آخر ترتيب سابق؛ خُفّضت الأولوية دون حظر تلقائي.')
      if (predictionSignal != null && predictiveConfidence >= 0.08) {
        explanations.push(predictionSignal >= 0
          ? 'تشابه الاستبيانات مع أشخاص نالوا تفضيلاً سابقاً يرفع احتمال نجاح اللقاء.'
          : 'أنماط التفضيل لدى مشاركين متشابهين تشير إلى ضرورة الحذر.')
      }
      if (!directDirections.length && !predictedDirections.length) explanations.push('لا توجد بيانات تاريخية كافية لهذا الزوج؛ لم تتغير أولوية المطابقة.')

      const sourceCounts = { ranking: 0, pair_feedback: 0, group_feedback: 0 }
      const directEvents = new Set()
      for (const direction of directDirections) {
        for (const observation of rawDirections.get(`${direction.ranker}>${direction.target}`)?.observations || []) {
          if (Object.hasOwn(sourceCounts, observation.source)) sourceCounts[observation.source] += 1
          directEvents.add(observation.eventId)
        }
      }
      const predictorNeighbours = predictedDirections.reduce((sum, prediction) => sum + prediction.neighbourCount, 0)

      return {
        history_model_version: HISTORY_CONFIDENCE_MODEL_VERSION,
        history_confidence_enabled: true,
        history_confidence_status: sourceErrors.length ? 'partial' : 'ready',
        historical_outcome_score: directSignal == null ? null : round1(50 + (50 * directSignal)),
        historical_confidence: round1(directConfidence * 100),
        predictive_outcome_score: predictionSignal == null ? null : round1(50 + (50 * predictionSignal)),
        predictive_confidence: round1(predictiveConfidence * 100),
        combined_history_score: combinedSignal == null ? null : round1(50 + (50 * combinedSignal)),
        combined_history_confidence: round1(combinedConfidence * 100),
        history_priority_adjustment: round1(priorityAdjustment),
        history_badges: badges,
        history_explanations: explanations,
        historical_evidence: {
          total: directDirections.reduce((sum, direction) => sum + direction.observationCount, 0),
          ...sourceCounts,
          events: directEvents.size,
          predictor_neighbors: predictorNeighbours,
        },
        history_direction_a_to_b: directionSummary(aToB),
        history_direction_b_to_a: directionSummary(bToA),
        never_pair_recommended: neverPair,
      }
    },
  }
}

export { makeDisabledAnalyzer as createDisabledHistoricalMatchAnalyzer }
