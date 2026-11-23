import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createInterviewService, CONSENT_VERSION, interviewCompletionRequest, initialInterviewDocument, parseInterviewInput } from '../api/_lib/interview.mjs';
import prompts from '../src/interview/refinement-prompts.json' with {type:'json'};

function fixture(interpret, verify) {
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
      const output = request.response_format.json_schema.name === 'wudayn_check_choices'
        ? {answers:verify?.(data) ?? []}
        : {reply:'',answerDisposition:'answered',followUp:false,questionTopic:'',question:'',
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

test('answering one optional question fills both supported cards and preserves an unrelated checked answer; skipping it keeps only the original',async()=>{
  const housing = 'أبي بيت مستقل عن الأهل';
  const money = 'المصاريف تهمني';
  const self = 'أنا أفضل نتقاسم المصاريف بالنصف';
  const partner = 'وأفضّل شريكة تختار نتقاسمها بالنصف';
  const definition = [
    ['preference:housing_arrangement:self', 'A', housing],
    ['preference:financial_provision:self', 'B', self],
    ['preference:financial_provision:partner', 'B', partner],
  ];
  function proposals(turns) {
    const first = turns.length === 1;
    return definition.filter((_,i)=>first ? i === 0 : i !== 0).map(([id,code,quote])=>{
      const [,fieldId,side] = id.split(':');
      return {kind:'preference',fieldId,side,values:[code],summary:quote,evidence:[{turnId:turns.at(-1).id,quote}],needsClarification:false};
    });
  }
  const make = () => fixture(({transcript}) => ({proposals:proposals(transcript), ...(transcript.length === 1 ? {
    question:'كيف تفضّل تقسمون المصاريف ووش الرأي اللي تفضله في شريكك؟',questionTopic:'practical',
    questionFields:definition.slice(1).map(([id])=>id),replyEvidence:money,
  } : {})}),({fields,turns}) => {
    if (turns.length > 1) assert.ok(!fields.some(f=>f.id === definition[0][0]), 'proven independent choices should not need another check');
    return fields.map(({id})=>{const [,code,quote]=definition.find(row=>row[0] === id);
      return {id,code,quote,turnId:turns.find(turn=>turn.answer.includes(quote)).id};});
  });
  const introText = housing + '، ' + money;
  const h = make();
  const intro = await introduce(h,introText,{refinementsAvailable:true});
  assert.deepEqual(intro.carryForwardIds,[definition[0][0]]);
  const reply = await h.call({action:'answer',revision:intro.revision,requestId:randomUUID(),answer:self+' '+partner,hybrid:true,cardsAfterReply:true,openingFlow:false});
  assert.deepEqual(new Set(reply.carryForwardIds),new Set(definition.map(([id])=>id)));
  assert.deepEqual((await h.call({action:'load'})).carryForwardIds,reply.carryForwardIds);

  const skipped = make();
  const first = await introduce(skipped,introText,{refinementsAvailable:true});
  const requests = skipped.requests.length;
  await skipped.call({action:'answer',revision:first.revision,requestId:randomUUID(),answer:'',skip:true,hybrid:true,cardsAfterReply:true});
  const loaded = await skipped.call({action:'load'});
  assert.equal(loaded.document.currentQuestion,null);
  assert.deepEqual(loaded.document.turns,first.document.turns);
  assert.deepEqual(loaded.carryForwardIds,[definition[0][0]]);
  assert.equal(skipped.requests.length,requests);
});

test('an explicit withdrawal clears the old numerical refinement even if analysis omits invalidation and later repeats the old range',async()=>{
  const h=fixture(({transcript})=>{
    const prior=transcript.find(turn=>turn.question === prompts.height);
    return prior ? {profileProposals:[{fieldId:'partnerCriteria.height',mode:'prefer',values:['158','170'],exclude:false,
      evidence:[{turnId:prior.id,quote:prior.answer}],needsClarification:false,summary:prior.answer}]} : {};
  });
  const first=await introduce(h,'أفضّل شريكة قصيرة. ودي أقابلها قبل الزواج.');
  const saved=await h.call({action:'clarify',revision:first.revision,requestId:randomUUID(),refineTopic:'height',refinement:{min:158,max:170}});
  assert.ok(saved.document.profileConfirmed.length);
  const changed=await h.call({action:'clarify',revision:saved.revision,requestId:randomUUID(),answer:'الطول ما يهمني',verifyChoices:true});
  const latest=await h.call({action:'clarify',revision:changed.revision,requestId:randomUUID(),answer:'هوايتي الرسم',verifyChoices:true});
  for (const session of [changed,latest,await h.call({action:'load'})]) {
    assert.equal(session.document.profileProposals.filter(p=>p.fieldId==='partnerCriteria.height').length,0);
    assert.equal(session.document.profileConfirmed.filter(p=>p.fieldId==='partnerCriteria.height').length,0);
    assert.ok(session.document.statements.some(s=>s.quote==='الطول ما يهمني'));
  }
});

test('a replacement range with newer evidence requires a new explicit confirmation even without an invalidated array',async()=>{
  const replacement='أفضّل طول الشريك من ١٧٥ إلى ١٨٠ سم';
  const h=fixture(({transcript}) => transcript.at(-1).answer === replacement ? {profileProposals:[{
    fieldId:'partnerCriteria.height',mode:'prefer',exclude:false,values:['175','180'],summary:replacement,needsClarification:false,
    evidence:[{turnId:transcript.at(-1).id,quote:replacement}],
  }]} : {});
  const first=await introduce(h,'أفضّل شريكة طويلة. ودي أقابلها قبل الزواج.');
  const saved=await h.call({action:'clarify',revision:first.revision,requestId:randomUUID(),refineTopic:'height',refinement:{min:165,max:170}});
  const changed=await h.call({action:'clarify',revision:saved.revision,requestId:randomUUID(),answer:replacement,verifyChoices:true});
  assert.equal(changed.document.profileConfirmed.length,0);
  assert.deepEqual(changed.document.profileProposals[0].values,['175','180']);
});

test('previously answered draft IDs suppress optional questions without supplying or recording choices',async()=>{
  const field='preference:financial_provision:self';
  const phrase='موضوع المصاريف يهمني';
  const h=fixture(()=>({question:'كيف تتصور المصاريف ووش اللي تفضله في شريكك؟',questionTopic:'practical',replyEvidence:phrase,
    questionFields:[field,'preference:financial_provision:partner']}));
  const intro=await introduce(h,phrase,{refinementsAvailable:true,answeredFieldIds:[field]});
  assert.ok(!intro.document.currentQuestion?.text.includes('كيف تتصور المصاريف'));
  assert.deepEqual(intro.carryForwardIds,[]);
  assert.deepEqual(intro.document.assessmentContext,[]);
  assert.ok(!Object.hasOwn(intro.document,'answeredFieldIds'));
  assert.deepEqual(JSON.parse(h.requests[0].messages[1].content).answeredFieldIds,[field]);
  assert.equal(h.requests.length,1);
  for (const bad of [{answeredFieldIds:[field]}, {refinementsAvailable:true,answeredFieldIds:[field,field]},
    {refinementsAvailable:true,answeredFieldIds:['profile:partnerCriteria.skinTone']}]) {
    assert.throws(()=>parseInterviewInput({action:'answer',revision:1,requestId:randomUUID(),answer:phrase,hybrid:true,...bad}));
  }
});

test('height becomes a requirement only when the member explicitly selects it',async()=>{
  const h=fixture();
  const intro=await introduce(h,'أبي شريكة طويلة. ودي أقابلها قبل الزواج.');
  const selected=await h.call({action:'clarify',revision:intro.revision,requestId:randomUUID(),refineTopic:'height',refinement:{min:169,mode:'require'}});
  assert.deepEqual(selected.document.profileConfirmed[0].values,['169','']);
  assert.equal(selected.document.profileConfirmed[0].mode,'require');
  assert.ok(selected.document.turns.at(-1).answer.startsWith('أشترط أن يكون طول الشريك'));
  assert.equal(selected.document.profileConfirmed[0].evidence[0].quote,selected.document.turns.at(-1).answer);
  assert.equal(h.requests.length,1);
  for (const [refineTopic,refinement] of [['age',{min:20,mode:'require'}],['timeline',{value:'when_ready',mode:'prefer'}],
    ['height',{mode:'require'}],['height',{min:165,mode:'hard'}],['height',{approximate:true,mode:'require'}]]) {
    assert.throws(()=>parseInterviewInput({action:'clarify',revision:1,requestId:randomUUID(),refineTopic,refinement}));
  }
});

test('one-sided age edits respect the other saved endpoint; a member can revise both without losing their interview',async()=>{
  for (const [bad,side,good] of [[{max:24},'الأدنى',{min:20,max:24}],[{min:33},'الأعلى',{min:33,max:35}]]) {
    const h=fixture();
    const first=await introduce(h,'أبي شريكة أصغر مني. ودي أقابلها قبل الزواج.',{
      profileContext:[['preferredMinAge','26'],['preferredMaxAge','30']].map(([fieldId,value])=>({fieldId,values:[value],mode:null,exclude:false})),
    });
    const call=refinement=>h.call({action:'clarify',revision:first.revision,requestId:randomUUID(),refineTopic:'age',refinement});
    await assert.rejects(call(bad),error=>error.code === 'age_range_conflict' && error.message.includes(side));
    const unchanged=await h.call({action:'load'});
    assert.equal(unchanged.revision,first.revision);
    assert.deepEqual(unchanged.document.turns,first.document.turns);
    const fixed=await call(good);
    assert.deepEqual(fixed.document.profileConfirmed.map(p=>[p.fieldId,p.values[0]]),
      [['preferredMinAge',String(good.min)],['preferredMaxAge',String(good.max)]]);
    assert.equal(h.requests.length,1);
  }
});
