import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { addUser, asMember, asService, createDatabase } from './harness.mjs';
import { seedCommunicationMember, signCommunicationAgreement } from './communication-fixture.mjs';

test('conduct permissions, deliberate pledge, timed expiry, automated holds, and human appeals',async()=>{
  const db=await createDatabase();
  try {
    const users=await Promise.all(['owner','subject','peer','reviewer','support','moderator'].map(async label=>{
      const value={id:randomUUID(),email:label+'@example.invalid',sessionId:randomUUID()};
      await addUser(db,value);
      return value;
    }));
    const [owner,member,peer,reviewer,support,moderator]=users;
    await db.query("insert into marriage.staff_accounts(user_id,role,display_name) values($1,'owner','فريق وُدَين')",[owner.id]);
    for(const [user,role] of [[reviewer,'reviewer'],[support,'support'],[moderator,'moderator']]){
      await db.query('insert into marriage.staff_accounts(user_id,role,display_name) values($1,$2,$2)',[user.id,role]);
    }
    const memberCall=(actor,cmd,input={})=>asMember(db,actor.id,actor.sessionId,async()=>{
      return (await db.query('select public.marriage_member_conduct($1,$2) items',[cmd,input])).rows[0].items;
    });
    const staffCall=async (cmd,input={},actor=owner,aal='aal2')=>{
      await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:actor.id,session_id:actor.sessionId,role:'authenticated',aal})]);
      await db.exec('set role authenticated');
      try{return (await db.query('select public.marriage_staff_conduct($1,$2) result',[cmd,input])).rows[0].result;}
      finally{await db.exec('reset role');}
    };
    const issue=(kind,details={})=>staffCall('issue',{memberId:member.id,requestId:randomUUID(),kind,policy:'contact',explanation:'يرجى احترام رغبة الطرف الآخر.',...details});
    const send=()=>db.query('insert into marriage.member_requests(requester_id,recipient_id) values($1,$2)',[member.id,peer.id]);
    await assert.rejects(asMember(db,peer.id,peer.sessionId,()=>db.query("select public.marriage_staff_conduct('list','{}')")));
    for(const actor of [reviewer,support])await assert.rejects(staffCall('list',{},actor),/صلاحية/);
    await assert.rejects(staffCall('list',{},owner,'aal1'),/بخطوتين/);
    const warning={memberId:member.id,requestId:randomUUID(),kind:'warning',policy:'contact',explanation:'تنبيه محدد للعضو.'};
    await assert.rejects(staffCall('issue',warning,moderator),/إسناد/);
    const issued=await staffCall('issue',warning);
    assert.deepEqual(await staffCall('issue',warning),issued);
    await assert.rejects(staffCall('issue',{...warning,explanation:'سبب آخر للتنبيه.'}),/تعارض/);
    await assert.rejects(staffCall('issue',{...warning,memberId:owner.id}),/تحقّق/);
    await assert.rejects(issue('restriction',{hours:180}),/أسبوع/);
    await assert.rejects(issue('restriction',{hours:6}),/تنبيه/);
    const {id:pledge}=await issue('pledge',{pledge:'أتعهّد باحترام رغبة الطرف الآخر.'});
    assert.equal((await memberCall(peer,'list')).length,0);
    await assert.rejects(memberCall(peer,'ack',{id:pledge}),/متاح/);
    await assert.rejects(send(),/إرسال طلبات/);
    await memberCall(member,'read',{id:pledge,revision:1});
    await assert.rejects(send(),/إرسال طلبات/);
    await memberCall(member,'ack',{id:pledge});
    const acknowledged=(await memberCall(member,'list')).find(x=>x.id===pledge).acknowledgedAt;
    assert.ok(acknowledged);
    assert.equal((await memberCall(member,'ack',{id:pledge})).find(x=>x.id===pledge).acknowledgedAt,acknowledged);
    const {id:hold}=await issue('restriction',{hours:3});
    await assert.rejects(send(),/إرسال طلبات/);
    await db.query("update marriage.conduct_cases set ends_at=now()-interval '1 second' where id=$1",[hold]);
    // Once the conduct hold expires, the ordinary eligibility guard handles these draft profiles.
    await assert.rejects(send(),/غير متاح للتعارف/);
    const call=(user,expression,args)=>asMember(db,user.id,user.sessionId,async()=> (await db.query('select '+expression+' val',args)).rows[0].val);
    await seedCommunicationMember(db,member,'woman'); await seedCommunicationMember(db,peer,'man');
    await db.query("update marriage.members set manual_access_until=now()+interval '1 day' where id in ($1,$2)",[member.id,peer.id]);
    const request=await call(member,'public.marriage_request($1)',[peer.id]);
    await call(peer,"public.marriage_act($1,'accept')",[request]); await signCommunicationAgreement(call,member,peer,request);
    const message=await call(member,'public.marriage_message($1,$2,$3)',[request,'راح أنشر صورك',randomUUID()]);
    const receipt={version:'2026-11-07-privacy',registrationVersion:'wudayn-entry-2026-11-23-v2',adult:true,terms:true,privacy:true,assessment:true,sensitiveProfile:true,sensitivePublication:false,photo:false,transcript:true,safetyTextReview:true};
    await call(member,'public.wudayn_registration_agreements($1,$2)',['accept',receipt]);
    const text='أرسل المبلغ حتى نكمل التعارف';
    const withPermission=await call(member,'public.marriage_message($1,$2,$3)',[request,text,randomUUID()]);
    const nextText=await call(member,'public.marriage_message($1,$2,$3)',[request,'رسالة أخرى منفصلة',randomUUID()]);
    const submission=randomUUID(),reportArgs=[request,message,'انتهاك الخصوصية',submission];
    await call(peer,'public.marriage_report_incident($1,$2,$3,$4)',reportArgs);
    let ticket=randomUUID();
    const classify=(command,decision=null)=>db.query('select public.marriage_conduct_classifier($1,$2,$3,$4) claim',[command,ticket,'detector-v1',decision]);
    assert.equal((await asService(db,()=>classify('claim'))).rows[0].claim,null);
    await call(peer,'public.marriage_report_incident_with_screen($1,$2,$3,$4)',reportArgs);
    await assert.rejects(asMember(db,peer.id,peer.sessionId,()=>classify('claim')),/permission/);
    const signal=(await asService(db,()=>classify('claim'))).rows[0].claim;
    assert.deepEqual(signal,{finding:'direct_disclosure_threat',reportedCategoryAgrees:true});
    await db.query("update marriage.conduct_screenings set lease_until=now()-interval '1 second' where lease=$1",[ticket]);
    await assert.rejects(asService(db,()=>classify('finish','hold')),/expired/);
    ticket=randomUUID();
    assert.deepEqual((await asService(db,()=>classify('claim'))).rows[0].claim,signal);
    await asService(db,()=>classify('finish','hold')); await asService(db,()=>classify('finish','hold'));
    await assert.rejects(asService(db,()=>classify('finish','review')),/Conflicting/);
    const id=(await staffCall('list'))[0].id;
    assert.equal((await staffCall('list'))[0].id,id);
    const notices=await memberCall(member,'appeal',{id,note:'أرجو التحقق.'});
    assert.ok(notices.find(x=>x.id===id)?.needsReview);
    assert.ok(!('detector' in notices.find(x=>x.id===id)));
    let record=(await staffCall('list'))[0];
    await memberCall(member,'appeal',{id,note:'نقرت مرتين'});
    assert.equal((await staffCall('list'))[0].appealNote,'أرجو التحقق.');
    await assert.rejects(staffCall('review',{id,revision:record.revision-1,decision:'lifted',explanation:'قرار قديم.'}),/تغيّرت/);
    await staffCall('review',{id,revision:record.revision,decision:'lifted',explanation:'رُفع التقييد بعد المراجعة.'});
    record=(await memberCall(member,'list')).find(x=>x.id===id);
    assert.equal(record.decision,'lifted');
    assert.equal(record.unread,true);
    assert.equal((await staffCall('list')).length,0);
    const {id:suspension}=await issue('suspension',{policy:'safety',urgent:true});
    await memberCall(member,'appeal',{id:suspension,note:'أطلب مراجعة.'});
    record=(await staffCall('list'))[0];
    await staffCall('review',{id:suspension,revision:record.revision,decision:'lifted',explanation:'رُفع إيقاف الحساب.'});
    assert.equal((await db.query('select suspended from marriage.members where id=$1',[member.id])).rows[0].suspended,false);
    let triageTicket=randomUUID();
    const triage=(command,result=null)=>asService(db,async()=>(await db.query('select public.wudayn_report_text_triage($1,$2,$3) item',[command,triageTicket,result])).rows[0].item);
    await call(peer,'public.wudayn_report_review_message($1,$2,$3,$4)',reportArgs);
    assert.equal(await triage('claim'),null,'a historical message never leaves for text review');
    const textReport=await call(peer,'public.wudayn_report_review_message($1,$2,$3,$4)',[request,withPermission,'احتيال مالي',randomUUID()]);
    assert.deepEqual(await triage('claim'),{excerpt:text});
    assert.deepEqual(await triage('finish','priority'),{recorded:true});
    assert.equal((await db.query('select result from marriage.report_text_triage where incident_id=$1',[textReport])).rows[0].result,'priority');
    await call(peer,'public.wudayn_report_review_message($1,$2,$3,$4)',[request,nextText,'سوء استخدام',randomUUID()]);
    triageTicket=randomUUID();
    assert.equal((await triage('claim')).excerpt,'رسالة أخرى منفصلة');
    await call(member,'public.wudayn_registration_agreements($1)',['withdrawSafety']);
    assert.equal(await triage('claim'),null);
    assert.deepEqual(await triage('finish','priority'),{recorded:false});
    await call(member,'public.wudayn_registration_agreements($1)',['allowSafety']);
    assert.equal(await triage('claim'),null,'later opt-in cannot reauthorize an earlier message');
  }finally{await db.close();}
});
