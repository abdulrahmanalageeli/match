import test from 'node:test';
import assert from 'node:assert/strict';
import {assertVerificationActionAllowed,readVerificationBody,validateVerificationFile,validVerificationPath,verificationLimit} from '../functions/_shared/verification-media.ts';

test('document collection actions are restricted while history and review remain available',()=>{
 for(const action of ['prepare','upload','submit']) assert.throws(()=>assertVerificationActionAllowed(action),e=>e.status===403 && e.code==='verification_submission_restricted');
 for(const action of ['state','list','evidence','withdraw']) assert.doesNotThrow(()=>assertVerificationActionAllowed(action));
});
test('evidence rejects mismatched bytes, non-allowed formats, oversized and deceptive streamed bodies',async()=>{
 const pdf=new TextEncoder().encode('%PDF-1.7\n%%EOF');validateVerificationFile(pdf,'application/pdf',pdf.length);
 validateVerificationFile(new Uint8Array([255,216,255]),'image/jpeg',3);
 validateVerificationFile(new Uint8Array([137,80,78,71,13,10,26,10]),'image/png',8);
 for(const mime of ['text/html','image/svg+xml','image/jpeg','image/png'])assert.throws(()=>validateVerificationFile(pdf,mime,pdf.length));
 assert.throws(()=>validateVerificationFile(pdf,'application/pdf',100));assert.throws(()=>validateVerificationFile(new Uint8Array(verificationLimit+1),'application/pdf',verificationLimit+1));
 const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(8));c.enqueue(new Uint8Array(8));c.close();}});
 await assert.rejects(readVerificationBody(new Request('https://example.test',{method:'POST',body,duplex:'half'}),10),e=>e.status===413);
 const request=new Request('https://example.test',{method:'POST',body:pdf});assert.deepEqual(await readVerificationBody(request,100),pdf);
 assert(!validVerificationPath('../../document.pdf'));assert(!validVerificationPath('https://example.test/document.pdf'));
 assert(validVerificationPath('11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.pdf'));
});
