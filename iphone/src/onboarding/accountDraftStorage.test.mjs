import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { createAccountDraftStorage } from './accountDraftStorage.ts';
import { createDraftVault } from './vault.ts';

let loader, decodeDraft, initialDraft;
before(async () => {
  loader = await createServer({ configFile: false, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'isolate-account-cloud', enforce: 'pre', load(id) { if (id.replaceAll('\\', '/').endsWith('/src/cloud.ts')) return 'export const cloud=null; export async function callRpc(){throw Error("Unexpected live RPC in draft test")}'; } }],
    optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false } });
  ({ decodeDraft } = await loader.ssrLoadModule('/src/onboarding/persistence.ts'));
  ({ initialDraft } = await loader.ssrLoadModule('/src/onboarding/draft.ts'));
});
after(() => loader?.close());
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
const key = id => 'nisfayn.intake.v1.' + id;
const hash = value => createHash('sha256').update(value).digest('hex');
function fixture() {
  const rows = new Map(), calls = [];
  const rpc = async (name, params, expectedUser) => {
    calls.push({ name, params: structuredClone(params), expectedUser });
    if (params.command === 'save') { rows.set(expectedUser, structuredClone(params.payload)); return { saved: true }; }
    if (params.command === 'delete') { rows.delete(expectedUser); return null; }
    return structuredClone(rows.get(expectedUser) ?? null);
  };
  const storage = createAccountDraftStorage(rpc);
  const vault = () => createDraftVault(() => storage, decodeDraft);
  const draft = initialDraft(a, null);
  draft.answers.displayName = 'نور';
  draft.permissions = { version: '2026-11-07-privacy', sensitiveProfile: true, assessment: true };
  return { rows, calls, rpc, storage, vault, draft };
}

test('account RPCs use expected owner, hash the entire baseline, and never send it as raw profile data', async () => {
  const f = fixture();
  const baseline = JSON.stringify({ religion: 'private-baseline-only', assessment: 'private' });
  await f.storage.write(key(a), JSON.stringify({ ...f.draft, baseline }));
  assert.equal(f.calls[0].name, 'marriage_onboarding_draft');
  assert.equal(f.calls[0].expectedUser, a);
  assert.equal(f.calls[0].params.payload.baseline, hash(baseline));
  assert(!JSON.stringify(f.calls[0]).includes('private-baseline-only'));
  assert.equal(JSON.parse(await f.storage.read(key(a), baseline)).baseline, baseline);
  assert.equal(JSON.parse(await f.storage.read(key(a), 'changed')).baseline, 'stale-account-draft');
  assert.equal(await f.storage.read(key(b), baseline), null);
  for (const method of ['read', 'write', 'remove']) await assert.rejects(f.storage[method]('nisfayn.intake.v1.demo-1', '{}'), /Invalid draft owner/);
  assert(f.calls.every(call => call.expectedUser === a || call.expectedUser === b));
});

test('new account-session vault restores answers but never final consent or server photo metadata', async () => {
  const f = fixture(), first = f.vault();
  f.draft.consent = true;
  f.draft.answers.portrait = { id: 'server-only', path: 'private/path', blur: 40 };
  f.draft.answers.signupConsents = { terms: true, privacy: true, adult: true, photo: true };
  assert.equal(await first.save(f.draft, first.revision(a)), true);
  assert.equal(f.rows.get(a).baseline, hash('new'));
  assert.equal(f.rows.get(a).consent, undefined);
  assert.equal(f.rows.get(a).answers.portrait, undefined);
  assert.equal(f.rows.get(a).answers.signupConsents, undefined);
  const fresh = f.vault(), restored = await fresh.load(a, 'new', fresh.revision(a));
  assert.equal(restored.answers.displayName, 'نور'); assert.equal(restored.consent, false);
  assert.deepEqual(restored.permissions, f.draft.permissions);
  assert.equal(await fresh.load(b, 'new', fresh.revision(b)), null);
});

test('logout release invalidates queued writes while retaining the account draft for a new login', async () => {
  const f = fixture(), entered = Promise.withResolvers(), unblock = Promise.withResolvers();
  const storage = createAccountDraftStorage(async (...args) => {
    if (args[1].command === 'save') { entered.resolve(); await unblock.promise; }
    return f.rpc(...args);
  });
  const vault = createDraftVault(() => storage, decodeDraft), lease = vault.revision(a);
  const writing = vault.save(f.draft, lease); await entered.promise;
  const release = vault.release(a);
  const late = vault.save({ ...f.draft, answers: { ...f.draft.answers, displayName: 'late' } }, lease);
  unblock.resolve();
  assert.equal(await writing, false); await release; assert.equal(await late, false);
  assert.equal(f.calls.filter(c => c.params.command === 'delete').length, 0);
  assert.equal(f.rows.get(a).answers.displayName, 'نور');
  const next = f.vault(); assert.equal((await next.load(a, 'new', next.revision(a))).answers.displayName, 'نور');
});

test('explicit discard clears its account draft and rejects old leases without clearing another owner', async () => {
  const f = fixture(), vault = f.vault();
  await vault.save({ ...f.draft, owner: b }, vault.revision(b));
  await vault.save(f.draft, vault.revision(a));
  await vault.clear(a);
  assert.equal(f.rows.has(a), false); assert.equal(f.rows.has(b), true);
  assert.equal(await vault.save(f.draft, 0), false);
});

test('RPC failures propagate without falsely reporting a successful save or deleting the draft', async () => {
  const storage = createAccountDraftStorage(async () => { throw new Error('offline'); });
  await assert.rejects(storage.read(key(a), 'new'), /offline/);
  await assert.rejects(storage.write(key(a), JSON.stringify({ baseline: 'new' })), /offline/);
  await assert.rejects(storage.remove(key(a)), /offline/);
});

test('server clock ahead of the phone does not erase a valid draft or extend its server retention', async () => {
  const f = fixture(), vault = f.vault();
  await vault.save(f.draft, vault.revision(a));
  const serverSavedAt = Date.now() + 60_000;
  f.rows.get(a).savedAt = serverSavedAt;
  const fresh = f.vault(), restored = await fresh.load(a, 'new', fresh.revision(a));
  assert.equal(restored?.answers.displayName, 'نور');
  assert.equal(f.rows.get(a).savedAt, serverSavedAt);
  assert.equal(f.calls.filter(c => c.params.command === 'save').length, 1);
  assert.equal(f.calls.filter(c => c.params.command === 'delete').length, 0);
});
