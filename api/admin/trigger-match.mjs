import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

  try {
    const { data: participants, error } = await supabase
      .from("participants")
      .select("id, assigned_number, q1, q2, q3, q4")
      .eq("match_id", match_id)

    if (error) throw error
    if (!participants || participants.length < 2)
      return res.status(400).json({ error: "Not enough participants" })

    const pairs = []
    for (let i = 0; i < participants.length; i++) {
      for (let j = i + 1; j < participants.length; j++) {
        pairs.push([participants[i], participants[j]])
      }
    }

    const formattedPairs = pairs
      .map(([a, b]) => {
        return `المشارك ${a.assigned_number}:\n- ${a.q1}\n- ${a.q2}\n- ${a.q3}\n- ${a.q4}\n` +
               `المشارك ${b.assigned_number}:\n- ${b.q1}\n- ${b.q2}\n- ${b.q3}\n- ${b.q4}\n`
      })
      .join("\n")

    const systemMsg = `
You're a smart compatibility assistant. For each pair of participants, you're given 4 answers per person.
Analyze them and classify the relationship between each pair as:
- "توأم روح"
- "خصم لدود"
- "محايد"

Your response must follow this format:
[رقمA]-[رقمB]: [نوع العلاقة] - [شرح السبب]
Only respond in Arabic.
    `.trim()

    const completion = await openai.chat.completions.create({
      model: "gpt-4-1106-preview",
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: formattedPairs },
      ],
    })

    const resultText = completion.choices?.[0]?.message?.content?.trim()
    const results = []

    resultText.split("\n").forEach((line) => {
      const match = line.match(/^(\d+)-(\d+):\s*(.*?)\s*-\s*(.+)$/)
      if (!match) return

      const [, aNum, bNum, type, reason] = match
      const a = participants.find((p) => p.assigned_number == aNum)
      const b = participants.find((p) => p.assigned_number == bNum)
      if (!a || !b) return

      results.push({
        participant_a_id: a.id,
        participant_b_id: b.id,
        match_type: type.trim(),
        reason: reason.trim(),
        match_id,
      })
    })

    const { error: insertError } = await supabase
      .from("match_results")
      .insert(results)

    if (insertError) throw insertError

    return res.status(200).json({ message: "Match triggered", count: results.length, analysis: resultText })
  } catch (err) {
    console.error("Match Error:", err)
    return res.status(500).json({ error: err.message })
  }
}
