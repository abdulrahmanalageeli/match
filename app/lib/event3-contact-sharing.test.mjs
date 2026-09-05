import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EVENT3_CONTACT_MESSAGE_MAX_LENGTH,
  EVENT3_MEMORY_WORD_MAX_LENGTH,
  buildEvent3MutualContactShare,
  normalizeEvent3FeedbackPayload,
  normalizeEvent3MemoryWord,
} from './event3-contact-sharing.mjs'

const validFeedback = (overrides = {}) => ({
  compatibilityRate: 65,
  sliderMoved: true,
  conversationQuality: 4,
  personalConnection: 3,
  wantConnect: false,
  ...overrides,
})

test('normalizes the two contact-sharing choices without retaining stale data', () => {
  assert.deepEqual(normalizeEvent3FeedbackPayload(validFeedback({
    wantConnect: true,
    contactMethod: 'phone',
    contactMessage: '@must-not-leak',
    arbitrary: 'must-not-persist',
  })), {
    value: {
      compatibilityRate: 65,
      sliderMoved: true,
      conversationQuality: 4,
      personalConnection: 3,
      wantConnect: true,
      contactMethod: 'phone',
    },
    error: null,
  })

  const exactMessage = 'Instagram: @person\nTelegram: person'
  assert.deepEqual(normalizeEvent3FeedbackPayload(validFeedback({
    wantConnect: true,
    contactMethod: 'message',
    contactMessage: exactMessage,
  })), {
    value: {
      compatibilityRate: 65,
      sliderMoved: true,
      conversationQuality: 4,
      personalConnection: 3,
      wantConnect: true,
      contactMethod: 'message',
      contactMessage: exactMessage,
    },
    error: null,
  })

  assert.deepEqual(normalizeEvent3FeedbackPayload(validFeedback({
    wantConnect: false,
    contactMethod: 'message',
    contactMessage: '@must-not-leak',
  })), {
    value: {
      compatibilityRate: 65,
      sliderMoved: true,
      conversationQuality: 4,
      personalConnection: 3,
      wantConnect: false,
    },
    error: null,
  })
})

test('rejects incomplete and out-of-range ratings before accepting contact choices', () => {
  assert.ok(normalizeEvent3FeedbackPayload({}).error)
  assert.ok(normalizeEvent3FeedbackPayload(validFeedback({ sliderMoved: false })).error)
  assert.ok(normalizeEvent3FeedbackPayload(validFeedback({ compatibilityRate: 101 })).error)
  assert.ok(normalizeEvent3FeedbackPayload(validFeedback({ compatibilityRate: 62 })).error)
  assert.ok(normalizeEvent3FeedbackPayload(validFeedback({ conversationQuality: 0 })).error)
  assert.ok(normalizeEvent3FeedbackPayload(validFeedback({ personalConnection: 6 })).error)
  assert.ok(normalizeEvent3FeedbackPayload(validFeedback({ organizerImpression: 'x'.repeat(301) })).error)
  assert.ok(normalizeEvent3FeedbackPayload(validFeedback({ wantConnect: true, contactMethod: 'email' })).error)
  assert.ok(normalizeEvent3FeedbackPayload(validFeedback({ wantConnect: true, contactMethod: 'message', contactMessage: '   ' })).error)
  assert.ok(normalizeEvent3FeedbackPayload(validFeedback({
    wantConnect: true,
    contactMethod: 'message',
    contactMessage: 'x'.repeat(EVENT3_CONTACT_MESSAGE_MAX_LENGTH + 1),
  })).error)
})

test('accepts exactly one bounded memory word', () => {
  assert.deepEqual(normalizeEvent3MemoryWord('  عفوي  '), { value: 'عفوي', error: null })
  assert.ok(normalizeEvent3MemoryWord('').error)
  assert.ok(normalizeEvent3MemoryWord('كلمتان هنا').error)
  assert.ok(normalizeEvent3MemoryWord('x'.repeat(EVENT3_MEMORY_WORD_MAX_LENGTH + 1)).error)
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
