import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoSimulation, fictionalReply, simulationHistory } from './simulation.ts';
import { demoVisitWindows, nextDemoVisit, demoMembershipTier } from './simulationRhythm.ts';

function harness(options={}) {
  const people=Array.from({length:15},(_,i)=>({id:'p'+String(i+1).padStart(2,'0'),alias:'عضو '+i,age:28,city:'الرياض',occupation:'الهندسة',bio:'أفضل الحوار الهادئ',interests:['القراءة'],reasons:[]}));
  const unavailable=new Set(),activity=[],online=new Set(),records=[],messages=new Map(),typing=new Set();
  let exclusive=false;
  const world={people:()=>people,records,messages,online,typing,available:id=>!unavailable.has(id),exclusive:()=>exclusive,
    activity:(kind,id)=>activity.push({kind,id}),changed:()=>{},reset:()=>{records.splice(0);messages.clear();activity.splice(0);online.clear();}};
  const simulation=createDemoSimulation(world,{random:()=>.2,...options});
  return {people,unavailable,activity,online,typing,records,messages,simulation,world,setExclusive:value=>exclusive=value};
}
const record=(peer='p01',status='accepted')=>({id:'conversation',peer,status,direction:'outgoing',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});

test('manually advancing the tester clock respects the fictional sender’s membership',async()=>{
  const h=harness();
  for (const person of h.people) person.membershipTier='free';
  for (let i=0;i<6;i++) await h.simulation.step();
  assert(h.activity.some(event=>event.kind==='interest'));
  assert.equal(h.records.length,0);
});

test('only five fictional participants generate bounded activity; stepping does not enable timers',async()=>{
  const h=harness();
  assert.equal(h.simulation.snapshot().running,false);
  assert.equal(h.simulation.snapshot().participants.length,5);
  for(let i=0;i<12;i++)await h.simulation.step();
  assert.equal(h.simulation.snapshot().running,false);
  assert(h.activity.some(a=>a.kind==='profile_visit'));
  assert(h.activity.some(a=>a.kind==='interest'));
  assert(h.records.some(r=>r.direction==='incoming'&&r.status==='pending'));
  assert(h.simulation.snapshot().log.some(e=>e.kind==='presence'));
  for(const event of h.activity)assert(h.simulation.snapshot().participants.includes(event.id));
  for(let i=0;i<70;i++)await h.simulation.step();
  assert.equal(h.simulation.snapshot().eventCount,82,'Ongoing testing does not silently stop after 60 events');
  assert.equal(h.simulation.snapshot().log.length,30);
});

test('automatic activity runs only after start and stops when paused or disposed',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.parse('2026-11-23T01:00:00Z')});
  const h=harness();
  t.mock.timers.tick(30_000);assert.equal(h.simulation.snapshot().eventCount,0);
  h.simulation.start();t.mock.timers.tick(12_000);await Promise.resolve();await Promise.resolve();
  const plan=h.simulation.snapshot().plannedActivity;
  assert.equal(h.simulation.snapshot().eventCount,0,'Opening the app does not fabricate a visit');
  assert(plan.dueAt>Date.now());assert.deepEqual(h.simulation.snapshot().plannedActivity,plan);
  t.mock.timers.tick(plan.dueAt-Date.now());await Promise.resolve();await Promise.resolve();
  assert.equal(h.simulation.snapshot().eventCount,1);assert.equal(h.simulation.snapshot().log[0].id,plan.id);
  h.simulation.pause();t.mock.timers.tick(120_000);await Promise.resolve();assert.equal(h.simulation.snapshot().eventCount,1);
  h.simulation.dispose();h.simulation.start();assert.equal(h.simulation.snapshot().running,true,'A remounted test panel can restart its controller');
  h.simulation.dispose();
});

test('Saudi routines vary by person and weekend and retain the same check-ins on a cold return',()=>{
  const wednesday=Date.parse('2026-11-25T01:00:00Z'),friday=wednesday+2*86400_000;
  const early=demoVisitWindows('p11',wednesday),evening=demoVisitWindows('p13',wednesday);
  assert.deepEqual(demoVisitWindows('p11',wednesday+3600_000),early);
  assert(early[0].start<evening[0].start);
  assert.notDeepEqual(early.map(w=>w.start-wednesday),demoVisitWindows('p11',friday).map(w=>w.start-friday));
  assert.equal(nextDemoVisit('p11',early[0].start+1000),early[0].start+1000);
  assert(nextDemoVisit('p11',early.at(-1).end)>early.at(-1).end);
});

test('selected fictional members change tiers on month-sized terms',()=>{
  const start=Date.parse('2026-11-25T01:00:00Z');
  const months=Array.from({length:4},(_,i)=>start+i*30*86400_000);
  assert.deepEqual(new Set(months.map(at=>demoMembershipTier('p03','free',at))),new Set(['free','premium']));
  assert(months.every(at=>demoMembershipTier('wp01','seriousness',at)==='seriousness'));
});

test('وفاء keeps her scheduled opener but answers the latest member text quickly between visits',async t=>{
  const now=Date.parse('2026-11-27T11:00:00Z');
  t.mock.timers.enable({apis:['Date','setTimeout'],now});
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  const h=harness();
  h.people[0].id='wp15';
  h.records.push(record('wp15'));
  const rows=[];h.messages.set('conversation',rows);
  h.simulation.start();t.after(()=>h.simulation.dispose());
  t.mock.timers.tick(100);await flush();
  const opener=h.simulation.nextActivity();
  assert.equal(opener.kind,'reply');
  assert.equal(opener.dueAt,nextDemoVisit('wp15',now));
  assert(opener.dueAt>now+20_000);

  rows.push({id:'first',body:'السلام عليكم',senderIsMe:true,createdAt:new Date().toISOString()});
  h.simulation.wake();await flush();
  const first=h.simulation.nextActivity();
  t.mock.timers.tick(2_000);
  const latestAt=Date.now();
  rows.push({id:'second',body:'كيف يومك؟',senderIsMe:true,createdAt:new Date().toISOString()});
  h.simulation.wake();await flush();
  const reply=h.simulation.nextActivity();
  assert.notEqual(reply.id,first.id);
  assert(reply.dueAt>=latestAt+8_000 && reply.dueAt<=latestAt+20_000);
  t.mock.timers.tick(reply.dueAt-Date.now()-1);await flush();
  assert.equal(rows.length,2);
  t.mock.timers.tick(100);await flush();
  assert.equal(rows.length,3);assert.equal(rows[2].id,reply.id);assert.equal(rows[2].senderIsMe,false);
  assert.notEqual(h.simulation.nextActivity()?.kind,'reply');
});

test('a restored check-in reply advances with its original message and notification ID',async t=>{
  const now=Date.parse('2026-11-27T01:00:00Z');
  t.mock.timers.enable({apis:['Date','setTimeout'],now});
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  const h=harness({aiReply:async()=>'رد محفوظ'});
  h.records.push(record());
  const rows=[{id:'msg',body:'هلا',senderIsMe:true,createdAt:new Date().toISOString()}];
  h.messages.set('conversation',rows);
  h.simulation.start();t.mock.timers.tick(100);await flush();
  const saved=structuredClone(h.simulation.snapshot());
  saved.plannedActivity.dueAt=nextDemoVisit('p01',now);
  h.simulation.dispose();
  let calls=0;
  const restored=createDemoSimulation(h.world,{aiReply:async()=>{calls++;return 'رد آخر';}},saved);
  restored.start();t.after(()=>restored.dispose());
  t.mock.timers.tick(100);await flush();
  const reply=restored.nextActivity();
  assert.equal(reply.id,saved.plannedActivity.id);
  assert(reply.dueAt>=now+8_000 && reply.dueAt<=now+20_000);
  t.mock.timers.tick(reply.dueAt-Date.now());await flush();
  assert.equal(rows.length,2);assert.equal(rows[1].body,'رد محفوظ');assert.equal(calls,0);
});

test('an active chat acknowledges local media between visits without scheduling a device reply',async t=>{
  const now=Date.parse('2026-11-27T01:00:00Z');
  t.mock.timers.enable({apis:['Date','setTimeout'],now});
  let calls=0;
  const h=harness({aiReply:async()=>{calls++;return 'AI reply';}});
  h.records.push(record());
  const rows=[{id:'photo',body:'صورة',senderIsMe:true,createdAt:new Date().toISOString(),attachment:{kind:'photo',id:'local-only'}}];
  h.messages.set('conversation',rows);
  h.simulation.start();t.after(()=>h.simulation.dispose());
  for(let seconds=0;seconds<21;seconds++){
    t.mock.timers.tick(1_000);
    await new Promise(resolve=>setImmediate(resolve));
    assert.notEqual(h.simulation.nextActivity()?.kind,'reply');
  }
  assert.equal(rows.length,2);assert.match(rows[1].body,/ما أقدر أشوف/);assert.equal(calls,0);
});

test('a scheduled answer supersedes an ambient visit, survives restart, and commits the same message only once',async t=>{
  const now=Date.parse('2026-11-25T01:00:00Z');
  t.mock.timers.enable({apis:['setTimeout','Date'],now});
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  let calls=0;
  const h=harness({aiReply:async()=>{calls++;return 'هذه إجابة من الشخصية';}});
  h.simulation.start();t.mock.timers.tick(100);await flush();
  const ambient=h.simulation.nextActivity();
  assert.equal(ambient.kind,'profile_visit');
  h.records.push(record('p03'));
  h.messages.set('conversation',[{id:'one',senderIsMe:true,body:'كيف الدوام؟',createdAt:new Date().toISOString()}]);
  h.simulation.wake();await flush();
  const reply=h.simulation.nextActivity(), saved=h.simulation.snapshot();
  assert.equal(reply.kind,'reply');assert.equal(reply.connectionId,'conversation');assert.notEqual(reply.id,ambient.id);
  assert(!('body' in reply));assert.equal(calls,1);
  h.simulation.dispose();
  const restored=createDemoSimulation(h.world,{aiReply:async()=>{throw Error('should never regenerate');}},saved);
  restored.start();
  restored.reconcileActivity(reply.id);assert.equal(h.messages.get('conversation').length,1);
  t.mock.timers.setTime(reply.dueAt);restored.reconcileActivity(reply.id);restored.reconcileActivity(reply.id);
  const rows=h.messages.get('conversation');
  assert.equal(rows.length,2);assert.equal(rows[1].id,reply.id);assert.equal(rows[1].body,'هذه إجابة من الشخصية');
  assert.equal(rows[0].readAt,rows[1].createdAt);assert.equal(restored.snapshot().log.at(-1).connectionId,'conversation');
  restored.dispose();
});

test('outgoing acceptances require capacity at delivery and use the notification ID for exactly one celebration',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.parse('2026-11-25T01:00:00Z')});
  for (const cancel of [false,true]) {
    let other=0;
    const h=harness({interactiveJourney:true,externalAccepted:()=>other});
    h.records.push(record('p04','pending'));h.simulation.start();t.mock.timers.tick(100);
    await new Promise(resolve=>setImmediate(resolve));
    const plan=h.simulation.nextActivity();assert.equal(plan.kind,'match');assert.equal(plan.connectionId,h.records[0].id);
    if(cancel)other=2;
    t.mock.timers.setTime(plan.dueAt);h.simulation.reconcileActivity(plan.id);h.simulation.reconcileActivity(plan.id);
    assert.equal(h.records[0].status,cancel?'pending':'accepted');
    assert.equal(h.records[0].celebrationKey,cancel?undefined:plan.id);
    h.simulation.dispose();
  }
});

test('blocked, withdrawn, edited, superseded, exclusive or paused turns cannot deliver a staged reply',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.parse('2026-11-25T01:00:00Z')});
  for(const change of ['block','withdraw','edit','deleted turn','another turn','exclusive','pause','security']){
    const h=harness({aiReply:async()=>{if(change==='security')throw Object.assign(Error('declined'),{lunaSecurity:true});return 'تمام';}});
    h.records.push(record());const rows=[{id:'one',senderIsMe:true,body:'هلا',createdAt:new Date().toISOString()}];
    h.messages.set('conversation',rows);h.simulation.start();t.mock.timers.tick(100);
    await new Promise(resolve=>setImmediate(resolve));
    const plan=h.simulation.nextActivity();
    if(change==='security')assert.notEqual(plan?.kind,'reply');
    else {
      assert.equal(plan.kind,'reply');
      if(change==='block')h.unavailable.add(plan.personId);
      if(change==='withdraw'){h.records[0].status='closed';h.records[0].allowRematch=false;}
      if(change==='edit')rows[0].body='تغيرت الرسالة';
      if(change==='deleted turn')rows[0].deletedAt=new Date().toISOString();
      if(change==='another turn')rows.push({...rows[0],id:'two'});
      if(change==='exclusive')h.setExclusive(true);
      if(change==='pause')h.simulation.pause();
      t.mock.timers.setTime(plan.dueAt);h.simulation.reconcileActivity(plan.id);
      assert(rows.every(row=>row.senderIsMe),change);
    }
    h.simulation.dispose();
  }
});

test('hiding the app stops the timer until foreground and preserves the already scheduled notification',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.parse('2026-11-25T01:00:00Z')});
  const doc=Object.assign(new EventTarget(),{hidden:false});
  const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'document',{configurable:true,value:doc});
  try{
    const h=harness();h.simulation.start();t.mock.timers.tick(100);
    await new Promise(resolve=>setImmediate(resolve));const plan=h.simulation.nextActivity();
    doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));
    t.mock.timers.tick(plan.dueAt-Date.now()+3600_000);await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.simulation.snapshot().eventCount,0);assert.equal(h.simulation.nextActivity().id,plan.id);
    doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));t.mock.timers.tick(100);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.simulation.snapshot().log.at(-1).id,plan.id);h.simulation.dispose();
  }finally{if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;}
});

test('an overdue external notification materializes once at its scheduled time, unless permission or availability changed',async t=>{
  const now=Date.parse('2026-11-25T04:00:00Z');
  t.mock.timers.enable({apis:['setTimeout','Date'],now});
  const plan={id:crypto.randomUUID(),personId:'p03',kind:'interest',dueAt:now-3600_000};
  for(const situation of ['resume','blocked','exclusive','duplicate','unauthorized']){
    const h=harness();
    let emitted;
    h.world.activity=(kind,id,event)=>{emitted={kind,id,event};};
    if(situation==='blocked')h.unavailable.add(plan.personId);
    if(situation==='exclusive')h.setExclusive(true);
    if(situation==='duplicate')h.world.activityEligible=()=>false;
    const sim=createDemoSimulation(h.world,{canAct:()=>situation!=='unauthorized'},{plannedActivity:plan,socialHistory:[{personId:'p03',stage:1,at:now-2*86400_000}]});
    sim.start();t.mock.timers.tick(100);await Promise.resolve();await Promise.resolve();
    if(situation==='resume'){
      assert.deepEqual(emitted,{kind:'interest',id:'p03',event:plan});
      assert.equal(sim.snapshot().log[0].at,new Date(plan.dueAt).toISOString());
      assert.equal(sim.snapshot().socialHistory.find(h=>h.personId==='p03').stage,2);
      assert.notEqual(sim.snapshot().plannedActivity?.id,plan.id);
    }else assert.equal(emitted,undefined,situation);
    sim.dispose();
  }
});

test('automatic members reply during a personal check-in and remain offline overnight',async t=>{
  const night=Date.parse('2026-11-25T01:00:00Z');
  t.mock.timers.enable({apis:['setTimeout','Date'],now:night});
  const h=harness();
  h.records.push(record('p11','pending'));
  h.simulation.start();t.mock.timers.tick(100);await Promise.resolve();await Promise.resolve();
  assert.equal(h.records[0].status,'pending');assert(!h.online.has('p11'));
  const due=nextDemoVisit('p11',night);
  t.mock.timers.tick(due-Date.now());await Promise.resolve();await Promise.resolve();
  if(h.records[0].status==='pending'){h.simulation.wake();t.mock.timers.tick(100);await Promise.resolve();await Promise.resolve();}
  assert.equal(h.records[0].status,'accepted');assert(h.online.has('p11'));
  h.simulation.dispose();
});

test('external accepted capacity blocks acceptance while leaving pending requests available',async()=>{
  const h=harness({externalAccepted:()=>2});h.records.push(record('p01','pending'));
  for(let i=0;i<12;i++)await h.simulation.step();
  assert(h.records.length<=2);assert(h.records.every(row=>row.status==='pending'));
});

test('blocked or hidden people and an exclusive real pair receive no simulated actions',async()=>{
  let canAct=false;const h=harness({canAct:()=>canAct});
  await h.simulation.step();assert.equal(h.simulation.snapshot().eventCount,0);
  canAct=true;h.setExclusive(true);await h.simulation.step();assert.equal(h.simulation.snapshot().eventCount,0);
  h.setExclusive(false);h.simulation.snapshot().participants.forEach(id=>h.unavailable.add(id));
  await h.simulation.step();assert.equal(h.simulation.snapshot().eventCount,0);
});

test('a simulated peer delivers, reads and types before replying; no AI-to-AI loop',async()=>{
  let request;const h=harness({aiReply:async input=>{request=input;return 'أهلًا، أحب أن نبدأ حديثنا بهدوء.';}});
  h.records.push(record());h.messages.set('conversation',[{id:'hello',senderIsMe:true,body:'أهلًا',createdAt:new Date().toISOString()}]);
  await h.simulation.step();assert(h.messages.get('conversation')[0].deliveredAt);assert(!h.messages.get('conversation')[0].readAt);
  await h.simulation.step();assert(h.messages.get('conversation')[0].readAt);assert.equal(request,undefined);
  await h.simulation.step();assert(h.typing.has('conversation'));assert.equal(request,undefined);
  await h.simulation.step();assert.equal(h.messages.get('conversation').length,2);
  assert.equal(h.messages.get('conversation')[1].senderIsMe,false);
  assert.deepEqual(request.messages,[{senderIsMe:true,body:'أهلًا'}]);
  assert.equal(h.simulation.snapshot().log.at(-1).kind,'ai_reply');
  await h.simulation.step();assert.equal(h.messages.get('conversation').length,2,'No bot-to-bot loop without a user reply');
});

test('pause and reset invalidate an in-flight AI response',async()=>{
  let resolve;const h=harness({aiReply:()=>new Promise(done=>{resolve=done;})});
  h.records.push(record());h.messages.set('conversation',[]);
  await h.simulation.step();
  const pending=h.simulation.step();assert.equal(h.simulation.snapshot().busy,true);
  h.simulation.pause();resolve('رد متأخر');await pending;
  assert.equal(h.messages.get('conversation').length,0);
  h.simulation.reset();assert.equal(h.records.length,0);assert.equal(h.simulation.snapshot().eventCount,0);
});

test('blocking or unmatching during generation prevents a late simulated reply',async()=>{
  for(const change of ['block','unmatch','exclusive']){
    let resolve;const h=harness({aiReply:()=>new Promise(done=>{resolve=done;})});
    h.records.push(record());h.messages.set('conversation',[]);
    await h.simulation.step();
    const pending=h.simulation.step();
    if(change==='block')h.unavailable.add('p01');
    if(change==='unmatch')h.records[0].status='closed';
    if(change==='exclusive')h.setExclusive(true);
    resolve('رد لا يجب إرساله');await pending;
    assert.equal(h.messages.get('conversation').length,0,change);
  }
});

test('every requested fictional peer can respond, including peers outside the five ambient visitors',async()=>{
  const h=harness();h.records.push(record('p02'));h.messages.set('conversation',[]);
  assert(h.simulation.snapshot().participants.includes('p02'));
  await h.simulation.step();await h.simulation.step();
  assert.equal(h.messages.get('conversation').length,1);
});

test('visits precede interest and incoming requests for each simulated person',async()=>{
  const h=harness();for(let i=0;i<15;i++)await h.simulation.step();
  const log=h.simulation.snapshot().log;
  for(const event of log.filter(row=>row.kind==='request')) {
    const prior=log.slice(0,log.indexOf(event));
    assert(prior.some(row=>row.kind==='profile_visit'&&row.personId===event.personId));
    assert(prior.some(row=>row.kind==='interest'&&row.personId===event.personId));
  }
});

test('history preserves early introductions and recent turns within bounds, excludes deleted text and media bytes',()=>{
  const rows=Array.from({length:100},(_,i)=>({id:String(i),senderIsMe:i%2===0,body:i===0?'اسمي عبدالرحمن وأحب القهوة':String(i).repeat(100),createdAt:''}));
  rows[50].deletedAt='now';rows[50].body='secret removed';
  rows[99].attachment={kind:'photo',id:'private-path'};rows[99].body='private media body';
  const history=simulationHistory(rows);
  assert(history.length<=32);assert(history.reduce((total,row)=>total+row.body.length,0)<=8000);
  assert.equal(history[0].body,rows[0].body);assert.match(history.at(-1).body,/محتواها غير متاح/);
  assert(!JSON.stringify(history).includes('secret removed'));assert(!JSON.stringify(history).includes('private'));
});

test('agreement and exclusivity gates suppress replies without signing on behalf of the user',async()=>{
  const h=harness();h.records.push(record());h.messages.set('conversation',[]);
  let ready=false;h.world.chatReady=()=>ready;
  await h.simulation.step();assert.equal(h.messages.get('conversation').length,0);assert(!h.typing.size);
  ready=true;await h.simulation.step();await h.simulation.step();assert.equal(h.messages.get('conversation').length,1);
  h.setExclusive(true);h.world.conversationAllowed=id=>id==='conversation';
  h.messages.get('conversation').push({id:'next',body:'كيفك',senderIsMe:true,createdAt:''});
  for(let i=0;i<4;i++)await h.simulation.step();assert.equal(h.messages.get('conversation').length,3);
});

test('attachments receive an honest local response and never trigger model/media upload',async()=>{
  let called=false;const h=harness({aiReply:async()=>{called=true;return 'seen';}});
  h.records.push(record());h.messages.set('conversation',[{id:'photo',body:'صورة',senderIsMe:true,createdAt:'',attachment:{kind:'photo',id:'private'}}]);
  for(let i=0;i<4;i++)await h.simulation.step();
  assert(!called);assert.match(h.messages.get('conversation').at(-1).body,/ما أقدر أشوف/);
});

test('simulated requests can decline as well as accept, respecting acceptance capacity',async()=>{
  const kinds=new Set();
  for(const id of ['p01','p04','p07','p10','p13']){
    const h=harness();h.records.push(record(id,'pending'));await h.simulation.step();
    kinds.add(h.records[0].status);
    if(h.records[0].status==='accepted')assert(h.records[0].celebrationKey);
  }
  assert(kinds.has('closed'));assert(kinds.has('accepted'));
});

test('fallback uses conversation topic and respects contact boundaries',()=>{
  const p=harness().people[0];
  assert.match(fictionalReply(p,[{senderIsMe:true,body:'ممكن رقم واتساب'}]),/نبقى هنا/);
  assert.match(fictionalReply(p,[{senderIsMe:true,body:'كيف دوامك'}]),/أحلل بيانات/);
  assert.match(fictionalReply({...p,id:'wp15'},[{senderIsMe:true,body:'كيف دوامك'}]),/المحل/);
  assert.match(fictionalReply({...p,id:'wp13'},[{senderIsMe:true,body:'هلا وأهلين'}]),/مشاعل/);
  assert.match(fictionalReply({...p,id:'wp14'},[{senderIsMe:true,body:'وش هواياتك؟'}]),/ألغاز/);
  assert.match(fictionalReply({...p,id:'wp16'},[]),/معك أم غادة/);
  assert.match(fictionalReply({...p,id:'wp17'},[{senderIsMe:true,body:'كيف دوامك؟'}]),/مها تداوم/);
  assert.match(fictionalReply({...p,id:'p16'},[{senderIsMe:true,body:'متى اللقاء؟'}]),/فيصل يفضّل/);
  assert.match(fictionalReply({...p,id:'p18'},[{senderIsMe:true,body:'إذا صار خلاف؟'}]),/ولدي/);
  const greeting=[{senderIsMe:true,body:'السلام عليكم'}];
  assert.match(fictionalReply(p,greeting),/^وعليكم السلام/);
  assert.notEqual(fictionalReply(p,greeting),fictionalReply({...p,id:'p04'},greeting));
  assert.notEqual(fictionalReply(p,[]),fictionalReply({...p,id:'p04'},[]));
});
