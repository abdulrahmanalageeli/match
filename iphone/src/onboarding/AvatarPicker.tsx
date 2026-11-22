import { Check, ChevronDown, Image, LockKeyhole } from "../BrandIcons";
import { AvatarPortrait } from "../avatars/AvatarPortrait";
import { dressStyles, skinTones, type PublicAvatar } from "../compatibility/appearance";
import { ToneChoices } from "./AppearanceFields";
import "./appearance-fields.css";

const previewDefault: PublicAvatar = { style: "hijab", skinTone: "tone_4" };

export function AvatarPicker({ value, onChange, compact, suggested }: {
  value?: PublicAvatar | null; onChange: (avatar: PublicAvatar | null) => void; compact?: boolean; suggested?: boolean;
}) {
  const preview = value ?? previewDefault;
  const withoutAvatar = compact && value === null;
  const caption = withoutAvatar ? "معاينة الرسم" : value && !(compact && suggested) ? "صورتك الرمزية" : "صورتك الرمزية المقترحة";
  const settings = <>
    <fieldset><legend>شكل الصورة</legend><div className="nf-avatar-styles">{dressStyles.map(style => <button key={style.value} type="button" aria-pressed={value?.style === style.value} onClick={() => onChange({ ...preview, style: style.value })}>
      <AvatarPortrait avatar={{ ...preview, style: style.value }} decorative /><span>{style.label}{value?.style === style.value && <Check size={14} aria-hidden="true" />}</span></button>)}</div></fieldset>
    <fieldset className="nf-avatar-tones"><legend>درجة البشرة في الصورة</legend><ToneChoices selected={value ? [value.skinTone] : []} change={skinTone => onChange({ ...preview, skinTone })} /></fieldset>
  </>;
  const privacy = <p className="nf-avatar-private"><LockKeyhole size={17} aria-hidden="true" /><span>صورتك الشخصية اختيارية. إذا اخترتِ نشرها في ملفك، تظهر للأعضاء المؤهلين بدرجة التمويه التي تحدّدينها. الصور الخاصة التي تشاركينها داخل المحادثة منفصلة عن صور الملف. الصورة الرمزية رسم توضيحي وليست صورة شخصية.</span></p>;
  return <section className="nf-avatar-picker" data-field="publicAvatar" tabIndex={-1} aria-label="اختيار صورتك الرمزية">
    <div className="nf-avatar-preview"><AvatarPortrait avatar={preview} />{!compact && <span><Image size={14} aria-hidden="true" />{caption}</span>}</div>
    <p className="nf-avatar-intro">{compact && <strong>{caption}</strong>}{withoutAvatar
      ? 'ملفك الآن دون صورة رمزية. يمكنك استخدام الرسم المعروض أو اختيار رسم آخر.'
      : compact && suggested
      ? 'راجعي اللباس ودرجة البشرة في الرسم المقترح. يمكنك تخصيصه أو المتابعة دون صورة.'
      : 'صورة بملامح مخفية وبألوان وُدَين. اختاري اللباس ودرجة البشرة الأقرب لكِ، أو تابعي دون صورة.'}</p>
    {compact ? <details className="nf-avatar-settings">
      <summary><span>تخصيص الرسم<small>{dressStyles.find(style => style.value === preview.style)?.label} · {skinTones.find(tone => tone.value === preview.skinTone)?.label}</small></span><ChevronDown size={16} aria-hidden="true"/></summary>
      {settings}
    </details> : settings}
    {!value && <button className="nf-avatar-use" type="button" onClick={() => onChange(preview)}>اختيار الصورة المعروضة</button>}
    {!withoutAvatar && <button className="nf-appearance-clear" type="button" onClick={() => onChange(null)}>{compact && suggested ? "عدم استخدام الرسم المقترح" : value ? "إزالة الصورة الرمزية" : "المتابعة دون صورة رمزية"}</button>}
    {compact ? <details className="nf-photo-privacy"><summary><LockKeyhole size={16} aria-hidden="true"/>خصوصية الصورة الرمزية</summary>{privacy}</details> : privacy}
  </section>;
}
