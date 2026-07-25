import { createClient } from "@supabase/supabase-js"
import crypto from "crypto"

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

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
        return res.status(200).json({ status: "ignored" })
      }

      // Log incoming media message
      await logIncomingMessage(participant, { from, messageBody, mediaUrl0, mediaContentType0 })

      // Download and store the receipt
      const isImage = mediaContentType0 && mediaContentType0.startsWith("image/")
      const isPdf = mediaContentType0 && mediaContentType0 === "application/pdf"
      const fileExt = isImage ? "jpg" : isPdf ? "pdf" : "bin"
      const fileName = `receipts/${participant.assigned_number}_${Date.now()}.${fileExt}`

      try {
        const mediaRes = await fetch(mediaUrl0)
        const arrayBuffer = await mediaRes.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        const { error: uploadError } = await supabase.storage
          .from("receipts")
          .upload(fileName, buffer, {
            contentType: mediaContentType0 || "application/octet-stream",
            upsert: false,
          })

        if (uploadError) {
          console.error("Receipt upload error:", uploadError)
          // Still mark as received even if storage fails
        }

        // Store receipt URL in participant record
        const { data: publicUrlData } = supabase.storage
          .from("receipts")
          .getPublicUrl(fileName)

        await supabase
          .from("participants")
          .update({
            receipt_url: publicUrlData?.publicUrl || mediaUrl0,
            receipt_received_at: new Date().toISOString(),
          })
          .eq("id", participant.id)

        await sendTwilioReply(from, "✅ تم استلام الإيصال! سنقوم بتأكيد حجزكم قريباً. شكراً لكم.", participant)
        return res.status(200).json({ status: "receipt_received" })
      } catch (e) {
        console.error("Media download/store error:", e)
        await sendTwilioReply(from, "⚠️ حدث خطأ أثناء معالجة الإيصال. يرجى إعادة إرساله.", participant)
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
          await supabase
            .from("participants")
            .update({ attendance_confirmed: true, attendance_confirmed_at: new Date().toISOString() })
            .eq("id", participant.id)

          await sendTwilioReply(from, "شكراً للتأكيد! ✅ يرجى إرسال صورة الإيصال (صورة أو PDF) لتأكيد الحجز نهائياً.", participant)
          return res.status(200).json({ status: "confirmed" })
        }

        case "deny_attendance": {
          await supabase
            .from("participants")
            .update({ attendance_confirmed: false, attendance_denied_at: new Date().toISOString() })
            .eq("id", participant.id)

          await sendTwilioReply(from, "تم تسجيل اعتذاركم. 🙏 شكراً لكم، ونرحب بكم في فعاليات قادمة!", participant)
          return res.status(200).json({ status: "denied" })
        }

        case "toggle_auto_signup": {
          const currentValue = participant.auto_signup_next_event
          const newValue = !currentValue

          await supabase
            .from("participants")
            .update({ auto_signup_next_event: newValue })
            .eq("id", participant.id)

          const replyText = newValue
            ? "✅ تم تفعيل التسجيل التلقائي. سيتم تسجيلكم تلقائياً في الفعاليات القادمة."
            : "🛑 تم إيقاف التسجيل التلقائي. لن يتم تسجيلكم تلقائياً في الفعاليات القادمة."

          await sendTwilioReply(from, replyText, participant)
          return res.status(200).json({ status: "toggled", new_value: newValue })
        }

        case "event3_information": {
          const infoMessage = "📋 *معلومات حول الفعالية*\n\n" +
            "✦ الفعالية: التوافق الأعمى 4.0\n" +
            "✦ نظام توافق شخصي متقدم\n" +
            "✦ مطابقة ذكية بناءً على شخصيتك واهتماماتك\n\n" +
            "للاستفسار أكثر، تواصل مع المنظم عبر الواتساب.\n\n" +
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
        // Log as pending request for admin approval
        await supabase.from("attendance_requests").insert({
          participant_id: participant.id,
          assigned_number: participant.assigned_number,
          phone_number: from,
          request_type: "confirm",
          status: "pending",
        })

        await sendTwilioReply(from, "تم استلام طلب تأكيد الحضور ✅ سيتم مراجعته وتأكيده قريباً.", participant)
        return res.status(200).json({ status: "confirm_pending" })
      }

      if (text === "اعتذار" || text === "deny" || text === "لا") {
        // Log as pending request for admin approval
        await supabase.from("attendance_requests").insert({
          participant_id: participant.id,
          assigned_number: participant.assigned_number,
          phone_number: from,
          request_type: "deny",
          status: "pending",
        })

        await sendTwilioReply(from, "تم استلام طلب الاعتذار 🙏 سيتم مراجعته قريباً.", participant)
        return res.status(200).json({ status: "deny_pending" })
      }

      if (text === "إيقاف" || text === "toggle" || text === "تبديل") {
        const currentValue = participant.auto_signup_next_event
        const newValue = !currentValue

        await supabase
          .from("participants")
          .update({ auto_signup_next_event: newValue })
          .eq("id", participant.id)

        const replyText = newValue
          ? "✅ تم تفعيل التسجيل التلقائي. سيتم تسجيلكم تلقائياً في الفعاليات القادمة."
          : "🛑 تم إيقاف التسجيل التلقائي. لن يتم تسجيلكم تلقائياً في الفعاليات القادمة."

        await sendTwilioReply(from, replyText, participant)
        return res.status(200).json({ status: "toggled", new_value: newValue })
      }

      // Unrecognized text — send help
      await sendTwilioReply(from, "مرحباً! 👋 أرسل 'تأكيد' لتأكيد المشاركة، 'اعتذار' للاعتذار، أو 'تبديل' لتغيير التسجيل التلقائي. يمكنك أيضاً إرسال صورة الإيصال مباشرة.", participant)
      return res.status(200).json({ status: "help_sent" })
    }

    return res.status(200).json({ status: "no_action" })
  } catch (err) {
    console.error("Twilio webhook error:", err)
    return res.status(500).json({ error: "Webhook handler error" })
  }
}
