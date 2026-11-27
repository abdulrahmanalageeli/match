import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {demoLunaScore} from '../src/community/demoLunaSearch.ts';
import {selectRecommendations} from '../src/community/recommendations.ts';
import {lunaResultCard} from '../src/community/lunaResultCard.mjs';
const fixtures=Array.from({length:15},(_,i)=>({id:'sample-'+i,online:true}));
const code=ts.transpileModule(readFileSync(new URL('../src/community/testingDiscovery.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const localRows=[];
const local={discover:async()=>fixtures,inbox:async()=>localRows,ownsConnection:id=>localRows.some(row=>row.id===id),request:async id=>{localRows.push({id:'local-request',person:{id,isDemo:true},status:'pending'});return 'local-request';},setInterest:async()=>{},act:async()=>{localRows[0].status='accepted';},unreadCount:async()=>1};
function loadTestingModule(samples){
  samples={inbox:async()=>[],exclusiveConnection:()=>null,...samples};
  const module={};
  new Function('require','exports',code)(name=>name==='./demoLunaSearch'?{demoLunaScore}:name==='./recommendations'?{selectRecommendations}:name==='./lunaResultCard.mjs'?{lunaResultCard}:{demoCommunity:()=>samples,demoPeople:fixtures},module);
  return {withTestingDiscovery:(real,...args)=>module.withTestingDiscovery({inbox:async()=>[],...real},...args)};
}
const exports=loadTestingModule(local);

test('verified tester recommendations top up once across both sources and recheck subject lookups',async()=>{
  const close=id=>({id,recommendationKind:'close'});
  const live=[{id:'live-strict'},close('live-near')];
  const samples=[{id:'demo-strict'},close('demo-near')];
  const source=loadTestingModule({discover:async()=>samples}).withTestingDiscovery({discover:async()=>live},()=>({}));
  const discover=filters=>source.discover({mode:'recommended',...filters});
  assert.deepEqual((await discover({})).map(p=>p.id),['live-strict','demo-strict','live-near']);
  assert.deepEqual(await discover({subjectId:'demo-near'}),[]);
  assert.deepEqual((await discover({afterId:'demo-strict'})).map(p=>p.id),['live-near']);
  samples.push({id:'third-strict'});
  assert.deepEqual((await discover({})).map(p=>p.id),['live-strict','demo-strict','third-strict']);
  assert.deepEqual(await discover({subjectId:'live-near'}),[]);
});

test('Luna searches eligible tester cards before pagination and refreshes with the same plan',async()=>{
  const cards=Array.from({length:29},(_,index)=>({id:'demo-'+index,alias:index>=25?'نورة':'سارة',age:27,eligible:index!==27}));
  const options={mode:'all',offset:0,lunaFields:{},luna:[{field:'alias',kind:'must',terms:['نورة']}]};
  const members=[{id:'live-member'}];
  let reservations=0;
  const real={
    lunaSearch:async()=>{reservations++;return {options,people:members};},
    discover:async received=>{assert.deepEqual(received.luna,options.luna);return members;},
  };
  const samples={discover:async f=>{
    assert.equal(f.eligibleOnly,true);
    return cards.filter(row=>row.eligible).slice(f.offset,f.offset+24);
  }};
  const source=loadTestingModule(samples).withTestingDiscovery(real,()=>({}),'verified-owner');
  const result=await source.lunaSearch('نورة',{mode:'all'});
  assert.deepEqual(result.people.map(p=>p.id),['live-member','demo-25','demo-26','demo-28']);
  assert.equal(result.people[1].isDemo,true);
  assert.deepEqual(result.people[1].matchReasons,['الاسم في الملف: نورة']);
  cards[26].eligible=false;
  assert.deepEqual((await source.discover(result.options)).map(p=>p.id),['live-member','demo-25','demo-28']);
  assert.equal(reservations,1);
  assert.deepEqual((await source.discover({...options,mode:'recommended'})).map(p=>p.id),['live-member']);
});

test('a denied Luna search never falls back to sample cards',async()=>{
  const {withTestingDiscovery}=loadTestingModule({discover:()=>assert.fail('unauthorized sample search')});
  const source=withTestingDiscovery({lunaSearch:async()=>{throw Error('forbidden');}},()=>({}),'verified-owner');
  await assert.rejects(source.lunaSearch('نورة',{}),/forbidden/);
});
test('directory fills empty slots with labeled fixtures without skipping real pages',async()=>{
  const members=Array.from({length:30},(_,i)=>({id:'member-'+i})),requests=[];
  const real={discover:async f=>members.slice(f.offset,f.offset+24),request:async id=>{requests.push(id);return 'request';}};
  const source=exports.withTestingDiscovery(real,()=>({}));
  const first=await source.discover({mode:'all',offset:0});
  const second=await source.discover({mode:'all',offset:24});
  assert.equal(first.length,24);assert.equal(second.length,21);
  assert.equal(new Set([...first,...second].map(p=>p.id)).size,45);
  assert.equal(second[6].isDemo,true);assert.equal(second[6].online,false);
  await assert.rejects(source.request('sample-0'),/توضيحي/);
  await source.request('member-0');assert.deepEqual(requests,['member-0']);
});
test('sequential scrolling reads each full live page once and paginates the sample tail correctly',async()=>{
  let members=Array.from({length:96},(_,i)=>({id:'live-'+i}));
  const samples=Array.from({length:65},(_,i)=>({id:'fixture-'+i}));
  const offsets=[];
  const source=loadTestingModule({discover:async({offset})=>samples.slice(offset,offset+24)})
    .withTestingDiscovery({discover:async({offset})=>{offsets.push(offset);return members.slice(offset,offset+24);}},()=>({}));
  const read=async()=>{const rows=[];for(const offset of [0,24,48,72])rows.push(...await source.discover({mode:'all',offset}));return rows.map(row=>row.id);};
  assert.deepEqual(await read(),members.map(row=>row.id));
  assert.deepEqual(offsets,[0,24,48,72]);
  for (const count of [0,24,30,48]) {
    members=Array.from({length:count},(_,i)=>({id:'live-'+i}));
    assert.deepEqual(await read(),[...members,...samples].slice(0,96).map(row=>row.id));
  }
});

test('a live visibility failure cannot silently expose a replacement directory',async()=>{
  const source=exports.withTestingDiscovery({discover:async()=>{throw Error('not authorized');}},()=>({}));
  await assert.rejects(source.discover({mode:'all'}),/not authorized/);
});

test('a four-page refresh reads each live page once and rechecks access on the next refresh', async () => {
  let members = Array.from({ length: 96 }, (_, i) => ({ id: 'member-' + i }));
  const offsets = [];
  const filters = { mode: 'all', eligibleOnly: true, city: 'الرياض' };
  const real = { discover: async options => {
    const { offset, afterId, ...received } = options;
    assert.deepEqual(received, filters);
    offsets.push(offset);
    return members.slice(offset, offset + 24);
  } };
  const samples = { discover: async options => fixtures.slice(options.offset, options.offset + 24) };
  const source = loadTestingModule(samples).withTestingDiscovery(real, () => ({}));
  const pages = await source.discoverPages(filters, 4);
  assert.deepEqual(offsets, [0, 24, 48, 72]);
  assert.deepEqual(pages.map(page => page.length), [24, 24, 24, 24]);
  assert.deepEqual(pages.flat(), members);

  members = members.slice(1, 47);
  offsets.length = 0;
  const updated = await source.discoverPages(filters, 4);
  assert.deepEqual(offsets, [0, 24]);
  assert.deepEqual(updated.map(page => page.length), [24, 24, 13, 0]);
  assert.deepEqual(updated.flat().map(row => row.id), [...members, ...fixtures].map(row => row.id));
  assert.equal(updated[1][22].isDemo, true);
});

test('a denied later page rejects the entire refresh before reading any samples', async () => {
  const first = Array.from({ length: 24 }, (_, i) => ({ id: String(i) }));
  const real = { discover: async ({ offset }) => {
    if (offset) throw Error('access revoked');
    return first;
  } };
  const source = loadTestingModule({ discover: () => assert.fail('read samples after denial') })
    .withTestingDiscovery(real, () => ({}));
  await assert.rejects(source.discoverPages({ mode: 'all' }, 4), /access revoked/);
});

test('owner demo actions and connections stay local while real actions use the server',async()=>{
 const remoteCalls=[];
 const real={discover:async()=>[],inbox:async()=>[{id:'real-request',person:{id:'real-member'}}],request:async id=>{remoteCalls.push(id);return 'real-request';},act:async id=>{remoteCalls.push(id);},unreadCount:async()=>2};
 const source=exports.withTestingDiscovery(real,()=>({}), 'verified-owner');
 await source.discover({mode:'all'});
 assert.equal(await source.request('sample-0'),'local-request');
 await source.setInterest('sample-0',true);
 await source.act('local-request','accept');
 assert.equal(localRows[0].status,'accepted');
 assert.deepEqual(remoteCalls,[]);
 assert.equal((await source.inbox()).length,2);
 assert.equal(await source.unreadCount(),3);
 assert.equal(source.demoInteractions.request,local.request);
 await source.request('real-member');
 await source.act('real-request','cancel');
 assert.deepEqual(remoteCalls,['real-member','real-request']);
});

test('mutual exclusivity suppresses every directory and retires competing fixture chats permanently', async () => {
  const exclusive={id:'match',status:'accepted',person:{exclusive:true}};
  const localRows=[{id:'sample-request',status:'pending',person:{id:'sample-0'}}];
  const liveRows=[exclusive];
  let retirements=0;
  const local={
    inbox:async()=>localRows, discover:()=>assert.fail('exclusive member saw sample directory'),
    retireOtherConnections(){if(localRows.length)retirements++;localRows.length=0;},
  };
  const source=loadTestingModule(local).withTestingDiscovery({
    inbox:async()=>liveRows,
    discover:()=>assert.fail('exclusive member browsed profiles'),
    lunaSearch:()=>assert.fail('exclusive search consumed quota'),
    request:()=>assert.fail('exclusive member sent request'),
  },()=>({}),'owner');
  assert.deepEqual(await source.inbox(),[exclusive]);
  for(const mode of ['all','recommended'])assert.deepEqual(await source.discover({mode}),[]);
  assert.deepEqual(await source.discoverPages({mode:'all'},2),[[],[]]);
  await assert.rejects(source.lunaSearch('في الرياض',{}),/حصري/);
  await assert.rejects(source.request('sample-0'),/حصري/);
  await assert.rejects(source.setInterest('member',true),/حصري/);
  assert.equal(retirements,1);
  exclusive.person.exclusive=false;
  assert.deepEqual(await source.inbox(),[exclusive]);
});
