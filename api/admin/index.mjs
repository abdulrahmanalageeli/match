import OpenAI from "openai"
import { createHmac, timingSafeEqual } from "node:crypto"
import { calculateFullCompatibilityWithCache, getCachedCompatibility, isParticipantComplete, checkGenderCompatibility, checkNationalityHardGate, checkAgeRangeHardGate, checkAgeCompatibility, checkIntentHardGate, fetchAllCachedPairs, calculateHumorOpennessScore, isCurrentVibeModel, getParticipantDeltaCacheReason } from "./trigger-match.mjs"
import { buildWelcomePrompt } from "./ai-welcome-prompt.mjs"
import { assignPriorityTables } from "../../server/event3/table-priority.mjs"
import { buildSixBySevenPlan, optimizeRound2ByAge } from "../../server/event3/round2-age-optimizer.mjs"
import { collectEventSwapPairs, collectMatchResultSwapPairs, getTableSwapRounds } from "../../server/event3/participant-swap.mjs"
import { buildTestAdminSession, testMatchToLockedMatch } from "../../server/event3/test-match-results.mjs"
import { buildDislikeLeaderboard } from "../../server/event3/dislike-ranking.mjs"
import { buildGroupReflectionLeaderboard } from "../../server/event3/group-reflection.mjs"
import { supabaseAdmin } from "../../server/security/supabase-admin.mjs"
import { clearAdminSession, enforceRateLimit, requireAdmin } from "../../server/security/request-security.mjs"

const supabase = supabaseAdmin

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const STATIC_MATCH_ID = "00000000-0000-0000-0000-000000000000"
const TWILIO_MATCH_NOTIFICATION_V2_SID = "HX6d318d6310d7cce0c37b1ef5e0b7a17e"
const TWILIO_MATCH_CANCELLATION_SID = "HX466c880e6809cefe45123a5c02d49a61"
const TWILIO_SURVEY_UPDATE_SID = "HX29303de3e62bac314552ee3056578c4f"
const TWILIO_STATUS_CALLBACK_URL = process.env.TWILIO_STATUS_CALLBACK_URL || "https://blindmatch.app/api/twilio-status"

const ARABIC_WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]
const ARABIC_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]

function formatRiyadhCutoffLabel(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  if (!match) return ""
  const [, yearText, monthText, dayText, hourText, minute] = match
  const year = Number(yearText), month = Number(monthText), day = Number(dayText), hour = Number(hourText)
  const weekday = ARABIC_WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
  return `${weekday} ${day} ${ARABIC_MONTHS[month - 1]} ${year} الساعة ${hour % 12 || 12}:${minute} ${hour < 12 ? "صباحًا" : "مساءً"}`
}

function formatRiyadhDeadline(minutes = 15) {
  return new Intl.DateTimeFormat("ar-SA", {
    timeZone: "Asia/Riyadh",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(Date.now() + minutes * 60 * 1000))
}

function normalizeTwilioTemplateVariables(templateKey, variables) {
  if (templateKey === "seat_payment_deadline") {
    return { ...(variables && typeof variables === "object" ? variables : {}), 2: formatRiyadhDeadline(15) }
  }
  if (!variables || typeof variables !== "object") return variables
  // Legacy payment-reminder clients included a non-template "savings" value
  // at {{5}}, shifting all payment details. Normalize those payloads at the
  // server boundary so cached admin tabs cannot send the incorrect mapping.
  if (templateKey === "payment" && variables[8] !== undefined) {
    return {
      1: variables[1],
      2: variables[2],
      3: formatRiyadhCutoffLabel(variables[3]) || variables[3],
      4: variables[4],
      5: variables[6],
      6: variables[7],
      7: variables[8],
    }
  }
  if (templateKey === "payment") return { ...variables, 3: formatRiyadhCutoffLabel(variables[3]) || variables[3] }
  return variables
}

async function getCurrentAdminEventId() {
  const { data, error } = await supabase
    .from("event_state")
    .select("current_event_id")
    .eq("match_id", STATIC_MATCH_ID)
    .maybeSingle()
  if (error) throw error
  return Number(data?.current_event_id || 1)
}

function isMissingSwapRpc(error) {
  const message = `${error?.message || ""} ${error?.details || ""}`.toLowerCase()
  return error?.code === "PGRST202" || message.includes("apply_match_swap_plan") || message.includes("undo_match_swap_plan")
}

async function getEvent3TestContext() {
  const { data, error } = await supabase
    .from("event_state")
    .select("test_mode_active,current_event_id")
    .eq("match_id", EVENT3_MATCH_ID)
    .maybeSingle()
  if (error) throw error
  return {
    active: data?.test_mode_active === true,
    eventId: Number(data?.current_event_id || 0),
  }
}

async function getEvent3TestMatchRows(eventId) {
  const { data, error } = await supabase
    .from("event3_test_match_results")
    .select("*")
    .eq("match_id", EVENT3_MATCH_ID)
    .eq("event_id", Number(eventId))
    .order("table_number", { ascending: true })
    .order("created_at", { ascending: true })
  if (error) throw error
  return data || []
}

async function getActiveEvent3TestSession(requestedEventId) {
  const context = await getEvent3TestContext()
  const eventId = Number(requestedEventId || context.eventId)
  if (!context.active || !context.eventId || eventId !== context.eventId) return null
  const rows = await getEvent3TestMatchRows(eventId)
  return buildTestAdminSession(rows, eventId, STATIC_MATCH_ID)
}

function isMissingAdmin3SwapRpc(error) {
  const message = `${error?.message || ""} ${error?.details || ""}`.toLowerCase()
  return error?.code === "PGRST202"
    || message.includes("swap_event3_group_seats")
    || message.includes("swap_event3_table_numbers")
    || message.includes("replace_event3_participant")
}

function normalizeSwapPairs(value) {
  if (!Array.isArray(value)) return null
  const pairs = value.map(pair => ({ a: Number(pair?.a), b: Number(pair?.b) }))
  const used = new Set()
  for (const pair of pairs) {
    if (!Number.isInteger(pair.a) || !Number.isInteger(pair.b) || pair.a <= 0 || pair.b <= 0 || pair.a === pair.b) return null
    if (used.has(pair.a) || used.has(pair.b)) return null
    used.add(pair.a)
    used.add(pair.b)
  }
  return pairs
}

function swapReason(compatibility) {
  const coreValuesScaled5 = compatibility.coreValuesScaled5 != null
    ? Number(compatibility.coreValuesScaled5)
    : Math.max(0, Math.min(5, (Number(compatibility.coreValuesScore || 0) / 20) * 5))
  return `Synergy: ${Math.round(Number(compatibility.synergyScore || 0))}% + ` +
    `Vibe: ${Math.round(Number(compatibility.vibeScore || 0))}% + ` +
    `Lifestyle: ${Math.round(Number(compatibility.lifestyleScore || 0))}% + ` +
    `Humor/Openness: ${Math.round(Number(compatibility.humorOpenScore || 0))}% + ` +
    `Communication: ${Math.round(Number(compatibility.communicationScore || 0))}% + ` +
    `Core Values: ${Math.round(coreValuesScaled5)}%` +
    (compatibility.attachmentPenaltyApplied ? " - Penalty(Anx x Avoid)" : "") +
    (compatibility.opennessZeroZeroPenaltyApplied ? " - Penalty(Opn 0 x 0)" : "") +
    (compatibility.intentBoostApplied ? " x IntentBoost(1.05)" : "") +
    (compatibility.capApplied ? ` (capped @ ${compatibility.capApplied}%)` : "")
}

function compatibilityResultPayload(compatibility) {
  const humorMultiplier = Number(compatibility.humorMultiplier || 1)
  return {
    compatibility_score: Math.round(Number(compatibility.totalScore || 0)),
    reason: swapReason(compatibility),
    mbti_compatibility_score: Number(compatibility.mbtiScore || 0),
    attachment_compatibility_score: Number(compatibility.attachmentScore || 0),
    communication_compatibility_score: Number(compatibility.communicationScore || 0),
    lifestyle_compatibility_score: Number(compatibility.lifestyleScore || 0),
    core_values_compatibility_score: Number(compatibility.coreValuesScore || 0),
    vibe_compatibility_score: Number(compatibility.vibeScore || 0),
    synergy_score: Number(compatibility.synergyScore || 0),
    humor_open_score: Number(compatibility.humorOpenScore || 0),
    intent_score: Number(compatibility.intentScore || 0),
    humor_multiplier: humorMultiplier,
    attachment_penalty_applied: !!compatibility.attachmentPenaltyApplied,
    intent_boost_applied: !!compatibility.intentBoostApplied,
    dead_air_veto_applied: !!compatibility.deadAirVetoApplied,
    humor_clash_veto_applied: !!compatibility.humorClashVetoApplied,
    cap_applied: compatibility.capApplied ?? null,
    humor_early_openness_bonus: humorMultiplier === 1.15 ? "full" : humorMultiplier === 1.05 ? "partial" : "none",
  }
}

function swapPairKey(a, b) {
  return Number(a) < Number(b) ? `${Number(a)}-${Number(b)}` : `${Number(b)}-${Number(a)}`
}

function isSwapParticipantPaid(participant, eventId) {
  return participant?.PAID_DONE === true
    && Number(participant?.payment_completed_event_id) === Number(eventId)
}

async function attachEventReceipts(participants, eventId) {
  const { data: receipts, error } = await supabase
    .from("participant_receipts")
    .select("id,participant_id,event_id,storage_path,status,received_at,reviewed_at,rejection_reason")
    .eq("event_id", eventId)
    .order("received_at", { ascending: false })
    .limit(10000)
  if (error) throw error

  const latestByParticipant = new Map()
  for (const receipt of receipts || []) {
    if (!latestByParticipant.has(receipt.participant_id)) latestByParticipant.set(receipt.participant_id, receipt)
  }

  const signedUrls = new Map()
  await Promise.all((receipts || []).map(async receipt => {
    if (!receipt.storage_path) return
    const { data } = await supabase.storage.from("receipts").createSignedUrl(receipt.storage_path, 600)
    if (data?.signedUrl) signedUrls.set(receipt.id, data.signedUrl)
  }))

  return participants.map(participant => {
    const receipt = latestByParticipant.get(participant.id)
    return {
      ...participant,
      receipt_id: receipt?.id || null,
      receipt_event_id: receipt?.event_id || null,
      receipt_url: receipt ? signedUrls.get(receipt.id) || null : null,
      receipt_received_at: receipt?.received_at || null,
      receipt_approved: receipt?.status === "approved",
      receipt_approved_at: receipt?.status === "approved" ? receipt.reviewed_at : null,
      receipt_rejected: receipt?.status === "rejected",
      receipt_rejected_at: receipt?.status === "rejected" ? receipt.reviewed_at : null,
      receipt_rejection_reason: receipt?.rejection_reason || null,
    }
  })
}

async function findEventReceipt(participantId, { receiptId, eventId } = {}) {
  let query = supabase
    .from("participant_receipts")
    .select("*")
    .eq("participant_id", participantId)

  if (receiptId) query = query.eq("id", receiptId)
  else query = query.eq("event_id", Number(eventId || await getCurrentAdminEventId()))

  const { data, error } = await query.order("received_at", { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data
}

async function editableTwilioResponse(actionKey, fallback, variables = {}) {
  const { data } = await supabase.from("twilio_response_rules").select("response_text,enabled").eq("action_key", actionKey).maybeSingle()
  if (data?.enabled === false) return ""
  const rendered = Object.entries(variables).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value ?? "")), String(data?.response_text || fallback || "")).trim()
  if (!rendered) return ""
  const signature = "— *فريق التوافق الأعمى* 🤍"
  return rendered.includes("*فريق التوافق الأعمى*") ? rendered : `${rendered}\n\n${signature}`
}

async function getAdminWhatsappConfig() {
  const { data } = await supabase.from("event_state").select("whatsapp_config").eq("match_id", STATIC_MATCH_ID).maybeSingle()
  const config = {
    earlyPrice: 60,
    latePrice: 75,
    paymentCutoffLocal: "",
    stcPay: "0560899666",
    bankName: "مصرف الراجحي: عبدالرحمن عبدالملك",
    iban: "SA2480000588608016007502",
    eventDateText: "",
    eventTimeText: "",
    arrivalTimeText: "",
    locationName: "",
    mapUrl: "",
    tutorialUrl: "https://blindmatch.app/event3",
    ...(data?.whatsapp_config || {}),
  }
  return { ...config, latePriceSwitchLabel: formatRiyadhCutoffLabel(config.paymentCutoffLocal) || config.latePriceSwitchLabel || "الموعد المحدد" }
}

async function buildFinalConfirmationMessage(participant, config, paymentWaived = false) {
  const base = String(config.tutorialUrl || "https://blindmatch.app/event3").trim()
  const tutorialUrl = `${base}${base.includes("?") ? "&" : "?"}token=${encodeURIComponent(participant.secure_token || "")}`
  const intro = paymentWaived
    ? await editableTwilioResponse("seat_waived_admin", "✅ تم تأكيد مقعدك من المنظم بدون الحاجة إلى دفع.")
    : await editableTwilioResponse("receipt_approved", "✅ تم تأكيد استلام الإيصال والموافقة عليه! حجزك مؤكد للفعالية.")
  const details = await editableTwilioResponse("final_event_details", "📘 *شرح الفعالية قبل الحضور:*\n{tutorial_url}\n\n📍 *المكان:* {location}\n🗺️ {map_url}\n📅 *التاريخ:* {event_date}\n🕰️ *الوقت:* {event_time}{arrival_suffix}\n\nيرجى قراءة الشرح قبل الوصول. نراك هناك! 🤍", {
    tutorial_url: tutorialUrl,
    location: config.locationName || "سيتم إرساله قريباً",
    map_url: config.mapUrl || "",
    event_date: config.eventDateText || "سيتم إرساله قريباً",
    event_time: config.eventTimeText || "سيتم إرساله قريباً",
    arrival_suffix: config.arrivalTimeText ? ` (الحضور ${config.arrivalTimeText})` : "",
  })
  const signature = "— *فريق التوافق الأعمى* 🤍"
  const withoutSignature = value => String(value || "").replace(/\n\n— \*فريق التوافق الأعمى\* 🤍\s*$/u, "").trim()
  return `${withoutSignature(intro)}\n\n${withoutSignature(details)}\n\n${signature}`
}

async function sendAdminWhatsappMessage(participant, message) {
  if (!participant.phone_number) return { sent: false, error: "Participant has no phone number" }
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) return { sent: false, error: "Twilio credentials are not configured" }
  const sender = process.env.TWILIO_WHATSAPP_SENDER || "whatsapp:+13527387477"
  const to = String(participant.phone_number).replace(/\s/g, "").replace(/^(?!whatsapp:)/, "whatsapp:")
  if (!String(message || "").trim()) return { sent: false, error: "The configured confirmation response is disabled" }
  const body = new URLSearchParams({ From: sender, To: to, Body: message })
  body.append("StatusCallback", TWILIO_STATUS_CALLBACK_URL)
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: { "Authorization": "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })
  const result = await response.json()
  await supabase.from("whatsapp_messages").insert({
    participant_id: participant.id,
    assigned_number: participant.assigned_number,
    phone_number: to,
    direction: "outbound",
    message_body: message,
    twilio_message_sid: result?.sid || null,
    status: result?.status || (response.ok ? "sent" : "failed"),
    status_updated_at: new Date().toISOString(),
    error_code: result?.code ? String(result.code) : null,
    error_message: response.ok ? null : (result?.message || `Twilio returned ${response.status}`),
    twilio_payload: result || {},
    is_auto_reply: false,
  })
  return response.ok ? { sent: true, error: null } : { sent: false, error: result?.message || `Twilio returned ${response.status}` }
}

async function sendFinalConfirmation(participant, paymentWaived = false) {
  const message = await buildFinalConfirmationMessage(participant, await getAdminWhatsappConfig(), paymentWaived)
  return sendAdminWhatsappMessage(participant, message)
}

// ── Event 4.0 constants & helpers ─────────────────────────────────────────────
const EVENT3_MATCH_ID = "00000000-0000-0000-0000-000000000003"
const EVENT3_PASSWORD = process.env.EVENT3_PASSWORD || ""
const EVENT3_COHOST_PASSWORD = process.env.EVENT3_COHOST_PASSWORD || ""
const EVENT3_COHOST_TOKEN_TTL_SECONDS = 8 * 60 * 60
const EVENT3_COHOST_ACTIONS = new Set([
  "e3-cohost-dashboard",
  "e3-cohost-set-attendance",
  "e3-cohost-resolve-sos",
  "e3-cohost-reply-sos",
])
const E3_LATIN_SQUARE = [[0,1,2,3,4,5],[2,3,4,5,0,1],[4,5,0,1,2,3],[1,0,3,2,5,4],[3,2,5,4,1,0],[5,4,1,0,3,2]]

function safeSecretEqual(received, expected) {
  const left = Buffer.from(String(received || ""))
  const right = Buffer.from(String(expected || ""))
  return left.length === right.length && timingSafeEqual(left, right)
}

function cohostTokenSecret() {
  return process.env.EVENT3_COHOST_TOKEN_SECRET || ""
}

function signCohostToken() {
  if (!cohostTokenSecret()) throw new Error("EVENT3_COHOST_TOKEN_SECRET is not configured")
  const payload = Buffer.from(JSON.stringify({ role: "event3_cohost", exp: Math.floor(Date.now() / 1000) + EVENT3_COHOST_TOKEN_TTL_SECONDS })).toString("base64url")
  const signature = createHmac("sha256", cohostTokenSecret()).update(payload).digest("base64url")
  return `${payload}.${signature}`
}

function verifyCohostToken(token) {
  try {
    const [payload, signature, extra] = String(token || "").split(".")
    if (!payload || !signature || extra) return false
    const expected = createHmac("sha256", cohostTokenSecret()).update(payload).digest("base64url")
    if (!safeSecretEqual(signature, expected)) return false
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    return claims?.role === "event3_cohost" && Number(claims.exp) > Math.floor(Date.now() / 1000)
  } catch {
    return false
  }
}

function e3GenerateSeatingPlan(participantNumbers, genderMap = {}, lockedPairsSet = new Set(), ageMap = {}) {
  const N = participantNumbers.length
  const sixBySeven = buildSixBySevenPlan(participantNumbers, genderMap)
  if (sixBySeven) {
    const round2 = optimizeRound2ByAge(sixBySeven.round1, sixBySeven.round2, genderMap, ageMap)
    const positionMap = {}
    sixBySeven.round1.flat().forEach((number, index) => { positionMap[number] = index })
    return { round1: sixBySeven.round1, round2, T: 6, G: 7, R: 0, positionMap }
  }
  // Pick target group size G and number of groups T.
  // Priority: 6 > 5 > 4 > 8.
  // Allow uneven groups (some with G+1) when N is not perfectly divisible by G.
  // Constraint: G ≤ T (for modular shift to guarantee zero repeat encounters).
  let G = null, T = null
  for (const g of [6, 5, 4, 8]) {
    const t = Math.floor(N / g)
    if (t >= g) { G = g; T = t; break }
  }
  if (!G) {
    const suggestions = []
    for (let n = Math.max(4, N - 8); n <= N + 8; n++) {
      for (const g of [6, 5, 4, 8]) {
        const t = Math.floor(n / g)
        if (t >= g) suggestions.push(n)
      }
    }
    return { error: `عدد المشاركين (${N}) لا يمكن تقسيمه على مجموعات (حد أدنى 4). جرّب: ${[...new Set(suggestions)].sort((a,b)=>a-b).join("، ")}` }
  }
  const R = N - T * G // remainder: R groups will have G+1 people

  // ── Interleave by gender so each group gets balanced M/F ──────────────
  const males = participantNumbers.filter(n => (genderMap[n] || '').toLowerCase() !== 'female')
  const females = participantNumbers.filter(n => (genderMap[n] || '').toLowerCase() === 'female')
  const interleaved = []
  let mi = 0, fi = 0
  for (let i = 0; i < N; i++) {
    if (i % 2 === 0) {
      if (mi < males.length) interleaved.push(males[mi++])
      else interleaved.push(females[fi++])
    } else {
      if (fi < females.length) interleaved.push(females[fi++])
      else interleaved.push(males[mi++])
    }
  }

  // ── Build T×G grid from first T*G people; remaining R are "extras" ────
  const grid = Array.from({ length: T }, (_, t) =>
    Array.from({ length: G }, (_, g) => interleaved[t * G + g])
  )
  const extras = interleaved.slice(T * G)

  // Round 1: grid rows + extras assigned to first R groups
  const round1 = grid.map(row => [...row])
  for (let i = 0; i < R; i++) round1[i].push(extras[i])

  // Round 2: modular shift on grid part (guarantees zero repeat encounters
  // for grid members since G ≤ T). Extras are placed in different groups
  // within the same set of larger tables so the chair layout remains unchanged.
  const round2 = Array.from({ length: T }, () => Array(G).fill(null))
  for (let t = 0; t < T; t++) {
    for (let g = 0; g < G; g++) {
      const newGroup = (t + g) % T
      const slot = round2[newGroup].indexOf(null)
      if (slot !== -1) round2[newGroup][slot] = grid[t][g]
    }
  }
  // Place extras in round 2 while preserving the same physical table capacities.
  // Round 1 tables 0..R-1 have G+1 chairs, so those exact tables must also
  // receive one extra in Round 2. Within that fixed capacity set, choose the
  // placement that minimizes repeat encounters.
  // For extra i (was in round 1 group i), round 2 groups (i+g)%T for g=0..G-1 contain grid[i][g].
  // Those are "forbidden" (would cause a repeat). Prefer an allowed destination
  // among tables 0..R-1; otherwise preserve capacity and accept the lowest repeat cost.
  // When G === T, every group is forbidden (1 repeat unavoidable) — just spread extras apart.
  const placedExtras = new Set()
  for (let i = 0; i < R; i++) {
    const forbidden = new Set()
    for (let g = 0; g < G; g++) forbidden.add((i + g) % T)
    const availableCapacityTables = Array.from({ length: R }, (_, table) => table)
      .filter(table => !placedExtras.has(table))
    availableCapacityTables.sort((a, b) => {
      const scoreA = (forbidden.has(a) ? 10 : 0) + (a === i ? 2 : 0)
      const scoreB = (forbidden.has(b) ? 10 : 0) + (b === i ? 2 : 0)
      return scoreA - scoreB || a - b
    })
    const bestGroup = availableCapacityTables[0] ?? i
    placedExtras.add(bestGroup)
    round2[bestGroup].push(extras[i])
  }

  const ageOptimizedRound2 = optimizeRound2ByAge(round1, round2, genderMap, ageMap)

  const positionMap = {}
  for (let i = 0; i < N; i++) positionMap[interleaved[i]] = i
  return { round1, round2: ageOptimizedRound2, T, G, R, positionMap }
}

function e3GreedyMutualMatching(rankings, participantMap = new Map(), exclusions = new Set()) {
  const isExcluded = (a, b) => {
    const [x, y] = [a, b].sort((p, q) => p - q)
    return exclusions.has(`${x}-${y}`)
  }
  const unmatched = new Set(rankings.keys()), matches = new Map(), list = Array.from(rankings.keys()), pairs = []
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const pi = list[i], pj = list[j]
    if (isExcluded(pi, pj)) continue
    const ri = (rankings.get(pi) || []).indexOf(pj), rj = (rankings.get(pj) || []).indexOf(pi)
    if (ri !== -1 && rj !== -1) {
      const pA = participantMap.get(pi), pB = participantMap.get(pj)
      const oppGender = pA && pB && pA.gender && pB.gender && pA.gender !== pB.gender ? 1 : 0
      const lambda = 0.5
      pairs.push({ a: pi, b: pj, score: ri + rj + lambda * Math.abs(ri - rj), oppGender })
    }
  }
  pairs.sort((a, b) => a.score - b.score || b.oppGender - a.oppGender)
  for (const { a, b } of pairs) {
    if (unmatched.has(a) && unmatched.has(b)) { matches.set(a, b); matches.set(b, a); unmatched.delete(a); unmatched.delete(b) }
    if (unmatched.size === 0) break
  }
  const rest = Array.from(unmatched)
  let i = 0
  while (i < rest.length) {
    const a = rest[i]
    let paired = false
    for (let j = i + 1; j < rest.length; j++) {
      const b = rest[j]
      if (!isExcluded(a, b)) {
        matches.set(a, b); matches.set(b, a)
        rest.splice(j, 1)
        paired = true
        break
      }
    }
    i++
  }
  return matches
}

// e3IsComplete and e3FullCalcCompat are now the real functions imported from trigger-match.mjs
const e3IsComplete = isParticipantComplete

// ── Random pairing for test mode ──────────────────────────────────────────
// Pairs participants randomly (M-F), optionally avoiding pairs from a previous phase.
// Returns a Map<number, number> (same shape as e3GreedyMutualMatching output).
function e3RandomPairMatching(participantNumbers, genderMap = {}, avoidPairs = new Set()) {
  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]] } return arr }
  const males = shuffle(participantNumbers.filter(n => (genderMap[n] || '').toLowerCase().startsWith('m')))
  const females = shuffle(participantNumbers.filter(n => (genderMap[n] || '').toLowerCase().startsWith('f')))
  const matches = new Map()
  const used = new Set()
  const pairs = []

  // Greedily pair M-F avoiding previous pairs
  for (const m of males) {
    if (used.has(m)) continue
    let bestF = null
    for (const f of females) {
      if (used.has(f)) continue
      const key = m < f ? `${m}-${f}` : `${f}-${m}`
      if (avoidPairs.has(key)) continue // skip previous-phase pair
      bestF = f
      break
    }
    if (bestF == null) {
      // No non-avoided F available — take any remaining F
      bestF = females.find(f => !used.has(f)) || null
    }
    if (bestF != null) {
      matches.set(m, bestF); matches.set(bestF, m)
      used.add(m); used.add(bestF)
      pairs.push({ a: m, b: bestF })
    }
  }

  // Handle leftover participants (same-gender or odd count)
  const leftover = participantNumbers.filter(n => !used.has(n))
  shuffle(leftover)
  for (let i = 0; i + 1 < leftover.length; i += 2) {
    matches.set(leftover[i], leftover[i + 1]); matches.set(leftover[i + 1], leftover[i])
    used.add(leftover[i]); used.add(leftover[i + 1])
    pairs.push({ a: leftover[i], b: leftover[i + 1] })
  }

  return { matches, pairs, used }
}
const e3FullCalcCompat = async (pA, pB) => {
  const r = await getCachedCompatibility(pA, pB, { skipUsageUpdate: true })
  if (!r) return null
  return {
    totalScore: Math.round(r.totalScore),
    mbtiScore: r.mbtiScore,
    attachmentScore: r.attachmentScore,
    synergyScore: r.synergyScore,
    lifestyleScore: r.lifestyleScore,
    communicationScore: r.communicationScore,
    coreValuesScore: r.coreValuesScore,
    coreValuesScaled5: r.coreValuesScaled5,
    humorOpenScore: r.humorOpenScore,
    intentScore: r.intentScore,
    vibeScore: r.vibeScore,
    attachmentPenalty: r.attachmentPenaltyApplied,
    attachmentPenaltyApplied: r.attachmentPenaltyApplied,
    opennessZeroZero: r.opennessZeroZeroPenaltyApplied,
    opennessZeroZeroPenaltyApplied: r.opennessZeroZeroPenaltyApplied,
    deadAirVeto: r.deadAirVetoApplied,
    deadAirVetoApplied: r.deadAirVetoApplied,
    humorClashVeto: r.humorClashVetoApplied,
    humorClashVetoApplied: r.humorClashVetoApplied,
    intentBoost: r.intentBoostApplied,
    intentBoostApplied: r.intentBoostApplied,
    humorMultiplier: r.humorMultiplier,
    capApplied: r.capApplied,
  }
}

async function refreshEvent3TestMatchResults(eventId) {
  const context = await getEvent3TestContext()
  if (!context.active || context.eventId !== Number(eventId)) return 0

  const [
    { data: matchRows, error: matchError },
    { data: tableRows, error: tableError },
    { data: existingRows, error: existingError },
  ] = await Promise.all([
    supabase.from("event3_matches")
      .select("participant_number,phase3_partner,phase3_score")
      .eq("match_id", EVENT3_MATCH_ID)
      .eq("event_id", eventId)
      .not("phase3_partner", "is", null),
    supabase.from("session_assignments")
      .select("participant_id,table_number")
      .eq("match_id", EVENT3_MATCH_ID)
      .eq("event_id", eventId)
      .eq("round", 30),
    supabase.from("event3_test_match_results")
      .select("*")
      .eq("match_id", EVENT3_MATCH_ID)
      .eq("event_id", eventId),
  ])
  if (matchError) throw matchError
  if (tableError) throw tableError
  if (existingError) throw existingError

  const seen = new Set()
  const pairs = []
  for (const row of matchRows || []) {
    const a = Number(row.participant_number)
    const b = Number(row.phase3_partner)
    const key = swapPairKey(a, b)
    if (!Number.isInteger(a) || !Number.isInteger(b) || a <= 0 || b <= 0 || a === b || seen.has(key)) continue
    seen.add(key)
    pairs.push({ a: Math.min(a, b), b: Math.max(a, b), storedScore: Number(row.phase3_score || 0) })
  }

  const participantNumbers = [...new Set(pairs.flatMap(pair => [pair.a, pair.b]))]
  const profileMap = new Map()
  if (participantNumbers.length > 0) {
    const { data: profiles, error: profileError } = await supabase.from("participants")
      .select("assigned_number,name,gender,age,survey_data,mbti_personality_type,attachment_style,communication_style,humor_banter_style,early_openness_comfort")
      .eq("match_id", STATIC_MATCH_ID)
      .in("assigned_number", participantNumbers)
    if (profileError) throw profileError
    for (const profile of profiles || []) {
      try { profile.survey_data = typeof profile.survey_data === "string" ? JSON.parse(profile.survey_data || "{}") : (profile.survey_data || {}) } catch {}
      profileMap.set(Number(profile.assigned_number), profile)
    }
  }

  const tableMap = new Map((tableRows || []).map(row => [Number(row.participant_id), row.table_number]))
  const existingMap = new Map((existingRows || []).map(row => [swapPairKey(row.participant_a_number, row.participant_b_number), row]))
  const testRows = []
  for (const pair of pairs) {
    const existing = existingMap.get(swapPairKey(pair.a, pair.b))
    if (existing) {
      testRows.push({
        ...existing,
        table_number: tableMap.get(pair.a) ?? tableMap.get(pair.b) ?? null,
      })
      continue
    }
    let compatibility = null
    const profileA = profileMap.get(pair.a)
    const profileB = profileMap.get(pair.b)
    if (profileA && profileB) {
      compatibility = await calculateFullCompatibilityWithCache(profileA, profileB, false, false, {
        skipCacheWrite: true,
        skipUsageUpdate: true,
      })
    }
    const compatibilityScore = compatibility?.totalScore ?? pair.storedScore ?? 50
    testRows.push({
      ...(compatibility ? compatibilityResultPayload(compatibility) : {}),
      participant_a_number: pair.a,
      participant_b_number: pair.b,
      compatibility_score: compatibilityScore,
      table_number: tableMap.get(pair.a) ?? tableMap.get(pair.b) ?? null,
      reason: compatibility ? swapReason(compatibility) : "Test mode simulated algorithm lock",
    })
  }

  const { data, error } = await supabase.rpc("replace_event3_test_match_results", {
    p_event_id: Number(eventId),
    p_rows: testRows,
  })
  if (error) throw error
  return Number(data || testRows.length)
}

async function e3BuildPriorityTablePlan(pairs, currentEventId) {
  if (!Array.isArray(pairs) || pairs.length === 0) return []
  const participantNumbers = [...new Set(pairs.flatMap(pair => [Number(pair.a), Number(pair.b)]).filter(Number.isFinite))]
  const [participantResult, attendanceResult, legacyEnrollmentResult] = await Promise.all([
    supabase
      .from("participants")
      .select("assigned_number,age,survey_data")
      .eq("match_id", STATIC_MATCH_ID)
      .in("assigned_number", participantNumbers),
    supabase
      .from("event_attendance")
      .select("participant_number,event_id,attended")
      .eq("match_id", STATIC_MATCH_ID)
      .neq("event_id", currentEventId)
      .in("participant_number", participantNumbers),
    supabase
      .from("event3_participants")
      .select("participant_number,event_id")
      .eq("match_id", EVENT3_MATCH_ID)
      .neq("event_id", currentEventId)
      .in("participant_number", participantNumbers),
  ])
  if (participantResult.error) throw participantResult.error
  if (attendanceResult.error) throw attendanceResult.error
  if (legacyEnrollmentResult.error) throw legacyEnrollmentResult.error
  const participantRows = participantResult.data || []
  const attendanceRows = attendanceResult.data || []

  const profiles = {}
  for (const participant of participantRows || []) {
    let surveyData = participant.survey_data || {}
    try { if (typeof surveyData === "string") surveyData = JSON.parse(surveyData || "{}") } catch { surveyData = {} }
    profiles[participant.assigned_number] = {
      age: participant.age || surveyData?.answers?.age || surveyData?.age || null,
    }
  }

  const attendanceCounts = {}
  const knownAttendanceKeys = new Set()
  const countedEventKeys = new Set()
  for (const row of attendanceRows) {
    const key = `${row.participant_number}:${row.event_id}`
    knownAttendanceKeys.add(key)
    if (!row.attended || countedEventKeys.has(key)) continue
    countedEventKeys.add(key)
    attendanceCounts[row.participant_number] = (attendanceCounts[row.participant_number] || 0) + 1
  }
  // event_attendance was introduced after Event 3 already had history. Use a
  // prior enrollment only when that participant/event has no explicit
  // attendance row, so an explicit no-show is never counted as attendance.
  for (const row of legacyEnrollmentResult.data || []) {
    const key = `${row.participant_number}:${row.event_id}`
    if (knownAttendanceKeys.has(key) || countedEventKeys.has(key)) continue
    countedEventKeys.add(key)
    attendanceCounts[row.participant_number] = (attendanceCounts[row.participant_number] || 0) + 1
  }

  return assignPriorityTables(pairs, profiles, attendanceCounts, {
    maxTableNumber: Number(process.env.EVENT3_MAX_TABLE_NUMBER || 24),
  })
}

export default async function handler(req, res) {
  // Add error logging for debugging
  if (!process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
    console.error("Missing SUPABASE_URL environment variable");
    return res.status(500).json({ error: "Database configuration error - missing SUPABASE_URL" });
  }
  
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
    return res.status(500).json({ error: "Database configuration error" });
  }

  const method = req.method
  const action = req.query.action || req.body?.action

  const bearerToken = String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "")
  const isCohostLogin = action === "e3-cohost-login"
  const isPublicEventRead = action === "get-event-state"
    || action === "get-upcoming-event-summary"
    || action === "get-current-event-id"
    || action === "get-results-visibility"
    || action === "get-group-matches"
  const hasCohostSession = EVENT3_COHOST_ACTIONS.has(action) && verifyCohostToken(bearerToken || req.body?.cohost_token)
  if (isCohostLogin) {
    if (!enforceRateLimit(req, res, { key: "cohost-login", limit: 5, windowMs: 15 * 60_000 })) return
  } else if (isPublicEventRead) {
    if (!enforceRateLimit(req, res, { key: "public-event-state", limit: 120, windowMs: 60_000 })) return
  } else if (hasCohostSession) {
    req.cohostAuth = true
  } else {
    if (!enforceRateLimit(req, res, { key: "admin-api", limit: 180, windowMs: 60_000 })) return
    if (!await requireAdmin(req, res, { action: action || `${method}-admin` })) return
  }

  console.log(`API Request: ${method} ${action}`);

  try {
    if (action === "admin-session") {
      return res.status(200).json({ authenticated: true })
    }

    if (action === "admin-logout") {
      clearAdminSession(res)
      return res.status(200).json({ success: true })
    }
    // 🔹 GET participants
    if (method === "GET") {
      const { data, error } = await supabase
        .from("participants")
        .select("id, assigned_number, table_number, survey_data, summary, secure_token, PAID, PAID_DONE, payment_completed_event_id, payment_waived, payment_waived_event_id, whatsapp_contacted_event_id, phone_number, event_id, name, signup_for_next_event, auto_signup_next_event, updated_at, same_gender_preference, any_gender_preference, survey_data_updated_at, created_at, next_event_signup_timestamp, nationality, attendance_confirmed, attendance_confirmed_at, attendance_denied_at, receipt_url, receipt_received_at, receipt_approved, receipt_approved_at, receipt_rejected, receipt_rejected_at, age_flex_years, age_flex_event_id, arrival_status, arrival_status_at, discount_interest, last_twilio_action, last_twilio_action_at")
        .eq("match_id", STATIC_MATCH_ID)
        .neq("assigned_number", 9999)  // Exclude organizer participant
        .order("assigned_number", { ascending: true })

      if (error) {
        console.error("Database error:", error);
        return res.status(500).json({ error: error.message })
      }

    // 🔹 GET GROUP-EXCLUDED PARTICIPANTS (participant2_number = -2)
    if (action === "get-group-excluded-participants") {
      try {
        const { data, error } = await supabase
          .from("excluded_pairs")
          .select("id, participant1_number, created_at, reason")
          .eq("match_id", STATIC_MATCH_ID)
          .eq("participant2_number", -2)
          .order("created_at", { ascending: false })

        if (error) {
          console.error("Error fetching group-excluded participants:", error)
          return res.status(500).json({ error: error.message })
        }

        // Fetch participant names
        const participantNumbers = (data || []).map(item => item.participant1_number)
        const { data: participantData, error: participantError } = await supabase
          .from("participants")
          .select("assigned_number, name, survey_data")
          .eq("match_id", STATIC_MATCH_ID)
          .in("assigned_number", participantNumbers)

        if (participantError) {
          console.error("Error fetching participant names:", participantError)
        }

        const participantNameMap = new Map()
        if (participantData) {
          participantData.forEach(p => {
            const name = p.name || p.survey_data?.name || p.survey_data?.answers?.name || `المشارك #${p.assigned_number}`
            participantNameMap.set(p.assigned_number, name)
          })
        }

        const groupExcluded = (data || []).map(item => ({
          id: item.id,
          participant_number: item.participant1_number,
          participant_name: participantNameMap.get(item.participant1_number) || `المشارك #${item.participant1_number}`,
          created_at: item.created_at,
          reason: item.reason
        }))

        return res.status(200).json({ groupExcludedParticipants: groupExcluded })
      } catch (error) {
        console.error("Error in get-group-excluded-participants:", error)
        return res.status(500).json({ error: "Failed to fetch group-excluded participants" })
      }
      }
      const receiptEventId = Number(req.query.event_id || await getCurrentAdminEventId())
      const currentEventParticipants = (data || []).map(participant => ({
        ...participant,
        PAID: participant.PAID === true && Number(participant.whatsapp_contacted_event_id) === receiptEventId,
        PAID_DONE: participant.PAID_DONE === true && Number(participant.payment_completed_event_id) === receiptEventId,
        payment_waived: participant.payment_waived === true && Number(participant.payment_waived_event_id) === receiptEventId,
      }))
      return res.status(200).json({ participants: await attachEventReceipts(currentEventParticipants, receiptEventId), event_id: receiptEventId })
    }

    // 🔹 POST actions
    if (method === "POST") {
      if (!action) {
        return res.status(400).json({ error: "Missing action parameter" });
      }

      // 🔹 GET GROUP-EXCLUDED PARTICIPANTS (participant2_number = -2) via POST
      if (action === "get-group-excluded-participants") {
        try {
          const { data, error } = await supabase
            .from("excluded_pairs")
            .select("id, participant1_number, created_at, reason")
            .eq("match_id", STATIC_MATCH_ID)
            .eq("participant2_number", -2)
            .order("created_at", { ascending: false })

          if (error) {
            console.error("Error fetching group-excluded participants:", error)
            return res.status(500).json({ error: error.message })
          }

          const participantNumbers = (data || []).map(item => item.participant1_number)
          const { data: participantData, error: participantError } = await supabase
            .from("participants")
            .select("assigned_number, name, survey_data")
            .eq("match_id", STATIC_MATCH_ID)
            .in("assigned_number", participantNumbers)

          if (participantError) {
            console.error("Error fetching participant names:", participantError)
          }

          const participantNameMap = new Map()
          if (participantData) {
            participantData.forEach(p => {
              const name = p.name || p.survey_data?.name || p.survey_data?.answers?.name || `المشارك #${p.assigned_number}`
              participantNameMap.set(p.assigned_number, name)
            })
          }

          const groupExcluded = (data || []).map(item => ({
            id: item.id,
            participant_number: item.participant1_number,
            participant_name: participantNameMap.get(item.participant1_number) || `المشارك #${item.participant1_number}`,
            created_at: item.created_at,
            reason: item.reason
          }))

          return res.status(200).json({ groupExcludedParticipants: groupExcluded })
        } catch (error) {
          console.error("Error in get-group-excluded-participants (POST):", error)
          return res.status(500).json({ error: "Failed to fetch group-excluded participants" })
        }
      }

      // 🔹 AUTO-PLACE PARTICIPANT INTO BEST GROUP (fills an empty seat)
      if (action === "auto-place-participant-into-best-group") {
        try {
          const { event_id = 1, participant_number } = req.body
          const pNum = parseInt(participant_number)
          if (!pNum || pNum === 9999) {
            return res.status(400).json({ error: "Invalid participant_number" })
          }

          // Load all groups for the event
          const { data: groups, error: groupsErr } = await supabase
            .from("group_matches")
            .select("id, group_id, group_number, participant_numbers, participant_names, table_number, compatibility_score")
            .eq("match_id", STATIC_MATCH_ID)
            .eq("event_id", event_id)
            .order("group_number", { ascending: true })

          if (groupsErr) {
            console.error("auto-place fetch groups error:", groupsErr)
            return res.status(500).json({ error: "Failed to load groups" })
          }
          if (!groups || groups.length === 0) {
            return res.status(400).json({ error: "No groups available" })
          }

          // If participant already exists in any group, abort
          const alreadyIn = groups.find(g => Array.isArray(g.participant_numbers) && g.participant_numbers.includes(pNum))
          if (alreadyIn) {
            return res.status(400).json({ error: `Participant #${pNum} is already in group ${alreadyIn.group_number}` })
          }

          // Consider only groups with empty seats (capacity < 6)
          const candidateGroups = groups.filter(g => (Array.isArray(g.participant_numbers) ? g.participant_numbers.length : 0) < 6)
          if (candidateGroups.length === 0) {
            return res.status(400).json({ error: "All groups are full (max 6)" })
          }

          // Fetch ALL participants for evaluation (bypass eligibility)
          const allNumsSet = new Set([pNum])
          candidateGroups.forEach(g => {
            (g.participant_numbers || []).forEach(n => allNumsSet.add(n))
          })
          const allNums = Array.from(allNumsSet)

          const { data: participantsData, error: partErr } = await supabase
            .from("participants")
            .select("assigned_number, name, age, gender, survey_data, mbti_personality_type, attachment_style, communication_style")
            .eq("match_id", STATIC_MATCH_ID)
            .in("assigned_number", allNums)

          if (partErr) {
            console.error("auto-place fetch participants error:", partErr)
            return res.status(500).json({ error: "Failed to fetch participants" })
          }
          const detailsMap = new Map((participantsData || []).map(p => [p.assigned_number, p]))
          const candidate = detailsMap.get(pNum)
          if (!candidate) {
            return res.status(404).json({ error: `Participant #${pNum} not found` })
          }

          // Build previously matched pairs set (current event individual rounds only; exclude round 0 = groups)
          const { data: prevMatches } = await supabase
            .from('match_results')
            .select('participant_a_number, participant_b_number, round')
            .eq('match_id', STATIC_MATCH_ID)
            .eq('event_id', event_id)
            .neq('round', 0)
          const seenPairs = new Set()
          for (const r of (prevMatches || [])) {
            const a = r.participant_a_number, b = r.participant_b_number
            if (!a || !b) continue
            const k = a < b ? `${a}-${b}` : `${b}-${a}`
            seenPairs.add(k)
          }

          // Build excluded pairs set
          const { data: exclRows } = await supabase
            .from('excluded_pairs')
            .select('participant1_number, participant2_number')
            .eq('match_id', STATIC_MATCH_ID)
          const excludedPairs = new Set()
          for (const e of (exclRows || [])) {
            const a = e.participant1_number, b = e.participant2_number
            if (!a || !b) continue
            const k = a < b ? `${a}-${b}` : `${b}-${a}`
            excludedPairs.add(k)
          }

          // Helpers: Spark-Only pair score
          const W_SYNERGY = 45 / 35
          const W_HUMOR = 30 / 15
          const W_VIBE = 15 / 20
          const W_LIFESTYLE = 5 / 15
          const W_VALUES = 5 / 10

          function toUpper(v){ try { return String(v||'').toUpperCase() } catch { return '' } }
          function getAns(p, key){ try { let sd=p?.survey_data; if(typeof sd==='string'){ try{ sd=JSON.parse(sd)}catch{sd={}} } const a=sd?.answers||{}; return a[key] ?? sd?.[key] ?? p?.[key] ?? '' } catch { return '' } }

          function sparkLifestyle15(prefs1, prefs2){
            const base = calculateLifestyleCompatibilityLocal(prefs1, prefs2) // 0..25
            return Math.max(0, Math.min(15, base * (15/25)))
          }
          function sparkCore10(vals1, vals2){
            const base = calculateCoreValuesCompatibilityLocal(vals1, vals2) // 0..20
            return Math.max(0, Math.min(10, base * 0.5))
          }
          // Local Spark components
          function computeSynergyScore(pa, pb){
            const a35 = toUpper(getAns(pa, 'conversational_role'))
            const b35 = toUpper(getAns(pb, 'conversational_role'))
            const a36 = toUpper(getAns(pa, 'conversation_depth_pref'))
            const b36 = toUpper(getAns(pb, 'conversation_depth_pref'))
            const a37 = toUpper(getAns(pa, 'social_battery'))
            const b37 = toUpper(getAns(pb, 'social_battery'))
            const a38 = toUpper(getAns(pa, 'humor_subtype'))
            const b38 = toUpper(getAns(pb, 'humor_subtype'))
            const a39 = toUpper(getAns(pa, 'curiosity_style'))
            const b39 = toUpper(getAns(pb, 'curiosity_style'))
            const a41 = toUpper(getAns(pa, 'silence_comfort'))
            const b41 = toUpper(getAns(pb, 'silence_comfort'))
            let total = 0
            if ((a35 === 'A' && (b35 === 'B' || b35 === 'C')) || (b35 === 'A' && (a35 === 'B' || a35 === 'C'))) total += 7
            else if (a35 === 'B' && b35 === 'B') total += 4
            else if (a35 === 'A' && b35 === 'A') total += 2
            else if (a35 === 'C' && b35 === 'C') total += 0
            else if (a35 && b35) total += 3
            if (a36 && b36) total += (a36 === b36 ? 5 : 1)
            if (a37 && b37) { if (a37 === 'A' && b37 === 'A') total += 4; else if (a37 === 'B' && b37 === 'B') total += 3; else total += 1 }
            if (a38 && b38) total += (a38 === b38 ? 4 : 1)
            if (a39 && b39) { if ((a39 === 'A' && b39 === 'B') || (a39 === 'B' && b39 === 'A')) total += 5; else if (a39 === 'C' && b39 === 'C') total += 5; else if ((a39 === 'A' && b39 === 'A') || (a39 === 'B' && b39 === 'B')) total += 0; else total += 3 }
            if (a41 && b41) { if ((a41 === 'A' && b41 === 'B') || (a41 === 'B' && b41 === 'A')) total += 5; else if (a41 === 'A' && b41 === 'A') total += 3; else if (a41 === 'B' && b41 === 'B') total += 0 }
            return Math.min(35, (total * (35 / 30)))
          }
          function computeHumorOpenScore(pa, pb){
            const hA = toUpper(getAns(pa, 'humor_banter_style'))
            const hB = toUpper(getAns(pb, 'humor_banter_style'))
            const oAraw = getAns(pa, 'early_openness_comfort')
            const oBraw = getAns(pb, 'early_openness_comfort')
            const oA = oAraw !== '' && oAraw !== undefined && oAraw !== null ? parseInt(oAraw) : undefined
            const oB = oBraw !== '' && oBraw !== undefined && oBraw !== null ? parseInt(oBraw) : undefined
            let humor = 0
            if (hA && hB) {
              if (hA === hB) humor = 10
              else if ((hA === 'A' && hB === 'B') || (hA === 'B' && hB === 'A')) humor = 8
              else if ((hA === 'B' && hB === 'C') || (hA === 'C' && hB === 'B') || (hA === 'C' && hB === 'D') || (hA === 'D' && hB === 'C')) humor = 5
              else if ((hA === 'A' && hB === 'D') || (hA === 'D' && hB === 'A')) humor = 0
              else humor = 5
            }
            let open = 0
            if (oA !== undefined && oB !== undefined) {
              const dist = Math.abs(oA - oB)
              if (dist === 0) open = 5
              else if (dist === 1) open = 3
              else if (dist === 2) open = 1
              else open = 0
            }
            return humor + open // 0..15
          }
          function sparkPairScore(a, b){
            const synergy = Math.max(0, Math.min(35, computeSynergyScore(a, b)))
            const humor = Math.max(0, Math.min(15, computeHumorOpenScore(a, b)))
            let vibe = 12 // default
            // Keep default 12; cached AI vibe may adjust in trigger-match; acceptable approximation here
            const life = sparkLifestyle15(a?.survey_data?.lifestylePreferences, b?.survey_data?.lifestylePreferences)
            const core = sparkCore10(a?.survey_data?.coreValues, b?.survey_data?.coreValues)
            return (synergy*W_SYNERGY) + (humor*W_HUMOR) + (vibe*W_VIBE) + (life*W_LIFESTYLE) + (core*W_VALUES)
          }
          function sparkGroupAverage(participantsArr){
            let sum=0, count=0
            for(let i=0;i<participantsArr.length;i++){
              for(let j=i+1;j<participantsArr.length;j++){
                sum += sparkPairScore(participantsArr[i], participantsArr[j])
                count++
              }
            }
            return count>0 ? (sum/count) : 0
          }

          function rolesOf(nums){
            return nums.map(n=>detailsMap.get(n)).filter(Boolean).map(p=>toUpper(getAns(p,'conversational_role'))).filter(Boolean)
          }
          function hasInitiatorRole(nums){
            const roles = rolesOf(nums)
            if (roles.length !== nums.length) return true // only enforce when fully known
            return roles.some(r => r==='A' || r==='INITIATOR' || r==='INITIATE' || r==='LEADER' || r==='مبادر' || r==='المبادر')
          }
          function conversationCompatible(nums){
            const prefs = nums
              .map(n=>detailsMap.get(n))
              .filter(Boolean)
              .map(p => {
                const raw = getAns(p, 'vibe_4') || getAns(p, 'conversation_depth_pref')
                const v = toUpper(raw)
                if (v === 'نعم' || v === 'نَعَم' || v === 'YES' || v === 'Y' || v === 'TRUE' || v === '1') return 'yes'
                if (v === 'لا' || v === 'لَا' || v === 'NO' || v === 'N' || v === 'FALSE' || v === '0') return 'no'
                return null
              })
              .filter(Boolean)
            const yes = prefs.filter(v=>v==='yes').length
            const no = prefs.filter(v=>v==='no').length
            return !(yes>0 && no>0)
          }
          function gendersCount(nums){
            const g=nums.map(n=>detailsMap.get(n)).filter(Boolean).map(p=> (p.gender||p.survey_data?.gender||'').toString().toLowerCase())
            const male=g.filter(x=>x==='male'||x==='m'||x==='ذكر').length
            const female=g.filter(x=>x==='female'||x==='f'||x==='أنثى').length
            return {male,female}
          }
          function wouldCreateMatchedPairWithCandidate(nums){
            for(const n of nums){
              const a=Math.min(pNum,n), b=Math.max(pNum,n)
              if (seenPairs.has(`${a}-${b}`)) return true
              if (excludedPairs.has(`${a}-${b}`)) return true
            }
            return false
          }
          function ageStats(nums){
            const ages = nums.map(n=>detailsMap.get(n)).filter(Boolean).map(p=> (typeof p.age==='number'?p.age:parseInt(p?.survey_data?.age,10)) ).filter(v=>Number.isFinite(v))
            if (ages.length!==nums.length) return { range:null }
            return { range: Math.max(...ages)-Math.min(...ages) }
          }

          // Evaluate best group by resulting selection score and keep base Spark-only average for persistence
          let best = { group: null, selectScore: -1, baseAvg: 0 }
          for (const g of candidateGroups) {
            const nums = Array.isArray(g.participant_numbers) ? g.participant_numbers.slice() : []
            // Constraint: avoid creating excluded/previously matched pairs with candidate
            if (wouldCreateMatchedPairWithCandidate(nums)) continue
            const prospective = [...nums, pNum]
            // Constraint: initiator present (if roles known for all)
            if (!hasInitiatorRole(prospective)) continue
            // Constraint: conversation depth compatible
            if (!conversationCompatible(prospective)) continue
            // Constraint: gender balance and female cap
            const {male, female} = gendersCount(prospective)
            if (male===0 || female===0) continue
            if (female>2) continue

            // Compute base average (Spark-Only 0..100)
            const participantsArr = prospective.map(n=>detailsMap.get(n)).filter(Boolean)
            if (participantsArr.length !== prospective.length) continue
            const baseAvg = sparkGroupAverage(participantsArr)

            // Selection heuristics (non-persistent bonuses)
            let select = baseAvg
            const stats = ageStats(prospective)
            if (stats.range!=null && stats.range<=3) select += 5
            // size preference
            if (prospective.length===4) select += 5
            else if (prospective.length===5) select -= 5
            // single-female penalty
            if (prospective.length===4 && female===1) select = select * 0.7
            // role coverage + ideal mix bonuses
            const r = rolesOf(prospective)
            if (r.length>=2){ const uniq=new Set(r); if (uniq.size>=2) select+=3; if (uniq.size===3) select+=3; const hasA=r.includes('A')||r.includes('INITIATOR')||r.includes('INITIATE')||r.includes('LEADER')||r.includes('مبادر')||r.includes('المبادر'); const hasB=r.includes('B')||r.includes('REACTOR')||r.includes('RESPONDER')||r.includes('متفاعل')||r.includes('المتفاعل'); if (hasA && hasB) select += 10 }
            // conversation compatibility soft bonus
            if (conversationCompatible(prospective)) select += 3

            if (select > best.selectScore) {
              best = { group: g, selectScore: select, baseAvg }
            }
          }

          if (!best.group) {
            return res.status(400).json({ error: "Could not evaluate any group for placement" })
          }

          // Apply update to best group
          const chosen = best.group
          const updatedNums = [...(chosen.participant_numbers || []), pNum]
          const updatedNames = updatedNums.map(n => {
            const p = detailsMap.get(n)
            return (p?.name || p?.survey_data?.name || `المشارك #${n}`)
          })
          const roundedScore = Math.round(best.baseAvg)

          const { error: updErr } = await supabase
            .from("group_matches")
            .update({ participant_numbers: updatedNums, participant_names: updatedNames, compatibility_score: roundedScore })
            .eq("id", chosen.id)

          if (updErr) {
            console.error("auto-place update error:", updErr)
            return res.status(500).json({ error: "Failed to update group" })
          }

          const participants = updatedNums.map((num) => {
            const p = detailsMap.get(num)
            return { number: num, name: (p?.name || p?.survey_data?.name || `المشارك #${num}`), age: (p?.age || p?.survey_data?.age) }
          })

          return res.status(200).json({
            success: true,
            group: {
              group_id: chosen.group_id,
              group_number: chosen.group_number,
              table_number: chosen.table_number,
              participants,
              compatibility_score: roundedScore,
              participant_count: participants.length
            }
          })
        } catch (error) {
          console.error("Error in auto-place-participant-into-best-group:", error)
          return res.status(500).json({ error: "Failed to auto-place participant" })
        }
      }

      // 🔹 LIST PREV EVENT UNMATCHED OR ORGANIZER-MATCHED PARTICIPANTS
      if (action === "get-prev-unmatched-or-organizer") {
        try {
          const { event_id } = req.body
          const currentEvent = Number(event_id) || 1
          const prevEvent = currentEvent - 1
          if (prevEvent <= 0) {
            return res.status(200).json({ success: true, prev_event_id: prevEvent, participants: [] })
          }

          // Fetch participants of previous event
          const { data: prevParticipants, error: pErr } = await supabase
            .from("participants")
            .select("assigned_number, name, gender, age, phone_number, event_id, survey_data")
            .eq("match_id", STATIC_MATCH_ID)
            .eq("event_id", prevEvent)
            .neq("assigned_number", 9999)

          if (pErr) {
            console.error("Error fetching prev event participants:", pErr)
            return res.status(500).json({ error: pErr.message })
          }

          const numbers = (prevParticipants || []).map(p => p.assigned_number)
          if (numbers.length === 0) {
            return res.status(200).json({ success: true, prev_event_id: prevEvent, participants: [] })
          }

          // Fetch individual matches for prevEvent (exclude groups: round != 0)
          const { data: matches, error: mErr } = await supabase
            .from("match_results")
            .select("participant_a_number, participant_b_number, round")
            .eq("match_id", STATIC_MATCH_ID)
            .eq("event_id", prevEvent)
            .neq("round", 0)

          if (mErr) {
            console.error("Error fetching prev event matches:", mErr)
            return res.status(500).json({ error: mErr.message })
          }

          // Compute map: participant -> set of partners (excluding nulls)
          const partnerMap = new Map()
          for (const row of matches || []) {
            const a = row.participant_a_number
            const b = row.participant_b_number
            if (a) {
              if (!partnerMap.has(a)) partnerMap.set(a, new Set())
              partnerMap.get(a).add(b)
            }
            if (b) {
              if (!partnerMap.has(b)) partnerMap.set(b, new Set())
              partnerMap.get(b).add(a)
            }
          }

          // Filter participants: no partners OR all partners are 9999 (and must have a name from name or survey_data.name)
          const candidates = []
          for (const p of prevParticipants || []) {
            const partners = partnerMap.get(p.assigned_number)
            const hasName = !!p.name || !!p.survey_data?.name
            const include = (!partners || partners.size === 0 || ([...partners].every((x) => x === 9999))) && hasName
            if (include) {
              candidates.push(p)
            }
          }

          return res.status(200).json({ success: true, prev_event_id: prevEvent, participants: candidates })
        } catch (error) {
          console.error("Error in get-prev-unmatched-or-organizer:", error)
          return res.status(500).json({ error: "Failed to get previous event unmatched participants" })
        }
      }

      // 🔹 LIST PARTICIPANTS WHO NEVER APPEARED IN ANY EVENT MATCHES
      if (action === "get-never-in-events") {
        try {
          // Fetch all participants (excluding organizer)
          const { data: allParticipants, error: pErr } = await supabase
            .from("participants")
            .select("assigned_number, name, gender, age, phone_number, event_id, survey_data")
            .eq("match_id", STATIC_MATCH_ID)
            .neq("assigned_number", 9999)

          if (pErr) {
            console.error("Error fetching participants:", pErr)
            return res.status(500).json({ error: pErr.message })
          }

          // Fetch all match_results rows to build presence set
          const { data: allMatches, error: mErr } = await supabase
            .from("match_results")
            .select("participant_a_number, participant_b_number, participant_c_number, participant_d_number, participant_e_number, participant_f_number")
            .eq("match_id", STATIC_MATCH_ID)

          if (mErr) {
            console.error("Error fetching matches:", mErr)
            return res.status(500).json({ error: mErr.message })
          }

          const present = new Set()
          for (const row of allMatches || []) {
            const arr = [
              row.participant_a_number,
              row.participant_b_number,
              row.participant_c_number,
              row.participant_d_number,
              row.participant_e_number,
              row.participant_f_number
            ]
            for (const n of arr) {
              if (n && n !== 9999) present.add(n)
            }
          }

          const neverInEvents = (allParticipants || []).filter(p => !present.has(p.assigned_number) && (!!p.name || !!p.survey_data?.name))

          return res.status(200).json({ success: true, participants: neverInEvents })
        } catch (error) {
          console.error("Error in get-never-in-events:", error)
          return res.status(500).json({ error: "Failed to get never-in-events participants" })
        }
      }

      // 🔹 BULK SIGNUP PARTICIPANTS FOR NEXT EVENT (set signup_for_next_event=true)
      if (action === "signup-participants-next-event") {
        try {
          const { participantNumbers } = req.body
          const list = Array.isArray(participantNumbers) ? participantNumbers.filter(n => typeof n === 'number') : []
          if (list.length === 0) {
            return res.status(400).json({ error: "participantNumbers must be a non-empty array of numbers" })
          }

          const now = new Date().toISOString()
          const { error } = await supabase
            .from("participants")
            .update({ signup_for_next_event: true, next_event_signup_timestamp: now, signup_event_id: req.body.event_id || null })
            .eq("match_id", STATIC_MATCH_ID)
            .in("assigned_number", list)

          if (error) {
            console.error("Error signing up participants for next event:", error)
            return res.status(500).json({ error: error.message })
          }

          return res.status(200).json({ success: true, updated: list.length })
        } catch (error) {
          console.error("Error in signup-participants-next-event:", error)
          return res.status(500).json({ error: "Failed to signup participants for next event" })
        }
      }

      // 🔹 BULK UNSIGN PARTICIPANTS FROM NEXT EVENT (set signup_for_next_event=false, optionally auto_signup_next_event=false)
      if (action === "unsign-participants-next-event") {
        try {
          const { participantNumbers, alsoUnsignAuto } = req.body
          const list = Array.isArray(participantNumbers) ? participantNumbers.filter(n => typeof n === 'number') : []
          if (list.length === 0) {
            return res.status(400).json({ error: "participantNumbers must be a non-empty array of numbers" })
          }

          const updateFields = { signup_for_next_event: false, next_event_signup_timestamp: null, signup_event_id: null }
          if (alsoUnsignAuto === true) {
            updateFields.auto_signup_next_event = false
          }

          const { error } = await supabase
            .from("participants")
            .update(updateFields)
            .eq("match_id", STATIC_MATCH_ID)
            .in("assigned_number", list)

          if (error) {
            console.error("Error unsigning participants from next event:", error)
            return res.status(500).json({ error: error.message })
          }

          return res.status(200).json({ success: true, updated: list.length })
        } catch (error) {
          console.error("Error in unsign-participants-next-event:", error)
          return res.status(500).json({ error: "Failed to unsign participants from next event" })
        }
      }

      // 🔹 BULK SIGNUP: ALL WITH NATIONALITY FILLED → NEXT EVENT
      if (action === "signup-nationality-next-event") {
        try {
          const now = new Date().toISOString()
          const { data, error } = await supabase
            .from("participants")
            .update({ signup_for_next_event: true, next_event_signup_timestamp: now })
            .eq("match_id", STATIC_MATCH_ID)
            .neq("assigned_number", 9999) // exclude organizer
            .not("nationality", "is", null)
            .neq("nationality", "")
            .select("id")

          if (error) {
            console.error("Error in signup-nationality-next-event:", error)
            return res.status(500).json({ error: error.message })
          }

          const updatedCount = Array.isArray(data) ? data.length : 0
          return res.status(200).json({ success: true, updatedCount })
        } catch (error) {
          console.error("Error in signup-nationality-next-event:", error)
          return res.status(500).json({ error: "Failed to signup nationality-completed participants for next event" })
        }
      }

      console.log(`Processing action: ${action}`);

      if (action === "participants") {
        const { event_id, include_matching_pool = false } = req.body
        let query = supabase
          .from("participants")
          .select("id, assigned_number, table_number, survey_data, summary, secure_token, PAID, PAID_DONE, payment_completed_event_id, payment_waived, payment_waived_event_id, whatsapp_contacted_event_id, phone_number, event_id, name, signup_for_next_event, auto_signup_next_event, updated_at, gender, age, same_gender_preference, any_gender_preference, prefer_same_nationality, preferred_age_min, preferred_age_max, open_age_preference, humor_banter_style, early_openness_comfort, survey_data_updated_at, created_at, next_event_signup_timestamp, nationality, open_intent_goal_mismatch, signup_event_id, attendance_confirmed, attendance_confirmed_at, attendance_denied_at, receipt_url, receipt_received_at, receipt_approved, receipt_approved_at, receipt_rejected, receipt_rejected_at, age_flex_years, age_flex_event_id, arrival_status, arrival_status_at, discount_interest, last_twilio_action, last_twilio_action_at")
          .eq("match_id", STATIC_MATCH_ID)
          .neq("assigned_number", 9999)  // Exclude organizer participant
          .order("assigned_number", { ascending: true })
          .limit(10000)
        
        // Add event_id filter if provided
        if (event_id) {
          const normalizedEventId = Number(event_id)
          if (!Number.isInteger(normalizedEventId) || normalizedEventId <= 0) {
            return res.status(400).json({ error: "Invalid event_id" })
          }
          if (include_matching_pool) {
            query = query.or(`event_id.eq.${normalizedEventId},signup_for_next_event.eq.true,auto_signup_next_event.eq.true`)
            console.log(`🔍 Filtering participants by matching pool for event_id: ${normalizedEventId}`)
          } else {
            query = query.eq("event_id", normalizedEventId)
            console.log(`🔍 Filtering participants by event_id: ${normalizedEventId}`)
          }
        }
        
        const { data, error } = await query

        if (error) {
          console.error("Database error:", error);
          return res.status(500).json({ error: error.message })
        }
        const receiptEventId = Number(event_id || await getCurrentAdminEventId())
        const currentEventParticipants = (data || []).map(participant => ({
          ...participant,
          PAID: participant.PAID === true && Number(participant.whatsapp_contacted_event_id) === receiptEventId,
          PAID_DONE: participant.PAID_DONE === true && Number(participant.payment_completed_event_id) === receiptEventId,
          payment_waived: participant.payment_waived === true && Number(participant.payment_waived_event_id) === receiptEventId,
        }))
        return res.status(200).json({ participants: await attachEventReceipts(currentEventParticipants, receiptEventId), event_id: receiptEventId })
      }

      if (action === "delete") {
        const { assigned_number } = req.body
        const { error } = await supabase
          .from("participants")
          .delete()
          .eq("assigned_number", assigned_number)
          .eq("match_id", STATIC_MATCH_ID)
        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ message: "Deleted successfully" })
      }

      if (action === "set-phase") {
        const { phase } = req.body
        
        // Extract current round from phase if it's a round phase
        let current_round = 1;
        if (phase && phase.startsWith("round_")) {
          current_round = parseInt(phase.split('_')[1]) || 1;
        }
        
        const { error } = await supabase
          .from("event_state")
          .upsert({ 
            match_id: STATIC_MATCH_ID, 
            phase, 
            current_round,
          }, { onConflict: "match_id" })
        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ message: "Phase updated - all players will transition immediately" })
      }

      if (action === "set-table") {
        try {
          const { event_id } = req.body
          const currentEventId = event_id || 1
          
          console.log(`Auto-assigning tables for event ${currentEventId}`)
          
          // Step 1: Clear all table numbers for current event
          const { error: clearError } = await supabase
            .from("match_results")
            .update({ table_number: null })
            .eq("match_id", STATIC_MATCH_ID)
            .eq("event_id", currentEventId)
          
          if (clearError) {
            console.error("Error clearing table numbers:", clearError)
            return res.status(500).json({ error: clearError.message })
          }
          
          console.log(`✅ Cleared all table numbers for event ${currentEventId}`)
          
          // Step 2: Get all locked matches (both rounds)
          const { data: lockedMatches, error: lockedError } = await supabase
            .from("locked_matches")
            .select("participant1_number, participant2_number, original_match_round")
            .eq("match_id", STATIC_MATCH_ID)
          
          if (lockedError) {
            console.error("Error fetching locked matches:", lockedError)
            return res.status(500).json({ error: lockedError.message })
          }
          
          console.log(`📌 Found ${lockedMatches?.length || 0} locked matches`)
          
          // Step 3: Assign table numbers only to locked/pinned matches.
          // Rounds 1 (same-gender) and 2 (opposite-gender) happen sequentially, so each
          // round restarts the table count from 1 (a table number may repeat across rounds).
          let assignedCount = 0

          // Build age-aware ordering so older participants get lower table numbers
          // 1) Collect all participant numbers from locked matches
          const allNumbersSet = new Set()
          for (const lm of lockedMatches || []) {
            if (lm?.participant1_number && lm.participant1_number !== 9999) allNumbersSet.add(lm.participant1_number)
            if (lm?.participant2_number && lm.participant2_number !== 9999) allNumbersSet.add(lm.participant2_number)
          }

          // 2) Fetch ages + gender for these participants (prefer column; fallback to survey_data)
          const { data: ageRows, error: ageErr } = await supabase
            .from("participants")
            .select("assigned_number, age, survey_data, gender, event_id")
            .eq("match_id", STATIC_MATCH_ID)
            .eq("event_id", currentEventId)
            .in("assigned_number", Array.from(allNumbersSet))

          if (ageErr) {
            console.error("Error fetching ages for locked matches:", ageErr)
            // We will proceed without age ordering if this fails
          }

          const ageMap = new Map()
          const genderMap = new Map()
          for (const row of ageRows || []) {
            const directAge = typeof row.age === 'number' ? row.age : parseInt(row.age, 10)
            const fallbackAge = (row?.survey_data && (typeof row.survey_data.age === 'number' || typeof row.survey_data.age === 'string'))
              ? parseInt(row.survey_data.age, 10)
              : undefined
            const ageVal = Number.isFinite(directAge) ? directAge : (Number.isFinite(fallbackAge) ? fallbackAge : undefined)
            if (row.assigned_number != null) {
              ageMap.set(row.assigned_number, Number.isFinite(ageVal) ? ageVal : 0)
              const g = (row.gender || row?.survey_data?.gender || '').toString().trim().toLowerCase()
              genderMap.set(row.assigned_number, g)
            }
          }

          // 3) Fetch existing match rows for this event so we can map each locked pair
          //    to its actual match row + round.
          const { data: matchRows, error: matchRowsErr } = await supabase
            .from("match_results")
            .select("id, participant_a_number, participant_b_number, round")
            .eq("match_id", STATIC_MATCH_ID)
            .eq("event_id", currentEventId)

          if (matchRowsErr) {
            console.error("Error fetching match rows for table assignment:", matchRowsErr)
            return res.status(500).json({ error: matchRowsErr.message })
          }

          const pairKey = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`
          const rowsByPair = new Map()
          const roundRowCounts = { 1: 0, 2: 0, other: 0 }
          for (const r of matchRows || []) {
            if (r.participant_a_number == null || r.participant_b_number == null) continue
            const k = pairKey(r.participant_a_number, r.participant_b_number)
            if (!rowsByPair.has(k)) rowsByPair.set(k, [])
            rowsByPair.get(k).push(r)
            if (r.round === 1) roundRowCounts[1]++
            else if (r.round === 2) roundRowCounts[2]++
            else roundRowCounts.other++
          }
          console.log(`📊 match_results rows for event ${currentEventId}: total=${matchRows?.length || 0} (R1=${roundRowCounts[1]}, R2=${roundRowCounts[2]}, other=${roundRowCounts.other})`)

          // Determine a locked pair's intended round: prefer stored original_match_round,
          // else derive from genders (same gender = R1, opposite = R2).
          const intendedRound = (lm) => {
            const stored = Number(lm?.original_match_round)
            if (stored === 1 || stored === 2) return stored
            const g1 = genderMap.get(lm.participant1_number)
            const g2 = genderMap.get(lm.participant2_number)
            if (g1 && g2) return g1 === g2 ? 1 : 2
            return null
          }

          // 4) Bucket locked pairs by round. Prefer the actual match row's round; if no row
          //    exists for the pair, fall back to the intended round and log it as missing
          //    (such a pair has no match_results row to store a table number on).
          const byRound = { 1: [], 2: [] }
          const missingRowPairs = []
          for (const lm of (lockedMatches || [])) {
            // Skip locked matches involving organizer (#9999)
            if (lm.participant1_number === 9999 || lm.participant2_number === 9999) {
              console.log(`   ⏭️ Skipping locked match involving organizer: #${lm.participant1_number} ↔ #${lm.participant2_number}`)
              continue
            }
            const a1 = ageMap.get(lm.participant1_number) ?? 0
            const a2 = ageMap.get(lm.participant2_number) ?? 0
            const pairMaxAge = Math.max(a1, a2)
            const rows = rowsByPair.get(pairKey(lm.participant1_number, lm.participant2_number)) || []
            const usableRows = rows.filter(r => r.round === 1 || r.round === 2)

            if (usableRows.length === 0) {
              missingRowPairs.push({ p1: lm.participant1_number, p2: lm.participant2_number, intended: intendedRound(lm) })
              continue
            }
            for (const r of usableRows) {
              byRound[r.round].push({ id: r.id, pairMaxAge, p1: lm.participant1_number, p2: lm.participant2_number })
            }
          }

          if (missingRowPairs.length > 0) {
            console.warn(`⚠️ ${missingRowPairs.length} locked pair(s) have NO match_results row for event ${currentEventId} and were skipped (no row to assign a table to):`)
            for (const mp of missingRowPairs) {
              console.warn(`     • #${mp.p1} ↔ #${mp.p2} (intended R${mp.intended ?? '?'}) — regenerate that round so the locked pair becomes an actual match row`)
            }
          }
          console.log(`🔒 Locked pairs bucketed: R1=${byRound[1].length}, R2=${byRound[2].length}, missingRow=${missingRowPairs.length}`)

          // 5) Process rounds: R1 sequentially, R2 tries to reuse R1 tables so one person stays put
          const perRoundAssigned = { 1: 0, 2: 0 }
          const participantR1Table = new Map() // participant_number → table assigned in R1
          let stableCount = 0 // how many R2 pairs reused an R1 table

          // --- Round 1: sequential assignment sorted by oldest first ---
          {
            const items = byRound[1].sort((x, y) => (y.pairMaxAge - x.pairMaxAge))
            let tableCounter = 1
            for (const item of items) {
              const { error: updateError } = await supabase
                .from("match_results")
                .update({ table_number: tableCounter })
                .eq("match_id", STATIC_MATCH_ID)
                .eq("id", item.id)

              if (updateError) {
                console.error(`Error updating table number (R1) for locked match #${item.p1} ↔ #${item.p2}:`, updateError)
                return res.status(500).json({ error: updateError.message })
              }

              // Record R1 table for each participant
              participantR1Table.set(item.p1, tableCounter)
              participantR1Table.set(item.p2, tableCounter)

              console.log(`   📍 R1 Table ${tableCounter}: #${item.p1} ↔ #${item.p2} (max age ${item.pairMaxAge})`)
              tableCounter++
              assignedCount++
              perRoundAssigned[1]++
            }
          }

          // --- Round 2: prefer reusing a participant's R1 table (they stay, partner moves to them) ---
          {
            const items = byRound[2].sort((x, y) => (y.pairMaxAge - x.pairMaxAge))
            const usedR2Tables = new Set()
            let nextFreshTable = 1

            for (const item of items) {
              let assignedTable = null
              let stayingParticipant = null

              // Try to reuse an R1 table from either participant
              const t1 = participantR1Table.get(item.p1)
              const t2 = participantR1Table.get(item.p2)

              if (t1 != null && !usedR2Tables.has(t1)) {
                assignedTable = t1
                stayingParticipant = item.p1
              } else if (t2 != null && !usedR2Tables.has(t2)) {
                assignedTable = t2
                stayingParticipant = item.p2
              } else {
                // No R1 table available — assign next fresh number
                while (usedR2Tables.has(nextFreshTable)) nextFreshTable++
                assignedTable = nextFreshTable
                nextFreshTable++
              }

              usedR2Tables.add(assignedTable)

              const { error: updateError } = await supabase
                .from("match_results")
                .update({ table_number: assignedTable })
                .eq("match_id", STATIC_MATCH_ID)
                .eq("id", item.id)

              if (updateError) {
                console.error(`Error updating table number (R2) for locked match #${item.p1} ↔ #${item.p2}:`, updateError)
                return res.status(500).json({ error: updateError.message })
              }

              if (stayingParticipant) {
                const movingParticipant = stayingParticipant === item.p1 ? item.p2 : item.p1
                console.log(`   🪑 R2 Table ${assignedTable}: #${stayingParticipant} stays (from R1), #${movingParticipant} moves`)
                stableCount++
              } else {
                console.log(`   📍 R2 Table ${assignedTable}: #${item.p1} ↔ #${item.p2} (both move, no R1 table free)`)
              }

              assignedCount++
              perRoundAssigned[2]++
            }
          }

          console.log(`🪑 Stable seating: ${stableCount}/${perRoundAssigned[2]} R2 pairs reuse an R1 table (one person stays)`)

          console.log(`✅ Assigned ${assignedCount} table numbers (R1=${perRoundAssigned[1]}, R2=${perRoundAssigned[2]}, skipped=${missingRowPairs.length})`)

          return res.status(200).json({ 
            message: `Tables assigned — R1: ${perRoundAssigned[1]}, R2: ${perRoundAssigned[2]}, stable seating: ${stableCount}/${perRoundAssigned[2]}${missingRowPairs.length ? ` (skipped ${missingRowPairs.length} locked pair(s) with no match row)` : ''}`,
            assignedTables: assignedCount,
            assignedByRound: perRoundAssigned,
            stableSeating: stableCount,
            skippedNoRow: missingRowPairs.length,
            totalMatches: lockedMatches?.length || 0
          })
        } catch (error) {
          console.error("Error in set-table:", error)
          return res.status(500).json({ error: "Failed to assign tables" })
        }
      }
      
      if (action === "update-table") {
        const { assigned_number, table_number } = req.body
        const { error } = await supabase
          .from("participants")
          .update({ table_number })
          .eq("assigned_number", assigned_number)
          .eq("match_id", STATIC_MATCH_ID)
        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ message: "Table updated" })
      }

      // 🔹 Update a group's display number (renumber group)
      if (action === "update-group-number") {
        try {
          const { event_id = 1, old_group_number, new_group_number } = req.body
          const currentEvent = Number(event_id) || 1
          const oldNum = Number(old_group_number)
          const newNum = Number(new_group_number)

          if (!Number.isFinite(oldNum) || !Number.isFinite(newNum)) {
            return res.status(400).json({ error: "Invalid group numbers" })
          }
          if (newNum <= 0) {
            return res.status(400).json({ error: "New group number must be positive" })
          }
          if (oldNum === newNum) {
            return res.status(200).json({ success: true, message: "No change" })
          }

          // Ensure target number not already used by another group in this event
          const { data: existsRows, error: existsErr } = await supabase
            .from("group_matches")
            .select("id, group_number")
            .eq("match_id", STATIC_MATCH_ID)
            .eq("event_id", currentEvent)
            .eq("group_number", newNum)

          if (existsErr) {
            console.error("exists check error:", existsErr)
            return res.status(500).json({ error: "Failed to validate new group number" })
          }
          if (Array.isArray(existsRows) && existsRows.length > 0) {
            return res.status(400).json({ error: `Group number ${newNum} is already in use` })
          }

          // Fetch target group row by old number
          const { data: targetGroup, error: fetchErr } = await supabase
            .from("group_matches")
            .select("id")
            .eq("match_id", STATIC_MATCH_ID)
            .eq("event_id", currentEvent)
            .eq("group_number", oldNum)
            .single()

          if (fetchErr) {
            if (fetchErr.code === 'PGRST116') {
              return res.status(404).json({ error: `Group ${oldNum} not found` })
            }
            console.error("fetch target group error:", fetchErr)
            return res.status(500).json({ error: "Failed to fetch group" })
          }

          // Update group_matches (group_number, group_id, and table_number)
          const newGroupId = `group_${newNum}`
          const { error: up1 } = await supabase
            .from("group_matches")
            .update({ group_number: newNum, group_id: newGroupId, table_number: newNum })
            .eq("id", targetGroup.id)

          if (up1) {
            console.error("update group_matches error:", up1)
            return res.status(500).json({ error: "Failed to update group number (groups)" })
          }

          // Per requirement: do NOT modify match_results when adjusting group numbers.
          // Group renumbering only affects group_matches (group_id, group_number, table_number).

          return res.status(200).json({ success: true, old_group_number: oldNum, new_group_number: newNum, new_group_id: newGroupId, new_table_number: newNum })
        } catch (e) {
          console.error("update-group-number exception:", e)
          return res.status(500).json({ error: "Failed to update group number" })
        }
      }

      if (action === "toggle-auto-signup") {
        const { assigned_number, auto_signup } = req.body
        console.log(`Toggling auto signup for participant ${assigned_number} to ${auto_signup}`)
        
        const { error } = await supabase
          .from("participants")
          .update({ auto_signup_next_event: auto_signup })
          .eq("assigned_number", assigned_number)
          .eq("match_id", STATIC_MATCH_ID)
        
        if (error) {
          console.error("toggle-auto-signup error:", error)
          return res.status(500).json({ success: false, error: error.message })
        }
        
        return res.status(200).json({ 
          success: true, 
          message: `Auto signup ${auto_signup ? 'enabled' : 'disabled'}` 
        })
      }

      if (action === "event-phase") {
        const { data, error } = await supabase
          .from("event_state")
          .select("phase")
          .eq("match_id", STATIC_MATCH_ID)
          .single()

        if (error) {
          console.error("event-phase error:", error);
          // If no event state exists, return "registration" as default
          if (error.code === 'PGRST116') {
            return res.status(200).json({ phase: "registration" })
          }
          return res.status(500).json({ error: error.message })
        }
        return res.status(200).json({ phase: data.phase })
      }

      if (action === "set-announcement") {
        const { message, type = "info" } = req.body
        const { error } = await supabase
          .from("event_state")
          .upsert({ 
            match_id: STATIC_MATCH_ID, 
            announcement: message,
            announcement_type: type,
            announcement_time: new Date().toISOString()
          }, { onConflict: "match_id" })
        if (error) {
          console.error("set-announcement error:", error);
          return res.status(500).json({ error: error.message })
        }
        return res.status(200).json({ message: "Announcement set" })
      }

      if (action === "clear-announcement") {
        const { error } = await supabase
          .from("event_state")
          .update({ 
            announcement: null,
            announcement_type: null,
            announcement_time: null
          })
          .eq("match_id", STATIC_MATCH_ID)
        if (error) {
          console.error("clear-announcement error:", error);
          return res.status(500).json({ error: error.message })
        }
        return res.status(200).json({ message: "Announcement cleared" })
      }

      if (action === "set-emergency-pause") {
        const { paused } = req.body
        const { error } = await supabase
          .from("event_state")
          .upsert({ 
            match_id: STATIC_MATCH_ID, 
            emergency_paused: paused,
            pause_time: paused ? new Date().toISOString() : null
          }, { onConflict: "match_id" })
        if (error) {
          console.error("set-emergency-pause error:", error);
          return res.status(500).json({ error: error.message })
        }
        return res.status(200).json({ message: `Emergency ${paused ? 'pause' : 'resume'} set` })
      }

      if (action === "set-total-rounds") {
        const { total_rounds } = req.body
        if (!total_rounds || total_rounds < 2 || total_rounds > 6) {
          return res.status(400).json({ error: "Total rounds must be between 2 and 6" })
        }
        const { error } = await supabase
          .from("event_state")
          .upsert({ 
            match_id: STATIC_MATCH_ID, 
            total_rounds: total_rounds
          }, { onConflict: "match_id" })
        if (error) {
          console.error("set-total-rounds error:", error);
          return res.status(500).json({ error: error.message })
        }
        return res.status(200).json({ message: `Total rounds set to ${total_rounds}` })
      }

      // Persist WhatsApp config in event_state.whatsapp_config
      if (action === "set-whatsapp-config") {
        try {
          const { config, updated_by } = req.body
          if (!config || typeof config !== 'object') {
            return res.status(400).json({ error: "Invalid config payload" })
          }
          if (!config.paymentCutoffLocal || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(String(config.paymentCutoffLocal))) {
            return res.status(400).json({ error: "A valid Riyadh-local payment cutoff date and time is required" })
          }

          const cutoffLabel = formatRiyadhCutoffLabel(config.paymentCutoffLocal)
          const normalizedConfig = {
            ...config,
            earlyPrice: 60,
            latePrice: 75,
            latePriceSwitchLabel: cutoffLabel,
            paymentTimezone: "Asia/Riyadh",
          }

          const now = new Date().toISOString()

          const { data, error } = await supabase
            .from("event_state")
            .upsert({
              match_id: STATIC_MATCH_ID,
              whatsapp_config: normalizedConfig,
              whatsapp_config_updated_at: now,
              whatsapp_config_updated_by: updated_by || 'admin'
            }, { onConflict: "match_id" })
            .select("whatsapp_config, whatsapp_config_updated_at, whatsapp_config_updated_by")
            .single()

          if (error) {
            console.error("set-whatsapp-config error:", error)
            return res.status(500).json({ error: error.message })
          }

          return res.status(200).json({
            success: true,
            whatsapp_config: data?.whatsapp_config || normalizedConfig,
            whatsapp_config_updated_at: data?.whatsapp_config_updated_at || now,
            whatsapp_config_updated_by: data?.whatsapp_config_updated_by || (updated_by || 'admin')
          })
        } catch (err) {
          console.error("set-whatsapp-config exception:", err)
          return res.status(500).json({ error: "Failed to save WhatsApp config" })
        }
      }

      // Retrieve WhatsApp config from event_state.whatsapp_config
      if (action === "get-whatsapp-config") {
        try {
          const { data, error } = await supabase
            .from("event_state")
            .select("whatsapp_config, whatsapp_config_updated_at, whatsapp_config_updated_by")
            .eq("match_id", STATIC_MATCH_ID)
            .single()

          if (error) {
            // If no record, return empty config (frontend can apply defaults)
            if (error.code === 'PGRST116') {
              return res.status(200).json({ success: true, whatsapp_config: null })
            }
            console.error("get-whatsapp-config error:", error)
            return res.status(500).json({ error: error.message })
          }

          const savedConfig = data?.whatsapp_config || null
          const normalizedSavedConfig = savedConfig ? {
            ...savedConfig,
            latePriceSwitchLabel: formatRiyadhCutoffLabel(savedConfig.paymentCutoffLocal) || savedConfig.latePriceSwitchLabel,
          } : null
          return res.status(200).json({
            success: true,
            whatsapp_config: normalizedSavedConfig,
            whatsapp_config_updated_at: data?.whatsapp_config_updated_at || null,
            whatsapp_config_updated_by: data?.whatsapp_config_updated_by || null
          })
        } catch (err) {
          console.error("get-whatsapp-config exception:", err)
          return res.status(500).json({ error: "Failed to get WhatsApp config" })
        }
      }

      // Get Twilio template SIDs from environment variables
      if (action === "get-twilio-template-sids") {
        const { data: configuredTemplates } = await supabase
          .from("twilio_templates")
          .select("template_key,content_sid,approval_status,enabled")
          .in("template_key", ["match", "reminder", "payment", "match_cancellation", "survey_update", "seat_payment_deadline"])
        const configured = Object.fromEntries((configuredTemplates || []).map(t => [t.template_key, t]))
        return res.status(200).json({
          success: true,
          templateSids: {
            match: configured.match?.content_sid || process.env.TWILIO_MATCH_TEMPLATE_SID || TWILIO_MATCH_NOTIFICATION_V2_SID,
            reminder: configured.reminder?.content_sid || process.env.TWILIO_REMINDER_TEMPLATE_SID || null,
            payment: configured.payment?.content_sid || process.env.TWILIO_PAYMENT_TEMPLATE_SID || null,
            match_cancellation: configured.match_cancellation?.content_sid || process.env.TWILIO_MATCH_CANCELLATION_TEMPLATE_SID || TWILIO_MATCH_CANCELLATION_SID,
            survey_update: configured.survey_update?.content_sid || process.env.TWILIO_SURVEY_UPDATE_TEMPLATE_SID || TWILIO_SURVEY_UPDATE_SID,
            seat_payment_deadline: configured.seat_payment_deadline?.content_sid || null,
          },
          templateMeta: configured,
        })
      }

      // Send WhatsApp message via Twilio API (free-form text or template)
      if (action === "send-twilio-whatsapp") {
        try {
          const { to, message, templateSid: requestedTemplateSid, templateKey, variables } = req.body
          let templateSid = requestedTemplateSid
          let resolvedTemplateKey = templateKey || null
          if (templateKey) {
            const { data: configuredTemplate, error: templateError } = await supabase
              .from("twilio_templates")
              .select("template_key,content_sid,enabled,approval_status")
              .eq("template_key", templateKey)
              .single()
            if (templateError || !configuredTemplate) return res.status(404).json({ error: "Template not found in Twilio tab" })
            if (!configuredTemplate.enabled) return res.status(400).json({ error: "Template is disabled in Twilio tab" })
            if (!configuredTemplate.content_sid) return res.status(400).json({ error: "Template SID is missing in Twilio tab" })
            templateSid = configuredTemplate.content_sid
            resolvedTemplateKey = configuredTemplate.template_key
          } else if (requestedTemplateSid) {
            // Backward compatibility for admin tabs opened before templateKey
            // was added to the modal payload. Recognize the template by the SID
            // stored in the Twilio tab instead of falling back to the PAID flag.
            const { data: configuredTemplate } = await supabase
              .from("twilio_templates")
              .select("template_key,content_sid,enabled")
              .eq("content_sid", requestedTemplateSid)
              .maybeSingle()
            if (configuredTemplate?.enabled) {
              templateSid = configuredTemplate.content_sid
              resolvedTemplateKey = configuredTemplate.template_key
            }
          }
          if (!to) {
            return res.status(400).json({ error: "Missing 'to'" })
          }
          if (!message && !templateSid) {
            return res.status(400).json({ error: "Missing 'message' or 'templateSid'" })
          }

          const accountSid = process.env.TWILIO_ACCOUNT_SID
          const authToken = process.env.TWILIO_AUTH_TOKEN
          const sender = process.env.TWILIO_WHATSAPP_SENDER || "whatsapp:+13527387477"

          if (!accountSid || !authToken) {
            return res.status(500).json({ error: "Twilio credentials not configured" })
          }

          // Normalize recipient to whatsapp:+E.164 format
          let normalizedTo = String(to).replace(/\s/g, "")
          if (!normalizedTo.startsWith("whatsapp:")) {
            normalizedTo = "whatsapp:" + normalizedTo
          }

          const cleanPhone = normalizedTo.replace("whatsapp:", "")
          const last7 = cleanPhone.replace(/\D/g, "").slice(-7)
          const { data: participantMatches } = await supabase
            .from("participants")
            .select("id, assigned_number, name, phone_number, payment_reminder_sent")
            .eq("match_id", STATIC_MATCH_ID)
            .not("phone_number", "is", null)
          const participant = participantMatches?.find(p => String(p.phone_number || "").replace(/\D/g, "").endsWith(last7))
          if (resolvedTemplateKey === "payment" && participant?.payment_reminder_sent === true) {
            return res.status(200).json({ success: true, skipped: true, reason: "Payment reminder already sent" })
          }

          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
          const body = new URLSearchParams()
          body.append("From", sender)
          body.append("To", normalizedTo)

          const effectiveVariables = normalizeTwilioTemplateVariables(resolvedTemplateKey, variables)
          if (resolvedTemplateKey === "seat_payment_deadline") {
            effectiveVariables[1] = effectiveVariables[1] || participant?.name || `#${participant?.assigned_number || ""}`
          }
          if (templateSid) {
            // Template-based send with ContentSid + ContentVariables
            body.append("ContentSid", templateSid)
            if (effectiveVariables && typeof effectiveVariables === "object") {
              body.append("ContentVariables", JSON.stringify(effectiveVariables))
            }
            console.log("Twilio template send:", {
              templateSid,
              to: normalizedTo,
              from: sender,
              variables: JSON.stringify(effectiveVariables),
            })
          } else {
            // Free-form text send
            body.append("Body", message)
          }
          body.append("StatusCallback", TWILIO_STATUS_CALLBACK_URL)

          const twilioRes = await fetch(twilioUrl, {
            method: "POST",
            headers: {
              "Authorization": "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: body.toString(),
          })

          const twilioData = await twilioRes.json()

          if (!twilioRes.ok) {
            console.error("Twilio API error:", twilioData)
            return res.status(twilioRes.status).json({ error: twilioData.message || "Twilio API error" })
          }

          // Log outgoing message to whatsapp_messages
          try {
            await supabase.from("whatsapp_messages").insert({
              participant_id: participant?.id || null,
              assigned_number: participant?.assigned_number || null,
              phone_number: normalizedTo,
              direction: "outbound",
              message_body: message || null,
              template_sid: templateSid || null,
              template_variables: effectiveVariables || null,
              twilio_message_sid: twilioData.sid,
              status: twilioData.status,
              status_updated_at: new Date().toISOString(),
              error_code: twilioData?.code ? String(twilioData.code) : null,
              error_message: null,
              twilio_payload: twilioData || {},
              is_auto_reply: false,
            })
            if (participant?.id && ["match", "payment"].includes(resolvedTemplateKey)) {
              const currentEventId = await getCurrentAdminEventId()
              const { error: sentFlagError } = await supabase
                .from("participants")
                .update(resolvedTemplateKey === "payment"
                  ? { payment_reminder_sent: true }
                  : { PAID: true, whatsapp_contacted_event_id: currentEventId })
                .eq("id", participant.id)
              if (sentFlagError) console.error("Failed to mark participant as WhatsApp sent:", sentFlagError)
            }
          } catch (e) {
            console.error("Failed to log outgoing message:", e)
          }

          return res.status(200).json({
            success: true,
            message_sid: twilioData.sid,
            status: twilioData.status,
          })
        } catch (err) {
          console.error("send-twilio-whatsapp exception:", err)
          return res.status(500).json({ error: "Failed to send WhatsApp message" })
        }
      }

      // Bulk send WhatsApp template to all matched participants
      if (action === "bulk-twilio-whatsapp") {
        try {
          const { templateSid: requestedTemplateSid, templateKey, participantNumbers, variablesMap } = req.body
          let templateSid = requestedTemplateSid
          let resolvedTemplateKey = templateKey || null
          if (templateKey) {
            const { data: configuredTemplate, error: templateError } = await supabase
              .from("twilio_templates")
              .select("template_key,content_sid,enabled,approval_status")
              .eq("template_key", templateKey)
              .single()
            if (templateError || !configuredTemplate) return res.status(404).json({ error: "Template not found in Twilio tab" })
            if (!configuredTemplate.enabled) return res.status(400).json({ error: "Template is disabled in Twilio tab" })
            if (!configuredTemplate.content_sid) return res.status(400).json({ error: "Template SID is missing in Twilio tab" })
            templateSid = configuredTemplate.content_sid
            resolvedTemplateKey = configuredTemplate.template_key
          } else if (requestedTemplateSid) {
            // Older open admin tabs only submit the SID. Resolve it against the
            // Twilio tab so payment reminders use their dedicated sent flag.
            const { data: configuredTemplate } = await supabase
              .from("twilio_templates")
              .select("template_key,content_sid,enabled")
              .eq("content_sid", requestedTemplateSid)
              .maybeSingle()
            if (configuredTemplate?.enabled) {
              templateSid = configuredTemplate.content_sid
              resolvedTemplateKey = configuredTemplate.template_key
            }
          }
          if (!templateSid || !participantNumbers || !Array.isArray(participantNumbers)) {
            return res.status(400).json({ error: "Missing 'templateSid' or 'participantNumbers'" })
          }
          if (participantNumbers.length < 1) {
            return res.status(400).json({ error: "Select at least one participant" })
          }
          if (participantNumbers.length > 500) {
            return res.status(400).json({ error: "A bulk send is limited to 500 participants" })
          }
          const uniqueParticipantNumbers = [...new Set(participantNumbers)]

          const accountSid = process.env.TWILIO_ACCOUNT_SID
          const authToken = process.env.TWILIO_AUTH_TOKEN
          const sender = process.env.TWILIO_WHATSAPP_SENDER || "whatsapp:+13527387477"

          if (!accountSid || !authToken) {
            return res.status(500).json({ error: "Twilio credentials not configured" })
          }

          // Fetch participant data for the given numbers
          const { data: participants } = await supabase
            .from("participants")
            .select("id, assigned_number, name, phone_number, secure_token, signup_for_next_event, survey_data, PAID, whatsapp_contacted_event_id, payment_reminder_sent")
            .eq("match_id", STATIC_MATCH_ID)
            .in("assigned_number", uniqueParticipantNumbers)
            .not("phone_number", "is", null)

          if (!participants || participants.length === 0) {
            return res.status(400).json({ error: "No participants with phone numbers found" })
          }

          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
          const authHeader = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64")

          const results = []
          const currentEventId = await getCurrentAdminEventId()
          let successCount = 0
          let failCount = 0
          let skippedCount = 0

          const foundNumbers = new Set(participants.map(participant => participant.assigned_number))
          for (const number of uniqueParticipantNumbers) {
            if (!foundNumbers.has(number)) {
              results.push({ number, success: false, error: "Participant not found or has no phone number" })
              failCount++
            }
          }

          for (const p of participants) {
            // Event reminders are repeatable and must not share the one-time
            // match/confirmation sent flag.
            const alreadySent = resolvedTemplateKey === "payment"
              ? p.payment_reminder_sent === true
              : resolvedTemplateKey === "match"
                ? p.PAID === true && Number(p.whatsapp_contacted_event_id) === Number(currentEventId)
                : false
            if (alreadySent) {
              results.push({ number: p.assigned_number, name: p.name, success: true, skipped: true, reason: resolvedTemplateKey === "payment" ? "Payment reminder already sent" : "Already marked WhatsApp sent" })
              skippedCount++
              continue
            }
            try {
              let normalizedTo = String(p.phone_number).replace(/\s/g, "")
              if (!normalizedTo.startsWith("whatsapp:")) {
                normalizedTo = "whatsapp:" + normalizedTo
              }

              // Build variables for this participant
              let vars = {}
              if (typeof variablesMap === "function") {
                // Can't send functions — this won't happen, but keep for safety
              } else if (variablesMap && typeof variablesMap === "object") {
                // If variablesMap is a map of assigned_number -> variables object
                vars = variablesMap[p.assigned_number] || variablesMap[String(p.assigned_number)] || {}
              }
              vars = normalizeTwilioTemplateVariables(resolvedTemplateKey, vars)
              if (resolvedTemplateKey === "seat_payment_deadline") {
                vars[1] = vars[1] || p.name || `#${p.assigned_number}`
              }

              const body = new URLSearchParams()
              body.append("From", sender)
              body.append("To", normalizedTo)
              body.append("ContentSid", templateSid)
              if (Object.keys(vars).length > 0) {
                body.append("ContentVariables", JSON.stringify(vars))
              }
              body.append("StatusCallback", TWILIO_STATUS_CALLBACK_URL)

              const twilioRes = await fetch(twilioUrl, {
                method: "POST",
                headers: {
                  "Authorization": authHeader,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: body.toString(),
              })

              const twilioData = await twilioRes.json()

              if (twilioRes.ok) {
                results.push({ number: p.assigned_number, name: p.name, success: true, sid: twilioData.sid })
                successCount++
                // Log bulk outgoing message
                try {
                  await supabase.from("whatsapp_messages").insert({
                    participant_id: p.id || null,
                    assigned_number: p.assigned_number,
                    phone_number: normalizedTo,
                    direction: "outbound",
                    template_sid: templateSid,
                    template_variables: vars || null,
                    twilio_message_sid: twilioData.sid,
                    status: twilioData.status,
                    status_updated_at: new Date().toISOString(),
                    twilio_payload: twilioData || {},
                    is_auto_reply: false,
                  })
                  if (["match", "payment"].includes(resolvedTemplateKey)) {
                    const { error: sentFlagError } = await supabase
                      .from("participants")
                      .update(resolvedTemplateKey === "payment"
                        ? { payment_reminder_sent: true }
                        : { PAID: true, whatsapp_contacted_event_id: currentEventId })
                      .eq("id", p.id)
                    if (sentFlagError) console.error("Failed to mark bulk participant as WhatsApp sent:", sentFlagError)
                  }
                } catch (e) {
                  console.error("Failed to log bulk message:", e)
                }
              } else {
                results.push({ number: p.assigned_number, name: p.name, success: false, error: twilioData.message || "Twilio error" })
                failCount++
              }
            } catch (err) {
              results.push({ number: p.assigned_number, name: p.name, success: false, error: err.message })
              failCount++
            }
          }

          return res.status(200).json({
            success: true,
            total: uniqueParticipantNumbers.length,
            successCount,
            failCount,
            skippedCount,
            results,
          })
        } catch (err) {
          console.error("bulk-twilio-whatsapp exception:", err)
          return res.status(500).json({ error: "Failed to bulk send WhatsApp messages" })
        }
      }

      // Receipt review queue for the admin notification workspace
      if (action === "get-receipt-review-queue") {
        try {
          const eventId = Number(req.body.event_id || await getCurrentAdminEventId())
          const { data: receiptRows, error: receiptError } = await supabase
            .from("participant_receipts")
            .select("id,participant_id,assigned_number,event_id,storage_path,received_at")
            .eq("event_id", eventId)
            .eq("status", "pending")
            .order("received_at", { ascending: false })
          if (receiptError) return res.status(500).json({ error: receiptError.message })
          if (!receiptRows?.length) return res.status(200).json({ success: true, receipts: [], event_id: eventId })

          const { data: participantRows, error: participantError } = await supabase
            .from("participants")
            .select("id,assigned_number,name,phone_number,attendance_confirmed,attendance_confirmed_at,PAID_DONE")
            .in("id", receiptRows.map(receipt => receipt.participant_id))
          if (participantError) return res.status(500).json({ error: participantError.message })

          const participantsById = new Map((participantRows || []).map(participant => [participant.id, participant]))
          const signedUrls = new Map()
          await Promise.all(receiptRows.map(async receipt => {
            if (!receipt.storage_path) return
            const { data } = await supabase.storage.from("receipts").createSignedUrl(receipt.storage_path, 600)
            if (data?.signedUrl) signedUrls.set(receipt.id, data.signedUrl)
          }))
          const receipts = receiptRows.map(receipt => ({
            ...(participantsById.get(receipt.participant_id) || {}),
            receipt_id: receipt.id,
            receipt_event_id: receipt.event_id,
            assigned_number: receipt.assigned_number,
            receipt_url: signedUrls.get(receipt.id) || null,
            receipt_received_at: receipt.received_at,
            receipt_approved: false,
            receipt_rejected: false,
          }))
          return res.status(200).json({ success: true, receipts, event_id: eventId })
        } catch (err) {
          console.error("get-receipt-review-queue exception:", err)
          return res.status(500).json({ error: "Failed to fetch receipt review queue" })
        }
      }

      // Approve receipt — update DB and notify participant via WhatsApp
      if (action === "approve-receipt") {
        try {
          let notificationSent = false
          let notificationError = null
          const { assigned_number, receipt_id, event_id } = req.body
          if (!assigned_number) {
            return res.status(400).json({ error: "Missing 'assigned_number'" })
          }

          const { data: participant, error: fetchError } = await supabase
            .from("participants")
            .select("id, assigned_number, phone_number, receipt_url, name, secure_token")
            .eq("match_id", STATIC_MATCH_ID)
            .eq("assigned_number", assigned_number)
            .single()

          if (fetchError || !participant) {
            return res.status(404).json({ error: "Participant not found" })
          }

          const receipt = await findEventReceipt(participant.id, { receiptId: receipt_id, eventId: event_id })
          if (!receipt) return res.status(404).json({ error: "No receipt found for this participant and event" })

          const reviewedAt = new Date().toISOString()
          const { error: previousApprovalError } = await supabase
            .from("participant_receipts")
            .update({ status: "superseded", updated_at: reviewedAt })
            .eq("participant_id", participant.id)
            .eq("event_id", receipt.event_id)
            .eq("status", "approved")
            .neq("id", receipt.id)
          if (previousApprovalError) return res.status(500).json({ error: previousApprovalError.message })

          const { error: receiptUpdateError } = await supabase
            .from("participant_receipts")
            .update({ status: "approved", reviewed_at: reviewedAt, rejection_reason: null, updated_at: reviewedAt })
            .eq("id", receipt.id)
          if (receiptUpdateError) return res.status(500).json({ error: receiptUpdateError.message })

          const { error: updateError } = await supabase
            .from("participants")
            .update({
              receipt_approved: true,
              receipt_approved_at: reviewedAt,
              receipt_rejected: false,
              receipt_rejected_at: null,
              PAID_DONE: true,
              payment_completed_event_id: receipt.event_id,
              payment_waived: false,
              payment_waived_event_id: null,
              attendance_confirmed: true,
              attendance_confirmed_at: new Date().toISOString(),
              attendance_denied_at: null,
            })
            .eq("id", participant.id)

          if (updateError) {
            return res.status(500).json({ error: updateError.message })
          }

          // Payment approval is the final confirmation. Close any older pending
          // attendance-intent request so the admin is not prompted to approve it again.
          const { error: attendanceCloseError } = await supabase
            .from("attendance_requests")
            .update({ status: "approved", admin_note: "Auto-approved with receipt", updated_at: new Date().toISOString() })
            .eq("participant_id", participant.id)
            .eq("status", "pending")
          if (attendanceCloseError) console.error("Failed to close attendance requests after receipt approval:", attendanceCloseError)

          try {
            const confirmation = await sendFinalConfirmation(participant, false)
            notificationSent = confirmation.sent
            notificationError = confirmation.error
          } catch (e) {
            notificationError = e?.message || "WhatsApp request failed"
            console.error("Receipt approval WhatsApp failed:", e)
          }

          return res.status(200).json({
            success: true,
            receipt_id: receipt.id,
            event_id: receipt.event_id,
            notification_sent: notificationSent,
            notification_error: notificationError,
            message: notificationSent ? "Receipt approved and participant notified" : "Receipt approved; notification was not delivered",
          })
        } catch (err) {
          console.error("approve-receipt exception:", err)
          return res.status(500).json({ error: "Failed to approve receipt" })
        }
      }

      // Organizer override: confirm a seat without recording a payment.
      if (action === "confirm-without-payment") {
        try {
          const { assigned_number } = req.body
          if (!assigned_number) return res.status(400).json({ error: "Missing 'assigned_number'" })
          const { data: participant, error: fetchError } = await supabase
            .from("participants")
            .select("id, assigned_number, name, phone_number, secure_token")
            .eq("match_id", STATIC_MATCH_ID)
            .eq("assigned_number", assigned_number)
            .single()
          if (fetchError || !participant) return res.status(404).json({ error: "Participant not found" })

          const waiverEventId = await getCurrentAdminEventId()

          const { error: updateError } = await supabase.from("participants").update({
            attendance_confirmed: true,
            attendance_confirmed_at: new Date().toISOString(),
            attendance_denied_at: null,
            payment_waived: true,
            payment_waived_event_id: waiverEventId,
            PAID_DONE: false,
            payment_completed_event_id: null,
          }).eq("id", participant.id)
          if (updateError) return res.status(500).json({ error: updateError.message })

          await supabase.from("attendance_requests")
            .update({ status: "approved", admin_note: "Confirmed without payment by organizer", updated_at: new Date().toISOString() })
            .eq("participant_id", participant.id)
            .eq("status", "pending")

          const notification = await sendFinalConfirmation(participant, true)
          return res.status(200).json({
            success: true,
            notification_sent: notification.sent,
            notification_error: notification.error,
          })
        } catch (err) {
          console.error("confirm-without-payment exception:", err)
          return res.status(500).json({ error: "Failed to confirm participant without payment" })
        }
      }

      // Reject receipt — update DB and notify participant via WhatsApp
      if (action === "reject-receipt") {
        try {
          const { assigned_number, reason, receipt_id, event_id } = req.body
          if (!assigned_number) {
            return res.status(400).json({ error: "Missing 'assigned_number'" })
          }

          const { data: participant, error: fetchError } = await supabase
            .from("participants")
            .select("id, phone_number, receipt_url, name")
            .eq("match_id", STATIC_MATCH_ID)
            .eq("assigned_number", assigned_number)
            .single()

          if (fetchError || !participant) {
            return res.status(404).json({ error: "Participant not found" })
          }

          const receipt = await findEventReceipt(participant.id, { receiptId: receipt_id, eventId: event_id })
          if (!receipt) return res.status(404).json({ error: "No receipt found for this participant and event" })

          const reviewedAt = new Date().toISOString()
          const { error: receiptUpdateError } = await supabase
            .from("participant_receipts")
            .update({ status: "rejected", reviewed_at: reviewedAt, rejection_reason: reason || null, updated_at: reviewedAt })
            .eq("id", receipt.id)
          if (receiptUpdateError) return res.status(500).json({ error: receiptUpdateError.message })

          const { error: updateError } = await supabase
            .from("participants")
            .update({
              receipt_rejected: true,
              receipt_rejected_at: reviewedAt,
              receipt_approved: false,
              receipt_approved_at: null,
              PAID_DONE: false,
              payment_completed_event_id: null,
              payment_waived: false,
              payment_waived_event_id: null,
            })
            .eq("id", participant.id)

          if (updateError) {
            return res.status(500).json({ error: updateError.message })
          }

          // Send WhatsApp rejection to participant
          if (participant.phone_number) {
            const accountSid = process.env.TWILIO_ACCOUNT_SID
            const authToken = process.env.TWILIO_AUTH_TOKEN
            const sender = process.env.TWILIO_WHATSAPP_SENDER || "whatsapp:+13527387477"
            if (accountSid && authToken) {
              let normalizedTo = String(participant.phone_number).replace(/\s/g, "")
              if (!normalizedTo.startsWith("whatsapp:")) {
                normalizedTo = "whatsapp:" + normalizedTo
              }
              const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
              const body = new URLSearchParams()
              body.append("From", sender)
              body.append("To", normalizedTo)
              const rejectMsg = reason
                ? await editableTwilioResponse("receipt_rejected_reason", "⚠️ تعذّر قبول الإيصال. السبب: {reason}. يرجى إرسال إيصال صحيح.", { reason })
                : await editableTwilioResponse("receipt_rejected_generic", "⚠️ تعذّر قبول الإيصال. يرجى التأكد من وضوح الإيصال وإعادة إرساله.")
              if (!rejectMsg.trim()) return res.status(200).json({ success: true, notification_sent: false, notification_error: "Receipt rejection response is disabled" })
              body.append("Body", rejectMsg)
              body.append("StatusCallback", TWILIO_STATUS_CALLBACK_URL)
              try {
                const rejectRes = await fetch(twilioUrl, {
                  method: "POST",
                  headers: {
                    "Authorization": "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
                    "Content-Type": "application/x-www-form-urlencoded",
                  },
                  body: body.toString(),
                })
                const rejectData = await rejectRes.json()
                // Log the rejection message
                try {
                  await supabase.from("whatsapp_messages").insert({
                    participant_id: participant.id,
                    assigned_number: assigned_number,
                    phone_number: normalizedTo,
                    direction: "outbound",
                    message_body: rejectMsg,
                    twilio_message_sid: rejectData?.sid || null,
                    status: rejectData?.status || "sent",
                    is_auto_reply: false,
                  })
                } catch (e) {
                  console.error("Failed to log rejection message:", e)
                }
              } catch (e) {
                console.error("Failed to send WhatsApp rejection notification:", e)
              }
            }
          }

          return res.status(200).json({
            success: true,
            receipt_id: receipt.id,
            event_id: receipt.event_id,
            message: "Receipt rejected and participant notified",
          })
        } catch (err) {
          console.error("reject-receipt exception:", err)
          return res.status(500).json({ error: "Failed to reject receipt" })
        }
      }

      // ── WhatsApp Chat Platform actions ──────────────────────────────────

      // Get conversation history for a participant
      if (action === "get-whatsapp-conversation") {
        try {
          const { assigned_number } = req.body
          if (!assigned_number) {
            return res.status(400).json({ error: "Missing 'assigned_number'" })
          }

          const { data: messages, error } = await supabase
            .from("whatsapp_messages")
            .select("*")
            .eq("assigned_number", assigned_number)
            .order("created_at", { ascending: true })
            .limit(200)

          if (error) {
            console.error("get-whatsapp-conversation error:", error)
            return res.status(500).json({ error: error.message })
          }

          return res.status(200).json({ success: true, messages: messages || [] })
        } catch (err) {
          console.error("get-whatsapp-conversation exception:", err)
          return res.status(500).json({ error: "Failed to fetch conversation" })
        }
      }

      // Send a free-text reply from admin chat UI
      if (action === "send-whatsapp-reply") {
        try {
          const { assigned_number, message } = req.body
          if (!assigned_number || !message) {
            return res.status(400).json({ error: "Missing 'assigned_number' or 'message'" })
          }

          // Fetch participant
          const { data: participant, error: pErr } = await supabase
            .from("participants")
            .select("id, assigned_number, phone_number, name")
            .eq("match_id", STATIC_MATCH_ID)
            .eq("assigned_number", assigned_number)
            .single()

          if (pErr || !participant) {
            return res.status(404).json({ error: "Participant not found" })
          }

          if (!participant.phone_number) {
            return res.status(400).json({ error: "Participant has no phone number" })
          }

          const accountSid = process.env.TWILIO_ACCOUNT_SID
          const authToken = process.env.TWILIO_AUTH_TOKEN
          const sender = process.env.TWILIO_WHATSAPP_SENDER || "whatsapp:+13527387477"

          if (!accountSid || !authToken) {
            return res.status(500).json({ error: "Twilio credentials not configured" })
          }

          let normalizedTo = String(participant.phone_number).replace(/\s/g, "")
          if (!normalizedTo.startsWith("whatsapp:")) {
            normalizedTo = "whatsapp:" + normalizedTo
          }

          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
          const body = new URLSearchParams()
          body.append("From", sender)
          body.append("To", normalizedTo)
          body.append("Body", message)
          body.append("StatusCallback", TWILIO_STATUS_CALLBACK_URL)

          const twilioRes = await fetch(twilioUrl, {
            method: "POST",
            headers: {
              "Authorization": "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: body.toString(),
          })

          const twilioData = await twilioRes.json()

          if (!twilioRes.ok) {
            console.error("Twilio API error (reply):", twilioData)
            return res.status(twilioRes.status).json({ error: twilioData.message || "Twilio API error" })
          }

          // Log the reply
          try {
            await supabase.from("whatsapp_messages").insert({
              participant_id: participant.id,
              assigned_number: participant.assigned_number,
              phone_number: normalizedTo,
              direction: "outbound",
              message_body: message,
              twilio_message_sid: twilioData.sid,
              status: twilioData.status,
              is_auto_reply: false,
            })
          } catch (e) {
            console.error("Failed to log reply:", e)
          }

          return res.status(200).json({
            success: true,
            message_sid: twilioData.sid,
            status: twilioData.status,
          })
        } catch (err) {
          console.error("send-whatsapp-reply exception:", err)
          return res.status(500).json({ error: "Failed to send reply" })
        }
      }

      // Get inbox — all messages (inbound + outbound) across all participants
      if (action === "get-whatsapp-inbox") {
        try {
          const { data: messages, error } = await supabase
            .from("whatsapp_messages")
            .select("id, assigned_number, phone_number, direction, message_body, button_payload, button_text, media_url, media_content_type, is_auto_reply, twilio_message_sid, status, created_at")
            .order("created_at", { ascending: false })
            .limit(200)

          if (error) {
            console.error("get-whatsapp-inbox error:", error)
            return res.status(500).json({ error: error.message })
          }

          // Enrich with participant names
          const numbers = [...new Set(messages?.map(m => m.assigned_number).filter(Boolean))]
          let participantMap = {}
          if (numbers.length > 0) {
            const { data: participants } = await supabase
              .from("participants")
              .select("assigned_number, name")
              .in("assigned_number", numbers)
            participants?.forEach(p => { participantMap[p.assigned_number] = p.name })
          }

          const enriched = (messages || []).map(m => ({
            ...m,
            participant_name: m.assigned_number ? participantMap[m.assigned_number] || null : null,
          }))

          return res.status(200).json({ success: true, messages: enriched })
        } catch (err) {
          console.error("get-whatsapp-inbox exception:", err)
          return res.status(500).json({ error: "Failed to fetch inbox" })
        }
      }

      // ── Attendance Requests (confirm/deny approval workflow) ───────────────

      // Get attendance requests (pending by default, or all)
      if (action === "get-attendance-requests") {
        try {
          const showAll = req.body.show_all === true
          let query = supabase
            .from("attendance_requests")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(showAll ? 100 : 50)
          if (!showAll) {
            query = query.eq("status", "pending")
          }
          const { data: requests, error } = await query
          if (error) {
            console.error("get-attendance-requests error:", error)
            return res.status(500).json({ error: error.message })
          }

          // Enrich with participant names
          const numbers = [...new Set(requests?.map(r => r.assigned_number).filter(Boolean))]
          let participantMap = {}
          if (numbers.length > 0) {
            const { data: participants } = await supabase
              .from("participants")
              .select("assigned_number, name, phone_number")
              .in("assigned_number", numbers)
            participants?.forEach(p => { participantMap[p.assigned_number] = p })
          }

          const enriched = (requests || []).map(r => ({
            ...r,
            participant_name: r.assigned_number ? participantMap[r.assigned_number]?.name || null : null,
            participant_phone: r.assigned_number ? participantMap[r.assigned_number]?.phone_number || null : null,
          }))

          return res.status(200).json({ success: true, requests: enriched })
        } catch (err) {
          console.error("get-attendance-requests exception:", err)
          return res.status(500).json({ error: "Failed to fetch attendance requests" })
        }
      }

      // Participant attendance changes are already applied by the webhook.
      // This action only marks the organizer notification as reviewed.
      if (action === "approve-attendance-request") {
        try {
          const request_id = req.body.request_id || req.body.id
          if (!request_id) return res.status(400).json({ error: "Missing 'request_id'" })
          const { data: req_row, error: fetchErr } = await supabase
            .from("attendance_requests")
            .select("*")
            .eq("id", request_id)
            .single()
          if (fetchErr || !req_row) return res.status(404).json({ error: "Request not found" })
          if (req_row.status !== "pending") return res.status(400).json({ error: "Request already processed" })
          const { error: updateError } = await supabase
            .from("attendance_requests")
            .update({ status: "approved", admin_note: "Reviewed by organizer; participant action was already applied", updated_at: new Date().toISOString() })
            .eq("id", request_id)
          if (updateError) return res.status(500).json({ error: updateError.message })
          return res.status(200).json({ success: true, message: "Notification marked as reviewed" })
        } catch (err) {
          console.error("approve-attendance-request exception:", err)
          return res.status(500).json({ error: "Failed to approve request" })
        }
      }

      // Dismiss an organizer notification. The participant's decision is already applied.
      if (action === "reject-attendance-request") {
        try {
          const request_id = req.body.request_id || req.body.id
          const { note } = req.body
          if (!request_id) return res.status(400).json({ error: "Missing 'request_id'" })

          const { error } = await supabase
            .from("attendance_requests")
            .update({ status: "rejected", admin_note: note || null, updated_at: new Date().toISOString() })
            .eq("id", request_id)

          if (error) {
            console.error("reject-attendance-request error:", error)
            return res.status(500).json({ error: error.message })
          }

          return res.status(200).json({ success: true, message: "Notification dismissed" })
        } catch (err) {
          console.error("reject-attendance-request exception:", err)
          return res.status(500).json({ error: "Failed to dismiss notification" })
        }
      }

      if (action === "get-upcoming-event-summary") {
        const { data: eventSummaryState, error: eventSummaryError } = await supabase
          .from("event_state")
          .select("current_event_id, whatsapp_config")
          .eq("match_id", STATIC_MATCH_ID)
          .single()

        if (eventSummaryError) {
          if (eventSummaryError.code === "PGRST116") {
            return res.status(200).json({ upcoming_event: null })
          }
          console.error("get-upcoming-event-summary error:", eventSummaryError)
          return res.status(500).json({ error: eventSummaryError.message })
        }

        const currentEventId = Number(eventSummaryState.current_event_id || 1)
        const { count: registeredCount, error: registrationCountError } = await supabase
          .from("participants")
          .select("id", { count: "exact", head: true })
          .eq("match_id", STATIC_MATCH_ID)
          .neq("assigned_number", 9999)
          // Match the admin's complete upcoming-event pool. Do not apply payment,
          // attendance, survey, exclusion-list, or matchability filters here.
          .or(`signup_for_next_event.eq.true,auto_signup_next_event.eq.true,event_id.eq.${currentEventId}`)

        if (registrationCountError) {
          console.error("get-upcoming-event-summary registration count error:", registrationCountError)
        }

        const whatsappConfig = eventSummaryState.whatsapp_config || {}
        return res.status(200).json({
          upcoming_event: {
            event_id: currentEventId,
            date_text: String(whatsappConfig.eventDateText || "").trim() || null,
            time_text: String(whatsappConfig.eventTimeText || "").trim() || null,
            arrival_time_text: String(whatsappConfig.arrivalTimeText || "").trim() || null,
            registered_count: registrationCountError ? null : Number(registeredCount || 0),
          },
        })
      }

      if (action === "get-event-state") {
        console.log("Fetching event state for match_id:", STATIC_MATCH_ID);
        const { data, error } = await supabase
          .from("event_state")
          .select("phase, announcement, announcement_type, announcement_time, emergency_paused, pause_time, current_round, total_rounds, current_event_id, global_timer_active, global_timer_start_time, global_timer_duration, global_timer_round, groups_locked")
          .eq("match_id", STATIC_MATCH_ID)
          .single()

        if (error) {
          console.error("get-event-state error:", error);
          // If no event state exists, return default values
          if (error.code === 'PGRST116') {
            console.log("No event state found, returning defaults");
            return res.status(200).json({ 
              phase: "registration",
              announcement: null,
              announcement_type: null,
              announcement_time: null,
              emergency_paused: false,
              pause_time: null,
              current_round: 1,
              total_rounds: 1,
              current_event_id: 1,
              global_timer_active: false,
              global_timer_start_time: null,
              global_timer_duration: 1800,
              global_timer_round: null,
              groups_locked: false
            })
          }
          return res.status(500).json({ error: error.message })
        }

        console.log("Event state found:", data);
        return res.status(200).json({ 
          phase: data.phase,
          announcement: data.announcement,
          announcement_type: data.announcement_type,
          announcement_time: data.announcement_time,
          emergency_paused: data.emergency_paused || false,
          pause_time: data.pause_time,
          current_round: data.current_round ?? 1,
          total_rounds: data.total_rounds ?? 4,
          current_event_id: data.current_event_id || 1,
          global_timer_active: data.global_timer_active || false,
          global_timer_start_time: data.global_timer_start_time,
          global_timer_duration: data.global_timer_duration || 1800,
          global_timer_round: data.global_timer_round,
          groups_locked: data.groups_locked === true
        })
      }

      if (action === "get-participant-stats") {
        try {
          console.log("Getting participant stats for match_id:", STATIC_MATCH_ID);
          
          // Get total participants
          const { data: totalParticipants, error: totalError } = await supabase
            .from("participants")
            .select("assigned_number")
            .eq("match_id", STATIC_MATCH_ID)
            .neq("assigned_number", 9999)  // Exclude organizer participant
            .limit(10000)

          if (totalError) {
            console.error("Total participants error:", totalError);
            return res.status(500).json({ error: totalError.message })
          }

          console.log("Total participants found:", totalParticipants?.length || 0);

          // Get participants who completed form
          const { data: formCompleted, error: formError } = await supabase
            .from("participants")
            .select("assigned_number")
            .eq("match_id", STATIC_MATCH_ID)
            .neq("assigned_number", 9999)  // Exclude organizer participant
            .not("survey_data", "is", null)
            .limit(10000)

          if (formError) {
            console.error("Form completed error:", formError);
            return res.status(500).json({ error: formError.message })
          }

          console.log("Form completed participants:", formCompleted?.length || 0);

          // Get current event state
          const { data: eventState, error: eventError } = await supabase
            .from("event_state")
            .select("phase, current_round")
            .eq("match_id", STATIC_MATCH_ID)
            .single()

          if (eventError && eventError.code !== 'PGRST116') {
            console.error("Event state error:", eventError);
            return res.status(500).json({ error: eventError.message })
          }

          const currentPhase = eventState?.phase || "registration"
          const currentRound = eventState?.current_round ?? 1

          console.log("Current phase:", currentPhase, "Current round:", currentRound);

          // Calculate waiting count based on phase
          let waitingCount = 0
          let currentRoundParticipants = 0

          if (currentPhase === "waiting") {
            waitingCount = formCompleted.length
          } else if (currentPhase.startsWith("round_")) {
            // Count participants who completed the previous round
            const previousRound = parseInt(currentPhase.split('_')[1]) - 1
            if (previousRound > 0) {
              const { data: roundCompleted, error: roundError } = await supabase
                .from("match_results")
                .select("participant_a_number, participant_b_number, participant_c_number, participant_d_number, participant_e_number, participant_f_number")
                .eq("match_id", STATIC_MATCH_ID)
                .eq("round", previousRound)
              
              if (roundError) {
                console.error("Round completed error:", roundError);
              } else if (roundCompleted) {
                const roundParticipants = new Set()
                roundCompleted.forEach(match => {
                  if (match.participant_a_number > 0 && match.participant_a_number !== 9999) roundParticipants.add(match.participant_a_number)
                  if (match.participant_b_number > 0 && match.participant_b_number !== 9999) roundParticipants.add(match.participant_b_number)
                  if (match.participant_c_number > 0 && match.participant_c_number !== 9999) roundParticipants.add(match.participant_c_number)
                  if (match.participant_d_number > 0 && match.participant_d_number !== 9999) roundParticipants.add(match.participant_d_number)
                  if (match.participant_e_number > 0 && match.participant_e_number !== 9999) roundParticipants.add(match.participant_e_number)
                  if (match.participant_f_number > 0 && match.participant_f_number !== 9999) roundParticipants.add(match.participant_f_number)
                })
                waitingCount = roundParticipants.size
              }
            }
          } else if (currentPhase === "group_phase") {
            // Count participants who completed all rounds
            const { data: allRoundsCompleted, error: allRoundsError } = await supabase
              .from("match_results")
              .select("participant_a_number, participant_b_number, participant_c_number, participant_d_number, participant_e_number, participant_f_number")
              .eq("match_id", STATIC_MATCH_ID)
              .in("round", [1, 2, 3, 4])
            
            if (allRoundsError) {
              console.error("All rounds completed error:", allRoundsError);
            } else if (allRoundsCompleted) {
              const allParticipants = new Set()
              allRoundsCompleted.forEach(match => {
                if (match.participant_a_number > 0 && match.participant_a_number !== 9999) allParticipants.add(match.participant_a_number)
                if (match.participant_b_number > 0 && match.participant_b_number !== 9999) allParticipants.add(match.participant_b_number)
                if (match.participant_c_number > 0 && match.participant_c_number !== 9999) allParticipants.add(match.participant_c_number)
                if (match.participant_d_number > 0 && match.participant_d_number !== 9999) allParticipants.add(match.participant_d_number)
                if (match.participant_e_number > 0 && match.participant_e_number !== 9999) allParticipants.add(match.participant_e_number)
                if (match.participant_f_number > 0 && match.participant_f_number !== 9999) allParticipants.add(match.participant_f_number)
              })
              waitingCount = allParticipants.size
            }
          }

          // Get current round participants
          if (currentPhase.startsWith("round_")) {
            const { data: currentRoundMatches, error: currentRoundError } = await supabase
              .from("match_results")
              .select("participant_a_number, participant_b_number, participant_c_number, participant_d_number, participant_e_number, participant_f_number")
              .eq("match_id", STATIC_MATCH_ID)
              .eq("round", currentRound)
            
            if (currentRoundError) {
              console.error("Current round matches error:", currentRoundError);
            } else if (currentRoundMatches) {
              const currentParticipants = new Set()
              currentRoundMatches.forEach(match => {
                if (match.participant_a_number > 0 && match.participant_a_number !== 9999) currentParticipants.add(match.participant_a_number)
                if (match.participant_b_number > 0 && match.participant_b_number !== 9999) currentParticipants.add(match.participant_b_number)
                if (match.participant_c_number > 0 && match.participant_c_number !== 9999) currentParticipants.add(match.participant_c_number)
                if (match.participant_d_number > 0 && match.participant_d_number !== 9999) currentParticipants.add(match.participant_d_number)
                if (match.participant_e_number > 0 && match.participant_e_number !== 9999) currentParticipants.add(match.participant_e_number)
                if (match.participant_f_number > 0 && match.participant_f_number !== 9999) currentParticipants.add(match.participant_f_number)
              })
              currentRoundParticipants = currentParticipants.size
            }
          }

          const result = {
            total_participants: totalParticipants.length,
            form_completed: formCompleted.length,
            waiting_count: waitingCount,
            current_round_participants: currentRoundParticipants,
            current_phase: currentPhase,
            current_round: currentRound
          };

          console.log("Participant stats result:", result);
          return res.status(200).json(result);
        } catch (error) {
          console.error("Error getting participant stats:", error)
          return res.status(500).json({ error: "Failed to get participant stats" })
        }
      }

      if (action === "get-survey-history") {
        const { participant_number } = req.body
        const { data, error } = await supabase
          .from("survey_change_history")
          .select("id, changed_at, previous_answers, new_answers, changed_fields, change_percentage, suspicious_flags")
          .eq("match_id", STATIC_MATCH_ID)
          .eq("participant_number", participant_number)
          .order("changed_at", { ascending: false })
        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ history: data || [] })
      }

      if (action === "get-survey-change-counts") {
        const { data, error } = await supabase
          .from("survey_change_history")
          .select("participant_number, suspicious_flags")
          .eq("match_id", STATIC_MATCH_ID)
        if (error) return res.status(500).json({ error: error.message })
        const counts = {}
        for (const row of (data || [])) {
          const n = row.participant_number
          if (!counts[n]) counts[n] = { count: 0, hasSuspicious: false }
          counts[n].count++
          if (Array.isArray(row.suspicious_flags) && row.suspicious_flags.length > 0) counts[n].hasSuspicious = true
        }
        return res.status(200).json({ counts })
      }

      if (action === "get-waiting-count") {
        // Get participants who have completed form but are waiting for matching
        const { data: formCompleted, error: formError } = await supabase
          .from("participants")
          .select("assigned_number")
          .eq("match_id", STATIC_MATCH_ID)
          .neq("assigned_number", 9999)  // Exclude organizer participant
          .not("survey_data", "is", null)

        if (formError) return res.status(500).json({ error: formError.message })

        // Get current phase
        const { data: eventState, error: eventError } = await supabase
          .from("event_state")
          .select("phase")
          .eq("match_id", STATIC_MATCH_ID)
          .single()

        if (eventError && eventError.code !== 'PGRST116') {
          return res.status(500).json({ error: eventError.message })
        }

        const currentPhase = eventState?.phase || "registration"
        
        // Count waiting participants based on phase
        let waitingCount = 0
        if (currentPhase === "waiting" || currentPhase.startsWith("round_")) {
          // All form-completed participants are waiting during analysis/matching
          waitingCount = formCompleted.length
        }

        return res.status(200).json({ 
          waiting_count: waitingCount,
          total_participants: formCompleted.length,
          current_phase: currentPhase
        })
      }

      if (action === "advance-phase") {
        const { currentPhase } = req.body
        
        // Two-round flow: registration → form → waiting → group_phase → round_1 (same-gender) → waiting_2 → round_2 (opposite-gender)
        const phaseOrder = [
          "registration", "form", "waiting", "group_phase", "round_1", "waiting_2", "round_2"
          /* "waiting_3", "round_3", "waiting_4", "round_4", "group_phase" */
        ]
        
        const currentIndex = phaseOrder.indexOf(currentPhase)
        if (currentIndex === -1) {
          return res.status(400).json({ error: "Invalid phase" })
        }
        
        const nextPhase = currentIndex < phaseOrder.length - 1 ? phaseOrder[currentIndex + 1] : currentPhase
        let currentRound = 1
        if (nextPhase === 'group_phase') {
          currentRound = 0
        } else if (nextPhase.startsWith('round_') || nextPhase.startsWith('waiting_')) {
          currentRound = parseInt(nextPhase.split('_')[1])
        }
        
        const { error } = await supabase
          .from("event_state")
          .upsert({ 
            match_id: STATIC_MATCH_ID, 
            phase: nextPhase,
            current_round: currentRound,
            total_rounds: 2
          }, { onConflict: "match_id" })
        
        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ 
          message: "Phase advanced", 
          new_phase: nextPhase,
          current_round: currentRound
        })
      }
    }

    if (action === "start-global-timer") {
      try {
        const { match_id, round, duration = 1800 } = req.body
        const now = new Date().toISOString()
        
        // Update event state with global timer info
        const { error } = await supabase
          .from("event_state")
          .update({
            global_timer_active: true,
            global_timer_start_time: now,
            global_timer_duration: duration,
            global_timer_round: round
          })
          .eq("match_id", match_id)
        
        if (error) {
          console.error("Error starting global timer:", error)
          return res.status(500).json({ error: "Failed to start global timer" })
        }
        
        return res.status(200).json({ success: true, message: "Global timer started successfully" })
      } catch (err) {
        console.error("Error starting global timer:", err)
        return res.status(500).json({ error: "Failed to start global timer" })
      }
    }

    if (action === "end-global-timer") {
      try {
        const { match_id } = req.body
        
        // Update event state to end global timer
        const { error } = await supabase
          .from("event_state")
          .update({
            global_timer_active: false,
            global_timer_start_time: null,
            global_timer_duration: null,
            global_timer_round: null
          })
          .eq("match_id", match_id)
        
        if (error) {
          console.error("Error ending global timer:", error)
          return res.status(500).json({ error: "Failed to end global timer" })
        }
        
        return res.status(200).json({ success: true, message: "Global timer ended successfully" })
      } catch (err) {
        console.error("Error ending global timer:", err)
        return res.status(500).json({ error: "Failed to end global timer" })
      }
    }

    if (action === "set-results-visibility") {
      try {
        const { visible } = req.body
        console.log(`Setting results visibility to: ${visible} for match_id: ${STATIC_MATCH_ID}`)
        
        // First try to update existing record
        const { data: updateData, error: updateError } = await supabase
          .from("event_state")
          .update({ 
            results_visible: visible
          })
          .eq("match_id", STATIC_MATCH_ID)
          .select()

        if (updateError) {
          console.error("Error updating results visibility:", updateError)
          
          // If update failed, try to insert a new record
          console.log("Update failed, trying to insert new record...")
          const { data: insertData, error: insertError } = await supabase
            .from("event_state")
            .insert({
              match_id: STATIC_MATCH_ID,
              results_visible: visible,
              phase: 'waiting'
            })
            .select()

          if (insertError) {
            console.error("Error inserting event_state record:", insertError)
            return res.status(500).json({ error: `Database error: ${insertError.message}` })
          }
          
          console.log("Successfully inserted new event_state record:", insertData)
        } else {
          console.log("Successfully updated results visibility:", updateData)
        }

        return res.status(200).json({ message: `Results ${visible ? 'shown' : 'hidden'}` })
      } catch (err) {
        console.error("Error setting results visibility:", err)
        return res.status(500).json({ error: "Failed to set results visibility" })
      }
    }

    if (action === "get-results-visibility") {
      try {
        console.log(`Getting results visibility for match_id: ${STATIC_MATCH_ID} and event3: ${EVENT3_MATCH_ID}`)
        // Results should be visible for the main event OR for any event3 (BlindMatch 4.0)
        // event whose phase is final_reveal or whose results_visible is explicitly true.
        const [{ data: mainState, error: mainErr }, { data: e3State, error: e3Err }] = await Promise.all([
          supabase.from("event_state").select("results_visible").eq("match_id", STATIC_MATCH_ID).maybeSingle(),
          supabase.from("event_state").select("results_visible,phase").eq("match_id", EVENT3_MATCH_ID).maybeSingle()
        ])

        if (mainErr) console.error("Error getting main results visibility:", mainErr)
        if (e3Err) console.error("Error getting event3 results visibility:", e3Err)

        const mainVisible = mainState?.results_visible !== false
        const e3Visible = e3State?.phase === "final_reveal" || e3State?.results_visible === true

        // If no event3 state exists yet, default to main visibility.
        const visible = e3State ? (mainVisible || e3Visible) : mainVisible

        return res.status(200).json({ visible })
      } catch (err) {
        console.error("Error getting results visibility:", err)
        return res.status(200).json({ visible: true })
      }
    }

    // 🔹 Set Groups Page Lock
    if (action === "set-groups-locked") {
      try {
        const { locked } = req.body
        console.log(`Setting groups page locked to: ${locked} for match_id: ${STATIC_MATCH_ID}`)

        const { data: updateData, error: updateError } = await supabase
          .from("event_state")
          .update({ groups_locked: !!locked })
          .eq("match_id", STATIC_MATCH_ID)
          .select()

        if (updateError) {
          console.error("Error updating groups_locked:", updateError)
          console.log("Update failed, trying to insert new record...")
          const { data: insertData, error: insertError } = await supabase
            .from("event_state")
            .insert({ match_id: STATIC_MATCH_ID, groups_locked: !!locked, phase: 'waiting' })
            .select()

          if (insertError) {
            console.error("Error inserting event_state record (groups_locked):", insertError)
            return res.status(500).json({ error: `Database error: ${insertError.message}` })
          }
          console.log("Successfully inserted new event_state record (groups_locked):", insertData)
        } else {
          console.log("Successfully updated groups_locked:", updateData)
        }

        return res.status(200).json({ message: `Groups page ${locked ? 'locked' : 'unlocked'}` })
      } catch (err) {
        console.error("Error setting groups_locked:", err)
        return res.status(500).json({ error: "Failed to set groups lock" })
      }
    }

    // 🔹 Get Groups Page Lock
    if (action === "get-groups-locked") {
      try {
        console.log(`Getting groups page locked for match_id: ${STATIC_MATCH_ID}`)
        const { data, error } = await supabase
          .from("event_state")
          .select("groups_locked")
          .eq("match_id", STATIC_MATCH_ID)
          .single()

        if (error) {
          console.error("Error getting groups_locked:", error)
          if (error.code === 'PGRST116') {
            return res.status(200).json({ locked: false })
          }
          return res.status(500).json({ error: error.message })
        }

        const locked = data?.groups_locked === true
        return res.status(200).json({ locked })
      } catch (err) {
        console.error("Error getting groups lock:", err)
        return res.status(500).json({ error: "Failed to get groups lock" })
      }
    }

    if (action === "set-current-event-id") {
      try {
        const { event_id } = req.body
        console.log(`Setting current event ID to: ${event_id}`)
        
        if (!event_id || event_id < 1) {
          return res.status(400).json({ error: "Invalid event_id. Must be a positive integer." })
        }

        // Refuse the whole switch before changing the main event if Event3 is
        // currently preserving a live test snapshot.
        const { data: event3State, error: event3StateError } = await supabase
          .from("event_state")
          .select("test_mode_active,current_event_id")
          .eq("match_id", EVENT3_MATCH_ID)
          .maybeSingle()
        if (event3StateError) {
          return res.status(500).json({ error: `Event3 state lookup failed: ${event3StateError.message}` })
        }
        if (event3State?.test_mode_active === true) {
          return res.status(409).json({ error: "End Event3 test mode before switching events", test_mode: true })
        }

        // Store current event ID in event_state table
        const { error } = await supabase
          .from("event_state")
          .upsert({ 
            match_id: STATIC_MATCH_ID, 
            current_event_id: event_id
          }, { onConflict: "match_id" })

        if (error) {
          console.error("Error setting current event ID:", error)
          return res.status(500).json({ error: `Database error: ${error.message}` })
        }

        // Keep Event3 on the same live event. A stale Event3 pointer prevents
        // the isolated test-mode RPC from starting even though the main admin
        // has already switched events.
        if (event3State && Number(event3State.current_event_id) !== Number(event_id)) {
          const { error: event3SyncError } = await supabase.from("event_state").update({
            current_event_id: event_id,
            phase: "setup",
            global_timer_active: false,
            global_timer_start_time: null,
            global_timer_duration: null,
            global_timer_round: null,
            phase2_score_revealed: false,
            phase3_score_revealed: false,
          }).eq("match_id", EVENT3_MATCH_ID).eq("test_mode_active", false)
          if (event3SyncError) {
            return res.status(500).json({ error: `Event3 event sync failed: ${event3SyncError.message}` })
          }
        }

        console.log(`Successfully set current event ID to: ${event_id}`)
        return res.status(200).json({ message: `Current event ID set to ${event_id}` })
      } catch (err) {
        console.error("Error setting current event ID:", err)
        return res.status(500).json({ error: "Failed to set current event ID" })
      }
    }

    if (action === "get-current-event-id") {
      try {
        console.log("Getting current event ID from event_state")
        
        const { data, error } = await supabase
          .from("event_state")
          .select("current_event_id")
          .eq("match_id", STATIC_MATCH_ID)
          .single()

        if (error) {
          console.error("Error getting current event ID:", error)
          
          // If no record exists, get the maximum event ID as fallback
          if (error.code === 'PGRST116') {
            console.log("No event_state record found, getting max event ID as fallback")
            
            const [participantsResult, matchResultsResult, groupMatchesResult] = await Promise.all([
              supabase
                .from("participants")
                .select("event_id")
                .order("event_id", { ascending: false })
                .limit(1)
                .single(),
              supabase
                .from("match_results")
                .select("event_id")
                .order("event_id", { ascending: false })
                .limit(1)
                .single(),
              supabase
                .from("group_matches")
                .select("event_id")
                .order("event_id", { ascending: false })
                .limit(1)
                .single()
            ])

            let maxEventId = 1
            if (!participantsResult.error && participantsResult.data?.event_id) {
              maxEventId = Math.max(maxEventId, participantsResult.data.event_id)
            }
            if (!matchResultsResult.error && matchResultsResult.data?.event_id) {
              maxEventId = Math.max(maxEventId, matchResultsResult.data.event_id)
            }
            if (!groupMatchesResult.error && groupMatchesResult.data?.event_id) {
              maxEventId = Math.max(maxEventId, groupMatchesResult.data.event_id)
            }

            return res.status(200).json({ current_event_id: maxEventId })
          }
          
          return res.status(500).json({ error: error.message })
        }

        const currentEventId = data?.current_event_id || 1
        console.log(`Current event ID retrieved: ${currentEventId}`)
        return res.status(200).json({ current_event_id: currentEventId })
      } catch (err) {
        console.error("Error getting current event ID:", err)
        return res.status(500).json({ error: "Failed to get current event ID" })
      }
    }

    // 🔹 GET EVENT FEEDBACK PAIRS - Feedback-focused view per event with correct pairing by round
    if (action === "get-event-feedback-pairs") {
      try {
        const { event_id } = req.body
        if (!event_id) {
          return res.status(400).json({ error: "Missing event_id parameter" })
        }

        // Fetch individual matches for the event (exclude organizer)
        const { data: matchResults, error: matchError } = await supabase
          .from("match_results")
          .select(`
            id,
            participant_a_number,
            participant_b_number,
            participant_c_number,
            participant_d_number,
            participant_e_number,
            participant_f_number,
            compatibility_score,
            synergy_score,
            humor_open_score,
            intent_score,
            vibe_compatibility_score,
            lifestyle_compatibility_score,
            communication_compatibility_score,
            humor_early_openness_bonus,
            round,
            table_number,
            match_type,
            mutual_match,
            event_id,
            created_at
          `)
          .eq("match_id", STATIC_MATCH_ID)
          .eq("event_id", event_id)
          .neq("participant_a_number", 9999)
          .neq("participant_b_number", 9999)
          .order("round", { ascending: true })

        if (matchError) {
          console.error("Error fetching match results (feedback pairs):", matchError)
          return res.status(500).json({ error: matchError.message })
        }

        // Keep only true 2-person matches for feedback pairing
        const individualPairs = (matchResults || []).filter(m => {
          const nums = [m.participant_a_number, m.participant_b_number, m.participant_c_number, m.participant_d_number, m.participant_e_number, m.participant_f_number]
          const present = nums.filter(n => !!n && n !== 9999)
          return present.length === 2
        })

        // Fetch participant info for names and demographics
        const { data: participants, error: participantError } = await supabase
          .from("participants")
          .select("assigned_number, name, gender, age, mbti_personality_type, survey_data")
          .eq("match_id", STATIC_MATCH_ID)
          .neq("assigned_number", 9999)

        if (participantError) {
          console.error("Error fetching participants (feedback pairs):", participantError)
          return res.status(500).json({ error: participantError.message })
        }

        const participantMap = new Map()
        participants.forEach(p => {
          participantMap.set(p.assigned_number, {
            number: p.assigned_number,
            name: p.name || `مشارك ${p.assigned_number}`,
            gender: p.gender || 'غير محدد',
            age: p.age || null,
            mbti: p.mbti_personality_type || 'غير محدد'
          })
        })

        // Fetch all feedback rows for this event and match
        const { data: feedbackRows, error: feedbackError } = await supabase
          .from("match_feedback")
          .select(`
            participant_number,
            round,
            event_id,
            compatibility_rate,
            conversation_quality,
            personal_connection,
            shared_interests,
            comfort_level,
            communication_style,
            overall_experience,
            recommendations,
            would_meet_again,
            participant_message,
            submitted_at
          `)
          .eq("match_id", STATIC_MATCH_ID)
          .eq("event_id", event_id)

        if (feedbackError) {
          console.error("Error fetching feedback (feedback pairs):", feedbackError)
          return res.status(500).json({ error: feedbackError.message })
        }

        // Build feedback map: participant_number -> round -> feedback
        const feedbackMap = new Map()
        for (const f of (feedbackRows || [])) {
          if (!feedbackMap.has(f.participant_number)) {
            feedbackMap.set(f.participant_number, new Map())
          }
          feedbackMap.get(f.participant_number).set(f.round, f)
        }

        // Construct response rows with correct pairing by (event_id, round)
        const rows = []
        for (const m of individualPairs) {
          const pA = Math.min(m.participant_a_number, m.participant_b_number)
          const pB = Math.max(m.participant_a_number, m.participant_b_number)
          const roundNo = m.round || 1

          const aInfo = participantMap.get(pA)
          const bInfo = participantMap.get(pB)

          // Pair feedback by the same round
          const aFb = feedbackMap.get(pA)?.get(roundNo) || null
          const bFb = feedbackMap.get(pB)?.get(roundNo) || null

          // Compute fallback 100-pt fields if DB has zeros/missing
          const syn = Number(m.synergy_score ?? 0)
          const hum = Number(m.humor_open_score ?? 0)
          const inten = Number(m.intent_score ?? 0)
          const synergyVal = syn > 0 ? syn : (aInfo && bInfo ? computeSynergyScore(aInfo, bInfo) : 0)
          const humorOpenVal = hum > 0 ? hum : (aInfo && bInfo ? computeHumorOpenScore(aInfo, bInfo) : 0)
          const intentVal = inten > 0 ? inten : (aInfo && bInfo ? computeIntentScore(aInfo, bInfo) : 0)

          rows.push({
            match_result_id: m.id,
            event_id: m.event_id,
            round: roundNo,
            participant_a: aInfo || { number: pA },
            participant_b: bInfo || { number: pB },
            compatibility_score: m.compatibility_score || 0,
            bonus_type: m.humor_early_openness_bonus || 'none',
            mutual_match: m.mutual_match || false,
            // New-model scoring fields for 100-pt breakdown
            synergy_score: synergyVal,
            humor_open_score: humorOpenVal,
            intent_score: intentVal,
            vibe_compatibility_score: m.vibe_compatibility_score || 0,
            lifestyle_compatibility_score: m.lifestyle_compatibility_score || 0,
            communication_compatibility_score: m.communication_compatibility_score || 0,
            feedback_a: aFb,
            feedback_b: bFb,
            avg_compatibility_rate: (() => {
              const a = aFb?.compatibility_rate
              const b = bFb?.compatibility_rate
              if (typeof a === 'number' && typeof b === 'number') return Math.round((a + b) / 2)
              if (typeof a === 'number') return a
              if (typeof b === 'number') return b
              return null
            })()
          })
        }

        // Sort by round asc then avg_compatibility_rate desc
        rows.sort((r1, r2) => {
          if ((r1.round || 0) !== (r2.round || 0)) return (r1.round || 0) - (r2.round || 0)
          const a = r1.avg_compatibility_rate ?? -1
          const b = r2.avg_compatibility_rate ?? -1
          return b - a
        })

        return res.status(200).json({ success: true, event_id, pairs: rows })
      } catch (error) {
        console.error("Error in get-event-feedback-pairs:", error)
        return res.status(500).json({ error: "Failed to fetch event feedback pairs" })
      }
    }

    // 🔹 SWAP TWO PARTICIPANTS BETWEEN GROUPS (with validation and score recalculation)
    if (action === "swap-group-participants") {
      try {
        const {
          event_id = 1,
          groupA_number,
          participantA,
          groupB_number,
          participantB, // when null/undefined => move (A -> B)
          allowOverride = false
        } = req.body

        if (!groupA_number || !groupB_number || !participantA) {
          return res.status(400).json({ error: "Missing required fields: groupA_number, participantA, groupB_number" })
        }

        // Helper calculators (minimal replicas from trigger-match)
        function calculateMBTICompatibility(type1, type2) {
          if (!type1 || !type2) return 0
          let score = 0
          const i1 = type1[0], i2 = type2[0]
          if (i1 === 'E' && i2 === 'E') score += 2.5; else if (i1 !== i2) score += 2.5
          let match3 = 0
          if (type1[1] === type2[1]) match3++
          if (type1[2] === type2[2]) match3++
          if (type1[3] === type2[3]) match3++
          if (match3 >= 2) score += 2.5
          return score
        }
        function calculateAttachmentCompatibility(a, b) {
          if (!a || !b) return 2.5
          if (a === 'Secure' || b === 'Secure') return 5
          const best = { 'Anxious':['Secure'],'Avoidant':['Secure'],'Fearful':['Secure'],'Mixed (Secure-Anxious)':['Secure'],'Mixed (Secure-Avoidant)':['Secure'],'Mixed (Secure-Fearful)':['Secure'],'Mixed (Anxious-Avoidant)':['Secure'],'Mixed (Anxious-Fearful)':['Secure'],'Mixed (Avoidant-Fearful)':['Secure'] }
          return (best[a]||[]).includes(b) ? 5 : 2.5
        }
        function calculateCommunicationCompatibility(a, b) {
          if (!a || !b) return 4
          if ((a === 'Aggressive' && b === 'Passive-Aggressive') || (b === 'Aggressive' && a === 'Passive-Aggressive')) return 0
          if ((a === 'Assertive' && b === 'Passive') || (a === 'Passive' && b === 'Assertive')) return 10
          const mat = { 'Assertive':{top1:'Assertive',top2:'Passive'}, 'Passive':{top1:'Assertive',top2:'Passive'}, 'Aggressive':{top1:'Assertive',top2:'Aggressive'}, 'Passive-Aggressive':{top1:'Assertive',top2:'Passive-Aggressive'} }
          const c = mat[a]; if (!c) return 4
          if (c.top1 === b) return 10; if (c.top2 === b) return 8; return 4
        }
        function calculateLifestyleCompatibility(p1, p2) {
          if (!p1 || !p2) return 0
          const a = p1.split(','), b = p2.split(','); if (a.length!==5 || b.length!==5) return 0
          const w = [1.25,1.25,1.25,1.25,1.25]; let tot=0, max=0
          for (let i=0;i<5;i++){ let q=0; if (i===0){ q=4 } else if (a[i]===b[i]){ q=4 } else if ((a[i]==='أ'&&b[i]==='ب')||(a[i]==='ب'&&b[i]==='أ')||(a[i]==='ب'&&b[i]==='ج')||(a[i]==='ج'&&b[i]==='ب')){ q=3 } else { q=0 }
            tot += q*w[i]; max += 4*w[i]; }
          let final = (tot/max)*25
          const q5a=a[4], q5b=b[4]; if ((q5a==='أ'&&q5b==='ج')||(q5a==='ج'&&q5b==='أ')) final -= 5
          return Math.max(0, final)
        }
        function calculateCoreValuesCompatibility(v1, v2) {
          if (!v1 || !v2) return 0
          const a=v1.split(','), b=v2.split(','); if (a.length!==5 || b.length!==5) return 0
          let s=0; for (let i=0;i<5;i++){ if (a[i]===b[i]) s+=4; else if ((a[i]==='ب'&&(b[i]==='أ'||b[i]==='ج')) || (b[i]==='ب'&&(a[i]==='أ'||a[i]==='ج'))) s+=2; }
          return s
        }
        function pairTotalScore(pa, pb){
          const mbtiA = pa.mbti_personality_type || pa.survey_data?.mbtiType
          const mbtiB = pb.mbti_personality_type || pb.survey_data?.mbtiType
          const attA = pa.attachment_style || pa.survey_data?.attachmentStyle
          const attB = pb.attachment_style || pb.survey_data?.attachmentStyle
          const commA = pa.communication_style || pa.survey_data?.communicationStyle
          const commB = pb.communication_style || pb.survey_data?.communicationStyle
          const lifeA = pa.survey_data?.lifestylePreferences || (pa.survey_data?.answers ? [pa.survey_data.answers.lifestyle_1,pa.survey_data.answers.lifestyle_2,pa.survey_data.answers.lifestyle_3,pa.survey_data.answers.lifestyle_4,pa.survey_data.answers.lifestyle_5].join(',') : '')
          const lifeB = pb.survey_data?.lifestylePreferences || (pb.survey_data?.answers ? [pb.survey_data.answers.lifestyle_1,pb.survey_data.answers.lifestyle_2,pb.survey_data.answers.lifestyle_3,pb.survey_data.answers.lifestyle_4,pb.survey_data.answers.lifestyle_5].join(',') : '')
          const valsA = pa.survey_data?.coreValues || (pa.survey_data?.answers ? [pa.survey_data.answers.core_values_1,pa.survey_data.answers.core_values_2,pa.survey_data.answers.core_values_3,pa.survey_data.answers.core_values_4,pa.survey_data.answers.core_values_5].join(',') : '')
          const valsB = pb.survey_data?.coreValues || (pb.survey_data?.answers ? [pb.survey_data.answers.core_values_1,pb.survey_data.answers.core_values_2,pb.survey_data.answers.core_values_3,pb.survey_data.answers.core_values_4,pb.survey_data.answers.core_values_5].join(',') : '')
          return (
            calculateMBTICompatibility(mbtiA, mbtiB) +
            calculateAttachmentCompatibility(attA, attB) +
            calculateCommunicationCompatibility(commA, commB) +
            calculateLifestyleCompatibility(lifeA, lifeB) +
            calculateCoreValuesCompatibility(valsA, valsB)
          )
        }
        function calculateGroupScore(groupNums, pMap){
          let total=0, pairs=0
          for (let i=0;i<groupNums.length;i++){
            for (let j=i+1;j<groupNums.length;j++){
              const a=pMap.get(groupNums[i]); const b=pMap.get(groupNums[j]);
              if (a && b){ total += pairTotalScore(a,b); pairs++ }
            }
          }
          return pairs>0 ? Math.round((total/pairs)) : 0
        }
        async function buildWarnings(groupNums, pMap){
          const warnings=[]
          const participants = groupNums.map(n=>pMap.get(n)).filter(Boolean)
          // Gender balance + female cap
          const genders = participants.map(p=>p.gender || p.survey_data?.gender).filter(Boolean)
          const male = genders.filter(g=>g==='male').length
          const female = genders.filter(g=>g==='female').length
          if (male===0 || female===0) warnings.push(`لا يوجد توازن بين الجنسين (${male}♂ / ${female}♀)`) 
          if (female>2) warnings.push(`عدد الإناث يتجاوز الحد المسموح ( ${female} > 2 )`)
          // Initiator presence (Q35 conversational_role)
          const roles = participants
            .map(p => p?.survey_data?.answers?.conversational_role || p?.conversational_role || p?.survey_data?.conversational_role)
            .filter(Boolean)
            .map(v => String(v).toUpperCase())
          const hasInitiator = roles.some(r => r === 'A' || r === 'INITIATOR' || r === 'INITIATE' || r === 'LEADER' || r === 'مبادر' || r === 'المبادر')
          if (roles.length === participants.length && !hasInitiator) warnings.push("لا يوجد مُبادر (Q35) ضمن المجموعة")
          // Conversation depth mismatch
          const conv = participants
            .map(p => {
              const raw = p?.survey_data?.answers?.vibe_4 || p?.survey_data?.vibe_4 || p?.survey_data?.conversation_depth_pref
              const v = String(raw || '').trim().toUpperCase()
              if (v === 'نعم' || v === 'نَعَم' || v === 'YES' || v === 'Y' || v === 'TRUE' || v === '1') return 'yes'
              if (v === 'لا' || v === 'لَا' || v === 'NO' || v === 'N' || v === 'FALSE' || v === '0') return 'no'
              return null
            })
            .filter(Boolean)
          const yes = conv.filter(v=>v==='yes').length; const no = conv.filter(v=>v==='no').length
          if (yes>0 && no>0) warnings.push("تعارض في عمق المحادثة (لا يمكن مزج 'نعم' و'لا')")
          // Payment status
          const unpaid = participants
            .filter(p => !(p.PAID_DONE === true && Number(p.payment_completed_event_id) === Number(event_id)))
            .map(p => p.assigned_number)
          if (unpaid.length>0) warnings.push(`مشاركون غير مسددين: [${unpaid.join(', ')}]`)
          // Wide age range (soft)
          const ages = participants.map(p=>p.age || p.survey_data?.age).filter(a=>a!==undefined && a!==null)
          if (ages.length===participants.length){ const rng=Math.max(...ages)-Math.min(...ages); if (rng>15) warnings.push(`فارق عمر كبير داخل المجموعة (${rng} سنة)`) }
          // Previously matched pairs inside same group (current event)
          if (groupNums.length>=2){
            const setNums = groupNums
            const { data: prev, error: prevErr } = await supabase
              .from('match_results')
              .select('participant_a_number, participant_b_number, round')
              .eq('event_id', event_id)
            if (!prevErr && prev){
              for (const r of prev){
                if (setNums.includes(r.participant_a_number) && setNums.includes(r.participant_b_number) && (r.round === null || r.round >= 0)){
                  warnings.push(`الثنائي ${r.participant_a_number}×${r.participant_b_number} كانا متطابقين مسبقاً`)
                }
              }
            }
          }
          return warnings
        }

        // 1) Load both groups
        const { data: groupA, error: errA } = await supabase
          .from('group_matches')
          .select('*')
          .eq('match_id', STATIC_MATCH_ID)
          .eq('event_id', event_id)
          .eq('group_number', groupA_number)
          .single()
        if (errA || !groupA) { return res.status(404).json({ error: 'Group A not found' }) }

        const { data: groupB, error: errB } = await supabase
          .from('group_matches')
          .select('*')
          .eq('match_id', STATIC_MATCH_ID)
          .eq('event_id', event_id)
          .eq('group_number', groupB_number)
          .single()
        if (errB || !groupB) { return res.status(404).json({ error: 'Group B not found' }) }

        const arrA = [...(groupA.participant_numbers || [])]
        const arrB = [...(groupB.participant_numbers || [])]
        if (!arrA.includes(participantA)) { return res.status(400).json({ error: `Participant #${participantA} not in group ${groupA_number}` }) }
        const isMove = participantB === null || participantB === undefined || participantB === 0
        if (!isMove) {
          if (!arrB.includes(participantB)) { return res.status(400).json({ error: `Participant #${participantB} not in group ${groupB_number}` }) }
        }

        // 2) Build swapped arrays
        const idxA = arrA.indexOf(participantA)
        const idxB = isMove ? -1 : arrB.indexOf(participantB)
        const newA = [...arrA]; const newB = [...arrB]
        if (groupA_number === groupB_number) {
          // Reorder inside the same group
          if (isMove) {
            // Move within same group to an "empty" slot is a no-op (no empty slots exist if same group)
            return res.status(400).json({ error: 'Cannot move to empty spot within the same group' })
          } else {
            newA[idxA] = participantB
            newA[idxB] = participantA
          }
        } else if (isMove) {
          // Move participantA from A to B (append at end)
          const MAX_GROUP_SIZE = 6
          const MIN_GROUP_SIZE = 3
          const afterA = newA.length - 1
          const afterB = newB.length + 1
          if (afterA < MIN_GROUP_SIZE) {
            return res.status(400).json({ error: `Move would violate minimum size (>=${MIN_GROUP_SIZE}) for group ${groupA_number}` })
          }
          if (afterB > MAX_GROUP_SIZE) {
            return res.status(400).json({ error: `Move would exceed maximum size (${MAX_GROUP_SIZE}) for group ${groupB_number}` })
          }
          newA.splice(idxA, 1)
          newB.push(participantA)
        } else {
          // Cross-group swap
          newA[idxA] = participantB
          newB[idxB] = participantA
        }

        // 3) Load participants data (for both groups)
        const allNums = Array.from(new Set(groupA_number === groupB_number ? [...newA] : [...newA, ...newB]))
        const { data: pData, error: pErr } = await supabase
          .from('participants')
          .select('assigned_number, survey_data, mbti_personality_type, attachment_style, communication_style, gender, age, PAID_DONE, payment_completed_event_id, name')
          .in('assigned_number', allNums)
        if (pErr) { return res.status(500).json({ error: 'Failed fetching participants' }) }
        const pMap = new Map(pData.map(p=>[p.assigned_number, p]))

        // 4) Recompute scores
        const scoreA = calculateGroupScore(newA, pMap)
        const scoreB = groupA_number === groupB_number ? null : calculateGroupScore(newB, pMap)

        // 5) Validate eligibility and build warnings
        const warningsA = await buildWarnings(newA, pMap)
        const warningsB = groupA_number === groupB_number ? [] : await buildWarnings(newB, pMap)
        const hasWarnings = (warningsA.length + (warningsB?.length || 0)) > 0

        // 6) If warnings and not override -> return for confirmation
        if (hasWarnings && !allowOverride) {
          return res.status(200).json({
            success: false,
            warnings: groupA_number === groupB_number
              ? { [groupA_number]: warningsA }
              : { [groupA_number]: warningsA, [groupB_number]: warningsB },
            proposed: groupA_number === groupB_number
              ? { [groupA_number]: { participant_numbers: newA, compatibility_score: scoreA } }
              : { [groupA_number]: { participant_numbers: newA, compatibility_score: scoreA }, [groupB_number]: { participant_numbers: newB, compatibility_score: scoreB } }
          })
        }

        // 7) Persist swap
        function namesFor(groupNums){
          return groupNums.map(n=>{
            const p=pMap.get(n); return (p?.survey_data?.name) || p?.name || `المشارك #${n}`
          })
        }

        if (groupA_number === groupB_number) {
          const { error: upSame } = await supabase
            .from('group_matches')
            .update({ participant_numbers: newA, participant_names: namesFor(newA), compatibility_score: scoreA })
            .eq('match_id', STATIC_MATCH_ID)
            .eq('event_id', event_id)
            .eq('group_number', groupA_number)
          if (upSame) { return res.status(500).json({ error: 'Failed updating group' }) }
          return res.status(200).json({
            success: true,
            updated: { [groupA_number]: { participant_numbers: newA, participant_names: namesFor(newA), compatibility_score: scoreA } },
            warnings: { [groupA_number]: warningsA }
          })
        } else {
          const { error: upA } = await supabase
            .from('group_matches')
            .update({ participant_numbers: newA, participant_names: namesFor(newA), compatibility_score: scoreA })
            .eq('match_id', STATIC_MATCH_ID)
            .eq('event_id', event_id)
            .eq('group_number', groupA_number)
          if (upA) { return res.status(500).json({ error: 'Failed updating group A' }) }

          const { error: upB } = await supabase
            .from('group_matches')
            .update({ participant_numbers: newB, participant_names: namesFor(newB), compatibility_score: scoreB })
            .eq('match_id', STATIC_MATCH_ID)
            .eq('event_id', event_id)
            .eq('group_number', groupB_number)
          if (upB) { return res.status(500).json({ error: 'Failed updating group B' }) }

          return res.status(200).json({
            success: true,
            updated: {
              [groupA_number]: { participant_numbers: newA, participant_names: namesFor(newA), compatibility_score: scoreA },
              [groupB_number]: { participant_numbers: newB, participant_names: namesFor(newB), compatibility_score: scoreB }
            },
            warnings: { [groupA_number]: warningsA, [groupB_number]: warningsB }
          })
        }

      } catch (error) {
        console.error('Error in swap-group-participants:', error)
        return res.status(500).json({ error: 'Failed to swap group participants' })
      }
    }

    if (action === "get-all-match-history") {
      try {
        const { match_id } = req.body
        console.log("Fetching all match history for match_id:", match_id)
        
        // Fetch all matches from match_results
        const { data: matches, error: matchError } = await supabase
          .from("match_results")
          .select("participant_a_number, participant_b_number, round, event_id, created_at")
          .eq("match_id", match_id || STATIC_MATCH_ID)
          .order("created_at", { ascending: false })
        
        if (matchError) {
          console.error("Error fetching matches:", matchError)
          return res.status(500).json({ error: matchError.message })
        }
        
        // Fetch all participants to get names
        const { data: participants, error: participantError } = await supabase
          .from("participants")
          .select("assigned_number, name, survey_data")
          .eq("match_id", match_id || STATIC_MATCH_ID)
        
        if (participantError) {
          console.error("Error fetching participants:", participantError)
          return res.status(500).json({ error: participantError.message })
        }
        
        // Create a map of participant numbers to names
        const participantNameMap = {}
        participants.forEach(p => {
          participantNameMap[p.assigned_number] = p.name || p.survey_data?.name || `Participant #${p.assigned_number}`
        })
        
        // Organize matches by participant
        const matchHistory = {}
        matches.forEach(match => {
          const participantA = match.participant_a_number
          const participantB = match.participant_b_number
          
          // Skip matches with organizer (#9999)
          if (participantA === 9999 || participantB === 9999) {
            return
          }
          
          // Add to participant A's history
          if (!matchHistory[participantA]) matchHistory[participantA] = []
          matchHistory[participantA].push({
            partner_number: participantB,
            partner_name: participantNameMap[participantB],
            round: match.round,
            event_id: match.event_id,
            created_at: match.created_at
          })
          
          // Add to participant B's history
          if (!matchHistory[participantB]) matchHistory[participantB] = []
          matchHistory[participantB].push({
            partner_number: participantA,
            partner_name: participantNameMap[participantA],
            round: match.round,
            event_id: match.event_id,
            created_at: match.created_at
          })
        })
        
        console.log(`Fetched match history for ${Object.keys(matchHistory).length} participants`)
        return res.status(200).json({ success: true, matchHistory })
      } catch (err) {
        console.error("Error getting match history:", err)
        return res.status(500).json({ error: "Failed to get match history" })
      }
    }

    // 🔹 GET IMPRESSIONS — fetch organizer impressions written ABOUT a specific person across all event3 events
    if (action === "get-impressions") {
      try {
        const { participant_number } = req.body
        const targetNum = Number(participant_number)
        if (!Number.isFinite(targetNum) || targetNum <= 0 || targetNum === 9999) {
          return res.status(400).json({ error: "Invalid participant_number" })
        }

        // Fetch all event3_matches rows where this person is a phase2 or phase3 partner
        const { data: phase2Rows, error: p2Err } = await supabase
          .from("event3_matches")
          .select("participant_number, event_id, phase2_feedback")
          .eq("match_id", EVENT3_MATCH_ID)
          .eq("phase2_partner", targetNum)

        const { data: phase3Rows, error: p3Err } = await supabase
          .from("event3_matches")
          .select("participant_number, event_id, phase3_feedback")
          .eq("match_id", EVENT3_MATCH_ID)
          .eq("phase3_partner", targetNum)

        if (p2Err) console.error("[get-impressions] phase2 query error:", p2Err.message)
        if (p3Err) console.error("[get-impressions] phase3 query error:", p3Err.message)

        // Collect unique commenter numbers for name lookup
        const commenterNumbers = new Set()
        for (const r of [...(phase2Rows || []), ...(phase3Rows || [])]) {
          if (r.participant_number && r.participant_number !== 9999) commenterNumbers.add(r.participant_number)
        }

        // Fetch commenter names
        let nameMap = {}
        if (commenterNumbers.size > 0) {
          const { data: commenters } = await supabase
            .from("participants")
            .select("assigned_number, name, survey_data")
            .eq("match_id", STATIC_MATCH_ID)
            .in("assigned_number", Array.from(commenterNumbers))
          for (const c of commenters || []) {
            nameMap[c.assigned_number] = c.name || c.survey_data?.name || `#${c.assigned_number}`
          }
        }

        const impressions = []
        const seen = new Set()

        for (const r of (phase2Rows || [])) {
          const fb = r.phase2_feedback
          if (!fb || typeof fb !== 'object') continue
          const text = fb.organizerImpression
          if (!text || String(text).trim() === '') continue
          const fromNum = Number(r.participant_number)
          if (fromNum === 9999) continue
          const key = `${r.event_id}-phase2-${fromNum}-${String(text).trim()}`
          if (seen.has(key)) continue
          seen.add(key)
          impressions.push({ from_number: fromNum, from_name: nameMap[fromNum] || `#${fromNum}`, text: String(text), event_id: r.event_id, phase: 'phase2' })
        }

        for (const r of (phase3Rows || [])) {
          const fb = r.phase3_feedback
          if (!fb || typeof fb !== 'object') continue
          const text = fb.organizerImpression
          if (!text || String(text).trim() === '') continue
          const fromNum = Number(r.participant_number)
          if (fromNum === 9999) continue
          const key = `${r.event_id}-phase3-${fromNum}-${String(text).trim()}`
          if (seen.has(key)) continue
          seen.add(key)
          impressions.push({ from_number: fromNum, from_name: nameMap[fromNum] || `#${fromNum}`, text: String(text), event_id: r.event_id, phase: 'phase3' })
        }

        impressions.sort((a, b) => (b.event_id || 0) - (a.event_id || 0))

        return res.status(200).json({ success: true, impressions, target: targetNum })
      } catch (err) {
        console.error("Error in get-impressions:", err)
        return res.status(500).json({ error: "Failed to get impressions" })
      }
    }

    if (action === "get-match-results-for-export") {
      try {
        const { event_id } = req.body
        console.log(`Fetching match results for export - event_id: ${event_id}`)
        
        // Fetch all individual matches from match_results table
        const { data: matches, error: matchError } = await supabase
          .from("match_results")
          .select(`
            participant_a_number,
            participant_b_number,
            compatibility_score,
            round,
            table_number,
            match_type,
            event_id,
            created_at,
            mbti_compatibility_score,
            attachment_compatibility_score,
            communication_compatibility_score,
            lifestyle_compatibility_score,
            core_values_compatibility_score,
            vibe_compatibility_score,
            synergy_score,
            humor_open_score,
            intent_score,
            humor_multiplier,
            attachment_penalty_applied,
            intent_boost_applied,
            dead_air_veto_applied,
            humor_clash_veto_applied,
            cap_applied,
            humor_early_openness_bonus
          `)
          .eq("match_id", STATIC_MATCH_ID)
          .eq("event_id", event_id || 1)
          .not("round", "is", null)
          .gt("round", 0)
          .order("round", { ascending: true })
          .order("table_number", { ascending: true })
        
        if (matchError) {
          console.error("Error fetching match results:", matchError)
          return res.status(500).json({ error: matchError.message })
        }
        
        console.log(`✅ Fetched ${matches.length} individual match results`)
        return res.status(200).json({ matches })
      } catch (err) {
        console.error("Error getting match results for export:", err)
        return res.status(500).json({ error: "Failed to get match results" })
      }
    }

    if (action === "e3-export-full-analysis") {
      try {
        const { event_id } = req.body
        const fetchAll = !event_id || event_id === "all"
        console.log(`[e3-export-full-analysis] Fetching for ${fetchAll ? "ALL events" : `event_id: ${event_id}`}`)

        // Discover all event_ids that have data in event3 tables
        let targetEventIds = []
        if (fetchAll) {
          const [{ data: epEvents }, { data: matchEvents }] = await Promise.all([
            supabase.from("event3_participants").select("event_id").eq("match_id", EVENT3_MATCH_ID),
            supabase.from("event3_matches").select("event_id").eq("match_id", EVENT3_MATCH_ID),
          ])
          const eventSet = new Set()
          for (const r of epEvents || []) if (r.event_id) eventSet.add(r.event_id)
          for (const r of matchEvents || []) if (r.event_id) eventSet.add(r.event_id)
          targetEventIds = Array.from(eventSet).sort((a, b) => a - b)
          console.log(`[e3-export-full-analysis] Found ${targetEventIds.length} events: ${targetEventIds.join(", ")}`)
        } else {
          targetEventIds = [Number(event_id)]
        }

        // Aggregate results across all events
        const allPairs = []
        const allParticipants = []
        const allCacheScores = {}
        const allMatchRows = []
        const participantSeen = new Set()

        for (const eid of targetEventIds) {
          // 1. Fetch event3_participants (selected participants for this event)
          const { data: ep, error: epError } = await supabase
            .from("event3_participants")
            .select("participant_number, position")
            .eq("match_id", EVENT3_MATCH_ID)
            .eq("event_id", eid)
            .order("position", { ascending: true })

          if (epError) {
            console.error(`[e3-export-full-analysis] Error fetching event3_participants for event ${eid}:`, epError)
            continue
          }

          const selectedNumbers = (ep || []).map(r => r.participant_number)
          if (selectedNumbers.length === 0) {
            console.log(`[e3-export-full-analysis] No participants for event ${eid}, skipping`)
            continue
          }

          // 2. Fetch event3_matches
          const { data: matchRows, error: matchError } = await supabase
            .from("event3_matches")
            .select("participant_number, phase2_partner, phase2_score, phase3_partner, phase3_score, phase2_word, phase3_word, phase2_feedback, phase3_feedback, match_preference")
            .eq("match_id", EVENT3_MATCH_ID)
            .eq("event_id", eid)
            .in("participant_number", selectedNumbers)

          if (matchError) {
            console.error(`[e3-export-full-analysis] Error fetching event3_matches for event ${eid}:`, matchError)
            continue
          }

          // 3. Fetch full participant data
          const { data: participants, error: participantError } = await supabase
            .from("participants")
            .select("*")
            .eq("match_id", STATIC_MATCH_ID)
            .in("assigned_number", selectedNumbers)

          if (participantError) {
            console.error(`[e3-export-full-analysis] Error fetching participants for event ${eid}:`, participantError)
            continue
          }

          // 4. Batch-fetch compatibility_cache scores
          const { data: cachedPairs } = await fetchAllCachedPairs("compatibility_cache", selectedNumbers)
          const _participantMap = new Map((participants || []).map(p => [p.assigned_number, p]))
          for (const c of cachedPairs || []) {
            const key = `${c.participant_a_number}-${c.participant_b_number}`
            const pA = _participantMap.get(c.participant_a_number)
            const pB = _participantMap.get(c.participant_b_number)
            let humorOpen = 0
            if (pA && pB) {
              try { const { score } = calculateHumorOpennessScore(pA, pB); humorOpen = score } catch (_) {}
            }
            if (!allCacheScores[key]) {
              allCacheScores[key] = {
                total: parseFloat(c.total_compatibility_score),
                mbti: parseFloat(c.mbti_score),
                attachment: parseFloat(c.attachment_score),
                communication: parseFloat(c.communication_score),
                lifestyle: parseFloat(c.lifestyle_score),
                coreValues: parseFloat(c.core_values_score),
                vibe: parseFloat(c.ai_vibe_score),
                synergy: parseFloat(c.interaction_synergy_score),
                intent: parseFloat(c.intent_goal_score),
                humorOpen,
                humorMultiplier: parseFloat(c.humor_multiplier || 1.0),
                humorBonus: c.humor_early_openness_bonus || 'none',
              }
            }
          }

          // Deduplicate participants
          for (const p of participants || []) {
            if (!participantSeen.has(p.assigned_number)) {
              participantSeen.add(p.assigned_number)
              allParticipants.push(p)
            }
          }

          // Tag match rows with event_id
          for (const mr of matchRows || []) {
            allMatchRows.push({ ...mr, event_id: eid })
          }

          // 5. Build unique established pairs for this event
          const pairSet = new Set()
          const matchMap = new Map((matchRows || []).map(m => [m.participant_number, m]))

          for (const row of matchRows || []) {
            if (row.phase2_partner) {
              const [a, b] = [row.participant_number, row.phase2_partner].sort((x, y) => x - y)
              const key = `${a}-${b}`
              if (!pairSet.has(key)) {
                pairSet.add(key)
                const partnerRow = matchMap.get(row.phase2_partner)
                const rowIsA = row.participant_number === a
                allPairs.push({
                  a_number: a,
                  b_number: b,
                  phase: 'phase2',
                  phase2_score: row.phase2_score,
                  a_feedback: rowIsA ? row.phase2_feedback : (partnerRow?.phase2_feedback || null),
                  b_feedback: rowIsA ? (partnerRow?.phase2_feedback || null) : row.phase2_feedback,
                  a_word: rowIsA ? row.phase2_word : (partnerRow?.phase2_word || null),
                  b_word: rowIsA ? (partnerRow?.phase2_word || null) : row.phase2_word,
                  a_match_preference: rowIsA ? (row.match_preference || null) : (partnerRow?.match_preference || null),
                  b_match_preference: rowIsA ? (partnerRow?.match_preference || null) : (row.match_preference || null),
                  event_id: eid,
                })
              }
            }
            if (row.phase3_partner) {
              const [a, b] = [row.participant_number, row.phase3_partner].sort((x, y) => x - y)
              const key = `${a}-${b}-p3`
              if (!pairSet.has(key)) {
                pairSet.add(key)
                const partnerRow = matchMap.get(row.phase3_partner)
                const rowIsA = row.participant_number === a
                allPairs.push({
                  a_number: a,
                  b_number: b,
                  phase: 'phase3',
                  phase3_score: row.phase3_score,
                  a_feedback: rowIsA ? row.phase3_feedback : (partnerRow?.phase3_feedback || null),
                  b_feedback: rowIsA ? (partnerRow?.phase3_feedback || null) : row.phase3_feedback,
                  a_word: rowIsA ? row.phase3_word : (partnerRow?.phase3_word || null),
                  b_word: rowIsA ? (partnerRow?.phase3_word || null) : row.phase3_word,
                  a_match_preference: rowIsA ? (row.match_preference || null) : (partnerRow?.match_preference || null),
                  b_match_preference: rowIsA ? (partnerRow?.match_preference || null) : (row.match_preference || null),
                  event_id: eid,
                })
              }
            }
          }
        }

        console.log(`[e3-export-full-analysis] ✅ ${allPairs.length} established pairs across ${targetEventIds.length} events, ${allParticipants.length} participants, ${Object.keys(allCacheScores).length} cached scores`)
        return res.status(200).json({ pairs: allPairs, participants: allParticipants, cacheScores: allCacheScores, matchRows: allMatchRows, event_ids: targetEventIds })
      } catch (err) {
        console.error("[e3-export-full-analysis] Error:", err)
        return res.status(500).json({ error: "Failed to get export data" })
      }
    }

    if (action === "set-registration-enabled") {
      try {
        const { enabled } = req.body
        console.log(`Setting registration enabled to: ${enabled} for match_id: ${STATIC_MATCH_ID}`)
        
        // First try to update existing record
        const { data: updateData, error: updateError } = await supabase
          .from("event_state")
          .update({ 
            registration_enabled: enabled
          })
          .eq("match_id", STATIC_MATCH_ID)
          .select()

        if (updateError) {
          console.error("Error updating registration enabled:", updateError)
          
          // If update failed, try to insert a new record
          console.log("Update failed, trying to insert new record...")
          const { data: insertData, error: insertError } = await supabase
            .from("event_state")
            .insert({
              match_id: STATIC_MATCH_ID,
              registration_enabled: enabled,
              phase: 'waiting'
            })
            .select()

          if (insertError) {
            console.error("Error inserting event_state record:", insertError)
            return res.status(500).json({ error: `Database error: ${insertError.message}` })
          }
          
          console.log("Successfully inserted new event_state record:", insertData)
        } else {
          console.log("Successfully updated registration enabled:", updateData)
        }

        return res.status(200).json({ message: `Registration ${enabled ? 'enabled' : 'disabled'}` })
      } catch (err) {
        console.error("Error setting registration enabled:", err)
        return res.status(500).json({ error: "Failed to set registration enabled" })
      }
    }

    if (action === "get-registration-enabled") {
      try {
        console.log(`Getting registration enabled for match_id: ${STATIC_MATCH_ID}`)
        
        const { data, error } = await supabase
          .from("event_state")
          .select("registration_enabled")
          .eq("match_id", STATIC_MATCH_ID)
          .single()

        if (error) {
          console.error("Error getting registration enabled:", error)
          
          // If no record exists, return default (true)
          if (error.code === 'PGRST116') {
            console.log("No event_state record found, returning default registration enabled (true)")
            return res.status(200).json({ enabled: true })
          }
          
          return res.status(500).json({ error: error.message })
        }

        const enabled = data?.registration_enabled !== false // Default to true if null/undefined
        console.log(`Registration enabled retrieved: ${enabled}`)
        return res.status(200).json({ enabled })
      } catch (err) {
        console.error("Error getting registration enabled:", err)
        return res.status(500).json({ error: "Failed to get registration enabled" })
      }
    }

    if (action === "set-event-finished") {
      try {
        const { event_id, finished } = req.body
        console.log(`Setting event ${event_id} finished status to: ${finished}`)
        
        // Update all match_results records for this event_id
        const { data: updateData, error: updateError } = await supabase
          .from("match_results")
          .update({ 
            event_finished: finished
          })
          .eq("event_id", event_id)
          .select()

        if (updateError) {
          console.error("Error updating event finished status:", updateError)
          return res.status(500).json({ error: `Database error: ${updateError.message}` })
        }
        
        console.log(`Successfully updated ${updateData?.length || 0} match results for event ${event_id}`)
        return res.status(200).json({ message: `Event ${event_id} ${finished ? 'finished' : 'ongoing'}` })
      } catch (err) {
        console.error("Error setting event finished:", err)
        return res.status(500).json({ error: "Failed to set event finished status" })
      }
    }

    if (action === "get-event-finished") {
      try {
        const { event_id } = req.body
        console.log(`Getting event finished status for event_id: ${event_id}`)
        
        // REMOVED AUTOMATIC LOGIC: Event finished status is now ONLY controlled by manual admin toggle
        // No longer automatically marking events as finished based on current_event_id
        
        // Check the event_finished flag in match_results
        const { data, error } = await supabase
          .from("match_results")
          .select("event_finished")
          .eq("event_id", event_id)
          .limit(1)
          .maybeSingle()

        if (error) {
          console.error("Error getting event finished status:", error)
          return res.status(500).json({ error: error.message })
        }

        if (!data) {
          console.log(`No match_results records found for event ${event_id}, returning default finished (false)`)
          return res.status(200).json({ finished: false })
        }

        const finished = data?.event_finished === true // Default to false (ongoing) if null/undefined
        console.log(`Event ${event_id} finished status retrieved: ${finished} (raw value: ${data?.event_finished})`)
        return res.status(200).json({ finished })
      } catch (err) {
        console.error("Error getting event finished status:", err)
        return res.status(500).json({ error: "Failed to get event finished status" })
      }
    }
    if (action === "fix-same-gender-feedback") {
      try {
        const { event_id } = req.body
        if (!event_id) return res.status(400).json({ error: "Missing event_id" })
        console.log(`🔧 Fixing same-gender feedback for event ${event_id}`)

        // Step 1: Get all round-1 match results for this event to identify same-gender pairs
        const { data: round1Matches, error: r1Error } = await supabase
          .from("match_results")
          .select("participant_a_number, participant_b_number")
          .eq("match_id", STATIC_MATCH_ID)
          .eq("event_id", event_id)
          .eq("round", 1)

        if (r1Error) return res.status(500).json({ error: r1Error.message })
        if (!round1Matches || round1Matches.length === 0) {
          return res.status(200).json({ success: true, message: "No round-1 matches found for this event", updated: 0, skipped: 0 })
        }

        // Step 2: Fetch gender for all participants involved in round-1 matches
        const allRound1Numbers = []
        for (const m of round1Matches) {
          allRound1Numbers.push(m.participant_a_number, m.participant_b_number)
        }
        const uniqueNumbers = [...new Set(allRound1Numbers)]

        const { data: participantRows, error: pError } = await supabase
          .from("participants")
          .select("assigned_number, gender, survey_data")
          .eq("match_id", STATIC_MATCH_ID)
          .in("assigned_number", uniqueNumbers)

        if (pError) return res.status(500).json({ error: pError.message })

        // Build gender map: assigned_number → gender string
        const genderMap = {}
        for (const p of participantRows || []) {
          const sd = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {})
          genderMap[p.assigned_number] = p.gender || sd?.gender || sd?.answers?.gender || null
        }

        // Step 3: Identify participants who are in a SAME-GENDER round-1 pair
        const sameGenderParticipants = new Set()
        for (const m of round1Matches) {
          const gA = genderMap[m.participant_a_number]
          const gB = genderMap[m.participant_b_number]
          if (gA && gB && String(gA).toLowerCase() === String(gB).toLowerCase()) {
            sameGenderParticipants.add(m.participant_a_number)
            sameGenderParticipants.add(m.participant_b_number)
          }
        }

        console.log(`📊 Found ${sameGenderParticipants.size} participants in same-gender round-1 matches`)

        if (sameGenderParticipants.size === 0) {
          return res.status(200).json({ success: true, message: "No same-gender round-1 matches found", updated: 0, skipped: 0 })
        }

        // Step 4: Get round-1 feedback records for these same-gender participants
        const { data: round1Feedbacks, error: fbError } = await supabase
          .from("match_feedback")
          .select("id, participant_number")
          .eq("match_id", STATIC_MATCH_ID)
          .eq("event_id", event_id)
          .eq("round", 1)
          .in("participant_number", Array.from(sameGenderParticipants))

        if (fbError) return res.status(500).json({ error: fbError.message })

        if (!round1Feedbacks || round1Feedbacks.length === 0) {
          return res.status(200).json({ success: true, message: "No round-1 feedback found for same-gender participants", updated: 0, skipped: 0 })
        }

        console.log(`📝 Found ${round1Feedbacks.length} round-1 feedback records to potentially migrate`)

        // Step 5: Check which of those participants have a round-2 match
        const fbParticipantNumbers = round1Feedbacks.map(f => f.participant_number)
        const { data: round2Matches } = await supabase
          .from("match_results")
          .select("participant_a_number, participant_b_number")
          .eq("match_id", STATIC_MATCH_ID)
          .eq("event_id", event_id)
          .eq("round", 2)

        const hasRound2Match = new Set()
        for (const m of round2Matches || []) {
          hasRound2Match.add(m.participant_a_number)
          hasRound2Match.add(m.participant_b_number)
        }

        // Step 6: Check which already have round-2 feedback (unique constraint guard)
        const { data: existingR2Feedbacks } = await supabase
          .from("match_feedback")
          .select("participant_number")
          .eq("match_id", STATIC_MATCH_ID)
          .eq("event_id", event_id)
          .eq("round", 2)
          .in("participant_number", fbParticipantNumbers)

        const alreadyHasR2Feedback = new Set((existingR2Feedbacks || []).map(f => f.participant_number))

        // Step 7: Update eligible records: round 1 → round 2
        const toUpdate = round1Feedbacks.filter(f =>
          hasRound2Match.has(f.participant_number) &&
          !alreadyHasR2Feedback.has(f.participant_number)
        )
        const skippedConflict = round1Feedbacks.filter(f => alreadyHasR2Feedback.has(f.participant_number))
        const skippedNoR2Match = round1Feedbacks.filter(f => !hasRound2Match.has(f.participant_number) && !alreadyHasR2Feedback.has(f.participant_number))

        let updatedCount = 0
        const errors = []

        for (const feedback of toUpdate) {
          const { error: updateError } = await supabase
            .from("match_feedback")
            .update({ round: 2 })
            .eq("id", feedback.id)

          if (updateError) {
            errors.push(`Participant ${feedback.participant_number}: ${updateError.message}`)
            console.error(`❌ Failed to update feedback for participant ${feedback.participant_number}:`, updateError.message)
          } else {
            updatedCount++
            console.log(`✅ Updated feedback for participant #${feedback.participant_number}: round 1 → 2`)
          }
        }

        console.log(`🔧 Fix complete: ${updatedCount} updated, ${skippedConflict.length} skipped (already had R2 feedback), ${skippedNoR2Match.length} skipped (no R2 match)`)

        return res.status(200).json({
          success: true,
          message: `Fixed ${updatedCount} feedback records: reassigned round 1 → round 2 for same-gender participants in event ${event_id}`,
          updated: updatedCount,
          skipped_conflict: skippedConflict.length,
          skipped_no_r2_match: skippedNoR2Match.length,
          total_same_gender_participants: sameGenderParticipants.size,
          total_with_feedback: round1Feedbacks.length,
          errors: errors.length > 0 ? errors : undefined
        })
      } catch (err) {
        console.error("Error fixing same-gender feedback:", err)
        return res.status(500).json({ error: "Failed to fix same-gender feedback" })
      }
    }

    if (action === "cleanup-incomplete-profiles") {
      try {
        console.log("Starting cleanup of incomplete profiles for match_id:", STATIC_MATCH_ID)
        
        // First, get all participants ordered by assigned_number
        const { data: allParticipants, error: fetchError } = await supabase
          .from("participants")
          .select("id, assigned_number, survey_data")
          .eq("match_id", STATIC_MATCH_ID)
          .neq("assigned_number", 9999) // Exclude organizer participant
          .order("assigned_number", { ascending: true })
        
        if (fetchError) {
          console.error("Error fetching participants:", fetchError)
          return res.status(500).json({ error: "Failed to fetch participants" })
        }
        
        // Protect the last 10 participants (highest assigned numbers) from deletion
        const protectedCount = Math.min(10, allParticipants.length)
        const eligibleForDeletion = allParticipants.slice(0, -protectedCount)
        const protectedParticipants = allParticipants.slice(-protectedCount)
        
        console.log(`Total participants: ${allParticipants.length}, Protected (last 10): ${protectedParticipants.map(p => `#${p.assigned_number}`).join(', ')}`)
        
        // Filter incomplete profiles (those without survey_data only)
        const incompleteParticipants = eligibleForDeletion.filter(p => 
          !p.survey_data || 
          Object.keys(p.survey_data).length === 0
        )
        
        const incompleteIds = incompleteParticipants.map(p => p.id)
        console.log(`Found ${incompleteParticipants.length} incomplete profiles to delete:`, 
          incompleteParticipants.map(p => `#${p.assigned_number}`))
        
        let deletedCount = 0
        
        if (incompleteIds.length > 0) {
          // Delete incomplete participants
          const { error: deleteError } = await supabase
            .from("participants")
            .delete()
            .in("id", incompleteIds)
          
          if (deleteError) {
            console.error("Error deleting incomplete participants:", deleteError)
            return res.status(500).json({ error: "Failed to delete incomplete participants" })
          }
          
          deletedCount = incompleteIds.length
        }
        
        const remainingCount = allParticipants.length - deletedCount
        
        console.log(`Cleanup completed: deleted ${deletedCount} incomplete profiles, ${remainingCount} total profiles remain (${protectedCount} protected from deletion)`)
        
        return res.status(200).json({ 
          deletedCount, 
          remainingCount,
          protectedCount,
          message: `Successfully removed ${deletedCount} incomplete profiles (${protectedCount} participants protected from deletion)` 
        })
      } catch (err) {
        console.error("Error during cleanup:", err)
        return res.status(500).json({ error: "Failed to cleanup incomplete profiles" })
      }
    }

    if (action === "get-participant-results") {
      try {
        const { event_id } = req.body
        console.log(`Getting participant results for event_id: ${event_id}`)
        
        // Get all participants for this match
        const { data: participants, error: participantsError } = await supabase
          .from("participants")
          .select("id, assigned_number, name, survey_data")
          .eq("match_id", STATIC_MATCH_ID)
          .neq("assigned_number", 9999) // Exclude organizer participant
          .order("assigned_number", { ascending: true })
        
        if (participantsError) {
          console.error("Error fetching participants:", participantsError)
          return res.status(500).json({ error: "Failed to fetch participants" })
        }
        
        // Get match results for this event
        const { data: matchResults, error: matchError } = await supabase
          .from("match_results")
          .select(`
            participant_a_number, 
            participant_b_number,
            compatibility_score,
            mbti_compatibility_score,
            attachment_compatibility_score,
            communication_compatibility_score,
            lifestyle_compatibility_score,
            core_values_compatibility_score,
            vibe_compatibility_score,
            synergy_score,
            humor_open_score,
            intent_score,
            humor_multiplier,
            attachment_penalty_applied,
            intent_boost_applied,
            dead_air_veto_applied,
            humor_clash_veto_applied,
            cap_applied,
            humor_early_openness_bonus,
            round
          `)
          .eq("event_id", event_id || 1)
          .order("compatibility_score", { ascending: false })
        
        if (matchError) {
          console.error("Error fetching match results:", matchError)
          return res.status(500).json({ error: "Failed to fetch match results" })
        }
        
        // Create a map of participant results
        const participantResultsMap = new Map()
        
        // Initialize all participants with default values
        participants.forEach(participant => {
          participantResultsMap.set(participant.assigned_number, {
            id: participant.id,
            assigned_number: participant.assigned_number,
            name: participant.name || participant.survey_data?.name || "غير محدد",
            compatibility_score: 0,
            mbti_compatibility_score: 0,
            attachment_compatibility_score: 0,
            communication_compatibility_score: 0,
            lifestyle_compatibility_score: 0,
            core_values_compatibility_score: 0,
            vibe_compatibility_score: 0,
            // New-model fields (aggregated by max for display)
            synergy_score: 0,
            humor_open_score: 0,
            intent_score: 0,
            partner_assigned_number: null,
            partner_name: null
          })
        })
        
        // Update with match results
        matchResults.forEach(match => {
          const participantA = participantResultsMap.get(match.participant_a_number)
          const participantB = participantResultsMap.get(match.participant_b_number)
          
          if (participantA && participantB) {
            // Update participant A
            participantA.compatibility_score = Math.max(participantA.compatibility_score, match.compatibility_score || 0)
            participantA.mbti_compatibility_score = Math.max(participantA.mbti_compatibility_score, match.mbti_compatibility_score || 0)
            participantA.attachment_compatibility_score = Math.max(participantA.attachment_compatibility_score, match.attachment_compatibility_score || 0)
            participantA.communication_compatibility_score = Math.max(participantA.communication_compatibility_score, match.communication_compatibility_score || 0)
            participantA.lifestyle_compatibility_score = Math.max(participantA.lifestyle_compatibility_score, match.lifestyle_compatibility_score || 0)
            participantA.core_values_compatibility_score = Math.max(participantA.core_values_compatibility_score, match.core_values_compatibility_score || 0)
            participantA.vibe_compatibility_score = Math.max(participantA.vibe_compatibility_score, match.vibe_compatibility_score || 0)
            participantA.synergy_score = Math.max(participantA.synergy_score, match.synergy_score || 0)
            participantA.humor_open_score = Math.max(participantA.humor_open_score, match.humor_open_score || 0)
            participantA.intent_score = Math.max(participantA.intent_score, match.intent_score || 0)
            participantA.partner_assigned_number = match.participant_b_number
            participantA.partner_name = participantB.name
            
            // Update participant B
            participantB.compatibility_score = Math.max(participantB.compatibility_score, match.compatibility_score || 0)
            participantB.mbti_compatibility_score = Math.max(participantB.mbti_compatibility_score, match.mbti_compatibility_score || 0)
            participantB.attachment_compatibility_score = Math.max(participantB.attachment_compatibility_score, match.attachment_compatibility_score || 0)
            participantB.communication_compatibility_score = Math.max(participantB.communication_compatibility_score, match.communication_compatibility_score || 0)
            participantB.lifestyle_compatibility_score = Math.max(participantB.lifestyle_compatibility_score, match.lifestyle_compatibility_score || 0)
            participantB.core_values_compatibility_score = Math.max(participantB.core_values_compatibility_score, match.core_values_compatibility_score || 0)
            participantB.vibe_compatibility_score = Math.max(participantB.vibe_compatibility_score, match.vibe_compatibility_score || 0)
            participantB.synergy_score = Math.max(participantB.synergy_score, match.synergy_score || 0)
            participantB.humor_open_score = Math.max(participantB.humor_open_score, match.humor_open_score || 0)
            participantB.intent_score = Math.max(participantB.intent_score, match.intent_score || 0)
            participantB.partner_assigned_number = match.participant_a_number
            participantB.partner_name = participantA.name
          }
        })
        
        // Convert map to array
        const results = Array.from(participantResultsMap.values())
        
        console.log(`Found ${results.length} participants with ${matchResults.length} total matches`)
        
        return res.status(200).json({ 
          results,
          totalMatches: matchResults.length,
          totalParticipants: results.length
        })
      } catch (err) {
        console.error("Error getting participant results:", err)
        return res.status(500).json({ error: "Failed to get participant results" })
      }
    }

    // 🔹 GET EXCLUDED PAIRS
    // Apply every leg of a direct swap or swap chain in one database transaction.
    // The RPC compares the reviewed pairs with live rows so stale plans cannot
    // silently overwrite newer matching work.
    if (action === "apply-match-swap-plan") {
      try {
        const pairs = normalizeSwapPairs(req.body.pairs)
        const expectedPairs = normalizeSwapPairs(req.body.expected_pairs || [])
        const affected = Array.from(new Set((req.body.affected || []).map(Number)))
        const round = Number(req.body.round)
        const eventId = Number(req.body.event_id || await getCurrentAdminEventId())

        if (!pairs?.length || expectedPairs == null) {
          return res.status(400).json({ error: "The swap plan contains invalid or duplicate participants" })
        }
        if (!affected.length || affected.some(number => !Number.isInteger(number) || number <= 0 || number === 9999)) {
          return res.status(400).json({ error: "The affected participant list is invalid" })
        }
        if (!Number.isInteger(round) || round <= 0 || !Number.isInteger(eventId) || eventId <= 0) {
          return res.status(400).json({ error: "A valid event and round are required" })
        }

        const resultingNumbers = new Set(pairs.flatMap(pair => [pair.a, pair.b]))
        if ([...resultingNumbers].some(number => !affected.includes(number))) {
          return res.status(400).json({ error: "Every resulting participant must be included in the affected list" })
        }

        const { data: participants, error: participantsError } = await supabase
          .from("participants")
          .select("*")
          .eq("match_id", STATIC_MATCH_ID)
          .in("assigned_number", affected)

        if (participantsError) throw participantsError
        const participantMap = new Map((participants || []).map(participant => [Number(participant.assigned_number), participant]))
        if (participantMap.size !== affected.length) {
          return res.status(400).json({ error: "One or more participants in the swap plan no longer exist" })
        }

        const numberList = affected.join(",")
        const [excludedParticipantsResult, excludedPairsResult, previousMatchesResult] = await Promise.all([
          supabase.from("excluded_participants").select("participant_number").eq("match_id", STATIC_MATCH_ID),
          supabase.from("excluded_pairs").select("participant1_number, participant2_number").eq("match_id", STATIC_MATCH_ID),
          supabase.from("match_results")
            .select("participant_a_number, participant_b_number, event_id")
            .eq("match_id", STATIC_MATCH_ID)
            .lt("event_id", eventId)
            .or(`participant_a_number.in.(${numberList}),participant_b_number.in.(${numberList})`)
            .limit(10000),
        ])
        if (excludedParticipantsResult.error) throw excludedParticipantsResult.error
        if (excludedPairsResult.error) throw excludedPairsResult.error
        if (previousMatchesResult.error) throw previousMatchesResult.error

        const excludedNumbers = new Set((excludedParticipantsResult.data || []).map(row => Number(row.participant_number)))
        for (const row of excludedPairsResult.data || []) {
          if (Number(row.participant2_number) === -1 || Number(row.participant2_number) === -10) excludedNumbers.add(Number(row.participant1_number))
        }
        const excludedPairKeys = new Set((excludedPairsResult.data || [])
          .filter(row => Number(row.participant1_number) > 0 && Number(row.participant2_number) > 0)
          .map(row => swapPairKey(row.participant1_number, row.participant2_number)))
        const previousPairKeys = new Set((previousMatchesResult.data || [])
          .filter(row => Number(row.participant_a_number) !== 9999 && Number(row.participant_b_number) !== 9999)
          .map(row => swapPairKey(row.participant_a_number, row.participant_b_number)))

        const paymentScope = req.body.plan_summary?.payment_scope
        if (paymentScope === "paid" || paymentScope === "not_paid") {
          // Payment scope applies to people placed into the resulting pairs.
          // Former partners still belong in `affected` so the transaction can
          // remove their old rows, but they are deliberately outside the new
          // paid/unpaid chain and must not block it.
          const outsidePaymentScope = [...resultingNumbers].filter(number => {
            const paid = isSwapParticipantPaid(participantMap.get(number), eventId)
            return paymentScope === "paid" ? !paid : paid
          })
          if (outsidePaymentScope.length) {
            return res.status(422).json({
              error: `Payment scope changed or is invalid for participant(s): ${outsidePaymentScope.map(number => `#${number}`).join(", ")}`,
              criteria: ["payment_scope"],
            })
          }
        }

        const criteriaFailures = []
        for (const pair of pairs) {
          const participantA = participantMap.get(pair.a)
          const participantB = participantMap.get(pair.b)
          const failures = []
          if (excludedNumbers.has(pair.a) || excludedNumbers.has(pair.b)) failures.push("admin participant exclusion")
          if (excludedPairKeys.has(swapPairKey(pair.a, pair.b))) failures.push("admin pair exclusion")
          if (!isParticipantComplete(participantA, "preference") || !isParticipantComplete(participantB, "preference")) failures.push("incomplete matching profile")
          if (!checkGenderCompatibility(participantA, participantB, "preference")) failures.push("gender preference")
          if (!checkNationalityHardGate(participantA, participantB)) failures.push("nationality preference")
          if (!checkAgeRangeHardGate(participantA, participantB)) failures.push("preferred age range")
          if (!checkIntentHardGate(participantA, participantB)) failures.push("intent goal")
          // Swap chains are an explicit organizer override: retain interaction-style
          // penalties in the calculated score, but do not reject a chain leg for them.
          if (previousPairKeys.has(swapPairKey(pair.a, pair.b))) failures.push("previous-event repeat")
          if (failures.length) criteriaFailures.push({ pair: `#${pair.a} ↔ #${pair.b}`, failures })
        }
        if (criteriaFailures.length) {
          return res.status(422).json({
            error: `Swap chain violates matching criteria: ${criteriaFailures.map(item => `${item.pair} (${item.failures.join(", ")})`).join("; ")}`,
            criteria_failures: criteriaFailures,
          })
        }

        const matchRows = []
        for (const pair of pairs) {
          const compatibility = await calculateFullCompatibilityWithCache(
            participantMap.get(pair.a), participantMap.get(pair.b), false, false,
          )
          const humorMultiplier = Number(compatibility.humorMultiplier || 1)
          matchRows.push({
            a: pair.a,
            b: pair.b,
            compatibility_score: Math.round(Number(compatibility.totalScore || 0)),
            reason: swapReason(compatibility),
            mbti_compatibility_score: Number(compatibility.mbtiScore || 0),
            attachment_compatibility_score: Number(compatibility.attachmentScore || 0),
            communication_compatibility_score: Number(compatibility.communicationScore || 0),
            lifestyle_compatibility_score: Number(compatibility.lifestyleScore || 0),
            core_values_compatibility_score: Number(compatibility.coreValuesScore || 0),
            vibe_compatibility_score: Number(compatibility.vibeScore || 0),
            synergy_score: Number(compatibility.synergyScore || 0),
            humor_open_score: Number(compatibility.humorOpenScore || 0),
            intent_score: Number(compatibility.intentScore || 0),
            humor_multiplier: humorMultiplier,
            attachment_penalty_applied: !!compatibility.attachmentPenaltyApplied,
            intent_boost_applied: !!compatibility.intentBoostApplied,
            dead_air_veto_applied: !!compatibility.deadAirVetoApplied,
            humor_clash_veto_applied: !!compatibility.humorClashVetoApplied,
            cap_applied: compatibility.capApplied ?? null,
            humor_early_openness_bonus: humorMultiplier === 1.15 ? "full" : humorMultiplier === 1.05 ? "partial" : "none",
          })
        }

        const { data, error } = await supabase.rpc("apply_match_swap_plan", {
          p_match_id: STATIC_MATCH_ID,
          p_event_id: eventId,
          p_round: round,
          p_pairs: matchRows,
          p_affected: affected,
          p_expected_pairs: expectedPairs,
          p_plan_summary: req.body.plan_summary || {},
        })

        if (error) {
          if (isMissingSwapRpc(error)) {
            return res.status(501).json({ error: "The transactional swap migration has not been applied yet", migration_required: true })
          }
          if (error.code === "40001" || /state changed|reviewed/i.test(error.message || "")) {
            return res.status(409).json({ error: error.message })
          }
          throw error
        }
        return res.status(200).json(data || { success: true })
      } catch (error) {
        console.error("Error applying match swap plan:", error)
        return res.status(500).json({ error: error.message || "Failed to apply the match swap plan" })
      }
    }

    if (action === "undo-match-swap-plan") {
      try {
        const auditId = String(req.body.audit_id || "")
        if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(auditId)) {
          return res.status(400).json({ error: "A valid swap audit ID is required" })
        }
        const { data, error } = await supabase.rpc("undo_match_swap_plan", { p_audit_id: auditId })
        if (error) {
          if (isMissingSwapRpc(error)) {
            return res.status(501).json({ error: "The transactional swap migration has not been applied yet", migration_required: true })
          }
          if (error.code === "40001" || /changed after this swap/i.test(error.message || "")) {
            return res.status(409).json({ error: error.message })
          }
          throw error
        }
        return res.status(200).json(data || { success: true })
      } catch (error) {
        console.error("Error undoing match swap plan:", error)
        return res.status(500).json({ error: error.message || "Failed to undo the match swap plan" })
      }
    }

    if (action === "get-excluded-pairs") {
      try {
        const { data, error } = await supabase
          .from("excluded_pairs")
          .select("id, participant1_number, participant2_number, created_at, reason")
          .eq("match_id", STATIC_MATCH_ID)
          .order("created_at", { ascending: false })

        if (error) {
          console.error("Error fetching excluded pairs:", error)
          return res.status(500).json({ error: error.message })
        }

        return res.status(200).json({ excludedPairs: data || [] })
      } catch (error) {
        console.error("Error in get-excluded-pairs:", error)
        return res.status(500).json({ error: "Failed to fetch excluded pairs" })
      }
    }

    // 🔹 ADD EXCLUDED PAIR
    if (action === "add-excluded-pair") {
      try {
        const { participant1, participant2, reason = "Admin exclusion" } = req.body

        if (!participant1 || !participant2) {
          return res.status(400).json({ error: "Both participant numbers are required" })
        }

        if (participant1 === participant2) {
          return res.status(400).json({ error: "Cannot exclude a participant from themselves" })
        }

        // Check if participants exist
        const { data: participants, error: participantsError } = await supabase
          .from("participants")
          .select("assigned_number")
          .eq("match_id", STATIC_MATCH_ID)
          .in("assigned_number", [participant1, participant2])

        if (participantsError) {
          console.error("Error checking participants:", participantsError)
          return res.status(500).json({ error: "Failed to verify participants" })
        }

        if (participants.length !== 2) {
          return res.status(400).json({ error: "One or both participant numbers don't exist" })
        }

        // Insert excluded pair (constraint will prevent duplicates)
        const { data, error } = await supabase
          .from("excluded_pairs")
          .insert([{
            match_id: STATIC_MATCH_ID,
            participant1_number: participant1,
            participant2_number: participant2,
            reason: reason
          }])
          .select()
          .single()

        if (error) {
          if (error.code === '23505') { // Unique index violation
            return res.status(400).json({ error: "This pair is already excluded" })
          }
          console.error("Error adding excluded pair:", error)
          return res.status(500).json({ error: error.message })
        }

        console.log(`✅ Added excluded pair: #${participant1} ↔ #${participant2}`)
        return res.status(200).json({ 
          success: true, 
          excludedPair: data,
          message: `Excluded pair added: #${participant1} and #${participant2}` 
        })

      } catch (error) {
        console.error("Error in add-excluded-pair:", error)
        return res.status(500).json({ error: "Failed to add excluded pair" })
      }
    }

    // 🔹 REMOVE EXCLUDED PAIR
    if (action === "remove-excluded-pair") {
      try {
        const { id } = req.body

        if (!id) {
          return res.status(400).json({ error: "Excluded pair ID is required" })
        }

        const { error } = await supabase
          .from("excluded_pairs")
          .delete()
          .eq("id", id)
          .eq("match_id", STATIC_MATCH_ID)

        if (error) {
          console.error("Error removing excluded pair:", error)
          return res.status(500).json({ error: error.message })
        }

        console.log(`✅ Removed excluded pair with ID: ${id}`)
        return res.status(200).json({ 
          success: true, 
          message: "Excluded pair removed successfully" 
        })

      } catch (error) {
        console.error("Error in remove-excluded-pair:", error)
        return res.status(500).json({ error: "Failed to remove excluded pair" })
      }
    }

    // 🔹 CLEAR ALL EXCLUDED PAIRS
    if (action === "clear-excluded-pairs") {
      try {
        const { error } = await supabase
          .from("excluded_pairs")
          .delete()
          .eq("match_id", STATIC_MATCH_ID)

        if (error) {
          console.error("Error clearing excluded pairs:", error)
          return res.status(500).json({ error: error.message })
        }

        console.log("✅ All excluded pairs cleared")
        return res.status(200).json({ 
          success: true, 
          message: "All excluded pairs cleared successfully" 
        })

      } catch (error) {
        console.error("Error in clear-excluded-pairs:", error)
        return res.status(500).json({ error: "Failed to clear excluded pairs" })
      }
    }

    // 🔹 GET LOCKED MATCHES
    if (action === "get-locked-matches") {
      try {
        const testContext = await getEvent3TestContext()
        if (testContext.active && testContext.eventId) {
          const testRows = await getEvent3TestMatchRows(testContext.eventId)
          const testLocks = testRows.map(row => testMatchToLockedMatch(row, STATIC_MATCH_ID))
          console.log(`Fetched ${testLocks.length} isolated test-mode locked matches`)
          return res.status(200).json({ lockedMatches: testLocks, test_mode: true })
        }

        const { data, error } = await supabase
          .from("locked_matches")
          .select("*")
          .eq("match_id", STATIC_MATCH_ID)
          .order("created_at", { ascending: false })

        if (error) {
          console.error("Error fetching locked matches:", error)
          return res.status(500).json({ error: error.message })
        }

        console.log(`✅ Fetched ${data.length} locked matches`)
        return res.status(200).json({ lockedMatches: data })

      } catch (error) {
        console.error("Error in get-locked-matches:", error)
        return res.status(500).json({ error: "Failed to fetch locked matches" })
      }
    }

    // 🔹 ADD LOCKED MATCH
    if (action === "add-locked-match") {
      try {
        const { participant1, participant2, compatibilityScore, round, reason, event_id } = req.body

        if (!participant1 || !participant2) {
          return res.status(400).json({ error: "Both participant numbers are required" })
        }

        if (participant1 === participant2) {
          return res.status(400).json({ error: "Cannot lock a participant with themselves" })
        }

        // Determine event_id: use provided value, or fetch current event_id from event_state
        let lockedEventId = event_id
        if (!lockedEventId) {
          const { data: stateRow } = await supabase
            .from("event_state")
            .select("current_event_id")
            .eq("match_id", STATIC_MATCH_ID)
            .single()
          lockedEventId = stateRow?.current_event_id || 1
        }

        const testContext = await getEvent3TestContext()
        if (testContext.active && Number(lockedEventId) === testContext.eventId) {
          return res.status(409).json({ error: "Test-mode locks mirror admin3 algorithm results and are read-only. Rerun the algorithm in admin3 to regenerate them.", test_mode: true })
        }

        const { data, error } = await supabase
          .from("locked_matches")
          .insert([{
            match_id: STATIC_MATCH_ID,
            participant1_number: participant1,
            participant2_number: participant2,
            original_compatibility_score: compatibilityScore,
            original_match_round: round,
            reason: reason || 'Admin locked match',
            event_id: lockedEventId
          }])
          .select()
          .single()

        if (error) {
          if (error.code === '23505') { // Unique index violation
            return res.status(400).json({ error: "This pair is already locked" })
          }
          console.error("Error adding locked match:", error)
          return res.status(500).json({ error: error.message })
        }

        console.log(`✅ Added locked match: #${participant1} ↔ #${participant2}`)
        return res.status(200).json({ 
          success: true, 
          lockedMatch: data,
          message: `Locked match added: #${participant1} and #${participant2}` 
        })

      } catch (error) {
        console.error("Error in add-locked-match:", error)
        return res.status(500).json({ error: "Failed to add locked match" })
      }
    }

    // 🔹 REMOVE LOCKED MATCH
    if (action === "remove-locked-match") {
      try {
        const { id } = req.body

        if (!id) {
          return res.status(400).json({ error: "Locked match ID is required" })
        }

        if (String(id).startsWith("test:")) {
          return res.status(409).json({ error: "Test-mode locks are read-only. Rerun the algorithm in admin3 or end test mode.", test_mode: true })
        }

        const { error } = await supabase
          .from("locked_matches")
          .delete()
          .eq("id", id)
          .eq("match_id", STATIC_MATCH_ID)

        if (error) {
          console.error("Error removing locked match:", error)
          return res.status(500).json({ error: error.message })
        }

        console.log(`✅ Removed locked match with ID: ${id}`)
        return res.status(200).json({ 
          success: true, 
          message: "Locked match removed successfully" 
        })

      } catch (error) {
        console.error("Error in remove-locked-match:", error)
        return res.status(500).json({ error: "Failed to remove locked match" })
      }
    }

    // 🔹 CLEAR ALL LOCKED MATCHES
    if (action === "clear-locked-matches") {
      try {
        const testContext = await getEvent3TestContext()
        if (testContext.active && testContext.eventId) {
          return res.status(409).json({ error: "Test-mode locks are read-only and are cleared automatically when test mode ends.", test_mode: true })
        }

        const { error } = await supabase
          .from("locked_matches")
          .delete()
          .eq("match_id", STATIC_MATCH_ID)

        if (error) {
          console.error("Error clearing locked matches:", error)
          return res.status(500).json({ error: error.message })
        }

        console.log("✅ All locked matches cleared")
        return res.status(200).json({ 
          success: true, 
          message: "All locked matches cleared successfully" 
        })

      } catch (error) {
        console.error("Error in clear-locked-matches:", error)
        return res.status(500).json({ error: "Failed to clear locked matches" })
      }
    }

    // 🔹 GET GROUP ASSIGNMENTS
    if (action === "get-group-assignments") {
      try {
        const { event_id = 1 } = req.body

        // Get group matches from group_matches table
        const { data: groupMatches, error: groupError } = await supabase
          .from("group_matches")
          .select("*")
          .eq("match_id", STATIC_MATCH_ID)
          .eq("event_id", event_id)
          .order("group_number", { ascending: true })

        if (groupError) {
          console.error("Error fetching group matches:", groupError)
          return res.status(500).json({ error: groupError.message })
        }

        // Fetch participant details including ages
        const allParticipantNumbers = [...new Set(groupMatches.flatMap(match => match.participant_numbers || []))]
        
        let participantDetailsMap = new Map()
        if (allParticipantNumbers.length > 0) {
          const { data: participantDetails, error: participantError } = await supabase
            .from("participants")
            .select("assigned_number, name, age, survey_data")
            .eq("match_id", STATIC_MATCH_ID)
            .in("assigned_number", allParticipantNumbers)

          if (participantError) {
            console.error("Error fetching participant details:", participantError)
          } else if (participantDetails) {
            participantDetails.forEach(p => {
              participantDetailsMap.set(p.assigned_number, {
                name: p.name || p.survey_data?.name || `المشارك #${p.assigned_number}`,
                age: p.age || p.survey_data?.age
              })
            })
          }
        }

        // Fetch attendance status per participant for this event
        let attendanceMap = new Map()
        if (allParticipantNumbers.length > 0) {
          const { data: attendanceRows, error: attendanceError } = await supabase
            .from("event_attendance")
            .select("participant_number, attended")
            .eq("match_id", STATIC_MATCH_ID)
            .eq("event_id", event_id)
            .in("participant_number", allParticipantNumbers)

          if (attendanceError) {
            console.error("Error fetching attendance:", attendanceError)
          } else if (attendanceRows) {
            attendanceRows.forEach(row => {
              attendanceMap.set(row.participant_number, !!row.attended)
            })
          }
        }

        // Format group assignments (participant_names are already stored in the table)
        const groupAssignments = groupMatches.map(match => {
          const participantNumbers = match.participant_numbers || []
          const participantNames = match.participant_names || []

          const participants = participantNumbers.map((num, index) => {
            const details = participantDetailsMap.get(num)
            return {
              number: num,
              name: details?.name || participantNames[index] || `المشارك #${num}`,
              age: details?.age,
              attended: attendanceMap.get(num) === true
            }
          })

          return {
            group_id: match.group_id,
            group_number: match.group_number,
            table_number: match.table_number,
            participants: participants,
            compatibility_score: match.compatibility_score,
            participant_count: participants.length,
            conversation_status: match.conversation_status,
            reason: match.reason
          }
        })

        console.log(`✅ Fetched ${groupAssignments.length} group assignments`)
        return res.status(200).json({ 
          groupAssignments: groupAssignments,
          totalGroups: groupAssignments.length,
          totalParticipants: groupAssignments.reduce((sum, group) => sum + group.participant_count, 0)
        })

      } catch (error) {
        console.error("Error in get-group-assignments:", error)
        return res.status(500).json({ error: "Failed to fetch group assignments" })
      }
    }

    // 🔹 SET ATTENDANCE (per participant, per event) for host live check-in
    if (action === "set-attendance") {
      try {
        const { event_id = 1, participant_number, attended, updated_by } = req.body
        const currentEvent = Number(event_id) || 1
        const pNum = Number(participant_number)
        if (!Number.isFinite(pNum) || pNum <= 0 || pNum === 9999) {
          return res.status(400).json({ error: "Invalid participant_number" })
        }

        const now = new Date().toISOString()

        const { data, error } = await supabase
          .from("event_attendance")
          .upsert({
            match_id: STATIC_MATCH_ID,
            event_id: currentEvent,
            participant_number: pNum,
            attended: !!attended,
            updated_at: now,
            updated_by: updated_by || 'admin'
          }, { onConflict: "match_id, event_id, participant_number" })
          .select("participant_number, attended")
          .single()

        if (error) {
          console.error("set-attendance upsert error:", error)
          return res.status(500).json({ error: error.message || "Failed to set attendance" })
        }

        return res.status(200).json({ success: true, participant_number: data?.participant_number || pNum, attended: data?.attended ?? !!attended })
      } catch (e) {
        console.error("Error in set-attendance:", e)
        return res.status(500).json({ error: "Failed to set attendance" })
      }
    }

    // --- Helpers for group compatibility calculations (mirror trigger-match logic, no AI) ---
    function calculateMBTICompatibilityLocal(type1, type2) {
      if (!type1 || !type2) return 0
      let score = 0
      const firstLetter1 = type1[0]
      const firstLetter2 = type2[0]
      if (firstLetter1 === 'I' && firstLetter2 === 'I') {
        score += 0
      } else if (firstLetter1 === 'E' && firstLetter2 === 'E') {
        score += 2.5
      } else {
        score += 2.5
      }
      let matchingLetters = 0
      if (type1[1] === type2[1]) matchingLetters++
      if (type1[2] === type2[2]) matchingLetters++
      if (type1[3] === type2[3]) matchingLetters++
      if (matchingLetters >= 2) score += 2.5
      return score
    }

    function calculateAttachmentCompatibilityLocal(style1, style2) {
      if (!style1 || !style2) return 2.5
      if (style1 === 'Secure' || style2 === 'Secure') return 5
      const bestMatches = {
        'Anxious': ['Secure'],
        'Avoidant': ['Secure'],
        'Fearful': ['Secure'],
        'Mixed (Secure-Anxious)': ['Secure'],
        'Mixed (Secure-Avoidant)': ['Secure'],
        'Mixed (Secure-Fearful)': ['Secure'],
        'Mixed (Anxious-Avoidant)': ['Secure'],
        'Mixed (Anxious-Fearful)': ['Secure'],
        'Mixed (Avoidant-Fearful)': ['Secure']
      }
      const matches = bestMatches[style1] || []
      return matches.includes(style2) ? 5 : 2.5
    }

    function calculateCommunicationCompatibilityLocal(style1, style2) {
      if (!style1 || !style2) return 4
      if ((style1 === 'Aggressive' && style2 === 'Passive-Aggressive') || (style2 === 'Aggressive' && style1 === 'Passive-Aggressive')) return 0
      if ((style1 === 'Assertive' && style2 === 'Passive') || (style1 === 'Passive' && style2 === 'Assertive')) return 10
      const matrix = {
        'Assertive': { top1: 'Assertive', top2: 'Passive' },
        'Passive': { top1: 'Assertive', top2: 'Passive' },
        'Aggressive': { top1: 'Assertive', top2: 'Aggressive' },
        'Passive-Aggressive': { top1: 'Assertive', top2: 'Passive-Aggressive' }
      }
      const comp = matrix[style1]
      if (!comp) return 4
      if (comp.top1 === style2) return 10
      if (comp.top2 === style2) return 8
      return 4
    }

    function calculateLifestyleCompatibilityLocal(prefs1, prefs2) {
      if (!prefs1 || !prefs2) return 0
      const a = prefs1.split(',')
      const b = prefs2.split(',')
      if (a.length !== 5 || b.length !== 5) return 0
      const weights = [1.25, 1.25, 1.25, 1.25, 1.25]
      let total = 0
      let max = 0
      for (let i = 0; i < 5; i++) {
        const w = weights[i]
        let q = 0
        if (i === 0) {
          q = 4
        } else if (a[i] === b[i]) {
          q = 4
        } else if ((a[i] === 'أ' && b[i] === 'ب') || (a[i] === 'ب' && b[i] === 'أ') || (a[i] === 'ب' && b[i] === 'ج') || (a[i] === 'ج' && b[i] === 'ب')) {
          q = 3
        } else {
          q = 0
        }
        total += q * w
        max += 4 * w
      }
      let finalScore = (total / max) * 25
      const q18a = a[4]
      const q18b = b[4]
      if ((q18a === 'أ' && q18b === 'ج') || (q18a === 'ج' && q18b === 'أ')) finalScore -= 5
      return Math.max(0, finalScore)
    }

    function calculateCoreValuesCompatibilityLocal(vals1, vals2) {
      if (!vals1 || !vals2) return 0
      const a = vals1.split(',')
      const b = vals2.split(',')
      if (a.length !== 5 || b.length !== 5) return 0
      let total = 0
      for (let i = 0; i < 5; i++) {
        if (a[i] === b[i]) total += 4
        else if ((a[i] === 'ب' && (b[i] === 'أ' || b[i] === 'ج')) || (b[i] === 'ب' && (a[i] === 'أ' || a[i] === 'ج'))) total += 2
      }
      return total
    }

    function computePairCompatibilityLocal(pA, pB) {
      const mbtiA = pA.mbti_personality_type || pA.survey_data?.mbtiType
      const mbtiB = pB.mbti_personality_type || pB.survey_data?.mbtiType
      const attachA = pA.attachment_style || pA.survey_data?.attachmentStyle
      const attachB = pB.attachment_style || pB.survey_data?.attachmentStyle
      const commA = pA.communication_style || pA.survey_data?.communicationStyle
      const commB = pB.communication_style || pB.survey_data?.communicationStyle
      const lifeA = pA.survey_data?.lifestylePreferences
      const lifeB = pB.survey_data?.lifestylePreferences
      const coreA = pA.survey_data?.coreValues
      const coreB = pB.survey_data?.coreValues
      const mbti = calculateMBTICompatibilityLocal(mbtiA, mbtiB)
      const att = calculateAttachmentCompatibilityLocal(attachA, attachB)
      const comm = calculateCommunicationCompatibilityLocal(commA, commB)
      const life = calculateLifestyleCompatibilityLocal(lifeA, lifeB)
      const core = calculateCoreValuesCompatibilityLocal(coreA, coreB)
      return mbti + att + comm + life + core // 0..75
    }

    function calculateGroupCompatibilityLocal(participantsArr) {
      // Average of all pairwise scores
      let sum = 0
      let count = 0
      for (let i = 0; i < participantsArr.length; i++) {
        for (let j = i + 1; j < participantsArr.length; j++) {
          sum += computePairCompatibilityLocal(participantsArr[i], participantsArr[j])
          count++
        }
      }
      return count > 0 ? (sum / count) : 0
    }

    // 🔹 ADD PARTICIPANT TO GROUP (BYPASS ELIGIBILITY)
    if (action === "add-participant-to-group") {
      try {
        const { event_id = 1, group_number, participant_number } = req.body
        const groupNum = parseInt(group_number)
        const pNum = parseInt(participant_number)
        if (!groupNum || !pNum) {
          return res.status(400).json({ error: "Invalid group_number or participant_number" })
        }
        if (pNum === 9999) {
          return res.status(400).json({ error: "Cannot add organizer (#9999) to groups" })
        }

        // Fetch existing group row
        const { data: groupRow, error: groupErr } = await supabase
          .from("group_matches")
          .select("id, group_id, group_number, participant_numbers, participant_names, table_number, compatibility_score")
          .eq("match_id", STATIC_MATCH_ID)
          .eq("event_id", event_id)
          .eq("group_number", groupNum)
          .single()

        if (groupErr) {
          console.error("add-participant-to-group fetch group error:", groupErr)
          return res.status(500).json({ error: "Failed to load group" })
        }
        if (!groupRow) {
          return res.status(404).json({ error: "Group not found" })
        }

        const currentNumbers = Array.isArray(groupRow.participant_numbers) ? groupRow.participant_numbers.slice() : []
        if (currentNumbers.includes(pNum)) {
          return res.status(400).json({ error: `Participant #${pNum} is already in group ${groupNum}` })
        }
        if (currentNumbers.length >= 6) {
          return res.status(400).json({ error: "Group is full (max 6)" })
        }

        const newNumbers = [...currentNumbers, pNum]

        // Fetch participant details for all numbers (bypass eligibility)
        const { data: participantsData, error: partErr } = await supabase
          .from("participants")
          .select("assigned_number, name, age, gender, survey_data, mbti_personality_type, attachment_style, communication_style")
          .eq("match_id", STATIC_MATCH_ID)
          .in("assigned_number", newNumbers)

        if (partErr) {
          console.error("add-participant-to-group fetch participants error:", partErr)
          return res.status(500).json({ error: "Failed to fetch participants" })
        }
        if (!participantsData || participantsData.length !== newNumbers.length) {
          return res.status(404).json({ error: "One or more participants not found" })
        }

        // Recalculate group compatibility (0..75)
        const newScore = Math.round(calculateGroupCompatibilityLocal(participantsData))

        // Build names array aligned with newNumbers order
        const detailsMap = new Map(participantsData.map(p => [p.assigned_number, p]))
        const newNames = newNumbers.map(n => {
          const p = detailsMap.get(n)
          return (p?.name || p?.survey_data?.name || `المشارك #${n}`)
        })

        // Update group record
        const { error: updErr } = await supabase
          .from("group_matches")
          .update({ participant_numbers: newNumbers, participant_names: newNames, compatibility_score: newScore })
          .eq("id", groupRow.id)

        if (updErr) {
          console.error("add-participant-to-group update error:", updErr)
          return res.status(500).json({ error: "Failed to update group" })
        }

        // Return the updated group in the same response shape used by get-group-assignments
        const participants = newNumbers.map((num) => {
          const p = detailsMap.get(num)
          return { number: num, name: (p?.name || p?.survey_data?.name || `المشارك #${num}`), age: (p?.age || p?.survey_data?.age) }
        })

        return res.status(200).json({
          success: true,
          group: {
            group_id: groupRow.group_id,
            group_number: groupRow.group_number,
            table_number: groupRow.table_number,
            participants,
            compatibility_score: newScore,
            participant_count: participants.length
          }
        })
      } catch (error) {
        console.error("Error in add-participant-to-group:", error)
        return res.status(500).json({ error: "Failed to add participant to group" })
      }
    }

    // 🔹 GET DELTA CACHE COUNT
    if (action === "get-delta-cache-count") {
      try {
        const { event_id = 1 } = req.body
        
        // Get last cache timestamp
        const { data: metaData } = await supabase
          .from('cache_metadata')
          .select('last_precache_timestamp')
          .eq('event_id', event_id)
          .order('last_precache_timestamp', { ascending: false })
          .limit(1)
          .single()
        
        const lastCacheTimestamp = metaData?.last_precache_timestamp || '1970-01-01T00:00:00Z'
        const noCacheMetadata = !metaData?.last_precache_timestamp
        
        // If no cache metadata exists, delta cache count should be 0
        // (use regular pre-cache for first-time caching)
        if (noCacheMetadata) {
          return res.status(200).json({ 
            count: 0,
            totalEligible: 0,
            lastCacheTimestamp: null,
            message: 'No cache metadata - use Pre-Cache first'
          })
        }
        
        // Fetch eligible participants (same logic as delta-pre-cache)
        const { data: allParticipants } = await supabase
          .from("participants")
          .select("assigned_number, survey_data, survey_data_updated_at, signup_for_next_event, auto_signup_next_event, next_event_signup_timestamp, created_at, updated_at, event_id, signup_event_id")
          .eq("match_id", STATIC_MATCH_ID)
          .or(`signup_for_next_event.eq.true,event_id.eq.${event_id},auto_signup_next_event.eq.true`)
          .neq("assigned_number", 9999)
        
        if (!allParticipants) {
          return res.status(200).json({ count: 0, lastCacheTimestamp })
        }
        
        // Filter for complete participants
        const eligibleParticipants = allParticipants.filter(p => {
          return p.survey_data && typeof p.survey_data === 'object' && Object.keys(p.survey_data).length > 0
        })
        
        const needsCacheCount = eligibleParticipants.filter(p =>
          !!getParticipantDeltaCacheReason(p, lastCacheTimestamp, event_id)
        ).length
        
        return res.status(200).json({ 
          count: needsCacheCount,
          totalEligible: eligibleParticipants.length,
          lastCacheTimestamp
        })
        
      } catch (error) {
        console.error("Error in get-delta-cache-count:", error)
        return res.status(500).json({ error: "Failed to get delta cache count" })
      }
    }

    // 🔹 GET VIBE STATUS — show eligible participants with their cached vibe scores
    if (action === "get-vibe-status") {
      try {
        const { event_id } = req.body
        if (!event_id) return res.status(400).json({ error: "event_id required" })

        const { data: rawParticipants } = await supabase
          .from("participants")
          .select("assigned_number, name, survey_data, mbti_personality_type, attachment_style, communication_style, gender, age, same_gender_preference, any_gender_preference, humor_banter_style, early_openness_comfort, nationality, prefer_same_nationality, preferred_age_min, preferred_age_max, open_age_preference, age_flex_years, age_flex_event_id")
          .eq("match_id", STATIC_MATCH_ID)
          .or(`signup_for_next_event.eq.true,event_id.eq.${event_id},auto_signup_next_event.eq.true`)
          .neq("assigned_number", 9999)

        const eligible = (rawParticipants || []).filter(p => isParticipantComplete(p))
        const allNums = eligible.map(p => p.assigned_number)

        if (allNums.length === 0) return res.status(200).json({ participants: [] })

        const { data: cacheRows, error: cacheError } = await fetchAllCachedPairs("compatibility_cache", allNums)
        if (cacheError) throw cacheError

        const eligiblePairKeys = new Set()
        for (let i = 0; i < eligible.length; i++) {
          for (let j = i + 1; j < eligible.length; j++) {
            const a = eligible[i]
            const b = eligible[j]
            if (!checkGenderCompatibility(a, b, "preference")) continue
            if (!checkNationalityHardGate(a, b)) continue
            if (!checkAgeRangeHardGate(a, b)) continue
            if (!checkAgeCompatibility(a, b)) continue
            const [smaller, larger] = [a.assigned_number, b.assigned_number].sort((x, y) => x - y)
            eligiblePairKeys.add(`${smaller}-${larger}`)
          }
        }

        const pairMap = new Map()
        for (const c of (cacheRows || [])) {
          const [a, b] = [c.participant_a_number, c.participant_b_number].sort((x, y) => x - y)
          const key = `${a}-${b}`
          if (!eligiblePairKeys.has(key)) continue
          const previous = pairMap.get(key)
          const rowTime = new Date(c.last_used || c.created_at || 0).getTime()
          const previousTime = new Date(previous?.last_used || previous?.created_at || 0).getTime()
          const rowIsNewer = rowTime > previousTime || (rowTime === previousTime && String(c.id || '') > String(previous?.id || ''))
          if (!previous || rowIsNewer) {
            pairMap.set(key, {
              id: c.id,
              vibe: parseFloat(c.ai_vibe_score),
              model: c.model_used || null,
              last_used: c.last_used,
              created_at: c.created_at,
            })
          }
        }

        const participants = eligible.map(p => {
          const n = p.assigned_number
          const myPairs = [...pairMap.entries()].filter(([k]) => {
            const [a, b] = k.split('-').map(Number)
            return a === n || b === n
          })
          const vibes = myPairs.map(([, v]) => v.vibe)
          const models = [...new Set(myPairs.map(([, v]) => v.model).filter(Boolean))]
          const hasOldModel = myPairs.some(([, v]) => !isCurrentVibeModel(v.model))
          const badVibes = vibes.filter(v => Math.abs(v - 10) <= 0.5).length
          const avgVibe = vibes.length > 0
            ? Math.round((vibes.reduce((s, v) => s + v, 0) / vibes.length) * 10) / 10
            : null
          const sd = typeof p.survey_data === 'string' ? JSON.parse(p.survey_data || '{}') : (p.survey_data || {})
          const name = (p.name || sd?.answers?.name || sd?.name || `#${n}`).split(' ')[0]
          return { number: n, name, gender: p.gender, cached_pairs: vibes.length, bad_vibe_pairs: badVibes, avg_vibe: avgVibe, models, has_old_model: hasOldModel }
        })

        return res.status(200).json({ participants, total: eligible.length })
      } catch (error) {
        console.error("Error in get-vibe-status:", error)
        return res.status(500).json({ error: "Failed to get vibe status" })
      }
    }

    // 🔹 GET DELTA CACHE PARTICIPANTS LIST
    if (action === "get-delta-cache-participants") {
      try {
        const { event_id = 1 } = req.body
        
        // Get last cache timestamp
        const { data: metaData } = await supabase
          .from('cache_metadata')
          .select('last_precache_timestamp')
          .eq('event_id', event_id)
          .order('last_precache_timestamp', { ascending: false })
          .limit(1)
          .single()
        
        const lastCacheTimestamp = metaData?.last_precache_timestamp || '1970-01-01T00:00:00Z'
        const noCacheMetadata = !metaData?.last_precache_timestamp
        
        // If no cache metadata exists, return empty list
        if (noCacheMetadata) {
          return res.status(200).json({ 
            participants: [],
            count: 0,
            lastCacheTimestamp: null,
            message: 'No cache metadata - use Pre-Cache first'
          })
        }
        
        // Fetch eligible participants with full details
        const { data: allParticipants } = await supabase
          .from("participants")
          .select("assigned_number, name, survey_data, survey_data_updated_at, signup_for_next_event, auto_signup_next_event, next_event_signup_timestamp, created_at, updated_at, event_id, signup_event_id")
          .eq("match_id", STATIC_MATCH_ID)
          .or(`signup_for_next_event.eq.true,event_id.eq.${event_id},auto_signup_next_event.eq.true`)
          .neq("assigned_number", 9999)
        
        if (!allParticipants) {
          return res.status(200).json({ participants: [], count: 0, lastCacheTimestamp })
        }
        
        // Filter for complete participants
        const eligibleParticipants = allParticipants.filter(p => {
          return p.survey_data && typeof p.survey_data === 'object' && Object.keys(p.survey_data).length > 0
        })
        
        const needsCacheParticipants = eligibleParticipants.map(p => ({
          participant: p,
          delta_reason: getParticipantDeltaCacheReason(p, lastCacheTimestamp, event_id),
        })).filter(item => !!item.delta_reason).map(({ participant: p, delta_reason }) => ({
          assigned_number: p.assigned_number,
          name: p.name || p.survey_data?.name || `#${p.assigned_number}`,
          survey_data_updated_at: p.survey_data_updated_at,
          next_event_signup_timestamp: p.next_event_signup_timestamp,
          delta_reason,
          eligibility_reason: p.event_id === event_id ? 'Current Event' : 
                             p.signup_for_next_event ? 'Next Event Signup' : 
                             p.auto_signup_next_event ? 'Auto Signup' : 'Unknown'
        }))
        
        return res.status(200).json({ 
          participants: needsCacheParticipants,
          count: needsCacheParticipants.length,
          lastCacheTimestamp,
          totalEligible: eligibleParticipants.length
        })
        
      } catch (error) {
        console.error("Error in get-delta-cache-participants:", error)
        return res.status(500).json({ error: "Failed to get delta cache participants" })
      }
    }

    // 🔹 GET GROUP MATCHES (for participant view)
    if (action === "get-group-matches") {
      try {
        let { event_id, strict } = req.body

        // First try with provided event_id (if any). If none or empty result, fallback to latest event in group_matches
        const baseQuery = () => supabase
          .from("group_matches")
          .select("*")
          .eq("match_id", STATIC_MATCH_ID)
          .order("group_number", { ascending: true })

        let groupMatches = []
        if (event_id) {
          const { data, error } = await baseQuery().eq("event_id", event_id)
          if (error) {
            console.error("Error fetching group matches:", error)
            return res.status(500).json({ error: error.message })
          }
          groupMatches = data || []
        }

        // Fallback if no event_id provided OR no groups for that event
        // When strict=true, DO NOT fallback. Return empty groups instead.
        if ((!event_id || groupMatches.length === 0) && !strict) {
          const { data: latestEvent, error: latestErr } = await supabase
            .from("group_matches")
            .select("event_id")
            .eq("match_id", STATIC_MATCH_ID)
            .order("event_id", { ascending: false })
            .limit(1)
            .single()

          if (!latestErr && latestEvent?.event_id) {
            event_id = latestEvent.event_id
            const { data: fallbackGroups, error: fallbackErr } = await baseQuery().eq("event_id", event_id)
            if (fallbackErr) {
              console.error("Error fetching fallback group matches:", fallbackErr)
              return res.status(500).json({ error: fallbackErr.message })
            }
            groupMatches = fallbackGroups || []
          }
        }

        // If still empty, return empty groups
        if (!groupMatches || groupMatches.length === 0) {
          return res.status(200).json({ success: true, groups: [] })
        }

        // Build a set of all participant numbers across groups to fetch once
        const allParticipantNumbers = new Set()
        for (const gm of groupMatches || []) {
          const nums = Array.isArray(gm.participant_numbers) ? gm.participant_numbers : []
          for (const n of nums) {
            if (n && n !== 9999) {
              const parsed = typeof n === 'string' ? parseInt(n, 10) : n
              if (Number.isFinite(parsed)) allParticipantNumbers.add(parsed)
            }
          }
        }

        // Fetch ages and genders for these participants (prefer columns; fallback to survey_data)
        let participantRows = []
        if (allParticipantNumbers.size > 0) {
          const { data: rows, error: prErr } = await supabase
            .from("participants")
            .select("assigned_number, age, gender, survey_data")
            .eq("match_id", STATIC_MATCH_ID)
            .in("assigned_number", Array.from(allParticipantNumbers))

          if (prErr) {
            console.error("Error fetching participant ages/genders for groups:", prErr)
          }
          participantRows = rows || []
        }

        const ageMap = new Map()
        const genderMap = new Map()
        for (const row of participantRows || []) {
          const directAge = typeof row.age === 'number' ? row.age : (row?.age ? parseInt(row.age, 10) : undefined)
          const fallbackAge = (row?.survey_data && (typeof row.survey_data.age === 'number' || typeof row.survey_data.age === 'string'))
            ? parseInt(row.survey_data.age, 10)
            : undefined
          const ageVal = Number.isFinite(directAge) ? directAge : (Number.isFinite(fallbackAge) ? fallbackAge : null)
          ageMap.set(row.assigned_number, ageVal)

          // Gender: prefer column, fallback to survey_data.answers.gender
          let g = null
          if (row?.gender && typeof row.gender === 'string') {
            g = String(row.gender).toLowerCase()
          } else if (row?.survey_data?.answers?.gender && typeof row.survey_data.answers.gender === 'string') {
            g = String(row.survey_data.answers.gender).toLowerCase()
          } else if (row?.survey_data?.gender && typeof row.survey_data.gender === 'string') {
            g = String(row.survey_data.gender).toLowerCase()
          }
          if (g === 'male' || g === 'm' || g === 'ذكر') genderMap.set(row.assigned_number, 'male')
          else if (g === 'female' || g === 'f' || g === 'أنثى') genderMap.set(row.assigned_number, 'female')
          else genderMap.set(row.assigned_number, null)
        }

        // Format for participant view with ages/genders aligned to participant_numbers
        const groups = groupMatches.map(match => ({
          group_id: match.group_id,
          group_number: match.group_number,
          table_number: match.table_number,
          participant_numbers: match.participant_numbers || [],
          participant_names: match.participant_names || [],
          participant_ages: (Array.isArray(match.participant_numbers) ? match.participant_numbers : []).map(n => {
            const parsed = typeof n === 'string' ? parseInt(n, 10) : n
            return ageMap.get(parsed) ?? null
          }),
          participant_genders: (Array.isArray(match.participant_numbers) ? match.participant_numbers : []).map(n => {
            const parsed = typeof n === 'string' ? parseInt(n, 10) : n
            return genderMap.get(parsed) ?? null
          }),
          compatibility_score: match.compatibility_score,
          conversation_status: match.conversation_status,
          conversation_start_time: match.conversation_start_time,
          conversation_duration: match.conversation_duration
        }))

        console.log(`✅ Fetched ${groups.length} group matches for participant view (event_id=${event_id}, strict=${!!strict})`)
        return res.status(200).json({ 
          success: true,
          groups: groups
        })

      } catch (error) {
        console.error("Error in get-group-matches:", error)
        return res.status(500).json({ error: "Failed to fetch group matches" })
      }
    }

    // 🔹 GET EXCLUDED PARTICIPANTS (using excluded_pairs with -1)
    if (action === "get-excluded-participants") {
      try {
        const { data, error } = await supabase
          .from("excluded_pairs")
          .select("id, participant1_number, participant2_number, created_at, reason")
          .eq("match_id", STATIC_MATCH_ID)
          .in("participant2_number", [-1, -10]) // Fetch both excluded (-1) and banned (-10)
          .order("created_at", { ascending: false })

        if (error) {
          console.error("Error fetching excluded participants:", error)
          return res.status(500).json({ error: error.message })
        }

        // Fetch participant names
        const participantNumbers = (data || []).map(item => item.participant1_number)
        const { data: participantData, error: participantError } = await supabase
          .from("participants")
          .select("assigned_number, name, survey_data")
          .eq("match_id", STATIC_MATCH_ID)
          .in("assigned_number", participantNumbers)

        if (participantError) {
          console.error("Error fetching participant names:", participantError)
        }

        // Create a map of participant numbers to names
        const participantNameMap = new Map()
        if (participantData) {
          participantData.forEach(p => {
            const name = p.name || p.survey_data?.name || p.survey_data?.answers?.name || `المشارك #${p.assigned_number}`
            participantNameMap.set(p.assigned_number, name)
          })
        }

        // Map to expected format with is_banned flag and participant name
        const excludedParticipants = (data || []).map(item => ({
          id: item.id,
          participant_number: item.participant1_number,
          participant_name: participantNameMap.get(item.participant1_number) || `المشارك #${item.participant1_number}`,
          created_at: item.created_at,
          reason: item.reason,
          is_banned: item.participant2_number === -10, // -10 means banned, -1 means excluded
          duplicate_ban: item.participant2_number === -10 && item.reason?.startsWith("AUTO_PHONE_BAN:"),
          duplicate_of: item.reason?.match(/banned participant #(\d+)/)?.[1]
            ? Number(item.reason.match(/banned participant #(\d+)/)[1])
            : null
        }))

        return res.status(200).json({ excludedParticipants })
      } catch (error) {
        console.error("Error in get-excluded-participants:", error)
        return res.status(500).json({ error: "Failed to fetch excluded participants" })
      }
    }

    // 🔹 GET ALL MATCHES - Comprehensive view for matrix page
    if (action === "get-all-matches") {
      try {
        console.log("Fetching all matches for matrix view...")

        // Fetch all match results excluding organizer matches (#9999)
        const { data: matchResults, error: matchError } = await supabase
          .from("match_results")
          .select(`
            id,
            participant_a_number,
            participant_b_number,
            participant_c_number,
            participant_d_number,
            participant_e_number,
            participant_f_number,
            compatibility_score,
            synergy_score,
            humor_open_score,
            intent_score,
            humor_early_openness_bonus,
            mbti_compatibility_score,
            attachment_compatibility_score,
            communication_compatibility_score,
            lifestyle_compatibility_score,
            core_values_compatibility_score,
            vibe_compatibility_score,
            round,
            table_number,
            match_type,
            mutual_match,
            event_id,
            created_at
          `)
          .eq("match_id", STATIC_MATCH_ID)
          .neq("participant_a_number", 9999)
          .neq("participant_b_number", 9999)
          .order("round", { ascending: true })
          .order("compatibility_score", { ascending: false })

        if (matchError) {
          console.error("Error fetching match results:", matchError)
          return res.status(500).json({ error: matchError.message })
        }

        // Fetch all participants for name and details lookup
        const { data: participants, error: participantError } = await supabase
          .from("participants")
          .select("assigned_number, name, gender, age, mbti_personality_type, survey_data")
          .eq("match_id", STATIC_MATCH_ID)
          .neq("assigned_number", 9999)

        if (participantError) {
          console.error("Error fetching participants:", participantError)
          return res.status(500).json({ error: participantError.message })
        }

        // Create participant lookup map
        const participantMap = new Map()
        participants.forEach(p => {
          participantMap.set(p.assigned_number, {
            number: p.assigned_number,
            name: p.name || `مشارك ${p.assigned_number}`,
            gender: p.gender || 'غير محدد',
            age: p.age || null,
            mbti: p.mbti_personality_type || 'غير محدد',
            survey_data: p.survey_data
          })
        })

        // Helpers to derive scores if missing/zero in DB
        const getAnswer = (participant, key) => {
          try {
            let sd = participant?.survey_data
            if (typeof sd === 'string') { try { sd = JSON.parse(sd) } catch { sd = {} } }
            const ans = sd?.answers || {}
            return ans[key] ?? sd?.[key] ?? participant?.[key] ?? ''
          } catch {
            return ''
          }
        }
        const computeSynergyScore = (pa, pb) => {
          const toU = (v) => String(v || '').toUpperCase()
          const a35 = toU(getAnswer(pa, 'conversational_role'))
          const b35 = toU(getAnswer(pb, 'conversational_role'))
          const a36 = toU(getAnswer(pa, 'conversation_depth_pref'))
          const b36 = toU(getAnswer(pb, 'conversation_depth_pref'))
          const a37 = toU(getAnswer(pa, 'social_battery'))
          const b37 = toU(getAnswer(pb, 'social_battery'))
          const a38 = toU(getAnswer(pa, 'humor_subtype'))
          const b38 = toU(getAnswer(pb, 'humor_subtype'))
          const a39 = toU(getAnswer(pa, 'curiosity_style'))
          const b39 = toU(getAnswer(pb, 'curiosity_style'))
          const a41 = toU(getAnswer(pa, 'silence_comfort'))
          const b41 = toU(getAnswer(pb, 'silence_comfort'))
          let total = 0
          if ((a35 === 'A' && (b35 === 'B' || b35 === 'C')) || (b35 === 'A' && (a35 === 'B' || a35 === 'C'))) total += 7
          else if (a35 === 'B' && b35 === 'B') total += 4
          else if (a35 === 'A' && b35 === 'A') total += 2
          else if (a35 === 'C' && b35 === 'C') total += 0
          else if (a35 && b35) total += 3
          if (a36 && b36) total += (a36 === b36 ? 5 : 1)
          if (a37 && b37) { if (a37 === 'A' && b37 === 'A') total += 4; else if (a37 === 'B' && b37 === 'B') total += 3; else total += 1 }
          if (a38 && b38) total += (a38 === b38 ? 4 : 1)
          if (a39 && b39) { if ((a39 === 'A' && b39 === 'B') || (a39 === 'B' && b39 === 'A')) total += 5; else if (a39 === 'C' && b39 === 'C') total += 5; else if ((a39 === 'A' && b39 === 'A') || (a39 === 'B' && b39 === 'B')) total += 0; else total += 3 }
          if (a41 && b41) { if ((a41 === 'A' && b41 === 'B') || (a41 === 'B' && b41 === 'A')) total += 5; else if (a41 === 'A' && b41 === 'A') total += 3; else if (a41 === 'B' && b41 === 'B') total += 0 }
          return Math.min(35, (total * (35 / 30)))
        }
        const computeHumorOpenScore = (pa, pb) => {
          const toU = (v) => String(v || '').toUpperCase()
          const hA = toU(getAnswer(pa, 'humor_banter_style'))
          const hB = toU(getAnswer(pb, 'humor_banter_style'))
          const oAraw = getAnswer(pa, 'early_openness_comfort')
          const oBraw = getAnswer(pb, 'early_openness_comfort')
          const oA = oAraw !== '' && oAraw !== undefined && oAraw !== null ? parseInt(oAraw) : undefined
          const oB = oBraw !== '' && oBraw !== undefined && oBraw !== null ? parseInt(oBraw) : undefined
          let humor = 0
          if (hA && hB) {
            if (hA === hB) humor = 10
            else if ((hA === 'A' && hB === 'B') || (hA === 'B' && hB === 'A')) humor = 8
            else if ((hA === 'B' && hB === 'C') || (hA === 'C' && hB === 'B') || (hA === 'C' && hB === 'D') || (hA === 'D' && hB === 'C')) humor = 5
            else if ((hA === 'A' && hB === 'D') || (hA === 'D' && hB === 'A')) humor = 0
            else humor = 5
          }
          let open = 0
          if (oA !== undefined && oB !== undefined) {
            const dist = Math.abs(oA - oB)
            if (dist === 0) open = 5
            else if (dist === 1) open = 3
            else if (dist === 2) open = 1
            else open = 0
          }
          return humor + open // 0..15
        }
        const computeIntentScore = (pa, pb) => {
          const toU = (v) => String(v || '').toUpperCase()
          const a40 = toU(getAnswer(pa, 'intent_goal'))
          const b40 = toU(getAnswer(pb, 'intent_goal'))
          if (!a40 || !b40) return 0
          if ((a40 === 'A' && b40 === 'A') || (a40 === 'B' && b40 === 'B')) return 5
          if (a40 === 'C' && b40 === 'C') return 3
          if ((a40 === 'A' && b40 === 'B') || (a40 === 'B' && b40 === 'A')) return 1
          if ((a40 === 'A' && b40 === 'C') || (a40 === 'C' && b40 === 'A')) return 3
          if ((a40 === 'B' && b40 === 'C') || (a40 === 'C' && b40 === 'B')) return 1
          return 0
        }

        // Process match results into structured format - NO DUPLICATES
        const processedMatches = []
        const seenPairs = new Set() // Track processed pairs to avoid duplicates

        matchResults.forEach(match => {
          const participantNumbers = [
            match.participant_a_number,
            match.participant_b_number,
            match.participant_c_number,
            match.participant_d_number,
            match.participant_e_number,
            match.participant_f_number
          ].filter(num => num && num !== 9999)

          // Handle individual matches (2 participants) - NO DUPLICATES
          if (participantNumbers.length === 2) {
            const [pA, pB] = participantNumbers
            const eventId = match.event_id || 1
            
            // Create a unique pair identifier (always smaller number first)
            const base = pA < pB ? `${pA}-${pB}` : `${pB}-${pA}`
            // Include eventId so the same pair in different events are treated as distinct
            const pairKey = `${eventId}:${base}`
            
            // Skip if we've already processed this pair
            if (seenPairs.has(pairKey)) {
              return
            }
            seenPairs.add(pairKey)
            
            const participantA = participantMap.get(pA)
            const participantB = participantMap.get(pB)

            if (participantA && participantB) {
              // Always put smaller number as participant_a for consistency
              const [firstParticipant, secondParticipant] = pA < pB ? [participantA, participantB] : [participantB, participantA]
              const syn = Number(match.synergy_score ?? 0)
              const hum = Number(match.humor_open_score ?? 0)
              const inten = Number(match.intent_score ?? 0)
              const synergyVal = syn > 0 ? syn : computeSynergyScore(firstParticipant, secondParticipant)
              const humorOpenVal = hum > 0 ? hum : computeHumorOpenScore(firstParticipant, secondParticipant)
              const intentVal = inten > 0 ? inten : computeIntentScore(firstParticipant, secondParticipant)
              
              processedMatches.push({
                id: `${match.id}-individual`,
                participant_a: firstParticipant,
                participant_b: secondParticipant,
                compatibility_score: match.compatibility_score || 0,
                // Top-level access for UI
                synergy_score: synergyVal,
                humor_open_score: humorOpenVal,
                intent_score: intentVal,
                detailed_scores: {
                  mbti: match.mbti_compatibility_score || 0,
                  attachment: match.attachment_compatibility_score || 0,
                  communication: match.communication_compatibility_score || 0,
                  lifestyle: match.lifestyle_compatibility_score || 0,
                  core_values: match.core_values_compatibility_score || 0,
                  vibe: match.vibe_compatibility_score || 0,
                  synergy: synergyVal,
                  humor_open: humorOpenVal,
                  intent: intentVal
                },
                humor_multiplier: match.humor_multiplier || 1.0,
                bonus_type: match.humor_early_openness_bonus || 'none',
                attachment_penalty_applied: !!match.attachment_penalty_applied,
                intent_boost_applied: !!match.intent_boost_applied,
                dead_air_veto_applied: !!match.dead_air_veto_applied,
                humor_clash_veto_applied: !!match.humor_clash_veto_applied,
                cap_applied: match.cap_applied ?? null,
                round: match.event_id || 1, // Use event_id instead of round
                feedback_round: match.round, // preserve original round for feedback inference
                table_number: match.table_number,
                match_type: match.match_type || 'مقابلة فردية',
                mutual_match: match.mutual_match || false,
                is_repeat: match.is_repeat_match || false
              })
            }
          } else if (participantNumbers.length > 2) {
            // Handle group matches (3+ participants) - NO DUPLICATES
            for (let i = 0; i < participantNumbers.length; i++) {
              for (let j = i + 1; j < participantNumbers.length; j++) {
                const pA = participantNumbers[i]
                const pB = participantNumbers[j]
                const eventId = match.event_id || 1
                
                // Create a unique pair identifier for group pairs too
                const base = pA < pB ? `${pA}-${pB}` : `${pB}-${pA}`
                const pairKey = `group-${eventId}:${base}`
                
                // Skip if we've already processed this group pair
                if (seenPairs.has(pairKey)) {
                  continue
                }
                seenPairs.add(pairKey)
                
                const participantA = participantMap.get(pA)
                const participantB = participantMap.get(pB)

                if (participantA && participantB) {
                  // Always put smaller number as participant_a for consistency
                  const [firstParticipant, secondParticipant] = pA < pB ? [participantA, participantB] : [participantB, participantA]
                  const syn = Number(match.synergy_score ?? 0)
                  const hum = Number(match.humor_open_score ?? 0)
                  const inten = Number(match.intent_score ?? 0)
                  const synergyVal = syn > 0 ? syn : computeSynergyScore(firstParticipant, secondParticipant)
                  const humorOpenVal = hum > 0 ? hum : computeHumorOpenScore(firstParticipant, secondParticipant)
                  const intentVal = inten > 0 ? inten : computeIntentScore(firstParticipant, secondParticipant)
                  
                  processedMatches.push({
                    id: `${match.id}-group-${pA}-${pB}`,
                    participant_a: firstParticipant,
                    participant_b: secondParticipant,
                    compatibility_score: match.compatibility_score || 0,
                    // Top-level access for UI
                    synergy_score: synergyVal,
                    humor_open_score: humorOpenVal,
                    intent_score: intentVal,
                    detailed_scores: {
                      mbti: match.mbti_compatibility_score || 0,
                      attachment: match.attachment_compatibility_score || 0,
                      communication: match.communication_compatibility_score || 0,
                      lifestyle: match.lifestyle_compatibility_score || 0,
                      core_values: match.core_values_compatibility_score || 0,
                      vibe: match.vibe_compatibility_score || 0,
                      synergy: synergyVal,
                      humor_open: humorOpenVal,
                      intent: intentVal
                    },
                    humor_multiplier: match.humor_multiplier || 1.0,
                    bonus_type: match.humor_early_openness_bonus || 'none',
                    attachment_penalty_applied: !!match.attachment_penalty_applied,
                    intent_boost_applied: !!match.intent_boost_applied,
                    dead_air_veto_applied: !!match.dead_air_veto_applied,
                    humor_clash_veto_applied: !!match.humor_clash_veto_applied,
                    cap_applied: match.cap_applied ?? null,
                    round: match.event_id || 1, // Use event_id instead of round
                    feedback_round: match.round, // preserve original round for feedback inference
                    table_number: match.table_number,
                    match_type: match.match_type || 'مجموعة',
                    mutual_match: false, // Group matches are not mutual
                    is_repeat: match.is_repeat_match || false
                  })
                }
              }
            }
          }
        })

        // Fetch feedback for all matches
        console.log("Fetching feedback data for matches...")
        const { data: feedbackData, error: feedbackError } = await supabase
          .from("match_feedback")
          .select(`
            participant_number,
            round,
            event_id,
            compatibility_rate,
            conversation_quality,
            personal_connection,
            shared_interests,
            comfort_level,
            communication_style,
            would_meet_again,
            overall_experience,
            recommendations,
            participant_message,
            organizer_impression,
            submitted_at
          `)
          .eq("match_id", STATIC_MATCH_ID)

        if (feedbackError) {
          console.error("Error fetching feedback:", feedbackError)
          // Continue without feedback rather than failing
        }

        // Create feedback lookup map: participant_number -> event_id -> feedback
        const feedbackMap = new Map()
        if (feedbackData) {
          feedbackData.forEach(feedback => {
            if (!feedbackMap.has(feedback.participant_number)) {
              feedbackMap.set(feedback.participant_number, new Map())
            }
            feedbackMap.get(feedback.participant_number).set(feedback.event_id, feedback)
          })
        }

        // Add feedback to processed matches
        const matchesWithFeedback = processedMatches.map(match => {
          const eventId = match.round // event_id is stored in round field
          
          // Get feedback from both participants for this event
          const participantAFeedback = feedbackMap.get(match.participant_a.number)?.get(eventId)
          const participantBFeedback = feedbackMap.get(match.participant_b.number)?.get(eventId)
          
          return {
            ...match,
            feedback: {
              participant_a: participantAFeedback || null,
              participant_b: participantBFeedback || null,
              has_feedback: !!(participantAFeedback || participantBFeedback)
            }
          }
        })

        console.log(`Processed ${matchesWithFeedback.length} match pairs from ${matchResults.length} match records`)
        console.log(`Found feedback for ${feedbackData?.length || 0} feedback entries`)

        return res.status(200).json({
          success: true,
          matches: matchesWithFeedback,
          feedbackAll: feedbackData || [],
          totalRecords: matchResults.length,
          totalPairs: matchesWithFeedback.length,
          participantCount: participants.length,
          feedbackCount: feedbackData?.length || 0
        })

      } catch (error) {
        console.error("Error in get-all-matches:", error)
        return res.status(500).json({ error: "Failed to fetch all matches" })
      }
    }

    // 🔹 DELETE MATCH - Remove specific match using participant numbers and event_id
    if (action === "delete-match") {
      try {
        console.log("🔍 Raw delete request body:", JSON.stringify(req.body, null, 2))
        
        const { participantA, participantB, eventId } = req.body
        
        console.log("🔍 Extracted parameters:")
        console.log("  - participantA:", participantA, typeof participantA)
        console.log("  - participantB:", participantB, typeof participantB)  
        console.log("  - eventId:", eventId, typeof eventId)
        
        if (!participantA || !participantB || !eventId) {
          console.error("Delete match request missing required parameters:", { participantA, participantB, eventId })
          return res.status(400).json({ error: "Participant A, Participant B, and Event ID are required" })
        }
        
        console.log(`🗑️ Attempting to delete match: #${participantA} ↔ #${participantB} in event ${eventId}`)
        
        // Delete the match using participant numbers and event_id (bidirectional)
        const { error, count } = await supabase
          .from("match_results")
          .delete()
          .eq("match_id", STATIC_MATCH_ID)
          .eq("event_id", eventId)
          .or(`and(participant_a_number.eq.${participantA},participant_b_number.eq.${participantB}),and(participant_a_number.eq.${participantB},participant_b_number.eq.${participantA})`)
        
        if (error) {
          console.error("Error deleting match:", error)
          return res.status(500).json({ error: error.message })
        }
        
        if (count === 0) {
          console.log(`⚠️ No matches found for #${participantA} ↔ #${participantB} in event ${eventId}`)
          return res.status(404).json({ error: "Match not found" })
        }
        
        console.log(`✅ Successfully deleted match #${participantA} ↔ #${participantB} in event ${eventId}, rows affected: ${count}`)
        
        return res.status(200).json({
          success: true,
          message: "Match deleted successfully",
          participantA,
          participantB,
          eventId,
          rowsAffected: count || 0
        })
        
      } catch (error) {
        console.error("Error in delete-match:", error)
        return res.status(500).json({ error: "Failed to delete match" })
      }
    }

    // 🔹 ADD EXCLUDED PARTICIPANT (using excluded_pairs with -1 / -2 / -10)
    if (action === "add-excluded-participant") {
      try {
        const { participantNumber, reason = "Admin exclusion - participant excluded from all matching", banPermanently = false, groupOnly = false } = req.body

        if (!participantNumber || participantNumber <= 0) {
          return res.status(400).json({ error: "Valid participant number is required" })
        }

        if (participantNumber === 9999) {
          return res.status(400).json({ error: "Cannot exclude the organizer participant" })
        }

        // Check if participant exists
        const { data: participantCheck, error: participantError } = await supabase
          .from("participants")
          .select("assigned_number")
          .eq("assigned_number", participantNumber)
          .eq("match_id", STATIC_MATCH_ID)
          .single()

        if (participantError || !participantCheck) {
          return res.status(400).json({ error: "Participant number doesn't exist" })
        }

        // Codes: -10 banned, -1 exclude all matching, -2 exclude from group generation only
        const exclusionCode = groupOnly ? -2 : (banPermanently ? -10 : -1)
        const exclusionType = groupOnly ? "GROUP-ONLY EXCLUDED" : (banPermanently ? "PERMANENTLY BANNED" : "excluded")

        // Insert excluded participant using excluded_pairs table
        const { data, error } = await supabase
          .from("excluded_pairs")
          .insert([{
            match_id: STATIC_MATCH_ID,
            participant1_number: participantNumber,
            participant2_number: exclusionCode,
            reason: reason
          }])
          .select()
          .single()

        if (error) {
          if (error.code === '23505') { // Unique index violation
            return res.status(400).json({ error: "This participant is already excluded" })
          }
          console.error("Error adding excluded participant:", error)
          return res.status(500).json({ error: error.message })
        }

        console.log(`✅ Added ${exclusionType} participant: #${participantNumber} (code ${exclusionCode} in excluded_pairs)`)
        return res.status(200).json({ 
          success: true, 
          excludedParticipant: { 
            id: data.id, 
            participant_number: participantNumber, 
            created_at: data.created_at, 
            reason: data.reason,
            is_banned: banPermanently,
            group_only: groupOnly
          },
          message: groupOnly 
            ? `Participant #${participantNumber} excluded from group generation` 
            : `Participant #${participantNumber} ${banPermanently ? 'permanently banned' : 'excluded'} from all matching` 
        })

      } catch (error) {
        console.error("Error in add-excluded-participant:", error)
        return res.status(500).json({ error: "Failed to add excluded participant" })
      }
    }

    // 🔹 REMOVE EXCLUDED PARTICIPANT (from excluded_pairs with -1 / -2 / -10)
    if (action === "remove-excluded-participant") {
      try {
        const { id } = req.body

        if (!id) {
          return res.status(400).json({ error: "Excluded participant ID is required" })
        }

        // First, get the participant number from the exclusion record (allow -1, -2, -10)
        const { data: exclusionRecord, error: fetchError } = await supabase
          .from("excluded_pairs")
          .select("participant1_number, participant2_number")
          .eq("id", id)
          .eq("match_id", STATIC_MATCH_ID)
          .in("participant2_number", [-1, -2, -10])
          .single()

        if (fetchError || !exclusionRecord) {
          console.error("Error fetching exclusion record:", fetchError)
          return res.status(404).json({ error: "Exclusion record not found" })
        }

        const participantNumber = exclusionRecord.participant1_number

        // Delete the exclusion record (participant2_number in {-1, -2, -10})
        const { error: deleteExclusionError } = await supabase
          .from("excluded_pairs")
          .delete()
          .eq("id", id)
          .eq("match_id", STATIC_MATCH_ID)

        if (deleteExclusionError) {
          console.error("Error removing excluded participant:", deleteExclusionError)
          return res.status(500).json({ error: deleteExclusionError.message })
        }

        // Also remove all excluded pairs containing this participant
        const { data: deletedPairs, error: deletePairsError } = await supabase
          .from("excluded_pairs")
          .delete()
          .eq("match_id", STATIC_MATCH_ID)
          .or(`participant1_number.eq.${participantNumber},participant2_number.eq.${participantNumber}`)
          .select()

        if (deletePairsError) {
          console.error("Error removing excluded pairs:", deletePairsError)
          // Don't fail the whole operation, just log it
        }

        const pairsRemoved = deletedPairs?.length || 0
        console.log(`✅ Removed excluded participant #${participantNumber} (code ${exclusionRecord.participant2_number}) and ${pairsRemoved} associated pair(s)`)
        
        return res.status(200).json({ 
          success: true,
          pairsRemoved,
          message: pairsRemoved > 0 
            ? `Excluded participant removed and ${pairsRemoved} excluded pair(s) deleted`
            : "Excluded participant removed successfully"
        })

      } catch (error) {
        console.error("Error in remove-excluded-participant:", error)
        return res.status(500).json({ error: "Failed to remove excluded participant" })
      }
    }

    // CLEAR ALL EXCLUDED PARTICIPANTS (from excluded_pairs with -1)
    if (action === "clear-excluded-participants") {
      try {
        const { error } = await supabase
          .from("excluded_pairs")
          .delete()
          .eq("match_id", STATIC_MATCH_ID)
          .eq("participant2_number", -1)

        if (error) {
          console.error("Error clearing excluded participants:", error)
          return res.status(500).json({ error: error.message })
        }

        console.log(`✅ Cleared all excluded participants for match_id: ${STATIC_MATCH_ID}`)
        return res.status(200).json({ 
          success: true,
          message: "All excluded participants cleared successfully" 
        })

      } catch (error) {
        console.error("Error in clear-excluded-participants:", error)
        return res.status(500).json({ error: "Failed to clear excluded participants" })
      }
    }

    // UPDATE PAYMENT STATUS ACTION
    if (action === "update-payment-status") {
      try {
        const { participant_id, field, value } = req.body
        
        if (!participant_id || !field || value === undefined) {
          return res.status(400).json({ error: "Missing required parameters" })
        }
        
        if (field !== "PAID" && field !== "PAID_DONE") {
          return res.status(400).json({ error: "Invalid field name" })
        }
        
        const updateFields = { [field]: value }
        if (field === "PAID") {
          updateFields.whatsapp_contacted_event_id = value ? await getCurrentAdminEventId() : null
        }
        if (field === "PAID_DONE") {
          const paymentEventId = await getCurrentAdminEventId()
          updateFields.payment_completed_event_id = value ? paymentEventId : null
          if (value) {
            updateFields.payment_waived = false
            updateFields.payment_waived_event_id = null
          }
        }
        const { data, error } = await supabase
          .from("participants")
          .update(updateFields)
          .eq("id", participant_id)
          .eq("match_id", STATIC_MATCH_ID)
          .select()
        
        if (error) {
          console.error("Update error:", error)
          return res.status(500).json({ error: error.message })
        }
        
        console.log(`✅ Updated ${field} to ${value} for participant ${participant_id}`)
        return res.status(200).json({ success: true, data: data[0] })
        
      } catch (error) {
        console.error("Error updating payment status:", error)
        return res.status(500).json({ error: "Failed to update payment status" })
      }
    }

    // PIN MATCH ACTION - Assign table number to a match
    if (action === "pin-match") {
      try {
        const { match_id: matchResultId } = req.body
        
        if (!matchResultId) {
          return res.status(400).json({ error: "Missing match_id parameter" })
        }
        
        // Get the highest current table number
        const { data: maxTableData, error: maxTableError } = await supabase
          .from("match_results")
          .select("table_number")
          .eq("match_id", STATIC_MATCH_ID)
          .not("table_number", "is", null)
          .order("table_number", { ascending: false })
          .limit(1)
        
        if (maxTableError) {
          console.error("Error getting max table number:", maxTableError)
          return res.status(500).json({ error: maxTableError.message })
        }
        
        // Calculate next table number
        const nextTableNumber = maxTableData && maxTableData.length > 0 
          ? maxTableData[0].table_number + 1 
          : 1
        
        // Update the match with the table number
        const { data, error } = await supabase
          .from("match_results")
          .update({ table_number: nextTableNumber })
          .eq("id", matchResultId)
          .eq("match_id", STATIC_MATCH_ID)
          .select()
        
        if (error) {
          console.error("Error pinning match:", error)
          return res.status(500).json({ error: error.message })
        }
        
        if (!data || data.length === 0) {
          return res.status(404).json({ error: "Match not found" })
        }
        
        console.log(`✅ Pinned match ${matchResultId} to table ${nextTableNumber}`)
        return res.status(200).json({ 
          success: true, 
          table_number: nextTableNumber,
          match: data[0]
        })
        
      } catch (error) {
        console.error("Error pinning match:", error)
        return res.status(500).json({ error: "Failed to pin match" })
      }
    }

    // PREPARE FOR NEXT EVENT ACTION - Reset all participants for next event
    if (action === "prepare-next-event") {
      try {
        console.log("🔄 Preparing for next event - resetting participant statuses...")
        
        // Update all participants to reset their status for next event
        const { data, error } = await supabase
          .from("participants")
          .update({
            signup_for_next_event: false,
            PAID: false,
            whatsapp_contacted_event_id: null,
            PAID_DONE: false,
            payment_completed_event_id: null,
            payment_waived: false,
            payment_waived_event_id: null,
            payment_reminder_sent: false,
            attendance_confirmed: false,
            attendance_confirmed_at: null,
            attendance_denied_at: null,
            arrival_status: null,
            arrival_status_at: null,
            receipt_url: null,
            receipt_received_at: null,
            receipt_approved: false,
            receipt_approved_at: null,
            receipt_rejected: false,
            receipt_rejected_at: null,
            discount_interest: null,
            last_twilio_action: null,
            last_twilio_action_at: null
          })
          .eq("match_id", STATIC_MATCH_ID)
          .select("id, assigned_number")
        
        if (error) {
          console.error("Error preparing for next event:", error)
          return res.status(500).json({ error: error.message })
        }
        
        const updatedCount = data ? data.length : 0
        console.log(`✅ Successfully prepared for next event - updated ${updatedCount} participants`)
        
        return res.status(200).json({ 
          success: true, 
          message: "Successfully prepared for next event",
          updatedCount: updatedCount,
          details: {
            signup_for_next_event: false,
            PAID: false,
            PAID_DONE: false,
            payment_waived: false,
            payment_reminder_sent: false,
            attendance_reset: true,
            arrival_reset: true,
            receipt_status_reset: true,
            twilio_action_reset: true
          }
        })
        
      } catch (error) {
        console.error("Error preparing for next event:", error)
        return res.status(500).json({ error: "Failed to prepare for next event" })
      }
    }

    // GET CACHED RESULTS ACTION - Fetch results from compatibility cache table
    if (action === "get-cached-results") {
      try {
        const { event_id } = req.body
        
        if (!event_id) {
          return res.status(400).json({ error: "Missing event_id parameter" })
        }
        
        console.log(`🔍 Fetching cached results for event ${event_id}`)
        
        // Get all compatibility cache entries and match results for the event
        const { data: cacheData, error: cacheError } = await supabase
          .from("compatibility_cache")
          .select("*")
          .order("last_used", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
        
        if (cacheError) {
          console.error("Error fetching cache data:", cacheError)
          return res.status(500).json({ error: cacheError.message })
        }
        
        // Get match results for the event to identify actual matches
        const { data: matchResults, error: matchError } = await supabase
          .from("match_results")
          .select("*")
          .eq("match_id", STATIC_MATCH_ID)
          .eq("event_id", event_id)
        
        if (matchError) {
          console.error("Error fetching match results:", matchError)
          return res.status(500).json({ error: matchError.message })
        }
        
        // Get all participants to have their names and info
        const { data: participants, error: participantsError } = await supabase
          .from("participants")
          .select("id, assigned_number, name, survey_data, PAID_DONE, payment_completed_event_id")
          .eq("match_id", STATIC_MATCH_ID)
        
        if (participantsError) {
          console.error("Error fetching participants:", participantsError)
          return res.status(500).json({ error: participantsError.message })
        }
        
        // Create participant info map
        const participantInfoMap = new Map()
        participants.forEach(p => {
          participantInfoMap.set(p.assigned_number, {
            id: p.id,
            name: p.name || p.survey_data?.name || `المشارك #${p.assigned_number}`,
            paid_done: p.PAID_DONE === true && Number(p.payment_completed_event_id) === Number(event_id)
          })
        })
        
        // Create match results map for quick lookup
        const matchResultsMap = new Map()
        matchResults.forEach(match => {
          const key1 = `${match.participant_a_number}-${match.participant_b_number}`
          const key2 = `${match.participant_b_number}-${match.participant_a_number}`
          matchResultsMap.set(key1, match)
          matchResultsMap.set(key2, match)
        })
        
        // Questionnaire/model changes intentionally create multiple cache hashes
        // for the same pair. Expose only the most recently used calculation so
        // every admin view resolves the same score deterministically.
        const latestCacheByPair = new Map()
        for (const cache of cacheData || []) {
          const a = Math.min(Number(cache.participant_a_number), Number(cache.participant_b_number))
          const b = Math.max(Number(cache.participant_a_number), Number(cache.participant_b_number))
          const key = `${a}-${b}`
          const existing = latestCacheByPair.get(key)
          const cacheTime = Date.parse(cache.last_used || cache.created_at || "") || 0
          const existingTime = Date.parse(existing?.last_used || existing?.created_at || "") || 0
          if (!existing || cacheTime > existingTime) latestCacheByPair.set(key, cache)
        }

        // Convert the canonical cache rows to calculated pairs format
        const calculatedPairs = Array.from(latestCacheByPair.values()).map(cache => {
          const key = `${cache.participant_a_number}-${cache.participant_b_number}`
          const matchResult = matchResultsMap.get(key)
          const isActualMatch = !!matchResult
          
          return {
            id: cache.id,
            participant_a: cache.participant_a_number,
            participant_b: cache.participant_b_number,
            compatibility_score: Math.round(parseFloat(cache.total_compatibility_score)),
            mbti_compatibility_score: parseFloat(cache.mbti_score),
            attachment_compatibility_score: parseFloat(cache.attachment_score),
            communication_compatibility_score: parseFloat(cache.communication_score),
            lifestyle_compatibility_score: parseFloat(cache.lifestyle_score),
            core_values_compatibility_score: parseFloat(cache.core_values_score),
            vibe_compatibility_score: parseFloat(cache.ai_vibe_score),
            reason: `MBTI: ${parseFloat(cache.mbti_score).toFixed(1)}% + Attachment: ${parseFloat(cache.attachment_score).toFixed(1)}% + Communication: ${parseFloat(cache.communication_score).toFixed(1)}% + Lifestyle: ${parseFloat(cache.lifestyle_score).toFixed(1)}% + Values: ${parseFloat(cache.core_values_score).toFixed(1)}% + Vibe: ${parseFloat(cache.ai_vibe_score).toFixed(1)}%`,
            is_actual_match: isActualMatch,
            use_count: cache.use_count,
            last_used: cache.last_used,
            created_at: cache.created_at
          }
        })
        
        // Convert match results to participant results format
        const participantResults = []
        const processedParticipants = new Set()
        
        matchResults.forEach(match => {
          // Process participant A
          if (match.participant_a_number && !processedParticipants.has(match.participant_a_number)) {
            const participantInfo = participantInfoMap.get(match.participant_a_number)
            const partnerInfo = participantInfoMap.get(match.participant_b_number)
            
            participantResults.push({
              id: participantInfo?.id || `participant_${match.participant_a_number}`,
              assigned_number: match.participant_a_number,
              name: participantInfo?.name || `المشارك #${match.participant_a_number}`,
              compatibility_score: match.compatibility_score || 0,
              mbti_compatibility_score: match.mbti_compatibility_score || 0,
              attachment_compatibility_score: match.attachment_compatibility_score || 0,
              communication_compatibility_score: match.communication_compatibility_score || 0,
              lifestyle_compatibility_score: match.lifestyle_compatibility_score || 0,
              core_values_compatibility_score: match.core_values_compatibility_score || 0,
              vibe_compatibility_score: match.vibe_compatibility_score || 0,
              partner_assigned_number: match.participant_b_number,
              partner_name: partnerInfo?.name || `المشارك #${match.participant_b_number}`,
              is_organizer_match: match.participant_b_number === 9999,
              paid_done: participantInfo?.paid_done || false,
              partner_paid_done: partnerInfo?.paid_done || false
            })
            processedParticipants.add(match.participant_a_number)
          }
          
          // Process participant B (only if not organizer and not already processed)
          if (match.participant_b_number && match.participant_b_number !== 9999 && !processedParticipants.has(match.participant_b_number)) {
            const participantInfo = participantInfoMap.get(match.participant_b_number)
            const partnerInfo = participantInfoMap.get(match.participant_a_number)
            
            participantResults.push({
              id: participantInfo?.id || `participant_${match.participant_b_number}`,
              assigned_number: match.participant_b_number,
              name: participantInfo?.name || `المشارك #${match.participant_b_number}`,
              compatibility_score: match.compatibility_score || 0,
              mbti_compatibility_score: match.mbti_compatibility_score || 0,
              attachment_compatibility_score: match.attachment_compatibility_score || 0,
              communication_compatibility_score: match.communication_compatibility_score || 0,
              lifestyle_compatibility_score: match.lifestyle_compatibility_score || 0,
              core_values_compatibility_score: match.core_values_compatibility_score || 0,
              vibe_compatibility_score: match.vibe_compatibility_score || 0,
              partner_assigned_number: match.participant_a_number,
              partner_name: partnerInfo?.name || `المشارك #${match.participant_a_number}`,
              is_organizer_match: match.participant_a_number === 9999,
              paid_done: participantInfo?.paid_done || false,
              partner_paid_done: partnerInfo?.paid_done || false
            })
            processedParticipants.add(match.participant_b_number)
          }
        })
        
        console.log(`✅ Found ${calculatedPairs.length} cached pairs and ${participantResults.length} participant results for event ${event_id}`)
        
        return res.status(200).json({
          success: true,
          calculatedPairs,
          participantResults,
          totalMatches: matchResults.length,
          cacheStats: {
            totalPairs: calculatedPairs.length,
            historicalRows: cacheData.length,
            avgUseCount: cacheData.length > 0 ? (cacheData.reduce((sum, c) => sum + c.use_count, 0) / cacheData.length).toFixed(1) : 0
          }
        })
        
      } catch (error) {
        console.error("Error fetching cached results:", error)
        return res.status(500).json({ error: "Failed to fetch cached results" })
      }
    }

    // SAVE ADMIN RESULTS ACTION - Store match generation session for persistence
    if (action === "save-admin-results") {
      try {
        const { 
          sessionId, 
          eventId, 
          matchType, 
          generationType, 
          matchResults, 
          calculatedPairs, 
          participantResults,
          totalMatches,
          totalParticipants,
          skipAI,
          excludedPairs,
          excludedParticipants,
          lockedMatches,
          generationDurationMs,
          cacheHitRate,
          aiCallsMade,
          notes
        } = req.body
        
        if (!sessionId || !eventId || !matchType || !generationType) {
          return res.status(400).json({ error: "Missing required parameters" })
        }
        
        console.log(`💾 Saving admin results session: ${sessionId}`)
        
        // Deactivate previous sessions of the same type for this event
        const { error: deactivateError } = await supabase
          .from("admin_results")
          .update({ is_active: false })
          .eq("event_id", eventId)
          .eq("match_type", matchType)
          .eq("is_active", true)
        
        if (deactivateError) {
          console.error("Error deactivating previous sessions:", deactivateError)
        }
        
        // Insert new session
        const { data, error } = await supabase
          .from("admin_results")
          .insert([{
            session_id: sessionId,
            event_id: eventId,
            match_type: matchType,
            generation_type: generationType,
            match_results: matchResults || [],
            calculated_pairs: calculatedPairs || [],
            participant_results: participantResults || [],
            total_matches: totalMatches || 0,
            total_participants: totalParticipants || 0,
            skip_ai: skipAI || false,
            excluded_pairs: excludedPairs || [],
            excluded_participants: excludedParticipants || [],
            locked_matches: lockedMatches || [],
            generation_duration_ms: generationDurationMs,
            cache_hit_rate: cacheHitRate,
            ai_calls_made: aiCallsMade || 0,
            notes: notes || null
          }])
          .select()
          .single()
        
        if (error) {
          console.error("Error saving admin results:", error)
          return res.status(500).json({ error: error.message })
        }
        
        console.log(`✅ Saved admin results session: ${sessionId}`)
        return res.status(200).json({ 
          success: true, 
          sessionId: data.session_id,
          id: data.id 
        })
        
      } catch (error) {
        console.error("Error saving admin results:", error)
        return res.status(500).json({ error: "Failed to save admin results" })
      }
    }

    // GET ADMIN RESULTS ACTION - Retrieve saved match generation sessions
    if (action === "get-admin-results") {
      try {
        const { eventId, matchType, sessionId, includeInactive = false } = req.body

        if (!matchType || matchType === "individual") {
          const testSession = await getActiveEvent3TestSession(eventId)
          if (testSession && (!sessionId || sessionId === testSession.session_id)) {
            return res.status(200).json({ success: true, sessions: [testSession], test_mode: true })
          }
        }
        
        let query = supabase
          .from("admin_results")
          .select("*")
          .order("created_at", { ascending: false })
        
        if (eventId) {
          query = query.eq("event_id", eventId)
        }
        
        if (matchType) {
          query = query.eq("match_type", matchType)
        }
        
        if (sessionId) {
          query = query.eq("session_id", sessionId)
        }
        
        if (!includeInactive) {
          query = query.eq("is_active", true)
        }
        
        const { data, error } = await query
        
        if (error) {
          console.error("Error fetching admin results:", error)
          return res.status(500).json({ error: error.message })
        }
        
        console.log(`📊 Retrieved ${data.length} admin results sessions`)
        return res.status(200).json({ 
          success: true, 
          sessions: data 
        })
        
      } catch (error) {
        console.error("Error fetching admin results:", error)
        return res.status(500).json({ error: "Failed to fetch admin results" })
      }
    }

    // GET LATEST ADMIN RESULTS ACTION - Get the most recent active session
    if (action === "get-latest-admin-results") {
      try {
        const { eventId, matchType } = req.body
        
        if (!eventId || !matchType) {
          return res.status(400).json({ error: "Missing eventId or matchType" })
        }

        if (matchType === "individual") {
          const testSession = await getActiveEvent3TestSession(eventId)
          if (testSession) {
            return res.status(200).json({ success: true, session: testSession, test_mode: true })
          }
        }
        
        const { data, error } = await supabase
          .from("admin_results")
          .select("*")
          .eq("event_id", eventId)
          .eq("match_type", matchType)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .single()
        
        if (error && error.code !== 'PGRST116') {
          console.error("Error fetching latest admin results:", error)
          return res.status(500).json({ error: error.message })
        }
        
        if (!data) {
          return res.status(200).json({ 
            success: true, 
            session: null,
            message: "No active session found" 
          })
        }
        
        console.log(`📊 Retrieved latest admin results: ${data.session_id}`)
        return res.status(200).json({ 
          success: true, 
          session: data 
        })
        
      } catch (error) {
        console.error("Error fetching latest admin results:", error)
        return res.status(500).json({ error: "Failed to fetch latest admin results" })
      }
    }

    // PIN ADMIN RESULTS ACTION - Pin/unpin a session for easy access
    if (action === "pin-admin-results") {
      try {
        const { sessionId, pinned } = req.body
        
        if (!sessionId || typeof pinned !== 'boolean') {
          return res.status(400).json({ error: "Missing sessionId or pinned parameter" })
        }
        
        const { error } = await supabase
          .from("admin_results")
          .update({ is_pinned: pinned })
          .eq("session_id", sessionId)
        
        if (error) {
          console.error("Error pinning admin results:", error)
          return res.status(500).json({ error: error.message })
        }
        
        console.log(`📌 ${pinned ? 'Pinned' : 'Unpinned'} session: ${sessionId}`)
        return res.status(200).json({ 
          success: true, 
          message: `Session ${pinned ? 'pinned' : 'unpinned'} successfully` 
        })
        
      } catch (error) {
        console.error("Error pinning admin results:", error)
        return res.status(500).json({ error: "Failed to pin admin results" })
      }
    }

    // DELETE ADMIN RESULTS ACTION - Remove a session
    if (action === "delete-admin-results") {
      try {
        const { sessionId } = req.body
        
        if (!sessionId) {
          return res.status(400).json({ error: "Missing sessionId parameter" })
        }
        
        const { error } = await supabase
          .from("admin_results")
          .delete()
          .eq("session_id", sessionId)
        
        if (error) {
          console.error("Error deleting admin results:", error)
          return res.status(500).json({ error: error.message })
        }
        
        console.log(`🗑️ Deleted session: ${sessionId}`)
        return res.status(200).json({ 
          success: true, 
          message: "Session deleted successfully" 
        })
        
      } catch (error) {
        console.error("Error deleting admin results:", error)
        return res.status(500).json({ error: "Failed to delete admin results" })
      }
    }

    // GET FRESH RESULTS ACTION - Load current database state (for post-swap refreshes)
    if (action === "get-fresh-results") {
      try {
        const { event_id, match_type } = req.body
        
        if (!event_id || !match_type) {
          return res.status(400).json({ error: "Missing event_id or match_type" })
        }
        
        console.log(`🔄 Fetching fresh ${match_type} results from database for event ${event_id}`)
        
        if (match_type === "group") {
          // Fetch group matches from group_matches table
          const { data: groupMatches, error: groupError } = await supabase
            .from("group_matches")
            .select("*")
            .eq("match_id", STATIC_MATCH_ID)
            .eq("event_id", event_id)
            .order("group_number", { ascending: true })
          
          if (groupError) {
            console.error("Error fetching fresh group results:", groupError)
            return res.status(500).json({ error: groupError.message })
          }
          
          console.log(`✅ Loaded ${groupMatches?.length || 0} fresh group matches`)
          return res.status(200).json({ 
            success: true, 
            results: groupMatches || [],
            calculatedPairs: [] // Groups don't have calculated pairs
          })
        } else {
          // During Event3 test mode, expose only the isolated temporary rows.
          // Real match_results remain untouched and hidden until the test ends.
          const testSession = await getActiveEvent3TestSession(event_id)
          let matchResults
          let matchError = null
          if (testSession) {
            matchResults = testSession.match_results
          } else {
            const result = await supabase
              .from("match_results")
              .select("*")
              .eq("match_id", STATIC_MATCH_ID)
              .eq("event_id", event_id)
              .neq("round", 0) // Exclude group matches (round = 0)
              .order("created_at", { ascending: false })
            matchResults = result.data
            matchError = result.error
          }
          
          if (matchError) {
            console.error("Error fetching fresh individual results:", matchError)
            return res.status(500).json({ error: matchError.message })
          }

          // Get compatibility cache data for calculated pairs
          const { data: cacheData, error: cacheError } = await supabase
            .from("compatibility_cache")
            .select("*")
            .order("total_compatibility_score", { ascending: false })
          
          if (cacheError) {
            console.warn("Could not fetch cache data:", cacheError)
          }
          
          // Convert cache data to calculated pairs format
          const calculatedPairs = (cacheData || []).map(cache => ({
            participant_a: cache.participant_a_number,
            participant_b: cache.participant_b_number,
            compatibility_score: Math.round(parseFloat(cache.total_compatibility_score)),
            mbti_compatibility_score: parseFloat(cache.mbti_score),
            attachment_compatibility_score: parseFloat(cache.attachment_score),
            communication_compatibility_score: parseFloat(cache.communication_score),
            lifestyle_compatibility_score: parseFloat(cache.lifestyle_score),
            core_values_compatibility_score: parseFloat(cache.core_values_score),
            vibe_compatibility_score: parseFloat(cache.ai_vibe_score),
            reason: `MBTI: ${parseFloat(cache.mbti_score).toFixed(1)}% + Attachment: ${parseFloat(cache.attachment_score).toFixed(1)}% + Communication: ${parseFloat(cache.communication_score).toFixed(1)}% + Lifestyle: ${parseFloat(cache.lifestyle_score).toFixed(1)}% + Values: ${parseFloat(cache.core_values_score).toFixed(1)}% + Vibe: ${parseFloat(cache.ai_vibe_score).toFixed(1)}%`,
            is_actual_match: matchResults?.some(match => 
              (match.participant_a_number === cache.participant_a_number && match.participant_b_number === cache.participant_b_number) ||
              (match.participant_a_number === cache.participant_b_number && match.participant_b_number === cache.participant_a_number)
            ) || false
          }))
          
          // Fetch participant names to include with results
          const { data: participants, error: participantsError } = await supabase
            .from("participants")
            .select("assigned_number, name, survey_data")
            .eq("match_id", STATIC_MATCH_ID)
            .neq("assigned_number", 9999)
          
          if (participantsError) {
            console.warn("Could not fetch participant names:", participantsError)
          }
          
          // Create participant name map
          const participantNameMap = new Map()
          if (participants) {
            participants.forEach(p => {
              const name = p.name || p.survey_data?.name || `المشارك #${p.assigned_number}`
              participantNameMap.set(p.assigned_number, name)
            })
          }
          
          // Enhance match results with participant names
          const enhancedResults = (matchResults || []).map(match => ({
            ...match,
            participant_a_name: participantNameMap.get(match.participant_a_number) || `المشارك #${match.participant_a_number}`,
            participant_b_name: participantNameMap.get(match.participant_b_number) || `المشارك #${match.participant_b_number}`
          }))
          
          console.log(`✅ Loaded ${enhancedResults.length} fresh individual matches with ${calculatedPairs.length} calculated pairs and participant names`)
          return res.status(200).json({ 
            success: true, 
            results: enhancedResults,
            calculatedPairs: calculatedPairs,
            participantNames: Object.fromEntries(participantNameMap),
            test_mode: !!testSession,
          })
        }
        
      } catch (error) {
        console.error("Error fetching fresh results:", error)
        return res.status(500).json({ error: "Failed to fetch fresh results" })
      }
    }

    // 🔹 CLEAN SLATE - Remove last admin result and current event matches
    if (action === "clean-slate") {
      try {
        const { event_id } = req.body
        console.log(`🧹 Starting clean slate operation for event_id: ${event_id}`)
        
        let adminResultsRemoved = 0
        let matchesRemoved = 0
        
        // Step 1: Remove the LAST admin result from admin_results table
        const { data: lastAdminResult, error: fetchError } = await supabase
          .from("admin_results")
          .select("id, created_at, match_type")
          .order("created_at", { ascending: false })
          .limit(1)
          .single()
        
        if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = no rows found
          console.error("Error fetching last admin result:", fetchError)
          return res.status(500).json({ error: "Failed to fetch last admin result" })
        }
        
        if (lastAdminResult) {
          const { error: deleteAdminError } = await supabase
            .from("admin_results")
            .delete()
            .eq("id", lastAdminResult.id)
          
          if (deleteAdminError) {
            console.error("Error deleting admin result:", deleteAdminError)
            return res.status(500).json({ error: "Failed to delete admin result" })
          }
          
          adminResultsRemoved = 1
          console.log(`✅ Removed admin result: ${lastAdminResult.id} (${lastAdminResult.match_type}, ${lastAdminResult.created_at})`)
        } else {
          console.log("ℹ️ No admin results found to remove")
        }
        
        // Step 2: Remove ALL matches for the current event from match_results table
        const { data: matchesToDelete, error: fetchMatchesError } = await supabase
          .from("match_results")
          .select("id")
          .eq("event_id", event_id)
        
        if (fetchMatchesError) {
          console.error("Error fetching matches to delete:", fetchMatchesError)
          return res.status(500).json({ error: "Failed to fetch matches to delete" })
        }
        
        if (matchesToDelete && matchesToDelete.length > 0) {
          const { error: deleteMatchesError } = await supabase
            .from("match_results")
            .delete()
            .eq("event_id", event_id)
          
          if (deleteMatchesError) {
            console.error("Error deleting matches:", deleteMatchesError)
            return res.status(500).json({ error: "Failed to delete matches" })
          }
          
          matchesRemoved = matchesToDelete.length
          console.log(`✅ Removed ${matchesRemoved} matches for event ${event_id}`)
        } else {
          console.log(`ℹ️ No matches found for event ${event_id} to remove`)
        }
        
        console.log(`🧹 Clean slate completed: ${adminResultsRemoved} admin results + ${matchesRemoved} matches removed`)
        
        return res.status(200).json({ 
          success: true,
          message: "Clean slate completed successfully",
          adminResultsRemoved,
          matchesRemoved,
          event_id
        })
        
      } catch (error) {
        console.error("Error during clean slate operation:", error)
        return res.status(500).json({ error: "Failed to complete clean slate operation" })
      }
    }

    // 🔹 RESET GROUPS - Remove all group matches for current event
    if (action === "reset-groups") {
      try {
        const { event_id } = req.body
        console.log(`🔄 Resetting all groups for event_id: ${event_id}`)
        
        // Get count of groups before deletion
        const { data: groupsToDelete, error: fetchError } = await supabase
          .from("group_matches")
          .select("id")
          .eq("event_id", event_id)
        
        if (fetchError) {
          console.error("Error fetching groups to delete:", fetchError)
          return res.status(500).json({ error: "Failed to fetch groups to delete" })
        }
        
        const groupCount = groupsToDelete ? groupsToDelete.length : 0
        
        if (groupCount > 0) {
          // Delete all group matches for the current event
          const { error: deleteError } = await supabase
            .from("group_matches")
            .delete()
            .eq("event_id", event_id)
          
          if (deleteError) {
            console.error("Error deleting groups:", deleteError)
            return res.status(500).json({ error: "Failed to delete groups" })
          }
          
          console.log(`✅ Removed ${groupCount} group(s) for event ${event_id}`)
        } else {
          console.log(`ℹ️ No groups found for event ${event_id}`)
        }
        
        // Also clear attendance records for this event (and current match)
        let attendanceCount = 0
        const { data: attendanceToDelete, error: attendanceFetchError } = await supabase
          .from("event_attendance")
          .select("id")
          .eq("match_id", STATIC_MATCH_ID)
          .eq("event_id", event_id)
        
        if (attendanceFetchError) {
          console.error("Error fetching attendance to delete:", attendanceFetchError)
          return res.status(500).json({ error: "Failed to fetch attendance to delete" })
        }
        
        attendanceCount = attendanceToDelete ? attendanceToDelete.length : 0
        if (attendanceCount > 0) {
          const { error: attendanceDeleteError } = await supabase
            .from("event_attendance")
            .delete()
            .eq("match_id", STATIC_MATCH_ID)
            .eq("event_id", event_id)
          if (attendanceDeleteError) {
            console.error("Error deleting attendance:", attendanceDeleteError)
            return res.status(500).json({ error: "Failed to clear attendance" })
          }
          console.log(`🧹 Cleared ${attendanceCount} attendance record(s) for event ${event_id}`)
        } else {
          console.log(`ℹ️ No attendance found for event ${event_id}`)
        }
        
        return res.status(200).json({ 
          success: true,
          message: "Groups reset successfully",
          groupsRemoved: groupCount,
          attendanceCleared: attendanceCount,
          event_id
        })
        
      } catch (error) {
        console.error("Error during reset groups operation:", error)
        return res.status(500).json({ error: "Failed to reset groups" })
      }
    }

    // 🔹 CLEAR NON-PERMANENT EXCLUSIONS - Remove all temporary exclusions (keep permanent bans)
    if (action === "clear-temp-exclusions") {
      try {
        console.log(`🧹 Clearing all temporary exclusions (keeping permanent bans with -10)`)
        
        // Delete all excluded_pairs where participant2_number = -1 (temporary exclusions)
        // Keep entries with participant2_number = -10 (permanent bans)
        const { data: exclusionsToDelete, error: fetchError } = await supabase
          .from("excluded_pairs")
          .select("id, participant1_number, participant2_number")
          .eq("match_id", STATIC_MATCH_ID)
          .eq("participant2_number", -1)
          .neq("participant2_number", -10) // Extra safety: explicitly exclude permanent bans
        
        if (fetchError) {
          console.error("Error fetching exclusions to delete:", fetchError)
          return res.status(500).json({ error: "Failed to fetch exclusions to delete" })
        }
        
        const exclusionCount = exclusionsToDelete ? exclusionsToDelete.length : 0
        
        // Extra validation: ensure we're only deleting -1 entries
        const idsToDelete = (exclusionsToDelete || [])
          .filter(item => item.participant2_number === -1) // Double-check it's not -10
          .map(item => item.id)
        
        if (idsToDelete.length === 0) {
          console.log(`ℹ️ No temporary exclusions (-1) found to remove`)
          return res.status(200).json({ 
            success: true,
            exclusionsRemoved: 0, 
            message: "No temporary exclusions found" 
          })
        }
        
        const { error: deleteError } = await supabase
          .from("excluded_pairs")
          .delete()
          .in("id", idsToDelete) // Delete only specific IDs that we've verified are -1
        
        if (deleteError) {
          console.error("Error deleting temporary exclusions:", deleteError)
          return res.status(500).json({ error: "Failed to delete temporary exclusions" })
        }
        
        console.log(`✅ Removed ${idsToDelete.length} temporary exclusion(s), kept permanent bans (-10)`)
        
        return res.status(200).json({ 
          success: true,
          message: "Temporary exclusions cleared successfully",
          exclusionsRemoved: idsToDelete.length
        })
        
      } catch (error) {
        console.error("Error during clear temp exclusions operation:", error)
        return res.status(500).json({ error: "Failed to clear temporary exclusions" })
      }
    }

    // 🔹 MARK MESSAGES SENT - Update PAID status for selected participants
    if (action === "mark-messages-sent") {
      try {
        const { participantNumbers } = req.body
        
        if (!participantNumbers || !Array.isArray(participantNumbers) || participantNumbers.length === 0) {
          return res.status(400).json({ error: "Missing or invalid participantNumbers array" })
        }
        
        console.log(`📱 Marking ${participantNumbers.length} participants as message sent: ${participantNumbers.join(', ')}`)
        
        const currentEventId = await getCurrentAdminEventId()
        // Keep the legacy UI flag while recording which event this contact belongs to.
        const { data, error } = await supabase
          .from("participants")
          .update({ PAID: true, whatsapp_contacted_event_id: currentEventId })
          .eq("match_id", STATIC_MATCH_ID)
          .in("assigned_number", participantNumbers)
        
        if (error) {
          console.error("Error updating message sent status:", error)
          return res.status(500).json({ error: "Failed to update message sent status" })
        }
        
        console.log(`✅ Successfully marked ${participantNumbers.length} participants as message sent`)
        
        return res.status(200).json({ 
          success: true,
          message: `Marked ${participantNumbers.length} participants as message sent`,
          updatedParticipants: participantNumbers.length
        })
        
      } catch (error) {
        console.error("Error in mark-messages-sent:", error)
        return res.status(500).json({ error: "Failed to mark messages as sent" })
      }
    }

    // 🔹 TOGGLE MESSAGE STATUS - Toggle PAID status for individual participant
    if (action === "toggle-message-status") {
      try {
        const { participantNumber, newStatus } = req.body
        
        if (typeof participantNumber !== 'number' || typeof newStatus !== 'boolean') {
          return res.status(400).json({ error: "Invalid participantNumber or newStatus" })
        }
        
        console.log(`📱 Toggling message status for participant #${participantNumber} to ${newStatus}`)
        
        const currentEventId = await getCurrentAdminEventId()
        // Clearing the flag also clears its event scope so it cannot authorize a reply.
        const { data, error } = await supabase
          .from("participants")
          .update({ PAID: newStatus, whatsapp_contacted_event_id: newStatus ? currentEventId : null })
          .eq("match_id", STATIC_MATCH_ID)
          .eq("assigned_number", participantNumber)
        
        if (error) {
          console.error("Error updating message status:", error)
          return res.status(500).json({ error: "Failed to update message status" })
        }
        
        console.log(`✅ Successfully updated message status for participant #${participantNumber} to ${newStatus}`)
        
        return res.status(200).json({ 
          success: true,
          message: `Updated message status for participant #${participantNumber}`,
          participantNumber,
          newStatus,
          updates: {
            PAID: newStatus,
            whatsapp_contacted_event_id: newStatus ? currentEventId : null,
          },
        })
        
      } catch (error) {
        console.error("Error in toggle-message-status:", error)
        return res.status(500).json({ error: "Failed to toggle message status" })
      }
    }

    // 🔹 TOGGLE PAYMENT STATUS - Toggle PAID_DONE status for individual participant
    if (action === "toggle-payment-status") {
      try {
        const { participantNumber, newStatus } = req.body
        
        if (typeof participantNumber !== 'number' || typeof newStatus !== 'boolean') {
          return res.status(400).json({ error: "Invalid participantNumber or newStatus" })
        }
        
        console.log(`💰 Toggling payment status for participant #${participantNumber} to ${newStatus}`)
        const paymentEventId = await getCurrentAdminEventId()
        
        // Update PAID_DONE column for the specific participant
        const { data, error } = await supabase
          .from("participants")
          .update({
            PAID_DONE: newStatus,
            payment_completed_event_id: newStatus ? paymentEventId : null,
            ...(newStatus ? { payment_waived: false, payment_waived_event_id: null } : {}),
          })
          .eq("match_id", STATIC_MATCH_ID)
          .eq("assigned_number", participantNumber)
        
        if (error) {
          console.error("Error updating payment status:", error)
          return res.status(500).json({ error: "Failed to update payment status" })
        }
        
        console.log(`✅ Successfully updated payment status for participant #${participantNumber} to ${newStatus}`)
        
        return res.status(200).json({ 
          success: true,
          message: `Updated payment status for participant #${participantNumber}`,
          participantNumber,
          newStatus
        })
        
      } catch (error) {
        console.error("Error in toggle-payment-status:", error)
        return res.status(500).json({ error: "Failed to toggle payment status" })
      }
    }

    // 🔹 BULK PAYMENT STATUS - Set PAID_DONE for multiple participants
    if (action === "bulk-payment-status") {
      try {
        const { participantNumbers, paid } = req.body

        if (!Array.isArray(participantNumbers) || participantNumbers.length === 0) {
          return res.status(400).json({ error: "participantNumbers must be a non-empty array" })
        }
        if (typeof paid !== 'boolean') {
          return res.status(400).json({ error: "paid must be a boolean" })
        }

        const list = participantNumbers.filter((n) => typeof n === 'number')
        if (list.length === 0) {
          return res.status(400).json({ error: "No valid participant numbers provided" })
        }

        console.log(`💳 Bulk updating PAID_DONE=${paid} for ${list.length} participants: [${list.join(', ')}]`)
        const paymentEventId = await getCurrentAdminEventId()

        const { data, error } = await supabase
          .from("participants")
          .update({
            PAID_DONE: paid,
            payment_completed_event_id: paid ? paymentEventId : null,
            ...(paid ? { payment_waived: false, payment_waived_event_id: null } : {}),
          })
          .eq("match_id", STATIC_MATCH_ID)
          .in("assigned_number", list)
          .select("assigned_number")

        if (error) {
          console.error("Error during bulk-payment-status:", error)
          return res.status(500).json({ error: "Failed to bulk update payment status" })
        }

        const updatedCount = Array.isArray(data) ? data.length : 0
        console.log(`✅ Bulk payment status updated for ${updatedCount} participants (requested ${list.length})`)

        return res.status(200).json({
          success: true,
          message: `Updated payment status for ${updatedCount} participant(s)`,
          updatedCount,
          requestedCount: list.length,
          participants: data?.map((d) => d.assigned_number) || []
        })
      } catch (error) {
        console.error("Error in bulk-payment-status:", error)
        return res.status(500).json({ error: "Failed to bulk update payment status" })
      }
    }

    // 🔹 UPDATE GENDER PREFERENCE - Update gender preference for individual participant
    if (action === "update-gender-preference") {
      try {
        const { participantNumber, genderPreference } = req.body
        
        if (typeof participantNumber !== 'number') {
          return res.status(400).json({ error: "Invalid participantNumber" })
        }
        
        // Validate gender preference value
        const validPreferences = ['opposite_gender', 'same_gender', 'any_gender']
        if (!validPreferences.includes(genderPreference)) {
          return res.status(400).json({ error: `Invalid genderPreference. Must be one of: ${validPreferences.join(', ')}` })
        }
        
        console.log(`🔄 Updating gender preference for participant #${participantNumber} to ${genderPreference}`)
        
        // First, get the current participant data
        const { data: currentData, error: fetchError } = await supabase
          .from("participants")
          .select("survey_data, gender, same_gender_preference, any_gender_preference")
          .eq("match_id", STATIC_MATCH_ID)
          .eq("assigned_number", participantNumber)
          .single()
        
        if (fetchError || !currentData) {
          console.error("Error fetching participant:", fetchError)
          return res.status(404).json({ error: "Participant not found" })
        }
        
        // Prepare the updated survey_data: write the selected preference to answers.gender_preference
        const updatedSurveyData = {
          ...currentData.survey_data,
          answers: {
            ...currentData.survey_data?.answers,
            gender_preference: genderPreference
          }
        }
        
        // Calculate the boolean flags based on preference
        const same_gender_preference = genderPreference === 'same_gender'
        const any_gender_preference = genderPreference === 'any_gender'
        
        // Update the participant with new gender preference
        const { data, error } = await supabase
          .from("participants")
          .update({ 
            same_gender_preference,
            any_gender_preference,
            survey_data: updatedSurveyData
          })
          .eq("match_id", STATIC_MATCH_ID)
          .eq("assigned_number", participantNumber)
        
        if (error) {
          console.error("Error updating gender preference:", error)
          return res.status(500).json({ error: "Failed to update gender preference" })
        }
        
        console.log(`✅ Successfully updated gender preference for participant #${participantNumber}`)
        console.log(`   - same_gender_preference: ${same_gender_preference}`)
        console.log(`   - any_gender_preference: ${any_gender_preference}`)
        
        return res.status(200).json({ 
          success: true,
          message: `Updated gender preference for participant #${participantNumber}`,
          participantNumber,
          genderPreference,
          same_gender_preference,
          any_gender_preference
        })
        
      } catch (error) {
        console.error("Error in update-gender-preference:", error)
        return res.status(500).json({ error: "Failed to update gender preference" })
      }
    }

    // 🔹 DEBUG GROUP ELIGIBILITY - Show why paid participants are/aren't eligible for groups
    if (action === "debug-group-eligibility") {
      try {
        const { eventId } = req.body
        
        console.log(`🐛 Debugging group eligibility for event ${eventId}`)
        
        // Get all paid participants
        const { data: paidParticipants, error: paidError } = await supabase
          .from("participants")
          .select("assigned_number, survey_data, name, gender, age")
          .eq("match_id", STATIC_MATCH_ID)
          .eq("PAID_DONE", true)
          .eq("payment_completed_event_id", Number(eventId))
          .neq("assigned_number", 9999)
        
        if (paidError) {
          console.error("Error fetching paid participants:", paidError)
          return res.status(500).json({ error: "Failed to fetch paid participants" })
        }
        
        // Get all individual matches for this event
        const { data: existingMatches, error: matchError } = await supabase
          .from("match_results")
          .select("participant_a_number, participant_b_number")
          .eq("match_id", STATIC_MATCH_ID)
          .eq("event_id", eventId)
          .neq("round", 0) // Exclude group matches
        
        if (matchError) {
          console.error("Error fetching matches:", matchError)
          return res.status(500).json({ error: "Failed to fetch matches" })
        }
        
        const eligible = []
        const not_eligible = []
        
        for (const p of paidParticipants) {
          // Check if matched with organizer
          const matchedWithOrganizer = existingMatches && existingMatches.some(match => 
            (match.participant_a_number === p.assigned_number && match.participant_b_number === 9999) ||
            (match.participant_b_number === p.assigned_number && match.participant_a_number === 9999)
          )
          
          if (matchedWithOrganizer) {
            not_eligible.push({
              participant_number: p.assigned_number,
              name: p.name || p.survey_data?.name || 'No name',
              gender: p.gender || p.survey_data?.gender || 'Unknown',
              age: p.age || p.survey_data?.age || 'Unknown',
              reason: 'Matched with organizer (#9999)'
            })
            continue
          }
          
          // Check if has individual match
          const hasIndividualMatch = existingMatches && existingMatches.some(match => 
            (match.participant_a_number === p.assigned_number || match.participant_b_number === p.assigned_number) &&
            match.participant_a_number !== 9999 && match.participant_b_number !== 9999
          )
          
          if (!hasIndividualMatch) {
            not_eligible.push({
              participant_number: p.assigned_number,
              name: p.name || p.survey_data?.name || 'No name',
              gender: p.gender || p.survey_data?.gender || 'Unknown',
              age: p.age || p.survey_data?.age || 'Unknown',
              reason: 'No individual match found'
            })
            continue
          }
          
          // Find who they're matched with
          const match = existingMatches.find(m => 
            m.participant_a_number === p.assigned_number || m.participant_b_number === p.assigned_number
          )
          const matched_with = match 
            ? (match.participant_a_number === p.assigned_number ? match.participant_b_number : match.participant_a_number)
            : 'Unknown'
          
          // Eligible!
          eligible.push({
            participant_number: p.assigned_number,
            name: p.name || p.survey_data?.name || 'No name',
            gender: p.gender || p.survey_data?.gender || 'Unknown',
            age: p.age || p.survey_data?.age || 'Unknown',
            matched_with
          })
        }
        
        console.log(`✅ Debug complete: ${eligible.length} eligible, ${not_eligible.length} not eligible out of ${paidParticipants.length} paid`)
        
        return res.status(200).json({
          success: true,
          total_paid: paidParticipants.length,
          eligible,
          not_eligible
        })
        
      } catch (error) {
        console.error("Error in debug-group-eligibility:", error)
        return res.status(500).json({ error: "Failed to debug group eligibility" })
      }
    }

    // 🔹 DELTA CACHE: Get last cache timestamp for event
    if (action === "get-last-cache-timestamp") {
      try {
        const { event_id } = req.body
        console.log(`Getting last cache timestamp for event_id: ${event_id}`)
        
        const { data, error } = await supabase
          .rpc('get_last_precache_timestamp', { p_event_id: event_id })
        
        if (error) {
          console.error("Error getting last cache timestamp:", error)
          return res.status(500).json({ error: error.message })
        }
        
        return res.status(200).json({
          success: true,
          event_id,
          last_cache_timestamp: data || '1970-01-01T00:00:00Z'
        })
      } catch (error) {
        console.error("Error in get-last-cache-timestamp:", error)
        return res.status(500).json({ error: "Failed to get last cache timestamp" })
      }
    }

    // 🔹 DELTA CACHE: Get participants needing recache
    if (action === "get-participants-needing-cache") {
      try {
        const { event_id, last_cache_timestamp } = req.body
        console.log(`Getting participants needing cache for event_id: ${event_id}`)
        
        // Build query to find participants updated after last cache timestamp
        let query = supabase
          .from("participants")
          .select("assigned_number, survey_data_updated_at, name, gender, age")
          .eq("match_id", STATIC_MATCH_ID)
          .neq("assigned_number", 9999)
          .not("survey_data", "is", null)
        
        // Filter by event eligibility
        query = query.or(`signup_for_next_event.eq.true,event_id.eq.${event_id},auto_signup_next_event.eq.true`)
        
        // If last_cache_timestamp provided, filter for updates after that time
        if (last_cache_timestamp && last_cache_timestamp !== '1970-01-01T00:00:00Z') {
          query = query.or(`survey_data_updated_at.is.null,survey_data_updated_at.gt.${last_cache_timestamp}`)
        }
        
        const { data, error } = await query.order('survey_data_updated_at', { ascending: false, nullsFirst: false })
        
        if (error) {
          console.error("Error getting participants needing cache:", error)
          return res.status(500).json({ error: error.message })
        }
        
        console.log(`Found ${data?.length || 0} participants needing cache`)
        
        return res.status(200).json({
          success: true,
          event_id,
          last_cache_timestamp,
          participants: data || [],
          count: data?.length || 0
        })
      } catch (error) {
        console.error("Error in get-participants-needing-cache:", error)
        return res.status(500).json({ error: "Failed to get participants needing cache" })
      }
    }

    // 🔹 DELTA CACHE: Record cache session
    if (action === "record-cache-session") {
      try {
        const { 
          event_id, 
          participants_cached, 
          pairs_cached, 
          duration_ms, 
          ai_calls, 
          cache_hit_rate, 
          notes 
        } = req.body
        
        console.log(`Recording cache session for event_id: ${event_id}`)
        
        const { data, error } = await supabase
          .rpc('record_cache_session', {
            p_event_id: event_id,
            p_participants_cached: participants_cached || 0,
            p_pairs_cached: pairs_cached || 0,
            p_duration_ms: duration_ms,
            p_ai_calls: ai_calls || 0,
            p_cache_hit_rate: cache_hit_rate,
            p_notes: notes
          })
        
        if (error) {
          console.error("Error recording cache session:", error)
          return res.status(500).json({ error: error.message })
        }
        
        console.log(`✅ Cache session recorded with ID: ${data}`)
        
        return res.status(200).json({
          success: true,
          session_id: data,
          message: `Cache session recorded: ${participants_cached} participants, ${pairs_cached} pairs cached`
        })
      } catch (error) {
        console.error("Error in record-cache-session:", error)
        return res.status(500).json({ error: "Failed to record cache session" })
      }
    }

    // 🔹 DELTA CACHE: Get cache freshness status
    if (action === "get-cache-freshness") {
      try {
        const { event_id } = req.body
        console.log(`Getting cache freshness for event_id: ${event_id}`)
        
        const { data, error } = await supabase
          .from("v_cache_freshness")
          .select("*")
          .eq("event_id", event_id)
          .single()
        
        if (error && error.code !== 'PGRST116') {
          console.error("Error getting cache freshness:", error)
          return res.status(500).json({ error: error.message })
        }
        
        if (!data) {
          // No cache metadata exists yet for this event
          return res.status(200).json({
            success: true,
            event_id,
            cache_status: 'NEVER_CACHED',
            participants_needing_recache: null,
            total_participants_in_event: null,
            last_cache_time: null,
            hours_since_cache: null
          })
        }
        
        return res.status(200).json({
          success: true,
          ...data
        })
      } catch (error) {
        console.error("Error in get-cache-freshness:", error)
        return res.status(500).json({ error: "Failed to get cache freshness" })
      }
    }

    // 🔹 DELTA CACHE: Get cache history for event
    if (action === "get-cache-history") {
      try {
        const { event_id, limit = 10 } = req.body
        console.log(`Getting cache history for event_id: ${event_id}`)
        
        const { data, error } = await supabase
          .from("cache_metadata")
          .select("*")
          .eq("event_id", event_id)
          .order("last_precache_timestamp", { ascending: false })
          .limit(limit)
        
        if (error) {
          console.error("Error getting cache history:", error)
          return res.status(500).json({ error: error.message })
        }
        
        return res.status(200).json({
          success: true,
          event_id,
          sessions: data || [],
          count: data?.length || 0
        })
      } catch (error) {
        console.error("Error in get-cache-history:", error)
        return res.status(500).json({ error: "Failed to get cache history" })
      }
    }

    // 🔹 DELTA CACHE: Invalidate stale cache entries
    if (action === "invalidate-stale-cache") {
      try {
        const { participant_number } = req.body
        console.log(`Invalidating stale cache for participant #${participant_number}`)
        
        // Get participant's current survey_data_updated_at
        const { data: participant, error: pError } = await supabase
          .from("participants")
          .select("survey_data_updated_at")
          .eq("assigned_number", participant_number)
          .eq("match_id", STATIC_MATCH_ID)
          .single()
        
        if (pError) {
          console.error("Error fetching participant:", pError)
          return res.status(500).json({ error: pError.message })
        }
        
        if (!participant?.survey_data_updated_at) {
          return res.status(400).json({ error: "Participant has no survey_data_updated_at timestamp" })
        }
        
        // Delete cache entries where this participant's cached timestamp is older than current
        const { error: deleteError, count } = await supabase
          .from("compatibility_cache")
          .delete()
          .or(`and(participant_a_number.eq.${participant_number},participant_a_cached_at.lt.${participant.survey_data_updated_at}),and(participant_b_number.eq.${participant_number},participant_b_cached_at.lt.${participant.survey_data_updated_at})`)
        
        if (deleteError) {
          console.error("Error invalidating cache:", deleteError)
          return res.status(500).json({ error: deleteError.message })
        }
        
        console.log(`✅ Invalidated ${count || 0} stale cache entries for participant #${participant_number}`)
        
        return res.status(200).json({
          success: true,
          participant_number,
          invalidated_entries: count || 0
        })
      } catch (error) {
        console.error("Error in invalidate-stale-cache:", error)
        return res.status(500).json({ error: "Failed to invalidate stale cache" })
      }
    }

    // 🔹 GET PARTICIPANT BONUS DATA - Check humor and openness matching for specific participants
    if (action === "get-participant-bonus-data") {
      try {
        const { participantA, participantB } = req.body
        console.log(`Getting bonus data for participants #${participantA} and #${participantB}`)
        
        // Fetch both participants' survey data
        const { data: participants, error: pError } = await supabase
          .from("participants")
          .select("assigned_number, survey_data, humor_banter_style, early_openness_comfort")
          .eq("match_id", STATIC_MATCH_ID)
          .in("assigned_number", [participantA, participantB])
        
        if (pError) {
          console.error("Error fetching participants:", pError)
          return res.status(500).json({ error: pError.message })
        }
        
        if (!participants || participants.length !== 2) {
          return res.status(400).json({ error: "Could not find both participants" })
        }
        
        const pA = participants.find(p => p.assigned_number === participantA)
        const pB = participants.find(p => p.assigned_number === participantB)
        
        // Extract humor/banter style from different possible locations
        const humorA = pA.humor_banter_style || 
                       pA.survey_data?.humor_banter_style ||
                       pA.survey_data?.answers?.humor_banter_style
                       
        const humorB = pB.humor_banter_style || 
                       pB.survey_data?.humor_banter_style ||
                       pB.survey_data?.answers?.humor_banter_style

        // Extract early openness comfort from different possible locations
        const opennessA = pA.early_openness_comfort !== undefined ? 
                          pA.early_openness_comfort : 
                          pA.survey_data?.answers?.early_openness_comfort
                          
        const opennessB = pB.early_openness_comfort !== undefined ? 
                          pB.early_openness_comfort : 
                          pB.survey_data?.answers?.early_openness_comfort

        // Check if humor styles match
        const humorMatch = humorA && humorB && humorA === humorB
        
        // Check if openness levels match
        const opennessMatch = opennessA !== undefined && 
                              opennessB !== undefined && 
                              parseInt(opennessA) === parseInt(opennessB)

        console.log(`Bonus data for #${participantA} & #${participantB}: humor=${humorMatch}, openness=${opennessMatch}`)
        
        return res.status(200).json({
          success: true,
          participantA,
          participantB,
          humorMatch,
          opennessMatch,
          humorValues: { A: humorA, B: humorB },
          opennessValues: { A: opennessA, B: opennessB }
        })
      } catch (error) {
        console.error("Error in get-participant-bonus-data:", error)
        return res.status(500).json({ error: "Failed to get participant bonus data" })
      }
    }

    // ── Deep Personality Analysis (GPT-powered) ────────────────────────────────
    if (action === "deep-personality-analysis") {
      try {
        const { participantNumber } = req.body
        if (!participantNumber) return res.status(400).json({ error: "Missing participantNumber" })

        const { data: participant, error: pErr } = await supabase
          .from("participants")
          .select("assigned_number, name, gender, age, nationality, mbti_personality_type, attachment_style, communication_style, same_gender_preference, any_gender_preference, preferred_age_min, preferred_age_max, open_age_preference, prefer_same_nationality, survey_data, PAID_DONE, payment_completed_event_id, event_id")
          .eq("match_id", STATIC_MATCH_ID)
          .eq("assigned_number", participantNumber)
          .single()

        if (pErr || !participant) return res.status(404).json({ error: "Participant not found" })

        const sd = typeof participant.survey_data === "string" ? JSON.parse(participant.survey_data || "{}") : (participant.survey_data || {})
        const answers = sd.answers || sd

        // Build comprehensive profile for GPT
        const profile = {
          basic: {
            number: participant.assigned_number,
            name: participant.name || answers.name || "Unknown",
            gender: participant.gender || answers.gender || "Unknown",
            age: participant.age || answers.age || "Unknown",
            nationality: participant.nationality || answers.nationality || "Unknown",
          },
          personality: {
            mbti: participant.mbti_personality_type || answers.mbtiType || "Unknown",
            attachment: participant.attachment_style || answers.attachmentStyle || "Unknown",
            communication: participant.communication_style || answers.communicationStyle || "Unknown",
          },
          preferences: {
            same_gender: participant.same_gender_preference,
            any_gender: participant.any_gender_preference,
            age_min: participant.preferred_age_min,
            age_max: participant.preferred_age_max,
            open_age: participant.open_age_preference,
            prefer_same_nationality: participant.prefer_same_nationality,
          },
          vibe: {
            weekend: answers.vibe_1 || "",
            hobbies: answers.vibe_2 || "",
            music: answers.vibe_3 || "",
            deepTalk: answers.vibe_4 || "",
            friendsDescribeMe: answers.vibe_5 || "",
            iDescribeFriends: answers.vibe_6 || "",
          },
          surveyAnswers: Object.fromEntries(
            Object.entries(answers).filter(([k]) => k.startsWith("q") || k.startsWith("vibe") || ["name","gender","age","nationality","redLines","relationshipGoals","dealBreakers"].includes(k))
          ),
          meta: {
            paid: participant.PAID_DONE === true && Number(participant.payment_completed_event_id) === Number(await getCurrentAdminEventId()),
            event_id: participant.event_id,
          }
        }

        const systemMessage = `You are an expert psychologist and behavioral analyst specializing in personality assessment, social dynamics, and event participant evaluation. You have deep knowledge of MBTI, attachment theory, communication styles, and social psychology.

You understand Saudi/Arabic cultural context deeply — including dating norms, social expectations in Riyadh, and cultural nuances in personality expression.

Your analysis must be:
1. Thorough and evidence-based (cite specific survey answers as evidence)
2. Balanced — note both strengths and potential concerns
3. Practical and actionable for event organizers
4. Culturally sensitive but honest
5. Structured with clear sections

Format your response as a JSON object with these exact keys:
{
  "personalityOverview": "2-3 sentence summary of their personality",
  "mbtiAnalysis": "Detailed MBTI analysis — what their type means in practice, cognitive functions, how it manifests socially",
  "attachmentAnalysis": "Attachment style deep dive — how they form connections, relationship patterns, intimacy style",
  "communicationStyle": "How they communicate — conflict style, expression, listening patterns",
  "socialDynamics": "How they behave in social settings — group vs 1:1, energy, role they play",
  "predictedBehavior": "Predicted behavior during the event — engagement level, likely actions, social patterns",
  "goodPersonLikelihood": "Assessment of character — kindness, integrity, respect for others (High/Medium/Low + reasoning)",
  "goodParticipantLikelihood": "Assessment as event participant — engagement, follow-through, positivity (High/Medium/Low + reasoning)",
  "potentialConcerns": "Any red flags, biases, personality disorders indicators, or behavioral risks",
  "biasesAndTendencies": "Cognitive biases, decision patterns, emotional tendencies",
  "strengths": "Key positive traits and strengths they bring",
  "growthAreas": "Areas for personal growth or development",
  "matchingInsights": "What type of partner would complement them best and why",
  "overallRecommendation": "Final recommendation for organizers — 2-3 sentences",
  "riskLevel": "low/medium/high",
  "confidenceScore": 0-100 (how confident you are in this analysis based on data completeness)
}`

        const userMessage = `Analyze this participant thoroughly based on their complete survey data:

${JSON.stringify(profile, null, 2)}

Provide a comprehensive, honest, and insightful analysis. Be direct about any concerns. Use specific evidence from their answers. Consider cultural context (Saudi/Riyadh).`

        console.log(`🧠 Generating deep personality analysis for participant #${participantNumber}...`)

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: userMessage }
          ],
          max_completion_tokens: 3000,
          temperature: 0.7,
        })

        const rawAnalysis = completion.choices[0]?.message?.content?.trim()
        if (!rawAnalysis) throw new Error("AI generated empty analysis")

        // Strip markdown code fences if present (```json ... ```)
        const cleaned = rawAnalysis.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim()

        let parsed
        try {
          parsed = JSON.parse(cleaned)
        } catch {
          parsed = { rawText: rawAnalysis }
        }

        return res.status(200).json({
          success: true,
          analysis: parsed,
          participantName: profile.basic.name,
          participantNumber: participant.assigned_number,
        })
      } catch (error) {
        console.error("Error in deep-personality-analysis:", error)
        return res.status(500).json({ error: "Failed to generate analysis", details: error.message })
      }
    }

    // Co-host login is the only Event 3 action that accepts the co-host password.
    // The returned short-lived signed token is limited to the explicit action
    // allow-list below; it can never invoke matching, phase, survey, or payment APIs.
    if (action === "e3-cohost-login") {
      if (!EVENT3_COHOST_PASSWORD || !cohostTokenSecret() || !safeSecretEqual(req.body?.password, EVENT3_COHOST_PASSWORD)) {
        return res.status(403).json({ error: "Unauthorized" })
      }
      return res.status(200).json({
        token: signCohostToken(),
        expires_in: EVENT3_COHOST_TOKEN_TTL_SECONDS,
      })
    }

    // ── Event 4.0 admin/co-host actions ────────────────────────────────────────
    if (action && action.startsWith("e3-")) {
      const isCohostAction = EVENT3_COHOST_ACTIONS.has(action)
      const hasCohostAccess = isCohostAction && verifyCohostToken(bearerToken || req.body?.cohost_token)
      const hasAdminAccess = Boolean(req.adminAuth)
      if (!hasAdminAccess && !hasCohostAccess) return res.status(403).json({ error: "Unauthorized" })
      try {
        // Helper: fetch current event_id from event_state — prefer STATIC_MATCH_ID (main admin)
        // so event3 stays in sync with the main event system, fall back to EVENT3_MATCH_ID
        const getE3CurrentEventId = async () => {
          const { data: mainSr } = await supabase.from("event_state").select("current_event_id").eq("match_id", STATIC_MATCH_ID).single()
          if (mainSr?.current_event_id) return mainSr.current_event_id
          const { data: sr } = await supabase.from("event_state").select("current_event_id").eq("match_id", EVENT3_MATCH_ID).single()
          return sr?.current_event_id || 20
        }
        const realEventId = await getE3CurrentEventId()
        const currentEventId = (req.body.preview_event_id && typeof req.body.preview_event_id === "number") ? req.body.preview_event_id : realEventId

        if (action === "e3-cohost-dashboard") {
          const [{ data: stateRow, error: stateError }, { data: eventParticipants, error: eventParticipantsError }] = await Promise.all([
            supabase.from("event_state").select("phase,global_timer_active,global_timer_start_time,global_timer_duration,global_timer_round").eq("match_id", EVENT3_MATCH_ID).maybeSingle(),
            supabase.from("event3_participants").select("participant_number,position").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).order("position", { ascending: true }),
          ])
          if (stateError) return res.status(500).json({ error: stateError.message })
          if (eventParticipantsError) return res.status(500).json({ error: eventParticipantsError.message })

          const numbers = (eventParticipants || []).map(row => row.participant_number)
          if (numbers.length === 0) {
            return res.status(200).json({
              event_id: currentEventId,
              state: stateRow || { phase: "setup", global_timer_active: false },
              participants: [],
              sos_requests: [],
            })
          }

          const [participantResult, assignmentResult, matchResult, rankingResult, attendanceResult, historyResult, legacyHistoryResult, sosResult] = await Promise.all([
            supabase.from("participants").select("assigned_number,name,age").eq("match_id", STATIC_MATCH_ID).in("assigned_number", numbers),
            supabase.from("session_assignments").select("participant_id,round,table_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).in("round", [1, 2, 20, 30]).in("participant_id", numbers),
            supabase.from("event3_matches").select("participant_number,phase2_partner,phase3_partner").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).in("participant_number", numbers),
            supabase.from("participant_rankings").select("ranker_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).in("ranker_number", numbers),
            supabase.from("event_attendance").select("participant_number,attended").eq("match_id", STATIC_MATCH_ID).eq("event_id", currentEventId).in("participant_number", numbers),
            supabase.from("event_attendance").select("participant_number,event_id,attended").eq("match_id", STATIC_MATCH_ID).neq("event_id", currentEventId).in("participant_number", numbers),
            supabase.from("event3_participants").select("participant_number,event_id").eq("match_id", EVENT3_MATCH_ID).neq("event_id", currentEventId).in("participant_number", numbers),
            supabase.from("organizer_requests").select("id,event_id,participant_number,participant_name,table_info,message,organizer_reply,status,request_type,created_at,updated_at").or(`event_id.eq.${currentEventId},event_id.is.null`).neq("status", "resolved").order("updated_at", { ascending: false }).limit(100),
          ])
          const firstError = [participantResult, assignmentResult, matchResult, rankingResult, attendanceResult, historyResult, legacyHistoryResult, sosResult].find(result => result.error)?.error
          if (firstError) return res.status(500).json({ error: firstError.message })

          const infoMap = new Map((participantResult.data || []).map(participant => [participant.assigned_number, participant]))
          const tableMap = {}
          for (const assignment of assignmentResult.data || []) {
            if (!tableMap[assignment.participant_id]) tableMap[assignment.participant_id] = {}
            tableMap[assignment.participant_id][assignment.round] = assignment.table_number
          }
          const matchMap = new Map((matchResult.data || []).map(match => [match.participant_number, match]))
          const rankingSubmitted = new Set((rankingResult.data || []).map(row => row.ranker_number))
          const attendanceMap = new Map((attendanceResult.data || []).map(row => [row.participant_number, !!row.attended]))
          const priorEventSets = {}
          const knownAttendanceKeys = new Set()
          for (const row of historyResult.data || []) {
            const key = `${row.participant_number}:${row.event_id}`
            knownAttendanceKeys.add(key)
            if (!row.attended) continue
            if (!priorEventSets[row.participant_number]) priorEventSets[row.participant_number] = new Set()
            priorEventSets[row.participant_number].add(row.event_id)
          }
          for (const row of legacyHistoryResult.data || []) {
            if (knownAttendanceKeys.has(`${row.participant_number}:${row.event_id}`)) continue
            if (!priorEventSets[row.participant_number]) priorEventSets[row.participant_number] = new Set()
            priorEventSets[row.participant_number].add(row.event_id)
          }

          const participants = numbers.map(number => {
            const info = infoMap.get(number) || {}
            const matches = matchMap.get(number) || {}
            const previousEventCount = priorEventSets[number]?.size || 0
            return {
              number,
              name: info.name || `#${number}`,
              age: info.age || null,
              attended: attendanceMap.get(number) || false,
              previous_event_count: previousEventCount,
              first_time: previousEventCount === 0,
              ranking_submitted: rankingSubmitted.has(number),
              tables: tableMap[number] || {},
              phase2_partner: matches.phase2_partner || null,
              phase3_partner: matches.phase3_partner || null,
            }
          })
          const numberSet = new Set(numbers)
          const sosRequests = (sosResult.data || []).filter(request => numberSet.has(request.participant_number))
          return res.status(200).json({ event_id: currentEventId, state: stateRow || { phase: "setup", global_timer_active: false }, participants, sos_requests: sosRequests })
        }

        if (action === "e3-cohost-set-attendance") {
          const participantNumber = Number(req.body?.participant_number)
          if (!Number.isInteger(participantNumber) || participantNumber <= 0 || participantNumber === 9999) {
            return res.status(400).json({ error: "Invalid participant_number" })
          }
          const { data: enrolled, error: enrolledError } = await supabase.from("event3_participants").select("id").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", participantNumber).maybeSingle()
          if (enrolledError) return res.status(500).json({ error: enrolledError.message })
          if (!enrolled) return res.status(404).json({ error: "Participant is not enrolled in the current event" })
          const { data, error } = await supabase.from("event_attendance").upsert({
            match_id: STATIC_MATCH_ID,
            event_id: currentEventId,
            participant_number: participantNumber,
            attended: !!req.body?.attended,
            updated_at: new Date().toISOString(),
            updated_by: "event3-cohost",
          }, { onConflict: "match_id,event_id,participant_number" }).select("participant_number,attended").single()
          if (error) return res.status(500).json({ error: error.message })
          return res.status(200).json({ success: true, participant_number: data.participant_number, attended: data.attended })
        }

        if (action === "e3-cohost-resolve-sos" || action === "e3-cohost-reply-sos") {
          const id = String(req.body?.id || "")
          if (!id) return res.status(400).json({ error: "id required" })
          const { data: requestRow, error: requestError } = await supabase.from("organizer_requests").select("id,event_id,participant_number,chat_history").eq("id", id).maybeSingle()
          if (requestError) return res.status(500).json({ error: requestError.message })
          if (!requestRow) return res.status(404).json({ error: "Request not found" })
          if (requestRow.event_id != null && Number(requestRow.event_id) !== Number(currentEventId)) {
            return res.status(403).json({ error: "Request is outside the current event" })
          }
          const { data: enrolled } = await supabase.from("event3_participants").select("id").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", requestRow.participant_number).maybeSingle()
          if (!enrolled) return res.status(403).json({ error: "Request is outside the current event" })

          if (action === "e3-cohost-resolve-sos") {
            const { error } = await supabase.from("organizer_requests").update({ status: "resolved", updated_at: new Date().toISOString() }).eq("id", id)
            if (error) return res.status(500).json({ error: error.message })
            return res.status(200).json({ success: true })
          }

          const reply = String(req.body?.reply || "").trim().slice(0, 1000)
          if (!reply) return res.status(400).json({ error: "reply required" })
          const now = new Date().toISOString()
          const chatHistory = Array.isArray(requestRow.chat_history) ? requestRow.chat_history : []
          const { error } = await supabase.from("organizer_requests").update({
            organizer_reply: reply,
            status: "replied",
            chat_history: [...chatHistory, { from: "organizer", text: reply, timestamp: now }],
            updated_at: now,
          }).eq("id", id)
          if (error) return res.status(500).json({ error: error.message })
          return res.status(200).json({ success: true })
        }

        // e3-set-current-event — switch to a different event (e.g. 20 → 21)
        if (action === "e3-set-current-event") {
          const { event_id } = req.body
          if (!event_id || typeof event_id !== "number") return res.status(400).json({ error: "event_id (number) required" })
          const { data: activeTestState, error: activeTestStateError } = await supabase
            .from("event_state")
            .select("test_mode_active")
            .eq("match_id", EVENT3_MATCH_ID)
            .maybeSingle()
          if (activeTestStateError) return res.status(500).json({ error: activeTestStateError.message })
          if (activeTestState?.test_mode_active === true) {
            return res.status(409).json({ error: "End Event3 test mode before switching events", test_mode: true })
          }
          // Save current event_id and reset phase/timer for the new event
          const { error } = await supabase.from("event_state").update({
            current_event_id: event_id,
            phase: "setup",
            global_timer_active: false,
            global_timer_start_time: null,
            global_timer_duration: null,
            global_timer_round: null,
            phase2_score_revealed: false,
            phase3_score_revealed: false,
          }).eq("match_id", EVENT3_MATCH_ID)
          if (error) return res.status(500).json({ error: error.message })
          // Also sync STATIC_MATCH_ID so main admin and event3 share the same current event
          await supabase.from("event_state").update({ current_event_id: event_id }).eq("match_id", STATIC_MATCH_ID)
          return res.status(200).json({ message: `Switched to event ${event_id}`, current_event_id: event_id })
        }

        // e3-get-current-event — get the current event_id
        if (action === "e3-get-current-event") {
          return res.status(200).json({ current_event_id: realEventId })
        }

        // e3-get-event-list — list all event_ids that have data
        if (action === "e3-get-event-list") {
          const { data: epEvents, error: epErr } = await supabase.from("event3_participants").select("event_id").eq("match_id", EVENT3_MATCH_ID)
          const { data: matchEvents, error: matchErr } = await supabase.from("event3_matches").select("event_id").eq("match_id", EVENT3_MATCH_ID)
          if (epErr) console.error("[e3-get-event-list] event3_participants error:", epErr.message)
          if (matchErr) console.error("[e3-get-event-list] event3_matches error:", matchErr.message)
          const eventIds = new Set()
          for (const r of epEvents || []) if (r.event_id) eventIds.add(r.event_id)
          for (const r of matchEvents || []) if (r.event_id) eventIds.add(r.event_id)
          eventIds.add(realEventId) // always include current
          const sorted = Array.from(eventIds).sort((a, b) => b - a)
          return res.status(200).json({ events: sorted, current_event_id: realEventId, errors: { participants: epErr?.message || null, matches: matchErr?.message || null } })
        }

        // e3-run-diagnostics — pre-event smoke test
        if (action === "e3-run-diagnostics") {
          const checks = []
          let healthy = true

          // 1. Participant selection
          const { data: ep, error: epErr } = await supabase.from("event3_participants").select("participant_number,position").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).order("position", { ascending: true })
          const selectedNumbers = (ep || []).map(r => r.participant_number)
          if (epErr || selectedNumbers.length < 4) {
            checks.push({ name: "participant_selection", status: "fail", message: epErr?.message || `Only ${selectedNumbers.length} participants selected (need at least 4)` })
            healthy = false
          } else {
            checks.push({ name: "participant_selection", status: "ok", message: `${selectedNumbers.length} participants selected` })
          }

          // 2. Survey data completeness
          const missingSurvey = []
          if (selectedNumbers.length > 0) {
            const { data: pdata } = await supabase.from("participants").select("assigned_number,survey_data").eq("match_id", STATIC_MATCH_ID).in("assigned_number", selectedNumbers)
            const pMap = new Map((pdata || []).map(p => [p.assigned_number, p]))
            for (const num of selectedNumbers) {
              const p = pMap.get(num)
              const sd = typeof p?.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p?.survey_data || {})
              if (!sd.answers || Object.keys(sd.answers).length === 0) missingSurvey.push(num)
            }
          }
          if (missingSurvey.length > 0) {
            checks.push({ name: "survey_data", status: "warn", message: `${missingSurvey.length} participants missing survey data: #${missingSurvey.join(", #")}` })
          } else {
            checks.push({ name: "survey_data", status: "ok", message: "All selected participants have survey data" })
          }

          // 3. Required columns in event3_matches
          const requiredCols = ["participant_number", "phase2_partner", "phase2_score", "phase3_partner", "phase3_score", "phase2_word", "phase3_word", "phase2_feedback", "phase3_feedback", "match_preference"]
          const { data: sampleMatch, error: sampleErr } = await supabase.from("event3_matches").select(requiredCols.join(",")).eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).limit(1)
          if (sampleErr) {
            checks.push({ name: "event3_matches_schema", status: "fail", message: sampleErr.message })
            healthy = false
          } else {
            checks.push({ name: "event3_matches_schema", status: "ok", message: `Required columns present in event3_matches` })
          }

          // 4. Seating coverage (rounds 1 and 2)
          if (selectedNumbers.length > 0) {
            const { data: saRows } = await supabase.from("session_assignments").select("round,participant_id").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).in("round", [1, 2])
            const roundAssigned = { 1: new Set(), 2: new Set() }
            for (const r of (saRows || [])) { if (roundAssigned[r.round]) roundAssigned[r.round].add(r.participant_id) }
            for (const round of [1, 2]) {
              const missing = selectedNumbers.filter(n => !roundAssigned[round].has(n))
              if (missing.length > 0) {
                checks.push({ name: `seating_round_${round}`, status: "fail", message: `${missing.length} participants missing from round ${round} seating: #${missing.join(", #")}` })
                healthy = false
              } else {
                checks.push({ name: `seating_round_${round}`, status: "ok", message: `Round ${round} seating covers all selected participants` })
              }
            }
          }

          // 5. Locked matches consistency
          const { data: lockedMatches, error: lockedErr } = await supabase.from("locked_matches").select("participant1_number,participant2_number").eq("match_id", STATIC_MATCH_ID).eq("event_id", currentEventId)
          if (lockedErr) {
            checks.push({ name: "locked_matches", status: "warn", message: lockedErr.message })
          } else {
            const selectedSet = new Set(selectedNumbers)
            const badLocked = (lockedMatches || []).filter(l => !selectedSet.has(l.participant1_number) || !selectedSet.has(l.participant2_number))
            if (badLocked.length > 0) {
              checks.push({ name: "locked_matches", status: "warn", message: `${badLocked.length} locked matches involve non-selected participants` })
            } else {
              checks.push({ name: "locked_matches", status: "ok", message: `${lockedMatches?.length || 0} locked matches are valid` })
            }
          }

          // 6. Multi-event runtime schema required by returning attendees and co-host SOS.
          const [{ error: rankingSchemaError }, { error: sosSchemaError }] = await Promise.all([
            supabase.from("participant_rankings").select("event_id").limit(1),
            supabase.from("organizer_requests").select("event_id").limit(1),
          ])
          if (rankingSchemaError || sosSchemaError) {
            checks.push({ name: "event_runtime_schema", status: "fail", message: rankingSchemaError?.message || sosSchemaError?.message })
            healthy = false
          } else {
            checks.push({ name: "event_runtime_schema", status: "ok", message: "Ranking and organizer-request event scope is available" })
          }

          // 7. If one-to-one matches already exist, confirm every reciprocal
          // pair shares one table and no one-to-one table contains extra people.
          const [{ data: diagnosticMatches, error: diagnosticMatchesError }, { data: diagnosticAssignments, error: diagnosticAssignmentsError }] = await Promise.all([
            supabase.from("event3_matches").select("participant_number,phase2_partner,phase3_partner").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId),
            supabase.from("session_assignments").select("participant_id,round,table_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).in("round", [20, 30]),
          ])
          if (diagnosticMatchesError || diagnosticAssignmentsError) {
            checks.push({ name: "one_to_one_tables", status: "fail", message: diagnosticMatchesError?.message || diagnosticAssignmentsError?.message })
            healthy = false
          } else {
            const matchesByNumber = new Map((diagnosticMatches || []).map(row => [row.participant_number, row]))
            for (const { phase, round } of [{ phase: "phase2", round: 20 }, { phase: "phase3", round: 30 }]) {
              const partnerField = `${phase}_partner`
              const matchedRows = (diagnosticMatches || []).filter(row => row[partnerField])
              if (matchedRows.length === 0) {
                checks.push({ name: `${phase}_tables`, status: "ok", message: `${phase} matches have not been created yet` })
                continue
              }
              const assignments = (diagnosticAssignments || []).filter(row => row.round === round)
              const assignmentByParticipant = new Map(assignments.map(row => [row.participant_id, row.table_number]))
              const tableCounts = {}
              for (const assignment of assignments) tableCounts[assignment.table_number] = (tableCounts[assignment.table_number] || 0) + 1
              const problems = []
              for (const row of matchedRows) {
                const partner = row[partnerField]
                const reciprocal = matchesByNumber.get(partner)?.[partnerField] === row.participant_number
                const myTable = assignmentByParticipant.get(row.participant_number)
                const partnerTable = assignmentByParticipant.get(partner)
                if (!reciprocal || !myTable || myTable !== partnerTable || tableCounts[myTable] !== 2) problems.push(row.participant_number)
              }
              if (problems.length > 0) {
                checks.push({ name: `${phase}_tables`, status: "fail", message: `${new Set(problems).size} participants have missing, non-reciprocal, or shared one-to-one tables` })
                healthy = false
              } else {
                checks.push({ name: `${phase}_tables`, status: "ok", message: `${matchedRows.length / 2} reciprocal pairs have valid two-person tables` })
              }
            }
          }

          return res.status(200).json({ healthy, checks })
        }

        // e3-get-exclusions
        if (action === "e3-get-exclusions") {
          const { data, error } = await supabase.from("event3_exclusions").select("id,participant_a_number,participant_b_number,reason,created_at").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).order("created_at", { ascending: false })
          if (error) return res.status(500).json({ error: error.message })
          return res.status(200).json({ exclusions: data || [] })
        }
        // e3-add-exclusion
        if (action === "e3-add-exclusion") {
          const { participant_a_number, participant_b_number, reason } = req.body
          if (!participant_a_number || !participant_b_number || participant_a_number === participant_b_number) return res.status(400).json({ error: "Invalid participant pair" })
          const [a, b] = [parseInt(participant_a_number), parseInt(participant_b_number)].sort((x, y) => x - y)
          const { error } = await supabase.from("event3_exclusions").insert({ match_id: EVENT3_MATCH_ID, event_id: currentEventId, participant_a_number: a, participant_b_number: b, reason: reason || "" })
          if (error) return res.status(500).json({ error: error.message })
          return res.status(200).json({ message: "Exclusion added" })
        }
        // e3-remove-exclusion
        if (action === "e3-remove-exclusion") {
          const { id } = req.body
          if (!id) return res.status(400).json({ error: "id required" })
          const { error } = await supabase.from("event3_exclusions").delete().eq("id", id).eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          if (error) return res.status(500).json({ error: error.message })
          return res.status(200).json({ message: "Exclusion removed" })
        }

        // e3-generate-report — post-event summary
        if (action === "e3-generate-report") {
          const { data: ep } = await supabase.from("event3_participants").select("participant_number,position").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).order("position", { ascending: true })
          const selected = (ep || []).map(r => r.participant_number)

          const { data: matches } = await supabase.from("event3_matches").select("participant_number,phase2_partner,phase2_score,phase3_partner,phase3_score,phase2_word,phase3_word,phase2_feedback,phase3_feedback,match_preference").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).in("participant_number", selected)
          const matchMap = new Map((matches || []).map(m => [m.participant_number, m]))

          const { data: pdata } = await supabase.from("participants").select("assigned_number,name,survey_data").eq("match_id", STATIC_MATCH_ID).in("assigned_number", selected)
          const nameMap = {}
          for (const p of pdata || []) {
            const sd = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {})
            nameMap[p.assigned_number] = p.name || sd?.answers?.name || sd?.name || `#${p.assigned_number}`
          }

          // Match summary
          const phase2Matches = new Map()
          const phase3Matches = new Map()
          const mutualChoicePairs = []
          for (const m of (matches || [])) {
            const num = m.participant_number
            if (m.phase2_partner && !phase2Matches.has(num) && !phase2Matches.has(m.phase2_partner)) {
              phase2Matches.set(num, m.phase2_partner)
              phase2Matches.set(m.phase2_partner, num)
            }
            if (m.phase3_partner && !phase3Matches.has(num) && !phase3Matches.has(m.phase3_partner)) {
              phase3Matches.set(num, m.phase3_partner)
              phase3Matches.set(m.phase3_partner, num)
            }
          }
          // Detect mutual choices (same partner in both phases)
          for (const [num, p2] of phase2Matches) {
            if (phase3Matches.get(num) === p2) {
              const key = [num, p2].sort((a, b) => a - b).join("-")
              if (!mutualChoicePairs.some(x => x.key === key)) {
                const m = matchMap.get(num)
                mutualChoicePairs.push({ key, a: num, b: p2, phase2_score: m?.phase2_score || 0, phase3_score: m?.phase3_score || 0 })
              }
            }
          }
          const phase2Scores = (matches || []).filter(m => m.phase2_score != null).map(m => m.phase2_score)
          const phase3Scores = (matches || []).filter(m => m.phase3_score != null).map(m => m.phase3_score)
          const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0

          // Engagement metrics
          const wordsSubmitted = (matches || []).filter(m => m.phase3_word || m.phase2_word).length
          const feedbackSubmitted = (matches || []).filter(m => m.phase3_feedback || m.phase2_feedback).length
          const matchPrefs = (matches || []).filter(m => m.match_preference).length

          // Rankings analysis
          const { data: rankRows } = await supabase.from("participant_rankings").select("ranker_number,ranked_number,rank").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).in("ranker_number", selected)
          const receivedCounts = {}
          for (const r of (rankRows || [])) { receivedCounts[r.ranked_number] = (receivedCounts[r.ranked_number] || 0) + 1 }
          const rankedEntries = Object.entries(receivedCounts).map(([num, count]) => ({ number: parseInt(num), name: nameMap[num] || `#${num}`, count })).sort((a, b) => b.count - a.count)

          // Mood checks
          const { data: moodRows } = await supabase.from("event3_mood_checks").select("mood,participant_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          const moodCounts = { good: 0, neutral: 0, bad: 0, unanswered: 0 }
          for (const m of (moodRows || [])) {
            if (m.mood === "good" || m.mood === "happy") moodCounts.good++
            else if (m.mood === "bad" || m.mood === "sad" || m.mood === "not_great") moodCounts.bad++
            else if (m.mood === "neutral") moodCounts.neutral++
            else moodCounts.unanswered++
          }

          return res.status(200).json({
            generated_at: new Date().toISOString(),
            event_id: currentEventId,
            total_selected: selected.length,
            match_summary: {
              phase2_pairs: phase2Matches.size / 2,
              phase3_pairs: phase3Matches.size / 2,
              mutual_choice_pairs: mutualChoicePairs.length,
              avg_phase2_score: avg(phase2Scores),
              avg_phase3_score: avg(phase3Scores),
            },
            engagement: {
              words_submitted: wordsSubmitted,
              feedback_submitted: feedbackSubmitted,
              match_preferences_submitted: matchPrefs,
            },
            most_ranked: rankedEntries.slice(0, 5),
            least_ranked: rankedEntries.slice(-5).reverse(),
            mood_summary: moodCounts,
            mutual_choice_details: mutualChoicePairs,
          })
        }

        // e3-get-state
        if (action === "e3-get-state") {
          const { data: stateRow } = await supabase.from("event_state").select("phase,global_timer_active,global_timer_start_time,global_timer_duration,global_timer_round,phase2_score_revealed,phase3_score_revealed,current_event_id").eq("match_id", EVENT3_MATCH_ID).single()
          const { count: pc, error: pcErr } = await supabase.from("event3_participants").select("id", { count: "exact", head: true }).eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          if (pcErr) console.error("[e3-get-state] participants count error:", pcErr.message)
          const { count: sc, error: scErr } = await supabase.from("session_assignments").select("id", { count: "exact", head: true }).eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          if (scErr) console.error("[e3-get-state] seating count error:", scErr.message)
          const { count: mc, error: mcErr } = await supabase.from("event3_matches").select("id", { count: "exact", head: true }).eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).not("phase2_partner", "is", null)
          if (mcErr) console.error("[e3-get-state] matches count error:", mcErr.message)
          const { count: mc3, error: mc3Err } = await supabase.from("event3_matches").select("id", { count: "exact", head: true }).eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).not("phase3_partner", "is", null)
          if (mc3Err) console.error("[e3-get-state] phase3 matches count error:", mc3Err.message)
          const { data: rankRows, error: rankErr } = await supabase.from("participant_rankings").select("ranker_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          if (rankErr) console.error("[e3-get-state] rankings error:", rankErr.message)
          const uniqueRankers = new Set((rankRows || []).map(r => r.ranker_number)).size
          return res.status(200).json({ phase: stateRow?.phase || "setup", timer_active: stateRow?.global_timer_active || false, timer_start: stateRow?.global_timer_start_time || null, timer_duration: stateRow?.global_timer_duration || 1200, timer_round: stateRow?.global_timer_round || null, participants_selected: pc || 0, seating_generated: (sc || 0) > 0, rankings_submitted: uniqueRankers, phase2_matches_done: (mc || 0) > 0, phase3_matches_done: (mc3 || 0) > 0, phase2_score_revealed: stateRow?.phase2_score_revealed || false, phase3_score_revealed: stateRow?.phase3_score_revealed || false, current_event_id: currentEventId, _debug: { realEventId, currentEventId, errors: { participants: pcErr?.message || null, seating: scErr?.message || null, matches: mcErr?.message || null, phase3: mc3Err?.message || null, rankings: rankErr?.message || null } } })
        }
        // e3-get-participants
        if (action === "e3-get-participants") {
          const { data, error } = await supabase.from("participants").select("assigned_number,name,gender,age,survey_data,mbti_personality_type,PAID_DONE,payment_completed_event_id").eq("match_id", STATIC_MATCH_ID).neq("assigned_number", 9999).order("assigned_number", { ascending: true })
          if (error) return res.status(500).json({ error: error.message })
          const { data: sel, error: selErr } = await supabase.from("event3_participants").select("participant_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          if (selErr) console.error("[e3-get-participants] selected error:", selErr.message)
          const selectedSet = new Set((sel || []).map(s => s.participant_number))
          // Fetch phase2_excluded flags from event3_participants
          const { data: e3p, error: e3pErr } = await supabase.from("event3_participants").select("participant_number,phase2_excluded").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          if (e3pErr) console.error("[e3-get-participants] phase2_excluded error:", e3pErr.message)
          const phase2ExcludedMap = {}
          for (const r of e3p || []) { phase2ExcludedMap[r.participant_number] = !!r.phase2_excluded }
          const participants = (data || []).map(p => { const sd = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {}); return { number: p.assigned_number, name: p.name || sd?.answers?.name || sd?.name || `#${p.assigned_number}`, gender: p.gender || sd?.answers?.gender || sd?.gender || "?", age: p.age || sd?.answers?.age || sd?.age || "?", paid: p.PAID_DONE === true && Number(p.payment_completed_event_id) === Number(currentEventId), selected: selectedSet.has(p.assigned_number), phase2_excluded: !!phase2ExcludedMap[p.assigned_number] } })
          return res.status(200).json({ participants, selected_count: selectedSet.size })
        }
        // e3-set-participants
        if (action === "e3-set-participants") {
          const { participant_numbers } = req.body
          if (!Array.isArray(participant_numbers) || participant_numbers.length < 4) return res.status(400).json({ error: "Select at least 4 participants" })
          await supabase.from("event3_participants").delete().eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          const rows = participant_numbers.map((num, idx) => ({ match_id: EVENT3_MATCH_ID, event_id: currentEventId, participant_number: num, position: idx }))
          const { error } = await supabase.from("event3_participants").insert(rows)
          if (error) return res.status(500).json({ error: error.message })
          return res.status(200).json({ message: "Participants selected successfully" })
        }
        // e3-generate-seating
        if (action === "e3-generate-seating") {
          const { data: ep } = await supabase.from("event3_participants").select("participant_number,position").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).order("position", { ascending: true })
          if (!ep || ep.length < 4) return res.status(400).json({ error: "Select at least 4 participants first" })
          const participantNumbers = ep.map(r => r.participant_number)

          // In test mode, skip fresh AI compatibility computation for uncached pairs — this is
          // the main cause of slow seating generation. Test participants are already selected
          // for high mutual-cache coverage, so any residual misses just fall back to a neutral
          // score for ordering purposes (real matching still computes accurately later).
          const { data: tmState } = await supabase.from("event_state").select("test_mode_active").eq("match_id", EVENT3_MATCH_ID).maybeSingle()
          const isTestMode = !!tmState?.test_mode_active
          const skipFreshCompute = isTestMode

          // ── Test mode: random shuffle (no compatibility computation) ──────────
          let orderedNumbers = participantNumbers
          const ageMap = {}
          let usedCompat = false
          if (isTestMode) {
            console.log(`e3-generate-seating: TEST MODE — skipping compatibility, using random shuffle`)
            const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]] } return arr }
            orderedNumbers = shuffle([...participantNumbers])
          } else
          try {
            console.log(`e3-generate-seating: batch-fetching compat scores from DB for ${participantNumbers.length} participants`)
            const { data: pdata } = await supabase
              .from("participants").select("assigned_number,name,gender,age,mbti_personality_type,attachment_style,communication_style,humor_banter_style,early_openness_comfort,survey_data")
              .eq("match_id", STATIC_MATCH_ID).in("assigned_number", participantNumbers)

            // Batch-fetch all cached compatibility scores in ONE query
            const { data: allCached } = await fetchAllCachedPairs('compatibility_cache', participantNumbers)
            const dbCacheMap = new Map()
            for (const c of allCached || []) {
              const key = `${c.participant_a_number}-${c.participant_b_number}`
              dbCacheMap.set(key, c)
            }
            console.log(`e3-generate-seating: ${dbCacheMap.size} cached pairs found in DB`)

            const compatMap = {}
            let cacheHits = 0, cacheMisses = 0
            if (pdata && pdata.length > 1) {
              for (let i = 0; i < pdata.length; i++) {
                for (let j = i + 1; j < pdata.length; j++) {
                  const a = pdata[i], b = pdata[j]
                  if (!isParticipantComplete(a) || !isParticipantComplete(b)) continue
                  const smaller = Math.min(a.assigned_number, b.assigned_number)
                  const larger = Math.max(a.assigned_number, b.assigned_number)
                  const key = `${smaller}-${larger}`
                  // Try DB cache first
                  const cached = dbCacheMap.get(key)
                  if (cached && cached.total_compatibility_score != null) {
                    compatMap[key] = Number(cached.total_compatibility_score) || 0
                    cacheHits++
                  } else if (skipFreshCompute) {
                    // Test mode: don't trigger slow AI computation — use neutral score for ordering.
                    compatMap[key] = 0
                    cacheMisses++
                  } else {
                    // Cache miss — compute and it will store to DB automatically
                    try {
                      const r = await calculateFullCompatibilityWithCache(a, b, true, false)
                      compatMap[key] = r.totalScore || 0
                      cacheMisses++
                    } catch { compatMap[key] = 0 }
                  }
                }
              }
            }
            // Build age map for age-aware ordering
            for (const p of pdata || []) {
              const sd = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {})
              ageMap[p.assigned_number] = p.age || sd?.answers?.age || sd?.age || null
            }

            console.log(`e3-generate-seating: ${cacheHits} cache hits, ${cacheMisses} cache misses (computed)`)
            if (Object.keys(compatMap).length > 0) {
              const numSet = new Set(participantNumbers)
              const order = []
              let current = participantNumbers[0]
              numSet.delete(current); order.push(current)
              while (numSet.size > 0) {
                let best = null, bestScore = -Infinity
                for (const cand of numSet) {
                  const key = current < cand ? `${current}-${cand}` : `${cand}-${current}`
                  const compatScore = compatMap[key] ?? 0
                  // Age penalty: larger age gap → lower score. Max penalty ~15 points.
                  const ageA = ageMap[current], ageB = ageMap[cand]
                  let agePenalty = 0
                  if (ageA && ageB) {
                    const gap = Math.abs(ageA - ageB)
                    agePenalty = Math.min(gap * 1.5, 15) // 1 year = 1.5 pts, capped at 15
                  }
                  const score = compatScore - agePenalty
                  if (score > bestScore) { bestScore = score; best = cand }
                }
                order.push(best); numSet.delete(best); current = best
              }
              orderedNumbers = order
              usedCompat = true
            }
          } catch (e) {
            console.log("Compat ordering failed, falling back to sequential:", e.message)
          }
          // ─────────────────────────────────────────────────────────────────────────

          // Fetch gender info for all participants
          const { data: genderRows } = await supabase
            .from("participants").select("assigned_number,gender,age,survey_data")
            .eq("match_id", STATIC_MATCH_ID).in("assigned_number", participantNumbers)
          const genderMap = {}
          for (const p of genderRows || []) {
            const sd = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {})
            genderMap[p.assigned_number] = p.gender || sd?.answers?.gender || sd?.gender || "?"
            if (!ageMap[p.assigned_number]) ageMap[p.assigned_number] = p.age || sd?.answers?.age || sd?.age || null
          }

          // Fetch locked matches for current event to avoid seating pairs together
          const { data: stateRow } = await supabase.from("event_state").select("current_event_id").eq("match_id", STATIC_MATCH_ID).single()
          const lockedEventId = stateRow?.current_event_id || 1
          const { data: lockedForSeating } = await supabase
            .from("locked_matches")
            .select("participant1_number,participant2_number")
            .eq("match_id", STATIC_MATCH_ID)
            .eq("event_id", lockedEventId)
          const lockedPairsSet = new Set()
          for (const l of lockedForSeating || []) {
            const key = l.participant1_number < l.participant2_number
              ? `${l.participant1_number}-${l.participant2_number}`
              : `${l.participant2_number}-${l.participant1_number}`
            lockedPairsSet.add(key)
          }
          console.log(`e3-generate-seating: ${lockedPairsSet.size} locked pairs to separate in groups`)

          const plan = e3GenerateSeatingPlan(orderedNumbers, genderMap, lockedPairsSet, ageMap)
          if (plan.error) return res.status(400).json({ error: plan.error })
          const { round1, round2, T, G, R, positionMap } = plan
          await supabase.from("session_assignments").delete().eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          await supabase.from("event3_participants").delete().eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          await supabase.from("event3_participants").insert(orderedNumbers.map(num => ({ match_id: EVENT3_MATCH_ID, event_id: currentEventId, participant_number: num, position: positionMap[num] })))
          const assignments = []
          for (let t = 0; t < T; t++) for (const p of round1[t]) assignments.push({ match_id: EVENT3_MATCH_ID, event_id: currentEventId, round: 1, table_number: t + 1, participant_id: p })
          for (let t = 0; t < T; t++) for (const p of round2[t]) assignments.push({ match_id: EVENT3_MATCH_ID, event_id: currentEventId, round: 2, table_number: t + 1, participant_id: p })
          const { error } = await supabase.from("session_assignments").insert(assignments)
          if (error) return res.status(500).json({ error: error.message })
          // Report gender balance per group
          const balanceInfo = []
          for (let t = 0; t < round1.length; t++) {
            const m = round1[t].filter(n => (genderMap[n] || '').toLowerCase() !== 'female').length
            const f = round1[t].filter(n => (genderMap[n] || '').toLowerCase() === 'female').length
            balanceInfo.push(`${m}♂${f}♀`)
          }
          const groupSizes = R > 0 ? `${T - R}×${G} + ${R}×${G + 1}` : `${T}×${G}`
          return res.status(200).json({ message: `تم توليد خطة الجلسات — ${T} مجموعات (${groupSizes})، جولتان${usedCompat ? ' (مُحسَّنة بالتوافق)' : ''} | توازن: ${balanceInfo.join(' · ')}`, round1, round2, groups: T, groupSize: G })
        }
        // e3-get-seating
        if (action === "e3-get-seating") {
          const { data: rows } = await supabase.from("session_assignments").select("round,table_number,participant_id").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).in("round", [1, 2, 3, 20, 30]).order("round").order("table_number")
          if (!rows || rows.length === 0) return res.status(200).json({ seating: null })
          const nums = [...new Set(rows.map(r => r.participant_id))]
          const { data: pdata } = await supabase.from("participants").select("assigned_number,name,gender,age,survey_data").eq("match_id", STATIC_MATCH_ID).in("assigned_number", nums)
          const nameMap = {}
          for (const p of pdata || []) { const sd = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {}); nameMap[p.assigned_number] = { name: p.name || sd?.answers?.name || sd?.name || `#${p.assigned_number}`, gender: p.gender || sd?.answers?.gender || sd?.gender || "?", age: p.age || sd?.answers?.age || sd?.age || null } }
          const seating = { 1: {}, 2: {}, 3: {}, 20: {}, 30: {} }
          for (const row of rows) { if (!seating[row.round][row.table_number]) seating[row.round][row.table_number] = []; seating[row.round][row.table_number].push({ number: row.participant_id, ...nameMap[row.participant_id] }) }
          return res.status(200).json({ seating })
        }
        // e3-toggle-score-reveal
        if (action === "e3-toggle-score-reveal") {
          const { which, value } = req.body
          if (which !== "phase2" && which !== "phase3") return res.status(400).json({ error: "which must be 'phase2' or 'phase3'" })
          const field = which === "phase2" ? "phase2_score_revealed" : "phase3_score_revealed"
          const { error } = await supabase.from("event_state").update({ [field]: !!value }).eq("match_id", EVENT3_MATCH_ID)
          if (error) return res.status(500).json({ error: error.message })
          return res.status(200).json({ message: `${which} score ${value ? 'revealed' : 'hidden'}` })
        }
        // e3-set-phase (supports optional timer params in same upsert to avoid race conditions)
        if (action === "e3-set-phase") {
          const { phase, start_timer, timer_duration, timer_round } = req.body
          const update = { phase }
          if (start_timer) {
            update.global_timer_active = true
            update.global_timer_start_time = new Date().toISOString()
            update.global_timer_duration = timer_duration || 1260
            update.global_timer_round = timer_round ?? 0
          } else if (start_timer === false) {
            update.global_timer_active = false
            update.global_timer_start_time = null
            update.global_timer_duration = null
            update.global_timer_round = null
          }
          const { error } = await supabase.from("event_state").update(update).eq("match_id", EVENT3_MATCH_ID)
          if (error) return res.status(500).json({ error: error.message })
          return res.status(200).json({ message: `Phase set to ${phase}` })
        }
        // e3-start-timer
        if (action === "e3-start-timer") {
          const { round, duration = 1260 } = req.body
          const { error } = await supabase.from("event_state").update({ global_timer_active: true, global_timer_start_time: new Date().toISOString(), global_timer_duration: duration, global_timer_round: round }).eq("match_id", EVENT3_MATCH_ID)
          if (error) return res.status(500).json({ error: error.message })
          return res.status(200).json({ message: "Timer started" })
        }
        // e3-stop-timer
        if (action === "e3-stop-timer") {
          const { error } = await supabase.from("event_state").update({ global_timer_active: false, global_timer_start_time: null }).eq("match_id", EVENT3_MATCH_ID)
          if (error) return res.status(500).json({ error: error.message })
          return res.status(200).json({ message: "Timer stopped" })
        }
        // e3-adjust-timer — add or remove seconds from the active timer
        if (action === "e3-adjust-timer") {
          const { delta_seconds } = req.body
          if (typeof delta_seconds !== "number" || delta_seconds === 0) return res.status(400).json({ error: "delta_seconds (non-zero number) required" })
          const { data: stateRow } = await supabase.from("event_state").select("global_timer_active,global_timer_start_time,global_timer_duration").eq("match_id", EVENT3_MATCH_ID).single()
          if (!stateRow?.global_timer_active || !stateRow?.global_timer_start_time) return res.status(400).json({ error: "Timer is not active" })
          const newDuration = Math.max(0, (stateRow.global_timer_duration || 1260) + delta_seconds)
          const { error } = await supabase.from("event_state").update({ global_timer_duration: newDuration }).eq("match_id", EVENT3_MATCH_ID)
          if (error) return res.status(500).json({ error: error.message })
          return res.status(200).json({ message: `Timer adjusted by ${delta_seconds > 0 ? "+" : ""}${delta_seconds}s`, new_duration: newDuration })
        }
        // e3-get-rankings-status
        if (action === "e3-get-rankings-status") {
          const { data: ep } = await supabase.from("event3_participants").select("participant_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          const selected = (ep || []).map(r => r.participant_number)
          const { data: rankRows } = await supabase.from("participant_rankings").select("ranker_number,auto_saved").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          const submittedSet = new Set((rankRows || []).map(r => r.ranker_number))
          const autoSavedSet = new Set((rankRows || []).filter(r => r.auto_saved).map(r => r.ranker_number))
          const { data: pdata } = await supabase.from("participants").select("assigned_number,name,survey_data").eq("match_id", STATIC_MATCH_ID).in("assigned_number", selected)
          const nameMap = {}
          for (const p of pdata || []) { const sd = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {}); nameMap[p.assigned_number] = p.name || sd?.answers?.name || sd?.name || `#${p.assigned_number}` }
          return res.status(200).json({ total: selected.length, submitted: submittedSet.size, auto_saved_count: autoSavedSet.size, status: selected.map(n => ({ number: n, submitted: submittedSet.has(n), auto_saved: autoSavedSet.has(n), name: nameMap[n] || `#${n}` })) })
        }
        // e3-toggle-phase2-exclusion
        if (action === "e3-toggle-phase2-exclusion") {
          const { participant_number } = req.body
          if (!participant_number) return res.status(400).json({ error: "participant_number required" })
          const { data: existing } = await supabase.from("event3_participants").select("phase2_excluded").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", participant_number).single()
          if (!existing) return res.status(404).json({ error: "Participant not found in event3" })
          const newVal = !existing.phase2_excluded
          const { error } = await supabase.from("event3_participants").update({ phase2_excluded: newVal }).eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", participant_number)
          if (error) return res.status(500).json({ error: error.message })
          return res.status(200).json({ success: true, phase2_excluded: newVal, message: `Participant #${participant_number} ${newVal ? 'excluded from' : 'included in'} phase2` })
        }
        // e3-trigger-phase2-matching
        if (action === "e3-trigger-phase2-matching") {
          // Check test mode
          const { data: tmState2 } = await supabase.from("event_state").select("test_mode_active").eq("match_id", EVENT3_MATCH_ID).maybeSingle()
          const isTestMode2 = !!tmState2?.test_mode_active

          // Fetch phase2_excluded participants
          const { data: e3p } = await supabase.from("event3_participants").select("participant_number,phase2_excluded").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          const phase2ExcludedSet = new Set((e3p || []).filter(r => r.phase2_excluded).map(r => r.participant_number))
          if (phase2ExcludedSet.size > 0) {
            console.log(`Phase 2: excluding ${phase2ExcludedSet.size} participants from choice-based matching:`, Array.from(phase2ExcludedSet))
          }

          let matches, participantMap

          if (isTestMode2) {
            // ── Test mode: use rankings if available, otherwise random pairing ──
            const { data: testRankRows } = await supabase.from("participant_rankings").select("ranker_number,ranked_number,rank").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).order("rank", { ascending: true })
            if (testRankRows && testRankRows.length > 0) {
              console.log(`Phase 2: TEST MODE — using submitted rankings (${testRankRows.length} rows)`)
              const rankings = new Map()
              for (const row of testRankRows) {
                if (phase2ExcludedSet.has(row.ranker_number)) continue
                const sorted = testRankRows.filter(r => r.ranker_number === row.ranker_number).sort((a, b) => a.rank - b.rank).map(r => r.ranked_number)
                rankings.set(row.ranker_number, sorted)
              }
              const rankerNums = Array.from(rankings.keys())
              const { data: genderRows } = await supabase.from("participants").select("assigned_number,name,gender,age,survey_data,mbti_personality_type,attachment_style,communication_style,humor_banter_style,early_openness_comfort,same_gender_preference,any_gender_preference,nationality,prefer_same_nationality,preferred_age_min,preferred_age_max,open_age_preference").eq("match_id", STATIC_MATCH_ID).in("assigned_number", rankerNums)
              participantMap = new Map()
              for (const p of genderRows || []) {
                try { p.survey_data = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {}) } catch {}
                participantMap.set(p.assigned_number, p)
              }
              const { data: exRows } = await supabase.from("event3_exclusions").select("participant_a_number,participant_b_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
              const exclusions = new Set((exRows || []).map(e => { const [a, b] = [e.participant_a_number, e.participant_b_number].sort((x, y) => x - y); return `${a}-${b}` }))
              matches = e3GreedyMutualMatching(rankings, participantMap, exclusions)
            } else {
              console.log(`Phase 2: TEST MODE — no rankings found, using random pairing`)
              const eligibleNums = (e3p || []).filter(r => !r.phase2_excluded).map(r => r.participant_number)
              const { data: pRows } = await supabase.from("participants").select("assigned_number,gender").eq("match_id", STATIC_MATCH_ID).in("assigned_number", eligibleNums)
              const genderMap = {}
              for (const p of pRows || []) genderMap[p.assigned_number] = p.gender || ''
              const result = e3RandomPairMatching(eligibleNums, genderMap)
              matches = result.matches
              participantMap = new Map()
            }
          } else {
            // ── Normal mode: ranking-based mutual matching ──────────────────────
            const { data: rankRows } = await supabase.from("participant_rankings").select("ranker_number,ranked_number,rank").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).order("rank", { ascending: true })
            if (!rankRows || rankRows.length === 0) return res.status(400).json({ error: "No rankings submitted yet" })
            const rankings = new Map()
            for (const row of rankRows) {
              if (phase2ExcludedSet.has(row.ranker_number)) continue
              const sorted = rankRows.filter(r => r.ranker_number === row.ranker_number).sort((a, b) => a.rank - b.rank).map(r => r.ranked_number)
              rankings.set(row.ranker_number, sorted)
            }
            const rankerNums = Array.from(rankings.keys())
            const { data: genderRows } = await supabase.from("participants").select("assigned_number,name,gender,age,survey_data,mbti_personality_type,attachment_style,communication_style,humor_banter_style,early_openness_comfort,same_gender_preference,any_gender_preference,nationality,prefer_same_nationality,preferred_age_min,preferred_age_max,open_age_preference").eq("match_id", STATIC_MATCH_ID).in("assigned_number", rankerNums)
            participantMap = new Map()
            for (const p of genderRows || []) {
              try { p.survey_data = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {}) } catch {}
              participantMap.set(p.assigned_number, p)
            }
            // Fetch conflict-of-interest exclusions
            const { data: exRows } = await supabase.from("event3_exclusions").select("participant_a_number,participant_b_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
            const exclusions = new Set((exRows || []).map(e => { const [a, b] = [e.participant_a_number, e.participant_b_number].sort((x, y) => x - y); return `${a}-${b}` }))
            if (exclusions.size > 0) console.log(`Phase 2: ${exclusions.size} conflict-of-interest exclusions loaded`)
            matches = e3GreedyMutualMatching(rankings, participantMap, exclusions)
          }
          // Fetch existing data to preserve phase3/words/feedback on re-run
          const { data: existingRows } = await supabase.from("event3_matches").select("participant_number,phase3_partner,phase3_score,phase3_word,phase2_word,phase2_feedback,phase3_feedback,match_preference").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          const existingMap = new Map((existingRows || []).map(r => [r.participant_number, r]))
          const rows = []
          const seen = new Set()
          const pairs = []
          for (const [p, partner] of matches) {
            if (seen.has(p) || seen.has(partner)) continue
            seen.add(p); seen.add(partner)
            // Read compatibility score from cache (no recalculation)
            const pA = participantMap.get(p), pB = participantMap.get(partner)
            let score = 50
            if (pA && pB) {
              try {
                const compat = await e3FullCalcCompat(pA, pB)
                if (compat) score = compat.totalScore
                else console.warn(`Phase 2: no cached compat for #${p}×#${partner}, using default 50`)
              } catch (e) { console.error(`Phase 2 compat error for #${p}×#${partner}:`, e.message) }
            }
            pairs.push({ a: p, b: partner, score })
            const exP = existingMap.get(p) || {}
            const exPartner = existingMap.get(partner) || {}
            rows.push({ match_id: EVENT3_MATCH_ID, event_id: currentEventId, participant_number: p, phase2_partner: partner, phase2_score: score, phase3_partner: exP.phase3_partner || null, phase3_score: exP.phase3_score || null, phase3_word: exP.phase3_word || null, phase2_word: exP.phase2_word || null, phase2_feedback: exP.phase2_feedback || null, phase3_feedback: exP.phase3_feedback || null, match_preference: exP.match_preference || null })
            rows.push({ match_id: EVENT3_MATCH_ID, event_id: currentEventId, participant_number: partner, phase2_partner: p, phase2_score: score, phase3_partner: exPartner.phase3_partner || null, phase3_score: exPartner.phase3_score || null, phase3_word: exPartner.phase3_word || null, phase2_word: exPartner.phase2_word || null, phase2_feedback: exPartner.phase2_feedback || null, phase3_feedback: exPartner.phase3_feedback || null, match_preference: exPartner.match_preference || null })
          }
          if (pairs.length === 0) return res.status(400).json({ error: "No valid Phase 2 pairs could be created. Review attendance, rankings, and exclusions." })
          const { error } = await supabase.from("event3_matches").upsert(rows, { onConflict: "match_id,event_id,participant_number" })
          if (error) return res.status(500).json({ error: error.message })
          // Null out phase2_partner/phase2_score for participants not in the new pairing
          const allNums = (e3p || []).map(r => r.participant_number)
          const unmatchedNums = allNums.filter(n => !seen.has(n))
          if (unmatchedNums.length > 0) {
            await supabase.from("event3_matches").update({ phase2_partner: null, phase2_score: null }).eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).in("participant_number", unmatchedNums)
          }
          // Assign physical tables with a gentle first-timer/age priority. The
          // requested preferred tables are used first; pairs where both people
          // attended multiple prior events are the first candidates for 17+.
          const tablePlan = await e3BuildPriorityTablePlan(pairs, currentEventId)
          const { error: deleteTablesError } = await supabase.from("session_assignments").delete().eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("round", 20)
          if (deleteTablesError) return res.status(500).json({ error: deleteTablesError.message })
          const tableRows = tablePlan.flatMap(({ a, b, table }) => [
            { match_id: EVENT3_MATCH_ID, event_id: currentEventId, round: 20, table_number: table, participant_id: a },
            { match_id: EVENT3_MATCH_ID, event_id: currentEventId, round: 20, table_number: table, participant_id: b },
          ])
          const { error: insertTablesError } = await supabase.from("session_assignments").insert(tableRows)
          if (insertTablesError) return res.status(500).json({ error: `Matches were created, but table assignment failed: ${insertTablesError.message}` })
          const preferredCount = tablePlan.filter(pair => pair.table <= 16 && ![3, 6, 7, 13, 14].includes(pair.table)).length
          const veteranOverflowCount = tablePlan.filter(pair => pair.priority.bothFrequent && pair.table > 16).length
          return res.status(200).json({
            message: `Phase 2 matching complete. Created ${pairs.length} pairs across ${pairs.length} prioritized tables.`,
            table_summary: { preferred_count: preferredCount, frequent_pairs_above_16: veteranOverflowCount },
          })
        }
        // e3-trigger-phase3-matching (uses locked matches — no recalculation)
        if (action === "e3-trigger-phase3-matching") {
          const { data: ep } = await supabase.from("event3_participants").select("participant_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          if (!ep || ep.length < 4) return res.status(400).json({ error: "No participants selected" })
          const nums = ep.map(r => r.participant_number)
          const numSet = new Set(nums)

          // Check test mode
          const { data: tmState3 } = await supabase.from("event_state").select("test_mode_active").eq("match_id", EVENT3_MATCH_ID).maybeSingle()
          const isTestMode3 = !!tmState3?.test_mode_active

          // Fetch conflict-of-interest exclusions
          const { data: exRows } = await supabase.from("event3_exclusions").select("participant_a_number,participant_b_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          const exclusions = new Set((exRows || []).map(e => { const [a, b] = [e.participant_a_number, e.participant_b_number].sort((x, y) => x - y); return `${a}-${b}` }))
          const isExcluded = (a, b) => { const [x, y] = [a, b].sort((p, q) => p - q); return exclusions.has(`${x}-${y}`) }
          if (exclusions.size > 0) console.log(`Phase 3: ${exclusions.size} conflict-of-interest exclusions loaded`)

          const used = new Set()
          const matches = []

          if (isTestMode3) {
            // ── Test mode: random pairing avoiding phase 2 pairs ───────────────
            console.log(`Phase 3: TEST MODE — skipping locked matches, using random pairing (avoiding phase 2 pairs)`)

            // Build set of phase 2 pairs to avoid
            const avoidPairs = new Set()
            const { data: phase2Rows } = await supabase.from("event3_matches").select("participant_number,phase2_partner").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).not("phase2_partner", "is", null)
            for (const r of phase2Rows || []) {
              if (r.phase2_partner) {
                const [a, b] = [r.participant_number, r.phase2_partner].sort((x, y) => x - y)
                avoidPairs.add(`${a}-${b}`)
              }
            }
            console.log(`Phase 3 (test): avoiding ${avoidPairs.size / 2} phase 2 pairs`)

            // Fetch participant profiles so the temporary result has the same
            // compatibility breakdown as an ordinary algorithm result.
            const { data: pRows3 } = await supabase.from("participants")
              .select("assigned_number,name,gender,age,survey_data,mbti_personality_type,attachment_style,communication_style,humor_banter_style,early_openness_comfort")
              .eq("match_id", STATIC_MATCH_ID)
              .in("assigned_number", nums)
            const genderMap3 = {}
            const testProfileMap = new Map()
            for (const p of pRows3 || []) {
              try { p.survey_data = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {}) } catch {}
              genderMap3[p.assigned_number] = p.gender || ''
              testProfileMap.set(p.assigned_number, p)
            }

            // Also add exclusions to avoidPairs
            for (const ex of exclusions) avoidPairs.add(ex)

            const result = e3RandomPairMatching(nums, genderMap3, avoidPairs)
            for (const { a, b } of result.pairs) {
              used.add(a); used.add(b)
              const pA = testProfileMap.get(a)
              const pB = testProfileMap.get(b)
              let compatibility = null
              try {
                if (pA && pB) {
                  compatibility = await calculateFullCompatibilityWithCache(pA, pB, false, false, {
                    skipCacheWrite: true,
                    skipUsageUpdate: true,
                  })
                }
              } catch (error) {
                console.error(`Phase 3 test compatibility error for #${a}×#${b}:`, error.message)
              }
              const score = compatibility?.totalScore ?? 50
              matches.push({
                a,
                b,
                score,
                testResult: compatibility
                  ? compatibilityResultPayload(compatibility)
                  : { compatibility_score: score, reason: "Test mode simulated algorithm lock" },
              })
            }
          } else {
            // ── Normal mode: locked matches ─────────────────────────────────────

          // Locked admin results are event-scoped. Historical locks must not
          // leak into this event after an operational participant replacement.
          const { data: lockedMatches } = await supabase
            .from("locked_matches")
            .select("participant1_number,participant2_number,original_compatibility_score,event_id")
            .eq("match_id", STATIC_MATCH_ID)
            .eq("event_id", currentEventId)

          console.log(`Phase 3 (locked): Found ${lockedMatches?.length || 0} locked matches for event ${currentEventId}`)

          // Filter to only pairs where BOTH participants are in event3 and NOT excluded
          const lockedPairs = (lockedMatches || []).filter(l =>
            numSet.has(l.participant1_number) && numSet.has(l.participant2_number) && !isExcluded(l.participant1_number, l.participant2_number)
          )
          const excludedLocked = (lockedMatches || []).filter(l =>
            numSet.has(l.participant1_number) && numSet.has(l.participant2_number) && isExcluded(l.participant1_number, l.participant2_number)
          )
          if (excludedLocked.length > 0) console.log(`Phase 3 (locked): skipped ${excludedLocked.length} locked pairs due to conflict-of-interest exclusions`)
          console.log(`Phase 3 (locked): ${lockedPairs.length} pairs have both participants in event3`)

          // Fetch participant data for compatibility calculation
          const lockedNums = [...new Set(lockedPairs.flatMap(l => [l.participant1_number, l.participant2_number]))]
          const { data: lockedPData } = await supabase.from("participants").select("assigned_number,name,gender,age,survey_data,mbti_personality_type,attachment_style,communication_style,humor_banter_style,early_openness_comfort").eq("match_id", STATIC_MATCH_ID).in("assigned_number", lockedNums)
          const lockedPMap = new Map()
          for (const p of lockedPData || []) {
            try { p.survey_data = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {}) } catch {}
            lockedPMap.set(p.assigned_number, p)
          }

          // Build phase3 matches from locked pairs — compute score from cache for consistency
          for (const lock of lockedPairs) {
            const a = lock.participant1_number
            const b = lock.participant2_number
            if (used.has(a) || used.has(b)) continue
            used.add(a)
            used.add(b)
            // Compute score from compatibility_cache (same as phase2) for consistent breakdown
            let score = lock.original_compatibility_score || 0
            const pA = lockedPMap.get(a), pB = lockedPMap.get(b)
            if (pA && pB) {
              try {
                const compat = await e3FullCalcCompat(pA, pB)
                if (compat) score = compat.totalScore
              } catch (e) { console.error(`Phase 3 compat error for #${a}×#${b}:`, e.message) }
            }
            matches.push({ a, b, score })
          }

          console.log(`Phase 3 (locked): Created ${matches.length} pairs from locked matches. ${nums.length - used.size} participants unmatched.`)

          // Handle unmatched participants — fall back to ranking-based matching
          const unmatched = nums.filter(n => !used.has(n))
          if (unmatched.length >= 2) {
            console.log(`Phase 3 (locked): ${unmatched.length} participants without locked matches — using ranking-based fallback`)
            // Fetch rankings for unmatched participants
            const { data: unmatchedRankRows } = await supabase.from("participant_rankings").select("ranker_number,ranked_number,rank").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).in("ranker_number", unmatched).order("rank", { ascending: true })
            const unmatchedRankings = new Map()
            for (const row of (unmatchedRankRows || [])) {
              const sorted = (unmatchedRankRows || []).filter(r => r.ranker_number === row.ranker_number).sort((a, b) => a.rank - b.rank).map(r => r.ranked_number)
              unmatchedRankings.set(row.ranker_number, sorted)
            }
            // Fetch participant data for gender compatibility
            const { data: unmatchedPData } = await supabase.from("participants").select("assigned_number,name,gender,age,survey_data,mbti_personality_type,attachment_style,communication_style,humor_banter_style,early_openness_comfort,same_gender_preference,any_gender_preference,nationality,prefer_same_nationality,preferred_age_min,preferred_age_max,open_age_preference").eq("match_id", STATIC_MATCH_ID).in("assigned_number", unmatched)
            const unmatchedPMap = new Map()
            for (const p of (unmatchedPData || [])) {
              try { p.survey_data = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {}) } catch {}
              unmatchedPMap.set(p.assigned_number, p)
            }
            // Use greedy mutual matching for unmatched participants
            const fallbackMatches = e3GreedyMutualMatching(unmatchedRankings, unmatchedPMap, exclusions)
            for (const [p, partner] of fallbackMatches) {
              if (used.has(p) || used.has(partner)) continue
              used.add(p)
              used.add(partner)
              const pA = unmatchedPMap.get(p), pB = unmatchedPMap.get(partner)
              let score = 50
              if (pA && pB) {
                try {
                  const compat = await e3FullCalcCompat(pA, pB)
                  if (compat) score = compat.totalScore
                } catch (e) { console.error(`Phase 3 fallback compat error for #${p}×#${partner}:`, e.message) }
              }
              matches.push({ a: p, b: partner, score })
            }
            const stillUnmatched = nums.filter(n => !used.has(n))
            if (stillUnmatched.length === 1) {
              console.log(`Phase 3: 1 participant still unmatched #${stillUnmatched[0]} (odd count)`)
            }
          } else if (unmatched.length === 1) {
            console.log(`Phase 3 (locked): 1 unmatched participant #${unmatched[0]} (odd count)`)
          }
          } // end normal mode

          if (matches.length === 0) return res.status(400).json({ error: "No valid Phase 3 pairs could be created. Review locked matches, rankings, and exclusions." })

          // Clear old phase3 data for all event3 participants
          const { error: clearPhase3Error } = await supabase.from("event3_matches").update({ phase3_partner: null, phase3_score: null }).eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).in("participant_number", nums)
          if (clearPhase3Error) return res.status(500).json({ error: clearPhase3Error.message })

          // Store results — upsert phase3 partner for each matched pair
          const phase3Rows = matches.flatMap(pair => [
            {
              match_id: EVENT3_MATCH_ID,
              event_id: currentEventId,
              participant_number: pair.a,
              phase3_partner: pair.b,
              phase3_score: pair.score,
            },
            {
              match_id: EVENT3_MATCH_ID,
              event_id: currentEventId,
              participant_number: pair.b,
              phase3_partner: pair.a,
              phase3_score: pair.score,
            },
          ])
          const { error: storePhase3Error } = await supabase.from("event3_matches").upsert(phase3Rows, { onConflict: "match_id,event_id,participant_number" })
          if (storePhase3Error) return res.status(500).json({ error: storePhase3Error.message })

          // Create round 30 assignments with the same fair physical-table
          // priority used for Phase 2.
          const tablePlan = await e3BuildPriorityTablePlan(matches, currentEventId)
          const { error: deleteTablesError } = await supabase.from("session_assignments").delete().eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("round", 30)
          if (deleteTablesError) return res.status(500).json({ error: deleteTablesError.message })
          const tableRows = tablePlan.flatMap(({ a, b, table }) => [
            { match_id: EVENT3_MATCH_ID, event_id: currentEventId, round: 30, table_number: table, participant_id: a },
            { match_id: EVENT3_MATCH_ID, event_id: currentEventId, round: 30, table_number: table, participant_id: b },
          ])
          if (tableRows.length > 0) {
            const { error: insertTablesError } = await supabase.from("session_assignments").insert(tableRows)
            if (insertTablesError) return res.status(500).json({ error: `Matches were created, but table assignment failed: ${insertTablesError.message}` })
            console.log(`Phase 3 (locked): Created ${matches.length} prioritized table assignments for round 30`)
          }

          if (isTestMode3) {
            const tableByPair = new Map(tablePlan.map(item => [swapPairKey(item.a, item.b), item.table]))
            const testRows = matches.map(pair => ({
              ...(pair.testResult || {}),
              participant_a_number: Math.min(pair.a, pair.b),
              participant_b_number: Math.max(pair.a, pair.b),
              compatibility_score: pair.score,
              table_number: tableByPair.get(swapPairKey(pair.a, pair.b)) || null,
              reason: pair.testResult?.reason || "Test mode simulated algorithm lock",
            }))
            const { data: storedTestCount, error: storeTestError } = await supabase.rpc("replace_event3_test_match_results", {
              p_event_id: currentEventId,
              p_rows: testRows,
            })
            if (storeTestError) {
              console.error("Failed to store isolated Event3 test results:", storeTestError)
              return res.status(500).json({ error: `Test matches were generated, but temporary locked results could not be stored. Apply the latest Supabase migration and retry. ${storeTestError.message}` })
            }
            console.log(`Phase 3 (test): Stored ${storedTestCount || testRows.length} isolated temporary locked results`)
          }

          const stillUnmatchedCount = nums.filter(n => !used.has(n)).length
          return res.status(200).json({
            message: `Phase 3 matching complete. Created ${matches.length} pairs. ${stillUnmatchedCount} unmatched.${isTestMode3 ? " Temporary locked results are visible to admins until test mode ends." : ""}`,
            test_mode: isTestMode3,
          })
        }
        // e3-get-all-rankings
        if (action === "e3-get-all-rankings") {
          const { data: ep, error: participantError } = await supabase.from("event3_participants").select("participant_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          if (participantError) return res.status(500).json({ error: participantError.message })
          const selected = (ep || []).map(r => r.participant_number)
          const loadRankingRows = async (eventId = null) => {
            const pageSize = 1000
            const rows = []
            for (let offset = 0; ; offset += pageSize) {
              let query = supabase.from("participant_rankings")
                .select("event_id,ranker_number,ranked_number,rank,auto_saved")
                .eq("match_id", EVENT3_MATCH_ID)
                .order("event_id", { ascending: true })
                .order("ranker_number", { ascending: true })
                .order("rank", { ascending: true })
                .order("ranked_number", { ascending: true })
                .range(offset, offset + pageSize - 1)
              if (eventId != null) query = query.eq("event_id", eventId)
              const { data, error } = await query
              if (error) throw error
              rows.push(...(data || []))
              if (!data || data.length < pageSize) break
            }
            return rows
          }

          let allEventRanks
          try {
            allEventRanks = await loadRankingRows()
          } catch (error) {
            return res.status(500).json({ error: error.message })
          }
          const { data: groupReflectionRows, error: groupReflectionError } = await supabase
            .from("event3_group_reflections")
            .select("ranker_number,ranked_numbers,organizer_note,group_round,source_phase,submitted_at,updated_at")
            .eq("match_id", EVENT3_MATCH_ID)
            .eq("event_id", currentEventId)
            .order("updated_at", { ascending: false })
          if (groupReflectionError) return res.status(500).json({ error: groupReflectionError.message })
          const currentRanks = allEventRanks.filter(row => Number(row.event_id) === Number(currentEventId))
          const knownNumbers = [...new Set([
            ...selected,
            ...allEventRanks.flatMap(row => [row.ranker_number, row.ranked_number]),
            ...(groupReflectionRows || []).flatMap(row => [row.ranker_number, ...(row.ranked_numbers || [])]),
          ])]
          const { data: pdata, error: profileError } = knownNumbers.length > 0
            ? await supabase.from("participants").select("assigned_number,name,survey_data").eq("match_id", STATIC_MATCH_ID).in("assigned_number", knownNumbers)
            : { data: [], error: null }
          if (profileError) return res.status(500).json({ error: profileError.message })
          const nameMap = {}
          for (const p of pdata || []) { const sd = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {}); nameMap[p.assigned_number] = p.name || sd?.answers?.name || sd?.name || `#${p.assigned_number}` }
          const byRanker = {}
          const autoSavedByRanker = {}
          for (const r of currentRanks) {
            if (!byRanker[r.ranker_number]) byRanker[r.ranker_number] = []
            byRanker[r.ranker_number].push({ number: r.ranked_number, rank: r.rank, name: nameMap[r.ranked_number] || `#${r.ranked_number}` })
            if (r.auto_saved) autoSavedByRanker[r.ranker_number] = true
          }
          const result = selected.map(n => ({
            number: n,
            name: nameMap[n] || `#${n}`,
            submitted: !!byRanker[n],
            auto_saved: !!autoSavedByRanker[n],
            count: (byRanker[n] || []).length,
            ranked_list: (byRanker[n] || []).sort((a, b) => a.rank - b.rank),
          }))
          const groupReflections = (groupReflectionRows || []).map(row => ({
            ranker_number: row.ranker_number,
            ranker_name: nameMap[row.ranker_number] || `#${row.ranker_number}`,
            ranked_list: (row.ranked_numbers || []).map((number, index) => ({ number, name: nameMap[number] || `#${number}`, rank: index + 1 })),
            organizer_note: row.organizer_note || null,
            group_round: row.group_round,
            source_phase: row.source_phase,
            submitted_at: row.submitted_at,
            updated_at: row.updated_at,
          }))
          return res.status(200).json({
            rankings: result,
            group_reflections: {
              submissions: groupReflections,
              leaderboard: buildGroupReflectionLeaderboard(groupReflectionRows || [], nameMap),
            },
            dislike_rankings: {
              event_id: currentEventId,
              event: buildDislikeLeaderboard(currentRanks, nameMap),
              overall: buildDislikeLeaderboard(allEventRanks, nameMap),
              excludes_auto_saved: true,
            },
          })
        }
        // e3-force-auto-save-rankings — save last-known state for all unsubmitted participants
        if (action === "e3-force-auto-save-rankings") {
          const { data: ep } = await supabase.from("event3_participants").select("participant_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          const selected = (ep || []).map(r => r.participant_number)
          if (selected.length === 0) return res.status(400).json({ error: "No participants selected" })
          const { data: existingRanks } = await supabase.from("participant_rankings").select("ranker_number,ranked_number,rank").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).order("rank", { ascending: true })
          const hasRanking = new Set((existingRanks || []).map(r => r.ranker_number))
          const missing = selected.filter(n => !hasRanking.has(n))
          if (missing.length === 0) return res.status(200).json({ message: "All participants already have rankings", saved: 0 })
          // Load every selected attendee at the relevant tables. Filtering this
          // query to only the missing rankers drops tablemates who already
          // submitted, producing incomplete auto-saved rankings.
          const { data: allAssignments } = await supabase.from("session_assignments").select("round,table_number,participant_id").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).in("participant_id", selected).in("round", [1, 2])
          if (!allAssignments || allAssignments.length === 0) return res.status(400).json({ error: "No session assignments found for missing participants" })
          const rows = []
          for (const myNum of missing) {
            const myRounds = allAssignments.filter(a => a.participant_id === myNum)
            const seenMates = new Set()
            const mates = []
            for (const row of myRounds.sort((a, b) => a.round - b.round)) {
              const tableMates = allAssignments.filter(a => a.round === row.round && a.table_number === row.table_number && a.participant_id !== myNum)
              for (const m of tableMates) { if (!seenMates.has(m.participant_id)) { seenMates.add(m.participant_id); mates.push(m.participant_id) } }
            }
            if (mates.length === 0) continue
            for (let i = 0; i < mates.length; i++) rows.push({ match_id: EVENT3_MATCH_ID, event_id: currentEventId, ranker_number: myNum, ranked_number: mates[i], rank: i + 1, auto_saved: true })
          }
          if (rows.length > 0) { const { error } = await supabase.from("participant_rankings").insert(rows); if (error) return res.status(500).json({ error: error.message }) }
          const savedCount = new Set(rows.map(row => row.ranker_number)).size
          return res.status(200).json({ message: `Auto-saved rankings for ${savedCount} participants (${rows.length} entries)`, saved: savedCount })
        }
        // e3-reset-ranking — delete all rankings for one participant (reset to unranked)
        if (action === "e3-reset-ranking") {
          const { participant_number } = req.body
          if (!participant_number) return res.status(400).json({ error: "participant_number required" })
          const { error } = await supabase.from("participant_rankings").delete().eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("ranker_number", participant_number)
          if (error) return res.status(500).json({ error: error.message })
          return res.status(200).json({ message: `Reset ranking for #${participant_number}` })
        }
        // e3-randomize-ranking-single — randomize ranking for one participant
        if (action === "e3-randomize-ranking-single") {
          const { participant_number } = req.body
          if (!participant_number) return res.status(400).json({ error: "participant_number required" })
          const { data: allAssignments } = await supabase.from("session_assignments").select("round,table_number,participant_id").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).lte("round", 2)
          if (!allAssignments || allAssignments.length === 0) return res.status(400).json({ error: "No session assignments found" })
          const myRounds = allAssignments.filter(a => a.participant_id === participant_number)
          if (myRounds.length === 0) return res.status(400).json({ error: "Participant has no session assignments" })
          const seenMates = new Set()
          const mates = []
          for (const row of myRounds.sort((a, b) => a.round - b.round)) {
            const tableMates = allAssignments.filter(a => a.round === row.round && a.table_number === row.table_number && a.participant_id !== participant_number)
            for (const m of tableMates) { if (!seenMates.has(m.participant_id)) { seenMates.add(m.participant_id); mates.push(m.participant_id) } }
          }
          if (mates.length === 0) return res.status(400).json({ error: "Participant has met nobody" })
          const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
          const shuffled = shuffle(mates)
          await supabase.from("participant_rankings").delete().eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("ranker_number", participant_number)
          const rows = shuffled.map((num, idx) => ({ match_id: EVENT3_MATCH_ID, event_id: currentEventId, ranker_number: participant_number, ranked_number: num, rank: idx + 1 }))
          const { error } = await supabase.from("participant_rankings").insert(rows)
          if (error) return res.status(500).json({ error: error.message })
          return res.status(200).json({ message: `Randomized ranking for #${participant_number} (${rows.length} entries)` })
        }
        // e3-randomize-rankings
        if (action === "e3-randomize-rankings") {
          const { data: ep } = await supabase.from("event3_participants").select("participant_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          const selected = (ep || []).map(r => r.participant_number)
          if (selected.length === 0) return res.status(400).json({ error: "No participants selected" })
          const { data: allAssignments } = await supabase.from("session_assignments").select("round,table_number,participant_id").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).in("participant_id", selected).lte("round", 2)
          if (!allAssignments || allAssignments.length === 0) return res.status(400).json({ error: "No session assignments found" })
          const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
          const rows = []
          for (const myNum of selected) {
            const myRounds = allAssignments.filter(a => a.participant_id === myNum)
            const seenMates = new Set()
            const mates = []
            for (const row of myRounds.sort((a, b) => a.round - b.round)) {
              const tableMates = allAssignments.filter(a => a.round === row.round && a.table_number === row.table_number && a.participant_id !== myNum)
              for (const m of tableMates) { if (!seenMates.has(m.participant_id)) { seenMates.add(m.participant_id); mates.push(m.participant_id) } }
            }
            if (mates.length === 0) continue
            const shuffled = shuffle(mates)
            await supabase.from("participant_rankings").delete().eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("ranker_number", myNum)
            for (let i = 0; i < shuffled.length; i++) rows.push({ match_id: EVENT3_MATCH_ID, event_id: currentEventId, ranker_number: myNum, ranked_number: shuffled[i], rank: i + 1 })
          }
          if (rows.length > 0) { const { error } = await supabase.from("participant_rankings").insert(rows); if (error) return res.status(500).json({ error: error.message }) }
          return res.status(200).json({ message: `Randomized rankings for ${selected.length} participants (${rows.length} entries)` })
        }
        // e3-get-overview
        if (action === "e3-get-overview") {
          const { data: ep } = await supabase.from("event3_participants").select("participant_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          const selected = (ep || []).map(r => r.participant_number)
          if (selected.length === 0) return res.status(200).json({ participants: [], matrix: {} })
          const { data: pdata } = await supabase.from("participants").select("assigned_number,name,gender,age,survey_data,mbti_personality_type,attachment_style,communication_style,humor_banter_style,early_openness_comfort").eq("match_id", STATIC_MATCH_ID).in("assigned_number", selected)
          const { data: assignments } = await supabase.from("session_assignments").select("participant_id,round,table_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          const { data: rankRows } = await supabase.from("participant_rankings").select("ranker_number,ranked_number,rank").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          const { data: matchRows } = await supabase.from("event3_matches").select("participant_number,phase2_partner").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          const { data: overviewState } = await supabase.from("event_state").select("test_mode_active").eq("match_id", EVENT3_MATCH_ID).maybeSingle()
          const overviewIsTestMode = overviewState?.test_mode_active === true
          // Build assignment maps: assignMap[num][round] = table
          const assignMap = {}
          for (const a of assignments || []) { if (!assignMap[a.participant_id]) assignMap[a.participant_id] = {}; assignMap[a.participant_id][a.round] = a.table_number }
          // Build ranking map: rankerMap[num] = { count, submitted }
          const rankerMap = {}
          for (const r of rankRows || []) { if (!rankerMap[r.ranker_number]) rankerMap[r.ranker_number] = 0; rankerMap[r.ranker_number]++ }
          // Build match map: matchMap[num] = partner num
          const matchMap = {}
          for (const m of matchRows || []) { if (m.phase2_partner) matchMap[m.participant_number] = m.phase2_partner }
          // Build participant info map
          const infoMap = {}
          for (const p of pdata || []) {
            const sd = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {})
            const ans = sd.answers || {}
            infoMap[p.assigned_number] = {
              number: p.assigned_number,
              name: p.name || ans.name || sd.name || `#${p.assigned_number}`,
              gender: p.gender || ans.gender || sd.gender || "?",
              age: p.age || ans.age || null,
              mbti: p.mbti_personality_type || sd.mbtiType || ans.mbti || null,
              attachment: p.attachment_style || sd.attachmentStyle || ans.attachment_style || null,
              communication: p.communication_style || sd.communicationStyle || ans.communication_style || null,
              humor: p.humor_banter_style || sd.humor_banter_style || ans.humor_banter_style || null,
              openness: p.early_openness_comfort ?? ans.early_openness_comfort ?? null,
              complete: isParticipantComplete(p),
              r1Table: assignMap[p.assigned_number]?.[1] ?? null,
              r2Table: assignMap[p.assigned_number]?.[2] ?? null,
              r20Table: assignMap[p.assigned_number]?.[20] ?? null,
              rankingCount: rankerMap[p.assigned_number] ?? 0,
              rankingSubmitted: (rankerMap[p.assigned_number] ?? 0) > 0,
              matchPartner: matchMap[p.assigned_number] ?? null,
              surveyAnswers: {
                mbti: p.mbti_personality_type || sd.mbtiType || ans.mbti || null,
                attachment: p.attachment_style || sd.attachmentStyle || ans.attachment_style || null,
                communication: p.communication_style || sd.communicationStyle || ans.communication_style || null,
                humor_banter: p.humor_banter_style || sd.humor_banter_style || ans.humor_banter_style || null,
                early_openness: p.early_openness_comfort !== undefined && p.early_openness_comfort !== null ? p.early_openness_comfort : (ans.early_openness_comfort !== undefined ? ans.early_openness_comfort : null),
                lifestyle: sd.lifestylePreferences || null,
                core_values: sd.coreValues || null,
                conversational_role: ans.conversational_role || null,
                conversation_depth: ans.conversation_depth_pref || null,
                social_battery: ans.social_battery || null,
                humor_subtype: ans.humor_subtype || null,
                curiosity_style: ans.curiosity_style || null,
                silence_comfort: ans.silence_comfort || null,
                intent_goal: ans.intent_goal || null,
                gender_preference: ans.gender_preference || null,
              },
            }
          }
          // Build compatibility matrix (batch-fetch from DB cache, compute misses)
          console.log(`e3-get-overview: batch-fetching compat scores from DB for ${selected.length} participants`)
          const { data: allCachedOverview } = await fetchAllCachedPairs('compatibility_cache', selected)
          const dbCacheOverviewMap = new Map()
          for (const c of allCachedOverview || []) {
            const key = `${c.participant_a_number}-${c.participant_b_number}`
            dbCacheOverviewMap.set(key, c)
          }
          console.log(`e3-get-overview: ${dbCacheOverviewMap.size} cached pairs found in DB`)
          const matrix = {}
          const pdataList = pdata || []
          let ovHits = 0, ovMisses = 0
          for (let i = 0; i < pdataList.length; i++) {
            for (let j = i + 1; j < pdataList.length; j++) {
              const a = pdataList[i], b = pdataList[j]
              const smaller = Math.min(a.assigned_number, b.assigned_number)
              const larger = Math.max(a.assigned_number, b.assigned_number)
              const key = `${smaller}-${larger}`
              const bothComplete = isParticipantComplete(a) && isParticipantComplete(b)
              const cached = dbCacheOverviewMap.get(key)
              if (cached && cached.total_compatibility_score != null) {
                matrix[key] = { score: Math.round(Number(cached.total_compatibility_score)), bothComplete }
                ovHits++
              } else {
                try {
                  const r = await calculateFullCompatibilityWithCache(a, b, true, false, {
                    skipCacheWrite: overviewIsTestMode,
                    skipUsageUpdate: overviewIsTestMode,
                  })
                  matrix[key] = { score: Math.round(r.totalScore), bothComplete }
                  ovMisses++
                } catch { matrix[key] = { score: null, bothComplete: false } }
              }
            }
          }
          console.log(`e3-get-overview: ${ovHits} cache hits, ${ovMisses} cache misses (computed)`)
          // Attach partner names and compat scores to participants
          const participants = Object.values(infoMap).map((p) => {
            const partner = p.matchPartner ? infoMap[p.matchPartner] : null
            const pKey = p.matchPartner ? (p.number < p.matchPartner ? `${p.number}-${p.matchPartner}` : `${p.matchPartner}-${p.number}`) : null
            return { ...p, matchPartnerName: partner?.name ?? null, matchCompatScore: pKey ? matrix[pKey]?.score ?? null : null }
          })
          return res.status(200).json({ participants, matrix })
        }
        // e3-get-matches
        if (action === "e3-get-matches") {
          const { data: ep } = await supabase.from("event3_participants").select("participant_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          const selected = (ep || []).map(r => r.participant_number)
          if (selected.length === 0) return res.status(200).json({ pairs: [] })
          const { data: matchRows } = await supabase.from("event3_matches").select("participant_number,phase2_partner,phase2_score,phase3_partner,phase3_score").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          if (!matchRows || matchRows.length === 0) return res.status(200).json({ pairs: [], phase3Pairs: [] })
          const nums = [...new Set([...matchRows.map(r => r.participant_number), ...matchRows.map(r => r.phase2_partner).filter(Boolean), ...matchRows.map(r => r.phase3_partner).filter(Boolean)])]
          const { data: pdata } = await supabase.from("participants").select("assigned_number,name,gender,age,survey_data,mbti_personality_type,attachment_style,communication_style,humor_banter_style,early_openness_comfort").eq("match_id", STATIC_MATCH_ID).in("assigned_number", nums)
          const infoMap = {}
          for (const p of pdata || []) { const sd = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {}); infoMap[p.assigned_number] = { name: p.name || sd?.answers?.name || sd?.name || `#${p.assigned_number}`, gender: p.gender || sd?.answers?.gender || sd?.gender || "?", ...p } }
          // Fetch round=20 table assignments for phase2 pairs and round=30 for phase3 pairs
          const [{ data: pairTables }, { data: phase3Tables }] = await Promise.all([
            supabase.from("session_assignments").select("participant_id,table_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("round", 20),
            supabase.from("session_assignments").select("participant_id,table_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("round", 30),
          ])
          const pairTableMap = {}
          for (const pt of pairTables || []) pairTableMap[pt.participant_id] = pt.table_number
          const phase3TableMap = {}
          for (const pt of phase3Tables || []) phase3TableMap[pt.participant_id] = pt.table_number
          // Fetch rankings for match-flow explanation
          const { data: rankRows } = await supabase.from("participant_rankings").select("ranker_number,ranked_number,rank").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).order("rank", { ascending: true })
          const rankMap = {}  // rankMap[a][b] = 1-based rank of b in a's list
          const listMap = {}  // listMap[a] = ordered array (0-indexed) of ranked numbers
          for (const row of rankRows || []) {
            if (!rankMap[row.ranker_number]) rankMap[row.ranker_number] = {}
            rankMap[row.ranker_number][row.ranked_number] = row.rank
            if (!listMap[row.ranker_number]) listMap[row.ranker_number] = []
            listMap[row.ranker_number][row.rank - 1] = row.ranked_number
          }
          // Build who-got-matched-with map
          const matchesMap = {}
          for (const row of matchRows) { if (row.phase2_partner) matchesMap[row.participant_number] = row.phase2_partner }
          const seen = new Set()
          const pairs = []
          for (const row of matchRows) {
            if (!row.phase2_partner) continue
            const key = [row.participant_number, row.phase2_partner].sort((a,b)=>a-b).join("-")
            if (seen.has(key)) continue
            seen.add(key)
            const a = row.participant_number, b = row.phase2_partner
            const ai = infoMap[a] || {}, bi = infoMap[b] || {}
            const rankBInA = rankMap[a]?.[b] ?? null  // where b sits in a's list
            const rankAInB = rankMap[b]?.[a] ?? null  // where a sits in b's list
            const matchType = (rankBInA && rankAInB) ? "mutual" : "fallback"
            // Skipped choices for a (people a ranked above b that didn't pan out)
            const skippedByA = []
            if (rankBInA && rankBInA > 1) {
              const aList = listMap[a] || []
              for (let pos = 0; pos < rankBInA - 1 && skippedByA.length < 4; pos++) {
                const pick = aList[pos]; if (!pick) continue
                const pickRankedA = rankMap[pick]?.[a]
                const pickMatch = matchesMap[pick]
                let reason
                if (!pickRankedA) reason = "لم يرتّبه"
                else if (pickMatch && pickMatch !== a) reason = `تزوّج مع ${infoMap[pickMatch]?.name || '#' + pickMatch}`
                else reason = "اختار شخصاً آخر"
                skippedByA.push({ number: pick, name: infoMap[pick]?.name || `#${pick}`, rank: pos + 1, reason })
              }
            }
            // Skipped choices for b
            const skippedByB = []
            if (rankAInB && rankAInB > 1) {
              const bList = listMap[b] || []
              for (let pos = 0; pos < rankAInB - 1 && skippedByB.length < 4; pos++) {
                const pick = bList[pos]; if (!pick) continue
                const pickRankedB = rankMap[pick]?.[b]
                const pickMatch = matchesMap[pick]
                let reason
                if (!pickRankedB) reason = "لم يرتّبه"
                else if (pickMatch && pickMatch !== b) reason = `تزوّج مع ${infoMap[pickMatch]?.name || '#' + pickMatch}`
                else reason = "اختار شخصاً آخر"
                skippedByB.push({ number: pick, name: infoMap[pick]?.name || `#${pick}`, rank: pos + 1, reason })
              }
            }
            const bothComplete = !!(infoMap[a] && infoMap[b] && e3IsComplete(infoMap[a]) && e3IsComplete(infoMap[b]))
            const compat = (infoMap[a] && infoMap[b]) ? await e3FullCalcCompat(infoMap[a], infoMap[b]) : null
            const compatScore = compat ? compat.totalScore : null
            const pairTable = pairTableMap[a] || pairTableMap[b] || null
            pairs.push({ a, aName: ai.name || `#${a}`, aGender: ai.gender, aSurvey: ai.survey_data, b, bName: bi.name || `#${b}`, bGender: bi.gender, bSurvey: bi.survey_data, rankBInA, rankAInB, matchType, skippedByA, skippedByB, compatScore, compat, bothComplete, table: pairTable })
          }
          // Build phase3 pairs (algorithm matches — from locked matches, no recalculation)
          // Fetch locked matches for current event to flag pairs
          const [{ data: stateRow2 }, { data: testStateRow }] = await Promise.all([
            supabase.from("event_state").select("current_event_id").eq("match_id", STATIC_MATCH_ID).single(),
            supabase.from("event_state").select("test_mode_active").eq("match_id", EVENT3_MATCH_ID).maybeSingle(),
          ])
          const currentEventId2 = stateRow2?.current_event_id || 1
          const matchesAreTestMode = testStateRow?.test_mode_active === true
          let lockedPairKeys
          if (matchesAreTestMode) {
            const testRows = await getEvent3TestMatchRows(currentEventId2)
            lockedPairKeys = new Set(testRows.map(row => swapPairKey(row.participant_a_number, row.participant_b_number)))
          } else {
            const { data: lockedForEvent } = await supabase
              .from("locked_matches")
              .select("participant1_number,participant2_number")
              .eq("match_id", STATIC_MATCH_ID)
              .eq("event_id", currentEventId2)
            lockedPairKeys = new Set((lockedForEvent || []).map(lock => swapPairKey(lock.participant1_number, lock.participant2_number)))
          }
          const phase3Seen = new Set()
          const phase3Pairs = []
          for (const row of matchRows) {
            if (!row.phase3_partner) continue
            const key = [row.participant_number, row.phase3_partner].sort((a,b)=>a-b).join("-")
            if (phase3Seen.has(key)) continue
            phase3Seen.add(key)
            const a = row.participant_number, b = row.phase3_partner
            const ai = infoMap[a] || {}, bi = infoMap[b] || {}
            const bothComplete3 = !!(infoMap[a] && infoMap[b] && e3IsComplete(infoMap[a]) && e3IsComplete(infoMap[b]))
            const compat3 = (infoMap[a] && infoMap[b]) ? await e3FullCalcCompat(infoMap[a], infoMap[b]) : null
            const compatScore3 = compat3 ? compat3.totalScore : null
            const storedScore3 = row.phase3_score || null
            const lockedKey = `${Math.min(a, b)}-${Math.max(a, b)}`
            const pairTable3 = phase3TableMap[a] || phase3TableMap[b] || null
            phase3Pairs.push({ a, aName: ai.name || `#${a}`, aGender: ai.gender, b, bName: bi.name || `#${b}`, bGender: bi.gender, compatScore: compatScore3, storedScore: storedScore3, compat: compat3, bothComplete: bothComplete3, locked: lockedPairKeys.has(lockedKey), isTestMode: matchesAreTestMode, table: pairTable3 })
          }
          const priorityPlan = await e3BuildPriorityTablePlan([...pairs, ...phase3Pairs], currentEventId)
          const priorityByPair = new Map(priorityPlan.map(item => [`${Math.min(item.a, item.b)}-${Math.max(item.a, item.b)}`, item.priority]))
          for (const pair of [...pairs, ...phase3Pairs]) {
            pair.tablePriority = priorityByPair.get(`${Math.min(pair.a, pair.b)}-${Math.max(pair.a, pair.b)}`) || null
          }
          return res.status(200).json({ pairs, phase3Pairs, test_mode: matchesAreTestMode })
        }
        // e3-set-ranking (admin override for one participant's ranking list)
        if (action === "e3-set-ranking") {
          const { ranker_number, ranked_list } = req.body
          if (!ranker_number || !Array.isArray(ranked_list)) return res.status(400).json({ error: "ranker_number and ranked_list required" })
          await supabase.from("participant_rankings").delete().eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("ranker_number", ranker_number)
          if (ranked_list.length > 0) {
            const rows = ranked_list.map((num, idx) => ({ match_id: EVENT3_MATCH_ID, event_id: currentEventId, ranker_number, ranked_number: num, rank: idx + 1 }))
            const { error } = await supabase.from("participant_rankings").insert(rows)
            if (error) return res.status(500).json({ error: error.message })
          }
          return res.status(200).json({ message: `Ranking updated for #${ranker_number}` })
        }
        // e3-get-met-for-admin — get people a participant met (for admin simulation)
        if (action === "e3-get-met-for-admin") {
          const { participant_number } = req.body
          if (!participant_number) return res.status(400).json({ error: "participant_number required" })
          const { data: allRounds } = await supabase.from("session_assignments").select("round,table_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("participant_id", participant_number).order("round", { ascending: true })
          if (!allRounds || allRounds.length === 0) return res.status(200).json({ people: [] })
          const metNumbers = []
          const seenNums = new Set()
          for (const row of allRounds) {
            const { data: mates } = await supabase.from("session_assignments").select("participant_id").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("round", row.round).eq("table_number", row.table_number).neq("participant_id", participant_number)
            for (const m of mates || []) {
              if (!seenNums.has(m.participant_id)) {
                seenNums.add(m.participant_id)
                metNumbers.push({ number: m.participant_id, round: row.round })
              }
            }
          }
          if (metNumbers.length === 0) return res.status(200).json({ people: [] })
          const nums = metNumbers.map(m => m.number)
          const { data: pdata } = await supabase.from("participants").select("assigned_number,name,survey_data").eq("match_id", STATIC_MATCH_ID).in("assigned_number", nums)
          const nameMap = {}
          for (const p of pdata || []) { const sd = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {}); nameMap[p.assigned_number] = p.name || sd?.answers?.name || sd?.name || `#${p.assigned_number}` }
          return res.status(200).json({ people: metNumbers.map(m => ({ number: m.number, name: nameMap[m.number] || `#${m.number}`, round: m.round })) })
        }
        // e3-move-table (reassign one participant to a different table in one round)
        if (action === "e3-move-table") {
          const { participant_number, round, new_table } = req.body
          const participantNumber = Number(participant_number)
          const assignmentRound = Number(round)
          const tableNumber = Number(new_table)
          if (!Number.isInteger(participantNumber) || participantNumber <= 0 || participantNumber === 9999) return res.status(400).json({ error: "Invalid participant_number" })
          if (![1, 2, 20, 30].includes(assignmentRound)) return res.status(400).json({ error: "Round must be 1, 2, 20, or 30" })
          if (!Number.isInteger(tableNumber) || tableNumber <= 0 || tableNumber > 99) return res.status(400).json({ error: "new_table must be between 1 and 99" })
          const { data: updatedRows, error } = await supabase.from("session_assignments")
            .update({ table_number: tableNumber })
            .eq("match_id", EVENT3_MATCH_ID)
            .eq("event_id", currentEventId)
            .eq("participant_id", participantNumber)
            .eq("round", assignmentRound)
            .select("id")
          if (error) return res.status(500).json({ error: error.message })
          if (!updatedRows?.length) return res.status(404).json({ error: `No round ${assignmentRound} assignment found for #${participantNumber}` })
          if (assignmentRound === 30) await refreshEvent3TestMatchResults(currentEventId)
          return res.status(200).json({ message: `Moved #${participantNumber} to table ${tableNumber} in round ${assignmentRound}` })
        }
        // e3-swap-table-numbers (atomically exchange two complete tables).
        // Group-round table labels stay linked across rounds 1 and 2. The two
        // one-to-one phases (20/30) are exchanged independently.
        if (action === "e3-swap-table-numbers") {
          const round = Number(req.body.round)
          const tableA = Number(req.body.table_a)
          const tableB = Number(req.body.table_b)
          const rounds = getTableSwapRounds(round)
          if (!rounds) return res.status(400).json({ error: "Round must be 1, 2, 20, or 30" })
          if (!Number.isInteger(tableA) || !Number.isInteger(tableB) || tableA <= 0 || tableB <= 0 || tableA > 99 || tableB > 99 || tableA === tableB) {
            return res.status(400).json({ error: "Two different table numbers between 1 and 99 are required" })
          }

          const { data, error } = await supabase.rpc("swap_event3_table_numbers", {
            p_match_id: EVENT3_MATCH_ID,
            p_event_id: currentEventId,
            p_rounds: rounds,
            p_table_a: tableA,
            p_table_b: tableB,
          })
          if (error) {
            if (isMissingAdmin3SwapRpc(error)) {
              return res.status(501).json({ error: "The atomic admin3 swap migration has not been applied yet", migration_required: true })
            }
            return res.status(500).json({ error: error.message })
          }
          if (rounds.includes(30)) await refreshEvent3TestMatchResults(currentEventId)
          const roundLabel = rounds.length === 2 ? "group rounds 1 and 2" : `round ${round}`
          return res.status(200).json({ ...data, message: `Swapped table ${tableA} ↔ ${tableB} in ${roundLabel}` })
        }
        // e3-swap-seating (swap two participants across the two group rounds).
        // One-to-one rounds are deliberately excluded because moving seats there
        // without changing reciprocal match rows would separate partners.
        if (action === "e3-swap-seating") {
          const numA = Number(req.body.num_a)
          const numB = Number(req.body.num_b)
          if (!Number.isInteger(numA) || !Number.isInteger(numB) || numA <= 0 || numB <= 0 || numA === numB || numA === 9999 || numB === 9999) return res.status(400).json({ error: "Two different participant numbers required" })
          const { data, error } = await supabase.rpc("swap_event3_group_seats", {
            p_match_id: EVENT3_MATCH_ID,
            p_event_id: currentEventId,
            p_participant_a: numA,
            p_participant_b: numB,
          })
          if (error) {
            if (isMissingAdmin3SwapRpc(error)) {
              return res.status(501).json({ error: "The atomic admin3 swap migration has not been applied yet", migration_required: true })
            }
            return res.status(500).json({ error: error.message })
          }
          return res.status(200).json({ ...data, message: `Swapped #${numA} ↔ #${numB} in group rounds 1 and 2` })
        }
        // e3-clear-rankings
        if (action === "e3-clear-rankings") {
          const { error } = await supabase.from("participant_rankings").delete().eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          if (error) return res.status(500).json({ error: error.message })
          return res.status(200).json({ message: "All rankings cleared" })
        }
        // e3-get-sos — get all organizer requests
        if (action === "e3-get-sos") {
          const { data, error } = await supabase.from("organizer_requests").select("*").or(`event_id.eq.${currentEventId},event_id.is.null`).order("updated_at", { ascending: false })
          if (error) return res.status(500).json({ error: error.message })
          return res.status(200).json({ requests: data || [] })
        }
        // e3-sos-initiate — organizer starts a chat with a participant
        if (action === "e3-sos-initiate") {
          const { participant_number, participant_name, message } = req.body
          if (!participant_number) return res.status(400).json({ error: "participant_number required" })
          // Find participant's token
          const { data: pRow } = await supabase.from("participants").select("secure_token,name").eq("match_id", STATIC_MATCH_ID).eq("assigned_number", participant_number).single()
          if (!pRow || !pRow.secure_token) return res.status(404).json({ error: "Participant not found or no token" })
          const pName = participant_name || pRow.name || `#${participant_number}`
          const now = new Date().toISOString()
          const chatEntry = { from: 'organizer', text: message, timestamp: now }
          // Check if there's already an existing active request for this participant
          const { data: existing } = await supabase.from("organizer_requests")
            .select("id,chat_history")
            .eq("participant_token", pRow.secure_token)
            .or(`event_id.eq.${currentEventId},event_id.is.null`)
            .neq("status", "resolved")
            .order("created_at", { ascending: false })
            .limit(1)
          if (existing && existing.length > 0) {
            const existingChat = Array.isArray(existing[0].chat_history) ? existing[0].chat_history : []
            const updatedChat = [...existingChat, chatEntry]
            const { error } = await supabase.from("organizer_requests").update({
              organizer_reply: message, status: "replied", chat_history: updatedChat, updated_at: now
            }).eq("id", existing[0].id)
            if (error) return res.status(500).json({ error: error.message })
            return res.status(200).json({ message: "تم الإرسال", id: existing[0].id })
          }
          // Create new organizer-initiated request
          const { data: inserted, error: insErr } = await supabase.from("organizer_requests").insert({
            event_id: currentEventId, participant_token: pRow.secure_token, participant_number, participant_name: pName,
            table_info: "رسالة من المنظم", message: null, organizer_reply: message, status: "replied",
            request_type: "chat", chat_history: [chatEntry]
          }).select("id").single()
          if (insErr) return res.status(500).json({ error: insErr.message })
          return res.status(200).json({ message: "تم الإرسال", id: inserted.id })
        }
        // e3-sos-reply — admin acknowledges/replies to a request
        if (action === "e3-sos-reply") {
          const { id, reply, status: newStatus } = req.body
          if (!id) return res.status(400).json({ error: "id required" })
          if (newStatus === 'resolved') {
            const { error } = await supabase.from("organizer_requests").update({ status: "resolved", updated_at: new Date().toISOString() }).eq("id", id).or(`event_id.eq.${currentEventId},event_id.is.null`)
            if (error) return res.status(500).json({ error: error.message })
            return res.status(200).json({ message: "تم الحذف" })
          }
          const now = new Date().toISOString()
          const update = { status: newStatus || "replied", updated_at: now }
          if (reply !== undefined && reply !== null && reply !== '') {
            update.organizer_reply = reply
            // Append to chat_history
            const { data: req_row } = await supabase.from("organizer_requests").select("chat_history").eq("id", id).single()
            const existingChat = Array.isArray(req_row?.chat_history) ? req_row.chat_history : []
            update.chat_history = [...existingChat, { from: 'organizer', text: reply, timestamp: now }]
          }
          const { error } = await supabase.from("organizer_requests").update(update).eq("id", id)
          if (error) return res.status(500).json({ error: error.message })
          return res.status(200).json({ message: "تم التحديث" })
        }
        // e3-sos-mark-seen — mark all pending requests as seen
        if (action === "e3-sos-mark-seen") {
          const { error } = await supabase.from("organizer_requests").update({ status: "seen", updated_at: new Date().toISOString() }).eq("status", "pending").or(`event_id.eq.${currentEventId},event_id.is.null`)
          if (error) return res.status(500).json({ error: error.message })
          return res.status(200).json({ message: "تم التعليم كمشاهَد" })
        }
        // e3-reset-sos — delete all organizer requests
        if (action === "e3-reset-sos") {
          const { error } = await supabase.from("organizer_requests").delete().or(`event_id.eq.${currentEventId},event_id.is.null`)
          if (error) return res.status(500).json({ error: error.message })
          return res.status(200).json({ message: "تم حذف جميع الطلبات" })
        }
        // e3-get-feedback — live feedback feed for admin spectator
        if (action === "e3-get-feedback") {
          const { data: matchRows } = await supabase
            .from("event3_matches")
            .select("participant_number, phase2_partner, phase3_partner, phase2_feedback, phase3_feedback, match_preference")
            .eq("match_id", EVENT3_MATCH_ID)
            .eq("event_id", currentEventId)
          if (!matchRows || matchRows.length === 0)
            return res.status(200).json({ phase2: [], phase3: [], phase2_submitted: 0, phase3_submitted: 0, total_participants: 0 })
          const allNums = [...new Set(matchRows.flatMap(r => [r.participant_number, r.phase2_partner, r.phase3_partner].filter(Boolean)))]
          const { data: pdata } = await supabase.from("participants").select("assigned_number, name, gender").eq("match_id", STATIC_MATCH_ID).in("assigned_number", allNums)
          const nameMap = {}
          for (const p of pdata || []) nameMap[p.assigned_number] = { name: p.name || `#${p.assigned_number}`, gender: p.gender }
          const getName = (num) => nameMap[num]?.name || `#${num}`
          const matchMap = {}
          for (const row of matchRows) matchMap[row.participant_number] = row
          // Batch-fetch algorithmic compatibility scores for every pair involved, so we can
          // show the criteria-based score alongside real feedback in the admin feed.
          const { data: cachedPairsFb } = await fetchAllCachedPairs("compatibility_cache", allNums)
          const compatMap = {}
          for (const c of cachedPairsFb || []) {
            compatMap[`${c.participant_a_number}-${c.participant_b_number}`] = Math.round(parseFloat(c.total_compatibility_score))
          }
          const getCompatScore = (numA, numB) => {
            const [x, y] = [numA, numB].sort((p, q) => p - q)
            return compatMap[`${x}-${y}`] ?? null
          }
          const phase2 = [], phase3 = []
          for (const row of matchRows) {
            if (row.phase2_partner) {
              const partnerRow = matchMap[row.phase2_partner]
              const partnerFb = partnerRow?.phase2_feedback || null
              const myFb = row.phase2_feedback || null
              const mutualYes = !!(myFb?.wantConnect === true && partnerFb?.wantConnect === true)
              const partnerOtherNum = partnerRow?.phase3_partner || null
              const partnerOtherCompat = partnerOtherNum ? getCompatScore(row.phase2_partner, partnerOtherNum) : null
              const currentCompat = getCompatScore(row.participant_number, row.phase2_partner)
              phase2.push({ participant_number: row.participant_number, participant_name: getName(row.participant_number), partner_number: row.phase2_partner, partner_name: getName(row.phase2_partner), feedback: myFb, submitted: !!row.phase2_feedback, partner_submitted: !!partnerFb, partner_feedback: partnerFb, mutual_yes: mutualYes, match_preference: row.match_preference || null, compat_score: currentCompat, partner_other_phase: "phase3", partner_other_partner_number: partnerOtherNum, partner_other_partner_name: partnerOtherNum ? getName(partnerOtherNum) : null, partner_other_compat_score: partnerOtherCompat, compat_diff: (currentCompat != null && partnerOtherCompat != null) ? currentCompat - partnerOtherCompat : null })
            }
            if (row.phase3_partner) {
              const partnerRow = matchMap[row.phase3_partner]
              const partnerFb = partnerRow?.phase3_feedback || null
              const myFb = row.phase3_feedback || null
              const mutualYes = !!(myFb?.wantConnect === true && partnerFb?.wantConnect === true)
              const partnerOtherNum3 = partnerRow?.phase2_partner || null
              const partnerOtherCompat3 = partnerOtherNum3 ? getCompatScore(row.phase3_partner, partnerOtherNum3) : null
              const currentCompat3 = getCompatScore(row.participant_number, row.phase3_partner)
              phase3.push({ participant_number: row.participant_number, participant_name: getName(row.participant_number), partner_number: row.phase3_partner, partner_name: getName(row.phase3_partner), feedback: myFb, submitted: !!row.phase3_feedback, partner_submitted: !!partnerFb, partner_feedback: partnerFb, mutual_yes: mutualYes, match_preference: row.match_preference || null, compat_score: currentCompat3, partner_other_phase: "phase2", partner_other_partner_number: partnerOtherNum3, partner_other_partner_name: partnerOtherNum3 ? getName(partnerOtherNum3) : null, partner_other_compat_score: partnerOtherCompat3, compat_diff: (currentCompat3 != null && partnerOtherCompat3 != null) ? currentCompat3 - partnerOtherCompat3 : null })
            }
          }
          const { data: ep } = await supabase.from("event3_participants").select("participant_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          return res.status(200).json({ phase2, phase3, phase2_submitted: phase2.filter(e => e.submitted).length, phase3_submitted: phase3.filter(e => e.submitted).length, total_participants: (ep || []).length })
        }
        // e3-analyze-pair — algorithmic comparison + AI interpretation from ONE participant's perspective.
        // The clicked card's participant is the "subject"; we compare their actual event3 partner with
        // their highest-scoring algorithmic alternative (same event only), then surface a deterministic
        // criteria diff and let AI summarize the calibration insight.
        if (action === "e3-analyze-pair") {
          const { participant_number: subjectNumber, partner_number: partnerNumber, phase } = req.body
          if (!subjectNumber || !["phase2", "phase3"].includes(phase))
            return res.status(400).json({ error: "participant_number and phase required" })

          const partnerCol = phase === "phase2" ? "phase2_partner" : "phase3_partner"
          const feedbackCol = phase === "phase2" ? "phase2_feedback" : "phase3_feedback"

          // Authoritative partner: read the actual partner stored in event3_matches for this event/phase.
          const { data: subjectMatchRow } = await supabase
            .from("event3_matches")
            .select(`${partnerCol}, ${feedbackCol}`)
            .eq("match_id", EVENT3_MATCH_ID)
            .eq("event_id", currentEventId)
            .eq("participant_number", subjectNumber)
            .maybeSingle()
          const actualPartnerNumber = subjectMatchRow?.[partnerCol]
          if (!actualPartnerNumber)
            return res.status(404).json({ error: `No ${phase} partner found for participant #${subjectNumber} in event ${currentEventId}` })
          if (partnerNumber && Number(partnerNumber) !== Number(actualPartnerNumber)) {
            console.warn(`[e3-analyze-pair] Frontend sent partner #${partnerNumber} for subject #${subjectNumber} in event ${currentEventId}, but DB has #${actualPartnerNumber}. Using DB value.`)
          }
          const resolvedPartnerNumber = Number(actualPartnerNumber)

          const [{ data: subjectFeedbackRow }, { data: partnerFeedbackRow }] = await Promise.all([
            supabase.from("event3_matches").select(`${feedbackCol}`).eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", subjectNumber).maybeSingle(),
            supabase.from("event3_matches").select(`${feedbackCol}`).eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", resolvedPartnerNumber).maybeSingle(),
          ])
          const subjectFeedback = subjectFeedbackRow?.[feedbackCol] || null
          const partnerFeedback = partnerFeedbackRow?.[feedbackCol] || null

          const [{ data: subject }, { data: partner }] = await Promise.all([
            supabase.from("participants").select("assigned_number, name, age, gender, survey_data, mbti_personality_type, attachment_style, communication_style, nationality").eq("match_id", STATIC_MATCH_ID).eq("assigned_number", subjectNumber).maybeSingle(),
            supabase.from("participants").select("assigned_number, name, age, gender, survey_data, mbti_personality_type, attachment_style, communication_style, nationality").eq("match_id", STATIC_MATCH_ID).eq("assigned_number", resolvedPartnerNumber).maybeSingle(),
          ])
          if (!subject || !partner) return res.status(404).json({ error: "Participant data not found" })

          const parseSurvey = (p) => { try { return typeof p?.survey_data === "string" ? JSON.parse(p.survey_data) : (p?.survey_data || {}) } catch { return {} } }
          const subjectAnswers = parseSurvey(subject)?.answers || {}
          const partnerAnswers = parseSurvey(partner)?.answers || {}

          const extractBreakdown = (row) => row ? {
            total: Math.round(parseFloat(row.total_compatibility_score)),
            synergy: Math.round(parseFloat(row.interaction_synergy_score)),
            vibe: Math.round(parseFloat(row.ai_vibe_score)),
            lifestyle: Math.round(parseFloat(row.lifestyle_score)),
            communication: Math.round(parseFloat(row.communication_score)),
            coreValues: Math.round((parseFloat(row.core_values_score) / 20) * 5),
            intent: Math.round(parseFloat(row.intent_goal_score) || 0),
          } : null

          const [sortedA, sortedB] = [subjectNumber, resolvedPartnerNumber].sort((p, q) => p - q)
          const { data: cacheRow } = await supabase.from("compatibility_cache").select("*")
            .eq("participant_a_number", sortedA).eq("participant_b_number", sortedB)
            .order("last_used", { ascending: false }).limit(1).maybeSingle()
          const actualBreakdown = extractBreakdown(cacheRow)

          // The comparison partner is the participant's actual assigned partner in the OTHER phase
          // of the same event day (phase2 vs phase3), not the best global algorithmic candidate.
          const otherPhaseCol = phase === "phase2" ? "phase3_partner" : "phase2_partner"
          const otherFeedbackCol = phase === "phase2" ? "phase3_feedback" : "phase2_feedback"
          const { data: otherMatchRow } = await supabase
            .from("event3_matches")
            .select(`${otherPhaseCol}, ${otherFeedbackCol}`)
            .eq("match_id", EVENT3_MATCH_ID)
            .eq("event_id", currentEventId)
            .eq("participant_number", subjectNumber)
            .maybeSingle()
          const alternativeNumber = otherMatchRow?.[otherPhaseCol] || null
          const alternativeFeedback = otherMatchRow?.[otherFeedbackCol] || null

          const { data: alternativeProfile } = alternativeNumber
            ? await supabase.from("participants").select("assigned_number, name, age, gender, survey_data, mbti_personality_type, attachment_style, communication_style, nationality").eq("match_id", STATIC_MATCH_ID).eq("assigned_number", alternativeNumber).maybeSingle()
            : { data: null }

          // Fetch compatibility breakdown between subject and the other-phase partner.
          const [sortedSubject, sortedOther] = [subjectNumber, alternativeNumber || 0].sort((p, q) => p - q)
          const { data: otherCacheRow } = alternativeNumber
            ? await supabase.from("compatibility_cache").select("*")
                .eq("participant_a_number", sortedSubject)
                .eq("participant_b_number", sortedOther)
                .order("last_used", { ascending: false })
                .limit(1)
                .maybeSingle()
            : { data: null }
          const alternativeBreakdown = extractBreakdown(otherCacheRow)
          const alternativeAnswers = alternativeProfile ? (parseSurvey(alternativeProfile)?.answers || {}) : {}

          // ── Deterministic algorithmic diff ───────────────────────────────────────
          const criteria = [
            { key: "total", label: "الإجمالي" },
            { key: "synergy", label: "التناغم" },
            { key: "vibe", label: "الجاذبية" },
            { key: "lifestyle", label: "نمط الحياة" },
            { key: "communication", label: "التواصل" },
            { key: "coreValues", label: "القيم الأساسية" },
            { key: "intent", label: "الهدف" },
          ]
          const diff = {}
          let largestGapKey = null
          let largestGapValue = -Infinity
          for (const { key } of criteria) {
            const a = actualBreakdown?.[key] ?? 0
            const b = alternativeBreakdown?.[key] ?? 0
            const gap = b - a
            diff[key] = gap
            if (Math.abs(gap) > Math.abs(largestGapValue)) {
              largestGapValue = gap
              largestGapKey = key
            }
          }

          // ── Feedback-driven signal ───────────────────────────────────────────────
          const wantConnect = subjectFeedback?.wantConnect
          const conversationQuality = Number(subjectFeedback?.conversationQuality) || 0
          const personalConnection = Number(subjectFeedback?.personalConnection) || 0
          const compatibilityRate = Number(subjectFeedback?.compatibilityRate) || 0
          const algorithmHigh = (actualBreakdown?.total || 0) >= 70
          const algorithmLow = (actualBreakdown?.total || 0) <= 50
          const ratingsLow = conversationQuality > 0 && personalConnection > 0 && (conversationQuality + personalConnection) <= 5
          const ratingsHigh = conversationQuality > 0 && personalConnection > 0 && (conversationQuality + personalConnection) >= 9
          const mismatchReasons = []
          if (algorithmHigh && wantConnect === false) mismatchReasons.push("algorithm_overrated")
          if (algorithmHigh && ratingsLow) mismatchReasons.push("high_score_low_ratings")
          if (algorithmLow && wantConnect === true) mismatchReasons.push("algorithm_underrated")
          if (algorithmLow && ratingsHigh) mismatchReasons.push("low_score_high_ratings")
          if (wantConnect === true && ratingsLow) mismatchReasons.push("wants_connect_but_low_ratings")
          const feedbackSignal = {
            wantConnect,
            conversationQuality: conversationQuality || null,
            personalConnection: personalConnection || null,
            compatibilityRate: compatibilityRate || null,
            mismatchReasons,
            algorithmHigh,
            algorithmLow,
          }

          const summarize = (p, ans) => ({
            name: p.name, age: p.age, gender: p.gender, nationality: p.nationality,
            mbti: p.mbti_personality_type, attachment: p.attachment_style, communication: p.communication_style,
            conversational_role: ans.conversational_role, humor_banter_style: ans.humor_banter_style,
            early_openness_comfort: ans.early_openness_comfort, intent_goal: ans.intent_goal,
            silence_comfort: ans.silence_comfort, social_battery: ans.social_battery,
          })

          const systemMessage = `أنت مساعد معايرة خوارزميات توافق فعاليات التعارف. مهمتك تقرير موجز وواضح بالعربية (4-6 جمل كحد أقصى) يقارن بين شريك المشارك في الجولة الحالية وشريكه في الجولة الأخرى من نفس يوم الفعالية. انطلق من الفروقات المحسوبة بين درجات التوافق وتقييم المشارك الفعلي. لا تخمن، ولا تستخدم معلومات خارج البيانات المعطاة. ركّز على:
1. هل تقييم المشارك يؤيد الفرق في الدرجات بين الجولتين أم يناقضه؟
2. أي معيار (إجمالي، تناغم، جاذبية، نمط حياة، تواصل، قيم، هدف) يظهر أكبر اختلاف بين الشريكين؟
3. اقتراح عملي واحد لتحسين وزن معيار أو صياغة سؤال استبيان.`

          const userMessage = `تحليل من منظور المشارك: ${subject.name} (#${subject.assigned_number})
الشريك الفعلي في ${phase === "phase2" ? "اختيار المشاركين" : "الخوارزمية"}: ${partner.name} (#${partner.assigned_number})
الشريك في الجولة الأخرى (${phase === "phase2" ? "الخوارزمية" : "اختيار المشاركين"}): ${alternativeProfile ? `${alternativeProfile.name} (#${alternativeProfile.assigned_number})` : "غير متوفر"}

درجة التوافق مع الشريك الفعلي: ${actualBreakdown ? JSON.stringify(actualBreakdown) : "غير متوفرة"}
درجة التوافق مع شريك الجولة الأخرى: ${alternativeBreakdown ? JSON.stringify(alternativeBreakdown) : "غير متوفرة"}

الفروقات (الجولة الأخرى - الجولة الحالية): ${JSON.stringify(diff)}
أكبر فارق في معيار: ${largestGapKey || "غير محدد"}

تقييم المشارك في الجولة الحالية: ${JSON.stringify(feedbackSignal)}
انطباع المشارك عن المنظم (نص حر): ${subjectFeedback?.organizerImpression || "لا يوجد"}
${alternativeFeedback ? `تقييم المشارك في الجولة الأخرى: ${JSON.stringify(alternativeFeedback)}` : ""}

بيانات استبيان المشارك: ${JSON.stringify(summarize(subject, subjectAnswers))}
بيانات استبيان الشريك الفعلي: ${JSON.stringify(summarize(partner, partnerAnswers))}
${alternativeProfile ? `بيانات استبيان شريك الجولة الأخرى: ${JSON.stringify(summarize(alternativeProfile, alternativeAnswers))}` : ""}

اكتب تحليلاً موجزاً بالعربية.`

          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemMessage },
              { role: "user", content: userMessage },
            ],
            max_completion_tokens: 500,
            temperature: 0.4,
          })
          const analysis = completion.choices[0]?.message?.content?.trim() || "تعذّر توليد التحليل."
          return res.status(200).json({
            analysis,
            event_id: currentEventId,
            subject: { number: subject.assigned_number, name: subject.name },
            partner: { number: partner.assigned_number, name: partner.name },
            alternative: alternativeProfile
              ? { number: alternativeProfile.assigned_number, name: alternativeProfile.name, breakdown: alternativeBreakdown, phase: phase === "phase2" ? "phase3" : "phase2" }
              : null,
            actualBreakdown,
            alternativeBreakdown,
            diff,
            largestGapKey,
            feedback: {
              wantConnect: subjectFeedback?.wantConnect ?? null,
              conversationQuality: subjectFeedback?.conversationQuality ?? null,
              personalConnection: subjectFeedback?.personalConnection ?? null,
              compatibilityRate: subjectFeedback?.compatibilityRate ?? null,
              organizerImpression: subjectFeedback?.organizerImpression || null,
            },
            feedbackSignal,
          })
        }
        // e3-delete-feedback — clear all feedback for current event3
        if (action === "e3-delete-feedback") {
          const { error } = await supabase
            .from("event3_matches")
            .update({ phase2_feedback: null, phase3_feedback: null })
            .eq("match_id", EVENT3_MATCH_ID)
            .eq("event_id", currentEventId)
          if (error) return res.status(500).json({ error: error.message })
          return res.status(200).json({ message: "All feedback deleted successfully" })
        }
        // e3-edit-feedback — admin modifies a specific participant's feedback
        if (action === "e3-edit-feedback") {
          const { participant_number, phase, feedback } = req.body
          if (!participant_number) return res.status(400).json({ error: "participant_number required" })
          if (phase !== "phase2" && phase !== "phase3") return res.status(400).json({ error: "phase must be 'phase2' or 'phase3'" })
          if (!feedback || typeof feedback !== "object") return res.status(400).json({ error: "feedback object required" })

          const fbField = phase === "phase2" ? "phase2_feedback" : "phase3_feedback"
          const { error } = await supabase
            .from("event3_matches")
            .update({ [fbField]: feedback })
            .eq("match_id", EVENT3_MATCH_ID)
            .eq("event_id", currentEventId)
            .eq("participant_number", participant_number)
          if (error) return res.status(500).json({ error: error.message })
          return res.status(200).json({ message: "Feedback updated successfully" })
        }
        // e3-swap-match-partner — replace a missing participant with a replacement in phase2 or phase3 matches
        if (action === "e3-swap-match-partner") {
          const { phase, missing_participant, replacement_participant } = req.body
          if (!phase || (phase !== "phase2" && phase !== "phase3")) return res.status(400).json({ error: "phase must be 'phase2' or 'phase3'" })
          if (!missing_participant || !replacement_participant) return res.status(400).json({ error: "missing_participant and replacement_participant required" })
          if (missing_participant === replacement_participant) return res.status(400).json({ error: "Cannot swap with the same participant" })

          const partnerField = phase === "phase2" ? "phase2_partner" : "phase3_partner"
          const scoreField = phase === "phase2" ? "phase2_score" : "phase3_score"

          // Fetch all match rows
          const { data: matchRows } = await supabase.from("event3_matches").select("*").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          if (!matchRows || matchRows.length === 0) return res.status(404).json({ error: "No matches found" })

          const missingRow = matchRows.find(r => r.participant_number === missing_participant)
          const replacementRow = matchRows.find(r => r.participant_number === replacement_participant)

          if (!missingRow) return res.status(404).json({ error: `Participant #${missing_participant} not found in matches` })

          const missingPartner = missingRow[partnerField]
          if (!missingPartner) return res.status(400).json({ error: `Participant #${missing_participant} has no ${phase} match` })

          const replacementPartner = replacementRow?.[partnerField] || null

          // Fetch participant data for score recalculation
          const allNums = [missing_participant, replacement_participant, missingPartner, replacementPartner].filter(Boolean)
          const { data: swapPdata } = await supabase.from("participants").select("assigned_number,name,gender,age,survey_data,mbti_personality_type,attachment_style,communication_style,humor_banter_style,early_openness_comfort,same_gender_preference,any_gender_preference,nationality,prefer_same_nationality,preferred_age_min,preferred_age_max,open_age_preference").eq("match_id", STATIC_MATCH_ID).in("assigned_number", allNums)
          const swapPMap = {}
          for (const p of swapPdata || []) { swapPMap[p.assigned_number] = p }

          // Calculate new scores
          let newScore1 = 50 // replacement ↔ missingPartner
          if (swapPMap[replacement_participant] && swapPMap[missingPartner]) {
            try {
              const compat = await e3FullCalcCompat(swapPMap[replacement_participant], swapPMap[missingPartner])
              if (compat) newScore1 = compat.totalScore
            } catch (e) { console.error(`Swap compat error for #${replacement_participant}×#${missingPartner}:`, e.message) }
          }

          let newScore2 = null // missing ↔ replacementPartner (if replacement was matched)
          if (replacementPartner) {
            newScore2 = 50
            if (swapPMap[missing_participant] && swapPMap[replacementPartner]) {
              try {
                const compat = await e3FullCalcCompat(swapPMap[missing_participant], swapPMap[replacementPartner])
                if (compat) newScore2 = compat.totalScore
              } catch (e) { console.error(`Swap compat error for #${missing_participant}×#${replacementPartner}:`, e.message) }
            }
          }

          // Update match rows
          // 1. missing's row: partner = replacementPartner (or null if replacement was unmatched)
          await supabase.from("event3_matches").update({ [partnerField]: replacementPartner, [scoreField]: newScore2 }).eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", missing_participant)
          // 2. missingPartner's row: partner = replacement
          await supabase.from("event3_matches").update({ [partnerField]: replacement_participant, [scoreField]: newScore1 }).eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", missingPartner)
          // 3. replacement's row: partner = missingPartner
          if (replacementRow) {
            await supabase.from("event3_matches").update({ [partnerField]: missingPartner, [scoreField]: newScore1 }).eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", replacement_participant)
          } else {
            // Replacement doesn't have a row — create one
            await supabase.from("event3_matches").insert({ match_id: EVENT3_MATCH_ID, event_id: currentEventId, participant_number: replacement_participant, [partnerField]: missingPartner, [scoreField]: newScore1 })
          }
          // 4. replacementPartner's row (if exists): partner = missing
          if (replacementPartner) {
            await supabase.from("event3_matches").update({ [partnerField]: missing_participant, [scoreField]: newScore2 }).eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", replacementPartner)
          }

          // If phase2, also swap table assignments in round=20
          {
            const assignmentRound = phase === "phase2" ? 20 : 30
            const { data: missingTable } = await supabase.from("session_assignments").select("id,table_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("round", assignmentRound).eq("participant_id", missing_participant).maybeSingle()
            const { data: replacementTable } = await supabase.from("session_assignments").select("id,table_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("round", assignmentRound).eq("participant_id", replacement_participant).maybeSingle()

            if (missingTable && replacementTable) {
              await supabase.from("session_assignments").update({ table_number: replacementTable.table_number }).eq("id", missingTable.id)
              await supabase.from("session_assignments").update({ table_number: missingTable.table_number }).eq("id", replacementTable.id)
            } else if (missingTable && !replacementTable) {
              await supabase.from("session_assignments").delete().eq("id", missingTable.id)
              await supabase.from("session_assignments").insert({ match_id: EVENT3_MATCH_ID, event_id: currentEventId, round: assignmentRound, table_number: missingTable.table_number, participant_id: replacement_participant })
            } else if (!missingTable && replacementTable) {
              await supabase.from("session_assignments").delete().eq("id", replacementTable.id)
              await supabase.from("session_assignments").insert({ match_id: EVENT3_MATCH_ID, event_id: currentEventId, round: assignmentRound, table_number: replacementTable.table_number, participant_id: missing_participant })
            }
          }

          const msg = replacementPartner
            ? `Swapped: #${replacement_participant} ↔ #${missingPartner} (score: ${newScore1}%), #${missing_participant} ↔ #${replacementPartner} (score: ${newScore2}%)`
            : `Swapped: #${replacement_participant} replaced #${missing_participant} with #${missingPartner} (score: ${newScore1}%). #${missing_participant} is now unmatched.`

          if (phase === "phase3") await refreshEvent3TestMatchResults(currentEventId)
          return res.status(200).json({ message: msg })
        }
        // e3-replace-participant — atomically transfer/swap every event identity,
        // feedback record, locked admin result, and generated table assignment.
        if (action === "e3-replace-participant") {
          const oldNum = Number(req.body.old_participant)
          const newNum = Number(req.body.new_participant)
          if (!Number.isInteger(oldNum) || !Number.isInteger(newNum) || oldNum <= 0 || newNum <= 0 || oldNum === 9999 || newNum === 9999 || oldNum === newNum) {
            return res.status(400).json({ error: "Two different participant numbers are required" })
          }

          const testContext = await getEvent3TestContext()
          const isActiveTestReplacement = testContext.active && testContext.eventId === Number(currentEventId)

          const [eventParticipantsResult, eventMatchesResult, normalResultsResult, profilesResult] = await Promise.all([
            supabase.from("event3_participants").select("participant_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).in("participant_number", [oldNum, newNum]),
            supabase.from("event3_matches").select("participant_number,phase2_partner,phase3_partner").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId),
            isActiveTestReplacement
              ? Promise.resolve({ data: [], error: null })
              : supabase.from("match_results").select("id,participant_a_number,participant_b_number,participant_c_number").eq("match_id", STATIC_MATCH_ID).eq("event_id", currentEventId).or(`participant_a_number.in.(${oldNum},${newNum}),participant_b_number.in.(${oldNum},${newNum})`),
            supabase.from("participants").select("*").eq("match_id", STATIC_MATCH_ID).in("assigned_number", [oldNum, newNum]),
          ])
          const readError = eventParticipantsResult.error || eventMatchesResult.error || normalResultsResult.error || profilesResult.error
          if (readError) return res.status(500).json({ error: readError.message })

          const profileMap = new Map((profilesResult.data || []).map(profile => [Number(profile.assigned_number), profile]))
          if (!profileMap.has(oldNum) || !profileMap.has(newNum)) return res.status(404).json({ error: "Both participants must exist" })
          const swapBoth = (eventParticipantsResult.data || []).some(row => Number(row.participant_number) === newNum)
          const profileNumbers = new Set([oldNum, newNum])
          const eventPairs = collectEventSwapPairs(eventMatchesResult.data || [], oldNum, newNum, swapBoth)
          const normalPairs = collectMatchResultSwapPairs(normalResultsResult.data || [], oldNum, newNum)
          for (const pair of [...eventPairs, ...normalPairs]) {
            profileNumbers.add(pair.a)
            profileNumbers.add(pair.b)
          }

          const missingProfileNumbers = [...profileNumbers].filter(number => !profileMap.has(number))
          if (missingProfileNumbers.length) {
            const { data: partnerProfiles, error: partnerError } = await supabase.from("participants").select("*").eq("match_id", STATIC_MATCH_ID).in("assigned_number", missingProfileNumbers)
            if (partnerError) return res.status(500).json({ error: partnerError.message })
            for (const profile of partnerProfiles || []) profileMap.set(Number(profile.assigned_number), profile)
          }

          const eventScores = []
          for (const pair of eventPairs) {
            const profileA = profileMap.get(pair.a)
            const profileB = profileMap.get(pair.b)
            if (!profileA || !profileB) return res.status(422).json({ error: `Missing matching profile for #${!profileA ? pair.a : pair.b}` })
            const compatibility = await calculateFullCompatibilityWithCache(profileA, profileB, false, false)
            eventScores.push({ phase: pair.phase, a: pair.a, b: pair.b, score: Math.round(Number(compatibility.totalScore || 0)) })
          }

          const normalScores = []
          for (const pair of normalPairs) {
            const profileA = profileMap.get(pair.a)
            const profileB = profileMap.get(pair.b)
            if (!profileA || !profileB) return res.status(422).json({ error: `Missing matching profile for #${!profileA ? pair.a : pair.b}` })
            const compatibility = await calculateFullCompatibilityWithCache(profileA, profileB, false, false)
            normalScores.push({ id: pair.id, a: pair.a, b: pair.b, ...compatibilityResultPayload(compatibility) })
          }

          const { data, error } = await supabase.rpc("replace_event3_participant", {
            p_event3_match_id: EVENT3_MATCH_ID,
            p_static_match_id: STATIC_MATCH_ID,
            p_event_id: currentEventId,
            p_old_participant: oldNum,
            p_new_participant: newNum,
            p_event_scores: eventScores,
            p_match_result_scores: normalScores,
          })
          if (error) {
            if (isMissingAdmin3SwapRpc(error)) {
              return res.status(501).json({ error: "The atomic admin3 swap migration has not been applied yet", migration_required: true })
            }
            return res.status(500).json({ error: error.message })
          }

          if (isActiveTestReplacement) await refreshEvent3TestMatchResults(currentEventId)

          return res.status(200).json({
            ...data,
            message: swapBoth
              ? `تم تبديل #${oldNum} و #${newNum} فوراً في الطاولات والمطابقات والأقفال والتقييمات`
              : `تم استبدال #${oldNum} بـ #${newNum} فوراً في الطاولات والمطابقات والأقفال والتقييمات`,
          })
        }
        // Legacy implementation retained temporarily for old deployments. The
        // atomic handler above returns first for every current request.
        if (false) {
          const { old_participant, new_participant } = req.body
          if (!old_participant || !new_participant) return res.status(400).json({ error: "old_participant and new_participant required" })
          if (old_participant === new_participant) return res.status(400).json({ error: "Cannot replace with the same participant" })

          const oldNum = old_participant
          const newNum = new_participant
          const updates = []

          // 1. event3_participants — swap participant_number
          {
            const { data: oldRow } = await supabase.from("event3_participants").select("id,position").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", oldNum).maybeSingle()
            const { data: newRow } = await supabase.from("event3_participants").select("id,position").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", newNum).maybeSingle()
            if (oldRow) {
              if (newRow) {
                // Both exist — swap their numbers via temp
                await supabase.from("event3_participants").update({ participant_number: -1 }).eq("id", oldRow.id)
                await supabase.from("event3_participants").update({ participant_number: oldNum }).eq("id", newRow.id)
                await supabase.from("event3_participants").update({ participant_number: newNum }).eq("id", oldRow.id)
              } else {
                // New not enrolled — just update old's number to new
                await supabase.from("event3_participants").update({ participant_number: newNum }).eq("id", oldRow.id)
              }
            }
            updates.push("event3_participants")
          }

          // 2. session_assignments — swap participant_id across all rounds
          {
            const { data: oldAssignments } = await supabase.from("session_assignments").select("id,round,table_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("participant_id", oldNum)
            const { data: newAssignments } = await supabase.from("session_assignments").select("id,round,table_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("participant_id", newNum)

            // Build round→assignment maps
            const oldByRound = new Map((oldAssignments || []).map(a => [a.round, a]))
            const newByRound = new Map((newAssignments || []).map(a => [a.round, a]))
            const allRounds = new Set([...oldByRound.keys(), ...newByRound.keys()])

            for (const round of allRounds) {
              const oldA = oldByRound.get(round)
              const newA = newByRound.get(round)
              if (oldA && newA) {
                // Both have assignments in this round — swap via temp
                await supabase.from("session_assignments").update({ participant_id: -1 }).eq("id", oldA.id)
                await supabase.from("session_assignments").update({ participant_id: oldNum }).eq("id", newA.id)
                await supabase.from("session_assignments").update({ participant_id: newNum }).eq("id", oldA.id)
              } else if (oldA && !newA) {
                // Only old has assignment — reassign to new
                await supabase.from("session_assignments").update({ participant_id: newNum }).eq("id", oldA.id)
              } else if (!oldA && newA) {
                // Only new has assignment — reassign to old
                await supabase.from("session_assignments").update({ participant_id: oldNum }).eq("id", newA.id)
              }
            }
            updates.push("session_assignments")
          }

          // 3. event3_matches — swap participant_number and partner references
          {
            const { data: matchRows } = await supabase.from("event3_matches").select("*").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
            const oldMatch = (matchRows || []).find(r => r.participant_number === oldNum)
            const newMatch = (matchRows || []).find(r => r.participant_number === newNum)

            // Swap participant_number on own rows
            if (oldMatch && newMatch) {
              await supabase.from("event3_matches").update({ participant_number: -1 }).eq("id", oldMatch.id)
              await supabase.from("event3_matches").update({ participant_number: oldNum }).eq("id", newMatch.id)
              await supabase.from("event3_matches").update({ participant_number: newNum }).eq("id", oldMatch.id)
            } else if (oldMatch && !newMatch) {
              await supabase.from("event3_matches").update({ participant_number: newNum }).eq("id", oldMatch.id)
            } else if (!oldMatch && newMatch) {
              await supabase.from("event3_matches").update({ participant_number: oldNum }).eq("id", newMatch.id)
            }

            // Update partner references: anyone whose phase2_partner or phase3_partner points to oldNum → newNum, and vice versa
            // First set old→temp for phase2_partner
            const { data: p2OldRefs } = await supabase.from("event3_matches").select("id").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("phase2_partner", oldNum)
            for (const r of p2OldRefs || []) await supabase.from("event3_matches").update({ phase2_partner: -1 }).eq("id", r.id)
            const { data: p2NewRefs } = await supabase.from("event3_matches").select("id").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("phase2_partner", newNum)
            for (const r of p2NewRefs || []) await supabase.from("event3_matches").update({ phase2_partner: oldNum }).eq("id", r.id)
            for (const r of p2OldRefs || []) await supabase.from("event3_matches").update({ phase2_partner: newNum }).eq("id", r.id)

            // phase3_partner
            const { data: p3OldRefs } = await supabase.from("event3_matches").select("id").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("phase3_partner", oldNum)
            for (const r of p3OldRefs || []) await supabase.from("event3_matches").update({ phase3_partner: -1 }).eq("id", r.id)
            const { data: p3NewRefs } = await supabase.from("event3_matches").select("id").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("phase3_partner", newNum)
            for (const r of p3NewRefs || []) await supabase.from("event3_matches").update({ phase3_partner: oldNum }).eq("id", r.id)
            for (const r of p3OldRefs || []) await supabase.from("event3_matches").update({ phase3_partner: newNum }).eq("id", r.id)

            // Recalculate phase3 score for the new participant's pair only
            const refreshedOld = oldMatch ? { ...oldMatch, participant_number: newNum } : null
            const refreshedNew = newMatch ? { ...newMatch, participant_number: oldNum } : null
            // After swap, the "new" person (now holding oldNum's slot) has phase3_partner
            const newPersonMatch = refreshedOld || (matchRows || []).find(r => r.participant_number === newNum)
            if (newPersonMatch?.phase3_partner) {
              const partnerNum = newPersonMatch.phase3_partner
              const { data: partnerPdata } = await supabase.from("participants").select("assigned_number,name,gender,age,survey_data,mbti_personality_type,attachment_style,communication_style,humor_banter_style,early_openness_comfort,same_gender_preference,any_gender_preference,nationality,prefer_same_nationality,preferred_age_min,preferred_age_max,open_age_preference").eq("match_id", STATIC_MATCH_ID).in("assigned_number", [newNum, partnerNum])
              const pMap = {}
              for (const p of partnerPdata || []) pMap[p.assigned_number] = p
              if (pMap[newNum] && pMap[partnerNum]) {
                try {
                  const compat = await e3FullCalcCompat(pMap[newNum], pMap[partnerNum])
                  if (compat) {
                    await supabase.from("event3_matches").update({ phase3_score: compat.totalScore }).eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", newNum)
                    await supabase.from("event3_matches").update({ phase3_score: compat.totalScore }).eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", partnerNum)
                  }
                } catch (e) { console.error(`Replace phase3 score recalc error for #${newNum}×#${partnerNum}:`, e.message) }
              }
            }

            updates.push("event3_matches")
          }

          // 4. participant_rankings — swap ranker_number and ranked_number
          {
            // Swap ranker_number
            const { data: oldRankers } = await supabase.from("participant_rankings").select("id").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("ranker_number", oldNum)
            const { data: newRankers } = await supabase.from("participant_rankings").select("id").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("ranker_number", newNum)
            for (const r of oldRankers || []) await supabase.from("participant_rankings").update({ ranker_number: -1 }).eq("id", r.id)
            for (const r of newRankers || []) await supabase.from("participant_rankings").update({ ranker_number: oldNum }).eq("id", r.id)
            for (const r of oldRankers || []) await supabase.from("participant_rankings").update({ ranker_number: newNum }).eq("id", r.id)

            // Swap ranked_number
            const { data: oldRanked } = await supabase.from("participant_rankings").select("id").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("ranked_number", oldNum)
            const { data: newRanked } = await supabase.from("participant_rankings").select("id").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("ranked_number", newNum)
            for (const r of oldRanked || []) await supabase.from("participant_rankings").update({ ranked_number: -1 }).eq("id", r.id)
            for (const r of newRanked || []) await supabase.from("participant_rankings").update({ ranked_number: oldNum }).eq("id", r.id)
            for (const r of oldRanked || []) await supabase.from("participant_rankings").update({ ranked_number: newNum }).eq("id", r.id)

            updates.push("participant_rankings")
          }

          // 5. Optional group reflections — swap the author and every ranked
          // reference while preserving the unique author row for each round.
          {
            const { data: reflectionRows } = await supabase.from("event3_group_reflections")
              .select("id,ranker_number,ranked_numbers")
              .eq("match_id", EVENT3_MATCH_ID)
              .eq("event_id", currentEventId)
            const oldReflections = (reflectionRows || []).filter(row => row.ranker_number === oldNum)
            const newReflections = (reflectionRows || []).filter(row => row.ranker_number === newNum)
            const swapRankedNumbers = (numbers = []) => numbers.map(number => number === oldNum ? newNum : number === newNum ? oldNum : number)

            for (const row of oldReflections) await supabase.from("event3_group_reflections").update({ ranker_number: -1, ranked_numbers: swapRankedNumbers(row.ranked_numbers) }).eq("id", row.id)
            for (const row of newReflections) await supabase.from("event3_group_reflections").update({ ranker_number: oldNum, ranked_numbers: swapRankedNumbers(row.ranked_numbers) }).eq("id", row.id)
            for (const row of oldReflections) await supabase.from("event3_group_reflections").update({ ranker_number: newNum }).eq("id", row.id)

            const authorRowIds = new Set([...oldReflections, ...newReflections].map(row => row.id))
            for (const row of reflectionRows || []) {
              if (authorRowIds.has(row.id)) continue
              const swapped = swapRankedNumbers(row.ranked_numbers)
              if (swapped.some((number, index) => number !== (row.ranked_numbers || [])[index])) {
                await supabase.from("event3_group_reflections").update({ ranked_numbers: swapped }).eq("id", row.id)
              }
            }
            updates.push("event3_group_reflections")
          }

          // 6. event3_participant_notes — swap participant_number
          {
            const { data: oldNotes } = await supabase.from("event3_participant_notes").select("id").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", oldNum)
            const { data: newNotes } = await supabase.from("event3_participant_notes").select("id").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", newNum)
            for (const r of oldNotes || []) await supabase.from("event3_participant_notes").update({ participant_number: -1 }).eq("id", r.id)
            for (const r of newNotes || []) await supabase.from("event3_participant_notes").update({ participant_number: oldNum }).eq("id", r.id)
            for (const r of oldNotes || []) await supabase.from("event3_participant_notes").update({ participant_number: newNum }).eq("id", r.id)
            updates.push("event3_participant_notes")
          }

          // 6. event3_mood_checks — swap participant_number
          {
            const { data: oldMoods } = await supabase.from("event3_mood_checks").select("id").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", oldNum)
            const { data: newMoods } = await supabase.from("event3_mood_checks").select("id").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", newNum)
            for (const r of oldMoods || []) await supabase.from("event3_mood_checks").update({ participant_number: -1 }).eq("id", r.id)
            for (const r of newMoods || []) await supabase.from("event3_mood_checks").update({ participant_number: oldNum }).eq("id", r.id)
            for (const r of oldMoods || []) await supabase.from("event3_mood_checks").update({ participant_number: newNum }).eq("id", r.id)
            updates.push("event3_mood_checks")
          }

          // 7. event3_notifications — swap participant_number
          {
            const { data: oldNotifs } = await supabase.from("event3_notifications").select("id").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", oldNum)
            const { data: newNotifs } = await supabase.from("event3_notifications").select("id").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", newNum)
            for (const r of oldNotifs || []) await supabase.from("event3_notifications").update({ participant_number: -1 }).eq("id", r.id)
            for (const r of newNotifs || []) await supabase.from("event3_notifications").update({ participant_number: oldNum }).eq("id", r.id)
            for (const r of oldNotifs || []) await supabase.from("event3_notifications").update({ participant_number: newNum }).eq("id", r.id)
            updates.push("event3_notifications")
          }

          // 8. event3_ai_welcome_messages — swap participant_number
          {
            const { data: oldWelcomes } = await supabase.from("event3_ai_welcome_messages").select("id").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", oldNum)
            const { data: newWelcomes } = await supabase.from("event3_ai_welcome_messages").select("id").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", newNum)
            for (const r of oldWelcomes || []) await supabase.from("event3_ai_welcome_messages").update({ participant_number: -1 }).eq("id", r.id)
            for (const r of newWelcomes || []) await supabase.from("event3_ai_welcome_messages").update({ participant_number: oldNum }).eq("id", r.id)
            for (const r of oldWelcomes || []) await supabase.from("event3_ai_welcome_messages").update({ participant_number: newNum }).eq("id", r.id)
            updates.push("event3_ai_welcome_messages")
          }

          return res.status(200).json({
            message: `تم استبدال #${oldNum} بـ #${newNum} في جميع الجداول: ${updates.join("، ")}`,
            updated_tables: updates
          })
        }
        // e3-clear-test-data — clear rankings, feedback, words, and notes (keep participants, seating, matches)
        if (action === "e3-clear-test-data") {
          await Promise.all([
            supabase.from("participant_rankings").delete().eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId),
            supabase.from("event3_group_reflections").delete().eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId),
            supabase.from("event3_participant_notes").delete().eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId),
            supabase.from("event3_mood_checks").delete().eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId),
            supabase.from("event3_notifications").delete().eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId),
            supabase.from("event3_ai_welcome_messages").delete().eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId),
            supabase.from("event3_test_match_results").delete().eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId),
            supabase.from("organizer_requests").delete().eq("event_id", currentEventId),
          ])
          await supabase.from("event3_matches")
            .update({ phase2_feedback: null, phase3_feedback: null, phase2_word: null, phase3_word: null, match_preference: null })
            .eq("match_id", EVENT3_MATCH_ID)
            .eq("event_id", currentEventId)
          return res.status(200).json({ message: "Test data cleared: rankings, feedback, words, and notes removed. Participants, seating, and matches preserved." })
        }
        // e3-clear-mood-checks
        if (action === "e3-clear-mood-checks") {
          const { error } = await supabase.from("event3_mood_checks").delete().eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          if (error) return res.status(500).json({ error: error.message })
          return res.status(200).json({ message: "Mood checks cleared" })
        }
        // e3-trigger-mood-check
        if (action === "e3-trigger-mood-check") {
          const { target_number } = req.body // if provided, send to one person; otherwise all
          const checkId = crypto.randomUUID()
          if (target_number) {
            // Single participant
            const { error } = await supabase.from("event3_mood_checks").insert({
              match_id: EVENT3_MATCH_ID, event_id: currentEventId, check_id: checkId, participant_number: parseInt(target_number)
            })
            if (error) return res.status(500).json({ error: error.message })
            return res.status(200).json({ check_id: checkId, sent_to: 1 })
          } else {
            // All selected participants
            const { data: ep } = await supabase.from("event3_participants").select("participant_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
            if (!ep || ep.length === 0) return res.status(400).json({ error: "No participants selected" })
            const rows = ep.map(r => ({ match_id: EVENT3_MATCH_ID, event_id: currentEventId, check_id: checkId, participant_number: r.participant_number }))
            const { error } = await supabase.from("event3_mood_checks").insert(rows)
            if (error) return res.status(500).json({ error: error.message })
            return res.status(200).json({ check_id: checkId, sent_to: ep.length })
          }
        }
        // e3-get-mood-checks
        if (action === "e3-get-mood-checks") {
          const { check_id } = req.body
          let query = supabase.from("event3_mood_checks").select("check_id,participant_number,mood,triggered_at,answered_at").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).order("triggered_at", { ascending: false })
          if (check_id) query = query.eq("check_id", check_id)
          const { data, error } = await query.limit(200)
          if (error) return res.status(500).json({ error: error.message })
          // Fetch participant names
          const nums = [...new Set((data || []).map(r => r.participant_number))]
          const { data: pdata } = await supabase.from("participants").select("assigned_number,name").eq("match_id", STATIC_MATCH_ID).in("assigned_number", nums)
          const nameMap = {}
          for (const p of pdata || []) { nameMap[p.assigned_number] = (p.name || "").trim().split(/\s+/)[0] || `#${p.assigned_number}` }
          // Group by check_id
          const groups = {}
          for (const r of data || []) {
            if (!groups[r.check_id]) groups[r.check_id] = { check_id: r.check_id, triggered_at: r.triggered_at, entries: [] }
            groups[r.check_id].entries.push({ participant_number: r.participant_number, participant_name: nameMap[r.participant_number] || `#${r.participant_number}`, mood: r.mood, answered_at: r.answered_at })
          }
          const result = Object.values(groups).sort((a, b) => new Date(b.triggered_at) - new Date(a.triggered_at))
          return res.status(200).json({ checks: result })
        }
        // e3-send-notification
        if (action === "e3-send-notification") {
          const { target_number, title, body, icon } = req.body
          if (!title) return res.status(400).json({ error: "title required" })
          const notifId = crypto.randomUUID()
          const iconVal = icon || "info"
          if (target_number) {
            const { error } = await supabase.from("event3_notifications").insert({
              match_id: EVENT3_MATCH_ID, event_id: currentEventId, notif_id: notifId, participant_number: parseInt(target_number), title, body: body || null, icon: iconVal
            })
            if (error) return res.status(500).json({ error: error.message })
            return res.status(200).json({ notif_id: notifId, sent_to: 1 })
          } else {
            const { data: ep } = await supabase.from("event3_participants").select("participant_number").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
            if (!ep || ep.length === 0) return res.status(400).json({ error: "No participants selected" })
            const rows = ep.map(r => ({ match_id: EVENT3_MATCH_ID, event_id: currentEventId, notif_id: notifId, participant_number: r.participant_number, title, body: body || null, icon: iconVal }))
            const { error } = await supabase.from("event3_notifications").insert(rows)
            if (error) return res.status(500).json({ error: error.message })
            return res.status(200).json({ notif_id: notifId, sent_to: ep.length })
          }
        }
        // e3-get-notifications
        if (action === "e3-get-notifications") {
          const { data, error } = await supabase.from("event3_notifications")
            .select("notif_id,participant_number,title,body,icon,created_at,seen_at")
            .eq("match_id", EVENT3_MATCH_ID)
            .eq("event_id", currentEventId)
            .order("created_at", { ascending: false })
            .limit(200)
          if (error) return res.status(500).json({ error: error.message })
          const nums = [...new Set((data || []).map(r => r.participant_number))]
          const { data: pdata } = await supabase.from("participants").select("assigned_number,name").eq("match_id", STATIC_MATCH_ID).in("assigned_number", nums)
          const nameMap = {}
          for (const p of pdata || []) { nameMap[p.assigned_number] = (p.name || "").trim().split(/\s+/)[0] || `#${p.assigned_number}` }
          const groups = {}
          for (const r of data || []) {
            if (!groups[r.notif_id]) groups[r.notif_id] = { notif_id: r.notif_id, title: r.title, body: r.body, icon: r.icon, created_at: r.created_at, entries: [] }
            groups[r.notif_id].entries.push({ participant_number: r.participant_number, participant_name: nameMap[r.participant_number] || `#${r.participant_number}`, seen_at: r.seen_at })
          }
          const result = Object.values(groups).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          return res.status(200).json({ notifications: result })
        }
        // e3-clear-notifications
        if (action === "e3-clear-notifications") {
          const { error } = await supabase.from("event3_notifications").delete().eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
          if (error) return res.status(500).json({ error: error.message })
          return res.status(200).json({ message: "Notifications cleared" })
        }
        // e3-reset-event — reset ONLY current event_id data (preserves other events)
        if (action === "e3-reset-event") {
          await Promise.all([
            supabase.from("event3_participants").delete().eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId),
            supabase.from("event3_matches").delete().eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId),
            supabase.from("session_assignments").delete().eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId),
            supabase.from("participant_rankings").delete().eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId),
            supabase.from("event3_group_reflections").delete().eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId),
            supabase.from("event3_mood_checks").delete().eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId),
            supabase.from("event3_notifications").delete().eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId),
            supabase.from("event3_ai_welcome_messages").delete().eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId),
          ])
          // Reset phase/timer for EVENT3 but preserve current_event_id
          await supabase.from("event_state").update({ phase: "setup", global_timer_active: false, global_timer_start_time: null, global_timer_duration: null, global_timer_round: null, phase2_score_revealed: false, phase3_score_revealed: false }).eq("match_id", EVENT3_MATCH_ID)
          return res.status(200).json({ message: `Event ${currentEventId} reset successfully (other events preserved)` })
        }

        // e3-get-attendance — fetch event3 participants with attendance + match info
        if (action === "e3-get-attendance") {
          try {
            const { data: ep } = await supabase.from("event3_participants").select("participant_number,position").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).order("position", { ascending: true })
            if (!ep || ep.length === 0) return res.status(200).json({ participants: [], attended: 0, total: 0 })

            const numbers = ep.map(r => r.participant_number)

            // Fetch participant details
            const { data: pdata } = await supabase.from("participants").select("assigned_number,name,gender,age").eq("match_id", STATIC_MATCH_ID).in("assigned_number", numbers)
            const infoMap = {}
            for (const p of pdata || []) infoMap[p.assigned_number] = p

            // Fetch phase2 matches
            const { data: matchRows } = await supabase.from("event3_matches").select("participant_number,phase2_partner").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId)
            const matchMap = {}
            for (const m of matchRows || []) {
              matchMap[m.participant_number] = m.phase2_partner
              if (m.phase2_partner) matchMap[m.phase2_partner] = m.participant_number
            }

            // Fetch attendance (event_id=3 for event3)
            const { data: attendanceRows } = await supabase.from("event_attendance").select("participant_number,attended").eq("match_id", STATIC_MATCH_ID).eq("event_id", currentEventId).in("participant_number", numbers)
            const attendanceMap = {}
            for (const a of attendanceRows || []) attendanceMap[a.participant_number] = !!a.attended

            const participants = numbers.map(num => ({
              number: num,
              name: infoMap[num]?.name || `#${num}`,
              gender: infoMap[num]?.gender || null,
              age: infoMap[num]?.age || null,
              matched_with: matchMap[num] || null,
              attended: attendanceMap[num] || false,
            }))

            const attended = participants.filter(p => p.attended).length
            return res.status(200).json({ participants, attended, total: participants.length })
          } catch (e) {
            console.error("Error in e3-get-attendance:", e)
            return res.status(500).json({ error: "Failed to fetch attendance" })
          }
        }

        // e3-set-attendance — toggle attendance for an event3 participant
        if (action === "e3-set-attendance") {
          try {
            const { participant_number, attended } = req.body
            const pNum = Number(participant_number)
            if (!Number.isFinite(pNum) || pNum <= 0 || pNum === 9999) {
              return res.status(400).json({ error: "Invalid participant_number" })
            }
            const { data, error } = await supabase
              .from("event_attendance")
              .upsert({
                match_id: STATIC_MATCH_ID,
                event_id: currentEventId,
                participant_number: pNum,
                attended: !!attended,
                updated_at: new Date().toISOString(),
                updated_by: "cohost"
              }, { onConflict: "match_id, event_id, participant_number" })
              .select("participant_number, attended")
              .single()
            if (error) {
              console.error("e3-set-attendance error:", error)
              return res.status(500).json({ error: error.message })
            }
            return res.status(200).json({ success: true, participant_number: data?.participant_number || pNum, attended: data?.attended ?? !!attended })
          } catch (e) {
            console.error("Error in e3-set-attendance:", e)
            return res.status(500).json({ error: "Failed to set attendance" })
          }
        }

        // e3-start-test-mode — select 18M+18F valid participants, maximize cached pairs,
        // keep cache misses read-only, and restore the pre-test runtime on exit
        if (action === "e3-start-test-mode") {
          // 1. Fetch all participants with full data
          const { data: allP, error: allErr } = await supabase.from("participants")
            .select("assigned_number,name,gender,age,phone_number,survey_data,mbti_personality_type,attachment_style,communication_style,humor_banter_style,early_openness_comfort,same_gender_preference,any_gender_preference,nationality,prefer_same_nationality,preferred_age_min,preferred_age_max,open_age_preference,secure_token")
            .eq("match_id", STATIC_MATCH_ID)
            .neq("assigned_number", 9999)
            .order("assigned_number", { ascending: true })

          if (allErr) return res.status(500).json({ error: allErr.message })
          if (!allP || allP.length < 36) return res.status(400).json({ error: `Need at least 36 participants with complete surveys, found ${allP?.length || 0}` })

          // 2. Filter to valid (complete survey) participants
          const valid = allP.filter(p => {
            try { if (typeof p.survey_data === "string") p.survey_data = JSON.parse(p.survey_data || "{}") } catch {}
            return isParticipantComplete(p)
          })

          const males = valid.filter(p => (p.gender || "").toLowerCase().startsWith("m"))
          const females = valid.filter(p => (p.gender || "").toLowerCase().startsWith("f"))

          if (males.length < 18 || females.length < 18) {
            return res.status(400).json({ error: `Need 18 males and 18 females with complete surveys. Found ${males.length}M / ${females.length}F.` })
          }

          // 3. Greedy cluster selection: pick 18M+18F maximizing intra-group cached pairs.
          //    The compatibility_cache is global (no match_id) and only stores pairs that
          //    were actually computed during previous events (seating table groups + 1:1
          //    matching). Not all 630 pairs among 36 people will be cached — we maximize
          //    cache hits; misses remain in-memory and are never persisted.
          const validNums = valid.map(p => p.assigned_number)
          const { data: allCachedPairs } = await supabase.from("compatibility_cache")
            .select("participant_a_number,participant_b_number")
            .or(`participant_a_number.in.(${validNums.join(",")}),participant_b_number.in.(${validNums.join(",")})`)
          const validSet = new Set(validNums)

          // Build adjacency of cached pairs among valid participants only.
          const adj = new Map() // num -> Set(cached neighbor nums)
          for (const num of validNums) adj.set(num, new Set())
          for (const c of allCachedPairs || []) {
            const a = c.participant_a_number, b = c.participant_b_number
            if (validSet.has(a) && validSet.has(b) && a !== b) {
              adj.get(a).add(b)
              adj.get(b).add(a)
            }
          }

          const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]] } return arr }
          const degree = (num) => adj.get(num)?.size || 0

          const needM = 18, needF = 18
          const maleSet = new Set(males.map(p => p.assigned_number))
          const femaleSet = new Set(females.map(p => p.assigned_number))
          const selectedSet = new Set()
          let countM = 0, countF = 0

          const pool = shuffle([...validNums]).filter(n => maleSet.has(n) || femaleSet.has(n))

          // Seed: highest-degree participant overall
          const seed = [...pool].sort((a, b) => degree(b) - degree(a))[0]
          if (seed != null) {
            selectedSet.add(seed)
            if (maleSet.has(seed)) countM++; else countF++
          }

          const connectionsToSelected = (num) => {
            let cnt = 0
            const nbrs = adj.get(num)
            if (!nbrs) return 0
            for (const s of selectedSet) if (nbrs.has(s)) cnt++
            return cnt
          }

          // Greedily add participants that maximize cached connections to already-selected
          while (countM < needM || countF < needF) {
            let best = null, bestConn = -1, bestDeg = -1
            for (const num of pool) {
              if (selectedSet.has(num)) continue
              const isMale = maleSet.has(num)
              if (isMale && countM >= needM) continue
              if (!isMale && countF >= needF) continue
              const conn = connectionsToSelected(num)
              const deg = degree(num)
              if (conn > bestConn || (conn === bestConn && deg > bestDeg)) {
                bestConn = conn; bestDeg = deg; best = num
              }
            }
            if (best == null) break
            selectedSet.add(best)
            if (maleSet.has(best)) countM++; else countF++
          }

          // Top up if needed (sparse cache)
          if (countM < needM) {
            for (const p of shuffle([...males])) { if (countM >= needM) break; if (!selectedSet.has(p.assigned_number)) { selectedSet.add(p.assigned_number); countM++ } }
          }
          if (countF < needF) {
            for (const p of shuffle([...females])) { if (countF >= needF) break; if (!selectedSet.has(p.assigned_number)) { selectedSet.add(p.assigned_number); countF++ } }
          }

          const selectedNums = [...selectedSet]
          const selected = selectedNums.map(num => valid.find(p => p.assigned_number === num)).filter(Boolean)

          // 4. Measure cache coverage without changing it. Test mode must leave
          // compatibility history and usage statistics exactly as it found them.
          const cachedSet = new Set()
          for (const c of allCachedPairs || []) {
            if (validSet.has(c.participant_a_number) && validSet.has(c.participant_b_number)) {
              const [a, b] = [c.participant_a_number, c.participant_b_number].sort((x, y) => x - y)
              cachedSet.add(`${a}-${b}`)
            }
          }

          const missingPairs = []
          let cacheHits = 0, totalPairs = 0
          for (let i = 0; i < selectedNums.length; i++) {
            for (let j = i + 1; j < selectedNums.length; j++) {
              const [a, b] = [selectedNums[i], selectedNums[j]].sort((x, y) => x - y)
              totalPairs++
              if (cachedSet.has(`${a}-${b}`)) {
                cacheHits++
              } else {
                missingPairs.push([a, b])
              }
            }
          }

          const cacheMisses = missingPairs.length
          const cachePct = totalPairs > 0 ? Math.round((cacheHits / totalPairs) * 100) : 0

          // Historical preview selection must never redirect the live test
          // runtime. Test mode always belongs to the actual current event.
          if (Number(currentEventId) !== Number(realEventId)) {
            return res.status(409).json({ error: `Test mode can only start for the current event (${realEventId})` })
          }

          // Self-heal legacy state where the main admin advanced events but
          // Event3's dedicated state row did not. This is safe only while test
          // mode is inactive; an active snapshot must never be redirected.
          const { data: testEvent3State, error: testEvent3StateError } = await supabase
            .from("event_state")
            .select("current_event_id,test_mode_active")
            .eq("match_id", EVENT3_MATCH_ID)
            .maybeSingle()
          if (testEvent3StateError) return res.status(500).json({ error: testEvent3StateError.message })
          if (testEvent3State?.test_mode_active === true) {
            return res.status(409).json({ error: "Event3 test mode is already active", test_mode: true })
          }
          if (testEvent3State && Number(testEvent3State.current_event_id) !== Number(currentEventId)) {
            const { error: syncEventError } = await supabase.from("event_state").update({
              current_event_id: Number(currentEventId),
              phase: "setup",
              global_timer_active: false,
              global_timer_start_time: null,
              global_timer_duration: null,
              global_timer_round: null,
              phase2_score_revealed: false,
              phase3_score_revealed: false,
            }).eq("match_id", EVENT3_MATCH_ID).eq("test_mode_active", false)
            if (syncEventError) return res.status(500).json({ error: `Event3 event sync failed: ${syncEventError.message}` })
          }

          // 5. Atomically snapshot the current Event3 runtime, replace it with
          // the selected test roster, and activate test mode. If anything
          // fails, Postgres rolls back the entire transition.
          const { data: testStartResult, error: testStartError } = await supabase.rpc("begin_event3_test_mode", {
            p_event_id: Number(currentEventId),
            p_participant_numbers: selectedNums,
          })
          if (testStartError) {
            const message = `${testStartError.message || ""} ${testStartError.details || ""}`
            const migrationRequired = testStartError.code === "PGRST202" || message.includes("begin_event3_test_mode")
            return res.status(migrationRequired ? 501 : 500).json({
              error: migrationRequired
                ? `The isolated test-results migration must be applied before starting test mode. ${testStartError.message}`
                : testStartError.message,
              migration_required: migrationRequired,
            })
          }

          // 8. Build test users list
          const testUsers = selected.map(p => ({
            number: p.assigned_number,
            name: p.name || `#${p.assigned_number}`,
            gender: p.gender || "?",
            age: p.age || "?",
            phone: p.phone_number || null,
            token: p.secure_token,
          }))

          // 9. Diagnostics
          const checks = []
          const healthy = true

          checks.push({ name: "participant_selection", status: "ok", message: `${selectedNums.length} participants selected (18M + 18F)` })

          const missingSurvey = selectedNums.filter(num => {
            const p = selected.find(s => s.assigned_number === num)
            return !isParticipantComplete(p)
          })
          if (missingSurvey.length > 0) {
            checks.push({ name: "survey_data", status: "warn", message: `${missingSurvey.length} participants with incomplete survey: #${missingSurvey.join(", #")}` })
          } else {
            checks.push({ name: "survey_data", status: "ok", message: "All 36 participants have complete survey data" })
          }

          if (cachePct < 100) {
            checks.push({ name: "compatibility_cache", status: "ok", message: `${cacheHits}/${totalPairs} pairs already cached (${cachePct}%); ${cacheMisses} misses remain read-only in test mode` })
          } else {
            checks.push({ name: "compatibility_cache", status: "ok", message: `${cacheHits}/${totalPairs} pairs already cached (100%)` })
          }

          checks.push({ name: "gender_balance", status: "ok", message: `18 males / 18 females — balanced` })
          checks.push({ name: "event_state", status: "ok", message: "Event state reset to setup phase" })

          checks.push({ name: "test_isolation", status: "ok", message: "Test mode does not write compatibility cache or real match history" })

          return res.status(200).json({
            test_mode: true,
            selected_count: selectedNums.length,
            runtime_snapshot: testStartResult,
            cache_coverage: { hits: cacheHits, total: totalPairs, percent: cachePct, misses: cacheMisses, pre_computed: 0, pre_compute_errors: 0 },
            checks,
            healthy,
            test_users: testUsers,
            message: `Test mode started with ${selectedNums.length} participants (18M+18F). ${cacheHits}/${totalPairs} pairs were already cached (${cachePct}%); no persistent cache or match history was changed.`,
          })
        }

        // e3-end-test-mode — delete all test data and exit test mode
        if (action === "e3-end-test-mode") {
          const { data: stateRow } = await supabase.from("event_state").select("test_mode_active").eq("match_id", EVENT3_MATCH_ID).single()

          if (!stateRow?.test_mode_active) {
            return res.status(400).json({ error: "Test mode is not active" })
          }

          // Atomically delete the test runtime/results and restore the exact
          // Event3 lineup, assignments, feedback, notes, and state snapshot
          // that existed before testing began.
          const { data: restoreResult, error: restoreError } = await supabase.rpc("end_event3_test_mode", {
            p_event_id: Number(currentEventId),
          })
          if (restoreError) {
            return res.status(500).json({
              error: `Could not restore the pre-test Event3 runtime; test mode remains active. ${restoreError.message}`,
            })
          }

          return res.status(200).json({
            message: restoreResult?.legacy_cleanup
              ? "Legacy test mode ended and all temporary data was deleted. This older session had no pre-test runtime snapshot to restore."
              : "Test mode ended. All temporary data was deleted and the pre-test Event3 runtime was restored.",
            restored: restoreResult,
          })
        }

        // e3-get-test-mode — check if test mode is active
        if (action === "e3-get-test-mode") {
          const { data: stateRow } = await supabase.from("event_state").select("test_mode_active,test_mode_snapshot,current_event_id").eq("match_id", EVENT3_MATCH_ID).single()
          if (!stateRow?.test_mode_active) {
            return res.status(200).json({ test_mode: false })
          }

          // Return test users from current event3_participants so panel survives refresh
          const eventId = stateRow?.current_event_id || currentEventId
          const { data: ep } = await supabase.from("event3_participants")
            .select("participant_number,position")
            .eq("match_id", EVENT3_MATCH_ID).eq("event_id", eventId)
            .order("position", { ascending: true })

          const nums = (ep || []).map(e => e.participant_number)
          let testUsers = []
          if (nums.length > 0) {
            const { data: pInfos } = await supabase.from("participants")
              .select("assigned_number,name,gender,age,phone_number,secure_token")
              .eq("match_id", STATIC_MATCH_ID).in("assigned_number", nums)
            testUsers = nums.map(num => {
              const p = (pInfos || []).find(x => x.assigned_number === num)
              return { number: num, name: p?.name || `#${num}`, gender: p?.gender || "?", age: p?.age || "?", phone: p?.phone_number || null, token: p?.secure_token }
            })
          }

          return res.status(200).json({
            test_mode: true,
            started_at: stateRow?.test_mode_snapshot?.started_at || null,
            test_users: testUsers,
          })
        }

        // e3-ai-welcome-list — list all participants with their AI welcome status
        if (action === "e3-ai-welcome-list") {
          const { data: eps, error: epErr } = await supabase.from("event3_participants").select("participant_number,position").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).order("position", { ascending: true })
          if (epErr) return res.status(500).json({ error: epErr.message })
          const numbers = (eps || []).map(r => r.participant_number)
          if (numbers.length === 0) return res.status(200).json({ participants: [] })

          const [pInfosRes, welcomesRes] = await Promise.all([
            supabase.from("participants").select("assigned_number,name,gender,age,survey_data,secure_token").eq("match_id", STATIC_MATCH_ID).in("assigned_number", numbers),
            supabase.from("event3_ai_welcome_messages").select("participant_number,welcome_message").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).in("participant_number", numbers),
          ])
          if (pInfosRes.error) return res.status(500).json({ error: pInfosRes.error.message })

          const welcomeMap = {}
          for (const w of (welcomesRes.data || [])) welcomeMap[w.participant_number] = w.welcome_message

          const result = numbers.map(num => {
            const p = (pInfosRes.data || []).find(x => x.assigned_number === num)
            const sd = typeof p?.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p?.survey_data || {})
            const welcome = welcomeMap[num] || null
            return {
              number: num,
              name: p?.name || `#${num}`,
              gender: p?.gender || "?",
              age: p?.age || "?",
              has_welcome: !!welcome,
              welcome,
              has_survey: !!(sd && Object.keys(sd).length > 0),
            }
          })
          return res.status(200).json({ participants: result })
        }

        // e3-ai-welcome-generate — generate for specific participants (batch)
        if (action === "e3-ai-welcome-generate") {
          const { participant_numbers, regenerate = false } = req.body
          const requestedNums = Array.isArray(participant_numbers) ? participant_numbers : [participant_numbers]
          const nums = [...new Set(requestedNums.map(Number).filter(num => Number.isInteger(num) && num > 0))]
          if (nums.length === 0) return res.status(400).json({ error: "No participants specified" })

          const [pInfosRes, currentWelcomesRes, priorWelcomesRes] = await Promise.all([
            supabase.from("participants").select("assigned_number,name,gender,age,survey_data,secure_token").eq("match_id", STATIC_MATCH_ID).in("assigned_number", nums),
            supabase.from("event3_ai_welcome_messages").select("participant_number,welcome_message").eq("match_id", EVENT3_MATCH_ID).eq("event_id", currentEventId).in("participant_number", nums),
            supabase.from("event3_ai_welcome_messages").select("participant_number,welcome_message,anchor_used,event_id").eq("match_id", EVENT3_MATCH_ID).in("participant_number", nums).neq("event_id", currentEventId),
          ])
          if (pInfosRes.error) return res.status(500).json({ error: pInfosRes.error.message })
          if (currentWelcomesRes.error) return res.status(500).json({ error: currentWelcomesRes.error.message })
          if (priorWelcomesRes.error) return res.status(500).json({ error: priorWelcomesRes.error.message })

          const participantMap = new Map((pInfosRes.data || []).map(p => [p.assigned_number, p]))
          const currentWelcomeMap = new Map((currentWelcomesRes.data || []).map(w => [w.participant_number, w]))
          const priorWelcomeMap = new Map()
          for (const welcome of priorWelcomesRes.data || []) {
            if (!priorWelcomeMap.has(welcome.participant_number)) priorWelcomeMap.set(welcome.participant_number, [])
            priorWelcomeMap.get(welcome.participant_number).push(welcome)
          }

          const resultByNumber = new Map()
          const generationJobs = []
          for (const num of nums) {
            const p = participantMap.get(num)
            if (!p) {
              resultByNumber.set(num, { number: num, status: "error", error: "Not found" })
              continue
            }

            const cachedWelcome = currentWelcomeMap.get(num)
            if (cachedWelcome?.welcome_message && !regenerate) {
              resultByNumber.set(num, { number: num, name: p.name, status: "cached", welcome: cachedWelcome.welcome_message })
              continue
            }

            generationJobs.push({ num, p })
          }

          const generatedRows = []
          const generatedResults = new Map()
          const WELCOME_CONCURRENCY = 12
          for (let start = 0; start < generationJobs.length; start += WELCOME_CONCURRENCY) {
            const chunk = generationJobs.slice(start, start + WELCOME_CONCURRENCY)
            const settled = await Promise.allSettled(chunk.map(async ({ num, p }) => {
              const sd = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {})
              const firstName = (p.name || sd?.answers?.name || sd?.name || "").trim().split(/\s+/)[0] || "صديقنا"
              const gender = p.gender || sd?.answers?.gender || sd?.gender || ""
              const age = p.age || sd?.answers?.age || sd?.age || ""
              const priorWelcomes = priorWelcomeMap.get(num) || []
              const priorMessages = priorWelcomes.map(w => w.welcome_message).filter(Boolean)
              const priorAnchors = [...new Set(priorWelcomes.flatMap(w => (w.anchor_used || "").split(",").filter(Boolean)))]
              const { prompt, anchorsUsed } = buildWelcomePrompt({
                participantNum: num,
                firstName,
                gender,
                age,
                surveyData: sd,
                priorAnchors,
                priorMessages,
              })

              const completion = await openai.chat.completions.create({
                model: "gpt-5.4-mini",
                messages: [{ role: "user", content: prompt }],
                max_completion_tokens: 400,
                temperature: 0.95,
                presence_penalty: 0.8,
                frequency_penalty: 0.5,
              })
              const message = completion.choices[0]?.message?.content?.trim()
              if (!message) throw new Error("Empty response")

              return {
                num,
                firstName,
                result: { number: num, name: p.name, status: "generated", welcome: message },
                row: {
                  match_id: EVENT3_MATCH_ID,
                  event_id: currentEventId,
                  participant_number: num,
                  welcome_message: message,
                  generated_by: 'admin',
                  anchor_used: anchorsUsed.join(","),
                },
                anchorsUsed,
              }
            }))

            settled.forEach((outcome, index) => {
              const { num, p } = chunk[index]
              if (outcome.status === 'fulfilled') {
                generatedRows.push(outcome.value.row)
                generatedResults.set(num, outcome.value.result)
                console.log(`[ai-welcome-batch] Generated for #${num} (${outcome.value.firstName}) — anchors: ${outcome.value.anchorsUsed.join(",")}`)
              } else {
                const message = outcome.reason?.message || "Generation failed"
                console.error(`[ai-welcome-batch] Error for #${num}:`, message)
                resultByNumber.set(num, { number: num, name: p.name, status: "error", error: message })
              }
            })
          }

          if (generatedRows.length > 0) {
            const { error: upsertError } = await supabase
              .from("event3_ai_welcome_messages")
              .upsert(generatedRows, { onConflict: 'match_id,event_id,participant_number' })
            if (upsertError) {
              for (const [num, generatedResult] of generatedResults) {
                resultByNumber.set(num, { number: num, name: generatedResult.name, status: "error", error: upsertError.message })
              }
            } else {
              for (const [num, generatedResult] of generatedResults) resultByNumber.set(num, generatedResult)
            }
          }

          const results = nums.map(num => resultByNumber.get(num))
          return res.status(200).json({
            results,
            generated: results.filter(result => result?.status === 'generated').length,
            cached: results.filter(result => result?.status === 'cached').length,
            errors: results.filter(result => result?.status === 'error').length,
            concurrency: WELCOME_CONCURRENCY,
          })
        }

        // e3-ai-welcome-delete — delete a welcome message for a participant
        if (action === "e3-ai-welcome-delete") {
          const { participant_number } = req.body
          if (!participant_number) return res.status(400).json({ error: "Missing participant_number" })

          const { error } = await supabase.from("event3_ai_welcome_messages")
            .delete()
            .eq("match_id", EVENT3_MATCH_ID)
            .eq("event_id", currentEventId)
            .eq("participant_number", participant_number)
          if (error) return res.status(500).json({ error: error.message })

          return res.status(200).json({ success: true })
        }

        // e3-ai-welcome-edit — manually edit a welcome message for a participant
        if (action === "e3-ai-welcome-edit") {
          const { participant_number, welcome_message } = req.body
          if (!participant_number) return res.status(400).json({ error: "Missing participant_number" })
          if (!welcome_message || !welcome_message.trim()) return res.status(400).json({ error: "Missing welcome_message" })

          const { error: upErr } = await supabase.from("event3_ai_welcome_messages")
            .upsert({
              match_id: EVENT3_MATCH_ID,
              event_id: currentEventId,
              participant_number: Number(participant_number),
              welcome_message: welcome_message.trim(),
              generated_by: 'admin',
            }, { onConflict: 'match_id, event_id, participant_number' })
          if (upErr) return res.status(500).json({ error: upErr.message })

          return res.status(200).json({ success: true, participant_number: Number(participant_number), welcome: welcome_message.trim() })
        }

        return res.status(400).json({ error: `Unknown e3 action: ${action}` })
      } catch (e3err) {
        console.error("e3 admin error:", e3err)
        return res.status(500).json({ error: e3err.message || "Internal server error" })
      }
    }

    return res.status(405).json({ error: "Unsupported method or action" })

  } catch (error) {
    console.error("Error processing request:", error)
    return res.status(500).json({ error: "Failed to process the request" })
  }
}
