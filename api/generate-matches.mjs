import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

      const { round, match_type = "محايد" } = req.body
  const match_id = "00000000-0000-0000-0000-000000000000"

  console.log(`Generating matches for round ${round}, type: ${match_type}`);

  if (!round) {
    return res.status(400).json({ error: "Round number is required" })
  }

  try {
    // Get all participants who completed the form
    console.log("Getting all participants...");
    const { data: allParticipants, error } = await supabase
      .from("participants")
      .select("assigned_number, survey_data, gender")
      .eq("match_id", match_id)
      .neq("assigned_number", 9999)  // Exclude organizer participant from matching
      .not("survey_data", "is", null)

    if (error) {
      console.error("Error fetching participants:", error);
      throw error;
    }

    console.log(`Found ${allParticipants.length} participants total`);

    if (allParticipants.length < 2) {
      console.log(`Not enough participants: ${allParticipants.length}`);
      return res.status(400).json({ error: "Not enough participants for matching" })
    }

    console.log(`Starting ${match_type} matching for ${allParticipants.length} participants`);

    if (match_type === "محايد" && round === 0) {
      // Group matching logic
      const result = await generateGroupMatches(allParticipants, round, match_id)
      return res.status(200).json(result)
    } else {
      // Individual matching logic - now generates all 4 rounds globally
      const result = await generateGlobalIndividualMatches(allParticipants, match_id)
      return res.status(200).json(result)
    }

  } catch (error) {
    console.error("Error generating matches:", error)
    return res.status(500).json({ error: error.message })
  }
}

// Function to check gender compatibility (opposite gender only)
function checkGenderCompatibility(participantA, participantB) {
  const genderA = participantA.gender || participantA.survey_data?.gender
  const genderB = participantB.gender || participantB.survey_data?.gender
  
  // If gender information is missing, allow the match (fallback)
  if (!genderA || !genderB) {
    console.warn(`⚠️ Missing gender info for participants ${participantA.assigned_number} or ${participantB.assigned_number}`)
    return true
  }
  
  // Only allow opposite gender matching
  const isCompatible = genderA !== genderB
  if (!isCompatible) {
    console.log(`🚫 Gender mismatch: ${participantA.assigned_number} (${genderA}) vs ${participantB.assigned_number} (${genderB})`)
  }
  
  return isCompatible
}

// Function to create gender-balanced groups for group matching
function createGenderBalancedGroup(participants, targetSize) {
  const males = participants.filter(p => (p.gender || p.survey_data?.gender) === 'male')
  const females = participants.filter(p => (p.gender || p.survey_data?.gender) === 'female')
  
  // For groups, we want a mix of genders but don't enforce strict opposite-gender pairs
  // This is different from individual matching where we strictly require opposite genders
  const group = []
  
  // Try to balance genders in the group
  const halfSize = Math.floor(targetSize / 2)
  const malesToAdd = Math.min(halfSize, males.length)
  const femalesToAdd = Math.min(halfSize, females.length)
  
  // Add males and females
  group.push(...males.slice(0, malesToAdd))
  group.push(...females.slice(0, femalesToAdd))
  
  // Fill remaining slots with any available participants
  const remainingSlots = targetSize - group.length
  const remainingParticipants = participants.filter(p => !group.includes(p))
  group.push(...remainingParticipants.slice(0, remainingSlots))
  
  return group.slice(0, targetSize)
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

async function generateGlobalIndividualMatches(participants, match_id) {
  console.log(`Starting global individual matching for ${participants.length} participants`);
  
  // Create organizer participant if it doesn't exist
  await ensureOrganizerParticipant(match_id);
  
  // Generate all possible pairs
  const pairs = []
  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      pairs.push([participants[i], participants[j]])
    }
  }

  console.log(`Generated ${pairs.length} possible pairs`);

  // Generate compatibility scores using AI for all pairs
  const compatibilityScores = []
  
  for (const [participantA, participantB] of pairs) {
    // Check gender compatibility first (opposite gender only)
    if (!checkGenderCompatibility(participantA, participantB)) {
      console.log(`🚫 Skipping pair ${participantA.assigned_number} × ${participantB.assigned_number} - same gender`)
      continue
    }
    
    // Extract relevant survey data for compatibility analysis
    const participantAData = participantA.survey_data?.answers || {};
    const participantBData = participantB.survey_data?.answers || {};
    
    const prompt = `تحليل التوافق بين شخصين:

المشارك ${participantA.assigned_number}:
- الجنس: ${participantAData.gender || 'غير محدد'}
- الفئة العمرية: ${participantAData.ageGroup || 'غير محدد'}
- هدف المشاركة: ${participantAData.participationGoal || 'غير محدد'}
- المستوى التعليمي: ${participantAData.educationLevel || 'غير محدد'}
- القيم الجوهرية: ${Array.isArray(participantAData.coreValues) ? participantAData.coreValues.join(', ') : participantAData.coreValues || 'غير محدد'}
- الانفتاح الذهني: ${participantAData.mentalOpenness || 'غير محدد'}
- نمط عطلة نهاية الأسبوع: ${participantAData.weekendStyle || 'غير محدد'}
- طريقة التفكير: ${participantAData.thinkingStyle || 'غير محدد'}
- اتخاذ القرارات: ${participantAData.decisionMaking || 'غير محدد'}
- التنظيم والعفوية: ${participantAData.organizationStyle || 'غير محدد'}
- التعبير العاطفي: ${participantAData.emotionalExpression || 'غير محدد'}
- المغامرة مقابل الاستقرار: ${participantAData.adventureVsStability || 'غير محدد'}
- النشاط اليومي: ${participantAData.dailyActivity || 'غير محدد'}
- علاقة العائلة: ${participantAData.familyRelationship || 'غير محدد'}
- الرغبة في الأطفال: ${participantAData.childrenDesire || 'غير محدد'}
- حل الخلافات: ${participantAData.conflictResolution || 'غير محدد'}
- الهوايات: ${Array.isArray(participantAData.hobbies) ? participantAData.hobbies.join(', ') : participantAData.hobbies || 'غير محدد'}

المشارك ${participantB.assigned_number}:
- الجنس: ${participantBData.gender || 'غير محدد'}
- الفئة العمرية: ${participantBData.ageGroup || 'غير محدد'}
- هدف المشاركة: ${participantBData.participationGoal || 'غير محدد'}
- المستوى التعليمي: ${participantBData.educationLevel || 'غير محدد'}
- القيم الجوهرية: ${Array.isArray(participantBData.coreValues) ? participantBData.coreValues.join(', ') : participantBData.coreValues || 'غير محدد'}
- الانفتاح الذهني: ${participantBData.mentalOpenness || 'غير محدد'}
- نمط عطلة نهاية الأسبوع: ${participantBData.weekendStyle || 'غير محدد'}
- طريقة التفكير: ${participantBData.thinkingStyle || 'غير محدد'}
- اتخاذ القرارات: ${participantBData.decisionMaking || 'غير محدد'}
- التنظيم والعفوية: ${participantBData.organizationStyle || 'غير محدد'}
- التعبير العاطفي: ${participantBData.emotionalExpression || 'غير محدد'}
- المغامرة مقابل الاستقرار: ${participantBData.adventureVsStability || 'غير محدد'}
- النشاط اليومي: ${participantBData.dailyActivity || 'غير محدد'}
- علاقة العائلة: ${participantBData.familyRelationship || 'غير محدد'}
- الرغبة في الأطفال: ${participantBData.childrenDesire || 'غير محدد'}
- حل الخلافات: ${participantBData.conflictResolution || 'غير محدد'}
- الهوايات: ${Array.isArray(participantBData.hobbies) ? participantBData.hobbies.join(', ') : participantBData.hobbies || 'غير محدد'}

قيّم التوافق بين هذين الشخصين من 0 إلى 100، واكتب سبباً مختصراً باللغة العربية. أجب بالتنسيق التالي فقط:
الدرجة: [رقم من 0-100]
السبب: [سبب التوافق أو عدم التوافق]`

    try {
      console.log(`Analyzing compatibility between ${participantA.assigned_number} and ${participantB.assigned_number}`);
      
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 150,
        temperature: 0.7,
      })

      const response = completion.choices[0].message.content
      const scoreMatch = response.match(/الدرجة:\s*(\d+)/)
      const reasonMatch = response.match(/السبب:\s*(.+)/)

      const score = scoreMatch ? parseInt(scoreMatch[1]) : 50
      const reason = reasonMatch ? reasonMatch[1].trim() : "تحليل التوافق غير متوفر"

      console.log(`Compatibility score: ${score} for ${participantA.assigned_number} and ${participantB.assigned_number}`);

      compatibilityScores.push({
        participantA: participantA.assigned_number,
        participantB: participantB.assigned_number,
        score,
        reason
      })
    } catch (error) {
      console.error(`AI analysis error for ${participantA.assigned_number} and ${participantB.assigned_number}:`, error)
      compatibilityScores.push({
        participantA: participantA.assigned_number,
        participantB: participantB.assigned_number,
        score: 50,
        reason: "لم نتمكن من تحليل التوافق"
      })
    }
  }

  console.log(`Generated ${compatibilityScores.length} compatibility scores`);

  // Sort by compatibility score (descending) for global optimization
  compatibilityScores.sort((a, b) => b.score - a.score)
  
  console.log("Top 10 compatibility scores:");
  compatibilityScores.slice(0, 10).forEach((pair, index) => {
    console.log(`${index + 1}. ${pair.participantA}-${pair.participantB}: ${pair.score}%`);
  });

  // Generate all 4 rounds with proper global optimization
  const allMatches = []
  const usedPairs = new Set() // Track used pairs across all rounds
  const participantRoundCount = new Map() // Track how many times each participant has been matched

  // Initialize participant round count
  participants.forEach(p => participantRoundCount.set(p.assigned_number, 0))

  // Generate matches for 1 round only (single round mode)
  for (let round = 1; round <= 1; round++) {
    console.log(`\n=== Generating matches for round ${round} ===`);
    
    const roundMatches = []
    const roundUsedParticipants = new Set()

    // Debug: Show participant availability before this round
    console.log(`Before Round ${round} - Participant round counts:`, 
      Array.from(participantRoundCount.entries()).map(([p, count]) => `${p}:${count}`).join(', '));

    // Find the best available pairs for this round (GLOBAL SORTING)
    for (const pair of compatibilityScores) {
      const pairKey = `${Math.min(pair.participantA, pair.participantB)}-${Math.max(pair.participantA, pair.participantB)}`
      
      // Debug: Track participant 9 specifically
      if (pair.participantA === 9 || pair.participantB === 9) {
        const otherParticipant = pair.participantA === 9 ? pair.participantB : pair.participantA;
        console.log(`Round ${round} - Checking pair 9-${otherParticipant} (score: ${pair.score}):`);
        console.log(`  - Used pairs has 9-${otherParticipant}: ${usedPairs.has(pairKey)}`);
        console.log(`  - 9 in round used: ${roundUsedParticipants.has(9)}`);
        console.log(`  - ${otherParticipant} in round used: ${roundUsedParticipants.has(otherParticipant)}`);
        console.log(`  - 9 round count: ${participantRoundCount.get(9)}`);
        console.log(`  - ${otherParticipant} round count: ${participantRoundCount.get(otherParticipant)}`);
      }
      
      // Check if this pair hasn't been used before AND participants are available
      if (!usedPairs.has(pairKey) && 
          !roundUsedParticipants.has(pair.participantA) && 
          !roundUsedParticipants.has(pair.participantB) &&
          participantRoundCount.get(pair.participantA) < 1 &&
          participantRoundCount.get(pair.participantB) < 1) {
        
        console.log(`Round ${round}: Assigning ${pair.participantA}-${pair.participantB} (score: ${pair.score})`);
        
        roundMatches.push({
          participant_a_number: pair.participantA,
          participant_b_number: pair.participantB,
          compatibility_score: pair.score,
          reason: pair.reason,
          match_id,
          round,
          table_number: roundMatches.length + 1  // Dynamic table numbering: 1, 2, 3, 4...
        })
        
        usedPairs.add(pairKey)
        roundUsedParticipants.add(pair.participantA)
        roundUsedParticipants.add(pair.participantB)
        participantRoundCount.set(pair.participantA, participantRoundCount.get(pair.participantA) + 1)
        participantRoundCount.set(pair.participantB, participantRoundCount.get(pair.participantB) + 1)
        
        // Debug: Track participant 9 specifically
        if (pair.participantA === 9 || pair.participantB === 9) {
          console.log(`Round ${round} - ASSIGNED pair with 9! New count for 9: ${participantRoundCount.get(9)}`);
        }
      }
    }

    // Handle odd participants for this round
    const unusedInRound = participants
      .map(p => p.assigned_number)
      .filter(num => !roundUsedParticipants.has(num) && participantRoundCount.get(num) < 2)

    console.log(`Round ${round} unused participants:`, unusedInRound);
    
    // Debug: Check if 9 is in unused participants
    if (unusedInRound.includes(9)) {
      console.log(`Round ${round} - Participant 9 is available for odd participant matching`);
    } else {
      console.log(`Round ${round} - Participant 9 is NOT available. Round used: ${roundUsedParticipants.has(9)}, Count: ${participantRoundCount.get(9)}`);
    }

    if (unusedInRound.length === 1) {
      // Find the best available match for the odd participant
      const oddParticipant = unusedInRound[0]
      let bestMatch = null
      let bestScore = -1

      for (const pair of compatibilityScores) {
        const pairKey = `${Math.min(pair.participantA, pair.participantB)}-${Math.max(pair.participantA, pair.participantB)}`
        
        if ((pair.participantA === oddParticipant || pair.participantB === oddParticipant) && 
            !usedPairs.has(pairKey) &&
            participantRoundCount.get(pair.participantA === oddParticipant ? pair.participantB : pair.participantA) < 4) {
          if (pair.score > bestScore) {
            bestScore = pair.score
            bestMatch = pair
          }
        }
      }

      if (bestMatch) {
        console.log(`Round ${round}: Best match for odd participant ${oddParticipant}: ${bestMatch.participantA}-${bestMatch.participantB} (score: ${bestMatch.score})`);
        roundMatches.push({
          participant_a_number: bestMatch.participantA,
          participant_b_number: bestMatch.participantB,
          compatibility_score: bestMatch.score,
          reason: bestMatch.reason,
          match_id,
          round,
          table_number: roundMatches.length + 1
        })
        
        const pairKey = `${Math.min(bestMatch.participantA, bestMatch.participantB)}-${Math.max(bestMatch.participantA, bestMatch.participantB)}`
        usedPairs.add(pairKey)
        participantRoundCount.set(bestMatch.participantA, participantRoundCount.get(bestMatch.participantA) + 1)
        participantRoundCount.set(bestMatch.participantB, participantRoundCount.get(bestMatch.participantB) + 1)
      } else {
        // No suitable match found, create a solo entry
        console.log(`Round ${round}: No suitable match for ${oddParticipant}, creating solo entry`);
        roundMatches.push({
          participant_a_number: oddParticipant,  // The actual participant
          participant_b_number: 9999,           // Use 9999 to represent organizer
          compatibility_score: 0,
          reason: "لم نجد شريكاً مناسباً. سيجلس مع المنظم.",
          match_id,
          round,
          table_number: roundMatches.length + 1
        })
        participantRoundCount.set(oddParticipant, participantRoundCount.get(oddParticipant) + 1)
      }
    }

    console.log(`Round ${round}: Created ${roundMatches.length} matches`);
    console.log(`Round ${round} matches:`, roundMatches.map(m => `${m.participant_a_number}-${m.participant_b_number} (${m.compatibility_score})`));
    allMatches.push(...roundMatches)
  }

  console.log(`\nTotal matches to save: ${allMatches.length}`);

  // Save all matches to database
  const { error: insertError } = await supabase
    .from("match_results")
    .insert(allMatches)

  if (insertError) {
    console.error("Error inserting matches:", insertError)
    throw new Error("Failed to save matches")
  }

  console.log(`Successfully saved ${allMatches.length} matches to database`);

  return {
    success: true,
    matches: allMatches.length,
    participants: participants.length,
    rounds: 4,
            analysis: `تم إنشاء ${allMatches.length} مقابلة فردية لجميع الجولتين`
  }
}

async function generateGroupMatches(participants, round, match_id) {
  console.log(`Starting enhanced group matching for ${participants.length} participants`);
  
  // For group phase, create groups of 3-6 people with smart fallback handling
  const groups = []
  const shuffledParticipants = [...participants].sort(() => Math.random() - 0.5)
  
  console.log(`Shuffled ${shuffledParticipants.length} participants for grouping`);
  
  // Enhanced grouping algorithm with fallback support and gender balance
  let i = 0
  while (i < shuffledParticipants.length) {
    const remaining = shuffledParticipants.length - i
    
    if (remaining >= 4) {
      // Create groups of 4 when possible with gender balance
      const availableParticipants = shuffledParticipants.slice(i)
      const group = createGenderBalancedGroup(availableParticipants, 4)
      if (group.length === 4) {
        groups.push({
          group_id: `group_${groups.length + 1}`,
          participant_numbers: group.map(p => p.assigned_number),
          compatibility_score: 75, // Default group score
          reason: `مجموعة من ${group.length} أشخاص للعمل الجماعي`,
          match_id,
          table_number: groups.length + 1,
          // Support for up to 6 participants
          participant_a: group[0]?.assigned_number || null,
          participant_b: group[1]?.assigned_number || null,
          participant_c: group[2]?.assigned_number || null,
          participant_d: group[3]?.assigned_number || null,
          participant_e: null, // Will be filled by fallback logic
          participant_f: null  // Will be filled by fallback logic
        })
        i += 4
      } else {
        // If we can't create a group of 4, fall back to creating smaller groups
        const group = shuffledParticipants.slice(i, i + 3)
        groups.push({
          group_id: `group_${groups.length + 1}`,
          participant_numbers: group.map(p => p.assigned_number),
          compatibility_score: 75,
          reason: `مجموعة من ${group.length} أشخاص للعمل الجماعي`,
          match_id,
          table_number: groups.length + 1,
          participant_a: group[0]?.assigned_number || null,
          participant_b: group[1]?.assigned_number || null,
          participant_c: group[2]?.assigned_number || null,
          participant_d: null,
          participant_e: null,
          participant_f: null
        })
        i += 3
      }
    } else if (remaining === 3) {
      // Perfect group of 3
      const group = shuffledParticipants.slice(i, i + 3)
      groups.push({
        group_id: `group_${groups.length + 1}`,
        participant_numbers: group.map(p => p.assigned_number),
        compatibility_score: 75,
        reason: `مجموعة من ${group.length} أشخاص للعمل الجماعي`,
        match_id,
        table_number: groups.length + 1,
        participant_a: group[0]?.assigned_number || null,
        participant_b: group[1]?.assigned_number || null,
        participant_c: group[2]?.assigned_number || null,
        participant_d: null,
        participant_e: null,
        participant_f: null
      })
      i += 3
    } else if (remaining === 2) {
      // 2 extra people - add to most suitable existing group
      const extras = shuffledParticipants.slice(i, i + 2)
      if (groups.length > 0) {
        // Find a group that can accommodate 2 more (current size <= 4)
        const targetGroup = groups.find(g => g.participant_numbers.length <= 4)
        if (targetGroup) {
          targetGroup.participant_numbers.push(...extras.map(p => p.assigned_number))
          targetGroup.reason = `مجموعة من ${targetGroup.participant_numbers.length} أشخاص للعمل الجماعي`
          
          // Update participant slots
          if (targetGroup.participant_numbers.length === 5) {
            targetGroup.participant_e = extras[0].assigned_number
          } else if (targetGroup.participant_numbers.length === 6) {
            targetGroup.participant_e = extras[0].assigned_number
            targetGroup.participant_f = extras[1].assigned_number
          }
          
          console.log(`✅ Added ${extras.length} participants to existing group: [${targetGroup.participant_numbers.join(', ')}]`)
        } else {
          // Create new small group
          groups.push({
            group_id: `group_${groups.length + 1}`,
            participant_numbers: extras.map(p => p.assigned_number),
            compatibility_score: 70,
            reason: `مجموعة من ${extras.length} أشخاص للعمل الجماعي`,
            match_id,
            table_number: groups.length + 1,
            participant_a: extras[0]?.assigned_number || null,
            participant_b: extras[1]?.assigned_number || null,
            participant_c: null,
            participant_d: null,
            participant_e: null,
            participant_f: null
          })
        }
      } else {
        // No existing groups, create new group
        groups.push({
          group_id: `group_${groups.length + 1}`,
          participant_numbers: extras.map(p => p.assigned_number),
          compatibility_score: 70,
          reason: `مجموعة من ${extras.length} أشخاص للعمل الجماعي`,
          match_id,
          table_number: groups.length + 1,
          participant_a: extras[0]?.assigned_number || null,
          participant_b: extras[1]?.assigned_number || null,
          participant_c: null,
          participant_d: null,
          participant_e: null,
          participant_f: null
        })
      }
      i += 2
    } else if (remaining === 1) {
      // 1 extra person - add to most suitable existing group
      const extra = shuffledParticipants[i]
      if (groups.length > 0) {
        // Find a group that can accommodate 1 more (current size <= 5)
        const targetGroup = groups.find(g => g.participant_numbers.length <= 5)
        if (targetGroup) {
          targetGroup.participant_numbers.push(extra.assigned_number)
          targetGroup.reason = `مجموعة من ${targetGroup.participant_numbers.length} أشخاص للعمل الجماعي`
          
          // Update participant slots
          if (targetGroup.participant_numbers.length === 5) {
            targetGroup.participant_e = extra.assigned_number
          } else if (targetGroup.participant_numbers.length === 6) {
            targetGroup.participant_f = extra.assigned_number
          }
          
          console.log(`✅ Added 1 participant to existing group: [${targetGroup.participant_numbers.join(', ')}]`)
        } else {
          // All groups are full (6 people each), create new single-person group
          groups.push({
            group_id: `group_${groups.length + 1}`,
            participant_numbers: [extra.assigned_number],
            compatibility_score: 60,
            reason: `مجموعة من شخص واحد`,
            match_id,
            table_number: groups.length + 1,
            participant_a: extra.assigned_number,
            participant_b: null,
            participant_c: null,
            participant_d: null,
            participant_e: null,
            participant_f: null
          })
        }
      }
      i += 1
    } else {
      break // Should not happen
    }
  }

  console.log(`Created ${groups.length} groups with enhanced fallback handling`);
  groups.forEach((group, index) => {
    console.log(`  Group ${index + 1}: [${group.participant_numbers.join(', ')}] (${group.participant_numbers.length} people)`)
  })

  // Convert to database format for match_results table
  const databaseGroups = groups.map(group => ({
    participant_a_number: group.participant_a,
    participant_b_number: group.participant_b,
    participant_c_number: group.participant_c,
    participant_d_number: group.participant_d,
    participant_e_number: group.participant_e,  // New fallback slot
    participant_f_number: group.participant_f,  // New fallback slot
    compatibility_score: group.compatibility_score,
    reason: group.reason,
    match_id: group.match_id,
    round: 0, // Group phase
    group_number: parseInt(group.group_id.split('_')[1]),
    table_number: group.table_number,
    is_repeat_match: false
  }))

  // Save group matches to database (using match_results table)
  const { error: insertError } = await supabase
    .from("match_results")
    .insert(databaseGroups)

  if (insertError) {
    console.error("Error inserting group matches:", insertError)
    throw new Error("Failed to save group matches")
  }

  console.log(`Successfully saved ${groups.length} enhanced groups to database`);

  return {
    success: true,
    groups: groups.length,
    participants: participants.length,
    analysis: `تم إنشاء ${groups.length} مجموعة محسنة للجولة ${round} مع دعم الأشخاص الإضافيين`
  }
}
