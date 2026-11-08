import { dimensions, personalityPercentage, preferencePercentage, type MatchFit } from './model.ts';
import { beenaScenarios } from '../beena/model.ts';
import { readPreferenceEvidence } from './preference-evidence.ts';
import { personalityDomains, personalityTopics, validatedPersonalityEvidence } from './personality-analysis.ts';

export type CompatibilityScoreKey = 'preferences' | 'personality' | 'beena';
type Section = { score: number; method: string; topics: [string, string][]; metrics: [string, number][] };
export type CompatibilitySnapshot = { key: string; sections: Partial<Record<CompatibilityScoreKey, Section>> };
export type CompatibilityChange = {
  key: string;
  summary: string;
  scoreChanges: { key: CompatibilityScoreKey; label: string; before: number; after: number }[];
  reasons: string[];
};
const labels: Record<CompatibilityScoreKey, string> = {
  preferences: 'توافق التفضيلات', personality: 'انسجام الشخصية', beena: 'توافق بيننا',
};
const order = ['preferences', 'personality', 'beena'] as const;

/** Keep only complete, authorized derived results, with a deterministic order. */
export function compatibilitySnapshot(fit?: MatchFit | null): CompatibilitySnapshot | null {
  if (!fit) return null;
  const sections: CompatibilitySnapshot['sections'] = {};
  const preference = preferencePercentage(fit), evidence = readPreferenceEvidence(fit);
  if (preference !== null && evidence.source !== 'unavailable') {
    const statuses = new Map(evidence.topics.map(topic => [topic.id, topic.status]));
    sections.preferences = { score: preference, method: `${fit.version}:${evidence.source}`, topics: dimensions.flatMap(topic => {
      const status = statuses.get(topic.id); return status ? [[topic.id, status] as [string, string]] : [];
    }), metrics: evidence.criteria ? [
      ['matched', evidence.criteria.matched], ['different', evidence.criteria.different],
      ['missing', evidence.criteria.missing], ['total', evidence.criteria.total],
    ] : [] };
  }
  const personality = personalityPercentage(fit), personalityFit = fit.personality;
  if (personality !== null && personalityFit) {
    const analysis = validatedPersonalityEvidence(personalityFit);
    sections.personality = { score: personality, method: analysis?.method ?? 'legacy',
      topics: Object.keys(personalityTopics).flatMap(id => personalityFit.similarities?.includes(id) ? [[id, 'aligned'] as [string, string]]
        : personalityFit.differences?.includes(id) ? [[id, 'discussion'] as [string, string]] : []),
      metrics: analysis ? [
        ...personalityDomains.map(domain => [domain.id, analysis.domains.find(item => item.id === domain.id)!.percentage!] as [string, number]),
        ...(['same', 'near', 'different', 'far', 'opposite'] as const).map(key => [key, analysis.distribution[key]] as [string, number]),
      ] : [],
    };
  }
  const beena = fit.beena;
  if (beena?.version === 'beena-v1' && beena.complete && beena.total === beenaScenarios.length && beena.covered === beena.total
    && typeof beena.percentage === 'number' && Number.isFinite(beena.percentage) && beena.percentage >= 0 && beena.percentage <= 100
    && Array.isArray(beena.aligned) && Array.isArray(beena.discussion)) {
    const outcomes = [...beena.aligned, ...beena.discussion];
    if (outcomes.length === beena.total && new Set(outcomes).size === beena.total && outcomes.every(id => beenaScenarios.some(scenario => scenario.id === id))) {
      sections.beena = { score: Math.round(beena.percentage), method: beena.version,
        topics: beenaScenarios.map(scenario => [scenario.id, beena.aligned.includes(scenario.id) ? 'aligned' : 'discussion']), metrics: [] };
    }
  }
  return Object.keys(sections).length ? { key: JSON.stringify(sections), sections } : null;
}

/** A first result, missing review data, or a new scoring method is a baseline, not an answer-change alert. */
export function compareCompatibility(before?: CompatibilitySnapshot | null, after?: CompatibilitySnapshot | null): CompatibilityChange | null {
  if (!before || !after || before.key === after.key) return null;
  const scoreChanges: CompatibilityChange['scoreChanges'] = [], reasons: string[] = [];
  const sectionReasons: Partial<Record<CompatibilityScoreKey, string>> = {};
  for (const key of order) {
    const previous = before.sections[key], next = after.sections[key];
    if (!previous || !next || previous.method !== next.method) continue;
    const reasonStart = reasons.length;
    if (previous.score !== next.score) scoreChanges.push({ key, label: labels[key], before: previous.score, after: next.score });
    const oldTopics = new Map(previous.topics), changed = next.topics.filter(([id, status]) => oldTopics.has(id) && oldTopics.get(id) !== status);
    for (const [id, status] of changed) {
      const title = key === 'preferences' ? dimensions.find(topic => topic.id === id)?.title
        : key === 'personality' ? personalityTopics[id]?.title : beenaScenarios.find(scenario => scenario.id === id)?.title;
      if (!title) continue;
      const detail = status === 'aligned' ? key === 'personality' ? 'أصبحت إجاباتكما أقرب' : key === 'beena' ? 'أصبح التصرف مقبولًا من الطرفين' : 'أصبح التوافق متبادلًا'
        : status === 'one_sided' ? 'أصبح التقارب في اتجاه واحد'
        : status === 'different' ? 'أظهرت الإجابات احتياجات مختلفة'
        : 'أصبح مساحة تستحق الحديث';
      reasons.push(`${title}: ${detail}.`);
    }
    const metricsChanged = JSON.stringify(previous.metrics) !== JSON.stringify(next.metrics);
    if (!changed.length && metricsChanged) {
      if (key === 'preferences') reasons.push('تغيّر التوافق في التفضيلات الإضافية التي اخترتما أن يكون لها وزن.');
      if (key === 'personality') {
        const oldMetrics = new Map(previous.metrics), newMetrics = new Map(next.metrics);
        const domains = personalityDomains.filter(domain => oldMetrics.get(domain.id) !== newMetrics.get(domain.id));
        if (domains.length) reasons.push(`تغيّر تقارب الإجابات في ${domains.map(domain => domain.title).join('، ')}.`);
        else reasons.push('تغيّر توزيع تقارب الإجابات في تقييم الشخصية.');
      }
    }
    if (!changed.length && !metricsChanged && previous.score !== next.score) {
      reasons.push(key === 'preferences' ? 'أُعيد احتساب التفضيلات وفق الإجابات والأولويات المحفوظة.'
        : key === 'personality' ? 'أُعيد احتساب انسجام الشخصية من درجات تقارب الإجابات.'
        : 'تغيّر التقبّل المتبادل في المواقف وفق الاختيارات وأهميتها.');
    }
    if (reasons.length > reasonStart) sectionReasons[key] = reasons[reasonStart];
  }
  return scoreChanges.length || reasons.length ? { key: `${before.key}>${after.key}`, scoreChanges, reasons,
    summary: (scoreChanges[0] && sectionReasons[scoreChanges[0].key]) || reasons[0] } : null;
}
