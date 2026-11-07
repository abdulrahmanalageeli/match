import { cloud } from '../cloud';
import { Capacitor } from '@capacitor/core';

export type AiRequest = { mode: 'opener' };
const localStarters = [
  'أهلًا، يسعدني التعرف عليك. ما الشيء البسيط الذي يجعل يومك أجمل؟',
  'أهلًا، ما الذي يساعدك على الشعور بالراحة في بداية التعارف؟',
  'يسعدني أن نبدأ الحديث. كيف تحب أن تقضي وقتك بعد يوم مزدحم؟',
];

/** API credentials stay on the server; only the active account session leaves this client. */
export async function requestAi(input: AiRequest, testSession?: string): Promise<string> {
  if (!input || input.mode !== 'opener' || Object.keys(input).some(key => key !== 'mode')) {
    throw Error('هذا الاقتراح لا يقبل بيانات شخصية أو رسائل.');
  }
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (testSession) headers['x-test-session'] = testSession;
    else {
      const session = await cloud?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) throw Error('سجّل الدخول لاستخدام المساعدة الذكية.');
      headers.Authorization = 'Bearer ' + token;
    }
    const endpoint = !Capacitor.isNativePlatform() && /^https?:$/.test(window.location.protocol) ? '/api/ai' : 'https://nisfayn-preview.vercel.app/api/ai';
    const response = await fetch(endpoint, {
      method: 'POST', headers, body: JSON.stringify({ mode: 'opener' }), signal: AbortSignal.timeout(25000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || typeof result?.text !== 'string' || !result.text.trim()) {
      throw Error(typeof result?.error === 'string' && /[\u0600-\u06ff]/.test(result.error)
        ? result.error : 'المساعدة الذكية غير متاحة الآن. يمكنك متابعة الحديث بطريقتك.');
    }
    return result.text.trim().slice(0, 1000);
  } catch {
    // Generic local copy preserves the feature offline without claiming AI output.
    return localStarters[Math.floor(Math.random() * localStarters.length)];
  }
}
