import { BrandWordmark } from './Brand';
import { WhyWudayn } from './WhyWudayn';
import { useEffect, useId, useLayoutEffect, useState } from 'react';
import { ArrowLeft, ArrowDown, Check, Compass, HeartHandshake, LockKeyhole, UsersRound } from './BrandIcons';
import { feedback } from './feedback/haptics';
import { useDevicePreferences, useSystemReducedMotion } from './settings/preferences';
import { MotionPressButton } from './motion/Reanimated';
import './welcome.css';

type WelcomeProps = {
  onRegister: () => void; onLogin: () => void; onPrivacy: () => void;
  onDemo?: () => void; onDemoIntake?: () => void; replayIntro?: boolean;
};
const previews = [
  { id: 'discovery', label: 'اكتشف', icon: Compass, title: 'من يناسب حياتك، لا صورتك فقط.', description: 'ملفات تعطيك صورة أوضح عن الشخص، وتفضيلاته، والوقت الذي يتطلع فيه للزواج.', detail: 'تصفية حسب ما يهمّك · اهتمام وطلب تعارف', alt: 'معاينة شاشة اكتشاف الملفات ونسب توافق التفضيلات، ببيانات توضيحية' },
  { id: 'compatibility', label: 'افهم التوافق', icon: HeartHandshake, title: 'وراء كل نسبة، معنى.', description: 'تفضيلات الحياة، والشخصية، ومواقف «بيننا». افهم ما يجمعكما وما يستحق أن تتحدثا عنه.', detail: 'أسباب مفهومة · أفكار تفتح الحوار', alt: 'معاينة شرح التوافق ونقاط الاتفاق والمواضيع التي تستحق الحوار' },
  { id: 'journey', label: 'تقدّما معًا', icon: UsersRound, title: 'حديث يعرف خطوته التالية.', description: 'اتفاق على الجدّية والمدة، ثم حصرية بموافقتكما، ومساحة مستقلة للأهل حين تكونان مستعدّين.', detail: 'قرارات مشتركة · خصوصية لحديثكما', alt: 'معاينة مسار التعارف والانتقال إلى الخطوة العائلية بموافقة الطرفين' },
] as const;
// Returning from login/privacy never restarts the opening in this app session.
let arrivalSeen = false;

export function Welcome({ onRegister, onLogin, onPrivacy, replayIntro = false }: WelcomeProps) {
  const { value } = useDevicePreferences();
  const systemReduced = useSystemReducedMotion();
  const reduced = value.reducedMotion || systemReduced;
  const [introducing, setIntroducing] = useState(() => (replayIntro || !arrivalSeen) && !reduced && !document.hidden);
  const [hidden, setHidden] = useState(() => document.hidden);
  const [selected, setSelected] = useState(0);
  const maskId = useId().replaceAll(':', '');
  const previewId = useId();
  const preview = previews[selected];
  useLayoutEffect(() => { arrivalSeen = true; if (reduced) setIntroducing(false); }, [reduced]);
  useEffect(() => {
    const visibility = () => { setHidden(document.hidden); if (document.hidden) setIntroducing(false); };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  function begin() { feedback('selection'); onRegister(); }

  return <main className="nf-welcome nf-arrival wd-welcome" dir="rtl" data-opening={introducing && !reduced || undefined} data-still={reduced || hidden || undefined} aria-labelledby="arrival-heading">
    <header className="wd-welcome-nav">
      <div className="wd-welcome-brand" role="img" aria-label="وُدَين">
        <svg className="wd-welcome-emblem" viewBox="0 0 768 768" aria-hidden="true"><defs><mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="768" height="768">
          <path className="wd-logo-stroke wd-logo-first" d="M270 165C285 220 175 280 194 408S280 545 346 630" pathLength="1" fill="none" stroke="white" strokeWidth="280" strokeLinecap="round"/>
          <path className="wd-logo-stroke wd-logo-second" d="M500 265C599 300 594 424 515 482S405 535 347 630" pathLength="1" fill="none" stroke="white" strokeWidth="280" strokeLinecap="round"/>
          <rect className="wd-logo-finish" width="768" height="768" fill="white"/>
        </mask></defs><image href="/brand/wudayn-heart-v2.png" width="768" height="768" mask={`url(#${maskId})`}/></svg>
        <BrandWordmark className="wd-welcome-wordmark"/>
      </div>
      <button type="button" className="nf-mast-login wd-welcome-login" onClick={onLogin}>تسجيل الدخول <ArrowLeft size={15} aria-hidden="true"/></button>
    </header>

    <section className="wd-welcome-hero">
      <div className="wd-hero-copy">
        <span className="wd-welcome-kicker"><span/> للجادّين في الزواج</span>
        <h1 id="arrival-heading">الوجهة زواج.<br/><em>والبداية توافق.</em></h1>
        <p>افهم من يناسبك، وابدأ تعارفًا واضحًا يمهّد للخطوة الرسمية. من أول اهتمام، إلى إشراك الأهل.</p>
        <div className="wd-hero-actions"><MotionPressButton type="button" className="nf-join wd-welcome-primary" onClick={begin}>ابدأ رحلتك <ArrowLeft size={19} aria-hidden="true"/></MotionPressButton><a className="wd-welcome-explore" href="#welcome-experience">شاهد التجربة <ArrowDown size={15} aria-hidden="true"/></a></div>
        <span className="wd-hero-note"><LockKeyhole size={13} aria-hidden="true"/> لا تبدأ المحادثة إلا بقبول الطرفين</span>
      </div>
      <figure className="wd-hero-art">
        <picture><source media="(max-width: 759px)" srcSet="/brand/welcome/shared-future-mobile.webp"/><img src="/brand/welcome/shared-future.webp" alt="مشهد تعبيري لشريكين يبدآن حياة مشتركة" width="1200" height="800" fetchPriority="high"/></picture>
        <figcaption><span>الوجهة</span><strong>حياة تتشاركونها.</strong><span className="wd-art-line" aria-hidden="true"/></figcaption>
      </figure>
    </section>

    <div className="wd-welcome-principles" aria-label="ما يميّز التجربة"><span><Check size={15} aria-hidden="true"/> توافق تفهم أسبابه</span><span><Check size={15} aria-hidden="true"/> تعارف بوقت واضح</span><span><Check size={15} aria-hidden="true"/> خطوة رسمية بموافقتكما</span></div>

    <section className="wd-product-story" id="welcome-experience" aria-labelledby="welcome-experience-heading">
      <div className="wd-product-copy"><span className="wd-welcome-kicker">وُدَين من الداخل</span><h2 id="welcome-experience-heading">كل خطوة،<br/>تقرّب الصورة.</h2><p className="wd-section-intro">مساحة تساعدك على الاختيار، وتمنح كل بداية فرصة حقيقية للفهم.</p>
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

    <section className="wd-intention" aria-labelledby="welcome-intention-heading"><div className="wd-intention-heading"><span className="wd-welcome-kicker">الجدّية في تفاصيل التجربة</span><h2 id="welcome-intention-heading">فرصة للتعارف.<br/>ومساحة لاتخاذ قرار.</h2></div><ol className="wd-intention-list">
      <li><span>٠١</span><div><h3>اهتمامك له قيمة</h3><p>تعارفان في الوقت نفسه كحد أقصى، لتمنح كل بداية وقتها واهتمامها.</p></div></li>
      <li><span>٠٢</span><div><h3>نيّة ومدة واضحتان</h3><p>اتفاق قبل المحادثة يوضّح وجهة التعارف ومدته. وكل خطوة جديدة، بموافقتكما.</p></div></li>
      <li><span>٠٣</span><div><h3>للأهل مكان، ولكما خصوصيتكما</h3><p>خطّطوا للخطوة الرسمية في مساحة منفصلة، دون مشاركة محادثتكما الخاصة.</p></div></li>
    </ol></section>

    <section className="wd-welcome-purpose" aria-labelledby="welcome-purpose-heading"><img src="/brand/wudayn-heart-v2.png" alt="" width="768" height="768" loading="lazy" aria-hidden="true"/><span className="wd-welcome-kicker">صُمّم لبداية تتجاوز التطبيق</span><h2 id="welcome-purpose-heading">أجمل نهاية هنا،<br/>بداية حياتكما معًا.</h2><p>حين تتفقان على التعارف الحصري، تتوقف الترشيحات الجديدة وتُغلق التعارفات الأخرى. لتمنحا قراركما مساحة، وتختارا خطوتكما التالية معًا.</p><MotionPressButton type="button" className="wd-welcome-primary wd-purpose-cta" onClick={begin}>ابدأ بما يهمّك فعلًا <ArrowLeft size={19} aria-hidden="true"/></MotionPressButton><span className="wd-purpose-note">التوافق يساعد على الفهم؛ والقرار لكما.</span></section>
    <footer className="wd-welcome-footer"><BrandWordmark/><span>بداية لحياة مشتركة</span><button type="button" onClick={onPrivacy}>الخصوصية وشروط الاستخدام</button></footer>
  </main>;
}
