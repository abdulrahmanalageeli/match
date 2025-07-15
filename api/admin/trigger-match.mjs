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
    // If not in top matches, compare individual letters
    let sharedLetters = 0
    for (let i = 0; i < 4; i++) {
      if (type1[i] === type2[i]) {
        sharedLetters++
      }
    }
    
    // Score based on shared letters
    if (sharedLetters === 3) {
      return 10 // 3 letters shared gets 10%
    } else if (sharedLetters === 2) {
      return 5 // 2 letters shared gets 5%
    } else if (sharedLetters === 1) {
      return 2.5 // 1 letter shared gets 2.5%
    } else {
      return 0 // No letters shared gets 0%
    }
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
  
  // Calculate similarity with partial credit for adjacent choices
  let totalScore = 0
  for (let i = 0; i < 5; i++) {
    const val1 = prefs1[i]
    const val2 = prefs2[i]
    
    if (val1 === val2) {
      // Exact match = full points
      totalScore += 3
    } else if (
      (val1 === 'أ' && val2 === 'ب') || (val1 === 'ب' && val2 === 'أ') ||
      (val1 === 'ب' && val2 === 'ج') || (val1 === 'ج' && val2 === 'ب')
    ) {
      // Adjacent choices = partial points
      totalScore += 1.5
    } else {
      // Opposite choices (أ vs ج) = no points
      totalScore += 0
    }
  }
  
  return totalScore // Max 15% if all 5 match exactly
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
    // Get vibe descriptions (from top level or derive from answers)
    const aVibeDescription = participantA.survey_data?.vibeDescription || 
      participantA.survey_data?.answers?.vibe_1 || ""
    const aIdealPersonDescription = participantA.survey_data?.idealPersonDescription || 
      participantA.survey_data?.answers?.vibe_2 || ""
    const bVibeDescription = participantB.survey_data?.vibeDescription || 
      participantB.survey_data?.answers?.vibe_1 || ""
    const bIdealPersonDescription = participantB.survey_data?.idealPersonDescription || 
      participantB.survey_data?.answers?.vibe_2 || ""

    console.log(`🔍 Vibe descriptions for ${participantA.assigned_number} vs ${participantB.assigned_number}:`)
    console.log(`  Player ${participantA.assigned_number} vibe: "${aVibeDescription}"`)
    console.log(`  Player ${participantA.assigned_number} ideal: "${aIdealPersonDescription}"`)
    console.log(`  Player ${participantB.assigned_number} vibe: "${bVibeDescription}"`)
    console.log(`  Player ${participantB.assigned_number} ideal: "${bIdealPersonDescription}"`)

    if (!aVibeDescription || !aIdealPersonDescription || !bVibeDescription || !bIdealPersonDescription) {
      console.warn("❌ Missing vibe descriptions, using default score")
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

    // Debug: Log retrieved participant data
    console.log("🔍 Retrieved participants data:")
    participants.forEach(p => {
      console.log(`Player ${p.assigned_number}:`)
      console.log(`  - MBTI (column): ${p.mbti_personality_type}`)
      console.log(`  - Attachment (column): ${p.attachment_style}`)
      console.log(`  - Communication (column): ${p.communication_style}`)
      console.log(`  - Survey Data MBTI: ${p.survey_data?.mbtiType}`)
      console.log(`  - Survey Data Attachment: ${p.survey_data?.attachmentStyle}`)
      console.log(`  - Survey Data Communication: ${p.survey_data?.communicationStyle}`)
      console.log(`  - Survey Data Lifestyle: ${p.survey_data?.lifestylePreferences}`)
      console.log(`  - Survey Data Core Values: ${p.survey_data?.coreValues}`)
      console.log(`  - Survey Data Vibe: ${p.survey_data?.vibeDescription}`)
      console.log(`  - Survey Data Ideal: ${p.survey_data?.idealPersonDescription}`)
    })

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
      // Get lifestyle preferences (from top level or derive from answers)
      const aLifestyle = a.survey_data?.lifestylePreferences || 
        (a.survey_data?.answers ? 
          [a.survey_data.answers.lifestyle_1, a.survey_data.answers.lifestyle_2, a.survey_data.answers.lifestyle_3, a.survey_data.answers.lifestyle_4, a.survey_data.answers.lifestyle_5].join(',') : 
          null)
      const bLifestyle = b.survey_data?.lifestylePreferences || 
        (b.survey_data?.answers ? 
          [b.survey_data.answers.lifestyle_1, b.survey_data.answers.lifestyle_2, b.survey_data.answers.lifestyle_3, b.survey_data.answers.lifestyle_4, b.survey_data.answers.lifestyle_5].join(',') : 
          null)
      
      // Get core values (from top level or derive from answers)
      const aCoreValues = a.survey_data?.coreValues || 
        (a.survey_data?.answers ? 
          [a.survey_data.answers.core_values_1, a.survey_data.answers.core_values_2, a.survey_data.answers.core_values_3, a.survey_data.answers.core_values_4, a.survey_data.answers.core_values_5].join(',') : 
          null)
      const bCoreValues = b.survey_data?.coreValues || 
        (b.survey_data?.answers ? 
          [b.survey_data.answers.core_values_1, b.survey_data.answers.core_values_2, b.survey_data.answers.core_values_3, b.survey_data.answers.core_values_4, b.survey_data.answers.core_values_5].join(',') : 
          null)
      
      // Debug: Log the values being used for calculations
      console.log(`🔍 Values being used for calculations:`)
      console.log(`  Player ${a.assigned_number}: MBTI=${aMBTI}, Attachment=${aAttachment}, Communication=${aCommunication}`)
      console.log(`  Player ${a.assigned_number}: Lifestyle=${aLifestyle}, CoreValues=${aCoreValues}`)
      console.log(`  Player ${a.assigned_number}: Vibe=${a.survey_data?.vibeDescription || a.survey_data?.answers?.vibe_1 || 'missing'}, Ideal=${a.survey_data?.idealPersonDescription || a.survey_data?.answers?.vibe_2 || 'missing'}`)
      console.log(`  Player ${b.assigned_number}: MBTI=${bMBTI}, Attachment=${bAttachment}, Communication=${bCommunication}`)
      console.log(`  Player ${b.assigned_number}: Lifestyle=${bLifestyle}, CoreValues=${bCoreValues}`)
      console.log(`  Player ${b.assigned_number}: Vibe=${b.survey_data?.vibeDescription || b.survey_data?.answers?.vibe_1 || 'missing'}, Ideal=${b.survey_data?.idealPersonDescription || b.survey_data?.answers?.vibe_2 || 'missing'}`)
      
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
        aVibeDescription: a.survey_data?.vibeDescription || a.survey_data?.answers?.vibe_1 || '',
        bVibeDescription: b.survey_data?.vibeDescription || b.survey_data?.answers?.vibe_1 || '',
        aIdealPersonDescription: a.survey_data?.idealPersonDescription || a.survey_data?.answers?.vibe_2 || '',
        bIdealPersonDescription: b.survey_data?.idealPersonDescription || b.survey_data?.answers?.vibe_2 || ''
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
            compatibility_score: Math.round(pair.score),
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

