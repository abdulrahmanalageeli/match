import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { pairAssessmentFixture } from './pairAssessmentFixture.ts';
import { projectPairState } from '../../supabase/functions/_shared/pair-privacy.ts';
import { compareBeena } from '../beena/model.ts';
import { conversationInsights } from '../compatibility/conversation-insights.ts';

const fixture = { city:'الرياض', age:29, preferredMinAge:22, preferredMaxAge:40, interestIds:[], surveyAnswers:{}, marriageBasics:{} };
let compiled = ts.transpileModule(await readFile(new URL('./pair.ts', import.meta.url), 'utf8'),
  { compilerOptions:{ target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.ESNext } }).outputText;
compiled = compiled
  .replace(/import\s*\{[^}]+\}\s*from ['"]\.\.\/ai\/client['"];?/, "const requestAi=async()=>{throw Error('offline')};")
  .replace(/import\s*\{[^}]+\}\s*from ['"]\.\.\/verification\/client['"];?/, 'const manualVerificationSource=()=>({});')
  .replace(/import\s*\{[^}]+\}\s*from ['"]\.\.\/deployment['"];?/, "const marriageProjectUrl='https://test.invalid';const marriagePublishableKey='public';")
  .replace(/import\s*\{[^}]+\}\s*from ['"]\.\.\/community\/data['"];?/, `const demoProfile=${JSON.stringify(fixture)};
    const demoCommunity=viewer=>({inbox:async()=>[],watch:()=>()=>{},discover:async()=>[{id:'fictional',age:29,viewer:viewer()}]});`)
  .replace(/from (['"])(\.{1,2}\/[^'"]+)\1/g, (_all,_quote,path)=>'from '+JSON.stringify(new URL(path+'.ts',import.meta.url).href));
const { pairSource, testProfile } = await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const flush = () => new Promise(resolve=>setImmediate(resolve));
const response = state => ({ok:true,json:async()=>structuredClone(state)});

function harness(t) {
  const ticks=new Set(),events=new Map(),calls=[],cleanup=[];
  const add=(name,fn)=>{if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);};
  const remove=(name,fn)=>events.get(name)?.delete(fn);
  const prior={window:globalThis.window,document:globalThis.document};
  globalThis.window={setInterval:fn=>{ticks.add(fn);return fn;},addEventListener:add,removeEventListener:remove};
  globalThis.document={hidden:false,addEventListener:add,removeEventListener:remove};
  t.mock.method(globalThis,'clearInterval',fn=>ticks.delete(fn));
  t.after(()=>{for(const stop of cleanup)stop();globalThis.window=prior.window;globalThis.document=prior.document;});
  const profiles=Object.fromEntries(['reham','abdulrahman'].map(actor=>[actor,testProfile(actor,structuredClone(pairAssessmentFixture[actor]))]));
  const revisions={reham:'reham-0',abdulrahman:'abdulrahman-0'};
  let number=0;
  const snapshot=actor=>projectPairState({actor,profileRevision:revisions[actor],matched:true,profiles:structuredClone(profiles),
    beenaFit:compareBeena(profiles[actor].beena,profiles[actor==='reham'?'abdulrahman':'reham'].beena),
    messages:[],read:{},stage:0,agree:{},call:null});
  const account=actor=>({actor,session:actor,profile:structuredClone(profiles[actor]),profileRevision:revisions[actor]});
  t.mock.method(globalThis,'fetch',async(_url,options)=>{
    const request=JSON.parse(options.body);calls.push(request);
    const actor=request.session;
    if(request.action==='profile'){
      if(request.payload.expectedRevision!==revisions[actor])return {ok:false,status:409,json:async()=>({error:'conflict'})};
      profiles[actor]=structuredClone(request.payload.profile);revisions[actor]=actor+'-'+ ++number;
    }
    return response(snapshot(actor));
  });
  return {profiles,revisions,calls,snapshot,account,cleanup,
    tick:async()=>{for(const fn of ticks)fn();await flush();},
    event:async name=>{for(const fn of events.get(name)??[])fn();await flush();},
    activeTimers:()=>ticks.size,
  };
}

test('two independent clients refresh percentages, evidence and chat starters after either tester saves',async t=>{
  const h=harness(t),a=h.account('abdulrahman'),b=h.account('reham');
  const first=pairSource(a,()=>a.profile),second=pairSource(b,()=>b.profile);
  let noticesA=0,noticesB=0;
  const stopA=first.source.watch(()=>noticesA++),stopB=second.source.watch(()=>noticesB++);
  const stopExtra=second.source.watch(()=>{});h.cleanup.push(stopA,stopB,stopExtra);
  await flush();assert.equal(h.activeTimers(),2,'One polling loop per source, shared by its subscribers');
  const original=(await first.source.inbox())[0].person.fit;
  assert.deepEqual([original.percentage,original.personality.percentage,original.beena.percentage],[78,69,74]);
  const counts=[noticesA,noticesB],requests=h.calls.length;
  await h.tick();assert.deepEqual([noticesA,noticesB],counts,'Unchanged state does not trigger UI reloads');
  assert.equal(h.calls.length-requests,2,'Each client makes one state request, regardless of subscriber count');

  const changed=structuredClone(a.profile);
  changed.surveyAnswers.children_plan='B';changed.surveyAnswers.partner_children_plan='B';
  changed.priorityCategories=['communication'];changed.personalityAnswers.directness='A';
  changed.beena.answers.family_boundaries={self:'D',partner:['D'],importance:2};
  await first.save(changed);await h.tick();
  const fitA=(await first.source.inbox())[0].person.fit,fitB=(await second.source.inbox())[0].person.fit;
  assert.notEqual(fitA.percentage,original.percentage);
  assert.notEqual(fitA.personality.percentage,original.personality.percentage);
  assert.notEqual(fitA.beena.percentage,original.beena.percentage);
  assert.deepEqual([fitA.percentage,fitA.personality.percentage,fitA.beena.percentage],
    [fitB.percentage,fitB.personality.percentage,fitB.beena.percentage]);
  for(const fit of [fitA,fitB]){
    assert.equal(fit.preferenceEvidence.topics.find(topic=>topic.id==='children_plan').status,'different');
    const prompts=conversationInsights(fit).prompts;
    assert(prompts.some(prompt=>prompt.id==='discussion:children_plan'));
    assert(!prompts.some(prompt=>prompt.id==='aligned:children_plan'));
  }
  assert(noticesA>counts[0]&&noticesB>counts[1]);
  assert.equal((await second.source.inbox())[0].person.surveyAnswers,undefined,'No private peer answers reach cards');

  const reply=structuredClone(b.profile);
  reply.surveyAnswers.children_plan='B';reply.surveyAnswers.partner_children_plan='B';
  await second.save(reply);await h.tick();
  for(const client of [first,second]){
    const fit=(await client.source.inbox())[0].person.fit;
    assert.equal(fit.preferenceEvidence.topics.find(topic=>topic.id==='children_plan').status,'aligned');
    assert(conversationInsights(fit).prompts.some(prompt=>prompt.id==='aligned:children_plan'));
  }
});

test('own edits on another device refresh discovery but preserve open drafts and their write revision',async t=>{
  const h=harness(t),account=h.account('abdulrahman'),offers=[];
  let editing=true,viewer={...account.profile,gender:'woman'};
  const pair=pairSource(account,()=>viewer,(profile,revision)=>{
    offers.push({profile,revision});if(editing)return false;viewer={...profile,gender:viewer.gender};return true;
  });
  h.cleanup.push(pair.source.watch(()=>{}));await flush();
  h.profiles.abdulrahman.surveyAnswers.children_plan='B';h.revisions.abdulrahman='other-device';
  await h.tick();
  assert.equal(viewer.surveyAnswers.children_plan,'A','An open editor is not silently overwritten');
  const [fictional]=await pair.source.discover({});
  assert.equal(fictional.viewer.surveyAnswers.children_plan,'B','Discovery uses the current saved assessment');
  assert.equal(fictional.viewer.gender,'woman','Admin browsing gender is retained');
  await assert.rejects(pair.save(viewer),error=>error.status===409);
  assert.equal(h.calls.at(-1).payload.expectedRevision,account.profileRevision,'A stale draft cannot overwrite newer answers');
  editing=false;await h.event('focus');
  assert.equal(viewer.surveyAnswers.children_plan,'B','The same revision is reoffered after leaving the editor');
  assert.equal(offers.at(-1).revision,'other-device');
  await pair.save({...viewer,bio:'A new edit'});
  assert.equal(h.calls.at(-1).payload.expectedRevision,'other-device');
});

test('late reads and a late heartbeat cannot overwrite a completed assessment save',async t=>{
  const h=harness(t),account=h.account('reham'),pair=pairSource(account,()=>account.profile);
  const originalFetch=globalThis.fetch;
  let releaseRead,releaseHeartbeat;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    const request=JSON.parse(options.body);
    if(request.action==='state'&&!releaseRead){
      const old=h.snapshot('reham');return new Promise(resolve=>{releaseRead=()=>resolve(response(old));});
    }
    if(request.action==='heartbeat'){
      const old=h.snapshot('reham');return new Promise(resolve=>{releaseHeartbeat=()=>resolve(response(old));});
    }
    return originalFetch(url,options);
  });
  const pendingRead=pair.source.inbox(),heartbeat=pair.source.heartbeat();
  const changed=structuredClone(account.profile);changed.surveyAnswers.children_plan='B';changed.surveyAnswers.partner_children_plan='B';
  await pair.save(changed);
  const current=h.snapshot('reham').pairFit;
  releaseRead();assert.deepEqual((await pendingRead)[0].person.fit,current);
  releaseHeartbeat();await heartbeat;
  assert.deepEqual((await pair.source.inbox())[0].person.fit,current);
});
