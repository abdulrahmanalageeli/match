import { Capacitor } from '@capacitor/core';
import { cloud } from '../cloud';
import type { InterviewSnapshot } from './types';

/** token is the expected account ID, not a persisted access token. */
export type InterviewAuth = { token?: string; testSession?: string };
export class InterviewError extends Error {
  constructor(message: string, public code: string, public status: number) { super(message); }
}

export async function requestInterview(auth: InterviewAuth, payload: Record<string, unknown>): Promise<InterviewSnapshot> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth.testSession) headers['x-test-session'] = auth.testSession;
  else {
    const { data } = await cloud?.auth.getSession() ?? { data: { session: null } };
    if (!auth.token || data.session?.user.id !== auth.token || !data.session.access_token) {
      throw new InterviewError('سجّل الدخول إلى حسابك لمتابعة جلستك الخاصة.', 'unauthorized', 401);
    }
    headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const endpoint = !Capacitor.isNativePlatform() && /^https?:$/.test(window.location.protocol)
    ? '/api/interview' : 'https://nisfayn-preview.vercel.app/api/interview';
  let response: Response;
  try {
    response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(45000) });
  } catch {
    throw new InterviewError('لم نتأكد من وصول هذه الخطوة. احتفظ بإجابتك وحاول مجددًا عند عودة الاتصال.', 'network', 0);
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result || !('document' in result)) {
    const text = typeof result?.error === 'string' && /[\u0600-\u06ff]/.test(result.error)
      ? result.error : 'تعذّر إكمال الخطوة الآن. حاول مجددًا.';
    throw new InterviewError(text, typeof result?.code === 'string' ? result.code : 'unavailable', response.status);
  }
  return result as InterviewSnapshot;
}
