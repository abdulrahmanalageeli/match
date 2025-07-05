import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
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

    const numbers = participants.map(p => p.assigned_number)
    const pairs = []

    for (let i = 0; i < participants.length; i++) {
      for (let j = i + 1; j < participants.length; j++) {
        pairs.push([participants[i], participants[j]])
      }
    }

    const prompt = pairs
      .map(([a, b]) =>
        `المشارك ${a.assigned_number}:\n- ${a.q1 ?? ""}\n- ${a.q2 ?? ""}\n- ${a.q3 ?? ""}\n- ${a.q4 ?? ""}\n` +
        `المشارك ${b.assigned_number}:\n- ${b.q1 ?? ""}\n- ${b.q2 ?? ""}\n- ${b.q3 ?? ""}\n- ${b.q4 ?? ""}`
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
        { role: "user", content: prompt }
      ],
      temperature: 0.3
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
        typeof a !== "number" || typeof b !== "number" ||
        typeof score !== "number" || typeof reason !== "string"
      ) continue
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`
      scores[key] = { score, reason: reason.trim() }
    }

    const allPairs = Object.entries(scores).map(([key, val]) => {
      const [a, b] = key.split("-").map(Number)
      return { a, b, score: val.score, reason: val.reason }
    })

    // 📊 Print all compatibility
    console.log("📊 All Compatibility Scores:")
    allPairs
      .slice()
      .sort((a, b) => b.score - a.score)
      .forEach(pair => {
        console.log(`#${pair.a} × #${pair.b}: ${pair.score}% → ${pair.reason}`)
      })

    // --- ROUND-ROBIN GLOBAL COMPATIBILITY MATCHING (2 ROUNDS) ---
    // For each round, globally sort all pairs by compatibility score (descending).
    // Assign matches if neither participant is matched in this round and the pair hasn't been matched in previous rounds.
    // If odd participant, assign the unmatched participant with the lowest available compatibility to the host (0).
    // Only compatibility_score, round, and reason are stored.
    // No match_type.
    // ------------------------------------------------------------
    const finalMatches = []
    const matchedPairs = new Set() // Track pairs matched in any round
    const participantCount = numbers.length
    const rounds = 2

    for (let round = 1; round <= rounds; round++) {
      const used = new Set() // Track participants matched in this round
      const roundMatches = []
      // Sort all pairs globally by score (descending)
      const sortedPairs = [...allPairs].sort((a, b) => b.score - a.score)
      for (const pair of sortedPairs) {
        const key = `${Math.min(pair.a, pair.b)}-${Math.max(pair.a, pair.b)}`
        if (
          !used.has(pair.a) &&
          !used.has(pair.b) &&
          !matchedPairs.has(key)
        ) {
          used.add(pair.a)
          used.add(pair.b)
          matchedPairs.add(key)
          roundMatches.push({
            participant_a_number: pair.a,
            participant_b_number: pair.b,
            compatibility_score: pair.score,
            reason: pair.reason,
            match_id,
            round
          })
        }
      }
      // Handle odd participant: find unmatched with lowest score
      const unmatched = numbers.filter(n => !used.has(n))
      if (unmatched.length === 1) {
        // Find the lowest score for this unmatched participant
        let minScore = Infinity
        let minReason = ""
        for (const pair of allPairs) {
          if ((pair.a === unmatched[0] || pair.b === unmatched[0]) && !matchedPairs.has(`${Math.min(pair.a, pair.b)}-${Math.max(pair.a, pair.b)}`)) {
            if (pair.score < minScore) {
              minScore = pair.score
              minReason = pair.reason
            }
          }
        }
        roundMatches.push({
          participant_a_number: 0,
          participant_b_number: unmatched[0],
          compatibility_score: 0,
          reason: "لم نجد شريكاً مناسباً. سيجلس مع المنظم.",
          match_id,
          round
        })
      }
      finalMatches.push(...roundMatches)
    }

    const { error: insertError } = await supabase
      .from("match_results")
      .insert(finalMatches)

    if (insertError) throw insertError

    return res.status(200).json({
      message: `✅ Matching complete for ${rounds} rounds`,
      count: finalMatches.length,
      results: finalMatches
    })

  } catch (err) {
    console.error("🔥 Matching error:", err)
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
}
