import { createClient } from "@supabase/supabase-js"
import crypto from "crypto"

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY,
)

function validateTwilioSignature(req) {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) return false
  const signature = req.headers["x-twilio-signature"] || ""
  if (!signature) return false
  const params = req.body || {}
  const data = Object.keys(params).sort().map(key => key + (params[key] || "")).join("")
  const actualBuffer = Buffer.from(signature)
  const forwardedProtocol = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim()
  const forwardedHost = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim()
  const requestUrl = `${forwardedProtocol}://${forwardedHost}${req.url || ""}`
  const configuredUrl = process.env.TWILIO_STATUS_CALLBACK_URL || "https://blindmatch.app/api/twilio-status"

  // Twilio signs the public URL it called. On Vercel, req.url can contain an
  // internal dynamic-route representation, so validate the configured public
  // callback first and retain the reconstructed URL for local/custom domains.
  return [...new Set([configuredUrl, requestUrl])].some(url => {
    const expected = crypto.createHmac("sha1", authToken).update(url + data).digest("base64")
    const expectedBuffer = Buffer.from(expected)
    return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  })
}

const TRACKED_STATUSES = new Set(["queued", "sent", "delivered", "read", "failed", "undelivered"])

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })
  if (!validateTwilioSignature(req)) return res.status(403).json({ error: "Invalid signature" })

  const sid = req.body.MessageSid || req.body.SmsSid || ""
  const rawStatus = String(req.body.MessageStatus || req.body.SmsStatus || "").toLowerCase()
  if (!sid || !rawStatus) return res.status(200).json({ status: "ignored" })
  const status = TRACKED_STATUSES.has(rawStatus) ? rawStatus : rawStatus
  const now = new Date().toISOString()
  const patch = {
    status,
    status_updated_at: now,
    error_code: req.body.ErrorCode ? String(req.body.ErrorCode) : null,
    error_message: req.body.ErrorMessage || null,
    twilio_payload: req.body,
  }
  if (status === "delivered") patch.delivered_at = now
  if (status === "read") {
    patch.read_at = now
    patch.delivered_at = now
  }
  if (status === "failed" || status === "undelivered") patch.failed_at = now

  const { data, error } = await supabase
    .from("whatsapp_messages")
    .update(patch)
    .eq("twilio_message_sid", sid)
    .select("id")

  if (error) {
    console.error("Twilio status update failed:", error)
    return res.status(500).json({ error: "Status update failed" })
  }
  return res.status(200).json({ success: true, updated: data?.length || 0 })
}
