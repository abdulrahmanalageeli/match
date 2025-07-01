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

  const match_id =
    process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

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
    const pairs = []

    for (let i = 0; i < participants.length; i++) {
      for (let j = i + 1; j < participants.length; j++) {
        pairs.push([participants[i], participants[j]])
      }
    }

    const prompt = pairs
      .map(
        ([a, b]) =>
          `المشارك ${a.assigned_number}:\n- ${a.q1 ?? ""}\n- ${a.q2 ?? ""}\n- ${
            a.q3 ?? ""
          }\n- ${a.q4 ?? ""}\n` +
          `المشارك ${b.assigned_number}:\n- ${b.q1 ?? ""}\n- ${
            b.q2 ?? ""
          }\n- ${b.q3 ?? ""}\n- ${b.q4 ?? ""}`
      )
      .join("\n\n")

const systemMsg = `
أنت مساعد توافق بين المشاركين.

لكل زوج من المشاركين، قيّم نسبة التوافق من 0 إلى 100، واذكر السبب باختصار.

لا تقيّم بناءً على التشابه السطحي فقط. ركّز على العوامل العميقة التي تؤثر على نجاح العلاقة.

المعايير الأساسية للتقييم:

أولاً: الانسجام والاحترام المتبادل
- تقارب في القيم الجوهرية مثل الصدق، الطموح، الاحترام، حب العائلة، الروحانية أو الانفتاح
- أسلوب تواصل مناسب مثل شخص صريح مع شخص متفهم
- اهتمام متبادل بنمط الحياة مثل الهدوء، المغامرة، الروتين، أو الحرية

ثانياً: التكامل النفسي وليس التشابه فقط
- بعض الاختلافات تعزز العلاقة مثل المفكر مع العاطفي، أو العملي مع الإبداعي
- لا تخلط بين التكامل الإيجابي والتنافر السلبي

ثالثاً: تجنب المطابقات غير المتوافقة
- لا ترفع التقييم إذا كان هناك تضاد واضح مثل شخص يحب الضوضاء مع شخص حساس جداً
- اختلافات جوهرية في أسلوب الحياة أو المعتقدات أو أسلوب التفكير تعتبر علامة خطر

رابعاً: استخدم مبادئ MBTI في التقييم حتى لو لم يتم ذكر النمط صراحة، استنتج من طريقة التعبير والسلوك:
- التفضيل المفضل هو تقارب I/E (انطوائي مع انطوائي أو اجتماعي مع اجتماعي)
- التكامل الأفضل عادة يكون بين:
  - Intuition مع Sensing
  - Thinking مع Feeling
  - Judging مع Perceiving
- مثال: مفكر عقلاني مع شخص عاطفي حساس قد يكملان بعضهما أو يتصادمان حسب أسلوب التواصل

خامساً: اعتمد على أولوية في الوزن عند التقييم:
- تطابق القيم يعتبر الأهم (40٪)
- أسلوب الحياة والتواصل له أهمية متوسطة (30٪)
- التكميل النفسي والاختلاف الذكي مفيد إذا وُجد (20٪)
- عوامل الجاذبية السطحية أو التشابه العام تعتبر الأقل أهمية (10٪)

قبل إعطاء التقييم، اسأل نفسك: هل يمكن لهذين الشخصين التعايش اليومي بانسجام؟ أم أن الاختلافات ستسبب توتراً مستمراً؟

كن ذكياً في استنتاج الشخصية حتى إن لم تُذكر بوضوح. أحياناً يستخدم الناس التواضع لإخفاء القوة، أو الفكاهة لتغطية الحساسيات.

أرجع النتائج فقط بصيغة JSON Array بهذا الشكل:

[
  { "a": 5, "b": 6, "score": 74, "reason": "كلاهما يفضل العزلة والتأمل" },
  { "a": 1, "b": 2, "score": 88, "reason": "يتشاركان في القيم والاهتمامات" }
]

بدون أي نص إضافي خارج JSON.
`.trim()

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    })

    let gptMatches = []
    try {
      let raw = response.choices?.[0]?.message?.content?.trim()
      if (raw.startsWith("```")) {
        raw = raw.replace(/^```[a-z]*\s*/i, "").replace(/```$/, "").trim()
      }
      gptMatches = JSON.parse(raw)
    } catch (e) {
      console.error("❌ Failed to parse GPT JSON:", e)
      return res.status(500).json({ error: "GPT response was not valid JSON." })
    }

    const scores = {}
    for (const { a, b, score, reason } of gptMatches) {
      if (
        typeof a !== "number" ||
        typeof b !== "number" ||
        typeof score !== "number" ||
        typeof reason !== "string"
      )
        continue
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`
      scores[key] = { score, reason: reason.trim() }
    }

    const allPairs = Object.entries(scores)
      .map(([key, val]) => {
        const [a, b] = key.split("-").map(Number)
        return { a, b, score: val.score, reason: val.reason }
      })
      .sort((p1, p2) => p2.score - p1.score)

    console.log("📊 All Compatibility Scores:")
    allPairs.forEach((pair) => {
      console.log(`#${pair.a} × #${pair.b}: ${pair.score}% → ${pair.reason}`)
    })

    const used = new Set()
    const finalMatches = []

    for (const pair of allPairs) {
      if (!used.has(pair.a) && !used.has(pair.b)) {
        used.add(pair.a)
        used.add(pair.b)

        finalMatches.push({
          participant_a_number: pair.a,
          participant_b_number: pair.b,
          compatibility_score: pair.score,
          match_type: "توأم روح",
          reason: pair.reason,
          match_id,
          round: 1,
        })
      }
    }

    // Handle odd participant out
    const unmatched = numbers.filter((n) => !used.has(n))
    if (unmatched.length === 1) {
      finalMatches.push({
        participant_a_number: 0,
        participant_b_number: unmatched[0],
        compatibility_score: 0,
        match_type: "توأم روح (منظم)",
        reason: "تم توصيله بك لعدم وجود شريك متبقي.",
        match_id,
        round: 1,
      })
    }

    const { error: insertError } = await supabase
      .from("match_results")
      .insert(finalMatches)

    if (insertError) throw insertError

    return res.status(200).json({
      message: "✅ 1 perfect round of global matching complete",
      count: finalMatches.length,
      results: finalMatches,
    })
  } catch (err) {
    console.error("🔥 Matching error:", err)
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
}
