import type { MatchFit } from "./compatibility/model";
import type { MarriageBasics, PartnerCriteria } from "./compatibility/marriage";
import type { PublicAvatar } from "./compatibility/appearance";
import type { SignupConsents } from "./legal/consent";
import type { BeenaProfile } from "./beena/model";

export type PortraitRevealPolicy = 'never' | 'matched' | 'serious' | 'family';
export type ProfilePortrait = { id: string; path: string; blur: number; revealPolicy?: PortraitRevealPolicy; hasClear?: boolean; revealed?: boolean };

export type Profile = {
  displayName: string;
  age: number;
  gender: "woman" | "man";
  city: string;
  profession: string;
  bio: string;
  lookingFor?: string;
  valuesStatement?: string;
  lifeTogether?: string;
  education?: string;
  marriageIntent?: string;
  marriageBasics?: MarriageBasics;
  publicAvatar?: PublicAvatar | null;
  portrait?: ProfilePortrait | null;
  signupConsents?: SignupConsents;
  appearanceVersion?: "appearance-v1";
  partnerCriteria?: PartnerCriteria;
  personalityAnswers?: Record<string, string>;
  personalityVersion?: "personality-v1";
  beena?: BeenaProfile | null;
  contact: string;
  preferredMinAge: number;
  preferredMaxAge: number;
  familyPreference: string;
  interestIds?: string[];
  surveyAnswers?: Record<string, string>;
  assessmentVersion?: "legacy-v0" | "marriage-v1" | "marriage-v2";
  hardRequirements?: string[];
  priorityCategories?: string[];
};

export type Proposal = {
  /** Generated portrait for fictional demos only. */
  demoPhoto?: string;
  fit?: MatchFit;
  id: string;
  alias: string;
  age: number;
  city: string;
  occupation: string;
  bio: string;
  interests: string[];
  reasons: string[];
  status: "pending" | "interested" | "mutual";
  contact?: string;
};

export type AccountState = {
  user: {
    id: string;
    email: string | null;
    applicationStatus: "draft" | "pending" | "approved";
    appAccountToken: string;
    paused: boolean;
    /** Member-requested changes awaiting review; existing accepted conversations remain available. */
    profileReviewPending?: boolean;
    nextPublicProfileEditAt?: string | null;
  };
  profile: Profile | null;
  membership: { active: boolean; expiresAt: string | null; canStart: boolean };
  introduction: {
    fit?: MatchFit;
    id: string;
    status: "proposed" | "waiting" | "mutual";
    person: Pick<
      Profile,
      "displayName" | "age" | "city" | "profession" | "bio" | "familyPreference"
    > & { interests?: string[] };
    reasons?: string[];
    contact: string | null;
  } | null;
};

export type Decision = "accept" | "pass" | "block" | "report";

export function toProposal(
  introduction: AccountState["introduction"],
): Proposal | null {
  if (!introduction) return null;
  const { person, status } = introduction;
  return {
    id: introduction.id,
    fit: introduction.fit,
    alias: person.displayName,
    age: person.age,
    city: person.city,
    occupation: person.profession,
    bio: person.bio,
    reasons:
      introduction.reasons ??
      (person.familyPreference ? [person.familyPreference] : []),
    interests: person.interests ?? [],
    status:
      status === "proposed"
        ? "pending"
        : status === "waiting"
          ? "interested"
          : "mutual",
    contact:
      status === "mutual" && introduction.contact
        ? introduction.contact
        : undefined,
  };
}
