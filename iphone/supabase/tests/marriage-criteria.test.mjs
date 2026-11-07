import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';

let source=await readFile(new URL('../../src/compatibility/model.ts',import.meta.url),'utf8');
for(const name of ['catalog.json','personality-catalog.json'])source=source.replace(JSON.stringify('./'+name),JSON.stringify(new URL('../../src/compatibility/'+name,import.meta.url).href));
const {assessmentVersion,dimensions,describeFit,comparePreferences}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const personalityQuestions=JSON.parse(await readFile(new URL('../../src/compatibility/personality-catalog.json',import.meta.url),'utf8'));
const answers=()=>Object.fromEntries(dimensions.flatMap(d=>[[d.id,d.options[0].code],[d.partnerId,d.options[0].code]]));
const personality=(code='C')=>Object.fromEntries(personalityQuestions.map(q=>[q.id,code]));
const basics={heightCm:178,weightKg:78,tribalBackground:'tribal',tribeName:'عائلة تجريبية',nationality:'سعودي',maritalStatus:'never_married',childrenCount:0,smoking:'never'};
function setup(db){
 const rpc=async(expression,args=[])=>(await db.query('select '+expression+' as value',args)).rows[0].value;
 const call=(u,expression,args)=>asMember(db,u.id,u.sessionId,()=>rpc(expression,args));
 const staff=(expression,args)=>asService(db,()=>rpc(expression,args));
 async function save(u,extra={}){
  u.profile={...u.profile,...extra};
  return call(u,'public.marriage_apply($1)',[{...u.profile,consentVersion:'2026-11-06-assessment'}]);
 }
 async function approve(u){
  const status=(await db.query('select review_status from marriage.members where id=$1',[u.id])).rows[0].review_status;
  if(status!=='approved')await staff("public.marriage_review($1,'approve')",[u.id]);
 }
 async function add(gender,extra={}){
  const id=randomUUID(),u={id,email:id+'@example.test',sessionId:randomUUID(),profile:{displayName:'عضو تجريبي',gender,age:29,city:'الرياض',profession:'مهندس',bio:'نبذة عامة',contact:id+'@example.test',preferredMinAge:25,preferredMaxAge:40,familyPreference:'بعد التعارف الأول',assessmentVersion,surveyAnswers:answers(),...extra}};
  await addUser(db,u);const state=await save(u);await approve(u);
  await staff('public.marriage_record_receipt($1,$2,false)',[id,{bundleId:'com.blindmatch.marriage',productId:'com.blindmatch.marriage.monthly',appAccountToken:state.user.appAccountToken,originalTransactionId:id,transactionId:id,signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox'}]);
  return u;
 }
 return {rpc,call,staff,save,approve,add};
}

test('public basics are opt-in, reviewed and exportable; private criteria/personality stay private and older clients preserve them',async()=>{
 const db=await createDatabase();try{
  const {add,call,save,approve}=setup(db),a=await add('woman'),b=await add('man',{marriageBasics:basics,partnerCriteria:{height:{mode:'prefer',min:160}},personalityVersion:'personality-v1',personalityAnswers:personality()});
  const cards=await call(a,'public.marriage_discover()'),card=cards.find(p=>p.id===b.id);
  assert.deepEqual(card.marriageBasics,basics);
  for(const key of ['partnerCriteria','personalityAnswers','personalityVersion','surveyAnswers','contact'])assert.equal(card[key],undefined);
  assert.equal(card.fit.personality.percentage,null);
  for(const table of ['member_basics','partner_criteria','personality_answers','personality_questions'])await asMember(db,a.id,a.sessionId,()=>assert.rejects(db.query('select * from marriage.'+table),/permission denied/));
  await asMember(db,a.id,a.sessionId,()=>assert.rejects(db.query('select marriage.basics_json($1)',[b.id]),/permission denied/));
  const oldClient={...b.profile};for(const key of ['marriageBasics','partnerCriteria','personalityVersion','personalityAnswers'])delete oldClient[key];
  const unchanged=await call(b,'public.marriage_apply($1)',[{...oldClient,consentVersion:'2026-11-06-assessment'}]);
  assert.equal(unchanged.user.applicationStatus,'approved');assert.deepEqual(unchanged.profile.marriageBasics,basics);assert.deepEqual(unchanged.profile.personalityAnswers,personality());
  assert.deepEqual((await call(b,'public.marriage_personal_data()')).profile.partnerCriteria,b.profile.partnerCriteria);
  assert.equal((await save(b,{partnerCriteria:{smoking:{mode:'require',target:'never'}}})).user.applicationStatus,'approved');
  assert.equal((await save(b,{marriageBasics:{...basics,heightCm:180}})).user.applicationStatus,'pending');
  assert(!(await call(a,'public.marriage_discover()')).some(p=>p.id===b.id));
  await approve(b);
  // Clear self-disclosed basics without leaving a previously published value behind.
  const cleared=await save(b,{marriageBasics:{}});assert.deepEqual(cleared.profile.marriageBasics,{});
 }finally{await db.close()}
});

test('every required criterion is bilateral and unknown fails closed; no-preference never filters or inflates',async()=>{
 const db=await createDatabase();try{
  const {add,save,approve}=setup(db),a=await add('woman',{marriageBasics:basics}),b=await add('man',{marriageBasics:basics});
  const cases=[
   ['height',{mode:'require',min:170,max:190},'heightCm',160],
   ['weight',{mode:'require',min:70,max:90},'weightKg',100],
   ['tribalBackground',{mode:'require',target:'tribal'},'tribalBackground','non_tribal'],
   ['maritalStatus',{mode:'require',values:['never_married']},'maritalStatus','divorced'],
   ['children',{mode:'require',target:'none'},'childrenCount',1],
   ['smoking',{mode:'require',target:'never'},'smoking','yes'],
  ];
  for(const[key,rule,field,mismatch]of cases){
   await save(a,{partnerCriteria:{[key]:rule}});
   for(const value of [basics[field],mismatch,undefined]){
    const other={...basics,[field]:value};if(value===undefined)delete other[field];
    if(key==='tribalBackground')delete other.tribeName;
    await save(b,{marriageBasics:other});await approve(b);
    const expected=value===basics[field];
    assert.equal((await db.query('select marriage.compatible($1,$2) ok',[a.id,b.id])).rows[0].ok,expected,key+':'+value);
    assert.equal((await db.query('select marriage.compatible($1,$2) ok',[b.id,a.id])).rows[0].ok,expected);
    assert.equal(comparePreferences({...a.profile,id:a.id},{...b.profile,id:b.id})!==null,expected);
   }
   await save(a,{partnerCriteria:{[key]:{mode:'any'}}});
   assert.equal((await db.query('select marriage.compatible($1,$2) ok',[a.id,b.id])).rows[0].ok,true);
   const fit=(await db.query('select fit from marriage.pair_fit($1,$2)',[a.id,b.id])).rows[0].fit;
   assert.equal(fit.percentage,100);assert.deepEqual(fit.criteria,{covered:0,total:0});
  }
  await save(a,{partnerCriteria:{tribalBackground:{mode:'require',target:'same_tribe'}}});
  await save(b,{marriageBasics:{...basics,tribeName:'عائلة أخرى'}});await approve(b);
  assert.equal((await db.query('select marriage.compatible($1,$2) ok',[a.id,b.id])).rows[0].ok,false);
  await save(b,{marriageBasics:{...basics,tribeName:'  عائلة تجريبية  '}});await approve(b);
  assert.equal((await db.query('select marriage.compatible($1,$2) ok',[a.id,b.id])).rows[0].ok,true);
 }finally{await db.close()}
});

test('personality completion and soft-preference coverage score identically on server and phone',async()=>{
 const db=await createDatabase();try{
  const {add,save}=setup(db),a=await add('woman',{marriageBasics:basics,personalityVersion:'personality-v1',personalityAnswers:personality('A')}),b=await add('man',{marriageBasics:basics,personalityVersion:'personality-v1',personalityAnswers:personality('E')});
  const compare=async()=>{
   const fit=(await db.query('select fit from marriage.pair_fit($1,$2)',[a.id,b.id])).rows[0].fit;
   assert.deepEqual(fit,describeFit({...a.profile,id:a.id},{...b.profile,id:b.id}).fit);return fit;
  };
  assert.equal((await compare()).personality.percentage,0);assert.equal((await compare()).percentage,100);
  await save(b,{personalityAnswers:personality('A')});assert.equal((await compare()).personality.percentage,100);
  for(let i=0;i<24;i++){
   const choices=Object.fromEntries(personalityQuestions.filter((_,index)=>index!==i%13).map((q,index)=>[q.id,'ABCDE'[(index+i)%5]]));
   await save(b,{personalityAnswers:choices});
   await save(a,{partnerCriteria:{height:{mode:'prefer',min:i%2?190:170},weight:{mode:'any'},smoking:{mode:'prefer',target:'never'}}});
   const fit=await compare();assert.equal(fit.personality.complete,Object.keys(choices).length===12);assert.deepEqual(fit.criteria,{covered:2,total:2});
  }
  await save(b,{marriageBasics:{},personalityAnswers:{}});
  const unknown=await compare();assert.equal(unknown.percentage,100);assert.deepEqual(unknown.criteria,{covered:0,total:2});assert.equal(unknown.personality.percentage,null);
 }finally{await db.close()}
});

test('malformed basics, incomplete dealbreakers and fabricated personality codes fail without changing saved state',async()=>{
 const db=await createDatabase();try{
  const {add,call}=setup(db),a=await add('woman',{marriageBasics:basics});
  const bad=[{marriageBasics:{heightCm:119}},{marriageBasics:{weightKg:65.5}},{marriageBasics:{childrenCount:-1}},{marriageBasics:{secret:'x'}},
   {marriageBasics:{tribalBackground:'non_tribal',tribeName:'عائلة'}},{marriageBasics:{tribalBackground:'invented'}},
   {partnerCriteria:{height:{mode:'require'}}},{partnerCriteria:{height:{mode:'prefer',min:190,max:170}}},
   {partnerCriteria:{maritalStatus:{mode:'require',values:[]}}},{partnerCriteria:{height:{mode:'invented',min:170}}},
   {marriageBasics:{},partnerCriteria:{tribalBackground:{mode:'require',target:'same_tribe'}}},
   {personalityVersion:'fake'},{personalityAnswers:{social_energy:'AB'}},{personalityAnswers:{unrecognized:'A'}}];
  for(const extra of bad)await assert.rejects(call(a,'public.marriage_apply($1)',[{...a.profile,...extra,consentVersion:'2026-11-06-assessment'}]));
  const own=(await db.query('select marriage.profile_json($1) as p',[a.id])).rows[0].p;assert.deepEqual(own.marriageBasics,basics);assert.deepEqual(own.partnerCriteria,{});
 }finally{await db.close()}
});

test('new dealbreakers close pending requests but preserve already accepted conversations',async()=>{
 const db=await createDatabase();try{
  const {add,call,save}=setup(db),a=await add('woman',{marriageBasics:basics}),b=await add('man',{marriageBasics:basics}),c=await add('man',{marriageBasics:basics});
  const pending=await call(a,'public.marriage_request($1)',[b.id]),accepted=await call(a,'public.marriage_request($1)',[c.id]);
  await call(c,"public.marriage_act($1,'accept',null)",[accepted]);
  await save(a,{partnerCriteria:{height:{mode:'require',min:190}}});
  assert.equal((await db.query('select status from marriage.member_requests where id=$1',[pending])).rows[0].status,'closed');
  assert.equal((await db.query('select status from marriage.member_requests where id=$1',[accepted])).rows[0].status,'accepted');
  assert.equal((await db.query('select marriage.compatible($1,$2) ok',[a.id,c.id])).rows[0].ok,true);
 }finally{await db.close()}
});
