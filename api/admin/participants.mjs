import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Only DELETE allowed" })
  }

  const { assigned_number } = req.body
  const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

  if (!assigned_number) {
    return res.status(400).json({ error: "assigned_number is required" })
  }

  try {
    const { error } = await supabase
      .from("participants")
      .delete()
      .eq("match_id", match_id)
      .eq("assigned_number", assigned_number)

    if (error) throw error

    return res.status(200).json({ message: "Participant deleted" })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
