import { cloud } from '../cloud';
import { Capacitor } from '@capacitor/core';

export type AiRequest = { mode: 'opener' };
export type SimulationMessage = { senderIsMe: boolean; body: string };
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

/** Only the private Abdulrahman simulation may send its fictional transcript.
 * Real-member suggestions keep using the separate data-free opener above. */
export async function requestSimulationReply(personaId: string, messages: SimulationMessage[], testSession: string): Promise<string> {
  if (!/^(?:w)?p(?:0[1-9]|1[0-5])$/.test(personaId) || !/^[0-9a-f]{64}$/.test(testSession)
    || !Array.isArray(messages) || messages.length > 32
    || messages.some(message => !message || typeof message.senderIsMe !== 'boolean' || typeof message.body !== 'string'
      || !message.body.trim() || message.body.length > 2000 || Object.keys(message).some(key => key !== 'senderIsMe' && key !== 'body'))
    || messages.reduce((sum, message) => sum + message.body.length, 0) > 8000) {
    throw Error('محادثة المحاكاة غير صالحة.');
  }
  const endpoint = !Capacitor.isNativePlatform() && /^https?:$/.test(window.location.protocol) ? '/api/ai' : 'https://nisfayn-preview.vercel.app/api/ai';
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-session': testSession },
    body: JSON.stringify({ mode: 'simulation_reply', personaId, messages: messages.map(({ senderIsMe, body }) => ({ senderIsMe, body })) }),
    signal: AbortSignal.timeout(25000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || typeof result?.text !== 'string' || !result.text.trim() || result.text.length > 450) {
    // The simulation decides whether to pause or show a local fallback. Never
    // turn an API failure into a generic opener masquerading as a peer reply.
    throw Error('تعذّر الرد الآن. ستتابع المحاكاة عند توفر الاتصال.');
  }
  return result.text.trim();
}
