import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseNextStep, nextStepState } from '../src/community/nextStepModel.ts';
import { emptyFeed } from '../src/notifications/emptyFeed.ts';

const person = { id: 'p', alias: 'رهام', age: 29, city: 'الرياض', occupation: '', bio: '', interests: [], reasons: [] };
const match = { id: 'a', status: 'accepted', direction: 'incoming', person, lastMessage: { body: 'مرحبا', senderIsMe: true, createdAt: '2026-11-08T12:00:00Z' } };
const incoming = { ...match, id: 'incoming', status: 'pending' };
const assessment = { completed: 2, total: 6, label: 'بيننا' };
const snapshot = (connections = [match], agreements = [], progress = []) => ({ connections, agreements: new Map(agreements), progress: new Map(progress) });

test('an agreement awaiting this user takes precedence over assessment or incoming requests', () => {
  const result = chooseNextStep(snapshot([match, incoming], [['a', { status: 'proposed', actor: 'abdulrahman' }]]), assessment);
  assert.equal(result.kind, 'agreement');
  assert.equal(result.connectionId, 'a');
  assert.equal(result.attention, true);
  const signed = chooseNextStep(snapshot([match, incoming], [['a', { status: 'accepted', actor: 'abdulrahman', manSignedAt: '2026-11-08' }]]), assessment);
  assert.equal(signed.kind, 'request');
});

test('a step back or exclusive proposal is actionable only while the other member awaits a decision', () => {
  assert.equal(chooseNextStep(snapshot([match], [], [['a', { stage: 1, rewindPeer: true, rewindMine: false }]])).kind, 'journey');
  assert.equal(chooseNextStep(snapshot([match], [], [['a', { stage: 0, consentPeer: true, consentMine: false }]])).kind, 'journey');
  assert.equal(chooseNextStep(snapshot([match], [], [['a', { stage: 0, consentPeer: true, consentMine: true }]])), null);
  const completed = chooseNextStep(snapshot([match], [], [['a', { stage: 2, exclusive: true, peer: true, mine: false }]]));
  assert.equal(completed.kind, 'capacity');
  assert.match(completed.detail, /وصلتما للخطوة العائلية/);
});

test('capacity and exclusivity explain the current state without encouraging another match', () => {
  const second = { ...match, id: 'b' };
  const full = snapshot([match, second, incoming]);
  assert.deepEqual(nextStepState(full), { loaded: true, acceptedCount: 2, exclusive: false, pendingIncomingCount: 1 });
  const result = chooseNextStep(full);
  assert.equal(result.kind, 'capacity');
  assert.equal(result.target, 'conversation');
  const exclusive = snapshot([match, incoming], [], [['a', { stage: 1, exclusive: true }]]);
  assert.equal(nextStepState(exclusive).exclusive, true);
  assert.equal(chooseNextStep(exclusive).kind, 'capacity');
});

test('completed assessments disappear and unread messages remain ahead of optional assessment', () => {
  assert.equal(chooseNextStep(snapshot([]), assessment).kind, 'assessment');
  assert.equal(chooseNextStep(snapshot([]), { ...assessment, completed: 6 }), null);
  assert.equal(chooseNextStep(snapshot([]), { ...assessment, completed: Number.NaN }), null);
  assert.equal(chooseNextStep(snapshot([{ ...match, unreadCount: 1 }]), assessment).kind, 'message');
});

test('unknown or waiting agreements never claim a fresh conversation is ready', () => {
  const fresh = { ...match, lastMessage: null };
  assert.equal(chooseNextStep({ ...snapshot([fresh]), requiresAgreement: true }), null);
  const waiting = chooseNextStep(snapshot([fresh], [['a', { status: 'none', actor: 'abdulrahman' }]]));
  assert.equal(waiting.kind, 'waiting');
  const ready = chooseNextStep({ ...snapshot([fresh], [['a', { status: 'accepted', actor: 'abdulrahman' }]]), requiresAgreement: true });
  assert.equal(ready.kind, 'start');
});

test('notification empty copy explains each category rather than treating read messages as absent conversations', () => {
  assert.match(emptyFeed('messages').detail, /غير المقروءة/);
  assert.match(emptyFeed('messages').detail, /المحادثات السابقة تبقى/);
  assert.match(emptyFeed('requests').detail, /لا يرسل طلبًا/);
  assert.match(emptyFeed('interests').detail, /لا يفتح محادثة/);
  assert.match(emptyFeed('journey').detail, /داخل المحادثة/);
  assert.match(emptyFeed('unread').detail, /التحديثات السابقة/);
});
