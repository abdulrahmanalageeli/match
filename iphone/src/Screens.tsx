import { useLayoutEffect, useState, type FormEvent, type ReactNode } from "react";
import { MemberPasswordRecovery } from './auth/MemberPasswordRecovery';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Compass,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Smartphone,
  ShieldCheck,
  Sparkles,
  HeartHandshake,
} from "lucide-react";
import { Brand } from "./Brand";
import { phoneOtpEnabled } from "./cloud";
import { PhoneAuth } from "./PhoneAuth";
import { useDevicePreferences, useSystemReducedMotion } from "./settings/preferences";
import { WelcomeHorizon } from "./WelcomeHorizon";
import { LegalNotice } from "./legal/LegalNotice";
import { ConsentChoice } from "./legal/ConsentChoices";
import { SupportContact } from "./help/SupportContact";

type Click = () => void;
export function Frame({
  title,
  back,
  children,
  backDisabled = false,
  className = "",
}: {
  title: string;
  back: Click;
  children: ReactNode;
  backDisabled?: boolean;
  className?: string;
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
        <span className="flow-brand">
          <Brand compact />
        </span>
      </header>
      <div className="flow-body">{children}</div>
    </main>
  );
}

// This is an in-memory launch decision: back navigation and foregrounding
// should return to the resting skyline instead of repeating the introduction.
let welcomeIntroSeen = false;

export function Welcome({
  onRegister,
  onLogin,
  onDemo,
  onDemoIntake,
  onPrivacy,
  replayIntro = false,
}: {
  onRegister: Click;
  onLogin: Click;
  onDemo: Click;
  onDemoIntake: Click;
  onPrivacy: Click;
  replayIntro?: boolean;
}) {
  const { value } = useDevicePreferences();
  const systemReduced = useSystemReducedMotion();
  const reduced = value.reducedMotion || systemReduced;
  const [playing, setPlaying] = useState(false);
  useLayoutEffect(() => {
    if (reduced) {
      welcomeIntroSeen = true;
      setPlaying(false);
      return;
    }
    function syncVisibility() {
      if (document.hidden) setPlaying(false);
      else if (!welcomeIntroSeen || replayIntro) {
        welcomeIntroSeen = true;
        setPlaying(true);
      }
    }
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, [reduced, replayIntro]);
  const animateIntro = playing && !reduced;
  return (
    <main className="nf-welcome" dir="rtl" data-intro={animateIntro || undefined}>
      <header className="nf-mast">
        <button type="button" onClick={onPrivacy}>
          <LockKeyhole size={15} aria-hidden="true" /> الخصوصية
        </button>
        <button type="button" className="nf-mast-login" onClick={onLogin}>
          تسجيل الدخول <ArrowLeft size={15} aria-hidden="true" />
        </button>
      </header>
      <section className="nf-welcome-identity">
        <div className="nf-welcome-visual">
          <span className="nf-welcome-orbit nf-welcome-orbit-one" aria-hidden="true" />
          <span className="nf-welcome-orbit nf-welcome-orbit-two" aria-hidden="true" />
          <span className="nf-welcome-spark nf-welcome-spark-one" aria-hidden="true"><Sparkles size={15} /></span>
          <span className="nf-welcome-spark nf-welcome-spark-two" aria-hidden="true"><Sparkles size={11} /></span>
          <div className="nf-welcome-logo" role="img" aria-label="نصفين">
            <div className="nf-welcome-heart" aria-hidden="true">
              <img className="nf-welcome-half nf-welcome-half-first" src="/brand/nisfayn-heart.png" alt="" width="768" height="768" fetchPriority="high" draggable="false" />
              <img className="nf-welcome-half nf-welcome-half-second" src="/brand/nisfayn-heart.png" alt="" width="768" height="768" draggable="false" />
              <span className="nf-welcome-heart-light" />
            </div>
            <img className="nf-welcome-wordmark" src="/brand/nisfayn-wordmark.png" alt="" width="512" height="154" aria-hidden="true" />
          </div>
        </div>
        <span className="nf-welcome-eyebrow"><i aria-hidden="true" /> تعارف جاد، بنية الزواج</span>
        <h1>لا تبحث عن نصفٍ آخر.<br /><span>ابحث عمّن يفهم حياتك.</span></h1>
        <p className="nf-welcome-intro">توافق مبني على القيم والشخصية وتفاصيل الحياة،<br />مع طريق واضح من التعارف إلى الأهل.</p>
        <div className="nf-welcome-preview" aria-label="تجربة التوافق في نصفين">
          <div className="nf-welcome-score" aria-hidden="true"><span><strong>٨٩٪</strong><small>انسجام</small></span></div>
          <div className="nf-welcome-preview-copy">
            <span>مثال توضيحي للتوافق</span>
            <strong>ما يجمعكما، وما يحتاج إلى حوار</strong>
            <small>قيم · شخصية · أسلوب حياة · رؤية للمستقبل</small>
          </div>
          <Sparkles className="nf-welcome-preview-spark" size={18} aria-hidden="true" />
        </div>
      </section>
      <section className="nf-welcome-benefits" aria-label="ما يميز نصفين">
        <div><Sparkles size={19} aria-hidden="true" /><strong>توافق مفهوم</strong><span>أسباب واضحة، لا رقم فقط</span></div>
        <div><ShieldCheck size={19} aria-hidden="true" /><strong>خصوصية باختيارك</strong><span>أنت تتحكم بما يظهر ومتى</span></div>
        <div><HeartHandshake size={19} aria-hidden="true" /><strong>مسار جاد</strong><span>خطوات متفق عليها نحو الأهل</span></div>
      </section>
      <details className="nf-welcome-journey">
        <summary><span>اعرف كيف تبدأ الرحلة</span><ChevronDown size={16} aria-hidden="true" /></summary>
        <ol>
          <li><span>١</span><div><strong>عرّفنا بك، وبما يهمّك</strong><p>ملف يعبّر عنك، وأسئلة عن احتياجاتك وأسلوب حياتك وشخصيتك. الصورة الشخصية اختيارية.</p></div></li>
          <li><span>٢</span><div><strong>مراجعة، ثم عضوية باختيارك</strong><p>نراجع الملف أولًا. بعد الاعتماد وتوفر عضو تتوافق معه التفضيلات، يتاح الاشتراك الشهري. قد تحتاج إلى الانتظار؛ لا نضمن عددًا ثابتًا من الترشيحات.</p></div></li>
          <li><span>٣</span><div><strong>اكتشف، واتفقا على الخطوة التالية</strong><p>حتى خمسة ترشيحات أقرب لتفضيلاتك، واستكشاف بقية الملفات المؤهلة. تبدأ المحادثة بعد القبول المتبادل واتفاق الجدية إذا ظهر لك. يمكنكما مناقشة أساسيات الزواج قبل الحصرية، وإشراك الأهل من البداية أو لاحقًا باتفاقكما.</p></div></li>
        </ol>
        <p className="nf-welcome-journey-note"><LockKeyhole size={14} aria-hidden="true" />إجابات تقييمك التفصيلية خاصة. أنت من يختار ما يشاركه.</p>
        <p className="nf-welcome-journey-note">ملفك متاح للأعضاء المؤهلين، وليس صفحة عامة. اعتماد الملف لا يُعد تحققًا مستقلًا من الهوية، والتوافق لا يتنبأ بنجاح الزواج. لا توجد مهلة مراجعة ثابتة معلنة؛ تابع حالتك داخل التطبيق.</p>
        <aside className="nf-welcome-expectations" aria-label="قبل أن تبدأ">
          <strong>واضح من البداية</strong>
          <p>إنشاء الملف ومراجعته دون شراء. التعارف بعضوية شهرية بعد الاعتماد والتوفر، ويظهر سعر Apple قبل أي تأكيد.</p>
        </aside>
        <a className="nf-welcome-family" href="?family=1"><HeartHandshake size={16} aria-hidden="true" /> دخول وليّ الأمر أو أحد الأهل</a>
      </details>
      <WelcomeHorizon animate={animateIntro} />
      <div className="nf-welcome-actions">
        <button type="button" className="f-primary nf-join" onClick={onRegister}>
          <span><small>إنشاء الملف مجاني</small><strong>ابدأ رحلتك</strong></span><ArrowLeft size={20} aria-hidden="true" />
        </button>
        <span className="nf-welcome-join-note"><LockKeyhole size={12} aria-hidden="true" /> لا دفع عند التسجيل · للجادين في الزواج · ١٨+</span>
        <div className="nf-demo-options">
          <button type="button" className="nf-demo-link" onClick={onDemo}>
            <Compass size={16} aria-hidden="true" /> استكشف التجربة
          </button>
          <span aria-hidden="true" />
          <button type="button" className="nf-demo-link" onClick={onDemoIntake}>جرّب التسجيل كعضو جديد</button>
        </div>
      </div>
    </main>
  );
}

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
  submit: (email: string, password: string) => void;
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
  function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ready || locked) return;
    if (!accepted) {
      setAgreementError("أكّد العمر، واقبل الشروط، واطّلع على إشعار الخصوصية قبل إنشاء الحساب.");
      return;
    }
    if (!e.currentTarget.reportValidity()) return;
    setAgreementError("");
    const f = new FormData(e.currentTarget);
    submit(String(f.get("email")).trim(), String(f.get("password")));
  }
  if (recovering) return <MemberPasswordRecovery onBack={() => setRecovering(false)}/>;
  return (
    <Frame back={back} backDisabled={locked} title={login ? "تسجيل الدخول" : "حساب جديد"} className="nf-auth-frame">
      <section className="nf-auth-hero">
        <div className="nf-auth-emblem" aria-hidden="true">
          <img src="/brand/nisfayn-emblem.png" alt="" width="66" height="72" />
          <span>{phoneMode ? <Smartphone size={20} /> : <Mail size={20} />}</span>
        </div>
        <span className="nf-auth-eyebrow">{login ? "مساحتك الخاصة" : "بداية هادئة وواضحة"}</span>
        <h1>{login ? "أهلًا بعودتك" : "نبدأ بالحساب، ثم نتعرّف إليك."}</h1>
        <p className="flow-intro">
          {login
            ? "سجّل الدخول للاطلاع على طلبك وترشيحاتك."
            : phoneMode ? "تحقّق من جوالك، ثم ابنِ ملفًا يعكس شخصيتك وحدودك ورؤيتك للزواج." : "أنشئ حسابك، ثم ابنِ ملفًا يعكس شخصيتك وحدودك ورؤيتك للزواج."}
        </p>
        {!login && <div className="nf-auth-promise" aria-label="مراحل الانضمام"><span><Check size={13} /> حساب</span><i /><span>ملفك</span><i /><span>المراجعة</span></div>}
      </section>
      <section className="nf-auth-panel">
      {ready && !login && <fieldset className="nf-consent-review" disabled={locked} aria-describedby="auth-agreement-help">
        <legend>قبل إنشاء حسابك</legend>
        {(["adult", "terms", "privacy"] as const).map(kind => <ConsentChoice key={kind} kind={kind} checked={agreements[kind]} change={value => {
          setAgreements(current => ({ ...current, [kind]: value }));
          setAgreementError("");
        }} />)}
        <button type="button" className="nf-privacy-link" onClick={onPrivacy}>قراءة شروط الاستخدام وإشعار الخصوصية</button>
        <p id="auth-agreement-help">الخيارات الثلاثة مطلوبة لإنشاء الحساب. أذونات الصورة والتفاصيل الحساسة والتقييم تُعرض منفصلة أثناء إعداد الملف.</p>
        {agreementError && <p role="alert" className="form-error">{agreementError}</p>}
      </fieldset>}
      {ready && phoneMode ? <PhoneAuth login={login} onVerified={onPhoneVerified} busy={locked || !accepted} setBusy={setPhonePending} /> : ready ? (
        <form className="flow-form" onSubmit={send}>
          <label>
            البريد الإلكتروني
            <input
              dir="ltr"
              autoComplete="email"
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
              />
              <button
                type="button"
                onClick={() => setVisible(!visible)}
                aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
              >
                {visible ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </span>
          </label>
          {!login && <small className="nf-password-help">استخدم ١٠ أحرف على الأقل.</small>}
          <button className="f-primary" disabled={locked || !accepted}>
            {login ? "تسجيل الدخول" : "إنشاء الحساب"}
            <ArrowLeft size={18} />
          </button>
        </form>
      ) : (
        <div className="flow-card">
          <p>
            التسجيل المباشر غير متاح في هذه النسخة. يمكنك استكشاف التطبيق
            ببيانات توضيحية.
          </p>
          <button className="f-primary" onClick={onDemo}>
            استكشف التجربة
          </button>
        </div>
      )}
      {login && !phoneMode && <button type="button" className="f-link centered" disabled={locked} onClick={() => setRecovering(true)}>نسيت كلمة المرور؟</button>}
      {ready && (
        <>
        {phoneOtpEnabled && <button className="f-secondary" disabled={locked} type="button" onClick={() => setPhoneMode(mode => !mode)}>
          {phoneMode ? "استخدام البريد الإلكتروني" : "استخدام رقم الجوال"}
        </button>}
        <button className="f-link centered" onClick={switchMode} disabled={locked}>
          {login ? "إنشاء حساب جديد" : "لدي حساب بالفعل"}
        </button>
        </>
      )}
      {ready && !login && (
        <button type="button" className="nf-privacy-link" onClick={onPrivacy}>
          <LockKeyhole size={14} aria-hidden="true" /> كيف نستخدم بياناتك؟
        </button>
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
    <Frame title="حالة الطلب" back={back}>
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
      <SupportContact subject="استفسار عن مراجعة ملف نصفين" context="أرغب في الاستفسار عن حالة مراجعة ملفي." />
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
      <h1>{active ? "عضويتك الحالية" : "عضوية نصفين"}</h1>
      <p className="flow-intro">
        {active || canStart
          ? "مساحتك الخاصة للترشيحات وطلبات التعارف."
          : "تم اعتماد طلبك. ننتظر توفر عضو تتوافق تفضيلاته مع تفضيلاتك قبل فتح الاشتراك."}
      </p>
      {!active && !canStart && <div className="flow-card nf-waiting-guidance"><h2>ملفك معتمد، وننتظر توفرًا مناسبًا</h2><p>هذه مرحلة مختلفة عن مراجعة الملف. لا تحتاج إلى شراء العضوية الآن، ولا توجد مدة مضمونة لتوفر ترشيح. قلة الملفات المناسبة لا تعني وجود مشكلة فيك، ولا يلزم تغيير حدودك الأساسية.</p><p>يمكنك تحديث الحالة هنا أو مراجعة تفضيلاتك من الإعدادات باختيارك.</p><SupportContact subject="استفسار عن توفر الترشيحات في نصفين" /></div>}
      <section className="nf-membership" aria-label="تفاصيل العضوية">
        <header>
          <span>عضوية نصفين</span>
          <span className="nf-membership-seal" aria-hidden="true">
            <img src="/brand/nisfayn-emblem.png" alt="" width="29" height="30" />
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
        <li><Check size={16} aria-hidden="true" /> اكتشاف ملفات تتوافق مع تفضيلاتك</li>
        <li><Check size={16} aria-hidden="true" /> إرسال طلبات تعارف واستقبالها</li>
        <li><Check size={16} aria-hidden="true" /> محادثات خاصة بعد القبول المتبادل</li>
      </ul>
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
              يتاح الاشتراك من تطبيق نصفين على iPhone.
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
