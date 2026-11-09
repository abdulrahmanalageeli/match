import type { Profile } from '../types';
import type { PublicPerson } from '../community/data';
import { interests } from '../compatibility/model';
import { sharedBeenaStory } from '../beena/model';
import { publicSensitiveFields } from '../legal/consent';

// The self-preview receives only the same public fields used in member profiles.
export function publicProfile(profile: Profile, id: string, demoPhoto?: string): PublicPerson {
  const visible=publicSensitiveFields(profile),b=visible.marriageBasics;
  return {
    id, alias: profile.displayName, age: profile.age, city: profile.city,
    occupation: profile.profession, bio: profile.bio, lookingFor: profile.lookingFor,
    valuesStatement: profile.valuesStatement, lifeTogether: profile.lifeTogether,
    education: profile.education, marriageIntent: profile.marriageIntent,
    beenaStory: sharedBeenaStory(profile.beena),
    familyPreference: profile.familyPreference, publicAvatar: visible.publicAvatar,
    portrait: profile.portrait ? { id: profile.portrait.id, path: profile.portrait.path, blur: profile.portrait.blur } : profile.portrait,
    marriageBasics: b ? {
      spokenLanguages: b.spokenLanguages, preferredLanguage: b.preferredLanguage, languageOpenness: b.languageOpenness,
      heightCm: b.heightCm, weightKg: b.weightKg, nationality: b.nationality,
      maritalStatus: b.maritalStatus, childrenCount: b.childrenCount, smoking: b.smoking,
      tribalBackground: b.tribalBackground, tribeName: b.tribalBackground === 'tribal' ? b.tribeName : undefined,
      skinTone: b.skinTone, dressStyle: b.dressStyle, dressFlexibility: b.dressFlexibility,
      currentWives: b.maritalStatus === 'married' ? b.currentWives : undefined,
      polygynyPreference: b.polygynyPreference === 'prefer_not_to_say' ? undefined : b.polygynyPreference,
      religiousAffiliation: b.religiousAffiliation === 'prefer_not_to_say' ? undefined : b.religiousAffiliation,
      prayerPractice: b.prayerPractice === 'prefer_not_to_say' ? undefined : b.prayerPractice,
      marriageTimeline: b.marriageTimeline, meetingPreference: b.meetingPreference,
    } : undefined,
    interests: interests.filter(item => profile.interestIds?.includes(item.id)).map(item => item.label),
    reasons: [], demoPhoto,
  };
}
