import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

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

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  if (!req.body?.action) return res.status(400).json({ error: 'Missing action' })

  const { action } = req.body

  // TOKEN HANDLER ACTIONS
  if (action === "create-token") {
    // Check if registration is enabled
    try {
      const { data: eventState, error: eventError } = await supabase
        .from("event_state")
        .select("registration_enabled")
        .eq("match_id", "00000000-0000-0000-0000-000000000000")
        .single()

      // If registration is disabled, return error
      if (eventState && eventState.registration_enabled === false) {
        return res.status(403).json({ 
          error: "Registration is currently closed",
          message: "التسجيل مغلق حالياً - التوافق بدأ بالفعل"
        })
      }

      // If no event_state record exists, allow registration (default behavior)
      if (eventError && eventError.code !== 'PGRST116') {
        console.error("Error checking registration status:", eventError)
        // Continue with registration if we can't check status
      }
    } catch (err) {
      console.error("Error checking registration enabled:", err)
      // Continue with registration if we can't check status
    }

    // Auto-assign the next available number
    try {
      // Get the highest assigned number
      const { data: existingParticipants, error: fetchError } = await supabase
        .from("participants")
        .select("assigned_number")
        .eq("match_id", "00000000-0000-0000-0000-000000000000")
        .neq("assigned_number", 9999)  // Exclude organizer participant
        .order("assigned_number", { ascending: false })
        .limit(1)

      if (fetchError) {
        console.error("Fetch Error:", fetchError)
        return res.status(500).json({ error: "Database fetch failed" })
      }

      // Calculate next number (start from 1 if no participants exist)
      let nextNumber = existingParticipants && existingParticipants.length > 0 
        ? existingParticipants[0].assigned_number + 1 
        : 1
      
      // Skip 9999 as it's reserved for organizer
      if (nextNumber === 9999) {
        nextNumber = 10000;
      }

      // Check if this number already exists (race condition protection)
      const { data: existing, error: checkError } = await supabase
        .from("participants")
        .select("secure_token")
        .eq("assigned_number", nextNumber)
        .eq("match_id", "00000000-0000-0000-0000-000000000000")
        .single()

      if (existing) {
        // Number already exists, return existing token
        return res.status(200).json({ 
          secure_token: existing.secure_token,
          assigned_number: nextNumber,
          is_new: false
        })
      }

      if (checkError && checkError.code !== "PGRST116") {
        console.error("Check Token Error:", checkError)
        return res.status(500).json({ error: "Database check failed" })
      }

      // Get current event ID for new participants
      let currentEventId = 1 // Default to event 1
      try {
        const { data: eventState, error: eventError } = await supabase
          .from("event_state")
          .select("current_event_id")
          .eq("match_id", "00000000-0000-0000-0000-000000000000")
          .single()

        if (!eventError && eventState?.current_event_id) {
          currentEventId = eventState.current_event_id
        } else {
          // If no current event ID is set, determine it based on existing participants
          const { data: maxEventData, error: maxEventError } = await supabase
            .from("participants")
            .select("event_id")
            .order("event_id", { ascending: false })
            .limit(1)
            .single()

          if (!maxEventError && maxEventData?.event_id) {
            currentEventId = maxEventData.event_id
          }
        }
      } catch (err) {
        console.log("Using default event_id = 1 due to error:", err.message)
      }

      console.log(`Creating new participant with event_id: ${currentEventId}`)

      // Create new participant with auto-assigned number and current event_id
      const { data, error } = await supabase
        .from("participants")
        .insert([
          {
            assigned_number: nextNumber,
            match_id: "00000000-0000-0000-0000-000000000000",
            event_id: currentEventId,
          },
        ])
        .select("secure_token, assigned_number, event_id")
        .single()

      if (error) {
        console.error("Create Token Error:", error)
        return res.status(500).json({ error: "Database insert failed" })
      }

      return res.status(200).json({ 
        secure_token: data.secure_token,
        assigned_number: data.assigned_number,
        event_id: data.event_id,
        is_new: true
      })
    } catch (error) {
      console.error("Unexpected error:", error)
      return res.status(500).json({ error: "Unexpected error occurred" })
    }
  }

  if (action === "resolve-token") {
    console.log("[API] Action: resolve-token started for token:", req.body.secure_token);
    if (!req.body.secure_token) {
      console.log("[API] Error: Missing secure_token");
      return res.status(400).json({ error: 'Missing secure_token' });
    }
    const { data, error } = await supabase
      .from("participants")
      .select("assigned_number, survey_data, summary")
      .eq("secure_token", req.body.secure_token)
      .single();

    console.log("[API] Participant query result:", { data, error });

    if (error || !data) {
      console.log("[API] Error: Participant not found or DB error.");
      return res.status(404).json({ error: 'Participant not found' });
    }

    // Fetch participant history if they exist
    let history = []
    if (data.assigned_number) {
      console.log(`[API] Fetching history for participant #${data.assigned_number}`);
      try {
        const { data: matches, error: matchError } = await supabase
          .from("match_results")
          .select(`
            *,
            participant_a:participants!match_results_participant_a_id_fkey(name, age, phone_number),
            participant_b:participants!match_results_participant_b_id_fkey(name, age, phone_number)
          `)
          .eq("match_id", "00000000-0000-0000-0000-000000000000")
          .or(`participant_a_number.eq.${data.assigned_number},participant_b_number.eq.${data.assigned_number}`)
          .order("created_at", { ascending: false });

        console.log("[API] History query result:", { matches, matchError });

        if (!matchError && matches) {
          history = matches.map(match => {
            // Determine which participant is the partner
            const isParticipantA = match.participant_a_number === data.assigned_number
            const partnerNumber = isParticipantA ? match.participant_b_number : match.participant_a_number
            const partnerInfo = isParticipantA ? match.participant_b : match.participant_a
            const wantsMatch = isParticipantA ? match.participant_a_wants_match : match.participant_b_wants_match
            const partnerWantsMatch = isParticipantA ? match.participant_b_wants_match : match.participant_a_wants_match
            
            return {
              with: partnerNumber,
              partner_name: partnerInfo?.name || `لاعب رقم ${partnerNumber}`,
              partner_age: partnerInfo?.age || null,
              partner_phone: partnerInfo?.phone_number || null,
              type: match.match_type || "غير محدد",
              reason: match.reason || "السبب غير متوفر",
              round: match.round || 1,
              table_number: match.table_number,
              score: match.compatibility_score || 0,
              is_repeat_match: match.is_repeat_match || false,
              mutual_match: match.mutual_match || false,
              wants_match: wantsMatch,
              partner_wants_match: partnerWantsMatch,
              created_at: match.created_at
            }
          })
        }
      } catch (historyError) {
        console.error("[API] CRITICAL: Error fetching participant history:", historyError)
        // Don't fail the request if history fetch fails
      }
    }

    console.log("[API] Successfully resolved token. Sending response.");
    return res.status(200).json({
      success: true,
      assigned_number: data.assigned_number,
      survey_data: data.survey_data,
      summary: data.summary,
      history: history
    })
  }

  // MATCH PREFERENCE ACTION
  if (action === "match-preference") {
    try {
      const { assigned_number, partner_number, wants_match, round = 1 } = req.body
      const match_id = "00000000-0000-0000-0000-000000000000"

      if (!assigned_number || !partner_number) {
        return res.status(400).json({ error: "Missing assigned_number or partner_number" })
      }

      if (typeof wants_match !== 'boolean') {
        return res.status(400).json({ error: "wants_match must be a boolean" })
      }

      // Find the match result for this pair
      const { data: matchResults, error: findError } = await supabase
        .from("match_results")
        .select("*")
        .eq("match_id", match_id)
        .eq("round", round)
        .or(`and(participant_a_number.eq.${assigned_number},participant_b_number.eq.${partner_number}),and(participant_a_number.eq.${partner_number},participant_b_number.eq.${assigned_number})`)

      if (findError) {
        console.error("Error finding match result:", findError)
        return res.status(500).json({ error: "Failed to find match result" })
      }

      if (!matchResults || matchResults.length === 0) {
        return res.status(404).json({ error: "Match result not found" })
      }

      const matchResult = matchResults[0]
      
      // Determine which participant is making the preference
      const isParticipantA = matchResult.participant_a_number === assigned_number
      const updateField = isParticipantA ? 'participant_a_wants_match' : 'participant_b_wants_match'
      const partnerField = isParticipantA ? 'participant_b_wants_match' : 'participant_a_wants_match'
      
      // Update the match preference
      const updateData = {
        [updateField]: wants_match
      }
      
      // Check if both participants want to match to set mutual_match
      const partnerWantsMatch = matchResult[partnerField]
      if (partnerWantsMatch !== null) {
        updateData.mutual_match = wants_match && partnerWantsMatch
      }

      const { error: updateError } = await supabase
        .from("match_results")
        .update(updateData)
        .eq("id", matchResult.id)

      if (updateError) {
        console.error("Error updating match preference:", updateError)
        return res.status(500).json({ error: "Failed to update match preference" })
      }

      // If both participants want to match, fetch partner information
      let partnerInfo = null
      if (updateData.mutual_match) {
        const { data: partnerData, error: partnerError } = await supabase
          .from("participants")
          .select("name, age, phone_number")
          .eq("assigned_number", partner_number)
          .eq("match_id", match_id)
          .single()

        if (!partnerError && partnerData) {
          partnerInfo = {
            name: partnerData.name,
            age: partnerData.age,
            phone_number: partnerData.phone_number
          }
        }
      }

      return res.status(200).json({
        success: true,
        mutual_match: updateData.mutual_match || false,
        partner_info: partnerInfo
      })

    } catch (error) {
      console.error("Unexpected error in match-preference:", error)
      return res.status(500).json({ error: "Unexpected error occurred" })
    }
  }

  // SAVE PARTICIPANT ACTION
  if (action === "save-participant") {
    try {
      console.log('📨 Received save-participant request:', {
        method: req.method,
        body: req.body,
        headers: req.headers
      })

      const { assigned_number, summary, survey_data, feedback, round, secure_token, event_id } = req.body
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
        console.log('📝 Processing feedback for round:', round, 'event_id:', event_id)
        
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

        // Check if feedback already exists for this participant, round, and event
        const { data: existingFeedback, error: existingFeedbackError } = await supabase
          .from("match_feedback")
          .select("id")
          .eq("match_id", match_id)
          .eq("participant_number", assigned_number)
          .eq("round", round)
          .eq("event_id", event_id || 1)

        if (existingFeedbackError) {
          logError("Error checking existing feedback", existingFeedbackError)
          throw new Error("Database query failed")
        }

        const feedbackData = {
          match_id,
          participant_number: assigned_number,
          participant_token: secure_token || null,
          round,
          event_id: event_id || 1,
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
            .eq("event_id", event_id || 1)

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

        // Persist personal info to dedicated columns (extracted from answers)
        if (typeof survey_data.name === 'string' && survey_data.name.trim()) {
          updateFields.name = survey_data.name.trim()
        } else if (typeof answers.name === 'string' && answers.name.trim()) {
          updateFields.name = answers.name.trim()
        }
        
        // Handle age from answers (comes as string from form)
        const ageValue = survey_data.age || answers.age
        if (ageValue) {
          const ageNum = typeof ageValue === 'number' ? ageValue : parseInt(ageValue)
          if (!isNaN(ageNum) && ageNum >= 18 && ageNum <= 65) {
            updateFields.age = ageNum
            console.log('🎂 Age:', ageNum)
          }
        }
        
        if (typeof survey_data.gender === 'string' && survey_data.gender.trim()) {
          updateFields.gender = survey_data.gender.trim()
        } else if (typeof answers.gender === 'string' && answers.gender.trim()) {
          updateFields.gender = answers.gender.trim()
        }
        
        if (typeof survey_data.phoneNumber === 'string' && survey_data.phoneNumber.trim()) {
          updateFields.phone_number = survey_data.phoneNumber.trim()
        } else if (typeof answers.phone_number === 'string' && answers.phone_number.trim()) {
          updateFields.phone_number = answers.phone_number.trim()
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
        
        // Handle gender preferences from new structure
        const genderPref = answers.gender_preference || answers.same_gender_preference
        if (Array.isArray(genderPref)) {
          // New structure: check for specific values
          updateFields.same_gender_preference = genderPref.includes('same_gender') || genderPref.includes('yes')
          updateFields.any_gender_preference = genderPref.includes('any_gender')
          console.log('👥 Same Gender Preference:', updateFields.same_gender_preference)
          console.log('🌐 Any Gender Preference:', updateFields.any_gender_preference)
        } else {
          // Default to false if not provided (opposite gender matching)
          updateFields.same_gender_preference = false
          updateFields.any_gender_preference = false
          console.log('👥 Gender Preferences (default): opposite gender matching')
        }
        
        // Save interaction style preferences to dedicated columns
        const humorBanterStyle = answers.humor_banter_style
        if (humorBanterStyle && ['A', 'B', 'C', 'D'].includes(humorBanterStyle)) {
          updateFields.humor_banter_style = humorBanterStyle
          console.log('😄 Humor/Banter Style:', humorBanterStyle)
        }
        
        const earlyOpennessComfort = answers.early_openness_comfort
        if (earlyOpennessComfort !== undefined) {
          const comfortLevel = parseInt(earlyOpennessComfort)
          if (!isNaN(comfortLevel) && [0, 1, 2, 3].includes(comfortLevel)) {
            updateFields.early_openness_comfort = comfortLevel
            console.log('🤝 Early Openness Comfort:', comfortLevel)
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

  // GET MATCH RESULTS BY TOKEN ACTION
  if (action === "get-match-results") {
    console.log("[API] Action: get-match-results started for token:", req.body.secure_token);
    if (!req.body.secure_token) {
      console.log("[API] Error: Missing secure_token");
      return res.status(400).json({ error: 'Missing secure_token' });
    }
    
    try {
      // First, resolve the token to get participant info including their match_id and event_id
      const { data: participant, error: participantError } = await supabase
        .from("participants")
        .select("assigned_number, match_id, event_id")
        .eq("secure_token", req.body.secure_token)
        .single();

      console.log("[API] Participant query result:", { participant, participantError });

      if (participantError || !participant) {
        console.log("[API] Error: Participant not found or DB error.");
        return res.status(404).json({ 
          success: false, 
          error: 'المشارك غير موجود أو الرمز غير صحيح' 
        });
      }

      // Fetch ALL match results for this participant number across ALL events
      console.log(`[API] Fetching ALL match results for participant #${participant.assigned_number} across all events`);
      const { data: matches, error: matchError } = await supabase
        .from("match_results")
        .select("*")
        .or(`participant_a_number.eq.${participant.assigned_number},participant_b_number.eq.${participant.assigned_number}`)
        .order("event_id", { ascending: false })
        .order("created_at", { ascending: false });

      console.log("[API] Match results query result:", { matches, matchError });

      if (matchError) {
        console.error("[API] Error fetching match results:", matchError);
        return res.status(500).json({ 
          success: false, 
          error: 'حدث خطأ أثناء جلب نتائج المطابقة' 
        });
      }

      // Format the match results and fetch partner information
      const history = await Promise.all((matches || []).map(async (match) => {
        // Determine which participant is the partner
        const isParticipantA = match.participant_a_number === participant.assigned_number
        const partnerNumber = isParticipantA ? match.participant_b_number : match.participant_a_number
        const wantsMatch = isParticipantA ? match.participant_a_wants_match : match.participant_b_wants_match
        const partnerWantsMatch = isParticipantA ? match.participant_b_wants_match : match.participant_a_wants_match
        
        // Fetch partner information from the same match_id
        let partnerInfo = null
        if (partnerNumber && partnerNumber !== 9999) {
          try {
            const { data: partnerData, error: partnerError } = await supabase
              .from("participants")
              .select("name, age, phone_number, event_id")
              .eq("assigned_number", partnerNumber)
              .eq("match_id", match.match_id)  // Use the match's match_id to get partner from correct match
              .single()
            
            if (!partnerError && partnerData) {
              partnerInfo = partnerData
            }
          } catch (err) {
            console.log(`[API] Could not fetch partner info for #${partnerNumber}:`, err)
          }
        }
        
        // Calculate mutual match based on current wants_match values
        const isMutualMatch = wantsMatch === true && partnerWantsMatch === true
        
        console.log(`[API] Match with #${partnerNumber}: wantsMatch=${wantsMatch}, partnerWantsMatch=${partnerWantsMatch}, isMutualMatch=${isMutualMatch}`)
        
        return {
          with: partnerNumber === 9999 ? "المنظم" : partnerNumber,
          partner_name: partnerNumber === 9999 ? "المنظم" : (partnerInfo?.name || `لاعب رقم ${partnerNumber}`),
          partner_age: partnerInfo?.age || null,
          partner_phone: partnerInfo?.phone_number || null,
          partner_event_id: partnerInfo?.event_id || null,
          type: match.match_type || "غير محدد",
          reason: match.reason || "السبب غير متوفر",
          round: match.round || 1,
          table_number: match.table_number,
          score: match.compatibility_score || 0,
          is_repeat_match: match.is_repeat_match || false,
          mutual_match: isMutualMatch,
          wants_match: wantsMatch,
          partner_wants_match: partnerWantsMatch,
          created_at: match.created_at,
          ai_personality_analysis: match.ai_personality_analysis || null,
          event_id: match.event_id
        }
      }));

      console.log("[API] Successfully fetched match results. Sending response.");
      return res.status(200).json({
        success: true,
        assigned_number: participant.assigned_number,
        event_id: participant.event_id,
        history: history
      });

    } catch (error) {
      console.error("[API] Unexpected error in get-match-results:", error);
      return res.status(500).json({ 
        success: false, 
        error: 'حدث خطأ غير متوقع' 
      });
    }
  }

  // CHECK FEEDBACK SUBMITTED ACTION
  if (action === "check-feedback-submitted") {
    try {
      const { secure_token, round, event_id } = req.body
      const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

      if (!secure_token || !round || !event_id) {
        return res.status(400).json({ error: 'Missing required parameters' })
      }

      // Check if feedback exists for this token, round, and event
      const { data: feedbackData, error: feedbackError } = await supabase
        .from("match_feedback")
        .select("id")
        .eq("match_id", match_id)
        .eq("participant_token", secure_token)
        .eq("round", round)
        .eq("event_id", event_id)

      if (feedbackError) {
        console.error("Error checking feedback:", feedbackError)
        return res.status(500).json({ error: "Database error" })
      }

      // REMOVED AUTOMATIC LOGIC: Event finished status is now ONLY controlled by manual admin toggle
      // No longer automatically marking events as finished based on current_event_id
      
      // Check the event_finished flag in match_results
      const { data: matchData, error: matchError } = await supabase
        .from("match_results")
        .select("event_finished")
        .eq("event_id", event_id)
        .eq("round", round)
        .limit(1)
        .single()

      if (matchError && matchError.code !== 'PGRST116') {
        console.error("Error checking event status:", matchError)
        return res.status(500).json({ error: "Database error" })
      }

      const eventFinished = matchData?.event_finished === true
      
      const feedbackSubmitted = feedbackData && feedbackData.length > 0

      return res.status(200).json({
        success: true,
        event_finished: eventFinished,
        feedback_submitted: feedbackSubmitted
      })
    } catch (error) {
      console.error("Error checking feedback status:", error)
      return res.status(500).json({ error: "Failed to check feedback status" })
    }
  }

  // PHONE LOOKUP FOR RETURNING PARTICIPANTS
  if (action === "phone-lookup-signup") {
    const { phone_number, gender_preference, humor_banter_style, early_openness_comfort } = req.body

    if (!phone_number) {
      return res.status(400).json({ error: "Phone number is required" })
    }

    try {
      // Normalize phone number - extract last 6 digits
      const normalizedPhone = phone_number.replace(/\D/g, '') // Remove all non-digits
      if (normalizedPhone.length < 6) {
        return res.status(400).json({ error: "رقم الهاتف قصير جداً" })
      }
      
      const lastSixDigits = normalizedPhone.slice(-6) // Get last 6 digits
      console.log(`🔍 Looking up phone ending with: ${lastSixDigits}`)

      // Search for participants with phone numbers ending with these 6 digits
      // Look in ALL events (including current) to find previous participants
      const { data: participants, error: searchError } = await supabase
        .from("participants")
        .select("id, assigned_number, name, phone_number, survey_data, signup_for_next_event, match_id")
        .not("phone_number", "is", null)
        .order("created_at", { ascending: false }) // Get most recent first

      if (searchError) {
        console.error("Search Error:", searchError)
        return res.status(500).json({ error: "Database search failed" })
      }

      console.log(`📊 Found ${participants.length} total participants with phone numbers`)
      
      // Filter participants whose phone ends with the same 6 digits
      const matchingParticipants = participants.filter(participant => {
        if (!participant.phone_number) return false
        const participantPhone = participant.phone_number.replace(/\D/g, '')
        const participantLastSix = participantPhone.slice(-6)
        console.log(`🔍 Checking participant #${participant.assigned_number}: ${participantPhone} (last 6: ${participantLastSix})`)
        return participantLastSix === lastSixDigits
      })

      console.log(`🎯 Found ${matchingParticipants.length} matching participants`)

      if (matchingParticipants.length === 0) {
        return res.status(404).json({ 
          error: "لم يتم العثور على مشارك بهذا الرقم",
          message: `تأكد من الرقم أو قم بالتسجيل كمشارك جديد. البحث عن: ${lastSixDigits}`,
          debug: {
            searchedDigits: lastSixDigits,
            totalParticipants: participants.length,
            participantsWithPhones: participants.filter(p => p.phone_number).length
          }
        })
      }

      if (matchingParticipants.length > 1) {
        return res.status(400).json({ 
          error: "تم العثور على أكثر من مشارك بنفس الرقم",
          message: "يرجى التواصل مع المنظم"
        })
      }

      const participant = matchingParticipants[0]
      
      // Check if already signed up for next event
      if (participant.signup_for_next_event) {
        return res.status(400).json({ 
          error: "أنت مسجل بالفعل للحدث القادم",
          message: "سيتم التواصل معك قريباً"
        })
      }

      // Prepare update data
      const updateData = {
        signup_for_next_event: true,
        next_event_signup_timestamp: new Date().toISOString()
      }

      // Handle gender preference update if provided
      if (gender_preference) {
        if (gender_preference === "same_gender") {
          updateData.same_gender_preference = true
          updateData.any_gender_preference = false
          console.log('👥 Updated gender preference: same gender only')
        } else if (gender_preference === "any_gender") {
          updateData.same_gender_preference = false
          updateData.any_gender_preference = true
          console.log('🌐 Updated gender preference: any gender')
        } else {
          // Default or empty - opposite gender
          updateData.same_gender_preference = false
          updateData.any_gender_preference = false
          console.log('👫 Updated gender preference: opposite gender (default)')
        }
      }

      // Handle interaction style updates if provided
      if (humor_banter_style && ['A', 'B', 'C', 'D'].includes(humor_banter_style)) {
        updateData.humor_banter_style = humor_banter_style
        console.log('😄 Updated humor/banter style:', humor_banter_style)
      }

      if (early_openness_comfort !== undefined) {
        const comfortLevel = parseInt(early_openness_comfort)
        if (!isNaN(comfortLevel) && [0, 1, 2, 3].includes(comfortLevel)) {
          updateData.early_openness_comfort = comfortLevel
          console.log('🤝 Updated early openness comfort:', comfortLevel)
        }
      }

      // Update participant to sign up for next event
      const { error: updateError } = await supabase
        .from("participants")
        .update(updateData)
        .eq("id", participant.id)

      if (updateError) {
        console.error("Update Error:", updateError)
        return res.status(500).json({ error: "Failed to register for next event" })
      }

      console.log(`✅ Participant ${participant.assigned_number} (${participant.name}) signed up for next event`)

      return res.status(200).json({
        success: true,
        message: "تم تسجيلك للحدث القادم بنجاح!",
        participant_name: participant.name,
        participant_number: participant.assigned_number
      })

    } catch (error) {
      console.error("Error in phone-lookup-signup:", error)
      return res.status(500).json({ error: "حدث خطأ أثناء التسجيل للحدث القادم" })
    }
  }

  // CHECK NEXT EVENT SIGNUP STATUS ACTION
  if (action === "check-next-event-signup") {
    try {
      const { secure_token } = req.body
      
      if (!secure_token) {
        return res.status(400).json({ error: "Missing secure_token" })
      }

      // Get participant data by token
      const { data: participant, error: participantError } = await supabase
        .from("participants")
        .select("id, assigned_number, name, phone_number, signup_for_next_event")
        .eq("secure_token", secure_token)
        .single()

      if (participantError || !participant) {
        console.error("Participant lookup error:", participantError)
        return res.status(404).json({ error: "Participant not found" })
      }

      return res.status(200).json({
        success: true,
        participant: {
          assigned_number: participant.assigned_number,
          name: participant.name,
          phone_number: participant.phone_number,
          signup_for_next_event: participant.signup_for_next_event
        }
      })

    } catch (error) {
      console.error("Error checking next event signup:", error)
      return res.status(500).json({ error: "حدث خطأ أثناء فحص حالة التسجيل" })
    }
  }

  // AUTO SIGNUP FOR NEXT EVENT ACTION (for logged in users)
  if (action === "auto-signup-next-event") {
    try {
      const { secure_token, gender_preference, humor_banter_style, early_openness_comfort } = req.body
      
      if (!secure_token) {
        return res.status(400).json({ error: "Missing secure_token" })
      }

      // Get participant data by token
      const { data: participant, error: participantError } = await supabase
        .from("participants")
        .select("id, assigned_number, name, phone_number, signup_for_next_event")
        .eq("secure_token", secure_token)
        .single()

      if (participantError || !participant) {
        console.error("Participant lookup error:", participantError)
        return res.status(404).json({ error: "Participant not found" })
      }

      // Check if already signed up for next event
      if (participant.signup_for_next_event) {
        return res.status(400).json({ 
          error: "أنت مسجل بالفعل للحدث القادم",
          message: "سيتم التواصل معك قريباً"
        })
      }

      // Prepare update data
      const updateData = {
        signup_for_next_event: true,
        next_event_signup_timestamp: new Date().toISOString()
      }

      // Handle gender preference update if provided
      if (gender_preference) {
        if (gender_preference === "same_gender") {
          updateData.same_gender_preference = true
          updateData.any_gender_preference = false
          console.log('👥 Updated gender preference: same gender only')
        } else if (gender_preference === "any_gender") {
          updateData.same_gender_preference = false
          updateData.any_gender_preference = true
          console.log('🌐 Updated gender preference: any gender')
        } else {
          // Default or empty - opposite gender
          updateData.same_gender_preference = false
          updateData.any_gender_preference = false
          console.log('👫 Updated gender preference: opposite gender (default)')
        }
      }

      // Handle interaction style updates if provided
      if (humor_banter_style && ['A', 'B', 'C', 'D'].includes(humor_banter_style)) {
        updateData.humor_banter_style = humor_banter_style
        console.log('😄 Updated humor/banter style:', humor_banter_style)
      }

      if (early_openness_comfort !== undefined) {
        const comfortLevel = parseInt(early_openness_comfort)
        if (!isNaN(comfortLevel) && [0, 1, 2, 3].includes(comfortLevel)) {
          updateData.early_openness_comfort = comfortLevel
          console.log('🤝 Updated early openness comfort:', comfortLevel)
        }
      }

      // Update participant to sign up for next event
      const { error: updateError } = await supabase
        .from("participants")
        .update(updateData)
        .eq("id", participant.id)

      if (updateError) {
        console.error("Update Error:", updateError)
        return res.status(500).json({ error: "Failed to register for next event" })
      }

      console.log(`✅ Auto-signup: Participant ${participant.assigned_number} (${participant.name}) signed up for next event`)

      return res.status(200).json({
        success: true,
        message: "تم تسجيلك للحدث القادم بنجاح!",
        participant_name: participant.name,
        participant_number: participant.assigned_number
      })

    } catch (error) {
      console.error("Error in auto-signup-next-event:", error)
      return res.status(500).json({ error: "حدث خطأ أثناء التسجيل للحدث القادم" })
    }
  }

  // GENERATE AI VIBE ANALYSIS ACTION
  if (action === "generate-vibe-analysis") {
    try {
      const { secure_token, partner_number, current_round, event_id } = req.body
      const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"
      
      if (!secure_token || !partner_number || !event_id) {
        return res.status(400).json({ error: "Missing secure_token, partner_number, or event_id" })
      }

      // Get current participant data
      const { data: participant, error: participantError } = await supabase
        .from("participants")
        .select("assigned_number, survey_data")
        .eq("secure_token", secure_token)
        .eq("match_id", match_id)
        .single()

      if (participantError || !participant) {
        console.error("Participant lookup error:", participantError)
        return res.status(404).json({ error: "Participant not found" })
      }

      // Check if analysis already exists in match_results (shared between both participants)
      // Query for the match record where this participant is either participant_a or participant_b
      const { data: existingMatch, error: matchLookupError } = await supabase
        .from("match_results")
        .select("ai_personality_analysis, participant_a_number, participant_b_number")
        .eq("match_id", match_id)
        .eq("event_id", event_id)
        .or(`and(participant_a_number.eq.${participant.assigned_number},participant_b_number.eq.${partner_number}),and(participant_a_number.eq.${partner_number},participant_b_number.eq.${participant.assigned_number})`)
        .single()

      if (matchLookupError && matchLookupError.code !== 'PGRST116') {
        console.error("Match lookup error:", matchLookupError)
        return res.status(500).json({ error: "Failed to lookup match record" })
      }

      // If analysis already exists in the match record, return it
      if (existingMatch?.ai_personality_analysis) {
        console.log(`🔄 Returning existing AI analysis from match_results for participants ${participant.assigned_number} ↔ ${partner_number}`)
        return res.status(200).json({
          success: true,
          analysis: existingMatch.ai_personality_analysis,
          cached: true
        })
      }

      if (!existingMatch) {
        console.error("Match record not found for participants", participant.assigned_number, "and", partner_number)
        return res.status(404).json({ error: "Match record not found" })
      }

      // Get partner data
      const { data: partner, error: partnerError } = await supabase
        .from("participants")
        .select("assigned_number, survey_data")
        .eq("assigned_number", partner_number)
        .eq("match_id", match_id)
        .single()

      if (partnerError || !partner) {
        console.error("Partner lookup error:", partnerError)
        return res.status(404).json({ error: "Partner not found" })
      }

      // Extract and process names
      const extractFirstName = (fullName) => {
        if (!fullName) return null
        // Remove extra spaces and split by space
        const nameParts = fullName.trim().split(/\s+/)
        // Return only first name (first part)
        return nameParts[0]
      }

      const participantFullName = participant.survey_data?.name || `المشارك ${participant.assigned_number}`
      const partnerFullName = partner.survey_data?.name || `المشارك ${partner.assigned_number}`
      
      const participantName = extractFirstName(participantFullName) || participantFullName
      const partnerName = extractFirstName(partnerFullName) || partnerFullName

      // Extract vibe data from both participants
      const participantVibes = {
        weekend: participant.survey_data?.vibe_1 || '',
        hobbies: participant.survey_data?.vibe_2 || '',
        music: participant.survey_data?.vibe_3 || '',
        conversations: participant.survey_data?.vibe_4 || '',
        friendsDescribe: participant.survey_data?.vibe_5 || '',
        describesFriends: participant.survey_data?.vibe_6 || ''
      }

      const partnerVibes = {
        weekend: partner.survey_data?.vibe_1 || '',
        hobbies: partner.survey_data?.vibe_2 || '',
        music: partner.survey_data?.vibe_3 || '',
        conversations: partner.survey_data?.vibe_4 || '',
        friendsDescribe: partner.survey_data?.vibe_5 || '',
        describesFriends: partner.survey_data?.vibe_6 || ''
      }

      // Extract lifestyle data
      const participantLifestyle = {
        lifestyle_1: participant.survey_data?.answers?.lifestyle_1 || participant.survey_data?.lifestyle_1 || '',
        lifestyle_2: participant.survey_data?.answers?.lifestyle_2 || participant.survey_data?.lifestyle_2 || '',
        lifestyle_3: participant.survey_data?.answers?.lifestyle_3 || participant.survey_data?.lifestyle_3 || '',
        lifestyle_4: participant.survey_data?.answers?.lifestyle_4 || participant.survey_data?.lifestyle_4 || '',
        lifestyle_5: participant.survey_data?.answers?.lifestyle_5 || participant.survey_data?.lifestyle_5 || ''
      }

      const partnerLifestyle = {
        lifestyle_1: partner.survey_data?.answers?.lifestyle_1 || partner.survey_data?.lifestyle_1 || '',
        lifestyle_2: partner.survey_data?.answers?.lifestyle_2 || partner.survey_data?.lifestyle_2 || '',
        lifestyle_3: partner.survey_data?.answers?.lifestyle_3 || partner.survey_data?.lifestyle_3 || '',
        lifestyle_4: partner.survey_data?.answers?.lifestyle_4 || partner.survey_data?.lifestyle_4 || '',
        lifestyle_5: partner.survey_data?.answers?.lifestyle_5 || partner.survey_data?.lifestyle_5 || ''
      }

      // Create AI prompt for personalized analysis
      const prompt = `أنت خبير توافق شخصي متخصص في الثقافة السعودية. اكتب تحليلاً دافئاً وطبيعياً عن التوافق بين شخصين في سياق التعارف والصداقة (ليس رومانسياً).

السياق: هذا تحليل لتوافق شخصين التقيا في فعالية ترابط فكري بهدف بناء صداقات وعلاقات اجتماعية صحية قائمة على التوافق الفكري والاهتمامات المشتركة.

معلومات الشخص الأول (${participantName}):
عطلة نهاية الأسبوع: ${participantVibes.weekend}
الهوايات: ${participantVibes.hobbies}
الموسيقى: ${participantVibes.music}
المحادثات: ${participantVibes.conversations}
وصف الأصدقاء: ${participantVibes.friendsDescribe}
الطاقة اليومية: ${participantLifestyle.lifestyle_1}
التواصل: ${participantLifestyle.lifestyle_2}
التخطيط: ${participantLifestyle.lifestyle_4}

معلومات الشخص الثاني (${partnerName}):
عطلة نهاية الأسبوع: ${partnerVibes.weekend}
الهوايات: ${partnerVibes.hobbies}
الموسيقى: ${partnerVibes.music}
المحادثات: ${partnerVibes.conversations}
وصف الأصدقاء: ${partnerVibes.friendsDescribe}
الطاقة اليومية: ${partnerLifestyle.lifestyle_1}
التواصل: ${partnerLifestyle.lifestyle_2}
التخطيط: ${partnerLifestyle.lifestyle_4}

اكتب تحليلاً بالعربية (180-220 كلمة) بأسلوب سردي طبيعي ومتدفق، كأنك تحكي قصة توافقهم كأصدقاء محتملين لصديق. لا تستخدم نقاط أو قوائم.

ابدأ بمقدمة دافئة تذكر اسميهما وتشير للتوافق بينهما كأصدقاء أو معارف اجتماعيين. ثم تحدث بشكل طبيعي عن الاهتمامات المشتركة التي تجمعهم، وكيف أن نمط حياتهم متناغم. اذكر تفاصيل محددة من إجاباتهم لتجعل التحليل شخصياً وحقيقياً.

وضح كيف تكمل شخصياتهم بعضها البعض في سياق الصداقة والتعارف الاجتماعي. في نهاية التحليل، اقترح نشاطين محددين يمكنهم الاستمتاع بهما معاً في الرياض كأصدقاء.

اختم بجملة أو جملتين محفزة تشجعهم على الاستمرار في التعرف على بعضهم البعض وبناء صداقة.

مهم جداً - الأسماء:
- الاسم الأول: ${participantName} - إذا كان بالإنجليزية، يجب ترجمته للعربية حتماً (Ahmed=أحمد، Sara=سارة، Mohammad=محمد، Ali=علي، Fatima=فاطمة، Omar=عمر، Nora=نورا، Khalid=خالد، Lama=لمى)
- الاسم الثاني: ${partnerName} - إذا كان بالإنجليزية، يجب ترجمته للعربية حتماً
- استخدم الأسماء المترجمة في كل التحليل
- لا تذكر أرقام المشاركين أبداً

إرشادات الكتابة:
- اكتب بلغة عربية فصحى سهلة وودية
- لا تستخدم نقاط أو قوائم، اكتب فقرات متصلة
- اجعل النص يتدفق بشكل طبيعي من فكرة لأخرى
- ركز على الصداقة والتعارف الاجتماعي، ليس الرومانسية`

      // Generate AI analysis
      console.log(`🤖 Generating AI vibe analysis for participants ${participant.assigned_number} and ${partner.assigned_number}`)
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
        temperature: 0.7,
      })

      const analysis = completion.choices[0]?.message?.content?.trim()
      
      if (!analysis) {
        throw new Error("No analysis generated by AI")
      }

      // Store the analysis in the match_results table (shared between both participants)
      const { error: updateError } = await supabase
        .from("match_results")
        .update({ ai_personality_analysis: analysis })
        .eq("match_id", match_id)
        .eq("event_id", event_id)
        .or(`and(participant_a_number.eq.${participant.assigned_number},participant_b_number.eq.${partner_number}),and(participant_a_number.eq.${partner_number},participant_b_number.eq.${participant.assigned_number})`)

      if (updateError) {
        console.error("Error storing AI analysis:", updateError)
        return res.status(500).json({ error: "Failed to store analysis" })
      }

      console.log(`✅ AI vibe analysis generated and stored in match_results for participants ${participant.assigned_number} ↔ ${partner_number}`)
      
      return res.status(200).json({
        success: true,
        analysis: analysis,
        cached: false
      })
      
    } catch (error) {
      console.error("Error in generate-vibe-analysis:", error)
      return res.status(500).json({ 
        error: "Failed to generate vibe analysis",
        details: error.message 
      })
    }
  }

  return res.status(400).json({ error: 'Invalid action' })
}
