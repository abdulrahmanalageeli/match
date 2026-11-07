import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Capacitor } from '@capacitor/core';
import { ArrowLeft, Check, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { Frame } from '../Screens';
import { cloudLogout, createRecoveryClient } from '../cloud';
import { clearSession } from '../session';
import { SupportContact } from '../help/SupportContact';
import { cleanRecoveryUrl, createPasswordRecovery, invalidRecoveryMessage, passwordRecoveryError, recoveryRedirectUrl, type RecoveryLink } from './passwordRecovery';

export function MemberPasswordRecovery({ callback, onBack }: { callback?: RecoveryLink | null; onBack: () => void }) {
  const [flow] = useState(() => { const client = createRecoveryClient(); return client ? createPasswordRecovery(client.auth) : null; });
  const [redirect] = useState(() => recoveryRedirectUrl(window.location.href, Capacitor.isNativePlatform(), import.meta.env.VITE_MARRIAGE_PASSWORD_RESET_URL));
  const [stage, setStage] = useState<'request' | 'checking' | 'reset' | 'invalid' | 'done'>(callback ? 'checking' : 'request');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [sent, setSent] = useState(false);
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false), [remaining, setRemaining] = useState(0), [sessionsRevoked, setSessionsRevoked] = useState(true);
  const inflight = useRef(false), cooldown = useRef(0);
  useLayoutEffect(() => {
    if (callback) window.history.replaceState(null, '', cleanRecoveryUrl(window.location.href));
  }, [callback]);
  useEffect(() => {
    if (!callback) return;
    let current = true;
    if (!flow) { setStage('invalid'); setError('استعادة كلمة المرور غير متاحة في هذه النسخة.'); return; }
    void flow.open(callback).then(() => { if (current) setStage('reset'); }, cause => {
      if (current) { setStage('invalid'); setError(passwordRecoveryError(cause)); }
    });
    return () => { current = false; };
  }, [callback, flow]);
  useEffect(() => {
    if (!sent) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((cooldown.current - Date.now()) / 1000)));
    tick(); const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [sent]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!flow || inflight.current || !event.currentTarget.reportValidity()) return;
    if (stage === 'request' && (!redirect || Date.now() < cooldown.current)) return;
    if (stage === 'reset' && password !== confirmation) { setError('كلمتا المرور غير متطابقتين.'); return; }
    inflight.current = true; setBusy(true); setError('');
    try {
      if (stage === 'request') {
        await flow.request(email, redirect!);
        cooldown.current = Date.now() + 60_000; setRemaining(60); setSent(true);
      } else if (stage === 'reset') {
        const result = await flow.update(password);
        const cleanup = await Promise.allSettled([cloudLogout(), clearSession()]);
        const cleared = cleanup.every(result => result.status === 'fulfilled');
        setSessionsRevoked(result.sessionsRevoked && cleared);
        setPassword(''); setConfirmation(''); setStage('done');
      }
    } catch (cause) {
      const message = passwordRecoveryError(cause); setError(message);
      if (message === invalidRecoveryMessage) setStage('invalid');
    } finally { inflight.current = false; setBusy(false); }
  }
  async function leave() {
    if (inflight.current || stage === 'checking') return;
    inflight.current = true; setBusy(true);
    try { await flow?.close(); onBack(); }
    catch (cause) { setError(passwordRecoveryError(cause)); }
    finally { inflight.current = false; setBusy(false); }
  }
  const available = Boolean(flow && redirect);
  return <Frame title="استعادة كلمة المرور" back={() => void leave()} backDisabled={busy || stage === 'checking'}>
    <div className="nf-auth-heading"><span className="nf-letter">{stage === 'done' ? <Check size={23}/> : <LockKeyhole size={23}/>}</span>
      <h1>{stage === 'done' ? 'تم تغيير كلمة المرور' : stage === 'reset' ? 'اختر كلمة مرور جديدة' : 'استعد دخولك إلى نصفين'}</h1>
    </div>
    {stage === 'checking' && <p className="flow-intro" role="status">جارٍ التحقق من رابط الاستعادة…</p>}
    {stage === 'done' ? <>
      <p className="flow-intro" role="status">حُفظت كلمة المرور الجديدة. يمكنك الآن تسجيل الدخول بها.</p>
      {!sessionsRevoked && <p className="flow-note">تغيّرت كلمة المرور، لكن تعذّر تأكيد إنهاء جميع الجلسات الأخرى. تواصل مع الفريق إذا كنت قلقًا بشأن دخول شخص آخر.</p>}
      <button className="f-primary" disabled={busy} onClick={() => void leave()}>العودة لتسجيل الدخول <ArrowLeft size={18}/></button>
    </> : stage === 'invalid' ? <>
      <p className="flow-intro">افتح أحدث رابط وصل إلى بريدك. لا تشارك رابط الاستعادة مع أحد.</p>
      <button className="f-primary" onClick={() => { setError(''); setStage('request'); }}>طلب رابط جديد</button>
    </> : stage === 'request' ? available ? <>
      <p className="flow-intro">أدخل البريد الذي أنشأت به حساب العضوية. ستكمل تغيير كلمة المرور في صفحة آمنة بالمتصفح، ثم تعود للتطبيق.</p>
      <form className="flow-form" onSubmit={event => void submit(event)}>
        <label>البريد الإلكتروني<input type="email" dir="ltr" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} required disabled={busy}/></label>
        <button className="f-primary" disabled={busy || remaining > 0}>{remaining > 0 ? `إعادة الإرسال بعد ${remaining.toLocaleString('ar-SA')} ث` : sent ? 'إعادة إرسال الرابط' : 'إرسال رابط الاستعادة'}<Mail size={18}/></button>
      </form>
      {sent && <p className="flow-note" role="status">إذا كان البريد مرتبطًا بحساب، ستصلك رسالة استعادة. راجع البريد غير المرغوب فيه، واستخدم أحدث رابط.</p>}
    </> : <p className="flow-intro">استعادة كلمة المرور عبر البريد غير متاحة في هذه النسخة. تواصل مع فريق نصفين للحصول على المساعدة.</p> : stage === 'reset' ? <>
      <p className="flow-intro">استخدم من ١٠ إلى ١٢٨ حرفًا. بعد الحفظ ستحتاج إلى تسجيل الدخول من جديد.</p>
      <form className="flow-form" onSubmit={event => void submit(event)}>
        <label>كلمة المرور الجديدة<span className="password-wrap"><input type={visible ? 'text' : 'password'} dir="ltr" autoComplete="new-password" minLength={10} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} required disabled={busy}/><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>{visible ? <EyeOff size={19}/> : <Eye size={19}/>}</button></span></label>
        <label>تأكيد كلمة المرور<input type="password" dir="ltr" autoComplete="new-password" minLength={10} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} required disabled={busy}/></label>
        <button className="f-primary" disabled={busy}>حفظ كلمة المرور <ArrowLeft size={18}/></button>
      </form>
    </> : null}
    {error && <p className="form-error" role="alert">{error}</p>}
    {stage !== 'checking' && <SupportContact subject="مساعدة في استعادة حساب نصفين"/>}
  </Frame>;
}
