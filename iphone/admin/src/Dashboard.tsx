import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Activity, ArrowDownLeft, ArrowLeft, ArrowUpRight, Bell, Check, CheckCircle2, ChevronLeft, ClipboardCheck, FileClock, Flag, HeartHandshake, LayoutDashboard, LogOut, RefreshCw, SearchCheck, ShieldCheck, Users, X } from 'lucide-react';
import { Brand } from './Auth';
import { AccountControls } from './AccountControls';
import { FamilyBridgeAdmin } from './FamilyBridge';
import { VerificationAdmin } from './Verification';
import { SupportAdmin } from './Support';
import { AdminError, friendly, mode } from './client';
import type { Access, AdminApi, AuditRow, MemberDetail, MemberRow, Operations, Overview, ReportAction, ReportRow, ReviewAction, StaffRole } from './types';

type Page = 'overview' | 'applications' | 'reports' | 'audit' | 'operations' | 'family' | 'verification' | 'support';
const titles: Record<Page, string> = { overview: 'نظرة عامة', applications: 'الحسابات والعضوية', reports: 'البلاغات', audit: 'سجل الإجراءات', operations: 'التشغيل والمتابعة', family: 'جسر الأهل', verification: 'التحقق والشارات', support: 'طلبات المساعدة' };
const roleNames: Record<string, string> = { owner: 'مالك مساحة الإدارة', reviewer: 'مراجع العضوية', moderator: 'مشرف السلامة', database: 'إدارة قاعدة البيانات', invitation: 'تفعيل حساب الفريق' };
const actionNames: Record<string, string> = { approve: 'اعتماد العضوية', suspend: 'تعليق الحساب', restore: 'رفع التعليق', return_pending: 'إعادة للمراجعة', pause: 'إيقاف الظهور', resume: 'استئناف الظهور', edit_profile: 'تعديل الملف', grant_access: 'منح وصول مجاني', revoke_access: 'إلغاء الوصول المجاني', set_dummy: 'تغيير تصنيف الحساب', assign_self: 'استلام البلاغ', resolve: 'إغلاق البلاغ', reopen: 'إعادة فتح البلاغ', member_viewed: 'مراجعة الملف', staff_granted: 'تفعيل صلاحية', staff_changed: 'تعديل صلاحية', staff_removed: 'إزالة صلاحية', staff_invited: 'حجز صلاحية', staff_invitation_claimed: 'تفعيل الحجز', staff_invitation_changed: 'تحديث حجز الصلاحية', staff_invitation_removed: 'إزالة حجز الصلاحية' };
Object.assign(actionNames, { family_link_approved: 'اعتماد ربط الأهل', family_link_rejected: 'رفض طلب ربط الأهل', family_link_revoked: 'سحب اعتماد ربط الأهل' });
Object.assign(actionNames, { verification_approve: 'اعتماد تحقق يدوي', verification_reject: 'رفض طلب التحقق', verification_request_changes: 'طلب استكمال التحقق', verification_revoke: 'سحب شارة التحقق', verification_evidence_viewed: 'فتح مستند تحقق خاص', verification_evidence_access: 'فتح مستند تحقق خاص' });
const number = new Intl.NumberFormat('ar-SA');
const date = (value: string | null) => value ? new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
const initials = (name: string | null) => name?.trim().slice(0, 1) || 'ن';

function Empty({ title, children }: { title: string; children?: ReactNode }) { return <div className="empty"><span><CheckCircle2 size={27} /></span><h3>{title}</h3><p>{children}</p></div>; }
function Loading() { return <div className="list-loading" role="status"><span className="loading-line" />جارٍ تحميل البيانات…</div>; }
function Notice({ error, children }: { error?: boolean; children: ReactNode }) { return <p className={error ? 'notice error' : 'notice'} role={error ? 'alert' : 'status'}>{children}</p>; }
function Badge({ member }: { member: MemberRow }) { return <span className={'badge ' + (member.suspended ? 'rose' : member.status === 'approved' ? 'green' : 'gold')}>{member.suspended ? 'معلّق' : member.status === 'approved' ? 'معتمد' : member.status === 'pending' ? 'بانتظار المراجعة' : 'مسودة'}</span>; }
function AccountTags({ member }: { member: MemberRow }) { return <span className="account-tags"><Badge member={member}/>{member.isDummy && <span className="badge dummy">وهمي · Dummy</span>}{member.paused && <span className="badge gold">الظهور متوقف</span>}</span>; }

function Modal({ title, close, busy, children }: { title: string; close: () => void; busy?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const element = ref.current!, previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal(); heading.current?.focus({ preventScroll: true });
    return () => { element.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className="detail-sheet" dir="rtl" aria-labelledby="detail-title" onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
    <header className="sheet-head"><div><span className="eyebrow">نصفين · مراجعة بعناية</span><h2 id="detail-title" ref={heading} tabIndex={-1}>{title}</h2></div><button className="icon-button" aria-label="إغلاق التفاصيل" onClick={close} disabled={busy}><X size={20} /></button></header>
    <div className="sheet-body">{children}</div>
  </dialog>;
}

function MemberSheet({ id, api, role, close, completed, onError }: { id: string; api: AdminApi; role: StaffRole; close: () => void; completed: () => void; onError: (e: unknown) => void }) {
  const [detail, setDetail] = useState<MemberDetail | null>(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0), [busy, setBusy] = useState(false);
  const [action, setAction] = useState<ReviewAction>('approve'), [reason, setReason] = useState(''), [verified, setVerified] = useState(false);
  const intent = useRef<{ fingerprint: string; id: string } | null>(null);
  useEffect(() => {
    let live = true; setDetail(null); setError(''); setVerified(false); setReason('');
    void api.member(id).then(value => { if (live) { setDetail(value); setAction(value.suspended ? 'restore' : value.status === 'pending' && role !== 'moderator' ? 'approve' : role === 'reviewer' ? 'return_pending' : 'suspend'); } }, problem => { if (live) { setError(friendly(problem)); onError(problem); } });
    return () => { live = false; };
  }, [id, api, attempt, role, onError]);
  const actions: ReviewAction[] = detail ? [
    ...(!detail.suspended && detail.status === 'pending' && role !== 'moderator' ? ['approve' as const] : []),
    ...(!detail.suspended && detail.status !== 'pending' && role !== 'moderator' ? ['return_pending' as const] : []),
    ...(role !== 'reviewer' ? [detail.suspended ? 'restore' as const : 'suspend' as const] : []),
    ...(role === 'owner' ? [detail.paused ? 'resume' as const : 'pause' as const] : []),
  ] : [];
  const basics = detail?.marriageBasics;
  const publicFacts = basics ? [
    ['الطول', basics.heightCm == null ? undefined : `${number.format(basics.heightCm)} سم`],
    ['الوزن', basics.weightKg == null ? undefined : `${number.format(basics.weightKg)} كجم`],
    ['الجنسية', basics.nationality],
    ['الخلفية القبلية', basics.tribalBackground && { tribal: 'قبلي', non_tribal: 'غير قبلي', prefer_not_to_say: 'يفضّل عدم الإفصاح' }[basics.tribalBackground]],
    ['القبيلة', basics.tribeName],
    ['الحالة الاجتماعية', basics.maritalStatus && { never_married: 'لم يسبق الزواج', divorced: 'مطلّق / مطلّقة', widowed: 'أرمل / أرملة' }[basics.maritalStatus]],
    ['عدد الأبناء', basics.childrenCount == null ? undefined : number.format(basics.childrenCount)],
    ['التدخين', basics.smoking && { never: 'لا يدخّن', sometimes: 'أحيانًا', yes: 'يدخّن' }[basics.smoking]],
    ['درجة البشرة المختارة', basics.skinTone && `الدرجة ${number.format(Number(basics.skinTone.slice(5)))}`],
    ['اللباس الحالي', basics.dressStyle && { hijab: 'حجاب', niqab: 'نقاب', uncovered: 'دون غطاء رأس' }[basics.dressStyle]],
    ['الموقف من تغيير اللباس', basics.dressFlexibility && { keep: 'أرغب في الاستمرار باختياري الحالي', open_to_discussion: 'منفتحة على النقاش دون التزام بالتغيير', open_to_change: 'منفتحة على التغيير إذا اقتنعت به', prefer_not_to_say: 'أفضل عدم الإفصاح' }[basics.dressFlexibility]],
  ].filter(([, value]) => value != null && value !== '') : [];
  async function submit() {
    if (!detail || busy || reason.trim().length < 3 || (action === 'approve' && !verified)) return;
    const fingerprint = JSON.stringify([id, action, detail.revision, reason.trim()]);
    if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, id: crypto.randomUUID() };
    setBusy(true); setError('');
    try { await api.review(id, action, detail.revision, reason.trim(), intent.current.id); completed(); }
    catch (problem) { setError(friendly(problem)); onError(problem); }
    finally { setBusy(false); }
  }
  return <Modal title={detail?.displayName || 'مراجعة الملف'} close={close} busy={busy}>
    {error && <Notice error>{error}</Notice>}
    {!detail ? error ? <button className="secondary" onClick={() => setAttempt(v => v + 1)}>إعادة المحاولة</button> : <Loading /> : <>
      <div className="member-identity"><span className="avatar large-avatar">{initials(detail.displayName)}</span><div><h3>{detail.displayName}</h3><p>{number.format(detail.age)} عامًا · {detail.city}</p></div><AccountTags member={detail} /></div>
      {detail.accountSource === 'pair_test' && <p className="notice">حساب اختبار خاص. تُطبّق القرارات على الحساب المستخدم في تطبيق الاختبار، ويظل موسومًا بأنه وهمي.</p>}
      <dl className="member-facts"><div><dt>الوصول للتعارف</dt><dd>{detail.accessActive ? 'مفعّل' : 'غير مفعّل'}</dd></div><div><dt>تاريخ انتهاء الوصول</dt><dd>{date(detail.accessUntil || null)}</dd></div><div><dt>انتهاء منحة الوصول المجاني</dt><dd>{date(detail.manualAccessUntil || null)}</dd></div></dl>
      <dl className="member-facts"><div><dt>المهنة</dt><dd>{detail.profession}</dd></div><div><dt>تاريخ التقديم</dt><dd>{date(detail.submittedAt)}</dd></div><div><dt>العمر المفضّل للطرف الآخر</dt><dd>{number.format(detail.preferredMinAge)}–{number.format(detail.preferredMaxAge)}</dd></div><div><dt>إشراك الأسرة</dt><dd>{detail.familyPreference || 'لم يُحدد'}</dd></div></dl>
      <section className="profile-bio"><h3>النبذة الشخصية</h3><p>{detail.bio}</p><div className="interest-list">{detail.interests.map(interest => <span key={interest}>{interest}</span>)}</div></section>
      {(detail.education || detail.marriageIntent) && <dl className="member-facts">
        {detail.education && <div><dt>التعليم</dt><dd>{detail.education}</dd></div>}
        {detail.marriageIntent && <div><dt>النية من التعارف</dt><dd>{detail.marriageIntent}</dd></div>}
      </dl>}
      {!!publicFacts.length && <section className="review-section">
        <h3>تفاصيل الملف العامة</h3><p className="muted">معلومات اختار العضو إضافتها إلى ملفه العام.</p>
        <dl className="member-facts">{publicFacts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd dir="auto">{value}</dd></div>)}</dl>
      </section>}
      {detail.publicAvatar && <section className="review-section">
        <h3>الصورة الرمزية العامة</h3><p className="muted">اختيارات العضو للصورة الرمزية، مستقلة عن تفاصيل المظهر.</p>
        <dl className="member-facts">
          <div><dt>الشكل المختار</dt><dd>{{ hijab: 'حجاب', niqab: 'نقاب', uncovered: 'دون غطاء رأس' }[detail.publicAvatar.style]}</dd></div>
          <div><dt>لون الصورة الرمزية</dt><dd>الدرجة {number.format(Number(detail.publicAvatar.skinTone.slice(5)))}</dd></div>
        </dl>
      </section>}
      {([
        ['ما يبحث عنه العضو', detail.lookingFor],
        ['تصوّره للحياة المشتركة', detail.lifeTogether],
        ['قيمه واحتياجاته الأساسية', detail.valuesStatement],
      ] as const).map(([label, content]) => content ? <section className="profile-bio" key={label}><h3>{label}</h3><p dir="auto">{content}</p></section> : null)}
      {detail.beenaStory && <section className="profile-bio"><h3>قصة بيننا · موقف من الحياة</h3><p className="muted">اختار العضو مشاركة هذه القصة على ملفه. راجع النص قبل اعتماد العضوية.</p><p dir="auto" style={{ whiteSpace: 'pre-wrap' }}>{detail.beenaStory.text}</p></section>}
      <section className="review-section quiet-box"><h3><ShieldCheck size={17} /> الموافقة والجاهزية</h3><p>{number.format(detail.answeredTopics)} إجابة مسجّلة · {detail.assessmentVersion}</p><p>آخر موافقة: {date(detail.consentedAt)}</p><small>العمر إفادة من العضو. يلزم التحقق وفق إجراء الفريق قبل اعتماد العضوية.</small></section>
      {!!actions.length && <section className="review-section"><h3>قرار المراجعة</h3><div className="choice-row">{actions.map(choice => <button key={choice} className={action === choice ? 'choice selected' : 'choice'} onClick={() => setAction(choice)} disabled={busy}>{actionNames[choice]}</button>)}</div>
        {action === 'restore' && <p className="muted">يعود الملف للمراجعة. المحادثات السابقة تبقى مغلقة.</p>}{action === 'return_pending' && <p className="muted">يحتاج الحساب اعتمادًا جديدًا قبل العودة للتعارف.</p>}{action === 'pause' && <p className="muted">يتوقف ظهور الحساب في الاكتشاف.</p>}
        {action === 'approve' && <label className="check-label"><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} disabled={busy} />تحققت من أهلية العضو والعمر وفق إجراء الفريق.</label>}
        <label>سبب القرار<textarea rows={3} value={reason} maxLength={500} onChange={e => setReason(e.target.value)} placeholder="اذكر سببًا واضحًا للمراجعة…" disabled={busy} /></label><small className="muted">يسجَّل اسمك والسبب مع القرار.</small>
        <button className={action === 'suspend' ? 'primary danger' : 'primary'} disabled={busy || reason.trim().length < 3 || (action === 'approve' && !verified)} onClick={() => void submit()}>{busy ? 'جارٍ حفظ القرار…' : 'تأكيد ' + actionNames[action]}<Check size={17} /></button>
      </section>}
      {role === 'owner' && <AccountControls key={detail.revision} member={detail} api={api} busy={busy} setBusy={setBusy} completed={completed} onError={onError}/>}
      {error && <button className="text-button" disabled={busy} onClick={() => setAttempt(v => v + 1)}>تحديث الملف ومراجعته مجددًا</button>}
    </>}
  </Modal>;
}

function ReportSheet({ report, api, close, completed, onError, onMember, canAct, reload }: { report: ReportRow; api: AdminApi; close: () => void; completed: () => void; onError: (e: unknown) => void; onMember: () => void; canAct: boolean; reload: () => void }) {
  const [action, setAction] = useState<ReportAction>(report.resolvedAt ? 'reopen' : report.assignedTo ? 'resolve' : 'assign_self');
  const [reason, setReason] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const intent = useRef<{ fingerprint: string; id: string } | null>(null);
  const actions: ReportAction[] = report.resolvedAt ? ['reopen'] : ['assign_self', 'resolve'];
  async function submit() {
    if (!canAct || busy || reason.trim().length < 3) return;
    const fingerprint = JSON.stringify([report.reportId, action, report.revision, reason.trim()]);
    if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, id: crypto.randomUUID() };
    setBusy(true); setError('');
    try { await api.reportAction(report.reportId, action, report.revision, reason.trim(), intent.current.id); completed(); }
    catch (problem) { setError(friendly(problem)); onError(problem); }
    finally { setBusy(false); }
  }
  return <Modal title="مراجعة البلاغ" close={close} busy={busy}><span className={'badge ' + (report.resolvedAt ? 'green' : 'rose')}>{report.resolvedAt ? 'مغلق' : 'مفتوح'}</span>{report.isDummy && <span className="badge dummy report-dummy">وهمي · Dummy</span>}<h3 className="report-person">الحساب المعني · {report.reportedName || 'عضو'}</h3><p className="muted">{date(report.createdAt)} · {report.assignedName ? 'لدى ' + report.assignedName : 'غير مسند'}</p><blockquote className="report-evidence">{report.reason}</blockquote><p className="muted small">هذا نص البلاغ المقدَّم. لا تتيح هذه الشاشة تصفح المحادثات الخاصة.</p><button className="secondary" disabled={busy} onClick={onMember}>مراجعة الملف ذي الصلة<ArrowUpRight size={16} /></button>
    {canAct ? <section className="review-section"><h3>خطوة التحقيق</h3><div className="choice-row">{actions.map(value => <button key={value} className={action === value ? 'choice selected' : 'choice'} onClick={() => setAction(value)} disabled={busy}>{actionNames[value]}</button>)}</div><label>سبب الإجراء<textarea rows={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} placeholder="وثّق سبب الإسناد أو نتيجة المراجعة…" /></label>{error && <><Notice error>{error}</Notice><button className="text-button" onClick={reload} disabled={busy}>تحديث قائمة البلاغات</button></>}<button className="primary" onClick={() => void submit()} disabled={busy || reason.trim().length < 3}>{busy ? 'جارٍ الحفظ…' : 'تأكيد ' + actionNames[action]}<Check size={17} /></button></section> : <p className="quiet-box">يتابع هذا البلاغ مشرف آخر. تعديل إسناده متاح لمالك المساحة.</p>}
  </Modal>;
}

function OverviewPanel({ data, navigate }: { data: Overview; navigate: (page: Page) => void }) {
  const accepted = data.cohorts.reduce((sum, row) => sum + Number(row.accepted), 0), formal = data.cohorts.reduce((sum, row) => sum + Number(row.formal), 0);
  return <>
    <section className="welcome-banner"><div><span className="eyebrow">العناية بالتفاصيل تصنع الثقة</span><h2>بدايات جديدة،<br />تستحق مراجعتك.</h2><p>طلبات واضحة، قرارات موثقة، ومساحة آمنة للتعارف الجاد.</p><button onClick={() => navigate('applications')}>ابدأ مراجعة الطلبات<ArrowLeft size={18} /></button></div><div className="banner-emblem"><img src="/brand/nisfayn-heart.png" alt="" /></div></section>
    <div className="stats-grid"><Stat icon={<ClipboardCheck />} value={data.counts.pendingApplications} label="طلبات بانتظار المراجعة" onClick={() => navigate('applications')} /><Stat icon={<Flag />} value={data.counts.openReports} label="بلاغات تحتاج متابعة" onClick={() => navigate('reports')} /><Stat icon={<Users />} value={data.counts.approvedMembers} label="عضويات معتمدة" /><Stat icon={<ShieldCheck />} value={data.counts.suspendedMembers} label="حسابات معلّقة" /></div>
    <div className="overview-grid"><section className="panel"><div className="panel-heading"><span className="panel-icon"><SearchCheck size={20} /></span><div><h2>جودة البدايات</h2><p>مؤشرات الترشيحات المسجّلة خلال آخر ١٣ أسبوعًا</p></div></div><div className="outcome-stats"><div><strong>{number.format(accepted)}</strong><span>قبول متبادل</span></div><div><strong>{number.format(formal)}</strong><span>اتفاق على خطوة رسمية</span></div></div><p className="fine-print">الأعداد من ترشيحات ظهرت فعليًا. تعكس تفاعل الأعضاء، ولا تمثل احتمال نجاح الزواج.</p></section>
      <section className="panel checklist"><h2>مراجعة بعناية</h2><p><span>١</span>تحقق من الأهلية ووضوح الملف.</p><p><span>٢</span>امنح البلاغات سببًا وقرارًا موثقين.</p><p><span>٣</span>اطّلع على المعلومات اللازمة للمهمة فقط.</p></section></div>
  </>;
}
function Stat({ icon, value, label, onClick }: { icon: ReactNode; value: number; label: string; onClick?: () => void }) {
  const contents = <><span className="stat-icon">{icon}</span><strong>{number.format(value)}</strong><span>{label}</span>{onClick && <ChevronLeft className="stat-arrow" size={15} />}</>;
  return onClick ? <button className="stat" onClick={onClick}>{contents}</button> : <div className="stat">{contents}</div>;
}

function OperationsPanel({ api, role, demo, onError }: { api: AdminApi; role: StaffRole; demo: boolean; onError: (e: unknown) => void }) {
  const [data, setData] = useState<Operations | null>(null), [error, setError] = useState(''), [service, setService] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => { if (role !== 'owner') return; let active = true; setError(''); void api.health().then(value => { if (active) setData(value); }, problem => { if (active) { setError(friendly(problem)); onError(problem); } }); return () => { active = false; }; }, [api, role, attempt, onError]);
  async function checkService() {
    if (demo) { setService('فحص توضيحي فقط. لا تُجرى اتصالات خارجية في التجربة.'); return; }
    setService('جارٍ فحص استجابة خدمة الإدارة…');
    try { const response = await fetch('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(10_000) }); const body = await response.json(); if (!response.ok || body.status !== 'ok' || body.service !== 'nisfayn-admin') throw new Error(); setService('خدمة الإدارة تستجيب. هذا الفحص لا يتحقق من تسليم إشعارات Apple.'); }
    catch { setService('تعذّر التحقق من استجابة الخدمة. راجع سجلات النشر.'); }
  }
  return <div className="operations"><section className="panel"><div className="panel-heading"><span className="panel-icon"><Activity size={21} /></span><div><h2>حالة مساحة الإدارة</h2><p>{demo ? 'بيئة تجريبية ببيانات خيالية' : mode === 'staging' ? 'بيئة اختبار مستقلة' : 'متصلة بمشروع نصفين المخصص'}</p></div></div><button className="secondary fit-button" onClick={() => void checkService()}>فحص استجابة الخدمة<RefreshCw size={15} /></button>{service && <Notice>{service}</Notice>}</section>
    {role !== 'owner' ? <Empty title="مؤشرات التشغيل متاحة للمالك">يبقى وصولك محصورًا في مهام دورك.</Empty> : <>{error && <Notice error>{error}</Notice>}{!data && !error && <Loading />}{data && <><div className="stats-grid"><Stat icon={<Bell />} value={data.push.queued} label="إشعارات في الانتظار" /><Stat icon={<RefreshCw />} value={data.push.retrying} label="محاولات إعادة إرسال" /><Stat icon={<CheckCircle2 />} value={data.push.sent24h} label="أرسلت خلال ٢٤ ساعة" /><Stat icon={<Flag />} value={data.push.failed24h} label="إخفاقات خلال ٢٤ ساعة" /></div><section className="panel"><h2>متابعة الإشعارات</h2><p className="muted">التسليم الفعلي يحتاج إعداد مفاتيح APNs واختباره على iPhone. وجود الطلب في الطابور لا يعني وصوله للجهاز.</p><dl className="member-facts"><div><dt>أقدم إشعار منتظر</dt><dd>{date(data.push.oldestPendingAt)}</dd></div><div><dt>وقت قراءة المؤشرات</dt><dd>{date(data.serverTime)}</dd></div></dl></section><section className="panel"><h2>استقرار التطبيق</h2><p className="muted">أعداد مجمّعة لآخر {number.format(data.retentionDays)} يومًا، دون نص الرسائل أو الإجابات أو معرّفات الأعضاء.</p>{data.clientEvents.length ? <div className="event-list">{data.clientEvents.map((event, i) => <div key={i}><span>{event.event === 'render_error' ? 'خطأ عرض' : event.event === 'unhandled_rejection' ? 'طلب غير مكتمل' : 'خطأ تطبيق'} · <bdi>{event.platform}</bdi></span><strong>{number.format(event.total)}</strong><small>{event.day} · <bdi>{event.release}</bdi></small></div>)}</div> : <p className="quiet-box">لا توجد أحداث مسجّلة في هذه الفترة. هذا لا يثبت خلو التطبيق من الأخطاء.</p>}</section></>}
      <button className="text-button fit-button" onClick={() => setAttempt(v => v + 1)}>تحديث مؤشرات التشغيل<RefreshCw size={14} /></button></>}
  </div>;
}

export function Dashboard({ api, staff, demo, onExit, onAccessChanged }: { api: AdminApi; staff: Access; demo: boolean; onExit: () => void; onAccessChanged: () => void }) {
  const role = staff.role!, [page, setPage] = useState<Page>('overview'), [filter, setFilter] = useState(role === 'moderator' ? 'suspended' : 'all'), [reportFilter, setReportFilter] = useState('open');
  const [overview, setOverview] = useState<Overview | null>(null), [members, setMembers] = useState<MemberRow[]>([]), [reports, setReports] = useState<ReportRow[]>([]), [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [revision, setRevision] = useState(0), [more, setMore] = useState(false), [toast, setToast] = useState('');
  const [memberId, setMemberId] = useState<string | null>(null), [report, setReport] = useState<ReportRow | null>(null);
  const generation = useRef(0), mainHeading = useRef<HTMLHeadingElement>(null);
  const onError = useCallback((problem: unknown) => { if (problem instanceof AdminError && (problem.code === '42501' || problem.code === 'PGRST301')) onAccessChanged(); }, [onAccessChanged]);
  const navigate = (next: Page) => { if ((next === 'reports' || next === 'support') && role === 'reviewer' || (next === 'family' || next === 'verification') && role === 'moderator') return; setPage(next); setError(''); setToast(''); setMemberId(null); setReport(null); window.scrollTo(0, 0); };
  useEffect(() => { mainHeading.current?.focus({ preventScroll: true }); }, [page]);
  useEffect(() => {
    if (page === 'operations' || page === 'family' || page === 'verification' || page === 'support') { setMore(false); setLoading(false); return; }
    const ticket = ++generation.current; setLoading(true); setError(''); setMore(false); setMembers([]); setReports([]); setAudit([]);
    const work = page === 'overview' ? api.overview() : page === 'applications' ? api.applications(filter) : page === 'reports' ? api.reports(reportFilter) : api.audit();
    void work.then(result => {
      if (generation.current !== ticket) return;
      if (page === 'overview') setOverview(result as Overview);
      else if (page === 'applications') setMembers(result as MemberRow[]);
      else if (page === 'reports') setReports(result as ReportRow[]);
      else setAudit(result as AuditRow[]);
      if (Array.isArray(result)) setMore(result.length === (page === 'audit' ? 100 : 50));
    }, problem => { if (generation.current === ticket) { setError(friendly(problem)); onError(problem); } }).finally(() => { if (generation.current === ticket) setLoading(false); });
    return () => { generation.current++; };
  }, [page, filter, reportFilter, revision, api, onError]);
  async function loadMore() {
    if (loading || !more) return; const ticket = generation.current; setLoading(true); setError('');
    try {
      const rows = page === 'applications' ? await api.applications(filter, members.at(-1)?.memberId) : page === 'reports' ? await api.reports(reportFilter, reports.at(-1)?.reportId) : await api.audit(audit.at(-1)?.id);
      if (generation.current !== ticket) return;
      if (page === 'applications') setMembers(old => [...old, ...(rows as MemberRow[])]);
      else if (page === 'reports') setReports(old => [...old, ...(rows as ReportRow[])]);
      else setAudit(old => [...old, ...(rows as AuditRow[])]);
      setMore(rows.length === (page === 'audit' ? 100 : 50));
    } catch (problem) { if (generation.current === ticket) { setError(friendly(problem)); onError(problem); } }
    finally { if (generation.current === ticket) setLoading(false); }
  }
  const completed = () => { setMemberId(null); setReport(null); setToast('حُفظ القرار وسُجّل في سجل الإجراءات.'); setRevision(v => v + 1); };
  const nav: { page: Page; icon: ReactNode }[] = [{ page: 'overview', icon: <LayoutDashboard /> }, { page: 'applications', icon: <Users /> }, ...(role !== 'moderator' ? [{ page: 'verification' as const, icon: <ShieldCheck /> }, { page: 'family' as const, icon: <HeartHandshake /> }] : []), ...(role !== 'reviewer' ? [{ page: 'reports' as const, icon: <Flag /> }, { page: 'support' as const, icon: <Bell /> }] : []), ...(role === 'owner' ? [{ page: 'audit' as const, icon: <FileClock /> }] : []), { page: 'operations', icon: <Activity /> }];
  return <div className="admin-layout">
    <aside className="sidebar"><Brand /><span className="sidebar-caption">العناية بكل بداية</span><nav aria-label="التنقل الرئيسي">{nav.map(item => <button key={item.page} className={page === item.page ? 'nav-item active' : 'nav-item'} aria-current={page === item.page ? 'page' : undefined} onClick={() => navigate(item.page)}>{item.icon}<span>{titles[item.page]}</span>{page === item.page && <i />}</button>)}</nav><div className="sidebar-bottom"><span className="staff-avatar">{initials(staff.displayName)}</span><div><strong>{staff.displayName}</strong><small>{roleNames[role]}</small></div><button className="icon-button" aria-label={demo ? 'إنهاء التجربة' : 'تسجيل الخروج'} onClick={onExit}><LogOut size={17} /></button></div></aside>
    <main className="dashboard-main"><header className="workspace-top"><span><ShieldCheck size={15} /> مساحة الفريق</span><span className={demo ? 'environment demo' : 'environment'}>{demo ? 'بيانات تجريبية' : mode === 'staging' ? 'بيئة الاختبار' : 'بيئة الإنتاج'}</span></header>
      {demo && <div className="demo-banner"><span><SparkleMark /> تجربة مستقلة · حسابات وهمية، وتُحفظ قراراتها على هذا المتصفح عند توفر التخزين.</span><button onClick={onExit}>إنهاء التجربة<ArrowLeft size={14} /></button></div>}
      <section className="page-title"><div><p className="eyebrow">نصفين / مساحة الإدارة</p><h1 ref={mainHeading} tabIndex={-1}>{titles[page]}</h1><p>{page === 'overview' ? 'ما يحتاج عنايتك اليوم، في مكان واحد.' : page === 'applications' ? 'كل ملف يُراجع بعناية، وكل قرار يبقى موثّقًا.' : page === 'family' ? 'روابط عائلية بموافقة العضو ومراجعة الفريق.' : page === 'verification' ? 'مراجعة خاصة، وشارة تصف بالضبط ما تم التحقق منه.' : page === 'reports' ? 'متابعة واضحة تحفظ خصوصية الأطراف وسلامتهم.' : page === 'audit' ? 'سجل موثّق للاطلاع والقرارات، متاح لمالك المساحة.' : 'مؤشرات محددة تساعدك على متابعة جاهزية الخدمة.'}</p></div>{page !== 'operations' && <button className="secondary refresh-button" onClick={() => setRevision(v => v + 1)} disabled={loading}><RefreshCw size={16} />تحديث</button>}</section>
      {toast && <Notice>{toast}</Notice>}{error && <Notice error>{error} <button className="inline-button" onClick={() => setRevision(v => v + 1)}>إعادة المحاولة</button></Notice>}
      {page === 'overview' && (loading ? <Loading /> : overview && <OverviewPanel data={overview} navigate={navigate} />)}
      {page === 'applications' && <section className="panel queue-panel"><div className="panel-heading queue-heading"><div><h2>دليل الحسابات</h2><p>الحسابات الحقيقية والوهمية، مع حالة العضوية والوصول.</p></div><div className="filters" role="group" aria-label="حالة العضوية">{(role === 'moderator' ? ['suspended'] : ['all', 'pending', 'approved', 'suspended', 'draft', 'dummy']).map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{{ all: 'الكل', pending: 'للمراجعة', approved: 'معتمدة', suspended: 'معلّقة', draft: 'مسودات', dummy: 'وهمية' }[value]}</button>)}</div></div>
        {!members.length ? loading ? <Loading /> : !error && <Empty title="لا توجد ملفات في هذه القائمة">ستظهر هنا الملفات المطابقة لحالة المراجعة.</Empty> : <div className="member-list">{members.map(member => <button className="member-row" key={member.memberId} onClick={() => setMemberId(member.memberId)} aria-label={'مراجعة ملف ' + member.displayName}><span className="avatar">{initials(member.displayName)}</span><span className="row-person"><strong>{member.displayName}</strong><small>{number.format(member.age)} عامًا · {member.city}</small></span><span className="row-job">{member.profession}<small>{date(member.submittedAt)}</small></span><AccountTags member={member} /><ChevronLeft size={17} /></button>)}</div>}
      </section>}
      {page === 'reports' && <section className="panel queue-panel"><div className="panel-heading queue-heading"><div><h2>متابعة البلاغات</h2><p>إسناد واضح وسبب موثق لكل إجراء.</p></div><div className="filters" role="group" aria-label="حالة البلاغ">{['open', 'resolved'].map(value => <button key={value} aria-pressed={reportFilter === value} onClick={() => setReportFilter(value)}>{value === 'open' ? 'مفتوحة' : 'مغلقة'}</button>)}</div></div>
        {!reports.length ? loading ? <Loading /> : !error && <Empty title="لا توجد بلاغات في هذه القائمة">تُحدَّث القائمة عند تسجيل بلاغ أو تغيير حالته.</Empty> : <div className="reports-list">{reports.map(row => <button className="report-row" key={row.reportId} onClick={() => setReport(row)}><span className="report-mark"><Flag size={20} /></span><span><strong>{row.reportedName || 'عضو'}</strong>{row.isDummy && <span className="badge dummy report-dummy">وهمي · Dummy</span>}<p>{row.reason}</p><small>{date(row.createdAt)} · {row.assignedName ? 'لدى ' + row.assignedName : 'غير مسند'}</small></span><ChevronLeft size={18} /></button>)}</div>}
      </section>}
      {page === 'audit' && <section className="panel queue-panel"><div className="panel-heading"><span className="panel-icon"><FileClock size={21} /></span><div><h2>أثر كل قرار</h2><p>الفاعل والسبب والتوقيت، دون نسخ المحادثات أو الإجابات الخاصة.</p></div></div>{!audit.length ? loading ? <Loading /> : !error && <Empty title="لا توجد إجراءات لعرضها">تظهر هنا المراجعات والقرارات بعد تسجيلها.</Empty> : <ol className="audit-list">{audit.map(row => <li key={row.id}><span className="audit-dot"><Check size={12} /></span><div><strong>{actionNames[row.action] || 'إجراء إداري'}</strong><p>{row.reason}</p><small>{row.actorName} · {roleNames[row.actorRole] || row.actorRole} · <bdi>{row.targetId.slice(0, 8)}</bdi></small></div><time>{date(row.createdAt)}</time></li>)}</ol>}</section>}
      {page === 'operations' && <OperationsPanel api={api} role={role} demo={demo} onError={onError} />}
      {page === 'family' && <FamilyBridgeAdmin api={api} role={role} refresh={revision} onError={onError}/>}
      {page === 'verification' && <VerificationAdmin api={api} role={role} refresh={revision} onError={onError}/>}
      {page === 'support' && role !== 'reviewer' && <SupportAdmin api={api} refresh={revision} onError={onError}/>}
      {more && <button className="secondary more-button" disabled={loading} onClick={() => void loadMore()}>{loading ? 'جارٍ التحميل…' : 'تحميل المزيد'}<ArrowDownLeft size={16} /></button>}
      <footer className="workspace-footer"><span>نصفين · توافق ذكي للزواج</span><span><LockMark /> الوصول بحسب الدور، والقرار باسم صاحبه.</span></footer>
    </main>
    {memberId && <MemberSheet key={memberId} id={memberId} api={api} role={role} close={() => setMemberId(null)} completed={completed} onError={onError} />}
    {report && <ReportSheet key={report.reportId} report={report} api={api} close={() => setReport(null)} completed={completed} onError={onError} canAct={role === 'owner' || !report.assignedTo || report.assignedTo === staff.userId} reload={() => { setReport(null); setRevision(v => v + 1); }} onMember={() => { setMemberId(report.reportedId); setReport(null); }} />}
  </div>;
}
function SparkleMark() { return <span aria-hidden="true">✦</span>; }
function LockMark() { return <ShieldCheck size={12} aria-hidden="true" />; }
