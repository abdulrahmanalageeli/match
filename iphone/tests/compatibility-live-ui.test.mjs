import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { describeFit, dimensions,interests } from '../src/compatibility/model.ts';
import * as profileOptions from '../src/profile/profileOptions.ts';
import {languageOptions,marriageTimelineLabels} from '../src/compatibility/marriage.ts';
import {dressStyles} from '../src/compatibility/appearance.ts';
import { conversationInsights } from '../src/compatibility/conversation-insights.ts';
import { readBrowseMemory, saveBrowseMemory } from '../src/community/discoveryMemory.ts';
import { shuffleWithVisibility } from '../src/community/visibilityOrder.ts';

const communityCode = compile(await readFile(new URL('../src/community/Community.tsx', import.meta.url), 'utf8') + '\nexport { Discovery, Requests, DirectoryRow, PersonCard, FilterSheet };');
const lunaCode = compile(await readFile(new URL('../src/community/LunaSearch.tsx', import.meta.url), 'utf8'));
const insightsCode = compile(await readFile(new URL('../src/community/ChatInsights.tsx', import.meta.url), 'utf8'));
const relationshipCountsCode = compile(await readFile(new URL('../src/community/useRelationshipCounts.ts', import.meta.url), 'utf8'));
function compile(source) { return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText; }
const settle = () => new Promise(resolve => setImmediate(resolve));
const noop = () => {};
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function nodes(node) { return Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : []; }
const named = (tree, name) => nodes(tree).find(node => node.type?.name === name);
const textOf = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(textOf).join('') : textOf(node?.props?.children ?? '');

// Execute the actual components with hook state and effect cleanup, without native animation runtimes.
function mount(code, component, initialProps, membership={premium:true,upgrade:noop}) {
  const hooks = [], effects = [], modules = new Map(); let cursor = 0, changed = false, props = initialProps;
  const memo = (fn, deps) => { const at = cursor++, old = hooks[at]; if (!old || deps.some((value, i) => value !== old.deps[i])) hooks[at] = { deps, value: fn() }; return hooks[at].value; };
  const effect = (fn, deps) => { const at = cursor++, old = hooks[at]; if (!old || deps.some((value, i) => value !== old.deps[i])) { old?.cleanup?.(); const item = hooks[at] = { deps }; effects.push(() => { item.cleanup = fn(); }); } };
  const react = {
    useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps), useEffect: effect, useLayoutEffect: effect,
    useRef: value => { const at = cursor++; return hooks[at] ??= { current: value }; },
    useId: () => { const at = cursor++; return `test-${at}`; },
    useState: value => { const at = cursor++; if (!(at in hooks)) hooks[at] = typeof value === 'function' ? value() : value; return [hooks[at], next => { const result = typeof next === 'function' ? next(hooks[at]) : next; if (result !== hooks[at]) { hooks[at] = result; changed = true; } }]; },
  };
  const timer = () => 0;
  const windowEvents = new Map();
  const browser = { setTimeout: timer, setInterval: timer, scrollTo: noop, scrollY: 0,
    addEventListener: (name, fn) => { if (!windowEvents.has(name)) windowEvents.set(name, new Set()); windowEvents.get(name).add(fn); },
    removeEventListener: (name, fn) => windowEvents.get(name)?.delete(fn) };
  const doc = { hidden: false, addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [] };
  const exports = {};
  const require = name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }), Fragment: 'fragment' };
    if (name === 'react-dom') return { flushSync: fn => fn() };
    if (name === '../membership/access') return {useMembershipAccess:()=>membership,MembershipPrompt:Object.defineProperty(()=>null,'name',{value:'MembershipPrompt'})};
    if (name === '../profile/decisionContext') return {decisionContext: person => ({personalLine:person.bio,context:person.familyPreference})};
    if (name === '../profile/profileOptions') return profileOptions;
    if (name === '../compatibility/model') return {interests};
    if (name === '../compatibility/marriage') return {languageOptions,marriageTimelineLabels};
    if (name === '../compatibility/appearance') return {dressStyles};
    if (name === '../compatibility/conversation-insights') return { conversationInsights };
    if (name === './discoveryMemory') return { readBrowseMemory, saveBrowseMemory };
    if (name === './visibilityOrder') return { shuffleWithVisibility };
    if (name === './useWeeklyCardTransition') return { useWeeklyCardTransition: () => (_origin, apply) => apply() };
    if (name === './chatOutbox') return { discardClosedDrafts: noop, denied: error => [401, 403].includes(error?.status) };
    if (!modules.has(name)) modules.set(name, new Proxy({}, { get: (cache, key) => cache[key] ??= key === 'numericOptions' ? () => [] : key === 'preferencePercentage' ? fit => fit?.preference : Object.defineProperty(() => null, 'name', { value: key }) }));
    return modules.get(name);
  };
  vm.runInNewContext(code, { exports, require, document: doc, window: browser, clearTimeout: noop, clearInterval: noop });
  return {
    render(next) { if (next) props = next; let tree, passes = 0; do { changed = false; cursor = 0; tree = exports[component](props); for (const fn of effects.splice(0)) fn(); if (++passes > 20) throw Error('unstable render'); } while (changed); return tree; },
    close() { for (const hook of hooks) hook?.cleanup?.(); },
    scroll(value) { browser.scrollY = value; for (const fn of windowEvents.get('scroll') ?? []) fn(); },
    leaving() { for (const fn of windowEvents.get('nisfayn:before-navigation') ?? []) fn(); },
  };
}
function sourceWith(people = []) {
  const watchers = new Set();
  return { people, connections: [], watch: fn => { watchers.add(fn); return () => watchers.delete(fn); },
    discover: async function () { return structuredClone(this.people); }, inbox: async function () { return structuredClone(this.connections); },
    notify: () => { for (const fn of watchers) fn(); } };
}
const person = (score, id = 'partner') => ({ id, alias: 'رهام', fit: { preference: score }, age: 29, city: 'الرياض' });
const baseProps = source => ({ source, onInbox: noop, onAccount: noop, onChatChange: noop, onMutual: noop, onConversationOpened: noop, onBrowse: noop });

test('an empty Luna recommendation can search all eligible profiles with the same plan and filters', async () => {
  const filters = {mode:'recommended', minAge:26, excludeCities:['جدة']};
  const options = {...filters, lunaFields:{smoking:'never'}, luna:[{field:'interest',kind:'must',terms:['القراءة']}]};
  const source = sourceWith();
  let plans = 0;
  const calls = [];
  source.lunaSearch = async () => { plans++; return {options, people:[], criteria:[], summary:'القراءة'}; };
  source.discover = async searchOptions => {
    calls.push({...searchOptions});
    if (calls.length === 1) throw Error('تعذّر الاتصال');
    return [{...person(77),isDemo:true}];
  };
  const m = mount(lunaCode,'LunaSearch',{source,filters,open:noop},{tier:'seriousness'});
  const buttons = tree => nodes(tree).filter(node=>node.type==='button');
  const expand = tree => buttons(tree).find(node=>textOf(node)==='ابحث في جميع الملفات المؤهلة');
  buttons(m.render())[0].props.onClick();
  nodes(m.render()).find(node=>node.type==='textarea').props.onChange({target:{value:'أحب القراءة'}});
  nodes(m.render()).find(node=>node.type==='form').props.onSubmit({preventDefault:noop});
  await settle();
  const first = expand(m.render());
  assert.ok(first);
  first.props.onClick();
  first.props.onClick();
  await settle();
  assert.equal(calls.length,1);
  assert.ok(nodes(m.render()).some(node=>node.props?.role==='alert'));
  expand(m.render()).props.onClick();
  await settle();
  const tree = m.render();
  assert.ok(textOf(tree).includes('ضمن جميع الملفات المؤهلة'));
  assert.ok(textOf(tree).includes('تجريبي'));
  assert.equal(expand(tree),undefined);
  source.notify();
  await settle();
  assert.equal(plans,1);
  assert.equal(calls.length,3);
  for(const call of calls) assert.deepEqual(call,{...options,mode:'all',eligibleOnly:true,offset:0});
  m.close();
});

test('minimum compatibility filter is Premium-only and stale free thresholds are cleared on apply',()=>{
 for(const premium of [false,true]){
  let applied,upgrades=0;
  const m=mount(communityCode,'FilterSheet',{filters:{minFit:75,city:'الرياض'},apply:value=>{applied=value;},close:noop},{premium,upgrade:()=>upgrades++});
  const tree=m.render();
  const locked=nodes(tree).find(n=>n.type==='button'&&textOf(n).includes('التصفية بدرجة التوافق'));
  assert.equal(Boolean(locked),!premium);
  if(locked){locked.props.onClick();assert.equal(upgrades,1);}
  nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault:noop});
  assert.equal(applied.minFit,premium?75:undefined);m.close();
 }
});

test('free discovery routes initiation to membership and hides directory scores',async()=>{
 const candidate={...person(78),interests:[],reasons:[]},source=sourceWith([candidate]);let upgrades=0,sent=0,interests=[];
 source.request=async()=>{sent++;return 'request';};
 source.setInterest=async(id,value)=>{interests.push([id,value]);};
 const access={premium:false,upgrade:()=>upgrades++};
 const m=mount(communityCode,'Discovery',baseProps(source),access);
 m.render();await settle();let tree=m.render();
 nodes(tree).find(node=>node.type==='button'&&textOf(node).includes('جميع الملفات')).props.onClick();
 m.render();await settle();tree=m.render();
 await named(tree,'DirectoryRow').props.request();assert.equal(upgrades,1);assert.equal(sent,0);
 named(tree,'DirectoryRow').props.interest();await settle();
 assert.deepEqual(interests,[[candidate.id,true]]);assert.equal(upgrades,1);
 named(m.render(),'DirectoryRow').props.interest();await settle();
 assert.deepEqual(interests,[[candidate.id,true],[candidate.id,false]]);
 const row=mount(communityCode,'DirectoryRow',{person:candidate,source,open:noop,explain:noop,request:noop,interest:noop,busy:false},access);
 tree=row.render();assert.equal(named(tree,'ScoreTile'),undefined);
 nodes(tree).find(node=>node.props?.className==='dr-fit-visual wd-fit-locked').props.onClick();assert.equal(upgrades,2);
 const card=mount(communityCode,'PersonCard',{person:{...candidate,recommendationPercentage:72},source,open:noop},access);
 assert.equal(named(card.render(),'ScoreTile').props.percentage,72);
 m.close();row.close();card.close();
});

test('relationship tab counts only accepted matches and updates after source changes', async () => {
  const source = sourceWith();
  source.connections = [{status:'accepted'}, {status:'pending',direction:'incoming'}, {status:'pending',direction:'outgoing'}];
  const m = mount(relationshipCountsCode, 'useRelationshipCounts', source);
  m.render(); await settle(); let counts = m.render();
  assert.equal(counts.accepted, 1); assert.equal(counts.incoming, 1);
  source.connections[1] = {status:'accepted'}; source.notify(); await settle();
  counts = m.render(); assert.equal(counts.accepted, 2); assert.equal(counts.incoming, 0);
  source.connections.splice(0,1); source.notify(); await settle();
  assert.equal(m.render().accepted, 1);
  const other = sourceWith(); assert.equal(m.render(other).accepted, 0);
  await settle(); assert.equal(m.render().accepted, 0); m.close();
});

test('incoming requests can be accepted from the list once; outgoing requests cannot', async () => {
  const source = sourceWith(), gate = deferred(), calls = [], mutual = [];
  source.connections = [
    { id: 'incoming', status: 'pending', direction: 'incoming', person: person(70) },
    { id: 'outgoing', status: 'pending', direction: 'outgoing', person: person(60, 'other') },
  ];
  source.act = async (id, action) => { calls.push([id, action]); await gate.promise; source.connections = source.connections.map(row => row.id === id ? {...row, status: 'accepted'} : row); };
  const m = mount(communityCode, 'Requests', {...baseProps(source), matches: true, onMutual: row => mutual.push(row.id)});
  m.render(); await settle(); let overview = named(m.render(), 'MatchesOverview');
  overview.props.onAccept('outgoing'); assert.equal(calls.length, 0);
  overview.props.onAccept('incoming'); overview.props.onAccept('incoming');
  assert.deepEqual(calls, [['incoming', 'accept']]);
  assert.equal(named(m.render(), 'MatchesOverview').props.busy, true);
  gate.resolve(); await settle(); await settle();
  overview = named(m.render(), 'MatchesOverview');
  assert.deepEqual(mutual, ['incoming']);
  assert.equal(overview.props.connections.find(row => row.id === 'incoming').status, 'accepted');
  assert.equal(overview.props.busy, false); m.close();
});

test('declining from the request list requires confirmation and removes the closed request', async () => {
  const source = sourceWith(), calls = [];
  source.connections = [{id: 'incoming', status: 'pending', direction: 'incoming', person: person(70)}];
  source.act = async (id, action) => { calls.push([id, action]); source.connections = []; };
  const m = mount(communityCode, 'Requests', {...baseProps(source), matches: true});
  m.render(); await settle(); named(m.render(), 'MatchesOverview').props.onDecline('incoming');
  let sheet = named(m.render(), 'Sheet');
  assert.equal(calls.length, 0); assert.equal(sheet.props.title, 'رفض طلب التعارف؟');
  sheet.props.onClose(); assert.equal(named(m.render(), 'Sheet'), undefined);
  named(m.render(), 'MatchesOverview').props.onDecline('incoming'); sheet = named(m.render(), 'Sheet');
  nodes(sheet).find(node => node.type === 'button' && textOf(node) === 'تأكيد الرفض').props.onClick();
  await settle(); await settle();
  assert.deepEqual(calls, [['incoming', 'decline']]);
  assert.equal(named(m.render(), 'MatchesOverview').props.connections.length, 0); m.close();
});

test('ending an accepted match requires confirmation and submits once', async () => {
  const source = sourceWith(), calls = [], gate = deferred();
  source.connections = [{id:'accepted',status:'accepted',direction:'incoming',person:person(70)}, {id:'pending',status:'pending',direction:'incoming',person:person(60)}];
  source.act = async (id, action, reason, allowRematch) => { calls.push([id,action,allowRematch]); await gate.promise; source.connections=source.connections.filter(row=>row.id!==id); };
  const m=mount(communityCode,'Requests',{...baseProps(source),matches:true});
  m.render(); await settle();
  named(m.render(),'MatchesOverview').props.onRemove('pending');
  assert.equal(named(m.render(),'Sheet'),undefined);
  named(m.render(),'MatchesOverview').props.onRemove('accepted');
  let sheet=named(m.render(),'Sheet'); assert.equal(sheet.props.title,'إنهاء التعارف؟'); assert.equal(calls.length,0);
  nodes(sheet).find(node=>node.type==='button'&&textOf(node)==='الاستمرار في التعارف').props.onClick();
  assert.equal(named(m.render(),'Sheet'),undefined); assert.equal(calls.length,0);
  named(m.render(),'MatchesOverview').props.onRemove('accepted'); sheet=named(m.render(),'Sheet');
  const confirm=nodes(sheet).find(node=>node.type==='button'&&textOf(node)==='تأكيد إنهاء التعارف');
  confirm.props.onClick(); confirm.props.onClick();
  assert.deepEqual(calls,[['accepted','cancel',false]]);
  gate.resolve(); await settle(); await settle();
  assert.equal(named(m.render(),'Sheet'),undefined);
  assert.equal(named(m.render(),'MatchesOverview').props.connections.some(row=>row.id==='accepted'),false); m.close();
});

test('navigation captures discovery position before the parent resets the page scroll', async () => {
  const source = sourceWith([person(90)]);
  const r = mount(communityCode, 'Discovery', baseProps(source));
  r.render(); await settle(); r.render();
  r.scroll(1200); r.leaving(); r.scroll(0);
  assert.equal(readBrowseMemory(source).scroll, 1200);
  r.close();
});

test('an unchanged message does not freeze the active chat fit; queued updates finish with the newest score', async () => {
  const source = sourceWith();
  source.connections = [{ id: 'room', status: 'accepted', person: person(90), lastMessage: 'same message', unread: 0 }];
  const m = mount(communityCode, 'Requests', { ...baseProps(source), openConversation: 'room' });
  m.render(); await settle(); let chat = m.render();
  assert.equal(chat.type.name, 'Chat'); assert.equal(chat.props.connection.person.fit.preference, 90);
  const firstKey = chat.key, read = deferred(); let calls = 0;
  source.inbox = async () => ++calls === 1 ? read.promise : [{ ...source.connections[0], person: person(61) }];
  source.notify(); source.notify(); read.resolve([{ ...source.connections[0], person: person(75) }]);
  await settle(); chat = m.render();
  assert.equal(calls, 2); assert.equal(chat.props.connection.person.fit.preference, 61);
  assert.equal(chat.key, firstKey, 'refresh retains the chat component and its draft state'); m.close();
});

test('a profile opened from expanded Luna results refreshes in the eligible directory', async () => {
  const source=sourceWith(), m=mount(communityCode,'Discovery',baseProps(source));
  m.render(); await settle();
  named(m.render(),'LunaSearch').props.open(person(80),'all');
  assert.equal(m.render().type.name,'MemberProfile');
  const lookups=[];
  source.discover=async filters=>{
    if (!filters.subjectId) return [];
    lookups.push([filters.mode,filters.eligibleOnly,filters.subjectId]);
    return filters.mode==='all'?[person(75)]:[];
  };
  source.notify(); await settle();
  assert.equal(m.render().props.person.fit.preference,75);
  assert.deepEqual(lookups,[['all',true,'partner']]);
  m.close();
});

test('an open recommended profile refreshes after moving out of the top five, then closes if no longer eligible', async () => {
  const source = sourceWith([person(90)]), m = mount(communityCode, 'Discovery', baseProps(source));
  m.render(); await settle(); let tree = m.render();
  named(tree, 'PersonCard').props.open({ closest: () => null, querySelector: () => ({querySelector: () => null}), getBoundingClientRect: () => ({ top: 0 }), matches: () => true });
  tree = m.render(); assert.equal(tree.props.person.fit.preference, 90);
  const lookups = [];
  let eligible = true;
  source.discover = async filters => {
    if (!filters.subjectId) return [person(95, 'new-top-match')];
    lookups.push([filters.mode, filters.subjectId]);
    return eligible ? [person(61)] : [];
  };
  source.notify(); await settle(); tree = m.render();
  assert.equal(tree.type.name, 'MemberProfile'); assert.equal(tree.props.person.fit.preference, 61);
  eligible = false;
  source.notify(); await settle(); tree = m.render();
  assert.notEqual(tree.type?.name, 'MemberProfile');
  assert.deepEqual(lookups, [['recommended', 'partner'], ['recommended', 'partner']]); m.close();
});

test('an open compatibility sheet refreshes in place and changes arriving during a read are not lost', async () => {
  const source = sourceWith([person(90)]), m = mount(communityCode, 'Discovery', baseProps(source));
  m.render(); await settle(); let tree = m.render();
  nodes(tree).find(node => node.type === 'button' && textOf(node).includes('جميع الملفات')).props.onClick();
  m.render(); await settle(); tree = m.render(); named(tree, 'DirectoryRow').props.explain();
  tree = m.render(); assert.equal(named(tree, 'FitDetails').props.fit.preference, 90);
  const read = deferred(); let calls = 0;
  source.discover = async () => ++calls === 1 ? read.promise : [person(56)];
  source.notify(); source.notify(); read.resolve([person(72)]); await settle(); tree = m.render();
  assert.equal(calls, 2); assert.equal(named(tree, 'FitDetails').props.fit.preference, 56);
  assert.equal(named(tree, 'CommunitySkeleton'), undefined, 'background updates never replace content with a skeleton'); m.close();
});

test('an assessment change during the initial discovery load is caught up immediately afterward', async () => {
  const source = sourceWith(), read = deferred(); let calls = 0;
  source.discover = async () => ++calls === 1 ? read.promise : [person(56)];
  const m = mount(communityCode, 'Discovery', baseProps(source));
  m.render(); source.notify(); read.resolve([person(90)]); await settle(); m.render(); await settle();
  assert.equal(named(m.render(), 'PersonCard').props.person.fit.preference, 56);
  assert.equal(calls, 2); m.close();
});

test('the visible conversation topic stays selected as answers reclassify it, with fresh explanations and safe fallbacks', () => {
  const answers = Object.fromEntries(dimensions.flatMap(item => [[item.id, 'A'], [item.partnerId, 'A']]));
  const a = { id: 'a', gender: 'woman', age: 29, city: 'الرياض', preferredMinAge: 18, preferredMaxAge: 70, assessmentVersion: 'marriage-v4', surveyAnswers: answers };
  const b = { ...a, id: 'b', gender: 'man' }; const topic = dimensions[3];
  let chosen; const props = { fit: describeFit(a, b).fit, name: 'رهام', disabled: false, hasDraft: false, choose: value => { chosen = value; } };
  const m = mount(insightsCode, 'ChatInsights', props); let tree = m.render();
  for (let i = 0; i < 3; i++) { nodes(tree).find(node => node.props?.['aria-label'] === 'الاقتراح التالي').props.onClick(); tree = m.render(); }
  assert.equal(named(tree, 'MotionReveal').props['data-kind'], 'aligned');
  assert(textOf(tree).includes(topic.title));
  const changed = { ...b, surveyAnswers: { ...answers, [topic.id]: 'B' } };
  tree = m.render({ ...props, fit: describeFit(a, changed).fit });
  const card = named(tree, 'MotionReveal'); assert.equal(card.props['data-kind'], 'discussion');
  assert.equal(nodes(card).find(node => node.type === 'h4').props.children, topic.title);
  assert(textOf(card).includes('يعتمد على الظروف')); named(tree, 'MotionPressButton').props.onClick(); assert.equal(chosen, topic.discussion);
  tree = m.render({ ...props, fit: undefined, hasDraft: true });
  assert.equal(named(tree, 'MotionReveal').props['data-kind'], 'explore');
  assert.equal(named(tree, 'MotionPressButton').props.disabled, true);
  assert(!textOf(tree).includes('يعتمد على الظروف')); m.close();
});
