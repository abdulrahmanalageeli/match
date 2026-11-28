import memberAr from '../src/member-ar.json' with { type: 'json' };
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { describeFit } from '../src/compatibility/model.ts';
import { compatibilitySnapshot, compareCompatibility } from '../src/compatibility/changes.ts';
import { pairAssessmentFixture } from '../src/testing/pairAssessmentFixture.ts';
import * as memberNotices from '../src/notifications/memberNoticeObservation.ts';

const code = ts.transpileModule(await readFile(new URL('../src/notifications/ActivityAlerts.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const base = { city: 'الرياض', age: 29, preferredMinAge: 22, preferredMaxAge: 40 };
const first = { ...base, id: 'abdulrahman', gender: 'man', ...pairAssessmentFixture.abdulrahman };
const second = { ...base, id: 'reham', gender: 'woman', ...pairAssessmentFixture.reham };
const fit = updates => describeFit(first, { ...second, surveyAnswers: { ...second.surveyAnswers, ...updates } }).fit;
const original = fit(), changed = fit({ children_plan: 'B', partner_children_plan: 'B' });
const changedAgain = fit({ children_plan: 'B', partner_children_plan: 'B', wife_work: 'B', partner_wife_work: 'B' });
const connection = current => ({ id: 'pair', status: 'accepted', person: { id: 'reham', alias: 'رهام', fit: current }, unreadCount: 0 });
function sourceWith(current = original) {
  const watchers = new Set();
  return { connections: [connection(current)], inbox: async function () { return structuredClone(this.connections); },
    watch: fn => { watchers.add(fn); return () => watchers.delete(fn); }, notify: () => { for (const fn of watchers) fn(); } };
}

// Run the notification data hook without mounting any presentation.
function mount(source) {
  const hooks=[], effects=[];
  let cursor=0, timer=0;
  const react={
    useMemo(fn,deps) {
      const i=cursor++, old=hooks[i];
      if(!old || deps.some((v,j)=>v!==old.deps[j]))hooks[i]={deps,value:fn()};
      return hooks[i].value;
    },
    useRef(value) {const i=cursor++;return hooks[i]??={current:value};},
    useSyncExternalStore(_subscribe,getSnapshot) {return getSnapshot();},
    useEffect(fn,deps) {
      const i=cursor++, old=hooks[i];
      if(!old || deps.some((value,j)=>value!==old.deps[j])) {
        old?.cleanup?.();
        const item=hooks[i]={deps};
        effects.push(()=>{item.cleanup=fn();});
      }
    },
    useState(initial) {
      const i=cursor++;
      if(!(i in hooks))hooks[i]=initial;
      return [hooks[i],next=>{hooks[i]=typeof next==='function'?next(hooks[i]):next;}];
    },
  };
  react.useLayoutEffect=react.useEffect;
  const exports={};
  const require=name=>{
    if(name==='react')return react;
    if(name==='./memberNoticeObservation')return memberNotices;
    if(name==='../community/chatOutbox')return {denied:error=>error?.status===401||error?.status===403};
    if(name==='../member-copy.ts')return {default:memberAr};
    if(name==='../compatibility/changes')return {compatibilitySnapshot,compareCompatibility};
    return {};
  };
  vm.runInNewContext(code,{exports,require,document:{hidden:false,addEventListener(){},removeEventListener(){}},
    window:{setTimeout:()=>++timer,clearTimeout(){},setInterval:()=>++timer,clearInterval(){}}});
  return {
    render(next=source){cursor=0;const result=exports.useMemberActivity(next);effects.splice(0).forEach(effect=>effect());return result;},
    close(){hooks.forEach(hook=>hook?.cleanup?.());},
  };
}

test('new compatibility changes appear in the feed and stay read after a refresh',async()=>{
  const source=sourceWith(),view=mount(source);view.render();await settle();
  assert.equal(view.render().changes.length,0);
  source.connections=[connection(changed)];source.notify();await settle();
  const [entry]=view.render().changes;
  assert.equal(entry.name,'رهام');
  assert.equal(entry.change.scoreChanges[0].before,original.percentage);
  assert.equal(entry.change.scoreChanges[0].after,changed.percentage);
  assert.equal(entry.unread,true);
  view.render().read(entry.id,entry.change.key);
  source.notify();await settle();
  assert.equal(view.render().changes[0].unread,false);
  assert.equal(view.render().changes[0].at,entry.at);
  view.close();
});

test('overlapping refreshes coalesce; a rollback and closed relationship remove the feed row',async()=>{
  const source=sourceWith(),view=mount(source);view.render();await settle();
  const pending=deferred();let calls=0;
  source.connections=[connection(changedAgain)];
  source.inbox=async()=>++calls===1?pending.promise:source.connections;
  source.notify();source.notify();pending.resolve([connection(changed)]);await settle();
  assert.equal(calls,2);
  assert.equal(view.render().changes[0].fit.percentage,changedAgain.percentage);
  source.connections=[connection(original)];source.notify();await settle();
  assert.equal(view.render().changes.length,0);
  source.connections=[connection(changed)];source.notify();await settle();
  assert.equal(view.render().changes.length,1);
  source.connections=[];source.notify();await settle();
  assert.equal(view.render().changes.length,0);
  view.close();
});
