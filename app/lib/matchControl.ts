export type SeatState = "paid" | "waived" | "receipt" | "confirmed_pending" | "declined" | "contacted" | "unpaid"

export type MatchControlPerson = {
  assigned_number: number
  name?: string | null
  PAID?: boolean | null
  PAID_DONE?: boolean | null
  payment_waived?: boolean | null
  receipt_url?: string | null
  receipt_approved?: boolean | null
  receipt_rejected?: boolean | null
  attendance_confirmed?: boolean | null
  attendance_denied_at?: string | null
  created_at?: string | null
  gender?: string | null
  age?: number | string | null
  survey_data?: any
  [key: string]: any
}

export type MatchControlResult = {
  id?: string
  assigned_number: number
  name?: string | null
  compatibility_score: number
  partner_assigned_number?: number | null
  partner_name?: string | null
  is_organizer_match?: boolean
  paid_done?: boolean
  partner_paid_done?: boolean
  round?: number | null
  [key: string]: any
}

export type MatchControlPair = {
  key: string
  a: number
  b: number | null
  score: number | null
  round: number
  result: MatchControlResult
  organizerMatch: boolean
}

export type PlannedPair = { a: number; b: number; score: number | null }

export type SwapPlan = {
  id: string
  title: string
  source: number
  target: number
  beforePairs: PlannedPair[]
  afterPairs: PlannedPair[]
  unmatched: number[]
  releasedOutsideScope: number[]
  affected: number[]
  beforeTotal: number
  afterTotal: number
  beforeMin: number | null
  afterMin: number | null
  delta: number
  confirmedUnmatched: number[]
  brokenLocks: number
  contactedPairsChanged: number
  repeatedPairs: number
  unknownScores: number
  verdict: "recommended" | "reasonable" | "risky"
  reasons: string[]
}

export const pairKey = (a: number, b: number) => a < b ? `${a}-${b}` : `${b}-${a}`

export function getPersonName(person: MatchControlPerson | undefined, fallbackNumber: number) {
  return person?.name || person?.survey_data?.name || person?.survey_data?.answers?.name || `المشارك #${fallbackNumber}`
}

export function getSeatState(person?: MatchControlPerson): SeatState {
  if (!person) return "unpaid"
  if (person.attendance_confirmed === false && person.attendance_denied_at) return "declined"
  if (person.PAID_DONE === true || person.receipt_approved === true) return "paid"
  if (person.payment_waived === true) return "waived"
  if (person.receipt_url && person.receipt_rejected !== true) return "receipt"
  if (person.attendance_confirmed === true) return "confirmed_pending"
  if (person.PAID === true) return "contacted"
  return "unpaid"
}

export function isSeatConfirmed(person?: MatchControlPerson) {
  const state = getSeatState(person)
  return state === "paid" || state === "waived" || state === "confirmed_pending"
}

export function isContacted(person?: MatchControlPerson) {
  return person?.PAID === true || person?.PAID_DONE === true || person?.receipt_url != null
}

export function getPairCriteriaIssues(personA: MatchControlPerson | undefined, personB: MatchControlPerson | undefined, round: number) {
  if (!personA || !personB) return ["بيانات المشارك غير مكتملة"]
  const issues: string[] = []
  const answersA = personA.survey_data?.answers || {}
  const answersB = personB.survey_data?.answers || {}
  const genderA = String(personA.gender || personA.survey_data?.gender || answersA.gender || "").trim().toLowerCase()
  const genderB = String(personB.gender || personB.survey_data?.gender || answersB.gender || "").trim().toLowerCase()
  const preference = (person: MatchControlPerson, answers: any) => {
    const raw = String(answers.gender_preference || "").toLowerCase()
    if (person.any_gender_preference === true || raw.includes("any_gender")) return "any"
    if (person.same_gender_preference === true || raw.includes("same_gender") || String(answers.same_gender_preference || "").toLowerCase().includes("yes")) return "same"
    return "opposite"
  }
  const preferenceA = preference(personA, answersA)
  const preferenceB = preference(personB, answersB)
  if (!genderA) issues.push(`الجنس غير مسجل للمشارك ${getPersonName(personA, personA.assigned_number)} #${personA.assigned_number}`)
  if (!genderB) issues.push(`الجنس غير مسجل للمشارك ${getPersonName(personB, personB.assigned_number)} #${personB.assigned_number}`)
  if (!genderA || !genderB) return issues
  else {
    const accepts = (own: string, other: string, pref: string) => pref === "any" || (pref === "same" ? own === other : own !== other)
    if (!accepts(genderA, genderB, preferenceA) || !accepts(genderB, genderA, preferenceB)) issues.push("تفضيل الجنس غير متوافق")
  }

  const preferSameNationalityA = personA.prefer_same_nationality === true || answersA.nationality_preference === "same"
  const preferSameNationalityB = personB.prefer_same_nationality === true || answersB.nationality_preference === "same"
  if (preferSameNationalityA || preferSameNationalityB) {
    const nationalityA = String(personA.nationality || answersA.nationality || "").trim()
    const nationalityB = String(personB.nationality || answersB.nationality || "").trim()
    if (!nationalityA || !nationalityB || nationalityA !== nationalityB) issues.push("تفضيل الجنسية غير متوافق")
  }

  const ageA = Number(personA.age || personA.survey_data?.age)
  const ageB = Number(personB.age || personB.survey_data?.age)
  const ageRangePasses = (person: MatchControlPerson, answers: any, partnerAge: number) => {
    const open = person.open_age_preference === true || answers.open_age_preference === true || answers.open_age_preference === "true"
    const min = Number(person.preferred_age_min ?? answers.preferred_age_min)
    const max = Number(person.preferred_age_max ?? answers.preferred_age_max)
    if (open || !Number.isFinite(min) || !Number.isFinite(max)) return true
    const eventId = Number(person.signup_event_id || person.event_id || 0)
    const flex = !person.age_flex_event_id || Number(person.age_flex_event_id) === eventId ? Number(person.age_flex_years || 0) : 0
    const tolerance = Math.max(round === 1 ? 3 : 1, flex)
    return Number.isFinite(partnerAge) && partnerAge >= min - tolerance && partnerAge <= max + tolerance
  }
  if (!ageRangePasses(personA, answersA, ageB) || !ageRangePasses(personB, answersB, ageA)) issues.push("نطاق العمر المفضل غير متوافق")

  const intentA = String(personA.intent_goal || answersA.intent_goal || "").toUpperCase()
  const intentB = String(personB.intent_goal || answersB.intent_goal || "").toUpperCase()
  const acceptsIntentMismatch = (person: MatchControlPerson, answers: any) => {
    const raw = person.open_intent_goal_mismatch ?? answers.open_intent_goal_mismatch
    return raw === true || String(raw).toLowerCase() === "true"
  }
  if (intentA && intentB && intentA !== intentB) {
    const blockedByA = intentA === "B" && !acceptsIntentMismatch(personA, answersA)
    const blockedByB = intentB === "B" && !acceptsIntentMismatch(personB, answersB)
    if (blockedByA || blockedByB) issues.push("هدف المشاركة غير متوافق")
  }

  const humorA = String(personA.humor_banter_style || answersA.humor_banter_style || "").toUpperCase()
  const humorB = String(personB.humor_banter_style || answersB.humor_banter_style || "").toUpperCase()
  const opennessA = Number(personA.early_openness_comfort ?? answersA.early_openness_comfort)
  const opennessB = Number(personB.early_openness_comfort ?? answersB.early_openness_comfort)
  if (humorA && humorB && ((humorA === "A" && humorB === "D") || (humorA === "D" && humorB === "A"))) issues.push("أسلوب المزاح غير متوافق")
  if (Number.isFinite(opennessA) && Number.isFinite(opennessB) && Math.abs(opennessA - opennessB) === 3) issues.push("الانفتاح المبكر غير متوافق")
  return issues
}

export function buildScoreLookup(calculatedPairs: any[], results: MatchControlResult[]) {
  const lookup = new Map<string, any>()
  const timestamp = (pair: any) => {
    const value = Date.parse(String(pair?.last_used || pair?.updated_at || pair?.created_at || ""))
    return Number.isFinite(value) ? value : 0
  }
  for (const pair of calculatedPairs || []) {
    const a = Number(pair.participant_a)
    const b = Number(pair.participant_b)
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue
    const key = pairKey(a, b)
    const current = lookup.get(key)
    // A pair can have several cache rows after questionnaire/model changes. Always
    // use the newest calculation instead of whichever database row happens to be last.
    if (!current || timestamp(pair) > timestamp(current)) lookup.set(key, pair)
  }
  for (const result of results || []) {
    const b = Number(result.partner_assigned_number)
    if (!Number.isFinite(b) || b === 9999) continue
    const key = pairKey(result.assigned_number, b)
    const calculated = lookup.get(key) || {}
    // The saved match result is authoritative for the score currently shown to
    // participants. Preserve richer cached dimensions when the result lacks them.
    lookup.set(key, {
      ...calculated,
      ...Object.fromEntries(Object.entries(result).filter(([, value]) => value !== undefined && value !== null)),
      participant_a: result.assigned_number,
      participant_b: b,
      compatibility_score: result.compatibility_score,
      is_actual_match: true,
    })
  }
  return lookup
}

export function scoreFor(lookup: Map<string, any>, a: number, b: number): number | null {
  const pair = lookup.get(pairKey(a, b))
  const raw = pair?.compatibility_score ?? pair?.total_compatibility_score
  const score = Number(raw)
  return Number.isFinite(score) ? Math.round(score) : null
}

export function buildUniquePairs(results: MatchControlResult[]): MatchControlPair[] {
  const pairs = new Map<string, MatchControlPair>()
  for (const result of results || []) {
    const rawPartner = Number(result.partner_assigned_number)
    const hasPartner = Number.isFinite(rawPartner) && rawPartner > 0 && rawPartner !== 9999
    const b = hasPartner ? rawPartner : null
    const key = b == null ? `unmatched-${result.assigned_number}` : pairKey(result.assigned_number, b)
    const next: MatchControlPair = {
      key,
      a: b == null ? result.assigned_number : Math.min(result.assigned_number, b),
      b: b == null ? null : Math.max(result.assigned_number, b),
      score: Number.isFinite(Number(result.compatibility_score)) ? Math.round(Number(result.compatibility_score)) : null,
      round: Number(result.round || 1),
      result,
      organizerMatch: result.is_organizer_match === true || rawPartner === 9999,
    }
    const previous = pairs.get(key)
    if (!previous || (next.score ?? -1) > (previous.score ?? -1)) pairs.set(key, next)
  }
  return Array.from(pairs.values())
}

function currentMatching(pairs: MatchControlPair[]) {
  const map = new Map<number, number>()
  for (const pair of pairs) {
    if (pair.b == null) continue
    map.set(pair.a, pair.b)
    map.set(pair.b, pair.a)
  }
  return map
}

function oldPairFor(pairs: MatchControlPair[], num: number) {
  return pairs.find(pair => pair.a === num || pair.b === num)
}

function uniquePlannedPairs(items: PlannedPair[]) {
  const seen = new Set<string>()
  return items.filter(pair => {
    const key = pairKey(pair.a, pair.b)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function analyzePlan(args: {
  source: number
  target: number
  title: string
  currentPairs: MatchControlPair[]
  afterPairs: PlannedPair[]
  unmatched: number[]
  people: Map<number, MatchControlPerson>
  scoreLookup: Map<string, any>
  lockedPairs: Set<string>
}) : SwapPlan {
  const { source, target, title, currentPairs, people, scoreLookup, lockedPairs } = args
  const afterPairs = uniquePlannedPairs(args.afterPairs).map(pair => ({ ...pair, score: pair.score ?? scoreFor(scoreLookup, pair.a, pair.b) }))
  const affectedSet = new Set<number>([source, target, ...args.unmatched])
  afterPairs.forEach(pair => { affectedSet.add(pair.a); affectedSet.add(pair.b) })
  let beforePairs = currentPairs
    .filter(pair => pair.b != null && (affectedSet.has(pair.a) || affectedSet.has(pair.b)))
    .map(pair => ({ a: pair.a, b: pair.b as number, score: pair.score }))
  beforePairs.forEach(pair => { affectedSet.add(pair.a); affectedSet.add(pair.b) })
  beforePairs = uniquePlannedPairs(beforePairs)

  const unmatched = Array.from(new Set(args.unmatched.filter(num => !afterPairs.some(pair => pair.a === num || pair.b === num))))
  const afterNumbers = new Set(afterPairs.flatMap(pair => [pair.a, pair.b]))
  const releasedOutsideScope = Array.from(new Set(beforePairs
    .flatMap(pair => [pair.a, pair.b])
    .filter(number => !afterNumbers.has(number) && !unmatched.includes(number))))
  const confirmedUnmatched = unmatched.filter(num => isSeatConfirmed(people.get(num)))
  const beforeScores = beforePairs.map(pair => pair.score).filter((score): score is number => score != null)
  const afterScores = afterPairs.map(pair => pair.score).filter((score): score is number => score != null)
  const beforeTotal = beforeScores.reduce((sum, score) => sum + score, 0)
  const afterTotal = afterScores.reduce((sum, score) => sum + score, 0)
  const brokenLocks = beforePairs.filter(pair => lockedPairs.has(pairKey(pair.a, pair.b)) && !afterPairs.some(next => pairKey(next.a, next.b) === pairKey(pair.a, pair.b))).length
  const contactedPairsChanged = beforePairs.filter(pair => {
    if (afterPairs.some(next => pairKey(next.a, next.b) === pairKey(pair.a, pair.b))) return false
    return isContacted(people.get(pair.a)) || isContacted(people.get(pair.b))
  }).length
  const repeatedPairs = afterPairs.filter(pair => scoreLookup.get(pairKey(pair.a, pair.b))?.is_repeated_match === true).length
  const unknownScores = afterPairs.filter(pair => pair.score == null).length
  const beforeMin = beforeScores.length ? Math.min(...beforeScores) : null
  const afterMin = afterScores.length ? Math.min(...afterScores) : null
  const delta = afterTotal - beforeTotal
  const reasons: string[] = []
  if (confirmedUnmatched.length) reasons.push(`سيبقى ${confirmedUnmatched.length} من أصحاب المقاعد المؤكدة دون شريك`)
  if (brokenLocks) reasons.push(`يكسر ${brokenLocks} مطابقة مثبتة`)
  if (contactedPairsChanged) reasons.push(`يغيّر ${contactedPairsChanged} زوجاً تم التواصل مع أحد طرفيه`)
  if (repeatedPairs) reasons.push(`ينشئ ${repeatedPairs} مطابقة مكررة`)
  if (unknownScores) reasons.push(`توجد ${unknownScores} نتيجة توافق غير محسوبة`)
  if (releasedOutsideScope.length) reasons.push(`سيتم فك ارتباط ${releasedOutsideScope.length} من الشركاء الحاليين خارج نطاق السلسلة دون إدخالهم فيها`)
  if (delta > 0) reasons.push(`يرفع مجموع التوافق المتأثر بمقدار ${delta} نقطة`)
  if (delta < 0) reasons.push(`يخفض مجموع التوافق المتأثر بمقدار ${Math.abs(delta)} نقطة`)
  if (afterMin != null && beforeMin != null && afterMin > beforeMin) reasons.push(`يحسن أضعف زوج من ${beforeMin}% إلى ${afterMin}%`)
  if (!args.unmatched.length) reasons.push("تنتهي السلسلة بدون ترك أي مشارك متأثر وحيداً")

  let verdict: SwapPlan["verdict"] = "reasonable"
  if (confirmedUnmatched.length || brokenLocks || repeatedPairs || unknownScores) verdict = "risky"
  else if (contactedPairsChanged) verdict = "reasonable"
  else if (!unmatched.length && delta >= 0 && (afterMin == null || beforeMin == null || afterMin >= beforeMin)) verdict = "recommended"

  return {
    id: `${source}-${target}-${afterPairs.map(pair => pairKey(pair.a, pair.b)).sort().join("_")}-${unmatched.sort().join("_")}`,
    title,
    source,
    target,
    beforePairs,
    afterPairs,
    unmatched,
    releasedOutsideScope,
    affected: Array.from(affectedSet),
    beforeTotal,
    afterTotal,
    beforeMin,
    afterMin,
    delta,
    confirmedUnmatched,
    brokenLocks,
    contactedPairsChanged,
    repeatedPairs,
    unknownScores,
    verdict,
    reasons,
  }
}

export function buildSwapPlans(args: {
  source: number
  target: number
  currentPairs: MatchControlPair[]
  people: Map<number, MatchControlPerson>
  scoreLookup: Map<string, any>
  lockedPairs?: Set<string>
  maxDepth?: number
  eligibleNumbers?: Set<number>
  isPairEligible?: (a: number, b: number) => boolean
}): SwapPlan[] {
  const { source, target, currentPairs, people, scoreLookup } = args
  if (source === target) return []
  if (args.eligibleNumbers && (!args.eligibleNumbers.has(source) || !args.eligibleNumbers.has(target))) return []
  if (args.isPairEligible && !args.isPairEligible(source, target)) return []
  const lockedPairs = args.lockedPairs || new Set<string>()
  const matching = currentMatching(currentPairs)
  const sourcePartner = matching.get(source)
  const targetPartner = matching.get(target)
  // Existing partners outside a selected payment scope are detached from the
  // old pair, not pulled into the replacement chain. They remain in affected
  // for transactional cleanup but do not consume a slot in the scoped pool.
  const initialOpen = [sourcePartner, targetPartner].filter((num): num is number =>
    num != null && num !== source && num !== target && (!args.eligibleNumbers || args.eligibleNumbers.has(num))
  )
  const forced: PlannedPair = { a: source, b: target, score: scoreFor(scoreLookup, source, target) }
  const completions: Array<{ pairs: PlannedPair[]; unmatched: number[]; title: string }> = []

  if (initialOpen.length >= 2) {
    if (!args.isPairEligible || args.isPairEligible(initialOpen[0], initialOpen[1])) {
      completions.push({
        pairs: [forced, { a: initialOpen[0], b: initialOpen[1], score: scoreFor(scoreLookup, initialOpen[0], initialOpen[1]) }],
        unmatched: [],
        title: "تبادل مباشر بين زوجين",
      })
    }
  } else {
    completions.push({ pairs: [forced], unmatched: initialOpen, title: initialOpen.length ? "استبدال مباشر ينتهي بمشارك دون شريك" : "مطابقة مباشرة نظيفة" })
  }

  const maxDepth = args.maxDepth ?? 2
  const allNumbers = Array.from(people.keys()).filter(num => num !== 9999 && (!args.eligibleNumbers || args.eligibleNumbers.has(num)))
  const branch = (
    open: number[],
    planned: PlannedPair[],
    used: Set<number>,
    depth: number,
  ) => {
    if (!open.length) {
      completions.push({ pairs: [forced, ...planned], unmatched: [], title: planned.length > 1 ? `سلسلة تبديل من ${planned.length + 1} أزواج` : "تبادل مباشر بين زوجين" })
      return
    }
    const [person, ...rest] = open
    if (rest.length) {
      const partner = rest[0]
      if (!args.isPairEligible || args.isPairEligible(person, partner)) branch(rest.slice(1), [...planned, { a: person, b: partner, score: scoreFor(scoreLookup, person, partner) }], new Set([...used, person, partner]), depth)
    }
    if (depth >= maxDepth) {
      completions.push({ pairs: [forced, ...planned], unmatched: open, title: `سلسلة تنتهي بـ ${open.length} دون شريك` })
      return
    }

    const candidates = allNumbers
      .filter(candidate => candidate !== person && !used.has(candidate) && !open.includes(candidate))
      .filter(candidate => !args.isPairEligible || args.isPairEligible(person, candidate))
      .map(candidate => ({ candidate, score: scoreFor(scoreLookup, person, candidate) }))
      .filter(item => item.score != null)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 4)

    for (const { candidate, score } of candidates) {
      const displaced = matching.get(candidate)
      if (displaced != null && (used.has(displaced) || displaced === source || displaced === target || displaced === person)) continue
      const nextOpen = [...rest]
      if (displaced != null && (!args.eligibleNumbers || args.eligibleNumbers.has(displaced)) && !nextOpen.includes(displaced)) nextOpen.push(displaced)
      branch(nextOpen, [...planned, { a: person, b: candidate, score }], new Set([...used, person, candidate]), depth + 1)
    }
  }

  if (initialOpen.length) branch(initialOpen, [], new Set([source, target]), 0)

  const plans = completions.map(completion => analyzePlan({
    source,
    target,
    title: completion.title,
    currentPairs,
    afterPairs: completion.pairs,
    unmatched: completion.unmatched,
    people,
    scoreLookup,
    lockedPairs,
  })).filter(plan => {
    // A missing cached score must not make a valid chain disappear. The
    // transactional API calculates every resulting pair before it writes the
    // swap, and analyzePlan already marks these previews as risky so the admin
    // knows that the displayed delta is incomplete.
    if (plan.repeatedPairs > 0) return false
    return !args.eligibleNumbers || plan.afterPairs.every(pair => args.eligibleNumbers!.has(pair.a) && args.eligibleNumbers!.has(pair.b))
  })

  const unique = new Map<string, SwapPlan>()
  for (const plan of plans) if (!unique.has(plan.id)) unique.set(plan.id, plan)
  const verdictRank = { recommended: 0, reasonable: 1, risky: 2 }
  return Array.from(unique.values())
    .sort((a, b) => verdictRank[a.verdict] - verdictRank[b.verdict] || a.confirmedUnmatched.length - b.confirmedUnmatched.length || b.delta - a.delta || a.affected.length - b.affected.length)
    .slice(0, 6)
}

export function pairRiskRank(pair: MatchControlPair, people: Map<number, MatchControlPerson>, locked: Set<string>) {
  const a = people.get(pair.a)
  const b = pair.b == null ? undefined : people.get(pair.b)
  if (pair.b == null && isSeatConfirmed(a)) return 0
  if (pair.b != null && isSeatConfirmed(a) !== isSeatConfirmed(b)) return 1
  if (pair.b != null && locked.has(pairKey(pair.a, pair.b))) return 5
  if ((pair.score ?? 0) < 50) return 2
  if (pair.b == null) return 3
  return 4
}
