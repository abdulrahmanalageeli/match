import { interviewWritingDrafts } from './writingDraft';
import { groundedSuggestions } from './openingEvidence';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowUp, Check, ChevronDown, HeartHandshake, LockKeyhole, Pencil, RotateCcw, Trash2, X } from '../BrandIcons';
import { MotionPressButton } from '../motion/Reanimated';
import { feedback } from '../feedback/haptics';
import { InterviewError, requestInterview, type InterviewAuth } from './api';
import { ConfirmedAnswers, HybridAssessment, LunaSessionSteps, OpeningInsights } from './HybridAssessment';
import { parentingApplicable, parentingContext } from '../compatibility/parenting.mjs';
import { proposalOptions, proposalSide, proposalStatement, proposalTitle, type InterviewSelection } from './model';
import { profileField, profileProposalLabel, profileProposalValue, profileProposalOptions, validProfileProposalValues, type ProfileContext, type ProfileProposal } from './profileCapture';
import topics from './catalog.json';
import openingScenarios from './opening-scenarios.json';
import openingPrompts from './opening-prompts.json';
import type { InterviewDocument, InterviewProposal, InterviewSnapshot } from './types';
import './interview.css';
import './luna-journey.css';

const number = (value: number) => value.toLocaleString('ar-SA');
const interviewChapters = [
  { id: 'self', label: 'حياتك وشخصيتك', shortLabel: 'أنت', topics: ['intent', 'communication'] },
  { id: 'partner', label: 'الشريك اللي يناسبك', shortLabel: 'الشريك', topics: ['closeness', 'family'] },
  { id: 'shared', label: 'الحياة الزوجية', shortLabel: 'الحياة معًا', topics: ['practical', 'everyday'] },
] as const;
type ProfileChoice = Pick<ProfileProposal, 'id' | 'fieldId' | 'values' | 'mode' | 'exclude'>;
type MessageChange = { id: string; title: string; value: string; changed: boolean; profile: boolean };
const captureSignature = (proposal: { values: string[]; mode?: unknown; exclude?: unknown }) => JSON.stringify([proposal.values, proposal.mode, proposal.exclude]);
function messageChanges(before: InterviewSnapshot, after: InterviewSnapshot, hybrid: boolean): MessageChange[] {
  const doc = after.document;
  if (!doc || doc.pendingAnalysis || doc.lastMode !== 'luna') return [];
  const lastTurn = doc.turns.at(-1)?.id;
  const previous = new Map([...(before.document?.proposals ?? []), ...(before.document?.profileProposals ?? [])].map(p => [p.id, captureSignature(p)]));
  return [
    ...doc.proposals.filter(p => (!hybrid || after.carryForwardIds?.includes(p.id)) && !p.needsClarification && p.evidence.some(e => e.turnId === lastTurn)).map(p => ({ id: p.id, title: `${proposalTitle(p)} · ${proposalSide(p)}`, value: proposalOptions(p).filter(o => p.values.includes(o.value)).map(o => o.label).join('، '), changed: previous.has(p.id), profile: false, signature: captureSignature(p) })),
    ...(doc.profileProposals ?? []).filter(p => !p.needsClarification && p.evidence.some(e => e.turnId === lastTurn)).map(p => ({ id: p.id, title: profileProposalLabel(p), value: profileProposalValue(p), changed: previous.has(p.id), profile: true, signature: captureSignature(p) })),
  ].filter(p => previous.get(p.id) !== p.signature);
}

function renderLunaMessage(text: string, animate = false, singleClass?: string) {
  const paragraphs = text.split(/\u2029|\n\s*\n/);
  const msPerCharacter = Math.min(26, 1150 / Math.max(1, text.length));
  let offset = 0;
  function contents(paragraph: string) {
    if (!animate) return paragraph;
    return paragraph.split(/(\s+)/u).map((word, index) => {
      if (!word.trim()) return word;
      const delay = offset;
      offset += word.length * msPerCharacter;
      return <span key={index} className="wi-type-word" style={{animationDelay: `${delay}ms`, animationDuration: `${offset - delay}ms`, animationTimingFunction: `steps(${word.length}, end)`}}>{word}</span>;
    });
  }
  if (paragraphs.length !== 2) return <p className={singleClass}>{contents(text)}</p>;
  return <><p className="wi-reflection">{contents(paragraphs[0])}</p><p className="wi-next-question">{contents(paragraphs[1])}</p></>;
}

function OpeningExample({ nextStep = false }: { nextStep?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const id = nextStep ? 'wi-next-step-example' : 'wi-opening-example';
  useEffect(() => {
    if (!expanded) return;
    const timer = window.setTimeout(() => setExpanded(false), 10_000);
    return () => window.clearTimeout(timer);
  }, [expanded]);
  return <div className="wi-opening-example" data-expanded={expanded}>
    <button type="button" aria-controls={id} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
      {nextStep ? 'كيف أبدأ؟' : 'شوف كيف تختصر الأسئلة'}<ChevronDown size={16} aria-hidden="true"/>
    </button>
    <div id={id} className="wi-example-panel" aria-hidden={!expanded}>
      <div className="wi-example-clip">
        <div className="wi-example-content">
          {nextStep ? <ul>
            <li>«إذا ارتحنا لبعض، ودي نتكلم أول عن السكن والعمل وكيف كل واحد يتصوّر الحياة بعد الزواج. وإذا تفاهمنا، نرتّب كيف يدخل الأهل.»</li>
            <li>«أرتاح إذا الأهل كانوا بالصورة من بدري، وإذا ناسب الطرف الثاني نتفق معهم على طريقة التعارف.»</li>
          </ul> : <>
            <p>«أبي أطفال، ويهمّني إن الطرف الثاني يبي أطفال بعد. أقدر أنتقل لمدينته، وإذا حصل توافق يناسبني نبدأ الخطوة الرسمية خلال ستة أشهر.»</p>
            <strong>في هذا المثال، تقدر لونا تقترح أربع إجابات للتوافق</strong>
            <dl>
              <div><dt>رغبتك في الإنجاب</dt><dd>ترغب في الإنجاب</dd></div>
              <div><dt>رغبة شريك حياتك</dt><dd>تفضّل شخصًا يرغب في الإنجاب</dd></div>
              <div><dt>مدينة السكن</dt><dd>تقدر تنتقل لمدينة الطرف الثاني</dd></div>
              <div><dt>موعد الخطوة الرسمية</dt><dd>خلال ستة أشهر</dd></div>
            </dl>
          </>}
        </div>
      </div>
    </div>
  </div>;
}

export function InterviewEntry({ available, open }: { available: boolean; open: () => void }) {
  if (!available) return null;
  return <section className="wi-entry" aria-labelledby="wi-entry-title">
    <div className="wi-entry-heading"><span className="wi-mark" aria-hidden="true"><img src="/brand/wudayn-emblem-v2.png" width="30" height="35" alt=""/></span><div><span className="wi-eyebrow">بكلماتك، وعلى راحتك</span><h2 id="wi-entry-title">جلسة التوافق</h2></div></div>
    <p>احكِ للونا عنك وعن الشريك اللي تتمناه. إذا وضّحت إجابة في كلامك، تجهّزها لونا للمراجعة. بعدها تختار إجابات التوافق المتبقية وتكمل تفاصيل ملفك.</p>
    <div className="wi-entry-footer"><span><LockKeyhole size={13} aria-hidden="true"/> خاصة بك · يمكنك إكمالها لاحقًا</span><MotionPressButton className="wi-button wi-button-primary" onClick={open}>ابدأ الحوار مع لونا <ArrowLeft size={17} aria-hidden="true"/></MotionPressButton></div>
  </section>;
}

type Props = {
  open: boolean;
  auth: InterviewAuth;
  onClose: () => void;
  onDirectQuestions?: () => void;
  onboarding?: boolean;
  consentGranted?: boolean;
  direct?: boolean;
  onUnavailable?: () => void;
  onFallbackApply?: (confirmed: InterviewProposal[]) => void;
  onApply: (confirmed: InterviewProposal[]) => void;
  profileContext?: ProfileContext;
  onAssessmentVersion?: (legacy:boolean)=>void;
  assessmentContext?: InterviewSelection[];
  onStructuredDraftChange?: (choices: Record<string, string[]>) => void;
  gender?: 'woman' | 'man';
  hardRequirements?: readonly string[];
  sensitiveProfileAllowed?: boolean;
  onProfileApply?: (confirmed: ProfileProposal[], document: InterviewDocument) => void;
};

export function InterviewPanel({ open, auth, onClose, onDirectQuestions = onClose, onboarding = false, direct = false, consentGranted = false, onUnavailable, onFallbackApply, onApply, profileContext, onAssessmentVersion, assessmentContext, onStructuredDraftChange, gender, hardRequirements = [], sensitiveProfileAllowed = false, onProfileApply }: Props) {
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
  const [clarifying, setClarifying] = useState<false | 'followUp' | 'correction' | 'nextStep'>(false);
  const [includeProfile,setIncludeProfile] = useState(false);
  const [profileEdits, setProfileEdits] = useState<Record<string, ProfileChoice>>({});
  const [editedProfile, setEditedProfile] = useState<string[]>([]);
  const [ignoredProfile, setIgnoredProfile] = useState<string[]>([]);
  const contextRef = useRef(profileContext); contextRef.current = profileContext;
  const assessmentContextRef = useRef(assessmentContext); assessmentContextRef.current = assessmentContext;
  const sensitiveProfileAllowedRef = useRef(sensitiveProfileAllowed); sensitiveProfileAllowedRef.current = sensitiveProfileAllowed;
  const profileApplyRef = useRef(onProfileApply); profileApplyRef.current = onProfileApply;
  const [answerHelp, setAnswerHelp] = useState(false);
  const answerRef = useRef(answer);
  const [draftState, setDraftState] = useState<'saved'|'pending'|'error'>('saved');
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const thread = useRef<HTMLDivElement>(null);
  const followConversation = useRef(true);
  const firstConversation = useRef(true);
  const composer = useRef<HTMLTextAreaElement>(null);
  const clarifier = useRef<HTMLTextAreaElement>(null);
  const autoStarted = useRef(false);
  const draftInFlight = useRef<string | undefined>(undefined);
  const failureNotified = useRef(false);
  const unavailableCallback = useRef(onUnavailable);
  unavailableCallback.current = onUnavailable;
  const [shareReview, setShareReview] = useState(false);
  const [deleteWarning, setDeleteWarning] = useState(false);
  const [applied, setApplied] = useState(false);
  const [receiptDraft, setReceiptDraft] = useState<Record<string, string[]> | null>(null);
  const [showReceiptSummary, setShowReceiptSummary] = useState(false);
  const [fallbackReview, setFallbackReview] = useState(false);
  const [sharingSaved, setSharingSaved] = useState(false);
  const requestId = useRef<{ answer: string; skip: boolean; id: string } | null>(null);
  const doc = snapshot.document;
  const hybridEnabled = onboarding && Boolean(onStructuredDraftChange);
  const hasOpening = doc?.turns.some(turn => !turn.skipped && turn.answer.trim());
  const openingTurn = Boolean(doc?.status === 'active' && doc.turns.length === 0);
  const nextStepTurn = hybridEnabled && doc?.currentQuestion?.text.split('\u2029').at(-1) === openingPrompts.nextStep;
  const latestStep = doc?.turns.filter(turn => turn.question === openingPrompts.nextStep && !turn.skipped).at(-1);
  const nextStepNote = doc?.readiness.find(note => note.id === 'nextStep' && (!latestStep || note.evidence.some(evidence => evidence.turnId === latestStep.id)));
  const nextStepText = nextStepNote?.text ?? latestStep?.answer;
  const owner = auth.testSession ?? auth.token ?? '';
  const reviewVersion = doc ? JSON.stringify([doc.status, doc.proposals, doc.confirmed]) : '';
  const profileVersion = JSON.stringify(doc?.profileProposals ?? []);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const editedReceiptChoices = useRef(new Set<string>());
  const versionCallback = useRef(onAssessmentVersion); versionCallback.current = onAssessmentVersion;
  const assign = useCallback((next: InterviewSnapshot, replaceAnswer = false) => {
    if (next.document) versionCallback.current?.(next.document.promptVersion !== 'wudayn-interview-5');
    else {
      editedReceiptChoices.current.clear();
      setReceiptDraft(null);
      setShowReceiptSummary(false);
    }
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
    if (action === 'draft') draftInFlight.current = payload.answer as string;
    try {
      const usesContext = ['start', 'answer', 'clarify', 'retry', 'review','structuredConfirm','directConfirm'].includes(action);
      const next = await requestInterview(auth, {
        action,
        ...(action === 'load' || action === 'start' ? {} : { revision: current.current.revision }),
        ...(usesContext ? {
          sensitiveProfileAllowed: sensitiveProfileAllowedRef.current,
          ...(contextRef.current ? { profileContext: contextRef.current } : {}),
          ...(!['structuredConfirm','directConfirm'].includes(action) && !hybridEnabled && assessmentContextRef.current ? { assessmentContext: assessmentContextRef.current } : {}),
        } : {}),
        ...(action === 'retry' && hybridEnabled ? { openingFlow: true } : {}),
        ...payload,
      });
      if (!mounted.current) return null;
      if (['answer','clarify','retry','review'].includes(action) && next.document && !next.document.pendingAnalysis) {
        const changes = messageChanges(before, next, hybridEnabled), turnId = next.document.turns.at(-1)?.id;
        if (turnId && changes.length) setCaptures(previous => ({ ...previous, [turnId]: changes }));
      }
      assign(next, replaceAnswer);
      if (auth.token && action === 'draft' && answerRef.current !== payload.answer)
        void interviewWritingDrafts.save(auth.token, next, answerRef.current).catch(() => {});
      if (auth.token && action === 'load' && replaceAnswer) {
        const restored = await interviewWritingDrafts.restore(auth.token,next).catch(()=>null);
        if (mounted.current && restored !== null && current.current === next && answerRef.current === (next.document?.draftAnswer ?? '')) {
          answerRef.current=restored; setAnswer(restored); setDraftState('pending');
        }
      }
      if (auth.token && ['delete','answer','clarify','confirm','structuredConfirm','directConfirm'].includes(action)) {
        await interviewWritingDrafts.clear(auth.token).catch(()=>{});
      }
      return next;
    } catch (cause) {
      if (mounted.current) {
        setError(cause instanceof Error ? cause.message : 'تعذّر إكمال الخطوة. حاول مجددًا.');
        setErrorCode(cause instanceof InterviewError ? cause.code : 'unavailable');
      }
      if (action !== 'load' && action !== 'draft') {
        try {
          const recovered = await requestInterview(auth, { action: 'load' });
          if (mounted.current) {
            assign(recovered, ['answer', 'clarify'].includes(action) && recovered.document?.lastRequestId === payload.requestId);
            if (['directConfirm','structuredConfirm'].includes(action) && recovered.structuredConfirmation && recovered.document?.status === 'confirmed') {
              const committed = new Map(recovered.document.confirmed.map(item => [item.id, item.values[0]]));
              const submitted = payload.choices as InterviewSelection[];
              const requestedInferred = payload.inferredPartnerIds as string[] | undefined;
              const committedInferred = new Set(recovered.inferredPartnerIds);
              const sameSources = !requestedInferred || (recovered.inferredPartnerIds !== undefined &&
                committedInferred.size === requestedInferred.length && requestedInferred.every(id => committedInferred.has(id)));
              if (sameSources && committed.size === submitted.length && submitted.every(item => committed.get(item.id) === item.values[0])) {
                setError(''); setErrorCode('');
                return recovered;
              }
            }
          }
        } catch { /* Keep the written answer and offer a retry if the connection is still unavailable. */ }
      }
      return null;
    } finally {
      draftInFlight.current = undefined;
      busyRef.current = false; activeRequest.current = null;
      if (mounted.current) setBusy('');
      release();
    }
  }, [owner, assign, hybridEnabled]);

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
    setIncludeProfile(false);
    setIgnoredProfile([]);
    setEditedProfile([]);
  }, [profileVersion]);

  useLayoutEffect(() => {
    if (!open || !loaded) return;
    const viewport = dialog.current?.querySelector<HTMLElement>('.wi-content');
    if (viewport) viewport.scrollTop = 0;
    const title = heading.current ?? viewport?.querySelector<HTMLElement>('.wi-hybrid-stage h1');
    title?.focus({ preventScroll: true });
  }, [open, loaded, doc?.status, applied, fallbackReview, profileReview, !!receiptDraft, showReceiptSummary]);

  useEffect(() => {
    if (!open || !loaded || doc || !consentGranted || autoStarted.current) return;
    autoStarted.current = true;
    void call('start', { consentVersion: 'wudayn-interview-v1', ...(hybridEnabled ? { hybrid: true } : {}) }, true);
  }, [open, loaded, doc, consentGranted, call, hybridEnabled]);
  useLayoutEffect(() => {
    const viewport = thread.current;
    if (open && viewport && (firstConversation.current || followConversation.current)) {
      viewport.scrollTo({top: doc?.turns.length || pendingReply ? viewport.scrollHeight : 0, behavior:'instant'});
      firstConversation.current = false;
    }
  }, [open, doc?.turns.length, doc?.currentQuestion?.text, pendingReply?.id]);
  useEffect(() => {
    const viewport = thread.current;
    if (!open || !viewport || typeof ResizeObserver === 'undefined') return;
    const resize = new ResizeObserver(() => {
      if (doc?.turns.length && document.activeElement === composer.current && followConversation.current) viewport.scrollTop = viewport.scrollHeight;
    });
    resize.observe(viewport);
    return () => resize.disconnect();
  }, [open, loaded, doc?.status, doc?.turns.length, fallbackReview]);
  useLayoutEffect(() => {
    const input = composer.current;
    if (!open || !input) return;
    input.style.height = '0px';
    input.style.height = `${Math.min(140, Math.max(48, input.scrollHeight))}px`;
  }, [answer, open, loaded, doc?.status, fallbackReview]);

  const canSaveText = doc?.status === 'active' || (hybridEnabled && hasOpening && doc?.status === 'review' && doc.lastMode === 'luna' && !doc.pendingAnalysis);
  useEffect(() => {
    if (!open || !doc || !canSaveText || busy || queuedIntent || answer === doc.draftAnswer || draftState === 'error') return;
    setDraftState('pending');
    const timer = window.setTimeout(() => {
      const saving = answerRef.current;
      void call('draft', { answer: saving }).then(result => {
        if (!mounted.current) return;
        setDraftState(!result ? 'error' : answerRef.current === saving ? 'saved' : 'pending');
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [open, answer, doc?.draftAnswer, canSaveText, busy, queuedIntent, draftState, call]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (canSaveText && answerRef.current !== current.current.document?.draftAnswer) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [canSaveText]);

  useEffect(() => {
    const flush = () => {
      if (!document.hidden || busyRef.current || queuedIntentRef.current || !canSaveText
        || answerRef.current === current.current.document?.draftAnswer) return;
      const saving = answerRef.current;
      void call('draft', { answer: saving }).then(result => {
        if (mounted.current) setDraftState(!result ? 'error' : answerRef.current === saving ? 'saved' : 'pending');
      });
    };
    document.addEventListener('visibilitychange', flush);
    return () => document.removeEventListener('visibilitychange', flush);
  }, [call, canSaveText]);

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
      if (['answer', 'clarify', 'review', 'retry'].includes(activeRequest.current?.action ?? '')) onClose();
      return;
    }
    if (activeRequest.current?.action === 'draft' && !await afterDraft('close')) return;
    if (canSaveText && answerRef.current !== current.current.document?.draftAnswer) {
      const saved = await call('draft', { answer: answerRef.current });
      if (!saved) {
        setDraftState('error');
        if (!auth.token || !await interviewWritingDrafts.save(auth.token,current.current,answerRef.current).catch(()=>false)) return;
      }
    }
    onClose();
  }

  async function send(skip = false, quickReply?: string) {
    if (queuedIntentRef.current || current.current.document?.pendingAnalysis) return;
    // A quick choice must never discard a draft the member has already written.
    if (quickReply !== undefined && answerRef.current.trim()) return;
    if (activeRequest.current?.action === 'draft' && !await afterDraft('answer')) return;
    if (quickReply !== undefined && answerRef.current.trim()) return;
    const draftBeforeSend = answerRef.current;
    const text = skip ? '' : quickReply?.trim() ?? draftBeforeSend.trim();
    if (busyRef.current || (!skip && !text)) return;
    if (text.length > answerLimit) { setError(`اختصر إجابتك إلى ${number(answerLimit)} حرف قبل الإرسال.`); return; }
    if (!requestId.current || requestId.current.answer !== text || requestId.current.skip !== skip) requestId.current = { answer: text, skip, id: crypto.randomUUID() };
    const sentId = requestId.current.id;
    followConversation.current = true;
    const previousCoverage = current.current.coverage?.answered ?? 0;
    setPendingReply({ id: sentId, text }); setAnswerHelp(false); setCoverageGain(0);
    answerRef.current = ''; setAnswer(''); feedback('selection');
    const editingNextStep = clarifying === 'nextStep';
    const correction = clarifying === 'correction';
    const result = await call(correction || editingNextStep ? 'clarify' : 'answer', {
      answer: text, ...(correction || editingNextStep ? { verifyChoices: true, ...(editingNextStep ? { editNextStep: true } : {}) } :
        { skip, ...(hybridEnabled ? { hybrid: true, cardsAfterReply: true, openingFlow: clarifying !== 'followUp' } : {}) }), requestId: sentId,
    }, true);
    if (result) { requestId.current = null; setCoverageGain(Math.max(0, (result.coverage?.answered ?? previousCoverage) - previousCoverage)); }
    else if (mounted.current && current.current.document?.lastRequestId !== sentId) {
      answerRef.current = skip ? draftBeforeSend : text;
      setAnswer(answerRef.current); setDraftState('error');
    }
    if (mounted.current) {
      setPendingReply(null);
      if (clarifying && (result || current.current.document?.lastRequestId === sentId)) setClarifying(false);
    }
    return result;
  }

  async function confirm(structuredChoices?: InterviewSelection[], inferredPartnerIds?: string[]) {
    if (activeRequest.current?.action === 'draft' && !await afterDraft('confirm')) return;
    const choices = structuredChoices ?? validProposals.map(proposal => ({ id: proposal.id, values: selections[proposal.id] ?? (proposal.needsClarification ? [] : proposal.values) }));
    if (!choices.length || choices.some(choice => !choice.values.length)) return;
    const approvedProfile = onboarding && !includeProfile ? [] : profileChoices;
    if (structuredChoices && inferredPartnerIds && snapshot.structuredConfirmation) {
      const before=new Map(doc?.confirmed.map(item=>[item.id,item.values[0]]));
      const after=new Map(structuredChoices.map(item=>[item.id,item.values[0]]));
      const retained=(snapshot.inferredPartnerIds??[]).filter(id=>{
        const self=id.replace(/:partner$/,':self');
        return !editedReceiptChoices.current.has(id) && before.get(id)===after.get(id) && before.get(self)===after.get(self);
      });
      inferredPartnerIds=[...new Set([...inferredPartnerIds,...retained])];
    }
    const result = direct && structuredChoices ? await call('directConfirm',{choices,inferredPartnerIds}) : await call(structuredChoices ? 'structuredConfirm' : 'confirm', { choices, shareReview, ...(inferredPartnerIds ? { inferredPartnerIds } : {}), ...(approvedProfile.length ? { profileChoices: approvedProfile.map(({id,values,mode,exclude})=>({id,values,mode,exclude})) } : {}) });
    if (result?.document) {
      const selectedProfile = result.document.profileConfirmed?.filter(p=>profileChoices.some(choice=>choice.id===p.id)) ?? [];
      if (!direct && selectedProfile.length) profileApplyRef.current?.(selectedProfile, result.document);
      if (result.document.confirmed.length) {
        onApply(result.document.confirmed);
        editedReceiptChoices.current.clear();
        setReceiptDraft(null);
        setShowReceiptSummary(false);
        setApplied(true);
      }
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
      if (selected.length) profileApplyRef.current?.(selected, result.document);
      setProfileReview(false); feedback('success');
    }
  }

  async function saveSharing() {
    const choices = (current.current.document?.confirmed ?? []).map(({ id, values }) => ({ id, values }));
    const result = await call('confirm', { choices, shareReview });
    if (result) { setSharingSaved(true); feedback('selection'); }
  }

  function changeAnswer(value: string) {
    answerRef.current = value;
    setAnswer(value);
    setDraftState('pending');
    if (auth.token && current.current.document) void interviewWritingDrafts.save(auth.token, current.current, value, draftInFlight.current).catch(()=>{});
  }
  function changeProfileChoice(choice:ProfileChoice) { setProfileEdits(previous=>({...previous,[choice.id]:choice}));setEditedProfile(previous=>previous.includes(choice.id)?previous:[...previous,choice.id]); }
  const validProposals = (snapshot.structuredConfirmation && doc?.status === 'confirmed' ? doc.confirmed : doc?.proposals ?? [])
    .filter(item => (!onboarding || item.kind !== 'beena') && proposalOptions(item).length > 0
      && !(doc?.promptVersion === 'wudayn-interview-5' && item.id === 'preference:residence_plan:partner'));
  const receiptChoices = snapshot.structuredConfirmation ? doc?.confirmed ?? [] : [];
  // On a fresh device the receipt can outlive the application draft.
  const savedStructuredChoices = receiptDraft ? { ...receiptDraft } : Object.fromEntries([...receiptChoices, ...(assessmentContext ?? [])].map(({ id, values }) => [id, values]));
  const priorValues = new Map(receiptChoices.map(item => [item.id, item.values[0]]));
  const receiptInferredPartnerIds = (snapshot.inferredPartnerIds ?? []).filter(id => {
    if (editedReceiptChoices.current.has(id) || savedStructuredChoices[id]?.[0] !== priorValues.get(id)) return false;
    const self = id.replace(/:partner$/, ':self');
    if (receiptDraft && savedStructuredChoices[self]?.[0] !== priorValues.get(self)) {
      // A change to the source answer invalidates its old partner suggestion.
      delete savedStructuredChoices[id];
      return false;
    }
    return true;
  });
  const aiProposals = direct ? [] : groundedSuggestions(validProposals, snapshot.carryForwardIds, doc?.turns);
  const openingTurnId = !direct && !snapshot.structuredConfirmation && doc?.lastMode === 'luna' && !doc.pendingAnalysis && !doc.turns[0]?.skipped ? doc.turns[0]?.id : undefined;
  const structuredChoices = {
    ...Object.fromEntries(aiProposals.map(({ id, values }) => [id, values])),
    ...savedStructuredChoices,
  };
  function changeStructuredChoices(next: Record<string, string[]>, changedIds?: readonly string[]) {
    for (const id of changedIds ?? []) editedReceiptChoices.current.add(id);
    const explicit = { ...savedStructuredChoices };
    for (const id of changedIds ?? Object.keys(next)) {
      if (next[id]?.length && (changedIds || next[id][0] !== structuredChoices[id]?.[0])) explicit[id] = next[id];
    }
    for (const id of Object.keys(explicit)) {
      if (!next[id]?.length) delete explicit[id];
    }
    if (receiptDraft) setReceiptDraft(explicit);
    else onStructuredDraftChange?.(explicit);
  }
  function reviseReceipt(id?: string, code?: string) {
    editedReceiptChoices.current.clear();
    if (id && code) editedReceiptChoices.current.add(id);
    setReceiptDraft({ ...savedStructuredChoices, ...(id && code ? { [id]: [code] } : {}) });
    setApplied(false);
  }
  const unresolvedPartnerProposals = snapshot.structuredConfirmation ? [] : validProposals.filter(item => item.side === 'partner' && item.source !== 'self_default' && !aiProposals.some(grounded => grounded.id === item.id));
  const blockedPartnerIds = [...hardRequirements.map(id => `preference:${id}:partner`), ...unresolvedPartnerProposals.map(item => item.id)];
  const profileProposals = (doc?.profileProposals ?? []).filter(p => Boolean(profileField(p.fieldId)));
  const profileChoices = profileProposals.flatMap(p => {
    const choice = profileEdits[p.id];
    return choice && (!p.needsClarification || editedProfile.includes(p.id)) && !ignoredProfile.includes(p.id) && (!profileField(p.fieldId)?.sensitive || sensitiveProfileAllowed) && validProfileProposalValues(choice) ? [choice] : [];
  });
  const captureBadge=(change:MessageChange)=>change.profile&&profileField(change.id.slice('profile:'.length))?.sensitive&&!sensitiveProfileAllowed?'معلّق للموافقة':change.changed?'تغيّر':'أُضيف للملخص';
  const coverage = snapshot.coverage;
  const chapterIndex = Math.max(0, ...[...(doc?.turns ?? []).map(turn => turn.topic), doc?.currentQuestion?.topic]
    .filter((topic): topic is string => Boolean(topic))
    .map(topic => interviewChapters.findIndex(chapter => chapter.topics.some(chapterTopic => chapterTopic === topic)))
    .filter(index => index >= 0));
  const activeChapter = interviewChapters[chapterIndex] ?? interviewChapters[0];
  const responding = ['answer', 'retry', 'clarify'].includes(busy) || queuedIntent === 'answer';
  const showPendingReply = pendingReply && doc?.lastRequestId !== pendingReply.id;
  const reviewMode = fallbackReview || doc?.status === 'review' || doc?.status === 'confirmed';
  const saveMessage = busy === 'draft' || draftState === 'pending' ? 'نحفظ كتابتك…' : draftState === 'error' ? 'تعذّر الحفظ — إجابتك ما زالت هنا' : answer.trim() ? 'كتابتك محفوظة' : '';
  const actionBlocked = !!queuedIntent || (!!busy && busy !== 'draft');
  const unavailable = snapshot.fallbackAvailable === true && doc?.pendingAnalysis === true;
  const unresolved = validProposals.filter(proposal => !(selections[proposal.id] ?? (proposal.needsClarification ? [] : proposal.values)).length).length;
  const incomplete = Boolean(snapshot.coverage && snapshot.coverage.answered < snapshot.coverage.required);
  const questionParts = doc?.currentQuestion?.text.split('\u2029') ?? [];
  const scenarioIndex = openingScenarios.findIndex(item => item.topic === doc?.currentQuestion?.topic
    && ([item.text,item.clarification,...item.priorWording].includes(questionParts.at(-1) ?? '')
      || (questionParts.length === 2 && /[؟?]$/u.test(questionParts[1]))));
  const answerLimit = clarifying !== 'correction' && scenarioIndex >= 0 ? 700 : 900;
  const family = parentingContext([...(profileContext ?? doc?.profileContext ?? []), ...(doc?.profileConfirmed ?? []), ...(includeProfile ? profileChoices : [])]);
  const needsParenting = doc?.promptVersion === 'wudayn-interview-5' && doc.status === 'confirmed' && snapshot.structuredConfirmation &&
    !doc.confirmed.some(item=>item.fieldId==='parenting_approach') &&
    parentingApplicable({children_plan:structuredChoices['preference:children_plan:self']?.[0]}, family.childrenCount, family.partnerChildren);
  const structuredReceipt = hybridEnabled && snapshot.structuredConfirmation && doc?.status === 'confirmed';
  const hybrid = Boolean(hybridEnabled && doc && ['wudayn-interview-4','wudayn-interview-5'].includes(doc.promptVersion) && (needsParenting || (structuredReceipt && receiptDraft) ||
    doc.status !== 'confirmed' && !fallbackReview && (direct || (hasOpening && doc.status === 'review'))));
  const hasFollowUp = doc?.status === 'review' && questionParts.length === 2 && scenarioIndex >= 0;
  const hybridReady = Boolean(direct || (structuredReceipt && !doc.pendingAnalysis) || (hasOpening && doc?.lastMode === 'luna' && !doc.pendingAnalysis));
  const isChat = Boolean(loaded && doc && !applied && !profileReview && !hybrid && !reviewMode);
  useEffect(() => {
    if (unavailable && !failureNotified.current) { failureNotified.current = true; unavailableCallback.current?.(); }
  }, [unavailable]);
  useEffect(() => {
    if (!clarifying || !open || !hybrid) return;
    clarifier.current?.closest('form')?.scrollIntoView({ block: 'nearest' });
    clarifier.current?.focus({ preventScroll: true });
  }, [clarifying, open, hybrid]);
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

  return createPortal(<dialog ref={dialog} className="wi-dialog" dir="rtl" aria-labelledby="wi-dialog-name" data-journey={hybridEnabled || undefined} data-chat={isChat || undefined} data-luna-motion={!direct || undefined} data-reading={!direct && responding || undefined} onCancel={event => { event.preventDefault(); void close(); }}>
    <div className="wi-shell">
      <header className="wi-header"><div><img src="/brand/wudayn-emblem-v2.png" width="27" height="31" alt=""/><span id="wi-dialog-name">جلسة التوافق<small>لونا من وُدَين</small></span></div><button type="button" className="wi-icon" onClick={() => void close()} disabled={!!queuedIntent || (!!busy && !['draft','answer','clarify','review','retry'].includes(busy))} aria-label={receiptDraft ? 'إغلاق المراجعة دون اعتماد التغييرات' : 'حفظ وإغلاق الجلسة'}><X size={20}/></button></header>
      <div className="wi-content" data-chat={isChat || undefined}>
        {direct && consentGranted && !doc && error ? <section>
          <p role="status">يمكنك اختيار إجاباتك الآن. يلزم الاتصال لاعتمادها.</p>
          <button type="button" className="wi-link" disabled={actionBlocked} onClick={async()=>{
            const result=await call('load', {}, true);
            if(result){setLoaded(true);if(!result.document)await call('start',{consentVersion:'wudayn-interview-v1',hybrid:true},true);}
          }}>إعادة الاتصال</button>
          <HybridAssessment memberId={auth.token} direct {...family} unresolvedPartnerIds={hardRequirements.map(id => `preference:${id}:partner`)} choices={savedStructuredChoices} savedChoices={savedStructuredChoices} onChange={changeStructuredChoices} gender={gender}
            completingUnavailable onComplete={()=>{}}/>
        </section> : !loaded ? <div className="wi-loading" data-stopped={Boolean(error) || undefined} role="status"><span className="wi-loading-brand" aria-hidden="true"><img src="/brand/wudayn-heart-v2.png" alt=""/></span><p>{error ? 'تعذّر فتح جلستك' : 'نفتح جلستك…'}</p>{error ? <button type="button" className="wi-link" onClick={() => void call('load', {}, true).then(result => result && setLoaded(true))}>إعادة المحاولة</button> : <TypingDots/>}</div>
        : !doc ? <section className="wi-welcome">
          <span className="wi-welcome-emblem" aria-hidden="true"><img src="/brand/wudayn-emblem-v2.png" width="42" height="49" alt=""/></span>
          <h1 id="wi-title" ref={heading} tabIndex={-1}>{direct ? 'اختياراتك للتوافق' : 'نتعرّف إليك، بكلماتك.'}</h1>
          <p className="wi-lead">{direct ? 'اختر إجاباتك عن حياتك وشريكك وشخصيتك، ثم راجعها واعتمدها. مساعدة لونا متاحة عند الطلب.' : 'ابدأ بما يهمّك في الزواج. بعد رسالتك الأولى، تقدر تكمل بالاختيارات.'}</p>
          <p className="wi-screening-note"><HeartHandshake size={16} aria-hidden="true"/>جزء من طلب العضوية، لتوضيح نية الزواج وتوقعاتك.</p>
          {!consentGranted && <div className="wi-consent"><label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/><span>أوافق على استخدام إجاباتي لإعداد ملخص التوافق وحفظ الجلسة في حسابي.</span></label><details><summary>خصوصية الجلسة <ChevronDown size={13}/></summary><p>إذا اخترت الحوار، تعالج OpenAI رسائلك لتقترح لونا إجابات يمكنك تعديلها. لا يظهر الحوار للأعضاء. تُحفظ الجلسة الخاصة لمدة ٣٠ يومًا من آخر تحديث، ويمكنك حذفها.</p></details></div>}
          <MotionPressButton className="wi-button wi-button-primary wi-wide" disabled={(!consent && !consentGranted) || !!busy} onClick={() => void call('start', { consentVersion: 'wudayn-interview-v1', ...(hybridEnabled ? { hybrid: true } : {}) }, true)}>{busy === 'start' ? 'نجهّز جلستك…' : direct ? 'ابدأ الاختيارات' : 'ابدأ الحوار'}<ArrowLeft size={18}/></MotionPressButton>
        </section>
        : profileReview ? <section className="wi-profile-review">
          <button className="wi-link" type="button" onClick={()=>setProfileReview(false)} disabled={actionBlocked}>العودة إلى الحوار <ArrowLeft size={15}/></button>
          <h1 id="wi-title" ref={heading} tabIndex={-1}>ملفك يتشكّل من كلامك</h1>
          <p className="wi-lead">هذه التفاصيل التي فهمناها. عدّل ما يحتاج، ثم أضفها إلى مسودتك بخطوة واحدة. لا تُنشر قبل إرسال الملف.</p>
          <div className="wi-profile-capture-list">{profileProposals.map(proposal=><ProfileProposalReview key={proposal.id} proposal={proposal} choice={profileEdits[proposal.id]} restricted={Boolean(profileField(proposal.fieldId)?.sensitive&&!sensitiveProfileAllowed)} ignored={ignoredProfile.includes(proposal.id)} onChange={changeProfileChoice} onIgnore={()=>setIgnoredProfile(previous=>previous.includes(proposal.id)?previous.filter(id=>id!==proposal.id):[...previous,proposal.id])}/>)}</div>
          {profileChoices.length<profileProposals.length-ignoredProfile.length && <p className="wi-review-attention">التفاصيل غير الواضحة تبقى معلّقة حتى توضّحها؛ لن نملأها بالتخمين.</p>}
          <MotionPressButton className="wi-button wi-button-primary wi-wide" disabled={actionBlocked || doc.pendingAnalysis || !profileChoices.length} onClick={()=>void saveProfileCapture()}>{busy==='profileConfirm'?'نحفظ التعديلات…':`إضافة ${number(profileChoices.length)} تفاصيل إلى مسودتي`}<Check size={17}/></MotionPressButton>
        </section>
        : (applied || (structuredReceipt && !receiptDraft && !showReceiptSummary)) && !needsParenting ? <section className="wi-complete">
          <span className="wi-confirmation-mark" aria-hidden="true"><img src="/brand/wudayn-emblem-v2.png" width="34" height="38" alt=""/><Check size={17}/></span>
          <h1 id="wi-title" ref={heading} tabIndex={-1}>تمّ حفظ ملخصك</h1>
          <p>{snapshot.structuredConfirmation ? `أضفنا ${number(doc.confirmed.length)} إجابة اعتمدتها إلى مسودة ملفك.` : 'أضفنا إجاباتك إلى مسودة ملفك.'} يمكنك مراجعتها قبل إرساله.</p>
          <MotionPressButton className="wi-button wi-button-primary wi-wide" onClick={onClose}>{onboarding ? 'متابعة إعداد الملف' : 'العودة إلى ملفي'} <ArrowLeft size={18}/></MotionPressButton>
          {snapshot.structuredConfirmation && doc.status === 'confirmed' && <ConfirmedAnswers confirmed={doc.confirmed} inferredPartnerIds={snapshot.inferredPartnerIds} gender={gender} onEdit={structuredReceipt ? reviseReceipt : undefined}/>}
          <button type="button" className="wi-link wi-centered" onClick={() => { setShowReceiptSummary(true); setApplied(false); }}>عرض الملخص</button>
        </section>
        : hybrid ? <section aria-label="أسئلة جلسة التوافق" className="wi-card-session">
          {receiptDraft && <div className="wi-receipt-revision" role="status">راجع اختياراتك ثم اعتمدها لتحديث الملخص المحفوظ.
            <button type="button" className="wi-link" disabled={actionBlocked} onClick={() => { editedReceiptChoices.current.clear(); setReceiptDraft(null); setApplied(true); }}>العودة دون تعديل</button>
          </div>}
          {!direct && !responding && doc.status === 'review' && hybridReady && doc.currentQuestion && (hasFollowUp || !/[؟?]/u.test(doc.currentQuestion.text)) &&
            <div className="wi-bubble wi-bubble-guide wi-closing"><span className="wi-speaker"><img src="/brand/wudayn-emblem-v2.png" width="18" height="21" alt=""/>لونا</span>
              {renderLunaMessage(doc.currentQuestion.text, true, 'wi-reflection')}
              {hasFollowUp && !clarifying && <button type="button" className="wi-link" disabled={actionBlocked} onClick={() => setClarifying('followUp')}>أردّ على لونا</button>}
            </div>}
          {responding && <p className="wi-coverage-note" role="status"><TypingDots/> لونا تقرأ رسالتك. تقدر تكمل الاختيارات الآن.</p>}
          {!direct && profileProposals.length > 0 && <button className="wi-profile-summary-link" type="button" onClick={() => setProfileReview(true)} disabled={actionBlocked}>
            <span><Pencil size={13}/>{number(profileProposals.length)} تفاصيل مقترحة لملفك</span><span>مراجعة <ArrowLeft size={13}/></span>
          </button>}
          {nextStepText && !clarifying && <details className="wi-private-notes wi-next-step-review">
            <summary>خطوتك الجاية من كلامك <ChevronDown size={14}/></summary>
            <p dir="auto">{nextStepText}</p>
            {!structuredReceipt && <button className="wi-link" type="button" disabled={actionBlocked || !hybridReady || Boolean(answer.trim())}
              onClick={() => { setClarifying('nextStep'); changeAnswer(nextStepText); }}>تعديل خطوتي</button>}
          </details>}
          {clarifying && <form className="wi-clarification" onSubmit={event => { event.preventDefault(); void send(); }}>
            <label htmlFor="wi-clarification">{clarifying === 'nextStep' ? 'عدّل وصف خطوتك الجاية' : clarifying === 'followUp' ? 'ردّك على لونا' : 'وش تحب توضّح عن إجاباتك؟'}</label>
            {clarifying === 'correction' && <p>اذكر الموضوع والإجابة التي تعبّر عنك. اختياراتك اليدوية تبقى كما هي وتقدر تعدّلها في المراجعة.</p>}
            {clarifying === 'nextStep' && <p>اكتبها بالطريقة اللي تعبّر عن استعدادك اليوم.</p>}
            <div className="wi-compose-row"><button className="wi-send" type="submit" disabled={actionBlocked || !answer.trim()} aria-label="إرسال التوضيح"><ArrowUp size={20}/></button>
              <textarea ref={clarifier} id="wi-clarification" aria-describedby="wi-clarification-count" value={answer} onChange={event => changeAnswer(event.target.value)} maxLength={answerLimit} rows={2} dir="rtl" disabled={actionBlocked}/>
            </div>
            <small id="wi-clarification-count">{number(answer.length)} من {number(answerLimit)} حرف</small>
            <button className="wi-link" type="button" disabled={actionBlocked} onClick={() => { changeAnswer(''); setClarifying(false); }}>إلغاء التوضيح</button>
          </form>}
          <HybridAssessment memberId={auth.token} direct={direct} historical={doc.promptVersion==='wudayn-interview-4'} {...family} choices={structuredChoices} savedChoices={savedStructuredChoices} aiProposals={aiProposals} openingTurnId={openingTurnId} openingText={openingTurnId ? doc.turns[0].answer : undefined} onChange={changeStructuredChoices}
            onChoiceHelp={hybridReady && !structuredReceipt ? async (fieldId, description, priorAnswer) => {
              const result = await requestInterview(auth, {
                action: 'choiceHelp', revision: current.current.revision, fieldId,
                ...(gender ? { gender } : {}), ...(description ? { answer: description } : {}),
                ...(priorAnswer ? { priorAnswer } : {}),
              });
              if (!result.choiceHelp) throw new InterviewError('تعذّر الحصول على المساعدة الآن.', 'unavailable', 503);
              return result.choiceHelp;
            } : undefined}
            unresolvedPartnerIds={blockedPartnerIds}
            receiptInferredPartnerIds={receiptInferredPartnerIds}
            portraitPartnerSourceKnown={!structuredReceipt || snapshot.inferredPartnerIds !== undefined}
            onComplete={(choices, inferredIds) => void confirm(choices, inferredIds)} gender={gender} disabled={busy === 'structuredConfirm' || busy === 'directConfirm'}
            completingUnavailable={!hybridReady || actionBlocked || (!direct && (Boolean(clarifying) || Boolean(answer.trim())))}
            onClarify={!direct && !structuredReceipt && hybridReady && !actionBlocked && !clarifying ? () => setClarifying('correction') : undefined}
            reviewExtras={<>
              {!direct && profileProposals.length > 0 && <details className="wi-review-group wi-profile-group">
                <summary><span><strong>تفاصيل لملفك وتفضيلاتك</strong><small>راجع ما فهمته لونا قبل إضافته إلى مسودتك</small></span><ChevronDown size={17}/></summary>
                <div className="wi-profile-capture-list">{profileProposals.map(proposal => <ProfileProposalReview
                  key={proposal.id} proposal={proposal} choice={profileEdits[proposal.id]}
                  restricted={Boolean(profileField(proposal.fieldId)?.sensitive && !sensitiveProfileAllowed)}
                  ignored={ignoredProfile.includes(proposal.id)} onChange={changeProfileChoice}
                  onIgnore={() => setIgnoredProfile(previous => previous.includes(proposal.id) ? previous.filter(id => id !== proposal.id) : [...previous, proposal.id])}
                />)}</div>
              </details>}
              {!direct && onboarding && profileChoices.length > 0 && <label className="wi-sharing wi-profile-carry-choice">
                <input type="checkbox" checked={includeProfile} onChange={event=>setIncludeProfile(event.target.checked)}/>
                <span>أضيف هذه التفاصيل إلى مسودة ملفي<small>{profileChoices.map(choice=>profileProposalLabel(choice)+' · '+profileProposalValue(choice)).join('، ')}</small><small>تظهر إجاباتك في خطوات الملف التالية ويمكنك تعديلها.</small></span>
              </label>}
              <details className="wi-private-notes">
                <summary>كيف تبدأ العضوية؟ <ChevronDown size={14}/></summary>
                <p>وُدَين للتعارف بقصد الزواج وباحترام خصوصية الطرف الآخر. تتفقان على حدود التواصل، وتختاران متى يناسبكما التواصل مع الأهل.</p>
                <p>تراجع ملخصك بنفسك، وتأكيده يكمل جلسة التوافق. طلب العضوية له مراجعته الخاصة.</p>
              </details>
              {doc.readiness.length > 0 && <details className="wi-private-notes"><summary>ملخصك الخاص عن الخطوة القادمة <ChevronDown size={14}/></summary><p>يعكس ما ذكرتَه في الحوار، وقد تبقى بعض التفاصيل مفتوحة للنقاش.</p><ul>{doc.readiness.map(note => <li key={note.id}>{note.text}</li>)}</ul></details>}
              {doc.clarifications.length > 0 && <details className="wi-private-notes"><summary>نقاط للنقاش لاحقًا <ChevronDown size={14}/></summary><ul>{doc.clarifications.map(note => <li key={note.id}>{note.text}</li>)}</ul></details>}
              {!direct && (doc.readiness.length > 0 || doc.clarifications.length > 0) && <label className="wi-sharing">
                <input type="checkbox" checked={shareReview} disabled={actionBlocked || doc.pendingAnalysis} onChange={event => setShareReview(event.target.checked)}/>
                <span>أشارك ملخص الاستعداد ونقاط التوضيح مع فريق العضوية.<small>اختياري. يبقى الحوار وإجابات التوافق خاصة.</small></span>
              </label>}
            </>}/>
          {doc.pendingAnalysis && !unavailable && !responding && <div className="wi-recovery" role="status">
            <p>إجابتك محفوظة. أعد محاولة التحليل قبل اعتماد الملخص.</p>
            <button type="button" className="wi-link" onClick={() => void call('retry', { hybrid: true }, true)} disabled={actionBlocked}>إعادة المحاولة</button>
          </div>}
        </section>
        : reviewMode ? <section className="wi-review">
          <h1 id="wi-title" ref={heading} tabIndex={-1}>{fallbackReview ? 'نكمل من حيث وصلنا' : 'هذا ما فهمناه عنك'}</h1><p className="wi-lead">{fallbackReview ? 'راجع ما فهمناه حتى الآن وعدّل ما يحتاج إلى تصحيح. نحفظ ما راجعته، ثم تجيب عن النقاط المتبقية فقط.' : 'هذه إجاباتك كما فهمناها من الحوار. افتح أي قسم للتفاصيل أو التعديل، ثم اعتمد الملخص كاملًا بخطوة واحدة.'}</p>
          {doc.pendingAnalysis && !fallbackReview && <div className="wi-notice"><p>إجاباتك محفوظة، لكن تحليلها لم يكتمل.</p><button type="button" className="wi-link" onClick={() => void call(doc.status === 'confirmed' ? 'review' : 'retry')} disabled={!!busy}><RotateCcw size={14}/> إعادة المحاولة</button></div>}
          {unresolved > 0 && <p className="wi-review-attention" role="status">{fallbackReview ? 'النقاط التي لم تتضح بعد ستبقى لك لتجيب عنها مباشرة.' : <>نحتاج توضيح {number(unresolved)} {unresolved === 1 ? 'إجابة' : 'إجابات'} قبل اعتماد الملخص.</>}</p>}
          {validProposals.length ? (['self','partner','personality','importance'] as const).map(side => {
            const group = validProposals.filter(proposal => side === 'personality' ? proposal.kind === 'personality' : proposal.kind !== 'personality' && proposal.side === side);
            if (!group.length) return null;
            const needsCorrection = group.some(proposal => !(selections[proposal.id] ?? (proposal.needsClarification ? [] : proposal.values)).length);
            return <details className="wi-review-group" key={side} open={needsCorrection || undefined} data-attention={needsCorrection || undefined}><summary><span><strong>{side === 'personality' ? 'طريقتك في الحياة والتواصل' : side === 'self' ? 'عن حياتك' : side === 'partner' ? 'ما تريده في شريكك' : 'أولوياتك'}</strong><small>{needsCorrection ? 'تحتاج نقطة إلى توضيحك' : 'جاهز للمراجعة والتعديل'}</small></span><span className="wi-review-state" aria-hidden="true">{needsCorrection ? 'راجع' : <Check size={14}/>}</span><ChevronDown size={17}/></summary><div className="wi-review-rows">{group.map(proposal => <ProposalReview key={proposal.id} proposal={proposal} values={selections[proposal.id] ?? (proposal.needsClarification ? [] : proposal.values)} onValues={values => { setSelections(previous => ({ ...previous, [proposal.id]: values })); setApplied(false); }}/>)}</div></details>;

          }) : <div className="wi-notice"><p>لم يتكوّن ملخص واضح بعد. نحتاج أن نكمل الحوار دون تخمين إجاباتك.</p></div>}
          {!!profileProposals.length && <details className="wi-review-group wi-profile-group"><summary><span><strong>ملفك وما يناسبك في الشريك</strong><small>مسودة من كلامك · راجعها قبل الإضافة</small></span><ChevronDown size={17}/></summary><div className="wi-profile-capture-list">{profileProposals.map(proposal=><ProfileProposalReview key={proposal.id} proposal={proposal} choice={profileEdits[proposal.id]} restricted={Boolean(profileField(proposal.fieldId)?.sensitive&&!sensitiveProfileAllowed)} ignored={ignoredProfile.includes(proposal.id)} onChange={changeProfileChoice} onIgnore={()=>setIgnoredProfile(previous=>previous.includes(proposal.id)?previous.filter(id=>id!==proposal.id):[...previous,proposal.id])}/>)}</div></details>}
          {!!doc.readiness.length && <details className="wi-private-notes"><summary>عن خطوتك القادمة <ChevronDown size={14}/></summary><ul>{doc.readiness.map(note => <li key={note.id}>{note.text}</li>)}</ul></details>}
          {!!doc.clarifications.length && <details className="wi-private-notes"><summary>نقاط للحوار لاحقًا <ChevronDown size={14}/></summary><ul>{doc.clarifications.map(note => <li key={note.id}>{note.text}</li>)}</ul></details>}
          {!fallbackReview && <details className="wi-sharing-options"><summary>مشاركة الملخص مع فريق العضوية <ChevronDown size={14}/></summary><label className="wi-sharing"><input type="checkbox" checked={shareReview} disabled={doc.pendingAnalysis} onChange={event => { setShareReview(event.target.checked); setSharingSaved(false); }}/><span>أشارك ملخص الاستعداد ونقاط التوضيح فقط.<small>اختياري. الحوار وإجابات التوافق تبقى خاصة.</small></span></label>{shareReview !== doc.reviewSharing && <button type="button" className="wi-link wi-sharing-save" disabled={!!busy || doc.pendingAnalysis} onClick={() => void saveSharing()}>{shareReview ? 'حفظ خيار المشاركة فقط' : 'سحب مشاركة الملخص فقط'}</button>}{sharingSaved && <p className="wi-sharing-saved" role="status"><Check size={14}/>حُفظ خيار المشاركة، دون تغيير إجابات ملفك.</p>}</details>}
          {incomplete && !fallbackReview && <p className="wi-review-attention">بقيت نقاط نحتاج إجابتك عنها لنكمل التقييم.</p>}
          {fallbackReview ? <MotionPressButton className="wi-button wi-button-primary wi-wide" disabled={!!busy} onClick={finishFallbackReview}>اعتماد ما راجعته وإكمال المتبقي<ArrowLeft size={18}/></MotionPressButton> : <MotionPressButton className="wi-button wi-button-primary wi-wide" onClick={() => void confirm()} disabled={!!busy || doc.pendingAnalysis || unresolved > 0 || incomplete || !validProposals.length}>{busy === 'confirm' ? 'جارٍ الحفظ…' : 'هذا يمثّلني، اعتماد الملخص'}<Check size={18}/></MotionPressButton>}
          {!fallbackReview && (incomplete || !validProposals.length) && <button type="button" className="wi-link wi-centered" disabled={!!busy} onClick={() => void call('resume', {}, true).then(result => { if (result) { setApplied(false); setSharingSaved(false); } })}>إكمال الحوار <ArrowLeft size={14}/></button>}
        </section>
        : <section className="wi-chat" data-opening={openingTurn || undefined} aria-label="الحوار مع مرافق وُدَين">
          <div className="wi-session-compass">
            {hybridEnabled ? <LunaSessionSteps current="قصتك"/> : <>
            <div className="wi-chat-context"><span><HeartHandshake size={15}/>{activeChapter.label}</span><span><LockKeyhole size={12}/> خاص · لا يظهر للأعضاء</span></div>
            <ol className="wi-session-milestones" aria-label="مراحل جلسة التوافق">
              {interviewChapters.map((chapter,index)=><li key={chapter.id} data-state={index<chapterIndex?'done':index===chapterIndex?'current':'next'} aria-current={index===chapterIndex?'step':undefined} aria-label={chapter.label}><i aria-hidden="true">{index<chapterIndex?<Check size={10}/>:index+1}</i><span>{chapter.shortLabel}</span></li>)}
            </ol></>}
            {!!profileProposals.length && <button className="wi-profile-summary-link" type="button" onClick={()=>setProfileReview(true)} disabled={actionBlocked}><span><Pencil size={13}/>{number(profileProposals.length)} تفاصيل لملفك وتفضيلاتك</span><span>مراجعة <ArrowLeft size={13}/></span></button>}
          </div>
          <div className="wi-thread" ref={thread} role="log" aria-label="رسائل الجلسة" aria-relevant="additions" aria-live="polite" onScroll={event=>{const el=event.currentTarget;followConversation.current=el.scrollHeight-el.scrollTop-el.clientHeight<90;}}>
            {openingTurn && <div className="wi-opening-note"><h1>ابدأ من قصتك.</h1><p>{hybridEnabled ? 'حديثك خاص، وتكتب نبذة ملفك لاحقًا.' : 'اكتب للونا فقرة قصيرة عنك وعن الزواج الذي تتمناه. حديثك خاص. بعد رسالتك الأولى ننتقل للاختيارات، وتكتب نبذة ملفك لاحقًا.'}</p></div>}
            {doc.turns.map((turn,index) => {
              const changes = (captures[turn.id] ?? []).filter(change => !nextStepTurn || index !== 0 || change.profile);
              return <div className="wi-exchange" key={turn.id}>
              {(index===0 || doc.turns[index-1].topic!==turn.topic) && <div className="wi-topic-divider"><span>{topics.find(topic=>topic.id===turn.topic)?.title ?? 'نتعرّف إليك'}</span></div>}
              <div className="wi-bubble wi-bubble-guide wi-bubble-history">{renderLunaMessage(turn.question)}</div>
              <div className="wi-bubble wi-bubble-member"><p dir="auto">{turn.skipped ? 'لم تُجب عن هذا السؤال بعد' : turn.answer}</p></div>
              {index === 0 && nextStepTurn && openingTurnId && <OpeningInsights {...family} gender={gender} historical={doc.promptVersion === 'wudayn-interview-4'}
                openingTurnId={openingTurnId} openingText={turn.answer} choices={structuredChoices} savedChoices={savedStructuredChoices} proposals={aiProposals}
                onChoose={(id, code) => changeStructuredChoices({ ...structuredChoices, [id]: [code] }, [id])} disabled={actionBlocked}
                unresolvedPartnerIds={blockedPartnerIds}/>}
              {changes.length > 0 && <div className="wi-message-captures" role="status" aria-label="ما أضافته هذه الرسالة"><span className="wi-capture-caption"><Check size={13}/>من كلامك</span><div>{changes.map(change=>change.profile
                ? <button key={change.id} type="button" className="wi-capture-chip" data-changed={change.changed || undefined} disabled={actionBlocked} onClick={()=>setProfileReview(true)} title={change.value}><small>{captureBadge(change)}</small><span>{change.title}</span><Pencil size={11}/></button>
                : <span key={change.id} className="wi-capture-chip"><small>{change.title}</small><strong>{change.value}</strong></span>)}</div></div>}
            </div>;})}
            {nextStepTurn && <div className="wi-opening-note wi-next-step-note"><h1>كيف تتصوّر التعارف الجاد؟</h1><p>خطوتك الجاية بكلماتك. هذا السؤال اختياري.</p></div>}
            <div className="wi-bubble wi-bubble-guide wi-current-question" key={doc.currentQuestion?.text} data-settled={responding || undefined}><span className="wi-speaker"><img src="/brand/wudayn-emblem-v2.png" width="18" height="21" alt=""/>لونا</span>{renderLunaMessage(doc.currentQuestion?.text ?? 'وش تحب تضيف عن اللي تبحث عنه؟', true)}</div>
            {openingTurn && hybridEnabled && <p className="wi-opening-benefit wi-prompt-benefit">بعد رسالتك، تشوف كم إجابة للتوافق جهّزتها لونا وكم إجابة باقي تكملها. تقدر تراجع المقترحات وتعدّلها.</p>}
            {showPendingReply && <div className="wi-bubble wi-bubble-member wi-new-answer"><p dir="auto">{pendingReply.text}</p><small>جارٍ الإرسال</small></div>}
            {responding && <div className="wi-typing" role="status" aria-label="وُدَين يكتب"><TypingDots/><span>نربط كلامك بما يهمّك…</span></div>}
            {!hybridEnabled && !responding && coverageGain > 1 && !captures[doc.turns.at(-1)?.id ?? '']?.length && <div className="wi-coverage-note" key={doc.lastRequestId} role="status"><Check size={13} aria-hidden="true"/><span>إجابتك وضّحت {number(coverageGain)} نقاط دفعة واحدة</span></div>}
          </div>
          <form className="wi-composer" data-opening={openingTurn || undefined} data-next-step={nextStepTurn || undefined} onSubmit={event => { event.preventDefault(); void send(); }}>
            {openingTurn && hybridEnabled && <OpeningExample/>}
            {nextStepTurn && <>
              <OpeningExample key="next-step" nextStep/>
            </>}
            {answerHelp && <p id="wi-answer-help" className="wi-answer-help">{openingTurn ? (hybridEnabled ? 'تكلم بطريقتك عن حياتك اليوم، طباعك، ما تبحث عنه في شريكك، وما يهمك في الزواج.' : 'اختر شيئًا واحدًا يهمّك، مثل كيف تتخذان قرارًا معًا أو متى تحبّ إشراك الأهل.') : 'ابدأ بموقف من حياتك: وش صار، كيف تصرّفت، ووش كنت تتمنى؟ وإذا ما عندك تجربة، قل لنا كيف تتخيلها. ما تحتاج تصيغ كلامك بشكل مثالي.'}</p>}
            {openingTurn && !hybridEnabled && !answer.trim() && <div className="wi-intro-cues" aria-label="أفكار تساعدك في التعريف"><span>عنّك</span><span>حياتك اليوم</span><span>الشريك الذي تبحث عنه</span><span>استعدادك للزواج</span></div>}
            {!answer.trim() && !!doc.currentQuestion?.suggestions.length && <><p className="wi-choice-intro">اختر الأقرب لك، أو اكتب إجابتك بطريقتك.</p><div className="wi-chat-suggestions" aria-label="إجابات سريعة، اضغط لإرسال اختيارك">{doc.currentQuestion.suggestions.slice(0,4).map(suggestion => <MotionPressButton type="button" key={suggestion} disabled={actionBlocked || doc.pendingAnalysis} onClick={() => void send(false, suggestion)}>{suggestion}</MotionPressButton>)}</div></>}
            <div className="wi-compose-row"><button className="wi-send" type="submit" disabled={actionBlocked || doc.pendingAnalysis || !answer.trim()} aria-label="إرسال الرسالة"><ArrowUp size={20}/></button><textarea ref={composer} id="wi-answer" aria-label="رسالتك" aria-describedby={answerHelp ? 'wi-answer-count wi-answer-help' : 'wi-answer-count'} value={answer} onChange={event => changeAnswer(event.target.value)} maxLength={answerLimit} rows={openingTurn ? 4 : nextStepTurn ? 3 : 1} wrap="soft" placeholder={openingTurn && hybridEnabled ? 'اكتب بطريقتك، حتى لو كانت كم جملة…' : openingTurn ? 'أهم شيء عندي…' : 'قل لنا بطريقتك…'} autoComplete="off" spellCheck dir="rtl" lang="ar" disabled={actionBlocked || doc.pendingAnalysis}/></div>
            <div className="wi-compose-meta"><span role="status">{responding ? 'نقرأ إجابتك' : saveMessage}</span>
              {nextStepTurn ? <button type="button" disabled={actionBlocked || doc.pendingAnalysis} onClick={() => void send(true)}>تخطّي السؤال</button> : (!openingTurn || !hybridEnabled) &&
                <button type="button" aria-expanded={answerHelp} aria-controls="wi-answer-help" onClick={()=>setAnswerHelp(value=>!value)}>كيف أبدأ؟</button>}
              <span id="wi-answer-count">{number(answer.length)} من {number(answerLimit)} حرف</span><button type="button" onClick={() => void close()} disabled={actionBlocked}>إكمال لاحقًا</button></div>
          </form>
        </section>}
        {error && <div className="wi-error" role="alert"><p>{error}</p>{/conflict|revision|stale/.test(errorCode) && <button type="button" className="wi-link" disabled={!!busy} onClick={() => void call('load', {}, true)}>استعادة آخر نسخة محفوظة</button>}</div>}
        {isChat && doc?.pendingAnalysis && !unavailable && <div className="wi-recovery" role="status"><p>إجابتك محفوظة. نحتاج إكمال تحليلها قبل السؤال التالي.</p><button type="button" className="wi-link" onClick={() => void call('retry', hybridEnabled ? { hybrid: true, cardsAfterReply: true } : {}, true)} disabled={actionBlocked}>إعادة المحاولة</button></div>}
        {unavailable && !applied && !fallbackReview && <div className="wi-recovery" role="status"><p>تعذّر إكمال الحوار الآن. إجاباتك محفوظة؛ يمكنك المحاولة مجددًا أو إكمال النقاط المتبقية مباشرة.</p>{doc && <button type="button" className="wi-link" onClick={() => void call('retry', hybridEnabled ? { hybrid: true, cardsAfterReply: true } : {}, true)} disabled={actionBlocked}>إعادة المحاولة</button>}<button type="button" className="wi-link" onClick={useFallback} disabled={actionBlocked}>إكمال الأسئلة مباشرة</button></div>}
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
  return <details className="wi-proposal" open={!values.length || undefined} data-defaulted={proposal.source === 'self_default' || undefined}>
    <summary className="wi-proposal-summary"><span><small>{proposalTitle(proposal)}</small>{proposal.source === 'self_default' && <span className="wi-default-note">مقترح من إجابتك · قابل للتعديل</span>}{proposalStatement(proposal) && <span className="wi-personality-statement">{proposalStatement(proposal)}</span>}<strong>{label || 'نحتاج توضيحك لهذه النقطة'}</strong></span><Pencil size={16} aria-label="تعديل الإجابة"/></summary>
    <div className="wi-proposal-editor"><fieldset><legend>{proposalSide(proposal)}</legend>{multiple ? <div className="wi-multiple">{options.map(option => <label key={option.value}><input type="checkbox" checked={values.includes(option.value)} onChange={event => onValues(event.target.checked ? [...values, option.value] : values.filter(value => value !== option.value))}/><span>{option.label}</span></label>)}</div> : <select value={values[0] ?? ''} onChange={event => onValues([event.target.value])} aria-label={`تعديل ${proposalTitle(proposal)}: ${proposalSide(proposal)}`}><option value="" disabled>اختر ما يمثّلك</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}</fieldset><details className="wi-evidence"><summary>من كلامك <ChevronDown size={13}/></summary><p>{proposal.summary}</p>{proposal.evidence.map((evidence, index) => <blockquote key={`${evidence.turnId}-${index}`}>{evidence.quote}</blockquote>)}</details></div>
  </details>;
}
