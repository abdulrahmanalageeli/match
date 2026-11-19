import { Capacitor } from '@capacitor/core';
import { callRpc, cloud, cloudConnection } from '../cloud';
import { marriageProjectUrl } from '../deployment';
import { deepConsent, deepConsentVersion, deepSnapshot, type DeepAnalysisSource } from './deepCompatibilityModel';

/** Only the authenticated real-member adapter installs this capability. */
export function deepCompatibilitySource(userId: string): DeepAnalysisSource {
  return {
    async request(connectionId, action, decisions, requestId) {
      const response = await callRpc<unknown>('marriage_deep_analysis', {
        connection_id: connectionId, action, decisions: action === 'request' || action === 'accept' ? deepConsent(action, requestId) : decisions ?? null,
      }, userId, AbortSignal.timeout(15000));
      return deepSnapshot(response);
    },
    async generate(connectionId) {
      await generateReading({connectionId},userId);
    },
  };
}

async function generateReading(body: {connectionId:string} | {demoPersonaId:string;consentVersion:typeof deepConsentVersion}, userId?:string) {
  const session = (await cloud?.auth.getSession())?.data.session;
  if (!session || (userId && session.user.id !== userId)) throw Error('سجّل الدخول مجددًا لمتابعة التحليل.');
  const native = Capacitor.isNativePlatform();
  // A staging native account must never send its token to the production AI service.
  if (native && cloudConnection.url !== marriageProjectUrl) throw Error('خدمة التحليل غير مهيأة لهذه النسخة.');
  const response = await fetch(native ? 'https://nisfayn-preview.vercel.app/api/deep-compatibility' : '/api/deep-compatibility', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body), signal: AbortSignal.timeout(300000),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw Error(typeof result?.error === 'string' && /[\u0600-\u06ff]/.test(result.error)
      ? result.error : 'لم يكتمل التحليل الآن. يمكنك المحاولة مجددًا دون إرسال طلب جديد.');
  }
  return response;
}

export async function generateDemoReading(demoPersonaId:string) {
  const response=await generateReading({demoPersonaId,consentVersion:deepConsentVersion});
  const data=await response.json();
  const {findings}=deepSnapshot({status:'shared', findings:data.findings});
  if (!findings.length) throw Error('تعذّر تحميل القراءة التجريبية.');
  return findings;
}
