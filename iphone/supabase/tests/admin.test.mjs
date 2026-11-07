import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';

async function user(db,label){const value={id:randomUUID(),sessionId:randomUUID(),email:label+'@example.invalid'};await addUser(db,value);return value;}
async function staff(db,label,role){const value=await user(db,label);await db.query('insert into marriage.staff_accounts(user_id,role,display_name) values($1,$2,$3)',[value.id,role,label]);return value;}
async function asStaff(db,u,fn,{aal='aal2',extra={}}={}){
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:u.id,session_id:u.sessionId,role:'authenticated',aal,...extra})]);
  await db.exec('set role authenticated');
  try{return await fn();}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claims','',false)");}
}
async function rpc(db,sql,args=[]){return (await db.query('select '+sql+' as result',args)).rows[0].result;}
const profile=(name='عضو')=>({displayName:name,age:29,gender:'woman',city:'الرياض',profession:'باحثة',bio:'ملف للمراجعة',contact:'PRIVATE-CONTACT',preferredMinAge:25,preferredMaxAge:40,familyPreference:'بعد التعارف',interestIds:['reading'],surveyAnswers:{conversation_initiative_preference:'A'},consentVersion:'2026-11-05'});
async function apply(db,u,value=profile()){return asMember(db,u.id,u.sessionId,()=>rpc(db,'public.marriage_apply($1)',[value]));}

test('staff authority requires a live confirmed session, private role and MFA for every privileged RPC',async()=>{
 const db=await createDatabase();
 try{
  const owner=await staff(db,'owner','owner'),ordinary=await user(db,'ordinary'),candidate=await user(db,'candidate');
  await apply(db,candidate);
  await db.exec('set role anon');await assert.rejects(rpc(db,'public.marriage_admin_access()'),/permission/i);await db.exec('reset role');
  const outside=await asStaff(db,ordinary,()=>rpc(db,'public.marriage_admin_access()'),{extra:{user_metadata:{role:'owner'}}});
  assert.equal(outside.authorized,false);assert.equal(outside.role,null);
  const protectedCalls=[['public.marriage_admin_overview()',[]],['public.marriage_admin_applications()',[]],['public.marriage_admin_member($1)',[candidate.id]],
   ['public.marriage_admin_review($1,$2,$3,$4,$5)',[candidate.id,'approve','revision','سبب صالح',randomUUID()]],['public.marriage_admin_reports()',[]],
   ['public.marriage_admin_report_action($1,$2,$3,$4,$5)',[randomUUID(),'resolve','revision','سبب صالح',randomUUID()]],['public.marriage_admin_audit()',[]]];
  for(const [sql,args] of protectedCalls){
   await assert.rejects(asStaff(db,ordinary,()=>rpc(db,sql,args)),/صلاحية/);
   await assert.rejects(asStaff(db,owner,()=>rpc(db,sql,args),{aal:'aal1'}),/بخطوتين/);
  }
  assert.equal((await asStaff(db,owner,()=>rpc(db,'public.marriage_admin_access()'),{aal:'aal1'})).mfaRequired,true);
  await asStaff(db,owner,async()=>{
   for(const table of ['staff_accounts','staff_invitations','staff_audit','report_reviews','contacts','member_answers','thread_messages']){
    await assert.rejects(db.query('select * from marriage.'+table),/permission/i);
   }
   await assert.rejects(rpc(db,'marriage.admin_member_summary($1)',[candidate.id]),/permission/i);
   await assert.rejects(db.query("insert into marriage.staff_accounts(user_id,role,display_name) values($1,'owner','self')",[ordinary.id]),/permission/i);
   assert.equal((await rpc(db,'public.marriage_admin_applications()')).length,1);
   assert.equal((await rpc(db,'public.marriage_admin_overview()')).counts.pendingApplications,1);
  });
  await db.query('update marriage.staff_accounts set active=false where user_id=$1',[owner.id]);
  assert.equal((await asStaff(db,owner,()=>rpc(db,'public.marriage_admin_access()'))).authorized,false);
  await assert.rejects(asStaff(db,owner,()=>rpc(db,'public.marriage_admin_overview()')),/صلاحية/);
  await db.query('update marriage.staff_accounts set active=true where user_id=$1',[owner.id]);
  await db.query("update auth.sessions set not_after=now()-interval '1 minute' where id=$1",[owner.sessionId]);
  await assert.rejects(asStaff(db,owner,()=>rpc(db,'public.marriage_admin_access()')),/تسجيل الدخول/);
  await db.query('delete from auth.sessions where id=$1',[owner.sessionId]);
  await assert.rejects(asStaff(db,owner,()=>rpc(db,'public.marriage_admin_overview()')),/تسجيل الدخول/);
 }finally{await db.close();}
});

test('reviews and investigations enforce scoped roles, stale revisions, attribution, idempotency and safe suspension',async()=>{
 const db=await createDatabase();
 try{
  const owner=await staff(db,'owner','owner'),reviewer=await staff(db,'reviewer','reviewer'),moderator=await staff(db,'moderator','moderator'),other=await staff(db,'othermoderator','moderator');
  const member=await user(db,'member'),peer=await user(db,'peer');
  const memberState=await apply(db,member),peerState=await apply(db,peer,{...profile('طرف آخر'),gender:'man'});
  const as=(u,sql,args=[])=>asStaff(db,u,()=>rpc(db,sql,args));
  const detail=await as(reviewer,'public.marriage_admin_member($1)',[member.id]);
  assert.equal(detail.bio,'ملف للمراجعة');assert.equal(detail.answeredTopics,1);
  for(const secret of ['PRIVATE-CONTACT',member.email,'surveyAnswers','conversation_initiative_preference'])assert.equal(JSON.stringify(detail).includes(secret),false);
  await assert.rejects(as(moderator,'public.marriage_admin_member($1)',[member.id]),/قيد التحقيق/);
  await assert.rejects(as(moderator,'public.marriage_admin_review($1,$2,$3,$4,$5)',[member.id,'suspend',detail.revision,'معرفة المعرّف لا تمنح صلاحية',randomUUID()]),/قيد التحقيق/);
  await assert.rejects(as(moderator,'public.marriage_admin_applications()'),/لمراجعي/);
  await assert.rejects(as(reviewer,'public.marriage_admin_reports()'),/صلاحية/);
  await assert.rejects(as(reviewer,'public.marriage_admin_audit()'),/صلاحية/);
  await apply(db,member,profile('اسم معدّل'));
  await assert.rejects(as(reviewer,'public.marriage_admin_review($1,$2,$3,$4,$5)',[member.id,'approve',detail.revision,'تم التحقق من الطلب',randomUUID()]),/تغيّر الملف/);
  const next=await as(reviewer,'public.marriage_admin_member($1)',[member.id]);
  const operation=randomUUID(),args=[member.id,'approve',next.revision,'تم التحقق من الطلب',operation];
  assert.equal((await as(reviewer,'public.marriage_admin_review($1,$2,$3,$4,$5)',args)).ok,true);
  assert.equal((await as(reviewer,'public.marriage_admin_review($1,$2,$3,$4,$5)',args)).ok,true);
  assert.equal((await db.query('select count(*)::int n from marriage.staff_audit where request_id=$1',[operation])).rows[0].n,1);
  await assert.rejects(as(reviewer,'public.marriage_admin_review($1,$2,$3,$4,$5)',[...args.slice(0,3),'سبب مختلف',operation]),/معرّف إجراء مختلف/);
  const approved=await as(reviewer,'public.marriage_admin_member($1)',[member.id]);
  await assert.rejects(as(reviewer,'public.marriage_admin_review($1,$2,$3,$4,$5)',[member.id,'suspend',approved.revision,'بلاغ قيد التحقق',randomUUID()]),/صلاحية/);
  // The current relationship guard requires both participants to be approved and paid.
  await asService(db,()=>rpc(db,"public.marriage_review($1,'approve')",[peer.id]));
  for(const [account,state] of [[member,memberState],[peer,peerState]]) await asService(db,()=>rpc(db,'public.marriage_record_receipt($1,$2,false)',[account.id,{
    bundleId:'com.blindmatch.marriage',productId:'com.blindmatch.marriage.monthly',appAccountToken:state.user.appAccountToken,
    originalTransactionId:account.id,transactionId:account.id,signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox',
  }]));
  await db.query('insert into marriage.weekly_batches values($1,marriage.current_week())',[member.id]);
  await db.query('insert into marriage.weekly_candidates values($1,marriage.current_week(),1,$2)',[member.id,peer.id]);
  const thread=randomUUID();await db.query("insert into marriage.member_requests(id,requester_id,recipient_id,status) values($1,$2,$3,'accepted')",[thread,member.id,peer.id]);
  const report=randomUUID();await db.query('insert into marriage.reports(id,member_id,reported_id,reason) values($1,$2,$3,$4)',[report,peer.id,member.id,'بلاغ عن تصرف غير مناسب']);
  assert.equal((await as(moderator,'public.marriage_admin_member($1)',[member.id])).memberId,member.id);
  let row=(await as(moderator,'public.marriage_admin_reports()'))[0];assert.equal(row.reportId,report);assert.equal('reporterId' in row,false);
  await as(moderator,'public.marriage_admin_report_action($1,$2,$3,$4,$5)',[report,'assign_self',row.revision,'بدء فحص البلاغ',randomUUID()]);
  await assert.rejects(as(owner,'public.marriage_admin_report_action($1,$2,$3,$4,$5)',[report,'resolve',row.revision,'إغلاق البلاغ بعد الفحص',randomUUID()]),/تغيّر البلاغ/);
  row=(await as(moderator,'public.marriage_admin_reports()'))[0];assert.equal(row.assignedTo,moderator.id);
  await assert.rejects(as(other,'public.marriage_admin_report_action($1,$2,$3,$4,$5)',[report,'assign_self',row.revision,'استلام البلاغ',randomUUID()]),/مراجع آخر/);
  await as(moderator,'public.marriage_admin_review($1,$2,$3,$4,$5)',[member.id,'suspend',approved.revision,'تعليق للحماية أثناء التحقيق',randomUUID()]);
  assert.equal((await db.query('select status from marriage.member_requests where id=$1',[thread])).rows[0].status,'closed');
  let suspended=await as(owner,'public.marriage_admin_member($1)',[member.id]);assert.equal(suspended.suspended,true);
  await assert.rejects(as(owner,'public.marriage_admin_review($1,$2,$3,$4,$5)',[member.id,'approve',suspended.revision,'قبول مباشر غير مسموح',randomUUID()]),/رفع التعليق/);
  await as(moderator,'public.marriage_admin_review($1,$2,$3,$4,$5)',[member.id,'restore',suspended.revision,'اكتمل التحقق ورفع التعليق',randomUUID()]);
  const restored=await as(owner,'public.marriage_admin_member($1)',[member.id]);assert.equal(restored.status,'pending');assert.equal(restored.suspended,false);
  assert.notEqual(restored.revision,suspended.revision);assert.equal((await db.query('select status from marriage.member_requests where id=$1',[thread])).rows[0].status,'closed');
  const resolveId=randomUUID(),resolveArgs=[report,'resolve',row.revision,'اكتمل التحقيق ووثّق القرار',resolveId];
  await as(moderator,'public.marriage_admin_report_action($1,$2,$3,$4,$5)',resolveArgs);
  await as(moderator,'public.marriage_admin_report_action($1,$2,$3,$4,$5)',resolveArgs);
  row=(await as(moderator,"public.marriage_admin_reports('resolved')"))[0];assert(row.resolvedAt);
  await assert.rejects(as(moderator,'public.marriage_admin_review($1,$2,$3,$4,$5)',[member.id,'suspend',restored.revision,'انتهى التحقيق ولا يجيز التعليق',randomUUID()]),/قيد التحقيق/);
  await as(owner,'public.marriage_admin_report_action($1,$2,$3,$4,$5)',[report,'reopen',row.revision,'استئناف التحقيق بعد المراجعة',randomUUID()]);
  const audit=await as(owner,'public.marriage_admin_audit()');
  const action=audit.find(e=>e.action==='approve');assert.equal(action.actorId,reviewer.id);assert.equal(action.actorRole,'reviewer');assert.equal(action.reason,'تم التحقق من الطلب');
  assert(audit.some(e=>e.action==='member_viewed'&&e.actorId===moderator.id));
  await assert.rejects(db.query('update marriage.staff_audit set reason=$1 where id=$2',['tamper',action.id]),/غير قابل/);
  await assert.rejects(db.query('delete from marriage.staff_audit where id=$1',[action.id]),/غير قابل/);
 }finally{await db.close();}
});

test('trusted email reservation claims once from current confirmed Auth identity and never bypasses MFA',async()=>{
 const db=await createDatabase();
 try{
  const invited=await user(db,'invited'),wrong=await user(db,'wrong'),expired=await user(db,'expired'),unconfirmed=await user(db,'unconfirmed');
  await db.query("insert into marriage.staff_invitations(email,role,display_name,expires_at) values($1,'owner','Founder',now()+interval '7 days'),($2,'reviewer','Expired',now()-interval '1 minute'),($3,'reviewer','Unconfirmed',now()+interval '1 day')",[invited.email,expired.email,unconfirmed.email]);
  const access=(u,options)=>asStaff(db,u,()=>rpc(db,'public.marriage_admin_access()'),options);
  assert.equal((await access(wrong,{extra:{email:invited.email,user_metadata:{email:invited.email,role:'owner'}}})).authorized,false);
  assert.equal((await access(expired)).authorized,false);
  await db.query("update auth.users set email_confirmed_at=null,phone='+966500000000',phone_confirmed_at=now() where id=$1",[unconfirmed.id]);
  assert.equal((await access(unconfirmed)).authorized,false);
  const claimed=await access(invited,{aal:'aal1'});assert.equal(claimed.authorized,true);assert.equal(claimed.role,'owner');assert.equal(claimed.mfaRequired,true);
  await assert.rejects(asStaff(db,invited,()=>rpc(db,'public.marriage_admin_overview()'),{aal:'aal1'}),/بخطوتين/);
  assert.equal((await access(invited)).mfaRequired,false);
  const reservation=(await db.query('select claimed_by,claimed_at from marriage.staff_invitations where email=$1',[invited.email])).rows[0];assert.equal(reservation.claimed_by,invited.id);assert(reservation.claimed_at);
  await db.query('update marriage.staff_accounts set active=false where user_id=$1',[invited.id]);
  assert.equal((await access(invited)).authorized,false);
  await db.query("update marriage.staff_invitations set claimed_by=null,claimed_at=null where email=$1",[invited.email]);
  assert.equal((await access(invited)).authorized,false,'an invitation must not reactivate revoked staff');
  await asStaff(db,wrong,async()=>{await assert.rejects(db.query("insert into marriage.staff_invitations(email,role,display_name,expires_at) values('attacker@example.invalid','owner','x',now())"),/permission/i)});
 }finally{await db.close();}
});
