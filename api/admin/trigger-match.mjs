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
    // Get combined vibe descriptions from all 6 questions
    const aVibeDescription = participantA.survey_data?.vibeDescription || ""
    const bVibeDescription = participantB.survey_data?.vibeDescription || ""

    console.log(`🔍 Combined vibe profiles for ${participantA.assigned_number} vs ${participantB.assigned_number}:`)
    console.log(`  Player ${participantA.assigned_number} profile: "${aVibeDescription}"`)
    console.log(`  Player ${participantB.assigned_number} profile: "${bVibeDescription}"`)

    if (!aVibeDescription || !bVibeDescription) {
      console.warn("❌ Missing vibe descriptions, using default score")
      return 7 // Default average score
    }

    // Calculate mutual compatibility between the two combined profiles
    const compatibilityScore = await calculateCombinedVibeCompatibility(aVibeDescription, bVibeDescription)

    return compatibilityScore

  } catch (error) {
    console.error("🔥 Vibe compatibility calculation error:", error)
    return 7 // Default average score on error
  }
}

// Helper function to calculate combined vibe compatibility using AI
async function calculateCombinedVibeCompatibility(profileA, profileB) {
  try {
    const systemMessage = `أنت مساعد ذكي متخصص في تحليل التوافق الشخصي بين شخصين مع فهم عميق للثقافة العربية والسعودية.

مهمتك هي مقارنة ملفين شخصيين شاملين وتقييم مدى التوافق بينهما في الجوانب التالية:
- أسلوب قضاء عطلة نهاية الأسبوع
- الهوايات والاهتمامات
- الذوق الموسيقي والفني
- تفضيل المحادثات العميقة أم الخفيفة
- كيف يصفهم الأصدقاء
- كيف يصفون أصدقائهم

مبادئ التقييم الذكي:
1. **التوافق الموسيقي**: اعتبر الفنانين من نفس النوع أو الحقبة متوافقين (مثل: محمد عبده وخالد عبدالرحمن = طرب خليجي، أم كلثوم وعبد الحليم = طرب عربي كلاسيكي، Ed Sheeran وJohn Mayer = موسيقى غربية هادئة)

2. **الهوايات المتشابهة**: اعتبر الأنشطة المترابطة متوافقة (مثل: القراءة والكتابة، الرياضة واللياقة، الطبخ والتذوق، السفر والتصوير، الألعاب والتكنولوجيا)

3. **أسلوب نهاية الأسبوع**: اعتبر الأنشطة من نفس الطابع متوافقة (مثل: الأنشطة الاجتماعية معاً، الأنشطة الهادئة معاً، الأنشطة الخارجية معاً)

4. **الصفات الشخصية**: ابحث عن التكامل وليس فقط التشابه (مثل: شخص "مضحك" مع شخص "يحب الضحك"، شخص "قائد" مع شخص "متعاون"، شخص "هادئ" مع شخص "مستمع")

5. **المحادثات العميقة**: اعتبر "نعم" و"أحياناً" متوافقين نسبياً، و"لا" مع "نعم" أقل توافقاً

قواعد التقييم:
- إذا كان هناك تطابق كبير أو تكامل ممتاز في الاهتمامات والأسلوب: 12-15 نقطة
- إذا كان هناك تطابق جيد أو تشابه قوي مع بعض الاختلافات المكملة: 8-11 نقطة  
- إذا كان هناك تطابق متوسط أو تشابه في بعض الجوانب: 5-7 نقاط
- إذا كان هناك تطابق ضعيف أو إجابات غير مفيدة: 3-4 نقاط
- إذا كان هناك تعارض واضح في الاهتمامات والأسلوب: 0-2 نقطة

يجب أن تكون ذكياً في التقييم وتفهم السياق الثقافي والاجتماعي. ركز على التوافق الحقيقي والتكامل الشخصي.

أرجع رقماً فقط من 0 إلى 15 بدون أي نص إضافي.`

    const userMessage = `الملف الشخصي للشخص الأول: "${profileA}"

الملف الشخصي للشخص الثاني: "${profileB}"

قيّم التوافق الشخصي بينهما من 0 إلى 15:`

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

// Function to create groups of 4 (or 3) based on MBTI compatibility
async function generateGroupMatches(participants, match_id) {
  console.log("🎯 Starting group matching for", participants.length, "participants")
  
  if (participants.length < 3) {
    throw new Error("Need at least 3 participants for group matching")
  }

  // Calculate MBTI compatibility scores for all pairs
  const pairScores = []
  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      const a = participants[i]
      const b = participants[j]
      
      const aMBTI = a.mbti_personality_type || a.survey_data?.mbtiType
      const bMBTI = b.mbti_personality_type || b.survey_data?.mbtiType
      
      const mbtiScore = calculateMBTICompatibility(aMBTI, bMBTI)
      
      pairScores.push({
        participants: [a.assigned_number, b.assigned_number],
        score: mbtiScore,
        aMBTI,
        bMBTI
      })
    }
  }

  // Sort pairs by MBTI compatibility (descending)
  pairScores.sort((a, b) => b.score - a.score)
  
  console.log("📊 Top MBTI compatibility pairs:")
  pairScores.slice(0, 10).forEach(pair => {
    console.log(`  ${pair.participants[0]} × ${pair.participants[1]}: ${pair.score}% (${pair.aMBTI} × ${pair.bMBTI})`)
  })

  // Group formation algorithm
  const groups = []
  const usedParticipants = new Set()
  const participantNumbers = participants.map(p => p.assigned_number)
  
  // Try to form groups of 4 first
  while (participantNumbers.filter(p => !usedParticipants.has(p)).length >= 4) {
    const availableParticipants = participantNumbers.filter(p => !usedParticipants.has(p))
    const group = findBestGroup(availableParticipants, pairScores, 4)
    
    if (group) {
      groups.push(group)
      group.forEach(p => usedParticipants.add(p))
      console.log(`✅ Created group of 4: [${group.join(', ')}]`)
    } else {
      // If we can't find a good group of 4, try 3
      break
    }
  }
  
  // Handle remaining participants
  const remainingParticipants = participantNumbers.filter(p => !usedParticipants.has(p))
  
  if (remainingParticipants.length >= 3) {
    if (remainingParticipants.length === 3) {
      // Perfect group of 3
      groups.push(remainingParticipants)
      console.log(`✅ Created group of 3: [${remainingParticipants.join(', ')}]`)
    } else if (remainingParticipants.length === 4) {
      // Perfect group of 4
      groups.push(remainingParticipants)
      console.log(`✅ Created group of 4: [${remainingParticipants.join(', ')}]`)
    } else if (remainingParticipants.length === 5) {
      // Split into 3 + 2, but merge the 2 with the smallest existing group
      const bestGroup3 = findBestGroup(remainingParticipants, pairScores, 3)
      if (bestGroup3) {
        groups.push(bestGroup3)
        console.log(`✅ Created group of 3: [${bestGroup3.join(', ')}]`)
        
        const remaining2 = remainingParticipants.filter(p => !bestGroup3.includes(p))
        // Find the smallest existing group and merge
        if (groups.length > 1) {
          const smallestGroupIndex = groups.findIndex(g => g.length === 3)
          if (smallestGroupIndex !== -1 && smallestGroupIndex !== groups.length - 1) {
            groups[smallestGroupIndex].push(...remaining2)
            console.log(`✅ Merged 2 participants into existing group: [${groups[smallestGroupIndex].join(', ')}]`)
          } else {
            groups.push(remaining2)
            console.log(`⚠️ Created small group of 2: [${remaining2.join(', ')}]`)
          }
        } else {
          groups.push(remaining2)
          console.log(`⚠️ Created small group of 2: [${remaining2.join(', ')}]`)
        }
      } else {
        groups.push(remainingParticipants)
        console.log(`✅ Created group of 5: [${remainingParticipants.join(', ')}]`)
      }
    } else {
      // More than 5 remaining - try to split optimally
      const bestGroup4 = findBestGroup(remainingParticipants, pairScores, 4)
      if (bestGroup4) {
        groups.push(bestGroup4)
        console.log(`✅ Created group of 4: [${bestGroup4.join(', ')}]`)
        const stillRemaining = remainingParticipants.filter(p => !bestGroup4.includes(p))
        if (stillRemaining.length >= 3) {
          groups.push(stillRemaining)
          console.log(`✅ Created final group: [${stillRemaining.join(', ')}]`)
        } else {
          // Merge with existing group
          if (groups.length > 1) {
            const targetGroup = groups.find(g => g.length === 3)
            if (targetGroup) {
              targetGroup.push(...stillRemaining)
              console.log(`✅ Merged remaining participants: [${targetGroup.join(', ')}]`)
            } else {
              groups.push(stillRemaining)
              console.log(`⚠️ Created small final group: [${stillRemaining.join(', ')}]`)
            }
          }
        }
      } else {
        groups.push(remainingParticipants)
        console.log(`✅ Created large group: [${remainingParticipants.join(', ')}]`)
      }
    }
  } else if (remainingParticipants.length > 0) {
    // Less than 3 remaining - merge with existing groups
    if (groups.length > 0) {
      const targetGroup = groups.find(g => g.length === 3) || groups[0]
      targetGroup.push(...remainingParticipants)
      console.log(`✅ Merged remaining ${remainingParticipants.length} participants into existing group: [${targetGroup.join(', ')}]`)
    } else {
      groups.push(remainingParticipants)
      console.log(`⚠️ Created small group: [${remainingParticipants.join(', ')}]`)
    }
  }

  console.log(`📋 Final groups: ${groups.length} groups created`)
  groups.forEach((group, index) => {
    console.log(`  Group ${index + 1}: [${group.join(', ')}] (${group.length} participants)`)
  })

  // Convert groups to database format
  const groupMatches = []
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]
    const groupScore = calculateGroupMBTIScore(group, pairScores)
    
    // Create match record with participant_c_number and participant_d_number
    const matchRecord = {
      participant_a_number: group[0] || null,
      participant_b_number: group[1] || null,
      participant_c_number: group[2] || null,
      participant_d_number: group[3] || null,
      compatibility_score: Math.round(groupScore),
      reason: `مجموعة من ${group.length} أشخاص بتوافق MBTI عالي (${Math.round(groupScore)}%)`,
      match_id,
      round: 0, // Group phase
      group_number: i + 1,
      table_number: i + 1,
      is_repeat_match: false,
      // Add personality data for all participants
      participant_a_mbti_type: participants.find(p => p.assigned_number === group[0])?.mbti_personality_type || participants.find(p => p.assigned_number === group[0])?.survey_data?.mbtiType,
      participant_b_mbti_type: participants.find(p => p.assigned_number === group[1])?.mbti_personality_type || participants.find(p => p.assigned_number === group[1])?.survey_data?.mbtiType,
      // We'll store group info in the reason field for now since we don't have dedicated group columns for C and D personality types
      mbti_compatibility_score: groupScore,
      attachment_compatibility_score: 0,
      communication_compatibility_score: 0,
      lifestyle_compatibility_score: 0,
      core_values_compatibility_score: 0,
      vibe_compatibility_score: 0
    }
    
    groupMatches.push(matchRecord)
  }

  return groupMatches
}

// Helper function to find the best group of specified size
function findBestGroup(availableParticipants, pairScores, targetSize) {
  if (availableParticipants.length < targetSize) return null
  
  // For groups of 3 or 4, we want to maximize the sum of MBTI compatibility scores
  let bestGroup = null
  let bestScore = -1
  
  // Generate all combinations of the target size
  const combinations = getCombinations(availableParticipants, targetSize)
  
  for (const combination of combinations) {
    const score = calculateGroupMBTIScore(combination, pairScores)
    if (score > bestScore) {
      bestScore = score
      bestGroup = combination
    }
  }
  
  return bestGroup
}

// Helper function to calculate group MBTI compatibility score
function calculateGroupMBTIScore(group, pairScores) {
  let totalScore = 0
  let pairCount = 0
  
  // Sum up all pairwise MBTI scores within the group
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const pair = pairScores.find(p => 
        (p.participants[0] === group[i] && p.participants[1] === group[j]) ||
        (p.participants[0] === group[j] && p.participants[1] === group[i])
      )
      if (pair) {
        totalScore += pair.score
        pairCount++
      }
    }
  }
  
  return pairCount > 0 ? totalScore / pairCount : 0
}

// Helper function to generate combinations
function getCombinations(arr, size) {
  if (size === 1) return arr.map(item => [item])
  if (size === arr.length) return [arr]
  if (size > arr.length) return []
  
  const combinations = []
  
  function backtrack(start, current) {
    if (current.length === size) {
      combinations.push([...current])
      return
    }
    
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i])
      backtrack(i + 1, current)
      current.pop()
    }
  }
  
  backtrack(0, [])
  return combinations
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  const { skipAI = false, matchType = "individual" } = req.body || {}
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

    // Handle group matching
    if (matchType === "group") {
      console.log("🎯 Group matching requested")
      
      if (participants.length < 3) {
        return res.status(400).json({ error: "Need at least 3 participants for group matching" })
      }

      const groupMatches = await generateGroupMatches(participants, match_id)

      // Clear existing group matches
      console.log("🗑️ Clearing existing group matches for match_id:", match_id)
      const { error: deleteError } = await supabase
        .from("match_results")
        .delete()
        .eq("match_id", match_id)
        .eq("round", 0) // Group phase round

      if (deleteError) {
        console.error("🔥 Error clearing existing group matches:", deleteError)
        throw deleteError
      }

      // Insert new group matches
      console.log("💾 Inserting", groupMatches.length, "group matches")
      const { error: insertError } = await supabase
        .from("match_results")
        .insert(groupMatches)

      if (insertError) {
        console.error("🔥 Error inserting group matches:", insertError)
        throw insertError
      }

      return res.status(200).json({
        message: `✅ Group matching complete - created ${groupMatches.length} groups`,
        count: groupMatches.length,
        results: groupMatches,
        groups: groupMatches.map(match => ({
          group_number: match.group_number,
          participants: [match.participant_a_number, match.participant_b_number, match.participant_c_number, match.participant_d_number].filter(p => p !== null),
          score: match.compatibility_score,
          table_number: match.table_number
        }))
      })
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
      console.log(`  Player ${a.assigned_number}: Combined Vibe Profile=${a.survey_data?.vibeDescription || 'missing'}`)
      console.log(`  Player ${b.assigned_number}: MBTI=${bMBTI}, Attachment=${bAttachment}, Communication=${bCommunication}`)
      console.log(`  Player ${b.assigned_number}: Lifestyle=${bLifestyle}, CoreValues=${bCoreValues}`)
      console.log(`  Player ${b.assigned_number}: Combined Vibe Profile=${b.survey_data?.vibeDescription || 'missing'}`)
      
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
      const vibeScore = skipAI ? 15 : await calculateVibeCompatibility(a, b)
      console.log(`✨ Vibe Compatibility - Player ${a.assigned_number} vs Player ${b.assigned_number}: ${vibeScore}% ${skipAI ? '(AI skipped)' : ''}`)
      
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
        bVibeDescription: b.survey_data?.vibeDescription || ''
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

    // --- ROUND-ROBIN GLOBAL COMPATIBILITY MATCHING (CONFIGURABLE ROUNDS) ---
    console.log("🔄 Starting round-robin matching for", numbers.length, "participants")
    const finalMatches = []
    const matchedPairs = new Set() // Track pairs matched in any round
    const participantCount = numbers.length
    
    // Get total rounds from environment or database
    let rounds = 2 // Default fallback
    try {
      const { data: eventState, error: eventError } = await supabase
        .from("event_state")
        .select("total_rounds")
        .eq("match_id", match_id)
        .single()
      
      if (!eventError && eventState?.total_rounds) {
        rounds = eventState.total_rounds
      }
    } catch (err) {
      console.warn("Could not fetch total_rounds from database, using default:", rounds)
    }
    
    console.log(`🎯 Using ${rounds} rounds for matching`)

    for (let round = 1; round <= rounds; round++) {
      console.log(`\n🎯 === ROUND ${round} MATCHING ===`)
      const used = new Set() // Track participants matched in this round
      const roundMatches = []
      // Sort all pairs globally by score (descending)
      const sortedPairs = [...compatibilityScores].sort((a, b) => b.score - a.score)
      
      console.log(`📊 Available pairs for round ${round}:`, sortedPairs.length)
      
      for (const pair of sortedPairs) {
        const key = `${Math.min(pair.a, pair.b)}-${Math.max(pair.a, pair.b)}`
        if (
          !used.has(pair.a) &&
          !used.has(pair.b) &&
          !matchedPairs.has(key)
        ) {
          console.log(`✅ Matching pair in round ${round}: ${pair.a} × ${pair.b} (score: ${pair.score}%)`)
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
            is_repeat_match: false,
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
      // Handle unmatched participants
      const unmatched = numbers.filter(n => !used.has(n))
      console.log(`👥 Round ${round} matched participants:`, Array.from(used).sort((a, b) => a - b))
      console.log(`🔍 Round ${round} unmatched participants:`, unmatched)
      
      if (unmatched.length === 1) {
        // Find the best available match for the unmatched participant, even if it's a repeat
        const unmatchedParticipant = unmatched[0]
        let bestRepeatMatch = null
        let bestRepeatScore = -1
        
        // Look through all compatibility scores to find the best repeat match
        for (const pair of compatibilityScores) {
          if ((pair.a === unmatchedParticipant || pair.b === unmatchedParticipant)) {
            // This is a potential repeat match - find the other participant
            const otherParticipant = pair.a === unmatchedParticipant ? pair.b : pair.a
            
            // Check if the other participant is available (not used in this round)
            if (!used.has(otherParticipant) && pair.score > bestRepeatScore) {
              bestRepeatScore = pair.score
              bestRepeatMatch = {
                participant_a_number: Math.min(unmatchedParticipant, otherParticipant),
                participant_b_number: Math.max(unmatchedParticipant, otherParticipant),
                compatibility_score: Math.round(pair.score),
                reason: `تكرار المباراة من الجولة السابقة. يمكنك أخذ استراحة أو إعادة الجلوس مع نفس الشريك. ${pair.reason}`,
                match_id,
                round,
                is_repeat_match: true,
                // Add personality type data
                participant_a_mbti_type: pair.a === unmatchedParticipant ? pair.aMBTI : pair.bMBTI,
                participant_b_mbti_type: pair.a === unmatchedParticipant ? pair.bMBTI : pair.aMBTI,
                participant_a_attachment_style: pair.a === unmatchedParticipant ? pair.aAttachment : pair.bAttachment,
                participant_b_attachment_style: pair.a === unmatchedParticipant ? pair.bAttachment : pair.aAttachment,
                participant_a_communication_style: pair.a === unmatchedParticipant ? pair.aCommunication : pair.bCommunication,
                participant_b_communication_style: pair.a === unmatchedParticipant ? pair.bCommunication : pair.aCommunication,
                participant_a_lifestyle_preferences: pair.a === unmatchedParticipant ? pair.aLifestyle : pair.bLifestyle,
                participant_b_lifestyle_preferences: pair.a === unmatchedParticipant ? pair.bLifestyle : pair.aLifestyle,
                participant_a_core_values: pair.a === unmatchedParticipant ? pair.aCoreValues : pair.bCoreValues,
                participant_b_core_values: pair.a === unmatchedParticipant ? pair.bCoreValues : pair.aCoreValues,
                participant_a_vibe_description: pair.a === unmatchedParticipant ? pair.aVibeDescription : pair.bVibeDescription,
                participant_b_vibe_description: pair.a === unmatchedParticipant ? pair.bVibeDescription : pair.aVibeDescription,
                // Add score breakdown
                mbti_compatibility_score: pair.mbtiScore,
                attachment_compatibility_score: pair.attachmentScore,
                communication_compatibility_score: pair.communicationScore,
                lifestyle_compatibility_score: pair.lifestyleScore,
                core_values_compatibility_score: pair.coreValuesScore,
                vibe_compatibility_score: pair.vibeScore
              }
            }
          }
        }
        
        if (bestRepeatMatch) {
          console.log(`🔄 Adding repeat match for participant ${unmatchedParticipant} in round ${round}: ${bestRepeatMatch.participant_a_number} × ${bestRepeatMatch.participant_b_number} (score: ${bestRepeatMatch.compatibility_score}%)`)
          roundMatches.push(bestRepeatMatch)
        } else {
          // Fallback to organizer match if no repeat match found
          console.log(`🎯 Adding organizer match for participant ${unmatchedParticipant} in round ${round}`)
          roundMatches.push({
            participant_a_number: unmatchedParticipant,  // The actual participant
            participant_b_number: 9999,                  // Use 9999 to represent organizer
            compatibility_score: 0,
            reason: "لم نجد شريكاً مناسباً. سيجلس مع المنظم.",
            match_id,
            round,
            is_repeat_match: false
          })
        }
      } else if (unmatched.length > 1) {
        console.warn(`⚠️ Multiple unmatched participants in round ${round}:`, unmatched)
        // Try to match the remaining participants with repeats if possible
        for (const unmatchedParticipant of unmatched) {
          let bestRepeatMatch = null
          let bestRepeatScore = -1
          
          for (const pair of compatibilityScores) {
            if ((pair.a === unmatchedParticipant || pair.b === unmatchedParticipant)) {
              const otherParticipant = pair.a === unmatchedParticipant ? pair.b : pair.a
              
              // Check if the other participant is available (not used in this round)
              if (!used.has(otherParticipant) && pair.score > bestRepeatScore) {
                bestRepeatScore = pair.score
                bestRepeatMatch = {
                  participant_a_number: Math.min(unmatchedParticipant, otherParticipant),
                  participant_b_number: Math.max(unmatchedParticipant, otherParticipant),
                  compatibility_score: Math.round(pair.score),
                  reason: `تكرار المباراة من الجولة السابقة. يمكنك أخذ استراحة أو إعادة الجلوس مع نفس الشريك. ${pair.reason}`,
                  match_id,
                  round,
                  is_repeat_match: true,
                  // Add personality type data
                  participant_a_mbti_type: pair.a === unmatchedParticipant ? pair.aMBTI : pair.bMBTI,
                  participant_b_mbti_type: pair.a === unmatchedParticipant ? pair.bMBTI : pair.aMBTI,
                  participant_a_attachment_style: pair.a === unmatchedParticipant ? pair.aAttachment : pair.bAttachment,
                  participant_b_attachment_style: pair.a === unmatchedParticipant ? pair.bAttachment : pair.aAttachment,
                  participant_a_communication_style: pair.a === unmatchedParticipant ? pair.aCommunication : pair.bCommunication,
                  participant_b_communication_style: pair.a === unmatchedParticipant ? pair.bCommunication : pair.aCommunication,
                  participant_a_lifestyle_preferences: pair.a === unmatchedParticipant ? pair.aLifestyle : pair.bLifestyle,
                  participant_b_lifestyle_preferences: pair.a === unmatchedParticipant ? pair.bLifestyle : pair.aLifestyle,
                  participant_a_core_values: pair.a === unmatchedParticipant ? pair.aCoreValues : pair.bCoreValues,
                  participant_b_core_values: pair.a === unmatchedParticipant ? pair.bCoreValues : pair.aCoreValues,
                  participant_a_vibe_description: pair.a === unmatchedParticipant ? pair.aVibeDescription : pair.bVibeDescription,
                  participant_b_vibe_description: pair.a === unmatchedParticipant ? pair.bVibeDescription : pair.aVibeDescription,
                  // Add score breakdown
                  mbti_compatibility_score: pair.mbtiScore,
                  attachment_compatibility_score: pair.attachmentScore,
                  communication_compatibility_score: pair.communicationScore,
                  lifestyle_compatibility_score: pair.lifestyleScore,
                  core_values_compatibility_score: pair.coreValuesScore,
                  vibe_compatibility_score: pair.vibeScore
                }
              }
            }
          }
          
          if (bestRepeatMatch) {
            console.log(`🔄 Adding repeat match for participant ${unmatchedParticipant} in round ${round}: ${bestRepeatMatch.participant_a_number} × ${bestRepeatMatch.participant_b_number} (score: ${bestRepeatMatch.compatibility_score}%)`)
            roundMatches.push(bestRepeatMatch)
            used.add(bestRepeatMatch.participant_a_number)
            used.add(bestRepeatMatch.participant_b_number)
          } else {
            // Fallback to organizer match
            console.log(`🎯 Adding organizer match for participant ${unmatchedParticipant} in round ${round}`)
            roundMatches.push({
              participant_a_number: unmatchedParticipant,  // The actual participant
              participant_b_number: 9999,                  // Use 9999 to represent organizer
              compatibility_score: 0,
              reason: "لم نجد شريكاً مناسباً. سيجلس مع المنظم.",
              match_id,
              round,
              is_repeat_match: false
            })
            used.add(unmatchedParticipant)
          }
        }
      }
      
      console.log(`📋 Round ${round} final matches:`, roundMatches.length)
      roundMatches.forEach(match => {
        console.log(`  - ${match.participant_a_number} × ${match.participant_b_number} (${match.compatibility_score}%)`)
      })
      
      finalMatches.push(...roundMatches)
    }

    // Clear existing matches before inserting new ones to prevent duplicates
    console.log("🗑️ Clearing existing matches for match_id:", match_id)
    const { error: deleteError } = await supabase
      .from("match_results")
      .delete()
      .eq("match_id", match_id)

    if (deleteError) {
      console.error("🔥 Error clearing existing matches:", deleteError)
      throw deleteError
    }

    console.log("💾 Inserting", finalMatches.length, "new matches")
    const { error: insertError } = await supabase
      .from("match_results")
      .insert(finalMatches)

    if (insertError) {
      console.error("🔥 Error inserting matches:", insertError)
      throw insertError
    }

    return res.status(200).json({
      message: `✅ Matching complete for ${rounds} rounds (MBTI + Attachment + Communication + Lifestyle + Core Values + Vibe${skipAI ? ' - AI skipped' : ''})`,
      count: finalMatches.length,
      results: finalMatches
    })

  } catch (err) {
    console.error("🔥 Matching error:", err)
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
}

