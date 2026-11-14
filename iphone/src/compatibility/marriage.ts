import { skinTones, dressStyles, dressFlexibilities, type SkinTone, type DressStyle, type DressFlexibility } from "./appearance.ts";
import { educationOptions, professionOptions } from '../profile/profileOptions.ts';

export type CriteriaMode = "any" | "prefer" | "require";
export type MarriageBasics = {
  heightCm?: number;
  weightKg?: number;
  tribalBackground?: "tribal" | "non_tribal" | "prefer_not_to_say";
  tribeName?: string;
  nationality?: string;
  spokenLanguages?: string[];
  preferredLanguage?: string;
  languageOpenness?: "shared_required" | "open_to_learning" | "flexible";
  maritalStatus?: "never_married" | "divorced" | "widowed" | "married";
  currentWives?: 1 | 2 | 3 | 4;
  polygynyPreference?: "not_open" | "open_to_discussion" | "open" | "prefer_not_to_say";
  religiousAffiliation?: "sunni" | "shia" | "other" | "prefer_not_to_say";
  prayerPractice?: "regular" | "working_on_consistency" | "private" | "prefer_not_to_say";
  marriageTimeline?: "within_3_months" | "three_to_six_months" | "six_to_twelve_months" | "over_a_year" | "when_ready";
  meetingPreference?: "public_before_formal" | "family_before_formal" | "after_formal" | "discuss_together";
  childrenCount?: number;
  smoking?: "never" | "cigarettes" | "vape" | "shisha" | "sometimes" | "yes";
  skinTone?: SkinTone;
  dressStyle?: DressStyle;
  dressFlexibility?: DressFlexibility;
};
export type RangeCriterion = { mode: CriteriaMode; min?: number; max?: number };
export type PartnerCriteria = {
  sharedLanguage?: { mode: CriteriaMode };
  height?: RangeCriterion;
  weight?: RangeCriterion;
  tribalBackground?: { mode: CriteriaMode; target?: "tribal" | "non_tribal" | "same_tribe" };
  nationality?: { mode: CriteriaMode; values?: string[]; exclude?: boolean };
  education?: { mode: CriteriaMode; values?: string[] };
  profession?: { mode: CriteriaMode; values?: string[] };
  maritalStatus?: { mode: CriteriaMode; values?: NonNullable<MarriageBasics["maritalStatus"]>[] };
  children?: { mode: CriteriaMode; target?: "none" | "any" };
  smoking?: { mode: CriteriaMode; target?: "never" };
  skinTone?: { mode: CriteriaMode; values?: SkinTone[] };
  dressStyle?: { mode: CriteriaMode; values?: DressStyle[] };
  dressFlexibility?: { mode: CriteriaMode; target?: "open_to_discussion" | "open_to_change" };
};

export const languageOptions = ["العربية", "الإنجليزية", "الفرنسية", "الإسبانية", "الألمانية", "التركية", "الأردية", "الفارسية", "الهندية", "البنغالية", "الإندونيسية", "الملايوية", "الصينية", "الروسية", "السواحيلية", "لغة الإشارة"] ;
export const languageOpennessLabels = { shared_required: "أفضّل أن نتحدث لغة مشتركة", open_to_learning: "منفتح على تعلّم لغة الشريك", flexible: "مرن، نتفق على ما يناسبنا" };

export const nationalityOptions = ['سعودي', 'إماراتي', 'كويتي', 'قطري', 'بحريني', 'عُماني', 'يمني', 'مصري', 'أردني', 'فلسطيني', 'سوري', 'لبناني', 'عراقي', 'سوداني', 'مغربي', 'جزائري', 'تونسي', 'ليبي', 'موريتاني', 'صومالي'] as const;

export const polygynyLabels = { not_open: 'لا أرغب في التعدد', open_to_discussion: 'منفتح على النقاش', open: 'منفتح على التعدد', prefer_not_to_say: 'أفضل مناقشته لاحقًا' };
export const religiousAffiliationLabels = { sunni: 'سنّي', shia: 'شيعي', other: 'مذهب آخر', prefer_not_to_say: 'أفضل عدم الإفصاح' };
export const prayerPracticeLabels = { regular: 'أحافظ على الصلوات', working_on_consistency: 'أسعى إلى الانتظام', private: 'أفضل مناقشتها عند التعارف', prefer_not_to_say: 'أفضل عدم الإفصاح' };
export const marriageTimelineLabels = { within_3_months: 'خلال ٣ أشهر', three_to_six_months: 'خلال ٣–٦ أشهر', six_to_twelve_months: 'خلال ٦–١٢ شهرًا', over_a_year: 'بعد أكثر من سنة', when_ready: 'حسب التوافق والاستعداد' };
export const meetingPreferenceLabels = { public_before_formal: 'أفضل لقاءً في مكان عام قبل الخطوة الرسمية', family_before_formal: 'أفضل لقاءً بحضور الأهل قبل الخطوة الرسمية', after_formal: 'أفضل أن يكون اللقاء بعد الخطوة الرسمية', discuss_together: 'أفضل الاتفاق على ذلك معًا' };

export const criteriaModes = [
  { value: "any", label: "لا يهمني" },
  { value: "prefer", label: "أفضل" },
  { value: "require", label: "شرط أساسي" },
] as const;

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const oneOf = (value: unknown, values: string[]) => typeof value === "string" && values.includes(value);

export function validMarriageBasics(value: unknown, allowIncomplete = false): value is MarriageBasics {
  if (!object(value)) return false;
  const allowed = ["spokenLanguages", "preferredLanguage", "languageOpenness", "heightCm", "weightKg", "tribalBackground", "tribeName", "nationality", "maritalStatus", "currentWives", "polygynyPreference", "religiousAffiliation", "prayerPractice", "marriageTimeline", "meetingPreference", "childrenCount", "smoking", "skinTone", "dressStyle", "dressFlexibility"];
  if (Object.keys(value).some(key => !allowed.includes(key))) return false;
  if (value.spokenLanguages !== undefined && (!Array.isArray(value.spokenLanguages) || value.spokenLanguages.length > languageOptions.length || new Set(value.spokenLanguages).size !== value.spokenLanguages.length || !value.spokenLanguages.every(v => oneOf(v, languageOptions)))) return false;
  if (value.preferredLanguage !== undefined && !oneOf(value.preferredLanguage, languageOptions)) return false;
  if (value.languageOpenness !== undefined && !oneOf(value.languageOpenness, Object.keys(languageOpennessLabels))) return false;
  if (value.heightCm !== undefined && !(allowIncomplete ? Number.isSafeInteger(value.heightCm) : integer(value.heightCm, 120, 230))) return false;
  if (value.weightKg !== undefined && !(allowIncomplete ? Number.isSafeInteger(value.weightKg) : integer(value.weightKg, 35, 250))) return false;
  if (value.childrenCount !== undefined && !(allowIncomplete ? Number.isSafeInteger(value.childrenCount) : integer(value.childrenCount, 0, 20))) return false;
  if (value.tribalBackground !== undefined && !oneOf(value.tribalBackground, ["tribal", "non_tribal", "prefer_not_to_say"])) return false;
  if (value.maritalStatus !== undefined && !oneOf(value.maritalStatus, ["never_married", "divorced", "widowed", "married"])) return false;
  if (value.currentWives !== undefined && (!integer(value.currentWives, 1, 4) || value.maritalStatus !== "married")) return false;
  if (!allowIncomplete && value.maritalStatus === "married" && value.currentWives === undefined) return false;
  if (value.polygynyPreference !== undefined && !oneOf(value.polygynyPreference, Object.keys(polygynyLabels))) return false;
  if (value.religiousAffiliation !== undefined && !oneOf(value.religiousAffiliation, Object.keys(religiousAffiliationLabels))) return false;
  if (value.prayerPractice !== undefined && !oneOf(value.prayerPractice, Object.keys(prayerPracticeLabels))) return false;
  if (value.marriageTimeline !== undefined && !oneOf(value.marriageTimeline, Object.keys(marriageTimelineLabels))) return false;
  if (value.meetingPreference !== undefined && !oneOf(value.meetingPreference, Object.keys(meetingPreferenceLabels))) return false;
  if (value.smoking !== undefined && !oneOf(value.smoking, ["never", "cigarettes", "vape", "shisha", "sometimes", "yes"])) return false;
  if (value.skinTone !== undefined && !skinTones.some(tone => tone.value === value.skinTone)) return false;
  if (value.dressStyle !== undefined && !dressStyles.some(style => style.value === value.dressStyle)) return false;
  if (value.dressFlexibility !== undefined && !dressFlexibilities.some(option => option.value === value.dressFlexibility)) return false;
  for (const key of ["tribeName", "nationality"]) {
    if (value[key] !== undefined && (typeof value[key] !== "string" || value[key].trim().length > 80)) return false;
  }
  return allowIncomplete || !value.tribeName || value.tribalBackground === "tribal";
}

export function validMarriageBasicsDraft(value: unknown): value is MarriageBasics {
  return validMarriageBasics(value, true);
}

export function validPartnerCriteria(value: unknown, basics: MarriageBasics = {}, allowIncomplete = false): value is PartnerCriteria {
  if (!object(value)) return false;
  for (const [key, rule] of Object.entries(value)) {
    if (key === "sharedLanguage") {
      if (!object(rule) || !oneOf(rule.mode, ["any", "prefer", "require"]) || Object.keys(rule).some(field => field !== "mode")) return false;
      if (!allowIncomplete && rule.mode !== "any" && !basics.spokenLanguages?.length) return false;
      continue;
    }
    if (!["height", "weight", "tribalBackground", "nationality", "education", "profession", "maritalStatus", "children", "smoking", "skinTone", "dressStyle", "dressFlexibility"].includes(key) || !object(rule) || !oneOf(rule.mode, ["any", "prefer", "require"])) return false;
    const keys = key === 'nationality' ? ['mode','values','exclude'] : key === "height" || key === "weight" ? ["mode", "min", "max"] : ["education", "profession", "maritalStatus", "skinTone", "dressStyle"].includes(key) ? ["mode", "values"] : ["mode", "target"];
    if (Object.keys(rule).some(field => !keys.includes(field))) return false;
    const required = rule.mode !== "any" && !allowIncomplete;
    if (key === "height" || key === "weight") {
      const bounds = key === "height" ? [120, 230] : [35, 250];
      if (required && rule.min === undefined && rule.max === undefined) return false;
      if (rule.min !== undefined && !(allowIncomplete ? Number.isSafeInteger(rule.min) : integer(rule.min, bounds[0], bounds[1]))) return false;
      if (rule.max !== undefined && !(allowIncomplete ? Number.isSafeInteger(rule.max) : integer(rule.max, bounds[0], bounds[1]))) return false;
      if (!allowIncomplete && typeof rule.min === "number" && typeof rule.max === "number" && rule.min > rule.max) return false;
    } else if (key === 'nationality') {
      if (rule.exclude !== undefined && typeof rule.exclude !== 'boolean') return false;
      if (rule.values !== undefined || required) {
        if (!Array.isArray(rule.values) || (required && !rule.values.length) || rule.values.length > 30 || new Set(rule.values).size !== rule.values.length || !rule.values.every(v=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=80)) return false;
      }
    } else if (key === "tribalBackground") {
      if ((required || rule.target !== undefined) && !oneOf(rule.target, ["tribal", "non_tribal", "same_tribe"])) return false;
      if (required && rule.target === "same_tribe" && (basics.tribalBackground !== "tribal" || !basics.tribeName?.trim())) return false;
    } else if (["education", "profession", "maritalStatus", "skinTone", "dressStyle"].includes(key)) {
      const choices = key === 'education' ? educationOptions.map(option => option.value) : key === 'profession' ? professionOptions.map(option => option.value) : key === "skinTone" ? skinTones.map(tone => tone.value) : key === "dressStyle" ? dressStyles.map(style => style.value) : ["never_married", "divorced", "widowed", "married"];
      if (rule.values !== undefined || required) {
        if (!Array.isArray(rule.values) || (required && !rule.values.length) || rule.values.length > choices.length || new Set(rule.values).size !== rule.values.length || !rule.values.every(v => oneOf(v, choices))) return false;
      }
    } else if (key === "children") {
      if ((required || rule.target !== undefined) && !oneOf(rule.target, ["none", "any"])) return false;
    } else if ((required || rule.target !== undefined) && !oneOf(rule.target, key === "dressFlexibility" ? ["open_to_discussion", "open_to_change"] : ["never"])) return false;
  }
  return true;
}

export function validPartnerCriteriaDraft(value: unknown): value is PartnerCriteria {
  return validPartnerCriteria(value, {}, true);
}
