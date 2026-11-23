import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, addUser, asService } from './harness.mjs';
import { seedCommunicationMember } from './communication-fixture.mjs';
async function staff(db,role='owner') {const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.invalid'};await addUser(db,u);await db.query('insert into marriage.staff_accounts(user_id,role,display_name) values($1,$2,$3)',[u.id,role,role]);return u;}
async function rpc(db,user,fn,args=[],aal='aal2') {
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user.id,session_id:user.sessionId,role:'authenticated',aal})]);await db.exec('set role authenticated');
 try{return (await db.query('select '+fn+' result',args)).rows[0].result;}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claims','',false)");}
}
const detail=(db,u,id)=>rpc(db,u,'public.marriage_admin_member($1)',[id]);
const manage=(db,u,id,action,changes,revision,operation=randomUUID(),aal='aal2')=>rpc(db,u,'public.marriage_admin_manage($1,$2,$3,$4,$5,$6)',[id,action,changes,revision,'سبب إداري موثّق',operation],aal);
const review=(db,u,id,action,revision)=>rpc(db,u,'public.marriage_admin_review($1,$2,$3,$4,$5)',[id,action,revision,'قرار مراجعة موثّق',randomUUID()]);

test('persistent tagged testers share reviewed, audited controls and every pair capability respects restrictions',async()=>{
 const db=await createDatabase();try{
  const owner=await staff(db),reviewer=await staff(db,'reviewer'),moderator=await staff(db,'moderator');
  const pair=(a,s='',p={})=>asService(db,()=>db.query('select public.nisfayn_test_rpc($1,$2,$3) r',[a,s,p]).then(r=>r.rows[0].r));
  const a='a'.repeat(64),b='b'.repeat(64);await pair('login',a,{actor:'abdulrahman'});await pair('login',b,{actor:'reham'});
  const list=await rpc(db,owner,"public.marriage_admin_applications('dummy')");assert.equal(list.length,2);assert(list.every(m=>m.isDummy&&m.accountSource==='pair_test'));
  const target=list.find(m=>m.displayName==='عبدالرحمن').memberId;
  let row=await detail(db,owner,target);const initial=row.revision;
  await assert.rejects(manage(db,reviewer,target,'grant_access',{days:30},row.revision),/صلاحية/);
  await assert.rejects(manage(db,owner,target,'grant_access',{days:30},row.revision,randomUUID(),'aal1'),/بخطوتين/);
  await assert.rejects(manage(db,owner,target,'set_dummy',{isDummy:false},row.revision),/وسم/);
  await assert.rejects(manage(db,owner,target,'edit_profile',{role:'owner'},row.revision),/غير صالحة/);
  const op=randomUUID(),edit={displayName:'اختبار الإدارة',profession:'مصمم',bio:'نبذة عدّلتها الإدارة'};
  await manage(db,owner,target,'edit_profile',edit,row.revision,op);await manage(db,owner,target,'edit_profile',edit,row.revision,op);
  assert.equal((await pair('state',a)).profiles.abdulrahman.bio,edit.bio);
  row=await detail(db,owner,target);assert.equal(row.displayName,edit.displayName);assert.notEqual(row.revision,initial);
  // An admin edit only creates the supplied fields in the tester's initial room.
  // Exercise the same valid member update for success, stale revision, and suspension.
  const state=await pair('state',a),editRevision=row.revision;
  const memberEdit={...state.profiles.abdulrahman,age:29,city:'الرياض',preferredMinAge:25,preferredMaxAge:40,
    marriageBasics:{},partnerCriteria:{},signupConsents:{version:'2026-11-07-privacy',adult:true,terms:true,
      privacy:true,sensitiveProfile:true,sensitivePublication:true,assessment:true,photo:true},bio:'تعديل العضو',profession:'مصمم'};
  const savedProfile=await pair('profile',a,{profile:memberEdit,expectedRevision:state.profileRevision});
  assert.equal(savedProfile.profileRevision,(await pair('state',a)).profileRevision);
  await assert.rejects(pair('profile',a,{profile:{...memberEdit,bio:'نسخة قديمة'},expectedRevision:editRevision}),/تغيّر الملف/);
  assert.equal((await pair('state',a)).profiles.abdulrahman.displayName,edit.displayName);
  row=await detail(db,owner,target);assert.notEqual(row.revision,editRevision);
  await assert.rejects(manage(db,owner,target,'grant_access',{days:30},initial),/تغيّر الملف/);
  await assert.rejects(manage(db,owner,target,'edit_profile',{...edit,bio:'آخر'},initial,op),/معرّف/);
  await review(db,owner,target,'suspend',row.revision);row=await detail(db,owner,target);assert(row.suspended);
  for(const action of ['state','profile','reset','rewind','send','media_prepare','media_commit','media_url','gallery_prepare','gallery_url','token','call_start','notifications'])
   await assert.rejects(pair(action,a,action==='profile'?{profile:memberEdit,expectedRevision:row.revision}:{}),/الحساب غير متاح/);
  for(const action of ['send','call_start','reset','token','media_url','gallery_url']) await assert.rejects(pair(action,b,{}),/الطرف الآخر/);
  await assert.rejects(pair('login','c'.repeat(64),{actor:'abdulrahman'}),/الحساب غير متاح/);
  assert.equal((await pair('state',b)).matched,false);
  await review(db,moderator,target,'restore',row.revision);row=await detail(db,owner,target);assert.equal(row.status,'pending');
  await assert.rejects(pair('state',a),/الحساب غير متاح/);
  await review(db,reviewer,target,'approve',row.revision);assert.equal((await pair('state',a)).matched,false,'restoring never silently reopens a relationship');
  row=await detail(db,owner,target);await manage(db,owner,target,'revoke_access',{},row.revision);
  await assert.rejects(pair('state',a),/الحساب غير متاح/);row=await detail(db,owner,target);assert.equal(row.accessActive,false);
  await manage(db,owner,target,'grant_access',{days:30},row.revision);row=await detail(db,owner,target);assert.equal(row.accessActive,true);
  await review(db,owner,target,'pause',row.revision);await assert.rejects(pair('state',a),/الحساب غير متاح/);
  row=await detail(db,owner,target);await review(db,owner,target,'resume',row.revision);assert.equal((await pair('state',a)).matched,false);
  const audit=await rpc(db,owner,'public.marriage_admin_audit()');assert.equal(audit.filter(r=>r.action==='edit_profile').length,1);
  assert(audit.some(r=>r.action==='grant_access'&&r.actorId===owner.id));
  await db.exec('set role authenticated');await assert.rejects(db.query('select * from marriage.admin_test_members'),/permission/);await db.exec('reset role');
 }finally{await db.close();}
});

test('real member edits and complimentary access preserve purchased entitlements, protect revisions, and require owner authority',async()=>{
 const db=await createDatabase();try{
  const owner=await staff(db),reviewer=await staff(db,'reviewer'),u={id:randomUUID(),sessionId:randomUUID(),email:'member@example.invalid'};await addUser(db,u);
  const token=await seedCommunicationMember(db,u,'woman','pending');
  await db.query("insert into marriage.consents(member_id,version) values($1,'2026-11-05')",[u.id]);
  let row=await detail(db,owner,u.id);assert.equal(row.accountSource,'member');assert.equal(row.isDummy,false);
  const before=row.revision;await manage(db,owner,u.id,'edit_profile',{profession:'مهندسة'},row.revision);row=await detail(db,owner,u.id);assert.equal(row.profession,'مهندسة');assert.notEqual(row.revision,before);
  await assert.rejects(manage(db,owner,u.id,'grant_access',{days:366},row.revision),/مدة/);
  await manage(db,owner,u.id,'grant_access',{days:10},row.revision);row=await detail(db,owner,u.id);assert(row.accessActive);assert(row.manualAccessUntil);
  assert.equal((await db.query('select marriage.member_state($1) r',[u.id])).rows[0].r.membership.active,true);
  assert.equal((await db.query('select count(*)::int n from marriage.store_transactions')).rows[0].n,0,'complimentary access never forges a receipt');
  await manage(db,owner,u.id,'revoke_access',{},row.revision);row=await detail(db,owner,u.id);assert.equal(row.accessActive,false);
  row=await detail(db,owner,u.id);await review(db,reviewer,u.id,'approve',row.revision);
  await asService(db,()=>db.query('select public.marriage_record_receipt($1,$2,false)',[u.id,{bundleId:'com.blindmatch.marriage',productId:'com.blindmatch.marriage.monthly',appAccountToken:token,originalTransactionId:u.id,transactionId:u.id,signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox'}]));
  row=await detail(db,owner,u.id);await manage(db,owner,u.id,'revoke_access',{},row.revision);assert.equal((await detail(db,owner,u.id)).accessActive,true,'paid store entitlement survives complimentary revocation');
  row=await detail(db,owner,u.id);await manage(db,owner,u.id,'set_dummy',{isDummy:true},row.revision);assert.equal((await rpc(db,owner,"public.marriage_admin_applications('dummy')")).length,3);
  row=await detail(db,owner,u.id);await review(db,reviewer,u.id,'return_pending',row.revision);assert.equal((await detail(db,owner,u.id)).status,'pending');
 }finally{await db.close();}
});

test('dummy safety reports reach the shared queue with assignment, resolution, reopening and moderation checks',async()=>{
 const db=await createDatabase();try{
  const owner=await staff(db),reviewer=await staff(db,'reviewer'),moderator=await staff(db,'moderator'),other=await staff(db,'moderator');
  const pair=(a,s='',p={})=>asService(db,()=>db.query('select public.nisfayn_test_rpc($1,$2,$3) r',[a,s,p]).then(r=>r.rows[0].r));
  const a='a'.repeat(64),b='b'.repeat(64);await pair('login',a,{actor:'abdulrahman'});await pair('login',b,{actor:'reham'});
  await assert.rejects(pair('close','wrong',{report:true,reason:'بلاغ غير مصرح'}),/الحساب غير متاح/);
  await assert.rejects(pair('close',b,{report:true,reason:'x'}),/سبب البلاغ/);
  assert.equal((await pair('state',b)).matched,true,'invalid report must not close the relationship');
  await pair('close',b,{report:true,reason:'بلاغ عن سلوك غير مناسب',reportedId:randomUUID()});
  assert.equal((await pair('state',b)).matched,false);
  await assert.rejects(rpc(db,reviewer,'public.marriage_admin_reports()'),/صلاحية/);
  let row=(await rpc(db,owner,'public.marriage_admin_reports()'))[0];assert(row.isDummy);assert.equal(row.reportedName,'عبدالرحمن');
  assert.equal('reporterId' in row,false);assert.equal((await rpc(db,owner,'public.marriage_admin_overview()')).counts.openReports,1);
  let member=await detail(db,moderator,row.reportedId);assert(member.isDummy);
  const action=(who,decision,revision,op=randomUUID())=>rpc(db,who,'public.marriage_admin_report_action($1,$2,$3,$4,$5)',[row.reportId,decision,revision,'قرار تحقيق موثّق',op]);
  await assert.rejects(action(reviewer,'assign_self',row.revision),/صلاحية/);
  const initial=row.revision,op=randomUUID();await action(moderator,'assign_self',initial,op);await action(moderator,'assign_self',initial,op);
  row=(await rpc(db,owner,'public.marriage_admin_reports()'))[0];assert.equal(row.assignedTo,moderator.id);
  await pair('close',b,{report:true,reason:'بلاغ عن سلوك غير مناسب'});
  assert.equal((await rpc(db,owner,'public.marriage_admin_reports()'))[0].revision,row.revision,'identical network retry preserves assignment and revision');
  await assert.rejects(action(other,'resolve',row.revision),/مراجع آخر/);
  await assert.rejects(action(owner,'resolve',initial),/تغيّر البلاغ/);
  await review(db,moderator,member.memberId,'suspend',member.revision);member=await detail(db,moderator,member.memberId);assert(member.suspended);
  await review(db,moderator,member.memberId,'restore',member.revision);member=await detail(db,owner,member.memberId);await review(db,reviewer,member.memberId,'approve',member.revision);
  await action(moderator,'resolve',row.revision);assert.equal((await rpc(db,owner,'public.marriage_admin_reports()')).length,0);
  row=(await rpc(db,owner,"public.marriage_admin_reports('resolved')"))[0];assert(row.resolvedAt);
  await assert.rejects(detail(db,moderator,row.reportedId),/قيد التحقيق/);
  member=await detail(db,owner,row.reportedId);await assert.rejects(review(db,moderator,row.reportedId,'suspend',member.revision),/قيد التحقيق/);
  await action(owner,'reopen',row.revision);assert.equal((await rpc(db,owner,'public.marriage_admin_reports()')).length,1);
  await db.exec('set role authenticated');await assert.rejects(db.query('select * from marriage.admin_test_reports'),/permission/);await db.exec('reset role');
 }finally{await db.close();}
});

test('current admin queue manages an already-filed dummy report with scoped, audited decisions',async()=>{
 const db=await createDatabase();try{
  const owner=await staff(db),moderator=await staff(db,'moderator'),other=await staff(db,'moderator'),reviewer=await staff(db,'reviewer');
  // Seed the persisted output only. The separate gateway scenario above exercises creation/retry via tester close.
  const report=(await db.query(`insert into marriage.admin_test_reports(reporter_id,reported_id,reason)
   select a.id,b.id,'بلاغ اختبار للمراجعة' from marriage.admin_test_members a cross join marriage.admin_test_members b
   where a.actor='reham' and b.actor='abdulrahman' returning id,reported_id`)).rows[0];
  const queue=(state='open')=>rpc(db,owner,'public.marriage_admin_reports($1)',[state]);
  const act=(user,decision,revision,operation=randomUUID())=>rpc(db,user,'public.marriage_admin_report_action($1,$2,$3,$4,$5)',
   [report.id,decision,revision,'قرار تحقيق موثّق',operation]);
  let [item]=await queue();
  assert.equal(item.reportId,report.id);assert.equal(item.isDummy,true);assert.equal(item.reportedName,'عبدالرحمن');assert(!('reporterId' in item));
  assert.equal((await rpc(db,owner,'public.marriage_admin_overview()')).counts.openReports,1);
  await assert.rejects(rpc(db,reviewer,'public.marriage_admin_reports()'),/صلاحية/);
  const starting=item.revision,operation=randomUUID();
  await act(moderator,'assign_self',starting,operation);await act(moderator,'assign_self',starting,operation);
  [item]=await queue();assert.equal(item.assignedTo,moderator.id);
  await assert.rejects(act(other,'resolve',item.revision),/مراجع آخر/);await assert.rejects(act(owner,'resolve',starting),/تغيّر البلاغ/);
  assert.equal((await detail(db,moderator,report.reported_id)).isDummy,true);
  await act(moderator,'resolve',item.revision);assert.equal((await queue()).length,0);
  [item]=await queue('resolved');assert.ok(item.resolvedAt);await assert.rejects(detail(db,moderator,report.reported_id),/قيد التحقيق/);
  await act(owner,'reopen',item.revision);assert.equal((await queue())[0].reportId,report.id);
  const audit=await rpc(db,owner,'public.marriage_admin_audit()');
  assert(audit.some(row=>row.action==='resolve' && row.actorId===moderator.id && row.targetId===report.id));
 }finally{await db.close();}
});
