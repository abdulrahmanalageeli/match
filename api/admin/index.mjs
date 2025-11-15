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
        .select("id, assigned_number, table_number, survey_data, summary, secure_token, PAID, PAID_DONE, phone_number, event_id, name, signup_for_next_event, auto_signup_next_event, updated_at, same_gender_preference, any_gender_preference, survey_data_updated_at, created_at, next_event_signup_timestamp")
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
          .select("id, assigned_number, table_number, survey_data, summary, secure_token, PAID, PAID_DONE, phone_number, event_id, name, signup_for_next_event, auto_signup_next_event, updated_at, same_gender_preference, any_gender_preference, survey_data_updated_at, created_at, next_event_signup_timestamp")
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
          }, { onConflict: "match_id" })
        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ message: "Phase updated - all players will transition immediately" })
      }

      if (action === "set-table") {
        try {
          const { event_id } = req.body
          const currentEventId = event_id || 1
          
          console.log(`Auto-assigning tables for event ${currentEventId}`)
          
          // Step 1: Clear all table numbers for current event
          const { error: clearError } = await supabase
            .from("match_results")
            .update({ table_number: null })
            .eq("match_id", STATIC_MATCH_ID)
            .eq("event_id", currentEventId)
          
          if (clearError) {
            console.error("Error clearing table numbers:", clearError)
            return res.status(500).json({ error: clearError.message })
          }
          
          console.log(`✅ Cleared all table numbers for event ${currentEventId}`)
          
          // Step 2: Get all locked matches
          const { data: lockedMatches, error: lockedError } = await supabase
            .from("locked_matches")
            .select("participant1_number, participant2_number")
            .eq("match_id", STATIC_MATCH_ID)
          
          if (lockedError) {
            console.error("Error fetching locked matches:", lockedError)
            return res.status(500).json({ error: lockedError.message })
          }
          
          console.log(`📌 Found ${lockedMatches?.length || 0} locked matches`)
          
          // Step 3: Assign table numbers only to locked/pinned matches
          let tableCounter = 1
          let assignedCount = 0
          
          for (const locked of lockedMatches || []) {
            // Update the match using participant numbers (bidirectional)
            const { error: updateError } = await supabase
              .from("match_results")
              .update({ table_number: tableCounter })
              .eq("match_id", STATIC_MATCH_ID)
              .eq("event_id", currentEventId)
              .or(`and(participant_a_number.eq.${locked.participant1_number},participant_b_number.eq.${locked.participant2_number}),and(participant_a_number.eq.${locked.participant2_number},participant_b_number.eq.${locked.participant1_number})`)
            
            if (updateError) {
              console.error(`Error updating table number for locked match #${locked.participant1_number} ↔ #${locked.participant2_number}:`, updateError)
              return res.status(500).json({ error: updateError.message })
            }
            
            console.log(`   📍 Table ${tableCounter}: #${locked.participant1_number} ↔ #${locked.participant2_number} (Locked)`)
            tableCounter++
            assignedCount++
          }
          
          console.log(`✅ Assigned ${assignedCount} table numbers to locked matches`)
          
          return res.status(200).json({ 
            message: `Tables assigned: ${assignedCount} locked matches got table numbers`,
            assignedTables: assignedCount,
            totalMatches: lockedMatches?.length || 0
          })
        } catch (error) {
          console.error("Error in set-table:", error)
          return res.status(500).json({ error: "Failed to assign tables" })
        }
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

      if (action === "toggle-auto-signup") {
        const { assigned_number, auto_signup } = req.body
        console.log(`Toggling auto signup for participant ${assigned_number} to ${auto_signup}`)
        
        const { error } = await supabase
          .from("participants")
          .update({ auto_signup_next_event: auto_signup })
          .eq("assigned_number", assigned_number)
          .eq("match_id", STATIC_MATCH_ID)
        
        if (error) {
          console.error("toggle-auto-signup error:", error)
          return res.status(500).json({ success: false, error: error.message })
        }
        
        return res.status(200).json({ 
          success: true, 
          message: `Auto signup ${auto_signup ? 'enabled' : 'disabled'}` 
        })
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
          .select("phase, announcement, announcement_type, announcement_time, emergency_paused, pause_time, current_round, total_rounds, current_event_id, global_timer_active, global_timer_start_time, global_timer_duration, global_timer_round")
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
              current_event_id: 1,
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
          current_event_id: data.current_event_id || 1,
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

    // 🔹 SWAP TWO PARTICIPANTS BETWEEN GROUPS (with validation and score recalculation)
    if (action === "swap-group-participants") {
      try {
        const {
          event_id = 1,
          groupA_number,
          participantA,
          groupB_number,
          participantB, // when null/undefined => move (A -> B)
          allowOverride = false
        } = req.body

        if (!groupA_number || !groupB_number || !participantA) {
          return res.status(400).json({ error: "Missing required fields: groupA_number, participantA, groupB_number" })
        }

        // Helper calculators (minimal replicas from trigger-match)
        function calculateMBTICompatibility(type1, type2) {
          if (!type1 || !type2) return 0
          let score = 0
          const i1 = type1[0], i2 = type2[0]
          if (i1 === 'E' && i2 === 'E') score += 2.5; else if (i1 !== i2) score += 2.5
          let match3 = 0
          if (type1[1] === type2[1]) match3++
          if (type1[2] === type2[2]) match3++
          if (type1[3] === type2[3]) match3++
          if (match3 >= 2) score += 2.5
          return score
        }
        function calculateAttachmentCompatibility(a, b) {
          if (!a || !b) return 2.5
          if (a === 'Secure' || b === 'Secure') return 5
          const best = { 'Anxious':['Secure'],'Avoidant':['Secure'],'Fearful':['Secure'],'Mixed (Secure-Anxious)':['Secure'],'Mixed (Secure-Avoidant)':['Secure'],'Mixed (Secure-Fearful)':['Secure'],'Mixed (Anxious-Avoidant)':['Secure'],'Mixed (Anxious-Fearful)':['Secure'],'Mixed (Avoidant-Fearful)':['Secure'] }
          return (best[a]||[]).includes(b) ? 5 : 2.5
        }
        function calculateCommunicationCompatibility(a, b) {
          if (!a || !b) return 4
          if ((a === 'Aggressive' && b === 'Passive-Aggressive') || (b === 'Aggressive' && a === 'Passive-Aggressive')) return 0
          if ((a === 'Assertive' && b === 'Passive') || (a === 'Passive' && b === 'Assertive')) return 10
          const mat = { 'Assertive':{top1:'Assertive',top2:'Passive'}, 'Passive':{top1:'Assertive',top2:'Passive'}, 'Aggressive':{top1:'Assertive',top2:'Aggressive'}, 'Passive-Aggressive':{top1:'Assertive',top2:'Passive-Aggressive'} }
          const c = mat[a]; if (!c) return 4
          if (c.top1 === b) return 10; if (c.top2 === b) return 8; return 4
        }
        function calculateLifestyleCompatibility(p1, p2) {
          if (!p1 || !p2) return 0
          const a = p1.split(','), b = p2.split(','); if (a.length!==5 || b.length!==5) return 0
          const w = [1.25,1.25,1.25,1.25,1.25]; let tot=0, max=0
          for (let i=0;i<5;i++){ let q=0; if (i===0){ q=4 } else if (a[i]===b[i]){ q=4 } else if ((a[i]==='أ'&&b[i]==='ب')||(a[i]==='ب'&&b[i]==='أ')||(a[i]==='ب'&&b[i]==='ج')||(a[i]==='ج'&&b[i]==='ب')){ q=3 } else { q=0 }
            tot += q*w[i]; max += 4*w[i]; }
          let final = (tot/max)*25
          const q5a=a[4], q5b=b[4]; if ((q5a==='أ'&&q5b==='ج')||(q5a==='ج'&&q5b==='أ')) final -= 5
          return Math.max(0, final)
        }
        function calculateCoreValuesCompatibility(v1, v2) {
          if (!v1 || !v2) return 0
          const a=v1.split(','), b=v2.split(','); if (a.length!==5 || b.length!==5) return 0
          let s=0; for (let i=0;i<5;i++){ if (a[i]===b[i]) s+=4; else if ((a[i]==='ب'&&(b[i]==='أ'||b[i]==='ج')) || (b[i]==='ب'&&(a[i]==='أ'||a[i]==='ج'))) s+=2; }
          return s
        }
        function pairTotalScore(pa, pb){
          const mbtiA = pa.mbti_personality_type || pa.survey_data?.mbtiType
          const mbtiB = pb.mbti_personality_type || pb.survey_data?.mbtiType
          const attA = pa.attachment_style || pa.survey_data?.attachmentStyle
          const attB = pb.attachment_style || pb.survey_data?.attachmentStyle
          const commA = pa.communication_style || pa.survey_data?.communicationStyle
          const commB = pb.communication_style || pb.survey_data?.communicationStyle
          const lifeA = pa.survey_data?.lifestylePreferences || (pa.survey_data?.answers ? [pa.survey_data.answers.lifestyle_1,pa.survey_data.answers.lifestyle_2,pa.survey_data.answers.lifestyle_3,pa.survey_data.answers.lifestyle_4,pa.survey_data.answers.lifestyle_5].join(',') : '')
          const lifeB = pb.survey_data?.lifestylePreferences || (pb.survey_data?.answers ? [pb.survey_data.answers.lifestyle_1,pb.survey_data.answers.lifestyle_2,pb.survey_data.answers.lifestyle_3,pb.survey_data.answers.lifestyle_4,pb.survey_data.answers.lifestyle_5].join(',') : '')
          const valsA = pa.survey_data?.coreValues || (pa.survey_data?.answers ? [pa.survey_data.answers.core_values_1,pa.survey_data.answers.core_values_2,pa.survey_data.answers.core_values_3,pa.survey_data.answers.core_values_4,pa.survey_data.answers.core_values_5].join(',') : '')
          const valsB = pb.survey_data?.coreValues || (pb.survey_data?.answers ? [pb.survey_data.answers.core_values_1,pb.survey_data.answers.core_values_2,pb.survey_data.answers.core_values_3,pb.survey_data.answers.core_values_4,pb.survey_data.answers.core_values_5].join(',') : '')
          return (
            calculateMBTICompatibility(mbtiA, mbtiB) +
            calculateAttachmentCompatibility(attA, attB) +
            calculateCommunicationCompatibility(commA, commB) +
            calculateLifestyleCompatibility(lifeA, lifeB) +
            calculateCoreValuesCompatibility(valsA, valsB)
          )
        }
        function calculateGroupScore(groupNums, pMap){
          let total=0, pairs=0
          for (let i=0;i<groupNums.length;i++){
            for (let j=i+1;j<groupNums.length;j++){
              const a=pMap.get(groupNums[i]); const b=pMap.get(groupNums[j]);
              if (a && b){ total += pairTotalScore(a,b); pairs++ }
            }
          }
          return pairs>0 ? Math.round((total/pairs)) : 0
        }
        async function buildWarnings(groupNums, pMap){
          const warnings=[]
          const participants = groupNums.map(n=>pMap.get(n)).filter(Boolean)
          // Gender balance + female cap
          const genders = participants.map(p=>p.gender || p.survey_data?.gender).filter(Boolean)
          const male = genders.filter(g=>g==='male').length
          const female = genders.filter(g=>g==='female').length
          if (male===0 || female===0) warnings.push(`لا يوجد توازن بين الجنسين (${male}♂ / ${female}♀)`) 
          if (female>2) warnings.push(`عدد الإناث يتجاوز الحد المسموح ( ${female} > 2 )`)
          // Extrovert presence
          const mbtis = participants.map(p=>p.mbti_personality_type || p.survey_data?.mbtiType).filter(Boolean)
          const ext = mbtis.filter(t=>t && t[0]==='E').length
          if (mbtis.length===participants.length && ext===0) warnings.push("لا يوجد أي منفتح (Extrovert) في المجموعة")
          // Conversation depth mismatch
          const conv = participants.map(p=>p.survey_data?.vibe_4).filter(Boolean)
          const yes = conv.filter(v=>v==='نعم').length; const no = conv.filter(v=>v==='لا').length
          if (yes>0 && no>0) warnings.push("تعارض في عمق المحادثة (لا يمكن مزج 'نعم' و'لا')")
          // Payment status
          const unpaid = participants.filter(p=>p.PAID_DONE===false).map(p=>p.assigned_number)
          if (unpaid.length>0) warnings.push(`مشاركون غير مسددين: [${unpaid.join(', ')}]`)
          // Wide age range (soft)
          const ages = participants.map(p=>p.age || p.survey_data?.age).filter(a=>a!==undefined && a!==null)
          if (ages.length===participants.length){ const rng=Math.max(...ages)-Math.min(...ages); if (rng>15) warnings.push(`فارق عمر كبير داخل المجموعة (${rng} سنة)`) }
          // Previously matched pairs inside same group (current event)
          if (groupNums.length>=2){
            const setNums = groupNums
            const { data: prev, error: prevErr } = await supabase
              .from('match_results')
              .select('participant_a_number, participant_b_number, round')
              .eq('event_id', event_id)
            if (!prevErr && prev){
              for (const r of prev){
                if (setNums.includes(r.participant_a_number) && setNums.includes(r.participant_b_number) && (r.round === null || r.round >= 0)){
                  warnings.push(`الثنائي ${r.participant_a_number}×${r.participant_b_number} كانا متطابقين مسبقاً`)
                }
              }
            }
          }
          return warnings
        }

        // 1) Load both groups
        const { data: groupA, error: errA } = await supabase
          .from('group_matches')
          .select('*')
          .eq('match_id', STATIC_MATCH_ID)
          .eq('event_id', event_id)
          .eq('group_number', groupA_number)
          .single()
        if (errA || !groupA) { return res.status(404).json({ error: 'Group A not found' }) }

        const { data: groupB, error: errB } = await supabase
          .from('group_matches')
          .select('*')
          .eq('match_id', STATIC_MATCH_ID)
          .eq('event_id', event_id)
          .eq('group_number', groupB_number)
          .single()
        if (errB || !groupB) { return res.status(404).json({ error: 'Group B not found' }) }

        const arrA = [...(groupA.participant_numbers || [])]
        const arrB = [...(groupB.participant_numbers || [])]
        if (!arrA.includes(participantA)) { return res.status(400).json({ error: `Participant #${participantA} not in group ${groupA_number}` }) }
        const isMove = participantB === null || participantB === undefined || participantB === 0
        if (!isMove) {
          if (!arrB.includes(participantB)) { return res.status(400).json({ error: `Participant #${participantB} not in group ${groupB_number}` }) }
        }

        // 2) Build swapped arrays
        const idxA = arrA.indexOf(participantA)
        const idxB = isMove ? -1 : arrB.indexOf(participantB)
        const newA = [...arrA]; const newB = [...arrB]
        if (groupA_number === groupB_number) {
          // Reorder inside the same group
          if (isMove) {
            // Move within same group to an "empty" slot is a no-op (no empty slots exist if same group)
            return res.status(400).json({ error: 'Cannot move to empty spot within the same group' })
          } else {
            newA[idxA] = participantB
            newA[idxB] = participantA
          }
        } else if (isMove) {
          // Move participantA from A to B (append at end)
          const MAX_GROUP_SIZE = 6
          const MIN_GROUP_SIZE = 3
          const afterA = newA.length - 1
          const afterB = newB.length + 1
          if (afterA < MIN_GROUP_SIZE) {
            return res.status(400).json({ error: `Move would violate minimum size (>=${MIN_GROUP_SIZE}) for group ${groupA_number}` })
          }
          if (afterB > MAX_GROUP_SIZE) {
            return res.status(400).json({ error: `Move would exceed maximum size (${MAX_GROUP_SIZE}) for group ${groupB_number}` })
          }
          newA.splice(idxA, 1)
          newB.push(participantA)
        } else {
          // Cross-group swap
          newA[idxA] = participantB
          newB[idxB] = participantA
        }

        // 3) Load participants data (for both groups)
        const allNums = Array.from(new Set(groupA_number === groupB_number ? [...newA] : [...newA, ...newB]))
        const { data: pData, error: pErr } = await supabase
          .from('participants')
          .select('assigned_number, survey_data, mbti_personality_type, attachment_style, communication_style, gender, age, PAID_DONE, name')
          .in('assigned_number', allNums)
        if (pErr) { return res.status(500).json({ error: 'Failed fetching participants' }) }
        const pMap = new Map(pData.map(p=>[p.assigned_number, p]))

        // 4) Recompute scores
        const scoreA = calculateGroupScore(newA, pMap)
        const scoreB = groupA_number === groupB_number ? null : calculateGroupScore(newB, pMap)

        // 5) Validate eligibility and build warnings
        const warningsA = await buildWarnings(newA, pMap)
        const warningsB = groupA_number === groupB_number ? [] : await buildWarnings(newB, pMap)
        const hasWarnings = (warningsA.length + (warningsB?.length || 0)) > 0

        // 6) If warnings and not override -> return for confirmation
        if (hasWarnings && !allowOverride) {
          return res.status(200).json({
            success: false,
            warnings: groupA_number === groupB_number
              ? { [groupA_number]: warningsA }
              : { [groupA_number]: warningsA, [groupB_number]: warningsB },
            proposed: groupA_number === groupB_number
              ? { [groupA_number]: { participant_numbers: newA, compatibility_score: scoreA } }
              : { [groupA_number]: { participant_numbers: newA, compatibility_score: scoreA }, [groupB_number]: { participant_numbers: newB, compatibility_score: scoreB } }
          })
        }

        // 7) Persist swap
        function namesFor(groupNums){
          return groupNums.map(n=>{
            const p=pMap.get(n); return (p?.survey_data?.name) || p?.name || `المشارك #${n}`
          })
        }

        if (groupA_number === groupB_number) {
          const { error: upSame } = await supabase
            .from('group_matches')
            .update({ participant_numbers: newA, participant_names: namesFor(newA), compatibility_score: scoreA })
            .eq('match_id', STATIC_MATCH_ID)
            .eq('event_id', event_id)
            .eq('group_number', groupA_number)
          if (upSame) { return res.status(500).json({ error: 'Failed updating group' }) }
          return res.status(200).json({
            success: true,
            updated: { [groupA_number]: { participant_numbers: newA, participant_names: namesFor(newA), compatibility_score: scoreA } },
            warnings: { [groupA_number]: warningsA }
          })
        } else {
          const { error: upA } = await supabase
            .from('group_matches')
            .update({ participant_numbers: newA, participant_names: namesFor(newA), compatibility_score: scoreA })
            .eq('match_id', STATIC_MATCH_ID)
            .eq('event_id', event_id)
            .eq('group_number', groupA_number)
          if (upA) { return res.status(500).json({ error: 'Failed updating group A' }) }

          const { error: upB } = await supabase
            .from('group_matches')
            .update({ participant_numbers: newB, participant_names: namesFor(newB), compatibility_score: scoreB })
            .eq('match_id', STATIC_MATCH_ID)
            .eq('event_id', event_id)
            .eq('group_number', groupB_number)
          if (upB) { return res.status(500).json({ error: 'Failed updating group B' }) }

          return res.status(200).json({
            success: true,
            updated: {
              [groupA_number]: { participant_numbers: newA, participant_names: namesFor(newA), compatibility_score: scoreA },
              [groupB_number]: { participant_numbers: newB, participant_names: namesFor(newB), compatibility_score: scoreB }
            },
            warnings: { [groupA_number]: warningsA, [groupB_number]: warningsB }
          })
        }

      } catch (error) {
        console.error('Error in swap-group-participants:', error)
        return res.status(500).json({ error: 'Failed to swap group participants' })
      }
    }

    if (action === "get-all-match-history") {
      try {
        const { match_id } = req.body
        console.log("Fetching all match history for match_id:", match_id)
        
        // Fetch all matches from match_results
        const { data: matches, error: matchError } = await supabase
          .from("match_results")
          .select("participant_a_number, participant_b_number, round, event_id, created_at")
          .eq("match_id", match_id || STATIC_MATCH_ID)
          .order("created_at", { ascending: false })
        
        if (matchError) {
          console.error("Error fetching matches:", matchError)
          return res.status(500).json({ error: matchError.message })
        }
        
        // Fetch all participants to get names
        const { data: participants, error: participantError } = await supabase
          .from("participants")
          .select("assigned_number, name, survey_data")
          .eq("match_id", match_id || STATIC_MATCH_ID)
        
        if (participantError) {
          console.error("Error fetching participants:", participantError)
          return res.status(500).json({ error: participantError.message })
        }
        
        // Create a map of participant numbers to names
        const participantNameMap = {}
        participants.forEach(p => {
          participantNameMap[p.assigned_number] = p.name || p.survey_data?.name || `Participant #${p.assigned_number}`
        })
        
        // Organize matches by participant
        const matchHistory = {}
        matches.forEach(match => {
          const participantA = match.participant_a_number
          const participantB = match.participant_b_number
          
          // Skip matches with organizer (#9999)
          if (participantA === 9999 || participantB === 9999) {
            return
          }
          
          // Add to participant A's history
          if (!matchHistory[participantA]) matchHistory[participantA] = []
          matchHistory[participantA].push({
            partner_number: participantB,
            partner_name: participantNameMap[participantB],
            round: match.round,
            event_id: match.event_id,
            created_at: match.created_at
          })
          
          // Add to participant B's history
          if (!matchHistory[participantB]) matchHistory[participantB] = []
          matchHistory[participantB].push({
            partner_number: participantA,
            partner_name: participantNameMap[participantA],
            round: match.round,
            event_id: match.event_id,
            created_at: match.created_at
          })
        })
        
        console.log(`Fetched match history for ${Object.keys(matchHistory).length} participants`)
        return res.status(200).json({ success: true, matchHistory })
      } catch (err) {
        console.error("Error getting match history:", err)
        return res.status(500).json({ error: "Failed to get match history" })
      }
    }

    if (action === "get-match-results-for-export") {
      try {
        const { event_id } = req.body
        console.log(`Fetching match results for export - event_id: ${event_id}`)
        
        // Fetch all individual matches from match_results table
        const { data: matches, error: matchError } = await supabase
          .from("match_results")
          .select(`
            participant_a_number,
            participant_b_number,
            compatibility_score,
            round,
            table_number,
            match_type,
            event_id,
            created_at
          `)
          .eq("match_id", STATIC_MATCH_ID)
          .eq("event_id", event_id || 1)
          .not("round", "is", null)
          .gt("round", 0)
          .order("round", { ascending: true })
          .order("table_number", { ascending: true })
        
        if (matchError) {
          console.error("Error fetching match results:", matchError)
          return res.status(500).json({ error: matchError.message })
        }
        
        console.log(`✅ Fetched ${matches.length} individual match results`)
        return res.status(200).json({ matches })
      } catch (err) {
        console.error("Error getting match results for export:", err)
        return res.status(500).json({ error: "Failed to get match results" })
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
        
        // REMOVED AUTOMATIC LOGIC: Event finished status is now ONLY controlled by manual admin toggle
        // No longer automatically marking events as finished based on current_event_id
        
        // Check the event_finished flag in match_results
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

        const finished = data?.event_finished === true // Default to false (ongoing) if null/undefined
        console.log(`Event ${event_id} finished status retrieved: ${finished} (raw value: ${data?.event_finished})`)
        return res.status(200).json({ finished })
      } catch (err) {
        console.error("Error getting event finished status:", err)
        return res.status(500).json({ error: "Failed to get event finished status" })
      }
    }
    if (action === "cleanup-incomplete-profiles") {
      try {
        console.log("Starting cleanup of incomplete profiles for match_id:", STATIC_MATCH_ID)
        
        // First, get all participants ordered by assigned_number
        const { data: allParticipants, error: fetchError } = await supabase
          .from("participants")
          .select("id, assigned_number, survey_data")
          .eq("match_id", STATIC_MATCH_ID)
          .neq("assigned_number", 9999) // Exclude organizer participant
          .order("assigned_number", { ascending: true })
        
        if (fetchError) {
          console.error("Error fetching participants:", fetchError)
          return res.status(500).json({ error: "Failed to fetch participants" })
        }
        
        // Protect the last 10 participants (highest assigned numbers) from deletion
        const protectedCount = Math.min(10, allParticipants.length)
        const eligibleForDeletion = allParticipants.slice(0, -protectedCount)
        const protectedParticipants = allParticipants.slice(-protectedCount)
        
        console.log(`Total participants: ${allParticipants.length}, Protected (last 10): ${protectedParticipants.map(p => `#${p.assigned_number}`).join(', ')}`)
        
        // Filter incomplete profiles (those without survey_data only)
        const incompleteParticipants = eligibleForDeletion.filter(p => 
          !p.survey_data || 
          Object.keys(p.survey_data).length === 0
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
        
        console.log(`Cleanup completed: deleted ${deletedCount} incomplete profiles, ${remainingCount} total profiles remain (${protectedCount} protected from deletion)`)
        
        return res.status(200).json({ 
          deletedCount, 
          remainingCount,
          protectedCount,
          message: `Successfully removed ${deletedCount} incomplete profiles (${protectedCount} participants protected from deletion)` 
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

        // Fetch participant details including ages
        const allParticipantNumbers = [...new Set(groupMatches.flatMap(match => match.participant_numbers || []))]
        
        let participantDetailsMap = new Map()
        if (allParticipantNumbers.length > 0) {
          const { data: participantDetails, error: participantError } = await supabase
            .from("participants")
            .select("assigned_number, name, age, survey_data")
            .eq("match_id", STATIC_MATCH_ID)
            .in("assigned_number", allParticipantNumbers)

          if (participantError) {
            console.error("Error fetching participant details:", participantError)
          } else if (participantDetails) {
            participantDetails.forEach(p => {
              participantDetailsMap.set(p.assigned_number, {
                name: p.name || p.survey_data?.name || `المشارك #${p.assigned_number}`,
                age: p.age || p.survey_data?.age
              })
            })
          }
        }

        // Format group assignments (participant_names are already stored in the table)
        const groupAssignments = groupMatches.map(match => {
          const participantNumbers = match.participant_numbers || []
          const participantNames = match.participant_names || []

          const participants = participantNumbers.map((num, index) => {
            const details = participantDetailsMap.get(num)
            return {
              number: num,
              name: details?.name || participantNames[index] || `المشارك #${num}`,
              age: details?.age
            }
          })

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

    // 🔹 GET DELTA CACHE COUNT
    if (action === "get-delta-cache-count") {
      try {
        const { event_id = 1 } = req.body
        
        // Get last cache timestamp
        const { data: metaData } = await supabase
          .from('cache_metadata')
          .select('last_precache_timestamp')
          .eq('event_id', event_id)
          .order('last_precache_timestamp', { ascending: false })
          .limit(1)
          .single()
        
        const lastCacheTimestamp = metaData?.last_precache_timestamp || '1970-01-01T00:00:00Z'
        const noCacheMetadata = !metaData?.last_precache_timestamp
        
        // If no cache metadata exists, delta cache count should be 0
        // (use regular pre-cache for first-time caching)
        if (noCacheMetadata) {
          return res.status(200).json({ 
            count: 0,
            totalEligible: 0,
            lastCacheTimestamp: null,
            message: 'No cache metadata - use Pre-Cache first'
          })
        }
        
        // Fetch eligible participants (same logic as delta-pre-cache)
        const { data: allParticipants } = await supabase
          .from("participants")
          .select("assigned_number, survey_data, survey_data_updated_at, signup_for_next_event, auto_signup_next_event")
          .eq("match_id", STATIC_MATCH_ID)
          .or(`signup_for_next_event.eq.true,event_id.eq.${event_id},auto_signup_next_event.eq.true`)
          .neq("assigned_number", 9999)
        
        if (!allParticipants) {
          return res.status(200).json({ count: 0, lastCacheTimestamp })
        }
        
        // Filter for complete participants
        const eligibleParticipants = allParticipants.filter(p => {
          return p.survey_data && typeof p.survey_data === 'object' && Object.keys(p.survey_data).length > 0
        })
        
        // Count participants needing delta cache (only those who UPDATED after last cache)
        // NOTE: Participants with NULL survey_data_updated_at are NOT counted here
        // They should use regular pre-cache instead (first-time caching)
        const needsCacheCount = eligibleParticipants.filter(p => {
          if (!p.survey_data_updated_at) {
            return false // Never cached - use pre-cache, not delta cache
          }
          // Only count if they updated AFTER the last cache
          return new Date(p.survey_data_updated_at) > new Date(lastCacheTimestamp)
        }).length
        
        return res.status(200).json({ 
          count: needsCacheCount,
          totalEligible: eligibleParticipants.length,
          lastCacheTimestamp
        })
        
      } catch (error) {
        console.error("Error in get-delta-cache-count:", error)
        return res.status(500).json({ error: "Failed to get delta cache count" })
      }
    }

    // 🔹 GET DELTA CACHE PARTICIPANTS LIST
    if (action === "get-delta-cache-participants") {
      try {
        const { event_id = 1 } = req.body
        
        // Get last cache timestamp
        const { data: metaData } = await supabase
          .from('cache_metadata')
          .select('last_precache_timestamp')
          .eq('event_id', event_id)
          .order('last_precache_timestamp', { ascending: false })
          .limit(1)
          .single()
        
        const lastCacheTimestamp = metaData?.last_precache_timestamp || '1970-01-01T00:00:00Z'
        const noCacheMetadata = !metaData?.last_precache_timestamp
        
        // If no cache metadata exists, return empty list
        if (noCacheMetadata) {
          return res.status(200).json({ 
            participants: [],
            count: 0,
            lastCacheTimestamp: null,
            message: 'No cache metadata - use Pre-Cache first'
          })
        }
        
        // Fetch eligible participants with full details
        const { data: allParticipants } = await supabase
          .from("participants")
          .select("assigned_number, name, survey_data, survey_data_updated_at, signup_for_next_event, auto_signup_next_event, event_id")
          .eq("match_id", STATIC_MATCH_ID)
          .or(`signup_for_next_event.eq.true,event_id.eq.${event_id},auto_signup_next_event.eq.true`)
          .neq("assigned_number", 9999)
        
        if (!allParticipants) {
          return res.status(200).json({ participants: [], count: 0, lastCacheTimestamp })
        }
        
        // Filter for complete participants
        const eligibleParticipants = allParticipants.filter(p => {
          return p.survey_data && typeof p.survey_data === 'object' && Object.keys(p.survey_data).length > 0
        })
        
        // Get participants needing delta cache (only those who UPDATED after last cache)
        const needsCacheParticipants = eligibleParticipants.filter(p => {
          if (!p.survey_data_updated_at) {
            return false // Never cached - use pre-cache, not delta cache
          }
          // Only include if they updated AFTER the last cache
          return new Date(p.survey_data_updated_at) > new Date(lastCacheTimestamp)
        }).map(p => ({
          assigned_number: p.assigned_number,
          name: p.name || p.survey_data?.name || `#${p.assigned_number}`,
          survey_data_updated_at: p.survey_data_updated_at,
          eligibility_reason: p.event_id === event_id ? 'Current Event' : 
                             p.signup_for_next_event ? 'Next Event Signup' : 
                             p.auto_signup_next_event ? 'Auto Signup' : 'Unknown'
        }))
        
        return res.status(200).json({ 
          participants: needsCacheParticipants,
          count: needsCacheParticipants.length,
          lastCacheTimestamp,
          totalEligible: eligibleParticipants.length
        })
        
      } catch (error) {
        console.error("Error in get-delta-cache-participants:", error)
        return res.status(500).json({ error: "Failed to get delta cache participants" })
      }
    }

    // 🔹 GET GROUP MATCHES (for participant view)
    if (action === "get-group-matches") {
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

        // Format for participant view
        const groups = groupMatches.map(match => ({
          group_id: match.group_id,
          group_number: match.group_number,
          table_number: match.table_number,
          participant_numbers: match.participant_numbers || [],
          participant_names: match.participant_names || [],
          compatibility_score: match.compatibility_score,
          conversation_status: match.conversation_status,
          conversation_start_time: match.conversation_start_time,
          conversation_duration: match.conversation_duration
        }))

        console.log(`✅ Fetched ${groups.length} group matches for participant view`)
        return res.status(200).json({ 
          success: true,
          groups: groups
        })

      } catch (error) {
        console.error("Error in get-group-matches:", error)
        return res.status(500).json({ error: "Failed to fetch group matches" })
      }
    }

    // 🔹 GET EXCLUDED PARTICIPANTS (using excluded_pairs with -1)
    if (action === "get-excluded-participants") {
      try {
        const { data, error } = await supabase
          .from("excluded_pairs")
          .select("id, participant1_number, participant2_number, created_at, reason")
          .eq("match_id", STATIC_MATCH_ID)
          .in("participant2_number", [-1, -10]) // Fetch both excluded (-1) and banned (-10)
          .order("created_at", { ascending: false })

        if (error) {
          console.error("Error fetching excluded participants:", error)
          return res.status(500).json({ error: error.message })
        }

        // Fetch participant names
        const participantNumbers = (data || []).map(item => item.participant1_number)
        const { data: participantData, error: participantError } = await supabase
          .from("participants")
          .select("assigned_number, name, survey_data")
          .eq("match_id", STATIC_MATCH_ID)
          .in("assigned_number", participantNumbers)

        if (participantError) {
          console.error("Error fetching participant names:", participantError)
        }

        // Create a map of participant numbers to names
        const participantNameMap = new Map()
        if (participantData) {
          participantData.forEach(p => {
            const name = p.name || p.survey_data?.name || p.survey_data?.answers?.name || `المشارك #${p.assigned_number}`
            participantNameMap.set(p.assigned_number, name)
          })
        }

        // Map to expected format with is_banned flag and participant name
        const excludedParticipants = (data || []).map(item => ({
          id: item.id,
          participant_number: item.participant1_number,
          participant_name: participantNameMap.get(item.participant1_number) || `المشارك #${item.participant1_number}`,
          created_at: item.created_at,
          reason: item.reason,
          is_banned: item.participant2_number === -10 // -10 means banned, -1 means excluded
        }))

        return res.status(200).json({ excludedParticipants })
      } catch (error) {
        console.error("Error in get-excluded-participants:", error)
        return res.status(500).json({ error: "Failed to fetch excluded participants" })
      }
    }

    // 🔹 GET ALL MATCHES - Comprehensive view for matrix page
    if (action === "get-all-matches") {
      try {
        console.log("Fetching all matches for matrix view...")

        // Fetch all match results excluding organizer matches (#9999)
        const { data: matchResults, error: matchError } = await supabase
          .from("match_results")
          .select(`
            id,
            participant_a_number,
            participant_b_number,
            participant_c_number,
            participant_d_number,
            participant_e_number,
            participant_f_number,
            compatibility_score,
            mbti_compatibility_score,
            attachment_compatibility_score,
            communication_compatibility_score,
            lifestyle_compatibility_score,
            core_values_compatibility_score,
            vibe_compatibility_score,
            humor_early_openness_bonus,
            round,
            table_number,
            match_type,
            mutual_match,
            is_repeat_match,
            event_id,
            created_at
          `)
          .eq("match_id", STATIC_MATCH_ID)
          .neq("participant_a_number", 9999)
          .neq("participant_b_number", 9999)
          .order("round", { ascending: true })
          .order("compatibility_score", { ascending: false })

        if (matchError) {
          console.error("Error fetching match results:", matchError)
          return res.status(500).json({ error: matchError.message })
        }

        // Fetch all participants for name and details lookup
        const { data: participants, error: participantError } = await supabase
          .from("participants")
          .select("assigned_number, name, gender, age, mbti_personality_type, survey_data")
          .eq("match_id", STATIC_MATCH_ID)
          .neq("assigned_number", 9999)

        if (participantError) {
          console.error("Error fetching participants:", participantError)
          return res.status(500).json({ error: participantError.message })
        }

        // Create participant lookup map
        const participantMap = new Map()
        participants.forEach(p => {
          participantMap.set(p.assigned_number, {
            number: p.assigned_number,
            name: p.name || `مشارك ${p.assigned_number}`,
            gender: p.gender || 'غير محدد',
            age: p.age || null,
            mbti: p.mbti_personality_type || 'غير محدد',
            survey_data: p.survey_data
          })
        })

        // Process match results into structured format - NO DUPLICATES
        const processedMatches = []
        const seenPairs = new Set() // Track processed pairs to avoid duplicates

        matchResults.forEach(match => {
          const participantNumbers = [
            match.participant_a_number,
            match.participant_b_number,
            match.participant_c_number,
            match.participant_d_number,
            match.participant_e_number,
            match.participant_f_number
          ].filter(num => num && num !== 9999)

          // Handle individual matches (2 participants) - NO DUPLICATES
          if (participantNumbers.length === 2) {
            const [pA, pB] = participantNumbers
            
            // Create a unique pair identifier (always smaller number first)
            const pairKey = pA < pB ? `${pA}-${pB}` : `${pB}-${pA}`
            
            // Skip if we've already processed this pair
            if (seenPairs.has(pairKey)) {
              return
            }
            seenPairs.add(pairKey)
            
            const participantA = participantMap.get(pA)
            const participantB = participantMap.get(pB)

            if (participantA && participantB) {
              // Always put smaller number as participant_a for consistency
              const [firstParticipant, secondParticipant] = pA < pB ? [participantA, participantB] : [participantB, participantA]
              
              processedMatches.push({
                id: `${match.id}-individual`,
                participant_a: firstParticipant,
                participant_b: secondParticipant,
                compatibility_score: match.compatibility_score || 0,
                detailed_scores: {
                  mbti: match.mbti_compatibility_score || 0,
                  attachment: match.attachment_compatibility_score || 0,
                  communication: match.communication_compatibility_score || 0,
                  lifestyle: match.lifestyle_compatibility_score || 0,
                  core_values: match.core_values_compatibility_score || 0,
                  vibe: match.vibe_compatibility_score || 0
                },
                bonus_type: match.humor_early_openness_bonus || 'none',
                round: match.event_id || 1, // Use event_id instead of round
                table_number: match.table_number,
                match_type: match.match_type || 'مقابلة فردية',
                mutual_match: match.mutual_match || false,
                is_repeat: match.is_repeat_match || false
              })
            }
          } else if (participantNumbers.length > 2) {
            // Handle group matches (3+ participants) - NO DUPLICATES
            for (let i = 0; i < participantNumbers.length; i++) {
              for (let j = i + 1; j < participantNumbers.length; j++) {
                const pA = participantNumbers[i]
                const pB = participantNumbers[j]
                
                // Create a unique pair identifier for group pairs too
                const pairKey = `group-${pA < pB ? `${pA}-${pB}` : `${pB}-${pA}`}`
                
                // Skip if we've already processed this group pair
                if (seenPairs.has(pairKey)) {
                  continue
                }
                seenPairs.add(pairKey)
                
                const participantA = participantMap.get(pA)
                const participantB = participantMap.get(pB)

                if (participantA && participantB) {
                  // Always put smaller number as participant_a for consistency
                  const [firstParticipant, secondParticipant] = pA < pB ? [participantA, participantB] : [participantB, participantA]
                  
                  processedMatches.push({
                    id: `${match.id}-group-${pA}-${pB}`,
                    participant_a: firstParticipant,
                    participant_b: secondParticipant,
                    compatibility_score: match.compatibility_score || 0,
                    detailed_scores: {
                      mbti: match.mbti_compatibility_score || 0,
                      attachment: match.attachment_compatibility_score || 0,
                      communication: match.communication_compatibility_score || 0,
                      lifestyle: match.lifestyle_compatibility_score || 0,
                      core_values: match.core_values_compatibility_score || 0,
                      vibe: match.vibe_compatibility_score || 0
                    },
                    bonus_type: match.humor_early_openness_bonus || 'none',
                    round: match.event_id || 1, // Use event_id instead of round
                    table_number: match.table_number,
                    match_type: match.match_type || 'مجموعة',
                    mutual_match: false, // Group matches are not mutual
                    is_repeat: match.is_repeat_match || false
                  })
                }
              }
            }
          }
        })

        // Fetch feedback for all matches
        console.log("Fetching feedback data for matches...")
        const { data: feedbackData, error: feedbackError } = await supabase
          .from("match_feedback")
          .select(`
            participant_number,
            round,
            event_id,
            compatibility_rate,
            conversation_quality,
            personal_connection,
            shared_interests,
            comfort_level,
            communication_style,
            would_meet_again,
            overall_experience,
            recommendations,
            participant_message,
            submitted_at
          `)
          .eq("match_id", STATIC_MATCH_ID)

        if (feedbackError) {
          console.error("Error fetching feedback:", feedbackError)
          // Continue without feedback rather than failing
        }

        // Create feedback lookup map: participant_number -> event_id -> feedback
        const feedbackMap = new Map()
        if (feedbackData) {
          feedbackData.forEach(feedback => {
            if (!feedbackMap.has(feedback.participant_number)) {
              feedbackMap.set(feedback.participant_number, new Map())
            }
            feedbackMap.get(feedback.participant_number).set(feedback.event_id, feedback)
          })
        }

        // Add feedback to processed matches
        const matchesWithFeedback = processedMatches.map(match => {
          const eventId = match.round // event_id is stored in round field
          
          // Get feedback from both participants for this event
          const participantAFeedback = feedbackMap.get(match.participant_a.number)?.get(eventId)
          const participantBFeedback = feedbackMap.get(match.participant_b.number)?.get(eventId)
          
          return {
            ...match,
            feedback: {
              participant_a: participantAFeedback || null,
              participant_b: participantBFeedback || null,
              has_feedback: !!(participantAFeedback || participantBFeedback)
            }
          }
        })

        console.log(`Processed ${matchesWithFeedback.length} match pairs from ${matchResults.length} match records`)
        console.log(`Found feedback for ${feedbackData?.length || 0} feedback entries`)

        return res.status(200).json({
          success: true,
          matches: matchesWithFeedback,
          totalRecords: matchResults.length,
          totalPairs: matchesWithFeedback.length,
          participantCount: participants.length,
          feedbackCount: feedbackData?.length || 0
        })

      } catch (error) {
        console.error("Error in get-all-matches:", error)
        return res.status(500).json({ error: "Failed to fetch all matches" })
      }
    }

    // 🔹 DELETE MATCH - Remove specific match using participant numbers and event_id
    if (action === "delete-match") {
      try {
        console.log("🔍 Raw delete request body:", JSON.stringify(req.body, null, 2))
        
        const { participantA, participantB, eventId } = req.body
        
        console.log("🔍 Extracted parameters:")
        console.log("  - participantA:", participantA, typeof participantA)
        console.log("  - participantB:", participantB, typeof participantB)  
        console.log("  - eventId:", eventId, typeof eventId)
        
        if (!participantA || !participantB || !eventId) {
          console.error("Delete match request missing required parameters:", { participantA, participantB, eventId })
          return res.status(400).json({ error: "Participant A, Participant B, and Event ID are required" })
        }
        
        console.log(`🗑️ Attempting to delete match: #${participantA} ↔ #${participantB} in event ${eventId}`)
        
        // Delete the match using participant numbers and event_id (bidirectional)
        const { error, count } = await supabase
          .from("match_results")
          .delete()
          .eq("match_id", STATIC_MATCH_ID)
          .eq("event_id", eventId)
          .or(`and(participant_a_number.eq.${participantA},participant_b_number.eq.${participantB}),and(participant_a_number.eq.${participantB},participant_b_number.eq.${participantA})`)
        
        if (error) {
          console.error("Error deleting match:", error)
          return res.status(500).json({ error: error.message })
        }
        
        if (count === 0) {
          console.log(`⚠️ No matches found for #${participantA} ↔ #${participantB} in event ${eventId}`)
          return res.status(404).json({ error: "Match not found" })
        }
        
        console.log(`✅ Successfully deleted match #${participantA} ↔ #${participantB} in event ${eventId}, rows affected: ${count}`)
        
        return res.status(200).json({
          success: true,
          message: "Match deleted successfully",
          participantA,
          participantB,
          eventId,
          rowsAffected: count || 0
        })
        
      } catch (error) {
        console.error("Error in delete-match:", error)
        return res.status(500).json({ error: "Failed to delete match" })
      }
    }

    // 🔹 ADD EXCLUDED PARTICIPANT (using excluded_pairs with -1)
    if (action === "add-excluded-participant") {
      try {
        const { participantNumber, reason = "Admin exclusion - participant excluded from all matching", banPermanently = false } = req.body

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

        // Use -10 for banned participants, -1 for regular exclusions
        const exclusionCode = banPermanently ? -10 : -1
        const exclusionType = banPermanently ? "PERMANENTLY BANNED" : "excluded"

        // Insert excluded participant using excluded_pairs table
        const { data, error } = await supabase
          .from("excluded_pairs")
          .insert([{
            match_id: STATIC_MATCH_ID,
            participant1_number: participantNumber,
            participant2_number: exclusionCode,
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

        console.log(`✅ Added ${exclusionType} participant: #${participantNumber} (using ${exclusionCode} in excluded_pairs)`)
        return res.status(200).json({ 
          success: true, 
          excludedParticipant: { 
            id: data.id, 
            participant_number: participantNumber, 
            created_at: data.created_at, 
            reason: data.reason,
            is_banned: banPermanently
          },
          message: `Participant #${participantNumber} ${banPermanently ? 'permanently banned' : 'excluded'} from all matching` 
        })

      } catch (error) {
        console.error("Error in add-excluded-participant:", error)
        return res.status(500).json({ error: "Failed to add excluded participant" })
      }
    }

    // 🔹 REMOVE EXCLUDED PARTICIPANT (from excluded_pairs with -1 or -10)
    if (action === "remove-excluded-participant") {
      try {
        const { id } = req.body

        if (!id) {
          return res.status(400).json({ error: "Excluded participant ID is required" })
        }

        // First, get the participant number from the exclusion record
        const { data: exclusionRecord, error: fetchError } = await supabase
          .from("excluded_pairs")
          .select("participant1_number")
          .eq("id", id)
          .eq("match_id", STATIC_MATCH_ID)
          .in("participant2_number", [-1, -10])
          .single()

        if (fetchError || !exclusionRecord) {
          console.error("Error fetching exclusion record:", fetchError)
          return res.status(404).json({ error: "Exclusion record not found" })
        }

        const participantNumber = exclusionRecord.participant1_number

        // Delete the exclusion record (participant2_number = -1 or -10)
        const { error: deleteExclusionError } = await supabase
          .from("excluded_pairs")
          .delete()
          .eq("id", id)
          .eq("match_id", STATIC_MATCH_ID)

        if (deleteExclusionError) {
          console.error("Error removing excluded participant:", deleteExclusionError)
          return res.status(500).json({ error: deleteExclusionError.message })
        }

        // Also remove all excluded pairs containing this participant
        const { data: deletedPairs, error: deletePairsError } = await supabase
          .from("excluded_pairs")
          .delete()
          .eq("match_id", STATIC_MATCH_ID)
          .or(`participant1_number.eq.${participantNumber},participant2_number.eq.${participantNumber}`)
          .select()

        if (deletePairsError) {
          console.error("Error removing excluded pairs:", deletePairsError)
          // Don't fail the whole operation, just log it
        }

        const pairsRemoved = deletedPairs?.length || 0
        console.log(`✅ Removed excluded participant #${participantNumber} and ${pairsRemoved} associated pair(s)`)
        
        return res.status(200).json({ 
          success: true,
          pairsRemoved,
          message: pairsRemoved > 0 
            ? `Excluded participant removed and ${pairsRemoved} excluded pair(s) deleted`
            : "Excluded participant removed successfully"
        })

      } catch (error) {
        console.error("Error in remove-excluded-participant:", error)
        return res.status(500).json({ error: "Failed to remove excluded participant" })
      }
    }

    // CLEAR ALL EXCLUDED PARTICIPANTS (from excluded_pairs with -1)
    if (action === "clear-excluded-participants") {
      try {
        const { error } = await supabase
          .from("excluded_pairs")
          .delete()
          .eq("match_id", STATIC_MATCH_ID)
          .eq("participant2_number", -1)

        if (error) {
          console.error("Error clearing excluded participants:", error)
          return res.status(500).json({ error: error.message })
        }

        console.log(`✅ Cleared all excluded participants for match_id: ${STATIC_MATCH_ID}`)
        return res.status(200).json({ 
          success: true,
          message: "All excluded participants cleared successfully" 
        })

      } catch (error) {
        console.error("Error in clear-excluded-participants:", error)
        return res.status(500).json({ error: "Failed to clear excluded participants" })
      }
    }

    // UPDATE PAYMENT STATUS ACTION
    if (action === "update-payment-status") {
      try {
        const { participant_id, field, value } = req.body
        
        if (!participant_id || !field || value === undefined) {
          return res.status(400).json({ error: "Missing required parameters" })
        }
        
        if (field !== "PAID" && field !== "PAID_DONE") {
          return res.status(400).json({ error: "Invalid field name" })
        }
        
        const { data, error } = await supabase
          .from("participants")
          .update({ [field]: value })
          .eq("id", participant_id)
          .eq("match_id", STATIC_MATCH_ID)
          .select()
        
        if (error) {
          console.error("Update error:", error)
          return res.status(500).json({ error: error.message })
        }
        
        console.log(`✅ Updated ${field} to ${value} for participant ${participant_id}`)
        return res.status(200).json({ success: true, data: data[0] })
        
      } catch (error) {
        console.error("Error updating payment status:", error)
        return res.status(500).json({ error: "Failed to update payment status" })
      }
    }

    // PIN MATCH ACTION - Assign table number to a match
    if (action === "pin-match") {
      try {
        const { match_id: matchResultId } = req.body
        
        if (!matchResultId) {
          return res.status(400).json({ error: "Missing match_id parameter" })
        }
        
        // Get the highest current table number
        const { data: maxTableData, error: maxTableError } = await supabase
          .from("match_results")
          .select("table_number")
          .eq("match_id", STATIC_MATCH_ID)
          .not("table_number", "is", null)
          .order("table_number", { ascending: false })
          .limit(1)
        
        if (maxTableError) {
          console.error("Error getting max table number:", maxTableError)
          return res.status(500).json({ error: maxTableError.message })
        }
        
        // Calculate next table number
        const nextTableNumber = maxTableData && maxTableData.length > 0 
          ? maxTableData[0].table_number + 1 
          : 1
        
        // Update the match with the table number
        const { data, error } = await supabase
          .from("match_results")
          .update({ table_number: nextTableNumber })
          .eq("id", matchResultId)
          .eq("match_id", STATIC_MATCH_ID)
          .select()
        
        if (error) {
          console.error("Error pinning match:", error)
          return res.status(500).json({ error: error.message })
        }
        
        if (!data || data.length === 0) {
          return res.status(404).json({ error: "Match not found" })
        }
        
        console.log(`✅ Pinned match ${matchResultId} to table ${nextTableNumber}`)
        return res.status(200).json({ 
          success: true, 
          table_number: nextTableNumber,
          match: data[0]
        })
        
      } catch (error) {
        console.error("Error pinning match:", error)
        return res.status(500).json({ error: "Failed to pin match" })
      }
    }

    // PREPARE FOR NEXT EVENT ACTION - Reset all participants for next event
    if (action === "prepare-next-event") {
      try {
        console.log("🔄 Preparing for next event - resetting participant statuses...")
        
        // Update all participants to reset their status for next event
        const { data, error } = await supabase
          .from("participants")
          .update({
            signup_for_next_event: false,
            PAID: false,
            PAID_DONE: false
          })
          .eq("match_id", STATIC_MATCH_ID)
          .select("id, assigned_number")
        
        if (error) {
          console.error("Error preparing for next event:", error)
          return res.status(500).json({ error: error.message })
        }
        
        const updatedCount = data ? data.length : 0
        console.log(`✅ Successfully prepared for next event - updated ${updatedCount} participants`)
        
        return res.status(200).json({ 
          success: true, 
          message: "Successfully prepared for next event",
          updatedCount: updatedCount,
          details: {
            signup_for_next_event: false,
            PAID: false,
            PAID_DONE: false
          }
        })
        
      } catch (error) {
        console.error("Error preparing for next event:", error)
        return res.status(500).json({ error: "Failed to prepare for next event" })
      }
    }

    // GET CACHED RESULTS ACTION - Fetch results from compatibility cache table
    if (action === "get-cached-results") {
      try {
        const { event_id } = req.body
        
        if (!event_id) {
          return res.status(400).json({ error: "Missing event_id parameter" })
        }
        
        console.log(`🔍 Fetching cached results for event ${event_id}`)
        
        // Get all compatibility cache entries and match results for the event
        const { data: cacheData, error: cacheError } = await supabase
          .from("compatibility_cache")
          .select("*")
          .order("total_compatibility_score", { ascending: false })
        
        if (cacheError) {
          console.error("Error fetching cache data:", cacheError)
          return res.status(500).json({ error: cacheError.message })
        }
        
        // Get match results for the event to identify actual matches
        const { data: matchResults, error: matchError } = await supabase
          .from("match_results")
          .select("*")
          .eq("match_id", STATIC_MATCH_ID)
          .eq("event_id", event_id)
        
        if (matchError) {
          console.error("Error fetching match results:", matchError)
          return res.status(500).json({ error: matchError.message })
        }
        
        // Get all participants to have their names and info
        const { data: participants, error: participantsError } = await supabase
          .from("participants")
          .select("id, assigned_number, name, survey_data, PAID_DONE")
          .eq("match_id", STATIC_MATCH_ID)
        
        if (participantsError) {
          console.error("Error fetching participants:", participantsError)
          return res.status(500).json({ error: participantsError.message })
        }
        
        // Create participant info map
        const participantInfoMap = new Map()
        participants.forEach(p => {
          participantInfoMap.set(p.assigned_number, {
            id: p.id,
            name: p.name || p.survey_data?.name || `المشارك #${p.assigned_number}`,
            paid_done: p.PAID_DONE || false
          })
        })
        
        // Create match results map for quick lookup
        const matchResultsMap = new Map()
        matchResults.forEach(match => {
          const key1 = `${match.participant_a_number}-${match.participant_b_number}`
          const key2 = `${match.participant_b_number}-${match.participant_a_number}`
          matchResultsMap.set(key1, match)
          matchResultsMap.set(key2, match)
        })
        
        // Convert cache data to calculated pairs format
        const calculatedPairs = cacheData.map(cache => {
          const key = `${cache.participant_a_number}-${cache.participant_b_number}`
          const matchResult = matchResultsMap.get(key)
          const isActualMatch = !!matchResult
          
          return {
            id: cache.id,
            participant_a: cache.participant_a_number,
            participant_b: cache.participant_b_number,
            compatibility_score: Math.round(parseFloat(cache.total_compatibility_score)),
            mbti_compatibility_score: parseFloat(cache.mbti_score),
            attachment_compatibility_score: parseFloat(cache.attachment_score),
            communication_compatibility_score: parseFloat(cache.communication_score),
            lifestyle_compatibility_score: parseFloat(cache.lifestyle_score),
            core_values_compatibility_score: parseFloat(cache.core_values_score),
            vibe_compatibility_score: parseFloat(cache.ai_vibe_score),
            reason: `MBTI: ${parseFloat(cache.mbti_score).toFixed(1)}% + Attachment: ${parseFloat(cache.attachment_score).toFixed(1)}% + Communication: ${parseFloat(cache.communication_score).toFixed(1)}% + Lifestyle: ${parseFloat(cache.lifestyle_score).toFixed(1)}% + Values: ${parseFloat(cache.core_values_score).toFixed(1)}% + Vibe: ${parseFloat(cache.ai_vibe_score).toFixed(1)}%`,
            is_actual_match: isActualMatch,
            use_count: cache.use_count,
            last_used: cache.last_used,
            created_at: cache.created_at
          }
        })
        
        // Convert match results to participant results format
        const participantResults = []
        const processedParticipants = new Set()
        
        matchResults.forEach(match => {
          // Process participant A
          if (match.participant_a_number && !processedParticipants.has(match.participant_a_number)) {
            const participantInfo = participantInfoMap.get(match.participant_a_number)
            const partnerInfo = participantInfoMap.get(match.participant_b_number)
            
            participantResults.push({
              id: participantInfo?.id || `participant_${match.participant_a_number}`,
              assigned_number: match.participant_a_number,
              name: participantInfo?.name || `المشارك #${match.participant_a_number}`,
              compatibility_score: match.compatibility_score || 0,
              mbti_compatibility_score: match.mbti_compatibility_score || 0,
              attachment_compatibility_score: match.attachment_compatibility_score || 0,
              communication_compatibility_score: match.communication_compatibility_score || 0,
              lifestyle_compatibility_score: match.lifestyle_compatibility_score || 0,
              core_values_compatibility_score: match.core_values_compatibility_score || 0,
              vibe_compatibility_score: match.vibe_compatibility_score || 0,
              partner_assigned_number: match.participant_b_number,
              partner_name: partnerInfo?.name || `المشارك #${match.participant_b_number}`,
              is_organizer_match: match.participant_b_number === 9999,
              paid_done: participantInfo?.paid_done || false,
              partner_paid_done: partnerInfo?.paid_done || false
            })
            processedParticipants.add(match.participant_a_number)
          }
          
          // Process participant B (only if not organizer and not already processed)
          if (match.participant_b_number && match.participant_b_number !== 9999 && !processedParticipants.has(match.participant_b_number)) {
            const participantInfo = participantInfoMap.get(match.participant_b_number)
            const partnerInfo = participantInfoMap.get(match.participant_a_number)
            
            participantResults.push({
              id: participantInfo?.id || `participant_${match.participant_b_number}`,
              assigned_number: match.participant_b_number,
              name: participantInfo?.name || `المشارك #${match.participant_b_number}`,
              compatibility_score: match.compatibility_score || 0,
              mbti_compatibility_score: match.mbti_compatibility_score || 0,
              attachment_compatibility_score: match.attachment_compatibility_score || 0,
              communication_compatibility_score: match.communication_compatibility_score || 0,
              lifestyle_compatibility_score: match.lifestyle_compatibility_score || 0,
              core_values_compatibility_score: match.core_values_compatibility_score || 0,
              vibe_compatibility_score: match.vibe_compatibility_score || 0,
              partner_assigned_number: match.participant_a_number,
              partner_name: partnerInfo?.name || `المشارك #${match.participant_a_number}`,
              is_organizer_match: match.participant_a_number === 9999,
              paid_done: participantInfo?.paid_done || false,
              partner_paid_done: partnerInfo?.paid_done || false
            })
            processedParticipants.add(match.participant_b_number)
          }
        })
        
        console.log(`✅ Found ${calculatedPairs.length} cached pairs and ${participantResults.length} participant results for event ${event_id}`)
        
        return res.status(200).json({
          success: true,
          calculatedPairs,
          participantResults,
          totalMatches: matchResults.length,
          cacheStats: {
            totalPairs: cacheData.length,
            avgUseCount: cacheData.length > 0 ? (cacheData.reduce((sum, c) => sum + c.use_count, 0) / cacheData.length).toFixed(1) : 0
          }
        })
        
      } catch (error) {
        console.error("Error fetching cached results:", error)
        return res.status(500).json({ error: "Failed to fetch cached results" })
      }
    }

    // SAVE ADMIN RESULTS ACTION - Store match generation session for persistence
    if (action === "save-admin-results") {
      try {
        const { 
          sessionId, 
          eventId, 
          matchType, 
          generationType, 
          matchResults, 
          calculatedPairs, 
          participantResults,
          totalMatches,
          totalParticipants,
          skipAI,
          excludedPairs,
          excludedParticipants,
          lockedMatches,
          generationDurationMs,
          cacheHitRate,
          aiCallsMade,
          notes
        } = req.body
        
        if (!sessionId || !eventId || !matchType || !generationType) {
          return res.status(400).json({ error: "Missing required parameters" })
        }
        
        console.log(`💾 Saving admin results session: ${sessionId}`)
        
        // Deactivate previous sessions of the same type for this event
        const { error: deactivateError } = await supabase
          .from("admin_results")
          .update({ is_active: false })
          .eq("event_id", eventId)
          .eq("match_type", matchType)
          .eq("is_active", true)
        
        if (deactivateError) {
          console.error("Error deactivating previous sessions:", deactivateError)
        }
        
        // Insert new session
        const { data, error } = await supabase
          .from("admin_results")
          .insert([{
            session_id: sessionId,
            event_id: eventId,
            match_type: matchType,
            generation_type: generationType,
            match_results: matchResults || [],
            calculated_pairs: calculatedPairs || [],
            participant_results: participantResults || [],
            total_matches: totalMatches || 0,
            total_participants: totalParticipants || 0,
            skip_ai: skipAI || false,
            excluded_pairs: excludedPairs || [],
            excluded_participants: excludedParticipants || [],
            locked_matches: lockedMatches || [],
            generation_duration_ms: generationDurationMs,
            cache_hit_rate: cacheHitRate,
            ai_calls_made: aiCallsMade || 0,
            notes: notes || null
          }])
          .select()
          .single()
        
        if (error) {
          console.error("Error saving admin results:", error)
          return res.status(500).json({ error: error.message })
        }
        
        console.log(`✅ Saved admin results session: ${sessionId}`)
        return res.status(200).json({ 
          success: true, 
          sessionId: data.session_id,
          id: data.id 
        })
        
      } catch (error) {
        console.error("Error saving admin results:", error)
        return res.status(500).json({ error: "Failed to save admin results" })
      }
    }

    // GET ADMIN RESULTS ACTION - Retrieve saved match generation sessions
    if (action === "get-admin-results") {
      try {
        const { eventId, matchType, sessionId, includeInactive = false } = req.body
        
        let query = supabase
          .from("admin_results")
          .select("*")
          .order("created_at", { ascending: false })
        
        if (eventId) {
          query = query.eq("event_id", eventId)
        }
        
        if (matchType) {
          query = query.eq("match_type", matchType)
        }
        
        if (sessionId) {
          query = query.eq("session_id", sessionId)
        }
        
        if (!includeInactive) {
          query = query.eq("is_active", true)
        }
        
        const { data, error } = await query
        
        if (error) {
          console.error("Error fetching admin results:", error)
          return res.status(500).json({ error: error.message })
        }
        
        console.log(`📊 Retrieved ${data.length} admin results sessions`)
        return res.status(200).json({ 
          success: true, 
          sessions: data 
        })
        
      } catch (error) {
        console.error("Error fetching admin results:", error)
        return res.status(500).json({ error: "Failed to fetch admin results" })
      }
    }

    // GET LATEST ADMIN RESULTS ACTION - Get the most recent active session
    if (action === "get-latest-admin-results") {
      try {
        const { eventId, matchType } = req.body
        
        if (!eventId || !matchType) {
          return res.status(400).json({ error: "Missing eventId or matchType" })
        }
        
        const { data, error } = await supabase
          .from("admin_results")
          .select("*")
          .eq("event_id", eventId)
          .eq("match_type", matchType)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .single()
        
        if (error && error.code !== 'PGRST116') {
          console.error("Error fetching latest admin results:", error)
          return res.status(500).json({ error: error.message })
        }
        
        if (!data) {
          return res.status(200).json({ 
            success: true, 
            session: null,
            message: "No active session found" 
          })
        }
        
        console.log(`📊 Retrieved latest admin results: ${data.session_id}`)
        return res.status(200).json({ 
          success: true, 
          session: data 
        })
        
      } catch (error) {
        console.error("Error fetching latest admin results:", error)
        return res.status(500).json({ error: "Failed to fetch latest admin results" })
      }
    }

    // PIN ADMIN RESULTS ACTION - Pin/unpin a session for easy access
    if (action === "pin-admin-results") {
      try {
        const { sessionId, pinned } = req.body
        
        if (!sessionId || typeof pinned !== 'boolean') {
          return res.status(400).json({ error: "Missing sessionId or pinned parameter" })
        }
        
        const { error } = await supabase
          .from("admin_results")
          .update({ is_pinned: pinned })
          .eq("session_id", sessionId)
        
        if (error) {
          console.error("Error pinning admin results:", error)
          return res.status(500).json({ error: error.message })
        }
        
        console.log(`📌 ${pinned ? 'Pinned' : 'Unpinned'} session: ${sessionId}`)
        return res.status(200).json({ 
          success: true, 
          message: `Session ${pinned ? 'pinned' : 'unpinned'} successfully` 
        })
        
      } catch (error) {
        console.error("Error pinning admin results:", error)
        return res.status(500).json({ error: "Failed to pin admin results" })
      }
    }

    // DELETE ADMIN RESULTS ACTION - Remove a session
    if (action === "delete-admin-results") {
      try {
        const { sessionId } = req.body
        
        if (!sessionId) {
          return res.status(400).json({ error: "Missing sessionId parameter" })
        }
        
        const { error } = await supabase
          .from("admin_results")
          .delete()
          .eq("session_id", sessionId)
        
        if (error) {
          console.error("Error deleting admin results:", error)
          return res.status(500).json({ error: error.message })
        }
        
        console.log(`🗑️ Deleted session: ${sessionId}`)
        return res.status(200).json({ 
          success: true, 
          message: "Session deleted successfully" 
        })
        
      } catch (error) {
        console.error("Error deleting admin results:", error)
        return res.status(500).json({ error: "Failed to delete admin results" })
      }
    }

    // GET FRESH RESULTS ACTION - Load current database state (for post-swap refreshes)
    if (action === "get-fresh-results") {
      try {
        const { event_id, match_type } = req.body
        
        if (!event_id || !match_type) {
          return res.status(400).json({ error: "Missing event_id or match_type" })
        }
        
        console.log(`🔄 Fetching fresh ${match_type} results from database for event ${event_id}`)
        
        if (match_type === "group") {
          // Fetch group matches from group_matches table
          const { data: groupMatches, error: groupError } = await supabase
            .from("group_matches")
            .select("*")
            .eq("match_id", STATIC_MATCH_ID)
            .eq("event_id", event_id)
            .order("group_number", { ascending: true })
          
          if (groupError) {
            console.error("Error fetching fresh group results:", groupError)
            return res.status(500).json({ error: groupError.message })
          }
          
          console.log(`✅ Loaded ${groupMatches?.length || 0} fresh group matches`)
          return res.status(200).json({ 
            success: true, 
            results: groupMatches || [],
            calculatedPairs: [] // Groups don't have calculated pairs
          })
        } else {
          // Fetch individual matches from match_results table
          const { data: matchResults, error: matchError } = await supabase
            .from("match_results")
            .select("*")
            .eq("match_id", STATIC_MATCH_ID)
            .eq("event_id", event_id)
            .neq("round", 0) // Exclude group matches (round = 0)
            .order("created_at", { ascending: false })
          
          if (matchError) {
            console.error("Error fetching fresh individual results:", matchError)
            return res.status(500).json({ error: matchError.message })
          }

          // Get compatibility cache data for calculated pairs
          const { data: cacheData, error: cacheError } = await supabase
            .from("compatibility_cache")
            .select("*")
            .order("total_compatibility_score", { ascending: false })
          
          if (cacheError) {
            console.warn("Could not fetch cache data:", cacheError)
          }
          
          // Convert cache data to calculated pairs format
          const calculatedPairs = (cacheData || []).map(cache => ({
            participant_a: cache.participant_a_number,
            participant_b: cache.participant_b_number,
            compatibility_score: Math.round(parseFloat(cache.total_compatibility_score)),
            mbti_compatibility_score: parseFloat(cache.mbti_score),
            attachment_compatibility_score: parseFloat(cache.attachment_score),
            communication_compatibility_score: parseFloat(cache.communication_score),
            lifestyle_compatibility_score: parseFloat(cache.lifestyle_score),
            core_values_compatibility_score: parseFloat(cache.core_values_score),
            vibe_compatibility_score: parseFloat(cache.ai_vibe_score),
            reason: `MBTI: ${parseFloat(cache.mbti_score).toFixed(1)}% + Attachment: ${parseFloat(cache.attachment_score).toFixed(1)}% + Communication: ${parseFloat(cache.communication_score).toFixed(1)}% + Lifestyle: ${parseFloat(cache.lifestyle_score).toFixed(1)}% + Values: ${parseFloat(cache.core_values_score).toFixed(1)}% + Vibe: ${parseFloat(cache.ai_vibe_score).toFixed(1)}%`,
            is_actual_match: matchResults?.some(match => 
              (match.participant_a_number === cache.participant_a_number && match.participant_b_number === cache.participant_b_number) ||
              (match.participant_a_number === cache.participant_b_number && match.participant_b_number === cache.participant_a_number)
            ) || false
          }))
          
          // Fetch participant names to include with results
          const { data: participants, error: participantsError } = await supabase
            .from("participants")
            .select("assigned_number, name, survey_data")
            .eq("match_id", STATIC_MATCH_ID)
            .neq("assigned_number", 9999)
          
          if (participantsError) {
            console.warn("Could not fetch participant names:", participantsError)
          }
          
          // Create participant name map
          const participantNameMap = new Map()
          if (participants) {
            participants.forEach(p => {
              const name = p.name || p.survey_data?.name || `المشارك #${p.assigned_number}`
              participantNameMap.set(p.assigned_number, name)
            })
          }
          
          // Enhance match results with participant names
          const enhancedResults = (matchResults || []).map(match => ({
            ...match,
            participant_a_name: participantNameMap.get(match.participant_a_number) || `المشارك #${match.participant_a_number}`,
            participant_b_name: participantNameMap.get(match.participant_b_number) || `المشارك #${match.participant_b_number}`
          }))
          
          console.log(`✅ Loaded ${enhancedResults.length} fresh individual matches with ${calculatedPairs.length} calculated pairs and participant names`)
          return res.status(200).json({ 
            success: true, 
            results: enhancedResults,
            calculatedPairs: calculatedPairs,
            participantNames: Object.fromEntries(participantNameMap)
          })
        }
        
      } catch (error) {
        console.error("Error fetching fresh results:", error)
        return res.status(500).json({ error: "Failed to fetch fresh results" })
      }
    }

    // 🔹 CLEAN SLATE - Remove last admin result and current event matches
    if (action === "clean-slate") {
      try {
        const { event_id } = req.body
        console.log(`🧹 Starting clean slate operation for event_id: ${event_id}`)
        
        let adminResultsRemoved = 0
        let matchesRemoved = 0
        
        // Step 1: Remove the LAST admin result from admin_results table
        const { data: lastAdminResult, error: fetchError } = await supabase
          .from("admin_results")
          .select("id, created_at, match_type")
          .order("created_at", { ascending: false })
          .limit(1)
          .single()
        
        if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = no rows found
          console.error("Error fetching last admin result:", fetchError)
          return res.status(500).json({ error: "Failed to fetch last admin result" })
        }
        
        if (lastAdminResult) {
          const { error: deleteAdminError } = await supabase
            .from("admin_results")
            .delete()
            .eq("id", lastAdminResult.id)
          
          if (deleteAdminError) {
            console.error("Error deleting admin result:", deleteAdminError)
            return res.status(500).json({ error: "Failed to delete admin result" })
          }
          
          adminResultsRemoved = 1
          console.log(`✅ Removed admin result: ${lastAdminResult.id} (${lastAdminResult.match_type}, ${lastAdminResult.created_at})`)
        } else {
          console.log("ℹ️ No admin results found to remove")
        }
        
        // Step 2: Remove ALL matches for the current event from match_results table
        const { data: matchesToDelete, error: fetchMatchesError } = await supabase
          .from("match_results")
          .select("id")
          .eq("event_id", event_id)
        
        if (fetchMatchesError) {
          console.error("Error fetching matches to delete:", fetchMatchesError)
          return res.status(500).json({ error: "Failed to fetch matches to delete" })
        }
        
        if (matchesToDelete && matchesToDelete.length > 0) {
          const { error: deleteMatchesError } = await supabase
            .from("match_results")
            .delete()
            .eq("event_id", event_id)
          
          if (deleteMatchesError) {
            console.error("Error deleting matches:", deleteMatchesError)
            return res.status(500).json({ error: "Failed to delete matches" })
          }
          
          matchesRemoved = matchesToDelete.length
          console.log(`✅ Removed ${matchesRemoved} matches for event ${event_id}`)
        } else {
          console.log(`ℹ️ No matches found for event ${event_id} to remove`)
        }
        
        console.log(`🧹 Clean slate completed: ${adminResultsRemoved} admin results + ${matchesRemoved} matches removed`)
        
        return res.status(200).json({ 
          success: true,
          message: "Clean slate completed successfully",
          adminResultsRemoved,
          matchesRemoved,
          event_id
        })
        
      } catch (error) {
        console.error("Error during clean slate operation:", error)
        return res.status(500).json({ error: "Failed to complete clean slate operation" })
      }
    }

    // 🔹 RESET GROUPS - Remove all group matches for current event
    if (action === "reset-groups") {
      try {
        const { event_id } = req.body
        console.log(`🔄 Resetting all groups for event_id: ${event_id}`)
        
        // Get count of groups before deletion
        const { data: groupsToDelete, error: fetchError } = await supabase
          .from("group_matches")
          .select("id")
          .eq("event_id", event_id)
        
        if (fetchError) {
          console.error("Error fetching groups to delete:", fetchError)
          return res.status(500).json({ error: "Failed to fetch groups to delete" })
        }
        
        const groupCount = groupsToDelete ? groupsToDelete.length : 0
        
        if (groupCount > 0) {
          // Delete all group matches for the current event
          const { error: deleteError } = await supabase
            .from("group_matches")
            .delete()
            .eq("event_id", event_id)
          
          if (deleteError) {
            console.error("Error deleting groups:", deleteError)
            return res.status(500).json({ error: "Failed to delete groups" })
          }
          
          console.log(`✅ Removed ${groupCount} group(s) for event ${event_id}`)
        } else {
          console.log(`ℹ️ No groups found for event ${event_id}`)
        }
        
        return res.status(200).json({ 
          success: true,
          message: "Groups reset successfully",
          groupsRemoved: groupCount,
          event_id
        })
        
      } catch (error) {
        console.error("Error during reset groups operation:", error)
        return res.status(500).json({ error: "Failed to reset groups" })
      }
    }

    // 🔹 CLEAR NON-PERMANENT EXCLUSIONS - Remove all temporary exclusions (keep permanent bans)
    if (action === "clear-temp-exclusions") {
      try {
        console.log(`🧹 Clearing all temporary exclusions (keeping permanent bans with -10)`)
        
        // Delete all excluded_pairs where participant2_number = -1 (temporary exclusions)
        // Keep entries with participant2_number = -10 (permanent bans)
        const { data: exclusionsToDelete, error: fetchError } = await supabase
          .from("excluded_pairs")
          .select("id, participant1_number, participant2_number")
          .eq("match_id", STATIC_MATCH_ID)
          .eq("participant2_number", -1)
          .neq("participant2_number", -10) // Extra safety: explicitly exclude permanent bans
        
        if (fetchError) {
          console.error("Error fetching exclusions to delete:", fetchError)
          return res.status(500).json({ error: "Failed to fetch exclusions to delete" })
        }
        
        const exclusionCount = exclusionsToDelete ? exclusionsToDelete.length : 0
        
        // Extra validation: ensure we're only deleting -1 entries
        const idsToDelete = (exclusionsToDelete || [])
          .filter(item => item.participant2_number === -1) // Double-check it's not -10
          .map(item => item.id)
        
        if (idsToDelete.length === 0) {
          console.log(`ℹ️ No temporary exclusions (-1) found to remove`)
          return res.status(200).json({ 
            success: true,
            exclusionsRemoved: 0, 
            message: "No temporary exclusions found" 
          })
        }
        
        const { error: deleteError } = await supabase
          .from("excluded_pairs")
          .delete()
          .in("id", idsToDelete) // Delete only specific IDs that we've verified are -1
        
        if (deleteError) {
          console.error("Error deleting temporary exclusions:", deleteError)
          return res.status(500).json({ error: "Failed to delete temporary exclusions" })
        }
        
        console.log(`✅ Removed ${idsToDelete.length} temporary exclusion(s), kept permanent bans (-10)`)
        
        return res.status(200).json({ 
          success: true,
          message: "Temporary exclusions cleared successfully",
          exclusionsRemoved: idsToDelete.length
        })
        
      } catch (error) {
        console.error("Error during clear temp exclusions operation:", error)
        return res.status(500).json({ error: "Failed to clear temporary exclusions" })
      }
    }

    // 🔹 MARK MESSAGES SENT - Update PAID status for selected participants
    if (action === "mark-messages-sent") {
      try {
        const { participantNumbers } = req.body
        
        if (!participantNumbers || !Array.isArray(participantNumbers) || participantNumbers.length === 0) {
          return res.status(400).json({ error: "Missing or invalid participantNumbers array" })
        }
        
        console.log(`📱 Marking ${participantNumbers.length} participants as message sent: ${participantNumbers.join(', ')}`)
        
        // Update PAID column to true for selected participants
        const { data, error } = await supabase
          .from("participants")
          .update({ PAID: true })
          .eq("match_id", STATIC_MATCH_ID)
          .in("assigned_number", participantNumbers)
        
        if (error) {
          console.error("Error updating message sent status:", error)
          return res.status(500).json({ error: "Failed to update message sent status" })
        }
        
        console.log(`✅ Successfully marked ${participantNumbers.length} participants as message sent`)
        
        return res.status(200).json({ 
          success: true,
          message: `Marked ${participantNumbers.length} participants as message sent`,
          updatedParticipants: participantNumbers.length
        })
        
      } catch (error) {
        console.error("Error in mark-messages-sent:", error)
        return res.status(500).json({ error: "Failed to mark messages as sent" })
      }
    }

    // 🔹 TOGGLE MESSAGE STATUS - Toggle PAID status for individual participant
    if (action === "toggle-message-status") {
      try {
        const { participantNumber, newStatus } = req.body
        
        if (typeof participantNumber !== 'number' || typeof newStatus !== 'boolean') {
          return res.status(400).json({ error: "Invalid participantNumber or newStatus" })
        }
        
        console.log(`📱 Toggling message status for participant #${participantNumber} to ${newStatus}`)
        
        // Update PAID column for the specific participant
        const { data, error } = await supabase
          .from("participants")
          .update({ PAID: newStatus })
          .eq("match_id", STATIC_MATCH_ID)
          .eq("assigned_number", participantNumber)
        
        if (error) {
          console.error("Error updating message status:", error)
          return res.status(500).json({ error: "Failed to update message status" })
        }
        
        console.log(`✅ Successfully updated message status for participant #${participantNumber} to ${newStatus}`)
        
        return res.status(200).json({ 
          success: true,
          message: `Updated message status for participant #${participantNumber}`,
          participantNumber,
          newStatus
        })
        
      } catch (error) {
        console.error("Error in toggle-message-status:", error)
        return res.status(500).json({ error: "Failed to toggle message status" })
      }
    }

    // 🔹 TOGGLE PAYMENT STATUS - Toggle PAID_DONE status for individual participant
    if (action === "toggle-payment-status") {
      try {
        const { participantNumber, newStatus } = req.body
        
        if (typeof participantNumber !== 'number' || typeof newStatus !== 'boolean') {
          return res.status(400).json({ error: "Invalid participantNumber or newStatus" })
        }
        
        console.log(`💰 Toggling payment status for participant #${participantNumber} to ${newStatus}`)
        
        // Update PAID_DONE column for the specific participant
        const { data, error } = await supabase
          .from("participants")
          .update({ PAID_DONE: newStatus })
          .eq("match_id", STATIC_MATCH_ID)
          .eq("assigned_number", participantNumber)
        
        if (error) {
          console.error("Error updating payment status:", error)
          return res.status(500).json({ error: "Failed to update payment status" })
        }
        
        console.log(`✅ Successfully updated payment status for participant #${participantNumber} to ${newStatus}`)
        
        return res.status(200).json({ 
          success: true,
          message: `Updated payment status for participant #${participantNumber}`,
          participantNumber,
          newStatus
        })
        
      } catch (error) {
        console.error("Error in toggle-payment-status:", error)
        return res.status(500).json({ error: "Failed to toggle payment status" })
      }
    }

    // 🔹 UPDATE GENDER PREFERENCE - Update gender preference for individual participant
    if (action === "update-gender-preference") {
      try {
        const { participantNumber, genderPreference } = req.body
        
        if (typeof participantNumber !== 'number') {
          return res.status(400).json({ error: "Invalid participantNumber" })
        }
        
        // Validate gender preference value
        const validPreferences = ['opposite_gender', 'same_gender', 'any_gender']
        if (!validPreferences.includes(genderPreference)) {
          return res.status(400).json({ error: `Invalid genderPreference. Must be one of: ${validPreferences.join(', ')}` })
        }
        
        console.log(`🔄 Updating gender preference for participant #${participantNumber} to ${genderPreference}`)
        
        // First, get the current participant data
        const { data: currentData, error: fetchError } = await supabase
          .from("participants")
          .select("survey_data, gender, same_gender_preference, any_gender_preference")
          .eq("match_id", STATIC_MATCH_ID)
          .eq("assigned_number", participantNumber)
          .single()
        
        if (fetchError || !currentData) {
          console.error("Error fetching participant:", fetchError)
          return res.status(404).json({ error: "Participant not found" })
        }
        
        // Prepare the updated survey_data
        const updatedSurveyData = {
          ...currentData.survey_data,
          answers: {
            ...currentData.survey_data?.answers,
            actual_gender_preference: genderPreference === 'opposite_gender' ? undefined : genderPreference,
            // Keep the selected gender (male/female) from existing data
            gender_preference: currentData.survey_data?.answers?.gender_preference || currentData.gender || 'male'
          }
        }
        
        // Calculate the boolean flags based on preference
        const same_gender_preference = genderPreference === 'same_gender'
        const any_gender_preference = genderPreference === 'any_gender'
        
        // Update the participant with new gender preference
        const { data, error } = await supabase
          .from("participants")
          .update({ 
            same_gender_preference,
            any_gender_preference,
            survey_data: updatedSurveyData
          })
          .eq("match_id", STATIC_MATCH_ID)
          .eq("assigned_number", participantNumber)
        
        if (error) {
          console.error("Error updating gender preference:", error)
          return res.status(500).json({ error: "Failed to update gender preference" })
        }
        
        console.log(`✅ Successfully updated gender preference for participant #${participantNumber}`)
        console.log(`   - same_gender_preference: ${same_gender_preference}`)
        console.log(`   - any_gender_preference: ${any_gender_preference}`)
        
        return res.status(200).json({ 
          success: true,
          message: `Updated gender preference for participant #${participantNumber}`,
          participantNumber,
          genderPreference,
          same_gender_preference,
          any_gender_preference
        })
        
      } catch (error) {
        console.error("Error in update-gender-preference:", error)
        return res.status(500).json({ error: "Failed to update gender preference" })
      }
    }

    // 🔹 DEBUG GROUP ELIGIBILITY - Show why paid participants are/aren't eligible for groups
    if (action === "debug-group-eligibility") {
      try {
        const { eventId } = req.body
        
        console.log(`🐛 Debugging group eligibility for event ${eventId}`)
        
        // Get all paid participants
        const { data: paidParticipants, error: paidError } = await supabase
          .from("participants")
          .select("assigned_number, survey_data, name, gender, age")
          .eq("match_id", STATIC_MATCH_ID)
          .eq("PAID_DONE", true)
          .neq("assigned_number", 9999)
        
        if (paidError) {
          console.error("Error fetching paid participants:", paidError)
          return res.status(500).json({ error: "Failed to fetch paid participants" })
        }
        
        // Get all individual matches for this event
        const { data: existingMatches, error: matchError } = await supabase
          .from("match_results")
          .select("participant_a_number, participant_b_number")
          .eq("match_id", STATIC_MATCH_ID)
          .eq("event_id", eventId)
          .neq("round", 0) // Exclude group matches
        
        if (matchError) {
          console.error("Error fetching matches:", matchError)
          return res.status(500).json({ error: "Failed to fetch matches" })
        }
        
        const eligible = []
        const not_eligible = []
        
        for (const p of paidParticipants) {
          // Check if matched with organizer
          const matchedWithOrganizer = existingMatches && existingMatches.some(match => 
            (match.participant_a_number === p.assigned_number && match.participant_b_number === 9999) ||
            (match.participant_b_number === p.assigned_number && match.participant_a_number === 9999)
          )
          
          if (matchedWithOrganizer) {
            not_eligible.push({
              participant_number: p.assigned_number,
              name: p.name || p.survey_data?.name || 'No name',
              gender: p.gender || p.survey_data?.gender || 'Unknown',
              age: p.age || p.survey_data?.age || 'Unknown',
              reason: 'Matched with organizer (#9999)'
            })
            continue
          }
          
          // Check if has individual match
          const hasIndividualMatch = existingMatches && existingMatches.some(match => 
            (match.participant_a_number === p.assigned_number || match.participant_b_number === p.assigned_number) &&
            match.participant_a_number !== 9999 && match.participant_b_number !== 9999
          )
          
          if (!hasIndividualMatch) {
            not_eligible.push({
              participant_number: p.assigned_number,
              name: p.name || p.survey_data?.name || 'No name',
              gender: p.gender || p.survey_data?.gender || 'Unknown',
              age: p.age || p.survey_data?.age || 'Unknown',
              reason: 'No individual match found'
            })
            continue
          }
          
          // Find who they're matched with
          const match = existingMatches.find(m => 
            m.participant_a_number === p.assigned_number || m.participant_b_number === p.assigned_number
          )
          const matched_with = match 
            ? (match.participant_a_number === p.assigned_number ? match.participant_b_number : match.participant_a_number)
            : 'Unknown'
          
          // Eligible!
          eligible.push({
            participant_number: p.assigned_number,
            name: p.name || p.survey_data?.name || 'No name',
            gender: p.gender || p.survey_data?.gender || 'Unknown',
            age: p.age || p.survey_data?.age || 'Unknown',
            matched_with
          })
        }
        
        console.log(`✅ Debug complete: ${eligible.length} eligible, ${not_eligible.length} not eligible out of ${paidParticipants.length} paid`)
        
        return res.status(200).json({
          success: true,
          total_paid: paidParticipants.length,
          eligible,
          not_eligible
        })
        
      } catch (error) {
        console.error("Error in debug-group-eligibility:", error)
        return res.status(500).json({ error: "Failed to debug group eligibility" })
      }
    }

    // 🔹 DELTA CACHE: Get last cache timestamp for event
    if (action === "get-last-cache-timestamp") {
      try {
        const { event_id } = req.body
        console.log(`Getting last cache timestamp for event_id: ${event_id}`)
        
        const { data, error } = await supabase
          .rpc('get_last_precache_timestamp', { p_event_id: event_id })
        
        if (error) {
          console.error("Error getting last cache timestamp:", error)
          return res.status(500).json({ error: error.message })
        }
        
        return res.status(200).json({
          success: true,
          event_id,
          last_cache_timestamp: data || '1970-01-01T00:00:00Z'
        })
      } catch (error) {
        console.error("Error in get-last-cache-timestamp:", error)
        return res.status(500).json({ error: "Failed to get last cache timestamp" })
      }
    }

    // 🔹 DELTA CACHE: Get participants needing recache
    if (action === "get-participants-needing-cache") {
      try {
        const { event_id, last_cache_timestamp } = req.body
        console.log(`Getting participants needing cache for event_id: ${event_id}`)
        
        // Build query to find participants updated after last cache timestamp
        let query = supabase
          .from("participants")
          .select("assigned_number, survey_data_updated_at, name, gender, age")
          .eq("match_id", STATIC_MATCH_ID)
          .neq("assigned_number", 9999)
          .not("survey_data", "is", null)
        
        // Filter by event eligibility
        query = query.or(`signup_for_next_event.eq.true,event_id.eq.${event_id},auto_signup_next_event.eq.true`)
        
        // If last_cache_timestamp provided, filter for updates after that time
        if (last_cache_timestamp && last_cache_timestamp !== '1970-01-01T00:00:00Z') {
          query = query.or(`survey_data_updated_at.is.null,survey_data_updated_at.gt.${last_cache_timestamp}`)
        }
        
        const { data, error } = await query.order('survey_data_updated_at', { ascending: false, nullsFirst: false })
        
        if (error) {
          console.error("Error getting participants needing cache:", error)
          return res.status(500).json({ error: error.message })
        }
        
        console.log(`Found ${data?.length || 0} participants needing cache`)
        
        return res.status(200).json({
          success: true,
          event_id,
          last_cache_timestamp,
          participants: data || [],
          count: data?.length || 0
        })
      } catch (error) {
        console.error("Error in get-participants-needing-cache:", error)
        return res.status(500).json({ error: "Failed to get participants needing cache" })
      }
    }

    // 🔹 DELTA CACHE: Record cache session
    if (action === "record-cache-session") {
      try {
        const { 
          event_id, 
          participants_cached, 
          pairs_cached, 
          duration_ms, 
          ai_calls, 
          cache_hit_rate, 
          notes 
        } = req.body
        
        console.log(`Recording cache session for event_id: ${event_id}`)
        
        const { data, error } = await supabase
          .rpc('record_cache_session', {
            p_event_id: event_id,
            p_participants_cached: participants_cached || 0,
            p_pairs_cached: pairs_cached || 0,
            p_duration_ms: duration_ms,
            p_ai_calls: ai_calls || 0,
            p_cache_hit_rate: cache_hit_rate,
            p_notes: notes
          })
        
        if (error) {
          console.error("Error recording cache session:", error)
          return res.status(500).json({ error: error.message })
        }
        
        console.log(`✅ Cache session recorded with ID: ${data}`)
        
        return res.status(200).json({
          success: true,
          session_id: data,
          message: `Cache session recorded: ${participants_cached} participants, ${pairs_cached} pairs cached`
        })
      } catch (error) {
        console.error("Error in record-cache-session:", error)
        return res.status(500).json({ error: "Failed to record cache session" })
      }
    }

    // 🔹 DELTA CACHE: Get cache freshness status
    if (action === "get-cache-freshness") {
      try {
        const { event_id } = req.body
        console.log(`Getting cache freshness for event_id: ${event_id}`)
        
        const { data, error } = await supabase
          .from("v_cache_freshness")
          .select("*")
          .eq("event_id", event_id)
          .single()
        
        if (error && error.code !== 'PGRST116') {
          console.error("Error getting cache freshness:", error)
          return res.status(500).json({ error: error.message })
        }
        
        if (!data) {
          // No cache metadata exists yet for this event
          return res.status(200).json({
            success: true,
            event_id,
            cache_status: 'NEVER_CACHED',
            participants_needing_recache: null,
            total_participants_in_event: null,
            last_cache_time: null,
            hours_since_cache: null
          })
        }
        
        return res.status(200).json({
          success: true,
          ...data
        })
      } catch (error) {
        console.error("Error in get-cache-freshness:", error)
        return res.status(500).json({ error: "Failed to get cache freshness" })
      }
    }

    // 🔹 DELTA CACHE: Get cache history for event
    if (action === "get-cache-history") {
      try {
        const { event_id, limit = 10 } = req.body
        console.log(`Getting cache history for event_id: ${event_id}`)
        
        const { data, error } = await supabase
          .from("cache_metadata")
          .select("*")
          .eq("event_id", event_id)
          .order("last_precache_timestamp", { ascending: false })
          .limit(limit)
        
        if (error) {
          console.error("Error getting cache history:", error)
          return res.status(500).json({ error: error.message })
        }
        
        return res.status(200).json({
          success: true,
          event_id,
          sessions: data || [],
          count: data?.length || 0
        })
      } catch (error) {
        console.error("Error in get-cache-history:", error)
        return res.status(500).json({ error: "Failed to get cache history" })
      }
    }

    // 🔹 DELTA CACHE: Invalidate stale cache entries
    if (action === "invalidate-stale-cache") {
      try {
        const { participant_number } = req.body
        console.log(`Invalidating stale cache for participant #${participant_number}`)
        
        // Get participant's current survey_data_updated_at
        const { data: participant, error: pError } = await supabase
          .from("participants")
          .select("survey_data_updated_at")
          .eq("assigned_number", participant_number)
          .eq("match_id", STATIC_MATCH_ID)
          .single()
        
        if (pError) {
          console.error("Error fetching participant:", pError)
          return res.status(500).json({ error: pError.message })
        }
        
        if (!participant?.survey_data_updated_at) {
          return res.status(400).json({ error: "Participant has no survey_data_updated_at timestamp" })
        }
        
        // Delete cache entries where this participant's cached timestamp is older than current
        const { error: deleteError, count } = await supabase
          .from("compatibility_cache")
          .delete()
          .or(`and(participant_a_number.eq.${participant_number},participant_a_cached_at.lt.${participant.survey_data_updated_at}),and(participant_b_number.eq.${participant_number},participant_b_cached_at.lt.${participant.survey_data_updated_at})`)
        
        if (deleteError) {
          console.error("Error invalidating cache:", deleteError)
          return res.status(500).json({ error: deleteError.message })
        }
        
        console.log(`✅ Invalidated ${count || 0} stale cache entries for participant #${participant_number}`)
        
        return res.status(200).json({
          success: true,
          participant_number,
          invalidated_entries: count || 0
        })
      } catch (error) {
        console.error("Error in invalidate-stale-cache:", error)
        return res.status(500).json({ error: "Failed to invalidate stale cache" })
      }
    }

    // 🔹 GET PARTICIPANT BONUS DATA - Check humor and openness matching for specific participants
    if (action === "get-participant-bonus-data") {
      try {
        const { participantA, participantB } = req.body
        console.log(`Getting bonus data for participants #${participantA} and #${participantB}`)
        
        // Fetch both participants' survey data
        const { data: participants, error: pError } = await supabase
          .from("participants")
          .select("assigned_number, survey_data, humor_banter_style, early_openness_comfort")
          .eq("match_id", STATIC_MATCH_ID)
          .in("assigned_number", [participantA, participantB])
        
        if (pError) {
          console.error("Error fetching participants:", pError)
          return res.status(500).json({ error: pError.message })
        }
        
        if (!participants || participants.length !== 2) {
          return res.status(400).json({ error: "Could not find both participants" })
        }
        
        const pA = participants.find(p => p.assigned_number === participantA)
        const pB = participants.find(p => p.assigned_number === participantB)
        
        // Extract humor/banter style from different possible locations
        const humorA = pA.humor_banter_style || 
                       pA.survey_data?.humor_banter_style ||
                       pA.survey_data?.answers?.humor_banter_style
                       
        const humorB = pB.humor_banter_style || 
                       pB.survey_data?.humor_banter_style ||
                       pB.survey_data?.answers?.humor_banter_style

        // Extract early openness comfort from different possible locations
        const opennessA = pA.early_openness_comfort !== undefined ? 
                          pA.early_openness_comfort : 
                          pA.survey_data?.answers?.early_openness_comfort
                          
        const opennessB = pB.early_openness_comfort !== undefined ? 
                          pB.early_openness_comfort : 
                          pB.survey_data?.answers?.early_openness_comfort

        // Check if humor styles match
        const humorMatch = humorA && humorB && humorA === humorB
        
        // Check if openness levels match
        const opennessMatch = opennessA !== undefined && 
                              opennessB !== undefined && 
                              parseInt(opennessA) === parseInt(opennessB)

        console.log(`Bonus data for #${participantA} & #${participantB}: humor=${humorMatch}, openness=${opennessMatch}`)
        
        return res.status(200).json({
          success: true,
          participantA,
          participantB,
          humorMatch,
          opennessMatch,
          humorValues: { A: humorA, B: humorB },
          opennessValues: { A: opennessA, B: opennessB }
        })
      } catch (error) {
        console.error("Error in get-participant-bonus-data:", error)
        return res.status(500).json({ error: "Failed to get participant bonus data" })
      }
    }

    return res.status(405).json({ error: "Unsupported method or action" })
  } catch (error) {
    console.error("Error processing request:", error)
    return res.status(500).json({ error: "Failed to process the request" })
  }
}
