// /api/save-participant.mjs (Vercel serverless function)
import { createClient } from "@supabase/supabase-js"

// Add better error logging
const logError = (context, error) => {
  console.error(`❌ ${context}:`, {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
    stack: error.stack
  })
}

// Initialize Supabase client with error handling
let supabase
try {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables')
  }
  
  supabase = createClient(supabaseUrl, supabaseKey)
  console.log('✅ Supabase client initialized successfully')
} catch (error) {
  console.error('❌ Failed to initialize Supabase client:', error)
  throw error
}

export default async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  try {
    console.log('📨 Received request:', {
      method: req.method,
      body: req.body,
      headers: req.headers
    })

    const { assigned_number, summary, survey_data, feedback, round } = req.body
    const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

    if (!req.body?.assigned_number) {
      console.error('❌ Missing assigned_number in request body')
      return res.status(400).json({ error: 'Missing assigned_number' })
    }
    
    // Check for either survey data, summary, or feedback
    if (!survey_data && !summary && !feedback) {
      console.error('❌ Missing required data: survey_data, summary, or feedback')
      return res.status(400).json({ error: 'Missing survey data, summary, or feedback' })
    }

    // Handle feedback saving
    if (feedback && round) {
      console.log('📝 Processing feedback for round:', round)
      
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
        logError("Error checking existing feedback", existingFeedbackError)
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
          logError("Error updating feedback", updateFeedbackError)
          throw new Error("Failed to update feedback")
        }
      } else {
        // Insert new feedback
        const { error: insertFeedbackError } = await supabase
          .from("match_feedback")
          .insert([feedbackData])

        if (insertFeedbackError) {
          logError("Error inserting feedback", insertFeedbackError)
          throw new Error("Failed to save feedback")
        }
      }

      console.log('✅ Feedback saved successfully')
      return res.status(200).json({ 
        success: true, 
        message: "Feedback saved successfully" 
      })
    }

    console.log('📝 Processing participant data for assigned_number:', assigned_number)

    const { data: existing, error: existingError } = await supabase
      .from("participants")
      .select("id")
      .eq("match_id", match_id)
      .eq("assigned_number", assigned_number)

    if (existingError) {
      logError("Error checking existing participant", existingError)
      throw existingError
    }

    const updateFields = {}

    // Handle survey data (only if present)
    if (survey_data) {
      console.log('📊 Processing survey data:', survey_data)
      
      const answers = req.body.survey_data?.answers || {};
      const redLinesRaw = answers.redLines;
      const redLines = Array.isArray(redLinesRaw)
        ? redLinesRaw
        : typeof redLinesRaw === "string"
          ? redLinesRaw.split(",").map(s => s.trim()).filter(Boolean)
          : [];
      
      // Prepare survey_data JSONB object according to schema
      updateFields.survey_data = {
        ...survey_data,
        answers: {
          ...answers,
          redLines,
        },
      }

      // Persist personal info to dedicated columns (no longer inside JSON)
      if (typeof survey_data.name === 'string' && survey_data.name.trim()) {
        updateFields.name = survey_data.name.trim()
      }
      if (typeof survey_data.gender === 'string' && survey_data.gender.trim()) {
        updateFields.gender = survey_data.gender.trim()
      }
      if (typeof survey_data.phoneNumber === 'string' && survey_data.phoneNumber.trim()) {
        updateFields.phone_number = survey_data.phoneNumber.trim()
      }
      
      // Save MBTI personality type to dedicated column (4 characters max)
      if (survey_data.mbtiType && survey_data.mbtiType.length === 4) {
        updateFields.mbti_personality_type = survey_data.mbtiType
        console.log('🧠 MBTI Type:', survey_data.mbtiType)
      }
      
      // Save attachment style to dedicated column (must match constraint values)
      if (survey_data.attachmentStyle) {
        const validAttachmentStyles = ['Secure', 'Anxious', 'Avoidant', 'Fearful']
        if (validAttachmentStyles.includes(survey_data.attachmentStyle) || 
            survey_data.attachmentStyle.startsWith('Mixed (')) {
          updateFields.attachment_style = survey_data.attachmentStyle
          console.log('🔒 Attachment Style:', survey_data.attachmentStyle)
        }
      }
      
      // Save communication style to dedicated column (must match constraint values)
      if (survey_data.communicationStyle) {
        const validCommunicationStyles = ['Assertive', 'Passive', 'Aggressive', 'Passive-Aggressive']
        if (validCommunicationStyles.includes(survey_data.communicationStyle)) {
          updateFields.communication_style = survey_data.communicationStyle
          console.log('💬 Communication Style:', survey_data.communicationStyle)
        }
      }
      
      // Note: lifestyle_preferences, core_values, vibe_description, ideal_person_description
      // are not separate columns in the schema - they should be stored in survey_data JSONB
    }

    // Allow saving summary alone or with form data
    if (summary) {
      updateFields.summary = summary
      console.log('📝 Summary:', summary)
    }

    if (Object.keys(updateFields).length === 0) {
      console.error('❌ No valid fields to save')
      return res.status(400).json({ error: "No valid fields to save" })
    }

    console.log('💾 Saving fields:', updateFields)

    if (existing && existing.length > 0) {
      // ✅ Update existing
      console.log('🔄 Updating existing participant')
      const { error: updateError } = await supabase
        .from("participants")
        .update(updateFields)
        .eq("match_id", match_id)
        .eq("assigned_number", assigned_number)

      if (updateError) {
        logError("Update error", updateError)
        throw updateError
      }
    } else {
      // ✅ Insert new
      console.log('➕ Inserting new participant')
      const { error: insertError } = await supabase.from("participants").insert([
        {
          assigned_number,
          match_id,
          is_host: false,
          ...updateFields,
        },
      ])
      if (insertError) {
        logError("Insert error", insertError)
        throw insertError
      }
    }

    console.log('✅ Participant data saved successfully')
    return res.status(200).json({ message: "Saved", match_id })
  } catch (err) {
    logError("Server Error", err)
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
}
