import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember} from './harness.mjs';
import {seedCommunicationMember} from './communication-fixture.mjs';

const today="(now() at time zone 'Asia/Riyadh')::date";
const day=offset=>`((${today} + (${offset}))::timestamp at time zone 'Asia/Riyadh' + interval '2 hours')`;
const ids=rows=>rows.map(r=>r.memberId).sort();
test('31–32: private follow-through, reciprocal progress, calibrated opportunity thresholds and switches',()=>suite(async({db,account,ownerRpc})=>{
 const member=await account('follow'), other=await account('other');
 const signals=(u,days=7)=>ownerRpc('marriage_admin_member_signals($1,$2)',[u.id,days]);
 const calibrate=(minimum,rate)=>ownerRpc('marriage_admin_follow_policy($1,$2)',[minimum,rate]);
 assert.equal((await signals(member)).level,'calibrating');
 await assert.rejects(calibrate(5,0.8),/المعايرة/);await assert.rejects(calibrate(4,0.8),/الحد الأدنى/);
 await db.exec("update marriage.launch_measurement set started_at=now()-interval '40 days'");
 const peers=Array.from({length:57},()=>randomUUID());
 await db.query("insert into auth.users(id,email,email_confirmed_at) select p,p::text||'@example.invalid',now() from unnest($1::uuid[]) p",[peers]);
 await db.exec("set session_replication_role='replica'");
 const pairs=[];
 for(const [i,peer] of peers.entries()){
  const id=randomUUID(),actor=i<10?member.id:other.id,age=i===5?1:i===9?12:4;
  const first=i===8?actor:peer, reverse=i===2;
  pairs.push(id);
  await db.query(`insert into marriage.member_requests(id,requester_id,recipient_id,status,created_at,analytics_accepted_at)
   values($1,$2,$3,'accepted',now()-make_interval(days=>$4::int)-interval '1 day',now()-make_interval(days=>$4::int)-interval '2 hours')`,[id,reverse?peer:actor,reverse?actor:peer,age]);
  await db.query("insert into marriage.conversation_agreements values($1,jsonb_build_object('status','accepted','manSignedAt',now()-make_interval(days=>$2::int)-interval '1 hour','womanSignedAt',now()-make_interval(days=>$2::int)-interval '1 hour'))",[id,age]);
  await db.query("insert into marriage.thread_messages(request_id,sender_id,client_id,body,created_at) values($1,$2,gen_random_uuid(),'a',now()-make_interval(days=>$3::int))",[id,first,age]);
  if(i<5)await db.query("insert into marriage.thread_messages(request_id,sender_id,client_id,body,created_at) select $1,$2,gen_random_uuid(),'b',min(created_at)+make_interval(hours=>$3::int) from marriage.thread_messages where request_id=$1",[id,actor,i===3?48:i===4?55:24]);
 }
 await db.query("insert into marriage.blocks(member_id,blocked_id) values($1,$2)",[member.id,peers[6]]);
 await db.query("update marriage.member_requests set status='closed',closed_at=now(),closure_outcome='closed',analytics_closed_by=$2 where id=$1",[pairs[7],member.id]);
 await db.query("insert into marriage.stage_choices(request_id,stage,member_id) values($1,1,$2),($1,1,$3),($1,2,$2)",[pairs[0],member.id,peers[0]]);
 const room=randomUUID();
 await db.query("insert into marriage.family_rooms(id,connection_id,request_id,member_a,member_b,created_by,title) values($1,$2::uuid::text,$2,'member:'||$3,'member:'||$4,'member:'||$3,'Family')",[room,pairs[0],member.id,peers[0]]);
 await db.query("insert into marriage.family_room_approvals(room_id,member_key) values($1,'member:'||$2),($1,'member:'||$3)",[room,member.id,peers[0]]);
 await db.exec("set session_replication_role='origin'");
 const weekly=await signals(member);assert.deepEqual(weekly,{sent:8,received:1,acceptedSent:8,acceptedReceived:1,messaged:6,sentMessages:6,newThreads:9,twoWay:5,perThread:1,opportunities:5,replied:4,steps:1,family:1,closed:1,level:'calibrating'});
 assert.equal((await signals(member,30)).opportunities,6);await assert.rejects(signals(member,14),/تعذّر/);
 await assert.rejects(calibrate(20,0.8),/المعايرة/);await calibrate(5,0.8);
 assert.equal((await signals(member)).level,'regular');assert.equal((await signals(member,30)).level,'intermittent');
 assert.equal((await signals(other)).level,'intermittent');assert.equal((await signals({id:peers[0]})).level,'insufficient');
 await calibrate(null,null);assert.equal((await signals(member)).level,'calibrating');
 assert.equal((await db.query("select count(*)::int n from marriage.staff_audit where action='follow_policy_changed'")).rows[0].n,2);
}));

test('6: discovery supply, gendered first-request timing, acceptances and pair-once communication',()=>suite(async({db,account,range})=>{
 const man=await account('reach-man','man'),woman=await account('reach-woman','woman'),isolated=await account('reach-isolated','woman');
 const id=randomUUID();
 await db.exec("set session_replication_role='replica'");
 await db.query(`insert into marriage.reviews(member_id,action,recorded_at) values($1,'approve',${day('-6')}),($2,'approve',${day('-5')})`,[man.id,woman.id]);
 await db.query("insert into marriage.blocks(member_id,blocked_id) values($1,$2)",[isolated.id,man.id]);
 await db.query(`insert into marriage.member_requests(id,requester_id,recipient_id,status,created_at,analytics_accepted_at) values($1,$2,$3,'accepted',${day('-4')}+interval '12 hours',${day('-3')})`,[id,man.id,woman.id]);
 await db.query(`insert into marriage.conversation_agreements values($1,jsonb_build_object('status','accepted','womanSignedAt',${day('-3')},'manSignedAt',${day('-2')}))`,[id]);
 await db.exec("set session_replication_role='origin'");
 const data=await range(-6),m=data.metrics;
 assert.deepEqual(m.discoverable,{man:1,woman:2,unknown:0,total:3});
 assert.deepEqual(m.zero_eligible,{man:0,woman:1,unknown:0,total:1});
 assert.deepEqual(m.requests,{man:1,woman:0,unknown:0,total:1});assert.equal(m.accepted_cohort.total,1);assert.deepEqual(m.communication,m.requests);
 assert.equal(data.waits.sent.man,60);assert.equal(data.waits.received.woman,36);
}));

test('5 and 7: StoreKit receipts, campaign reservations, explicit offer choices, current paid and granted access',()=>suite(async({db,account,range,event,list})=>{
 const active=await account('active','woman'),converted=await account('converted','man'),expired=await account('expired','woman'),
 reserved=await account('reserved','man'),grant=await account('grant','woman'),sandbox=await account('sandbox','man'),revoked=await account('revoked','man'),failed=await account('retry','woman');
 for(const u of [active,converted,reserved,expired]){await event(u,'eligible','trial');await event(u,'offer_seen','trial');}
 await event(active,'checkout','trial');await event(expired,'chose_free','trial');await event(reserved,'left_offer','trial');
 await event(grant,'chose_free','standard');await event(grant,'offer_seen','standard');
 await db.exec('update marriage.launch_offer_campaigns set enabled=true,capacity=5');
 await db.query("insert into marriage.launch_offer_claims(member_id,gender,app_transaction_id) values($1,'man','100001')",[reserved.id]);
 await db.query("insert into marriage.scheduled_grants values($1,'seriousness',now()-interval '1 day',now()+interval '6 days')",[grant.id]);
 const original=async(u)=>{const key=randomUUID();await db.query('insert into marriage.subscription_owners(original_id,member_id) values($1,$2)',[key,u.id]);return key;};
 const receipt=async(orig,{start=-1,end=6,trial=false,revoked=false,env='Production',product='men'})=>{
  const tx=randomUUID();await db.query(`insert into marriage.store_transactions(transaction_id,original_id,purchased_at,signed_at,expires_at,revoked,environment,product_id,analytics_trial)
   values($1,$2,${day('$3::int')},${day('$3::int')},${day('$4::int')},$5,$6,$7,$8)`,[tx,orig,start,end,revoked,env,'com.blindmatch.marriage.monthly.'+product,trial]);return tx;};
 const liveOrig=await original(active);const liveTx=await receipt(liveOrig,{trial:true,product:'women'});
 await db.query("update marriage.subscription_owners set status_transaction=$2,renewal_status=1,auto_renew=false,status_at=now() where original_id=$1",[liveOrig,liveTx]);
 const convOrig=await original(converted);
 // Apple upgraded this overlapping trial early. Its old expiry is still in the future.
 await receipt(convOrig,{start:-5,end:2,trial:true});
 const paidTx=await receipt(convOrig,{start:-1,end:29,product:'seriousness'});
 await db.query("update marriage.subscription_owners set status_transaction=$2,renewal_status=1,status_at=now() where original_id=$1",[convOrig,paidTx]);
 await receipt(await original(expired),{start:-12,end:-5,trial:true,product:'women'});
 await receipt(await original(sandbox),{env:'Sandbox'});
 await receipt(await original(revoked),{revoked:true});
 const retryOrig=await original(failed);const retryTx=await receipt(retryOrig,{start:-30,end:-1,product:'women'});
 await db.query("update marriage.subscription_owners set status_transaction=$2,renewal_status=3,billing_retry=true,status_at=now() where original_id=$1",[retryOrig,retryTx]);
 const renewed=await account('renewed','man');const renewedOrig=await original(renewed);
 await receipt(renewedOrig,{start:-65,end:-58,trial:true});
 await receipt(renewedOrig,{start:-58,end:-29});await receipt(renewedOrig,{start:-28,end:2});
 const result=await range(-29),m=result.metrics;
 for(const [k,n] of Object.entries({eligible_trial:4,offer_seen_trial:4,checkout_trial:1,chose_free_trial:1,left_offer_trial:1,no_choice_trial:1,chose_free_standard:1,verified_trial:3,trial_converted:1,trial_expired:1,active_trial:1,paid_subscriber:2,store_access:3,tier_free:5,tier_premium:2,tier_seriousness:2,renewal_off:1,billing_retry:1,revoked:1,grant:1}))assert.equal(m[k]?.total,n,k);
 assert.deepEqual(m.slots,{man:4,woman:5,unknown:0,total:9});assert.equal((await list(sandbox.id))[0].tier,'free');
 assert.equal((await list(grant.id))[0].tier,'seriousness');assert.equal(result.issues.find(i=>i.key==='purchase').n,0);
 // Simulate an entitlement lookup incident underneath a genuine, still-current Apple receipt.
 await db.exec(`create or replace function marriage.apple_access_until(target uuid) returns timestamptz
  language sql stable set search_path='' as $$select case when exists(select 1 from auth.users where id=target and email='active@example.invalid')
  then null else marriage.apple_product_access_until(target,false) end$$`);
 const incident=(await range(-29)).issues.find(i=>i.key==='purchase');
 assert.equal(incident.n,1);assert.ok(incident.oldest);assert.deepEqual(ids(await list('','issue_purchase')),[active.id]);
}));
async function suite(fn){
 const db=await createDatabase();
 try{
  const account=async(name,gender,status='approved')=>{
   const u={id:randomUUID(),sessionId:randomUUID(),email:name+'@example.invalid'};
   await addUser(db,u);
   if(gender){await seedCommunicationMember(db,u,gender,status);await db.query('update marriage.profiles set display_name=$2 where member_id=$1',[u.id,name]);}
   return u;
  };
  const owner=await account('launch-owner');
  await db.query("insert into marriage.staff_accounts(user_id,role,display_name) values($1,'owner','المالك')",[owner.id]);
  const ownerRpc=async(sql,args=[])=>{
   await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:owner.id,session_id:owner.sessionId,role:'authenticated',aal:'aal2'})]);
   await db.exec('set role authenticated');
   try{return (await db.query('select public.'+sql+' as value',args)).rows[0].value;}finally{await db.exec("reset role;reset request.jwt.claims");}
  };
  const range=(start,end=0)=>ownerRpc(`marriage_admin_launch_analytics(${today}+$1::int,${today}+$2::int)`,[start,end]);
  const event=(u,kind,step,offset=0,platform='web',build='one')=>db.query(
   `insert into marriage.launch_events(member_id,day,kind,step,first_at,last_at,platform,build) values($1,${today}+$2::int,$3,$4,${day('$2::int')},${day('$2::int')},$5,$6) on conflict do nothing`,[u.id,offset,kind,step,platform,build]);
  const list=(q='',stage='all',stalled=0,before=null)=>ownerRpc('marriage_admin_launch_directory($1,$2,$3,$4)',[q,stage,stalled,before]);
  await fn({db,account,ownerRpc,range,event,list});
 }finally{await db.close();}
}

test('1–4 and 7/21: Riyadh cohorts, signup progress, retention and incident drilldowns',()=>suite(async({db,account,range,event,list})=>{
 const man=await account('نواف','man'),woman=await account('هند','woman'),pending=await account('انتظار','woman','pending');
 const fresh=await account('created'),old=await account('stalled'),mid=await account('midway'),guardian=await account('family'),dummy=await account('dummy');
 await db.query("update marriage.members set is_dummy=true where id=$1",[dummy.id]);
 await db.query("insert into marriage.family_accounts(user_id,display_name,consent_version) values($1,'family','family-v1')",[guardian.id]);
 await db.query(`update marriage.members set joined_at=${day('-12')} where id in($1,$2,$3,$4,$5)`,[man.id,woman.id,old.id,mid.id,pending.id]);
 await db.query(`insert into marriage.signup_phone_verifications(user_id,phone,verified_at) values($1,'+966500000001',now()),($2,'+966500000002',${day('-9')})`,[fresh.id,mid.id]);
 await db.query(`insert into marriage.onboarding_drafts(member_id,document,updated_at) values($1,'{"step":"compatibility","answers":{"gender":"woman"}}',${day('-2')})`,[mid.id]);
 await db.query(`insert into marriage.reviews(member_id,action,recorded_at) values($1,'approve',${day('-9')}),($2,'approve',${day('-8')}),($3,'submit',${day('-3')})`,[man.id,woman.id,pending.id]);
 await db.exec("update marriage.launch_measurement set started_at=now()-interval '31 days'");
 await db.query("insert into marriage.application_integrity_receipts(member_id,agreement_version,submitted_fingerprint,decision,review_reasons) values($1,'wudayn-application-integrity-v1','test','manual_review',array['photo_review'])",[pending.id]);
 await db.query("update marriage.members set paused=true where id=$1",[woman.id]);
 await db.query("insert into marriage.admin_membership_grants values($1,'premium',now()+interval '5 days')",[woman.id]);
 await event(mid,'completed','identity',-3);await event(mid,'reached','compatibility',-2);await event(mid,'resumed','compatibility',-2);
 for(const step of ['eligibility','personality','details','criteria','preferences','story','avatar','readiness']){
  await event(woman,'reached',step,-1);await event(woman,'completed',step,-1);
 }
 assert.deepEqual(ids(await list('','created')),[fresh.id]);
 await event(man,'completed','story',-1);await event(mid,'error','compatibility',-1);
 await event(man,'activity','discovery',-8);await event(man,'activity','profile',-2);await event(woman,'activity','discovery',-7);
 await event(woman,'activity','luna');await event(woman,'activity','profile');await event(fresh,'reached','identity');
 await event(pending,'activity','profile',-20);
 await event(dummy,'activity','discovery');await event(guardian,'activity','discovery');
 for(const [u,n] of [[man,3],[woman,0],[dummy,20]]){
  await asMember(db,u.id,u.sessionId,async()=>{
   await db.query("select public.marriage_launch_note('luna_carried',$1)",[String(n)]);
   await db.query("select public.marriage_launch_note('luna_carried','6','ios','newbuild')");
   await assert.rejects(db.query("select public.marriage_launch_note('luna_carried','some field name')"),/Invalid count/);
  });
 }
 await db.query(`insert into marriage.launch_sms_daily values(${today},'signup_start',5),(${today},'provider_error',2)`);
 await event(man,'fault','compatibility',0,'ios','alpha');await event(pending,'fault','review',0,'web','beta');
 await event(woman,'fault','compatibility',0,'ios','alpha');await event(woman,'success','compatibility',-1,'ios','alpha');
 await event(woman,'fault','compatibility',0,'web','beta');await event(dummy,'fault','compatibility',0,'ios','alpha');
 await db.query("insert into marriage.reports(member_id,reported_id,reason) values($1,$2,'reported')",[woman.id,man.id]);
 const data=await range(-29),m=data.metrics;
 assert.equal(data.family,1);assert.deepEqual(m.joined,{woman:3,man:1,unknown:2,total:6});
 assert.equal((await range(0)).metrics.joined.total,1);await assert.rejects(range(1,0),/فترة/);await assert.rejects(range(-370),/فترة/);
 assert.deepEqual(ids(await list('','phone_pending',168)),[old.id]);assert.deepEqual(ids(await list('','onboarding',24)),[mid.id]);assert.deepEqual(ids(await list('','onboarding',168)),[]);
 assert.equal((await list('midway@example.invalid'))[0].step,'compatibility');assert.equal((await list('+966500000002'))[0].lastCompleted,'identity');
 assert.equal((await list('هند'))[0].tier,'premium');assert.equal((await list('هند'))[0].visibility,'paused');
 const row=(await list(pending.id))[0];assert.equal(row.stage,'pending');assert.deepEqual(row.blockers,['photo_review']);
 for(const [key,count] of Object.entries({sms_signup_start:5,applicable_story:2,reached_story:1,completed_story:2,applicable_eligibility:1,completed_personality:1,resumed_compatibility:1,error_compatibility:3,completed_review:1,dau:1,wau:2,mau:3,luna_measured:2,luna_with_carried:1,luna_carried_answers:3,retention_due_1:2,retention_return_1:2,retention_due_7:2,retention_return_7:1,onboarding_active:4})){
  assert.equal(m[key]?.total,count,key);
 }
 assert.equal(m.applicable_beena,undefined);assert.equal(m.sms_signup_start.unknown,5);
 const issues=Object.fromEntries(data.issues.map(i=>[i.key,i]));for(const [k,n] of Object.entries({sms:2,safety:1,luna:2,submission:1,reviews:1}))assert.equal(issues[k].n,n,k);
 assert.deepEqual(ids(await list('','issue_submission')),[pending.id]);assert.deepEqual(ids(await list('','issue_reviews')),[pending.id]);
 const ios=data.incidents.find(i=>i.build==='alpha');assert.equal(ios.affected,2);assert.ok(ios.last_success&&ios.first_at&&ios.last_at);
 assert.deepEqual(ids(await list('','incident:compatibility:ios:alpha')),[man.id,woman.id].sort());
 assert.deepEqual(ids(await list('','incident:review:web:beta')),[pending.id]);
}));
