import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, Check, Volume2, VolumeX, X } from "../BrandIcons";
import { getDevicePreferences, useDevicePreferences } from "../settings/preferences";
import { playMatchSound, prepareMatchSound, stopMatchSound } from "./matchSound";
import "./matchCelebration.css";
import type { MilestoneKind } from './milestones';
import type { CommunitySource, SeriousnessAgreement } from './data';
import { durationLabel } from '../member-copy';

type MatchCelebrationProps = {
  name: string;
  onContinue: () => void;
  onClose: () => void;
  continueLabel?: string;
  milestone?: MilestoneKind;
  agreementSummary?: { ownName: string; detail: string };
};

export function MutualAcceptance({ source, requestId, ownName, name, onContinue, onClose }: {
  source: CommunitySource; requestId: string; ownName?: string; name: string; onContinue: () => void; onClose?: () => void;
}) {
  const [agreement, setAgreement] = useState<SeriousnessAgreement | null>(null);
  useEffect(() => {
    let revision = 0;
    async function refresh() {
      const ticket = ++revision;
      if (!source.agreement || document.hidden) { setAgreement(null); return; }
      try {
        const next = await source.agreement(requestId);
        if (ticket === revision) setAgreement(next);
      } catch { if (ticket === revision) setAgreement(null); }
    }
    void refresh();
    const stop = source.watch(refresh);
    const timer = window.setInterval(refresh, 15000);
    document.addEventListener('visibilitychange', refresh);
    return () => { revision++; stop(); clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [source, requestId]);

  const ready = agreement?.status === 'family' || (agreement?.status === 'accepted' &&
    (!agreement.deadline || Date.parse(agreement.deadline) > Date.now()));
  let detail = 'الخطوة التالية مراجعة شروط التعارف ومدته قبل أول رسالة.';
  if (agreement?.status === 'family') detail = 'اتفقتما على التواصل مع الأهل. المحادثة متاحة لكما.';
  else if (ready && agreement.deadline) {
    const end = new Intl.DateTimeFormat('ar-SA', { dateStyle: 'long', calendar: 'gregory', timeZone: 'Asia/Riyadh' }).format(new Date(agreement.deadline));
    detail = `مدة التعارف المتفق عليها حتى ${end}.`;
  } else if (ready) detail = agreement.days ? `اتفقتما على مدة التعارف · ${durationLabel(agreement.days)}.` : 'المحادثة متاحة لكما الآن.';
  else if (!source.agreement) detail = 'يمكنكما الآن فتح مساحة التعارف.';
  else if (agreement?.status === 'none') detail = agreement.actor === 'reham'
    ? 'راجعي الشروط واقترحي مدة التعارف.' : 'بانتظار اقتراح مدة التعارف من الطرف الآخر.';
  else if (agreement?.status === 'expired' || agreement?.status === 'accepted') detail = 'انتهت المدة المتفق عليها. راجعا اتفاقكما لاختيار الخطوة التالية.';
  else if (agreement?.status === 'proposed') detail = agreement.actor === 'reham'
    ? 'أرسلتِ المدة المقترحة. بانتظار موافقة الطرف الآخر.' : 'لديك مدة مقترحة. راجع شروط التعارف والمدة قبل الموافقة.';
  const mine = agreement?.mineName || ownName || 'أنت';
  const peer = agreement?.peerName || name;
  const label = ready ? 'ابدأ المحادثة' : source.agreement ? 'مراجعة اتفاق التعارف' : 'عرض التعارف';
  if (!onClose) return <section className="nf-accepted-summary" aria-label="اتفاق التعارف">
    <strong>قبِلتما التعارف</strong><span><bdi>{mine}</bdi> و<bdi>{peer}</bdi></span>
    <p aria-live="polite">{detail}</p><button type="button" className="btn-primary" data-chat-entry="" onClick={onContinue}>{label}<ArrowLeft size={17}/></button>
  </section>;
  return <MatchCelebration name={peer} agreementSummary={{ ownName: mine, detail }}
    continueLabel={label} onContinue={onContinue} onClose={onClose}/>;
}

// The caller mounts this only after the server confirms mutual acceptance.
export function MatchCelebration({ name, onContinue, onClose, continueLabel = "عرض التعارف", milestone, agreementSummary }: MatchCelebrationProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const detailId = useId();
  const { value, setPreference } = useDevicePreferences();
  const [soundBlocked, setSoundBlocked] = useState(false);
  const mounted = useRef(false);
  const soundIntent = useRef(0);
  const isAgreement = Boolean(agreementSummary);

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
    if (isAgreement) { settle(); ready(); }
    else void logo.decode().then(ready, () => { if (active) { settle(); ready(); } });
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
  }, [isAgreement]);

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
      {agreementSummary ? <div className="nf-match-names"><bdi>{agreementSummary.ownName || 'أنت'}</bdi><span> و </span><bdi>{name}</bdi></div> : <div className="nf-match-art" aria-hidden="true">
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
      </div>}
      <div className="nf-match-copy">
        <h2 ref={title} id={titleId} tabIndex={-1}>{agreementSummary ? 'قبِلتما التعارف' : milestone === 'family' ? 'اتفقتما على التواصل مع الأهل' : milestone === 'exclusive' ? 'بدأ التعارف الحصري' : 'قُبل طلب التعارف'}</h2>
        <p id={detailId} aria-live={agreementSummary ? 'polite' : undefined}>{agreementSummary ? agreementSummary.detail : milestone === 'family' ? <>أنت و<bdi>{name}</bdi> وافقتما على التواصل مع الأهل.<br/>اتفقا الآن على الشخص والوسيلة والموعد. لا تُرسل رسائل إلى العائلة تلقائيًا.</> : milestone === 'exclusive' ? <>بدأ تعارفك الحصري مع <bdi>{name}</bdi>.<br/>أُغلقت التعارفات الأخرى، وتبقى هذه المساحة لكما. يمكنكما مراجعة المرحلة من مسار التعارف.</> : <>أنت و<bdi>{name}</bdi> اخترتما التعارف.<br />يمكنكما الآن مراجعة شروط التعارف ومدته.</>}</p>
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
