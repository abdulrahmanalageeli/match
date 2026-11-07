import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';
const catalog=JSON.parse(await readFile(new URL('../../src/compatibility/catalog.json',import.meta.url),'utf8'));
test('discovery signals, presence and exclusions enforce participant scope',async()=>{
 const db=await createDatabase();
 const call=(u,sql,args=[])=>asMember(db,u.id,u.sessionId,()=>db.query('select '+sql+' value',args).then(r=>r.rows[0].value));
 async function add(gender,work='A',hard=false){
  const u={id:randomUUID(),email:randomUUID()+'@example.test',sessionId:randomUUID()};await addUser(db,u);
  const answers=Object.fromEntries(catalog.dimensions.flatMap(d=>[[d.id,'A'],[d.partnerId,'A']]));answers.wife_work=work;
  const payload={displayName:'مثال',age:30,city:'الرياض',gender,profession:'مهندس',bio:'وصف للاختبار',contact:u.email,preferredMinAge:25,preferredMaxAge:40,familyPreference:'',consentVersion:'2026-11-07-privacy',signupConsents:{version:'2026-11-07-privacy',adult:true,terms:true,privacy:true,sensitiveProfile:true,sensitivePublication:true,assessment:true,photo:false},assessmentVersion:'marriage-v2',surveyAnswers:answers,hardRequirements:hard?['wife_work']:[],marriageBasics:{smoking:'never',maritalStatus:'never_married'}};
  const state=await call(u,'public.marriage_apply($1)',[payload]);
  await asService(db,()=>db.query("select public.marriage_review($1,'approve')",[u.id]));
  await asService(db,()=>db.query('select public.marriage_record_receipt($1,$2,false)',[u.id,{bundleId:'com.blindmatch.marriage',productId:'com.blindmatch.marriage.monthly',appAccountToken:state.user.appAccountToken,originalTransactionId:u.id,transactionId:u.id,signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox'}]));return u;
 }


 try {
  const man=await add('man'),woman=await add('woman'),other=await add('woman');
  await db.query("update marriage.member_basics set nationality='سعودي',tribal_background='tribal' where member_id=$1",[woman.id]);
  let cards=await call(man,'public.marriage_browse()');assert.equal(cards.find(p=>p.id===woman.id).online,false);
  await call(woman,'public.marriage_heartbeat()');
  cards=await call(man,'public.marriage_browse($1)',[{onlineOnly:true}]);assert.deepEqual(cards.map(p=>p.id),[woman.id]);
  await db.query("update marriage.member_presence set last_seen=now()-interval '2 minutes' where member_id=$1",[woman.id]);
  assert.equal((await call(man,'public.marriage_browse($1)',[{onlineOnly:true}])).length,0);
  assert(!(await call(man,'public.marriage_browse($1)',[{excludeNationalities:['سعودية']}])).some(p=>p.id===woman.id));
  assert(!(await call(man,'public.marriage_browse($1)',[{excludeTribalBackgrounds:['tribal']}])).some(p=>p.id===woman.id));
  assert((await call(man,'public.marriage_browse($1)',[{tribalBackground:'tribal'}])).some(p=>p.id===woman.id));
  await call(man,"public.marriage_discovery_action($1,'interest')",[woman.id]);
  await call(man,"public.marriage_discovery_action($1,'uninterest')",[woman.id]);
  await call(man,"public.marriage_discovery_action($1,'interest')",[woman.id]);
  const notices=await call(woman,'public.marriage_notifications()');assert.equal(notices.filter(n=>n.kind==='interest').length,1);assert.equal(notices[0].person.id,man.id);
  assert.equal((await call(other,'public.marriage_notifications()')).length,0);
  assert.equal((await db.query('select count(*)::int n from marriage.member_requests')).rows[0].n,0);
  assert((await call(man,'public.marriage_browse()')).find(p=>p.id===woman.id).interested);
  await call(man,"public.marriage_discovery_action($1,'dismiss')",[woman.id]);
  assert(!(await call(man,'public.marriage_browse()')).some(p=>p.id===woman.id));
  assert((await call(woman,'public.marriage_browse()')).some(p=>p.id===man.id),'dismissal is only a personal discovery choice');
  await assert.rejects(call(man,"public.marriage_discovery_action($1,'report','x')",[other.id]));
  await call(man,"public.marriage_discovery_action($1,'report','محتوى غير مناسب')",[other.id]);
  assert.equal((await db.query('select count(*)::int n from marriage.reports where member_id=$1 and reported_id=$2',[man.id,other.id])).rows[0].n,1);
  await assert.rejects(call(other,"public.marriage_discovery_action($1,'interest')",[man.id]));
  await assert.rejects(call(man,"public.marriage_discovery_action($1,'interest')",[man.id]));
  assert.equal((await db.query("select has_table_privilege('authenticated','marriage.member_presence','select') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});

test('pair presence, interest and hiding persist without auto-matching',async()=>{
 const db=await createDatabase();const a='a'.repeat(64),b='b'.repeat(64);
 const rpc=(action,session,payload={})=>asService(db,()=>db.query('select public.nisfayn_test_rpc($1,$2,$3) value',[action,session,payload]).then(r=>r.rows[0].value));
 try{
  await rpc('login',a,{actor:'abdulrahman'});await rpc('login',b,{actor:'reham'});
  await rpc('close',a,{allowRematch:true});
  await rpc('heartbeat',b);let s=await rpc('state',a);assert(s.onlineActors.reham);assert(!s.onlineActors.abdulrahman);
  await rpc('interest',a,{person:'reham'});await rpc('uninterest',a,{person:'reham'});await rpc('interest',a,{person:'reham'});
  s=await rpc('state',a);assert(s.interests.abdulrahman);assert(!s.matched);assert(!s.rematchRequestedBy);
  assert.equal((await rpc('notifications',b)).filter(n=>n.kind==='interest').length,1);
  await rpc('dismiss_person',a,{person:'reham'});s=await rpc('state',a);assert(s.hiddenPeople.abdulrahman);assert(!s.hiddenPeople.reham);
  await assert.rejects(rpc('interest',a,{person:'abdulrahman'}));
  await rpc('report_person',a,{person:'reham',reason:'محتوى غير مناسب'});
  await assert.rejects(rpc('interest',b,{person:'abdulrahman'}));
 }finally{await db.close();}
});
