import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTestMedia,testMediaLimit} from '../functions/_shared/test-media.ts';
test('private uploads reject MIME spoofing, excessive size and invalid duration',()=>{
 assert.throws(()=>validateTestMedia(new TextEncoder().encode('<svg onload="alert(1)"/>'),'image/png'));
 const png=new Uint8Array(20);png.set([137,80,78,71,13,10,26,10]);assert.equal(validateTestMedia(png,'image/png').mime,'image/png');
 const webm=new Uint8Array(20);webm.set([0x1a,0x45,0xdf,0xa3]);assert.equal(validateTestMedia(webm,'audio/webm;codecs=opus','12000').duration,12);
 assert.throws(()=>validateTestMedia(webm,'audio/webm','61000'));
 assert.throws(()=>validateTestMedia(webm,'audio/webm','NaN'));
 const large=new Uint8Array(testMediaLimit+1);large.set(png);assert.throws(()=>validateTestMedia(large,'image/png'));
});
