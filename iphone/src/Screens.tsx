import { confirmSignupSms } from './auth/SignupSms';
import type { SignupVerification } from './auth/registrationDevice';
import { useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { MemberPasswordRecovery } from './auth/MemberPasswordRecovery';
import type { SignupAgreements } from './auth/signupReturn';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  ShieldCheck,
  Sparkles,
} from "./BrandIcons";
import { Brand } from "./Brand";
import { phoneOtpEnabled } from "./cloud";
import { PhoneAuth } from "./PhoneAuth";
import { LegalNotice, LEGAL_NOTICE_VERSION } from "./legal/LegalNotice";
import { ConsentChoice } from "./legal/ConsentChoices";
import { SupportContact } from "./help/SupportContact";
import './auth/entry.css';
import { KeyboardDismiss } from './mobile/KeyboardDismiss';
import { Capacitor } from '@capacitor/core';

type Click = () => void;
export function Frame({
  title,
  back,
  children,
  backDisabled = false,
  className = "",
  headerAction,
}: {
  title: string;
  back: Click;
  children: ReactNode;
  backDisabled?: boolean;
  className?: string;
  headerAction?: ReactNode;
}) {
  return (
    <main className={`flow-frame ${className}`.trim()} dir="rtl">
      <header className="flow-header">
        <button
          type="button"
          className="f-icon"
          aria-label="رجوع"
          onClick={back}
          disabled={backDisabled}
        >
          <ArrowRight size={22} />
        </button>
        <span>{title}</span>
        {headerAction}
        <span className="flow-brand">
          <Brand compact />
        </span>
      </header>
      <div className="flow-body">{children}</div>
    </main>
  );
}

export { Welcome } from "./Welcome";

export function Auth({
  login,
  back,
  switchMode,
  submit,
  onSocial,
  busy,
  ready,
  onDemo,
  onPrivacy,
  onPhoneVerified,
}: {
  login: boolean;
  back: Click;
  switchMode: Click;
  submit: (email: string, password: string, consent?: SignupAgreements, verification?: SignupVerification) => void;
  onSocial: (provider: 'apple' | 'google') => void;
  busy: boolean;
  ready: boolean;
  onDemo: Click;
  onPrivacy: Click;
  onPhoneVerified: (memberId: string) => void;
}) {
  const [recovering, setRecovering] = useState(false);
  const [visible, setVisible] = useState(false);
  const [phoneMode, setPhoneMode] = useState(false);
  const [emailMode, setEmailMode] = useState(false);
  const [phonePending, setPhonePending] = useState(false);
  const [agreements, setAgreements] = useState({ adult: false, terms: false, privacy: false });
  const [agreementError, setAgreementError] = useState("");
  const [entryStep, setEntryStep] = useState<'credentials' | 'consent'>('credentials');
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const heading = useRef<HTMLHeadingElement>(null);
  const reviewing = !login && entryStep === 'consent';
  const locked = busy || phonePending;
  const accepted = login || (agreements.adult && agreements.terms && agreements.privacy);
  const nativeSocial = ready && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  useLayoutEffect(() => {
    setAgreements({ adult: false, terms: false, privacy: false });
    setAgreementError("");
    setEntryStep('credentials');
    setPhoneMode(false);
  }, [login]);
  useLayoutEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.closest<HTMLElement>('[data-nf-keyboard-form]')?.scrollTo({ top: 0, behavior: 'instant' });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [entryStep, login]);
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ready || locked) return;
    if (!e.currentTarget.reportValidity()) return;
    setAgreementError("");
    const email = credentials.email.trim(), password = credentials.password;
    if (login) { submit(email, password); return; }
    if (!reviewing) { setEntryStep('consent'); return; }
    if (!accepted) {
      setAgreementError("أكّد العمر، واقبل الشروط، واطّلع على إشعار الخصوصية قبل إنشاء الحساب.");
      return;
    }
    setPhonePending(true);
    try{
      const verification=await confirmSignupSms(email);
      if(verification)submit(email,password,{...agreements,version:LEGAL_NOTICE_VERSION},verification);
    }catch(e){setAgreementError(e instanceof Error?e.message:'تعذّر بدء تأكيد الجوال.');}
    finally{setPhonePending(false);}
  }
  if (recovering) return <MemberPasswordRecovery onBack={() => setRecovering(false)}/>;
  const consentReview = ready && !login ? <fieldset className="nf-consent-review" disabled={locked} aria-describedby="auth-agreement-help">
    <legend className="nf-auth-sr-only">الموافقات المطلوبة لإنشاء الحساب</legend>
    {(["adult", "terms", "privacy"] as const).map(kind => <ConsentChoice key={kind} kind={kind} checked={agreements[kind]} change={value => {
      setAgreements(current => ({ ...current, [kind]: value }));
      setAgreementError("");
    }} />)}
    <button type="button" className="nf-privacy-link" onClick={onPrivacy}>قراءة شروط الاستخدام وإشعار الخصوصية</button>
    <p id="auth-agreement-help">الخيارات الثلاثة مطلوبة لإنشاء الحساب. أذونات الصورة والتفاصيل الحساسة والتقييم تُعرض منفصلة أثناء إعداد الملف.</p>
    {agreementError && <p role="alert" className="form-error">{agreementError}</p>}
  </fieldset> : null;
  return (
    <Frame back={reviewing ? () => setEntryStep('credentials') : back} backDisabled={locked} title={login ? "تسجيل الدخول" : reviewing ? "مراجعة الحساب" : "حساب جديد"} className="nf-auth-frame" headerAction={<KeyboardDismiss/>}>
      <section className="nf-auth-hero">
        <h1 ref={heading} tabIndex={-1}>{login ? "أهلًا بعودتك" : reviewing ? "قبل أن نبدأ" : "حسابك في وُدَين"}</h1>
        <p className="flow-intro">{login ? "سجّل الدخول لمتابعة محادثاتك." : reviewing ? "راجع الموافقات، ثم نؤكد رقم جوالك السعودي وننشئ حسابك." : "أنشئ حسابك الآمن أولًا؛ بعدها نؤكد الجوال ونحفظ تقدّمك في طلب العضوية."}</p>
        {!login && !reviewing && <section className="nf-auth-brief" aria-label="مسار طلب العضوية وتكلفته">
          <p><strong>المسار واضح من البداية</strong><span>لا قبول ولا دفع بمجرد إنشاء الحساب.</span></p>
          <ul>
            <li><ShieldCheck size={18} aria-hidden="true"/><span><strong>مراجعة عضوية</strong><small>بعد اكتمال الملف</small></span></li>
            <li><Sparkles size={18} aria-hidden="true"/><span><strong>جلسة توافق إلزامية</strong><small>تراجع إجاباتك بنفسك</small></span></li>
            <li><Check size={18} aria-hidden="true"/><span><strong>استكشاف مجاني</strong><small>بعد اعتماد الملف</small></span></li>
          </ul>
          <p className="nf-auth-price">يمكنك متابعة الاستكشاف مجانًا. الاشتراك اختياري، وسترى السعر وأي تجربة متاحة لك قبل تأكيد الشراء في Apple.</p>
        </section>}
      </section>
      <section className="nf-auth-panel">
      {nativeSocial && !reviewing && !phoneMode && <div className="nf-social-login" aria-label="خيارات تسجيل الدخول">
        <button type="button" disabled={locked} onClick={() => onSocial('apple')}>المتابعة باستخدام Apple</button>
        <button type="button" disabled={locked} onClick={() => onSocial('google')}>المتابعة باستخدام Google</button>
        <p>سنؤكد رقم جوالك عند إنشاء حساب جديد.</p>
      </div>}
      {nativeSocial && !reviewing && !phoneMode && <button type="button" className="f-link centered" disabled={locked} onClick={() => setEmailMode(value => !value)}>{emailMode ? 'إخفاء البريد الإلكتروني' : 'المتابعة بالبريد الإلكتروني للحسابات الحالية'}</button>}
      {phoneMode && consentReview}
      {ready && phoneMode ? <PhoneAuth login={login} onVerified={onPhoneVerified} busy={locked || !accepted} setBusy={setPhonePending} /> : ready && (!nativeSocial || emailMode || reviewing) ? (
        <form className="flow-form" onSubmit={send} aria-busy={locked} data-entry-step={reviewing ? 'consent' : 'credentials'}>
          {!reviewing && <div className="nf-auth-input-group"><label>
            البريد الإلكتروني
            <input
              dir="ltr"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="email"
              enterKeyHint="next"
              type="email"
              name="email"
              value={credentials.email}
              onChange={event => setCredentials(current => ({ ...current, email: event.target.value }))}
              required
              maxLength={254}
              placeholder="name@example.com"
            />
          </label>
          <label>
            كلمة المرور
            <span className="password-wrap">
              <input
                dir="ltr"
                autoComplete={login ? "current-password" : "new-password"}
                type={visible ? "text" : "password"}
                name="password"
                value={credentials.password}
                onChange={event => setCredentials(current => ({ ...current, password: event.target.value }))}
                placeholder={login ? "كلمة المرور" : "١٠ أحرف على الأقل"}
                minLength={login ? 1 : 10}
                maxLength={128}
                required
                enterKeyHint={login ? "go" : "done"}
                aria-describedby={login ? undefined : "nf-password-help"}
              />
              <button
                type="button"
                onClick={() => setVisible(!visible)}
                aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                aria-pressed={visible}
              >
                {visible ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </span>
          </label></div>}
          {!login && !reviewing && <p id="nf-password-help" className="nf-auth-field-help">اختر كلمة مرور من ١٠ أحرف على الأقل، خاصة بهذا الحساب.</p>}
          {reviewing && <><div className="nf-auth-account-summary"><span>البريد الإلكتروني</span><bdi dir="ltr">{credentials.email.trim()}</bdi><button type="button" onClick={() => setEntryStep('credentials')} disabled={locked}>تعديل</button></div>{consentReview}</>}
          <button className="f-primary" disabled={locked || (reviewing && !accepted)}>
            {locked ? phonePending ? "جارٍ تأكيد الجوال…" : "جارٍ المتابعة…" : login ? "تسجيل الدخول" : reviewing ? "إنشاء الحساب" : "متابعة"}
            <ArrowLeft size={18} />
          </button>
        </form>
      ) : !ready ? (
        <div className="flow-card">
          <p>
            تعذّر الاتصال بخدمة الحسابات حاليًا. حاول مجددًا لاحقًا أو تواصل معنا للمساعدة.
          </p>
          <SupportContact subject="المساعدة في إنشاء الحساب أو تسجيل الدخول" />
        </div>
      ) : null}
      {login && !phoneMode && <button type="button" className="f-link centered" disabled={locked} onClick={() => setRecovering(true)}>نسيت كلمة المرور؟</button>}
      {ready && (
        <>
        {phoneOtpEnabled && login && <button className="f-secondary" disabled={locked} type="button" onClick={() => setPhoneMode(mode => !mode)}>
          {phoneMode ? "استخدام البريد الإلكتروني" : "استخدام رقم الجوال"}
        </button>}
        <button className="f-link centered" onClick={switchMode} disabled={locked}>
          {login ? "إنشاء حساب جديد" : "لدي حساب بالفعل"}
        </button>
        </>
      )}
      </section>
    </Frame>
  );
}

export function Pending({
  back,
  refresh,
  busy,
}: {
  back: Click;
  refresh: Click;
  busy: boolean;
}) {
  return (
    <Frame title="حالة الطلب" back={back} className="nf-signup-status">
      <div className="flow-symbol">
        <ShieldCheck />
      </div>
      <h1>طلبك قيد المراجعة</h1>
      <p className="flow-intro">
        وصل ملفك، والخطوة الحالية هي مراجعته. بعد المراجعة نوضح لك النتيجة والخطوة المتاحة في حسابك، دون وعد بموعد أو ترشيح محدد.
      </p>
      <div className="flow-card timeline">
        <strong>
          <Check size={18} /> استلمنا الطلب
        </strong>
        <strong>
          <span className="timeline-dot" /> نراجع الملف
        </strong>
        <span>
          <span className="timeline-dot hollow" /> نتيجة المراجعة وإتاحة التعارف عند القبول
        </span>
        <span>
          <span className="timeline-dot hollow" /> اختيار العضوية عند توفرها وتأكيد الشراء
        </span>
      </div>
      <div className="flow-card nf-waiting-guidance">
        <h2>ماذا أفعل الآن؟</h2>
        <p>راجع الحالة من هذه الصفحة. لا توجد مدة مراجعة ثابتة معلنة، ولا يعني الانتظار رفضًا أو حكمًا عليك. إن احتجت توضيحًا، تواصل مع الفريق أدناه.</p>
        <p>إرسال الملف لا يبدأ اشتراكًا جديدًا. إن كان لديك اشتراك قائم، فإنه يستمر حتى تلغيه من Apple.</p>
        <p>في الويب، تظهر التحديثات أثناء فتح الموقع؛ لا تعتمد على تنبيه بعد إغلاق المتصفح.</p>
      </div>
      <button className="f-secondary" onClick={refresh} disabled={busy}>
        {busy ? "جارٍ تحديث الحالة…" : "تحديث حالة الطلب"}
      </button>
      <SupportContact subject="استفسار عن مراجعة ملف وُدَين" context="أرغب في الاستفسار عن حالة مراجعة ملفي." />
    </Frame>
  );
}

export { Membership } from './membership/Membership';

export function Policy() {
  return <LegalNotice />;
}

export function DemoNotice({ onExit, gender, onGenderChange }: { onExit: Click; gender?: "woman" | "man"; onGenderChange?: (gender: "woman" | "man") => void }) {
  return (
    <div className="demo-notice" dir="rtl">
      <span>
        <Sparkles size={13} /> وضع التجربة
      </span>
      {onGenderChange && <select className="demo-pool" aria-label="نوع الملفات في التجربة" value={gender} onChange={event => onGenderChange(event.target.value as "woman" | "man")}>
        <option value="woman">ملفات الرجال</option>
        <option value="man">ملفات النساء</option>
      </select>}
      <button onClick={onExit}>خروج</button>
    </div>
  );
}
import {WhyWudayn} from './WhyWudayn';
