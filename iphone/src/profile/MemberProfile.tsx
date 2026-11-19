import { languageOpennessLabels } from "../compatibility/marriage";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { MoreHorizontal, Flag, ArrowRight, BookOpenCheck, BriefcaseBusiness, Check, ChevronDown, ChevronLeft, Eye, Feather, GraduationCap, Heart, Leaf, ListFilter, LockKeyhole, MapPin, Sparkles, UserRound, type LucideIcon } from "../BrandIcons";
import type { CommunitySource, PublicPerson } from '../community/data';
import { denied } from '../community/chatOutbox';
import { AvatarPortrait } from '../avatars/AvatarPortrait';
import { dressStyles, dressFlexibilities, skinTones } from '../compatibility/appearance';
import { interests } from '../compatibility/model';
import { FitDetails } from '../compatibility/FitDetails';
import { decisionContext } from './decisionContext';
import { BeenaSummary } from '../beena/BeenaSummary';
import { ProfileGallery } from '../photos/ProfileGallery';
import { PortraitPhoto } from '../photos/PortraitPhoto';
import { marriageTimelineLabels, meetingPreferenceLabels, polygynyLabels, prayerPracticeLabels, religiousAffiliationLabels } from '../compatibility/marriage';
import './member-profile.css';
import { VerifiedBadge } from '../verification/VerifiedBadge';
import { ScenePaths } from '../ScenePaths';
import { MotionPressButton } from '../motion/Reanimated';
import { SharedReadinessPassportPanel } from '../readiness/ReadinessPassport';
import { canonicalCity } from './profileOptions';
import { PersonalPrompts } from './PersonalPrompts';

const ar = new Intl.NumberFormat('ar-SA');
type Fact = [string, string];
function Facts({ title, note, icon: Icon, items, initiallyOpen=false }: {title: string; note: string; icon: LucideIcon; items: (Fact | false | undefined | '')[]; initiallyOpen?: boolean}) {
  const visible = items.filter((item): item is Fact => Array.isArray(item) && typeof item[1] === 'string' && !!item[1].trim());
  return visible.length ? <details className="mp-fact-group" open={initiallyOpen || undefined}>
    <summary><span className="mp-fact-icon"><Icon size={18} strokeWidth={1.6} aria-hidden="true"/></span><span className="mp-fact-heading"><strong role="heading" aria-level={2}>{title}</strong><small>{note}</small></span><ChevronDown size={17} className="mp-fact-chevron" aria-hidden="true"/></summary>
    <dl>{visible.map(([label,value])=><div key={label}><dt>{label}</dt><dd dir="auto">{value}</dd></div>)}</dl>
  </details> : null;
}
const validCount = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
function Story({title,children,accent=false}:{title:string;children:string;accent?:boolean}) {
  return <section className={'mp-story'+(accent?' mp-story-accent':'')}><h2>{accent?<Heart size={16}/>:<Feather size={16}/>} {title}</h2><p dir="auto">{children}</p></section>;
}
export function MemberProfile({person,source,back,backText,primary,children,identity,featured,preview=false,connectionId,onReport,onBlock}: {
  person: PublicPerson; source?: CommunitySource | null; back:()=>void; backText:string;
  primary?:ReactNode; children?:ReactNode; identity?:RefObject<HTMLElement|null>; featured?:boolean; preview?:boolean; connectionId?:string; onReport?:()=>void; onBlock?:()=>void;
}) {
  const [section,setSection]=useState<'about'|'details'|'fit'>('about');
  const [failed,setFailed]=useState(false);
  const [passportOpen,setPassportOpen]=useState(false);
  const passportButton=useRef<HTMLButtonElement>(null);
  const fitButton=useRef<HTMLButtonElement>(null);
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
  const photo=!person.publicAvatar&&!failed&&person.demoPhoto?.startsWith('/demo/portraits/')?person.demoPhoto:undefined;
  const {personalLine, context}=decisionContext(person);
  const hasFit=!preview&&Boolean(person.fit||person.reasons.length);
  const hasDetails=Boolean(person.occupation||person.education||person.familyPreference||person.marriageIntent||b&&Object.values(b).some(v=>v!==undefined&&v!==null&&v!==''));
  const passportConnection=connectionId||(person.connectionStatus==='accepted'?person.connectionId:undefined);
  const canOpenPassport=!preview&&source?.readiness&&passportConnection&&(source.readinessEligibleConnection?.(passportConnection)??true);
  const highlights = [
    {label:'العمل',value:person.occupation,icon:BriefcaseBusiness},
    {label:'التعليم',value:person.education,icon:GraduationCap},
  ].filter(item=>item.value);
  function selectSection(next:typeof section){
    if(next===section)return;
    const top=sections.current?.getBoundingClientRect().top??100;
    const pinned=top>=0&&top<=10;
    setSection(next);
    if(pinned)requestAnimationFrame(()=>document.getElementById(contentId)?.scrollIntoView({block:'start',behavior:'instant'}));
  }
  function openFit(){selectSection('fit');fitButton.current?.focus({preventScroll:true});}
  if(passportOpen&&canOpenPassport)return <SharedReadinessPassportPanel key={passportConnection} source={source} connectionId={passportConnection} name={person.alias} onBack={()=>{setPassportOpen(false);requestAnimationFrame(()=>passportButton.current?.focus());}}/>;
  return <article className="mp-profile screen-content" dir="rtl" data-self-preview={preview||undefined}>
    <header className="mp-navigation"><button type="button" className="mp-back" onClick={back}><ArrowRight size={18}/>{backText}</button><span>{preview?<><Eye size={14}/> معاينة ملفي</>:'ملف التعارف'}</span>{onReport&&<details className="mp-profile-menu"><summary aria-label="خيارات الملف"><MoreHorizontal size={20}/></summary>{onBlock && <button type="button" onClick={onBlock}>حظر العضو</button>}<button type="button" onClick={onReport}><Flag size={15}/>الإبلاغ والحظر</button></details>}</header>
    {preview&&<p className="mp-preview-note"><Eye size={15}/><span>هكذا يظهر ملفك للأعضاء المؤهلين.</span></p>}
    <section className="mp-hero" data-weekly-featured={featured||undefined} ref={identity} aria-label={`ملف ${person.alias}`}>
      <ScenePaths className="mp-arrival-paths" parallax />
      <div className="mp-hero-copy">{!preview&&<span className="mp-eyebrow">ملف شخصي</span>}<h1 ref={heading} tabIndex={-1}>{person.alias}{Number.isInteger(person.age)&&person.age>=18&&person.age<=110&&<small>{ar.format(person.age)} عامًا</small>}</h1><VerifiedBadge claims={person.manualVerifications}/>
        <div className="mp-meta">{person.city&&<span><MapPin size={14}/><bdi>{canonicalCity(person.city)}</bdi></span>}</div>
        {b?.marriageTimeline && <p className="mp-decision-timeline">توقيت الزواج · {marriageTimelineLabels[b.marriageTimeline]}</p>}
      </div>
      {person.portrait?<div className="mp-portrait-column"><PortraitPhoto portrait={person.portrait} source={source} frameClassName="mp-portrait" captionClassName={person.isDemo?undefined:'mp-portrait-caption'} alt={`الصورة الشخصية لـ ${person.alias}`}/></div>:<div className={'mp-portrait'+(!person.publicAvatar&&!photo?' mp-portrait-private':'')}>{person.publicAvatar?<AvatarPortrait avatar={person.publicAvatar}/>:photo?<img src={photo} alt={`صورة توضيحية لملف ${person.alias}`} onError={()=>setFailed(true)}/>:<span className="mp-monogram" aria-hidden="true">{Array.from(person.alias.trim())[0]||<UserRound size={44}/>}</span>}</div>}
      <div className="mp-intention"><Heart size={13}/><span>{person.marriageIntent||'تعارف بقصد الزواج'}</span>{person.exclusive&&<strong><Check size={12}/> تعارف حصري</strong>}</div>
    </section>
    {(!person.portrait||person.isDemo)&&!(person.isDemo&&source?.simulation)&&<div className="mp-portrait-caption">{person.isDemo?'حساب توضيحي لاختبار التجربة':person.publicAvatar?'صورة رمزية اختيارية':photo?'شخصية توضيحية · صورة مولّدة':<><LockKeyhole size={12}/> الصور تُشارك بخصوصية</>}</div>}
    {(personalLine||context)&&<div className="mp-decision-copy">
      {personalLine&&<p className="mp-personal-line" dir="auto">{personalLine}</p>}
      {context&&<p className="mp-decision-context">{context}</p>}
    </div>}
    {!preview&&primary&&<div className="mp-primary">{primary}</div>}
    <div className="mp-sections" ref={sections} style={{'--mp-section-count': 1 + Number(hasDetails) + Number(hasFit), '--mp-section-index': section === 'about' ? 0 : section === 'details' ? 1 : 1 + Number(hasDetails)} as CSSProperties} role="group" aria-label="أقسام الملف">
      <MotionPressButton aria-pressed={section==='about'} aria-controls={contentId} onClick={()=>selectSection('about')}><Feather size={16} aria-hidden="true"/>نبذة</MotionPressButton>
      {hasDetails&&<MotionPressButton aria-pressed={section==='details'} aria-controls={contentId} onClick={()=>selectSection('details')}><ListFilter size={16} aria-hidden="true"/>التفاصيل</MotionPressButton>}
      {hasFit&&<MotionPressButton ref={fitButton} aria-pressed={section==='fit'} aria-controls={contentId} onClick={()=>selectSection('fit')}><Sparkles size={16} aria-hidden="true"/>التوافق</MotionPressButton>}
    </div>
    <div id={contentId} className="mp-content" key={section}>
      {section==='about'&&<>
        {person.bio?<Story title="عنّي">{person.bio}</Story>:<p className="mp-empty">لم تُضف نبذة شخصية بعد.</p>}
        {!!highlights.length&&<dl className="mp-highlights" aria-label="لمحة سريعة">{highlights.map(({label,value,icon:Icon})=><div key={label}><dt><Icon size={17} strokeWidth={1.5} aria-hidden="true"/>{label}</dt><dd dir="auto">{value}</dd></div>)}</dl>}
        {hasFit&&<MotionPressButton className="mp-fit-preview" aria-controls={contentId} onClick={openFit}>
          <span className="mp-fit-preview-heading"><Sparkles size={17} aria-hidden="true"/><strong>توافقكما</strong><ChevronLeft size={16} aria-hidden="true"/></span>
          <small>{person.fit?'من إجاباتكما · نقاط الاتفاق وما يحتاج حوارًا':person.reasons[0]}</small>
        </MotionPressButton>}
        <PersonalPrompts key={person.id} answers={person}/>
        {!!person.interests.length&&<section className="mp-interests"><h2>اهتماماتي</h2><div>{person.interests.map(item=><span key={item}>{interests.find(i=>i.id===item)?.label??item}</span>)}</div></section>}
        {source&&<ProfileGallery source={source} subject={preview?undefined:person.id} name={person.alias}/>}
        {person.beenaStory&&<BeenaSummary story={person.beenaStory}/>}
        {canOpenPassport&&<MotionPressButton ref={passportButton} className="mp-passport-link" onClick={()=>setPassportOpen(true)}><BookOpenCheck size={22} aria-hidden="true"/><span><strong>جواز الجاهزية للزواج</strong><small>الأقسام التي اختار مشاركتها معك</small></span><ArrowRight size={16} aria-hidden="true"/></MotionPressButton>}
      </>}
      {section==='details'&&<>
        <p className="mp-details-intro">{preview?'تفاصيلك الظاهرة للأعضاء.':'تفاصيل اختار مشاركتها.'} افتح القسم الذي يهمّك.</p>
        <Facts title="حياتي اليوم" note="العمل، والتعليم، والعائلة" icon={BriefcaseBusiness} initiallyOpen items={[
          person.occupation&&['مجال العمل أو الوضع المهني',person.occupation],
          person.education&&['التعليم',person.education],
          b?.nationality&&['الجنسية',b.nationality],
          Boolean(b?.spokenLanguages?.length) && ['اللغات', b!.spokenLanguages!.join(' · ')],
          b?.preferredLanguage && ['لغة التواصل المفضلة', b.preferredLanguage],
          b?.languageOpenness && ['اختلاف اللغة', languageOpennessLabels[b.languageOpenness]],
          b?.maritalStatus&&['الحالة الاجتماعية',{never_married:'لم يسبق الزواج',divorced:'مطلّق / مطلّقة',widowed:'أرمل / أرملة',married:'متزوج'}[b.maritalStatus]],
          b?.maritalStatus==='married'&&validCount(b.currentWives,1,4)&&['عدد الزوجات حاليًا',ar.format(b.currentWives)],
          validCount(b?.childrenCount,0,20)&&['الأبناء',b.childrenCount===0?'ليس لدي أبناء':ar.format(b.childrenCount)],
          b?.smoking&&['التدخين',{never:'لا أدخّن',cigarettes:'سجائر',vape:'فيب',shisha:'شيشة',sometimes:'أحيانًا',yes:'أدخّن'}[b.smoking]],
        ]}/>
        <Facts title="تفاصيل شخصية" note="المظهر، واللباس، والخلفية" icon={UserRound} items={[
          validCount(b?.heightCm,120,230)&&['الطول',ar.format(b.heightCm)+' سم'],validCount(b?.weightKg,35,250)&&['الوزن',ar.format(b.weightKg)+' كجم'],
          b?.skinTone&&['لون البشرة',skinTones.find(t=>t.value===b.skinTone)?.label??''],
          b?.dressStyle&&['غطاء الرأس',dressStyles.find(t=>t.value===b.dressStyle)?.label??''],
          b?.dressFlexibility&&b.dressFlexibility!=='prefer_not_to_say'&&['مناقشة غطاء الرأس',dressFlexibilities.find(t=>t.value===b.dressFlexibility)?.label??''],
          b?.tribalBackground&&b.tribalBackground!=='prefer_not_to_say'&&['الخلفية القبلية',b.tribalBackground==='tribal'?'قبلي':'غير قبلي'],
          b?.tribalBackground==='tribal'&&b.tribeName&&['القبيلة',b.tribeName],
        ]}/>
        <Facts title="بداية الزواج" note="التوقيت، واللقاء، وإشراك الأهل" icon={Heart} items={[
          person.marriageIntent&&['النية من التعارف',person.marriageIntent],
          b?.marriageTimeline&&marriageTimelineLabels[b.marriageTimeline]&&['التوقيت المرغوب للزواج',marriageTimelineLabels[b.marriageTimeline]],
          b?.meetingPreference&&meetingPreferenceLabels[b.meetingPreference]&&['تفضيل اللقاء',meetingPreferenceLabels[b.meetingPreference]],
          person.familyPreference&&['إشراك الأهل',person.familyPreference],
        ]}/>
        <Facts title="قناعات وتطلّعات" note="ما يختار مشاركته من قناعاته" icon={Leaf} items={[
          b?.polygynyPreference&&b.polygynyPreference!=='prefer_not_to_say'&&['الموقف من التعدد',polygynyLabels[b.polygynyPreference]],
          b?.religiousAffiliation&&b.religiousAffiliation!=='prefer_not_to_say'&&['المذهب',religiousAffiliationLabels[b.religiousAffiliation]],
          b?.prayerPractice&&b.prayerPractice!=='prefer_not_to_say'&&['الصلاة',prayerPracticeLabels[b.prayerPractice]],
        ]}/>
      </>}
      {section==='fit'&&<section className="mp-fit">{person.fit?<FitDetails fit={person.fit}/>:<><h2>ما يجمعكما</h2><ul>{person.reasons.map(reason=><li key={reason}><Check size={15}/>{reason}</li>)}</ul></>}</section>}
    </div>
    {preview&&<p className="mp-preview-footnote"><Sparkles size={16}/><span>نسبة التوافق تختلف من شخص لآخر؛ تظهر عند مقارنة تقييميكما. إجابات التقييم ومتطلبات الشريك الخاصة لا تظهر في هذا الملف.</span></p>}
    {!preview&&children&&<footer className="mp-secondary">{children}</footer>}
  </article>;
}

