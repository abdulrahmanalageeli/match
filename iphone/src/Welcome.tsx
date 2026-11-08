import { useEffect, useId, useLayoutEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { feedback } from './feedback/haptics';
import { useDevicePreferences, useSystemReducedMotion } from './settings/preferences';
import './welcome.css';
import { MotionPressButton, MotionReveal } from './motion/Reanimated';
import { SkiaSurface } from './motion/SkiaSurface';

type WelcomeProps = {
  onRegister: () => void;
  onLogin: () => void;
  onPrivacy: () => void;
  // Keep the existing entry API; discovery belongs inside the member experience.
  onDemo?: () => void;
  onDemoIntake?: () => void;
  replayIntro?: boolean;
};

// Returning from login/privacy resumes the finished composition, never the opening.
let arrivalSeen = false;

export function Welcome({ onRegister, onLogin, onPrivacy, replayIntro = false }: WelcomeProps) {
  const { value } = useDevicePreferences();
  const systemReduced = useSystemReducedMotion();
  const reduced = value.reducedMotion || systemReduced;
  const [introducing, setIntroducing] = useState(() => (replayIntro || !arrivalSeen) && !reduced && !document.hidden);
  const [hidden, setHidden] = useState(() => document.hidden);
  const maskId = useId().replaceAll(':', '');

  useLayoutEffect(() => {
    arrivalSeen = true;
    if (reduced) setIntroducing(false);
  }, [reduced]);

  useEffect(() => {
    const visibility = () => {
      setHidden(document.hidden);
      // A backgrounded opening should not restart when the app returns.
      if (document.hidden) setIntroducing(false);
    };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);

  function begin() {
    feedback('selection');
    onRegister();
  }

  return (
    <main className="nf-welcome nf-arrival" dir="rtl" data-opening={introducing && !reduced || undefined}
      data-still={reduced || hidden || undefined} aria-labelledby="arrival-heading">
      <div className="nf-arrival-scene" aria-hidden="true">
        <div className="nf-arrival-distance">
          <img src="/brand/arrival/riyadh-sunset.webp" width="1024" height="1536" alt="" fetchPriority="high" draggable="false" />
        </div>
        <div className="nf-arrival-foreground">
          <img src="/brand/arrival/riyadh-sunset.webp" width="1024" height="1536" alt="" draggable="false" />
        </div>
        <div className="nf-arrival-sky" />
        <svg className="nf-arrival-lights" viewBox="0 0 1024 1536" preserveAspectRatio="xMidYMid slice">
          <g fill="#ffddaa">
            <rect x="881" y="1258" width="3" height="5" rx="1" />
            <rect x="849" y="1288" width="3" height="5" rx="1" />
            <rect x="516" y="1249" width="3" height="4" rx="1" />
            <rect x="740" y="1305" width="4" height="5" rx="1" />
            <rect x="186" y="1390" width="4" height="5" rx="1" />
          </g>
        </svg>
      </div>

      <header className="nf-arrival-brand" role="img" aria-label="نصفين">
        <svg className="nf-arrival-emblem" viewBox="0 0 768 768" aria-hidden="true">
          <defs>
            <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="768" height="768">
              <path className="nf-arrival-ink nf-arrival-ink-first" d="M 270 165 C 285 220 175 280 194 408 S 280 545 346 630" pathLength="1" fill="none" stroke="white" strokeWidth="280" strokeLinecap="round" />
              <path className="nf-arrival-ink nf-arrival-ink-second" d="M 500 265 C 599 300 594 424 515 482 S 405 535 347 630" pathLength="1" fill="none" stroke="white" strokeWidth="280" strokeLinecap="round" />
              <rect className="nf-arrival-ink-finish" width="768" height="768" fill="white" />
            </mask>
          </defs>
          <image href="/brand/nisfayn-heart.png" width="768" height="768" mask={`url(#${maskId})`} />
        </svg>
        <img className="nf-arrival-wordmark" src="/brand/nisfayn-wordmark.png" alt="" width="512" height="154" />
        <MotionReveal as="span" active={introducing} delay={600} duration={800} aria-hidden="true">توافق أعمق. بداية أجمل.</MotionReveal>
      </header>

      <section className="nf-arrival-copy">
        <h1 id="arrival-heading"><MotionReveal as="span" active={introducing} delay={400} duration={800} distance={7}>شريك حياة.</MotionReveal><MotionReveal as="span" active={introducing} delay={650} duration={800} distance={7}>ومستقبل تبنونه سوا.</MotionReveal></h1>
        <MotionReveal as="p" active={introducing} delay={900} duration={800} distance={7}>للجادّين في الزواج، بتوافق أعمق<br />وخطوات واضحة.</MotionReveal>
      </section>

      <div className="nf-arrival-illustration" aria-hidden="true">
        <SkiaSurface className="nf-arrival-arches" variant="intro" animate={introducing && !reduced && !hidden} fallback={<svg viewBox="0 0 520 400" fill="none" preserveAspectRatio="none">
          <path d="M -52 350 C -45 73 118 -35 260 151 C 356 269 401 335 520 365" pathLength="1" />
          <path d="M 572 350 C 565 73 402 -35 260 151 C 164 269 119 335 0 365" pathLength="1" />
        </svg>} />
        <img className="nf-arrival-couple" src="/brand/arrival/saudi-couple.webp" alt="" width="1536" height="1024" fetchPriority="high" draggable="false" />
      </div>

      <footer className="nf-arrival-actions">
        <MotionReveal className="nf-arrival-cta-enter" active={introducing} duration={650} distance={12} fromOpacity={.55}>
          <MotionPressButton type="button" className="nf-join nf-arrival-cta" onClick={begin}>
            <span>ابدأ رحلتك</span><ArrowLeft size={21} strokeWidth={1.6} aria-hidden="true" />
          </MotionPressButton>
        </MotionReveal>
        <p className="nf-arrival-login">عندك حساب؟ <button type="button" className="nf-mast-login" onClick={onLogin}>تسجيل الدخول</button></p>
        <button type="button" className="nf-arrival-privacy" onClick={onPrivacy}>الخصوصية وشروط الاستخدام</button>
      </footer>
    </main>
  );
}
