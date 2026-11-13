import compatibility from '../compatibility/catalog.json' with { type: 'json' };
import scenarios from '../beena/catalog.json' with { type: 'json' };
import type { BeenaProfile } from '../beena/model';
import type { InterviewProposal } from './types';

export type InterviewSelection = { id: string; values: string[] };
export type InterviewAnswers = { surveyAnswers?: Record<string, string>; beena?: BeenaProfile | null };

export function proposalOptions(proposal: InterviewProposal): Array<{ value: string; label: string }> {
  if (proposal.kind === 'preference') {
    const dimension = compatibility.dimensions.find(item => item.id === proposal.fieldId);
    if (!dimension || !['self', 'partner'].includes(proposal.side)) return [];
    return dimension.options.map(option => ({ value: option.code, label: proposal.side === 'partner' ? option.partner : option.self }));
  }
  if (proposal.kind !== 'beena') return [];
  const scenario = scenarios.find(item => item.id === proposal.fieldId);
  if (!scenario) return [];
  if (proposal.side === 'importance') return [{ value: '1', label: 'مهم لي' }, { value: '2', label: 'مهم جدًا لي' }];
  if (!['self', 'partner'].includes(proposal.side)) return [];
  return scenario.options.map(option => ({ value: option.code, label: option.label }));
}

export function proposalTitle(proposal: InterviewProposal) {
  return proposal.kind === 'preference'
    ? compatibility.dimensions.find(item => item.id === proposal.fieldId)?.title ?? ''
    : scenarios.find(item => item.id === proposal.fieldId)?.title ?? '';
}

export function proposalSide(proposal: InterviewProposal) {
  return proposal.side === 'self' ? 'ما يصفني' : proposal.side === 'partner' ? 'ما أرحّب به من شريكي' : 'أهمية هذا الموضوع';
}

/** Only explicit, catalog-valid confirmations enter the existing assessment.
 * No personality answer, hard requirement, biography or public story is inferred.
 */
export function applyInterviewAnswers(current: InterviewAnswers, confirmed: InterviewProposal[]): { surveyAnswers?: Record<string,string>; beena?: BeenaProfile } {
  const surveyAnswers = { ...current.surveyAnswers };
  const beena: BeenaProfile = {
    version: 'beena-v1', answers: Object.fromEntries(Object.entries(current.beena?.answers ?? {}).map(([key, value]) => [key, { ...value, ...(value.partner ? { partner: [...value.partner] } : {}) }])),
    ...(current.beena?.story ? { story: { ...current.beena.story } } : {}),
  };
  let changedPreferences = false, changedBeena = false;
  for (const proposal of confirmed) {
    const allowed = new Set(proposalOptions(proposal).map(option => option.value));
    const values = [...new Set(proposal.values)];
    if (!values.length || values.some(value => !allowed.has(value))) continue;
    if (proposal.kind === 'preference') {
      if (values.length !== 1) continue;
      const dimension = compatibility.dimensions.find(item => item.id === proposal.fieldId)!;
      surveyAnswers[proposal.side === 'partner' ? dimension.partnerId : dimension.id] = values[0];
      changedPreferences = true;
    } else {
      if (proposal.side !== 'partner' && values.length !== 1) continue;
      const previous = beena.answers[proposal.fieldId] ?? {};
      beena.answers[proposal.fieldId] = {
        ...previous,
        ...(proposal.side === 'self' ? { self: values[0] } : proposal.side === 'partner' ? { partner: values } : { importance: Number(values[0]) as 1 | 2 }),
      };
      changedBeena = true;
    }
  }
  return { ...(changedPreferences ? { surveyAnswers } : {}), ...(changedBeena ? { beena } : {}) };
}
