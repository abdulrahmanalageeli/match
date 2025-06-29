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

  const { phase } = req.body
  const match_id = "00000000-0000-0000-0000-000000000000" // 🔒 hardcoded for simplicity

  if (!phase) {
    return res.status(400).json({ error: "phase is required" })
  }

  const { error } = await supabase
    .from("event_state")
    .upsert({ match_id, phase }, { onConflict: "match_id" })

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ message: "Phase updated" })
}
