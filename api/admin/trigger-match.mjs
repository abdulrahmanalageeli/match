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

// Function to validate if participant has complete data for matching
function isParticipantComplete(participant) {
  // Check if participant has survey_data (not null and not empty object)
  if (!participant.survey_data || 
      typeof participant.survey_data !== 'object' || 
      Object.keys(participant.survey_data).length === 0) {
    console.log(`❌ Participant ${participant.assigned_number}: Missing or empty survey_data`)
    return false
  }

  console.log(`✅ Participant ${participant.assigned_number}: Has survey_data`)
  return true
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

// NEW: Refined attachment scoring with penalties for immediate chemistry
function calculateRefinedAttachmentScore(style1, style2) {
  if (!style1 || !style2) {
    return 8 // Default 8% out of 15% if no attachment data
  }
  
  // PENALTY: Anxious + Avoidant pairing (kills immediate chemistry)
  if ((style1 === 'Anxious' && style2 === 'Avoidant') || 
      (style1 === 'Avoidant' && style2 === 'Anxious')) {
    return 0 // 0% for the problematic anxious-avoidant trap
  }
  
  // BONUS: Secure with anyone (creates safe space for chemistry)
  if (style1 === 'Secure' || style2 === 'Secure') {
    return 15 // Full 15% when at least one is secure
  }
  
  // ACCEPTABLE: Same insecure types (understand each other)
  if (style1 === style2 && (style1 === 'Anxious' || style1 === 'Avoidant' || style1 === 'Fearful')) {
    return 10 // 10% for same insecure types
  }
  
  // DEFAULT: Other combinations
  return 5 // 5% for other mixed insecure combinations
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

// Function to check gender compatibility (opposite gender by default, same-gender only with mutual preference)
function checkGenderCompatibility(participantA, participantB) {
  const genderA = participantA.gender || participantA.survey_data?.gender
  const genderB = participantB.gender || participantB.survey_data?.gender
  const sameGenderPrefA = participantA.same_gender_preference || participantA.survey_data?.answers?.same_gender_preference?.includes('yes')
  const sameGenderPrefB = participantB.same_gender_preference || participantB.survey_data?.answers?.same_gender_preference?.includes('yes')
  
  // If gender information is missing, allow the match (fallback)
  if (!genderA || !genderB) {
    console.warn(`⚠️ Missing gender info for participants ${participantA.assigned_number} or ${participantB.assigned_number}`)
    return true
  }
  
  // Check same-gender preferences - BOTH must have same-gender preference for same-gender matching
  if (sameGenderPrefA && sameGenderPrefB) {
    // Both want same-gender matching, they must be same gender
    const isCompatible = genderA === genderB
    if (isCompatible) {
      console.log(`✅ Same-gender match: ${participantA.assigned_number} (${genderA}) × ${participantB.assigned_number} (${genderB}) - both prefer same gender`)
    } else {
      console.log(`🚫 Same-gender preference mismatch: ${participantA.assigned_number} (${genderA}) × ${participantB.assigned_number} (${genderB}) - both prefer same gender but different genders`)
    }
    return isCompatible
  }
  
  // If only one has same-gender preference, they're incompatible
  if (sameGenderPrefA || sameGenderPrefB) {
    console.log(`🚫 Preference mismatch: ${participantA.assigned_number} (${genderA}, same-gender: ${sameGenderPrefA}) × ${participantB.assigned_number} (${genderB}, same-gender: ${sameGenderPrefB}) - only one prefers same gender`)
    return false
  }
  
  // Neither has same-gender preference - DEFAULT TO OPPOSITE GENDER ONLY
  const isOppositeGender = genderA !== genderB
  if (isOppositeGender) {
    console.log(`✅ Opposite gender match: ${participantA.assigned_number} (${genderA}) × ${participantB.assigned_number} (${genderB}) - default opposite gender matching`)
  } else {
    console.log(`🚫 Same gender without preference: ${participantA.assigned_number} (${genderA}) × ${participantB.assigned_number} (${genderB}) - both same gender but no same-gender preference`)
  }
  return isOppositeGender
}

// Function to check age compatibility (females must be within 3 years of their match)
function checkAgeCompatibility(participantA, participantB) {
  const ageA = participantA.age || participantA.survey_data?.age
  const ageB = participantB.age || participantB.survey_data?.age
  const genderA = participantA.gender || participantA.survey_data?.gender
  const genderB = participantB.gender || participantB.survey_data?.gender
  
  // If age information is missing, allow the match (fallback)
  if (!ageA || !ageB) {
    console.warn(`⚠️ Missing age info for participants ${participantA.assigned_number} or ${participantB.assigned_number}`)
    return true
  }
  
  // Apply age constraint if any participant is female (including same-gender female matches)
  const hasFemale = genderA === 'female' || genderB === 'female'
  
  if (hasFemale) {
    const ageDifference = Math.abs(ageA - ageB)
    const isCompatible = ageDifference <= 5
    
    if (!isCompatible) {
      console.log(`🚫 Age mismatch: ${participantA.assigned_number} (${ageA}, ${genderA}) vs ${participantB.assigned_number} (${ageB}, ${genderB}) - ${ageDifference} years apart`)
    } else {
      console.log(`✅ Age compatible: ${participantA.assigned_number} (${ageA}, ${genderA}) vs ${participantB.assigned_number} (${ageB}, ${genderB}) - ${ageDifference} years apart`)
    }
    
    return isCompatible
  }
  
  // If no female participant, no age constraint applies
  return true
}

// Function to calculate vibe compatibility using AI (up to 15% of total)
async function calculateVibeCompatibility(participantA, participantB) {
  try {
    // Get combined vibe descriptions from all 6 questions
    const aVibeDescription = participantA.survey_data?.vibeDescription || ""
    const bVibeDescription = participantB.survey_data?.vibeDescription || ""


    if (!aVibeDescription || !bVibeDescription) {
      console.warn("❌ Missing vibe descriptions, using default score")
      return 9 // Default higher score to be more lenient
    }

    // Calculate mutual compatibility between the two combined profiles
    const compatibilityScore = await calculateCombinedVibeCompatibility(aVibeDescription, bVibeDescription)

    return compatibilityScore

  } catch (error) {
    console.error("🔥 Vibe compatibility calculation error:", error)
    return 9 // Default higher score to be more lenient
  }
}

// Helper function to calculate combined vibe compatibility using AI
async function calculateCombinedVibeCompatibility(profileA, profileB) {
  try {
    const systemMessage = `أنت خبير في تحليل التوافق الفوري والكيمياء الأولى بين شخصين. مهمتك تحديد احتمالية "الكليك" الفوري والانجذاب الأولي، وليس التوافق طويل المدى.

ركز على العوامل التي تخلق الكيمياء الفورية والمحادثة الممتعة:

🎯 **أولوية قصوى - الاهتمامات المشتركة (40% من التقييم):**
- ابحث عن أي هوايات أو اهتمامات مشتركة (حتى لو مختلفة قليلاً)
- الموسيقى: أي تشابه في الأذواق أو الأنواع
- الأنشطة: أي تداخل في طريقة قضاء الوقت
- **مكافأة كبيرة**: إذا وجدت 2+ اهتمامات مشتركة = 12-15 نقطة فوراً

🗣️ **الطاقة الاجتماعية والمحادثة (35% من التقييم):**
- هل سيتدفق الحديث بسهولة؟
- ابحث عن توازن: شخص "اجتماعي/مرح" مع شخص "مستمع جيد"
- تجنب: اثنان "خجولان جداً" أو اثنان "جديان جداً"
- **مكافأة**: إذا أحدهما "مضحك" والآخر "يحب الضحك"

⚡ **الطاقة والشخصية (25% من التقييم):**
- هل شخصياتهما ستتناغم في أول 10 دقائق؟
- ابحث عن التكامل: "هادئ" + "ودود" = ممتاز
- تجنب: "جدي جداً" + "يحب المزاح" = صعب

🚨 **تجنب هذه التركيبات:**
- اثنان خجولان جداً (محادثة صعبة)
- اثنان جديان جداً (بدون مرح)
- شخص يحب "السوالف العميقة" + شخص يكره الفلسفة

✨ **نظام التقييم المحدث للكيمياء الفورية:**
- 13-15: اهتمامات مشتركة واضحة + توازن اجتماعي ممتاز
- 10-12: بعض الاهتمامات المشتركة + شخصيات متوافقة
- 7-9: اهتمام مشترك واحد أو توافق شخصي جيد
- 4-6: توافق محدود، لكن لا تعارض واضح
- 0-3: تعارض في الطاقة أو عدم وجود نقاط مشتركة

**هدفك**: هل سيستمتعان في أول 10 دقائق؟ هل سيجدان ما يتحدثان عنه؟ هل ستكون هناك كيمياء فورية؟

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
      return 9 // Default higher score to be more lenient
    }

    return score

  } catch (error) {
    console.error("🔥 AI compatibility calculation error:", error)
    return 9 // Default higher score to be more lenient
  }
}

// Function to create groups of 3-4 (or 5) based on MBTI compatibility, avoiding matched pairs
async function generateGroupMatches(participants, match_id, eventId) {
  console.log("🎯 Starting enhanced group matching for", participants.length, "total participants")
  
  // First, get existing individual matches to avoid putting matched pairs in same group
  console.log("🔍 Fetching existing individual matches to avoid pairing matched participants...")
  const { data: existingMatches, error: matchError } = await supabase
    .from("match_results")
    .select("participant_a_number, participant_b_number")
    .eq("match_id", match_id)
    .eq("event_id", eventId)
    .neq("participant_b_number", 9999) // Exclude organizer matches
    .neq("round", 0) // Exclude group matches (round 0 is for groups)
  
  if (matchError) {
    console.error("❌ Error fetching existing matches:", matchError)
  }
  
  const matchedPairs = new Set()
  if (existingMatches && existingMatches.length > 0) {
    existingMatches.forEach(match => {
      const pair = [match.participant_a_number, match.participant_b_number].sort().join('-')
      matchedPairs.add(pair)
      console.log(`   🚫 Avoiding pair: #${match.participant_a_number} ↔ #${match.participant_b_number}`)
    })
    console.log(`🚫 Found ${matchedPairs.size} matched pairs to avoid in groups`)
  } else {
    console.log("ℹ️ No existing individual matches found - proceeding with normal group formation")
  }
  
  // Helper function to check if two participants are matched
  const areMatched = (p1, p2) => {
    const pair = [p1, p2].sort().join('-')
    return matchedPairs.has(pair)
  }

  // Filter out participants who are matched with organizer (#9999), have no matches, or haven't paid
  const eligibleParticipants = participants.filter(p => {
    // Check payment status first
    if (!p.PAID_DONE) {
      console.log(`🚫 Excluding participant #${p.assigned_number} from groups - payment not completed (PAID_DONE = false)`)
      return false
    }

    // Check if this participant is matched with organizer
    const matchedWithOrganizer = existingMatches && existingMatches.some(match => 
      (match.participant_a_number === p.assigned_number && match.participant_b_number === 9999) ||
      (match.participant_b_number === p.assigned_number && match.participant_a_number === 9999)
    )
    
    if (matchedWithOrganizer) {
      console.log(`🚫 Excluding participant #${p.assigned_number} from groups - matched with organizer`)
      return false
    }

    // Also check if participant has any individual match at all
    const hasIndividualMatch = existingMatches && existingMatches.some(match => 
      (match.participant_a_number === p.assigned_number || match.participant_b_number === p.assigned_number) &&
      match.participant_a_number !== 9999 && match.participant_b_number !== 9999
    )
    
    if (!hasIndividualMatch) {
      console.log(`🚫 Excluding participant #${p.assigned_number} from groups - no individual match found`)
      return false
    }
    
    return true
  })

  console.log(`👥 ${eligibleParticipants.length} participants eligible for groups (excluded ${participants.length - eligibleParticipants.length} due to: payment not completed, no individual matches, or matched with organizer)`)
  
  if (eligibleParticipants.length < 3) {
    throw new Error(`Need at least 3 eligible participants for group matching. Found ${eligibleParticipants.length} eligible out of ${participants.length} total participants.`)
  }

  // Calculate MBTI compatibility scores for all pairs (with gender compatibility check)
  const pairScores = []
  for (let i = 0; i < eligibleParticipants.length; i++) {
    for (let j = i + 1; j < eligibleParticipants.length; j++) {
      const a = eligibleParticipants[i]
      const b = eligibleParticipants[j]
      
      // Check gender compatibility first (opposite gender only)
      if (!checkGenderCompatibility(a, b)) {
        console.log(`🚫 Skipping group pair ${a.assigned_number} × ${b.assigned_number} - same gender`)
        continue
      }
      
      // Check age compatibility (girls must be within 3 years)
      if (!checkAgeCompatibility(a, b)) {
        console.log(`🚫 Skipping group pair ${a.assigned_number} × ${b.assigned_number} - age constraint violation`)
        continue
      }
      
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

  // Enhanced group formation algorithm with fallback support
  const groups = []
  const usedParticipants = new Set()
  const participantNumbers = eligibleParticipants.map(p => p.assigned_number)
  
  // Phase 1: Form core groups of 4 first (avoiding matched pairs and ensuring gender balance)
  console.log("🔄 Phase 1: Creating core groups of 4 (avoiding matched pairs, ensuring gender balance)")
  while (participantNumbers.filter(p => !usedParticipants.has(p)).length >= 4) {
    const availableParticipants = participantNumbers.filter(p => !usedParticipants.has(p))
    let group = findBestGroupAvoidingMatches(availableParticipants, pairScores, 4, areMatched, eligibleParticipants)
    
    // Fallback: if no group can be formed avoiding matches, try with matches allowed
    if (!group && availableParticipants.length >= 4) {
      console.log("⚠️ No groups of 4 possible without matched pairs/gender balance - using fallback")
      group = findBestGroup(availableParticipants, pairScores, 4, eligibleParticipants)
    }
    
    if (group) {
      groups.push([...group]) // Create a copy to allow modification
      group.forEach(p => usedParticipants.add(p))
      console.log(`✅ Created core group of 4: [${group.join(', ')}]`)
    } else {
      break
    }
  }
  
  // Phase 2: Handle remaining participants (1-3 people)
  const remainingParticipants = participantNumbers.filter(p => !usedParticipants.has(p))
  console.log(`🔄 Phase 2: Handling ${remainingParticipants.length} remaining participants:`, remainingParticipants)
  
  if (remainingParticipants.length === 0) {
    // Perfect groups of 4
    console.log("✅ Perfect grouping achieved with groups of 4")
  } else if (remainingParticipants.length === 1) {
    // 1 extra person - add to most compatible group
    const extraParticipant = remainingParticipants[0]
    const bestGroupIndex = findMostCompatibleGroupForParticipant(extraParticipant, groups, pairScores)
    groups[bestGroupIndex].push(extraParticipant)
    console.log(`✅ Added participant ${extraParticipant} to group ${bestGroupIndex + 1}: [${groups[bestGroupIndex].join(', ')}]`)
  } else if (remainingParticipants.length === 2) {
    // 2 extra people - add both to most compatible group OR split between two groups
    const [extra1, extra2] = remainingParticipants
    
    // Check if we can add both to the same group (up to 6 people)
    const bestGroupForBoth = findMostCompatibleGroupForParticipants([extra1, extra2], groups, pairScores)
    
    if (groups[bestGroupForBoth].length <= 4) {
      // Add both to the same group
      groups[bestGroupForBoth].push(extra1, extra2)
      console.log(`✅ Added both participants ${extra1}, ${extra2} to group ${bestGroupForBoth + 1}: [${groups[bestGroupForBoth].join(', ')}]`)
          } else {
      // Split between two different groups
      const group1Index = findMostCompatibleGroupForParticipant(extra1, groups, pairScores)
      groups[group1Index].push(extra1)
      
      const group2Index = findMostCompatibleGroupForParticipant(extra2, groups.map((g, i) => i === group1Index ? [...g] : g), pairScores)
      groups[group2Index].push(extra2)
      
      console.log(`✅ Split participants: ${extra1} to group ${group1Index + 1}, ${extra2} to group ${group2Index + 1}`)
    }
  } else if (remainingParticipants.length === 3) {
    // 3 extra people - create a new group OR distribute among existing groups
    if (groups.length === 0) {
      // No existing groups, try to create a gender-balanced group of 3
      const group3 = findBestGroupAvoidingMatches(remainingParticipants, pairScores, 3, areMatched, eligibleParticipants)
      if (group3) {
        groups.push([...group3])
        console.log(`✅ Created new gender-balanced group of 3: [${group3.join(', ')}]`)
      } else {
        // Fallback: create group without gender balance requirement
        groups.push([...remainingParticipants])
        console.log(`⚠️ Created new group of 3 (no gender balance possible): [${remainingParticipants.join(', ')}]`)
      }
        } else {
      // Distribute among existing groups (up to 2 per group to max 6)
      const sortedByCompatibility = remainingParticipants.map(p => ({
        participant: p,
        bestGroupIndex: findMostCompatibleGroupForParticipant(p, groups, pairScores),
        score: calculateParticipantGroupCompatibility(p, groups[findMostCompatibleGroupForParticipant(p, groups, pairScores)], pairScores)
      })).sort((a, b) => b.score - a.score)
      
      for (const { participant, bestGroupIndex } of sortedByCompatibility) {
        if (groups[bestGroupIndex].length < 6) {
          groups[bestGroupIndex].push(participant)
          console.log(`✅ Added participant ${participant} to group ${bestGroupIndex + 1}: [${groups[bestGroupIndex].join(', ')}]`)
      } else {
          // Find another group with space
          const alternativeGroupIndex = groups.findIndex(g => g.length < 6)
          if (alternativeGroupIndex !== -1) {
            groups[alternativeGroupIndex].push(participant)
            console.log(`✅ Added participant ${participant} to alternative group ${alternativeGroupIndex + 1}: [${groups[alternativeGroupIndex].join(', ')}]`)
    } else {
            // Create new group if no space (shouldn't happen with proper distribution)
            groups.push([participant])
            console.log(`⚠️ Created single-person group for ${participant}`)
          }
        }
      }
    }
  }

  console.log(`🎯 Final groups (${groups.length} total):`);
  groups.forEach((group, index) => {
    console.log(`  Group ${index + 1}: [${group.join(', ')}] (${group.length} people)`);
  });

  // Convert groups to group_matches table format
  const groupMatches = []
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]
    const groupScore = calculateGroupMBTIScore(group, pairScores)
    
    // Assign table numbers: sequential numbering for groups
    const tableNumber = i + 1
    const groupNumber = i + 1
    const groupId = `group_${groupNumber}`
    
    // Get participant names for the group
    const participantNames = group.map(participantNum => {
      const participant = eligibleParticipants.find(p => p.assigned_number === participantNum)
      return participant?.survey_data?.name || `المشارك #${participantNum}`
    })
    
    // Create group match record for group_matches table
    const groupMatchRecord = {
      match_id,
      group_id: groupId,
      group_number: groupNumber,
      participant_numbers: group, // Array of participant numbers
      participant_names: participantNames, // Array of participant names
      compatibility_score: Math.round(groupScore),
      reason: `مجموعة من ${group.length} أشخاص بتوافق MBTI عالي (${Math.round(groupScore)}%)`,
      table_number: tableNumber,
      event_id: eventId,
      conversation_status: 'pending'
    }
    
    groupMatches.push(groupMatchRecord)
  }

  console.log(`💾 Generated ${groupMatches.length} group match records for group_matches table`);
  return groupMatches
}

// Helper function to find the best group of specified size, avoiding matched pairs and ensuring gender balance
function findBestGroupAvoidingMatches(availableParticipants, pairScores, targetSize, areMatched, eligibleParticipants) {
  if (availableParticipants.length < targetSize) return null
  
  // For groups of 3 or 4, we want to maximize the sum of MBTI compatibility scores
  // while avoiding putting matched pairs in the same group and ensuring gender balance
  let bestGroup = null
  let bestScore = -1
  
  // Generate all combinations of the target size
  const combinations = getCombinations(availableParticipants, targetSize)
  
  for (const combination of combinations) {
    // Check if this combination contains any matched pairs
    let hasMatchedPair = false
    for (let i = 0; i < combination.length; i++) {
      for (let j = i + 1; j < combination.length; j++) {
        if (areMatched(combination[i], combination[j])) {
          hasMatchedPair = true
          break
        }
      }
      if (hasMatchedPair) break
    }
    
    // Skip this combination if it contains matched pairs
    if (hasMatchedPair) {
      console.log(`🚫 Skipping group combination [${combination.join(', ')}] - contains matched pair`)
      continue
    }
    
    // Check gender balance - ensure we have both genders in the group
    const genders = combination.map(participantNum => {
      const participant = eligibleParticipants.find(p => p.assigned_number === participantNum)
      return participant?.gender || participant?.survey_data?.gender
    }).filter(Boolean)
    
    const maleCount = genders.filter(g => g === 'male').length
    const femaleCount = genders.filter(g => g === 'female').length
    
    // Skip if all same gender (we want mixed groups)
    if (maleCount === 0 || femaleCount === 0) {
      console.log(`🚫 Skipping group combination [${combination.join(', ')}] - no gender balance (${maleCount}M, ${femaleCount}F)`)
      continue
    }
    
    const score = calculateGroupMBTIScore(combination, pairScores)
    if (score > bestScore) {
      bestScore = score
      bestGroup = combination
      console.log(`✅ Better balanced group found [${combination.join(', ')}] - Score: ${score}%, Gender: ${maleCount}M/${femaleCount}F`)
    }
  }
  
  return bestGroup
}

// Helper function to find the best group of specified size (fallback version - allows matched pairs if needed)
function findBestGroup(availableParticipants, pairScores, targetSize, eligibleParticipants = null) {
  if (availableParticipants.length < targetSize) return null
  
  // For groups of 3 or 4, we want to maximize the sum of MBTI compatibility scores
  let bestGroup = null
  let bestScore = -1
  
  // Generate all combinations of the target size
  const combinations = getCombinations(availableParticipants, targetSize)
  
  for (const combination of combinations) {
    // If we have participant data, still try to prefer gender balance
    if (eligibleParticipants) {
      const genders = combination.map(participantNum => {
        const participant = eligibleParticipants.find(p => p.assigned_number === participantNum)
        return participant?.gender || participant?.survey_data?.gender
      }).filter(Boolean)
      
      const maleCount = genders.filter(g => g === 'male').length
      const femaleCount = genders.filter(g => g === 'female').length
      
      // Prefer groups with gender balance, but don't require it in fallback
      const hasGenderBalance = maleCount > 0 && femaleCount > 0
      const score = calculateGroupMBTIScore(combination, pairScores)
      const adjustedScore = hasGenderBalance ? score + 5 : score // Bonus for gender balance
      
      if (adjustedScore > bestScore) {
        bestScore = adjustedScore
        bestGroup = combination
      }
    } else {
      const score = calculateGroupMBTIScore(combination, pairScores)
      if (score > bestScore) {
        bestScore = score
        bestGroup = combination
      }
    }
  }
  
  return bestGroup
}

// Helper function to find the most compatible group for a single participant
function findMostCompatibleGroupForParticipant(participant, groups, pairScores) {
  let bestGroupIndex = 0
  let bestScore = -1
  
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].length >= 6) continue // Skip full groups
    
    const score = calculateParticipantGroupCompatibility(participant, groups[i], pairScores)
    if (score > bestScore) {
      bestScore = score
      bestGroupIndex = i
    }
  }
  
  return bestGroupIndex
}

// Helper function to find the most compatible group for multiple participants
function findMostCompatibleGroupForParticipants(participants, groups, pairScores) {
  let bestGroupIndex = 0
  let bestScore = -1
  
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].length + participants.length > 6) continue // Skip if would exceed capacity
    
    let totalScore = 0
    for (const participant of participants) {
      totalScore += calculateParticipantGroupCompatibility(participant, groups[i], pairScores)
    }
    const avgScore = totalScore / participants.length
    
    if (avgScore > bestScore) {
      bestScore = avgScore
      bestGroupIndex = i
    }
  }
  
  return bestGroupIndex
}

// Helper function to calculate how compatible a participant is with a group
function calculateParticipantGroupCompatibility(participant, group, pairScores) {
  if (group.length === 0) return 0
  
  let totalScore = 0
  let pairCount = 0
  
  for (const groupMember of group) {
    // Find compatibility score between participant and group member
    const pairScore = pairScores.find(pair => 
      (pair.participants[0] === participant && pair.participants[1] === groupMember) ||
      (pair.participants[0] === groupMember && pair.participants[1] === participant)
    )
    
    if (pairScore) {
      totalScore += pairScore.score
      pairCount++
    }
  }
  
  return pairCount > 0 ? totalScore / pairCount : 0
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

// Helper function to ensure organizer participant exists
async function ensureOrganizerParticipant(match_id) {
  const ORGANIZER_ID = 9999;
  
  // Check if organizer participant already exists
  const { data: existing, error: checkError } = await supabase
    .from("participants")
    .select("assigned_number")
    .eq("assigned_number", ORGANIZER_ID)
    .eq("match_id", match_id)
    .single();
    
  if (existing) {
    console.log("✅ Organizer participant already exists");
    return;
  }
  
  if (checkError && checkError.code !== 'PGRST116') {
    console.error("Error checking for organizer:", checkError);
    return;
  }
  
  // Create organizer participant
  console.log("🏢 Creating organizer participant...");
  const { error: insertError } = await supabase
    .from("participants")
    .insert([{
      assigned_number: ORGANIZER_ID,
      match_id: match_id,
      is_host: true, // Mark as organizer/host
    }]);
    
  if (insertError) {
    console.error("Error creating organizer participant:", insertError);
    throw new Error("Failed to create organizer participant");
  }
  
  console.log("✅ Organizer participant created successfully");
}

// Function to check if two participants have been matched before in previous events
async function havePreviousMatch(participantA, participantB, currentEventId) {
  try {
    const { data, error } = await supabase
      .from("match_results")
      .select("event_id")
      .lt("event_id", currentEventId) // Only check previous events
      .or(`and(participant_a_number.eq.${participantA},participant_b_number.eq.${participantB}),and(participant_a_number.eq.${participantB},participant_b_number.eq.${participantA})`)
      .limit(1)

    if (error) {
      console.error("Error checking previous matches:", error)
      return false // If error, assume no previous match
    }

    return data && data.length > 0
  } catch (err) {
    console.error("Error in havePreviousMatch:", err)
    return false
  }
}

// Function to get all previous matches for a participant across all events
async function getPreviousMatches(participantNumber, currentEventId) {
  try {
    const { data, error } = await supabase
      .from("match_results")
      .select("participant_a_number, participant_b_number, event_id")
      .lt("event_id", currentEventId) // Only check previous events
      .or(`participant_a_number.eq.${participantNumber},participant_b_number.eq.${participantNumber}`)

    if (error) {
      console.error("Error getting previous matches:", error)
      return []
    }

    // Extract the other participant numbers
    const previousPartners = data.map(match => 
      match.participant_a_number === participantNumber 
        ? match.participant_b_number 
        : match.participant_a_number
    )

    return [...new Set(previousPartners)] // Remove duplicates
  } catch (err) {
    console.error("Error in getPreviousMatches:", err)
    return []
  }
}

// Function to check if a pair is in the excluded pairs list
function isPairExcluded(participantA, participantB, excludedPairs) {
  if (!excludedPairs || excludedPairs.length === 0) {
    return false
  }
  
  return excludedPairs.some(pair => 
    (pair.participant1_number === participantA && pair.participant2_number === participantB) ||
    (pair.participant1_number === participantB && pair.participant2_number === participantA)
  )
}

// Function to check if a participant is in the excluded participants list
function isParticipantExcluded(participantNumber, excludedParticipants) {
  if (!excludedParticipants || excludedParticipants.length === 0) {
    return false
  }
  
  return excludedParticipants.some(participant => 
    participant.participant_number === participantNumber
  )
}

// Function to check if a pair is in the locked matches list
function isPairLocked(participantA, participantB, lockedPairs) {
  if (!lockedPairs || lockedPairs.length === 0) {
    return false
  }
  
  return lockedPairs.some(pair => 
    (pair.participant1_number === participantA && pair.participant2_number === participantB) ||
    (pair.participant1_number === participantB && pair.participant2_number === participantA)
  )
}

// Function to get locked match data for a pair
function getLockedMatch(participantA, participantB, lockedPairs) {
  if (!lockedPairs || lockedPairs.length === 0) {
    return null
  }
  
  return lockedPairs.find(pair => 
    (pair.participant1_number === participantA && pair.participant2_number === participantB) ||
    (pair.participant1_number === participantB && pair.participant2_number === participantA)
  )
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  const { skipAI = false, matchType = "individual", eventId = 1, excludedPairs = [], manualMatch = null } = req.body || {}
  const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

  try {
    // Ensure organizer participant exists for potential odd-participant matches
    await ensureOrganizerParticipant(match_id);

    // Fetch excluded participants from database
    const { data: excludedParticipants, error: excludedParticipantsError } = await supabase
      .from("excluded_participants")
      .select("participant_number")
      .eq("match_id", match_id)

    if (excludedParticipantsError) {
      console.error("Error fetching excluded participants:", excludedParticipantsError)
      // Continue without excluded participants rather than failing
    }
    
    const { data: allParticipants, error } = await supabase
      .from("participants")
      .select("assigned_number, survey_data, mbti_personality_type, attachment_style, communication_style, gender, age, same_gender_preference, PAID_DONE")
      .eq("match_id", match_id)
      .neq("assigned_number", 9999)  // Exclude organizer participant from matching

    if (error) throw error
    if (!allParticipants || allParticipants.length === 0) {
      return res.status(400).json({ error: "No participants found" })
    }

    // Filter out participants without complete data
    console.log(`🔍 Validating ${allParticipants.length} participants for complete data...`)
    const participants = allParticipants.filter(participant => {
      const isComplete = isParticipantComplete(participant)
      if (!isComplete) {
        console.log(`🚫 Excluding participant ${participant.assigned_number} from matching due to incomplete data`)
      }
      return isComplete
    })

    console.log(`✅ ${participants.length} participants have complete data (excluded ${allParticipants.length - participants.length} incomplete)`)

    // Filter out excluded participants
    let eligibleParticipants = participants
    if (excludedParticipants && excludedParticipants.length > 0) {
      console.log(`🚫 Checking for excluded participants: ${excludedParticipants.length} participants excluded from all matching`)
      excludedParticipants.forEach(excluded => {
        console.log(`   #${excluded.participant_number} - Excluded from ALL matching`)
      })
      
      const beforeCount = eligibleParticipants.length
      eligibleParticipants = eligibleParticipants.filter(participant => {
        const isExcluded = isParticipantExcluded(participant.assigned_number, excludedParticipants)
        if (isExcluded) {
          console.log(`🚫 Excluding participant ${participant.assigned_number} from matching - in excluded participants list`)
        }
        return !isExcluded
      })
      
      const excludedCount = beforeCount - eligibleParticipants.length
      if (excludedCount > 0) {
        console.log(`✅ Filtered out ${excludedCount} excluded participants (${eligibleParticipants.length} remaining eligible)`)
      }
    }

    // Handle manual match creation
    if (manualMatch) {
      console.log(`🎯 Manual match requested: #${manualMatch.participant1} ↔ #${manualMatch.participant2}`)
      
      // Find the two specific participants
      const p1 = eligibleParticipants.find(p => p.assigned_number === parseInt(manualMatch.participant1))
      const p2 = eligibleParticipants.find(p => p.assigned_number === parseInt(manualMatch.participant2))
      
      if (!p1 || !p2) {
        return res.status(400).json({ error: "One or both participants not found or not eligible" })
      }
      
      // Check if match already exists for this event
      const { data: existingMatch, error: existingError } = await supabase
        .from("match_results")
        .select("id")
        .eq("event_id", eventId)
        .or(`and(participant_a_number.eq.${p1.assigned_number},participant_b_number.eq.${p2.assigned_number}),and(participant_a_number.eq.${p2.assigned_number},participant_b_number.eq.${p1.assigned_number})`)

      if (existingMatch && existingMatch.length > 0) {
        return res.status(400).json({ error: "Match already exists for this event" })
      }
      
      // Extract values the same way as the main matching algorithm
      const p1MBTI = p1.mbti_personality_type || p1.survey_data?.mbtiType
      const p2MBTI = p2.mbti_personality_type || p2.survey_data?.mbtiType
      
      const p1Attachment = p1.attachment_style
      const p2Attachment = p2.attachment_style
      
      const p1Communication = p1.communication_style
      const p2Communication = p2.communication_style
      
      // Get lifestyle preferences (from top level or derive from answers)
      const p1Lifestyle = p1.survey_data?.lifestylePreferences || 
        (p1.survey_data?.answers ? 
          [p1.survey_data.answers.lifestyle_1, p1.survey_data.answers.lifestyle_2, p1.survey_data.answers.lifestyle_3, p1.survey_data.answers.lifestyle_4, p1.survey_data.answers.lifestyle_5].join(',') : 
          null)
      const p2Lifestyle = p2.survey_data?.lifestylePreferences || 
        (p2.survey_data?.answers ? 
          [p2.survey_data.answers.lifestyle_1, p2.survey_data.answers.lifestyle_2, p2.survey_data.answers.lifestyle_3, p2.survey_data.answers.lifestyle_4, p2.survey_data.answers.lifestyle_5].join(',') : 
          null)
      
      // Get core values (from top level or derive from answers)
      const p1CoreValues = p1.survey_data?.coreValues || 
        (p1.survey_data?.answers ? 
          [p1.survey_data.answers.core_values_1, p1.survey_data.answers.core_values_2, p1.survey_data.answers.core_values_3, p1.survey_data.answers.core_values_4, p1.survey_data.answers.core_values_5].join(',') : 
          null)
      const p2CoreValues = p2.survey_data?.coreValues || 
        (p2.survey_data?.answers ? 
          [p2.survey_data.answers.core_values_1, p2.survey_data.answers.core_values_2, p2.survey_data.answers.core_values_3, p2.survey_data.answers.core_values_4, p2.survey_data.answers.core_values_5].join(',') : 
          null)
      
      // Calculate compatibility using the same functions as automatic matching
      const mbtiScore = calculateMBTICompatibility(p1MBTI, p2MBTI)
      const attachmentScore = calculateAttachmentCompatibility(p1Attachment, p2Attachment)
      const communicationScore = calculateCommunicationCompatibility(p1Communication, p2Communication)
      const lifestyleScore = calculateLifestyleCompatibility(p1Lifestyle, p2Lifestyle)
      const coreValuesScore = calculateCoreValuesCompatibility(p1CoreValues, p2CoreValues)
      
      // Calculate vibe compatibility using AI (unless skipAI is true)
      let vibeScore = 7 // Default
      if (!skipAI) {
        try {
          vibeScore = await calculateVibeCompatibility(p1, p2)
        } catch (error) {
          console.error("Error calculating vibe compatibility for manual match:", error)
          vibeScore = 7
        }
      }
      
      // Calculate total compatibility using the NEW WEIGHTING SYSTEM
      // Enhanced Vibe: 35% | Communication: 25% | Refined Attachment: 15% | Lifestyle: 10% | Core Values: 10% | MBTI: 5%
      const enhancedVibeScore = Math.min(35, (vibeScore / 15) * 35)
      const refinedAttachmentScore = calculateRefinedAttachmentScore(p1Attachment, p2Attachment)
      const reducedMBTIScore = Math.min(5, (mbtiScore / 10) * 5)
      const reducedLifestyleScore = Math.min(10, (lifestyleScore / 15) * 10) 
      const reducedCoreValuesScore = Math.min(10, (coreValuesScore / 20) * 10)
      
      const totalCompatibility = Math.round(
        reducedMBTIScore + refinedAttachmentScore + communicationScore + reducedLifestyleScore + reducedCoreValuesScore + enhancedVibeScore
      )
      
      // Create match record
      const matchRecord = {
        match_id,
        event_id: eventId,
        participant_a_number: p1.assigned_number,
        participant_b_number: p2.assigned_number,
        compatibility_score: totalCompatibility,
        mbti_compatibility_score: mbtiScore,
        attachment_compatibility_score: attachmentScore,
        communication_compatibility_score: communicationScore,
        lifestyle_compatibility_score: lifestyleScore,
        core_values_compatibility_score: coreValuesScore,
        vibe_compatibility_score: vibeScore,
        round: 1,
        created_at: new Date().toISOString()
      }
      
      // Insert the match
      const { data: insertData, error: insertError } = await supabase
        .from("match_results")
        .insert([matchRecord])
        .select()

      if (insertError) {
        console.error("Error inserting manual match:", insertError)
        return res.status(500).json({ error: "Failed to create manual match" })
      }

      console.log(`✅ Manual match created: #${p1.assigned_number} ↔ #${p2.assigned_number} (Score: ${totalCompatibility}%)`)

      return res.status(200).json({
        success: true,
        message: `Manual match created successfully`,
        count: 1,
        compatibility_score: totalCompatibility,
        match: insertData[0],
        results: [{
          participant: p1.assigned_number,
          partner: p2.assigned_number,
          compatibility_score: totalCompatibility,
          mbti_compatibility_score: mbtiScore,
          attachment_compatibility_score: attachmentScore,
          communication_compatibility_score: communicationScore,
          lifestyle_compatibility_score: lifestyleScore,
          core_values_compatibility_score: coreValuesScore,
          vibe_compatibility_score: vibeScore
        }]
      })
    }

    // Note: Payment filtering is NOT applied to individual matching
    // This allows admins to see matches and send payment requests to both participants
    console.log(`ℹ️ Individual matching includes all participants regardless of payment status for admin visibility`)

    if (eligibleParticipants.length < 2) {
      return res.status(400).json({ 
        error: `Not enough eligible participants for matching. Found ${eligibleParticipants.length} eligible out of ${allParticipants.length} total participants (${allParticipants.length - participants.length} incomplete data, ${(excludedCount || 0)} excluded). Need at least 2 for matching.` 
      })
    }

    // Fetch locked matches for this match_id
    console.log(`🔒 Fetching locked matches for match_id: ${match_id}`)
    const { data: lockedMatches, error: lockedError } = await supabase
      .from("locked_matches")
      .select("*")
      .eq("match_id", match_id)

    if (lockedError) {
      console.error("❌ Error fetching locked matches:", lockedError)
      // Continue without locked matches rather than failing
    }

    const lockedPairs = lockedMatches || []
    console.log(`🔒 Found ${lockedPairs.length} locked matches`)
    if (lockedPairs.length > 0) {
      lockedPairs.forEach(lock => {
        console.log(`   🔒 Locked: #${lock.participant1_number} ↔ #${lock.participant2_number} (Score: ${lock.original_compatibility_score}%)`)
      })
    }

    // Handle group matching
    if (matchType === "group") {
      console.log("🎯 Group matching requested")
      
      if (eligibleParticipants.length < 3) {
        return res.status(400).json({ 
          error: `Need at least 3 eligible participants for group matching. Found ${eligibleParticipants.length} eligible out of ${allParticipants.length} total participants. Groups only include paid participants (PAID_DONE = true).` 
        })
      }

      const groupMatches = await generateGroupMatches(eligibleParticipants, match_id, eventId)

      // Clear existing group matches
      console.log(`🗑️ Clearing existing group matches for match_id: ${match_id}, event_id: ${eventId}`)
      const { error: deleteError } = await supabase
        .from("group_matches")
        .delete()
        .eq("match_id", match_id)
        .eq("event_id", eventId)

      if (deleteError) {
        console.error("🔥 Error clearing existing group matches:", deleteError)
        throw deleteError
      }

      // Insert new group matches
      console.log("💾 Inserting", groupMatches.length, "group matches into group_matches table")
      const { error: insertError } = await supabase
        .from("group_matches")
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
          participants: [match.participant_a_number, match.participant_b_number, match.participant_c_number, match.participant_d_number, match.participant_e_number, match.participant_f_number].filter(p => p !== null),
          score: match.compatibility_score,
          table_number: match.table_number
        }))
      })
    }

    // Summary: Retrieved participant data
    console.log(`🔍 Retrieved ${eligibleParticipants.length} eligible participants for matching`)

    const numbers = eligibleParticipants.map(p => p.assigned_number)
    const pairs = []

    for (let i = 0; i < eligibleParticipants.length; i++) {
      for (let j = i + 1; j < eligibleParticipants.length; j++) {
        pairs.push([eligibleParticipants[i], eligibleParticipants[j]])
      }
    }

    // Calculate MBTI-based compatibility for all pairs
    const compatibilityScores = []
    console.log(`🔄 Starting compatibility calculation for ${pairs.length} pairs...`)
    
    let processedPairs = 0
    let skippedGender = 0
    let skippedAge = 0
    let skippedPrevious = 0
    let skippedExcluded = 0
    
    // Log excluded pairs if any
    if (excludedPairs && excludedPairs.length > 0) {
      console.log(`🚫 Excluded pairs configured: ${excludedPairs.length}`)
      excludedPairs.forEach(pair => {
        console.log(`   #${pair.participant1_number} ↔ #${pair.participant2_number}`)
      })
    }
    
    for (const [a, b] of pairs) {
      processedPairs++
      
      // Check if this pair is in the excluded pairs list
      if (isPairExcluded(a.assigned_number, b.assigned_number, excludedPairs)) {
        skippedExcluded++
        console.log(`🚫 Skipping excluded pair: #${a.assigned_number} ↔ #${b.assigned_number}`)
        continue
      }
      
      // Check gender compatibility first (opposite gender only)
      if (!checkGenderCompatibility(a, b)) {
        skippedGender++
        continue
      }
      
      // Check age compatibility (girls must be within 3 years)
      if (!checkAgeCompatibility(a, b)) {
        skippedAge++
        continue
      }
      
      // Check if this pair has been matched in previous events
      const hasPreviousMatch = await havePreviousMatch(a.assigned_number, b.assigned_number, eventId)
      if (hasPreviousMatch) {
        skippedPrevious++
        continue
      }
      
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
      
      
      // Calculate all compatibility scores
      const mbtiScore = calculateMBTICompatibility(aMBTI, bMBTI)
      const attachmentScore = calculateAttachmentCompatibility(aAttachment, bAttachment)
      const communicationScore = calculateCommunicationCompatibility(aCommunication, bCommunication)
      const lifestyleScore = calculateLifestyleCompatibility(aLifestyle, bLifestyle)
      const coreValuesScore = calculateCoreValuesCompatibility(aCoreValues, bCoreValues)
      const vibeScore = skipAI ? 15 : await calculateVibeCompatibility(a, b)
      // NEW WEIGHTING SYSTEM - Optimized for immediate chemistry
      // Enhanced Vibe (shared interests): 35% | Social Style (communication): 25% 
      // Refined Attachment: 15% | Lifestyle: 10% | Core Values: 10% | MBTI: 5%
      
      // Apply enhanced vibe weighting (35% instead of 15%)
      const enhancedVibeScore = Math.min(35, (vibeScore / 15) * 35)
      
      // Apply refined attachment scoring with penalties
      const refinedAttachmentScore = calculateRefinedAttachmentScore(aAttachment, bAttachment)
      
      // Reduce other weights to focus on immediate chemistry factors
      const reducedMBTIScore = Math.min(5, (mbtiScore / 10) * 5)
      const reducedLifestyleScore = Math.min(10, (lifestyleScore / 15) * 10) 
      const reducedCoreValuesScore = Math.min(10, (coreValuesScore / 20) * 10)
      
      const totalScore = reducedMBTIScore + refinedAttachmentScore + communicationScore + reducedLifestyleScore + reducedCoreValuesScore + enhancedVibeScore
      
      const reason = `🎭 الكيمياء الفورية: (${enhancedVibeScore.toFixed(1)}%) + 💬 التواصل: ${aCommunication || 'غير محدد'} مع ${bCommunication || 'غير محدد'} (${communicationScore}%) + 💝 التعلق: ${aAttachment || 'غير محدد'} مع ${bAttachment || 'غير محدد'} (${refinedAttachmentScore}%) + 🏠 نمط الحياة: (${reducedLifestyleScore.toFixed(1)}%) + ⭐ القيم: (${reducedCoreValuesScore.toFixed(1)}%) + 🧠 MBTI: (${reducedMBTIScore.toFixed(1)}%)`
      
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

    // Print simple pair results
    console.log(`📊 All Pair Compatibility Scores:`)
    
    // Show ALL calculated pairs with scores (sorted by compatibility)
    if (compatibilityScores.length > 0) {
      compatibilityScores
        .sort((a, b) => b.score - a.score)
        .forEach(pair => {
          console.log(`   Partner ${pair.a} and Partner ${pair.b} [${pair.score.toFixed(1)}%]`)
        })
    }
    
    // Show skip summary
    const totalSkipped = skippedGender + skippedAge + skippedPrevious + skippedExcluded
    if (totalSkipped > 0) {
      console.log(`🚫 Skipped pairs (no calculation):`)
      if (skippedExcluded > 0) console.log(`   ${skippedExcluded} pairs - Admin excluded`)
      if (skippedGender > 0) console.log(`   ${skippedGender} pairs - Gender preference mismatch`)
      if (skippedAge > 0) console.log(`   ${skippedAge} pairs - Age constraint (>5 years with female)`)
      if (skippedPrevious > 0) console.log(`   ${skippedPrevious} pairs - Previously matched`)
    }
    
    console.log(`📈 Summary: ${compatibilityScores.length} calculated pairs, ${totalSkipped} skipped, ${processedPairs} total`)

    // --- ROUND-ROBIN GLOBAL COMPATIBILITY MATCHING (CONFIGURABLE ROUNDS) ---
    console.log("🔄 Starting round-robin matching for", numbers.length, "participants")
    const finalMatches = []
    const matchedPairs = new Set() // Track pairs matched in any round
    const participantCount = numbers.length
    
    // Force single round mode for optimal matching
    let rounds = 1 // Single round mode only
    console.log(`🎯 Using ${rounds} round for matching (single round mode)`)

    for (let round = 1; round <= rounds; round++) {
      console.log(`\n🎯 === ROUND ${round} MATCHING ===`)
      const used = new Set() // Track participants matched in this round
      const roundMatches = []
      
      let tableCounter = 1 // Dynamic table numbering starting from 1
      
      // STEP 1: Process locked matches first (highest priority)
      console.log(`🔒 Processing ${lockedPairs.length} locked matches first...`)
      for (const lockedMatch of lockedPairs) {
        const participant1 = lockedMatch.participant1_number
        const participant2 = lockedMatch.participant2_number
        
        // Check if both participants are available and in our participant list
        const p1Available = participants.some(p => p.assigned_number === participant1) && !used.has(participant1)
        const p2Available = participants.some(p => p.assigned_number === participant2) && !used.has(participant2)
        
        if (p1Available && p2Available) {
          // Find the compatibility data for this pair (if calculated)
          const compatibilityData = compatibilityScores.find(score => 
            (score.a === participant1 && score.b === participant2) ||
            (score.a === participant2 && score.b === participant1)
          )
          
          // Get participant data for personality info
          const p1Data = participants.find(p => p.assigned_number === participant1)
          const p2Data = participants.find(p => p.assigned_number === participant2)
          
          used.add(participant1)
          used.add(participant2)
          
          const key = `${Math.min(participant1, participant2)}-${Math.max(participant1, participant2)}`
          matchedPairs.add(key)
          
          roundMatches.push({
            participant_a_number: participant1,
            participant_b_number: participant2,
            compatibility_score: compatibilityData ? Math.round(compatibilityData.score) : (lockedMatch.original_compatibility_score || 85),
            reason: compatibilityData ? compatibilityData.reason : `🔒 Locked Match (Original: ${lockedMatch.original_compatibility_score}%)`,
            match_id,
            event_id: eventId,
            round,
            is_repeat_match: false,
            table_number: tableCounter,
            // Add personality type data
            participant_a_mbti_type: compatibilityData?.aMBTI || p1Data?.mbti_personality_type || p1Data?.survey_data?.mbtiType,
            participant_b_mbti_type: compatibilityData?.bMBTI || p2Data?.mbti_personality_type || p2Data?.survey_data?.mbtiType,
            participant_a_attachment_style: compatibilityData?.aAttachment || p1Data?.attachment_style || p1Data?.survey_data?.attachmentStyle,
            participant_b_attachment_style: compatibilityData?.bAttachment || p2Data?.attachment_style || p2Data?.survey_data?.attachmentStyle,
            participant_a_communication_style: compatibilityData?.aCommunication || p1Data?.communication_style || p1Data?.survey_data?.communicationStyle,
            participant_b_communication_style: compatibilityData?.bCommunication || p2Data?.communication_style || p2Data?.survey_data?.communicationStyle,
            participant_a_lifestyle_preferences: compatibilityData?.aLifestyle,
            participant_b_lifestyle_preferences: compatibilityData?.bLifestyle,
            participant_a_core_values: compatibilityData?.aCoreValues,
            participant_b_core_values: compatibilityData?.bCoreValues,
            participant_a_vibe_description: compatibilityData?.aVibeDescription || p1Data?.survey_data?.vibeDescription || '',
            participant_b_vibe_description: compatibilityData?.bVibeDescription || p2Data?.survey_data?.vibeDescription || '',
            participant_a_ideal_person_description: p1Data?.survey_data?.idealPersonDescription || '',
            participant_b_ideal_person_description: p2Data?.survey_data?.idealPersonDescription || '',
            // Add score breakdown
            mbti_compatibility_score: compatibilityData?.mbtiScore || 15,
            attachment_compatibility_score: compatibilityData?.attachmentScore || 15,
            communication_compatibility_score: compatibilityData?.communicationScore || 15,
            lifestyle_compatibility_score: compatibilityData?.lifestyleScore || 15,
            core_values_compatibility_score: compatibilityData?.coreValuesScore || 15,
            vibe_compatibility_score: compatibilityData?.vibeScore || 10
          })
          
          console.log(`   🔒 Locked match assigned: #${participant1} ↔ #${participant2} (Table ${tableCounter})`)
          tableCounter++
        } else {
          console.log(`   ⚠️ Locked match unavailable: #${participant1} ↔ #${participant2} (P1: ${p1Available}, P2: ${p2Available})`)
        }
      }
      
      // STEP 2: Process remaining pairs by compatibility score
      const sortedPairs = [...compatibilityScores].sort((a, b) => b.score - a.score)
      console.log(`📊 Processing remaining ${sortedPairs.length} calculated pairs...`)
      
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
            event_id: eventId,
            round,
            is_repeat_match: false,
            table_number: tableCounter, // Dynamic table assignment: 1 to N/2
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
          
          tableCounter++ // Increment for next pair
        }
      }

      // Handle unmatched participants (odd number scenario)
      const unmatchedInRound = numbers.filter(n => !used.has(n))
      if (unmatchedInRound.length > 0) {
        console.log(`🔄 Round ${round} has ${unmatchedInRound.length} unmatched participants:`, unmatchedInRound)
        
        // Match unmatched participants with organizer (ID 9999)
        for (const unmatchedParticipant of unmatchedInRound) {
          
          roundMatches.push({
            participant_a_number: unmatchedParticipant,
            participant_b_number: 9999, // Organizer
            compatibility_score: 70,
            reason: "مقابلة مع المنظم لضمان مشاركة جميع الأطراف",
            match_id,
            event_id: eventId,
            round,
            is_repeat_match: false,
            table_number: tableCounter, // Continue dynamic numbering
            // Add default personality data for organizer matches
            participant_a_mbti_type: participants.find(p => p.assigned_number === unmatchedParticipant)?.mbti_personality_type || participants.find(p => p.assigned_number === unmatchedParticipant)?.survey_data?.mbtiType,
            participant_b_mbti_type: 'منظم',
            participant_a_attachment_style: participants.find(p => p.assigned_number === unmatchedParticipant)?.attachment_style || participants.find(p => p.assigned_number === unmatchedParticipant)?.survey_data?.attachmentStyle,
            participant_b_attachment_style: 'منظم',
            participant_a_communication_style: participants.find(p => p.assigned_number === unmatchedParticipant)?.communication_style || participants.find(p => p.assigned_number === unmatchedParticipant)?.survey_data?.communicationStyle,
            participant_b_communication_style: 'منظم',
            mbti_compatibility_score: 70,
            attachment_compatibility_score: 70,
            communication_compatibility_score: 70,
            lifestyle_compatibility_score: 70,
            core_values_compatibility_score: 70,
            vibe_compatibility_score: 70
          })
          
          tableCounter++
                }
              }

      console.log(`🎯 Round ${round} completed: ${roundMatches.length} matches, ${roundMatches.filter(m => m.participant_b_number !== 9999).length} regular pairs + ${roundMatches.filter(m => m.participant_b_number === 9999).length} organizer matches`)
      console.log(`📊 Tables assigned: 1 to ${tableCounter - 1}`)
      
      // Show summary of match quality
      const regularMatches = roundMatches.filter(m => m.participant_b_number !== 9999)
      if (regularMatches.length > 0) {
        const avgMatchScore = regularMatches.reduce((sum, m) => sum + m.compatibility_score, 0) / regularMatches.length
        const bestMatch = Math.max(...regularMatches.map(m => m.compatibility_score))
        console.log(`  - Average match quality: ${avgMatchScore.toFixed(1)}%`)
        console.log(`  - Best match score: ${bestMatch}%`)
      }
      
      finalMatches.push(...roundMatches)
    }

    // Clear existing matches for this event before inserting new ones to prevent duplicates
    console.log(`🗑️ Clearing existing matches for match_id: ${match_id}, event_id: ${eventId}`)
    const { error: deleteError } = await supabase
      .from("match_results")
      .delete()
      .eq("match_id", match_id)
      .eq("event_id", eventId)

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
      results: finalMatches,
      calculatedPairs: compatibilityScores.map(pair => ({
        participant_a: pair.a,
        participant_b: pair.b,
        compatibility_score: Math.round(pair.score),
        mbti_compatibility_score: pair.mbtiScore,
        attachment_compatibility_score: pair.attachmentScore,
        communication_compatibility_score: pair.communicationScore,
        lifestyle_compatibility_score: pair.lifestyleScore,
        core_values_compatibility_score: pair.coreValuesScore,
        vibe_compatibility_score: pair.vibeScore,
        reason: pair.reason,
        is_actual_match: finalMatches.some(match => 
          (match.participant_a_number === pair.a && match.participant_b_number === pair.b) ||
          (match.participant_a_number === pair.b && match.participant_b_number === pair.a)
        )
      }))
    })

  } catch (err) {
    console.error("🔥 Matching error:", err)
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
}

