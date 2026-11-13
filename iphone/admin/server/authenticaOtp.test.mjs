import test from 'node:test';
import assert from 'node:assert/strict';
import {authenticaOtp} from './authenticaOtp.ts';
test('documented SMS send and verification response contracts; credentials never leave server origin',async()=>{
 const previous=process.env.AUTHENTICA_KEY;process.env.AUTHENTICA_KEY='unit-key';
 try{
  assert.equal(await authenticaOtp('send','+966500000001',undefined,async(url,init)=>{
   assert.equal(url,'https://api.authentica.sa/api/v2/send-otp');assert.equal(init.redirect,'error');assert.equal(init.headers['X-Authorization'],'unit-key');
   assert.deepEqual(JSON.parse(init.body),{method:'sms',phone:'+966500000001'});return Response.json({success:true});
  }),true);
  assert.equal(await authenticaOtp('verify','+966500000001','123456',async(url,init)=>{
   assert.equal(url,'https://api.authentica.sa/api/v2/verify-otp');assert.deepEqual(JSON.parse(init.body),{phone:'+966500000001',otp:'123456'});return Response.json({status:true});
  }),true);
  assert.equal(await authenticaOtp('verify','+966500000001','123456',async()=>Response.json({status:false})),false);
  for(const response of [{success:true},{status:'true'},{}])await assert.rejects(authenticaOtp('verify','+966500000001','123456',async()=>Response.json(response)),/unavailable/);
  await assert.rejects(authenticaOtp('send','+966500000001',undefined,async()=>{throw Error('secret provider body');}),e=>e.message==='unavailable');
 }finally{if(previous===undefined)delete process.env.AUTHENTICA_KEY;else process.env.AUTHENTICA_KEY=previous;}
});
