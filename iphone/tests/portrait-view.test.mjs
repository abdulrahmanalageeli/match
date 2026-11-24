import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const compiled=ts.transpileModule(await readFile(new URL('../src/photos/PortraitPhoto.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function mount({revealed=false,deferDownloads=false,authoritativeDownload=false,discovery=false,initiallyVisible=true}={}){
 const effects=[],state=[],events=new Map(),revoked=[],timeouts=new Map(),intervals=new Map(),pendingDownloads=[];
 let serial=0,observer,nearbyObserver,watcher,downloads=0,checks=0,authorizations=0,allowed=true;
 let info={id:'photo',path:'blurred.jpg',blur:65,revealed};
 const document={hidden:false,addEventListener:(event,fn)=>events.set(event,fn),removeEventListener:event=>events.delete(event)};
 const source={
  portraitUrlResolvesState:authoritativeDownload,
  portraitState:async()=>{checks++;if(!allowed)throw Error('revoked');return {...info};},
  portraitUrl:async(_photo,authorized)=>{
   if(!allowed)throw Error('revoked');
   if(authoritativeDownload){authorizations++;if(authorized({...info})===false)throw Error('outside viewport');}
   const url='blob:'+(++downloads);
   if(deferDownloads)await new Promise(resolve=>pendingDownloads.push(resolve));
   return url;
  },
  watch:fn=>{watcher=fn;return()=>{watcher=null;};},
 };
 const exports={};
 const context={exports,document,Date,URL:{revokeObjectURL:url=>revoked.push(url)},
  IntersectionObserver:class{
   constructor(callback,options){this.callback=callback;this.nearby=Boolean(options?.rootMargin);if(this.nearby)nearbyObserver=callback;else observer=callback;}
   observe(){this.callback([{isIntersecting:this.nearby?false:initiallyVisible}]);}
   disconnect(){}
  },
  setTimeout:fn=>{timeouts.set(++serial,fn);return serial;},clearTimeout:id=>timeouts.delete(id),
  setInterval:fn=>{intervals.set(++serial,fn);return serial;},clearInterval:id=>intervals.delete(id),
  require:name=>name==='react'?{useEffect:fn=>effects.push(fn),useRef:value=>({current:value}),useState:value=>{const i=state.push(value)-1;return[value,next=>{state[i]=next;}];}}
   :name==='react/jsx-runtime'?{jsx:(tag,props)=>({tag,props})}: {UserRound:()=>null},
 };
 vm.runInNewContext(compiled,context);
 const tree=exports.PortraitPhoto({portrait:info,source,alt:'portrait',discovery:discovery?{name:'member'}:undefined});
 (tree.props.ref??tree.props.observe)({parentElement:{}});const cleanup=effects[0]();
 return {state,revoked,get checks(){return checks;},get downloads(){return downloads;},get authorizations(){return authorizations;},
  setInfo:patch=>{info={...info,...patch};},setAllowed:value=>{allowed=value;},
  tick:async()=>{for(const fn of intervals.values())fn();await settle();},
  watch:async()=>{watcher();for(const [id,fn] of timeouts){timeouts.delete(id);fn();}await settle();},
  visibility:async hidden=>{document.hidden=hidden;events.get('visibilitychange')();await settle();},
  near:async isIntersecting=>{nearbyObserver([{isIntersecting}]);await settle();},
  intersect:async (...states)=>{observer(states.map(isIntersecting=>({isIntersecting})));await settle();},
  resolveDownload:async()=>{pendingDownloads.shift()();await settle();},cleanup};
}

test('portrait view reauthorizes without redownloading an unchanged image and replaces on stage changes',async()=>{
 const m=mount();await settle();assert.equal(m.downloads,1);assert.equal(m.state[0].revealed,false);
 await m.tick();await m.watch();assert.equal(m.downloads,1);assert.equal(m.checks,3);
 m.setInfo({path:'clear.jpg',blur:0,revealed:true});await m.watch();assert.equal(m.downloads,2);assert.equal(m.state[0].revealed,true);assert.deepEqual(m.revoked,['blob:1']);
 m.setInfo({path:'blurred.jpg',blur:65,revealed:false});await m.watch();assert.equal(m.downloads,3);assert.equal(m.state[0].revealed,false);assert(m.revoked.includes('blob:2'));
 m.cleanup();assert(m.revoked.includes('blob:3'));
});

test('a revoked, hidden or offscreen clear portrait is discarded and rechecked on return',async()=>{
 const m=mount({revealed:true});await settle();assert.equal(m.state[0].revealed,true);
 await m.visibility(true);assert.equal(m.state[0],null);const checks=m.checks;
 await m.tick();assert.equal(m.checks,checks);
 await m.visibility(false);assert.equal(m.state[0].revealed,true);
 await m.intersect(false);assert.equal(m.state[0],null);await m.tick();const before=m.downloads;
 await m.intersect(true);assert.equal(m.downloads,before+1);
 m.setAllowed(false);await m.watch();assert.equal(m.state[0],null);m.cleanup();
});

test('returning to the tab cannot paint a clear download authorized before it was hidden',async()=>{
 const m=mount({revealed:true,deferDownloads:true});await settle();assert.equal(m.downloads,1);
 await m.visibility(true);m.setInfo({path:'blurred.jpg',blur:65,revealed:false});await m.visibility(false);
 await m.resolveDownload();assert.equal(m.state[0],null);assert(m.revoked.includes('blob:1'));assert.equal(m.downloads,2);
 await m.resolveDownload();assert.equal(m.state[0].revealed,false);m.cleanup();
});

test('an authoritative first download avoids a duplicate metadata RPC and still checks for revocation',async()=>{
 const m=mount({authoritativeDownload:true});await settle();
 assert.equal(m.downloads,1);assert.equal(m.checks,0);
 await m.tick();assert.equal(m.checks,1);assert.equal(m.downloads,1);
 m.setAllowed(false);await m.watch();assert.equal(m.state[0],null);assert(m.revoked.includes('blob:1'));m.cleanup();
});

test('nearby discovery preloads an authorized default variant and reuses it in the viewport',async()=>{
 const m=mount({discovery:true,authoritativeDownload:true,initiallyVisible:false});await settle();
 assert.equal(m.downloads,0);await m.near(true);assert.equal(m.downloads,1);assert.equal(m.state[0].revealed,false);
 await m.intersect(true);assert.equal(m.checks,1);assert.equal(m.downloads,1);
 await m.visibility(true);assert.equal(m.state[0],null);assert.deepEqual(m.revoked,['blob:1']);m.cleanup();
});

test('offscreen discovery waits for visibility before reading a freshly revealed Storage variant',async()=>{
 const m=mount({discovery:true,authoritativeDownload:true,initiallyVisible:false});await settle();
 m.setInfo({path:'clear.jpg',blur:0,revealed:true});await m.near(true);
 assert.equal(m.authorizations,1);assert.equal(m.downloads,0);assert.equal(m.state[0],null);
 await m.tick();assert.equal(m.authorizations,1);
 await m.intersect(true);assert.equal(m.downloads,1);assert.equal(m.state[0].revealed,true);
 await m.intersect(true,false);assert.equal(m.state[0],null);assert.deepEqual(m.revoked,['blob:1']);
 await m.tick();assert.equal(m.downloads,1);m.cleanup();
});

test('a preload completing after it leaves the warm area is discarded',async()=>{
 const m=mount({discovery:true,authoritativeDownload:true,initiallyVisible:false,deferDownloads:true});await settle();
 await m.near(true);assert.equal(m.downloads,1);await m.near(false);await m.resolveDownload();
 assert.equal(m.state[0],null);assert.deepEqual(m.revoked,['blob:1']);m.cleanup();
});

test('a prefetched default portrait that scrolls away unseen releases its blob',async()=>{
 const m=mount({discovery:true,authoritativeDownload:true,initiallyVisible:false});await settle();
 await m.near(true);assert.equal(m.state[0].revealed,false);await m.near(false);
 assert.equal(m.state[0],null);assert.deepEqual(m.revoked,['blob:1']);m.cleanup();
});
