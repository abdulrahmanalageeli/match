import { validFamilyToken } from './model';

type InviteStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export const pendingFamilyInviteKey = 'nisfayn-family-pending-invite-wupkifqbwhhebwrgvwai';
export const pendingFamilyInviteLifetime = 30 * 60 * 1000;
function browserStorage(): InviteStorage | null { try { return window.localStorage; } catch { return null; } }

/** Preserve the one-use link across an email-login tab, never an auth session or member data. */
export function rememberFamilyInvite(token: string, storage = browserStorage(), now = Date.now()): void {
  if (!storage || !validFamilyToken(token)) return;
  try { storage.setItem(pendingFamilyInviteKey, JSON.stringify({ token: token.toLowerCase(), expiresAt: now + pendingFamilyInviteLifetime })); } catch { /* Login can continue with manual invitation entry. */ }
}
export function forgetFamilyInvite(storage = browserStorage()): void {
  try { storage?.removeItem(pendingFamilyInviteKey); } catch { /* Some private browsers deny storage. */ }
}
export function restoreFamilyInvite(storage = browserStorage(), now = Date.now()): string {
  if (!storage) return '';
  try {
    const value = JSON.parse(storage.getItem(pendingFamilyInviteKey) ?? 'null');
    if (value && typeof value.token === 'string' && validFamilyToken(value.token) && Number.isFinite(value.expiresAt) && value.expiresAt > now && value.expiresAt <= now + pendingFamilyInviteLifetime) return value.token;
  } catch { /* Corrupt or unavailable storage must not block sign-in. */ }
  forgetFamilyInvite(storage); return '';
}
