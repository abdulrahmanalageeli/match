import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Orbit, X } from "../BrandIcons";
import type { CompatibilityChange } from '../compatibility/changes';
import type { MatchFit } from '../compatibility/model';
import { FitDetails } from '../compatibility/FitDetails';
import { MotionPressButton, MotionReveal } from '../motion/Reanimated';
import './compatibility-notice.css';

const arabic = new Intl.NumberFormat('ar-SA', { numberingSystem: 'arab' });

function ScoreChange({ score }: { score: CompatibilityChange['scoreChanges'][number] }) {
  const display = (value: number) => arabic.format(value) + (score.key === 'preferences' ? ' من ١٠٠' : '٪');
  return <span className="nf-compatibility-score-change" aria-label={`${score.label}، من ${display(score.before)} إلى ${display(score.after)}`}>
    <span className="nf-compatibility-score-label" aria-hidden="true">{score.label}</span>
    <span className="nf-compatibility-score-values" aria-hidden="true">
      <span>{display(score.before)}</span><ArrowLeft size={13}/><strong>{display(score.after)}</strong>
    </span>
  </span>;
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
      <span>تحديث التوافق</span>
      <button type="button" onClick={onClose} aria-label="إغلاق تحديث التوافق"><X size={20} aria-hidden="true"/></button>
    </header>
    <MotionReveal className="nf-compatibility-change-body" distance={8} duration={340}>
      <span className="nf-compatibility-change-emblem" aria-hidden="true"><Orbit size={27} strokeWidth={1.3}/></span>
      <h2 id={heading}>ما الذي تغيّر مع {name}؟</h2>
      <p id={explanation} className="nf-compatibility-change-intro">تغيّرت إجابات التقييم.</p>
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
      <details className="nf-compatibility-change-details" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
        <summary>قراءة التوافق الحالية<ChevronDown size={17} aria-hidden="true"/></summary>
        {expanded && <FitDetails fit={fit}/>}
      </details>
      <MotionPressButton className="nf-compatibility-change-done" onClick={onClose}>واضح، شكرًا</MotionPressButton>
    </MotionReveal>
  </dialog>;
}
