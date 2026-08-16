import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isPlausibleParticipantPhone,
  normalizeParticipantPhone,
  participantPhoneToE164,
} from './phone-normalization.mjs'

test('normalizes equivalent Saudi phone formats to one identity', () => {
  const expected = '966501234567'
  assert.equal(normalizeParticipantPhone('050 123 4567'), expected)
  assert.equal(normalizeParticipantPhone('501234567'), expected)
  assert.equal(normalizeParticipantPhone('+966 50 123 4567'), expected)
  assert.equal(normalizeParticipantPhone('00966-50-123-4567'), expected)
})

test('accepts Arabic and Eastern Arabic numerals', () => {
  assert.equal(normalizeParticipantPhone('٠٥٠١٢٣٤٥٦٧'), '966501234567')
  assert.equal(normalizeParticipantPhone('۰۵۰۱۲۳۴۵۶۷'), '966501234567')
})

test('keeps non-Saudi international country codes', () => {
  assert.equal(normalizeParticipantPhone('+1 (415) 555-0123'), '14155550123')
  assert.equal(participantPhoneToE164('0044 7700 900123'), '+447700900123')
})

test('rejects missing and implausibly short phone identities', () => {
  assert.equal(normalizeParticipantPhone(null), '')
  assert.equal(isPlausibleParticipantPhone('1234567'), false)
  assert.equal(isPlausibleParticipantPhone('+966501234567'), true)
})
