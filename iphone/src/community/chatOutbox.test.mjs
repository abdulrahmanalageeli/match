import assert from "node:assert/strict";
import test from "node:test";
import { discardClosedDrafts, outboxFor, releaseChatSource, sendNotificationReply } from "./chatOutbox.ts";
import { mergeMessages } from "./timeline.ts";

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("reply targets survive retries while the next reply draft stays independent", async () => {
  const calls = [];
  let offline = true;
  const source = { async send(id, body, clientId, replyToId) {
    calls.push({ id, body, clientId, replyToId });
    if (offline) throw Error('offline');
    return 'saved-reply';
  }};
  const box = outboxFor(source, 'reply-thread');
  box.write('my answer');
  box.replyTo({ id:'original', body:'question', senderIsMe:false });
  const id = box.enqueue(box.read().draft);
  assert.equal(box.read().reply, undefined);
  await settle();
  box.write('another answer');
  box.replyTo({ id:'another-original', body:'next question', senderIsMe:true });
  offline = false; box.retry(id); await settle();
  assert.deepEqual(calls.map(c => c.replyToId), ['original','original']);
  assert.equal(calls[0].clientId, calls[1].clientId);
  assert.equal(box.read().outgoing[0].reply.body, 'question');
  assert.equal(box.read().draft, 'another answer');
  assert.equal(box.read().reply.id, 'another-original');
  box.replyTo();
  assert.equal(box.read().draft, 'another answer');
});

test("history ordering retains server microseconds, offsets and the UUID tie-break", () => {
  const history = [{id:"z", createdAt:"2026-11-05T14:45:10.000034Z"}];
  const latest = [{id:"b", createdAt:"2026-11-05T17:45:10.000035+03:00"},{id:"a", createdAt:"2026-11-05T14:45:10.000035Z"}];
  assert.deepEqual(mergeMessages(history, latest).map((m) => m.id), ["z","a","b"]);
});

test("two rapid sends appear immediately and commit in order without replacing the next draft", async () => {
  const calls = [];
  const resolve = [];
  const source = { send: (_id, body, clientId) => {
    calls.push({body, clientId});
    return new Promise((done) => resolve.push(done));
  }};
  const box = outboxFor(source, "thread");
  box.enqueue("first"); box.enqueue("second"); box.write("next draft");
  assert.deepEqual(box.read().outgoing.map((row) => row.body), ["first", "second"]);
  await settle(); assert.equal(calls.length, 1);
  resolve[0]("first-id"); await settle(); assert.equal(calls.length, 2);
  resolve[1]("second-id"); await settle();
  assert.notEqual(calls[0].clientId, calls[1].clientId);
  assert.deepEqual(box.read().outgoing.map((row) => [row.id, row.status]), [["first-id", "saved"], ["second-id", "saved"]]);
  assert.equal(box.read().draft, "next draft");
});

test("failed sends retry with the same key and reconcile if the response was lost after commit", async () => {
  const attempts = [];
  const source = { async send(_id, _body, clientId) {
    attempts.push(clientId); throw Error("offline");
  }};
  const box = outboxFor(source, "thread");
  box.enqueue("message"); await settle(); const failed = box.read().outgoing[0];
  assert.equal(failed.status, "failed");
  box.retry(failed.clientId); box.retry(failed.clientId); await settle();
  assert.deepEqual(attempts, [failed.clientId, failed.clientId]);
  box.reconcile([{id:"server-id", senderIsMe:true, clientId:failed.clientId}]);
  assert.equal(box.read().outgoing.length, 0);
  box.retry(failed.clientId); await settle();
  assert.equal(attempts.length, 2);
});

test("closing an accepted request clears its draft and queued messages, including unfinished responses", async () => {
  let finish;
  const source = { send: () => new Promise((resolve) => { finish = resolve; }) };
  const box = outboxFor(source, "closed");
  box.enqueue("unsent"); box.write("private draft");
  await settle();
  assert.equal(outboxFor({}, "closed").read().draft, "");
  discardClosedDrafts(source, new Set(["other"])); finish("server-id"); await settle();
  assert.deepEqual(box.read(), { draft: "", outgoing: [] });
  assert.deepEqual(outboxFor(source, "closed").read(), { draft: "", outgoing: [] });
});

test('iPhone outbox persists before sending and restores an uncertain reply without copying quoted text or sending again', async () => {
  const {createPendingChatSends} = await import('./pendingChatSends.ts');
  const keys = new Map(), attempts = [];
  const store = {read:async k=>keys.get(k), write:async(k,v)=>keys.set(k,v), remove:async k=>keys.delete(k)};
  const makeSource = () => ({
    pendingSends: createPendingChatSends(store, 'first'),
    async send(_room, _body, id) {
      assert([...keys.values()][0].includes(id)); attempts.push(id); throw Error('lost response');
    },
  });
  const firstSource = makeSource(), original = outboxFor(firstSource, 'room');
  original.replyTo({id:'quote', senderIsMe:false, body:'private quote'});
  const id = original.enqueue('رسالة'); await settle();
  assert(![...keys.values()][0].includes('private quote'));
  assert.deepEqual(await createPendingChatSends(store, 'other').list('room'), []);
  releaseChatSource(firstSource);
  const restarted = outboxFor(makeSource(), 'room');
  await restarted.restore();
  assert.equal(restarted.read().outgoing[0].reply.id,'quote');
  assert.equal(restarted.read().outgoing[0].status,'failed');
  assert.deepEqual(attempts,[id]);
  restarted.retry(id); await settle(); assert.deepEqual(attempts,[id,id]);
  restarted.reconcile([{id:'server',clientId:id,senderIsMe:true}]); await settle();
  assert.equal(keys.size,0);
});

test('a locked Keychain prevents dispatch and closing a conversation cancels queued writes',async()=>{
  let attempts = 0, unlock;
  const box=outboxFor({pendingSends:{put:()=>Promise.reject(Error('locked')),clearThread:async()=>{}},send:async()=>{attempts++;}},'room');
  box.enqueue('hello');await settle();assert.equal(attempts,0);assert.equal(box.read().outgoing[0].status,'failed');
  const closing=outboxFor({pendingSends:{put:()=>new Promise(resolve=>{unlock=resolve}),clearThread:async()=>{}},send:async()=>{attempts++;}},'other');
  closing.enqueue('hello');closing.clear();unlock();await settle();assert.equal(attempts,0);
});

test('a notification reply losing its response is restored under the native action ID', async()=>{
  const {createPendingChatSends}=await import('./pendingChatSends.ts');
  const keys=new Map();
  const journal=createPendingChatSends({read:async k=>keys.get(k),write:async(k,v)=>keys.set(k,v),remove:async k=>keys.delete(k)},'user');
  const source={pendingSends:journal,send:async()=>{throw Error('timeout');}};
  await assert.rejects(sendNotificationReply(source,'room','reply','action-id'));
  const box=outboxFor(source,'room');await box.restore();
  assert.equal(box.read().outgoing[0].clientId,'action-id');
  await sendNotificationReply({...source,send:async(_room,_body,id)=>{assert.equal(id,'action-id');return 'server';}},'room','reply','action-id');
  assert.deepEqual(await journal.list('room'),[]);
});

test('a commit outside the newest page clears the recovered send without retransmission',async()=>{
  let removed;
  const box=outboxFor({
    pendingSends:{list:async()=>[{requestId:'room',clientId:'old',body:'hi',createdAt:'2026-01-01'}],remove:async ids=>{removed=[...ids];}},
    committedSends:async(room,ids)=>{assert.equal(room,'room');assert.deepEqual(ids,['old']);return ids;},
    send:()=>assert.fail('must not transmit'),
  },'room');
  await box.restore([{id:'newer',senderIsMe:false}]);
  assert.equal(box.read().outgoing.length,0);assert.deepEqual(removed,['old']);
});
