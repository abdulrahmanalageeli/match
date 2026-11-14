import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Pencil } from '../BrandIcons';
import { dimensions } from '../compatibility/model';
import { personalityQuestions } from '../compatibility/personality';
import { MotionPressButton, MotionReveal } from '../motion/Reanimated';
import type { InterviewSelection } from './model';
import type { InterviewProposal } from './types';
import './hybrid-assessment.css';

type Choices = Record<string, string[]>;
type Gender = 'woman' | 'man';
type Field = {
  id: string;
  label: string;
  prompt: string;
  options: { code: string; label: string }[];
};
type Card = {
  self: Field;
  partner: Field;
  personality: Field[];
  partnerDefault?: Readonly<Partial<Record<string, string>>>;
};

const themes = [
  { label: 'الزواج والخطط المقبلة', dimensions: ['children_plan', 'residence_plan', 'wife_work', 'marriage_timeline', 'family_boundaries'] },
  { label: 'حياتكم اليومية', dimensions: ['shared_budget', 'household_roles', 'weekly_planning', 'social_rhythm'] },
  { label: 'التواصل والتعارف', dimensions: ['conversation_initiative_preference', 'conversation_depth', 'curiosity_style', 'early_openness'] },
  { label: 'القرب والتفاهم', dimensions: ['closeness_pace', 'match_disagreement_style', 'repair_after_conflict'] },
];

const personalityByDimension: Record<string, string[]> = {
  weekly_planning: ['planning', 'novelty'],
  social_rhythm: ['social_energy'],
  conversation_initiative_preference: ['initiative'],
  conversation_depth: ['depth', 'quiet_comfort'],
  early_openness: ['openness'],
  closeness_pace: ['closeness', 'reassurance'],
  match_disagreement_style: ['conflict_pace', 'directness'],
  repair_after_conflict: ['support'],
};

// Some topics stay paired on screen but require a separate partner choice.
const explicitPartnerChoices = new Set(['residence_plan', 'conversation_initiative_preference', 'match_disagreement_style', 'early_openness']);
const workLabels: Record<string, string> = {
  A: 'أرغب في العمل ومواصلة طموحي',
  B: 'أفضل عدم العمل بعد الزواج',
  C: 'مرنة حسب ظروفي واتفاقنا',
};
const number = new Intl.NumberFormat('ar-SA');

function makeThemeCards(gender?: Gender) {
  return themes.map(theme => ({
    label: theme.label,
    cards: theme.dimensions.map(id => {
      const dimension = dimensions.find(item => item.id === id)!;
      const femaleWork = gender === 'woman' && id === 'wife_work';
      const fields: Card = {
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
        personality: (personalityByDimension[id] ?? []).map(questionId => {
          const question = personalityQuestions.find(item => item.id === questionId)!;
          return {
            id: `personality:${questionId}:self`,
            label: question.title,
            prompt: question.prompt,
            options: question.options.map(option => ({ code: option.code, label: option.label })),
          };
        }),
        partnerDefault: explicitPartnerChoices.has(id) ? undefined : dimension.partnerDefault,
      };
      return fields;
    }),
  }));
}

function selected(field: Field, choices: Choices) {
  const values = choices[field.id];
  return values?.length === 1 ? field.options.find(option => option.code === values[0]) : undefined;
}

function partnerSuggestion(card: Card, choices: Choices) {
  const self = selected(card.self, choices);
  if (self) return card.partner.options.find(option => option.code === card.partnerDefault?.[self.code]);
}

function assessmentFields(card: Card) {
  return [card.self, card.partner, ...card.personality];
}

function needsCard(card: Card, choices: Choices) {
  return [card.self, ...card.personality].some(field => !selected(field, choices))
    || (!selected(card.partner, choices) && !partnerSuggestion(card, choices));
}

function ChoiceCard({ field, value, onChoose, disabled, captured = false, compact = false }: {
  field: Field;
  value?: string;
  onChoose: (value: string) => void;
  disabled: boolean;
  captured?: boolean;
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const currentOption = field.options.find(option => option.code === value);
  return <fieldset className="wi-hybrid-field" data-compact={compact || undefined}>
    <legend>{field.prompt}</legend>
    {captured && currentOption && !editing ? <div className="wi-hybrid-suggestion">
      <div><small>من حوارك مع لونا</small><strong>{currentOption.label}</strong></div>
      <button type="button" className="wi-link" onClick={() => setEditing(true)} disabled={disabled}><Pencil size={14} aria-hidden="true"/> تعديل</button>
    </div> : <div className="wi-hybrid-options">
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
    </div>}
  </fieldset>;
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
  return <label className="wi-hybrid-review-row">
    <span>{field.label}<small>{captured ? `${side} · من حوارك مع لونا` : side}</small>
      {!value && suggested && <strong className="wi-hybrid-proposed-value">{suggested}</strong>}
    </span>
    <select aria-label={`${field.label}، ${side}`} value={value ?? ''} disabled={disabled} onChange={event => onChoose(event.target.value)}>
      <option value="" disabled>{suggested ? 'اختيار إجابة' : 'اختر إجابتك'}</option>
      {field.options.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}
    </select>
  </label>;
}

export function HybridAssessment({
  choices, onChange, onComplete, disabled = false, completingUnavailable = false, gender, aiProposals = [], onClarify, reviewExtras,
}: {
  choices: Choices;
  onChange: (choices: Choices, changedIds?: readonly string[]) => void;
  onComplete: (choices: InterviewSelection[]) => void;
  disabled?: boolean;
  completingUnavailable?: boolean;
  gender?: Gender;
  aiProposals?: readonly InterviewProposal[];
  onClarify?: () => void;
  reviewExtras?: ReactNode;
}) {
  const themeCards = makeThemeCards(gender);
  const cards = themeCards.flatMap((theme, themeIndex) => theme.cards.map(card => ({ ...card, themeIndex })));
  const fields = cards.flatMap(assessmentFields);
  const [index, setIndex] = useState(() => cards.findIndex(card => needsCard(card, choices)));
  const started = useRef(false);
  const [history, setHistory] = useState<number[]>([]);
  const [partnerEditor, setPartnerEditor] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousIndex = useRef(index);
  const headingId = useId();
  const card = cards[index];
  const allSelected = fields.flatMap(field => {
    const answer = selected(field, choices);
    return answer ? [{ id: field.id, values: [answer.code] }] : [];
  });
  const suggestions = cards.flatMap(item => {
    const suggestion = partnerSuggestion(item, choices);
    return suggestion && !selected(item.partner, choices) ? [{ field: item.partner, option: suggestion }] : [];
  });
  const answered = allSelected.length;
  const available = fields.length - answered;
  const aiValues = new Map(aiProposals.filter(item => !item.needsClarification && item.source !== 'self_default' && item.values.length === 1)
    .map(item => [item.id, item.values[0]]));
  const wasCaptured = (field: Field) => Boolean(aiValues.has(field.id) && aiValues.get(field.id) === selected(field, choices)?.code);
  const capturedCount = fields.filter(wasCaptured).length;
  const firstNeeded = cards.findIndex(item => needsCard(item, choices));

  useEffect(() => {
    if (!started.current && capturedCount > 0) setIndex(firstNeeded);
  }, [capturedCount, firstNeeded]);

  useEffect(() => {
    if (previousIndex.current === index) return;
    previousIndex.current = index;
    heading.current?.focus({ preventScroll: true });
    heading.current?.closest('.wi-content')?.scrollTo({ top: 0, behavior: 'instant' });
  }, [index]);

  function choose(id: string, code: string) {
    started.current = true;
    onChange({ ...choices, [id]: [code] }, [id]);
  }

  function advance() {
    started.current = true;
    const next = cards.findIndex((item, itemIndex) => itemIndex > index && needsCard(item, choices));
    setHistory(previous => [...previous, index]);
    setPartnerEditor(false);
    setIndex(next);
  }

  function goBack() {
    const previous = history.at(-1);
    if (previous === undefined) return;
    setPartnerEditor(false);
    setHistory(current => current.slice(0, -1));
    setIndex(previous);
  }

  function adoptSuggestions() {
    started.current = true;
    const next = { ...choices };
    for (const { field, option } of suggestions) next[field.id] = [option.code];
    onChange(next, suggestions.map(({ field }) => field.id));
  }

  const proposal = card ? partnerSuggestion(card, choices) : undefined;
  const canAdvance = card && !needsCard(card, choices);
  return <section className="wi-hybrid" aria-labelledby={headingId}>
    <div className="wi-hybrid-progress">
      <span>{card ? themeCards[card.themeIndex].label : 'مراجعة التوافق'}</span>
      <small>{available === 0 ? 'اكتملت الإجابات' : `متبقّي ${number.format(available)} إجابة`}</small>
      <progress aria-label="اكتمال الإجابات" value={answered} max={fields.length}/>
    </div>
    <MotionReveal key={card?.self.id ?? 'review'} axis="x" distance={8} duration={210} className="wi-hybrid-stage">
      <h1 id={headingId} ref={heading} tabIndex={-1}>{card ? card.self.label : 'راجع إجاباتك'}</h1>
      {card && history.length === 0 && capturedCount > 0 && <p className="wi-hybrid-capture" role="status">
        <Check size={15} aria-hidden="true"/>
        {`فهمنا ${number.format(capturedCount)} إجابة من كلامك. نكمّل الباقي هنا.`}
      </p>}
      {card ? <div className="wi-hybrid-card">
        <ChoiceCard field={card.self} value={selected(card.self, choices)?.code} captured={wasCaptured(card.self)} onChoose={code => choose(card.self.id, code)} disabled={disabled}/>
        {proposal && !selected(card.partner, choices) && !partnerEditor ? <div className="wi-hybrid-suggestion">
          <div><small>اقتراح للشريك · للمراجعة لاحقًا</small><strong>{proposal.label}</strong></div>
          <button type="button" className="wi-link" onClick={() => { started.current = true; setPartnerEditor(true); }} disabled={disabled}><Pencil size={14} aria-hidden="true"/> اختيار مختلف</button>
        </div> : <ChoiceCard field={card.partner} value={selected(card.partner, choices)?.code} captured={wasCaptured(card.partner)} onChoose={code => choose(card.partner.id, code)} disabled={disabled}/>}
        {card.personality.map(field => <ChoiceCard key={field.id} field={field} value={selected(field, choices)?.code} captured={wasCaptured(field)} onChoose={code => choose(field.id, code)} disabled={disabled} compact/>)}
      </div> : <>
        <p className="wi-lead">{capturedCount ? `أضفنا ${number.format(capturedCount)} إجابة من حوارك. راجعها مع اختياراتك قبل الاعتماد.` : 'راجع اختياراتك وعدّل أي إجابة قبل اعتماد التوافق.'}</p>
        {capturedCount > 0 && <details className="wi-hybrid-captured-review">
          <summary>وش فهمت لونا من كلامك؟<ChevronDown size={17} aria-hidden="true"/></summary>
          <div className="wi-hybrid-review-fields">
            {fields.filter(wasCaptured).map(field => <ReviewChoice
              key={field.id}
              field={field}
              value={selected(field, choices)?.code}
              side={field.id.startsWith('personality:') ? 'عن شخصيتي' : field.id.endsWith(':partner') ? 'تفضيلي في الشريك' : 'عنّي'}
              onChoose={code => choose(field.id, code)}
              disabled={disabled}
            />)}
          </div>
        </details>}
        {suggestions.length > 0 && <div className="wi-hybrid-batch">
          <h2>تفضيلات مقترحة للشريك</h2>
          <p>بناءً على إجاباتك عن نفسك. اختر ما يناسبك في كل بند، أو اعتمد المقترحات المتبقية دفعة واحدة.</p>
          {suggestions.map(({field, option}) => <ReviewChoice key={field.id} field={field} suggested={option.label} side="تفضيلي في الشريك" onChoose={code => choose(field.id, code)} disabled={disabled}/>)}
          <MotionPressButton className="wi-button wi-wide" onClick={adoptSuggestions} disabled={disabled}>اعتماد {number.format(suggestions.length)} من المقترحات<Check size={16} aria-hidden="true"/></MotionPressButton>
        </div>}
        <div className="wi-hybrid-review">
          {themeCards.map(theme => <details key={theme.label}>
            <summary>{theme.label}<ChevronDown size={17} aria-hidden="true"/></summary>
            <div className="wi-hybrid-review-fields">
              {theme.cards.flatMap(item => assessmentFields(item).map(field => <ReviewChoice
                key={field.id}
                field={field}
                value={selected(field, choices)?.code}
                suggested={field.id === item.partner.id ? partnerSuggestion(item, choices)?.label : undefined}
                captured={wasCaptured(field)}
                side={field.id === item.self.id ? 'عنّي' : field.id === item.partner.id ? 'تفضيلي في الشريك' : 'عن شخصيتي'}
                onChoose={code => choose(field.id, code)}
                disabled={disabled}
              />))}
            </div>
          </details>)}
        </div>
        {reviewExtras}
      </>}
    </MotionReveal>
    <div className="wi-hybrid-actions">
      <MotionPressButton
        className="wi-button wi-button-primary wi-wide"
        disabled={disabled || (card ? !canAdvance : available > 0 || completingUnavailable)}
        onClick={card ? advance : () => onComplete(allSelected)}
      >{card ? 'متابعة' : 'اعتماد إجاباتي'}{card ? <ArrowLeft size={17} aria-hidden="true"/> : <Check size={17} aria-hidden="true"/>}</MotionPressButton>
      {completingUnavailable && !card && <p className="wi-small" role="status">يمكنك مراجعة الإجابات ريثما يكتمل تحليل كلامك.</p>}
      <div className="wi-hybrid-secondary">
        {history.length > 0 && <button type="button" className="wi-link" onClick={goBack} disabled={disabled}><ArrowRight size={15} aria-hidden="true"/> السابق</button>}
        {onClarify && <button type="button" className="wi-link" onClick={onClarify} disabled={disabled}>أبي أوضّح إجابتي</button>}
      </div>
    </div>
  </section>;
}
