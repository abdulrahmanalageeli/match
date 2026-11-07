import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePortraitUpload,portraitLimit} from '../supabase/functions/_shared/portrait-media.ts';

const jpeg=()=>new Uint8Array([255,216,255,224,0,4,74,70,73,70,0,1,255,217]);
async function multipart(entries){const form=new FormData();for(const [name,value] of entries)form.append(name,value,name+'.jpg');const req=new Request('https://example.invalid',{method:'POST',body:form});return [new Uint8Array(await req.arrayBuffer()),req.headers.get('content-type')];}

test('ordinary upload never retains a clear copy; explicit policies need both valid JPEGs',async()=>{
  const old=await parsePortraitUpload(jpeg(),'image/jpeg',65,'never');assert.equal(old.clear,undefined);assert.deepEqual(old.blurred,jpeg());
  const args=await multipart([['blurred',new Blob([jpeg()],{type:'image/jpeg'})],['clear',new Blob([jpeg()],{type:'image/jpeg'})]]);
  for(const policy of ['matched','serious','family']){const result=await parsePortraitUpload(...args,65,policy);assert.deepEqual(result.clear,jpeg());}
  await assert.rejects(parsePortraitUpload(...args,65,'never'),/لم يُسمح/);
  await assert.rejects(parsePortraitUpload(jpeg(),'image/jpeg',65,'matched'));
  await assert.rejects(parsePortraitUpload(...args,0,'matched'));
});

test('malformed, duplicated, oversized, and unsolicited image parts are rejected',async()=>{
  const image=new Blob([jpeg()],{type:'image/jpeg'});
  for(const entries of [[['blurred',image]],[['blurred',image],['blurred',image],['clear',image]],[['blurred',image],['clear',image],['original',image]],[['blurred',image],['clear',new Blob([jpeg()],{type:'image/png'})]],[['blurred',image],['clear',new Blob([new Uint8Array(portraitLimit+1)],{type:'image/jpeg'})]]]){
    await assert.rejects(parsePortraitUpload(...await multipart(entries),55,'serious'));
  }
  await assert.rejects(parsePortraitUpload(jpeg(),'image/jpeg',65,'anything'));
});
