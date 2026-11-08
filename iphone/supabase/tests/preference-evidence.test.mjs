import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createDatabase, addUser, asMember } from './harness.mjs';
import { describeFit } from '../../src/compatibility/model.ts';

const catalog=JSON.parse(await readFile(new URL('../../src/compatibility/catalog.json',import.meta.url),'utf8'));
const migration=await readFile(new URL('../migrations/20261108091929_preference_evidence.sql',import.meta.url),'utf8');
const consent={version:'2026-11-07-privacy',adult:true,terms:true,privacy:true,sensitiveProfile:true,sensitivePublication:true,assessment:true,photo:false};

test('private preference evidence explains actual answers without changing scores or revealing private values',async()=>{
 const db=await createDatabase({throughMigration:'20261108091131_structured_partner_preferences.sql'});
 const rpc=async(query,args=[])=>(await db.query('select '+query+' value',args)).rows[0].value;
 const profiles=[];
 async function add(gender,patch){
  const user={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};
  await addUser(db,user);
  const surveyAnswers=Object.fromEntries(catalog.dimensions.flatMap(d=>[[d.id,'A'],[d.partnerId,'A']]));
  const profile={displayName:'مثال',age:30,city:'الرياض',gender,profession:'مهنة غير معروفة',education:'ماجستير',bio:'نبذة',contact:user.email,
   preferredMinAge:25,preferredMaxAge:40,familyPreference:'',consentVersion:consent.version,signupConsents:consent,
   appearanceVersion:'appearance-v1',assessmentVersion:'marriage-v2',surveyAnswers,hardRequirements:[],priorityCategories:[],
   personalityAnswers:{},personalityVersion:'personality-v1',marriageBasics:{},...patch};
  await asMember(db,user.id,user.sessionId,()=>rpc('public.marriage_apply($1)',[profile]));
  profiles.push({...profile,id:user.id});return user;
 }
 try{
  const a=await add('man',{partnerCriteria:{
   education:{mode:'prefer',values:['بكالوريوس']},profession:{mode:'prefer',values:['الهندسة والعمارة']},
   height:{mode:'prefer',min:180},children:{mode:'prefer',target:'any'},smoking:{mode:'any'},weight:{mode:'require',min:35},
  }});
  const b=await add('woman',{education:'بكالوريوس هندسة',profession:'طبيبة',partnerCriteria:{
   education:{mode:'prefer',values:['ماجستير']},profession:{mode:'prefer',values:['الطب والرعاية الصحية']},
  }});
  const [oneSided,different,missing]=catalog.dimensions;
  async function answer(index,question,value){
   profiles[index].surveyAnswers[question]=value;
   await db.query('update marriage.member_answers set option_code=$3 where member_id=$1 and question_code=$2',[profiles[index].id,question,value]);
  }
  await answer(0,oneSided.partnerId,'B');
  await answer(0,different.partnerId,'B');await answer(1,different.partnerId,'B');
  const before=(await db.query('select * from marriage.pair_fit($1,$2)',[a.id,b.id])).rows[0];
  assert.equal(before.fit.assessmentComplete,true);assert.equal(typeof before.fit.percentage,'number');
  await db.exec(migration);
  const after=(await db.query('select * from marriage.pair_fit($1,$2)',[a.id,b.id])).rows[0];
  const {preferenceEvidence,...unchangedFit}=after.fit;
  assert.deepEqual({...after,fit:unchangedFit},before,'The explanation must not alter scoring, rank, personality, Beena, or coverage');
  assert.equal(preferenceEvidence.version,'preference-evidence-v1');
  assert.equal(preferenceEvidence.method,'reciprocal-weighted-v1');
  assert.deepEqual(preferenceEvidence.topics.map(topic=>topic.id),catalog.dimensions.map(d=>d.id));
  assert.equal(preferenceEvidence.topics.find(t=>t.id===oneSided.id).status,'one_sided');
  assert.equal(preferenceEvidence.topics.find(t=>t.id===different.id).status,'different');
  assert.equal(preferenceEvidence.topics.filter(t=>t.status==='aligned').length,catalog.dimensions.length-2);
  assert.deepEqual(preferenceEvidence.criteria,{matched:2,different:1,missing:2,total:5});
  assert.deepEqual(preferenceEvidence,describeFit(profiles[0],profiles[1]).fit.preferenceEvidence,'SQL and demo explanations must agree');
  assert.equal(preferenceEvidence.criteria.total,after.fit.criteria.total);
  assert.equal(preferenceEvidence.criteria.matched+preferenceEvidence.criteria.different,after.fit.criteria.covered);
  const reverse=await rpc('marriage.preference_evidence($1,$2)',[b.id,a.id]);
  assert.deepEqual(reverse,preferenceEvidence,'Explanations must not identify whose preference differs');

  await db.query('delete from marriage.member_answers where member_id=$1 and question_code=$2',[b.id,missing.partnerId]);
  delete profiles[1].surveyAnswers[missing.partnerId];
  const incomplete=await rpc('marriage.preference_evidence($1,$2)',[a.id,b.id]);
  assert.equal(incomplete.topics.find(t=>t.id===missing.id).status,'missing');
  assert.deepEqual(incomplete,describeFit(profiles[0],profiles[1]).fit.preferenceEvidence,'Incomplete explanations stay consistent across backends');
  for(const category of incomplete.categories){
   const topics=incomplete.topics.filter(t=>catalog.dimensions.find(d=>d.id===t.id).category===category.id);
   assert.deepEqual(category,{id:category.id,total:topics.length,covered:topics.filter(t=>t.status!=='missing').length,
    aligned:topics.filter(t=>t.status==='aligned').length,discussion:topics.filter(t=>['one_sided','different'].includes(t.status)).length});
  }
  const counts=incomplete.categories.reduce((sum,c)=>({...sum,total:sum.total+c.total,covered:sum.covered+c.covered}),{total:0,covered:0});
  assert.equal(counts.total,catalog.dimensions.length);assert.equal(counts.covered,catalog.dimensions.length-1);
  const fit=(await db.query('select fit from marriage.pair_fit($1,$2)',[a.id,b.id])).rows[0].fit;
  assert.equal(fit.percentage,null);assert.deepEqual(fit.preferenceEvidence,incomplete);
  assert.deepEqual(Object.keys(incomplete).sort(),['version','method','topics','categories','criteria'].sort());
  for(const topic of incomplete.topics)assert.deepEqual(Object.keys(topic).sort(),['id','status']);
  for(const category of incomplete.categories)assert.deepEqual(Object.keys(category).sort(),['id','total','covered','aligned','discussion'].sort());
  assert.deepEqual(Object.keys(incomplete.criteria).sort(),['matched','different','missing','total'].sort());
  for(const privateValue of ['بكالوريوس','الهندسة والعمارة','ماجستير','الطب والرعاية الصحية',a.id,b.id])assert(!JSON.stringify(incomplete).includes(privateValue));
  for(const role of ['anon','authenticated','service_role'])assert.equal(await rpc('has_function_privilege($1,$2,$3)',[role,'marriage.preference_evidence(uuid,uuid)','execute']),false);
  const noAnswers=await rpc('marriage.preference_evidence($1,$2)',[randomUUID(),randomUUID()]);
  assert(noAnswers.topics.every(t=>t.status==='missing'));
  assert.deepEqual(noAnswers.criteria,{matched:0,different:0,missing:0,total:0});
 }finally{await db.close();}
});
