// /api/save-participant.mjs (Vercel serverless function)

import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

export default async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  try {
    const { assigned_number, q1, q2, q3, q4 } = req.body

    const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

    if (!assigned_number || !q1 || !q2 || !q3 || !q4) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    // Check for existing
    const { data: existing, error: existingError } = await supabase
      .from("participants")
      .select("id")
      .eq("match_id", match_id)
      .eq("assigned_number", assigned_number)

    if (existingError) throw existingError

    if (existing && existing.length > 0) {
      // Update
      const { error: updateError } = await supabase
        .from("participants")
        .update({ q1, q2, q3, q4 })
        .eq("match_id", match_id)
        .eq("assigned_number", assigned_number)

      if (updateError) throw updateError
    } else {
      // Insert
      const { error: insertError } = await supabase.from("participants").insert([
        {
          assigned_number: assigned_number,
          match_id,
          q1,
          q2,
          q3,
          q4,
          is_host: false,
        },
      ])
      if (insertError) throw insertError
    }

    return res.status(200).json({ message: "Saved", match_id })
  } catch (err) {
    console.error("Server Error:", err)
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
}
