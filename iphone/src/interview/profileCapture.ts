import catalog from './profile-catalog.json' with { type: 'json' };
import type { Profile } from '../types';
import { validMarriageBasicsDraft, validPartnerCriteriaDraft } from '../compatibility/marriage';

export type ProfileCaptureMode = 'any' | 'prefer' | 'require' | null;
export type ProfileContextValue = { fieldId: string; values: string[]; mode: ProfileCaptureMode; exclude: boolean };
export type ProfileContext = ProfileContextValue[];
export type ProfileProposal = ProfileContextValue & {
  id: string;
  summary: string;
  evidence: { turnId: string; quote: string }[];
  needsClarification: boolean;
};
export type ProfileField = {
  fieldId: string; path: string[]; label: string;
  kind: 'text' | 'enum' | 'number' | 'set' | 'criterion' | 'range';
  options?: { value: string; label: string }[];
  min?: number; max?: number; maxLength?: number; maxItems?: number;
  sensitive?: boolean; criterionShape?: 'values' | 'target' | 'mode' | 'range'; allowExclude?: boolean;
};
export const profileCatalog = catalog as ProfileField[];
const fields = new Map(profileCatalog.map(field => [field.fieldId, field]));
export const profileField = (fieldId: string) => fields.get(fieldId);
export const profileProposalOptions = (proposal: Pick<ProfileProposal, 'fieldId'>) => profileField(proposal.fieldId)?.options ?? [];
export const profileProposalLabel = (proposal: Pick<ProfileProposal, 'fieldId'>) => profileField(proposal.fieldId)?.label ?? '';
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const bounded = (value: unknown, maximum: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= maximum && !/[\u0000-\u0008]/.test(value);
const validNumber = (value: string, field: ProfileField) => /^\d{1,3}$/.test(value) && Number(value) >= field.min! && Number(value) <= field.max!;

/** Only these registered paths can be written. Model output cannot add account,
 * consent, verification, billing or matching-score properties to a profile. */
export function validProfileProposalValues(value: unknown): value is ProfileContextValue {
  if (!object(value) || typeof value.fieldId !== 'string') return false;
  const field = profileField(value.fieldId);
  if (!field || !Array.isArray(value.values) || !value.values.every(item => typeof item === 'string') || typeof value.exclude !== 'boolean') return false;
  const values = value.values as string[];
  if (new Set(values).size !== values.length && field.kind !== 'range') return false;
  if (field.criterionShape) {
    if (!['any', 'prefer', 'require'].includes(String(value.mode))) return false;
    if (value.mode === 'any') return values.length === 0 && !value.exclude;
    if (value.exclude && !field.allowExclude) return false;
    if (field.criterionShape === 'mode') return values.length === 0 && !value.exclude;
  } else if (value.mode !== null || value.exclude) return false;
  if (field.kind === 'text') return values.length === 1 && bounded(values[0], field.maxLength ?? 600) && !/https?:\/\/|www\./i.test(values[0]);
  if (field.kind === 'number') return values.length === 1 && validNumber(values[0], field);
  if (field.kind === 'range') return values.length === 2 && values.some(Boolean) && values.every(v => v === '' || validNumber(v, field)) && (!values[0] || !values[1] || Number(values[0]) <= Number(values[1]));
  const allowed = new Set(field.options?.map(option => option.value));
  if (!values.length || !values.every(item => allowed.has(item))) return false;
  if (field.kind === 'enum' || field.criterionShape === 'target') return values.length === 1;
  if (values.length > (field.maxItems ?? allowed.size)) return false;
  // An exclusion that rejects every canonical option cannot form a valid rule.
  return !value.exclude || field.fieldId === 'partnerCriteria.nationality' || values.length < allowed.size;
}

export function validProfileProposal(value: unknown): value is ProfileProposal {
  if (!object(value)) return false;
  const metadata: Record<string, unknown> = value;
  return validProfileProposalValues(value) && metadata.id === 'profile:' + value.fieldId
    && bounded(metadata.summary, 240) && typeof metadata.needsClarification === 'boolean'
    && Array.isArray(metadata.evidence) && metadata.evidence.length > 0 && metadata.evidence.length <= 3
    && metadata.evidence.every(item => object(item) && bounded(item.turnId, 100) && bounded(item.quote, 240));
}

export function profileProposalValue(proposal: ProfileContextValue): string {
  const field = profileField(proposal.fieldId);
  if (!field || !validProfileProposalValues(proposal)) return '';
  if (proposal.mode === 'any') return 'لا تفضيل محدد';
  const labels = new Map(field.options?.map(option => [option.value, option.label]));
  let text = proposal.values.map(value => labels.get(value) ?? value).join('، ');
  if (field.kind === 'range') {
    const [min, max] = proposal.values;
    text = min && max ? `${min}–${max}` : min ? `من ${min}` : `حتى ${max}`;
  }
  if (field.criterionShape === 'mode') text = field.label;
  if (proposal.exclude) text = `باستثناء: ${text}`;
  if (proposal.mode) text += proposal.mode === 'require' ? ' · شرط أساسي' : ' · تفضيل';
  return text;
}

type ProfileCaptureAnswers = Partial<Omit<Profile, 'age' | 'gender' | 'preferredMinAge' | 'preferredMaxAge'>> & { age?: string | number; gender?: string; preferredMinAge?: string | number; preferredMaxAge?: string | number };

/** Apply reviewed, clear suggestions to the private draft only. No mutation of
 * the input, no publication, and no inferred consent or verification status. */
export function applyProfileProposals<T extends ProfileCaptureAnswers>(current: T, proposals: ProfileProposal[], sensitiveConsent = false): Partial<T> {
  const patch: Record<string, unknown> = {};
  for (const proposal of proposals) {
    if (['bio','lookingFor','lifeTogether','valuesStatement','marriageIntent'].includes(proposal.fieldId)) continue;
    if (!validProfileProposal(proposal) || proposal.needsClarification) continue;
    const field = profileField(proposal.fieldId)!;
    if (field.sensitive && !sensitiveConsent) continue;
    let value: unknown;
    if (field.criterionShape) {
      if (proposal.mode === 'any') value = { mode: 'any' };
      else if (field.criterionShape === 'range') value = { mode: proposal.mode, ...(proposal.values[0] ? { min: Number(proposal.values[0]) } : {}), ...(proposal.values[1] ? { max: Number(proposal.values[1]) } : {}) };
      else if (field.criterionShape === 'mode') value = { mode: proposal.mode };
      else if (field.criterionShape === 'target') value = { mode: proposal.mode, target: proposal.values[0] };
      else {
        const nativeExclusion = field.fieldId === 'partnerCriteria.nationality';
        const values = proposal.exclude && !nativeExclusion ? field.options!.map(option => option.value).filter(option => !proposal.values.includes(option)) : [...proposal.values];
        value = { mode: proposal.mode, values, ...(nativeExclusion ? { exclude: proposal.exclude } : {}) };
      }
    } else if (field.kind === 'number') {
      const preserveString = field.path.length === 1 && typeof current[field.path[0] as keyof T] !== 'number';
      value = preserveString ? proposal.values[0] : Number(proposal.values[0]);
    } else value = field.kind === 'set' ? [...proposal.values] : proposal.values[0].trim();
    if (field.path.length === 1) patch[field.path[0]] = value;
    else {
      const root = field.path[0] as 'marriageBasics' | 'partnerCriteria';
      patch[root] = { ...(patch[root] as object ?? current[root] ?? {}), [field.path[1]]: value };
    }
  }
  const basics = patch.marriageBasics as Profile['marriageBasics'];
  if (basics) {
    // Dependent disclosures only survive when their explicit prerequisite does.
    if (basics.maritalStatus !== 'married') delete basics.currentWives;
    if (basics.tribalBackground !== 'tribal') delete basics.tribeName;
    if (!validMarriageBasicsDraft(basics)) delete patch.marriageBasics;
  }
  if (patch.partnerCriteria && !validPartnerCriteriaDraft(patch.partnerCriteria)) delete patch.partnerCriteria;
  const min = Number(patch.preferredMinAge ?? current.preferredMinAge), max = Number(patch.preferredMaxAge ?? current.preferredMaxAge);
  if (Number.isFinite(min) && Number.isFinite(max) && min > max) { delete patch.preferredMinAge; delete patch.preferredMaxAge; }
  return patch as Partial<T>;
}

/** Share only registered, populated fields already in the user's draft so the
 * conversation can avoid re-asking them. Sensitive context needs separate consent. */
export function profileContextFromAnswers(current: ProfileCaptureAnswers, sensitiveConsent = false): ProfileContext {
  const context: ProfileContext = [];
  for (const field of profileCatalog) {
    if (field.sensitive && !sensitiveConsent) continue;
    const root = current[field.path[0] as keyof ProfileCaptureAnswers];
    const raw: unknown = field.path.length === 1 ? root : object(root) ? (root as Record<string, unknown>)[field.path[1]] : undefined;
    if (raw === undefined || raw === null || raw === '') continue;
    let item: ProfileContextValue = { fieldId: field.fieldId, values: [], mode: null, exclude: false };
    if (field.criterionShape) {
      if (!object(raw)) continue;
      item.mode = raw.mode as ProfileCaptureMode;
      if (item.mode !== 'any') item.values = field.criterionShape === 'range' ? [raw.min === undefined ? '' : String(raw.min), raw.max === undefined ? '' : String(raw.max)] : field.criterionShape === 'target' ? [String(raw.target ?? '')] : field.criterionShape === 'values' && Array.isArray(raw.values) ? raw.values.map(String) : [];
      item.exclude = raw.exclude === true;
    } else item.values = Array.isArray(raw) ? raw.map(String) : [String(raw)];
    if (validProfileProposalValues(item)) context.push(item);
  }
  return context;
}
