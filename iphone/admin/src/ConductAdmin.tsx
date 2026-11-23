import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { call, friendly } from './client';
import { conductDate, conductKinds, policyNames, noticeStatus, type ConductNotice } from '../../src/conduct/model';
import './launch-admin.css';

type Case = ConductNotice & { memberId: string; appealNote: string | null; detector: string | null; reportId: string | null };
const defaultPledge = 'أتعهّد باحترام رغبة الطرف الآخر عند رفض التواصل.';
export function ConductAdmin({ memberId = '', initialKind = 'warning', onIssued }: { memberId?: string; initialKind?: keyof typeof conductKinds; onIssued?:()=>void }) {
  const [tab, setTab] = useState<'review' | 'all' | 'issue'>(memberId ? 'issue' : 'review');
  const [rows, setRows] = useState<Case[]>([]);
  const [more, setMore] = useState(false);
  const [subject, setSubject] = useState(memberId);
  const [kind, setKind] = useState<keyof typeof conductKinds>(initialKind);
  const [policy, setPolicy] = useState<keyof typeof policyNames>('contact');
  const [pledge, setPledge] = useState(defaultPledge);
  const [hours, setHours] = useState(24);
  const [explanation, setExplanation] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [selected, setSelected] = useState<Case | null>(null);
  const [decision, setDecision] = useState<'lifted' | 'upheld'>('lifted');
  const [reviewText, setReviewText] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const intent = useRef<{ key: string; id: string } | null>(null);
  const sequence = useRef(0);
  const load = useCallback(async (before?: string) => {
    if (tab === 'issue') return;
    const ticket = ++sequence.current; setError(''); setBusy(true);
    try {
      const page = await call<Case[]>('marriage_staff_conduct', { command:'list', input:{filter:tab, ...(before ? { before } : {})} });
      if (sequence.current !== ticket) return;
      setRows(old => before ? [...old, ...page] : page); setMore(page.length === 40);
    } catch (e) { if (sequence.current === ticket) setError(friendly(e)); }
    finally { if (sequence.current === ticket) setBusy(false); }
  }, [tab]);
  useEffect(() => {
    setRows([]); setMore(false); setSelected(null); setConfirm(false); setError('');
    void load();
    return () => { sequence.current++; };
  }, [load]);
  async function issue(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!confirm) { setConfirm(true); return; }
    const input = { memberId:subject.trim(), kind, policy, explanation:explanation.trim(),
      ...(kind === 'pledge' ? { pledge:pledge.trim() } : {}),
      ...(kind === 'restriction' ? { hours } : {}),
      urgent:(kind === 'restriction' || kind === 'suspension') && ['safety','identity','privacy'].includes(policy) && urgent };
    const key = JSON.stringify(input);
    if (intent.current?.key !== key) intent.current = { key, id:crypto.randomUUID() };
    setBusy(true); setNotice(''); setError('');
    try {
      await call('marriage_staff_conduct', { command:'issue', input:{...input,requestId:intent.current.id} });
      setNotice('تم تسجيل الإجراء وإتاحة إشعار العضو.'); setExplanation(''); setConfirm(false); setUrgent(false);
      setTab('all'); intent.current = null; onIssued?.();
    } catch (e) { setError(friendly(e)); } finally { setBusy(false); }
  }
  async function review(event: FormEvent) {
    event.preventDefault(); if (!selected || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await call('marriage_staff_conduct', { command:'review', input:{ id:selected.id, revision:selected.revision, decision, explanation:reviewText.trim() } });
      setNotice('حُفظ القرار وأُرسلت النتيجة إلى إشعارات العضو.'); setSelected(null); setReviewText(''); await load();
    } catch (e) { setError(friendly(e)); } finally { setBusy(false); }
  }
  return <section className="panel wd-conduct-desk" dir="rtl">
    <header className="wd-conduct-head"><h2>التنبيهات ومراجعة القرارات</h2>
      <div className="wd-conduct-nav" role="group" aria-label="عرض الحالات">{(['review','all','issue'] as const).map(key => <button key={key} disabled={busy} aria-pressed={tab===key}
        onClick={() => { setTab(key); setNotice(''); }}>{({review:'تحتاج مراجعة',all:'سجل الإجراءات',issue:'إصدار إجراء'})[key]}</button>)}</div></header>
    {error && <p className="notice error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
    {tab === 'issue' ? <form className="wd-conduct-form" onSubmit={issue} onChange={() => setConfirm(false)}>
      <label>معرّف العضو<input required readOnly={Boolean(memberId)} dir="ltr" value={subject} pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" onChange={e => setSubject(e.target.value)} /></label>
      <div className="wd-admin-grid"><label>الإجراء<select value={kind} onChange={e => setKind(e.target.value as typeof kind)}>{Object.entries(conductKinds).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>السبب<select value={policy} onChange={e => { setPolicy(e.target.value as typeof policy); setUrgent(false); }}>{Object.entries(policyNames).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
      <label>التوضيح الذي سيقرأه العضو<textarea required minLength={3} maxLength={500} value={explanation} onChange={e => setExplanation(e.target.value)} /></label>
      {kind === 'pledge' && <label>نص التعهّد<textarea required minLength={3} maxLength={400} value={pledge} onChange={e => setPledge(e.target.value)} /></label>}
      {kind === 'restriction' && <label>مدة إيقاف إرسال الطلبات الجديدة بالساعات<input required type="number" min={1} max={168} value={hours || ''} onChange={e => setHours(Number(e.target.value))} /></label>}
      {(kind === 'restriction' || kind === 'suspension') && (['safety','identity','privacy'].includes(policy)
        ? <label><input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} /> حماية عاجلة تتطلب الإجراء قبل التنبيه</label>
        : <p className="muted">يتطلب هذا الإجراء تنبيهًا سابقًا اطّلع عليه العضو لنفس السبب.</p>)}
      {confirm && <div className="wd-proof" role="status"><header><span>معاينة إشعار العضو</span><span>{policyNames[policy]}</span></header><h3>{conductKinds[kind]}</h3><p dir="auto">{explanation}</p>
        {kind === 'pledge' && <blockquote>{pledge}</blockquote>}{kind === 'restriction' && <p>مدة التقييد: {new Intl.NumberFormat('ar-SA').format(hours)} ساعة</p>}
        {kind === 'suspension' && <p>سيوقف التعارف وتُغلق الطلبات والمحادثات القائمة. يبقى طلب المراجعة متاحًا.</p>}</div>}
      <button className={kind==='suspension'&&confirm?'primary danger':'primary'} disabled={busy}>{confirm?'تأكيد وإرسال الإشعار':'معاينة الإجراء'}</button>
    </form> : <>
      <div className="wd-conduct-toolbar"><p className="wd-quiet" role="status">{busy?'جارٍ تحديث الحالات…':rows.length?null:error?null:tab==='review'?'لا توجد طلبات بانتظار المراجعة.':'لا توجد إجراءات مسجلة.'}</p>
      <button className="text-button" disabled={busy} onClick={() => void load()}>تحديث القائمة</button></div>
      {rows.map(row => <article key={row.id} className="wd-conduct-case">
        <header className="wd-record-title"><h3>{conductKinds[row.kind]}</h3><span className="wd-record-state" data-review={row.needsReview||undefined}>{noticeStatus(row, 'staff')}</span></header>
        <p className="wd-case-meta">{policyNames[row.policy]} · <time dateTime={row.issuedAt}>{conductDate(row.issuedAt)}</time></p>
        <small className="wd-case-id">العضو <bdi>{row.memberId}</bdi></small><p className="wd-case-reason" dir="auto">{row.explanation}</p>
        {row.detector && <p className="wd-case-meta">رصد آلي · <bdi>{row.detector}</bdi> · البلاغ <bdi>{row.reportId}</bdi></p>}
        {row.appealedAt && <blockquote><strong>طلب مراجعة</strong><small>{conductDate(row.appealedAt)}</small>{row.appealNote && <p dir="auto">{row.appealNote}</p>}</blockquote>}
        {row.pledge && <blockquote><strong>نصّ التعهّد</strong><p dir="auto">{row.pledge}</p></blockquote>}{row.outcome && <blockquote><strong>ردّ الفريق</strong><p dir="auto">{row.outcome}</p></blockquote>}
        {row.decision !== 'lifted' && <button className="secondary" disabled={busy} onClick={() => { setSelected(row); setReviewText(''); setDecision('lifted'); }}>مراجعة الحالة</button>}
        {selected?.id===row.id && <form className="wd-conduct-form" onSubmit={review}>
          <label>القرار<select value={decision} onChange={e => setDecision(e.target.value as typeof decision)}><option value="lifted">رفع الإجراء</option><option value="upheld">تأييد الإجراء</option></select></label>
          <label>توضيح النتيجة للعضو<textarea required minLength={3} maxLength={500} value={reviewText} onChange={e => setReviewText(e.target.value)} /></label>
          <button className="primary" disabled={busy}>اعتماد القرار وإبلاغ العضو</button>
        </form>}
      </article>)}
      {more && <button className="secondary" disabled={busy} onClick={() => void load(rows.at(-1)?.id)}>عرض المزيد</button>}
    </>}
  </section>;
}
