import { BrandWordmark } from './Brand';
import { WhyWudayn } from './WhyWudayn';
import { createPortal } from 'react-dom';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowDown, Check, Compass, HeartHandshake, UsersRound } from './BrandIcons';
import { feedback } from './feedback/haptics';
import { useDevicePreferences, useSystemReducedMotion } from './settings/preferences';
import { MotionPressButton, MotionReveal } from './motion/Reanimated';
import './welcome.css';

type WelcomeProps = {
  onRegister: () => void; onLogin: () => void; onPrivacy: () => void;
  onDemo?: () => void; onDemoIntake?: () => void; replayIntro?: boolean;
};
const previews = [
  { id: 'discovery', label: 'اكتشف', icon: Compass, title: 'شريك يناسب حياتك.', description: 'قيمه، أولوياته، واستعداده للزواج. اعرف ما يجمعكما قبل أول حديث.', detail: 'اختيارات أقرب لشخصيتك وتطلعاتك', alt: 'معاينة شاشة اكتشاف الملفات ونسب توافق التفضيلات، ببيانات توضيحية' },
  { id: 'compatibility', label: 'افهم التوافق', icon: HeartHandshake, title: 'النسبة بداية للسؤال.', description: 'نقارن إجاباتكم عن الحياة والشخصية ومواقف «بيننا». ونوضّح وين تتفقون، ووش يحتاج تتكلمون عنه.', detail: 'أسباب مفهومة · أفكار تفتح الحوار', alt: 'معاينة شرح التوافق ونقاط الاتفاق والمواضيع التي تستحق الحوار' },
  { id: 'journey', label: 'تقدّما معًا', icon: UsersRound, title: 'من التوافق إلى الخطوة الرسمية.', description: 'نية زواج واضحة، ووقت متفق عليه، ثم خطوة مع الأهل حين تكونان مستعدّين.', detail: 'اتفاق جاد · التزام حصري · جسر الأهل', alt: 'معاينة خطوات التقدّم للزواج والانتقال إلى الخطوة العائلية بموافقة الطرفين' },
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

export function Welcome({ onRegister, onLogin, onPrivacy, replayIntro = false }: WelcomeProps) {
  const { value } = useDevicePreferences();
  const systemReduced = useSystemReducedMotion();
  const reduced = value.reducedMotion || systemReduced;
  const [introducing, setIntroducing] = useState(() => (replayIntro || !arrivalSeen) && !reduced && !document.hidden);
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
      <div className="wd-launch-door" aria-hidden="true"><img src="/brand/welcome/shared-future.webp" alt=""/></div>
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
    </header>

    <section className="wd-welcome-hero">
      <MotionReveal className="wd-hero-copy" delay={revealDelay} duration={700} distance={14}>
        <span className="wd-welcome-kicker"><span/> للجادّين في الزواج</span>
        <h1 id="arrival-heading">شخص ترتاح له.<br/><em>وحياة تتفقون عليها.</em></h1>
        <p>توافق مبني على شخصيتك وتفضيلاتك، بمساعدة الذكاء الاصطناعي.</p>
        <div className="wd-hero-actions"><MotionPressButton type="button" className="nf-join wd-welcome-primary" onClick={begin}>ابدأ رحلتك للزواج <ArrowLeft size={18} aria-hidden="true"/></MotionPressButton><a className="wd-welcome-explore" href="#welcome-experience">اكتشف وُدَين <ArrowDown size={15} aria-hidden="true"/></a></div>
      </MotionReveal>
      <figure className="wd-hero-art">
        <picture><source media="(max-width: 759px)" srcSet="/brand/welcome/shared-future.webp"/><img src="/brand/welcome/shared-future.webp" alt="مشهد تعبيري لشريكين يبدآن حياة مشتركة" width="1200" height="800" fetchPriority="high"/></picture>

      </figure>
    </section>

    <div className="wd-welcome-principles" aria-label="ما يميّز التجربة"><span><Check size={15} aria-hidden="true"/> توافق أعمق</span><span><Check size={15} aria-hidden="true"/> نيّة زواج واضحة</span><span><Check size={15} aria-hidden="true"/> خطوة مع الأهل</span></div>

    <section className="wd-product-story" id="welcome-experience" aria-labelledby="welcome-experience-heading">
      <div className="wd-product-copy"><span className="wd-welcome-kicker">وُدَين من الداخل</span><h2 id="welcome-experience-heading">اختيار على بصيرة.<br/>وخطوات نحو الزواج.</h2><p className="wd-section-intro">شخصية، وقيم، وتطلعات مشتركة. أساس تختار عليه شريك حياتك.</p>
        <div className="wd-preview-controls" role="group" aria-label="استكشف شاشات التطبيق">{previews.map((item,index)=><button type="button" key={item.id} aria-pressed={selected===index} aria-controls={previewId} onClick={()=>setSelected(index)}><item.icon size={17} strokeWidth={1.6} aria-hidden="true"/><span>{item.label}</span></button>)}</div>
        <div className="wd-preview-description" aria-live="polite" aria-atomic="true"><h3>{preview.title}</h3><p>{preview.description}</p><span>{preview.detail}</span></div>
        <WhyWudayn label="تعرّف على منهج وُدَين"/>
      </div>
      <figure className="wd-product-figure" id={previewId} aria-label={preview.alt}>
        <div className="wd-product-halo" aria-hidden="true"/>
        <div className="wd-device"><div className="wd-device-top" aria-hidden="true"><span>وُدَين</span><i/></div><div className="wd-device-screen"><img key={preview.id} src={`/brand/welcome/${preview.id}.webp`} alt={preview.alt} width="780" height="1120" loading="lazy" decoding="async"/></div></div>
        <figcaption>من واجهات التطبيق · ملفات وبيانات توضيحية</figcaption>
      </figure>
    </section>

    <section className="wd-intention" aria-labelledby="welcome-intention-heading"><div className="wd-intention-heading"><span className="wd-welcome-kicker">الجدّية في كل خطوة</span><h2 id="welcome-intention-heading">نيّة صادقة.<br/>ووجهة واحدة: الزواج.</h2></div><ol className="wd-intention-list">
      <li><span>٠١</span><div><h3>اختيار يستحق اهتمامك</h3><p>تواصل مع شخصين كحد أقصى، لتمنح كل فرصة جادّة وقتها.</p></div></li>
      <li><span>٠٢</span><div><h3>اتفاق من البداية</h3><p>نية الزواج، والمدة، والخطوة الرسمية التالية. تتفقان عليها معًا.</p></div></li>
      <li><span>٠٣</span><div><h3>جسر إلى الأهل</h3><p>مساحة خاصة للعائلتين لترتيب الخطوة الرسمية.</p></div></li>
    </ol></section>

    <section className="wd-welcome-purpose" aria-labelledby="welcome-purpose-heading"><img src="/brand/wudayn-heart-v2.png" alt="" width="768" height="768" loading="lazy" aria-hidden="true"/><span className="wd-welcome-kicker">لبداية حياة مشتركة</span><h2 id="welcome-purpose-heading">أجمل نهاية هنا،<br/>بداية حياتكما معًا.</h2><p>حين تختاران بعضكما، يبدأ التزام حصري يمنح خطوتكما نحو الزواج كل الاهتمام.</p><MotionPressButton type="button" className="wd-welcome-primary wd-purpose-cta" onClick={begin}>ابدأ رحلتك للزواج <ArrowLeft size={18} aria-hidden="true"/></MotionPressButton></section>
    <footer className="wd-welcome-footer"><BrandWordmark/><span>بداية لحياة مشتركة</span><button type="button" onClick={onPrivacy}>الخصوصية وشروط الاستخدام</button></footer>
  </main></>;
}
