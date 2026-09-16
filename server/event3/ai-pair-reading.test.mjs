import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { getOrGeneratePairReading, generatePairReading, pairReadingKey, pairReadingSignals, PAIR_READING_MODEL } from "./ai-pair-reading.mjs"

const insight = { signal: "قراءة أولية", headline: "ما بين السطور", body: "قراءة احتمالية وليست حكماً على التوافق", prompt: "ما الموضوع الذي تريدان استكشافه؟" }
function harness() {
  const rows = new Map()
  let calls = 0
  const openai = { chat: { completions: { create: async request => {
    calls++
    assert.equal(request.model, PAIR_READING_MODEL)
    assert.equal(request.response_format.json_schema.strict, true)
    assert.ok([...rows.values()].some(row => row.status === "pending" && row.id))
    return { model: PAIR_READING_MODEL, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(insight) } }], usage: { prompt_tokens: 100, completion_tokens: 50 } }
  } } } }
  const supabase = { from: () => {
    let operation = "select", values, filters = []
    const query = {
      select: () => query, eq: (key, value) => { filters.push([key, value]); return query },
      insert: value => { operation = "insert"; values = value; return query },
      update: value => { operation = "update"; values = value; return query },
      single: () => query, maybeSingle: () => query,
      then: (resolve, reject) => Promise.resolve().then(() => {
        if (operation === "insert") {
          if (rows.has(values.cache_key)) return { error: { code: "23505" } }
          rows.set(values.cache_key, { ...values }); return { data: values }
        }
        const row = [...rows.values()].find(row => filters.every(([key, value]) => row[key] === value))
        if (row && operation === "update") Object.assign(row, values)
        return { data: row ? { ...row } : null }
      }).then(resolve, reject),
    }
    return query
  } }
  return { rows, openai, supabase, calls: () => calls }
}
const args = { eventId: 28, participantA: 1, participantB: 2, breakdown: { semanticCommonGround: 1, interactionRhythm: 2 } }

test("whitelist excludes private answers, nulls and non-finite values and bounds numerical signals", () => {
  assert.deepEqual(pairReadingSignals({ survey_data: "private", name: "private", semanticCommonGround: -5, humorOpenness: 100, intent: null, attachmentComfort: NaN }), {
    semanticCommonGround: { value: 0, maximum: 18 }, humorOpenness: { value: 10, maximum: 10 },
  })
})
test("pair keys are symmetric, event-scoped and invalidate when aggregate data changes", () => {
  const base = { ...args, signals: pairReadingSignals(args.breakdown) }
  assert.equal(pairReadingKey(base), pairReadingKey({ ...base, participantA: 2, participantB: 1 }))
  assert.notEqual(pairReadingKey(base), pairReadingKey({ ...base, eventId: 29 }))
  assert.notEqual(pairReadingKey(base), pairReadingKey({ ...base, signals: {} }))
})
test("low-score readings persist before returning and refreshes use the same generation", async () => {
  const h = harness()
  const first = await getOrGeneratePairReading({ ...args, ...h })
  const cached = await getOrGeneratePairReading({ ...args, ...h, participantA: 2, participantB: 1 })
  assert.deepEqual(first.insight, insight)
  assert.equal(cached.id, first.id)
  assert.equal(cached.cached, true)
  assert.equal(h.calls(), 1)
  const row = [...h.rows.values()][0]
  assert.equal(row.status, "complete")
  assert.equal(row.token_usage.prompt_tokens, 100)
  assert.ok(row.estimated_cost_usd > 0)
})

test("old short readings are bypassed and the detailed generation is cached", async () => {
  const h = harness()
  const oldKey = createHash("sha256").update(JSON.stringify({
    version: 1, model: PAIR_READING_MODEL, eventId: args.eventId,
    pair: [args.participantA, args.participantB], signals: pairReadingSignals(args.breakdown),
  })).digest("hex")
  h.rows.set(oldKey, { id: "old-reading", cache_key: oldKey, status: "complete", insight: { ...insight, body: "old short analysis" } })
  const generated = await getOrGeneratePairReading({ ...args, ...h })
  assert.equal(h.calls(), 1)
  assert.equal(generated.cached, false)
  assert.notEqual(generated.id, "old-reading")
  const refreshed = await getOrGeneratePairReading({ ...args, ...h })
  assert.equal(refreshed.id, generated.id)
  assert.equal(refreshed.cached, true)
  assert.equal(h.calls(), 1)
})

test("detailed reading prompt and token budget support the restored long format", async () => {
  let request
  const longInsight = { ...insight, body: "قراءة تفصيلية محتملة. ".repeat(90) }
  const result = await generatePairReading({ chat: { completions: { create: async value => {
    request = value
    return { choices: [{ finish_reason: "stop", message: { content: JSON.stringify(longInsight) } }] }
  } } } }, {})
  assert.match(request.messages[0].content, /140 إلى 170 كلمة/)
  assert.match(request.messages[0].content, /النموذج قيد التدريب/)
  assert.equal(request.max_completion_tokens, 1600)
  assert.equal(result.insight.body, longInsight.body)
})
test("simultaneous requests generate only once", async () => {
  const h = harness()
  const results = await Promise.all([getOrGeneratePairReading({ ...args, ...h }), getOrGeneratePairReading({ ...args, ...h })])
  assert.equal(h.calls(), 1)
  assert.equal(results.filter(r => r.pending).length, 1)
})
test("missing data never invokes the model", async () => {
  const h = harness()
  assert.deepEqual(await getOrGeneratePairReading({ ...args, ...h, breakdown: null }), { unavailable: true })
  assert.equal(h.calls(), 0)
})
test("failed generation is marked retryable and recovers on next request", async () => {
  const h = harness()
  const broken = { chat: { completions: { create: async () => { throw new Error("timeout") } } } }
  await assert.rejects(getOrGeneratePairReading({ ...args, ...h, openai: broken }), /timeout/)
  assert.equal([...h.rows.values()][0].status, "error")
  const retried = await getOrGeneratePairReading({ ...args, ...h })
  assert.deepEqual(retried.insight, insight)
})
test("truncated or refused model responses are never shown as complete", async () => {
  for (const choice of [{ finish_reason: "length", message: { content: "{}" } }, { finish_reason: "stop", message: { refusal: "refused" } }]) {
    await assert.rejects(generatePairReading({ chat: { completions: { create: async () => ({ choices: [choice] }) } } }, {}), /Incomplete/)
  }
})
