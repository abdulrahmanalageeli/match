import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createInterviewService, initialInterviewDocument, parseInterviewInput, interviewCompletionRequest,
  applyInterviewCompletion, confirmInterviewChoices, validateProposal, interviewCoverage, INTERVIEW_MODEL, CONSENT_VERSION } from '../api/_lib/interview.mjs';
import handler from '../api/interview.mjs';
import preferenceCatalog from '../src/compatibility/catalog.json' with { type: 'json' };
import personalityCatalog from '../src/compatibility/personality-catalog.json' with { type: 'json' };

const headers = { authorization: 'Bearer header.' + Buffer.from(JSON.stringify({sub:'11111111-1111-4111-8111-111111111111'})).toString('base64url') + '.signature' };
const answer = 'إذا اتفقنا، أبغى الخطوة الرسمية خلال ستة أشهر.';
const turn = { id: randomUUID(), topic: 'intent', question: 'متى يناسبك الزواج؟', answer, skipped: false };
const candidate = { kind: 'preference', fieldId: 'marriage_timeline', side: 'self', values: ['A'], summary: 'تفضّل الخطوة الرسمية خلال ستة أشهر.',
  evidence: [{ turnId: turn.id, quote: 'خلال ستة أشهر' }], needsClarification: false };
const result = { followUp: false, questionTopic: 'communication', question: 'إذا اختلفتم، وش يساعدك على العودة للحوار؟', proposals: [candidate], readiness: [], clarifications: [] };
const completion = value => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] });
const document = () => ({ ...initialInterviewDocument(), turns: [turn] });

function harness(options = {}) {
  let state = structuredClone(options.initial ?? { document: null, revision: 0 }), counter = state.revision, revoked = false;
  const calls = [], modelCalls = [];
  const service = createInterviewService({ env: { SUPABASE_SERVICE_ROLE_KEY: 'service-secret', ...(options.noKey ? {} : { OPENAI_API_KEY: 'server-secret', NISFAYN_AI_MODEL: 'do-not-use' }) },
    fetcher: async (url, init) => {
      const input = JSON.parse(init.body); calls.push({ url, init, ...input });
      if (revoked) return Response.json({ code: '42501' }, { status: 403 });
      if (url.endsWith('marriage_interview_attest')) { if (options.attestationFailure) return Response.json({code:'unavailable'},{status:503}); if (options.attestationConflict) return Response.json({code:'40001'},{status:409}); if (input.event === 'fallback') state.fallbackAvailable = true; return Response.json({ok:true}); }
      const { command, payload } = input;
      if (['save', 'delete', 'reserve'].includes(command) && payload.expectedRevision !== state.revision) return Response.json({ code: '40001' }, { status: 409 });
      if (command === 'start' && !state.document) state = { ...state, document: structuredClone(payload.document), revision: ++counter };
      if (command === 'save') state = { ...state, document: structuredClone(payload.document), revision: ++counter };
      if (command === 'delete') state = { document: null, revision: 0 };
      if (command === 'reserve') return Response.json({ status: options.limited ? 'limited' : 'allowed', revision: state.revision });
      return Response.json(state);
    },
    clientFactory: config => {
      assert.equal(config.apiKey, 'server-secret');
      assert.equal(config.maxRetries, 0);
      return { chat: { completions: { create: async (request, runtime) => {
        modelCalls.push({ request, runtime, config });
        if (options.failure) throw new Error('PRIVATE PROVIDER ERROR');
        const transcript = JSON.parse(request.messages[1].content).transcript;
        const source = transcript.find(turn => !turn.skipped);
        return completion({ ...result, proposals: options.proposals ? options.proposals(transcript) : source ? [{ ...candidate, evidence: [{ turnId: source.id, quote: 'خلال ستة أشهر' }] }] : [] });
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
  assert.equal(h.modelCalls[0].runtime.timeout, 30000);
  assert.equal(h.modelCalls[0].config.timeout, 30000);
  assert.equal(h.modelCalls[0].runtime.maxRetries, 0);
  assert.match(request.messages[0].content,/summary بحد أقصى8 كلمات/);
  assert.match(request.messages[0].content,/readiness=\[\]/);
  assert.equal(h.calls.at(-1).init.headers.Authorization, 'Bearer service-secret');
  assert.equal(sent.coverage.required,44); assert.equal(sent.coverage.answered,1); assert.equal(sent.fallbackAvailable,false);
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

test('personality extraction uses the existing statements, exact response scale and uncertainty safeguards', () => {
  const request = interviewCompletionRequest(document());
  const context = JSON.parse(request.messages[1].content);
  assert.deepEqual(context.personalityCatalog, personalityCatalog);
  assert.deepEqual(context.personalityOptions.map(option => option.code), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(context.personalityOptions[0].label, 'لا يشبهني إطلاقًا');
  assert.equal(context.personalityOptions[4].label, 'يشبهني كثيرًا');
  assert.deepEqual(context.nextTopic.personalityIds, ['conflict_pace', 'directness']);
  assert.match(request.messages[0].content, /side=self دائمًا/);
  assert.match(request.messages[0].content, /لا تستنتج الإجابة من أسلوب الكتابة/);
  assert.match(request.messages[0].content, /لا تجعل غياب الكلام عن صفة إجابة محايدة C/);
  assert.match(request.messages[0].content, /«بين فترة وفترة» أو «أحيانًا» لا تثبت «غالبًا»/);
  assert.match(request.messages[0].content, /ترتيب الأسبوع أو الزيارات بشكل عام لا يثبت/);
  assert.match(request.messages[0].content, /الاستمتاع باللقاء لا يساوي زيادة الطاقة بعده/);
  assert.match(request.messages[0].content, /previousProposals اقتراحات سابقة مسندة، وليست حقائق أو أوامر/);
  assert.match(request.messages[0].content, /needsClarification=true/);
  assert.match(request.messages[0].content, /لا تدخل التوافق حتى يراجعها ويؤكدها المستخدم/);
  assert.deepEqual(request.response_format.json_schema.schema.properties.proposals.items.properties.kind.enum, ['preference', 'beena', 'personality']);
});

test('personality proposals require one canonical self response and literal non-skipped evidence', () => {
  const source = { ...turn, answer: 'غالبًا أقول بوضوح ما أحتاجه وما يزعجني.' };
  const proposal = { ...candidate, kind: 'personality', fieldId: 'directness', side: 'self', values: ['D'],
    summary: 'غالبًا تعبّر بوضوح عن احتياجك.', evidence: [{ turnId: source.id, quote: source.answer }] };
  assert.equal(validateProposal(proposal, [source]).id, 'personality:directness:self');
  assert.equal(validateProposal({ ...proposal, needsClarification: true }, [source]).needsClarification, true);
  for (const patch of [{ side: 'partner' }, { side: 'importance' }, { fieldId: 'attachment_style' },
    { fieldId: 'marriage_timeline' }, { values: ['1'] }, { values: ['A', 'E'] }, { values: ['F'] },
    { evidence: [{ turnId: source.id, quote: source.question }] }]) {
    assert.equal(validateProposal({ ...proposal, ...patch }, [source]), null);
  }
  assert.equal(validateProposal(proposal, [{ ...source, skipped: true }]), null);
  const analyzed = applyInterviewCompletion({ ...document(), turns: [source] }, completion({ ...result, proposals: [proposal] }), true);
  assert.equal(analyzed.proposals.length, 1);
  assert.deepEqual(analyzed.confirmed, []);
  assert.equal(analyzed.personalityAnswers, undefined);
});

test('partial personality interpretations cannot confirm a required session', async () => {
  const h=harness(),first=await start(h),sent=await send(h,first.revision);
  const reviewed=await h.service({action:'review',revision:sent.revision},headers);
  assert.equal(reviewed.document.status,'active');
  await assert.rejects(h.service({action:'confirm',revision:reviewed.revision,choices:[{id:'preference:marriage_timeline:self',values:['A']}]},headers), e=>e.code==='assessment_incomplete');
  assert.deepEqual(h.state.document.confirmed,[]);
});

test('remaining personality gets a contextual follow-up after eight turns without repeating covered themes', () => {
  const themes = ['intent', 'communication', 'closeness', 'family', 'practical', 'everyday', 'intent', 'communication'];
  const turns = themes.map(topic => ({ ...turn, id: randomUUID(), topic }));
  const personalityProposals = personalityCatalog.map(item => ({ ...candidate, kind: 'personality', fieldId: item.id,
    side: 'self', values: ['D'], evidence: [{ turnId: turns[0].id, quote: 'خلال ستة أشهر' }] }));
  const atEight = { ...document(), turns, proposals: [] };
  const partial = personalityProposals.filter(item => item.fieldId !== 'planning');
  const continued = applyInterviewCompletion(atEight, completion({ ...result, question: 'سؤال يعود لمحور سابق', proposals: partial }));
  assert.equal(continued.status, 'active');
  assert.equal(continued.currentQuestion.topic, 'practical');
  assert.match(continued.currentQuestion.text, /إجازة قصيرة/);
  assert.doesNotMatch(continued.currentQuestion.text, /مكان جديد|المألوف/,'the covered novelty trait is not asked again');
  assert.notEqual(continued.currentQuestion.text, 'سؤال يعود لمحور سابق');
  const complete = applyInterviewCompletion(atEight, completion({ ...result, proposals: personalityProposals }));
  assert.equal(complete.status, 'review');
  assert.equal(complete.currentQuestion, null);
  const uncertain = personalityProposals.map(item => ({ ...item, needsClarification: item.fieldId === 'planning' }));
  assert.equal(applyInterviewCompletion(atEight, completion({ ...result, proposals: uncertain })).currentQuestion.topic, 'practical');
  const context=JSON.parse(interviewCompletionRequest({...atEight,proposals:partial}).messages[1].content);
  assert.deepEqual(context.nextTopic.personalityIds,['planning']);
  assert.doesNotMatch(context.nextTopic.personalityQuestion,/مكان جديد|المألوف/);
  assert.equal(context.nextTopic.question,context.nextTopic.personalityQuestion);
});

test('six covered themes and complete personality do not force two more questions', () => {
  const turns=['intent','communication','closeness','family','practical','everyday'].map(topic=>({...turn,id:randomUUID(),topic}));
  const proposals=personalityCatalog.map(item=>({...candidate,kind:'personality',fieldId:item.id,side:'self',values:['D'],evidence:[{turnId:turns[0].id,quote:'خلال ستة أشهر'}]}));
  const completed=applyInterviewCompletion({...document(),turns,proposals:[]},completion({...result,proposals}));
  assert.equal(completed.status,'review');assert.equal(completed.currentQuestion,null);
  const uncertain=proposals.map(item=>({...item,needsClarification:item.fieldId==='quiet_comfort'}));
  const incomplete=applyInterviewCompletion({...document(),turns,proposals:[]},completion({...result,proposals:uncertain}));
  assert.equal(incomplete.currentQuestion.topic,'everyday');
  assert.match(incomplete.currentQuestion.text,/الصمت/);assert.doesNotMatch(incomplete.currentQuestion.text,/جمعة مع الناس/);
});

test('model questions cannot repeat a prior question with only punctuation or Arabic marks changed', () => {
  const repeated='مَتى يُناسبك الزَّواج ؟!!';
  const output=applyInterviewCompletion(document(),completion({...result,question:repeated}));
  assert.equal(output.currentQuestion.topic,'communication');assert.notEqual(output.currentQuestion.text,repeated);
  assert.match(output.currentQuestion.text,/سوء فهم/);
  const sameTopic=applyInterviewCompletion(document(),completion({...result,followUp:true,questionTopic:'intent',question:repeated}));
  assert.equal(sameTopic.currentQuestion.topic,'intent');assert.notEqual(sameTopic.currentQuestion.text,repeated);
  assert.match(sameTopic.currentQuestion.text,/من يبدأ/);
});

test('a follow-up about another theme cannot consume the current theme or repeat its old base question', () => {
  const turns=['intent','communication','closeness','family','practical','everyday'].map(topic=>({...turn,id:randomUUID(),topic}));
  const wrongTheme='متى تفضّلين تكون الخطوة الرسمية نفسها؟';
  const output=applyInterviewCompletion({...document(),turns,proposals:[]},completion({...result,followUp:true,questionTopic:'intent',question:wrongTheme}));
  assert.equal(output.currentQuestion.topic,'intent');
  assert.match(output.currentQuestion.text,/من يبدأ/);
  assert.notEqual(output.currentQuestion.text,wrongTheme);
  const revisit=applyInterviewCompletion({...document(),turns,proposals:[]},completion({...result,followUp:false,questionTopic:'intent',question:wrongTheme}));
  assert.match(revisit.currentQuestion.text,/من يبدأ/,'returning to an answered theme asks its missing trait, not its initial scenario');
  const request=JSON.parse(interviewCompletionRequest({...document(),turns,proposals:[]}).messages[1].content);
  assert.match(request.nextTopic.question,/من يبدأ/);
  assert.doesNotMatch(request.nextTopic.question,/الخطوة الرسمية/);
});

test('a valid clarification stays in the current theme and wrong-topic model text uses a safe fallback', () => {
  const source={...document(),turns:[turn,{...turn,id:randomUUID(),topic:'communication'}]};
  const clarification='لما تقول تهدأ، تقصد دقائق أو تفضّل العودة للحوار في اليوم التالي؟';
  const output=applyInterviewCompletion(source,completion({...result,followUp:true,questionTopic:'communication',question:clarification}));
  assert.equal(output.currentQuestion.topic,'communication');assert.equal(output.currentQuestion.text,clarification);
  const wrong=applyInterviewCompletion(source,completion({...result,questionTopic:'practical',question:'كيف تقسّم الميزانية؟'}));
  assert.equal(wrong.currentQuestion.topic,'closeness');assert.match(wrong.currentQuestion.text,/الاهتمام/);
  assert.throws(()=>applyInterviewCompletion(source,completion({...result,questionTopic:'unknown'})));
});

test('omitted previous interpretations prevent repeat routing but never return as confirmable answers', () => {
  const turns=['intent','communication','closeness','family','practical','everyday','intent'].map(topic=>({...turn,id:randomUUID(),topic}));
  const previous=personalityCatalog.filter(item=>item.id!=='support').map(item=>({...candidate,kind:'personality',fieldId:item.id,side:'self',values:['D'],evidence:[{turnId:turns[0].id,quote:'خلال ستة أشهر'}]}));
  const fresh=previous.filter(item=>item.fieldId!=='conflict_pace');
  const pending={...document(),turns,proposals:[]};
  const output=applyInterviewCompletion(pending,completion({...result,proposals:fresh}),false,previous);
  assert.equal(output.currentQuestion.topic,'family');assert.match(output.currentQuestion.text,/الضغط/);
  assert.equal(output.proposals.some(item=>item.fieldId==='conflict_pace'),false);
  assert.deepEqual(output.confirmed,[]);
  assert.throws(()=>confirmInterviewChoices({...output,status:'review'},[{id:'personality:conflict_pace:self',values:['D']}]));
  const uncertain=[...fresh,{...previous.find(item=>item.fieldId==='conflict_pace'),needsClarification:true}];
  const clarify=applyInterviewCompletion(pending,completion({...result,proposals:uncertain}),false,previous);
  assert.equal(clarify.currentQuestion.topic,'communication','fresh uncertainty overrides earlier clear coverage');
  const request=interviewCompletionRequest({...pending,proposals:previous});
  assert.deepEqual(JSON.parse(request.messages[1].content).previousProposals,previous);
  assert.deepEqual(pending.proposals,[],'routing context does not mutate the saved pending document');
});

test('combined assessments fit the bounded confirmation payload', () => {
  const choices = Array.from({ length: 64 }, (_, index) => ({ id: 'item-'+index, values: ['A'] }));
  assert.equal(parseInterviewInput({ action: 'confirm', revision: 1, choices }).choices.length, 64);
  assert.throws(() => parseInterviewInput({ action: 'confirm', revision: 1, choices: [...choices, { id: 'overflow', values: ['A'] }] }));
});

test('an existing v1 twelve-turn interview is reanalyzed in place and requires fresh confirmation', async () => {
  const themes=['intent','communication','closeness','family','practical','everyday'];
  const turns=Array.from({length:12},(_,index)=>({...turn,id:randomUUID(),topic:themes[index%themes.length],answer:'غالبًا أقول بوضوح ما أحتاجه وما يزعجني.'}));
  const legacy={...initialInterviewDocument(),promptVersion:'wudayn-interview-1',status:'confirmed',currentQuestion:null,turns};
  const h=harness({initial:{document:legacy,revision:25},proposals:transcript=>[{...candidate,kind:'personality',fieldId:'directness',side:'self',values:['D'],evidence:[{turnId:transcript[0].id,quote:transcript[0].answer}]}]});
  const loaded=await h.service({action:'load'},headers);assert.equal(loaded.document.promptVersion,'wudayn-interview-3');assert.equal(loaded.document.pendingAnalysis,true);
  const refreshed=await h.service({action:'review',revision:loaded.revision},headers);
  assert.deepEqual(refreshed.document.turns,turns);
  assert.equal(refreshed.document.promptVersion,'wudayn-interview-3');assert.equal(refreshed.document.status,'active');
  assert.equal(refreshed.document.proposals[0].kind,'personality');assert.deepEqual(refreshed.document.confirmed,[]);
  assert.ok(refreshed.document.currentQuestion);assert.equal(h.modelCalls.length,1);
  assert.equal(h.calls.some(call=>call.command==='delete'||call.command==='start'),false);
});

test('required sessions reject skipping and early review cannot end missing answers', async () => {
  const h=harness(),first=await start(h);
  await assert.rejects(h.service({action:'answer',revision:first.revision,requestId:randomUUID(),answer:'',skip:true},headers),e=>e.code==='answer_required');
  assert.equal(h.modelCalls.length,0);assert.equal(h.state.document.turns.length,0);
  const empty=await h.service({action:'review',revision:first.revision},headers);assert.equal(empty.document.status,'active');
  const sent=await send(h,empty.revision),reviewed=await h.service({action:'review',revision:sent.revision},headers);
  assert.equal(reviewed.document.status,'active');assert.ok(reviewed.document.currentQuestion);
  const request=h.modelCalls.at(-1).request,context=JSON.parse(request.messages[1].content);
  assert.equal(context.beenaCatalog,undefined);assert.equal(context.missingFields.length,43);
  assert.deepEqual(request.response_format.json_schema.schema.properties.proposals.items.properties.kind.enum,['preference','personality']);
  assert.match(request.messages[0].content,/٣٢ إجابة تفضيلات/);
});

test('the automatic terminal answer runs complete final review within the same provider request', async () => {
  const turns=['intent','communication','closeness','family','practical','everyday','intent','communication'].map(topic=>({...turn,id:randomUUID(),topic}));
  const proposals=personalityCatalog.filter(item=>item.id!=='support').map(item=>({...candidate,kind:'personality',fieldId:item.id,side:'self',values:['D'],evidence:[{turnId:turns[0].id,quote:'خلال ستة أشهر'}]}));
  const initial={...initialInterviewDocument(),turns,proposals,currentQuestion:{topic:'family',text:'كيف تتعامل مع الضغط؟',suggestions:[]}};
  const h=harness({initial:{document:initial,revision:18}});
  const completed=await send(h,18,'غالبًا أتكلم مع شخص أثق فيه لما أكون تحت ضغط.');
  assert.equal(completed.document.turns.length,9);assert.equal(completed.document.status,'review');
  assert.equal(h.modelCalls.length,1,'terminal extraction must not make a second paid request');
  assert.equal(h.modelCalls[0].runtime.timeout,36000);assert.equal(h.modelCalls[0].config.timeout,36000);
  assert.match(h.modelCalls[0].request.messages[0].content,/هذه مراجعة نهائية/);
  assert.match(h.modelCalls[0].request.messages[0].content,/وصف الذات ورغبة الشريك بشكل مستقل/);
  assert.doesNotMatch(h.modelCalls[0].request.messages[0].content,/readiness=\[\]/);
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

test('all 44 explicit interpretations can be reviewed once, edited and attested without Beena',async()=>{
 const proposals=turns=>preferenceCatalog.dimensions.flatMap(d=>['self','partner'].map(side=>({...candidate,fieldId:d.id,side,values:[d.options[0].code],evidence:[{turnId:turns[0].id,quote:turns[0].answer}]}))).concat(personalityCatalog.map(p=>({...candidate,kind:'personality',fieldId:p.id,side:'self',values:['D'],evidence:[{turnId:turns[0].id,quote:turns[0].answer}]})));
 const h=harness({proposals}),first=await start(h),sent=await send(h,first.revision);
 assert.equal(sent.document.status,'review');assert.deepEqual(sent.coverage,{answered:44,required:44});
 assert.equal(h.calls.at(-1).event,'analyzed');
 const choices=sent.document.proposals.map(p=>({id:p.id,values:p.values}));
 await assert.rejects(h.service({action:'confirm',revision:sent.revision,choices:choices.slice(1)},headers),e=>e.code==='assessment_incomplete');
 const confirmed=await h.service({action:'confirm',revision:sent.revision,choices},headers);
 assert.equal(confirmed.document.confirmed.length,44);assert.equal(confirmed.document.reviewSharing,false);
 assert.equal(h.calls.at(-1).event,'complete');assert.equal(h.calls.at(-1).member_id,'11111111-1111-4111-8111-111111111111');
 assert.equal((await h.service({action:'load'},headers)).document.status,'confirmed');
});
test('manual fallback is granted by a server failure receipt and survives reload',async()=>{
 for(const options of [{failure:true},{limited:true},{noKey:true}]){
  const h=harness(options),first=await start(h);assert.equal(first.fallbackAvailable,false);
  const failed=await send(h,first.revision);assert.equal(failed.fallbackAvailable,true);
  assert.equal(h.calls.at(-1).event,'fallback');assert.ok(['unavailable','capacity'].includes(h.calls.at(-1).reason));
  assert.equal((await h.service({action:'load'},headers)).fallbackAvailable,true);
 }
});
test('required final review cannot infer completion from visited topics or personality-only coverage',()=>{
 const strict={...initialInterviewDocument(true),turns:['intent','communication','closeness','family','practical','everyday'].map(topic=>({...turn,id:randomUUID(),topic}))};
 const proposals=personalityCatalog.map(p=>({...candidate,kind:'personality',fieldId:p.id,side:'self',values:['D'],evidence:[{turnId:strict.turns[0].id,quote:'خلال ستة أشهر'}]}));
 const out=applyInterviewCompletion(strict,completion({...result,proposals}),true);
 assert.equal(out.status,'active');assert.deepEqual(interviewCoverage(out),{answered:12,required:44});
 assert.throws(()=>confirmInterviewChoices({...out,status:'review'},out.proposals.map(p=>({id:p.id,values:p.values}))),e=>e.code==='assessment_incomplete');
});

test('interrupted service attestation keeps analysis retryable and never grants fallback',async()=>{
 const options={attestationFailure:true},h=harness(options),first=await start(h);
 await assert.rejects(send(h,first.revision),e=>e.code==='unavailable');
 const loaded=await h.service({action:'load'},headers);assert.equal(loaded.document.pendingAnalysis,true);assert.equal(loaded.fallbackAvailable,false);
 options.attestationFailure=false;
 const retried=await h.service({action:'retry',revision:loaded.revision},headers);assert.equal(retried.document.pendingAnalysis,false);
 options.attestationConflict=true;await assert.rejects(send(h,retried.revision),e=>e.code==='conflict');
});

test('required dialogue scopes follow-up context to missing sides and avoids survey headings',()=>{
 const turns=['intent','communication','closeness','family','practical','everyday'].map(topic=>({...turn,id:randomUUID(),topic}));
 const all=preferenceCatalog.dimensions.flatMap(d=>['self','partner'].map(side=>({...candidate,fieldId:d.id,side,values:[d.options[0].code],evidence:[{turnId:turns[0].id,quote:'خلال ستة أشهر'}]}))).concat(personalityCatalog.map(p=>({...candidate,kind:'personality',fieldId:p.id,side:'self',values:['D'],evidence:[{turnId:turns[0].id,quote:'خلال ستة أشهر'}]}))).map(p=>validateProposal(p,turns));
 const partial=all.filter(p=>p.id!=='preference:repair_after_conflict:partner');
 const source={...initialInterviewDocument(true),turns,proposals:partial};
 const request=interviewCompletionRequest(source),context=JSON.parse(request.messages[1].content);
 assert.deepEqual(context.nextTopic.dimensionIds,['repair_after_conflict']);
 assert.deepEqual(context.nextTopic.personalityIds,[]);
 assert.deepEqual(context.nextTopic.missingFields.map(p=>[p.fieldId,p.side]),[['repair_after_conflict','partner']]);
 assert.equal(context.nextTopic.scenarioIds,undefined);assert.equal(context.possibleFollowUpTopic,null);
 assert.match(context.nextTopic.question,/شريكك.*الحوار/);assert.doesNotMatch(context.nextTopic.question,/:|أي أسلوب/);
 const fallback=applyInterviewCompletion(source,completion({...result,question:'',proposals:partial}));
 assert.equal(fallback.currentQuestion.text,context.nextTopic.question);
 const conversation='نرجع لطريقة الصلح بينكم. بعد الزعل، وش التصرف اللي تنتظره من شريكك عشان ترجعون مرتاحين؟';
 const natural=applyInterviewCompletion(source,completion({...result,question:conversation,proposals:partial}));
 assert.equal(natural.currentQuestion.text,conversation);assert.equal(natural.status,'active');
 assert.match(request.messages[0].content,/لا تردد إجابة العضو/);
 assert.match(request.messages[0].content,/لا تبدأ كل رد/);
 assert.match(request.messages[0].content,/لا تتخذ قرار قبول أو رفض آلي/);
 assert.match(request.messages[0].content,/إذا كانت الإجابة قصيرة لكنها واضحة، اقبلها/);
});

test('required dialogue can clarify a genuinely missing current topic after two turns',()=>{
 const source={...initialInterviewDocument(true),turns:[turn,{...turn,id:randomUUID()}]};
 const context=JSON.parse(interviewCompletionRequest(source).messages[1].content);
 assert.equal(context.possibleFollowUpTopic.id,'intent');
 assert.deepEqual(context.possibleFollowUpTopic.dimensionIds,['marriage_timeline']);
 assert.ok(context.possibleFollowUpTopic.missingFields.every(field=>['marriage_timeline','initiative','depth'].includes(field.fieldId)));
 assert.equal(interviewCoverage(source).required,44);
});
