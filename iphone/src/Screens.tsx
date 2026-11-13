import { confirmSignupSms } from './auth/SignupSms';
import type { SignupVerification } from './auth/registrationDevice';
import { useLayoutEffect, useState, type FormEvent, type ReactNode } from "react";
import { MemberPasswordRecovery } from './auth/MemberPasswordRecovery';
import {JoinAdvantages} from './JoinAdvantages';
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
  const locked = busy || phonePending;
  const accepted = login || (agreements.adult && agreements.terms && agreements.privacy);
  useLayoutEffect(() => {
    setAgreements({ adult: false, terms: false, privacy: false });
    setAgreementError("");
  }, [login]);
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ready || locked) return;
    if (!accepted) {
      setAgreementError("أكّد العمر، واقبل الشروط، واطّلع على إشعار الخصوصية قبل إنشاء الحساب.");
      return;
    }
    if (!e.currentTarget.reportValidity()) return;
    setAgreementError("");
    const f = new FormData(e.currentTarget);
    const email=String(f.get("email")).trim(), password=String(f.get("password"));
    if(login){submit(email,password);return;}
    setPhonePending(true);
    try{
      const verification=await confirmSignupSms(email);
      if(verification)submit(email,password,{...agreements,version:LEGAL_NOTICE_VERSION},verification);
    }catch(e){setAgreementError(e instanceof Error?e.message:'تعذّر بدء تأكيد الجوال.');}
    finally{setPhonePending(false);}
  }
  if (recovering) return <MemberPasswordRecovery onBack={() => setRecovering(false)}/>;
  const consentReview = ready && !login ? <fieldset className="nf-consent-review" disabled={locked} aria-describedby="auth-agreement-help">
    <legend>قبل إنشاء حسابك</legend>
    {(["adult", "terms", "privacy"] as const).map(kind => <ConsentChoice key={kind} kind={kind} checked={agreements[kind]} change={value => {
      setAgreements(current => ({ ...current, [kind]: value }));
      setAgreementError("");
    }} />)}
    <button type="button" className="nf-privacy-link" onClick={onPrivacy}>قراءة شروط الاستخدام وإشعار الخصوصية</button>
    <p id="auth-agreement-help">الخيارات الثلاثة مطلوبة لإنشاء الحساب. أذونات الصورة والتفاصيل الحساسة والتقييم تُعرض منفصلة أثناء إعداد الملف.</p>
    {agreementError && <p role="alert" className="form-error">{agreementError}</p>}
  </fieldset> : null;
  return (
    <Frame back={back} backDisabled={locked} title={login ? "تسجيل الدخول" : "حساب جديد"} className="nf-auth-frame" headerAction={<KeyboardDismiss/>}>
      <section className="nf-auth-hero">
        <span className="nf-auth-eyebrow">{login ? "نكمّل من حيث بدأنا" : "بداية جادة، وخطوات واضحة"}</span>
        <h1>{login ? "أهلًا بعودتك." : "أنشئ حسابك"}</h1>
        <p className="flow-intro">
          {login
            ? "سجّل الدخول لمتابعة طلباتك ومحادثاتك."
            : "نبدأ بحسابك، ثم نبني ملفًا يعبّر عنك وعن شريك الحياة الذي تبحث عنه."}
        </p>
        {!login && <ol className="nf-auth-steps" aria-label="رحلتك مع وُدَين"><li aria-current="step"><span>١</span> حسابك</li><li><span>٢</span> ملفك</li><li><span>٣</span> المراجعة</li></ol>}
        <div className="nf-auth-aside" aria-hidden="true"><span>وُدَين</span><p>ما يهمّك في الحياة،<br />هو بداية التوافق.</p><div /></div>
      </section>
      <section className="nf-auth-panel">
      {phoneMode && consentReview}
      {ready && phoneMode ? <PhoneAuth login={login} onVerified={onPhoneVerified} busy={locked || !accepted} setBusy={setPhonePending} /> : ready ? (
        <form className="flow-form" onSubmit={send} aria-busy={locked}>
          <label>
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
            {!login && <small id="nf-password-help" className="nf-auth-field-help">١٠ أحرف على الأقل. اختر كلمة مرور خاصة بهذا الحساب.</small>}
          </label>
          {consentReview}
          <button className="f-primary" disabled={locked || !accepted}>
            {locked ? phonePending ? "جارٍ تأكيد الجوال…" : "جارٍ المتابعة…" : login ? "تسجيل الدخول" : "إنشاء الحساب"}
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
      {ready && !login && <details className="nf-auth-more"><summary>ماذا بعد إنشاء الحساب؟<ArrowLeft size={15} aria-hidden="true" /></summary><p>تُكمل ملفك وتفضيلاتك، ثم تراجع ما سيظهر للأعضاء قبل إرسال طلب العضوية.</p><JoinAdvantages animate={false}/></details>}
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
        وصل ملفك، والخطوة الحالية هي مراجعته. بعد الاعتماد نتحقق من توفر عضو تتوافق معه التفضيلات قبل فتح الاشتراك.
      </p>
      <div className="flow-card timeline">
        <strong>
          <Check size={18} /> استلمنا الطلب
        </strong>
        <strong>
          <span className="timeline-dot" /> نراجع الملف
        </strong>
        <span>
          <span className="timeline-dot hollow" /> اعتماد الملف وتوفر ترشيح مناسب
        </span>
        <span>
          <span className="timeline-dot hollow" /> اختيار العضوية وتأكيد الشراء
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
              ? "١٢٩ ر.س."
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
