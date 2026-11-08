import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const compile=async path=>ts.transpileModule(await readFile(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const dataUrl=url((await compile('../src/community/data.ts'))
 .replace("'../profile/profileOptions'",JSON.stringify(new URL('../src/profile/profileOptions.ts',import.meta.url).href))
 .replace("'./simulation'",JSON.stringify(new URL('../src/community/simulation.ts',import.meta.url).href))
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/ai\/client["'];?/, "const requestAi=async()=>{throw Error('offline')};")
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/verification\/client["'];?/, 'const manualVerificationSource=()=>({});')
 .replace("'../family/model'",JSON.stringify(new URL('../src/family/model.ts',import.meta.url).href))
 .replace("'../readiness/model'",JSON.stringify(new URL('../src/readiness/model.ts',import.meta.url).href))
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/cloud["'];?/g,'')
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\/updates["'];?/,'')
 .replace('"../compatibility/model"',JSON.stringify(new URL('../src/compatibility/model.ts',import.meta.url).href))
 .replace('"../beena/model"',JSON.stringify(new URL('../src/beena/model.ts',import.meta.url).href))
 .replace('"../compatibility/personality"',JSON.stringify(new URL('../src/compatibility/personality.ts',import.meta.url).href))
 + '\nconst cloud={storage:{from:()=>globalThis.__portraitHarness.storage}}; const callRpc=(...args)=>globalThis.__portraitHarness.rpc(...args); class CloudError extends Error{} const privateUpdates=()=>()=>()=>{};');
const {cloudCommunity,demoCommunity,demoProfile}=await import(dataUrl);
const {pairSource,testProfile}=await import(url((await compile('../src/testing/pair.ts'))
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/ai\/client["'];?/, "const requestAi=async()=>{throw Error('offline')};")
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/verification\/client["'];?/, 'const manualVerificationSource=()=>({});')
 .replace("'../family/model'",JSON.stringify(new URL('../src/family/model.ts',import.meta.url).href))
 .replace("'../readiness/model'",JSON.stringify(new URL('../src/readiness/model.ts',import.meta.url).href))
 .replace("'../community/data'",JSON.stringify(dataUrl))
 .replace("'../compatibility/model'",JSON.stringify(new URL('../src/compatibility/model.ts',import.meta.url).href))
 .replace("'../beena/model'",JSON.stringify(new URL('../src/beena/model.ts',import.meta.url).href))
 .replace(/import\s*\{[^}]+\}\s*from ['"]\.\.\/deployment['"];?/,"const marriageProjectUrl='https://test.invalid'; const marriagePublishableKey='public-test-key';")));
const jpeg=value=>new Blob([value],{type:'image/jpeg'});
const photo={id:'11111111-1111-4111-8111-111111111111',path:'owner/blurred.jpg',blur:65};

test('cloud authorizes the effective variant; opted-in clear upload is validated before commit',async t=>{
 const calls=[],uploads=[],downloads=[];let policy='serious',failClear=false;
 globalThis.window={setTimeout,clearTimeout};
 globalThis.__portraitHarness={rpc:async(name,payload)=>{calls.push([name,payload]);
  if(name==='marriage_portrait_view')return {...photo,path:'owner/clear.jpg',blur:0,revealed:true};
  if(name==='marriage_portrait_prepare_v2')return {...photo,revealPolicy:payload.reveal_policy,clearPath:payload.reveal_policy==='never'?undefined:'owner/clear.jpg'};
  if(name==='marriage_portrait_commit')return {...photo,revealPolicy:policy,hasClear:policy!=='never'};
  if(name==='marriage_portrait_policy')return {...photo,revealPolicy:payload.reveal_policy,hasClear:payload.reveal_policy!=='never'};
  throw Error(name);
 },storage:{upload:async(path,blob,options)=>{uploads.push([path,blob,options]);return{error:failClear&&path.endsWith('/clear.jpg')?new Error('failed'):null};},download:async path=>{downloads.push(path);return{data:jpeg('download'),error:null};}}};
 t.after(()=>{delete globalThis.window;delete globalThis.__portraitHarness;});
 const source=cloudCommunity('owner'),blurred=jpeg('blurred'),clear=jpeg('clear');
 const downloaded=await source.portraitUrl({...photo,path:'forged/path.jpg'});URL.revokeObjectURL(downloaded);
 assert.deepEqual(downloads,['owner/clear.jpg'],'metadata path is never trusted for access');
 const saved=await source.setPortrait(blurred,65,{policy,clearBlob:clear});assert.equal(saved.hasClear,true);
 assert.deepEqual(uploads.map(x=>x[0]),['owner/blurred.jpg','owner/clear.jpg']);assert.equal(uploads[1][1],clear);assert.equal(uploads[1][2].cacheControl,'0');
 assert.equal(calls.at(-1)[0],'marriage_portrait_commit');
 policy='never';uploads.length=0;await source.setPortrait(blurred,65,{policy,clearBlob:clear});assert.deepEqual(uploads.map(x=>x[0]),['owner/blurred.jpg'],'never does not retain an unsolicited clear image');
 const count=calls.length;await assert.rejects(source.setPortrait(blurred,65,{policy:'family'}),/مجددًا/);assert.equal(calls.length,count);
 failClear=true;const priorCommits=calls.filter(x=>x[0]==='marriage_portrait_commit').length;
 await assert.rejects(source.setPortrait(blurred,65,{policy:'family',clearBlob:clear}),/الخاصة/);
 assert.equal(calls.filter(x=>x[0]==='marriage_portrait_commit').length,priorCommits,'partial two-file upload never publishes');
});

test('paired portraits send both derivatives only after opt-in and preserve policy revision protection',async t=>{
 const profile=testProfile('reham'),calls=[];let revision=0;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  calls.push([url,options]);
  if(url.includes('portrait_download'))return new Response(jpeg('pixels'),{headers:{'Content-Type':'image/jpeg'}});
  if(url.includes('portrait_upload'))return {ok:true,json:async()=>({profileRevision:'r'+(++revision),profiles:{reham:{...profile,portrait:{...photo,revealPolicy:options.headers['x-portrait-reveal'],hasClear:options.body instanceof FormData}}}})};
  const request=JSON.parse(options.body);
  if(request.action==='portrait_info')return {ok:true,json:async()=>({...photo,path:'clear.jpg',blur:0,revealed:true})};
  assert.equal(request.action,'portrait_policy');
  return {ok:true,json:async()=>({profileRevision:'r'+(++revision),profiles:{reham:{...profile,portrait:{...photo,revealPolicy:request.payload.revealPolicy,hasClear:request.payload.revealPolicy!=='never'}}}})};
 });
 const source=pairSource({actor:'reham',session:'private-session',profile,profileRevision:'r0'},()=>profile).source;
 const clear=jpeg('clear');
 await source.setPortrait(jpeg('blurred'),65,{policy:'family',clearBlob:clear});
 assert(calls[0][1].body instanceof FormData);assert.equal(calls[0][1].body.get('blurred').type,'image/jpeg');assert.equal(calls[0][1].body.get('clear').size,clear.size);assert.equal(calls[0][1].headers['Content-Type'],undefined);assert.equal(calls[0][1].headers['x-profile-revision'],'r0');
 await source.setPortraitPolicy(photo,'serious');assert.equal(JSON.parse(calls.at(-1)[1].body).payload.expectedRevision,'r1');
 await source.setPortraitPolicy(photo,'never');assert.equal(JSON.parse(calls.at(-1)[1].body).payload.expectedRevision,'r2');
 const info=await source.portraitState(photo);assert.equal(info.revealed,true);
 const downloaded=await source.portraitUrl(photo);URL.revokeObjectURL(downloaded);const last=calls.at(-1);
 assert(last[0].endsWith('?action=portrait_download'));assert.equal(last[1].cache,'no-store');assert.deepEqual(JSON.parse(last[1].body),{session:'private-session',payload:{id:photo.id}});
 const count=calls.length;await assert.rejects(source.setPortrait(jpeg('blurred'),65,{policy:'matched'}),/مجددًا/);assert.equal(calls.length,count);
});

test('demo policy edits preserve the public blur and disabling drops the clear copy',async()=>{
 const profile={...demoProfile},source=demoCommunity(()=>profile,false);
 profile.portrait=await source.setPortrait(jpeg('blurred'),65,{policy:'matched',clearBlob:jpeg('clear')});
 assert.equal((await source.portraitState(profile.portrait)).revealed,false,'owner preview stays public');
 profile.portrait=await source.setPortraitPolicy(profile.portrait,'family');assert.equal(profile.portrait.hasClear,true);
 profile.portrait=await source.setPortraitPolicy(profile.portrait,'never');assert.equal(profile.portrait.hasClear,false);
 await assert.rejects(source.setPortraitPolicy(profile.portrait,'matched'),/مجددًا/);
});
