import { useEffect, useState } from 'react';
import type { CommunitySource, RequestHistoryEntry } from './data';

const dates = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric' });
function date(value?: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : dates.format(parsed);
}

export function RequestHistory({ source, title }: { source: CommunitySource; title?: string }) {
  const [open, setOpen] = useState(false);
  const [cursor,setCursor] = useState<string>();
  const [rows, setRows] = useState<RequestHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [incident, setIncident] = useState<{id:string; submission:string} | null>(null);
  const [reason, setReason] = useState('إساءة أو ضغط غير مرغوب');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
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
  useEffect(() => {
    if (!open || !source.requestHistory) return;
    let active = true;
    const refresh = async () => {
      setLoading(true);
      try {
        const entries = await source.requestHistory!(cursor);
        if (active) { setRows(entries); setError(false); }
      } catch { if (active) { setRows([]); setError(true); } }
      finally { if (active) setLoading(false); }
    };
    void refresh();
    const unwatch = source.watch(refresh);
    return () => { active = false; unwatch(); };
  }, [source, open, retry, cursor]);
  if (!source.requestHistory) return null;
  return <details className="cm-request-history" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{title || (source.demoAcceptOutgoing ? 'سجل الشخصيات التوضيحية المغلقة' : 'الطلبات والتعارفات المغلقة')}</summary>
    <p>يُعرض انتهاء المهلة عندما يؤكده النظام؛ الإغلاق وحده لا يوضح سبب انتهاء التعارف.</p>
    {loading && <p role="status">جارٍ تحميل السجل…</p>}
    {error ? <><p role="alert">تعذّر تحميل السجل.</p><button className="btn-text" onClick={() => setRetry(n => n + 1)}>إعادة المحاولة</button></> :
      !loading && !rows.length ? <p>لا توجد طلبات مغلقة في السجل.</p> : <ul>{rows.map(row => <li key={row.id}>
        <strong>{row.alias} · {row.outcome === 'expired' ? 'انتهت مهلة الطلب' : 'أُغلق'}</strong>
        <span>{row.direction === 'incoming' ? 'طلب وارد' : 'طلب مرسل'}{date(row.createdAt) && <> · أُرسل <time dateTime={row.createdAt}>{date(row.createdAt)}</time></>}</span>
        {date(row.closedAt) && <span>أُغلق <time dateTime={row.closedAt!}>{date(row.closedAt)}</time></span>}
        {source.reportIncident && <button type="button" disabled={busy} onClick={()=>{setIncident({id:row.id,submission:crypto.randomUUID()});setReason('إساءة أو ضغط غير مرغوب');setNote('');setFeedback('');}}>الإبلاغ عن واقعة</button>}
        {incident?.id===row.id && <div className="cm-report-form"><label>سبب البلاغ<select value={reason} onChange={e=>setReason(e.target.value)}>
          {['إساءة أو ضغط غير مرغوب','تهديد فوري للسلامة','انتهاك الخصوصية','احتيال','سبب آخر'].map(value=><option key={value}>{value}</option>)}</select></label>
          <label>تفاصيل اختيارية<textarea value={note} maxLength={440} onChange={e=>setNote(e.target.value)}/></label>
          <button type="button" disabled={busy} onClick={()=>void report()}>إرسال البلاغ وحظر العضو</button>
          <button type="button" disabled={busy} onClick={()=>setIncident(null)}>إلغاء</button></div>}
      </li>)}</ul>}
    {source.reportIncident && !loading && rows.length===50 && <button onClick={()=>{setRows([]);setIncident(null);setFeedback('');setCursor(rows.at(-1)!.id);}}>طلبات أقدم</button>}
    {cursor && <button onClick={()=>{setRows([]);setIncident(null);setFeedback('');setCursor(undefined);}}>العودة إلى أحدث الطلبات</button>}
    {feedback && <p role="status">{feedback}</p>}
  </details>;
}
