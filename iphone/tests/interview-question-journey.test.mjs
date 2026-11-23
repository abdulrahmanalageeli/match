import assert from 'node:assert/strict';
import test from 'node:test';
import { nextQuestion, questionResumeKey, readQuestion, rememberQuestion } from '../src/interview/questionJourney.ts';

test('one list continues from any question and wraps to the earliest unanswered field', () => {
  const fields = ['self','partner','personality','timing'].map(id => ({id}));
  const answered = new Set(['partner']);
  const next = id => nextQuestion(fields, id, field => !answered.has(field.id))?.id;
  assert.equal(next('partner'), 'personality');
  answered.add('personality');
  assert.equal(next('personality'), 'timing');
  answered.add('timing');
  assert.equal(next('timing'), 'self');
  assert.equal(next('no-longer-applicable'), 'self');
  answered.add('self');
  assert.equal(next(), undefined);
  assert.equal(nextQuestion([], undefined, () => true), undefined);
});

test('resumes the exact question per member and catalog, with the old topic bookmark as a fallback', () => {
  const values = new Map();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', {configurable:true, value:{
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key),
  }});
  try {
    const uuid = '11111111-1234-1234-1234-000000000001';
    const key = questionResumeKey(uuid, false);
    const read = bookmark => readQuestion(bookmark, index => ['a','b','c','d'][index]);
    assert.equal(questionResumeKey('not-a-member-uuid', false), undefined);
    values.set(key, '2');
    assert.equal(read(key), 'c');
    rememberQuestion(key, 'personality:explore_views:self');
    assert.equal(read(key), 'personality:explore_views:self');
    assert.equal(read(questionResumeKey(uuid, true)), undefined);
    assert.equal(questionResumeKey(uuid, false, {practical:'marriage-v3', personality:'personality-v1'}), questionResumeKey(uuid,true));
    assert.equal(read(questionResumeKey(uuid, false, {practical:'marriage-v4', personality:'personality-v1'})), undefined);
    assert.equal(read(questionResumeKey(uuid.replace(/1$/, '2'), false)), undefined);
    rememberQuestion(key, undefined);
    assert.equal(values.size, 0);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous);
    else delete globalThis.sessionStorage;
  }
});
