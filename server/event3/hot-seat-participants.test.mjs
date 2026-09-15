import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../../app/routes/groups.tsx', import.meta.url), 'utf8');
const namesStart = source.indexOf('  const hotSeatGroupNames =');
const namesSource = source.slice(namesStart, source.indexOf(';', namesStart) + 1);
const startSource = source.slice(source.indexOf('  const startGame ='), source.indexOf('  const returnToActivitySelection ='));
const code = ts.transpileModule(`${namesSource}\n${startSource}\nstartGame('hot-seat');`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function startHotSeat(participantNames, groupMembers) {
  const state = {};
  const setters = Object.fromEntries([...startSource.matchAll(/\b(set\w+)\(/g)].map(([, name]) => [name, value => { state[name] = value; }]));
  vm.runInNewContext(code, {
    ...setters, participantNames, groupMembers,
    activityFocusTargetRef: { current: null }, games: [], disableOnboarding: true,
    hotSeatQuestions: [], shuffleArray: values => values,
    PRIORITY_QUESTION_COUNT: 16, HOT_SEAT_DURATION_SECONDS: 60,
  });
  return {
    names: Array.from(state.setHotSeatParticipants),
    manual: state.setHotSeatDraftParticipants ? Array.from(state.setHotSeatDraftParticipants) : undefined,
    index: state.setHotSeatIndex,
  };
}

test('Hot Seat starts with the current round names even when the separate group lookup is empty or stale', () => {
  for (const lookup of [[], ['عضو من جولة سابقة']]) {
    const result = startHotSeat(['أحمد', 'سارة', 'أحمد'], lookup);
    assert.deepEqual(result.names, ['أحمد', 'سارة', 'أحمد']);
    assert.equal(result.manual, undefined);
    assert.equal(result.index, 0);
  }
  assert.deepEqual(startHotSeat(['نورة', 'خالد'], ['أحمد', 'سارة']).names, ['نورة', 'خالد']);
});

test('standalone Hot Seat cleans legacy names without overwriting them, and keeps manual entry when no names exist', () => {
  assert.deepEqual(startHotSeat(undefined, ['#12 أحمد (28)', '  سارة  ', '']).names, ['أحمد', 'سارة']);
  for (const [current, legacy] of [[undefined, []], [[], ['عضو قديم']], [['  '], []]]) {
    const result = startHotSeat(current, legacy);
    assert.deepEqual(result.names, []);
    assert.equal(result.manual.length, 5);
  }
});
