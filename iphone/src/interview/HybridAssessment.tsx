import { sharedDecisionLabel, sharedDecisionPrompt } from '../compatibility/sharedDecisions';
import { assessmentProgress } from './openingResults';
import { openingHighlights } from './openingEvidence';
import { statementContext } from './statementContext';
import { OpeningWords } from './OpeningWords';
import { resolvePartnerDefaults } from './partnerDefaults';
import { portraitLines } from './personalPortrait';
import { nextQuestion, questionResumeKey, readQuestion, rememberQuestion } from './questionJourney';
import memberAr from '../member-copy.ts';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { launchEvent } from '../launchEvents';
import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, LockKeyhole, Pencil } from '../BrandIcons';
import legacyTraits from '../compatibility/personality-catalog-v1.json';
import { parentingApplicable } from '../compatibility/parenting.mjs';
import type { PartnerCriteria } from '../compatibility/marriage';
import { dimensionsForVersion, hasPartnerQuestion } from '../compatibility/model';
import { personalityQuestionsFor } from '../compatibility/personality';
import { MotionPressButton, MotionReveal } from '../motion/Reanimated';
import type { InterviewSelection } from './model';
import type { InterviewChoiceHelp, InterviewProposal, InterviewStatement } from './types';
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
type Visit = { fieldId?: string; editing?: boolean };

type Card = {
  selfOnly: boolean;
  self: Field;
  partner: Field;
  personality: Field[];
};

const themes = [
  { dimensions: ['children_plan', 'marriage_timeline', 'residence_plan', 'housing_arrangement'] },
  { dimensions: ['wife_work', 'financial_provision', 'money_management', 'domestic_labor', 'family_authority', 'parenting_approach'] },
  { dimensions: ['faith_routine', 'social_boundaries', 'social_rhythm', 'closeness_pace'] },
  { dimensions: ['conflict_response', 'repair_after_conflict'] },
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
  { dimensions: ['children_plan', 'marriage_timeline', 'residence_plan', 'housing_arrangement'] },
  { dimensions: ['wife_work', 'financial_provision', 'domestic_labor', 'family_authority', 'parenting_approach'] },
  { dimensions: ['faith_routine', 'mixed_gatherings', 'public_event_attendance', 'social_rhythm', 'closeness_pace'] },
  { dimensions: ['match_disagreement_style', 'repair_after_conflict'] },
];

const historicalTraitsByDimension: Record<string, string[]> = {
  domestic_labor: ['planning'],
  social_rhythm: ['social_energy', 'quiet_comfort', 'novelty'],
  mixed_gatherings: ['initiative'],
  closeness_pace: ['openness', 'depth', 'closeness', 'reassurance'],
  match_disagreement_style: ['conflict_pace', 'directness'],
  repair_after_conflict: ['support'],
};

const workLabels: Record<string, string> = memberAr.womanWork;
const helpScenarios: Record<string, string> = {
  'preference:shared_budget:self': 'لو زادت مصاريف البيت هذا الشهر، كيف تحبّ أن ترتّبا الميزانية؟',
  'preference:family_boundaries:self': 'لو اقترح أحد الأهل تغيير قرار يخصّ بيتكما، كيف تحبّ أن تتعاملا معه؟',
  'preference:repair_after_conflict:self': 'بعد اختلاف بسيط بينكما، ما الذي يساعدك على العودة إلى الحديث؟',
};
const number = new Intl.NumberFormat('ar-SA');

type CatalogVersions = { practical?: string; personality?: string };

function makeThemeCards(gender?: Gender, historical = false, manualCatalog?: CatalogVersions) {
  const practicalVersion = manualCatalog?.practical ?? (historical ? 'marriage-v3' : 'marriage-v4');
  const traitVersion = manualCatalog?.personality ?? (historical ? 'personality-v1' : 'personality-v2');
  const topics = dimensionsForVersion(practicalVersion);
  const questions = personalityQuestionsFor(traitVersion);
  const layout = traitVersion === 'personality-v1' ? historicalTraitsByDimension : personalityByDimension;
  // Older manuals keep their own catalog order. Every personality item stays reachable
  // when the two catalog versions attach a trait to different practical questions.
  const ordered = practicalVersion === 'marriage-v4' ? themes : practicalVersion === 'marriage-v3' ? historicalThemes
    : [{dimensions: topics.map(topic => topic.id)}];
  const assigned = new Set(topics.flatMap(topic => layout[topic.id] ?? []));
  const remaining = questions.filter(question => !assigned.has(question.id)).map(question => question.id);
  const lastId = ordered.at(-1)?.dimensions.at(-1);
  return ordered.map(theme => ({
    cards: theme.dimensions.map((id): Card => {
      const dimension = topics.find(item => item.id === id)!;
      const femaleWork = gender === 'woman' && id === 'wife_work';
      return {
        selfOnly: !hasPartnerQuestion(id, practicalVersion),
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
        personality: [...(layout[id] ?? []), ...(id === lastId ? remaining : [])].map(questionId => {
          const question = questions.find(item => item.id === questionId)!;
          return {
            id: `personality:${questionId}:self`,
            label: question.title,
            prompt: question.prompt,
            options: question.options.map(option => ({ code: option.code, label: option.label })),
          };
        }),
      };
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

function AnswerList({ fields, choices, preview, inferred, sourceOf, onChoose, onDetails, disabled = false }: {
  fields: readonly Field[];
  choices: Choices;
  preview?: string;
  inferred: ReadonlySet<string>;
  sourceOf?: (field: Field) => string | undefined;
  onChoose?: (id: string, code: string) => void;
  onDetails?: () => void;
  disabled?: boolean;
}) {
  return <>
    <details className="wi-all-answers">
      <summary>
        <span><strong><LockKeyhole size={15} aria-hidden="true"/>إجاباتي ({number.format(fields.length)})</strong>
          {preview && <small>{preview}</small>}</span><ChevronDown size={16} aria-hidden="true"/>
      </summary>
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
    </details>
    {onDetails && <button type="button" className="wi-link wi-review-details" onClick={onDetails}>تفاصيل المراجعة</button>}
  </>;
}

export function ConfirmedAnswers({ confirmed, gender, inferredPartnerIds, onEdit, onDetails }: {
  confirmed: readonly InterviewSelection[]; gender?: Gender; inferredPartnerIds?: readonly string[];
  onEdit?: (id: string, code: string) => void;
  onDetails?: () => void;
}) {
  const historical = confirmed.some(item=>legacyTraits.some(trait=>item.id==='personality:'+trait.id+':self'));
  const choices = Object.fromEntries(confirmed.map(item => [item.id, item.values]));
  const fields = makeThemeCards(gender,historical).flatMap(group => group.cards.flatMap(assessmentFields)).filter(field => selected(field,choices));
  const inferred = new Set(inferredPartnerIds);
  const omitFromHighlights = inferredPartnerIds ? inferred : new Set(fields.filter(field => field.id.endsWith(':partner')).map(field => field.id));
  return <section className="wi-confirmed-answers" aria-label="إجاباتي المحفوظة">
    <AnswerList fields={fields} choices={choices} preview={portraitLines([fields], choices, omitFromHighlights)[0]?.preview}
      inferred={inferred} onChoose={onEdit} onDetails={onDetails}/>
  </section>;
}

function assessmentFields(card: Card) {
  return card.selfOnly ? [card.self, ...card.personality] : [card.self, card.partner, ...card.personality];
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
      {field.options.map(option => <MotionPressButton
        key={option.code}
        className="wi-hybrid-option"
        aria-pressed={value === option.code}
        onClick={() => onChoose(option.code)}
        disabled={disabled}
      >
        <span className="wi-hybrid-option-mark" aria-hidden="true">{value === option.code && <Check size={13}/>}</span>
        {option.label}
      </MotionPressButton>)}
    </div>
    {help}
  </fieldset>;
}

function ChoiceHelp({ field, request, onChoose, disabled, shared = false, secondary }: {
  shared?: boolean;
  secondary?: ReactNode;
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
    <div className="wi-question-tools">
      <button type="button" ref={trigger} className="wi-link" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>
        مساعدة لونا <ChevronDown size={14} aria-hidden="true"/>
      </button>
      {secondary}
    </div>
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
  gender?: Gender; historical?: boolean; manualCatalog?: CatalogVersions; direct?: boolean; childrenCount?: number;
  partnerChildren?: PartnerCriteria['children']; unresolvedPartnerIds?: readonly string[];
};

function assessmentLayout(explicit: Choices, savedChoices: Choices, {gender, historical=false, manualCatalog, direct=false, childrenCount, partnerChildren, unresolvedPartnerIds=[]}: LayoutContext) {
  const blocked = new Set(unresolvedPartnerIds);
  const practicalVersion = manualCatalog?.practical ?? (historical ? 'marriage-v3' : 'marriage-v4');
  const currentPractical = practicalVersion === 'marriage-v4';
  if (currentPractical) blocked.add('preference:residence_plan:partner');
  if (direct && !currentPractical) for (const dimension of dimensionsForVersion(practicalVersion)) blocked.add(`preference:${dimension.id}:partner`);
  const {choices, inferred} = resolvePartnerDefaults(explicit, savedChoices, blocked);
  const allThemes = makeThemeCards(gender,historical,manualCatalog);
  const relevant = (item: Card, values: Choices) => !currentPractical || item.self.id !== 'preference:parenting_approach:self' ||
    parentingApplicable({children_plan:values['preference:children_plan:self']?.[0]},childrenCount,partnerChildren);
  const cards = allThemes.flatMap((theme, themeIndex) => theme.cards.map(card => ({ ...card, themeIndex })));
  const fields = cards.filter(item => relevant(item, choices)).flatMap(assessmentFields);
  return { choices, inferred, cards, fields, relevant, blocked, currentPractical };
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
  if (!highlights.length) return <p className="wi-opening-empty">نكمّل بالأسئلة.</p>;
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
  memberId, measurementOwner, initialField,
  portraitPartnerSourceKnown = true, statements = [],
  choices: explicit, childrenCount, partnerChildren, direct=false, historical=false, manualCatalog, onChange, onComplete, disabled = false, completingUnavailable = false, gender, aiProposals = [], savedChoices = {}, openingTurnId, openingText = '', onClarify, onChoiceHelp, reviewOptions, reviewExtras, unresolvedPartnerIds = [], receiptInferredPartnerIds = [],
}: {
  memberId?: string; measurementOwner?: string; initialField?:string;
  choices: Choices;
  childrenCount?: number;
  partnerChildren?: PartnerCriteria['children'];
  historical?: boolean;
  manualCatalog?: CatalogVersions;
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
  statements?: readonly InterviewStatement[];
  aiProposals?: readonly InterviewProposal[];
  onClarify?: () => void;
  onChoiceHelp?: (fieldId: string, description?: string, priorAnswer?: string) => Promise<InterviewChoiceHelp>;
  reviewOptions?: ReactNode;
  reviewExtras?: ReactNode;
}) {
  const { choices, inferred, cards, fields, relevant, blocked, currentPractical } = assessmentLayout(explicit, savedChoices, { gender, historical, manualCatalog, direct, childrenCount, partnerChildren, unresolvedPartnerIds });
  const applicableFields = (values: Choices) => cards.filter(item => relevant(item, values)).flatMap(assessmentFields);
  const bookmark = questionResumeKey(memberId, historical, manualCatalog);
  const sectionPrefix = initialField === 'قسم الشخصية كاملًا' ? 'personality:' : initialField === 'قسم التوافق كاملًا' ? 'preference:' : undefined;
  const sectionFields = sectionPrefix ? fields.filter(field => field.id.startsWith(sectionPrefix)) : [];
  const [visit, setVisit] = useState<Visit>(() => {
    const requested = sectionFields[0] ?? fields.find(field => initialField && [field.id, field.label, field.prompt].includes(initialField));
    if (requested) return {fieldId: requested.id, editing: true};
    const savedId = readQuestion(bookmark, group => cards.filter(item => item.themeIndex === group && relevant(item, choices))
      .flatMap(assessmentFields).find(field => !selected(field, choices))?.id);
    if (savedId?.startsWith('edit:')) return {fieldId: savedId.slice(5), editing: true};
    return {fieldId: savedId};
  });
  const questionMenu = useRef<HTMLDetailsElement>(null);
  const [history, setHistory] = useState<Visit[]>([]);
  const [forward, setForward] = useState<Visit[]>([]);
  const [recorded, setRecorded] = useState('');
  const movingFrom = useRef(false);
  const backwards = useRef(false);
  const previousTap = useRef<{x:number; y:number; at:number} | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusQuestion = useRef(false);
  const headingId = useId();

  const requestedField = visit.editing ? fields.find(field => field.id === visit.fieldId) : undefined;
  const activeField = requestedField ?? nextQuestion(fields, visit.fieldId, field => !selected(field, choices));
  const editField = requestedField?.id;
  const card = activeField ? cards.find(item => assessmentFields(item).includes(activeField)) : undefined;
  const allSelected = fields.flatMap(field => {
    const answer = selected(field, choices);
    return answer ? [{ id: field.id, values: [answer.code] }] : [];
  });
  const implicitPartner = new Set([...inferred, ...receiptInferredPartnerIds]);
  const omittedPortraitIds = portraitPartnerSourceKnown ? implicitPartner : new Set(fields.filter(field => field.id.endsWith(':partner')).map(field => field.id));
  const preview = portraitLines([fields], savedChoices, omittedPortraitIds)[0]?.preview;
  const progress = assessmentProgress(fields, choices, savedChoices, aiProposals, openingTurnId);
  const carried = progress.pending.size;
  const measured = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!measurementOwner || !openingTurnId || measured.current === measurementOwner) return;
    measured.current = measurementOwner;
    launchEvent('luna_carried', String(carried), measurementOwner);
  }, [measurementOwner, openingTurnId, carried]);
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
  const sharedTopic = card?.self.id.split(':')[1];
  const jointPrompt = card && sharedTopic && currentPractical && !editField && separateFor !== card.self.id
    && !card.selfOnly && !choices[card.partner.id]?.length && !blocked.has(card.partner.id)
    ? sharedDecisionPrompt(sharedTopic, gender) : undefined;
  const sharedPrompt = activeField === card?.self ? jointPrompt : undefined;
  const savedArrangement = jointPrompt && activeField === card?.partner && selfAnswer ? selfAnswer : undefined;
  const capturedPartner = currentPractical && !editField && card && activeField === card.self && sharedTopic
    && sharedDecisionPrompt(sharedTopic, gender)
    && aiProposals.some(proposal => proposal.id === card.partner.id && proposal.values[0] === choices[card.partner.id]?.[0])
    ? selected(card.partner, choices) : undefined;
  const confirmOwn = capturedPartner && card && separateFor !== card.self.id
    ? card.self.options.find(option => option.code === capturedPartner.code) : undefined;
  const contextual = activeField && !direct && currentPractical && !selected(activeField, choices)
    ? statementContext(activeField.id, statements, Boolean(sharedPrompt)) : undefined;
  const displayField = activeField && (sharedPrompt ? {
    ...activeField, prompt: contextual?.prompt ?? sharedPrompt, options: activeField.options.map(option => ({
      ...option, label: sharedDecisionLabel(sharedTopic!, option.code, option.label),
    })),
  } : contextual?.prompt ? { ...activeField, prompt: contextual.prompt } : activeField);
  const currentEvidence = activeField && progress.extracted.has(activeField.id)
    ? aiProposals.find(proposal => proposal.id === activeField.id)?.evidence.find(item => !item.turnId.startsWith('context:'))?.quote
    : undefined;
  const screen = activeField?.id ?? card?.self.id ?? 'review';
  const retainSelf = selfAnswer && activeField === card?.partner;
  useEffect(() => {
    rememberQuestion(bookmark, editField ? 'edit:' + editField : activeField?.id);
  }, [bookmark, activeField?.id, editField]);

  useLayoutEffect(() => {
    movingFrom.current = false;
    if (!focusQuestion.current) return;
    focusQuestion.current = false;
    const title = heading.current;
    if (!title) return;
    const prompt = title.parentElement?.querySelector<HTMLElement>('.wi-hybrid-field legend') ?? title;
    prompt.focus({preventScroll:true});
    const scroller = title.closest<HTMLElement>('.wi-content');
    if (!scroller) {
      prompt.scrollIntoView({block:'nearest'});
      return;
    }
    const offset = (title.closest('.wi-hybrid-stage') ?? title).getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    if (offset < 8 || offset > scroller.clientHeight / 2) scroller.scrollTop += offset - 16;
  }, [screen]);

  function choose(id: string, code: string) {
    const field = fields.find(item => item.id === id);
    const option = field?.options.find(item => item.code === code);
    if (field && option) setRecorded(`سُجّل · ${field.label} · ${id.endsWith(':partner') ? 'تفضيلي في الشريك' : 'عنّي'} · ${option.label}`);
    onChange({ ...explicit, [id]: [code] }, [id]);
  }

  function advance(nextChoices: Choices = choices) {
    if (movingFrom.current || !activeField) return;
    focusQuestion.current = true;
    backwards.current = false;
    movingFrom.current = true;
    setHistory(trail => [...trail, {fieldId: activeField.id, editing: true}]);
    const applicable = applicableFields(nextChoices);
    if (sectionPrefix && editField) {
      const section = applicable.filter(field => field.id.startsWith(sectionPrefix));
      const next = section[section.findIndex(field => field.id === editField) + 1];
      if (next) {
        setForward([]);
        setVisit({fieldId: next.id, editing: true});
        return;
      }
    }
    const revisit = forward.findIndex(point => !point.fieldId || applicable.some(field => field.id === point.fieldId));
    if (revisit >= 0) {
      setVisit(forward[revisit]);
      setForward(forward.slice(revisit + 1));
    } else {
      setForward([]);
      setVisit({fieldId: nextQuestion(applicable, activeField.id, field => !selected(field, nextChoices))?.id});
    }
  }

  function pickQuestion(field: Field) {
    if (disabled) return;
    if (questionMenu.current) questionMenu.current.open = false;
    if (field.id === activeField?.id) {
      heading.current?.focus();
      return;
    }
    focusQuestion.current = true;
    previousTap.current = null;
    backwards.current = false;
    setHistory(trail => [...trail, {fieldId: activeField?.id, editing: Boolean(editField)}]);
    setForward([]);
    setRecorded('');
    setVisit({fieldId: field.id, editing: Boolean(selected(field, choices))});
  }

  function commitField(field: Field, code: string, shared = false) {
    if (disabled || movingFrom.current) return;
    const next = { [field.id]: [code] };
    if (shared && sharedPrompt && card && field === card.self) {
      next[card.partner.id] = [code];
      setRecorded(`سُجّل تفضيلك للترتيب المشترك · ${field.label}`);
      onChange({...explicit,...next}, Object.keys(next));
    } else choose(field.id, code);
    if (editField) return;
    const resolved = resolvePartnerDefaults({...explicit, ...next}, {...savedChoices, ...next}, blocked);
    advance(resolved.choices);
  }

  const previousVisit = history.filter(point => fields.some(field => field.id === point.fieldId)).at(-1);
  function goBack() {
    if (!previousVisit) return;
    focusQuestion.current = true;
    previousTap.current = null;
    backwards.current = true;
    setForward(trail => [{fieldId: activeField?.id, editing: Boolean(editField)}, ...trail]);
    setRecorded('');
    setVisit(previousVisit);
    setHistory(history.slice(0, history.lastIndexOf(previousVisit)));
  }

  const previous = previousVisit && cards.find(item => assessmentFields(item).some(field => field.id === previousVisit.fieldId));
  function suggestionRow(item: Card) {
    const answer = selected(item.partner, choices);
    if (!answer || !selected(item.self, choices)) return null;
    return <PartnerRow key={item.partner.id} item={item} choices={choices} inferred={inferred.has(item.partner.id)}
      disabled={disabled} onChoose={code => choose(item.partner.id, code)}/>;
  }
  const canAdvance = editField && activeField && selected(activeField, choices);
  const splitChoice = jointPrompt && card && <button type="button" className="wi-link" disabled={disabled}
    onClick={() => setSeparateFor(card.self.id)}>أختار لنفسي ولشريكي بشكل مختلف</button>;
  const helpFor = (field: Field) => onChoiceHelp
    ? <ChoiceHelp request={onChoiceHelp} field={field} onChoose={code => commitField(field, code, Boolean(sharedPrompt))}
        shared={Boolean(sharedPrompt)} disabled={disabled} secondary={splitChoice}/>
    : splitChoice && <div className="wi-question-tools">{splitChoice}</div>;
  const otherExtracted = extracted.filter(field => !openingIds.has(field.id));
  const capturedChoice = (field: Field) => <ReviewChoice field={field} value={selected(field, choices)?.code}
    source={sourceOf(field)} side={openingSide(field)} onChoose={code => choose(field.id, code)} disabled={disabled}/>;
  const suggestionsReview = capturedCount > 0 ? <details key={card ? 'suggestions' : 'review-suggestions'} className="wi-hybrid-captured-review">
      <summary><span>راجع الإجابات من كلامك ({number.format(capturedCount)})</span><ChevronDown size={17} aria-hidden="true"/></summary>
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
    {activeField && <details ref={questionMenu} className="wi-question-route" data-active-field={activeField.id}>
      <summary>
        <strong>كل الأسئلة</strong>
        <span className="wi-question-count">المتبقي {number.format(available)} من {number.format(fields.length)}<ChevronDown size={15} aria-hidden="true"/></span>
      </summary>
      {onClarify && <button type="button" className="wi-link wi-correct-introduction" disabled={disabled}
        onClick={() => { if (questionMenu.current) questionMenu.current.open = false; onClarify(); }}>توضيح كلامي مع لونا</button>}
      <ol aria-label="كل أسئلة التوافق والشخصية">{fields.map((field, index) => {
        const answer = selected(field, choices);
        const source = sourceOf(field) ?? (implicitPartner.has(field.id) ? 'اقتراح من إجابتك' : undefined);
        return <li key={field.id}><button type="button" disabled={disabled} data-question-id={field.id}
          aria-current={activeField.id === field.id ? 'step' : undefined} data-complete={Boolean(answer) || undefined} onClick={() => pickQuestion(field)}>
          <span className="wi-question-marker" aria-hidden="true">{number.format(index + 1)}</span>
          <span className="wi-question-name"><strong>{field.label} · {perspective(field)}</strong>
            {answer ? <small>{source ? source + ' · ' : ''}{answer.label}</small> : <span className="mi-sr-only">لم تُجب بعد</span>}
          </span>
          {answer ? <Check size={15} aria-hidden="true"/> : <ArrowLeft size={15} aria-hidden="true"/>}
        </button></li>;
      })}</ol>
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
      {!currentEvidence && contextual && !savedArrangement && !confirmOwn && <p className="wi-question-evidence"><span>{contextual.caption}</span><q dir="auto">{contextual.quote}</q></p>}
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
        {savedArrangement && splitChoice && <div className="wi-question-tools">{splitChoice}</div>}
      </div> : <>
        <p className="wi-lead">تقدر تراجع أي إجابة وتعدّلها قبل الاعتماد.</p>
        {reviewOptions}
        <div className="wi-hybrid-review">
          <AnswerList fields={fields} choices={choices} preview={preview} inferred={implicitPartner}
            sourceOf={sourceOf} onChoose={choose} disabled={disabled}/>
        </div>
        <div className="wi-summary-notes">
          {suggestionsReview}
          {reviewExtras}
        </div>
      </>}
    </div>
    {previous && (!card || previous.themeIndex === card.themeIndex) && !previous.selfOnly && inferred.has(previous.partner.id) && suggestionRow(previous)}
    {(!card || canAdvance) && <div className="wi-hybrid-actions">
      {(!card || canAdvance) && <MotionPressButton
        className="wi-button wi-button-primary wi-wide"
        disabled={disabled || (card ? !canAdvance : available > 0 || completingUnavailable)}
        onClick={card ? () => advance() : () => onComplete(allSelected, [...inferred])}
      >{card ? 'متابعة' : 'اعتماد إجاباتي'}{card ? <ArrowLeft size={17} aria-hidden="true"/> : <Check size={17} aria-hidden="true"/>}</MotionPressButton>}
      {completingUnavailable && !card && <p className="wi-small" role="status">يمكنك مراجعة الإجابات ريثما يكتمل تحليل كلامك.</p>}
      {onClarify && !card && <div className="wi-hybrid-secondary">
        <button type="button" className="wi-link" onClick={onClarify} disabled={disabled}>أبي أوضّح إجابتي</button>
      </div>}
    </div>}
    {card && suggestionsReview}
  </section>;
}
