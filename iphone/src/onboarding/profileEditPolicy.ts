import type { Profile } from '../types';
import type { Answers } from './draft';
import type { SignupConsents } from '../legal/consent';

type MatchingFields = Pick<Profile | Answers, 'preferredMinAge'|'preferredMaxAge'|'surveyAnswers'|'personalityAnswers'|'priorityCategories'|'hardRequirements'|'partnerCriteria'|'beena'>;
type Permissions = Pick<SignupConsents,'assessment'|'sensitiveProfile'>;

// All arrays in the matching questionnaire are sets (e.g. accepted answers).
function normalized(value:unknown):unknown {
  if (Array.isArray(value)) return value.map(normalized).sort();
  if (value && typeof value==='object') return Object.fromEntries(Object.entries(value)
    .filter(([,item])=>item!=null).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,normalized(item)]));
  return value;
}

function matchingValues(profile:MatchingFields, permissions:Permissions,includeScenarios:boolean) {
  const age=[Number(profile.preferredMinAge),Number(profile.preferredMaxAge)];
  if (!permissions.assessment) return age;
  const criteria=Object.fromEntries(Object.entries(profile.partnerCriteria??{}).filter(([key,rule])=>
    rule?.mode!=='any' && (permissions.sensitiveProfile || (key!=='skinTone' && key!=='tribalBackground'))));
  return [age, profile.surveyAnswers??{},profile.personalityAnswers??{},profile.priorityCategories??[],profile.hardRequirements??[],criteria,includeScenarios ? profile.beena?.answers??{} : {}].map(normalized);
}

export function matchingEditChanged(before:MatchingFields,after:MatchingFields,permissions:Permissions) {
  const includeScenarios=Object.keys(after.beena?.answers??{}).length>0;
  return JSON.stringify(matchingValues(before,permissions,includeScenarios))!==JSON.stringify(matchingValues(after,permissions,includeScenarios));
}

export function restoreMatchingAnswers(before:Answers, draft:Answers):Partial<Answers> {
  const story=draft.beena?.story;
  const beena=before.beena || story ? {version:'beena-v1' as const,answers:before.beena?.answers??{},...(story?{story}:{})} : null;
  return {preferredMinAge:before.preferredMinAge,preferredMaxAge:before.preferredMaxAge,surveyAnswers:before.surveyAnswers,
    personalityAnswers:before.personalityAnswers,priorityCategories:before.priorityCategories,hardRequirements:before.hardRequirements,
    partnerCriteria:before.partnerCriteria,beena};
}

export function matchingEditDate(iso:string) {
  return new Date(iso).toLocaleString('ar-SA',{calendar:'gregory',timeZone:'Asia/Riyadh',day:'numeric',month:'long',year:'numeric',hour:'numeric',minute:'2-digit'});
}
