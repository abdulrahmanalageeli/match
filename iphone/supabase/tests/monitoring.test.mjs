import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';

const rpc=async(db,sql,args=[])=>(await db.query('select '+sql+' as v',args)).rows[0].v;
async function member(db,gender='woman'){
 const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.invalid'};await addUser(db,u);
 await asMember(db,u.id,u.sessionId,()=>rpc(db,'public.marriage_apply($1)',[{displayName:'PRIVATE-NAME',age:29,gender,city:'الرياض',profession:'باحثة',bio:'PRIVATE-BIO',contact:'PRIVATE-CONTACT',preferredMinAge:25,preferredMaxAge:40,familyPreference:'',consentVersion:'2026-11-05'}]));
 return u;
}
async function staff(db,role){
 const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.invalid'};await addUser(db,u);
 await db.query('insert into marriage.staff_accounts(user_id,role,display_name) values($1,$2,$3)',[u.id,role,'PRIVATE-STAFF']);return u;
}
async function asStaff(db,u,fn,aal='aal2'){
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:u.id,session_id:u.sessionId,role:'authenticated',aal})]);await db.exec('set role authenticated');
 try{return await fn();}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claims','',false)");}
}

test('monitoring is owner-and-MFA-only and fault records accept only generic categories',async()=>{
 const db=await createDatabase();
 try{
  const u=await member(db),owner=await staff(db,'owner'),reviewer=await staff(db,'reviewer');
  const health=()=>rpc(db,'public.marriage_admin_health()');
  await db.exec('set role anon');await assert.rejects(health(),/permission/);await assert.rejects(rpc(db,"public.marriage_record_client_fault('render_error','0.2.0','ios')"),/permission/);await db.exec('reset role');
  await assert.rejects(asMember(db,u.id,u.sessionId,health),/صلاحية/);
  await assert.rejects(asStaff(db,reviewer,health),/صلاحية/);
  await assert.rejects(asStaff(db,owner,health,'aal1'),/بخطوتين/);
  await asMember(db,u.id,u.sessionId,async()=>{
   for(const args of [['PRIVATE-ERROR','0.2.0','ios'],['render_error','https://private.example/person','ios'],['render_error','0.2.0','PRIVATE-DEVICE'],[null,'0.2.0','ios'],['render_error','0.2.0',null]]){
    await assert.rejects(rpc(db,'public.marriage_record_client_fault($1,$2,$3)',args),/Invalid diagnostic/);
   }
   assert.equal(await rpc(db,"public.marriage_record_client_fault('render_error','0.2.0','ios')"),true);
   for(const table of ['client_fault_totals','client_fault_limits'])await assert.rejects(db.query('select * from marriage.'+table),/permission/);
   await assert.rejects(rpc(db,'public.marriage_operations_cleanup()'),/permission/);
  });
  const result=await asStaff(db,owner,health);
  assert.deepEqual(Object.keys(result).sort(),['clientEvents','push','retentionDays','serverTime']);
  assert.deepEqual(Object.keys(result.clientEvents[0]).sort(),['day','event','platform','release','total']);
  assert.equal(result.clientEvents[0].total,1);assert.equal(result.retentionDays,30);
  for(const secret of ['PRIVATE',u.id,u.email,owner.id,'stack','token','requestId'])assert.equal(JSON.stringify(result).includes(secret),false);
  await asService(db,()=>assert.rejects(health(),/permission/));
  await db.query('delete from auth.sessions where id=$1',[owner.sessionId]);await assert.rejects(asStaff(db,owner,health),/تسجيل الدخول/);
  await db.query('delete from auth.sessions where id=$1',[u.sessionId]);await assert.rejects(asMember(db,u.id,u.sessionId,()=>rpc(db,"public.marriage_record_client_fault('render_error','0.2.0','ios')")),/تسجيل الدخول/);
 }finally{await db.close();}
});

test('fault counts are rate limited per member and cleanup retains exactly 30 calendar days and live jobs',async()=>{
 const db=await createDatabase();
 try{
  const a=await member(db),b=await member(db,'man'),owner=await staff(db,'owner');
  for(const u of [a,b]){
   await asService(db,()=>rpc(db,"public.marriage_review($1,'approve')",[u.id]));
   const state=await asMember(db,u.id,u.sessionId,()=>rpc(db,'public.marriage_state()'));
   await asService(db,()=>rpc(db,'public.marriage_record_receipt($1,$2,false)',[u.id,{
    bundleId:'com.blindmatch.marriage',productId:'com.blindmatch.marriage.monthly',appAccountToken:state.user.appAccountToken,
    originalTransactionId:u.id,transactionId:u.id,signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox',
   }]));
  }
  const fault=u=>asMember(db,u.id,u.sessionId,()=>rpc(db,"public.marriage_record_client_fault('unhandled_error','0.2.0','web')"));
  for(let n=0;n<10;n++)assert.equal(await fault(a),true);
  assert.equal(await fault(a),false);assert.equal(await fault(b),true);
  await db.query("update marriage.client_fault_limits set window_start=now()-interval '61 minutes' where member_id=$1",[a.id]);assert.equal(await fault(a),true);
  const current=await asStaff(db,owner,()=>rpc(db,'public.marriage_admin_health()'));assert.equal(current.clientEvents[0].total,12);
  await db.query("insert into marriage.client_fault_totals(day,event,platform,release,total) values((now() at time zone 'Asia/Riyadh')::date-30,'render_error','ios','0.1.0',20),((now() at time zone 'Asia/Riyadh')::date-29,'render_error','ios','0.1.0',7)");
  await db.query("update marriage.client_fault_limits set window_start=now()-interval '3 days' where member_id=$1",[b.id]);
  const installation=randomUUID(),request=randomUUID();
  await db.query("insert into marriage.push_devices values($1,$2,$3,$4,'sandbox',now())",[installation,a.id,a.sessionId,'a'.repeat(64)]);
  await db.query('insert into marriage.weekly_batches values($1,marriage.current_week())',[a.id]);
  await db.query('insert into marriage.weekly_candidates values($1,marriage.current_week(),1,$2)',[a.id,b.id]);
  await db.query("insert into marriage.member_requests(id,requester_id,recipient_id,status) values($1,$2,$3,'accepted')",[request,a.id,b.id]);
  for(const [key,age,finished] of [['expired',8,false],['old-sent',8,true],['recent-sent',1,true],['live',-1,false]]){
   await db.query("insert into marriage.push_outbox(installation_id,member_id,request_id,kind,event_key,expires_at,finished_at,outcome) values($1,$2,$3,'message',$4,now()-make_interval(days=>$5),case when $6 then now()-make_interval(days=>$5) else null end,case when $6 then 'sent' else null end)",[installation,a.id,request,key,age,finished]);
  }
  await assert.rejects(rpc(db,'marriage.operations_cleanup()'),/Trusted service/);
  const counts=await asService(db,()=>rpc(db,'public.marriage_operations_cleanup()'));assert.deepEqual(counts,{faultGroups:1,notificationJobs:2});
  assert.deepEqual((await db.query('select event_key from marriage.push_outbox order by event_key')).rows.map(r=>r.event_key),['live','recent-sent']);
  assert.equal((await db.query('select count(*)::int n from marriage.client_fault_limits where member_id=$1',[b.id])).rows[0].n,0);
  const health=await asStaff(db,owner,()=>rpc(db,'public.marriage_admin_health()'));assert.equal(health.clientEvents.length,2);assert.equal(health.push.queued,1);
  assert.deepEqual(await asService(db,()=>rpc(db,'public.marriage_operations_cleanup()')),{faultGroups:0,notificationJobs:0});
 }finally{await db.close();}
});
