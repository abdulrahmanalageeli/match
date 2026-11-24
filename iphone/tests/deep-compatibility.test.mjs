import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeepAnalysisService,analysisRequest,privateReviewRequest,validatePrivateReview,validateReport,parseDeepInput,SECTIONS} from '../api/_lib/deep-compatibility.mjs';
import personalityCatalog from '../src/compatibility/personality-catalog.json' with {type:'json'};
import practicalCatalog from '../src/compatibility/catalog.json' with {type:'json'};
import legacyCatalog from '../src/compatibility/personality-catalog-v1.json' with {type:'json'};
const legacyKeys=legacyCatalog.map(item=>item.id);
import handler from '../api/deep-compatibility.mjs';
const actor='11111111-1111-4111-8111-111111111111',connectionId='22222222-2222-4222-8222-222222222222',lease='33333333-3333-4333-8333-333333333333';
const snapshot={a:{entries:[{key:'answer:closeness',question:'القرب',answer:'أحتاج مساحة'}]},b:{entries:[{key:'personality:reassurance',question:'الطمأنة',answer:'أقدّر التواصل'}]}};
const outlookText='فرصة بينكما: قد يسهل التطمين طلب مساحة.\n\nما قد يصعب: قد يُفهم الصمت على أنه ابتعاد.\n\nمن الآن: اختارا عبارة تحدد وقت العودة للحديث ثم اسألا إن كانت مطمئنة.';
const findings=()=>SECTIONS.map((section,i)=>({id:`f${i+1}`,section,kind:'manageable',title:`فكرة مستقلة ${i+1}`,text:section==='patterns'?'الطرف أ: قد يسهل بدء الحديث حين تهمك الفكرة.\n\nالطرف ب: قد يهمك وضوح النية في بداية التعارف.':section==='conclusion'?outlookText:`قراءة ${i+1}: قد يختلف فهمكما للقرب، ويستحق ترتيب أوقات التواصل نقاشًا بينكما.`,evidence:[{side:'a',key:'answer:closeness'},{side:'b',key:'personality:reassurance'}]}));
const completion=value=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]});
const response=()=>({headers:{},setHeader(key,value){this.headers[key]=value},status(value){this.code=value;return this},json(value){this.body=value;return this},end(){return this}});
test('native endpoint permits only narrow CORS preflight and disables caching',async()=>{
 for(const origin of ['capacitor://localhost','http://localhost','https://untrusted.example']){
  const res=response();await handler({method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'content-type,authorization'}},res);
  assert.equal(res.code,origin.startsWith('https:')?403:204);assert.equal(res.headers['Cache-Control'],'private, no-store');
 }
 const res=response();await handler({method:'OPTIONS',headers:{origin:'capacitor://localhost','access-control-request-method':'POST','access-control-request-headers':'x-test-session'}},res);assert.equal(res.code,403);
});
test('endpoint rejects oversized and unauthenticated requests before accessing data',async()=>{
 const oversized=response();await handler({method:'POST',headers:{'content-length':'9999'},body:{connectionId}},oversized);assert.equal(oversized.code,413);
 const signedOut=response();await handler({method:'POST',headers:{},body:{connectionId}},signedOut);assert.equal(signedOut.code,401);
 const get=response();await handler({method:'GET',headers:{}},get);assert.equal(get.code,405);
});
function setup({deny=false,busy=false,invalid=false,publishDenied=false,evidence=snapshot,joint=()=>findings()}={}){
 const calls=[];let modelCalls=0;
 const service=createDeepAnalysisService({env:{OPENAI_API_KEY:'test',SUPABASE_SERVICE_ROLE_KEY:'test'},fetcher:async(url,options)=>{
  const body=JSON.parse(options.body);calls.push({url,body,authorization:options.headers.Authorization});
  if(url.endsWith('/marriage_state'))return {ok:!deny,status:deny?403:200,json:async()=>deny?{code:'42501'}:{user:{id:actor}}};
  if(url.endsWith('/marriage_deep_analysis'))return {ok:true,json:async()=>({status:'queued'})};
  if(body.action==='claim')return {ok:true,json:async()=>busy?{status:'busy'}:{status:'claimed',id:connectionId,lease,snapshot:evidence}};
  if(body.action==='publish'&&publishDenied)return {ok:false,status:403,json:async()=>({code:'42501'})};
  return {ok:true,json:async()=>({status:'review'})};
 },clientFactory:()=>({chat:{completions:{create:async request=>{
  modelCalls++;assert.equal(request.store,false);assert.equal(request.messages.length,2);
  if(request.response_format.json_schema.name==='wudayn_private_disclosures'){
   const items=JSON.parse(request.messages[1].content);
   const answers=new Set(items.flatMap(item=>item.evidence.map(e=>e.answer)));
   assert.equal(answers.size,1,'each preview context contains one person only');
   assert.equal(request.messages[1].content.includes(findings()[0].text),false,'no joint finding text in private preview');
   return completion({items:items.map(item=>({id:item.id,text:'إجاباتك تشير إلى تفضيل يستحق توضيحه عند الحديث عن القرب والتواصل.'}))});
  }
  return completion({findings:invalid?[]:joint(request)});
 }}}})});
 return {service,calls,get modelCalls(){return modelCalls}};
}
test('only connection ID accepted; client profiles, instructions and tester identity rejected',async()=>{
 assert.throws(()=>parseDeepInput({connectionId,answers:snapshot}));
 assert.throws(()=>parseDeepInput({connectionId:'bad'}));
 const s=setup();await assert.rejects(s.service({connectionId},{authorization:'Bearer abc','x-test-session':'test'}));assert.equal(s.calls.length,0);
});
test('live authorization precedes privileged snapshot access and failure makes no model call',async()=>{
 const s=setup({deny:true});await assert.rejects(s.service({connectionId},{authorization:'Bearer abc'}));assert.equal(s.calls.length,1);assert.equal(s.modelCalls,0);
});
test('claimed generation uses server evidence, persists privately, returns no report or snapshot',async()=>{
 const s=setup();assert.deepEqual(await s.service({connectionId},{authorization:'Bearer abc'}),{status:'review'});
 assert.equal(s.calls[2].body.actor,actor);assert.equal(s.calls[2].body.action,'claim');assert.equal(s.calls[3].body.lease,lease);assert.equal(s.calls[3].body.report.findings.length,8);
 assert.equal(s.modelCalls,3);assert.equal(typeof s.calls[3].body.report.findings[0].reviewText.a,'string');
});
test('private previews receive only cited own evidence and reject missing or duplicate interpretations',()=>{
 const report={findings:findings()};
 const request=privateReviewRequest(snapshot,report,'a');assert.equal(request.model,'gpt-6.2-sol');assert.equal(request.reasoning_effort,'low');
 const items=JSON.parse(request.messages[1].content);
 assert(items.every(item=>item.evidence.every(e=>e.key==='answer:closeness')));
 assert.equal(request.messages[1].content.includes('أقدّر التواصل'),false);
 const values=items.map(item=>({id:item.id,text:'إجاباتك تشير إلى تفضيل المساحة في بعض أوقات التواصل.'}));
 assert.equal(validatePrivateReview(completion({items:values}),report).size,8);
 assert.throws(()=>validatePrivateReview(completion({items:values.slice(1)}),report));
 assert.throws(()=>validatePrivateReview(completion({items:[values[0],...values.slice(0,-1)]}),report));
});
test('durable busy claim prevents repeat model call',async()=>{
 const s=setup({busy:true});assert.deepEqual(await s.service({connectionId},{authorization:'Bearer abc'}),{status:'generating'});assert.equal(s.modelCalls,0);
});

function coveredFindings(input) {
 const rows=findings().map(row=>({...row,evidence:[]}));
 for(const side of ['a','b']){
  const entries=input[side].entries;
  const anchor=entries.find(item=>item.key.startsWith('personality:'))??entries[0];
  for(const row of rows)row.evidence.push({side,key:anchor.key});
  entries.filter(item=>item!==anchor).forEach(({key},index)=>rows[index%rows.length].evidence.push({side,key}));
 }
 return rows;
}

test('joint generation requires both sides’ current questionnaire coverage before disclosure review',async()=>{
 const entries=answer=>[
  ...practicalCatalog.dimensions.flatMap(d=>[
   {key:'answer:'+d.id,question:d.selfPrompt,answer},
   {key:'answer:'+d.partnerId,question:d.partnerPrompt,answer},
  ]),
  ...personalityCatalog.map(({id,prompt})=>({key:'personality:'+id,question:prompt,answer})),
 ];
 const evidence={
  a:{assessmentVersion:'marriage-v4',entries:entries('يشبهني')},
  b:{assessmentVersion:'marriage-v4',entries:entries('لا يشبهني كثيرًا')},
 };
 const latest=['money_management','conflict_response','social_boundaries'];
 const missingKey='answer:money_management';
 for(const repair of [true,false]){
  let attempts=0;
  const s=setup({evidence,joint(request){
   const input=JSON.parse(request.messages[1].content);
   for(const side of ['a','b']){
    const keys=input[side].entries.map(item=>item.key);
    assert.equal(keys.length,46);
    assert(!keys.includes('answer:partner_residence_plan'));
    for(const key of latest) assert(keys.includes('answer:'+key));
   }
   const rows=coveredFindings(input);
   if(++attempts===2){
    assert.match(request.messages[0].content,/a:answer:money_management/);
    if(repair)return rows;
   }
   for(const row of rows)row.evidence=row.evidence.filter(ref=>ref.side!=='a'||ref.key!==missingKey);
   return rows;
  }});
  if(repair){
   assert.deepEqual(await s.service({connectionId},{authorization:'Bearer abc'}),{status:'review'});
   assert.equal(s.calls.at(-1).body.action,'publish');
   assert.equal(s.modelCalls,4);
  } else {
   await assert.rejects(s.service({connectionId},{authorization:'Bearer abc'}),error=>error.code==='unavailable');
   assert.equal(s.calls.at(-1).body.action,'fail');
   assert.equal(s.modelCalls,2);
  }
  assert.equal(attempts,2);
 }
});
test('an outlook without a practical step is repaired before sharing',async()=>{
 let attempts=0;
 const s=setup({joint:()=>{
  const rows=findings();
  if(++attempts===1) rows.find(f=>f.section==='conclusion').text=outlookText.split('\n\n').slice(0,2).join('\n\n');
  return rows;
 }});
 await s.service({connectionId},{authorization:'Bearer abc'});
 assert.equal(attempts,2);
 assert.equal(s.calls.at(-1).body.action,'publish');
});
test('malformed model report and revoked publish do not release private text',async()=>{
 for(const options of [{invalid:true},{publishDenied:true}]){const s=setup(options);await assert.rejects(s.service({connectionId},{authorization:'Bearer abc'}));assert.equal(s.calls.at(-1).body.action,'fail')}
});
test('report evidence is bilateral, real, complete and conservative about incompatibility',()=>{
 assert.equal(validateReport(completion({findings:findings()}),snapshot).findings.length,8);
 for(const change of [f=>f.evidence.pop(),f=>f.evidence[0].key='made-up',f=>f.kind='incompatibility',f=>f.text='نسبة النجاح ٩٩٪',f=>f.section='made-up',f=>f.id='f0',f=>f.id='f00']){
  const rows=findings();change(rows[0]);assert.throws(()=>validateReport(completion({findings:rows}),snapshot));
 }
 const req=analysisRequest(snapshot);assert.equal(req.store,false);assert.equal(req.model,'gpt-6.2-sol');assert.equal(req.reasoning_effort,'medium');assert.equal(JSON.parse(req.messages[1].content).a.entries[0].key,'answer:closeness');
});

test('current and mixed reports use each member’s own instrument and enforce bilateral evidence',()=>{
 for(const pair of [[personalityCatalog,personalityCatalog],[legacyCatalog,personalityCatalog],[personalityCatalog,legacyCatalog]]) {
  const full={};
  for(const [index,side] of ['a','b'].entries()){
   const catalog=pair[index];
   full[side]={assessmentVersion:catalog===personalityCatalog?'marriage-v4':'marriage-v3',entries:catalog.map(item=>({key:'personality:'+item.id,question:item.prompt,answer:'يشبهني'}))};
   if(catalog===personalityCatalog)full[side].personalityVersion='personality-v2';
  }
  const req=analysisRequest(full), system=req.messages[0].content;
  assert.deepEqual(JSON.parse(req.messages[1].content),full);
  for(const item of personalityCatalog.filter(item=>item.reverse))assert.ok(system.includes(item.id));
  assert.equal(system.includes('أجاب الطرفان عن نسختين مختلفتين'),pair[0]!==pair[1]);
  assert.equal(system.includes('النسخة التاريخية'),pair.includes(legacyCatalog));
  assert.match(system,/لا تفترضي علاقة أو تاريخًا مشتركًا/);
  assert.match(system,/أول قراءة patterns صورة شخصية لكل طرف/);
  assert.match(system,/لا تحوّلي الشخصية إلى نسبة توافق أو ترتيب/);
  const refs=['a','b'].map(side=>({side,key:full[side].entries[0].key}));
  const rows=findings().map(row=>({...row,evidence:refs}));
  const patterns=rows.find(row=>row.section==='patterns');
  assert.throws(()=>validateReport(completion({findings:rows}),full));
  patterns.evidence=[...refs,{side:'a',key:full.a.entries[1].key}];
  assert.equal(validateReport(completion({findings:rows}),full).findings.length,8);
  if(pair[0]!==pair[1]){
   patterns.evidence[2].key=full.b.entries[1].key;
   assert.throws(()=>validateReport(completion({findings:rows}),full));
  }
 }
 const unknown={...snapshot,a:{...snapshot.a,personalityVersion:'unknown'}};
 assert.throws(()=>analysisRequest(unknown));
});

test('joint and private prompts distinguish confirmed, suggested and unverified partner preferences',()=>{
 const full=structuredClone(snapshot);
 const key='answer:partner_residence_plan';
 full.a.entries.push({key,question:'مدينة الشريك',answer:'السكن في مدينتي',provenance:'inferred'});
 const rows=findings().map(row=>({...row,evidence:[{side:'a',key},...row.evidence]}));
 for(const request of [analysisRequest(full),privateReviewRequest(full,{findings:rows},'a')]){
  const system=request.messages[0].content, data=JSON.parse(request.messages[1].content);
  const source=Array.isArray(data)?data[0].evidence:data.a.entries;
  assert.equal(source.find(entry=>entry.key===key).provenance,'inferred');
  for(const marker of ['confirmed','inferred','unverified','غياب المصدر'])assert.ok(system.includes(marker));
 }
 const other=privateReviewRequest(full,{findings:rows},'b');
 assert.ok(!other.messages[1].content.includes(key));
});

test('complete personalities require real cross-trait evidence without forcing filler for every trait',()=>{
 const complete={};
 for(const side of ['a','b'])complete[side]={entries:legacyKeys.map(key=>({key:`personality:${key}`,question:key,answer:'يشبهني أحيانًا'}))};
 const rows=SECTIONS.filter(section=>section!=='patterns').map((section,i)=>({id:`f${i+1}`,section,kind:'manageable',title:`فكرة مستقلة ${i+1}`,text:`قراءة مستقلة ${i+1}: إشارات محدودة تستحق توضيحًا بالحوار.`,evidence:[{side:'a',key:'personality:closeness'},{side:'b',key:'personality:reassurance'}]}));
 for(let i=0;i<4;i++)rows.push({id:`f${i+8}`,section:'patterns',kind:'manageable',title:`معنى مختلف ${i+1}`,text:`نمط مستقل ${i+1}: تفاعل عدة إشارات، مع بديل يحتاج إلى تحقق.`,evidence:legacyKeys.slice(i*3,i*3+3).flatMap(key=>['a','b'].map(side=>({side,key:`personality:${key}`})))});
 assert.equal(validateReport(completion({findings:rows}),complete).findings.length,11);
 // Literal profile summaries cannot pass by citing the same two questions repeatedly.
 const shallow=structuredClone(rows);for(const row of shallow)row.evidence=rows[0].evidence;
 assert.throws(()=>validateReport(completion({findings:shallow}),complete));
 const missing=structuredClone(rows);missing.at(-1).evidence=missing.at(-1).evidence.filter(e=>e.side!=='b'||e.key!=='personality:quiet_comfort');
 assert.equal(validateReport(completion({findings:missing}),complete).findings.length,11);
 const fewer=rows.filter(row=>row.id!=='f11');assert.equal(validateReport(completion({findings:fewer}),complete).findings.length,10);
 const repeated=structuredClone(rows);repeated[1].text=repeated[0].text;assert.throws(()=>validateReport(completion({findings:repeated}),complete));
 const duplicateEvidence=structuredClone(rows);duplicateEvidence[0].evidence.push(duplicateEvidence[0].evidence[0]);assert.throws(()=>validateReport(completion({findings:duplicateEvidence}),complete));
});

test('member demos reserve against authenticated membership before Sol and return no raw evidence',async()=>{
 assert.throws(()=>parseDeepInput({demoPersonaId:'unknown'}));
 assert.throws(()=>parseDeepInput({demoPersonaId:'p01',answers:{}}));
 assert.throws(()=>parseDeepInput({demoPersonaId:'p01',consentVersion:'obsolete'}));
 for(const allowed of [false,true]){
  const calls=[];let invocations=0;
  const service=createDeepAnalysisService({env:{OPENAI_API_KEY:'test'},fetcher:async(url,options)=>{
   calls.push(url);assert.equal(options.headers.Authorization,'Bearer demo');
   assert.deepEqual(JSON.parse(options.body),allowed?{consent_version:'deep-assessment-v2'}:{});
   return {ok:allowed,status:allowed?200:403,json:async()=>allowed?snapshot.a:{code:'42501'}};
  },clientFactory:()=>({chat:{completions:{create:async req=>{
   invocations++;assert.equal(req.model,'gpt-6.2-sol');
   const input=JSON.parse(req.messages[1].content);
   assert.equal(input.b.entries.length,44);
   assert.equal(input.b.personalityVersion,'personality-v1');assert.match(req.messages[0].content,/ملف خيالي/);
   return completion({findings:coveredFindings(input)});
  }}}})});
  const request=service(allowed?{demoPersonaId:'p01',consentVersion:'deep-assessment-v2'}:{demoPersonaId:'p01'},{authorization:'Bearer demo'});
  if(allowed){const result=await request;assert.equal(result.findings.length,8);assert.equal('evidence' in result.findings[0],false);
   assert.equal(result.review.length,8);
   for(const item of result.review) {
    assert(item.ownEvidence.length);
    assert(item.ownEvidence.every(entry=>snapshot.a.entries.some(own=>own.key===entry.key) && entry.value===''));
   }assert.match(result.findings[0].text,/\n\n/);}
  else await assert.rejects(request,error=>error.status===403);
  assert.equal(invocations,allowed?1:0);assert.equal(calls.length,1);assert(calls[0].endsWith('/marriage_demo_deep_reserve'));
 }
});
