import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"
import munkres from "munkres-js"

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
    const { data: participants, error } = await supabase
      .from("participants")
      .select("assigned_number, q1, q2, q3, q4")
      .eq("match_id", match_id)

    if (error) throw error
    if (!participants || participants.length < 2) {
      return res.status(400).json({ error: "Not enough participants" })
    }

    const numbers = participants.map((p) => p.assigned_number)
    const scores = {}
    const pairs = []

    for (let i = 0; i < participants.length; i++) {
      for (let j = i + 1; j < participants.length; j++) {
        pairs.push([participants[i], participants[j]])
      }
    }

    const chunkSize = 10
    for (let i = 0; i < pairs.length; i += chunkSize) {
      const chunk = pairs.slice(i, i + chunkSize)

      const prompt = chunk.map(([a, b]) => {
        return `المشارك ${a.assigned_number}:\n- ${a.q1}\n- ${a.q2}\n- ${a.q3}\n- ${a.q4}\n` +
               `المشارك ${b.assigned_number}:\n- ${b.q1}\n- ${b.q2}\n- ${b.q3}\n- ${b.q4}`
      }).join("\n\n")

      const systemMsg = `
أنت مساعد توافق بين المشاركين. لكل زوج، قيّم نسبة التوافق من 0 إلى 100٪، واذكر السبب باختصار.
استخدم الصيغة التالية فقط:
[A]-[B]: 74% - سبب`.trim()

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo-1106",
        messages: [
          { role: "system", content: systemMsg },
          { role: "user", content: prompt }
        ]
      })

      const lines = response.choices?.[0]?.message?.content?.trim().split("\n") || []
      for (const line of lines) {
        const match = line.match(/^(\d+)-(\d+):\s*(\d{1,3})%\s*-\s*(.+)$/)
        if (!match) continue
        const [, a, b, score, reason] = match
        const key = `${a}-${b}`
        scores[key] = { score: Number(score), reason: reason.trim() }

        // ✅ Log every line parsed
        console.log(`${a}-${b} ✅ ${score}%`)
      }
    }

    const n = numbers.length
    const matrix = Array(n).fill(0).map(() => Array(n).fill(0))
    const reasonMap = {}

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue
        const key1 = `${numbers[i]}-${numbers[j]}`
        const key2 = `${numbers[j]}-${numbers[i]}`
        const entry = scores[key1] || scores[key2]
        if (entry) {
          matrix[i][j] = -entry.score
          reasonMap[`${i}-${j}`] = entry.reason
        } else {
          matrix[i][j] = 0
        }
      }
    }

    if (n % 2 !== 0) {
      matrix.push(Array(n).fill(0))
      for (let row of matrix) row.push(0)
      numbers.push(0)
    }

    const assignments = munkres(matrix)
    const used = new Set()
    const results = []

    for (const [i, j] of assignments) {
      const a = numbers[i]
      const b = numbers[j]
      if (a === 0 || b === 0 || used.has(a) || used.has(b)) continue

      used.add(a)
      used.add(b)

      const score = -matrix[i][j]
      const reason = reasonMap[`${i}-${j}`] || reasonMap[`${j}-${i}`] || "السبب غير معروف"

      results.push({
        participant_a_number: a,
        participant_b_number: b,
        compatibility_score: score,
        match_type: "توأم روح",
        reason,
        match_id
      })

      // ✅ Log final assignments
      console.log(`✅ Final Match: ${a}-${b} with ${score}%`)
    }

    for (const num of numbers) {
      if (!used.has(num) && num !== 0) {
        results.push({
          participant_a_number: num,
          participant_b_number: 0,
          compatibility_score: 0,
          match_type: "محايد",
          reason: "لم يكن هناك شريك لهذا المشارك بسبب عدد المشاركين الفردي.",
          match_id
        })
        console.log(`⚠️ Unmatched: ${num}`)
      }
    }

    const { error: insertError } = await supabase
      .from("match_results")
      .insert(results)

    if (insertError) throw insertError

    return res.status(200).json({
      message: "✅ Optimal Matching complete",
      count: results.length,
      results
    })

  } catch (err) {
    console.error("Match Trigger Error:", err)
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
}
