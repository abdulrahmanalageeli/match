import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';

const answers={consentVersion:'readiness-v1',timeline:'6_to_12_months',family:'ready_to_discuss',preparation:{communication:'ready',budget:'in_progress',housing:'not_started',responsibilities:'in_progress',course:'not_started'}};
function fixture(db){
 const rpc=async(sql,args=[])=>(await db.query('select '+sql+' value',args)).rows[0].value;
 const call=(u,sql,args=[])=>asMember(db,u.id,u.sessionId,()=>rpc(sql,args));
 const passport=(u,action,payload={})=>call(u,'public.marriage_passport($1,$2)',[action,payload]);
 async function member(gender='man'){
  const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};await addUser(db,u);
  await call(u,'public.marriage_apply($1)',[{displayName:'مثال',age:29,gender,city:'الرياض',profession:'مهندس',bio:'ملف تجريبي',contact:u.email,preferredMinAge:25,preferredMaxAge:40,familyPreference:'',consentVersion:'2026-11-05',signupConsents:{version:'2026-11-06-onboarding',adult:true,terms:true,privacy:true,sensitiveProfile:true,assessment:true,photo:true}}]);
  await db.query("update marriage.members set review_status='approved',manual_access_until=now()+interval '1 day' where id=$1",[u.id]);return u;
 }
 async function connect(a,b){const id=await call(a,'public.marriage_request($1)',[b.id]);await call(b,"public.marriage_act($1,'accept')",[id]);return id;}
 return {rpc,call,passport,member,connect};
}

test('readiness private declarations require consent, validate shape, do not expose evidence, export and erase completely',async()=>{
 const db=await createDatabase();try{
  const {passport,member,call}=fixture(db),a=await member(),b=await member('woman');
  assert.deepEqual(await passport(a,'get'),{consentedAt:null,updatedAt:null,claims:[],grants:[],verificationAvailable:false});
  await assert.rejects(passport(a,'save',{...answers,consentVersion:null}),/وافِق/);
  for(const preparation of [null,[],{}, {...answers.preparation,bankAccount:'secret'}, {...answers.preparation,budget:null}])await assert.rejects(passport(a,'save',{...answers,preparation}));
  const saved=await passport(a,'save',{...answers,claims:[{kind:'identity',status:'valid'}],memberId:b.id});
  assert.deepEqual(saved.claims,[]);assert.deepEqual(saved.preparation,answers.preparation);assert.equal(saved.verificationAvailable,false);
  assert.equal((await passport(b,'get')).consentedAt,null,'cannot write another owner');
  assert(!JSON.stringify(await call(b,'public.marriage_browse()')).includes('readiness'),'not in discovery');
  assert.equal((await call(a,'public.marriage_personal_data()')).readinessPassport.timeline,answers.timeline);
  for(const role of ['anon','authenticated','service_role']){
   await db.exec('set role '+role);try{
    for(const table of ['readiness_passports','readiness_preparation','readiness_grants','readiness_issuers','readiness_verification_requests','readiness_claims','readiness_events'])await assert.rejects(db.query('select * from marriage.'+table),/permission denied/);
    await assert.rejects(db.query('select marriage.readiness_owner($1)',[a.id]),/permission denied/);
    await assert.rejects(db.query("select marriage.readiness_command($1,'get','{}')",[a.id]),/permission denied/);
   }finally{await db.exec('reset role');}
  }
  await passport(a,'withdraw');assert.equal((await passport(a,'get')).consentedAt,null);
  assert.equal((await db.query('select count(*)::int n from marriage.readiness_events where owner_key=$1',[a.id])).rows[0].n,0);
  await passport(a,'save',answers);await call(a,'public.marriage_delete_account()');
  assert.equal((await db.query('select count(*)::int n from marriage.readiness_passports where owner_key=$1',[a.id])).rows[0].n,0);
  await assert.rejects(passport(a,'get'),/حساب مؤكد/);
 }finally{await db.close();}
});

test('sharing is granular, expiring, connection-bound and permanently revoked on closure or block',async()=>{
 const db=await createDatabase();try{
  const{passport,member,connect,call}=fixture(db),a=await member(),b=await member('woman'),outsider=await member();
  await passport(a,'save',answers);const id=await connect(a,b);const payload={connectionId:id};
  assert.equal((await passport(b,'view',payload)).available,false,'default private');
  await assert.rejects(passport(outsider,'share',{...payload,sections:['timeline'],days:7}),/أنشئ/);
  await passport(outsider,'save',answers);await assert.rejects(passport(outsider,'share',{...payload,sections:['timeline'],days:7}),/مقبول/);
  for(const sections of [[],null,['raw_identity'],['timeline',null]])await assert.rejects(passport(a,'share',{...payload,sections,days:7}));
  for(const days of [0,8,90,null])await assert.rejects(passport(a,'share',{...payload,sections:['timeline'],days}));
  await passport(a,'share',{...payload,sections:['timeline'],days:7});
  let view=await passport(b,'view',payload);assert.equal(view.available,true);assert.equal(view.timeline,answers.timeline);assert.equal(view.family,answers.family);assert.equal(view.preparation,undefined);assert.equal(view.claims,undefined);
  assert.equal((await passport(outsider,'view',payload)).available,false);assert.equal((await passport(b,'view',{connectionId:randomUUID()})).available,false);
  await passport(a,'share',{...payload,sections:['preparation','verification'],days:30});
  view=await passport(b,'view',payload);assert.equal(view.timeline,undefined);assert.deepEqual(view.preparation,answers.preparation);assert.deepEqual(view.claims,[]);
  await passport(a,'revoke',payload);assert.equal((await passport(b,'view',payload)).available,false);
  await passport(a,'share',{...payload,sections:['timeline'],days:7});
  await db.query("update marriage.readiness_grants set granted_at=now()-interval '8 days',expires_at=now()-interval '1 day' where owner_key=$1",[a.id]);
  assert.equal((await passport(b,'view',payload)).available,false);assert.deepEqual((await passport(a,'get')).grants,[]);
  await passport(a,'share',{...payload,sections:['timeline'],days:7});
  await call(a,"public.marriage_act($1,'cancel')",[id]);assert.equal((await passport(b,'view',payload)).available,false);
  await db.query("update marriage.member_requests set status='accepted' where id=$1",[id]);assert.equal((await passport(b,'view',payload)).available,false,'rematch never resurrects consent');
  await passport(a,'share',{...payload,sections:['timeline'],days:7});
  await db.query('insert into marriage.blocks(member_id,blocked_id) values($1,$2)',[b.id,a.id]);
  await db.query('delete from marriage.blocks where member_id=$1',[b.id]);
  await db.query("update marriage.member_requests set status='accepted' where id=$1",[id]);assert.equal((await passport(b,'view',payload)).available,false,'unblock never resurrects consent');
  await passport(a,'share',{...payload,sections:['timeline'],days:7});await passport(a,'withdraw');await passport(a,'save',answers);
  assert.equal((await passport(b,'view',payload)).available,false,'new consent after withdrawal needs new sharing');
 }finally{await db.close();}
});

test('independent claims require enabled scoped issuer, separate consent, authenticated receipt and non-replayable request',async()=>{
 const db=await createDatabase();try{
  const{passport,member,rpc}=fixture(db),a=await member();await passport(a,'save',answers);
  assert.equal((await db.query('select count(*)::int n from marriage.readiness_issuers')).rows[0].n,0,'no fabricated provider');
  const issuer=randomUUID();await db.query("insert into marriage.readiness_issuers(id,name,allowed_kinds) values($1,'Fictional test issuer',array['identity'])",[issuer]);
  const request={issuerId:issuer,kind:'identity',consentVersion:'readiness-verification-v1'};
  await assert.rejects(passport(a,'verify_request',request),/غير متاحة/);
  await db.query("update marriage.readiness_issuers set enabled=true,approved_at=now(),legal_basis_reference='test-contract-only' where id=$1",[issuer]);
  await assert.rejects(passport(a,'verify_request',{...request,consentVersion:'readiness-v1'}),/إذن خاص/);
  await assert.rejects(passport(a,'verify_request',{...request,kind:'criminal_record'}),/غير متاحة/);
  const issued=await passport(a,'verify_request',request),rid=issued.verificationRequestId;
  const stamp=new Date(Date.now()+1000).toISOString(),expiry=new Date(Date.now()+86400000).toISOString();
  const receipt=[rid,'test-opaque-reference',stamp,expiry];
  const record=args=>asService(db,()=>rpc('public.marriage_record_readiness_claim($1,$2,$3,$4)',args));
  await assert.rejects(asMember(db,a.id,a.sessionId,()=>rpc('public.marriage_record_readiness_claim($1,$2,$3,$4)',receipt)),/permission denied/);
  await assert.rejects(record([randomUUID(),...receipt.slice(1)]),/unavailable/);
  await assert.rejects(record([rid,receipt[1],new Date(Date.now()-86400000).toISOString(),expiry]),/invalid/);
  await db.query('update marriage.readiness_issuers set enabled=false where id=$1',[issuer]);
  await assert.rejects(record(receipt),/unavailable/);
  await db.query('update marriage.readiness_issuers set enabled=true where id=$1',[issuer]);
  const cid=await record(receipt);assert.equal(await record(receipt),cid,'idempotent exact receipt');
  await assert.rejects(record([rid,'another-reference',stamp,expiry]),/Conflicting/);
  let claim=(await passport(a,'get')).claims[0];assert.equal(claim.kind,'identity');assert.equal(claim.status,'valid');assert.equal(claim.method,'issuer_confirmation');assert(!JSON.stringify(claim).includes('test-opaque-reference'));assert.equal(claim.requestId,undefined);
  await db.query('update marriage.readiness_issuers set enabled=false where id=$1',[issuer]);
  assert.equal((await passport(a,'get')).claims[0].status,'revoked','disabled issuer cannot support an active claim');
  await db.query('update marriage.readiness_issuers set enabled=true where id=$1',[issuer]);
  await asService(db,()=>rpc('public.marriage_revoke_readiness_claim($1)',[cid]));assert.equal((await passport(a,'get')).claims[0].status,'revoked');
  await record(receipt);assert.equal((await passport(a,'get')).claims[0].status,'revoked','replayed old callback cannot restore revoked claim');
  const second=await passport(a,'verify_request',request);await assert.rejects(record(receipt),/unavailable/);
  await db.query("update marriage.readiness_verification_requests set expires_at=now()-interval '1 second' where id=$1",[second.verificationRequestId]);
  await assert.rejects(record([second.verificationRequestId,'new-reference',stamp,expiry]),/expired/);
  const third=await passport(a,'verify_request',request);await passport(a,'withdraw');await passport(a,'save',answers);
  await assert.rejects(record([third.verificationRequestId,'third-reference',stamp,expiry]),/unavailable/);
  assert.deepEqual((await passport(a,'get')).claims,[]);
 }finally{await db.close();}
});

test('paired preview uses private persistent declarations, granular grants and cannot verify or reuse a closed match grant',async()=>{
 const db=await createDatabase();try{
  const rpc=(action,session='',payload={})=>asService(db,()=>db.query('select public.nisfayn_test_rpc($1,$2,$3) value',[action,session,payload]).then(r=>r.rows[0].value));
  const a='a'.repeat(64),b='b'.repeat(64);await rpc('login',a,{actor:'abdulrahman'});await rpc('login',b,{actor:'reham'});
  const p=(session,action,payload={})=>rpc('passport',session,{...payload,action}),connectionId='tester-pair';
  await p(a,'save',answers);assert.equal((await p(b,'get')).consentedAt,null);
  assert.equal((await p(b,'view',{connectionId})).available,false);
  await p(a,'share',{connectionId,sections:['preparation'],days:7});
  const view=await p(b,'view',{connectionId});assert.equal(view.available,true);assert.deepEqual(view.preparation,answers.preparation);assert.equal(view.timeline,undefined);
  assert.equal((await rpc('state',b)).readinessPassport,undefined,'room snapshots do not expose private passports');
  await assert.rejects(p(a,'share',{connectionId:'another-fake-match',sections:['timeline'],days:7}),/مقبول/);
  await assert.rejects(p(a,'verify_request',{issuerId:randomUUID(),kind:'identity',consentVersion:'readiness-verification-v1'}),/إذن خاص/);
  await rpc('close',b);await rpc('reset',a);assert.equal((await p(b,'view',{connectionId})).available,false);
  await p(a,'share',{connectionId,sections:['preparation'],days:7});
  await db.query("update marriage.admin_test_members set suspended=true where actor='abdulrahman'");
  assert.equal((await p(b,'view',{connectionId})).available,false);
  await p(a,'withdraw');assert.equal((await p(a,'get')).consentedAt,null,'withdrawal remains possible while suspended');
  await assert.rejects(p('invalid','get'),/انتهت/);
 }finally{await db.close();}
});

test('existing maintenance prunes readiness retention without altering its public response contract',async()=>{
 const db=await createDatabase();try{
  const{passport,member,connect,rpc}=fixture(db),a=await member(),b=await member('woman');await passport(a,'save',answers);const id=await connect(a,b);
  await passport(a,'share',{connectionId:id,sections:['timeline'],days:7});
  await db.query("update marriage.readiness_grants set granted_at=now()-interval '8 days',expires_at=now()-interval '1 day' where owner_key=$1",[a.id]);
  await db.query("update marriage.readiness_events set created_at=now()-interval '91 days' where owner_key=$1",[a.id]);
  await db.query("insert into marriage.client_fault_totals(day,event,platform,release,total) values((now() at time zone 'Asia/Riyadh')::date-30,'render_error','web','0.1.0',1)");
  await assert.rejects(rpc('public.marriage_operations_cleanup()'),/Trusted service/);
  assert.deepEqual(await asService(db,()=>rpc('public.marriage_operations_cleanup()')),{faultGroups:1,notificationJobs:0});
  assert.equal((await db.query('select count(*)::int n from marriage.readiness_grants')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from marriage.readiness_events')).rows[0].n,0);
  assert.equal((await passport(a,'get')).timeline,answers.timeline,'maintenance preserves current private declarations');
 }finally{await db.close();}
});
