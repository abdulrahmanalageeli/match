import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

  try {
    // 1. Fetch participants
    const { data: participants, error } = await supabase
      .from("participants")
      .select("assigned_number, q1, q2, q3, q4")
      .eq("match_id", match_id)

    if (error) throw error
    if (!participants || participants.length < 2) {
      return res.status(400).json({ error: "Not enough participants" })
    }

    const numbers = participants.map(p => p.assigned_number)
    const pairs = []
    const scores = {}

    // 2. Generate all unique pairs
    for (let i = 0; i < participants.length; i++) {
      for (let j = i + 1; j < participants.length; j++) {
        pairs.push([participants[i], participants[j]])
      }
    }

    // 3. Build single GPT prompt for all pairs
    const prompt = pairs.map(([a, b]) => (
      `المشارك ${a.assigned_number}:\n- ${a.q1 ?? ""}\n- ${a.q2 ?? ""}\n- ${a.q3 ?? ""}\n- ${a.q4 ?? ""}\n` +
      `المشارك ${b.assigned_number}:\n- ${b.q1 ?? ""}\n- ${b.q2 ?? ""}\n- ${b.q3 ?? ""}\n- ${b.q4 ?? ""}`
    )).join("\n\n")

    const systemMsg = `
أنت مساعد توافق بين المشاركين. قيّم نسبة التوافق من 0 إلى 100٪ لكل زوج، واذكر السبب باختصار.
استخدم فقط هذه الصيغة لكل زوج:
[A]-[B]: 74% - سبب مختصر
`.trim()

    const response = await openai.chat.completions.create({
model: "gpt-4-turbo",
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: prompt }
      ],
      temperature: 0.3
    })

    const lines = response.choices?.[0]?.message?.content?.trim().split("\n") || []
for (const line of lines) {
  if (!line.trim()) continue

  let match = line.match(/المشارك\s*(\d+)\s*-\s*المشارك\s*(\d+):\s*(\d{1,3})%\s*-\s*(.+)/)
  if (!match) {
    match = line.match(/^(\d+)-(\d+):\s*(\d{1,3})%\s*-\s*(.+)$/)
  }

  if (!match) {
    console.warn("⚠️ Could not parse line:", line)
    continue
  }

  const [, a, b, score, reason] = match
  scores[`${a}-${b}`] = {
    score: Number(score),
    reason: reason.trim()
  }
}

    // 4. Build scored pairs (only with positive score)
    const allPairs = []
    for (let i = 0; i < numbers.length; i++) {
      for (let j = i + 1; j < numbers.length; j++) {
        const key1 = `${numbers[i]}-${numbers[j]}`
        const key2 = `${numbers[j]}-${numbers[i]}`
        const entry = scores[key1] || scores[key2]
        if (entry && entry.score > 0) {
          allPairs.push({
            a: numbers[i],
            b: numbers[j],
            score: entry.score,
            reason: entry.reason
          })
        }
      }
    }

    // 5. Sort pairs by score descending
    allPairs.sort((p1, p2) => p2.score - p1.score)

    // 6. Greedy Matching
    const matched = new Set()
    const results = []

    for (const pair of allPairs) {
      if (!matched.has(pair.a) && !matched.has(pair.b)) {
        matched.add(pair.a)
        matched.add(pair.b)
        results.push({
          participant_a_number: pair.a,
          participant_b_number: pair.b,
          compatibility_score: pair.score,
          match_type: "توأم روح",
          reason: pair.reason,
          match_id
        })
      }
    }

    // 7. Handle unmatched
    const unmatched = numbers.filter(n => !matched.has(n))

if (unmatched.length === 1) {
  const lone = unmatched[0]
  results.push({
    participant_a_number: 0, // you
    participant_b_number: lone,
    compatibility_score: 0,
    match_type: "توأم روح (منظم)",
    reason: "تم توصيله بك لعدم وجود شريك متبقي.",
    match_id
  })
} else if (unmatched.length > 1) {
  // This should rarely ever happen
  for (const num of unmatched) {
    results.push({
      participant_a_number: num,
      participant_b_number: 0,
      compatibility_score: 0,
      match_type: "محايد",
      reason: "لم يوجد شريك متوافق.",
      match_id
    })
  }
}

    // 8. Insert into DB
    const { error: insertError } = await supabase
      .from("match_results")
      .insert(results)

    if (insertError) throw insertError

    return res.status(200).json({
      message: "✅ Matching complete",
      count: results.length,
      results
    })

  } catch (err) {
    console.error("🔥 Matching error:", err)
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
}
