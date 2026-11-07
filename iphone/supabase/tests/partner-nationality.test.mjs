import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';

let source=await readFile(new URL('../../src/compatibility/model.ts',import.meta.url),'utf8');
for(const name of ['catalog.json','personality-catalog.json'])source=source.replace(JSON.stringify('./'+name),JSON.stringify(new URL('../../src/compatibility/'+name,import.meta.url).href));
const {dimensions,describeFit,comparePreferences}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const answers=()=>Object.fromEntries(dimensions.flatMap(d=>[[d.id,d.options[0].code],[d.partnerId,d.options[0].code]]));
const appearance={skinTone:'tone_3',dressStyle:'niqab',dressFlexibility:'keep'};
const avatar={style:'hijab',skinTone:'tone_6'};
function setup(db){
 const rpc=async(expression,args=[])=>(await db.query('select '+expression+' as value',args)).rows[0].value;
 const call=(u,expression,args)=>asMember(db,u.id,u.sessionId,()=>rpc(expression,args));
 const staff=(expression,args)=>asService(db,()=>rpc(expression,args));
 async function save(u,extra={}){u.profile={...u.profile,...extra};return call(u,'public.marriage_apply($1)',[{...u.profile,consentVersion:'2026-11-06-assessment'}]);}
 async function approve(u){if((await db.query('select review_status from marriage.members where id=$1',[u.id])).rows[0].review_status!=='approved')await staff("public.marriage_review($1,'approve')",[u.id]);}
 async function add(gender,extra={}){
  const id=randomUUID(),u={id,email:id+'@example.test',sessionId:randomUUID(),profile:{displayName:'عضو تجريبي',gender,age:29,city:'الرياض',profession:'مهندس',bio:'نبذة عامة',contact:id+'@example.test',preferredMinAge:25,preferredMaxAge:40,familyPreference:'بعد التعارف الأول',assessmentVersion:'marriage-v1',appearanceVersion:'appearance-v1',surveyAnswers:answers(),...extra}};
  await addUser(db,u);const state=await save(u);await approve(u);
  await staff('public.marriage_record_receipt($1,$2,false)',[id,{bundleId:'com.blindmatch.marriage',productId:'com.blindmatch.marriage.monthly',appAccountToken:state.user.appAccountToken,originalTransactionId:id,transactionId:id,signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox'}]);
  return u;
 }
 return {rpc,call,staff,save,approve,add};
}

test('explicit nationality preferences preserve open defaults and enforce reciprocal acceptance',async()=>{
 const db=await createDatabase();try{
  const {add,call,rpc,save,approve}=setup(db);
  const man=await add('man',{marriageBasics:{nationality:'سعودي',tribalBackground:'tribal'}});
  const woman=await add('woman',{marriageBasics:{nationality:'مصرية',tribalBackground:'non_tribal'}});
  assert.equal(await rpc('marriage.compatible($1,$2)',[man.id,woman.id]),true,'identity never implies same identity requirement');
  await save(man,{partnerCriteria:{nationality:{mode:'require',values:['مصري']},tribalBackground:{mode:'any'}}});await approve(man);
  assert.equal(await rpc('marriage.compatible($1,$2)',[man.id,woman.id]),true);
  await save(woman,{partnerCriteria:{nationality:{mode:'require',values:['سعودية'],exclude:true}}});await approve(woman);
  assert.equal(await rpc('marriage.compatible($1,$2)',[man.id,woman.id]),false,'either participant may exclude a nationality');
  await save(woman,{partnerCriteria:{nationality:{mode:'any'},tribalBackground:{mode:'require',target:'non_tribal'}}});await approve(woman);
  assert.equal(await rpc('marriage.compatible($1,$2)',[man.id,woman.id]),false,'own background and acceptable background are separate');
  await save(woman,{partnerCriteria:{tribalBackground:{mode:'any'}}});await approve(woman);
  await save(man,{partnerCriteria:{nationality:{mode:'require',values:['سعودي']}}});await approve(man);
  assert.equal(await rpc('marriage.compatible($1,$2)',[man.id,woman.id]),false);
  await save(man,{partnerCriteria:{nationality:{mode:'prefer',values:['سعودي']}}});await approve(man);
  assert.equal(await rpc('marriage.compatible($1,$2)',[man.id,woman.id]),true,'preferences rank without exclusion');
  await assert.rejects(save(man,{partnerCriteria:{nationality:{mode:'require',values:[]}}}));
  await assert.rejects(save(man,{partnerCriteria:{nationality:{mode:'require',values:['سعودي'],exclude:'yes'}}}));
  const profile=await rpc('marriage.profile_json($1)',[woman.id]);assert.equal(profile.partnerCriteria.tribalBackground.mode,'any');
 }finally{await db.close();}
});

test('nationality and tribal rules agree between client and database, including unknown',async()=>{
 const db=await createDatabase();try{
  const {add,rpc}=setup(db),man=await add('man',{marriageBasics:{nationality:'Saudi Arabia',tribalBackground:'prefer_not_to_say'}}),woman=await add('woman',{marriageBasics:{nationality:'مصرية',tribalBackground:'non_tribal'}});
  const rule={mode:'require',values:['سعودية']};
  assert.equal(await rpc('marriage.criterion_fit($1,$2,$3,$4)',[woman.id,man.id,'nationality',rule]),true);
  assert.equal(await rpc('marriage.criterion_fit($1,$2,$3,$4)',[woman.id,man.id,'tribalBackground',{mode:'require',target:'non_tribal'}]),null);
  const a={...man.profile,id:man.id},b={...woman.profile,id:woman.id};
  assert(comparePreferences({...b,partnerCriteria:{nationality:rule}},a));
  assert.equal(comparePreferences({...b,partnerCriteria:{nationality:{...rule,exclude:true}}},a),null);
  assert.equal(comparePreferences({...b,partnerCriteria:{tribalBackground:{mode:'require',target:'non_tribal'}}},a),null);
  assert.equal(await rpc('marriage.criterion_fit($1,$2,$3,$4)',[woman.id,man.id,'nationality',{...rule,exclude:true}]),false);
  await db.query('update marriage.member_basics set nationality=null where member_id=$1',[man.id]);
  assert.equal(await rpc('marriage.criterion_fit($1,$2,$3,$4)',[woman.id,man.id,'nationality',{...rule,exclude:true}]),null,'missing nationality does not pass an exclusion requirement');
 }finally{await db.close();}
});
