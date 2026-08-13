import test from "node:test"
import assert from "node:assert/strict"
import {
  collectEventSwapPairs,
  collectMatchResultSwapPairs,
  getTableSwapRounds,
  swapNumber,
} from "./participant-swap.mjs"

test("swapNumber supports a full swap and a one-way replacement", () => {
  assert.equal(swapNumber(10, 10, 20, true), 20)
  assert.equal(swapNumber(20, 10, 20, true), 10)
  assert.equal(swapNumber(20, 10, 20, false), 20)
  assert.equal(swapNumber(30, 10, 20, true), 30)
})

test("one-to-one table numbers swap only in their own phase", () => {
  assert.deepEqual(getTableSwapRounds(1), [1, 2])
  assert.deepEqual(getTableSwapRounds(2), [1, 2])
  assert.deepEqual(getTableSwapRounds(20), [20])
  assert.deepEqual(getTableSwapRounds(30), [30])
  assert.equal(getTableSwapRounds(3), null)
})

test("event pair planning keeps reciprocal pairs unique and maps both identities", () => {
  const rows = [
    { participant_number: 10, phase2_partner: 30, phase3_partner: 40 },
    { participant_number: 30, phase2_partner: 10, phase3_partner: null },
    { participant_number: 20, phase2_partner: 50, phase3_partner: 60 },
    { participant_number: 50, phase2_partner: 20, phase3_partner: null },
  ]

  assert.deepEqual(collectEventSwapPairs(rows, 10, 20, true), [
    { phase: "phase2", a: 20, b: 30 },
    { phase: "phase3", a: 20, b: 40 },
    { phase: "phase2", a: 10, b: 50 },
    { phase: "phase3", a: 10, b: 60 },
  ])
})

test("regular result planning swaps locked one-to-one partners but ignores group rows", () => {
  const rows = [
    { id: "a", participant_a_number: 10, participant_b_number: 30, participant_c_number: null },
    { id: "b", participant_a_number: 20, participant_b_number: 40, participant_c_number: null },
    { id: "group", participant_a_number: 10, participant_b_number: 50, participant_c_number: 60 },
  ]

  assert.deepEqual(collectMatchResultSwapPairs(rows, 10, 20), [
    { id: "a", a: 20, b: 30 },
    { id: "b", a: 10, b: 40 },
  ])
})
