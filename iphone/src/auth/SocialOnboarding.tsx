import { useState } from 'react';
import { Frame } from '../Screens';
import { ConsentChoice } from '../legal/ConsentChoices';
import { LEGAL_NOTICE_VERSION } from '../legal/LegalNotice';
import { callRpc } from '../cloud';
import { confirmSignupSms } from './SignupSms';

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function SocialOnboarding({ email, userId, busy, onComplete, onLogout, onPrivacy }: {
  email: string; userId: string; busy: boolean; onComplete: (userId: string) => void;
  onLogout: () => void; onPrivacy: () => void;
}) {
  const [agreed, setAgreed] = useState({ adult: false, terms: false, privacy: false });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function continueSignup() {
    if (pending || busy || !Object.values(agreed).every(Boolean)) return;
    setPending(true); setError('');
    try {
      const verification = await confirmSignupSms(email);
      if (!verification) return;
      await callRpc('marriage_complete_social_onboarding', {
        proof_hash: await sha256(verification.phoneProof),
        device_hash: await sha256('wudayn-device-v1:' + verification.deviceId),
        consent: { ...agreed, sms: true, version: LEGAL_NOTICE_VERSION },
      }, userId);
      onComplete(userId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر إكمال تأكيد الجوال. حاول مجددًا.');
    } finally { setPending(false); }
  }
  return <Frame title="إكمال الحساب" back={onLogout} backDisabled={pending || busy} className="nf-auth-frame">
    <section className="nf-auth-hero"><h1>خطوة أخيرة لحماية حسابك</h1>
      <p className="flow-intro">راجع الموافقات، ثم نؤكّد رقم جوالك السعودي قبل فتح وُدَين.</p></section>
    <section className="nf-auth-panel">
      <fieldset className="nf-consent-review" disabled={pending || busy}>
        <legend className="nf-auth-sr-only">الموافقات المطلوبة لإنشاء الحساب</legend>
        {(['adult', 'terms', 'privacy'] as const).map(kind => <ConsentChoice key={kind} kind={kind} checked={agreed[kind]} change={value => setAgreed(current => ({ ...current, [kind]: value }))} />)}
        <button type="button" className="nf-privacy-link" onClick={onPrivacy}>قراءة شروط الاستخدام وإشعار الخصوصية</button>
      </fieldset>
      {error && <p role="alert" className="form-error">{error}</p>}
      <button className="f-primary" disabled={pending || busy || !Object.values(agreed).every(Boolean)} onClick={() => void continueSignup()}>{pending ? 'جارٍ المتابعة…' : 'تأكيد الجوال والمتابعة'}</button>
      <button type="button" className="f-link centered" disabled={pending || busy} onClick={onLogout}>تسجيل الخروج</button>
    </section>
  </Frame>;
}
