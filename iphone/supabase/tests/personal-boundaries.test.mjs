import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, addUser, asMember, asService } from './harness.mjs';
import { seedCommunicationMember, signCommunicationAgreement } from './communication-fixture.mjs';

test('personal boundaries survive closure, unpaid history, repeat incidents, and message redaction', async () => {
  const db = await createDatabase();
  const scalar = async (expression, args = []) => (await db.query('select ' + expression + ' value', args)).rows[0].value;
  const call = (user, expression, args) => asMember(db, user.id, user.sessionId, () => scalar(expression, args));
  async function member(gender) {
    const u = {id:randomUUID(), sessionId:randomUUID(), email:randomUUID()+'@example.invalid'};
    await addUser(db,u);
    await seedCommunicationMember(db,u,gender);
    await db.query("update marriage.members set manual_access_until=now()+interval '1 day' where id=$1",[u.id]);
    return u;
  }
  async function closed(a,b,request) {
    for (const [actor,peer] of [[a,b],[b,a]]) {
      assert.equal(await call(actor,'public.marriage_profile_visible($1)',[peer.id]),false);
      assert(!(await call(actor,'public.marriage_browse()')).some(row=>row.id===peer.id));
      assert(!(await call(actor,'public.marriage_notifications()')).some(row=>row.person.id===peer.id));
      await assert.rejects(call(actor,"public.marriage_gallery('list',null,$1)",[peer.id]));
      await assert.rejects(call(actor,'public.marriage_message($1,$2,$3)',[request,'unavailable',randomUUID()]));
      await assert.rejects(call(actor,'public.marriage_request($1)',[peer.id]));
    }
  }
  try {
    const a=await member('woman'), b=await member('man'), other=await member('man');
    const request = await call(a,'public.marriage_request($1)',[b.id]);
    await call(b,"public.marriage_discovery_action($1,'interest')",[a.id]);
    assert((await call(a,'public.marriage_notifications()')).some(n=>n.person.id===b.id));
    await call(b,"public.marriage_act($1,'decline')",[request]);
    await closed(a,b,request);
    const visitCount=()=>scalar("(select count(*) from marriage.activity_notifications where kind='profile_visit')");
    const visits=await visitCount();
    await call(b,'public.marriage_note_profile_open($1)',[a.id]);
    assert.equal(await visitCount(),visits);

    for (const recipientBlocks of [true,false]) {
      const x=await member('woman'), y=await member('man');
      const id=await call(x,'public.marriage_request($1)',[y.id]);
      await call(y,"public.marriage_act($1,'accept')",[id]);
      await signCommunicationAgreement(call,x,y,id);
      const first = randomUUID();
      const message=await call(y,'public.marriage_message($1,$2,$3)',[id,'selected text',first]);
      assert.equal(await call(y,'public.marriage_message($1,$2,$3)',[id,'selected text',first]),message);
      for(let n=1;n<12;n++) await call(y,'public.marriage_message($1,$2,$3)',[id,'message '+n,randomUUID()]);
      await assert.rejects(call(y,'public.marriage_message($1,$2,$3)',[id,'excess',randomUUID()]),/تمهّل/);
      await call(recipientBlocks?y:x,"public.marriage_act($1,'block')",[id]);
      await closed(x,y,id);
      await db.query('update marriage.members set manual_access_until=null where id=$1',[y.id]);
      assert((await call(y,'public.marriage_request_history()')).some(r=>r.id===id));
      const report='public.marriage_report_incident($1,$2,$3,$4)';
      const once=randomUUID();
      await assert.rejects(call(other,report,[id,message,'واقعة',randomUUID()]));
      await assert.rejects(call(y,report,[id,message,'واقعة',randomUUID()]));
      const caseId=await call(x,report,[id,message,'تهديد فوري للسلامة',once]);
      assert.equal(await call(x,report,[id,message,'تهديد فوري للسلامة',once]),caseId);
      assert.notEqual(await call(x,report,[id,null,'واقعة أخرى',randomUUID()]),caseId);
      await call(y,report,[id,null,'واقعة أخرى',randomUUID()]);
      await call(y,'public.marriage_delete_message($1,$2)',[id,message]);
      assert.equal(await scalar('(select excerpt from marriage.report_evidence where report_id=$1)',[caseId]),'selected text');
      assert.equal(await scalar("has_table_privilege('authenticated','marriage.report_evidence','select')"),false);
      await assert.rejects(call(other,'public.marriage_report_excerpt($1)',[caseId]));
      if(recipientBlocks) {
        await db.query("insert into marriage.staff_accounts(user_id,role,display_name) values($1,'moderator','مشرف')",[other.id]);
        const staffCall=(exp,args)=>asMember(db,other.id,other.sessionId,async()=>{
          await db.query("select set_config('request.jwt.claims',(auth.jwt() || jsonb_build_object('aal','aal2'))::text,false)");
          return scalar(exp,args);
        });
        await assert.rejects(staffCall('public.marriage_report_excerpt($1)',[caseId]));
        await db.query('insert into marriage.report_reviews(report_id,assigned_to) values($1,$2) on conflict(report_id) do update set assigned_to=excluded.assigned_to',[caseId,other.id]);
        assert.equal((await staffCall('public.marriage_report_excerpt($1)',[caseId])).body,'selected text');
        assert((await staffCall("public.marriage_admin_reports('open',null)"))[0].urgent);
        await db.query("update marriage.report_evidence set expires_at=now()-interval '1 second' where report_id=$1",[caseId]);
        assert.equal(await staffCall('public.marriage_report_excerpt($1)',[caseId]),null);
        await asService(db,()=>scalar('marriage.operations_cleanup()'));
        assert.equal(await scalar('(select count(*)::int from marriage.report_evidence where report_id=$1)',[caseId]),0);
      }
    }
    const profileUser=await member('woman');
    const consent={version:'2026-11-07-privacy',adult:true,terms:true,privacy:true,sensitiveProfile:true,sensitivePublication:true,assessment:true,photo:false};
    const profile={displayName:'اختبار',gender:'woman',age:29,city:'الرياض',profession:'مهندس',bio:'نبذة',contact:profileUser.email,preferredMinAge:25,preferredMaxAge:40,familyPreference:'',signupConsents:consent,consentVersion:consent.version,assessmentVersion:'marriage-v3'};
    const save=answer=>call(profileUser,'public.marriage_apply($1)',[{...profile,surveyAnswers:{wife_work:answer}}]);
    await save('A');
    for(const answer of ['B','C','A']) {await save(answer);await save(answer);}
    await assert.rejects(save('B'),/تمهّل/);
    assert.equal((await call(profileUser,'public.marriage_state()')).profile.surveyAnswers.wife_work,'A');
    const search = () => call(a,'public.marriage_browse($1)',[{work:'A'}]);
    assert(!(await search()).some(p=>p.id===other.id));
    await call(other,'public.marriage_directory_work($1,true)',['A']);
    const card = (await search()).find(p=>p.id===other.id);
    assert(card); assert.equal(card.fit.preferenceEvidence,undefined); assert.deepEqual(card.fit.discussion,[]);
    await call(other,'public.marriage_directory_work(null,true)');
    assert(!(await search()).some(p=>p.id===other.id));
    await call(a,"public.marriage_discovery_action($1,'block')",[other.id]);
    assert.equal(await call(other,'public.marriage_profile_visible($1)',[a.id]),false);
    await call(a,"public.marriage_discovery_action($1,'report','واقعة أولى')",[other.id]);
    await call(a,"public.marriage_discovery_action($1,'report','واقعة أخرى')",[other.id]);
    assert.equal(await scalar('(select count(*)::int from marriage.reports where member_id=$1 and reported_id=$2)',[a.id,other.id]),2);
    const blockedName=(await call(a,'public.marriage_matching_exclusions()')).find(row=>row.id===other.id).alias;
    await db.query("update marriage.profiles set display_name='Updated private alias' where member_id=$1",[other.id]);
    assert.equal((await call(a,'public.marriage_matching_exclusions()')).find(row=>row.id===other.id).alias,blockedName);
    await db.query("insert into marriage.registration_devices(user_id,device_hash) values($1,repeat('c',64)),($2,repeat('c',64))",[a.id,profileUser.id]);
    await db.query("update marriage.members set suspended=true where id=$1",[profileUser.id]);
    assert.equal(await scalar('marriage.repeat_registration($1)',[a.id]),true);
    assert.equal(await scalar('marriage.repeat_registration($1)',[other.id]),false);
    const historicPeer=await member('woman');
    await db.query("insert into marriage.member_requests(requester_id,recipient_id,status,allow_rematch,closed_at) select $1,$2,'cancelled',true,now()-n*interval '1 day' from generate_series(1,53) n",[other.id,historicPeer.id]);
    const newest=await call(historicPeer,'public.marriage_request_history()');
    assert.equal(newest.length,50);
    const older=await call(historicPeer,'public.marriage_request_history_page($1)',[newest.at(-1).id]);
    assert.equal(older.length,3);
    assert.deepEqual(await call(a,'public.marriage_request_history_page($1)',[newest.at(-1).id]),[]);
    await call(historicPeer,'public.marriage_report_incident($1,null,$2,$3)',[older.at(-1).id,'واقعة سابقة',randomUUID()]);
    for(let n=0;n<30;n++) await call(other,'public.marriage_browse()');
    await assert.rejects(call(other,'public.marriage_discover()'),/تمهّل/);
  } finally { await db.close(); }
});

