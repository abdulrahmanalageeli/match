import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentVerificationClaims, verificationFileError, verificationMaxFileBytes, verificationProfileValue } from './model.ts';

const now = Date.parse('2026-11-07T12:00:00Z');
const approved = { id: 'review-1', kind: 'marital_status', label: 'الحالة الاجتماعية', reviewedAt: '2026-11-01T12:00:00Z', expiresAt: '2027-02-01T12:00:00Z', isTest: false };

test('only current, scoped server claims produce badges; malformed dates and expired claims do not', () => {
  assert.equal(currentVerificationClaims([approved], now).length, 1);
  for (const patch of [
    { kind: 'premium' }, { expiresAt: 'bad-date' }, { expiresAt: '2026-11-07T12:00:00Z' },
    { reviewedAt: '2026-11-08T12:00:00Z' }, { reviewedAt: '' }, { isTest: undefined },
    { label: '' }, { id: '' },
  ]) assert.deepEqual(currentVerificationClaims([{ ...approved, ...patch }], now), []);
  assert.deepEqual(currentVerificationClaims([{ status: 'approved', kind: 'identity' }], now), []);
  assert.deepEqual(currentVerificationClaims(null, now), []);
});

test('test claims preserve their marker and are never promoted to real verification', () => {
  const claims = currentVerificationClaims([{ ...approved, isTest: true }, approved, approved], now);
  assert.equal(claims.length, 2);
  assert.equal(claims[0].isTest, true);
  assert.equal(claims[1].isTest, false);
});

test('document selection rejects oversized, empty, unsupported and mismatched files', () => {
  const file = { name: 'document.pdf', type: 'application/pdf', size: verificationMaxFileBytes };
  assert.equal(verificationFileError(file), null);
  assert.equal(verificationFileError({ name: 'photo.JPG', type: 'image/jpeg', size: 8 }), null);
  for (const bad of [null, { ...file, size: 0 }, { ...file, size: verificationMaxFileBytes + 1 },
    { ...file, type: 'text/html' }, { ...file, name: 'document.html' }, { ...file, type: '' }]) {
    assert.equal(typeof verificationFileError(bad), 'string');
  }
});

test('marital-status display reflects profile values rather than deriving them from gender', () => {
  const profile = { displayName: 'سارة', age: 30, gender: 'woman', profession: 'مهندسة', marriageBasics: { maritalStatus: 'divorced' } };
  assert.equal(verificationProfileValue('marital_status', profile), 'مطلّقة');
  assert.equal(verificationProfileValue('marital_status', { ...profile, marriageBasics: {} }), '');
  assert.equal(verificationProfileValue('education', profile), '');
  assert.equal(verificationProfileValue('employment', profile), 'مهندسة');
});
