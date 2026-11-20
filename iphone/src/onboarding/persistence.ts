import { privateDraftKeychain } from "../session";
import { assessmentVersion, categories, dimensionsForVersion, interests, maxInterests, maxPriorities } from "../compatibility/model";
import { chapters, type Answers, type ApplicationDraft } from "./draft";
import { createDraftVault, draftTTL } from "./vault";
import { validMarriageBasicsDraft, validPartnerCriteriaDraft } from "../compatibility/marriage";
import { partnerTraitQuestions, partnerTraitRanges, personalityQuestionsFor, personalityOptions, personalityVersion } from "../compatibility/personality";
import { validPublicAvatar } from "../compatibility/appearance";
import { validBeenaProfile } from "../beena/model";
import { cloud, callRpc } from '../cloud';
import { createAccountDraftStorage } from './accountDraftStorage';
import { validReadiness } from './membershipReadiness';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const textLimits = { displayName: 60, age: 3, city: 80, profession: 100, bio: 1200, contact: 180,
  preferredMinAge: 3, preferredMaxAge: 3, familyPreference: 180 } as const;
const optionalTextLimits = { birthDate: 10, lookingFor: 600, lifeTogether: 600, valuesStatement: 600, discoveryLine: 1200, education: 100, marriageIntent: 100 } as const;
function validAnswers(value: unknown): value is Answers {
  if (!isRecord(value) || (value.gender !== "" && value.gender !== "woman" && value.gender !== "man")) return false;
  const dimensions = dimensionsForVersion(String(value.assessmentVersion ?? 'marriage-v3'));
  const personalityQuestions = personalityQuestionsFor(String(value.personalityVersion ?? 'personality-v1'));
  for (const [key, limit] of Object.entries(textLimits)) {
    const text = value[key];
    if (typeof text !== "string" || text.length > limit) return false;
  }
  const extraFields = ["gender", "interestIds", "surveyAnswers", "assessmentVersion", "hardRequirements", "priorityCategories", "marriageBasics", "partnerCriteria", "personalityAnswers", "personalityVersion", "publicAvatar", "appearanceVersion", "beena", "membershipReadiness"];
  if (value.membershipReadiness !== undefined && !validReadiness(value.membershipReadiness)) return false;
  if (value.beena != null && !validBeenaProfile(value.beena)) return false;
  for (const [key, limit] of Object.entries(optionalTextLimits)) {
    if (value[key] !== undefined && (typeof value[key] !== "string" || value[key].length > limit)) return false;
  }
  if (Object.keys(value).some(key => !Object.hasOwn(textLimits, key) && !Object.hasOwn(optionalTextLimits, key) && !extraFields.includes(key))) return false;
  if (value.assessmentVersion !== undefined && ![assessmentVersion,"marriage-v3","marriage-v2","marriage-v1","legacy-v0"].includes(String(value.assessmentVersion))) return false;
  if (value.appearanceVersion !== undefined && value.appearanceVersion !== "appearance-v1") return false;
  if (value.publicAvatar !== undefined && !validPublicAvatar(value.publicAvatar)) return false;
  if (value.marriageBasics !== undefined && !validMarriageBasicsDraft(value.marriageBasics)) return false;
  if (value.partnerCriteria !== undefined && !validPartnerCriteriaDraft(value.partnerCriteria)) return false;
  if (value.personalityVersion !== undefined && value.personalityVersion !== personalityVersion && value.personalityVersion !== "personality-v1") return false;
  if (value.personalityAnswers !== undefined && (!isRecord(value.personalityAnswers) || !Object.entries(value.personalityAnswers).every(([key, answer]) => (
    personalityQuestions.some(q => q.id === key) && personalityOptions.some(o => o.code === answer)
  ) || (value.personalityVersion === personalityVersion && partnerTraitQuestions.some(q => q.id === key) && partnerTraitRanges.some(r => r.code === answer))))) return false;
  const ids = value.interestIds;
  if (!Array.isArray(ids) || ids.length > maxInterests || new Set(ids).size !== ids.length ||
     !ids.every(id => interests.some(item => item.id === id))) return false;
  const answers = value.surveyAnswers;
  if (!isRecord(answers) || !Object.entries(answers).every(([key, answer]) =>
    typeof answer === "string" && dimensions.some(d => (d.id === key || d.partnerId === key) && d.options.some(o => o.code === answer)))) return false;
  const priorities = value.priorityCategories;
  if (priorities !== undefined && (!Array.isArray(priorities) || priorities.length > maxPriorities ||
    new Set(priorities).size !== priorities.length || !priorities.every(id => categories.some(c => c.id === id)))) return false;
  const requirements = value.hardRequirements;
  return requirements === undefined || (Array.isArray(requirements) && new Set(requirements).size === requirements.length &&
    requirements.every(id => dimensions.some(dim => dim.hardAllowed && dim.id === id && answers[dim.partnerId])));
}

export function decodeDraft(text: string, owner: string, baseline: string, now: number): ApplicationDraft | null {
  if (text.length > 20_000) return null;
  let data: unknown;
  try { data = JSON.parse(text); } catch { return null; }
  if (isRecord(data) && isRecord(data.answers)) {
    // Recover usable drafts written before these server-only fields were excluded.
    if (!data.answers.assessmentVersion) data.answers.assessmentVersion = 'marriage-v3';
    if (!data.answers.personalityVersion) data.answers.personalityVersion = data.answers.assessmentVersion === assessmentVersion ? personalityVersion : 'personality-v1';
    if (['marriage-v1','marriage-v2'].includes(String(data.answers.assessmentVersion)) && isRecord(data.answers.surveyAnswers)) {
      const catalog = dimensionsForVersion(String(data.answers.assessmentVersion));
      data.answers.surveyAnswers = Object.fromEntries(Object.entries(data.answers.surveyAnswers).filter(([id]) => catalog.some(d => d.id === id || d.partnerId === id)));
    }
    delete data.answers.portrait;
    delete data.answers.signupConsents;
  }
  if (!isRecord(data) || data.version !== 1 || data.owner !== owner || data.baseline !== baseline ||
    typeof data.savedAt !== "number" || !Number.isFinite(data.savedAt) || data.savedAt > now ||
    now - data.savedAt >= draftTTL || typeof data.returnToReview !== "boolean" || !validAnswers(data.answers)) return null;
  const chapter = chapters.find(c => c.key === data.step);
  if (!chapter) return null;
  const permissions = isRecord(data.permissions) && data.permissions.version === '2026-11-07-privacy' &&
    typeof data.permissions.sensitiveProfile === 'boolean' && typeof data.permissions.assessment === 'boolean'
    ? { version: data.permissions.version, sensitiveProfile: data.permissions.sensitiveProfile, ...(typeof data.permissions.sensitivePublication==='boolean'?{sensitivePublication:data.permissions.sensitivePublication&&data.permissions.sensitiveProfile}:{}), assessment: data.permissions.assessment, ...(data.permissions.interview === true ? { interview: true } : {}) } : undefined;
  return { owner, baseline, answers: data.answers, step: chapter.key, returnToReview: data.returnToReview, consent: false,
    ...(permissions ? { permissions } : {}) };
}
const accountStorage = createAccountDraftStorage(callRpc);
export const accountDraftsAvailable = () => Boolean(cloud);
export const intakeVault = createDraftVault(() => cloud ? accountStorage : privateDraftKeychain(), decodeDraft);
export const clearSavedIntake = (owner: string) => intakeVault.clear(owner);
export async function discardLocalIntake(owner: string) {
  await intakeVault.release(owner);
  await privateDraftKeychain()?.remove('nisfayn.intake.v1.' + owner);
}
