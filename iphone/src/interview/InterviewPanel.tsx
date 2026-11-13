import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, ChevronDown, LockKeyhole, Pencil, RotateCcw, Trash2, X } from '../BrandIcons';
import { MotionPressButton, MotionReveal } from '../motion/Reanimated';
import { feedback } from '../feedback/haptics';
import { InterviewError, requestInterview, type InterviewAuth } from './api';
import { proposalOptions, proposalSide, proposalStatement, proposalTitle, type InterviewSelection } from './model';
import topics from './catalog.json';
import type { InterviewProposal, InterviewSnapshot } from './types';
import './interview.css';

const number = (value: number) => value.toLocaleString('ar-SA');

export function InterviewEntry({ available, open }: { available: boolean; open: () => void }) {
  if (!available) return null;
  return <section className="wi-entry" aria-labelledby="wi-entry-title">
    <div className="wi-entry-heading"><span className="wi-mark" aria-hidden="true"><img src="/brand/wudayn-emblem-v2.png" width="30" height="35" alt=""/></span><div><span className="wi-eyebrow">بكلماتك، وعلى راحتك</span><h2 id="wi-entry-title">جلسة التوافق</h2></div></div>
    <p>حوار عن شخصيتك وما يناسبك. راجع ما فهمناه وصحّحه، ثم أكّد ما يُضاف إلى تقييمك.</p>
    <div className="wi-entry-footer"><span><LockKeyhole size={13} aria-hidden="true"/> خاصة بك · يمكنك إكمالها لاحقًا</span><MotionPressButton className="wi-button wi-button-primary" onClick={open}>ابدأ الحوار <ArrowLeft size={17} aria-hidden="true"/></MotionPressButton></div>
  </section>;
}

type Props = {
  open: boolean;
  auth: InterviewAuth;
  onClose: () => void;
  onDirectQuestions?: () => void;
  onboarding?: boolean;
  onApply: (confirmed: InterviewProposal[]) => void;
};

export function InterviewPanel({ open, auth, onClose, onDirectQuestions = onClose, onboarding = false, onApply }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [snapshot, setSnapshot] = useState<InterviewSnapshot>({ document: null, revision: 0 });
  const current = useRef(snapshot);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState('');
  const busyRef = useRef(false);
  const activeRequest = useRef<{ action: string; settled: Promise<void> } | null>(null);
  const queuedIntentRef = useRef('');
  const [queuedIntent, setQueuedIntent] = useState('');
  const mounted = useRef(true);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [consent, setConsent] = useState(false);
  const [answer, setAnswer] = useState('');
  const answerRef = useRef(answer);
  const [draftState, setDraftState] = useState<'saved'|'pending'|'error'>('saved');
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [shareReview, setShareReview] = useState(false);
  const [deleteWarning, setDeleteWarning] = useState(false);
  const [applied, setApplied] = useState(false);
  const [sharingSaved, setSharingSaved] = useState(false);
  const requestId = useRef<{ answer: string; skip: boolean; id: string } | null>(null);
  const doc = snapshot.document;
  const owner = auth.testSession ?? auth.token ?? '';
  const reviewVersion = doc ? JSON.stringify([doc.status, doc.proposals, doc.confirmed]) : '';

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const assign = useCallback((next: InterviewSnapshot, replaceAnswer = false) => {
    current.current = next;
    setSnapshot(next);
    if (replaceAnswer) { answerRef.current = next.document?.draftAnswer ?? ''; setAnswer(answerRef.current); setDraftState('saved'); }
  }, []);

  const call = useCallback(async (action: string, payload: Record<string, unknown> = {}, replaceAnswer = false) => {
    if (busyRef.current) return null;
    busyRef.current = true; setBusy(action); setError(''); setErrorCode('');
    let release!: () => void;
    const settled = new Promise<void>(resolve => { release = resolve; });
    activeRequest.current = { action, settled };
    try {
      const next = await requestInterview(auth, { action, ...(action === 'load' || action === 'start' ? {} : { revision: current.current.revision }), ...payload });
      if (!mounted.current) return null;
      assign(next, replaceAnswer); return next;
    } catch (cause) {
      if (mounted.current) {
        setError(cause instanceof Error ? cause.message : 'تعذّر إكمال الخطوة. حاول مجددًا.');
        setErrorCode(cause instanceof InterviewError ? cause.code : 'unavailable');
      }
      return null;
    } finally {
      busyRef.current = false; activeRequest.current = null;
      if (mounted.current) setBusy('');
      release();
    }
  }, [owner, assign]);

  useEffect(() => {
    if (open) {
      if (!dialog.current?.open) dialog.current?.showModal();
      if (!loaded) void call('load', {}, true).then(result => { if (result) setLoaded(true); });
    } else dialog.current?.close();
  }, [open, loaded, call]);

  useEffect(() => {
    if (!doc || !['review', 'confirmed'].includes(doc.status)) return;
    const confirmed = new Map(doc.confirmed.map(item => [item.id, item.values]));
    setSelections(Object.fromEntries(doc.proposals.map(proposal => [proposal.id, confirmed.get(proposal.id) ?? proposal.values])));
    setIncluded(new Set(doc.confirmed.map(item => item.id)));
  }, [reviewVersion]);
  useEffect(() => { setShareReview(doc?.reviewSharing ?? false); }, [doc?.reviewSharing]);

  useEffect(() => {
    if (open && loaded) { dialog.current?.scrollTo({ top: 0 }); heading.current?.focus({ preventScroll: true }); }
  }, [open, loaded, doc?.currentQuestion?.text, doc?.status]);

  useEffect(() => {
    if (!open || !doc || doc.status !== 'active' || busy || queuedIntent || answer === doc.draftAnswer || draftState === 'error') return;
    setDraftState('pending');
    const timer = window.setTimeout(() => {
      const saving = answerRef.current;
      void call('draft', { answer: saving }).then(result => {
        if (!mounted.current) return;
        setDraftState(!result ? 'error' : answerRef.current === saving ? 'saved' : 'pending');
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [open, answer, doc?.draftAnswer, doc?.status, busy, queuedIntent, draftState, call]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (current.current.document?.status === 'active' && answerRef.current !== current.current.document.draftAnswer) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  useEffect(() => {
    const flush = () => {
      if (!document.hidden || busyRef.current || queuedIntentRef.current || current.current.document?.status !== 'active'
        || answerRef.current === current.current.document.draftAnswer) return;
      const saving = answerRef.current;
      void call('draft', { answer: saving }).then(result => {
        if (mounted.current) setDraftState(!result ? 'error' : answerRef.current === saving ? 'saved' : 'pending');
      });
    };
    document.addEventListener('visibilitychange', flush);
    return () => document.removeEventListener('visibilitychange', flush);
  }, [call]);

  async function afterDraft(intent: string) {
    if (queuedIntentRef.current) return false;
    const pending = activeRequest.current;
    if (pending?.action !== 'draft') return !busyRef.current;
    queuedIntentRef.current = intent; setQueuedIntent(intent);
    await pending.settled;
    queuedIntentRef.current = '';
    if (!mounted.current) return false;
    setQueuedIntent('');
    return !busyRef.current;
  }

  async function close() {
    if (queuedIntentRef.current) return;
    if (busyRef.current && activeRequest.current?.action !== 'draft') {
      if (['answer', 'review', 'retry'].includes(activeRequest.current?.action ?? '')) onClose();
      return;
    }
    if (activeRequest.current?.action === 'draft' && !await afterDraft('close')) return;
    if (current.current.document?.status === 'active' && answerRef.current !== current.current.document.draftAnswer) {
      const saved = await call('draft', { answer: answerRef.current });
      if (!saved) { setDraftState('error'); return; }
    }
    onClose();
  }

  async function send(skip = false) {
    if (queuedIntentRef.current) return;
    if (activeRequest.current?.action === 'draft' && !await afterDraft('answer')) return;
    const text = skip ? '' : answerRef.current.trim();
    if (busyRef.current || (!skip && !text)) return;
    if (!requestId.current || requestId.current.answer !== text || requestId.current.skip !== skip) requestId.current = { answer: text, skip, id: crypto.randomUUID() };
    const result = await call('answer', { answer: text, skip, requestId: requestId.current.id }, true);
    if (result) { requestId.current = null; feedback('selection'); }
    return result;
  }

  async function confirm() {
    const choices: InterviewSelection[] = (doc?.proposals ?? []).filter(proposal => included.has(proposal.id)).map(proposal => ({ id: proposal.id, values: selections[proposal.id] ?? [] }));
    const result = await call('confirm', { choices, shareReview });
    if (result?.document) {
      if (result.document.confirmed.length) { onApply(result.document.confirmed); setApplied(true); }
      else setSharingSaved(true);
      feedback('success');
    }
  }

  async function saveSharing() {
    const choices = (current.current.document?.confirmed ?? []).map(({ id, values }) => ({ id, values }));
    const result = await call('confirm', { choices, shareReview });
    if (result) { setSharingSaved(true); feedback('selection'); }
  }

  async function review() {
    if (queuedIntentRef.current) return;
    if (activeRequest.current?.action === 'draft' && !await afterDraft('review')) return;
    if (busyRef.current) return;
    if (answerRef.current.trim()) {
      const sent = await send();
      if (!sent || sent.document?.status !== 'active') return;
    }
    await call('review', {}, true);
  }

  function changeAnswer(value: string) { answerRef.current = value; setAnswer(value); setDraftState('pending'); }
  function toggle(id: string, checked: boolean) { setIncluded(previous => { const next = new Set(previous); checked ? next.add(id) : next.delete(id); return next; }); }
  const validProposals = (doc?.proposals ?? []).filter(item => proposalOptions(item).length > 0);
  const covered = new Set(doc?.turns.filter(turn => !turn.skipped).map(turn => turn.topic));
  const currentTopic = topics.find(topic => topic.id === doc?.currentQuestion?.topic);
  const reviewMode = doc?.status === 'review' || doc?.status === 'confirmed';
  const saveMessage = busy === 'draft' || draftState === 'pending' ? 'جارٍ حفظ إجابتك…' : draftState === 'error' ? 'لم تُحفظ آخر كتابة بعد' : 'محفوظة بخصوصية';
  const actionBlocked = !!queuedIntent || (!!busy && busy !== 'draft');

  return createPortal(<dialog ref={dialog} className="wi-dialog" dir="rtl" aria-labelledby="wi-dialog-name" onCancel={event => { event.preventDefault(); void close(); }}>
    <div className="wi-shell">
      <header className="wi-header"><div><img src="/brand/wudayn-emblem-v2.png" width="27" height="31" alt=""/><span id="wi-dialog-name">جلسة التوافق<small>مع وُدَين</small></span></div><button type="button" className="wi-icon" onClick={() => void close()} disabled={!!queuedIntent || (!!busy && !['draft','answer','review','retry'].includes(busy))} aria-label="حفظ وإغلاق الجلسة"><X size={20}/></button></header>
      <div className="wi-content">
        {!loaded ? <div className="wi-loading" role="status"><span className="wi-loading-dots" aria-hidden="true"><i/><i/><i/></span><p>نفتح مساحتك الخاصة…</p>{error && <button type="button" className="wi-link" onClick={() => void call('load', {}, true).then(result => result && setLoaded(true))}>إعادة المحاولة</button>}</div>
        : !doc ? <MotionReveal key="welcome" className="wi-welcome" duration={400} distance={8} inert={!!busy}>
          <InterviewSignature/>
          <span className="wi-eyebrow">حوار قصير. فهم أقرب.</span>
          <h1 id="wi-title" ref={heading} tabIndex={-1}>وش يخلّي الحياة<br/>بينكم أجمل؟</h1>
          <p className="wi-lead">عن شخصيتك، وتفضيلاتك، ومواقف الحياة. حوار واحد، وتراجع ما فهمناه قبل أن يدخل في التوافق.</p>
          <p className="wi-reassurance"><LockKeyhole size={14} aria-hidden="true"/><span>حوار خاص · تراجع كل تفسير · تكمل على راحتك</span></p>
          <ol className="wi-how"><li><span>١</span><div><strong>تكلّم بطريقتك</strong><p>عن الحياة، والقرب، والقرارات المشتركة.</p></div></li><li><span>٢</span><div><strong>راجع ما فهمناه</strong><p>صحّح أي تفسير واختر ما يمثّلك.</p></div></li><li><span>٣</span><div><strong>تفضيلات أوضح</strong><p>تُضاف فقط الإجابات التي تؤكدها إلى مسودة ملفك.</p></div></li></ol>
          <div className="wi-consent"><label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/><span>أوافق على معالجة إجاباتي بواسطة OpenAI ‏(Luna) لفهم شخصيتي وتفضيلاتي، وحفظ الجلسة في حسابي بخصوصية.</span></label><details><summary>كيف تُستخدم إجاباتي؟ <ChevronDown size={13}/></summary><p>تُرسل إجابات هذه الجلسة إلى مزوّد الذكاء الاصطناعي. لا ترسل أرقام هوية أو حسابات أو معلومات عن أشخاص آخرين. تُحفظ الجلسة الخاصة لمدة ٣٠ يومًا من آخر تحديث ويمكنك حذفها. قد يحتفظ المزوّد بسجلات لمراقبة إساءة الاستخدام وفق سياسته؛ لا نعد بانعدام الاحتفاظ.</p><p>لا يطّلع الطرف الآخر على الحوار. لا تُعد الملخصات تشخيصًا للشخصية أو توثيقًا لهويتك أو قرار قبول عضوية، ولا تُضاف شروط إلزامية تلقائيًا. مشاركة ملخص الاستعداد مع فريق العضوية اختيار مستقل في المراجعة.</p></details></div>
          <MotionPressButton className="wi-button wi-button-primary wi-wide" disabled={!consent || !!busy} onClick={() => void call('start', { consentVersion: 'wudayn-interview-v1' }, true)}>{busy === 'start' ? 'نجهّز جلستك…' : 'خلّنا نبدأ'}<ArrowLeft size={18}/></MotionPressButton>
          <button type="button" className="wi-link wi-centered" onClick={onDirectQuestions} disabled={!!busy}>أفضّل الأسئلة المباشرة</button>
        </MotionReveal>
        : applied ? <MotionReveal key="complete" className="wi-complete" duration={450}><span className="wi-complete-mark" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="20"/><path d="m15 24 6 6 12-13" pathLength="1"/></svg></span><span className="wi-eyebrow">أنت صاحب الكلمة الأخيرة</span><h1 id="wi-title" ref={heading} tabIndex={-1}>الصورة صارت أوضح.</h1><p>أضفنا الإجابات التي أكّدتها إلى مسودة ملفك. راجع الملف واحفظه لتدخل في حساب التوافق والترشيحات.</p><div className="wi-complete-count"><strong>{number(doc.confirmed.length)}</strong><span>إجابة مؤكدة<br/>بكلماتك واختيارك</span></div><p className="wi-small">تدخل ملامح الشخصية التي تؤكدها في التقييم نفسه. ما لم تجب عنه يبقى مفتوحًا، والشروط الأساسية تختارها بنفسك.</p><MotionPressButton className="wi-button wi-button-primary wi-wide" onClick={onClose}>{onboarding ? "إكمال ما تبقّى" : "العودة إلى ملفي"} <ArrowLeft size={18}/></MotionPressButton><button type="button" className="wi-link wi-centered" onClick={() => setApplied(false)}>مراجعة الجلسة وخيارات المشاركة</button></MotionReveal>
        : reviewMode ? <MotionReveal key="review" className="wi-review" duration={350} distance={8} inert={!!busy}>
          <span className="wi-eyebrow">المراجعة · القرار لك</span><h1 id="wi-title" ref={heading} tabIndex={-1}>هل هذه الصورة تمثّلك؟</h1><p className="wi-lead">اختر الإجابات التي توافق عليها. افتح أي نقطة لتراجع كلماتك الأصلية أو تعدّل التفسير.</p>
          {doc.pendingAnalysis && <div className="wi-notice"><p>حفظنا إجاباتك، لكن التحليل لم يكتمل. يمكنك إعادة المحاولة أو متابعة الأسئلة المباشرة. ستراجع أي تفسيرات جديدة قبل إضافتها.</p><button type="button" className="wi-link" onClick={() => void call(doc.status === 'confirmed' ? 'review' : 'retry')} disabled={!!busy}><RotateCcw size={14}/> إعادة التحليل</button></div>}
          {validProposals.length > 0 ? <><div className="wi-review-selection"><span role="status"><strong>{number(included.size)}</strong> من {number(validProposals.length)} مختارة</span><button type="button" onClick={() => setIncluded(new Set(validProposals.filter(item => !item.needsClarification).map(item => item.id)))}>اختيار الواضح منها</button>{included.size > 0 && <button type="button" onClick={() => setIncluded(new Set())}>إلغاء الاختيار</button>}</div>
            {(['personality','self','partner','importance'] as const).map(side => {
              const group = validProposals.filter(proposal => side === 'personality' ? proposal.kind === 'personality' : proposal.kind !== 'personality' && proposal.side === side);
              if (!group.length) return null;
              return <section className="wi-review-group" key={side}><h2>{side === 'personality' ? 'ملامح شخصيتك' : side === 'self' ? 'كيف أعيش وأتواصل' : side === 'partner' ? 'ما يناسبني في شريك الحياة' : 'ما يهمّني أكثر'}</h2>{side === 'personality' && <p className="wi-small">وصف لأسلوبك من كلامك. راجع العبارة ودرجة انطباقها عليك؛ لا يُعتمد شيء دون تأكيدك.</p>}{group.map(proposal => <ProposalReview key={proposal.id} proposal={proposal} selected={included.has(proposal.id)} values={selections[proposal.id] ?? proposal.values} onSelect={checked => toggle(proposal.id, checked)} onValues={values => { setSelections(previous => ({ ...previous, [proposal.id]: values })); setApplied(false); }}/>)}</section>;
            })}</> : <div className="wi-notice"><p>لا توجد إجابات واضحة جاهزة للإضافة بعد. لا نملأ الفراغات بالتخمين؛ يمكنك إكمال الأسئلة المباشرة بطريقتك.</p></div>}
          {!!doc.readiness.length && <section className="wi-private-notes"><h2>خطوتك القادمة <span>خاص بك</span></h2><p>ملخص لما ذكرته عن استعدادك؛ لا يُعد توثيقًا أو تقييمًا لقيمتك.</p><ul>{doc.readiness.map(note => <li key={note.id}>{note.text}</li>)}</ul></section>}
          {!!doc.clarifications.length && <section className="wi-private-notes"><h2>نقاط تستحق التوضيح</h2><p>هذه أسئلة مفتوحة، وليست أحكامًا أو أسباب رفض تلقائية.</p><ul>{doc.clarifications.map(note => <li key={note.id}>{note.text}</li>)}</ul></section>}
          <label className="wi-sharing"><input type="checkbox" checked={shareReview} disabled={doc.pendingAnalysis} onChange={event => { setShareReview(event.target.checked); setSharingSaved(false); }}/><span>أشارك ملخص الاستعداد ونقاط التوضيح فقط مع فريق مراجعة العضوية.<small>اختياري. لا يشمل الحوار أو إجابات الشخصية والتوافق. يمكنك سحب هذه الموافقة هنا.</small></span></label>
          {shareReview !== doc.reviewSharing && <button type="button" className="wi-link wi-sharing-save" disabled={!!busy || doc.pendingAnalysis} onClick={() => void saveSharing()}>{shareReview ? 'حفظ خيار المشاركة فقط' : 'سحب مشاركة الملخص فقط'}</button>}
          {sharingSaved && <p className="wi-sharing-saved" role="status"><Check size={14}/>حُفظ خيار المشاركة، دون تغيير إجابات ملفك.</p>}
          <MotionPressButton className="wi-button wi-button-primary wi-wide" onClick={() => void confirm()} disabled={!!busy || doc.pendingAnalysis}>{busy === 'confirm' ? 'نحفظ اختيارك…' : included.size ? `تأكيد ${number(included.size)} إجابة` : 'حفظ خيارات المشاركة'}<Check size={18}/></MotionPressButton>
          <p className="wi-small wi-centered">لن يتغير ملفك المنشور حتى تراجعه وتحفظه.</p>
          {doc.turns.length < 12 && <button type="button" className="wi-link wi-centered" disabled={!!busy} onClick={() => void call('resume', {}, true).then(result => { if (result) { setApplied(false); setSharingSaved(false); } })}>أكمل الحوار <ArrowLeft size={14}/></button>}
          {!doc.pendingAnalysis && <button type="button" className="wi-link wi-centered" disabled={!!busy} onClick={()=>void call('review').then(result=>{if(result){setApplied(false);setSharingSaved(false);}})}><RotateCcw size={14}/>تحديث قراءة الجلسة</button>}
          <button type="button" className="wi-link wi-centered" onClick={onDirectQuestions} disabled={!!busy}>العودة إلى الأسئلة المباشرة</button>
        </MotionReveal>
        : <>
          <div className="wi-progress-heading"><span>{currentTopic?.title ?? 'نتعرّف إلى ما يناسبك'}</span><small>{number(covered.size)} من {number(topics.length)} محاور</small></div>
          <div className="wi-topic-progress" aria-label={`أجبت عن ${number(covered.size)} من ${number(topics.length)} محاور`}>{topics.map(topic => <span key={topic.id} title={topic.title} aria-current={topic.id === doc.currentQuestion?.topic ? 'step' : undefined} data-state={topic.id === doc.currentQuestion?.topic ? 'current' : covered.has(topic.id) ? 'done' : undefined}><i aria-hidden="true"/></span>)}</div>
          <MotionReveal key={doc.currentQuestion?.text} className="wi-question" axis="x" distance={-12} duration={320}>
            <h1 id="wi-title" ref={heading} tabIndex={-1}>{doc.currentQuestion?.text ?? 'ما الذي تود إضافته عن الحياة التي تتمنّاها؟'}</h1>
            <label className="wi-answer-label" htmlFor="wi-answer">إجابتك، بطريقتك</label><textarea id="wi-answer" value={answer} onChange={event => changeAnswer(event.target.value)} maxLength={1200} rows={5} placeholder="خذ راحتك… موقف صغير أو مثال يكفي." autoComplete="off" spellCheck dir="auto" disabled={actionBlocked}/>
            <div className="wi-answer-meta"><span role="status"><LockKeyhole size={12}/>{saveMessage}</span><small>{number(answer.length)} / ١٢٠٠</small></div>
            {!!doc.currentQuestion?.suggestions.length && <div className="wi-suggestions" aria-label="بدايات اختيارية للإجابة">{doc.currentQuestion.suggestions.slice(0,3).map(suggestion => <button type="button" key={suggestion} disabled={!!busy} onClick={() => changeAnswer(answer ? `${answer} ${suggestion}`.slice(0,1200) : suggestion)}>{suggestion}</button>)}</div>}
          </MotionReveal>
          {doc.lastMode === 'guided' && doc.pendingAnalysis && <p className="wi-fallback" role="status">التحليل غير متاح مؤقتًا. نتابع بأسئلة مُعدّة، وإجاباتك محفوظة للمراجعة.</p>}
          <div className="wi-question-actions"><MotionPressButton className="wi-button wi-button-primary" disabled={actionBlocked || !answer.trim()} onClick={() => void send()}>{busy === 'answer' ? <><span className="wi-loading-dots" aria-hidden="true"><i/><i/><i/></span> نفهم إجابتك…</> : queuedIntent === 'answer' ? 'نجهّز الخطوة التالية…' : <>متابعة <ArrowLeft size={18}/></>}</MotionPressButton><button type="button" className="wi-link" disabled={actionBlocked} onClick={() => void send(true)}>تجاوز السؤال</button></div>
          <div className="wi-question-bottom"><button type="button" className="wi-link" onClick={() => void close()} disabled={actionBlocked}>إكمال لاحقًا</button>{doc.turns.length > 0 && <button type="button" className="wi-link" disabled={actionBlocked} onClick={() => void review()}>مراجعة ما فهمناه <ArrowLeft size={13}/></button>}</div>
          {!!doc.turns.length && <details className="wi-history"><summary>إجاباتي السابقة <ChevronDown size={14}/></summary><p>يمكنك تصحيح التفسيرات قبل إضافتها إلى ملفك في المراجعة.</p>{doc.turns.map(turn => <div key={turn.id}><strong>{turn.question}</strong><p>{turn.skipped ? 'تجاوزت هذا السؤال' : turn.answer}</p></div>)}</details>}
        </>}
        {error && <div className="wi-error" role="alert"><p>{error}</p>{/conflict|revision|stale/.test(errorCode) && <button type="button" className="wi-link" disabled={!!busy} onClick={() => void call('load', {}, true)}>استعادة آخر نسخة محفوظة</button>}</div>}
        {doc && !applied && <footer className="wi-private-footer"><span><LockKeyhole size={12}/> حوارك لا يظهر للأعضاء</span><button type="button" className="wi-link" onClick={() => setDeleteWarning(value => !value)} disabled={!!busy}><Trash2 size={13}/> حذف الجلسة</button></footer>}
        {deleteWarning && <div className="wi-delete-warning" role="alert"><strong>حذف الجلسة وسحب مشاركة ملخصها؟</strong><p>يُحذف الحوار وملخصه الخاص. الإجابات التي سبق أن حفظتها في ملفك تبقى قابلة للتعديل من الملف.</p><div><button type="button" className="wi-button" onClick={() => setDeleteWarning(false)}>إبقاء الجلسة</button><button type="button" className="wi-button wi-button-danger" disabled={!!busy} onClick={() => void call('delete', {}, true).then(result => { if (result) { setDeleteWarning(false); setConsent(false); setApplied(false); } })}>حذف الجلسة</button></div></div>}
      </div>
    </div>
  </dialog>, document.body);
}

function InterviewSignature() {
  return <div className="wi-signature" aria-hidden="true">
    <svg viewBox="0 0 240 70" fill="none"><path d="M8 49C33 49 37 28 61 28H79" pathLength="1"/><path d="M232 49C207 49 203 28 179 28H161" pathLength="1"/></svg>
    <img src="/brand/wudayn-emblem-v2.png" width="48" height="56" alt=""/>
  </div>;
}

function ProposalReview({ proposal, selected, values, onSelect, onValues }: { proposal: InterviewProposal; selected: boolean; values: string[]; onSelect: (value: boolean) => void; onValues: (values: string[]) => void }) {
  const options = proposalOptions(proposal);
  const multiple = proposal.kind === 'beena' && proposal.side === 'partner';
  return <article className="wi-proposal" data-selected={selected||undefined}>
    <label className="wi-proposal-choice"><input type="checkbox" checked={selected} onChange={event => onSelect(event.target.checked)} disabled={!values.length}/><span><small>{proposalTitle(proposal)}{proposal.needsClarification && <em>راجعها قبل التأكيد</em>}</small>{proposalStatement(proposal) && <span className="wi-personality-statement">{proposalStatement(proposal)}</span>}<strong>{options.filter(option => values.includes(option.value)).map(option => option.label).join('، ') || 'اختر ما يمثّلك'}</strong></span></label>
    <details><summary><Pencil size={12}/> التفسير والتعديل <ChevronDown size={13}/></summary><p>{proposal.summary}</p>{proposal.evidence.map((evidence, index) => <blockquote key={`${evidence.turnId}-${index}`}>{evidence.quote}</blockquote>)}<fieldset><legend>{proposalSide(proposal)}</legend>{multiple ? <div className="wi-multiple">{options.map(option => <label key={option.value}><input type="checkbox" checked={values.includes(option.value)} onChange={event => { const next = event.target.checked ? [...values, option.value] : values.filter(value => value !== option.value); onValues(next); if (!next.length) onSelect(false); }}/><span>{option.label}</span></label>)}</div> : <select value={values[0] ?? ''} onChange={event => onValues([event.target.value])} aria-label={`تعديل ${proposalTitle(proposal)}: ${proposalSide(proposal)}`}><option value="" disabled>اختر ما يمثّلك</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}</fieldset></details>
  </article>;
}
