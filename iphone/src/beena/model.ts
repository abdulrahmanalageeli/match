import catalog from './catalog.json' with { type: 'json' };

export const beenaVersion = 'beena-v1' as const;
export const beenaScenarios = catalog;
export type BeenaAnswer = { self?: string; partner?: string[]; importance?: 1 | 2 };
export type BeenaStory = { scenarioId: string; text: string; share: boolean };
export type SharedBeenaStory = Pick<BeenaStory, 'scenarioId' | 'text'>;
export type BeenaProfile = { version: typeof beenaVersion; answers: Record<string, BeenaAnswer>; story?: BeenaStory };
export type BeenaFit = {
  version: typeof beenaVersion; covered: number; total: number; complete: boolean; percentage: number | null;
  aligned: string[]; discussion: string[];
  prompts: Array<{ scenarioId: string; kind: 'aligned' | 'discussion'; prompt: string }>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const optionCodes = new Map(beenaScenarios.map(s => [s.id, new Set(s.options.map(o => o.code))]));

/** Partial answers are valid drafts. Unknown fields/codes never enter a score. */
export function validBeenaProfile(value: unknown): value is BeenaProfile {
  if (!isRecord(value) || value.version !== beenaVersion || !isRecord(value.answers)
    || Object.keys(value).some(key => !['version', 'answers', 'story'].includes(key))) return false;
  if (Object.keys(value.answers).length > beenaScenarios.length) return false;
  for (const [id, answer] of Object.entries(value.answers)) {
    const codes = optionCodes.get(id);
    if (!codes || !isRecord(answer) || Object.keys(answer).some(key => !['self', 'partner', 'importance'].includes(key))) return false;
    if (answer.self !== undefined && (typeof answer.self !== 'string' || !codes.has(answer.self))) return false;
    if (answer.partner !== undefined && (!Array.isArray(answer.partner) || answer.partner.length > codes.size
      || new Set(answer.partner).size !== answer.partner.length
      || !answer.partner.every(code => typeof code === 'string' && codes.has(code)))) return false;
    if (answer.importance !== undefined && answer.importance !== 1 && answer.importance !== 2) return false;
  }
  if (value.story !== undefined) {
    const story = value.story;
    if (!isRecord(story) || Object.keys(story).some(key => !['scenarioId', 'text', 'share'].includes(key))
      || typeof story.scenarioId !== 'string' || !optionCodes.has(story.scenarioId)
      || typeof story.text !== 'string' || [...story.text].length > 500 || typeof story.share !== 'boolean') return false;
  }
  return true;
}

/** Public views receive only the story a member explicitly chose to share. */
export function sharedBeenaStory(profile?: BeenaProfile | null): SharedBeenaStory | undefined {
  if (!validBeenaProfile(profile) || !profile.story?.share || !profile.story.text.trim()) return undefined;
  return { scenarioId: profile.story.scenarioId, text: profile.story.text };
}

function answered(answer?: BeenaAnswer): answer is BeenaAnswer & { self: string; partner: string[] } {
  return Boolean(answer?.self && answer.partner?.length);
}

export function beenaProgress(profile?: BeenaProfile | null) {
  const total = beenaScenarios.length;
  const count = validBeenaProfile(profile) ? beenaScenarios.filter(s => answered(profile.answers[s.id])).length : 0;
  return { answered: count, total, complete: count === total };
}

/** Stated preferences, not an assumption that similarity or opposition is better.
 * Each person gets equal influence; their own importance weights apply within their direction.
 * Free text is never scored, inferred from, or sent to an AI provider here.
 */
export function compareBeena(first?: BeenaProfile | null, second?: BeenaProfile | null): BeenaFit {
  const result: BeenaFit = { version: beenaVersion, covered: 0, total: beenaScenarios.length, complete: false,
    percentage: null, aligned: [], discussion: [], prompts: [] };
  if (!validBeenaProfile(first) || !validBeenaProfile(second)) return result;
  let firstPoints = 0, firstWeight = 0, secondPoints = 0, secondWeight = 0;
  for (const scenario of beenaScenarios) {
    const a = first.answers[scenario.id], b = second.answers[scenario.id];
    if (!answered(a) || !answered(b)) continue;
    result.covered++;
    const aAccepts = a.partner.includes(b.self), bAccepts = b.partner.includes(a.self);
    const aw = a.importance ?? 1, bw = b.importance ?? 1;
    firstPoints += Number(aAccepts) * aw; firstWeight += aw;
    secondPoints += Number(bAccepts) * bw; secondWeight += bw;
    const kind = aAccepts && bAccepts ? 'aligned' : 'discussion';
    result[kind].push(scenario.id);
    result.prompts.push({ scenarioId: scenario.id, kind, prompt: scenario.prompt });
  }
  result.complete = result.covered === result.total;
  if (result.complete) result.percentage = Math.round(50 * (firstPoints / firstWeight + secondPoints / secondWeight));
  return result;
}

/** A complete Beena result only nudges existing ordering by at most five percent.
 * It never changes eligibility, dealbreakers, or the established preference percentage.
 */
export function beenaRankMultiplier(fit?: BeenaFit): number {
  return fit?.version === beenaVersion && fit.complete && fit.total === beenaScenarios.length && fit.covered === fit.total
    && typeof fit.percentage === 'number' && Number.isFinite(fit.percentage) && fit.percentage >= 0 && fit.percentage <= 100
    ? 0.95 + fit.percentage / 1000 : 1;
}
