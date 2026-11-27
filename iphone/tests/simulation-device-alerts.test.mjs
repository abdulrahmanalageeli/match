import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { deviceActivityNotice, simulationActivityDestination } from '../src/notifications/simulationDeviceAlerts.ts';

const controls = {connections:true, message:true, sound:true, quiet:true, start:22, end:7, zone:'Asia/Riyadh'};
const plan = {id:'da042b07-4f72-48a2-8004-c09af6ce52d9', kind:'interest', personId:'fictional-1', dueAt:Date.UTC(2030,0,1,20)};
const alias = 'نوف';
test('notification previews use the scheduled Riyadh time, category switch and chosen privacy', () => {
  const render=(patch={}, preview='private', event=plan)=>deviceActivityNotice(event,{controls:{...controls,...patch},preview},alias,0);
  assert.deepEqual(render(),{eventId:plan.id,dueAt:plan.dueAt,body:'إشعار جديد',sound:false});
  assert.equal(render({},'event').body,'اهتمام جديد بملفك');
  assert.equal(render({},'name').body,'اهتمام جديد بملفك من نوف');
  assert.equal(render({},'content').body,'اهتمام جديد بملفك من نوف');
  assert.equal(render({connections:false}),null);
  const message={...plan,kind:'reply'},match={...plan,kind:'match'};
  assert.equal(render({connections:false},'name',message).body,'رسالة جديدة من نوف');
  assert.equal(render({message:false},'content',message),null);
  assert.equal(render({message:false},'name',match).body,'تعارف متبادل مع نوف');
  assert.equal(render({quiet:false}).sound,true);
  assert.equal(render({sound:false,quiet:false}).sound,false);
  assert.equal(render({zone:'Not/A_Timezone'}).sound,false);
  assert.equal(render({},'event',{...plan,dueAt:0}),null);
  assert.equal(deviceActivityNotice(plan,null,alias,0),null);
  assert.equal(deviceActivityNotice(plan,{controls,preview:'name'},undefined,0),null);
});

function bridge() {
  const dom=new EventTarget(), listeners={}, notices=[], opens=[], acknowledgments=[];
  let pending, cleanup, changed, planned=plan, enabled=true, permission='granted';
  const native={
    setOwner:async()=>{},status:async()=>({installationId:'phone',permission}),
    setSimulationActivity:async data=>notices.push(data),
    register:async()=>({token:'mock',installationId:'phone',environment:'sandbox'}),
    addListener:async(name,fn)=>{listeners[name]=fn;return {remove(){}};},
    consumeOpen:async()=>({notification:pending}),acknowledgeOpen:async({actionId})=>{acknowledgments.push(actionId);pending=null;}
  };
  const modules={
    '@capacitor/core':{Capacitor:{isNativePlatform:()=>true,getPlatform:()=>'ios'},registerPlugin:()=>native},
    react:{useRef:value=>({current:value}),useEffect:fn=>{cleanup=fn();}},
    './scope':{notificationScope:async()=> 'phone-scope'},'../cloud':{},'./webPush':{},
    '../community/data':{demoPeople:[{id:plan.personId,alias}]},
    './simulationDeviceAlerts':{deviceActivityNotice},
    '../testing/pair':{testRequest:async(action)=>({push_settings:{enabled},push_controls:controls,push_privacy:{preview:'private'}}[action]??{})}
  };
  const src=readFileSync(new URL('../src/notifications/push.ts',import.meta.url),'utf8').replaceAll('import.meta.env.VITE_MARRIAGE_PUSH_ENABLED',"'true'");
  const code=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const api={};
  new Function('require','exports','document','window',code)(name=>modules[name],api,dom,dom);
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  const source={simulation:{nextActivity:()=>planned},watch(fn){changed=fn;return ()=>{changed=null;};}};
  return {dom,source,notices,opens,acknowledgments,subscribe(value){api.usePushNotifications('tester:fake',(...args)=>opens.push(args),value);},
    change(value){planned=value;changed?.();},setting(value){enabled=value;dom.dispatchEvent(new Event('wudayn:push-controls'));},
    permission(value){permission=value;dom.dispatchEvent(new Event('visibilitychange'));},
    tap(scope){pending={scope,requestId:plan.id,kind:'simulation',actionId:'tap'};listeners.opened();},
    settle,close(){cleanup();}};
}

test('authorized device mirrors one plan, cancels on invalidation/opt-out and rechecks permission', async()=>{
  const b=bridge();
  b.subscribe(b.source);await b.settle();
  assert.equal(b.notices.at(-1).eventId,plan.id);
  const prior=b.notices.length;b.change(plan);assert.equal(b.notices.length,prior);
  b.dom.hidden=true;b.dom.dispatchEvent(new Event('visibilitychange'));await b.settle();
  assert.equal(b.notices.length,prior);
  b.dom.hidden=false;b.change(undefined);assert.deepEqual(b.notices.at(-1),{scope:'phone-scope'});
  b.change(plan);assert.equal(b.notices.at(-1).eventId,plan.id);
  b.setting(false);await b.settle();assert.deepEqual(b.notices.at(-1),{scope:'phone-scope'});
  b.setting(true);await b.settle();assert.equal(b.notices.at(-1).eventId,plan.id);
  b.permission('denied');await b.settle();assert.deepEqual(b.notices.at(-1),{scope:'phone-scope'});
  b.tap('someone-else');await b.settle();assert.equal(b.opens.length,0);
  b.tap('phone-scope');await b.settle();assert.equal(b.opens[0][1],'simulation');
  b.close();assert.deepEqual(b.notices.at(-1),{scope:'phone-scope'});
});
test('an excluded recipient clears pending alerts and discards an old simulation tap', async()=>{
  const b=bridge();b.subscribe(null);await b.settle();
  assert.deepEqual(b.notices,[{scope:'phone-scope'}]);
  b.tap('phone-scope');await b.settle();assert.equal(b.opens.length,0);assert.deepEqual(b.acknowledgments,['tap']);b.close();
});
test('a cold tap reconciles the exact event and opens only the original fictional connection', async()=>{
  for(const kind of ['request','reply','match','interest']){
    const id=plan.id, connectionId=kind==='request'?id:'accepted-fictional';
    let committed=false,validated=false;
    const connection={id:connectionId,status:kind==='request'?'pending':'accepted',person:{id:plan.personId,isDemo:true}};
    const source={
      simulation:{reconcileActivity(value){assert.equal(value,id);assert.ok(validated);committed=true;},
        snapshot(){return {log:committed?[{id,kind,personId:plan.personId,connectionId}]:[]};}},
      async inbox(){validated=true;return [connection];}
    };
    const result=await simulationActivityDestination(source,id);
    if(kind==='interest') assert.equal(result,null);
    else assert.deepEqual(result,{id:connectionId,requestOnly:kind==='request',messageId:kind==='reply'?id:undefined});
    connection.person.isDemo=false;
    assert.equal(await simulationActivityDestination(source,id),null);
    connection.person.isDemo=true;connection.status='closed';
    assert.equal(await simulationActivityDestination(source,id),null);
  }
});
