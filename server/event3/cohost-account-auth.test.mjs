import assert from "node:assert/strict"
import test from "node:test"
import {
  buildEvent3CohostIdentity,
  event3CohostAgreementName,
  getEvent3CohostAccount,
  isValidEvent3CohostClaims,
} from "./cohost-account-auth.mjs"

test("only Sultan 1372 and Reham 1470 are authorized co-host accounts", () => {
  assert.deepEqual(getEvent3CohostAccount(1372), { number: 1372, displayName: "سلطان" })
  assert.deepEqual(getEvent3CohostAccount("1470"), { number: 1470, displayName: "ريهام" })
  assert.equal(getEvent3CohostAccount(1471), null)
  assert.equal(buildEvent3CohostIdentity({ assigned_number: 1471, name: "Raneem" }), null)
})

test("the participant profile name cannot change the authorized account identity", () => {
  const reham = buildEvent3CohostIdentity({ assigned_number: 1470, name: "  Reham   Alqahtani  " })
  assert.deepEqual(reham, { number: 1470, displayName: "ريهام", profileName: "Reham Alqahtani" })
  assert.equal(event3CohostAgreementName(reham), "Reham Alqahtani (#1470)")
  assert.equal(isValidEvent3CohostClaims({ cohost_number: 1470, cohost_display_name: "ريهام" }), true)
  assert.equal(isValidEvent3CohostClaims({ cohost_number: 1470, cohost_display_name: "رنين" }), false)
})
