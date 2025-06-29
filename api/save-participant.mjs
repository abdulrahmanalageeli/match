// /pages/api/save-participant.mjs
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  const { assigned_number, q1, q2, q3, q4 } = req.body

  // Use a fixed match_id for now. You can later replace this with event-specific logic.
  const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

  if (!assigned_number || !q1 || !q2 || !q3 || !q4) {
    return res.status(400).json({ error: "Missing required fields" })
  }

  try {
    // Check if this assigned_number already exists
    const { data: existing, error: existingError } = await supabase
      .from("participants")
      .select("id")
      .eq("match_id", match_id)
      .eq("assigned_num", assigned_number)

    if (existingError) throw existingError

    if (existing.length > 0) {
      // Already exists, update instead
      const { error: updateError } = await supabase
        .from("participants")
        .update({ q1, q2, q3, q4 })
        .eq("match_id", match_id)
        .eq("assigned_num", assigned_number)

      if (updateError) throw updateError
    } else {
      // New participant
      const { error: insertError } = await supabase.from("participants").insert([
        {
          assigned_num: assigned_number,
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
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
}
