import assert from 'node:assert/strict'
import test from 'node:test'
import { cohostDashboardView, isCohostDetailVisible } from './cohost-visibility.ts'

const participant = (number, phase2_partner, phase3_partner, table2, table3) => ({
  number, name: `Person ${number}`, attended: true,
  phase2_partner, phase3_partner, tables: { '1': 1, '2': 2, '20': table2, '30': table3 },
})
const pair = (a, b, table) => ({ participant1_number: a, participant2_number: b, table_number: table, compatibility_score: 88 })

test('cohost view omits both sides of private meetings, tables, and notes without changing attendance or source data', () => {
  const original = {
    event_id: 26,
    participants: [participant(7, 8, 9, 4, 5), participant(8, 7, 10, 4, 6), participant(9, 10, 7, 7, 5), participant(10, 9, 8, 7, 6)],
    choice_pairs: [pair(7, 8, 4), pair(9, 10, 7)],
    algorithm_pairs: [pair(9, 7, 5), pair(8, 10, 6)],
    locked_phase3_pairs: [pair(7, 9, 5), pair(10, 8, 6)],
    notes: [
      { scope_type: 'pair', participant_number: 8, participant2_number: 7, round: 20, note: 'private pair note' },
      { scope_type: 'table', round: 30, table_number: 5, note: 'private meeting table note' },
      { scope_type: 'participant', participant_number: 7, note: 'private personal note' },
      { scope_type: 'table', round: 1, table_number: 5, note: 'group note' },
      { scope_type: 'pair', participant_number: 8, participant2_number: 10, round: 30, note: 'other meeting' },
    ],
    sos_requests: [{ participant_number: 9, partner_number: 7, partner_name: 'Person 7', table_info: 'table 5', message: 'Please help' }],
  }
  const before = structuredClone(original)
  const view = cohostDashboardView(original)
  assert.deepEqual(original, before, 'no mutation of actual event records')
  assert.equal(view.participants.length, 4, 'attendance roster stays intact')
  assert.deepEqual(view.participants[0].tables, { '1': 1, '2': 2 })
  assert.equal(view.participants[0].attended, true)
  assert.equal(view.participants[0].phase2_partner, null)
  assert.equal(view.participants[0].phase3_partner, null)
  assert.equal(view.participants[1].phase2_partner, null, 'reverse partner link removed')
  assert.equal(view.participants[2].phase3_partner, null, 'reverse algorithm partner link removed')
  assert.equal(view.participants[1].phase3_partner, 10, 'unrelated round preserved')
  assert.deepEqual(view.choice_pairs, [original.choice_pairs[1]])
  assert.deepEqual(view.algorithm_pairs, [original.algorithm_pairs[1]])
  assert.deepEqual(view.locked_phase3_pairs, [original.locked_phase3_pairs[1]])
  assert.deepEqual(view.notes, original.notes.slice(3), 'notes and copied note summaries cannot reveal private pairs')
  assert.equal(view.sos_requests[0].partner_number, null)
  assert.equal(view.sos_requests[0].table_info, null)
  assert.equal(view.sos_requests[0].message, 'Please help', 'support requests remain available')
})

test('legacy and partially populated responses cannot reintroduce private tables through fallback paths', () => {
  const view = cohostDashboardView({ participants: [participant(7, null, null, 4, 5), participant(8, null, null, 4, 6)] })
  assert.equal(view.choice_pairs, undefined, 'legacy fallback remains supported')
  assert.equal(view.participants[1].tables['20'], undefined, 'table membership cannot disclose private meeting')
  assert.equal(view.participants[1].tables['30'], 6)
  const locked = cohostDashboardView({ participants: [participant(9, null, null, 2, 3)], locked_phase3_pairs: [pair(9, 7, 3)] })
  assert.deepEqual(locked.locked_phase3_pairs, [])
  assert.equal(locked.participants[0].tables['30'], undefined)
})

test('feedback is excluded in both directions without hiding unrelated participant numbers', () => {
  const entries = [{ from: 7, to: 8 }, { from: 8, to: '7' }, { from: 17, to: 70 }]
  assert.deepEqual(entries.filter(entry => isCohostDetailVisible(entry.from, entry.to)), [entries[2]])
  assert.equal(isCohostDetailVisible(null, undefined), true)
})
