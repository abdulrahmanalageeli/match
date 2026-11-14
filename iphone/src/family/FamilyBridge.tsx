import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Check, ChevronLeft, Clock3, Copy, Download, HeartHandshake, Link2, LockKeyhole, MessageCircle, Plus, Send, ShieldCheck, Trash2, UserPlus, UsersRound, X } from "../BrandIcons";
import { Brand } from '../Brand';
import { SupportContact } from '../help/SupportContact';
import { KeyboardDismiss } from '../mobile/KeyboardDismiss';
import { feedback } from '../feedback/haptics';
import type { CommunitySource, Connection } from '../community/data';
import { familyInviteUrl, familyLinkReady, familyLinkStatus, normalizeFamilyCode as connectionCode, validFamilyCode as validConnectionCode, type FamilyLink, type FamilyRequest, type FamilyState, type FamilyRoom, type FamilyMessage } from './model';
import { qrDataUrl } from './qr';
import { FamilyPreparation } from './FamilyPreparation';
import { FamilyLoading } from './FamilyLoading';
import './family.css';
import './guidance.css';

const ar = new Intl.NumberFormat('ar-SA');
const relationships = [{ id: 'father', label: 'الأب' }, { id: 'mother', label: 'الأم' }, { id: 'brother', label: 'الأخ' }, { id: 'sister', label: 'الأخت' }, { id: 'relative', label: 'أحد الأقارب' }];
const relation = (id: string) => relationships.find(item => item.id === id)?.label ?? 'من الأسرة';
const time = (value: string) => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('ar-SA', { hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : '';
const day = (value: string) => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('ar-SA', { calendar: 'gregory', day: 'numeric', month: 'long' }).format(new Date(value)) : '';
const message = (error: unknown) => error instanceof Error && /[\u0600-\u06ff]/.test(error.message) ? error.message : 'تعذّر إتمام الطلب. حاول مرة أخرى.';
const isState = (value: unknown): value is FamilyState => Boolean(value && typeof value === 'object' && 'role' in value && Array.isArray((value as FamilyState).rooms) && Array.isArray((value as FamilyState).links));

function FamilyFrame({ children, onBack, guardian = false }: { children: ReactNode; onBack?: () => void; guardian?: boolean }) {
  return <main className="app-screen fb-screen" dir="rtl"><div className="screen-content fb-content"><header className="fb-navigation">{onBack ? <button className="fb-back" type="button" onClick={onBack}><ArrowRight size={18} /> {guardian ? 'خروج' : 'رجوع'}</button> : <span />}<Brand compact /></header>{children}</div></main>;
}

function ConfirmFamilyAction({ title, description, busy, onCancel, onConfirm }: { title: string; description: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = ref.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={ref} className="fb-dialog" dir="rtl" aria-labelledby="fb-confirm-title" onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}><span className="fb-dialog-icon"><ShieldCheck size={24} /></span><h2 id="fb-confirm-title">{title}</h2><p>{description}</p><div><button className="btn-secondary" disabled={busy} autoFocus onClick={onCancel}>تراجع</button><button className="btn-primary" disabled={busy} onClick={onConfirm}>{busy ? 'جارٍ التنفيذ…' : 'تأكيد'}</button></div></dialog>;
}

export function FamilyNextAction({ state, guardian }: { state: FamilyState; guardian: boolean }) {
  const readyLinks = state.links.filter(familyLinkReady), ready = readyLinks.length > 0;
  const review = state.rooms.find(room => room.needsAcceptance || room.needsApproval);
  const active = state.rooms.some(room => room.status === 'active' && room.canRead);
  const pendingLink = state.links.find(link => !familyLinkReady(link) && link.adminReview !== 'rejected');
  let title = 'ابدأ بربط فرد من الأسرة', detail = guardian ? 'اطلب رمز الربط من صاحب الحساب، ثم أدخله أدناه. لا تحتاج إلى رقم هويته.' : 'اختر من يساندك وأنشئ له رمزًا خاصًا. لن يُشارك شيء من محادثتك.', target = 'fb-family-title';
  if (review) { title = 'لديك دعوة تحتاج قرارك'; detail = `راجع المشاركين في «${review.title}» ثم اقبل الدعوة أو اعتذر عنها.`; target = 'fb-rooms-title'; }
  else if (active) { title = 'مساحتكم العائلية جاهزة'; detail = 'افتح المحادثة. يمكنكم تجهيز تعريف اختياري أو اقتراح عملي للخطوة القادمة ومراجعته قبل إرساله.'; target = 'fb-rooms-title'; }
  else if (ready) { title = guardian ? 'الربط جاهز؛ انتظر دعوة المساحة' : 'الربط جاهز؛ اختارا التعارف والمشاركين'; detail = `الربط الجاهز: ${readyLinks.map(link => guardian ? link.memberName : link.familyName || relation(link.relationship)).join('، ')}. ` + (guardian ? 'يوافق طرفا التعارف على إشراك الأهل وقائمة المشاركين، ثم تصلك دعوة تقبلها بنفسك.' : 'وافقا على جسر الأهل لهذا التعارف، ثم اقترحا مساحة محددة المشاركين. كل شخص مدعو يقبل بنفسه.') + (pendingLink ? ' الروابط الأخرى قيد المراجعة لا تمنع استخدام الربط الجاهز.' : ''); target = guardian ? 'fb-rooms-title' : 'fb-bridge-title'; }
  else if (pendingLink) { title = 'طلب الربط قيد المراجعة'; detail = `${guardian ? pendingLink.memberName : pendingLink.familyName || relation(pendingLink.relationship)}: ${pendingLink.status === 'pending' ? 'ننتظر موافقة صاحب الحساب. ' : 'موافقة صاحب الحساب محفوظة. '}${pendingLink.adminReview === 'approved' ? 'اعتمدت الإدارة الطلب.' : 'مراجعة الإدارة لم تكتمل بعد.'} لا توجد مدة مراجعة مضمونة معروضة حاليًا؛ يمكنك الاستفسار من المساعدة أدناه.`; }
  else if (state.links.some(link => link.adminReview === 'rejected')) { title = 'طلب الربط لم يُعتمد'; detail = 'راجع حالة الطلب أدناه. يمكنك الاستفسار من المساعدة قبل إلغاء الربط أو طلب رمز جديد.'; }
  else if (state.invites?.length) { title = 'شارك رمز الربط مع الشخص المقصود'; detail = 'بعد أن يدخل فرد الأسرة الرمز، سيظهر طلب باسمه لتقبله أو ترفضه. تبقى مراجعة الإدارة مطلوبة أيضًا.'; }
  return <section className="fb-next-action" aria-label="خطوتك التالية"><span>خطوتك التالية</span><h2>{title}</h2><p>{detail}</p><ol aria-label="مراحل مشاركة الأهل"><li className="done">حساب مستقل</li><li className={ready ? 'done' : ''}>ربط بموافقة العضو والإدارة</li><li className={active ? 'done' : ''}>مساحة بموافقة المشاركين</li></ol><a href={`#${target}`}>الانتقال إلى الخطوة</a></section>;
}

export function FamilyConnectionCode({ code, copied = false, onCopy }: { code: string; copied?: boolean; onCopy?: () => void }) {
  const formatted = code.replace(/[\s-]/g, '').toUpperCase().match(/.{1,4}/g)?.join('-') ?? code;
  return <div className="fb-connection-code"><label htmlFor="fb-member-connection-code">رمز ربط العضو</label><input id="fb-member-connection-code" readOnly dir="ltr" value={formatted} onFocus={event => event.currentTarget.select()} spellCheck={false} /><button type="button" className="btn-primary" onClick={onCopy}><Copy size={16} /> {copied ? 'نُسخ رمز الربط' : 'نسخ رمز الربط'}</button></div>;
}

export function FamilyLinkRequestForm({ value, onChange, onSubmit, busy = false }: { value: string; onChange: (value: string) => void; onSubmit: (code: string) => void; busy?: boolean }) {
  return <form className="fb-claim-form" onSubmit={event => { event.preventDefault(); if (validConnectionCode(value)) onSubmit(connectionCode(value)); }}><label htmlFor="fb-invite-code">رمز ربط العضو</label><p>اطلب الرمز من صاحب الحساب، ثم أدخله هنا. سيظهر له اسمك ليقبل الربط أو يرفضه. يحتاج تفعيل الربط أيضًا مراجعة الإدارة واعتمادها.</p><input id="fb-invite-code" dir="ltr" value={value} maxLength={18} onChange={event => onChange(event.target.value.toUpperCase())} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="XXXX-XXXX-XXXX" aria-describedby="fb-code-hint"/><small id="fb-code-hint">١٢ حرفًا ورقمًا · ليس رقم الهوية الوطنية</small><button type="submit" className="btn-secondary" disabled={busy || !validConnectionCode(value)}><Link2 size={15}/> إرسال طلب الربط</button></form>;
}

export function FamilyLinkSummary({ link, guardian = false, busy = false, onApprove, onRevoke }: { link: FamilyLink; guardian?: boolean; busy?: boolean; onApprove: () => void; onRevoke: () => void }) {
  const label = guardian ? link.memberName : link.familyName || relation(link.relationship);
  const pendingMember = link.owner && link.status === 'pending';
  return <article className={'fb-linked-person fb-link-review-' + (link.adminReview ?? 'pending')}><span className="fb-linked-avatar"><UsersRound size={19}/></span><div className="fb-linked-details"><strong>{label}</strong><small>{relation(link.relationship)}</small><span className={'fb-link-status' + (familyLinkReady(link) ? ' fb-link-ready' : '')}>{familyLinkStatus(link)}</span><div className="fb-link-checks" aria-label="موافقات الربط"><span>{link.status === 'active' ? <Check size={12}/> : <Clock3 size={12}/>} {link.status === 'active' ? 'موافقة العضو محفوظة' : 'بانتظار موافقة العضو'}</span><span>{link.adminReview === 'approved' ? <Check size={12}/> : link.adminReview === 'rejected' ? <X size={12}/> : <Clock3 size={12}/>} {link.adminReview === 'approved' ? 'اعتمدت الإدارة الربط' : link.adminReview === 'rejected' ? 'لم تعتمد الإدارة الربط' : 'بانتظار مراجعة الإدارة'}</span></div><p className="fb-caption">{familyLinkReady(link) ? (guardian ? `الربط مع ${link.memberName} جاهز. انتظر دعوة مساحة يوافق عليها الطرفان ثم اقبلها بنفسك.` : `يمكنك إشراك ${label} في مساحة بعد موافقة طرفي التعارف.`) : pendingMember ? 'راجع الشخص المقصود، ثم اقبل طلبه أو ارفضه هنا.' : link.adminReview === 'rejected' ? 'استفسر من المساعدة عن الطلب أو ألغِ الربط.' : 'لا يلزم إعادة إدخال الرمز. تابع الموافقات أعلاه؛ لا توجد مدة مراجعة مضمونة.'}</p></div><div className="fb-link-actions">{pendingMember && <button className="fb-link-accept" disabled={busy} onClick={onApprove}><Check size={14}/> قبول</button>}<button className={pendingMember ? 'fb-link-decline' : 'fb-icon-action'} disabled={busy} aria-label={`${pendingMember ? 'رفض طلب ربط' : 'إلغاء ربط'} ${label}`} onClick={onRevoke}>{pendingMember ? 'رفض' : <X size={17}/>}</button></div></article>;
}

function InviteCard({ token, code, expiresAt, onDismiss }: { token: string; code?: string; expiresAt: string; onDismiss: () => void }) {
  const [qr, setQr] = useState(''), [copied, setCopied] = useState<'code'|'link'|null>(null), [error, setError] = useState('');
  const url = familyInviteUrl(token, import.meta.env.VITE_MARRIAGE_FAMILY_PUBLIC_URL?.trim() || window.location.origin);
  useEffect(() => { let active = true; setQr(''); if (url) void qrDataUrl(url).then(value => { if (active) setQr(value); }).catch(() => { if (active) setError('رمز QR غير متاح الآن؛ يمكنك نسخ الرابط أو رمز الربط.'); }); return () => { active = false; }; }, [url]);
  async function copy(kind: 'code'|'link') { const value = kind === 'code' && code ? code.replace(/[\s-]/g, '').toUpperCase() : url; if (!value) return; try { await navigator.clipboard.writeText(value); setCopied(kind); } catch { setError('تعذّر النسخ التلقائي. يمكنك تحديد الرمز أو الرابط ونسخه.'); } }
  return <section className="fb-invite" aria-label="رمز ربط الأسرة الخاص"><button className="fb-invite-dismiss" onClick={onDismiss} aria-label="إخفاء رمز الربط"><X size={16} /></button><h3>حسابه أولًا، ثم الربط بإذنك</h3><p>يسجّل فرد الأسرة حسابه بشكل مستقل، ثم يدخل رمز ربطك أدناه. سيصلك طلب باسمه لتقبله أو ترفضه؛ الرمز وحده لا يمنحه الوصول.</p>{code && <FamilyConnectionCode code={code} copied={copied === 'code'} onCopy={() => void copy('code')} />}<span className="fb-invite-expiry"><Clock3 size={13} /> صالح حتى {day(expiresAt)}، {time(expiresAt)} · استخدام واحد</span>{url ? <details className="fb-invite-alternatives"><summary>استخدام QR أو رابط بدلًا من الرمز</summary>{qr && <img src={qr} className="fb-qr" width="176" height="176" alt="رمز QR لطلب ربط فرد من الأسرة" />}<button type="button" className="btn-secondary" onClick={() => void copy('link')}><Copy size={15} /> {copied === 'link' ? 'نُسخ رابط الربط' : 'نسخ رابط الربط'}</button><input aria-label="رابط ربط الأسرة" readOnly value={url} dir="ltr" onFocus={event => event.currentTarget.select()} /></details> : <p className="fb-caption">الرابط وQR غير متاحين في هذا الإصدار. شارك رمز الربط أعلاه وأدخله من صفحة جسر الأهل.</p>}{error && <p role="status">{error}</p>}<small>شارك الرمز مع الشخص المقصود فقط. لا يتطلب الربط رقم الهوية الوطنية.</small></section>;
}

export function FamilyRoomSummary({ room, onOpen, onApprove, onAccept, busy = false }: { room: FamilyRoom; onOpen?: () => void; onApprove?: (agree: boolean) => void; onAccept?: (agree: boolean) => void; busy?: boolean }) {
  return <article id={`fb-room-${room.id}`} tabIndex={-1} className={'fb-room-card fb-room-' + room.status}><div className="fb-room-card-top"><span className="fb-room-mark"><UsersRound size={20} /></span><div><h3>{room.title}</h3><span className="fb-room-state">{room.leftByMe ? 'غادرت هذه المساحة' : room.status === 'active' ? 'مساحة مفتوحة' : room.status === 'closed' ? 'مساحة مغلقة' : room.needsApproval ? 'بانتظار موافقتك على المشاركين' : room.needsAcceptance ? 'دعوة بانتظار قبولك' : 'بانتظار بقية الموافقات'}</span></div>{room.unread > 0 && room.canRead && <span className="fb-unread" aria-label={`${room.unread} رسائل غير مقروءة`}>{ar.format(room.unread)}</span>}</div><div className="fb-roster">{room.participants.map(person => <span key={person.id}><span className="fb-person-dot" aria-hidden="true">{Array.from(person.name)[0]}</span>{person.name}<small>{person.left ? 'غادر المساحة' : person.role === 'family' ? 'من الأسرة' : 'طرف التعارف'}</small>{person.role === 'family' && !person.accepted && <Clock3 size={11} aria-label="لم يقبل الدعوة بعد" />}</span>)}</div>{room.needsApproval && onApprove && <div className="fb-room-approval"><p>راجع الأسماء أعلاه. موافقتك تخص هذه المساحة وهؤلاء المشاركين فقط.</p><div><button className="btn-primary" disabled={busy} onClick={() => onApprove(true)}><Check size={15} /> أوافق على المشاركين</button><button className="fb-text-button" disabled={busy} onClick={() => onApprove(false)}>رفض</button></div></div>}{room.needsAcceptance && onAccept && <div className="fb-room-approval"><p>دعوة لمحادثة عائلية منفصلة. قبولك يتيح لك الرسائل في هذه المساحة وحدها.</p><div><button className="btn-primary" disabled={busy} onClick={() => onAccept(true)}><Check size={15} /> قبول الدعوة</button><button className="fb-text-button" disabled={busy} onClick={() => onAccept(false)}>اعتذار</button></div></div>}{room.canRead && onOpen ? <button className="fb-room-open" type="button" onClick={onOpen}><MessageCircle size={16} /> فتح المحادثة <ChevronLeft size={17} /></button> : <p className="fb-room-footnote"><LockKeyhole size={12} /> {room.leftByMe ? 'غادرت المساحة وتوقف وصولك. العودة تحتاج مساحة جديدة بموافقات جديدة.' : room.status === 'closed' ? 'توقف الوصول إلى هذه المساحة.' : room.status === 'pending' ? 'تفتح بعد موافقة الطرفين وقبول أفراد الأسرة المدعوين.' : 'لست ضمن المشاركين؛ يمكنك إدارة الإذن دون قراءة الرسائل.'}</p>}</article>;
}

function FamilyChat({ room, request, guardian, onBack, onClose, onLeave, initialMessage }: { initialMessage?:string;room: FamilyRoom; request: FamilyRequest; guardian: boolean; onBack: () => void; onClose: () => void; onLeave: () => void }) {
  const [rows, setRows] = useState<FamilyMessage[]>([]), [draft, setDraft] = useState(''), [error, setError] = useState('');
  const [loading, setLoading] = useState(true), [access, setAccess] = useState(true), [older, setOlder] = useState(false), [hasOlder, setHasOlder] = useState(false);
  const [pending, setPending] = useState<{ body: string; clientId: string; failed: boolean } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null), atBottom = useRef(true), latestRead = useRef(''), generation = useRef(0), sending = useRef(false), currentRows = useRef<FamilyMessage[]>([]);
  const readVisible = useCallback(() => {
    const last = currentRows.current.filter(item => !item.senderIsMe).at(-1), container = log.current;
    if (!last || !container || latestRead.current === last.id || document.hidden || document.querySelector('dialog[open]')) return;
    const element = container.querySelector<HTMLElement>(`[data-message-id="${last.id}"]`);
    if (!element) return;
    const bounds = element.getBoundingClientRect(), area = container.getBoundingClientRect(), viewport = window.visualViewport;
    const top = Math.max(area.top, viewport?.offsetTop ?? 0), bottom = Math.min(area.bottom, (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight));
    if (bounds.height <= 0 || bounds.bottom <= top || bounds.bottom > bottom + 1) return;
    latestRead.current = last.id;
    void request('read', { roomId: room.id, messageId: last.id }).catch(() => { if (latestRead.current === last.id) latestRead.current = ''; });
  }, [request, room.id]);
  const refresh = useCallback(async () => {
    const ticket = generation.current;
    try {
      const value = await request('messages', { roomId: room.id });
      if (ticket !== generation.current || document.hidden) return;
      if (!Array.isArray(value)) throw Error('تعذّر فتح رسائل المساحة.');
      const messages = value as FamilyMessage[];
      const known = new Map(currentRows.current.map(item => [item.id, item])); messages.forEach(item => known.set(item.id, item));
      const merged = Array.from(known.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      currentRows.current = merged; setRows(merged); setLoading(false); setAccess(true); setError('');
      if (currentRows.current.length <= 50) setHasOlder(messages.length === 50);
    } catch (cause) { if (ticket === generation.current) { currentRows.current = []; setRows([]); setAccess(false); setLoading(false); setError(message(cause)); } }
  }, [request, room.id]);
  useLayoutEffect(() => {
    generation.current += 1; currentRows.current = []; setRows([]); setPending(null); setDraft(''); setError(''); setLoading(true); setAccess(true); latestRead.current = ''; sending.current = false;
    let fetching: number | null = null;
    async function load() { const ticket = generation.current; if (document.hidden || fetching === ticket) return; fetching = ticket; try { await refresh(); } finally { if (fetching === ticket) fetching = null; } }
    function visible() { generation.current += 1; currentRows.current = []; setRows([]); setAccess(false); if (!document.hidden) { fetching = null; setLoading(true); void load(); } }
    void load(); const timer = window.setInterval(() => void load(), 5000); document.addEventListener('visibilitychange', visible);
    return () => { generation.current += 1; clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [refresh]);
  useLayoutEffect(() => { if (atBottom.current && log.current) log.current.scrollTop = log.current.scrollHeight; const frame = requestAnimationFrame(readVisible); return () => cancelAnimationFrame(frame); }, [rows, pending, preparing, readVisible]);
  useLayoutEffect(() => {
    const element = log.current;
    if (!element) return;
    const observer = new ResizeObserver(() => { if (atBottom.current) element.scrollTop = element.scrollHeight; readVisible(); });
    observer.observe(element);
    return () => observer.disconnect();
  }, [readVisible]);
  useEffect(() => {
    window.addEventListener('scroll', readVisible, true); window.addEventListener('resize', readVisible);
    window.visualViewport?.addEventListener('resize', readVisible); window.visualViewport?.addEventListener('scroll', readVisible);
    return () => { window.removeEventListener('scroll', readVisible, true); window.removeEventListener('resize', readVisible); window.visualViewport?.removeEventListener('resize', readVisible); window.visualViewport?.removeEventListener('scroll', readVisible); };
  }, [readVisible]);
  const [jumpTarget,setJumpTarget]=useState(initialMessage);
  useEffect(()=>{setJumpTarget(initialMessage);},[initialMessage]);
  useEffect(()=>{
    if(!jumpTarget||loading||!access||!log.current)return;
    atBottom.current=false;
    const row=Array.from(log.current.querySelectorAll<HTMLElement>('[data-message-id]')).find(el=>el.dataset.messageId===jumpTarget);
    if(row){log.current.scrollTop+=row.getBoundingClientRect().top-log.current.getBoundingClientRect().top-20;row.focus({preventScroll:true});setJumpTarget(undefined);}
    else if(hasOlder&&!older&&!error)void loadOlder();
    else if(!hasOlder){setError('الرسالة لم تعد متاحة في هذه المساحة.');setJumpTarget(undefined);}
  },[jumpTarget,rows,loading,access,hasOlder,older,error]);
  async function send(retry = false) {
    if (sending.current || !room.canSend || !access) return;
    const item = retry ? pending : { body: draft.trim(), clientId: crypto.randomUUID(), failed: false };
    if (!item?.body || item.body.length > 1000) return;
    const ticket = generation.current; sending.current = true; setPending({ ...item, failed: false }); if (!retry) setDraft(''); atBottom.current = true;
    try { await request('send', { roomId: room.id, body: item.body, clientId: item.clientId }); if (ticket !== generation.current) return; setPending(null); await refresh(); }
    catch (cause) { if (ticket === generation.current) { setPending({ ...item, failed: true }); setError(message(cause)); } }
    finally { if (ticket === generation.current) sending.current = false; }
  }
  async function loadOlder() {
    if (older || !rows.length) return;
    const ticket = generation.current; setOlder(true);
    const height = log.current?.scrollHeight ?? 0;
    try { const result = await request('messages', { roomId: room.id, beforeId: rows[0].id }); if (ticket !== generation.current || !Array.isArray(result)) return; const oldRows = result as FamilyMessage[]; currentRows.current = [...oldRows.filter(item => !currentRows.current.some(existing => existing.id === item.id)), ...currentRows.current]; setRows(currentRows.current); setHasOlder(oldRows.length === 50); requestAnimationFrame(() => { if (ticket === generation.current && log.current) log.current.scrollTop += log.current.scrollHeight - height; }); }
    catch (cause) { if (ticket === generation.current) setError(message(cause)); }
    finally { if (ticket === generation.current) setOlder(false); }
  }
  return <><section className="fb-chat" aria-label={`المحادثة العائلية: ${room.title}`}><header className="fb-chat-header"><button type="button" className="fb-back" onClick={onBack} aria-label="العودة لمساحات الأسرة"><ArrowRight size={20} /></button><div><h2>{room.title}</h2><p>{room.participants.filter(item => !item.left).map(item => item.name).join(' · ')}</p></div><KeyboardDismiss/><button className="fb-text-button" type="button" onClick={onClose}>إغلاق للجميع</button></header><div className="fb-chat-privacy"><LockKeyhole size={13} /> هذه المساحة منفصلة عن محادثة التعارف الخاصة</div><div className="fb-chat-tools"><button type="button" disabled={!access || !room.canSend || Boolean(pending) || Boolean(draft.trim())} onClick={() => setPreparing(true)}>{guardian ? 'تجهيز خطوة قادمة' : 'تجهيز تعريف أو خطوة قادمة'}</button><a href="#fb-chat-support">مساعدة أو إبلاغ</a></div><div className="fb-chat-log" ref={log} role="log" aria-label="رسائل جسر الأهل" onScroll={() => { if (log.current) atBottom.current = log.current.scrollHeight - log.current.scrollTop - log.current.clientHeight < 12; readVisible(); }}>
    {hasOlder && <button className="fb-history" disabled={older} onClick={() => void loadOlder()}>{older ? 'جارٍ التحميل…' : 'الرسائل السابقة'}</button>}{loading && <FamilyLoading view="chat"/>}{!loading && access && !rows.length && <div className="fb-first-message"><HeartHandshake size={28} /><h3>مساحة لبداية واضحة</h3><p>ابدؤوا برسالة ترحيب. ويمكنكم تجهيز اقتراح للخطوة القادمة، ومراجعته قبل إرساله.</p></div>}
    {rows.map((item, index) => <div key={item.id}>{(!index || day(rows[index - 1].createdAt) !== day(item.createdAt)) && <p className="fb-message-day">{day(item.createdAt)}</p>}<article tabIndex={-1} data-message-id={item.id} className={'fb-message' + (item.senderIsMe ? ' fb-message-mine' : '')}><strong>{item.senderIsMe ? 'أنت' : item.senderName}</strong><p dir="auto">{item.body}</p><small>{time(item.createdAt)}{item.senderIsMe && <Check size={12} aria-label="أُرسلت" />}</small></article></div>)}
    {pending && !rows.some(item => item.clientId === pending.clientId) && <article className="fb-message fb-message-mine fb-message-pending"><strong>أنت</strong><p dir="auto">{pending.body}</p><small>{pending.failed ? 'لم تُرسل' : 'جارٍ الإرسال…'}</small>{pending.failed && <div><button type="button" onClick={() => void send(true)}>إعادة المحاولة</button><button type="button" onClick={() => { setDraft(pending.body); setPending(null); }}>تعديل</button></div>}</article>}
  </div>{error && <p className="fb-error" role="alert">{error}</p>}<form className="fb-composer" onSubmit={event => { event.preventDefault(); void send(); }}><button type="submit" className="fb-send" onPointerDown={event => { if (event.pointerType === 'touch') event.preventDefault(); }} disabled={!draft.trim() || Boolean(pending) || !access || !room.canSend} aria-label="إرسال رسالة إلى الأسرة"><Send size={18} /><span>إرسال</span></button><textarea ref={composer} enterKeyHint="enter" aria-label="رسالتك إلى الأسرة" placeholder="رسالتك إلى الأسرة…" maxLength={1000} rows={draft.includes('\n') ? 3 : 1} value={draft} disabled={!access || !room.canSend} onChange={event => setDraft(event.target.value)} /></form></section>
    <section id="fb-chat-support" className="fb-chat-support" tabIndex={-1}><button type="button" className="btn-secondary" onClick={onLeave}>مغادرة المساحة لنفسي</button><SupportContact subject="مساعدة أو بلاغ في جسر الأهل" context={`المساحة العائلية: ${room.title}`}/><p>الرجوع يترك المساحة مفتوحة. «مغادرة المساحة لنفسي» يوقف وصولك وحدك مع بقاء رسائلك للآخرين؛ العودة تحتاج مساحة جديدة بموافقات جديدة. «إغلاق للجميع» يوقف وصول الجميع. اختر بنفسك التفاصيل التي ترسلها للمساعدة.</p></section>
    {access && room.canSend && <FamilyPreparation room={room} guardian={guardian} open={preparing} onClose={() => setPreparing(false)} onDraft={body => { setDraft(body); setPreparing(false); requestAnimationFrame(() => composer.current?.focus()); }}/>} </>;
}

type ConfirmAction = { title: string; description: string; action: Parameters<FamilyRequest>[0]; payload: Record<string, unknown> };

function FamilyHub({ request, onBack, source, connectionId: initialConnection, name, guardian = false, testMode = false, initialRoom, initialMessage }: { initialRoom?:string;initialMessage?:string;request: FamilyRequest; onBack?: () => void; source?: CommunitySource; connectionId?: string; name?: string; guardian?: boolean; testMode?: boolean }) {
  const [state, setState] = useState<FamilyState | null>(null), [connections, setConnections] = useState<Connection[]>([]), [connectionId, setConnectionId] = useState(initialConnection ?? '');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [retry, setRetry] = useState(0);
  const [invite, setInvite] = useState<{ token: string; code?: string; expiresAt: string } | null>(null), [relationship, setRelationship] = useState('father'), [claimToken, setClaimToken] = useState('');
  const [roomId, setRoomId] = useState<string | null>(null), [title, setTitle] = useState(''), [selected, setSelected] = useState<string[]>([]), [create, setCreate] = useState(false), [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const generation = useRef(0), mutation = useRef(false), heading = useRef<HTMLHeadingElement>(null), roomTitle = useRef<HTMLInputElement>(null);
  const previousLinks = useRef<FamilyState['links']>([]);
  const load = useCallback(async () => {
    const ticket = generation.current; const result = await request('state', connectionId ? { connectionId } : {});
    if (ticket !== generation.current || document.hidden) return;
    if (!isState(result)) throw Error('تعذّر فتح جسر الأهل.');
    const changed = result.links.find(link => previousLinks.current.some(before => before.id === link.id && (before.status !== link.status || before.adminReview !== link.adminReview)));
    if (changed) setNotice(familyLinkReady(changed) ? 'اكتملت موافقة العضو واعتماد الإدارة. أصبح الربط جاهزًا لدعوات المساحات العائلية.' : changed.adminReview === 'rejected' ? 'لم تعتمد الإدارة طلب الربط. يمكنك إلغاء الربط أو مراجعة الدعم عند الحاجة.' : changed.adminReview === 'approved' ? 'اعتمدت الإدارة الربط. ننتظر موافقة العضو لإكماله.' : changed.status === 'active' ? 'موافقة العضو محفوظة. يبقى الربط بانتظار مراجعة الإدارة.' : 'طلب الربط بانتظار موافقة العضو ومراجعة الإدارة.');
    else if (guardian && previousLinks.current.some(link => link.status === 'pending' && !result.links.some(current => current.id === link.id))) setNotice('انتهى طلب الربط دون اعتماده. يمكنك طلب رمز جديد من العضو عند الحاجة.');
    previousLinks.current = result.links; setState(result); setError('');
  }, [request, connectionId, guardian]);
  useLayoutEffect(() => { previousLinks.current = []; generation.current += 1; setState(null); setError(''); setBusy(false); mutation.current = false; setRoomId(null); setCreate(false); setSelected([]); setConfirm(null); setInvite(null); setNotice(''); heading.current?.focus({ preventScroll: true }); let pending: number | null = null;
    async function refresh() { const ticket = generation.current; if (document.hidden || pending === ticket || mutation.current) return; pending = ticket; try { await load(); } catch (cause) { if (ticket === generation.current) { setState(null); setError(message(cause)); } } finally { if (pending === ticket) pending = null; } }
    function visible() { generation.current += 1; setState(null); setInvite(null); mutation.current = false; setBusy(false); if (!document.hidden) { pending = null; void refresh(); } }
    void refresh(); const timer = window.setInterval(() => void refresh(), 5000); document.addEventListener('visibilitychange', visible);
    return () => { generation.current += 1; clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [load, retry]);
  useEffect(() => { let active = true; setConnections([]); if (source) void source.inbox().then(items => { if (active) setConnections(items.filter(item => item.status === 'accepted' && source.familyEligibleConnection?.(item.id) !== false)); }).catch(() => {}); return () => { active = false; }; }, [source]);
  async function act(action: Parameters<FamilyRequest>[0], payload: Record<string, unknown>, success: string) {
    if (mutation.current) return; const ticket = ++generation.current; mutation.current = true; setBusy(true); setError(''); setNotice('');
    try { const result = await request(action, payload); if (ticket !== generation.current) return;
      if (action === 'invite_link' && result && typeof result === 'object' && 'token' in result && typeof result.token === 'string' && 'expiresAt' in result && typeof result.expiresAt === 'string') setInvite({ token: result.token, code: 'code' in result && typeof result.code === 'string' ? result.code : undefined, expiresAt: result.expiresAt });
      if (action === 'create_room') { setCreate(false); setSelected([]); setTitle(''); }
      if (action === 'claim_link') setClaimToken('');
      if (action === 'revoke_invite') setInvite(null);
      if (action === 'delete_family') { if (!testMode) feedback('success'); setState(null); setConfirm(null); onBack?.(); return; }
      if (action === 'export') { const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'nisfayn-family-bridge.json'; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
      if (action === 'close_room' || action === 'leave_room' || action === 'consent' && payload.agree === false) setRoomId(null);
      await load(); if (ticket === generation.current) { if (!testMode && !['state', 'messages', 'read', 'export'].includes(action)) feedback('success'); setNotice(success); setConfirm(null); }
    } catch (cause) { if (ticket === generation.current) { setConfirm(null); setError(message(cause)); } }
    finally { if (ticket === generation.current) { mutation.current = false; setBusy(false); } }
  }
  const handledRoom=useRef<string|undefined>(undefined);
  useEffect(()=>{if(!initialRoom||!state||handledRoom.current===initialRoom)return;handledRoom.current=initialRoom;
    const target=state.rooms.find(r=>r.id===initialRoom);
    if(target?.canRead&&target.status==='active')setRoomId(initialRoom);
    else if(target?.status==='pending'){
      setNotice('المساحة بانتظار الموافقات. راجع المشاركين وحالة دعوتك أدناه.');
      document.getElementById(`fb-room-${initialRoom}`)?.focus();
    }
    else setNotice('هذه المساحة لم تعد متاحة لك. يمكنك مراجعة المساحات الحالية.');
  },[state,initialRoom]);
  const room = state?.rooms.find(item => item.id === roomId);
  const bridge = state?.bridge;
  const eligibleFamily = Boolean(bridge?.participants.some(person => person.role === 'family'));
  useEffect(() => {
    const allowed = new Set(bridge?.participants.map(person => person.id) ?? []);
    setSelected(current => current.every(id => allowed.has(id)) ? current : current.filter(id => allowed.has(id)));
    if (!eligibleFamily) setCreate(false);
  }, [bridge?.participants, eligibleFamily]);
  function closeRoom(item: FamilyRoom) { setConfirm({ title: 'إغلاق المساحة لجميع المشاركين؟', description: 'هذا ليس خروجًا شخصيًا. يتوقف وصول الجميع إلى هذه الرسائل، ويمكن اقتراح مساحة جديدة بموافقات جديدة. للعودة فقط استخدم زر الرجوع. يمكنك طلب المساعدة أو الإبلاغ قبل الإغلاق.', action: 'close_room', payload: { roomId: item.id } }); }
  return <FamilyFrame onBack={roomId ? () => setRoomId(null) : onBack} guardian={guardian}>
    {room?.canRead && room.status === 'active' ? <FamilyChat initialMessage={room.id===initialRoom?initialMessage:undefined} key={room.id} room={room} request={request} guardian={guardian} onBack={() => setRoomId(null)} onClose={() => closeRoom(room)} onLeave={() => setConfirm({ title: 'مغادرة المساحة لنفسك؟', description: 'يتوقف وصولك إلى هذه المحادثة وحدك، وتبقى المساحة ورسائلك متاحة للمشاركين الآخرين. لن تعود إلى سجلها بالربط من جديد؛ العودة تحتاج مساحة جديدة بموافقات جديدة. لا تُسحب موافقة جسر الأهل بهذا الإجراء.', action: 'leave_room', payload: { roomId: room.id } })} /> : <>
      <section className="fb-hero"><div className="fb-hero-top"><span><LockKeyhole size={13} /> مساحة للأهل، بإذن الطرفين</span><HeartHandshake size={26} strokeWidth={1.35} /></div><p className="fb-eyebrow">من التفاهم، إلى خطوة رسمية</p><h1 ref={heading} tabIndex={-1}>جسر <em>الأهل</em></h1><p>أشخاص تختارونهم. حديث مستقل.<br />ومساحة تجمعكم على الخطوة القادمة.</p><div className="fb-hero-foot"><span><ShieldCheck size={14} /> محادثتك الخاصة تبقى خاصة</span><span>وُدَين</span></div></section>
      {testMode && <p className="fb-test-note">وضع التجربة · الروابط والحسابات التجريبية لا تثبت صفة ولي شرعي.</p>}
      <p className="fb-intro"><LockKeyhole size={16} /> لا يقرأ الأهل محادثة التعارف أو الصور الخاصة أو جواز الجاهزية. يصلون فقط إلى المساحات التي دُعوا إليها.</p>
      {error && <div className="fb-feedback fb-error" role="alert"><p>{error}</p><button className="fb-text-button" onClick={() => setRetry(value => value + 1)}>إعادة المحاولة</button></div>}{notice && <p className="fb-feedback fb-success" role="status"><Check size={16} />{notice}</p>}
      {!state && !error && <FamilyLoading view="hub"/>}
      {state && <>
        {guardian && <p className="fb-role-note">دورك المساندة وتنسيق الخطوة القادمة. يختار صاحب الحساب من يشاركه، وتبقى قراراته ومحادثاته الخاصة له. الربط لا يثبت الولاية أو الهوية.</p>}
        <FamilyNextAction state={state} guardian={guardian}/>
        <section className="fb-section" aria-labelledby="fb-family-title"><div className="fb-section-heading"><span><UsersRound size={21} /></span><div><h2 id="fb-family-title">{guardian ? 'ارتباطاتي العائلية' : 'الأهل الذين أختارهم'}</h2><p>{guardian ? 'يبدأ كل ربط بطلب، ويؤكده صاحب الحساب' : 'ربط واضح، دون مشاركة تلقائية للمحادثات'}</p></div></div>
          {state.links.length ? <div className="fb-links">{state.links.map(link => <FamilyLinkSummary key={link.id} link={link} guardian={guardian} busy={busy} onApprove={() => void act('approve_link', { linkId: link.id }, link.adminReview === 'approved' ? 'اكتملت موافقتك واعتماد الإدارة. الربط جاهز لدعوات المساحات العائلية.' : 'حُفظت موافقتك. لا يُفعّل الربط حتى تعتمد الإدارة الطلب.')} onRevoke={() => setConfirm({ title: link.owner && link.status === 'pending' ? 'رفض طلب الربط؟' : 'إلغاء الربط العائلي؟', description: link.status === 'pending' ? 'لن يُربط هذا الحساب بك ولن يتمكن من الوصول إلى مساحاتك. يمكن تقديم طلب جديد برمز جديد لاحقًا.' : 'يتوقف وصول فرد الأسرة، وتُغلق المساحات التي كان مدعوًا إليها. يحتاج أي ربط لاحق دعوة وموافقة جديدتين.', action: 'revoke_link', payload: { linkId: link.id } })} />)}</div> : <p className="fb-empty-inline">{guardian ? 'حساب الأهل جاهز. أدخل رمز ربط العضو لتبدأ طلب الربط.' : 'اختر من أسرتك من يساندك في الخطوة القادمة.'}</p>}
          {guardian ? <FamilyLinkRequestForm value={claimToken} onChange={setClaimToken} busy={busy} onSubmit={code => void act('claim_link', { code }, 'أُرسل طلب الربط. ينتظر موافقة العضو واعتماد الإدارة.')} /> : <div className="fb-invite-controls"><label className="fb-field"><span>صلة القرابة</span><select aria-label="صلة قرابة المدعو" value={relationship} onChange={event => setRelationship(event.target.value)} disabled={busy}>{relationships.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label><button className="btn-secondary" disabled={busy || state.links.length >= 3} onClick={() => void act('invite_link', { relationship }, 'جهزنا رمز ربطك الخاص. أعطه لفرد الأسرة ثم راجع طلبه هنا.') }><UserPlus size={16} /> إنشاء رمز ربط</button>{state.links.length >= 3 && <small>يمكن ربط ثلاثة أفراد من الأسرة. ألغِ ربطًا قائمًا لإضافة شخص آخر.</small>}</div>}
          <p className="fb-caption">كل ربط جديد يحتاج موافقة العضو واعتماد الإدارة قبل دعوة فرد الأسرة إلى أي مساحة. المراجعة لا تُعد توثيقًا قانونيًا للهوية أو الولاية، وصلة القرابة إفادة منكما.</p>
          {!guardian && Boolean(state.invites?.length) && <div className="fb-pending-invites"><h3>رموز ربط لم تُستخدم بعد</h3>{state.invites!.map(item => <div key={item.id}><span>{relation(item.relationship)}<small>تنتهي {day(item.expiresAt)}، {time(item.expiresAt)}</small></span><button type="button" className="fb-text-button" disabled={busy} onClick={() => void act('revoke_invite', { inviteId: item.id }, 'أُلغي رمز الربط ورابطه. لم يعودا صالحين للاستخدام.')}>إلغاء الرمز</button></div>)}</div>}
        </section>
        {invite && <InviteCard token={invite.token} code={invite.code} expiresAt={invite.expiresAt} onDismiss={() => setInvite(null)} />}
        {!guardian && <section className="fb-section" aria-labelledby="fb-bridge-title"><div className="fb-section-heading"><span><HeartHandshake size={21} /></span><div><h2 id="fb-bridge-title">نفتح الجسر باتفاقكما</h2><p>خطوة عائلية واضحة، يوافق عليها الطرفان</p></div></div>{!initialConnection && <label className="fb-field"><span>التعارف الذي تريد الانتقال معه للأهل</span><select aria-label="اختر التعارف لجسر الأهل" value={connectionId} onChange={event => setConnectionId(event.target.value)}><option value="">اختر تعارفًا مقبولًا</option>{connections.map(item => <option value={item.id} key={item.id}>{item.person.alias}</option>)}</select></label>}
          {bridge ? <><div className="fb-consent-track"><span className={bridge.mine ? 'done' : ''}><i>{bridge.mine ? <Check size={15} /> : '١'}</i><strong>موافقتك</strong><small>{bridge.mine ? 'موافق' : 'بانتظارك'}</small></span><div aria-hidden="true"/><span className={bridge.peer ? 'done' : ''}><i>{bridge.peer ? <Check size={15} /> : '٢'}</i><strong>{name || connections.find(item => item.id === connectionId)?.person.alias || 'الطرف الآخر'}</strong><small>{bridge.peer ? 'موافق' : 'بانتظار الموافقة'}</small></span></div><p className="fb-caption">الموافقة تتيح اقتراح مساحات عائلية. ستراجعان قائمة المشاركين وتوافقان عليها لكل مساحة، دون كشف محادثتكما الخاصة.</p>{!bridge.mine ? <button className="btn-primary fb-full" disabled={busy} onClick={() => void act('consent', { connectionId, agree: true }, 'سُجّلت موافقتك على جسر الأهل.')}><Check size={17} /> أوافق على إشراك الأهل</button> : <div className="fb-consented"><span><ShieldCheck size={16} /> {bridge.enabled ? 'أنتما جاهزان لاقتراح مساحة عائلية' : 'موافقتك محفوظة؛ ننتظر الطرف الآخر'}</span><button type="button" className="fb-text-button" disabled={busy} onClick={() => setConfirm({ title: 'سحب موافقتك على جسر الأهل؟', description: 'تُغلق المساحات العائلية لهذا التعارف، ويتوقف وصول الجميع إليها. لا تتغير محادثتكما الخاصة.', action: 'consent', payload: { connectionId, agree: false } })}>سحب الموافقة</button></div>}</> : <p className="fb-empty-inline">{connections.length ? 'اختر تعارفًا مقبولًا لتراجعوا هذه الخطوة معًا.' : 'تفتح هذه الخطوة عندما يكون لديك تعارف مقبول.'}</p>}
        </section>}
        <section className="fb-section fb-room-list" aria-labelledby="fb-rooms-title"><div className="fb-section-heading"><span><MessageCircle size={20} /></span><div><h2 id="fb-rooms-title">مساحات الأسرة</h2><p>ثنائية أو جماعية، بالمشاركين الذين تختارونهم</p></div>{!guardian && bridge?.enabled && eligibleFamily && <button type="button" className="fb-add-room" aria-label="اقتراح مساحة عائلية" onClick={() => setCreate(current => !current)}><Plus size={20} /></button>}</div>
          {!guardian && bridge?.enabled && !eligibleFamily && <p className="fb-caption">يظهر إنشاء المساحة بعد اكتمال موافقة العضو واعتماد الإدارة لربط أحد أفراد الأسرة.</p>}
          {create && bridge?.enabled && eligibleFamily && <form className="fb-create-room" onSubmit={event => { event.preventDefault(); void act('create_room', { connectionId, title: title.trim(), participantIds: selected }, 'اقتُرحت المساحة. تفتح بعد اكتمال الموافقات.'); }}><label className="fb-field"><span>اسم المساحة</span><input ref={roomTitle} aria-label="اسم المساحة العائلية" value={title} maxLength={80} required placeholder="مثل: تنسيق اللقاء العائلي" onChange={event => setTitle(event.target.value)} /></label><fieldset disabled={busy}><legend>من يشارك في هذه المساحة؟</legend>{bridge.participants.map(person => <label className="fb-roster-choice" key={person.id}><input type="checkbox" checked={selected.includes(person.id)} onChange={() => setSelected(current => current.includes(person.id) ? current.filter(id => id !== person.id) : current.length < 6 ? [...current, person.id] : current)} /><span><strong>{person.name}</strong><small>{person.role === 'member' ? 'طرف التعارف' : 'من الأسرة'}</small></span></label>)}</fieldset><p className="fb-caption">من شخصين إلى ستة. ستظهر الأسماء للطرف الآخر ليوافق عليها، ثم يقبل كل فرد من الأسرة دعوته. من لم يُختَر لا يقرأ الرسائل، حتى إن كان صاحب الحساب.</p><button className="btn-primary fb-full" disabled={busy || selected.length < 2 || selected.length > 6 || !title.trim() || !bridge.participants.some(person => person.role === 'family' && selected.includes(person.id))} type="submit"><Plus size={16} /> اقتراح المساحة · {ar.format(selected.length)} مشاركين</button></form>}
          {state.rooms.length ? <div className="fb-rooms">{state.rooms.map(item => <FamilyRoomSummary key={item.id} room={item} busy={busy} onOpen={() => setRoomId(item.id)} onApprove={agree => void act('approve_room', { roomId: item.id, agree }, agree ? 'تمت الموافقة على المشاركين.' : 'رُفضت المساحة وتوقف فتحها.')} onAccept={agree => void act('accept_room', { roomId: item.id, agree }, agree ? 'قُبلت دعوة المساحة.' : 'تم الاعتذار عن الدعوة.')} />)}</div> : <div className="fb-empty-rooms"><MessageCircle size={27} aria-hidden="true"/><h3>{guardian ? 'دعواتك العائلية تظهر هنا' : 'لكل خطوة، مساحة مناسبة'}</h3><p>{guardian ? 'عندما يوافق طرفا التعارف على المشاركين، تظهر دعوتك هنا لتراجع الأسماء وتقرر.' : !bridge ? 'اختر تعارفًا مقبولًا أولًا، ثم راجعا معًا خطوة إشراك الأهل.' : !bridge.enabled ? 'تبدأ المساحة بموافقتكما على إشراك الأهل، ثم مراجعة قائمة المشاركين.' : !eligibleFamily ? 'بعد اكتمال ربط أحد أفراد الأسرة، يمكنك اقتراح مساحة محددة المشاركين.' : 'اقترح اسمًا للخطوة القادمة واختر المشاركين. تفتح المحادثة بعد اكتمال الموافقات.'}</p>{!guardian && bridge?.enabled && eligibleFamily && !create && <button type="button" className="btn-secondary" onClick={() => { setCreate(true); requestAnimationFrame(() => roomTitle.current?.focus()); }}><Plus size={16}/> اقتراح مساحة عائلية</button>}</div>}
        </section>
        <details className="fb-help"><summary>من يرى ماذا في جسر الأهل؟</summary><p>أفراد الأسرة لا يظهرون في الاستكشاف ولا يقرأون المحادثات الشخصية أو صورها. لكل مساحة قائمة مشاركين ثابتة وموافقات مستقلة. إضافة شخص جديد تحتاج مساحة جديدة؛ لا نضيفه إلى سجل قديم.</p><p>يمكنك مغادرة مساحة لنفسك مع بقاء رسائلك للآخرين، أو إلغاء الربط أو سحب الموافقة أو إغلاق المساحة للجميع. يتوقف الوصول المعني بعدها، لكن لا يمكن استرجاع نسخة سبق لأحد المشاركين حفظها خارج التطبيق.</p></details>
        <div className="fb-account-actions"><button type="button" disabled={busy} onClick={() => void act('export', {}, 'جُهّزت نسخة بيانات جسر الأهل. احتفظ بها في مكان خاص.')}><Download size={15} /> نسخة من بيانات جسر الأهل</button>{guardian && <button type="button" disabled={busy} onClick={() => setConfirm({ title: 'حذف حساب الأهل وسحب الموافقة؟', description: 'تُزال بيانات حساب الأهل وروابطه ويتوقف الوصول إلى مساحاته. لا يحذف ذلك حسابات الأعضاء الآخرين. لا يمكن استرجاع نسخ سبق للمشاركين حفظها.', action: 'delete_family', payload: {} })}><Trash2 size={15} /> حذف حساب الأهل</button>}</div>
      </>}
      <SupportContact subject="مساعدة في جسر الأهل" context="ربط الأسرة أو دعوة المساحة العائلية"/>
    </>}
    {confirm && <ConfirmFamilyAction title={confirm.title} description={confirm.description} busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => void act(confirm.action, confirm.payload, 'تم تحديث الإذن وإيقاف الوصول المعني.')} />}
  </FamilyFrame>;
}

export function FamilyBridgePanel({ source, onBack, connectionId, name, initialRoom, initialMessage }: { initialRoom?:string;initialMessage?:string;source: CommunitySource; onBack: () => void; connectionId?: string; name?: string }) {
  if (!source.family) return <FamilyFrame onBack={onBack}><p className="fb-feedback">جسر الأهل غير متاح في هذه الجلسة.</p></FamilyFrame>;
  return <FamilyHub initialRoom={initialRoom} initialMessage={initialMessage} request={source.family} source={source} onBack={onBack} connectionId={connectionId} name={name} testMode={source.familyTestMode} />;
}
export function FamilyGuardianDashboard({ request, onExit }: { request: FamilyRequest; onExit?: () => void }) {
  return <FamilyHub request={request} onBack={onExit} guardian />;
}
