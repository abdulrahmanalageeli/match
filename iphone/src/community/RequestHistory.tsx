import { useEffect, useState } from 'react';
import type { CommunitySource, RequestHistoryEntry } from './data';

const dates = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric' });
function date(value?: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : dates.format(parsed);
}

export function RequestHistory({ source }: { source: CommunitySource }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<RequestHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open || !source.requestHistory) return;
    let active = true;
    const refresh = async () => {
      setLoading(true);
      try {
        const entries = await source.requestHistory!();
        if (active) { setRows(entries); setError(false); }
      } catch { if (active) { setRows([]); setError(true); } }
      finally { if (active) setLoading(false); }
    };
    void refresh();
    const unwatch = source.watch(refresh);
    return () => { active = false; unwatch(); };
  }, [source, open, retry]);
  if (!source.requestHistory) return null;
  return <details className="cm-request-history" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{source.demoAcceptOutgoing ? 'سجل الشخصيات التوضيحية المغلقة' : 'الطلبات والتعارفات المغلقة'}</summary>
    <p>آخر ٥٠ طلبًا أو تعارفًا مغلقًا. يُعرض انتهاء المهلة عندما يؤكده النظام؛ الإغلاق وحده لا يوضح سبب انتهاء التعارف.</p>
    {loading && <p role="status">جارٍ تحميل السجل…</p>}
    {error ? <><p role="alert">تعذّر تحميل السجل.</p><button className="btn-text" onClick={() => setRetry(n => n + 1)}>إعادة المحاولة</button></> :
      !loading && !rows.length ? <p>لا توجد طلبات مغلقة في السجل.</p> : <ul>{rows.map(row => <li key={row.id}>
        <strong>{row.alias} · {row.outcome === 'expired' ? 'انتهت مهلة الطلب' : 'أُغلق'}</strong>
        <span>{row.direction === 'incoming' ? 'طلب وارد' : 'طلب مرسل'}{date(row.createdAt) && <> · أُرسل <time dateTime={row.createdAt}>{date(row.createdAt)}</time></>}</span>
        {date(row.closedAt) && <span>أُغلق <time dateTime={row.closedAt!}>{date(row.closedAt)}</time></span>}
      </li>)}</ul>}
  </details>;
}
