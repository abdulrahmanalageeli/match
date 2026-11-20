import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildMutualChoiceRound } from '../../server/event3/choice-matching.mjs';
import { assessmentVersion, comparePreferences } from '../src/compatibility/model.ts';
import { partnerTraitQuestions, reciprocalTraitFit, traitRankMultiplier } from '../src/compatibility/personality.ts';
import { summarizeConversationPilot } from './conversation-pilot.mjs';

const version = 'reciprocal-personality-pilot-v1';
const week = 7 * 24 * 60 * 60 * 1000;
const digest = (...parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const byId = (a, b) => a.id < b.id ? -1 : Number(a.id > b.id);
const timestamp = value => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;

function remember(ids, id, label) {
  if (typeof id !== 'string' || !id || ids.has(id)) throw new Error('Expected a unique ' + label + ' ID');
  ids.add(id);
}

function friendshipProfile(person) {
  const selfAnswers = Object.entries(person.personalityAnswers ?? {}).filter(([key]) => !key.startsWith('partner_'));
  const preferences = partnerTraitQuestions.flatMap(({id}) => {
    const value = person.friendshipTraitPreferences?.[id];
    return value === undefined ? [] : [[id, value]];
  });
  return {
    personalityVersion: person.personalityVersion,
    personalityAnswers: Object.fromEntries([...selfAnswers, ...preferences]),
  };
}

function scorePair(mode, a, b) {
  if (mode === 'friendship') return { base: 1, trait: reciprocalTraitFit(friendshipProfile(a), friendshipProfile(b)) };
  const match = comparePreferences({ ...a, personalityVersion: undefined }, { ...b, personalityVersion: undefined });
  if (!match || match.fit.practicalConcerns?.includes('required_criterion')) return null;
  const trait = a.assessmentVersion === assessmentVersion && b.assessmentVersion === assessmentVersion ? reciprocalTraitFit(a, b) : null;
  return { base: match.rankValue, trait };
}

function selectPairs(edges, participantNumbers, arm) {
  const rankings = new Map(participantNumbers.map(number => [number, new Map()]));
  const ranking = arm === 'candidate' ? 'candidateRank' : 'baselineRank';
  const sorted = [...edges].sort((a, b) => b[ranking] - a[ranking] || a.tie.localeCompare(b.tie, 'en'));
  for (const [index, {a, b}] of sorted.entries()) {
    rankings.get(a).set(b, index + 1);
    rankings.get(b).set(a, index + 1);
  }
  return buildMutualChoiceRound({participantNumbers, rankings});
}

function planBatch({ id, participants, eligiblePairs }, mode, arm, cohort, seed, people) {
  const profiles = [...participants].sort(byId);
  const numbers = new Map();
  for (const person of profiles) {
    remember(people, person.id, 'participant');
    if (!person.introductionModes?.includes(mode)) throw new Error('Each participant must opt in to their batch mode');
    numbers.set(person.id, numbers.size + 1);
  }
  const edges = [];
  const pairs = new Set();
  for (const ids of eligiblePairs) {
    if (!Array.isArray(ids) || ids.length !== 2) throw new Error('Expected an eligible pair of two participant IDs');
    const [first, second] = [...ids].sort();
    const a = numbers.get(first), b = numbers.get(second);
    if (!a || !b || a === b) throw new Error('Eligible pair must reference two people in the same batch');
    const key = digest(cohort, id, first, second);
    remember(pairs, key, 'pair');
    const fit = scorePair(mode, profiles[a - 1], profiles[b - 1]);
    if (!fit) continue;
    edges.push({a, b, baselineRank: fit.base, candidateRank: fit.base * traitRankMultiplier(fit.trait),
      id: key, tie: digest(seed, 'tie', key), personalityAvailable: fit.trait !== null});
  }
  const participantNumbers = [...numbers.values()];
  const result = selectPairs(edges, participantNumbers, arm);
  const alternative = selectPairs(edges, participantNumbers, arm === 'candidate' ? 'baseline' : 'candidate');
  const edgeByPair = new Map(edges.map(edge => [edge.a + '-' + edge.b, edge]));
  const alternativeKeys = new Set(alternative.pairs.map(({a,b}) => a + '-' + b));
  return {
    id, mode, arm, participants: profiles.length,
    eligiblePairs: edges.length, personalityScorablePairs: edges.filter(edge => edge.personalityAvailable).length,
    differingOffers: result.pairs.filter(({a,b}) => !alternativeKeys.has(a + '-' + b)).length,
    unmatched: result.unmatched.map(number => profiles[number - 1].id),
    offers: result.pairs.map(({a, b}) => {
      const edge = edgeByPair.get(a + '-' + b);
      return {id: edge.id, members: [profiles[a - 1].id, profiles[b - 1].id], personalityAvailable: edge.personalityAvailable};
    }),
  };
}

export function planConversationCohort({ id, dispatchAt, blocks, seed = randomBytes(32).toString('hex') }) {
  if (typeof id !== 'string' || !id || typeof seed !== 'string' || !seed ||
      !Number.isFinite(timestamp(dispatchAt))) throw new Error('Provide a cohort ID and scheduled dispatch time with a time zone');
  if (!blocks.length) throw new Error('Provide at least one block of two independent batches');
  const people = new Set(), blockIds = new Set(), batchIds = new Set();
  const plan = {
    version, id, seed, dispatchAt: new Date(dispatchAt).toISOString(),
    blocks: [...blocks].sort(byId).map(({ id: block, mode, batches }) => {
      remember(blockIds, block, 'block');
      if (!['marriage', 'friendship'].includes(mode) || batches.length !== 2 ||
          batches.some(batch => batch.participants.length < 2)) throw new Error('Each block needs two nonempty batches of the same mode');
      const candidate = parseInt(digest(seed, 'arm', id, block).slice(0, 1), 16) % 2;
      return {id: block, batches: [...batches].sort(byId).map((batch, index) => {
        remember(batchIds, batch.id, 'batch');
        return planBatch(batch, mode, index === candidate ? 'candidate' : 'baseline', id, seed, people);
      })};
    }),
  };
  return {...plan, fingerprint: digest(plan)};
}

function scoreOutcome(offer, result, batch) {
  const {dispatched, first, second} = result ?? {};
  if (dispatched !== undefined && typeof dispatched !== 'boolean') throw new Error('Dispatch status must be a boolean');
  if (dispatched !== true && (first || second)) throw new Error('Record dispatch before entering a pair response');
  for (const answer of [first, second].filter(Boolean)) {
    if (typeof answer.talked !== 'boolean' || (answer.talked &&
        (typeof answer.enjoyed !== 'boolean' || typeof answer.continue !== 'boolean')) ||
        (!answer.talked && (answer.enjoyed !== undefined || answer.continue !== undefined))) throw new Error('Invalid conversation response');
  }
  const talked = dispatched === false || first?.talked === false || second?.talked === false ? false
    : first?.talked === true && second?.talked === true ? true : undefined;
  return {id: offer.id, mode: batch.mode, arm: batch.arm, talked, first, second};
}

function followupOutcome(initial, response) {
  const canContinue = [initial.talked, initial.first?.continue, initial.second?.continue];
  if (response !== undefined && (!response || typeof response !== 'object' || Array.isArray(response) || canContinue.some(flag => flag !== true) ||
      Object.values(response).some(flag => typeof flag !== 'boolean') ||
      Object.keys(response).some(key => key !== 'first' && key !== 'second'))) {
    throw new Error('A follow-up response requires agreement from both people to continue');
  }
  if (canContinue.includes(false)) return {eligible: false, confirmed: false};
  if (canContinue.some(flag => flag === undefined)) return {eligible: undefined, confirmed: undefined};
  const confirmed = response?.first === false || response?.second === false ? false
    : response?.first === true && response?.second === true ? true : undefined;
  return {eligible: true, confirmed};
}

export function reportConversationCohort({ plan, results, asOf }) {
  const { fingerprint, ...manifest } = plan;
  if (typeof fingerprint !== 'string' || fingerprint !== digest(manifest)) throw new Error('Use the original cohort plan');
  const closedAt = timestamp(plan.dispatchAt) + week;
  const followupClosed = timestamp(asOf) >= closedAt + week;
  if (plan.version !== version || !Number.isFinite(closedAt) ||
      !Number.isFinite(timestamp(asOf)) || timestamp(asOf) < closedAt) {
    throw new Error('Report a supported cohort only after its seven-day observation window');
  }
  const ids = new Set(), offers = new Set(plan.blocks.flatMap(block => block.batches.flatMap(batch => batch.offers.map(offer => offer.id))));
  const outcomes = new Map(results.map(result => {
    remember(ids, result.id, 'outcome');
    if (!offers.has(result.id)) throw new Error('Outcome refers to an introduction outside the frozen cohort');
    return [result.id, result];
  }));
  const blocks = plan.blocks.map(block => ({
    id: block.id,
    batches: block.batches.map(batch => {
      const outcomesForBatch = batch.offers.map(offer => scoreOutcome(offer, outcomes.get(offer.id), batch));
      const counts = summarizeConversationPilot(outcomesForBatch)[batch.mode]?.[batch.arm];
      const successfulPeople = 2 * (counts?.bothEnjoyedAndWantToContinue ?? 0);
      const unknownPeople = 2 * (counts?.unknown ?? 0);
      const followups = outcomesForBatch.map(outcome => followupOutcome(outcome, outcomes.get(outcome.id)?.followup));
      const confirmedAgain = followups.filter(outcome => outcome.confirmed === true).length;
      const unknownAgain = followups.filter(outcome => outcome.confirmed === undefined).length;
      return {
        mode: batch.mode, arm: batch.arm, participants: batch.participants, assigned: batch.offers.length,
        id: batch.id,
        confirmedDispatched: batch.offers.filter(offer => outcomes.get(offer.id)?.dispatched === true).length,
        confirmedConversation: counts?.talked ?? 0, mutualSuccess: successfulPeople / 2,
        knownFailure: counts?.knownFailure ?? 0, unknown: unknownPeople / 2,
        participantSuccessBounds: [successfulPeople / batch.participants, (successfulPeople + unknownPeople) / batch.participants],
        followup: followupClosed ? {
          eligible: followups.filter(outcome => outcome.eligible === true).length,
          confirmed: confirmedAgain,
          unknown: unknownAgain,
          participantSuccessBounds: [2 * confirmedAgain / batch.participants, 2 * (confirmedAgain + unknownAgain) / batch.participants],
        } : null,
      };
    }),
  }));
  const byMode = {};
  for (const block of blocks) {
    const baseline = block.batches.find(batch => batch.arm === 'baseline');
    const candidate = block.batches.find(batch => batch.arm === 'candidate');
    const [baseLow, baseHigh] = baseline.participantSuccessBounds;
    const [testLow, testHigh] = candidate.participantSuccessBounds;
    const totals = byMode[candidate.mode] ??= {blocks: 0, confirmedRateDifference: 0, differenceBounds: [0, 0]};
    totals.blocks++;
    totals.confirmedRateDifference += testLow - baseLow;
    totals.differenceBounds[0] += testLow - baseHigh;
    totals.differenceBounds[1] += testHigh - baseLow;
  }
  for (const summary of Object.values(byMode)) {
    summary.confirmedRateDifference /= summary.blocks;
    summary.differenceBounds = summary.differenceBounds.map(value => value / summary.blocks);
  }
  return {blocks, byMode};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const action = process.argv[2] ?? 'plan';
  if (action !== 'plan' && action !== 'report') throw new Error('Use plan or report');
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const result = action === 'plan' ? planConversationCohort(input) : reportConversationCohort(input);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
