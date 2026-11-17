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
