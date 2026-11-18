import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeepAnalysisService,analysisRequest,privateReviewRequest,validatePrivateReview,validateReport,parseDeepInput,SECTIONS,PERSONALITY_KEYS} from '../api/_lib/deep-compatibility.mjs';
import personalityCatalog from '../src/compatibility/personality-catalog.json' with {type:'json'};
import handler from '../api/deep-compatibility.mjs';
const actor='11111111-1111-4111-8111-111111111111',connectionId='22222222-2222-4222-8222-222222222222',lease='33333333-3333-4333-8333-333333333333';
const snapshot={a:{entries:[{key:'answer:closeness',question:'القرب',answer:'أحتاج مساحة'}]},b:{entries:[{key:'personality:reassurance',question:'الطمأنة',answer:'أقدّر التواصل'}]}};
const findings=()=>SECTIONS.map((section,i)=>({id:`f${i+1}`,section,kind:'manageable',title:`فكرة مستقلة ${i+1}`,text:`قراءة ${i+1}: قد يختلف فهمكما للقرب، ويستحق ترتيب أوقات التواصل نقاشًا بينكما.`,evidence:[{side:'a',key:'answer:closeness'},{side:'b',key:'personality:reassurance'}]}));
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
function setup({deny=false,busy=false,invalid=false,publishDenied=false}={}){
 const calls=[];let modelCalls=0;
 const service=createDeepAnalysisService({env:{OPENAI_API_KEY:'test',SUPABASE_SERVICE_ROLE_KEY:'test'},fetcher:async(url,options)=>{
  const body=JSON.parse(options.body);calls.push({url,body,authorization:options.headers.Authorization});
  if(url.endsWith('/marriage_state'))return {ok:!deny,status:deny?403:200,json:async()=>deny?{code:'42501'}:{user:{id:actor}}};
  if(url.endsWith('/marriage_deep_analysis'))return {ok:true,json:async()=>({status:'queued'})};
  if(body.action==='claim')return {ok:true,json:async()=>busy?{status:'busy'}:{status:'claimed',id:connectionId,lease,snapshot}};
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
  return completion({findings:invalid?[]:findings()});
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

test('personality coverage keys match the actual questionnaire',()=>{
 assert.deepEqual([...PERSONALITY_KEYS].sort(),personalityCatalog.map(item=>item.id).sort());
});

test('complete personalities require real cross-trait evidence without forcing filler for every trait',()=>{
 const complete={};
 for(const side of ['a','b'])complete[side]={entries:PERSONALITY_KEYS.map(key=>({key:`personality:${key}`,question:key,answer:'يشبهني أحيانًا'}))};
 const rows=SECTIONS.filter(section=>section!=='patterns').map((section,i)=>({id:`f${i+1}`,section,kind:'manageable',title:`فكرة مستقلة ${i+1}`,text:`قراءة مستقلة ${i+1}: إشارات محدودة تستحق توضيحًا بالحوار.`,evidence:[{side:'a',key:'personality:closeness'},{side:'b',key:'personality:reassurance'}]}));
 for(let i=0;i<4;i++)rows.push({id:`f${i+8}`,section:'patterns',kind:'manageable',title:`معنى مختلف ${i+1}`,text:`نمط مستقل ${i+1}: تفاعل عدة إشارات، مع بديل يحتاج إلى تحقق.`,evidence:PERSONALITY_KEYS.slice(i*3,i*3+3).flatMap(key=>['a','b'].map(side=>({side,key:`personality:${key}`})))});
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
 for(const allowed of [false,true]){
  const calls=[];let invocations=0;
  const service=createDeepAnalysisService({env:{OPENAI_API_KEY:'test'},fetcher:async(url,options)=>{
   calls.push(url);assert.equal(options.headers.Authorization,'Bearer demo');
   return {ok:allowed,status:allowed?200:403,json:async()=>allowed?snapshot.a:{code:'42501'}};
  },clientFactory:()=>({chat:{completions:{create:async req=>{
   invocations++;assert.equal(req.model,'gpt-6.2-sol');
   const input=JSON.parse(req.messages[1].content);
   assert.equal(input.b.entries.length,13);
   return completion({findings:findings()});
  }}}})});
  const request=service({demoPersonaId:'p01'},{authorization:'Bearer demo'});
  if(allowed){const result=await request;assert.equal(result.findings.length,8);assert.equal('evidence' in result.findings[0],false);assert.match(result.findings[0].text,/\n\n/);}
  else await assert.rejects(request,error=>error.status===403);
  assert.equal(invocations,allowed?1:0);assert.equal(calls.length,1);assert(calls[0].endsWith('/marriage_demo_deep_reserve'));
 }
});
