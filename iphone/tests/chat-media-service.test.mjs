import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadChatMedia, viewOnceUpload } from '../supabase/functions/_shared/chat-media.ts';
const id='fa9bfe0e-dbf7-4c57-8c57-eef0bab55b43',session='a'.repeat(64),path='reham/'+id;
const request=viewOnce=>({session,payload:{id,viewOnce}});
const jpeg=new Blob([new Uint8Array([255,216,255])],{type:'image/jpeg'});

test('binary view-once handler consumes before download, never returns a reusable URL, and refuses replay',async()=>{
 const calls=[];let consumed=false;
 const rpc=async(action,s,p)=>{calls.push(action);assert.equal(s,session);assert.equal(p.id,id);if(consumed)throw Error('already_opened');consumed=true;return{path,mime:'image/jpeg'};};
 const download=async p=>{calls.push('download');assert.equal(p,path);return jpeg;};
 const response=await downloadChatMedia(request(true),rpc,download,{'Access-Control-Allow-Origin':'*'});
 assert.deepEqual(calls,['media_open','download']);assert.equal(response.headers.get('Cache-Control'),'private, no-store, max-age=0');assert.equal(response.headers.get('Content-Type'),'image/jpeg');assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
 assert.deepEqual(new Uint8Array(await response.arrayBuffer()),new Uint8Array(await jpeg.arrayBuffer()));
 await assert.rejects(downloadChatMedia(request(true),rpc,download,{}),/already_opened/);assert.equal(calls.filter(x=>x==='download').length,1);
});

test('ordinary requests use current authorization; invalid or forbidden access downloads nothing',async()=>{
 let calls=0;const download=async()=>{calls++;return jpeg;};
 const rpc=async(action)=>{assert.equal(action,'media_url');return{path};};
 assert.equal((await downloadChatMedia(request(false),rpc,download,{})).status,200);
 for(const body of [{session:'bad',payload:{id}},{session,payload:{id:'bad'}},{session,payload:{id,viewOnce:'true'}}])assert.equal((await downloadChatMedia(body,rpc,download,{})).status,400);
 await assert.rejects(downloadChatMedia(request(true),async()=>{throw Error('forbidden');},download,{}),/forbidden/);
 await assert.rejects(downloadChatMedia(request(true),async()=>({path:'../other'}),download,{}));
 assert.equal(calls,1);
});

test('a failed one-time transfer remains consumed and cannot be reopened; audio cannot opt in',async()=>{
 let consumed=false;const rpc=async()=>{if(consumed)throw Error('already_opened');consumed=true;return{path,mime:'image/jpeg'};};
 await assert.rejects(downloadChatMedia(request(true),rpc,async()=>{throw Error('network');},{}),/network/);
 await assert.rejects(downloadChatMedia(request(true),rpc,async()=>jpeg,{}),/already_opened/);
 assert.equal(viewOnceUpload(null,'image/jpeg'),false);assert.equal(viewOnceUpload('true','image/jpeg'),true);
 assert.throws(()=>viewOnceUpload('yes','image/jpeg'));assert.throws(()=>viewOnceUpload('true','audio/mp4'));
});
