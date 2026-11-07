import type { Profile } from '../types';
import { LEGAL_NOTICE_VERSION } from './LegalNotice';
export type SignupConsents = {version:typeof LEGAL_NOTICE_VERSION|'2026-11-06-onboarding';adult:boolean;terms:boolean;privacy:boolean;sensitiveProfile:boolean;sensitivePublication:boolean;assessment:boolean;photo:boolean};
export function emptyConsents():SignupConsents{return{version:LEGAL_NOTICE_VERSION,adult:false,terms:false,privacy:false,sensitiveProfile:false,sensitivePublication:false,assessment:false,photo:false};}
export function withoutSensitive<T extends Pick<Partial<Profile>,'marriageBasics'|'partnerCriteria'|'publicAvatar'>>(profile:T):T {
  const basics={...profile.marriageBasics},criteria={...profile.partnerCriteria};
  for(const field of ['skinTone','tribalBackground','tribeName','religiousAffiliation','prayerPractice'] as const)delete basics[field];
  delete criteria.skinTone;delete criteria.tribalBackground;
  return {...profile,marriageBasics:basics,partnerCriteria:criteria,publicAvatar:null};
}
export function withoutAssessment<T extends Pick<Partial<Profile>,'surveyAnswers'|'personalityAnswers'|'partnerCriteria'|'hardRequirements'|'priorityCategories'|'beena'>>(profile:T):T{return{...profile,surveyAnswers:{},personalityAnswers:{},partnerCriteria:{},hardRequirements:[],priorityCategories:[],beena:null};}
/** Public fields only. Missing/legacy publication receipts never imply a grant. */
export function publicSensitiveFields(profile:Pick<Partial<Profile>,'marriageBasics'|'publicAvatar'|'signupConsents'>){
  const allowed=profile.signupConsents?.version==='2026-11-07-privacy'&&profile.signupConsents.sensitiveProfile===true&&profile.signupConsents.sensitivePublication===true;
  const safe=allowed?profile:withoutSensitive(profile);
  return {marriageBasics:safe.marriageBasics,publicAvatar:safe.publicAvatar};
}
export function applyConsentChoices(profile:Profile,consents:SignupConsents):Profile {
  let result=consents.sensitiveProfile?profile:withoutSensitive(profile);
  result=consents.assessment?result:withoutAssessment(result);
  return {...result,signupConsents:{...consents,sensitivePublication:consents.sensitiveProfile===true&&consents.sensitivePublication===true}};
}
