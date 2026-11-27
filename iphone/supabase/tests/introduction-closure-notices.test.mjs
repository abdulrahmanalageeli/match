import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {addUser, asMember, asService, createDatabase} from './harness.mjs';
import {seedCommunicationMember, signCommunicationAgreement} from './communication-fixture.mjs';

test('voluntary closure sends one private, actionable receipt to the other member for every closure choice', async () => {
  const db = await createDatabase();
  const query = async (sql, args = []) => (await db.query('select ' + sql + ' as v', args)).rows[0].v;
  const call = (member, sql, args) => asMember(db,member.id,member.sessionId,()=>query(sql,args));
  const service = (sql,args) => asService(db,()=>query(sql,args));
  async function add(gender) {
    const member = {id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};
    await addUser(db,member);
    await seedCommunicationMember(db,member,gender);
    await db.query("update marriage.members set manual_access_until=now()+interval '1 day' where id=$1",[member.id]);
    await call(member,"public.marriage_push_register($1,'sandbox',$2)",[member.id.replaceAll('-','').repeat(2),randomUUID()]);
    await call(member,'public.marriage_push_enable(true)');
    return member;
  }
  try {
    const outsider = await add('woman');
    for (const [context, contact] of [['general',null],['pact',null],['pact','with-close'],['general','pre-shared']]) {
      const man = await add('man'), woman = await add('woman');
      const id = await call(man,'public.marriage_request($1)',[woman.id]);
      await call(woman,"public.marriage_act($1,'accept')",[id]);
      const close = (who, reason, phone=null) => call(who,'public.marriage_close_introduction($1,$2,false,$3)',[id,reason,phone]);
      await assert.rejects(close(woman,'pact'));
      await assert.rejects(close(outsider,'general'));
      await assert.rejects(close(woman,'other'));
      if (context === 'pact' || contact) await signCommunicationAgreement(call,woman,man,id);
      if (context === 'pact' && !contact) {
        const offer = await call(man,"public.marriage_journey_choice($1,'exclusive','propose')",[id]);
        const state = await call(woman,"public.marriage_journey_choice($1,'exclusive','accept',$2)",[id,offer.exclusiveId]);
        assert.equal(state.exclusive,true);
        assert.equal(await query('marriage.pact_exclusive($1)',[id]),true);
      }
      if (contact === 'pre-shared') {
        await db.query("update marriage.conversation_agreements set data=jsonb_set(data,'{deadline}',to_jsonb(now()-interval '1 day')) where request_id=$1",[id]);
        await call(woman,"public.marriage_share_family_contact($1,'0551234567',false,false)",[id]);
      }
      const sender = contact === 'with-close' || context === 'general' && !contact ? woman : man;
      const recipient = sender === woman ? man : woman;
      const phone = contact === 'with-close' ? '0551234567' : null;
      await close(sender,context,phone);
      await close(sender,context,phone);
      assert.equal(await query('marriage.pact_exclusive($1)',[id]),false);
      await assert.rejects(close(recipient,context,phone));
      const notices = async member => (await call(member,'public.marriage_push_updates(null)'))
        .filter(row=>row.event==='introduction:closed' && row.target===id);
      const received = await notices(recipient);
      assert.equal(received.length,1);
      assert.equal(received[0].closureContext,context);
      assert.equal(received[0].hasFamilyContact,Boolean(contact));
      assert.equal((await notices(sender)).length,0);
      assert.equal((await notices(outsider)).length,0);
      const history = await call(recipient,'public.marriage_request_history_item($1)',[received[0].target]);
      assert.deepEqual([history.id,history.closureContext,history.hasFamilyContact],[id,context,Boolean(contact)]);
      assert.ok(!JSON.stringify([received,history]).includes('551234567'));
      assert.equal(await call(recipient,'public.marriage_family_contact($1)',[id]),contact ? '+966551234567' : null);

      const jobs = (await db.query("select id, member_id from marriage.push_outbox where event_key='introduction:closed:'||$1::text",[id])).rows;
      assert.deepEqual(jobs.map(row=>row.member_id),[recipient.id]);
      const claimed = await service("public.marriage_push_claim('sandbox',20)");
      const job = claimed.find(row=>row.id===jobs[0].id);
      assert.ok(job);
      const details = () => service('public.nisfayn_push_delivery($1,$2,false,$3)',[job.id,job.leaseId,job.token]);
      assert.equal((await details()).closureContext,undefined);
      await call(recipient,"public.marriage_push_privacy('event')");
      const device = await details();
      assert.deepEqual([device.target,device.event,device.closureContext,device.hasFamilyContact],
        [id,'introduction:closed',context,Boolean(contact)]);
      assert.ok(!JSON.stringify(device).includes('551234567'));
      await call(recipient,'public.marriage_push_controls($1)',[{connections:false}]);
      assert.equal(await details(),null);
      await call(recipient,'public.marriage_push_controls($1)',[{connections:true}]);
      await db.query('insert into marriage.blocks(member_id,blocked_id) values($1,$2)',[recipient.id,sender.id]);
      assert.equal(await details(),null);
      assert.equal((await notices(recipient)).length,0);
    }
  } finally { await db.close(); }
});
