import { useEffect, useRef, useState } from 'react';
import { ArrowDownLeft, BadgeCheck, Check, ChevronLeft, Download, FileCheck2, FileText, LockKeyhole, Search, X } from 'lucide-react';
import { friendly } from './client';
import './verification.css';
import type { AdminApi, StaffRole, VerificationAction, VerificationEvidence, VerificationEvidenceAccess, VerificationKind, VerificationPage, VerificationRow, VerificationStatus } from './types';

export const verificationKinds: Record<VerificationKind, string> = { identity: 'الهوية', marital_status: 'الحالة الاجتماعية', education: 'المؤهل الدراسي', employment: 'العمل', preparation_course: 'دورة التأهيل للزواج' };
const statuses: Record<VerificationStatus, string> = { draft: 'مسودة', pending: 'بانتظار المراجعة', changes_requested: 'بانتظار استكمال العضو', approved: 'مُراجع يدويًا', rejected: 'غير معتمد', revoked: 'سُحب الاعتماد', expired: 'انتهت الصلاحية', withdrawn: 'سحبه العضو', stale: 'تغيّر البيان' };
const actions: Record<VerificationAction, string> = { approve: 'اعتماد التحقق', reject: 'رفض الطلب', request_changes: 'طلب استكمال', revoke: 'سحب الاعتماد' };
const date = (value: string | null) => value ? new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : '—';
const claimLabels: Record<string, string> = { displayName: 'الاسم', age: 'العمر', maritalStatus: 'الحالة الاجتماعية', currentWives: 'عدد الزوجات حاليًا', education: 'المؤهل الدراسي', profession: 'المهنة', course: 'اسم الدورة' };
const claimValues: Record<string, string> = { never_married: 'لم يسبق له الزواج', married: 'متزوج / متزوجة', divorced: 'مطلق / مطلقة', widowed: 'أرمل / أرملة', woman: 'امرأة', man: 'رجل' };

export function verificationActions(role: StaffRole, status: VerificationStatus): VerificationAction[] {
  if (role !== 'owner' && role !== 'reviewer') return [];
  return status === 'pending' ? ['approve', 'request_changes', 'reject'] : ['approved', 'expired'].includes(status) ? ['revoke'] : [];
}

export function VerificationSummary({ row }: { row: VerificationRow }) {
  return <><div className="af-link-identity"><span className="af-avatar"><FileCheck2 size={25}/></span><div><h3>{row.memberName}</h3><p>{verificationKinds[row.kind]}</p></div>{(row.isDummy || row.isTest) && <span className="badge dummy">وهمي · Dummy</span>}</div>
    <div className="av-summary-line"><span className={'badge ' + (row.status === 'approved' ? 'green' : row.status === 'pending' || row.status === 'changes_requested' ? 'gold' : 'rose')}>{statuses[row.status]}</span><span>أُرسل {date(row.submittedAt)}</span></div>
    <section className="av-claim"><h3>البيان وقت تقديم الطلب</h3><dl>{Object.entries(row.claimSnapshot).filter(([key, value]) => key in claimLabels && value !== null && value !== '').map(([key, value]) => <div key={key}><dt>{claimLabels[key]}</dt><dd>{claimValues[String(value)] ?? String(value)}</dd></div>)}</dl></section>
    {row.memberNote && <section className="af-last-review"><h3>ملاحظة العضو</h3><p>{row.memberNote}</p></section>}
    <p className="quiet-box af-scope"><LockKeyhole size={16}/>{row.isDummy || row.isTest ? 'هذا حساب وهمي. أي اعتماد هنا يظل تجربة معلّمة، ولا يمثّل تحققًا حقيقيًا من شخص.' : 'الشارة تخص هذا البيان والمستندات المقدمة فقط. تُعرض كمراجعة يدوية من وُدَين، ولا تعني توثيقًا حكوميًا أو ضمانًا لصحة كل بيانات الحساب.'}</p>
  </>;
}

function EvidenceFile({ evidence, requestId, api, onError }: { evidence: VerificationEvidence; requestId: string; api: AdminApi; onError: (error: unknown) => void }) {
  const [access, setAccess] = useState<VerificationEvidenceAccess | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!access) return;
    const timeout = window.setTimeout(() => setAccess(null), Math.max(0, Date.parse(access.expiresAt) - Date.now()));
    return () => { window.clearTimeout(timeout); URL.revokeObjectURL(access.url); };
  }, [access]);
  async function open() {
    if (busy) return; setBusy(true); setError('');
    try { const blob = await api.verificationEvidence(requestId, evidence.id); if (mounted.current) setAccess({ url: URL.createObjectURL(blob), expiresAt: new Date(Date.now() + 120_000).toISOString() }); }
    catch (problem) { if (mounted.current) { setError(friendly(problem)); onError(problem); } }
    finally { if (mounted.current) setBusy(false); }
  }
  return <div className="av-evidence"><div className="av-file"><FileText size={20}/><span><strong>{evidence.fileName}</strong><small>{evidence.mimeType === 'application/pdf' ? 'PDF' : 'صورة'} · {new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 1 }).format(evidence.sizeBytes / 1024)} ك.ب</small></span>{evidence.available && <button className="secondary" disabled={busy} onClick={() => void open()}>{busy ? 'جارٍ الفتح…' : access ? 'تجديد العرض' : 'عرض المستند'}</button>}</div>
    {!evidence.available && <p className="muted small">حُذف المستند وفق مدة الاحتفاظ. يبقى قرار المراجعة في السجل.</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
    {access && <div className="av-preview">{evidence.mimeType === 'application/pdf' ? <iframe src={access.url} title={'معاينة ' + evidence.fileName} sandbox="" referrerPolicy="no-referrer"/> : <img src={access.url} alt={'المستند المقدم: ' + evidence.fileName} referrerPolicy="no-referrer"/>}<a className="text-button" href={access.url} download={evidence.fileName} referrerPolicy="no-referrer"><Download size={16}/>تنزيل المستند</a><small>عرض محلي مؤقت لمدة دقيقتين. يُعاد التحقق من صلاحياتك عند فتحه مجددًا.{evidence.mimeType === 'application/pdf' ? ' إذا منع المتصفح المعاينة، يمكنك تنزيل المستند.' : ''}</small></div>}
  </div>;
}

function VerificationSheet({ row, role, api, close, completed, reload, onError }: { row: VerificationRow; role: StaffRole; api: AdminApi; close: () => void; completed: () => void; reload: () => void; onError: (error: unknown) => void }) {
  const choices = verificationActions(role, row.status);
  const [action, setAction] = useState<VerificationAction>(choices[0] ?? 'approve'), [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false), [days, setDays] = useState(90), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null), active = useRef(true), intent = useRef<{ fingerprint: string; id: string } | null>(null);
  useEffect(() => {
    active.current = true; const element = dialog.current!, previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal(); heading.current?.focus({ preventScroll: true });
    return () => { active.current = false; element.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  async function submit() {
    if (busy || !confirmed || reason.trim().length < 3 || !choices.includes(action)) return;
    const expiresInDays = action === 'approve' ? days : null;
    const fingerprint = JSON.stringify([row.id, action, row.revision, reason.trim(), expiresInDays, confirmed]);
    if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, id: crypto.randomUUID() };
    setBusy(true); setError('');
    try { await api.verificationReview(row.id, action, row.revision, reason.trim(), intent.current.id, expiresInDays, confirmed); if (active.current) completed(); }
    catch (problem) { if (active.current) { setError(friendly(problem)); onError(problem); } }
    finally { if (active.current) setBusy(false); }
  }
  return <dialog className="detail-sheet av-sheet" ref={dialog} dir="rtl" aria-labelledby="verification-review-title" onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
    <header className="sheet-head"><div><span className="eyebrow">وُدَين · مراجعة مستندات خاصة</span><h2 id="verification-review-title" ref={heading} tabIndex={-1}>تحقق واضح، بحدود واضحة</h2></div><button className="icon-button" aria-label="إغلاق طلب التحقق" disabled={busy} onClick={close}><X size={20}/></button></header>
    <div className="sheet-body"><VerificationSummary row={row}/><section className="av-evidence-section"><h3>المستندات المقدمة</h3><p>تُتاح للمراجعين المخوّلين فقط، ولا تظهر في الملف العام.</p>{row.evidence.map(evidence => <EvidenceFile key={evidence.id} evidence={evidence} requestId={row.id} api={api} onError={onError}/>)}{!row.evidence.length && <p className="muted small">لا توجد مستندات متاحة لهذا الطلب.</p>}</section>
      {row.reviewedAt && <dl className="member-facts"><div><dt>آخر مراجع</dt><dd>{row.reviewedByName ?? 'فريق وُدَين'}</dd></div><div><dt>تاريخ القرار</dt><dd>{date(row.reviewedAt)}</dd></div><div><dt>صالح حتى</dt><dd>{date(row.expiresAt)}</dd></div></dl>}
      {row.reason && <section className="af-last-review"><h3>سبب القرار السابق</h3><p>{row.reason}</p></section>}
      {!!choices.length && <section className="review-section"><h3>قرار المراجعة</h3><div className="choice-row">{choices.map(choice => <button className={'choice' + (choice === action ? ' selected' : '')} key={choice} disabled={busy} onClick={() => { setAction(choice); setConfirmed(false); }}>{actions[choice]}</button>)}</div>
        <p className="af-decision-note">{action === 'approve' ? 'راجع تطابق المستند مع البيان وصاحب الحساب قبل الاعتماد. تنتهي الشارة في الموعد المحدد، وتُلغى صلاحيتها إذا تغيّر البيان.' : action === 'request_changes' ? 'سيظهر السبب للعضو ليعرف ما يلزم استكماله. لا تُمنح شارة قبل تقديم الطلب ومراجعته مجددًا.' : action === 'revoke' ? 'تُزال الشارة من الظهور فور سحب الاعتماد، ويُحفظ القرار وسببه.' : 'لن تُمنح شارة لهذا الطلب. اكتب سببًا واضحًا يساعد العضو على فهم القرار.'}</p>
        {action === 'approve' && <label>صلاحية المراجعة<select value={days} onChange={event => setDays(Number(event.target.value))} disabled={busy}>{(row.kind === 'marital_status' ? [30, 90] : [30, 90, 180, 365]).map(value => <option key={value} value={value}>{new Intl.NumberFormat('ar-SA').format(value)} يومًا</option>)}</select></label>}
        <label>سبب القرار · ظاهر لصاحب الطلب<textarea value={reason} onChange={event => setReason(event.target.value)} rows={3} maxLength={500} minLength={3} disabled={busy} placeholder="اذكر النتيجة أو المطلوب استكماله دون نسخ أرقام الهوية أو بيانات المستند…"/></label>
        <label className="check-label"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy}/><span>{action === 'approve' ? 'اطلعت على المستندات وطابقتها مع البيان وصاحب الحساب، وأؤكد حدود هذه المراجعة اليدوية.' : 'راجعت الطلب وسبب القرار، وأؤكد تنفيذ هذا الإجراء.'}</span></label>
        {error && <><p className="notice error" role="alert">{error}</p><button className="text-button" disabled={busy} onClick={reload}>تحديث الطلب قبل المراجعة</button></>}
        <button className={'primary' + (action === 'reject' || action === 'revoke' ? ' danger' : '')} disabled={busy || !confirmed || reason.trim().length < 3} onClick={() => void submit()}>{busy ? 'جارٍ حفظ القرار…' : 'تأكيد ' + actions[action]}<Check size={17}/></button>
      </section>}
    </div>
  </dialog>;
}

export function VerificationAdmin({ api, role, refresh, onError }: { api: AdminApi; role: StaffRole; refresh: number; onError: (error: unknown) => void }) {
  const [filter, setFilter] = useState<VerificationStatus | 'all'>('pending'), [query, setQuery] = useState(''), [search, setSearch] = useState(''), [data, setData] = useState<VerificationPage | null>(null);
  const [loading, setLoading] = useState(false), [loadingMore, setLoadingMore] = useState(false), [selected, setSelected] = useState<VerificationRow | null>(null), [error, setError] = useState(''), [toast, setToast] = useState(''), [attempt, setAttempt] = useState(0);
  const generation = useRef(0), allowed = role === 'owner' || role === 'reviewer';
  useEffect(() => {
    const ticket = ++generation.current; setData(null); setSelected(null); setError(''); setLoadingMore(false);
    if (!allowed) { setLoading(false); return; } setLoading(true);
    void api.verifications(filter, search).then(value => { if (ticket === generation.current) setData(value); }, problem => { if (ticket === generation.current) { setError(friendly(problem)); onError(problem); } }).finally(() => { if (ticket === generation.current) setLoading(false); });
    return () => { generation.current++; };
  }, [api, allowed, filter, search, refresh, attempt, onError]);
  async function more() {
    if (!data?.nextCursor || loadingMore || loading) return;
    const ticket = generation.current; setLoadingMore(true); setError('');
    try { const value = await api.verifications(filter, search, data.nextCursor); if (ticket === generation.current) setData(previous => previous ? { ...value, items: [...previous.items, ...value.items.filter(row => !previous.items.some(item => item.id === row.id))] } : value); }
    catch (problem) { if (ticket === generation.current) { setError(friendly(problem)); onError(problem); } }
    finally { if (ticket === generation.current) setLoadingMore(false); }
  }
  if (!allowed) return <p className="notice" role="status">مراجعة التحقق متاحة للمالك ومراجع العضوية فقط.</p>;
  return <div className="af-workspace av-workspace"><section className="af-intro"><span className="af-emblem"><BadgeCheck size={29}/></span><div><h2>ثقة تُبنى على مراجعة واضحة.</h2><p>كل طلب يخص بيانًا محددًا. راجع المستند، وثّق القرار، وحدد مدة ظهور الشارة.</p></div></section>
    {data && <div className="af-stats">{(['pending', 'changes_requested', 'approved'] as const).map(status => <button key={status} aria-pressed={filter === status} onClick={() => { setFilter(status); setToast(''); }}><span>{statuses[status]}</span><strong>{new Intl.NumberFormat('ar-SA').format(data.counts[status] ?? 0)}</strong></button>)}</div>}
    <section className="panel queue-panel af-queue"><div className="panel-heading queue-heading"><div><h2>طلبات التحقق</h2><p>الهوية، الحالة الاجتماعية، المؤهل، العمل ودورات التأهيل.</p></div><label className="av-filter-label">حالة الطلب<select value={filter} onChange={event => { setFilter(event.target.value as VerificationStatus | 'all'); setToast(''); }}><option value="all">كل الطلبات</option>{Object.entries(statuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
      <form className="af-search" onSubmit={event => { event.preventDefault(); setSearch(query.trim()); setAttempt(value => value + 1); setToast(''); }}><label><Search size={17}/><input type="search" value={query} onChange={event => setQuery(event.target.value)} maxLength={80} placeholder="البحث باسم العضو" aria-label="البحث باسم العضو"/></label><button type="submit" className="secondary" disabled={loading}>بحث</button>{search && <button type="button" className="text-button" onClick={() => { setSearch(''); setQuery(''); }}>مسح</button>}</form>
      {toast && <p className="notice" role="status">{toast}</p>}{error && <p className="notice error" role="alert">{error} <button className="inline-button" onClick={() => setAttempt(value => value + 1)}>إعادة المحاولة</button></p>}
      {loading ? <div className="list-loading" role="status"><span className="loading-line"/>جارٍ تحميل طلبات التحقق…</div> : data?.items.length ? <div className="af-list">{data.items.map(row => <button className="af-row" key={row.id} onClick={() => setSelected(row)} aria-label={'مراجعة ' + verificationKinds[row.kind] + ' لـ' + row.memberName}><span className="af-avatar"><FileCheck2 size={22}/></span><span className="af-person"><strong>{row.memberName}</strong><span>{verificationKinds[row.kind]}</span><time dateTime={row.submittedAt}>{date(row.submittedAt)}</time></span><span className="af-row-status"><span className={'badge ' + (row.status === 'approved' ? 'green' : row.status === 'pending' || row.status === 'changes_requested' ? 'gold' : 'rose')}>{statuses[row.status]}</span>{(row.isDummy || row.isTest) && <span className="badge dummy">وهمي · Dummy</span>}</span><ChevronLeft size={17}/></button>)}</div> : !error && <div className="empty"><span><BadgeCheck size={28}/></span><h3>{search ? 'لا توجد نتائج مطابقة' : 'لا توجد طلبات في هذه القائمة'}</h3><p>{search ? 'جرّب اسمًا آخر أو امسح البحث.' : 'تظهر هنا طلبات التحقق التي يرسلها الأعضاء.'}</p></div>}
      {data?.nextCursor && <button className="secondary more-button" onClick={() => void more()} disabled={loading || loadingMore}>{loadingMore ? 'جارٍ التحميل…' : 'تحميل المزيد'}<ArrowDownLeft size={16}/></button>}
    </section>
    {selected && <VerificationSheet key={selected.id + selected.revision} row={selected} role={role} api={api} close={() => setSelected(null)} completed={() => { setSelected(null); setToast('حُفظ قرار التحقق وسُجّل باسمك وسببه.'); setAttempt(value => value + 1); }} reload={() => { setSelected(null); setAttempt(value => value + 1); }} onError={onError}/>}
  </div>;
}
