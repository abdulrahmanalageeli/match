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
  if (!match_id) return res.status(400).json({ error: "match_id is required" })

  try {
    // 1. Fetch participants
    const { data: participants, error } = await supabase
      .from("participants")
      .select("assigned_number, q1, q2, q3, q4")
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

    // 3. Format prompt
    const formattedPairs = pairs
      .map(([a, b]) => {
        return `المشارك ${a.assigned_number}:\n- ${a.q1}\n- ${a.q2}\n- ${a.q3}\n- ${a.q4}\n` +
               `المشارك ${b.assigned_number}:\n- ${b.q1}\n- ${b.q2}\n- ${b.q3}\n- ${b.q4}\n`
      })
      .join("\n")

    const systemMsg = `
أنت مساعد ذكي في التوافق بين المشاركين. لكل زوج من المشاركين، لديك ٤ إجابات لكل شخص.

مهمتك:
- تحليل التوافق بين كل زوج من المشاركين بدقة.
- إعطاء نسبة مئوية للتوافق من 0 إلى 100٪ (حتى لو التوافق ضعيف).
- كتابة شرح بسيط ومقنع عن سبب هذه النسبة.

صيغة الإخراج المطلوبة (بالعربية فقط، سطر لكل زوج):
[رقمA]-[رقمB]: [نسبة التوافق]% - [شرح السبب]

مثال:
3-5: 84% - إجاباتهم تدل على انسجام في الأنشطة والهوايات وتوجهات اجتماعية متقاربة.
7-9: 41% - رغم وجود بعض التشابه، هناك اختلاف واضح في القيم والتفضيلات.
`.trim()

    const completion = await openai.chat.completions.create({
      model: "gpt-4-1106-preview",
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: formattedPairs },
      ],
    })

    const resultText = completion.choices?.[0]?.message?.content?.trim()
    if (!resultText) throw new Error("GPT response was empty")

    // 4. Parse GPT output
// 4. Parse GPT output
const results = []
const pairedSet = new Set()

resultText.split("\n").forEach((line) => {
  const match = line.match(/^(\d+)-(\d+):\s*(\d{1,3})%\s*-\s*(.+)$/)
  if (!match) return

  const [, aNum, bNum, scoreStr, reason] = match
  const aNumber = Number(aNum)
  const bNumber = Number(bNum)
  const compatibility_score = Number(scoreStr)

  pairedSet.add(aNumber)
  pairedSet.add(bNumber)

  results.push({
    participant_a_number: aNumber,
    participant_b_number: bNumber,
    compatibility_score,
    reason: reason.trim(),
    match_id,
  })
})

// Detect unpaired participant if odd count
if (participants.length % 2 !== 0) {
  const allNumbers = participants.map(p => p.assigned_number)
  const unpaired = allNumbers.find(n => !pairedSet.has(n))
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


    // 5. Insert results into Supabase
    const { error: insertError } = await supabase
      .from("match_results")
      .insert(results)

    if (insertError) throw insertError

    return res.status(200).json({
      message: "Matches generated successfully",
      count: results.length,
      analysis: resultText,
    })
  } catch (err) {
    console.error("Match error:", err)
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
}
