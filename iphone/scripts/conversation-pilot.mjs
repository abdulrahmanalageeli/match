import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { comparePreferences, interests } from '../src/compatibility/model.ts';

const activityIds = new Set(interests.map(interest => interest.id));
const sharedActivityMultiplier = 1.05;

// Candidate pools must already reflect operational exclusions, availability, and blocks.
export function rankConversationPilot({ mode, member, candidates }) {
  if (mode !== 'marriage' && mode !== 'friendship') throw new Error('Use marriage or friendship');
  if (!member.introductionModes?.includes(mode)) return [];
  const activities = new Set(member.activitiesToDo ?? member.interestIds ?? []);
  return candidates.flatMap(person => {
    if (member.id === person.id || !person.introductionModes?.includes(mode)) return [];
    const match = mode === 'marriage' ? comparePreferences(member, person) : null;
    if (mode === 'marriage' && (!match || match.fit.practicalConcerns?.includes('required_criterion'))) return [];
    const sharedActivities = [...new Set(person.activitiesToDo ?? person.interestIds ?? [])]
      .filter(id => activityIds.has(id) && activities.has(id))
      .sort();
    const baselineRank = match?.rankValue ?? 1;
    return [{
      id: person.id,
      sharedActivities,
      baselineRank,
      pilotRank: baselineRank * (sharedActivities.length ? sharedActivityMultiplier : 1),
    }];
  }).sort((a, b) => b.pilotRank - a.pilotRank || b.baselineRank - a.baselineRank);
}

// One row per dispatched introduction after its feedback window has closed.
// Explicitly false means the outcome cannot succeed. Missing answers remain unknown.
export function summarizeConversationPilot(introductions) {
  const summary = {};
  for (const { mode, arm, talked, first, second } of uniqueIntroductions(introductions)) {
    if (!['marriage', 'friendship'].includes(mode) || !['baseline', 'candidate'].includes(arm)) {
      throw new Error('Expected a valid introduction mode and assigned arm');
    }
    const counts = (summary[mode] ??= {})[arm] ??= { introductions: 0, talked: 0, bothEnjoyedAndWantToContinue: 0, knownFailure: 0, unknown: 0 };
    const answers = [first?.enjoyed, first?.continue, second?.enjoyed, second?.continue];
    counts.introductions++;
    if (talked === true) counts.talked++;
    if (talked === false || answers.includes(false)) counts.knownFailure++;
    else if (talked === true && answers.every(answer => answer === true)) counts.bothEnjoyedAndWantToContinue++;
    else counts.unknown++;
  }
  return summary;
}

function* uniqueIntroductions(introductions) {
  const ids = new Set();
  for (const introduction of introductions) {
    const { id } = introduction;
    if (typeof id !== 'string' || !id || ids.has(id)) throw new Error('Expected one record per introduction');
    ids.add(id);
    yield introduction;
  }
}

export function mutualFollowups(introductions) {
  const followups = [];
  for (const { id, talked, first, second } of uniqueIntroductions(introductions)) {
    if (talked === true && first?.continue === true && second?.continue === true) followups.push(id);
  }
  return followups;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const value = JSON.parse(readFileSync(0, 'utf8'));
  const command = process.argv[2] ?? 'rank';
  const handlers = { rank: rankConversationPilot, summarize: summarizeConversationPilot, followups: mutualFollowups };
  if (!Object.hasOwn(handlers, command)) throw new Error('Use rank, summarize or followups');
  const result = handlers[command](value);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
