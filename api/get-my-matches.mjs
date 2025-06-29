// /pages/api/get-my-matches.mjs
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  const { assigned_number } = req.body
  const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

  if (!assigned_number) {
    return res.status(400).json({ error: "assigned_number is required" })
  }

  try {
    // 1. Get all match rows where this number is either A or B
    const { data: matches, error: matchesError } = await supabase
      .from("match_results")
      .select("participant_a_number, participant_b_number, match_type, reason")
      .eq("match_id", match_id)
      .or(`participant_a_number.eq.${assigned_number},participant_b_number.eq.${assigned_number}`)

    if (matchesError) throw matchesError

    if (!matches || matches.length === 0) {
      return res.status(200).json({ matches: [] })
    }

    // 2. Construct the output
    const results = matches.map((match) => {
      const isA = match.participant_a_number === assigned_number
      const otherNum = isA ? match.participant_b_number : match.participant_a_number

      return {
        with: otherNum !== 0 ? otherNum.toString() : "؟",
        type: match.match_type,
        reason: match.reason || "السبب غير متوفر",
      }
    })

    return res.status(200).json({ matches: results })
  } catch (err) {
    console.error("Error in get-my-matches:", err)
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
}
