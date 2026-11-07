import { useEffect, useRef, useState } from 'react';
import { ArrowDownLeft, Check, CheckCircle2, ChevronLeft, Clock3, HeartHandshake, LockKeyhole, Search, ShieldCheck, X } from 'lucide-react';
import { friendly } from './client';
import type { AdminApi, FamilyReviewAction, FamilyReviewPage, FamilyReviewRow, FamilyReviewStatus, StaffRole } from './types';

const labels: Record<FamilyReviewStatus, string> = { pending: 'بانتظار المراجعة', approved: 'معتمدة إداريًا', rejected: 'غير معتمدة' };
const actions: Record<FamilyReviewAction, string> = { approve: 'اعتماد الربط', reject: 'رفض الطلب', revoke: 'سحب الاعتماد' };
const date = (value: string | null) => value ? new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';

export function familyReviewActions(role: StaffRole, status: FamilyReviewStatus): FamilyReviewAction[] {
  if (role !== 'owner' && role !== 'reviewer') return [];
  return status === 'approved' ? ['revoke'] : status === 'pending' ? ['approve', 'reject'] : ['approve'];
}

export function FamilyLinkSummary({ row }: { row: FamilyReviewRow }) {
  return <><div className="af-link-identity"><span className="af-avatar"><HeartHandshake size={24}/></span><div><h3>{row.guardianName}</h3><p>{row.relationship} · ربط بحساب {row.memberName}</p></div></div>
    <div className="af-consent-grid"><div><span>موافقة العضو</span><strong>{row.memberStatus === 'active' ? <><CheckCircle2 size={17}/> وافق العضو</> : <><Clock3 size={17}/> بانتظار العضو</>}</strong><small>{row.memberStatus === 'active' ? date(row.memberApprovedAt) : 'لا يكتمل الربط دون قبوله.'}</small></div><div><span>المراجعة الإدارية</span><strong>{row.adminReview === 'approved' ? <ShieldCheck size={17}/> : <Clock3 size={17}/>} {labels[row.adminReview]}</strong><small>{row.reviewedAt ? date(row.reviewedAt) : 'قرار مستقل عن موافقة العضو.'}</small></div></div>
    <p className="quiet-box af-scope"><LockKeyhole size={16}/> الاعتماد يتيح الربط فقط. دخول أي غرفة يتطلب موافقات طرفي التعارف والمشاركين. لا تُتاح هنا المحادثات أو الصور الخاصة أو رموز الربط.</p>
  </>;
}

function FamilyReviewSheet({ row, role, api, close, completed, onError, reload }: { row: FamilyReviewRow; role: StaffRole; api: AdminApi; close: () => void; completed: () => void; onError: (error: unknown) => void; reload: () => void }) {
  const choices = familyReviewActions(role, row.adminReview);
  const [action, setAction] = useState<FamilyReviewAction>(choices[0] ?? 'approve');
  const [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null), active = useRef(true);
  const intent = useRef<{ fingerprint: string; id: string } | null>(null);
  useEffect(() => {
    active.current = true;
    const element = dialog.current!, previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal(); heading.current?.focus({ preventScroll: true });
    return () => { active.current = false; element.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  async function submit() {
    if (busy || !confirmed || reason.trim().length < 3 || !choices.includes(action)) return;
    const fingerprint = JSON.stringify([row.id, action, row.revision, reason.trim()]);
    if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, id: crypto.randomUUID() };
    setBusy(true); setError('');
    try { await api.familyReview(row.id, action, row.revision, reason.trim(), intent.current.id); if (active.current) completed(); }
    catch (problem) { if (active.current) { setError(friendly(problem)); onError(problem); } }
    finally { if (active.current) setBusy(false); }
  }
  return <dialog className="detail-sheet" ref={dialog} dir="rtl" aria-labelledby="family-review-title" onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
    <header className="sheet-head"><div><span className="eyebrow">جسر الأهل · مراجعة الربط</span><h2 id="family-review-title" tabIndex={-1} ref={heading}>قرار بحدود واضحة</h2></div><button className="icon-button" aria-label="إغلاق المراجعة" disabled={busy} onClick={close}><X size={20}/></button></header>
    <div className="sheet-body"><FamilyLinkSummary row={row}/><dl className="member-facts"><div><dt>تاريخ الطلب</dt><dd>{date(row.submittedAt)}</dd></div><div><dt>آخر مراجع</dt><dd>{row.reviewedByName ?? 'لم يُراجع بعد'}</dd></div></dl>
      {row.reason && <section className="af-last-review"><h3>سبب القرار السابق</h3><p>{row.reason}</p></section>}
      <p className="muted small">الاسم وصلة القرابة إفادات شخصية. هذا القرار لا يوثّق الهوية أو الولاية القانونية.</p>
      {!!choices.length && <section className="review-section"><h3>قرار المراجعة</h3><div className="choice-row">{choices.map(choice => <button className={choice === action ? 'choice selected' : 'choice'} key={choice} disabled={busy} onClick={() => { setAction(choice); setConfirmed(false); }}>{actions[choice]}</button>)}</div>
        <p className="af-decision-note">{action === 'approve' ? row.memberStatus === 'active' ? 'يُعتمد الربط إداريًا بعد موافقة العضو المسجّلة. لا تُفتح غرفة أو تُضاف أطراف تلقائيًا.' : 'يبقى الربط بانتظار العضو بعد اعتمادك. لا تعوّض موافقتك موافقته.' : action === 'revoke' ? 'يُوقف الربط وتُغلق غرف العائلة التي تعتمد عليه. إعادة الاعتماد لاحقًا لا تعيد فتح الغرف المغلقة.' : 'لن يُفعّل هذا الربط. يبقى القرار وسببه في سجل الإجراءات.'}</p>
        <label>سبب القرار<textarea value={reason} onChange={event => setReason(event.target.value)} rows={3} minLength={3} maxLength={500} disabled={busy} placeholder="اكتب سببًا واضحًا دون بيانات أو محادثات خاصة…"/></label>
        <label className="check-label"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)}/><span>راجعت الطلب وأفهم أثر هذا القرار وحدود صلاحيات الربط.</span></label>
        {error && <><p className="notice error" role="alert">{error}</p><button className="text-button" disabled={busy} onClick={reload}>تحديث الطلب قبل المراجعة</button></>}
        <button className={action === 'approve' ? 'primary' : 'primary danger'} onClick={() => void submit()} disabled={busy || !confirmed || reason.trim().length < 3}>{busy ? 'جارٍ حفظ القرار…' : 'تأكيد ' + actions[action]}<Check size={17}/></button>
      </section>}
    </div>
  </dialog>;
}

export function FamilyBridgeAdmin({ api, role, refresh, onError }: { api: AdminApi; role: StaffRole; refresh: number; onError: (error: unknown) => void }) {
  const [filter, setFilter] = useState<FamilyReviewStatus | 'all'>('pending'), [query, setQuery] = useState(''), [search, setSearch] = useState('');
  const [data, setData] = useState<FamilyReviewPage | null>(null), [loading, setLoading] = useState(false), [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<FamilyReviewRow | null>(null), [error, setError] = useState(''), [toast, setToast] = useState(''), [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const allowed = role === 'owner' || role === 'reviewer';
  useEffect(() => {
    const ticket = ++generation.current; setData(null); setSelected(null); setError(''); setLoadingMore(false);
    if (!allowed) { setLoading(false); return; }
    setLoading(true);
    void api.family(filter, search).then(value => { if (ticket === generation.current) setData(value); }, problem => { if (ticket === generation.current) { setError(friendly(problem)); onError(problem); } }).finally(() => { if (ticket === generation.current) setLoading(false); });
    return () => { generation.current++; };
  }, [api, allowed, filter, search, refresh, attempt, onError]);
  async function more() {
    if (!data?.nextCursor || loadingMore || loading) return;
    const ticket = generation.current; setLoadingMore(true); setError('');
    try {
      const value = await api.family(filter, search, data.nextCursor);
      if (ticket !== generation.current) return;
      setData(previous => previous ? { ...value, items: [...previous.items, ...value.items.filter(row => !previous.items.some(item => item.id === row.id))] } : value);
    } catch (problem) { if (ticket === generation.current) { setError(friendly(problem)); onError(problem); } }
    finally { if (ticket === generation.current) setLoadingMore(false); }
  }
  if (!allowed) return <p className="notice" role="status">مراجعة جسر الأهل متاحة للمالك ومراجع العضوية.</p>;
  return <div className="af-workspace">
    <section className="af-intro"><span className="af-emblem"><HeartHandshake size={28}/></span><div><h2>قرب العائلة يبدأ بموافقتين.</h2><p>موافقة صاحب الحساب واعتماد مستقل من الفريق. راجع الروابط دون الاطلاع على محادثات الأطراف.</p></div></section>
    {data && <div className="af-stats">{(['pending', 'approved', 'rejected'] as const).map(status => <button key={status} onClick={() => { setFilter(status); setToast(''); }} aria-pressed={filter === status}><span>{labels[status]}</span><strong>{new Intl.NumberFormat('ar-SA').format(data.counts[status])}</strong></button>)}</div>}
    <section className="panel queue-panel af-queue"><div className="panel-heading queue-heading"><div><h2>طلبات ربط الأهل</h2><p>حالة العضو والقرار الإداري، كلٌّ على حدة.</p></div><div className="filters" role="group" aria-label="حالة المراجعة الإدارية">{(['pending', 'approved', 'rejected', 'all'] as const).map(status => <button aria-pressed={filter === status} onClick={() => { setFilter(status); setToast(''); }} key={status}>{status === 'all' ? 'الكل' : status === 'pending' ? 'للمراجعة' : status === 'approved' ? 'معتمدة' : 'غير معتمدة'}</button>)}</div></div>
      <form className="af-search" onSubmit={event => { event.preventDefault(); setSearch(query.trim()); setAttempt(value => value + 1); setToast(''); }}><label><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} maxLength={80} placeholder="اسم فرد العائلة أو العضو" aria-label="البحث باسم فرد العائلة أو العضو" type="search"/></label><button className="secondary" type="submit" disabled={loading}>بحث</button>{search && <button className="text-button" type="button" onClick={() => { setQuery(''); setSearch(''); }}>مسح</button>}</form>
      {toast && <p className="notice" role="status">{toast}</p>}{error && <p className="notice error" role="alert">{error} <button className="inline-button" onClick={() => setAttempt(value => value + 1)}>إعادة المحاولة</button></p>}
      {loading ? <div className="list-loading" role="status"><span className="loading-line"/>جارٍ تحميل طلبات الربط…</div> : data?.items.length ? <div className="af-list">{data.items.map(row => <button className="af-row" key={row.id} onClick={() => setSelected(row)} aria-label={'مراجعة ربط ' + row.guardianName + ' مع ' + row.memberName}><span className="af-avatar"><HeartHandshake size={21}/></span><span className="af-person"><strong>{row.guardianName}</strong><span>{row.relationship} · {row.memberName}</span><time dateTime={row.submittedAt}>{date(row.submittedAt)}</time></span><span className="af-row-status"><span className={'badge ' + (row.adminReview === 'approved' ? 'green' : row.adminReview === 'pending' ? 'gold' : 'rose')}>{labels[row.adminReview]}</span><small>{row.memberStatus === 'active' ? <><Check size={13}/> وافق العضو</> : <><Clock3 size={13}/> بانتظار العضو</>}</small></span><ChevronLeft size={17}/></button>)}</div> : !error && <div className="empty"><span><CheckCircle2 size={27}/></span><h3>{search ? 'لا توجد نتائج مطابقة' : 'لا توجد طلبات في هذه القائمة'}</h3><p>{search ? 'جرّب اسمًا آخر أو امسح البحث.' : 'تظهر الطلبات بعد إدخال رمز الربط وإرساله من حساب الأهل.'}</p></div>}
      {data?.nextCursor && <button className="secondary more-button" disabled={loadingMore || loading} onClick={() => void more()}>{loadingMore ? 'جارٍ التحميل…' : 'تحميل المزيد'}<ArrowDownLeft size={16}/></button>}
    </section>
    {selected && <FamilyReviewSheet key={selected.id + selected.revision} row={selected} role={role} api={api} close={() => setSelected(null)} completed={() => { setSelected(null); setToast('حُفظ قرار الربط وسُجّل باسمك وسببه.'); setAttempt(value => value + 1); }} reload={() => { setSelected(null); setAttempt(value => value + 1); }} onError={onError}/>}
  </div>;
}
