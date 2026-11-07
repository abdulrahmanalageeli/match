import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';

// Exercise the actual demo adapter without initializing browser auth or a network client.
const source = await readFile(new URL('./data.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const isolated = compiled.replace(/import\s*\{[^}]+\}\s*from ['"]\.\/client['"];?/, `class AdminError extends Error { constructor(message, code) { super(message); this.code = code; } } const call = () => { throw Error('Unexpected live RPC'); };`);
const { createDemoApi } = await import('data:text/javascript;base64,' + Buffer.from(isolated).toString('base64'));
const memory = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; };
const reason = 'تمت مراجعة الإجراء في حساب تجريبي';

test('support replies persist across reopening, retry once, and reject stale or reused decisions', async () => {
  const storage = memory(), api = createDemoApi(storage), row = (await api.support('open')).items[0];
  const args = [row.id, row.revision, 'in_review', 'نراجع طلب الربط التجريبي.', randomUUID()];
  const updated = await api.supportReply(...args);
  assert.equal(updated.status, 'in_review'); assert.equal(updated.revision, row.revision + 1);
  const reopened = createDemoApi(storage);
  assert.deepEqual((await reopened.support('in_review')).items[0], updated);
  assert.equal((await reopened.support('open')).items.length, 0);
  assert.deepEqual(await reopened.supportReply(...args), updated, 'retry after reload does not change the reply or increment its revision');
  await assert.rejects(reopened.supportReply(row.id, row.revision, 'resolved', 'رد آخر للطلب نفسه.', randomUUID()), error => error.code === '40001');
  await assert.rejects(reopened.supportReply(row.id, row.revision, 'in_review', 'تفاصيل مختلفة للقرار.', args[4]), /معرّف إجراء مختلف/);
  const resolved = await reopened.supportReply(row.id, updated.revision, 'resolved', 'اكتملت متابعة الطلب التجريبي.', randomUUID());
  assert.equal(resolved.revision, row.revision + 2);
  assert.deepEqual((await createDemoApi(storage).support('resolved')).items[0], resolved);
});

test('manual verification requires explicit review, caps marital validity and persists idempotent decisions', async () => {
  const storage = memory(), api = createDemoApi(storage);
  const page = await api.verifications('pending', '');
  assert.equal(page.counts.pending, 2);
  const row = page.items.find(item => item.kind === 'marital_status');
  assert.equal(row.isDummy, true); assert.equal(row.isTest, true);
  await assert.rejects(api.verificationReview(row.id, 'approve', row.revision, reason, randomUUID(), 90, false), /أكّد/);
  await assert.rejects(api.verificationReview(row.id, 'approve', row.revision, reason, randomUUID(), 91, true), /مدة صالحة/);
  const requestId = randomUUID(), args = [row.id, 'approve', row.revision, reason, requestId, 90, true];
  const result = await api.verificationReview(...args);
  assert.equal(result.status, 'approved'); assert.equal(result.revision, row.revision + 1);
  assert.equal(result.isTest, true); assert(Date.parse(result.expiresAt) > Date.now() + 89 * 86400000);
  const reopened = createDemoApi(storage);
  await reopened.verificationReview(...args);
  assert.equal((await reopened.audit()).filter(item => item.action === 'verification_approve').length, 1);
  await assert.rejects(reopened.verificationReview(row.id, 'approve', row.revision, 'سبب مختلف', requestId, 90, true), /معرّف إجراء مختلف/);
  await assert.rejects(reopened.verificationReview(row.id, 'revoke', row.revision, reason, randomUUID(), null, true), error => error.code === '40001');
  const approved = (await reopened.verifications('approved', row.memberName)).items[0];
  const revoked = await reopened.verificationReview(row.id, 'revoke', approved.revision, reason, randomUUID(), null, true);
  assert.equal(revoked.status, 'revoked'); assert.equal(revoked.expiresAt, null);
  assert.equal((await reopened.verifications('approved', row.memberName)).items.length, 0);
});

test('manual verification can request changes or reject, but cannot approve a request waiting for its member', async () => {
  const api = createDemoApi(memory()), pending = (await api.verifications('pending', '')).items;
  const changed = await api.verificationReview(pending[0].id, 'request_changes', pending[0].revision, reason, randomUUID(), null, true);
  assert.equal(changed.status, 'changes_requested');
  await assert.rejects(api.verificationReview(changed.id, 'approve', changed.revision, reason, randomUUID(), 30, true), /راجع الطلب/);
  const rejected = await api.verificationReview(pending[1].id, 'reject', pending[1].revision, reason, randomUUID(), null, true);
  assert.equal(rejected.status, 'rejected');
  assert.equal((await api.verifications('pending', '')).counts.pending, 0);
});

test('demo evidence is fictional, bound to its request and access is audited', async () => {
  const api = createDemoApi(memory()), rows = (await api.verifications('pending', '')).items;
  await assert.rejects(api.verificationEvidence(rows[0].id, rows[1].evidence[0].id), /غير متاح/);
  const evidence = await api.verificationEvidence(rows[0].id, rows[0].evidence[0].id);
  assert.equal(evidence.type, 'image/svg+xml');
  assert.match(await evidence.text(), /DEMO DOCUMENT/);
  assert.equal((await api.audit())[0].action, 'verification_evidence_viewed');
});

test('dummy members and administrative decisions survive a reopened demo without duplicating retries', async () => {
  const storage = memory(), api = createDemoApi(storage);
  const members = await api.applications('all');
  assert.equal(members.length, 8); assert(members.every(member => member.isDummy));
  const member = (await api.applications('pending'))[0], requestId = randomUUID();
  const args = [member.memberId, 'approve', member.revision, reason, requestId];
  await api.review(...args);
  const reopened = createDemoApi(storage);
  assert.equal((await reopened.member(member.memberId)).status, 'approved');
  await reopened.review(...args);
  assert.equal((await reopened.audit()).filter(row => row.action === 'approve').length, 1);
  await assert.rejects(reopened.review(...args.slice(0, 3), 'سبب مختلف', requestId), /معرّف إجراء مختلف/);
  await assert.rejects(reopened.review(member.memberId, 'suspend', member.revision, reason, randomUUID()), error => error.code === '40001');
});

test('owner profile, complimentary access, dummy classification and lifecycle controls persist', async () => {
  const storage = memory(); let api = createDemoApi(storage);
  const id = (await api.applications('pending'))[0].memberId;
  const manage = async (action, changes) => { const row = await api.member(id); await api.manage(id, action, changes, row.revision, reason, randomUUID()); api = createDemoApi(storage); return api.member(id); };
  let row = await manage('edit_profile', { displayName: 'اسم معدل', profession: 'مهنة معدلة', bio: 'نبذة مراجعة' });
  assert.equal(row.displayName, 'اسم معدل'); assert.equal(row.profession, 'مهنة معدلة'); assert.equal(row.bio, 'نبذة مراجعة');
  row = await manage('grant_access', { days: 30 });
  assert.equal(row.accessActive, true); assert(Date.parse(row.accessUntil) > Date.now() + 29 * 86400000); assert.equal(row.manualAccessUntil, row.accessUntil);
  row = await manage('revoke_access', {}); assert.equal(row.accessActive, false); assert.equal(row.accessUntil, null); assert.equal(row.manualAccessUntil, null);
  row = await manage('set_dummy', { isDummy: false }); assert.equal(row.isDummy, false);
  assert(!(await api.applications('dummy')).some(member => member.memberId === id));
  for (const [action, expected] of [['approve', { status: 'approved' }], ['pause', { paused: true }], ['resume', { paused: false }], ['return_pending', { status: 'pending' }], ['suspend', { suspended: true }], ['restore', { suspended: false, status: 'pending' }]]) {
    row = await api.member(id); await api.review(id, action, row.revision, reason, randomUUID()); api = createDemoApi(storage); row = await api.member(id);
    for (const [key, value] of Object.entries(expected)) assert.equal(row[key], value, action);
  }
});

test('invalid or stale management requests leave the account unchanged', async () => {
  const api = createDemoApi(memory()), row = (await api.applications('pending'))[0];
  for (const [action, changes] of [['grant_access', { days: 0 }], ['grant_access', { days: 366 }], ['grant_access', { days: 1.5 }], ['set_dummy', { isDummy: 'false' }], ['edit_profile', { displayName: '', profession: 'مهنة', bio: 'نبذة' }], ['edit_profile', { displayName: 'اسم', profession: 'مهنة', bio: '' }], ['edit_profile', { displayName: 'اسم', profession: 'مهنة', bio: 'ا'.repeat(1201) }], ['unknown', {}]]) {
    await assert.rejects(api.manage(row.memberId, action, changes, row.revision, reason, randomUUID()));
  }
  await assert.rejects(api.manage(row.memberId, 'grant_access', { days: 1 }, row.revision, '', randomUUID()));
  assert.equal((await api.member(row.memberId)).revision, row.revision);
  await api.manage(row.memberId, 'grant_access', { days: 1 }, row.revision, reason, randomUUID());
  await assert.rejects(api.manage(row.memberId, 'revoke_access', {}, row.revision, reason, randomUUID()), error => error.code === '40001');
});

test('report actions validate reasons and retain the decision and audit across reload', async () => {
  const storage = memory(), api = createDemoApi(storage), report = (await api.reports('open'))[0];
  await assert.rejects(api.reportAction(report.reportId, 'resolve', report.revision, '', randomUUID()));
  await assert.rejects(api.reportAction(report.reportId, 'unknown', report.revision, reason, randomUUID()));
  const args = [report.reportId, 'resolve', report.revision, reason, randomUUID()];
  await api.reportAction(...args);
  const reopened = createDemoApi(storage); await reopened.reportAction(...args);
  assert((await reopened.reports('resolved')).find(row => row.reportId === report.reportId)?.resolvedAt);
  assert.equal((await reopened.audit()).filter(row => row.action === 'resolve').length, 1);
});

test('dummy reports reflect the current member name after an administrator edits the profile', async () => {
  const storage = memory(), api = createDemoApi(storage), report = (await api.reports('open'))[0];
  const member = await api.member(report.reportedId);
  await api.manage(member.memberId, 'edit_profile', { displayName: 'اسم مراجع', profession: member.profession, bio: member.bio }, member.revision, reason, randomUUID());
  const reopened = createDemoApi(storage);
  assert.equal((await reopened.reports('open')).find(row => row.reportId === report.reportId).reportedName, 'اسم مراجع');
});

test('complimentary access expires consistently in dummy details and directory after reopening', async t => {
  const storage = memory(), api = createDemoApi(storage), member = (await api.applications('pending'))[0];
  await api.manage(member.memberId, 'grant_access', { days: 1 }, member.revision, reason, randomUUID());
  const accessUntil = (await api.member(member.memberId)).accessUntil;
  t.mock.method(Date, 'now', () => Date.parse(accessUntil) + 1);
  const reopened = createDemoApi(storage);
  assert.equal((await reopened.member(member.memberId)).accessActive, false);
  assert.equal((await reopened.applications('all')).find(row => row.memberId === member.memberId).accessActive, false);
});

test('broken or unavailable browser storage still permits a usable local demo', async () => {
  for (const storage of [{ getItem: () => '{broken', setItem() {} }, { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } }]) {
    const api = createDemoApi(storage), row = (await api.applications('pending'))[0];
    await api.review(row.memberId, 'approve', row.revision, reason, randomUUID());
    assert.equal((await api.member(row.memberId)).status, 'approved');
  }
});

test('family approval is independent of member consent, persists and audits only once', async () => {
  const storage = memory(), api = createDemoApi(storage);
  const row = (await api.family('pending', '')).items.find(item => item.memberStatus === 'pending');
  assert(row);
  const args = [row.id, 'approve', row.revision, reason, randomUUID()];
  const approved = await api.familyReview(...args);
  assert.equal(approved.adminReview, 'approved');
  assert.equal(approved.memberStatus, 'pending');
  assert.equal(approved.memberApprovedAt, null);
  const reopened = createDemoApi(storage);
  assert.equal((await reopened.family('approved', row.guardianName)).items[0].id, row.id);
  await reopened.familyReview(...args);
  assert.equal((await reopened.audit()).filter(item => item.action === 'family_link_approved').length, 1);
  await assert.rejects(reopened.familyReview(row.id, 'revoke', row.revision, reason, randomUUID()), error => error.code === '40001');
  await assert.rejects(reopened.familyReview(...args.slice(0, 3), 'سبب آخر', args[4]), /معرّف إجراء مختلف/);
});

test('family review rejects invalid transitions and requires a reason', async () => {
  const api = createDemoApi(memory()), row = (await api.family('pending', '')).items[0];
  await assert.rejects(api.familyReview(row.id, 'approve', row.revision, '', randomUUID()));
  await assert.rejects(api.familyReview(row.id, 'revoke', row.revision, reason, randomUUID()));
  const rejected = await api.familyReview(row.id, 'reject', row.revision, reason, randomUUID());
  assert.equal(rejected.memberStatus, row.memberStatus);
  await assert.rejects(api.familyReview(row.id, 'reject', rejected.revision, reason, randomUUID()));
  const approved = await api.familyReview(row.id, 'approve', rejected.revision, reason, randomUUID());
  const revoked = await api.familyReview(row.id, 'revoke', approved.revision, reason, randomUUID());
  assert.equal(revoked.adminReview, 'rejected');
  assert((await api.audit()).some(item => item.action === 'family_link_revoked' && item.targetType === 'family_link'));
});

test('family queue searches only names and returns review metadata without messages or secrets', async () => {
  const api = createDemoApi(memory()), all = await api.family('all', '');
  assert.equal(all.items.length, 4);
  assert.deepEqual(all.counts, { pending: 2, approved: 1, rejected: 1 });
  assert.equal(all.nextCursor, null);
  const row = all.items[0];
  assert((await api.family('all', row.memberName)).items.some(item => item.id === row.id));
  assert.equal((await api.family('all', 'قرار توضيحي')).items.length, 0);
  assert((await api.family('all', '', row.id)).items.every(item => item.id < row.id));
  await assert.rejects(api.family('all', 'أ'.repeat(81)));
  for (const item of all.items) assert.deepEqual(Object.keys(item).sort(), ['id', 'guardianId', 'guardianName', 'memberId', 'memberName', 'relationship', 'memberStatus', 'adminReview', 'submittedAt', 'memberApprovedAt', 'reviewedAt', 'reviewedByName', 'reason', 'revision'].sort());
});
