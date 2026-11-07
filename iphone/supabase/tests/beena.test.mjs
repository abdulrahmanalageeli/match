import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';
import {beenaScenarios,compareBeena,beenaRankMultiplier} from '../../src/beena/model.ts';

const version='2026-11-06-onboarding';
const essential={version,adult:true,terms:true,privacy:true,sensitiveProfile:false,assessment:false,photo:false};
const all={...essential,sensitiveProfile:true,assessment:true,photo:true};
const full=(self='A',partner=['B'])=>({version:'beena-v1',answers:Object.fromEntries(beenaScenarios.map(s=>[s.id,{self,partner}]))});
const story=(share=false,text='نناقش ما يهمنا بهدوء قبل أن نتخذ قرارًا.')=>({scenarioId:'family_boundaries',text,share});
function setup(db){
 const rpc=async(sql,args=[])=>(await db.query('select '+sql+' value',args)).rows[0].value;
 const call=(u,sql,args=[])=>asMember(db,u.id,u.sessionId,()=>rpc(sql,args));
 async function member(gender='man'){
  const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};await addUser(db,u);
  u.profile={displayName:'عضو تجريبي',age:29,gender,city:'الرياض',profession:'مهندس',bio:'نبذة اختيارية',contact:u.email,
   preferredMinAge:25,preferredMaxAge:40,familyPreference:'',appearanceVersion:'appearance-v1',assessmentVersion:'marriage-v2',consentVersion:version,
   marriageBasics:{},partnerCriteria:{},surveyAnswers:{},personalityAnswers:{},personalityVersion:'personality-v1',hardRequirements:[],priorityCategories:[],signupConsents:all};
  return u;
 }
 const save=(u,patch={})=>call(u,'public.marriage_apply($1)',[{...u.profile,...patch}]);
 const approve=u=>asService(db,()=>rpc("public.marriage_review($1,'approve')",[u.id]));
 const pair=(action,token,payload={})=>asService(db,()=>rpc('public.nisfayn_test_rpc($1,$2,$3)',[action,token,payload]));
 return{rpc,call,member,save,approve,pair};
}

test('Beena SQL/catalog exactly match the client: complementary preferences, unequal weights, partial answers and Unicode',async()=>{
 const db=await createDatabase();try{
  const{rpc}=setup(db);
  const catalog=(await db.query('select id,title,prompt from marriage.beena_scenarios order by ordinal')).rows;
  assert.deepEqual(catalog,beenaScenarios.map(({id,title,prompt})=>({id,title,prompt})));
  const a=full(),b=full('B',['A']);a.answers.conflict={self:'A',partner:['A'],importance:2};
  b.answers.career={self:'B',partner:['B'],importance:2};
  for(let n=0;n<28;n++){
   const x=structuredClone(a),y=structuredClone(b);
   for(let i=0;i<6;i++){
    const id=beenaScenarios[i].id;
    if(n<6 && i>n)delete x.answers[id];
    else{x.answers[id].self='ABCD'[(n+i)%4];x.answers[id].partner=['ABCD'[(n+i+1)%4],'ABCD'[(n+i+2)%4]];x.answers[id].importance=(i+n)%2+1;}
    if(n===7)y.answers[id]={self:'B',partner:[]};
   }
   assert.deepEqual(await rpc('marriage.compare_beena($1,$2)',[x,y]),compareBeena(x,y));
   assert.deepEqual(await rpc('marriage.compare_beena($1,$2)',[y,x]),compareBeena(y,x));
  }
  assert.equal((await rpc('marriage.compare_beena($1,$2)',[full(),full('B',['A'])])).percentage,100);
  assert.equal((await rpc('marriage.compare_beena($1,$2)',[full(),full()])).percentage,0);
  assert.equal((await rpc('marriage.compare_beena($1,$2)',[null,full()])).percentage,null);
  const draft={version:'beena-v1',answers:{support:{partner:[],importance:2}},story:story(false,'😀'.repeat(500))};
  assert.deepEqual(await rpc('marriage.normalize_beena($1)',[draft]),draft);
  for(const invalid of [
   {...draft,version:'future'}, {...draft,extra:true}, {...draft,answers:{unknown:{self:'A'}}},
   {...draft,answers:{support:{self:'Z'}}}, {...draft,answers:{support:{partner:['A','A']}}},
   {...draft,answers:{support:{importance:3}}}, {...draft,answers:{support:{importance:null}}},
   {...draft,answers:{support:{partner:[1]}}}, {...draft,answers:{support:{self:null}}},
   {...draft,story:story(false,'😀'.repeat(501))}, {...draft,story:{...story(),share:'true'}},
  ])await assert.rejects(rpc('marriage.normalize_beena($1)',[invalid]));
 }finally{await db.close();}
});

test('real Beena persists privately with explicit consent, clears on withdrawal, and only publishes reviewed opted-in stories',async()=>{
 const db=await createDatabase();try{
  const{rpc,call,member,save,approve}=setup(db),u=await member(),peer=await member('woman');
  const privateValue={...full(),story:story()};
  await save(u,{signupConsents:essential});
  await assert.rejects(save(u,{signupConsents:undefined,beena:privateValue}),/معالجة التوافق/);
  let state=await save(u,{beena:privateValue});assert.deepEqual(state.profile.beena,privateValue);
  await save(peer,{beena:full('B',['A'])});await approve(u);await approve(peer);
  let card=await rpc('marriage.member_card($1,$2)',[peer.id,u.id]);
  assert.equal(card.beena,undefined);assert.equal(card.beenaStory,undefined);assert.equal(card.fit.beena.percentage,100);
  assert.deepEqual((await call(u,'public.marriage_personal_data()')).profile.beena,privateValue);
  state=await save(u,{signupConsents:undefined,consentVersion:'2026-11-06-assessment'});
  assert.deepEqual(state.profile.beena,privateValue);
  assert.equal((await db.query('select review_status from marriage.members where id=$1',[u.id])).rows[0].review_status,'approved');
  // Optional drafts/answers do not cause re-review or end a connection.
  await db.query("update marriage.members set manual_access_until=now()+interval '1 day' where id in($1,$2)",[u.id,peer.id]);
  await rpc('marriage.ensure_week($1,marriage.current_week())',[u.id]);await rpc('marriage.ensure_week($1,marriage.current_week())',[peer.id]);
  const intro=(await db.query('insert into marriage.introductions(member_a,member_b) values(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid)) returning id',[u.id,peer.id])).rows[0].id;
  const sharedValue={...privateValue,story:story(true)};
  await save(u,{beena:sharedValue});
  assert.equal((await db.query('select review_status from marriage.members where id=$1',[u.id])).rows[0].review_status,'pending');
  assert.equal((await db.query('select closed_at from marriage.introductions where id=$1',[intro])).rows[0].closed_at,null);
  assert.equal((await rpc('marriage.member_card($1,$2)',[peer.id,u.id])).beenaStory,undefined);
  await assert.rejects(call(peer,'public.marriage_admin_member($1)',[u.id]));
  const staff=await member();
  await db.query("insert into marriage.staff_accounts(user_id,role,display_name) values($1,'reviewer','مراجع')",[staff.id]);
  await asMember(db,staff.id,staff.sessionId,async()=>{
   await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:staff.id,role:'authenticated',session_id:staff.sessionId,aal:'aal2'})]);
   const detail=await rpc('public.marriage_admin_member($1)',[u.id]);
   assert.deepEqual(detail.beenaStory,{scenarioId:story().scenarioId,text:story().text});assert.equal(detail.beena,undefined);
  });
  await approve(u);
  assert.deepEqual((await rpc('marriage.member_card($1,$2)',[peer.id,u.id])).beenaStory,{scenarioId:story().scenarioId,text:story().text});
  await save(u,{beena:privateValue});assert.equal((await rpc('marriage.member_card($1,$2)',[peer.id,u.id])).beenaStory,undefined);
  assert.equal((await db.query('select review_status from marriage.members where id=$1',[u.id])).rows[0].review_status,'approved');
  state=await save(u,{signupConsents:essential,beena:privateValue});assert.equal(state.profile.beena,null);
  assert.equal((await db.query('select count(*)::int n from marriage.beena_answers where member_id=$1',[u.id])).rows[0].n,0);
  assert.equal((await rpc('marriage.member_card($1,$2)',[peer.id,u.id])).fit.beena.percentage,null);
  await save(u,{beena:privateValue});assert.equal((await save(u,{beena:null})).profile.beena,null);
  await save(u,{beena:privateValue});assert.equal((await save(u,{beena:{version:'beena-v1',answers:{}}})).profile.beena,null);
  for(const role of ['anon','authenticated','service_role']){
   await db.exec('set role '+role);
   try{
    for(const table of ['marriage.beena_answers','marriage.beena_stories','nisfayn_test.beena_answers','nisfayn_test.beena_stories'])await assert.rejects(db.query('select * from '+table),/permission denied/);
    await assert.rejects(db.query('select marriage.beena_json($1)',[u.id]),/permission denied/);
    await assert.rejects(db.query('select marriage.save_beena($1,$2)',[peer.id,privateValue]),/permission denied/);
   }finally{await db.exec('reset role');}
  }
  const rls=(await db.query("select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('marriage','nisfayn_test') and c.relname in('beena_answers','beena_stories','beena_scenarios')")).rows;
  assert.equal(rls.length,5);assert.ok(rls.every(r=>r.relrowsecurity));
  await save(staff,{beena:privateValue});
  await db.query('delete from marriage.members where id=$1',[staff.id]);
  assert.equal((await db.query('select count(*)::int n from marriage.beena_answers where member_id=$1',[staff.id])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from marriage.beena_stories where member_id=$1',[staff.id])).rows[0].n,0);
 }finally{await db.close();}
});

test('server ranking adjusts only complete Beena; baseline percentage and eligibility stay unchanged',async()=>{
 const db=await createDatabase();try{
  const{rpc,member,save,approve}=setup(db),a=await member(),b=await member('woman');
  const answers=Object.fromEntries((await db.query("select question_code,min(code) code from marriage.question_options group by question_code")).rows.map(r=>[r.question_code,r.code]));
  await save(a,{surveyAnswers:answers,beena:full()});await save(b,{surveyAnswers:answers,beena:full('B',['A'])});await approve(a);await approve(b);
  let result=(await db.query('select * from marriage.pair_fit($1,$2)',[a.id,b.id])).rows[0];
  const base=(await db.query('select * from marriage.pair_fit_before_beena($1,$2)',[a.id,b.id])).rows[0];
  assert.ok(base.rank_value>0);assert.equal(result.fit.percentage,base.fit.percentage);
  assert.equal(result.fit.beena.percentage,100);assert.ok(Math.abs(result.rank_value-base.rank_value*beenaRankMultiplier(result.fit.beena))<1e-10);
  const eligible=await rpc('marriage.compatible($1,$2)',[a.id,b.id]);
  await save(b,{surveyAnswers:answers,beena:{version:'beena-v1',answers:{support:{self:'B',partner:['A']}}}});
  result=(await db.query('select * from marriage.pair_fit($1,$2)',[a.id,b.id])).rows[0];
  assert.equal(result.rank_value,base.rank_value);assert.equal(result.fit.beena.percentage,null);
  assert.equal(await rpc('marriage.compatible($1,$2)',[a.id,b.id]),eligible);
  await save(b,{surveyAnswers:answers,beena:full('B',['B'])});
  result=(await db.query('select * from marriage.pair_fit($1,$2)',[a.id,b.id])).rows[0];
  assert.equal(result.fit.beena.percentage,50);assert.equal(result.rank_value,base.rank_value);
 }finally{await db.close();}
});

test('pair RPC gives self private drafts and server aggregate, never peer answers; omission/clear/withdrawal and revisions work',async()=>{
 const db=await createDatabase();try{
  const{rpc,pair}=setup(db),a='a'.repeat(64),b='b'.repeat(64);
  await pair('login',a,{actor:'abdulrahman'});await pair('login',b,{actor:'reham'});
  const save=async(token,profile)=>pair('profile',token,{profile,expectedRevision:(await pair('state',token)).profileRevision});
  const profile={displayName:'اختبار',age:29,marriageBasics:{},partnerCriteria:{},surveyAnswers:{},personalityAnswers:{},signupConsents:all};
  const av={...full(),story:story(false,'قصة خاصة')},bv={...full('B',['A']),story:story(true)};
  await save(a,{...profile,beena:av});let state=await save(b,{...profile,beena:bv});
  assert.deepEqual(state.profiles.reham.beena,bv);assert.equal(state.profiles.abdulrahman.beena,undefined);assert.equal(state.profiles.abdulrahman.beenaStory,undefined);
  assert.deepEqual(state.beenaFit,compareBeena(av,bv));
  state=await pair('state',a);assert.equal(state.profiles.reham.beena,undefined);assert.deepEqual(state.profiles.reham.beenaStory,{scenarioId:story().scenarioId,text:story().text});
  assert.deepEqual(state.profiles.abdulrahman.beena,av);
  assert.equal((await rpc("(select data from nisfayn_test.room where id)"))?.profiles?.abdulrahman?.beena,undefined);
  state=await save(a,{...profile,signupConsents:undefined});assert.deepEqual(state.profiles.abdulrahman.beena,av);
  const revision=state.profileRevision;
  await save(a,{...profile,beena:{...av,story:story(false,'تعديل خاص')}});
  await assert.rejects(pair('profile',a,{profile:{...profile,beena:av},expectedRevision:revision}));
  await assert.rejects(save(a,{...profile,beena:{...av,answers:{conflict:{self:'Z'}}}}));
  state=await save(b,{...profile,signupConsents:essential});assert.equal(state.profiles.reham.beena,null);assert.equal(state.beenaFit.percentage,null);
  assert.equal((await pair('state',a)).profiles.reham.beenaStory,undefined);
  await assert.rejects(save(b,{...profile,signupConsents:undefined,beena:bv}),/معالجة التوافق/);
  state=await save(a,{...profile,beena:{}});assert.equal(state.profiles.abdulrahman.beena,null);
  assert.equal((await db.query('select count(*)::int n from nisfayn_test.beena_answers')).rows[0].n,0);
 }finally{await db.close();}
});
