export const EVENT3_CONTACT_MESSAGE_MAX_LENGTH = 240

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

  if (typeof feedback.wantConnect !== 'boolean') {
    return { value: null, error: 'اختر ما إذا كنت تريد التواصل لاحقاً' }
  }

  const normalized = { ...feedback }
  if (feedback.wantConnect === false) {
    delete normalized.contactMethod
    delete normalized.contactMessage
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
    delete normalized.contactMessage
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
