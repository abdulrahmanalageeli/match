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
    const { assigned_number, round, history_only } = req.body
    
    if (!assigned_number) {
      return res.status(400).json({ error: "assigned_number is required" })
    }

    const roundNumber = typeof round === 'number' ? round : 1;

    console.log("Looking for matches for player:", assigned_number, "in round:", roundNumber, "history_only:", history_only) // Debug log

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

    let results = (matches || []).map(match => {
      // Ensure both are numbers for comparison
      const isPlayerA = Number(match.participant_a_number) === Number(assigned_number)
      const currentPlayer = isPlayerA ? match.participant_a_number : match.participant_b_number
      const matchedWith = isPlayerA ? match.participant_b_number : match.participant_a_number
      
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

    // If history_only is true, filter to only show completed matches
    if (history_only === true) {
      try {
        // Get completed matches for this participant
        const { data: completions, error: completionError } = await supabase
          .from("match_completions")
          .select("round")
          .eq("match_id", match_id)
          .eq("participant_number", assigned_number)

        if (completionError) {
          console.warn("Completion table might not exist yet:", completionError)
          // If table doesn't exist, return empty results for history
          results = []
        } else {
          const completedRounds = new Set(completions?.map(c => c.round) || [])
          results = results.filter(match => completedRounds.has(match.round))
        }
      } catch (err) {
        console.warn("Error checking completions:", err)
        // If there's any error, return empty results for history
        results = []
      }
    }

    console.log("Processed results:", results) // Debug log

    return res.status(200).json({ matches: results })
  } catch (err) {
    console.error("Error in get-my-matches:", err)
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
}

if (req.method === "DELETE") {
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
}
