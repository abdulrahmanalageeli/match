import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real subscription effect without mounting unrelated app services.
const source=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let effect,voiceKey;
function visit(node){
 if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0]?.getText(ast).includes('onMembershipUpdate('))effect=node.arguments[0].getText(ast);
 if(ts.isJsxOpeningElement(node)&&node.tagName.getText(ast)==='VoiceCallsProvider')voiceKey=node.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(ast)==='key')?.initializer.expression.getText(ast);
 ts.forEachChild(node,visit);
}
visit(ast);
assert.ok(effect,'subscription recovery effect exists');
const code=ts.transpileModule('('+effect+')()', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('subscription changes preserve the call provider; account/access changes replace it',()=>{
 assert.ok(voiceKey);
 const key=overrides=>vm.runInNewContext(voiceKey,{demo:false,sampleSession:1,token:'member',active:true,memberAccess:true,...overrides});
 assert.equal(key({active:true}),key({active:false}),'expiry must not remount an allowed voice call');
 assert.notEqual(key({}),key({token:'other'}));
 assert.notEqual(key({}),key({memberAccess:false}));
});
function mount(){
 const events=new Map(),timers=new Set(),calls=[],finished=[],delivered=[];
 let receive,fail=true,removed=false,current='receipt',resolveRequest;
 const tokenRef={current:'owner'};
 const document={hidden:false,addEventListener:(n,f)=>events.set(n,f),removeEventListener:n=>events.delete(n)};
 const window={...document,setInterval:f=>{timers.add(f);return f;},clearInterval:f=>timers.delete(f)};
 const cleanup=vm.runInNewContext(code,{
  ios:true,token:'owner',accepted:true,demo:false,tokenRef,version:{current:0},document,window,
  request:async(...args)=>{calls.push(args);if(resolveRequest)return await new Promise(resolve=>{resolveRequest=resolve;});if(fail)throw Error('network');return {membership:{active:true}};},
  setLive:s=>delivered.push(s),completeMembership:async jws=>finished.push(jws),
  currentMembership:async()=>current,
  onMembershipUpdate:async fn=>{receive=fn;return {remove:async()=>{removed=true;}};},
 });
 return {calls,finished,delivered,tokenRef,document,cleanup,events,timers,
  emit:jws=>receive(jws),online:()=>events.get('online')?.(),tick:()=>{for(const f of timers)f();},
  succeed:()=>{fail=false;},noCurrent:()=>{current=null;},hold:()=>{resolveRequest=true;},release:()=>resolveRequest({membership:{active:true}}),removed:()=>removed};
}

test('failed delivery retries on connectivity and only finishes after server delivery',async()=>{
 const m=mount();await settle();assert.equal(m.calls.length,1);assert.equal(m.finished.length,0);
 m.succeed();m.online();await settle();assert.deepEqual(m.finished,['receipt']);assert.equal(m.delivered.length,1);
 const count=m.calls.length;m.tick();await settle();assert.equal(m.calls.length,count,'successful receipts leave retry queue');
 m.cleanup();await settle();assert.equal(m.removed(),true);assert.equal(m.events.size,0);assert.equal(m.timers.size,0);
});

test('transient verification failures retry without reconnect; hidden and old sessions do not deliver',async()=>{
 const m=mount();await settle();m.noCurrent();m.succeed();m.document.hidden=true;m.tick();await settle();assert.equal(m.finished.length,0);
 m.document.hidden=false;m.tick();await settle();assert.deepEqual(m.finished,['receipt']);
 m.tokenRef.current='other-member';m.emit('other-receipt');m.online();await settle();assert.equal(m.calls.length,2);
 m.cleanup();
});

test('late verification after logout cannot unlock or finish for the next account',async()=>{
 const m=mount();await settle();m.succeed();m.hold();m.emit('pending');await settle();
 m.tokenRef.current='other-member';m.cleanup();m.release();await settle();
 assert.equal(m.delivered.length,0);assert.equal(m.finished.length,0);
});
