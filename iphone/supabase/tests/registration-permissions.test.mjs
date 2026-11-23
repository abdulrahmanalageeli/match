import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { addUser, createDatabase } from './harness.mjs';

test('registration permissions cover private matching, case access, withdrawal and expiry',async t=>{
  const db=await createDatabase();
  t.after(()=>db.close());
  async function person(role) {
    const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.invalid'};
    await addUser(db,u);
    if(role)await db.query('insert into marriage.staff_accounts(user_id,display_name,role) values ($1,$2,$2)',[u.id,role]);
    return u;
  }
  const member=await person(), reviewer=await person('reviewer'), mod=await person('moderator');
  async function run(user,sql,args=[],aal='aal1') {
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user.id,role:'authenticated',session_id:user.sessionId,aal})]);
    await db.exec('set role authenticated');
    try{return (await db.query('select '+sql+' as result',args)).rows[0].result;}
    finally{await db.exec('reset role');}
  }
  const receipt={version:'2026-11-07-privacy',registrationVersion:'wudayn-entry-2026-11-23',adult:true,terms:true,privacy:true,
    sensitiveProfile:true,sensitivePublication:false,assessment:true,transcript:true,photo:false};
  const accept=(r=receipt)=>run(member,'public.wudayn_registration_agreements($1,$2)',['accept',r]);
  const read=(actor=reviewer,purpose='مراجعة توضيح طلب العضوية',aal='aal2')=>run(actor,'public.wudayn_review_interview_transcript($1,$2)',[member.id,purpose],aal);
  const doc={turns:[{question:'كيف تتخيل الخطوة القادمة؟',answer:'أتواصل مع الأهل.',skipped:false}],currentQuestion:{text:'وكيف ترتّب الموعد؟'},draftAnswer:'unsent'};
  const start=()=>db.query("insert into marriage.interview_sessions(owner_key,member_id,document,consent_version) values($1,$2,$3,'wudayn-interview-v1')",['member:'+member.id,member.id,doc]);
  const erase=()=>db.query('delete from marriage.interview_sessions where member_id=$1',[member.id]);
  await start();
  await assert.rejects(accept({...receipt,transcript:false}));
  assert.equal((await accept()).sensitivePublication,false);
  assert.equal(await read(),null,'old sessions stay private after a new receipt');
  await erase();await start();
  await assert.rejects(read(mod),{code:'42501'});
  await assert.rejects(read(member),{code:'42501'});
  await assert.rejects(read(reviewer,'قصير'));
  await assert.rejects(read(reviewer,'مراجعة توضيح طلب العضوية','aal1'),{code:'42501'});
  const recordHelp="public.wudayn_record_luna_help($1,(select consented_at from marriage.interview_sessions where member_id=$1),$2,$3,$4)";
  const args=[member.id,'ما خطتك؟','أحتاج توضيحًا','يمكنك مقارنة الخيارين.'];
  await assert.rejects(run(member,recordHelp,args),{code:'42501'});
  await db.query('select '+recordHelp,args);
  const transcript=await read();
  assert.deepEqual(transcript.turns,doc.turns);
  assert.deepEqual(transcript.help,[{question:args[1],member:args[2],reply:args[3]}]);
  assert.equal((await run(member,'public.marriage_personal_data()')).lunaQuestionHelp[0].reply,args[3]);
  assert.equal(transcript.currentQuestion,doc.currentQuestion.text);
  assert(!JSON.stringify(transcript).includes('unsent'));
  const audits=await db.query("select reason,result from marriage.staff_audit where action='luna_transcript_reviewed' and target_id=$1",[member.id]);
  assert.equal(audits.rows.length,1);
  assert(!JSON.stringify(audits.rows).includes(doc.turns[0].answer));
  await run(member,'public.wudayn_registration_agreements($1)',['withdraw']);
  assert.equal(await read(),null);
  await accept();assert.equal(await read(),null,'explicit new consent does not re-expose withdrawn conversations');
  await erase();await start();
  await db.query("update marriage.interview_sessions set expires_at=now()-interval '1 second' where member_id=$1",[member.id]);
  assert.equal(await read(),null);
});
