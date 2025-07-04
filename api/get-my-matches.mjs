import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method === "POST") {
    const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

    try {
      const { assigned_number, round } = req.body
      
      if (!assigned_number) {
        return res.status(400).json({ error: "assigned_number is required" })
      }

      const roundNumber = typeof round === 'number' ? round : 1;

      console.log("Looking for matches for player:", assigned_number, "in round:", roundNumber) // Debug log

      // If round is provided, filter by round, otherwise fetch all rounds
      let query = supabase
        .from("match_results")
        .select("participant_a_number, participant_b_number, match_type, reason, compatibility_score, round, table_number")
        .eq("match_id", match_id)
        .or(`participant_a_number.eq.${assigned_number},participant_b_number.eq.${assigned_number}`)

      if (typeof round === 'number') {
        query = query.eq("round", round)
      }

      const { data: matches, error } = await query

      if (error) throw error

      console.log("Raw matches from Supabase:", matches) // Debug log

      const results = (matches || []).map(match => {
        // Determine which participant is the current player and which is their match
        const isPlayerA = match.participant_a_number?.toString() === assigned_number?.toString()
        const currentPlayer = isPlayerA ? match.participant_a_number?.toString() : match.participant_b_number?.toString()
        const matchedWith = isPlayerA ? match.participant_b_number?.toString() : match.participant_a_number?.toString()
        
        return {
          with: matchedWith,
          partner: currentPlayer,
          type: match.match_type || "غير محدد",
          reason: match.reason || "السبب غير متوفر",
          score: match.compatibility_score ?? 0,
          round: match.round ?? 1,
          table_number: match.table_number || null,
        }
      })

      console.log("Processed results:", results) // Debug log

      return res.status(200).json({ matches: results })
    } catch (err) {
      console.error("Error in get-my-matches:", err)
      return res.status(500).json({ error: err.message || "Unexpected error" })
    }
  } else if (req.method === "DELETE") {
    // Only allow if admin_token matches
    if (req.body?.admin_token !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ error: "Forbidden" })
    }
    const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"
    const { error } = await supabase
      .from("match_results")
      .delete()
      .eq("match_id", match_id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true })
  } else {
    return res.status(405).json({ error: "Method not allowed" })
  }
}
