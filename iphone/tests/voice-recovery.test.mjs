import test from 'node:test';
import assert from 'node:assert/strict';
import {retryVoice,fatalVoiceError} from '../src/voice/recovery.ts';
test('transient voice requests retry with bounded backoff',async()=>{let calls=0,retries=0;const waits=[];const result=await retryVoice(async()=>{if(++calls<3)throw new TypeError('Failed to fetch');return 'ok';},()=>true,()=>retries++,async ms=>{waits.push(ms);});assert.equal(result,'ok');assert.equal(calls,3);assert.equal(retries,2);assert.deepEqual(waits,[700,2000]);});
test('authorization and microphone rejection never retry',async()=>{for(const error of [Object.assign(new Error('Forbidden'),{status:403}),new DOMException('Denied','NotAllowedError')]){let calls=0;await assert.rejects(retryVoice(async()=>{calls++;throw error},()=>true,()=>assert.fail('must not retry')));assert.equal(calls,1);assert.equal(fatalVoiceError(error),true);}});
test('hangup during backoff never retries or resurrects a call',async()=>{let active=true,calls=0;await assert.rejects(retryVoice(async()=>{calls++;throw Error('offline')},()=>active,()=>{},async()=>{active=false}),{name:'AbortError'});assert.equal(calls,1);});
test('persistent transient failure is bounded to three attempts',async()=>{let calls=0;await assert.rejects(retryVoice(async()=>{calls++;throw Error('offline')},()=>true,()=>{},async()=>{}));assert.equal(calls,3);});
