import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';
import {seedCommunicationMember} from './communication-fixture.mjs';

test('member receipts survive sign-out, and campaigns apply only to returning members with verified receipts',async t=>{
 const db=await createDatabase();t.after(()=>db.close());
 const user=async(gender)=>{
  const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};await addUser(db,u);
  await seedCommunicationMember(db,u,gender);return u;
 };
 const target=await user('man'),other=await user('woman'),owner=await user('woman');
 const member=(u,fn)=>asMember(db,u.id,u.sessionId,fn);
 const scalar=async(sql,args=[]) => (await db.query('select '+sql+' result',args)).rows[0].result;
 const notice=u=>member(u,()=>scalar("public.marriage_state()->'membershipNotice'"));
 const ack=(u,id)=>member(u,()=>scalar('public.wudayn_ack_membership_notice($1)',[id]));
 await db.query("insert into marriage.admin_membership_grants values($1,'seriousness',now()+interval '2 days')",[target.id]);
 let receipt=await notice(target);assert.equal(receipt.kind,'grant');assert.equal(receipt.tier,'seriousness');
 assert.equal((await notice(target)).id,receipt.id);assert.equal(await notice(other),null);
 await ack(other,receipt.id);assert.equal((await notice(target)).id,receipt.id);
 await ack(target,receipt.id);assert.equal(await notice(target),null);
 await db.query("update marriage.admin_membership_grants set expires_at=expires_at+interval '1 day' where member_id=$1",[target.id]);
 receipt=await notice(target);assert.equal(receipt.kind,'extend');assert(Date.parse(receipt.endsAt)>Date.now()+2*86400000);
 await db.query("insert into marriage.scheduled_grants values($1,'premium',now()+interval '4 days',now()+interval '10 days')",[target.id]);
 receipt=await notice(target);assert.equal(receipt.source,'scheduled');assert.equal(receipt.tier,'premium');assert(Date.parse(receipt.startsAt)>Date.now());
 await db.query('delete from marriage.admin_membership_grants where member_id=$1',[target.id]);
 assert.equal((await notice(target)).kind,'end');

 const product='com.blindmatch.marriage.monthly.men';
 const promo=(u,prod=product,env='Production')=>asService(db,()=>scalar('public.wudayn_eligible_promotion($1,$2,$3)',[u.id,prod,env]));
 const configure=(revision,id,end)=>scalar('public.wudayn_admin_promotion($1,$2,$3,$4)',[product,revision,id,end]);
 const until=new Date(Date.now()+86400000).toISOString();
 await assert.rejects(member(target,()=>configure(0,'back',until)),{code:'42501'});
 await db.query("insert into marriage.staff_accounts(user_id,display_name,role) values($1,'مالك','owner')",[owner.id]);
 const asOwner=fn=>member(owner,async()=>{
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:owner.id,session_id:owner.sessionId,role:'authenticated',aal:'aal2'})]);
  return fn();
 });
 assert.equal((await asOwner(()=>configure(0,'back',until))).revision,1);
 await assert.rejects(asOwner(()=>configure(0,null,null)),{code:'40001'});
 assert.equal(await promo(target),null);
 await db.query("insert into marriage.subscription_owners(original_id,member_id) values('old',$1)",[target.id]);
 await db.query("insert into marriage.store_transactions(transaction_id,original_id,expires_at,signed_at,revoked,environment,product_id) values('oldtx','old',now()-interval '2 days',now()-interval '32 days',false,'Production',$1)",[product]);
 assert.equal(await promo(target),'back');assert.equal(await promo(target,product,'Sandbox'),null);
 const account=await scalar('(select app_account_token from marriage.members where id=$1)',[target.id]);
 const now=Date.now();
 const purchase={originalTransactionId:'old',transactionId:'newtx',bundleId:'com.blindmatch.marriage',productId:product,
  environment:'Production',appAccountToken:account,signedDate:now,expiresDate:now+30*86400000,offerType:2,offerIdentifier:'back'};
 const result=await asService(db,()=>scalar('public.marriage_apply_apple_event($1,$2,false,null)',[target.id,purchase]));
 assert.equal(result.membershipNotice.promotion,true);
 assert.equal(await promo(target),null);
 assert.equal((await notice(target)).kind,'apple');
 await db.query("insert into marriage.admin_membership_grants values($1,'seriousness',now()+interval '1 day')",[target.id]);
 const overlap=await member(target,()=>scalar('public.marriage_state()'));
 assert.equal(overlap.membership.status,'paid');assert.equal(overlap.membership.tier,'seriousness');
 assert(Date.parse(overlap.currentGiftUntil)<Date.now()+2*86400000);
 await db.query('delete from marriage.admin_membership_grants where member_id=$1',[target.id]);
 await db.query("update marriage.store_transactions set expires_at=now()-interval '1 day' where transaction_id='newtx'");
 assert.equal(await promo(target),null,'a verified redemption is honoured after access expires');
 assert.equal(await promo(other),null);await asOwner(()=>configure(1,null,null));
 assert.equal(await promo(target),null);
});
