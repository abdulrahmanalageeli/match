import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { seedCommunicationMember } from './communication-fixture.mjs';
import { addUser, asMember, asService, createDatabase } from './harness.mjs';

test('receipt recording accepts the four configured products and legacy renewals only', async () => {
  const db = await createDatabase();
  try {
    const member = { id: randomUUID(), email: 'membership-test@example.test', sessionId: randomUUID() };
    await addUser(db, member);
    const appAccountToken = await seedCommunicationMember(db, member, 'woman');
    const prefix = 'com.blindmatch.marriage.monthly';
    async function record(productId) {
      const receipt = {
        bundleId: 'com.blindmatch.marriage', productId, appAccountToken,
        originalTransactionId: randomUUID(), transactionId: randomUUID(),
        signedDate: Date.now(), expiresDate: Date.now() + 86_400_000, environment: 'Sandbox',
      };
      const result = await asService(db, () => db.query(
        'select public.marriage_record_receipt($1,$2,false) as state', [member.id, receipt],
      ));
      return result.rows[0].state;
    }

    for (const suffix of ['', '.men', '.women', '.seriousness', '.seriousness.women']) {
      assert.equal((await record(prefix + suffix)).membership.active, true);
    }
    await assert.rejects(record(prefix + '.unknown'), { code: '22023' });
    await assert.rejects(record(undefined), { code: '22023' });
  } finally {
    await db.close();
  }
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
