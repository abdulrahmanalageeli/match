// /api/save-participant.mjs (Vercel serverless function)
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

export default async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  try {
    const { assigned_number, summary, survey_data } = req.body
    const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

    if (!req.body?.assigned_number) return res.status(400).json({ error: 'Missing assigned_number' })
    
    // Check for either survey data or summary
    if (!survey_data && !summary) {
      return res.status(400).json({ error: 'Missing survey data or summary' })
    }

    const { data: existing, error: existingError } = await supabase
      .from("participants")
      .select("id")
      .eq("match_id", match_id)
      .eq("assigned_number", assigned_number)

    if (existingError) throw existingError

    const updateFields = {}

    // Handle survey data (only if present)
    if (survey_data) {
    const answers = req.body.survey_data?.answers || {};
    const redLinesRaw = answers.redLines;
    const redLines = Array.isArray(redLinesRaw)
      ? redLinesRaw
      : typeof redLinesRaw === "string"
        ? redLinesRaw.split(",").map(s => s.trim()).filter(Boolean)
        : [];
    updateFields.survey_data = {
      ...survey_data,
      answers: {
        ...answers,
        redLines,
      },
      }
    }

    // Allow saving summary alone or with form data
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
