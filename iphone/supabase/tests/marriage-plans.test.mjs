import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember} from './harness.mjs';
import {validMarriageBasics} from '../../src/compatibility/marriage.ts';
import {marriagePlanQuestions} from '../../src/compatibility/marriagePlans.ts';
import catalog from '../../src/compatibility/catalog.json' with {type:'json'};

test('public plans validate equally, survive save/export and clear without changing old assessment answers',async()=>{
 const db=await createDatabase();
 try {
  const plans={originCity:'الطائف',weddingStyle:'simple',childrenTiming:'after_one_two_years',housingPlan:'independent',expenseSharing:'equal'};
  const sqlValid=async value=>(await db.query('select marriage.public_plans_valid($1) as valid',[value])).rows[0].valid;
  assert.equal(await sqlValid(plans),true);assert.equal(validMarriageBasics(plans),true);
  for(const [key,q] of Object.entries(marriagePlanQuestions)) {
   for(const value of Object.keys(q.options)) {
    assert.equal(await sqlValid({[key]:value}),true);
    assert.equal(validMarriageBasics({[key]:value}),true);
    assert.equal((await db.query('select marriage.interview_profile_values_valid($1) as valid',[{fieldId:`marriageBasics.${key}`,values:[value],mode:null,exclude:false}])).rows[0].valid,true);
   }
   for(const value of ['invalid','__proto__',null,7,{}]) {
    assert.equal(await sqlValid({[key]:value}),false);
    assert.equal(validMarriageBasics({[key]:value}),false);
   }
  }
  for(const value of ['', ' ', 'x'.repeat(81),'https://example.com',null]) {
   assert.equal(await sqlValid({originCity:value}),false);assert.equal(validMarriageBasics({originCity:value}),false);
  }
  const user={id:randomUUID(),sessionId:randomUUID(),email:`${randomUUID()}@example.test`};
  await addUser(db,user);
  const surveyAnswers=Object.fromEntries(catalog.dimensions.flatMap(d=>[[d.id,d.options[0].code],[d.partnerId,d.options[0].code]]));
  const profile={displayName:'عضو تجريبي',gender:'woman',birthDate:'1997-01-01',age:29,city:'الرياض',profession:'مهندس',bio:'نبذة عامة',contact:user.email,preferredMinAge:25,preferredMaxAge:40,familyPreference:'بعد التعارف الأول',assessmentVersion:catalog.version,surveyAnswers,marriageBasics:plans,consentVersion:'2026-11-06-assessment'};
  const call=(fn,args=[])=>asMember(db,user.id,user.sessionId,async()=>(await db.query(`select ${fn} as value`,args)).rows[0].value);
  // Seed an existing account through the historical writer; new-account interview
  // attestation is exercised by required-assessment.test.mjs, not bypassed in production.
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user.id,role:'authenticated',session_id:user.sessionId})]);
  await db.query('select marriage.apply_profile_before_onboarding_consent($1)',[{...profile,marriageBasics:{}}]);
  await db.query("select set_config('request.jwt.claims','',false)");
  const saved=await call('public.marriage_apply($1)',[profile]);
  assert.deepEqual(saved.profile.marriageBasics,plans);
  assert.deepEqual(saved.profile.surveyAnswers,surveyAnswers);
  const evidence=async()=>(await db.query('select marriage.deep_evidence($1) as value',[user.id])).rows[0].value;
  const before=await evidence();
  const planEntries=before.entries.filter(e=>e.key.startsWith('profile:'));
  assert.equal(planEntries.length,4);
  for(const [key,q] of Object.entries(marriagePlanQuestions))assert.equal(planEntries.find(e=>e.key===`profile:${key}`).answer,q.options[plans[key]]);
  assert.equal(JSON.stringify(before).includes('الطائف'),false,'origin city must not enter AI evidence');
  assert.equal(before.entries.some(e=>e.key.includes('beena')),false);
  await call('public.marriage_apply($1)',[{...profile,marriageBasics:{...plans,expenseSharing:'proportional'}}]);
  assert.notDeepEqual(await evidence(),before,'editing a plan invalidates the report fingerprint');
  await call('public.marriage_apply($1)',[profile]);

  assert.deepEqual((await call('public.marriage_personal_data()')).profile.marriageBasics,plans);
  assert.deepEqual((await db.query('select marriage.basics_json($1) as value',[user.id])).rows[0].value,plans);
  await asMember(db,user.id,user.sessionId,()=>assert.rejects(db.query('select marriage.public_plans_valid($1)',[plans]),/permission denied/));
  await assert.rejects(call('public.marriage_apply($1)',[{...profile,marriageBasics:{expenseSharing:'invalid'}}]));
  const old={...profile};delete old.marriageBasics;
  assert.deepEqual((await call('public.marriage_apply($1)',[old])).profile.marriageBasics,plans);
  assert.deepEqual((await call('public.marriage_apply($1)',[{...profile,marriageBasics:{}}])).profile.marriageBasics,{});
  assert.equal((await evidence()).entries.some(e=>e.key.startsWith('profile:')),false);
 } finally {await db.close();}
});
