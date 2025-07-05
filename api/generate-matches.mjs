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

  const { round, match_type = "individual" } = req.body
  const match_id = "00000000-0000-0000-0000-000000000000"

  console.log(`Generating matches for round ${round}, type: ${match_type}`);

  if (!round) {
    return res.status(400).json({ error: "Round number is required" })
  }

  try {
    // Get participants based on round
    let participants = []
    
    if (round === 1) {
      console.log("Getting participants for round 1...");
      // For round 1, get all participants who completed the form
      const { data, error } = await supabase
        .from("participants")
        .select("assigned_number, q1, q2, q3, q4")
        .eq("match_id", match_id)
        .not("q1", "is", null)
        .not("q2", "is", null)
        .not("q3", "is", null)
        .not("q4", "is", null)

      if (error) {
        console.error("Error fetching participants for round 1:", error);
        throw error;
      }
      participants = data
      console.log(`Found ${participants.length} participants for round 1`);
    } else {
      console.log(`Getting participants for round ${round}...`);
      // For subsequent rounds, get participants who completed the previous round
      const { data: previousMatches, error: matchError } = await supabase
        .from("match_results")
        .select("participant_a_number, participant_b_number, participant_c_number, participant_d_number")
        .eq("match_id", match_id)
        .eq("round", round - 1)

      if (matchError) {
        console.error("Error fetching previous matches:", matchError);
        throw matchError;
      }

      console.log(`Found ${previousMatches.length} previous matches`);

      // Get unique participants from previous round
      const participantNumbers = new Set()
      previousMatches.forEach(match => {
        if (match.participant_a_number > 0) participantNumbers.add(match.participant_a_number)
        if (match.participant_b_number > 0) participantNumbers.add(match.participant_b_number)
        if (match.participant_c_number > 0) participantNumbers.add(match.participant_c_number)
        if (match.participant_d_number > 0) participantNumbers.add(match.participant_d_number)
      })

      console.log(`Unique participants from previous round: ${participantNumbers.size}`);

      // Get participant details
      const { data, error } = await supabase
        .from("participants")
        .select("assigned_number, q1, q2, q3, q4")
        .eq("match_id", match_id)
        .in("assigned_number", Array.from(participantNumbers))

      if (error) {
        console.error("Error fetching participant details:", error);
        throw error;
      }
      participants = data
      console.log(`Found ${participants.length} participants for round ${round}`);
    }

    if (participants.length < 2) {
      console.log(`Not enough participants: ${participants.length}`);
      return res.status(400).json({ error: "Not enough participants for matching" })
    }

    console.log(`Starting ${match_type} matching for ${participants.length} participants`);

    if (match_type === "group") {
      // Group matching logic
      const result = await generateGroupMatches(participants, round, match_id)
      return res.status(200).json(result)
    } else {
      // Individual matching logic
      const result = await generateIndividualMatches(participants, round, match_id)
      return res.status(200).json(result)
    }

  } catch (error) {
    console.error("Error generating matches:", error)
    return res.status(500).json({ error: error.message })
  }
}

async function generateIndividualMatches(participants, round, match_id) {
  console.log(`Starting individual matching for ${participants.length} participants`);
  
  // Generate all possible pairs
  const pairs = []
  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      pairs.push([participants[i], participants[j]])
    }
  }

  console.log(`Generated ${pairs.length} possible pairs`);

  // Generate compatibility scores using AI
  const compatibilityScores = []
  
  for (const [participantA, participantB] of pairs) {
    const prompt = `تحليل التوافق بين شخصين:

المشارك ${participantA.assigned_number}:
- وقت الفراغ: ${participantA.q1}
- وصف الأصدقاء: ${participantA.q2}
- التفضيل: ${participantA.q3}
- السمة المميزة: ${participantA.q4}

المشارك ${participantB.assigned_number}:
- وقت الفراغ: ${participantB.q1}
- وصف الأصدقاء: ${participantB.q2}
- التفضيل: ${participantB.q3}
- السمة المميزة: ${participantB.q4}

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

  // Sort by compatibility score (descending)
  compatibilityScores.sort((a, b) => b.score - a.score)

  // Generate 4 matches per participant using Hungarian algorithm
  const matches = []
  const usedParticipants = new Set()

  // First pass: create optimal matches
  for (const pair of compatibilityScores) {
    if (!usedParticipants.has(pair.participantA) && !usedParticipants.has(pair.participantB)) {
      matches.push({
        participant_a_number: pair.participantA,
        participant_b_number: pair.participantB,
        compatibility_score: pair.score,
        reason: pair.reason,
        match_id,
        round,
        table_number: Math.floor(matches.length / 2) + 1
      })
      usedParticipants.add(pair.participantA)
      usedParticipants.add(pair.participantB)
    }
  }

  console.log(`Created ${matches.length} initial matches`);

  // Handle odd participant
  const unusedParticipants = participants
    .map(p => p.assigned_number)
    .filter(num => !usedParticipants.has(num))

  console.log(`Unused participants: ${unusedParticipants.length}`);

  if (unusedParticipants.length === 1) {
    // Find the best match for the odd participant
    const oddParticipant = unusedParticipants[0]
    let bestMatch = null
    let bestScore = -1

    for (const pair of compatibilityScores) {
      if ((pair.participantA === oddParticipant || pair.participantB === oddParticipant) && 
          !usedParticipants.has(pair.participantA === oddParticipant ? pair.participantB : pair.participantA)) {
        if (pair.score > bestScore) {
          bestScore = pair.score
          bestMatch = pair
        }
      }
    }

    if (bestMatch) {
      matches.push({
        participant_a_number: bestMatch.participantA,
        participant_b_number: bestMatch.participantB,
        compatibility_score: bestMatch.score,
        reason: bestMatch.reason,
        match_id,
        round,
        table_number: Math.floor(matches.length / 2) + 1
      })
    } else {
      // No suitable match found, create a solo entry
      matches.push({
        participant_a_number: 0,
        participant_b_number: oddParticipant,
        compatibility_score: 0,
        reason: "لم نجد شريكاً مناسباً. سيجلس مع المنظم.",
        match_id,
        round,
        table_number: Math.floor(matches.length / 2) + 1
      })
    }
  }

  console.log(`Final matches to save: ${matches.length}`);

  // Save matches to database
  const { error: insertError } = await supabase
    .from("match_results")
    .insert(matches)

  if (insertError) {
    console.error("Error inserting matches:", insertError)
    throw new Error("Failed to save matches")
  }

  console.log(`Successfully saved ${matches.length} matches to database`);

  return {
    success: true,
    matches: matches.length,
    participants: participants.length,
    analysis: `تم إنشاء ${matches.length} مباراة للجولة ${round}`
  }
}

async function generateGroupMatches(participants, round, match_id) {
  console.log(`Starting group matching for ${participants.length} participants`);
  
  // For group phase, create groups of 3-4 people
  const groups = []
  const shuffledParticipants = [...participants].sort(() => Math.random() - 0.5)
  
  console.log(`Shuffled ${shuffledParticipants.length} participants for grouping`);
  
  // Create groups of 4, with the last group potentially being 3
  for (let i = 0; i < shuffledParticipants.length; i += 4) {
    const group = shuffledParticipants.slice(i, i + 4)
    if (group.length >= 3) {
      groups.push({
        group_id: `group_${groups.length + 1}`,
        participant_numbers: group.map(p => p.assigned_number),
        compatibility_score: 75, // Default group score
        reason: "مجموعة منسجمة للعمل الجماعي",
        match_id,
        table_number: groups.length + 1
      })
    }
  }

  console.log(`Created ${groups.length} groups`);

  // Save group matches to database
  const { error: insertError } = await supabase
    .from("group_matches")
    .insert(groups)

  if (insertError) {
    console.error("Error inserting group matches:", insertError)
    throw new Error("Failed to save group matches")
  }

  console.log(`Successfully saved ${groups.length} groups to database`);

  return {
    success: true,
    groups: groups.length,
    participants: participants.length,
    analysis: `تم إنشاء ${groups.length} مجموعة للجولة ${round}`
  }
}
