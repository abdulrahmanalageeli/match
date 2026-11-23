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
  for (const answer of ['مو شرط تكون قصيرة', 'قالت أختي أبي شريك طويل', 'أفضل بنت قصيرة النظر', 'لو كنت أبحث عن زوجة قصيرة', 'أنا اجتماعي مع أهلي فقط', 'أحب البنت القصيرة', 'نتقابل؟']) {
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

test('an unfamiliar clause never discards independent facts before or after it', () => {
  const intro = turn('first', 'أحب السفر والقراءة وأعمل في التعليم وأتمنى شريكة طويلة');
  assert.deepEqual(from(intro).map(s=>[s.subject,s.topic,s.quote]), [
    ['self','interest','أحب السفر والقراءة'], ['partner','height','طويلة'],
  ]);
});

test('verbatim fragments cannot invert a negation, truncate its degree, or borrow a different subject', () => {
  const records = [
    [turn('a','ما أبي شريك طويل، أبي شريك قصير'), fact('height','partner','طويل','a')],
    [turn('b','أنا قصيرة وأفضل بنت طويلة'), fact('height','partner','قصيرة','b')],
    [turn('c','أفضل شريكة اجتماعية'), fact('social','self','اجتماعية','c')],
    [turn('d','أبحث عن شريكة تحب المشي'), fact('interest','self','تحب المشي','d')],
    [turn('e','أنا اجتماعي مع أقاربي فقط'), fact('social','self','اجتماعي','e')],
    [turn('f','أبيها قصيرة بس مو شرط'), fact('height','partner','قصيرة','f')],
    [turn('g','ما أعرف وش الخطوة الجاية'), fact('nextStep','intent','الخطوة الجاية','g')],
  ];
  for (const [source,wrong] of records) {
    assert.ok(!reconcileStatements([], [wrong], [source]).some(s=>s.subject===wrong.subject && s.quote===wrong.quote),source.answer);
    assert.deepEqual(validatedStatements([wrong],[source]),[],source.answer);
  }
  assert.deepEqual(from(records[1][0]).map(s=>[s.subject,s.quote]), [['self','قصيرة'],['partner','طويلة']]);
  const qualified = fact('social','self',records[4][0].answer,'e');
  assert.deepEqual(validatedStatements([qualified],[records[4][0]]),[qualified]);
});

test('reported examples in lists do not drift back to the member, including model-suggested notes', () => {
  const source = turn('one','أمي تقول: أبي شريك طويل، اجتماعي ومرح. أنا أحب السفر.');
  assert.deepEqual(reconcileStatements([], [fact('description','self','مرح','one')], [source]).map(s=>s.quote),['أحب السفر']);
  // A focused partner question establishes who the reply describes; a generic follow-up cannot.
  const reply = turn('two','اجتماعي', {question:'كيف تفضّل شريكك؟'});
  const partner = fact('social','partner','اجتماعي','two');
  assert.deepEqual(reconcileStatements([], [fact('social','self','اجتماعي','two')],[source,reply]).filter(s=>s.turnId==='two'),[partner]);
  assert.deepEqual(reconcileStatements([],[],[source,{...reply,question:'وش تقصد؟'}]).filter(s=>s.turnId==='two'),[]);
});

test('full multi-clause quotes retain qualifying information and a later preference can replace prior indifference', () => {
  const intro = turn('a','إذا حصل توافق، أكلم أهلها للتعارف الرسمي.');
  const exact = fact('nextStep','intent','إذا حصل توافق، أكلم أهلها للتعارف الرسمي','a');
  assert.deepEqual(reconcileStatements([], [exact], [intro]),[exact]);
  const neutral = turn('b','الطول ما يهمني');
  const newer = turn('c','أفضلها طويلة');
  const result = reconcileStatements([], [], [neutral,newer]);
  assert.deepEqual(result.map(s=>s.quote),['طويلة']);
  assert.deepEqual(reconcileStatements(result,[],[neutral,newer]),result);
});

test('explicit hobby language supports unfamiliar activities and a later opposite preference wins on every reload', () => {
  const one = turn('one', 'هوايتي ترميم الساعات وأبحث عن شريكة قصيرة');
  const two = turn('two', 'أفضلها طويلة');
  const expected = [fact('interest','self','هوايتي ترميم الساعات','one'),fact('height','partner','طويلة','two')];
  assert.deepEqual(from(one,two),expected);
  assert.deepEqual(reconcileStatements(expected,[],[one,two]),expected);
  assert.deepEqual(validatedStatements(expected,[one,two]),expected);
});
