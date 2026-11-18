import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSearch,validatePlan,createLunaSearch} from '../api/_lib/luna-search.mjs';
const plan={summary:'الرياض',minAge:25,maxAge:35,city:'الرياض',smoking:'never',maritalStatus:null,criteria:[{kind:'prefer',label:'القراءة',terms:['قراءة','reading']}]};
test('input and generated filters are bounded',()=>{
 assert.equal(parseSearch({query:'  أحب القراءة  '}),'أحب القراءة');
 assert.throws(()=>parseSearch({query:'x'.repeat(601)}));
 assert.throws(()=>parseSearch({query:'بحث',memberId:'spoof'}));
 assert.throws(()=>validatePlan({...plan,minAge:12}));
 assert.throws(()=>validatePlan({...plan,criteria:[{kind:'sql',terms:['drop']}] }));
});
test('entitlement checked before provider; search uses generated filters and user token',async()=>{
 let providerCalls=0;const calls=[];
 const serve=createLunaSearch({env:{OPENAI_API_KEY:'test'},clientFactory:()=>({chat:{completions:{create:async()=>{providerCalls++;return {choices:[{finish_reason:'stop',message:{content:JSON.stringify(plan)}}]};}}}}),fetcher:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>url.endsWith('reserve')?{reserved:true}:[]};}});
 const result=await serve({query:'شخص يحب القراءة',filters:{mode:'recommended',city:'جدة',excludeSmoking:['yes'],minFit:70}},{authorization:'Bearer test'});
 assert.equal(providerCalls,1);assert.equal(result.summary,'الرياض');assert.ok(calls[0].url.endsWith('reserve'));
 const options=JSON.parse(calls[1].options.body).options;
 assert.equal(options.lunaFields.smoking,'never');assert.equal(options.lunaFields.city,'الرياض');
 assert.equal(options.city,'جدة');assert.equal(options.mode,'recommended');assert.deepEqual(options.excludeSmoking,['yes']);assert.equal(options.minFit,70);
 assert.throws(()=>parseSearch({query:'بحث',filters:{luna:[]}}));assert.throws(()=>parseSearch({query:'بحث',filters:{minAge:12}}));assert.equal(calls[1].options.headers.Authorization,'Bearer test');
 const denied=createLunaSearch({env:{OPENAI_API_KEY:'test'},fetcher:async()=>({ok:false,status:403,json:async()=>({code:'42501'})}),clientFactory:()=>{throw Error('must not reach provider');}});
 await assert.rejects(denied({query:'ابحث لي'},{authorization:'Bearer test'}),/وسام/);
});
