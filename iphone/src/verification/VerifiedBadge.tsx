import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BadgeCheck, FlaskConical, X } from "../BrandIcons";
import { currentVerificationClaims, verificationDate, verificationKinds, type ManualVerificationClaim } from './model';
import './verification.css';

function BadgeDetails({ claims, onClose }: { claims: ManualVerificationClaim[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const test = claims.every(claim => claim.isTest);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return createPortal(<dialog ref={dialog} className="mv-dialog mv-badge-dialog" dir="rtl" aria-labelledby={titleId}
    onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) onClose(); }}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="mv-dialog-head"><span className="mv-dialog-symbol">{test ? <FlaskConical size={25} /> : <BadgeCheck size={25} />}</span><button type="button" className="mv-icon-button" aria-label="إغلاق تفاصيل التوثيق" onClick={onClose} autoFocus><X size={19} /></button></div>
    <h2 id={titleId}>{test ? 'توثيق تجريبي' : 'بيانات تمت مراجعتها'}</h2>
    <p>{test ? 'هذا حساب تجريبي. الشارة لا تمثّل تحققًا من شخص حقيقي أو مستند حقيقي.' : 'راجع فريق نصفين المستندات المقدّمة للبيانات التالية يدويًا.'}</p>
    <div className="mv-badge-claims">{claims.map(claim => <article key={claim.id}>
      <strong>{verificationKinds.find(kind => kind.id === claim.kind)?.label}{claim.isTest && !test ? ' · تجريبي' : ''}</strong>
      <span>{claim.label}</span>
      <small>المراجعة {verificationDate(claim.reviewedAt)} · حتى {verificationDate(claim.expiresAt)}</small>
    </article>)}</div>
    <p className="mv-fine-print">تخص الشارة البيانات الموضّحة فقط. المراجعة يدوية وليست تحققًا حكوميًا، ولا تضمن السلوك أو التوافق. مستندات المستخدم غير متاحة للأعضاء.</p>
  </dialog>, document.body);
}

export function VerifiedBadge({ claims: value, compact = false, interactive = true, className = '' }: { claims?: ManualVerificationClaim[] | null; compact?: boolean; interactive?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now);
  const claims = currentVerificationClaims(value, Math.max(now, Date.now()));
  const nextExpiry = claims.length ? Math.min(...claims.map(claim => Date.parse(claim.expiresAt))) : null;
  useEffect(() => {
    if (nextExpiry === null) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(2_147_483_647, Math.max(1, nextExpiry - Date.now() + 1)));
    return () => window.clearTimeout(timer);
  }, [nextExpiry, now]);
  if (!claims.length) return null;
  const test = claims.every(claim => claim.isTest);
  const label = test ? 'توثيق تجريبي' : 'تمت المراجعة';
  const details = claims.map(claim => verificationKinds.find(kind => kind.id === claim.kind)?.label).join('، ');
  const badgeClass = `mv-badge${compact ? ' mv-badge-compact' : ''}${test ? ' mv-badge-test' : ''} ${className}`;
  if (!interactive) return <span className={`${badgeClass} mv-badge-static`} role="img" aria-label={`${label}: ${details}`} title={`${label}: ${details}. مراجعة يدوية للبيانات المحددة فقط.`}><BadgeCheck size={compact ? 16 : 17} aria-hidden="true" /><span>{label}</span></span>;
  return <>
    <button type="button" className={badgeClass}
      aria-label={`${label}: ${details}. عرض نطاق التوثيق وصلاحيته`} aria-haspopup="dialog" aria-expanded={open}
      title={`${label}: ${details}`} onClick={event => { event.stopPropagation(); setOpen(true); }}>
      <BadgeCheck size={compact ? 16 : 17} aria-hidden="true" /><span>{label}</span>
    </button>
    {open ? <BadgeDetails claims={claims} onClose={() => setOpen(false)} /> : null}
  </>;
}
