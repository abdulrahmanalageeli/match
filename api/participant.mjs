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

      // Create new participant with auto-assigned number
      const { data, error } = await supabase
        .from("participants")
        .insert([
          {
            assigned_number: nextNumber,
            match_id: "00000000-0000-0000-0000-000000000000",
          },
        ])
        .select("secure_token, assigned_number")
        .single()

      if (error) {
        console.error("Create Token Error:", error)
        return res.status(500).json({ error: "Database insert failed" })
      }

      return res.status(200).json({ 
        secure_token: data.secure_token,
        assigned_number: data.assigned_number,
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

      const { assigned_number, summary, survey_data, feedback, round, secure_token } = req.body
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
          participant_token: secure_token || null,
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
      // First, resolve the token to get participant info
      const { data: participant, error: participantError } = await supabase
        .from("participants")
        .select("assigned_number")
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

      // Fetch participant history
      console.log(`[API] Fetching match results for participant #${participant.assigned_number}`);
      const { data: matches, error: matchError } = await supabase
        .from("match_results")
        .select("*")
        .eq("match_id", "00000000-0000-0000-0000-000000000000")
        .or(`participant_a_number.eq.${participant.assigned_number},participant_b_number.eq.${participant.assigned_number}`)
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
        
        // Fetch partner information separately
        let partnerInfo = null
        if (partnerNumber && partnerNumber !== 9999) {
          try {
            const { data: partnerData, error: partnerError } = await supabase
              .from("participants")
              .select("name, age, phone_number")
              .eq("assigned_number", partnerNumber)
              .eq("match_id", "00000000-0000-0000-0000-000000000000")
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
          type: match.match_type || "غير محدد",
          reason: match.reason || "السبب غير متوفر",
          round: match.round || 1,
          table_number: match.table_number,
          score: match.compatibility_score || 0,
          is_repeat_match: match.is_repeat_match || false,
          mutual_match: isMutualMatch,
          wants_match: wantsMatch,
          partner_wants_match: partnerWantsMatch,
          created_at: match.created_at
        }
      }));

      console.log("[API] Successfully fetched match results. Sending response.");
      return res.status(200).json({
        success: true,
        assigned_number: participant.assigned_number,
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

  return res.status(400).json({ error: "Invalid action" })
}
