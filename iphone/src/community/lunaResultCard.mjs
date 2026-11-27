import catalog from '../interview/profile-catalog.json' with {type:'json'};

const fields = new Map(catalog.filter(item => item.path[0] === 'marriageBasics'
  || ['city','familyPreference','profession','education'].includes(item.fieldId)).map(item => [item.path.at(-1), item]));
const numbers = new Intl.NumberFormat('ar-SA', {numberingSystem:'arab'});
const fold = value => String(value).trim().toLowerCase().replace(/[ًٌٍَُِّْـ]/gu,'').replace(/[أإآ]/gu,'ا').replace(/ى/gu,'ي').replace(/ة/gu,'ه');
const publicValue = value => value !== undefined && value !== null && value !== '' && value !== 'private' && value !== 'prefer_not_to_say';
const verification = {identity:'الهوية',education:'المؤهل',employment:'المهنة',marital_status:'الحالة الاجتماعية',preparation_course:'دورة التأهيل للزواج'};

// Only explain returned directory rows. Never use planner copy as a statement
// about the person, or inspect transcripts, unprojected answers or fit reasons.
function reason(person, {field='profileText',kind,terms}) {
  if (!Array.isArray(terms) || !terms.length) return;
  const matches = value => publicValue(value) && terms.some(term => fold(value) === fold(term));
  if (field === 'profileText') {
    if (kind === 'exclude') return;
    const snippets = [person.bio,person.lookingFor,person.valuesStatement,person.lifeTogether,person.marriageIntent,
      person.beenaStory?.text,person.familyPreference,person.occupation,person.education,person.city,person.alias];
    const words = terms.filter(term => typeof term === 'string' && term.trim().length >= 2);
    const term = words.find(term =>
      snippets.some(text => typeof text === 'string' && fold(text).includes(fold(term))));
    if (term) return 'ورد في الملف «'+term.trim()+'»';
    const interest = person.interests?.find(value => words.some(word => fold(value).includes(fold(word))));
    if (interest) return 'من الاهتمامات: '+interest;
    return;
  }
  if (field === 'interest' || field === 'language' || field === 'spokenLanguages') {
    const interest = field === 'interest';
    const value = (interest ? person.interests : person.marriageBasics?.spokenLanguages)?.find(matches);
    if (value && kind !== 'exclude') return (interest ? 'من الاهتمامات: ' : 'من اللغات: ')+value;
    return;
  }
  if (field === 'verificationBadge') {
    const badge = person.manualVerifications?.find(item => matches(item.kind) && Object.hasOwn(verification,item.kind));
    if (badge && kind !== 'exclude') return 'توثيق '+verification[badge.kind];
    if (!badge && kind === 'exclude' && Array.isArray(person.manualVerifications)) return 'ينطبق شرط استبعاد التوثيق';
    return;
  }
  const entry = fields.get(field);
  let value;
  if (field === 'profession') value = person.occupation;
  else if (field === 'compatibility') value = person.fit?.percentage;
  else if (field === 'available') value = typeof person.atCapacity === 'boolean' ? !person.atCapacity : undefined;
  else if (entry?.path[0] === 'marriageBasics') value = person.marriageBasics?.[field];
  else if (entry || ['age','online','alias','membershipTier'].includes(field)) value = person[field];
  if (!publicValue(value)) return;
  if (kind === 'prefer') {
    const hit = typeof value === 'number' ? terms.some(term => {
      if (!/^\d+(?:\.\.\d+)?$/.test(term)) return false;
      const [min,max=min] = term.split('..').map(Number);
      return value >= min && value <= max;
    }) : matches(value);
    if (!hit) return;
  }
  if (field === 'age') return 'العمر '+numbers.format(value)+' سنة';
  if (field === 'city') return 'مدينة الإقامة: '+value;
  if (field === 'alias') return 'الاسم في الملف: '+value;
  if (field === 'compatibility') return 'توافقكما '+numbers.format(value)+'٪';
  if (field === 'available') return value ? 'متاح للتعارف' : 'مكتمل التعارف حاليًا';
  if (field === 'online') return value ? 'متصل الآن' : 'غير متصل الآن';
  if (field === 'membershipTier') return {free:'عضوية مجانية',premium:'عضوية مميزة',seriousness:'وسام الجدية'}[value];
  if (field === 'smoking' && value === 'never') return 'التدخين: لا';
  if (field === 'heightCm') return 'الطول '+numbers.format(value)+' سم';
  if (field === 'weightKg') return 'الوزن '+numbers.format(value)+' كجم';
  const label = entry?.options?.find(option => fold(option.value) === fold(value))?.label;
  const display = label ?? (typeof value === 'number' ? numbers.format(value) : typeof value === 'string' && /\p{Script=Arabic}/u.test(value) ? value : undefined);
  if (display && entry) return (field === 'smoking' ? 'التدخين' : entry.label)+': '+display;
}

export function lunaResultCard(person, {luna, lunaFields}) {
  const reasons = new Set();
  const add = item => { const text = reason(person,item); if (text) reasons.add(text); };
  for (const item of luna) {
    if (reasons.size === 2) break;
    add(item);
  }
  for (const [field,value] of Object.entries(lunaFields)) {
    if (reasons.size === 2) break;
    if (value != null) add({field:field === 'minAge' || field === 'maxAge' ? 'age' : field,kind:'must',terms:[String(value)]});
  }
  const {id,alias,portrait,publicAvatar} = person;
  return {id,alias,portrait,publicAvatar, ...(person.isDemo ? {isDemo:true} : {}),
    ...(person.isDemo && person.demoPhoto?.startsWith('/demo/portraits/') ? {demoPhoto:person.demoPhoto} : {}), matchReasons:[...reasons]};
}
