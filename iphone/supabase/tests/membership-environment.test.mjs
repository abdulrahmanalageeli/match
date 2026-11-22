import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {addUser,asMember,asService,createDatabase} from './harness.mjs';
import {seedCommunicationMember} from './communication-fixture.mjs';

const code=ts.transpileModule(await readFile(new URL('../functions/_shared/apple.ts',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const production='wupkifqbwhhebwrgvwai.supabase.co';
const staging='isolatedfixture.supabase.co';
const bundleId='com.blindmatch.marriage';

// Model the Apple library boundary with known signed payloads. The account,
// launch offer, entitlement and discovery queries below run against PostgreSQL.
function verifier(environment,host,db) {
  const payloads=new Map(),writes=[],api={};
  const env={APPLE_STORE_ENV:environment,SUPABASE_URL:'https://'+host,APPLE_APP_ID:'12345',
    APPLE_ROOT_CERTS_BASE64:Buffer.alloc(130).toString('base64'),SUPABASE_SERVICE_ROLE_KEY:'fixture'};
  function decode(key){if(!payloads.has(key))throw Error('Unknown signature');return payloads.get(key);}
  class SignedDataVerifier {
    constructor(_roots,online,expected,bundle){assert.equal(online,true);assert.equal(expected,environment);assert.equal(bundle,bundleId);}
    verifyAndDecodeAppTransaction=decode;
    verifyAndDecodeTransaction=decode;
  }
  const rpc=async(name,{actor,receipt,notification,lifecycle})=>{
    assert.equal(name,'marriage_apply_apple_event');writes.push(receipt);
    const result=await asService(db,()=>db.query('select public.marriage_apply_apple_event($1,$2,$3,$4) s',[actor,receipt,notification,lifecycle]));
    return {data:result.rows[0].s,error:null};
  };
  vm.runInNewContext(code,{exports:api,Deno:{env:{get:name=>env[name]}},Buffer,URL,require:name=>
    name.includes('app-store-server-library')?{SignedDataVerifier,Environment:{SANDBOX:'Sandbox',PRODUCTION:'Production'},VerificationStatus:{}}:
    name.includes('supabase-js')?{createClient:()=>({rpc})}:name==='node:buffer'?{Buffer}:{}});
  return {api,writes,signed:payload=>{const key='fixture.'+randomUUID()+'.signature';payloads.set(key,payload);return key;}};
}

test('both new sandbox members can buy and discover each other in an isolated database',async()=>{
  const db=await createDatabase();
  const service=verifier('Sandbox',staging,db);
  const memberQuery=(member,sql,args=[])=>asMember(db,member.id,member.sessionId,async()=> (await db.query(sql,args)).rows[0].s);
  try{
    const members=[];
    for(const gender of ['man','woman']){
      const member={gender,id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};
      await addUser(db,member);member.accountToken=await seedCommunicationMember(db,member,gender);members.push(member);
    }
    for(const member of members){
      const state=await memberQuery(member,'select public.marriage_state() s');
      assert.equal(state.membership.canStart,false);assert.equal(state.membership.status,'free');
    }
    for(const [index,member] of members.entries()){
      const app=await service.api.verifyAppPurchase(service.signed({bundleId,receiptType:'Sandbox',appTransactionId:String(12345+index)}));
      assert.equal(app.sandbox,true);
      const offer=await asService(db,async()=> (await db.query('select public.marriage_prepare_launch_offer($1,$2,false) s',[member.id,app.id])).rows[0].s);
      assert.equal(offer.accountToken,member.accountToken);
      const plan=index===0?offer.productId:'com.blindmatch.marriage.monthly.seriousness.women';
      const now=Date.now();
      const transaction=service.signed({bundleId,productId:plan,appAccountToken:member.accountToken,appTransactionId:app.id,
        environment:'Sandbox',originalTransactionId:String(300001+index),transactionId:String(400001+index),
        purchaseDate:now,signedDate:now,expiresDate:now+86400000});
      const paid=await service.api.ingest(transaction,member.id,false);
      assert.equal(paid.membership.active,true);assert.equal(paid.membership.tier,index===0?'premium':'seriousness');
    }
    for(const [index,member] of members.entries()){
      const cards=await memberQuery(member,'select public.marriage_browse($1) s',[{mode:'all'}]);
      assert.deepEqual(cards.map(card=>card.id),[members[1-index].id]);
    }
  }finally{await db.close();}
});

test('wrong-environment, unsigned, and sandbox-on-production evidence cannot activate memberships',async()=>{
  for(const [configured,host,evidence,status] of [
    ['Production',production,'Sandbox',403],['Sandbox',staging,'Production',403],
    ['Sandbox',production,'Sandbox',503],['Sandbox','xytwdgiihfmxiflwuxti.supabase.co','Sandbox',503],
    ['Sandbox','custom.example.test','Sandbox',503]
  ]){
    const service=verifier(configured,host);
    const download=service.signed({bundleId,receiptType:evidence,appTransactionId:'12345'});
    await assert.rejects(service.api.verifyAppPurchase(download),{status});
    const transaction=service.signed({bundleId,environment:evidence,productId:bundleId+'.monthly.men',appAccountToken:randomUUID()});
    for(const notification of [true,false])await assert.rejects(service.api.ingest(transaction,randomUUID(),notification),{status});
    assert.equal(service.writes.length,0);
  }
  const service=verifier('Sandbox',staging);
  await assert.rejects(service.api.verifyAppPurchase('unknown.test.signature'),{status:403});
  await assert.rejects(service.api.ingest('unknown.test.signature',randomUUID(),false),{status:403});
  assert.equal(service.writes.length,0);
});
