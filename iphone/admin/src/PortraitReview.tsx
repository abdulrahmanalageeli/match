import { useEffect, useState } from 'react';
import { call, client, friendly, mode } from './client';
type PhotoRequest = { id: string; memberId: string; displayName: string | null; submittedAt: string; status: string };

export function PortraitReview({ refresh, onError }: { refresh: number; onError: (e: unknown) => void }) {
  const [rows, setRows] = useState<PhotoRequest[]>([]), [revision, setRevision] = useState(0), [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (mode === 'demo') return;
    void call<PhotoRequest[]>('marriage_admin_portrait_queue').then(value => { if (active) setRows(value); }).catch(e => { if (active) { setError(friendly(e)); onError(e); } });
    return () => { active = false; };
  }, [refresh, revision, onError]);
  return <section className="panel"><h2>صور تحتاج مراجعة</h2><p className="muted">صور أرسلها أصحابها بعد تعذّر المطابقة. اعتماد الصورة لا يمنح شارة هوية أو ادعاء مطابقة الوجه.</p>{error && <p role="alert">{error}</p>}{!rows.length && <p className="muted">لا توجد صور بانتظار المراجعة.</p>}{rows.map(row => <PhotoRow key={row.id} row={row} done={() => setRevision(v => v + 1)} onError={onError}/>)}</section>;
}
function PhotoRow({ row, done, onError }: { row: PhotoRequest; done: () => void; onError: (e: unknown) => void }) {
  const [url, setUrl] = useState(''), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  async function view() {
    if (!client) return;
    setBusy(true); setError('');
    try {
      const session = (await client.auth.getSession()).data.session;
      if (!session) throw Error('سجّل الدخول مجددًا.');
      const response = await fetch('/api/portrait-review', { method: 'POST', cache: 'no-store', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ photo: row.id }), signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw Error('تعذّر فتح الصورة. حدّث الطلب وحاول مجددًا.');
      setUrl(URL.createObjectURL(await response.blob()));
    } catch (e) { setError(friendly(e)); onError(e); } finally { setBusy(false); }
  }
  async function decide(approved: boolean) {
    setBusy(true); setError('');
    try { await call('marriage_admin_portrait_decide', { photo: row.id, approved, review_reason: reason.trim() }); done(); }
    catch (e) { setError(friendly(e)); onError(e); } finally { setBusy(false); }
  }
  return <section className="review-section"><h3>{row.displayName || 'عضو يكمل ملفه'}</h3><p className="muted">{new Date(row.submittedAt).toLocaleString('ar-SA')}</p>{url ? <img src={url} alt="الصورة التي أرسلها العضو للمراجعة" style={{ width: 180, maxWidth: '100%', borderRadius: 18 }}/> : <button className="secondary" disabled={busy} onClick={() => void view()}>فتح الصورة الخاصة</button>}{url && <><label>سبب القرار<textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={500} disabled={busy}/></label><div className="choice-row"><button className="primary" disabled={busy || reason.trim().length < 3} onClick={() => void decide(true)}>اعتماد الصورة</button><button className="secondary" disabled={busy || reason.trim().length < 3} onClick={() => void decide(false)}>طلب صورة بديلة</button></div></>}{error && <p role="alert">{error}</p>}</section>;
}
