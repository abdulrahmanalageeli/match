import { BrandWordmark } from './Brand';
import { WelcomePairPreview } from './WelcomePairPreview';
import { WhyWudayn } from './WhyWudayn';
import { createPortal } from 'react-dom';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowDown, Check, Compass, HeartHandshake, MessageCircle, UsersRound } from './BrandIcons';
import { feedback } from './feedback/haptics';
import { useDevicePreferences, useSystemReducedMotion } from './settings/preferences';
import { MotionPressButton, MotionReveal } from './motion/Reanimated';
import './welcome.css';

type WelcomeProps = {
  onRegister: () => void; onLogin: () => void; onPrivacy: () => void;
  onDemo?: () => void; onDemoIntake?: () => void; replayIntro?: boolean; skipOpening?:boolean; onGuide?:()=>void;
};
const previews = [
  { id: 'luna', label: 'لونا', icon: MessageCircle, title: 'وش يهمّك في شريك حياتك؟', description: 'احكِ للونا عن يومك وعن الزواج اللي تتمناه. تقترح إجابات من كلامك، وأنت تراجعها وتكمّل اللي باقي.', alt: 'جلسة التوافق مع لونا وسؤالها الافتتاحي عن حياتك والشريك اللي تتمناه' },
  { id: 'discovery', label: 'الاكتشاف', icon: Compass, title: 'مين يشاركك أولوياتك؟', description: 'تصفّح الترشيحات أو افتح جميع الملفات وحدّد اللي يهمّك. ومع وسام الجدية، تقدر توصف للونا الشخص اللي تبحث عنه بكلامك.', alt: 'دليل الملفات مع البحث والتصفية وصور الأعضاء ونسب التوافق' },
  { id: 'compatibility', label: 'التوافق', icon: HeartHandshake, title: 'وش وراء النسبة؟', description: 'افتح النسبة وشوف كيف تناسب رغبات كل طرف حياة الثاني. واقرأ عن طباعكم، من طريقة الحوار إلى حاجتكم للهدوء.', alt: 'تفاصيل التوافق لملفين توضيحيين وفيها قراءات التفضيلات والطباع' },
  { id: 'journey', label: 'التعارف', icon: UsersRound, title: 'قبل أول رسالة، تتفقون.', description: 'بعد قبول الطلب، تقترح المرأة مدة التعارف ويوافق الرجل. يبدأ الوقت بعد توقيع الاثنين، وتكون الخطوة الجاية باتفاقكم.', alt: 'ميثاق التعارف وخيارات مدته قبل توقيع الطرفين وبدء المحادثة' },
] as const;
function WelcomeLogo({ maskId, className }: { maskId: string; className: string }) {
  return <svg className={className} viewBox="0 0 768 768" aria-hidden="true"><defs><mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="768" height="768">
          <path className="wd-logo-stroke wd-logo-first" d="M270 165C285 220 175 280 194 408S280 545 346 630" pathLength="1" fill="none" stroke="white" strokeWidth="280" strokeLinecap="round"/>
          <path className="wd-logo-stroke wd-logo-second" d="M500 265C599 300 594 424 515 482S405 535 347 630" pathLength="1" fill="none" stroke="white" strokeWidth="280" strokeLinecap="round"/>
          <rect className="wd-logo-finish" width="768" height="768" fill="white"/>
        </mask></defs>{className === 'wd-welcome-emblem' && <image href="/brand/wudayn-heart-v2.png" width="768" height="768" style={{ filter: 'brightness(0) invert(1)' }} mask={`url(#${maskId})`}/>}<image className="wd-logo-color" href="/brand/wudayn-heart-v2.png" width="768" height="768" mask={`url(#${maskId})`}/></svg>;
}

// Returning from login/privacy never restarts the opening in this app session.
let arrivalSeen = false;

export function Welcome({ onRegister, onLogin, onPrivacy, onGuide, skipOpening=false, replayIntro = false }: WelcomeProps) {
  const { value } = useDevicePreferences();
  const systemReduced = useSystemReducedMotion();
  const reduced = value.reducedMotion || systemReduced;
  const [introducing, setIntroducing] = useState(() => !skipOpening && (replayIntro || !arrivalSeen) && !reduced && !document.hidden);
  const [revealDelay, setRevealDelay] = useState(() => introducing ? 1750 : 0);
  const [hidden, setHidden] = useState(() => document.hidden);
  const [selected, setSelected] = useState(0);
  const launchRef = useRef<HTMLDivElement>(null);
  const [docking, setDocking] = useState(false);
  const maskId = useId().replaceAll(':', '');
  const previewId = useId();
  const preview = previews[selected];
  useLayoutEffect(() => { arrivalSeen = true; if (reduced) setIntroducing(false); }, [reduced]);
  useEffect(() => {
    const visibility = () => { setHidden(document.hidden); if (document.hidden) setIntroducing(false); };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  useLayoutEffect(() => {
    if (!introducing) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    launchRef.current?.focus({ preventScroll: true });
    const dock = window.setTimeout(() => setDocking(true), 800);
    const timer = window.setTimeout(() => { setIntroducing(false); setDocking(false); }, 2150);
    return () => { window.clearTimeout(dock); window.clearTimeout(timer); document.body.style.overflow = previousOverflow; };
  }, [introducing]);
  function skipIntro() {
    setRevealDelay(0);
    setIntroducing(false); setDocking(false);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.nf-join')?.focus({ preventScroll: true }));
  }
  function begin() { feedback('selection'); onRegister(); }

  return <>
    {introducing && !reduced && !hidden && createPortal(<div ref={launchRef} tabIndex={-1} className="wd-launch-screen" data-docking={docking || undefined} dir="rtl" role="dialog" aria-modal="true" aria-label="مرحبًا بك في وُدَين" onPointerDown={skipIntro} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); skipIntro(); }
      if (event.key === 'Tab') { event.preventDefault(); skipIntro(); }
    }}>
      <div className="wd-launch-door" aria-hidden="true"><picture><source media="(max-width: 759px)" srcSet="/brand/welcome/shared-future-mobile.webp"/><img src="/brand/welcome/shared-future.webp" alt=""/></picture></div>
      <div className="wd-launch-brand"><WelcomeLogo maskId={maskId+'-launch'} className="wd-launch-emblem"/><BrandWordmark className="wd-launch-wordmark"/></div>
    </div>, document.body)}
    <main inert={introducing || undefined} aria-hidden={introducing || undefined} className="nf-welcome nf-arrival wd-welcome" dir="rtl" data-opening={introducing && !reduced || undefined} data-still={reduced || hidden || undefined} aria-labelledby="arrival-heading">
    <header className="wd-welcome-nav">
      <div className="wd-welcome-brand" role="img" aria-label="وُدَين">
        <WelcomeLogo maskId={maskId} className="wd-welcome-emblem"/>
        <BrandWordmark className="wd-welcome-wordmark"/>
      </div>
      <button type="button" className="nf-mast-login wd-welcome-login" onClick={onLogin}>تسجيل الدخول <ArrowLeft size={15} aria-hidden="true"/></button>
      <p className="wd-name-meaning"><span>من الوُدّ؛ محبّة وألفة بين اثنين.</span></p>
      <WelcomePairPreview visible={!introducing && !hidden} reduced={reduced}/>
    </header>

    <section className="wd-welcome-hero">
      <MotionReveal className="wd-hero-copy" delay={revealDelay} duration={700} distance={14}>
        <span className="wd-welcome-kicker"><span/> تعارف بنية زواج واضحة</span>
        <h1 id="arrival-heading">شخص ترتاح له.<br/><em>وحياة تتفقون عليها.</em></h1>
        <div className="wd-hero-actions"><MotionPressButton type="button" className="nf-join wd-welcome-primary" onClick={begin}>ابدأ طلب العضوية <ArrowLeft size={18} aria-hidden="true"/></MotionPressButton><p className="wd-seriousness-proof">توافق قبل التواصل <i/> مدة متفق عليها <i/> خطوة رسمية واضحة</p><a className="wd-welcome-explore" href="#welcome-experience">اكتشف وُدَين <ArrowDown size={15} aria-hidden="true"/></a></div>
      </MotionReveal>
      <figure className="wd-hero-art">
        <picture><source media="(max-width: 759px)" srcSet="/brand/welcome/shared-future-mobile.webp"/><img src="/brand/welcome/shared-future.webp" alt="مشهد تعبيري لشريكين يبدآن حياة مشتركة" width="1200" height="800" fetchPriority="high"/></picture>

      </figure>
    </section>

    <div className="wd-welcome-principles" aria-label="ما يميّز التجربة"><span><Check size={15} aria-hidden="true"/> ملف بكلامك</span><span><Check size={15} aria-hidden="true"/> توافق بأسبابه</span><span><Check size={15} aria-hidden="true"/> تعارف باتفاق</span></div>

    <section className="wd-product-story" id="welcome-experience" aria-labelledby="welcome-experience-heading">
      <div className="wd-product-copy"><span className="wd-welcome-kicker">وُدَين من الداخل</span><h2 id="welcome-experience-heading">من كلامك عن نفسك<br/>إلى أول حديث بينكم.</h2>
        <div className="wd-preview-controls" role="group" aria-label="استكشف شاشات التطبيق">{previews.map((item,index)=><button type="button" key={item.id} aria-pressed={selected===index} aria-controls={previewId} onClick={()=>setSelected(index)}><item.icon size={17} strokeWidth={1.6} aria-hidden="true"/><span>{item.label}</span></button>)}</div>
        <div className="wd-preview-description" aria-live="polite" aria-atomic="true"><h3>{preview.title}</h3><p>{preview.description}</p></div>
        <WhyWudayn label="تعرّف على منهج وُدَين"/>
      </div>
      <figure className="wd-product-figure" id={previewId} aria-label={preview.alt}>
        <div className="wd-product-halo" aria-hidden="true"/>
        <div className="wd-device"><div className="wd-device-top" aria-hidden="true"><span>وُدَين</span><i/></div><div className="wd-device-screen"><img key={preview.id} src={`/brand/welcome/${preview.id}.webp`} alt={preview.alt} width="804" height="1160" loading="lazy" decoding="async"/></div></div>
        <figcaption>من داخل وُدَين · ملفات توضيحية</figcaption>
      </figure>
    </section>

    <section className="wd-intention" aria-labelledby="welcome-intention-heading"><div className="wd-intention-heading"><span className="wd-welcome-kicker">بعد قبول الطلب</span><h2 id="welcome-intention-heading">كيف تمشي<br/>خطوة التعارف؟</h2></div><ol className="wd-intention-list">
      <li><span>٠١</span><div><h3>مدة تختارونها سوا</h3><p>أسبوع، أسبوعين أو شهر. تعرفون من البداية متى توقفون وتراجعون خطوتكم.</p></div></li>
      <li><span>٠٢</span><div><h3>قرار تكملون فيه سوا</h3><p>إذا اخترتوا التعارف الحصري، تتوقف الترشيحات الجديدة. وعند نهاية المدة، تقدرون تتفقون على التمديد أو على الخطوة العائلية.</p></div></li>
      <li><span>٠٣</span><div><h3>محادثة خاصة للأهل</h3><p>إذا وافقتوا، يفتح «جسر الأهل» مساحة منفصلة لترتيب الخطوة الرسمية. حديثكم الأول يبقى بينكم.</p></div></li>
    </ol></section>

    <section className="wd-welcome-purpose" aria-labelledby="welcome-purpose-heading"><img src="/brand/wudayn-heart-v2.png" alt="" width="768" height="768" loading="lazy" aria-hidden="true"/><span className="wd-welcome-kicker">لبداية حياة مشتركة</span><h2 id="welcome-purpose-heading">خلّ البداية<br/>تشبهك.</h2><MotionPressButton type="button" className="wd-welcome-primary wd-purpose-cta" onClick={begin}>ابدأ طلب العضوية <ArrowLeft size={18} aria-hidden="true"/></MotionPressButton></section>
    <footer className="wd-welcome-footer"><BrandWordmark/>{onGuide&&<button type="button" onClick={onGuide}>جولة في وُدَين</button>}<button type="button" onClick={onPrivacy}>الخصوصية وشروط الاستخدام</button></footer>
  </main></>;
}
