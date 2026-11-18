import assert from 'node:assert/strict';
import test from 'node:test';
import { durationLabel } from '../src/member-copy.ts';
import memberAr from '../src/member-ar.json' with { type: 'json' };

test('shared member copy uses the correct Arabic durations and distinct consent actions', () => {
  assert.deepEqual(memberAr.days, { 7: '٧ أيام', 14: '١٤ يومًا', 30: '٣٠ يومًا' });
  for (const [days, label] of Object.entries(memberAr.days)) assert.equal(durationLabel(Number(days)), label);
  assert.notEqual(memberAr.proposeDuration, memberAr.acceptDuration);
  for (const stage of [1, 2]) {
    for (const actions of [memberAr.proposeStage, memberAr.acceptStage, memberAr.withdrawStage]) {
      assert.ok(actions[stage].includes(memberAr.stages[stage]));
    }
  }
});
