import currentCatalog from '../compatibility/catalog.json' with { type: 'json' };
import legacyCatalog from '../compatibility/catalog-v3.json' with { type: 'json' };
import { parentingApplicable } from '../compatibility/parenting.mjs';

import personas from './demoPersonas.json' with { type: 'json' };

// This assessment measures behaviors, not MBTI categories. Fictional responses
// supply complete answers for each supported test assessment.
export function demoSurvey(seed, index, version) {
  const [social,,,openness,closeness,,,,novelty,conflict,directness] = seed.traits;
  const self = {
    children_plan: seed.children ?? 'A', residence_plan: seed.relocate ? 'C' : 'A', wife_work: index % 5 === 3 ? 'C' : 'A',
    marriage_timeline: seed.timeline === 'over_a_year' ? 'C' : seed.timeline === 'when_ready' ? 'D' : seed.timeline === 'six_to_twelve_months' ? 'B' : 'A',
    ...seed.practical,
    social_boundaries: 'ABCD'[index % 4],
    mixed_gatherings: 'BCA'[index % 3], faith_routine: 'CAB'[index % 3],
    public_event_attendance: 'BAC'[index % 3], parenting_approach: 'BADC'[index % 4],
    social_rhythm: social <= 2 ? 'A' : social === 3 ? 'B' : 'C',
    match_disagreement_style: directness === 5 ? 'A' : novelty === 5 && social >= 4 ? 'C' : index % 2 ? 'B' : 'D',
    repair_after_conflict: conflict >= 4 ? 'A' : conflict <= 2 ? 'B' : 'C',
    closeness_pace: closeness <= 2 ? 'C' : openness >= 4 ? 'B' : 'A',
  };
  const { dimensions } = version === currentCatalog.version ? currentCatalog : legacyCatalog;
  const current = version === currentCatalog.version;
  const parenting = parentingApplicable(self, seed.childrenCount ?? 0, seed.children === 'B' ? {mode:'require',target:'none'} : {mode:'any'});
  return Object.fromEntries(dimensions.flatMap(d => {
    if (current && d.id === 'parenting_approach' && !parenting) return [];
    const own = [d.id,self[d.id]];
    if (current && d.id === 'residence_plan') return [own];
    return [own,[d.partnerId,seed.preferredPractical[d.id] ?? self[d.id]]];
  }));
}

export const demoAssessmentSeeds = personas.map(person => ({
  id: person.id,
  seed: { ...person, alias: person.name },
  index: Number(person.id.slice(-2)) - 1,
  genderIndex: person.gender === 'woman' ? 1 : 0,
}));
