import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Mail, MessageCircle, X } from "../BrandIcons";
import type { SupportCategory, SupportInput, SupportSource, SupportTicket } from './support';
import { feedback } from '../feedback/haptics';
import { KeyboardDismiss } from '../mobile/KeyboardDismiss';
import './support.css';

const contact = 'privacy@blindmatch.app';
const Context = createContext<SupportSource | null>(null);
const statuses = { open: 'تم الاستلام', in_review: 'قيد المتابعة', resolved: 'تم الرد والإغلاق' };
// Session-memory only; each authenticated source owns its drafts and retry IDs.
const drafts = new WeakMap<SupportSource, Map<string, SupportInput>>();
export function SupportProvider({ source, children }: { source: SupportSource | null; children: ReactNode }) {
  return <Context.Provider value={source}>{children}</Context.Provider>;
}

function SupportTicketsLoading() {
  return <div className="nf-support-loading" role="status"><span>جارٍ تحميل طلباتك…</span><div aria-hidden="true" className="nf-support-skeleton"><i/><i/><i/><i/></div></div>;
}

function SupportDialog({ source, subject: initialSubject, context, close }: { source: SupportSource; subject: string; context?: string; close: () => void }) {
  const draftKey = initialSubject + '\n' + (context || ''), saved = drafts.get(source)?.get(draftKey);
  const dialog = useRef<HTMLDialogElement>(null), heading = useId(), generation = useRef(0);
  const [category, setCategory] = useState<SupportCategory>(saved?.category || 'help'), [subject, setSubject] = useState(saved?.subject ?? initialSubject), [body, setBody] = useState(saved?.body ?? (context ? context + '\n\n' : ''));
  const [items, setItems] = useState<SupportTicket[]>([]), [cursor, setCursor] = useState<string | null>(null), [loading, setLoading] = useState(true), [sending, setSending] = useState(false), [error, setError] = useState(''), [receipt, setReceipt] = useState('');
  const attempt = useRef<SupportInput | null>(saved || null);
  useEffect(() => {
    const entries = drafts.get(source) || new Map<string, SupportInput>();
    const prior = entries.get(draftKey);
    const same = prior?.category === category && prior.subject.trim() === subject.trim() && prior.body.trim() === body.trim();
    entries.set(draftKey, { category, subject, body, clientId: same ? prior.clientId : crypto.randomUUID() }); drafts.set(source, entries);
  }, [source, draftKey, category, subject, body]);
  async function load(before?: string) {
    const ticket = generation.current;
    setLoading(true); setError('');
    try { const page = await source.list(before); if (ticket === generation.current) { setItems(old => before ? [...old, ...page.items] : page.items); setCursor(page.nextCursor); } }
    catch (e) { if (ticket === generation.current) setError(e instanceof Error ? e.message : 'تعذّر تحميل الطلبات.'); }
    finally { if (ticket === generation.current) setLoading(false); }
  }
  useEffect(() => { generation.current++; const el = dialog.current; el?.showModal(); void load(); return () => { generation.current++; el?.close(); }; }, [source]);
  async function send() {
    if (sending || loading) return;
    const ticketGeneration = generation.current;
    setSending(true); setError(''); setReceipt('');
    const values = { category, subject: subject.trim(), body: body.trim() };
    if (!attempt.current || attempt.current.category !== values.category || attempt.current.subject.trim() !== values.subject || attempt.current.body.trim() !== values.body) attempt.current = { ...values, clientId: crypto.randomUUID() };
    else attempt.current = { ...values, clientId: attempt.current.clientId };
    drafts.get(source)?.set(draftKey, attempt.current);
    try {
      const ticket = await source.create(attempt.current);
      if (ticketGeneration !== generation.current) return;
      feedback('success');
      setItems(old => [ticket, ...old.filter(item => item.id !== ticket.id)]); setBody(''); attempt.current = null;
      setReceipt('استلمنا طلبك. يمكنك متابعة حالته ورد الفريق هنا.');
    } catch (e) { if (ticketGeneration === generation.current) setError(e instanceof Error ? e.message : 'تعذّر تأكيد الإرسال. حاول مجددًا.'); }
    finally { if (ticketGeneration === generation.current) setSending(false); }
  }
  return <dialog ref={dialog} className="nf-support-dialog" dir="rtl" aria-labelledby={heading} onCancel={event => { event.preventDefault(); if (!sending) close(); }}>
    <header><h2 id={heading}>المساعدة داخل التطبيق</h2><button type="button" aria-label="إغلاق المساعدة" disabled={sending} onClick={close}><X size={20}/></button></header>
    <p>أرسل ما تحتاج إلى مشاركته فقط. لا تُرفق المحادثات أو بيانات ملفك تلقائيًا. يستطيع فريق المساعدة المخوّل قراءة طلبك والرد عليه.</p>
    <small>لا ترسل كلمة مرور أو رمز دخول أو صورة هوية. لا يوجد وقت استجابة محدد معلن.</small>
    <form onSubmit={event => { event.preventDefault(); void send(); }}>
      <label>نوع المساعدة<select value={category} disabled={sending} onChange={e => setCategory(e.target.value as SupportCategory)}><option value="help">استخدام التطبيق</option><option value="access">الحساب أو ربط الأهل</option><option value="billing">العضوية والدفع</option><option value="safety">الخصوصية أو السلامة</option></select></label>
      <label>الموضوع<input value={subject} required maxLength={140} disabled={sending} onChange={e => setSubject(e.target.value)}/></label>
      <label>كيف نساعدك؟<textarea value={body} required minLength={5} maxLength={3000} rows={5} disabled={sending} onChange={e => setBody(e.target.value)}/></label>
      <KeyboardDismiss/>
      <button className="nf-support-primary" disabled={sending || loading || subject.trim().length < 3 || body.trim().length < 5}>{sending ? 'جارٍ الإرسال…' : 'إرسال طلب المساعدة'}</button>
    </form>
    {error && <p className="nf-support-feedback nf-support-error" role="alert">{error}</p>}{receipt && <p className="nf-support-feedback nf-support-receipt" role="status">{receipt}</p>}
    <section className="nf-support-requests" aria-label="طلبات المساعدة"><header><h3>طلباتي</h3><button type="button" disabled={loading || sending} onClick={() => void load()}>تحديث</button></header>
      {loading && (items.length ? <p className="nf-support-refresh" role="status">جارٍ تحديث طلباتك…</p> : <SupportTicketsLoading/>)}{!loading && !items.length && !error && <div className="nf-support-empty"><h4>طلباتك في مكان واحد</h4><p>اكتب ما تحتاج إليه في النموذج أعلاه. بعد الإرسال، يظهر هنا رقم طلبك وحالته ورد الفريق.</p></div>}
      {items.map(item => <article className="nf-support-ticket" key={item.id}><strong>{item.subject}</strong><p className="nf-support-state" data-status={item.status}>{statuses[item.status]}</p><small>رقم الطلب: <bdi>{item.id}</bdi><br/>{new Date(item.createdAt).toLocaleDateString('ar-SA')}</small><details><summary>تفاصيل الطلب</summary><p>{item.body}</p></details>{item.response && <div className="nf-support-response"><strong>رد فريق وُدَين</strong><p>{item.response}</p><small>{new Date(item.updatedAt).toLocaleString('ar-SA')}</small></div>}</article>)}
      {cursor && <button type="button" disabled={loading || sending} onClick={() => void load(cursor)}>طلبات أقدم</button>}
    </section>
  </dialog>;
}

export function SupportContact({ subject = 'مساعدة في وُدَين', context }: { subject?: string; context?: string }) {
  const source = useContext(Context), [openedSource, setOpenedSource] = useState<SupportSource | null>(null), [copied, setCopied] = useState(false);
  useEffect(() => { setOpenedSource(null); }, [source]);
  const body = [context, 'أحتاج مساعدة بخصوص:'].filter(Boolean).join('\n\n');
  const href = `mailto:${contact}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return <aside className="nf-support-contact" aria-label="التواصل مع فريق وُدَين">
    {source && <><button type="button" onClick={() => setOpenedSource(source)}><MessageCircle size={17} aria-hidden="true"/> المساعدة وطلباتي</button><p>أرسل طلبًا وتابع رقمه وحالته ورد الفريق داخل التطبيق.</p></>}
    <a href={href}><Mail size={17} aria-hidden="true" /> مراسلة فريق وُدَين بالبريد</a>
    <p>يفتح مسودة في تطبيق بريدك؛ راجعها وأرسلها بنفسك. لا تُرفق محادثاتك أو بيانات حسابك تلقائيًا.</p>
    <small>لا ترسل كلمة مرور أو رمز دخول أو صورة هوية. لا يوجد وقت استجابة محدد معلن.</small>
    {!source && <small>تتوفر متابعة الطلبات داخل التطبيق بعد تسجيل الدخول بحساب فعلي.</small>}
    <bdi>{contact}</bdi><button type="button" onClick={() => { void navigator.clipboard?.writeText(contact).then(() => setCopied(true), () => setCopied(false)); }}>{copied ? 'تم نسخ البريد' : 'نسخ عنوان البريد'}</button>
    {source && openedSource === source && <SupportDialog source={source} subject={subject} context={context} close={() => setOpenedSource(null)}/>}
  </aside>;
}
