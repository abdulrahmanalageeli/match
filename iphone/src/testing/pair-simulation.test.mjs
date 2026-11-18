import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
async function compile(path){
  const file=new URL(path,import.meta.url);
  let source=ts.transpileModule(await readFile(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  source=source.replace(/import\s*\{[^}]+\}\s*from ['"]\.\.\/ai\/client['"];?/g,'const requestAi=(...args)=>globalThis.__pairSimulationAi(...args); const requestSimulationReply=(personId,messages)=>globalThis.__pairSimulationAi({personId,messages});')
    .replace(/import\s*\{[^}]+\}\s*from ['"]\.\.\/voice\/nativeCalls['"];?/, "const ringNativePhones=async()=>{throw Error('offline')};")
    .replace(/import\s*\{[^}]+\}\s*from ['"]\.\.\/photos\/verifyPhoto['"];?/, "const captureForPhoto=async()=>{throw Error('offline')}; const verifyUploadedPhoto=async()=>{throw Error('offline')};")
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/verification\/client["'];?/, 'const manualVerificationSource=()=>({});')
    .replace(/import\s*\{[^}]+\}\s*from ['"]\.\.\/cloud['"];?/g,'')
    .replace(/import\s*\{[^}]+\}\s*from ['"]\.\/updates['"];?/g,'')
    .replace(/import\s*\{[^}]+\}\s*from ['"]\.\.\/deployment['"];?/g,"const marriageProjectUrl='https://test.invalid';const marriagePublishableKey='public-test-key';");
  return {source,file};
}
function resolveImports(source,file){return source.replace(/from (['"])(\.{1,2}\/[^'"]+)\1/g,(_all,_quote,path)=>'from '+JSON.stringify(new URL(path.endsWith('.ts')?path:path+'.ts',file).href));}
const data=await compile('../community/data.ts');
const dataUrl=moduleUrl(resolveImports(data.source,data.file)+"\nclass CloudError extends Error{constructor(message,status){super(message);this.status=status;}}\nconst cloud=null;const privateUpdates=()=>()=>()=>{};");
const pair=await compile('./pair.ts');
const pairUrl=moduleUrl(resolveImports(pair.source.replace("'../community/data'",JSON.stringify(dataUrl)),pair.file));
const {pairSource,testProfile}=await import(pairUrl);
const {withOwnReaction,searchMessageRows}=await import(dataUrl);

test('restricted browser storage does not prevent either saved tester account from opening',async t=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new DOMException('The operation is insecure.','SecurityError');}});
  t.after(()=>{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;});
  for(const actor of ['reham','abdulrahman']) {
    const profile=testProfile(actor);
    const account={actor,session:'saved-token',profile,profileRevision:'current'};
    assert.doesNotThrow(()=>pairSource(account,()=>profile));
  }
});

function harness(t,overrides={},admin=false){
  const actor=admin?'abdulrahman':'reham',peer=admin?'reham':'abdulrahman';
  const calls=[],aiCalls=[];
  const remote={actor,matched:true,profileRevision:'revision',profiles:{},messages:[],read:{},stage:0,agree:{},call:null,...overrides};
  const notifications=[{id:'remote-visit',kind:'profile_visit',actor:peer,createdAt:'2026-01-01T12:00:00Z'}];
  t.mock.method(globalThis,'fetch',async(_url,options)=>{
    const request=JSON.parse(options.body);calls.push(request);
    if(request.action==='notifications')return {ok:true,json:async()=>structuredClone(notifications)};
    if(request.action==='typing_state')return {ok:true,json:async()=>true};
    if(request.action==='typing_set')return {ok:true,json:async()=>true};
    if(request.action==='notifications_read')notifications.forEach(row=>{if(request.payload.ids.includes(row.id))row.readAt=new Date().toISOString();});
    if(request.action==='read')remote.read[actor]=remote.messages.find(m=>m.id===request.payload.id)?.createdAt;
    if(request.action==='rematch_request')remote.rematchRequestedBy=actor;
    if(request.action==='rematch_accept'){remote.matched=true;delete remote.rematchRequestedBy;}
    if(request.action==='match_seen')remote.celebrationSeen={[actor]:request.payload.key};
    if(request.action==='send')remote.messages.push({id:request.payload.clientId,sender:actor,body:request.payload.body,createdAt:new Date().toISOString()});
    if(request.action==='message_react'){
      const message=remote.messages.find(m=>m.id===request.payload.id);
      message.reactions=withOwnReaction(message.reactions,request.payload.reaction);
    }
    return {ok:true,json:async()=>structuredClone(remote)};
  });
  const previous=globalThis.__pairSimulationAi;
  globalThis.__pairSimulationAi=async input=>{aiCalls.push(input);return 'أهلًا، يسعدني أن نبدأ الحديث بهدوء.';};
  t.after(()=>{globalThis.__pairSimulationAi=previous;});
  const profile={...testProfile(actor,{age:33,preferredMinAge:18,preferredMaxAge:60,surveyAnswers:{...testProfile(actor).surveyAnswers,residence_plan:'C'}}),gender:'woman'};
  const account={actor,session:'synthetic-session',profile,profileRevision:'revision'};
  const source=pairSource(account,()=>profile).source;
  return {source,account,profile,calls,remote,notifications,aiCalls,peer,reopen:()=>pairSource(account,()=>profile).source};
}
async function acceptFictional(source,id){
  const request=await source.request(id);await source.demoAcceptOutgoing(request);
  if(source.simulation&&(await source.agreement(request)).status==='none'){
    await assert.rejects(source.send(request,'لا ترسل قبل الميثاق','blocked-before-consent'),/شروط التعارف ومدته/);
    await source.agree(request,'propose',{days:7,signed:true});
    await source.simulation.step();
    assert.equal((await source.agreement(request)).status,'accepted');
  }
  return request;
}

test('regular tester has no administrator simulation controls and never requests simulated AI replies',async t=>{
  const h=harness(t);await h.source.inbox();
  assert.equal(h.source.simulation,undefined);
  assert.equal(h.aiCalls.length,0);
});

test('library paging excludes deleted and view-once rows, and paired unread/typing stay in their own conversation',async t=>{
 const list=Array.from({length:62},(_,i)=>({id:`m${i}`,sender:'abdulrahman',body:`Family ${i}`,createdAt:new Date(Date.now()-100000+i*100).toISOString()}));
 list[1].attachment={id:'once',kind:'photo',viewOnce:true};list[2].deletedAt=new Date().toISOString();
 list[3].attachment={id:'photo',kind:'photo'};list[4].attachment={id:'audio',kind:'audio'};
 assert.equal(searchMessageRows(list,'FAMILY').length,50);
 assert.deepEqual(searchMessageRows(list,'family','m12').map(m=>m.id),['m0','m3','m4','m5','m6','m7','m8','m9','m10','m11']);
 assert.deepEqual(searchMessageRows(list,'').map(m=>m.id),['m3','m4']);
 assert.deepEqual(searchMessageRows(list,'',undefined,'photo').map(m=>m.id),['m3']);
 const h=harness(t,{messages:list,seriousness:{status:'family'},read:{reham:list[0].createdAt}});
 assert.deepEqual(await h.source.readState('tester-pair'),{firstUnreadId:'m1',unreadCount:60});
 assert.deepEqual((await h.source.searchMessages('tester-pair','')).map(m=>m.id),['m3','m4']);
 await h.source.setTyping('tester-pair',true);assert.equal(await h.source.typingState('tester-pair'),true);
 assert.deepEqual(h.calls.find(c=>c.action==='typing_set').payload,{active:true},'No draft text is transmitted');
 const participant=(await h.source.discover({mode:'all'}))[0],local=await acceptFictional(h.source,participant.id);
 await h.source.send(local,'local family fixture','mine');const calls=h.calls.length;
 assert.equal((await h.source.searchMessages(local,'family'))[0].body,'local family fixture');
 assert.equal(await h.source.typingState(local),false);await h.source.setTyping(local,true);
 assert.deepEqual(await h.source.readState(local),{firstUnreadId:null,unreadCount:0});assert.equal(h.calls.length,calls);
 h.remote.matched=false;await assert.rejects(h.source.searchMessages('tester-pair','family'),/غير متاحة/);
});

test('pair and local reactions use their own source, refresh historical messages and remove only the viewer choice',async t=>{
  const h=harness(t,{messages:[{id:'real',sender:'abdulrahman',body:'fixture',createdAt:new Date().toISOString(),reactions:[{emoji:'❤️',count:1,mine:false}]}]});
  await h.source.inbox();
  assert.deepEqual(await h.source.reactToMessage('tester-pair','real','❤️'),[{emoji:'❤️',count:2,mine:true}]);
  assert.deepEqual((await h.source.messageChanges('tester-pair',['real']))[0].reactions,[{emoji:'❤️',count:2,mine:true}]);
  assert.deepEqual(await h.source.reactToMessage('tester-pair','real','👍'),[{emoji:'❤️',count:1,mine:false},{emoji:'👍',count:1,mine:true}]);
  assert.deepEqual(await h.source.reactToMessage('tester-pair','real',null),[{emoji:'❤️',count:1,mine:false}]);
  const person=(await h.source.discover({mode:'all'}))[0],id=await acceptFictional(h.source,person.id);
  await h.source.send(id,'local fixture','local');
  const remoteCalls=h.calls.length;
  assert.deepEqual(await h.source.reactToMessage(id,'local','😂'),[{emoji:'😂',count:1,mine:true}]);
  assert.deepEqual((await h.source.messageChanges(id,['local']))[0].reactions,[{emoji:'😂',count:1,mine:true}]);
  assert.deepEqual(await h.source.reactToMessage(id,'local','😂'),[{emoji:'😂',count:1,mine:true}],'Setting the same choice twice is idempotent');
  assert.deepEqual(await h.source.reactToMessage(id,'local',null),[]);
  assert.equal(h.calls.length,remoteCalls,'Fictional reactions never write to the paired chat');
  await h.source.deleteMessage(id,'local');
  await assert.rejects(h.source.reactToMessage(id,'local','❤️'),/غير متاحة/);
  assert.deepEqual((await h.source.thread(id))[0].reactions,[]);
});

test('simulation notifications merge with real tester notifications and mark only their own storage read',async t=>{
  const h=harness(t,{},true);await h.source.inbox();
  for(let i=0;i<3;i++)await h.source.simulation.step();
  const rows=await h.source.notifications();
  const local=rows.find(n=>n.id!=='remote-visit');assert(local);
  assert.equal(local.person.isDemo,true);assert.equal(rows.find(n=>n.id==='remote-visit').person.id,h.peer);
  assert.equal(rows.at(-1).id,'remote-visit');
  await h.source.readNotifications([local.id,'remote-visit']);
  assert.deepEqual(h.calls.find(c=>c.action==='notifications_read').payload.ids,['remote-visit']);
  const read=await h.source.notifications();assert(read.find(n=>n.id===local.id).readAt);assert(read.find(n=>n.id==='remote-visit').readAt);
});

test('real and fictional chats keep independent messages, combined unread and local celebration acknowledgment',async t=>{
  const realMessage={id:'real-message',sender:'reham',body:'PRIVATE REAL TESTER MESSAGE',createdAt:'2026-01-01T12:00:00Z'};
  const h=harness(t,{messages:[realMessage]},true);await h.source.inbox();
  const participant=h.source.simulation.snapshot().participants[0];
  const id=await acceptFictional(h.source,participant);
  const local=(await h.source.inbox()).find(row=>row.id===id);assert(local?.celebrationKey);
  await h.source.acknowledgeMatch(local.celebrationKey);
  assert.equal((await h.source.inbox()).find(row=>row.id===id).celebrationKey,undefined);
  assert(!h.calls.some(call=>call.action==='match_seen'),'Fictional celebrations never mutate the real pair');
  await h.source.send(id,'أهلًا، كيف كان يومك؟','local-message');
  for(const kind of ['delivered','read','typing','ai_reply']){
    await h.source.simulation.step();assert.equal(h.source.simulation.snapshot().log.at(-1).kind,kind);
  }
  assert.equal((await h.source.thread(id)).length,2);
  assert.equal((await h.source.thread('tester-pair')).length,1);
  assert.equal(h.aiCalls.length,1,'Only the administrator simulation requests a fictional reply');
  assert(!JSON.stringify(h.aiCalls).includes(realMessage.body),'Real-pair messages never enter the simulation request');
  assert.equal(h.source.simulation.snapshot().log.at(-1).kind,'ai_reply');
  assert.equal(await h.source.unreadCount(),2,'The bottom navigation badge counts both local and real unread replies');
  const last=(await h.source.thread(id)).at(-1);await h.source.markRead(id,last.id);
  assert.equal(await h.source.unreadCount(),1);
  h.source.simulation.reset();assert.deepEqual(await h.source.thread('tester-pair'),[{...realMessage,reply:null,senderIsMe:false,deliveredAt:null,readAt:null}]);
});

test('combined capacity allows one fictional match beside the real pair and blocks additional requests',async t=>{
  const h=harness(t);const people=await h.source.discover({mode:'all'});
  const id=await acceptFictional(h.source,people[0].id);
  assert.equal((await h.source.inbox()).filter(row=>row.status==='accepted').length,2);
  await assert.rejects(h.source.request(people[1].id),/تعارفان/);
  const updated=await h.source.discover({mode:'all'});assert(updated.every(p=>p.viewerAtCapacity));
  await h.source.act(id,'cancel',undefined,true);
  const request=await h.source.request(people[1].id);assert(request);
});

test('an unmatched real tester cannot request a third connection after two fictional matches',async t=>{
  const h=harness(t,{matched:false,allowRematch:true});
  const people=(await h.source.discover({mode:'all'})).filter(p=>p.isDemo);
  await acceptFictional(h.source,people[0].id);await acceptFictional(h.source,people[1].id);
  await assert.rejects(h.source.request('abdulrahman'),/تعارفان/);
  assert(!h.calls.some(call=>call.action==='rematch_request'));
});

test('exclusivity and blocked profiles stop simulated activity without sending real chat messages',async t=>{
  const h=harness(t,{},true);await h.source.inbox();
  for(const id of h.source.simulation.snapshot().participants)await h.source.reportPerson(id,'ملف توضيحي للاختبار');
  await h.source.simulation.step();assert.equal(h.source.simulation.snapshot().eventCount,0);
  h.source.simulation.reset();h.remote.exclusive=true;await h.source.heartbeat();
  await h.source.simulation.step();assert.equal(h.source.simulation.snapshot().eventCount,0);
  assert.deepEqual(await h.source.discover({mode:'all'}),[]);
  await assert.rejects(h.source.request('p01'),/حصري/);
  assert(!h.calls.some(call=>call.action==='send'));
});

test('all fifteen eligible opposite-gender profiles retain selective photos through paired discovery',async t=>{
  const h=harness(t);const people=await h.source.discover({mode:'all'});
  assert.equal(people.length,15);assert(people.every(p=>p.isDemo));
  assert.equal(people.find(p=>p.id==='p01').demoPhoto,'/demo/portraits/fahad.webp');
  assert.equal(people.find(p=>p.id==='p07').demoPhoto,'/demo/portraits/omar.webp');
  assert(people.filter(p=>!p.demoPhoto).length>0,'Profiles without a bundled portrait keep their fallback');
});

test('old tester commitment does not erase new fictional matches when reloading after exclusivity ends',async t=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const stored=new Map();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)}});
  t.after(()=>{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;});
  const h=harness(t,{matched:false,retiredFictional:true,exclusive:false},true);
  await h.source.inbox();
  const people=await h.source.discover({mode:'all'});
  const id=await acceptFictional(h.source,people[0].id);
  await h.source.send(id,'هذه محادثة توضيحية محفوظة','persisted-message');
  const restored=h.reopen();
  assert.equal(restored.simulation.snapshot().running,false);
  assert((await restored.inbox()).some(row=>row.id===id),'Historical retirement must not delete newly created local conversations');
  assert.equal((await restored.thread(id))[0].body,'هذه محادثة توضيحية محفوظة');
});
