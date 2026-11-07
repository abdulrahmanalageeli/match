export const adminSessionKey = 'nisfayn.admin.session.v1';

// Keep existing tab sessions when upgrading to remembered sign-in. Stored tokens
// never grant admin authority: every load still checks the live staff/MFA RPC.
export function adminStorage(browser: Pick<Window, 'localStorage' | 'sessionStorage'>): Storage {
  let persistent: Storage;
  try {
    persistent = browser.localStorage;
    const probe = adminSessionKey + '.probe';
    persistent.setItem(probe, '1');
    persistent.removeItem(probe);
  } catch { return browser.sessionStorage; }
  try {
    const previous = browser.sessionStorage.getItem(adminSessionKey);
    if (!persistent.getItem(adminSessionKey) && previous) persistent.setItem(adminSessionKey, previous);
    browser.sessionStorage.removeItem(adminSessionKey);
  } catch { /* A blocked legacy store must not prevent a persistent login. */ }
  return persistent;
}

export function clearAdminSession(browser: Pick<Window, 'localStorage' | 'sessionStorage'>) {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    try {
      const storage = browser[name];
      for (let index = storage.length - 1; index >= 0; index--) {
        const key = storage.key(index);
        if (key === adminSessionKey || key?.startsWith(adminSessionKey + '-')) storage.removeItem(key);
      }
    } catch { /* Still clear the other store when one is unavailable. */ }
  }
}
