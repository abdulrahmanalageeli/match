import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  try {
    const { assigned_number, partner_number, wants_match, round = 1 } = req.body
    const match_id = "00000000-0000-0000-0000-000000000000"

    if (!assigned_number || !partner_number) {
      return res.status(400).json({ error: "Missing assigned_number or partner_number" })
    }

    if (typeof wants_match !== 'boolean') {
      return res.status(400).json({ error: "wants_match must be a boolean" })
    }

    // Find the match result for this pair
    const { data: matchResults, error: findError } = await supabase
      .from("match_results")
      .select("*")
      .eq("match_id", match_id)
      .eq("round", round)
      .or(`and(participant_a_number.eq.${assigned_number},participant_b_number.eq.${partner_number}),and(participant_a_number.eq.${partner_number},participant_b_number.eq.${assigned_number})`)

    if (findError) {
      console.error("Error finding match result:", findError)
      return res.status(500).json({ error: "Failed to find match result" })
    }

    if (!matchResults || matchResults.length === 0) {
      return res.status(404).json({ error: "Match result not found" })
    }

    const matchResult = matchResults[0]
    
    // Determine which participant is making the preference
    const isParticipantA = matchResult.participant_a_number === assigned_number
    const updateField = isParticipantA ? 'participant_a_wants_match' : 'participant_b_wants_match'
    const partnerField = isParticipantA ? 'participant_b_wants_match' : 'participant_a_wants_match'
    
    // Update the match preference
    const updateData = {
      [updateField]: wants_match
    }
    
    // Check if both participants want to match to set mutual_match
    const partnerWantsMatch = matchResult[partnerField]
    if (partnerWantsMatch !== null) {
      updateData.mutual_match = wants_match && partnerWantsMatch
    }

    const { error: updateError } = await supabase
      .from("match_results")
      .update(updateData)
      .eq("id", matchResult.id)

    if (updateError) {
      console.error("Error updating match preference:", updateError)
      return res.status(500).json({ error: "Failed to update match preference" })
    }

    // If both participants want to match, fetch partner information
    let partnerInfo = null
    if (updateData.mutual_match) {
      const { data: partnerData, error: partnerError } = await supabase
        .from("participants")
        .select("name, age, phone_number")
        .eq("assigned_number", partner_number)
        .eq("match_id", match_id)
        .single()

      if (!partnerError && partnerData) {
        partnerInfo = {
          name: partnerData.name,
          age: partnerData.age,
          phone_number: partnerData.phone_number
        }
      }
    }

    return res.status(200).json({
      success: true,
      mutual_match: updateData.mutual_match || false,
      partner_info: partnerInfo
    })

  } catch (error) {
    console.error("Unexpected error in match-preference:", error)
    return res.status(500).json({ error: "Unexpected error occurred" })
  }
}
