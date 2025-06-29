// /api/set-phase.mjs

import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  const { match_id, phase, secret } = req.body

  if (secret !== process.env.ADMIN_SECRET_KEY) {
    return res.status(403).json({ error: "Unauthorized" })
  }

  if (!match_id || !phase) {
    return res.status(400).json({ error: "match_id and phase required" })
  }

  const { error } = await supabase
    .from("event_control")
    .upsert({ match_id, phase }, { onConflict: "match_id" })

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ message: "Phase updated" })
}
