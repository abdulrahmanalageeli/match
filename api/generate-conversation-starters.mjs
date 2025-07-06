// /api/generate-conversation-starters.mjs (Vercel serverless function)
import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY,
})

export default async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  try {
    const { secure_token, match_id } = req.body

    if (!secure_token) {
      return res.status(400).json({ error: "Missing secure_token" })
    }

    const matchId = match_id || process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

    // First, resolve the token to get assigned_number
    const tokenRes = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/participants?secure_token=eq.${secure_token}&select=assigned_number,survey_data,summary&limit=1`, {
      headers: {
        'apikey': process.env.VITE_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`
      }
    })

    if (!tokenRes.ok) {
      return res.status(404).json({ error: "Invalid token" })
    }

    const participants = await tokenRes.json()
    if (!participants || participants.length === 0) {
      return res.status(404).json({ error: "Participant not found" })
    }

    const participant = participants[0]
    const surveyData = participant.survey_data?.answers || {}

    // Create prompt for AI conversation starters
    const prompt = `بناءً على إجابات هذا الشخص في الاستطلاع، اكتب 5 أسئلة أو مواضيع محادثة ممتعة ومثيرة للاهتمام ستساعد شخصين على التعرف على بعضهما بشكل أفضل:

الإجابات:
- الجنس: ${surveyData.gender || 'غير محدد'}
- الفئة العمرية: ${surveyData.ageGroup || 'غير محدد'}
- هدف المشاركة: ${surveyData.participationGoal || 'غير محدد'}
- المستوى التعليمي: ${surveyData.educationLevel || 'غير محدد'}
- القيم الجوهرية: ${Array.isArray(surveyData.coreValues) ? surveyData.coreValues.join(', ') : surveyData.coreValues || 'غير محدد'}
- الانفتاح الذهني: ${surveyData.mentalOpenness || 'غير محدد'}
- نمط عطلة نهاية الأسبوع: ${surveyData.weekendStyle || 'غير محدد'}
- طريقة التفكير: ${surveyData.thinkingStyle || 'غير محدد'}
- اتخاذ القرارات: ${surveyData.decisionMaking || 'غير محدد'}
- التنظيم والعفوية: ${surveyData.organizationStyle || 'غير محدد'}
- التعبير العاطفي: ${surveyData.emotionalExpression || 'غير محدد'}
- المغامرة مقابل الاستقرار: ${surveyData.adventureVsStability || 'غير محدد'}
- النشاط اليومي: ${surveyData.dailyActivity || 'غير محدد'}
- علاقة العائلة: ${surveyData.familyRelationship || 'غير محدد'}
- الرغبة في الأطفال: ${surveyData.childrenDesire || 'غير محدد'}
- حل الخلافات: ${surveyData.conflictResolution || 'غير محدد'}
- الهوايات: ${Array.isArray(surveyData.hobbies) ? surveyData.hobbies.join(', ') : surveyData.hobbies || 'غير محدد'}
- ملخص الشخصية: ${participant.summary || "غير متوفر"}

اكتب 5 أسئلة أو مواضيع محادثة باللغة العربية. يجب أن تكون:
1. ممتعة ومثيرة للاهتمام
2. مرتبطة بإجاباتهم
3. تساعد على التعرف على الشخصية
4. مناسبة للمحادثة الأولى
5. متنوعة (بعضها أسئلة، وبعضها مواضيع للمناقشة)

أجب بالتنسيق التالي فقط:
1. [السؤال أو الموضوع الأول]
2. [السؤال أو الموضوع الثاني]
3. [السؤال أو الموضوع الثالث]
4. [السؤال أو الموضوع الرابع]
5. [السؤال أو الموضوع الخامس]`

    // Use the cheapest AI model (gpt-3.5-turbo)
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "أنت مساعد محادثة ذكي تساعد في إنشاء أسئلة ومواضيع محادثة ممتعة ومثيرة للاهتمام. اكتب باللغة العربية فقط."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 300
    })

    const aiResponse = response.choices[0]?.message?.content?.trim()
    
    if (!aiResponse) {
      throw new Error("No response from AI")
    }

    // Parse the numbered list into an array
    const conversationStarters = aiResponse
      .split('\n')
      .filter(line => line.trim().match(/^\d+\./))
      .map(line => line.replace(/^\d+\.\s*/, '').trim())
      .filter(line => line.length > 0)

    // If parsing failed, create fallback starters
    if (conversationStarters.length === 0) {
      const fallbackStarters = [
        "ما هو أكثر شيء يجعلك تضحك؟",
        "لو كان بإمكانك السفر لأي مكان، أين ستذهب ولماذا؟",
        "ما هي هوايتك المفضلة؟",
        "ما هو أفضل كتاب أو فيلم شاهدته مؤخراً؟",
        "لو كان بإمكانك تعلم مهارة جديدة، ماذا ستكون؟"
      ]
      return res.status(200).json({ 
        success: true, 
        conversation_starters: fallbackStarters,
        source: "fallback"
      })
    }

    return res.status(200).json({ 
      success: true, 
      conversation_starters: conversationStarters,
      source: "ai"
    })

  } catch (error) {
    console.error("Error generating conversation starters:", error)
    return res.status(500).json({ 
      error: "Failed to generate conversation starters",
      details: error.message 
    })
  }
} 