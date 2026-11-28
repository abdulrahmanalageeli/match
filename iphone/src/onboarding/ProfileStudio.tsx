import { ArrowLeft, BookOpen, BriefcaseBusiness, Camera, Check, ChevronLeft, Feather, Fingerprint, HeartHandshake, MapPin, MessageCircle, ShieldCheck, SlidersHorizontal, UserRound } from "../BrandIcons";
import { useLayoutEffect, useRef } from 'react';
import { AvatarPortrait } from '../avatars/AvatarPortrait';
import { PortraitPhoto } from '../photos/PortraitPhoto';
import type { CommunitySource } from '../community/data';
import { interests } from '../compatibility/model';
import { arabicNumber, type Answers, type Chapter } from './draft';
import './profile-editor.css';
import { MotionPressButton } from '../motion/Reanimated';
import '../profile/profile-prompts.css';

type PhotoPreviewProps = { photoUrl?: string | null; portraitSource?: CommunitySource | null };

export function ProfilePortraitPreview({ answers: p, photoUrl, portraitSource }: { answers: Answers } & PhotoPreviewProps) {
  if(photoUrl)return <img src={photoUrl} alt="صورة ملفك بالتمويه المختار" decoding="async"/>;
  if(photoUrl!==null&&p.portrait)return <PortraitPhoto portrait={p.portrait} source={portraitSource} alt="صورة ملفك بالتمويه المختار"/>;
  return p.gender==='woman'&&p.publicAvatar?<AvatarPortrait avatar={p.publicAvatar}/>:<span>{Array.from(p.displayName.trim())[0]||<UserRound size={28}/>}</span>;
}

export function ProfilePreview({ answers: p, photoUrl, portraitSource }: { answers: Answers } & PhotoPreviewProps) {
  const chosen = interests.filter(item => p.interestIds?.includes(item.id)).slice(0, 3);
  return <section className="nf-studio-preview" aria-label="ملفك كما يراه الآخرون">
    <div className="nf-studio-preview-top"><span>لمحة من ملفك</span><span><ShieldCheck size={13}/> حضور يعبّر عنك</span></div>
    <div className="nf-studio-person"><div className="nf-studio-avatar"><ProfilePortraitPreview answers={p} photoUrl={photoUrl} portraitSource={portraitSource}/></div>
      <div><h2>{p.displayName || 'هنا تبدأ حكايتك'}{/^\d{2,3}$/.test(p.age) && Number(p.age) >= 18 && Number(p.age) <= 110 && <small>، {arabicNumber(Number(p.age))}</small>}</h2><p><MapPin size={13}/>{[p.city, p.profession].filter(Boolean).join(' · ') || 'تفاصيل صغيرة، تصنع صورة أقرب'}</p></div>
    </div>
    <p className="nf-studio-bio">{p.bio || 'بكلماتك أنت، امنح الشخص المناسب سببًا ليبدأ الحديث.'}</p>
    {chosen.length > 0 && <div className="nf-studio-interests">{chosen.map(item => <span key={item.id}>{item.label}</span>)}</div>}
  </section>;
}

export type StoryPart = 'bio' | 'work';
export const editorTitles: Record<Chapter,string> = {
  identity:'الاسم وبياناتي الأساسية', story:'نبذتي واهتماماتي', avatar:'صورة ملفي',
  details:'التفاصيل الشخصية', criteria:'مواصفات الشريك', preferences:'بداية التعارف',
  compatibility:'أسلوب الحياة', personality:'الشخصية', beena:'بيننا', review:'مراجعة التعديلات', readiness:'الجاهزية',
};

export function ProfileStudio({answers:p,withCompatibility,open,review,busy,changed,matchingNote,photoUrl,portraitSource}: {
  answers:Answers; withCompatibility:boolean; open:(chapter:Chapter,part?:StoryPart)=>void;
  matchingNote:string; review:()=>void; busy:boolean; changed:ReadonlySet<Chapter>;
} & PhotoPreviewProps) {
  const heading=useRef<HTMLHeadingElement>(null);
  useLayoutEffect(()=>{ heading.current?.focus({preventScroll:true}); },[]);
  function row(chapter:Chapter, Icon:typeof UserRound, value:string, part?:StoryPart) {
    const title=part==='work'?'العمل والدراسة':editorTitles[chapter];
    return <button type="button" disabled={busy} className="pe-row" onClick={()=>open(chapter,part)}>
      <Icon size={17} strokeWidth={1.55} aria-hidden="true"/>
      <span className="pe-row-label">{title}</span><small>{value}</small><ChevronLeft size={15} aria-hidden="true"/>
    </button>;
  }
  return <div className="pe-studio">
    <button type="button" className="pe-identity" disabled={busy} onClick={()=>open('avatar')} aria-label="تعديل صورة ملفي">
      <span className="nf-studio-avatar"><ProfilePortraitPreview answers={p} photoUrl={photoUrl} portraitSource={portraitSource}/></span>
      <span className="pe-member-copy"><strong>{p.displayName||'ملفي الشخصي'}</strong><small>{[p.city,p.profession].filter(Boolean).join(' · ')}</small></span>
      <span className="pe-photo-action"><Camera size={15} aria-hidden="true"/>تعديل الصورة</span>
    </button>
    <section className="pe-group"><h2 ref={heading} tabIndex={-1}>عنّي</h2>
      {row('identity',UserRound,'الاسم، الميلاد والمدينة')}
      {row('story',BriefcaseBusiness,p.education||p.profession||'المهنة والمؤهل','work')}
      {row('story',Feather,'بكلماتي','bio')}
      {row('details',SlidersHorizontal,'العائلة واللغات والمظهر')}
    </section>
    <section className="pe-group"><h2>الشريك وبداية التعارف</h2>
      {withCompatibility&&row('criteria',HeartHandshake,'ما يهمني في الشريك')}
      {row('preferences',MessageCircle,'العمر المناسب وإشراك الأهل')}
    </section>
    {withCompatibility&&<section className="pe-group"><h2>إجاباتي للتوافق</h2>
      {row('compatibility',SlidersHorizontal,'المواقف والأولويات')}
      {row('personality',Fingerprint,'طباعي وما يناسبني')}
      {row('beena',BookOpen,'مواقف الحياة وقصتي')}
      <p className="pe-edit-caption">{matchingNote}</p>
    </section>}
    <footer className="nf-studio-actions pe-footer">{changed.size
      ? <MotionPressButton type="button" className="f-primary" disabled={busy} onClick={review}>مراجعة التعديلات<ArrowLeft size={17}/></MotionPressButton>
      : <span className="pe-saved"><Check size={15} aria-hidden="true"/>ملفك محفوظ</span>}
    </footer>
  </div>;
}
