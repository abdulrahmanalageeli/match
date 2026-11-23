import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import ts from 'typescript';

const shared=await readFile(new URL('../supabase/functions/_shared/apple.ts',import.meta.url),'utf8');
const code=ts.transpileModule(shared,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const require=createRequire(import.meta.url);
const signed='aaa.bbb.ccc';
const gift={productId:'com.blindmatch.marriage.gift.premium.30d',bundleId:'com.blindmatch.marriage',environment:'Sandbox',
 type:'Consumable',quantity:1,appAccountToken:'order',transactionId:'101',signedDate:1000};
function endpoint(receipt=gift,outer='REFUND',signatureOK=true) {
 const calls=[], exports={};
 const env={APPLE_STORE_ENV:'Sandbox',SUPABASE_URL:'https://gifttest.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'localtest',
  APPLE_ROOT_CERTS_BASE64:Buffer.alloc(120).toString('base64')};
 class SignedDataVerifier {
  async verifyAndDecodeTransaction(){if(!signatureOK)throw Error('signature');return receipt;}
  async verifyAndDecodeNotification(){if(!signatureOK)throw Error('signature');return {notificationType:outer,signedDate:2000,data:{signedTransactionInfo:signed}};}
 }
 const modules={'npm:@apple/app-store-server-library@3.1.0':{SignedDataVerifier,Environment:{SANDBOX:'Sandbox',PRODUCTION:'Production'},VerificationStatus:{}},
  'npm:@supabase/supabase-js@2.112.2':{createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:{user:{id:'buyer'}}};}})}};
 vm.runInNewContext(code,{exports,Buffer,URL,Blob,Request,Response,Deno:{env:{get:key=>env[key]}},require:name=>modules[name]??require(name)});
 return {api:exports,calls};
}
test('only verified application consumables enter the gift ledger; subscriber entitlements keep their original handler',async()=>{
 const {api,calls}=endpoint();
 assert.equal((await api.ingest(signed,'buyer',false)).user.id,'buyer');
 assert.equal(calls[0].name,'wudayn_record_gift_receipt');assert.equal(calls[0].args.actor,'buyer');assert.equal(calls[0].args.event_at,1000);
 for(const substitute of [{quantity:2},{type:'Auto-Renewable Subscription'},{bundleId:'different'},{environment:'Production'},{appAccountToken:undefined},{transactionId:undefined}]){
  const e=endpoint({...gift,...substitute});await assert.rejects(e.api.ingest(signed,'buyer',false),{status:403});assert.equal(e.calls.length,0);
 }
 const invalid=endpoint(gift,'REFUND',false);await assert.rejects(invalid.api.ingest(signed,'buyer',false),{status:403});assert.equal(invalid.calls.length,0);
 const subscription=endpoint({...gift,productId:'com.blindmatch.marriage.monthly.men'});
 await subscription.api.ingest(signed,'buyer',false);assert.equal(subscription.calls[0].name,'marriage_apply_apple_event');
});
test('verified Apple notifications preserve refund ordering and ignore unrelated gift events',async()=>{
 for(const event of ['REFUND','REFUND_REVERSED','ONE_TIME_CHARGE','CONSUMPTION_REQUEST']){
  const {api,calls}=endpoint(gift,event);
  const request=new Request('https://example.test',{method:'POST',body:JSON.stringify({signedPayload:signed})});
  assert.equal((await api.notification(request)).ok,true);
  if(event==='CONSUMPTION_REQUEST'){assert.equal(calls.length,0);continue;}
  assert.equal(calls[0].args.actor,null);assert.equal(calls[0].args.event_type,event);assert.equal(calls[0].args.event_at,2000);
 }
});
