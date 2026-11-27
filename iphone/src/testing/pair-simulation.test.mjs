import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {normalizeFamilyPhone} from '../community/familyPhone.ts';
import { isolateCommunityServices } from '../../tests/fixtures/isolated-community-services.mjs';

const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
async function compile(path){
  const file=new URL(path,import.meta.url);
  let source=ts.transpileModule(await readFile(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  source=isolateCommunityServices(source)
    .replace(/import\s*\{[^}]+\}\s*from ['"]\.\.\/ai\/client['"];?/g,'const requestAi=(...args)=>globalThis.__pairSimulationAi(...args);const requestSimulationReply=(...args)=>globalThis.__pairSimulationAi(...args);')
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
const {demoPeople,withOwnReaction,searchMessageRows}=await import(dataUrl);
const testerDirectory=await compile('../community/testingDiscovery.ts');
const {withTestingDiscovery}=await import(moduleUrl(resolveImports(testerDirectory.source.replace("'./data'",JSON.stringify(dataUrl)),testerDirectory.file)));

test('a paid tester can read all fictional directory scores with optional profile basics omitted',async()=>{
  const seed=demoPeople.find(person=>person.id==='p01');
  const viewer={...testProfile('abdulrahman'),...seed,...seed.currentAssessment,partnerCriteria:{}};
  viewer.marriageBasics={...seed.marriageBasics};
  delete viewer.marriageBasics.spokenLanguages;
  delete viewer.marriageBasics.smoking;
  delete viewer.marriageBasics.childrenCount;
  const original=structuredClone(viewer);
  const realCard={id:'peer',alias:'رهام',fit:{covered:7,total:16,assessmentComplete:false,percentage:null}};
  const real={discover:async()=>[realCard],inbox:async()=>[]};
  const directory=(owner)=>withTestingDiscovery(real,()=>viewer,owner,()=>'seriousness').discover({mode:'all'});
  const cards=await directory('authorized-fixture-owner');
  assert.equal(cards[0],realCard);
  const roster=cards.filter(person=>person.isDemo);
  assert.equal(roster.length,15);
  for(const alias of ['لولوة','دانة'])assert(roster.some(person=>person.alias===alias));
  for(const person of roster)assert(Number.isInteger(person.fit.percentage),person.alias);
  assert((await directory()).filter(person=>person.isDemo).every(person=>person.fit.percentage===null));
  assert.deepEqual(viewer,original);
});

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

function harness(t,overrides={}){
  const calls=[],aiCalls=[];
  const actor=overrides.actor??'reham',peer=actor==='reham'?'abdulrahman':'reham';
  const remote={actor,matched:true,profileRevision:'revision',profiles:{},messages:[],read:{},stage:0,agree:{},call:null,...overrides};
  const notifications=[{id:'remote-visit',kind:'profile_visit',actor:peer,createdAt:'2026-01-01T12:00:00Z'}];
  t.mock.method(globalThis,'fetch',async(_url,options)=>{
    const request=JSON.parse(options.body);calls.push(request);
    if(request.action==='notifications')return {ok:true,json:async()=>structuredClone(notifications)};
    if(request.action==='closure_history')return {ok:true,json:async()=>[]};
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
  globalThis.__pairSimulationAi=async (...args)=>{aiCalls.push(args);return 'أهلًا، يسعدني أن نبدأ الحديث بهدوء.';};
  t.after(()=>{globalThis.__pairSimulationAi=previous;});
  const profile=testProfile(actor,{age:33,preferredMinAge:18,preferredMaxAge:60,surveyAnswers:{...testProfile(actor).surveyAnswers,residence_plan:'B'}});
  const account={actor,session:'synthetic-session',profile,profileRevision:'revision'};
  const source=pairSource(account,()=>profile).source;
  return {source,account,profile,calls,remote,notifications,aiCalls,reopen:()=>pairSource(account,()=>profile).source};
}
async function acceptFictional(source,id){const request=await source.request(id);await source.demoAcceptOutgoing(request);return request;}

async function signAsReham(source,id) {
  await source.agree(id,'propose',{days:7,signed:true});
  await source.simulation.step();
  assert.equal((await source.agreement(id)).status,'accepted');
}

test('family contact accepts Saudi mobile and fixed lines and rejects handles, links and embedded text',()=>{
  for (const input of ['٠٥٥ ١٢٣ ٤٥٦٧','+966551234567','00966-55-123-4567']) assert.equal(normalizeFamilyPhone(input),'+966551234567');
  assert.equal(normalizeFamilyPhone('۰۱۱ ۲۳۴ ۵۶۷۸'),'+966112345678');
  for (const input of ['@0551234567','snap 0551234567','https://snapchat.com/0551234567','0551234567\n','0551234567#9','+966151234567','+15512345678',' '.repeat(33)+'0551234567']) assert.equal(normalizeFamilyPhone(input),null,input);
});

test('a signed demo pact can share at expiry or close with a number, and history carries only availability',async t=>{
  const h=harness(t);
  const person=(await h.source.discover({mode:'all'}))[0],id=await acceptFictional(h.source,person.id);
  await assert.rejects(h.source.shareFamilyContact(id,'0551234567',{closeNow:true}));
  await signAsReham(h.source,id);
  await assert.rejects(h.source.shareFamilyContact(id,'0551234567'));
  await assert.rejects(h.source.shareFamilyContact(id,'snap:0551234567',{closeNow:true}));
  const deadline=Date.parse((await h.source.agreement(id)).deadline);
  t.mock.method(Date,'now',()=>deadline+1);
  await h.source.shareFamilyContact(id,'٠٥٥١٢٣٤٥٦٧');
  assert.equal((await h.source.agreement(id)).hasFamilyContact,true);
  await h.source.shareFamilyContact(id,'+966551234567');
  await assert.rejects(h.source.shareFamilyContact(id,'0112345678'),/سبق تأكيد/);
  await assert.rejects(h.source.shareFamilyContact(id,'0112345678',{closeNow:true}),/سبق تأكيد/);
  assert((await h.source.inbox()).some(row=>row.id===id && row.status==='accepted'));
  await h.source.shareFamilyContact(id,'0551234567',{closeNow:true,allowRematch:true});
  await h.source.shareFamilyContact(id,'00966551234567',{closeNow:true});
  assert.equal(await h.source.familyContact(id),'+966551234567');
  await assert.rejects(h.source.shareFamilyContact(id,'0112345678',{closeNow:true}),/سبق تأكيد/);
  const row=await h.source.requestHistoryItem(id);
  assert.equal(row.hasFamilyContact,true);assert(!JSON.stringify(row).includes('551234567'));
  assert.equal((await h.source.requestHistory()).find(r=>r.id===id).hasFamilyContact,true);
  await h.source.reportPerson(person.id,'بلاغ بعد الإنهاء');
  assert.equal(await h.source.familyContact(id),null);
  assert.equal((await h.source.requestHistoryItem(id)).hasFamilyContact,false);
});

test('explicit closures preserve the chosen context, authorized family contact and rematch choice',async t=>{
  const {source}=harness(t,{matched:false});
  const people=await source.discover({mode:'all'});
  const plain=await acceptFictional(source,people[0].id);
  await assert.rejects(source.closeIntroduction(plain,{context:'pact',allowRematch:false}),/ميثاق/);
  await source.closeIntroduction(plain,{context:'general',allowRematch:true});
  const plainRow=await source.requestHistoryItem(plain);
  assert.equal(plainRow.closureContext,'general');
  assert.equal(plainRow.hasFamilyContact,false);
  assert.equal(plainRow.canRequestAgain,true);

  const signed=await acceptFictional(source,people[1].id);
  await signAsReham(source,signed);
  const choice={context:'pact',allowRematch:false,familyPhone:'٠٥٥١٢٣٤٥٦٧'};
  await assert.rejects(source.closeIntroduction(signed,{...choice,familyPhone:'@example'}),/رقم/);
  assert((await source.inbox()).some(r=>r.id===signed));
  await source.closeIntroduction(signed,choice);
  await source.closeIntroduction(signed,choice);
  const signedRow=await source.requestHistoryItem(signed);
  assert.equal(signedRow.closureContext,'pact');
  assert.equal(signedRow.hasFamilyContact,true);
  assert.equal(signedRow.canRequestAgain,false);
  assert(!JSON.stringify(signedRow).match(/[0٠][5٥]{2}/));
  assert.equal(await source.familyContact(signed),'+966551234567');
});

test('an expired pact resumes demo messaging only once both agree to exclusivity',async t=>{
  const h=harness(t,{matched:false});
  const person=(await h.source.discover({mode:'all'}))[0],id=await acceptFictional(h.source,person.id);
  await signAsReham(h.source,id);
  const deadline=Date.parse((await h.source.agreement(id)).deadline);
  t.mock.method(Date,'now',()=>deadline+1);
  await h.source.journeyChoice(id,'exclusive','propose',null);
  await assert.rejects(h.source.send(id,'رسالة','before-consent'));
  await h.source.simulation.step();
  assert.equal((await h.source.agreement(id)).exclusive,true);
  assert.equal(await h.source.send(id,'نرتب الخطوة الجاية','after-consent'),'after-consent');
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
 await signAsReham(h.source,local);
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
  await signAsReham(h.source,id);
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
  const h=harness(t,{actor:'abdulrahman'});await h.source.inbox();
  for(let i=0;i<3;i++)await h.source.simulation.step();
  const rows=await h.source.notifications();
  const local=rows.find(n=>n.id!=='remote-visit');assert(local);
  assert.equal(local.person.isDemo,true);assert.equal(rows.find(n=>n.id==='remote-visit').person.id,'reham');
  assert.equal(rows.at(-1).id,'remote-visit');
  await h.source.readNotifications([local.id,'remote-visit']);
  assert.deepEqual(h.calls.find(c=>c.action==='notifications_read').payload.ids,['remote-visit']);
  const read=await h.source.notifications();assert(read.find(n=>n.id===local.id).readAt);assert(read.find(n=>n.id==='remote-visit').readAt);
});

test('real and fictional chats keep independent messages, combined unread and local celebration acknowledgment',async t=>{
  const realMessage={id:'real-message',sender:'reham',body:'PRIVATE REAL TESTER MESSAGE',createdAt:'2026-01-01T12:00:00Z'};
  const h=harness(t,{actor:'abdulrahman',messages:[realMessage]});await h.source.inbox();
  const participant=h.source.simulation.snapshot().participants[0];
  const id=await acceptFictional(h.source,participant);
  const local=(await h.source.inbox()).find(row=>row.id===id);assert(local?.celebrationKey);
  await h.source.acknowledgeMatch(local.celebrationKey);
  assert.equal((await h.source.inbox()).find(row=>row.id===id).celebrationKey,undefined);
  assert(!h.calls.some(call=>call.action==='match_seen'),'Fictional celebrations never mutate the real pair');
  await h.source.simulation.step();
  const proposal=await h.source.agreement(id);
  await h.source.agree(id,'accept',{proposalId:proposal.proposalId,signed:true});
  await h.source.send(id,'أهلًا، كيف كان يومك؟','local-message');
  for(const event of ['delivered','read','typing','ai_reply']) {
    await h.source.simulation.step();assert.equal(h.source.simulation.snapshot().log.at(-1).kind,event);
  }
  assert.equal((await h.source.thread(id)).length,2);
  assert.equal((await h.source.thread('tester-pair')).length,1);
  assert.deepEqual(h.aiCalls,[[participant,[{senderIsMe:true,body:'أهلًا، كيف كان يومك؟'}],h.account.session]],'Only this fictional transcript may reach the simulation provider');
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
  const h=harness(t,{actor:'abdulrahman'});await h.source.inbox();
  for(const id of h.source.simulation.snapshot().participants)await h.source.reportPerson(id,'ملف توضيحي للاختبار');
  await h.source.simulation.step();assert.equal(h.source.simulation.snapshot().eventCount,0);
  h.source.simulation.reset();
  const outsider=(await h.source.discover({mode:'all'})).find(card=>card.isDemo);
  const previous=await acceptFictional(h.source,outsider.id);
  h.remote.exclusive=true;await h.source.heartbeat();
  assert.deepEqual((await h.source.inbox()).map(row=>row.id),['tester-pair']);
  await assert.rejects(h.source.thread(previous),/حصري/);
  await assert.rejects(h.source.setInterest(outsider.id,true),/حصري/);
  await h.source.simulation.step();assert.equal(h.source.simulation.snapshot().eventCount,0);
  assert.deepEqual(await h.source.discover({mode:'all'}),[]);
  await assert.rejects(h.source.request('p01'),/حصري/);
  assert(!h.calls.some(call=>call.action==='send'));
});

test('profiles with different preferences remain contactable and retain selective photos',async t=>{
  const h=harness(t);
  const viewer=demoPeople.find(p=>p.gender==='woman');
  Object.assign(h.profile,viewer.currentAssessment,{
    surveyAnswers:{...viewer.currentAssessment.surveyAnswers,residence_plan:'B'},
    partnerCriteria:viewer.partnerCriteria,marriageBasics:{...viewer.marriageBasics,polygynyPreference:'not_open'},
  });
  const all=await h.source.discover({mode:'all'});
  assert.equal(all.length,15);
  assert(all.every(person=>person.eligible));
  const strict=await h.source.discover({mode:'all',eligibleOnly:true});
  assert.equal(strict.length,15);assert(strict.every(person=>person.eligible===true));
  assert.ok(await h.source.request('p04'));
  h.profile.marriageBasics={...h.profile.marriageBasics,polygynyPreference:'open_to_discussion'};
  const people=await h.source.discover({mode:'all'});
  assert.equal(people.length,15);assert(people.every(person=>person.isDemo));
  assert.equal(people.find(p=>p.id==='p01').demoPhoto,'/demo/portraits/p01-everyday.webp');
  assert.equal(people.find(p=>p.id==='p11').demoPhoto,'/demo/portraits/p11-everyday.webp');
  assert.equal(people.find(p=>p.id==='p10').demoPhoto,undefined);
  assert.equal(people.filter(p=>!p.demoPhoto).length,8);
});

test('old tester commitment does not erase new fictional matches when reloading after exclusivity ends',async t=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const stored=new Map();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)}});
  t.after(()=>{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;});
  const h=harness(t,{matched:false,retiredFictional:true,exclusive:false});
  await h.source.inbox();
  const people=await h.source.discover({mode:'all'});
  const id=await acceptFictional(h.source,people[0].id);
  await signAsReham(h.source,id);
  await h.source.send(id,'هذه محادثة توضيحية محفوظة','persisted-message');
  const restored=h.reopen();
  assert(restored.simulation,'A returning tester keeps the same interactive directory');
  assert((await restored.inbox()).some(row=>row.id===id),'Historical retirement must not delete newly created local conversations');
  assert.equal((await restored.thread(id))[0].body,'هذه محادثة توضيحية محفوظة');
});

test('a locally scheduled chat answer is restored through tester storage and the ordinary thread without a remote send',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.parse('2026-11-25T01:00:00Z')});
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),stored=new Map();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)}});
  t.after(()=>{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;});
  const h=harness(t,{matched:false});
  await h.source.inbox();
  const [peer]=await h.source.discover({mode:'all'}),id=await acceptFictional(h.source,peer.id);
  await signAsReham(h.source,id);
  await h.source.send(id,'متى يناسبك نتكلم؟','my-turn');
  h.source.simulation.start();t.mock.timers.tick(100);
  await new Promise(resolve=>setImmediate(resolve));
  const plan=h.source.simulation.nextActivity();
  assert.equal(plan.kind,'reply');assert.equal(plan.connectionId,id);
  const restored=h.reopen();
  h.source.simulation.dispose();restored.simulation.start();
  assert.equal(restored.simulation.nextActivity(),undefined,'The saved tester session must first revalidate');
  await restored.inbox();
  assert.equal(restored.simulation.nextActivity().id,plan.id);
  t.mock.timers.setTime(plan.dueAt);
  restored.simulation.reconcileActivity(plan.id);restored.simulation.reconcileActivity(plan.id);
  const rows=await restored.thread(id);
  assert.equal(rows.length,2);assert.equal(rows[1].id,plan.id);assert.equal(rows[1].senderIsMe,false);
  assert(!h.calls.some(call=>call.action==='send'));restored.simulation.dispose();
});

test('Abdulrahman can explore both fictional pools with a partially saved assessment',async t=>{
  const saved={
    displayName:'Test account',age:33,city:'الرياض',assessmentVersion:'marriage-v4',
    preferredMinAge:18,preferredMaxAge:60,
    marriageBasics:{maritalStatus:'never_married'},
    surveyAnswers:{residence_plan:'B',children_plan:'A'}
  };
  const h=harness(t,{actor:'abdulrahman',profiles:{
    abdulrahman:saved,reham:{displayName:'Other tester',age:30,city:'الرياض'}
  }});
  for(const gender of ['man','woman']){
    h.profile.gender=gender;
    const source=h.reopen();
    const people=await source.discover({mode:'all'});
    const roster=people.filter(person=>person.isDemo);
    assert.equal(roster.length,15);
    assert(roster.every(person=>person.fit.version==='marriage-v4'&&
      person.fit.assessmentComplete&&Number.isInteger(person.fit.percentage)));
    assert.equal(people.find(person=>person.id==='reham').fit.percentage,null);
    const recommended=(await source.discover({mode:'recommended'})).filter(person=>person.isDemo);
    assert(recommended.length>=3&&recommended.length<=5);
    if(recommended.length>3)assert(recommended.every(person=>!person.recommendationKind));
  }
  assert.deepEqual(h.remote.profiles.abdulrahman.surveyAnswers,{residence_plan:'B',children_plan:'A'});
  assert(h.calls.every(call=>call.action==='state'));
});

test('a partially saved polygyny refusal narrows tester recommendations while the fictional directory stays open',async t=>{
  const h=harness(t,{actor:'reham',profiles:{reham:{displayName:'Tester',gender:'woman',city:'الرياض',age:29,
    preferredMinAge:18,preferredMaxAge:60,assessmentVersion:'marriage-v4',
    surveyAnswers:{residence_plan:'B'},marriageBasics:{polygynyPreference:'not_open'}}}});
  const source=h.reopen(),all=(await source.discover({mode:'all'})).filter(person=>person.isDemo);
  const eligible=person=>person.marriageBasics?.polygynyPreference==='not_open'&&['never_married','divorced','widowed'].includes(person.marriageBasics?.maritalStatus);
  assert(all.some(person=>!eligible(person)));
  assert(all.every(person=>!person.recommendationKind));
  const wanted=(await source.discover({mode:'recommended'})).filter(person=>person.isDemo);
  assert(wanted.length>0);
  assert(wanted.every(eligible));
});

test('fictional discovery uses Abdulrahman’s complete assessment and honors active filters',async t=>{
  const fixture=demoPeople.find(person=>person.id==='p01');
  const h=harness(t,{actor:'abdulrahman',profiles:{abdulrahman:{
    ...fixture,...fixture.currentAssessment,preferredMinAge:25,preferredMaxAge:25
  }}});
  const directory=(await h.source.discover({mode:'all'})).filter(person=>person.isDemo);
  assert.equal(directory.length,15);
  const people=(await h.source.discover({mode:'all',eligibleOnly:true})).filter(person=>person.isDemo);
  assert.deepEqual(people.map(person=>person.id),directory.map(person=>person.id));
  const filtered=await h.source.discover({mode:'all',minAge:25,maxAge:25});
  assert.deepEqual(filtered.filter(person=>person.isDemo).map(person=>person.id),['wp07']);
  assert.equal(people[0].fit.assessmentComplete,true);
  assert.deepEqual(await h.source.discover({mode:'all',search:'No matching profile'}),[]);
});

for (const actor of ['reham','abdulrahman']) {
  test(actor+' can request any visible reading and the peer handles the invitation and agreement',async t=>{
    const h=harness(t,{actor});
    const peers=(await h.source.discover({mode:'all'})).filter(person=>person.isDemo);
    const readings=h.source.profileReading;
    assert.equal(peers.length,15);
    const reports=new Set();
    for (const person of peers) {
      const accepted=await readings.request(person.id,'request');
      assert.equal(accepted.status,'ready');
      await readings.generate(person.id);
      const review=await readings.request(person.id,'get');
      assert.equal(review.peerReviewed,true);
      assert(review.review.length>0);
      const result=await readings.request(person.id,'review',Object.fromEntries(review.review.map(row=>[row.id,true])));
      assert.equal(result.status,'shared');
      assert(result.findings.some(row=>row.section==='patterns'));
      reports.add(JSON.stringify(result.findings));
    }
    assert.equal(reports.size,peers.length);
    await assert.rejects(readings.request('tester-pair','request'));
    const person=peers.find(p=>p.eligible!==false);
    const id=await h.source.request(person.id);
    await h.source.simulation.step();
    assert((await h.source.inbox()).some(row=>row.id===id && row.status==='accepted'));
    if(actor==='reham') await signAsReham(h.source,id);
    else {
      await h.source.simulation.step();
      const offer=await h.source.agreement(id);
      assert.equal(offer.status,'proposed');
      assert.equal((await h.source.agree(id,'accept',{proposalId:offer.proposalId,signed:true})).status,'accepted');
    }
    await h.source.send(id,'كيف يومك؟','test-text');
    for(let i=0;i<4;i++) await h.source.simulation.step();
    assert.equal((await h.source.thread(id)).at(-1).senderIsMe,false);
    assert(!h.calls.some(call=>['send','agreement_propose','agreement_accept'].includes(call.action)));
  });
}
