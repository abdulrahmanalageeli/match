import {normalizeNationality} from '../compatibility/nationality.ts';
import {canonicalCity, canonicalEducation, canonicalProfession, cityOptions, educationOptions, professionOptions} from '../profile/profileOptions.ts';
import type {MarriageBasics} from '../compatibility/marriage';
import type {PublicPerson} from './data';
import type {LunaResults} from './lunaSearchClient';

type Plan = Pick<LunaResults['options'], 'luna' | 'lunaFields'>;
type Criterion = {kind:'must'|'exclude'|'prefer'; field?:string; terms:string[]};

const publicBasics = new Set<keyof MarriageBasics>([
  'nationality','originCity','preferredLanguage','languageOpenness','tribalBackground','tribeName',
  'religiousAffiliation','prayerPractice','polygynyPreference','marriageTimeline','meetingPreference',
  'dressStyle','dressFlexibility','skinTone','heightCm','weightKg','childrenCount','currentWives',
  'weddingStyle','childrenTiming','housingPlan','expenseSharing','smoking','maritalStatus',
]);
const normalize = (value:string) => value.trim().toLowerCase().replace(/[ًٌٍَُِّْـ]/gu,'')
  .replace(/[أإآ]/gu,'ا').replace(/ى/gu,'ي').replace(/ة/gu,'ه');
const cityKey = (value:string) => normalize(canonicalCity(value));
const exclusionCatalog: Record<string, readonly string[] | undefined> = {
  city: cityOptions.map(option=>cityKey(option.value)),
  profession: professionOptions.map(option=>option.value),
  education: educationOptions.map(option=>option.value),
  smoking:['never','cigarettes','vape','shisha','sometimes','yes'],
  maritalStatus:['never_married','divorced','widowed','married'],
};

function criterion(value:unknown): value is Criterion {
  if (!value || typeof value!=='object') return false;
  const {kind,field,terms}=value as Partial<Criterion>;
  return (kind==='must'||kind==='prefer'||kind==='exclude') && (typeof field==='string'||(field===undefined&&kind==='prefer'))
    && Array.isArray(terms) && terms.length>=1 && terms.length<=8
    && terms.every(term=>typeof term==='string'&&term.trim().length>0&&term.length<=80);
}

function matchPublished(person:PublicPerson, {field,terms,kind}:Criterion): boolean | undefined {
  const basics=person.marriageBasics;
  if (field==='profileText' || field===undefined) {
    if (kind==='exclude') return undefined;
    const prose=[person.alias,person.bio,person.occupation,person.education,person.city,person.lookingFor,person.valuesStatement,
      person.lifeTogether,person.marriageIntent,person.familyPreference,person.beenaStory?.text,...person.interests];
    return terms.map(normalize).some(term=>term.length>=2 && prose.some(value=>value && normalize(value).includes(term)));
  }
  if (field==='verificationBadge') return person.manualVerifications?.some(badge=>terms.includes(badge.kind));
  if (field==='interest'||field==='language'||field==='spokenLanguages') {
    const values=field==='interest'?person.interests:basics?.spokenLanguages;
    if (!values?.length||kind==='exclude') return undefined;
    return values.some(value=>terms.some(term=>normalize(value)===normalize(term)));
  }

  let value:string|number|boolean|undefined|null;
  switch (field) {
    case 'city': value=person.city && cityKey(person.city); if (value?.startsWith('مدينه اخري')) return undefined; break;
    case 'education': value=canonicalEducation(person.education??''); break;
    case 'profession': value=canonicalProfession(person.occupation); break;
    case 'age': case 'alias': case 'familyPreference': case 'online': case 'membershipTier': value=person[field]; break;
    case 'available': value=typeof person.atCapacity==='boolean' ? !person.atCapacity : undefined; break;
    case 'compatibility': value=person.fit?.percentage; break;
    default: if (publicBasics.has(field as keyof MarriageBasics)) {
      const basic=basics?.[field as keyof MarriageBasics];
      if (!Array.isArray(basic)) value=basic;
    }
  }
  if (value==null||value===''||value==='private'||value==='prefer_not_to_say') return undefined;
  if (typeof value==='number') {
    const number=value;
    return terms.some(term=>{
      if (!/^\d{1,4}(?:\.\.\d{1,4})?$/u.test(term)) return false;
      const [min,max=min]=term.split('..').map(Number);
      return min<=number && number<=max;
    });
  }
  const catalog=exclusionCatalog[field];
  if ((field==='education'||field==='profession') && !catalog?.includes(String(value))) return undefined;
  const keys=field==='city'?terms.map(cityKey):terms;
  if (kind==='exclude' && catalog && keys.some(key=>!catalog.includes(key))) return undefined;
  if (kind==='exclude' && field==='smoking' && (value==='yes'||value==='sometimes')
      && terms.some(term=>['vape','shisha','cigarettes'].includes(term))) return undefined;
  const key=field==='nationality'?normalizeNationality:normalize;
  return keys.some(term=>key(String(value))===key(term));
}

// The plan comes from the authorized search. Evaluate only the card a tester can already see.
export function demoLunaScore(person:PublicPerson, {luna,lunaFields}:Plan):number {
  const {minAge,maxAge,city,maritalStatus,smoking}=lunaFields;
  if ((typeof minAge==='number' && person.age<minAge) || (typeof maxAge==='number' && person.age>maxAge)
      || (typeof city==='string' && cityKey(person.city)!==cityKey(city))
      || (smoking!=null && person.marriageBasics?.smoking!==smoking)
      || (maritalStatus!=null && person.marriageBasics?.maritalStatus!==maritalStatus)) return -1;
  let score=0;
  for (const item of luna) {
    if (!criterion(item)||item.field==='unsupported') return -1;
    const hit=matchPublished(person,item);
    if (item.kind==='prefer') score+=Number(hit===true);
    else if (hit===undefined || hit!==(item.kind==='must')) return -1;
  }
  return score;
}
