import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { mergeMessages } from '../src/community/timeline.ts';
import { refreshHistoricalMessages } from '../src/community/messageRefresh.ts';
import * as outbox from '../src/community/chatOutbox.ts';
const code=ts.transpileModule(await readFile(new URL('../src/community/useThread.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function mount(){
 const hooks=[],effects=[],events=new Map();let index=0,watch,fail;
 const list=Array.from({length:75},(_,i)=>({id:String(i),body:'private '+i,createdAt:new Date(1700000000000+i).toISOString(),senderIsMe:false}));
 list[5].reply={id:'0',body:list[0].body,senderIsMe:false};
 const memo=(fn,deps)=>{const at=index++,old=hooks[at];if(!old||deps.some((v,i)=>v!==old.deps[i]))hooks[at]={deps,value:fn()};return hooks[at].value;};
 const react={useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),useSyncExternalStore:(_subscribe,read)=>read(),
  useRef:value=>{const at=index++;if(!(at in hooks))hooks[at]={current:value};return hooks[at];},
  useState:value=>{const at=index++;if(!(at in hooks))hooks[at]=typeof value==='function'?value():value;return [hooks[at],next=>{hooks[at]=typeof next==='function'?next(hooks[at]):next;}];},
  useEffect:(fn,deps)=>{const at=index++,old=hooks[at];if(!old||deps.some((v,i)=>v!==old.deps[i])){old?.cleanup?.();const item={deps};hooks[at]=item;effects.push(()=>{item.cleanup=fn();});}},
 };
 const source={thread:async(_id,before)=>structuredClone(before?list.slice(0,25):list.slice(-50)),
  messageChanges:async(_id,ids)=>{if(fail)throw fail;return structuredClone(list.filter(row=>ids.includes(row.id)));},
  watch:fn=>{watch=fn;return()=>{};},send:async()=>{throw Error('offline');}};
 const exports={};vm.runInNewContext(code,{exports,setTimeout,clearTimeout,window:{addEventListener:()=>{},removeEventListener:()=>{}},document:{hidden:false,addEventListener:(e,fn)=>events.set(e,fn),removeEventListener:e=>events.delete(e)},require:name=>name==='react'?react:name==='./data'?{messagePageSize:50}:name==='./timeline'?{mergeMessages}:name==='./messageRefresh'?{refreshHistoricalMessages}:outbox});
 const render=()=>{index=0;const result=exports.useThread(source,'room');for(const effect of effects.splice(0))effect();return result;};
 return {list,render,setFail:value=>{fail=value;},refresh:async()=>{await watch();await settle();},cleanup:()=>{for(const hook of hooks)hook?.cleanup?.();}};
}
test('loaded history and reply excerpts refresh after deletion while drafts and pending sends survive',async()=>{
 const m=mount();m.render();await settle();let view=m.render();assert.equal(view.rows.length,50);
 await view.older();view=m.render();assert.equal(view.rows.length,75);
 view.outbox.enqueue('pending');view.outbox.write('next draft');await settle();m.render();
 m.list[0]={...m.list[0],deletedAt:new Date().toISOString(),body:'must disappear'};
 await m.refresh();view=m.render();assert.equal(view.rows.find(x=>x.id==='0').body,'تم حذف هذه الرسالة');assert.equal(view.rows.find(x=>x.id==='5').reply.body,'تم حذف هذه الرسالة');
 assert.equal(view.draft,'next draft');assert(view.rows.some(x=>x.body==='pending'));
 m.setFail(Error('offline'));await m.refresh();view=m.render();assert.equal(view.rows.filter(x=>!('status'in x)).length,50,'unchecked old rows are removed');assert.equal(view.draft,'next draft');m.cleanup();
});
test('denied historical authorization clears loaded content and private drafts',async()=>{
 const m=mount();m.render();await settle();let view=m.render();await view.older();view=m.render();view.outbox.write('private draft');m.render();
 m.setFail(Object.assign(Error('closed'),{status:403}));await m.refresh();view=m.render();assert.equal(view.ready,false);assert.equal(view.rows.length,0);assert.equal(view.draft,'');m.cleanup();
});
