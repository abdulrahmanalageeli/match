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
  await call(u,'public.marriage_apply($1)',[{displayName:gender==='man'?'عضو تجريبي':'عضوة تجريبية',age:29,birthDate:'1997-01-01',gender,city:'الرياض',profession:'مهندس',bio:'ملف تجريبي',contact:u.email,preferredMinAge:25,preferredMaxAge:40,familyPreference:'',consentVersion:'2026-11-05',signupConsents:{version:'2026-11-06-onboarding',adult:true,terms:true,privacy:true,sensitiveProfile:true,assessment:true,photo:true}}]);
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


test('real deadlines require mutual agreement; reminders deduplicate and revoke after extension',async()=>{
 const db=await createDatabase();try{
 const {member,connect,call}=fixture(db),a=await member(),b=await member('woman'),outsider=await member();
 const id=await connect(a,b),iid=randomUUID();
 const agreement=(u,action='read',payload={})=>call(u,'public.marriage_agreement($1,$2,$3)',[id,action,payload]);
 await assert.rejects(agreement(outsider),/غير متاحة/);
 await assert.rejects(agreement(a,'propose',{days:7,signed:true}));
 const proposal=await agreement(b,'propose',{days:7,signed:true});
 await assert.rejects(agreement(a,'accept',{proposalId:randomUUID(),signed:true}));
 await agreement(a,'accept',{proposalId:proposal.proposalId,signed:true});
 await call(a,"public.marriage_push_register($1,'production',$2)",['c'.repeat(64),iid]);await call(a,'public.marriage_push_enable(true)');
 await db.query("update marriage.conversation_agreements set data=jsonb_set(data,'{deadline}',to_jsonb(now()+interval '20 hours')) where request_id=$1",[id]);
 const rpc=(name,args=[])=>asService(db,async()=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) v`,args)).rows[0].v);
 assert.equal(await rpc('nisfayn_enqueue_deadline_reminders'),1);assert.equal(await rpc('nisfayn_enqueue_deadline_reminders'),0);
 const jobs=await rpc('marriage_push_claim',['production',20]);const job=jobs.find(j=>j.kind==='reminder');assert(job);
 assert(await rpc('nisfayn_push_content',[job.id,job.leaseId,false]));
 const extension=await agreement(a,'extend',{days:7});
 await assert.rejects(agreement(a,'extension_accept',{proposalId:extension.extension.id}),/راجع/);
 await agreement(b,'extension_accept',{proposalId:extension.extension.id});
 assert.equal(await rpc('nisfayn_push_content',[job.id,job.leaseId,false]),null);
 assert.equal(await rpc('nisfayn_enqueue_deadline_reminders'),0);
 }finally{await db.close();}
});
test('family notifications target only readable rooms and revoke after personal leave',async()=>{
 const db=await createDatabase();try{
 const {member,guardian,activeRoom,family,call}=fixture(db),a=await member(),b=await member('woman'),g=await guardian();
 const {roomId}=await activeRoom(a,b,g);const iid=randomUUID();
 await call(a,"public.marriage_push_register($1,'production',$2)",['d'.repeat(64),iid]);await call(a,'public.marriage_push_enable(true)');
 await family(g,'send',{roomId,body:'موعد للتنسيق',clientId:randomUUID()});
 const rpc=(name,args=[])=>asService(db,async()=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) v`,args)).rows[0].v);
 const job=(await rpc('marriage_push_claim',['production',20])).find(j=>j.kind==='family');assert(job);
 const details=await rpc('nisfayn_push_content',[job.id,job.leaseId,false]);assert.equal(details.roomId,roomId);assert(details.messageId);assert.equal(details.body,undefined);
 await family(a,'leave_room',{roomId});assert.equal(await rpc('nisfayn_push_content',[job.id,job.leaseId,false]),null);
 }finally{await db.close();}
});
test('tester extension requires the other signature and suppresses stale reminders',async()=>{
 const db=await createDatabase();try{
 const rpc=(name,args=[])=>asService(db,async()=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) v`,args)).rows[0].v);
 const a='a'.repeat(64),b='b'.repeat(64),iid=randomUUID();
 const pair=(action,session,payload={})=>rpc('nisfayn_test_rpc',[action,session,payload]);
 await pair('login',a,{actor:'abdulrahman'});await pair('login',b,{actor:'reham'});
 const proposal=await pair('agreement_propose',b,{days:14,signed:true,nextStep:'family_call'});await pair('agreement_accept',a,{proposalId:proposal.seriousness.proposalId,signed:true});
 await rpc('nisfayn_test_push',['push_register',b,{installation:iid,device_token:'c'.repeat(64),device_environment:'production'}]);await rpc('nisfayn_test_push',['push_enable',b,{enabled:true}]);
 await db.exec("update nisfayn_test.room set data=jsonb_set(data,'{seriousness,deadline}',to_jsonb(now()+interval '12 hours')) where id");
 assert.equal(await rpc('nisfayn_enqueue_deadline_reminders'),1);assert.equal(await rpc('nisfayn_enqueue_deadline_reminders'),0);
 const job=(await rpc('nisfayn_test_push_claim',['production',20])).find(j=>j.kind==='reminder');assert(job);assert(await rpc('nisfayn_push_content',[job.id,job.leaseId,true]));
 const extension=await pair('agreement_extend',b,{days:7});await assert.rejects(pair('agreement_extension_accept',b,{proposalId:extension.seriousness.extension.id}));
 await pair('agreement_extension_accept',a,{proposalId:extension.seriousness.extension.id});assert.equal(await rpc('nisfayn_push_content',[job.id,job.leaseId,true]),null);
 }finally{await db.close();}
});
