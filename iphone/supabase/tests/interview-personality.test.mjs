import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, addUser, asMember } from './harness.mjs';
import catalog from '../../src/compatibility/personality-catalog.json' with { type: 'json' };

let db;
before(async () => { db = await createDatabase(); });
after(async () => { await db?.close(); });
const query = async (sql, args = []) => (await db.query('select ' + sql + ' value', args)).rows[0].value;
const turn = { id: 'personality-answer', topic: 'closeness', question: 'كيف تتواصل مع من ترتاح إليه؟', answer: 'أحب الحديث عن يومي مع شريكتي وأرتاح لمشاركة مشاعري غالبًا.', skipped: false };
const proposal = (id = 'openness') => ({ id: `personality:${id}:self`, kind: 'personality', fieldId: id, side: 'self', values: ['D'], summary: 'تشارك مشاعرك غالبًا عندما ترتاح.', evidence: [{ turnId: turn.id, quote: 'أرتاح لمشاركة مشاعري غالبًا' }], needsClarification: false });
const document = () => ({ version: 'interview-v1', consentVersion: 'wudayn-interview-v1', model: 'gpt-6-luna', promptVersion: 'wudayn-interview-2', status: 'review', turns: [turn], currentQuestion: null, proposals: [proposal()], readiness: [], clarifications: [], confirmed: [], lastRequestId: null, lastMode: 'luna', pendingAnalysis: false, draftAnswer: '', reviewSharing: false, confirmedAt: null });
const valid = doc => query('marriage.interview_document_valid($1)', [doc]);

test('new personality interpretations and legacy interview documents remain valid', async () => {
  assert.equal(await valid(document()), true);
  const all = { ...document(), proposals: catalog.map(item => proposal(item.id)) };
  assert.equal(all.proposals.length, 12);
  assert.equal(await valid(all), true);
  for (const code of ['A', 'B', 'C', 'D', 'E']) assert.equal(await valid({ ...document(), proposals: [{ ...proposal(), values: [code] }] }), true);
  assert.equal(await valid({ ...document(), promptVersion: 'wudayn-interview-1', proposals: [] }), true);
  assert.equal(await valid({ ...document(), promptVersion: 'unrecognized' }), false);
  const legacy = { ...proposal(), id: 'preference:daily_contact:self', kind: 'preference', fieldId: 'daily_contact', values: ['B'] };
  assert.equal(await valid({ ...document(), promptVersion: 'wudayn-interview-1', proposals: [legacy], confirmed: [legacy] }), true);
});

test('both proposals and confirmations require self-only canonical personality answers and real evidence', async () => {
  for (const key of ['proposals', 'confirmed']) {
    for (const changed of [
      { side: 'partner' }, { side: 'importance' }, { fieldId: 'diagnosis' },
      { values: ['F'] }, { values: ['D', 'E'] }, { values: ['D', 'D'] }, { values: [] }, { values: [4] },
      { evidence: [] }, { evidence: [{ turnId: turn.id, quote: 'كلام لم يقله المستخدم' }] },
    ]) assert.equal(await valid({ ...document(), [key]: [{ ...proposal(), ...changed }] }), false, key + JSON.stringify(changed));
    assert.equal(await valid({ ...document(), turns: [{ ...turn, skipped: true }], [key]: [proposal()] }), false);
  }
  const proposals = Array.from({ length: 64 }, (_, index) => ({ ...proposal(), kind: 'preference', id: `legacy-${index}` }));
  assert.equal(await valid({ ...document(), proposals }), true);
  assert.equal(await valid({ ...document(), proposals: [...proposals, { ...proposal(), id: 'over-limit' }] }), false);
});

test('saving confirmed personality retains private owner isolation and never publishes assessment answers', async () => {
  const owner = { id: randomUUID(), sessionId: randomUUID(), email: randomUUID() + '@example.test' };
  const other = { id: randomUUID(), sessionId: randomUUID(), email: randomUUID() + '@example.test' };
  await addUser(db, owner); await addUser(db, other);
  const call = (user, command, payload = {}) => asMember(db, user.id, user.sessionId, () => query('public.marriage_interview($1,$2,null)', [command, payload]));
  const initial = { ...document(), status: 'active', turns: [], proposals: [] };
  const started = await call(owner, 'start', { consentVersion: 'wudayn-interview-v1', document: initial });
  const confirmed = { ...document(), status: 'confirmed', confirmed: [{ ...proposal(), values: ['B'] }] };
  const saved = await call(owner, 'save', { expectedRevision: started.revision, document: confirmed });
  assert.equal(saved.document.confirmed[0].values[0], 'B', 'member correction survives save');
  assert.equal((await call(owner, 'load')).document.proposals[0].values[0], 'D', 'original interpretation remains reviewable');
  assert.equal((await call(other, 'load', { owner: owner.id })).document, null);
  assert.equal(await query('(select count(*)::int from marriage.profiles where member_id=$1)', [owner.id]), 0);
  assert.equal(await query('(select count(*)::int from marriage.member_answers where member_id=$1)', [owner.id]), 0);
  await assert.rejects(call(owner, 'save', { expectedRevision: started.revision, document: confirmed }), error => error.code === '40001');
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal(await query('has_function_privilege($1,\'marriage.interview_document_valid(jsonb)\',\'EXECUTE\')', [role]), false);
  }
});
