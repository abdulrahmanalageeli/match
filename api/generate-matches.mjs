import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  const { match_id } = req.body

  if (!match_id) {
    return res.status(400).json({ error: "match_id is required" })
  }

  try {
    // 1. Fetch participants
    const { data: participants, error } = await supabase
      .from("participants")
      .select("id, assigned_number, q1, q2, q3, q4")
      .eq("match_id", match_id)

    if (error) throw error
    if (!participants || participants.length < 2)
      return res.status(400).json({ error: "Not enough participants" })

    // 2. Build all unique pairs
    const pairs = []
    for (let i = 0; i < participants.length; i++) {
      for (let j = i + 1; j < participants.length; j++) {
        pairs.push([participants[i], participants[j]])
      }
    }

    // 3. Prepare prompt
    const formattedPairs = pairs
      .map(([a, b], idx) => {
        return `المشارك ${a.assigned_number}:\n- ${a.q1}\n- ${a.q2}\n- ${a.q3}\n- ${a.q4}\n` +
               `المشارك ${b.assigned_number}:\n- ${b.q1}\n- ${b.q2}\n- ${b.q3}\n- ${b.q4}\n\n`
      })
      .join("")

    const systemMsg = `
أنت مساعد ذكي. سيتم إعطاؤك إجابات مشاركين. لكل زوج من المشاركين، قيّم علاقتهم بأنها "توأم روح" أو "خصم لدود" أو "محايد"، وأعطِ سببًا مختصرًا.
الإجابة تكون بصيغة:
[رقمA]-[رقمB]: [نوع العلاقة] - [سبب]
مثال:
3-5: توأم روح - إجاباتهم كلها عن الهدوء والانفتاح على الناس.
`

    const completion = await openai.chat.completions.create({
      model: "gpt-4-1106-preview", // or "gpt-4.1-mini" if you're using that
      messages: [
        { role: "system", content: systemMsg.trim() },
        { role: "user", content: formattedPairs },
      ],
    })

    const resultText = completion.choices?.[0]?.message?.content?.trim()

    // 4. Parse result
    const results = []
    const lines = resultText.split("\n").filter(Boolean)

    for (const line of lines) {
      const match = line.match(/^(\d+)-(\d+):\s*(.*?)\s*-\s*(.+)$/)
      if (!match) continue

      const [, aNum, bNum, typeRaw, reason] = match
      const type = typeRaw.trim()
      const a = participants.find((p) => p.assigned_number == aNum)
      const b = participants.find((p) => p.assigned_number == bNum)
      if (!a || !b) continue

      results.push({
        participant_a_id: a.id,
        participant_b_id: b.id,
        match_type: type,
        reason: reason.trim(),
        match_id,
      })
    }

    // 5. Insert into Supabase
    const { error: insertError } = await supabase
      .from("match_results")
      .insert(results)

    if (insertError) throw insertError

    return res.status(200).json({ message: "Matches generated", count: results.length })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
}
