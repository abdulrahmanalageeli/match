import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {blurPixels} from '../src/photos/portraitBlur.ts';

const preparationUrl=new URL('../src/photos/portraitPreparation.ts',import.meta.url);
const source=await readFile(preparationUrl,'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
 .replaceAll("'./portraitBlur'",JSON.stringify(new URL('../src/photos/portraitBlur.ts',import.meta.url).href))
 .replaceAll('import.meta.url',JSON.stringify(preparationUrl.href));
const{preparePortrait,blurPortraitPixels}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));

test('zero blur preserves every source byte',()=>{
 const pixels=Uint8ClampedArray.from([9,73,254,127,128,1,97,255]);
 const original=pixels.slice();blurPixels(pixels,2,1,0);assert.deepEqual(pixels,original);
});

test('blur preserves solid colors and alpha even when its radius exceeds the image',()=>{
 for(const [width,height] of [[1,1],[1,7],[8,1],[4,6]]){
  const pixels=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<pixels.length;i+=4)pixels.set([63,140,239,80+i%175],i);
  const original=pixels.slice();blurPixels(pixels,width,height,30);assert.deepEqual(pixels,original);
 }
});

test('blur modifies actual RGB pixels, preserves symmetry, and never mixes channels or alpha',()=>{
 const width=9,pixels=new Uint8ClampedArray(width*width*4),at=(x,y)=>(y*width+x)*4;
 for(let i=3;i<pixels.length;i+=4)pixels[i]=100+i%150;
 pixels[at(4,4)]=255;const original=pixels.slice();blurPixels(pixels,width,width,2);
 assert(pixels[at(4,4)]>0&&pixels[at(4,4)]<original[at(4,4)]);
 assert(pixels[at(3,4)]>0,'neighboring pixels acquire color; this is not a CSS-only preview');
 for(let y=0;y<width;y++)for(let x=0;x<width;x++){
  const i=at(x,y);assert.equal(pixels[i],pixels[at(width-1-x,y)]);assert.equal(pixels[i],pixels[at(x,width-1-y)]);
  assert.equal(pixels[i+1],0);assert.equal(pixels[i+2],0);assert.equal(pixels[i+3],original[i+3]);
 }
});

test('three blur passes have the expected two-pixel endpoint result',()=>{
 const pixels=Uint8ClampedArray.from([0,0,0,255,243,0,0,255]);
 blurPixels(pixels,2,1,1);
 // Edge repetition gives [81,162], then [108,135], then [117,126].
 assert.deepEqual([...pixels],[117,0,0,255,126,0,0,255]);
});

test('invalid files and blur settings are rejected before decoding or making object URLs',async()=>{
 const jpeg={type:'image/jpeg',size:12};
 await assert.rejects(preparePortrait({type:'image/svg+xml',size:12},50),/JPG/);
 await assert.rejects(preparePortrait({...jpeg,size:12*1024*1024+1},50),/١٢/);
 for(const blur of [-1,101,NaN,1.5])await assert.rejects(preparePortrait(jpeg,blur),/التمويه/);
 for(const policy of ['other','',null])await assert.rejects(preparePortrait(jpeg,50,policy),/موعدًا/);
});

test('automatic reveal retains only a normalized clear JPEG when explicitly selected, before applying the public blur',async t=>{
 const prior={Image:globalThis.Image,document:globalThis.document,Worker:globalThis.Worker};
 const canvases=[],encodings=[],revoked=[];
 globalThis.Image=class{naturalWidth=1600;naturalHeight=2000;async decode(){}};
 globalThis.Worker=class{postMessage(job){queueMicrotask(()=>this.onmessage({data:job.pixels}));}terminate(){}};
 globalThis.document={createElement(name){assert.equal(name,'canvas');let blurred=false;
  const canvas={width:0,height:0,getContext(){return{fillRect(){},drawImage(){},getImageData(){return{data:new Uint8ClampedArray(8)};},putImageData(){blurred=true;}};},
   toBlob(done,mime,quality){assert.equal(canvas.width,640);assert.equal(canvas.height,800);assert.equal(mime,'image/jpeg');assert.equal(quality,.88);encodings.push(blurred?'blurred':'clear');done(new Blob([blurred?'blurred':'clear'],{type:mime}));}};
  canvases.push(canvas);return canvas;
 }};
 t.mock.method(URL,'createObjectURL',()=>`blob:test-${canvases.length}`);
 t.mock.method(URL,'revokeObjectURL',url=>revoked.push(url));
 t.after(()=>{for(const key of ['Image','document','Worker'])if(prior[key]===undefined)delete globalThis[key];else globalThis[key]=prior[key];});
 const file=new File(['source with metadata'],'portrait.jpg',{type:'image/jpeg'});
 const ordinary=await preparePortrait(file,65);
 assert.equal(ordinary.revealPolicy,'never');assert.equal(ordinary.clearBlob,undefined);assert.deepEqual(encodings.splice(0),['blurred']);assert.equal(await ordinary.blob.text(),'blurred');
 for(const policy of ['matched','serious','family']){
  const result=await preparePortrait(file,65,policy);
  assert.equal(result.revealPolicy,policy);assert.deepEqual(encodings.splice(0),['clear','blurred']);
  assert.equal(result.clearBlob.type,'image/jpeg');assert.equal(await result.clearBlob.text(),'clear');assert.notEqual(result.clearBlob,file);assert.equal(await result.blob.text(),'blurred');
 }
 const publicClear=await preparePortrait(file,0,'family');assert.equal(publicClear.revealPolicy,'never');assert.equal(publicClear.clearBlob,undefined);assert.deepEqual(encodings,['clear']);
 assert.equal(revoked.length,5,'all original source URLs are released');assert(canvases.every(canvas=>canvas.width===0&&canvas.height===0));
});

test('worker receives a transferred copy and returns the same deterministic blur without detaching the image',async t=>{
 const original=globalThis.Worker,workers=[];
 globalThis.Worker=class{
  constructor(url,options){this.url=url;this.options=options;workers.push(this);}
  postMessage(job,transfer){
   assert.equal(transfer[0],job.pixels);this.input=job.pixels;
   const result=structuredClone(job,{transfer});assert.equal(job.pixels.byteLength,0);
   queueMicrotask(()=>{blurPixels(new Uint8ClampedArray(result.pixels),result.width,result.height,result.radius);this.onmessage({data:result.pixels});});
  }
  terminate(){this.terminated=true;}
 };
 t.after(()=>{if(original===undefined)delete globalThis.Worker;else globalThis.Worker=original;});
 const data=Uint8ClampedArray.from([0,0,0,255,243,0,0,255]);
 const pending=blurPortraitPixels(data,2,1,1);
 assert.equal(data.byteLength,8);assert.equal(data[4],243,'main thread pixels are unchanged while the worker is running');
 await pending;assert.deepEqual([...data],[117,0,0,255,126,0,0,255]);
 assert.equal(workers.length,1);assert.equal(workers[0].options.type,'module');assert(workers[0].url.pathname.endsWith('/portraitBlur.worker.ts'));assert(workers[0].terminated);
});

test('unavailable, failed and malformed workers fall back to blurred pixels and terminate',async t=>{
 const original=globalThis.Worker;t.after(()=>{if(original===undefined)delete globalThis.Worker;else globalThis.Worker=original;});
 for(const failure of ['missing','constructor','error','messageerror','malformed']){
  let terminated=false;
  if(failure==='missing')delete globalThis.Worker;
  else globalThis.Worker=class{
   constructor(){if(failure==='constructor')throw Error('restricted');}
   postMessage(job,transfer){structuredClone(job,{transfer});queueMicrotask(()=>{
    if(failure==='error')this.onerror({preventDefault(){}});
    else if(failure==='messageerror')this.onmessageerror();
    else this.onmessage({data:new ArrayBuffer(0)});
   });}
   terminate(){terminated=true;}
  };
  const data=Uint8ClampedArray.from([0,0,0,255,243,0,0,255]);await blurPortraitPixels(data,2,1,1);
  assert.deepEqual([...data],[117,0,0,255,126,0,0,255],failure);
  if(!['missing','constructor'].includes(failure))assert(terminated,failure);
 }
});

test('zero blur never starts a worker',async t=>{
 const original=globalThis.Worker;globalThis.Worker=class{constructor(){assert.fail('zero blur should not use a worker');}};
 t.after(()=>{if(original===undefined)delete globalThis.Worker;else globalThis.Worker=original;});
 const data=Uint8ClampedArray.from([1,2,3,255]);await blurPortraitPixels(data,1,1,0);assert.deepEqual([...data],[1,2,3,255]);
});
