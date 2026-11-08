import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createDatabase, addUser, asMember, asService } from './harness.mjs';

const catalog=JSON.parse(await readFile(new URL('../../src/compatibility/catalog.json',import.meta.url),'utf8'));
const migration=await readFile(new URL('../migrations/20261108095104_assessment_private_refresh.sql',import.meta.url),'utf8');

test('successful assessments wake both sides privately without changing score rules or save permissions',async()=>{
 const db=await createDatabase({throughMigration:'20261108091929_preference_evidence.sql'});
 const rpc=async(query,args=[])=>(await db.query('select '+query+' value',args)).rows[0].value;
 const call=(u,query,args=[])=>asMember(db,u.id,u.sessionId,()=>rpc(query,args));
 const apply=(u,patch={})=>call(u,'public.marriage_apply($1)',[{...u.profile,...patch}]);
 const fit=async(a,b)=>(await db.query('select * from marriage.pair_fit($1,$2)',[a.id,b.id])).rows[0];
 const events=async()=>(await db.query("select topic,event,private,payload-'id' payload from realtime.messages order by topic")).rows;
 async function member(gender){
  const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};
  await addUser(db,u);
  const signupConsents={version:'2026-11-07-privacy',adult:true,terms:true,privacy:true,sensitiveProfile:true,sensitivePublication:true,assessment:true,photo:false};
  u.profile={displayName:'عضو مثال',age:30,city:'الرياض',gender,profession:'مهندس',education:'بكالوريوس',bio:'نبذة',contact:u.email,
   preferredMinAge:25,preferredMaxAge:40,familyPreference:'',consentVersion:signupConsents.version,signupConsents,
   appearanceVersion:'appearance-v1',assessmentVersion:'marriage-v2',
   surveyAnswers:Object.fromEntries(catalog.dimensions.flatMap(d=>[[d.id,'A'],[d.partnerId,'A']])),
   hardRequirements:[],priorityCategories:[],personalityAnswers:{},personalityVersion:'personality-v1',marriageBasics:{}};
  await apply(u);
  await asService(db,()=>rpc("public.marriage_review($1,'approve')",[u.id]));
  await db.query("update marriage.members set manual_access_until=now()+interval '2 days' where id=$1",[u.id]);
  u.profile=(await call(u,'public.marriage_state()')).profile;
  return u;
 }
 try{
  const a=await member('man'),b=await member('woman'),intro=await member('woman'),unrelated=await member('woman');
  await db.query("insert into marriage.member_requests(requester_id,recipient_id,status) values($1,$2,'accepted')",[a.id,b.id]);
  await db.query('insert into marriage.introductions(member_a,member_b) values(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid))',[a.id,intro.id]);
  await db.query("insert into marriage.member_requests(requester_id,recipient_id,status) values($1,$2,'closed')",[a.id,unrelated.id]);
  await db.exec('truncate realtime.messages');
  const beforeResult=await apply(a),beforeFit=await fit(a,b);
  assert.deepEqual(await events(),[],'The old save path had no refresh signal');
  const permissions=await rpc("jsonb_build_object('anon',has_function_privilege('anon','marriage.apply_profile(jsonb)','execute'),'authenticated',has_function_privilege('authenticated','marriage.apply_profile(jsonb)','execute'),'service',has_function_privilege('service_role','marriage.apply_profile(jsonb)','execute'))");
  await db.exec(migration);
  assert.deepEqual(await apply(a),beforeResult,'Existing save response and review lifecycle stay unchanged');
  assert.deepEqual(await fit(a,b),beforeFit,'The wake-up does not change scoring');
  assert.deepEqual(await events(),[a,b,intro].map(u=>({topic:'marriage:member:'+u.id,event:'changed',private:true,payload:{}})).sort((x,y)=>x.topic.localeCompare(y.topic)),
   'Only self, accepted partner and an open introduction receive an empty private signal');
  assert.deepEqual(await rpc("jsonb_build_object('anon',has_function_privilege('anon','marriage.apply_profile(jsonb)','execute'),'authenticated',has_function_privilege('authenticated','marriage.apply_profile(jsonb)','execute'),'service',has_function_privilege('service_role','marriage.apply_profile(jsonb)','execute'))"),permissions);

  await db.exec('truncate realtime.messages');
  const dimension=catalog.dimensions[0];
  const changedAnswers={...b.profile.surveyAnswers,[dimension.partnerId]:'B'};
  await apply(b,{surveyAnswers:changedAnswers});
  assert.deepEqual((await events()).map(e=>e.topic),[a,b].map(u=>'marriage:member:'+u.id).sort(),'Saving from the other side wakes both members');
  const changedFit=await fit(a,b);
  assert.notDeepEqual(changedFit,beforeFit,'The next read recomputes changed answers');
  assert.equal(changedFit.fit.preferenceEvidence.topics.find(t=>t.id===dimension.id).status,'one_sided');

  await db.exec('truncate realtime.messages');
  await assert.rejects(apply(b,{age:17}));
  assert.deepEqual(await events(),[],'Rejected saves cannot emit a refresh');
  assert.deepEqual(await fit(a,b),changedFit,'Rejected saves leave compatibility unchanged');
  await db.query('delete from auth.sessions where id=$1',[b.sessionId]);
  await assert.rejects(apply(b));
  assert.deepEqual(await events(),[],'Invalid sessions cannot emit a refresh');
  await db.query('insert into auth.sessions values($1,$2,null)',[b.sessionId,b.id]);

  await db.exec("create or replace function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language plpgsql as $$begin raise exception 'simulated Realtime outage';end$$");
  await apply(b);
  assert.deepEqual(await fit(a,b),beforeFit,'A valid save still commits when Realtime is temporarily unavailable');
 }finally{await db.close();}
});
