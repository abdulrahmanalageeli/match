import { sharedDecisionLabel, sharedDecisionPrompt } from '../compatibility/sharedDecisions';
import { assessmentProgress } from './openingResults';
import { openingHighlights } from './openingEvidence';
import { OpeningWords } from './OpeningWords';
import { resolvePartnerDefaults } from './partnerDefaults';
import { portraitLines } from './personalPortrait';
import { nextTopicCard, readTopic, rememberTopic, topicResumeKey, topicRoutes } from './topicJourney';
import memberAr from '../member-copy.ts';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, LockKeyhole, Pencil } from '../BrandIcons';
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
import './personal-portrait.css';

type Choices = Record<string, string[]>;
const sessionSteps = ['قصتك', 'اختياراتك', 'المراجعة'] as const;

export function LunaSessionSteps({ current }: { current: typeof sessionSteps[number] | 'complete' }) {
  const active = current === 'complete' ? sessionSteps.length : sessionSteps.indexOf(current);
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
  domestic_labor: ['prepare_early', 'follow_through', 'unfinished_tasks'],
  social_rhythm: ['group_energy', 'quiet_settings'],
  social_boundaries: ['start_conversation'],
  closeness_pace: ['prefer_familiar', 'try_new_ideas', 'explore_views'],
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
  domestic_labor: ['planning'],
  social_rhythm: ['social_energy', 'quiet_comfort', 'novelty'],
  mixed_gatherings: ['initiative'],
  closeness_pace: ['openness', 'depth', 'closeness', 'reassurance'],
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

function SummaryTopics({ groups, choices, lines, mode, inferred, hiddenPartnerIds, completionChoices = choices, sourceOf, onChoose, onDetails, disabled = false }: {
  groups: ReturnType<typeof makeThemeCards>;
  choices: Choices;
  lines: ReturnType<typeof portraitLines<Field>>;
  mode: 'draft' | 'review' | 'saved';
  inferred: ReadonlySet<string>;
  hiddenPartnerIds?: ReadonlySet<string>;
  completionChoices?: Choices;
  sourceOf?: (field: Field) => string | undefined;
  onChoose?: (id: string, code: string) => void;
  onDetails?: () => void;
  disabled?: boolean;
}) {
  return <>
    {mode !== 'draft' && <div className="wi-summary-heading">
      <h2 className="wi-summary-title"><LockKeyhole size={15} aria-hidden="true"/>إجاباتي</h2>
      {onDetails && <button type="button" className="wi-link" onClick={onDetails}>تفاصيل المراجعة</button>}
    </div>}
    <div className="wi-summary-topics">{groups.map(group => {
      const allFields = group.cards.flatMap(assessmentFields);
      const fields = allFields.filter(field => !hiddenPartnerIds?.has(field.id) && (mode === 'review' || selected(field, choices)));
      if (!fields.length) return null;
      const highlight = lines.find(line => fields.some(field => field.id === line.field.id));
      return <details key={group.label} className="wi-summary-topic">
        <summary><span><span className="wi-summary-caption">{group.label}</span>
          <strong>{highlight?.preview ?? 'مراجعة الإجابات'}</strong>
        </span>{mode === 'draft' && <small className="wi-summary-status">{group.cards.every(card => !needsCard(card, completionChoices)) ? 'اكتملت الإجابات' : 'قيد الإكمال'}</small>}
          <ChevronDown size={17} aria-hidden="true"/></summary>
        <div className="wi-summary-fields">
          {fields.map(field => {
            const answer = selected(field, choices);
            const side = perspective(field);
            const source = [inferred.has(field.id) && 'اقتراح من إجابتك', sourceOf?.(field)].filter(Boolean).join(' · ');
            const content = <><span><small>{field.label}</small>
              <span className="wi-summary-perspective" data-side={field.id.endsWith(':partner') ? 'partner' : 'self'}>{side}</span>
              {source && <small className="wi-summary-source">{source}</small>}
              <strong>{answer?.label ?? 'اختر إجابتك'}</strong>
              {field.id === 'preference:marriage_timeline:self' && answer?.code === 'D' && <small>يمكنك ترك الموعد مفتوحًا إلى أن تتضح خطتك.</small>}
            </span>{onChoose && <Pencil size={15} aria-hidden="true"/>}</>;
            return onChoose ? <label key={field.id} className="wi-summary-answer" data-field-id={field.id}>
              {content}
              <select aria-label={`${field.label}، ${side}`} value={answer?.code ?? ''} disabled={disabled} onChange={event => onChoose(field.id, event.target.value)}>
                {!answer && <option value="" disabled>اختر إجابتك</option>}
                {field.options.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}
              </select>
            </label> : <div key={field.id} className="wi-summary-answer" data-field-id={field.id}>{content}</div>;
          })}
        </div>
      </details>;
    })}</div>
  </>;
}

export function ConfirmedAnswers({ confirmed, gender, inferredPartnerIds, onEdit, onDetails }: {
  confirmed: readonly InterviewSelection[]; gender?: Gender; inferredPartnerIds?: readonly string[];
  onEdit?: (id: string, code: string) => void;
  onDetails?: () => void;
}) {
  const historical = confirmed.some(item=>legacyTraits.some(trait=>item.id==='personality:'+trait.id+':self'));
  const groups = makeThemeCards(gender,historical);
  const byTopic = groups.map(group => group.cards.flatMap(assessmentFields));
  const choices = Object.fromEntries(confirmed.map(item => [item.id, item.values]));
  const inferred = new Set(inferredPartnerIds);
  const omitFromHighlights = inferredPartnerIds ? inferred : new Set(byTopic.flat().filter(field => field.id.endsWith(':partner')).map(field => field.id));
  return <section className="wi-confirmed-answers" aria-label="إجاباتي المحفوظة">
    <SummaryTopics groups={groups} choices={choices} lines={portraitLines(byTopic, choices, omitFromHighlights)}
      mode="saved" inferred={inferred} onChoose={onEdit} onDetails={onDetails}/>
  </section>;
}

function assessmentFields(card: Card) {
  return card.selfOnly ? [card.self, ...card.personality] : [card.self, card.partner, ...card.personality];
}

function needsCard(card: Card, choices: Choices) {
  return assessmentFields(card).some(field => !selected(field, choices));
}

function ChoiceCard({ field, value, onChoose, disabled, compact = false, shared = false, help }: {
  field: Field;
  value?: string;
  onChoose: (value: string) => void;
  disabled: boolean;
  compact?: boolean;
  shared?: boolean;
  help?: ReactNode;
}) {
  const partner = field.id.endsWith(':partner');
  return <fieldset className="wi-hybrid-field" data-field-id={field.id} data-compact={compact || undefined} data-side={partner ? 'partner' : 'self'}>
    <legend tabIndex={-1}><span className="wi-field-side">{shared ? 'ترتيب أفضّله لنا' : compact ? 'عن شخصيتي' : partner ? 'في شريك حياتي' : 'في حياتي'}</span>{field.prompt}</legend>
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

function ChoiceHelp({ field, request, onChoose, disabled, shared = false }: {
  shared?: boolean;
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
          }}>{shared ? 'اعتمد هذا الخيار لنا' : 'استخدم هذا الخيار'}<Check size={15} aria-hidden="true"/></MotionPressButton>
          <button type="button" className="wi-link" onClick={() => { setProposal(undefined); input.current?.focus(); }}>تعديل الوصف</button>
        </div>
      </div>}
    </MotionReveal>}
  </div>;
}

function ReviewChoice({ field, value, suggested, source, side, disabled, onChoose }: {
  field: Field;
  value?: string;
  suggested?: string;
  source?: string;
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
    <span>{field.label}<small>{side}{source && ` · ${source}`}</small>
    </span>
    <select aria-label={`${field.label}، ${side}`} value={value ?? ''} disabled={disabled} onChange={event => onChoose(event.target.value)}>
      <option value="" disabled>{suggested ? 'اختيار إجابة' : 'اختر إجابتك'}</option>
      {field.options.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}
    </select>
  </label>;
}

function PartnerRow({item, choices, inferred, disabled, onChoose}: {
  item: Card; choices: Choices; inferred: boolean; disabled: boolean; onChoose: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return <details className="wi-partner-default" data-suggested={inferred || undefined} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><span>{item.self.label} · عنّي: {selected(item.self, choices)?.label}</span>
      <strong>{inferred ? 'اقتراح للشريك' : 'اختيارك للشريك'}: {selected(item.partner, choices)?.label}</strong><small>تعديل</small></summary>
    {open && <ChoiceCard field={item.partner} value={selected(item.partner, choices)?.code} disabled={disabled} onChoose={onChoose}/>}
  </details>;
}

type LayoutContext = {
  gender?: Gender; historical?: boolean; direct?: boolean; childrenCount?: number;
  partnerChildren?: PartnerCriteria['children']; unresolvedPartnerIds?: readonly string[];
};

function assessmentLayout(explicit: Choices, savedChoices: Choices, {gender, historical=false, direct=false, childrenCount, partnerChildren, unresolvedPartnerIds=[]}: LayoutContext) {
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
  return { choices, inferred, themeCards, cards, fields, relevant, blocked };
}

type Progress = ReturnType<typeof assessmentProgress>;
function OpeningCounts({progress, proposed, total}: {progress: Progress; proposed: number; total: number}) {
  const corrected = proposed - progress.openingPending - progress.openingMatched;
  return <span className="wi-opening-result" data-proposed={proposed} data-pending={progress.openingPending} data-matched={progress.openingMatched} data-remaining={progress.remaining}>
    <strong className="wi-opening-count-title">اختصرنا لك من رسالتك الأولى <span className="wi-opening-count-pair"><bdi>{number.format(proposed)}</bdi> من أصل <bdi>{number.format(total)}</bdi> إجابة</span></strong>
    <span className="wi-opening-count-states">
      {progress.openingPending > 0 && <span><bdi>{number.format(progress.openingPending)}</bdi> للمراجعة</span>}
      {progress.openingMatched > 0 && <span><bdi>{number.format(progress.openingMatched)}</bdi> محفوظة كما هي</span>}
      {corrected > 0 && <span><bdi>{number.format(corrected)}</bdi> عدّلتها</span>}
      <span aria-label={`إجابات التوافق المتبقية ${number.format(progress.remaining)}`}><bdi>{number.format(progress.remaining)}</bdi> متبقية</span>
    </span>
  </span>;
}

function openingSide(field: Field) {
  return field.id.startsWith('personality:') ? 'عن شخصيتي' : field.id.endsWith(':partner') ? 'تفضيلي في الشريك' : 'عنّي';
}

export function OpeningInsights({openingTurnId, openingText, proposals, choices, savedChoices, onChoose, disabled, ...context}: LayoutContext & {
  openingTurnId: string; openingText: string; proposals: readonly InterviewProposal[]; choices: Choices; savedChoices: Choices;
  onChoose: (id: string, code: string) => void; disabled: boolean;
}) {
  const layout = assessmentLayout(choices, savedChoices, context);
  const progress = assessmentProgress(layout.fields, layout.choices, savedChoices, proposals, openingTurnId);
  const highlights = openingHighlights(openingText, openingTurnId, proposals, progress.extracted);
  const proposed = new Set(highlights.flatMap(part => part.sources.map(source => source.id))).size;
  if (!highlights.length) return <p className="wi-opening-empty">نكمّل اختياراتك سؤالًا سؤالًا، ولن نحفظ عنك إجابة لم تقلها.</p>;
  return <details className="wi-opening-insights">
    <summary><OpeningCounts progress={progress} proposed={proposed} total={layout.fields.length}/><ChevronDown size={16} aria-hidden="true"/></summary>
    <OpeningWords text={openingText} fields={layout.fields} highlights={highlights} proposals={proposals} saved={savedChoices}
      onChoose={onChoose} disabled={disabled} renderChoice={id => {
        const field = layout.fields.find(item => item.id === id)!;
        return <ReviewChoice field={field} value={selected(field, layout.choices)?.code} side={openingSide(field)}
          disabled={disabled} onChoose={code => onChoose(id, code)}/>;
      }}/>
  </details>;
}

export function HybridAssessment({
  memberId,
  portraitPartnerSourceKnown = true,
  choices: explicit, childrenCount, partnerChildren, direct=false, historical=false, onChange, onComplete, disabled = false, completingUnavailable = false, gender, aiProposals = [], savedChoices = {}, openingTurnId, openingText = '', onClarify, onChoiceHelp, reviewOptions, reviewExtras, unresolvedPartnerIds = [], receiptInferredPartnerIds = [],
}: {
  memberId?: string;
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
  openingTurnId?: string;
  openingText?: string;
  savedChoices?: Choices;
  receiptInferredPartnerIds?: readonly string[];
  portraitPartnerSourceKnown?: boolean;
  aiProposals?: readonly InterviewProposal[];
  onClarify?: () => void;
  onChoiceHelp?: (fieldId: string, description?: string, priorAnswer?: string) => Promise<InterviewChoiceHelp>;
  reviewOptions?: ReactNode;
  reviewExtras?: ReactNode;
}) {
  const { choices, inferred, themeCards, cards, fields, relevant, blocked } = assessmentLayout(explicit, savedChoices, { gender, historical, direct, childrenCount, partnerChildren, unresolvedPartnerIds });
  const topicKey = topicResumeKey(memberId, historical);
  const [startTopic] = useState(() => readTopic(topicKey, themeCards.length));
  const routesFor = (values: Choices) => topicRoutes(themeCards.map(theme => theme.label), cards,
    item => relevant(item, values), (field: Field) => !selected(field, values));
  const routes = routesFor(choices);
  const [index, setIndex] = useState(() => nextTopicCard(routes, startTopic));
  const topicMenu = useRef<HTMLDetailsElement>(null);
  const started = useRef(false);
  const [history, setHistory] = useState<Visit[]>([]);
  const [forward, setForward] = useState<Visit[]>([]);
  const [editField, setEditField] = useState<string>();
  const [recorded, setRecorded] = useState('');
  const movingFrom = useRef(false);
  const backwards = useRef(false);
  const previousTap = useRef<{x:number; y:number; at:number} | null>(null);
  const [draftReviewOpen, setDraftReviewOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusQuestion = useRef(false);
  const headingId = useId();

  const card = cards[index];
  const allSelected = fields.flatMap(field => {
    const answer = selected(field, choices);
    return answer ? [{ id: field.id, values: [answer.code] }] : [];
  });
  const implicitPartner = new Set([...inferred, ...receiptInferredPartnerIds]);
  const omittedPortraitIds = portraitPartnerSourceKnown ? implicitPartner : new Set(fields.filter(field => field.id.endsWith(':partner')).map(field => field.id));
  const portrait = portraitLines(themeCards.map(theme => theme.cards.flatMap(assessmentFields)), savedChoices, omittedPortraitIds);
  const progress = assessmentProgress(fields, choices, savedChoices, aiProposals, openingTurnId);
  const available = progress.remaining;
  const wasCaptured = (field: Field) => progress.retained.has(field.id);
  const extracted = fields.filter(field => progress.extracted.has(field.id));
  const capturedCount = extracted.length;
  const highlights = openingHighlights(openingText, openingTurnId, aiProposals, progress.extracted);
  const openingIds = new Set(highlights.flatMap(part => part.sources.map(source => source.id)));
  const pendingIds = progress.pending;
  const pendingSuggestions = fields.filter(field => pendingIds.has(field.id));
  const sourceOf = (field: Field) => pendingIds.has(field.id) ? 'مقترح من لونا' : wasCaptured(field) ? 'يطابق اقتراح لونا' : undefined;
  const [separateFor,setSeparateFor] = useState<string>();
  const selfAnswer = card && selected(card.self, choices);
  const topicFields = card ? assessmentFields(card) : [];
  const activeField = topicFields.find(field => field.id === editField) ?? topicFields.find(field => !selected(field, choices));
  const sharedTopic = card?.self.id.split(':')[1];
  const jointPrompt = card && sharedTopic && !historical && !editField && separateFor !== card.self.id
    && !card.selfOnly && !choices[card.partner.id]?.length && !blocked.has(card.partner.id)
    ? sharedDecisionPrompt(sharedTopic, gender) : undefined;
  const sharedPrompt = activeField === card?.self ? jointPrompt : undefined;
  const savedArrangement = jointPrompt && activeField === card?.partner && selfAnswer ? selfAnswer : undefined;
  const capturedPartner = !historical && !editField && card && activeField === card.self && sharedTopic
    && sharedDecisionPrompt(sharedTopic, gender)
    && aiProposals.some(proposal => proposal.id === card.partner.id && proposal.values[0] === choices[card.partner.id]?.[0])
    ? selected(card.partner, choices) : undefined;
  const confirmOwn = capturedPartner && card && separateFor !== card.self.id
    ? card.self.options.find(option => option.code === capturedPartner.code) : undefined;
  const displayField = activeField && (sharedPrompt ? {
    ...activeField, prompt: sharedPrompt, options: activeField.options.map(option => ({
      ...option, label: sharedDecisionLabel(sharedTopic!, option.code, option.label),
    })),
  } : activeField);
  const currentEvidence = activeField && progress.extracted.has(activeField.id)
    ? aiProposals.find(proposal => proposal.id === activeField.id)?.evidence.find(item => !item.turnId.startsWith('context:'))?.quote
    : undefined;
  const screen = activeField?.id ?? card?.self.id ?? 'review';
  const retainSelf = selfAnswer && activeField === card?.partner;
  const firstNeeded = nextTopicCard(routes, card?.themeIndex ?? startTopic);

  useEffect(() => {
    if ((!started.current && capturedCount > 0) || (index < 0 && firstNeeded >= 0) || (card && !relevant(card,choices))) setIndex(firstNeeded);
  }, [capturedCount, firstNeeded, index]);

  const activeTopic = firstNeeded < 0 ? null : card?.themeIndex;
  useEffect(() => {
    if (activeTopic !== undefined) rememberTopic(topicKey, activeTopic);
  }, [topicKey, activeTopic]);

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
    const missingPerspective = !selected(card.self, nextChoices) || (!card.selfOnly && !selected(card.partner, nextChoices));
    if (editField && missingPerspective && forward[revisit]?.index !== index) {
      setEditField(undefined);
    } else if (revisit >= 0) {
      const point = forward[revisit];
      setForward(forward.slice(revisit + 1));
      setEditField(point.fieldId);
      setIndex(point.index);
    } else {
      setForward([]);
      setEditField(undefined);
      setIndex(nextTopicCard(routesFor(nextChoices), card.themeIndex));
    }
  }

  function pickTopic(themeIndex: number) {
    const next = routes[themeIndex].nextIndex;
    if (disabled || next < 0) return;
    if (topicMenu.current) topicMenu.current.open = false;
    if (index === next && !editField) {
      heading.current?.focus();
      return;
    }
    started.current = true;
    focusQuestion.current = true;
    previousTap.current = null;
    backwards.current = false;
    setHistory(trail => [...trail, {index, fieldId: activeField?.id}]);
    setForward([]);
    setEditField(undefined);
    setRecorded('');
    setIndex(next);
  }

  function commitField(field: Field, code: string, shared = false) {
    if (disabled || movingFrom.current) return;
    const next = { [field.id]: [code] };
    if (shared && sharedPrompt && card && field === card.self) {
      next[card.partner.id] = [code];
      started.current = true;
      setRecorded(`سُجّل تفضيلك للترتيب المشترك · ${field.label}`);
      onChange({...explicit,...next}, Object.keys(next));
    } else choose(field.id, code);
    if (editField) return;
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
  const canAdvance = card && (editField ? activeField && selected(activeField, choices) : !needsCard(card, choices));
  const helpFor = (field: Field) => onChoiceHelp && <ChoiceHelp request={onChoiceHelp} field={field} onChoose={code => commitField(field, code, Boolean(sharedPrompt))} shared={Boolean(sharedPrompt)} disabled={disabled}/>;
  const otherExtracted = extracted.filter(field => !openingIds.has(field.id));
  const capturedChoice = (field: Field) => <ReviewChoice field={field} value={selected(field, choices)?.code}
    source={sourceOf(field)} side={openingSide(field)} onChoose={code => choose(field.id, code)} disabled={disabled}/>;
  const suggestionsReview = capturedCount > 0 ? <details key={card ? 'suggestions' : 'review-suggestions'} className="wi-hybrid-captured-review">
      <summary><span>من كلامك · {number.format(capturedCount)} إجابات للمراجعة</span><ChevronDown size={17} aria-hidden="true"/></summary>
      {openingTurnId && openingIds.size > 0 && <OpeningCounts progress={progress} proposed={openingIds.size} total={fields.length}/>}
      <OpeningWords text={openingText} fields={fields} highlights={highlights} proposals={aiProposals} saved={savedChoices}
        disabled={disabled} onChoose={choose} renderChoice={id => capturedChoice(extracted.find(field => field.id === id)!)}/>
      {otherExtracted.length > 0 && <div className="wi-hybrid-review-fields">
        {highlights.length > 0 && <strong className="wi-opening-later-title">من بقية الحوار</strong>}
        {otherExtracted.map(field => <div key={field.id} className="wi-extracted-answer" data-corrected={!wasCaptured(field) || undefined}>{capturedChoice(field)}
          {wasCaptured(field) && <details className="wi-hybrid-evidence"><summary>من كلامك</summary>
            {aiProposals.find(p => p.id === field.id)?.evidence.filter(e => !e.turnId.startsWith('context:')).map(e => <q key={e.turnId + e.quote}>{e.quote}</q>)}
          </details>}
          {!wasCaptured(field) && <small>اختيارك المحفوظ يختلف عن الاقتراح</small>}
        </div>)}
      </div>}
      {card && pendingSuggestions.length > 0 && <button type="button" className="wi-link" disabled={disabled} onClick={event => {
        onChange(explicit, pendingSuggestions.map(field => field.id));
        event.currentTarget.closest('details')?.removeAttribute('open');
        heading.current?.focus({preventScroll:true});
      }}>حفظ هذه الإجابات في مسودتي</button>}
    </details> : null;
  return <section className="wi-hybrid" aria-labelledby={headingId}>
    {!direct && !card && <LunaSessionSteps current="المراجعة"/>}
    {card && <details ref={topicMenu} className="wi-topic-route" data-active-topic={card.themeIndex}>
      <summary>
        <span className="wi-chapter-position" aria-hidden="true">
          <svg viewBox="0 0 36 36" focusable="false">
            <circle cx="18" cy="18" r="15"/>
            <circle cx="18" cy="18" r="15" pathLength="1" strokeDasharray="1"
              strokeDashoffset={routes[card.themeIndex].remaining / themeCards[card.themeIndex].cards.flatMap(assessmentFields).length}/>
          </svg>
          <bdi>{number.format(card.themeIndex + 1)}</bdi>
        </span>
        <span className="wi-topic-current" key={card.themeIndex}><strong>{!direct && 'اختياراتك · '}{routes[card.themeIndex].label}</strong>
          <small>{routes[card.themeIndex].remaining ? <>المتبقي في هذا الموضوع · {number.format(routes[card.themeIndex].remaining)}</> : 'جاهز للمراجعة'}</small>
        </span>
        <span className="wi-topic-trigger">المواضيع <ChevronDown size={15} aria-hidden="true"/></span>
      </summary>
      <details className="wi-draft-review" onToggle={event => setDraftReviewOpen(event.currentTarget.open)}>
        <summary><LockKeyhole size={14} aria-hidden="true"/>إجاباتي حتى الآن<ChevronDown size={15} aria-hidden="true"/></summary>
        {draftReviewOpen && <div className="wi-draft-review-body">
          {portrait.length ? <SummaryTopics groups={themeCards} choices={savedChoices} lines={portrait} mode="draft"
            inferred={implicitPartner} hiddenPartnerIds={omittedPortraitIds} completionChoices={choices} sourceOf={sourceOf} onChoose={choose} disabled={disabled}/>
            : <p>تظهر هنا إجاباتك بعد حفظها في مسودتك الخاصة.</p>}
        </div>}
      </details>
      <ol aria-label="مواضيع أسئلة التوافق">{routes.map((route, i) => <li key={route.label}>
        <button type="button" disabled={disabled || route.nextIndex < 0} aria-current={i === card.themeIndex ? 'step' : undefined}
          data-topic-index={i} data-complete={route.nextIndex < 0 || undefined} onClick={() => pickTopic(i)}>
          <span className="wi-topic-marker" aria-hidden="true">{route.nextIndex < 0 ? <Check size={13}/> : number.format(i + 1)}</span>
          <span className="wi-topic-name"><strong>{route.label}</strong><small>{route.nextIndex >= 0 ? `السؤال التالي · ${route.nextLabel}` : 'جاهز للمراجعة'}</small></span>
          {i === card.themeIndex && route.nextIndex >= 0 ? <span className="wi-topic-here">نكمل هنا</span> : route.nextIndex >= 0 && <ArrowLeft size={15} aria-hidden="true"/>}
        </button>
      </li>)}</ol>
    </details>}
    <div className="wi-hybrid-stage" data-back={backwards.current || undefined}>
      {previousVisit && <div className="wi-step-nav">
        <button type="button" className="wi-link" onClick={goBack} disabled={disabled}><ArrowRight size={15} aria-hidden="true"/> السابق</button>
        {editField && <span>تعديل إجابتك</span>}
      </div>}
      <h1 id={headingId} ref={heading} tabIndex={-1}>{card ? activeField?.label ?? card.self.label : 'راجع إجاباتك'}</h1>
      {card && <small role="status" className="wi-hybrid-recorded" data-echo>{recorded}</small>}
      {retainSelf && !savedArrangement && <p className="wi-self-echo" data-suggested={pendingIds.has(card.self.id) || undefined}>
        {pendingIds.has(card.self.id) ? <span>في حياتي · اقتراح لونا</span> : <span><Check size={15} aria-hidden="true"/> اختياري عن نفسي</span>}
        <strong>{selfAnswer.label}</strong>
      </p>}
      {capturedPartner && <p className="wi-self-echo" data-suggested><span>تفضيلك في الشريك من كلامك</span><strong>{capturedPartner.label}</strong></p>}
      {currentEvidence && <p className="wi-question-evidence"><span>من كلامك</span><q>{currentEvidence}</q></p>}
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
        {savedArrangement && card && <div className="wi-saved-arrangement">
          <p>{sharedDecisionLabel(sharedTopic!,savedArrangement.code,savedArrangement.label)}</p>
          <MotionPressButton type="button" className="wi-button wi-button-primary" disabled={disabled} onClick={()=>commitField(card.partner,savedArrangement.code)}>أعتمد هذا الترتيب لنا</MotionPressButton>
        </div>}
        {confirmOwn && card && <div className="wi-saved-arrangement">
          <MotionPressButton type="button" className="wi-button wi-button-primary" disabled={disabled} onClick={() => commitField(card.self, confirmOwn.code)}>{sharedTopic === 'children_plan' && confirmOwn.code === 'A' ? 'الإنجاب ضمن خطتي أيضًا' : 'أعتمد هذا الاختيار لنفسي أيضًا'}</MotionPressButton>
          <button type="button" className="wi-link" disabled={disabled} onClick={() => setSeparateFor(card.self.id)}>أختار لنفسي بشكل مختلف</button>
        </div>}
        {activeField && displayField && !savedArrangement && !confirmOwn && <ChoiceCard key={activeField.id} shared={Boolean(sharedPrompt)} field={displayField} value={selected(activeField, choices)?.code}
          onChoose={code => commitField(activeField, code, Boolean(sharedPrompt))} disabled={disabled}
          compact={card.personality.includes(activeField)} help={helpFor(activeField)}/>}
        {jointPrompt && <button type="button" className="wi-link" onClick={()=>setSeparateFor(card.self.id)}>أختار لنفسي ولشريكي بشكل مختلف</button>}
      </div> : <>
        <p className="wi-lead">افتح أي موضوع لتراجع إجاباتك وتعدّلها قبل الاعتماد.</p>
        {reviewOptions}
        <div className="wi-hybrid-review">
          <SummaryTopics groups={themeCards} choices={choices} lines={portrait} mode="review" inferred={implicitPartner}
            sourceOf={sourceOf} onChoose={choose} disabled={disabled}/>
        </div>
        <div className="wi-summary-notes">
          {suggestionsReview}
          {reviewExtras}
        </div>
      </>}
    </div>
    {previous && (!card || previous.themeIndex === card.themeIndex) && !previous.selfOnly && inferred.has(previous.partner.id) && suggestionRow(previous)}
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
  </section>;
}
