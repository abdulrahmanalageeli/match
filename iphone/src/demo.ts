import { interests, rankPreferences } from "./compatibility/model";
import type { Profile, Proposal } from "./types";

// These fictional answers go through the same eligibility and ranking rules as discovery.
const exhibition = [
  { id: "sample-1", man: ["راشد", "مهندس معماري"], woman: ["ريم", "مهندسة معمارية"], age: 31,
    bio: "أحب المشي في الصباح والبيوت القديمة. أتطلع إلى حياة قريبة من الأهل، فيها مساحة لكل واحد منّا.",
    interestIds: ["walking", "reading"], planning: "A", repair: "B", timeline: "B" },
  { id: "sample-2", man: ["عمر", "مدير مشاريع"], woman: ["مها", "مديرة مشاريع"], age: 33,
    bio: "أستمتع بتجربة وصفة جديدة في عطلة الأسبوع وأجد راحتي في الجلسات العائلية.",
    interestIds: ["cooking", "travel"], planning: "C", repair: "C", timeline: "A" },
];
export function demoProposals(viewer: Profile): Proposal[] {
  const gender = viewer.gender === "woman" ? "man" : "woman";
  const candidates = exhibition.map(person => ({
    ...person, gender: gender as Profile["gender"], city: "الرياض", preferredMinAge: 24, preferredMaxAge: 40,
    surveyAnswers: {
      children_plan: "A", partner_children_plan: "A", residence_plan: "C", partner_residence_plan: "C",
      marriage_timeline: person.timeline, partner_marriage_timeline: person.timeline,
      weekly_planning: person.planning, partner_weekly_planning: person.planning,
      closeness_pace: "B", partner_closeness_pace: "B", shared_budget: "B", partner_shared_budget: "B",
      repair_after_conflict: person.repair, partner_repair_after_conflict: person.repair,
      match_disagreement_style: "B", partner_match_disagreement_style: "B",
    },
  }));
  return rankPreferences({ ...viewer, id: "demo-viewer" }, candidates).map(({ person, fit, reasons }) => {
    const [alias, occupation] = person[gender];
    return { id: person.id, alias, occupation, age: person.age, city: person.city, bio: person.bio, fit, reasons,
      demoPhoto: gender === "woman" ? `/demo/portraits/${person.id === "sample-1" ? "reem" : "maha"}-realistic-v2.webp` : undefined,
      interests: interests.filter(item => person.interestIds.includes(item.id)).map(item => item.label), status: "pending" };
  });
}
