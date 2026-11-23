export type SignupReturn = 'returned' | 'invalid';
export type SignupAgreements = { adult: boolean; terms: boolean; privacy: boolean; version: string;
  registrationVersion?: string; withdrawnAt?: string; photo?: boolean; safetyTextReview?: boolean; safetyRecordedAt?: string; sensitiveProfile?: boolean; sensitivePublication?: boolean; assessment?: boolean; transcript?: boolean };
export const registrationVersion = 'wudayn-entry-2026-11-23-v2';
const previousEntryVersion = 'wudayn-entry-2026-11-23';
export const registrationPurposes = ['adult','terms','privacy','sensitiveProfile','assessment'] as const;
export type RegistrationChoices = Record<(typeof registrationPurposes)[number] | 'sensitivePublication' | 'photo' | 'safetyTextReview' | 'transcript', boolean>;
export const emptyRegistrationChoices = (): RegistrationChoices => ({
  adult: false, terms: false, privacy: false, sensitiveProfile: false, sensitivePublication: false, assessment: false, transcript: false, photo: false, safetyTextReview:false,
});
export const registrationComplete = (value: Partial<RegistrationChoices>) => registrationPurposes.every(key => value[key] === true);
export function currentRegistrationReceipt(value: SignupAgreements | null | undefined) {
  if (value?.version !== '2026-11-07-privacy' || !registrationComplete(value)) return false;
  const entryVersionApplies = value.registrationVersion === registrationVersion || (value.registrationVersion === previousEntryVersion && value.transcript === true);
  return entryVersionApplies && typeof value.transcript === 'boolean' && typeof value.sensitivePublication === 'boolean' && typeof value.photo === 'boolean';
}

// Email confirmation is completed by Supabase. Require the password again here;
// a URL marker must never authenticate a member or grant access to their profile.
export function readSignupReturn(href: string): SignupReturn | null {
  const url = new URL(href), hash = new URLSearchParams(url.hash.slice(1));
  if (url.searchParams.get('auth') !== 'signup' && hash.get('type') !== 'signup') return null;
  return hash.has('error') || url.searchParams.has('error') ? 'invalid' : 'returned';
}

export function signupRedirectUrl(href: string, configured?: string): string | null {
  try {
    const url = new URL(configured?.trim() || href);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password) return null;
    url.search = '?auth=signup'; url.hash = '';
    return url.href;
  } catch { return null; }
}
