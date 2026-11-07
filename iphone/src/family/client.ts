import { createClient, type AuthError, type SupabaseClient } from '@supabase/supabase-js';
import { authStorage } from '../session';
import { resolveDeployment } from '../deployment';
import { boundedFamilyPayload, unwrapFamilyResult, type FamilyRequest } from './model';

function deploymentConfig() { return resolveDeployment({ mode: import.meta.env.VITE_MARRIAGE_ENV, url: import.meta.env.VITE_MARRIAGE_SUPABASE_URL, key: import.meta.env.VITE_MARRIAGE_SUPABASE_PUBLISHABLE_KEY }); }

let client: SupabaseClient | undefined;
export function guardianClient(): SupabaseClient {
  if (client) return client;
  const deployment = deploymentConfig();
  if (!deployment.ready) throw Error('بوابة الأهل غير متاحة في هذه البيئة.');
  client = createClient(deployment.url, deployment.key, { auth: {
    storage: authStorage, storageKey: 'nisfayn-family-sb-' + new URL(deployment.url).host,
    persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
  } });
  return client;
}
export function guardianError(error: unknown): string {
  const value = error as Partial<AuthError> | null;
  if (value?.status === 429) return 'طلبات كثيرة. انتظر قليلًا ثم حاول مجددًا.';
  if (value?.code === 'email_address_not_authorized' || /email address not authorized/i.test(value?.message ?? '')) return 'إرسال رسائل الدخول لهذا البريد غير متاح حاليًا. يلزم تفعيل مزوّد البريد لبوابة الأهل.';
  if (value?.code === 'invalid_credentials') return 'اسم المستخدم أو كلمة المرور غير صحيح.';
  if (value?.code === 'otp_expired') return 'رمز التحقق غير صحيح أو انتهت صلاحيته.';
  if (value?.code === 'email_not_confirmed') return 'أكّد بريدك الإلكتروني أولًا.';
  if (value?.message && /[\u0600-\u06ff]/.test(value.message)) return value.message;
  return 'تعذّر إتمام الطلب. تحقق من الاتصال وحاول مجددًا.';
}
export function guardianFamilyRequest(expectedUser: string): FamilyRequest {
  return async (action, payload = {}) => {
    const auth = guardianClient();
    const { data, error } = await auth.auth.getSession();
    if (error || data.session?.user.id !== expectedUser) throw Error('انتهت جلسة الأهل. سجّل الدخول مجددًا.');
    const reply = await auth.rpc('marriage_family', { action, payload: boundedFamilyPayload(action, payload) }).abortSignal(AbortSignal.timeout(15_000));
    if (reply.error) throw Error(guardianError(reply.error));
    return unwrapFamilyResult(reply.data);
  };
}
export function normalizeGuardianUsername(value: string): string {
  const username = value.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,23}$/.test(username)) throw Error('اختر اسم مستخدم من ٣ إلى ٢٤ حرفًا إنجليزيًا أو رقمًا، يبدأ بحرف.');
  return username;
}
export async function guardianLoginEmail(username: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeGuardianUsername(username));
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  return hash + '@guardian.nisfayn.invalid';
}
export async function signInGuardian(username: string, password: string): Promise<string> {
  const { data, error } = await guardianClient().auth.signInWithPassword({ email: await guardianLoginEmail(username), password });
  if (error) throw Error(guardianError(error));
  if (!data.session || data.user?.app_metadata.guardian_account !== true) {
    await guardianClient().auth.signOut({ scope: 'local' });
    throw Error('هذا الحساب غير مخصص لبوابة الأهل.');
  }
  return data.session.user.id;
}
export async function guardianAccess(payload: { action: 'register' | 'recover' | 'rotate'; username: string; password: string; displayName?: string; adult?: boolean; consentVersion?: string; recoveryCode?: string }): Promise<string> {
  const deployment = deploymentConfig();
  if (!deployment.ready) throw Error('بوابة الأهل غير متاحة في هذه البيئة.');
  const username = normalizeGuardianUsername(payload.username);
  const response = await fetch(deployment.url + '/functions/v1/guardian-access', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: deployment.key }, body: JSON.stringify({ ...payload, username }), signal: AbortSignal.timeout(30_000), cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
  const result = await response.json().catch(() => null) as { ok?: boolean; recoveryCode?: string; error?: string } | null;
  if (!response.ok || !result?.ok || !/^[0-9a-f]{32}$/.test(result.recoveryCode ?? '')) throw Error(result?.error || 'تعذّر إتمام الطلب. تحقق من الاتصال وحاول مجددًا.');
  return result.recoveryCode!;
}
export async function guardianLogout() {
  const { error } = await guardianClient().auth.signOut({ scope: 'local' });
  if (error && ![401,403,404].includes(error.status ?? 0)) throw Error(guardianError(error));
}
