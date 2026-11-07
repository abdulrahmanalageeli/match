import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Copy, Download, Eye, EyeOff, HeartHandshake, KeyRound, LockKeyhole, ShieldCheck, UsersRound } from 'lucide-react';
import { Brand } from '../Brand';
import { LegalNotice } from '../legal/LegalNotice';
import { SupportContact, SupportProvider } from '../help/SupportContact';
import { createSupportSource } from '../help/support';
import { feedback as tactileFeedback } from '../feedback/haptics';
import { familyConsentVersion, isFamilyState, validFamilyToken, type FamilyState } from './model';
import { guardianAccess, guardianClient, guardianError, guardianFamilyRequest, guardianLogout, signInGuardian } from './client';
import { FamilyGuardianDashboard } from './FamilyBridge';
import { FamilyLoading } from './FamilyLoading';
import { forgetFamilyInvite, rememberFamilyInvite, restoreFamilyInvite } from './pendingInvite';
import './guardian.css';
import './guidance.css';

export function GuardianPortal({ inviteToken, onExit }: { inviteToken?: string; onExit: () => void }) {
  const [starting, setStarting] = useState(true), [userId, setUserId] = useState<string | null>(null);
  const [account, setAccount] = useState<FamilyState | null>(null);
  const [mode, setMode] = useState<'login' | 'register' | 'recover'>('login');
  const [username, setUsername] = useState(''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [displayName, setDisplayName] = useState(''), [adult, setAdult] = useState(false), [consent, setConsent] = useState(false);
  const [showPassword, setShowPassword] = useState(false), [recoveryInput, setRecoveryInput] = useState('');
  const [recovery, setRecovery] = useState(''), [savedRecovery, setSavedRecovery] = useState(false);
  const [pendingLogin, setPendingLogin] = useState<{ username: string; password: string } | null>(null);
  const [security, setSecurity] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [status, setStatus] = useState(''), [attempt, setAttempt] = useState(0);
  const [pendingInvite, setPendingInvite] = useState(() => inviteToken && validFamilyToken(inviteToken) ? inviteToken : restoreFamilyInvite());
  const [dashboardVersion, setDashboardVersion] = useState(0);
  const generation = useRef(0), mounted = useRef(true), lastIdentity = useRef<string | null>(null);
  const support = useMemo(() => userId ? createSupportSource(guardianClient(), userId) : null, [userId]);
  const request = useMemo(() => userId ? guardianFamilyRequest(userId) : null, [userId]);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (inviteToken && validFamilyToken(inviteToken)) { rememberFamilyInvite(inviteToken); setPendingInvite(inviteToken); } }, [inviteToken]);
  useEffect(() => {
    let active = true;
    try {
      const auth = guardianClient();
      const { data: listener } = auth.auth.onAuthStateChange((_event, session) => {
        if (active) { setUserId(session?.user.id ?? null); setStarting(false); }
      });
      auth.auth.getSession().then(({ data, error }) => {
        if (!active) return;
        if (error) setError(guardianError(error));
        setUserId(data.session?.user.id ?? null); setStarting(false);
      }).catch(cause => { if (active) { setError(guardianError(cause)); setStarting(false); } });
      return () => { active = false; listener.subscription.unsubscribe(); };
    } catch (cause) { setError(guardianError(cause)); setStarting(false); }
    return () => { active = false; };
  }, []);
  useLayoutEffect(() => {
    let active = true; generation.current += 1; setAccount(null); setError('');
    if (lastIdentity.current !== userId) {
      lastIdentity.current = userId;
      setPassword(''); setConfirmation(''); setRecoveryInput(''); setRecovery(''); setPendingLogin(null);
      setSavedRecovery(false); setSecurity(false); setBusy(false); setStatus(''); setShowPassword(false);
      setUsername(''); setDisplayName(''); setAdult(false); setConsent(false);
    }
    if (request) request('state').then(value => {
      if (!active) return;
      if (!isFamilyState(value)) throw Error('تعذّر فتح حساب الأهل.');
      setAccount(value);
    }).catch(cause => { if (active) setError(guardianError(cause)); });
    return () => { active = false; generation.current += 1; };
  }, [request, attempt, userId]);

  async function submit() {
    if (busy) return;
    if (mode !== 'login' && password !== confirmation) { setError('كلمتا المرور غير متطابقتين.'); return; }
    if (mode === 'register' && (!adult || !consent)) return;
    const ticket = generation.current;
    setBusy(true); setError(''); setStatus('');
    try {
      if (mode === 'login') { await signInGuardian(username, password); if (mounted.current && ticket === generation.current) setPassword(''); }
      else {
        const code = await guardianAccess({ action: mode, username, password, ...(mode === 'register' ? { displayName, adult, consentVersion: familyConsentVersion } : { recoveryCode: recoveryInput }) });
        if (!mounted.current || ticket !== generation.current) return;
        setPendingLogin({ username, password }); setRecovery(code); setSavedRecovery(false); setPassword(''); setConfirmation(''); setRecoveryInput('');
      }
    } catch (cause) { if (mounted.current && ticket === generation.current) setError(guardianError(cause)); }
    finally { if (mounted.current && ticket === generation.current) setBusy(false); }
  }
  async function continueAfterRecovery() {
    if (busy || !savedRecovery) return;
    const ticket = generation.current;
    setBusy(true); setError('');
    try {
      if (pendingLogin) await signInGuardian(pendingLogin.username, pendingLogin.password);
      if (!mounted.current || ticket !== generation.current) return;
      setPendingLogin(null); setRecovery(''); setSecurity(false); setStatus('مفتاح الاسترداد محفوظ. أهلًا بك في جسر الأهل.');
    } catch (cause) { if (mounted.current && ticket === generation.current) setError(guardianError(cause)); }
    finally { if (mounted.current && ticket === generation.current) setBusy(false); }
  }
  async function rotateRecovery() {
    if (busy) return;
    const ticket = generation.current; setBusy(true); setError('');
    try {
      const code = await guardianAccess({ action: 'rotate', username, password });
      if (ticket !== generation.current || !mounted.current) return;
      setRecovery(code); setSavedRecovery(false); setPendingLogin(null); setPassword('');
    } catch (cause) { if (ticket === generation.current) setError(guardianError(cause)); }
    finally { if (ticket === generation.current) setBusy(false); }
  }
  async function claim() {
    if (!request || !pendingInvite || busy) return;
    const ticket = generation.current; setBusy(true); setError(''); setStatus('');
    try {
      await request('claim_link', { token: pendingInvite });
      if (ticket !== generation.current) return;
      tactileFeedback('success');
      forgetFamilyInvite(); setPendingInvite(''); setDashboardVersion(value => value + 1);
      setStatus('أُرسل طلب الربط. ينتظر موافقة صاحب الحساب واعتماد الإدارة.');
    } catch (cause) { if (ticket === generation.current) setError(guardianError(cause)); }
    finally { if (ticket === generation.current) setBusy(false); }
  }
  async function exit() {
    try { await guardianLogout(); forgetFamilyInvite(); setAccount(null); setUserId(null); setPassword(''); setRecovery(''); setPendingLogin(null); onExit(); }
    catch (cause) { setError(guardianError(cause)); }
  }
  function recoveryRecord() { return `نصفين · جسر الأهل\nاسم المستخدم: ${username.trim().toLowerCase()}\nمفتاح الاسترداد: ${recovery}\nهذا المفتاح سري، وليس رمز ربط العضو. احفظه مع اسم المستخدم. يتغير بعد استخدامه، ولا تشاركه مع الأسرة أو الدعم.\n`; }
  function downloadRecovery() {
    const blob = new Blob([recoveryRecord()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'nisfayn-family-recovery.txt'; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const feedback = <>{error && <p role="alert" className="fg-feedback fg-error">{error}</p>}{status && <p role="status" className="fg-feedback"><Check size={16}/>{status}</p>}</>;
  const usernameField = <label className="fg-field"><span>اسم المستخدم للدخول</span><input dir="ltr" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} minLength={3} maxLength={24} pattern="[A-Za-z][A-Za-z0-9_]{2,23}" onChange={event => setUsername(event.target.value)} required disabled={busy} placeholder="family_name"/><small>٣–٢٤ حرفًا إنجليزيًا أو رقمًا أو _، يبدأ بحرف. هذا اسم دخولك الخاص؛ يمكنك كتابة اسمك الظاهر للعائلة بالعربية.</small></label>;
  const passwordField = <label className="fg-field"><span>{mode === 'recover' && !security ? 'كلمة المرور الجديدة' : 'كلمة المرور'}</span><span className="fg-password"><input type={showPassword ? 'text' : 'password'} dir="ltr" autoComplete={mode === 'login' || security ? 'current-password' : 'new-password'} value={password} minLength={mode === 'login' || security ? 1 : 12} maxLength={72} onChange={event => setPassword(event.target.value)} required disabled={busy}/><button type="button" aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span></label>;

  if (recovery) return <main className="app-screen fg-portal" dir="rtl"><div className="screen-content fg-content"><Brand compact/><section className="fg-card fg-recovery"><span className="fg-emblem"><KeyRound size={27}/></span><h1>احفظ بيانات استردادك</h1><p>خطوة أخيرة لحماية دخولك. احفظ اسم المستخدم والمفتاح معًا، مثلًا في مدير كلمات المرور الخاص بك. يظهر المفتاح مرة واحدة، ويتغيّر بعد استخدامه.</p><p className="fg-recovery-username">اسم المستخدم: <bdi>{username.trim().toLowerCase()}</bdi></p><input aria-label="مفتاح الاسترداد السري" className="fg-recovery-code" dir="ltr" value={recovery.match(/.{1,4}/g)?.join('-') ?? recovery} readOnly onFocus={event => event.target.select()}/><div className="fg-recovery-actions"><button className="btn-secondary" onClick={() => void navigator.clipboard.writeText(recoveryRecord()).then(() => setStatus('نُسخ اسم المستخدم والمفتاح. احفظهما في مكان خاص.')).catch(() => setError('يمكنك تحديد اسم المستخدم والمفتاح ونسخهما يدويًا.'))}><Copy size={16}/> نسخ بيانات الاسترداد</button><button className="btn-secondary" onClick={downloadRecovery}><Download size={16}/> تنزيل نسخة خاصة</button></div><p className="fg-hint">هذا مفتاح سري لاسترداد حسابك، وليس رمز الربط الذي يرسله العضو. لا تشاركه مع الأسرة أو الدعم. إذا فقدت كلمة المرور والمفتاح معًا، لا تتوفر استعادة الدخول. يمكنك تجديد المفتاح لاحقًا بكلمة مرورك الحالية.</p><label className="fg-check"><input type="checkbox" checked={savedRecovery} onChange={event => setSavedRecovery(event.target.checked)}/><span>حفظت اسم المستخدم والمفتاح في مكان آمن خارج التطبيق.</span></label>{feedback}<button className="btn-primary fg-submit" disabled={!savedRecovery || busy} onClick={() => void continueAfterRecovery()}>{busy ? 'جارٍ الدخول…' : 'متابعة إلى جسر الأهل'}</button></section></div></main>;
  if (request && account?.role === 'guardian' && account.account) return <SupportProvider source={support}><div className="fg-portal" dir="rtl">
    <div className="fg-security-bar"><span><ShieldCheck size={16}/> حساب أهل مستقل</span><button onClick={() => { setSecurity(value => !value); setPassword(''); setError(''); }}><KeyRound size={15}/> أمان الحساب</button></div>
    {security && <section className="fg-card fg-security-card"><h2>تجديد مفتاح الاسترداد</h2><p>أدخل بيانات الدخول لتوليد مفتاح جديد. سيتوقف المفتاح السابق عن العمل.</p><form onSubmit={event => { event.preventDefault(); void rotateRecovery(); }}>{usernameField}{passwordField}<button className="btn-primary fg-submit" disabled={busy}>تجديد المفتاح</button></form></section>}
    {pendingInvite && <section className="fg-invite-banner"><HeartHandshake size={23}/><div><h2>وصلتك دعوة للربط</h2><p>سيظهر اسمك لصاحب الدعوة ليراجع طلبك. محادثاته الخاصة تبقى منفصلة.</p></div><button className="btn-primary" disabled={busy} onClick={() => void claim()}>{busy ? 'جارٍ إرسال الطلب…' : 'إرسال طلب الربط'}</button><button className="btn-secondary" disabled={busy} onClick={() => { forgetFamilyInvite(); setPendingInvite(''); }}>تجاهل الدعوة</button></section>}
    {feedback}<FamilyGuardianDashboard key={dashboardVersion} request={request} onExit={() => void exit()}/>
  </div></SupportProvider>;
  return <main className="app-screen fg-portal" dir="rtl"><div className="screen-content fg-content">
    <header className="fg-navigation"><button className="fg-back" disabled={busy} onClick={() => userId ? void exit() : onExit()}><ArrowRight size={18}/> نصفين</button><Brand compact/></header>
    <section className="fg-cover"><span className="fg-emblem"><UsersRound size={28}/></span><span className="fg-eyebrow">قرب الأهل، بحدود واضحة</span><h1>جسر الأهل</h1><p>مساحتك لمساندة ابنك أو ابنتك أو قريبك وتنسيق الخطوة الرسمية. يختار صاحب الحساب مشاركتك، وتبقى قراراته وخصوصيته له.</p><span className="fg-private"><LockKeyhole size={14}/> محادثة العائلة منفصلة عن المحادثة الخاصة</span></section>
    <ol className="fg-journey" aria-label="كيف تبدأ مشاركة الأهل"><li><strong>حسابك المستقل</strong><span>أنشئ حسابًا واحفظ بيانات استرداده؛ لا يظهر حساب الأهل في الاستكشاف.</span></li><li><strong>ربط بإذن صاحب الحساب</strong><span>استخدم دعوته أو رمزه. يحتاج الربط موافقته واعتماد الإدارة، دون طلب رقم هوية.</span></li><li><strong>دعوة إلى مساحة محددة</strong><span>راجع الأسماء واقبل الدعوة. ترى رسائل هذه المساحة وحدها.</span></li></ol>
    {pendingInvite && !account?.account && <p className="fg-invite-note"><HeartHandshake size={17}/> لديك دعوة. أكمل الدخول ثم أرسل طلب الربط.</p>}{feedback}
    {starting ? <FamilyLoading view="portal"/> : !userId ? <section className="fg-card">
      <div className="fg-mode" role="group" aria-label="نوع الدخول"><button type="button" aria-pressed={mode === 'login'} disabled={busy} onClick={() => { setMode('login'); setError(''); setPassword(''); }}>دخول الأهل</button><button type="button" aria-pressed={mode === 'register'} disabled={busy} onClick={() => { setMode('register'); setError(''); setPassword(''); }}>إنشاء حساب</button></div>
      <h2>{mode === 'register' ? 'بداية مرحّب بها' : mode === 'recover' ? 'استعادة حساب الأهل' : 'أهلًا بعودتك'}</h2><p>{mode === 'recover' ? 'استخدم مفتاحك الاحتياطي لاختيار كلمة مرور جديدة. سنعطيك مفتاحًا جديدًا بعد الاسترداد.' : 'دخول باسم مستخدم وكلمة مرور. حساب الأهل مستقل ولا يظهر في الاستكشاف.'}</p>
      <form onSubmit={event => { event.preventDefault(); void submit(); }}>
        {mode === 'register' && <label className="fg-field"><span>اسمك الذي يظهر للعائلة</span><input autoComplete="name" value={displayName} minLength={2} maxLength={60} required disabled={busy} onChange={event => setDisplayName(event.target.value)}/></label>}
        {usernameField}{mode === 'recover' && <label className="fg-field"><span>مفتاح الاسترداد السري</span><input autoComplete="off" dir="ltr" value={recoveryInput} required maxLength={50} disabled={busy} onChange={event => setRecoveryInput(event.target.value)}/><small>المفتاح الذي حفظته عند إنشاء حسابك؛ ليس رمز ربط العضو. إذا فقدت كلمة المرور والمفتاح معًا، لا تتوفر استعادة الدخول. لا ترسل المفتاح إلى الدعم.</small></label>}{passwordField}
        {mode !== 'login' && <><p className="fg-hint">١٢ حرفًا على الأقل. استخدم عبارة طويلة يصعب تخمينها.</p><label className="fg-field"><span>تأكيد كلمة المرور</span><input type={showPassword ? 'text' : 'password'} dir="ltr" autoComplete="new-password" value={confirmation} required minLength={12} maxLength={72} disabled={busy} onChange={event => setConfirmation(event.target.value)}/></label></>}
        {mode === 'register' && <><label className="fg-check"><input type="checkbox" required checked={adult} disabled={busy} onChange={event => setAdult(event.target.checked)}/><span>أقر أن عمري ١٨ عامًا أو أكثر.</span></label><label className="fg-check"><input type="checkbox" required checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)}/><span>أوافق على شروط الاستخدام وحفظ اسمي وروابط الأهل ورسائل الغرف التي أنضم إليها. أفهم أن المحادثة الخاصة لا تُتاح لي، ويمكنني إلغاء الربط أو حذف حسابي؛ وإغلاق الغرفة يوقف وصول جميع المشاركين إليها.</span></label></>}
        <button className="btn-primary fg-submit" disabled={busy || mode === 'register' && (!adult || !consent)} type="submit">{busy ? 'لحظة من فضلك…' : mode === 'register' ? 'إنشاء حساب الأهل' : mode === 'recover' ? 'حفظ كلمة المرور الجديدة' : 'دخول'}</button>
      </form><div className="fg-auth-actions"><button type="button" disabled={busy} onClick={() => { setMode(mode === 'recover' ? 'login' : 'recover'); setError(''); setPassword(''); setConfirmation(''); }}>{mode === 'recover' ? 'العودة إلى الدخول' : 'نسيت كلمة المرور؟'}</button></div>
      <details className="fg-legal"><summary>الخصوصية وشروط الاستخدام</summary><LegalNotice/></details>
    </section> : <section className="fg-card"><p role="status">{account?.role === 'member' ? 'هذا حساب عضو. يلزم حساب مستقل للأهل.' : error ? 'لم يكتمل فتح الحساب.' : 'جارٍ التحقق من حساب الأهل…'}</p>{error && <button className="btn-secondary" onClick={() => setAttempt(value => value + 1)}>إعادة المحاولة</button>}<button className="fg-back" onClick={() => void exit()}>تسجيل الخروج</button></section>}
    <SupportContact subject="مساعدة في دخول بوابة الأهل" context="حساب أهل مستقل — لا أرفق كلمة المرور أو مفتاح الاسترداد"/>
    <footer className="fg-footnote">الاسم وصلة القرابة إفادات شخصية، وليسا توثيقًا قانونيًا للولاية أو الهوية. لا يمنح الربط صلاحية اتخاذ القرار نيابة عن العضو.</footer>
  </div></main>;
}
