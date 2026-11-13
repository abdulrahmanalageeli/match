import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createInterviewService,initialInterviewDocument,parseInterviewInput} from '../api/_lib/interview.mjs';
const reham='b3019f65-9462-4e12-9614-1127e8712a04',ordinary='11111111-1111-4111-8111-111111111111';
const headers=id=>({authorization:'Bearer a.'+Buffer.from(JSON.stringify({sub:id})).toString('base64url')+'.b'});
function harness(id,turns=48,forged={}){
 let state={document:{...initialInterviewDocument(true),status:'review',currentQuestion:null,pendingAnalysis:true,turns:Array.from({length:turns},()=>({id:randomUUID(),topic:'intent',question:'ما الذي تبحث عنه؟',answer:'زواج جاد',skipped:false})),...forged},revision:10};
 let providerCalls=0;const saved=[];
 const service=createInterviewService({env:{OPENAI_API_KEY:'synthetic',SUPABASE_SERVICE_ROLE_KEY:'synthetic'},fetcher:async(url,init)=>{const input=JSON.parse(init.body);if(url.endsWith('marriage_interview_attest'))return Response.json({ok:true});if(input.command==='reserve')return Response.json({status:'allowed'});if(input.command==='save'){saved.push(input.payload.document);state={document:input.payload.document,revision:state.revision+1};}return Response.json(state);},clientFactory:()=>({chat:{completions:{create:async()=>{providerCalls++;return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'',answerDisposition:'answered',followUp:false,questionTopic:'',question:'',proposals:[],readiness:[],clarifications:[]})}}]};}}}})});
 return {call:input=>service(input,headers(id)),get state(){return state;},get providerCalls(){return providerCalls;},saved};
}
test('Reham retries the saved 48th reply and resumes without losing answers',async()=>{
 const h=harness(reham);const out=await h.call({action:'retry',revision:10});
 assert.equal(out.document.status,'active');assert.equal(out.document.pendingAnalysis,false);assert.ok(out.document.currentQuestion);assert.equal(out.document.turns.length,48);assert.equal(h.providerCalls,1);
 assert.equal(JSON.stringify(out).includes('interviewTurnLimit'),false);
 const sent=await h.call({action:'answer',revision:out.revision,requestId:randomUUID(),answer:'أفضل أن نفهم بعضنا بهدوء'});
 assert.equal(sent.document.turns.length,49);
});
test('ordinary accounts retain the 48-turn limit despite forged document fields',async()=>{
 const h=harness(ordinary,48,{maxTurns:80,turnLimit:80,accountTurnLimit:80});
 const resumed=await h.call({action:'resume',revision:10});assert.equal(resumed.document.status,'review');assert.equal(h.saved.length,0);
 const retried=await h.call({action:'retry',revision:10});assert.equal(retried.document.status,'review');assert.equal(retried.document.turns.length,48);
 await assert.rejects(h.call({action:'answer',revision:retried.revision,requestId:randomUUID(),answer:'جواب'}),e=>e.code==='invalid_request');
 assert.throws(()=>parseInterviewInput({action:'retry',revision:10,turnLimit:80}));
});
test('the approved account allowance is bounded at 80 turns',async()=>{
 const h=harness(reham,80);const out=await h.call({action:'resume',revision:10});assert.equal(out.document.status,'review');assert.equal(h.saved.length,0);
});
