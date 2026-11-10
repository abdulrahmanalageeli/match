import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight, BookOpen, ChevronLeft, CirclePause, CirclePlay, CreditCard, Download, Eye, Feather,
  LogOut, MapPin, Pencil, ShieldCheck, Trash2, Type, UserRound, Volume2, Vibrate, Image, UsersRound,
} from "../BrandIcons";
import { Brand } from "../Brand";
import { AvatarPortrait } from "../avatars/AvatarPortrait";
import type { AccountState, Profile } from "../types";
import { useDevicePreferences, useSystemReducedMotion } from "./preferences";
import { MemberData } from "./MemberData";
import { PhotoSettings } from "../photos/Photos";
import { PushSettings } from "../notifications/PushSettings";
import { NativePrivacy } from './NativePrivacy';
import "./settings.css";
import { ProfileGallery } from "../photos/ProfileGallery";
import type { CommunitySource } from "../community/data";
import { HelpCenter } from '../help/HelpCenter';
import { MemberProfile } from '../profile/MemberProfile';
import { publicProfile } from '../profile/publicProfile';
import { PortraitPhoto } from '../photos/PortraitPhoto';
import { beenaProgress } from '../beena/model';
import { ReadinessPassportPanel } from '../readiness/ReadinessPassport';
import { FamilyBridgePanel } from '../family/FamilyBridge';
import { VerificationCenter } from '../verification/VerificationCenter';
import { VerifiedBadge } from '../verification/VerifiedBadge';
import type { ManualVerificationClaim } from '../verification/model';
import { JourneyCompletion } from './JourneyCompletion';
import { SupportContact } from '../help/SupportContact';
import { feedback, hasHaptics } from '../feedback/haptics';

type Props = {
  testerSession?: string;
  completionEntry?: number;
  onProfileChanged?: () => void;
  source?: CommunitySource | null;
  state: AccountState | null;
  demoMember?: Profile;
  previewPhoto?: string;
  demo: boolean;
  paused: boolean;
  busy: boolean;
  onEdit: () => void;
  onBeena?: () => void;
  onTryOnboarding?: () => void;
  onMembership: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onExit: () => void;
  onPrivacy: () => void;
  onBack?: () => void;
  children?: ReactNode;
};

function SettingRow({ icon, title, detail, action, disabled, danger }: {
  icon: ReactNode; title: string; detail?: string; action: () => void; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button className={"st-row" + (danger ? " st-danger" : "")} type="button" onClick={action} disabled={disabled}>
      <span className="st-icon" aria-hidden="true">{icon}</span>
      <span className="st-row-copy"><strong>{title}</strong>{detail && <small>{detail}</small>}</span>
      <ChevronLeft className="st-chevron" size={16} aria-hidden="true" />
    </button>
  );
}

function PreferenceSwitch({ icon, title, checked, onChange, detail, disabled }: {
  icon: ReactNode; title: string; checked: boolean; onChange: () => void; detail?: string; disabled?: boolean;
}) {
  return (
    <button className="st-row st-switch" type="button" role="switch" aria-label={title} aria-checked={checked} onClick={() => { onChange(); feedback('selection'); }} disabled={disabled}>
      <span className="st-icon" aria-hidden="true">{icon}</span>
      <span className="st-row-copy"><strong>{title}</strong>{detail && <small>{detail}</small>}</span>
      <span className="st-switch-track" aria-hidden="true"><i /></span>
    </button>
  );
}

function ConfirmPreference({ action, demo, onCancel, onConfirm }: {
  action: "pause" | "exit"; demo: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const pause = action === "pause";
  const label = pause ? "إيقاف الترشيحات مؤقتًا" : demo ? "إنهاء التجربة" : "تسجيل الخروج";
  return (
    <dialog className="st-dialog" dir="rtl" ref={ref} aria-labelledby="st-confirm-heading" aria-describedby="st-confirm-detail"
      onCancel={event => { event.preventDefault(); onCancel(); }}>
      <span className="st-dialog-icon" aria-hidden="true">{pause ? <CirclePause /> : <LogOut />}</span>
      <h2 id="st-confirm-heading">{label}؟</h2>
      <p id="st-confirm-detail">{pause
        ? "سيُغلق الترشيح المقترح ويُخفى ملفك عن الطلبات الجديدة. تبقى المحادثات المقبولة وجسر الأهل متاحة مع صلاحية العضوية؛ يمكنك الاستئناف هنا متى شئت." + (demo ? "" : " يستمر اشتراك Apple حتى تلغيه.")
        : demo ? "ستنتهي هذه الجلسة وتعود إلى شاشة البداية." : "سيظل حسابك واشتراكك محفوظين ويمكنك تسجيل الدخول مجددًا."}</p>
      <form method="dialog" onSubmit={event => { event.preventDefault(); onConfirm(); }}>
        <button className="btn-secondary" type="button" autoFocus onClick={onCancel}>تراجع</button>
        <button className="btn-primary" type="submit">{label}</button>
      </form>
    </dialog>
  );
}

export function Settings({ testerSession, state, demoMember, demo, paused, busy, onEdit, onMembership, onBeena,
  onToggle, onDelete, onExit, onPrivacy, onBack, children, source, previewPhoto, onTryOnboarding, completionEntry = 0, onProfileChanged }: Props) {
  const { value, setPreference } = useDevicePreferences();
  const systemReduced = useSystemReducedMotion();
  const [confirm, setConfirm] = useState<"pause" | "exit" | null>(null);
  const [dataSheet, setDataSheet] = useState<{ mode: "export" | "visibility"; owner: string } | null>(null);
  const [showPhotos, setShowPhotos] = useState(false);
  const [showHelp,setShowHelp]=useState(false);
  const [showCompletion,setShowCompletion]=useState(false);
  useEffect(() => { if (completionEntry) setShowCompletion(true); }, [completionEntry]);
  const [profilePanel,setProfilePanel]=useState<'preview'|'photos'|'readiness'|'family'|'verification'|null>(null);
  const [ownClaims,setOwnClaims]=useState<ManualVerificationClaim[]>([]);
  useEffect(()=>{let current=true;setOwnClaims([]);if(source?.verification)void source.verification('state').then(result=>{if(current)setOwnClaims(result.claims);}).catch(()=>{});return()=>{current=false;};},[source,profilePanel]);
  const returnScroll=useRef(0);
  useLayoutEffect(()=>{if(profilePanel)window.scrollTo(0,0);},[profilePanel]);
  function openPanel(panel:'preview'|'photos'|'readiness'|'family'|'verification'){returnScroll.current=window.scrollY;setProfilePanel(panel);}
  function closePanel(){const panel=profilePanel;setProfilePanel(null);requestAnimationFrame(()=>{window.scrollTo(0,returnScroll.current);document.querySelector<HTMLButtonElement>(panel==='preview'?'button[aria-label="عرض ملفي كما يراه الآخرون"]':panel==='readiness'?'.st-readiness-entry button':panel==='family'?'.st-family-entry button':panel==='verification'?'.st-verification-entry button':'.st-member-photos')?.focus({preventScroll:true});});}
  const owner = demo ? "demo" : state?.user.id;
  const member = demo ? demoMember : state?.profile;
  const firstLetter = Array.from(member?.displayName.trim() || "")[0];
  const canManageMatching = Boolean(demo || state?.membership.active);
  const canSeeMembership = canManageMatching || state?.user.applicationStatus === "approved";
  const membershipDetail = demo ? "تجربة مجانية" : state?.membership.active ? "عضوية فعّالة" :
    state?.membership.canStart ? "متاحة للاشتراك" : "بانتظار توفر ترشيح مناسب";
  const location = member?.city || state?.user.email;
  if(showCompletion)return <JourneyCompletion paused={paused} busy={busy} demo={demo} canPause={canManageMatching}
    onBack={()=>{setShowCompletion(false);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.st-completion-entry button')?.focus());}}
    onPause={()=>{if(!paused&&!busy)onToggle();}} onMembership={canSeeMembership?onMembership:undefined}
    onFamily={source?.family?()=>{setShowCompletion(false);openPanel('family');}:undefined}
    onReadiness={source?.readiness?()=>{setShowCompletion(false);openPanel('readiness');}:undefined}/>;
  if(profilePanel==='verification'&&source&&member)return <VerificationCenter source={source} profile={member} onBack={closePanel}/>;
  if(profilePanel==='readiness'&&source)return <ReadinessPassportPanel source={source} onBack={closePanel}/>;
  if(profilePanel==='family'&&source)return <FamilyBridgePanel source={source} onBack={closePanel}/>;
  if(profilePanel==='preview'&&member)return <main className="app-screen st-profile-view" dir="rtl"><MemberProfile key={owner} person={{...publicProfile(member,owner??'self',previewPhoto),manualVerifications:ownClaims}} source={source} preview back={closePanel} backText="الإعدادات"/></main>;
  if(profilePanel==='photos'&&source)return <main className="app-screen st-profile-view" dir="rtl"><div className="screen-content st-photo-manager"><header className="mp-navigation"><button className="mp-back" onClick={closePanel}><ArrowRight size={18}/> الإعدادات</button><Brand compact/></header><span className="st-profile-kicker">حضور يعبّر عنك</span><h1>صور ملفي</h1><ProfileGallery source={source} editable onChanged={onProfileChanged}/></div></main>;
  return (
    <main className="app-screen st-screen" dir="rtl">
      <div className="screen-content st-content">
        <header className="st-top">
          <Brand />
          {onBack && <button className="st-back" type="button" onClick={onBack} aria-label="رجوع"><ArrowRight size={18} aria-hidden="true" /> رجوع</button>}
        </header>
        <h1 className="st-title">الإعدادات</h1>
        <p className="st-intro">ملفك، خصوصيتك، وتفضيلات حسابك.</p>
        <section className="st-member-card" aria-label="ملفي الشخصي">
          <div className="st-member-identity"><span className="st-member-avatar" aria-hidden="true">{member?.portrait?<PortraitPhoto portrait={member.portrait} source={source} alt=""/>:member?.publicAvatar?<AvatarPortrait avatar={member.publicAvatar} decorative/>:previewPhoto?<img src={previewPhoto} alt=""/>:firstLetter||<UserRound size={28}/>}</span><div><span className="st-profile-kicker">مساحتك في نصفين</span><h2>{member?.displayName||'ملفي الشخصي'}</h2><VerifiedBadge claims={ownClaims}/><p>{member?.city&&<MapPin size={13}/>}<bdi>{location||'أضف تفاصيلك الأولى'}</bdi>{member?.age&&<span>· {new Intl.NumberFormat('ar-SA').format(member.age)} عامًا</span>}</p></div></div>
          <div className="st-member-actions"><button type="button" disabled={!member||busy} onClick={()=>openPanel('preview')} aria-label="عرض ملفي كما يراه الآخرون"><Eye size={16}/> معاينة ملفي</button><button type="button" onClick={onEdit} disabled={busy} aria-label="ملفي وتفضيلاتي"><Pencil size={15}/> تعديل الملف</button></div>
          {source&&<button className="st-member-photos" onClick={()=>openPanel('photos')}><Image size={17}/><span><strong>صور ملفي</strong><small>إضافة وإدارة صور المعرض</small></span><ChevronLeft size={16}/></button>}
        </section>
        {Boolean(source?.verification || onBeena || source?.readiness || source?.family || member) && <section className="st-section" aria-labelledby="st-marriage-title">
          <h2 id="st-marriage-title">ملفك وخطوات الزواج</h2>
          <div className="st-group st-marriage-group">
            {source?.verification&&<div className="st-verification-entry"><SettingRow icon={<ShieldCheck/>} title="توثيق بياناتي" detail="استقبال المستندات متوقف · متابعة الطلبات السابقة وسحبها" action={()=>openPanel('verification')} disabled={busy||!member}/></div>}
            {onBeena&&<div className="st-beena-entry"><SettingRow icon={<BookOpen/>} title="بيننا · مواقف الحياة" detail={`${new Intl.NumberFormat('ar-SA').format(beenaProgress(member?.beena).answered)} من ٦ مواقف · كيف نعيش الحياة معًا؟`} action={onBeena} disabled={busy}/></div>}
            {source?.readiness&&<div className="st-readiness-entry"><SettingRow icon={<ShieldCheck/>} title="جواز الجاهزية للزواج" detail="نيّتك واستعدادك وإفاداتك · خاص وبإذنك" action={()=>openPanel('readiness')} disabled={busy}/></div>}
            {source?.family&&<div className="st-family-entry"><SettingRow icon={<UsersRound/>} title="جسر الأهل" detail="اربط أفراد أسرتك، وخطّطوا للخطوة الرسمية بخصوصية" action={()=>openPanel('family')} disabled={busy}/></div>}
            {member&&<div className="st-completion-entry"><SettingRow icon={<UsersRound/>} title="الخطوة الرسمية" detail="التقدم معًا، الخطوبة أو الزواج · خطوات خاصة لحسابك" action={()=>setShowCompletion(true)} disabled={busy}/></div>}
          </div>
        </section>}
        {state?.user.profileReviewPending && <p role="status">تعديلات ملفك قيد المراجعة ويمكنك تصحيحها دون انتظار. تبقى محادثاتك المقبولة متاحة مع صلاحية العضوية؛ يرى أطرافها آخر بياناتك المعتمدة.</p>}
        {!state?.user.profileReviewPending && state?.user.nextPublicProfileEditAt && new Date(state.user.nextPublicProfileEditAt).getTime() > Date.now() && <p>التعديل التالي لبيانات ملفك العامة متاح في {new Date(state.user.nextPublicProfileEditAt).toLocaleDateString('ar-SA')}. يمكنك مراجعة التفضيلات وإيقاف مشاركة صورك من أدواتها.</p>}
        <section className="st-section" aria-labelledby="st-privacy-title">
          <h2 id="st-privacy-title">العضوية والخصوصية</h2>
          <div className="st-group">
            {canSeeMembership && <SettingRow icon={<CreditCard />} title="عضويتي" detail={membershipDetail} action={onMembership} disabled={busy} />}
            {canManageMatching && <SettingRow icon={paused ? <CirclePlay /> : <CirclePause />}
              title={paused ? "استئناف الترشيحات" : "إيقاف الترشيحات مؤقتًا"}
              detail={paused ? "استقبال الترشيحات متوقف" : "ملفك متاح للترشيحات"}
              action={() => paused ? onToggle() : setConfirm("pause")} disabled={busy} />}
            <SettingRow icon={<ShieldCheck />} title="الخصوصية وشروط العضوية" action={onPrivacy} />
            {owner && <SettingRow icon={<Eye />} title="خصوصية بيانات الملف" action={() => setDataSheet({ mode: "visibility", owner })} />}
            {owner && <SettingRow icon={<Image />} title="صورتي الخاصة" detail="مشاركة اختيارية داخل المحادثات" action={() => setShowPhotos(true)} />}
            {owner && <SettingRow icon={<Download />} title="نسخة من بياناتي" action={() => setDataSheet({ mode: "export", owner })} />}
          </div>
        </section>
        <section className="st-section" aria-label="المساعدة"><h2>المساعدة والدعم</h2><div className="st-group">{onTryOnboarding&&<SettingRow icon={<CirclePlay/>} title="تجربة التسجيل من البداية" detail="كأنك عضو جديد، دون تغيير حسابك" action={onTryOnboarding}/>}<SettingRow icon={<BookOpen/>} title="دليلك في نصفين" detail="التوافق، الصور، المكالمات، الحصرية، والأسئلة الشائعة" action={()=>setShowHelp(true)}/></div></section>
        <SupportContact />
        <section className="st-section" aria-labelledby="st-device-title">
          <h2 id="st-device-title">التجربة على هذا الجهاز</h2>
          <div className="st-group">
            <PreferenceSwitch icon={<Type />} title="تكبير النص" checked={value.largeText} onChange={() => setPreference("largeText", !value.largeText)} />
            <PreferenceSwitch icon={<Feather />} title="تقليل الحركة" detail={systemReduced ? "مفعّل من إعدادات جهازك" : undefined} checked={systemReduced || value.reducedMotion} disabled={systemReduced} onChange={() => setPreference("reducedMotion", !value.reducedMotion)} />
            <PreferenceSwitch icon={<Volume2 />} title="صوت التوافق" detail="نغمة قصيرة للتوافق والخطوات المتبادلة" checked={value.matchSound} onChange={() => setPreference("matchSound", !value.matchSound)} />
            {hasHaptics() && <PreferenceSwitch icon={<Vibrate />} title="تأكيد باللمس" detail="لمسة خفيفة عند الحفظ والقرارات، دون اهتزاز أثناء التصفح" checked={value.haptics} onChange={() => setPreference('haptics', !value.haptics)} />}
          </div>
        </section>
        <PushSettings owner={owner ?? null} demo={demo} testerSession={testerSession} />
        <NativePrivacy />
        <section className="st-section st-access" aria-labelledby="st-access-title">
          <h2 id="st-access-title">الحساب</h2>
          <div className="st-group">
            <SettingRow icon={<LogOut />} title={demo ? "إنهاء التجربة" : "تسجيل الخروج"} action={() => setConfirm("exit")} disabled={busy} />
            {!demo && <SettingRow icon={<Trash2 />} title="حذف حسابي" action={onDelete} disabled={busy} danger />}
          </div>
        </section>
      </div>
      {children}
      {showHelp&&<HelpCenter close={()=>setShowHelp(false)}/>}
      {showPhotos && owner && <PhotoSettings key={owner} owner={owner} demo={demo} close={() => setShowPhotos(false)} />}
      {dataSheet && owner === dataSheet.owner && <MemberData key={owner} mode={dataSheet.mode} owner={owner}
        demo={demo} profile={member} close={() => setDataSheet(null)} />}
      {confirm && <ConfirmPreference action={confirm} demo={demo} onCancel={() => setConfirm(null)}
        onConfirm={() => { setConfirm(null); if (confirm === "pause") onToggle(); else onExit(); }} />}
    </main>
  );
}
