import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowUp, Check, ChevronDown, HeartHandshake, LockKeyhole, Pencil, RotateCcw, Trash2, X } from '../BrandIcons';
import { MotionPressButton } from '../motion/Reanimated';
import { feedback } from '../feedback/haptics';
import { InterviewError, requestInterview, type InterviewAuth } from './api';
import { proposalOptions, proposalSide, proposalStatement, proposalTitle, type InterviewSelection } from './model';
import { profileField, profileProposalLabel, profileProposalValue, profileProposalOptions, validProfileProposalValues, type ProfileContext, type ProfileProposal } from './profileCapture';
import topics from './catalog.json';
import type { InterviewProposal, InterviewSnapshot } from './types';
import './interview.css';

const number = (value: number) => value.toLocaleString('ar-SA');
type ProfileChoice = Pick<ProfileProposal, 'id' | 'fieldId' | 'values' | 'mode' | 'exclude'>;
type MessageChange = { id: string; title: string; value: string; changed: boolean; profile: boolean };
const captureSignature = (proposal: { values: string[]; mode?: unknown; exclude?: unknown }) => JSON.stringify([proposal.values, proposal.mode, proposal.exclude]);
function messageChanges(before: InterviewSnapshot, after: InterviewSnapshot): MessageChange[] {
  const doc = after.document;
  if (!doc || doc.pendingAnalysis || doc.lastMode !== 'luna') return [];
  const lastTurn = doc.turns.at(-1)?.id;
  const previous = new Map([...(before.document?.proposals ?? []), ...(before.document?.profileProposals ?? [])].map(p => [p.id, captureSignature(p)]));
  return [
    ...doc.proposals.filter(p => !p.needsClarification && p.evidence.some(e => e.turnId === lastTurn)).map(p => ({ id: p.id, title: `${proposalTitle(p)} · ${proposalSide(p)}`, value: proposalOptions(p).filter(o => p.values.includes(o.value)).map(o => o.label).join('، '), changed: previous.has(p.id), profile: false, signature: captureSignature(p) })),
    ...(doc.profileProposals ?? []).filter(p => !p.needsClarification && p.evidence.some(e => e.turnId === lastTurn)).map(p => ({ id: p.id, title: profileProposalLabel(p), value: profileProposalValue(p), changed: previous.has(p.id), profile: true, signature: captureSignature(p) })),
  ].filter(p => previous.get(p.id) !== p.signature);
}

export function InterviewEntry({ available, open }: { available: boolean; open: () => void }) {
  if (!available) return null;
  return <section className="wi-entry" aria-labelledby="wi-entry-title">
    <div className="wi-entry-heading"><span className="wi-mark" aria-hidden="true"><img src="/brand/wudayn-emblem-v2.png" width="30" height="35" alt=""/></span><div><span className="wi-eyebrow">بكلماتك، وعلى راحتك</span><h2 id="wi-entry-title">جلسة التوافق</h2></div></div>
    <p>حوار واحد يجمع شخصيتك وتطلعاتك للزواج. وفي النهاية، ملخص تراجعه وتعدّله قبل الاعتماد.</p>
    <div className="wi-entry-footer"><span><LockKeyhole size={13} aria-hidden="true"/> خاصة بك · يمكنك إكمالها لاحقًا</span><MotionPressButton className="wi-button wi-button-primary" onClick={open}>ابدأ الحوار <ArrowLeft size={17} aria-hidden="true"/></MotionPressButton></div>
  </section>;
}

type Props = {
  open: boolean;
  auth: InterviewAuth;
  onClose: () => void;
  onDirectQuestions?: () => void;
  onboarding?: boolean;
  consentGranted?: boolean;
  onUnavailable?: () => void;
  onFallbackApply?: (confirmed: InterviewProposal[]) => void;
  onApply: (confirmed: InterviewProposal[]) => void;
  profileContext?: ProfileContext;
  assessmentContext?: InterviewSelection[];
  sensitiveProfileAllowed?: boolean;
  onProfileApply?: (confirmed: ProfileProposal[]) => void;
};

export function InterviewPanel({ open, auth, onClose, onDirectQuestions = onClose, onboarding = false, consentGranted = false, onUnavailable, onFallbackApply, onApply, profileContext, assessmentContext, sensitiveProfileAllowed = false, onProfileApply }: Props) {
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
  const [pendingReply, setPendingReply] = useState<{ id: string; text: string } | null>(null);
  const [coverageGain, setCoverageGain] = useState(0);
  const [captures, setCaptures] = useState<Record<string, MessageChange[]>>({});
  const [profileReview, setProfileReview] = useState(false);
  const [profileEdits, setProfileEdits] = useState<Record<string, ProfileChoice>>({});
  const [editedProfile, setEditedProfile] = useState<string[]>([]);
  const [ignoredProfile, setIgnoredProfile] = useState<string[]>([]);
  const contextRef = useRef(profileContext); contextRef.current = profileContext;
  const assessmentContextRef = useRef(assessmentContext); assessmentContextRef.current = assessmentContext;
  const profileApplyRef = useRef(onProfileApply); profileApplyRef.current = onProfileApply;
  const [answerHelp, setAnswerHelp] = useState(false);
  const answerRef = useRef(answer);
  const [draftState, setDraftState] = useState<'saved'|'pending'|'error'>('saved');
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const thread = useRef<HTMLDivElement>(null);
  const followConversation = useRef(true);
  const firstConversation = useRef(true);
  const composer = useRef<HTMLTextAreaElement>(null);
  const autoStarted = useRef(false);
  const failureNotified = useRef(false);
  const unavailableCallback = useRef(onUnavailable);
  unavailableCallback.current = onUnavailable;
  const [shareReview, setShareReview] = useState(false);
  const [deleteWarning, setDeleteWarning] = useState(false);
  const [applied, setApplied] = useState(false);
  const [fallbackReview, setFallbackReview] = useState(false);
  const [sharingSaved, setSharingSaved] = useState(false);
  const requestId = useRef<{ answer: string; skip: boolean; id: string } | null>(null);
  const doc = snapshot.document;
  const openingTurn = Boolean(doc?.status === 'active' && doc.turns.length === 0);
  const owner = auth.testSession ?? auth.token ?? '';
  const reviewVersion = doc ? JSON.stringify([doc.status, doc.proposals, doc.confirmed]) : '';
  const profileVersion = JSON.stringify(doc?.profileProposals ?? []);

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
    const before = current.current;
    try {
      const next = await requestInterview(auth, { action, ...(action === 'load' || action === 'start' ? {} : { revision: current.current.revision }), ...(['start','answer','retry','review'].includes(action) ? { ...(contextRef.current ? { profileContext: contextRef.current } : {}), ...(assessmentContextRef.current ? { assessmentContext: assessmentContextRef.current } : {}) } : {}), ...payload });
      if (!mounted.current) return null;
      if (['answer','retry','review'].includes(action) && next.document && !next.document.pendingAnalysis) {
        const changes = messageChanges(before, next), turnId = next.document.turns.at(-1)?.id;
        if (turnId && changes.length) setCaptures(previous => ({ ...previous, [turnId]: changes }));
      }
      assign(next, replaceAnswer); return next;
    } catch (cause) {
      if (mounted.current) {
        setError(cause instanceof Error ? cause.message : 'تعذّر إكمال الخطوة. حاول مجددًا.');
        setErrorCode(cause instanceof InterviewError ? cause.code : 'unavailable');
      }
      if (action !== 'load' && action !== 'draft') {
        try {
          const recovered = await requestInterview(auth, { action: 'load' });
          if (mounted.current) assign(recovered, action === 'answer' && recovered.document?.lastRequestId === payload.requestId);
        } catch { /* Keep the written answer and offer a retry if the connection is still unavailable. */ }
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
    setSelections(Object.fromEntries(doc.proposals.map(proposal => [proposal.id, confirmed.get(proposal.id) ?? (proposal.needsClarification ? [] : proposal.values)])));
  }, [reviewVersion]);
  useEffect(() => { setShareReview(doc?.reviewSharing ?? false); }, [doc?.reviewSharing]);
  useEffect(() => {
    setProfileEdits(Object.fromEntries((doc?.profileProposals ?? []).map(p => [p.id, { id:p.id, fieldId:p.fieldId, values:p.needsClarification ? [] : p.values, mode:p.mode, exclude:p.exclude }])));
    setIgnoredProfile([]);
    setEditedProfile([]);
  }, [profileVersion]);

  useEffect(() => {
    if (open && loaded) { dialog.current?.scrollTo({ top: 0 }); heading.current?.focus({ preventScroll: true }); }
  }, [open, loaded, doc?.status, fallbackReview, profileReview]);

  useEffect(() => {
    if (!open || !loaded || doc || !consentGranted || autoStarted.current) return;
    autoStarted.current = true;
    void call('start', { consentVersion: 'wudayn-interview-v1' }, true);
  }, [open, loaded, doc, consentGranted, call]);
  useEffect(() => {
    const viewport = thread.current;
    if (open && viewport && (firstConversation.current || followConversation.current)) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'instant' });
      firstConversation.current = false;
    }
  }, [open, doc?.turns.length, doc?.currentQuestion?.text, pendingReply?.id, busy === 'answer']);
  useEffect(() => {
    const viewport = thread.current;
    if (!open || !viewport || typeof ResizeObserver === 'undefined') return;
    const resize = new ResizeObserver(() => {
      if (document.activeElement === composer.current) viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'instant' });
    });
    resize.observe(viewport);
    return () => resize.disconnect();
  }, [open, loaded, doc?.status, fallbackReview]);
  useLayoutEffect(() => {
    const input = composer.current;
    if (!open || !input) return;
    input.style.height = '0px';
    input.style.height = `${Math.min(140, Math.max(48, input.scrollHeight))}px`;
  }, [answer, open, loaded, doc?.status, fallbackReview]);

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

  async function send(skip = false, quickReply?: string) {
    if (queuedIntentRef.current || current.current.document?.pendingAnalysis) return;
    // A quick choice must never discard a draft the member has already written.
    if (quickReply !== undefined && answerRef.current.trim()) return;
    if (activeRequest.current?.action === 'draft' && !await afterDraft('answer')) return;
    if (quickReply !== undefined && answerRef.current.trim()) return;
    const text = skip ? '' : quickReply?.trim() ?? answerRef.current.trim();
    if (busyRef.current || (!skip && !text)) return;
    if (!requestId.current || requestId.current.answer !== text || requestId.current.skip !== skip) requestId.current = { answer: text, skip, id: crypto.randomUUID() };
    const sentId = requestId.current.id;
    followConversation.current = true;
    const previousCoverage = current.current.coverage?.answered ?? 0;
    setPendingReply({ id: sentId, text }); setAnswerHelp(false); setCoverageGain(0);
    answerRef.current = ''; setAnswer(''); feedback('selection');
    const result = await call('answer', { answer: text, skip, requestId: sentId }, true);
    if (result) { requestId.current = null; setCoverageGain(Math.max(0, (result.coverage?.answered ?? previousCoverage) - previousCoverage)); }
    else if (mounted.current && current.current.document?.lastRequestId !== sentId) {
      answerRef.current = text; setAnswer(text); setDraftState('error');
    }
    if (mounted.current) setPendingReply(null);
    return result;
  }

  async function confirm() {
    const choices: InterviewSelection[] = validProposals.map(proposal => ({ id: proposal.id, values: selections[proposal.id] ?? (proposal.needsClarification ? [] : proposal.values) }));
    if (!choices.length || choices.some(choice => !choice.values.length)) return;
    const result = await call('confirm', { choices, shareReview, ...(profileChoices.length ? { profileChoices: profileChoices.map(({id,values,mode,exclude})=>({id,values,mode,exclude})) } : {}) });
    if (result?.document) {
      const selectedProfile = result.document.profileConfirmed?.filter(p=>profileChoices.some(choice=>choice.id===p.id)) ?? [];
      if (selectedProfile.length) profileApplyRef.current?.(selectedProfile);
      if (result.document.confirmed.length) { onApply(result.document.confirmed); setApplied(true); }
      else setSharingSaved(true);
      feedback('success');
    }
  }

  async function saveProfileCapture() {
    if (activeRequest.current?.action === 'draft' && !await afterDraft('profileConfirm')) return;
    if (!profileChoices.length) return;
    const result = await call('profileConfirm', { profileChoices: profileChoices.map(({id,values,mode,exclude})=>({id,values,mode,exclude})) });
    if (result?.document) {
      const selected = result.document.profileConfirmed?.filter(p=>profileChoices.some(choice=>choice.id===p.id)) ?? [];
      if (selected.length) profileApplyRef.current?.(selected);
      setProfileReview(false); feedback('success');
    }
  }

  async function saveSharing() {
    const choices = (current.current.document?.confirmed ?? []).map(({ id, values }) => ({ id, values }));
    const result = await call('confirm', { choices, shareReview });
    if (result) { setSharingSaved(true); feedback('selection'); }
  }

  function changeAnswer(value: string) { answerRef.current = value; setAnswer(value); setDraftState('pending'); }
  function changeProfileChoice(choice:ProfileChoice) { setProfileEdits(previous=>({...previous,[choice.id]:choice}));setEditedProfile(previous=>previous.includes(choice.id)?previous:[...previous,choice.id]); }
  const validProposals = (doc?.proposals ?? []).filter(item => (!onboarding || item.kind !== 'beena') && proposalOptions(item).length > 0);
  const profileProposals = (doc?.profileProposals ?? []).filter(p => Boolean(profileField(p.fieldId)));
  const profileChoices = profileProposals.flatMap(p => {
    const choice = profileEdits[p.id];
    return choice && (!p.needsClarification || editedProfile.includes(p.id)) && !ignoredProfile.includes(p.id) && (!profileField(p.fieldId)?.sensitive || sensitiveProfileAllowed) && validProfileProposalValues(choice) ? [choice] : [];
  });
  const captureBadge=(change:MessageChange)=>change.profile&&profileField(change.id.slice('profile:'.length))?.sensitive&&!sensitiveProfileAllowed?'معلّق للموافقة':change.changed?'تغيّر':'أُضيف للملخص';
  const currentTopic = topics.find(topic => topic.id === doc?.currentQuestion?.topic);
  const coverage = snapshot.coverage;
  const progress = coverage?.required ? Math.min(1, Math.max(0, coverage.answered / coverage.required)) : 0;
  const progressLabel = progress >= .85 ? 'نوضح آخر التفاصيل' : progress >= .45 ? 'الصورة تتضح' : 'نتعرّف إليك';
  const responding = busy === 'answer' || busy === 'retry' || queuedIntent === 'answer';
  const showPendingReply = pendingReply && doc?.lastRequestId !== pendingReply.id;
  const reviewMode = fallbackReview || doc?.status === 'review' || doc?.status === 'confirmed';
  const saveMessage = busy === 'draft' || draftState === 'pending' ? 'جارٍ الحفظ…' : draftState === 'error' ? 'تعذّر حفظ آخر كتابة' : 'محفوظ بخصوصية';
  const actionBlocked = !!queuedIntent || (!!busy && busy !== 'draft');
  const unavailable = snapshot.fallbackAvailable === true && doc?.pendingAnalysis === true;
  const unresolved = validProposals.filter(proposal => !(selections[proposal.id] ?? (proposal.needsClarification ? [] : proposal.values)).length).length;
  const incomplete = Boolean(snapshot.coverage && snapshot.coverage.answered < snapshot.coverage.required);
  const isChat = Boolean(loaded && doc && !applied && !reviewMode && !profileReview);
  useEffect(() => {
    if (unavailable && !failureNotified.current) { failureNotified.current = true; unavailableCallback.current?.(); }
  }, [unavailable]);
  function useFallback() {
    if (!unavailable) return;
    if (validProposals.length && onFallbackApply) {
      setSelections(Object.fromEntries(validProposals.map(proposal => [proposal.id, selections[proposal.id] ?? (proposal.needsClarification ? [] : proposal.values)])));
      setFallbackReview(true);
    } else { unavailableCallback.current?.(); onDirectQuestions(); }
  }
  function finishFallbackReview() {
    if (!unavailable || !fallbackReview) return;
    const reviewed = validProposals.flatMap(proposal => {
      const values = selections[proposal.id] ?? (proposal.needsClarification ? [] : proposal.values);
      return values.length && values.every(value => proposalOptions(proposal).some(option => option.value === value)) ? [{ ...proposal, values, needsClarification: false }] : [];
    });
    if (reviewed.length) onFallbackApply?.(reviewed);
    setFallbackReview(false);
    unavailableCallback.current?.(); onDirectQuestions();
  }

  return createPortal(<dialog ref={dialog} className="wi-dialog" dir="rtl" aria-labelledby="wi-dialog-name" data-chat={isChat || undefined} onCancel={event => { event.preventDefault(); void close(); }}>
    <div className="wi-shell">
      <header className="wi-header"><div><img src="/brand/wudayn-emblem-v2.png" width="27" height="31" alt=""/><span id="wi-dialog-name">جلسة التوافق<small>مرافقك الذكي في وُدَين</small></span></div><button type="button" className="wi-icon" onClick={() => void close()} disabled={!!queuedIntent || (!!busy && !['draft','answer','review','retry'].includes(busy))} aria-label="حفظ وإغلاق الجلسة"><X size={20}/></button></header>
      <div className="wi-content" data-chat={isChat || undefined}>
        {!loaded ? <div className="wi-loading" role="status"><TypingDots/><p>نفتح جلستك…</p>{error && <button type="button" className="wi-link" onClick={() => void call('load', {}, true).then(result => result && setLoaded(true))}>إعادة المحاولة</button>}</div>
        : !doc ? <section className="wi-welcome">
          <span className="wi-welcome-emblem" aria-hidden="true"><img src="/brand/wudayn-emblem-v2.png" width="42" height="49" alt=""/></span>
          <h1 id="wi-title" ref={heading} tabIndex={-1}>نتعرّف إليك، بكلماتك.</h1>
          <p className="wi-lead">حوار خفيف عن حياتك وما تريده من الزواج. إجابة واحدة قد توضّح أكثر من جانب، ثم تراجع ملخصك مرة واحدة.</p>
          <p className="wi-screening-note"><HeartHandshake size={16} aria-hidden="true"/>جزء من طلب العضوية، لتوضيح نية الزواج وتوقعاتك.</p>
          {!consentGranted && <div className="wi-consent"><label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/><span>أوافق على تحليل إجاباتي بالذكاء الاصطناعي لتكوين تقييمي، وحفظ الجلسة بشكل خاص في حسابي.</span></label><details><summary>خصوصية الجلسة <ChevronDown size={13}/></summary><p>تُرسل إجابات الجلسة إلى مزوّد معالجة خارجي، وتُحفظ الجلسة الخاصة لمدة ٣٠ يومًا من آخر تحديث ويمكنك حذفها. لا ترسل أرقام هوية أو معلومات تخص أشخاصًا آخرين. الحوار لا يظهر للأعضاء.</p><p>هذا مرافق آلي للتعارف، وليس مستشارًا بشريًا أو تشخيصًا نفسيًا. تُراجع الإجابات قبل اعتمادها.</p></details></div>}
          <MotionPressButton className="wi-button wi-button-primary wi-wide" disabled={(!consent && !consentGranted) || !!busy} onClick={() => void call('start', { consentVersion: 'wudayn-interview-v1' }, true)}>{busy === 'start' ? 'نجهّز جلستك…' : 'ابدأ الحوار'}<ArrowLeft size={18}/></MotionPressButton>
        </section>
        : profileReview ? <section className="wi-profile-review">
          <button className="wi-link" type="button" onClick={()=>setProfileReview(false)} disabled={actionBlocked}>العودة إلى الحوار <ArrowLeft size={15}/></button>
          <h1 id="wi-title" ref={heading} tabIndex={-1}>ملفك يتشكّل من كلامك</h1>
          <p className="wi-lead">هذه التفاصيل التي فهمناها. عدّل ما يحتاج، ثم أضفها إلى مسودتك بخطوة واحدة. لا تُنشر قبل إرسال الملف.</p>
          <div className="wi-profile-capture-list">{profileProposals.map(proposal=><ProfileProposalReview key={proposal.id} proposal={proposal} choice={profileEdits[proposal.id]} restricted={Boolean(profileField(proposal.fieldId)?.sensitive&&!sensitiveProfileAllowed)} ignored={ignoredProfile.includes(proposal.id)} onChange={changeProfileChoice} onIgnore={()=>setIgnoredProfile(previous=>previous.includes(proposal.id)?previous.filter(id=>id!==proposal.id):[...previous,proposal.id])}/>)}</div>
          {profileChoices.length<profileProposals.length-ignoredProfile.length && <p className="wi-review-attention">التفاصيل غير الواضحة تبقى معلّقة حتى توضّحها؛ لن نملأها بالتخمين.</p>}
          <MotionPressButton className="wi-button wi-button-primary wi-wide" disabled={actionBlocked || doc.pendingAnalysis || !profileChoices.length} onClick={()=>void saveProfileCapture()}>{busy==='profileConfirm'?'نحفظ التعديلات…':`إضافة ${number(profileChoices.length)} تفاصيل إلى مسودتي`}<Check size={17}/></MotionPressButton>
        </section>
        : applied ? <section className="wi-complete"><span className="wi-complete-mark" aria-hidden="true"><Check size={30}/></span><h1 id="wi-title" ref={heading} tabIndex={-1}>تمّ حفظ ملخصك</h1><p>أضفنا إجاباتك إلى مسودة ملفك. يمكنك مراجعتها قبل إرساله.</p><MotionPressButton className="wi-button wi-button-primary wi-wide" onClick={onClose}>{onboarding ? 'متابعة إعداد الملف' : 'العودة إلى ملفي'} <ArrowLeft size={18}/></MotionPressButton><button type="button" className="wi-link wi-centered" onClick={() => setApplied(false)}>عرض الملخص</button></section>
        : reviewMode ? <section className="wi-review">
          <h1 id="wi-title" ref={heading} tabIndex={-1}>{fallbackReview ? 'نكمل من حيث وصلنا' : 'هذا ما فهمناه عنك'}</h1><p className="wi-lead">{fallbackReview ? 'راجع ما فهمناه حتى الآن وعدّل ما يحتاج إلى تصحيح. نحفظ ما راجعته، ثم تجيب عن النقاط المتبقية فقط.' : 'هذه إجاباتك كما فهمناها من الحوار. افتح أي قسم للتفاصيل أو التعديل، ثم اعتمد الملخص كاملًا بخطوة واحدة.'}</p>
          {doc.pendingAnalysis && !fallbackReview && <div className="wi-notice"><p>إجاباتك محفوظة، لكن تحليلها لم يكتمل.</p><button type="button" className="wi-link" onClick={() => void call(doc.status === 'confirmed' ? 'review' : 'retry')} disabled={!!busy}><RotateCcw size={14}/> إعادة المحاولة</button></div>}
          {unresolved > 0 && <p className="wi-review-attention" role="status">{fallbackReview ? 'النقاط التي لم تتضح بعد ستبقى لك لتجيب عنها مباشرة.' : <>نحتاج توضيح {number(unresolved)} {unresolved === 1 ? 'إجابة' : 'إجابات'} قبل اعتماد الملخص.</>}</p>}
          {validProposals.length ? (['self','partner','personality','importance'] as const).map(side => {
            const group = validProposals.filter(proposal => side === 'personality' ? proposal.kind === 'personality' : proposal.kind !== 'personality' && proposal.side === side);
            if (!group.length) return null;
            const needsCorrection = group.some(proposal => !(selections[proposal.id] ?? (proposal.needsClarification ? [] : proposal.values)).length);
            return <details className="wi-review-group" key={side} open={needsCorrection || undefined}><summary><span><strong>{side === 'personality' ? 'طريقتك في الحياة والتواصل' : side === 'self' ? 'عن حياتك' : side === 'partner' ? 'ما تريده في شريكك' : 'أولوياتك'}</strong><small>{number(group.length)} إجابة · {needsCorrection ? 'تحتاج توضيحك' : 'عرض التفاصيل والتعديل'}</small></span><ChevronDown size={17}/></summary><div className="wi-review-rows">{group.map(proposal => <ProposalReview key={proposal.id} proposal={proposal} values={selections[proposal.id] ?? (proposal.needsClarification ? [] : proposal.values)} onValues={values => { setSelections(previous => ({ ...previous, [proposal.id]: values })); setApplied(false); }}/>)}</div></details>;

          }) : <div className="wi-notice"><p>لم يتكوّن ملخص واضح بعد. نحتاج أن نكمل الحوار دون تخمين إجاباتك.</p></div>}
          {!!profileProposals.length && <details className="wi-review-group wi-profile-group"><summary><span><strong>ملفك وما يناسبك في الشريك</strong><small>{number(profileProposals.length)} تفاصيل من الحوار · راجعها قبل الاعتماد</small></span><ChevronDown size={17}/></summary><div className="wi-profile-capture-list">{profileProposals.map(proposal=><ProfileProposalReview key={proposal.id} proposal={proposal} choice={profileEdits[proposal.id]} restricted={Boolean(profileField(proposal.fieldId)?.sensitive&&!sensitiveProfileAllowed)} ignored={ignoredProfile.includes(proposal.id)} onChange={changeProfileChoice} onIgnore={()=>setIgnoredProfile(previous=>previous.includes(proposal.id)?previous.filter(id=>id!==proposal.id):[...previous,proposal.id])}/>)}</div></details>}
          {!!doc.readiness.length && <details className="wi-private-notes"><summary>عن خطوتك القادمة <ChevronDown size={14}/></summary><ul>{doc.readiness.map(note => <li key={note.id}>{note.text}</li>)}</ul></details>}
          {!!doc.clarifications.length && <details className="wi-private-notes"><summary>نقاط للحوار لاحقًا <ChevronDown size={14}/></summary><ul>{doc.clarifications.map(note => <li key={note.id}>{note.text}</li>)}</ul></details>}
          {!fallbackReview && <details className="wi-sharing-options"><summary>مشاركة الملخص مع فريق العضوية <ChevronDown size={14}/></summary><label className="wi-sharing"><input type="checkbox" checked={shareReview} disabled={doc.pendingAnalysis} onChange={event => { setShareReview(event.target.checked); setSharingSaved(false); }}/><span>أشارك ملخص الاستعداد ونقاط التوضيح فقط.<small>اختياري. الحوار وإجابات التوافق تبقى خاصة.</small></span></label>{shareReview !== doc.reviewSharing && <button type="button" className="wi-link wi-sharing-save" disabled={!!busy || doc.pendingAnalysis} onClick={() => void saveSharing()}>{shareReview ? 'حفظ خيار المشاركة فقط' : 'سحب مشاركة الملخص فقط'}</button>}{sharingSaved && <p className="wi-sharing-saved" role="status"><Check size={14}/>حُفظ خيار المشاركة، دون تغيير إجابات ملفك.</p>}</details>}
          {incomplete && !fallbackReview && <p className="wi-review-attention">بقيت نقاط نحتاج إجابتك عنها لنكمل التقييم.</p>}
          {fallbackReview ? <MotionPressButton className="wi-button wi-button-primary wi-wide" disabled={!!busy} onClick={finishFallbackReview}>اعتماد ما راجعته وإكمال المتبقي<ArrowLeft size={18}/></MotionPressButton> : <MotionPressButton className="wi-button wi-button-primary wi-wide" onClick={() => void confirm()} disabled={!!busy || doc.pendingAnalysis || unresolved > 0 || incomplete || !validProposals.length}>{busy === 'confirm' ? 'جارٍ الحفظ…' : 'هذا يمثّلني، اعتماد الملخص'}<Check size={18}/></MotionPressButton>}
          {!fallbackReview && (incomplete || !validProposals.length) && <button type="button" className="wi-link wi-centered" disabled={!!busy} onClick={() => void call('resume', {}, true).then(result => { if (result) { setApplied(false); setSharingSaved(false); } })}>إكمال الحوار <ArrowLeft size={14}/></button>}
        </section>
        : <section className="wi-chat" aria-label="الحوار مع مرافق وُدَين">
          <div className="wi-session-compass">
            <div className="wi-chat-context"><span><HeartHandshake size={15}/>{progressLabel}</span><span><LockKeyhole size={12}/> حوار خاص</span></div>
            {coverage && <div className="wi-session-progress" role="progressbar" aria-label="النقاط التي اتضحت من الحوار" aria-valuemin={0} aria-valuemax={coverage.required} aria-valuenow={coverage.answered}><span style={{transform:`scaleX(${progress})`}}/></div>}
            {!!profileProposals.length && <button className="wi-profile-summary-link" type="button" onClick={()=>setProfileReview(true)} disabled={actionBlocked}><span><Pencil size={13}/>{number(profileProposals.length)} تفاصيل لملفك وتفضيلاتك</span><span>مراجعة <ArrowLeft size={13}/></span></button>}
          </div>
          <div className="wi-thread" ref={thread} role="log" aria-label="رسائل الجلسة" aria-relevant="additions" aria-live="polite" onScroll={event=>{const el=event.currentTarget;followConversation.current=el.scrollHeight-el.scrollTop-el.clientHeight<90;}}>
            {openingTurn && <div className="wi-opening-note"><span>ابدأ من قصتك.</span><p>عرّفنا عن حياتك وما تريده من الزواج في فقرة واحدة. سنفهم منها ما نستطيع، ثم نسأل فقط عمّا بقي.</p></div>}
            {doc.turns.map((turn,index) => <div className="wi-exchange" key={turn.id}>
              {(index===0 || doc.turns[index-1].topic!==turn.topic) && <div className="wi-topic-divider"><span>{topics.find(topic=>topic.id===turn.topic)?.title ?? 'نتعرّف إليك'}</span></div>}
              <div className="wi-bubble wi-bubble-guide wi-bubble-history"><p>{turn.question}</p></div>
              <div className="wi-bubble wi-bubble-member"><p dir="auto">{turn.skipped ? 'لم تُجب عن هذا السؤال بعد' : turn.answer}</p></div>
              {!!captures[turn.id]?.length && <div className="wi-message-captures" role="status" aria-label="ما أضافته هذه الرسالة"><span className="wi-capture-caption"><Check size={13}/>من رسالتك · {number(captures[turn.id].length)} تفاصيل اتضحت</span><div>{captures[turn.id].map(change=><button key={change.id} type="button" className="wi-capture-chip" data-changed={change.changed || undefined} disabled={!change.profile || actionBlocked} onClick={()=>setProfileReview(true)} title={change.value}><small>{captureBadge(change)}</small><span>{change.title}</span>{change.profile&&<Pencil size={11}/>}</button>)}</div></div>}
            </div>)}
            <div className="wi-bubble wi-bubble-guide wi-current-question" key={doc.currentQuestion?.text} data-settled={responding || undefined}><span className="wi-speaker"><img src="/brand/wudayn-emblem-v2.png" width="18" height="21" alt=""/>{openingTurn ? 'بدايتك' : currentTopic?.title ?? 'نتعرّف إليك'}</span><p>{doc.currentQuestion?.text ?? 'ما الذي تود إضافته عمّا تبحث عنه؟'}</p></div>
            {showPendingReply && <div className="wi-bubble wi-bubble-member wi-new-answer"><p dir="auto">{pendingReply.text}</p><small>جارٍ الإرسال</small></div>}
            {responding && <div className="wi-typing" role="status" aria-label="وُدَين يكتب"><TypingDots/><span>نربط كلامك بما يهمّك…</span></div>}
            {!responding && coverageGain > 1 && !captures[doc.turns.at(-1)?.id ?? '']?.length && <div className="wi-coverage-note" key={doc.lastRequestId} role="status"><Check size={13} aria-hidden="true"/><span>إجابتك وضّحت {number(coverageGain)} نقاط دفعة واحدة</span></div>}
          </div>
          <form className="wi-composer" data-opening={openingTurn || undefined} onSubmit={event => { event.preventDefault(); void send(); }}>
            {answerHelp && <p id="wi-answer-help" className="wi-answer-help">{openingTurn ? 'تكلم بطريقتك عن حياتك اليوم، طباعك، ما تبحث عنه في شريكك، وما يعنيه لك الزواج الجاد والخطوة الرسمية. فقرة واحدة قد تختصر عدة أسئلة.' : 'ابدأ بموقف من حياتك: وش صار، كيف تصرّفت، ووش كنت تتمنى؟ وإذا ما عندك تجربة، قل لنا كيف تتخيلها. ما تحتاج تصيغ كلامك بشكل مثالي.'}</p>}
            {openingTurn && !answer.trim() && <div className="wi-intro-cues" aria-label="أفكار تساعدك في التعريف"><span>عنّك</span><span>حياتك اليوم</span><span>الشريك الذي تبحث عنه</span><span>استعدادك للزواج</span></div>}
            {!answer.trim() && !!doc.currentQuestion?.suggestions.length && <div className="wi-chat-suggestions" aria-label="إجابات سريعة، اضغط لإرسال اختيارك">{doc.currentQuestion.suggestions.slice(0,4).map(suggestion => <MotionPressButton type="button" key={suggestion} disabled={actionBlocked || doc.pendingAnalysis} onClick={() => void send(false, suggestion)}>{suggestion}</MotionPressButton>)}</div>}
            <div className="wi-compose-row"><button className="wi-send" type="submit" disabled={actionBlocked || doc.pendingAnalysis || !answer.trim()} aria-label="إرسال الرسالة"><ArrowUp size={20}/></button><textarea ref={composer} id="wi-answer" aria-label="رسالتك" aria-describedby={answerHelp ? 'wi-answer-help' : undefined} value={answer} onChange={event => changeAnswer(event.target.value)} maxLength={1200} rows={openingTurn ? 4 : 1} wrap="soft" placeholder={openingTurn ? 'عرّفنا عن نفسك، وعن الزواج والشريك الذي تبحث عنه…' : 'قل لنا بطريقتك…'} autoComplete="off" spellCheck dir="rtl" lang="ar" disabled={actionBlocked || doc.pendingAnalysis}/></div>
            <div className="wi-compose-meta"><span role="status">{responding ? 'نقرأ إجابتك' : saveMessage}</span><button type="button" aria-expanded={answerHelp} aria-controls="wi-answer-help" onClick={()=>setAnswerHelp(value=>!value)}>كيف أبدأ؟</button>{answer.length > 1000 && <span>{number(answer.length)} / ١٢٠٠</span>}<button type="button" onClick={() => void close()} disabled={actionBlocked}>إكمال لاحقًا</button></div>
          </form>
        </section>}
        {error && <div className="wi-error" role="alert"><p>{error}</p>{/conflict|revision|stale/.test(errorCode) && <button type="button" className="wi-link" disabled={!!busy} onClick={() => void call('load', {}, true)}>استعادة آخر نسخة محفوظة</button>}</div>}
        {isChat && doc?.pendingAnalysis && !unavailable && <div className="wi-recovery" role="status"><p>إجابتك محفوظة. نحتاج إكمال تحليلها قبل السؤال التالي.</p><button type="button" className="wi-link" onClick={() => void call('retry', {}, true)} disabled={actionBlocked}>إعادة المحاولة</button></div>}
        {unavailable && !applied && !fallbackReview && <div className="wi-recovery" role="status"><p>تعذّر إكمال الحوار الآن. إجاباتك محفوظة؛ يمكنك المحاولة مجددًا أو إكمال النقاط المتبقية مباشرة.</p>{doc && <button type="button" className="wi-link" onClick={() => void call('retry', {}, true)} disabled={actionBlocked}>إعادة المحاولة</button>}<button type="button" className="wi-link" onClick={useFallback} disabled={actionBlocked}>إكمال الأسئلة مباشرة</button></div>}
        {doc && !applied && !isChat && <footer className="wi-private-footer"><span><LockKeyhole size={12}/> حوارك لا يظهر للأعضاء</span><button type="button" className="wi-link" onClick={() => setDeleteWarning(value => !value)} disabled={!!busy}><Trash2 size={13}/> حذف الجلسة</button></footer>}
        {deleteWarning && <div className="wi-delete-warning" role="alert"><p>حذف الحوار والملخص الخاص؟ إجاباتك التي سبق حفظها في الملف لا تتغير.</p><div><button className="wi-button" type="button" onClick={() => setDeleteWarning(false)}>تراجع</button><button className="wi-button wi-button-danger" type="button" disabled={!!busy} onClick={() => void call('delete', {}, true).then(result => { if (result) { setDeleteWarning(false); setApplied(false); setSharingSaved(false); autoStarted.current = true; } })}>حذف الجلسة</button></div></div>}
      </div>
    </div>
  </dialog>, document.body);
}

function TypingDots() { return <span className="wi-loading-dots" aria-hidden="true"><i/><i/><i/></span>; }

function ProfileProposalReview({proposal,choice,ignored,restricted=false,onChange,onIgnore}:{proposal:ProfileProposal;choice?:ProfileChoice;ignored:boolean;restricted?:boolean;onChange:(choice:ProfileChoice)=>void;onIgnore:()=>void}) {
  const field=profileField(proposal.fieldId);
  if(!field)return null;
  const value=choice??{id:proposal.id,fieldId:proposal.fieldId,values:proposal.needsClarification?[]:proposal.values,mode:proposal.mode,exclude:proposal.exclude};
  const options=profileProposalOptions(proposal),label=profileProposalLabel(proposal);
  const valid=validProfileProposalValues(value),multiple=field.kind==='set'||field.criterionShape==='values';
  const change=(patch:Partial<ProfileChoice>)=>onChange({...value,...patch});
  return <details className="wi-profile-proposal" data-ignored={ignored||undefined} open={!valid&&!ignored||undefined}>
    <summary><span><small>{label}{restricted?' · يتطلب موافقة التفاصيل الاختيارية':''}</small><strong>{ignored?'لن يُضاف إلى المسودة':profileProposalValue(value)||'نحتاج توضيحك'}</strong></span><Pencil size={15} aria-hidden="true"/></summary>
    <div className="wi-profile-editor">
      {field.criterionShape&&<label>أهمية هذا التفضيل<select value={value.mode??'prefer'} onChange={event=>change({mode:event.target.value as ProfileChoice['mode'],...(event.target.value==='any'?{values:[],exclude:false}:{})})}><option value="prefer">أفضل</option><option value="require">شرط أساسي</option><option value="any">لا تفضيل محدد</option></select></label>}
      {value.mode!=='any'&&field.criterionShape!=='mode'&&(field.kind==='text'?<label>{label}<textarea dir="rtl" rows={3} maxLength={field.maxLength??600} value={value.values[0]??''} onChange={event=>change({values:[event.target.value]})}/></label>
        :field.kind==='range'?<fieldset><legend>{label}</legend><div className="wi-profile-range"><label>من<input type="number" inputMode="numeric" min={field.min} max={field.max} value={value.values[0]??''} onChange={event=>change({values:[event.target.value,value.values[1]??'']})}/></label><label>إلى<input type="number" inputMode="numeric" min={field.min} max={field.max} value={value.values[1]??''} onChange={event=>change({values:[value.values[0]??'',event.target.value]})}/></label></div></fieldset>
        :field.kind==='number'?<label>{label}<input type="number" inputMode="numeric" min={field.min} max={field.max} value={value.values[0]??''} onChange={event=>change({values:[event.target.value]})}/></label>
        :multiple?<fieldset><legend>{label}</legend><div className="wi-profile-options">{options.map(option=><label key={option.value}><input type="checkbox" checked={value.values.includes(option.value)} onChange={event=>change({values:event.target.checked?[...value.values,option.value]:value.values.filter(item=>item!==option.value)})}/><span>{option.label}</span></label>)}</div></fieldset>
        :<label>{label}<select value={value.values[0]??''} onChange={event=>change({values:[event.target.value]})}><option value="" disabled>اختر ما يمثلك</option>{options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}
      {field.allowExclude&&value.mode!=='any'&&<label className="wi-profile-exclude"><input type="checkbox" checked={value.exclude} onChange={event=>change({exclude:event.target.checked})}/><span>استبعاد الخيارات المحددة</span></label>}
      {!valid&&!ignored&&<p className="wi-profile-uncertain">وضّح هذه النقطة لتُضاف، أو اتركها للحديث لاحقًا.</p>}
      {restricted&&<p className="wi-profile-uncertain">لن تُضاف هذه المعلومة. يمكنك تفعيل التفاصيل الاختيارية عند إعداد ملفك إذا رغبت.</p>}
      <details className="wi-evidence"><summary>من كلامك <ChevronDown size={13}/></summary>{proposal.evidence.map((e,index)=><blockquote key={index}>{e.quote}</blockquote>)}</details>
      <button className="wi-link" type="button" onClick={onIgnore}>{ignored?'إعادة الاقتراح':'تجاهل هذا الاقتراح'}</button>
    </div>
  </details>;
}

function ProposalReview({ proposal, values, onValues }: { proposal: InterviewProposal; values: string[]; onValues: (values: string[]) => void }) {
  const options = proposalOptions(proposal);
  const multiple = proposal.kind === 'beena' && proposal.side === 'partner';
  const label = options.filter(option => values.includes(option.value)).map(option => option.label).join('، ');
  return <details className="wi-proposal" open={!values.length || undefined}>
    <summary className="wi-proposal-summary"><span><small>{proposalTitle(proposal)}</small>{proposalStatement(proposal) && <span className="wi-personality-statement">{proposalStatement(proposal)}</span>}<strong>{label || 'نحتاج توضيحك لهذه النقطة'}</strong></span><Pencil size={16} aria-label="تعديل الإجابة"/></summary>
    <div className="wi-proposal-editor"><fieldset><legend>{proposalSide(proposal)}</legend>{multiple ? <div className="wi-multiple">{options.map(option => <label key={option.value}><input type="checkbox" checked={values.includes(option.value)} onChange={event => onValues(event.target.checked ? [...values, option.value] : values.filter(value => value !== option.value))}/><span>{option.label}</span></label>)}</div> : <select value={values[0] ?? ''} onChange={event => onValues([event.target.value])} aria-label={`تعديل ${proposalTitle(proposal)}: ${proposalSide(proposal)}`}><option value="" disabled>اختر ما يمثّلك</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}</fieldset><details className="wi-evidence"><summary>من كلامك <ChevronDown size={13}/></summary><p>{proposal.summary}</p>{proposal.evidence.map((evidence, index) => <blockquote key={`${evidence.turnId}-${index}`}>{evidence.quote}</blockquote>)}</details></div>
  </details>;
}
