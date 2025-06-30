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
    const { assigned_number, q1, q2, q3, q4, summary } = req.body
    const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

    if (!assigned_number) {
      return res.status(400).json({ error: "Missing assigned_number" })
    }

    const { data: existing, error: existingError } = await supabase
      .from("participants")
      .select("id")
      .eq("match_id", match_id)
      .eq("assigned_number", assigned_number)

    if (existingError) throw existingError

    const updateFields = {}

    // Allow saving q1–q4 only if all exist
    if (q1 && q2 && q3 && q4) {
      updateFields.q1 = q1
      updateFields.q2 = q2
      updateFields.q3 = q3
      updateFields.q4 = q4
    }

    // Allow saving summary alone or with full form
    if (summary) {
      updateFields.summary = summary
    }

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ error: "No valid fields to save" })
    }

    if (existing && existing.length > 0) {
      // ✅ Update existing
      const { error: updateError } = await supabase
        .from("participants")
        .update(updateFields)
        .eq("match_id", match_id)
        .eq("assigned_number", assigned_number)

      if (updateError) throw updateError
    } else {
      // ✅ Insert new
      const { error: insertError } = await supabase.from("participants").insert([
        {
          assigned_number,
          match_id,
          is_host: false,
          ...updateFields,
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
