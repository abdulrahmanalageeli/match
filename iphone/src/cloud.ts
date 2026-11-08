import { createClient, type AuthError } from "@supabase/supabase-js";
import { authStorage } from "./session";
import type { AccountState } from "./types";
import { resolveDeployment } from "./deployment";
import { signupRedirectUrl } from "./auth/signupReturn";

const deployment = resolveDeployment({ mode: import.meta.env.VITE_MARRIAGE_ENV,
  url: import.meta.env.VITE_MARRIAGE_SUPABASE_URL, key: import.meta.env.VITE_MARRIAGE_SUPABASE_PUBLISHABLE_KEY,
  dev: import.meta.env.DEV, local: import.meta.env.VITE_MARRIAGE_BACKEND === "local" });
const { url, key } = deployment;
export const cloudConnection = { url, key };
export const cloudSelected = deployment.selected;
const storageKey = deployment.ready ? "marriage-sb-" + new URL(url).host : "";
export const cloud =
  deployment.ready
    ? createClient(url, key, {
        auth: {
          storage: authStorage,
          storageKey,
          detectSessionInUrl: false,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;
export const phoneOtpEnabled = Boolean(cloud) && import.meta.env.VITE_MARRIAGE_PHONE_OTP === "true";

/** Recovery tokens must never become a persisted member/discovery session. */
export function createRecoveryClient() {
  return deployment.ready ? createClient(url, key, { auth: {
    storageKey: storageKey + '-recovery', detectSessionInUrl: false,
    persistSession: false, autoRefreshToken: false, flowType: 'implicit',
  } }) : null;
}

export class CloudError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
function failure(message: string, status = 400): never {
  const fallback =
    status === 401
      ? "انتهت الجلسة. سجّل الدخول مجددًا."
      : status === 403
        ? "هذا الإجراء غير متاح لهذا الحساب."
        : "تعذّر إتمام الطلب. حاول مجددًا.";
  throw new CloudError(
    /[\u0600-\u06ff]/.test(message) ? message : fallback,
    status,
  );
}
function authFailure(e: AuthError): never {
  if (
    e.code === "email_address_not_authorized" ||
    /email address not authorized/i.test(e.message)
  )
    failure(
      "تعذّر إرسال رابط التفعيل حاليًا. حاول لاحقًا أو تواصل مع فريق نصفين.",
      400,
    );
  if (e.code === "email_not_confirmed")
    failure("أكد بريدك الإلكتروني قبل تسجيل الدخول.", 400);
  if (e.code === "invalid_credentials")
    failure("تحقق من البريد وكلمة المرور.", 400);
  if (e.code === "weak_password") failure("استخدم كلمة مرور أقوى.", 400);
  if (e.code === "otp_expired") failure("رمز التحقق غير صحيح أو انتهت صلاحيته.", 400);
  if (e.code === "phone_provider_disabled" || e.code === "sms_send_failed")
    failure("إرسال رموز الجوال غير متاح حاليًا. يمكنك استخدام البريد الإلكتروني.", 503);
  if (e.status === 429)
    failure("طلبات كثيرة. انتظر قليلًا ثم حاول مجددًا.", 429);
  return failure(e.message, e.status);
}
export async function cloudSessionId(): Promise<string | null> {
  if (!cloud) return null;
  const { data, error } = await cloud.auth.getSession();
  if (error) authFailure(error);
  return data.session?.user.id ?? null;
}
function signupDestination() {
  const redirect = signupRedirectUrl(window.location.href, import.meta.env.VITE_MARRIAGE_SIGNUP_REDIRECT_URL);
  if (!redirect) failure("تعذّر إعداد رابط تأكيد البريد. تواصل مع فريق نصفين.", 503);
  return redirect;
}
export async function resendSignupConfirmation(email: string) {
  if (!cloud) failure("إرسال رابط التفعيل غير متاح حاليًا.", 503);
  const { error } = await cloud.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: signupDestination() } });
  // The response does not reveal whether an address has an account.
  if (error && error.code !== "user_not_found") authFailure(error);
}
export async function sendPhoneOtp(phone: string, register: boolean) {
  if (!phoneOtpEnabled || !cloud) failure("الدخول بالجوال غير متاح حاليًا.", 503);
  const { error } = await cloud.auth.signInWithOtp({ phone, options: { channel: "sms", shouldCreateUser: register } });
  if (error) authFailure(error);
}
export async function verifyPhoneOtp(phone: string, token: string): Promise<string> {
  if (!phoneOtpEnabled || !cloud) failure("الدخول بالجوال غير متاح حاليًا.", 503);
  const { data, error } = await cloud.auth.verifyOtp({ phone, token, type: "sms" });
  if (error?.code === "invalid_credentials") failure("رمز التحقق غير صحيح أو انتهت صلاحيته.", 400);
  if (error) authFailure(error);
  if (!data.session?.user.id) failure("تعذّر التحقق من الجوال. حاول مجددًا.", 400);
  return data.session.user.id;
}
export async function callRpc<T>(
  name: string,
  params: Record<string, unknown> = {},
  expectedUser?: string,
  signal?: AbortSignal,
): Promise<T> {
  if (!cloud) failure("لم يتم إعداد مشروع خدمة الزواج.", 503);
  if (expectedUser && (await cloudSessionId()) !== expectedUser)
    failure("انتهت الجلسة. سجّل الدخول مجددًا.", 401);
  const operation = cloud.rpc(name, params);
  const result = await (signal ? operation.abortSignal(signal) : operation);
  if (result.error) failure(result.error.message, result.status);
  return result.data as T;
}
export async function cloudLogout() {
  if (!cloud) return;
  const { error } = await cloud.auth.signOut({ scope: "local" });
  if (
    error &&
    error.status !== 401 &&
    error.status !== 403 &&
    error.status !== 404
  )
    authFailure(error);
  await import('./notifications/webPush').then(module => module.detachWebPush()).catch(() => {});
}
export async function cloudRequest(
  path: string,
  method: string,
  id?: string,
  input?: unknown,
): Promise<unknown> {
  if (!cloud) failure("لم يتم إعداد مشروع خدمة الزواج.", 503);
  const p = (input ?? {}) as Record<string, unknown>;
  if (path === "/register" || path === "/login") {
    const credentials = {
      email: String(p.email),
      password: String(p.password),
    };
    if (path === "/register") {
      const created = await cloud.functions.invoke('member-signup', { body: { ...credentials, consent: p.consent } });
      if (created.error) {
        const response = (created.error as { context?: Response }).context;
        const detail = response instanceof Response ? await response.clone().json().catch(() => null) : null;
        failure(typeof detail?.error === 'string' ? detail.error : 'تعذّر إنشاء الحساب. حاول مجددًا أو سجّل الدخول إذا أنشأت حسابك بالفعل.', response?.status ?? 503);
      }
      if (created.data?.ok !== true) failure('تعذّر إكمال إنشاء الحساب. حاول مجددًا.', 503);
    }
    const result = await cloud.auth.signInWithPassword(credentials);
    if (result.error) authFailure(result.error);
    if (!result.data.session) return { needsConfirmation: true };
    const token = result.data.session.user.id;
    return {
      token,
      state: await callRpc<AccountState>("marriage_state", {}, token),
    };
  }
  if (!id || (await cloudSessionId()) !== id)
    failure("انتهت الجلسة. سجّل الدخول مجددًا.", 401);
  if (path === "/me" && method === "GET")
    return callRpc("marriage_state", {}, id);
  if (path === "/application")
    return callRpc("marriage_apply", { payload: p }, id);
  if (path === "/settings")
    return callRpc("marriage_pause", { paused: p.paused }, id);
  if (path === "/introduction/respond")
    return callRpc(
      "marriage_respond",
      { proposal_id: p.id, decision: p.decision, reason: p.reason || null },
      id,
    );
  if (path === "/membership") {
    const { data, error } = await cloud.functions.invoke("verify-membership", {
      body: { signedTransaction: p.signedTransaction },
    });
    if (error)
      failure(
        "تعذّر التحقق من الاشتراك عبر Apple. أعد المحاولة أو استعد المشتريات.",
        503,
      );
    return data;
  }
  if (path === "/logout") {
    await cloudLogout();
    return { ok: true };
  }
  if (path === "/me" && method === "DELETE") {
    await callRpc("marriage_delete_account", {}, id);
    return { ok: true };
  }
  failure("المسار غير متاح.", 404);
}
