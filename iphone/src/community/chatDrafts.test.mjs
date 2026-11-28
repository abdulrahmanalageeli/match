import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatDrafts } from './chatDrafts.ts';
import { discardClosedDrafts, outboxFor, releaseChatSource } from './chatOutbox.ts';

function fixture() {
  const records = new Map();
  const store = { getItem: async key => records.get(key), setItem: async (key, value) => records.set(key, value), removeItem: async key => records.delete(key) };
  return { records, store };
}

test('reload restores my draft and an authorized voice reference without storing the other member’s words', async () => {
  const { records, store } = fixture();
  const source = { drafts: createChatDrafts(store, 'a'), send: () => { throw Error('unexpected send'); } };
  const a = outboxFor(source, 'thread');
  a.write('my own words');
  a.replyTo({ id: 'audio', body: 'private preview', senderIsMe: false, atSeconds: 4 });
  releaseChatSource(source);
  await source.drafts.read('thread');
  assert.ok(![...records.values()].join('').includes('private preview'));
  assert.equal(await createChatDrafts(store, 'b').read('thread'), undefined);
  assert.equal(await source.drafts.read('another'), undefined);

  const original = { id: 'audio', senderIsMe: false, attachment: { kind: 'audio', duration: 20 } };
  const restored = outboxFor({ drafts: createChatDrafts(store, 'a'), messageChanges: async (_id, ids) => { assert.deepEqual(ids, ['audio']); return [original]; } }, 'thread');
  assert.equal(restored.read().draft, '');
  await restored.restore([]);
  assert.equal(restored.read().draft, 'my own words');
  assert.deepEqual(restored.read().reply, { id: 'audio', body: 'رسالة صوتية', senderIsMe: false, atSeconds: 4 });
});

test('send, permission loss, closure of unopened threads and retiring an account erase drafts', async () => {
  const { store } = fixture();
  const drafts = createChatDrafts(store, 'owner');
  const source = { drafts, send: async () => 'sent' };
  const box = outboxFor(source, 'open');
  box.write('ready'); box.enqueue('ready');
  assert.equal(await drafts.read('open'), undefined);
  box.write('private'); box.clear();
  assert.equal(await drafts.read('open'), undefined);
  await drafts.write('closed', 'old');
  await drafts.write('other', 'still open');
  discardClosedDrafts(source, new Set(['other']));
  assert.equal(await drafts.read('closed'), undefined);
  assert.equal((await drafts.read('other')).text, 'still open');
  const closing = drafts.retire();
  await drafts.write('late', 'stale frame');
  await closing;
  const fresh = createChatDrafts(store, 'owner');
  assert.equal(await fresh.read('late'), undefined);
  assert.equal(await fresh.read('other'), undefined);
});

test('typing while an old read is in flight wins and a deleted quote cannot be recovered', async () => {
  let complete;
  const deferred = new Promise(resolve => { complete = resolve; });
  const source = { drafts: { read: () => deferred, write: async () => {} } };
  const box = outboxFor(source, 'room');
  const loading = box.restore([]);
  box.write('newer');
  complete({ text: 'older' });
  await loading;
  assert.equal(box.read().draft, 'newer');
  const { store } = fixture();
  const drafts = createChatDrafts(store, 'mine');
  await drafts.write('room', 'answer', { id: 'removed', senderIsMe: false, body: 'private' });
  const clean = outboxFor({ drafts }, 'room');
  await clean.restore([{ id: 'removed', deletedAt: '2026-11-01' }]);
  assert.equal(clean.read().draft, 'answer');
  assert.equal(clean.read().reply, undefined);
});
