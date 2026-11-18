import type { PublicPerson } from '../community/data';
import { dimensions } from '../compatibility/model';
import { readPreferenceEvidence } from '../compatibility/preference-evidence';
import { marriageTimelineLabels } from '../compatibility/marriage';
import { selectedDiscoveryLine } from './profilePrompts';

const practicalTopics = [
  ['relocation', 'مدينة الاستقرار تحتاج حديثًا بينكما.'],
  ['children_intent', 'تختلف رغبتكما في الإنجاب.'],
  ['required_criterion', 'أحد التفضيلات الأساسية يحتاج حديثًا بينكما.'],
  ['age_range', 'العمر خارج النطاق المفضّل لأحدكما.'],
  ['location_unknown', 'مدينة الاستقرار لم تتضح بعد.'],
] as const;

export function privateDiscoveryIntro(person: PublicPerson) {
  if (person.portrait || person.publicAvatar || person.demoPhoto?.startsWith('/demo/portraits/')) return null;
  const quote = selectedDiscoveryLine(person);
  const timeline = person.marriageBasics?.marriageTimeline;
  const fact = person.marriageIntent || (timeline && marriageTimelineLabels[timeline]) || person.occupation || person.education || person.city;
  return { label: quote ? 'أحب أن تعرف عنّي' : 'من ملفي', line: quote || fact };
}

export function decisionContext(person: PublicPerson) {
  const personalLine = [selectedDiscoveryLine(person), person.lifeTogether, person.bio, person.valuesStatement, person.lookingFor]
    .find(value => value?.trim())?.trim();
  const fit = person.fit;
  const practical = practicalTopics.find(([id]) => fit?.practicalConcerns?.includes(id));
  if (practical) return { personalLine, context: practical[1] };
  if (person.familyPreference?.trim()) return { personalLine, context: 'إشراك الأهل · ' + person.familyPreference.trim() };
  const topic = fit && readPreferenceEvidence(fit).topics.find(item => ['different', 'one_sided', 'conditional', 'discussion'].includes(item.status));
  const title = topic && dimensions.find(item => item.id === topic.id)?.title;
  return { personalLine, context: title ? 'موضوع للحوار · ' + title : undefined };
}
