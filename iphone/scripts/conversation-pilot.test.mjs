import assert from 'node:assert/strict';
import test from 'node:test';
import { dimensions } from '../src/compatibility/model.ts';
import { mutualFollowups, rankConversationPilot, summarizeConversationPilot } from './conversation-pilot.mjs';

const answers = Object.fromEntries(dimensions.flatMap(q => [[q.id, 'A'], [q.partnerId, 'A']]));
const profile = { age: 32, city: 'الرياض', preferredMinAge: 30, preferredMaxAge: 36,
  introductionModes: ['marriage', 'friendship'], assessmentVersion: 'marriage-v4', surveyAnswers: answers };
const member = { ...profile, id: 'a', gender: 'woman', interestIds: ['walking', 'reading'] };
const eligible = { ...profile, id: 'b', gender: 'man', interestIds: ['walking'] };

test('shared activities change rank among eligible introductions and explicit choices replace hobbies', () => {
  const candidates = [
    { ...eligible, id: 'c', activitiesToDo: [] },
    { ...eligible, id: 'outside-age-range', age: 38 },
    { ...eligible, id: 'friend-only', gender: 'woman', introductionModes: ['friendship'] },
    { ...eligible, id: 'no-opt-in', introductionModes: [] },
    { ...eligible, id: 'strict-criterion', partnerCriteria: { smoking: { mode: 'require', target: 'never' } } },
    member,
    eligible,
  ];
  const marriage = rankConversationPilot({ mode: 'marriage', member, candidates });
  assert.deepEqual(marriage.map(item => item.id), ['b', 'c']);
  assert.equal(marriage[0].baselineRank, marriage[1].baselineRank);
  assert.equal(marriage[0].pilotRank, marriage[0].baselineRank * 1.05);
  assert.deepEqual(marriage[0].sharedActivities, ['walking']);
  assert.deepEqual(marriage[1].sharedActivities, []);
  const friends = rankConversationPilot({ mode: 'friendship', member, candidates });
  assert.ok(friends.some(item => item.id === 'friend-only'));
  assert.ok(friends.every(item => !['no-opt-in', member.id].includes(item.id)));
  assert.deepEqual(rankConversationPilot({ mode: 'friendship', member: { ...member, introductionModes: ['marriage'] }, candidates }), []);
});

test('the pilot counts bilateral enjoyment and intent, retaining missing feedback as unknown', () => {
  const example = { id: '1', mode: 'marriage', arm: 'candidate', talked: true };
  const both = { enjoyed: true, continue: true };
  const rows = [
    { ...example, first: both, second: both },
    { ...example, id: '2', first: both, second: { enjoyed: true, continue: false } },
    { ...example, id: '3', first: both },
    { ...example, id: '4', talked: false },
    { ...example, id: '5', mode: 'friendship', arm: 'baseline' },
  ];
  const result = summarizeConversationPilot(rows);
  assert.deepEqual(result.marriage.candidate, { introductions: 4, talked: 3,
    bothEnjoyedAndWantToContinue: 1, knownFailure: 2, unknown: 1 });
  assert.equal(result.friendship.baseline.unknown, 1);
  assert.throws(() => summarizeConversationPilot([...rows, rows[0]]), /one record per introduction/);
  assert.deepEqual(mutualFollowups(rows), ['1']);
});
