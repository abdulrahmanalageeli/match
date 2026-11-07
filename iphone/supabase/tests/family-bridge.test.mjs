import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';

function fixture(db){
 const rpc=async(sql,args=[])=>(await db.query('select '+sql+' value',args)).rows[0].value;
 const call=(u,sql,args=[])=>asMember(db,u.id,u.sessionId,()=>rpc(sql,args));
 const family=async(u,action,payload={})=>{const value=await call(u,'public.marriage_family($1,$2)',[action,payload]);if(value?.error)throw Error(value.error);return value;};
 async function user(){const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};await addUser(db,u);await db.query('update auth.users set raw_app_meta_data=$2 where id=$1',[u.id,{guardian_account:true}]);return u;}
 async function member(gender='man'){
  const u=await user();
  await call(u,'public.marriage_apply($1)',[{displayName:gender==='man'?'عضو تجريبي':'عضوة تجريبية',age:29,gender,city:'الرياض',profession:'مهندس',bio:'ملف تجريبي',contact:u.email,preferredMinAge:25,preferredMaxAge:40,familyPreference:'',consentVersion:'2026-11-05',signupConsents:{version:'2026-11-06-onboarding',adult:true,terms:true,privacy:true,sensitiveProfile:true,assessment:true,photo:true}}]);
  await db.query("update marriage.members set review_status='approved',manual_access_until=now()+interval '1 day' where id=$1",[u.id]);return u;
 }
 async function guardian(){const u=await user();await family(u,'register',{displayName:'أحد الأهل',adult:true,consentVersion:'family-v1'});return u;}
 async function connect(a,b){const id=await call(a,'public.marriage_request($1)',[b.id]);await call(b,"public.marriage_act($1,'accept')",[id]);return id;}
 async function link(a,g){const inv=await family(a,'invite_link',{relationship:'father'});await family(g,'claim_link',{token:inv.token});const l=(await family(a,'state')).links.find(x=>x.status==='pending');await family(a,'approve_link',{linkId:l.id});await db.query("update marriage.family_links set admin_review='approved' where id=$1",[l.id]);return l.id;}
 async function activeRoom(a,b,g,{two=false}={}){
  const connectionId=await connect(a,b),linkId=await link(a,g);
  await family(a,'consent',{connectionId,agree:true});await family(b,'consent',{connectionId,agree:true});
  const participantIds=two?['member:'+b.id,'family:'+g.id]:['member:'+a.id,'member:'+b.id,'family:'+g.id];
  const made=await family(a,'create_room',{connectionId,title:'تنسيق الخطوة الرسمية',participantIds});const roomId=made.rooms[0].id;
  await family(b,'approve_room',{roomId,agree:true});await family(g,'accept_room',{roomId,agree:true});return {connectionId,linkId,roomId};
 }
 return {rpc,call,family,user,member,guardian,connect,link,activeRoom};
}

test('personal family leave revokes only the actor, retains history and cannot reopen by relinking',async()=>{
 const db=await createDatabase();try{
  const {family,member,guardian,activeRoom,link}=fixture(db),a=await member(),b=await member('woman'),g=await guardian(),stranger=await guardian();
  const {roomId,linkId,connectionId}=await activeRoom(a,b,g);
  const messageId=await family(g,'send',{roomId,body:'رسالة تبقى للمشاركين',clientId:randomUUID()});
  await assert.rejects(family(stranger,'leave_room',{roomId,actor:'family:'+g.id}),/المغادرة/);
  const departed=await family(g,'leave_room',{roomId});
  assert.equal(departed.rooms.find(r=>r.id===roomId).leftByMe,true);
  assert.equal(departed.rooms.find(r=>r.id===roomId).canRead,false);
  assert.equal(departed.rooms.find(r=>r.id===roomId).unread,0);
  await family(g,'leave_room',{roomId}); // Lost response retry remains harmless.
  for(const [action,payload] of [['messages',{}],['send',{body:'ممنوعة',clientId:randomUUID()}],['read',{messageId}],['accept_room',{agree:true}],['close_room',{}]]) {
   await assert.rejects(family(g,action,{roomId,...payload}),/غادرت/);
  }
  assert.deepEqual((await family(g,'export')).familyBridge.messages,[]);
  const other=(await family(b,'state',{connectionId})).rooms.find(r=>r.id===roomId);
  assert.equal(other.status,'active');assert.equal(other.canRead,true);
  assert.equal(other.participants.find(p=>p.id==='family:'+g.id).left,true);
  assert.equal((await family(b,'messages',{roomId}))[0].body,'رسالة تبقى للمشاركين');
  await family(b,'send',{roomId,body:'رسالة بعد المغادرة',clientId:randomUUID()});
  await db.query("update marriage.family_links set admin_review='rejected' where id=$1",[linkId]);
  assert.equal((await family(a,'messages',{roomId})).length,2,'departed guardian review changes do not close others room');
  await family(g,'revoke_link',{linkId});
  await link(a,g);
  assert.equal((await family(a,'messages',{roomId})).length,2);
  await assert.rejects(family(g,'messages',{roomId}),/غادرت/);
  const proposal=await family(a,'create_room',{connectionId,title:'مساحة جديدة بموافقات جديدة',participantIds:['member:'+a.id,'member:'+b.id,'family:'+g.id]});
  const fresh=proposal.rooms.find(r=>r.id!==roomId).id;
  await assert.rejects(family(g,'messages',{roomId:fresh}));
  await family(b,'approve_room',{roomId:fresh,agree:true});
  await assert.rejects(family(g,'messages',{roomId:fresh}));
  await family(g,'accept_room',{roomId:fresh,agree:true});
  assert.deepEqual(await family(g,'messages',{roomId:fresh}),[],'new room has no old history');
  await family(a,'leave_room',{roomId:fresh});
  assert.equal((await family(a,'state',{connectionId})).bridge.enabled,true,'personal member departure does not withdraw bridge consent');
  assert.equal((await family(b,'state',{connectionId})).rooms.find(r=>r.id===fresh).canRead,true);
  await family(a,'consent',{connectionId,agree:false});
  await assert.rejects(family(b,'messages',{roomId:fresh}),'member retains authority to withdraw overall bridge consent');
 }finally{await db.close();}
});

test('personal leave requires a live session and an accepted immutable roster entry',async()=>{
 const db=await createDatabase();try{
  const {family,member,guardian,activeRoom,call}=fixture(db),a=await member(),b=await member('woman'),g=await guardian();
  const {roomId,connectionId}=await activeRoom(a,b,g,{two:true});
  await assert.rejects(family(a,'leave_room',{roomId}),/المغادرة/,'non-roster manager cannot leave as a participant');
  for(const role of ['anon','authenticated','service_role']) {
   for(const name of ['family_command','family_command_before_personal_leave']) assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') yes",[role,`marriage.${name}(text,text,jsonb)`])).rows[0].yes,false);
  }
  const proposal=await family(a,'create_room',{connectionId,title:'دعوة لم تقبل بعد',participantIds:['member:'+b.id,'family:'+g.id]});
  const pendingId=proposal.rooms.find(r=>r.id!==roomId).id;
  await family(b,'approve_room',{roomId:pendingId,agree:true});
  await assert.rejects(family(g,'leave_room',{roomId:pendingId}),/المغادرة/);
  await db.query('delete from auth.sessions where id=$1',[g.sessionId]);
  await assert.rejects(call(g,'public.marriage_family($1,$2)',['leave_room',{roomId}]),/جلسة/);
  assert.equal((await family(b,'state',{connectionId})).rooms.find(r=>r.id===roomId).participants.find(p=>p.id==='family:'+g.id).left,false);
 }finally{await db.close();}
});

test('guardian registration is independent, consented, confirmed, session-bound and cannot read couple messages',async()=>{
 const db=await createDatabase();try{
  const{family,user,member,call}=fixture(db),g=await user(),a=await member(),b=await member('woman');
  let state=await family(g,'state');assert.equal(state.role,'guardian');assert.equal(state.account,null);
  await db.query("update auth.users set raw_app_meta_data='{}' where id=$1",[g.id]);
  await assert.rejects(family(g,'register',{displayName:'أهل',adult:true,consentVersion:'family-v1'}),/بوابة جسر الأهل/);
  await db.query('update auth.users set raw_app_meta_data=$2 where id=$1',[g.id,{guardian_account:true}]);
  await assert.rejects(family(g,'register',{displayName:'أهل',adult:false,consentVersion:'family-v1'}),/إقرار/);
  await assert.rejects(family(g,'register',{displayName:'أهل',adult:true,consentVersion:'wrong'}),/إقرار/);
  await db.query('update auth.users set email_confirmed_at=null where id=$1',[g.id]);
  await assert.rejects(family(g,'state'),/مسجل/);
  await db.query('update auth.users set email_confirmed_at=now() where id=$1',[g.id]);
  state=await family(g,'register',{displayName:'أحد الأهل',adult:true,consentVersion:'family-v1'});
  assert.equal(state.account.displayName,'أحد الأهل');assert.equal(state.participantId,'family:'+g.id);
  assert.equal((await db.query('select count(*)::int n from marriage.members where id=$1',[g.id])).rows[0].n,0);
  await assert.rejects(call(g,'public.marriage_personal_data()'),/مؤكد/);
  await assert.rejects(call(g,'public.marriage_thread($1)',[randomUUID()]),/مؤكد/);
  for(const role of ['anon','authenticated','service_role']){
   await db.exec('set role '+role);try{
    for(const table of ['family_accounts','family_links','family_link_invites','family_rooms','family_messages','family_bridge_consents'])await assert.rejects(db.query('select * from marriage.'+table),/permission denied/);
    await assert.rejects(db.query("select marriage.family_state($1,null)",['member:'+a.id]),/permission denied/);
    await assert.rejects(db.query("select marriage.family_command($1,'state','{}')",['member:'+b.id]),/permission denied/);
   }finally{await db.exec('reset role');}
  }
  await db.query('delete from auth.sessions where id=$1',[g.sessionId]);await assert.rejects(family(g,'state'),/جلسة/);
 }finally{await db.close();}
});

test('human connection codes are private, normalized, single-use and guessing limits persist after failures',async()=>{
 const db=await createDatabase();try{
  const{family,member,guardian,call}=fixture(db),a=await member(),g=await guardian(),stranger=await guardian();
  const invite=await family(a,'invite_link',{relationship:'mother'});assert.match(invite.code,/^[A-HJ-NP-Z2-9]{12}$/);
  const listing=JSON.stringify(await family(a,'state'));assert(!listing.includes(invite.code));assert(!listing.includes(invite.token));
  const formatted=invite.code.toLowerCase().match(/.{4}/g).join(' - ');
  const state=await family(g,'claim_link',{code:formatted});assert.equal(state.links[0].status,'pending');assert.equal(state.links[0].memberName,'بانتظار موافقة العضو');
  await assert.rejects(family(stranger,'claim_link',{token:invite.token}),/الرمز/);
  for(let i=0;i<9;i++)assert.equal((await call(stranger,'public.marriage_family($1,$2)',['claim_link',{code:'ZZZZ-ZZZZ-ZZZZ'}])).code,'invalid_invite');
  assert.equal((await call(stranger,'public.marriage_family($1,$2)',['claim_link',{code:'ZZZZ-ZZZZ-ZZZZ'}])).code,'rate_limited');
  assert.equal((await db.query('select link_attempts from marriage.family_accounts where user_id=$1',[stranger.id])).rows[0].link_attempts,11);
  await db.query("update marriage.family_accounts set link_attempt_window=now()-interval '16 minutes' where user_id=$1",[stranger.id]);
  const fresh=await family(a,'invite_link',{relationship:'father'});assert.equal((await family(stranger,'claim_link',{code:fresh.code})).links[0].status,'pending');
 }finally{await db.close();}
});

test('service-only guardian provisioning and recovery bind trusted accounts, prevent replay and revoke old sessions',async()=>{
 const db=await createDatabase();try{
  const{rpc,call,family,user,member}=fixture(db),g=await user(),outsider=await user();
  const hash=()=>randomBytes(32).toString('hex'),username=hash(),original=hash(),replacement=hash(),rotated=hash();
  const service=(sql,args=[])=>asService(db,()=>rpc(sql,args));
  const register=(id=g.id,key=original)=>service('public.family_login_register($1,$2,$3,$4)',[id,username,key,'والد العضوة']);
  await assert.rejects(register(),/unavailable/,'an arbitrary email is not an internal guardian account');
  await db.query('update auth.users set email=$2 where id=$1',[g.id,username+'@guardian.nisfayn.invalid']);
  await db.query("update auth.users set raw_app_meta_data='{}' where id=$1",[g.id]);await assert.rejects(register(),/unavailable/);
  await db.query('update auth.users set raw_app_meta_data=$2 where id=$1',[g.id,{guardian_account:true}]);
  await assert.rejects(call(g,'public.family_login_register($1,$2,$3,$4)',[g.id,username,original,'والد العضوة']),/permission denied/);
  assert.equal(await register(),true);assert.equal(await register(),true,'retry after lost registration response');
  assert.equal((await family(g,'state')).account.displayName,'والد العضوة');
  assert.equal((await db.query('select count(*)::int n from marriage.members where id=$1',[g.id])).rows[0].n,0);
  await assert.rejects(register(g.id,hash()),/conflicts/);
  await db.query('update auth.users set email=$2 where id=$1',[outsider.id,username+'@guardian.nisfayn.invalid']);await assert.rejects(register(outsider.id),/conflicts/);
  const established=await member(),otherUsername=hash();await db.query('update auth.users set email=$2 where id=$1',[established.id,otherUsername+'@guardian.nisfayn.invalid']);
  await assert.rejects(service('public.family_login_register($1,$2,$3,$4)',[established.id,otherUsername,hash(),'اسم']),/unavailable/);
  for(const fn of ["family_access_limit(text,text,text)","family_login_register(uuid,text,text,text)","family_recovery_prepare(text,text)","family_recovery_finish(uuid,text)","family_recovery_abort(uuid)","family_recovery_rotate(uuid,text)"]){
   for(const role of ['anon','authenticated'])assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') yes',[role,'public.'+fn])).rows[0].yes,false);
  }
  const prepare=(key=original)=>service('public.family_recovery_prepare($1,$2)',[username,key]);
  const rotate=(key=rotated)=>service('public.family_recovery_rotate($1,$2)',[g.id,key]);
  await assert.rejects(prepare(hash()),/unavailable/);const lease=await prepare();assert.equal(lease.accountId,g.id);
  assert.equal((await db.query('select count(*)::int n from auth.sessions where user_id=$1',[g.id])).rows[0].n,0,'sessions revoked before managed Auth update');
  await assert.rejects(prepare(),/unavailable/);await assert.rejects(rotate(),/pending/,'rotation cannot race the external password update');
  await db.query("update marriage.family_login_accounts set recovery_claim_until=now()-interval '1 second' where user_id=$1",[g.id]);
  await assert.rejects(prepare(),/unavailable/,'ambiguous expired change cannot release the old key');await assert.rejects(rotate(),/pending/);
  assert.equal(await service('public.family_recovery_abort($1)',[lease.claimId]),true);
  const retry=await prepare();assert.notEqual(retry.claimId,lease.claimId);
  assert.equal(await service('public.family_recovery_finish($1,$2)',[lease.claimId,replacement]),false,'obsolete lease cannot finalize');
  assert.equal(await service('public.family_recovery_finish($1,$2)',[retry.claimId,replacement]),true);
  assert.equal(await service('public.family_recovery_finish($1,$2)',[retry.claimId,replacement]),true,'lost response retry is idempotent');
  assert.equal(await service('public.family_recovery_finish($1,$2)',[retry.claimId,hash()]),false);
  assert.equal((await db.query('select count(*)::int n from auth.sessions where user_id=$1',[g.id])).rows[0].n,0);
  await assert.rejects(family(g,'state'),/جلسة/);await assert.rejects(prepare(),/unavailable/);
  assert.equal(await rotate(),true);await assert.rejects(prepare(replacement),/unavailable/);const next=await prepare(rotated);assert.equal(next.accountId,g.id);
  await service('public.family_recovery_abort($1)',[next.claimId]);
 }finally{await db.close();}
});

test('guardian access limits persist and include a global cap independent of network input',async()=>{
 const db=await createDatabase();try{
  const{rpc}=fixture(db),hash=()=>randomBytes(32).toString('hex'),username=hash(),network=hash();
  const limit=(operation,user=hash(),ip=hash())=>asService(db,()=>rpc('public.family_access_limit($1,$2,$3)',[operation,user,ip]));
  for(let i=0;i<3;i++)assert.equal((await limit('register',username,network)).allowed,true);
  const blocked=await limit('register',username,network);assert.equal(blocked.allowed,false);assert(blocked.retryAfterSeconds>0);
  for(let i=4;i<50;i++)assert.equal((await limit('register')).allowed,true);
  assert.equal((await limit('register')).allowed,false,'global cap cannot be bypassed by changing network and username');
  assert.equal((await limit('login')).allowed,true,'operation budgets are separate');
  const recoveryUser=hash();for(let i=0;i<5;i++)assert.equal((await limit('recover',recoveryUser)).allowed,true);
  assert.equal((await limit('recover',recoveryUser)).allowed,false);
  await assert.rejects(limit('register','invalid',network),/Invalid rate scope/);
 }finally{await db.close();}
});

test('link tokens are single-use, expiring, private and need the invited member approval',async()=>{
 const db=await createDatabase();try{
  const{family,member,guardian}=fixture(db),a=await member(),other=await member('woman'),g=await guardian(),stranger=await guardian();
  const inv=await family(a,'invite_link',{relationship:'father'});assert.match(inv.token,/^[a-f0-9]{64}$/);
  assert(!JSON.stringify(await family(a,'state')).includes(inv.token),'plain token not returned again');
  assert.deepEqual((await family(stranger,'state')).links,[]);
  await assert.rejects(family(g,'claim_link',{token:'bad'}),/الرمز/);
  let state=await family(g,'claim_link',{token:inv.token});assert.equal(state.links[0].status,'pending');
  assert.equal(state.links[0].memberName,'بانتظار موافقة العضو');
  await assert.rejects(family(stranger,'claim_link',{token:inv.token}),/الرمز/);
  const linkId=state.links[0].id;
  await assert.rejects(family(g,'approve_link',{linkId}),/الرابط/);
  await assert.rejects(family(other,'approve_link',{linkId}),/الرابط/);
  state=await family(a,'approve_link',{linkId});assert.equal(state.links[0].status,'active');
  const expired=await family(a,'invite_link',{relationship:'mother'});
  await db.query("update marriage.family_link_invites set expires_at=now()-interval '1 second' where id=$1",[expired.inviteId]);
  await assert.rejects(family(stranger,'claim_link',{token:expired.token}),/الرمز/);
  await family(g,'revoke_link',{linkId});assert.deepEqual((await family(a,'state')).links,[]);
 }finally{await db.close();}
});

test('exact room roster requires both member approvals and family acceptance; non-roster owners cannot read',async()=>{
 const db=await createDatabase();try{
  const{family,member,guardian,connect,link}=fixture(db),a=await member(),b=await member('woman'),g=await guardian(),outsider=await guardian();
  const connectionId=await connect(a,b);await link(a,g);
  const participantIds=['member:'+b.id,'family:'+g.id];
  await family(a,'consent',{connectionId,agree:true});
  assert.equal((await family(b,'state',{connectionId})).bridge.participants.length,2,'peer family names remain private before mutual bridge consent');
  await assert.rejects(family(a,'create_room',{connectionId,title:'غرفة أهل',participantIds}),/موافقة/);
  await family(b,'consent',{connectionId,agree:true});
  await assert.rejects(family(a,'create_room',{connectionId,title:'غرفة أهل',participantIds:['member:'+b.id,'family:'+outsider.id]}),/غير مرتبط/);
  let state=await family(a,'create_room',{connectionId,title:'غرفة أهل',participantIds});const roomId=state.rooms[0].id;
  assert.equal(state.rooms[0].canRead,false);assert.equal(state.rooms[0].status,'pending');
  await assert.rejects(family(g,'send',{roomId,body:'مرحبا',clientId:randomUUID()}),/الغرفة/);
  assert.equal((await family(g,'state')).rooms.length,0,'guardian cannot see proposed roster before both members approve');
  assert.equal((await family(outsider,'state')).rooms.length,0);
  await assert.rejects(family(outsider,'messages',{roomId}),/الغرفة/);
  await assert.rejects(family(g,'accept_room',{roomId,agree:true}),/الغرفة/);
  assert.equal((await family(b,'state')).rooms[0].status,'pending');
  state=await family(b,'approve_room',{roomId,agree:true});assert.equal(state.rooms[0].status,'pending');
  state=await family(g,'accept_room',{roomId,agree:true});assert.equal(state.rooms[0].status,'active');assert.equal(state.rooms[0].canSend,true);
  await assert.rejects(family(a,'messages',{roomId}),/مشاركين/);
  const clientId=randomUUID(),messageId=await family(g,'send',{roomId,body:'موعد لقاء الأهل',clientId});
  assert.equal(await family(g,'send',{roomId,body:'موعد لقاء الأهل',clientId}),messageId);
  const rows=await family(b,'messages',{roomId});assert.equal(rows.length,1);assert.equal(rows[0].body,'موعد لقاء الأهل');assert.equal(rows[0].senderIsMe,false);
  assert.equal((await family(b,'state')).rooms[0].unread,1);await family(b,'read',{roomId,messageId});assert.equal((await family(b,'state')).rooms[0].unread,0);
  assert.equal((await family(a,'export')).familyBridge.messages.length,0);assert.equal((await family(b,'export')).familyBridge.messages.length,1);
 }finally{await db.close();}
});

test('consent withdrawal, unlinking and blocked/ended matches permanently close family rooms',async()=>{
 const db=await createDatabase();try{
  const{family,member,guardian,activeRoom,call}=fixture(db),a=await member(),b=await member('woman'),g=await guardian();
  const{connectionId,roomId,linkId}=await activeRoom(a,b,g);
  await family(g,'send',{roomId,body:'حديث عائلي',clientId:randomUUID()});
  await db.query('update marriage.members set paused=true where id=$1',[b.id]);
  await family(b,'consent',{connectionId,agree:false});
  await db.query('update marriage.members set paused=false where id=$1',[b.id]);
  await db.query("update marriage.member_requests set status='accepted' where id=$1",[connectionId]);
  await assert.rejects(family(g,'messages',{roomId}),/أُغلقت/);
  await family(a,'consent',{connectionId,agree:true});await family(b,'consent',{connectionId,agree:true});
  assert.equal((await family(g,'state')).rooms[0].status,'closed','renewed bridge needs new room');
  const made=await family(a,'create_room',{connectionId,title:'غرفة أخرى',participantIds:['member:'+a.id,'family:'+g.id]});const second=made.rooms[0].id;
  await family(b,'approve_room',{roomId:second,agree:true});await family(g,'accept_room',{roomId:second,agree:true});
  await family(a,'revoke_link',{linkId});await assert.rejects(family(g,'messages',{roomId:second}),/أُغلقت/);
  // Block trigger closes the connection; even a later administrative restoration cannot restore consent.
  await db.query('insert into marriage.blocks(member_id,blocked_id) values($1,$2)',[b.id,a.id]);
  await db.query('delete from marriage.blocks where member_id=$1',[b.id]);await db.query("update marriage.member_requests set status='accepted' where id=$1",[connectionId]);
  assert.equal((await family(a,'state',{connectionId})).bridge.enabled,false);
  await call(a,"public.marriage_act($1,'cancel')",[connectionId]);assert.equal((await family(a,'state',{connectionId})).bridge,null);
 }finally{await db.close();}
});

test('guardian account deletion removes links, ends access and maintenance purges closed-room history after 30 days',async()=>{
 const db=await createDatabase();try{
  const{family,member,guardian,activeRoom,rpc}=fixture(db),a=await member(),b=await member('woman'),g=await guardian();
  const{roomId}=await activeRoom(a,b,g);await family(g,'send',{roomId,body:'رسالة تجريبية',clientId:randomUUID()});
  await assert.rejects(family(a,'delete_family'),/مخصص/);
  await db.query("insert into marriage.staff_accounts(user_id,role,display_name) values($1,'reviewer','test')",[g.id]);
  await assert.rejects(family(g,'delete_family'),/عضوية أخرى/);
  await db.query('delete from marriage.staff_accounts where user_id=$1',[g.id]);
  await db.query('insert into marriage.members(id) values($1)',[g.id]);
  await assert.rejects(family(g,'delete_family'),/عضوية أخرى/);
  await db.query('delete from marriage.members where id=$1',[g.id]);
  assert.deepEqual(await family(g,'delete_family'),{deleted:true});
  assert.equal((await db.query('select count(*)::int n from auth.users where id=$1',[g.id])).rows[0].n,0);
  await assert.rejects(family(g,'state'),/مسجل/);
  assert.equal((await family(a,'state')).rooms[0].status,'closed');assert.deepEqual((await family(a,'state')).links,[]);
  await db.query("update marriage.family_rooms set closed_at=now()-interval '31 days' where id=$1",[roomId]);
  const result=await asService(db,()=>rpc('public.marriage_operations_cleanup()'));assert.deepEqual(result,{faultGroups:0,notificationJobs:0});
  assert.equal((await db.query('select count(*)::int n from marriage.family_messages')).rows[0].n,0);
  assert.equal((await family(a,'state')).rooms.length,0);
 }finally{await db.close();}
});

test('paired testers can link a separately authenticated guardian and use isolated family rooms',async()=>{
 const db=await createDatabase();try{
  const{family,guardian,rpc}=fixture(db),g=await guardian();const a=randomBytes(32).toString('hex'),b=randomBytes(32).toString('hex');
  await db.query("insert into nisfayn_test.sessions(token_hash,actor,expires_at) values(sha256($1::text::bytea),'abdulrahman',now()+interval '1 hour'),(sha256($2::text::bytea),'reham',now()+interval '1 hour')",[a,b]);
  const p=(session,action,payload={})=>asService(db,()=>rpc("public.nisfayn_test_rpc('family',$1,$2)",[session,{action,...payload}]));
  const inv=await p(a,'invite_link',{relationship:'father'});await family(g,'claim_link',{token:inv.token});
  const linkId=(await p(a,'state')).links[0].id;await p(a,'approve_link',{linkId});
  await db.query("update marriage.family_links set admin_review='approved' where id=$1",[linkId]);
  await p(a,'consent',{connectionId:'tester-pair',agree:true});await p(b,'consent',{connectionId:'tester-pair',agree:true});
  const made=await p(a,'create_room',{connectionId:'tester-pair',title:'تجربة الأهل',participantIds:['test:reham','family:'+g.id]});const roomId=made.rooms[0].id;
  await p(b,'approve_room',{roomId,agree:true});await family(g,'accept_room',{roomId,agree:true});
  await family(g,'send',{roomId,body:'رسالة عائلية منفصلة',clientId:randomUUID()});assert.equal((await p(b,'messages',{roomId})).length,1);
  await assert.rejects(p(a,'messages',{roomId}),/مشاركين/);
  await db.exec("update nisfayn_test.room set data=jsonb_set(data,'{matched}','false') where id");
  await db.exec("update nisfayn_test.room set data=jsonb_set(data,'{matched}','true') where id");
  assert.equal((await p(a,'state',{connectionId:'tester-pair'})).bridge.enabled,false);
  await assert.rejects(family(g,'messages',{roomId}),/أُغلقت/);
  await assert.rejects(p('wrong','state'),/انتهت/);
 }finally{await db.close();}
});

async function adminFixture(db){
 const f=fixture(db),owner=await f.user(),reviewer=await f.user(),moderator=await f.user();
 for(const[u,role]of[[owner,'owner'],[reviewer,'reviewer'],[moderator,'moderator']])await db.query('insert into marriage.staff_accounts(user_id,role,display_name) values($1,$2,$2)',[u.id,role]);
 const admin=async(u,sql,args=[],aal='aal2')=>{
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:u.id,session_id:u.sessionId,role:'authenticated',aal})]);await db.exec('set role authenticated');
  try{return await f.rpc(sql,args);}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claims','',false)");}
 };
 const list=(u=reviewer,filter='pending',query='',cursor=null)=>admin(u,'public.marriage_admin_family($1,$2,$3)',[filter,query,cursor]);
 const review=(item,action='approve',u=reviewer,request=randomUUID(),reason='مراجعة الربط العائلي')=>admin(u,'public.marriage_admin_family_review($1,$2,$3,$4,$5)',[item.id,action,item.revision,reason,request]);
 return {...f,owner,reviewer,moderator,admin,list,review};
}

test('family admin review requires live staff MFA and returns a bounded metadata-only queue',async()=>{
 const db=await createDatabase();try{
  const{family,member,guardian,owner,reviewer,moderator,admin,list,review}=await adminFixture(db),a=await member(),g=await guardian();
  const invitation=await family(a,'invite_link',{relationship:'father'});await family(g,'claim_link',{code:invitation.code});
  const queue=await list();assert.deepEqual(queue.counts,{pending:1,approved:0,rejected:0});assert.equal(queue.items[0].memberStatus,'pending');assert.equal(queue.items[0].adminReview,'pending');
  const text=JSON.stringify(queue);for(const secret of [g.email,a.email,invitation.code,invitation.token,'ملف تجريبي','body','recovery_hash'])assert(!text.includes(secret));
  for(const u of[g,a,moderator]){await assert.rejects(list(u),/صلاحية/);await assert.rejects(review(queue.items[0],'approve',u),/صلاحية/);}
  await assert.rejects(admin(owner,'public.marriage_admin_family()',[],'aal1'),/بخطوتين/);
  await assert.rejects(admin(owner,'public.marriage_admin_family_review($1,$2,$3,$4,$5)',[queue.items[0].id,'approve',queue.items[0].revision,'سبب المراجعة',randomUUID()],'aal1'),/بخطوتين/);
  await db.query('update marriage.staff_accounts set active=false where user_id=$1',[reviewer.id]);await assert.rejects(list(),/صلاحية/);
  await db.query('update marriage.staff_accounts set active=true where user_id=$1',[reviewer.id]);
  await db.query('delete from auth.sessions where id=$1',[reviewer.sessionId]);await assert.rejects(list(),/تسجيل الدخول/);
  await assert.rejects(list(owner,'invalid'),/تصفية/);await assert.rejects(list(owner,'all','x'.repeat(81)),/تصفية/);
  await db.query(`with users as(insert into auth.users(id,email,email_confirmed_at) select gen_random_uuid(),'queue-'||i||'@test.invalid',now() from generate_series(1,51)i returning id),
    accounts as(insert into marriage.family_accounts(user_id,display_name,consent_version) select id,'مشارك قائمة','family-v1' from users returning user_id)
    insert into marriage.family_links(member_key,member_id,family_id,relationship) select 'member:'||$1::text,$1::uuid,user_id,'relative' from accounts`,[a.id]);
  const first=await list(owner,'all');assert.equal(first.items.length,50);assert(first.nextCursor);assert.equal(first.counts.pending,52);
  const second=await list(owner,'all','',first.nextCursor);assert.equal(second.items.length,2);assert.equal(second.nextCursor,null);assert(!second.items.some(x=>first.items.some(y=>x.id===y.id)));
  assert.equal((await list(owner,'all','مشارك قائمة')).items.length,50);assert.equal((await list(owner,'all','NoSuchName')).items.length,0);
  await db.exec('set role authenticated');try{await assert.rejects(db.query('select marriage.admin_family_item($1)',[queue.items[0].id]),/permission/);}finally{await db.exec('reset role');}
 }finally{await db.close();}
});

test('administrative approval never replaces member or room consent and revoked room access cannot revive',async()=>{
 const db=await createDatabase();try{
  const{family,member,guardian,connect,reviewer,list,review}=await adminFixture(db),a=await member(),b=await member('woman'),g=await guardian();
  const connectionId=await connect(a,b),inv=await family(a,'invite_link',{relationship:'mother'});await family(g,'claim_link',{code:inv.code});
  const queued=(await list()).items[0],request=randomUUID(),approved=await review(queued,'approve',reviewer,request);
  assert.equal(approved.memberStatus,'pending');assert.equal(approved.adminReview,'approved');assert.deepEqual(await review(queued,'approve',reviewer,request),approved);
  await assert.rejects(review(queued,'reject',reviewer,request),/معرّف/);await assert.rejects(review(queued,'reject'),/تغيّر/);
  const publicLink=(await family(g,'state')).links[0];assert.equal(publicLink.adminReview,'approved');assert.equal(publicLink.memberName,'بانتظار موافقة العضو');assert(!('reason'in publicLink));
  await family(a,'consent',{connectionId,agree:true});await family(b,'consent',{connectionId,agree:true});
  const roster=['member:'+b.id,'family:'+g.id];
  assert.equal((await family(a,'state',{connectionId})).bridge.participants.length,2);
  await assert.rejects(family(a,'create_room',{connectionId,title:'لقاء الأهل',participantIds:roster}),/غير مرتبط/);
  await family(a,'approve_link',{linkId:queued.id});await assert.rejects(review(approved,'revoke'),/تغيّر/,'member consent invalidates stale admin review');
  assert.equal((await family(a,'state',{connectionId})).bridge.participants.length,3);
  const created=await family(a,'create_room',{connectionId,title:'لقاء الأهل',participantIds:roster}),roomId=created.rooms[0].id;
  assert.equal((await family(g,'state')).rooms.length,0);await family(b,'approve_room',{roomId,agree:true});
  await assert.rejects(family(g,'send',{roomId,body:'لا موافقة بعد',clientId:randomUUID()}),/مشاركين/);
  await family(g,'accept_room',{roomId,agree:true});await family(g,'send',{roomId,body:'تنسيق عائلي خاص',clientId:randomUUID()});
  const current=(await list(reviewer,'approved')).items[0],revoked=await review(current,'revoke');assert.equal(revoked.adminReview,'rejected');assert.equal(revoked.memberStatus,'active');
  await assert.rejects(family(g,'messages',{roomId}),/أُغلقت/);assert.equal((await family(a,'state',{connectionId})).bridge.participants.length,2);
  await review(revoked,'approve');await assert.rejects(family(g,'messages',{roomId}),/أُغلقت/);assert.equal((await family(b,'state')).rooms[0].status,'closed');
  const audit=await db.query("select action,result from marriage.staff_audit where target_type='family_link' and target_id=$1 order by id",[queued.id]);
  assert.deepEqual(audit.rows.map(x=>x.action),['family_link_approved','family_link_revoked','family_link_approved']);assert(!JSON.stringify(audit.rows).includes('تنسيق عائلي خاص'));
  await family(a,'revoke_link',{linkId:queued.id});assert.equal((await list(reviewer,'all')).items.length,0);
  const again=await family(a,'invite_link',{relationship:'mother'});await family(g,'claim_link',{code:again.code});await family(a,'approve_link',{linkId:(await family(a,'state')).links[0].id});
  const pending=(await list()).items[0];assert.equal(pending.memberStatus,'active');assert.equal(pending.adminReview,'pending');
  await assert.rejects(family(a,'create_room',{connectionId,title:'غرفة جديدة',participantIds:roster}),/غير مرتبط/);
  const rejected=await review(pending,'reject');assert.equal(rejected.adminReview,'rejected');await assert.rejects(review(rejected,'revoke'),/حالة/);
 }finally{await db.close();}
});
