import type { Profile } from '../types';
import { profileContextFromAnswers, type ProfileContextValue, type ProfileProposal } from './profileCapture';

export type ProfileAnswerProvenance = {
  fieldId: string;
  source: 'luna_confirmed' | 'manual';
  value: ProfileContextValue;
  evidence: ProfileProposal['evidence'];
  /** Confidence that the stored value represents the member's intent, not a model probability. */
  confidence: 1;
  confidenceBasis: 'member_confirmed' | 'member_entered';
  schemaVersion: 'profile-provenance-v1';
  modelVersion: 'gpt-6-luna' | null;
  promptVersion: string | null;
  confirmedAt: string;
};

type InterviewVersion = { model?: string | null; promptVersion?: string | null; confirmedAt?: string | null };
const sameValue = (first: ProfileContextValue, second: ProfileContextValue) =>
  first.fieldId === second.fieldId && first.mode === second.mode && first.exclude === second.exclude
  && JSON.stringify(first.values) === JSON.stringify(second.values);

/** Build a private, auditable record for every populated registered field.
 * An AI source is retained only while the final value still exactly matches the
 * proposal the member reviewed; subsequent edits are correctly marked manual. */
export function buildProfileAnswerProvenance(profile: Profile, confirmed: ProfileProposal[], version: InterviewVersion = {}): ProfileAnswerProvenance[] {
  const sensitive = profile.signupConsents?.sensitiveProfile === true;
  const values = profileContextFromAnswers(profile, sensitive);
  const ai = new Map(confirmed.map(item => [item.fieldId, item]));
  const at = new Date().toISOString();
  return values.map(value => {
    const proposal = ai.get(value.fieldId);
    const isConfirmed = Boolean(proposal && !proposal.needsClarification && sameValue(value, proposal));
    return {
      fieldId: value.fieldId,
      source: isConfirmed ? 'luna_confirmed' : 'manual',
      value,
      evidence: isConfirmed ? proposal!.evidence : [],
      confidence: 1,
      confidenceBasis: isConfirmed ? 'member_confirmed' : 'member_entered',
      schemaVersion: 'profile-provenance-v1',
      modelVersion: isConfirmed && version.model === 'gpt-6-luna' ? 'gpt-6-luna' : null,
      promptVersion: isConfirmed && typeof version.promptVersion === 'string' ? version.promptVersion : null,
      confirmedAt: isConfirmed && version.confirmedAt ? version.confirmedAt : at,
    };
  });
}
