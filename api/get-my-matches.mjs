import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method === "POST") {
    try {
      const { assigned_number, round, match_type = "محايد", action, event_id } = req.body
      const match_id = "00000000-0000-0000-0000-000000000000"
      const currentEventId = event_id || 1 // Default to event 1 if not provided

      // New endpoint for matrix: return all matches
      if (action === "all-matches") {
        // Individual matches
        const { data: matches, error } = await supabase
          .from("match_results")
          .select("*")
          .eq("match_id", match_id)
          .order("round", { ascending: true })

        if (error) {
          console.error("Match error (matrix):", error)
          return res.status(500).json({ error: "Failed to fetch matches" })
        }

        // For each match, return all pairs (A-B, C-D, etc. if present)
        const results = []
        for (const match of matches || []) {
          const participantNumbers = [
            match.participant_a_number, 
            match.participant_b_number, 
            match.participant_c_number, 
            match.participant_d_number,
            match.participant_e_number,  // New fallback participant
            match.participant_f_number   // New fallback participant
          ].filter(n => n && n > 0 && n !== 9999)
          if (participantNumbers.length === 2) {
            // Pair
            results.push({
              with: participantNumbers[0],
              partner: participantNumbers[1],
              type: match.match_type || "غير محدد",
              reason: match.reason || "السبب غير متوفر",
              score: match.compatibility_score ?? 0,
              round: match.round ?? 1,
              table_number: match.table_number || null,
            })
            results.push({
              with: participantNumbers[1],
              partner: participantNumbers[0],
              type: match.match_type || "غير محدد",
              reason: match.reason || "السبب غير متوفر",
              score: match.compatibility_score ?? 0,
              round: match.round ?? 1,
              table_number: match.table_number || null,
            })
          } else if (participantNumbers.length > 2) {
            // For group matches stored as individual, show all pairs
            for (let i = 0; i < participantNumbers.length; i++) {
              for (let j = 0; j < participantNumbers.length; j++) {
                if (i !== j) {
                  results.push({
                    with: participantNumbers[i],
                    partner: participantNumbers[j],
                    type: match.match_type || "غير محدد",
                    reason: match.reason || "السبب غير متوفر",
                    score: match.compatibility_score ?? 0,
                    round: match.round ?? 1,
                    table_number: match.table_number || null,
                  })
                }
              }
            }
          }
        }

        // Group matches from match_results table (round = 0 for group phase)
        const { data: groupMatches, error: groupError } = await supabase
          .from("match_results")
          .select("*")
          .eq("match_id", match_id)
          .eq("round", 0) // Group phase round

        if (groupError) {
          console.error("Group match error (matrix):", groupError)
          return res.status(500).json({ error: "Failed to fetch group matches" })
        }

        const groupResults = (groupMatches || []).map(match => {
          const allParticipants = [
            match.participant_a_number, 
            match.participant_b_number, 
            match.participant_c_number, 
            match.participant_d_number,
            match.participant_e_number,  // New fallback participant
            match.participant_f_number   // New fallback participant
          ].filter(n => n && n > 0 && n !== 9999)
          
          return {
            group_id: `group_${match.group_number}`,
            participants: allParticipants,
            reason: match.reason || "السبب غير متوفر",
            score: match.compatibility_score ?? 0,
            table_number: match.table_number || null,
          }
        })

        return res.status(200).json({ matches: [...results, ...groupResults] })
      }

      if (!assigned_number) {
        return res.status(400).json({ error: "assigned_number is required" })
      }

      // Handle timer actions
      if (action === "start" || action === "get-status" || action === "finish") {
        return await handleTimerAction(req, res, supabase, match_id, currentEventId)
      }

      if (match_type === "محايد" && round === 0) {
        // Get group matches from match_results table (round = 0 for group phase)
        const { data: groupMatches, error: groupError } = await supabase
          .from("match_results")
          .select("*")
          .eq("match_id", match_id)
          .eq("event_id", currentEventId)
          .eq("round", 0) // Group phase round
          .or(`participant_a_number.eq.${assigned_number},participant_b_number.eq.${assigned_number},participant_c_number.eq.${assigned_number},participant_d_number.eq.${assigned_number},participant_e_number.eq.${assigned_number},participant_f_number.eq.${assigned_number}`)

        if (groupError) {
          console.error("Group match error:", groupError)
          return res.status(500).json({ error: "Failed to fetch group matches" })
        }

        const results = (groupMatches || []).map(match => {
          const allParticipants = [
            match.participant_a_number, 
            match.participant_b_number, 
            match.participant_c_number, 
            match.participant_d_number,
            match.participant_e_number,  // New fallback participant
            match.participant_f_number   // New fallback participant
          ].filter(n => n && n > 0 && n !== 9999)
          const otherParticipants = allParticipants.filter(p => p !== assigned_number)
          
          return {
            group_id: `group_${match.group_number}`,
            participants: otherParticipants,
            reason: match.reason || "السبب غير متوفر",
            score: match.compatibility_score ?? 0,
            table_number: match.table_number || null,
          }
        })

        return res.status(200).json({ matches: results })
      } else {
        // Get individual matches
        const { data: matches, error } = await supabase
          .from("match_results")
          .select("*")
          .eq("match_id", match_id)
          .eq("event_id", currentEventId)
          .or(`participant_a_number.eq.${assigned_number},participant_b_number.eq.${assigned_number},participant_c_number.eq.${assigned_number},participant_d_number.eq.${assigned_number},participant_e_number.eq.${assigned_number},participant_f_number.eq.${assigned_number}`)
          .order("round", { ascending: true })

        if (error) {
          console.error("Match error:", error)
          return res.status(500).json({ error: "Failed to fetch matches" })
        }

        const results = (matches || []).map(match => {
          const participantNumbers = [
            match.participant_a_number, 
            match.participant_b_number, 
            match.participant_c_number, 
            match.participant_d_number,
            match.participant_e_number,  // New fallback participant
            match.participant_f_number   // New fallback participant
          ]
          const realParticipants = participantNumbers.filter(n => n && n > 0 && n !== 9999)
          const hasOrganizer = participantNumbers.includes(9999)
          
          // Handle organizer matches specially
          if (hasOrganizer) {
            const actualParticipant = realParticipants.find(n => n.toString() === assigned_number.toString())
            if (actualParticipant) {
              return {
                with: "المنظم",
                partner: actualParticipant,
                type: match.match_type || "مع المنظم",
                reason: match.reason || "جلسة مع المنظم",
                score: match.compatibility_score ?? 0,
                round: match.round ?? 1,
                table_number: match.table_number || null,
                is_repeat_match: match.is_repeat_match || false,
                humor_early_openness_bonus: match.humor_early_openness_bonus || 'none',
              }
            }
          }
          
          const matchedWith = realParticipants.filter(n => n.toString() !== assigned_number.toString())
          
          return {
            with: matchedWith.length === 1 ? matchedWith[0] : matchedWith,  // Handle single participant vs array
            partner: realParticipants.filter(n => n.toString() === assigned_number.toString())[0] || null,
            type: match.match_type || "غير محدد",
            reason: match.reason || "السبب غير متوفر",
            score: match.compatibility_score ?? 0,
            round: match.round ?? 1,
            table_number: match.table_number || null,
            is_repeat_match: match.is_repeat_match || false,
            humor_early_openness_bonus: match.humor_early_openness_bonus || 'none',
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

// Timer handler function
async function handleTimerAction(req, res, supabase, match_id, currentEventId) {
  const { action, assigned_number, round, match_type = "individual", event_id } = req.body
  const effectiveEventId = event_id || currentEventId || 1

  try {
    if (action === "start") {
      // Start timer for a specific round
      if (!round) {
        return res.status(400).json({ error: "Missing round parameter" })
      }

      const now = new Date().toISOString()
      const duration = req.body.duration || 1800 // Default 30 minutes

      if (match_type === "محايد" && round === 0) {
        // Update group match timer - only if not already active
        const { data: existingGroup, error: checkError } = await supabase
          .from("match_results")
          .select("conversation_status, conversation_start_time")
          .eq("match_id", match_id)
          .eq("event_id", effectiveEventId)
          .eq("round", 0)
          .or(`participant_a_number.eq.${assigned_number},participant_b_number.eq.${assigned_number},participant_c_number.eq.${assigned_number},participant_d_number.eq.${assigned_number},participant_e_number.eq.${assigned_number},participant_f_number.eq.${assigned_number}`)
          .single()

        if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "not found"
          console.error("Error checking group timer status:", checkError)
          return res.status(500).json({ error: "Failed to check group timer status" })
        }

        // Only start if not already active or if timer has finished
        if (existingGroup && existingGroup.conversation_status === 'active' && existingGroup.conversation_start_time) {
          // Timer already active, return current status
          const remaining = calculateRemainingTime(existingGroup.conversation_start_time, duration)
          return res.status(200).json({ 
            success: true, 
            start_time: existingGroup.conversation_start_time,
            duration: duration,
            remaining_time: remaining,
            status: 'active',
            message: "Timer already active"
          })
        }

        const { error } = await supabase
          .from("match_results")
          .update({
            conversation_start_time: now,
            conversation_duration: duration,
            conversation_status: 'active'
          })
          .eq("match_id", match_id)
          .eq("event_id", effectiveEventId)
          .eq("round", 0)
          .or(`participant_a_number.eq.${assigned_number},participant_b_number.eq.${assigned_number},participant_c_number.eq.${assigned_number},participant_d_number.eq.${assigned_number},participant_e_number.eq.${assigned_number},participant_f_number.eq.${assigned_number}`)

        if (error) {
          console.error("Error starting group timer:", error)
          return res.status(500).json({ error: "Failed to start group timer" })
        }
      } else {
        // Update individual match timer - only if not already active
        const { data: existingMatch, error: checkError } = await supabase
          .from("match_results")
          .select("conversation_status, conversation_start_time, conversation_duration")
          .eq("match_id", match_id)
          .eq("event_id", effectiveEventId)
          .eq("round", round)
          .or(`participant_a_number.eq.${assigned_number},participant_b_number.eq.${assigned_number}`)
          .single()

        if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "not found"
          console.error("Error checking individual timer status:", checkError)
          return res.status(500).json({ error: "Failed to check individual timer status" })
        }

        // Only start if not already active or if timer has finished
        if (existingMatch && existingMatch.conversation_status === 'active' && existingMatch.conversation_start_time) {
          // Timer already active, return current status
          const remaining = calculateRemainingTime(existingMatch.conversation_start_time, existingMatch.conversation_duration || duration)
          return res.status(200).json({ 
            success: true, 
            start_time: existingMatch.conversation_start_time,
            duration: existingMatch.conversation_duration || duration,
            remaining_time: remaining,
            status: 'active',
            message: "Timer already active"
          })
        }

        const { error } = await supabase
          .from("match_results")
          .update({
            conversation_start_time: now,
            conversation_duration: duration,
            conversation_status: 'active'
          })
          .eq("match_id", match_id)
          .eq("event_id", effectiveEventId)
          .eq("round", round)
          .or(`participant_a_number.eq.${assigned_number},participant_b_number.eq.${assigned_number}`)

        if (error) {
          console.error("Error starting individual timer:", error)
          return res.status(500).json({ error: "Failed to start individual timer" })
        }
      }

      return res.status(200).json({ 
        success: true, 
        start_time: now,
        duration: duration,
        remaining_time: duration,
        status: 'active',
        message: "Timer started successfully"
      })

    } else if (action === "get-status") {
      // Get current timer status for a specific round
      if (!round) {
        return res.status(400).json({ error: "Missing round parameter" })
      }

      if (match_type === "محايد" && round === 0) {
        // Get group match timer status
        const { data: groupMatch, error } = await supabase
          .from("match_results")
          .select("conversation_start_time, conversation_duration, conversation_status")
          .eq("match_id", match_id)
          .eq("event_id", effectiveEventId)
          .eq("round", 0)
          .or(`participant_a_number.eq.${assigned_number},participant_b_number.eq.${assigned_number},participant_c_number.eq.${assigned_number},participant_d_number.eq.${assigned_number},participant_e_number.eq.${assigned_number},participant_f_number.eq.${assigned_number}`)
          .single()

        if (error) {
          if (error.code === 'PGRST116') { // Not found
            return res.status(200).json({
              success: true,
              start_time: null,
              duration: null,
              status: 'not_started',
              remaining_time: 0
            })
          }
          console.error("Error getting group timer status:", error)
          return res.status(500).json({ error: "Failed to get group timer status" })
        }

        if (!groupMatch) {
          return res.status(200).json({
            success: true,
            start_time: null,
            duration: null,
            status: 'not_started',
            remaining_time: 0
          })
        }

        const remaining = calculateRemainingTime(groupMatch.conversation_start_time, groupMatch.conversation_duration)
        const status = remaining > 0 && groupMatch.conversation_status === 'active' ? 'active' : 'finished'

        return res.status(200).json({
          success: true,
          start_time: groupMatch.conversation_start_time,
          duration: groupMatch.conversation_duration,
          status: status,
          remaining_time: remaining
        })

      } else {
        // Get individual match timer status
        const { data: match, error } = await supabase
          .from("match_results")
          .select("conversation_start_time, conversation_duration, conversation_status")
          .eq("match_id", match_id)
          .eq("event_id", effectiveEventId)
          .eq("round", round)
          .or(`participant_a_number.eq.${assigned_number},participant_b_number.eq.${assigned_number}`)
          .single()

        if (error) {
          if (error.code === 'PGRST116') { // Not found
            return res.status(200).json({
              success: true,
              start_time: null,
              duration: null,
              status: 'not_started',
              remaining_time: 0
            })
          }
          console.error("Error getting individual timer status:", error)
          return res.status(500).json({ error: "Failed to get individual timer status" })
        }

        if (!match) {
          return res.status(200).json({
            success: true,
            start_time: null,
            duration: null,
            status: 'not_started',
            remaining_time: 0
          })
        }

        const remaining = calculateRemainingTime(match.conversation_start_time, match.conversation_duration)
        const status = remaining > 0 && match.conversation_status === 'active' ? 'active' : 'finished'

        return res.status(200).json({
          success: true,
          start_time: match.conversation_start_time,
          duration: match.conversation_duration,
          status: status,
          remaining_time: remaining
        })
      }

    } else if (action === "finish") {
      // Mark timer as finished for a specific round
      if (!round) {
        return res.status(400).json({ error: "Missing round parameter" })
      }

      if (match_type === "محايد" && round === 0) {
        // Update group match timer status and clear timer data
        const { error } = await supabase
          .from("match_results")
          .update({ 
            conversation_status: 'finished',
            conversation_start_time: null,
            conversation_duration: null
          })
          .eq("match_id", match_id)
          .eq("event_id", effectiveEventId)
          .eq("round", 0)
          .or(`participant_a_number.eq.${assigned_number},participant_b_number.eq.${assigned_number},participant_c_number.eq.${assigned_number},participant_d_number.eq.${assigned_number},participant_e_number.eq.${assigned_number},participant_f_number.eq.${assigned_number}`)

        if (error) {
          console.error("Error finishing group timer:", error)
          return res.status(500).json({ error: "Failed to finish group timer" })
        }
      } else {
        // Update individual match timer status and clear timer data
        const { error } = await supabase
          .from("match_results")
          .update({ 
            conversation_status: 'finished',
            conversation_start_time: null,
            conversation_duration: null
          })
          .eq("match_id", match_id)
          .eq("event_id", effectiveEventId)
          .eq("round", round)
          .or(`participant_a_number.eq.${assigned_number},participant_b_number.eq.${assigned_number}`)

        if (error) {
          console.error("Error finishing individual timer:", error)
          return res.status(500).json({ error: "Failed to finish individual timer" })
        }
      }

      return res.status(200).json({ 
        success: true, 
        message: "Timer finished successfully"
      })

    } else {
      return res.status(400).json({ error: "Invalid action. Use 'start', 'get-status', or 'finish'" })
    }

  } catch (err) {
    console.error("Timer handler error:", err)
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
}

// Helper function to calculate remaining time
function calculateRemainingTime(startTime, duration) {
  if (!startTime || !duration) return 0 // Return 0 if timer is finished or not started
  
  const start = new Date(startTime).getTime()
  const now = Date.now()
  const elapsed = Math.floor((now - start) / 1000)
  const remaining = Math.max(duration - elapsed, 0)
  
  return remaining
}
