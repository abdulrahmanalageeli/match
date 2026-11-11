import {MotionReveal} from './motion/Reanimated';
import {useDevicePreferences,useSystemReducedMotion} from './settings/preferences';
import './joinAdvantages.css';

export function JoinAdvantages({animate=true}:{animate?:boolean}) {
 const {value}=useDevicePreferences();
 const reduced=useSystemReducedMotion()||value.reducedMotion;
 return <section className="wd-join-advantages" aria-label="ما يميّز وُدَين" data-animate={animate&&!reduced||undefined}>
  <MotionReveal className="wd-join-benefit" active={animate} delay={180} distance={7} duration={650}>
   <svg viewBox="0 0 64 48" fill="none" aria-hidden="true"><g className="wd-join-path"><path d="M7 10h12c10 0 8 14 18 14h10M7 38h12c10 0 8-14 18-14"/><path d="m46 17 8 7-8 7"/></g><circle cx="7" cy="10" r="3"/><circle cx="7" cy="38" r="3"/><circle className="wd-join-arrive" cx="54" cy="24" r="4"/></svg>
   <div><h2>خوارزمية ترى ما يجمعكما</h2><p>قيمك · شخصيتك · مواقف الحياة</p><span>توافق مُفسّر، ونقاط تستحق الحوار.</span></div>
  </MotionReveal>
  <MotionReveal className="wd-join-benefit" active={animate} delay={330} distance={7} duration={650}>
   <svg viewBox="0 0 64 48" fill="none" aria-hidden="true"><path className="wd-join-path" d="M13 24h12m8 0h9"/><circle cx="9" cy="24" r="4"/><circle cx="29" cy="24" r="4"/><path className="wd-join-arrive" d="M51 19C47 13 40 16 43 22C45 25 48 28 51 30C54 28 57 25 59 22C62 16 55 13 51 19Z"/></svg>
   <div><h2>تعارف له وجهة</h2><p>اتفاق جدّية ← حصرية ← جسر الأهل</p><span>وقت واضح، وكل خطوة بموافقتكما.</span></div>
  </MotionReveal>
 </section>;
}
