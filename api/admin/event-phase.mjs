// /api/event-phase.mjs

import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  const { match_id } = req.body
  if (!match_id) {
    return res.status(400).json({ error: "match_id required" })
  }

  const { data, error } = await supabase
  .from("event_state")
  .select("phase")
    .eq("match_id", match_id)
    .single()

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ phase: data?.phase || "waiting" })
}
