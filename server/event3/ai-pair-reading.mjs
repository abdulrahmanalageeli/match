import { createHash, randomUUID } from "node:crypto"

export const PAIR_READING_MODEL = "gpt-5.6-luna"
const PROMPT_VERSION = 1
const DIMENSIONS = {
  semanticCommonGround: 18, interactionRhythm: 20, humorOpenness: 10,
  attachmentComfort: 8, lifestyleSustainability: 12, valuesBoundariesLanguage: 17,
  communicationDisagreement: 10, intent: 5,
}

// Whitelist numerical pair aggregates. Never include profiles, names or answers.
export function pairReadingSignals(breakdown) {
  return Object.fromEntries(Object.entries(DIMENSIONS).flatMap(([key, maximum]) => {
    const value = breakdown?.[key]
    if (typeof value !== "number" || !Number.isFinite(value)) return []
    return [[key, { value: Math.max(0, Math.min(maximum, value)), maximum }]]
  }))
}

export function pairReadingKey({ eventId, participantA, participantB, signals }) {
  return createHash("sha256").update(JSON.stringify({
    version: PROMPT_VERSION, model: PAIR_READING_MODEL, eventId,
    pair: [participantA, participantB].sort((a, b) => a - b), signals,
  })).digest("hex")
}

const SYSTEM_PROMPT = `اكتب قراءة عربية قصيرة بعنوان «ما بين السطور» لشخصين التقيا في فعالية تعارف.
المدخلات مؤشرات مجمّعة فقط من إجابات محدودة، وليست حقائق عن الشخصين أو تفاصيل اللقاء.
استند إلى المؤشرات الموجودة: اذكر نقطة تقارب محتملة فقط إذا دعمتها البيانات، ومساحة اختلاف بلطف عند وجودها. إذا كانت المؤشرات ضعيفة قل ذلك دون اختلاق نقاط قوة أو انتقاص من اللقاء.
لا تعتمد على حد أدنى للنتيجة. لا تذكر درجات أو نسباً أو أسماء أبعاد أو تفاصيل الحساب ولا تعيد المدخلات.
ممنوع استنتاج إجابات أي شخص أو كشفها، أو التشخيص النفسي، أو افتراض الانجذاب أو المشاعر أو الجنس أو التنبؤ بنجاح العلاقة.
خاطب الاثنين بصيغة «بينكما». اجعل النبرة دافئة ومتزنة دون مبالغة.
signal عبارة محايدة مثل «قراءة أولية بالذكاء الاصطناعي». headline عنوان قصير. body فقرة من 60 إلى 100 كلمة تشمل أن هذه قراءة احتمالية وأن النموذج قيد التدريب وليست حكماً على التوافق. prompt سؤال محادثة اختياري مرتبط بالمؤشرات.
أعد JSON فقط بالحقول signal, headline, body, prompt.`

export async function generatePairReading(openai, signals) {
  const response = await openai.chat.completions.create({
    model: PAIR_READING_MODEL,
    reasoning_effort: "none",
    max_completion_tokens: 900,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: JSON.stringify(signals) }],
    response_format: { type: "json_schema", json_schema: {
      name: "pair_reading", strict: true,
      schema: { type: "object", additionalProperties: false,
        properties: Object.fromEntries(["signal", "headline", "body", "prompt"].map(key => [key, { type: "string" }])),
        required: ["signal", "headline", "body", "prompt"],
      },
    } },
  }, { timeout: 30_000, maxRetries: 0 })
  const choice = response.choices?.[0]
  if (choice?.finish_reason !== "stop" || choice.message?.refusal) throw new Error("Incomplete pair reading")
  const insight = JSON.parse(choice.message.content)
  for (const [key, maximum] of Object.entries({ signal: 120, headline: 160, body: 1600, prompt: 400 })) {
    if (typeof insight[key] !== "string" || !insight[key].trim() || insight[key].length > maximum) throw new Error("Invalid pair reading")
  }
  return { insight, model: response.model || PAIR_READING_MODEL, usage: response.usage || {} }
}

export async function getOrGeneratePairReading({ supabase, openai, eventId, participantA, participantB, breakdown }) {
  const signals = pairReadingSignals(breakdown)
  if (!Object.keys(signals).length) return { unavailable: true }
  const cacheKey = pairReadingKey({ eventId, participantA, participantB, signals })
  const table = () => supabase.from("event3_pair_readings")
  const lookup = await table().select("id,status,insight,model,updated_at").eq("cache_key", cacheKey).maybeSingle()
  if (lookup.error) throw lookup.error
  if (lookup.data?.status === "complete") return { ...lookup.data, cached: true }
  if (lookup.data?.status === "pending" && Date.now() - Date.parse(lookup.data.updated_at) < 60_000) return { pending: true }

  const id = randomUUID()
  const record = { id, cache_key: cacheKey, event_id: eventId,
    participant_a: Math.min(participantA, participantB), participant_b: Math.max(participantA, participantB),
    model: PAIR_READING_MODEL, status: "pending", updated_at: new Date().toISOString(),
  }
  // A unique key and compare-and-swap claim prevent duplicate calls across workers.
  const claim = lookup.data
    ? await table().update(record).eq("id", lookup.data.id).eq("updated_at", lookup.data.updated_at).select("id").maybeSingle()
    : await table().insert(record).select("id").single()
  if (claim.error?.code === "23505" || (!claim.error && !claim.data)) return { pending: true }
  if (claim.error) throw claim.error
  try {
    const result = await generatePairReading(openai, signals)
    const usage = result.usage
    const cost = ((usage.prompt_tokens || 0) * 0.20 + (usage.completion_tokens || 0) * 1.20) / 1_000_000
    const saved = await table().update({ status: "complete", insight: result.insight, model: result.model,
      token_usage: usage, estimated_cost_usd: cost, updated_at: new Date().toISOString(),
    }).eq("id", id)
    if (saved.error) throw saved.error
    return { id, insight: result.insight, model: result.model, cached: false }
  } catch (error) {
    await table().update({ status: "error", updated_at: new Date().toISOString() }).eq("id", id)
    throw error
  }
}
