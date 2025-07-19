import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"
import munkres from "munkres-js"

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const STATIC_MATCH_ID = "00000000-0000-0000-0000-000000000000"

export default async function handler(req, res) {
  // Add error logging for debugging
  if (!process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
    console.error("Missing SUPABASE_URL environment variable");
    return res.status(500).json({ error: "Database configuration error - missing SUPABASE_URL" });
  }
  
  if (!process.env.SUPABASE_ANON_KEY && !process.env.VITE_SUPABASE_ANON_KEY) {
    console.error("Missing SUPABASE_ANON_KEY environment variable");
    return res.status(500).json({ error: "Database configuration error - missing SUPABASE_ANON_KEY" });
  }

  const method = req.method
  const action = req.query.action || req.body?.action

  console.log(`API Request: ${method} ${action}`);

  try {
    // 🔹 GET participants
    if (method === "GET") {
      const { data, error } = await supabase
        .from("participants")
        .select("id, assigned_number, table_number, survey_data, summary")
        .eq("match_id", STATIC_MATCH_ID)
        .neq("assigned_number", 9999)  // Exclude organizer participant
        .order("assigned_number", { ascending: true })

      if (error) {
        console.error("Database error:", error);
        return res.status(500).json({ error: error.message })
      }
      return res.status(200).json({ participants: data })
    }

    // 🔹 POST actions
    if (method === "POST") {
      if (!action) {
        return res.status(400).json({ error: "Missing action parameter" });
      }

      console.log(`Processing action: ${action}`);

      if (action === "participants") {
        const { data, error } = await supabase
          .from("participants")
          .select("id, assigned_number, table_number, survey_data, summary")
          .eq("match_id", STATIC_MATCH_ID)
          .neq("assigned_number", 9999)  // Exclude organizer participant
          .order("assigned_number", { ascending: true })

        if (error) {
          console.error("Database error:", error);
          return res.status(500).json({ error: error.message })
        }
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
          console.error("event-phase error:", error);
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
        if (error) {
          console.error("set-announcement error:", error);
          return res.status(500).json({ error: error.message })
        }
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
        if (error) {
          console.error("clear-announcement error:", error);
          return res.status(500).json({ error: error.message })
        }
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
        if (error) {
          console.error("set-emergency-pause error:", error);
          return res.status(500).json({ error: error.message })
        }
        return res.status(200).json({ message: `Emergency ${paused ? 'pause' : 'resume'} set` })
      }

      if (action === "set-total-rounds") {
        const { total_rounds } = req.body
        if (!total_rounds || total_rounds < 2 || total_rounds > 6) {
          return res.status(400).json({ error: "Total rounds must be between 2 and 6" })
        }
        const { error } = await supabase
          .from("event_state")
          .upsert({ 
            match_id: STATIC_MATCH_ID, 
            total_rounds: total_rounds
          }, { onConflict: "match_id" })
        if (error) {
          console.error("set-total-rounds error:", error);
          return res.status(500).json({ error: error.message })
        }
        return res.status(200).json({ message: `Total rounds set to ${total_rounds}` })
      }

      if (action === "get-event-state") {
        console.log("Fetching event state for match_id:", STATIC_MATCH_ID);
        const { data, error } = await supabase
          .from("event_state")
          .select("phase, announcement, announcement_type, announcement_time, emergency_paused, pause_time, current_round, total_rounds")
          .eq("match_id", STATIC_MATCH_ID)
          .single()

        if (error) {
          console.error("get-event-state error:", error);
          // If no event state exists, return default values
          if (error.code === 'PGRST116') {
            console.log("No event state found, returning defaults");
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
        console.log("Event state found:", data);
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
          console.log("Getting participant stats for match_id:", STATIC_MATCH_ID);
          
          // Get total participants
          const { data: totalParticipants, error: totalError } = await supabase
            .from("participants")
            .select("assigned_number")
            .eq("match_id", STATIC_MATCH_ID)
            .neq("assigned_number", 9999)  // Exclude organizer participant

          if (totalError) {
            console.error("Total participants error:", totalError);
            return res.status(500).json({ error: totalError.message })
          }

          console.log("Total participants found:", totalParticipants?.length || 0);

          // Get participants who completed form
          const { data: formCompleted, error: formError } = await supabase
            .from("participants")
            .select("assigned_number")
            .eq("match_id", STATIC_MATCH_ID)
            .neq("assigned_number", 9999)  // Exclude organizer participant
            .not("survey_data", "is", null)

          if (formError) {
            console.error("Form completed error:", formError);
            return res.status(500).json({ error: formError.message })
          }

          console.log("Form completed participants:", formCompleted?.length || 0);

          // Get current event state
          const { data: eventState, error: eventError } = await supabase
            .from("event_state")
            .select("phase, current_round")
            .eq("match_id", STATIC_MATCH_ID)
            .single()

          if (eventError && eventError.code !== 'PGRST116') {
            console.error("Event state error:", eventError);
            return res.status(500).json({ error: eventError.message })
          }

          const currentPhase = eventState?.phase || "registration"
          const currentRound = eventState?.current_round || 1

          console.log("Current phase:", currentPhase, "Current round:", currentRound);

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
                .select("participant_a_number, participant_b_number, participant_c_number, participant_d_number")
                .eq("match_id", STATIC_MATCH_ID)
                .eq("round", previousRound)
              
              if (roundError) {
                console.error("Round completed error:", roundError);
              } else if (roundCompleted) {
                const roundParticipants = new Set()
                roundCompleted.forEach(match => {
                  if (match.participant_a_number > 0 && match.participant_a_number !== 9999) roundParticipants.add(match.participant_a_number)
                  if (match.participant_b_number > 0 && match.participant_b_number !== 9999) roundParticipants.add(match.participant_b_number)
                  if (match.participant_c_number > 0 && match.participant_c_number !== 9999) roundParticipants.add(match.participant_c_number)
                  if (match.participant_d_number > 0 && match.participant_d_number !== 9999) roundParticipants.add(match.participant_d_number)
                })
                waitingCount = roundParticipants.size
              }
            }
          } else if (currentPhase === "group_phase") {
            // Count participants who completed all rounds
            const { data: allRoundsCompleted, error: allRoundsError } = await supabase
              .from("match_results")
              .select("participant_a_number, participant_b_number, participant_c_number, participant_d_number")
              .eq("match_id", STATIC_MATCH_ID)
              .in("round", [1, 2, 3, 4])
            
            if (allRoundsError) {
              console.error("All rounds completed error:", allRoundsError);
            } else if (allRoundsCompleted) {
              const allParticipants = new Set()
              allRoundsCompleted.forEach(match => {
                if (match.participant_a_number > 0 && match.participant_a_number !== 9999) allParticipants.add(match.participant_a_number)
                if (match.participant_b_number > 0 && match.participant_b_number !== 9999) allParticipants.add(match.participant_b_number)
                if (match.participant_c_number > 0 && match.participant_c_number !== 9999) allParticipants.add(match.participant_c_number)
                if (match.participant_d_number > 0 && match.participant_d_number !== 9999) allParticipants.add(match.participant_d_number)
              })
              waitingCount = allParticipants.size
            }
          }

          // Get current round participants
          if (currentPhase.startsWith("round_")) {
            const { data: currentRoundMatches, error: currentRoundError } = await supabase
              .from("match_results")
              .select("participant_a_number, participant_b_number, participant_c_number, participant_d_number")
              .eq("match_id", STATIC_MATCH_ID)
              .eq("round", currentRound)
            
            if (currentRoundError) {
              console.error("Current round matches error:", currentRoundError);
            } else if (currentRoundMatches) {
              const currentParticipants = new Set()
              currentRoundMatches.forEach(match => {
                if (match.participant_a_number > 0 && match.participant_a_number !== 9999) currentParticipants.add(match.participant_a_number)
                if (match.participant_b_number > 0 && match.participant_b_number !== 9999) currentParticipants.add(match.participant_b_number)
                if (match.participant_c_number > 0 && match.participant_c_number !== 9999) currentParticipants.add(match.participant_c_number)
                if (match.participant_d_number > 0 && match.participant_d_number !== 9999) currentParticipants.add(match.participant_d_number)
              })
              currentRoundParticipants = currentParticipants.size
            }
          }

          const result = {
            total_participants: totalParticipants.length,
            form_completed: formCompleted.length,
            waiting_count: waitingCount,
            current_round_participants: currentRoundParticipants,
            current_phase: currentPhase,
            current_round: currentRound
          };

          console.log("Participant stats result:", result);
          return res.status(200).json(result);
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
          .neq("assigned_number", 9999)  // Exclude organizer participant
          .not("survey_data", "is", null)

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
  } catch (error) {
    console.error("Error processing request:", error)
    return res.status(500).json({ error: "Failed to process the request" })
  }
}
