import {MemberBadge} from '../membership/MemberBadge';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight, BookOpen, ChevronLeft, CirclePause, CirclePlay, Copy, CreditCard, Download, Eye, Feather,
  LogOut, MapPin, Pencil, ShieldCheck, Trash2, Type, UserRound, Volume2, Vibrate, Image, UsersRound,
} from "../BrandIcons";
import { Brand } from "../Brand";
import { AvatarPortrait } from "../avatars/AvatarPortrait";
import type { AccountState, Profile } from "../types";
import { useDevicePreferences, useSystemReducedMotion } from "./preferences";
import { RequestHistory } from '../community/RequestHistory';
import { MatchingExclusions } from "./MatchingExclusions";
import { MemberData } from "./MemberData";
import { useCapturePrivacy } from '../privacy/CapturePrivacy';
import { PushSettings } from "../notifications/PushSettings";
import { LunaReviewPermission } from './LunaReviewPermission';
import { NativePrivacy } from './NativePrivacy';
import "./settings.css";
import { ProfileGallery } from "../photos/ProfileGallery";
import type { CommunitySource } from "../community/data";
import { HelpCenter } from '../help/HelpCenter';
import { MemberProfile } from '../profile/MemberProfile';
import { publicProfile } from '../profile/publicProfile';
import { PortraitPhoto } from '../photos/PortraitPhoto';
import { ReadinessPassportPanel } from '../readiness/ReadinessPassport';
import { FamilyBridgePanel } from '../family/FamilyBridge';
import { VerificationCenter } from '../verification/VerificationCenter';
import { VerifiedBadge } from '../verification/VerifiedBadge';
import type { ManualVerificationClaim } from '../verification/model';
import { JourneyCompletion } from './JourneyCompletion';
import { SupportContact } from '../help/SupportContact';
import { feedback, hasHaptics } from '../feedback/haptics';
import { applePeriodText, settingsDate, useSettingsSummary } from './settingsSummary';

type Props = {
  onTestMembership?: (tier:'actual'|'free'|'premium'|'seriousness')=>void;
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

function DirectoryWork({source}: {source: CommunitySource}) {
  const [choice,setChoice] = useState<string | null>(null);
  const [busy,setBusy] = useState(false), [status,setStatus] = useState('');
  useEffect(()=>{
    let current=true;
    setChoice(null); setStatus('');
    source.directoryWork?.().then(value=>{if(current)setChoice(value ?? '');},()=>{if(current)setStatus('تعذّر تحميل الاختيار.');});
    return ()=>{current=false;};
  },[source]);
  async function save() {
    if (!source.directoryWork || choice===null) return;
    setBusy(true);
    try { await source.directoryWork(choice || null); setStatus('حُفظ اختيارك.'); }
    catch {setStatus('تعذّر الحفظ. أعد المحاولة.');}
    finally {setBusy(false);}
  }
  return <details><summary>تفضيل العمل المنشور</summary><p>يمكن للأعضاء البحث عن ملفك وفق اختيارك المنشور هنا. يمكنك سحبه في أي وقت.</p>
    <label>الموقف من عمل الزوجة<select value={choice ?? ''} disabled={busy || choice===null} onChange={e=>{setChoice(e.target.value);setStatus('');}}>
      <option value="">خاص · لا أنشر اختياري</option><option value="A">تفضيل العمل</option><option value="B">تفضيل عدم العمل</option><option value="C">المرونة حسب الاتفاق</option>
    </select></label><button type="button" disabled={busy || choice===null} onClick={()=>void save()}>حفظ</button><p role="status">{status}</p></details>;
}

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
  const label = pause ? "إيقاف الترشيحات مؤقتًا" : "تسجيل الخروج";
  return (
    <dialog className="st-dialog" dir="rtl" ref={ref} aria-labelledby="st-confirm-heading" aria-describedby="st-confirm-detail"
      onCancel={event => { event.preventDefault(); onCancel(); }}>
      <span className="st-dialog-icon" aria-hidden="true">{pause ? <CirclePause /> : <LogOut />}</span>
      <h2 id="st-confirm-heading">{label}؟</h2>
      <p id="st-confirm-detail">{pause
        ? "سيُغلق الترشيح المقترح ويُخفى ملفك عن الطلبات الجديدة. تبقى المحادثات المقبولة وجسر الأهل متاحة؛ يمكنك الاستئناف هنا متى شئت." + (demo ? "" : " يستمر اشتراك Apple حتى تلغيه.")
        : demo ? "ستنتهي هذه الجلسة وتعود إلى شاشة البداية." : "سيظل حسابك واشتراكك محفوظين ويمكنك تسجيل الدخول مجددًا."}</p>
      <form method="dialog" onSubmit={event => { event.preventDefault(); onConfirm(); }}>
        <button className="btn-secondary" type="button" autoFocus onClick={onCancel}>تراجع</button>
        <button className="btn-primary" type="submit">{label}</button>
      </form>
    </dialog>
  );
}

export function Settings({ testerSession, state, demoMember, demo, paused, busy, onEdit, onMembership, onBeena,
  onToggle, onDelete, onExit, onPrivacy, onBack, children, source, previewPhoto, onTryOnboarding, completionEntry = 0, onProfileChanged, onTestMembership }: Props) {
  const { value, setPreference } = useDevicePreferences();
  const systemReduced = useSystemReducedMotion();
  const [confirm, setConfirm] = useState<"pause" | "exit" | null>(null);
  const [dataSheet, setDataSheet] = useState<{ mode: "export" | "visibility"; owner: string } | null>(null);
  const [memberIdCopied,setMemberIdCopied] = useState(false);
  const [showHelp,setShowHelp]=useState(false);
  const [showCompletion,setShowCompletion]=useState(false);
  useEffect(() => { if (completionEntry) setShowCompletion(true); }, [completionEntry]);
  const [profilePanel,setProfilePanel]=useState<'preview'|'photos'|'readiness'|'family'|'verification'|'exclusions'|null>(null);
  useCapturePrivacy(profilePanel === 'photos' ? 'profile' : null);
  const [ownClaims,setOwnClaims]=useState<ManualVerificationClaim[]>([]);
  const [hasPreviousVerification,setHasPreviousVerification]=useState(false);
  useEffect(()=>{let current=true;setOwnClaims([]);setHasPreviousVerification(false);if(source?.verification)void source.verification('state').then(result=>{if(current){setOwnClaims(result.claims);setHasPreviousVerification(result.requests.length>0);}}).catch(()=>{});return()=>{current=false;};},[source,profilePanel]);
  const returnScroll=useRef(0);
  useLayoutEffect(()=>{if(profilePanel)window.scrollTo(0,0);},[profilePanel]);
  function openPanel(panel:'preview'|'photos'|'readiness'|'family'|'verification'|'exclusions'){returnScroll.current=window.scrollY;setProfilePanel(panel);}
  function closePanel(){const panel=profilePanel;setProfilePanel(null);requestAnimationFrame(()=>{
    window.scrollTo(0,returnScroll.current);
    const button=document.querySelector<HTMLButtonElement>(panel==='preview'?'button[aria-label="عرض ملفي كما يراه الآخرون"]':panel==='readiness'?'.st-readiness-entry button':panel==='family'?'.st-family-entry button':panel==='exclusions'?'.st-exclusions-entry button':panel==='verification'?'.st-verification-entry button':'.st-member-photos');
    const fold=button?.closest('details');
    if(fold)fold.open=true;
    button?.focus({preventScroll:true});
  });}
  const owner = demo ? "demo" : state?.user.id;
  const summary = useSettingsSummary(demo ? null : state,paused,source);
  const member = demo ? demoMember : state?.profile;
  const firstLetter = Array.from(member?.displayName.trim() || "")[0];
  const canManageMatching = Boolean(demo || state?.user.applicationStatus === "approved" || state?.user.profileReviewPending);
  const canSeeMembership = canManageMatching || state?.membership.active;
  const tier = state?.membership.tier ?? (state?.membership.active ? 'premium' : 'free');
  const membershipDetail = state?.membership.status==='expired'?'انتهت صلاحية العضوية': state?.membership.status==='trial'?'تجربتك المجانية مفعّلة': {free:'العضوية المجانية · استكشف مزايا الترقية', premium:'العضوية المميزة', seriousness:'وسام الجدية'}[tier];
  const membershipBillingDetail = demo ? null : summary.data?.subscriptions[0] ? applePeriodText(summary.data.subscriptions[0]) :
    state?.membership.expiresAt && state.membership.active ? (state.membership.status==='trial'?'تنتهي تجربتك في ':'وصولك سارٍ حتى ') + settingsDate(state.membership.expiresAt) + '.' : null;
  const location = member?.city || state?.user.email;
  const visibility = demo ? (paused ? 'paused' : 'eligible') : summary.data?.visibility;
  const visibilityText = visibility ? {
    paused:'ظهورك في الترشيحات متوقف مؤقتًا',eligible:'ملفك متاح للترشيحات',review:'يظهر ملفك في الترشيحات بعد اعتماده',
    draft:'أكمل ملفك وأرسله للمراجعة ليظهر في الترشيحات.',
    membership:'ظهورك يتطلب عضوية سارية',exclusive:'الترشيحات متوقفة أثناء التعارف الحصري',unavailable:'ملفك غير متاح للترشيحات',
  }[visibility] : null;
  async function copyMemberId() {
    if (!state?.user.id) return;
    try {
      await navigator.clipboard.writeText(state.user.id);
      setMemberIdCopied(true);
    } catch {
      setMemberIdCopied(false);
    }
  }
  if(showCompletion)return <JourneyCompletion paused={paused} busy={busy} demo={demo} canPause={canManageMatching}
    onBack={()=>{setShowCompletion(false);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.st-completion-entry button')?.focus());}}
    onPause={()=>{if(!paused&&!busy)onToggle();}} onMembership={canSeeMembership?onMembership:undefined}
    onFamily={source?.family?()=>{setShowCompletion(false);openPanel('family');}:undefined}
    onReadiness={source?.readiness?()=>{setShowCompletion(false);openPanel('readiness');}:undefined}/>;
  if(profilePanel==='exclusions'&&source)return <MatchingExclusions source={source} onBack={closePanel}/>;
  if(profilePanel==='verification'&&source&&member)return <VerificationCenter source={source} profile={member} onBack={closePanel}/>;
  if(profilePanel==='readiness'&&source)return <ReadinessPassportPanel source={source} onBack={closePanel}/>;
  if(profilePanel==='family'&&source)return <FamilyBridgePanel source={source} onBack={closePanel}/>;
  if(profilePanel==='preview'&&member){
    const preview = state?.user.profileReviewPending ? summary.data?.approvedPreview : publicProfile(member,owner??'self',previewPhoto);
    return <main className="app-screen st-profile-view" dir="rtl">{preview ?
    <MemberProfile key={owner} person={{...preview,manualVerifications:ownClaims,membershipTier:tier}} source={state?.user.profileReviewPending ? undefined : source} preview back={closePanel} backText="الإعدادات"/> :
    <div className="screen-content"><button className="mp-back" onClick={closePanel}><ArrowRight size={18}/>الإعدادات</button>
      <p role="status">{summary.error ? 'تعذّر تحميل النسخة المعتمدة.' : summary.data ? 'لا تتوفر نسخة معتمدة للمعاينة حتى اكتمال المراجعة.' : 'جارٍ تحميل النسخة المعتمدة…'}</p>{summary.error&&<button className="btn-secondary" onClick={summary.refresh}>إعادة المحاولة</button>}</div>}</main>;
  }
  if(profilePanel==='photos')return <main className="app-screen st-profile-view" dir="rtl"><div className="screen-content st-photo-manager">
    <header className="mp-navigation"><button className="mp-back" onClick={closePanel}><ArrowRight size={18}/> الإعدادات</button><Brand compact/></header>
    <h1>صوري وخصوصيتها</h1>
    {source?.gallery && <section className="st-section"><h2>صور تظهر في ملفي</h2><ProfileGallery source={source} editable onChanged={onProfileChanged}/></section>}
  </div></main>;
  return (
    <main className="app-screen st-screen" dir="rtl">
      <div className="screen-content st-content">
        <header className="st-top">
          <Brand />
          {onBack && <button className="st-back" type="button" onClick={onBack} aria-label="رجوع"><ArrowRight size={18} aria-hidden="true" /> رجوع</button>}
        </header>
        <h1 className="mi-sr-only">الإعدادات</h1>
        <section className="st-member-card" aria-label="ملفي الشخصي">
          <div className="st-member-identity"><span className="st-member-avatar"><span className="st-member-avatar-mask">{member?.portrait?<PortraitPhoto portrait={member.portrait} source={source} alt=""/>:member?.publicAvatar?<AvatarPortrait avatar={member.publicAvatar} decorative/>:previewPhoto?<img src={previewPhoto} alt=""/>:firstLetter||<UserRound size={28}/>}</span><MemberBadge tier={state?.membership.tier} active={state?.membership.active}/></span><div><h2>{member?.displayName||'ملفي الشخصي'}</h2><VerifiedBadge claims={ownClaims}/><p>{member?.city&&<MapPin size={13}/>}<bdi>{location||'أضف تفاصيلك الأولى'}</bdi>{member?.age&&<span>· {new Intl.NumberFormat('ar-SA').format(member.age)} عامًا</span>}</p></div></div>
          <div className="st-member-actions">
            <button type="button" onClick={onEdit} disabled={busy} aria-label="ملفي وتفضيلاتي"><Pencil size={16}/><span>تعديل</span></button>
            <button type="button" disabled={!member||busy} onClick={()=>openPanel('preview')} aria-label="عرض ملفي كما يراه الآخرون"><Eye size={17}/><span>معاينة</span></button>
            {source?.gallery&&<button type="button" className="st-member-photos" onClick={()=>openPanel('photos')}><Image size={17}/><span>الصور</span></button>}
          </div>
          {canSeeMembership&&<button type="button" className="st-membership-summary" onClick={onMembership} disabled={busy} aria-label={'عضويتي · '+membershipDetail}>
            <span className="st-membership-summary-icon"><CreditCard size={18}/></span>
            <span><small>عضويتك</small><strong>{membershipDetail}</strong>{membershipBillingDetail&&<small className="st-membership-billing">{membershipBillingDetail}</small>}</span><ChevronLeft size={16}/>
          </button>}
          <div className="st-discovery-state" data-visibility={visibility}><span role="status">{visibilityText ?? (summary.error?'تعذّر التحقق من ظهور ملفك.':'جارٍ التحقق من ظهور ملفك…')}</span>
            {summary.error && !visibilityText && <button className="btn-text" onClick={summary.refresh}>إعادة المحاولة</button>}
            {canManageMatching && <button type="button" className="btn-text" disabled={busy} aria-label={paused?'استئناف الظهور':'إيقاف الترشيحات مؤقتًا'} onClick={()=>paused?onToggle():setConfirm('pause')}>{paused?'استئناف الظهور':'إيقاف مؤقت'}</button>}</div>
          {state?.user.profileReviewPending && <p className="st-note" role="status">تعديلاتك قيد المراجعة. تعرض المعاينة النسخة المعتمدة التي يراها من سبق لك التعارف معهم.</p>}
        </section>
        {Boolean(hasPreviousVerification || onBeena || source?.readiness || source?.family || member) && <details className="st-section st-fold st-hub">
          <summary><span><strong>رحلتي وأدوات الزواج</strong><small>بيننا، الجاهزية، الأهل والخطوة الرسمية</small></span></summary>
          <div className="st-group st-marriage-group">
            {hasPreviousVerification&&<div className="st-verification-entry"><SettingRow icon={<ShieldCheck/>} title="طلبات التوثيق السابقة" action={()=>openPanel('verification')} disabled={busy||!member}/></div>}
            {onBeena&&<div className="st-beena-entry"><SettingRow icon={<BookOpen/>} title="بيننا · سؤال وجواب" detail={member?.beena?.story?.text.trim() ? member.beena.story.share ? "إجابتك ظاهرة في ملفك" : "إجابتك خاصة" : "أضف إجابتك"} action={onBeena} disabled={busy}/></div>}
            {source?.readiness&&<div className="st-readiness-entry"><SettingRow icon={<ShieldCheck/>} title="جواز الجاهزية للزواج" detail="استعدادك للزواج وخيارات مشاركته" action={()=>openPanel('readiness')} disabled={busy}/></div>}
            {source?.family&&<div className="st-family-entry"><SettingRow icon={<UsersRound/>} title="جسر الأهل" detail="دعوات الأسرة ومحادثاتها" action={()=>openPanel('family')} disabled={busy}/></div>}
            {member&&<div className="st-completion-entry"><SettingRow icon={<UsersRound/>} title="الخطوة الرسمية" detail="التقدّم أو الخطوبة أو الزواج" action={()=>setShowCompletion(true)} disabled={busy}/></div>}
          </div>
        </details>}
        {!state?.user.profileReviewPending && state?.user.nextPublicProfileEditAt && new Date(state.user.nextPublicProfileEditAt).getTime() > Date.now() && <p>التعديل التالي لبيانات ملفك العامة متاح في {new Date(state.user.nextPublicProfileEditAt).toLocaleDateString('ar-SA')}. يمكنك مراجعة التفضيلات وإيقاف مشاركة صورك من أدواتها.</p>}
        <details className="st-section st-fold st-hub">
          <summary><span><strong>الخصوصية والبيانات</strong><small>الحظر، الأذونات ونسخة بياناتك</small></span></summary>
          <div className="st-group">
            {source?.requestHistory && <RequestHistory source={source} title="السجل والإبلاغ عن تعارف سابق"/>}
            {source?.directoryWork && <DirectoryWork source={source}/>}
            {source?.matchingExclusions && <div className="st-exclusions-entry"><SettingRow icon={<ShieldCheck/>} title="الحظر وعدم إعادة الترشيح" detail="الأشخاص المحظورون والتعارفات المستبعدة" action={()=>openPanel('exclusions')} /></div>}
            <SettingRow icon={<ShieldCheck />} title="الخصوصية وشروط العضوية" action={onPrivacy} />
            {!demo && owner && <LunaReviewPermission key={owner} owner={owner}/>}
            {owner && <SettingRow icon={<Eye />} title="خصوصية بيانات الملف" action={() => setDataSheet({ mode: "visibility", owner })} />}
            {owner && <SettingRow icon={<Download />} title="نسخة من بياناتي" action={() => setDataSheet({ mode: "export", owner })} />}
          </div>
        </details>
        {!demo&&state?.membershipTesting&&onTestMembership&&<section className="st-section" aria-label="معاينة العضويات"><h2>معاينة العضويات</h2><div className="st-group">{([['actual','العضوية الفعلية'],['free','المجانية'],['premium','المميزة'],['seriousness','وسام الجدية']] as const).map(([tier,label])=><PreferenceSwitch key={tier} icon={<CreditCard/>} title={label} checked={state.membershipTesting?.selected===tier} disabled={busy} onChange={()=>onTestMembership(tier)}/>)}</div><p className="flow-note">لحسابك فقط، لمدة ٢٤ ساعة. لا يغيّر فواتير Apple أو يلغي الاشتراك.</p></section>}
        <details className="st-section st-fold st-hub"><summary><span><strong>العرض والصوت</strong><small>حجم النص، الحركة والتنبيهات الحسية</small></span></summary>
          <div className="st-group">
            <PreferenceSwitch icon={<Type />} title="تكبير النص" checked={value.largeText} onChange={() => setPreference("largeText", !value.largeText)} />
            <PreferenceSwitch icon={<Feather />} title="تقليل الحركة" detail={systemReduced ? "مفعّل من إعدادات جهازك" : undefined} checked={systemReduced || value.reducedMotion} disabled={systemReduced} onChange={() => setPreference("reducedMotion", !value.reducedMotion)} />
            <PreferenceSwitch icon={<Volume2 />} title="صوت التوافق" detail="نغمة قصيرة للتوافق والخطوات المتبادلة" checked={value.matchSound} onChange={() => setPreference("matchSound", !value.matchSound)} />
            {hasHaptics() && <PreferenceSwitch icon={<Vibrate />} title="تأكيد باللمس" detail="لمسة خفيفة عند تأكيد الاختيار" checked={value.haptics} onChange={() => setPreference('haptics', !value.haptics)} />}
          </div>
        </details>
        <PushSettings owner={owner ?? null} demo={demo} testerSession={testerSession} folded />
        <NativePrivacy owner={testerSession ? 'tester:'+testerSession : !demo ? owner??null : null} folded />
        <details className="st-section st-fold st-hub"><summary><span><strong>المساعدة والدعم</strong><small>الدليل والتواصل مع الفريق</small></span></summary><div className="st-group">{onTryOnboarding&&<SettingRow icon={<CirclePlay/>} title="تجربة التسجيل من البداية" detail="كأنك عضو جديد، دون تغيير حسابك" action={onTryOnboarding}/>}<SettingRow icon={<BookOpen/>} title="دليلك في وُدَين" detail="الميزات والأسئلة الشائعة" action={()=>setShowHelp(true)}/></div><SupportContact/></details>
        <details className="st-section st-fold st-hub st-access"><summary><span><strong>الحساب</strong><small>المعرّف، تسجيل الخروج وحذف الحساب</small></span></summary>
          <div className="st-group">
            {state?.user.id&&<button type="button" className="st-row st-member-id-row" onClick={()=>void copyMemberId()}><span className="st-icon"><Copy size={18}/></span><span className="st-row-copy"><strong>معرّف العضو</strong><small dir="ltr">{state.user.id}</small></span><span aria-live="polite">{memberIdCopied?'تم النسخ':'نسخ'}</span></button>}
            <SettingRow icon={<LogOut />} title="تسجيل الخروج" action={() => setConfirm("exit")} disabled={busy} />
            {!demo && <SettingRow icon={<Trash2 />} title="حذف حسابي" action={onDelete} disabled={busy} danger />}
          </div>
        </details>
      </div>
      {children}
      {showHelp&&<HelpCenter close={()=>setShowHelp(false)}/>}
      {dataSheet && owner === dataSheet.owner && <MemberData key={owner} mode={dataSheet.mode} owner={owner}
        demo={demo} profile={member} close={() => setDataSheet(null)} />}
      {confirm && <ConfirmPreference action={confirm} demo={demo} onCancel={() => setConfirm(null)}
        onConfirm={() => { setConfirm(null); if (confirm === "pause") onToggle(); else onExit(); }} />}
    </main>
  );
}
