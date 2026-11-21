import { resolvePartnerDefaults } from './partnerDefaults';
import memberAr from '../member-copy.ts';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, HeartHandshake, LockKeyhole, Pencil } from '../BrandIcons';
import legacyCatalog from '../compatibility/catalog-v3.json';
import legacyTraits from '../compatibility/personality-catalog-v1.json';
import { parentingApplicable } from '../compatibility/parenting.mjs';
import type { PartnerCriteria } from '../compatibility/marriage';
import { dimensions, hasPartnerQuestion } from '../compatibility/model';
import { personalityQuestions } from '../compatibility/personality';
import { MotionPressButton, MotionReveal } from '../motion/Reanimated';
import type { InterviewSelection } from './model';
import type { InterviewChoiceHelp, InterviewProposal } from './types';
import './hybrid-assessment.css';

type Choices = Record<string, string[]>;
const sessionSteps = ['قصتك', 'اختياراتك', 'المراجعة'] as const;

export function LunaSessionSteps({ current }: { current: typeof sessionSteps[number] }) {
  const active = sessionSteps.indexOf(current);
  return <ol className="wi-luna-steps" aria-label="مراحل جلسة التوافق">
    {sessionSteps.map((step, index) => <li key={step} aria-current={step === current ? 'step' : undefined} data-done={index < active || undefined}>
      <span className="wi-step-dot" aria-hidden="true">{index < active && <Check size={10}/>}</span>{step}
    </li>)}
  </ol>;
}
type Gender = 'woman' | 'man';
type Field = {
  id: string;
  label: string;
  prompt: string;
  options: { code: string; label: string }[];
};
type Visit = { index: number; fieldId?: string };

type Card = {
  selfOnly: boolean;
  self: Field;
  partner: Field;
  personality: Field[];
};

const themes = [
  { label: 'الزواج والسكن', dimensions: ['children_plan', 'marriage_timeline', 'residence_plan', 'housing_arrangement'] },
  { label: 'البيت والأهل', dimensions: ['wife_work', 'financial_provision', 'money_management', 'domestic_labor', 'family_authority', 'parenting_approach'] },
  { label: 'حياتكم اليومية', dimensions: ['faith_routine', 'social_boundaries', 'social_rhythm', 'closeness_pace'] },
  { label: 'التواصل وقت الاختلاف', dimensions: ['conflict_response', 'repair_after_conflict'] },
];

const personalityByDimension: Record<string, string[]> = {
  housing_arrangement: ['prepare_early', 'prefer_familiar'],
  money_management: ['follow_through', 'unfinished_tasks'],
  social_rhythm: ['group_energy', 'quiet_settings'],
  social_boundaries: ['start_conversation'],
  faith_routine: ['explore_views'],
  closeness_pace: ['try_new_ideas'],
  conflict_response: ['calm_before_acting', 'harsh_words', 'perspective_taking'],
  repair_after_conflict: ['make_amends', 'lasting_tension', 'stress_recovery'],
};

const historicalThemes = [
  { label: 'الزواج والسكن', dimensions: ['children_plan', 'marriage_timeline', 'residence_plan', 'housing_arrangement'] },
  { label: 'البيت والأهل', dimensions: ['wife_work', 'financial_provision', 'domestic_labor', 'family_authority', 'parenting_approach'] },
  { label: 'حياتكم اليومية', dimensions: ['faith_routine', 'mixed_gatherings', 'public_event_attendance', 'social_rhythm', 'closeness_pace'] },
  { label: 'التواصل وقت الاختلاف', dimensions: ['match_disagreement_style', 'repair_after_conflict'] },
];

const historicalTraitsByDimension: Record<string, string[]> = {
  housing_arrangement: ['planning', 'novelty'],
  social_rhythm: ['social_energy'],
  mixed_gatherings: ['initiative'],
  faith_routine: ['depth', 'quiet_comfort'],
  parenting_approach: ['openness'],
  closeness_pace: ['closeness', 'reassurance'],
  match_disagreement_style: ['conflict_pace', 'directness'],
  repair_after_conflict: ['support'],
};

const historicalOptions = ['لا يشبهني إطلاقًا','يشبهني قليلًا','يشبهني أحيانًا','يشبهني غالبًا','يشبهني كثيرًا'].map((label,i)=>({code:'ABCDE'[i],label}));
const historicalQuestions = legacyTraits.map(trait=>({...trait,options:historicalOptions}));
const workLabels: Record<string, string> = memberAr.womanWork;
const helpScenarios: Record<string, string> = {
  'preference:shared_budget:self': 'لو زادت مصاريف البيت هذا الشهر، كيف تحبّ أن ترتّبا الميزانية؟',
  'preference:family_boundaries:self': 'لو اقترح أحد الأهل تغيير قرار يخصّ بيتكما، كيف تحبّ أن تتعاملا معه؟',
  'preference:repair_after_conflict:self': 'بعد اختلاف بسيط بينكما، ما الذي يساعدك على العودة إلى الحديث؟',
};
const number = new Intl.NumberFormat('ar-SA');

function makeThemeCards(gender?: Gender, historical=false) {
  const topics = historical ? legacyCatalog.dimensions : dimensions;
  const questions = historical ? historicalQuestions : personalityQuestions;
  const layout = historical ? historicalTraitsByDimension : personalityByDimension;
  return (historical ? historicalThemes : themes).map(theme => ({
    label: theme.label,
    cards: theme.dimensions.map(id => {
      const dimension = topics.find(item => item.id === id)!;
      const femaleWork = gender === 'woman' && id === 'wife_work';
      const fields: Card = {
        selfOnly: !hasPartnerQuestion(id, historical ? 'marriage-v3' : 'marriage-v4'),
        self: {
          id: `preference:${id}:self`,
          label: dimension.title,
          prompt: femaleWork ? 'هل ترغبين في العمل بعد الزواج؟' : dimension.selfPrompt,
          options: dimension.options.map(option => ({
            code: option.code,
            label: femaleWork ? (workLabels[option.code] ?? option.self) : option.self,
          })),
        },
        partner: {
          id: `preference:${id}:partner`,
          label: dimension.title,
          prompt: dimension.partnerPrompt,
          options: dimension.options.map(option => ({ code: option.code, label: option.partner })),
        },
        personality: (layout[id] ?? []).map(questionId => {
          const question = questions.find(item => item.id === questionId)!;
          return {
            id: `personality:${questionId}:self`,
            label: question.title,
            prompt: question.prompt,
            options: question.options.map(option => ({ code: option.code, label: option.label })),
          };
        }),

      };
      return fields;
    }),
  }));
}

function selected(field: Field, choices: Choices) {
  const values = choices[field.id];
  return values?.length === 1 ? field.options.find(option => option.code === values[0]) : undefined;
}

function perspective(field: Field) {
  if (field.id.endsWith(':partner')) return 'ما أتمناه من شريكي';
  return field.id.startsWith('personality:') ? 'عن شخصيتي' : 'عنّي';
}

export function ConfirmedAnswers({ confirmed, gender, inferredPartnerIds = [] }: { confirmed: readonly InterviewSelection[]; gender?: Gender; inferredPartnerIds?: readonly string[] }) {
  const historical = confirmed.some(item=>legacyTraits.some(trait=>item.id==='personality:'+trait.id+':self'));
  const cards = makeThemeCards(gender,historical).flatMap(theme=>theme.cards);
  const timing = cards.find(card => card.self.id === 'preference:marriage_timeline:self');
  if (!timing) return null;
  const choices = Object.fromEntries(confirmed.map(item => [item.id, item.values]));
  const reviewFields = cards.flatMap(assessmentFields);
  const rows = [timing.self, timing.partner].filter(field => selected(field, choices));
  if (!rows.length) return null;
  return <section className="wi-confirmed-answers" aria-label={timing.self.label}>
    <h2>{timing.self.label}</h2>
    <dl>{rows.map(field => <div key={field.id}><dt>{perspective(field)}{inferredPartnerIds.includes(field.id) && ' · اقتراح من إجابتك'}</dt><dd>{selected(field, choices)?.label}</dd></div>)}</dl>
    <details><summary>جميع إجابات التوافق ({number.format(reviewFields.filter(field => selected(field, choices)).length)})</summary>
      <ul>{reviewFields.filter(field => selected(field, choices)).map(field =>
        <li key={field.id}>{field.label} · {perspective(field)}: {selected(field, choices)?.label}
          {inferredPartnerIds.includes(field.id) && ' · اقتراح من إجابتك'}</li>)}</ul>
    </details>
  </section>;
}

function assessmentFields(card: Card) {
  return card.selfOnly ? [card.self, ...card.personality] : [card.self, card.partner, ...card.personality];
}

function needsCard(card: Card, choices: Choices) {
  return assessmentFields(card).some(field => !selected(field, choices));
}

function ChoiceCard({ field, value, onChoose, disabled, compact = false, help }: {
  field: Field;
  value?: string;
  onChoose: (value: string) => void;
  disabled: boolean;
  compact?: boolean;
  help?: ReactNode;
}) {
  const partner = field.id.endsWith(':partner');
  return <fieldset className="wi-hybrid-field" data-compact={compact || undefined} data-side={partner ? 'partner' : 'self'}>
    <legend tabIndex={-1}><span className="wi-field-side">{compact ? 'عن شخصيتي' : partner ? 'في شريك حياتي' : 'في حياتي'}</span>{field.prompt}</legend>
    <div className="wi-hybrid-options">
      {field.options.map((option, position) => <MotionPressButton
        key={option.code}
        className="wi-hybrid-option"
        aria-pressed={value === option.code}
        onClick={() => onChoose(option.code)}
        disabled={disabled}
      >
        <span className="wi-hybrid-option-mark" aria-hidden="true">{value === option.code ? <Check size={13}/> : compact ? number.format(position + 1) : null}</span>
        {option.label}
      </MotionPressButton>)}
    </div>
    {help}
  </fieldset>;
}

function ChoiceHelp({ field, request, onChoose, disabled }: {
  field: Field;
  request: (fieldId: string, description?: string, priorAnswer?: string) => Promise<InterviewChoiceHelp>;
  onChoose: (value: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [clarification, setClarification] = useState('');
  const [explanation, setExplanation] = useState<Extract<InterviewChoiceHelp, { explanations: unknown }>>();
  const [proposal, setProposal] = useState<Extract<InterviewChoiceHelp, { code: unknown }>>();
  const [busy, setBusy] = useState<'explain' | 'map'>();
  const [error, setError] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const option = field.options.find(item => item.code === proposal?.code);
  const needsClarification = proposal?.code === null;
  const answerText = needsClarification ? clarification : description;

  async function ask(mode: 'explain' | 'map') {
    if (busy || disabled) return;
    setError('');
    setBusy(mode);
    try {
      const answer = mode === 'explain' ? await request(field.id)
        : await request(field.id, answerText.trim(), needsClarification ? description.trim() : undefined);
      if ('explanations' in answer) setExplanation(answer);
      else {
        if (needsClarification) setDescription(previous => [previous, clarification].join(' ').slice(-450));
        setClarification('');
        setProposal(answer);
      }
    } catch {
      setError('تعذّرت مساعدة لونا الآن. تقدر تحاول مرة ثانية أو تختار إجابتك مباشرة.');
    } finally {
      setBusy(undefined);
    }
  }

  return <div className="wi-card-help">
    <button type="button" ref={trigger} className="wi-link" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>
      مو عارف وش أختار؟
    </button>
    {open && <MotionReveal id={id} distance={5} duration={170} className="wi-choice-help" data-clarifying={needsClarification || undefined}>
      <div className="wi-choice-help-heading">
        <img src="/brand/wudayn-emblem-v2.png" width={20} height={22} alt=""/>
        <strong>{needsClarification ? 'لونا تستوضح' : 'لونا'}</strong>
        {!explanation && <button type="button" className="wi-link" onClick={() => void ask('explain')} disabled={disabled || Boolean(busy)}>اشرحي الخيارات</button>}
      </div>
      {!explanation && !proposal && helpScenarios[field.id] && <p>{helpScenarios[field.id]}</p>}
      {explanation && <div className="wi-choice-explanations">
        <dl>{field.options.map(item => <div key={item.code}><dt>{item.label}</dt><dd>{explanation.explanations[item.code]}</dd></div>)}</dl>
      </div>}
      {needsClarification && <p className="wi-choice-proposal" role="status">{proposal.message}</p>}
      <label htmlFor={`${id}-answer`}>{needsClarification ? 'ردّ على لونا' : 'أو قلها بطريقتك'}</label>
      <textarea ref={input} id={`${id}-answer`} rows={2} maxLength={450} value={answerText} disabled={Boolean(busy) || disabled}
        placeholder={needsClarification ? 'اكتب توضيحك هنا…' : 'اكتب اللي يناسبك…'}
        onChange={event => {
          if (needsClarification) setClarification(event.target.value);
          else { setDescription(event.target.value); setProposal(undefined); }
          setError('');
        }}/>
      {!option && <button type="button" className="wi-link wi-choice-map" disabled={disabled || Boolean(busy) || !answerText.trim()} onClick={() => void ask('map')}>{needsClarification ? 'إرسال التوضيح' : 'اقترحي أقرب خيار'}<ArrowLeft size={14} aria-hidden="true"/></button>}
      {busy && <p role="status">{busy === 'map' ? 'لونا تقرأ وصفك…' : 'لونا توضّح الفرق…'}</p>}
      {error && <p role="status">{error}</p>}
      {proposal && option && <div className="wi-choice-proposal">
        <small>اقتراح لونا</small><strong>{option.label}</strong>
        <p role="status">{proposal.message}</p>
        <div className="wi-choice-proposal-actions">
          <MotionPressButton className="wi-button wi-button-primary" disabled={disabled || Boolean(busy)} onClick={() => {
            onChoose(option.code);
            setDescription('');
            setProposal(undefined);
            setOpen(false);
            trigger.current?.focus({ preventScroll: true });
          }}>استخدم هذا الخيار<Check size={15} aria-hidden="true"/></MotionPressButton>
          <button type="button" className="wi-link" onClick={() => { setProposal(undefined); input.current?.focus(); }}>تعديل الوصف</button>
        </div>
      </div>}
    </MotionReveal>}
  </div>;
}

function ReviewChoice({ field, value, suggested, captured = false, side, disabled, onChoose }: {
  field: Field;
  value?: string;
  suggested?: string;
  captured?: boolean;
  side: string;
  disabled: boolean;
  onChoose: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (!value && suggested && !editing) return <div className="wi-hybrid-review-row wi-hybrid-proposed-row">
    <span>{field.label}<small>{side} · مقترح</small><strong className="wi-hybrid-proposed-value">{suggested}</strong></span>
    <button type="button" className="wi-link" disabled={disabled} onClick={() => setEditing(true)}><Pencil size={14} aria-hidden="true"/> تعديل</button>
  </div>;
  return <label className="wi-hybrid-review-row">
    <span>{field.label}<small>{captured ? `${side} · من حوارك مع لونا` : side}</small>
    </span>
    <select aria-label={`${field.label}، ${side}`} value={value ?? ''} disabled={disabled} onChange={event => onChoose(event.target.value)}>
      <option value="" disabled>{suggested ? 'اختيار إجابة' : 'اختر إجابتك'}</option>
      {field.options.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}
    </select>
  </label>;
}

function PortraitChoice({ field, answer, side, captured, disabled, onChoose }: {
  field: Field;
  answer?: Field['options'][number];
  side: string;
  captured: boolean;
  disabled: boolean;
  onChoose: (value: string) => void;
}) {
  return <label className="wi-portrait-choice">
    <span aria-hidden="true">
      <small>{side}{captured ? ' · من لونا' : ''}</small>
      <strong>{answer?.label ?? 'لم تحدد بعد'}</strong>
    </span>
    <Pencil size={13} aria-hidden="true"/>
    <select aria-label={`${field.label}، ${side}`} value={answer?.code ?? ''} disabled={disabled} onChange={event => onChoose(event.target.value)}>
      <option value="" disabled>لم تحدد بعد</option>
      {field.options.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}
    </select>
  </label>;
}

function PartnerRow({item, choices, inferred, disabled, onChoose}: {
  item: Card; choices: Choices; inferred: boolean; disabled: boolean; onChoose: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return <details className="wi-partner-default" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><span>{item.self.label} · عنّي: {selected(item.self, choices)?.label}</span>
      <strong>{inferred ? 'اقتراح للشريك' : 'اختيارك للشريك'}: {selected(item.partner, choices)?.label}</strong><small>تعديل</small></summary>
    {open && <ChoiceCard field={item.partner} value={selected(item.partner, choices)?.code} disabled={disabled} onChoose={onChoose}/>}
  </details>;
}

export function HybridAssessment({
  choices: explicit, childrenCount, partnerChildren, direct=false, historical=false, onChange, onComplete, disabled = false, completingUnavailable = false, gender, aiProposals = [], savedChoices = {}, onClarify, onChoiceHelp, reviewExtras, unresolvedPartnerIds = [],
}: {
  choices: Choices;
  childrenCount?: number;
  partnerChildren?: PartnerCriteria['children'];
  historical?: boolean;
  onChange: (choices: Choices, changedIds?: readonly string[]) => void;
  direct?: boolean;
  unresolvedPartnerIds?: readonly string[];
  onComplete: (choices: InterviewSelection[], inferredIds: string[]) => void;
  disabled?: boolean;
  completingUnavailable?: boolean;
  gender?: Gender;
  savedChoices?: Choices;
  aiProposals?: readonly InterviewProposal[];
  onClarify?: () => void;
  onChoiceHelp?: (fieldId: string, description?: string, priorAnswer?: string) => Promise<InterviewChoiceHelp>;
  reviewExtras?: ReactNode;
}) {
  const blocked = new Set(unresolvedPartnerIds);
  if (!historical) blocked.add('preference:residence_plan:partner');
  if (direct && historical) for (const dimension of legacyCatalog.dimensions) blocked.add(`preference:${dimension.id}:partner`);
  const {choices, inferred} = resolvePartnerDefaults(explicit, savedChoices, blocked);
  const allThemes = makeThemeCards(gender,historical);
  const relevant = (item: Card, values: Choices) => historical || item.self.id !== 'preference:parenting_approach:self' ||
    parentingApplicable({children_plan:values['preference:children_plan:self']?.[0]},childrenCount,partnerChildren);
  const themeCards = allThemes.map(theme=>({...theme,cards:theme.cards.filter(item=>relevant(item,choices))}));
  const cards = allThemes.flatMap((theme, themeIndex) => theme.cards.map(card => ({ ...card, themeIndex })));
  const fields = themeCards.flatMap(theme=>theme.cards.flatMap(assessmentFields));
  const [index, setIndex] = useState(() => cards.findIndex(card => relevant(card,choices) && needsCard(card, choices)));
  const started = useRef(false);
  const [history, setHistory] = useState<Visit[]>([]);
  const [forward, setForward] = useState<Visit[]>([]);
  const [editField, setEditField] = useState<string>();
  const [recorded, setRecorded] = useState('');
  const movingFrom = useRef(false);
  const backwards = useRef(false);
  const previousTap = useRef<{x:number; y:number; at:number} | null>(null);
  const [portraitOpen, setPortraitOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusQuestion = useRef(false);
  const headingId = useId();

  const card = cards[index];
  const allSelected = fields.flatMap(field => {
    const answer = selected(field, choices);
    return answer ? [{ id: field.id, values: [answer.code] }] : [];
  });
  const answered = allSelected.length;
  const available = fields.length - answered;
  const aiValues = new Map(aiProposals.filter(item => !item.needsClarification && item.source !== 'self_default' && item.values.length === 1)
    .map(item => [item.id, item.values[0]]));
  const wasCaptured = (field: Field) => Boolean(aiValues.has(field.id) && aiValues.get(field.id) === selected(field, choices)?.code);
  const hasSuggestion = (field: Field) => field.options.some(option => option.code === aiValues.get(field.id)) && Boolean(selected(field, choices));
  const extracted = fields.filter(hasSuggestion);
  const capturedCount = extracted.length;
  const retainedCount = extracted.filter(wasCaptured).length;
  const pendingSuggestions = extracted.filter(field => !savedChoices[field.id]?.length);
  const pendingIds = new Set(pendingSuggestions.map(field => field.id));
  const selfAnswer = card && selected(card.self, choices);
  const topicFields = card ? assessmentFields(card) : [];
  const activeField = topicFields.find(field => field.id === editField) ?? topicFields.find(field => !selected(field, choices));
  const screen = activeField?.id ?? card?.self.id ?? 'review';
  const retainSelf = selfAnswer && activeField === card?.partner;
  const firstNeeded = cards.findIndex(item => relevant(item,choices) && needsCard(item, choices));

  useEffect(() => {
    if ((!started.current && capturedCount > 0) || (index < 0 && firstNeeded >= 0) || (card && !relevant(card,choices))) setIndex(firstNeeded);
  }, [capturedCount, firstNeeded, index]);

  useLayoutEffect(() => {
    movingFrom.current = false;
    if (!focusQuestion.current) return;
    focusQuestion.current = false;
    const title = heading.current;
    const scroller = title?.closest<HTMLElement>('.wi-content');
    if (!title || !scroller) return;
    const prompt = title.parentElement?.querySelector<HTMLElement>('.wi-hybrid-field legend') ?? title;
    prompt.focus({preventScroll:true});
    const offset = (title.closest('.wi-hybrid-stage') ?? title).getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    if (offset < 8 || offset > scroller.clientHeight / 2) scroller.scrollTop += offset - 16;
  }, [screen]);

  function choose(id: string, code: string) {
    started.current = true;
    const field = fields.find(item => item.id === id);
    const option = field?.options.find(item => item.code === code);
    if (field && option) setRecorded(`سُجّل · ${field.label} · ${id.endsWith(':partner') ? 'تفضيلي في الشريك' : 'عنّي'} · ${option.label}`);
    onChange({ ...explicit, [id]: [code] }, [id]);
  }

  function advance(nextChoices: Choices = choices) {
    if (movingFrom.current || !card) return;
    focusQuestion.current = true;
    backwards.current = false;
    movingFrom.current = true;
    started.current = true;
    setHistory(trail => [...trail, {index, fieldId:activeField?.id}]);
    const revisit = forward.findIndex(point => point.index >= 0 && relevant(cards[point.index], nextChoices)
      && (point.fieldId || needsCard(cards[point.index], nextChoices)));
    if (editField && needsCard(card, nextChoices) && forward[revisit]?.index !== index) {
      setEditField(undefined);
    } else if (revisit >= 0) {
      const point = forward[revisit];
      setForward(forward.slice(revisit + 1));
      setEditField(point.fieldId);
      setIndex(point.index);
    } else {
      setForward([]);
      setEditField(undefined);
      setIndex(cards.findIndex(item => relevant(item,nextChoices) && needsCard(item,nextChoices)));
    }
  }

  function commitField(field: Field, code: string) {
    if (disabled || movingFrom.current) return;
    choose(field.id, code);
    if (editField) return;
    const next = { [field.id]: [code] };
    const resolved = resolvePartnerDefaults({...explicit, ...next}, {...savedChoices, ...next}, blocked);
    advance(resolved.choices);
  }

  const previousVisit = history.filter(point => relevant(cards[point.index], choices)).at(-1);
  function goBack() {
    if (!previousVisit) return;
    focusQuestion.current = true;
    previousTap.current = null;
    backwards.current = true;
    setForward(trail => [{index, fieldId:editField}, ...trail]);
    setRecorded('');
    setEditField(previousVisit.fieldId);
    setIndex(previousVisit.index);
    setHistory(history.slice(0, history.lastIndexOf(previousVisit)));
  }

  const previous = previousVisit && cards[previousVisit.index];
  function suggestionRow(item: Card) {
    const answer = selected(item.partner, choices);
    if (!answer || !selected(item.self, choices)) return null;
    return <PartnerRow key={item.partner.id} item={item} choices={choices} inferred={inferred.has(item.partner.id)}
      disabled={disabled} onChoose={code => choose(item.partner.id, code)}/>;
  }
  const provenance = (id: string, side: string) => inferred.has(id) ? side + ' · اقتراح من إجابتك' : side;
  const canAdvance = card && (editField ? activeField && selected(activeField, choices) : !needsCard(card, choices));
  const timing = cards.find(item => item.self.id === 'preference:marriage_timeline:self')!;
  const formalStep = selected(timing.self, choices);
  const partnerStep = selected(timing.partner, choices);
  const helpFor = (field: Field) => onChoiceHelp && <ChoiceHelp request={onChoiceHelp} field={field} onChoose={code => commitField(field, code)} disabled={disabled}/>;
  const suggestionsReview = capturedCount > 0 && <details key={card ? 'suggestions' : 'review-suggestions'} className="wi-hybrid-captured-review">
      <summary><span className="wi-extracted-summary"><span>هذا ما فهمته منك <bdi className="wi-extracted-count">{number.format(capturedCount)}</bdi></span>
        {card && pendingSuggestions.length > 0 && <small>{perspective(pendingSuggestions[0])} · {pendingSuggestions[0].label} · {selected(pendingSuggestions[0], choices)?.label}</small>}
      </span><ChevronDown size={17} aria-hidden="true"/></summary>
      <p>عدّل أي اختيار هنا. تعتمد إجاباتك معًا بعد إكمال الباقي.</p>
      <div className="wi-hybrid-review-fields">
        {extracted.map(field => <div key={field.id} className="wi-extracted-answer" data-corrected={!wasCaptured(field) || undefined}><ReviewChoice
          field={field}
          value={selected(field, choices)?.code}
          captured={wasCaptured(field)}
          side={field.id.startsWith('personality:') ? 'عن شخصيتي' : field.id.endsWith(':partner') ? 'تفضيلي في الشريك' : 'عنّي'}
          onChoose={code => choose(field.id, code)}
          disabled={disabled}
        />
          {wasCaptured(field) && <details className="wi-hybrid-evidence"><summary>من كلامك</summary>
            {aiProposals.find(p => p.id === field.id)?.evidence.filter(e => !e.turnId.startsWith('context:')).map(e => <q key={e.turnId + e.quote}>{e.quote}</q>)}
          </details>}
          {!wasCaptured(field) && <small>عدّلت هذه الإجابة</small>}
        </div>)}
      </div>
      {card && pendingSuggestions.length > 0 && <button type="button" className="wi-link" disabled={disabled} onClick={event => {
        onChange(explicit, pendingSuggestions.map(field => field.id));
        event.currentTarget.closest('details')?.removeAttribute('open');
        heading.current?.focus({preventScroll:true});
      }}>اعتماد المقترحات في مسودتي</button>}
    </details>;
  return <section className="wi-hybrid" aria-labelledby={headingId}>
    {!direct && <LunaSessionSteps current={card ? 'اختياراتك' : 'المراجعة'}/>}
    {card && <div className="wi-hybrid-progress">
      <span>{activeField && card.personality.includes(activeField) ? 'ملامح شخصيتك' : themeCards[card.themeIndex].label}</span>
      <small>{available ? `الأسئلة المتبقية · ${number.format(available)}` : 'مراجعة اختياراتك'}</small>
      <progress aria-label="اكتمال إجابات التوافق" value={answered} max={fields.length}/>
    </div>}
    <div className="wi-hybrid-stage" data-back={backwards.current || undefined}>
      {previousVisit && <div className="wi-step-nav">
        <button type="button" className="wi-link" onClick={goBack} disabled={disabled}><ArrowRight size={15} aria-hidden="true"/> السابق</button>
        {editField && <span>تعديل إجابتك</span>}
      </div>}
      <h1 id={headingId} ref={heading} tabIndex={-1}>{card ? activeField?.label ?? card.self.label : 'راجع إجاباتك'}</h1>
      {card && <small role="status" className="wi-hybrid-recorded" data-echo>{recorded}</small>}
      {retainSelf && <p className="wi-self-echo"><span>{pendingIds.has(card.self.id) ? 'في حياتي · اقتراح لونا' : 'في حياتي'}</span><strong>{selfAnswer.label}</strong></p>}
      {card ? <div className="wi-hybrid-card" onClickCapture={event => {
        if (!event.detail || !(event.target as Element).closest('.wi-hybrid-option')) return;
        const previous = previousTap.current;
        const at = performance.now();
        if (previous && at - previous.at < 350 && Math.abs(event.clientX - previous.x) < 8 && Math.abs(event.clientY - previous.y) < 8) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        previousTap.current = {x:event.clientX, y:event.clientY, at};
      }}>
        {activeField && <ChoiceCard key={activeField.id} field={activeField} value={selected(activeField, choices)?.code}
          onChoose={code => commitField(activeField, code)} disabled={disabled}
          compact={card.personality.includes(activeField)} help={helpFor(activeField)}/>}
      </div> : <>
        <p className="wi-lead">{retainedCount ? `من كلامك أخذنا ${number.format(retainedCount)} من أصل ${number.format(answered)} إجابة. افتح أي موضوع وراجع اللي يمثّلك قبل الاعتماد.` : 'هذه اختياراتك. افتح أي موضوع وعدّل اللي تبي قبل الاعتماد.'}</p>
        {suggestionsReview}
        <div className="wi-hybrid-review">
          {themeCards.map(theme => {
            const sample = theme.cards[0]?.self;
            const answer = sample && selected(sample, choices);
            return <details key={theme.label}>
            <summary><span className="wi-review-topic">{theme.label}{answer && <small>{sample.label} · {answer.label}</small>}</span><ChevronDown size={17} aria-hidden="true"/></summary>
            <div className="wi-hybrid-review-fields">
              {theme.cards.flatMap(item => assessmentFields(item).map(field => <ReviewChoice
                key={field.id}
                field={field}
                value={selected(field, choices)?.code}

                captured={wasCaptured(field)}
                side={provenance(field.id, field.id === item.self.id ? 'عنّي' : field.id === item.partner.id ? 'تفضيلي في الشريك' : 'عن شخصيتي')}
                onChoose={code => choose(field.id, code)}
                disabled={disabled}
              />))}
            </div>
          </details>;
          })}
        </div>
        <details className="wi-portrait-theme wi-reflection">
          <summary>جاهزيتك للخطوة الرسمية</summary>
          <p>راجع توقيتك وتوقّعاتك من الشريك قبل اعتماد الملف.</p>
          <ReviewChoice field={timing.self} value={formalStep?.code} side="التوقيت اللي يناسبني" disabled={disabled} onChoose={code => choose(timing.self.id, code)}/>
          <ReviewChoice field={timing.partner} value={partnerStep?.code} side={provenance(timing.partner.id, 'التوقيت اللي يناسبني عند الشريك')} disabled={disabled} onChoose={code => choose(timing.partner.id, code)}/>
          {formalStep?.code === 'D' && <p>موعدك غير محدد. تقدر تتركه مفتوحًا إلى أن تتضح خطتك.</p>}
        </details>
        {reviewExtras}
      </>}
    </div>
    {previous && !previous.selfOnly && inferred.has(previous.partner.id) && suggestionRow(previous)}
    <div className="wi-hybrid-actions">
      {(!card || canAdvance) && <MotionPressButton
        className="wi-button wi-button-primary wi-wide"
        disabled={disabled || (card ? !canAdvance : available > 0 || completingUnavailable)}
        onClick={card ? () => advance() : () => onComplete(allSelected, [...inferred])}
      >{card ? 'متابعة' : 'اعتماد إجاباتي'}{card ? <ArrowLeft size={17} aria-hidden="true"/> : <Check size={17} aria-hidden="true"/>}</MotionPressButton>}
      {completingUnavailable && !card && <p className="wi-small" role="status">يمكنك مراجعة الإجابات ريثما يكتمل تحليل كلامك.</p>}
      {onClarify && <div className="wi-hybrid-secondary">
        <button type="button" className="wi-link" onClick={onClarify} disabled={disabled}>أبي أوضّح إجابتي</button>
      </div>}
    </div>
    {card && suggestionsReview}
    {card && <details className="wi-living-portrait" onToggle={event => setPortraitOpen(event.currentTarget.open)}>
      <summary>
        <span className="wi-portrait-mark" aria-hidden="true">
          {themeCards.map(theme => {
            const items = theme.cards.flatMap(assessmentFields);
            const filled = items.filter(field => selected(field, choices)).length;
            return <i key={theme.label}><span style={{ transform: `scaleX(${filled / items.length})` }}/></i>;
          })}
          <HeartHandshake size={17}/>
        </span>
        <span className="wi-portrait-title"><strong>ملامح توافقك</strong><small>{answered === 0 ? 'تتشكّل مع كل إجابة' : 'راجع إجاباتك وما فهمته لونا'}</small></span>
        <ChevronDown size={17} aria-hidden="true"/>
      </summary>
      {portraitOpen && <div className="wi-portrait-body">
        <p><LockKeyhole size={13} aria-hidden="true"/>{answered ? 'مسودتك الخاصة. اضغط على أي إجابة لتعديلها.' : 'هنا تظهر إجاباتك وما تفهمه لونا من حديثك.'}</p>
        {themeCards.map(theme => {
          const items = theme.cards.filter(item => selected(item.self, choices) || selected(item.partner, choices) || item.personality.some(field => selected(field, choices)));
          if (!items.length) return null;
          return <details key={theme.label} className="wi-portrait-theme">
            <summary><span>{theme.label}</span><ChevronDown size={14} aria-hidden="true"/></summary>
            <div>
              {items.map(item => <div key={item.self.id} className="wi-portrait-mirror-row">
                <strong>{item.self.label}</strong>
                {assessmentFields(item).map(field => {
                  const answer = selected(field, choices);
                  if (field !== item.self && field !== item.partner && !answer) return null;
                  return <PortraitChoice
                    key={field.id}
                    field={field}
                    answer={answer}
                    side={provenance(field.id, field === item.self ? 'في حياتي' : field === item.partner ? 'ما أتمناه من شريكي' : 'عن شخصيتي')}
                    captured={wasCaptured(field)}
                    disabled={disabled}
                    onChoose={code => choose(field.id, code)}
                  />;
                })}
              </div>)}
            </div>
          </details>;
        })}
      </div>}
    </details>}
  </section>;
}
