import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGuardianAccess, performGuardianAccess, hashGuardianValue, guardianNetworkAddress } from '../supabase/functions/_shared/guardian-access.ts';

const raw = { action: 'register', username: 'family_person', password: 'long-test-passphrase', displayName: 'ولي تجريبي', adult: true, consentVersion: 'family-v1' };
function fixture(options = {}) {
  const calls = [];
  return { calls, service: {
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === 'family_access_limit') return { data: { allowed: options.allowed !== false }, error: options.limiterError ? {} : null };
      if (name === 'family_recovery_prepare') return { data: { accountId: 'guardian-id', claimId: 'claim-id' }, error: options.badRecovery ? {} : null };
      if (name === 'family_recovery_finish' && options.finishFailure) return { data: false, error: {} };
      if (name === 'family_login_register' && options.mappingFailure) return { data: null, error: {} };
      return { data: true, error: null };
    },
    createUser: async value => { calls.push(['createUser', value]); return { data: { user: { id: 'guardian-id' } }, error: null }; },
    deleteUser: async id => { calls.push(['deleteUser', id]); },
    updatePassword: async (id, value) => { calls.push(['updatePassword', id, value]); return { error: options.passwordError ?? null }; },
    checkPassword: async (email, value) => { calls.push(['checkPassword', email, value]); if (options.badPassword) throw Error('wrong-password'); return 'guardian-id'; },
  } };
}
test('registration requires consent, strict username, adequate password and bounded name; ignores injected role fields', () => {
  for (const override of [{ adult: false }, { consentVersion: 'old' }, { username: '../admin' }, { password: 'short' }, { password: 'ع'.repeat(37) }, { displayName: 'a' }]) assert.throws(() => parseGuardianAccess({ ...raw, ...override }));
  const parsed = parseGuardianAccess({ ...raw, username: ' FAMILY_PERSON ', guardian_account: false, userId: 'victim' });
  assert.equal(parsed.username, 'family_person'); assert.equal('userId' in parsed, false);
  assert.throws(() => guardianNetworkAddress(new Headers({ 'x-forwarded-for': '1.2.3.4' })), /الاتصال/);
  assert.throws(() => guardianNetworkAddress(new Headers({ 'cf-connecting-ip': '1.2.3.4,5.6.7.8' })), /الاتصال/);
});
test('registration stores only hashed recovery material and trusted app metadata; mapping failure rolls back newly created auth user', async () => {
  const f = fixture(); const result = await performGuardianAccess(parseGuardianAccess(raw), 'network-hash', f.service);
  assert.match(result.recoveryCode, /^[0-9a-f]{32}$/);
  const created = f.calls.find(([name]) => name === 'createUser')[1];
  assert.deepEqual(created.app_metadata, { guardian_account: true }); assert.equal(created.email_confirm, true);
  assert.equal(created.email, await hashGuardianValue(raw.username) + '@guardian.nisfayn.invalid');
  const saved = f.calls.find(([name]) => name === 'family_login_register')[1];
  assert.equal(saved.recovery_hash, await hashGuardianValue(result.recoveryCode)); assert.equal(JSON.stringify(saved).includes(result.recoveryCode), false);
  const failed = fixture({ mappingFailure: true }); await assert.rejects(performGuardianAccess(parseGuardianAccess(raw), 'network-hash', failed.service));
  assert.deepEqual(failed.calls.at(-1), ['deleteUser', 'guardian-id']);
});
test('limiter is fail-closed before any auth creation; invalid recovery never updates passwords', async () => {
  for (const options of [{ allowed: false }, { limiterError: true }]) { const f = fixture(options); await assert.rejects(performGuardianAccess(parseGuardianAccess(raw), 'network-hash', f.service)); assert.equal(f.calls.length, 1); }
  const f = fixture({ badRecovery: true }); await assert.rejects(performGuardianAccess({ action: 'recover', username: raw.username, password: raw.password, recoveryCode: 'a'.repeat(32) }, 'network-hash', f.service));
  assert(!f.calls.some(([name]) => name === 'updatePassword'));
});
test('recovery updates only the leased owner, rotates code after success, retries finish without reopening an ambiguous lease', async () => {
  const input = { action: 'recover', username: raw.username, password: raw.password, recoveryCode: 'b'.repeat(32) };
  const f = fixture(); const result = await performGuardianAccess(input, 'network-hash', f.service);
  assert.deepEqual(f.calls.find(([name]) => name === 'updatePassword'), ['updatePassword', 'guardian-id', raw.password]);
  assert.equal(f.calls.find(([name]) => name === 'family_recovery_finish')[1].new_recovery_hash, await hashGuardianValue(result.recoveryCode));
  const ambiguous = fixture({ passwordError: { status: 500 } }); await assert.rejects(performGuardianAccess(input, 'network-hash', ambiguous.service)); assert(!ambiguous.calls.some(([name]) => name === 'family_recovery_abort'));
  const definite = fixture({ passwordError: { status: 422 } }); await assert.rejects(performGuardianAccess(input, 'network-hash', definite.service)); assert(definite.calls.some(([name]) => name === 'family_recovery_abort'));
  const finish = fixture({ finishFailure: true }); await assert.rejects(performGuardianAccess(input, 'network-hash', finish.service), /الدعم/); assert.equal(finish.calls.filter(([name]) => name === 'family_recovery_finish').length, 3); assert(!finish.calls.some(([name]) => name === 'family_recovery_abort'));
});
test('replacing a lost recovery key requires managed password reauthentication', async () => {
  const input = { action: 'rotate', username: raw.username, password: raw.password };
  const f = fixture(); await performGuardianAccess(input, 'network-hash', f.service);
  assert.equal(f.calls[1][0], 'checkPassword'); assert.equal(f.calls[2][0], 'family_recovery_rotate'); assert.equal(f.calls[2][1].account_id, 'guardian-id');
  const rejected = fixture({ badPassword: true }); await assert.rejects(performGuardianAccess(input, 'network-hash', rejected.service)); assert(!rejected.calls.some(([name]) => name === 'family_recovery_rotate'));
});
