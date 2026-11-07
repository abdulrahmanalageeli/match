import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';

const version='2026-11-07-privacy';
const essential={version,adult:true,terms:true,privacy:true,sensitiveProfile:false,sensitivePublication:false,assessment:false,photo:false};
const all={...essential,sensitiveProfile:true,sensitivePublication:true,assessment:true,photo:true};
function setup(db){
 const rpc=async(sql,args=[])=>(await db.query('select '+sql+' value',args)).rows[0].value;
 const call=(u,sql,args=[])=>asMember(db,u.id,u.sessionId,()=>rpc(sql,args));
 async function member(gender='man'){
  const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};
  await addUser(db,u);
  u.profile={displayName:'عضو تجريبي',age:29,gender,city:'الرياض',profession:'مهندس',bio:'نبذة اختيارية',contact:u.email,
   preferredMinAge:25,preferredMaxAge:40,familyPreference:'',appearanceVersion:'appearance-v1',assessmentVersion:'marriage-v2',consentVersion:version,
   marriageBasics:{},partnerCriteria:{},surveyAnswers:{},personalityAnswers:{},personalityVersion:'personality-v1',hardRequirements:[],priorityCategories:[],signupConsents:essential};
  return u;
 }
 const save=(u,patch={})=>call(u,'public.marriage_apply($1)',[{...u.profile,...patch}]);
 const pair=(action,token,payload={})=>asService(db,()=>rpc('public.nisfayn_test_rpc($1,$2,$3)',[action,token,payload]));
 return {rpc,call,member,save,pair};
}

test('current marriage and voluntary religious disclosures persist without scoring or public non-disclosure labels',async()=>{
 const db=await createDatabase();try{
  const{rpc,member,save}=setup(db),man=await member();
  const basics={maritalStatus:'married',currentWives:2,polygynyPreference:'not_open',religiousAffiliation:'sunni',prayerPractice:'regular'};
  const saved=await save(man,{marriageBasics:basics,signupConsents:all});
  assert.deepEqual(saved.profile.marriageBasics,basics);
  assert.deepEqual(saved.profile.signupConsents,all);
  assert.equal((await rpc('marriage.member_card($1,$1)',[man.id])).marriageBasics.religiousAffiliation,'sunni');
  await save(man,{marriageBasics:{religiousAffiliation:'prefer_not_to_say',prayerPractice:'prefer_not_to_say',polygynyPreference:'prefer_not_to_say'},signupConsents:essential});
  const own=await rpc('marriage.basics_json($1)',[man.id]);assert.equal(own.religiousAffiliation,'prefer_not_to_say');
  const card=await rpc('marriage.member_card($1,$1)',[man.id]);assert.deepEqual(card.marriageBasics,{});assert.equal(card.signupConsents,undefined);
  assert.deepEqual((await rpc("marriage.normalize_marriage_extras($1,$2,'{}','personality-v1')",[{}, {maritalStatus:{mode:'require',values:['married','divorced']}}])).partnerCriteria.maritalStatus.values,['married','divorced']);
  await assert.rejects(save(man,{marriageBasics:{maritalStatus:'married'},signupConsents:all}),/عدد الزوجات/);
  await assert.rejects(save(man,{marriageBasics:{maritalStatus:'married',currentWives:4},signupConsents:all}),/غير متاح/);
  await assert.rejects(save(man,{marriageBasics:{maritalStatus:'divorced',currentWives:1},signupConsents:all}),/عدد الزوجات/);
  const woman=await member('woman');
  await assert.rejects(save(woman,{marriageBasics:{maritalStatus:'married',currentWives:1},signupConsents:all}),/غير متاح/);
 }finally{await db.close();}
});

test('new registrations require separate declarations and explicit purpose choices',async()=>{
 const db=await createDatabase();try{
  const{rpc,member,save}=setup(db),u=await member();
  await assert.rejects(save(u,{signupConsents:undefined}),/إقرارات التسجيل/);
  for(const field of ['adult','terms','privacy'])await assert.rejects(save(u,{signupConsents:{...essential,[field]:false}}),/إقرار الأهلية/);
  await assert.rejects(save(u,{signupConsents:{...essential,photo:'true'}}),/اختيار موافقة/);
  await assert.rejects(save(u,{signupConsents:{...essential,marketing:true}}),/إقرارات التسجيل/);
  for(const marriageBasics of [{religiousAffiliation:'sunni'},{prayerPractice:'regular'},{tribalBackground:'tribal'},{skinTone:'tone_3'}]){
   await assert.rejects(save(u,{marriageBasics}),/التفاصيل الحساسة/);
  }
  await assert.rejects(save(u,{publicAvatar:{style:'hijab',skinTone:'tone_2'}}),/التفاصيل الحساسة/);
  await assert.rejects(save(u,{surveyAnswers:{conversation_initiative_preference:'A'}}),/إجابات التوافق/);
  await assert.rejects(save(u,{personalityAnswers:{social_energy:'A'}}),/إجابات التوافق/);
  await assert.rejects(save(u,{partnerCriteria:{height:{mode:'prefer',min:160}}}),/إجابات التوافق/);
  const state=await save(u,{partnerCriteria:{skinTone:{mode:'any'},height:{mode:'any'}}});
  assert.deepEqual(state.profile.signupConsents,essential);
  assert.equal((await db.query('select count(*)::int n from marriage.signup_consent_events where member_id=$1',[u.id])).rows[0].n,7);
  assert.deepEqual(await rpc('marriage.signup_consents_json($1)',[u.id]),essential);
  await asService(db,()=>rpc("public.marriage_review($1,'approve')",[u.id]));
  assert.equal((await db.query('select review_status from marriage.members where id=$1',[u.id])).rows[0].review_status,'approved');
 }finally{await db.close();}
});

test('purpose withdrawals append history, clear selected data and cannot be bypassed by older payloads',async()=>{
 const db=await createDatabase();try{
  const{rpc,call,member,save}=setup(db),u=await member();
  await save(u,{signupConsents:all,marriageBasics:{skinTone:'tone_3',religiousAffiliation:'shia'},surveyAnswers:{conversation_initiative_preference:'A'},personalityAnswers:{social_energy:'B'}});
  await assert.rejects(save(u,{signupConsents:essential,marriageBasics:{religiousAffiliation:'shia'}}),/التفاصيل الحساسة/);
  await save(u,{signupConsents:essential});
  assert.deepEqual(await rpc('marriage.signup_consents_json($1)',[u.id]),essential);
  const rows=(await db.query("select granted from marriage.signup_consent_events where member_id=$1 and purpose='sensitive_profile' order by id",[u.id])).rows;
  assert.deepEqual(rows,[{granted:true},{granted:false}]);
  const state=await call(u,'public.marriage_state()');assert.deepEqual(state.profile.marriageBasics,{});assert.deepEqual(state.profile.personalityAnswers,{});assert.deepEqual(state.profile.surveyAnswers,{});
  await assert.rejects(save(u,{consentVersion:'2026-11-06-assessment',signupConsents:undefined,marriageBasics:{religiousAffiliation:'sunni'}}),/التفاصيل الحساسة/);
  for(const role of ['anon','authenticated','service_role']){
   await db.exec('set role '+role);
   try{await assert.rejects(db.query('select * from marriage.signup_consent_events'),/permission denied/);await assert.rejects(db.query('update marriage.signup_consent_events set granted=true'),/permission denied/);}
   finally{await db.exec('reset role');}
  }
 }finally{await db.close();}
});

test('legacy profile edits preserve existing disclosures without inventing purpose consent',async()=>{
 const db=await createDatabase();try{
  const{rpc,member,save}=setup(db),u=await member();
  const marriageBasics={religiousAffiliation:'sunni',prayerPractice:'regular',polygynyPreference:'open_to_discussion'};
  await save(u,{signupConsents:all,marriageBasics});
  // Simulate a pre-upgrade record: there is deliberately no purpose-consent event.
  await db.query('delete from marriage.signup_consent_events where member_id=$1',[u.id]);
  const saved=await save(u,{signupConsents:undefined,consentVersion:'2026-11-06-assessment',bio:'نبذة معدّلة'});
  assert.deepEqual(saved.profile.marriageBasics,marriageBasics);
  assert.equal(saved.profile.signupConsents,undefined);
  assert.equal(await rpc('marriage.signup_consents_json($1)',[u.id]),null);
  await assert.rejects(save(u,{signupConsents:undefined,consentVersion:'2026-11-06-assessment',marriageBasics:{religiousAffiliation:'shia'}}),/حدّث موافقاتك/);
 }finally{await db.close();}
});

test('pair testing uses the same choices and validates status without exposing consent history to the partner',async()=>{
 const db=await createDatabase();try{
  const{pair,rpc}=setup(db),a='a'.repeat(64),b='b'.repeat(64);
  await pair('login',a,{actor:'abdulrahman'});await pair('login',b,{actor:'reham'});
  const save=async(token,profile)=>pair('profile',token,{profile,expectedRevision:(await pair('state',token)).profileRevision});
  const profile={displayName:'اختبار',age:29,marriageBasics:{},partnerCriteria:{},surveyAnswers:{},personalityAnswers:{},signupConsents:essential};
  let state=await save(a,{...profile,marriageBasics:{maritalStatus:'married',currentWives:1},signupConsents:all});
  assert.deepEqual(state.profiles.abdulrahman.signupConsents,all);
  state=await pair('state',b);assert.equal(state.profiles.abdulrahman.signupConsents,undefined);
  await assert.rejects(save(b,{...profile,marriageBasics:{maritalStatus:'married',currentWives:1}}),/غير متاح/);
  await assert.rejects(save(a,{...profile,age:17}),/١٨/);
  await assert.rejects(save(a,{...profile,marriageBasics:{religiousAffiliation:'sunni'}}),/التفاصيل الحساسة/);
  await save(a,profile);
  assert.deepEqual(await rpc("nisfayn_test.signup_consents_json('abdulrahman')"),essential);
  const exact=(await db.query("select granted from nisfayn_test.signup_consent_events where actor='abdulrahman' and purpose='profile_photo' order by id")).rows;
  assert.deepEqual(exact,[{granted:true},{granted:false}]);
 }finally{await db.close();}
});

test('sensitive publication requires a new explicit receipt and never changes private matching inputs',async()=>{
 const db=await createDatabase();try{
  const{rpc,call,member,save}=setup(db),a=await member(),b=await member('woman');
  const details={marriageBasics:{heightCm:170,skinTone:'tone_3',tribalBackground:'tribal',tribeName:'مثال',religiousAffiliation:'sunni',prayerPractice:'regular'},
   partnerCriteria:{skinTone:{mode:'prefer',values:['tone_3']},tribalBackground:{mode:'prefer',target:'same_tribe'}},
   publicAvatar:null};
  await save(a,{...details,signupConsents:all});await save(b,{...details,signupConsents:all});
  const before=await rpc('(select fit from marriage.pair_fit($1,$2))',[a.id,b.id]);
  assert.equal((await rpc('marriage.member_card($1,$2)',[a.id,b.id])).marriageBasics.tribeName,'مثال');
  const own=await save(b,{...details,signupConsents:{...all,sensitivePublication:false}});
  assert.deepEqual(own.profile.marriageBasics,details.marriageBasics);
  assert.deepEqual(own.profile.partnerCriteria,details.partnerCriteria);
  const hidden=await rpc('marriage.member_card($1,$2)',[a.id,b.id]);
  for(const field of ['skinTone','tribalBackground','tribeName','religiousAffiliation','prayerPractice'])assert.equal(hidden.marriageBasics[field],undefined);
  assert.equal(hidden.marriageBasics.heightCm,170);
  assert.deepEqual(hidden.fit,before);
  assert.deepEqual(await rpc('(select fit from marriage.pair_fit($1,$2))',[a.id,b.id]),before);
  // Changing the notice version must not break independently granted portraits.
  const portrait=await call(b,'public.marriage_portrait_prepare(40)');
  await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['nisfayn-profile-portraits',portrait.path,{mimetype:'image/jpeg',size:200}]);
  assert.equal((await call(b,'public.marriage_portrait_commit($1)',[portrait.id])).id,portrait.id);
  for(const role of ['anon','authenticated','service_role'])assert.equal(await rpc("has_function_privilege($1,'marriage.member_card(uuid,uuid)','EXECUTE')",[role]),false);
  assert.deepEqual((await db.query("select granted from marriage.signup_consent_events where member_id=$1 and purpose='sensitive_publication' order by id",[b.id])).rows,[{granted:true},{granted:false}]);
  // Old clients retain their processing choice, but cannot infer publication.
  const legacy={...all,version:'2026-11-06-onboarding'};delete legacy.sensitivePublication;
  await save(b,{...details,signupConsents:legacy});
  assert.equal((await rpc('marriage.signup_consents_json($1)',[b.id])).sensitivePublication,false);
  await assert.rejects(save(b,{...details,signupConsents:{...legacy,sensitivePublication:true}}),/عرض التفاصيل الحساسة/);
  await db.query('delete from marriage.signup_consent_events where member_id=$1',[b.id]);
  assert.equal((await rpc('marriage.member_card($1,$2)',[a.id,b.id])).marriageBasics.tribeName,undefined);
  assert.equal((await rpc('marriage.profile_json($1)',[b.id])).marriageBasics.tribeName,'مثال');
  const disabled=await save(a,{signupConsents:{...essential,sensitivePublication:true}});
  assert.equal(disabled.profile.signupConsents.sensitivePublication,false);
 }finally{await db.close();}
});

test('every tester state carries latest publication flags, including mutation responses',async()=>{
 const db=await createDatabase();try{
  const{pair}=setup(db),a='c'.repeat(64),b='d'.repeat(64);
  await pair('login',a,{actor:'abdulrahman'});await pair('login',b,{actor:'reham'});let state=await pair('state',a);
  assert.deepEqual(state.sensitivePublication,{abdulrahman:false,reham:false});
  const profile={displayName:'اختبار',age:29,marriageBasics:{religiousAffiliation:'sunni'},partnerCriteria:{},surveyAnswers:{},personalityAnswers:{},signupConsents:all};
  state=await pair('profile',a,{profile,expectedRevision:state.profileRevision});
  assert.deepEqual(state.sensitivePublication,{abdulrahman:true,reham:false});
  state=await pair('profile',a,{profile:{...profile,signupConsents:{...all,sensitivePublication:false}},expectedRevision:state.profileRevision});
  assert.deepEqual(state.sensitivePublication,{abdulrahman:false,reham:false});
  assert.equal(state.profiles.abdulrahman.marriageBasics.religiousAffiliation,'sunni');
  assert.deepEqual((await pair('state',b)).sensitivePublication,state.sensitivePublication);
 }finally{await db.close();}
});
