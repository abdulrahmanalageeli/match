import test from 'node:test';
import assert from 'node:assert/strict';
import {readAlertProgress} from '../src/notifications/alertProgress.ts';

const row=(id,isDemo=false)=>({id,person:{isDemo}});
const step={stage:0,mine:false,peer:false};
const failure=status=>Object.assign(new Error('unavailable'),{status});

test('one live batch covers all member connections and simulated alerts stay local',async()=>{
  const batches=[],local=[];
  const source={
    async alertProgress(ids){batches.push(ids);return {a:step,b:step};},
    progress(){assert.fail('unexpected single-member request');},
    demoInteractions:{async progress(id){local.push(id);return step;}},
  };
  const previous=new Map([['closed',step],['revoked',step]]);
  const result=await readAlertProgress(source,[row('a'),row('b'),row('revoked'),row('demo',true)],previous);
  assert.deepEqual(batches,[['a','b','revoked']]);
  assert.deepEqual(local,['demo']);
  assert.deepEqual(new Map([['a',step],['b',step],['demo',step]]),result);
  await readAlertProgress(source,[],result);
  assert.equal(batches.length,1);
});

test('older servers and standalone testers retain individual reads, with no retry on denial',async()=>{
  const calls=[];
  const source={async progress(id){calls.push(id);return step;}};
  const rows=[row('a'),row('local',true)];
  for(const adapter of [source,{...source,async alertProgress(){throw failure(404);}}]){
    assert.equal((await readAlertProgress(adapter,rows,new Map())).size,2);
  }
  assert.deepEqual(calls,['a','local','a','local']);
  const previous=new Map([['a',step]]);
  for(const status of [403,503]){
    const adapter={...source,async alertProgress(){throw failure(status);}};
    const result=await readAlertProgress(adapter,[row('a')],previous);
    assert.equal(result.has('a'),status===503);
  }
  assert.equal(calls.length,4);
});

test('large inputs stay within the RPC limit and preserve every connection',async()=>{
  const calls=[];
  const rows=Array.from({length:50},(_,n)=>row(String(n)));
  const source={async alertProgress(ids){
    calls.push(ids.length);
    return Object.fromEntries(ids.map(id=>[id,step]));
  }};
  assert.equal((await readAlertProgress(source,rows)).size,50);
  assert.deepEqual(calls,[24,24,2]);
});
