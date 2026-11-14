import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronRight, HeartHandshake, MapPin, ShieldCheck, Sparkles } from '../BrandIcons';
import { MotionPressButton, MotionReveal } from '../motion/Reanimated';
import { SheetChoiceSelect } from '../ui/SheetChoiceSelect';
import { cityOptions, professionOptions, educationOptions } from '../profile/profileOptions';
import { ageFromBirthday, latestAdultBirthday } from '../profile/birthday';
import { profilePrompts } from '../profile/profilePrompts';
import { ProfilePromptFields } from './ProfilePromptFields';
import { MarriageBasicsFields } from './MarriageFields';
import { ConsentChoice, ConsentGate } from '../legal/ConsentChoices';
import type { SignupConsents } from '../legal/consent';
import { arabicNumber, unresolvedDetailSlides, type Answers, type Chapter } from './draft';
import { generatedPublicProfileDraft, missingPublicProfileDraft, type PublicProfileDraft } from './profileDraftFallback';
import './signup-slides.css';

export type SignupSlidesHandle = { advance: () => boolean; back: () => boolean };
const details = ['المظهر واللباس','اللغات والتواصل','الخلفية والعائلة','بداية تناسبك','الزواج والتعدد','الأبناء والعادات','الدين في حياتي'];
const identityTitles = ['أهلًا بك. نبدأ باسمك.','متى يوم ميلادك؟','وين تقيم حاليًا؟','هل يناسبك مسار وُدَين؟'];
const storyTitles = ['عن يومك وطموحك.','خلّنا نسمع منك.','ثلاث لمحات تشبهك.','خطوتك القادمة.'];
const reviewedStoryTitles = ['راجع عملك ودراستك.','راجع نبذتك.','راجع اللمحات التي تظهر في ملفك.','راجع هدفك من الزواج.'];
const slideSubtitles = {
  identity: ['الاسم الذي سيظهر في ملفك.', 'نستخدمه لحساب العمر فقط؛ يبقى التاريخ خاصًا.', 'نقرّب لك الخيارات من المكان الذي تعيش فيه.', 'نتأكد من الأهلية قبل بدء جلسة التوافق.'],
  story: ['اختيار بسيط يساعد الطرف الآخر يفهم يومك.', 'جملة صادقة تكفي لبداية جميلة.', 'إجابات قصيرة تُظهر ما يهمك من غير مقابلة طويلة.', 'اختيارك يوضح أن التعارف هنا بقصد الزواج.'],
  details: ['لن نستخدمها إلا بالطريقة التي تختارها.', 'تفاصيل عملية تجعل التوافق أدق.', 'الخلفية التي تحب أن يعرفها الطرف الآخر.', 'التوقيت والطريقة التي تناسب بداية رسمية.', 'وضعك الحالي وما تقبله مستقبلًا.', 'تفاصيل يومية تؤثر في الحياة المشتركة.', 'إن اخترت مشاركتها، تساعد على فهم القيم المشتركة.'],
} as const;
const slideLabels = { identity: 'الأساسيات', story: 'حياتك', details: 'تفاصيلك' } as const;
export function signupSlideCount(chapter: Chapter) { return chapter==='identity'?4:chapter==='story'?4:8; }

/** Validates only the visible cluster. Missing later answers never move this slide. */
export function signupSlideError(chapter: Chapter, index: number, p: Answers, required: boolean, sensitive: boolean, publication = false): string | null {
  if(chapter==='identity') {
    if(index===0)return !p.displayName.trim()?'وش الاسم اللي تحب يظهر في ملفك؟':!p.gender?'اختر لإكمال ملفك.':null;
    if(index===1){const age=ageFromBirthday(p.birthDate??'');return age===null||age<18||age>110?'أدخل تاريخ ميلاد صحيحًا. التسجيل من عمر ١٨ عامًا.':null;}
    if(index===2)return p.city.trim()?null:'اختر مدينة إقامتك.';
    const b=p.marriageBasics??{};
    if(b.maritalStatus==='married'&&p.gender!=='man')return 'هذا المسار لا يتيح البحث عن زواج لحساب امرأة متزوجة حاليًا.';
    if(b.currentWives===4)return 'لا يدعم وُدَين البحث عن زواج إضافي مع وجود أربع زوجات حاليًا.';
    return !b.maritalStatus||!b.polygynyPreference||(b.maritalStatus==='married'&&!b.currentWives)?'أكمل وضعك الحالي وموقفك من التعدد.':null;
  }
  if(chapter==='story') {
    if(index===0)return !p.profession.trim()?'اختر مجال عملك أو وضعك المهني.':required&&!p.education?.trim()?'اختر مؤهلك الدراسي.':null;
    if(index===1)return p.bio.trim()?null:'جملة قصيرة عنك تكفي.';
    if(index===2)return required&&profilePrompts.some(prompt=>!p[prompt.key]?.trim())?'أكمل اللمحات الثلاث؛ جملة قصيرة لكل منها تكفي.':null;
    return required&&!p.marriageIntent?.trim()?'اختر ما يعبّر عن استعدادك.':null;
  }
  if(index===0)return required&&(!sensitive||!publication)?'راجع ووافق على معالجة التفاصيل الحساسة وعرضها لإكمال التسجيل.':null;
  const b=p.marriageBasics??{};
  if(index===1){
    if(required&&(b.heightCm===undefined||b.weightKg===undefined))return 'أدخل طولك ووزنك.';
    if(b.heightCm!==undefined&&(!Number.isInteger(b.heightCm)||b.heightCm<120||b.heightCm>230))return 'أدخل طولًا من ١٢٠ إلى ٢٣٠ سم.';
    if(b.weightKg!==undefined&&(!Number.isInteger(b.weightKg)||b.weightKg<35||b.weightKg>250))return 'أدخل وزنًا من ٣٥ إلى ٢٥٠ كجم.';
    if(sensitive&&!b.skinTone)return 'اختر درجة البشرة الأقرب لك.';
  }
  if(index===5&&b.maritalStatus==='married'&&p.gender!=='man')return 'هذا المسار لا يتيح البحث عن زواج لحساب امرأة متزوجة حاليًا.';
  if(index===5&&b.currentWives===4)return 'لا يدعم وُدَين البحث عن زواج إضافي مع وجود أربع زوجات حاليًا.';
  if(!required)return null;
  if(index===2&&(!b.spokenLanguages?.length||!b.preferredLanguage||!b.languageOpenness))return 'حدّد لغاتك وطريقة التواصل التي تناسبك.';
  if(index===3&&!b.nationality)return 'اختر جنسيتك.';
  if(index===4&&(!b.marriageTimeline||!b.meetingPreference))return 'اختر توقيت الزواج والخطوة الرسمية.';
  if(index===5&&(!b.maritalStatus||!b.polygynyPreference||(b.maritalStatus==='married'&&!b.currentWives)))return 'أكمل وضعك الحالي وموقفك من التعدد.';
  if(index===6&&(b.childrenCount===undefined||!b.smoking))return 'اختر عدد الأبناء وما يصف عاداتك.';
  return null;
}

type Props={ chapter: Chapter; answers: Answers; update:(value:Partial<Answers>)=>void; gender:(value:'man'|'woman')=>void; consents:SignupConsents; consent:(kind:'sensitiveProfile'|'sensitivePublication',value:boolean)=>void; required:boolean; aiDraftsReady?:boolean };
export const SignupBasicsSlides=forwardRef<SignupSlidesHandle,Props>(function SignupBasicsSlides({chapter,answers:p,update,gender,consents,consent,required,aiDraftsReady=false},ref){
  const total=signupSlideCount(chapter);
  const [detailSlides,setDetailSlides]=useState(()=>[0,...unresolvedDetailSlides(p,consents.sensitiveProfile)]);
  const slides=chapter==='details'?detailSlides:Array.from({length:total},(_,i)=>i);
  const [index,setIndex]=useState(()=>{
    // Saved answers reopen at the first unfinished slide, without losing anything.
    if(chapter==='details')return 0;
    const first=Array.from({length:total},(_,i)=>i).find(i=>signupSlideError(chapter,i,p,required,consents.sensitiveProfile,consents.sensitivePublication));
    return first===undefined?0:first;
  });
  const [error,setError]=useState<string|null>(null);
  const [direction,setDirection]=useState<'next'|'back'>('next');
  const [interacted,setInteracted]=useState(false);
  const [generatedDraft,setGeneratedDraft]=useState(false);
  const rewriteVersion=useRef(0);
  const heading=useRef<HTMLHeadingElement>(null);
  const container=useRef<HTMLDivElement>(null);
  const previous=useRef(index);
  const visibleIndex=slides[index]??slides.at(-1)??0;
  const last=index===slides.length-1;
  function move(next:number){setDirection(next>index?'next':'back');setError(null);setInteracted(false);setIndex(next);}
  useImperativeHandle(ref,()=>({
    advance(){const issue=signupSlideError(chapter,visibleIndex,p,required,consents.sensitiveProfile,consents.sensitivePublication);if(issue){setError(issue);return true;}if(chapter==='story'&&visibleIndex===0){const fallback=missingPublicProfileDraft(p);if(Object.keys(fallback).length){update(fallback);setGeneratedDraft(true);}}if(last)return false;move(index+1);return true;},
    back(){if(index===0)return false;move(index-1);return true;},
  }));
  useEffect(()=>{if(error&&!signupSlideError(chapter,visibleIndex,p,required,consents.sensitiveProfile,consents.sensitivePublication))setError(null);},[p,consents.sensitiveProfile,consents.sensitivePublication,error,chapter,visibleIndex,required]);
  useEffect(()=>{if(chapter!=='story'||!p.profession.trim())return;const fallback=missingPublicProfileDraft(p);if(!Object.keys(fallback).length)return;update(fallback);setGeneratedDraft(true);},[chapter]);
  useLayoutEffect(()=>{if(previous.current===index)return;previous.current=index;heading.current?.focus({preventScroll:true});container.current?.scrollIntoView({block:'start',behavior:'instant'});},[index]);
  const draftReady=aiDraftsReady||generatedDraft;
  const title=chapter==='identity'?identityTitles[visibleIndex]:chapter==='story'?(draftReady?reviewedStoryTitles[visibleIndex]:storyTitles[visibleIndex]):visibleIndex===0?'تفاصيل واضحة من البداية.':details[visibleIndex-1];
  const count=slides.length;
  const basics=p.marriageBasics??{};
  const answer=(value:Partial<Answers>)=>{setError(null);setInteracted(true);update(value);};
  const rephrase=(field:keyof PublicProfileDraft)=>{rewriteVersion.current+=1;answer({[field]:generatedPublicProfileDraft(p,rewriteVersion.current)[field]});setGeneratedDraft(true);};
  const slideChapter: 'identity'|'story'|'details' = chapter==='identity' ? 'identity' : chapter==='story' ? 'story' : 'details';
  const SlideIcon = slideChapter==='identity' ? ShieldCheck : slideChapter==='story' ? HeartHandshake : Sparkles;
  const subtitle = slideSubtitles[slideChapter][slideChapter==='details' ? Math.max(0,visibleIndex-1) : visibleIndex];
  const complete=interacted&&!signupSlideError(chapter,visibleIndex,p,required,consents.sensitiveProfile,consents.sensitivePublication);
  return <section ref={container} className="wd-signup-slides" aria-label="خطوات إعداد الملف" data-chapter={chapter} data-slide-index={visibleIndex}>
    <div className="wd-slide-progress"><span>{slideLabels[slideChapter]}</span><span className="wd-slide-position" data-complete={complete||undefined}>خطوة {arabicNumber(index+1)} <i>من {arabicNumber(count)}</i>{complete&&<Check size={13} aria-label="اكتملت الخطوة"/>}</span></div>
    <div className="wd-slide-track" role="progressbar" aria-label="الخطوة الحالية في هذا القسم" aria-valuemin={1} aria-valuemax={count} aria-valuenow={index+1}>{Array.from({length:count},(_,i)=><span key={i} data-state={i<index?'done':i===index?'current':undefined}/>)}</div>
    <MotionReveal key={`${chapter}:${index}`} className="wd-slide-content" data-complete={complete||undefined} axis="x" distance={direction==='next'?-18:18} duration={320}>
      <div className="wd-slide-heading"><span className="wd-slide-icon" data-complete={complete||undefined} aria-hidden="true">{complete?<Check size={20} strokeWidth={1.9}/>:<SlideIcon size={20} strokeWidth={1.7}/>}</span><div><span className="wd-slide-kicker">{subtitle}</span><h2 ref={heading} tabIndex={-1}>{title}</h2></div></div>
      <div className="wd-slide-body">
      {chapter==='story'&&draftReady&&<div className="wd-slide-draft-note" role="status"><Sparkles size={17} aria-hidden="true"/><div><strong>جهزنا لك مسودة من إجاباتك.</strong><span>راجع النص وعدّل أي كلمة قبل أن يظهر في ملفك.</span></div></div>}
      {chapter==='identity'&&visibleIndex===0&&<><label>الاسم المعروض<input data-field="displayName" autoComplete="nickname" value={p.displayName} maxLength={60} placeholder="اسمك الأول" required onChange={e=>answer({displayName:e.target.value})}/></label><fieldset className="nf-gender-segment"><legend>كيف نعرّفك؟</legend><div className="choice-row">{(['woman','man']as const).map(value=><button type="button" key={value} aria-pressed={p.gender===value} onClick={()=>{setError(null);setInteracted(true);gender(value);}}>{value==='woman'?'امرأة':'رجل'}{p.gender===value&&<Check size={16}/>}</button>)}</div></fieldset></>}
      {chapter==='identity'&&visibleIndex===1&&<><label>تاريخ الميلاد · ميلادي<input data-field="birthDate" type="date" dir="ltr" autoComplete="bday" value={p.birthDate??''} min="1900-01-01" max={latestAdultBirthday()} required onChange={e=>{const birthDate=e.target.value,age=ageFromBirthday(birthDate);answer({birthDate,age:age===null?'':String(age)});}}/></label>{p.birthDate&&ageFromBirthday(p.birthDate)!>=18&&<p className="wd-slide-detail">يظهر في ملفك: {arabicNumber(ageFromBirthday(p.birthDate)!)} عامًا</p>}</>}
      {chapter==='identity'&&visibleIndex===2&&<><p className="wd-slide-description">نقرّب لك الخيارات التي تناسب مكان حياتك.</p><div className="wd-slide-shortcuts" role="group" aria-label="اختيارات سريعة للمدينة">{['الرياض','جدة','الدمام'].map(city=><MotionPressButton type="button" key={city} aria-pressed={p.city===city} onClick={()=>answer({city})}><MapPin size={16}/>{city}{p.city===city&&<Check size={14}/>}</MotionPressButton>)}</div><SheetChoiceSelect label="مدينة الإقامة" value={p.city} options={cityOptions} onChange={city=>answer({city})} placeholder="اختر مدينة أخرى" required/></>}
      {chapter==='identity'&&visibleIndex===3&&<><p className="wd-slide-description">سؤالان واضحان قبل جلسة التوافق، حتى لا نأخذ من وقتك إذا لم يكن المسار مناسبًا.</p><MarriageBasicsFields activeSection="الزواج والتعدد" required value={basics} gender={p.gender} sensitiveAllowed={false} onChange={marriageBasics=>answer({marriageBasics})}/></>}
      {chapter==='story'&&visibleIndex===0&&<><SheetChoiceSelect label="مجال العمل أو الوضع المهني" value={p.profession} options={professionOptions} onChange={profession=>answer({profession})} required/><SheetChoiceSelect label="المؤهل الدراسي" value={p.education??''} options={educationOptions} onChange={education=>answer({education})} required={required}/></>}
      {chapter==='story'&&visibleIndex===1&&<><p className="wd-slide-description">{draftReady?'هذه صياغة أولية خاصة بك؛ خلك على النص أو عدّله بطريقتك.':'وش تحب في يومك؟ لمحة بسيطة، بأسلوبك أنت.'}</p><button type="button" className="wd-slide-rephrase" onClick={()=>rephrase('bio')}><Sparkles size={14} aria-hidden="true"/>إعادة الصياغة</button><label>نبذة عنك<textarea data-field="bio" value={p.bio} maxLength={1200} rows={3} required placeholder="بعيدًا عن العمل، أحب…" onChange={e=>answer({bio:e.target.value})}/></label></>}
      {chapter==='story'&&visibleIndex===2&&<ProfilePromptFields answers={p} update={answer} required={required} rephrase={rephrase}/>}
      {chapter==='story'&&visibleIndex===3&&<><div className="wd-slide-options">{['مستعد للخطوة الرسمية عند التوافق','أبحث عن توافق قبل تحديد الموعد','تعارف جاد يهدف إلى الزواج'].map(value=><MotionPressButton type="button" key={value} aria-pressed={p.marriageIntent===value} onClick={()=>answer({marriageIntent:value})}><span>{value==='تعارف جاد يهدف إلى الزواج'?'أبحث عن زواج جاد':value}</span>{p.marriageIntent===value&&<Check size={17}/>}</MotionPressButton>)}</div><div className="wd-slide-ai-note"><Sparkles size={17} aria-hidden="true"/><div><strong>{draftReady?'أنت صاحب القرار في كل ما يظهر.':'تُراجع كل صياغة قبل أن تظهر.'}</strong><span>{draftReady?'هذه المسودة مبنية على إجاباتك، ولن ننشرها قبل إرسال الملف للمراجعة.':'جلسة التوافق تساعدنا على فهم تفضيلاتك وشخصيتك، وأنت تؤكد الملخص بنفسك.'}</span></div></div></>}
      {chapter==='details'&&visibleIndex===0&&<><ConsentGate kind="sensitiveProfile" required={required} checked={consents.sensitiveProfile} change={v=>{setInteracted(true);consent('sensitiveProfile',v);setDetailSlides([0,...unresolvedDetailSlides(p,v)]);}} compact/>{consents.sensitiveProfile&&<ConsentChoice kind="sensitivePublication" required={required} checked={consents.sensitivePublication} change={v=>{setInteracted(true);consent('sensitivePublication',v);}}/>}<p className="wd-slide-description">{required?'هاتان الموافقتان مطلوبتان لإنشاء ملفك. تبقى إدارة خصوصيتك متاحة من الإعدادات.':'الموافقة على المعالجة لا تعني عرض التفاصيل في ملفك.'}</p></>}
      {chapter==='details'&&visibleIndex>0&&<MarriageBasicsFields activeSection={details[visibleIndex-1]} required={required} skinRequired={consents.sensitiveProfile} value={basics} gender={p.gender} sensitiveAllowed={consents.sensitiveProfile} onChange={marriageBasics=>answer({marriageBasics})}/>}
      </div>
    </MotionReveal>
    {error&&<p className="wd-slide-error" role="alert">{error}</p>}
    <div className="wd-slide-foot">{index>0?<button type="button" onClick={()=>move(index-1)}><ChevronRight size={16}/>السابق</button>:<span/>}</div>
  </section>;
});
