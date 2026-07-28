import { createClient } from "@supabase/supabase-js"
import crypto from "crypto"

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

function validateTwilioSignature(req) {
  if (!authToken) return false
  const signature = req.headers["x-twilio-signature"] || ""
  if (!signature) return false

  // Build the full URL Twilio would have called
  const protocol = req.headers["x-forwarded-proto"] || "https"
  const host = req.headers["host"] || req.headers["x-forwarded-host"] || ""
  const url = `${protocol}://${host}${req.url || ""}`

  // Sort POST params alphabetically by key, concatenate key+value
  const params = req.body || {}
  const data = Object.keys(params)
    .sort()
    .map(key => key + (params[key] || ""))
    .join("")

  const hmac = crypto.createHmac("sha1", authToken)
  hmac.update(url + data)
  const expected = hmac.digest("base64")

  const sigBuf = Buffer.from(signature)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length) return false

  return crypto.timingSafeEqual(sigBuf, expBuf)
}

async function sendTwilioReply(to, message, participant = null) {
  if (!accountSid || !authToken) {
    console.error("Twilio credentials not configured for webhook reply")
    return
  }
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
  const body = new URLSearchParams()
  body.append("From", sender)
  body.append("To", to)
  body.append("Body", message)

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
        status: twilioData?.status || "sent",
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
    .select("id, assigned_number, name, phone_number, secure_token, signup_for_next_event, auto_signup_next_event, PAID_DONE, payment_waived, event_id, match_id, created_at, next_event_signup_timestamp")
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
  return {
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

function finalConfirmationMessage(participant, config, intro) {
  const tutorialBase = String(config.tutorialUrl || "https://blindmatch.app/event3").trim()
  const tutorialUrl = `${tutorialBase}${tutorialBase.includes("?") ? "&" : "?"}token=${encodeURIComponent(participant.secure_token || "")}`
  return `${intro}\n\n📘 *شرح الفعالية قبل الحضور:*\n${tutorialUrl}\n\n📍 *المكان:* ${config.locationName || "سيتم إرساله قريباً"}\n🗺️ ${config.mapUrl || ""}\n📅 *التاريخ:* ${config.eventDateText || "سيتم إرساله قريباً"}\n🕰️ *الوقت:* ${config.eventTimeText || "سيتم إرساله قريباً"}${config.arrivalTimeText ? ` (الحضور ${config.arrivalTimeText})` : ""}\n\nيرجى قراءة الشرح قبل الوصول. نراك هناك! 🤍`
}

async function recordAttendanceNotification(participant, from, requestType) {
  await supabase
    .from("attendance_requests")
    .update({ status: "approved", admin_note: "Superseded by a newer participant response", updated_at: new Date().toISOString() })
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
  const { error } = await supabase
    .from("participants")
    .update({ attendance_confirmed: true, attendance_confirmed_at: now, attendance_denied_at: null })
    .eq("id", participant.id)
  if (error) throw new Error(`Failed to confirm attendance: ${error.message}`)

  await recordAttendanceNotification(participant, from, "confirm")
  if (participant.PAID_DONE || participant.payment_waived) {
    const config = await getWhatsappConfig()
    const intro = participant.payment_waived
      ? "✅ تم تسجيل حضورك، ومقعدك مؤكد بإعفاء من الدفع من المنظم."
      : "✅ تم تسجيل حضورك، ومقعدك مؤكد لأن دفعتك معتمدة."
    await sendTwilioReply(from, finalConfirmationMessage(participant, config, intro), participant)
    return
  }

  const config = await getWhatsappConfig()
  const { price, isEarly } = paymentDetailsFor(participant, config)
  const reply = `✅ تم تسجيل حضورك للمشارك رقم ${participant.assigned_number}، ولا يحتاج إلى اعتماد إضافي من المنظم.\n\n💳 الرسوم المطلوبة: *${price} ريال* (${isEarly ? "سعر التسجيل المبكر" : "سعر التسجيل بعد الموعد"})\n\n🏦 طرق الدفع:\n• STC Pay: ${config.stcPay}\n• ${config.bankName}\n• IBAN: ${config.iban}\n\n📸 بعد التحويل، أرسل صورة الإيصال أو ملف PDF هنا مباشرة. يصبح المقعد مؤكداً نهائياً بعد مراجعة الإيصال.`
  await sendTwilioReply(from, reply, participant)
}

async function denyAttendance(participant, from) {
  const { error } = await supabase
    .from("participants")
    .update({ attendance_confirmed: false, attendance_denied_at: new Date().toISOString(), attendance_confirmed_at: null })
    .eq("id", participant.id)
  if (error) throw new Error(`Failed to record attendance denial: ${error.message}`)
  await recordAttendanceNotification(participant, from, "deny")
  await sendTwilioReply(from, "تم تسجيل اعتذاركم مباشرة 🙏 شكراً لكم، ونرحب بكم في فعاليات قادمة!", participant)
}

function normalizeArabicCommand(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
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
    const mediaUrl0 = req.body.MediaUrl0 || ""
    const mediaContentType0 = req.body.MediaContentType0 || ""

    console.log("Twilio webhook:", { from, buttonPayload, buttonText, messageBody, hasMedia: !!mediaUrl0 })

    // ── Handle media (receipt upload) ──────────────────────────────────
    if (mediaUrl0) {
      const participant = await findParticipantByPhone(from)
      if (!participant) {
        console.log("No participant found for phone:", from)
        await sendTwilioReply(from, "لم نتمكن من ربط هذا الرقم بتسجيل مشارك. يرجى إرسال الإيصال من الرقم المسجل أو التواصل معنا على 0560899666.")
        return res.status(200).json({ status: "participant_not_found" })
      }

      // Log incoming media message
      await logIncomingMessage(participant, { from, messageBody, mediaUrl0, mediaContentType0 })

      // Download and store the receipt
      const isImage = mediaContentType0 && mediaContentType0.startsWith("image/")
      const isPdf = mediaContentType0 && mediaContentType0 === "application/pdf"
      if (!isImage && !isPdf) {
        await sendTwilioReply(from, "تعذر قراءة المرفق كإيصال. أرسله من فضلك كصورة واضحة أو ملف PDF.", participant)
        return res.status(200).json({ status: "unsupported_receipt_type" })
      }
      const fileExt = isPdf ? "pdf" : mediaContentType0 === "image/png" ? "png" : mediaContentType0 === "image/webp" ? "webp" : "jpg"
      const fileName = `receipts/${participant.assigned_number}_${Date.now()}.${fileExt}`

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

        const { error: participantUpdateError } = await supabase
          .from("participants")
          .update({
            receipt_url: publicUrlData?.publicUrl,
            receipt_received_at: new Date().toISOString(),
            receipt_approved: false,
            receipt_approved_at: null,
            receipt_rejected: false,
            receipt_rejected_at: null,
          })
          .eq("id", participant.id)
        if (participantUpdateError) throw new Error(`Participant receipt update failed: ${participantUpdateError.message}`)

        await sendTwilioReply(from, `✅ استلمنا إيصال المشارك رقم ${participant.assigned_number} بنجاح.\n\nحالته الآن: بانتظار المراجعة. سنرسل لك رسالة أخرى فور اعتماده وتأكيد المقعد.`, participant)
        return res.status(200).json({ status: "receipt_received" })
      } catch (e) {
        console.error("Media download/store error:", e)
        await sendTwilioReply(from, "⚠️ لم نتمكن من حفظ الإيصال، لذلك لم يُسجّل بعد. يرجى إرساله مرة أخرى كصورة واضحة أو PDF. إذا تكرر الخطأ تواصل معنا على 0560899666.", participant)
        return res.status(200).json({ status: "error" })
      }
    }

    // ── Handle quick reply button presses ──────────────────────────────
    if (buttonPayload) {
      const participant = await findParticipantByPhone(from)
      if (!participant) {
        console.log("No participant found for phone:", from)
        return res.status(200).json({ status: "ignored" })
      }

      // Log incoming button press
      await logIncomingMessage(participant, { from, buttonPayload, buttonText, messageBody })

      switch (buttonPayload) {
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

          const replyText = currentValue
            ? "✅ الاشتراك التلقائي مفعّل لديك بالفعل. لن نغيّر حالته. لإيقافه أرسل كلمة: إيقاف"
            : "✅ تم تفعيل الاشتراك التلقائي للفعاليات القادمة. سنراسلك عند توفر فعالية مناسبة، ولن يتم الخصم أو تأكيد الحضور دون موافقتك. لإيقافه أرسل كلمة: إيقاف"

          await sendTwilioReply(from, replyText, participant)
          return res.status(200).json({ status: "toggled", new_value: newValue })
        }

        case "event3_information": {
          const infoMessage = "📋 *معلومات حول الفعالية*\n\n" +
            "✦ الفعالية: التوافق الأعمى 4.0\n" +
            "✦ نظام توافق شخصي متقدم\n" +
            "✦ مطابقة ذكية بناءً على شخصيتك واهتماماتك\n\n" +
            "للاستفسار أكثر، تواصل مع المنظم عبر الواتساب: 0560899666\n\n" +
            "فريق التوافق الأعمى"
          await sendTwilioReply(from, infoMessage, participant)
          return res.status(200).json({ status: "info_sent" })
        }

        default:
          console.log("Unknown button payload:", buttonPayload)
          return res.status(200).json({ status: "unknown_button" })
      }
    }

    // ── Handle free-text keywords (fallback for testing without buttons) ──
    if (messageBody) {
      const text = normalizeArabicCommand(messageBody)
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
        "مرن": { same_gender_preference: false, any_gender_preference: true, label: "أي جنس" },
      }
      if (genderPreferenceCommands[text]) {
        const selected = genderPreferenceCommands[text]
        const { error } = await supabase.from("participants").update({
          same_gender_preference: selected.same_gender_preference,
          any_gender_preference: selected.any_gender_preference,
        }).eq("id", participant.id)
        if (error) throw new Error(`Failed to update gender preference: ${error.message}`)
        await sendTwilioReply(from, `✅ تم تحديث تفضيلك إلى: *${selected.label}*. سنعتمد هذا الاختيار في المطابقة القادمة.`, participant)
        return res.status(200).json({ status: "gender_preference_updated" })
      }

      if (text === "ابقاء التفضيل") {
        await sendTwilioReply(from, "✅ تم الإبقاء على تفضيلك الحالي بدون أي تغيير.", participant)
        return res.status(200).json({ status: "preference_kept" })
      }

      if (text === "مهتم" || text === "غير مهتم") {
        await sendTwilioReply(from, text === "مهتم" ? "✅ سجلنا اهتمامك بالعرض، وسيتابع معك المنظم قريباً." : "تم تسجيل ردك، ولن نعتمد العرض لك. شكراً لإبلاغنا 🙏", participant)
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

        const replyText = currentValue
          ? "🛑 تم إيقاف الاشتراك التلقائي. لن نضيفك تلقائياً إلى الفعاليات القادمة."
          : "الاشتراك التلقائي متوقف لديك بالفعل، ولم نغيّر أي شيء."

        await sendTwilioReply(from, replyText, participant)
        return res.status(200).json({ status: "toggled", new_value: newValue })
      }

      // Unrecognized text — send help
      await sendTwilioReply(from, "مرحباً 👋\n\n• أرسل «تأكيد» لتسجيل رغبتك بالحضور\n• أرسل «اعتذار» إذا لن تتمكن من الحضور\n• أرسل الإيصال كصورة أو PDF ليُراجع ويُعتمد\n• أرسل «إيقاف» لإلغاء الاشتراك التلقائي\n\nتأكيد المقعد النهائي يصلك برسالة منفصلة بعد اعتماد الإيصال.", participant)
      return res.status(200).json({ status: "help_sent" })
    }

    return res.status(200).json({ status: "no_action" })
  } catch (err) {
    console.error("Twilio webhook error:", err)
    return res.status(500).json({ error: "Webhook handler error" })
  }
}
