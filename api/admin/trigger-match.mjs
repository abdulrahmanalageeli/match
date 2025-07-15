import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// MBTI Compatibility Matrix
const MBTI_COMPATIBILITY = {
  'ESTP': { top1: 'ENTP', top2: 'ENFJ', top3: 'INTJ', bonus: [] },
  'ISFP': { top1: 'INFJ', top2: 'ENFP', top3: 'ENTJ', bonus: ['INTJ'] },
  'ISTP': { top1: 'ESTJ', top2: 'ISFJ', top3: 'ISTJ', bonus: ['ENFP', 'ENTP', 'INTP'] },
  'ESFP': { top1: 'ESFJ', top2: 'ISTJ', top3: 'INFP', bonus: [] },
  'ESTJ': { top1: 'ISFJ', top2: 'ISTP', top3: 'ISTJ', bonus: [] },
  'ESFJ': { top1: 'ESFP', top2: 'ISTJ', top3: 'ESFJ', bonus: [] },
  'ISTJ': { top1: 'ISTJ', top2: 'ESTJ', top3: 'ESFJ', bonus: ['ISFJ'] },
  'ISFJ': { top1: 'ESTJ', top2: 'ISFJ', top3: 'ISTP', bonus: ['ISTJ'] },
  'ENFJ': { top1: 'ENFJ', top2: 'ESTP', top3: 'ENTJ', bonus: ['INTJ'] },
  'INFJ': { top1: 'ISFP', top2: 'ENTJ', top3: 'ENFP', bonus: ['INFP'] },
  'ENFP': { top1: 'ISFP', top2: 'ISTP', top3: 'INFJ', bonus: ['ENTP'] },
  'INFP': { top1: 'ESFP', top2: 'INFJ', top3: 'INTP', bonus: [] },
  'ENTJ': { top1: 'INFJ', top2: 'ISFP', top3: 'ESFJ', bonus: ['ENFJ'] },
  'INTJ': { top1: 'ENTP', top2: 'INTP', top3: 'ESTP', bonus: ['ISFP', 'ENFJ'] },
  'ENTP': { top1: 'ESTP', top2: 'INTJ', top3: 'ISTP', bonus: ['ENFP', 'INTP'] },
  'INTP': { top1: 'INTJ', top2: 'ISTP', top3: 'INFP', bonus: ['ENTP'] }
}

// Function to calculate MBTI compatibility score (up to 10% of total)
function calculateMBTICompatibility(type1, type2) {
  if (!type1 || !type2 || !MBTI_COMPATIBILITY[type1]) {
    return 0 // Default 0% if no MBTI data
  }
  
  const compatibility = MBTI_COMPATIBILITY[type1]
  
  if (compatibility.top1 === type2) {
    return 10 // Top 1 match gets 10%
  } else if (compatibility.top2 === type2) {
    return 7.5 // Top 2 match gets 7.5%
  } else if (compatibility.top3 === type2 || compatibility.bonus.includes(type2)) {
    return 5 // Top 3 or bonus match gets 5%
  } else {
    return 0 // No match gets 0%
  }
}

// Function to calculate attachment style compatibility score (15% if best match, 5% otherwise)
function calculateAttachmentCompatibility(style1, style2) {
  if (!style1 || !style2) {
    return 5 // Default 5% if no attachment data
  }
  
  // Best matches based on the image
  const bestMatches = {
    'Secure': ['Secure', 'Anxious', 'Avoidant'],
    'Anxious': ['Secure'],
    'Avoidant': ['Secure'],
    'Fearful': ['Secure'],
    'Mixed (Secure-Anxious)': ['Secure'],
    'Mixed (Secure-Avoidant)': ['Secure'],
    'Mixed (Secure-Fearful)': ['Secure'],
    'Mixed (Anxious-Avoidant)': ['Secure'],
    'Mixed (Anxious-Fearful)': ['Secure'],
    'Mixed (Avoidant-Fearful)': ['Secure']
  }
  
  // Check if it's a best match
  const matches = bestMatches[style1] || []
  if (matches.includes(style2)) {
    return 15 // Best match gets 15%
  } else {
    return 5 // Non-best match gets 5%
  }
}

// Function to calculate communication style compatibility score (up to 25% of total)
function calculateCommunicationCompatibility(style1, style2) {
  if (!style1 || !style2) {
    return 10 // Default 10% if no communication data
  }
  
  // Aggressive with Passive-Aggressive gets 0%
  if ((style1 === 'Aggressive' && style2 === 'Passive-Aggressive') || 
      (style1 === 'Passive-Aggressive' && style2 === 'Aggressive')) {
    return 0
  }
  
  // Communication style compatibility based on the image
  const compatibilityMatrix = {
    'Assertive': { top1: 'Assertive', top2: 'Passive' },
    'Passive': { top1: 'Assertive', top2: 'Passive' },
    'Aggressive': { top1: 'Assertive', top2: 'Aggressive' },
    'Passive-Aggressive': { top1: 'Assertive', top2: 'Passive-Aggressive' }
  }
  
  const compatibility = compatibilityMatrix[style1]
  if (!compatibility) {
    return 10 // Default if style not found
  }
  
  if (compatibility.top1 === style2) {
    return 25 // Top 1 match gets 25%
  } else if (compatibility.top2 === style2) {
    return 20 // Top 2 match gets 20%
  } else {
    return 10 // Neither match gets 10%
  }
}

// Function to calculate lifestyle compatibility score (up to 15% of total)
function calculateLifestyleCompatibility(preferences1, preferences2) {
  if (!preferences1 || !preferences2) {
    return 0 // Default 0% if no lifestyle data
  }
  
  // Parse preferences (format: "أ,ب,ج,أ,ب")
  const prefs1 = preferences1.split(',')
  const prefs2 = preferences2.split(',')
  
  if (prefs1.length !== 5 || prefs2.length !== 5) {
    return 0 // Invalid format
  }
  
  // Calculate similarity: 3% for each matching answer
  let matches = 0
  for (let i = 0; i < 5; i++) {
    if (prefs1[i] === prefs2[i]) {
      matches++
    }
  }
  
  return matches * 3 // 3% per match, max 15% if all 5 match
}

// Function to calculate core values compatibility score (up to 20% of total)
function calculateCoreValuesCompatibility(values1, values2) {
  if (!values1 || !values2) {
    return 0 // Default 0% if no core values data
  }
  
  // Parse values (format: "أ,ب,ج,أ,ب")
  const vals1 = values1.split(',')
  const vals2 = values2.split(',')
  
  if (vals1.length !== 5 || vals2.length !== 5) {
    return 0 // Invalid format
  }
  
  // Calculate compatibility using the recommended scoring strategy
  let totalScore = 0
  
  for (let i = 0; i < 5; i++) {
    const val1 = vals1[i]
    const val2 = vals2[i]
    
    if (val1 === val2) {
      // Identical answer = full value match (4 points)
      totalScore += 4
    } else if (
      (val1 === 'ب' && (val2 === 'أ' || val2 === 'ج')) ||
      (val2 === 'ب' && (val1 === 'أ' || val1 === 'ج'))
    ) {
      // Adjacent answer (middle vs. one side) = partial match (2 points)
      totalScore += 2
    } else {
      // Opposite answers = value clash (0 points)
      totalScore += 0
    }
  }
  
  // Convert to percentage: 5 questions × 4 points max = 20 points = 20%
  return totalScore // Already represents percentage (0-20%)
}

// Function to calculate vibe compatibility using AI (up to 15% of total)
async function calculateVibeCompatibility(participantA, participantB) {
  try {
    // Get vibe descriptions
    const aVibeDescription = participantA.survey_data?.vibeDescription || ""
    const aIdealPersonDescription = participantA.survey_data?.idealPersonDescription || ""
    const bVibeDescription = participantB.survey_data?.vibeDescription || ""
    const bIdealPersonDescription = participantB.survey_data?.idealPersonDescription || ""

    if (!aVibeDescription || !aIdealPersonDescription || !bVibeDescription || !bIdealPersonDescription) {
      console.warn("Missing vibe descriptions, using default score")
      return 7 // Default average score
    }

    // Calculate compatibility: A's ideal vs B's self-description
    const compatibilityAtoB = await calculateSingleVibeCompatibility(aIdealPersonDescription, bVibeDescription)
    
    // Calculate compatibility: B's ideal vs A's self-description
    const compatibilityBtoA = await calculateSingleVibeCompatibility(bIdealPersonDescription, aVibeDescription)

    // Average the two scores for mutual compatibility
    const averageCompatibility = Math.round((compatibilityAtoB + compatibilityBtoA) / 2)

    return averageCompatibility

  } catch (error) {
    console.error("🔥 Vibe compatibility calculation error:", error)
    return 7 // Default average score on error
  }
}

// Helper function to calculate single vibe compatibility using AI
async function calculateSingleVibeCompatibility(idealDescription, selfDescription) {
  try {
    const systemMessage = `أنت مساعد ذكي متخصص في تحليل التوافق الشخصي. 

مهمتك هي مقارنة وصف الشخص المثالي مع وصف شخص حقيقي لنفسه، وتقييم مدى التوافق بينهما.

قواعد التقييم:
- إذا كان هناك تطابق كبير في الصفات والأسلوب: 12-15 نقطة
- إذا كان هناك تطابق جيد مع بعض الاختلافات البسيطة: 8-11 نقطة  
- إذا كان هناك تطابق متوسط: 5-7 نقاط
- إذا كان هناك تطابق ضعيف أو لم يجب على السؤال بشكل صحيح: 3-4 نقاط
- إذا كان هناك تعارض واضح في الصفات: 0-2 نقطة

يجب أن تكون صارماً وموضوعياً في التقييم. 

أرجع رقماً فقط من 0 إلى 15 بدون أي نص إضافي.`

    const userMessage = `الشخص المثالي المطلوب: "${idealDescription}"

وصف الشخص الحقيقي لنفسه: "${selfDescription}"

قيّم التوافق من 0 إلى 15:`

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage }
      ],
      max_tokens: 10,
      temperature: 0.1
    })

    const score = parseInt(completion.choices[0].message.content.trim())
    
    // Validate score is within range
    if (isNaN(score) || score < 0 || score > 15) {
      console.warn("Invalid AI score, using default:", completion.choices[0].message.content)
      return 7 // Default average score
    }

    return score

  } catch (error) {
    console.error("🔥 AI compatibility calculation error:", error)
    return 7 // Default average score on error
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

  try {
    const { data: participants, error } = await supabase
      .from("participants")
      .select("assigned_number, survey_data, mbti_personality_type, attachment_style, communication_style")
      .eq("match_id", match_id)

    if (error) throw error
    if (!participants || participants.length < 2) {
      return res.status(400).json({ error: "Not enough participants" })
    }

    const numbers = participants.map(p => p.assigned_number)
    const pairs = []

    for (let i = 0; i < participants.length; i++) {
      for (let j = i + 1; j < participants.length; j++) {
        pairs.push([participants[i], participants[j]])
      }
    }

    // Calculate MBTI-based compatibility for all pairs
    const compatibilityScores = []
    console.log(`🔄 Starting compatibility calculation for ${pairs.length} pairs...`)
    
    for (const [a, b] of pairs) {
      console.log(`\n📊 Calculating compatibility between Player ${a.assigned_number} and Player ${b.assigned_number}:`)
      // Use dedicated columns first, fallback to survey_data
      const aMBTI = a.mbti_personality_type || a.survey_data?.mbtiType
      const bMBTI = b.mbti_personality_type || b.survey_data?.mbtiType
      const aAttachment = a.attachment_style || a.survey_data?.attachmentStyle
      const bAttachment = b.attachment_style || b.survey_data?.attachmentStyle
      const aCommunication = a.communication_style || a.survey_data?.communicationStyle
      const bCommunication = b.communication_style || b.survey_data?.communicationStyle
      const aLifestyle = a.survey_data?.lifestylePreferences
      const bLifestyle = b.survey_data?.lifestylePreferences
      const aCoreValues = a.survey_data?.coreValues
      const bCoreValues = b.survey_data?.coreValues
      
      // Calculate MBTI compatibility (up to 10% of total score)
      const mbtiScore = calculateMBTICompatibility(aMBTI, bMBTI)
      console.log(`🧠 MBTI Compatibility - Player ${a.assigned_number} (${aMBTI || 'غير محدد'}) vs Player ${b.assigned_number} (${bMBTI || 'غير محدد'}): ${mbtiScore}%`)
      
      // Calculate attachment style compatibility (15% if best match, 5% otherwise)
      const attachmentScore = calculateAttachmentCompatibility(aAttachment, bAttachment)
      console.log(`🔗 Attachment Compatibility - Player ${a.assigned_number} (${aAttachment || 'غير محدد'}) vs Player ${b.assigned_number} (${bAttachment || 'غير محدد'}): ${attachmentScore}%`)
      
      // Calculate communication style compatibility (up to 25% of total score)
      const communicationScore = calculateCommunicationCompatibility(aCommunication, bCommunication)
      console.log(`💬 Communication Compatibility - Player ${a.assigned_number} (${aCommunication || 'غير محدد'}) vs Player ${b.assigned_number} (${bCommunication || 'غير محدد'}): ${communicationScore}%`)
      
      // Calculate lifestyle compatibility (up to 15% of total score)
      const lifestyleScore = calculateLifestyleCompatibility(aLifestyle, bLifestyle)
      console.log(`⏰ Lifestyle Compatibility - Player ${a.assigned_number} vs Player ${b.assigned_number}: ${lifestyleScore}%`)
      
      // Calculate core values compatibility (up to 20% of total score)
      const coreValuesScore = calculateCoreValuesCompatibility(aCoreValues, bCoreValues)
      console.log(`⚖️ Core Values Compatibility - Player ${a.assigned_number} vs Player ${b.assigned_number}: ${coreValuesScore}%`)
      
      // Calculate vibe compatibility using AI (up to 15% of total score)
      const vibeScore = await calculateVibeCompatibility(a, b)
      console.log(`✨ Vibe Compatibility - Player ${a.assigned_number} vs Player ${b.assigned_number}: ${vibeScore}%`)
      
      // Total score so far (MBTI + Attachment + Communication + Lifestyle + Core Values + Vibe = up to 100%)
      const totalScore = mbtiScore + attachmentScore + communicationScore + lifestyleScore + coreValuesScore + vibeScore
      console.log(`🎯 TOTAL COMPATIBILITY - Player ${a.assigned_number} vs Player ${b.assigned_number}: ${totalScore}% (MBTI: ${mbtiScore}% + Attachment: ${attachmentScore}% + Communication: ${communicationScore}% + Lifestyle: ${lifestyleScore}% + Core Values: ${coreValuesScore}% + Vibe: ${vibeScore}%)`)
      
      const reason = `MBTI: ${aMBTI || 'غير محدد'} مع ${bMBTI || 'غير محدد'} (${mbtiScore}%) + التعلق: ${aAttachment || 'غير محدد'} مع ${bAttachment || 'غير محدد'} (${attachmentScore}%) + التواصل: ${aCommunication || 'غير محدد'} مع ${bCommunication || 'غير محدد'} (${communicationScore}%) + نمط الحياة: (${lifestyleScore}%) + القيم الأساسية: (${coreValuesScore}%) + التوافق الشخصي: (${vibeScore}%)`
      
      compatibilityScores.push({
        a: a.assigned_number,
        b: b.assigned_number,
        score: totalScore,
        reason: reason,
        mbtiScore: mbtiScore,
        attachmentScore: attachmentScore,
        communicationScore: communicationScore,
        lifestyleScore: lifestyleScore,
        coreValuesScore: coreValuesScore,
        vibeScore: vibeScore,
        // Store personality data for later use
        aMBTI: aMBTI,
        bMBTI: bMBTI,
        aAttachment: aAttachment,
        bAttachment: bAttachment,
        aCommunication: aCommunication,
        bCommunication: bCommunication,
        aLifestyle: aLifestyle,
        bLifestyle: bLifestyle,
        aCoreValues: aCoreValues,
        bCoreValues: bCoreValues,
        aVibeDescription: a.survey_data?.vibeDescription || '',
        bVibeDescription: b.survey_data?.vibeDescription || '',
        aIdealPersonDescription: a.survey_data?.idealPersonDescription || '',
        bIdealPersonDescription: b.survey_data?.idealPersonDescription || ''
      })
    }

    // 📊 Print all compatibility
    console.log("📊 All Compatibility Scores (MBTI + Attachment + Communication + Lifestyle + Core Values + Vibe):")
    compatibilityScores
      .slice()
      .sort((a, b) => b.score - a.score)
      .forEach(pair => {
        console.log(`#${pair.a} × #${pair.b}: ${pair.score}% → ${pair.reason}`)
      })

    // --- ROUND-ROBIN GLOBAL COMPATIBILITY MATCHING (2 ROUNDS) ---
    const finalMatches = []
    const matchedPairs = new Set() // Track pairs matched in any round
    const participantCount = numbers.length
    const rounds = 2

    for (let round = 1; round <= rounds; round++) {
      const used = new Set() // Track participants matched in this round
      const roundMatches = []
      // Sort all pairs globally by score (descending)
      const sortedPairs = [...compatibilityScores].sort((a, b) => b.score - a.score)
      for (const pair of sortedPairs) {
        const key = `${Math.min(pair.a, pair.b)}-${Math.max(pair.a, pair.b)}`
        if (
          !used.has(pair.a) &&
          !used.has(pair.b) &&
          !matchedPairs.has(key)
        ) {
          used.add(pair.a)
          used.add(pair.b)
          matchedPairs.add(key)
          roundMatches.push({
            participant_a_number: pair.a,
            participant_b_number: pair.b,
            compatibility_score: pair.score,
            reason: pair.reason,
            match_id,
            round,
            // Add personality type data
            participant_a_mbti_type: pair.aMBTI,
            participant_b_mbti_type: pair.bMBTI,
            participant_a_attachment_style: pair.aAttachment,
            participant_b_attachment_style: pair.bAttachment,
            participant_a_communication_style: pair.aCommunication,
            participant_b_communication_style: pair.bCommunication,
            participant_a_lifestyle_preferences: pair.aLifestyle,
            participant_b_lifestyle_preferences: pair.bLifestyle,
            participant_a_core_values: pair.aCoreValues,
            participant_b_core_values: pair.bCoreValues,
            participant_a_vibe_description: pair.aVibeDescription,
            participant_b_vibe_description: pair.bVibeDescription,
            participant_a_ideal_person_description: pair.aIdealPersonDescription,
            participant_b_ideal_person_description: pair.bIdealPersonDescription,
            // Add score breakdown
            mbti_compatibility_score: pair.mbtiScore,
            attachment_compatibility_score: pair.attachmentScore,
            communication_compatibility_score: pair.communicationScore,
            lifestyle_compatibility_score: pair.lifestyleScore,
            core_values_compatibility_score: pair.coreValuesScore,
            vibe_compatibility_score: pair.vibeScore
          })
        }
      }
      // Handle odd participant: find unmatched with lowest score
      const unmatched = numbers.filter(n => !used.has(n))
      if (unmatched.length === 1) {
        roundMatches.push({
          participant_a_number: 0,
          participant_b_number: unmatched[0],
          compatibility_score: 0,
          reason: "لم نجد شريكاً مناسباً. سيجلس مع المنظم.",
          match_id,
          round
        })
      }
      finalMatches.push(...roundMatches)
    }

    const { error: insertError } = await supabase
      .from("match_results")
      .insert(finalMatches)

    if (insertError) throw insertError

    return res.status(200).json({
      message: `✅ Matching complete for ${rounds} rounds (MBTI + Attachment + Communication + Lifestyle + Core Values + Vibe)`,
      count: finalMatches.length,
      results: finalMatches
    })

  } catch (err) {
    console.error("🔥 Matching error:", err)
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
}

/* 
// COMMENTED OUT - OLD GPT-BASED COMPATIBILITY SYSTEM
// Will be replaced with new multi-factor scoring system

// const prompt = pairs
  .map(([a, b]) => {
    const aData = a.survey_data?.answers || {};
    const bData = b.survey_data?.answers || {};
    
    return `المشارك ${a.assigned_number}:
- الجنس: ${aData.gender || 'غير محدد'}
- الفئة العمرية: ${aData.ageGroup || 'غير محدد'}
- هدف المشاركة: ${aData.participationGoal || 'غير محدد'}
- المستوى التعليمي: ${aData.educationLevel || 'غير محدد'}
- القيم الجوهرية: ${Array.isArray(aData.coreValues) ? aData.coreValues.join(', ') : aData.coreValues || 'غير محدد'}
- الانفتاح الذهني: ${aData.mentalOpenness || 'غير محدد'}
- نمط عطلة نهاية الأسبوع: ${aData.weekendStyle || 'غير محدد'}
- طريقة التفكير: ${aData.thinkingStyle || 'غير محدد'}
- اتخاذ القرارات: ${aData.decisionMaking || 'غير محدد'}
- التنظيم والعفوية: ${aData.organizationStyle || 'غير محدد'}
- التعبير العاطفي: ${aData.emotionalExpression || 'غير محدد'}
- المغامرة مقابل الاستقرار: ${aData.adventureVsStability || 'غير محدد'}
- النشاط اليومي: ${aData.dailyActivity || 'غير محدد'}
- علاقة العائلة: ${aData.familyRelationship || 'غير محدد'}
- الرغبة في الأطفال: ${aData.childrenDesire || 'غير محدد'}
- حل الخلافات: ${aData.conflictResolution || 'غير محدد'}
- الهوايات: ${Array.isArray(aData.hobbies) ? aData.hobbies.join(', ') : aData.hobbies || 'غير محدد'}

المشارك ${b.assigned_number}:
- الجنس: ${bData.gender || 'غير محدد'}
- الفئة العمرية: ${bData.ageGroup || 'غير محدد'}
- هدف المشاركة: ${bData.participationGoal || 'غير محدد'}
- المستوى التعليمي: ${bData.educationLevel || 'غير محدد'}
- القيم الجوهرية: ${Array.isArray(bData.coreValues) ? bData.coreValues.join(', ') : bData.coreValues || 'غير محدد'}
- الانفتاح الذهني: ${bData.mentalOpenness || 'غير محدد'}
- نمط عطلة نهاية الأسبوع: ${bData.weekendStyle || 'غير محدد'}
- طريقة التفكير: ${bData.thinkingStyle || 'غير محدد'}
- اتخاذ القرارات: ${bData.decisionMaking || 'غير محدد'}
- التنظيم والعفوية: ${bData.organizationStyle || 'غير محدد'}
- التعبير العاطفي: ${bData.emotionalExpression || 'غير محدد'}
- المغامرة مقابل الاستقرار: ${bData.adventureVsStability || 'غير محدد'}
- النشاط اليومي: ${bData.dailyActivity || 'غير محدد'}
- علاقة العائلة: ${bData.familyRelationship || 'غير محدد'}
- الرغبة في الأطفال: ${bData.childrenDesire || 'غير محدد'}
- حل الخلافات: ${bData.conflictResolution || 'غير محدد'}
- الهوايات: ${Array.isArray(bData.hobbies) ? bData.hobbies.join(', ') : bData.hobbies || 'غير محدد'}`
  })
  .join("\n\n")

const systemMsg = `أنت مساعد توافق بين المشاركين في فعالية اجتماعية.

هدفك هو تقييم نسبة التوافق بين كل زوج من المشاركين من 0 إلى 100، وشرح السبب باختصار.

لا تقيّم بناءً على التشابه السطحي فقط، بل ركّز على العوامل العميقة التي تُؤثر فعليًا على الانسجام بين الطرفين على المدى الطويل (سواء لعلاقة رومانسية أو صداقة).

🔎 استخدم البيانات الواردة من الاستبيان التالي لتحديد مستوى التوافق، ووزن العوامل كالتالي:

---

📌 **أولًا: تطابق القيم والمبادئ (40٪)**  
- تطابق القيم الجوهرية (السؤال 5) هو العامل الأهم.  
- مدى الانسجام في التوجه العقلي والانفتاح (السؤال 6)  
- توافق الموقف من العائلة (س14) والأطفال (س15)  
- التوجه الديني والاجتماعي إن وُجد ضمن الأسئلة المفتوحة.

---

📌 **ثانيًا: نمط الحياة والتواصل (30٪)**  
- تقارب في نمط الحياة والاجتماعية (س7، س13، س20، س22)  
- تشابه أو انسجام في النشاط والطاقة (س18)، والهوايات (س17)  
- القبول بالعادات (س21)، النظافة، الحيوانات الأليفة  
- أسلوب التعامل مع الخلاف (س16) والتعبير العاطفي (س11)  

---

📌 **ثالثًا: التكامل النفسي والسلوكي (20٪)**  
- الاستفادة من الاختلاف الإيجابي (مثال: شخص منطقي × شخص حساس)  
- مطابقة التقريبية لأنماط MBTI من خلال الأسئلة:  
  - الانطوائية والانبساط (س7، س11)  
  - Sensing/Intuition → س8  
  - Thinking/Feeling → س9  
  - Judging/Perceiving → س10  
- أجب على سؤال: هل هذا الاختلاف يؤدي إلى توازن؟ أم إلى تصادم؟

---

📌 **رابعًا: العوامل الثانوية (10٪)**  
- الاهتمامات المشتركة (س17)  
- النظرة للعلاقات العاطفية (س24)  
- عوامل سطحية أو ذوقية لا تؤثر بشكل عميق

---

🚫 **خامسًا: الخطوط الحمراء (Dealbreakers)**  
- إذا ذكر أحد الطرفين في سؤال 25 صفات يعتبرها "لا تُحتمل"، ووجدت تلك الصفات في الطرف الآخر ضمن إجاباته (مثلاً ذكر أنه يدخن أو لا يريد أطفال)، فذلك يُعتبر تضاد جوهري ويؤثر سلبًا على التوافق.
- التناقض بين الالتزام العاطفي (س24) والتوقعات أيضًا من عوامل الرفض القاطع.

---

❗ قبل إعطاء التقييم، اسأل نفسك:  
هل يمكن لهذين الشخصين التعايش اليومي بانسجام؟  
هل بينهما قيم وقواعد حياة مشتركة؟  
هل أسلوب تواصلهما يدعم العلاقة؟  
هل يوجد تضاد حاد في المبادئ أو التوقعات؟  
هل هناك نقاط تكمّل أم تصادُم؟

---

✅ **نصائح عند التحليل:**  
- كن ذكيًا في استنتاج الشخصية من الأسئلة المغلقة والمفتوحة.  
- بعض الناس يعبّرون بلباقة عن الأمور التي تهمهم بشدة.  
- لا تخلط بين التكمّل والاختلاف السلبي.  
- لا تفترض توافقًا عاليًا لمجرد وجود هوايات متشابهة.

---

أرجع النتائج فقط بصيغة JSON Array بهذا الشكل:

[
  { "a": 5, "b": 6, "score": 74, "reason": "كلاهما يفضل العزلة والتأمل" },
  { "a": 1, "b": 2, "score": 88, "reason": "يتشاركان في القيم والاهتمامات" }
]

بدون أي نص إضافي خارج JSON.
`.trim()


const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    { role: "system", content: systemMsg },
    { role: "user", content: prompt }
  ],
  temperature: 0.3
})*/

let gptMatches = []
try {
  let raw = response.choices?.[0]?.message?.content?.trim()
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```[a-z]*\s*/i, "").replace(/```$/, "").trim()
  }
  gptMatches = JSON.parse(raw)
} catch (e) {
  console.error("❌ Failed to parse GPT JSON:", e)
  return res.status(500).json({ error: "GPT response was not valid JSON." })
}

const scores = {}
for (const { a, b, score, reason } of gptMatches) {
  if (
    typeof a !== "number" || typeof b !== "number" ||
    typeof score !== "number" || typeof reason !== "string"
  ) continue
  const key = `${Math.min(a, b)}-${Math.max(a, b)}`
  scores[key] = { score, reason: reason.trim() }
}

const allPairs = Object.entries(scores).map(([key, val]) => {
  const [a, b] = key.split("-").map(Number)
  return { a, b, score: val.score, reason: val.reason }
})

