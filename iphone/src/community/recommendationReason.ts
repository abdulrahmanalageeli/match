import { dimensions, preferencePercentage, type MatchFit } from '../compatibility/model.ts';
import { readPreferenceEvidence } from '../compatibility/preference-evidence.ts';

export function recommendationReason(fit?: MatchFit): string {
  if (!fit || preferencePercentage(fit) === null) return 'اكتشف الشخص أولًا؛ يتضح التوافق عند اكتمال التقييمين.';
  const evidence = readPreferenceEvidence(fit);
  const shared = evidence.topics.filter(topic => topic.status === 'aligned').slice(0, 2)
    .map(topic => dimensions.find(dimension => dimension.id === topic.id)?.title).filter(Boolean);
  return shared.length ? `من نقاط اتفاقكما: ${shared.join(' و')}.` : 'ضمن أعلى نسب توافق التفضيلات المتاحة لك؛ التفاصيل توضّح ما يحتاج حوارًا.';
}
