import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';
import {seedCommunicationMember,signCommunicationAgreement} from './communication-fixture.mjs';

test('exclusive consent closes competing connections, blocks stale requests, preserves messages and isolates visit notifications',async()=>{
 const db=await createDatabase();
 const call=(u,sql,args=[])=>asMember(db,u.id,u.sessionId,()=>db.query('select '+sql+' as value',args).then(r=>r.rows[0].value));
 async function add(gender){
  const u={id:randomUUID(),email:randomUUID()+'@example.test',sessionId:randomUUID()};await addUser(db,u);
  const appAccountToken=await seedCommunicationMember(db,u,gender);
  await asService(db,()=>db.query('select public.marriage_record_receipt($1,$2,false)',[u.id,{bundleId:'com.blindmatch.marriage',productId:'com.blindmatch.marriage.monthly',appAccountToken,originalTransactionId:u.id,transactionId:u.id,signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox'}]));return u;
 }
 try{
  const a=await add('man'),b=await add('woman'),c=await add('woman'),d=await add('man');
  await call(a,'public.marriage_discover()');await call(b,'public.marriage_discover()');
  const ab=await call(a,'public.marriage_request($1)',[b.id]),ac=await call(a,'public.marriage_request($1)',[c.id]),bd=await call(b,'public.marriage_request($1)',[d.id]);
  await call(b,"public.marriage_act($1,'accept')",[ab]);await call(c,"public.marriage_act($1,'accept')",[ac]);
  const alerts=(user,ids)=>call(user,'public.marriage_alert_progress($1)',[ids]);
  const alertFields=new Set(['stage','mine','peer','exclusive','consentMine','consentPeer','rewindPeer','updatedAt']);
  async function alertSnapshot(user,id){
   const progress=await call(user,'public.marriage_progress($1)',[id]);
   return Object.fromEntries(Object.entries(progress).filter(([field])=>alertFields.has(field)));
  }
  assert.deepEqual(await alerts(a,[ab,ac,bd,ab]),{[ab]:await alertSnapshot(a,ab),[ac]:await alertSnapshot(a,ac)});
  assert.deepEqual(await alerts(d,[ab,ac,bd]),{});
  assert.deepEqual(await alerts({...a,sessionId:randomUUID()},[ab,ac]),{});
  assert.deepEqual(await alerts(a,[]),{});
  await assert.rejects(alerts(a,Array(25).fill(ab)),{code:'22023'});
  const privilege=await db.query("select has_function_privilege('anon','public.marriage_alert_progress(uuid[])','execute') as anon, has_function_privilege('service_role','public.marriage_alert_progress(uuid[])','execute') as service");
  assert.deepEqual(privilege.rows[0],{anon:false,service:false});
  await signCommunicationAgreement(call,b,a,ab);await signCommunicationAgreement(call,c,a,ac);
  const message=randomUUID();await call(a,'public.marriage_message($1,$2,$3)',[ac,'يبقى هذا السجل محفوظًا',message]);
  await call(a,'public.marriage_note_profile_open($1)',[b.id]);await call(a,'public.marriage_note_profile_open($1)',[b.id]);
  let notices=await call(b,'public.marriage_notifications()');assert.equal(notices.length,1);assert.equal(notices[0].person.id,a.id);
  await call(c,'public.marriage_notifications_read($1)',[[notices[0].id]]);assert.equal((await call(b,'public.marriage_notifications()'))[0].readAt,null);
  await call(b,'public.marriage_notifications_read($1)',[[notices[0].id]]);assert((await call(b,'public.marriage_notifications()'))[0].readAt);
  await assert.rejects(call(a,'public.marriage_next_step($1,1,true)',[ab]),/حدّث/);
  const offer=await call(a,"public.marriage_journey_choice($1,'exclusive','propose')",[ab]);
  assert.deepEqual((await alerts(b,[ab]))[ab],await alertSnapshot(b,ab));
  assert.equal((await alerts(b,[ab]))[ab].consentPeer,true);
  assert.equal((await call(a,'public.marriage_progress($1)',[ab])).exclusive,false);
  assert.equal((await db.query('select status from marriage.member_requests where id=$1',[ac])).rows[0].status,'accepted');
  await assert.rejects(call(c,"public.marriage_journey_choice($1,'exclusive','accept',$2)",[ab,offer.exclusiveId]),/المحادثة/);
  const agreed=await call(b,"public.marriage_journey_choice($1,'exclusive','accept',$2)",[ab,offer.exclusiveId]);assert.equal(agreed.exclusive,true);assert.equal(agreed.stage,0);
  const closed=(await db.query('select status from marriage.member_requests where id=any($1::uuid[])',[[ac,bd]])).rows;assert(closed.every(r=>r.status==='closed'));
  assert.deepEqual(await alerts(a,[ab,ac]),{[ab]:await alertSnapshot(a,ab)});
  assert.equal(Number((await db.query('select count(*) n from marriage.thread_messages where request_id=$1',[ac])).rows[0].n),1);
  await assert.rejects(call(a,'public.marriage_request($1)',[c.id]),/متاح/);
  await assert.rejects(db.query("update marriage.member_requests set status='accepted' where id=$1",[ac]),/حصري/);
  assert.equal((await call(a,'public.marriage_inbox()'))[0].person.exclusive,true);
  assert((await call(b,'public.marriage_notifications()')).some(n=>n.kind==='exclusive'));
  await call(a,"public.marriage_act($1,'cancel')",[ab]);
  assert.equal(Number((await db.query('select count(*) n from marriage.exclusive_members')).rows[0].n),0);
  assert.equal((await db.query('select status from marriage.member_requests where id=$1',[ac])).rows[0].status,'closed');
 }finally{await db.close();}
});

test('tester legacy stage requires fresh mutual consent; visits deduplicate and reads belong to recipient',async()=>{
 const db=await createDatabase();try{
  const a='a'.repeat(64),b='b'.repeat(64);
  const rpc=(action,session,payload={})=>asService(db,()=>db.query('select public.nisfayn_test_rpc($1,$2,$3) value',[action,session,payload]).then(r=>r.rows[0].value));
  await rpc('login',a,{actor:'abdulrahman'});await rpc('login',b,{actor:'reham'});
  await db.exec(`update nisfayn_test.room set data=data||'{"stage":1,"agree":{},"messages":[],"matched":true}'::jsonb`);
  await assert.rejects(rpc('step',a,{stage:1,agree:true}),/حدّث/);
  let s=await rpc('step',a,{topic:'exclusive',decision:'propose'});assert(!s.exclusive);assert.equal(s.stage,1);
  s=await rpc('step',b,{topic:'exclusive',decision:'accept',expectedId:s.exclusiveId});assert.equal(s.exclusive,true);assert.equal(s.retiredFictional,true);
  await rpc('profile_visit',a,{person:'reham'});await rpc('profile_visit',a,{person:'reham'});
  const notices=await rpc('notifications',b);assert.equal(notices.filter(n=>n.kind==='profile_visit').length,1);
  const id=notices.find(n=>n.kind==='profile_visit').id;
  await rpc('notifications_read',a,{ids:[id]});assert.equal((await rpc('notifications',b)).find(n=>n.id===id).readAt,null);
  await rpc('notifications_read',b,{ids:[id]});assert((await rpc('notifications',b)).find(n=>n.id===id).readAt);
  s=await rpc('close',b);assert.equal(s.exclusive,false);assert.equal(s.retiredFictional,true);
 }finally{await db.close();}
});
