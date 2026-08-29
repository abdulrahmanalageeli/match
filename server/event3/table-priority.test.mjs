import assert from "node:assert/strict"
import test from "node:test"
import {
  assignPriorityTables,
  EVENT3_PRIORITY_PARTICIPANT,
  EVENT3_PRIORITY_TABLE,
  PREFERRED_ONE_TO_ONE_TABLES,
} from "./table-priority.mjs"

test("puts two first-time attendees on a preferred table", () => {
  const pairs = [
    { a: 1, b: 2 },
    { a: 3, b: 4 },
    { a: 5, b: 6 },
  ]
  const ages = { 1: { age: 25 }, 2: { age: 25 }, 3: { age: 40 }, 4: { age: 41 }, 5: { age: 30 }, 6: { age: 31 } }
  const history = { 1: 0, 2: 0, 3: 1, 4: 1, 5: 1, 6: 1 }
  const assigned = assignPriorityTables(pairs, ages, history)
  const newPair = assigned.find(pair => pair.a === 1)
  assert.equal(newPair.priority.bothFirstTime, true)
  assert.ok(PREFERRED_ONE_TO_ONE_TABLES.includes(newPair.table))
})

test("uses age as a soft tie-breaker for otherwise similar pairs", () => {
  const pairs = [
    { a: 1, b: 2 },
    { a: 3, b: 4 },
    { a: 5, b: 6 },
  ]
  const profiles = {
    1: { age: 24 }, 2: { age: 25 },
    3: { age: 48 }, 4: { age: 50 },
    5: { age: 33 }, 6: { age: 34 },
  }
  const history = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 }
  const assigned = assignPriorityTables(pairs, profiles, history)
  assert.deepEqual(assigned.map(pair => pair.a), [3, 5, 1])
  assert.ok(PREFERRED_ONE_TO_ONE_TABLES.includes(assigned[0].table))
})

test("reserves tables above 16 for pairs where both attended multiple events", () => {
  const pairs = [
    { a: 1, b: 2 },
    { a: 3, b: 4 },
    { a: 5, b: 6 },
    { a: 9, b: 10 },
  ]
  const ages = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [index + 1, { age: 30 + index }]))
  const history = { 1: 0, 2: 0, 3: 1, 4: 1, 5: 1, 6: 2, 9: 3, 10: 4 }
  const assigned = assignPriorityTables(pairs, ages, history)
  const frequentPair = assigned.find(pair => pair.a === 9)
  assert.equal(frequentPair.priority.bothFrequent, true)
  assert.ok(frequentPair.table > 16)
})

test("uses each physical table once and remains deterministic", () => {
  const pairs = Array.from({ length: 20 }, (_, index) => ({ a: index * 2 + 1, b: index * 2 + 2 }))
  const profiles = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [index + 1, { age: 20 + (index % 30) }]))
  const history = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [index + 1, index % 4]))
  const first = assignPriorityTables(pairs, profiles, history)
  const second = assignPriorityTables(pairs, profiles, history)
  assert.equal(new Set(first.map(pair => pair.table)).size, pairs.length)
  assert.deepEqual(first, second)
})

test("gives participant 7 table 5 even when table 5 was not otherwise selected", () => {
  const assigned = assignPriorityTables([
    { a: EVENT3_PRIORITY_PARTICIPANT, b: 8 },
    { a: 20, b: 21 },
  ])

  assert.equal(assigned.find(pair => pair.a === EVENT3_PRIORITY_PARTICIPANT)?.table, EVENT3_PRIORITY_TABLE)
  assert.equal(new Set(assigned.map(pair => pair.table)).size, assigned.length)
})

test("exchanges table labels when participant 7 needs an occupied table 5", () => {
  const pairs = [
    { a: 20, b: 21 },
    { a: 22, b: 23 },
    { a: 24, b: 25 },
    { a: EVENT3_PRIORITY_PARTICIPANT, b: 8 },
    { a: 26, b: 27 },
  ]
  const profiles = {
    7: { age: 20 }, 8: { age: 20 },
    20: { age: 60 }, 21: { age: 60 },
    22: { age: 50 }, 23: { age: 50 },
    24: { age: 40 }, 25: { age: 40 },
    26: { age: 30 }, 27: { age: 30 },
  }
  const history = Object.fromEntries(Object.keys(profiles).map(number => [number, 1]))
  const assigned = assignPriorityTables(pairs, profiles, history)

  assert.equal(assigned.find(pair => pair.a === EVENT3_PRIORITY_PARTICIPANT)?.table, EVENT3_PRIORITY_TABLE)
  assert.equal(new Set(assigned.map(pair => pair.table)).size, assigned.length)
  assert.equal(assigned.filter(pair => pair.table === EVENT3_PRIORITY_TABLE).length, 1)
})
