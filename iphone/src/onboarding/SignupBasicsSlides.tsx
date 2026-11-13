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
import { arabicNumber, type Answers, type Chapter } from './draft';
import './signup-slides.css';

export type SignupSlidesHandle = { advance: () => boolean; back: () => boolean };
const details = ['المظهر واللباس','اللغات والتواصل','الخلفية والعائلة','بداية تناسبك','الزواج والتعدد','الأبناء والعادات','الدين في حياتي'];
const identityTitles = ['أهلًا بك. نبدأ باسمك.','متى يوم ميلادك؟','وين تقيم حاليًا؟'];
const storyTitles = ['عن يومك وطموحك.','خلّنا نسمع منك.','ثلاث لمحات تشبهك.','خطوتك القادمة.'];
const slideSubtitles = {
  identity: ['الاسم الذي سيظهر في ملفك.', 'نستخدمه لحساب العمر فقط؛ يبقى التاريخ خاصًا.', 'نقرّب لك الخيارات من المكان الذي تعيش فيه.'],
  story: ['اختيار بسيط يساعد الطرف الآخر يفهم يومك.', 'جملة صادقة تكفي لبداية جميلة.', 'إجابات قصيرة تُظهر ما يهمك من غير مقابلة طويلة.', 'اختيارك يوضح أن التعارف هنا بقصد الزواج.'],
  details: ['لن نستخدمها إلا بالطريقة التي تختارها.', 'تفاصيل عملية تجعل التوافق أدق.', 'الخلفية التي تحب أن يعرفها الطرف الآخر.', 'التوقيت والطريقة التي تناسب بداية رسمية.', 'وضعك الحالي وما تقبله مستقبلًا.', 'تفاصيل يومية تؤثر في الحياة المشتركة.', 'إن اخترت مشاركتها، تساعد على فهم القيم المشتركة.'],
} as const;
const slideLabels = { identity: 'الأساسيات', story: 'حياتك', details: 'تفاصيلك' } as const;
export function signupSlideCount(chapter: Chapter) { return chapter==='identity'?3:chapter==='story'?4:8; }

/** Validates only the visible cluster. Missing later answers never move this slide. */
export function signupSlideError(chapter: Chapter, index: number, p: Answers, required: boolean, sensitive: boolean): string | null {
  if(chapter==='identity') {
    if(index===0)return !p.displayName.trim()?'وش الاسم اللي تحب يظهر في ملفك؟':!p.gender?'اختر لإكمال ملفك.':null;
    if(index===1){const age=ageFromBirthday(p.birthDate??'');return age===null||age<18||age>110?'أدخل تاريخ ميلاد صحيحًا. التسجيل من عمر ١٨ عامًا.':null;}
    return p.city.trim()?null:'اختر مدينة إقامتك.';
  }
  if(chapter==='story') {
    if(index===0)return !p.profession.trim()?'اختر مجال عملك أو وضعك المهني.':required&&!p.education?.trim()?'اختر مؤهلك الدراسي.':null;
    if(index===1)return p.bio.trim()?null:'جملة قصيرة عنك تكفي.';
    if(index===2)return required&&profilePrompts.some(prompt=>!p[prompt.key]?.trim())?'أكمل اللمحات الثلاث؛ جملة قصيرة لكل منها تكفي.':null;
    return required&&!p.marriageIntent?.trim()?'اختر ما يعبّر عن استعدادك.':null;
  }
  if(index===0)return null;
  const b=p.marriageBasics??{};
  if(index===1){
    if(required&&(b.heightCm===undefined||b.weightKg===undefined))return 'اختر طولك ووزنك.';
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

type Props={ chapter: Chapter; answers: Answers; update:(value:Partial<Answers>)=>void; gender:(value:'man'|'woman')=>void; consents:SignupConsents; consent:(kind:'sensitiveProfile'|'sensitivePublication',value:boolean)=>void; required:boolean };
export const SignupBasicsSlides=forwardRef<SignupSlidesHandle,Props>(function SignupBasicsSlides({chapter,answers:p,update,gender,consents,consent,required},ref){
  const total=signupSlideCount(chapter);
  const [index,setIndex]=useState(()=>{
    // Saved answers reopen at the first unfinished slide, without losing anything.
    if(chapter==='details')return 0;
    return Math.max(0,Array.from({length:total},(_,i)=>i).find(i=>signupSlideError(chapter,i,p,required,consents.sensitiveProfile))??0);
  });
  const [error,setError]=useState<string|null>(null);
  const [direction,setDirection]=useState<'next'|'back'>('next');
  const [interacted,setInteracted]=useState(false);
  const heading=useRef<HTMLHeadingElement>(null);
  const container=useRef<HTMLDivElement>(null);
  const previous=useRef(index);
  const last=index===total-1||(chapter==='details'&&index===total-2&&!consents.sensitiveProfile);
  function move(next:number){setDirection(next>index?'next':'back');setError(null);setInteracted(false);setIndex(next);}
  useImperativeHandle(ref,()=>({
    advance(){const issue=signupSlideError(chapter,index,p,required,consents.sensitiveProfile);if(issue){setError(issue);return true;}if(last)return false;move(index+1);return true;},
    back(){if(index===0)return false;move(index-1);return true;},
  }));
  useEffect(()=>{if(error&&!signupSlideError(chapter,index,p,required,consents.sensitiveProfile))setError(null);},[p,consents.sensitiveProfile,error,chapter,index,required]);
  useLayoutEffect(()=>{if(previous.current===index)return;previous.current=index;heading.current?.focus({preventScroll:true});container.current?.scrollIntoView({block:'start',behavior:'instant'});},[index]);
  const title=chapter==='identity'?identityTitles[index]:chapter==='story'?storyTitles[index]:index===0?'تفاصيلك، باختيارك.':details[index-1];
  const count=chapter==='details'&&!consents.sensitiveProfile?total-1:total;
  const basics=p.marriageBasics??{};
  const answer=(value:Partial<Answers>)=>{setError(null);setInteracted(true);update(value);};
  const slideChapter: 'identity'|'story'|'details' = chapter==='identity' ? 'identity' : chapter==='story' ? 'story' : 'details';
  const SlideIcon = slideChapter==='identity' ? ShieldCheck : slideChapter==='story' ? HeartHandshake : Sparkles;
  const subtitle = slideSubtitles[slideChapter][slideChapter==='details' ? Math.max(0,index-1) : index];
  const complete=interacted&&!signupSlideError(chapter,index,p,required,consents.sensitiveProfile);
  return <section ref={container} className="wd-signup-slides" aria-label="خطوات إعداد الملف" data-chapter={chapter} data-slide-index={index}>
    <div className="wd-slide-progress"><span>{slideLabels[slideChapter]}</span><span className="wd-slide-position" data-complete={complete||undefined}>خطوة {arabicNumber(index+1)} <i>من {arabicNumber(count)}</i>{complete&&<Check size={13} aria-label="اكتملت الخطوة"/>}</span></div>
    <div className="wd-slide-track" role="progressbar" aria-label="الخطوة الحالية في هذا القسم" aria-valuemin={1} aria-valuemax={count} aria-valuenow={index+1}>{Array.from({length:count},(_,i)=><span key={i} data-state={i<index?'done':i===index?'current':undefined}/>)}</div>
    <MotionReveal key={`${chapter}:${index}`} className="wd-slide-content" data-complete={complete||undefined} axis="x" distance={direction==='next'?-18:18} duration={320}>
      <div className="wd-slide-heading"><span className="wd-slide-icon" data-complete={complete||undefined} aria-hidden="true">{complete?<Check size={20} strokeWidth={1.9}/>:<SlideIcon size={20} strokeWidth={1.7}/>}</span><div><span className="wd-slide-kicker">{subtitle}</span><h2 ref={heading} tabIndex={-1}>{title}</h2></div></div>
      <div className="wd-slide-body">
      {chapter==='identity'&&index===0&&<><label>الاسم المعروض<input data-field="displayName" autoComplete="nickname" value={p.displayName} maxLength={60} placeholder="اسمك الأول" required onChange={e=>answer({displayName:e.target.value})}/></label><fieldset className="nf-gender-segment"><legend>كيف نعرّفك؟</legend><div className="choice-row">{(['woman','man']as const).map(value=><button type="button" key={value} aria-pressed={p.gender===value} onClick={()=>{setError(null);setInteracted(true);gender(value);}}>{value==='woman'?'امرأة':'رجل'}{p.gender===value&&<Check size={16}/>}</button>)}</div></fieldset></>}
      {chapter==='identity'&&index===1&&<><label>تاريخ الميلاد · ميلادي<input data-field="birthDate" type="date" dir="ltr" autoComplete="bday" value={p.birthDate??''} min="1900-01-01" max={latestAdultBirthday()} required onChange={e=>{const birthDate=e.target.value,age=ageFromBirthday(birthDate);answer({birthDate,age:age===null?'':String(age)});}}/></label>{p.birthDate&&ageFromBirthday(p.birthDate)!>=18&&<p className="wd-slide-detail">يظهر في ملفك: {arabicNumber(ageFromBirthday(p.birthDate)!)} عامًا</p>}</>}
      {chapter==='identity'&&index===2&&<><p className="wd-slide-description">نقرّب لك الخيارات التي تناسب مكان حياتك.</p><div className="wd-slide-shortcuts" role="group" aria-label="اختيارات سريعة للمدينة">{['الرياض','جدة','الدمام'].map(city=><MotionPressButton type="button" key={city} aria-pressed={p.city===city} onClick={()=>answer({city})}><MapPin size={16}/>{city}{p.city===city&&<Check size={14}/>}</MotionPressButton>)}</div><SheetChoiceSelect label="مدينة الإقامة" value={p.city} options={cityOptions} onChange={city=>answer({city})} placeholder="اختر مدينة أخرى" required/></>}
      {chapter==='story'&&index===0&&<><SheetChoiceSelect label="مجال العمل أو الوضع المهني" value={p.profession} options={professionOptions} onChange={profession=>answer({profession})} required/><SheetChoiceSelect label="المؤهل الدراسي" value={p.education??''} options={educationOptions} onChange={education=>answer({education})} required={required}/></>}
      {chapter==='story'&&index===1&&<><p className="wd-slide-description">وش تحب في يومك؟ لمحة بسيطة، بأسلوبك أنت.</p><label>نبذة عنك<textarea data-field="bio" value={p.bio} maxLength={1200} rows={3} required placeholder="بعيدًا عن العمل، أحب…" onChange={e=>answer({bio:e.target.value})}/></label></>}
      {chapter==='story'&&index===2&&<ProfilePromptFields answers={p} update={answer} required={required}/>}
      {chapter==='story'&&index===3&&<><div className="wd-slide-options">{['مستعد للخطوة الرسمية عند التوافق','أبحث عن توافق قبل تحديد الموعد','تعارف جاد يهدف إلى الزواج'].map(value=><MotionPressButton type="button" key={value} aria-pressed={p.marriageIntent===value} onClick={()=>answer({marriageIntent:value})}><span>{value==='تعارف جاد يهدف إلى الزواج'?'أبحث عن زواج جاد':value}</span>{p.marriageIntent===value&&<Check size={17}/>}</MotionPressButton>)}</div><div className="wd-slide-ai-note"><Sparkles size={17} aria-hidden="true"/><div><strong>بعدها نبدأ جلسة التوافق بالذكاء الاصطناعي.</strong><span>تساعدنا على فهم تفضيلاتك وشخصيتك، ثم تراجع الملخص بنفسك قبل أن يؤثر في الترشيحات.</span></div></div></>}
      {chapter==='details'&&index===0&&<><ConsentGate kind="sensitiveProfile" checked={consents.sensitiveProfile} change={v=>{setInteracted(true);consent('sensitiveProfile',v);}} compact/>{consents.sensitiveProfile&&<ConsentChoice kind="sensitivePublication" checked={consents.sensitivePublication} change={v=>{setInteracted(true);consent('sensitivePublication',v);}}/>}<p className="wd-slide-description">الاختيار محفوظ لك. الموافقة على المعالجة لا تعني عرض التفاصيل في ملفك.</p></>}
      {chapter==='details'&&index>0&&<MarriageBasicsFields activeSection={details[index-1]} required={required} skinRequired={consents.sensitiveProfile} value={basics} gender={p.gender} sensitiveAllowed={consents.sensitiveProfile} onChange={marriageBasics=>answer({marriageBasics})}/>}
      </div>
    </MotionReveal>
    {error&&<p className="wd-slide-error" role="alert">{error}</p>}
    <div className="wd-slide-foot">{index>0?<button type="button" onClick={()=>move(index-1)}><ChevronRight size={16}/>السابق</button>:<span/>}</div>
  </section>;
});
