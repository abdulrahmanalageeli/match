import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createDatabase, addUser, asMember } from './harness.mjs';
import { canonicalEducation, canonicalProfession, educationOptions, professionOptions, professionAliases } from '../../src/profile/profileOptions.ts';

const catalog=JSON.parse(await readFile(new URL('../../src/compatibility/catalog.json',import.meta.url),'utf8'));
const education='بكالوريوس', profession='الهندسة والعمارة';
const choices={version:'2026-11-07-privacy',adult:true,terms:true,privacy:true,sensitiveProfile:true,sensitivePublication:true,assessment:true,photo:false};
const criteria={education:{mode:'prefer',values:[education]},profession:{mode:'prefer',values:[profession]}};

test('structured criteria roundtrip, weighting, missing facts, discovery and canonical location stay consistent',async()=>{
 const db=await createDatabase();
 const sql=async(query,args=[])=>(await db.query(query,args)).rows;
 const rpc=async(query,args=[])=>(await sql('select '+query+' value',args))[0].value;
 const call=(u,query,args=[])=>asMember(db,u.id,u.sessionId,()=>rpc(query,args));
 const records=[];
 async function add(gender,patch={}){
  const user={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};
  await addUser(db,user);
  const answers=Object.fromEntries(catalog.dimensions.flatMap(d=>[[d.id,'A'],[d.partnerId,'A']]));
  user.profile={displayName:'مثال',age:30,city:'الرياض',gender,profession:'مهندسة مدنية',education:'بكالوريوس هندسة',bio:'نبذة',contact:user.email,
   preferredMinAge:25,preferredMaxAge:40,familyPreference:'',consentVersion:choices.version,signupConsents:choices,
   appearanceVersion:'appearance-v1',assessmentVersion:'marriage-v2',surveyAnswers:answers,hardRequirements:[],priorityCategories:[],
   personalityAnswers:{},personalityVersion:'personality-v1',marriageBasics:{heightCm:165,weightKg:62,childrenCount:0},partnerCriteria:{},...patch};
  await call(user,'public.marriage_apply($1)',[user.profile]);
  await db.query("update marriage.members set review_status='approved',manual_access_until=now()+interval '1 day' where id=$1",[user.id]);
  records.push(user);return user;
 }
 try{
  const examples=[...educationOptions.map(v=>['education',v.value]),...professionOptions.map(v=>['profession',v.value]),
   ...Object.values(professionAliases).flat().map(v=>['profession',v]),
   ...['بكالوريوس هندسة','ثانوية عامة','دبلوم عالي إدارة','دكتور صيدلة','بكالوريوس قيد الدراسة','ماجستير لم أكمل','تعليم غير معروف',''].map(v=>['education',v]),
   ['profession','مهنة غير معروفة']];
  const normalized=await sql("select value->>0 kind,value->>1 original,case value->>0 when 'education' then marriage.canonical_education(value->>1) else marriage.canonical_profession(value->>1) end canonical from jsonb_array_elements($1)",[examples]);
  for(const row of normalized)assert.equal(row.canonical,row.kind==='education'?canonicalEducation(row.original):canonicalProfession(row.original),row.original);
  const norm=payload=>rpc("marriage.normalize_marriage_extras('{}',$1,'{}','personality-v1')",[payload]);
  assert.deepEqual((await norm(criteria)).partnerCriteria,criteria);
  for(const invalid of [
   {education:{mode:'require',values:[]}}, {education:{mode:'require',values:['بكالوريوس هندسة']}},
   {profession:{mode:'prefer',values:['مهندسة مدنية']}}, {education:{mode:'prefer',values:[education,education]}},
   {education:{mode:'prefer',values:[null]}}, {profession:{mode:'require',values:[profession],exclude:true}},
   {education:{mode:'invalid',values:[education]}}, {profession:null},
  ])await assert.rejects(norm(invalid));
  assert.deepEqual((await norm({education:{mode:'any',values:[]}})).partnerCriteria,{education:{mode:'any'}});

  const man=await add('man',{city:'Riyadh',partnerCriteria:criteria});
  const woman=await add('woman');
  const unknown=await add('woman',{education:'',profession:'مهنة غير معروفة',marriageBasics:{}});
  const hasChildren=await add('woman',{marriageBasics:{heightCm:170,weightKg:70,childrenCount:2}});
  const state=await call(man,'public.marriage_state()');
  assert.deepEqual(state.profile.partnerCriteria,criteria);
  const card=await rpc('marriage.member_card($1,$2)',[man.id,woman.id]);
  assert.equal(card.education,'بكالوريوس هندسة');assert.equal(card.occupation,'مهندسة مدنية');assert.equal(card.partnerCriteria,undefined);
  assert.equal(await rpc('marriage.compatible($1,$2)',[man.id,woman.id]),true,'city aliases establish the same actual city');
  let preferred=(await sql('select * from marriage.preferred_criteria($1,$2)',[man.id,woman.id]))[0];
  assert.deepEqual(preferred,{score:1,covered:2,total:2});
  let fit=(await sql('select fit from marriage.pair_fit($1,$2)',[man.id,woman.id]))[0].fit;
  assert.equal(fit.percentage,100);
  await db.query("update marriage.profiles set profession='طبيبة' where member_id=$1",[woman.id]);
  preferred=(await sql('select * from marriage.preferred_criteria($1,$2)',[man.id,woman.id]))[0];
  assert.deepEqual(preferred,{score:0.5,covered:2,total:2});
  fit=(await sql('select fit from marriage.pair_fit($1,$2)',[man.id,woman.id]))[0].fit;
  assert.equal(fit.percentage,95,'explicit preferences retain the existing 20% directional weighting');
  assert.equal(await rpc("marriage.criterion_fit($1,$2,'education',$3)",[man.id,unknown.id,criteria.education]),null);
  assert.equal(await rpc("marriage.criterion_fit($1,$2,'profession',$3)",[man.id,unknown.id,criteria.profession]),null);
  await db.query("update marriage.partner_criteria set rule=jsonb_set(rule,'{mode}','\"require\"') where member_id=$1",[man.id]);
  assert.equal(await rpc('marriage.criteria_accepted($1,$2)',[man.id,woman.id]),false);
  assert.equal(await rpc('marriage.criteria_accepted($1,$2)',[man.id,unknown.id]),false);
  await db.query("update marriage.profiles set profession='مهندسة مدنية' where member_id=$1",[woman.id]);
  assert.equal(await rpc('marriage.criteria_accepted($1,$2)',[man.id,woman.id]),true);
  await db.query("insert into marriage.partner_criteria values($1,'education',$2)",[woman.id,{mode:'require',values:['دكتوراه']}]);
  assert.equal(await rpc('marriage.criteria_accepted($1,$2)',[man.id,woman.id]),false,'requirements apply in both directions');
  await db.query('delete from marriage.partner_criteria where member_id=any($1)',[[man.id,woman.id]]);

  const browse=async options=>(await call(man,'public.marriage_browse($1)',[{mode:'all',...options}])).map(p=>p.id);
  assert((await browse({})).includes(unknown.id),'missing optional facts remain browseable without filters');
  assert.deepEqual(new Set(await browse({education,profession})),new Set([woman.id,hasChildren.id]));
  assert.deepEqual(await browse({minHeight:160,maxHeight:165,minWeight:60,maxWeight:65,children:'none'}),[woman.id]);
  assert.deepEqual(await browse({children:'has'}),[hasChildren.id]);
  assert(!(await browse({minHeight:120})).includes(unknown.id));
  assert(!(await browse({maxWeight:250})).includes(unknown.id));
  for(const bad of [{education:'غير معروف'},{profession:'مهندس'},{minHeight:119},{maxHeight:231},{minWeight:34},{maxWeight:251},{minHeight:170,maxHeight:160},{minHeight:'160'},{children:'maybe'}])await assert.rejects(browse(bad));

  await db.query("insert into marriage.cities(label) values('مدينة أخرى داخل السعودية') on conflict(label) do nothing");
  await db.query("update marriage.profiles set city_id=(select id from marriage.cities where label='مدينة أخرى داخل السعودية') where member_id=any($1)",[[man.id,woman.id]]);
  assert.equal(await rpc('marriage.compatible($1,$2)',[man.id,woman.id]),false,'the same unspecified bucket does not establish the same city');
  await db.query("update marriage.member_answers set option_code='B' where member_id=$1 and question_code='residence_plan'",[woman.id]);
  assert.equal(await rpc('marriage.compatible($1,$2)',[man.id,woman.id]),true,'explicit relocation choices may establish a shared future city');

  for(const fn of ['profile_choice_key(text)','structured_profile_choices(text)','canonical_education(text)','canonical_profession(text)','structured_profile_value(text,text)','normalize_structured_criteria(jsonb)']){
   assert.equal(await rpc("has_function_privilege('anon',$1,'execute')",['marriage.'+fn]),false);
   assert.equal(await rpc("has_function_privilege('authenticated',$1,'execute')",['marriage.'+fn]),false);
  }
 }finally{await db.close();}
});
