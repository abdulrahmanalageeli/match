import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

function chunkPairs(pairs, size = 2) {
  const chunks = []
  for (let i = 0; i < pairs.length; i += size) {
    chunks.push(pairs.slice(i, i + size))
  }
  return chunks
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

  try {
    const { data: participants, error } = await supabase
      .from("participants")
      .select("assigned_number, q1, q2, q3, q4")
      .eq("match_id", match_id)

    if (error) throw error
    if (!participants || participants.length < 2) {
      return res.status(400).json({ error: "Not enough participants" })
    }

    const allPairs = []
    const seen = new Set()

    for (let i = 0; i < participants.length; i++) {
      for (let j = i + 1; j < participants.length; j++) {
        const a = participants[i]
        const b = participants[j]
        const key = `${a.assigned_number}-${b.assigned_number}`
        if (!seen.has(key)) {
          allPairs.push([a, b])
          seen.add(key)
        }
      }
    }

    const chunks = chunkPairs(allPairs)
    const results = []

    for (const chunk of chunks) {
      const prompt = chunk
        .map(([a, b]) => {
          return `المشارك ${a.assigned_number}:\n- ${a.q1}\n- ${a.q2}\n- ${a.q3}\n- ${a.q4}\n` +
                 `المشارك ${b.assigned_number}:\n- ${b.q1}\n- ${b.q2}\n- ${b.q3}\n- ${b.q4}`
        })
        .join("\n\n")

      const systemMsg = `
أنت مساعد توافق بين المشاركين. لكل زوج، قيّم نسبة التوافق من 0 إلى 100٪، واذكر السبب باختصار.

استخدم الصيغة التالية فقط:
[A]-[B]: 74% - سبب

مثال:
3-7: 85% - اهتمامات متقاربة وتوجه اجتماعي مشابه.
      `.trim()

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo-1106",
        messages: [
          { role: "system", content: systemMsg },
          { role: "user", content: prompt },
        ],
      })

      const lines = response.choices?.[0]?.message?.content?.trim().split("\n") || []

      for (const line of lines) {
        const match = line.match(/^(\d+)-(\d+):\s*(\d{1,3})%\s*-\s*(.+)$/)
        if (!match) continue
      
        const [, aNum, bNum, scoreStr, reason] = match
        console.log(`${aNum}-${bNum} ✅ ${scoreStr}%`)
      
        results.push({
          participant_a_number: Number(aNum),
          participant_b_number: Number(bNum),
          compatibility_score: Number(scoreStr),
          reason: reason.trim(),
          match_id,
        })
      }
    }

    // Fallback for odd participant
    if (participants.length % 2 !== 0) {
      const allNums = participants.map(p => p.assigned_number)
      const paired = new Set(results.flatMap(r => [r.participant_a_number, r.participant_b_number]))
      const unpaired = allNums.find(n => !paired.has(n))

      if (unpaired !== undefined) {
        results.push({
          participant_a_number: unpaired,
          participant_b_number: 0,
          compatibility_score: 0,
          reason: "لم يكن هناك شريك لهذا المشارك بسبب عدد المشاركين الفردي.",
          match_id,
        })
      }
    }

    const { error: insertError } = await supabase
      .from("match_results")
      .insert(results)

    if (insertError) throw insertError

    return res.status(200).json({
      message: "✅ Matching complete",
      count: results.length,
      results,
    })

  } catch (err) {
    console.error("Match Trigger Error:", err)
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
}
