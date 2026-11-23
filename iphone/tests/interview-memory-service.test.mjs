import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createInterviewService, CONSENT_VERSION, interviewCompletionRequest, initialInterviewDocument, parseInterviewInput } from '../api/_lib/interview.mjs';
import prompts from '../src/interview/refinement-prompts.json' with {type:'json'};

function fixture(interpret) {
  let document = null, revision = 0, fingerprint;
  const requests = [];
  const service = createInterviewService({
    env:{OPENAI_API_KEY:'fixture',SUPABASE_SERVICE_ROLE_KEY:'fixture'},
    fetcher: async (url, init) => {
      const {command,payload,event,expected_revision} = JSON.parse(init.body);
      if (event) {
        assert.equal(expected_revision,revision);
        const current = JSON.stringify([document.turns,document.proposals]);
        if (event === 'refined') {
          const previous = JSON.stringify([document.turns.slice(0,-1),document.proposals]);
          assert.ok(fingerprint === previous || fingerprint === current);
        }
        fingerprint = current;
      }
      if (command === 'reserve') return Response.json({status:'allowed'});
      if (command === 'start' || command === 'save') {
        if (command === 'save') assert.equal(payload.expectedRevision,revision);
        revision++;
        document = structuredClone(payload.document);
      }
      return Response.json({document,revision});
    },
    clientFactory: () => ({chat:{completions:{create: async request => {
      requests.push(request);
      const data = JSON.parse(request.messages[1].content);
      const output = {reply:'',answerDisposition:'answered',followUp:false,questionTopic:'',question:'',
        questionFields:[],proposals:[],readiness:[],clarifications:[],statements:[],...interpret?.(data)};
      return {choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]};
    }}}}),
  });
  return {requests,call: payload=>service(payload,{'x-test-session':'a'.repeat(64)})};
}

async function introduce(h, answer, options = {}) {
  const first = await h.call({action:'start',consentVersion:CONSENT_VERSION});
  return h.call({action:'answer',revision:first.revision,requestId:randomUUID(),hybrid:true,openingFlow:true,answer,...options});
}

test('member precision and keep-general flow survive retry without another analysis or score',async()=>{
  const h = fixture();
  const intro = await introduce(h, 'أحب الرسم، أبي شريكة طويلة وأصغر مني. ودي أقابلها في مكان عام.');
  assert.equal(intro.document.status,'review');
  assert.equal(intro.document.readiness.length,0);
  assert.equal(intro.document.proposals.length,0);
  for (const topic of ['interest','height','age','nextStep']) assert.ok(intro.document.statements.some(item => item.topic === topic));
  assert.equal(h.requests[0].response_format.json_schema.schema.properties.statements.type,'array');
  const choice = {action:'clarify',refineTopic:'height',refinement:{min:164,max:172},requestId:randomUUID(),revision:intro.revision};
  const saved = await h.call(choice);
  assert.equal(saved.document.turns.at(-1).question,prompts.height);
  const height = saved.document.profileConfirmed.find(p => p.fieldId === 'partnerCriteria.height');
  assert.deepEqual(height.values,['164','172']);
  assert.equal(height.mode,'prefer');
  assert.equal(height.evidence[0].quote,saved.document.turns.at(-1).answer);
  assert.deepEqual((await h.call(choice)).document.turns,saved.document.turns);
  const skipped = await h.call({...choice,requestId:randomUUID(),revision:saved.revision,refineTopic:'age',refinement:{approximate:true}});
  assert.equal(skipped.document.turns.at(-1).question,prompts.age);
  const restored = await h.call({action:'load'});
  assert.deepEqual(restored.document.profileConfirmed.map(p=>p.fieldId),['partnerCriteria.height']);
  assert.equal(restored.document.proposals.length,0);
  assert.equal(h.requests.length,1);
  await assert.rejects(h.call({...choice,revision:restored.revision,requestId:randomUUID()}),/راجع/);
});

test('model may ask one related optional question for two unresolved decisions, and uses context on its answer',async()=>{
  const phrase='توزيع المصاريف يهمني';
  const question='كيف تفضّل توزيع مصاريف البيت بينك وبين شريكك؟';
  const h=fixture(data=>data.transcript.length === 1 ? {question,questionTopic:'practical',replyEvidence:phrase,
    questionFields:['preference:financial_provision:self','preference:financial_provision:partner'],
    statements:[{topic:'other',subject:'self',quote:phrase,turnId:data.transcript[0].id,replacesQuote:null}]} : {});
  const intro = await introduce(h,phrase,{refinementsAvailable:true});
  assert.equal(intro.document.status,'review');
  assert.equal(intro.document.currentQuestion.text.split('\u2029').at(-1),question);
  const reply = await h.call({action:'answer',revision:intro.revision,requestId:randomUUID(),answer:'أتحمل الإيجار ونتفق سوا على الباقي.',hybrid:true,cardsAfterReply:true,openingFlow:false});
  assert.equal(reply.document.turns.length,2);
  assert.equal(reply.document.turns[1].question.split('\u2029').at(-1),question);
  assert.ok(JSON.parse(h.requests[1].messages[1].content).privateStatements.some(item => item.quote === phrase));
});

test('privacy applies again when consent changes and external references are rejected',()=>{
  const turn = {id:randomUUID(),topic:'intent',answer:'هوايتي السباحة. بشرتي حنطية.',question:'حدثني عن نفسك',skipped:false};
  const persisted = {subject:'self',topic:'skinTone',turnId:turn.id,quote:'بشرتي حنطية'};
  const request = interviewCompletionRequest({...initialInterviewDocument(true),turns:[turn],statements:[persisted]},false,false,null,{hybrid:true});
  const safe=JSON.parse(request.messages[1].content);
  assert.ok(!safe.privateStatements.some(p=>p.topic === 'skinTone'));
  assert.ok(!safe.transcript[0].answer.includes('حنطية'));
  assert.throws(()=>parseInterviewInput({action:'clarify',revision:1,requestId:randomUUID(),refineTopic:'height',refinement:{max:120,min:200}}));
  assert.throws(()=>parseInterviewInput({action:'clarify',revision:1,requestId:randomUUID(),refineTopic:'height',refinement:{min:200,surveyAnswers:{}}}));
});

test('a useful range question takes priority on capable clients while older clients retain their opening route',async()=>{
  const phrase = 'أفضل شريك طويل القامة.';
  const old = await introduce(fixture(),phrase);
  assert.equal(old.document.status,'active');
  const upgraded = await introduce(fixture(),phrase,{refinementsAvailable:true});
  assert.equal(upgraded.document.status,'review');
  assert.ok(upgraded.document.statements.some(s=>s.topic === 'height'));
  const known = await introduce(fixture(),phrase,{refinementsAvailable:true,profileContext:[{
    fieldId:'partnerCriteria.height',values:['170','185'],mode:'prefer',exclude:false,
  }]});
  assert.equal(known.document.status,'active');
});
