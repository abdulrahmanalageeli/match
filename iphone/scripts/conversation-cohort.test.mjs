import assert from 'node:assert/strict';
import test from 'node:test';
import { dimensions } from '../src/compatibility/model.ts';
import traits from '../src/compatibility/personality-catalog.json' with {type:'json'};
import { planConversationCohort, reportConversationCohort } from './conversation-cohort.mjs';

const practical = Object.fromEntries(dimensions.flatMap(q => [[q.id, 'A'], [q.partnerId, 'A']]));
const scored = (high, preferred) => ({
  personalityVersion: 'personality-v2',
  personalityAnswers: {
    ...Object.fromEntries(traits.map(trait => [trait.id, trait.reverse === high ? 'A' : 'E'])),
    partner_social_energy: preferred,
  },
  friendshipTraitPreferences: {partner_social_energy: preferred},
});

function batch(id, mode, flipPreference = false) {
  const participants = [0, 1, 2, 3].map(index => {
    const high = index % 2 === 1;
    return {
      ...scored(high, high === flipPreference ? 'A' : 'E'),
      id: id + index, gender: mode === 'marriage' && index >= 2 ? 'man' : 'woman',
      age: 32, preferredMinAge: 28, preferredMaxAge: 36, city: 'الرياض',
      introductionModes: [mode], assessmentVersion:'marriage-v4', surveyAnswers:practical,
    };
  });
  return {
    id, participants,
    eligiblePairs: [[0,2],[0,3],[1,2],[1,3]].map(pair => pair.map(index => participants[index].id)),
  };
}

function input(mode, flipPreference = false) {
  return {
    id: 'connections', seed: 'independent-pilot-seed', dispatchAt: '2026-11-20T09:00:00Z',
    blocks: [{id: 'round-1', mode, batches: [batch('a', mode, flipPreference), batch('b', mode, flipPreference)]}],
  };
}

for (const mode of ['marriage', 'friendship']) {
  test(`${mode} batches isolate reciprocal personality fit, preserve coverage and assign reproducibly`, () => {
    const config = input(mode);
    const original = planConversationCohort(config);
    assert.deepEqual(original, planConversationCohort(config));
    const after = planConversationCohort(input(mode, true));
    const baseline = trial => trial.blocks[0].batches.find(plan => plan.arm === 'baseline');
    const candidate = trial => trial.blocks[0].batches.find(plan => plan.arm === 'candidate');
    assert.deepEqual(baseline(original).offers, baseline(after).offers);
    assert.equal(candidate(original).personalityScorablePairs, 4);
    assert.equal(candidate(original).differingOffers + candidate(after).differingOffers, 2);
    for (const [trial, offset] of [[original, 2], [after, 3]]) {
      const plan = candidate(trial);
      const second = offset === 2 ? 3 : 2;
      assert.deepEqual(plan.offers.map(offer => offer.members), [[plan.id+0,plan.id+offset],[plan.id+1,plan.id+second]]);
      assert.deepEqual(plan.unmatched, []);
    }
  });
}

test('friendship uses explicit friendship preferences and respects the eligible pool', () => {
  const config = input('friendship');
  for (const batch of config.blocks[0].batches) {
    delete batch.participants[0].friendshipTraitPreferences;
    batch.eligiblePairs = [[batch.id+0,batch.id+2], [batch.id+0,batch.id+3], [batch.id+1,batch.id+2]];
  }
  for (const batch of planConversationCohort(config).blocks[0].batches) {
    assert.equal(batch.personalityScorablePairs, 1);
    assert.deepEqual(batch.offers.map(offer => offer.members), [[batch.id+0,batch.id+3],[batch.id+1,batch.id+2]]);
  }
  config.blocks[0].batches[1].participants[0].id = config.blocks[0].batches[0].participants[0].id;
  assert.throws(() => planConversationCohort(config), /unique participant/);
});

test('report keeps every planned offer, counts two-sided success, and detects tampering', () => {
  const plan = planConversationCohort(input('marriage'));
  const candidate = plan.blocks[0].batches.find(batch => batch.arm === 'candidate');
  const baseline = plan.blocks[0].batches.find(batch => batch.arm === 'baseline');
  const yes = {talked: true, enjoyed: true, continue: true};
  const results = [
    {id: candidate.offers[0].id, dispatched:true, first:yes, second:yes, followup:{first:true, second:true}},
    {id: candidate.offers[1].id, dispatched:true, first:yes},
    {id: baseline.offers[0].id, dispatched:false},
  ];
  const request = {plan, results, asOf:'2026-11-27T09:00:00Z'};
  const report = reportConversationCohort(request);
  const controlResult = report.blocks[0].batches.find(batch => batch.arm === 'baseline');
  assert.equal(controlResult.assigned, 2);
  assert.equal(controlResult.confirmedDispatched, 0);
  assert.equal(controlResult.knownFailure, 1);
  assert.equal(controlResult.unknown, 1);
  assert.equal(report.blocks[0].batches.find(batch => batch.arm === 'candidate').followup, null);
  assert.deepEqual(report.byMode.marriage, {blocks:1, confirmedRateDifference:0.5, differenceBounds:[0,1]});
  const later = reportConversationCohort({...request, asOf:'2026-12-04T09:00:00Z'});
  assert.deepEqual(later.blocks[0].batches.find(batch => batch.arm === 'candidate').followup,
    {eligible:1, confirmed:1, unknown:1, participantSuccessBounds:[0.5,1]});
  assert.throws(() => reportConversationCohort({...request, results:[{...results[1], followup:{first:true}}]}), /agreement from both/);
  assert.throws(() => reportConversationCohort({...request, asOf:plan.dispatchAt}), /seven-day/);
  assert.throws(() => reportConversationCohort({...request, plan:{...plan, seed:'edited'}}), /original cohort plan/);
  assert.throws(() => reportConversationCohort({...request, results:[{id:'other', dispatched:true}]}), /outside the frozen cohort/);
});
