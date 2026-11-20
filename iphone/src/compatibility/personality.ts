import catalog from "./personality-catalog.json" with { type: "json" };
import legacyCatalog from "./personality-catalog-v1.json" with { type: "json" };

export const personalityVersion = "personality-v2" as const;
export const personalityOptions = [
  { code: "A", label: "لا يشبهني إطلاقًا" },
  { code: "B", label: "لا يشبهني كثيرًا" },
  { code: "C", label: "يشبهني إلى حد ما" },
  { code: "D", label: "يشبهني" },
  { code: "E", label: "يشبهني كثيرًا" },
];
const legacyLabels = ["لا يشبهني إطلاقًا", "يشبهني قليلًا", "يشبهني أحيانًا", "يشبهني غالبًا", "يشبهني كثيرًا"];
export const legacyPersonalityOptions = personalityOptions.map((option, i) => ({ ...option, label: legacyLabels[i] }));
const legacyQuestions = legacyCatalog.map(question => ({ ...question, options: legacyPersonalityOptions }));
export const personalityQuestions = catalog.map(question => ({ ...question, options: personalityOptions }));
export function personalityQuestionsFor(version: string | undefined) {
  return version === "personality-v1" ? legacyQuestions : personalityQuestions;
}

const domains = [
  ["stability", "التعامل مع الضغط", "هدوء أسرع بعد الضغط"],
  ["reliability", "التنظيم والوفاء بالالتزامات", "ميل أكبر للتجهيز وإتمام الالتزامات"],
  ["warmth", "مراعاة الآخرين", "ميل أكبر لفهم وجهة نظر الآخر وإصلاح الخطأ"],
  ["social_energy", "الطاقة الاجتماعية", "طاقة أكبر في التجمعات ومبادرة أكثر في الحديث"],
  ["openness", "الانفتاح على التجربة", "اهتمام أكبر بالأفكار والتجارب الجديدة"],
] as const;

export function personalityProfile(version: string | undefined, answers: Readonly<Record<string, string>> = {}) {
  if (version !== personalityVersion) return [];
  return domains.flatMap(([id, label, upperAnchor]) => {
    const items = catalog.filter(item => item.domain === id);
    let sum = 0;
    for (const item of items) {
      const index = personalityOptions.findIndex(option => option.code === answers[item.id]);
      if (index < 0) return [];
      sum += item.reverse ? 5 - index : 1 + index;
    }
    return [{ id, label, upperAnchor, mean: sum / items.length }];
  });
}

export const partnerTraitRanges = [
  { code: "A", low: 1, high: 2 },
  { code: "C", low: 2, high: 4 },
  { code: "E", low: 4, high: 5 },
] as const;

export const partnerTraitQuestions = domains.map(([id, label], index) => ({
  id: "partner_" + id, label,
  options: [
    ["يتأثر بالضغط ويحتاج وقتًا ليهدأ", "يتفاوت هدوؤه بحسب الموقف", "يستعيد هدوءه بسرعة"],
    ["أقل ميلًا للتخطيط والمتابعة", "يوازن بين التخطيط والتصرف حسب الموقف", "يخطط مبكرًا ويتابع التزاماته"],
    ["أقل ميلًا لمراعاة وجهة النظر الأخرى عند الخلاف", "تختلف استجابته بحسب الخلاف", "يحرص على فهم الطرف الآخر وإصلاح الخطأ"],
    ["يرتاح أكثر في الأجواء الهادئة", "يستمتع بمزيج من الهدوء والتجمعات", "تنشّطه التجمعات ويبادر بالحديث"],
    ["يميل إلى المألوف", "يجمع بين المألوف والتجديد", "يحب استكشاف أفكار وتجارب جديدة"],
  ][index],
}));

type TraitAnswers = { personalityVersion?: string; personalityAnswers?: Readonly<Record<string, string>> };

function directionalTraitFit(preferences: TraitAnswers, partner: ReturnType<typeof personalityProfile>) {
  const distances = partner.flatMap(({ id, mean }) => {
    const desired = partnerTraitRanges.find(r => r.code === preferences.personalityAnswers?.["partner_" + id]);
    // Distances in item-sum units keep the three-item boundaries exact.
    return desired ? [Math.max(0, desired.low * 3 - Math.round(mean * 3), Math.round(mean * 3) - desired.high * 3)] : [];
  });
  return distances.length ? 1 - distances.reduce((sum, n) => sum + n, 0) / (9 * distances.length) : null;
}

export function reciprocalTraitFit(first: TraitAnswers, second: TraitAnswers) {
  const a = personalityProfile(first.personalityVersion, first.personalityAnswers);
  const b = personalityProfile(second.personalityVersion, second.personalityAnswers);
  if (a.length !== domains.length || b.length !== domains.length) return null;
  const forward = directionalTraitFit(first, b), reverse = directionalTraitFit(second, a);
  return forward === null || reverse === null ? null : Math.sqrt(forward * reverse);
}

export function traitRankMultiplier(fit: number | null) {
  return fit === null ? 1 : 0.98 + 0.04 * fit;
}
