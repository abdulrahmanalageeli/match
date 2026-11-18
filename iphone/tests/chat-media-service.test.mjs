import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadChatMedia, viewOnceUpload } from '../supabase/functions/_shared/chat-media.ts';
const id='fa9bfe0e-dbf7-4c57-8c57-eef0bab55b43',session='a'.repeat(64),path='reham/'+id;
const request=viewOnce=>({session,payload:{id,viewOnce}});
const jpeg=new Blob([new Uint8Array([255,216,255,0,0,0,0,0,0,0,0,0])],{type:'image/jpeg'});

test('binary view-once handler validates before redemption, never returns a reusable URL, and refuses replay',async()=>{
 const calls=[];let consumed=false;
 const rpc=async(action,s,p)=>{calls.push(action);assert.equal(s,session);assert.equal(p.id,id);if(consumed)throw Error('already_opened');if(action==='media_open')consumed=true;return{path,mime:'image/jpeg',size:jpeg.size};};
 const download=async p=>{calls.push('download');assert.equal(p,path);return jpeg;};
 const response=await downloadChatMedia(request(true),rpc,download,{'Access-Control-Allow-Origin':'*'});
 assert.deepEqual(calls,['media_inspect','download','media_open']);assert.equal(response.headers.get('Cache-Control'),'private, no-store, max-age=0');assert.equal(response.headers.get('Content-Type'),'image/jpeg');assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
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

test('a failed storage fetch leaves a one-time photo available; audio cannot opt in',async()=>{
 let consumed=false;const rpc=async(action)=>{if(consumed)throw Error('already_opened');if(action==='media_open')consumed=true;return{path,mime:'image/jpeg',size:jpeg.size};};
 await assert.rejects(downloadChatMedia(request(true),rpc,async()=>{throw Error('network');},{}),/network/);
 assert.equal((await downloadChatMedia(request(true),rpc,async()=>jpeg,{})).status,200);assert(consumed);
 assert.equal(viewOnceUpload(null,'image/jpeg'),false);assert.equal(viewOnceUpload('true','image/jpeg'),true);
 assert.throws(()=>viewOnceUpload('yes','image/jpeg'));assert.throws(()=>viewOnceUpload('true','audio/mp4'));
});
