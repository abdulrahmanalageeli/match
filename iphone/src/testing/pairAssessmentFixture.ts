import type { Profile } from '../types';

type AssessmentFixture = Pick<Profile, 'assessmentVersion' | 'surveyAnswers' | 'priorityCategories' | 'personalityVersion' | 'personalityAnswers' | 'beena'>;

// Fictional, user-authorized QA answers for the two private paired testers only.
// These are scenarios for exercising compatibility, not claims about either person.
// Merge only these fields; preserve identities, photos, consent, chats and match state.
export const pairAssessmentFixture = {
  abdulrahman: {
    assessmentVersion: 'marriage-v3',
    priorityCategories: ['values', 'plans'],
    surveyAnswers: {
      children_plan: 'A', partner_children_plan: 'A',
      residence_plan: 'C', partner_residence_plan: 'C',
      wife_work: 'A', partner_wife_work: 'A',
      marriage_timeline: 'A', partner_marriage_timeline: 'A',
      family_authority: 'A', partner_family_authority: 'A',
      financial_provision: 'A', partner_financial_provision: 'A',
      domestic_labor: 'B', partner_domestic_labor: 'B',
      housing_arrangement: 'B', partner_housing_arrangement: 'B',
      social_rhythm: 'B', partner_social_rhythm: 'B',
      mixed_gatherings: 'C', partner_mixed_gatherings: 'A',
      match_disagreement_style: 'A', partner_match_disagreement_style: 'B',
      repair_after_conflict: 'B', partner_repair_after_conflict: 'B',
      faith_routine: 'A', partner_faith_routine: 'B',
      closeness_pace: 'B', partner_closeness_pace: 'A',
      public_event_attendance: 'A', partner_public_event_attendance: 'B',
      parenting_approach: 'B', partner_parenting_approach: 'B',
    },
    personalityVersion: 'personality-v1',
    personalityAnswers: {
      social_energy: 'C', initiative: 'E', depth: 'E', openness: 'D',
      closeness: 'D', reassurance: 'C', support: 'C', planning: 'E',
      novelty: 'D', conflict_pace: 'D', directness: 'E', quiet_comfort: 'D',
    },
    beena: {
      version: 'beena-v1',
      answers: {
        family_boundaries: { self: 'A', partner: ['A', 'B'], importance: 2 },
        finances: { self: 'A', partner: ['A', 'D'], importance: 2 },
        conflict: { self: 'B', partner: ['B', 'D'], importance: 2 },
        career: { self: 'C', partner: ['A', 'C'], importance: 1 },
        household: { self: 'B', partner: ['B'], importance: 1 },
        support: { self: 'B', partner: ['B', 'C'], importance: 1 },
      },
    },
  },
  reham: {
    assessmentVersion: 'marriage-v3',
    priorityCategories: ['values', 'communication'],
    surveyAnswers: {
      children_plan: 'A', partner_children_plan: 'A',
      residence_plan: 'C', partner_residence_plan: 'C',
      wife_work: 'A', partner_wife_work: 'A',
      marriage_timeline: 'B', partner_marriage_timeline: 'A',
      family_authority: 'A', partner_family_authority: 'A',
      financial_provision: 'B', partner_financial_provision: 'B',
      domestic_labor: 'B', partner_domestic_labor: 'B',
      housing_arrangement: 'B', partner_housing_arrangement: 'B',
      social_rhythm: 'A', partner_social_rhythm: 'B',
      mixed_gatherings: 'A', partner_mixed_gatherings: 'C',
      match_disagreement_style: 'B', partner_match_disagreement_style: 'B',
      repair_after_conflict: 'B', partner_repair_after_conflict: 'B',
      faith_routine: 'B', partner_faith_routine: 'B',
      closeness_pace: 'A', partner_closeness_pace: 'B',
      public_event_attendance: 'B', partner_public_event_attendance: 'A',
      parenting_approach: 'B', partner_parenting_approach: 'B',
    },
    personalityVersion: 'personality-v1',
    personalityAnswers: {
      social_energy: 'B', initiative: 'C', depth: 'D', openness: 'D',
      closeness: 'E', reassurance: 'E', support: 'D', planning: 'C',
      novelty: 'C', conflict_pace: 'B', directness: 'D', quiet_comfort: 'E',
    },
    beena: {
      version: 'beena-v1',
      answers: {
        family_boundaries: { self: 'B', partner: ['A'], importance: 2 },
        finances: { self: 'D', partner: ['A'], importance: 1 },
        conflict: { self: 'D', partner: ['A', 'D'], importance: 2 },
        career: { self: 'A', partner: ['A', 'C'], importance: 2 },
        household: { self: 'B', partner: ['B'], importance: 1 },
        support: { self: 'A', partner: ['A', 'D'], importance: 2 },
      },
    },
  },
} satisfies Record<'abdulrahman' | 'reham', AssessmentFixture>;
