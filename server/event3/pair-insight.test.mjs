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

  assert.equal(insight.headline, "ألفة تظهر من التفاصيل")
  assert.match(insight.body, /سارة/)
  assert.match(insight.body, /التفاصيل العملية/)
  assert.deepEqual(Object.keys(insight).sort(), ["body", "headline", "prompt", "signal"])
  assert.doesNotMatch(JSON.stringify(insight), /semanticCommonGround|interactionRhythm|score|%|استبيان|معايير|خوارزمية/i)
})

test("pair insight changes with the pair's strongest signal", () => {
  const insight = buildEvent3PairInsight({
    score: 74,
    partnerName: "خالد",
    breakdown: { ...baseline, communicationDisagreement: 10, interactionRhythm: 7 },
  })

  assert.equal(insight.headline, "وضوح يطمئن")
  assert.match(insight.body, /خالد/)
})

test("pair insight respects the 60 percent analysis threshold", () => {
  assert.equal(buildEvent3PairInsight({ score: 59, partnerName: "سارة", breakdown: baseline }), null)
  assert.equal(buildEvent3PairInsight({ score: null, partnerName: "سارة", breakdown: baseline }), null)
})

test("pair insight has a safe high-level fallback for historical snapshots", () => {
  const insight = buildEvent3PairInsight({ score: 71, partnerName: "نورة", breakdown: null })
  assert.equal(insight.headline, "مساحة تستحق لقاءً ثانياً")
  assert.match(insight.body, /نورة/)
})
