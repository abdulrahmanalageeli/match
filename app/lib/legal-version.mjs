export const LEGAL_DOCUMENT_VERSION = "2026-09-01.2"
export const LEGAL_TERMS_VERSION = LEGAL_DOCUMENT_VERSION
export const LEGAL_PRIVACY_NOTICE_VERSION = LEGAL_DOCUMENT_VERSION

// Temporary compatibility policy: prior .1 acceptances remain valid while all
// new acceptances are recorded against the current .2 document bundle.
export const LEGAL_ACCEPTED_DOCUMENT_VERSIONS = Object.freeze([
  LEGAL_DOCUMENT_VERSION,
  "2026-09-01.1",
])

export function isAcceptedLegalVersion(value) {
  return LEGAL_ACCEPTED_DOCUMENT_VERSIONS.includes(String(value || ""))
}

export function isAcceptedLegalBundle(record) {
  if (!record) return false
  const termsVersion = String(record.terms_version || "")
  const privacyVersion = String(record.privacy_notice_version || "")
  if (termsVersion !== privacyVersion || !isAcceptedLegalVersion(termsVersion)) return false

  const bundleVersion = record.document_bundle_version
  return bundleVersion == null
    || (String(bundleVersion) === termsVersion && isAcceptedLegalVersion(bundleVersion))
}
