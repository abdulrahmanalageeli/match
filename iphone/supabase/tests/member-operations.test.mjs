import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { seedCommunicationMember, signCommunicationAgreement } from './communication-fixture.mjs';
import { createDatabase, addUser } from './harness.mjs';

test('support repair requires owner MFA and a matching case, extends grants once, and requires member authorization for deletion', async()=>{
  const db=await createDatabase();
  try {
    await db.exec("alter table auth.users add column if not exists created_at timestamptz default now(), add column if not exists last_sign_in_at timestamptz;create table if not exists auth.identities(user_id uuid,provider text)");
    const newUser=async()=>{const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.invalid'};await addUser(db,u);return u;};
    const owner=await newUser(), member=await newUser(),other=await newUser();
    await db.query("insert into marriage.staff_accounts(user_id,role,display_name) values($1,'owner','المالك')",[owner.id]);
    await db.query('insert into marriage.members(id) values($1) on conflict do nothing',[member.id]);
    const rpc=async(actor,fn,params,aal='aal2',amrTime=Date.now()/1000)=>{
      await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:actor.id,session_id:actor.sessionId,role:'authenticated',aal,amr:[{method:'totp',timestamp:amrTime}]})]);
      await db.exec('set role authenticated');try{return(await db.query('select public.'+fn+' as result',params)).rows[0].result;}finally{await db.exec('reset role');}
    };
    const act=(cmd,args)=>rpc(owner,'marriage_ops_action($1,$2)',[cmd,{member:member.id,reason:'طلب مساعدة موثق',id:randomUUID(),...args}]);
    const inspect=()=>rpc(owner,'marriage_ops_inspect($1,$2)',['member',{member:member.id}]);
    await assert.rejects(rpc(other,'marriage_ops_inspect($1,$2)',['member',{member:member.id}]));
    await assert.rejects(rpc(owner,'marriage_ops_inspect($1,$2)',['member',{member:member.id}],'aal1'));
    assert.equal((await inspect()).id,member.id);
    const {ticket}=await act('open_case',{category:'billing',subject:'مراجعة اشتراك'});
    await assert.rejects(act('note',{ticket:randomUUID()}));
    const initial=await act('grant',{ticket,tier:'premium',days:20,mode:'extend',expectedEnd:null});
    const payload={ticket,tier:'premium',days:7,mode:'extend',expectedEnd:initial.ends,id:randomUUID()};
    const extended=await act('grant',payload);
    assert.equal(Date.parse(extended.ends)-Date.parse(initial.ends),7*86400000);
    assert.deepEqual(await act('grant',payload),extended);
    await assert.rejects(act('grant',{...payload,id:randomUUID()}));
    const future=await act('grant',{ticket,tier:'seriousness',days:10,mode:'after',expectedEnd:extended.ends});
    assert.equal(Date.parse(future.starts),Date.parse(extended.ends));
    assert.equal((await inspect()).tier,'premium');
    const caseRpc=(actor,action,payload)=>rpc(actor,'marriage_support($1,$2)',[action,payload]);
    await seedCommunicationMember(db,member,'woman');
    await seedCommunicationMember(db,other,'man');
    await act('request_filters',{ticket});
    const options={mode:'all',includeIneligible:true,minAge:60};
    await assert.rejects(caseRpc(other,'case_filters',{id:ticket,options}));
    assert.equal(await caseRpc(member,'case_filters',{id:ticket,options}),true);
    const snapshot=(await inspect()).filterResult;
    assert.equal(snapshot.before,1);assert.equal(snapshot.after,0);
    assert.deepEqual(Object.keys(snapshot).sort(),['after','at','before','mode']);
    await act('offer_export',{ticket});
    const pending=(await inspect()).tickets.find(t=>t.id===ticket);
    await assert.rejects(caseRpc(owner,'admin_reply',{id:ticket,revision:pending.revision,requestId:randomUUID(),status:'resolved',response:'اكتمل التحقق من الإصلاح'}),/لم يتأكّد/);
    await assert.rejects(caseRpc(other,'case_export',{id:ticket}));
    const own=await caseRpc(member,'case_export',{id:ticket});
    assert.ok(own.exportVersion);
    assert.ok((await inspect()).checks.find(c=>c.kind==='export').ok);
    await act('verify_identity',{ticket,field:'تاريخ الميلاد'});
    await assert.rejects(rpc(other,'marriage_ops_member_proof($1)',[ticket]));
    assert.ok((await rpc(member,'marriage_ops_member_proof($1)',[ticket])).verified);
    await act('request_deletion',{ticket});
    await assert.rejects(act('delete',{ticket,confirm:member.id}));
    await assert.rejects(rpc(other,'marriage_confirm_case_deletion($1,$2)',[ticket,true]));
    assert.equal(await rpc(member,'marriage_confirm_case_deletion($1,$2)',[ticket,true]),true);
    await assert.rejects(rpc(owner,'marriage_ops_action($1,$2)',['delete',{member:member.id,ticket,reason:'طلب موثق من العضو',confirm:member.id,id:randomUUID()}],'aal2',Date.now()/1000-600),/تحقق/);
    await assert.rejects(act('delete',{ticket,confirm:other.id}));
    await rpc(member,'marriage_confirm_case_deletion($1,$2)',[ticket,false]);
    await assert.rejects(act('delete',{ticket,confirm:member.id}));
    await rpc(member,'marriage_confirm_case_deletion($1,$2)',[ticket,true]);
    assert.equal((await act('delete',{ticket,confirm:member.id})).deleted,true);
    assert.equal((await db.query('select id from auth.users where id=$1',[member.id])).rows.length,0);
    assert.equal((await db.query('select id from auth.users where id=$1',[other.id])).rows.length,1);
  } finally {await db.close();}
});

// All migrations run, including the launch conduct, publishing and support-role gates.
test('launch support operations through member and staff RPCs',async t=>{
  const db=await createDatabase();
  try {
    await db.exec("alter table auth.users add column if not exists created_at timestamptz default now(), add column if not exists last_sign_in_at timestamptz, add column if not exists phone_change text;create table if not exists auth.identities(user_id uuid,provider text)");
    const fixture=async name=>{
      const u={id:randomUUID(),sessionId:randomUUID(),email:name+'@example.invalid'};
      await addUser(db,u);
      return u;
    };
    const owner=await fixture('owner'),a=await fixture('subject'),b=await fixture('peer'),support=await fixture('support'),moderator=await fixture('moderator');
    for(const [actor,role] of [[owner,'owner'],[support,'support'],[moderator,'moderator']])
      await db.query('insert into marriage.staff_accounts(user_id,display_name,role) values($1,$2,$2)',[actor.id,role]);
    const query=(sql,args)=>db.query(sql,args).then(r=>r.rows[0]);
    const rpc=async(actor,expression,args=[],claims={})=>{
      await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:actor.id,role:'authenticated',session_id:actor.sessionId,aal:'aal2',amr:[{method:'totp',timestamp:Date.now()/1000}],...claims})]);
      await db.exec('set role authenticated');
      try{return(await query('select '+expression+' as v',args)).v;}finally{await db.exec('reset role');}
    };
    const inspect=(actor=a,target=a,command='member',extra={})=>rpc(actor,'public.marriage_ops_inspect($1,$2)',[command,{member:target.id,...extra}]);
    const op=(command,changes={},actor=owner,target=a)=>rpc(actor,'public.marriage_ops_action($1,$2)',[command,{member:target.id,id:randomUUID(),reason:'معالجة طلب العضو',...changes}]);
    const ticketFor=async(category='help')=>(await op('open_case',{category,subject:'متابعة حالة العضو'})).ticket;
    const cases=(actor,command,params={})=>rpc(actor,'public.marriage_support($1,$2)',[command,params]);
    const receipt=async(ticket,kind)=>(await inspect(owner)).checks.find(c=>c.ticket===ticket&&c.kind===kind)?.ok;
    await seedCommunicationMember(db,a,'woman');
    await seedCommunicationMember(db,b,'man');
    await db.query("update marriage.members set manual_access_until=now()+interval '30 days' where id in ($1,$2)",[a.id,b.id]);
    let pair;
    await t.test('8, 11, 16 • exact identity lookup, masked contact, distinct Google account and guarded recovery address',async()=>{
      const ticket=await ticketFor('access');
      const sharedPhone='+966500000001';
      await db.query("insert into auth.identities(user_id,provider) values($1,'google'),($2,'email')",[a.id,b.id]);
      await db.query('update auth.users set phone=$2,phone_confirmed_at=now() where id=$1',[a.id,sharedPhone]);
      for(const key of [a.id,a.email,'٠٥٠٠٠٠٠٠٠١']){
        assert.deepEqual((await inspect(owner,a,'lookup',{query:key})).map(row=>row.id),[a.id]);
      }
      assert.equal((await inspect(owner,a,'lookup',{query:'subject@'})).length,0);
      const detail=await inspect(owner);
      assert.ok(detail.providers.includes('google'));assert.ok(!JSON.stringify(detail).includes(a.email));
      const disclosed=await op('contact',{ticket});assert.equal(disclosed.email,a.email);assert.equal(disclosed.phone,sharedPhone);
      await assert.rejects(op('contact',{ticket},support));
      await assert.rejects(op('recovery_address',{ticket}),/المسجلة ببريد/);
      await assert.rejects(op('recovery_address',{ticket},owner,b),/طلب متابعة/);
      const otherCase=(await op('open_case',{category:'access',subject:'استعادة الحساب الآخر'},owner,b)).ticket;
      assert.equal((await op('recovery_address',{ticket:otherCase},owner,b)).email,b.email);
      const audit=(await query("select bool_or(result::text like $1) leak from marriage.staff_audit where action in('ops_contact','ops_recovery_address')",['%example.invalid%'])).leak;
      assert.equal(audit,false);
    });
    await t.test('9, 24 • Apple repair only completes after worker acknowledgement and grants leave StoreKit access intact',async()=>{
      const ticket=await ticketFor('billing'),original='ops-apple-fixture';
      await assert.rejects(op('apple_check',{ticket}),/لا توجد معاملة/);
      await db.query("insert into marriage.subscription_owners(original_id,member_id,check_after) values($1,$2,now()+interval '3 hours')",[original,a.id]);
      await db.query("insert into marriage.store_transactions(transaction_id,original_id,expires_at,signed_at,revoked,environment,product_id) values($1,$2,now()+interval '35 days',now(),false,'Production','com.blindmatch.marriage.monthly.women')",['ops-entitlement',original]);
      const paidExpiry=(await inspect(owner)).appleEnd;
      assert.ok(paidExpiry);
      await op('apple_check',{ticket});
      assert.equal(await receipt(ticket,'apple_check'),false);
      await assert.rejects(rpc(a,'public.marriage_finish_apple_check($1)',[original]));
      await db.exec('set role service_role');
      try{await db.query('select public.marriage_finish_apple_check($1)',[original]);}finally{await db.exec('reset role');}
      assert.equal(await receipt(ticket,'apple_check'),true);
      const access=(await inspect(owner)).expectedEnd;
      const g=await op('grant',{ticket,expectedEnd:access,tier:'premium',mode:'extend',days:3});
      await assert.rejects(op('revoke_grant',{ticket,source:'current',end:new Date().toISOString()}),/تغيرت المنحة/);
      await op('revoke_grant',{ticket,source:'current',end:g.ends});
      assert.equal((await inspect(owner)).grant,null);assert.equal((await inspect(owner)).appleEnd,paidExpiry);
      const scheduled=await op('grant',{ticket,expectedEnd:paidExpiry,tier:'seriousness',mode:'after',days:7});
      assert.equal(scheduled.starts,paidExpiry);assert.equal((await inspect(owner)).tier,'premium');
      await op('revoke_grant',{ticket,source:'scheduled',end:scheduled.ends});
      assert.ok(await query('select original_id from marriage.subscription_owners where original_id=$1',[original]));
    });
    await t.test('10, 19 • correction compares previous value, reopens an exact field and preserves a draft during repair',async()=>{
      const ticket=await ticketFor(),chapter='compatibility',field='conversation_initiative_preference';
      await db.query("insert into marriage.cities(label) values('جدة') on conflict do nothing");
      await assert.rejects(op('city',{ticket,before:'الدمام',value:'جدة'}),/حداثة الملف/);
      await op('city',{ticket,before:'الرياض',value:'جدة'});assert.equal((await inspect(owner)).city,'جدة');assert.ok((await inspect(owner)).lastProfileEdit);
      await op('request_edit',{ticket,chapter,field});
      const own=(await cases(a,'list')).items.find(x=>x.id===ticket);
      assert.equal(own.editStep,chapter);assert.equal(own.editField,field);
      assert.equal((await cases(b,'list')).items.some(x=>x.id===ticket),false);
      await assert.rejects(op('request_edit',{ticket,chapter:'identity',field:'الاسم الأول'}),/التحقق/);
      const draft={step:'details',confirmedAnswers:{personality:'A'},returnToReview:true};
      await db.query('insert into marriage.onboarding_drafts(member_id,document) values($1,$2)',[a.id,draft]);
      const before=(await inspect(owner)).draft.updated;
      await op('resume',{ticket,before,chapter});await assert.rejects(op('resume',{ticket,before,chapter:'details'}),/نسخة أحدث/);
      const {document}=await query('select document from marriage.onboarding_drafts where member_id=$1',[a.id]);
      assert.equal(document.step,chapter);assert.deepEqual(document.confirmedAnswers,draft.confirmedAnswers);
      const stale={version:1,owner:a.id,baseline:'a'.repeat(64),step:'details',returnToReview:false,answers:{displayName:'عضوة'},permissions:{version:'2026-11-07-privacy',sensitiveProfile:true,assessment:true}};
      const second={...a,sessionId:randomUUID()};
      await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[second.sessionId,a.id]);
      await assert.rejects(rpc(second,"public.marriage_onboarding_draft('save',$1)",[stale]),/حدّث المسودة/);
      await assert.rejects(rpc(second,"public.marriage_onboarding_draft('delete','{}')"),/حدّث المسودة/);
      const loaded=await rpc(a,"public.marriage_onboarding_draft('load','{}')");
      await rpc(a,"public.marriage_onboarding_draft('save',$1)",[{...stale,step:chapter,_supportRevision:loaded._supportRevision}]);
      assert.equal((await rpc(a,"public.marriage_onboarding_draft('load','{}')")).step,chapter);
      await op('refresh',{ticket});assert.equal(await receipt(ticket,'member_confirm'),false);
      await assert.rejects(cases(b,'case_confirm',{id:ticket}));
      await cases(a,'case_confirm',{id:ticket});assert.equal(await receipt(ticket,'member_confirm'),true);
    });
    await t.test('10, 11 • verified phone correction enforces fresh member sign-in and the replacement login factor',async()=>{
      const ticket=await ticketFor('access');
      await op('verify_phone',{ticket});
      await assert.rejects(rpc(a,'public.marriage_ops_member_proof($1)',[ticket],{amr:[{method:'oauth',timestamp:Date.now()/1000-1200}]}),/مجددًا/);
      assert.equal((await rpc(a,'public.marriage_ops_member_proof($1)',[ticket])).authPhoneRequired,true);
      await db.query("update auth.users set phone='+966500000002',phone_change='pending' where id=$1",[a.id]);
      assert.equal((await rpc(a,'public.marriage_ops_member_proof($1)',[ticket])).authPhoneRequired,true);
      await db.query("update auth.users set phone_change='',phone_confirmed_at=now() where id=$1",[a.id]);
      assert.equal((await rpc(a,'public.marriage_ops_member_proof($1)',[ticket])).verified,true);
      assert.equal((await op('contact',{ticket})).phone,'+966500000002');
      assert.equal(await receipt(ticket,'verification'),true);
      const otherTicket=(await op('open_case',{category:'access',subject:'تصحيح رقم الجوال'},owner,b)).ticket;
      await op('verify_phone',{ticket:otherTicket},owner,b);
      const proof='a'.repeat(64),device='b'.repeat(64);
      await db.query("insert into marriage.signup_sms_challenges(proof_hash,email,phone,device_hash,status,verified_at) values($1,$2,'+966500000003',$3,'verified',now())",[proof,b.email,device]);
      assert.equal((await rpc(b,'public.marriage_ops_member_proof($1)',[otherTicket])).smsRequired,true);
      await assert.rejects(rpc(b,'public.marriage_ops_member_proof($1,$2,$3)',[otherTicket,proof,'f'.repeat(64)]));
      assert.equal((await rpc(b,'public.marriage_ops_member_proof($1,$2,$3)',[otherTicket,proof,device])).verified,true);
      assert.equal((await query('select status from marriage.signup_sms_challenges where proof_hash=$1',[proof])).status,'used');
    });
    await t.test('18 • pending and accepted states are distinct and refresh requires both signed consents',async()=>{
      const ticket=await ticketFor();
      await op('city',{ticket,before:'جدة',value:'الرياض'});
      pair=await rpc(a,'public.marriage_request($1)',[b.id]);
      let pairState=await inspect(owner,a,'pair',{peer:b.id});
      assert.equal(pairState.status,'pending');assert.equal(pairState.canChat,false);
      assert.equal((await inspect(owner,a)).pending,1);
      await assert.rejects(op('pair_refresh',{ticket,peer:b.id}));
      await rpc(b,"public.marriage_act($1,'accept')",[pair]);
      assert.equal((await inspect(owner,a,'pair',{peer:b.id})).occupiesSlot,true);
      await assert.rejects(op('pair_refresh',{ticket,peer:b.id}));
      await signCommunicationAgreement(rpc,a,b,pair);
      pairState=await inspect(owner,a,'pair',{peer:b.id});assert.ok(pairState.firstSigned&&pairState.secondSigned);assert.equal(pairState.canChat,true);assert.ok(Date.parse(pairState.fitCheck.at)>0);assert.equal(typeof pairState.fitCheck.covered,'number');
      assert.equal((await op('pair_refresh',{ticket,peer:b.id})).available,true);
      const {topics}=await query("select array_agg(distinct topic) topics from realtime.messages where event='changed' and topic=any($1)",[['marriage:member:'+a.id,'marriage:member:'+b.id]]);
      assert.equal(topics.length,2);assert.equal(await receipt(ticket,'member_confirm'),false);
    });
    await t.test('23 • staff may hide a profile portrait; temporary photo grants are retired',async()=>{
      const ticket=await ticketFor('safety'),portrait=randomUUID();
      await assert.rejects(op('private_withdraw',{ticket,photo:randomUUID()}));
      const support=await inspect(owner);assert.deepEqual(support.privatePhotos,[]);assert.deepEqual(support.photoHistory,[]);
      await db.query('insert into marriage.member_portraits(id,member_id,path,blur,ready) values($1,$2,$3,50,true)',[portrait,a.id,a.id+'/'+portrait+'.jpg']);
      await op('hide_photo',{ticket,photo:portrait});
      assert.equal((await inspect(owner)).portrait,null);assert.equal(await receipt(ticket,'hide_photo'),true);
    });
    await t.test('22, 24 • push retry skips expired jobs, distinguishes queue from provider acceptance, and keeps missing receipts unknown',async()=>{
      const ticket=await ticketFor(),installation=randomUUID();
      await rpc(a,'public.marriage_push_enable(true)');
      await rpc(a,'public.marriage_push_register($1,$2,$3)',['d'.repeat(64),'sandbox',installation]);
      const enqueue=async(expired=false)=>(await query("insert into marriage.push_outbox(member_id,installation_id,request_id,kind,event_key,finished_at,outcome,expires_at) values($1,$2,$3,'message',$4,now(),'failed',case when $5 then now()-interval '1 minute' else now()+interval '1 hour' end) returning id",[a.id,installation,pair,randomUUID(),expired])).id;
      const valid=await enqueue(),expired=await enqueue(true);
      assert.equal((await inspect(owner)).pushEnabled,true);assert.equal((await op('retry_push',{ticket})).queued,1);
      assert.equal((await query('select outcome from marriage.push_outbox where id=$1',[expired])).outcome,'failed');
      assert.equal(await receipt(ticket,'retry_push'),false);
      // The provider worker writes this field after accepting a delivery.
      await db.query("update marriage.push_outbox set outcome='sent',finished_at=now() where id=$1",[valid]);
      assert.equal(await receipt(ticket,'retry_push'),true);
      assert.ok((await inspect(owner)).push.some(p=>p.outcome==='accepted'));
      const removed=await enqueue();
      await op('retry_push',{ticket});await db.query('delete from marriage.push_outbox where id=$1',[removed]);
      assert.equal(await receipt(ticket,'retry_push'),false);
      await rpc(a,'public.marriage_push_enable(false)');
      assert.equal((await inspect(owner)).pushEnabled,false);
    });
    await t.test('12, 20 • shared adjacent evidence, assignment, expiry, and linked prior cases without private identifiers',async()=>{
      const sender=(text)=>rpc(b,'public.marriage_message($1,$2,$3)',[pair,text,randomUUID()]);
      const before=await sender('سياق محدد'),anchor=await sender('رسالة البلاغ'),after=await sender('السياق غير المرفق'),distant=await sender('رسالة غير قريبة');
      const report=(ids)=>rpc(a,'public.marriage_report_incident_context($1,$2,$3,$4,$5)',[pair,anchor,'انتهاك الخصوصية',randomUUID(),ids]);
      await assert.rejects(report([distant]),/السياق/);
      const evidence=await report([before]);
      await assert.rejects(rpc(moderator,'public.marriage_report_excerpt($1)',[evidence]),/إسناد/);
      await assert.rejects(rpc(support,'public.marriage_report_excerpt($1)',[evidence]));
      const body=(await rpc(owner,'public.marriage_report_excerpt($1)',[evidence])).body;
      assert.ok(body.includes('سياق محدد')&&body.includes('رسالة البلاغ')&&!body.includes('السياق غير المرفق'));assert.notEqual(before,after);
      const blocked=await inspect(owner,a,'pair',{peer:b.id});assert.equal(blocked.canChat,false);assert.equal(blocked.fitCheck,null);
      await assert.rejects(op('pair_refresh',{ticket:await ticketFor(),peer:b.id}));
      const hash='c'.repeat(64);
      await db.query('insert into marriage.registration_devices(user_id,device_hash) values($1,$3),($2,$3)',[a.id,b.id,hash]);
      await db.query('update marriage.members set suspended=true where id=$1',[b.id]);
      const history=await inspect(owner);assert.ok(history.repeatReview);assert.ok(history.safetyHistory.some(r=>r.id===evidence&&r.member===b.id));
      assert.ok(!JSON.stringify(history).includes(hash));
      await db.query("update marriage.report_evidence set expires_at=now()-interval '1 second' where report_id=$1",[evidence]);
      assert.equal(await rpc(owner,'public.marriage_report_excerpt($1)',[evidence]),null);
    });
    await t.test('11, 14, 15 • verified closure, revocation of staff and member sessions',async()=>{
      const ticket=await ticketFor('access');
      await op('assign',{ticket,assignee:support.id});await op('note',{ticket});
      let own=(await cases(a,'list')).items.find(x=>x.id===ticket);
      assert.ok(!JSON.stringify(own).includes('معالجة طلب العضو'));
      await op('refresh',{ticket});
      const close=()=>cases(owner,'admin_reply',{id:ticket,status:'resolved',revision:own.revision,requestId:randomUUID(),response:'تم التحقق من الإصلاح بالاشتراك مع العضو'});
      await assert.rejects(close(),/لم يتأكّد/);await cases(a,'case_confirm',{id:ticket});
      own=(await cases(a,'list')).items.find(x=>x.id===ticket);await close();
      await assert.rejects(op('note',{ticket}));await assert.rejects(op('revoke_staff',{},owner,owner));
      await op('revoke_staff',{},owner,support);
      await assert.rejects(cases(support,'admin_list',{}));
      const activeTicket=await ticketFor('access');
      await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[randomUUID(),a.id]);
      assert.ok((await inspect(owner)).sessions>=2);await op('revoke_sessions',{ticket:activeTicket});
      assert.equal((await inspect(owner)).sessions,0);assert.equal(await receipt(activeTicket,'revoke_sessions'),true);
      await assert.rejects(cases(a,'list'));
    });
  }finally{await db.close();}
});
