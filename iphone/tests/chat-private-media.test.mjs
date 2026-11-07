import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(await readFile(new URL('../src/community/ChatMedia.tsx', import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const settle = () => new Promise(resolve => setImmediate(resolve));
function mount({once = true, sender = false, openedAt = null, deferred = false, kind = 'photo'} = {}) {
  const hooks = [], pending = [], docEvents = new Map(), winEvents = new Map(), revoked = [];
  let index = 0, downloads = 0, opens = 0, complete;
  const document = {hidden:false, addEventListener:(name,fn)=>{if(!docEvents.has(name))docEvents.set(name,new Set());docEvents.get(name).add(fn);},removeEventListener:(name,fn)=>docEvents.get(name)?.delete(fn)};
  const window = {addEventListener:(name,fn)=>winEvents.set(name,fn),removeEventListener:name=>winEvents.delete(name)};
  const source = {mediaUrl:async()=>{downloads++;return 'blob:normal';},openMedia:async()=>{opens++;if(deferred)await new Promise(resolve=>{complete=resolve;});return 'blob:once';}};
  const react = {
    useRef:initial=>{const at=index++;if(!(at in hooks))hooks[at]={current:initial};return hooks[at];},
    useState:initial=>{const at=index++;if(!(at in hooks))hooks[at]=typeof initial==='function'?initial():initial;return [hooks[at],value=>{hooks[at]=typeof value==='function'?value(hooks[at]):value;}];},
    useEffect:(fn,deps)=>{const at=index++,old=hooks[at];if(!old||deps.some((value,i)=>value!==old.deps[i])){old?.cleanup?.();const item={deps};hooks[at]=item;pending.push(()=>{item.cleanup=fn();});}},
  };
  const exports = {}, context = {exports, document, window, URL:{revokeObjectURL:url=>revoked.push(url)}, require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx:(tag,props)=>({tag,props}),jsxs:(tag,props)=>({tag,props}),Fragment:'fragment'}:{}};
  vm.runInNewContext(compiled,context);
  const props = {source,requestId:'room',senderIsMe:sender,attachment:{id:'image',kind,mime:'image/jpeg',size:10,viewOnce:once,openedAt}};
  function render(){index=0;const tree=exports.MessageMedia(props);for(const effect of pending.splice(0))effect();return tree;}
  const walk = (node, predicate) => {if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const child of [node.props?.children].flat(Infinity)){const found=walk(child,predicate);if(found)return found;}return null;};
  const button=()=>walk(render(),node=>node.tag==='button');
  const viewer=()=>walk(render(),node=>typeof node.tag==='function'&&node.tag.name==='PhotoViewer');
  render();
  return {render,button,viewer,revoked,get downloads(){return downloads;},get opens(){return opens;},
    hide:async()=>{document.hidden=true;for(const fn of docEvents.get('visibilitychange')||[])fn();await settle();},
    show:async()=>{document.hidden=false;for(const fn of docEvents.get('visibilitychange')||[])fn();await settle();},
    pagehide:()=>winEvents.get('pagehide')(),
    resolve:async()=>{complete();await settle();},
    unmount:()=>{for(const hook of hooks)hook?.cleanup?.();}};
}

test('view-once images never prefetch or expose a preview; the sender and opened tiles are disabled',async()=>{
  for(const options of [{},{sender:true},{openedAt:'2026-11-07T01:00:00Z'}]){
    const instance=mount(options);await settle();assert.equal(instance.downloads,0);assert.equal(instance.opens,0);assert.equal(instance.viewer(),null);
    assert.equal(instance.button().props.disabled,Boolean(options.sender||options.openedAt));instance.unmount();
  }
});

test('explicit recipient opening consumes once, and closing revokes the blob and prevents reopening',async()=>{
  const instance=mount();instance.button().props.onClick();await settle();
  assert.equal(instance.opens,1);assert.equal(instance.downloads,0);assert.equal(instance.viewer().props.url,'blob:once');
  assert.equal(instance.viewer().props.once,true);instance.viewer().props.close();
  assert.equal(instance.viewer(),null);assert.equal(instance.button().props.disabled,true);assert.deepEqual(instance.revoked,['blob:once']);
  instance.button().props.onClick();await settle();assert.equal(instance.opens,1);instance.unmount();
});

test('backgrounding closes and revokes a view-once image immediately',async()=>{
  const instance=mount();instance.button().props.onClick();await settle();await instance.hide();
  assert.equal(instance.viewer(),null);assert(instance.revoked.includes('blob:once'));assert.equal(instance.button().props.disabled,true);instance.unmount();
});

test('a one-time image finishing after backgrounding is discarded rather than displayed',async()=>{
  const instance=mount({deferred:true});instance.button().props.onClick();await settle();await instance.hide();await instance.resolve();
  assert.equal(instance.viewer(),null);assert.deepEqual(instance.revoked,['blob:once']);instance.unmount();
});

test('leaving or deleting a message while its one-time download is pending discards the result',async()=>{
  const instance=mount({deferred:true});instance.button().props.onClick();await settle();instance.unmount();await instance.resolve();
  assert.equal(instance.viewer(),null);assert.deepEqual(instance.revoked,['blob:once']);
});

test('ordinary photos use an in-app button instead of a downloadable link and release their blob on unmount',async()=>{
  const instance=mount({once:false});await settle();
  assert.equal(instance.downloads,1);assert.equal(instance.button().tag,'button');assert.equal(instance.button().props.href,undefined);
  instance.button().props.onClick();assert.equal(instance.viewer().props.once,false);assert.equal(instance.opens,0);
  instance.pagehide();assert.equal(instance.viewer(),null);instance.unmount();assert(instance.revoked.includes('blob:normal'));
});


test('ordinary photo thumbnails are revoked while hidden and authorized again on return',async()=>{
  const instance=mount({once:false});await settle();assert.equal(instance.downloads,1);
  await instance.hide();assert(instance.revoked.includes('blob:normal'));assert.equal(instance.button(),null);
  await instance.show();assert.equal(instance.downloads,2);assert.equal(instance.button().props.className,'cm-message-photo');instance.unmount();
});


test('backgrounding does not revoke or reload voice-note playback',async()=>{
  const instance=mount({once:false,kind:'audio'});await settle();assert.equal(instance.downloads,1);
  await instance.hide();await instance.show();assert.equal(instance.downloads,1);assert.deepEqual(instance.revoked,[]);
  instance.unmount();assert(instance.revoked.includes('blob:normal'));
});
