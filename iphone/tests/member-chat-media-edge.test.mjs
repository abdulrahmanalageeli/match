import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {validateTestMedia,testMediaLimit} from '../supabase/functions/_shared/test-media.ts';

const code=ts.transpileModule((await readFile(new URL('../supabase/functions/member-chat-media/index.ts',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const id='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222';
function fixture({denied=false,commitLost=false}={}) {
 let handler,published=false,opened=false,bytes;const calls=[],removals=[];
 const storage={upload:async(path,data)=>{bytes=data;return {error:null}},remove:async paths=>{removals.push(...paths);return {error:null}},download:async()=>({data:new Blob([bytes],{type:'image/jpeg'}),error:null})};
 const client={auth:{getUser:async token=>({data:{user:token==='valid'?{id:'owner'}:null},error:token==='valid'?null:{message:'invalid'}})},storage:{from:()=>storage},rpc:async(name,p)=>{
  calls.push(p?.action||name);if(name==='marriage_chat_media_cleanup')return {data:[],error:null};
  if(denied)return {error:{code:'42501'}};
  if(p.action==='prepare')return {data:{id,path:'safe/path',already:published}};
  if(p.action==='commit'){published=true;if(commitLost)return {error:{code:'network'}};return {data:{id}};}
  if(p.action==='abort')return {data:{path:published?null:'safe/path'}};
  if(p.action==='open'){if(opened)return {error:{code:'42501'}};opened=true;}
  return {data:{path:'safe/path',mime:'image/jpeg'}};
 }};
 const context=vm.createContext({Deno:{env:{get:n=>n==='SUPABASE_URL'?'https://wupkifqbwhhebwrgvwai.supabase.co':'key'},serve:h=>handler=h},createClient:()=>client,validateTestMedia,testMediaLimit,Response,Uint8Array,TextDecoder,URL});
 vm.runInContext(code,context);
 const jpeg=new Uint8Array(20);jpeg.set([255,216,255]);
 const upload=(token='valid',body=jpeg)=>handler(new Request('https://edge.test/?action=upload',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'image/jpeg','x-request-id':requestId,'x-client-id':id},body}));
 const download=once=>handler(new Request('https://edge.test/?action=download',{method:'POST',headers:{Authorization:'Bearer valid','Content-Type':'application/json'},body:JSON.stringify({requestId,mediaId:id,viewOnce:once})}));
 return {upload,download,calls,removals};
}
test('member media endpoint validates auth and bytes before storage and respects RPC denial',async()=>{
 const f=fixture();assert.equal((await f.upload('invalid')).status,401);assert.equal(f.calls.length,0);
 assert.equal((await f.upload('valid',new TextEncoder().encode('<script>bad payload</script>'))).status,400);
 assert.equal((await fixture({denied:true}).upload()).status,403);
});
test('member media uploads once and returns private bytes without a replayable signed URL',async()=>{
 const f=fixture();assert.deepEqual(await (await f.upload()).json(),{id});
 assert.equal((await f.upload()).status,200);assert.equal(f.calls.filter(x=>x==='commit').length,1);
 const response=await f.download(true);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal(response.headers.get('content-type'),'image/jpeg');assert.equal((await response.arrayBuffer()).byteLength,20);
 assert.equal((await f.download(true)).status,403);
});
test('lost publish response never deletes an already published attachment',async()=>{
 const f=fixture({commitLost:true});assert.equal((await f.upload()).status,409);assert.equal(f.removals.length,0);
 assert.equal((await f.upload()).status,200);
});
