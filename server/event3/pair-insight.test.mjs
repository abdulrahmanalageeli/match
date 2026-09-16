import assert from "node:assert/strict"
import test from "node:test"

import { buildEvent3PairInsight } from "./pair-insight.mjs"

const baseline = {
  semanticCommonGround: 9,
  interactionRhythm: 10,
  humorOpenness: 5,
  attachmentComfort: 4,
  lifestyleSustainability: 6,
  valuesBoundariesLanguage: 8.5,
  communicationDisagreement: 5,
  intent: 2.5,
}

test("pair insight uses the pair snapshot without returning its criteria", () => {
  const insight = buildEvent3PairInsight({
    score: 82,
    partnerName: "سارة",
    breakdown: { ...baseline, semanticCommonGround: 18, lifestyleSustainability: 11 },
  })

  assert.equal(insight.headline, "نقاط مشتركة في التفاصيل")
  assert.match(insight.body, /سارة/)
  assert.match(insight.body, /عامل واحد محدود/)
  assert.deepEqual(Object.keys(insight).sort(), ["body", "headline", "prompt", "signal"])
  assert.doesNotMatch(JSON.stringify(insight), /semanticCommonGround|interactionRhythm|score|%|استبيان|معايير|خوارزمية/i)
})

test("pair insight changes with the pair's strongest signal", () => {
  const insight = buildEvent3PairInsight({
    score: 74,
    partnerName: "خالد",
    breakdown: { ...baseline, communicationDisagreement: 10, interactionRhythm: 7 },
  })

  assert.equal(insight.headline, "تقارب في أسلوب التواصل")
  assert.match(insight.body, /خالد/)
})

test("pair insight supports all available scores", () => {
  for (const score of [0, 30, 59, 60, 100]) {
    assert.ok(buildEvent3PairInsight({ score, partnerName: "سارة", breakdown: baseline }))
  }
  assert.equal(buildEvent3PairInsight({ score: null, partnerName: "سارة", breakdown: baseline }), null)
})

test("pair insight has a safe high-level fallback for historical snapshots", () => {
  const insight = buildEvent3PairInsight({ score: 71, partnerName: "نورة", breakdown: null })
  assert.equal(insight.headline, "قراءة عامة من الإجابات")
  assert.match(insight.body, /نورة/)
  assert.match(insight.body, /لا تتنبأ/)
})

test("pair insight uses bounded signal labels instead of exceptional or prescriptive claims", () => {
  const insight = buildEvent3PairInsight({
    score: 99,
    partnerName: "ليان",
    breakdown: { ...baseline, humorOpenness: 10 },
  })

  assert.equal(insight.signal, "تشابه مرتفع في الإجابات")
  assert.match(insight.body, /الإجابات/)
  assert.doesNotMatch(JSON.stringify(insight), /نادر|مثالي|يضمن|حتماً|تستحق لقاء|كيمياء قوية/)
})

test("pair insight keeps its invitation optional", () => {
  const insight = buildEvent3PairInsight({ score: 76, partnerName: "ريم", breakdown: baseline })
  assert.match(insight.prompt, /اختياري|إن واصلتما/)
})
