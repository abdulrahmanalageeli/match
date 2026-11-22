import { MemberNameFields } from './MemberNameFields';
import { dimensionsForVersion } from '../compatibility/practical-catalog';
import { familyContext } from './familyContext';
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { Check, Eye, MapPin, Pencil } from '../BrandIcons';
import { MotionPressButton, MotionReveal } from '../motion/Reanimated';
import { SheetChoiceSelect } from '../ui/SheetChoiceSelect';
import { cityOptions, professionOptions, educationOptions, nationalityChoices } from '../profile/profileOptions';
import { ageFromBirthday, latestAdultBirthday } from '../profile/birthday';
import { profilePrompts } from '../profile/profilePrompts';
import { ProfilePromptFields } from './ProfilePromptFields';
import { MarriageBasicsFields } from './MarriageFields';
import { ConsentChoice, ConsentGate } from '../legal/ConsentChoices';
import type { SignupConsents } from '../legal/consent';
import { arabicNumber, remainingDetailFields, type Answers, type Chapter } from './draft';
import { generatedBio } from './profileDraftFallback';
import './signup-slides.css';

export type SignupSlidesHandle = { advance: () => boolean; back: () => boolean };
const details = ['المظهر واللباس','اللغات والتواصل','الخلفية والعائلة','بداية تناسبك','الزواج والتعدد','الأبناء والعادات','الدين في حياتي','خطط الحياة الزوجية'];
const identityTitles = ['أهلًا بك. نبدأ باسمك.','متى يوم ميلادك؟','مدينة إقامتك وجنسيتك','هل يناسبك مسار وُدَين؟'];
const storyTitles = ['عن يومك وطموحك.','خلّنا نسمع منك.','ثلاث لمحات تشبهك.','نيّتك في ملفك.'];
const slideSubtitles = {
  identity: ['', 'نستخدمه لحساب العمر فقط؛ يبقى التاريخ خاصًا.', 'نقرّب لك الخيارات من المكان الذي تعيش فيه.', 'نتأكد من الأهلية قبل بدء جلسة التوافق.'],
  story: ['اختيار بسيط يساعد الطرف الآخر يفهم يومك.', 'نبذتك للأعضاء المؤهلين. وش تحب يعرفون عنك؟', 'إجابات قصيرة تُظهر ما يهمك من غير مقابلة طويلة.', 'وش تبي الطرف الآخر يعرف عن نيّتك من التعارف؟'],
  details: ['لن نستخدمها إلا بالطريقة التي تختارها.', 'تفاصيل عملية تجعل التوافق أدق.', 'الخلفية التي تحب أن يعرفها الطرف الآخر.', 'التوقيت والطريقة التي تناسب بداية رسمية.', 'وضعك الحالي وما تقبله مستقبلًا.', 'تفاصيل يومية تؤثر في الحياة المشتركة.', 'إن اخترت مشاركتها، تساعد على فهم القيم المشتركة.', 'توقعات واضحة للسكن والمصاريف وبداية حياتكما.'],
} as const;
export function signupSlideCount(chapter: Chapter) { return chapter==='identity'?4:chapter==='story'?4:9; }

/** Validates only the visible cluster. Missing later answers never move this slide. */
export function signupSlideError(chapter: Chapter, index: number, p: Answers, required: boolean, sensitive: boolean, publication = false): string | null {
  if(chapter==='identity') {
    if(index===0)return !p.firstName?.trim()?'أدخل اسمك الأول.':!p.lastName?.trim()?'أدخل اسم العائلة.':!p.displayName.trim()?'وش الاسم اللي تحب يظهر في ملفك؟':!p.gender?'اختر لإكمال ملفك.':null;
    if(index===1){const age=ageFromBirthday(p.birthDate??'');return age===null||age<18||age>110?'أدخل تاريخ ميلاد صحيحًا. التسجيل من عمر ١٨ عامًا.':null;}
    if(index===2){
      if(!p.city.trim())return 'اختر مدينة إقامتك.';
      return p.marriageBasics?.nationality ? null : 'اختر جنسيتك.';
    }
    const b=p.marriageBasics??{};
    if(b.maritalStatus==='married'&&p.gender!=='man')return 'هذا المسار لا يتيح البحث عن زواج لحساب امرأة متزوجة حاليًا.';
    if(b.currentWives===4)return 'لا يدعم وُدَين البحث عن زواج إضافي مع وجود أربع زوجات حاليًا.';
    return !b.maritalStatus||(familyContext(p.gender,b).askWifeCount&&!b.currentWives)?'أكمل حالتك الاجتماعية الحالية.':null;
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
  if(index===4&&(!b.marriageTimeline||!b.meetingPreference))return 'حدّد توقيت إتمام الزواج وطريقة اللقاء.';
  if(index===5&&(!b.maritalStatus||!b.polygynyPreference||(familyContext(p.gender,b).askWifeCount&&!b.currentWives)))return 'أكمل وضعك الحالي وموقفك من التعدد.';
  if(index===6&&(familyContext(p.gender,b).childrenCount===undefined||!b.smoking))return 'اختر عدد الأبناء وما يصف عاداتك.';
  return null;
}

type Props={ chapter: Chapter; answers: Answers; update:(value:Partial<Answers>)=>void; gender:(value:'man'|'woman')=>void; consents:SignupConsents; consent:(kind:'sensitiveProfile'|'sensitivePublication',value:boolean)=>void; required:boolean; reviewing?:boolean };
export const SignupBasicsSlides=forwardRef<SignupSlidesHandle,Props>(function SignupBasicsSlides({chapter,answers:p,update,gender,consents,consent,required,reviewing=false},ref){
  const total=signupSlideCount(chapter);
  // Keep the questions shown on entering a section stable while the member answers.
  const [entryAnswers, setEntryAnswers] = useState(p);
  const [allDetails, setAllDetails] = useState(reviewing || !required);
  const remaining = chapter === 'details' && !allDetails ? remainingDetailFields(entryAnswers, consents.sensitiveProfile) : undefined;
  const allSlides = Array.from({length:total}, (_,i) => i);
  const knownSlide = (slide:number) => !reviewing && (chapter === 'identity' || chapter === 'story' && required) &&
    !signupSlideError(chapter,slide,entryAnswers,required,consents.sensitiveProfile,consents.sensitivePublication);
  const remainingStory = chapter === 'story' && required && !reviewing ? allSlides.filter(i => !knownSlide(i)) : [];
  let slides = remainingStory.length ? remainingStory : allSlides;
  if (chapter === 'details') {
    slides = remaining ? [0,...new Set(remaining.map(item => item.slide))] : allSlides.filter(i => i !== 7 || consents.sensitiveProfile);
  }
  const [index,setIndex]=useState(()=>{
    // Saved answers reopen at the first unfinished slide, without losing anything.
    if(chapter==='details'||reviewing)return 0;
    const first=slides.findIndex(i=>signupSlideError(chapter,i,p,required,consents.sensitiveProfile,consents.sensitivePublication));
    return Math.max(0,first);
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
    advance(){const issue=signupSlideError(chapter,visibleIndex,p,required,consents.sensitiveProfile,consents.sensitivePublication);if(issue){setError(issue);return true;}
      if(chapter==='details' && visibleIndex===0 && !allDetails) {
        setEntryAnswers(p);
        if(!remainingDetailFields(p,consents.sensitiveProfile).length)return false;
        move(1);return true;
      }
      if(chapter==='story'&&visibleIndex===0){const bio=generatedBio(p);if(!p.bio.trim() && bio){update({bio});setGeneratedDraft(true);}}if(last)return false;
      const next = slides.findIndex((slide, at) => at > index && (!knownSlide(slide) || signupSlideError(chapter,slide,p,required,consents.sensitiveProfile,consents.sensitivePublication)));
      if(next < 0)return false;
      move(next);return true;},
    back(){if(index===0)return false;move(index-1);return true;},
  }));
  useEffect(()=>{if(error&&!signupSlideError(chapter,visibleIndex,p,required,consents.sensitiveProfile,consents.sensitivePublication))setError(null);},[p,consents.sensitiveProfile,consents.sensitivePublication,error,chapter,visibleIndex,required]);
  useEffect(()=>{if(chapter!=='story'||!p.profession.trim())return;if(p.bio.trim())return;const bio=generatedBio(p);if(bio){update({bio});setGeneratedDraft(true);}},[chapter]);
  useLayoutEffect(()=>{
    if(previous.current===index)return;
    previous.current=index;
    heading.current?.focus({preventScroll:true});
    container.current?.closest<HTMLElement>('[data-nf-keyboard-form]')?.scrollTo({top:0,behavior:'instant'});
    window.scrollTo({top:0,behavior:'instant'});
  },[index]);
  const draftReady=generatedDraft && visibleIndex === 1;
  const consentSlide = chapter === 'details' && visibleIndex === 0;
  const title=chapter==='identity'?identityTitles[visibleIndex]:chapter==='story'?(draftReady?'راجع نبذتك.':storyTitles[visibleIndex]):consentSlide?'من يطّلع على تفاصيلك الحساسة؟':details[visibleIndex-1];
  const count=slides.length;
  const basics=p.marriageBasics??{};
  const answer=(value:Partial<Answers>)=>{setError(null);setInteracted(true);update(value);};
  const rephraseBio=()=>{rewriteVersion.current+=1;answer({bio:generatedBio(p,rewriteVersion.current)});setGeneratedDraft(true);};
  const slideChapter: 'identity'|'story'|'details' = chapter==='identity' ? 'identity' : chapter==='story' ? 'story' : 'details';
  const formalTiming = chapter === 'details' && visibleIndex === 4 && remaining?.some(item => item.field === 'marriageTimeline')
    ? dimensionsForVersion(p.assessmentVersion).find(topic => topic.id === 'marriage_timeline')?.options.find(option => option.code === p.surveyAnswers?.marriage_timeline)?.self
    : undefined;
  const subtitle = consentSlide
    ? required
      ? consents.sensitiveProfile && consents.sensitivePublication
        ? 'بعد دخول التطبيق، يمكنك إيقاف العرض من «تعديل الملف» في الإعدادات.'
        : 'يتطلّب التسجيل درجة البشرة وموافقتين للمعالجة والعرض. يمكنك إيقاف العرض لاحقًا من الإعدادات.'
      : 'يمكنك الموافقة على استخدام التفاصيل في التوافق، ثم اختيار ما إذا كنت تسمح بعرضها للأعضاء المؤهلين.'
    : formalTiming ? `أول خطوة رسمية: ${formalTiming}. بقي توقيت الزواج نفسه.` : slideSubtitles[slideChapter][slideChapter==='details' ? visibleIndex-1 : visibleIndex];
  const complete=interacted&&!signupSlideError(chapter,visibleIndex,p,required,consents.sensitiveProfile,consents.sensitivePublication);
  const birthdayAge = chapter === 'identity' && visibleIndex === 1 ? ageFromBirthday(p.birthDate ?? '') : null;
  const publicAge = birthdayAge !== null && birthdayAge >= 18 && birthdayAge <= 110 ? birthdayAge : null;
  return <section ref={container} className="wd-signup-slides" aria-label="خطوات إعداد الملف" data-chapter={chapter} data-slide-index={visibleIndex}>
    <MotionReveal key={`${chapter}:${index}`} className="wd-slide-content" data-complete={complete||undefined} axis="x" distance={direction==='next'?-10:10} fromOpacity={0.86} duration={200}>
      <div className="wd-slide-heading">
        <h1 ref={heading} tabIndex={-1}>{title}</h1>
        <span className="wd-step-count" role="progressbar" aria-label="خطوات هذا القسم" aria-valuemin={1} aria-valuemax={count}
          aria-valuenow={index+1} aria-valuetext={`الخطوة ${arabicNumber(index+1)} من ${arabicNumber(count)}${complete?'، اكتملت الإجابة':''}`}>خطوة {arabicNumber(index+1)} من {arabicNumber(count)}</span>
        {subtitle && <p className="wd-slide-kicker">{subtitle}</p>}
      </div>
      <div className="wd-slide-body">
      {chapter==='story'&&draftReady&&<div className="wd-slide-draft-note" role="status"><div><strong>جهزنا لك مسودة من إجاباتك.</strong><span>راجع النص وعدّل أي كلمة قبل أن يظهر في ملفك.</span></div></div>}
      {chapter==='identity'&&visibleIndex===0&&<><MemberNameFields answers={p} update={answer} required/><fieldset className="nf-gender-segment"><legend>كيف نعرّفك؟</legend><div className="choice-row">{(['woman','man']as const).map(value=><button type="button" key={value} aria-pressed={p.gender===value} onClick={()=>{setError(null);setInteracted(true);gender(value);}}>{value==='woman'?'امرأة':'رجل'}{p.gender===value&&<Check size={16}/>}</button>)}</div></fieldset></>}
      {chapter==='identity'&&visibleIndex===1&&<>
        <label className="wd-birthday-field">{p.birthDate ? "تاريخ الميلاد · ميلادي" : "اختر تاريخ ميلادك · ميلادي"}
          <input id="wd-birthday" data-field="birthDate" type="date" dir="ltr" autoComplete="bday" value={p.birthDate??''} min="1900-01-01" max={latestAdultBirthday()} required aria-invalid={error ? true : undefined} aria-describedby={error ? 'wd-slide-error' : undefined} onChange={e=>{const birthDate=e.target.value,age=ageFromBirthday(birthDate);answer({birthDate,age:age===null?'':String(age)});}}/>
        </label>
        <div className="wd-age-window" data-ready={publicAge !== null || undefined}>
          <div className="wd-window-caption"><Eye size={16} aria-hidden="true"/><span>ما يظهر في ملفك</span></div>
          <div className="wd-window-opening">
            <div><small>للأعضاء المؤهلين</small><strong dir="auto">{p.displayName || 'اسمك المعروض'}</strong></div>
            <output htmlFor="wd-birthday" aria-live="polite" aria-atomic="true">
              {publicAge === null ? <span aria-label="لم يتحدد العمر">—</span> : <span key={publicAge} data-age>{arabicNumber(publicAge)}<small>عامًا</small></span>}
            </output>
          </div>
        </div>
      </>}
      {chapter==='identity'&&visibleIndex===2&&<><div className="wd-slide-shortcuts" role="group" aria-label="اختيارات سريعة للمدينة">{['الرياض','جدة','الدمام'].map(city=><MotionPressButton type="button" key={city} aria-pressed={p.city===city} onClick={()=>answer({city})}><MapPin size={16}/>{city}{p.city===city&&<Check size={14}/>}</MotionPressButton>)}</div>
        <div className="wd-slide-picker-group">
          <SheetChoiceSelect label="مدينة الإقامة" value={p.city} options={cityOptions} onChange={city=>answer({city})} placeholder="اختر مدينة أخرى" required/>
          <SheetChoiceSelect label="ما جنسيتك؟" value={basics.nationality ?? ''} options={nationalityChoices} onChange={nationality=>answer({marriageBasics:{...basics,nationality}})} placeholder="اختر الجنسية" required/>
        </div>
      </>}
      {chapter==='identity'&&visibleIndex===3&&<><p className="wd-slide-description">نبدأ بالحالة الاجتماعية للتأكد من الأهلية. يمكنك تحديد تفضيلاتك للزواج لاحقًا في تفاصيل ملفك.</p><MarriageBasicsFields eligibilityOnly activeSection="الزواج والتعدد" required value={basics} gender={p.gender} sensitiveAllowed={false} onChange={marriageBasics=>answer({marriageBasics})}/></>}
      {chapter==='story'&&visibleIndex===0&&<div className="wd-slide-picker-group">
        {(reviewing || !entryAnswers.profession.trim() || knownSlide(0)) && <SheetChoiceSelect label="مجال العمل أو الوضع المهني" value={p.profession} options={professionOptions} onChange={profession=>answer({profession})} required/>}
        {(reviewing || !entryAnswers.education?.trim() || knownSlide(0)) && <SheetChoiceSelect label="المؤهل الدراسي" value={p.education??''} options={educationOptions} onChange={education=>answer({education})} required={required}/>}
      </div>}
      {chapter==='story'&&visibleIndex===1&&<>{[generatedBio(p),generatedBio(p,1)].includes(p.bio) && <button type="button" className="wd-slide-rephrase" onClick={rephraseBio}><Pencil size={14} aria-hidden="true"/>إعادة الصياغة</button>}<label>نبذة عنك<textarea data-field="bio" value={p.bio} maxLength={1200} rows={3} required placeholder="بعيدًا عن العمل، أحب…" onChange={e=>answer({bio:e.target.value})}/></label></>}
      {chapter==='story'&&visibleIndex===2&&<ProfilePromptFields remainingOnly={required && !reviewing} answers={p} update={answer} required={required}/>}
      {chapter==='story'&&visibleIndex===3&&<><div className="wd-slide-options">{['مستعد للخطوة الرسمية عند التوافق','أبحث عن توافق قبل تحديد الموعد','تعارف جاد يهدف إلى الزواج'].map(value=><MotionPressButton type="button" key={value} aria-pressed={p.marriageIntent===value} onClick={()=>answer({marriageIntent:value})}><span>{value==='تعارف جاد يهدف إلى الزواج'?'أبحث عن زواج جاد':value}</span>{p.marriageIntent===value&&<Check size={17}/>}</MotionPressButton>)}</div></>}
      {consentSlide && <>
        <ConsentGate kind="sensitiveProfile" required={required} checked={consents.sensitiveProfile} change={v=>{setInteracted(true);consent('sensitiveProfile',v);setEntryAnswers(p);}} compact/>
        {consents.sensitiveProfile && <ConsentChoice kind="sensitivePublication" required={required} checked={consents.sensitivePublication} change={v=>{setInteracted(true);consent('sensitivePublication',v);}}/>}
        {required && !reviewing && consents.sensitiveProfile && consents.sensitivePublication && <details className="nf-intake-draft-help"><summary>تعديل التفاصيل المحفوظة وإضافة الاختياري</summary>
          <p>يمكنك تعديل إجاباتك أو إضافة تفاصيل مثل مدينة الأصل وخطط السكن هنا أو في المراجعة الأخيرة.</p>
          <button type="button" className="nf-intake-policy" aria-pressed={allDetails} onClick={()=>setAllDetails(!allDetails)}>{allDetails?'عرض الأسئلة المتبقية فقط':'عرض كل تفاصيل الملف'}</button>
        </details>}
      </>}
      {chapter==='details'&&visibleIndex>0&&<MarriageBasicsFields fields={remaining?.filter(item=>item.slide===visibleIndex).map(item=>item.field)} activeSection={details[visibleIndex-1]} required={required} skinRequired={consents.sensitiveProfile} value={basics} gender={p.gender} sensitiveAllowed={consents.sensitiveProfile} onChange={marriageBasics=>answer({marriageBasics})}/>}
      </div>
    </MotionReveal>
    {error&&<p id="wd-slide-error" className="wd-slide-error" role="alert">{error}</p>}
  </section>;
});
