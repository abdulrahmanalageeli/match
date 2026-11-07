import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/notifications/feed.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { buildFeed, filterFeed } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
const person = { id: 'person', alias: 'عضو', age: 30, city: 'الرياض', occupation: '', bio: '', interests: [], reasons: [] };
const request = { id: 'request', status: 'pending', direction: 'incoming', person, createdAt: '2026-11-05T14:00:00Z' };
const visit = { id: 'visit', kind: 'profile_visit', person, createdAt: '2026-11-06T14:00:00Z' };

test('interest notifications open a profile without implying an accepted match', () => {
  const notice = { ...visit, id: 'interest', kind: 'interest' };
  const rows = buildFeed([], [notice], new Map(), new Set());
  assert.equal(rows[0].kind, 'interest');
  assert.equal(rows[0].target, 'profile');
  assert.equal(rows[0].requestId, undefined);
  assert.equal(filterFeed(rows, 'interests').length, 1);
  assert.equal(filterFeed(rows, 'requests').length, 0);
  assert.equal(buildFeed([], [{ ...notice, readAt: notice.createdAt }], new Map(), new Set())[0].unread, false);
});

test('visits, requests, and journey proposals share chronological order and filters', () => {
  const chat = { ...request, id: 'chat', status: 'accepted', updatedAt: '2026-11-05T15:00:00Z' };
  const progress = new Map([['chat', { stage: 0, consentPeer: true, updatedAt: '2026-11-06T16:00:00Z' }]]);
  const rows = buildFeed([request, chat], [visit], progress, new Set());
  assert.deepEqual(rows.map(r => r.kind), ['journey', 'visit', 'match', 'request']);
  assert.equal(filterFeed(rows, 'visits')[0].id, 'visit');
  assert.equal(filterFeed(rows, 'journey').length, 1);
  assert.equal(filterFeed(rows, 'requests').length, 2);
  assert.equal(filterFeed(rows, 'unread').length, 3);
});

test('unknown timestamps remain undated instead of appearing newly generated', () => {
  const chat = { id: 'old-chat', status: 'accepted', direction: 'incoming', person };
  const rows = buildFeed([chat], [visit], new Map([['old-chat', { stage: 1, consentPeer: true }]]), new Set());
  assert.equal(rows[0].id, 'visit');
  assert(rows.slice(1).every(row => row.at === undefined));
  assert.deepEqual(buildFeed([chat], [visit], new Map(), new Set()).map(r => r.at), [visit.createdAt, undefined]);
});

test('commitment supersedes redundant mutual-match row and closed history cannot open a stale chat', () => {
  const notice = { ...visit, id: 'exclusive', kind: 'exclusive', requestId: 'chat' };
  const chat = { ...request, id: 'chat', status: 'accepted' };
  const active = buildFeed([chat], [notice], new Map(), new Set());
  assert.deepEqual(active.map(r => r.kind), ['exclusive']);
  assert.equal(active[0].target, 'conversation');
  assert.equal(buildFeed([], [notice], new Map(), new Set())[0].target, null);
});

test('read activity and viewed requests leave unread filter; messages keep server-owned read state', () => {
  const message = { ...request, id: 'chat', status: 'accepted', unreadCount: 2, lastMessage: {senderIsMe:false,body:'مرحبا',createdAt:'2026-11-06T16:00:00Z'} };
  const initial = buildFeed([request, message], [visit], new Map(), new Set());
  const seen = new Set(initial.map(row => row.id));
  const rows = buildFeed([request, message], [{...visit,readAt:'2026-11-06T17:00:00Z'}], new Map(), seen);
  assert.deepEqual(filterFeed(rows, 'unread').map(r => r.kind), ['message']);
  assert.equal(filterFeed(rows, 'messages')[0].at, message.lastMessage.createdAt);
});
