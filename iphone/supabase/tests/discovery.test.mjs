import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createDatabase, addUser, asMember, asService } from "./harness.mjs";

// Run the actual phone-side matching reference with Node's test runner.
const catalogUrl=new URL("../../src/compatibility/catalog.json",import.meta.url);
const {assessmentVersion,dimensions,rankPreferences,comparePreferences}=await import(new URL("../../src/compatibility/model.ts",import.meta.url));

function setup(db) {
  const rpc = async (expression, args=[]) =>
    (await db.query("select "+expression+" as value",args)).rows[0].value;
  const call = (user,expression,args) =>
    asMember(db,user.id,user.sessionId,()=>rpc(expression,args));
  const staff = (expression,args) => asService(db,()=>rpc(expression,args));
  async function add(gender, profile={}, {paid=true, approved=true}={}) {
    const id=randomUUID();
    const user={id,email:id+"@example.test",sessionId:randomUUID()};
    await addUser(db,user);
    const state=await call(user,"public.marriage_apply($1)",[{
      displayName:"مثال",age:29,gender,city:"الرياض",profession:"مهندس",bio:"ملف تجريبي",lookingFor:"",
      contact:user.email,preferredMinAge:25,preferredMaxAge:40,familyPreference:"",
      signupConsents:{version:'2026-11-07-privacy',adult:true,terms:true,privacy:true,sensitiveProfile:true,sensitivePublication:true,assessment:true,photo:false},
      consentVersion:["marriage-v1",assessmentVersion].includes(profile.assessmentVersion) ? "2026-11-06-assessment" : "2026-11-05",...profile,
    }]);
    if(approved) await staff("public.marriage_review($1,'approve')",[id]);
    if(paid) {
      const receipt={bundleId:"com.blindmatch.marriage",productId:"com.blindmatch.marriage.monthly",
        appAccountToken:state.user.appAccountToken,originalTransactionId:id,transactionId:id,
        signedDate:Date.now(),expiresDate:Date.now()+86_400_000,environment:"Sandbox"};
      await staff("public.marriage_record_receipt($1,$2,false)",[id,receipt]);
    }
    return user;
  }
  return {add,call,staff};
}

test('replies quote only this conversation, retain idempotency and respect membership access', async () => {
  const db = await createDatabase();
  try {
    const {add,call} = setup(db);
    const a=await add('woman'), b=await add('man'), outsider=await add('man');
    const request=randomUUID(), other=randomUUID();
    await db.query("insert into marriage.member_requests(id,requester_id,recipient_id,status) values($1,$2,$3,'accepted'),($4,$2,$5,'accepted')",[request,a.id,b.id,other,outsider.id]);
    const original=await call(a,'public.marriage_message($1,$2,$3)',[request,'original question',randomUUID()]);
    const foreign=await call(a,'public.marriage_message($1,$2,$3)',[other,'private other conversation',randomUUID()]);
    const client=randomUUID();
    const id=await call(b,'public.marriage_reply($1,$2,$3,$4)',[request,'answer',client,original]);
    assert.equal(await call(b,'public.marriage_reply($1,$2,$3,$4)',[request,'answer',client,original]),id);
    let rows=await call(b,'public.marriage_thread_page($1)',[request]);
    assert.deepEqual(rows.find(m=>m.id===id).reply,{id:original,body:'original question',senderIsMe:false});
    rows=await call(a,'public.marriage_thread_page($1)',[request]);
    assert.equal(rows.find(m=>m.id===id).reply.senderIsMe,true);
    await assert.rejects(call(b,'public.marriage_reply($1,$2,$3,$4)',[request,'answer',client,id]));
    await assert.rejects(call(b,'public.marriage_reply($1,$2,$3,$4)',[request,'leak',randomUUID(),foreign]));
    await assert.rejects(call(outsider,'public.marriage_reply($1,$2,$3,$4)',[request,'unauthorized',randomUUID(),original]));
    assert.equal((await call(a,'public.marriage_thread_page($1)',[request])).length,2);
    await call(a,"public.marriage_act($1,'cancel')",[request]);
    await assert.rejects(call(b,'public.marriage_reply($1,$2,$3,$4)',[request,'closed',randomUUID(),original]));
  } finally { await db.close(); }
});

test("discovery gates the pool, ranks bilateral evidence, paginates and hides contacts",async()=>{
  const db=await createDatabase();
  try {
    const {add,call}=setup(db);
    const a=await add("woman",{interestIds:["reading","travel"],surveyAnswers:{
      conversation_initiative_preference:"C",partner_conversation_initiative_preference:"A",
    }});
    const best=await add("man",{interestIds:["reading"],surveyAnswers:{
      conversation_initiative_preference:"A",partner_conversation_initiative_preference:"C",
    }});
    const shared=await add("man",{interestIds:["reading","travel"]});
    await add("man",{city:"جدة"});
    await add("man",{preferredMinAge:30});
    const free=await add("man",{},{paid:false});
    await assert.rejects(call(free,"public.marriage_discover()"),/الاشتراك/);
    for(let i=0;i<48;i++) await add("man");
    const items=await call(a,"public.marriage_discover()");
    assert.equal(items.length,5);
    assert.equal(items[0].id,best.id);
    assert.equal(items[1].id,shared.id);
    assert(items[0].reasons.some(reason=>reason.includes("بدء الحديث")));
    assert.deepEqual(items[0].interests,["القراءة"]);
    assert.equal(JSON.stringify(items).includes("@example.test"),false);
    assert.equal(items[0].surveyAnswers,undefined);
    const rest=await call(a,"public.marriage_discover(null,null,null,$1)",[items.at(-1).id]);
    assert.deepEqual(rest,[]);
    assert.deepEqual((await call(a,"public.marriage_discover(null,null,null,$1)",[best.id])).map(p=>p.id),items.slice(1).map(p=>p.id));
    assert.deepEqual((await call(a,"public.marriage_discover(25,40,'travel')")).map(p=>p.id),[shared.id]);
    const rosterIds=items.map(p=>p.id);
    const late=await add("man",{interestIds:["reading","travel"]});
    assert.deepEqual((await call(a,"public.marriage_discover()")).map(p=>p.id),rosterIds);
    // Discovery rows permit requests outside the fixed weekly shortlist.
    assert.equal(typeof await call(a,"public.marriage_request($1)",[late.id]),'string');
    assert.deepEqual((await call(a,"public.marriage_discover()")).map(p=>p.id),rosterIds);
    await asMember(db,a.id,a.sessionId,()=>assert.rejects(db.query("select * from marriage.weekly_candidates"),/permission denied/));
    assert.deepEqual(await call(a,"public.marriage_discover(31,40)"),[]);
    assert.deepEqual(await call(a,"public.marriage_discover(null,null,null,$1)",[randomUUID()]),[]);
    await assert.rejects(call(a,"public.marriage_discover(40,20)"),/العمر/);
    await asMember(db,a.id,a.sessionId,()=>assert.rejects(db.query("select * from marriage.thread_messages"),/permission denied/));
    await asMember(db,a.id,a.sessionId,()=>assert.rejects(db.query("select marriage.member_card($1,$2)",[a.id,best.id]),/permission denied/));
    await db.exec("set role anon");
    try{await assert.rejects(db.query("select public.marriage_discover()"),/permission denied/)}
    finally{await db.exec("reset role")}
  } finally {await db.close()}
});

test("paged chat, sender retry receipts and private refresh signals stay within each relationship",async()=>{
  const db=await createDatabase();
  try {
    const {add,call}=setup(db);
    const a=await add("woman"), b=await add("man"), outsider=await add("woman");
    const id=await call(a,"public.marriage_request($1)",[b.id]);
    await assert.rejects(call(a,"public.marriage_thread_page($1)",[id]),/غير متاحة/);
    await call(b,"public.marriage_act($1,'accept')",[id]);
    const sends=await db.query(`insert into marriage.thread_messages(request_id,sender_id,client_id,body,created_at)
      select $1,$2,gen_random_uuid(),'message '||n, timestamp '2026-01-01' + (n/4) * interval '1 second'
      from generate_series(1,61) n returning id`,[id,a.id]);
    const page=await call(b,"public.marriage_thread_page($1)",[id]);
    const prior=await call(b,"public.marriage_thread_page($1,$2)",[id,page[0].id]);
    assert.equal(page.length,50); assert.equal(prior.length,11);
    assert.deepEqual(new Set([...prior,...page].map(x=>x.id)),new Set(sends.rows.map(x=>x.id)));
    assert(page.every(x=>x.clientId===null && x.senderIsMe===false));
    assert((await call(a,"public.marriage_thread_page($1)",[id])).every(x=>x.clientId));
    const inbox=await call(b,"public.marriage_inbox()"); assert.equal(inbox[0].lastMessage.body,page.at(-1).body);
    await assert.rejects(call(outsider,"public.marriage_thread_page($1)",[id]),/غير متاحة/);
    assert.deepEqual(await call(b,"public.marriage_thread_page($1,$2)",[id,randomUUID()]),[]);
    const topics=(await db.query("select distinct topic, payload, event, private from realtime.messages")).rows;
    assert.deepEqual(new Set(topics.map(x=>x.topic)),new Set([a,b].map(x=>"marriage:member:"+x.id)));
    assert(topics.every(x=>x.event==="changed" && x.private===true && Object.keys(x.payload).join(",")==="id"));
    const topic="marriage:member:"+b.id;
    await db.query("select set_config('realtime.topic',$1,false)",[topic]);
    for(const [who,allowed] of [[b,true],[outsider,false]]) {
      await asMember(db,who.id,who.sessionId,async()=>{
        assert.equal((await db.query("select exists(select 1 from realtime.messages) visible")).rows[0].visible,allowed);
        await assert.rejects(db.query("insert into realtime.messages(topic,extension) values($1,'broadcast')",[topic]),/permission denied/);
      });
    }
    await call(b,"public.marriage_act($1,'block')",[id]);
    await assert.rejects(call(a,"public.marriage_thread_page($1)",[id]),/غير متاحة/);
    assert.deepEqual(await call(a,"public.marriage_inbox()"),[]);
  } finally { await db.close(); }
});

test("unread cursors are private, monotonic across devices, and count only eligible incoming messages",async()=>{
  const db=await createDatabase();
  try {
    const {add,call}=setup(db);
    const a=await add("woman"), b=await add("man"), c=await add("man"), outsider=await add("woman");
    const ab=await call(a,"public.marriage_request($1)",[b.id]);
    const ac=await call(a,"public.marriage_request($1)",[c.id]);
    const count=user=>call(user,"public.marriage_unread_count()");
    const mark=(user,request,id)=>call(user,"public.marriage_mark_thread_read($1,$2)",[request,id]);
    const inbox=user=>call(user,"public.marriage_inbox()");
    assert.equal((await inbox(a))[0].unreadCount,0);
    await assert.rejects(mark(a,ab,randomUUID()),/غير متاحة/);
    await call(b,"public.marriage_act($1,'accept')",[ab]);
    await call(c,"public.marriage_act($1,'accept')",[ac]);

    const tied=[1,2,3,4].map(n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'));
    for(let i=0;i<tied.length;i++) {
      await db.query("insert into marriage.thread_messages(id,request_id,sender_id,client_id,body,created_at) values($1,$2,$3,$4,$5,'2026-11-05T12:00:00Z')",
        [tied[i],ab,i===2?a.id:b.id,randomUUID(),"رسالة "+i]);
    }
    const other=await call(c,"public.marriage_message($1,'another',$2)",[ac,randomUUID()]);
    const before=await inbox(a);
    assert.equal(before.find(r=>r.id===ab).unreadCount,3);
    assert.equal(before.find(r=>r.id===ab).lastMessage.body,"رسالة 3");
    assert.equal(await count(a),4);
    assert.equal(await count(b),1);
    assert.equal(await count(outsider),0);
    await assert.rejects(mark(outsider,ab,tied[1]),/غير متاحة/);
    await assert.rejects(mark(a,ab,other),/الرسالة/);
    await assert.rejects(mark(a,ab,null),/الرسالة/);
    await asMember(db,a.id,a.sessionId,()=>assert.rejects(db.query("select * from marriage.thread_read_positions"),/permission denied/));
    await asMember(db,a.id,a.sessionId,()=>assert.rejects(db.query("select marriage.thread_unread($1,$2,null,null)",[ab,b.id]),/permission denied/));
    await db.exec("set role anon");
    try{await assert.rejects(db.query("select public.marriage_unread_count()"),/permission denied/)}
    finally{await db.exec("reset role")}

    await db.exec("truncate realtime.messages");
    assert.equal(await mark(a,ab,tied[1]),true);    // two same-time incoming IDs have now been read
    assert.equal(await count(a),2);
    assert.equal(await mark(a,ab,tied[0]),false);   // a slower second device cannot move backwards
    assert.equal(await mark(a,ab,tied[1]),false);
    const {rows:signals}=await db.query("select topic,event,payload-'id' as payload,private from realtime.messages");
    assert.deepEqual(signals,[{topic:"marriage:member:"+a.id,event:"changed",payload:{},private:true}]);
    assert.equal(await count(b),1);                  // the other member's independent read state
    assert.equal(await mark(a,ab,tied[3]),true);
    assert.equal(await count(a),1);
    assert.equal((await inbox(a)).find(r=>r.id===ab).unreadCount,0);
    assert.equal((await inbox(b)).find(r=>r.id===ab).unreadCount,1);
    assert.deepEqual((await inbox(a)).map(r=>r.id),before.map(r=>r.id));
    await call(b,"public.marriage_act($1,'block')",[ab]);
    await assert.rejects(mark(a,ab,tied[3]),/غير متاحة/);
    assert.equal(await count(b),0);
    await call(c,"public.marriage_pause(true)");
    assert.equal(await count(a),1);
    assert.equal(await count(c),0);
    assert.deepEqual((await inbox(a)).map(r=>r.id),[ac]);
  } finally {await db.close()}
});

test("only reciprocal requests unlock private chat; closing, blocking and paid expiry revoke access",async()=>{
  const db=await createDatabase();
  try {
    const {add,call,staff}=setup(db);
    const a=await add("woman");const b=await add("man");const outsider=await add("woman");
    const request=await call(a,"public.marriage_request($1)",[b.id]);
    assert.equal(await call(a,"public.marriage_request($1)",[b.id]),request);
    assert.equal(await call(b,"public.marriage_request($1)",[a.id]),request);
    assert.equal((await call(b,"public.marriage_inbox()"))[0].status,"pending");
    assert.equal((await call(a,"public.marriage_inbox()"))[0].direction,"outgoing");
    await assert.rejects(staff("public.marriage_assign($1,$2)",[a.id,b.id]),/ترشيح|طلب/);
    await assert.rejects(call(a,"public.marriage_thread($1)",[request]),/غير متاحة/);
    await assert.rejects(call(a,"public.marriage_act($1,'accept')",[request]),/القبول|قبول/);
    await assert.rejects(call(outsider,"public.marriage_act($1,'accept')",[request]),/غير متاح/);
    await assert.rejects(call(b,"public.marriage_message($1,'test',$2)",[request,randomUUID()]),/غير متاحة/);
    assert.equal(await call(b,"public.marriage_act($1,'accept')",[request]),true);
    assert.equal(await call(b,"public.marriage_act($1,'accept')",[request]),true);
    await assert.rejects(call(outsider,"public.marriage_thread($1)",[request]),/غير متاحة/);
    const clientId=randomUUID();
    const message=await call(a,"public.marriage_message($1,$2,$3)",[request,"أهلًا",clientId]);
    assert.equal(await call(a,"public.marriage_message($1,$2,$3)",[request,"أهلًا",clientId]),message);
    await assert.rejects(call(a,"public.marriage_message($1,$2,$3)",[request,"مختلفة",clientId]),/معرّف/);
    assert.equal((await call(b,"public.marriage_thread($1)",[request]))[0].senderIsMe,false);
    assert.equal((await call(a,"public.marriage_thread($1)",[request]))[0].senderIsMe,true);
    await assert.rejects(call(a,"public.marriage_message($1,$2,$3)",[request,"x".repeat(1001),randomUUID()]),/١٠٠٠/);
    await db.query("update marriage.store_transactions set revoked=true where transaction_id=$1",[a.id]);
    assert.equal((await call(a,"public.marriage_state()")).membership.canStart,true);
    await assert.rejects(call(b,"public.marriage_thread($1)",[request]),/غير متاحة/);
    await assert.rejects(call(a,"public.marriage_thread($1)",[request]),/الاشتراك/);
    await assert.rejects(call(outsider,"public.marriage_act($1,'report','بلاغ اختبار')",[request]),/غير متاح/);
    assert.equal(await call(a,"public.marriage_act($1,'report','بلاغ اختبار')",[request]),true);
    assert.equal(await call(a,"public.marriage_act($1,'report','بلاغ اختبار')",[request]),true);
    assert.equal((await db.query("select count(*)::int n from marriage.reports where member_id=$1 and reported_id=$2",[a.id,b.id])).rows[0].n,1);
    assert.equal((await call(a,"public.marriage_state()")).membership.canStart,false);
    await db.query("update marriage.store_transactions set revoked=false where transaction_id=$1",[a.id]);
    assert.deepEqual(await call(b,"public.marriage_inbox()"),[]);
    await assert.rejects(call(a,"public.marriage_request($1)",[b.id]),/غير متاح/);
  } finally {await db.close()}
});

test("founder shortlisting, discovery and the local walkthrough return identical ranking/reasons",async()=>{
  const db=await createDatabase();
  try {
    const {add,call}=setup(db);
    const preferences={age:29,preferredMinAge:25,preferredMaxAge:40,city:"الرياض"};
    const viewerProfile={...preferences,gender:"woman",interestIds:["reading","travel"],surveyAnswers:{
      conversation_initiative_preference:"C",partner_conversation_initiative_preference:"A",
      match_disagreement_style:"B",partner_match_disagreement_style:"B",
    }};
    const viewer=await add("woman",viewerProfile);
    const counterparts=[
      {interestIds:["travel","reading"],surveyAnswers:{
        conversation_initiative_preference:"A",partner_conversation_initiative_preference:"C",
        match_disagreement_style:"B",partner_match_disagreement_style:"B",
      }},
      {interestIds:["travel"],surveyAnswers:{conversation_initiative_preference:"A"}},
      {interestIds:["museums"],surveyAnswers:{match_disagreement_style:"A",partner_match_disagreement_style:"B"}},
      {interestIds:["travel","reading"],surveyAnswers:{}},
      {interestIds:["cooking"],surveyAnswers:{}},
    ];
    const people=[];
    for(const entry of counterparts){
      const profile={...preferences,...entry,gender:"man"};
      const member=await add("man",profile);people.push({...profile,id:member.id});
    }
    const expected=rankPreferences({...viewerProfile,id:viewer.id},people);
    const ranked=await call(viewer,"public.marriage_discover()");
    assert.deepEqual(ranked.map(p=>[p.id,p.reasons,p.fit]),expected.map(p=>[p.person.id,p.reasons,p.fit]));
    const operator=await asService(db,()=>db.query("select * from public.marriage_candidates($1)",[viewer.id]));
    assert.deepEqual(operator.rows.map(r=>r.member_id_out),expected.map(p=>p.person.id));
    await assert.rejects(call(viewer,"public.marriage_candidates($1)",[viewer.id]),/permission denied/);
  } finally {await db.close()}
});

test("versioned full assessment matches the phone in both directions, fails closed on strict unknowns and retains accepted chats",async()=>{
  const db=await createDatabase();
  try {
    const {add,call}=setup(db);
    const standard={city:"الرياض",age:29,preferredMinAge:25,preferredMaxAge:40,assessmentVersion};
    const all=Object.fromEntries(dimensions.flatMap(d=>[[d.id,"A"],[d.partnerId,"A"]]));
    const aProfile={...standard,gender:"woman",surveyAnswers:{...all,residence_plan:"B",partner_residence_plan:"B"},
      hardRequirements:["children_plan"],priorityCategories:["plans","communication"]};
    const a=await add("woman",aProfile);
    const configurations=[
      {city:"جدة",surveyAnswers:{...all,residence_plan:"B",partner_residence_plan:"B"}},
      {surveyAnswers:{...all,curiosity_style:"B",partner_early_openness:"B",shared_budget:"B",weekly_planning:"C",wife_work:"B",partner_wife_work:"B"}},
      {surveyAnswers:{children_plan:"A"}},
      {surveyAnswers:{...all,children_plan:"C"}},
      {surveyAnswers:{weekly_planning:"A"}},
      {hardRequirements:["marriage_timeline"],surveyAnswers:{...all,partner_marriage_timeline:"B"}},
      {city:"جدة",surveyAnswers:{...all,residence_plan:"A"}},
    ];
    const members=[];
    for(const overrides of configurations){
      const profile={...standard,gender:"man",...overrides};
      members.push({profile,user:await add("man",profile)});
    }
    const fullViewer={...aProfile,id:a.id};
    const expected=rankPreferences(fullViewer,members.map(({profile,user})=>({...profile,id:user.id})));
    const shown=await call(a,"public.marriage_discover()");
    assert.deepEqual(shown.map(p=>p.id),expected.map(p=>p.person.id));
    assert.deepEqual(shown.map(p=>[p.fit,p.reasons]),expected.map(p=>[p.fit,p.reasons]));
    assert.equal(shown.length,4);
    const card = i => shown.find(p => p.id === members[i].user.id);
    assert.equal(card(0).fit.band,"strong");
    assert.equal(card(1).fit.band,"mixed");
    assert(card(1).fit.discussion.includes("weekly_planning"));
    assert.equal(card(2).fit.band,"insufficient");
    assert(card(2).fit.missing.includes("children_plan"));
    assert(card(6), "a willing mover can match someone who stays in their city");
    assert(!JSON.stringify(shown).includes("partner_children_plan") && !JSON.stringify(shown).includes("priorityCategories"));
    const {catalog}= (await db.query("select catalog from marriage.assessment_versions where id=$1",[assessmentVersion])).rows[0];
    assert.deepEqual(catalog,JSON.parse(await readFile(catalogUrl,"utf8")));
    for(const {profile,user} of members){
      const simulated=comparePreferences(fullViewer,{...profile,id:user.id});
      const sql=(await db.query("select marriage.compatible($1,$2) as eligible, f.* from marriage.pair_fit($1,$2) f",[a.id,user.id])).rows[0];
      assert.equal(sql.eligible,!!simulated);
      if(simulated){ assert.deepEqual(sql.fit,simulated.fit);assert(Math.abs(sql.rank_value-simulated.rankValue)<1e-10); }
      else await assert.rejects(call(a,"public.marriage_request($1)",[user.id]),/غير متاح/);
    }
    const aState=await call(a,"public.marriage_state()");
    const submit=(body)=>{const {signupConsents,...legacyBody}=body;return call(a,"public.marriage_apply($1)",[legacyBody]);};
    await assert.rejects(submit({...aState.profile,consentVersion:"2026-11-05"}),/الموافقة/);
    await assert.rejects(submit({...aState.profile,hardRequirements:["early_openness"],consentVersion:"2026-11-06-assessment"}),/الاهتمامات/);
    const peer=members[0].user;
    const thread=await call(a,"public.marriage_request($1)",[peer.id]);
    await call(peer,"public.marriage_act($1,'accept')",[thread]);
    const updated=await submit({...aState.profile,consentVersion:"2026-11-06-assessment",
      surveyAnswers:{...aState.profile.surveyAnswers,partner_children_plan:"C"}});
    assert.equal(updated.user.applicationStatus,"approved");
    assert.deepEqual(await call(a,"public.marriage_thread($1)",[thread]),[]);
    const legacy={...updated.profile,surveyAnswers:{match_disagreement_style:"B"},consentVersion:"2026-11-05"};
    delete legacy.assessmentVersion;delete legacy.hardRequirements; delete legacy.priorityCategories;
    const afterLegacy=await submit(legacy);
    assert.equal(afterLegacy.profile.assessmentVersion,assessmentVersion);
    assert.equal(afterLegacy.profile.surveyAnswers.partner_children_plan,"C");
    assert.deepEqual(afterLegacy.profile.hardRequirements,["children_plan"]);
    assert.deepEqual([...afterLegacy.profile.priorityCategories].sort(),["communication","plans"]);
    assert.deepEqual((await db.query("select distinct version from marriage.consents where member_id=$1 order by version",[a.id])).rows.map(r=>r.version),["2026-11-05","2026-11-06-assessment","2026-11-07-privacy"]);
    await asMember(db,a.id,a.sessionId,async()=>{
      for(const rel of ["member_answers","fit_hard_requirements","fit_priorities","weekly_candidates"]){
        await assert.rejects(db.query("select * from marriage."+rel),/permission denied/);
      }
      await assert.rejects(db.query("select * from marriage.pair_fit($1,$2)",[a.id,peer.id]),/permission denied/);
    });
  } finally {await db.close()}
});

test("closed and paused introductions cannot refill the current week's slots; material edits close pending requests",async()=>{
  const db=await createDatabase();
  try {
    const {add,call,staff}=setup(db);
    const a=await add("woman");
    const pool=[];
    for(let i=0;i<7;i++)pool.push(await add("man"));
    const roster=(await call(a,"public.marriage_discover()")).map(p=>pool.find(m=>m.id===p.id));
    const excluded=pool.find(m=>!roster.some(p=>p.id===m.id));
    await assert.rejects(staff("public.marriage_assign($1,$2)",[a.id,excluded.id]),/الأسبوع/);
    await staff("public.marriage_assign($1,$2)",[a.id,roster[0].id]);
    await assert.rejects(call(a,"public.marriage_request($1)",[roster[0].id]),/سبق/);
    const sent=await call(a,"public.marriage_request($1)",[roster[1].id]);
    assert.equal(await call(a,"public.marriage_request($1)",[roster[1].id]),sent);
    await call(roster[1],"public.marriage_act($1,'accept')",[sent]);
    await call(a,"public.marriage_pause(true)");await call(a,"public.marriage_pause(false)");
    assert.deepEqual((await call(a,"public.marriage_inbox()")).map(r=>r.id),[sent]);
    assert.deepEqual(await call(a,"public.marriage_thread($1)",[sent]),[]);
    assert.equal(await call(a,"public.marriage_request($1)",[roster[1].id]),sent);
    assert.equal(typeof await call(a,"public.marriage_request($1)",[excluded.id]),'string');
    const next=roster[2];const pending=await call(a,"public.marriage_request($1)",[next.id]);
    await call(a,"public.marriage_apply($1)",[{displayName:"اسم آخر",age:29,gender:"woman",city:"الرياض",
      profession:"مهندسة",bio:"تعديل يستوجب المراجعة",contact:a.email,preferredMinAge:25,preferredMaxAge:40,
      familyPreference:"",consentVersion:"2026-11-05",interestIds:[],surveyAnswers:{}}]);
    await staff("public.marriage_review($1,'approve')",[a.id]);
    await assert.rejects(call(next,"public.marriage_act($1,'accept')",[pending]),/المغلق/);
  } finally {await db.close()}
});
