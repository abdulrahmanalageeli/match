import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { BookOpen, ChevronLeft, LockKeyhole, Sparkles } from '../BrandIcons';
import { useMembershipAccess } from '../membership/access';
import { deepSections, type DeepAction, type DeepAnalysisSource, type DeepSnapshot } from './deepCompatibilityModel';
import type { WatchUpdates } from './updates';
import { DeepReport } from './DeepReport';
import { deepReportDocument, deepReportTitle } from './deepReportDocument';
import { saveDeepReport } from './deepReportExport';
import './deepCompatibility.css';

const stateCopy: Record<DeepSnapshot['status'], string> = {
  none: 'تحليل معمّق من إجاباتكما السابقة', requested: 'دعوة لتحليل التوافق', ready: 'موافقتكما مكتملة · جاهز للتحليل',
  generating: 'لونا تقرأ ما بين الإجابات', review: 'التقرير جاهز لمراجعة المشاركة', shared: 'تقريركما المشترك جاهز',
  declined: 'لم تُقبل الدعوة', cancelled: 'أُلغي التحليل', stale: 'تحتاجان موافقة جديدة', failed: 'لم يكتمل التحليل',
};
const count = new Intl.NumberFormat('ar-SA');
const message = (error: unknown) => error instanceof Error && /[\u0600-\u06ff]/.test(error.message) ? error.message : 'تعذّر الاتصال الآن. حاول مجددًا.';

export function DeepCompatibility({ source, watch, connectionId, peerName, open, onOpenChange, onNoticeChange, sheet }: {
  source?: DeepAnalysisSource; watch: WatchUpdates; connectionId: string; peerName: string; open: boolean;
  onOpenChange(open: boolean): void; onNoticeChange?(): void; sheet(content: ReactNode): ReactNode;
}) {
  const membership = useMembershipAccess();
  const [snapshot, setSnapshot] = useState<DeepSnapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const exportLock = useRef(false);
  const [decisions, setDecisions] = useState<Record<string, boolean>>({});
  const [hidden, setHidden] = useState(() => document.hidden);
  const sequence = useRef(0), locked = useRef(false);
  const mounted = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const reviewKey = snapshot?.status === 'review' ? snapshot.id + ':' + snapshot.review.map(item => item.id).join(',') : '';
  useEffect(() => setDecisions({}), [reviewKey]);
  const refresh = useCallback(async () => {
    if (!source || document.hidden || locked.current || exportLock.current) return;
    const current = ++sequence.current;
    try {
      const next = await source.request(connectionId, 'get');
      if (current === sequence.current && !document.hidden) { setSnapshot(next); setError(''); }
    } catch (failure) {
      if (current === sequence.current) { setSnapshot(null); setError(message(failure)); }
    }
  }, [source, connectionId]);
  const latestRefresh = useRef(refresh);
  latestRefresh.current = refresh;
  useEffect(() => {
    mounted.current = true;
    setSnapshot(null); setError(''); setBusy(false); locked.current = false;
    void refresh();
    const stop = source ? watch(() => void refresh()) : () => {};
    const timer = source ? window.setInterval(() => void refresh(), 15000) : undefined;
    const visibility = () => {
      setHidden(document.hidden);
      if (document.hidden) { ++sequence.current; setSnapshot(null); setDecisions({}); setBusy(false); }
      else void refresh();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => { mounted.current = false; ++sequence.current; stop(); clearInterval(timer); document.removeEventListener('visibilitychange', visibility); };
  }, [source, watch, refresh]);
  async function act(action: DeepAction | 'generate') {
    if (!source || locked.current || exportLock.current) return;
    locked.current = true; setBusy(true); setError('');
    const current = ++sequence.current;
    try {
      let next = action === 'generate' ? snapshot : await source.request(connectionId, action, action === 'review'
        ? Object.fromEntries((snapshot?.review ?? []).map(item => [item.id, decisions[item.id] === true])) : undefined);
      if (current !== sequence.current) return;
      if (!document.hidden) setSnapshot(next);
      // One explicit approval starts one job. Polls and re-renders never invoke AI.
      if (action === 'generate' || action === 'accept' && next?.canGenerate) {
        await source.generate(connectionId);
        if (!mounted.current || document.hidden || current !== sequence.current) return;
        next = await source.request(connectionId, 'get');
        if (current === sequence.current && !document.hidden) setSnapshot(next);
      }
    } catch (failure) {
      if (current === sequence.current && !document.hidden) { setSnapshot(null); setError(message(failure)); }
    } finally {
      locked.current = false;
      if (current === sequence.current) setBusy(false);
      // Returning from background must re-authorize before revealing a report.
      if (current !== sequence.current && mounted.current && !document.hidden) { setBusy(false); void refresh(); }
    }
  }
  async function saveReport() {
    if (!source || exportLock.current || locked.current) return;
    exportLock.current = true; setSaving(true); setSaveError('');
    const current = sequence.current;
    let authorized = false;
    try {
      // Re-authorize immediately before export; never save a stale cached report.
      const fresh = await source.request(connectionId, 'get');
      if (!mounted.current || document.hidden || current !== sequence.current) return;
      setSnapshot(fresh);
      const html = deepReportDocument(fresh, peerName);
      authorized = true;
      await saveDeepReport(html);
    } catch (failure) {
      if (mounted.current && !document.hidden && current === sequence.current) {
        if (!authorized) { setSnapshot(null); setError(message(failure)); }
        else setSaveError(message(failure));
      }
    } finally {
      exportLock.current = false;
      if (mounted.current) {
        setSaving(false);
        // Native Save to Files may background the web view and clear its report.
        void latestRefresh.current();
      }
    }
  }
  const status = snapshot?.status;
  useEffect(() => { panel.current?.closest('dialog')?.scrollTo({ top: 0 }); }, [status]);
  const isStart = status && ['none', 'declined', 'cancelled', 'stale'].includes(status);
  const actionable = status === 'requested' && !snapshot?.requestedByMe || status === 'review' && !snapshot?.myReviewed;
  const selected = snapshot?.review.filter(item => decisions[item.id]).length ?? 0;
  const step = status === 'shared' ? 3 : status === 'review' ? 2 : status && ['ready', 'generating', 'failed'].includes(status) ? 1 : 0;
  const hasNotice = Boolean(snapshot?.id && status && status !== 'none' && !hidden);
  const noticeKey = hasNotice ? `${snapshot?.id}:${status}:${snapshot?.myReviewed}` : '';
  useLayoutEffect(() => { if (noticeKey) onNoticeChange?.(); }, [noticeKey, onNoticeChange]);
  const notice = status === 'requested' ? snapshot?.requestedByMe ? 'أرسلت دعوة لاكتشاف توافقكما بعمق' : `دعوة من ${peerName} لاكتشاف توافقكما بعمق`
    : status === 'review' ? snapshot?.myReviewed ? 'حُفظت اختياراتك · بانتظار الطرف الآخر' : 'قراءتك الخاصة جاهزة · راجع ما ترغب بمشاركته'
    : snapshot ? stateCopy[snapshot.status] : '';
  return <>
    {hasNotice && <div className="wd-deep-event" aria-label="تحديث تحليل وُدَين">
      <span className="wd-deep-event-brand"><img src="/brand/wudayn-emblem-v2.png" width="24" height="24" alt=""/>{deepReportTitle}</span>
      <p>{notice}</p>
      <button type="button" aria-haspopup="dialog" onClick={() => onOpenChange(true)}>
        {actionable && <i aria-label="بانتظارك"/>}{status === 'shared' ? 'قراءة التحليل' : status === 'requested' && !snapshot?.requestedByMe ? 'مراجعة الدعوة' : status === 'review' && !snapshot?.myReviewed ? 'مراجعة المشاركة' : 'عرض التفاصيل'}<ChevronLeft size={13}/>
      </button>
    </div>}
    {open && sheet(<div ref={panel} className={`wd-deep${status === 'shared' ? ' wd-deep-shared' : ''}`} aria-busy={busy}>
      {hidden ? <p className="wd-deep-note"><LockKeyhole size={18}/> التقرير مخفي أثناء مغادرة التطبيق.</p> : <>
        {status !== 'shared' && <><div className="wd-deep-intro"><span className="wd-deep-eyebrow">أنت و{peerName}</span><h3>ما الذي يستحق أن تتحدثا عنه؟</h3><p>يربط Sol 6.2 بين إجاباتكما ليشرح كيف قد يظهر الاتفاق أو الاختلاف في يوم عادي، ويقترح سؤالًا وتجربة صغيرة تخصّكما.</p></div>
        <ol className="wd-deep-steps" aria-label="مراحل التحليل">{['الموافقة', 'التحليل', 'المراجعة', 'تقريركما'].map((label, index) => <li key={label} data-current={index === step || undefined} data-done={index < step || undefined} aria-current={index === step ? 'step' : undefined}><span>{count.format(index + 1)}</span>{label}</li>)}</ol></>}
        {error && <div className="wd-deep-error" role="alert"><p>{error}</p><button className="btn-text" onClick={() => void refresh()} disabled={busy}>تحديث الحالة</button></div>}
        {!source && <p className="wd-deep-note">يُتاح طلب التحليل لأعضاء وسام الجدية في التوافقات الحقيقية. هذه المحادثة التجريبية لا ترسل أي إجابات للتحليل.</p>}
        {source && !snapshot && !error && <p role="status" className="wd-deep-note">{busy ? 'جارٍ تنفيذ طلبك…' : 'جارٍ تحميل حالة التقرير…'}</p>}
        {isStart && <>
          {status === 'stale' && <p className="wd-deep-note">انتهت صلاحية الموافقة أو تغيّرت الإجابات. طلب جديد يحافظ على دقة التقرير وخصوصيتكما.</p>}
          {status === 'declined' && <p className="wd-deep-note">لم تُقبل الدعوة السابقة. لم يُفتح تقرير مشترك.</p>}
          {status === 'cancelled' && <p className="wd-deep-note">أُلغي التحليل السابق وسُحب الوصول إلى محتواه.</p>}
          <ConsentCopy/>
          {snapshot?.canRequest ? <button className="btn-primary" disabled={busy} onClick={() => void act('request')}>أوافق وأرسل طلب التحليل</button>
            : membership.tier !== 'seriousness' ? <><p className="wd-deep-note">إرسال الطلب من مزايا وسام الجدية. يستطيع الطرف الآخر الموافقة وقراءة التقرير بأي عضوية.</p><button className="btn-primary" onClick={() => { onOpenChange(false); membership.upgrade(); }}>اكتشف وسام الجدية</button></>
            : <p className="wd-deep-note">طلب تحليل جديد غير متاح الآن. يلزم اكتمال إجابات الطرفين وتوفّر طلب ضمن حد الاستخدام.</p>}
        </>}
        {status === 'requested' && <>
          <div className="wd-deep-state"><Sparkles size={22}/><h3>{snapshot?.requestedByMe ? 'دعوتك وصلت' : `دعوة من ${peerName} لتحليل التوافق`}</h3><p>{snapshot?.requestedByMe ? 'يبدأ التحليل بعد موافقة الطرف الآخر. لا تحتاجان إلى إجابات جديدة.' : 'المشاركة اختيارية ومجانية لك. راجع ما سيُستخدم وما يمكن مشاركته قبل الموافقة.'}</p></div>
          {!snapshot?.requestedByMe && <><ConsentCopy/><button className="btn-primary" disabled={busy} onClick={() => void act('accept')}>أوافق وأبدأ التحليل</button><button className="btn-text" disabled={busy} onClick={() => void act('decline')}>لا أرغب بالمشاركة</button></>}
        </>}
        {(status === 'ready' || status === 'generating' || status === 'failed') && <div className="wd-deep-state" role="status">
          <span className="wd-deep-reading" data-moving={busy || status === 'generating' || undefined}><BookOpen size={26}/></span>
          <h3>{busy || status === 'generating' ? 'لونا تربط بين إجاباتكما' : status === 'failed' ? 'لم يكتمل التحليل' : 'موافقتكما مكتملة'}</h3>
          <p>تبحث عن نقاط القوة والاختلاف وما يحتاج إلى نقاش. يمكنك متابعة المحادثة والعودة هنا؛ لا يُشارك شيء قبل مراجعتكما.</p>
          {snapshot?.canGenerate && <button className="btn-primary" disabled={busy} onClick={() => void act('generate')}>{busy ? 'جارٍ التحليل…' : status === 'ready' ? 'بدء التحليل' : 'إعادة محاولة التحليل'}</button>}
          {status === 'failed' && !snapshot?.canGenerate && <p>تعذّر إكمال هذا الطلب. يمكنك إلغاءه والمحاولة لاحقًا.</p>}
        </div>}
        {status === 'review' && (snapshot?.myReviewed ? <div className="wd-deep-state"><LockKeyhole size={24}/><h3>حُفظت اختياراتك</h3><p>بانتظار مراجعة الطرف الآخر. يُفتح التقرير بالنقاط التي وافقتما عليها معًا فقط.</p></div> : <>
          <div className="wd-deep-review-intro"><h3>قراءتك الخاصة قبل المشاركة</h3><p>هذه قراءة لإجاباتك وحدك، دون معلومات الطرف الآخر أو نص التقرير المشترك. اختر ما تسمح للتقرير باستنتاجه ومشاركته عنك. الرفض يحذف النقطة وأي نتائج تعتمد على مصادرها، بما فيها الملخص.</p></div>
          <div className="wd-deep-review-tools"><span>{count.format(selected)} من {count.format(snapshot?.review.length ?? 0)} نقطة محددة</span><button type="button" className="btn-text" onClick={() => setDecisions(Object.fromEntries((snapshot?.review ?? []).map(item => [item.id, selected !== snapshot?.review.length])))} disabled={busy}>{selected === snapshot?.review.length ? 'إلغاء التحديد' : 'تحديد جميع النقاط'}</button></div>
          <div className="wd-deep-review-list">{Object.entries(deepSections).map(([key, label]) => {
            const items = snapshot?.review.filter(item => item.section === key) ?? [];
            return items.length ? <details key={key} open={key === 'summary'}><summary>{label}<span>{count.format(items.length)}</span></summary>{items.map((item, index) => <div className="wd-deep-disclosure" key={item.id}><label className="wd-deep-choice"><input type="checkbox" checked={decisions[item.id] === true} disabled={busy} onChange={event => setDecisions(value => ({ ...value, [item.id]: event.target.checked }))}/><span><strong>السماح بمشاركة القراءة {count.format(index + 1)}</strong><small>{item.ownInterpretation}</small></span></label><details className="wd-deep-evidence"><summary>إجاباتك التي تستند إليها</summary><p>{item.ownEvidence.length ? item.ownEvidence.map(entry => `${entry.label}: ${entry.value}`).join(' · ') : 'لا تتضمن إجابة خاصة بك.'}</p></details></div>)}</details> : null;
          })}</div>
          <button className="btn-primary" disabled={busy} onClick={() => void act('review')}>{selected ? 'اعتماد اختيارات المشاركة' : 'عدم مشاركة أي نقطة'}</button>
          <small className="wd-deep-footnote">لن تُشارك النقاط غير المحددة. لا حاجة للإجابة عن أي سؤال.</small>
        </>)}
        {status === 'shared' && snapshot && <>
          <DeepReport snapshot={snapshot} peerName={peerName} save={() => void saveReport()} saving={saving}/>
          {saveError && <p role="alert" className="wd-deep-error">{saveError}</p>}
        </>}
        {snapshot && ['requested', 'ready', 'generating', 'failed', 'review', 'shared'].includes(snapshot.status) && (snapshot.status !== 'requested' || snapshot.requestedByMe) && <Revoke busy={busy || saving} shared={snapshot.status === 'shared'} apply={() => void act('cancel')}/>}
      </>}
    </div>)}
  </>;
}

function ConsentCopy() {
  return <div className="wd-deep-consent"><h3><LockKeyhole size={17}/> قبل أن توافق</h3><ul><li>تُحلّل لونا إجاباتكما المحفوظة: تفضيلاتكما، متطلبات الشريك وعبارات الشخصية، وخطط الزواج والسكن والإنجاب والمصاريف إن أضفتماها، عبر OpenAI، مزوّد الذكاء الاصطناعي.</li><li>لا تُستخدم المحادثات أو الصور أو بيانات التواصل أو مدينة الأصل أو نص «بيننا». لا استبيان إضافي.</li><li>قد يكشف التقرير تفضيلات خاصة عبر استنتاجاته. تراجعان نطاق مشاركة كل نقطة؛ لا تُفتح إلا بموافقتكما.</li></ul><small>يمكنك رفض الدعوة أو إلغاء التحليل وسحب الوصول إلى التقرير داخل التطبيق. لا يمكن سحب نسخة سبق أن حفظها الطرف الآخر.</small></div>;
}

function Revoke({ busy, shared, apply }: { busy: boolean; shared: boolean; apply(): void }) {
  const [confirm, setConfirm] = useState(false);
  return <div className="wd-deep-revoke">{confirm ? <><p>إلغاء التحليل يسحب الوصول إلى التقرير لدى الطرفين. هل تريد المتابعة؟</p><button className="btn-text" disabled={busy} onClick={apply}>تأكيد الإلغاء وسحب المشاركة</button><button className="btn-text" disabled={busy} onClick={() => setConfirm(false)}>تراجع</button></> : <button className="btn-text" disabled={busy} onClick={() => setConfirm(true)}>{shared ? 'سحب مشاركة التقرير' : 'إلغاء التحليل'}</button>}</div>;
}
