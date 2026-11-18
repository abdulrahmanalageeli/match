import type { PublicPerson } from '../community/data';
import { dimensions } from '../compatibility/model';
import { readPreferenceEvidence } from '../compatibility/preference-evidence';

const practicalTopics = [
  ['relocation', 'مدينة الاستقرار تحتاج حديثًا بينكما.'],
  ['children_intent', 'تختلف رغبتكما في الإنجاب.'],
  ['required_criterion', 'أحد التفضيلات الأساسية يحتاج حديثًا بينكما.'],
  ['age_range', 'العمر خارج النطاق المفضّل لأحدكما.'],
  ['location_unknown', 'مدينة الاستقرار لم تتضح بعد.'],
] as const;

export function decisionContext(person: PublicPerson) {
  const personalLine = [person.lifeTogether, person.bio, person.valuesStatement, person.lookingFor]
    .find(value => value?.trim())?.trim();
  const fit = person.fit;
  const practical = practicalTopics.find(([id]) => fit?.practicalConcerns?.includes(id));
  if (practical) return { personalLine, context: practical[1] };
  if (person.familyPreference?.trim()) return { personalLine, context: 'إشراك الأهل · ' + person.familyPreference.trim() };
  const topic = fit && readPreferenceEvidence(fit).topics.find(item => ['different', 'one_sided', 'conditional', 'discussion'].includes(item.status));
  const title = topic && dimensions.find(item => item.id === topic.id)?.title;
  return { personalLine, context: title ? 'موضوع للحوار · ' + title : undefined };
}
