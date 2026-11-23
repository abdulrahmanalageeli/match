import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {membershipProductId} from '../src/membershipPricing.ts';

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
test('the four gift SKUs match the monthly catalog by tier and gender and route to the gift ledger',async()=>{
 const catalog=JSON.parse(await readFile(new URL('../ios/App/Wudayn.storekit',import.meta.url),'utf8'));
 const swift=await readFile(new URL('../ios/App/App/AppleMembershipPlugin.swift',import.meta.url),'utf8');
 const mapping=Object.fromEntries([...swift.matchAll(/"(com\.blindmatch\.marriage\.gift\.[^"]+)": "(com\.blindmatch\.marriage\.monthly\.[^"]+)"/g)].map(([,gift,monthly])=>[gift,monthly]));
 const subscriptions=catalog.subscriptionGroups.flatMap(group=>group.subscriptions);
 assert.equal(catalog.settings._storefront,'SAU');
 assert.equal(catalog.products.length,4);
 assert.equal(new Set(catalog.products.map(p=>p.internalID)).size,4);
 assert.deepEqual(Object.keys(mapping).sort(),catalog.products.map(p=>p.productID).sort());
 for(const tier of ['premium','seriousness']){
  for(const gender of ['man','woman']){
   const productId='com.blindmatch.marriage.gift.'+tier+'.30d'+(gender==='woman'?'.women':'');
   const monthlyId=membershipProductId(gender,tier);
   const item=catalog.products.find(p=>p.productID===productId), monthly=subscriptions.find(p=>p.productID===monthlyId);
   assert.equal(mapping[productId],monthlyId);
   assert.equal(item.type,'Consumable');assert.equal(item.familyShareable,false);
   assert.equal(item.displayPrice,monthly.displayPrice);assert.equal(monthly.recurringSubscriptionPeriod,'P1M');
   const {api,calls}=endpoint({...gift,productId});
   await api.ingest(signed,'buyer',false);assert.equal(calls[0].name,'wudayn_record_gift_receipt');
   assert.equal(calls[0].args.receipt.productId,productId);
  }
 }
 const unknown=endpoint({...gift,productId:'com.blindmatch.marriage.gift.premium.30d.other'});
 await assert.rejects(unknown.api.ingest(signed,'buyer',false),{status:403});
 assert.equal(unknown.calls.length,0);
});

test('native offers and new purchases require the current storefront pair, with paid recovery before repricing',async()=>{
 const swift=await readFile(new URL('../ios/App/App/AppleMembershipPlugin.swift',import.meta.url),'utf8');
 const catalogLookup=swift.slice(swift.indexOf('private func giftProduct('),swift.indexOf('@objc func giftOffer('));
 assert.ok(catalogLookup.includes('Product.products(for: [id, monthlyID])'));
 assert.ok(catalogLookup.includes('$0.id == id && $0.type == .consumable'));
 assert.ok(catalogLookup.includes('$0.id == monthlyID && $0.type == .autoRenewable'));
 assert.ok(catalogLookup.includes('gift.price == monthly.price'));
 assert.ok(catalogLookup.includes('gift.priceFormatStyle.currencyCode == monthly.priceFormatStyle.currencyCode'));
 assert.ok(catalogLookup.includes('"OFFER_UNAVAILABLE"') && catalogLookup.includes('"OFFER_CHANGED"'));
 const offer=swift.slice(swift.indexOf('@objc func giftOffer('),swift.indexOf('@objc func pendingGifts('));
 assert.ok(offer.includes('guard let product = await giftProduct(call) else { return }'));
 const purchase=swift.slice(swift.indexOf('@objc func purchaseGift('),swift.indexOf('@objc func current('));
 const recovery=purchase.indexOf('Transaction.unfinished'), priceCheck=purchase.indexOf('guard let product = await giftProduct(call) else { return }'), charge=purchase.indexOf('product.purchase(');
 assert.ok(recovery>=0 && recovery<priceCheck && priceCheck<charge);
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
