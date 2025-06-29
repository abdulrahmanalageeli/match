// /api/admin/participants.mjs

import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  "https://your-project.supabase.co", // ← put your full Supabase URL
  "your-anon-key" // ← put your actual anon key
)

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Only GET allowed" })
  }

  const match_id = "00000000-0000-0000-0000-000000000000" // Or make this static/custom if you want

  try {
    const { data, error } = await supabase
      .from("participants")
      .select("*")
      .eq("match_id", match_id)
      .order("assigned_number", { ascending: true })

    if (error) throw error

    return res.status(200).json({ participants: data })
  } catch (err) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
}
