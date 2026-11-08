import type { Profile } from '../types';

type AssessmentFixture = Pick<Profile, 'assessmentVersion' | 'surveyAnswers' | 'priorityCategories' | 'personalityVersion' | 'personalityAnswers' | 'beena'>;

// Fictional, user-authorized QA answers for the two private paired testers only.
// These are scenarios for exercising compatibility, not claims about either person.
// Merge only these fields; preserve identities, photos, consent, chats and match state.
export const pairAssessmentFixture = {
  abdulrahman: {
    assessmentVersion: 'marriage-v2',
    priorityCategories: ['values', 'plans'],
    surveyAnswers: {
      children_plan: 'A', partner_children_plan: 'A',
      residence_plan: 'C', partner_residence_plan: 'C',
      wife_work: 'A', partner_wife_work: 'A',
      marriage_timeline: 'A', partner_marriage_timeline: 'A',
      family_boundaries: 'A', partner_family_boundaries: 'A',
      shared_budget: 'A', partner_shared_budget: 'A',
      household_roles: 'B', partner_household_roles: 'B',
      weekly_planning: 'B', partner_weekly_planning: 'B',
      social_rhythm: 'B', partner_social_rhythm: 'B',
      conversation_initiative_preference: 'C', partner_conversation_initiative_preference: 'A',
      match_disagreement_style: 'A', partner_match_disagreement_style: 'B',
      repair_after_conflict: 'B', partner_repair_after_conflict: 'B',
      conversation_depth: 'A', partner_conversation_depth: 'B',
      closeness_pace: 'B', partner_closeness_pace: 'A',
      curiosity_style: 'A', partner_curiosity_style: 'B',
      early_openness: 'B', partner_early_openness: 'B',
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
    assessmentVersion: 'marriage-v2',
    priorityCategories: ['values', 'communication'],
    surveyAnswers: {
      children_plan: 'A', partner_children_plan: 'A',
      residence_plan: 'C', partner_residence_plan: 'C',
      wife_work: 'A', partner_wife_work: 'A',
      marriage_timeline: 'B', partner_marriage_timeline: 'A',
      family_boundaries: 'A', partner_family_boundaries: 'A',
      shared_budget: 'B', partner_shared_budget: 'B',
      household_roles: 'B', partner_household_roles: 'B',
      weekly_planning: 'B', partner_weekly_planning: 'B',
      social_rhythm: 'A', partner_social_rhythm: 'B',
      conversation_initiative_preference: 'A', partner_conversation_initiative_preference: 'C',
      match_disagreement_style: 'B', partner_match_disagreement_style: 'B',
      repair_after_conflict: 'B', partner_repair_after_conflict: 'B',
      conversation_depth: 'B', partner_conversation_depth: 'B',
      closeness_pace: 'A', partner_closeness_pace: 'B',
      curiosity_style: 'B', partner_curiosity_style: 'A',
      early_openness: 'B', partner_early_openness: 'B',
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
