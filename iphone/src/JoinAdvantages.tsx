import {MotionReveal} from './motion/Reanimated';
import {useDevicePreferences,useSystemReducedMotion} from './settings/preferences';
import './joinAdvantages.css';

export function JoinAdvantages({animate=true}:{animate?:boolean}) {
 const {value}=useDevicePreferences();
 const reduced=useSystemReducedMotion()||value.reducedMotion;
 return <section className="wd-join-advantages" aria-label="ما يميّز وُدَين" data-animate={animate&&!reduced||undefined}>
  <MotionReveal className="wd-join-benefit" active={animate} delay={180} distance={7} duration={650}>
   <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <rect className="wd-join-tint" x="5" y="12" width="24" height="38" rx="8"/>
    <rect className="wd-join-tint" x="35" y="12" width="24" height="38" rx="8"/>
    <circle cx="17" cy="25" r="4"/><path d="M10 39v-2a7 7 0 0 1 14 0v2M40 39v-2a7 7 0 0 1 14 0v2"/><circle cx="47" cy="25" r="4"/>
    <path className="wd-join-path" d="M24 47h16"/>
    <g className="wd-join-arrive"><rect className="wd-join-seal" x="24" y="39" width="16" height="16" rx="8"/><path className="wd-join-check" d="m28.5 47 2.3 2.3 4.7-4.6"/></g>
   </svg>
   <div><h2>خوارزمية ترى ما يجمعكما</h2><p>قيمك · شخصيتك · مواقف الحياة</p><span>توافق مُفسّر، ونقاط تستحق الحوار.</span></div>
  </MotionReveal>
  <MotionReveal className="wd-join-benefit" active={animate} delay={330} distance={7} duration={650}>
   <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <path className="wd-join-tint" d="M18 8h20l10 10v30a5 5 0 0 1-5 5H18a5 5 0 0 1-5-5V13a5 5 0 0 1 5-5Z"/>
    <path d="M37 8v8a3 3 0 0 0 3 3h8M21 25h17M21 31h12"/>
    <path className="wd-join-path" d="M21 43c3-8 5-8 4-2s5-4 6-1c.5 2 3 2 5 0"/>
    <g className="wd-join-arrive"><path className="wd-join-ribbon" d="m42 49-2 9 5-3 5 3-2-9"/><circle className="wd-join-seal" cx="45" cy="45" r="8"/><path className="wd-join-check" d="m41.5 45 2.3 2.3 4.7-4.6"/></g>
   </svg>
   <div><h2>تعارف له وجهة</h2><p>اتفاق جدّية ← حصرية ← جسر الأهل</p><span>وقت واضح، وكل خطوة بموافقتكما.</span></div>
  </MotionReveal>
 </section>;
}
