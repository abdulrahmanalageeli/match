import { Check, Image, LockKeyhole } from "../BrandIcons";
import { AvatarPortrait } from "../avatars/AvatarPortrait";
import { dressStyles, type PublicAvatar } from "../compatibility/appearance";
import { ToneChoices } from "./AppearanceFields";
import "./appearance-fields.css";

const previewDefault: PublicAvatar = { style: "hijab", skinTone: "tone_4" };

export function AvatarPicker({ value, onChange }: { value?: PublicAvatar | null; onChange: (avatar: PublicAvatar | null) => void }) {
  const preview = value ?? previewDefault;
  return <section className="nf-avatar-picker" data-field="publicAvatar" tabIndex={-1} aria-label="اختيار صورتك الرمزية">
    <div className="nf-avatar-preview"><AvatarPortrait avatar={preview} /><span><Image size={14} aria-hidden="true" />{value ? "صورتك الرمزية" : "صورتك الرمزية المقترحة"}</span></div>
    <p className="nf-avatar-intro">صورة بملامح مخفية وبألوان وُدَين. اختاري اللباس ودرجة البشرة الأقرب لكِ، أو تابعي دون صورة.</p>
    <fieldset><legend>شكل الصورة</legend><div className="nf-avatar-styles">{dressStyles.map(style => <button key={style.value} type="button" aria-pressed={value?.style === style.value} onClick={() => onChange({ ...preview, style: style.value })}>
      <AvatarPortrait avatar={{ ...preview, style: style.value }} decorative /><span>{style.label}{value?.style === style.value && <Check size={14} aria-hidden="true" />}</span></button>)}</div></fieldset>
    <fieldset className="nf-avatar-tones"><legend>درجة البشرة في الصورة</legend><ToneChoices selected={value ? [value.skinTone] : []} change={skinTone => onChange({ ...preview, skinTone })} /></fieldset>
    {!value && <button className="nf-avatar-use" type="button" onClick={() => onChange(preview)}>اختيار الصورة المعروضة</button>}
    <button className="nf-appearance-clear" type="button" onClick={() => onChange(null)}>{value ? "إزالة الصورة الرمزية" : "المتابعة دون صورة رمزية"}</button>
    <p className="nf-avatar-private"><LockKeyhole size={17} aria-hidden="true" /><span>صورتك الشخصية اختيارية. إذا اخترتِ نشرها في ملفك، تظهر للأعضاء المؤهلين بدرجة التمويه التي تحدّدينها. الصور الخاصة التي تشاركينها داخل المحادثة منفصلة عن صور الملف. الصورة الرمزية رسم توضيحي وليست صورة شخصية.</span></p>
  </section>;
}
