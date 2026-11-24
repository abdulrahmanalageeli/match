import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';
import {seedCommunicationMember} from './communication-fixture.mjs';

test('chat captures notify only the authenticated participant’s peer and deduplicate retries', async () => {
  const db = await createDatabase();
  const call = (user, sql, args=[]) => asMember(db, user.id, user.sessionId, () =>
    db.query('select '+sql+' as value', args).then(r => r.rows[0].value));
  async function add(gender) {
    const user = {id:randomUUID(), email:randomUUID()+'@example.test', sessionId:randomUUID()};
    await addUser(db,user);
    const token = await seedCommunicationMember(db,user,gender);
    await asService(db,() => db.query('select public.marriage_record_receipt($1,$2,false)',[user.id,{
      bundleId:'com.blindmatch.marriage',productId:'com.blindmatch.marriage.monthly', appAccountToken:token,
      transactionId:user.id,originalTransactionId:user.id,signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox',
    }]));
    return user;
  }
  try {
    const sender = await add('man'), peer = await add('woman'), outsider = await add('woman');
    await call(sender,'public.marriage_discover()');
    const request = await call(sender,'public.marriage_request($1)',[peer.id]);
    const report = (user, id, event) => call(user,'public.marriage_chat_screenshot($1,$2)',[id,event]);
    const notices = user => call(user,'public.marriage_notifications()');
    const event = randomUUID();
    await assert.rejects(report(sender,request,event));
    await call(peer,"public.marriage_act($1,'accept')",[request]);
    await assert.rejects(report(outsider,request,event));
    await assert.rejects(report(sender,peer.id,event));
    await report(sender,request,event);
    await report(sender,request,event);
    const received = (await notices(peer)).filter(n => n.kind==='screenshot');
    assert.equal(received.length,1);
    assert.equal(received[0].person.id,sender.id);
    assert.equal(received[0].requestId,request);
    for (const user of [sender,outsider]) {
      assert(!(await notices(user)).some(n => n.kind==='screenshot'));
      await call(user,'public.marriage_notifications_read($1)',[[received[0].id]]);
    }
    assert.equal((await notices(peer)).find(n=>n.id===received[0].id).readAt,null);
    await call(peer,'public.marriage_notifications_read($1)',[[received[0].id]]);
    assert((await notices(peer)).find(n=>n.id===received[0].id).readAt);
    await call(peer,"public.marriage_act($1,'cancel')",[request]);
    await assert.rejects(report(sender,request,randomUUID()));
  } finally { await db.close(); }
});

test('tester screenshot requires a live session and match, advances the peer subscription once', async () => {
  const db = await createDatabase();
  const rpc = (action, session, payload={}) => asService(db,() =>
    db.query('select public.nisfayn_test_rpc($1,$2,$3) as value',[action,session,payload]).then(r => r.rows[0].value));
  const report = (session,id) => asService(db,() =>
    db.query('select public.nisfayn_test_chat_screenshot($1,$2)',[session,id]));
  try {
    const sender='a'.repeat(64), peer='b'.repeat(64), id=randomUUID();
    await rpc('login',sender,{actor:'reham'});
    await rpc('login',peer,{actor:'abdulrahman'});
    await db.exec("update nisfayn_test.room set data=data||'{\"matched\":true}'::jsonb");
    await assert.rejects(report('z'.repeat(64),id));
    await report(sender,id);
    await report(sender,id);
    assert.equal((await rpc('state',peer)).captureRevision,id);
    const notices=(await rpc('notifications',peer)).filter(n => n.kind==='screenshot');
    assert.equal(notices.length,1);
    assert.equal(notices[0].actor,'reham');
    assert.equal(notices[0].requestId,'tester-pair');
    assert(!(await rpc('notifications',sender)).some(n=>n.kind==='screenshot'));
    await db.exec("update nisfayn_test.room set data=data||'{\"matched\":false}'::jsonb");
    await assert.rejects(report(sender,randomUUID()));
  } finally { await db.close(); }
});
