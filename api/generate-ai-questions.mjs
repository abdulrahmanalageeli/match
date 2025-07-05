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
    const { secure_token } = req.body

    if (!secure_token) {
      return res.status(400).json({ error: "Missing secure_token" })
    }

    // Get participant's survey responses
    const { data: participant, error: fetchError } = await supabase
      .from("participants")
      .select("q1, q2, q3, q4, summary")
      .eq("secure_token", secure_token)
      .single()

    if (fetchError || !participant) {
      return res.status(404).json({ error: "Participant not found" })
    }

    // Check if we have survey responses
    if (!participant.q1 || !participant.q2 || !participant.q3 || !participant.q4) {
      return res.status(400).json({ error: "Survey responses not found" })
    }

    // Create context from survey responses
    const surveyContext = `
      Survey Responses:
      Q1 (Free time activities): ${participant.q1}
      Q2 (Travel destination): ${participant.q2}
      Q3 (Favorite hobby): ${participant.q3}
      Q4 (Dream skill to learn): ${participant.q4}
      ${participant.summary ? `Personality Summary: ${participant.summary}` : ''}
    `

    // Generate AI questions using the cheapest model
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // Cheapest model
      messages: [
        {
          role: "system",
          content: `You are an expert in creating engaging conversation starters and discussion topics. Based on the survey responses provided, generate 5 unique, interesting questions or discussion topics that would help two people have an amazing conversation. The questions should be:

1. Relevant to their interests and personality
2. Open-ended and thought-provoking
3. Suitable for a first meeting
4. Diverse in topics (mix of personal, fun, and deeper questions)
5. In Arabic language

Format your response as a JSON array with exactly 5 questions/topics.`
        },
        {
          role: "user",
          content: `Generate 5 engaging conversation questions/topics based on this person's survey responses: ${surveyContext}`
        }
      ],
      max_tokens: 500, // Limit tokens to keep costs low
      temperature: 0.7, // Add some creativity
    })

    const aiResponse = completion.choices[0]?.message?.content

    if (!aiResponse) {
      return res.status(500).json({ error: "Failed to generate questions" })
    }

    // Try to parse JSON response, fallback to simple array if needed
    let questions
    try {
      questions = JSON.parse(aiResponse)
    } catch (parseError) {
      // If JSON parsing fails, create a simple array from the response
      const lines = aiResponse.split('\n').filter(line => line.trim() && !line.startsWith('```'))
      questions = lines.slice(0, 5).map(line => line.replace(/^\d+\.\s*/, '').trim())
    }

    // Ensure we have exactly 5 questions
    if (!Array.isArray(questions) || questions.length === 0) {
      // Fallback questions in Arabic
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