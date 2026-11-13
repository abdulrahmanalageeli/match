import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
let code=await readFile(new URL('../api/signup-sms.ts',import.meta.url),'utf8');
code=code.replace(/import \{ createClient \}[^\n]+/,'const createClient=(...args)=>globalThis.__smsClient(...args);')
 .replace(/import \{ authenticaOtp \}[^\n]+/,'const authenticaOtp=(...args)=>globalThis.__smsOtp(...args);');
const handler=(await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(code)).toString('base64'))).default;
const configured={NISFAYN_SUPABASE_URL:'https://wupkifqbwhhebwrgvwai.supabase.co',NISFAYN_SERVICE_ROLE_KEY:'test-secret',AUTHENTICA_KEY:'test-authentica'};
let previous,calls,verified,providerFails,rateLimited;
test.beforeEach(()=>{
 previous=Object.fromEntries(Object.keys(configured).map(k=>[k,process.env[k]]));Object.assign(process.env,configured);
 calls=[];verified=true;providerFails=false;rateLimited=false;
 globalThis.__smsClient=()=>({rpc:async(name,args)=>{calls.push([args.action,args.payload]);return rateLimited?{error:{message:'rate_limited'}}:{data:args.action==='claim'?{phone:'+966500000001',lease:'server-lease'}:{duplicateDevice:true}};}});
 globalThis.__smsOtp=async(...args)=>{calls.push(['provider',args]);if(providerFails)throw Error('provider-secret-body');return verified;};
});
test.afterEach(()=>{for(const[k,v]of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v;delete globalThis.__smsClient;delete globalThis.__smsOtp;});
async function invoke(body={},headers={}){
 const res={code:0,body:null,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;},end(){return this;}};
 await handler({method:'POST',headers:{origin:'https://nisfayn-preview.vercel.app','x-vercel-forwarded-for':'192.0.2.1',...headers},body:{action:'send',email:'Test@example.com',phone:'+966500000000',deviceId:'web:11111111-1111-4111-8111-111111111111',consent:true,consentVersion:'signup-sms-device-v1',...body}},res);
 return res;
}
test('send reserves before provider and exposes only opaque proof and duplicate warning',async()=>{
 const result=await invoke();assert.equal(result.code,200);assert.match(result.body.proof,/^[a-f0-9]{64}$/);assert.equal(result.body.duplicateDevice,true);
 assert.deepEqual(calls.map(c=>c[0]),['start','provider','sent']);assert.notEqual(calls[0][1].proofHash,result.body.proof);assert.match(calls[0][1].deviceHash,/^[a-f0-9]{64}$/);assert.equal(calls[0][1].email,'test@example.com');
});
test('rejects origin, missing consent, and untrusted network before sending',async()=>{
 assert.equal((await invoke({}, {origin:'https://evil.example'})).code,403);assert.equal((await invoke({consent:false})).code,400);
 assert.equal((await invoke({}, {'x-vercel-forwarded-for':undefined})).code,503);assert.equal(calls.length,0);
});
test('verification uses server phone, leases attempts, and requires provider true',async()=>{
 verified=false;const result=await invoke({action:'verify',proof:'a'.repeat(64),otp:'123456',phone:'+966599999999'});
 assert.equal(result.code,422);assert.deepEqual(calls.find(c=>c[0]==='provider')[1],['verify','+966500000001','123456']);assert.equal(calls.find(c=>c[0]==='finish')[1].verified,false);
});
test('provider failures release verification lease without logging or marking success',async()=>{
 providerFails=true;const result=await invoke({action:'verify',proof:'a'.repeat(64),otp:'123456'});assert.equal(result.code,503);assert.deepEqual(result.body,{error:'unavailable'});assert.equal(calls.at(-1)[1].verified,false);
});
test('database rate limit prevents provider spend',async()=>{rateLimited=true;assert.equal((await invoke()).code,429);assert.ok(!calls.some(c=>c[0]==='provider'));});
test('only the two authorized phones finish signup proof without Authentica',async()=>{
 for(const phone of ['+966560899666','+966553576798']){
  calls=[];globalThis.__smsClient=()=>({rpc:async(name,args)=>{calls.push([args.action,args.payload]);return {data:args.action==='claim'?{phone,lease:'server-lease'}:{duplicateDevice:false}};}});
  const result=await invoke({phone});assert.equal(result.code,200);assert.equal(result.body.verified,true);
  assert.deepEqual(calls.map(c=>c[0]),['start','sent','claim','finish']);assert.equal(calls.at(-1)[1].verified,true);
 }
});
test('an exception cannot finish a proof bound to another phone',async()=>{
 const result=await invoke({phone:'+966560899666'});assert.equal(result.code,409);assert.ok(!calls.some(c=>c[0]==='finish'||c[0]==='provider'));
});
