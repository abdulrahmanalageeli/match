import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, Copy, Mail, MessageCircle, X } from "../BrandIcons";
import type { SupportCategory, SupportInput, SupportSource, SupportTicket } from './support';
import { feedback } from '../feedback/haptics';
import { KeyboardDismiss } from '../mobile/KeyboardDismiss';
import { MemberData } from '../settings/MemberData';
import {chapters,type Chapter} from '../onboarding/draft';
import './support.css';

const contact = 'privacy@blindmatch.app';
const Context = createContext<SupportSource | null>(null);
const statuses = { open: 'تم الاستلام', in_review: 'قيد المتابعة', resolved: 'تم الرد والإغلاق' };
// Session-memory only; each authenticated source owns its drafts and retry IDs.
const drafts = new WeakMap<SupportSource, Map<string, SupportInput>>();
const ReviewSection=createContext<((chapter:Chapter,field:string)=>void)|undefined>(undefined);
export function SupportProvider({ source, children,onReview }: { source: SupportSource | null; children: ReactNode; onReview?:(chapter:Chapter,field:string)=>void }) {
  return <Context.Provider value={source}><ReviewSection.Provider value={onReview}>{children}</ReviewSection.Provider></Context.Provider>;
}

function SupportTicketsLoading() {
  return <div className="nf-support-loading" role="status"><span>جارٍ تحميل طلباتك…</span><div aria-hidden="true" className="nf-support-skeleton"><i/><i/><i/><i/></div></div>;
}

function SupportDialog({ source, subject: initialSubject, context, close, focusTicket }: { source: SupportSource; subject: string; context?: string; close: () => void; focusTicket?:string }) {
  const reviewSection=useContext(ReviewSection);
  const [exportTicket,setExportTicket]=useState(''),[phoneTicket,setPhoneTicket]=useState(''),[phone,setPhone]=useState(''),[otp,setOtp]=useState(''),[smsSent,setSmsSent]=useState(false);
  async function verifyCase(id:string) {
    if(sending||!source.verifyCase)return;setSending(true);setError('');
    try{
      if(phoneTicket===id && source.sendAuthPhone && source.confirmAuthPhone){
        if(!smsSent){await source.sendAuthPhone(phone);setSmsSent(true);return;}
        await source.confirmAuthPhone(id,phone,otp);
      }else{const state=await source.verifyCase(id);if(state==='authPhone'){setPhoneTicket(id);setSmsSent(false);return;}if(state==='cancelled')return;}
      setPhoneTicket('');setPhone('');setOtp('');setReceipt('اكتمل التحقق من حسابك.');await load();
    }catch(e){setError(e instanceof Error?e.message:'تعذّر التحقق.');}finally{setSending(false);}
  }
  const draftKey = initialSubject + '\n' + (context || ''), saved = drafts.get(source)?.get(draftKey);
  const dialog = useRef<HTMLDialogElement>(null), heading = useId(), generation = useRef(0);
  const [category, setCategory] = useState<SupportCategory>(saved?.category || 'help'), [subject, setSubject] = useState(saved?.subject ?? initialSubject), [body, setBody] = useState(saved?.body ?? (context ? context + '\n\n' : ''));
  const [items, setItems] = useState<SupportTicket[]>([]), [cursor, setCursor] = useState<string | null>(null), [loading, setLoading] = useState(true), [sending, setSending] = useState(false), [error, setError] = useState(''), [receipt, setReceipt] = useState('');
  useEffect(()=>{ if(focusTicket) document.getElementById(`support-${focusTicket}`)?.scrollIntoView({block:"center"}); },[focusTicket,items]);
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
    try {
      const [page,focused]=await Promise.all([source.list(before),!before&&focusTicket?source.ticket?.(focusTicket).catch(()=>null):null]);
      if(ticket===generation.current){
        const next=focused?[focused,...page.items.filter(item=>item.id!==focused.id)]:page.items;
        setItems(old=>before?[...old,...next.filter(item=>!old.some(previous=>previous.id===item.id))]:next);
        setCursor(page.nextCursor);
      }
    }
    catch (e) { if (ticket === generation.current) setError(e instanceof Error ? e.message : 'تعذّر تحميل الطلبات.'); }
    finally { if (ticket === generation.current) setLoading(false); }
  }
  useEffect(() => { generation.current++; const el = dialog.current; el?.showModal(); void load(); return () => { generation.current++; el?.close(); }; }, [source,focusTicket]);
  async function shareDirectory(ticket:string) {
    if(!source.shareDirectory||sending)return;
    setSending(true);setError('');
    try{await source.shareDirectory(ticket);await load();setReceipt('أرسلنا لفريق الدعم عدد النتائج قبل التصفية وبعدها.');}
    catch(e){setError(e instanceof Error?e.message:'تعذّرت مشاركة عدد النتائج.');}finally{setSending(false);}
  }
  async function confirmRepair(ticket:string) {
    if(!source.confirmRepair || sending)return;
    setSending(true);setError('');
    try{await source.confirmRepair(ticket);await load();setReceipt('شكرًا، وصل تأكيدك لفريق وُدَين.');}
    catch(e){setError(e instanceof Error?e.message:'تعذّر إرسال تأكيدك.');}
    finally{setSending(false);}
  }
  async function deletionDecision(ticket: SupportTicket, approve: boolean) {
    if (!source.confirmDeletion || sending) return;
    setSending(true); setError('');
    try { await source.confirmDeletion(ticket.id, approve); await load(); setReceipt(approve ? 'سُجل تأكيدك لطلب الحذف.' : 'سُحب تأكيد الحذف.'); }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'تعذّر حفظ قرارك.'); }
    finally { setSending(false); }
  }
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
      setReceipt('وصلنا طلبك. هنا تقدر تتابع حالته وتشوف رد الفريق.');
    } catch (e) { if (ticketGeneration === generation.current) setError(e instanceof Error ? e.message : 'تعذّر تأكيد الإرسال. حاول مجددًا.'); }
    finally { if (ticketGeneration === generation.current) setSending(false); }
  }
  return <dialog ref={dialog} className="nf-support-dialog" dir="rtl" aria-labelledby={heading} onCancel={event => { event.preventDefault(); if (!sending) close(); }}>
    <header><h2 id={heading}>المساعدة داخل التطبيق</h2><button type="button" aria-label="إغلاق المساعدة" disabled={sending} onClick={close}><X size={20}/></button></header>
    <form onSubmit={event => { event.preventDefault(); void send(); }}>
      <label>نوع المساعدة<select value={category} disabled={sending} onChange={e => setCategory(e.target.value as SupportCategory)}><option value="help">استخدام التطبيق</option><option value="access">الحساب أو ربط الأهل</option><option value="billing">العضوية والدفع</option><option value="safety">الخصوصية أو السلامة</option></select></label>
      <label>الموضوع<input value={subject} required maxLength={140} disabled={sending} onChange={e => setSubject(e.target.value)}/></label>
      <label>كيف نساعدك؟<textarea value={body} required minLength={5} maxLength={3000} rows={5} disabled={sending} onChange={e => setBody(e.target.value)}/></label>
      <small>لا ترسل كلمة مرور أو رمز دخول أو صورة هوية.</small>
      <KeyboardDismiss/>
      <button className="nf-support-primary" disabled={sending || loading || subject.trim().length < 3 || body.trim().length < 5}>{sending ? 'جارٍ الإرسال…' : 'إرسال طلب المساعدة'}</button>
    </form>
    {error && <p className="nf-support-feedback nf-support-error" role="alert">{error}</p>}{receipt && <p className="nf-support-feedback nf-support-receipt" role="status">{receipt}</p>}
    <section className="nf-support-requests" aria-label="طلبات المساعدة"><header><h3>طلباتي</h3><button type="button" disabled={loading || sending} onClick={() => void load()}>تحديث</button></header>
      {loading && (items.length ? <p className="nf-support-refresh" role="status">جارٍ تحديث طلباتك…</p> : <SupportTicketsLoading/>)}{!loading && !items.length && !error && <div className="nf-support-empty"><p>ما عندك طلبات مساعدة سابقة.</p></div>}
      {items.map(item => <article className="nf-support-ticket" id={`support-${item.id}`} key={item.id}><strong>{item.subject}</strong><p className="nf-support-state" data-status={item.status}>{statuses[item.status]}</p><small>رقم الطلب: <bdi>{item.id}</bdi><br/>{new Date(item.createdAt).toLocaleDateString('ar-SA')}</small><details><summary>تفاصيل الطلب</summary><p>{item.body}</p></details>{item.response && <div className="nf-support-response"><strong>رد فريق وُدَين</strong><p>{item.response}</p><small>{new Date(item.updatedAt).toLocaleString('ar-SA')}</small></div>}{item.status!=='resolved'&&item.needsVerification&&source.verifyCase&&<div className="nf-support-response">{phoneTicket===item.id&&<label>{smsSent?'رمز تأكيد الرقم الجديد':'رقم الجوال الجديد'}<input dir="ltr" inputMode={smsSent?'numeric':'tel'} value={smsSent?otp:phone} onChange={e=>smsSent?setOtp(e.target.value):setPhone(e.target.value)}/></label>}<button type="button" disabled={sending} onClick={()=>void verifyCase(item.id)}>{phoneTicket===item.id?(smsSent?'تأكيد الرقم':'إرسال رمز التحقق'):'التحقق من ملكية الحساب'}</button></div>}
      {item.status!=='resolved'&&item.editStep&&reviewSection&&<button type="button" onClick={()=>{const chapter=chapters.find(c=>c.key===item.editStep)?.key;if(chapter){close();reviewSection(chapter,item.editField??'');}}}>مراجعة {item.editField}</button>}
      {item.status!=='resolved'&&item.exportOffered&&source.ownerId&&<button type="button" onClick={()=>setExportTicket(item.id)}>فتح نسخة بياناتي الخاصة</button>}
      {item.status!=='resolved'&&item.requestFilters&&source.shareDirectory&&<button disabled={sending} type="button" onClick={()=>void shareDirectory(item.id)}>مشاركة عدد نتائج اكتشافي فقط</button>}
      {item.status!=='resolved'&&item.confirmRepair&&<button disabled={sending} type="button" onClick={()=>void confirmRepair(item.id)}>تأكدت من حل المشكلة</button>}
      {item.deletionRequested && source.confirmDeletion && <details className="nf-support-response"><summary>طلب حذف حسابي</summary><p>عند تنفيذ الحذف تُزال بيانات حسابك وتنتهي علاقات التعارف. إذا كان عندك اشتراك في Apple، راجع التجديد في حساب المتجر.</p>{item.deletionApproved && <p>طلبك مؤكّد وبانتظار التنفيذ.</p>}<button type="button" disabled={sending} onClick={() => void deletionDecision(item, !item.deletionApproved)}>{item.deletionApproved ? 'سحب موافقتي على الحذف' : 'أؤكد طلبي بحذف حسابي نهائيًا'}</button></details>}</article>)}
      {cursor && <button type="button" disabled={loading || sending} onClick={() => void load(cursor)}>طلبات أقدم</button>}
    </section>
    {exportTicket&&source.ownerId&&<MemberData mode="export" caseTicket={exportTicket} owner={source.ownerId} demo={false} close={()=>setExportTicket('')}/>}
  </dialog>;
}

export function SupportContact({ subject = 'مساعدة في وُدَين', context, openTicket, onTicketClosed }: { subject?: string; context?: string; openTicket?:string; onTicketClosed?:()=>void }) {
  const source = useContext(Context), [openedSource, setOpenedSource] = useState<SupportSource | null>(null), [copied, setCopied] = useState(false);
  useEffect(() => { setOpenedSource(null); }, [source]);
  const body = [context, 'أحتاج مساعدة بخصوص:'].filter(Boolean).join('\n\n');
  const href = `mailto:${contact}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return <aside className="nf-support-contact" aria-label="التواصل مع فريق وُدَين">
    {source && <button className="nf-support-route" type="button" aria-haspopup="dialog" onClick={() => setOpenedSource(source)}>
      <MessageCircle size={19} aria-hidden="true"/><span>المساعدة وطلباتي<small>أرسل طلبًا وتابع رد الفريق</small></span><ChevronLeft size={15} aria-hidden="true"/>
    </button>}
    <div className="nf-support-email"><a className="nf-support-route" href={href}><Mail size={19} aria-hidden="true"/><span>مراسلة فريق وُدَين بالبريد<bdi>{contact}</bdi></span></a>
      <button className="nf-support-copy" type="button" aria-label={copied ? 'تم نسخ البريد' : 'نسخ عنوان البريد'} onClick={() => { void navigator.clipboard?.writeText(contact).then(() => setCopied(true), () => setCopied(false)); }}>{copied ? 'تم النسخ' : <Copy size={16}/>}</button>
    </div>
    {source && (openedSource === source || openTicket) && <SupportDialog source={source} subject={subject} context={context} focusTicket={openTicket} close={() => { setOpenedSource(null); onTicketClosed?.(); }}/>}
  </aside>;
}
