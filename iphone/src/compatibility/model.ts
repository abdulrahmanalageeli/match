import catalog from "./catalog.json" with { type: "json" };
import personalityCatalog from "./personality-catalog.json" with { type: "json" };
import type { MarriageBasics, PartnerCriteria } from "./marriage.ts";
import { compareBeena, beenaRankMultiplier, type BeenaFit, type BeenaProfile } from '../beena/model.ts';
import { createPersonalityEvidence, validatedPersonalityEvidence, type PersonalityEvidencePayload } from './personality-analysis.ts';

export const assessmentVersion = "marriage-v2" as const;
export const categories = catalog.categories;
export const dimensions = catalog.dimensions;
export const maxPriorities = 2;
export type MatchFit = {
  version: typeof assessmentVersion;
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
  beena?: BeenaFit;
  personality?: {
    version: "personality-v1"; complete: boolean; covered: number; total: number;
    percentage: number | null; similarities: string[]; differences: string[];
  } & Partial<PersonalityEvidencePayload>;
};
export function preferencePercentage(fit?: MatchFit): number | null {
  return fit && ["marriage-v1", "marriage-v2"].includes(fit.version) && fit.assessmentComplete && !fit.provisional && fit.total > 0 && fit.covered === fit.total
    && typeof fit.percentage === "number" && Number.isFinite(fit.percentage)
    && fit.percentage >= 0 && fit.percentage <= 100 ? Math.round(fit.percentage) : null;
}

export function personalityPercentage(fit?: MatchFit): number | null {
  const personality = fit?.personality;
  if (personality && Object.hasOwn(personality, 'method') && !validatedPersonalityEvidence(personality)) return null;
  return personality?.version === "personality-v1" && personality.complete && personality.total > 0 && personality.covered === personality.total
    && typeof personality.percentage === "number" && Number.isFinite(personality.percentage)
    && personality.percentage >= 0 && personality.percentage <= 100 ? Math.round(personality.percentage) : null;
}
// Short list drawn from BlindMatch's HobbiesPickerModal. Keep public labels
// separate from permanent IDs so edits to Arabic wording never break a match.
export const interests = [
  { id: "reading", label: "القراءة" },
  { id: "cooking", label: "الطبخ" },
  { id: "walking", label: "المشي" },
  { id: "travel", label: "السفر" },
  { id: "photography", label: "التصوير" },
  { id: "board_games", label: "الألعاب اللوحية" },
  { id: "museums", label: "المتاحف" },
  { id: "creative_writing", label: "الكتابة الإبداعية" },
] as const;

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
  interestIds?: readonly string[];
  surveyAnswers?: Readonly<Record<string, string>>;
  hardRequirements?: readonly string[];
  priorityCategories?: readonly string[];
  assessmentVersion?: string;
  marriageBasics?: MarriageBasics;
  partnerCriteria?: PartnerCriteria;
  personalityAnswers?: Readonly<Record<string, string>>;
  personalityVersion?: string;
  beena?: BeenaProfile | null;
};

export function normalizeNationality(value: string): string {
  const key=value.trim().toLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة$/,'').replace(/\s+/g,' ');
  const aliases: Record<string,string> = {'السعودي':'سعودي','المملكة العربية السعودي':'سعودي','saudi':'سعودي','saudi arabia':'سعودي','saudi arabian':'سعودي','الامارات':'اماراتي','الامارات العربية المتحد':'اماراتي','emirati':'اماراتي','uae':'اماراتي','الكويت':'كويتي','kuwaiti':'كويتي','قطر':'قطري','qatari':'قطري','البحرين':'بحريني','bahraini':'بحريني','عمان':'عماني','omani':'عماني','اليمن':'يمني','yemeni':'يمني','مصر':'مصري','egyptian':'مصري','الاردن':'اردني','jordanian':'اردني','فلسطين':'فلسطيني','palestinian':'فلسطيني','سوريا':'سوري','syrian':'سوري','لبنان':'لبناني','lebanese':'لبناني','العراق':'عراقي','iraqi':'عراقي','السودان':'سوداني','sudanese':'سوداني','المغرب':'مغربي','moroccan':'مغربي','الجزائر':'جزائري','algerian':'جزائري','تونس':'تونسي','tunisian':'تونسي','ليبيا':'ليبي','libyan':'ليبي','موريتانيا':'موريتاني','mauritanian':'موريتاني','الصومال':'صومالي','somali':'صومالي'};
  return aliases[key] || key;
}

function criterionFit(member: PairProfile, peer: PairProfile, key: keyof PartnerCriteria): boolean | null {
  const rule = member.partnerCriteria?.[key];
  const basics = peer.marriageBasics ?? {};
  if (!rule || rule.mode === "any") return null;
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

function preferredCriteria(member: PairProfile, peer: PairProfile) {
  const keys = (Object.keys(member.partnerCriteria ?? {}) as (keyof PartnerCriteria)[])
    .filter(key => member.partnerCriteria?.[key]?.mode === "prefer" && !(key === "children" && member.partnerCriteria.children?.target === "any"));
  const known = keys.map(key => criterionFit(member, peer, key)).filter(value => value !== null);
  return { total: keys.length, covered: known.length, score: known.length ? known.filter(Boolean).length / known.length : null };
}

function personalityFit(first: PairProfile, second: PairProfile): NonNullable<MatchFit["personality"]> {
  const similarities: string[] = [], differences: string[] = [];
  const distances = new Map<string, number>();
  let sum = 0, covered = 0;
  for (const question of personalityCatalog) {
    const left = first.personalityAnswers?.[question.id] ?? " ", right = second.personalityAnswers?.[question.id] ?? " ";
    const a = /^[A-E]$/.test(left) ? "ABCDE".indexOf(left) : -1;
    const b = /^[A-E]$/.test(right) ? "ABCDE".indexOf(right) : -1;
    if (a < 0 || b < 0) continue;
    covered++;
    const distance = Math.abs(a - b);
    distances.set(question.id, distance);
    sum += 1 - distance / 4;
    (distance <= 1 ? similarities : differences).push(question.id);
  }
  const complete = covered === personalityCatalog.length && first.personalityVersion === "personality-v1" && second.personalityVersion === "personality-v1";
  return { version: "personality-v1", complete, covered, total: personalityCatalog.length,
    percentage: complete ? Math.round(100 * sum / covered) : null, similarities, differences,
    ...createPersonalityEvidence(distances, complete) };
}

type Dimension = typeof dimensions[number];
function answer(member: PairProfile, dim: Dimension, side: "self" | "partner") {
  const value = member.surveyAnswers?.[side === "self" ? dim.id : dim.partnerId];
  return dim.options.some(option => option.code === value) ? value : undefined;
}

function ageAccepted(age: number, member: PairProfile) {
  return Number.isInteger(age) && age >= 18 && age <= 110 &&
    age >= member.preferredMinAge && age <= member.preferredMaxAge;
}

function acceptsRequirements(member: PairProfile, peer: PairProfile) {
  return (member.hardRequirements ?? []).every(id => {
    const dim = dimensions.find(item => item.id === id && item.hardAllowed);
    if (!dim) return false;
    const required = answer(member, dim, "partner");
    return required !== undefined && required === answer(peer, dim, "self");
  });
}

function canShareCity(first: PairProfile, second: PairProfile) {
  const plans = [first.surveyAnswers?.residence_plan, second.surveyAnswers?.residence_plan];
  return plans.every(code => code === "A" || code === "B" || code === "C")
    && plans.some(code => code === "B" || code === "C");
}

// Compare what the asker wants with what the other person actually reported. Missing
// answers carry no points and are excluded from both the numerator and denominator.
function directedFit(member: PairProfile, peer: PairProfile) {
  let numerator = 0;
  let denominator = 0;
  for (const category of categories) {
    let known = 0;
    let matches = 0;
    for (const dim of dimensions.filter(item => item.category === category.id)) {
      const want = answer(member, dim, "partner");
      const observed = answer(peer, dim, "self");
      if (!want || !observed) continue;
      known++;
      if (want === observed) matches++;
    }
    if (!known) continue;
    const weight = category.weight * (member.priorityCategories?.includes(category.id) ? 2 : 1);
    numerator += weight * matches / known;
    denominator += weight;
  }
  if (!denominator) return null;
  const criteria = preferredCriteria(member, peer);
  return criteria.score === null ? numerator / denominator : (numerator / denominator) * 0.8 + criteria.score * 0.2;
}

export function comparePreferences(first: PairProfile, second: PairProfile) {
  const sameCity = first.city.trim() === second.city.trim();
  if (
    first.id === second.id || first.gender === second.gender ||
    !first.city.trim() || !second.city.trim() ||
    (!sameCity && !canShareCity(first, second)) ||
    !ageAccepted(first.age, second) || !ageAccepted(second.age, first) ||
    !acceptsRequirements(first, second) || !acceptsRequirements(second, first) ||
    !acceptsCriteria(first, second) || !acceptsCriteria(second, first)
  ) return null;
  const result = describeFit(first, second);
  if (!result.reasons.length) result.reasons.push(sameCity
    ? "تتوافق مدينتكما والفئة العمرية التي اختارها كلٌّ منكما."
    : "يتوافق عمركما مع التفضيلات التي اخترتماها، وتتيح اختيارات السكن مدينة مشتركة.");
  return result;
}

// Existing conversations can still explain the pair's answers after an eligibility preference changes.
export function describeFit(first: PairProfile, second: PairProfile) {
  const strengths: string[] = [];
  const discussion: string[] = [];
  const missing: string[] = [];
  const coveredCategories = new Set<string>();
  const reasons: string[] = [];
  for (const dim of dimensions) {
    const selfA = answer(first, dim, "self");
    const selfB = answer(second, dim, "self");
    const wantA = answer(first, dim, "partner");
    const wantB = answer(second, dim, "partner");
    if (!selfA || !selfB || !wantA || !wantB) { missing.push(dim.id); continue; }
    coveredCategories.add(dim.category);
    if (wantA === selfB && wantB === selfA) {
      strengths.push(dim.id);
      reasons.push(dim.reason);
    } else { discussion.push(dim.id); }
  }
  const covered = strengths.length + discussion.length;
  const provisional = covered < 5 || coveredCategories.size < 3;
  const forward = directedFit(first, second);
  const reverse = directedFit(second, first);
  const reciprocal = forward === null || reverse === null ? 0 : Math.sqrt(forward * reverse);
  const band: MatchFit["band"] = provisional ? "insufficient" : reciprocal >= 0.75 ? "strong" : reciprocal >= 0.45 ? "mixed" : "explore";
  const assessmentComplete = covered === dimensions.length && dimensions.length > 0 &&
    first.assessmentVersion === assessmentVersion && second.assessmentVersion === assessmentVersion;
  const forwardCriteria = preferredCriteria(first, second), reverseCriteria = preferredCriteria(second, first);
  const fit: MatchFit = { version: assessmentVersion, band, provisional, covered, total: dimensions.length, strengths, discussion, missing,
    assessmentComplete, percentage: assessmentComplete ? Math.round(reciprocal * 100) : null,
    criteria: { covered: forwardCriteria.covered + reverseCriteria.covered, total: forwardCriteria.total + reverseCriteria.total },
    personality: personalityFit(first, second), beena: compareBeena(first.beena, second.beena) };
  const sharedInterests = interests.filter(interest =>
    first.interestIds?.includes(interest.id) && second.interestIds?.includes(interest.id));
  for (const interest of sharedInterests) reasons.push("اهتمام مشترك: " + interest.label);
  const rankValue = reciprocal * Math.sqrt(covered / dimensions.length) * beenaRankMultiplier(fit.beena);
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
