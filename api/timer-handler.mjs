import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  const { action, assigned_number, round, match_type = "individual" } = req.body
  const match_id = "00000000-0000-0000-0000-000000000000"

  if (!action) {
    return res.status(400).json({ error: "Missing action parameter" })
  }

  if (!assigned_number) {
    return res.status(400).json({ error: "Missing assigned_number parameter" })
  }

  try {
    if (action === "start") {
      // Start timer for a specific round
      const { round } = req.body
      if (!round) {
        return res.status(400).json({ error: "Missing round parameter" })
      }

      const now = new Date().toISOString()
      const duration = req.body.duration || 300 // Default 5 minutes

      if (match_type === "group") {
        // Update group match timer
        const { error } = await supabase
          .from("group_matches")
          .update({
            conversation_start_time: now,
            conversation_duration: duration,
            conversation_status: 'active'
          })
          .eq("match_id", match_id)
          .contains("participant_numbers", [assigned_number])

        if (error) {
          console.error("Error starting group timer:", error)
          return res.status(500).json({ error: "Failed to start group timer" })
        }
      } else {
        // Update individual match timer
        const { error } = await supabase
          .from("match_results")
          .update({
            conversation_start_time: now,
            conversation_duration: duration,
            conversation_status: 'active'
          })
          .eq("match_id", match_id)
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
        message: "Timer started successfully"
      })

    } else if (action === "get-status") {
      // Get current timer status for a specific round
      const { round } = req.body
      if (!round) {
        return res.status(400).json({ error: "Missing round parameter" })
      }

      if (match_type === "group") {
        // Get group match timer status
        const { data: groupMatch, error } = await supabase
          .from("group_matches")
          .select("conversation_start_time, conversation_duration, conversation_status")
          .eq("match_id", match_id)
          .contains("participant_numbers", [assigned_number])
          .single()

        if (error) {
          console.error("Error getting group timer status:", error)
          return res.status(500).json({ error: "Failed to get group timer status" })
        }

        if (!groupMatch) {
          return res.status(404).json({ error: "Group match not found" })
        }

        return res.status(200).json({
          success: true,
          start_time: groupMatch.conversation_start_time,
          duration: groupMatch.conversation_duration,
          status: groupMatch.conversation_status,
          remaining_time: calculateRemainingTime(groupMatch.conversation_start_time, groupMatch.conversation_duration)
        })

      } else {
        // Get individual match timer status
        const { data: match, error } = await supabase
          .from("match_results")
          .select("conversation_start_time, conversation_duration, conversation_status")
          .eq("match_id", match_id)
          .eq("round", round)
          .or(`participant_a_number.eq.${assigned_number},participant_b_number.eq.${assigned_number}`)
          .single()

        if (error) {
          console.error("Error getting individual timer status:", error)
          return res.status(500).json({ error: "Failed to get individual timer status" })
        }

        if (!match) {
          return res.status(404).json({ error: "Match not found" })
        }

        return res.status(200).json({
          success: true,
          start_time: match.conversation_start_time,
          duration: match.conversation_duration,
          status: match.conversation_status,
          remaining_time: calculateRemainingTime(match.conversation_start_time, match.conversation_duration)
        })
      }

    } else if (action === "finish") {
      // Mark timer as finished for a specific round
      const { round } = req.body
      if (!round) {
        return res.status(400).json({ error: "Missing round parameter" })
      }

      if (match_type === "group") {
        // Update group match timer status
        const { error } = await supabase
          .from("group_matches")
          .update({ conversation_status: 'finished' })
          .eq("match_id", match_id)
          .contains("participant_numbers", [assigned_number])

        if (error) {
          console.error("Error finishing group timer:", error)
          return res.status(500).json({ error: "Failed to finish group timer" })
        }
      } else {
        // Update individual match timer status
        const { error } = await supabase
          .from("match_results")
          .update({ conversation_status: 'finished' })
          .eq("match_id", match_id)
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
  if (!startTime) return null
  
  const start = new Date(startTime).getTime()
  const now = Date.now()
  const elapsed = Math.floor((now - start) / 1000)
  const remaining = Math.max(duration - elapsed, 0)
  
  return remaining
} 