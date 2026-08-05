import assert from "node:assert/strict"
import test from "node:test"
import { optimizeRound2ByAge, round2AgeCost } from "./round2-age-optimizer.mjs"

function pairSet(groups) {
  const pairs = new Set()
  for (const group of groups) {
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      const [a, b] = [group[i], group[j]].sort((x, y) => x - y)
      pairs.add(`${a}-${b}`)
    }
  }
  return pairs
}

test("clusters round two by age without repeats or gender/table changes", () => {
  const round1 = Array.from({ length: 4 }, (_, table) =>
    Array.from({ length: 4 }, (_, seat) => table * 4 + seat + 1)
  )
  const round2 = Array.from({ length: 4 }, () => [])
  for (let table = 0; table < 4; table++) {
    for (let seat = 0; seat < 4; seat++) round2[(table + seat) % 4].push(round1[table][seat])
  }
  const ages = {}
  const genders = {}
  round1.forEach(group => group.forEach((number, seat) => {
    ages[number] = seat < 2 ? 24 + seat : 34 + seat
    genders[number] = seat % 2 === 0 ? "male" : "female"
  }))

  const optimized = optimizeRound2ByAge(round1, round2, genders, ages)
  assert.ok(round2AgeCost(optimized, ages) < round2AgeCost(round2, ages))
  assert.deepEqual(optimized.map(group => group.length), round2.map(group => group.length))

  const firstRoundPairs = pairSet(round1)
  const repeated = [...pairSet(optimized)].filter(pair => firstRoundPairs.has(pair))
  assert.deepEqual(repeated, [])

  const genderCounts = groups => groups.map(group => ({
    male: group.filter(number => genders[number] === "male").length,
    female: group.filter(number => genders[number] === "female").length,
  }))
  assert.deepEqual(genderCounts(optimized), genderCounts(round2))
})

test("is deterministic", () => {
  const round1 = [[1, 2], [3, 4]]
  const round2 = [[1, 3], [2, 4]]
  const genders = { 1: "male", 2: "male", 3: "male", 4: "male" }
  const ages = { 1: 20, 2: 40, 3: 39, 4: 21 }
  assert.deepEqual(
    optimizeRound2ByAge(round1, round2, genders, ages),
    optimizeRound2ByAge(round1, round2, genders, ages),
  )
})
