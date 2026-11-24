import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSearch,validatePlan,createLunaSearch,searchRequest} from '../api/_lib/luna-search.mjs';
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

test('Arabic nationality-only requests use the declared nationality and preserve active filters',async()=>{
  const calls=[];
  const search=createLunaSearch({env:{},clientFactory:()=>assert.fail('simple nationality needs no model'),
    fetcher:async(url,request)=>{calls.push([url,JSON.parse(request.body)]);return {ok:true,json:async()=>[]};}});
  for (const [query,kind] of [['بنت مو سعودية','exclude'],['أبي بنت غير سعودية','exclude'],['بنت مصرية','must']]) {
    const result=await search({query,filters:{eligibleOnly:true,city:'الرياض'}},{authorization:'Bearer test'});
    const options=calls.at(-1)[1].options;
    assert.match(calls.at(-2)[0],/reserve$/);
    assert.equal(options.eligibleOnly,true);
    assert.equal(options.city,'الرياض');
    assert.deepEqual(options.luna,[{kind,field:'nationality',terms:[kind==='exclude'?'سعودي':'مصري'],label:result.criteria[0].label}]);
  }
});
test('planner can combine nationality, a numeric range and a published mention',()=>{
  const schema=searchRequest('بنت مو سعودية وطولها بين ١٦٠ و١٧٠ وتذكر الفلك').response_format.json_schema.schema;
  const fields=schema.properties.criteria.items.properties.field.enum;
  for (const field of ['nationality','heightCm','profileText','weddingStyle']) assert.ok(fields.includes(field));
  const criterion=(field,terms)=>({field,terms,kind:'must',label:field});
  const result=validatePlan({...plan,criteria:[criterion('nationality',['مصرية']),criterion('heightCm',['160..170']),criterion('profileText',['الفلك'])]});
  assert.deepEqual(result.criteria[0].terms,['مصري']);
  for (const [field,terms] of [['nationality',['invented']],['heightCm',['190..150']],['privateMessages',['كلمة']]]) {
    assert.throws(()=>validatePlan({...plan,criteria:[criterion(field,terms)]}));
  }
});

test('planner uses published directory choices for sectors, degrees and selected interests',()=>{
  const guide=searchRequest('أبحث عن شخص يعمل في قطاع التقنية').messages[0].content;
  const fields=JSON.parse(guide.split('دليل الحقول: ')[1].split('\n')[0]);
  const criterion=(field,term)=>({field,kind:'must',terms:[term],label:term});
  for (const [field,term] of [['profession','التقنية والبرمجة'],['education','بكالوريوس'],['interest','التصوير']]) {
    assert.ok(fields[field].includes(term));
    const criteria=[criterion(field,term)];
    assert.deepEqual(validatePlan({...plan,criteria}).criteria,criteria);
  }
  for (const [field,term] of [['profession','جرّاح قلب'],['education','درجة جامعية'],['interest','photography']]) {
    assert.throws(()=>validatePlan({...plan,criteria:[criterion(field,term)]}));
  }
  const exactTitle=criterion('profileText','جرّاح قلب');
  assert.deepEqual(validatePlan({...plan,criteria:[exactTitle]}).criteria,[exactTitle]);
});

test('an unrecognized description never turns into an unrestricted directory listing',async()=>{
  const empty={summary:'',minAge:null,maxAge:null,city:null,smoking:null,maritalStatus:null,criteria:[]};
  const search=createLunaSearch({env:{OPENAI_API_KEY:'test'},
    clientFactory:()=>({chat:{completions:{create:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(empty)}}]})}}}),
    fetcher:async url=>{assert.match(url,/reserve$/);return {ok:true,json:async()=>({})};}});
  await assert.rejects(search({query:'طلب غير واضح'},{authorization:'Bearer test'}),/ما قدرت أحدد/);
});
