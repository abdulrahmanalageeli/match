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
