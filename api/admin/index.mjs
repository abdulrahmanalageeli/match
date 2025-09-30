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
        .select("id, assigned_number, table_number, survey_data, summary, secure_token, PAID, PAID_DONE, phone_number, event_id, name, signup_for_next_event")
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
        const { event_id } = req.body
        let query = supabase
          .from("participants")
          .select("id, assigned_number, table_number, survey_data, summary, secure_token, PAID, PAID_DONE, phone_number, event_id, name, signup_for_next_event")
          .eq("match_id", STATIC_MATCH_ID)
          .neq("assigned_number", 9999)  // Exclude organizer participant
          .order("assigned_number", { ascending: true })
        
        // Add event_id filter if provided
        if (event_id) {
          query = query.eq("event_id", event_id)
          console.log(`🔍 Filtering participants by event_id: ${event_id}`)
        }
        
        const { data, error } = await query

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
        
        // Extract current round from phase if it's a round phase
        let current_round = 1;
        if (phase && phase.startsWith("round_")) {
          current_round = parseInt(phase.split('_')[1]) || 1;
        }
        
        const { error } = await supabase
          .from("event_state")
          .upsert({ 
            match_id: STATIC_MATCH_ID, 
            phase, 
            current_round,
            total_rounds: 1
          }, { onConflict: "match_id" })
        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ message: "Phase updated - all players will transition immediately" })
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
          .select("phase, announcement, announcement_type, announcement_time, emergency_paused, pause_time, current_round, total_rounds, global_timer_active, global_timer_start_time, global_timer_duration, global_timer_round")
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
              total_rounds: 1,
              global_timer_active: false,
              global_timer_start_time: null,
              global_timer_duration: 1800,
              global_timer_round: null
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
          total_rounds: data.total_rounds || 4,
          global_timer_active: data.global_timer_active || false,
          global_timer_start_time: data.global_timer_start_time,
          global_timer_duration: data.global_timer_duration || 1800,
          global_timer_round: data.global_timer_round
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
                .select("participant_a_number, participant_b_number, participant_c_number, participant_d_number, participant_e_number, participant_f_number")
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
                  if (match.participant_e_number > 0 && match.participant_e_number !== 9999) roundParticipants.add(match.participant_e_number)
                  if (match.participant_f_number > 0 && match.participant_f_number !== 9999) roundParticipants.add(match.participant_f_number)
                })
                waitingCount = roundParticipants.size
              }
            }
          } else if (currentPhase === "group_phase") {
            // Count participants who completed all rounds
            const { data: allRoundsCompleted, error: allRoundsError } = await supabase
              .from("match_results")
              .select("participant_a_number, participant_b_number, participant_c_number, participant_d_number, participant_e_number, participant_f_number")
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
                if (match.participant_e_number > 0 && match.participant_e_number !== 9999) allParticipants.add(match.participant_e_number)
                if (match.participant_f_number > 0 && match.participant_f_number !== 9999) allParticipants.add(match.participant_f_number)
              })
              waitingCount = allParticipants.size
            }
          }

          // Get current round participants
          if (currentPhase.startsWith("round_")) {
            const { data: currentRoundMatches, error: currentRoundError } = await supabase
              .from("match_results")
              .select("participant_a_number, participant_b_number, participant_c_number, participant_d_number, participant_e_number, participant_f_number")
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
                if (match.participant_e_number > 0 && match.participant_e_number !== 9999) currentParticipants.add(match.participant_e_number)
                if (match.participant_f_number > 0 && match.participant_f_number !== 9999) currentParticipants.add(match.participant_f_number)
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
          "registration", "form", "waiting", "round_1" /* "waiting_2", 
          "round_2", "waiting_3", "round_3", "waiting_4", "round_4", "group_phase" */
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
            total_rounds: 1
          }, { onConflict: "match_id" })
        
        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ 
          message: "Phase advanced", 
          new_phase: nextPhase,
          current_round: currentRound
        })
      }
    }

    if (action === "start-global-timer") {
      try {
        const { match_id, round, duration = 1800 } = req.body
        const now = new Date().toISOString()
        
        // Update event state with global timer info
        const { error } = await supabase
          .from("event_state")
          .update({
            global_timer_active: true,
            global_timer_start_time: now,
            global_timer_duration: duration,
            global_timer_round: round
          })
          .eq("match_id", match_id)
        
        if (error) {
          console.error("Error starting global timer:", error)
          return res.status(500).json({ error: "Failed to start global timer" })
        }
        
        return res.status(200).json({ success: true, message: "Global timer started successfully" })
      } catch (err) {
        console.error("Error starting global timer:", err)
        return res.status(500).json({ error: "Failed to start global timer" })
      }
    }

    if (action === "end-global-timer") {
      try {
        const { match_id } = req.body
        
        // Update event state to end global timer
        const { error } = await supabase
          .from("event_state")
          .update({
            global_timer_active: false,
            global_timer_start_time: null,
            global_timer_duration: null,
            global_timer_round: null
          })
          .eq("match_id", match_id)
        
        if (error) {
          console.error("Error ending global timer:", error)
          return res.status(500).json({ error: "Failed to end global timer" })
        }
        
        return res.status(200).json({ success: true, message: "Global timer ended successfully" })
      } catch (err) {
        console.error("Error ending global timer:", err)
        return res.status(500).json({ error: "Failed to end global timer" })
      }
    }

    if (action === "set-results-visibility") {
      try {
        const { visible } = req.body
        console.log(`Setting results visibility to: ${visible} for match_id: ${STATIC_MATCH_ID}`)
        
        // First try to update existing record
        const { data: updateData, error: updateError } = await supabase
          .from("event_state")
          .update({ 
            results_visible: visible
          })
          .eq("match_id", STATIC_MATCH_ID)
          .select()

        if (updateError) {
          console.error("Error updating results visibility:", updateError)
          
          // If update failed, try to insert a new record
          console.log("Update failed, trying to insert new record...")
          const { data: insertData, error: insertError } = await supabase
            .from("event_state")
            .insert({
              match_id: STATIC_MATCH_ID,
              results_visible: visible,
              phase: 'waiting'
            })
            .select()

          if (insertError) {
            console.error("Error inserting event_state record:", insertError)
            return res.status(500).json({ error: `Database error: ${insertError.message}` })
          }
          
          console.log("Successfully inserted new event_state record:", insertData)
        } else {
          console.log("Successfully updated results visibility:", updateData)
        }

        return res.status(200).json({ message: `Results ${visible ? 'shown' : 'hidden'}` })
      } catch (err) {
        console.error("Error setting results visibility:", err)
        return res.status(500).json({ error: "Failed to set results visibility" })
      }
    }

    if (action === "get-results-visibility") {
      try {
        console.log(`Getting results visibility for match_id: ${STATIC_MATCH_ID}`)
        
        const { data, error } = await supabase
          .from("event_state")
          .select("results_visible")
          .eq("match_id", STATIC_MATCH_ID)
          .single()

        if (error) {
          console.error("Error getting results visibility:", error)
          
          // If no record exists, return default (true)
          if (error.code === 'PGRST116') {
            console.log("No event_state record found, returning default visibility (true)")
            return res.status(200).json({ visible: true })
          }
          
          return res.status(500).json({ error: error.message })
        }

        const visible = data?.results_visible !== false // Default to true if null/undefined
        console.log(`Results visibility retrieved: ${visible}`)
        return res.status(200).json({ visible })
      } catch (err) {
        console.error("Error getting results visibility:", err)
        return res.status(500).json({ error: "Failed to get results visibility" })
      }
    }

    if (action === "get-max-event-id") {
      try {
        console.log("Getting maximum event ID from participants and match_results")
        
        // Check both participants and match_results tables to get the true maximum
        const [participantsResult, matchResultsResult] = await Promise.all([
          supabase
            .from("participants")
            .select("event_id")
            .order("event_id", { ascending: false })
            .limit(1)
            .single(),
          supabase
            .from("match_results")
            .select("event_id")
            .order("event_id", { ascending: false })
            .limit(1)
            .single()
        ])

        let maxEventId = 1

        // Get max from participants table
        if (!participantsResult.error && participantsResult.data?.event_id) {
          maxEventId = Math.max(maxEventId, participantsResult.data.event_id)
        }

        // Get max from match_results table
        if (!matchResultsResult.error && matchResultsResult.data?.event_id) {
          maxEventId = Math.max(maxEventId, matchResultsResult.data.event_id)
        }

        console.log(`Maximum event ID retrieved: ${maxEventId}`)
        return res.status(200).json({ max_event_id: maxEventId })
      } catch (err) {
        console.error("Error getting max event ID:", err)
        return res.status(500).json({ error: "Failed to get max event ID" })
      }
    }

    if (action === "set-current-event-id") {
      try {
        const { event_id } = req.body
        console.log(`Setting current event ID to: ${event_id}`)
        
        if (!event_id || event_id < 1) {
          return res.status(400).json({ error: "Invalid event_id. Must be a positive integer." })
        }

        // Store current event ID in event_state table
        const { error } = await supabase
          .from("event_state")
          .upsert({ 
            match_id: STATIC_MATCH_ID, 
            current_event_id: event_id
          }, { onConflict: "match_id" })

        if (error) {
          console.error("Error setting current event ID:", error)
          return res.status(500).json({ error: `Database error: ${error.message}` })
        }

        console.log(`Successfully set current event ID to: ${event_id}`)
        return res.status(200).json({ message: `Current event ID set to ${event_id}` })
      } catch (err) {
        console.error("Error setting current event ID:", err)
        return res.status(500).json({ error: "Failed to set current event ID" })
      }
    }

    if (action === "get-current-event-id") {
      try {
        console.log("Getting current event ID from event_state")
        
        const { data, error } = await supabase
          .from("event_state")
          .select("current_event_id")
          .eq("match_id", STATIC_MATCH_ID)
          .single()

        if (error) {
          console.error("Error getting current event ID:", error)
          
          // If no record exists, get the maximum event ID as fallback
          if (error.code === 'PGRST116') {
            console.log("No event_state record found, getting max event ID as fallback")
            
            const [participantsResult, matchResultsResult] = await Promise.all([
              supabase
                .from("participants")
                .select("event_id")
                .order("event_id", { ascending: false })
                .limit(1)
                .single(),
              supabase
                .from("match_results")
                .select("event_id")
                .order("event_id", { ascending: false })
                .limit(1)
                .single()
            ])

            let maxEventId = 1
            if (!participantsResult.error && participantsResult.data?.event_id) {
              maxEventId = Math.max(maxEventId, participantsResult.data.event_id)
            }
            if (!matchResultsResult.error && matchResultsResult.data?.event_id) {
              maxEventId = Math.max(maxEventId, matchResultsResult.data.event_id)
            }

            return res.status(200).json({ current_event_id: maxEventId })
          }
          
          return res.status(500).json({ error: error.message })
        }

        const currentEventId = data?.current_event_id || 1
        console.log(`Current event ID retrieved: ${currentEventId}`)
        return res.status(200).json({ current_event_id: currentEventId })
      } catch (err) {
        console.error("Error getting current event ID:", err)
        return res.status(500).json({ error: "Failed to get current event ID" })
      }
    }

    if (action === "set-registration-enabled") {
      try {
        const { enabled } = req.body
        console.log(`Setting registration enabled to: ${enabled} for match_id: ${STATIC_MATCH_ID}`)
        
        // First try to update existing record
        const { data: updateData, error: updateError } = await supabase
          .from("event_state")
          .update({ 
            registration_enabled: enabled
          })
          .eq("match_id", STATIC_MATCH_ID)
          .select()

        if (updateError) {
          console.error("Error updating registration enabled:", updateError)
          
          // If update failed, try to insert a new record
          console.log("Update failed, trying to insert new record...")
          const { data: insertData, error: insertError } = await supabase
            .from("event_state")
            .insert({
              match_id: STATIC_MATCH_ID,
              registration_enabled: enabled,
              phase: 'waiting'
            })
            .select()

          if (insertError) {
            console.error("Error inserting event_state record:", insertError)
            return res.status(500).json({ error: `Database error: ${insertError.message}` })
          }
          
          console.log("Successfully inserted new event_state record:", insertData)
        } else {
          console.log("Successfully updated registration enabled:", updateData)
        }

        return res.status(200).json({ message: `Registration ${enabled ? 'enabled' : 'disabled'}` })
      } catch (err) {
        console.error("Error setting registration enabled:", err)
        return res.status(500).json({ error: "Failed to set registration enabled" })
      }
    }

    if (action === "get-registration-enabled") {
      try {
        console.log(`Getting registration enabled for match_id: ${STATIC_MATCH_ID}`)
        
        const { data, error } = await supabase
          .from("event_state")
          .select("registration_enabled")
          .eq("match_id", STATIC_MATCH_ID)
          .single()

        if (error) {
          console.error("Error getting registration enabled:", error)
          
          // If no record exists, return default (true)
          if (error.code === 'PGRST116') {
            console.log("No event_state record found, returning default registration enabled (true)")
            return res.status(200).json({ enabled: true })
          }
          
          return res.status(500).json({ error: error.message })
        }

        const enabled = data?.registration_enabled !== false // Default to true if null/undefined
        console.log(`Registration enabled retrieved: ${enabled}`)
        return res.status(200).json({ enabled })
      } catch (err) {
        console.error("Error getting registration enabled:", err)
        return res.status(500).json({ error: "Failed to get registration enabled" })
      }
    }

    if (action === "set-event-finished") {
      try {
        const { event_id, finished } = req.body
        console.log(`Setting event ${event_id} finished status to: ${finished}`)
        
        // Update all match_results records for this event_id
        const { data: updateData, error: updateError } = await supabase
          .from("match_results")
          .update({ 
            event_finished: finished
          })
          .eq("event_id", event_id)
          .select()

        if (updateError) {
          console.error("Error updating event finished status:", updateError)
          return res.status(500).json({ error: `Database error: ${updateError.message}` })
        }
        
        console.log(`Successfully updated ${updateData?.length || 0} match results for event ${event_id}`)
        return res.status(200).json({ message: `Event ${event_id} ${finished ? 'finished' : 'ongoing'}` })
      } catch (err) {
        console.error("Error setting event finished:", err)
        return res.status(500).json({ error: "Failed to set event finished status" })
      }
    }

    if (action === "get-event-finished") {
      try {
        const { event_id } = req.body
        console.log(`Getting event finished status for event_id: ${event_id}`)
        
        const { data, error } = await supabase
          .from("match_results")
          .select("event_finished")
          .eq("event_id", event_id)
          .limit(1)
          .single()

        if (error) {
          console.error("Error getting event finished status:", error)
          
          // If no record exists, return default (false)
          if (error.code === 'PGRST116') {
            console.log(`No match_results records found for event ${event_id}, returning default finished (false)`)
            return res.status(200).json({ finished: false })
          }
          
          return res.status(500).json({ error: error.message })
        }

        const finished = data?.event_finished !== false // Default to false if null/undefined
        console.log(`Event ${event_id} finished status retrieved: ${finished}`)
        return res.status(200).json({ finished })
      } catch (err) {
        console.error("Error getting event finished status:", err)
        return res.status(500).json({ error: "Failed to get event finished status" })
      }
    }

    if (action === "cleanup-incomplete-profiles") {
      try {
        console.log("Starting cleanup of incomplete profiles for match_id:", STATIC_MATCH_ID)
        
        // First, get all participants
        const { data: allParticipants, error: fetchError } = await supabase
          .from("participants")
          .select("id, assigned_number, survey_data")
          .eq("match_id", STATIC_MATCH_ID)
          .neq("assigned_number", 9999) // Exclude organizer participant
        
        if (fetchError) {
          console.error("Error fetching participants:", fetchError)
          return res.status(500).json({ error: "Failed to fetch participants" })
        }
        
        // Filter incomplete profiles (those without survey_data or with empty survey_data)
        const incompleteParticipants = allParticipants.filter(p => 
          !p.survey_data || 
          Object.keys(p.survey_data).length === 0 ||
          !p.survey_data.name ||
          !p.survey_data.age ||
          !p.survey_data.gender
        )
        
        const incompleteIds = incompleteParticipants.map(p => p.id)
        console.log(`Found ${incompleteParticipants.length} incomplete profiles to delete:`, 
          incompleteParticipants.map(p => `#${p.assigned_number}`))
        
        let deletedCount = 0
        
        if (incompleteIds.length > 0) {
          // Delete incomplete participants
          const { error: deleteError } = await supabase
            .from("participants")
            .delete()
            .in("id", incompleteIds)
          
          if (deleteError) {
            console.error("Error deleting incomplete participants:", deleteError)
            return res.status(500).json({ error: "Failed to delete incomplete participants" })
          }
          
          deletedCount = incompleteIds.length
        }
        
        const remainingCount = allParticipants.length - deletedCount
        
        console.log(`Cleanup completed: deleted ${deletedCount} incomplete profiles, ${remainingCount} complete profiles remain`)
        
        return res.status(200).json({ 
          deletedCount, 
          remainingCount,
          message: `Successfully removed ${deletedCount} incomplete profiles` 
        })
      } catch (err) {
        console.error("Error during cleanup:", err)
        return res.status(500).json({ error: "Failed to cleanup incomplete profiles" })
      }
    }

    if (action === "get-participant-results") {
      try {
        const { event_id } = req.body
        console.log(`Getting participant results for event_id: ${event_id}`)
        
        // Get all participants for this match
        const { data: participants, error: participantsError } = await supabase
          .from("participants")
          .select("id, assigned_number, name, survey_data")
          .eq("match_id", STATIC_MATCH_ID)
          .neq("assigned_number", 9999) // Exclude organizer participant
          .order("assigned_number", { ascending: true })
        
        if (participantsError) {
          console.error("Error fetching participants:", participantsError)
          return res.status(500).json({ error: "Failed to fetch participants" })
        }
        
        // Get match results for this event
        const { data: matchResults, error: matchError } = await supabase
          .from("match_results")
          .select(`
            participant_a_number, 
            participant_b_number,
            compatibility_score,
            mbti_compatibility_score,
            attachment_compatibility_score,
            communication_compatibility_score,
            lifestyle_compatibility_score,
            core_values_compatibility_score,
            vibe_compatibility_score,
            round
          `)
          .eq("event_id", event_id || 1)
          .order("compatibility_score", { ascending: false })
        
        if (matchError) {
          console.error("Error fetching match results:", matchError)
          return res.status(500).json({ error: "Failed to fetch match results" })
        }
        
        // Create a map of participant results
        const participantResultsMap = new Map()
        
        // Initialize all participants with default values
        participants.forEach(participant => {
          participantResultsMap.set(participant.assigned_number, {
            id: participant.id,
            assigned_number: participant.assigned_number,
            name: participant.name || participant.survey_data?.name || "غير محدد",
            compatibility_score: 0,
            mbti_compatibility_score: 0,
            attachment_compatibility_score: 0,
            communication_compatibility_score: 0,
            lifestyle_compatibility_score: 0,
            core_values_compatibility_score: 0,
            vibe_compatibility_score: 0,
            partner_assigned_number: null,
            partner_name: null
          })
        })
        
        // Update with match results
        matchResults.forEach(match => {
          const participantA = participantResultsMap.get(match.participant_a_number)
          const participantB = participantResultsMap.get(match.participant_b_number)
          
          if (participantA && participantB) {
            // Update participant A
            participantA.compatibility_score = Math.max(participantA.compatibility_score, match.compatibility_score || 0)
            participantA.mbti_compatibility_score = Math.max(participantA.mbti_compatibility_score, match.mbti_compatibility_score || 0)
            participantA.attachment_compatibility_score = Math.max(participantA.attachment_compatibility_score, match.attachment_compatibility_score || 0)
            participantA.communication_compatibility_score = Math.max(participantA.communication_compatibility_score, match.communication_compatibility_score || 0)
            participantA.lifestyle_compatibility_score = Math.max(participantA.lifestyle_compatibility_score, match.lifestyle_compatibility_score || 0)
            participantA.core_values_compatibility_score = Math.max(participantA.core_values_compatibility_score, match.core_values_compatibility_score || 0)
            participantA.vibe_compatibility_score = Math.max(participantA.vibe_compatibility_score, match.vibe_compatibility_score || 0)
            participantA.partner_assigned_number = match.participant_b_number
            participantA.partner_name = participantB.name
            
            // Update participant B
            participantB.compatibility_score = Math.max(participantB.compatibility_score, match.compatibility_score || 0)
            participantB.mbti_compatibility_score = Math.max(participantB.mbti_compatibility_score, match.mbti_compatibility_score || 0)
            participantB.attachment_compatibility_score = Math.max(participantB.attachment_compatibility_score, match.attachment_compatibility_score || 0)
            participantB.communication_compatibility_score = Math.max(participantB.communication_compatibility_score, match.communication_compatibility_score || 0)
            participantB.lifestyle_compatibility_score = Math.max(participantB.lifestyle_compatibility_score, match.lifestyle_compatibility_score || 0)
            participantB.core_values_compatibility_score = Math.max(participantB.core_values_compatibility_score, match.core_values_compatibility_score || 0)
            participantB.vibe_compatibility_score = Math.max(participantB.vibe_compatibility_score, match.vibe_compatibility_score || 0)
            participantB.partner_assigned_number = match.participant_a_number
            participantB.partner_name = participantA.name
          }
        })
        
        // Convert map to array
        const results = Array.from(participantResultsMap.values())
        
        console.log(`Found ${results.length} participants with ${matchResults.length} total matches`)
        
        return res.status(200).json({ 
          results,
          totalMatches: matchResults.length,
          totalParticipants: results.length
        })
      } catch (err) {
        console.error("Error getting participant results:", err)
        return res.status(500).json({ error: "Failed to get participant results" })
      }
    }

    // 🔹 GET EXCLUDED PAIRS
    if (action === "get-excluded-pairs") {
      try {
        const { data, error } = await supabase
          .from("excluded_pairs")
          .select("id, participant1_number, participant2_number, created_at, reason")
          .eq("match_id", STATIC_MATCH_ID)
          .order("created_at", { ascending: false })

        if (error) {
          console.error("Error fetching excluded pairs:", error)
          return res.status(500).json({ error: error.message })
        }

        return res.status(200).json({ excludedPairs: data || [] })
      } catch (error) {
        console.error("Error in get-excluded-pairs:", error)
        return res.status(500).json({ error: "Failed to fetch excluded pairs" })
      }
    }

    // 🔹 ADD EXCLUDED PAIR
    if (action === "add-excluded-pair") {
      try {
        const { participant1, participant2, reason = "Admin exclusion" } = req.body

        if (!participant1 || !participant2) {
          return res.status(400).json({ error: "Both participant numbers are required" })
        }

        if (participant1 === participant2) {
          return res.status(400).json({ error: "Cannot exclude a participant from themselves" })
        }

        // Check if participants exist
        const { data: participants, error: participantsError } = await supabase
          .from("participants")
          .select("assigned_number")
          .eq("match_id", STATIC_MATCH_ID)
          .in("assigned_number", [participant1, participant2])

        if (participantsError) {
          console.error("Error checking participants:", participantsError)
          return res.status(500).json({ error: "Failed to verify participants" })
        }

        if (participants.length !== 2) {
          return res.status(400).json({ error: "One or both participant numbers don't exist" })
        }

        // Insert excluded pair (constraint will prevent duplicates)
        const { data, error } = await supabase
          .from("excluded_pairs")
          .insert([{
            match_id: STATIC_MATCH_ID,
            participant1_number: participant1,
            participant2_number: participant2,
            reason: reason
          }])
          .select()
          .single()

        if (error) {
          if (error.code === '23505') { // Unique index violation
            return res.status(400).json({ error: "This pair is already excluded" })
          }
          console.error("Error adding excluded pair:", error)
          return res.status(500).json({ error: error.message })
        }

        console.log(`✅ Added excluded pair: #${participant1} ↔ #${participant2}`)
        return res.status(200).json({ 
          success: true, 
          excludedPair: data,
          message: `Excluded pair added: #${participant1} and #${participant2}` 
        })

      } catch (error) {
        console.error("Error in add-excluded-pair:", error)
        return res.status(500).json({ error: "Failed to add excluded pair" })
      }
    }

    // 🔹 REMOVE EXCLUDED PAIR
    if (action === "remove-excluded-pair") {
      try {
        const { id } = req.body

        if (!id) {
          return res.status(400).json({ error: "Excluded pair ID is required" })
        }

        const { error } = await supabase
          .from("excluded_pairs")
          .delete()
          .eq("id", id)
          .eq("match_id", STATIC_MATCH_ID)

        if (error) {
          console.error("Error removing excluded pair:", error)
          return res.status(500).json({ error: error.message })
        }

        console.log(`✅ Removed excluded pair with ID: ${id}`)
        return res.status(200).json({ 
          success: true, 
          message: "Excluded pair removed successfully" 
        })

      } catch (error) {
        console.error("Error in remove-excluded-pair:", error)
        return res.status(500).json({ error: "Failed to remove excluded pair" })
      }
    }

    // 🔹 CLEAR ALL EXCLUDED PAIRS
    if (action === "clear-excluded-pairs") {
      try {
        const { error } = await supabase
          .from("excluded_pairs")
          .delete()
          .eq("match_id", STATIC_MATCH_ID)

        if (error) {
          console.error("Error clearing excluded pairs:", error)
          return res.status(500).json({ error: error.message })
        }

        console.log("✅ All excluded pairs cleared")
        return res.status(200).json({ 
          success: true, 
          message: "All excluded pairs cleared successfully" 
        })

      } catch (error) {
        console.error("Error in clear-excluded-pairs:", error)
        return res.status(500).json({ error: "Failed to clear excluded pairs" })
      }
    }

    // 🔹 GET LOCKED MATCHES
    if (action === "get-locked-matches") {
      try {
        const { data, error } = await supabase
          .from("locked_matches")
          .select("*")
          .eq("match_id", STATIC_MATCH_ID)
          .order("created_at", { ascending: false })

        if (error) {
          console.error("Error fetching locked matches:", error)
          return res.status(500).json({ error: error.message })
        }

        console.log(`✅ Fetched ${data.length} locked matches`)
        return res.status(200).json({ lockedMatches: data })

      } catch (error) {
        console.error("Error in get-locked-matches:", error)
        return res.status(500).json({ error: "Failed to fetch locked matches" })
      }
    }

    // 🔹 ADD LOCKED MATCH
    if (action === "add-locked-match") {
      try {
        const { participant1, participant2, compatibilityScore, round, reason } = req.body

        if (!participant1 || !participant2) {
          return res.status(400).json({ error: "Both participant numbers are required" })
        }

        if (participant1 === participant2) {
          return res.status(400).json({ error: "Cannot lock a participant with themselves" })
        }

        const { data, error } = await supabase
          .from("locked_matches")
          .insert([{
            match_id: STATIC_MATCH_ID,
            participant1_number: participant1,
            participant2_number: participant2,
            original_compatibility_score: compatibilityScore,
            original_match_round: round,
            reason: reason || 'Admin locked match'
          }])
          .select()
          .single()

        if (error) {
          if (error.code === '23505') { // Unique index violation
            return res.status(400).json({ error: "This pair is already locked" })
          }
          console.error("Error adding locked match:", error)
          return res.status(500).json({ error: error.message })
        }

        console.log(`✅ Added locked match: #${participant1} ↔ #${participant2}`)
        return res.status(200).json({ 
          success: true, 
          lockedMatch: data,
          message: `Locked match added: #${participant1} and #${participant2}` 
        })

      } catch (error) {
        console.error("Error in add-locked-match:", error)
        return res.status(500).json({ error: "Failed to add locked match" })
      }
    }

    // 🔹 REMOVE LOCKED MATCH
    if (action === "remove-locked-match") {
      try {
        const { id } = req.body

        if (!id) {
          return res.status(400).json({ error: "Locked match ID is required" })
        }

        const { error } = await supabase
          .from("locked_matches")
          .delete()
          .eq("id", id)
          .eq("match_id", STATIC_MATCH_ID)

        if (error) {
          console.error("Error removing locked match:", error)
          return res.status(500).json({ error: error.message })
        }

        console.log(`✅ Removed locked match with ID: ${id}`)
        return res.status(200).json({ 
          success: true, 
          message: "Locked match removed successfully" 
        })

      } catch (error) {
        console.error("Error in remove-locked-match:", error)
        return res.status(500).json({ error: "Failed to remove locked match" })
      }
    }

    // 🔹 CLEAR ALL LOCKED MATCHES
    if (action === "clear-locked-matches") {
      try {
        const { error } = await supabase
          .from("locked_matches")
          .delete()
          .eq("match_id", STATIC_MATCH_ID)

        if (error) {
          console.error("Error clearing locked matches:", error)
          return res.status(500).json({ error: error.message })
        }

        console.log("✅ All locked matches cleared")
        return res.status(200).json({ 
          success: true, 
          message: "All locked matches cleared successfully" 
        })

      } catch (error) {
        console.error("Error in clear-locked-matches:", error)
        return res.status(500).json({ error: "Failed to clear locked matches" })
      }
    }

    // 🔹 GET GROUP ASSIGNMENTS
    if (action === "get-group-assignments") {
      try {
        const { event_id = 1 } = req.body

        // Get group matches from group_matches table
        const { data: groupMatches, error: groupError } = await supabase
          .from("group_matches")
          .select("*")
          .eq("match_id", STATIC_MATCH_ID)
          .eq("event_id", event_id)
          .order("group_number", { ascending: true })

        if (groupError) {
          console.error("Error fetching group matches:", groupError)
          return res.status(500).json({ error: groupError.message })
        }

        // Format group assignments (participant_names are already stored in the table)
        const groupAssignments = groupMatches.map(match => {
          const participantNumbers = match.participant_numbers || []
          const participantNames = match.participant_names || []

          const participants = participantNumbers.map((num, index) => ({
            number: num,
            name: participantNames[index] || `المشارك #${num}`
          }))

          return {
            group_id: match.group_id,
            group_number: match.group_number,
            table_number: match.table_number,
            participants: participants,
            compatibility_score: match.compatibility_score,
            participant_count: participants.length,
            conversation_status: match.conversation_status,
            reason: match.reason
          }
        })

        console.log(`✅ Fetched ${groupAssignments.length} group assignments`)
        return res.status(200).json({ 
          groupAssignments: groupAssignments,
          totalGroups: groupAssignments.length,
          totalParticipants: groupAssignments.reduce((sum, group) => sum + group.participant_count, 0)
        })

      } catch (error) {
        console.error("Error in get-group-assignments:", error)
        return res.status(500).json({ error: "Failed to fetch group assignments" })
      }
    }

    // 🔹 GET EXCLUDED PARTICIPANTS
    if (action === "get-excluded-participants") {
      try {
        const { data, error } = await supabase
          .from("excluded_participants")
          .select("id, participant_number, created_at, reason")
          .eq("match_id", STATIC_MATCH_ID)
          .order("created_at", { ascending: false })

        if (error) {
          console.error("Error fetching excluded participants:", error)
          return res.status(500).json({ error: error.message })
        }

        return res.status(200).json({ excludedParticipants: data || [] })
      } catch (error) {
        console.error("Error in get-excluded-participants:", error)
        return res.status(500).json({ error: "Failed to fetch excluded participants" })
      }
    }

    // 🔹 ADD EXCLUDED PARTICIPANT
    if (action === "add-excluded-participant") {
      try {
        const { participantNumber, reason = "Admin exclusion - participant excluded from all matching" } = req.body

        if (!participantNumber || participantNumber <= 0) {
          return res.status(400).json({ error: "Valid participant number is required" })
        }

        if (participantNumber === 9999) {
          return res.status(400).json({ error: "Cannot exclude the organizer participant" })
        }

        // Check if participant exists
        const { data: participantCheck, error: participantError } = await supabase
          .from("participants")
          .select("assigned_number")
          .eq("assigned_number", participantNumber)
          .eq("match_id", STATIC_MATCH_ID)
          .single()

        if (participantError || !participantCheck) {
          return res.status(400).json({ error: "Participant number doesn't exist" })
        }

        // Insert excluded participant (constraint will prevent duplicates)
        const { data, error } = await supabase
          .from("excluded_participants")
          .insert([{
            match_id: STATIC_MATCH_ID,
            participant_number: participantNumber,
            reason: reason
          }])
          .select()
          .single()

        if (error) {
          if (error.code === '23505') { // Unique index violation
            return res.status(400).json({ error: "This participant is already excluded" })
          }
          console.error("Error adding excluded participant:", error)
          return res.status(500).json({ error: error.message })
        }

        console.log(`✅ Added excluded participant: #${participantNumber}`)
        return res.status(200).json({ 
          success: true, 
          excludedParticipant: data,
          message: `Participant #${participantNumber} excluded from all matching` 
        })

      } catch (error) {
        console.error("Error in add-excluded-participant:", error)
        return res.status(500).json({ error: "Failed to add excluded participant" })
      }
    }

    // 🔹 REMOVE EXCLUDED PARTICIPANT
    if (action === "remove-excluded-participant") {
      try {
        const { id } = req.body

        if (!id) {
          return res.status(400).json({ error: "Excluded participant ID is required" })
        }

        const { error } = await supabase
          .from("excluded_participants")
          .delete()
          .eq("id", id)
          .eq("match_id", STATIC_MATCH_ID)

        if (error) {
          console.error("Error removing excluded participant:", error)
          return res.status(500).json({ error: error.message })
        }

        console.log(`✅ Removed excluded participant with ID: ${id}`)
        return res.status(200).json({ 
          success: true, 
          message: "Excluded participant removed successfully" 
        })

      } catch (error) {
        console.error("Error in remove-excluded-participant:", error)
        return res.status(500).json({ error: "Failed to remove excluded participant" })
      }
    }

    // 🔹 CLEAR ALL EXCLUDED PARTICIPANTS
    if (action === "clear-excluded-participants") {
      try {
        const { error } = await supabase
          .from("excluded_participants")
          .delete()
          .eq("match_id", STATIC_MATCH_ID)

        if (error) {
          console.error("Error clearing excluded participants:", error)
          return res.status(500).json({ error: error.message })
        }

        console.log("✅ All excluded participants cleared")
        return res.status(200).json({ 
          success: true, 
          message: "All excluded participants cleared successfully" 
        })

      } catch (error) {
        console.error("Error in clear-excluded-participants:", error)
        return res.status(500).json({ error: "Failed to clear excluded participants" })
      }
    }


    return res.status(405).json({ error: "Unsupported method or action" })
  } catch (error) {
    console.error("Error processing request:", error)
    return res.status(500).json({ error: "Failed to process the request" })
  }
}
