import catalog from "./personality-catalog.json" with { type: "json" };

export const personalityVersion = "personality-v1" as const;
export const personalityOptions = [
  { code: "A", label: "لا يشبهني إطلاقًا" },
  { code: "B", label: "يشبهني قليلًا" },
  { code: "C", label: "يشبهني أحيانًا" },
  { code: "D", label: "يشبهني غالبًا" },
  { code: "E", label: "يشبهني كثيرًا" },
];
export const personalityQuestions = catalog.map(question => ({ ...question, options: personalityOptions }));
