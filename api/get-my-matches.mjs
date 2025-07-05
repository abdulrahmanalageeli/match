import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method === "POST") {
    try {
      const { assigned_number, round, match_type = "individual" } = req.body
      const match_id = "00000000-0000-0000-0000-000000000000"

      if (!assigned_number) {
        return res.status(400).json({ error: "assigned_number is required" })
      }

      if (match_type === "group") {
        // Get group matches
        const { data: groupMatches, error: groupError } = await supabase
          .from("group_matches")
          .select("*")
          .eq("match_id", match_id)
          .contains("participant_numbers", [assigned_number])

        if (groupError) {
          console.error("Group match error:", groupError)
          return res.status(500).json({ error: "Failed to fetch group matches" })
        }

        const results = (groupMatches || []).map(match => ({
          group_id: match.group_id,
          participants: match.participant_numbers.filter(p => p !== assigned_number),
          reason: match.reason || "السبب غير متوفر",
          score: match.compatibility_score ?? 0,
          table_number: match.table_number || null,
        }))

        return res.status(200).json({ matches: results })
      } else {
        // Get individual matches
        const { data: matches, error } = await supabase
          .from("match_results")
          .select("*")
          .eq("match_id", match_id)
          .or(`participant_a_number.eq.${assigned_number},participant_b_number.eq.${assigned_number},participant_c_number.eq.${assigned_number},participant_d_number.eq.${assigned_number}`)
          .order("round", { ascending: true })

        if (error) {
          console.error("Match error:", error)
          return res.status(500).json({ error: "Failed to fetch matches" })
        }

        const results = (matches || []).map(match => {
          const participantNumbers = [match.participant_a_number, match.participant_b_number, match.participant_c_number, match.participant_d_number].filter(n => n && n > 0)
          const matchedWith = participantNumbers.filter(n => n.toString() !== assigned_number.toString())
          
          return {
            with: matchedWith,
            partner: participantNumbers.filter(n => n.toString() === assigned_number.toString())[0] || null,
            type: match.match_type || "غير محدد",
            reason: match.reason || "السبب غير متوفر",
            score: match.compatibility_score ?? 0,
            round: match.round ?? 1,
            table_number: match.table_number || null,
          }
        })

        // Filter by round if specified
        if (round) {
          const filteredResults = results.filter(match => match.round === round)
          return res.status(200).json({ matches: filteredResults })
        }

        return res.status(200).json({ matches: results })
      }
    } catch (err) {
      console.error("Error in get-my-matches:", err)
      return res.status(500).json({ error: err.message || "Unexpected error" })
    }
  } else if (req.method === "DELETE") {
    // Only allow if admin_token matches
    if (req.body?.admin_token !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ error: "Forbidden" })
    }
    const match_id = "00000000-0000-0000-0000-000000000000"
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
