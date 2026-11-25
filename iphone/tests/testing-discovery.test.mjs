import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {demoLunaScore} from '../src/community/demoLunaSearch.ts';
const fixtures=Array.from({length:15},(_,i)=>({id:'sample-'+i,online:true}));
const code=ts.transpileModule(readFileSync(new URL('../src/community/testingDiscovery.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const localRows=[];
const local={discover:async()=>fixtures,inbox:async()=>localRows,request:async id=>{localRows.push({id:'local-request',person:{id,isDemo:true},status:'pending'});return 'local-request';},setInterest:async()=>{},act:async()=>{localRows[0].status='accepted';},unreadCount:async()=>1};
function loadTestingModule(samples){
  const module={};
  new Function('require','exports',code)(name=>name==='./demoLunaSearch'?{demoLunaScore}:{demoCommunity:()=>samples,demoPeople:fixtures},module);
  return module;
}
const exports=loadTestingModule(local);

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
 assert.equal(source.demoInteractions,local);
 await source.request('real-member');
 await source.act('real-request','cancel');
 assert.deepEqual(remoteCalls,['real-member','real-request']);
});
