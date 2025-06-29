// /pages/api/get-my-matches.mjs
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
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
    const { data: me, error: fetchMeError } = await supabase
      .from("participants")
      .select("id")
      .eq("match_id", match_id)
      .eq("assigned_num", assigned_number)
      .single()

    if (fetchMeError || !me) throw new Error("Participant not found")

    const myId = me.id

    const { data: matches, error: matchesError } = await supabase
      .from("match_results")
      .select("participant_a_id, participant_b_id, match_type, reason")
      .eq("match_id", match_id)
      .or(`participant_a_id.eq.${myId},participant_b_id.eq.${myId}`)

    if (matchesError) throw matchesError

    const pairedIds = matches.map((m) =>
      m.participant_a_id === myId ? m.participant_b_id : m.participant_a_id
    )

    const { data: others, error: namesError } = await supabase
      .from("participants")
      .select("id, assigned_num")
      .in("id", pairedIds)

    const results = matches.map((match) => {
      const isA = match.participant_a_id === myId
      const otherId = isA ? match.participant_b_id : match.participant_a_id
      const other = others.find((p) => p.id === otherId)
      return {
        with: other?.assigned_num ?? "??",
        type: match.match_type,
        reason: match.reason,
      }
    })

    return res.status(200).json({ matches: results })
  } catch (err) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
}
