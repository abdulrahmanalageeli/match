import { mahrRanges } from '../compatibility/marriage';
import {MemberBadge} from '../membership/MemberBadge';
import {useMembershipAccess} from '../membership/access';
import { languageOpennessLabels } from "../compatibility/marriage";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { MoreHorizontal, Flag, ArrowRight, BookOpenCheck, BriefcaseBusiness, CalendarDays, GraduationCap, MapPin, Check, ChevronDown, Eye, Feather, Heart, ListFilter, LockKeyhole, Sparkles, UserRound } from "../BrandIcons";
import type { CommunitySource, PublicPerson } from '../community/data';
import { denied } from '../community/chatOutbox';
import { AvatarPortrait } from '../avatars/AvatarPortrait';
import { dressStyles, dressFlexibilities, skinTones } from '../compatibility/appearance';
import { interests } from '../compatibility/model';
import { FitDetails } from '../compatibility/FitDetails';
import { BeenaSummary } from '../beena/BeenaSummary';
import { ProfileGallery } from '../photos/ProfileGallery';
import { PortraitPhoto } from '../photos/PortraitPhoto';
import { marriageTimelineLabels, meetingPreferenceLabels, polygynyLabels, prayerPracticeLabels, religiousAffiliationLabels } from '../compatibility/marriage';
import './member-profile.css';
import { VerifiedBadge } from '../verification/VerifiedBadge';
import { ScenePaths } from '../ScenePaths';
import { MotionPressButton, MotionReveal } from '../motion/Reanimated';
import { SharedReadinessPassportPanel } from '../readiness/ReadinessPassport';
import { canonicalCity } from './profileOptions';
import { marriagePlanKeys, marriagePlanQuestions, marriagePlanLabel } from '../compatibility/marriagePlans';
import { PersonalPrompts } from './PersonalPrompts';

const ar = new Intl.NumberFormat('ar-SA');
type Fact = [string, string];
function Facts({ title, items, initiallyOpen=false }: {title: string; items: (Fact | false | undefined | '')[]; initiallyOpen?: boolean}) {
  const visible = items.filter((item): item is Fact => Array.isArray(item) && typeof item[1] === 'string' && !!item[1].trim());
  return visible.length ? <details className="mp-fact-group" open={initiallyOpen || undefined}>
    <summary><span className="mp-fact-heading"><strong role="heading" aria-level={2}>{title}</strong></span><ChevronDown size={16} className="mp-fact-chevron" aria-hidden="true"/></summary>
    <dl>{visible.map(([label,value])=><div key={label}><dt>{label}</dt><dd dir="auto">{value}</dd></div>)}</dl>
  </details> : null;
}
const validCount = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
export function MemberProfile({person,source,back,backText,primary,children,identity,featured,preview=false,connectionId,onReport,onBlock,interestAction}: {
  person: PublicPerson; source?: CommunitySource | null; back:()=>void; backText:string;
  primary?:ReactNode; children?:ReactNode; identity?:RefObject<HTMLElement|null>; featured?:boolean; preview?:boolean; connectionId?:string; onReport?:()=>void; onBlock?:()=>void;
  interestAction?: { toggle:()=>void; busy:boolean; notice:string; error:string };
}) {
  const {premium,upgrade,gift}=useMembershipAccess();
  const canGift=Boolean(gift&&!preview&&!person.isDemo);
  const [section,setSection]=useState<'about'|'details'|'fit'>('about');
  const [failed,setFailed]=useState(false);
  const [passportOpen,setPassportOpen]=useState(false);
  const passportButton=useRef<HTMLButtonElement>(null);
  const sections=useRef<HTMLDivElement>(null);
  const heading=useRef<HTMLHeadingElement>(null);const contentId=useId();
  const [visible,setVisible] = useState<{id:string; source:CommunitySource; status:'allowed'|'denied'|'error'} | null>(null);
  const [attempt, setAttempt] = useState(0);
  const check = !preview && !person.isDemo && source?.profileVisible;
  const access = !check ? 'allowed' : visible?.id === person.id && visible.source === source ? visible.status : 'loading';
  useLayoutEffect(()=>{if (access === 'allowed') heading.current?.focus({preventScroll:true});},[access,person.id]);
  useEffect(()=>{
    if (!check || !source) return;
    let active=true, sequence=0;
    const refresh=async()=>{
      const current=++sequence;
      if (document.hidden) {setVisible(null); return;}
      try {
        const allowed = await check(person.id);
        if(active && current===sequence)setVisible({id:person.id,source,status:allowed?'allowed':'denied'});
      } catch (cause) {
        if(active && current===sequence)setVisible({id:person.id,source,status:denied(cause)?'denied':'error'});
      }
    };
    void refresh();
    const stop=source.watch(refresh), timer=window.setInterval(refresh,10000);
    document.addEventListener('visibilitychange',refresh);
    return ()=>{active=false;stop();clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
  },[check,source,person.id,attempt]);
  if(access !== 'allowed') return <article className="mp-profile screen-content" dir="rtl">
    <button className="mp-back" type="button" onClick={back}><ArrowRight size={18}/>{backText}</button>
    <p role={access === 'error' ? 'alert' : 'status'}>{access === 'error' ? 'تعذّر التحقق من إتاحة الملف. تحقّق من اتصالك وحاول مجددًا.' : access === 'denied' ? 'الملف غير متاح.' : 'جارٍ فتح الملف…'}</p>
    {access === 'error' && <button className="btn-secondary" onClick={()=>{setVisible(null);setAttempt(value=>value+1);}}>إعادة المحاولة</button>}
  </article>;
  const b=person.marriageBasics;
  const privateDemo = person.isDemo && (source?.simulation || source?.demoInteractions || source?.familyTestMode);
  const photo=!person.publicAvatar&&!failed&&person.demoPhoto?.startsWith('/demo/portraits/')?person.demoPhoto:undefined;
  const hasFit=premium&&!person.compatibilityLocked&&!preview&&Boolean(person.fit||person.reasons.length);
  const visibleSection=section==='fit'&&!hasFit?'about':section;
  const hasAge=Number.isInteger(person.age)&&person.age>=18&&person.age<=110;
  const hasDetails=Boolean(person.exclusive||person.manualVerifications?.length||person.familyPreference||person.marriageIntent||b&&Object.values(b).some(v=>v!==undefined&&v!==null&&v!==''));
  const passportConnection=connectionId||(person.connectionStatus==='accepted'?person.connectionId:undefined);
  const canOpenPassport=!preview&&source?.readiness&&passportConnection&&(source.readinessEligibleConnection?.(passportConnection)??true);
  const corners = [
    {area:'age', label:'العمر', value:hasAge && ar.format(person.age)+' عامًا', icon:CalendarDays},
    {area:'city', label:'المدينة', value:person.city && canonicalCity(person.city), icon:MapPin},
    {area:'work', label:'العمل', value:person.occupation, icon:BriefcaseBusiness},
    {area:'education', label:'التعليم', value:person.education, icon:GraduationCap},
  ];
  function selectSection(next:typeof section){
    if(next===visibleSection)return;
    const top=sections.current?.getBoundingClientRect().top??100;
    const stickyTop=sections.current?parseFloat(getComputedStyle(sections.current).top)||0:0;
    const pinned=top>=stickyTop-1&&top<=stickyTop+10;
    setSection(next);
    if(pinned)requestAnimationFrame(()=>document.getElementById(contentId)?.scrollIntoView({block:'start',behavior:'instant'}));
  }
  if(passportOpen&&canOpenPassport)return <SharedReadinessPassportPanel key={passportConnection} source={source} connectionId={passportConnection} name={person.alias} onBack={()=>{setPassportOpen(false);requestAnimationFrame(()=>passportButton.current?.focus());}}/>;
  return <article className="mp-profile screen-content" dir="rtl" data-self-preview={preview||undefined}>
    <header className="mp-navigation">
      <button type="button" className="mp-back" onClick={back}><ArrowRight size={18}/>{backText}</button>
      <span>{preview?<><Eye size={14}/> معاينة ملفي</>:'ملف التعارف'}</span>
      {(interestAction||onReport||canGift)&&<div className="mp-navigation-actions">
        {interestAction&&!preview&&<button type="button" className="mp-interest" aria-label={`الاهتمام بـ ${person.alias}`} aria-pressed={Boolean(person.interested)} disabled={interestAction.busy} onClick={interestAction.toggle}>
          <Heart size={17} fill={person.interested?'currentColor':'none'} aria-hidden="true"/>اهتمام
        </button>}
        {(onReport||canGift)&&<details className="mp-profile-menu"><summary aria-label="خيارات الملف"><MoreHorizontal size={20}/></summary><div className="mp-menu-items">
          {canGift&&<button type="button" onClick={()=>gift?.({id:person.id,name:person.alias})}>إهداء عضوية</button>}
          {onBlock&&<button type="button" onClick={onBlock}>حظر العضو</button>}
          {onReport&&<button type="button" onClick={onReport}><Flag size={15}/>الإبلاغ والحظر</button>}
        </div></details>}
      </div>}
    </header>
    {interestAction?.error?<p className="mp-interest-feedback" role="alert">{interestAction.error}</p>:interestAction?.notice?<p className="mp-interest-feedback" role="status">{interestAction.notice}</p>:null}
    {preview&&<p className="mp-preview-note"><Eye size={15}/><span>هكذا يظهر ملفك للأعضاء المؤهلين.</span></p>}
    <div className="mp-portrait-header">
      {corners.map(({area,label,value,icon:Icon})=>value && <div key={area} className="mp-portrait-fact" style={{gridArea:area}}>
        <Icon size={16} strokeWidth={1.6} aria-hidden="true"/><span className="mp-fact-label">{label}</span><bdi>{value}</bdi>
      </div>)}
      <div className="mp-portrait-column">{person.portrait?<PortraitPhoto portrait={person.portrait} source={source} frameClassName="mp-portrait" captionClassName={person.isDemo?undefined:'mp-portrait-caption'} alt={`الصورة الشخصية لـ ${person.alias}`}/>:<div className={'mp-portrait'+(!person.publicAvatar&&!photo?' mp-portrait-private':'')}>{person.publicAvatar?<AvatarPortrait avatar={person.publicAvatar}/>:photo?<img src={photo} alt={privateDemo ? `الصورة الشخصية لـ ${person.alias}` : `صورة توضيحية لملف ${person.alias}`} onError={()=>setFailed(true)}/>:<span className="mp-monogram" aria-hidden="true">{Array.from(person.alias.trim())[0]||<UserRound size={44}/>}</span>}</div>}
        {(!person.portrait||person.isDemo)&&!privateDemo&&<div className="mp-portrait-caption">{person.isDemo?'حساب توضيحي لاختبار التجربة':person.publicAvatar?'صورة رمزية اختيارية':photo?'شخصية توضيحية · صورة مولّدة':<><LockKeyhole size={12}/> الصور تُشارك بخصوصية</>}</div>}
      </div>
    </div>
    <section className="mp-hero" data-weekly-featured={featured||undefined} ref={identity} aria-label={`ملف ${person.alias}`}>
      <ScenePaths className="mp-arrival-paths" parallax />
      <div className="mp-hero-copy">
        <div className="mp-name-row">
          <h1 ref={heading} tabIndex={-1}>{person.alias}</h1>
          <MemberBadge tier={person.membershipTier} active={person.premium} labeled/>
        </div>
      </div>
    </section>
    {!preview&&primary&&<div className="mp-primary">{primary}</div>}
    <div className="mp-sections" ref={sections} role="group" aria-label="أقسام الملف">
      <MotionPressButton aria-pressed={visibleSection==='about'} aria-controls={contentId} onClick={()=>selectSection('about')}><Feather size={16} aria-hidden="true"/>نبذة</MotionPressButton>
      {hasDetails&&<MotionPressButton aria-pressed={visibleSection==='details'} aria-controls={contentId} onClick={()=>selectSection('details')}><ListFilter size={16} aria-hidden="true"/>التفاصيل</MotionPressButton>}
      {!preview&&!premium&&<button type="button" className="mp-locked-section" onClick={()=>upgrade('premium')} aria-label="فتح تفاصيل التوافق مع العضوية المميزة"><LockKeyhole size={16} aria-hidden="true"/>التوافق</button>}
      {hasFit&&<MotionPressButton aria-pressed={visibleSection==='fit'} aria-controls={contentId} onClick={()=>selectSection('fit')}><Sparkles size={16} aria-hidden="true"/>التوافق</MotionPressButton>}
    </div>
    <MotionReveal id={contentId} className="mp-content" key={section} axis="x" distance={-8} duration={340}>
      {visibleSection==='about'&&<>
        <section className="mp-story">
          <h2><Feather size={16} aria-hidden="true"/>عنّي</h2>
          <div className="mp-story-body">
            {person.bio ? <p dir="auto">{person.bio}</p> : <p className="mp-empty">لم تُضف نبذة شخصية بعد.</p>}
            {person.interests.length > 0 && <ul className="mp-hero-interests" aria-label="الاهتمامات">
              {person.interests.map(item=><li key={item}>{interests.find(interest=>interest.id===item)?.label??item}</li>)}
            </ul>}
          </div>
        </section>
        <PersonalPrompts key={person.id} answers={person}/>
        {source&&<ProfileGallery source={source} subject={preview?undefined:person.id} name={person.alias}/>}
        {person.beenaStory&&<BeenaSummary story={person.beenaStory} name={person.alias}/>}
        {canOpenPassport&&<MotionPressButton ref={passportButton} className="mp-passport-link" onClick={()=>setPassportOpen(true)}><BookOpenCheck size={22} aria-hidden="true"/><span><strong>جواز الجاهزية للزواج</strong><small>الأقسام التي اختار مشاركتها معك</small></span><ArrowRight size={16} aria-hidden="true"/></MotionPressButton>}
      </>}
      {visibleSection==='details'&&<>
        <VerifiedBadge claims={person.manualVerifications}/>
        <Facts title="بداية الزواج" initiallyOpen items={[
          b?.marriageTimeline&&marriageTimelineLabels[b.marriageTimeline]&&['توقيت الزواج',marriageTimelineLabels[b.marriageTimeline]],
          person.exclusive&&['نوع التعارف','تعارف حصري'],
          person.marriageIntent&&['هدف التعارف',person.marriageIntent],
          person.familyPreference&&['إشراك الأهل',person.familyPreference],
          b?.meetingPreference&&meetingPreferenceLabels[b.meetingPreference]&&['اللقاء',meetingPreferenceLabels[b.meetingPreference]],
          b?.mahrRange && ['المهر', mahrRanges[b.mahrRange]],
        ]}/>
        <Facts title="حياتي اليوم" initiallyOpen items={[
          b?.maritalStatus&&['الحالة الاجتماعية',{never_married:'لم يسبق الزواج',divorced:'مطلّق / مطلّقة',widowed:'أرمل / أرملة',married:'متزوج'}[b.maritalStatus]],
          b?.maritalStatus==='married'&&validCount(b.currentWives,1,4)&&['عدد الزوجات حاليًا',ar.format(b.currentWives)],
          validCount(b?.childrenCount,0,20)&&['الأبناء',b.childrenCount===0?'ليس لدي أبناء':ar.format(b.childrenCount)],
          b?.nationality&&['الجنسية',b.nationality],
          b?.originCity&&['مدينة الأصل',b.originCity],
          Boolean(b?.spokenLanguages?.length) && ['اللغات', b!.spokenLanguages!.join(' · ')],
          b?.preferredLanguage && ['لغة التواصل المفضلة', b.preferredLanguage],
          b?.languageOpenness && ['اختلاف اللغة', languageOpennessLabels[b.languageOpenness]],
          b?.smoking&&['التدخين',{never:'لا أدخّن',cigarettes:'سجائر',vape:'فيب',shisha:'شيشة',sometimes:'أحيانًا',yes:'أدخّن'}[b.smoking]],
        ]}/>
        <Facts title="تفاصيل شخصية" items={[
          validCount(b?.heightCm,120,230)&&['الطول',ar.format(b.heightCm)+' سم'],validCount(b?.weightKg,35,250)&&['الوزن',ar.format(b.weightKg)+' كجم'],
          b?.skinTone&&['لون البشرة',skinTones.find(t=>t.value===b.skinTone)?.label??''],
          b?.dressStyle&&['غطاء الرأس',dressStyles.find(t=>t.value===b.dressStyle)?.label??''],
          b?.dressFlexibility&&b.dressFlexibility!=='prefer_not_to_say'&&['مناقشة غطاء الرأس',dressFlexibilities.find(t=>t.value===b.dressFlexibility)?.label??''],
          b?.tribalBackground&&b.tribalBackground!=='prefer_not_to_say'&&['الخلفية القبلية',b.tribalBackground==='tribal'?'قبلي':'غير قبلي'],
          b?.tribalBackground==='tribal'&&b.tribeName&&['القبيلة',b.tribeName],
        ]}/>
        <Facts title="خطط الحياة الزوجية" items={marriagePlanKeys.map(key => {
          const label = marriagePlanLabel(key, b?.[key]);
          return label ? [marriagePlanQuestions[key].label, label] as [string, string] : undefined;
        })}/>
        <Facts title="قناعات وتطلّعات" items={[
          b?.polygynyPreference&&b.polygynyPreference!=='prefer_not_to_say'&&['الموقف من التعدد',polygynyLabels[b.polygynyPreference]],
          b?.religiousAffiliation&&b.religiousAffiliation!=='prefer_not_to_say'&&['المذهب',religiousAffiliationLabels[b.religiousAffiliation]],
          b?.prayerPractice&&b.prayerPractice!=='prefer_not_to_say'&&['الصلاة',prayerPracticeLabels[b.prayerPractice]],
        ]}/>
      </>}
      {hasFit&&section==='fit'&&<section className="mp-fit">{person.fit?<FitDetails fit={person.fit} profile/>:<><h2>ما يجمعكما</h2><ul>{person.reasons.map(reason=><li key={reason}><Check size={15}/>{reason}</li>)}</ul></>}</section>}
    </MotionReveal>
    {preview&&<p className="mp-preview-footnote">نسبة التوافق تختلف من شخص لآخر؛ تظهر عند مقارنة تقييميكما. إجابات التقييم ومتطلبات الشريك الخاصة لا تظهر في هذا الملف.</p>}
    {!preview&&children&&<footer className="mp-secondary">{children}</footer>}
  </article>;
}
