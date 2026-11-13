import { ageFromBirthday } from "../profile/birthday";
import type { Profile } from "../types";
import { assessmentVersion, dimensions } from "../compatibility/model";
import { validMarriageBasics, validPartnerCriteria } from "../compatibility/marriage";
import { personalityVersion, personalityQuestions } from "../compatibility/personality";
import { validPublicAvatar } from "../compatibility/appearance";
import { validBeenaProfile } from "../beena/model";
import { canonicalCity, canonicalNationality } from '../profile/profileOptions';

export const chapters = [
  { key: "identity", label: "الأساسيات", title: "يا هلا، خلّنا نتعرّف عليك", note: "وش الاسم اللي تحب تظهر فيه؟ نبدأ بمعلوماتك الأساسية، وبعدها نأخذ راحتنا في التفاصيل." },
  { key: "story", label: "حياتك", title: "لمحة عن حياتك", note: "اكتب بطريقتك، مو لازم كلام مرتب. وش تحب في يومك؟ ووش ودّك يشاركه معك شريك حياتك؟" },
  { key: "details", label: "تفاصيلك", title: "تفاصيل تُكمل الصورة", note: "شارك التفاصيل اللي ترتاح لها. الهدف تكون الصورة واضحة من البداية." },
  { key: "avatar", label: "صورتك", title: "صورتك، بالطريقة اللي تريحك", note: "خلّ ظهورك يعكسك. خيارات الصورة والخصوصية قدّامك، وتقدر تغيّرها لاحقًا." },
  { key: "criteria", label: "ما يناسبك", title: "ما يهمك في الشريك", note: "وش أساسي عندك، ووش ممكن تتفاهمون عليه؟ مو لازم يكون كل شيء شرط." },
  { key: "compatibility", label: "جلسة التوافق", title: "خلّنا نسمع منك", note: "نتكلم عن حياتك واللي تتمناه في شريكك. بعدها تشوف وش فهمنا، وتعدّل وتؤكد بنفسك." },
  { key: "personality", label: "شخصيتك", title: "أقرب إلى طبيعتك", note: "نبني على الكلام اللي أكدته، ما نطلب منك تعيده. وإذا بقي شيء، تكمله بالحوار أو من الأسئلة." },
  { key: "beena", label: "بيننا", title: "لو صار بينكم هذا الموقف؟", note: "مواقف من الحياة: الأهل، المصاريف، والاختلافات الصغيرة. جاوب باللي يشبهك، مو بالإجابة اللي تحس إنها الأفضل." },
  { key: "preferences", label: "تفضيلاتك", title: "كيف تود أن يبدأ التعارف؟", note: "وش يناسبك في بداية التعارف؟ ومتى تحب تكون الخطوة مع الأهل؟" },
  { key: "review", label: "المراجعة", title: "راجع ملفك", note: "خذ نظرة أخيرة. هذا اللي بيشوفه الطرف الآخر، وتقدر تعدّل أي شيء قبل الإرسال." },
] as const;

export type Chapter = (typeof chapters)[number]["key"];
export type Answers = Omit<Profile, "age" | "gender" | "preferredMinAge" | "preferredMaxAge"> & {
  age: string;
  gender: Profile["gender"] | "";
  preferredMinAge: string;
  preferredMaxAge: string;
};
export type ApplicationDraft = {
  owner: string;
  baseline: string;
  answers: Answers;
  step: Chapter;
  returnToReview: boolean;
  consent: boolean;
  permissions?: { version: string; sensitiveProfile: boolean; assessment: boolean; interview?: boolean };
};
const numbers = new Intl.NumberFormat("ar-SA", { numberingSystem: "arab", useGrouping: false });
export const arabicNumber = (n: number) => numbers.format(n);

export function profileBaseline(p: Profile | null) {
  if (!p) return "new";
  const values: unknown[] = [p.displayName, p.gender, p.age, p.city, p.profession, p.bio, p.contact,
    p.preferredMinAge, p.preferredMaxAge, p.familyPreference, [...(p.interestIds ?? [])].sort(),
    Object.entries(p.surveyAnswers ?? {}).sort(([a], [b]) => a.localeCompare(b, "en"))];
  // Unchanged pre-assessment profiles must still accept their saved device draft.
  if (p.hardRequirements?.length || p.priorityCategories?.length) {
    values.push([...(p.hardRequirements ?? [])].sort(), [...(p.priorityCategories ?? [])].sort());
  }
  if (p.lookingFor || p.lifeTogether || p.education || p.marriageIntent || p.valuesStatement) {
    values.push([p.lookingFor ?? "", p.lifeTogether ?? "", p.education ?? "", p.marriageIntent ?? "", p.valuesStatement ?? ""]);
  }
  if (p.marriageBasics || p.partnerCriteria || p.personalityAnswers || p.personalityVersion) {
    values.push(p.marriageBasics ?? {}, p.partnerCriteria ?? {}, p.personalityAnswers ?? {}, p.personalityVersion ?? "");
  }
  if (p.publicAvatar !== undefined || p.appearanceVersion) values.push(p.publicAvatar ?? null, p.appearanceVersion ?? "");
  if (p.portrait !== undefined) values.push(['portrait',p.portrait ? [p.portrait.id,p.portrait.path,p.portrait.blur] : null]);
  if (p.portrait?.revealPolicy) values.push(['portraitReveal',p.portrait.revealPolicy,p.portrait.hasClear===true]);
  if (p.birthDate) values.push(["birthDate",p.birthDate]);
  if (p.beena !== undefined) values.push(['beena',p.beena]);
  return JSON.stringify(values);
}

export function initialDraft(owner: string, initial: Profile | null): ApplicationDraft {
  const answers: Answers = {
    displayName: "", gender: "", city: "", profession: "", bio: "", contact: "",
    lookingFor: "", lifeTogether: "", education: "", marriageIntent: "", valuesStatement: "",
    familyPreference: "بعد التعارف الأول", ...initial,
    birthDate: initial?.birthDate ?? (initial ? undefined : ""),
    age: initial ? String(initial.birthDate ? ageFromBirthday(initial.birthDate) ?? initial.age : initial.age) : "",
    preferredMinAge: String(initial?.preferredMinAge ?? 18),
    preferredMaxAge: String(initial?.preferredMaxAge ?? 65),
    interestIds: initial?.interestIds ?? [], surveyAnswers: initial?.surveyAnswers ?? {},
    assessmentVersion, hardRequirements: initial?.hardRequirements ?? [], priorityCategories: initial?.priorityCategories ?? [],
    personalityVersion, personalityAnswers: initial?.personalityAnswers ?? {},
    appearanceVersion: "appearance-v1",
  };
  return { owner, baseline: profileBaseline(initial), answers, step: "identity", returnToReview: false, consent: false };
}

export function latinDigits(value: string) {
  return value.replace(/[٠-٩]/g, char => String(char.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, char => String(char.charCodeAt(0) - 0x6f0));
}
function validAge(value: string) {
  return /^\d{2,3}$/.test(value) && Number(value) >= 18 && Number(value) <= 110;
}
export type Issue = { field: keyof Answers | "consent"; text: string };

/** Detail groups Luna did not already resolve; numeric ids match the signup slideshow. */
export function unresolvedDetailSlides(p: Answers, sensitive: boolean): number[] {
  const b=p.marriageBasics??{};
  const complete: Record<number,boolean> = {
    1: b.heightCm!==undefined&&b.weightKg!==undefined&&(!sensitive||Boolean(b.skinTone))&&
      (p.gender!=='woman'||Boolean(b.dressStyle&&b.dressFlexibility)),
    2: Boolean(b.spokenLanguages?.length&&b.preferredLanguage&&b.languageOpenness),
    3: Boolean(b.nationality)&&(!sensitive||Boolean(b.tribalBackground)),
    4: Boolean(b.marriageTimeline&&b.meetingPreference),
    5: Boolean(b.maritalStatus&&b.polygynyPreference&&(b.maritalStatus!=='married'||b.currentWives)),
    6: b.childrenCount!==undefined&&Boolean(b.smoking),
    7: !sensitive||Boolean(b.religiousAffiliation&&b.prayerPractice),
  };
  return [1,2,3,4,5,6,7].filter(slide=>!complete[slide]&&(slide!==7||sensitive));
}

export function validateStep(step: Chapter, p: Answers, consent: boolean, requireBirthday = false, requireAssessment = false, requireSkinTone = false): Issue | null {
  switch (step) {
    case 'compatibility':
      if (requireAssessment && dimensions.some(d => [d.id, d.partnerId].some(key => !d.options.some(o => o.code === p.surveyAnswers?.[key])))) return { field: 'surveyAnswers', text: 'نكمل كل نقاط التوافق أولًا، ثم نتابع إعداد ملفك.' };
      if (requireAssessment && personalityQuestions.some(q => !q.options.some(o => o.code === p.personalityAnswers?.[q.id]))) return { field: 'personalityAnswers', text: 'بقيت نقاط عن شخصيتك. أكملها في الجلسة قبل المتابعة.' };
      return null;
    case 'personality':
      return requireAssessment && personalityQuestions.some(q => !q.options.some(o => o.code === p.personalityAnswers?.[q.id])) ? { field: 'personalityAnswers', text: 'أكمل إجابات الشخصية قبل المتابعة.' } : null;
    case "identity":
      if (!p.displayName.trim()) return { field: "displayName", text: "أدخل اسمًا يظهر في ملفك." };
      if (!p.gender) return { field: "gender", text: "اختر الجنس لإكمال ملفك." };
      if ((requireBirthday || p.birthDate !== undefined) && (ageFromBirthday(p.birthDate ?? '') === null || ageFromBirthday(p.birthDate ?? '')! < 18 || ageFromBirthday(p.birthDate ?? '')! > 110)) return { field: "birthDate", text: "أدخل تاريخ ميلاد صحيحًا. وُدَين متاح لمن أتمّ ١٨ عامًا، حتى ١١٠ أعوام." };
      if (!validAge(p.birthDate ? String(ageFromBirthday(p.birthDate ?? '')) : p.age)) return { field: "age", text: "أدخل عمرًا صحيحًا بين ١٨ و١١٠ أعوام." };
      if (!p.city.trim()) return { field: "city", text: "اختر المدينة التي تقيم فيها." };
      if (requireAssessment && (!p.marriageBasics?.maritalStatus || !p.marriageBasics.polygynyPreference || (p.marriageBasics.maritalStatus === 'married' && !p.marriageBasics.currentWives))) return { field: 'marriageBasics', text: 'أكمل وضعك الحالي وموقفك من التعدد قبل جلسة التوافق.' };
      if (requireAssessment && p.marriageBasics?.maritalStatus === 'married' && p.gender !== 'man') return { field: 'marriageBasics', text: 'هذا المسار لا يتيح البحث عن زواج لحساب امرأة متزوجة حاليًا.' };
      if (requireAssessment && p.marriageBasics?.currentWives === 4) return { field: 'marriageBasics', text: 'لا يدعم وُدَين بدء تعارف لزواج إضافي مع وجود أربع زوجات حاليًا.' };
      return null;
    case "story":
      if (!p.profession.trim()) return { field: "profession", text: "اختر مجال العمل أو الوضع المهني." };
      if (!p.bio.trim()) return { field: "bio", text: "اكتب نبذة قصيرة تعبّر عنك." };
      for (const key of ["lookingFor", "lifeTogether", "education", "marriageIntent", "valuesStatement"] as const) {
        if (requireAssessment && !p[key]?.trim()) return { field: key, text: 'أكمل هذه الإجابة لتكتمل حكايتك. جملة قصيرة تكفي.' };
        if ((p[key]?.length ?? 0) > (key === "education" ? 100 : key === "marriageIntent" ? 100 : 600)) return { field: key, text: "اختصر إجابتك ضمن المساحة المتاحة." };
      }
      return null;
    case "preferences":
      if (!validAge(p.preferredMinAge)) return { field: "preferredMinAge", text: "أدخل حدًا أدنى بين ١٨ و١١٠ أعوام." };
      if (!validAge(p.preferredMaxAge)) return { field: "preferredMaxAge", text: "أدخل حدًا أعلى بين ١٨ و١١٠ أعوام." };
      if (Number(p.preferredMinAge) > Number(p.preferredMaxAge)) {
        return { field: "preferredMaxAge", text: "يجب أن يكون الحد الأعلى مساويًا للحد الأدنى أو أكبر منه." };
      }
      if (!p.contact.trim()) return { field: "contact", text: "أدخل وسيلة تواصل لاستخدامها بعد الموافقة المتبادلة." };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.contact.trim()) && !/^\+?\d{8,15}$/.test(latinDigits(p.contact).replace(/[\s()-]/g, ""))) return { field: "contact", text: "أدخل بريدًا إلكترونيًا صحيحًا أو رقم جوال مع رمز الدولة." };
      return null;
    case "details":
      if (requireSkinTone && !p.marriageBasics?.skinTone) return { field: "marriageBasics", text: "اختر درجة البشرة الأقرب لك لإكمال تفاصيلك." };
      if (requireAssessment && (['heightCm','weightKg','preferredLanguage','languageOpenness','nationality','maritalStatus','polygynyPreference','childrenCount','smoking','marriageTimeline','meetingPreference'] as const).some(key => p.marriageBasics?.[key] === undefined || p.marriageBasics?.[key] === '') || requireAssessment && !p.marriageBasics?.spokenLanguages?.length) return { field: 'marriageBasics', text: 'أكمل تفاصيلك الأساسية في كل مجموعة، بما فيها اللغات. المعلومات الحساسة تبقى باختيارك.' };
      if(p.marriageBasics?.maritalStatus==='married'&&p.gender!=='man')return{field:'marriageBasics',text:'هذا المسار لا يتيح البحث عن زواج لحساب امرأة متزوجة حاليًا.'};
      if(p.marriageBasics?.currentWives===4)return{field:'marriageBasics',text:'لا يدعم وُدَين بدء تعارف لزواج إضافي مع وجود أربع زوجات حاليًا.'};
      if (p.marriageBasics && !validMarriageBasics(p.marriageBasics)) return { field: "marriageBasics", text: "راجع التفاصيل: الطول من ١٢٠ إلى ٢٣٠ سم، والوزن من ٣٥ إلى ٢٥٠ كجم بأعداد صحيحة، والأبناء من صفر إلى ٢٠. اسم القبيلة اختياري للخلفية القبلية فقط." };
      return null;
    case "criteria":
      if (requireAssessment && (['sharedLanguage','height','weight','nationality','education','profession','maritalStatus','children','smoking'] as const).some(key => !p.partnerCriteria?.[key]?.mode)) return { field: 'partnerCriteria', text: 'حدّد موقفك من كل معيار. «لا يهمني» إجابة كاملة عندما لا يكون لديك تفضيل.' };
      if (p.partnerCriteria && !validPartnerCriteria(p.partnerCriteria, p.marriageBasics)) return { field: "partnerCriteria", text: "حدّد الخيارات لكل معيار مهم لك، بما فيها البشرة واللباس إذا اخترتهما. راجع نطاق الطول والوزن والحالات الاجتماعية. «نفس قبيلتي» يحتاج اسم قبيلتك في تفاصيلك." };
      return null;
    case "avatar":
      if (p.publicAvatar !== undefined && !validPublicAvatar(p.publicAvatar)) return { field: "publicAvatar", text: "اختاري شكل الصورة الرمزية ودرجة البشرة، أو تابعي دون صورة." };
      return null;
    case "review":
      return consent ? null : { field: "consent", text: "اقرأ الإقرار وحدّد موافقتك قبل الإرسال." };
    case "beena":
      return p.beena == null || validBeenaProfile(p.beena) ? null : { field: "beena", text: "راجع إجابات المواقف. قصتك لا تتجاوز ٥٠٠ حرف." };
    default: return null;
  }
}

export function toProfile(p: Answers): Profile {
  if (!p.gender) throw new Error("اختر الجنس لإكمال ملفك.");
  return {
    ...p, assessmentVersion, personalityVersion, appearanceVersion: "appearance-v1", hardRequirements: p.hardRequirements ?? [],
    priorityCategories: p.priorityCategories ?? [], gender: p.gender, age: p.birthDate ? ageFromBirthday(p.birthDate ?? '')! : Number(p.age), preferredMinAge: Number(p.preferredMinAge),
    preferredMaxAge: Number(p.preferredMaxAge), displayName: p.displayName.trim(),
    city: canonicalCity(p.city), profession: p.profession.trim(), bio: p.bio.trim(), contact: p.contact.trim(),
    ...(p.marriageBasics ? { marriageBasics: { ...p.marriageBasics, ...(p.marriageBasics.nationality ? { nationality: canonicalNationality(p.marriageBasics.nationality) } : {}) } } : {}),
    ...(p.partnerCriteria?.nationality?.values ? { partnerCriteria: { ...p.partnerCriteria, nationality: { ...p.partnerCriteria.nationality, values: [...new Set(p.partnerCriteria.nationality.values.map(canonicalNationality))] } } } : {}),
    lookingFor: p.lookingFor?.trim() ?? "", lifeTogether: p.lifeTogether?.trim() ?? "",
    valuesStatement: p.valuesStatement?.trim() ?? "",
    education: p.education?.trim() ?? "", marriageIntent: p.marriageIntent?.trim() ?? "",
  };
}
