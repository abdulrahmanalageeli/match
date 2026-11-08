export type SignupReturn = 'returned' | 'invalid';
export type SignupAgreements = { adult: boolean; terms: boolean; privacy: boolean; version: string };

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
