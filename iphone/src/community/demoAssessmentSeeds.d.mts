import type { MarriageBasics } from '../compatibility/marriage';
import type { BeenaProfile } from '../beena/model';

type DemoSeed = {
  beena: BeenaProfile;
  alias: string; age: number; city: string; occupation: string; education: string;
  familyManager?: string;
  bio: string; lookingFor: string; values: string; home: string; interests: string[];
  /** In catalog order: social energy, initiative, depth, openness, closeness,
   * reassurance, support, planning, novelty, conflict pace, directness, quiet. */
  traits: number[];
  currentTraits: string;
  partnerTraits: string;
  membershipTier: 'free' | 'premium' | 'seriousness';
  practical: Record<string,string>;
  preferredPractical: Record<string,string>;
  timeline: NonNullable<MarriageBasics['marriageTimeline']>;
  meeting: NonNullable<MarriageBasics['meetingPreference']>;
  children?: 'A' | 'B' | 'C'; status?: 'divorced' | 'widowed'; childrenCount?: number;
  nationality?: string; relocate?: boolean; smoking?: 'sometimes' | 'yes';
};
export const demoAssessmentSeeds: { id: string; seed: DemoSeed; index: number; genderIndex: number }[];
export function demoSurvey(seed: DemoSeed, index: number, version: 'marriage-v3' | 'marriage-v4'): Record<string, string>;
