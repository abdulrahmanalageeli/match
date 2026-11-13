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
  LockKeyhole,
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
import { membershipPriceLabel } from './membershipPricing';

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
  busy: boolean;
  ready: boolean;
  onDemo: Click;
  onPrivacy: Click;
  onPhoneVerified: (memberId: string) => void;
}) {
  const [recovering, setRecovering] = useState(false);
  const [visible, setVisible] = useState(false);
  const [phoneMode, setPhoneMode] = useState(false);
  const [phonePending, setPhonePending] = useState(false);
  const [agreements, setAgreements] = useState({ adult: false, terms: false, privacy: false });
  const [agreementError, setAgreementError] = useState("");
  const [entryStep, setEntryStep] = useState<'credentials' | 'consent'>('credentials');
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const heading = useRef<HTMLHeadingElement>(null);
  const reviewing = !login && entryStep === 'consent';
  const locked = busy || phonePending;
  const accepted = login || (agreements.adult && agreements.terms && agreements.privacy);
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
            <li><Sparkles size={18} aria-hidden="true"/><span><strong>جلسة توافق إلزامية</strong><small>وتعتمد تفسيرها بنفسك</small></span></li>
            <li><Check size={18} aria-hidden="true"/><span><strong>٧ أيام بلا دفع</strong><small>لا نطلب بطاقة</small></span></li>
          </ul>
          <p className="nf-auth-price">بعد التجربة: {membershipPriceLabel()} شهريًا حسب نوع العضوية. أي شراء لاحق يحتاج موافقتك في Apple.</p>
        </section>}
      </section>
      <section className="nf-auth-panel">
      {phoneMode && consentReview}
      {ready && phoneMode ? <PhoneAuth login={login} onVerified={onPhoneVerified} busy={locked || !accepted} setBusy={setPhonePending} /> : ready ? (
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
      ) : (
        <div className="flow-card">
          <p>
            تعذّر الاتصال بخدمة الحسابات حاليًا. حاول مجددًا لاحقًا أو تواصل معنا للمساعدة.
          </p>
          <SupportContact subject="المساعدة في إنشاء الحساب أو تسجيل الدخول" />
        </div>
      )}
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
      {login && <section className="nf-login-accounts" aria-label="اختَر حسابك">
        <p>اختَر حسابك</p>
        <div>
          <a href="?test=1&actor=abdulrahman" aria-disabled={locked} onClick={event=>{if(locked)event.preventDefault();}}><span className="nf-login-initial" aria-hidden="true">ع</span><span><strong>عبدالرحمن</strong><small><LockKeyhole size={13} aria-hidden="true"/> بكلمة مرور</small></span><ArrowLeft size={16} aria-hidden="true"/></a>
          <a href="?test=1&actor=reham" aria-disabled={locked} onClick={event=>{if(locked)event.preventDefault();}}><span className="nf-login-initial" aria-hidden="true">ر</span><span><strong>رهام</strong><small>بدون كلمة مرور</small></span><ArrowLeft size={16} aria-hidden="true"/></a>
        </div>
      </section>}
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

export function Membership({
  back,
  active,
  demo,
  price,
  canStart,
  canBuy,
  busy,
  buy,
  restore,
  manage,
  refresh,
  expiry,
  onPolicy,
}: {
  back: Click;
  active: boolean;
  demo: boolean;
  price: string | null;
  canStart: boolean;
  canBuy: boolean;
  busy: boolean;
  buy: Click;
  restore: Click;
  manage: Click;
  refresh: Click;
  expiry: string | null;
  onPolicy: Click;
}) {
  const until = expiry ? new Date(expiry) : null;
  return (
    <Frame title="العضوية" back={back}>
      <h1>{active ? "عضويتك الحالية" : "عضوية وُدَين"}</h1>
      <p className="flow-intro">
        {active || canStart
          ? "مساحتك الخاصة للترشيحات وطلبات التعارف."
          : "تم اعتماد طلبك. ننتظر توفر عضو تتوافق تفضيلاته مع تفضيلاتك قبل فتح الاشتراك."}
      </p>
      {!active && !canStart && <div className="flow-card nf-waiting-guidance"><h2>ملفك معتمد، وننتظر توفرًا مناسبًا</h2><p>هذه مرحلة مختلفة عن مراجعة الملف. لا تحتاج إلى شراء العضوية الآن، ولا توجد مدة مضمونة لتوفر ترشيح. قلة الملفات المناسبة لا تعني وجود مشكلة فيك، ولا يلزم تغيير حدودك الأساسية.</p><p>يمكنك تحديث الحالة هنا أو مراجعة تفضيلاتك من الإعدادات باختيارك.</p><SupportContact subject="استفسار عن توفر الترشيحات في وُدَين" /></div>}
      <section className="nf-membership" aria-label="تفاصيل العضوية">
        <header>
          <span>عضوية وُدَين</span>
          <span className="nf-membership-seal" aria-hidden="true">
            <img src="/brand/wudayn-emblem-v2.png" alt="" width="29" height="30" />
          </span>
        </header>
        <b className="nf-member-price">
          {price ||
            (demo
              ? "سعر التجربة حسب الملف"
              : active
                ? "عضوية فعّالة"
                : "السعر متاح عبر App Store")}
        </b>
        <span className="nf-member-term">اشتراك شهري</span>
        {demo && <small>سعر توضيحي للتجربة؛ السعر الفعلي يظهر من Apple قبل الشراء.</small>}
      </section>
      <ul className="nf-member-benefits">
        <li><Check size={16} aria-hidden="true" /> توافق مُفسّر: ما يجمعكما وما يستحق النقاش</li>
        <li><Check size={16} aria-hidden="true" /> اتفاق جدّية ومدة وخطوة تالية واضحة</li>
        <li><Check size={16} aria-hidden="true" /> تعارف حصري بموافقتكما وجسر خاص للأهل</li>
      </ul>
      <WhyWudayn label="تعرّف على المنهج وراء عضويتك"/>
      {active ? (
        <p className="flow-note">
          {demo
            ? "أنت في تجربة توضيحية مجانية."
            : until && !isNaN(until.getTime())
              ? "العضوية سارية حتى " +
                until.toLocaleDateString("ar-SA", {
                  calendar: "gregory",
                  dateStyle: "long",
                }) +
                "."
              : "عضويتك سارية."}
        </p>
      ) : (
        <p className="flow-note">
          اشتراك شهري يتجدد تلقائيًا حتى الإلغاء. يظهر السعر النهائي في نافذة
          Apple قبل تأكيد الشراء.
        </p>
      )}
      {demo ? (
        <button className="f-primary" onClick={back}>
          العودة للتجربة
        </button>
      ) : active ? (
        <button
          className="f-secondary"
          disabled={!canBuy || busy}
          onClick={manage}
        >
          إدارة الاشتراك في Apple
        </button>
      ) : (
        <>
          <button
            className="f-primary"
            disabled={!canStart || !canBuy || !price || busy}
            onClick={buy}
          >
            اشترك شهريًا
          </button>
          {(!canStart || !price) && (
            <button
              className="f-link centered"
              disabled={busy}
              onClick={refresh}
            >
              تحديث حالة العضوية
            </button>
          )}
          {!canBuy && (
            <p className="flow-note">
              يتاح الاشتراك من تطبيق وُدَين على iPhone.
            </p>
          )}
        </>
      )}
      {!demo && (
        <button
          className="f-link centered"
          disabled={busy || !canBuy}
          onClick={restore}
        >
          استعادة المشتريات
        </button>
      )}
      <button className="f-link centered" onClick={onPolicy}>
        الخصوصية وشروط العضوية
      </button>
    </Frame>
  );
}

export function Policy() {
  return <LegalNotice />;
}

export function DemoNotice({ onExit, gender, onGenderChange }: { onExit: Click; gender?: "woman" | "man"; onGenderChange?: (gender: "woman" | "man") => void }) {
  return (
    <div className="demo-notice" dir="rtl">
      <span>
        <Sparkles size={13} /> تجربة بملفات خيالية
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
