import type { Profile } from "../types";
import { assessmentVersion } from "../compatibility/model";
import { validMarriageBasics, validPartnerCriteria } from "../compatibility/marriage";
import { personalityVersion } from "../compatibility/personality";
import { validPublicAvatar } from "../compatibility/appearance";
import { validBeenaProfile } from "../beena/model";

export const chapters = [
  { key: "identity", label: "الأساسيات", title: "لنبدأ بالتعارف", note: "اختر الاسم الذي تحب أن يراه الأعضاء، وأضف بعض التفاصيل عنك." },
  { key: "story", label: "حياتك", title: "لمحة عن حياتك", note: "قدّم نفسك بكلماتك. ما الذي تود أن يعرفه شريك الحياة عنك؟" },
  { key: "details", label: "تفاصيلك", title: "تفاصيل تُكمل الصورة", note: "شارك ما ترتاح إليه عن مظهرك وخلفيتك وحياتك اليوم." },
  { key: "avatar", label: "صورتك", title: "حضورك، بخصوصيتك", note: "صورة شخصية بتمويه تختارينه، أو رسم يعبّر عنك. القرار لكِ ويمكنكِ تغييره لاحقًا." },
  { key: "criteria", label: "ما يناسبك", title: "ما يهمك في الشريك", note: "فرّق بين ما تفضّله وما لا تتنازل عنه، أو اختر أن الأمر لا يهمك." },
  { key: "compatibility", label: "التوافق", title: "ما الذي يجمعكما؟", note: "اختر ما يصفك وما تفضّله في شريك الحياة. يمكنك ترك أي سؤال لوقت لاحق." },
  { key: "personality", label: "شخصيتك", title: "أقرب إلى طبيعتك", note: "اثنا عشر سؤالًا قصيرًا عن أسلوبك في الحياة والتواصل، منفصلة عن متطلبات الشريك." },
  { key: "beena", label: "بيننا", title: "الحياة، كما نعيشها معًا", note: "مواقف صغيرة تكشف كيف تتعامل مع الحياة، وما ترحّب به من شريكك. لا توجد إجابة مثالية، ويمكنك الإكمال لاحقًا." },
  { key: "preferences", label: "تفضيلاتك", title: "كيف تود أن يبدأ التعارف؟", note: "حدّد من ترغب بالتعرّف إليه، ومتى تفضّل إشراك الأهل." },
  { key: "review", label: "المراجعة", title: "راجع ملفك", note: "راجع ما سيظهر للطرف الآخر قبل إرسال طلبك." },
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
  if (p.beena !== undefined) values.push(['beena',p.beena]);
  return JSON.stringify(values);
}

export function initialDraft(owner: string, initial: Profile | null): ApplicationDraft {
  const answers: Answers = {
    displayName: "", gender: "", city: "", profession: "", bio: "", contact: "",
    lookingFor: "", lifeTogether: "", education: "", marriageIntent: "", valuesStatement: "",
    familyPreference: "بعد التعارف الأول", ...initial,
    age: initial ? String(initial.age) : "",
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
export function validateStep(step: Chapter, p: Answers, consent: boolean): Issue | null {
  switch (step) {
    case "identity":
      if (!p.displayName.trim()) return { field: "displayName", text: "أدخل اسمًا يظهر في ملفك." };
      if (!p.gender) return { field: "gender", text: "اختر الجنس لإكمال ملفك." };
      if (!validAge(p.age)) return { field: "age", text: "أدخل عمرًا صحيحًا بين ١٨ و١١٠ أعوام." };
      if (!p.city.trim()) return { field: "city", text: "أدخل المدينة التي تقيم فيها." };
      return null;
    case "story":
      if (!p.profession.trim()) return { field: "profession", text: "أدخل مهنتك أو مجال عملك." };
      if (!p.bio.trim()) return { field: "bio", text: "اكتب نبذة قصيرة تعبّر عنك." };
      for (const key of ["lookingFor", "lifeTogether", "education", "marriageIntent", "valuesStatement"] as const) {
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
      return null;
    case "details":
      if(p.marriageBasics?.maritalStatus==='married'&&p.gender!=='man')return{field:'marriageBasics',text:'هذا المسار لا يتيح البحث عن زواج لحساب امرأة متزوجة حاليًا.'};
      if(p.marriageBasics?.currentWives===4)return{field:'marriageBasics',text:'لا يدعم نصفين بدء تعارف لزواج إضافي مع وجود أربع زوجات حاليًا.'};
      if (p.marriageBasics && !validMarriageBasics(p.marriageBasics)) return { field: "marriageBasics", text: "راجع التفاصيل: الطول من ١٢٠ إلى ٢٣٠ سم، والوزن من ٣٥ إلى ٢٥٠ كجم بأعداد صحيحة، والأبناء من صفر إلى ٢٠. اسم القبيلة اختياري للخلفية القبلية فقط." };
      return null;
    case "criteria":
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
    priorityCategories: p.priorityCategories ?? [], gender: p.gender, age: Number(p.age), preferredMinAge: Number(p.preferredMinAge),
    preferredMaxAge: Number(p.preferredMaxAge), displayName: p.displayName.trim(),
    city: p.city.trim(), profession: p.profession.trim(), bio: p.bio.trim(), contact: p.contact.trim(),
    lookingFor: p.lookingFor?.trim() ?? "", lifeTogether: p.lifeTogether?.trim() ?? "",
    valuesStatement: p.valuesStatement?.trim() ?? "",
    education: p.education?.trim() ?? "", marriageIntent: p.marriageIntent?.trim() ?? "",
  };
}
