import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

  try {
    const { data: matches, error } = await supabase
      .from("match_results")
      .select("participant_a_number, participant_b_number, match_type, reason, compatibility_score")
      .eq("match_id", match_id)

    if (error) throw error

    const results = (matches || []).map(match => ({
      with: match.participant_a_number?.toString(),
      partner: match.participant_b_number?.toString(),
      type: match.match_type || "غير محدد",
      reason: match.reason || "السبب غير متوفر",
      score: match.compatibility_score ?? 0,
    }))

    return res.status(200).json({ matches: results })
  } catch (err) {
    console.error("Error in get-my-matches:", err)
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
}
