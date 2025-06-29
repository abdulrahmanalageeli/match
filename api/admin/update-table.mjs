import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  const { assigned_number, table_number } = req.body
  const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

  if (!assigned_number || typeof table_number !== "number") {
    return res.status(400).json({ error: "Missing fields" })
  }

  try {
    const { error } = await supabase
      .from("participants")
      .update({ table_number })
      .eq("assigned_number", assigned_number)
      .eq("match_id", match_id)

    if (error) throw error
    return res.status(200).json({ message: "Updated table successfully" })
  } catch (err) {
    console.error("Update error:", err)
    return res.status(500).json({ error: err.message })
  }
}
