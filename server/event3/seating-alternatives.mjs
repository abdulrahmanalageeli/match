import { createHash, createHmac, timingSafeEqual } from "node:crypto"

const EVENT3 = "00000000-0000-0000-0000-000000000003"
const MAIN = "00000000-0000-0000-0000-000000000000"
const PURPOSE = "event3-seating-alternative-v1"
const TTL = 15 * 60 * 1000
const pairKey = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`
const fail = (message, status = 409) => Object.assign(new Error(message), { status })

export function seatingGender(value) {
  const text = String(value || "").trim().toLowerCase()
  return ["female", "أنثى", "انثى"].includes(text) ? "female" : ["male", "ذكر"].includes(text) ? "male" : "unknown"
}

export function canonicalSeating(rows) {
  return rows.map(row => ({ round: Number(row.round), table_number: Number(row.table_number), participant_id: Number(row.participant_id) }))
    .sort((a, b) => a.round - b.round || a.participant_id - b.participant_id)
}

function groupsOf(rows) {
  const groups = new Map()
  for (const row of rows) {
    const key = `${row.round}:${row.table_number}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row.participant_id)
  }
  return groups
}

function pairCounts(rows) {
  const counts = new Map()
  for (const group of groupsOf(rows).values()) {
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      const key = pairKey(group[i], group[j])
      counts.set(key, (counts.get(key) || 0) + 1)
    }
  }
  return counts
}

export function seatingMetrics(rows, participants, scores = new Map(), baseline = rows) {
  const people = new Map(participants.map(p => [p.number, p]))
  const original = new Map(baseline.map(r => [`${r.round}:${r.participant_id}`, r.table_number]))
  const moved = new Set()
  let ageSum = 0, ageSquares = 0, agePairs = 0, scoreSum = 0, scoredPairs = 0, mixedPairs = 0
  for (const row of rows) if (original.get(`${row.round}:${row.participant_id}`) !== row.table_number) moved.add(row.participant_id)
  for (const group of groupsOf(rows).values()) {
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      const a = people.get(group[i]), b = people.get(group[j])
      if (a.age > 0 && b.age > 0) {
        const gap = Math.abs(a.age - b.age)
        ageSum += gap; ageSquares += gap ** 2; agePairs++
      }
      if (a.gender !== "unknown" && b.gender !== "unknown" && a.gender !== b.gender) {
        mixedPairs++
        const score = scores.get(pairKey(a.number, b.number))
        if (Number.isFinite(score)) { scoreSum += score; scoredPairs++ }
      }
    }
  }
  const counts = pairCounts(rows)
  const repeatPeople = new Map()
  for (const [key, count] of counts) if (count > 1) {
    for (const number of key.split("-").map(Number)) repeatPeople.set(number, (repeatPeople.get(number) || 0) + 1)
  }
  return {
    repeated_pairs: [...counts.values()].filter(count => count > 1).length,
    max_repeats_per_person: Math.max(0, ...repeatPeople.values()),
    moved_people: moved.size,
    average_age_gap: agePairs ? ageSum / agePairs : null,
    rms_age_gap: agePairs ? Math.sqrt(ageSquares / agePairs) : null,
    compatibility: scoredPairs ? scoreSum / scoredPairs : null,
    scored_pairs: scoredPairs, mixed_pairs: mixedPairs,
  }
}

// Swap identities in both rounds together: capacities, gender composition, and
// the repeat graph are preserved. Never run the mutating seating generator here.
export function buildSeatingAlternatives({ assignments, participants, scores = new Map(), protectedPairs = [], random = Math.random, attempts = 800 }) {
  const baseline = canonicalSeating(assignments)
  const numbers = new Set(participants.map(p => p.number))
  if (numbers.size < 4 || numbers.size !== participants.length || baseline.length !== numbers.size * 2) {
    throw fail("ولّد جلستي المجموعات للمشاركين الحاليين أولاً")
  }
  const seen = new Set()
  for (const row of baseline) {
    const key = `${row.round}:${row.participant_id}`
    if (![1, 2].includes(row.round) || !Number.isInteger(row.table_number) || row.table_number < 1 || row.table_number > 99 || !numbers.has(row.participant_id) || seen.has(key)) {
      throw fail("خطة الجلسات غير مكتملة؛ حدّث الجلسات أولاً")
    }
    seen.add(key)
  }
  const baseMetrics = seatingMetrics(baseline, participants, scores)
  const basePairs = pairCounts(baseline)
  const protectedKeys = [...new Set(protectedPairs.map(([a, b]) => pairKey(a, b)))]
  const tableOf = new Map(baseline.map(r => [`${r.round}:${r.participant_id}`, r.table_number]))
  const eligible = []
  for (let i = 0; i < participants.length; i++) for (let j = i + 1; j < participants.length; j++) {
    const a = participants[i], b = participants[j]
    if (a.gender === "unknown" || a.gender !== b.gender) continue
    if (a.age && b.age && Math.abs(a.age - b.age) > 8) continue
    if ([1, 2].every(round => tableOf.get(`${round}:${a.number}`) === tableOf.get(`${round}:${b.number}`))) continue
    eligible.push([a.number, b.number])
  }
  const candidates = new Map()
  const baselineKey = JSON.stringify(baseline)
  for (let attempt = 0; attempt < attempts && eligible.length; attempt++) {
    const mapping = new Map(), used = new Set()
    const target = 1 + Math.floor(random() * Math.min(5, Math.floor(participants.length / 2)))
    for (let pick = 0; pick < target * 12 && mapping.size < target * 2; pick++) {
      const [a, b] = eligible[Math.floor(random() * eligible.length)]
      if (used.has(a) || used.has(b)) continue
      mapping.set(a, b); mapping.set(b, a); used.add(a); used.add(b)
    }
    const plan = canonicalSeating(baseline.map(row => ({ ...row, participant_id: mapping.get(row.participant_id) || row.participant_id })))
    const key = JSON.stringify(plan)
    if (key === baselineKey || candidates.has(key)) continue
    if ([1, 2].some(round => plan.filter(r => r.round === round).every(r => tableOf.get(`${round}:${r.participant_id}`) === r.table_number))) continue
    const pairs = pairCounts(plan)
    if (protectedKeys.some(pair => (pairs.get(pair) || 0) > (basePairs.get(pair) || 0))) continue
    if ([...pairs].every(([pair, count]) => basePairs.get(pair) === count)) continue
    const metrics = seatingMetrics(plan, participants, scores, baseline)
    // Keep age clustering close; compare cached scores only with similar coverage.
    if (metrics.rms_age_gap != null && metrics.rms_age_gap > baseMetrics.rms_age_gap + 0.5) continue
    if (metrics.scored_pairs < baseMetrics.scored_pairs * 0.975) continue
    if (metrics.compatibility != null && baseMetrics.compatibility != null && metrics.compatibility < baseMetrics.compatibility - 2) continue
    const cost = (metrics.rms_age_gap || 0) - (metrics.compatibility || 0) / 10
    candidates.set(key, { assignments: plan, metrics, cost })
  }
  const sorted = [...candidates.values()].sort((a, b) => a.cost - b.cost)
  const chosen = []
  // Prefer genuinely different options, not three nearly identical swaps.
  for (const candidate of sorted) {
    if (chosen.some(other => candidate.assignments.filter((row, i) => row.table_number !== other.assignments[i].table_number).length < 4)) continue
    chosen.push(candidate)
    if (chosen.length === 3) break
  }
  return { current: { assignments: baseline, metrics: baseMetrics }, alternatives: chosen.map(({ cost, ...plan }) => plan) }
}

export function signSeatingPreview(payload, secret, now = Date.now()) {
  if (!secret) throw fail("خدمة بدائل الجلسات غير متاحة حالياً", 503)
  const encoded = Buffer.from(JSON.stringify({ ...payload, purpose: PURPOSE, expires_at: now + TTL })).toString("base64url")
  return `${encoded}.${createHmac("sha256", secret).update(encoded).digest("base64url")}`
}

export function readSeatingPreview(token, secret, now = Date.now()) {
  try {
    if (!secret || typeof token !== "string" || token.length > 150_000) throw new Error()
    const [encoded, signature, extra] = token.split(".")
    if (extra || !encoded || !signature) throw new Error()
    const expected = createHmac("sha256", secret).update(encoded).digest()
    const actual = Buffer.from(signature, "base64url")
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error()
    const data = JSON.parse(Buffer.from(encoded, "base64url").toString())
    if (data.purpose !== PURPOSE || !Number.isFinite(data.expires_at) || data.expires_at <= now) throw new Error()
    return data
  } catch { throw fail("انتهت صلاحية هذا البديل أو تغيّر؛ اطلب بدائل جديدة") }
}

async function checked(query) {
  const { data, error } = await query
  if (error) throw fail("تعذّر تحميل بيانات الجلسات؛ حاول مجدداً", 503)
  return data
}

async function loadContext(db, eventId) {
  const [state, roster, assignments, locks, exclusions] = await Promise.all([
    checked(db.from("event_state").select("current_event_id,phase,global_timer_active,groups_locked,test_mode_active,test_mode_snapshot").eq("match_id", EVENT3).single()),
    checked(db.from("event3_participants").select("participant_number").eq("match_id", EVENT3).eq("event_id", eventId).order("participant_number")),
    checked(db.from("session_assignments").select("round,table_number,participant_id").eq("match_id", EVENT3).eq("event_id", eventId).in("round", [1, 2])),
    checked(db.from("locked_matches").select("participant1_number,participant2_number").eq("match_id", MAIN).eq("event_id", eventId)),
    checked(db.from("event3_exclusions").select("participant_a_number,participant_b_number").eq("match_id", EVENT3).eq("event_id", eventId)),
  ])
  if (!state || Number(state.current_event_id) !== Number(eventId)) throw fail("تغيّرت الفعالية؛ حدّث الصفحة")
  if (state.phase !== "setup" || state.global_timer_active || state.groups_locked) throw fail("يمكن تغيير خطة الجولتين قبل بدء جلسات المجموعات فقط")
  const numbers = (roster || []).map(r => Number(r.participant_number))
  if (numbers.length < 4) throw fail("اختر المشاركين وولّد الجلسات أولاً")
  const profiles = await checked(db.from("participants").select("*").eq("match_id", MAIN).in("assigned_number", numbers).order("assigned_number"))
  if (profiles.length !== numbers.length) throw fail("بيانات المشاركين غير مكتملة")
  const participants = profiles.map(p => {
    let sd = p.survey_data || {}
    if (typeof sd === "string") { try { sd = JSON.parse(sd) } catch { sd = {} } }
    const age = Number(p.age || sd?.answers?.age || sd?.age)
    return { number: Number(p.assigned_number), name: String(p.name || sd?.answers?.name || sd?.name || `#${p.assigned_number}`), gender: seatingGender(p.gender || sd?.answers?.gender || sd?.gender), age: age > 0 && age < 120 ? age : null }
  })
  const protectedPairs = [...(locks || []).map(p => [p.participant1_number, p.participant2_number]), ...(exclusions || []).map(p => [p.participant_a_number, p.participant_b_number])]
  const testMode = state.test_mode_active === true
  const sessionKey = testMode ? state.test_mode_snapshot?.started_at || "legacy-test" : "live"
  const contextHash = createHash("sha256").update(JSON.stringify({ eventId, testMode, sessionKey, numbers, profiles: profiles.map(p => [p.assigned_number, p.gender, p.age, p.survey_data, p.survey_data_updated_at]), protectedPairs: protectedPairs.map(([a, b]) => pairKey(a, b)).sort() })).digest("hex")
  return { participants, profiles, assignments: canonicalSeating(assignments || []), protectedPairs, contextHash, testMode, sessionKey }
}

export async function handleSeatingAlternatives({ db, action, body, eventId, secret, loadScores }) {
  if (body.preview_event_id != null || Number(body.expected_event_id) !== Number(eventId)) throw fail("البدائل متاحة للفعالية الحالية فقط؛ حدّث الصفحة")
  const applying = action === "e3-apply-seating-alternative"
  const preview = applying ? readSeatingPreview(body.token, secret) : null
  const context = await loadContext(db, eventId)
  if (body.expected_test_mode !== context.testMode) throw fail("تغيّر وضع التجربة؛ حدّث الصفحة")
  if (applying) {
    if (preview.event_id !== eventId || preview.test_mode !== context.testMode || preview.session_key !== context.sessionKey || preview.context_hash !== context.contextHash) {
      throw fail("تغيّرت بيانات الفعالية منذ المعاينة؛ اطلب بدائل جديدة")
    }
    const { data, error } = await db.rpc("apply_event3_seating_alternative", {
      p_match_id: EVENT3, p_event_id: eventId, p_test_mode: context.testMode, p_session_key: context.sessionKey,
      p_expected: preview.baseline, p_proposed: preview.assignments,
    })
    if (error) {
      if (error.code === "PGRST202") throw fail("تحديث بدائل الجلسات غير متاح على الخادم بعد", 503)
      throw fail("لم يُطبّق البديل: تغيّرت الجلسات أو بدأت الفعالية أو وُجدت تقييمات محفوظة. حدّث الصفحة واطلب بدائل جديدة")
    }
    return { ...data, message: "تم تطبيق البديل على الجولتين" }
  }
  const scores = await loadScores(context.profiles)
  const result = buildSeatingAlternatives({ ...context, scores })
  return {
    current: result.current, participants: context.participants, expires_at: Date.now() + TTL,
    alternatives: result.alternatives.map(plan => ({ ...plan, token: signSeatingPreview({
      event_id: eventId, test_mode: context.testMode, session_key: context.sessionKey, context_hash: context.contextHash,
      baseline: context.assignments, assignments: plan.assignments,
    }, secret) })),
  }
}
