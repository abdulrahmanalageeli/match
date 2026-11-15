import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';
import {initialInterviewDocument} from '../../api/_lib/interview.mjs';
import preferences from '../../src/compatibility/catalog.json' with {type:'json'};
import personality from '../../src/compatibility/personality-catalog.json' with {type:'json'};

test('private birthday drives age, rejects underage signup, and survives account reload',async()=>{
 const db=await createDatabase();
 try {
  const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};
  await addUser(db,u);
  const call=(q,args=[])=>asMember(db,u.id,u.sessionId,async()=> (await db.query('select '+q+' value',args)).rows[0].value);
  const p={displayName:'مثال',age:99,gender:'woman',city:'الرياض',profession:'مهندسة',bio:'نبذة',contact:u.email,
   preferredMinAge:18,preferredMaxAge:65,familyPreference:'من البداية',consentVersion:'2026-11-07-privacy',
   signupConsents:{version:'2026-11-07-privacy',adult:true,terms:true,privacy:true,sensitiveProfile:false,sensitivePublication:false,assessment:true,photo:false},
   education:'بكالوريوس',marriageIntent:'تعارف جاد يهدف إلى الزواج',lookingFor:'شريك متفاهم',lifeTogether:'حياة متوازنة',valuesStatement:'التفاهم والاحترام',appearanceVersion:'appearance-v1',assessmentVersion:'marriage-v2',personalityVersion:'personality-v1',hardRequirements:[],priorityCategories:[],
   marriageBasics:{heightCm:165,weightKg:65,spokenLanguages:['العربية'],preferredLanguage:'العربية',languageOpenness:'flexible',nationality:'سعودي',maritalStatus:'never_married',polygynyPreference:'not_open',childrenCount:0,smoking:'never',marriageTimeline:'when_ready',meetingPreference:'discuss_together'},
   partnerCriteria:Object.fromEntries(['sharedLanguage','height','weight','nationality','education','profession','maritalStatus','children','smoking'].map(k=>[k,{mode:'any'}])),
   surveyAnswers:Object.fromEntries(preferences.dimensions.flatMap(d=>[[d.id,d.options[0].code],[d.partnerId,d.options[0].code]])),personalityAnswers:Object.fromEntries(personality.map(p=>[p.id,'C']))};
  // Exercise real new-account gates, then test birthdays after a trusted provider
  // failure has explicitly permitted complete manual assessment answers.
  await assert.rejects(call('public.marriage_apply($1)',[{...p,birthDate:'1998-01-01'}]),/أكمل جلسة/);
  let interview=await call("public.marriage_interview('start',$1,null)",[{consentVersion:'wudayn-interview-v1',document:initialInterviewDocument(true)}]);
  interview=await call("public.marriage_interview('save',$1,null)",[{expectedRevision:interview.revision,document:{...interview.document,pendingAnalysis:true}}]);
  const attest='public.marriage_interview_attest($1,null,$2,\'fallback\',\'unavailable\')';
  await assert.rejects(call(attest,[u.id,interview.revision]),/permission denied/);
  await asService(db,()=>db.query('select '+attest,[u.id,interview.revision]));
  await assert.rejects(call('public.marriage_apply($1)',[p]),/تاريخ ميلاد/);
  await assert.rejects(call('public.marriage_apply($1)',[{...p,birthDate:'2020-01-01'}]),/١٨/);
  await assert.rejects(call('public.marriage_apply($1)',[{...p,birthDate:'2001-02-29'}]),/غير صالح/);
  const result=await call('public.marriage_apply($1)',[{...p,birthDate:'1998-01-01'}]);
  const expected=(await db.query("select marriage.birthday_age('1998-01-01') age")).rows[0].age;
  assert.equal(result.profile.age,expected);
  assert.equal(result.profile.birthDate,'1998-01-01');
  assert.equal((await call('public.marriage_state()')).profile.birthDate,'1998-01-01');
  await assert.rejects(asMember(db,u.id,u.sessionId,()=>db.query('select * from marriage.member_birth_dates')),/permission denied/);
  const snapshot=(await db.query('select marriage.public_profile_snapshot($1) value',[u.id])).rows[0].value;
  assert.equal(JSON.stringify(snapshot).includes('1998-01-01'),false);
  await db.query('update marriage.profiles set age=20 where member_id=$1',[u.id]);
  await db.query('select marriage.refresh_birthday_ages()');
  assert.equal((await db.query('select age from marriage.profiles where member_id=$1',[u.id])).rows[0].age,expected);
  assert.equal((await db.query("select marriage.birthday_age('2004-02-29','2026-02-28') age")).rows[0].age,21);
 } finally {await db.close();}
});
