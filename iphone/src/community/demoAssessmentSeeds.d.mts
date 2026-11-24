import type { MarriageBasics } from '../compatibility/marriage';

type DemoSeed = {
  alias: string; age: number; city: string; occupation: string; education: string;
  bio: string; lookingFor: string; values: string; home: string; interests: string[];
  /** In catalog order: social energy, initiative, depth, openness, closeness,
   * reassurance, support, planning, novelty, conflict pace, directness, quiet. */
  traits: number[];
  currentTraits: string;
  timeline: NonNullable<MarriageBasics['marriageTimeline']>;
  meeting: NonNullable<MarriageBasics['meetingPreference']>;
  children?: 'A' | 'B' | 'C'; status?: 'divorced' | 'widowed'; childrenCount?: number;
  nationality?: string; relocate?: boolean; smoking?: 'sometimes' | 'yes';
};
export const demoAssessmentSeeds: { id: string; seed: DemoSeed; index: number; genderIndex: number }[];
export function demoSurvey(seed: DemoSeed, index: number, version: 'marriage-v3' | 'marriage-v4'): Record<string, string>;
