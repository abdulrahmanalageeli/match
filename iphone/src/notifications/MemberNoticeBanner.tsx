import { useEffect, useId, useRef, useState } from 'react';
import { X } from '../BrandIcons';
import type { PublicPerson } from '../community/data';
import eyeRim from './artwork/enamel-eye.webp?inline';
import envelopePocket from './artwork/stationery-pocket.webp?inline';
import wudaynImprint from './artwork/wudayn-imprint.webp?inline';
import './member-notice.css';

export type MemberNotice = {
  kind: 'request' | 'visit';
  key: string;
  person: PublicPerson;
  requestId?: string;
};

function NoticeArt({ kind }: { kind: MemberNotice['kind'] }) {
  const aperture = useId().replace(/:/g, '');
  return (
    <svg className="nf-member-notice-art" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      {kind === 'visit' ? <>
        <defs>
          <clipPath id={aperture}>
            <path className="nf-notice-lids" d="M1.6 16.2C7.4 12.8 10.6 8.9 16 8.9s9.2 3.7 14.4 7.3c-5.6 3.6-9.1 6.8-14.4 6.8S7 19.5 1.6 16.2Z"/>
          </clipPath>
          <radialGradient id={aperture + '-iris'} cx=".4" cy=".31" r=".75">
            <stop stopColor="#d19792"/><stop offset=".54" stopColor="#a05b66"/>
            <stop offset=".86" stopColor="#713646"/><stop offset="1" stopColor="#482230"/>
          </radialGradient>
        </defs>
        <g clipPath={`url(#${aperture})`}>
          <rect width="32" height="32" fill="#fcf6f2"/>
          <g className="nf-notice-iris">
            <circle cx="16" cy="16" r="5.9" fill={`url(#${aperture}-iris)`}/>
            <circle cx="16" cy="16" r="2.85" fill="#3f1c2b"/>
            <ellipse cx="14.3" cy="14.1" rx="1.35" ry=".85" transform="rotate(-32 14.3 14.1)" fill="#fff6ed"/>
          </g>
        </g>
        <g className="nf-notice-lids">
          <image href={eyeRim} x=".6" y="7.8" width="30.8" height="16" preserveAspectRatio="none"/>
        </g>
      </> : <>
        <defs>
          <clipPath id={aperture}><rect width="32" height="26"/></clipPath>
          <linearGradient id={aperture + '-lining'} x2=".85" y2="1">
            <stop stopColor="#c4898c"/><stop offset="1" stopColor="#713747"/>
          </linearGradient>
          <linearGradient id={aperture + '-paper'} x2=".4" y2="1">
            <stop stopColor="#fffbef"/><stop offset=".65" stopColor="#f3e5dc"/><stop offset="1" stopColor="#d7b9b5"/>
          </linearGradient>
        </defs>
        <g className="nf-notice-envelope">
          <path d="M2.6 14h26.8v7.2H2.6z" fill="#733547"/>
          <path className="nf-notice-flap" d="M2.5 14 14.8 5.8a2 2 0 0 1 2.4 0L29.5 14Z" fill={`url(#${aperture}-lining)`}/>
          <g clipPath={`url(#${aperture})`}>
            <g className="nf-notice-letter">
              <g transform="rotate(-5 16 15)">
                <rect x="7.1" y="3.7" width="17.8" height="18" rx="1.45" fill={`url(#${aperture}-paper)`} stroke="#c8aba6" strokeWidth=".65"/>
                <image className="nf-notice-heart" href={wudaynImprint} x="11.35" y="6.65" width="9.3" height="8.7"/>
              </g>
            </g>
          </g>
          <image href={envelopePocket} x="2.5" y="14" width="27" height="13.7"/>
        </g>
      </>}
    </svg>
  );
}

const lifetimeMs = 6500;
const exitMs = 240;

export function MemberNoticeBanner({ notice, onOpen, onDismiss }: {
  notice: MemberNotice;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const [exitAction, setExitAction] = useState<'dismiss' | 'open' | null>(null);
  const [presented, setPresented] = useState(false);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const handled = useRef(false);
  const callbacks = useRef({ onOpen, onDismiss });
  callbacks.current = { onOpen, onDismiss };
  useEffect(() => {
    // Paint the compact capsule first so an early dismissal can reverse its transition.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setPresented(true));
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (exitAction || hover || focus) return;
    const timer = window.setTimeout(() => setExitAction('dismiss'), lifetimeMs);
    return () => window.clearTimeout(timer);
  }, [exitAction, hover, focus]);
  useEffect(() => {
    if (!exitAction) return;
    const reduced = document.documentElement.dataset.nfMotion === 'reduced' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => {
      if (handled.current) return;
      handled.current = true;
      if (exitAction === 'open') callbacks.current.onOpen();
      else callbacks.current.onDismiss();
    }, reduced ? 0 : exitMs);
    return () => window.clearTimeout(timer);
  }, [exitAction]);

  const request = notice.kind === 'request';
  const title = request ? 'طلب تعارف' : 'زيارة لملفك';
  const action = request ? 'مراجعة الطلب' : 'عرض الملف';
  return (
    <aside className="nf-member-notice" data-kind={notice.kind} data-phase={exitAction ? 'exit' : 'enter'}
      data-expanded={presented && !exitAction}
      dir="rtl" aria-label="تنبيه"
      onPointerEnter={event => { if (event.pointerType === 'mouse') setHover(true); }}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocus(false); }}>
      <span className="mi-sr-only" role="status" aria-atomic="true">{presented && <>{title} من <bdi>{notice.person.alias}</bdi></>}</span>
      <div className="feedback nf-member-notice-surface">
        <div className="nf-member-notice-content">
          <button type="button" className="nf-member-notice-open" onClick={() => setExitAction(current => current ?? 'open')}>
            <NoticeArt kind={notice.kind}/>
            <span className="nf-member-notice-label">
              <bdi>{notice.person.alias}</bdi>
              <span>{title}</span>
            </span>
            <span className="mi-sr-only">{action}</span>
          </button>
          <button type="button" className="nf-member-notice-close" aria-label="إخفاء التنبيه" onClick={() => setExitAction(current => current ?? 'dismiss')}>
            <X size={14} aria-hidden="true"/>
          </button>
        </div>
      </div>
    </aside>
  );
}
