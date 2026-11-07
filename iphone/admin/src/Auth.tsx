import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, CheckCircle2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { client, configurationError, friendly } from './client';

export function Brand({ large = false }: { large?: boolean }) {
  return <div className={large ? 'brand large' : 'brand'}><img src="/brand/nisfayn-heart.png" alt="" /><img src="/brand/nisfayn-wordmark.png" alt="نصفين" /><span>مساحة الإدارة</span></div>;
}

export function Login({ onDemo }: { onDemo: () => void }) {
  const [signup, setSignup] = useState(false), [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy || !client) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = signup ? await client.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin } }) :
        await client.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (signup && !result.data.session) { setNotice('راجع بريدك لتأكيد الحساب، ثم عد لتسجيل الدخول. صلاحية الإدارة تُمنح فقط للحساب المحجوز مسبقًا.'); setPassword(''); }
    } catch { setError(signup ? 'تعذّر إنشاء الحساب. تحقق من البريد وكلمة المرور أو حاول تسجيل الدخول إن كان لديك حساب.' : 'تعذّر تسجيل الدخول. تحقق من البريد وكلمة المرور وتأكيد الحساب.'); }
    finally { setBusy(false); }
  }
  return <main className="login-layout">
    <section className="login-story"><Brand large /><div><span className="eyebrow">مساحة موثوقة، لبدايات تستحق.</span><h1>كل بداية جادة<br />تستحق عناية.</h1><p>راجع طلبات العضوية، وتابع البلاغات، واحفظ لكل قرار سياقه. من مساحة واحدة، صُمّمت لنصفين.</p></div><span className="story-foot"><ShieldCheck size={18} /> وصول مخصص للفريق · تحقق بخطوتين</span></section>
    <section className="login-panel"><div className="login-card"><span className="login-symbol"><LockKeyhole size={25} /></span><p className="eyebrow">أهلًا بك في نصفين</p><h2>{signup ? 'إعداد حساب الإدارة' : 'تسجيل الدخول'}</h2><p className="muted">{signup ? 'استخدم البريد المحجوز لك. إنشاء الحساب وحده لا يمنح صلاحية الإدارة.' : 'استخدم حساب الفريق، ثم أكمل التحقق بخطوتين.'}</p>
      {configurationError && <p className="notice error" role="alert">{configurationError}</p>}
      {!client && !configurationError && <p className="notice">هذه نسخة تجريبية مستقلة. يمكنك استكشاف الواجهة ببيانات خيالية.</p>}
      {client && <form onSubmit={submit}><label>البريد الإلكتروني<input type="email" dir="ltr" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} disabled={busy} /></label>
        <label>كلمة المرور<input type="password" dir="ltr" autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? 12 : 1} required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} /></label>
        {signup && <small className="muted">اختر كلمة مرور لا تقل عن ١٢ حرفًا.</small>}
        {error && <p className="notice error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
        <button className="primary" disabled={busy}>{busy ? 'لحظة واحدة…' : signup ? 'إنشاء الحساب' : 'متابعة آمنة'}<ArrowLeft size={17} /></button>
        <button type="button" className="text-button" disabled={busy} onClick={() => { setSignup(!signup); setError(''); setNotice(''); }}>{signup ? 'لدي حساب بالفعل' : 'هذه أول مرة؟ إعداد الحساب المحجوز'}</button>
      </form>}
      {client && <small className="auth-foot">يبقى حسابك مسجّلًا على هذا المتصفح حتى تسجّل الخروج أو تنتهي الجلسة.</small>}
      <button type="button" className="secondary demo-entry" onClick={onDemo}>استكشف لوحة تجريبية</button><small className="auth-foot">لا تتضمن التجربة أي بيانات لأعضاء حقيقيين.</small>
    </div></section>
  </main>;
}

export function Mfa({ onVerified, onExit }: { onVerified: () => void; onExit: () => void }) {
  const [factorId, setFactorId] = useState(''), [unverified, setUnverified] = useState<string[]>([]), [qr, setQr] = useState(''), [secret, setSecret] = useState('');
  const [code, setCode] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true; setLoading(true); setError('');
    void client!.auth.mfa.listFactors().then(({ data, error: problem }) => {
      if (!current) return;
      if (problem) setError('تعذّر تحميل وسائل التحقق. حاول مجددًا.');
      else { setFactorId(data.totp.find(f => f.status === 'verified')?.id || ''); setUnverified(data.all.filter(f => f.status !== 'verified' && f.friendly_name === 'Nisfayn Admin').map(f => f.id)); }
      setLoading(false);
    }, () => { if (current) { setLoading(false); setError('تعذّر الاتصال بخدمة التحقق.'); } });
    return () => { current = false; };
  }, [attempt]);
  async function enroll() {
    if (busy || !client) return; setBusy(true); setError('');
    try {
      for (const old of unverified) { const result = await client.auth.mfa.unenroll({ factorId: old }); if (result.error) throw result.error; }
      const { data, error: problem } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Nisfayn Admin' });
      if (problem) throw problem;
      setFactorId(data.id); setQr(data.totp.qr_code); setSecret(data.totp.secret); setUnverified([]);
    } catch { setError('تعذّر بدء إعداد تطبيق التحقق. أعد المحاولة.'); }
    finally { setBusy(false); }
  }
  async function verify(event: FormEvent) {
    event.preventDefault(); if (busy || !client || code.length !== 6) return; setBusy(true); setError('');
    try {
      const { data, error: challengeError } = await client.auth.mfa.challenge({ factorId }); if (challengeError) throw challengeError;
      const result = await client.auth.mfa.verify({ factorId, challengeId: data.id, code }); if (result.error) throw result.error;
      setSecret(''); setQr(''); onVerified();
    } catch { setError('لم يُقبل الرمز. أدخل أحدث رمز من تطبيق التحقق.'); }
    finally { setBusy(false); }
  }
  return <main className="auth-center"><Brand /><section className="mfa-card"><span className="login-symbol"><ShieldCheck size={28} /></span><p className="eyebrow">خطوة لحماية ثقة الأعضاء</p><h1>التحقق بخطوتين</h1><p className="muted">لا تُفتح بيانات الإدارة قبل إكمال التحقق.</p>
    {loading ? <p role="status">جارٍ تحميل وسائل التحقق…</p> : factorId ? <form onSubmit={verify}>
      {qr && <><p>امسح الرمز باستخدام تطبيق التحقق، ثم أدخل الرمز المكوّن من ستة أرقام.</p><img className="mfa-qr" src={qr} alt="رمز إعداد تطبيق التحقق" /><details><summary>إدخال المفتاح يدويًا</summary><code className="mfa-secret" dir="ltr">{secret}</code></details></>}
      <label>رمز التحقق<input className="otp" dir="ltr" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} required autoFocus /></label>
      <button className="primary" disabled={busy || code.length !== 6}>{busy ? 'جارٍ التحقق…' : 'فتح مساحة الإدارة'}<CheckCircle2 size={17} /></button>
    </form> : <button className="primary" onClick={() => void enroll()} disabled={busy}>{busy ? 'جارٍ الإعداد…' : 'ربط تطبيق التحقق'}</button>}
    {error && <p role="alert" className="notice error">{friendly(new Error(error))}</p>}
    {!loading && !factorId && error && <button className="text-button" onClick={() => setAttempt(v => v + 1)}>إعادة تحميل وسائل التحقق</button>}
    <button className="text-button" onClick={onExit} disabled={busy}>تسجيل الخروج</button>
  </section></main>;
}
