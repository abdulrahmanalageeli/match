import test from "node:test"
import assert from "node:assert/strict"
import { buildMutualRound } from "./mutual-choice.mjs"
import { EVENT3_FORMAT_MUTUAL_CHOICE, normalizeEvent3Format, event3GroupRoundCount, isChoiceOnlyEvent3 } from "./event-format.mjs"

const roster = count => Array.from({ length: count }, (_, i) => ({ participant_number: i + 1, gender: i % 2 ? "male" : "female" }))
const byKind = (seats, kind) => seats.filter(seat => seat.kind === kind)
function assertPlan(seats, count) {
  assert.equal(seats.length, count)
  assert.equal(new Set(seats.map(seat => seat.participant_number)).size, count)
  for (const seat of byKind(seats, "pair")) {
    const partner = seats.find(other => other.participant_number === seat.partner_number)
    assert.equal(partner.kind, "pair")
    assert.equal(partner.partner_number, seat.participant_number)
    assert.equal(partner.table_number, seat.table_number)
    assert.equal(seats.filter(other => other.table_number === seat.table_number).length, 2)
  }
  const sizes = [...new Set(byKind(seats, "group").map(seat => seat.group_number))].map(group => seats.filter(seat => seat.group_number === group).length)
  assert.ok(sizes.every(size => size >= 3 && size <= 6))
  if (sizes.length) assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1)
}

test("mutual choice is a separate six-round format", () => {
  assert.equal(normalizeEvent3Format(EVENT3_FORMAT_MUTUAL_CHOICE), EVENT3_FORMAT_MUTUAL_CHOICE)
  assert.equal(event3GroupRoundCount(EVENT3_FORMAT_MUTUAL_CHOICE), 6)
  assert.equal(isChoiceOnlyEvent3(EVENT3_FORMAT_MUTUAL_CHOICE), false)
  assert.equal(event3GroupRoundCount("classic"), 2)
  assert.equal(event3GroupRoundCount("choice_only_three_groups"), 3)
})

test("only reciprocal same-group choices produce the next one-to-one", () => {
  const participants = roster(12)
  const initialAssignments = participants.map((p, i) => ({ ...p, table_number: i < 6 ? 1 : 2 }))
  const previousAssignments = buildMutualRound({ participants, round: 1, initialAssignments })
  const choices = [
    { participant_number: 1, chosen_number: 2 }, { participant_number: 2, chosen_number: 1 },
    { participant_number: 3, chosen_number: 4 }, { participant_number: 4, chosen_number: null },
    { participant_number: 5, chosen_number: 7 }, { participant_number: 7, chosen_number: 5 },
    { participant_number: 6, chosen_number: 6 }, { participant_number: 8, chosen_number: 999 },
  ]
  const next = buildMutualRound({ participants, round: 2, previousAssignments, choices })
  assert.deepEqual(byKind(next, "pair").map(seat => seat.participant_number), [1, 2])
  assertPlan(next, 12)
  const following = buildMutualRound({ participants, round: 3, previousAssignments: next, choices })
  assert.equal(following.find(seat => seat.participant_number === 1).kind, "group")
  assert.equal(following.find(seat => seat.participant_number === 2).kind, "group")
})

test("a remainder never becomes a forced pair and returns in the next round", () => {
  for (const count of [5, 6]) {
    const participants = roster(count)
    const previousAssignments = buildMutualRound({ participants, round: 1 })
    const choices = [1, 2, 3, 4].map(number => ({ participant_number: number, chosen_number: number % 2 ? number + 1 : number - 1 }))
    const next = buildMutualRound({ participants, round: 2, previousAssignments, choices })
    assert.equal(byKind(next, "pair").length, 4)
    assert.equal(byKind(next, "break").length, count - 4)
    assert.ok(byKind(next, "break").every(seat => seat.table_number === null && seat.partner_number === null))
    const following = buildMutualRound({ participants, round: 3, previousAssignments: next })
    assert.equal(byKind(following, "group").length, count)
  }
})

test("initial normal groups and their physical table numbers are preserved", () => {
  const participants = roster(6)
  const seats = buildMutualRound({ participants, round: 1, initialAssignments: participants.map(p => ({ ...p, table_number: 8 })) })
  assert.ok(seats.every(seat => seat.table_number === 8))
  assert.throws(() => buildMutualRound({ participants, round: 1, initialAssignments: [{ participant_number: 1, table_number: 1 }] }), /everyone/)
})

test("balanced rosters remain complete across all six rounds, including changing pair pools", () => {
  for (const count of [6, 7, 12, 18, 24, 36, 42, 44, 46]) {
    const participants = roster(count)
    let previousAssignments = []
    let choices = []
    const history = []
    for (let round = 1; round <= 6; round++) {
      const seats = buildMutualRound({ participants, previousAssignments, choices, history, round })
      assertPlan(seats, count)
      assert.deepEqual(buildMutualRound({ participants, previousAssignments, choices, history, round }), seats)
      choices = []
      for (const group of new Set(byKind(seats, "group").map(seat => seat.group_number))) {
        const members = seats.filter(seat => seat.group_number === group)
        const [a, b] = members
        choices.push({ participant_number: a.participant_number, chosen_number: b.participant_number }, { participant_number: b.participant_number, chosen_number: a.participant_number })
      }
      history.push(...seats.map(seat => ({ ...seat, round_number: round })))
      previousAssignments = seats
    }
  }
})

test("new groups distribute gender and introduce different companions", () => {
  const participants = roster(24)
  const first = buildMutualRound({ participants, round: 1 })
  const second = buildMutualRound({ participants, round: 2, previousAssignments: first, history: first.map(seat => ({ ...seat, round_number: 1 })) })
  for (const seats of [first, second]) {
    for (const group of new Set(seats.map(seat => seat.group_number))) {
      const members = seats.filter(seat => seat.group_number === group)
      assert.equal(members.filter(seat => seat.participant_number % 2 === 0).length, 3)
    }
  }
  const before = new Map(first.map(seat => [seat.participant_number, seat.group_number]))
  for (const seat of second) {
    const same = second.filter(other => other.group_number === seat.group_number && before.get(other.participant_number) === before.get(seat.participant_number))
    assert.ok(same.length <= 2, "at least four fresh introductions per person")
  }
})

test("six is the final slot and invalid rosters cannot silently lose participants", () => {
  assert.throws(() => buildMutualRound({ participants: roster(6), round: 7 }), /Invalid/)
  assert.throws(() => buildMutualRound({ participants: roster(2), round: 1 }), /roster/)
  assert.throws(() => buildMutualRound({ participants: [{ participant_number: 1 }, { participant_number: 1 }, { participant_number: 2 }], round: 1 }), /roster/)
})
