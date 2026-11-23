import type { InterviewDocument } from '../interview/types';
import { applyProfileProposals, profileContextFromAnswers, profileField, type ProfileContextValue, type ProfileProposal } from '../interview/profileCapture';
import type { Answers } from './draft';

export const refinementFields = ['preferredMinAge','preferredMaxAge','partnerCriteria.height','marriageBasics.marriageTimeline'] as const;
type Field = typeof refinementFields[number];
export type LunaDraftFields = Partial<Record<Field,string>>;
export const supportedField = (id: string): id is Field => refinementFields.some(field => field === id);
const defaultAges = { preferredMinAge:'18', preferredMaxAge:'110' };
const ageField = (id: string): id is keyof typeof defaultAges => id === 'preferredMinAge' || id === 'preferredMaxAge';
function signature(value?: ProfileContextValue) {
  return value ? [value.mode ?? 'value', ...value.values].join(':') : '';
}
const marker = (turnId: string, value: ProfileContextValue) => turnId + '|' + signature(value);

export function readLunaFields(input: unknown): LunaDraftFields | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return;
  return Object.fromEntries(Object.entries(input).filter(([key,v]) => supportedField(key) && typeof v === 'string' &&
    (v === 'manual' || /^[a-f\d-]{36}\|[a-z\d_:]{1,70}$/i.test(v))));
}
export function manualLunaFields(previous: Answers, next: Answers, fields?: LunaDraftFields) {
  if (previous.preferredMinAge === next.preferredMinAge && previous.preferredMaxAge === next.preferredMaxAge &&
      previous.marriageBasics?.marriageTimeline === next.marriageBasics?.marriageTimeline &&
      previous.partnerCriteria?.height === next.partnerCriteria?.height) return fields;
  const before = profileContextFromAnswers(previous), after = profileContextFromAnswers(next);
  const marked = {...fields};
  for (const id of refinementFields) {
    if (signature(before.find(f => f.fieldId === id)) !== signature(after.find(f => f.fieldId === id))) marked[id] = 'manual';
  }
  return marked;
}

export function markLunaFields(answers: Answers, proposals: ProfileProposal[], fields?: LunaDraftFields) {
  const marked = {...fields}, actual = profileContextFromAnswers(answers);
  for (const p of proposals) {
    const value = actual.find(item => item.fieldId === p.fieldId);
    const turnId = p.evidence.at(-1)?.turnId;
    if (supportedField(p.fieldId) && value && turnId && /^[a-f0-9-]{36}$/i.test(turnId) && signature(value) === signature(p)) marked[p.fieldId] = marker(turnId,value);
  }
  return marked;
}

function clearField(answers: Answers, id: string): Answers {
  if (ageField(id)) return {...answers, [id]:defaultAges[id]};
  const field = profileField(id);
  if (!field) return answers;
  if (field.path.length === 1) return {...answers,[id]:''};
  const [root,key] = field.path;
  if (root !== 'marriageBasics' && root !== 'partnerCriteria') return answers;
  const next = {...answers[root]} as Record<string,unknown>;
  delete next[key];
  return {...answers,[root]:next};
}

export function retractLunaFields(answers: Answers, withdrawn: ProfileProposal[], fields?: LunaDraftFields) {
  let next = answers;
  const marked = {...fields};
  for (const p of withdrawn) {
    if (supportedField(p.fieldId) && marked[p.fieldId] === 'manual') continue;
    const actual = profileContextFromAnswers(next,true).find(f => f.fieldId === p.fieldId);
    // Derive the actual stored form, including exclusions that turn into the complementary option set.
    const priorPatch = applyProfileProposals(next,[p],true);
    if (!actual || !Object.keys(priorPatch).length) continue;
    const expected = profileContextFromAnswers({...next,...priorPatch},true).find(f => f.fieldId === p.fieldId);
    if (!expected || signature(actual) !== signature(expected) || actual.exclude !== expected.exclude) continue;
    next = clearField(next,p.fieldId);
    if (supportedField(p.fieldId)) delete marked[p.fieldId];
  }
  return {answers:next, fields:marked};
}

export function restoreLunaFields(answers: Answers, doc: InterviewDocument, sensitive: boolean, fields?: LunaDraftFields, preserveLegacyAges = false) {
  let next = answers;
  const marked = {...fields}, turns = new Set(doc.turns.map(turn=>turn.id));
  const confirmed = doc.profileConfirmed ?? [];
  for (const id of refinementFields) {
    const entry = marked[id];
    if (!entry || entry === 'manual') continue;
    const [turn, stored] = entry.split('|');
    if (!turns.has(turn)) continue; // The current session cannot retract another session's saved fields.
    const actual = profileContextFromAnswers(next).find(item => item.fieldId === id);
    if (signature(actual) !== stored) { marked[id]='manual'; continue; }
    if (!confirmed.some(p => p.fieldId === id && marker(p.evidence.at(-1)?.turnId ?? '',p) === entry)) {
      next = clearField(next,id);
      delete marked[id];
    }
  }
  const known = new Map(profileContextFromAnswers(next,sensitive).map(item => [item.fieldId,item]));
  const missing = confirmed.filter(p => {
    if (supportedField(p.fieldId) && marked[p.fieldId] === 'manual') return false;
    if (ageField(p.fieldId) && !preserveLegacyAges && next[p.fieldId] === defaultAges[p.fieldId]) return true;
    return !known.has(p.fieldId);
  });
  next = {...next,...applyProfileProposals(next,missing,sensitive)};
  return {answers:next,fields:markLunaFields(next,missing,marked)};
}
