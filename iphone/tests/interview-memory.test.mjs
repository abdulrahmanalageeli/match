import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileStatements, statementSchema, validatedStatements } from '../api/_lib/interview-memory.mjs';

const turn = (id, answer, extra = {}) => ({ id, answer, skipped: false, ...extra });
const fact = (topic, subject, quote, turnId, more = {}) => ({ topic, subject, quote, turnId, ...more });
const from = (...turns) => reconcileStatements([], [], turns);

test('an unpunctuated introduction keeps independent self, partner and intent statements with exact evidence', () => {
  const opening = turn('one', 'أنا طموحة أحب الرسم أبي شريك جاد طويل وأبي أتزوج قريب وأقابله قبل الزواج');
  const statements = from(opening);
  assert.deepEqual(statements.map(s => [s.subject, s.topic, s.quote]), [
    ['self', 'description', 'طموحة'], ['self', 'interest', 'أحب الرسم'],
    ['partner', 'seriousness', 'جاد'], ['partner', 'height', 'طويل'],
    ['intent', 'timeline', 'أبي أتزوج قريب'], ['intent', 'nextStep', 'أقابله قبل الزواج'],
  ]);
  assert.ok(statements.every(s => Object.keys(s).length === 4 && s.turnId === opening.id && opening.answer.includes(s.quote)));
});

test('Arabic list punctuation preserves the subject and a later speaker switch starts the self-description', () => {
  const statements = from(turn('one', 'أفضل زوجة مرحة، أصغر مني، قصيرة القامة، وأنا اجتماعي جدا'));
  assert.deepEqual(statements.map(s => [s.subject, s.quote]), [
    ['partner', 'مرحة'], ['partner', 'أصغر مني'], ['partner', 'قصيرة القامة'], ['self', 'اجتماعي جدا'],
  ]);
});

test('partial local matches do not turn contextual, conditional, negated, third-party or ambiguous height into a preference', () => {
  for (const answer of ['أنا قصيرة', 'مو شرط تكون قصيرة', 'قالت أختي أبي شريك طويل', 'أفضل بنت قصيرة النظر', 'لو كنت أبحث عن زوجة قصيرة', 'أنا اجتماعي مع أهلي فقط', 'أحب البنت القصيرة', 'نتقابل؟']) {
    assert.deepEqual(from(turn('one', answer)), [], answer);
  }
});

test('the model can supply new vocabulary but only with authorized literal evidence', () => {
  const turns = [turn('one', 'أرغب في تعلّم صناعة الخزف'), turn('two', 'أحب المشي', { skipped: true }), turn('three', '[تفصيل حساس محجوب]')];
  const ok = fact('interest', 'self', 'تعلّم صناعة الخزف', 'one');
  assert.deepEqual(reconcileStatements([], [ok, fact('other','self','أحب المشي','two'), fact('other','self','تعلم','one'),
    fact('other','self','[تفصيل حساس محجوب]','three'), fact('other','self','الخزف','alien'),
    fact('intelligenceScore','self','الخزف','one')], turns), [ok]);
  const identifier = turn('four', 'بريدي هو tester@example.invalid');
  assert.deepEqual(reconcileStatements([], [fact('other','self',identifier.answer,'four')], [identifier]), []);
});

test('reprocessing a partial response keeps unrelated facts and retractions still apply after resuming', () => {
  const one = turn('one', 'أبي شريك طويل وأحب السباحة');
  const two = turn('two', 'الطول ما يفرق معي');
  const first = from(one);
  const updated = reconcileStatements(first, [], [one, two]);
  assert.deepEqual(updated.map(s=>s.quote), ['أحب السباحة', 'الطول ما يفرق معي']);
  assert.deepEqual(reconcileStatements(updated, [], [one,two]), updated);
});

test('explicit numeric refinement leaves the original qualitative preference available in the private record', () => {
  const one = turn('one', 'أفضّل شريك طويل');
  const two = turn('two', 'من ١٧٠ إلى ١٨٠');
  const specific = fact('height','partner',two.answer,two.id);
  assert.deepEqual(reconcileStatements([], [specific], [one,two]).map(s=>s.quote), ['طويل', 'من ١٧٠ إلى ١٨٠']);
});

test('a model correction replaces exactly the matching prior claim, preserving other interests and subjects', () => {
  const one = turn('one', 'أحب الرسم وأحب السفر');
  const two = turn('two', 'كنت أقصد أن صديقتي تحب السفر، وأنا أحب التخييم.');
  const corrected = fact('interest','self','أحب التخييم','two',{replacesQuote:'أحب السفر'});
  const result = reconcileStatements([], [corrected], [one,two]);
  assert.deepEqual(result.map(s=>s.quote), ['أحب الرسم','أحب التخييم']);
  assert.deepEqual(reconcileStatements(result, [], [one,two]), result);
});

test('published schema only accepts bounded, exact, privately attributed statements', () => {
  assert.equal(statementSchema.items.additionalProperties, false);
  assert.ok(statementSchema.maxItems <= 40);
  assert.deepEqual(Object.keys(statementSchema.items.properties).sort(), [...statementSchema.items.required].sort());
});

test('reading an existing private record never derives additional statements from its turns', () => {
  const turns = [turn('one', 'أحب السفر وأبي شريك طويل')];
  const selected = fact('interest', 'self', 'أحب السفر', 'one');
  assert.deepEqual(validatedStatements([selected], turns), [selected]);
  assert.deepEqual(validatedStatements([], turns), []);
});

test('initial waw in a word and consent-redacted details do not break unrelated positive clauses', () => {
  const statements = from(turn('one', 'أبي رجل وسيم [تفصيل حساس محجوب] وطويل. ودي أقابله في مكان عام'));
  assert.deepEqual(statements.map(s => s.quote), ['وسيم', 'طويل', 'ودي أقابله في مكان عام']);
  assert.deepEqual(from(turn('two','أفضلها قصيرة')).map(s=>[s.topic,s.subject]), [['height','partner']]);
});
