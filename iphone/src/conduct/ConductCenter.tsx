import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ShieldCheck } from 'lucide-react';
import { NoticeHeader } from '../ui/NoticeHeader';
import { callRpc } from '../cloud';
import { conductDate, conductKinds, noticeStatus, policyNames, type ConductNotice } from './model';
import './conduct.css';

export function ConductCenter({ owner }: { owner: string }) {
  const [items, setItems] = useState<ConductNotice[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [appealing, setAppealing] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const displayed = useRef(new Set<string>());
  const dialog = useRef<HTMLDialogElement>(null);
  const active = useRef(true);
  const sequence = useRef(0);
  const current = items.find(item => item.id === selected);
  const fetchItems = useCallback(async () => {
    const ticket = ++sequence.current;
    try {
      const result = await callRpc<ConductNotice[]>('marriage_member_conduct', {}, owner);
      if (active.current && sequence.current === ticket) { setItems(result); setLoadFailed(false); }
    } catch { if (active.current && sequence.current === ticket) setLoadFailed(true); }
  }, [owner]);
  useEffect(() => {
    active.current = true;
    void fetchItems();
    const visible = () => { if (!document.hidden) void fetchItems(); };
    document.addEventListener('visibilitychange', visible);
    const timer = window.setInterval(visible, 60000);
    return () => { active.current = false; ++sequence.current; clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [fetchItems]);
  useEffect(() => {
    if (selected) return;
    const next = items.find(item => item.unread && !displayed.current.has(item.id + ':' + item.revision));
    if (next) setSelected(next.id);
  }, [items, selected]);
  useEffect(() => {
    if (!current) return;
    if (!dialog.current?.open) {
      dialog.current?.showModal();
      dialog.current?.querySelector<HTMLElement>('#conduct-title')?.focus({ preventScroll:true });
    }
    const stamp = current.id + ':' + current.revision;
    if (displayed.current.has(stamp)) return;
    displayed.current.add(stamp);
    if (current.unread) {
      void callRpc('marriage_member_conduct', { command: 'read', input: { id: current.id, revision: current.revision } }, owner)
        .catch(() => { displayed.current.delete(stamp); });
    }
  }, [current, owner]);
  function close() {
    if (busy) return;
    dialog.current?.close(); setSelected(null); setAppealing(false); setNote(''); setError('');
  }
  async function respond(command: 'ack' | 'appeal') {
    if (!current || busy) return;
    setBusy(true); setError('');
    try {
      const result = await callRpc<ConductNotice[]>('marriage_member_conduct', { command, input: { id: current.id, note: note.trim() } }, owner);
      if (!active.current) return;
      ++sequence.current; setItems(result); setAppealing(false); setNote('');
    } catch (problem) {
      if (active.current) setError(problem instanceof Error && /[اأ-ي]/.test(problem.message) ? problem.message : 'تعذّر الحفظ. حاول مجددًا.');
    } finally { if (active.current) setBusy(false); }
  }
  if (!items.length && !loadFailed) return null;
  return <aside className="wd-conduct" dir="rtl" aria-label="إشعارات الحساب">
    {loadFailed && <button className="wd-conduct-entry" onClick={() => void fetchItems()}>تعذّر تحديث إشعارات الحساب · إعادة المحاولة</button>}
    {items.length > 0 && <button className="wd-conduct-entry" onClick={() => setSelected(items[0].id)}>
      <ShieldCheck size={16} aria-hidden="true" /><span>إشعارات حسابك</span><ChevronLeft size={15} aria-hidden="true" />
    </button>}
    {current && <dialog dir="rtl" className="wd-notice-sheet wd-conduct-sheet" ref={dialog} aria-labelledby="conduct-title"
      onCancel={event => { event.preventDefault(); close(); }}>
      <NoticeHeader sender={current.origin==='automated'?'رصد وُدَين الآلي':'فريق العناية بالأعضاء'} issuedAt={current.issuedAt} onClose={close} busy={busy}/>
      <p className="wd-conduct-topic">{policyNames[current.policy]}</p>
      <h2 id="conduct-title" tabIndex={-1}>{conductKinds[current.kind]}</h2>
      <p className="wd-notice-copy" dir="auto">{current.explanation}</p>
      {current.pledge && <blockquote>{current.pledge}</blockquote>}
      <dl className="wd-conduct-facts"><div><dt>الحالة</dt><dd role="status">{noticeStatus(current)}</dd></div>
        {current.kind === 'restriction' && <><div><dt>يشمل التقييد</dt><dd>إرسال طلبات تعارف جديدة</dd></div>
          {current.endsAt && <div><dt>ينتهي بتوقيت الرياض</dt><dd>{conductDate(current.endsAt)}</dd></div>}</>}
      </dl>
      {current.kind === 'pledge' && !current.acknowledgedAt && current.decision !== 'lifted' && <p>يمكنك استئناف إرسال طلبات التعارف بعد تأكيد التعهّد.</p>}
      {current.outcome && <section className="wd-conduct-outcome"><strong>ردّ الفريق</strong><p dir="auto">{current.outcome}</p></section>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {appealing ? <form className="wd-conduct-response" onSubmit={event => { event.preventDefault(); void respond('appeal'); }}>
        <label htmlFor="conduct-note">ما الذي تود توضيحه للفريق؟ <small>اختياري</small></label>
        <textarea id="conduct-note" rows={3} maxLength={800} value={note} onChange={event => setNote(event.target.value)} />
        <button type="submit" className="f-primary" disabled={busy}>إرسال طلب المراجعة</button>
        <button type="button" className="wd-conduct-appeal" disabled={busy} onClick={() => setAppealing(false)}>رجوع</button>
      </form> : <>
        {(current.kind === 'warning' || current.kind === 'pledge') && !current.acknowledgedAt && current.decision !== 'lifted' &&
          <button type="button" className="f-primary" disabled={busy} onClick={() => void respond('ack')}>{current.kind === 'pledge' ? 'أوافق على هذا التعهّد' : 'اطّلعت على التنبيه'}</button>}
        {!current.appealedAt && current.decision !== 'lifted' && <button className={current.kind==='restriction' || current.kind==='suspension' ? 'f-primary' : 'wd-conduct-appeal'} onClick={() => setAppealing(true)}>طلب مراجعة من الفريق</button>}
      </>}
      {items.length > 1 && <label className="wd-conduct-history">سجل الإشعارات<select disabled={busy} value={current.id} onChange={event => {
        setAppealing(false); setNote(''); setError(''); setSelected(event.target.value);
      }}>{items.map(item => <option key={item.id} value={item.id}>{conductKinds[item.kind]} · {conductDate(item.issuedAt)}</option>)}</select></label>}
    </dialog>}
  </aside>;
}
