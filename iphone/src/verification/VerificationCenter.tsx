import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronDown, CircleAlert, FileCheck2, LoaderCircle, LockKeyhole, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { Brand } from '../Brand';
import type { Profile } from '../types';
import { VerifiedBadge } from './VerifiedBadge';
import { currentVerificationClaims, verificationDate, verificationKinds, verificationStatusLabels, verificationSubmissionUnavailable, type ManualVerificationRequest, type ManualVerificationSource, type ManualVerificationState } from './model';
import './verification.css';

const emptyState: ManualVerificationState = { requests: [], claims: [], isTest: false };
function message(error: unknown) { return error instanceof Error ? error.message : 'تعذّر إتمام الطلب. حاول مرة أخرى.'; }

function WithdrawDialog({ busy, onCancel, onConfirm }: { busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={dialog} className="mv-dialog" dir="rtl" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <div className="mv-dialog-head"><span className="mv-dialog-symbol"><Trash2 size={23} /></span></div>
    <h2 id={titleId}>سحب طلب التوثيق؟</h2><p>تتوقف مراجعة هذا الطلب وتختفي الشارة المرتبطة به. يُزال وصول المراجعين إلى مستنده ويُطلب حذفه، مع الاحتفاظ بسجل القرار دون المستند.</p>
    <div className="mv-dialog-actions"><button type="button" className="mv-secondary" disabled={busy} onClick={onCancel} autoFocus>تراجع</button><button type="button" className="mv-primary" disabled={busy} onClick={onConfirm}>{busy ? 'جارٍ السحب…' : 'سحب الطلب'}</button></div>
  </dialog>;
}

function RequestCard({ request, busy, onWithdraw }: { request: ManualVerificationRequest; busy: boolean; onWithdraw: (request: ManualVerificationRequest) => void }) {
  const kind = verificationKinds.find(item => item.id === request.kind);
  const canWithdraw = ['draft', 'pending', 'changes_requested', 'approved'].includes(request.status);
  return <article className={`mv-request mv-request-${request.status}`}>
    <div className="mv-request-top"><strong>{kind?.label}{request.isTest ? <small>تجريبي</small> : null}</strong><span className="mv-status">{verificationStatusLabels[request.status]}</span></div>
    {request.reason ? <p className="mv-review-note"><CircleAlert size={15} /><span>{request.reason}</span></p> : null}
    {request.status === 'stale' ? <p className="mv-fine-print">تغيّر البيان في ملفك بعد المراجعة، لذلك لم تعد الشارة سارية.</p> : null}
    {request.status === 'draft' ? <p className="mv-fine-print">لم يكتمل إرسال هذا الطلب. يمكنك سحبه من هنا.</p> : null}
    <div className="mv-request-meta"><span>{request.submittedAt ? `أُرسل ${verificationDate(request.submittedAt)}` : 'بانتظار الإرسال'}</span>{request.expiresAt && request.status === 'approved' ? <span>حتى {verificationDate(request.expiresAt)}</span> : null}</div>
    <details className="mv-request-details"><summary>تفاصيل الطلب <ChevronDown size={14} /></summary>
      {request.memberNote ? <p>ملاحظتك: {request.memberNote}</p> : null}
      {request.evidence.length ? <ul>{request.evidence.map(file => <li key={file.id}><FileCheck2 size={14} /><span dir="auto">{file.fileName}</span><small>{file.available ? 'خاص بفريق المراجعة' : 'حُذف المستند'}</small></li>)}</ul> : <p>لا توجد مستندات محفوظة لهذا الطلب.</p>}
      {request.reviewedAt ? <p>آخر مراجعة: {verificationDate(request.reviewedAt)}</p> : null}
    </details>
    {canWithdraw ? <div className="mv-request-actions"><button type="button" disabled={busy} onClick={() => onWithdraw(request)}><Trash2 size={14} />سحب الطلب</button></div> : null}
  </article>;
}

export function VerificationCenter({ source, onBack }: { source: ManualVerificationSource; profile: Profile; onBack: () => void }) {
  const [state, setState] = useState<ManualVerificationState>(emptyState);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [withdraw, setWithdraw] = useState<ManualVerificationRequest | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    setLoading(true); setBusy(false); setError(''); setSuccess(''); setState(emptyState);
    setWithdraw(null);
    if (!source.verification) { setLoading(false); return; }
    source.verification('state').then(result => { if (generation.current === current) setState(result); }).catch(error => { if (generation.current === current) setError(message(error)); }).finally(() => { if (generation.current === current) setLoading(false); });
    return () => { generation.current++; };
  }, [source.verification]);

  const validClaims = currentVerificationClaims(state.claims);
  const test = state.isTest || source.verificationTestMode;
  const available = !!source.verification;

  async function refresh() {
    if (!source.verification || busy) return;
    const current = generation.current;
    setBusy(true); setError('');
    try { const result = await source.verification('state'); if (generation.current === current) setState(result); }
    catch (error) { if (generation.current === current) setError(message(error)); }
    finally { if (generation.current === current) setBusy(false); }
  }
  async function confirmWithdraw() {
    if (!withdraw || !source.verification || busy) return;
    const current = generation.current;
    setBusy(true); setError('');
    try {
      const result = await source.verification('withdraw', { requestId: withdraw.id });
      if (generation.current !== current) return;
      setState(result); setWithdraw(null); setSuccess('سُحب الطلب وأُوقفت الشارة المرتبطة به.');
    } catch (error) { if (generation.current === current) { setWithdraw(null); setError(message(error)); } }
    finally { if (generation.current === current) setBusy(false); }
  }

  return <main className="app-screen mv-screen" dir="rtl"><div className="screen-content mv-content">
    <header className="mv-navigation"><button type="button" onClick={onBack}><ArrowRight size={18} />الإعدادات</button><Brand compact /></header>
    <section className="mv-cover" aria-labelledby="mv-title"><span className="mv-eyebrow"><ShieldCheck size={15} />خطوة تمنح التعارف وضوحًا</span><h1 id="mv-title">بيانات أوضح.<br /><em>بداية أكثر اطمئنانًا.</em></h1><p>تابع طلباتك السابقة ونطاق الشارات التي تمت مراجعتها.</p><div className="mv-cover-foot"><LockKeyhole size={15} /><span>المراجعة محددة النطاق وليست توثيقًا حكوميًا</span></div></section>
    {test ? <p className="mv-test-note"><CircleAlert size={17} />حساب تجريبي · الطلبات والشارات هنا للاختبار فقط.</p> : null}
    {!available ? <div className="mv-notice"><LockKeyhole size={20} /><h2>التوثيق مرتبط بحسابك</h2><p>سجّل الدخول بحسابك للوصول إلى المراجعة الخاصة. لا يمكن إرسال مستندات من العرض التجريبي العام.</p></div> : null}
    <div className="mv-notice" role="status"><LockKeyhole size={20} /><h2>إرسال المستندات متوقف مؤقتًا</h2><p>{verificationSubmissionUnavailable}</p><p>يمكنك متابعة طلباتك السابقة أو سحبها من هنا. لا ترسل المستندات في المحادثات أو إلى الدعم كبديل.</p><p>اعتماد ملف العضوية لا يعني التحقق من الهوية أو الحالة الاجتماعية.</p></div>
    {loading ? <div className="mv-loading" role="status"><LoaderCircle size={20} className="mv-spin" />جارٍ تحميل طلباتك…</div> : null}
    {error ? <div className="mv-feedback mv-error" role="alert"><CircleAlert size={17} /><p>{error}</p></div> : null}
    {success ? <div className="mv-feedback mv-success" role="status"><Check size={17} /><p>{success}</p></div> : null}
    {validClaims.length ? <section className="mv-current"><div><span className="mv-eyebrow">الشارة الظاهرة في ملفك</span><VerifiedBadge claims={validClaims} /></div><p>اضغط على الشارة لعرض البيانات التي تمت مراجعتها وتاريخ صلاحيتها.</p></section> : null}
    {available ? <>
      <section className="mv-section mv-history" aria-labelledby="mv-history-title"><div className="mv-section-heading"><div><span className="mv-eyebrow">كل خطوة واضحة</span><h2 id="mv-history-title">طلباتك</h2></div><button className="mv-icon-button" type="button" aria-label="تحديث حالة الطلبات" disabled={busy || loading} onClick={refresh}><RefreshCw size={18} /></button></div>{!loading && !state.requests.length ? <p className="mv-empty">لا توجد طلبات توثيق سابقة.</p> : state.requests.map(request => <RequestCard key={request.id} request={request} busy={busy} onWithdraw={setWithdraw} />)}</section>
    </> : null}
    <p className="mv-bottom-note">الشارة تخص البيان الذي تمت مراجعته فقط، ولا تضمن السلوك أو التوافق أو نجاح الزواج.</p>
    {withdraw ? <WithdrawDialog busy={busy} onCancel={() => setWithdraw(null)} onConfirm={() => void confirmWithdraw()} /> : null}
  </div></main>;
}
