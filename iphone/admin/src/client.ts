import { createClient } from '@supabase/supabase-js';
import { adminSessionKey, adminStorage } from './sessionStorage';

const configuredMode = import.meta.env.VITE_ADMIN_MODE || 'demo';
export const mode = configuredMode === 'production' || configuredMode === 'staging' ? configuredMode : 'demo';
const liveHost = 'wupkifqbwhhebwrgvwai.supabase.co';
const eventHost = 'xytwdgiihfmxiflwuxti.supabase.co';
let configurationError = '';
let url = '', key = '';
if (configuredMode !== 'demo') {
  try {
    if (!['production', 'staging'].includes(configuredMode)) throw new Error();
    url = String(import.meta.env.VITE_SUPABASE_URL || '');
    key = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '');
    const parsed = new URL(url);
    if (!key.startsWith('sb_publishable_') || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)) throw new Error();
    if (mode === 'production' && (parsed.protocol !== 'https:' || parsed.hostname !== liveHost)) throw new Error();
    if (mode === 'staging' && ([liveHost, eventHost].includes(parsed.hostname) ||
      !(parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co')))) throw new Error();
  } catch { configurationError = 'لم تكتمل إعدادات هذه البيئة. الوصول إلى بيانات الأعضاء مغلق حتى تُضبط إعدادات المشروع الصحيح.'; }
}
export { configurationError };
export const client = configuredMode !== 'demo' && !configurationError ? createClient(url, key, {
  auth: { storage: adminStorage(window), storageKey: adminSessionKey, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
}) : null;

export class AdminError extends Error { constructor(message: string, public code?: string) { super(message); } }
export function friendly(error: unknown) {
  return error instanceof Error && /[\u0600-\u06ff]/.test(error.message) ? error.message : 'تعذّر إتمام الطلب. تحقق من الاتصال وحاول مجددًا.';
}
export async function call<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!client) throw new AdminError('هذه البيئة غير متصلة بقاعدة بيانات الأعضاء.');
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const { data, error } = await client.rpc(name, args).abortSignal(controller.signal);
    if (error) throw new AdminError(/[\u0600-\u06ff]/.test(error.message) ? error.message : 'تعذّر إتمام الطلب. حاول مجددًا.', error.code);
    return data as T;
  } finally { window.clearTimeout(timer); }
}

export async function verificationEvidence(requestId: string, evidenceId: string): Promise<Blob> {
  if (!client) throw new AdminError('هذه البيئة غير متصلة بقاعدة بيانات الأعضاء.');
  const { data: { session } } = await client.auth.getSession();
  if (!session) throw new AdminError('انتهت جلسة الفريق. سجّل الدخول مجددًا.', '42501');
  const controller = new AbortController(), timer = window.setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${url}/functions/v1/manual-verification`, {
      method: 'POST', cache: 'no-store', signal: controller.signal,
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'evidence', payload: { requestId, evidenceId } }),
    });
    if (!response.ok) {
      const problem = await response.json().catch(() => null);
      throw new AdminError(typeof problem?.error === 'string' && /[\u0600-\u06ff]/.test(problem.error) ? problem.error : 'تعذّر فتح المستند. حدّث الطلب وحاول مجددًا.', response.status === 401 || response.status === 403 ? '42501' : problem?.code);
    }
    return response.blob();
  } finally { window.clearTimeout(timer); }
}
