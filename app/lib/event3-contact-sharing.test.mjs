import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EVENT3_CONTACT_MESSAGE_MAX_LENGTH,
  EVENT3_MEMORY_WORD_MAX_LENGTH,
  buildEvent3MutualContactShare,
  normalizeEvent3FeedbackPayload,
  normalizeEvent3MemoryWord,
  sanitizeEvent3SavedFeedback,
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
      meetingStatus: 'met',
      meetingOccurred: true,
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
      meetingStatus: 'met',
      meetingOccurred: true,
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
      meetingStatus: 'met',
      meetingOccurred: true,
      compatibilityRate: 65,
      sliderMoved: true,
      conversationQuality: 4,
      personalConnection: 3,
      wantConnect: false,
    },
    error: null,
  })
})

test('records a meeting that did not happen without inventing ratings or a contact rejection', () => {
  for (const meetingStatus of ['did_not_start', 'partner_absent', 'needed_help']) {
    assert.deepEqual(normalizeEvent3FeedbackPayload({
      meetingStatus,
      compatibilityRate: 0,
      wantConnect: false,
      organizerImpression: '  ملاحظة تشغيلية  ',
    }), {
      value: {
        meetingStatus,
        meetingOccurred: false,
        organizerImpression: 'ملاحظة تشغيلية',
      },
      error: null,
    })
  }

  assert.ok(normalizeEvent3FeedbackPayload({ meetingStatus: 'unknown' }).error)
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

test('sanitizes saved feedback for participant reveal without organizer-only or unknown fields', () => {
  assert.deepEqual(sanitizeEvent3SavedFeedback({
    meetingStatus: 'met',
    meetingOccurred: true,
    compatibilityRate: 65,
    sliderMoved: true,
    conversationQuality: 4,
    personalConnection: 3,
    wantConnect: true,
    contactMethod: 'message',
    contactMessage: 'Telegram: person',
    organizerImpression: 'private note',
    arbitrary: 'must not leak',
  }), {
    meetingStatus: 'met',
    meetingOccurred: true,
    compatibilityRate: 65,
    sliderMoved: true,
    conversationQuality: 4,
    personalConnection: 3,
    wantConnect: true,
    contactMethod: 'message',
    contactMessage: 'Telegram: person',
  })

  assert.deepEqual(sanitizeEvent3SavedFeedback({
    meetingStatus: 'partner_absent',
    meetingOccurred: false,
    organizerImpression: 'private note',
  }), { meetingStatus: 'partner_absent', meetingOccurred: false })
  assert.equal(sanitizeEvent3SavedFeedback({ match_preference: 'choice' }), null)
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
