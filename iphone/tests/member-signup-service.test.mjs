import test from 'node:test';
import assert from 'node:assert/strict';
import { memberSignupOrigin, memberSignupKind, memberSignupUnavailable, parseMemberSignup, performMemberSignup } from '../supabase/functions/_shared/member-signup.ts';

const input = { phoneProof:'a'.repeat(64), deviceId:'web:11111111-1111-4111-8111-111111111111', email: ' Member@Example.com ', password: 'a-real-passphrase', consent: { version: '2026-11-07-privacy', adult: true, terms: true, privacy: true } };
function fixture(options = {}) {
  const calls = [];
  return { calls, service: {
    rpc: async (name, args) => { calls.push([name, args]); return { data: { allowed: options.allowed !== false, available: options.available !== false }, error: options.limiterError ? {} : null }; },
    createUser: async attributes => { calls.push(['createUser', attributes]); return { data: { user: options.createError ? null : { id: 'new-member' } }, error: options.createError ?? null }; },
  } };
}

test('member creation requires explicit current legal choices and bounded credentials; ignores forged privilege fields', () => {
  const valid = parseMemberSignup({ ...input, app_metadata: { role: 'owner', emailOwnershipVerified: true }, email_confirm: true });
  assert.equal(valid.email, 'member@example.com');
  assert.equal('app_metadata' in valid, false);
  for (const override of [{phoneProof:undefined},{deviceId:undefined},{phoneProof:"forged"},{ email: 'bad address@example.com' }, { email: 'a'.repeat(65) + '@example.com' }, { password: 'short' }, { password: 'ع'.repeat(37) }, { consent: { ...input.consent, adult: false } }, { consent: { ...input.consent, terms: false } }, { consent: { ...input.consent, privacy: false } }, { consent: { ...input.consent, version: 'old' } }]) assert.throws(() => parseMemberSignup({ ...input, ...override }));
});

test('only exact member origins and explicit HTTPS deployments pass CORS', () => {
  assert.equal(memberSignupOrigin('https://nisfayn-preview.vercel.app'), 'https://nisfayn-preview.vercel.app');
  assert.equal(memberSignupOrigin('capacitor://localhost'), 'capacitor://localhost');
  for (const origin of [null, 'null', 'https://nisfayn-preview.vercel.app.attacker.test', 'http://nisfayn-preview.vercel.app', 'https://attacker.test']) assert.equal(memberSignupOrigin(origin), null);
  assert.equal(memberSignupOrigin('https://members.example.com', 'https://members.example.com'), 'https://members.example.com');
  assert.equal(memberSignupOrigin('http://members.example.com', 'http://members.example.com'), null);
});

test('creation follows the committed limiter decision, uses server metadata, and exposes no user ID or credentials', async () => {
  const f = fixture();
  const result = await performMemberSignup(parseMemberSignup(input), 'network-digest', 'server-secret', f.service);
  assert.deepEqual(result, { ok: true });
  assert.equal(f.calls[0][0], 'marriage_member_signup_prepare');
  assert.match(f.calls[0][1].email_hash, /^[a-f0-9]{64}$/);
  assert.equal(f.calls[0][1].password, undefined);
  const created = f.calls[1][1];
  assert.equal(created.email_confirm, true);
  assert.equal(created.app_metadata.signupKind, memberSignupKind);
  assert.equal(created.app_metadata.emailOwnershipVerified, false);
  assert.match(created.app_metadata.signupPhoneProof,/^[a-f0-9]{64}$/);
  assert.notEqual(created.app_metadata.signupPhoneProof,input.phoneProof);
  assert.match(created.app_metadata.signupDeviceHash,/^[a-f0-9]{64}$/);
  assert.equal(created.app_metadata.role, undefined);
  assert.equal(created.user_metadata, undefined);
  assert.equal(created.app_metadata.signupConsent.adult, true);
});

test('rate failures and reserved addresses fail closed; existing users are never updated or auto-confirmed', async () => {
  for (const options of [{ allowed: false }, { available: false }, { limiterError: true }]) {
    const f = fixture(options);
    await assert.rejects(performMemberSignup(parseMemberSignup(input), 'network', 'secret', f.service));
    assert.equal(f.calls.length, 1);
  }
  const existing = fixture({ createError: { code: 'email_exists', status: 422 } });
  await assert.rejects(performMemberSignup(parseMemberSignup(input), 'network', 'secret', existing.service), error => error.message === memberSignupUnavailable && error.status === 409);
  assert.deepEqual(existing.calls.map(call => call[0]), ['marriage_member_signup_prepare', 'createUser']);
});
