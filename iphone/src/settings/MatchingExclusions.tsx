import { useEffect, useState } from 'react';
import { ArrowRight, ShieldCheck } from '../BrandIcons';
import { Brand } from '../Brand';
import type { CommunitySource, MatchingExclusion } from '../community/data';

export function MatchingExclusions({ source, onBack }: { source: CommunitySource; onBack: () => void }) {
  const [rows, setRows] = useState<MatchingExclusion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reportId,setReportId] = useState<string|null>(null);
  const [reason,setReason] = useState('إساءة أو ضغط غير مرغوب'), [note,setNote] = useState('');
  const [sending,setSending] = useState(false), [status,setStatus] = useState('');
  async function submit() {
    if(!reportId || !source.reportPerson || sending)return;
    setSending(true);
    try {await source.reportPerson(reportId,[reason,note.trim()].filter(Boolean).join('\n'));setReportId(null);setStatus('وصل بلاغك إلى فريق المراجعة.');}
    catch {setStatus('تعذّر إرسال البلاغ. يمكنك إعادة المحاولة.');}
    finally {setSending(false);}
  }
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setLoading(true); setError(false); setRows([]);
    source.matchingExclusions!().then(value => { if (current) setRows(value); })
      .catch(() => { if (current) setError(true); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [source, attempt]);
  return <main className="app-screen st-screen" dir="rtl"><div className="screen-content st-content">
    <header className="st-top"><Brand compact/><button data-nf-back={!reportId && !sending || undefined} className="st-back" type="button" onClick={onBack}><ArrowRight size={18}/> الإعدادات</button></header>
    <h1 className="st-title">الحظر وعدم إعادة الترشيح</h1>
    <p className="st-intro">الأشخاص الذين حظرتهم، والتعارفات التي أُغلقت دون إعادة ترشيح.</p>
    {loading ? <p role="status">جارٍ تحميل القائمة…</p> : error ? <div role="alert"><p>تعذّر تحميل القائمة.</p><button className="btn-secondary" onClick={() => setAttempt(value => value + 1)}>إعادة المحاولة</button></div> : rows.length ?
      <section className="st-group" aria-label="الأشخاص المستبعدون">{rows.map(row => <div className="st-row" key={row.id}>
        <span className="st-icon" aria-hidden="true"><ShieldCheck/></span><span className="st-row-copy"><strong>{row.alias}</strong><small>{row.reason === 'blocked' ? 'حظرته' : 'عدم إعادة الترشيح'}{row.since && <> · <time dateTime={row.since}>{new Date(row.since).toLocaleDateString('ar-SA')}</time></>}</small></span>
        {row.reason==='blocked' && source.reportPerson && <button type="button" disabled={sending} onClick={()=>{setReportId(row.id);setReason('إساءة أو ضغط غير مرغوب');setNote('');setStatus('');}}>الإبلاغ عن واقعة</button>}
        {reportId===row.id && <div><label>سبب البلاغ<select value={reason} onChange={e=>setReason(e.target.value)}>{['إساءة أو ضغط غير مرغوب','تهديد فوري للسلامة','انتهاك الخصوصية','سبب آخر'].map(v=><option key={v}>{v}</option>)}</select></label>
          <label>تفاصيل اختيارية<textarea value={note} maxLength={440} onChange={e=>setNote(e.target.value)}/></label>
          <button disabled={sending} onClick={()=>void submit()}>إرسال البلاغ</button><button disabled={sending} onClick={()=>setReportId(null)}>إلغاء</button></div>}
      </div>)}</section> : <p role="status">لا يوجد أشخاص في هذه القائمة حاليًا.</p>}
    {status && <p role="status">{status}</p>}
  </div></main>;
}
