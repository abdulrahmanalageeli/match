import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EVENT3_CONTACT_MESSAGE_MAX_LENGTH,
  buildEvent3MutualContactShare,
  normalizeEvent3FeedbackPayload,
} from './event3-contact-sharing.mjs'

test('normalizes the two contact-sharing choices without retaining stale data', () => {
  assert.deepEqual(normalizeEvent3FeedbackPayload({
    wantConnect: true,
    contactMethod: 'phone',
    contactMessage: '@must-not-leak',
  }), {
    value: { wantConnect: true, contactMethod: 'phone' },
    error: null,
  })

  const exactMessage = 'Instagram: @person\nTelegram: person'
  assert.deepEqual(normalizeEvent3FeedbackPayload({
    wantConnect: true,
    contactMethod: 'message',
    contactMessage: exactMessage,
  }), {
    value: { wantConnect: true, contactMethod: 'message', contactMessage: exactMessage },
    error: null,
  })

  assert.deepEqual(normalizeEvent3FeedbackPayload({
    wantConnect: false,
    contactMethod: 'message',
    contactMessage: '@must-not-leak',
  }), {
    value: { wantConnect: false },
    error: null,
  })
})

test('rejects missing, invalid, empty, and oversized contact choices', () => {
  assert.ok(normalizeEvent3FeedbackPayload({}).error)
  assert.ok(normalizeEvent3FeedbackPayload({ wantConnect: true, contactMethod: 'email' }).error)
  assert.ok(normalizeEvent3FeedbackPayload({ wantConnect: true, contactMethod: 'message', contactMessage: '   ' }).error)
  assert.ok(normalizeEvent3FeedbackPayload({
    wantConnect: true,
    contactMethod: 'message',
    contactMessage: 'x'.repeat(EVENT3_CONTACT_MESSAGE_MAX_LENGTH + 1),
  }).error)
})

test('reveals only the partner-selected contact method after mutual consent', () => {
  assert.deepEqual(buildEvent3MutualContactShare({
    myFeedback: { wantConnect: true },
    partnerFeedback: { wantConnect: false, contactMethod: 'phone' },
    partnerPhone: '+966500000000',
  }), {
    mutual_match: false,
    partner_phone: null,
    partner_contact_method: null,
    partner_contact_message: null,
  })

  assert.deepEqual(buildEvent3MutualContactShare({
    myFeedback: { wantConnect: true },
    partnerFeedback: { wantConnect: true, contactMethod: 'message', contactMessage: 'Instagram: @person' },
    partnerPhone: '+966500000000',
  }), {
    mutual_match: true,
    partner_phone: null,
    partner_contact_method: 'message',
    partner_contact_message: 'Instagram: @person',
  })

  assert.deepEqual(buildEvent3MutualContactShare({
    myFeedback: { wantConnect: true },
    partnerFeedback: { wantConnect: true, contactMethod: 'message', contactMessage: '   ' },
    partnerPhone: '+966500000000',
  }), {
    mutual_match: true,
    partner_phone: null,
    partner_contact_method: 'message',
    partner_contact_message: null,
  })

  assert.deepEqual(buildEvent3MutualContactShare({
    myFeedback: { wantConnect: true },
    partnerFeedback: { wantConnect: true },
    partnerPhone: '+966500000000',
  }), {
    mutual_match: true,
    partner_phone: '+966500000000',
    partner_contact_method: 'phone',
    partner_contact_message: null,
  })
})
