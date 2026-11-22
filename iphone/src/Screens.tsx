import { confirmSignupSms } from './auth/SignupSms';
import type { SignupVerification } from './auth/registrationDevice';
import { useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { MemberPasswordRecovery } from './auth/MemberPasswordRecovery';
import type { SignupAgreements } from './auth/signupReturn';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
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
  }, [entryStep, login, emailMode, phoneMode]);
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
  const switchAccount = ready && <button type="button" className="f-link centered" onClick={switchMode} disabled={locked}>
    {login ? "إنشاء حساب جديد" : "لدي حساب بالفعل"}
  </button>;
  const consentReview = ready && !login ? <fieldset className="nf-consent-review" disabled={locked} aria-describedby="auth-agreement-help">
    <legend className="nf-auth-sr-only">الموافقات المطلوبة لإنشاء الحساب</legend>
    <p id="auth-agreement-help">إعداد ملفك يتطلّب موافقتين منفصلتين لمعالجة التفاصيل الحساسة وعرضها للأعضاء المؤهلين، وأذونات للصورة والتقييم.</p>
    {(["adult", "terms", "privacy"] as const).map(kind => <ConsentChoice key={kind} kind={kind} checked={agreements[kind]} change={value => {
      setAgreements(current => ({ ...current, [kind]: value }));
      setAgreementError("");
    }} />)}
    <button type="button" className="nf-privacy-link" onClick={onPrivacy}>قراءة شروط الاستخدام وإشعار الخصوصية</button>
    {agreementError && <p role="alert" className="form-error">{agreementError}</p>}
  </fieldset> : null;
  return (
    <Frame back={reviewing ? () => setEntryStep('credentials') : back} backDisabled={locked} title={login ? "تسجيل الدخول" : reviewing ? "مراجعة الحساب" : "حساب جديد"} className="nf-auth-frame" headerAction={<KeyboardDismiss/>}>
      <section className="nf-auth-hero">
        <h1 ref={heading} tabIndex={-1}>{login ? "أهلًا بعودتك" : reviewing ? "موافقات الحساب" : "حسابك في وُدَين"}</h1>
        <p className="flow-intro">{login ? "سجّل الدخول لمتابعة محادثاتك." : reviewing ? "بعد الموافقة، نؤكّد رقم جوالك السعودي." : "أكّد جوالك السعودي واحفظ تقدّمك في طلب العضوية."}</p>
        {!login && !reviewing && <details className="nf-auth-brief">
          <summary><ShieldCheck size={17} aria-hidden="true"/><span>طلب العضوية مجاني</span><ChevronDown size={15} aria-hidden="true"/></summary>
          <p>بعد جلسة التوافق، راجع إجاباتك وأرسل ملفك. إذا اكتمل التحقق، يفتح لك الاستكشاف المجاني مباشرة. إذا بقيت خطوة للاعتماد، تتابعها من حالة الطلب. تقدر تختار باقة مدفوعة لاحقًا.</p>
        </details>}
      </section>
      <section className="nf-auth-panel">
      {nativeSocial && !emailMode && !reviewing && !phoneMode && <div className="nf-social-login" aria-label="خيارات تسجيل الدخول">
        <button type="button" disabled={locked} onClick={() => onSocial('apple')}>المتابعة باستخدام Apple</button>
        <button type="button" disabled={locked} onClick={() => onSocial('google')}>المتابعة باستخدام Google</button>
      </div>}
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
          <div className={reviewing ? 'nf-auth-review-actions' : 'nf-auth-submit'}>
            <button className="f-primary" disabled={locked || (reviewing && !accepted)}>
              {locked ? phonePending ? "جارٍ تأكيد الجوال…" : "جارٍ المتابعة…" : login ? "تسجيل الدخول" : reviewing ? "إنشاء الحساب" : "متابعة"}
              <ArrowLeft size={18} />
            </button>
            {reviewing && switchAccount}
          </div>
        </form>
      ) : !ready ? (
        <div className="flow-card">
          <p>
            تعذّر الاتصال بخدمة الحسابات حاليًا. حاول مجددًا لاحقًا أو تواصل معنا للمساعدة.
          </p>
          <SupportContact subject="المساعدة في إنشاء الحساب أو تسجيل الدخول" />
        </div>
      ) : null}
      <div className="nf-auth-alternatives">
        {nativeSocial && !reviewing && !phoneMode && <button type="button" className="f-link" disabled={locked} onClick={() => setEmailMode(value => !value)}>
          {emailMode ? 'خيارات الدخول الأخرى' : 'المتابعة بالبريد الإلكتروني'}
        </button>}
        {login && !phoneMode && <button type="button" className="f-link" disabled={locked} onClick={() => setRecovering(true)}>نسيت كلمة المرور؟</button>}
        {ready && phoneOtpEnabled && login && <button className="f-secondary" disabled={locked} type="button" onClick={() => {
          if (phoneMode && nativeSocial) setEmailMode(true);
          setPhoneMode(mode => !mode);
        }}>
          {phoneMode ? "استخدام البريد الإلكتروني" : "استخدام رقم الجوال"}
        </button>}
        {!reviewing && switchAccount}
      </div>
      </section>
    </Frame>
  );
}

export function Pending({
  back,
  refresh,
  busy,
  retryPhoto,
}: {
  back: Click;
  refresh: Click;
  busy: boolean;
  retryPhoto?: Click;
}) {
  if (retryPhoto) return (
    <Frame title="حالة الطلب" back={back} className="nf-signup-status">
      <h1><ShieldCheck size={23} aria-hidden="true"/>بقي حفظ صورتك</h1>
      <p className="flow-intro">وصلتنا إجاباتك. أعد محاولة حفظ الصورة التي جهّزتها حتى يكتمل التحقق من طلبك.</p>
      <button className="f-primary" disabled={busy} onClick={retryPhoto}>{busy ? 'جارٍ حفظ الصورة…' : 'إعادة محاولة حفظ الصورة'}</button>
    </Frame>
  );
  return (
    <Frame title="حالة الطلب" back={back} className="nf-signup-status">
      <h1><ShieldCheck size={23} aria-hidden="true"/> طلبك قيد المراجعة</h1>
      <p className="flow-intro">
        وصلنا ملفك. نتحقّق من الطلب، ويتولى الفريق مراجعته عند الحاجة. تتحدّث حالته هنا تلقائيًا.
      </p>
      <div className="flow-card timeline">
        <strong>
          <Check size={18} /> استلمنا الطلب
        </strong>
        <strong aria-current="step">
          <span className="timeline-dot" /> نراجع الملف
        </strong>
        <span>
          <span className="timeline-dot hollow" /> نتيجة المراجعة وإتاحة التعارف عند القبول
        </span>
        <span>
          <span className="timeline-dot hollow" /> اختيار العضوية عند توفرها وتأكيد الشراء
        </span>
      </div>
      <details className="nf-waiting-guidance">
        <summary>ماذا يحدث بعد المراجعة؟ <ChevronDown size={16} aria-hidden="true"/></summary>
        <p>بعد القبول، يمكنك الاستكشاف مجانًا. يبدأ الاشتراك المدفوع إذا اخترت باقة وأكّدت الشراء.</p>
        <p>يمكنك تحديث الحالة هنا أو سؤال الفريق عن طلبك.{!Capacitor.isNativePlatform() && ' في المتصفح، تصلك التحديثات أثناء فتح الموقع.'}</p>
      </details>
      <button className="f-secondary" onClick={refresh} disabled={busy}>
        {busy ? "جارٍ تحديث الحالة…" : "تحديث حالة الطلب"}
      </button>
      <details className="nf-waiting-guidance">
        <summary>تواصل مع فريق وُدَين <ChevronDown size={16} aria-hidden="true"/></summary>
        <SupportContact subject="استفسار عن مراجعة ملف وُدَين" context="أرغب في الاستفسار عن حالة مراجعة ملفي." />
      </details>
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
