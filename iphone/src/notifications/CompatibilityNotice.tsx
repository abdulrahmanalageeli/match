import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronLeft, Orbit, X } from "../BrandIcons";
import type { CompatibilityChange } from '../compatibility/changes';
import type { MatchFit } from '../compatibility/model';
import { FitDetails } from '../compatibility/FitDetails';
import { MotionPressButton, MotionReveal } from '../motion/Reanimated';
import { useDevicePreferences, useSystemReducedMotion } from '../settings/preferences';
import './compatibility-notice.css';

const arabic = new Intl.NumberFormat('ar-SA', { numberingSystem: 'arab' });
const percent = (value: number) => `${arabic.format(value)}٪`;

function ScoreChange({ score }: { score: CompatibilityChange['scoreChanges'][number] }) {
  return <span className="nf-compatibility-score-change" aria-label={`${score.label}، من ${percent(score.before)} إلى ${percent(score.after)}`}>
    <span className="nf-compatibility-score-label" aria-hidden="true">{score.label}</span>
    <span className="nf-compatibility-score-values" aria-hidden="true">
      <span>{percent(score.before)}</span><ArrowLeft size={13}/><strong>{percent(score.after)}</strong>
    </span>
  </span>;
}

/** One quiet notice; the shared activity host decides when it is safe to show. */
export function CompatibilityNotice({ name, change, onOpen, onDismiss }: {
  name: string; change: CompatibilityChange; onOpen: () => void; onDismiss: () => void;
}) {
  const title = useId();
  const [leaving, setLeaving] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const { value } = useDevicePreferences();
  const systemReduced = useSystemReducedMotion();
  const reduced = value.reducedMotion || systemReduced;
  const dismiss = useRef(onDismiss); dismiss.current = onDismiss;
  useEffect(() => {
    const visibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  useEffect(() => {
    if (leaving || hovered || focused || hidden) return;
    const timer = window.setTimeout(() => setLeaving(true), 9000);
    return () => window.clearTimeout(timer);
  }, [leaving, hovered, focused, hidden, change.key]);
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => dismiss.current(), reduced ? 0 : 180);
    return () => window.clearTimeout(timer);
  }, [leaving, reduced]);
  return <div className="nf-activity-toast nf-compatibility-notice" role="status" aria-live="polite" aria-atomic="true"
    aria-labelledby={title} data-leaving={leaving || undefined} data-compatibility-change=""
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <MotionReveal className="nf-compatibility-notice-card" distance={-8} duration={320}>
      <MotionPressButton className="nf-compatibility-notice-open" onClick={onOpen} disabled={leaving} aria-label={`ما الذي تغيّر في توافقك مع ${name}؟`}>
        <span className="nf-compatibility-notice-mark" aria-hidden="true"><Orbit size={20} strokeWidth={1.4}/></span>
        <span className="nf-compatibility-notice-copy">
          <strong id={title}>تحدّث توافقك مع {name}</strong>
          {change.scoreChanges[0] ? <ScoreChange score={change.scoreChanges[0]}/> : <span className="nf-compatibility-notice-reading">ملامح جديدة في قراءة توافقكما</span>}
          <small>{change.summary}</small>
        </span>
        <ChevronLeft className="nf-compatibility-notice-chevron" size={16} aria-hidden="true"/>
      </MotionPressButton>
      <button className="nf-compatibility-notice-dismiss" type="button" aria-label="إخفاء تحديث التوافق" disabled={leaving} onClick={() => setLeaving(true)}><X size={17} aria-hidden="true"/></button>
    </MotionReveal>
  </div>;
}

export function CompatibilityChangeSheet({ name, change, fit, onClose }: {
  name: string; change: CompatibilityChange; fit: MatchFit; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId(), explanation = useId();
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal();
    return () => {
      element.close();
      if (document.querySelector('dialog[open]')) return;
      if (previousFocus?.isConnected) { previousFocus.focus({ preventScroll: true }); return; }
      // The notice disappears when opened. Return to the surrounding content
      // without unexpectedly raising the mobile chat keyboard.
      const heading = document.querySelector<HTMLElement>('[data-conversation-id] h1, main h1');
      if (!heading) return;
      const previousTabIndex = heading.getAttribute('tabindex');
      heading.tabIndex = -1; heading.focus({ preventScroll: true });
      if (previousTabIndex === null) heading.removeAttribute('tabindex');
    };
  }, []);
  return <dialog ref={dialog} className="nf-compatibility-change-sheet" dir="rtl" aria-labelledby={heading} aria-describedby={explanation}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="nf-compatibility-change-header">
      <span>قراءة تتجدّد معكما</span>
      <button type="button" onClick={onClose} aria-label="إغلاق تحديث التوافق"><X size={20} aria-hidden="true"/></button>
    </header>
    <MotionReveal className="nf-compatibility-change-body" distance={8} duration={340}>
      <span className="nf-compatibility-change-emblem" aria-hidden="true"><Orbit size={27} strokeWidth={1.3}/></span>
      <h2 id={heading}>ما الذي تغيّر مع {name}؟</h2>
      <p id={explanation} className="nf-compatibility-change-intro">تحدّثت القراءة بعد حفظ إجابات التقييم.</p>
      {change.scoreChanges.length > 0 && <div className="nf-compatibility-change-scores" aria-label="النسب قبل التحديث وبعده">
        {change.scoreChanges.map(score => <ScoreChange key={score.key} score={score}/>)}
      </div>}
      <section className="nf-compatibility-change-reasons" aria-label="ما وراء التحديث">
        <h3>ما وراء التحديث</h3>
        <ul>{change.reasons.slice(0, 3).map(reason => <li key={reason}>{reason}</li>)}</ul>
        {change.reasons.length > 3 && <details><summary>بقية التغيّرات <span>{arabic.format(change.reasons.length - 3)}</span><ChevronDown size={15} aria-hidden="true"/></summary>
          <ul>{change.reasons.slice(3).map(reason => <li key={reason}>{reason}</li>)}</ul>
        </details>}
      </section>
      <p className="nf-compatibility-change-note">تغيّر النسبة يوضّح إجاباتكما الحالية. الاختلاف مساحة للحوار، وليس حكمًا على العلاقة.</p>
      <details className="nf-compatibility-change-details" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
        <summary>قراءة التوافق الحالية<ChevronDown size={17} aria-hidden="true"/></summary>
        {expanded && <FitDetails fit={fit}/>}
      </details>
      <MotionPressButton className="nf-compatibility-change-done" onClick={onClose}>واضح، شكرًا</MotionPressButton>
    </MotionReveal>
  </dialog>;
}
