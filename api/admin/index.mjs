import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"
import munkres from "munkres-js"

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const STATIC_MATCH_ID = "00000000-0000-0000-0000-000000000000"

export default async function handler(req, res) {
  const method = req.method
  const action = req.query.action || req.body?.action

  // 🔹 GET participants
  if (method === "GET") {
    const { data, error } = await supabase
      .from("participants")
      .select("id, assigned_number, table_number, q1, q2, q3, q4")
      .eq("match_id", STATIC_MATCH_ID)
      .order("assigned_number", { ascending: true })

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ participants: data })
  }

  // 🔹 POST actions
  if (method === "POST") {
    if (action === "participants") {
      const { data, error } = await supabase
        .from("participants")
        .select("id, assigned_number, table_number, q1, q2, q3, q4")
        .eq("match_id", STATIC_MATCH_ID)
        .order("assigned_number", { ascending: true })

      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ participants: data })
    }

    if (action === "delete") {
      const { assigned_number } = req.body
      const { error } = await supabase
        .from("participants")
        .delete()
        .eq("assigned_number", assigned_number)
        .eq("match_id", STATIC_MATCH_ID)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ message: "Deleted successfully" })
    }

    if (action === "set-phase") {
      const { phase } = req.body
      const { error } = await supabase
        .from("event_state")
        .upsert({ match_id: STATIC_MATCH_ID, phase }, { onConflict: "match_id" })
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ message: "Phase updated" })
    }

    if (action === "set-table") {
      const { data: participants } = await supabase
        .from("participants")
        .select("id, assigned_number")
        .eq("match_id", STATIC_MATCH_ID)
        .order("assigned_number")

      const updates = participants.map((p, idx) => ({
        id: p.id,
        table_number: Math.floor(idx / 2) + 1,
      }))

      const { error } = await supabase.from("participants").upsert(updates)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ message: "Tables assigned" })
    }

    if (action === "update-table") {
      const { assigned_number, table_number } = req.body
      const { error } = await supabase
        .from("participants")
        .update({ table_number })
        .eq("assigned_number", assigned_number)
        .eq("match_id", STATIC_MATCH_ID)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ message: "Table updated" })
    }

    if (action === "event-phase") {
      const { data, error } = await supabase
        .from("event_state")
        .select("phase")
        .eq("match_id", STATIC_MATCH_ID)
        .single()

      if (error) {
        // If no event state exists, return "registration" as default
        if (error.code === 'PGRST116') {
          return res.status(200).json({ phase: "registration" })
        }
        return res.status(500).json({ error: error.message })
      }
      return res.status(200).json({ phase: data.phase })
    }

    if (action === "set-announcement") {
      const { message, type = "info" } = req.body
      const { error } = await supabase
        .from("event_state")
        .upsert({ 
          match_id: STATIC_MATCH_ID, 
          announcement: message,
          announcement_type: type,
          announcement_time: new Date().toISOString()
        }, { onConflict: "match_id" })
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ message: "Announcement set" })
    }

    if (action === "clear-announcement") {
      const { error } = await supabase
        .from("event_state")
        .update({ 
          announcement: null,
          announcement_type: null,
          announcement_time: null
        })
        .eq("match_id", STATIC_MATCH_ID)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ message: "Announcement cleared" })
    }

    if (action === "set-emergency-pause") {
      const { paused } = req.body
      const { error } = await supabase
        .from("event_state")
        .upsert({ 
          match_id: STATIC_MATCH_ID, 
          emergency_paused: paused,
          pause_time: paused ? new Date().toISOString() : null
        }, { onConflict: "match_id" })
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ message: `Emergency ${paused ? 'pause' : 'resume'} set` })
    }

    if (action === "get-event-state") {
      const { data, error } = await supabase
        .from("event_state")
        .select("phase, announcement, announcement_type, announcement_time, emergency_paused, pause_time, current_round, total_rounds")
        .eq("match_id", STATIC_MATCH_ID)
        .single()

      if (error) {
        // If no event state exists, return default values
        if (error.code === 'PGRST116') {
          return res.status(200).json({ 
            phase: "registration",
            announcement: null,
            announcement_type: null,
            announcement_time: null,
            emergency_paused: false,
            pause_time: null,
            current_round: 1,
            total_rounds: 4
          })
        }
        return res.status(500).json({ error: error.message })
      }
      return res.status(200).json({ 
        phase: data.phase,
        announcement: data.announcement,
        announcement_type: data.announcement_type,
        announcement_time: data.announcement_time,
        emergency_paused: data.emergency_paused || false,
        pause_time: data.pause_time,
        current_round: data.current_round || 1,
        total_rounds: data.total_rounds || 4
      })
    }

    if (action === "get-participant-stats") {
      try {
        // Get total participants
        const { data: totalParticipants, error: totalError } = await supabase
          .from("participants")
          .select("assigned_number")
          .eq("match_id", STATIC_MATCH_ID)

        if (totalError) return res.status(500).json({ error: totalError.message })

        // Get participants who completed form
        const { data: formCompleted, error: formError } = await supabase
          .from("participants")
          .select("assigned_number")
          .eq("match_id", STATIC_MATCH_ID)
          .not("q1", "is", null)
          .not("q2", "is", null)
          .not("q3", "is", null)
          .not("q4", "is", null)

        if (formError) return res.status(500).json({ error: formError.message })

        // Get current event state
        const { data: eventState, error: eventError } = await supabase
          .from("event_state")
          .select("phase, current_round")
          .eq("match_id", STATIC_MATCH_ID)
          .single()

        if (eventError && eventError.code !== 'PGRST116') {
          return res.status(500).json({ error: eventError.message })
        }

        const currentPhase = eventState?.phase || "registration"
        const currentRound = eventState?.current_round || 1

        // Calculate waiting count based on phase
        let waitingCount = 0
        let currentRoundParticipants = 0

        if (currentPhase === "waiting") {
          waitingCount = formCompleted.length
        } else if (currentPhase.startsWith("round_")) {
          // Count participants who completed the previous round
          const previousRound = parseInt(currentPhase.split('_')[1]) - 1
          if (previousRound > 0) {
            const { data: roundCompleted, error: roundError } = await supabase
              .from("match_results")
              .select("participant_a_number, participant_b_number")
              .eq("match_id", STATIC_MATCH_ID)
              .eq("round", previousRound)
            
            if (!roundError && roundCompleted) {
              const roundParticipants = new Set()
              roundCompleted.forEach(match => {
                if (match.participant_a_number > 0) roundParticipants.add(match.participant_a_number)
                if (match.participant_b_number > 0) roundParticipants.add(match.participant_b_number)
              })
              waitingCount = roundParticipants.size
            }
          }
        } else if (currentPhase === "group_phase") {
          // Count participants who completed all rounds
          const { data: allRoundsCompleted, error: allRoundsError } = await supabase
            .from("match_results")
            .select("participant_a_number, participant_b_number")
            .eq("match_id", STATIC_MATCH_ID)
            .in("round", [1, 2, 3, 4])
          
          if (!allRoundsError && allRoundsCompleted) {
            const allParticipants = new Set()
            allRoundsCompleted.forEach(match => {
              if (match.participant_a_number > 0) allParticipants.add(match.participant_a_number)
              if (match.participant_b_number > 0) allParticipants.add(match.participant_b_number)
            })
            waitingCount = allParticipants.size
          }
        }

        // Get current round participants
        if (currentPhase.startsWith("round_")) {
          const { data: currentRoundMatches, error: currentRoundError } = await supabase
            .from("match_results")
            .select("participant_a_number, participant_b_number")
            .eq("match_id", STATIC_MATCH_ID)
            .eq("round", currentRound)
          
          if (!currentRoundError && currentRoundMatches) {
            const currentParticipants = new Set()
            currentRoundMatches.forEach(match => {
              if (match.participant_a_number > 0) currentParticipants.add(match.participant_a_number)
              if (match.participant_b_number > 0) currentParticipants.add(match.participant_b_number)
            })
            currentRoundParticipants = currentParticipants.size
          }
        }

        return res.status(200).json({
          total_participants: totalParticipants.length,
          form_completed: formCompleted.length,
          waiting_count: waitingCount,
          current_round_participants: currentRoundParticipants,
          current_phase: currentPhase,
          current_round: currentRound
        })
      } catch (error) {
        console.error("Error getting participant stats:", error)
        return res.status(500).json({ error: "Failed to get participant stats" })
      }
    }

    if (action === "get-waiting-count") {
      // Get participants who have completed form but are waiting for matching
      const { data: formCompleted, error: formError } = await supabase
        .from("participants")
        .select("assigned_number")
        .eq("match_id", STATIC_MATCH_ID)
        .not("q1", "is", null)
        .not("q2", "is", null)
        .not("q3", "is", null)
        .not("q4", "is", null)

      if (formError) return res.status(500).json({ error: formError.message })

      // Get current phase
      const { data: eventState, error: eventError } = await supabase
        .from("event_state")
        .select("phase")
        .eq("match_id", STATIC_MATCH_ID)
        .single()

      if (eventError && eventError.code !== 'PGRST116') {
        return res.status(500).json({ error: eventError.message })
      }

      const currentPhase = eventState?.phase || "registration"
      
      // Count waiting participants based on phase
      let waitingCount = 0
      if (currentPhase === "waiting" || currentPhase.startsWith("round_")) {
        // All form-completed participants are waiting during analysis/matching
        waitingCount = formCompleted.length
      }

      return res.status(200).json({ 
        waiting_count: waitingCount,
        total_participants: formCompleted.length,
        current_phase: currentPhase
      })
    }

    if (action === "advance-phase") {
      const { currentPhase } = req.body
      
      const phaseOrder = [
        "registration", "form", "waiting", "round_1", "waiting_2", 
        "round_2", "waiting_3", "round_3", "waiting_4", "round_4", "group_phase"
      ]
      
      const currentIndex = phaseOrder.indexOf(currentPhase)
      if (currentIndex === -1) {
        return res.status(400).json({ error: "Invalid phase" })
      }
      
      const nextPhase = currentIndex < phaseOrder.length - 1 ? phaseOrder[currentIndex + 1] : currentPhase
      const currentRound = nextPhase.startsWith("round_") ? parseInt(nextPhase.split('_')[1]) : 1
      
      const { error } = await supabase
        .from("event_state")
        .upsert({ 
          match_id: STATIC_MATCH_ID, 
          phase: nextPhase,
          current_round: currentRound,
          total_rounds: 4
        }, { onConflict: "match_id" })
      
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ 
        message: "Phase advanced", 
        new_phase: nextPhase,
        current_round: currentRound
      })
    }
  }
  return res.status(405).json({ error: "Unsupported method or action" })
}
