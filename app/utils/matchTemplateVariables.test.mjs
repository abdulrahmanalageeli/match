import test from "node:test"
import assert from "node:assert/strict"
import { buildMatchTemplateVariables } from "./matchTemplateVariables.mjs"

test("choice-only match template maps the seven approved variables", () => {
  assert.deepEqual(buildMatchTemplateVariables({
    assigned_number: 7,
    name: "عبدالله",
    secure_token: "must-not-be-sent",
  }, {
    eventDateText: "الخميس 10 سبتمبر",
    eventTimeText: "8:00 مساءً",
    arrivalTimeText: "7:30 مساءً",
    locationName: "المكان",
    mapUrl: "https://maps.example/event",
  }), {
    1: "عبدالله",
    2: "7",
    3: "الخميس 10 سبتمبر",
    4: "8:00 مساءً",
    5: "7:30 مساءً",
    6: "المكان",
    7: "https://maps.example/event",
  })
})

test("choice-only match template resolves names from nested survey answers", () => {
  const variables = buildMatchTemplateVariables({
    assigned_number: 18,
    survey_data: { answers: { name: "سارة" } },
  }, {})

  assert.equal(variables[1], "سارة")
  assert.equal(variables[2], "18")
  assert.equal(Object.keys(variables).length, 7)
})
