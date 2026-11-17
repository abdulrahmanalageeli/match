import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source=await readFile(new URL('../supabase/functions/membership-offer/index.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
function endpoint({eligible=true,hasKey=true}={}){
 let handler;const calls=[];
 class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
 const shared={HttpError,endpoint:fn=>fn,currentUser:async()=> 'member',readBody:async req=>req,
  verifyAppPurchase:async signed=>{if(signed!=='verified-app')throw new HttpError(403,'invalid Apple signature');return '12345';},
  admin:()=>({rpc:async(name,args)=>{calls.push(args);return {data:{eligible,productId:'com.blindmatch.marriage.monthly.men',accountToken:'owner'},error:null};}})};
 const env={APPLE_IAP_PRIVATE_KEY:hasKey?privateKey.export({type:'pkcs8',format:'pem'}):undefined,APPLE_IAP_KEY_ID:'key-id',APPLE_IAP_ISSUER_ID:'issuer'};
 vm.runInNewContext(code,{exports:{},crypto,Buffer,Deno:{env:{get:key=>env[key]},serve:fn=>{handler=fn;}},require:name=>name==='node:crypto'?crypto:name==='node:buffer'?{Buffer}:shared});
 return {run:body=>handler(body),calls};
}
test('Apple eligibility signatures use server allocation, verified transaction and correct ES256 claims',async()=>{
 const e=endpoint();const preview=await e.run({signedAppTransaction:'verified-app',appleEligible:true,claim:false});
 assert.equal(preview.eligible,true);assert.equal(preview.eligibilityJws,undefined);assert.equal(e.calls[0].claim,false);
 const result=await e.run({signedAppTransaction:'verified-app',appleEligible:true,claim:true,gender:'woman',productId:'forged'});
 const [header,payload,signature]=result.eligibilityJws.split('.'),claims=JSON.parse(Buffer.from(payload,'base64url'));
 assert.equal(JSON.parse(Buffer.from(header,'base64url')).alg,'ES256');
 assert.equal(claims.aud,'introductory-offer-eligibility');assert.equal(claims.transactionId,'12345');assert.equal(claims.productId,'com.blindmatch.marriage.monthly.men');
 assert.equal(claims.allowIntroductoryOffer,true);assert.equal(claims.exp,undefined);
 assert.equal(verify('sha256',Buffer.from(header+'.'+payload),{key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url')),true);
 const exhausted=await endpoint({eligible:false}).run({signedAppTransaction:'verified-app',appleEligible:true,claim:true});
 assert.equal(JSON.parse(Buffer.from(exhausted.eligibilityJws.split('.')[1],'base64url')).allowIntroductoryOffer,false);
 const appleIneligible=endpoint();await appleIneligible.run({signedAppTransaction:'verified-app',appleEligible:false,claim:true});assert.equal(appleIneligible.calls[0].claim,false);
});
test('invalid Apple evidence and missing signing configuration cannot consume a trial place',async()=>{
 const invalid=endpoint();await assert.rejects(invalid.run({signedAppTransaction:'forged',claim:true}));assert.equal(invalid.calls.length,0);
 const unconfigured=endpoint({hasKey:false});await assert.rejects(unconfigured.run({signedAppTransaction:'verified-app',claim:true}));assert.equal(unconfigured.calls.length,0);
});
