import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  try {
    const { 
      assigned_number, 
      round, 
      enjoyment, 
      connection, 
      wouldMeetAgain, 
      overallRating 
    } = req.body
    const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

    if (!assigned_number || !round) {
      return res.status(400).json({ error: "assigned_number and round are required" })
    }

    // Save feedback
    const { error: feedbackError } = await supabase
      .from("match_feedback")
      .upsert({
        match_id,
        participant_number: assigned_number,
        round,
        enjoyment,
        connection,
        would_meet_again: wouldMeetAgain,
        overall_rating: overallRating,
        submitted_at: new Date().toISOString()
      }, { onConflict: "match_id,participant_number,round" })

    if (feedbackError) throw feedbackError

    // Mark the match as completed for this participant
    const { error: completionError } = await supabase
      .from("match_completions")
      .upsert({
        match_id,
        participant_number: assigned_number,
        round,
        completed_at: new Date().toISOString()
      }, { onConflict: "match_id,participant_number,round" })

    if (completionError) throw completionError

    return res.status(200).json({ 
      message: "Feedback saved successfully",
      completed: true
    })
  } catch (err) {
    console.error("Feedback save error:", err)
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
} 