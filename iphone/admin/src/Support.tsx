import { useEffect, useRef, useState } from 'react';
import type { AdminApi, SupportRow } from './types';

const statuses = { open: 'جديدة', in_review: 'قيد المتابعة', resolved: 'تم الرد والإغلاق' };
const categories: Record<string, string> = { help: 'استخدام التطبيق', access: 'الحساب وربط الأهل', billing: 'العضوية والدفع', safety: 'الخصوصية والسلامة' };
export function SupportAdmin({ api, refresh, onError }: { api: AdminApi; refresh: number; onError: (error: unknown) => void }) {
  const [filter, setFilter] = useState('open'), [rows, setRows] = useState<SupportRow[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<SupportRow | null>(null), [response, setResponse] = useState(''), [status, setStatus] = useState<'in_review' | 'resolved'>('in_review');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [revision, setRevision] = useState(0);
  const generation = useRef(0), attempt = useRef<{ fingerprint: string; id: string } | null>(null);
  useEffect(() => {
    const ticket = ++generation.current; setBusy(true); setError(''); setSelected(null);
    void api.support(filter).then(page => { if (ticket === generation.current) { setRows(page.items); setCursor(page.nextCursor); } }, problem => { if (ticket === generation.current) { setError(problem instanceof Error ? problem.message : 'تعذّر تحميل الطلبات.'); onError(problem); } }).finally(() => { if (ticket === generation.current) setBusy(false); });
    return () => { generation.current++; };
  }, [api, filter, refresh, revision, onError]);
  async function more() {
    if (!cursor || busy) return; const ticket = generation.current; setBusy(true);
    try { const page = await api.support(filter, cursor); if (ticket === generation.current) { setRows(old => [...old, ...page.items]); setCursor(page.nextCursor); } }
    catch (problem) { if (ticket === generation.current) { setError(problem instanceof Error ? problem.message : 'تعذّر التحميل.'); onError(problem); } }
    finally { if (ticket === generation.current) setBusy(false); }
  }
  async function send() {
    if (!selected || busy) return; setBusy(true); setError(''); setNotice('');
    const ticket = generation.current, fingerprint = JSON.stringify([selected.id, selected.revision, status, response.trim()]);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, id: crypto.randomUUID() };
    try {
      await api.supportReply(selected.id, selected.revision, status, response.trim(), attempt.current.id);
      if (ticket === generation.current) { setSelected(null); setResponse(''); attempt.current = null; setNotice('حُفظ الرد وأصبح ظاهرًا لصاحب الطلب.'); setRevision(value => value + 1); }
    } catch (problem) { if (ticket === generation.current) { setError(problem instanceof Error ? problem.message : 'تعذّر حفظ الرد.'); onError(problem); } }
    finally { if (ticket === generation.current) setBusy(false); }
  }
  return <section className="panel queue-panel"><div className="panel-heading queue-heading"><div><h2>مساعدة الأعضاء والأهل</h2><p>الرد ظاهر لصاحب الطلب. لا تطلب كلمة مرور أو رمز دخول أو مستند هوية هنا.</p></div><div className="filters" role="group" aria-label="حالة طلبات المساعدة">{Object.entries(statuses).map(([value, label]) => <button key={value} disabled={busy} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
    {error && <p className="notice error" role="alert">{error} <button onClick={() => setRevision(value => value + 1)}>تحديث الطلبات</button></p>}{notice && <p className="notice" role="status">{notice}</p>}
    {busy && <p role="status">جارٍ الحفظ أو التحميل…</p>}{!busy && !rows.length && !error && <p className="empty">لا توجد طلبات بهذه الحالة.</p>}
    {rows.map(row => <article className="support-admin-ticket" key={row.id}><h3>{row.subject}</h3><p>{categories[row.category]} · {statuses[row.status]} · {new Date(row.createdAt).toLocaleString('ar-SA')}</p><small>الطلب <bdi>{row.id}</bdi> · الحساب <bdi>{row.ownerId}</bdi></small><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row.body}</p>{row.response && <p style={{ whiteSpace: 'pre-wrap' }}>آخر رد: {row.response}</p>}<button className="secondary" disabled={busy} onClick={() => { setSelected(row); setResponse(row.response || ''); setStatus('in_review'); setError(''); }}>متابعة هذا الطلب</button>
      {selected?.id === row.id && <form onSubmit={event => { event.preventDefault(); void send(); }}><label>الرد لصاحب الطلب<textarea value={response} disabled={busy} required minLength={3} maxLength={3000} rows={5} onChange={event => setResponse(event.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginBlock: 12 }}/></label><label>حالة الطلب<select disabled={busy} value={status} onChange={event => setStatus(event.target.value as 'in_review' | 'resolved')}><option value="in_review">قيد المتابعة</option><option value="resolved">تم الرد والإغلاق</option></select></label><button className="primary" disabled={busy || response.trim().length < 3}>حفظ الرد والحالة</button><button className="secondary" type="button" disabled={busy} onClick={() => setSelected(null)}>تراجع</button></form>}
    </article>)}{cursor && <button className="secondary" disabled={busy} onClick={() => void more()}>طلبات أقدم</button>}
  </section>;
}
