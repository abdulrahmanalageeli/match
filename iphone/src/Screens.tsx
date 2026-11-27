import { confirmSignupSms } from './auth/SignupSms';
import type { SignupVerification } from './auth/registrationDevice';
import { useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { MemberPasswordRecovery } from './auth/MemberPasswordRecovery';
import { emptyRegistrationChoices, registrationComplete, registrationVersion, type SignupAgreements } from './auth/signupReturn';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  ShieldCheck,
} from "./BrandIcons";
import { Brand } from "./Brand";
import { phoneOtpEnabled } from "./cloud";
import { PhoneAuth } from "./PhoneAuth";
import { LegalNotice, LEGAL_NOTICE_VERSION } from "./legal/LegalNotice";
import { RegistrationAgreements } from './legal/RegistrationAgreements';
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
  useLayoutEffect(() => {
    const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const color = getComputedStyle(document.documentElement).getPropertyValue('--nf-edge-top').trim();
    if (!theme || !color) return;
    const previous = theme.content;
    theme.content = color;
    return () => { theme.content = previous; };
  }, [className]);
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

function AppleProviderMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.1 12.5c0-2.4 2-3.6 2.1-3.7a4.6 4.6 0 0 0-3.6-1.9c-1.6-.2-3 .9-3.8.9-.8 0-2-1-3.3-1-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.5 1.3 0 1.8-.8 3.4-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5a11 11 0 0 0 1.4-2.9 4.1 4.1 0 0 1-2-4.1ZM14.6 5.3A4.2 4.2 0 0 0 15.6 2a4.5 4.5 0 0 0-3 1.6 4 4 0 0 0-1 3.1c1.1.1 2.2-.5 3-1.4Z"/></svg>;
}

function GoogleProviderMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285f4" d="M22.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.3h6a5.1 5.1 0 0 1-2.2 3.3v2.8h3.6c2.1-1.9 3.2-4.8 3.2-8.2Z"/>
    <path fill="#34a853" d="M12 23c3 0 5.5-1 7.4-2.6l-3.6-2.8c-1 .7-2.3 1-3.8 1a6.5 6.5 0 0 1-6.1-4.5H2.2V17A11.2 11.2 0 0 0 12 23Z"/>
    <path fill="#fbbc05" d="M5.9 14.1a6.7 6.7 0 0 1 0-4.2V7H2.2a11 11 0 0 0 0 10l3.7-2.9Z"/>
    <path fill="#ea4335" d="M12 5.4c1.7 0 3.2.6 4.4 1.7l3.1-3.1A10.4 10.4 0 0 0 12 1 11.2 11.2 0 0 0 2.2 7l3.7 2.9A6.5 6.5 0 0 1 12 5.4Z"/>
  </svg>;
}

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
  onSocial: (provider: 'apple' | 'google', receipt?: SignupAgreements) => void;
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
  const [agreements, setAgreements] = useState(emptyRegistrationChoices);
  const [agreementError, setAgreementError] = useState("");
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const heading = useRef<HTMLHeadingElement>(null);
  const locked = busy || phonePending;
  const accepted = login || registrationComplete(agreements);
  const nativeSocial = ready && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  const socialMode = nativeSocial && !emailMode && !phoneMode;
  const entryMode = socialMode ? 'social' : phoneMode ? 'phone' : 'email';
  useLayoutEffect(() => {
    setAgreements(emptyRegistrationChoices());
    setAgreementError("");
    setPhoneMode(false);
  }, [login]);
  useLayoutEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.closest<HTMLElement>('[data-nf-keyboard-form]')?.scrollTo({ top: 0, behavior: 'instant' });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [login, emailMode, phoneMode]);
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ready || locked) return;
    if (!e.currentTarget.reportValidity()) return;
    setAgreementError("");
    const email = credentials.email.trim(), password = credentials.password;
    if (login) { submit(email, password); return; }
    if (!accepted) {
      setAgreementError("راجع شروط العضوية وموافقات التوافق قبل إنشاء الحساب.");
      return;
    }
    setPhonePending(true);
    try{
      const verification=await confirmSignupSms(email);
      if(verification)submit(email,password,{...agreements,version:LEGAL_NOTICE_VERSION,registrationVersion},verification);
    }catch(e){setAgreementError(e instanceof Error?e.message:'تعذّر بدء تأكيد الجوال.');}
    finally{setPhonePending(false);}
  }
  if (recovering) return <MemberPasswordRecovery onBack={() => setRecovering(false)}/>;
  const switchAccount = ready && <button type="button" className="f-link centered" onClick={switchMode} disabled={locked}>
    {login ? "إنشاء حساب جديد" : "لدي حساب بالفعل"}
  </button>;
  const receipt = login ? undefined : { ...agreements, version: LEGAL_NOTICE_VERSION, registrationVersion };
  const consentReview = ready && !login && <RegistrationAgreements value={agreements} change={setAgreements} onPrivacy={onPrivacy} disabled={locked}/>;
  return (
    <Frame back={back} backDisabled={locked} title={login ? "تسجيل الدخول" : "حساب جديد"} className="nf-auth-frame" headerAction={<KeyboardDismiss/>}>
      <section key={`${login ? 'login' : 'signup'}-${entryMode}`} className="nf-auth-hero" data-auth-stage={login ? 'login' : 'signup'} data-auth-mode={entryMode}>
        <div className="nf-auth-signature" aria-hidden="true">
          <span />
          <img src="/brand/wudayn-emblem-v2.png" alt="" width="34" height="40" />
          <span />
        </div>
        <h1 ref={heading} tabIndex={-1}>{login ? "أهلًا بعودتك" : "حسابك في وُدَين"}</h1>
        {!login && <details className="nf-auth-brief">
          <summary><ShieldCheck size={17} aria-hidden="true"/><span>طلب العضوية مجاني</span><ChevronDown size={15} aria-hidden="true"/></summary>
          <p>إذا اكتمل التحقق من ملفك، تقدر تستكشف مجانًا. الباقات المدفوعة باختيارك.</p>
        </details>}
      </section>
      <section key={`${login ? 'login' : 'signup'}-${entryMode}-panel`} className="nf-auth-panel" data-auth-mode={entryMode}>
      {nativeSocial && !emailMode && !phoneMode && consentReview}
      {nativeSocial && !emailMode && !phoneMode && <div className="nf-social-login" aria-label="خيارات تسجيل الدخول">
        <button type="button" className="nf-provider-button nf-provider-button--apple" disabled={locked || !accepted} onClick={() => onSocial('apple', receipt)}>
          <span className="nf-provider-mark"><AppleProviderMark/></span><span>المتابعة باستخدام Apple</span><ArrowLeft size={17}/>
        </button>
        <button type="button" className="nf-provider-button nf-provider-button--google" disabled={locked || !accepted} onClick={() => onSocial('google', receipt)}>
          <span className="nf-provider-mark"><GoogleProviderMark/></span><span>المتابعة باستخدام Google</span><ArrowLeft size={17}/>
        </button>
      </div>}
      {phoneMode && consentReview}
      {ready && phoneMode ? <PhoneAuth login={login} onVerified={onPhoneVerified} busy={locked || !accepted} setBusy={setPhonePending} /> : ready && (!nativeSocial || emailMode) ? (
        <form className="flow-form" onSubmit={send} aria-busy={locked} data-entry-step="credentials">
          {<div className="nf-auth-input-group"><label>
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
                placeholder="كلمة المرور"
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
          {!login && <p id="nf-password-help" className="nf-auth-field-help">١٠ أحرف على الأقل.</p>}
          {consentReview}
          {agreementError && <p role="alert" className="form-error">{agreementError}</p>}
          <div className="nf-auth-submit">
            <button className="f-primary" disabled={locked || !accepted}>
              {locked ? phonePending ? "جارٍ تأكيد الجوال…" : "جارٍ المتابعة…" : login ? "تسجيل الدخول" : "تأكيد الجوال وإنشاء الحساب"}
              <ArrowLeft size={18} />
            </button>
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
        {nativeSocial && !phoneMode && <button type="button" className="f-link" disabled={locked} onClick={() => setEmailMode(value => !value)}>
          {emailMode ? 'خيارات الدخول الأخرى' : 'المتابعة بالبريد الإلكتروني'}
        </button>}
        {login && !phoneMode && <button type="button" className="f-link" disabled={locked} onClick={() => setRecovering(true)}>نسيت كلمة المرور؟</button>}
        {ready && phoneOtpEnabled && login && <button className="f-secondary" disabled={locked} type="button" onClick={() => {
          if (phoneMode && nativeSocial) setEmailMode(true);
          setPhoneMode(mode => !mode);
        }}>
          {phoneMode ? "استخدام البريد الإلكتروني" : "استخدام رقم الجوال"}
        </button>}
        {switchAccount}
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
        تتحدّث حالة طلبك هنا تلقائيًا.
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

import {WhyWudayn} from './WhyWudayn';
