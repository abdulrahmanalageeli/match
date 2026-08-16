const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const EASTERN_ARABIC_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

function toAsciiDigits(value) {
  return String(value ?? '')
    .replace(/[٠-٩]/g, digit => String(ARABIC_INDIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String(EASTERN_ARABIC_DIGITS.indexOf(digit)))
}

/**
 * Canonical phone identity used for participant account ownership checks.
 * Saudi local forms are converted to 9665XXXXXXXX; other international
 * numbers keep their country code with a leading 00 removed.
 */
export function normalizeParticipantPhone(value) {
  let digits = toAsciiDigits(value).replace(/\D/g, '')
  if (!digits) return ''

  if (digits.startsWith('00')) digits = digits.slice(2)
  if (/^05\d{8}$/.test(digits)) return `966${digits.slice(1)}`
  if (/^5\d{8}$/.test(digits)) return `966${digits}`
  return digits
}

export function isPlausibleParticipantPhone(value) {
  const normalized = normalizeParticipantPhone(value)
  return normalized.length >= 9 && normalized.length <= 15
}

export function participantPhoneToE164(value) {
  const normalized = normalizeParticipantPhone(value)
  return normalized ? `+${normalized}` : ''
}
