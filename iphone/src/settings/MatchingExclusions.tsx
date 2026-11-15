import { useEffect, useState } from 'react';
import { ArrowRight, ShieldCheck } from '../BrandIcons';
import { Brand } from '../Brand';
import type { CommunitySource, MatchingExclusion } from '../community/data';

export function MatchingExclusions({ source, onBack }: { source: CommunitySource; onBack: () => void }) {
  const [rows, setRows] = useState<MatchingExclusion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
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
    <header className="st-top"><Brand compact/><button className="st-back" type="button" onClick={onBack}><ArrowRight size={18}/> الإعدادات</button></header>
    <h1 className="st-title">الحظر وعدم إعادة الترشيح</h1>
    <p className="st-intro">الأشخاص الذين حظرتهم، والتعارفات التي أُغلقت دون إعادة ترشيح.</p>
    {loading ? <p role="status">جارٍ تحميل القائمة…</p> : error ? <div role="alert"><p>تعذّر تحميل القائمة.</p><button className="btn-secondary" onClick={() => setAttempt(value => value + 1)}>إعادة المحاولة</button></div> : rows.length ?
      <section className="st-group" aria-label="الأشخاص المستبعدون">{rows.map(row => <div className="st-row" key={row.id}>
        <span className="st-icon" aria-hidden="true"><ShieldCheck/></span><span className="st-row-copy"><strong>{row.alias}</strong><small>{row.reason === 'blocked' ? 'حظرته' : 'عدم إعادة الترشيح'}{row.since && <> · <time dateTime={row.since}>{new Date(row.since).toLocaleDateString('ar-SA')}</time></>}</small></span>
      </div>)}</section> : <p role="status">لا يوجد أشخاص في هذه القائمة حاليًا.</p>}
  </div></main>;
}
