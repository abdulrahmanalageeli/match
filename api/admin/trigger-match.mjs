import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Helper function to auto-save results to admin_results table
async function autoSaveAdminResults(eventId, matchType, generationType, matchResults, calculatedPairs, participantResults, performance, skipAI, excludedPairs, excludedParticipants, lockedMatches) {
  try {
    const sessionId = `${matchType}_${eventId}_${new Date().toISOString().replace(/[:.]/g, '_')}`
    
    console.log(`💾 Auto-saving admin results: ${sessionId}`)
    
    // Deactivate previous sessions of the same type for this event
    await supabase
      .from("admin_results")
      .update({ is_active: false })
      .eq("event_id", eventId)
      .eq("match_type", matchType)
      .eq("is_active", true)
    
    // Insert new session
    const { error } = await supabase
      .from("admin_results")
      .insert([{
        session_id: sessionId,
        event_id: eventId,
        match_type: matchType,
        generation_type: generationType,
        match_results: matchResults || [],
        calculated_pairs: calculatedPairs || [],
        participant_results: participantResults || [],
        total_matches: matchResults?.length || 0,
        total_participants: participantResults?.length || 0,
        skip_ai: skipAI || false,
        excluded_pairs: excludedPairs || [],
        excluded_participants: excludedParticipants || [],
        locked_matches: lockedMatches || [],
        generation_duration_ms: performance?.totalTime || null,
        cache_hit_rate: performance?.cacheHitRate || null,
        ai_calls_made: performance?.aiCalls || 0,
        notes: `Auto-saved from trigger-match API`
      }])
    
    if (error) {
      console.error("Error auto-saving admin results:", error)
    } else {
      console.log(`✅ Auto-saved admin results: ${sessionId}`)
    }
    
    return sessionId
  } catch (error) {
    console.error("Error in autoSaveAdminResults:", error)
    return null
  }
}

// MBTI Compatibility Matrix
const MBTI_COMPATIBILITY = {
  // Analyst Types (NT)
  'INTJ': { top1: 'ENTP', top2: 'ENFP', top3: 'INFJ', bonus: ['INTP', 'ENTJ'] },
  'INTP': { top1: 'ENTJ', top2: 'ESTJ', top3: 'ENFP', bonus: ['INTJ', 'ENTP'] },
  'ENTJ': { top1: 'INTP', top2: 'INFJ', top3: 'ENFP', bonus: ['INTJ', 'ENTP'] },
  'ENTP': { top1: 'INTJ', top2: 'INFJ', top3: 'ISFJ', bonus: ['ENFP', 'ENTJ'] },

  // Diplomat Types (NF)
  'INFJ': { top1: 'ENFP', top2: 'ENTP', top3: 'ENFJ', bonus: ['INTJ', 'INFP'] },
  'INFP': { top1: 'ENFJ', top2: 'ENTJ', top3: 'ESFJ', bonus: ['INFJ', 'ENFP'] },
  'ENFJ': { top1: 'INFP', top2: 'ISFP', top3: 'INFJ', bonus: ['ENFP', 'ESFJ'] },
  'ENFP': { top1: 'INFJ', top2: 'INTJ', top3: 'ISTJ', bonus: ['ENTP', 'ENFJ'] },

  // Sentinel Types (SJ)
  'ISTJ': { top1: 'ENFP', top2: 'ESFP', top3: 'ESTJ', bonus: ['ISFJ', 'ISTP'] },
  'ISFJ': { top1: 'ENTP', top2: 'ESFP', top3: 'ESTJ', bonus: ['ISTJ', 'ESFJ'] },
  'ESTJ': { top1: 'ISTP', top2: 'ISFJ', top3: 'INTP', bonus: ['ISTJ', 'ESFJ'] },
  'ESFJ': { top1: 'ISFP', top2: 'ISTP', top3: 'INFP', bonus: ['ISFJ', 'ESTJ'] },

  // Explorer Types (SP)
  'ISTP': { top1: 'ESTJ', top2: 'ESFJ', top3: 'ENTP', bonus: ['ISTJ', 'ESTP'] },
  'ISFP': { top1: 'ESFJ', top2: 'ENFJ', top3: 'ESTJ', bonus: ['ESFP', 'ISTP'] },
  'ESTP': { top1: 'ISFJ', top2: 'ISTP', top3: 'ENTP', bonus: ['ESFP', 'INTP'] },
  'ESFP': { top1: 'ISFJ', top2: 'ISTJ', top3: 'ESFJ', bonus: ['ISFP', 'ESTP'] }
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

// Function to calculate MBTI compatibility score (up to 10% of total - REWEIGHTED)
function calculateMBTICompatibility(type1, type2) {
  if (!type1 || !type2 || !MBTI_COMPATIBILITY[type1]) {
    return 0 // Default 0% if no MBTI data
  }
  
  const compatibility = MBTI_COMPATIBILITY[type1]
  
  // Updated scores for new 10% weight (doubled from 5%)
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
    
    // Score based on shared letters (doubled from previous)
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

// Function to calculate attachment style compatibility score (up to 15% of total - REWEIGHTED)
function calculateAttachmentCompatibility(style1, style2) {
  if (!style1 || !style2) {
    return 7.5; // Default 7.5% if no attachment data (50% of max)
  }

  // If either person is Secure, it's a full-score match.
  if (style1 === 'Secure' || style2 === 'Secure') {
    return 15; // Full score for any match involving a Secure person.
  }
  
  // Original logic for non-Secure pairings remains for other cases.
  const bestMatches = {
    'Anxious': ['Secure'],
    'Avoidant': ['Secure'],
    'Fearful': ['Secure'],
    'Mixed (Secure-Anxious)': ['Secure'],
    'Mixed (Secure-Avoidant)': ['Secure'],
    'Mixed (Secure-Fearful)': ['Secure'],
    'Mixed (Anxious-Avoidant)': ['Secure'],
    'Mixed (Anxious-Fearful)': ['Secure'],
    'Mixed (Avoidant-Fearful)': ['Secure']
  };
  
  // Check if it's a best match according to the remaining rules
  const matches = bestMatches[style1] || [];
  if (matches.includes(style2)) {
    return 15; // This will now primarily catch cases where Secure is the target
  } else {
    return 7.5; // Non-best match gets 7.5%
  }
}

// Function to calculate communication style compatibility score (up to 15% of total - REWEIGHTED)
function calculateCommunicationCompatibility(style1, style2) {
  if (!style1 || !style2) {
    return 6; // Default 6% if no communication data (40% of max)
  }

  // Aggressive with Passive-Aggressive gets 0%
  if ((style1 === 'Aggressive' && style2 === 'Passive-Aggressive') || 
      (style1 === 'Passive-Aggressive' && style2 === 'Aggressive')) {
    return 0;
  }

  // Assertive + Passive is a full-score match
  if ((style1 === 'Assertive' && style2 === 'Passive') || (style1 === 'Passive' && style2 === 'Assertive')) {
    return 15;
  }
  
  // Communication style compatibility based on the image
  const compatibilityMatrix = {
    'Assertive': { top1: 'Assertive', top2: 'Passive' },
    'Passive': { top1: 'Assertive', top2: 'Passive' },
    'Aggressive': { top1: 'Assertive', top2: 'Aggressive' },
    'Passive-Aggressive': { top1: 'Assertive', top2: 'Passive-Aggressive' }
  };
  
  const compatibility = compatibilityMatrix[style1];
  if (!compatibility) {
    return 6; // Default if style not found
  }
  
  if (compatibility.top1 === style2) {
    return 15; // Top 1 match gets 15%
  } else if (compatibility.top2 === style2) {
    return 12; // Top 2 match gets 12%
  } else {
    return 6; // Neither match gets 6%
  }
}

// Function to calculate lifestyle compatibility score (up to 15% of total - REWEIGHTED)
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
  
  // Define weights for each lifestyle question (relative to total 15%)
  const weights = [
    0.375,  // lifestyle_1: Lower weight (1.5% of total)
    0.375,  // lifestyle_2: Lower weight (1.5% of total)
    0.375,  // lifestyle_3: Lower weight (1.5% of total)
    0.75,   // lifestyle_4: Normal weight (3% of total)
    1.875   // lifestyle_5: Highest weight (7.5% of total)
  ]
  // Total weight sum: 3.75, which scales to 15% total
  
  // Calculate weighted similarity with partial credit for adjacent choices
  let totalScore = 0
  let maxPossibleScore = 0
  
  for (let i = 0; i < 5; i++) {
    const val1 = prefs1[i]
    const val2 = prefs2[i]
    const weight = weights[i]
    
    let questionScore = 0
    if (val1 === val2) {
      // Exact match = full points (4 points)
      questionScore = 4
    } else if (
      (val1 === 'أ' && val2 === 'ب') || (val1 === 'ب' && val2 === 'أ') ||
      (val1 === 'ب' && val2 === 'ج') || (val1 === 'ج' && val2 === 'ب')
    ) {
      // Adjacent choices = partial points (2 points)
      questionScore = 2
    } else {
      // Opposite choices (أ vs ج) = no points
      questionScore = 0
    }
    
    totalScore += questionScore * weight
    maxPossibleScore += 4 * weight
  }
  
  // Scale to 15% total (maxPossibleScore should be 15)
  return (totalScore / maxPossibleScore) * 15
}

// Function to calculate core values compatibility score (up to 20% of total - REWEIGHTED
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
      // Identical answer = full value match (4 points for 20% total)
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
  
  // Max score is 5 * 4 = 20 points, which directly translates to 20%
  return totalScore
}

// Function to check gender compatibility with support for any_gender_preference
function checkGenderCompatibility(participantA, participantB) {
  const genderA = participantA.gender || participantA.survey_data?.gender
  const genderB = participantB.gender || participantB.survey_data?.gender
  
  // Check gender preferences from both new and old structure
  let sameGenderPrefA = participantA.same_gender_preference || participantA.survey_data?.answers?.same_gender_preference?.includes('yes') || participantA.survey_data?.answers?.gender_preference?.includes('same_gender')
  let sameGenderPrefB = participantB.same_gender_preference || participantB.survey_data?.answers?.same_gender_preference?.includes('yes') || participantB.survey_data?.answers?.gender_preference?.includes('same_gender')
  
  let anyGenderPrefA = participantA.any_gender_preference || participantA.survey_data?.answers?.gender_preference?.includes('any_gender')
  let anyGenderPrefB = participantB.any_gender_preference || participantB.survey_data?.answers?.gender_preference?.includes('any_gender')
  
  // Handle new radio button structure (string)
  if (participantA.survey_data?.answers?.gender_preference === 'same_gender') {
    sameGenderPrefA = true
    anyGenderPrefA = false
  } else if (participantA.survey_data?.answers?.gender_preference === 'any_gender') {
    sameGenderPrefA = false
    anyGenderPrefA = true
  } else if (participantA.survey_data?.answers?.gender_preference === 'opposite_gender') {
    sameGenderPrefA = false
    anyGenderPrefA = false
  }
  
  if (participantB.survey_data?.answers?.gender_preference === 'same_gender') {
    sameGenderPrefB = true
    anyGenderPrefB = false
  } else if (participantB.survey_data?.answers?.gender_preference === 'any_gender') {
    sameGenderPrefB = false
    anyGenderPrefB = true
  } else if (participantB.survey_data?.answers?.gender_preference === 'opposite_gender') {
    sameGenderPrefB = false
    anyGenderPrefB = false
  }
  
  // If gender information is missing, allow the match (fallback)
  if (!genderA || !genderB) {
    console.warn(`⚠️ Missing gender info for participants ${participantA.assigned_number} or ${participantB.assigned_number}`)
    return true
  }
  
  // Priority 1: If either participant has any_gender_preference, they can match with anyone
  // any_gender means: "I'm open to matching with both males and females"
  if (anyGenderPrefA || anyGenderPrefB) {
    // Participant A has any_gender preference
    if (anyGenderPrefA) {
      // A accepts any gender, so check what B wants
      if (anyGenderPrefB) {
        // Both accept any gender - always compatible
        console.log(`✅ Any-gender match: ${participantA.assigned_number} (${genderA}, any) × ${participantB.assigned_number} (${genderB}, any) - both accept any gender`)
        return true
      } else if (sameGenderPrefB) {
        // B wants same gender only - check if they're the same gender
        if (genderA === genderB) {
          console.log(`✅ Any-gender + same-gender match: ${participantA.assigned_number} (${genderA}, any) × ${participantB.assigned_number} (${genderB}, same) - same gender`)
          return true
        } else {
          console.log(`🚫 Gender mismatch: ${participantA.assigned_number} (${genderA}, any) × ${participantB.assigned_number} (${genderB}, same) - B wants same gender but different genders`)
          return false
        }
      } else {
        // B wants opposite gender (default) - check if they're opposite gender
        if (genderA !== genderB) {
          console.log(`✅ Any-gender + opposite-gender match: ${participantA.assigned_number} (${genderA}, any) × ${participantB.assigned_number} (${genderB}, opposite) - opposite genders`)
          return true
        } else {
          console.log(`🚫 Gender mismatch: ${participantA.assigned_number} (${genderA}, any) × ${participantB.assigned_number} (${genderB}, opposite) - B wants opposite gender but same genders`)
          return false
        }
      }
    }
    
    // Participant B has any_gender preference (and A doesn't)
    if (anyGenderPrefB) {
      // B accepts any gender, so check what A wants
      if (sameGenderPrefA) {
        // A wants same gender only - check if they're the same gender
        if (genderA === genderB) {
          console.log(`✅ Same-gender + any-gender match: ${participantA.assigned_number} (${genderA}, same) × ${participantB.assigned_number} (${genderB}, any) - same gender`)
          return true
        } else {
          console.log(`🚫 Gender mismatch: ${participantA.assigned_number} (${genderA}, same) × ${participantB.assigned_number} (${genderB}, any) - A wants same gender but different genders`)
          return false
        }
      } else {
        // A wants opposite gender (default) - check if they're opposite gender
        if (genderA !== genderB) {
          console.log(`✅ Opposite-gender + any-gender match: ${participantA.assigned_number} (${genderA}, opposite) × ${participantB.assigned_number} (${genderB}, any) - opposite genders`)
          return true
        } else {
          console.log(`🚫 Gender mismatch: ${participantA.assigned_number} (${genderA}, opposite) × ${participantB.assigned_number} (${genderB}, any) - A wants opposite gender but same genders`)
          return false
        }
      }
    }
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
  
  // Neither has specific preferences - DEFAULT TO OPPOSITE GENDER ONLY
  const isOppositeGender = genderA !== genderB
  if (isOppositeGender) {
    console.log(`✅ Opposite gender match: ${participantA.assigned_number} (${genderA}) × ${participantB.assigned_number} (${genderB}) - default opposite gender matching`)
  } else {
    console.log(`🚫 Same gender without preference: ${participantA.assigned_number} (${genderA}) × ${participantB.assigned_number} (${genderB}) - both same gender but no same-gender preference`)
  }
  return isOppositeGender
}

// Function to check age compatibility (females must be within 3 years of their match, unless both have any_gender_preference)
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
  
  // Check any_gender_preference from both new and old structure
  let anyGenderPrefA = participantA.any_gender_preference || participantA.survey_data?.answers?.gender_preference?.includes('any_gender')
  let anyGenderPrefB = participantB.any_gender_preference || participantB.survey_data?.answers?.gender_preference?.includes('any_gender')
  
  // Handle new radio button structure (string)
  if (participantA.survey_data?.answers?.gender_preference === 'any_gender') {
    anyGenderPrefA = true
  }
  if (participantB.survey_data?.answers?.gender_preference === 'any_gender') {
    anyGenderPrefB = true
  }
  
  // If both participants have any_gender_preference, allow up to 10 years age gap
  if (anyGenderPrefA && anyGenderPrefB) {
    const ageDifference = Math.abs(ageA - ageB)
    const isCompatible = ageDifference <= 10
    
    if (!isCompatible) {
      console.log(`🚫 Age mismatch (any_gender): ${participantA.assigned_number} (${ageA}, ${genderA}) vs ${participantB.assigned_number} (${ageB}, ${genderB}) - ${ageDifference} years apart (max 10 for any_gender)`)
    } else {
      console.log(`✅ Age compatible (any_gender): ${participantA.assigned_number} (${ageA}, ${genderA}) vs ${participantB.assigned_number} (${ageB}, ${genderB}) - ${ageDifference} years apart (max 10 for any_gender)`)
    }
    
    return isCompatible
  }
  
  // Apply age constraint if any participant is female (including same-gender female matches)
  const hasFemale = genderA === 'female' || genderB === 'female'
  
  if (hasFemale) {
    const ageDifference = Math.abs(ageA - ageB)
    const isCompatible = ageDifference <= 6
    
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

// Function to check interaction style compatibility (matching determinants)
function checkInteractionStyleCompatibility(participantA, participantB) {
  const humorA = participantA.humor_banter_style || participantA.survey_data?.answers?.humor_banter_style
  const humorB = participantB.humor_banter_style || participantB.survey_data?.answers?.humor_banter_style
  const opennessA = participantA.early_openness_comfort !== undefined ? participantA.early_openness_comfort : participantA.survey_data?.answers?.early_openness_comfort
  const opennessB = participantB.early_openness_comfort !== undefined ? participantB.early_openness_comfort : participantB.survey_data?.answers?.early_openness_comfort
  
  // If interaction style information is missing, allow the match (fallback)
  if (!humorA || !humorB || opennessA === undefined || opennessB === undefined) {
    console.warn(`⚠️ Missing interaction style info for participants ${participantA.assigned_number} or ${participantB.assigned_number}`)
    return true
  }
  
  // Check humor/banter style compatibility
  const humorCompatible = checkHumorCompatibility(humorA, humorB)
  if (!humorCompatible) {
    console.log(`🚫 Humor incompatible: ${participantA.assigned_number} (${humorA}) × ${participantB.assigned_number} (${humorB})`)
    return false
  }
  
  // Check early openness compatibility
  const opennessCompatible = checkOpennessCompatibility(parseInt(opennessA), parseInt(opennessB))
  if (!opennessCompatible) {
    console.log(`🚫 Openness incompatible: ${participantA.assigned_number} (${opennessA}) × ${participantB.assigned_number} (${opennessB})`)
    return false
  }
  
  console.log(`✅ Interaction styles compatible: ${participantA.assigned_number} (H:${humorA}, O:${opennessA}) × ${participantB.assigned_number} (H:${humorB}, O:${opennessB})`)
  return true
}

// Helper function to check humor/banter style compatibility
function checkHumorCompatibility(humorA, humorB) {
  // Allowed combinations:
  // A↔A, A↔B, A↔C
  // B↔B, B↔C, B↔D  
  // C↔C, C↔D
  // D↔D
  // Blocked: A↔D only
  
  if (humorA === 'A') return ['A', 'B', 'C'].includes(humorB)
  if (humorA === 'B') return ['A', 'B', 'C', 'D'].includes(humorB)
  if (humorA === 'C') return ['A', 'B', 'C', 'D'].includes(humorB)
  if (humorA === 'D') return ['B', 'C', 'D'].includes(humorB)
  
  return false
}

// Helper function to check early openness compatibility
function checkOpennessCompatibility(opennessA, opennessB) {
  // Allowed combinations:
  // 0↔1, 0↔2
  // 1↔1, 1↔2, 1↔3
  // 2↔0, 2↔1, 2↔2, 2↔3
  // 3↔1, 3↔2, 3↔3
  // Blocked: 0↔0, 0↔3
  
  if (opennessA === 0) return [1, 2].includes(opennessB)
  if (opennessA === 1) return [1, 2, 3].includes(opennessB)
  if (opennessA === 2) return [0, 1, 2, 3].includes(opennessB)
  if (opennessA === 3) return [1, 2, 3].includes(opennessB)
  
  return false
}

// Function to generate content hash for caching
function generateContentHash(content) {
  // Simple hash function for content-based caching
  let hash = 0
  if (content.length === 0) return hash.toString(36)
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36)
}

// Function to generate cache key for participant pair
function generateCacheKey(participantA, participantB) {
  const vibeA = participantA.survey_data?.vibeDescription || ''
  const vibeB = participantB.survey_data?.vibeDescription || ''
  const mbtiA = participantA.mbti_personality_type || participantA.survey_data?.mbtiType || ''
  const mbtiB = participantB.mbti_personality_type || participantB.survey_data?.mbtiType || ''
  const attachmentA = participantA.attachment_style || participantA.survey_data?.attachmentStyle || ''
  const attachmentB = participantB.attachment_style || participantB.survey_data?.attachmentStyle || ''
  const communicationA = participantA.communication_style || participantA.survey_data?.communicationStyle || ''
  const communicationB = participantB.communication_style || participantB.survey_data?.communicationStyle || ''
  
  // Get lifestyle and core values
  const lifestyleA = participantA.survey_data?.lifestylePreferences || 
    (participantA.survey_data?.answers ? 
      [participantA.survey_data.answers.lifestyle_1, participantA.survey_data.answers.lifestyle_2, participantA.survey_data.answers.lifestyle_3, participantA.survey_data.answers.lifestyle_4, participantA.survey_data.answers.lifestyle_5].join(',') : 
      '')
  const lifestyleB = participantB.survey_data?.lifestylePreferences || 
    (participantB.survey_data?.answers ? 
      [participantB.survey_data.answers.lifestyle_1, participantB.survey_data.answers.lifestyle_2, participantB.survey_data.answers.lifestyle_3, participantB.survey_data.answers.lifestyle_4, participantB.survey_data.answers.lifestyle_5].join(',') : 
      '')
      
  const coreValuesA = participantA.survey_data?.coreValues || 
    (participantA.survey_data?.answers ? 
      [participantA.survey_data.answers.core_values_1, participantA.survey_data.answers.core_values_2, participantA.survey_data.answers.core_values_3, participantA.survey_data.answers.core_values_4, participantA.survey_data.answers.core_values_5].join(',') : 
      '')
  const coreValuesB = participantB.survey_data?.coreValues || 
    (participantB.survey_data?.answers ? 
      [participantB.survey_data.answers.core_values_1, participantB.survey_data.answers.core_values_2, participantB.survey_data.answers.core_values_3, participantB.survey_data.answers.core_values_4, participantB.survey_data.answers.core_values_5].join(',') : 
      '')
  
  // Sort content for consistent hashing
  const vibeContent = [vibeA, vibeB].sort().join('|||')
  const mbtiContent = [mbtiA, mbtiB].sort().join('|||')
  const attachmentContent = [attachmentA, attachmentB].sort().join('|||')
  const communicationContent = [communicationA, communicationB].sort().join('|||')
  const lifestyleContent = [lifestyleA, lifestyleB].sort().join('|||')
  const coreValuesContent = [coreValuesA, coreValuesB].sort().join('|||')
  
  return {
    vibeHash: generateContentHash(vibeContent),
    mbtiHash: generateContentHash(mbtiContent),
    attachmentHash: generateContentHash(attachmentContent),
    communicationHash: generateContentHash(communicationContent),
    lifestyleHash: generateContentHash(lifestyleContent),
    coreValuesHash: generateContentHash(coreValuesContent),
    combinedHash: generateContentHash(vibeContent + mbtiContent + attachmentContent + communicationContent + lifestyleContent + coreValuesContent)
  }
}

// Function to get cached compatibility result
async function getCachedCompatibility(participantA, participantB) {
  try {
    const [smaller, larger] = [participantA.assigned_number, participantB.assigned_number].sort((a, b) => a - b)
    const cacheKey = generateCacheKey(participantA, participantB)
    
    const { data, error } = await supabase
      .from('compatibility_cache')
      .select('*')
      .eq('participant_a_number', smaller)
      .eq('participant_b_number', larger)
      .eq('combined_content_hash', cacheKey.combinedHash)
      .single()
      
    if (data && !error) {
      // Update usage statistics
      await supabase
        .from('compatibility_cache')
        .update({ 
          last_used: new Date().toISOString(),
          use_count: data.use_count + 1 
        })
        .eq('id', data.id)
        
      console.log(`🎯 Cache HIT: #${smaller}-#${larger} (used ${data.use_count + 1} times)`)
      return {
        mbtiScore: parseFloat(data.mbti_score),
        attachmentScore: parseFloat(data.attachment_score),
        communicationScore: parseFloat(data.communication_score),
        lifestyleScore: parseFloat(data.lifestyle_score),
        coreValuesScore: parseFloat(data.core_values_score),
        vibeScore: parseFloat(data.ai_vibe_score),
        totalScore: parseFloat(data.total_compatibility_score),
        cached: true
      }
    }
    
    return null
  } catch (error) {
    console.error("Cache lookup error:", error)
    return null
  }
}

// Function to store compatibility result in cache
async function storeCachedCompatibility(participantA, participantB, scores) {
  try {
    const [smaller, larger] = [participantA.assigned_number, participantB.assigned_number].sort((a, b) => a - b)
    const cacheKey = generateCacheKey(participantA, participantB)
    
    const { error } = await supabase
      .from('compatibility_cache')
      .upsert({
        participant_a_number: smaller,
        participant_b_number: larger,
        combined_content_hash: cacheKey.combinedHash,
        vibe_content_hash: cacheKey.vibeHash,
        mbti_hash: cacheKey.mbtiHash,
        attachment_hash: cacheKey.attachmentHash,
        communication_hash: cacheKey.communicationHash,
        lifestyle_hash: cacheKey.lifestyleHash,
        core_values_hash: cacheKey.coreValuesHash,
        ai_vibe_score: scores.vibeScore,
        mbti_score: scores.mbtiScore,
        attachment_score: scores.attachmentScore,
        communication_score: scores.communicationScore,
        lifestyle_score: scores.lifestyleScore,
        core_values_score: scores.coreValuesScore,
        total_compatibility_score: scores.totalScore,
        use_count: 1
      })
      
    if (!error) {
      console.log(`💾 Cache STORE: #${smaller}-#${larger}`)
    } else {
      console.error("Cache store error:", error)
    }
  } catch (error) {
    console.error("Cache store error:", error)
  }
}

// Function to calculate humor compatibility bonus (+2% if same humor style - REWEIGHTED)
function calculateHumorCompatibilityBonus(participantA, participantB) {
  // Extract humor/banter style from different possible locations
  const humorA = participantA.humor_banter_style || 
                 participantA.survey_data?.humor_banter_style ||
                 participantA.survey_data?.answers?.humor_banter_style;
                 
  const humorB = participantB.humor_banter_style || 
                 participantB.survey_data?.humor_banter_style ||
                 participantB.survey_data?.answers?.humor_banter_style;

  // If both participants have the same humor style, give +2% bonus
  if (humorA && humorB && humorA === humorB) {
    console.log(`✅ Humor compatibility bonus: Both participants have style "${humorA}" (+2%)`);
    return 2; // 2% bonus
  }
  
  return 0; // No bonus
}

// Function to calculate full compatibility with caching
async function calculateFullCompatibilityWithCache(participantA, participantB, skipAI = false) {
  // Check cache first
  const cached = await getCachedCompatibility(participantA, participantB)
  if (cached) {
    return cached
  }
  
  // Cache miss - calculate all scores
  console.log(`💾 Cache MISS: #${participantA.assigned_number}-#${participantB.assigned_number} - calculating...`)
  
  // Extract all the data needed for calculations
  const aMBTI = participantA.mbti_personality_type || participantA.survey_data?.mbtiType
  const bMBTI = participantB.mbti_personality_type || participantB.survey_data?.mbtiType
  const aAttachment = participantA.attachment_style || participantA.survey_data?.attachmentStyle
  const bAttachment = participantB.attachment_style || participantB.survey_data?.attachmentStyle
  const aCommunication = participantA.communication_style || participantA.survey_data?.communicationStyle
  const bCommunication = participantB.communication_style || participantB.survey_data?.communicationStyle
  
  const aLifestyle = participantA.survey_data?.lifestylePreferences || 
    (participantA.survey_data?.answers ? 
      [participantA.survey_data.answers.lifestyle_1, participantA.survey_data.answers.lifestyle_2, participantA.survey_data.answers.lifestyle_3, participantA.survey_data.answers.lifestyle_4, participantA.survey_data.answers.lifestyle_5].join(',') : 
      null)
  const bLifestyle = participantB.survey_data?.lifestylePreferences || 
    (participantB.survey_data?.answers ? 
      [participantB.survey_data.answers.lifestyle_1, participantB.survey_data.answers.lifestyle_2, participantB.survey_data.answers.lifestyle_3, participantB.survey_data.answers.lifestyle_4, participantB.survey_data.answers.lifestyle_5].join(',') : 
      null)
      
  const aCoreValues = participantA.survey_data?.coreValues || 
    (participantA.survey_data?.answers ? 
      [participantA.survey_data.answers.core_values_1, participantA.survey_data.answers.core_values_2, participantA.survey_data.answers.core_values_3, participantA.survey_data.answers.core_values_4, participantA.survey_data.answers.core_values_5].join(',') : 
      null)
  const bCoreValues = participantB.survey_data?.coreValues || 
    (participantB.survey_data?.answers ? 
      [participantB.survey_data.answers.core_values_1, participantB.survey_data.answers.core_values_2, participantB.survey_data.answers.core_values_3, participantB.survey_data.answers.core_values_4, participantB.survey_data.answers.core_values_5].join(',') : 
      null)
  
  // Calculate all compatibility scores
  const mbtiScore = calculateMBTICompatibility(aMBTI, bMBTI)
  const attachmentScore = calculateAttachmentCompatibility(aAttachment, bAttachment)
  const communicationScore = calculateCommunicationCompatibility(aCommunication, bCommunication)
  const lifestyleScore = calculateLifestyleCompatibility(aLifestyle, bLifestyle)
  const coreValuesScore = calculateCoreValuesCompatibility(aCoreValues, bCoreValues)
  const vibeScore = skipAI ? 15 : await calculateVibeCompatibility(participantA, participantB)
  
  // Calculate humor compatibility bonus (+2% if same humor style - REWEIGHTED)
  const humorBonus = calculateHumorCompatibilityBonus(participantA, participantB)
  
  const totalScore = mbtiScore + attachmentScore + communicationScore + lifestyleScore + coreValuesScore + vibeScore + humorBonus
  
  const result = {
    mbtiScore,
    attachmentScore,
    communicationScore,
    lifestyleScore,
    coreValuesScore,
    vibeScore,
    humorBonus,
    totalScore,
    cached: false
  }
  
  // Store in cache for future use
  await storeCachedCompatibility(participantA, participantB, result)
  
  return result
}

// Function to calculate vibe compatibility using AI (up to 25% of total - REWEIGHTED)
async function calculateVibeCompatibility(participantA, participantB) {
  try {
    // Get combined vibe descriptions from all 6 questions
    const aVibeDescription = participantA.survey_data?.vibeDescription || ""
    const bVibeDescription = participantB.survey_data?.vibeDescription || ""

    if (!aVibeDescription || !bVibeDescription) {
      console.warn("❌ Missing vibe descriptions, using default score")
      return 12.5 // Default score (50% of max 25%)
    }

    // Calculate mutual compatibility between the two combined profiles
    const vibeScore = await calculateCombinedVibeCompatibility(aVibeDescription, bVibeDescription)
    
    console.log(`🎯 Vibe compatibility: AI score = ${vibeScore}/25`)
    console.log(`📝 Profile A preview: "${aVibeDescription.substring(0, 100)}..."`)
    console.log(`📝 Profile B preview: "${bVibeDescription.substring(0, 100)}..."`)
    
    return vibeScore

  } catch (error) {
    console.error("🔥 Vibe compatibility calculation error:", error)
    return 12.5 // Default score (50% of max 25%)
  }
}

// Helper function to calculate combined vibe compatibility using AI
async function calculateCombinedVibeCompatibility(profileA, profileB) {
  try {
    const systemMessage = `You are an expert human matchmaker. Your task is to score the "vibe compatibility" between two people on a scale of 0 to 25. Output a single integer only.

**Core Philosophy: Your judgment is crucial. Prioritize genuine connection over a simple checklist. Reward both SHARED interests and powerful COMPLEMENTARY dynamics (e.g., an energetic person balanced by a calm listener). Do not penalize differences that create synergy.**

Score based on three dimensions. TOTAL = Social Synergy (0-10) + Personal Resonance (0-10) + Spark Factor (0-5) = 25.

---
**1. Social Synergy (0-10 points): How well do their social energies align?**
*Look at weekend plans, hobbies, and social energy (introvert vs. extrovert).*

  - **10 (Perfect Synergy):** They have a very strong overlap in how they spend their free time and approach social situations.
  - **8 (Strong Synergy):** They have a clear complementary dynamic. (e.g., one is an adventurous extrovert, the other a calm homebody, but the extrovert's friends describe them as a "good listener" - this is a strong signal they appreciate balance).
  - **5 (Compatible):** They have different styles but no direct conflicts. They seem open to each other's worlds.
  - **2 (Potential Conflict):** Their social styles seem quite different, and there's no clear evidence of complementarity.
  - **0 (Clear Conflict):** Their lifestyles and social needs are in direct opposition.

---
**2. Personal Resonance (0-10 points): Do they connect on a deeper level?**
*Look at conversation depth preference ("vibe_4"), how friends describe them, and what they value in others.*

  - **10 (High Resonance):** A clear match in conversational depth AND their described traits are highly complementary (e.g., one is "funny," the other is a "good listener"; one is "ambitious," the other "supportive").
  - **8 (Strong Resonance):** A match in conversational depth and at least one shared or complementary trait.
  - **5 (Compatible):** Their conversational depths don't clash (e.g., one is "deep," the other is "sometimes"), and their personal values seem generally positive and aligned.
  - **2 (Low Resonance):** A mismatch in conversational depth or their described personalities seem to have little in common.
  - **0 (Clear Dissonance):** A direct clash in conversation style (deep vs. light only) AND their core personality traits seem incompatible.

---
**3. Spark Factor (0-5 points): Is there a special "spark"?**
*This is a bonus for unique elements that predict chemistry.*

  - **+2 points:** A strong, unique shared passion is mentioned (e.g., both love philosophy, anime, a niche sport, or a specific artist).
  - **+2 points:** A powerful complementary dynamic is explicitly stated or strongly implied (e.g., one describes themselves as "creative and chaotic" while the other values "planning and stability"). **This is a high-value signal.**
  - **+1 point:** A shared romantic, loyal, or deeply affectionate tone is present in their descriptions.

*Cap the total Spark Factor at 5 points.*

---
Return a single integer from 0 to 25. No other text.
`

    const userMessage = `الملف الشخصي للشخص الأول: "${profileA}"

الملف الشخصي للشخص الثاني: "${profileB}"

قيّم التوافق الشخصي بينهما من 0 إلى 35:`

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage }
      ],
      max_tokens: 60,
      temperature: 0
    })

    const rawResponse = completion.choices[0].message.content.trim()
    const score = parseInt(rawResponse)
    
    console.log(`🤖 AI raw response: "${rawResponse}" → Parsed score: ${score}`)
    
    // Validate score is within range
    if (isNaN(score) || score < 0 || score > 25) {
      console.warn("❌ Invalid AI score, using default:", rawResponse)
      return 12.5 // Default score (50% of max 25%)
    }

    return score

  } catch (error) {
    console.error("🔥 AI compatibility calculation error:", error)
    return 12.5 // Default score (50% of max 25%)
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
    
    // Prioritize groups with at least 2 females to avoid single females feeling uncomfortable
    // Only apply this for groups of 4 (for groups of 3, we allow 1F/2M as minimum)
    const hasSingleFemale = femaleCount === 1 && targetSize === 4
    if (hasSingleFemale) {
      console.log(`⚠️ Deprioritizing group combination [${combination.join(', ')}] - single female in group of 4 (${maleCount}M, ${femaleCount}F)`)
      // Don't skip, but reduce score to deprioritize this combination
    }
    
    // Check conversation depth preference (vibe_4) compatibility
    const conversationPrefs = combination.map(participantNum => {
      const participant = eligibleParticipants.find(p => p.assigned_number === participantNum)
      return participant?.survey_data?.vibe_4
    }).filter(Boolean)
    
    // Count preferences: "نعم" (yes), "لا" (no), "أحياناً" (sometimes)
    const yesCount = conversationPrefs.filter(p => p === 'نعم').length
    const noCount = conversationPrefs.filter(p => p === 'لا').length
    const sometimesCount = conversationPrefs.filter(p => p === 'أحياناً').length
    
    // Skip if mixing "yes" and "no" preferences ("sometimes" can go with either)
    if (yesCount > 0 && noCount > 0) {
      console.log(`🚫 Skipping group combination [${combination.join(', ')}] - conversation depth mismatch (${yesCount} deep, ${noCount} light, ${sometimesCount} flexible)`)
      continue
    }
    
    let score = calculateGroupMBTIScore(combination, pairScores)
    
    // Apply penalty for single female in group of 4 to prioritize 2+ females
    if (hasSingleFemale) {
      score = score * 0.7 // 30% penalty to deprioritize single female groups
      console.log(`   📉 Applied 30% penalty for single female: ${score}% (original: ${calculateGroupMBTIScore(combination, pairScores)}%)`)
    }
    
    if (score > bestScore) {
      bestScore = score
      bestGroup = combination
      const convType = yesCount > 0 ? 'deep' : noCount > 0 ? 'light' : 'flexible'
      const femaleStatus = hasSingleFemale ? ' (⚠️ single F)' : femaleCount >= 2 ? ' (✅ 2+ F)' : ''
      console.log(`✅ Better balanced group found [${combination.join(', ')}] - Score: ${Math.round(score)}%, Gender: ${maleCount}M/${femaleCount}F${femaleStatus}, Conv: ${convType}`)
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
    // If we have participant data, still try to prefer gender balance and conversation compatibility
    if (eligibleParticipants) {
      const genders = combination.map(participantNum => {
        const participant = eligibleParticipants.find(p => p.assigned_number === participantNum)
        return participant?.gender || participant?.survey_data?.gender
      }).filter(Boolean)
      
      const maleCount = genders.filter(g => g === 'male').length
      const femaleCount = genders.filter(g => g === 'female').length
      
      // Check conversation depth preference compatibility
      const conversationPrefs = combination.map(participantNum => {
        const participant = eligibleParticipants.find(p => p.assigned_number === participantNum)
        return participant?.survey_data?.vibe_4
      }).filter(Boolean)
      
      const yesCount = conversationPrefs.filter(p => p === 'نعم').length
      const noCount = conversationPrefs.filter(p => p === 'لا').length
      const hasConversationCompatibility = !(yesCount > 0 && noCount > 0) // Compatible if not mixing yes and no
      
      // Prefer groups with gender balance and conversation compatibility, but don't require it in fallback
      const hasGenderBalance = maleCount > 0 && femaleCount > 0
      const score = calculateGroupMBTIScore(combination, pairScores)
      let adjustedScore = score
      if (hasGenderBalance) adjustedScore += 5 // Bonus for gender balance
      if (hasConversationCompatibility) adjustedScore += 3 // Bonus for conversation compatibility
      
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
  
  // Scale from 0-5 range to 0-100 range for display
  // MBTI scores are 0-5%, so multiply by 20 to get 0-100%
  const averageScore = pairCount > 0 ? totalScore / pairCount : 0
  return averageScore * 20
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

  const { skipAI = false, matchType = "individual", eventId, excludedPairs = [], manualMatch = null } = req.body || {}
  
  if (!eventId) {
    return res.status(400).json({ error: "eventId is required" })
  }
  const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"
  
  console.log(`🎯 MATCH GENERATION START: eventId received = ${eventId}, matchType = ${matchType}`)
  console.log(`🎯 Request body eventId:`, req.body?.eventId)

  try {
    // Ensure organizer participant exists for potential odd-participant matches
    await ensureOrganizerParticipant(match_id);

    // Check existing event_finished status for this event_id to preserve it
    let existingEventFinishedStatus = null
    const { data: existingMatchData, error: existingMatchError } = await supabase
      .from("match_results")
      .select("event_finished")
      .eq("event_id", eventId)
      .limit(1)
      .single()
    
    if (!existingMatchError && existingMatchData) {
      existingEventFinishedStatus = existingMatchData.event_finished
      console.log(`📋 Existing event_finished status for event ${eventId}: ${existingEventFinishedStatus}`)
    } else {
      console.log(`📋 No existing matches for event ${eventId}, will not set event_finished (let admin control it)`)
    }

    // Fetch excluded participants from database (using excluded_pairs with participant2_number = -1 or -10)
    const { data: excludedParticipantsData, error: excludedParticipantsError } = await supabase
      .from("excluded_pairs")
      .select("participant1_number")
      .eq("match_id", match_id)
      .in("participant2_number", [-1, -10]) // Include both excluded (-1) and banned (-10)

    if (excludedParticipantsError) {
      console.error("Error fetching excluded participants:", excludedParticipantsError)
      // Continue without excluded participants rather than failing
    }
    
    // Map to expected format
    const excludedParticipants = (excludedParticipantsData || []).map(item => ({
      participant_number: item.participant1_number
    }))
    
    const { data: allParticipants, error } = await supabase
      .from("participants")
      .select("assigned_number, survey_data, mbti_personality_type, attachment_style, communication_style, gender, age, same_gender_preference, any_gender_preference, humor_banter_style, early_openness_comfort, PAID_DONE, signup_for_next_event")
      .eq("match_id", match_id)
      .or(`signup_for_next_event.eq.true,event_id.eq.${eventId}`)  // Participants who signed up for next event OR have current event_id
      .neq("assigned_number", 9999)  // Exclude organizer participant from matching

    if (error) throw error
    if (!allParticipants || allParticipants.length === 0) {
      return res.status(400).json({ error: "No participants found" })
    }

    // Filter out participants without complete data
    console.log(`🔍 Found ${allParticipants.length} participants who signed up for next event OR have event_id=${eventId}`)
    console.log(`🔍 Validating participants for complete data...`)
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
      
      let p1, p2
      
      if (manualMatch.bypassEligibility) {
        console.log(`⚠️ Eligibility bypass enabled - searching ALL participants in database`)
        
        // Fetch ALL participants from database without any filtering for true bypass
        const { data: allDatabaseParticipants, error: bypassError } = await supabase
          .from("participants")
          .select("assigned_number, survey_data, mbti_personality_type, attachment_style, communication_style, gender, age, same_gender_preference, any_gender_preference, humor_banter_style, early_openness_comfort, PAID_DONE, signup_for_next_event")
          .eq("match_id", match_id)
          .neq("assigned_number", 9999)  // Only exclude organizer
        
        if (bypassError) {
          console.error("Error fetching all participants for bypass:", bypassError)
          return res.status(500).json({ error: "Failed to fetch participants for bypass mode" })
        }
        
        console.log(`🔍 BYPASS: Found ${allDatabaseParticipants?.length || 0} total participants in database (no filtering applied)`)
        
        // Use completely unfiltered participants for bypass
        p1 = allDatabaseParticipants?.find(p => p.assigned_number === parseInt(manualMatch.participant1))
        p2 = allDatabaseParticipants?.find(p => p.assigned_number === parseInt(manualMatch.participant2))
        
        if (!p1 || !p2) {
          const missingParticipants = []
          if (!p1) missingParticipants.push(`#${manualMatch.participant1}`)
          if (!p2) missingParticipants.push(`#${manualMatch.participant2}`)
          
          return res.status(400).json({ 
            error: `⚠️ BYPASS MODE: Participant(s) ${missingParticipants.join(' and ')} not found in database.\n\nEven with eligibility bypass enabled, participants must exist in the database to be matched.\n\nPlease verify the participant numbers are correct.`
          })
        }
        
        console.log(`⚠️ BYPASS: Matching participants regardless of ALL eligibility checks:`)
        console.log(`   - #${p1.assigned_number}: survey_data=${!!p1.survey_data}, PAID_DONE=${p1.PAID_DONE}, signup_for_next_event=${p1.signup_for_next_event}`)
        console.log(`   - #${p2.assigned_number}: survey_data=${!!p2.survey_data}, PAID_DONE=${p2.PAID_DONE}, signup_for_next_event=${p2.signup_for_next_event}`)
        console.log(`   - Bypassed filters: event signup, payment status, survey completion, admin exclusions`)
      } else {
        // Find the two specific participants from eligible participants only
        p1 = eligibleParticipants.find(p => p.assigned_number === parseInt(manualMatch.participant1))
        p2 = eligibleParticipants.find(p => p.assigned_number === parseInt(manualMatch.participant2))
        
        if (!p1 || !p2) {
          const missingParticipants = []
          if (!p1) missingParticipants.push(`#${manualMatch.participant1}`)
          if (!p2) missingParticipants.push(`#${manualMatch.participant2}`)
          
          return res.status(400).json({ 
            error: `❌ Participant(s) ${missingParticipants.join(' and ')} not found or not eligible for matching.\n\nPossible reasons:\n• Participant doesn't exist in database\n• Missing survey data\n• Excluded by admin\n• Payment not completed (if required)\n\n💡 Enable "Bypass Eligibility Checks" to override these restrictions.`
          })
        }
        
        console.log(`✅ Standard eligibility: Both participants are eligible for matching`)
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

      // AUTOMATIC CLEANUP: Remove conflicting matches before creating new one
      console.log(`🧹 Cleaning up conflicting matches for participants #${p1.assigned_number} and #${p2.assigned_number}`)
      
      // Find all existing matches for both participants in this event
      const { data: conflictingMatches, error: conflictError } = await supabase
        .from("match_results")
        .select("id, participant_a_number, participant_b_number")
        .eq("event_id", eventId)
        .or(`participant_a_number.eq.${p1.assigned_number},participant_b_number.eq.${p1.assigned_number},participant_a_number.eq.${p2.assigned_number},participant_b_number.eq.${p2.assigned_number}`)

      if (conflictError) {
        console.error("Error finding conflicting matches:", conflictError)
        return res.status(500).json({ error: "Failed to check for conflicting matches" })
      }

      let cleanupSummary = []
      
      if (conflictingMatches && conflictingMatches.length > 0) {
        console.log(`🔍 Found ${conflictingMatches.length} conflicting matches to remove:`)
        
        for (const match of conflictingMatches) {
          const partnerA = match.participant_a_number
          const partnerB = match.participant_b_number
          console.log(`  - Removing match: #${partnerA} ↔ #${partnerB}`)
          
          // Track which participants will no longer have partners
          if (partnerA === p1.assigned_number) {
            cleanupSummary.push(`#${partnerB} no longer has partner`)
          } else if (partnerB === p1.assigned_number) {
            cleanupSummary.push(`#${partnerA} no longer has partner`)
          } else if (partnerA === p2.assigned_number) {
            cleanupSummary.push(`#${partnerB} no longer has partner`)
          } else if (partnerB === p2.assigned_number) {
            cleanupSummary.push(`#${partnerA} no longer has partner`)
          }
        }

        // Delete all conflicting matches
        const { error: deleteError } = await supabase
          .from("match_results")
          .delete()
          .in("id", conflictingMatches.map(m => m.id))

        if (deleteError) {
          console.error("Error deleting conflicting matches:", deleteError)
          return res.status(500).json({ error: "Failed to clean up conflicting matches" })
        }

        console.log(`✅ Successfully removed ${conflictingMatches.length} conflicting matches`)
      } else {
        console.log(`✅ No conflicting matches found - clean swap`)
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
      
      // Use caching system for manual match calculation
      const compatibilityResult = await calculateFullCompatibilityWithCache(p1, p2, skipAI)
      
      const mbtiScore = compatibilityResult.mbtiScore
      const attachmentScore = compatibilityResult.attachmentScore
      const communicationScore = compatibilityResult.communicationScore
      const lifestyleScore = compatibilityResult.lifestyleScore
      const coreValuesScore = compatibilityResult.coreValuesScore
      const vibeScore = compatibilityResult.vibeScore
      const humorBonus = compatibilityResult.humorBonus
      const totalCompatibility = Math.round(compatibilityResult.totalScore)
      
      if (compatibilityResult.cached) {
        console.log(`🎯 Manual match used cached result for #${p1.assigned_number}-#${p2.assigned_number}`)
      }
      
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
        ...(existingEventFinishedStatus !== null && { event_finished: existingEventFinishedStatus }),
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

      // Note: Manual matches create new database records and automatically clean up conflicts
      // The admin panel refresh function will reload fresh data from database to show changes
      console.log(`ℹ️ Manual match added to database with automatic cleanup. Admin panel will reload fresh data on refresh.`)

      // Prepare success message with cleanup summary
      let successMessage = `Manual match created successfully`
      if (cleanupSummary.length > 0) {
        successMessage += `\n\nAutomatic cleanup:\n${cleanupSummary.join('\n')}`
      }

      return res.status(200).json({
        success: true,
        message: successMessage,
        count: 1,
        compatibility_score: totalCompatibility,
        cleanup_summary: cleanupSummary,
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
          vibe_compatibility_score: vibeScore,
          humor_bonus: humorBonus
        }],
        sessionId: null // Manual matches don't create new sessions, they modify existing data
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

      // Insert new group matches
      console.log("💾 Inserting", groupMatches.length, "group matches into group_matches table")
      const { error: insertError } = await supabase
        .from("group_matches")
        .insert(groupMatches)

      if (insertError) {
        console.error("🔥 Error inserting group matches:", insertError)
        throw insertError
      }

      // Auto-save group results to admin_results table
      const sessionId = await autoSaveAdminResults(
        eventId, 
        'group', 
        'ai', // Group matching always uses AI/compatibility calculations
        groupMatches, 
        [], // No calculated pairs for group matching
        [], // participantResults will be generated in admin panel
        { totalTime: 0, cacheHitRate: 0, aiCalls: 0 }, // Basic performance metrics
        false, // skipAI is always false for groups
        excludedPairs, 
        excludedParticipants, 
        [] // No locked matches for groups
      )

      return res.status(200).json({
        message: `✅ Group matching complete - created ${groupMatches.length} groups`,
        count: groupMatches.length,
        results: groupMatches,
        groups: groupMatches.map(match => ({
          group_number: match.group_number,
          participants: [match.participant_a_number, match.participant_b_number, match.participant_c_number, match.participant_d_number, match.participant_e_number, match.participant_f_number].filter(p => p !== null),
          score: match.compatibility_score,
          table_number: match.table_number
        })),
        sessionId: sessionId // Include session ID for reference
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
    
    // Add time tracking
    const startTime = Date.now()
    let cacheHits = 0
    let cacheMisses = 0
    let aiCalls = 0
    
    let processedPairs = 0
    let skippedGender = 0
    let skippedAge = 0
    let skippedInteractionStyle = 0
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
      
      // Check interaction style compatibility (matching determinants)
      if (!checkInteractionStyleCompatibility(a, b)) {
        skippedInteractionStyle++
        continue
      }
      
      // Check if this pair has been matched in previous events
      const hasPreviousMatch = await havePreviousMatch(a.assigned_number, b.assigned_number, eventId)
      if (hasPreviousMatch) {
        skippedPrevious++
        continue
      }
      
      // Use caching system for all compatibility calculations
      const compatibilityResult = await calculateFullCompatibilityWithCache(a, b, skipAI)
      
      // Track cache performance
      if (compatibilityResult.cached) {
        cacheHits++
      } else {
        cacheMisses++
        if (!skipAI) {
          aiCalls++
        }
      }
      
      const mbtiScore = compatibilityResult.mbtiScore
      const attachmentScore = compatibilityResult.attachmentScore
      const communicationScore = compatibilityResult.communicationScore
      const lifestyleScore = compatibilityResult.lifestyleScore
      const coreValuesScore = compatibilityResult.coreValuesScore
      const vibeScore = compatibilityResult.vibeScore
      const humorBonus = compatibilityResult.humorBonus
      const totalScore = compatibilityResult.totalScore
      
      // Extract data for reason string and storage
      const aMBTI = a.mbti_personality_type || a.survey_data?.mbtiType
      const bMBTI = b.mbti_personality_type || b.survey_data?.mbtiType
      const aAttachment = a.attachment_style || a.survey_data?.attachmentStyle
      const bAttachment = b.attachment_style || b.survey_data?.attachmentStyle
      const aCommunication = a.communication_style || a.survey_data?.communicationStyle
      const bCommunication = b.communication_style || b.survey_data?.communicationStyle
      const aLifestyle = a.survey_data?.lifestylePreferences || 
        (a.survey_data?.answers ? 
          [a.survey_data.answers.lifestyle_1, a.survey_data.answers.lifestyle_2, a.survey_data.answers.lifestyle_3, a.survey_data.answers.lifestyle_4, a.survey_data.answers.lifestyle_5].join(',') : 
          null)
      const bLifestyle = b.survey_data?.lifestylePreferences || 
        (b.survey_data?.answers ? 
          [b.survey_data.answers.lifestyle_1, b.survey_data.answers.lifestyle_2, b.survey_data.answers.lifestyle_3, b.survey_data.answers.lifestyle_4, b.survey_data.answers.lifestyle_5].join(',') : 
          null)
      const aCoreValues = a.survey_data?.coreValues || 
        (a.survey_data?.answers ? 
          [a.survey_data.answers.core_values_1, a.survey_data.answers.core_values_2, a.survey_data.answers.core_values_3, a.survey_data.answers.core_values_4, a.survey_data.answers.core_values_5].join(',') : 
          null)
      const bCoreValues = b.survey_data?.coreValues || 
        (b.survey_data?.answers ? 
          [b.survey_data.answers.core_values_1, b.survey_data.answers.core_values_2, b.survey_data.answers.core_values_3, b.survey_data.answers.core_values_4, b.survey_data.answers.core_values_5].join(',') : 
          null)
      
      let reason = `MBTI: ${aMBTI || 'غير محدد'} مع ${bMBTI || 'غير محدد'} (${mbtiScore}%) + التعلق: ${aAttachment || 'غير محدد'} مع ${bAttachment || 'غير محدد'} (${attachmentScore}%) + التواصل: ${aCommunication || 'غير محدد'} مع ${bCommunication || 'غير محدد'} (${communicationScore}%) + نمط الحياة: (${lifestyleScore}%) + القيم الأساسية: (${coreValuesScore}%) + التوافق الشخصي: (${vibeScore}%)`
      
      // Add humor bonus to reason if applicable
      if (humorBonus > 0) {
        reason += ` + مكافأة الدعابة المتشابهة: (+${humorBonus}%)`
      }
      
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
        humorBonus: humorBonus,
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
    const totalSkipped = skippedGender + skippedAge + skippedInteractionStyle + skippedPrevious + skippedExcluded
    if (totalSkipped > 0) {
      console.log(`🚫 Skipped pairs (no calculation):`)
      if (skippedExcluded > 0) console.log(`   ${skippedExcluded} pairs - Admin excluded`)
      if (skippedGender > 0) console.log(`   ${skippedGender} pairs - Gender preference mismatch`)
      if (skippedAge > 0) console.log(`   ${skippedAge} pairs - Age constraint (>5 years with female)`)
      if (skippedInteractionStyle > 0) console.log(`   ${skippedInteractionStyle} pairs - Interaction style incompatible`)
      if (skippedPrevious > 0) console.log(`   ${skippedPrevious} pairs - Previously matched`)
    }
    
    // Calculate and display performance metrics
    const endTime = Date.now()
    const totalTime = endTime - startTime
    const totalCalculations = cacheHits + cacheMisses
    const cacheHitRate = totalCalculations > 0 ? ((cacheHits / totalCalculations) * 100).toFixed(1) : '0.0'
    
    console.log(`📈 Summary: ${compatibilityScores.length} calculated pairs, ${totalSkipped} skipped, ${processedPairs} total`)
    console.log(`⚡ Performance Metrics:`)
    console.log(`   Total time: ${(totalTime / 1000).toFixed(1)}s`)
    console.log(`   Cache hits: ${cacheHits} (${cacheHitRate}%)`)
    console.log(`   Cache misses: ${cacheMisses}`)
    console.log(`   AI calls: ${aiCalls}`)
    console.log(`   Avg time per pair: ${totalCalculations > 0 ? (totalTime / totalCalculations).toFixed(0) : '0'}ms`)

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
            ...(existingEventFinishedStatus !== null && { event_finished: existingEventFinishedStatus }),
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
            ...(existingEventFinishedStatus !== null && { event_finished: existingEventFinishedStatus }),
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
            ...(existingEventFinishedStatus !== null && { event_finished: existingEventFinishedStatus }),
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

    // Insert new matches
    console.log(`💾 Inserting ${finalMatches.length} new matches for match_id: ${match_id}, event_id: ${eventId}`)
    const { error: insertError } = await supabase
      .from("match_results")
      .insert(finalMatches)
    if (insertError) {
      console.error("🔥 Error inserting matches:", insertError)
      throw insertError
    }

    // Prepare data for response and auto-save
    const performance = {
      totalTime: totalTime,
      totalTimeSeconds: (totalTime / 1000).toFixed(1),
      cacheHits: cacheHits,
      cacheMisses: cacheMisses,
      cacheHitRate: parseFloat(cacheHitRate),
      aiCalls: aiCalls,
      totalCalculations: totalCalculations,
      avgTimePerPair: totalCalculations > 0 ? Math.round(totalTime / totalCalculations) : 0
    }

    const calculatedPairs = compatibilityScores.map(pair => ({
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

    // Auto-save results to admin_results table
    const generationType = skipAI ? 'no-ai' : (cacheHits > 0 ? 'cached' : 'ai')
    const sessionId = await autoSaveAdminResults(
      eventId, 
      'individual', 
      generationType, 
      finalMatches, 
      calculatedPairs, 
      [], // participantResults will be generated in admin panel
      performance, 
      skipAI, 
      excludedPairs, 
      excludedParticipants, 
      lockedPairs
    )

    return res.status(200).json({
      message: `✅ Matching complete for ${rounds} rounds (MBTI + Attachment + Communication + Lifestyle + Core Values + Vibe${skipAI ? ' - AI skipped' : ''})`,
      count: finalMatches.length,
      results: finalMatches,
      performance: performance,
      calculatedPairs: calculatedPairs,
      sessionId: sessionId // Include session ID for reference
    })

  } catch (err) {
    console.error("🔥 Matching error:", err)
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
}

