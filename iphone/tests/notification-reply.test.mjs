import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

test('unlock during an in-flight check replays reply without waiting for registration',async()=>{
  const listeners={},sent=[],acked=[];let release,first=true,pending=true,cleanup;
  const event={scope:'test-installation-scope',requestId:'00000000-0000-4000-8000-000000000001',kind:'message',scope:'tester-scope',action:'reply',actionId:'reply-1',text:'مرحبا'};
  const firstCheck=Promise.withResolvers();
  const native={
    status:async()=>({permission:'granted',installationId:'installation'}),
    setOwner:async({scope})=>{assert.equal(scope,event.scope);},
    status:async()=>({installationId:'test-installation'}),setOwner:async()=>{},
    addListener:async(name,fn)=>{listeners[name]=fn;return {remove(){}};},
    consumeOpen:async()=>{if(first){first=false;firstCheck.resolve();return new Promise(resolve=>{release=()=>resolve({notification:null});});}return {notification:pending?event:null};},
    acknowledgeOpen:async({actionId})=>{acked.push(actionId);pending=false;},
  };
  const modules={
    '@capacitor/core':{Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'ios'},registerPlugin:()=>native},
    react:{useRef:value=>({current:value}),useEffect:fn=>{cleanup=fn();}},
    './scope':{notificationScope:async()=>event.scope},'./scope':{notificationScope:async()=>'tester-scope'},'../cloud':{},'../testing/pair':{testRequest:()=>new Promise(()=>{})},'./webPush':{},
  };
  const source=readFileSync(new URL('../src/notifications/push.ts',import.meta.url),'utf8').replaceAll('import.meta.env.VITE_MARRIAGE_PUSH_ENABLED',"'true'");
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};const events={addEventListener(){},removeEventListener(){}};
  new Function('require','exports','document','window',code)(name=>modules[name],exports,{...events,hidden:false},events);
  exports.usePushNotifications('tester:session',async(id,kind,payload)=>{sent.push(payload.text);});
  await firstCheck.promise;
  listeners.opened();release();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(sent,['مرحبا']);assert.deepEqual(acked,['reply-1']);cleanup();
});

test('a reply from another member is discarded and logout clears the installation before network cleanup',async()=>{
 const events=[],listeners={};let disposed,pending=true;
 const incoming={requestId:'ff000000-0000-4000-8000-000000000001',kind:'message',scope:'old-tag',actionId:'old-action',action:'reply',text:'private'};
 const native={
  status:async()=>({installationId:'device'}),setOwner:async({scope})=>events.push(['owner',scope]),
  consumeOpen:async()=>({notification:pending?incoming:null}),
  acknowledgeOpen:async({actionId})=>{pending=false;events.push(['discard',actionId]);},
  addListener:async(name,fn)=>{listeners[name]=fn;return {remove(){}};},
 };
 const modules={
  '@capacitor/core':{Capacitor:{isNativePlatform:()=>true,getPlatform:()=>'ios'},registerPlugin:()=>native},
  react:{useRef:value=>({current:value}),useEffect:fn=>{disposed=fn();}},
  './scope':{notificationScope:async()=> 'current-tag'},
  '../cloud':{cloudSessionId:async()=> 'current',callRpc:async name=>{events.push(['rpc',name]);if(name.endsWith('unregister'))throw Error('offline');return {enabled:false};}},
  '../testing/pair':{},'./webPush':{},
 };
 const source=readFileSync(new URL('../src/notifications/push.ts',import.meta.url),'utf8').replaceAll('import.meta.env.VITE_MARRIAGE_PUSH_ENABLED',"'true'");
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const api={},dom={addEventListener(){},removeEventListener(){},hidden:false};
 new Function('require','exports','document','window',code)(name=>modules[name],api,dom,dom);
 api.usePushNotifications('current',async()=>events.push(['sent']));
 await new Promise(resolve=>setImmediate(resolve));
 assert(events.some(e=>e[0]==='discard'));assert(!events.some(e=>e[0]==='sent'));
 await api.detachNotifications('current');
 assert.deepEqual(events.slice(-2),[['owner',null],['rpc','marriage_push_unregister']]);
 disposed();
});
