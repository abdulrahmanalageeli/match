import assert from "node:assert/strict"
import test from "node:test"
import { resolveInboundAction } from "./inbound-actions.mjs"

test("resolves attendance payloads and visible Arabic labels", () => {
  assert.equal(resolveInboundAction("confirm_attendance"), "confirm_attendance")
  assert.equal(resolveInboundAction("", "", "نعم سأحضر"), "confirm_attendance")
  assert.equal(resolveInboundAction("", "", "نعم، سأحضر"), "confirm_attendance")
  assert.equal(resolveInboundAction("", "اعتذار عن المشاركة"), "deny_attendance")
})

test("resolves visible labels for every interactive template", () => {
  const cases = [
    ["التسجيل التلقائي", "toggle_auto_signup"],
    ["معلومات الفعالية", "event3_information"],
    ["أي جنس", "gender_any"],
    ["نفس الجنس", "gender_same"],
    ["جنس مختلف", "gender_different"],
    ["توسيع سنتين", "age_expand_2"],
    ["توسيع 5 سنوات", "age_expand_5"],
    ["إبقاء النطاق", "age_keep_current"],
    ["مهتم", "discount_interested"],
    ["غير مهتم", "discount_declined"],
    ["في الطريق", "arrival_on_way"],
    ["سأتأخر", "arrival_late"],
    ["لن أحضر", "arrival_cancel"],
  ]

  for (const [label, action] of cases) assert.equal(resolveInboundAction("", label), action)
})

test("prefers a canonical payload over an ambiguous visible label", () => {
  assert.equal(resolveInboundAction("arrival_cancel", "لن أحضر"), "arrival_cancel")
})
