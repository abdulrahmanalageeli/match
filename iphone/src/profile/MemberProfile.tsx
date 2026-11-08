import { useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ArrowRight, BookOpenCheck, BriefcaseBusiness, Check, Eye, Feather, Heart, ListFilter, LockKeyhole, MapPin, Sparkles, UserRound } from 'lucide-react';
import type { CommunitySource, PublicPerson } from '../community/data';
import { AvatarPortrait } from '../avatars/AvatarPortrait';
import { dressStyles, dressFlexibilities, skinTones } from '../compatibility/appearance';
import { interests } from '../compatibility/model';
import { FitDetails, preferencePercentage } from '../compatibility/FitDetails';
import { BeenaSummary } from '../beena/BeenaSummary';
import { ProfileGallery } from '../photos/ProfileGallery';
import { PortraitPhoto } from '../photos/PortraitPhoto';
import { marriageTimelineLabels, meetingPreferenceLabels, polygynyLabels, prayerPracticeLabels, religiousAffiliationLabels } from '../compatibility/marriage';
import './member-profile.css';
import { VerifiedBadge } from '../verification/VerifiedBadge';
import { ScenePaths } from '../ScenePaths';
import { MotionReveal } from '../motion/Reanimated';
import { SharedReadinessPassportPanel } from '../readiness/ReadinessPassport';

const ar = new Intl.NumberFormat('ar-SA');
type Fact = [string, string];
function Facts({ title, items }: {title: string; items: (Fact | false | undefined | '')[]}) {
  const visible = items.filter((item): item is Fact => Array.isArray(item));
  return visible.length ? <section className="mp-fact-group"><h2>{title}</h2><dl>{visible.map(([label,value])=><div key={label}><dt>{label}</dt><dd dir="auto">{value}</dd></div>)}</dl></section> : null;
}
function Story({title,children,accent=false}:{title:string;children:string;accent?:boolean}) {
  return <section className={'mp-story'+(accent?' mp-story-accent':'')}><h2>{accent?<Heart size={16}/>:<Feather size={16}/>} {title}</h2><p dir="auto">{children}</p></section>;
}
export function MemberProfile({person,source,back,backText,primary,children,identity,featured,preview=false,connectionId}: {
  person: PublicPerson; source?: CommunitySource | null; back:()=>void; backText:string;
  primary?:ReactNode; children?:ReactNode; identity?:RefObject<HTMLElement|null>; featured?:boolean; preview?:boolean; connectionId?:string;
}) {
  const [section,setSection]=useState<'about'|'details'|'fit'>('about');
  const [failed,setFailed]=useState(false);
  const [passportOpen,setPassportOpen]=useState(false);
  const passportButton=useRef<HTMLButtonElement>(null);
  const heading=useRef<HTMLHeadingElement>(null);const contentId=useId();
  useLayoutEffect(()=>{heading.current?.focus({preventScroll:true});},[]);
  const b=person.marriageBasics;
  const photo=!person.publicAvatar&&!failed&&person.demoPhoto?.startsWith('/demo/portraits/')?person.demoPhoto:undefined;
  const percentage=preferencePercentage(person.fit);
  const hasFit=!preview&&Boolean(person.fit||person.reasons.length);
  const hasDetails=Boolean(person.education||person.familyPreference||person.marriageIntent||b&&Object.values(b).some(v=>v!==undefined&&v!==''));
  const passportConnection=connectionId||(person.connectionStatus==='accepted'?person.connectionId:undefined);
  const canOpenPassport=!preview&&source?.readiness&&passportConnection&&(source.readinessEligibleConnection?.(passportConnection)??true);
  if(passportOpen&&canOpenPassport)return <SharedReadinessPassportPanel key={passportConnection} source={source} connectionId={passportConnection} name={person.alias} onBack={()=>{setPassportOpen(false);requestAnimationFrame(()=>passportButton.current?.focus());}}/>;
  return <article className="mp-profile screen-content" dir="rtl" data-self-preview={preview||undefined}>
    <header className="mp-navigation"><button type="button" className="mp-back" onClick={back}><ArrowRight size={18}/>{backText}</button><span>{preview?<><Eye size={14}/> معاينة ملفي</>:'ملف التعارف'}</span></header>
    {preview&&<p className="mp-preview-note"><Eye size={15}/><span>هكذا يظهر ملفك للأعضاء المؤهلين. هذه معاينة لبياناتك المحفوظة.</span></p>}
    <section className="mp-hero" data-weekly-featured={featured||undefined} ref={identity} aria-label={`ملف ${person.alias}`}>
      <ScenePaths className="mp-arrival-paths" parallax />
      <div className="mp-hero-copy"><span className="mp-eyebrow">تعارف له معنى</span><h1 ref={heading} tabIndex={-1}>{person.alias}{Number.isInteger(person.age)&&person.age>=18&&person.age<=110&&<small>{ar.format(person.age)} عامًا</small>}</h1><VerifiedBadge claims={person.manualVerifications}/>
        <div className="mp-meta">{person.city&&<span><MapPin size={14}/><bdi>{person.city}</bdi></span>}{person.occupation&&<span><BriefcaseBusiness size={14}/><bdi>{person.occupation}</bdi></span>}</div>
      </div>
      <div className="mp-portrait">{person.portrait?<PortraitPhoto portrait={person.portrait} source={source} alt={`الصورة الشخصية لـ ${person.alias}`}/>:person.publicAvatar?<AvatarPortrait avatar={person.publicAvatar}/>:photo?<img src={photo} alt={`صورة توضيحية لملف ${person.alias}`} onError={()=>setFailed(true)}/>:<span className="mp-monogram" aria-hidden="true">{Array.from(person.alias.trim())[0]||<UserRound size={44}/>}</span>}</div>
      <div className="mp-intention"><Heart size={13}/><span>{person.marriageIntent||'تعارف بقصد الزواج'}</span>{person.exclusive&&<strong><Check size={12}/> تعارف حصري</strong>}</div>
    </section>
    <div className="mp-portrait-caption">{person.isDemo?'حساب توضيحي لاختبار التجربة':person.portrait?person.portrait.blur>0?'صورة شخصية مع تمويه اختياري':'صورة شخصية اختيارية':person.publicAvatar?'صورة رمزية اختيارية':photo?'شخصية توضيحية · صورة مولّدة':<><LockKeyhole size={12}/> الصور تُشارك بخصوصية</>}</div>
    {!preview&&primary&&<div className="mp-primary">{primary}</div>}
    <div className="mp-sections" role="group" aria-label="أقسام الملف">
      <button type="button" aria-pressed={section==='about'} aria-controls={contentId} onClick={()=>setSection('about')}><Feather size={16} aria-hidden="true"/>نبذة وحياة</button>
      {hasDetails&&<button type="button" aria-pressed={section==='details'} aria-controls={contentId} onClick={()=>setSection('details')}><ListFilter size={16} aria-hidden="true"/>التفاصيل</button>}
      {hasFit&&<button type="button" aria-pressed={section==='fit'} aria-controls={contentId} onClick={()=>setSection('fit')}><Sparkles size={16} aria-hidden="true"/>التوافق{percentage!==null&&<span>{ar.format(percentage)}٪</span>}</button>}
    </div>
    <MotionReveal id={contentId} className="mp-content" key={section} axis="x" distance={-8} duration={340}>
      {section==='about'&&<>
        {canOpenPassport&&<button type="button" ref={passportButton} className="mp-passport-link" onClick={()=>setPassportOpen(true)}><BookOpenCheck size={22} aria-hidden="true"/><span><strong>جواز الجاهزية للزواج</strong><small>اطّلع على الأقسام التي اختار مشاركتها معك</small></span><ArrowRight size={16} aria-hidden="true"/></button>}
        {person.bio?<Story title="عنّي">{person.bio}</Story>:<p className="mp-empty">لم تُضف نبذة شخصية بعد.</p>}
        {person.lookingFor&&<Story title="الشريك الذي أتمناه" accent>{person.lookingFor}</Story>}
        {!!person.interests.length&&<section className="mp-interests"><h2>أشياء أحبّها</h2><div>{person.interests.map(item=><span key={item}>{interests.find(i=>i.id===item)?.label??item}</span>)}</div></section>}
        {source&&<ProfileGallery source={source} subject={preview?undefined:person.id} name={person.alias}/>}
        {person.valuesStatement&&<Story title="ما أقدّره في العلاقة">{person.valuesStatement}</Story>}
        {person.lifeTogether&&<Story title="الحياة التي أتخيلها">{person.lifeTogether}</Story>}
        {person.beenaStory&&<BeenaSummary story={person.beenaStory}/>}
      </>}
      {section==='details'&&<>
        <Facts title="حياتي اليوم" items={[
          b?.nationality&&['الجنسية',b.nationality],
          b?.maritalStatus&&['الحالة الاجتماعية',{never_married:'لم يسبق الزواج',divorced:'مطلّق / مطلّقة',widowed:'أرمل / أرملة',married:'متزوج'}[b.maritalStatus]],
          b?.maritalStatus==='married'&&b.currentWives!==undefined&&['عدد الزوجات حاليًا',ar.format(b.currentWives)],
          b?.childrenCount!==undefined&&['الأبناء',b.childrenCount===0?'ليس لدي أبناء':ar.format(b.childrenCount)],
          person.education&&['التعليم',person.education],
          b?.smoking&&['التدخين',{never:'لا أدخّن',sometimes:'أحيانًا',yes:'أدخّن'}[b.smoking]],
        ]}/>
        <Facts title="تفاصيل شخصية" items={[
          b?.heightCm!==undefined&&['الطول',ar.format(b.heightCm)+' سم'],b?.weightKg!==undefined&&['الوزن',ar.format(b.weightKg)+' كجم'],
          b?.skinTone&&['لون البشرة',skinTones.find(t=>t.value===b.skinTone)?.label??''],
          b?.dressStyle&&['غطاء الرأس',dressStyles.find(t=>t.value===b.dressStyle)?.label??''],
          b?.dressFlexibility&&b.dressFlexibility!=='prefer_not_to_say'&&['مناقشة غطاء الرأس',dressFlexibilities.find(t=>t.value===b.dressFlexibility)?.label??''],
          b?.tribalBackground&&b.tribalBackground!=='prefer_not_to_say'&&['الخلفية القبلية',b.tribalBackground==='tribal'?'قبلي':'غير قبلي'],
          b?.tribalBackground==='tribal'&&b.tribeName&&['القبيلة',b.tribeName],
        ]}/>
        <Facts title="بداية الزواج" items={[
          person.marriageIntent&&['النية من التعارف',person.marriageIntent],
          b?.marriageTimeline&&marriageTimelineLabels[b.marriageTimeline]&&['التوقيت المرغوب للزواج',marriageTimelineLabels[b.marriageTimeline]],
          b?.meetingPreference&&meetingPreferenceLabels[b.meetingPreference]&&['تفضيل اللقاء',meetingPreferenceLabels[b.meetingPreference]],
          person.familyPreference&&['إشراك الأهل',person.familyPreference],
        ]}/>
        <Facts title="قناعات وتطلّعات" items={[
          b?.polygynyPreference&&b.polygynyPreference!=='prefer_not_to_say'&&['الموقف من التعدد',polygynyLabels[b.polygynyPreference]],
          b?.religiousAffiliation&&b.religiousAffiliation!=='prefer_not_to_say'&&['المذهب',religiousAffiliationLabels[b.religiousAffiliation]],
          b?.prayerPractice&&b.prayerPractice!=='prefer_not_to_say'&&['الصلاة',prayerPracticeLabels[b.prayerPractice]],
        ]}/>
      </>}
      {section==='fit'&&<section className="mp-fit">{person.fit?<FitDetails fit={person.fit}/>:<><h2>ما يجمعكما</h2><ul>{person.reasons.map(reason=><li key={reason}><Check size={15}/>{reason}</li>)}</ul></>}</section>}
    </MotionReveal>
    {preview&&<p className="mp-preview-footnote"><Sparkles size={16}/><span>نسبة التوافق تختلف من شخص لآخر؛ تظهر عند مقارنة تقييميكما. إجابات التقييم ومتطلبات الشريك الخاصة لا تظهر في هذا الملف.</span></p>}
    {!preview&&children&&<footer className="mp-secondary">{children}</footer>}
  </article>;
}
