import { DemoDeepReading } from '../community/DemoDeepReading';
import { mahrRanges } from '../compatibility/marriage';
import {MemberBadge} from '../membership/MemberBadge';
import {useMembershipAccess} from '../membership/access';
import { languageOpennessLabels } from "../compatibility/marriage";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { MoreHorizontal, Flag, ArrowRight, BookOpen, BookOpenCheck, BriefcaseBusiness, CalendarDays, Clock3, GraduationCap, Home, Landmark, MapPin, Check, Eye, Feather, Heart, ListFilter, LockKeyhole, Sparkles, UserRound } from "../BrandIcons";
import type { CommunitySource, PublicPerson } from '../community/data';
import { denied } from '../community/chatOutbox';
import { AvatarPortrait } from '../avatars/AvatarPortrait';
import { dressStyles, dressFlexibilities, skinTones } from '../compatibility/appearance';
import { interests } from '../compatibility/model';
import { FitDetails } from '../compatibility/FitDetails';
import { BeenaSummary } from '../beena/BeenaSummary';
import { ProfileGallery } from '../photos/ProfileGallery';
import { PortraitPhoto } from '../photos/PortraitPhoto';
import { useCapturePrivacy } from '../privacy/CapturePrivacy';
import { marriageTimelineLabels, meetingPreferenceLabels, polygynyLabels, prayerPracticeLabels, religiousAffiliationLabels } from '../compatibility/marriage';
import './member-profile.css';
import { VerifiedBadge } from '../verification/VerifiedBadge';
import { ScenePaths } from '../ScenePaths';
import { MotionPressButton } from '../motion/Reanimated';
import { SharedReadinessPassportPanel } from '../readiness/ReadinessPassport';
import { canonicalCity } from './profileOptions';
import { marriagePlanQuestions, marriagePlanLabel } from '../compatibility/marriagePlans';
import { PersonalPrompts } from './PersonalPrompts';

const ar = new Intl.NumberFormat('ar-SA');
const profileTabs = ['about','details','fit'] as const;

// Engines without intrinsic-size transitions can still animate a native disclosure.
function unfoldReading(event:MouseEvent<HTMLDivElement>){
  if(event.defaultPrevented || !(event.target instanceof Element) ||
    CSS.supports('(interpolate-size: allow-keywords) and selector(details::details-content)') ||
    matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.nfMotion==='reduced')return;
  const summary=event.target.closest('summary');
  const details=summary?.parentElement;
  if(!(details instanceof HTMLDetailsElement) || !details.closest('.mp-fit') || !details.animate)return;
  event.preventDefault();
  const running=details.getAnimations().find(a=>a.id.startsWith('mp-fold-'));
  const opening=running ? running.id==='mp-fold-close' : !details.open;
  const from=details.getBoundingClientRect().height;
  running?.cancel();
  details.open=opening;
  const to=details.getBoundingClientRect().height;
  details.open=true;
  const motion=details.animate([{height:from+'px',overflow:'clip'},{height:to+'px',overflow:'clip'}],
    {id:opening?'mp-fold-open':'mp-fold-close',duration:300,easing:'cubic-bezier(.22,.78,.28,1)'});
  motion.onfinish=()=>{details.open=opening;};
}
type Fact = [string, string];
type FactVisual = 'facts'|'statements';
function Facts({ title, icon, visual='facts', items }: {title: string; icon: ReactNode; visual?:FactVisual; items: (Fact | false | undefined | '')[]}) {
  const visible = items.filter((item): item is Fact => Array.isArray(item) && typeof item[1] === 'string' && !!item[1].trim());
  return visible.length ? <section className="mp-fact-group" data-visual={visual}>
    <h2 className="mp-fact-heading">{icon}<span>{title}</span></h2>
    <dl>{visible.map(([label,value])=>{
      const tone=label==='لون البشرة'?skinTones.find(option=>option.label===value):undefined;
      return <div key={label}>
        <dt>{label}</dt><dd dir="auto">{tone&&<span className="mp-tone-swatch" style={{backgroundColor:tone.color}} aria-hidden="true"/>}{value}</dd>
      </div>;
    })}</dl>
  </section> : null;
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
  const [backward,setBackward]=useState(false);
  useCapturePrivacy('profile');
  const [failed,setFailed]=useState(false);
  const [readingId,setReadingId]=useState<string>();
  const [passportOpen,setPassportOpen]=useState(false);
  const passportButton=useRef<HTMLButtonElement>(null);
  const sections=useRef<HTMLDivElement>(null);
  const [alignPinned,setAlignPinned]=useState(false);
  const heading=useRef<HTMLHeadingElement>(null);const contentId=useId();
  useLayoutEffect(()=>{
    if(alignPinned){
      document.getElementById(contentId)?.scrollIntoView({block:'start',behavior:'instant'});
    }
  },[section,contentId,alignPinned]);
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
  const reading = !preview && person.isDemo ? (source?.demoInteractions ?? source)?.profileReading : undefined;
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
    setBackward(profileTabs.indexOf(next)<profileTabs.indexOf(visibleSection));
    const top=sections.current?.getBoundingClientRect().top??100;
    const stickyTop=sections.current?parseFloat(getComputedStyle(sections.current).top)||0:0;
    setAlignPinned(top>=stickyTop-1&&top<=stickyTop+1);
    setSection(next);
  }
  if(passportOpen&&canOpenPassport)return <SharedReadinessPassportPanel key={passportConnection} source={source} connectionId={passportConnection} name={person.alias} onBack={()=>{setPassportOpen(false);requestAnimationFrame(()=>passportButton.current?.focus());}}/>;
  return <article ref={identity} className="mp-profile screen-content" dir="rtl" data-self-preview={preview||undefined}>
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
<div className="mp-portrait-column">{person.portrait?<PortraitPhoto portrait={person.portrait} source={source} frameClassName="mp-portrait" captionClassName={person.isDemo?undefined:'mp-portrait-caption'} alt={`الصورة الشخصية لـ ${person.alias}`}/>:<div className={'mp-portrait'+(!person.publicAvatar&&!photo?' mp-portrait-private':'')}>{person.publicAvatar?<AvatarPortrait avatar={person.publicAvatar}/>:photo?<img src={photo} alt={privateDemo ? `الصورة الشخصية لـ ${person.alias}` : `صورة توضيحية لملف ${person.alias}`} onError={()=>setFailed(true)}/>:<img src="/brand/wudayn-privacy-lock.webp" alt="صورة خاصة"/>}</div>}
        {(!person.portrait||person.isDemo)&&!privateDemo&&<div className="mp-portrait-caption">{person.isDemo?'ملف للمعاينة':person.publicAvatar?'صورة رمزية اختيارية':photo?'شخصية توضيحية · صورة مولّدة':<><LockKeyhole size={12}/> الصور تُشارك بخصوصية</>}</div>}
      </div>
    </div>
    <section className="mp-hero" data-weekly-featured={featured||undefined} aria-label={`ملف ${person.alias}`}>
      <ScenePaths className="mp-arrival-paths" parallax />
      <div className="mp-hero-copy">
        <div className="mp-name-row">
          <h1 ref={heading} tabIndex={-1}>{person.alias}</h1>
          <MemberBadge tier={person.membershipTier} active={person.premium} labeled/>
        </div>
      </div>
    </section>
    {!preview&&primary&&<div className="mp-primary">{primary}</div>}
    {reading && <>
      <MotionPressButton className="mp-passport-link" onClick={()=>setReadingId(person.id)}><BookOpenCheck size={22} aria-hidden="true"/><span><strong>تحليل وُدَين المعمّق</strong><small>قراءة التوافق مع {person.alias}</small></span><ArrowRight size={16} aria-hidden="true"/></MotionPressButton>
      <DemoDeepReading key={person.id} person={person} read={reading} watch={(source?.demoInteractions ?? source)!.watch} open={readingId===person.id} onClose={()=>setReadingId(undefined)}/>
    </>}
    <div className="mp-sections" ref={sections} role="group" aria-label="أقسام الملف"
      style={{'--mp-tabs':1+Number(hasDetails)+Number(hasFit||(!preview&&!premium)), '--mp-index':visibleSection==='fit'?1+Number(hasDetails):Number(visibleSection==='details')} as CSSProperties}>
      <MotionPressButton aria-pressed={visibleSection==='about'} aria-controls={contentId} onClick={()=>selectSection('about')}><Feather size={16} aria-hidden="true"/>نبذة</MotionPressButton>
      {hasDetails&&<MotionPressButton aria-pressed={visibleSection==='details'} aria-controls={contentId} onClick={()=>selectSection('details')}><ListFilter size={16} aria-hidden="true"/>التفاصيل</MotionPressButton>}
      {!preview&&!premium&&<button type="button" className="mp-locked-section" onClick={()=>upgrade('premium')} aria-label="فتح تفاصيل التوافق مع العضوية المميزة"><LockKeyhole size={16} aria-hidden="true"/>التوافق</button>}
      {hasFit&&<MotionPressButton aria-pressed={visibleSection==='fit'} aria-controls={contentId} onClick={()=>selectSection('fit')}><Sparkles size={16} aria-hidden="true"/>التوافق</MotionPressButton>}
    </div>
    <div id={contentId} className="mp-content" key={visibleSection} data-pinned={alignPinned||undefined} data-backward={backward||undefined} onClick={unfoldReading}>
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
      </>}
      {visibleSection==='details'&&<>
        <VerifiedBadge claims={person.manualVerifications}/>
        <Facts title="وضعي اليوم" icon={<UserRound aria-hidden="true"/>} items={[
          b?.maritalStatus&&['الحالة الاجتماعية',{never_married:'لم يسبق الزواج',divorced:'مطلّق / مطلّقة',widowed:'أرمل / أرملة',married:'متزوج'}[b.maritalStatus]],
          b?.maritalStatus==='married'&&validCount(b.currentWives,1,4)&&['عدد الزوجات حاليًا',ar.format(b.currentWives)],
          validCount(b?.childrenCount,0,20)&&['الأبناء',b.childrenCount===0?'ليس لدي أبناء':ar.format(b.childrenCount)],
          b?.nationality&&['الجنسية',b.nationality],
          b?.originCity&&['مدينة الأصل',b.originCity],
          b?.smoking&&['التدخين',{never:'لا أدخّن',cigarettes:'سجائر',vape:'فيب',shisha:'شيشة',sometimes:'أحيانًا',yes:'أدخّن'}[b.smoking]],
        ]}/>
        <Facts title="الخطوة الرسمية" icon={<Clock3 aria-hidden="true"/>} visual="statements" items={[
          b?.marriageTimeline&&marriageTimelineLabels[b.marriageTimeline]&&['توقيت الزواج',marriageTimelineLabels[b.marriageTimeline]],
          person.exclusive&&['نوع التعارف','تعارف حصري'],
          person.familyPreference&&['إشراك الأهل',person.familyPreference],
          b?.meetingPreference&&meetingPreferenceLabels[b.meetingPreference]&&['اللقاء',meetingPreferenceLabels[b.meetingPreference]],
          b?.polygynyPreference&&b.polygynyPreference!=='prefer_not_to_say'&&['الموقف من التعدد',polygynyLabels[b.polygynyPreference]],
          b?.mahrRange && ['المهر', mahrRanges[b.mahrRange]],
          marriagePlanLabel('weddingStyle',b?.weddingStyle)&&[marriagePlanQuestions.weddingStyle.label,marriagePlanLabel('weddingStyle',b?.weddingStyle)!],
        ]}/>
        <Facts title="الحياة المشتركة" icon={<Home aria-hidden="true"/>} visual="statements" items={[
          marriagePlanLabel('childrenTiming',b?.childrenTiming)&&[marriagePlanQuestions.childrenTiming.label,marriagePlanLabel('childrenTiming',b?.childrenTiming)!],
          marriagePlanLabel('housingPlan',b?.housingPlan)&&[marriagePlanQuestions.housingPlan.label,marriagePlanLabel('housingPlan',b?.housingPlan)!],
          marriagePlanLabel('expenseSharing',b?.expenseSharing)&&[marriagePlanQuestions.expenseSharing.label,marriagePlanLabel('expenseSharing',b?.expenseSharing)!],
        ]}/>
        <Facts title="اللغات والتواصل" icon={<BookOpen aria-hidden="true"/>} items={[
          Boolean(b?.spokenLanguages?.length)&&['اللغات',b!.spokenLanguages!.join(' · ')],
          (b?.preferredLanguage||b?.languageOpenness)&&['التواصل',[b?.preferredLanguage&&`أفضل ${b.preferredLanguage}`,b?.languageOpenness&&languageOpennessLabels[b.languageOpenness]].filter(Boolean).join(' · ')],
        ]}/>
        <Facts title="المظهر واللباس" icon={<Eye aria-hidden="true"/>} items={[
          validCount(b?.heightCm,120,230)&&['الطول',ar.format(b.heightCm)+' سم'],validCount(b?.weightKg,35,250)&&['الوزن',ar.format(b.weightKg)+' كجم'],
          b?.skinTone&&['لون البشرة',skinTones.find(t=>t.value===b.skinTone)?.label??''],
          b?.dressStyle&&['غطاء الرأس',dressStyles.find(t=>t.value===b.dressStyle)?.label??''],
          b?.dressFlexibility&&b.dressFlexibility!=='prefer_not_to_say'&&['مناقشة غطاء الرأس',dressFlexibilities.find(t=>t.value===b.dressFlexibility)?.label??''],
        ]}/>
        <Facts title="الخلفية المعلنة" icon={<Landmark aria-hidden="true"/>} items={[
          b?.tribalBackground&&b.tribalBackground!=='prefer_not_to_say'&&['الخلفية القبلية',b.tribalBackground==='tribal'?'قبلي':'غير قبلي'],
          b?.tribalBackground==='tribal'&&b.tribeName&&['القبيلة',b.tribeName],
          b?.religiousAffiliation&&b.religiousAffiliation!=='prefer_not_to_say'&&['المذهب',religiousAffiliationLabels[b.religiousAffiliation]],
          b?.prayerPractice&&b.prayerPractice!=='prefer_not_to_say'&&['الصلاة',prayerPracticeLabels[b.prayerPractice]],
        ]}/>
        {canOpenPassport&&<MotionPressButton ref={passportButton} className="mp-passport-link" onClick={()=>setPassportOpen(true)}><BookOpenCheck size={22} aria-hidden="true"/><span><strong>جواز الجاهزية للزواج</strong><small>الأقسام التي اختار مشاركتها معك</small></span><ArrowRight size={16} aria-hidden="true"/></MotionPressButton>}
      </>}
      {hasFit&&section==='fit'&&<section className="mp-fit">{person.fit?<FitDetails fit={person.fit} profile/>:<><h2>ما يجمعكما</h2><ul>{person.reasons.map(reason=><li key={reason}><Check size={15}/>{reason}</li>)}</ul></>}</section>}
    </div>
    {preview&&<p className="mp-preview-footnote">إجابات التقييم وتفضيلات الشريك خاصة بك.</p>}
    {!preview&&children&&<footer className="mp-secondary">{children}</footer>}
  </article>;
}
