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
      You're a smart compatibility assistant. For each pair of participants, you're given 4 answers per person.
      
      Analyze them **carefully**, and classify the relationship between each pair as **one of**:
      - "توأم روح" (soulmate)
      - "خصم لدود" (arch-nemesis)
      - "محايد" (neutral)
      
      Your output **must be in Arabic only** using the following format exactly:
      
      [رقمA]-[رقمB]: [نوع العلاقة] - [شرح السبب بالتفصيل]
      
      Important notes:
      - Do NOT label a pair "توأم روح" if their answers contain fundamental value conflicts (e.g. دين، توجهات، علاقات).
      - If the answers are too vague or don't match well or conflict mildly, use "محايد".
      - If one person says something opposite or attacking another's belief (e.g. 'Atheism is a red flag' vs 'I'm atheist'), label them "خصم لدود".
      - Be concise, but give a clear, logical Arabic explanation for why this match type makes sense.
      
      Example:
      
      3-5: توأم روح - إجاباتهم كلها تدل على حب الهدوء والانسجام الاجتماعي، وكأنهم يكملون بعض.
      4-6: خصم لدود - أحدهم يرفض صراحة توجهات الآخر الدينية والاجتماعية، مما يسبب صدام.
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

    return res.status(200).json({
      message: "Matches generated",
      count: results.length,
      analysis: resultText, // full GPT response
    })
    
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
}
