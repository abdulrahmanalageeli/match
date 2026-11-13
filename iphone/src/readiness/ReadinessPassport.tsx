import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, BadgeCheck, BookOpenCheck, CalendarDays, Check, ChevronDown, CircleHelp, Clock3, Download, Fingerprint, LockKeyhole, Share2, ShieldCheck, Trash2, UsersRound } from "../BrandIcons";
import { Brand } from '../Brand';
import type { CommunitySource, Connection } from '../community/data';
import {
  familyOptions, preparationItems, preparationStatusOptions, readinessConsentVersion,
  readinessSections, timelineOptions, type ReadinessPassport, type ReadinessPreparation, type ReadinessSection,
  type SharedReadinessPassport, type VerificationClaim,
} from './model';
import './readiness.css';

const number = new Intl.NumberFormat('ar-SA');
function date(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return '—';
  return new Intl.DateTimeFormat('ar-SA', { calendar: 'gregory', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
}
function label(options: readonly { id: string; label: string }[], value?: string) { return options.find(item => item.id === value)?.label ?? 'لم تُحدّد بعد'; }
function errorText(error: unknown) { return error instanceof Error ? error.message : 'تعذّر إتمام الطلب. حاول مرة أخرى.'; }
function ownerResult(value: unknown): ReadinessPassport {
  if (!value || typeof value !== 'object' || !('consentedAt' in value) || !('claims' in value) || !Array.isArray(value.claims) || !('grants' in value) || !Array.isArray(value.grants)) throw Error('تعذّر قراءة الجواز. أعد المحاولة.');
  return value as ReadinessPassport;
}

function PassportFrame({ children, onBack, shared = false }: { children: ReactNode; onBack: () => void; shared?: boolean }) {
  return <main className="app-screen rp-screen" dir="rtl"><div className="screen-content rp-content">
    <header className="rp-navigation"><button type="button" className="rp-back" onClick={onBack}><ArrowRight size={18} /> {shared ? 'الملف الشخصي' : 'الإعدادات'}</button><Brand compact /></header>
    {children}
  </div></main>;
}

function PassportCover({ shared, name, count, updatedAt }: { shared?: boolean; name?: string; count?: number; updatedAt?: string | null }) {
  return <section className="rp-cover" aria-labelledby="rp-title">
    <div className="rp-cover-top"><span><LockKeyhole size={13} /> {shared ? 'مشاركة خاصة معك' : 'خاص بك · المشاركة باختيارك'}</span><BookOpenCheck size={23} strokeWidth={1.3} /></div>
    <span className="rp-eyebrow">خطوة أوضح نحو حياة مشتركة</span>
    <h1 id="rp-title">جواز الجاهزية<br /><em>للزواج</em></h1>
    <p>{shared ? `ما اختار${name ? ` ${name}` : ' الطرف الآخر'} مشاركته معك، لحديث أكثر وضوحًا.` : 'مساحة ترتّب فيها نيتك واستعدادك، وتشارك منها ما يناسبك عندما يحين الوقت.'}</p>
    <div className="rp-cover-foot"><span>{count === undefined ? <><ShieldCheck size={14} /> بيانات بإذن صاحبها</> : <><b>{number.format(count)} / ٥</b> خطوات رتّبتها</>}</span><small>{updatedAt ? `آخر تحديث ${date(updatedAt)}` : 'بداية على مهل'}</small></div>
  </section>;
}

function ClaimCard({ claim }: { claim: VerificationClaim }) {
  const current = claim.status === 'valid' && Date.parse(claim.expiresAt) > Date.now();
  const status = current ? 'بيان أكدته الجهة' : claim.status === 'revoked' ? 'سُحب التحقق' : 'انتهت صلاحية التحقق';
  return <article className={'rp-claim' + (current ? ' rp-claim-current' : '')}>
    <div><BadgeCheck size={19} /><strong>{claim.label}</strong></div><span className="rp-chip">{status}</span>
    <dl><div><dt>الجهة</dt><dd>{claim.issuer}</dd></div><div><dt>طريقة التحقق</dt><dd>تأكيد مستقل من الجهة</dd></div><div><dt>تم التحقق</dt><dd>{date(claim.verifiedAt)}</dd></div><div><dt>صالح حتى</dt><dd>{date(claim.expiresAt)}</dd></div></dl>
  </article>;
}

function VerificationSection({ claims, shared = false }: { claims: VerificationClaim[]; shared?: boolean }) {
  const identity = claims.some(item => item.kind === 'identity' && item.status === 'valid' && Date.parse(item.expiresAt) > Date.now());
  return <section className="rp-section" aria-labelledby="rp-verification-title">
    <div className="rp-section-heading"><span className="rp-section-icon"><Fingerprint size={20} /></span><div><h2 id="rp-verification-title">الهوية والبيانات الموثّقة</h2><p>كل تحقق له نطاق ومصدر وصلاحية</p></div></div>
    {!identity && <div className="rp-verification-empty"><span className="rp-chip">الهوية غير متحققة مستقلًا</span><p>{shared ? 'لا يوجد تحقق مستقل ساري للهوية ضمن هذا الجواز.' : 'ربط جهة التحقق المستقلة غير متاح حاليًا، واستقبال مستندات جديدة للمراجعة اليدوية متوقف أيضًا. يمكنك متابعة طلبات المراجعة السابقة أو سحبها من الإعدادات ← طلبات التوثيق السابقة، إن كانت لديك طلبات.'}</p>{!shared && <small>لا نطلب هنا صورة الهوية أو رقمها أو بيانات مالية أو طبية. لا ترسل المستندات في المحادثات أو إلى الدعم كبديل.</small>}</div>}
    {claims.map(claim => <ClaimCard key={claim.id} claim={claim} />)}
    <p className="rp-caption">التحقق يثبت البيان المحدد فقط؛ لا يضمن السلوك أو التوافق أو نجاح الزواج. اعتماد العضوية لا يُعد تحققًا من الهوية.</p>
  </section>;
}

function WithdrawDialog({ busy, onCancel, onConfirm }: { busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); const element = dialog.current; return () => element?.close(); }, []);
  return <dialog ref={dialog} className="st-dialog rp-dialog" dir="rtl" aria-labelledby="rp-withdraw-title" onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <span className="st-dialog-icon"><Trash2 size={20} /></span><h2 id="rp-withdraw-title">سحب الموافقة وحذف الجواز؟</h2>
    <p>تُحذف بيانات الجواز وتتوقف مشاركاته. يمكنك إنشاء جواز جديد لاحقًا. لا يتغير ملفك الشخصي أو تعارفك الحالي.</p>
    <form onSubmit={event => { event.preventDefault(); onConfirm(); }}><button className="btn-secondary" type="button" autoFocus disabled={busy} onClick={onCancel}>تراجع</button><button className="btn-primary" disabled={busy} type="submit">{busy ? 'جارٍ الحذف…' : 'حذف وسحب الموافقة'}</button></form>
  </dialog>;
}

export function ReadinessPassportPanel({ source, onBack }: { source: CommunitySource; onBack: () => void }) {
  const [passport, setPassport] = useState<ReadinessPassport | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [timeline, setTimeline] = useState('');
  const [family, setFamily] = useState('');
  const [preparation, setPreparation] = useState<ReadinessPreparation>(() => Object.fromEntries(preparationItems.map(item => [item.id, 'not_started'])) as ReadinessPreparation);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [connectionId, setConnectionId] = useState('');
  const [sections, setSections] = useState<ReadinessSection[]>([]);
  const [days, setDays] = useState(7);
  const [withdraw, setWithdraw] = useState(false);
  const [retry, setRetry] = useState(0);
  const requestVersion = useRef(0);
  const matchesLoaded = useRef(false);
  function adopt(value: ReadinessPassport) {
    setPassport(value); setTimeline(value.timeline ?? ''); setFamily(value.family ?? '');
    setPreparation(value.preparation ?? Object.fromEntries(preparationItems.map(item => [item.id, 'not_started'])) as ReadinessPreparation);
    setConsent(Boolean(value.consentedAt));
  }
  useLayoutEffect(() => {
    let active = true;
    requestVersion.current += 1;
    setPassport(null); setBusy(false); setError(''); setStatus(''); setConnections([]); setSections([]); setConnectionId(''); setTimeline(''); setFamily(''); setConsent(false); setWithdraw(false);
    setPreparation(Object.fromEntries(preparationItems.map(item => [item.id, 'not_started'])) as ReadinessPreparation);
    matchesLoaded.current = false;
    if (!source.readiness) { setError('جواز الجاهزية غير متاح في هذه الجلسة.'); return; }
    Promise.allSettled([source.readiness('get'), source.inbox()]).then(([profileResult, inboxResult]) => {
      if (!active) return;
      if (profileResult.status === 'fulfilled') { try { adopt(ownerResult(profileResult.value)); } catch (cause) { setError(errorText(cause)); } }
      else setError(errorText(profileResult.reason));
      if (inboxResult.status === 'fulfilled') { setConnections(inboxResult.value.filter(item => item.status === 'accepted' && source.readinessEligibleConnection?.(item.id) !== false)); matchesLoaded.current = true; }
    });
    return () => { active = false; requestVersion.current += 1; };
  }, [source, retry]);
  const changed = Boolean(passport && (timeline !== (passport.timeline ?? '') || family !== (passport.family ?? '') || preparationItems.some(item => preparation[item.id] !== (passport.preparation?.[item.id] ?? 'not_started'))));
  async function mutate(action: 'save' | 'share' | 'revoke' | 'withdraw', payload: Record<string, unknown>, success: string) {
    if (!source.readiness || busy) return;
    const version = requestVersion.current;
    setBusy(true); setError(''); setStatus('');
    try {
      const result = ownerResult(await source.readiness(action, payload));
      if (version !== requestVersion.current) return;
      if (action === 'save' || action === 'withdraw') adopt(result); else setPassport(result);
      setStatus(success); if (action === 'share') setSections([]); if (action === 'withdraw') { setWithdraw(false); setSections([]); setConnectionId(''); }
    } catch (cause) { if (version === requestVersion.current) { setWithdraw(false); setError(errorText(cause)); } }
    finally { if (version === requestVersion.current) setBusy(false); }
  }
  function toggleSection(section: ReadinessSection) { setSections(current => current.includes(section) ? current.filter(item => item !== section) : [...current, section]); setStatus(''); }
  async function exportPassport() {
    if (!source.readiness || busy) return;
    const version = requestVersion.current;
    setBusy(true); setError('');
    try {
      const value = ownerResult(await source.readiness('get'));
      if (version !== requestVersion.current) return;
      const url = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), passport: value }, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'nisfayn-readiness-passport.json'; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('تم تجهيز نسخة جوازك. احتفظ بالملف في مكان خاص.');
    } catch (cause) { if (version === requestVersion.current) setError(errorText(cause)); }
    finally { if (version === requestVersion.current) setBusy(false); }
  }
  const ready = preparationItems.filter(item => preparation[item.id] === 'ready').length;
  const activeGrants = passport?.grants.filter(item => Date.parse(item.expiresAt) > Date.now() && connections.some(connection => connection.id === item.connectionId)) ?? [];
  return <PassportFrame onBack={onBack}>
    <PassportCover count={ready} updatedAt={passport?.updatedAt} />
    {source.readinessTestMode && <p className="rp-test-note">وضع التجربة · هذا جواز تجريبي، ولا يمثّل تحققًا من هوية حقيقية أو بيانات موثّقة.</p>}
    <div className="rp-intro"><LockKeyhole size={16} /><p>اختياري، ولا يظهر في الاستكشاف. الإفادات تعبّر عنك وليست تقييمًا لأهليتك للزواج.</p></div>
    {error && <div role="alert" className="rp-feedback rp-error"><p>{error}</p>{!passport && <button type="button" className="btn-secondary" onClick={() => setRetry(value => value + 1)}>إعادة المحاولة</button>}</div>}
    {status && <p role="status" className="rp-feedback rp-success"><Check size={16} /> {status}</p>}
    {!passport && !error && <p role="status" className="rp-loading">جارٍ فتح جوازك الخاص…</p>}
    {passport && <>
      <form className="rp-form" onSubmit={event => { event.preventDefault(); void mutate('save', { consentVersion: readinessConsentVersion, timeline, family, preparation }, 'حُفظ جوازك الخاص. لا تتم مشاركته إلا بإذنك.'); }}>
        <fieldset disabled={busy} className="rp-section rp-fieldset">
          <legend className="rp-section-heading"><span className="rp-section-icon"><CalendarDays size={20} /></span><span><strong>النية والتوقيت</strong><small>إفادتك الشخصية · قابلة للتحديث</small></span></legend>
          <label className="rp-field" htmlFor="rp-timeline"><span>متى تتطلع إلى إتمام الزواج؟</span><select id="rp-timeline" value={timeline} onChange={event => { setTimeline(event.target.value); setStatus(''); }} required><option value="" disabled>اختر إطارًا زمنيًا يناسبك</option>{timelineOptions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label className="rp-field" htmlFor="rp-family"><span>الاستعداد لإشراك الأسرة</span><select id="rp-family" value={family} onChange={event => { setFamily(event.target.value); setStatus(''); }} required><option value="" disabled>اختر ما يصف وضعك الآن</option>{familyOptions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <p className="rp-caption">هذا تصورك الحالي، وليس موعدًا ملزمًا للطرف الآخر. الاتفاق بينكما يتم في مسار التعارف.</p>
        </fieldset>
        <fieldset disabled={busy} className="rp-section rp-fieldset">
          <legend className="rp-section-heading"><span className="rp-section-icon"><BookOpenCheck size={20} /></span><span><strong>الاستعداد العملي</strong><small>خطوات واضحة، دون درجات أو مقارنات</small></span></legend>
          <div className="rp-preparation">{preparationItems.map((item, index) => <label className="rp-preparation-row" key={item.id} htmlFor={`rp-${item.id}`}><span className="rp-step-number" aria-hidden="true">{preparation[item.id] === 'ready' ? <Check size={13} /> : number.format(index + 1)}</span><span className="rp-step-copy"><strong>{item.label}</strong><small>{item.description}</small></span><select id={`rp-${item.id}`} value={preparation[item.id]} onChange={event => { setPreparation(current => ({ ...current, [item.id]: event.target.value })); setStatus(''); }}>{preparationStatusOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>)}</div>
          <p className="rp-caption">اختيار «لدي تصور واضح» إفادة منك، بما فيها التأهيل. لا يُعد إثباتًا مستقلًا لإكمال دورة.</p>
        </fieldset>
        {!passport.consentedAt ? <label className="rp-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={busy} required /><span>أوافق على حفظ ومعالجة هذه البيانات الاختيارية لدى وُدَين لإنشاء جوازي الخاص. أختار المشاركة بشكل منفصل، ويمكنني سحب الموافقة وحذف الجواز هنا.</span></label> : <p className="rp-caption rp-consent-saved"><LockKeyhole size={13} /> موافقتك مسجّلة منذ {date(passport.consentedAt)}. يمكنك سحبها أدناه.</p>}
        <button className="btn-primary rp-save" type="submit" disabled={busy || !consent || !timeline || !family || (!changed && Boolean(passport.consentedAt))}>{busy ? 'جارٍ الحفظ…' : passport.consentedAt ? 'حفظ التغييرات' : 'إنشاء جوازي الخاص'}<Check size={17} /></button>
      </form>
      <VerificationSection claims={passport.claims} />
      <section className="rp-section rp-sharing" aria-labelledby="rp-sharing-title"><div className="rp-section-heading"><span className="rp-section-icon"><Share2 size={19} /></span><div><h2 id="rp-sharing-title">شارك بقدر ما ترتاح</h2><p>مع تعارف مقبول، لمدة تختارها</p></div></div>
        {!passport.consentedAt ? <p className="rp-caption">احفظ جوازك أولًا. لا تتم مشاركة أي قسم تلقائيًا.</p> : <>
          {connections.length ? <form onSubmit={event => { event.preventDefault(); void mutate('share', { connectionId, sections, days }, 'تمت مشاركة الأقسام التي اخترتها فقط.'); }}>
            <fieldset disabled={busy || changed} className="rp-share-fields">
              <label className="rp-field" htmlFor="rp-share-person"><span>مع من تريد المشاركة؟</span><select id="rp-share-person" value={connectionId} required onChange={event => { setConnectionId(event.target.value); setSections([]); setStatus(''); }}><option value="" disabled>اختر من تعارفاتك المقبولة</option>{connections.map(item => <option key={item.id} value={item.id}>{item.person.alias}</option>)}</select></label>
              <div className="rp-share-options" role="group" aria-label="الأقسام التي ستشاركها">{readinessSections.map(item => <label key={item.id}><input type="checkbox" checked={sections.includes(item.id)} onChange={() => toggleSection(item.id)} /><span>{item.label}<small>{item.id === 'verification' ? 'المصدر والنطاق والتواريخ والحالة فقط' : 'إفاداتك الشخصية المحفوظة'}</small></span><LockKeyhole size={14} /></label>)}</div>
              <label className="rp-field rp-duration" htmlFor="rp-share-days"><span>مدة المشاركة</span><select id="rp-share-days" value={days} onChange={event => setDays(Number(event.target.value))}><option value={7}>٧ أيام</option><option value={30}>٣٠ يومًا</option></select></label>
              <p className="rp-caption">يرى الطرف الآخر آخر نسخة محفوظة من الأقسام المختارة. تُغلق المشاركة عند انتهاء المدة أو إنهاء التعارف أو الحظر، ويمكنك إيقافها قبل ذلك.</p>
              <button type="submit" className="btn-secondary rp-share-button" disabled={!connectionId || !sections.length}><Share2 size={16} /> مشاركة {sections.length ? number.format(sections.length) : ''} من الأقسام</button>
            </fieldset>
            {changed && <p className="rp-caption rp-pending-note">احفظ تغييراتك قبل مشاركة الجواز.</p>}
          </form> : <div className="rp-empty-matches"><UsersRound size={22} /><p>{matchesLoaded.current ? 'تفتح المشاركة عندما يكون لديك تعارف مقبول.' : 'تعذّر تحميل تعارفاتك. أعد فتح الجواز للمحاولة.'}</p></div>}
          {activeGrants.length > 0 && <div className="rp-grants"><h3>المشاركات الحالية</h3>{activeGrants.map(grant => <article key={grant.connectionId}><div><strong>{connections.find(item => item.id === grant.connectionId)?.person.alias ?? 'تعارف مقبول'}</strong><small>{grant.sections.map(section => label(readinessSections, section)).join(' · ')}</small><span><Clock3 size={12} /> حتى {date(grant.expiresAt)}</span></div><button type="button" disabled={busy} onClick={() => void mutate('revoke', { connectionId: grant.connectionId }, 'توقفت مشاركة جوازك مع هذا الشخص.')}>إيقاف</button></article>)}</div>}
        </>}
        <p className="rp-caption rp-sharing-note"><CircleHelp size={14} /> إيقاف المشاركة يمنع الوصول لاحقًا؛ لا يمحو ما رآه الطرف الآخر أو احتفظ به بلقطة شاشة.</p>
      </section>
      <details className="rp-explainer"><summary>ما الذي يخبرني به الجواز؟ <ChevronDown size={16} /></summary><p>يساعدك على بدء حديث واضح حول التوقيت والمسؤوليات. إجابات الاستعداد إفادات شخصية، وليست كشفًا ماليًا أو حكمًا على شخصيتك. أما التحقق المستقل فيخص بيانًا محددًا وتظهر معه الجهة والتاريخ.</p><p>لا يؤثر عدم إنشاء الجواز أو عدم مشاركته على حقك في التعارف، ولا يحل محل التعارف وسؤال الشخص مباشرة.</p></details>
      {passport.consentedAt && <button className="rp-export" type="button" disabled={busy} onClick={() => void exportPassport()}><Download size={15} /> تنزيل نسخة من جوازي</button>}
      {passport.consentedAt && <button className="rp-withdraw" type="button" disabled={busy} onClick={() => setWithdraw(true)}><Trash2 size={15} /> حذف الجواز وسحب الموافقة</button>}
      {withdraw && <WithdrawDialog busy={busy} onCancel={() => setWithdraw(false)} onConfirm={() => void mutate('withdraw', {}, 'حُذف الجواز وتوقفت جميع مشاركاته.')} />}
    </>}
  </PassportFrame>;
}

export function SharedPassportDetails({ view }: { view: SharedReadinessPassport }) {
  if (!view.available) return <section className="rp-section rp-unavailable"><LockKeyhole size={28} /><h2>لم تتم مشاركة الجواز معك حاليًا</h2><p>قد تكون المشاركة لم تبدأ، أو انتهت مدتها، أو أوقفها صاحب الجواز. المشاركة اختيارية دائمًا.</p></section>;
  return <>
    <div className="rp-intro"><Clock3 size={16} /><p>المشاركة متاحة حتى {date(view.sharedUntil)}. تظهر فقط الأقسام التي اختار صاحب الجواز مشاركتها معك.</p></div>
    {view.sections.includes('timeline') && <section className="rp-section"><div className="rp-section-heading"><span className="rp-section-icon"><CalendarDays size={20} /></span><div><h2>النية والتوقيت</h2><p>إفادة شخصية · ليست موعدًا ملزمًا</p></div></div><dl className="rp-summary"><div><dt>الإطار الزمني للزواج</dt><dd>{label(timelineOptions, view.timeline)}</dd></div><div><dt>إشراك الأسرة</dt><dd>{label(familyOptions, view.family)}</dd></div></dl></section>}
    {view.sections.includes('preparation') && <section className="rp-section"><div className="rp-section-heading"><span className="rp-section-icon"><BookOpenCheck size={20} /></span><div><h2>الاستعداد العملي</h2><p>إفادات شخصية، وليست إثباتات مستقلة</p></div></div><dl className="rp-summary">{preparationItems.map(item => <div key={item.id}><dt>{item.label}</dt><dd>{label(preparationStatusOptions, view.preparation?.[item.id])}</dd></div>)}</dl><p className="rp-caption">ابدأ بسؤال بسيط: ما الخطوة التي ترغب أن نستعد لها معًا؟</p></section>}
    {view.sections.includes('verification') && <VerificationSection shared claims={view.claims ?? []} />}
    <p className="rp-caption rp-respect"><LockKeyhole size={14} /> احترم خصوصية ما شاركه الطرف الآخر، ولا تنشره دون إذنه.</p>
  </>;
}

export function SharedReadinessPassportPanel({ source, connectionId, onBack, name }: { source: CommunitySource; connectionId: string; onBack: () => void; name?: string }) {
  const [view, setView] = useState<SharedReadinessPassport | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!view?.available || !view.sharedUntil) return;
    const remaining = Date.parse(view.sharedUntil) - Date.now();
    const timer = window.setTimeout(() => setView({ available: false, sections: [] }), Math.min(Math.max(0, remaining), 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [view]);
  useLayoutEffect(() => {
    let active = true, generation = 0, pending = false;
    setView(null); setError('');
    async function refresh() {
      if (!active || document.visibilityState === 'hidden' || pending) return;
      const ticket = generation; pending = true;
      try {
        if (!source.readiness) throw Error('الجواز غير متاح في هذه الجلسة.');
        const result = await source.readiness('view', { connectionId });
        if (!result || !('available' in result) || typeof result.available !== 'boolean' || !Array.isArray(result.sections)) throw Error('تعذّر قراءة إذن المشاركة. أعد المحاولة.');
        const value = result as SharedReadinessPassport;
        if (active && ticket === generation && !document.hidden) { setView(value); setError(''); }
      } catch (cause) { if (active && ticket === generation) { setView(null); setError(errorText(cause)); } }
      finally { if (ticket === generation) pending = false; }
    }
    function visibility() { generation += 1; setView(null); if (document.visibilityState !== 'hidden') { pending = false; void refresh(); } }
    void refresh(); const timer = window.setInterval(() => void refresh(), 15_000);
    document.addEventListener('visibilitychange', visibility);
    return () => { active = false; generation += 1; window.clearInterval(timer); document.removeEventListener('visibilitychange', visibility); };
  }, [source, connectionId, retry]);
  return <PassportFrame shared onBack={onBack}>
    <PassportCover shared name={name} updatedAt={view?.updatedAt} />
    {source.readinessTestMode && <p className="rp-test-note">عرض تجريبي · لا يمثّل تحققًا من هوية حقيقية.</p>}
    {error ? <div role="alert" className="rp-feedback rp-error"><p>{error}</p><button className="btn-secondary" type="button" onClick={() => setRetry(value => value + 1)}>إعادة المحاولة</button></div> : !view ? <p className="rp-loading" role="status">جارٍ التحقق من إذن المشاركة…</p> : <SharedPassportDetails view={view} />}
  </PassportFrame>;
}
