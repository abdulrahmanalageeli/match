import { useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft, X } from '../BrandIcons';
import type { PublicPerson } from '../community/data';
import type { PushOpen } from './push';
import { updateEvents } from '../../admin/server/updateEvents';
import { MemberNoticeSymbol, pushNoticeArt, type NoticeArtKind } from './MemberNoticeSymbol';
import eyeRim from './artwork/enamel-eye.webp?inline';
import envelopePocket from './artwork/stationery-pocket.webp?inline';
import wudaynImprint from './artwork/wudayn-imprint.webp?inline';
import './member-notice.css';

export type MemberNotice = {
  kind: 'request' | 'visit';
  key: string;
  person: PublicPerson;
  requestId?: string;
} | {
  kind: 'push';
  key: string;
  push: PushOpen;
  title: string;
  actor?: string;
  actionLabel?: string;
  private?: boolean;
};

function NoticeArt({ kind }: { kind: NoticeArtKind }) {
  const aperture = useId().replace(/:/g, '');
  if (kind !== 'request' && kind !== 'visit') return <MemberNoticeSymbol kind={kind} id={aperture}/>;
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

const logoHoldMs = 700;
const messageMs = 6500;
const exitMs = 245 + logoHoldMs; // The capsule closes before the final logo hold.
// The full catalog text stays in the announcement and button name. Each compact
// title also works on the narrowest pill without losing the event or next step.
const compactTitles: Readonly<Record<string, string | undefined>> = {
  [updateEvents['introduction:declined'][0]]: 'اعتذر الطرف الآخر عن طلبك',
  [updateEvents['family_room:invited'][0]]: 'دعوة لمحادثة عائلية',
  [updateEvents['family_room:ready'][0]]: 'اتفقتم على محادثة الأهل',
  [updateEvents['analysis:invited'][0]]: 'دعوة لتحليل لونا المعمّق',
  [updateEvents['agreement:proposed'][0]]: 'الميثاق بانتظار توقيعك',
  [updateEvents['agreement:due'][0]]: 'ينتهي الميثاق خلال يوم',
  [updateEvents['agreement:family_invited'][0]]: 'اقتراح للتواصل مع الأهل',
  [updateEvents['agreement:family_confirmed'][0]]: 'تم الاتفاق على تواصل الأهل',
  [updateEvents['agreement:family_contact'][0]]: 'شاركت معك رقم أهلها',
  [updateEvents['journey:invited'][0]]: 'خطوة تعارف تنتظر ردّك',
  [updateEvents['rematch:invited'][0]]: 'طلب للرجوع إلى التعارف',
  [updateEvents['family_link:pending'][0]]: 'طلب ربط في جسر الأهل',
  [updateEvents['family_link:reviewed'][0]]: 'تحديث على طلب ربط الأهل',
  [updateEvents['family_link:expired'][0]]: 'انتهت صلاحية رابط الأهل',
  [updateEvents['application:corrections'][0]]: 'طلب انضمامك يحتاج تحديث',
  [updateEvents['verification:changes_requested'][0]]: 'طلب التوثيق يحتاج تحديث',
  [updateEvents['verification:rejected'][0]]: 'تحديث على طلب التوثيق',
  [updateEvents['membership:payment'][0]]: 'راجع دفعة العضوية',
  [updateEvents['gift:invited'][0]]: 'دعوة لقبول هدية عضوية',
};
const prefersQuietMotion = () => document.documentElement.dataset.nfMotion === 'reduced' ||
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    const timer = window.setTimeout(() => setPresented(true), prefersQuietMotion() ? 0 : logoHoldMs);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!presented || exitAction || hover || focus) return;
    const timer = window.setTimeout(() => setExitAction('dismiss'), messageMs);
    return () => window.clearTimeout(timer);
  }, [presented, exitAction, hover, focus]);
  useEffect(() => {
    if (!exitAction) return;
    const timer = window.setTimeout(() => {
      if (handled.current) return;
      handled.current = true;
      if (exitAction === 'open') callbacks.current.onOpen();
      else callbacks.current.onDismiss();
    }, prefersQuietMotion() ? 0 : exitMs);
    return () => window.clearTimeout(timer);
  }, [exitAction]);

  const art = notice.kind === 'push' ? (notice.private ? 'notice' : pushNoticeArt(notice.push)) : notice.kind;
  const title = notice.kind === 'push' ? (notice.private ? 'إشعار جديد من وُدَين' : notice.title) :
    notice.kind === 'request' ? 'وصلك طلب تعارف من' : 'زيارة لملفك من';
  const actor = notice.kind === 'push' ? (notice.private ? undefined : notice.actor) : notice.person.alias;
  const action = notice.kind === 'push' ? (notice.private ? 'عرض الإشعار' : notice.actionLabel ?? 'عرض الإشعار') :
    notice.kind === 'request' ? 'مراجعة الطلب' : 'عرض الملف';
  const compactTitle = notice.kind === 'push' && !actor ? compactTitles[title] ?? title : title;
  const label = <><span>{compactTitle}</span>{actor && <>{' '}<bdi>{actor}</bdi></>}</>;
  return (
    <aside className="nf-member-notice" data-kind={art} data-phase={exitAction ? 'exit' : 'enter'}
      data-expanded={presented && !exitAction}
      dir="rtl" aria-label="تنبيه"
      onPointerEnter={event => { if (event.pointerType === 'mouse') setHover(true); }}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocus(false); }}>
      <span className="mi-sr-only" role="status" aria-atomic="true">{presented && <>{title}{actor && <>{' '}<bdi>{actor}</bdi></>}</>}</span>
      <div className="feedback nf-member-notice-surface">
        <span className="nf-member-notice-seal" aria-hidden="true">
          <img src={wudaynImprint} width="26" height="26" alt=""/>
        </span>
        <div className="nf-member-notice-content">
          <button type="button" className="nf-member-notice-open" aria-label={compactTitle !== title ? title + '، ' + action : undefined}
            onClick={() => setExitAction(current => current ?? 'open')}>
            <NoticeArt kind={art}/>
            <span className="nf-member-notice-label">{label}</span>
            <span className="nf-member-notice-action" aria-hidden="true">
              <span>{art === 'request' ? 'مراجعة' : 'عرض'}</span><ChevronLeft size={13}/>
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
