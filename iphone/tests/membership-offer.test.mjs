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
function endpoint({eligible=true,hasKey=true,sandbox=false,promotion=null,gender='man',user={},membership={}}={}){
 let handler;const calls=[];
 class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
 const shared={HttpError,endpoint:fn=>fn,currentMemberState:async()=>({
   user:{id:'member',applicationStatus:'approved',paused:false,profileReviewPending:false,...user},
   membership:{status:'free',active:false,canStart:true,tier:'free',...membership}}),readBody:async req=>req,
  verifyAppPurchase:async signed=>{if(signed!=='verified-app')throw new HttpError(403,'invalid Apple signature');return {id:'12345',sandbox};},
  admin:()=>({rpc:async(name,args)=>{calls.push(args);if(name==='wudayn_eligible_promotion')return {data:promotion,error:null};return {data:{eligible,productId:'com.blindmatch.marriage.monthly.'+(gender==='woman'?'women':'men'),accountToken:'owner'},error:null};}})};
 const env={APPLE_IAP_PRIVATE_KEY:hasKey?privateKey.export({type:'pkcs8',format:'pem'}):undefined,APPLE_IAP_KEY_ID:'key-id',APPLE_IAP_ISSUER_ID:'issuer'};
 vm.runInNewContext(code,{exports:{},crypto,Buffer,Deno:{env:{get:key=>env[key]},serve:fn=>{handler=fn;}},require:name=>name==='node:crypto'?crypto:name==='node:buffer'?{Buffer}:shared});
 return {run:body=>handler(body),calls};
}
test('a returning member receives a signed StoreKit discount and a withdrawn offer cannot fall back to full price',async()=>{
 const req={signedAppTransaction:'verified-app',productId:'com.blindmatch.marriage.monthly.men',appleEligible:false,promotionIds:['return2026']};
 const active=endpoint({eligible:false,promotion:'return2026',membership:{status:'expired'}});
 const quote=await active.run(req);
 assert.equal(quote.promotionId,'return2026');assert.equal(quote.promotionJws,undefined);
 const checkout=await active.run({...req,claim:true,expectedPromotion:'return2026'});
 const [header,payload,signature]=checkout.promotionJws.split('.'),claims=JSON.parse(Buffer.from(payload,'base64url'));
 assert.equal(claims.aud,'promotional-offer');assert.equal(claims.offerIdentifier,'return2026');assert.equal(claims.transactionId,'12345');
 assert.equal(claims.productId,req.productId);assert.equal(checkout.eligible,false);
 assert(verify('sha256',Buffer.from(header+'.'+payload),{key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url')));
 const revoked=await endpoint({eligible:false}).run({...req,claim:true,expectedPromotion:'return2026'});
 assert.equal(revoked.promotionChanged,true);assert.equal(revoked.eligibilityJws,undefined);
 assert.equal((await active.run({...req,promotionIds:['different-storefront']})).promotionId,null);
});

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

test('first purchase can use a verified sandbox app download before any paid peer or purchase exists',async()=>{
 for(const gender of ['man','woman'])for(const plan of ['premium','seriousness']){
  const e=endpoint({sandbox:true,gender,membership:{canStart:false}});
  const productId='com.blindmatch.marriage.monthly.'+(plan==='premium'?(gender==='man'?'men':'women'):(gender==='man'?'seriousness':'seriousness.women'));
  const request={productId,signedAppTransaction:'verified-app',appleEligible:true};
  const preview=await e.run({...request,claim:false});assert.equal(preview.sandboxCheckout,true);
  const claim=await e.run({...request,claim:true,sandboxOnly:true});
  assert.equal(claim.productId,productId);assert.equal(claim.accountToken,'owner');
  assert.equal(claim.eligible,plan==='premium');
  assert.equal(e.calls[1].apple_transaction,'12345');
 }
});
test('requests cannot grant themselves sandbox checkout or override account approval',async()=>{
 const request={signedAppTransaction:'verified-app',sandboxCheckout:true,environment:'Sandbox',claim:true};
 for(const setup of [{},{sandbox:true,user:{paused:true}},{sandbox:true,user:{applicationStatus:'submitted'}},
   {sandbox:true,user:{profileReviewPending:true}},{sandbox:true,membership:{status:'paid'}}]){
  const e=endpoint({...setup,membership:{canStart:false,...setup.membership}});
  await assert.rejects(e.run(request),{status:403});assert.equal(e.calls.length,0);
 }
 const production=endpoint();await assert.rejects(production.run({...request,sandboxOnly:true}),{status:403});
 const premium=endpoint({membership:{canStart:false,active:true,tier:'premium',status:'paid'}});
 const upgrade=await premium.run({...request,productId:'com.blindmatch.marriage.monthly.seriousness'});
 assert.equal(upgrade.sandboxCheckout,false);assert.equal(upgrade.productId,'com.blindmatch.marriage.monthly.seriousness');
});
