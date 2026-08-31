import test from "node:test"
import assert from "node:assert/strict"
import { performance } from "node:perf_hooks"
import { planFixedRoute, TheRoomFixedRouteError } from "../../app/lib/the-room-fixed-routes.mjs"

const person = (id, gender = "male") => ({ id, gender })
const seat = (attendee_id, round_number, table_number, seat_number = 1) => ({ attendee_id, round_number, table_number, seat_number })
const emptyInput = (overrides = {}) => ({
  attendee: person("new"), participants: [], existingSeats: [], tableCount: 5, roundCount: 3, activeRound: 1, ...overrides,
})

function addArrivals(genders, tableCount = 5, roundCount = 3) {
  const participants = []
  const existingSeats = []
  const results = []
  for (const [index, gender] of genders.entries()) {
    const attendee = person(`guest-${index + 1}`, gender)
    const result = planFixedRoute({ attendee, participants, existingSeats, tableCount, roundCount, activeRound: 1 })
    assert.ok(result, `arrival ${index + 1} should fit`)
    participants.push(attendee)
    existingSeats.push(...result.rows)
    results.push(result)
  }
  return { participants, existingSeats, results }
}

test("starts with zero guests and reserves only the arriving guest's route", () => {
  const result = planFixedRoute(emptyInput())
  assert.deepEqual(result, {
    rows: [seat("new", 1, 1), seat("new", 2, 1), seat("new", 3, 1)],
    repeatPairCount: 0,
  })
})

test("follows the agreed M,M,M,W,M,M,W arrival rule", () => {
  const { results } = addArrivals(["male", "male", "male", "female", "male", "male", "female"])
  assert.deepEqual(results.map(result => result.rows[0].table_number), [1, 1, 2, 1, 2, 3, 2])
})

test("enforces two places per gender while allowing the other gender to fill reserved places", () => {
  const { participants, existingSeats } = addArrivals(["male", "male", "male", "male"], 2)
  assert.equal(planFixedRoute(emptyInput({ participants, existingSeats, tableCount: 2 })), null)
  const woman = person("woman", "female")
  const result = planFixedRoute(emptyInput({ attendee: woman, participants, existingSeats, tableCount: 2 }))
  assert.ok(result)
  assert.equal(result.rows.length, 3)
  for (const row of result.rows) {
    const occupants = existingSeats.filter(existing => existing.round_number === row.round_number && existing.table_number === row.table_number)
    assert.equal(occupants.length, 2)
    assert.ok(!occupants.some(existing => existing.seat_number === row.seat_number))
  }
})

test("a full event never creates an extra table or overfills an existing one", () => {
  const { participants, existingSeats } = addArrivals(["male", "male", "female", "female"], 1)
  for (const gender of ["male", "female"]) {
    assert.equal(planFixedRoute(emptyInput({ attendee: person("new", gender), participants, existingSeats, tableCount: 1 })), null)
  }
  assert.deepEqual([...new Set(existingSeats.map(row => row.table_number))], [1])
})

test("issued guest routes and all input objects remain unchanged", () => {
  const initial = addArrivals(["male", "female", "male", "female"])
  const input = emptyInput(initial)
  const before = structuredClone(input)
  for (const row of input.existingSeats) Object.freeze(row)
  for (const participant of input.participants) Object.freeze(participant)
  Object.freeze(input.existingSeats)
  Object.freeze(input.participants)
  Object.freeze(input.attendee)
  Object.freeze(input)
  const result = planFixedRoute(input)
  assert.deepEqual(input, before)
  assert.ok(result.rows.every(row => row.attendee_id === "new"))
  assert.equal(result.rows.length, 3)
})

test("a round-two arrival receives no fabricated round-one seat or past meetings", () => {
  const participants = [person("earlier", "female")]
  const existingSeats = [seat("earlier", 1, 1), seat("earlier", 2, 1), seat("earlier", 3, 2)]
  const result = planFixedRoute(emptyInput({ participants, existingSeats, activeRound: 2 }))
  assert.deepEqual(result.rows.map(row => row.round_number), [2, 3])
  assert.equal(result.rows[0].table_number, 1)
  assert.equal(result.repeatPairCount, 0)
})

test("future routes avoid a previous tablemate even when it means using an empty table", () => {
  const participants = [person("earlier", "female")]
  const existingSeats = [1, 2, 3].map(round => seat("earlier", round, 1))
  const result = planFixedRoute(emptyInput({ participants, existingSeats, tableCount: 2 }))
  assert.deepEqual(result.rows.map(row => row.table_number), [1, 2, 2])
  assert.equal(result.repeatPairCount, 0)
})

test("future routes favor meeting new people over an empty table", () => {
  const participants = [person("a", "female"), person("b", "female"), person("c", "female")]
  const existingSeats = [
    seat("a", 1, 1), seat("b", 1, 2), seat("c", 1, 3),
    seat("a", 2, 1), seat("b", 2, 2), seat("c", 2, 3),
    seat("a", 3, 1), seat("b", 3, 2), seat("c", 3, 3),
  ]
  const result = planFixedRoute(emptyInput({ participants, existingSeats }))
  assert.deepEqual(result.rows.map(row => row.table_number), [1, 2, 3])
  assert.equal(result.repeatPairCount, 0)
})

test("search considers later rounds instead of committing to a greedy second-round choice", () => {
  const participants = [person("a", "female"), person("b", "female"), person("c", "female"), person("block1"), person("block2")]
  const existingSeats = [
    seat("a", 1, 1),
    seat("b", 2, 1), seat("c", 2, 2),
    seat("b", 3, 1), seat("block1", 3, 2), seat("block2", 3, 2, 2),
  ]
  const result = planFixedRoute(emptyInput({ participants, existingSeats, tableCount: 2 }))
  assert.deepEqual(result.rows.map(row => row.table_number), [1, 2, 1])
  assert.equal(result.repeatPairCount, 0)
})

test("reports each extra encounter when repeats cannot be avoided", () => {
  const participants = [person("a", "female"), person("b", "female")]
  const existingSeats = [1, 2, 3].flatMap(round => [seat("a", round, 1), seat("b", round, 1, 2)])
  const result = planFixedRoute(emptyInput({ participants, existingSeats, tableCount: 1 }))
  assert.equal(result.repeatPairCount, 4)
  assert.deepEqual(result.rows.map(row => row.table_number), [1, 1, 1])
})

test("capacity in a later round blocks the entire route before issuing current seating", () => {
  const participants = [person("a"), person("b"), person("c"), person("d")]
  const existingSeats = [seat("a", 3, 1), seat("b", 3, 1, 2), seat("c", 3, 2), seat("d", 3, 2, 2)]
  const before = structuredClone(existingSeats)
  assert.equal(planFixedRoute(emptyInput({ participants, existingSeats, tableCount: 2 })), null)
  assert.deepEqual(existingSeats, before)
})

test("results are deterministic across retries and input ordering", () => {
  const { participants, existingSeats } = addArrivals(["male", "female", "female", "male", "male", "female", "male"])
  const input = emptyInput({ participants, existingSeats })
  const result = planFixedRoute(input)
  assert.deepEqual(planFixedRoute(input), result)
  assert.deepEqual(planFixedRoute({ ...input, participants: [...participants].reverse(), existingSeats: [...existingSeats].reverse() }), result)
})

test("rejects malformed dimensions, genders, participant IDs, and existing seats", () => {
  const a = person("a")
  const b = person("b")
  const c = person("c")
  const valid = emptyInput({ participants: [a, b, c] })
  const invalid = [
    { tableCount: 0 }, { tableCount: 51 }, { tableCount: "5" }, { roundCount: 0 }, { roundCount: 21 }, { activeRound: 4 },
    { attendee: person("new", "unspecified") }, { attendee: person(123) }, { participants: [a, a] },
    { participants: [person("new", "female")] },
    { existingSeats: [seat("unknown", 1, 1)] }, { existingSeats: [seat("a", 0, 1)] },
    { existingSeats: [seat("a", 1, 6)] }, { existingSeats: [seat("a", 1, 1, 5)] },
    { existingSeats: [seat("a", 1, 1), seat("a", 1, 2)] },
    { existingSeats: [seat("a", 1, 1), seat("b", 1, 1)] },
    { existingSeats: [seat("a", 1, 1), seat("b", 1, 1, 2), seat("c", 1, 1, 3)] },
    { participants: [person("new")], existingSeats: [seat("new", 1, 1)] },
  ]
  for (const overrides of invalid) {
    assert.throws(() => planFixedRoute({ ...valid, ...overrides }), error =>
      error instanceof TheRoomFixedRouteError && error.code === "INVALID_FIXED_ROUTE_INPUT",
    )
  }
})

test("plans the maximum supported fifty-table, twenty-round event within a bounded runtime", () => {
  const participants = Array.from({ length: 150 }, (_, index) => person(`guest-${index}`, index % 3 === 2 ? "female" : "male"))
  const existingSeats = Array.from({ length: 20 }, (_, roundIndex) => participants.map((participant, index) =>
    seat(participant.id, roundIndex + 1, ((Math.floor(index / 3) + roundIndex * (index % 3 + 1)) % 50) + 1, index % 3 + 1),
  )).flat()
  const startedAt = performance.now()
  const result = planFixedRoute(emptyInput({ attendee: person("new", "female"), participants, existingSeats, tableCount: 50, roundCount: 20 }))
  const elapsed = performance.now() - startedAt
  assert.equal(result.rows.length, 20)
  assert.ok(elapsed < 5000, `maximum-size route took ${elapsed.toFixed(0)}ms`)
  assert.ok(result.rows.every(row => row.table_number >= 1 && row.table_number <= 50 && row.seat_number === 4))
})
