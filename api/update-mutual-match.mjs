import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  const { token, partner_number, wants_to_match } = req.body
  const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

  if (!token || !partner_number || wants_to_match === undefined) {
    return res.status(400).json({ error: "Token, partner_number, and wants_to_match are required" })
  }

  try {
    // Get participant by token
    const { data: participant, error: participantError } = await supabase
      .from("participants")
      .select("assigned_number")
      .eq("secure_token", token)
      .eq("match_id", match_id)
      .single()

    if (participantError || !participant) {
      return res.status(404).json({ error: "Invalid token or participant not found" })
    }

    // Find the match record between this participant and the partner
    const { data: match, error: matchError } = await supabase
      .from("match_results")
      .select("*")
      .eq("match_id", match_id)
      .eq("round", 1) // Only allow mutual matching after round 1
      .or(`and(participant_a_number.eq.${participant.assigned_number},participant_b_number.eq.${partner_number}),and(participant_a_number.eq.${partner_number},participant_b_number.eq.${participant.assigned_number})`)
      .single()

    if (matchError || !match) {
      return res.status(404).json({ error: "Match record not found for these participants" })
    }

    // Update the mutual match status
    // We need to determine which participant is A and which is B
    const isParticipantA = match.participant_a_number === participant.assigned_number
    const updateData = {}

    if (isParticipantA) {
      // Current participant is A, update participant_a_mutual_match
      updateData.participant_a_wants_match = wants_to_match
    } else {
      // Current participant is B, update participant_b_mutual_match
      updateData.participant_b_wants_match = wants_to_match
    }

    // Check if both participants have responded
    const currentA = match.participant_a_wants_match
    const currentB = match.participant_b_wants_match
    
    let finalA = currentA
    let finalB = currentB
    
    if (isParticipantA) {
      finalA = wants_to_match
    } else {
      finalB = wants_to_match
    }

    // If both participants have responded, set mutual_match accordingly
    if (finalA !== null && finalB !== null) {
      updateData.mutual_match = finalA && finalB
    }

    const { error: updateError } = await supabase
      .from("match_results")
      .update(updateData)
      .eq("id", match.id)

    if (updateError) {
      console.error("Error updating mutual match:", updateError)
      return res.status(500).json({ error: "Failed to update mutual match status" })
    }

    return res.status(200).json({
      success: true,
      message: wants_to_match ? "تم تسجيل رغبتك في المطابقة" : "تم تسجيل عدم رغبتك في المطابقة",
      mutual_match: updateData.mutual_match,
      both_responded: finalA !== null && finalB !== null
    })

  } catch (error) {
    console.error("Update mutual match error:", error)
    return res.status(500).json({ error: error.message || "Unexpected error" })
  }
}
