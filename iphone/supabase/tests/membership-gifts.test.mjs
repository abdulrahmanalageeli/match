import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';
import {seedCommunicationMember} from './communication-fixture.mjs';

test('gift invitation, exact verified number, explicit acceptance, StoreKit accounting and independent entitlements',async t=>{
 const db=await createDatabase();t.after(()=>db.close());
 const scalar=async(fn,args=[]) => (await db.query('select '+fn+' result',args)).rows[0].result;
 async function user(gender) {
  const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};
  await addUser(db,u);await seedCommunicationMember(db,u,gender);return u;
 }
 const a=await user('man'),b=await user('woman'),c=await user('woman');
 const member=(u,name,args=[])=>asMember(db,u.id,u.sessionId,()=>scalar('public.wudayn_'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+')',args));
 const state=u=>asMember(db,u.id,u.sessionId,()=>scalar('public.marriage_state()'));
 const prepare=(id,phone,peer=null,plan='premium')=>member(a,'prepare_gift',[id,plan,peer,phone]);
 const request=randomUUID();
 const no=await prepare(request,'0556507623');
 const mobile='+966556507624';
 await db.query("update auth.users set phone=$2,phone_confirmed_at=now() where id=$1",[b.id,mobile]);
 const yes=await prepare(randomUUID(),'٠٥٥ ٦٥٠ ٧٦٢٤');
 assert.deepEqual(Object.keys(yes),Object.keys(no));assert.equal(yes.productId,no.productId);
 assert.equal((await prepare(request,'0556507623')).orderToken,no.orderToken);
 assert.equal((await state(b)).giftInvitations,1);assert.deepEqual(await member(c,'received_gifts'),[]);
 assert.equal((await member(b,'received_gifts'))[0].senderName,'عضو اختبار');
 assert((await member(a,'sent_gifts')).every(g=>g.status==='waiting' && g.recipientName===null));
 await db.query("update auth.users set phone=$2,phone_confirmed_at=now() where id=$1",[c.id,'+966556507623']);
 assert.deepEqual(await member(c,'received_gifts'),[],'unregistered at invitation time cannot receive later');
 await assert.rejects(member(a,'gift_checkout',[yes.orderToken]),{code:'42501'});
 await assert.rejects(member(c,'accept_gift',[yes.orderToken]),{code:'42501'});
 await member(b,'accept_gift',[yes.orderToken]);assert.equal((await state(a)).giftsReady,1);
 const ready=(await member(a,'sent_gifts')).find(g=>g.id===yes.orderToken);
 assert.equal(ready.recipientHint,'•••• 7624');
 assert.equal(ready.status,'ready');assert.equal(ready.recipientName,'عضو اختبار');
 const first=await member(a,'gift_checkout',[yes.orderToken]);assert.notEqual(first.orderToken,yes.orderToken);
 assert.equal((await member(a,'sent_gifts')).find(g=>g.id===yes.orderToken).status,'paymentPending');
 await assert.rejects(member(a,'gift_checkout',[yes.orderToken]),{code:'P0001'});
 await member(a,'release_gift_checkout',[first.orderToken]);
 const checkout=await member(a,'gift_checkout',[yes.orderToken]);assert.equal(checkout.orderToken,first.orderToken);
 const receipt={transactionId:'101',type:'Consumable',quantity:1,environment:'Sandbox',bundleId:'com.blindmatch.marriage',
  productId:yes.productId,appAccountToken:checkout.orderToken,purchaseDate:Date.now()};
 const record=(actor,r,event='TRANSACTION',at=Date.now())=>asService(db,()=>scalar('public.wudayn_record_gift_receipt($1,$2,$3,$4)',[actor,r,event,at]));
 await assert.rejects(member(a,'record_gift_receipt',[a.id,receipt,'TRANSACTION',Date.now()]),{code:'42501'});
 await assert.rejects(record(c.id,receipt),{code:'42501'});
 await assert.rejects(record(a.id,{...receipt,appAccountToken:yes.orderToken}),{code:'42501'});
 await assert.rejects(record(a.id,{...receipt,productId:receipt.productId.replace('premium','seriousness')}),{code:'42501'});
 // A purchaser's own existing access is orthogonal to the gift product.
 await db.query("update marriage.members set manual_access_until=now()+interval '10 days' where id=$1",[a.id]);
 assert.equal((await record(a.id,receipt)).user.id,a.id);
 assert.equal((await state(b)).membershipNotice.source,'member');assert.equal((await state(b)).membership.tier,'premium');
 assert(Date.parse((await state(b)).currentMemberGiftUntil)>Date.now()+29*86400000);
 await record(null,receipt,'ONE_TIME_CHARGE');
 assert.equal(await scalar('(select count(*)::int from marriage.gift_purchases)'),1);
 await assert.rejects(member(a,'gift_checkout',[yes.orderToken]),{code:'42501'});
 assert.equal((await member(a,'sent_gifts')).find(g=>g.id===yes.orderToken).status,'delivered');
 // A second independently charged Apple transaction always gets its own term and refund ledger entry.
 await record(null,{...receipt,transactionId:'102'},'ONE_TIME_CHARGE');
 const periods=(await db.query('select starts_at,ends_at from marriage.gift_purchases order by transaction_id')).rows;
 assert.equal(+periods[0].ends_at,+periods[1].starts_at);assert.equal(+periods[1].ends_at- +periods[1].starts_at,30*86400000);
 const at=Date.now()+1000;
 await record(null,receipt,'REFUND',at);await record(a.id,receipt,'TRANSACTION',at+1);
 assert.equal(await scalar("(select revoked from marriage.gift_purchases where transaction_id='101')"),true);
 assert.equal((await state(b)).membershipNotice.kind,'end');
 await record(null,{...receipt,appAccountToken:undefined},'REFUND_REVERSED',at+2);
 await record(null,receipt,'REFUND',at);
 assert.equal(await scalar("(select revoked from marriage.gift_purchases where transaction_id='101')"),false);
 assert.equal((await state(a)).membership.active,true);
 const other=await prepare(randomUUID(),null,c.id,'seriousness');
 await member(c,'decline_gift',[other.orderToken]);
 assert.equal((await member(a,'sent_gifts')).find(g=>g.id===other.orderToken).status,'waiting');
 const serious=await prepare(randomUUID(),null,b.id,'seriousness');
 await member(b,'accept_gift',[serious.orderToken]);const order=await member(a,'gift_checkout',[serious.orderToken]);
 await db.query('insert into marriage.blocks(member_id,blocked_id) values($1,$2)',[b.id,a.id]);
 const payment={...receipt,transactionId:'103',productId:serious.productId,appAccountToken:order.orderToken};
 await record(null,payment,'ONE_TIME_CHARGE');
 const held=(await member(a,'sent_gifts')).find(g=>g.id===serious.orderToken);
 assert.equal(held.status,'processing');assert.equal(held.recipientName,null);
 assert.equal(await scalar("(select starts_at from marriage.gift_purchases where transaction_id='103')"),null);
 // A paid hold recovers without another charge after both parties regain eligibility.
 await db.query('delete from marriage.blocks where member_id=$1 and blocked_id=$2',[b.id,a.id]);
 await db.query("update marriage.members set manual_access_until=now()+interval '90 days' where id=$1",[b.id]);
 assert.equal((await member(a,'sent_gifts')).find(g=>g.id===serious.orderToken).status,'delivered');
 const upgraded=(await state(b)).membership;
 assert.equal(upgraded.tier,'seriousness');assert.equal(upgraded.expiresAt,upgraded.currentMemberGiftUntil);
 assert(Date.parse(upgraded.expiresAt)<Date.now()+31*86400000);
 await record(null,payment,'REFUND',at);assert.equal((await member(a,'sent_gifts')).find(g=>g.id===serious.orderToken).status,'refunded');
});
