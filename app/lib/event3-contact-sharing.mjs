export const EVENT3_CONTACT_MESSAGE_MAX_LENGTH = 240
export const EVENT3_ORGANIZER_IMPRESSION_MAX_LENGTH = 300
export const EVENT3_MEMORY_WORD_MAX_LENGTH = 32
export const EVENT3_MEETING_STATUSES = Object.freeze([
  'met',
  'did_not_start',
  'partner_absent',
  'needed_help',
])

const EVENT3_MEETING_STATUS_SET = new Set(EVENT3_MEETING_STATUSES)

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function messageLength(value) {
  return Array.from(value).length
}

export function normalizeEvent3FeedbackPayload(feedback) {
  if (!isObject(feedback)) {
    return { value: null, error: 'بيانات التقييم غير صالحة' }
  }

  // Old clients did not send a meeting status, so preserve their established
  // rating flow. New clients can record a meeting that never happened without
  // fabricating ratings or turning an absence into a rejection signal.
  const meetingStatus = feedback.meetingStatus ?? 'met'
  if (!EVENT3_MEETING_STATUS_SET.has(meetingStatus)) {
    return { value: null, error: 'اختر ما إذا كان اللقاء قد تم' }
  }

  if (feedback.organizerImpression != null && typeof feedback.organizerImpression !== 'string') {
    return { value: null, error: 'ملاحظة المنظم غير صالحة' }
  }
  const organizerImpression = String(feedback.organizerImpression || '').trim()
  if (messageLength(organizerImpression) > EVENT3_ORGANIZER_IMPRESSION_MAX_LENGTH) {
    return { value: null, error: `ملاحظة المنظم يجب ألا تتجاوز ${EVENT3_ORGANIZER_IMPRESSION_MAX_LENGTH} حرفاً` }
  }

  if (meetingStatus !== 'met') {
    return {
      value: {
        meetingStatus,
        meetingOccurred: false,
        ...(organizerImpression ? { organizerImpression } : {}),
      },
      error: null,
    }
  }

  if (feedback.sliderMoved !== true) {
    return { value: null, error: 'حرّك مؤشر التوافق أو ثبّت الدرجة الحالية' }
  }
  if (!Number.isInteger(feedback.compatibilityRate)
      || feedback.compatibilityRate < 0
      || feedback.compatibilityRate > 100
      || feedback.compatibilityRate % 5 !== 0) {
    return { value: null, error: 'درجة التوافق يجب أن تكون بين 0 و100' }
  }
  for (const [field, label] of [
    ['conversationQuality', 'جودة المحادثة'],
    ['personalConnection', 'الراحة والتفاهم'],
  ]) {
    if (!Number.isInteger(feedback[field]) || feedback[field] < 1 || feedback[field] > 5) {
      return { value: null, error: `اختر تقييماً صالحاً لـ${label}` }
    }
  }

  if (typeof feedback.wantConnect !== 'boolean') {
    return { value: null, error: 'اختر ما إذا كنت تريد التواصل لاحقاً' }
  }

  // Persist only fields collected by the current participant flow. This keeps
  // stale clients from injecting dead survey fields or arbitrary JSON into the
  // admin feedback view.
  const normalized = {
    meetingStatus: 'met',
    meetingOccurred: true,
    compatibilityRate: feedback.compatibilityRate,
    sliderMoved: true,
    conversationQuality: feedback.conversationQuality,
    personalConnection: feedback.personalConnection,
    wantConnect: feedback.wantConnect,
    ...(organizerImpression ? { organizerImpression } : {}),
  }
  if (feedback.wantConnect === false) {
    return { value: normalized, error: null }
  }

  // Cached clients from before contact-method selection default safely to the
  // behavior they already presented: sharing the participant's phone number.
  const contactMethod = feedback.contactMethod ?? 'phone'
  if (contactMethod !== 'phone' && contactMethod !== 'message') {
    return { value: null, error: 'اختر مشاركة رقم الجوال أو وسيلة تواصل أخرى' }
  }

  normalized.contactMethod = contactMethod
  if (contactMethod === 'phone') {
    return { value: normalized, error: null }
  }

  if (typeof feedback.contactMessage !== 'string' || !feedback.contactMessage.trim()) {
    return { value: null, error: 'اكتب وسيلة التواصل التي تريد مشاركتها' }
  }
  if (messageLength(feedback.contactMessage) > EVENT3_CONTACT_MESSAGE_MAX_LENGTH) {
    return { value: null, error: `وسيلة التواصل يجب ألا تتجاوز ${EVENT3_CONTACT_MESSAGE_MAX_LENGTH} حرفاً` }
  }

  // Keep the participant's exact text. React renders this as text, not HTML.
  normalized.contactMessage = feedback.contactMessage
  return { value: normalized, error: null }
}

export function normalizeEvent3MemoryWord(value) {
  if (typeof value !== 'string') return { value: null, error: 'اكتب كلمة واحدة عن اللقاء' }
  const word = value.trim()
  if (!word) return { value: null, error: 'اكتب كلمة واحدة عن اللقاء' }
  if (/\s/u.test(word)) return { value: null, error: 'اكتب كلمة واحدة فقط' }
  if (messageLength(word) > EVENT3_MEMORY_WORD_MAX_LENGTH) {
    return { value: null, error: `الكلمة يجب ألا تتجاوز ${EVENT3_MEMORY_WORD_MAX_LENGTH} حرفاً` }
  }
  return { value: word, error: null }
}

// Reveal only the participant's own, currently supported feedback fields.
// Organizer notes and unknown legacy keys remain server/admin-only.
export function sanitizeEvent3SavedFeedback(feedback) {
  if (!isObject(feedback)) return null
  const hasFeedbackSignal = EVENT3_MEETING_STATUS_SET.has(feedback.meetingStatus)
    || typeof feedback.meetingOccurred === 'boolean'
    || feedback.sliderMoved === true
    || Number.isInteger(feedback.compatibilityRate)
    || Number.isInteger(feedback.conversationQuality)
    || Number.isInteger(feedback.personalConnection)
    || typeof feedback.wantConnect === 'boolean'
  if (!hasFeedbackSignal) return null

  const meetingStatus = EVENT3_MEETING_STATUS_SET.has(feedback.meetingStatus)
    ? feedback.meetingStatus
    : feedback.meetingOccurred === false ? 'did_not_start' : 'met'
  if (meetingStatus !== 'met') return { meetingStatus, meetingOccurred: false }

  const sanitized = { meetingStatus: 'met', meetingOccurred: true }
  if (Number.isInteger(feedback.compatibilityRate) && feedback.compatibilityRate >= 0 && feedback.compatibilityRate <= 100) {
    sanitized.compatibilityRate = feedback.compatibilityRate
  }
  if (feedback.sliderMoved === true) sanitized.sliderMoved = true
  for (const field of ['conversationQuality', 'personalConnection']) {
    if (Number.isInteger(feedback[field]) && feedback[field] >= 1 && feedback[field] <= 5) sanitized[field] = feedback[field]
  }
  if (typeof feedback.wantConnect !== 'boolean') return sanitized

  sanitized.wantConnect = feedback.wantConnect
  if (!feedback.wantConnect) return sanitized
  const contactMethod = feedback.contactMethod === 'message' ? 'message' : 'phone'
  sanitized.contactMethod = contactMethod
  if (contactMethod === 'message'
      && typeof feedback.contactMessage === 'string'
      && feedback.contactMessage.trim()
      && messageLength(feedback.contactMessage) <= EVENT3_CONTACT_MESSAGE_MAX_LENGTH) {
    sanitized.contactMessage = feedback.contactMessage
  }
  return sanitized
}

export function buildEvent3MutualContactShare({ myFeedback, partnerFeedback, partnerPhone }) {
  const mutualMatch = myFeedback?.wantConnect === true && partnerFeedback?.wantConnect === true
  if (!mutualMatch) {
    return {
      mutual_match: false,
      partner_phone: null,
      partner_contact_method: null,
      partner_contact_message: null,
    }
  }

  // Feedback saved before this feature is equivalent to the old phone-sharing
  // behavior. An explicit message choice never falls back to exposing a phone.
  const storedContactMethod = partnerFeedback?.contactMethod
  const contactMethod = storedContactMethod === 'message'
    ? 'message'
    : storedContactMethod === 'phone' || storedContactMethod == null
      ? 'phone'
      : null
  if (!contactMethod) {
    return {
      mutual_match: true,
      partner_phone: null,
      partner_contact_method: null,
      partner_contact_message: null,
    }
  }
  const contactMessage = contactMethod === 'message'
    && typeof partnerFeedback?.contactMessage === 'string'
    && partnerFeedback.contactMessage.trim()
    && messageLength(partnerFeedback.contactMessage) <= EVENT3_CONTACT_MESSAGE_MAX_LENGTH
      ? partnerFeedback.contactMessage
      : null

  return {
    mutual_match: true,
    partner_phone: contactMethod === 'phone' ? (partnerPhone || null) : null,
    partner_contact_method: contactMethod,
    partner_contact_message: contactMethod === 'message' ? contactMessage : null,
  }
}
