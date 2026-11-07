import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { assessmentVersion, dimensions, describeFit } from '../../src/compatibility/model.ts';
import { createDatabase, addUser, asMember, asService } from './harness.mjs';

const allAnswers=()=>Object.fromEntries(dimensions.flatMap(d=>[[d.id,d.options[0].code],[d.partnerId,d.options[0].code]]));
function setup(db){
 const rpc=async(expression,args=[])=>(await db.query('select '+expression+' as value',args)).rows[0].value;
 const call=(u,expression,args)=>asMember(db,u.id,u.sessionId,()=>rpc(expression,args));
 const staff=(expression,args)=>asService(db,()=>rpc(expression,args));
 async function add(gender,extra={}){
  const id=randomUUID(),u={id,email:id+'@example.test',sessionId:randomUUID()};await addUser(db,u);
  const profile={displayName:'عضو تجريبي',gender,age:29,city:'الرياض',profession:'مهندس',bio:'نبذة عامة',contact:u.email,
   preferredMinAge:25,preferredMaxAge:40,familyPreference:'بعد التعارف الأول',assessmentVersion,surveyAnswers:allAnswers(),...extra};
  const state=await call(u,'public.marriage_apply($1)',[{...profile,consentVersion:'2026-11-07-privacy',signupConsents:{version:'2026-11-07-privacy',adult:true,terms:true,privacy:true,sensitiveProfile:true,sensitivePublication:true,assessment:true,photo:false}}]);
  await staff("public.marriage_review($1,'approve')",[id]);
  await staff('public.marriage_record_receipt($1,$2,false)',[id,{bundleId:'com.blindmatch.marriage',productId:'com.blindmatch.marriage.monthly',appAccountToken:state.user.appAccountToken,originalTransactionId:id,transactionId:id,signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox'}]);
  return {...u,profile};
 }
 return{rpc,call,staff,add};
}

test('compatibility percentage requires complete current assessments on both sides and matches the phone calculation',async()=>{
 const db=await createDatabase();try{
  const {add}=setup(db),a=await add('woman'),b=await add('man');
  const compare=async()=>{
   const fit=(await db.query('select fit from marriage.pair_fit($1,$2)',[a.id,b.id])).rows[0].fit;
   assert.deepEqual(fit,describeFit({...a.profile,id:a.id},{...b.profile,id:b.id}).fit);return fit;
  };
  assert.equal((await compare()).percentage,100);
  assert.equal((await compare()).assessmentComplete,true);
  b.profile.surveyAnswers={...b.profile.surveyAnswers,[dimensions[0].id]:dimensions[0].options[1].code};
  await db.query('update marriage.member_answers set option_code=$3 where member_id=$1 and question_code=$2',[b.id,dimensions[0].id,dimensions[0].options[1].code]);
  const changed=await compare();assert(changed.percentage<100&&changed.percentage>=0);
  delete b.profile.surveyAnswers[dimensions.at(-1).partnerId];
  await db.query('delete from marriage.member_answers where member_id=$1 and question_code=$2',[b.id,dimensions.at(-1).partnerId]);
  assert.equal((await compare()).percentage,null);
  assert.equal((await compare()).assessmentComplete,false);
  b.profile.surveyAnswers=allAnswers();
  await db.query('update marriage.member_answers set option_code=$3 where member_id=$1 and question_code=$2',[b.id,dimensions[0].id,dimensions[0].options[0].code]);
  await db.query('insert into marriage.member_answers values($1,$2,$3)',[b.id,dimensions.at(-1).partnerId,dimensions.at(-1).options[0].code]);
  for(const version of ['marriage-v1','legacy-v0']){
   b.profile.assessmentVersion=version;await db.query('update marriage.member_assessment set version=$2 where member_id=$1',[b.id,version]);
   const older=await compare();assert.equal(older.percentage,null);assert.equal(older.assessmentComplete,false);
  }
 }finally{await db.close()}
});

test('public narratives persist, stay separate from private answers and require re-review when changed',async()=>{
 const db=await createDatabase();try{
  const {add,call,staff,rpc}=setup(db),viewer=await add('woman');
  const details={lookingFor:'شريك يحترم الحوار',valuesStatement:'الصدق والاحترام',lifeTogether:'بيت هادئ نتشارك مسؤولياته',education:'بكالوريوس هندسة',marriageIntent:'تعارف جاد يهدف إلى الزواج'};
  const legacy=await add('man'),peer=await add('man',details);
  const cards=await call(viewer,'public.marriage_discover()');
  assert.equal(cards.length,2);const card=cards.find(row=>row.id===peer.id);
  for(const [key,value]of Object.entries(details))assert.equal(card[key],value);
  assert.equal(card.familyPreference,peer.profile.familyPreference);
  assert.equal(card.fit.percentage,100);
  for(const key of ['contact','surveyAnswers','hardRequirements','priorityCategories','demoPhoto'])assert.equal(card[key],undefined);
  assert.equal(cards.find(row=>row.id===legacy.id).familyPreference,null);
  await call(legacy,'public.marriage_apply($1)',[{...legacy.profile,bio:'تعديل من إصدار أقدم',consentVersion:'2026-11-07-privacy',signupConsents:{version:'2026-11-07-privacy',adult:true,terms:true,privacy:true,sensitiveProfile:true,sensitivePublication:true,assessment:true,photo:false}}]);
  assert.equal((await db.query('select count(*)::int n from marriage.profile_details where member_id=$1',[legacy.id])).rows[0].n,0);
  await staff("public.marriage_review($1,'approve')",[legacy.id]);
  assert.equal((await call(viewer,'public.marriage_discover()')).find(row=>row.id===legacy.id).familyPreference,null);
  await asMember(db,viewer.id,viewer.sessionId,()=>assert.rejects(db.query('select * from marriage.profile_details'),/permission denied/));
  await asMember(db,viewer.id,viewer.sessionId,()=>assert.rejects(db.query('select marriage.profile_details_json($1)',[peer.id]),/permission denied/));
  const oldClient={...peer.profile};for(const key of Object.keys(details))delete oldClient[key];
  const unchanged=await call(peer,'public.marriage_apply($1)',[{...oldClient,consentVersion:'2026-11-07-privacy',signupConsents:{version:'2026-11-07-privacy',adult:true,terms:true,privacy:true,sensitiveProfile:true,sensitivePublication:true,assessment:true,photo:false}}]);
  assert.equal(unchanged.user.applicationStatus,'approved');for(const[key,value]of Object.entries(details))assert.equal(unchanged.profile[key],value);
  await assert.rejects(call(peer,'public.marriage_apply($1)',[{...peer.profile,lookingFor:'x'.repeat(601),consentVersion:'2026-11-07-privacy',signupConsents:{version:'2026-11-07-privacy',adult:true,terms:true,privacy:true,sensitiveProfile:true,sensitivePublication:true,assessment:true,photo:false}}]),/طول/);
  await assert.rejects(call(peer,'public.marriage_apply($1)',[{...peer.profile,education:{private:'not text'},consentVersion:'2026-11-07-privacy',signupConsents:{version:'2026-11-07-privacy',adult:true,terms:true,privacy:true,sensitiveProfile:true,sensitivePublication:true,assessment:true,photo:false}}]),/تنسيق/);
  const updated=await call(peer,'public.marriage_apply($1)',[{...peer.profile,valuesStatement:'تعاون ووضوح',consentVersion:'2026-11-07-privacy',signupConsents:{version:'2026-11-07-privacy',adult:true,terms:true,privacy:true,sensitiveProfile:true,sensitivePublication:true,assessment:true,photo:false}}]);
  assert.equal(updated.user.applicationStatus,'pending');assert(!(await call(viewer,'public.marriage_discover()')).some(row=>row.id===peer.id));
  const reviewer={id:randomUUID(),email:'reviewer@example.test',sessionId:randomUUID()};await addUser(db,reviewer);
  await db.query("insert into marriage.staff_accounts(user_id,role,display_name) values($1,'reviewer','Reviewer')",[reviewer.id]);
  const review=await asMember(db,reviewer.id,reviewer.sessionId,async()=>{
   await db.query("select set_config('request.jwt.claims',jsonb_set(auth.jwt(),'{aal}','\"aal2\"')::text,false)");
   return rpc('public.marriage_admin_member($1)',[peer.id]);
  });assert.equal(review.valuesStatement,'تعاون ووضوح');assert.equal(review.lookingFor,details.lookingFor);
  await staff("public.marriage_review($1,'approve')",[peer.id]);
  assert.equal((await call(viewer,'public.marriage_discover()')).find(row=>row.id===peer.id).valuesStatement,'تعاون ووضوح');
  const own=(await db.query('select marriage.profile_json($1) as value',[peer.id])).rows[0].value;
  const exported=await call(peer,'public.marriage_personal_data()');
  assert.equal(exported.profile.lookingFor,own.lookingFor);
 }finally{await db.close()}
});
