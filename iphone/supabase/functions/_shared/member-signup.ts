import { accessError, hashGuardianValue } from './guardian-access.ts';

export const memberSignupKind = 'member_self_claimed_email';
export const memberSignupUnavailable = 'تعذّر إنشاء الحساب بهذه البيانات. جرّب تسجيل الدخول أو استخدم بريدًا آخر.';
const consentVersion = '2026-11-07-privacy';
export type MemberSignupInput = { email: string; password: string; consent: { version: string; adult: true; terms: true; privacy: true } };
type ServiceError = { status?: number; code?: string };
type MemberSignupServices = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
  createUser(attributes: { email: string; password: string; email_confirm: true; app_metadata: Record<string, unknown> }): Promise<{ data: { user: { id: string } | null }; error: ServiceError | null }>;
};

export function memberSignupOrigin(origin: string | null, configured = ''): string | null {
  const allowed = new Set(['https://nisfayn-preview.vercel.app', 'capacitor://localhost']);
  for (const item of configured.split(',')) {
    try { const url = new URL(item.trim()); if (url.protocol === 'https:' && url.origin === item.trim()) allowed.add(url.origin); } catch { /* Invalid deployment entries are not allowed. */ }
  }
  return origin && allowed.has(origin) ? origin : null;
}

export function parseMemberSignup(value: unknown): MemberSignupInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw accessError('الطلب غير صالح.');
  const input = value as Record<string, unknown>;
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i.test(email)) throw accessError('أدخل بريدًا إلكترونيًا صالحًا.');
  if (typeof input.password !== 'string' || input.password.length < 10 || !input.password.trim() || new TextEncoder().encode(input.password).length > 72)
    throw accessError('استخدم كلمة مرور من ١٠ أحرف على الأقل، وبحد أقصى ٧٢ بايت.');
  const consent = input.consent as Record<string, unknown> | undefined;
  if (!consent || consent.version !== consentVersion || consent.adult !== true || consent.terms !== true || consent.privacy !== true)
    throw accessError('أكّد العمر، واقبل الشروط، واطّلع على إشعار الخصوصية قبل إنشاء الحساب.');
  return { email, password: input.password, consent: { version: consentVersion, adult: true, terms: true, privacy: true } };
}

export async function performMemberSignup(input: MemberSignupInput, networkHash: string, secret: string, service: MemberSignupServices): Promise<{ ok: true }> {
  const emailHash = await hashGuardianValue(secret + ':member-email:' + input.email);
  const result = await service.rpc('marriage_member_signup_prepare', { email_address: input.email, email_hash: emailHash, network_hash: networkHash });
  const decision = result.data as { allowed?: boolean; available?: boolean } | null;
  if (result.error || !decision || typeof decision.allowed !== 'boolean' || typeof decision.available !== 'boolean')
    throw accessError('التسجيل غير متاح مؤقتًا. حاول لاحقًا.', 503);
  if (!decision.allowed) throw accessError('طلبات كثيرة. انتظر قليلًا ثم حاول مجددًا.', 429);
  if (!decision.available) throw accessError(memberSignupUnavailable, 409);
  const created = await service.createUser({ email: input.email, password: input.password, email_confirm: true,
    // This enables password login, NOT a verified contact or identity claim. Only
    // service-owned metadata determines this state; client metadata is ignored.
    app_metadata: { signupKind: memberSignupKind, emailOwnershipVerified: false,
      signupConsent: { ...input.consent, recordedAt: new Date().toISOString() } },
  });
  // Never overwrite an existing user, confirm an existing address, or return its ID.
  if (created.error || !created.data.user) throw accessError(memberSignupUnavailable, created.error?.status === 429 ? 429 : 409);
  return { ok: true };
}
