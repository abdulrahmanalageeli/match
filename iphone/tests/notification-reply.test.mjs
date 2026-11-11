import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

test('unlock during an in-flight check replays reply without waiting for registration',async()=>{
  const listeners={},sent=[],acked=[];let release,first=true,pending=true,cleanup;
  const event={requestId:'00000000-0000-4000-8000-000000000001',kind:'message',action:'reply',actionId:'reply-1',text:'مرحبا'};
  const native={
    addListener:async(name,fn)=>{listeners[name]=fn;return {remove(){}};},
    consumeOpen:async()=>{if(first){first=false;return new Promise(resolve=>{release=()=>resolve({notification:null});});}return {notification:pending?event:null};},
    acknowledgeOpen:async({actionId})=>{acked.push(actionId);pending=false;},
  };
  const modules={
    '@capacitor/core':{Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'ios'},registerPlugin:()=>native},
    react:{useRef:value=>({current:value}),useEffect:fn=>{cleanup=fn();}},
    '../cloud':{},'../testing/pair':{testRequest:()=>new Promise(()=>{})},'./webPush':{},
  };
  const source=readFileSync(new URL('../src/notifications/push.ts',import.meta.url),'utf8').replaceAll('import.meta.env.VITE_MARRIAGE_PUSH_ENABLED',"'true'");
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};const events={addEventListener(){},removeEventListener(){}};
  new Function('require','exports','document','window',code)(name=>modules[name],exports,{...events,hidden:false},events);
  exports.usePushNotifications('tester:session',async(id,kind,payload)=>{sent.push(payload.text);});
  await new Promise(resolve=>setImmediate(resolve));
  listeners.opened();release();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(sent,['مرحبا']);assert.deepEqual(acked,['reply-1']);cleanup();
});
