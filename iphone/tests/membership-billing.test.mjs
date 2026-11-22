import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as pricing from '../src/membershipPricing.ts';

const code=ts.transpileModule(await readFile(new URL('../src/billing.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function bridge({native=true,wrongProduct=false,eligible=true,account='account-uuid',offerError=false,sandboxCheckout=false}={}) {
  const calls=[],exports={};
  let productId;
  const plugin={offer:async options=>{productId=options.productId;calls.push(['offer',options]);return {price:'localized Apple price',currency:'SAR',period:'شهر',introduction:'أسبوع مجاني',appleEligible:true,signedAppTransaction:'apple-app-jws',productId:wrongProduct?'legacy':options.productId};},purchase:async options=>{calls.push(['purchase',options]);return {jws:'signed'};}};
  const cloud={functions:{invoke:async(name,{body})=>{calls.push(['authorize',body]);return {error:offerError,data:{productId,eligible,sandboxCheckout,accountToken:account,eligibilityJws:'server-jws'}};}}};
  vm.runInNewContext(code,{exports,require:name=>name==='@capacitor/core'?{Capacitor:{isNativePlatform:()=>native,getPlatform:()=>native?'ios':'web'},registerPlugin:()=>plugin}:name==='./cloud'?{cloud}:pricing});
  return {api:exports,calls};
}
test('monthly Saudi pricing is gender-specific on all advertised surfaces',()=>{
  assert.deepEqual(pricing.MONTHLY_MEMBERSHIP_SAR,{man:149.99,woman:99.99});
  assert.match(pricing.membershipPriceLabel('man'),/١٤٩٫٩٩/);
  assert.match(pricing.membershipPriceLabel('woman'),/٩٩٫٩٩/);
  assert.match(pricing.membershipPriceLabel(),/للرجال.*للنساء/);
  assert.throws(()=>pricing.membershipProductId(),/ملفك/);
});
test('offer and purchase select the same product and bind the account token',async()=>{
  for(const gender of ['man','woman']) {
    const {api,calls}=bridge();
    assert.equal((await api.getMembershipOffer(gender)).price,'localized Apple price');
    assert.equal(await api.purchaseMembership('account-uuid',gender),'signed');
    assert.equal(calls[0][1].productId,pricing.MEMBERSHIP_PRODUCTS[gender]);
    const purchase=calls.find(([name])=>name==='purchase')[1];
    assert.equal(purchase.productId,pricing.MEMBERSHIP_PRODUCTS[gender]);
    assert.equal(purchase.accountToken,'account-uuid');
    assert.equal(purchase.eligibilityJws,'server-jws');
    assert.equal(calls.filter(([name])=>name==='authorize')[0][1].claim,false);
    assert.equal(calls.filter(([name])=>name==='authorize')[1][1].claim,true);
  }
});
test('an exhausted launch offer never silently converts a promised trial into a paid purchase',async()=>{
 const b=bridge({eligible:false});
 assert.equal((await b.api.getMembershipOffer('man')).trialEligible,false);
 await assert.rejects(b.api.purchaseMembership('account-uuid','man',true),b.api.MembershipOfferChangedError);
 assert.ok(!b.calls.some(([name])=>name==='purchase'));
 assert.equal(await b.api.purchaseMembership('account-uuid','man',false),'signed');
 const mismatch=bridge({account:'someone-else'});await assert.rejects(mismatch.api.purchaseMembership('account-uuid','woman'),/ربط/);
 const failed=bridge({offerError:true});await assert.rejects(failed.api.purchaseMembership('account-uuid','man'),/تعذّر/);
});

test('a changed storefront price requires a fresh offer before opening checkout',async()=>{
 const b=bridge();
 const displayed=await b.api.getMembershipOffer('woman');
 await assert.rejects(b.api.purchaseMembership('account-uuid','woman',true,{...displayed,price:'old price'}),b.api.MembershipOfferChangedError);
 await assert.rejects(b.api.purchaseMembership('account-uuid','woman',true,{...displayed,currency:'USD'}),b.api.MembershipOfferChangedError);
 assert.equal(b.calls.some(([name])=>name==='purchase'),false);
 assert.equal(await b.api.purchaseMembership('account-uuid','woman',true,displayed),'signed');
});
test('unknown gender, old native bridge and browser fail closed',async()=>{
  let b=bridge();await assert.rejects(b.api.purchaseMembership('account'),/ملفك/);assert.equal(b.calls.length,0);
  b=bridge({wrongProduct:true});await assert.rejects(b.api.getMembershipOffer('woman'),/حدّث/);
  b=bridge({native:false});await assert.rejects(b.api.getMembershipOffer('man'),/iPhone/);assert.equal(b.calls.length,0);
});
test('local StoreKit catalog and native product IDs match the advertised monthly plans',async()=>{
  const config=JSON.parse(await readFile(new URL('../ios/App/Wudayn.storekit',import.meta.url),'utf8'));
  const native=await readFile(new URL('../ios/App/App/AppleMembershipPlugin.swift',import.meta.url),'utf8');
  assert.equal(config.subscriptionGroups.length,2,'separate groups avoid opposite-gender crossgrades in Apple management');
  assert.equal(config.settings._storefront,'SAU');
  const plans=config.subscriptionGroups.flatMap(group=>group.subscriptions);
  assert.equal(plans.length,4);
  for(const gender of ['man','woman']) {
    const id=pricing.MEMBERSHIP_PRODUCTS[gender],plan=plans.find(p=>p.productID===id);
    assert.equal(Number(plan.displayPrice),pricing.MONTHLY_MEMBERSHIP_SAR[gender]);
    assert.equal(plan.recurringSubscriptionPeriod,'P1M');assert.equal(plan.familyShareable,false);
    assert.equal(plan.introductoryOffer.subscriptionPeriod,'P1W');assert.equal(plan.introductoryOffer.paymentMode,'free');
    assert.ok(native.includes(`"${id}": Decimal(string: "${plan.displayPrice}")`));
    const higher=plans.find(p=>p.productID===pricing.membershipProductId(gender,'seriousness'));
    assert.equal(Number(higher.displayPrice),pricing.SERIOUSNESS_MEMBERSHIP_SAR[gender]);
    assert.equal(higher.subscriptionGroupID,plan.subscriptionGroupID);
    assert.ok(higher.groupNumber<plan.groupNumber,'higher tier must be an upgrade in the same group');
    assert.equal(higher.introductoryOffer,undefined);
  }
});

test('higher-tier offer and checkout select the correct gender product',async()=>{
 for(const gender of ['man','woman']){
  const b=bridge({eligible:false});
  const offer=await b.api.getMembershipOffer(gender,'seriousness');
  assert.equal(offer.trialEligible,false);
  await b.api.purchaseMembership('account-uuid',gender,false,offer,'seriousness');
  const expected=pricing.membershipProductId(gender,'seriousness');
  assert.equal(b.calls.find(([kind])=>kind==='purchase')[1].productId,expected);
  assert.equal(b.calls.find(([kind])=>kind==='authorize')[1].productId,expected);
 }
});

test('sandbox-only checkout is confirmed again for each gender and plan before invoking StoreKit',async()=>{
 for(const gender of ['man','woman'])for(const plan of ['premium','seriousness']){
  const b=bridge({eligible:plan==='premium',sandboxCheckout:true});
  const offer=await b.api.getMembershipOffer(gender,plan);
  assert.equal(offer.sandboxCheckout,true);
  await b.api.purchaseMembership('account-uuid',gender,offer.trialEligible,offer,plan,true);
  assert.equal(b.calls.filter(([kind])=>kind==='authorize')[1][1].sandboxOnly,true);
  const purchase=b.calls.find(([kind])=>kind==='purchase')[1];
  assert.equal(purchase.currency,'SAR');assert.equal(purchase.productId,pricing.membershipProductId(gender,plan));
  const production=bridge();
  await assert.rejects(production.api.purchaseMembership('account-uuid',gender,false,offer,plan,true),production.api.MembershipOfferChangedError);
  assert.equal(production.calls.some(([kind])=>kind==='purchase'),false);
 }
});
