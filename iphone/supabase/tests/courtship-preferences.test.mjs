import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, addUser, asMember } from './harness.mjs';

const choices={version:'2026-11-06-onboarding',adult:true,terms:true,privacy:true,sensitiveProfile:false,assessment:true,photo:false};
const selected={marriageTimeline:'within_3_months',meetingPreference:'public_before_formal'};
const timelines=['within_3_months','three_to_six_months','six_to_twelve_months','over_a_year','when_ready'];
const meetings=['public_before_formal','family_before_formal','after_formal','discuss_together'];
const profile={displayName:'عضو تجريبي',age:29,gender:'man',city:'الرياض',profession:'مهندس',bio:'نبذة',contact:'courtship@example.test',
 preferredMinAge:25,preferredMaxAge:40,familyPreference:'',appearanceVersion:'appearance-v1',assessmentVersion:'marriage-v2',consentVersion:choices.version,
 marriageBasics:{},partnerCriteria:{},surveyAnswers:{marriage_timeline:'A',partner_marriage_timeline:'B'},personalityAnswers:{},personalityVersion:'personality-v1',
 hardRequirements:[],priorityCategories:[],signupConsents:choices};

test('optional courtship choices save, survive profile edits and appear on member cards without exposing assessment answers',async()=>{
 const db=await createDatabase();try{
  const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};await addUser(db,u);
  const rpc=async(sql,args=[])=>(await db.query('select '+sql+' value',args)).rows[0].value;
  let current=profile;
  const save=async patch=>{
   const next={...current,...patch};
   const result=await asMember(db,u.id,u.sessionId,()=>rpc('public.marriage_apply($1)',[next]));
   current=next;return result;
  };
  const initial=await save(profile);
  assert.deepEqual(initial.profile.marriageBasics,{},'Existing formal-step answers must not become a public marriage timeline');
  const saved=await save({marriageBasics:selected});
  assert.deepEqual(saved.profile.marriageBasics,selected);
  assert.deepEqual(saved.profile.surveyAnswers,profile.surveyAnswers,'Public choices never alter formal-step preferences');
  const resumed=await asMember(db,u.id,u.sessionId,()=>rpc('public.marriage_state()'));
  assert.deepEqual(resumed.profile.marriageBasics,selected);
  const card=await rpc('marriage.member_card($1,$1)',[u.id]);
  assert.deepEqual(card.marriageBasics,selected);
  assert.equal(card.surveyAnswers,undefined);assert.equal(card.partnerCriteria,undefined);
  assert.deepEqual((await save({bio:'نبذة معدلة'})).profile.marriageBasics,selected,'An unrelated profile edit preserves choices');
  assert.deepEqual((await save({marriageBasics:{}})).profile.marriageBasics,{},'Removing the choices clears public values');
  assert.deepEqual((await rpc('marriage.member_card($1,$1)',[u.id])).marriageBasics,{});
  for(const value of timelines)assert.equal((await rpc("marriage.normalize_marriage_extras($1,'{}','{}','personality-v1')",[{marriageTimeline:value}])).marriageBasics.marriageTimeline,value);
  for(const value of meetings)assert.equal((await rpc("marriage.normalize_marriage_extras($1,'{}','{}','personality-v1')",[{meetingPreference:value}])).marriageBasics.meetingPreference,value);
  for(const bad of [{marriageTimeline:'A'},{meetingPreference:'private_place'},{marriageTimeline:3},{meetingPreference:null},{unexpectedChoice:'yes'}]){
   await assert.rejects(save({marriageBasics:bad}));
  }
  for(const name of ['normalize_marriage_extras(jsonb,jsonb,jsonb,text)','basics_json(uuid)']){
   assert.equal(await rpc("has_function_privilege('anon',$1,'EXECUTE')",['marriage.'+name]),false);
   assert.equal(await rpc("has_function_privilege('authenticated',$1,'EXECUTE')",['marriage.'+name]),false);
  }
 }finally{await db.close();}
});

test('private tester profile writer validates and retains public choices across saved state and partner views',async()=>{
 const db=await createDatabase();try{
  // Exercise the consent/profile layer directly. PGlite reports WASM memory
  // errors through the full outer RPC wrapper chain even without this migration.
  const rpc=async(action,token,payload={})=>{
   try{return (await db.query('select nisfayn_test.rpc_before_beena($1,$2,$3) value',[action,token,payload])).rows[0].value;}
   catch(error){error.message=action+': '+error.message;throw error;}
  };
  const a='a'.repeat(64),b='b'.repeat(64);await rpc('login',a,{actor:'abdulrahman'});await rpc('login',b,{actor:'reham'});
  const save=async next=>rpc('profile',a,{profile:next,expectedRevision:(await rpc('state',a)).profileRevision});
  const saved=await save({...profile,marriageBasics:selected});
  assert.deepEqual(saved.profiles.abdulrahman.marriageBasics,selected);
  assert.deepEqual((await rpc('state',b)).profiles.abdulrahman.marriageBasics,selected);
  await assert.rejects(save({...profile,marriageBasics:{meetingPreference:'invalid'}}));
  assert.deepEqual((await rpc('state',a)).profiles.abdulrahman.marriageBasics,selected,'Rejected input must not alter prior choices');
  assert.deepEqual((await save({...profile,marriageBasics:{}})).profiles.abdulrahman.marriageBasics,{});
 }finally{await db.close();}
});
