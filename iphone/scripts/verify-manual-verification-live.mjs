// Synthetic tester-only smoke check; never approves evidence or changes a real member.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PROJECT_URL, PUBLISHABLE_KEY } from '../api/_lib/ai.mjs';
const endpoint = PROJECT_URL + '/functions/v1/manual-verification';
let session = '', requestId = '';
const json = async (url, body) => {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: PUBLISHABLE_KEY }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  return { status: response.status, data: await response.json() };
};
const command = (action, payload = {}) => json(endpoint, { action, payload, testSession: session });
try {
  assert.equal((await command('list')).status, 401);
  const login = await json(PROJECT_URL + '/functions/v1/pair-test', { action: 'login', actor: 'reham', password: '' });
  assert.equal(login.status, 200, 'Tester login succeeds');
  session = login.data.session;
  assert.equal(typeof session, 'string');
  assert.deepEqual(Object.keys(login.data.manualVerifications).sort(), ['abdulrahman', 'reham']);
  assert.equal((await command('list')).status, 200);
  const file = Buffer.from('%PDF-1.4\n% SYNTHETIC QA ONLY - NOT A REAL CERTIFICATE\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
  const prepared = await command('prepare', { kind: 'preparation_course', claimLabel: 'اختبار تقني — مستند تجريبي فقط', memberNote: 'Synthetic QA. Must not be approved as real verification.', consent: true, consentVersion: 'manual-verification-v1', mimeType: 'application/pdf', sizeBytes: file.length, fileName: 'synthetic-qa-only.pdf', clientId: randomUUID() });
  assert.equal(prepared.status, 200, JSON.stringify(prepared));
  requestId = prepared.data.requestId;
  const evidenceId = prepared.data.evidenceId;
  const uploaded = await fetch(endpoint + '?action=upload', { method: 'POST', headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/pdf', 'x-test-session': session, 'x-request-id': requestId }, body: file, signal: AbortSignal.timeout(30000) });
  assert.equal(uploaded.status, 200, await uploaded.text());
  const submitted = await command('submit', { requestId });
  assert.equal(submitted.status, 200, JSON.stringify(submitted));
  assert.equal(submitted.data.requests.find(r => r.id === requestId).status, 'pending');
  assert.equal(submitted.data.claims.some(c => c.id === requestId), false);
  const publicObject = await fetch(PROJECT_URL + '/storage/v1/object/public/nisfayn-verification-evidence/' + requestId + '/' + evidenceId + '.pdf');
  assert.equal(publicObject.ok, false, 'Evidence must not be public');
  const evidenceBody = { action: 'evidence', payload: { requestId, evidenceId }, testSession: session };
  const ownEvidence = await fetch(endpoint, { method: 'POST', headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(evidenceBody) });
  assert.equal(ownEvidence.status, 200);
  assert.equal(ownEvidence.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(Buffer.from(await ownEvidence.arrayBuffer()), file);
  const withdrawn = await command('withdraw', { requestId });
  assert.equal(withdrawn.status, 200, JSON.stringify(withdrawn));
  assert.equal(withdrawn.data.requests.find(r => r.id === requestId).status, 'withdrawn');
  assert.equal((await command('evidence', { requestId, evidenceId })).status, 403);
  console.log(JSON.stringify({ result: 'PASS', requestId, checks: ['authentication', 'tester badges state', 'private upload', 'pending without badge', 'public access denied', 'owner evidence access', 'withdrawal blocks evidence'] }));
} finally {
  if (session && requestId) await command('withdraw', { requestId }).catch(() => {});
  if (session) await json(PROJECT_URL + '/functions/v1/pair-test', { action: 'logout', session }).catch(() => {});
}
