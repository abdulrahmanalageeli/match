import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
let code=await readFile(new URL('../api/verify-photo.ts',import.meta.url),'utf8');
code=code.replace(/import \{ createClient \}[^\n]+/, 'const createClient=(...args)=>globalThis.__photoClient(...args);')
 .replace(/import \{ compareAuthenticaFaces \}[^\n]+/, 'const compareAuthenticaFaces=(...args)=>globalThis.__photoCompare(...args);');
const handler=(await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(code)).toString('base64'))).default;
const id='11111111-1111-4111-8111-111111111111', photo='22222222-2222-4222-8222-222222222222';
const configured={NISFAYN_SUPABASE_URL:'https://wupkifqbwhhebwrgvwai.supabase.co',NISFAYN_SERVICE_ROLE_KEY:'test-secret',AUTHENTICA_KEY:'test-authentica'};
let saved,calls,matched,required,beginError,authError;
test.beforeEach(()=>{
 saved=Object.fromEntries(Object.keys(configured).map(k=>[k,process.env[k]]));Object.assign(process.env,configured);
 calls=[];matched=true;required=true;beginError=null;authError=null;
 globalThis.__photoClient=()=>({auth:{getUser:async()=>({data:{user:{id}},error:authError})},rpc:async(name,args)=>{
  calls.push([name,args]);
  if(name==='marriage_photo_face_required')return{data:required};
  if(name==='marriage_photo_face_begin')return{data:{attempt:photo,bucket:'nisfayn-profile-portraits',path:'server-path'},error:beginError};
  return{data:true};
 },storage:{from:bucket=>({download:async path=>{calls.push(['download',{bucket,path}]);return{data:new Blob([new Uint8Array([255,216,1,255,217])])};}})}});
 globalThis.__photoCompare=async input=>{calls.push(['compare',input]);return{matched,liveness:'not_verified'};};
});
test.afterEach(()=>{for(const[k,v]of Object.entries(saved))if(v===undefined)delete process.env[k];else process.env[k]=v;delete globalThis.__photoClient;delete globalThis.__photoCompare;});
async function invoke(change={}){
 const response={code:0,body:null,setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;return this;},end(){return this;}};
 await handler({method:'POST',headers:{origin:'https://nisfayn-preview.vercel.app',authorization:'Bearer user-token'},body:{photoId:photo,kind:'portrait',selfie:Buffer.from([255,216,2,255,217]).toString('base64'),consent:'face-photo-v1',memberId:'attacker'},...change},response);
 return response;
}
test('authenticates, reads exact server-selected object, records only successful match',async()=>{
 assert.equal((await invoke()).code,200);
 assert.equal(calls.find(([name])=>name==='marriage_photo_face_begin')[1].member,id);
 assert.deepEqual(calls.find(([name])=>name==='download')[1],{bucket:'nisfayn-profile-portraits',path:'server-path'});
 assert.equal(calls.find(([name])=>name==='compare')[1].memberId,id);
 assert.match(calls.find(([name])=>name==='marriage_photo_face_finish')[1].image_hash,/^[a-f0-9]{64}$/);
});
test('nonmatch cannot grant proof',async()=>{
 matched=false;const result=await invoke();assert.equal(result.code,422);assert.equal(result.body.error,'no_match');
 assert.ok(!calls.some(([name])=>name==='marriage_photo_face_finish'));
});
test('invalid origin, credentials, consent and rate limit cannot invoke comparison',async()=>{
 assert.equal((await invoke({headers:{origin:'https://evil.test',authorization:'Bearer token'}})).code,403);
 assert.equal((await invoke({headers:{}})).code,401);
 assert.equal((await invoke({body:{}})).code,400);
 authError={message:'expired'};assert.equal((await invoke()).code,401);authError=null;
 required=false;assert.equal((await invoke()).code,403);required=true;
 beginError={message:'rate_limited'};assert.equal((await invoke()).code,429);
 assert.ok(!calls.some(([name])=>name==='compare'));
});
test('missing provider key fails closed',async()=>{
 delete process.env.AUTHENTICA_KEY;assert.equal((await invoke()).code,503);assert.equal(calls.length,0);
});
