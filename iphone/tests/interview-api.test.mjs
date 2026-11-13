import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createInterviewService, initialInterviewDocument, parseInterviewInput, interviewCompletionRequest,
  applyInterviewCompletion, confirmInterviewChoices, validateProposal, INTERVIEW_MODEL, CONSENT_VERSION } from '../api/_lib/interview.mjs';
import handler from '../api/interview.mjs';

const headers = { authorization: 'Bearer real.jwt.token' };
const answer = 'إذا اتفقنا، أبغى الخطوة الرسمية خلال ستة أشهر.';
const turn = { id: randomUUID(), topic: 'intent', question: 'متى يناسبك الزواج؟', answer, skipped: false };
const candidate = { kind: 'preference', fieldId: 'marriage_timeline', side: 'self', values: ['A'], summary: 'تفضّل الخطوة الرسمية خلال ستة أشهر.',
  evidence: [{ turnId: turn.id, quote: 'خلال ستة أشهر' }], needsClarification: false };
const result = { followUp: false, question: 'إذا اختلفتم، وش يساعدك على العودة للحوار؟', proposals: [candidate], readiness: [], clarifications: [] };
const completion = value => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] });
const document = () => ({ ...initialInterviewDocument(), turns: [turn] });

function harness(options = {}) {
  let state = { document: null, revision: 0 }, counter = 0, revoked = false;
  const calls = [], modelCalls = [];
  const service = createInterviewService({ env: options.noKey ? {} : { OPENAI_API_KEY: 'server-secret', NISFAYN_AI_MODEL: 'do-not-use' },
    fetcher: async (url, init) => {
      const input = JSON.parse(init.body); calls.push({ url, init, ...input });
      if (revoked) return Response.json({ code: '42501' }, { status: 403 });
      const { command, payload } = input;
      if (['save', 'delete', 'reserve'].includes(command) && payload.expectedRevision !== state.revision) return Response.json({ code: '40001' }, { status: 409 });
      if (command === 'start' && !state.document) state = { document: structuredClone(payload.document), revision: ++counter };
      if (command === 'save') state = { document: structuredClone(payload.document), revision: ++counter };
      if (command === 'delete') state = { document: null, revision: 0 };
      if (command === 'reserve') return Response.json({ status: options.limited ? 'limited' : 'allowed', revision: state.revision });
      return Response.json(state);
    },
    clientFactory: config => {
      assert.equal(config.apiKey, 'server-secret');
      assert.equal(config.maxRetries, 0);
      return { chat: { completions: { create: async (request, runtime) => {
        modelCalls.push({ request, runtime });
        if (options.failure) throw new Error('PRIVATE PROVIDER ERROR');
        const transcript = JSON.parse(request.messages[1].content).transcript;
        const source = transcript.find(turn => !turn.skipped);
        return completion({ ...result, proposals: source ? [{ ...candidate, evidence: [{ turnId: source.id, quote: 'خلال ستة أشهر' }] }] : [] });
      } } } };
    },
  });
  return { service, calls, modelCalls, get state() { return structuredClone(state); }, revoke: () => { revoked = true; }, options };
}
async function start(h) { return h.service({ action: 'start', consentVersion: CONSENT_VERSION }, headers); }
async function send(h, revision, text = answer, requestId = randomUUID()) { return h.service({ action: 'answer', revision, requestId, answer: text }, headers); }

test('explicit consent, auth, allowed payload and bounded answers are required', async () => {
  const h = harness();
  await assert.rejects(h.service({ action: 'start', consentVersion: CONSENT_VERSION }), e => e.status === 401);
  await assert.rejects(h.service({ action: 'start' }, headers), e => e.code === 'consent_required');
  for (const input of [
    { action: '__proto__' }, { action: 'load', owner: 'someone-else' },
    { action: 'answer', revision: 1, requestId: randomUUID(), answer: 'a'.repeat(1201) },
    { action: 'answer', revision: 1, requestId: 'bad', answer },
    { action: 'confirm', revision: 1, choices: [], shareReview: 'true' },
  ]) assert.throws(() => parseInterviewInput(input), e => e.status === 400);
  assert.equal(h.calls.length, 0); assert.equal(h.modelCalls.length, 0);
});

test('session start does not call model; draft autosaves privately and answer uses only Luna', async () => {
  const h = harness();
  const first = await start(h);
  assert.equal(first.document.reviewSharing, false);
  assert.equal(h.modelCalls.length, 0);
  const draft = await h.service({ action: 'draft', revision: first.revision, answer }, headers);
  assert.equal(draft.document.draftAnswer, answer);
  assert.equal(h.modelCalls.length, 0);
  const sent = await send(h, draft.revision);
  assert.equal(sent.document.turns.length, 1);
  assert.equal(sent.document.draftAnswer, '');
  assert.equal(sent.document.proposals.length, 1);
  assert.equal(sent.document.confirmed.length, 0);
  assert.equal(sent.document.pendingAnalysis, false);
  const request = h.modelCalls[0].request;
  assert.equal(request.model, INTERVIEW_MODEL); assert.equal(request.model, 'gpt-6-luna');
  assert.equal(request.store, false); assert.equal(request.response_format.json_schema.strict, true);
  assert.equal(request.tools, undefined); assert.equal(request.metadata, undefined);
  assert.doesNotMatch(JSON.stringify(request), /real\.jwt|server-secret/);
  assert.ok(h.modelCalls[0].runtime.timeout <= 18000);
  assert.equal(h.calls.at(-1).init.headers.Authorization, 'Bearer real.jwt.token');
});

test('submitted answers survive provider outage; retry uses saved transcript without duplicate turn', async () => {
  const options = { failure: true }, h = harness(options);
  const first = await start(h);
  const requestId = randomUUID();
  const saved = await send(h, first.revision, answer, requestId);
  assert.equal(saved.document.turns[0].answer, answer);
  assert.equal(saved.document.pendingAnalysis, true);
  assert.equal(saved.document.lastMode, 'guided');
  assert.equal(saved.document.currentQuestion.topic, 'communication');
  assert.doesNotMatch(JSON.stringify(saved), /PRIVATE PROVIDER ERROR/);
  const replay = await send(h, first.revision, answer, requestId);
  assert.equal(replay.document.turns.length, 1); assert.equal(h.modelCalls.length, 1);
  options.failure = false;
  const retried = await h.service({ action: 'retry', revision: replay.revision }, headers);
  assert.equal(retried.document.pendingAnalysis, false);
  assert.equal(retried.document.turns.length, 1); assert.equal(h.modelCalls.length, 2);
});

test('quota exhaustion and absent key preserve answer without provider cost', async () => {
  for (const options of [{ limited: true }, { noKey: true }]) {
    const h = harness(options), first = await start(h);
    const saved = await send(h, first.revision);
    assert.equal(saved.document.turns.length, 1);
    assert.equal(saved.document.pendingAnalysis, true);
    assert.equal(h.modelCalls.length, 0);
    assert.equal(h.calls.filter(call => call.command === 'reserve').length, 1);
  }
});

test('a correction followed by an outage clears old interpretations and cannot be confirmed or shared', async () => {
  const options = {}, h = harness(options), first = await start(h);
  const interpreted = await send(h, first.revision);
  assert.equal(interpreted.document.proposals.length, 1);
  options.failure = true;
  const corrected = await send(h, interpreted.revision, 'تصحيح: لا أقدر خلال ستة أشهر؛ أبغى أكثر من سنة.');
  assert.equal(corrected.document.pendingAnalysis, true);
  assert.deepEqual(corrected.document.proposals, []);
  assert.deepEqual(corrected.document.readiness, []);
  assert.deepEqual(corrected.document.clarifications, []);
  const reviewed = await h.service({ action: 'review', revision: corrected.revision }, headers);
  await assert.rejects(h.service({ action: 'confirm', revision: reviewed.revision, choices: [], shareReview: true }, headers), e => e.code === 'analysis_pending');
  assert.equal(h.state.document.reviewSharing, false);
  assert.notEqual(h.state.document.status, 'confirmed');
});

test('retrying analysis preserves the question associated with an unsent draft', async () => {
  const options = { failure: true }, h = harness(options), first = await start(h);
  const saved = await send(h, first.revision);
  const drafted = await h.service({ action: 'draft', revision: saved.revision, answer: 'أفضل نفهم أسباب اختلافنا.' }, headers);
  options.failure = false;
  const analyzed = await h.service({ action: 'retry', revision: drafted.revision }, headers);
  assert.deepEqual(analyzed.document.currentQuestion, drafted.document.currentQuestion);
  assert.equal(analyzed.document.draftAnswer, drafted.document.draftAnswer);
  assert.equal(analyzed.document.pendingAnalysis, false);
});

test('revoked auth and stale revisions cannot invoke model or overwrite interview', async () => {
  const h = harness(), first = await start(h);
  const draft = await h.service({ action: 'draft', revision: first.revision, answer }, headers);
  await assert.rejects(send(h, first.revision), e => e.status === 409);
  assert.equal(h.modelCalls.length, 0); assert.equal(h.state.document.draftAnswer, answer);
  h.revoke();
  await assert.rejects(send(h, draft.revision), e => e.status === 401);
  assert.equal(h.modelCalls.length, 0);
});

test('exact answer evidence, valid fields and explicit partner choices only enter proposals', () => {
  assert.ok(validateProposal(candidate, [turn]));
  for (const bad of [
    { ...candidate, fieldId: 'admission_approved' }, { ...candidate, side: 'importance' },
    { ...candidate, values: ['Z'] }, { ...candidate, values: ['A', 'B'] },
    { ...candidate, evidence: [{ turnId: turn.id, quote: turn.question }] },
    { ...candidate, evidence: [{ turnId: randomUUID(), quote: 'خلال ستة أشهر' }] },
    { ...candidate, evidence: [{ turnId: turn.id, quote: 'لم أقل هذه العبارة' }] },
  ]) assert.equal(validateProposal(bad, [turn]), null);
  assert.equal(validateProposal(candidate, [{ ...turn, skipped: true }]), null);
  const parsed = applyInterviewCompletion(document(), completion({ ...result, proposals: [candidate, { ...candidate, fieldId: 'religion' }] }));
  assert.equal(parsed.proposals.length, 1);
  assert.deepEqual(parsed.confirmed, []);
  assert.equal(parsed.reviewSharing, false);
  const prompt = interviewCompletionRequest(document()).messages[0].content;
  assert.match(prompt, /لا تفترض أن الشخص يريد شريكًا مثله/);
  assert.match(prompt, /لا درجات أو قرارات قبول\/رفض/);
});

test('confirmation includes selected user-edited values only, sharing opt-in and no hard requirements', () => {
  const reviewed = { ...applyInterviewCompletion(document(), completion(result), true), status: 'review' };
  const confirmed = confirmInterviewChoices(reviewed, [{ id: 'preference:marriage_timeline:self', values: ['B'] }]);
  assert.equal(confirmed.status, 'confirmed');
  assert.deepEqual(confirmed.confirmed[0].values, ['B']);
  assert.equal(confirmed.reviewSharing, false);
  assert.equal(confirmed.hardRequirements, undefined);
  assert.equal(confirmInterviewChoices(reviewed, [], true).reviewSharing, true);
  assert.equal(confirmInterviewChoices(reviewed, []).confirmed.length, 0);
  assert.throws(() => confirmInterviewChoices(reviewed, [{ id: 'invented', values: ['A'] }]));
  assert.throws(() => confirmInterviewChoices(reviewed, [{ id: reviewed.proposals[0].id, values: ['Z'] }]));
});

test('skip does not spend AI budget or infer preferences and final review keeps Luna', async () => {
  const h = harness(), first = await start(h);
  const skipped = await h.service({ action: 'answer', revision: first.revision, requestId: randomUUID(), answer: '', skip: true }, headers);
  assert.equal(skipped.document.turns[0].skipped, true);
  assert.equal(h.modelCalls.length, 0);
  const sent = await send(h, skipped.revision);
  const reviewed = await h.service({ action: 'review', revision: sent.revision }, headers);
  assert.equal(reviewed.document.status, 'review'); assert.equal(reviewed.document.currentQuestion, null);
  assert.equal(h.modelCalls.at(-1).request.model, 'gpt-6-luna');
  assert.match(h.modelCalls.at(-1).request.messages[0].content, /هذه مراجعة نهائية/);
});

test('follow-up cannot trap users in one topic or exceed the interview limit', () => {
  const sameTwice = { ...document(), turns: [turn, { ...turn, id: randomUUID() }] };
  const next = applyInterviewCompletion(sameTwice, completion({ ...result, followUp: true, question: 'متى مرة أخرى؟' }));
  assert.equal(next.currentQuestion.topic, 'communication');
  assert.notEqual(next.currentQuestion.text, 'متى مرة أخرى؟');
  const full = { ...document(), turns: Array.from({ length: 12 }, () => ({ ...turn, id: randomUUID() })) };
  assert.equal(applyInterviewCompletion(full, completion({ ...result, followUp: true })).status, 'review');
});

test('review can return to questions without changing confirmed profile answers; repeated delete is harmless', async () => {
  const h = harness(), first = await start(h);
  const sent = await send(h, first.revision);
  const reviewed = await h.service({ action: 'review', revision: sent.revision }, headers);
  const resumed = await h.service({ action: 'resume', revision: reviewed.revision }, headers);
  assert.equal(resumed.document.status, 'active');
  assert.equal(resumed.document.currentQuestion.topic, 'communication');
  assert.equal(resumed.document.turns.length, 1);
  assert.equal(resumed.document.reviewSharing, false);
  assert.equal(resumed.document.confirmed.length, 0);
  assert.equal(resumed.document.proposals.length, 1);
  const deleted = await h.service({ action: 'delete', revision: resumed.revision }, headers);
  assert.equal(deleted.document, null);
  assert.equal((await h.service({ action: 'delete', revision: resumed.revision }, headers)).document, null);
});

function recorder() { return { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(value) { this.body = value; return this; }, end() { return this; } }; }
test('HTTP handler enforces methods, native preflight, no-store and body bounds', async () => {
  const get = recorder(); await handler({ method: 'GET', headers: {} }, get); assert.equal(get.statusCode, 405);
  const large = recorder(); await handler({ method: 'POST', headers: { 'content-length': '19000' } }, large); assert.equal(large.statusCode, 413);
  const native = recorder(); await handler({ method: 'OPTIONS', headers: { origin: 'capacitor://localhost', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' } }, native);
  assert.equal(native.statusCode, 204); assert.equal(native.headers['Cache-Control'], 'private, no-store');
  const foreign = recorder(); await handler({ method: 'OPTIONS', headers: { origin: 'https://other.example', 'access-control-request-method': 'POST' } }, foreign); assert.equal(foreign.statusCode, 403);
});
