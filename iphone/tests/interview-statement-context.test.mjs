import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statementContext } from '../src/interview/statementContext.ts';

const note = (topic, subject, quote) => ({topic, subject, quote, turnId:'intro'});
test('narrows the unanswered distinction with the correct person’s own words', () => {
  const notes = [note('social','self','أرتاح مع الناس'), note('social','partner','أبيها اجتماعية')];
  assert.equal(statementContext('preference:social_rhythm:partner',notes).quote, 'أبيها اجتماعية');
  assert.equal(statementContext('personality:group_energy:self',notes).quote, 'أرتاح مع الناس');
  assert.equal(statementContext('personality:group_energy:self',notes).prompt, undefined); // Preserve the scored statement.
  assert.equal(statementContext('personality:group_energy:self',notes.slice(1)), undefined);
  assert.equal(statementContext('personality:try_new_ideas:self',notes), undefined);
});
test('separates desired wedding timing and the formal step for personal and shared cards', () => {
  const notes = [note('timeline','intent','أتمنى أتزوج قريب')];
  assert.match(statementContext('preference:marriage_timeline:self',notes,true).prompt,/رسمية مع بعض/);
  assert.match(statementContext('preference:marriage_timeline:self',notes).prompt,/تبدأ الخطوة الرسمية/);
  assert.equal(statementContext('preference:marriage_timeline:partner',notes), undefined);
});
