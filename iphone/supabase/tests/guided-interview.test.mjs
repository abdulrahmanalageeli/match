import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';
let db;
before(async()=>{db=await createDatabase();});
after(async()=>{await db?.close();});
const query=async(sql,args=[])=>(await db.query('select '+sql+' value',args)).rows[0].value;
async function user(){const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};await addUser(db,u);return u;}
const call=(u,command,payload={})=>asMember(db,u.id,u.sessionId,()=>query('public.marriage_interview($1,$2,null)',[command,payload]));
const emptyDoc=()=>({version:'interview-v1',consentVersion:'wudayn-interview-v1',model:'gpt-6-luna',promptVersion:'wudayn-interview-1',status:'active',turns:[],currentQuestion:{topic:'communication',text:'كيف تتعامل مع اختلاف وجهات النظر؟',suggestions:[]},proposals:[],readiness:[],clarifications:[],confirmed:[],lastRequestId:null,lastMode:'guided',pendingAnalysis:false,draftAnswer:'',reviewSharing:false,confirmedAt:null});
const start=u=>call(u,'start',{consentVersion:'wudayn-interview-v1',document:emptyDoc()});
const turn={id:randomUUID(),topic:'communication',question:'كيف تتعامل مع الخلاف؟',answer:'أفضل مهلة قصيرة ثم نرجع للنقاش في نفس اليوم.',skipped:false};
const proposal={id:'preference:repair_after_conflict:self',kind:'preference',fieldId:'repair_after_conflict',side:'self',values:['B'],summary:'تفضّل مهلة قصيرة ثم العودة للنقاش.',evidence:[{turnId:turn.id,quote:'مهلة قصيرة'}],needsClarification:false};
const filledDoc=()=>({...emptyDoc(),turns:[turn],proposals:[proposal],readiness:[{id:'nextStep',text:'العودة للنقاش بعد مهلة قصيرة.',evidence:proposal.evidence}]});
async function asStaff(u,fn,aal='aal2'){
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:u.id,session_id:u.sessionId,role:'authenticated',aal})]);
 await db.exec('set role authenticated');
 try{return await fn();}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claims','',false)");}
}

test('new members can consent and resume privately; no other member, anonymous caller or service role can read transcripts',async()=>{
 const a=await user(),b=await user();
 assert.equal((await call(a,'load')).document,null);
 await assert.rejects(call(a,'start',{document:emptyDoc()}),/الموافقة/);
 const s=await start(a);assert(s.revision>0);assert.equal(s.document.model,'gpt-6-luna');
 assert.equal((await start(a)).revision,s.revision,'start does not overwrite existing state');
 const saved=await call(a,'save',{expectedRevision:s.revision,document:filledDoc()});
 assert.equal((await call(a,'load')).document.turns[0].answer,turn.answer);
 assert.equal((await call(b,'load',{owner:a.id})).document,null);
 await assert.rejects(call(b,'save',{expectedRevision:saved.revision,document:filledDoc()}),/الجلسة/);
 assert.equal(await query('(select review_status from marriage.members where id=$1)',[a.id]),'draft');
 assert.equal(await query('(select count(*)::int from marriage.profiles where member_id=$1)',[a.id]),0);
 for(const role of ['anon','authenticated','service_role']){
  await db.exec('set role '+role);
  try{
   await assert.rejects(db.query('select * from marriage.interview_sessions'),/permission/);
   await assert.rejects(db.query('delete from marriage.interview_usage'),/permission/);
   await assert.rejects(query("public.marriage_interview('load')"));
  }finally{await db.exec('reset role');}
 }
 await db.query('delete from auth.sessions where id=$1',[a.sessionId]);
 await assert.rejects(call(a,'load'),/تسجيل الدخول/);
 const bSession=await start(b);
 await db.query('update marriage.members set suspended=true where id=$1',[b.id]);
 await assert.rejects(start(b),/الحساب/);
 await assert.rejects(call(b,'save',{expectedRevision:bSession.revision,document:filledDoc()}),/الحساب/);
 await assert.rejects(call(b,'reserve',{expectedRevision:bSession.revision}),/الحساب/);
 assert.equal((await call(b,'load')).revision,bSession.revision);
 assert.equal((await call(b,'delete',{expectedRevision:bSession.revision})).document,null);
});

test('optimistic revisions reject stale saves and delete/restart ABA; malformed or ungrounded data cannot replace valid data',async()=>{
 const u=await user();const first=await start(u);
 const s=await call(u,'save',{expectedRevision:first.revision,document:filledDoc()});
 await assert.rejects(call(u,'save',{expectedRevision:first.revision,document:emptyDoc()}),e=>e.code==='40001');
 for(const document of [
  {...filledDoc(),adminApproved:true},
  {...filledDoc(),model:'unapproved-model'},
  {...filledDoc(),turns:[turn,{...turn}]},
  {...filledDoc(),turns:[{...turn,answer:'x'.repeat(1201)}]},
  {...filledDoc(),turns:Array.from({length:21},(_,i)=>({...turn,id:'t'+i}))},
  {...filledDoc(),proposals:[{...proposal,evidence:[{turnId:'foreign-turn',quote:'مهلة قصيرة'}]}]},
  {...filledDoc(),proposals:[{...proposal,evidence:[{turnId:turn.id,quote:'لم يقل هذا الكلام'}]}]},
  {...filledDoc(),proposals:[{...proposal,evidence:[]}]},
  {...filledDoc(),readiness:[{id:'honestyScore',text:'سليم',evidence:proposal.evidence}]},
  {...filledDoc(),currentQuestion:{topic:'communication',text:'سؤال',suggestions:['x'.repeat(121)]}},
 ])await assert.rejects(call(u,'save',{expectedRevision:s.revision,document}),/غير صالحة/);
 assert.equal((await call(u,'load')).revision,s.revision);
 assert.equal((await call(u,'delete',{expectedRevision:s.revision})).document,null);
 const restarted=await start(u);assert(restarted.revision>s.revision);
 await assert.rejects(call(u,'save',{expectedRevision:s.revision,document:filledDoc()}),e=>e.code==='40001');
});

test('test-session actors are isolated, and expired or revoked access is rejected',async()=>{
 const ta='a'.repeat(64),tr='b'.repeat(64);
 await db.query("insert into nisfayn_test.sessions values(sha256($1::text::bytea),'abdulrahman',now()+interval '1 hour'),(sha256($2::text::bytea),'reham',now()+interval '1 hour')",[ta,tr]);
 const tester=async(token,command,payload={})=>{await db.exec('set role anon');try{return await query('public.marriage_interview($1,$2,$3)',[command,payload,token]);}finally{await db.exec('reset role');}};
 const s=await tester(ta,'start',{consentVersion:'wudayn-interview-v1',document:emptyDoc()});
 await tester(ta,'save',{expectedRevision:s.revision,document:filledDoc()});
 assert.equal((await tester(tr,'load')).document,null);
 await assert.rejects(tester('forged','load'));
 await db.query("update marriage.admin_test_members set suspended=true where actor='abdulrahman'");
 await assert.rejects(tester(ta,'load'),/جلسة/);
 await db.query("update marriage.admin_test_members set suspended=false where actor='abdulrahman'");
 await db.query('delete from nisfayn_test.sessions where token_hash=sha256($1::text::bytea)',[ta]);
 await assert.rejects(tester(ta,'load'),/جلسة/);
 await db.query("update nisfayn_test.sessions set expires_at=now()-interval '1 minute' where token_hash=sha256($1::text::bytea)",[tr]);
 await assert.rejects(tester(tr,'load'),/جلسة/);
});

test('durable minute/day/global budgets survive interview deletion; reserve never changes the document revision',async()=>{
 const u=await user();let s=await start(u);
 for(let i=0;i<6;i++)assert.deepEqual(await call(u,'reserve',{expectedRevision:s.revision}),{status:'allowed',revision:s.revision});
 assert.equal((await call(u,'reserve',{expectedRevision:s.revision})).status,'limited');
 await call(u,'delete',{expectedRevision:s.revision});s=await start(u);
 assert.equal((await call(u,'reserve',{expectedRevision:s.revision})).status,'limited');
 // Keep fixtures in the current UTC day even when this runs just after midnight.
 await db.query("update marriage.interview_usage set created_at=greatest(date_trunc('day',now() at time zone 'UTC') at time zone 'UTC',now()-interval '2 minutes') where member_id=$1",[u.id]);
 await db.query("insert into marriage.interview_usage(owner_key,member_id,created_at) select $1,$2,greatest(date_trunc('day',now() at time zone 'UTC') at time zone 'UTC',now()-interval '2 minutes') from generate_series(1,34)",['member:'+u.id,u.id]);
 assert.equal((await call(u,'reserve',{expectedRevision:s.revision})).status,'limited');
 const other=await user();const otherSession=await start(other);
 await db.exec("insert into marriage.interview_usage(owner_key,created_at) select 'global-test',now() from generate_series(1,2000)");
 assert.equal((await call(other,'reserve',{expectedRevision:otherSession.revision})).status,'limited');
 await db.exec("delete from marriage.interview_usage where owner_key='global-test'");
});

test('staff get only explicitly shared confirmed summaries with MFA and audited review access; consent withdrawal hides them',async()=>{
 const u=await user(),reviewer=await user(),moderator=await user();
 await db.query("insert into marriage.staff_accounts(user_id,role,display_name) values($1,'reviewer','Reviewer'),($2,'moderator','Moderator')",[reviewer.id,moderator.id]);
 const summary=who=>asStaff(who,()=>query('public.marriage_interview_admin_summary($1)',[u.id]));
 let s=await start(u);
 s=await call(u,'save',{expectedRevision:s.revision,document:{...filledDoc(),status:'confirmed',confirmed:[proposal],confirmedAt:'1900-01-01'}});
 assert(s.document.confirmedAt>'2020');assert.equal(await summary(reviewer),null);
 s=await call(u,'save',{expectedRevision:s.revision,document:{...s.document,reviewSharing:true}});
 const result=await summary(reviewer);assert.equal(result.selfReported,true);assert.equal(result.readiness[0].id,'nextStep');
 for(const hidden of ['turns','proposals','confirmed','quote','مهلة قصيرة ثم نرجع'])assert.equal(JSON.stringify(result).includes('"'+hidden+'"'),false);
 assert.deepEqual(Object.keys(result).sort(),['clarifications','confirmedAt','readiness','selfReported','updatedAt']);
 assert.deepEqual(Object.keys(result.readiness[0]).sort(),['id','text']);
 assert.equal(await query("(select count(*)::int from marriage.staff_audit where target_id=$1 and action='interview_summary_viewed')",[u.id]),1);
 await assert.rejects(summary(moderator),/صلاحية/);
 await assert.rejects(summary(u),/صلاحية/);
 await assert.rejects(asStaff(reviewer,()=>query('public.marriage_interview_admin_summary($1)',[u.id]),'aal1'),/بخطوتين/);
 s=await call(u,'save',{expectedRevision:s.revision,document:{...s.document,status:'review'}});
 assert.equal(s.document.confirmedAt,null);assert.equal(await summary(reviewer),null);
 s=await call(u,'save',{expectedRevision:s.revision,document:{...s.document,status:'confirmed',reviewSharing:false}});
 assert.equal(await summary(reviewer),null);
});

test('retention expires reads, daily cleanup physically deletes, personal export is scoped, and account deletion cascades',async()=>{
 const a=await user(),b=await user(),c=await user();
 for(const u of [a,b,c]){const s=await start(u);await call(u,'save',{expectedRevision:s.revision,document:filledDoc()});}
 const exported=await asMember(db,a.id,a.sessionId,()=>query('public.marriage_personal_data()'));
 assert.equal(exported.compatibilityInterview.document.turns[0].answer,turn.answer);
 assert(exported.compatibilityInterview.consentedAt);
 assert.equal(await query("(select expires_at-updated_at=interval '30 days' from marriage.interview_sessions where member_id=$1)",[a.id]),true);
 await db.query("update marriage.interview_sessions set expires_at=now()-interval '1 second' where member_id in($1,$2)",[a.id,b.id]);
 assert.equal((await call(a,'load')).document,null);
 assert.equal(await query('(select count(*)::int from marriage.interview_sessions where member_id=$1)',[a.id]),0);
 const cleanup=await asService(db,()=>query('public.marriage_operations_cleanup()'));assert.equal(cleanup.expiredInterviews,1);
 assert.equal((await asMember(db,a.id,a.sessionId,()=>query('public.marriage_personal_data()'))).compatibilityInterview,null);
 await db.query('delete from auth.users where id=$1',[c.id]);
 assert.equal(await query('(select count(*)::int from marriage.interview_sessions where member_id=$1)',[c.id]),0);
});
