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

    // Get the requesting participant's info
    const { data: requestingParticipant, error: fetchError } = await supabase
      .from("participants")
      .select("assigned_number, q1, q2, q3, q4, summary")
      .eq("secure_token", secure_token)
      .single()

    if (fetchError || !requestingParticipant) {
      return res.status(404).json({ error: "Participant not found" })
    }

    // Check if we have survey responses
    if (!requestingParticipant.q1 || !requestingParticipant.q2 || !requestingParticipant.q3 || !requestingParticipant.q4) {
      return res.status(400).json({ error: "Survey responses not found" })
    }

    // Get the current match for this participant and round
    const { data: currentMatch, error: matchError } = await supabase
      .from("match_results")
      .select("participant_a_number, participant_b_number")
      .eq("match_id", match_id)
      .eq("round", round)
      .or(`participant_a_number.eq.${requestingParticipant.assigned_number},participant_b_number.eq.${requestingParticipant.assigned_number}`)
      .single()

    if (matchError || !currentMatch) {
      return res.status(404).json({ error: "No match found for this round" })
    }

    // Determine the other participant's number
    const otherParticipantNumber = currentMatch.participant_a_number === requestingParticipant.assigned_number 
      ? currentMatch.participant_b_number 
      : currentMatch.participant_a_number

    // Check if questions already exist for this pair and round
    const { data: existingQuestions, error: existingError } = await supabase
      .from("ai_questions")
      .select("questions")
      .eq("match_id", match_id)
      .eq("round", round)
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
      .select("assigned_number, q1, q2, q3, q4, summary")
      .eq("assigned_number", otherParticipantNumber)
      .single()

    if (otherError || !otherParticipant) {
      return res.status(404).json({ error: "Other participant not found" })
    }

    // Create context from both participants' survey responses
    const surveyContext = `
      Participant ${requestingParticipant.assigned_number}:
      - Free time activities: ${requestingParticipant.q1}
      - Travel destination: ${requestingParticipant.q2}
      - Favorite hobby: ${requestingParticipant.q3}
      - Dream skill to learn: ${requestingParticipant.q4}
      ${requestingParticipant.summary ? `- Personality Summary: ${requestingParticipant.summary}` : ''}

      Participant ${otherParticipant.assigned_number}:
      - Free time activities: ${otherParticipant.q1}
      - Travel destination: ${otherParticipant.q2}
      - Favorite hobby: ${otherParticipant.q3}
      - Dream skill to learn: ${otherParticipant.q4}
      ${otherParticipant.summary ? `- Personality Summary: ${otherParticipant.summary}` : ''}
    `

    // Generate AI questions using the cheapest model
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // Cheapest model
      messages: [
        {
          role: "system",
          content: `You are an expert in creating engaging conversation starters and discussion topics. Based on the survey responses from both participants provided, generate 5 unique, interesting questions or discussion topics that would help these two people have an amazing conversation. The questions should be:

1. Relevant to both participants' interests and personalities
2. Open-ended and thought-provoking
3. Suitable for a first meeting
4. Diverse in topics (mix of personal, fun, and deeper questions)
5. In Arabic language

Return ONLY a JSON array with exactly 5 question strings, no additional formatting or keys. Example format:
["Question 1 in Arabic?", "Question 2 in Arabic?", "Question 3 in Arabic?", "Question 4 in Arabic?", "Question 5 in Arabic?"]`
        },
        {
          role: "user",
          content: `Generate 5 engaging conversation questions/topics based on these two participants' survey responses: ${surveyContext}`
        }
      ],
      max_tokens: 500, // Limit tokens to keep costs low
      temperature: 0.7, // Add some creativity
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
        round,
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