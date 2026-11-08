import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoSimulation, fictionalReply, simulationHistory } from './simulation.ts';

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
  t.mock.timers.enable({apis:['setTimeout']});
  const h=harness();
  t.mock.timers.tick(30_000);assert.equal(h.simulation.snapshot().eventCount,0);
  h.simulation.start();t.mock.timers.tick(12_000);await Promise.resolve();await Promise.resolve();
  assert.equal(h.simulation.snapshot().eventCount,1);
  h.simulation.pause();t.mock.timers.tick(120_000);await Promise.resolve();assert.equal(h.simulation.snapshot().eventCount,1);
  h.simulation.dispose();h.simulation.start();assert.equal(h.simulation.snapshot().running,true,'A remounted test panel can restart its controller');
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
  assert.match(fictionalReply(p,[{senderIsMe:true,body:'كيف دوامك'}]),/الهندسة/);
  assert.notEqual(fictionalReply(p,[]),fictionalReply({...p,id:'p04'},[]));
});
