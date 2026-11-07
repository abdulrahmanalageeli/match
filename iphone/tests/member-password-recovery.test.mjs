import test from 'node:test';
import assert from 'node:assert/strict';
import { readRecoveryLink, cleanRecoveryUrl, recoveryRedirectUrl, createPasswordRecovery } from '../src/auth/passwordRecovery.ts';

const tokens = { kind: 'tokens', accessToken: 'recovery-access', refreshToken: 'recovery-refresh' };
function fixture(overrides = {}) {
  const calls = [];
  const auth = {
    async resetPasswordForEmail(...args) { calls.push(['request', ...args]); return { error: null }; },
    async setSession(...args) { calls.push(['session', ...args]); return { data: { session: { user: { id: 'member-a' } } }, error: null }; },
    async verifyOtp(...args) { calls.push(['verify', ...args]); return { data: { session: { user: { id: 'member-a' } } }, error: null }; },
    async getUser() { calls.push(['getUser']); return { data: { user: { id: 'member-a' } }, error: null }; },
    async updateUser(...args) { calls.push(['update', ...args]); return { error: null }; },
    async signOut(...args) { calls.push(['signOut', ...args]); return { error: null }; },
    ...overrides,
  };
  return { flow: createPasswordRecovery(auth), calls, auth };
}

test('only recovery callbacks are accepted, and callback credentials are removed from the address', () => {
  assert.equal(readRecoveryLink('https://app.example/#access_token=a&refresh_token=b&type=signup'), null);
  assert.equal(readRecoveryLink('https://app.example/?family=1#invite=private'), null);
  assert.deepEqual(readRecoveryLink('https://app.example/?auth=recovery#access_token=recovery-access&refresh_token=recovery-refresh&type=recovery'), tokens);
  assert.deepEqual(readRecoveryLink('https://app.example/?type=recovery&token_hash=one-use'), { kind: 'hash', tokenHash: 'one-use' });
  for (const suffix of ['?auth=recovery', '?auth=recovery#type=signup&access_token=a&refresh_token=b', '?auth=recovery#error=access_denied&error_code=otp_expired', '?auth=recovery&code=unsupported'])
    assert.deepEqual(readRecoveryLink('https://app.example/' + suffix), { kind: 'invalid' });
  assert.equal(cleanRecoveryUrl('https://app.example/app?auth=recovery&token_hash=secret&type=recovery#access_token=secret'), '/app');
});

test('native cannot invent a redirect; configured URLs are HTTPS and never retain routing or tokens', () => {
  assert.equal(recoveryRedirectUrl('capacitor://localhost/', true), null);
  assert.equal(recoveryRedirectUrl('capacitor://localhost/', true, 'http://example.com/'), null);
  assert.equal(recoveryRedirectUrl('capacitor://localhost/', true, 'https://u:p@example.com/'), null);
  assert.equal(recoveryRedirectUrl('capacitor://localhost/', true, 'https://app.example/app?family=1#invite=x'), 'https://app.example/app?auth=recovery');
  assert.equal(recoveryRedirectUrl('http://localhost:5173/?test=1', false), 'http://localhost:5173/?auth=recovery');
  assert.equal(recoveryRedirectUrl('http://untrusted.example/', false), null);
});

test('request uses the provider reset endpoint without authenticating or disclosing account existence', async () => {
  const f = fixture(); await f.flow.request(' member@example.com ', 'https://app.example/?auth=recovery');
  assert.deepEqual(f.calls, [['request', 'member@example.com', { redirectTo: 'https://app.example/?auth=recovery' }]]);
  const absent = fixture({ resetPasswordForEmail: async () => ({ error: { code: 'user_not_found' } }) });
  await absent.flow.request('absent@example.com', 'https://app.example/?auth=recovery');
});

test('password update is gated by verified recovery and current owner, then revokes sessions', async () => {
  const f = fixture();
  await assert.rejects(f.flow.update('new-password-123'));
  await Promise.all([f.flow.open(tokens), f.flow.open(tokens)]);
  assert.equal(f.calls.filter(call => call[0] === 'session').length, 1);
  assert.deepEqual(await f.flow.update('new-password-123'), { sessionsRevoked: true });
  assert.deepEqual(f.calls.find(call => call[0] === 'update'), ['update', { password: 'new-password-123' }]);
  assert.deepEqual(f.calls.at(-1), ['signOut', { scope: 'global' }]);
  await assert.rejects(f.flow.update('another-password-123'));
});

test('expired, mismatched and cancelled recovery sessions cannot update passwords', async () => {
  const expired = fixture({ setSession: async () => ({ data: { session: null }, error: { code: 'otp_expired' } }) });
  await assert.rejects(expired.flow.open(tokens));
  assert.deepEqual(expired.calls.at(-1), ['signOut', { scope: 'local' }]);
  await assert.rejects(expired.flow.update('new-password-123'));
  const changed = fixture(); await changed.flow.open(tokens);
  changed.auth.getUser = async () => ({ data: { user: { id: 'member-b' } }, error: null });
  await assert.rejects(changed.flow.update('new-password-123'));
  assert(!changed.calls.some(call => call[0] === 'update'));
  const cancelled = fixture(); await cancelled.flow.open(tokens); await cancelled.flow.close();
  await assert.rejects(cancelled.flow.update('new-password-123'));
});

test('token hash recovery uses the recovery type; update errors allow retry without false success', async () => {
  const f = fixture(); await f.flow.open({ kind: 'hash', tokenHash: 'one-use' });
  assert.deepEqual(f.calls[0], ['verify', { token_hash: 'one-use', type: 'recovery' }]);
  f.auth.updateUser = async () => ({ error: { code: 'weak_password' } });
  await assert.rejects(f.flow.update('new-password-123'));
  assert(!f.calls.some(call => call[0] === 'signOut'));
  f.auth.updateUser = async () => ({ error: null });
  assert.deepEqual(await f.flow.update('better-password-123'), { sessionsRevoked: true });
});

test('a revocation outage does not claim that other sessions were revoked or repeat the password update', async () => {
  const f = fixture({ signOut: async ({ scope }) => ({ error: scope === 'global' ? { status: 503 } : null }) });
  await f.flow.open(tokens);
  assert.deepEqual(await f.flow.update('new-password-123'), { sessionsRevoked: false });
  await assert.rejects(f.flow.update('another-password-123'));
  const thrown = fixture({ signOut: async ({ scope }) => { if (scope === 'global') throw Error('offline'); return { error: null }; } });
  await thrown.flow.open(tokens);
  assert.deepEqual(await thrown.flow.update('new-password-123'), { sessionsRevoked: false });
});
