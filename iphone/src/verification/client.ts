import { cloud, cloudConnection } from '../cloud';
import { marriageProjectUrl, marriagePublishableKey } from '../deployment';
import { verificationSubmissionUnavailable, type ManualVerificationSource, type ManualVerificationState } from './model';

export function manualVerificationSource(testSession?: string): ManualVerificationSource {
  async function request<T>(action: string, payload: Record<string, unknown> = {}, file?: File): Promise<T> {
    const endpoint = testSession ? marriageProjectUrl : cloudConnection.url;
    const headers: Record<string, string> = {
      apikey: testSession ? marriagePublishableKey : cloudConnection.key,
      'Content-Type': file ? file.type : 'application/json',
    };
    if (testSession) headers['x-test-session'] = testSession;
    else {
      const session = await cloud?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) throw Error('سجّل الدخول لإدارة توثيقك.');
      headers.Authorization = 'Bearer ' + token;
    }
    if (file) headers['x-request-id'] = String(payload.requestId);
    const response = await fetch(endpoint + '/functions/v1/manual-verification' + (file ? '?action=upload' : ''), {
      method: 'POST', headers,
      body: file ?? JSON.stringify({ action, payload, ...(testSession ? { testSession } : {}) }),
      cache: 'no-store', signal: AbortSignal.timeout(file ? 60_000 : 20_000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result) throw Error(typeof result?.error === 'string' && /[\u0600-\u06ff]/.test(result.error)
      ? result.error : 'تعذّر إتمام طلب التوثيق. حاول مجددًا.');
    return result as T;
  }
  return {
    verificationTestMode: Boolean(testSession),
    verification: (action, payload = {}) => request<ManualVerificationState>(action === 'state' ? 'list' : action, payload),
    async submitVerification() {
      throw Error(verificationSubmissionUnavailable);
    },
  };
}
