// /api/save-participant.mjs (Vercel serverless function)
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

export default async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  try {
    const { assigned_number, summary, survey_data, feedback, round } = req.body
    const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

    if (!req.body?.assigned_number) return res.status(400).json({ error: 'Missing assigned_number' })
    
    // Check for either survey data, summary, or feedback
    if (!survey_data && !summary && !feedback) {
      return res.status(400).json({ error: 'Missing survey data, summary, or feedback' })
    }

    // Handle feedback saving
    if (feedback && round) {
      const {
        compatibilityRate,
        conversationQuality,
        personalConnection,
        sharedInterests,
        comfortLevel,
        communicationStyle,
        wouldMeetAgain,
        overallExperience,
        recommendations
      } = feedback

      // Check if feedback already exists for this participant and round
      const { data: existingFeedback, error: existingFeedbackError } = await supabase
        .from("match_feedback")
        .select("id")
        .eq("match_id", match_id)
        .eq("participant_number", assigned_number)
        .eq("round", round)

      if (existingFeedbackError) {
        console.error("Error checking existing feedback:", existingFeedbackError)
        throw new Error("Database query failed")
      }

      const feedbackData = {
        match_id,
        participant_number: assigned_number,
        round,
        compatibility_rate: compatibilityRate,
        conversation_quality: conversationQuality,
        personal_connection: personalConnection,
        shared_interests: sharedInterests,
        comfort_level: comfortLevel,
        communication_style: communicationStyle,
        would_meet_again: wouldMeetAgain,
        overall_experience: overallExperience,
        recommendations: recommendations || null,
        submitted_at: new Date().toISOString()
      }

      if (existingFeedback && existingFeedback.length > 0) {
        // Update existing feedback
        const { error: updateFeedbackError } = await supabase
          .from("match_feedback")
          .update(feedbackData)
          .eq("match_id", match_id)
          .eq("participant_number", assigned_number)
          .eq("round", round)

        if (updateFeedbackError) {
          console.error("Error updating feedback:", updateFeedbackError)
          throw new Error("Failed to update feedback")
        }
      } else {
        // Insert new feedback
        const { error: insertFeedbackError } = await supabase
          .from("match_feedback")
          .insert([feedbackData])

        if (insertFeedbackError) {
          console.error("Error inserting feedback:", insertFeedbackError)
          throw new Error("Failed to save feedback")
        }
      }

      return res.status(200).json({ 
        success: true, 
        message: "Feedback saved successfully" 
      })
    }

    const { data: existing, error: existingError } = await supabase
      .from("participants")
      .select("id")
      .eq("match_id", match_id)
      .eq("assigned_number", assigned_number)

    if (existingError) throw existingError

    const updateFields = {}

    // Handle survey data (only if present)
    if (survey_data) {
    const answers = req.body.survey_data?.answers || {};
    const redLinesRaw = answers.redLines;
    const redLines = Array.isArray(redLinesRaw)
      ? redLinesRaw
      : typeof redLinesRaw === "string"
        ? redLinesRaw.split(",").map(s => s.trim()).filter(Boolean)
        : [];
    updateFields.survey_data = {
      ...survey_data,
      answers: {
        ...answers,
        redLines,
      },
      }
      
      // Also save MBTI personality type to dedicated column
      if (survey_data.mbtiType) {
        updateFields.mbti_personality_type = survey_data.mbtiType
      }
      
      // Also save attachment style to dedicated column
      if (survey_data.attachmentStyle) {
        updateFields.attachment_style = survey_data.attachmentStyle
      }
      
      // Also save communication style to dedicated column
      if (survey_data.communicationStyle) {
        updateFields.communication_style = survey_data.communicationStyle
      }
      
      // Also save lifestyle preferences to dedicated column
      if (survey_data.lifestylePreferences) {
        updateFields.lifestyle_preferences = survey_data.lifestylePreferences
      }
      
      // Also save core values to dedicated column
      if (survey_data.coreValues) {
        updateFields.core_values = survey_data.coreValues
      }
      
      // Also save vibe description to dedicated column
      if (survey_data.vibeDescription) {
        updateFields.vibe_description = survey_data.vibeDescription
      }
      
      // Also save ideal person description to dedicated column
      if (survey_data.idealPersonDescription) {
        updateFields.ideal_person_description = survey_data.idealPersonDescription
      }
    }

    // Allow saving summary alone or with form data
    if (summary) {
      updateFields.summary = summary
    }

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ error: "No valid fields to save" })
    }

    if (existing && existing.length > 0) {
      // ✅ Update existing
      const { error: updateError } = await supabase
        .from("participants")
        .update(updateFields)
        .eq("match_id", match_id)
        .eq("assigned_number", assigned_number)

      if (updateError) throw updateError
    } else {
      // ✅ Insert new
      const { error: insertError } = await supabase.from("participants").insert([
        {
          assigned_number,
          match_id,
          is_host: false,
          ...updateFields,
        },
      ])
      if (insertError) throw insertError
    }

    return res.status(200).json({ message: "Saved", match_id })
  } catch (err) {
    console.error("Server Error:", err)
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
}
