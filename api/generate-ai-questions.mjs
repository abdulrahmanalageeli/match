import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

// Initialize OpenAI with the cheapest model (gpt-3.5-turbo)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  try {
    const { secure_token, round } = req.body

    if (!secure_token) {
      return res.status(400).json({ error: "Missing secure_token" })
    }

    if (!round) {
      return res.status(400).json({ error: "Missing round" })
    }

    const match_id = "00000000-0000-0000-0000-000000000000"

    // Get the current event state to determine the actual round
    const { data: eventState, error: eventError } = await supabase
      .from("event_state")
      .select("phase")
      .eq("match_id", match_id)
      .single()

    if (eventError) {
      console.error("Event state error:", eventError)
      return res.status(500).json({ error: "Failed to get event state" })
    }

    // Determine the actual current round from the phase
    let actualRound = round
    if (eventState?.phase && eventState.phase.startsWith("round_")) {
      actualRound = parseInt(eventState.phase.split('_')[1])
    }

    console.log("Requested round:", round, "Actual round from phase:", actualRound, "Phase:", eventState?.phase)

    // Get the requesting participant's info
    const { data: requestingParticipant, error: fetchError } = await supabase
      .from("participants")
      .select("assigned_number, survey_data, summary")
      .eq("secure_token", secure_token)
      .single()

    if (fetchError || !requestingParticipant) {
      return res.status(404).json({ error: "Participant not found" })
    }

    // Check if we have survey responses
    if (!requestingParticipant.survey_data || !requestingParticipant.survey_data.answers) {
      return res.status(400).json({ error: "Survey responses not found" })
    }

    // Get the current match for this participant and round
    const { data: currentMatch, error: matchError } = await supabase
      .from("match_results")
      .select("participant_a_number, participant_b_number")
      .eq("match_id", match_id)
      .eq("round", actualRound)
      .or(`participant_a_number.eq.${requestingParticipant.assigned_number},participant_b_number.eq.${requestingParticipant.assigned_number}`)
      .single()

    if (matchError || !currentMatch) {
      console.error("Match query error:", matchError)
      console.error("Requesting participant:", requestingParticipant.assigned_number)
      console.error("Round:", actualRound)
      return res.status(404).json({ error: "No match found for this round" })
    }

    console.log("Found match:", currentMatch)
    console.log("Requesting participant:", requestingParticipant.assigned_number)
    console.log("Round:", actualRound)

    // Determine the other participant's number
    const otherParticipantNumber = currentMatch.participant_a_number === requestingParticipant.assigned_number 
      ? currentMatch.participant_b_number 
      : currentMatch.participant_a_number

    console.log("Other participant number:", otherParticipantNumber)

    // Check if questions already exist for this pair and round
    const { data: existingQuestions, error: existingError } = await supabase
      .from("ai_questions")
      .select("questions")
      .eq("match_id", match_id)
      .eq("round", actualRound)
      .eq("participant_a_number", Math.min(requestingParticipant.assigned_number, otherParticipantNumber))
      .eq("participant_b_number", Math.max(requestingParticipant.assigned_number, otherParticipantNumber))
      .single()

    if (existingQuestions) {
      return res.status(200).json({
        success: true,
        questions: existingQuestions.questions,
        alreadyGenerated: true
      })
    }

    // Get the other participant's survey responses
    const { data: otherParticipant, error: otherError } = await supabase
      .from("participants")
      .select("assigned_number, survey_data, summary")
      .eq("assigned_number", otherParticipantNumber)
      .single()

    if (otherError || !otherParticipant) {
      console.error("Other participant error:", otherError)
      console.error("Looking for participant:", otherParticipantNumber)
      return res.status(404).json({ error: "Other participant not found" })
    }

    console.log("Requesting participant data:", {
      number: requestingParticipant.assigned_number,
      survey_data: requestingParticipant.survey_data,
      summary: requestingParticipant.summary
    })

    console.log("Other participant data:", {
      number: otherParticipant.assigned_number,
      survey_data: otherParticipant.survey_data,
      summary: otherParticipant.summary
    })

    // Create context from both participants' survey responses
    const requestingData = requestingParticipant.survey_data?.answers || {};
    const otherData = otherParticipant.survey_data?.answers || {};
    
    const surveyContext = `
      Participant ${requestingParticipant.assigned_number}:
      - Gender: ${requestingData.gender || 'Not specified'}
      - Age Group: ${requestingData.ageGroup || 'Not specified'}
      - Participation Goal: ${requestingData.participationGoal || 'Not specified'}
      - Education Level: ${requestingData.educationLevel || 'Not specified'}
      - Core Values: ${Array.isArray(requestingData.coreValues) ? requestingData.coreValues.join(', ') : requestingData.coreValues || 'Not specified'}
      - Mental Openness: ${requestingData.mentalOpenness || 'Not specified'}
      - Weekend Style: ${requestingData.weekendStyle || 'Not specified'}
      - Thinking Style: ${requestingData.thinkingStyle || 'Not specified'}
      - Decision Making: ${requestingData.decisionMaking || 'Not specified'}
      - Organization Style: ${requestingData.organizationStyle || 'Not specified'}
      - Emotional Expression: ${requestingData.emotionalExpression || 'Not specified'}
      - Adventure vs Stability: ${requestingData.adventureVsStability || 'Not specified'}
      - Daily Activity: ${requestingData.dailyActivity || 'Not specified'}
      - Family Relationship: ${requestingData.familyRelationship || 'Not specified'}
      - Children Desire: ${requestingData.childrenDesire || 'Not specified'}
      - Conflict Resolution: ${requestingData.conflictResolution || 'Not specified'}
      - Hobbies: ${Array.isArray(requestingData.hobbies) ? requestingData.hobbies.join(', ') : requestingData.hobbies || 'Not specified'}
      ${requestingParticipant.summary ? `- Personality Summary: ${requestingParticipant.summary}` : ''}

      Participant ${otherParticipant.assigned_number}:
      - Gender: ${otherData.gender || 'Not specified'}
      - Age Group: ${otherData.ageGroup || 'Not specified'}
      - Participation Goal: ${otherData.participationGoal || 'Not specified'}
      - Education Level: ${otherData.educationLevel || 'Not specified'}
      - Core Values: ${Array.isArray(otherData.coreValues) ? otherData.coreValues.join(', ') : otherData.coreValues || 'Not specified'}
      - Mental Openness: ${otherData.mentalOpenness || 'Not specified'}
      - Weekend Style: ${otherData.weekendStyle || 'Not specified'}
      - Thinking Style: ${otherData.thinkingStyle || 'Not specified'}
      - Decision Making: ${otherData.decisionMaking || 'Not specified'}
      - Organization Style: ${otherData.organizationStyle || 'Not specified'}
      - Emotional Expression: ${otherData.emotionalExpression || 'Not specified'}
      - Adventure vs Stability: ${otherData.adventureVsStability || 'Not specified'}
      - Daily Activity: ${otherData.dailyActivity || 'Not specified'}
      - Family Relationship: ${otherData.familyRelationship || 'Not specified'}
      - Children Desire: ${otherData.childrenDesire || 'Not specified'}
      - Conflict Resolution: ${otherData.conflictResolution || 'Not specified'}
      - Hobbies: ${Array.isArray(otherData.hobbies) ? otherData.hobbies.join(', ') : otherData.hobbies || 'Not specified'}
      ${otherParticipant.summary ? `- Personality Summary: ${otherParticipant.summary}` : ''}
    `

    // Generate AI questions using the cheapest model
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // Cheapest model
      messages: [
        {
          role: "system",
          content: `You are an expert conversation designer who creates questions that spark deep, endless conversations. Your questions should be so engaging that people lose track of time talking about them.

Based on the survey responses from both participants, generate 5 unique questions that will:
1. **Light up the conversation** - Questions that make people's eyes sparkle and get them excited to share
2. **Create endless talk** - Questions that naturally lead to follow-up questions and deeper discussions
3. **Be highly personalized** - Use their specific interests, hobbies, and personality traits to create questions that feel tailor-made for them
4. **Reveal compatibility** - Questions that help them discover shared interests and complementary traits
5. **Feel magical** - Questions so good that people will think "wow, this AI really understands us"

Make the questions feel like they were crafted specifically for these two people based on their unique combination of interests and personalities. The questions should be so good that people will be amazed by how well they fit their conversation.

Return ONLY a JSON array with exactly 5 question strings in Arabic, no additional formatting or keys. Example format:
["Question 1 in Arabic?", "Question 2 in Arabic?", "Question 3 in Arabic?", "Question 4 in Arabic?", "Question 5 in Arabic?"]`
        },
        {
          role: "user",
          content: `Generate 5 conversation-starting questions that will create an amazing, endless conversation between these two participants based on their survey responses: ${surveyContext}`
        }
      ],
      max_tokens: 500, // Limit tokens to keep costs low
      temperature: 0.8, // Increase creativity for more engaging questions
    })

    const aiResponse = completion.choices[0]?.message?.content

    if (!aiResponse) {
      return res.status(500).json({ error: "Failed to generate questions" })
    }

    // Robust parsing of the AI response
    let questions = []
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(aiResponse)
      if (Array.isArray(parsed)) {
        questions = parsed.filter(q => typeof q === 'string' && q.trim().length > 0)
      }
    } catch (parseError) {
      // If JSON parsing fails, try to extract questions from the response
      const lines = aiResponse.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
          // Remove common prefixes and suffixes
          return line
            .replace(/^["']/, '') // Remove leading quotes
            .replace(/["']$/, '') // Remove trailing quotes
            .replace(/^[0-9]+\.\s*/, '') // Remove numbered prefixes
            .replace(/^[-*]\s*/, '') // Remove bullet points
            .replace(/^["']/, '') // Remove any remaining quotes
            .replace(/["']$/, '') // Remove any remaining quotes
            .trim()
        })
        .filter(line => line.length > 0 && !line.startsWith('{') && !line.startsWith('[') && !line.startsWith('}') && !line.startsWith(']'))
      
      questions = lines.slice(0, 5)
    }

    // Ensure we have exactly 5 questions, use fallbacks if needed
    if (questions.length === 0) {
      questions = [
        "ما هو أكثر شيء يجعلك تشعر بالامتنان في حياتك؟",
        "لو كان بإمكانك العودة بالزمن، ما هو الشيء الذي ستغيره؟",
        "ما هو الحلم الذي لم تتحقق منه بعد؟",
        "ما هو أكثر شيء يضحكك في الحياة؟",
        "لو كان بإمكانك تعليم العالم شيئاً واحداً، ماذا سيكون؟"
      ]
    }

    // Ensure we have exactly 5 questions
    questions = questions.slice(0, 5)
    while (questions.length < 5) {
      questions.push("ما هو أكثر شيء يجعلك تشعر بالسعادة؟")
    }

    // Store the questions in the database
    const { error: insertError } = await supabase
      .from("ai_questions")
      .insert({
        match_id,
        round: actualRound,
        participant_a_number: Math.min(requestingParticipant.assigned_number, otherParticipantNumber),
        participant_b_number: Math.max(requestingParticipant.assigned_number, otherParticipantNumber),
        questions: questions
      })

    if (insertError) {
      console.error("Error storing AI questions:", insertError)
      // Still return the questions even if storage fails
    }

    return res.status(200).json({
      success: true,
      questions: questions
    })

  } catch (error) {
    console.error("AI Question Generation Error:", error)
    
    // Return fallback questions if AI fails
    return res.status(200).json({
      success: true,
      questions: [
        "ما هو أكثر شيء يجعلك تشعر بالامتنان في حياتك؟",
        "لو كان بإمكانك العودة بالزمن، ما هو الشيء الذي ستغيره؟",
        "ما هو الحلم الذي لم تتحقق منه بعد؟",
        "ما هو أكثر شيء يضحكك في الحياة؟",
        "لو كان بإمكانك تعليم العالم شيئاً واحداً، ماذا سيكون؟"
      ]
    })
  }
} 