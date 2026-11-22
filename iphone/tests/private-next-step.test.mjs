import test from 'node:test';
import assert from 'node:assert/strict';
import prompts from '../src/interview/opening-prompts.json' with { type: 'json' };
import { privateNextStep } from '../src/interview/privateNextStep.ts';
import { declaredNextStep } from '../src/onboarding/membershipReadiness.ts';

test('only the latest explicit plan from a confirmed interview carries into readiness', () => {
  const turn = { id: 't1', question: prompts.nextStep, answer: 'أكلم أهلي', skipped: false };
  const doc = { status: 'confirmed', turns: [turn, { ...turn, id: 't2', answer: 'أحتاج نتفق على الخطوة والوقت أول' }], readiness: [] };
  assert.equal(declaredNextStep(privateNextStep(doc).answer), 'after_agreement');
  assert.equal(privateNextStep({ ...doc, status: 'review' }), undefined);
  assert.equal(privateNextStep({ ...doc, turns: [{ ...turn, skipped: true }] }), undefined);
});

test('an introduction can supply a grounded plan without inferring timing from a partial quote', () => {
  const quote = 'أقدر أتقدم رسميًا قريب';
  const turn = { id: 't', question: prompts.introduction, answer: 'ما قلت إني ' + quote, skipped: false };
  const note = { id: 'nextStep', text: 'paraphrase', evidence: [{ turnId: turn.id, quote }] };
  const doc = { status: 'confirmed', turns: [turn], readiness: [note] };
  assert.equal(privateNextStep(doc).text, turn.answer);
  assert.equal(declaredNextStep(privateNextStep(doc).answer), undefined);
  assert.equal(privateNextStep({ ...doc, turns: [] }), undefined);
  assert.equal(declaredNextStep('خلال ستة أشهر'), undefined);
  assert.equal(declaredNextStep('ما أقدر أبدأ خطوة رسمية الحين.'), 'not_yet');
});
