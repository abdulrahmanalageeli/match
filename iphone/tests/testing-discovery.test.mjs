import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
const fixtures=Array.from({length:15},(_,i)=>({id:'sample-'+i,online:true}));
const code=ts.transpileModule(readFileSync(new URL('../src/community/testingDiscovery.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};
new Function('require','exports',code)(()=>({demoCommunity:()=>({discover:async()=>fixtures})}),exports);
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
