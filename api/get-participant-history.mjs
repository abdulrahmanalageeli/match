import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  const { token } = req.body
  const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

  if (!token) {
    return res.status(400).json({ error: "Token is required" })
  }

  try {
    // Get participant by token
    const { data: participant, error: participantError } = await supabase
      .from("participants")
      .select("assigned_number, name, age, gender, phone_number")
      .eq("secure_token", token)
      .eq("match_id", match_id)
      .single()

    if (participantError || !participant) {
      return res.status(404).json({ error: "Invalid token or participant not found" })
    }

    // Get all match results for this participant
    const { data: matches, error: matchesError } = await supabase
      .from("match_results")
      .select("*")
      .or(`participant_a_number.eq.${participant.assigned_number},participant_b_number.eq.${participant.assigned_number},participant_c_number.eq.${participant.assigned_number},participant_d_number.eq.${participant.assigned_number},participant_e_number.eq.${participant.assigned_number},participant_f_number.eq.${participant.assigned_number}`)
      .eq("match_id", match_id)
      .order("round", { ascending: true })
      .order("created_at", { ascending: true })

    if (matchesError) {
      console.error("Error fetching matches:", matchesError)
      return res.status(500).json({ error: "Failed to fetch match history" })
    }

    // Get all participant numbers from matches
    const allParticipantNumbers = new Set()
    matches.forEach(match => {
      if (match.participant_a_number) allParticipantNumbers.add(match.participant_a_number)
      if (match.participant_b_number) allParticipantNumbers.add(match.participant_b_number)
      if (match.participant_c_number) allParticipantNumbers.add(match.participant_c_number)
      if (match.participant_d_number) allParticipantNumbers.add(match.participant_d_number)
      if (match.participant_e_number) allParticipantNumbers.add(match.participant_e_number)
      if (match.participant_f_number) allParticipantNumbers.add(match.participant_f_number)
    })

    // Fetch participant data for all participants
    const { data: allParticipants, error: participantsError } = await supabase
      .from("participants")
      .select("assigned_number, name, age, phone_number")
      .in("assigned_number", Array.from(allParticipantNumbers))
      .eq("match_id", match_id)

    if (participantsError) {
      console.error("Error fetching participants:", participantsError)
      return res.status(500).json({ error: "Failed to fetch participant data" })
    }

    // Create a lookup map for participant data
    const participantLookup = new Map()
    allParticipants.forEach(p => {
      participantLookup.set(p.assigned_number, p)
    })

    // Process matches to include partner information
    const processedMatches = matches.map(match => {
      const partners = []
      
      // Get all partners (excluding the current participant)
      const participantNumber = participant.assigned_number
      
      if (match.participant_a_number && match.participant_a_number !== participantNumber) {
        const partnerData = participantLookup.get(match.participant_a_number)
        partners.push({
          number: match.participant_a_number,
          name: partnerData?.name,
          age: partnerData?.age,
          phone_number: partnerData?.phone_number,
          role: 'A'
        })
      }
      
      if (match.participant_b_number && match.participant_b_number !== participantNumber) {
        const partnerData = participantLookup.get(match.participant_b_number)
        partners.push({
          number: match.participant_b_number,
          name: partnerData?.name,
          age: partnerData?.age,
          phone_number: partnerData?.phone_number,
          role: 'B'
        })
      }
      
      if (match.participant_c_number && match.participant_c_number !== participantNumber) {
        const partnerData = participantLookup.get(match.participant_c_number)
        partners.push({
          number: match.participant_c_number,
          name: partnerData?.name,
          age: partnerData?.age,
          phone_number: partnerData?.phone_number,
          role: 'C'
        })
      }
      
      if (match.participant_d_number && match.participant_d_number !== participantNumber) {
        const partnerData = participantLookup.get(match.participant_d_number)
        partners.push({
          number: match.participant_d_number,
          name: partnerData?.name,
          age: partnerData?.age,
          phone_number: partnerData?.phone_number,
          role: 'D'
        })
      }
      
      if (match.participant_e_number && match.participant_e_number !== participantNumber) {
        const partnerData = participantLookup.get(match.participant_e_number)
        partners.push({
          number: match.participant_e_number,
          name: partnerData?.name,
          age: partnerData?.age,
          phone_number: partnerData?.phone_number,
          role: 'E'
        })
      }
      
      if (match.participant_f_number && match.participant_f_number !== participantNumber) {
        const partnerData = participantLookup.get(match.participant_f_number)
        partners.push({
          number: match.participant_f_number,
          name: partnerData?.name,
          age: partnerData?.age,
          phone_number: partnerData?.phone_number,
          role: 'F'
        })
      }

      return {
        id: match.id,
        round: match.round,
        table_number: match.table_number,
        group_number: match.group_number,
        compatibility_score: match.compatibility_score,
        reason: match.reason,
        mutual_match: match.mutual_match,
        conversation_status: match.conversation_status,
        created_at: match.created_at,
        partners: partners,
        is_group: match.group_number !== null,
        match_type: match.match_type || 'محايد'
      }
    })

    // Group matches by round
    const matchesByRound = {}
    processedMatches.forEach(match => {
      if (!matchesByRound[match.round]) {
        matchesByRound[match.round] = []
      }
      matchesByRound[match.round].push(match)
    })

    return res.status(200).json({
      success: true,
      participant: {
        assigned_number: participant.assigned_number,
        name: participant.name,
        age: participant.age,
        gender: participant.gender
      },
      history: matchesByRound,
      total_matches: processedMatches.length
    })

  } catch (error) {
    console.error("Get participant history error:", error)
    return res.status(500).json({ error: error.message || "Unexpected error" })
  }
}
