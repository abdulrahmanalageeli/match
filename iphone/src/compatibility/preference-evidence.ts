import catalog from './catalog.json' with { type: 'json' };
import type { MatchFit } from './model.ts';

export type PreferenceTopicStatus = 'aligned' | 'one_sided' | 'different' | 'missing';
export type PreferenceTopic = { id: string; status: PreferenceTopicStatus };
export type PreferenceCategory = { id: string; covered: number; total: number; aligned: number; discussion: number };
export type PreferenceCriteria = { matched: number; different: number; missing: number; total: number };
export type PreferenceEvidence = {
  version: 'preference-evidence-v1';
  method: 'reciprocal-weighted-v1';
  topics: PreferenceTopic[];
  categories: PreferenceCategory[];
  criteria: PreferenceCriteria;
};
export type PreferenceReadout = {
  source: 'evidenced' | 'legacy' | 'unavailable';
  topics: { id: string; status: PreferenceTopicStatus | 'discussion' }[];
  categories: PreferenceCategory[];
  criteria: PreferenceCriteria | null;
};

const ids = new Set(catalog.dimensions.map(dimension => dimension.id));
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown, maximum = catalog.dimensions.length): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= maximum;
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

/** These are unweighted topic counts, never a second compatibility percentage. */
export function preferenceCategoryCounts(topics: PreferenceReadout['topics']): PreferenceCategory[] {
  return catalog.categories.map(category => {
    const categoryIds = new Set(catalog.dimensions.filter(dimension => dimension.category === category.id).map(dimension => dimension.id));
    const entries = topics.filter(topic => categoryIds.has(topic.id));
    const aligned = entries.filter(topic => topic.status === 'aligned').length;
    const discussion = entries.filter(topic => topic.status !== 'aligned' && topic.status !== 'missing').length;
    return { id: category.id, covered: aligned + discussion, total: entries.length, aligned, discussion };
  });
}

function validPartition(fit: MatchFit): boolean {
  if (!['marriage-v1', 'marriage-v2'].includes(fit.version) || !count(fit.covered) || !count(fit.total) || fit.total === 0) return false;
  if (![fit.strengths, fit.discussion, fit.missing].every(values => Array.isArray(values) && values.every(id => typeof id === 'string' && ids.has(id)))) return false;
  const all = [...fit.strengths, ...fit.discussion, ...fit.missing];
  return new Set(all).size === all.length && all.length === fit.total && fit.covered === fit.strengths.length + fit.discussion.length;
}

/** Fail closed if the explanation disagrees with the score's coverage/outcome metadata. */
export function validatedPreferenceEvidence(fit: MatchFit): PreferenceEvidence | null {
  const evidence: unknown = fit.preferenceEvidence;
  if (!validPartition(fit) || fit.total !== catalog.dimensions.length || !record(evidence)
    || !exactKeys(evidence, ['version','method','topics','categories','criteria'])
    || evidence.version !== 'preference-evidence-v1' || evidence.method !== 'reciprocal-weighted-v1'
    || !Array.isArray(evidence.topics) || evidence.topics.length !== catalog.dimensions.length
    || !Array.isArray(evidence.categories) || evidence.categories.length !== catalog.categories.length) return null;
  const topics: PreferenceTopic[] = [];
  for (const topic of evidence.topics) {
    if (!record(topic) || !exactKeys(topic, ['id','status']) || typeof topic.id !== 'string' || !ids.has(topic.id)
      || !['aligned','one_sided','different','missing'].includes(topic.status as string)) return null;
    const status = topic.status as PreferenceTopicStatus;
    const matchingPartition = status === 'aligned' ? fit.strengths : status === 'missing' ? fit.missing : fit.discussion;
    if (!matchingPartition.includes(topic.id)) return null;
    topics.push({ id: topic.id, status });
  }
  if (new Set(topics.map(topic => topic.id)).size !== topics.length) return null;
  const categories = preferenceCategoryCounts(topics);
  for (const category of evidence.categories) {
    if (!record(category) || !exactKeys(category, ['id','covered','total','aligned','discussion'])) return null;
    const expected = categories.find(item => item.id === category.id);
    if (!expected || ['covered','total','aligned','discussion'].some(key => category[key] !== expected[key as keyof PreferenceCategory])) return null;
  }
  if (new Set(evidence.categories.map(category => category.id)).size !== categories.length) return null;
  const criteria = evidence.criteria;
  if (!record(criteria) || !exactKeys(criteria, ['matched','different','missing','total'])
    || !count(criteria.total, 24) || !count(criteria.matched, 24) || !count(criteria.different, 24) || !count(criteria.missing, 24)
    || criteria.matched + criteria.different + criteria.missing !== criteria.total
    || !fit.criteria || fit.criteria.total !== criteria.total || fit.criteria.covered !== criteria.matched + criteria.different) return null;
  return { version: 'preference-evidence-v1', method: 'reciprocal-weighted-v1', topics, categories,
    criteria: { matched: criteria.matched, different: criteria.different, missing: criteria.missing, total: criteria.total } };
}

/** Old fits retain their broad outcome labels; they cannot claim one-sided evidence. */
export function readPreferenceEvidence(fit: MatchFit): PreferenceReadout {
  const verified = validatedPreferenceEvidence(fit);
  if (verified) return { source: 'evidenced', topics: verified.topics, categories: verified.categories, criteria: verified.criteria };
  if (fit.preferenceEvidence !== undefined || !validPartition(fit)) return { source: 'unavailable', topics: [], categories: [], criteria: null };
  const topics: PreferenceReadout['topics'] = catalog.dimensions.flatMap(dimension => {
    const status = fit.strengths.includes(dimension.id) ? 'aligned' : fit.discussion.includes(dimension.id) ? 'discussion' : fit.missing.includes(dimension.id) ? 'missing' : null;
    return status ? [{ id: dimension.id, status }] : [];
  });
  return { source: 'legacy', topics, categories: preferenceCategoryCounts(topics), criteria: null };
}
