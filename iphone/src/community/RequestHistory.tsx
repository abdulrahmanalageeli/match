import { useEffect, useState } from 'react';
import type { CommunitySource, RequestHistoryEntry } from './data';
import { ChevronLeft, Inbox } from '../BrandIcons';
import { ConversationPilotFeedback } from './ConversationPilotFeedback';
import { FamilyContactReveal } from './FamilyContact';

const dates = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric' });
function date(value?: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : dates.format(parsed);
}

export function RequestHistory({ source, title, targetId }: { source: CommunitySource; title?: string; targetId?: string }) {
  const [open, setOpen] = useState(Boolean(targetId));
  const [cursor,setCursor] = useState<string>();
  const [rows, setRows] = useState<RequestHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [incident, setIncident] = useState<{id:string; submission:string} | null>(null);
  const [reason, setReason] = useState('إساءة أو ضغط غير مرغوب');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [reviewId, setReviewId] = useState('');
  async function report() {
    if (!incident || !source.reportIncident || busy) return;
    setBusy(true);
    try {
      await source.reportIncident(incident.id,null,[reason,note.trim()].filter(Boolean).join('\n'),incident.submission);
      setIncident(null); setFeedback('وصل بلاغك إلى فريق المراجعة.');
    } catch { setFeedback('تعذّر إرسال البلاغ. يمكنك إعادة المحاولة.'); }
    finally { setBusy(false); }
  }
  const [retry, setRetry] = useState(0);
  useEffect(()=>{if(targetId)setOpen(true);},[targetId]);
  useEffect(()=>{if(targetId&&rows.some(row=>row.id===targetId))document.getElementById('history-'+targetId)?.focus();},[targetId,rows.length]);
  useEffect(() => {
    if (!open || !source.requestHistory) return;
    let active = true, latest = 0;
    const refresh = async () => {
      const ticket = ++latest;
      try {
        const entry = targetId && source.requestHistoryItem ? await source.requestHistoryItem(targetId) : undefined;
        const entries = targetId && source.requestHistoryItem ? (entry ? [entry] : []) : await source.requestHistory!(cursor);
        if (active && ticket === latest) { setRows(entries); setError(false); }
      } catch { if (active && ticket === latest) { setRows([]); setError(true); } }
      finally { if (active && ticket === latest) setLoading(false); }
    };
    setLoading(true);
    void refresh();
    const unwatch = source.watch(refresh);
    return () => { active = false; unwatch(); };
  }, [source, open, retry, cursor, targetId]);
  if (!source.requestHistory) return null;
  return <details className="cm-request-history" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cm-history-heading"><Inbox size={18} aria-hidden="true"/><span><strong>{title || 'التعارفات السابقة'}</strong><small>الطلبات المغلقة والمنتهية مهلتها</small></span><ChevronLeft size={15} aria-hidden="true"/></summary>
    {loading && <p role="status">جارٍ تحميل السجل…</p>}
    {error ? <><p role="alert">تعذّر تحميل السجل.</p><button className="btn-text" onClick={() => setRetry(n => n + 1)}>إعادة المحاولة</button></> :
      !loading && !rows.length ? <p>{targetId ? 'هذا الطلب لم يعد متاحًا.' : 'عندما ينتهي طلب أو تعارف، يظهر هنا.'}</p> : <ul>{rows.map(row => <li key={row.id}>
        <details className="cm-history-entry" open={row.id===targetId||undefined}><summary id={'history-'+row.id}><span><strong>{row.alias}</strong><small>{row.direction === 'mutual' ? 'تعارف متبادل' : row.direction === 'incoming' ? 'طلب وارد' : 'طلب مرسل'} · {historyStatus(row)}{row.hasFamilyContact?' · رقم الأهل متاح':''}</small></span><ChevronLeft size={14} aria-hidden="true"/></summary>
        <div className="cm-history-actions">
        {row.hasFamilyContact&&<FamilyContactReveal source={source} requestId={row.id}/>}
        {date(row.createdAt) && <small>أُرسل <time dateTime={row.createdAt}>{date(row.createdAt)}</time></small>}
        {date(row.closedAt) && <small>أُغلق <time dateTime={row.closedAt!}>{date(row.closedAt)}</time></small>}
        {typeof row.canRequestAgain==='boolean'&&<small>{row.canRequestAgain?'يمكن إرسال طلب جديد إذا ظهر الملف في استكشف.':'لا يمكن إرسال طلب جديد لهذا التعارف.'}</small>}
        {source.conversationPilot && row.outcome==='closed' && row.closedAt && Date.parse(row.closedAt)>Date.now()-7*86400000 &&
          <>{reviewId===row.id ? <ConversationPilotFeedback key={row.id} requestId={row.id} respond={source.conversationPilot} expanded showUnavailable resumeChat={()=>{}}/> :
            <button type="button" onClick={()=>setReviewId(row.id)}>تقييمي الخاص</button>}</>}
        {source.reportIncident && <button type="button" disabled={busy} onClick={()=>{setIncident({id:row.id,submission:crypto.randomUUID()});setReason('إساءة أو ضغط غير مرغوب');setNote('');setFeedback('');}}>الإبلاغ عن واقعة</button>}
        {incident?.id===row.id && <div className="cm-report-form"><label>سبب البلاغ<select value={reason} onChange={e=>setReason(e.target.value)}>
          {['إساءة أو ضغط غير مرغوب','تهديد فوري للسلامة','انتهاك الخصوصية','احتيال','سبب آخر'].map(value=><option key={value}>{value}</option>)}</select></label>
          <label>تفاصيل اختيارية<textarea value={note} maxLength={440} onChange={e=>setNote(e.target.value)}/></label>
          <button type="button" disabled={busy} onClick={()=>void report()}>إرسال البلاغ وحظر العضو</button>
          <button type="button" disabled={busy} onClick={()=>setIncident(null)}>إلغاء</button></div>}
        </div></details>
      </li>)}</ul>}
    {!targetId && !loading && rows.length===50 && <button onClick={()=>{setRows([]);setIncident(null);setFeedback('');setCursor(rows.at(-1)!.id);}}>طلبات أقدم</button>}
    {cursor && <button onClick={()=>{setRows([]);setIncident(null);setFeedback('');setCursor(undefined);}}>العودة إلى أحدث الطلبات</button>}
    {feedback && <p role="status">{feedback}</p>}
  </details>;
}


function historyStatus(row: RequestHistoryEntry) {
  if (row.closureContext) {
    const status = row.closureContext === 'pact' ? 'أُنهي ميثاق التعارف' : 'أُنهي التعارف';
    return row.hasFamilyContact ? status : status + ' · من دون رقم للأهل';
  }
  switch (row.resolution ?? row.outcome) {
    case 'declined': return row.direction==='incoming' ? 'اعتذرت عن الطلب' : 'اعتذر الطرف الآخر';
    case 'withdrawn': return row.direction==='incoming' ? 'سحب الطرف الآخر الطلب' : 'سحبت الطلب';
    case 'ended': return 'انتهى التعارف';
    case 'expired': return 'انتهت مهلة الطلب';
    default: return 'مغلق';
  }
}
