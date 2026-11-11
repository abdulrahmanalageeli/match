import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, Check, Volume2, VolumeX, X } from "../BrandIcons";
import { getDevicePreferences, useDevicePreferences } from "../settings/preferences";
import { playMatchSound, prepareMatchSound, stopMatchSound } from "./matchSound";
import "./matchCelebration.css";
import type { MilestoneKind } from './milestones';

type MatchCelebrationProps = {
  name: string;
  onContinue: () => void;
  onClose: () => void;
  continueLabel?: string;
  milestone?: MilestoneKind;
};

// The caller mounts this only after the server confirms mutual acceptance.
export function MatchCelebration({ name, onContinue, onClose, continueLabel = "ابدأ المحادثة", milestone }: MatchCelebrationProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const detailId = useId();
  const { value, setPreference } = useDevicePreferences();
  const [soundBlocked, setSoundBlocked] = useState(false);
  const mounted = useRef(false);
  const soundIntent = useRef(0);

  useLayoutEffect(() => { if (!value.matchSound) stopMatchSound(); }, [value.matchSound]);

  async function toggleSound() {
    const intent = ++soundIntent.current;
    if (value.matchSound && !soundBlocked) {
      setPreference("matchSound", false);
      stopMatchSound();
      return;
    }
    setPreference("matchSound", true);
    const ready = await prepareMatchSound();
    if (intent === soundIntent.current && mounted.current && !document.hidden && getDevicePreferences().matchSound) {
      setSoundBlocked(!ready || !playMatchSound());
    }
  }

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    mounted.current = true;
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let active = true;
    let settled = false;
    const settle = () => {
      settled = true;
      element.dataset.motion = "still";
    };
    const respectMotion = () => {
      if (document.hidden || preference.matches || document.documentElement.dataset.nfMotion === "reduced") settle();
      if (document.hidden) { soundIntent.current++; stopMatchSound(); }
    };
    const observer = new MutationObserver(respectMotion);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-nf-motion"] });
    preference.addEventListener("change", respectMotion);
    document.addEventListener("visibilitychange", respectMotion);
    element.showModal();
    title.current?.focus({ preventScroll: true });
    respectMotion();
    const logo = new Image();
    logo.src = "/brand/wudayn-heart-v2.png";
    const ready = () => {
      if (active && !settled) element.dataset.motion = "play";
      if (active && !document.hidden && getDevicePreferences().matchSound) {
        setSoundBlocked(!playMatchSound(settled ? .06 : .84));
      }
    };
    void logo.decode().then(ready, () => { if (active) { settle(); ready(); } });
    return () => {
      active = false;
      mounted.current = false;
      soundIntent.current++;
      stopMatchSound();
      observer.disconnect();
      preference.removeEventListener("change", respectMotion);
      document.removeEventListener("visibilitychange", respectMotion);
      element.close();
      // Do not steal focus from the conversation if the caller already opened it.
      if (origin?.isConnected && (document.activeElement === document.body || element.contains(document.activeElement))) {
        origin.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <dialog ref={dialog} className="nf-match" dir="rtl" data-motion="waiting" data-milestone={milestone}
      aria-labelledby={titleId} aria-describedby={detailId}
      onCancel={event => { event.preventDefault(); onClose(); }}>
      <button type="button" className="nf-match-close" aria-label={milestone ? "إغلاق احتفال المرحلة" : "إغلاق إشعار التوافق"} onClick={onClose}>
        <X size={19} aria-hidden="true" />
      </button>
      <button type="button" className="nf-match-sound" onClick={() => void toggleSound()}
        aria-pressed={value.matchSound && !soundBlocked}
        aria-label={soundBlocked ? "تشغيل نغمة التوافق" : value.matchSound ? "كتم صوت التوافق" : "تفعيل صوت التوافق"}>
        {value.matchSound && !soundBlocked ? <Volume2 size={19} aria-hidden="true" /> : <VolumeX size={19} aria-hidden="true" />}
      </button>
      <div className="nf-match-art" aria-hidden="true">
        <span className="nf-match-halo" />
        <span className="nf-match-orbit" />
        <span className="nf-match-ripple" />
        <div className="nf-match-sparks">
          {Array.from({ length: 20 }, (_, i) => <i key={i} style={{ "--i": i } as CSSProperties} />)}
        </div>
        <div className="nf-match-heart">
          <img className="nf-match-half nf-match-half-left" src="/brand/wudayn-heart-v2.png" alt="" draggable="false" />
          <img className="nf-match-half nf-match-half-right" src="/brand/wudayn-heart-v2.png" alt="" draggable="false" />
          <img className="nf-match-whole" src="/brand/wudayn-heart-v2.png" alt="" draggable="false" />
        </div>
        <span className="nf-match-seal"><Check size={16} strokeWidth={1.8} /></span>
      </div>
      <div className="nf-match-copy">
        <span className="nf-match-eyebrow" lang={milestone ? 'ar' : 'en'} dir={milestone ? 'rtl' : 'ltr'}>{milestone === 'family' ? 'من حديث جميل إلى خطوة واضحة' : milestone === 'exclusive' ? 'اختيار متبادل، ومساحة لكما' : 'MATCH FOUND'}</span>
        <h2 ref={title} id={titleId} tabIndex={-1}>{milestone === 'family' ? 'خطوة أقرب، معًا' : milestone === 'exclusive' ? 'اخترتما بعضكما' : 'تم التوافق'}</h2>
        <p id={detailId}>{milestone === 'family' ? <>أنت و<bdi>{name}</bdi> وافقتما على الخطوة الرسمية أو العائلية.<br/>اتفقا الآن على الشخص والوسيلة والموعد. لا تُرسل رسائل إلى العائلة تلقائيًا.</> : milestone === 'exclusive' ? <>بدأ التزامك الحصري مع <bdi>{name}</bdi>.<br/>أُغلقت التعارفات الأخرى، وتبقى هذه المساحة لكما. يمكنكما مراجعة المرحلة من مسار التعارف.</> : <>أنت و<bdi>{name}</bdi> اخترتما التعارف.<br />هذه بداية حديث يستحق الاهتمام.</>}</p>
        <span className="nf-match-rule" aria-hidden="true" />
      </div>
      <div className="nf-match-actions">
        <button type="button" className="btn-primary" onClick={onContinue}>
          {continueLabel} <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <button type="button" className="btn-text" onClick={onClose}>لاحقًا</button>
      </div>
    </dialog>
  );
}
