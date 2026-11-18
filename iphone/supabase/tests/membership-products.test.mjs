import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {seedCommunicationMember} from './communication-fixture.mjs';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';

test('verified receipts enforce product eligibility, ownership, replay and revocation',async()=>{
  const db=await createDatabase();
  const rpc=async(sql,args=[])=>(await db.query('select '+sql+' as value',args)).rows[0].value;
  try {
    for(const gender of ['man','woman']) {
      const u={id:randomUUID(),sessionId:randomUUID(),email:`${gender}@example.test`};await addUser(db,u);
      await seedCommunicationMember(db,u,gender);
      const state=await asMember(db,u.id,u.sessionId,()=>rpc('public.marriage_state()'));
      const base={bundleId:'com.blindmatch.marriage',appAccountToken:state.user.appAccountToken,originalTransactionId:randomUUID(),transactionId:randomUUID(),signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox'};
      const right=`com.blindmatch.marriage.monthly.${gender==='man'?'men':'women'}`;
      const wrong=`com.blindmatch.marriage.monthly.${gender==='man'?'women':'men'}`;
      const record=(receipt,actor=u.id,notification=false)=>asService(db,()=>rpc('public.marriage_record_receipt($1,$2,$3)',[actor,receipt,notification]));
      await assert.rejects(record({...base,productId:wrong}),/نوع العضوية/);
      await assert.rejects(record({...base,productId:wrong},null,true),/نوع العضوية/);
      await assert.rejects(record({...base,productId:right},randomUUID()),/بهذا الحساب/);
      const receipt={...base,productId:right};assert.equal((await record(receipt)).membership.active,true);
      assert.equal((await record(receipt)).membership.active,true);
      await assert.rejects(record({...receipt,transactionId:randomUUID(),productId:wrong}),/نوع العضوية/);
      await assert.rejects(record({...receipt,productId:'other.app'}),/غير صالح/);
      assert.equal((await record({...receipt,signedDate:base.signedDate+100,revocationDate:Date.now()},null,true)).membership.active,false);
      assert.equal((await record(receipt)).membership.active,false,'old delivery cannot undo revocation');
      assert.equal((await record({...base,originalTransactionId:randomUUID(),transactionId:randomUUID(),productId:'com.blindmatch.marriage.monthly'})).membership.active,true,'legacy subscriptions still restore');
      const seriousness={...base,originalTransactionId:randomUUID(),transactionId:randomUUID(),productId:'com.blindmatch.marriage.monthly.seriousness'};
      assert.equal((await record(seriousness)).membership.active,true,'higher tier is valid for both genders');
      assert.equal((await record(seriousness)).membership.connectionLimit,3,'higher tier permits three simultaneous connections');
      assert.equal((await record(seriousness)).membership.tier,'seriousness');
      await assert.rejects(record({...seriousness,productId:right,signedDate:base.signedDate-1000}),/حساب آخر/,'a transaction cannot change product even on stale replay');
      await record({...seriousness,signedDate:base.signedDate+500,revocationDate:Date.now()},null,true);
      assert.equal((await record(seriousness)).membership.tier,'premium','old higher-tier replay cannot undo revocation');
      // A later signed update to an old transaction cannot mask another active higher-tier transaction.
      const renewal={...seriousness,transactionId:randomUUID(),signedDate:base.signedDate+600};
      await record(renewal);
      await record({...seriousness,signedDate:base.signedDate+700,revocationDate:Date.now()},null,true);
      assert.equal((await rpc('marriage.member_state($1)',[u.id])).membership.connectionLimit,3);
      const womenSeal={...base,originalTransactionId:randomUUID(),transactionId:randomUUID(),productId:'com.blindmatch.marriage.monthly.seriousness.women'};
      if(gender==='man')await assert.rejects(record(womenSeal),/نوع العضوية/);
      else assert.equal((await record(womenSeal)).membership.connectionLimit,3);
      assert.equal((await db.query('select product_id from marriage.store_transactions where transaction_id=$1',[seriousness.transactionId])).rows[0].product_id,seriousness.productId);
    }
  } finally { await db.close(); }
});

test('checkout requires a reachable real member; Apple grace, renewals and revocations survive replay', async () => {
  const db = await createDatabase();
  try {
    const member = { id: randomUUID(), email: 'apple@example.test', sessionId: randomUUID() };
    const peer = { id: randomUUID(), email: 'viewer@example.test', sessionId: randomUUID() };
    await addUser(db, member); await addUser(db, peer);
    const token = await seedCommunicationMember(db, member, 'man');
    await seedCommunicationMember(db, peer, 'woman');
    const read = user => asMember(db,user.id,user.sessionId,async () => (await db.query('select public.marriage_state() s')).rows[0].s.membership);
    const original = '700000001', now = Date.now();
    const tx = {originalTransactionId:original, transactionId:'700000002', appAccountToken:token,
      bundleId:'com.blindmatch.marriage', productId:'com.blindmatch.marriage.monthly.seriousness',
      environment:'Sandbox', purchaseDate:now-86400000, expiresDate:now-1000, signedDate:now};
    const lifecycle = {originalTransactionId:original, status:4, observedAt:now, gracePeriodExpiresDate:now+86400000,
      isInBillingRetryPeriod:true, autoRenewStatus:1};
    const eventSQL = 'select public.marriage_apply_apple_event(null,$1,true,$2) s';
    const apply = (receipt,snapshot) => asService(db,async () => (await db.query(eventSQL,[receipt,snapshot])).rows[0].s);
    const periods = user => asMember(db,user.id,user.sessionId,async()=> (await db.query('select public.marriage_my_settings() s')).rows[0].s.subscriptions);
    assert.equal((await read(peer)).canStart,false);
    await assert.rejects(asMember(db,peer.id,peer.sessionId,()=>db.query(eventSQL,[tx,lifecycle])),{code:'42501'});
    assert.equal((await apply(tx,lifecycle)).membership.status,'paid');
    assert.equal((await read(peer)).canStart,true);
    await db.query('update marriage.members set is_dummy=true where id=$1',[member.id]);
    assert.equal((await read(peer)).canStart,false);
    await db.query('update marriage.members set is_dummy=false where id=$1',[member.id]);
    const renewed = {...tx,transactionId:'700000003',purchaseDate:now+1,signedDate:now+2,expiresDate:now+900000,offerDiscountType:'FREE_TRIAL'};
    const renewing = {...lifecycle,observedAt:now+2,status:1,autoRenewStatus:1,gracePeriodExpiresDate:null,isInBillingRetryPeriod:false,renewalPrice:149990,currency:'SAR',renewalDate:renewed.expiresDate};
    await apply(renewed,renewing);
    const [trial]=await periods(member);
    assert.equal(trial.freeTrial,true);assert.equal(trial.autoRenew,true);assert.equal(trial.milliunits,149990);
    assert.equal(trial.currency,'SAR');assert.equal(Date.parse(trial.renewalDate),renewed.expiresDate);
    assert.deepEqual(await periods(peer),[]);
    const stopped = {...renewing,observedAt:now+3,autoRenewStatus:0};
    assert.equal((await apply(renewed,stopped)).membership.active,true);
    assert.equal(Date.parse((await apply(tx,lifecycle)).membership.expiresAt),renewed.expiresDate);
    const [cancelled]=await periods(member);
    assert.equal(cancelled.autoRenew,false);assert.equal(cancelled.milliunits,null);
    assert.equal(Date.parse(cancelled.endsAt),renewed.expiresDate);
    await apply({...tx,signedDate:now+4,revocationDate:now+4},{...stopped,observedAt:now+4,status:5});
    assert.equal((await read(member)).active,true);
    const revoked = {...renewed,signedDate:now+6,revocationDate:now+5};
    delete revoked.appAccountToken;
    assert.equal((await apply(revoked,{...stopped,status:5,observedAt:now+6})).membership.status,'expired');
    assert.equal((await apply(renewed,stopped)).membership.active,false);
    assert.deepEqual(await periods(member),[]);
    assert.equal((await read(peer)).canStart,false);
    await asService(db,async () => {
      const claim = () => db.query("select public.marriage_claim_apple_checks('Sandbox') id");
      assert.deepEqual((await claim()).rows,[{id:original}]); assert.equal((await claim()).rows.length,0);
      await db.query('select public.marriage_finish_apple_check($1)',[original]);
    });
    assert.equal((await db.query('select check_after>now()+interval \'5 hours\' checked from marriage.subscription_owners')).rows[0].checked,true);
  } finally { await db.close(); }
});
