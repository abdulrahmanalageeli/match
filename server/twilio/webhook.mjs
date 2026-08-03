import { createClient } from "@supabase/supabase-js"
import crypto from "crypto"
import { normalizeInboundAction, resolveInboundAction } from "./inbound-actions.mjs"

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabaseFallbackKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

// This webhook is server-only. Receipt uploads require the service-role key so
// Storage RLS can remain closed to public/anonymous uploads.
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey || supabaseFallbackKey)

const STATIC_MATCH_ID = "00000000-0000-0000-0000-000000000000"

// Twilio credentials for sending replies
const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const sender = process.env.TWILIO_WHATSAPP_SENDER || "whatsapp:+13527387477"
const statusCallbackUrl = process.env.TWILIO_STATUS_CALLBACK_URL || "https://blindmatch.app/api/twilio-status"
const inboundWebhookUrl = process.env.TWILIO_WEBHOOK_URL || "https://blindmatch.app/api/twilio-webhook"

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

const DEFAULT_RESPONSES = {
  attendance_payment_pending: "✅ تم تسجيل رغبتك بالحضور للمشارك رقم {participant_number}.\n\nلإكمال تأكيد المقعد، يرجى تحويل الرسوم المطلوبة وقدرها *{price} ريال* ({price_label}) ثم إرسال صورة الإيصال أو ملف PDF هنا.\n\n🏦 طرق الدفع:\n• STC Pay: {stc_pay}\n• {bank_name}\n• IBAN: {iban}\n\nيصبح المقعد مؤكداً نهائياً بعد مراجعة الإيصال.",
  attendance_paid: "✅ تم تسجيل حضورك، ومقعدك مؤكد لأن دفعتك معتمدة.",
  attendance_waived: "✅ تم تسجيل حضورك، ومقعدك مؤكد بإعفاء من الدفع من المنظم.",
  attendance_denied: "تم تسجيل اعتذاركم مباشرة 🙏 شكراً لكم، ونرحب بكم في فعاليات قادمة!",
  attendance_confirmation_pending: "✅ استلمنا طلب تأكيد حضورك. الطلب الآن بانتظار اعتماد المنظم، ولن تتغير حالة حضورك حتى تتم مراجعته.",
  attendance_denial_pending: "🙏 استلمنا اعتذارك عن الحضور. الطلب الآن بانتظار اعتماد المنظم، ولن تتغير حالة حضورك حتى تتم مراجعته.",
  gender_any: "✅ تم تحديث تفضيلك إلى: *أي جنس*. سنعتمد هذا الاختيار في المطابقة القادمة.",
  gender_same: "✅ تم تحديث تفضيلك إلى: *نفس الجنس*. سنعتمد هذا الاختيار في المطابقة القادمة.",
  gender_different: "✅ تم تحديث تفضيلك إلى: *جنس مختلف*. سنعتمد هذا الاختيار في المطابقة القادمة.",
  age_expand_2: "✅ تم توسيع نطاق العمر بمقدار سنتين لهذه الفعالية فقط. لم نغيّر تفضيلك الأساسي.",
  age_expand_5: "✅ تم توسيع نطاق العمر بمقدار 5 سنوات لهذه الفعالية فقط. لم نغيّر تفضيلك الأساسي.",
  age_keep_current: "✅ تم الإبقاء على نطاق العمر الحالي بدون أي تغيير.",
  discount_interested: "✅ سجلنا اهتمامك بالعرض، وسيتابع معك المنظم قريباً.",
  discount_declined: "تم تسجيل ردك، ولن نعتمد العرض لك. شكراً لإبلاغنا 🙏",
  arrival_on_way: "✅ تم تسجيل أنك في الطريق. سنحافظ على مقعدك، وننتظرك قريباً.",
  arrival_late: "✅ تم تسجيل أنك ستتأخر. إذا أمكن، أرسل وقت وصولك المتوقع برسالة.",
  arrival_cancel: "تم تسجيل أنك لن تتمكن من الحضور. شكراً لإبلاغنا حتى نتمكن من تنظيم المقاعد 🙏",
  auto_signup_enabled: "✅ تم تفعيل الاشتراك التلقائي للفعاليات القادمة. سنراسلك عند توفر فعالية مناسبة، ولن يتم الخصم أو تأكيد الحضور دون موافقتك. لإيقافه أرسل كلمة: إيقاف",
  auto_signup_already: "✅ الاشتراك التلقائي مفعّل لديك بالفعل. لن نغيّر حالته. لإيقافه أرسل كلمة: إيقاف",
  auto_signup_stopped: "🛑 تم إيقاف الاشتراك التلقائي. لن نضيفك تلقائياً إلى الفعاليات القادمة.",
  preference_kept: "✅ تم الإبقاء على تفضيلك الحالي بدون أي تغيير.",
  receipt_received: "✅ استلمنا إيصال المشارك رقم {participant_number} بنجاح.\n\nحالته الآن: بانتظار المراجعة. سنرسل لك رسالة أخرى فور اعتماده وتأكيد المقعد.",
  receipt_unsupported: "تعذر قراءة المرفق كإيصال. أرسله من فضلك كصورة واضحة أو ملف PDF.",
  receipt_store_failed: "⚠️ لم نتمكن من حفظ الإيصال، لذلك لم يُسجّل بعد. يرجى إرساله مرة أخرى كصورة واضحة أو PDF. إذا تكرر الخطأ تواصل معنا على 0560899666.",
  unknown_message: "مرحباً 👋\n\n• أرسل «تأكيد» لتسجيل رغبتك بالحضور\n• أرسل «اعتذار» إذا لن تتمكن من الحضور\n• أرسل الإيصال كصورة أو PDF ليُراجع ويُعتمد\n• أرسل «إيقاف» لإلغاء الاشتراك التلقائي\n\nتأكيد المقعد النهائي يصلك برسالة منفصلة بعد اعتماد الإيصال.",
  event_information: "✨ *وش فكرة التوافق الأعمى؟*\n\nتجربة اجتماعية منظّمة تمر فيها بجولات تعارف قصيرة، ثم تسجّل انطباعك بسرية لنساعدك في اكتشاف أفضل توافق.\n\n📘 *شرح التجربة وخطوات يوم الفعالية:*\n{tutorial_url}\n\nخذ دقيقتين لقراءة الشرح قبل وصولك، وبتكون الصورة كاملة وواضحة 🤍",
  receipt_unknown_phone: "لم نتمكن من ربط هذا الرقم بتسجيل مشارك. يرجى إرسال الإيصال من الرقم المسجل أو التواصل معنا على 0560899666.",
  auto_signup_already_stopped: "الاشتراك التلقائي متوقف لديك بالفعل، ولم نغيّر أي شيء.",
  final_event_details: "📘 *شرح الفعالية قبل الحضور:*\n{tutorial_url}\n\n📍 *المكان:* {location}\n🗺️ {map_url}\n📅 *التاريخ:* {event_date}\n🕰️ *الوقت:* {event_time}{arrival_suffix}\n\nيرجى قراءة الشرح قبل الوصول. نراك هناك! 🤍",
}

function renderResponse(value, variables = {}) {
  return Object.entries(variables).reduce((text, [key, replacement]) => text.replaceAll(`{${key}}`, String(replacement ?? "")), String(value || ""))
}

async function responseText(actionKey, variables = {}) {
  const { data } = await supabase.from("twilio_response_rules").select("response_text,enabled").eq("action_key", actionKey).maybeSingle()
  if (data?.enabled === false) return ""
  const selected = data?.response_text || DEFAULT_RESPONSES[actionKey]
  const rendered = renderResponse(selected || "", variables).trim()
  if (!rendered) return ""
  const signature = "— *فريق التوافق الأعمى* 🤍"
  return rendered.includes("*فريق التوافق الأعمى*") ? rendered : `${rendered}\n\n${signature}`
}

async function recordParticipantAction(participant, actionKey, value, source = "participant", note = null) {
  const now = new Date().toISOString()
  const eventId = Number(participant.signup_event_id || participant.event_id || 1)
  await supabase.from("participant_twilio_actions").upsert({
    participant_id: participant.id,
    assigned_number: participant.assigned_number,
    event_id: eventId,
    action_key: actionKey,
    action_value: { value },
    source,
    note,
    updated_at: now,
  }, { onConflict: "participant_id,event_id,action_key" })
  await supabase.from("participants").update({ last_twilio_action: actionKey, last_twilio_action_at: now }).eq("id", participant.id)
}

function validateTwilioSignature(req) {
  if (!authToken) return false
  const signature = req.headers["x-twilio-signature"] || ""
  if (!signature) return false

  // Sort POST params alphabetically by key, concatenate key+value
  const params = req.body || {}
  const data = Object.keys(params)
    .sort()
    .map(key => key + (params[key] || ""))
    .join("")

  const sigBuf = Buffer.from(signature)
  const forwardedProtocol = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim()
  const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim()
  const requestHost = forwardedHost || req.headers["host"] || ""
  const requestUrl = `${forwardedProtocol}://${requestHost}${req.url || ""}`
  const candidateUrls = [...new Set([inboundWebhookUrl, requestUrl].filter(Boolean))]

  return candidateUrls.some(url => {
    const hmac = crypto.createHmac("sha1", authToken)
    hmac.update(url + data)
    const expected = Buffer.from(hmac.digest("base64"))
    return sigBuf.length === expected.length && crypto.timingSafeEqual(sigBuf, expected)
  })
}

async function sendTwilioReply(to, message, participant = null) {
  if (!String(message || "").trim()) return
  if (!accountSid || !authToken) {
    console.error("Twilio credentials not configured for webhook reply")
    return
  }
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
  const body = new URLSearchParams()
  body.append("From", sender)
  body.append("To", to)
  body.append("Body", message)
  body.append("StatusCallback", statusCallbackUrl)

  const twilioRes = await fetch(twilioUrl, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  })

  const twilioData = await twilioRes.json()

  // Log auto-reply to whatsapp_messages
  if (participant) {
    try {
      await supabase.from("whatsapp_messages").insert({
        participant_id: participant.id,
        assigned_number: participant.assigned_number,
        phone_number: to,
        direction: "outbound",
        message_body: message,
        twilio_message_sid: twilioData?.sid || null,
        status: twilioData?.status || "queued",
        status_updated_at: new Date().toISOString(),
        error_code: twilioData?.code ? String(twilioData.code) : null,
        error_message: twilioRes.ok ? null : (twilioData?.message || `Twilio ${twilioRes.status}`),
        twilio_payload: twilioData || {},
        is_auto_reply: true,
      })
    } catch (e) {
      console.error("Failed to log auto-reply:", e)
    }
  }
}

async function logIncomingMessage(participant, data) {
  try {
    await supabase.from("whatsapp_messages").insert({
      participant_id: participant?.id || null,
      assigned_number: participant?.assigned_number || null,
      phone_number: data.from,
      direction: "inbound",
      message_body: data.messageBody || null,
      button_payload: data.buttonPayload || null,
      button_text: data.buttonText || null,
      media_url: data.mediaUrl0 || null,
      media_content_type: data.mediaContentType0 || null,
      status: "received",
    })
  } catch (e) {
    console.error("Failed to log incoming message:", e)
  }
}

async function findParticipantByPhone(phone) {
  // phone comes as "whatsapp:+1234567890" — normalize
  const cleanPhone = phone.replace("whatsapp:", "").replace(/\s/g, "")
  const last7 = cleanPhone.replace(/\D/g, "").slice(-7)
  if (last7.length < 7) return null

  const { data: candidates } = await supabase
    .from("participants")
    .select("id, assigned_number, name, phone_number, secure_token, signup_for_next_event, auto_signup_next_event, PAID_DONE, payment_waived, event_id, signup_event_id, match_id, created_at, next_event_signup_timestamp, same_gender_preference, any_gender_preference, age_flex_years, age_flex_event_id, arrival_status, discount_interest")
    .not("phone_number", "is", null)

  if (!candidates) return null

  const match = candidates.find(c => {
    const cp = String(c.phone_number || "").replace(/\D/g, "")
    return cp.endsWith(last7)
  })

  return match || null
}

async function getWhatsappConfig() {
  const { data, error } = await supabase
    .from("event_state")
    .select("whatsapp_config")
    .eq("match_id", STATIC_MATCH_ID)
    .maybeSingle()

  if (error) console.error("Failed to load WhatsApp config:", error)
  const savedConfig = data?.whatsapp_config || {}
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
    ...savedConfig,
    earlyPrice: 60,
    latePrice: 75,
  }
  return { ...config, latePriceSwitchLabel: formatRiyadhCutoffLabel(config.paymentCutoffLocal) || config.latePriceSwitchLabel }
}

async function getCurrentEventId() {
  const { data, error } = await supabase
    .from("event_state")
    .select("current_event_id")
    .eq("match_id", STATIC_MATCH_ID)
    .maybeSingle()
  if (error) throw new Error("Failed to load current event: " + error.message)
  return Number(data?.current_event_id || 1)
}

function riyadhLocalToTimestamp(value) {
  const local = String(value || "").trim()
  if (!local) return null
  const includesZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(local)
  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) ? `${local}:00` : local
  const timestamp = Date.parse(includesZone ? local : `${withSeconds}+03:00`)
  return Number.isFinite(timestamp) ? timestamp : null
}

function paymentDetailsFor(participant, config) {
  const cutoff = riyadhLocalToTimestamp(config.paymentCutoffLocal)
  const signupAt = Date.parse(participant.next_event_signup_timestamp || participant.created_at || "")
  // Until an organizer saves a cutoff, preserve the early price instead of
  // unexpectedly charging existing participants the late price.
  const isEarly = cutoff === null || (Number.isFinite(signupAt) && signupAt <= cutoff)
  return { price: Number(isEarly ? config.earlyPrice : config.latePrice) || (isEarly ? 60 : 75), isEarly }
}

async function finalConfirmationMessage(participant, config, intro) {
  const tutorialBase = String(config.tutorialUrl || "https://blindmatch.app/event3").trim()
  const tutorialUrl = `${tutorialBase}${tutorialBase.includes("?") ? "&" : "?"}token=${encodeURIComponent(participant.secure_token || "")}`
  const details = await responseText("final_event_details", {
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

async function recordAttendanceNotification(participant, from, requestType) {
  await supabase
    .from("attendance_requests")
    .update({ status: "superseded", admin_note: "Superseded by a newer participant response", updated_at: new Date().toISOString() })
    .eq("participant_id", participant.id)
    .eq("status", "pending")

  const { error } = await supabase.from("attendance_requests").insert({
    participant_id: participant.id,
    assigned_number: participant.assigned_number,
    phone_number: from,
    request_type: requestType,
    status: "pending",
  })
  if (error) console.error("Failed to record attendance notification:", error)
}

async function confirmAttendance(participant, from) {
  const now = new Date().toISOString()
  const { error: participantError } = await supabase.from("participants").update({
    attendance_confirmed: true,
    attendance_confirmed_at: now,
    attendance_denied_at: null,
  }).eq("id", participant.id)
  if (participantError) throw participantError

  const { error: exclusionError } = await supabase.from("excluded_pairs").delete()
    .eq("match_id", STATIC_MATCH_ID)
    .eq("participant1_number", participant.assigned_number)
    .eq("participant2_number", -1)
    .ilike("reason", "اعتذر عن الحضور عبر واتساب%")
  if (exclusionError) throw exclusionError

  await recordAttendanceNotification(participant, from, "confirm")
  await recordParticipantAction(participant, "attendance", "confirmed")
  if (participant.PAID_DONE || participant.payment_waived) {
    const config = await getWhatsappConfig()
    const intro = await responseText(participant.payment_waived ? "attendance_waived" : "attendance_paid")
    await sendTwilioReply(from, await finalConfirmationMessage(participant, config, intro), participant)
  } else {
    await sendTwilioReply(from, await paymentReply(participant), participant)
  }
}

async function paymentReply(participant) {
  const config = await getWhatsappConfig()
  const { price, isEarly } = paymentDetailsFor(participant, config)
  return responseText("attendance_payment_pending", {
    participant_number: participant.assigned_number,
    price,
    price_label: isEarly ? "السعر المبكر" : "السعر المتأخر",
    early_price: Number(config.earlyPrice) || 60,
    late_price: Number(config.latePrice) || 75,
    early_time: "حتى الثلاثاء الساعة 1 ظهرًا",
    late_time: "ابتداءً من الثلاثاء الساعة 1 ظهرًا",
    stc_pay: config.stcPay,
    bank_name: config.bankName,
    iban: config.iban,
  })
}

async function denyAttendance(participant, from) {
  const now = new Date().toISOString()
  const { error: participantError } = await supabase.from("participants").update({
    attendance_confirmed: false,
    attendance_confirmed_at: null,
    attendance_denied_at: now,
  }).eq("id", participant.id)
  if (participantError) throw participantError

  const { data: existing, error: existingError } = await supabase.from("excluded_pairs").select("id")
    .eq("match_id", STATIC_MATCH_ID).eq("participant1_number", participant.assigned_number).eq("participant2_number", -1).maybeSingle()
  if (existingError) throw existingError
  if (!existing) {
    const { error: exclusionError } = await supabase.from("excluded_pairs").insert({
      match_id: STATIC_MATCH_ID,
      participant1_number: participant.assigned_number,
      participant2_number: -1,
      reason: "اعتذر عن الحضور عبر واتساب — تلقائي",
    })
    if (exclusionError) throw exclusionError
  }

  await recordAttendanceNotification(participant, from, "deny")
  await recordParticipantAction(participant, "attendance", "declined")
  const { data: latestPreference, error: preferenceError } = await supabase.from("participants")
    .select("auto_signup_next_event").eq("id", participant.id).single()
  if (preferenceError) throw preferenceError
  const autoSignupEnabled = latestPreference.auto_signup_next_event === true
  await sendTwilioReply(from, await responseText("attendance_denied", {
    auto_signup_status: autoSignupEnabled ? "مفعّل" : "متوقف",
    auto_signup_action: autoSignupEnabled
      ? "إذا رغبت بإيقاف التسجيل التلقائي للفعاليات القادمة، أرسل: *إيقاف*"
      : "إذا رغبت بالتسجيل التلقائي في أي فعالية قادمة، أرسل: *تفعيل*",
  }), participant)
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  // Validate Twilio signature
  if (!validateTwilioSignature(req)) {
    console.error("Invalid Twilio signature")
    return res.status(403).json({ error: "Invalid signature" })
  }

  try {
    const from = req.body.From || ""
    const buttonPayload = req.body.ButtonPayload || ""
    const buttonText = req.body.ButtonText || ""
    const messageBody = req.body.Body || ""
    const buttonAction = resolveInboundAction(buttonPayload, buttonText, messageBody)
    const mediaUrl0 = req.body.MediaUrl0 || ""
    const mediaContentType0 = req.body.MediaContentType0 || ""
    const messageSid = req.body.MessageSid || ""

    console.log("Twilio webhook:", { from, buttonPayload, buttonText, messageBody, hasMedia: !!mediaUrl0 })

    // ── Handle media (receipt upload) ──────────────────────────────────
    if (mediaUrl0) {
      const participant = await findParticipantByPhone(from)
      if (!participant) {
        console.log("No participant found for phone:", from)
        await sendTwilioReply(from, await responseText("receipt_unknown_phone"))
        return res.status(200).json({ status: "participant_not_found" })
      }

      // Log incoming media message
      await logIncomingMessage(participant, { from, messageBody, mediaUrl0, mediaContentType0 })

      // Download and store the receipt
      const isImage = mediaContentType0 && mediaContentType0.startsWith("image/")
      const isPdf = mediaContentType0 && mediaContentType0 === "application/pdf"
      if (!isImage && !isPdf) {
        await sendTwilioReply(from, await responseText("receipt_unsupported"), participant)
        return res.status(200).json({ status: "unsupported_receipt_type" })
      }
      const eventId = await getCurrentEventId()
      const fileExt = isPdf ? "pdf" : mediaContentType0 === "image/png" ? "png" : mediaContentType0 === "image/webp" ? "webp" : "jpg"
      const fileName = "event-" + eventId + "/" + participant.assigned_number + "_" + Date.now() + "." + fileExt

      try {
        if (!supabaseServiceRoleKey) {
          throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured; receipt storage is blocked by RLS")
        }
        if (!accountSid || !authToken) throw new Error("Twilio credentials are unavailable for media download")
        const mediaRes = await fetch(mediaUrl0, {
          headers: { "Authorization": "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64") },
        })
        if (!mediaRes.ok) throw new Error(`Twilio media download failed (${mediaRes.status})`)
        const arrayBuffer = await mediaRes.arrayBuffer()
        if (!arrayBuffer.byteLength || arrayBuffer.byteLength > 12 * 1024 * 1024) {
          throw new Error(`Receipt file size is invalid (${arrayBuffer.byteLength} bytes)`)
        }
        const buffer = Buffer.from(arrayBuffer)

        const { error: uploadError } = await supabase.storage
          .from("receipts")
          .upload(fileName, buffer, {
            contentType: mediaContentType0 || "application/octet-stream",
            upsert: false,
          })

        if (uploadError) {
          throw new Error(`Receipt upload failed: ${uploadError.message}`)
        }

        // Store receipt URL in participant record
        const { data: publicUrlData } = supabase.storage
          .from("receipts")
          .getPublicUrl(fileName)

        const receiptUrl = publicUrlData?.publicUrl
        if (!receiptUrl) throw new Error("Receipt public URL could not be generated")

        const now = new Date().toISOString()
        const { data: receipt, error: receiptInsertError } = await supabase
          .from("participant_receipts")
          .insert({
            participant_id: participant.id,
            assigned_number: participant.assigned_number,
            event_id: eventId,
            storage_path: fileName,
            receipt_url: receiptUrl,
            status: "pending",
            received_at: now,
            source_message_sid: messageSid || null,
            updated_at: now,
          })
          .select("id")
          .single()
        if (receiptInsertError) throw new Error("Receipt record failed: " + receiptInsertError.message)

        const { error: supersedeError } = await supabase
          .from("participant_receipts")
          .update({ status: "superseded", updated_at: now })
          .eq("participant_id", participant.id)
          .eq("event_id", eventId)
          .eq("status", "pending")
          .neq("id", receipt.id)
        if (supersedeError) throw new Error("Previous receipt update failed: " + supersedeError.message)

        const { error: participantUpdateError } = await supabase
          .from("participants")
          .update({
            receipt_url: receiptUrl,
            receipt_received_at: now,
            receipt_approved: false,
            receipt_approved_at: null,
            receipt_rejected: false,
            receipt_rejected_at: null,
          })
          .eq("id", participant.id)
        if (participantUpdateError) throw new Error(`Participant receipt update failed: ${participantUpdateError.message}`)

        await recordParticipantAction(participant, "receipt", "pending_review")
        await sendTwilioReply(from, await responseText("receipt_received", { participant_number: participant.assigned_number }), participant)
        return res.status(200).json({ status: "receipt_received" })
      } catch (e) {
        console.error("Media download/store error:", e)
        await sendTwilioReply(from, await responseText("receipt_store_failed"), participant)
        return res.status(200).json({ status: "error" })
      }
    }

    // ── Handle quick reply button presses ──────────────────────────────
    if (buttonAction) {
      const participant = await findParticipantByPhone(from)
      if (!participant) {
        console.log("No participant found for phone:", from)
        return res.status(200).json({ status: "ignored" })
      }

      // Log incoming button press
      await logIncomingMessage(participant, { from, buttonPayload, buttonText, messageBody })

      switch (buttonAction) {
        case "confirm_attendance": {
          await confirmAttendance(participant, from)
          return res.status(200).json({ status: "confirmed" })
        }

        case "deny_attendance": {
          await denyAttendance(participant, from)
          return res.status(200).json({ status: "denied" })
        }

        case "toggle_auto_signup": {
          const currentValue = participant.auto_signup_next_event
          const newValue = true

          if (!currentValue) {
            await supabase
              .from("participants")
              .update({ auto_signup_next_event: true })
              .eq("id", participant.id)
          }

          await recordParticipantAction(participant, "auto_signup", "enabled")
          const replyText = await responseText(currentValue ? "auto_signup_already" : "auto_signup_enabled")

          await sendTwilioReply(from, replyText, participant)
          return res.status(200).json({ status: "toggled", new_value: newValue })
        }

        case "event3_information": {
          const config = await getWhatsappConfig()
          const tutorialBase = String(config.tutorialUrl || "https://blindmatch.app/event3").trim()
          const tutorialUrl = `${tutorialBase}${tutorialBase.includes("?") ? "&" : "?"}token=${encodeURIComponent(participant.secure_token || "")}`
          const infoMessage = await responseText("event_information", { tutorial_url: tutorialUrl })
          await sendTwilioReply(from, infoMessage, participant)
          return res.status(200).json({ status: "info_sent" })
        }

        case "gender_any":
        case "gender_same":
        case "gender_different": {
          const preference = buttonAction.replace("gender_", "")
          const update = preference === "any"
            ? { same_gender_preference: false, any_gender_preference: true }
            : preference === "same"
              ? { same_gender_preference: true, any_gender_preference: false }
              : { same_gender_preference: false, any_gender_preference: false }
          const { error } = await supabase.from("participants").update(update).eq("id", participant.id)
          if (error) throw error
          await recordParticipantAction(participant, "gender_preference", preference)
          await sendTwilioReply(from, await responseText(buttonAction), participant)
          return res.status(200).json({ status: "gender_preference_updated", value: preference })
        }

        case "age_expand_2":
        case "age_expand_5":
        case "age_keep_current": {
          const years = buttonAction === "age_expand_2" ? 2 : buttonAction === "age_expand_5" ? 5 : 0
          const eventId = Number(participant.signup_event_id || participant.event_id || 1)
          const { error } = await supabase.from("participants").update({
            age_flex_years: years,
            age_flex_event_id: years ? eventId : null,
          }).eq("id", participant.id)
          if (error) throw error
          await recordParticipantAction(participant, "age_flexibility", years)
          await sendTwilioReply(from, await responseText(buttonAction), participant)
          return res.status(200).json({ status: "age_flexibility_updated", years })
        }

        case "discount_interested":
        case "discount_declined": {
          const value = buttonAction === "discount_interested" ? "interested" : "declined"
          const { error } = await supabase.from("participants").update({ discount_interest: value }).eq("id", participant.id)
          if (error) throw error
          await recordParticipantAction(participant, "discount", value)
          await sendTwilioReply(from, await responseText(buttonAction), participant)
          return res.status(200).json({ status: `offer_${value}` })
        }

        case "arrival_cancel": {
          await denyAttendance(participant, from)
          return res.status(200).json({ status: "cancellation_pending_approval" })
        }
        case "arrival_on_way":
        case "arrival_late": {
          const value = buttonAction === "arrival_on_way" ? "on_way" : "late"
          const now = new Date().toISOString()
          const update = { arrival_status: value, arrival_status_at: now }
          const { error } = await supabase.from("participants").update(update).eq("id", participant.id)
          if (error) throw error
          await recordParticipantAction(participant, "arrival", value)
          await sendTwilioReply(from, await responseText(buttonAction), participant)
          return res.status(200).json({ status: `arrival_${value}` })
        }

        default:
          console.log("Unknown button action:", { buttonPayload, buttonText, messageBody })
          return res.status(200).json({ status: "unknown_button" })
      }
    }

    // ── Handle free-text keywords (fallback for testing without buttons) ──
    if (messageBody) {
      const text = normalizeInboundAction(messageBody)
      const participant = await findParticipantByPhone(from)

      if (!participant) {
        // Still log unknown incoming messages
        await logIncomingMessage(null, { from, messageBody })
        return res.status(200).json({ status: "ignored" })
      }

      // Log incoming free-text message
      await logIncomingMessage(participant, { from, messageBody })

      const genderPreferenceCommands = {
        "اي جنس": { same_gender_preference: false, any_gender_preference: true, label: "أي جنس" },
        "نفس الجنس": { same_gender_preference: true, any_gender_preference: false, label: "نفس الجنس" },
        "جنس مختلف": { same_gender_preference: false, any_gender_preference: false, label: "جنس مختلف" },
      }
      if (genderPreferenceCommands[text]) {
        const selected = genderPreferenceCommands[text]
        const { error } = await supabase.from("participants").update({
          same_gender_preference: selected.same_gender_preference,
          any_gender_preference: selected.any_gender_preference,
        }).eq("id", participant.id)
        if (error) throw new Error(`Failed to update gender preference: ${error.message}`)
        const actionKey = selected.any_gender_preference ? "gender_any" : selected.same_gender_preference ? "gender_same" : "gender_different"
        await recordParticipantAction(participant, "gender_preference", actionKey.replace("gender_", ""))
        await sendTwilioReply(from, await responseText(actionKey), participant)
        return res.status(200).json({ status: "gender_preference_updated" })
      }

      if (text === "ابقاء التفضيل") {
        await sendTwilioReply(from, await responseText("preference_kept"), participant)
        return res.status(200).json({ status: "preference_kept" })
      }

      const ageFlexTextCommands = { "توسيع سنتين": 2, "توسيع 5 سنوات": 5, "ابقاء النطاق": 0 }
      if (Object.prototype.hasOwnProperty.call(ageFlexTextCommands, text)) {
        const years = ageFlexTextCommands[text]
        const eventId = Number(participant.signup_event_id || participant.event_id || 1)
        const { error } = await supabase.from("participants").update({ age_flex_years: years, age_flex_event_id: years ? eventId : null }).eq("id", participant.id)
        if (error) throw error
        await recordParticipantAction(participant, "age_flexibility", years)
        const key = years === 2 ? "age_expand_2" : years === 5 ? "age_expand_5" : "age_keep_current"
        await sendTwilioReply(from, await responseText(key), participant)
        return res.status(200).json({ status: "age_flexibility_updated", years })
      }

      if (text === "مهتم" || text === "غير مهتم") {
        const value = text === "مهتم" ? "interested" : "declined"
        await supabase.from("participants").update({ discount_interest: value }).eq("id", participant.id)
        await recordParticipantAction(participant, "discount", value)
        await sendTwilioReply(from, value === "interested" ? await paymentReply(participant) : await responseText("discount_declined"), participant)
        return res.status(200).json({ status: text === "مهتم" ? "offer_interested" : "offer_declined" })
      }

      if (text === "تاكيد" || text === "confirm" || text === "نعم") {
        await confirmAttendance(participant, from)
        return res.status(200).json({ status: "confirmed" })
      }

      if (text === "اعتذار" || text === "deny" || text === "لا") {
        await denyAttendance(participant, from)
        return res.status(200).json({ status: "denied" })
      }

      if (text === "ايقاف" || text === "stop") {
        const currentValue = participant.auto_signup_next_event
        const newValue = false

        await supabase
          .from("participants")
          .update({ auto_signup_next_event: newValue })
          .eq("id", participant.id)

        if (currentValue) await recordParticipantAction(participant, "auto_signup", "disabled")
        const replyText = currentValue
          ? await responseText("auto_signup_stopped")
          : await responseText("auto_signup_already_stopped")

        await sendTwilioReply(from, replyText, participant)
        return res.status(200).json({ status: "toggled", new_value: newValue })
      }

      if (text === "تفعيل" || text === "activate") {
        const currentValue = participant.auto_signup_next_event === true
        if (!currentValue) {
          await supabase.from("participants").update({ auto_signup_next_event: true }).eq("id", participant.id)
          await recordParticipantAction(participant, "auto_signup", "enabled")
        }
        await sendTwilioReply(from, await responseText(currentValue ? "auto_signup_already" : "auto_signup_enabled"), participant)
        return res.status(200).json({ status: "toggled", new_value: true })
      }

      // Unrecognized text — send help
      await sendTwilioReply(from, await responseText("unknown_message"), participant)
      return res.status(200).json({ status: "help_sent" })
    }

    return res.status(200).json({ status: "no_action" })
  } catch (err) {
    console.error("Twilio webhook error:", err)
    return res.status(500).json({ error: "Webhook handler error" })
  }
}
