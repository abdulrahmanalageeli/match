import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

test('foreground iOS push presents only scoped metadata for the visible account without running tap actions', async () => {
  const listeners={}, received=[], opened=[];
  let cleanup;
  const native={status:async()=>({installationId:'installation'}),setOwner:async()=>{},consumeOpen:async()=>({notification:null}),
    addListener:async(name,fn)=>{listeners[name]=fn;return {remove(){}};}};
  const modules={'@capacitor/core':{Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'ios'},registerPlugin:()=>native},
    react:{useRef:current=>({current}),useEffect:fn=>{cleanup=fn();}},'./scope':{notificationScope:async()=>'tester-scope'},
    '../../admin/server/updateEvents':{isUpdateEvent:value=>value==='agreement:proposed'},'../cloud':{},
    '../testing/pair':{testRequest:()=>new Promise(()=>{})},'./webPush':{}};
  const source=readFileSync(new URL('../src/notifications/push.ts',import.meta.url),'utf8').replaceAll('import.meta.env.VITE_MARRIAGE_PUSH_ENABLED',"'true'");
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const api={},dom={addEventListener(){},removeEventListener(){},hidden:false};
  new Function('require','exports','document','window',code)(name=>modules[name],api,dom,dom);
  api.usePushNotifications('tester:fixture',(...args)=>opened.push(args),undefined,event=>received.push(event));
  await new Promise(resolve=>setImmediate(resolve));
  const event = {scope:'tester-scope',kind:'analysis',requestId:'00000000-0000-4000-8000-000000000001',
    deliveryId:'a0000000-0000-4000-8000-000000000001',analysisPhase:'shared'};
  listeners.received({...event,body:'private',text:'private'});
  listeners.received({...event,scope:'wrong-scope'});
  listeners.received({...event,action:'reply'});
  listeners.received({...event,requestId:'e0000000-0000-4000-8000-000000000001'});
  listeners.received({...event,kind:'update',event:'unknown:event'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(received,[{...event,requestId:'tester-pair'}]); assert.deepEqual(opened,[]);
  dom.hidden = true; listeners.received(event);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(received.length,1);
  cleanup();
});

test('a scoped tester closure tap opens its immutable archive ID on iOS',async()=>{
  const id='c0000000-0000-4000-8000-000000000052', opened=[], acks=[];
  const event={kind:'update',event:'introduction:closed',requestId:id,scope:'tester-scope',actionId:'open-closure'};
  let cleanup,pending=true;
  const native={status:async()=>({installationId:'test-installation'}),setOwner:async()=>{},
    addListener:async()=>({remove(){}}),consumeOpen:async()=>({notification:pending?event:null}),
    acknowledgeOpen:async({actionId})=>{pending=false;acks.push(actionId);}};
  const modules={'@capacitor/core':{Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'ios'},registerPlugin:()=>native},
    react:{useRef:value=>({current:value}),useEffect:fn=>{cleanup=fn();}},'./scope':{notificationScope:async()=>'tester-scope'},
    '../../admin/server/updateEvents':{isUpdateEvent:value=>value==='introduction:closed'},'../cloud':{},
    '../testing/pair':{testRequest:()=>new Promise(()=>{})},'./webPush':{}};
  const source=readFileSync(new URL('../src/notifications/push.ts',import.meta.url),'utf8').replaceAll('import.meta.env.VITE_MARRIAGE_PUSH_ENABLED',"'true'");
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const api={},dom={addEventListener(){},removeEventListener(){},hidden:false};
  new Function('require','exports','document','window',code)(name=>modules[name],api,dom,dom);
  api.usePushNotifications('tester:fixture',async target=>opened.push(target));
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(opened,[id]);assert.deepEqual(acks,['open-closure']);
  cleanup();
});

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

test('an opted-in iPhone recovers from a failed device registration without another tap', async () => {
  const timers = new Map(), calls = [], listeners = {};
  let timerId = 0, cleanup, registrationAttempt = 0;
  const dom = {hidden:false, addEventListener(){}, removeEventListener(){}, dispatchEvent(){}};
  const native = {
    status: async () => ({permission:'granted', installationId:'device', buildNumber:'1'}),
    setOwner: async () => {},
    consumeOpen: async () => ({notification:null}),
    addListener: async (name, fn) => { listeners[name] = fn; return {remove(){}}; },
    register: async () => {
      if (++registrationAttempt === 1) throw Error('temporarily unreachable');
      const device = {token:'opaque-token', installationId:'device', environment:'production'};
      listeners.registration(device);
      return device;
    },
  };
  const modules = {
    '@capacitor/core':{Capacitor:{isNativePlatform:()=>true,getPlatform:()=>'ios'},registerPlugin:()=>native},
    react:{useRef:current=>({current}),useEffect:fn=>{cleanup=fn();}},
    './scope':{notificationScope:async()=> 'tester-scope'},
    '../testing/pair':{testRequest:async name=>{ calls.push(name); return {enabled:true}; }},
    '../cloud':{}, './webPush':{},
  };
  const source=readFileSync(new URL('../src/notifications/push.ts',import.meta.url),'utf8').replaceAll('import.meta.env.VITE_MARRIAGE_PUSH_ENABLED',"'true'");
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const api={};
  new Function('require','exports','document','window','setTimeout','clearTimeout',code)(name=>modules[name],api,dom,dom,
    fn=>{timers.set(++timerId,fn);return timerId;},id=>timers.delete(id));
  api.usePushNotifications('tester:session',async()=>{});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(api.pushDeviceRegistered('tester:session'),false);
  assert.equal(timers.size,1);
  const [retry] = timers.values(); retry();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(api.pushDeviceRegistered('tester:session'),true);
  assert.equal(registrationAttempt,2);
  assert.equal(calls.filter(name=>name==='push_register').length,1);
  cleanup();
});
