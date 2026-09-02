export const LEGAL_DOCUMENT_VERSION: "2026-09-01.2"
export const LEGAL_TERMS_VERSION: typeof LEGAL_DOCUMENT_VERSION
export const LEGAL_PRIVACY_NOTICE_VERSION: typeof LEGAL_DOCUMENT_VERSION
export const LEGAL_ACCEPTED_DOCUMENT_VERSIONS: readonly string[]

export function isAcceptedLegalVersion(value: unknown): boolean
export function isAcceptedLegalBundle(record: {
  document_bundle_version?: unknown
  terms_version?: unknown
  privacy_notice_version?: unknown
} | null | undefined): boolean
