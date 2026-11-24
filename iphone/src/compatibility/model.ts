import interestLabels from "./interests.json" with { type: "json" };
import { normalizeNationality } from './nationality.ts';
import { reciprocalTraitFit, traitRankMultiplier } from './personality.ts';
export { normalizeNationality } from './nationality.ts';
import { canonicalCity, canonicalEducation, canonicalProfession, educationOptions, professionOptions } from '../profile/profileOptions.ts';
import legacyCatalog from "./catalog-v3.json" with { type: "json" };
import legacyPersonalityCatalog from "./personality-catalog-v1.json" with { type: "json" };
import currentPersonalityCatalog from "./personality-catalog.json" with { type: "json" };
import type { MarriageBasics, PartnerCriteria } from "./marriage.ts";
import { compareBeena, beenaRankMultiplier, type BeenaFit, type BeenaProfile } from '../beena/model.ts';
import { createPersonalityEvidence, validatedPersonalityEvidence, type PersonalityEvidencePayload } from './personality-analysis.ts';
import { preferenceCategoryCounts, type PreferenceEvidence, type PreferenceTopic } from './preference-evidence.ts';

import { assessmentVersion, dimensions, applicableDimensions } from './practical-catalog.ts';
export { assessmentVersion, categories, dimensions, applicableDimensions, dimensionsForVersion, practicalAnswerKeys, hasPartnerQuestion } from './practical-catalog.ts';
export const maxPriorities = 2;
export type MatchFit = {
  version: "marriage-v1" | "marriage-v2" | "marriage-v3" | typeof assessmentVersion;
  practicalConcerns?: string[];
  band: "insufficient" | "strong" | "mixed" | "explore";
  provisional: boolean;
  covered: number;
  total: number;
  strengths: string[];
  discussion: string[];
  missing: string[];
  assessmentComplete?: boolean;
  percentage?: number | null;
  criteria?: { covered: number; total: number };
  partnerPersonalityFit?: number;
  preferenceEvidence?: PreferenceEvidence;
  beena?: BeenaFit;
  personality?: {
    version: "personality-v1" | "personality-v2"; complete: boolean; covered: number; total: number;
    percentage: number | null; similarities: string[]; differences: string[];
  } & Partial<PersonalityEvidencePayload>;
};
export function preferencePercentage(fit?: MatchFit): number | null {
  return fit && ["marriage-v1", "marriage-v2", "marriage-v3", assessmentVersion].includes(fit.version) && fit.assessmentComplete && !fit.provisional && fit.total > 0 && fit.covered === fit.total
    && typeof fit.percentage === "number" && Number.isFinite(fit.percentage)
    && fit.percentage >= 0 && fit.percentage <= 100 ? Math.round(fit.percentage) : null;
}

export function personalityPercentage(fit?: MatchFit): number | null {
  const personality = fit?.personality;
  if (fit?.version === assessmentVersion && personality?.version !== "personality-v2") return null;
  if (personality && Object.hasOwn(personality, 'method') && !validatedPersonalityEvidence(personality)) return null;
  return (personality?.version === "personality-v1" || (personality?.version === "personality-v2" && personality.total === currentPersonalityCatalog.length)) && personality.complete && personality.total > 0 && personality.covered === personality.total
    && typeof personality.percentage === "number" && Number.isFinite(personality.percentage)
    && personality.percentage >= 0 && personality.percentage <= 100 ? Math.round(personality.percentage) : null;
}
// Short list drawn from BlindMatch's HobbiesPickerModal. Keep public labels
// separate from permanent IDs so edits to Arabic wording never break a match.
export const interests = (Object.keys(interestLabels) as (keyof typeof interestLabels)[]).map(id => ({ id, label: interestLabels[id] }));

export const maxInterests = 3;
export type CompatibilitySelection = {
  interestIds: string[];
  surveyAnswers: Record<string, string>;
  hardRequirements: string[];
  priorityCategories: string[];
};

type PairProfile = {
  id: string;
  city: string;
  gender: "woman" | "man";
  age: number;
  preferredMinAge: number;
  preferredMaxAge: number;
  education?: string;
  profession?: string;
  interestIds?: readonly string[];
  surveyAnswers?: Readonly<Record<string, string>>;
  hardRequirements?: readonly string[];
  priorityCategories?: readonly string[];
  assessmentVersion?: string;
  marriageBasics?: MarriageBasics;
  relocationCities?: string[];
  partnerCriteria?: PartnerCriteria;
  personalityAnswers?: Readonly<Record<string, string>>;
  personalityVersion?: string;
  beena?: BeenaProfile | null;
};

function criterionFit(member: PairProfile, peer: PairProfile, key: keyof PartnerCriteria): boolean | null {
  const rule = member.partnerCriteria?.[key];
  const basics = peer.marriageBasics ?? {};
  if (!rule || rule.mode === "any") return null;
  if (key === 'sharedLanguage') {
    const own = member.marriageBasics?.spokenLanguages;
    const other = basics.spokenLanguages;
    return own?.length && other?.length ? own.some(language => other.includes(language)) : null;
  }
  if (key === 'education' || key === 'profession') {
    const normalize = key === 'education' ? canonicalEducation : canonicalProfession;
    const options = key === 'education' ? educationOptions : professionOptions;
    const observed = normalize(peer[key] ?? '');
    const wanted = member.partnerCriteria?.[key]?.values;
    // A saved description outside the shared catalog is unknown, not a negative answer.
    if (!options.some(option => option.value === observed) || !wanted?.length) return null;
    return wanted.some(value => normalize(value) === observed);
  }
  if (key === "children" && member.partnerCriteria?.children?.target === "any") return true;
  if (key === "height" || key === "weight") {
    const value = key === "height" ? basics.heightCm : basics.weightKg;
    const range = member.partnerCriteria?.[key];
    if (value === undefined || !range || (range.min === undefined && range.max === undefined)) return null;
    return value >= (range.min ?? -Infinity) && value <= (range.max ?? Infinity);
  }
  if (key === "tribalBackground") {
    const target = member.partnerCriteria?.tribalBackground?.target;
    if (!basics.tribalBackground || basics.tribalBackground === "prefer_not_to_say" || !target) return null;
    if (target !== "same_tribe") return basics.tribalBackground === target;
    const own = member.marriageBasics;
    if (own?.tribalBackground !== "tribal" || !own.tribeName?.trim() || !basics.tribeName?.trim()) return null;
    return basics.tribalBackground === "tribal" && own.tribeName.trim().toLowerCase() === basics.tribeName.trim().toLowerCase();
  }
  if (key === 'nationality') {
    const preference=member.partnerCriteria?.nationality;
    if(!basics.nationality?.trim()||!preference?.values?.length)return null;
    const included=preference.values.some(value=>normalizeNationality(value)===normalizeNationality(basics.nationality!));
    return preference.exclude ? !included : included;
  }
  if (key === "maritalStatus") return basics.maritalStatus && member.partnerCriteria?.maritalStatus?.values?.length
    ? member.partnerCriteria.maritalStatus.values.includes(basics.maritalStatus) : null;
  if (key === "children") return basics.childrenCount === undefined ? null
    : member.partnerCriteria?.children?.target === "none" ? basics.childrenCount === 0 : null;
  if (key === "skinTone") return basics.skinTone && member.partnerCriteria?.skinTone?.values?.length
    ? member.partnerCriteria.skinTone.values.includes(basics.skinTone) : null;
  if (key === "dressStyle") return basics.dressStyle && member.partnerCriteria?.dressStyle?.values?.length
    ? member.partnerCriteria.dressStyle.values.includes(basics.dressStyle) : null;
  if (key === "dressFlexibility") return !basics.dressFlexibility || basics.dressFlexibility === "prefer_not_to_say" ? null
    : member.partnerCriteria?.dressFlexibility?.target === "open_to_discussion" ? ["open_to_discussion", "open_to_change"].includes(basics.dressFlexibility)
    : member.partnerCriteria?.dressFlexibility?.target === "open_to_change" ? basics.dressFlexibility === "open_to_change" : null;
  return basics.smoking === undefined || member.partnerCriteria?.smoking?.target !== "never" ? null : basics.smoking === "never";
}

function acceptsCriteria(member: PairProfile, peer: PairProfile) {
  return (Object.keys(member.partnerCriteria ?? {}) as (keyof PartnerCriteria)[])
    .every(key => member.partnerCriteria?.[key]?.mode !== "require" || criterionFit(member, peer, key) === true);
}

function preferredCriteria(member: PairProfile, peer: PairProfile, softOnly = false) {
  const keys = (Object.keys(member.partnerCriteria ?? {}) as (keyof PartnerCriteria)[])
    .filter(key => (member.partnerCriteria?.[key]?.mode === "prefer" || (!softOnly && member.partnerCriteria?.[key]?.mode === "require")) && !(key === "children" && member.partnerCriteria?.children?.target === "any"));
  const known = keys.map(key => criterionFit(member, peer, key)).filter(value => value !== null);
  const matched = known.filter(Boolean).length;
  const requiredConflict = (Object.keys(member.partnerCriteria ?? {}) as (keyof PartnerCriteria)[]).some(key => member.partnerCriteria?.[key]?.mode === "require" && criterionFit(member, peer, key) === false);
  return { requiredConflict, total: keys.length, covered: known.length, matched, different: known.length - matched,
    missing: keys.length - known.length };
}

function personalityFit(first: PairProfile, second: PairProfile, version: 'personality-v1' | 'personality-v2'): NonNullable<MatchFit["personality"]> {
  const personalityCatalog = version === 'personality-v2' ? currentPersonalityCatalog : legacyPersonalityCatalog;
  const similarities: string[] = [], differences: string[] = [];
  const distances = new Map<string, number>();
  let distanceSum = 0, covered = 0;
  for (const question of personalityCatalog) {
    const left = first.personalityAnswers?.[question.id] ?? " ", right = second.personalityAnswers?.[question.id] ?? " ";
    const a = /^[A-E]$/.test(left) ? "ABCDE".indexOf(left) : -1;
    const b = /^[A-E]$/.test(right) ? "ABCDE".indexOf(right) : -1;
    if (a < 0 || b < 0) continue;
    covered++;
    const distance = Math.abs(a - b);
    distances.set(question.id, distance);
    distanceSum += distance;
    (distance <= 1 ? similarities : differences).push(question.id);
  }
  const complete = covered === personalityCatalog.length && first.personalityVersion === version && second.personalityVersion === version;
  return { version, complete, covered, total: personalityCatalog.length,
    percentage: complete ? Math.round((4 * covered - distanceSum) * 25 / covered) : null, similarities, differences,
    ...createPersonalityEvidence(distances, complete, version) };
}

type CurrentDimension = typeof dimensions[number];
type Dimension = CurrentDimension | typeof legacyCatalog.dimensions[number];
const historicalTopics = new Set(legacyCatalog.dimensions.map(topic => topic.id));
function answer(member: PairProfile, dim: Dimension, side: "self" | "partner") {
  if (member.assessmentVersion !== assessmentVersion && !historicalTopics.has(dim.id)) return undefined;
  const value = member.surveyAnswers?.[side === "self" ? dim.id : dim.partnerId];
  if (dim.id === 'public_event_attendance' && side === 'self' && value === 'D') return undefined;
  return dim.options.some(option => option.code === value) ? value : undefined;
}

function ageAccepted(age: number, member: PairProfile) {
  return Number.isInteger(age) && age >= 18 && age <= 110 &&
    age >= member.preferredMinAge && age <= member.preferredMaxAge;
}

function shareCity(first: PairProfile, second: PairProfile) {
  const city = canonicalCity(first.city ?? "");
  return !!city && city === canonicalCity(second.city ?? "")
    && !['مدينة أخرى داخل السعودية', 'مدينة أخرى خارج السعودية'].includes(city);
}

// Preference matching has modest empirical support (Eastwick et al., doi:10.1037/pspp0000524).
// The category weights and penalties below are ranking rules chosen by Wudayn.
// Anchors describe explicit preference satisfaction. A conditional or unresolved
// answer gets partial credit. Letter order has no meaning for nominal questions.
const highImpactTopics = new Set(['children_plan','family_authority','housing_arrangement','financial_provision','wife_work','domestic_labor','marriage_timeline','mixed_gatherings','faith_routine']);
function agreement(member: PairProfile, peer: PairProfile, dim: Dimension, wanted: string, observed: string) {
  const id = dim.id;
  if (id === 'public_event_attendance') {
    // B accepts abstaining or selective attendance. C asks for willingness to attend.
    return Number(wanted === 'D' || wanted === observed ||
      (wanted === 'B' && observed === 'A') || (wanted === 'C' && observed === 'B'));
  }
  if (id === 'residence_plan' && shareCity(member, peer)) return 1;
  if (id === 'marriage_timeline' && wanted!=='D' && observed!=='D' && answerFits(member,peer,dim,wanted,observed)) return 1;
  if ((id === 'children_plan' && [wanted, observed].includes('C'))
    || (['marriage_timeline','parenting_approach'].includes(id) && [wanted, observed].includes('D'))) return 0.5;
  const flexible = id === 'wife_work' ? 'C' : ['domestic_labor','financial_provision','housing_arrangement'].includes(id) ? 'D' : null;
  if (wanted === flexible) return 1;
  if (observed === flexible) return 0.5;
  if (wanted === observed) return 1;
  if (id === 'marriage_timeline' && ['AB', 'BA', 'BC', 'CB'].includes(wanted + observed)) return 0.5;
  return 0;
}

function answerFits(member: PairProfile, peer: PairProfile, dim: Dimension, wanted: string | undefined, observed: string | undefined) {
  if (!wanted || !observed) return false;
  if (dim.id === 'marriage_timeline') {
    const windows=(code:string)=>code==='E'?'AB':code==='F'?'ABC':code;
    return [...windows(wanted)].some(window=>windows(observed).includes(window));
  }
  if(dim.id==='public_event_attendance')return observed!=='D' && (wanted==='D' || wanted===observed || wanted==='B'&&observed==='A' || wanted==='C'&&observed==='B');
  if(dim.id==='wife_work'&&wanted==='C' || ['domestic_labor','financial_provision','housing_arrangement'].includes(dim.id)&&wanted==='D')return true;
  return wanted === observed || (dim.id === 'residence_plan' && shareCity(member, peer));
}

function acceptsRequirements(member: PairProfile, peer: PairProfile) {
  return (member.hardRequirements ?? []).every(id => {
    const dim = legacyCatalog.dimensions.find(item => item.id === id && item.hardAllowed);
    if (!dim) return false;
    const required = answer(member, dim, "partner");
    return answerFits(member, peer, dim, required, answer(peer, dim, "self"));
  });
}

function canShareCity(first: PairProfile, second: PairProfile) {
  function cities(person:PairProfile, peer:PairProfile) {
    const plan=person.surveyAnswers?.residence_plan;
    if (!plan || !['A','B','C'].includes(plan)) return [];
    const choices=[person.city,...(plan==='B'?[peer.city]:plan==='C'?person.relocationCities??[]:[])];
    return choices.map(canonicalCity).filter(city=>city && !city.startsWith('مدينة أخرى'));
  }
  const allowed=cities(second,first);
  return cities(first,second).some(city=>allowed.includes(city));
}

function cityKnown(member: PairProfile) {
  const city = canonicalCity(member.city ?? "");
  return !!city && !['مدينة أخرى داخل السعودية', 'مدينة أخرى خارج السعودية'].includes(city);
}

function legacyDirectedFit(member: PairProfile, peer: PairProfile) {
  let numerator = 0, denominator = 0, penalty = 1;
  for (const category of legacyCatalog.categories) {
    let known = 0, points = 0;
    for (const dim of legacyCatalog.dimensions.filter(item => item.category === category.id)) {
      const want = answer(member, dim, 'partner'), observed = answer(peer, dim, 'self');
      if (!want || !observed) continue;
      const credit = agreement(member, peer, dim, want, observed);
      known++;
      points += credit;
      if (credit === 0 && member.hardRequirements?.includes(dim.id)) penalty = Math.min(penalty, 0.5);
      else if (credit === 0 && highImpactTopics.has(dim.id)) penalty = Math.min(penalty, 0.75);
      else if (credit === 0.5 && ['children_plan','marriage_timeline'].includes(dim.id)) penalty = Math.min(penalty, 0.9);
    }
    if (!known) continue;
    const weight = category.weight * (member.priorityCategories?.includes(category.id) ? 2 : 1);
    numerator += weight * points / known;
    denominator += weight;
  }
  const criteria = preferredCriteria(member, peer);
  // Each known optional detail contributes two points of evidence against the
  // baseline category weights (100 points when complete and unprioritized).
  numerator += 2 * criteria.matched;
  denominator += 2 * criteria.covered;
  if (criteria.requiredConflict) penalty = Math.min(penalty, 0.5);
  return { score: denominator ? numerator / denominator : 0, penalty, criteria, observedWeight: 0 };
}

// Current residence compatibility is reciprocal: both members must be able to live in a common city.
function residenceCredit(member: PairProfile, peer: PairProfile, topic: Dimension) {
  if (!answer(member, topic, 'self') || !answer(peer, topic, 'self') || !cityKnown(member) || !cityKnown(peer)) return undefined;
  return Number(shareCity(member, peer) || canShareCity(member, peer));
}

function unresolvedPractical(topic: Dimension, wanted: string, observed: string) {
  const undecided = topic.id === 'children_plan' ? 'C'
    : ['marriage_timeline', 'parenting_approach'].includes(topic.id) ? 'D' : undefined;
  return wanted === undecided || observed === undecided;
}

function currentDirectedFit(member: PairProfile, peer: PairProfile, topics: CurrentDimension[]) {
  let numerator = 0, denominator = 0, observedWeight = 0;
  const criteria = preferredCriteria(member, peer, true);
  let strictConflict = (Object.keys(member.partnerCriteria ?? {}) as (keyof PartnerCriteria)[])
    .some(key => member.partnerCriteria?.[key]?.mode === 'require' && criterionFit(member, peer, key) !== true);
  for (const topic of topics) {
    const wanted = answer(member, topic, 'partner'), observed = answer(peer, topic, 'self');
    let credit: number;
    if (topic.id === 'residence_plan') {
      const residence = residenceCredit(member, peer, topic);
      if (residence === undefined) continue;
      credit = residence;
    } else {
      if (!wanted || !observed) continue;
      credit = agreement(member, peer, topic, wanted, observed);
      if (credit === 0 && topic.hardAllowed && member.hardRequirements?.includes(topic.id)) strictConflict = true;
      if (unresolvedPractical(topic, wanted, observed)) continue;
    }
    const weight = topic.weight * (member.priorityCategories?.includes(topic.category) ? 1.35 : 1);
    observedWeight += topic.weight;
    numerator += weight * credit;
    denominator += weight;
  }
  // When more than six soft criteria are known, share their 12 points proportionately.
  const criteriaWeight = 2 * Math.min(criteria.covered, 6);
  numerator += criteria.covered ? criteriaWeight * criteria.matched / criteria.covered : 0;
  denominator += criteriaWeight;
  return { score: denominator ? numerator / denominator : 0, criteria, strictConflict, penalty: 1, observedWeight };
}

function hasCurrentContract(first: PairProfile, second: PairProfile) {
  return first.assessmentVersion === assessmentVersion || second.assessmentVersion === assessmentVersion;
}

function currentPairDimensions(first: PairProfile, second: PairProfile) {
  const omitParenting = [first, second].some(member => member.assessmentVersion === assessmentVersion &&
    applicableDimensions(assessmentVersion, member.surveyAnswers, member.marriageBasics?.childrenCount, member.partnerCriteria?.children).length < dimensions.length);
  return omitParenting ? dimensions.filter(topic => topic.id !== 'parenting_approach') : dimensions;
}

export function comparePreferences(first: PairProfile, second: PairProfile) {
  const woman=first.gender==='woman'?first:second;
  const man=woman===first?second:first;
  if(woman.marriageBasics?.polygynyPreference==='not_open' &&
     (man.marriageBasics?.polygynyPreference!=='not_open' || !['never_married','divorced','widowed'].includes(man.marriageBasics?.maritalStatus??''))) return null;
  const sameCity = shareCity(first, second);
  if (
    first.id === second.id || first.gender === second.gender ||
    !first.city?.trim() || !second.city?.trim() ||
    (!sameCity && !canShareCity(first, second)) ||
    !ageAccepted(first.age, second) || !ageAccepted(second.age, first) ||
    (first.assessmentVersion !== assessmentVersion && !acceptsRequirements(first, second)) || (second.assessmentVersion !== assessmentVersion && !acceptsRequirements(second, first)) ||
    !acceptsCriteria(first, second) || !acceptsCriteria(second, first)
  ) return null;
  const result = describeFit(first, second);
  if (hasCurrentContract(first, second) && result.fit.practicalConcerns?.includes('strict_requirement')) return null;
  if (!result.reasons.length) result.reasons.push('يمكنكما مناقشة التفضيلات الظاهرة في تفاصيل المقارنة.');
  return result;
}

// Existing conversations can still explain the pair's answers after an eligibility preference changes.
export function describeFit(first: PairProfile, second: PairProfile) {
  const strengths: string[] = [];
  const discussion: string[] = [];
  const missing: string[] = [];
  const coveredCategories = new Set<string>();
  const reasons: string[] = [];
  const topics: PreferenceTopic[] = [];
  const current = hasCurrentContract(first, second);
  const currentTopics = current ? currentPairDimensions(first, second) : null;
  const activeTopics = currentTopics ?? legacyCatalog.dimensions;
  for (const dim of activeTopics) {
    const selfA = answer(first, dim, "self");
    const selfB = answer(second, dim, "self");
    const wantA = answer(first, dim, "partner");
    const wantB = answer(second, dim, "partner");
    const residence = current && dim.id === 'residence_plan';
    const commonCity = residence ? residenceCredit(first, second, dim) : undefined;
    const ab = residence ? commonCity : wantA && selfB ? agreement(first, second, dim, wantA, selfB) : undefined;
    const ba = residence ? commonCity : wantB && selfA ? agreement(second, first, dim, wantB, selfA) : undefined;
    if (ab === undefined || ba === undefined) { missing.push(dim.id); topics.push({ id: dim.id, status: 'missing' }); continue; }
    coveredCategories.add(dim.category);
    const forwardMatch = ab === 1, reverseMatch = ba === 1;
    topics.push({ id: dim.id, status: forwardMatch && reverseMatch ? 'aligned' : Math.min(ab, ba) === 0.5 ? 'conditional' : forwardMatch || reverseMatch ? 'one_sided' : 'different' });
    if (forwardMatch && reverseMatch) {
      strengths.push(dim.id);
      reasons.push(dim.reason);
    } else { discussion.push(dim.id); }
  }
  const covered = strengths.length + discussion.length;
  const forward = currentTopics ? currentDirectedFit(first, second, currentTopics) : legacyDirectedFit(first, second);
  const reverse = currentTopics ? currentDirectedFit(second, first, currentTopics) : legacyDirectedFit(second, first);
  const practicalConcerns: string[] = [];
  let practicalPenalty = 1;
  if (!ageAccepted(first.age, second) || !ageAccepted(second.age, first)) {
    practicalConcerns.push('age_range');
    practicalPenalty = 0.85;
  }
  const locationKnown = cityKnown(first) && cityKnown(second);
  if (locationKnown && !shareCity(first, second) && first.surveyAnswers?.residence_plan === 'A' && second.surveyAnswers?.residence_plan === 'A') {
    practicalConcerns.push('relocation');
    practicalPenalty = 0.6;
  }
  const childPlans = [first.surveyAnswers?.children_plan, second.surveyAnswers?.children_plan];
  if (childPlans.includes('A') && childPlans.includes('B')) {
    practicalConcerns.push('children_intent');
    practicalPenalty = Math.min(practicalPenalty, 0.75);
  }
  if (!locationKnown) practicalConcerns.push('location_unknown');
  if (forward.criteria.requiredConflict || reverse.criteria.requiredConflict) practicalConcerns.push('required_criterion');
  if ((first.assessmentVersion === assessmentVersion && 'strictConflict' in forward && forward.strictConflict) ||
      (second.assessmentVersion === assessmentVersion && 'strictConflict' in reverse && reverse.strictConflict)) practicalConcerns.push('strict_requirement');
  const reciprocal = Math.sqrt(forward.score * reverse.score) * (current ? 1 : Math.min(practicalPenalty, forward.penalty, reverse.penalty));
  const provisional = covered < 5 || coveredCategories.size < 3 || !locationKnown || forward.criteria.missing + reverse.criteria.missing > 0;
  const band: MatchFit["band"] = provisional ? "insufficient" : reciprocal >= 0.75 ? "strong" : reciprocal >= 0.45 ? "mixed" : "explore";
  const version = current ? assessmentVersion : "marriage-v3";
  const assessmentComplete = covered === activeTopics.length && activeTopics.length > 0 &&
    first.assessmentVersion === version && second.assessmentVersion === version && locationKnown &&
    !forward.criteria.missing && !reverse.criteria.missing;
  const forwardCriteria = forward.criteria, reverseCriteria = reverse.criteria;
  const fit: MatchFit = { version, band, practicalConcerns, provisional, covered, total: activeTopics.length, strengths, discussion, missing,
    assessmentComplete, percentage: assessmentComplete ? Math.round(reciprocal * 100) : null,
    criteria: { covered: forwardCriteria.covered + reverseCriteria.covered, total: forwardCriteria.total + reverseCriteria.total },
    preferenceEvidence: { version: 'preference-evidence-v1', method: current ? 'reciprocal-weighted-v4' : 'reciprocal-weighted-v3', topics, categories: preferenceCategoryCounts(topics, version), criteria: {
      matched: forwardCriteria.matched + reverseCriteria.matched,
      different: forwardCriteria.different + reverseCriteria.different,
      missing: forwardCriteria.missing + reverseCriteria.missing,
      total: forwardCriteria.total + reverseCriteria.total,
    } },
    ...(current && first.assessmentVersion === assessmentVersion && second.assessmentVersion === assessmentVersion &&
      first.personalityVersion === 'personality-v2' && second.personalityVersion === 'personality-v2'
      ? { personality: personalityFit(first, second, 'personality-v2') }
      : !current && first.personalityVersion !== 'personality-v2' && second.personalityVersion !== 'personality-v2'
        ? { personality: personalityFit(first, second, 'personality-v1') } : {}),
    beena: compareBeena(first.beena, second.beena) };
  const sharedInterests = interests.filter(interest =>
    first.interestIds?.includes(interest.id) && second.interestIds?.includes(interest.id));
  for (const interest of sharedInterests) reasons.push("اهتمام مشترك: " + interest.label);
  const traitFit = first.assessmentVersion === assessmentVersion && second.assessmentVersion === assessmentVersion
    ? reciprocalTraitFit(first, second) : null;
  if (traitFit !== null) fit.partnerPersonalityFit = Math.round(100 * traitFit);
  const practicalRank = currentTopics
    ? 0.5 + Math.sqrt((forward.observedWeight + reverse.observedWeight) /
        (2 * currentTopics.reduce((total, topic) => total + topic.weight, 0))) * (reciprocal - 0.5)
    : reciprocal * Math.sqrt(covered / activeTopics.length) * beenaRankMultiplier(fit.beena);
  const rankValue = practicalRank * traitRankMultiplier(traitFit);
  return { fit, rankValue, reciprocalSignals: strengths.length, sharedInterests, reasons };
}

export function rankPreferences<T extends PairProfile>(first: PairProfile, others: readonly T[]) {
  return others.flatMap(person => {
    const result = comparePreferences(first, person);
    return result ? [{ person, ...result }] : [];
  }).sort((a, b) => Number(a.fit.provisional) - Number(b.fit.provisional) ||
    b.rankValue - a.rankValue || b.fit.covered - a.fit.covered ||
    b.sharedInterests.length - a.sharedInterests.length || a.person.id.localeCompare(b.person.id, "en"));
}
