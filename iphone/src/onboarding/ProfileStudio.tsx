import { ArrowLeft, Check, ChevronLeft, Feather, HeartHandshake, LockKeyhole, MapPin, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { AvatarPortrait } from '../avatars/AvatarPortrait';
import { PortraitPhoto } from '../photos/PortraitPhoto';
import type { CommunitySource } from '../community/data';
import { dimensions, interests } from '../compatibility/model';
import { personalityQuestions } from '../compatibility/personality';
import { beenaProgress } from '../beena/model';
import { arabicNumber, type Answers, type Chapter } from './draft';
import './profile-editor.css';
import { MotionPressButton } from '../motion/Reanimated';
import { answeredProfilePrompts } from '../profile/profilePrompts';
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

export function ProfileStudio({ answers: p, withCompatibility, open, review, busy, changed, selectedChapter, photoUrl, portraitSource }: {
  answers: Answers; withCompatibility: boolean; open: (chapter: Chapter) => void; review: () => void; busy: boolean; changed: boolean; selectedChapter:Chapter;
} & PhotoPreviewProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [section,setSection]=useState(()=>['criteria','compatibility','personality','beena','preferences'].includes(selectedChapter)?1:0);
  useLayoutEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  const answered = dimensions.reduce((sum, q) => sum + Number(Boolean(p.surveyAnswers?.[q.id])) + Number(Boolean(p.surveyAnswers?.[q.partnerId])), 0);
  const personality = personalityQuestions.filter(q => p.personalityAnswers?.[q.id]).length;
  const promptCount = answeredProfilePrompts(p).length;
  const groups = [
    { title: 'ملفي العام', note: 'تظهر التفاصيل العامة للأعضاء المؤهلين. التفاصيل الحساسة تظهر فقط بموافقتك المنفصلة على العرض.', items: [
      { key: 'identity', title: 'الأساسيات', note: [p.displayName, p.city].filter(Boolean).join(' · ') || 'الاسم والعمر والمدينة', icon: UserRound },
      { key: 'story', title: 'نبذتي وحياتي', note: 'المهنة، نبذتك، وإجابات تحكي عنك', icon: Feather },
      { key: 'details', title: 'التفاصيل الشخصية', note: 'الطول، الحالة الاجتماعية، وبقية تفاصيلك', icon: UserRound },
      ...(p.gender === 'woman' ? [{ key: 'avatar', title: 'صورة ملفي', note: photoUrl || (photoUrl!==null&&p.portrait) ? 'تغيير صورتك أو درجة التمويه' : p.publicAvatar ? 'تغيير الرسم المختار أو إضافة صورة بتمويه' : 'صورة بتمويه تختارينه، أو رسم يعبّر عنك', icon: ShieldCheck }] : []),
    ] },
    { title: 'تفضيلاتي والتوافق', note: 'إجابات التقييم وشروط الشريك خاصة. يظهر تفضيل إشراك الأسرة وأي قصة تختار مشاركتها في «بيننا».', items: [
      ...(withCompatibility ? [
        { key: 'criteria', title: 'ما يهمك في الشريك', note: 'تفضيلاتك، وما لا تتنازل عنه', icon: HeartHandshake },
        { key: 'compatibility', title: 'توافق أسلوب الحياة', note: `${arabicNumber(answered)} من ${arabicNumber(dimensions.length * 2)} إجابة`, icon: Sparkles },
        { key: 'personality', title: 'تقييم شخصيتي', note: `${arabicNumber(personality)} من ${arabicNumber(personalityQuestions.length)} إجابة`, icon: Sparkles },
        { key: 'beena', title: 'بيننا · مواقف الحياة', note: `${arabicNumber(beenaProgress(p.beena).answered)} من ٦ مواقف · وقصة بكلماتك`, icon: Feather },
      ] : []),
      { key: 'preferences', title: 'بداية التعارف', note: 'نطاق العمر، إشراك الأهل، ووسيلة التواصل الخاصة', icon: HeartHandshake },
    ] },
  ];
  const group=groups[section];
  return <div className="nf-profile-studio pe-studio">
    <header className="pe-heading"><span className="nf-studio-eyebrow">مساحتك في نصفين</span><h1 ref={heading} tabIndex={-1}>تعديل ملفي</h1><p>اختر قسمًا للتعديل، ثم راجع التغييرات واحفظها.</p></header>
    <div className="pe-member"><div className="nf-studio-avatar"><ProfilePortraitPreview answers={p} photoUrl={photoUrl} portraitSource={portraitSource}/></div><div><strong>{p.displayName||'ملفي الشخصي'}</strong><small>{[p.city,p.profession].filter(Boolean).join(' · ')}</small></div><span className="pe-draft-status" data-changed={changed||undefined}>{changed?'مسودة':<><Check size={12}/> محفوظ</>}</span></div>
    <div className="pe-tabs" role="group" aria-label="أقسام تعديل الملف">{groups.map((item,index)=><button key={item.title} type="button" aria-pressed={section===index} onClick={()=>setSection(index)}>{index===0?<UserRound size={15}/>:<LockKeyhole size={14}/>} {item.title}</button>)}</div>
    <section className="pe-section" key={section}><p className="pe-section-note">{group.note}</p><div className="nf-studio-sections">
      {group.items.map(item=><button type="button" className="nf-studio-section" key={item.key} disabled={busy} onClick={()=>open(item.key as Chapter)}><span className="nf-studio-section-icon"><item.icon size={20} strokeWidth={1.6}/></span><span><strong>{item.title}</strong><small>{item.note}</small></span><ChevronLeft size={17}/></button>)}
    </div></section>
    {section===0&&<MotionPressButton className="pe-prompt-invite" disabled={busy} onClick={()=>open('story')}><Feather size={20} aria-hidden="true"/><span><strong>{promptCount?'إجابات تحكي عنك':'دع التفاصيل الصغيرة تحكي عنك'}</strong><small>{promptCount?`${arabicNumber(promptCount)} من ٣ إجابات اختيارية · راجعها أو أضف إليها`:'يومكما المثالي، وما تتمنى أن يفهمه شريكك'}</small></span><ChevronLeft size={17} aria-hidden="true"/></MotionPressButton>}
    <footer className="nf-studio-actions"><button type="button" className="f-primary" onClick={review} disabled={busy||!changed}>مراجعة وحفظ التعديلات<ArrowLeft size={18}/></button><small>{changed?'التعديلات مسودة حتى تؤكد حفظها.':'ملفك محفوظ. اختر أي قسم لتحديثه.'}</small></footer>
  </div>;
}
