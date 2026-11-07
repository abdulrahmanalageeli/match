import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';

let source=await readFile(new URL('../../src/compatibility/model.ts',import.meta.url),'utf8');
for(const name of ['catalog.json','personality-catalog.json'])source=source.replace(JSON.stringify('./'+name),JSON.stringify(new URL('../../src/compatibility/'+name,import.meta.url).href));
const {assessmentVersion,dimensions,describeFit,comparePreferences}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
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
  const id=randomUUID(),u={id,email:id+'@example.test',sessionId:randomUUID(),profile:{displayName:'عضو تجريبي',gender,age:29,city:'الرياض',profession:'مهندس',bio:'نبذة عامة',contact:id+'@example.test',preferredMinAge:25,preferredMaxAge:40,familyPreference:'بعد التعارف الأول',assessmentVersion,appearanceVersion:'appearance-v1',surveyAnswers:answers(),...extra}};
  await addUser(db,u);const state=await save(u);await approve(u);
  await staff('public.marriage_record_receipt($1,$2,false)',[id,{bundleId:'com.blindmatch.marriage',productId:'com.blindmatch.marriage.monthly',appAccountToken:state.user.appAccountToken,originalTransactionId:id,transactionId:id,signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox'}]);
  return u;
 }
 return {rpc,call,staff,save,approve,add};
}

test('appearance and avatar are independent opt-ins, checked public fields, reviewed on edit, and safely cleared',async()=>{
 const db=await createDatabase();try{
  const {add,call,save,approve,rpc}=setup(db),a=await add('man'),b=await add('woman',{marriageBasics:appearance,publicAvatar:avatar,partnerCriteria:{skinTone:{mode:'prefer',values:['tone_2']}}});
  let card=(await call(a,'public.marriage_discover()')).find(p=>p.id===b.id);
  assert.deepEqual(card.marriageBasics,appearance);assert.deepEqual(card.publicAvatar,avatar);
  for(const key of ['partnerCriteria','appearanceVersion','personalityAnswers','privatePhoto','photoUrl'])assert.equal(card[key],undefined);
  await asMember(db,a.id,a.sessionId,()=>assert.rejects(db.query('select * from marriage.member_public_avatars'),/permission denied/));
  await asMember(db,a.id,a.sessionId,()=>assert.rejects(db.query('select marriage.public_avatar_json($1)',[b.id]),/permission denied/));
  // Actual self-declared dress remains niqab despite the separately selected illustration.
  assert.equal(card.marriageBasics.dressStyle,'niqab');assert.equal(card.publicAvatar.style,'hijab');
  const reviewer={id:randomUUID(),email:'appearance-reviewer@example.test',sessionId:randomUUID()};await addUser(db,reviewer);
  await db.query("insert into marriage.staff_accounts(user_id,role,display_name) values($1,'reviewer','Reviewer')",[reviewer.id]);
  const review=await asMember(db,reviewer.id,reviewer.sessionId,async()=>{
   await db.query("select set_config('request.jwt.claims',jsonb_set(auth.jwt(),'{aal}','\"aal2\"')::text,false)");return rpc('public.marriage_admin_member($1)',[b.id]);
  });assert.deepEqual(review.marriageBasics,appearance);assert.deepEqual(review.publicAvatar,avatar);assert.equal(review.partnerCriteria,undefined);
  const changed=await save(b,{publicAvatar:{style:'niqab',skinTone:'tone_3'}});assert.equal(changed.user.applicationStatus,'pending');
  assert(!(await call(a,'public.marriage_discover()')).some(p=>p.id===b.id));await approve(b);
  const cleared=await save(b,{marriageBasics:{},partnerCriteria:{},publicAvatar:null});assert.deepEqual(cleared.profile.marriageBasics,{});assert.equal(cleared.profile.publicAvatar,null);
  assert.equal((await db.query('select count(*)::int n from marriage.member_public_avatars where member_id=$1',[b.id])).rows[0].n,0);
  await approve(b);card=(await call(a,'public.marriage_discover()')).find(p=>p.id===b.id);assert.equal(card.publicAvatar,null);assert.deepEqual(card.marriageBasics,{});
 }finally{await db.close()}
});

test('older clients preserve new appearance choices and criteria while explicit current-version clearing removes them',async()=>{
 const db=await createDatabase();try{
  const {add,call,save}=setup(db),a=await add('woman',{marriageBasics:{heightCm:168,...appearance},publicAvatar:avatar,partnerCriteria:{height:{mode:'prefer',min:170},dressStyle:{mode:'require',values:['hijab']},dressFlexibility:{mode:'prefer',target:'open_to_discussion'}}});
  const legacy={...a.profile,marriageBasics:{heightCm:168},partnerCriteria:{height:{mode:'prefer',min:170}}};delete legacy.appearanceVersion;delete legacy.publicAvatar;
  const kept=await call(a,'public.marriage_apply($1)',[{...legacy,consentVersion:'2026-11-06-assessment'}]);assert.equal(kept.user.applicationStatus,'approved');
  assert.deepEqual(kept.profile.marriageBasics,a.profile.marriageBasics);assert.deepEqual(kept.profile.partnerCriteria,a.profile.partnerCriteria);assert.deepEqual(kept.profile.publicAvatar,avatar);
  const exported=await call(a,'public.marriage_personal_data()');assert.deepEqual(exported.profile.publicAvatar,avatar);assert.equal(exported.profile.appearanceVersion,'appearance-v1');
  const clear=await save(a,{marriageBasics:{heightCm:168},partnerCriteria:{},publicAvatar:null});assert.deepEqual(clear.profile.marriageBasics,{heightCm:168});assert.deepEqual(clear.profile.partnerCriteria,{});assert.equal(clear.profile.publicAvatar,null);
 }finally{await db.close()}
});

test('appearance requirements are symmetric exact choices; unknowns fail closed and openness never overrides current dress',async()=>{
 const db=await createDatabase();try{
  const {add,save,approve}=setup(db),a=await add('man'),b=await add('woman',{marriageBasics:appearance,publicAvatar:avatar});
  const cases=[['skinTone',{mode:'require',values:['tone_3']},'tone_3','tone_4'],['dressStyle',{mode:'require',values:['niqab']},'niqab','hijab'],['dressFlexibility',{mode:'require',target:'open_to_discussion'},'open_to_discussion','keep']];
  for(const[key,rule,match,mismatch]of cases){
   await save(a,{partnerCriteria:{[key]:rule}});
   for(const value of [match,mismatch,undefined]){
    const basics={...appearance,[key]:value};if(value===undefined)delete basics[key];
    await save(b,{marriageBasics:basics});await approve(b);
    const expected=value===match;
    for(const ids of [[a.id,b.id],[b.id,a.id]])assert.equal((await db.query('select marriage.compatible($1,$2) ok',ids)).rows[0].ok,expected);
    assert.equal(comparePreferences({...a.profile,id:a.id},{...b.profile,id:b.id})!==null,expected);
   }
  }
  await save(a,{partnerCriteria:{dressStyle:{mode:'require',values:['uncovered']},dressFlexibility:{mode:'require',target:'open_to_discussion'}}});
  await save(b,{marriageBasics:{dressStyle:'niqab',dressFlexibility:'open_to_discussion'}});await approve(b);
  assert.equal((await db.query('select marriage.compatible($1,$2) ok',[a.id,b.id])).rows[0].ok,false);
  await save(a,{partnerCriteria:{dressFlexibility:{mode:'require',target:'open_to_discussion'}}});
  await save(b,{marriageBasics:{dressFlexibility:'prefer_not_to_say'}});await approve(b);
  assert.equal((await db.query('select marriage.compatible($1,$2) ok',[a.id,b.id])).rows[0].ok,false);
  await save(a,{partnerCriteria:{dressStyle:{mode:'any'},skinTone:{mode:'any'},dressFlexibility:{mode:'any'}}});
  assert.equal((await db.query('select marriage.compatible($1,$2) ok',[a.id,b.id])).rows[0].ok,true);
 }finally{await db.close()}
});

test('appearance soft preferences use exact self-reports, never avatar or palette proximity, and match the phone score',async()=>{
 const db=await createDatabase();try{
  const {add,save}=setup(db),a=await add('man',{partnerCriteria:{skinTone:{mode:'prefer',values:['tone_1']},dressStyle:{mode:'prefer',values:['hijab']},dressFlexibility:{mode:'prefer',target:'open_to_discussion'}}}),b=await add('woman',{publicAvatar:{style:'hijab',skinTone:'tone_1'}});
  const compare=async()=>{const fit=(await db.query('select fit from marriage.pair_fit($1,$2)',[a.id,b.id])).rows[0].fit;assert.deepEqual(fit,describeFit({...a.profile,id:a.id},{...b.profile,id:b.id}).fit);return fit;};
  const unknown=await compare();assert.deepEqual(unknown.criteria,{covered:0,total:3});assert.equal(unknown.percentage,100);
  let mismatchPercentage;
  for(let i=1;i<=8;i++){
   await save(b,{marriageBasics:{skinTone:'tone_'+i,dressStyle:'niqab',dressFlexibility:'keep'}});
   const fit=await compare();assert.deepEqual(fit.criteria,{covered:3,total:3});
   if(i===2)mismatchPercentage=fit.percentage;if(i>2)assert.equal(fit.percentage,mismatchPercentage);
  }
  await save(b,{marriageBasics:{skinTone:'tone_1',dressStyle:'hijab',dressFlexibility:'open_to_discussion'}});assert.equal((await compare()).percentage,100);
 }finally{await db.close()}
});

test('unrecognized appearance values, empty requirements and arbitrary avatar URLs fail atomically',async()=>{
 const db=await createDatabase();try{
  const {add,call}=setup(db),a=await add('woman',{marriageBasics:appearance,publicAvatar:avatar});
  const bad=[{marriageBasics:{skinTone:'tone_9'}},{marriageBasics:{dressStyle:'inferred'}},{marriageBasics:{dressFlexibility:true}},
   {partnerCriteria:{skinTone:{mode:'require',values:[]}}},{partnerCriteria:{skinTone:{mode:'prefer',values:['tone_1','tone_1']}}},
   {partnerCriteria:{dressStyle:{mode:'require',values:['invented']}}},{partnerCriteria:{dressFlexibility:{mode:'require',target:'will_change'}}},
   {publicAvatar:{style:'hijab'}},{publicAvatar:{style:'niqab',skinTone:'tone_9'}},{publicAvatar:{...avatar,url:'https://example.test/private'}},
   {publicAvatar:'https://example.test/photo.jpg'},{appearanceVersion:'unknown'}];
  for(const extra of bad)await assert.rejects(call(a,'public.marriage_apply($1)',[{...a.profile,...extra,consentVersion:'2026-11-06-assessment'}]));
  const own=(await db.query('select marriage.profile_json($1) p',[a.id])).rows[0].p;assert.deepEqual(own.marriageBasics,appearance);assert.deepEqual(own.publicAvatar,avatar);
 }finally{await db.close()}
});

test('explicit openness to change is distinct from discussion and never assumes a current dress change',async()=>{
 const db=await createDatabase();try{
  const {add,save,approve}=setup(db),a=await add('man'),b=await add('woman',{marriageBasics:{dressStyle:'niqab',dressFlexibility:'open_to_discussion'}});
  for(const target of ['open_to_discussion','open_to_change']){
   for(const mode of ['require','prefer']){
    await save(a,{partnerCriteria:{dressFlexibility:{mode,target}}});
    for(const answer of ['open_to_discussion','open_to_change','keep','prefer_not_to_say',undefined]){
     const basics={dressStyle:'niqab'};if(answer!==undefined)basics.dressFlexibility=answer;
     const state=await save(b,{marriageBasics:basics});await approve(b);
     assert.equal(state.profile.marriageBasics.dressFlexibility,answer);
     const known=answer!==undefined&&answer!=='prefer_not_to_say';
     const matches=answer==='open_to_change'||target==='open_to_discussion'&&answer==='open_to_discussion';
     const expected=mode==='prefer'||matches;
     for(const ids of [[a.id,b.id],[b.id,a.id]])assert.equal((await db.query('select marriage.compatible($1,$2) ok',ids)).rows[0].ok,expected);
     assert.equal(comparePreferences({...a.profile,id:a.id},{...b.profile,id:b.id})!==null,expected);
     const fit=(await db.query('select fit from marriage.pair_fit($1,$2)',[a.id,b.id])).rows[0].fit;
     assert.deepEqual(fit,describeFit({...a.profile,id:a.id},{...b.profile,id:b.id}).fit);
     if(mode==='prefer')assert.deepEqual(fit.criteria,{covered:known?1:0,total:1});
    }
   }
  }
  await save(a,{partnerCriteria:{dressStyle:{mode:'require',values:['uncovered']},dressFlexibility:{mode:'require',target:'open_to_change'}}});
  await save(b,{marriageBasics:{dressStyle:'niqab',dressFlexibility:'open_to_change'}});await approve(b);
  assert.equal((await db.query('select marriage.compatible($1,$2) ok',[a.id,b.id])).rows[0].ok,false);
  assert.equal((await db.query('select dress_style from marriage.member_basics where member_id=$1',[b.id])).rows[0].dress_style,'niqab');
 }finally{await db.close()}
});
