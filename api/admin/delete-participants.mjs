import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const STATIC_MATCH_ID = "00000000-0000-0000-0000-000000000000"

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  const { assigned_number } = req.body

  if (!assigned_number) {
    return res.status(400).json({ error: "assigned_number is required" })
  }

  try {
    const { error } = await supabase
      .from("participants")
      .delete()
      .eq("match_id", STATIC_MATCH_ID)
      .eq("assigned_number", assigned_number) // ✅ matches your Supabase schema

    if (error) throw error

    return res.status(200).json({ message: "Participant deleted" })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
