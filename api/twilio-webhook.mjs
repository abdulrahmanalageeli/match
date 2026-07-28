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
    .select("id, assigned_number, name, phone_number, secure_token, signup_for_next_event, auto_signup_next_event, PAID_DONE, event_id, match_id")
    .not("phone_number", "is", null)

  if (!candidates) return null

  const match = candidates.find(c => {
    const cp = String(c.phone_number || "").replace(/\D/g, "")
    return cp.endsWith(last7)
  })

  return match || null
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
          // Directly update participant attendance
          await supabase
            .from("participants")
            .update({ attendance_confirmed: true, attendance_confirmed_at: new Date().toISOString(), attendance_denied_at: null })
            .eq("id", participant.id)

          // Also insert attendance_request so admin sees it in the modal
          await supabase.from("attendance_requests").insert({
            participant_id: participant.id,
            assigned_number: participant.assigned_number,
            phone_number: from,
            request_type: "confirm",
            status: "pending",
          })

          const confirmationReply = participant.PAID_DONE
            ? "✅ تم تسجيل حضورك، ومقعدك مؤكد لأن دفعتك معتمدة. نراك في الفعالية!"
            : `✅ سجلنا رغبتك بالحضور للمشارك رقم ${participant.assigned_number}.\n\nالخطوة المتبقية: أرسل صورة الإيصال أو ملف PDF هنا. المقعد يصبح مؤكداً بعد مراجعة الإيصال، وستصلك رسالة اعتماد منفصلة.`
          await sendTwilioReply(from, confirmationReply, participant)
          return res.status(200).json({ status: "confirmed" })
        }

        case "deny_attendance": {
          // Directly update participant attendance
          await supabase
            .from("participants")
            .update({ attendance_confirmed: false, attendance_denied_at: new Date().toISOString(), attendance_confirmed_at: null })
            .eq("id", participant.id)

          // Also insert attendance_request so admin sees it in the modal
          await supabase.from("attendance_requests").insert({
            participant_id: participant.id,
            assigned_number: participant.assigned_number,
            phone_number: from,
            request_type: "deny",
            status: "pending",
          })

          await sendTwilioReply(from, "تم تسجيل اعتذاركم. 🙏 شكراً لكم، ونرحب بكم في فعاليات قادمة! للاستفسار: 0560899666", participant)
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
      const text = messageBody.trim().toLowerCase()
      const participant = await findParticipantByPhone(from)

      if (!participant) {
        // Still log unknown incoming messages
        await logIncomingMessage(null, { from, messageBody })
        return res.status(200).json({ status: "ignored" })
      }

      // Log incoming free-text message
      await logIncomingMessage(participant, { from, messageBody })

      if (text === "تأكيد" || text === "confirm" || text === "نعم") {
        await supabase
          .from("participants")
          .update({ attendance_confirmed: true, attendance_confirmed_at: new Date().toISOString(), attendance_denied_at: null })
          .eq("id", participant.id)

        await supabase.from("attendance_requests").insert({
          participant_id: participant.id,
          assigned_number: participant.assigned_number,
          phone_number: from,
          request_type: "confirm",
          status: "pending",
        })

        const confirmationReply = participant.PAID_DONE
          ? "✅ تم تسجيل حضورك ومقعدك مؤكد. نراك في الفعالية!"
          : `✅ سجلنا رغبتك بالحضور للمشارك رقم ${participant.assigned_number}. أرسل الإيصال هنا كصورة أو PDF، وسنرسل لك رسالة أخرى بعد اعتماده وتأكيد المقعد.`
        await sendTwilioReply(from, confirmationReply, participant)
        return res.status(200).json({ status: "confirmed" })
      }

      if (text === "اعتذار" || text === "deny" || text === "لا") {
        await supabase
          .from("participants")
          .update({ attendance_confirmed: false, attendance_denied_at: new Date().toISOString(), attendance_confirmed_at: null })
          .eq("id", participant.id)

        await supabase.from("attendance_requests").insert({
          participant_id: participant.id,
          assigned_number: participant.assigned_number,
          phone_number: from,
          request_type: "deny",
          status: "pending",
        })

        await sendTwilioReply(from, "تم تسجيل اعتذارك عن الحضور 🙏 شكرًا لإبلاغنا مبكرًا، ونأمل أن نراك في فعالية قادمة.", participant)
        return res.status(200).json({ status: "denied" })
      }

      if (text === "إيقاف" || text === "stop") {
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
