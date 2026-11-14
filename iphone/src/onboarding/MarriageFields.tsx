import { useId, useLayoutEffect, useRef, useState, type ReactNode, type FocusEvent } from "react";
import { BookOpen, Check, ChevronLeft, ChevronRight, Clock3, Heart, Home, Leaf, LockKeyhole, Sparkles, Users, type LucideIcon } from "../BrandIcons";
import { languageOptions, languageOpennessLabels, criteriaModes, polygynyLabels, religiousAffiliationLabels, prayerPracticeLabels, marriageTimelineLabels, meetingPreferenceLabels, type CriteriaMode, type MarriageBasics, type PartnerCriteria, type RangeCriterion } from "../compatibility/marriage";
import { personalityQuestions, personalityVersion } from "../compatibility/personality";
import { normalizeNationality } from "../compatibility/model";
import { arabicNumber, latinDigits } from "./draft";
import "./marriage-fields.css";
import "./scenario-experience.css";
import { SelfAppearanceFields, AppearanceCriteriaFields } from "./AppearanceFields";
import { SheetChoiceSelect as ChoiceSelect } from "../ui/SheetChoiceSelect";
import { educationOptions, professionOptions, nationalityChoices, numericOptions } from "../profile/profileOptions";
import { AnswerScale } from "../interview/AnswerScale";

export const maritalLabels = { never_married: "لم يسبق الزواج", divorced: "مطلّق / مطلّقة", widowed: "أرمل / أرملة", married: "متزوج حاليًا" };
export const tribalLabels = { tribal: "قبلي", non_tribal: "غير قبلي", prefer_not_to_say: "أفضل عدم الإفصاح" };
export const smokingLabels = { never: "لا أستخدم أيًا منها", cigarettes: "سجائر", vape: "فيب", shisha: "شيشة", sometimes: "أدخّن أحيانًا", yes: "أدخّن" };
const optionalNumber = (value: string) => {
  const parsed = value.trim() ? Number(latinDigits(value)) : undefined;
  return parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined;
};
const heightOptions = numericOptions(120, 230, 'سم');
const weightOptions = numericOptions(35, 250, 'كجم');
const childrenOptions = numericOptions(0, 20).map(option => option.value === '0' ? { ...option, label: 'دون أبناء' } : option);

function NumberField({label,unit,value,min,max,onChange,required=false,placeholder}: {label:string;unit?:string;value?:number;min:number;max:number;onChange:(value:number|undefined)=>void;required?:boolean;placeholder?:string}) {
  return <label className="wd-number-field"><span>{label}{unit&&<small>{unit}</small>}</span><input type="number" inputMode="numeric" min={min} max={max} step={1} value={value??''} required={required} placeholder={placeholder??'—'} onChange={event=>onChange(optionalNumber(event.target.value))}/></label>;
}

function Group({ title, note, children, open = false, icon: Icon, summary, activeSection }: { title: string; note: string; children: ReactNode; open?: boolean; icon: LucideIcon; summary?: string; activeSection?: string }) {
  if (activeSection && activeSection !== title) return null;
  return <details className="nf-marriage-group" data-section={title} open={Boolean(activeSection) || open || undefined}><summary><span className="nf-marriage-emblem"><Icon size={20} strokeWidth={1.5} aria-hidden="true" /></span><span className="nf-marriage-summary"><strong>{title}</strong><small>{summary || note}</small></span><span className="nf-marriage-open"><ChevronLeft size={16} aria-hidden="true" /></span></summary><div className="nf-marriage-content">{children}</div></details>;
}

function Choices<T extends string>({ title, value, labels, onChange, required = false }: { required?: boolean; title: string; value?: T; labels: Partial<Record<T, string>>; onChange: (value: T | undefined) => void }) {
  const id = useId();
  return <fieldset className="nf-detail-choices"><legend id={id}>{title}{!required && <small>اختياري</small>}</legend><div role="group" aria-labelledby={id}>
    {(Object.keys(labels) as T[]).map(key => <button type="button" key={key} aria-pressed={key === value} onClick={() => onChange(!required && key === value ? undefined : key)}><span>{labels[key]}</span><i aria-hidden="true">{key === value && <Check size={13}/>}</i></button>)}
  </div></fieldset>;
}

export function MarriageBasicsFields({ value = {}, gender, onChange, sensitiveAllowed = true, required = false, activeSection, skinRequired = false }: { activeSection?: string; skinRequired?: boolean; required?: boolean; value?: MarriageBasics; gender?: string; onChange: (value: MarriageBasics) => void; sensitiveAllowed?: boolean }) {
  const [reveal, setReveal] = useState<string | null>(null);
  function revealMissing(event: FocusEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const groups: [string, boolean][] = [
      ['المظهر واللباس',value.heightCm !== undefined && value.weightKg !== undefined],
      ['اللغات والتواصل',Boolean(value.spokenLanguages?.length && value.preferredLanguage && value.languageOpenness)],
      ['الخلفية والعائلة',Boolean(value.nationality)],
      ['بداية تناسبك',Boolean(value.marriageTimeline && value.meetingPreference)],
      ['الزواج والتعدد',Boolean(value.maritalStatus && value.polygynyPreference && (value.maritalStatus !== 'married' || value.currentWives))],
      ['الأبناء والعادات',value.childrenCount !== undefined && Boolean(value.smoking)],
    ];
    const title = groups.find(([, complete]) => !complete)?.[0] ?? groups[0][0];
    const root = event.currentTarget; setReveal(title);
    requestAnimationFrame(() => root.querySelector<HTMLElement>(`[data-section="${title}"] > summary`)?.focus());
  }
  const change = (patch: Partial<MarriageBasics>) => onChange({ ...value, ...patch });
  const selfMaritalLabels = gender === "man" ? maritalLabels : { never_married: "لم يسبق لي الزواج", divorced: "مطلّقة", widowed: "أرملة" };
  const pluralMarriageLabels = gender === "woman" ? { not_open: "لا أقبل التعدد", open_to_discussion: "منفتحة على النقاش", open: "منفتحة على التعدد", prefer_not_to_say: "أفضل مناقشته لاحقًا" } : polygynyLabels;
  return <div className="nf-marriage-fields" data-slideshow={Boolean(activeSection) || undefined} data-field="marriageBasics" tabIndex={-1} onFocus={revealMissing}>
    <div className="nf-detail-intro"><Leaf size={20} strokeWidth={1.5} aria-hidden="true"/><p><strong>تفاصيل تُكمل الصورة.</strong><span>{required ? "لمسات بسيطة تُكمل ملفك. راجع ما يظهر عنك قبل إرساله." : "افتح ما ترغب بإضافته. هذه التفاصيل اختيارية وتظهر للأعضاء المؤهلين."}</span></p></div>
    <Group activeSection={activeSection} title="المظهر واللباس" note="تفاصيل تختار مشاركتها" icon={Sparkles} open={reveal === "المظهر واللباس" || (required && reveal === null)} summary={[value.heightCm && `${arabicNumber(value.heightCm)} سم`, value.weightKg && `${arabicNumber(value.weightKg)} كجم`, value.skinTone && 'درجة البشرة محددة'].filter(Boolean).join(' · ')}>
      <div className="field-pair"><NumberField label="الطول" unit="سم" value={value.heightCm} min={120} max={230} required={required} onChange={heightCm=>change({heightCm})}/>
        <NumberField label="الوزن" unit="كجم" value={value.weightKg} min={35} max={250} required={required} onChange={weightKg=>change({weightKg})}/></div>
      <SelfAppearanceFields value={value} gender={gender} onChange={change} sensitiveAllowed={sensitiveAllowed} skinRequired={skinRequired} />
    </Group>
    <Group activeSection={activeSection} title="اللغات والتواصل" note="كيف تعبّر عن نفسك وتتواصل مع شريكك؟" icon={BookOpen} open={reveal === "اللغات والتواصل"} summary={value.spokenLanguages?.join(' · ')}>
      <fieldset className="nf-criterion-checks nf-language-options"><legend>ما اللغات التي تتحدثها؟{!required && " · اختياري"}</legend>{languageOptions.map(language => <label key={language}><input type="checkbox" checked={value.spokenLanguages?.includes(language) ?? false} onChange={e => change({spokenLanguages: e.target.checked ? [...(value.spokenLanguages ?? []), language] : value.spokenLanguages?.filter(item => item !== language)})}/>{language}</label>)}</fieldset>
      <ChoiceSelect label="ما اللغة التي تفضّل التواصل بها مع شريكك؟" value={value.preferredLanguage ?? ''} options={languageOptions.map(value => ({value,label:value}))} onChange={preferredLanguage => change({preferredLanguage: preferredLanguage || undefined})} placeholder={required ? "اختر اللغة" : "لا تفضيل محدد"} required={required} allowClear={!required} />
      <Choices title="كيف ترى اختلاف اللغة بينكما؟" required={required} value={value.languageOpenness} labels={languageOpennessLabels} onChange={languageOpenness => change({languageOpenness})}/>
      <small>تظهر اللغات في ملفك. حدّد أهمية اللغة المشتركة في تفضيلات الشريك لتؤثر في الترشيحات.</small>
    </Group>
    <Group activeSection={activeSection} title="الخلفية والعائلة" note="جزء من حكايتك" icon={Users} open={reveal === "الخلفية والعائلة"} summary={[value.nationality, value.tribalBackground && tribalLabels[value.tribalBackground]].filter(Boolean).join(' · ')}>
      <ChoiceSelect label="جنسيتك" value={value.nationality ?? ''} options={nationalityChoices} onChange={nationality => change({ nationality: nationality || undefined })} placeholder={required ? "اختر الجنسية" : "اختر الجنسية · اختياري"} required={required} allowClear={!required} />
      {sensitiveAllowed && <Choices title="الخلفية القبلية" value={value.tribalBackground} labels={tribalLabels} onChange={tribalBackground => change({ tribalBackground, tribeName: undefined })} />}
      {sensitiveAllowed && value.tribalBackground === "tribal" && <label>اسم القبيلة — اختياري<input value={value.tribeName ?? ""} maxLength={80} onChange={e => change({ tribeName: e.target.value })} placeholder="أضفه فقط إن رغبت بإظهاره" /></label>}
      <small>هذه معلومات عنك، وليست شروطًا للشريك. حدّد ما تقبله في «ما يهمك في الشريك»؛ لا نستنتج خلفيتك من اسمك أو صورتك.</small>
    </Group>
    <Group activeSection={activeSection} title="بداية تناسبك" note="توقيت الزواج وطريقتك المفضلة للقاء" icon={Clock3} open={reveal === "بداية تناسبك"} summary={value.marriageTimeline ? `الزواج ${marriageTimelineLabels[value.marriageTimeline]}` : value.meetingPreference ? 'تفضيل اللقاء محدد' : undefined}>
      <Choices title="متى تود إتمام الزواج إذا وجدت الشخص المناسب؟" required={required} value={value.marriageTimeline} labels={marriageTimelineLabels} onChange={marriageTimeline => change({ marriageTimeline })} />
      <small>هذا توقيت الزواج نفسه، وهو منفصل عن موعد الخطوة الرسمية في تقييم التوافق. يظهر اختيارك للأعضاء في الاستكشاف وملفك.</small>
      <Choices title="كيف تفضّل ترتيب اللقاء والخطوة الرسمية؟" required={required} value={value.meetingPreference} labels={meetingPreferenceLabels} onChange={meetingPreference => change({ meetingPreference })} />
      <small>يظهر تفضيل اللقاء في ملفك، وهو بداية للحوار وليس موافقة على لقاء بعينه. تبقى التفاصيل باتفاق الطرفين.</small>
    </Group>
    <Group activeSection={activeSection} title="الزواج والتعدد" note="وضعك الحالي وما تقبله مستقبلًا" icon={Heart} open={reveal === "الزواج والتعدد"} summary={[value.maritalStatus && maritalLabels[value.maritalStatus], value.currentWives && (value.currentWives === 1 ? 'زوجة واحدة' : value.currentWives === 2 ? 'زوجتان' : `${arabicNumber(value.currentWives)} زوجات`)].filter(Boolean).join(' · ')}>
      <Choices title="حالتي الاجتماعية الآن" required={required} value={value.maritalStatus} labels={selfMaritalLabels} onChange={maritalStatus => change({ maritalStatus, currentWives: maritalStatus === "married" ? value.currentWives : undefined, ...(maritalStatus==='never_married'&&value.childrenCount===undefined?{childrenCount:0}:{}) })} />
      {gender === "man" && value.maritalStatus === "married" && <div className="nf-family-disclosure"><label>عدد الزوجات حاليًا<select value={value.currentWives ?? ""} onChange={event => change({ currentWives: event.target.value ? Number(event.target.value) as MarriageBasics['currentWives'] : undefined })}><option value="">اختر العدد</option>{([1,2,3,4] as const).map(count=><option key={count} value={count}>{count === 1 ? "زوجة واحدة" : count === 2 ? "زوجتان" : count === 3 ? "ثلاث زوجات" : "أربع زوجات"}</option>)}</select></label><small>يظهر وضعك الحالي وعدد الزوجات بوضوح في ملفك. هذه معلومة منفصلة عن رغبتك في الزواج مستقبلًا.</small></div>}
      <Choices title={gender === "woman" ? "موقفي من الزواج برجل متزوج أو التعدد لاحقًا" : "موقفي من التعدد مستقبلًا"} required={required} value={value.polygynyPreference} labels={pluralMarriageLabels} onChange={polygynyPreference => change({ polygynyPreference })} />
      <small>هذا وصف لموقفك، ولا يعني موافقة على تغيير رأيك. حدّد أيضًا الحالات الاجتماعية المقبولة في «ما يهمك في الشريك» لتؤثر في الترشيحات.</small>
    </Group>
    <Group activeSection={activeSection} title="الأبناء والعادات" note="تفاصيل من حياتك اليومية" icon={Home} open={reveal === "الأبناء والعادات"} summary={[value.childrenCount !== undefined && (value.childrenCount ? `${arabicNumber(value.childrenCount)} أبناء` : 'دون أبناء'), value.smoking && smokingLabels[value.smoking]].filter(Boolean).join(' · ')}>
      <ChoiceSelect label="عدد الأبناء" value={value.childrenCount === undefined ? '' : String(value.childrenCount)} options={childrenOptions} onChange={children => change({ childrenCount: optionalNumber(children) })} placeholder={required ? "اختر العدد" : "لم أحدّد · اختياري"} required={required} allowClear={!required} />
      {value.maritalStatus==='never_married'&&value.childrenCount===0&&<small>حددنا «دون أبناء» مبدئيًا. يمكنك تغييره إذا احتجت.</small>}
      <Choices title="التدخين · ما الذي تستخدمه غالبًا؟" required={required} value={value.smoking} labels={{never:smokingLabels.never,cigarettes:smokingLabels.cigarettes,vape:smokingLabels.vape,shisha:smokingLabels.shisha,...(value.smoking==='yes'||value.smoking==='sometimes'?{[value.smoking]:smokingLabels[value.smoking]}:{})}} onChange={smoking => change({ smoking })} />
    </Group>
    {sensitiveAllowed ? <Group activeSection={activeSection} title="الدين في حياتي" note="معلومات حساسة، تختار مشاركتها أو تركها" icon={BookOpen} open={reveal === "الدين في حياتي"} summary={[value.religiousAffiliation && value.religiousAffiliation !== 'prefer_not_to_say' && religiousAffiliationLabels[value.religiousAffiliation], value.prayerPractice && value.prayerPractice !== 'prefer_not_to_say' && 'موقفك من الصلاة محدد'].filter(Boolean).join(' · ')}>
      <p className="nf-sensitive-note"><LockKeyhole size={16} aria-hidden="true"/><span>هذه الإجابات اختيارية وحساسة. تُعرض في ملفك فقط إذا اخترت إضافتها ووافقت على مشاركتها. لا نستنتجها من اسمك أو صورتك، ولا نستخدمها لتقييم تدينك.</span></p>
      <Choices title="المذهب" value={value.religiousAffiliation} labels={religiousAffiliationLabels} onChange={religiousAffiliation => change({ religiousAffiliation })} />
      <Choices title="الصلاة في حياتي" value={value.prayerPractice} labels={prayerPracticeLabels} onChange={prayerPractice => change({ prayerPractice })} />
      <small>«أفضل عدم الإفصاح» لا يظهر كصفة في ملفك. يمكنك إكمال التعارف دون الإجابة عن هذه الأسئلة.</small>
    </Group> : <p className="nf-sensitive-note"><LockKeyhole size={16} aria-hidden="true"/><span>أسئلة البشرة والخلفية القبلية والدين متاحة بعد موافقتك الاختيارية على معالجة المعلومات الحساسة. يمكنك المتابعة دونها.</span></p>}
    <small className="nf-detail-footnote">{required ? "يمكنك مراجعة أي اختيار قبل المتابعة." : "يمكنك تغيير اختياراتك أو إزالتها في أي وقت. اضغط الاختيار مرة أخرى لإزالته."}</small>
  </div>;
}

function Mode({ title, value, onChange, children, anyLabel }: { title: string; value?: CriteriaMode; onChange: (mode: CriteriaMode) => void; children: ReactNode; anyLabel?:string }) {
  return <fieldset className="nf-criterion"><legend>{title}</legend><div className="nf-criterion-modes" role="group" aria-label={"أهمية " + title}>{criteriaModes.map(mode => <button type="button" key={mode.value} aria-pressed={mode.value === value} onClick={() => onChange(mode.value)}>{mode.value==='any'&&anyLabel?anyLabel:mode.label}{mode.value === value && <Check size={12} aria-hidden="true" />}</button>)}</div>{value && value !== "any" && <div className="nf-criterion-target">{children}</div>}</fieldset>;
}

function Range({ title, options, value, onChange, required = false }: { required?: boolean; title: string; options: ReturnType<typeof numericOptions>; value?: RangeCriterion; onChange: (value: RangeCriterion) => void }) {
  return <Mode title={title} value={value?.mode ?? (required ? undefined : "any")} onChange={mode => onChange(mode === "any" ? { mode } : { ...value, mode })}><div className="field-pair">
    <NumberField label={title + ' من'} value={value?.min} min={Number(options[0].value)} max={value?.max??Number(options.at(-1)!.value)} onChange={min=>onChange({...value,mode:value?.mode??'prefer',min})} placeholder="دون حد أدنى"/>
    <NumberField label={title + ' إلى'} value={value?.max} min={value?.min??Number(options[0].value)} max={Number(options.at(-1)!.value)} onChange={max=>onChange({...value,mode:value?.mode??'prefer',max})} placeholder="دون حد أعلى"/></div></Mode>;
}

export function PartnerCriteriaFields({ value = {}, basics, gender, onChange, sensitiveAllowed = true, required = false }: { required?: boolean; value?: PartnerCriteria; basics?: MarriageBasics; gender?: string; onChange: (value: PartnerCriteria) => void; sensitiveAllowed?: boolean }) {
  const [reveal, setReveal] = useState<string | null>(null);
  function revealMissing(event: FocusEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const groups: [string, (keyof PartnerCriteria)[]][] = [['لغة مشتركة',['sharedLanguage']],['الدراسة والعمل',['education','profession']],['المظهر واللباس',['height','weight']],['من تتقبّله شريكًا؟',['nationality']],['الحياة السابقة والعادات',['maritalStatus','children','smoking']]];
    const title = groups.find(([, keys]) => keys.some(key => !value[key]?.mode))?.[0] ?? groups[0][0];
    const root = event.currentTarget; setReveal(title);
    requestAnimationFrame(() => root.querySelector<HTMLElement>(`[data-section="${title}"] > summary`)?.focus());
  }
  const change = (patch: Partial<PartnerCriteria>) => onChange({ ...value, ...patch });
  function addNationality(nationality:string) { if(!nationalityChoices.some(option=>option.value===nationality)||value.nationality?.values?.some(v=>normalizeNationality(v)===normalizeNationality(nationality))||(value.nationality?.values?.length??0)>=30)return; change({nationality:{...value.nationality,mode:value.nationality?.mode??'prefer',values:[...(value.nationality?.values??[]),nationality]}}); }

  const selected = (keys: Array<keyof PartnerCriteria>) => { const count = keys.filter(key => value[key]?.mode && value[key]?.mode !== 'any').length; return count ? `${arabicNumber(count)} من التفضيلات محددة` : undefined; };
  return <div className="nf-marriage-fields" data-field="partnerCriteria" tabIndex={-1} onFocus={revealMissing}>
    <div className="nf-detail-intro"><LockKeyhole size={19} strokeWidth={1.5} aria-hidden="true"/><p><strong>مساحة لما يهمّك أنت.</strong><span>تفضيلات خاصة تساعدنا على ترتيب الأشخاص الأقرب لاختياراتك.</span></p></div>
    <details className="nf-criteria-guide"><summary>كيف تؤثر اختياراتي؟</summary><p>«أفضل» تؤثر في الترتيب. «شرط أساسي» يستبعد من لا يستوفيه أو لم يذكر المعلومة. «لا يهمني» لا يرفع النتيجة ولا يخفضها.</p></details>
    <Group title="لغة مشتركة" note="مساحة لحوار يفهمه الطرفان" icon={BookOpen} open={reveal === "لغة مشتركة" || (required && reveal === null)} summary={selected(['sharedLanguage'])}>
      <Mode title="أهمية وجود لغة مشتركة" value={value.sharedLanguage?.mode ?? (required ? undefined : "any")} onChange={mode => change({sharedLanguage:{mode}})}>
        <p>نبحث عن لغة واحدة على الأقل من اللغات التي تتحدثها.</p>
        {!basics?.spokenLanguages?.length && <p role="alert">أضف اللغات التي تتحدثها في تفاصيلك قبل حفظ هذا التفضيل.</p>}
        <small>«أفضل» تؤثر في ترتيب التوافق. «شرط أساسي» يستبعد من لا يشاركك لغة، وكذلك من لم يذكر لغاته.</small>
      </Mode>
    </Group>
    <Group title="الدراسة والعمل" note="ما يناسب حياتك، دون ترتيب للمؤهلات أو المهن" icon={BookOpen} open={reveal === "الدراسة والعمل"} summary={selected(['education','profession'])}>
      <p>اختياراتك هنا خاصة. التشابه في الدراسة أو المهنة لا يزيد التوافق تلقائيًا؛ نراعي فقط ما تحدّده أنت.</p>
      {([{key:'education',title:'المؤهل التعليمي للشريك',options:educationOptions},{key:'profession',title:'مجال عمل الشريك أو وضعه المهني',options:professionOptions}] as const).map(({key,title,options}) => <Mode key={key} title={title} value={value[key]?.mode ?? (required ? undefined : "any")} onChange={mode => change({[key]: mode === 'any' ? {mode} : {...value[key],mode,values:value[key]?.values ?? []}})}>
        <div className="nf-nationality-selected">{value[key]?.values?.map(option => <button key={option} type="button" aria-label={'إزالة '+option} onClick={() => change({[key]: {...value[key],mode:value[key]?.mode ?? 'prefer',values:value[key]?.values?.filter(item => item !== option)}})}>{option}<span aria-hidden="true">×</span></button>)}</div>
        <ChoiceSelect label={'أضف اختيارًا: '+title} value="" placeholder="ابحث واختر · يمكنك إضافة أكثر من خيار" options={options.filter(option => !value[key]?.values?.includes(option.value))} onChange={option => {if(options.some(item=>item.value===option)&&!value[key]?.values?.includes(option))change({[key]:{...value[key],mode:value[key]?.mode??'prefer',values:[...(value[key]?.values??[]),option]}});}} />
      </Mode>)}
    </Group>
    <Group title="المظهر واللباس" note="ما تفضّله، وما لا يهمّك" icon={Sparkles} open={reveal === "المظهر واللباس"} summary={selected(['height','weight','skinTone','dressStyle','dressFlexibility'])}><Range required={required} title="الطول (سم)" options={heightOptions} value={value.height} onChange={height => change({ height })} /><Range required={required} title="الوزن (كجم)" options={weightOptions} value={value.weight} onChange={weight => change({ weight })} /><AppearanceCriteriaFields value={value} gender={gender} onChange={change} sensitiveAllowed={sensitiveAllowed} /></Group>
    <Group title="من تتقبّله شريكًا؟" note="الخلفية القبلية والجنسية، باختيارك أنت" icon={Users} open={reveal === "من تتقبّله شريكًا؟" || (!required && reveal === null)} summary={selected(['tribalBackground','nationality'])}>
      <p>خلفيتك وجنسيتك لا تحدّدان ما تقبله في الشريك. أنت تختار هنا، وتبقى هذه التفضيلات خاصة.</p>
      {sensitiveAllowed && <Mode title="هل تقبل شريكًا قبليًا أو غير قبلي؟" anyLabel="أقبل الحالتين" value={value.tribalBackground?.mode ?? "any"} onChange={mode => change({ tribalBackground: mode === "any" ? { mode } : { target: "tribal", ...value.tribalBackground, mode } })}>
        <label>التفضيل<select value={value.tribalBackground?.target ?? "tribal"} onChange={e => change({ tribalBackground: { mode: value.tribalBackground?.mode ?? "prefer", target: e.target.value as "tribal" | "non_tribal" | "same_tribe" } })}>
          <option value="tribal">قبلي</option><option value="non_tribal">غير قبلي</option><option value="same_tribe" disabled={basics?.tribalBackground !== "tribal" || !basics.tribeName?.trim()}>من نفس قبيلتي</option></select></label>
        <small>خيار «نفس قبيلتي» يتطلب اسم القبيلة في تفاصيلك. لا نرتّب القبائل أو نستنتج الأنساب.</small>
      </Mode>}
      <Mode title="ما الجنسيات التي تقبلها في الشريك؟" anyLabel="جميع الجنسيات" value={value.nationality?.mode ?? (required ? undefined : "any")} onChange={mode=>change({nationality:mode==='any'?{mode}:{values:[],...value.nationality,mode}})}>
        <label>طريقة الاختيار<select value={value.nationality?.exclude?'exclude':'include'} onChange={event=>change({nationality:{...value.nationality,mode:value.nationality?.mode??'prefer',exclude:event.target.value==='exclude'}})}><option value="include">الجنسيات المختارة تناسبني</option><option value="exclude">جميع الجنسيات ما عدا المختارة</option></select></label>
        <div className="nf-nationality-selected">{value.nationality?.values?.map(n=><button type="button" key={n} onClick={()=>change({nationality:{...value.nationality,mode:value.nationality?.mode??'prefer',values:value.nationality?.values?.filter(v=>v!==n)}})} aria-label={'إزالة '+n}>{n}<span aria-hidden="true">×</span></button>)}</div>
        <ChoiceSelect label="أضف جنسية" value="" onChange={addNationality} options={nationalityChoices.filter(option=>!value.nationality?.values?.some(v=>normalizeNationality(v)===normalizeNationality(option.value)))} placeholder="ابحث واختر الجنسية" disabled={(value.nationality?.values?.length??0)>=30} />
        <small>«أفضل» يرتّب النتائج حسب اختيارك. «شرط أساسي» يخفي غير المطابقين، ومن لم يذكر جنسيته.</small>
      </Mode>
    </Group>
    <Group title="الحياة السابقة والعادات" note="حدودك ومساحة تقبّلك" icon={Heart} open={reveal === "الحياة السابقة والعادات"} summary={selected(['maritalStatus','children','smoking'])}>
      <Mode title="الحالة الاجتماعية" value={value.maritalStatus?.mode ?? (required ? undefined : "any")} onChange={mode => change({ maritalStatus: mode === "any" ? { mode } : { values: ["never_married"], ...value.maritalStatus, mode } })}>
        <p>اختر الحالات التي تناسبك:</p><div className="nf-criterion-checks">{(Object.keys(maritalLabels) as Array<keyof typeof maritalLabels>).filter(status=>status !== 'married' || gender === 'woman').map(status => <label key={status}><input type="checkbox" checked={value.maritalStatus?.values?.includes(status) ?? false} onChange={e => change({ maritalStatus: { mode: value.maritalStatus?.mode ?? "prefer", values: e.target.checked ? [...(value.maritalStatus?.values ?? []), status] : value.maritalStatus?.values?.filter(v => v !== status) } })} />{maritalLabels[status]}</label>)}</div>
        {gender === 'woman' && <small>إذا كنتِ لا تقبلين متزوجًا حاليًا، اختاري الحالات الأخرى واجعليها «شرطًا أساسيًا». الموقف من التعدد مستقبلًا يحتاج إلى حديث واضح بينكما.</small>}
      </Mode>
      <Mode title="وجود أبناء" value={value.children?.mode ?? (required ? undefined : "any")} onChange={mode => change({ children: mode === "any" ? { mode } : { target: "none", ...value.children, mode } })}><p>أفضل أن يكون الطرف الآخر دون أبناء.</p><small>اختر «لا يهمني» إذا كنت منفتحًا على الحالتين.</small></Mode>
      <Mode title="التدخين" value={value.smoking?.mode ?? (required ? undefined : "any")} onChange={mode => change({ smoking: mode === "any" ? { mode } : { target: "never", mode } })}><p>أفضل شريكًا لا يدخّن.</p></Mode>
    </Group>
    {!sensitiveAllowed && <p className="nf-sensitive-note"><LockKeyhole size={16} aria-hidden="true"/><span>تفضيلات البشرة والخلفية القبلية تتطلب موافقتك الاختيارية على معالجة المعلومات الحساسة. لا تحتاج إليها لإكمال التسجيل.</span></p>}
  </div>;
}

export function PersonalityFields({ answers, onChange, registration = false, remainingOnly = false, required = false }: { answers: Record<string, string>; onChange: (value: { personalityAnswers: Record<string, string>; personalityVersion: typeof personalityVersion }) => void; registration?: boolean; remainingOnly?: boolean; required?: boolean }) {
  const [requestedIndex, setIndex] = useState(() => Math.max(0, personalityQuestions.findIndex(q => !q.options.some(o=>o.code===answers[q.id]))));
  const completedHere = useRef(new Set<string>());
  const positions = personalityQuestions.flatMap((q,i) => !remainingOnly || completedHere.current.has(q.id) || !q.options.some(o=>o.code===answers[q.id]) ? [i] : []);
  const index = positions.includes(requestedIndex) ? requestedIndex : positions[0] ?? 0;
  const position = positions.indexOf(index);
  const title = useRef<HTMLLegendElement>(null), previous = useRef(index);
  const card = useRef<HTMLFieldSetElement>(null), prompt = useRef<HTMLParagraphElement>(null);
  const question = personalityQuestions[index];
  const answered = question.options.some(option => option.code === answers[question.id]);
  const count = personalityQuestions.filter(q => q.options.some(o => o.code === answers[q.id])).length;
  const firstMissing = personalityQuestions.findIndex(q => !q.options.some(option => option.code === answers[q.id]));
  useLayoutEffect(() => { if (previous.current !== index) { previous.current = index; (registration ? prompt.current : title.current)?.focus({ preventScroll: true }); if (registration) card.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); } }, [index, registration]);
  function answer(value: string) { if (required && !value) return; completedHere.current.add(question.id); const next = { ...answers }; if (value) next[question.id] = value; else delete next[question.id]; onChange({ personalityAnswers: next, personalityVersion }); }
  const privacy = <div className="nf-detail-intro"><LockKeyhole size={19} strokeWidth={1.5} aria-hidden="true"/><p><strong>كن أنت. لا توجد إجابة مثالية.</strong><span>لا ننشر اختياراتك الفردية. نعرض للطرف الآخر ملخصًا مجمعًا لتشابه إجاباتكما ونقاطًا للنقاش.</span></p></div>;
  const explanation = <small>١٢ سؤالًا عن أسلوبك وطباعك، في أربعة محاور. {required ? 'اختر ما يشبهك في كل موقف لنكمل صورة شخصيتك. ' : 'يمكنك إكمالها لاحقًا. '}هي قراءة إرشادية وليست اختبارًا نفسيًا أو توقعًا لنجاح الزواج.</small>;
  return <section className="nf-personality" aria-label="أسئلة الشخصية">
    {!registration && privacy}
    <div className="nf-personality-progress"><span>{remainingOnly ? 'ملامح شخصيتك' : <>ملمح {arabicNumber(index + 1)} <i>/ {arabicNumber(personalityQuestions.length)}</i></>}</span><span aria-live="polite">{count === personalityQuestions.length ? 'اكتملت ملامح شخصيتك' : `${arabicNumber(count)} إجابات تعبّر عنك`}</span></div>
    <div className="nf-personality-meter" role="progressbar" aria-label="اكتمال إجابات الشخصية" aria-valuenow={count} aria-valuemin={0} aria-valuemax={personalityQuestions.length}><span style={{ transform: `scaleX(${count / personalityQuestions.length})` }} /></div>
    {positions.length>0 && <><details className="nf-question-map"><summary>خريطة الأسئلة <span>{remainingOnly ? 'المتبقي فقط' : 'راجع أي إجابة'}<ChevronLeft size={14} aria-hidden="true"/></span></summary><div>{positions.map(itemIndex=>{const item=personalityQuestions[itemIndex];return <button key={item.id} type="button" disabled={required && !answered && itemIndex > index} aria-label={`السؤال ${arabicNumber(itemIndex+1)}: ${item.title}${answers[item.id] ? '، تمت الإجابة' : ''}`} aria-current={index===itemIndex ? 'step' : undefined} data-answered={Boolean(answers[item.id])||undefined} onClick={event=>{setIndex(itemIndex);const panel=event.currentTarget.closest('details');if(panel)panel.open=false;}}><span>{arabicNumber(itemIndex+1)}</span>{answers[item.id]?<Check size={13} aria-hidden="true"/>:<i aria-hidden="true"/>}</button>})}</div></details>
    <fieldset key={question.id} ref={card} className="nf-personality-card"><legend ref={title} tabIndex={-1}><span aria-hidden="true">✦</span>{question.title}</legend><p ref={prompt} tabIndex={registration ? -1 : undefined}>{question.prompt}</p><AnswerScale label={question.prompt} value={answers[question.id]} options={question.options} onChange={answer}/></fieldset>
    <nav className="nf-personality-nav" aria-label="التنقل بين أسئلة الشخصية"><button type="button" disabled={position <= 0} onClick={() => setIndex(positions[position-1])}><ChevronRight size={17} aria-hidden="true" />السابق</button>{!required && <button type="button" className="nf-personality-later" onClick={() => { if (answers[question.id]) answer(""); else if (position < positions.length-1) setIndex(positions[position+1]); }}>{answers[question.id] ? 'إزالة الاختيار' : 'أجيب لاحقًا'}</button>}{position < positions.length-1 ? <button type="button" className="nf-personality-next" disabled={required && !answered} onClick={() => setIndex(positions[position+1])}>التالي<ChevronLeft size={17} aria-hidden="true" /></button> : firstMissing >= 0 && firstMissing !== index ? <button type="button" className="nf-personality-next" disabled={required && !answered} onClick={()=>setIndex(firstMissing)}>إكمال المتبقي<ChevronLeft size={17} aria-hidden="true"/></button> : <span className="nf-personality-last">{required && !answered ? "اختر إجابتك الأخيرة" : "آخر سؤال"}</span>}</nav></>}
    {count === personalityQuestions.length && <p className="nf-personality-complete" role="status"><Check size={18} aria-hidden="true"/>ملفك أصبح أغنى. يمكنك المتابعة للخطوة التالية.</p>}
    {registration ? <details className="nf-question-about"><summary><LockKeyhole size={15} aria-hidden="true"/><span>إجاباتك خاصة · كيف نستخدمها؟</span><ChevronLeft size={15} aria-hidden="true"/></summary><div>{privacy}{explanation}</div></details> : explanation}
  </section>;
}
