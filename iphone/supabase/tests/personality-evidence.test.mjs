import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';
import {describeFit} from '../../src/compatibility/model.ts';

const questions=JSON.parse(await readFile(new URL('../../src/compatibility/personality-catalog.json',import.meta.url),'utf8'));
const codes=questions.map(q=>q.id);
const consents={version:'2026-11-06-onboarding',adult:true,terms:true,privacy:true,sensitiveProfile:true,assessment:true,photo:false};
const full=code=>Object.fromEntries(codes.map(id=>[id,code]));
function setup(db){
 const rpc=async(sql,args=[])=>(await db.query('select '+sql+' value',args)).rows[0].value;
 const call=(u,sql,args=[])=>asMember(db,u.id,u.sessionId,()=>rpc(sql,args));
 async function member(gender){
  const id=randomUUID(),u={id,email:id+'@example.test',sessionId:randomUUID()};await addUser(db,u);
  u.profile={displayName:'عضو تجريبي',age:29,gender,city:'الرياض',profession:'مهندس',bio:'نبذة اختيارية',contact:u.email,
   preferredMinAge:25,preferredMaxAge:40,familyPreference:'',appearanceVersion:'appearance-v1',assessmentVersion:'marriage-v2',
   marriageBasics:{},partnerCriteria:{},surveyAnswers:{},personalityAnswers:full('A'),personalityVersion:'personality-v1',
   hardRequirements:[],priorityCategories:[],signupConsents:consents,consentVersion:consents.version};
  await call(u,'public.marriage_apply($1)',[u.profile]);
  await asService(db,()=>rpc("public.marriage_review($1,'approve')",[id]));
  await db.query("update marriage.members set manual_access_until=now()+interval '1 day' where id=$1",[id]);
  return u;
 }
 async function setAnswers(u,answers){
  u.profile.personalityAnswers=answers;
  // Fixture-only direct writes keep the calculation test independent of profile review.
  await db.query('delete from marriage.personality_answers where member_id=$1',[u.id]);
  await db.query('insert into marriage.personality_answers select $1,key,value from jsonb_each_text($2)',[u.id,answers]);
 }
 return{rpc,call,member,setAnswers};
}

test('personality aggregate evidence matches client for every distance, rounding, symmetry and missing answers',async()=>{
 const db=await createDatabase();try{
  const{rpc,member,setAnswers}=setup(db),a=await member('woman'),b=await member('man');
  const cases=[];
  for(const code of 'ABCDE')cases.push([full('A'),full(code)]);
  for(let seed=0;seed<24;seed++)cases.push([
   Object.fromEntries(codes.map((id,i)=>[id,'ABCDE'[(seed+i)%5]])),
   Object.fromEntries(codes.filter((_,i)=>seed<12?i!==seed:true).map((id,i)=>[id,'ABCDE'[(seed*3+i*2)%5]])),
  ]);
  cases.push([{},{}],[full('A'),{social_energy:'C'}]);
  // 9 equal, 1 distance-two, 2 distance-four: 950 / 12 rounds 79.1667 to 79.
  cases.push([full('A'),{...full('A'),social_energy:'C',initiative:'E',depth:'E'}]);
  for(const[x,y]of cases){
   await setAnswers(a,x);await setAnswers(b,y);
   const server=await rpc('marriage.personality_fit($1,$2)',[a.id,b.id]);
   const client=describeFit({...a.profile,id:a.id},{...b.profile,id:b.id}).fit.personality;
   assert.deepEqual(server,client);
   assert.deepEqual(server,await rpc('marriage.personality_fit($1,$2)',[b.id,a.id]));
   assert.deepEqual(server.domains.map(d=>[d.id,d.total]),[['communication',3],['closeness',3],['everyday',3],['pressure',3]]);
   if(server.complete){
    const d=server.distribution;assert.equal(Object.values(d).reduce((s,n)=>s+n,0),12);
    assert.equal(server.percentage,Math.round((d.same*100+d.near*75+d.different*50+d.far*25)/12));
   }else{
    assert.equal(server.percentage,null);assert.equal(server.distribution,null);
    assert.ok(server.domains.every(d=>d.percentage===null));
   }
  }
 }finally{await db.close();}
});

test('existing personality score and ordering are unchanged; evidence is aggregate-only through authorized cards',async()=>{
 const db=await createDatabase();try{
  const{rpc,call,member,setAnswers}=setup(db),a=await member('woman'),b=await member('man');
  const bAnswers={...full('A'),social_energy:'C',initiative:'E',depth:'E'};
  await setAnswers(b,bAnswers);
  const server=await rpc('marriage.personality_fit($1,$2)',[a.id,b.id]);
  const original=(await db.query(`with choices as(select q.code,q.ordinal,abs(ascii(x.option_code)-ascii(y.option_code)) as distance
   from marriage.personality_questions q left join marriage.personality_answers x on x.member_id=$1 and x.question_code=q.code
   left join marriage.personality_answers y on y.member_id=$2 and y.question_code=q.code)
   select floor(avg(1-distance::float8/4)*100+0.5)::int percentage,
    jsonb_agg(code order by ordinal) filter(where distance<=1) similarities,
    jsonb_agg(code order by ordinal) filter(where distance>1) differences from choices`,[a.id,b.id])).rows[0];
  assert.equal(server.percentage,original.percentage);assert.deepEqual(server.similarities,original.similarities);assert.deepEqual(server.differences,original.differences);
  assert.deepEqual(Object.keys(server).sort(),['version','complete','covered','total','percentage','similarities','differences','method','domains','distribution'].sort());
  assert.ok(server.domains.every(d=>Object.keys(d).sort().join()===['id','covered','total','percentage'].sort().join()));
  const card=(await call(a,'public.marriage_discover()')).find(p=>p.id===b.id);
  assert.ok(card);assert.deepEqual(card.fit.personality,server);
  for(const key of ['personalityAnswers','personalityVersion','surveyAnswers','partnerCriteria'])assert.equal(card[key],undefined);
  for(const role of ['anon','authenticated','service_role']){
   assert.equal(await rpc("has_function_privilege($1,'marriage.personality_fit(uuid,uuid)','EXECUTE')",[role]),false);
   assert.equal(await rpc("has_table_privilege($1,'marriage.personality_answers','SELECT')",[role]),false);
  }
  const fn=(await db.query("select prosecdef,proconfig from pg_proc where oid='marriage.personality_fit(uuid,uuid)'::regprocedure")).rows[0];
  assert.equal(fn.prosecdef,false);assert.deepEqual(fn.proconfig,['search_path=""']);
 }finally{await db.close();}
});
