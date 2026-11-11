import type { SupabaseClient } from '@supabase/supabase-js';

export type RecoveryLink = { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'hash'; tokenHash: string } | { kind: 'invalid' };
export const invalidRecoveryMessage = 'رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.';

/** Only recovery callbacks enter this flow; ordinary sign-in links stay untouched. */
export function readRecoveryLink(href: string): RecoveryLink | null {
  const url = new URL(href), hash = new URLSearchParams(url.hash.slice(1));
  const marked = url.searchParams.get('auth') === 'recovery';
  const type = hash.get('type') || url.searchParams.get('type');
  if (!marked && type !== 'recovery') return null;
  if (hash.has('error') || url.searchParams.has('error') || (type && type !== 'recovery')) return { kind: 'invalid' };
  if (type === 'recovery' && hash.get('access_token') && hash.get('refresh_token'))
    return { kind: 'tokens', accessToken: hash.get('access_token')!, refreshToken: hash.get('refresh_token')! };
  if (type === 'recovery' && url.searchParams.get('token_hash'))
    return { kind: 'hash', tokenHash: url.searchParams.get('token_hash')! };
  return { kind: 'invalid' };
}

export function cleanRecoveryUrl(href: string): string {
  const url = new URL(href);
  // Recovery destinations are dedicated to this flow, not family or demo entry points.
  return url.pathname;
}

export function recoveryRedirectUrl(href: string, native: boolean, configured?: string): string | null {
  try {
    if (native && !configured?.trim()) return null;
    const url = new URL(configured?.trim() || href);
    const local = !native && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password) return null;
    url.search = '?auth=recovery'; url.hash = '';
    return url.href;
  } catch { return null; }
}

export function passwordRecoveryError(cause: unknown): string {
  const code = (cause as { code?: string })?.code;
  if (code === 'same_password') return 'اختر كلمة مرور مختلفة عن السابقة.';
  if (code === 'weak_password') return 'اختر كلمة مرور أقوى من ١٠ أحرف على الأقل.';
  if ((cause as { status?: number })?.status === 429) return 'طلبات كثيرة. انتظر قليلًا ثم حاول مجددًا.';
  if (cause instanceof Error && /[\u0600-\u06ff]/.test(cause.message)) return cause.message;
  return 'تعذّر إتمام الاستعادة. حاول مجددًا أو تواصل مع فريق وُدَين.';
}

/** An isolated, nonpersistent auth client is required. It never supplies the app's session. */
export function createPasswordRecovery(auth: Pick<SupabaseClient['auth'], 'resetPasswordForEmail' | 'setSession' | 'verifyOtp' | 'getUser' | 'updateUser' | 'signOut'>) {
  let owner: string | null = null;
  let opening: Promise<void> | null = null;
  let updated = false;
  async function close() {
    owner = null;
    const { error } = await auth.signOut({ scope: 'local' });
    if (error && ![401, 403, 404].includes(error.status ?? 0)) throw error;
  }
  return {
    async request(email: string, redirectTo: string) {
      const { error } = await auth.resetPasswordForEmail(email.trim(), { redirectTo });
      // Keep the response independent of whether the account exists.
      if (error && error.code !== 'user_not_found') throw error;
    },
    open(link: RecoveryLink) {
      // React effect replay must not consume the same one-use token twice.
      if (opening) return opening;
      opening = (async () => {
        try {
          if (link.kind === 'invalid') throw Error(invalidRecoveryMessage);
          const result = link.kind === 'hash'
            ? await auth.verifyOtp({ token_hash: link.tokenHash, type: 'recovery' })
            : await auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken });
          if (result.error || !result.data.session) throw Error(invalidRecoveryMessage);
          const verified = await auth.getUser();
          if (verified.error || !verified.data.user?.id) throw Error(invalidRecoveryMessage);
          owner = verified.data.user.id;
        } catch (cause) { await close().catch(() => {}); throw cause; }
      })();
      return opening;
    },
    async update(password: string) {
      if (!owner || updated) throw Error(invalidRecoveryMessage);
      if (password.length < 10 || password.length > 128) throw Error('استخدم كلمة مرور من ١٠ إلى ١٢٨ حرفًا.');
      const verified = await auth.getUser();
      if (verified.error || verified.data.user?.id !== owner) { await close().catch(() => {}); throw Error(invalidRecoveryMessage); }
      const { error } = await auth.updateUser({ password });
      if (error) throw error;
      updated = true;
      // Invalidate other refresh sessions after a password reset. Never claim success
      // for session revocation if the provider rejects it.
      owner = null;
      try {
        const signedOut = await auth.signOut({ scope: 'global' });
        if (!signedOut.error || [401, 403, 404].includes(signedOut.error.status ?? 0)) return { sessionsRevoked: true };
      } catch {
        // The password has already changed, even if revocation cannot be confirmed.
      }
      await close().catch(() => {});
      return { sessionsRevoked: false };
    },
    close,
  };
}
