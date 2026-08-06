import { supabaseAdmin } from "../security/supabase-admin.mjs"
import { enforceRateLimit } from "../security/request-security.mjs"

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return res.status(405).json({ error: "Method not allowed" })
  if (!enforceRateLimit(req, res, { key: "health", limit: 30, windowMs: 60_000 })) return
  try {
    const { error } = await supabaseAdmin.from("event_state").select("match_id").limit(1)
    if (error) throw error
    res.setHeader("Cache-Control", "no-store")
    return res.status(200).json({ status: "ok" })
  } catch {
    return res.status(503).json({ status: "unavailable" })
  }
}
