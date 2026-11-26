import { Sheet } from './Sheet';
import {DemoDeepReading} from './DemoDeepReading';
import {RelocationCities} from './RelocationCities';
import {LunaSearch} from './LunaSearch';
import {MemberBadge} from '../membership/MemberBadge';
import {MembershipEntry} from '../membership/MembershipEntry';
import {shuffleWithVisibility} from './visibilityOrder';
import {useMembershipAccess} from '../membership/access';
import memberAr from '../member-copy.ts';
import { languageOptions } from "../compatibility/marriage";
import { ScoreTile } from '../compatibility/ScoreTile';
import { VerifiedBadge } from '../verification/VerifiedBadge';
import { ScenePaths } from '../ScenePaths';
import { useCapturePrivacy } from '../privacy/CapturePrivacy';
import { MotionPressButton, MotionReveal } from '../motion/Reanimated';
import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
  type RefObject,
  type TouchEvent,
} from "react";
import { flushSync } from "react-dom";
import { lockChatViewport } from "./chatViewport";
import { SwipeReply } from "./SwipeReply";
import { MessageReactions, ReactionPicker } from './MessageReactions';
import { MessageFocus } from './MessageFocus';
import { ChatLibrary } from './ChatLibrary';
import { useChatReading } from './useChatReading';
import { useTyping } from './useTyping';
import { journeyNext } from './journeyNext';
import { NextStep } from './NextStep';
import type { NextStepState } from './nextStepModel';
import { readBrowseMemory, saveBrowseMemory } from './discoveryMemory';
import { decisionContext } from '../profile/decisionContext';
import { canRetryRead } from './readRecovery';
import { useReadRecovery } from './useReadRecovery';
import { ThreadConnection } from './ThreadConnection';
import { DeepCompatibility } from './DeepCompatibility';
import { deepTimelineIndex } from './deepCompatibilityModel';
import './everyday.css';
import {
  ArrowLeft,
  ArrowDown,
  ArrowRight,
  Ban,
  BriefcaseBusiness,
  BookOpen,
  Check,
  CheckCheck,
  CircleMinus,
  Clock3,
  ChevronLeft,
  Compass,
  Flag,
  EyeOff,
  Heart,
  Inbox as InboxIcon,
  LockKeyhole,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pause,
  RotateCcw,
  Reply,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UsersRound,
  Volume2,
  VolumeX,
  X,
} from "../BrandIcons";
import { Brand } from "../Brand";
import { MemberTabs } from "../Home";
import { interests } from "../compatibility/model";
import { marriageTimelineLabels } from "../compatibility/marriage";
import { cityOptions, nationalityChoices, canonicalCity, canonicalNationality, educationOptions, professionOptions, numericOptions } from '../profile/profileOptions';
import { ChoiceSelect } from '../ui/ChoiceSelect';
import { SheetChoiceSelect } from '../ui/SheetChoiceSelect';
import { FitDetails, partialPreferenceCoverage, preferencePercentage } from "../compatibility/FitDetails";
import { AvatarPortrait } from "../avatars/AvatarPortrait";
import { PersonAvatar } from "../avatars/PersonAvatar";
import { MatchesOverview } from './MatchesOverview';
import { dressStyles, type PublicAvatar } from "../compatibility/appearance";
import type { StepProgress } from "./data";
import { journeyStages } from '../notifications/ActivityAlerts';
import { NativePushAction } from '../notifications/NativePushAction';
import type { PushOpen } from '../notifications/push';
import { NotificationFeed } from '../notifications/NotificationFeed';
import { pushThreadMute } from '../notifications/push';
import './chat-polish.css';
import './message-actions.css';
import './directory.css';
import { MemberProfile as Profile } from '../profile/MemberProfile';
import { PortraitPhoto } from '../photos/PortraitPhoto';
import { DiscoveryPhoto } from '../privacy/DiscoveryPhoto';
import { nativePrivatePhoto } from './privatePhoto';
import { HelpButton, HelpCenter } from '../help/HelpCenter';
import { SupportContact } from '../help/SupportContact';
import { SuccessNotice } from './SuccessNotice';
import { CommunitySkeleton } from './CommunitySkeleton';
import { feedback } from '../feedback/haptics';
import { ChatInsights } from './ChatInsights';
import { FamilyBridgePanel } from '../family/FamilyBridge';
import type {
  CommunitySource,
  Connection,
  Message,
  ReactionEmoji,
  PublicPerson,
} from "./data";
import { denied, discardClosedDrafts, type Outgoing } from "./chatOutbox";
import { useThread } from "./useThread";
import { ChatMediaComposer, MessageMedia } from "./ChatMedia";
import { CallPermissionButton } from "./CallPermission";
import { ChatScreenshotNotice } from "../privacy/ChatScreenshotNotice";
import { ConversationAgreement } from "./ConversationAgreement";
import { ConversationPilotFeedback } from "./ConversationPilotFeedback";
import { useReadPosition } from "./useReadPosition";
import { useVoiceCalls } from "../voice/VoiceCalls";
import { chatHandoff } from "./chatMotion";
import { useWeeklyCardTransition } from "./useWeeklyCardTransition";
import "./community.css";
import "./weeklyCards.css";
import "./discovery.css";
import "./journey.css";
import './chat-continuity.css';

function AddPersonMark({ compact = false }: { compact?: boolean }) {
  return <img className={compact?'dr-row-add-logo':'nf-add-person-mark'} src="/brand/wudayn-add-plus-v2.png" width={compact?14:24} height={compact?14:24} alt="" aria-hidden="true"/>;
}

type Tab = "discover" | "curated" | "inbox" | "chats";
type CommunityProps = {
  pushOwner?: string | null;
  viewerGender?: "man" | "woman";
  onMutual: (connection: Connection) => void;
  openConversation?: string;
  openMessage?: string;
  openRoom?:string;openAgreement?:boolean;openAnalysis?:boolean;openJourney?:boolean;openInterest?:string;
  openRequest?: string;
  openUpdate?: (update:PushOpen)=>void|Promise<void>;
  onConversationOpened: () => void;
  profileSaved?: boolean;
  onBeena?: () => void;
  beenaAnswered?: number;
  tab: Tab;
  source: CommunitySource;
  onTab: (tab: Tab) => void;
  onHome: () => void;
  onAccount: () => void;
  onChats?: () => void;
  onCompletion?: () => void;
  chatUnread?: number;
  paused: boolean;
  profileReviewPending?: boolean;
  onResume: () => void;
};
type Filters = import('./data').Filters;
type SafetyAction = "block" | "report";
const ar = new Intl.NumberFormat("ar-SA");
const time = new Intl.DateTimeFormat("ar-SA", {
  hour: "2-digit",
  minute: "2-digit",
});
const dateLabel = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const emptyFilters: Filters = {};
const filterHeightOptions = numericOptions(120, 230, 'سم');
const filterWeightOptions = numericOptions(35, 250, 'كجم');
const reportCategories = ['تهديد فوري للسلامة', 'إساءة أو ضغط غير مرغوب', 'انتحال أو معلومات مضللة', 'طلب أموال أو احتيال', 'انتهاك الخصوصية', 'محتوى غير مناسب', 'سبب آخر'];
const practicalQuestions = [
  ['السكن والمدينة', 'أين تتصور أن نستقر، وهل سيكون السكن مستقلًا؟ وما حدود المرونة في الانتقال؟'],
  ['تكاليف الزواج والمال', 'كيف نناقش المهر وتكاليف الزواج والميزانية بما يناسب ظروفنا، دون ضغط على أي منا؟'],
  ['العمل ومسؤوليات البيت', 'كيف تتصور عمل كل منا وتقاسم مسؤوليات البيت، خصوصًا عند ضغط العمل؟'],
  ['الأهل والخصوصية', 'كيف نوازن بين صلة الأهل وخصوصية بيتنا، ومن نرغب بإشراكه في الخطوة القادمة؟'],
  ['الأطفال والمسؤوليات السابقة', 'ما تصورك للأطفال وتوقيتهم؟ وإن كانت لأحدنا مسؤوليات أسرية سابقة، كيف نحترمها معًا؟'],
  ['الوتيرة والحدود', 'ما وتيرة التواصل التي تريحك؟ وما الذي تحتاج أن تعرفه قبل الخطوة العائلية أو الالتزام الحصري؟'],
];

function ReportReceipt({ demo, close }: { demo: boolean; close: () => void }) {
  return <div className="cm-report-receipt"><SuccessNotice title={demo ? 'أُغلق التواصل مع هذا الملف' : 'أُرسل بلاغك للمراجعة'} detail={demo ? 'أُخفي الملف من تجربتك.' : 'اكتمل إرسال البلاغ. يمكنك مراسلة الفريق إذا احتجت متابعة.'} close={close}/>{!demo && <SupportContact subject="متابعة بلاغ في وُدَين" context="للمتابعة، اذكر اسم العرض والتاريخ التقريبي للبلاغ. تجنّب إرسال صور الهوية أو تفاصيل خاصة لا تحتاجها المتابعة."/>}</div>;
}

function RequestWaiting({ connection }: { connection: Connection }) {
  const sentDate = connection.createdAt && messageDay(connection.createdAt);
  const expiryDate = connection.expiresAt && messageDay(connection.expiresAt);
  return <div className="cm-request-waiting"><strong>{connection.direction === 'outgoing' ? 'الخطوة التالية لدى الطرف الآخر' : 'هذه دعوة للتعارف، والقرار لك'}</strong>{sentDate && <p>أُرسل الطلب في <time dateTime={connection.createdAt}>{sentDate}</time>.</p>}{expiryDate && <p>تنتهي مهلة الرد في <time dateTime={connection.expiresAt}>{expiryDate}، {time.format(new Date(connection.expiresAt!))}</time>. بعدها ينتقل الطلب إلى السجل المغلق.</p>}<p>{connection.direction === 'outgoing' ? 'سنخبرك عند وصول الرد. يمكنك سحب الطلب قبل قبوله.' : 'يمكنك قراءة الملف ثم القبول أو الاعتذار. بعد قبول الطلب، تبدأ المراسلة عند الموافقة على شروط التعارف ومدته.'}</p></div>;
}

function messageDay(createdAt: string) {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? "" : dateLabel.format(date);
}

function messageFor(error: unknown) {
  return error instanceof Error && /[\u0600-\u06ff]/.test(error.message)
    ? error.message
    : "تعذّر تحميل البيانات. حاول مجددًا.";
}
function safeInterest(interest: string) {
  return interests.find((item) => item.id === interest)?.label ?? interest;
}

function Panel({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="cm-panel">
      <span className="cm-panel-icon">{icon}</span>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
function Back({ back, text }: { back: () => void; text: string }) {
  return (
    <header className="cm-detail-head">
      <button onClick={back} className="mi-back">
        <ArrowRight size={19} />
        {text}
      </button>
      <span>
        <LockKeyhole size={14} /> ملف خاص
      </span>
    </header>
  );
}
function Avatar({ name, large = false, avatar }: { name: string; large?: boolean; avatar?: PublicAvatar | null }) {
  const letter = Array.from(name.trim())[0];
  const variant = (letter?.codePointAt(0) ?? 0) % 3;
  return (
    <span
      aria-hidden="true"
      className={"cm-avatar" + (large ? " large" : "") + (avatar ? " cm-avatar-illustrated" : "")}
      data-tone={variant}
    >
      {avatar ? <AvatarPortrait avatar={avatar} decorative /> : <b>{letter}</b>}
    </span>
  );
}
function Banner({ text, alert = false }: { text: string; alert?: boolean }) {
  return (
    <p
      className={"cm-banner" + (alert ? " error" : "")}
      role={alert ? "alert" : "status"}
    >
      {text}
    </p>
  );
}
function FilterSheet({
  source,onSaved,filters,allProfiles,
  apply,
  close,
}: {
  filters: Filters;
  allProfiles: boolean;
  source: CommunitySource; onSaved:()=>void;
  apply: (next: Filters) => void;
  close: () => void;
}) {
  const {premium,upgrade,connectionLimit}=useMembershipAccess();
  const [min, setMin] = useState(filters.minAge?.toString() ?? "");
  const [max, setMax] = useState(filters.maxAge?.toString() ?? "");
  const [interest, setInterest] = useState(filters.interest ?? "");
  const [extra, setExtra] = useState<Filters>(()=>({...filters,city:canonicalCity(filters.city??''),nationality:canonicalNationality(filters.nationality??'')}));
  const [excludedCities,setExcludedCities]=useState(()=>[...new Set((filters.excludeCities??[]).map(canonicalCity))]);
  const [excludedNationalities,setExcludedNationalities]=useState(()=>[...new Set((filters.excludeNationalities??[]).map(canonicalNationality))]);
  function toggleExcluded(key:'excludeTribalBackgrounds'|'excludeSmoking'|'excludeMaritalStatuses',value:string){
    setExtra(current=>({...current,[key]:(current[key]??[]).includes(value)?(current[key]??[]).filter(item=>item!==value):[...(current[key]??[]),value]}));
  }
  const [error, setError] = useState("");
  function clearFilters() {
    setMin("");
    setMax("");
    setInterest("");
    setExtra(emptyFilters);
    setExcludedCities([]);
    setExcludedNationalities([]);
    setError("");
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (min && max && Number(min) > Number(max)) {
      setError("يجب أن يكون الحد الأعلى مساويًا للحد الأدنى أو أكبر منه.");
      return;
    }
    if ([[extra.minHeight,extra.maxHeight],[extra.minWeight,extra.maxWeight]].some(([lower,upper])=>lower!==undefined&&upper!==undefined&&lower>upper)) {
      setError('راجع نطاق الطول والوزن: الحد الأعلى يجب أن يساوي الحد الأدنى أو يزيد عليه.');
      return;
    }
    apply({
      ...extra, minFit:premium?extra.minFit:undefined, offset: undefined, afterId: undefined,
      excludeCities:excludedCities,excludeNationalities:excludedNationalities,
      minAge: min ? Number(min) : undefined,
      maxAge: max ? Number(max) : undefined,
      interest: interest || undefined,
    });
  }
  return (
    <Sheet title="تصفية الملفات" onClose={close} className="dr-filter-sheet">
      <form className="cm-filter dr-filter-form" onSubmit={submit}>
        <div className="dr-filter-body">
          <h3 className="dr-filter-heading"><SlidersHorizontal size={15} aria-hidden="true"/>نطاق البحث</h3>
          <SheetChoiceSelect label="ترتيب النتائج" value={extra.sort ?? ''} placeholder="الترتيب الافتراضي" allowClear searchable={false}
            options={[{value:'compatibility',label:'حسب التوافق'},{value:'youngest',label:'الأصغر سنًا'},{value:'oldest',label:'الأكبر سنًا'}]}
            onChange={value => setExtra(current => ({...current,sort:(value || undefined) as Filters['sort']}))}/>
          <SheetChoiceSelect label="المدينة" value={extra.city ?? ""} options={cityOptions} placeholder="كل المدن" allowClear onChange={city => setExtra(current => ({ ...current, city: city || undefined }))} />
          <fieldset className="dr-filter-age" aria-label="العمر">
            <div className="dr-filter-age-row">
              <span>العمر</span>
              <div className="cm-age-fields">
                <label>
                  من
                  <input type="number" inputMode="numeric" min={18} max={110} placeholder="١٨" value={min} onChange={event => setMin(event.target.value)} />
                </label>
                <label>
                  إلى
                  <input type="number" inputMode="numeric" min={18} max={110} placeholder="١١٠" value={max} onChange={event => setMax(event.target.value)} />
                </label>
              </div>
            </div>
          </fieldset>
          <SheetChoiceSelect label="اهتمام مشترك" value={interest} options={interests.map(item => ({ value: item.id, label: item.label }))} placeholder="كل الاهتمامات" allowClear onChange={setInterest} />
          <h3 className="dr-filter-heading"><Search size={15} aria-hidden="true"/>ظهور الملفات</h3>
          {allProfiles && <label className="dr-filter-availability">
            <span>المؤهلون للتعارف فقط</span>
            <input type="checkbox" role="switch" checked={!!extra.eligibleOnly} onChange={event => setExtra(current => ({ ...current, eligibleOnly: event.target.checked }))} />
            <span className="dr-filter-switch" aria-hidden="true" />
          </label>}
          <label className="dr-filter-availability">
            <span>متاح للتعارف</span>
            <input type="checkbox" role="switch" checked={!!extra.availableOnly} onChange={event => setExtra(current => ({ ...current, availableOnly: event.target.checked }))} />
            <span className="dr-filter-switch" aria-hidden="true" />
          </label>
          <h3 className="dr-filter-heading"><SlidersHorizontal size={15} aria-hidden="true"/>تفضيلات أدق</h3>
          <details className="dr-filter-section dr-filter-group">
            <summary><span>خيارات إضافية</span><ChevronLeft size={17} aria-hidden="true" /></summary>
            <div className="dr-filter-fields">
        <details className="dr-filter-section" open={!!extra.language}><summary><span>اللغات</span><ChevronLeft size={15}/></summary><div className="dr-filter-fields">
          <ChoiceSelect label="يتحدث اللغة" value={extra.language ?? ''} options={languageOptions.map(value => ({value,label:value}))} placeholder="جميع اللغات" allowClear onChange={language => setExtra(current => ({...current,language:language || undefined}))}/>
        </div></details>
        <details className="dr-filter-section" open={!!(extra.education||extra.profession||extra.children)}><summary><span>الدراسة والعمل والعائلة</span><ChevronLeft size={15}/></summary><div className="dr-filter-fields">
          <ChoiceSelect label="المؤهل التعليمي" value={extra.education??''} options={educationOptions} placeholder="كل المؤهلات" allowClear onChange={education=>setExtra(current=>({...current,education:education||undefined}))}/>
          <ChoiceSelect label="مجال العمل أو الوضع المهني" value={extra.profession??''} options={professionOptions} placeholder="كل المجالات" allowClear onChange={profession=>setExtra(current=>({...current,profession:profession||undefined}))}/>
          <label>الأبناء<select value={extra.children??''} onChange={event=>setExtra(current=>({...current,children:event.target.value as Filters['children']||undefined}))}><option value="">بدون تحديد</option><option value="none">ليس لديه / لديها أبناء</option><option value="has">لديه / لديها أبناء</option></select></label>
        </div></details>
        <details className="dr-filter-section" open={[extra.minHeight,extra.maxHeight,extra.minWeight,extra.maxWeight].some(value=>value!==undefined)}><summary><span>الطول والوزن</span><ChevronLeft size={15}/></summary><div className="dr-filter-fields">
          {([{label:'الطول',minKey:'minHeight',maxKey:'maxHeight',options:filterHeightOptions},{label:'الوزن',minKey:'minWeight',maxKey:'maxWeight',options:filterWeightOptions}] as const).map(({label,minKey,maxKey,options})=><div className="cm-age-fields" key={label}>
            <ChoiceSelect label={label+' من'} value={extra[minKey]?.toString()??''} options={options.filter(option=>extra[maxKey]===undefined||Number(option.value)<=extra[maxKey]!)} placeholder="دون حد أدنى" allowClear onChange={value=>setExtra(current=>({...current,[minKey]:value?Number(value):undefined}))}/>
            <ChoiceSelect label={label+' إلى'} value={extra[maxKey]?.toString()??''} options={options.filter(option=>extra[minKey]===undefined||Number(option.value)>=extra[minKey]!)} placeholder="دون حد أعلى" allowClear onChange={value=>setExtra(current=>({...current,[maxKey]:value?Number(value):undefined}))}/>
          </div>)}
        </div></details>
        <div className="cm-age-fields"><label>الحالة الاجتماعية<select value={extra.maritalStatus??''} onChange={e=>setExtra({...extra,maritalStatus:e.target.value})}><option value="">الكل</option><option value="never_married">لم يسبق الزواج</option><option value="divorced">مطلق / مطلقة</option><option value="widowed">أرمل / أرملة</option><option value="married">متزوج</option></select></label>
        <label>التدخين<select value={extra.smoking??''} onChange={e=>setExtra({...extra,smoking:e.target.value})}><option value="">الكل</option><option value="never">لا يدخّن</option><option value="cigarettes">سجائر</option><option value="vape">فيب</option><option value="shisha">شيشة</option><option value="sometimes">أحيانًا · غير محدد</option><option value="yes">يدخّن · غير محدد</option></select></label></div>
        <label>غطاء الرأس<select value={extra.dressStyle??''} onChange={e=>setExtra({...extra,dressStyle:e.target.value})}><option value="">بدون تحديد</option>{dressStyles.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
        <label>الموقف من عمل الزوجة<select value={extra.work??''} onChange={e=>setExtra({...extra,work:e.target.value})}><option value="">بدون تحديد</option><option value="A">تفضيل العمل</option><option value="B">تفضيل عدم العمل</option><option value="C">المرونة حسب الاتفاق</option></select></label>
        {premium?<label>توافق التفضيلات<select value={extra.minFit??0} onChange={e=>setExtra({...extra,minFit:Number(e.target.value)})}><option value={0}>كل مستويات التوافق</option><option value={60}>٦٠ نقطة فأعلى</option><option value={75}>٧٥ نقطة فأعلى</option><option value={90}>٩٠ نقطة فأعلى</option></select><small>تظهر الدرجة من ١٠٠ عند اكتمال التقييمين.</small></label>:<button type="button" className="btn-text" onClick={()=>upgrade("premium")}><LockKeyhole size={14}/>التصفية بدرجة التوافق مع العضوية المميزة</button>}
        <label className="dr-availability"><input type="checkbox" checked={!!extra.onlineOnly} onChange={e=>setExtra({...extra,onlineOnly:e.target.checked})}/> نشط الآن فقط</label>
        <details className="dr-filter-section" open={!!(extra.nationality||extra.tribalBackground)}><summary><span>الجنسية والخلفية القبلية</span><ChevronLeft size={15}/></summary><div className="dr-filter-fields">
          <ChoiceSelect label="الجنسية المطلوبة" value={extra.nationality??''} options={nationalityChoices} placeholder="كل الجنسيات" allowClear onChange={nationality=>setExtra(current=>({...current,nationality:nationality||undefined}))}/>
          <label>الخلفية القبلية<select value={extra.tribalBackground??''} onChange={event=>setExtra({...extra,tribalBackground:event.target.value})}><option value="">الجميع</option><option value="tribal">قبلي</option><option value="non_tribal">غير قبلي</option><option value="prefer_not_to_say">لم يذكر الخلفية</option></select></label>
        </div></details>
            </div>
          </details>
        <details className="dr-filter-section dr-filter-group dr-filter-exclusions"><summary><span>ما لا أرغب برؤيته</span><ChevronLeft size={17} aria-hidden="true" /></summary><div className="dr-filter-fields">
          <div className="dr-exclusion-picker">
            <ChoiceSelect label="إخفاء مدن" value="" options={cityOptions.filter(option=>!excludedCities.includes(option.value))} placeholder="أضف مدينة للاستبعاد" disabled={excludedCities.length>=20} onChange={city=>{if(city)setExcludedCities(current=>current.includes(city)?current:[...current,city].slice(0,20));}}/>
            <div className="dr-selected-filters" aria-label="المدن المستبعدة">{excludedCities.map(city=><button type="button" key={city} onClick={()=>setExcludedCities(current=>current.filter(value=>value!==city))} aria-label={`إزالة استبعاد ${city}`}><span>{city}</span><X size={13} aria-hidden="true"/></button>)}</div>
            {excludedCities.length>=20&&<small>يمكنك استبعاد ٢٠ مدينة. أزل اختيارًا لإضافة مدينة أخرى.</small>}
          </div>
          <div className="dr-exclusion-picker">
            <ChoiceSelect label="إخفاء جنسيات" value="" options={nationalityChoices.filter(option=>!excludedNationalities.includes(option.value))} placeholder="أضف جنسية للاستبعاد" disabled={excludedNationalities.length>=20} onChange={nationality=>{if(nationality)setExcludedNationalities(current=>current.includes(nationality)?current:[...current,nationality].slice(0,20));}}/>
            <div className="dr-selected-filters" aria-label="الجنسيات المستبعدة">{excludedNationalities.map(nationality=><button type="button" key={nationality} onClick={()=>setExcludedNationalities(current=>current.filter(value=>value!==nationality))} aria-label={`إزالة استبعاد ${nationality}`}><span>{nationalityChoices.find(option=>option.value===nationality)?.label??nationality}</span><X size={13} aria-hidden="true"/></button>)}</div>
            {excludedNationalities.length>=20&&<small>يمكنك استبعاد ٢٠ جنسية. أزل اختيارًا لإضافة جنسية أخرى.</small>}
          </div>
          <fieldset><legend>إخفاء حسب الخلفية القبلية</legend><div className="dr-exclusion-options">{[['tribal','قبلي'],['non_tribal','غير قبلي']].map(([value,label])=><label key={value}><input type="checkbox" checked={!!extra.excludeTribalBackgrounds?.includes(value)} onChange={()=>toggleExcluded('excludeTribalBackgrounds',value)}/>{label}</label>)}</div></fieldset>
          <fieldset><legend>إخفاء حسب التدخين</legend><div className="dr-exclusion-options">{[['never','لا يدخّن'],['cigarettes','سجائر'],['vape','فيب'],['shisha','شيشة'],['sometimes','أحيانًا · غير محدد'],['yes','يدخّن · غير محدد']].map(([value,label])=><label key={value}><input type="checkbox" checked={!!extra.excludeSmoking?.includes(value)} onChange={()=>toggleExcluded('excludeSmoking',value)}/>{label}</label>)}</div></fieldset>
          <fieldset><legend>إخفاء حسب الحالة الاجتماعية</legend><div className="dr-exclusion-options">{[['never_married','لم يسبق الزواج'],['divorced','مطلق / مطلقة'],['widowed','أرمل / أرملة'],['married','متزوج']].map(([value,label])=><label key={value}><input type="checkbox" checked={!!extra.excludeMaritalStatuses?.includes(value)} onChange={()=>toggleExcluded('excludeMaritalStatuses',value)}/>{label}</label>)}</div></fieldset>
        </div></details>
        <RelocationCities source={source} onSaved={onSaved}/>
        </div>
        <div className="dr-filter-footer">
          {error && <Banner alert text={error} />}
          <div className="dr-filter-actions">
            <button className="btn-primary" type="submit">عرض النتائج</button>
            <button className="btn-text" type="button" onClick={clearFilters}>مسح الكل</button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}

function WeeklyContours() {
  return <svg className="cm-weekly-contours" viewBox="0 0 160 75" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path d="M-4 27 Q30 11 66 38 T166 19 M-4 38 Q32 20 66 45 T166 29" />
    <path opacity=".52" d="M-5 62 Q35 37 76 53 T165 43" />
  </svg>;
}

function DiscoveryPortrait({ person, source, priority = false, heading = false }: { person: PublicPerson; source: CommunitySource; priority?: boolean; heading?: boolean }) {
  const [failedPhotoSrc, setFailedPhotoSrc] = useState<string | null>(null);
  const avatar = person.publicAvatar;
  const candidatePhoto = !avatar && person.demoPhoto?.startsWith("/demo/portraits/") ? person.demoPhoto : undefined;
  const photo = candidatePhoto && candidatePhoto !== failedPhotoSrc ? candidatePhoto : undefined;
  const protectedDiscovery = nativePrivatePhoto();
  const timeline = person.marriageBasics?.marriageTimeline;
  return <>
    <div className="df-portrait-media">
    {person.portrait ? <PortraitPhoto portrait={person.portrait} source={source} className="df-portrait-image" captionClassName={person.isDemo||protectedDiscovery?undefined:'df-photo-label df-live-caption'} alt={`الصورة الشخصية لـ ${person.alias}`} discovery={protectedDiscovery ? {name:person.alias} : undefined} /> : avatar ? <AvatarPortrait avatar={avatar} className="df-selected-avatar" discovery={protectedDiscovery ? {name:person.alias} : undefined} /> : photo && protectedDiscovery ? <DiscoveryPhoto src={photo} name={person.alias}/> : photo ? <img className="df-portrait-image" src={photo} width="1122" height="1402"
      loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async"
      alt="" onError={() => setFailedPhotoSrc(photo)} /> :
      <div className="df-portrait-placeholder" aria-hidden="true"><WeeklyContours /><Avatar name={person.alias} large /></div>}
    </div>
    <div className="df-portrait-identity">
      <div className="df-member-heading">
        <div className="df-identity-line">{heading ? <h1>{person.alias}</h1> : <h2>{person.alias}</h2>}{Number.isInteger(person.age)&&person.age>=18&&person.age<=110&&<span className="df-member-age">{ar.format(person.age)} عامًا</span>}{person.exclusive && <ExclusiveBadge/>}</div>
        <MemberBadge tier={person.membershipTier} active={person.premium} labeled/>
      </div>
      <div className="df-identity-meta">{person.city && <span><MapPin size={13} />{person.city}</span>}
        {person.occupation && <span><BriefcaseBusiness size={13} />{person.occupation}</span>}
        {timeline && marriageTimelineLabels[timeline] && <span><Clock3 size={13} />الزواج {marriageTimelineLabels[timeline]}</span>}</div>
      {(!person.portrait||person.isDemo)&&!(person.isDemo&&(source.simulation||source.demoInteractions||source.familyTestMode))&&<small className="df-portrait-source">{person.isDemo ? photo ? 'شخصية توضيحية · صورة مولّدة' : 'حساب توضيحي' : avatar ? "صورة رمزية" : photo ? "شخصية توضيحية · صورة مولّدة" : <><LockKeyhole size={11} /> الصور تُشارك بخصوصية</>}</small>}
    </div>
  </>;
}

function PersonCard({
  person,
  source,
  open,
  explain,
  priority = false,
  compact = false,
  index = 0,
}: {
  compact?: boolean; index?: number;
  person: PublicPerson;
  source: CommunitySource;
  open: (button: HTMLButtonElement) => void;
  explain: () => void;
  priority?: boolean;
}) {
  const {premium,upgrade}=useMembershipAccess();
  const {personalLine, context} = decisionContext(person,premium);
  const descriptionId = useId();
  const canReadFit = premium && !person.compatibilityLocked && Boolean(person.fit);
  const score = canReadFit ? preferencePercentage(person.fit) : null;
  return <div className={"df-recommendation cm-person df-person"+(compact?" dr-compact":"")}
    data-membership={person.membershipTier} style={{animationDelay: `${Math.min(index,7)*45}ms`}}>
    <MotionPressButton className="df-profile-hitbox" type="button" onClick={event => open(event.currentTarget)}
      data-weekly-person={person.id} aria-label={`عرض ملف ${person.alias}`} aria-describedby={descriptionId}/>
    <div className="cm-person-top cm-weekly-identity df-card-portrait">
      <DiscoveryPortrait person={person} source={source} priority={priority} />
    </div>
    <div className="df-card-copy" id={descriptionId}>
      {compact && <span className="dr-card-state" data-full={person.atCapacity||undefined}><i/>{person.connectionStatus === "accepted" ? "تعارف متبادل" : person.connectionStatus === "pending" ? "طلب قيد الانتظار" : person.atCapacity ? "مكتمل التعارف حاليًا" : "متاح للتعارف"}</span>}
      {personalLine && <p className="cm-person-bio" dir="auto">{personalLine}</p>}
      {person.interests.length>0&&<p className="df-card-interests">{person.interests.slice(0, 2).map(safeInterest).join(" · ")}</p>}
      {context && !canReadFit && <p className="df-card-reason">{context}</p>}
      {canReadFit ? <div className="df-card-fit-summary">
        <button type="button" className="df-read-fit" onClick={explain}
          aria-label={`توافق التفضيلات مع ${person.alias}، ${score === null ? 'غير مكتمل' : ar.format(score) + '٪'}. عرض الشرح`}>
          {score === null ? <span>التفضيلات قيد الاكتمال</span> : <ScoreTile percentage={score} variant="logo" pauseOffscreen/>}
        </button>
        {context && <p className="df-card-reason">{context}</p>}
      </div> : !premium && <div className="df-card-fit-summary">
        <button type="button" className="df-read-fit wd-weekly-upgrade" onClick={()=>upgrade('premium')}
          aria-label={person.recommendationPercentage == null ? 'عرض العضوية لفتح نسبة التوافق' : ar.format(person.recommendationPercentage)+'٪، عرض العضوية لقراءة تفاصيل التوافق'}>
          {person.recommendationPercentage != null ? <ScoreTile percentage={person.recommendationPercentage} variant="logo" pauseOffscreen/> : <LockKeyhole size={16} aria-hidden="true"/>}
          <span>{person.recommendationPercentage != null ? 'فتح تفاصيل التوافق' : 'فتح نسبة التوافق'}</span><ChevronLeft size={14} aria-hidden="true"/>
        </button>
      </div>}
      <span className="df-open-profile">الملف الكامل <ArrowLeft size={15} /></span>
    </div>
  </div>;
}

function MembershipRowSpark() {
  const gradientId=useId();
  const ref=useRef<HTMLSpanElement>(null);
  const [visible,setVisible]=useState(false);
  useEffect(()=>{
    if(!ref.current||typeof IntersectionObserver==='undefined') return;
    const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{threshold:.15});
    observer.observe(ref.current);
    return ()=>observer.disconnect();
  },[]);
  return <span ref={ref} className="wd-row-orbit" aria-hidden="true">
    <svg width="100%" height="100%" focusable="false">
      <defs><linearGradient id={`${gradientId}-rim`} x1="0%" y1="0%" x2="100%" y2="100%"><stop stopColor="#ae7786" stopOpacity=".08"/><stop offset=".45" stopColor="#ddbba0" stopOpacity=".35"/><stop offset=".75" stopColor="#ae7786" stopOpacity=".24"/><stop offset="1" stopColor="#ddbba0" stopOpacity=".12"/></linearGradient><linearGradient id={gradientId} x1="-100%" x2="0%" y1="0%" y2="0%">
        <stop offset="0" stopColor="#ae7786" stopOpacity="0"/>
        <stop offset=".2" stopColor="#ae7786" stopOpacity=".08"/>
        <stop offset=".36" stopColor="#b98392" stopOpacity=".45"/>
        <stop offset=".48" stopColor="#92516b" stopOpacity=".85"/>
        <stop offset=".56" stopColor="#e0bfa6" stopOpacity=".95"/>
        <stop offset=".7" stopColor="#b98392" stopOpacity=".35"/>
        <stop offset=".85" stopColor="#ae7786" stopOpacity=".06"/>
        <stop offset="1" stopColor="#ae7786" stopOpacity="0"/>
        {visible&&<><animate attributeName="x1" values="-100%;-100%;100%;100%" keyTimes="0;.25;.8;1" dur="7s" repeatCount="indefinite"/><animate attributeName="x2" values="0%;0%;200%;200%" keyTimes="0;.25;.8;1" dur="7s" repeatCount="indefinite"/></>}
      </linearGradient></defs>
      <rect className="wd-row-frame" x=".5" y=".5" rx="11.5" stroke={`url(#${gradientId}-rim)`}/>
      <rect className="wd-row-sheen" x=".5" y=".5" rx="11.5" stroke={`url(#${gradientId})`}/>
    </svg>
  </span>;
}

function DirectoryRow({person,source,open,explain,request,interest,busy}:{person:PublicPerson;source:CommunitySource;open:(button:HTMLButtonElement)=>void;explain:()=>void;request:()=>void;interest:()=>void;busy:boolean}) {
  const {premium,upgrade}=useMembershipAccess();
  const score = premium && !person.compatibilityLocked ? preferencePercentage(person.fit) : null;
  const coverage = partialPreferenceCoverage(person.fit);
  const sampleOnly=person.isDemo&&!source.simulation&&!source.demoInteractions;
  const ineligible=person.eligible===false;
  const timeline=person.marriageBasics?.marriageTimeline;
  const status=person.online===true?'نشط الآن':person.online===false?'غير نشط الآن':'حالة الاتصال غير متاحة';
  return <article className="dr-person-row" data-membership={person.membershipTier} aria-label={`ملف ${person.alias}`}>
    {person.membershipTier==='seriousness'&&<MembershipRowSpark/>}
    <div className="dr-row-overview">
      <div className="dr-row-profile-group">
        <button type="button" className="dr-row-profile" data-weekly-person={person.id} onClick={event=>open(event.currentTarget)} aria-label={`عرض ملف ${person.alias} · ${status}`} />
        <span className="cm-weekly-identity dr-row-avatar" data-online={person.online===true||undefined}>
          <PersonAvatar person={person} source={source} className="dr-row-image" protectedDiscovery={nativePrivatePhoto()} showMembership={false}/>
          {person.online===true&&<span className="dr-avatar-online" role="img" aria-label="نشط الآن" title="نشط الآن"><i className="dr-online-dot"/></span>}
          <MemberBadge tier={person.membershipTier} active={person.premium}/>
        </span>
        <span className="dr-row-identity">
          <span className="dr-row-name">
            <strong>{person.alias}</strong>
            {Number.isInteger(person.age)&&person.age>=18&&person.age<=110&&<span>{ar.format(person.age)}</span>}
            {!sampleOnly && !ineligible && source.setInterest && (
              <button type="button" className="dr-row-interest" aria-pressed={Boolean(person.interested)}
                aria-label={person.interested ? `إلغاء الاهتمام بـ ${person.alias}` : `إبداء الاهتمام بـ ${person.alias}`}
                title="يصل إشعار باهتمامك إلى الطرف الآخر" disabled={busy} onClick={interest}>
                <Heart size={14} aria-hidden="true" fill={person.interested ? 'currentColor' : 'none'}/>
                <span>{person.interested ? 'مهتم' : 'اهتمام'}</span>
              </button>
            )}
          </span>
          <span className="dr-row-context">{person.online===true&&<span className="dr-online-label">نشط الآن</span>}<span className="dr-row-meta">{person.city}</span>{timeline&&marriageTimelineLabels[timeline]&&<span className="dr-row-timeline" title={`الزواج ${marriageTimelineLabels[timeline]}`}><Clock3 size={11} aria-hidden="true"/><span>{timeline==='when_ready'?'عند التوافق':marriageTimelineLabels[timeline]}</span></span>}</span>
        </span>
      </div>
      {premium ? !person.compatibilityLocked && <button type="button" className="dr-fit-visual" onClick={explain} disabled={!person.fit}
        aria-label={`التوافق مع ${person.alias}، ${score === null ? (coverage ? coverage + ' مواضيع قابلة للمقارنة' : 'بيانات المقارنة غير مكتملة') : ar.format(score) + '٪'}. عرض الشرح`}>
        {score === null ? <span className="dr-fit-pending">{coverage ?? '—'}<small>{coverage ? 'مواضيع للمقارنة' : 'بيانات غير مكتملة'}</small></span> : <ScoreTile percentage={score} variant="logo" label="التوافق" pauseOffscreen/>}
      </button> : <button type="button" className="dr-fit-visual wd-fit-locked" onClick={()=>upgrade("premium")} aria-label="اشترك لعرض نسبة التوافق"><LockKeyhole size={16}/><span>فتح النسبة</span></button>}
    </div>

    <div className="dr-row-detail">
      {person.bio && <button type="button" className="dr-bio-peek" onClick={event=>open(event.currentTarget)}
        aria-label={`عرض النبذة الكاملة لـ ${person.alias}`}>{person.bio}</button>}
    {sampleOnly?<button className="dr-sample-preview" onClick={event=>open(event.currentTarget)} aria-label={`استعراض الملف الخيالي لـ ${person.alias}`}>استعراض فقط <ChevronLeft size={14}/></button>:ineligible&&!person.connectionId?<button className="dr-sample-preview" onClick={event=>open(event.currentTarget)}>غير مؤهل للتعارف <ChevronLeft size={14}/></button>:<div className="dr-row-actions">
      <button type="button" className="dr-row-request" data-add={!person.connectionId||undefined} data-connected={person.connectionStatus==='accepted'||undefined} data-pending={person.connectionStatus==='pending'||undefined} onClick={request} disabled={busy||(!person.connectionId&&(person.atCapacity||person.viewerAtCapacity))} aria-label={person.connectionId?person.connectionStatus==='accepted'?`فتح المحادثة مع ${person.alias}`:`عرض طلب التعارف مع ${person.alias}` : premium ? `إضافة ${person.alias}، إرسال طلب تعارف` : `ترقية العضوية لطلب التعارف مع ${person.alias}`} title={!person.connectionId&&(person.atCapacity||person.viewerAtCapacity)?'اكتمل عدد الارتباطات المتاح لأحد الطرفين':person.connectionId?person.connectionStatus==='accepted'?memberAr.openChat:'عرض الطلب':memberAr.request}>
        {person.connectionId ? person.connectionStatus === 'accepted' ? <MessageCircle size={20} aria-hidden="true"/> : <Clock3 size={20} aria-hidden="true"/> : <>
          <AddPersonMark compact/>
          <span>{premium?"إضافة":"ترقية العضوية"}</span>
        </>}
      </button>
    </div>}
    </div>
  </article>;
}

type RequestEntry = { id: string; featured: boolean };

function readDiscoveryPages(source: CommunitySource, filters: Filters, pageCount: number) {
  return source.discoverPages?.(filters, pageCount) ?? Promise.all(
    Array.from({ length: pageCount }, (_, page) => source.discover({ ...filters, offset: page * 24 })),
  );
}

function shuffleDirectory(people: PublicPerson[]) {
  return shuffleWithVisibility(people);
}

function updateDirectoryOrder(current: PublicPerson[], people: PublicPerson[], reshuffle: boolean) {
  if (reshuffle) {
    const shuffled = shuffleDirectory(people);
    if (shuffled.length > 1 && shuffled.length === current.length && shuffled.every((person, index) => person.id === current[index].id)) {
      shuffled.push(shuffled.shift()!);
    }
    return shuffled;
  }
  const latest = new Map(people.map(person => [person.id, person]));
  const retained = current.flatMap(person => {
    const updated = latest.get(person.id);
    latest.delete(person.id);
    return updated ? [updated] : [];
  });
  return [...retained, ...shuffleDirectory([...latest.values()])];
}

function DirectoryPullContent({ directory, refreshing, distanceRef, children }: {
  directory: boolean;
  refreshing: boolean;
  distanceRef: RefObject<((distance: number) => void) | null>;
  children: ReactNode;
}) {
  // Only this wrapper updates during a drag. The profile rows keep their element identity.
  const [distance, setDistance] = useState(0);
  useImperativeHandle(distanceRef, () => setDistance, []);
  return <div className="dr-pull-content" data-dragging={distance > 0 && !refreshing || undefined} style={{paddingTop:directory ? distance : 0}}>
    {directory && <div className="dr-pull-indicator" role="status" aria-live="polite" data-refreshing={refreshing || undefined} style={{height:distance,opacity:Math.min(1,distance/24)}}>
      <RotateCcw size={18} aria-hidden="true" style={!refreshing ? {transform:`rotate(${distance*3}deg)`} : undefined}/>
      <span>{refreshing?'جارٍ تحديث الملفات…':distance>=52?'أفلت للتحديث':distance>0?'اسحب للتحديث':''}</span>
    </div>}
    {children}
  </div>;
}

function Discovery({
  source,
  onInbox,
  onConversation,
  onAccount,
  profileSaved = false,
}: {
  source: CommunitySource;
  onAccount: () => void;
  profileSaved?: boolean;
  onBeena?: () => void;
  beenaAnswered?: number;
  onInbox: (entry: RequestEntry) => void;
  onConversation: (id: string) => void;
}) {
  const {premium,upgrade,connectionLimit}=useMembershipAccess();
  const [remembered] = useState(() => readBrowseMemory(source));
  const restoreBrowse = useRef<typeof remembered | null>(remembered.scroll > 0 ? remembered : null);
  const [filters, setFilters] = useState<Filters>(()=>({...remembered.filters,minFit:premium?remembered.filters.minFit:undefined}));
  useEffect(()=>{if(!premium)setFilters(current=>current.minFit?{...current,minFit:undefined}:current);},[premium]);
  const [order, setOrder] = useState<"recommended" | "all">(remembered.order);
  const [preferenceRevision,setPreferenceRevision]=useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState(remembered.query);
  const [searchOpen, setSearchOpen] = useState(Boolean(remembered.query.trim()));
  const searchId = useId();
  const searchToggle = useRef<HTMLButtonElement>(null);
  const [availability, setAvailability] = useState<NextStepState>({loaded:false,acceptedCount:0,exclusive:false,pendingIncomingCount:0});
  const [recoverable, setRecoverable] = useState(false);
  const [hiddenNotice, setHiddenNotice] = useState('');
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters(current =>
      (current.search ?? '') === query ? current : {...current, search: query}
    ), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const [list, setList] = useState<PublicPerson[]>([]);
  const listRef=useRef(list);listRef.current=list;
  const [showReceipt, setShowReceipt] = useState(profileSaved);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<PublicPerson | null>(null);
  const expandedLunaPerson = useRef<string | null>(null);
  const [fitPerson, setFitPerson] = useState<PublicPerson | null>(null);
  const openPeople = useRef<PublicPerson[]>([]);
  openPeople.current = [selectedPerson, fitPerson].filter((value): value is PublicPerson => value !== null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sent, setSent] = useState<RequestEntry | null>(null);
  const [rowBusy, setRowBusy] = useState<string|null>(null);
  const [reportTarget, setReportTarget] = useState<PublicPerson|null>(null);
  const [reportSent, setReportSent] = useState<'local'|'sent'|null>(null);
  const [rowError,setRowError]=useState("");
  const [interestNotice,setInterestNotice]=useState("");
  const identity = useRef<HTMLElement>(null);
  const listPosition = useRef<{ id: string; top: number; scroll: number; featured: boolean } | null>(null);
  const move = useWeeklyCardTransition();
  const sequence = useRef(0);
  const needsRefresh = useRef(false);
  const actionPending = useRef(false);
  const pullStart = useRef<{ x: number; y: number } | null>(null);
  const directorySurface = useRef<HTMLElement>(null);
  const pullAmount = useRef(0);
  const suppressPullClick = useRef(false);
  const updatePullDistance = useRef<((distance: number) => void) | null>(null);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const refresh = useCallback(
    async (reshuffle = true, pageCount?: number) => {
      const seq = ++sequence.current;
      setLoading(true);
      setError("");
      try {
        const pages = order === 'all' ? pageCount ?? Math.max(1, Math.ceil(listRef.current.length / 24)) : 1;
        const results = await readDiscoveryPages(source, { ...filters, mode: order }, pages);
        const people = [...new Map(results.flat().map(person=>[person.id,person])).values()];
        if (seq !== sequence.current) return;
        setList(current => order === 'all' && !filters.sort ? updateDirectoryOrder(current, people, reshuffle) : people);
        setMore(order === "all" && results.at(-1)?.length === 24); setRecoverable(false);
        setSelected(id => id && people.some(p => p.id === id) ? id : null);
      } catch (e) {
        if (seq === sequence.current) {
          if (denied(e)) {setList([]);setSelected(null);setSelectedPerson(null);setFitPerson(null);}
          setRecoverable(canRetryRead(e));
          setError(messageFor(e));
        }
      } finally {
        if (seq === sequence.current) setLoading(false);
      }
    },
    // The server projects different score fields for free and paid viewers.
    [source, filters, order, premium],
  );
  useReadRecovery(recoverable, () => refresh(false), source);
  useEffect(() => {
    const surface = directorySurface.current;
    if (!surface || order !== 'all') return;
    let frame = 0;
    function move(event: globalThis.TouchEvent) {
      const start = pullStart.current;
      if (!start) return;
      const touch = event.touches[0];
      const down = touch ? touch.clientY - start.y : 0;
      if (event.touches.length !== 1 || window.scrollY > 2 || down < 0 || Math.abs(touch.clientX - start.x) > Math.max(12, down)) {
        pullStart.current = null; pullAmount.current = 0; updatePullDistance.current?.(0); return;
      }
      if (down < 6) return;
      if (event.cancelable) event.preventDefault();
      suppressPullClick.current = true;
      pullAmount.current = Math.min(88, down * .48);
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        if (pullStart.current) updatePullDistance.current?.(pullAmount.current);
      });
    }
    surface.addEventListener('touchmove', move, {passive:false});
    return () => {
      surface.removeEventListener('touchmove', move);
      cancelAnimationFrame(frame);
      pullStart.current = null; pullAmount.current = 0; updatePullDistance.current?.(0);
    };
  }, [order, selected]);
  useLayoutEffect(() => {
    const saved = restoreBrowse.current;
    if (!saved || loading || error || selected) return;
    const frame = requestAnimationFrame(() => {
      const target = saved.anchor && document.querySelector<HTMLElement>(`[data-weekly-person="${CSS.escape(saved.anchor.id)}"]`);
      window.scrollTo(0, target && saved.anchor ? window.scrollY + target.getBoundingClientRect().top - saved.anchor.top : saved.scroll);
      restoreBrowse.current = null;
      saveBrowseMemory(source,{...saved,scroll:window.scrollY});
    });
    return () => cancelAnimationFrame(frame);
  }, [loading, error, selected]);
  useEffect(() => {
    if (selected || loading || fitPerson || filterOpen || reportTarget) return;
    let leaving = false;
    let settleTimer: number | undefined;
    const position = () => ({filters, order, query, scroll:window.scrollY, pages:Math.max(1, Math.ceil(listRef.current.length / 24))});
    const remember = () => {
      if (restoreBrowse.current || leaving) return;
      const cards = [...document.querySelectorAll<HTMLElement>('[data-weekly-person]')];
      const first = cards.find(card => card.getBoundingClientRect().bottom > 100);
      saveBrowseMemory(source,{...position(),
        anchor:first?.dataset.weeklyPerson?{id:first.dataset.weeklyPerson,top:first.getBoundingClientRect().top}:undefined});
    };
    const onScroll = () => {
      if (restoreBrowse.current || leaving) return;
      saveBrowseMemory(source, position());
      clearTimeout(settleTimer);
      settleTimer = window.setTimeout(remember, 120);
    };
    const leave = () => { remember(); leaving = true; };
    remember(); window.addEventListener('scroll',onScroll,{passive:true});
    window.addEventListener('nisfayn:before-navigation',leave);
    return () => {
      clearTimeout(settleTimer);
      window.removeEventListener('scroll',onScroll);
      window.removeEventListener('nisfayn:before-navigation',leave);
    };
  }, [source,filters,order,query,selected,loading,fitPerson,filterOpen,reportTarget,list.length]);
  useEffect(() => {
    setList([]);
    setSelected(null);
    setSelectedPerson(null);
    setFitPerson(null);
    void refresh(true, restoreBrowse.current?.pages ?? 1);
    return () => { sequence.current++; };
  }, [refresh]);
  useEffect(()=>{
    let active=true,fetching=false,dirty=false;
    async function updatePresence(){
      if(document.hidden||actionPending.current||loading||loadingMore)return;
      if(fetching){dirty=true;return;}
      fetching=true;
      try { do { dirty=false;needsRefresh.current=false;const seq=sequence.current;
       try{
        if(selected){
          needsRefresh.current=true; // Reconcile the directory when the member returns.
          const scope=expandedLunaPerson.current===selected?{mode:'all' as const,eligibleOnly:true}:{mode:order};
          const rows=await source.discover({...filters,...scope,subjectId:selected,offset:0});
          if(!active||seq!==sequence.current||actionPending.current)return;
          const person=rows.find(row=>row.id===selected);
          setSelectedPerson(person??null);
          if(!person){
            setList(current=>current.filter(row=>row.id!==selected));
            setSelected(null);
          }
          continue;
        }
        const pageCount=order==='all'?Math.max(1,Math.ceil(listRef.current.length/24)):1;
        const pages = await readDiscoveryPages(source, { ...filters, mode: order }, pageCount);
        if(!active||seq!==sequence.current||actionPending.current)return;
        const latest=new Map(pages.flat().map(person=>[person.id,person]));
        const details=new Map<string,PublicPerson|null>();
        // An open profile can move out of the first five while remaining eligible.
        // Re-query the authorized directory rather than freezing its old score.
        await Promise.all([...new Map(openPeople.current.map(person=>[person.id,person])).values()].map(async person=>{
          if(latest.has(person.id)){details.set(person.id,latest.get(person.id)!);return;}
          const lookupScope=expandedLunaPerson.current===person.id?{mode:'all' as const,eligibleOnly:true}:{mode:order};
          const eligible=await source.discover({...filters,...lookupScope,subjectId:person.id,offset:0});
          details.set(person.id,eligible.find(candidate=>candidate.id===person.id)??null);
        }));
        if(!active||seq!==sequence.current||actionPending.current)return;
        // Reapply active filters as availability changes, including an initially empty online view.
        setList(current => order === 'all' && !filters.sort ? updateDirectoryOrder(current, [...latest.values()], false) : [...latest.values()]);
        setError('');setRecoverable(false);
        setMore(order==='all'&&pages.at(-1)?.length===24);
        const fresh=(person:PublicPerson|null)=>person?(latest.get(person.id)??(details.has(person.id)?details.get(person.id)!:person)):null;
        setSelectedPerson(fresh);setFitPerson(fresh);
        setSelected(id=>id&&details.has(id)&&!details.get(id)?null:id);
       }catch(error){
        if(active&&seq===sequence.current&&denied(error)){setList([]);setSelected(null);setSelectedPerson(null);setFitPerson(null);}
        // A transient failure keeps the current view usable until the next update.
       }
      } while(active&&dirty&&!document.hidden);
      } finally {fetching=false;}
    }
    const unwatch=source.watch(()=>{needsRefresh.current=true;void updatePresence();});
    const timer=window.setInterval(()=>void updatePresence(),60000);
    const resumeDiscovery = () => {
      if (document.hidden) return;
      if (!selected && order === 'all' && !filters.sort) setList(current => updateDirectoryOrder(current, current, true));
      void updatePresence();
    };
    document.addEventListener('visibilitychange',resumeDiscovery);
    window.addEventListener('online',updatePresence);
    if(needsRefresh.current && !selected)void updatePresence();
    return()=>{active=false;unwatch();clearInterval(timer);document.removeEventListener('visibilitychange',resumeDiscovery);window.removeEventListener('online',updatePresence);};
  },[source,filters,order,loading,loadingMore,selected]);
  async function loadMore() {
    if(loadingMore)return;setLoadingMore(true);const seq=sequence.current;
    try{
      const next=await source.discover({...filters,mode:order,offset:list.length});
      if(seq===sequence.current){
        setList(current=>{
          const ids = new Set(current.map(person => person.id));
          const additions = next.filter(person => !ids.has(person.id));
          return [...current, ...(order === 'all' && !filters.sort ? shuffleDirectory(additions) : additions)];
        });
        setMore(next.length===24);
      }
    }
    catch(e){if(seq===sequence.current)setError(messageFor(e));}finally{setLoadingMore(false);}
  }
  const person = selectedPerson?.id === selected ? selectedPerson : list.find(p=>p.id===selected) ?? null;
  useCapturePrivacy(person ? null : 'discovery');
  function openProfile(item: PublicPerson, button: HTMLButtonElement) {
    expandedLunaPerson.current=null;
    const anchor = button.closest('.dr-person-row')?.querySelector<HTMLButtonElement>('.dr-row-profile') ?? button;
    const origin = (anchor.closest('.dr-row-profile-group, .df-recommendation') ?? anchor).querySelector<HTMLElement>(".cm-weekly-identity");
    listPosition.current = { id: item.id, top: anchor.getBoundingClientRect().top, scroll: window.scrollY, featured: order === "recommended" && anchor.closest(".df-recommendation")?.matches(":first-child") === true };
    const open = () => {
      flushSync(() => { setNotice(""); setError(""); setRowError(''); setInterestNotice(''); setSelected(item.id); setSelectedPerson(item); });
      window.scrollTo({top:0,behavior:"instant"});
      identity.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
      void source.noteProfileOpen?.(item.id).catch(() => {});
      return identity.current?.querySelector<HTMLElement>('.mp-portrait') ?? null;
    };
    if (!origin || (!item.isDemo && source.profileVisible)) open();
    else move(origin.querySelector<HTMLElement>('.df-portrait-media') ?? origin, open);
  }
  function closeProfile() {
    const origin = identity.current?.querySelector<HTMLElement>('.mp-portrait');
    const shell = origin?.closest(".cm-shell");
    const anchor = listPosition.current;
    if (!origin || !anchor || !shell) { setSelected(null); setSelectedPerson(null); return; }
    move(origin, () => {
      flushSync(() => {setSelected(null);setSelectedPerson(null);});
      const button = shell.querySelector<HTMLButtonElement>(`[data-weekly-person="${CSS.escape(anchor.id)}"]`);
      if (!button) { window.scrollTo(0, anchor.scroll); return null; }
      window.scrollTo(0, window.scrollY + button.getBoundingClientRect().top - anchor.top);
      button.focus({ preventScroll: true });
      const card=button.closest('.dr-row-profile-group, .df-recommendation');
      return card?.querySelector<HTMLElement>('.df-portrait-media, .dr-row-avatar') ?? null;
    });
  }
  async function sendRequest(target=person) {
    if (!target || target.eligible===false || actionPending.current) return;
    if(!premium){upgrade();return;}
    const id = target.id;
    actionPending.current = true;
    setBusy(true);
    setError("");
    try {
      const requestId = await source.request(id);
      feedback('success');
      setSent({ id: requestId, featured: listPosition.current?.id === id && listPosition.current.featured });
      setSelected(current => current === id ? null : current);
      setList((current) => current.filter((p) => p.id !== id));
      setNotice("أُرسل طلب التعارف.");
      void refresh(false);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }
  async function rowAction(item:PublicPerson,action:'interest'|'dismiss'|'block'|'report',reason?:string) {
    if(actionPending.current)return;
    actionPending.current=true;setRowBusy(item.id);setRowError('');setInterestNotice('');
    try {
      if(action==='interest') {
        if(!source.setInterest)throw Error('الاهتمام غير متاح الآن.');
        await source.setInterest(item.id,!item.interested);
        setList(rows=>rows.map(row=>row.id===item.id?{...row,interested:!item.interested}:row));
        setSelectedPerson(current=>current?.id===item.id?{...current,interested:!item.interested}:current);
        setInterestNotice(item.interested?'أُلغي اهتمامك.':'أُرسل إشعار باهتمامك.');
      } else {
        if(action==='dismiss') {if(!source.dismissPerson)throw Error('الإخفاء غير متاح الآن.');await source.dismissPerson(item.id);setHiddenNotice(`أُخفي ملف ${item.alias} من الاستكشاف والترشيحات.`);}
        else if(action==='block' && source.blockPerson) {await source.blockPerson(item.id);setHiddenNotice('تم حظر العضو.');}
        else {if(!source.reportPerson)throw Error('الإبلاغ غير متاح الآن.');await source.reportPerson(item.id,reason||'');feedback('success');setReportTarget(null);setReportSent(item.isDemo?'local':'sent');}
        setList(rows=>rows.filter(row=>row.id!==item.id));
      }
    }catch(e){setRowError(messageFor(e));}
    finally{actionPending.current=false;setRowBusy(null);}
  }
  if (person)
    return (
      <Profile source={source} person={premium?person:{...person,fit:undefined,reasons:[],compatibilityLocked:true}} back={closeProfile} backText="استكشف" identity={identity} onBlock={source.blockPerson ? ()=>{closeProfile();void rowAction(person,"block");} : undefined} onReport={()=>{closeProfile();setRowError('');setReportTarget(person);}}
        interestAction={person.eligible!==false&&source.setInterest&&(!person.isDemo||source.simulation||source.demoInteractions)?{toggle:()=>void rowAction(person,'interest'),busy:busy||rowBusy!==null,notice:interestNotice,error:rowError}:undefined}
        featured={listPosition.current?.featured}
        primary={person.isDemo&&!source.simulation&&!source.demoInteractions?<p className="cm-help">طلبات التعارف غير متاحة لهذا الملف.</p>:person.eligible===false&&!person.connectionId?<p className="cm-help"><LockKeyhole size={14} />هذا الملف غير مؤهل لطلب تعارف وفق الشروط الحالية.</p>:<>
          <button onClick={()=>person.connectionId ? onInbox({id:person.connectionId,featured:false}) : void sendRequest()} disabled={busy || (!person.connectionId && (person.atCapacity || person.viewerAtCapacity))} aria-busy={busy||undefined} className="btn-primary mp-action-main" data-introduction-request={premium&&!person.connectionId||undefined}>
            <span className="mp-action-copy"><strong>{busy?'جارٍ إرسال الطلب…':person.connectionId ? person.connectionStatus === "accepted" ? memberAr.openChat : "عرض طلب التعارف" : person.atCapacity || person.viewerAtCapacity ? "اكتمل عدد التعارفات حاليًا" : premium ? memberAr.request : "اشترك وابدأ التعارف"}</strong></span>
            <span className="mp-action-symbol" aria-hidden="true">{person.connectionStatus==='accepted'?<MessageCircle size={18}/>:person.connectionStatus==='pending'?<Clock3 size={18}/>:<AddPersonMark/>}</span>
          </button>
          {!person.connectionId && (person.atCapacity || person.viewerAtCapacity) && <p className="cm-help"><LockKeyhole size={14} />اكتمل عدد الارتباطات المتاح لأحد الطرفين. يمكنك العودة لاحقًا.</p>}
          {error&&<Banner alert text={error}/>}
        </>}
      />
    );
  const count = Object.entries(filters).filter(([key,value])=>!["sort","offset","afterId","mode","search"].includes(key)&&(key!=="eligibleOnly"||order==="all")&&(Array.isArray(value)?value.length>0:Boolean(value))).length;
  const people = order === "recommended" ? list.slice(0,5) : list;
  const canRefreshDirectory = order === "all" && !loading && !pullRefreshing && !loadingMore && !rowBusy && !filterOpen && !fitPerson && !reportTarget;
  async function refreshDirectory() {
    if (!canRefreshDirectory) return;
    setPullRefreshing(true); updatePullDistance.current?.(48);
    try { await Promise.all([refresh(), new Promise(resolve => window.setTimeout(resolve, 450))]); }
    finally { setPullRefreshing(false); updatePullDistance.current?.(0); }
  }
  function startDirectoryPull(event: TouchEvent<HTMLElement>) {
    pullStart.current = null;
    suppressPullClick.current = false;
    if (!canRefreshDirectory || window.scrollY > 2 || event.touches.length !== 1) return;
    const touch = event.touches[0];
    pullStart.current = { x: touch.clientX, y: touch.clientY };
  }
  function endDirectoryPull(event: TouchEvent<HTMLElement>) {
    const start = pullStart.current;
    pullStart.current = null;
    const ready = start && event.changedTouches.length === 1 && pullAmount.current >= 52 && window.scrollY <= 2;
    pullAmount.current = 0;
    if (ready && canRefreshDirectory) void refreshDirectory();
    else if (!pullRefreshing) updatePullDistance.current?.(0);
  }
  return (
    <section
      className={"screen-content cm-view df-discovery"+(order==='all'?' dr-directory':'')}
      ref={directorySurface}
      onPointerDownCapture={source.noteDiscoveryBrowse}
      onKeyDownCapture={source.noteDiscoveryBrowse}
      onWheelCapture={source.noteDiscoveryBrowse}
      onTouchStart={startDirectoryPull}
      onTouchEnd={endDirectoryPull}
      onTouchCancel={() => { pullStart.current = null; pullAmount.current = 0; if (!pullRefreshing) updatePullDistance.current?.(0); }}
      onClickCapture={event => { if (suppressPullClick.current) { event.preventDefault(); event.stopPropagation(); suppressPullClick.current = false; } }}
    >
      <ScenePaths className="df-arrival-paths" parallax />
      <header className="cm-header df-header">
        <Brand />
        <div className="wd-discovery-membership">
          <MembershipEntry/>
          {order === "all" && <button
            type="button"
            className="dr-refresh-directory"
            aria-label="تحديث الملفات"
            aria-busy={loading || undefined}
            disabled={!canRefreshDirectory}
            onClick={() => void refreshDirectory()}
          ><RotateCcw size={15} aria-hidden="true" /></button>}
        </div>
      </header>
      {showReceipt && <SuccessNotice title="حُفظ ملفك وتفضيلاتك" detail="ملفك جاهز للاستكشاف. ابدأ بأقرب الترشيحات، ويمكنك تعديل اختياراتك من الإعدادات." close={()=>setShowReceipt(false)}/>}
      {reportSent && <ReportReceipt demo={reportSent==='local'} close={()=>setReportSent(null)}/>}
      <NextStep source={source}
        onRequest={id=>onInbox({id,featured:false})} onConversation={onConversation} onStateChange={setAvailability}/>
      {availability.exclusive ? <Panel icon={<LockKeyhole/>} title="أنتما في تعارف حصري" description="توقّف ظهوركما في الاكتشاف، وأُغلقت طلبات التعارف والمحادثات الأخرى."/> : <>
      <div className="df-feed-controls">
        <div className="df-feed-tabs" role="group" aria-label="ترتيب الملفات">
          <button type="button" aria-pressed={order === "recommended"} onClick={() => setOrder("recommended")}><Sparkles size={16}/> ترشيحات لك</button>
          <button type="button" aria-pressed={order === "all"} onClick={() => setOrder("all")}><Compass size={16} /> جميع الملفات</button>
        </div>
      </div>
      {<div className="dr-tools" data-search-open={searchOpen||undefined}><div className="dr-search-explainer"><WhyWudayn label="كيف نختار من يناسبك؟"/></div><div className="dr-search-control">
        <button ref={searchToggle} type="button" className="dr-search-toggle" aria-label={searchOpen?'طي البحث':query.trim()?'فتح البحث، يوجد بحث نشط':'فتح البحث'} aria-expanded={searchOpen} aria-controls={searchId} data-active={Boolean(query.trim())||undefined} onClick={()=>setSearchOpen(value=>!value)}><Search size={17} aria-hidden="true"/></button>
        {searchOpen&&<label className="dr-search" id={searchId}><input autoFocus aria-label="البحث بالاسم أو المهنة أو النبذة" placeholder="ابحث في الملفات" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'){setSearchOpen(false);searchToggle.current?.focus();}}} maxLength={80}/>{query&&<button type="button" onClick={()=>setQuery('')} aria-label="مسح البحث"><X size={14}/></button>}</label>}
      </div>
        <button className="dr-filter-shortcut" aria-label="تصفية الملفات" onClick={()=>setFilterOpen(true)}><SlidersHorizontal size={18}/>{count>0&&<b>{ar.format(count)}</b>}</button></div>}
      <LunaSearch key={preferenceRevision} filters={{...filters,search:query,mode:order}} source={source} open={(person,mode)=>{
        expandedLunaPerson.current=mode==='all'&&order==='recommended'?person.id:null;
        setSelectedPerson(person);setSelected(person.id);
      }}/>
      {count > 0 && (
        <div className="cm-applied" aria-label="التصفية النشطة"><button onClick={()=>setFilters({search:query})}>مسح {ar.format(count)} فلاتر <X size={13}/></button>
          {(filters.minAge || filters.maxAge) && (
            <button onClick={() => setFilters((current) => ({ ...current, minAge: undefined, maxAge: undefined }))} aria-label="إزالة تصفية العمر">
              {ar.format(filters.minAge ?? 18)} – {ar.format(filters.maxAge ?? 110)} عامًا <X size={13} />
            </button>
          )}
          {filters.interest && (
            <button onClick={() => setFilters((current) => ({ ...current, interest: undefined }))} aria-label="إزالة تصفية الاهتمام">
              {safeInterest(filters.interest)} <X size={13} />
            </button>
          )}
          {([['language','اللغة'],['city','المدينة'],['nationality','الجنسية'],['tribalBackground','الخلفية القبلية'],['maritalStatus','الحالة الاجتماعية'],['smoking','التدخين'],['dressStyle','غطاء الرأس'],['work','عمل الزوجة'],['minFit','حد التوافق'],['eligibleOnly','المؤهلون للتعارف فقط'],['availableOnly','متاح للتعارف'],['onlineOnly','نشط الآن'],['excludeCities','إخفاء مدن'],['excludeNationalities','إخفاء جنسيات'],['excludeTribalBackgrounds','إخفاء خلفيات'],['excludeSmoking','إخفاء حسب التدخين'],['excludeMaritalStatuses','إخفاء حالات اجتماعية']] as const).map(([key,label])=>{
            if(key==="eligibleOnly"&&order!=="all")return null;
            const value=filters[key];if(Array.isArray(value)?!value.length:!value)return null;
            return <button key={key} onClick={()=>setFilters(current=>({...current,[key]:undefined}))} aria-label={`إزالة ${label}`}>{label}{Array.isArray(value)?` · ${ar.format(value.length)}`:key==='city'||key==='nationality'?`: ${String(value)}`:''}<X size={13}/></button>;
          })}
        </div>
      )}
      {notice && (
        <div className="nf-request-result">
          <SuccessNotice title={notice} detail="الخطوة التالية لدى الطرف الآخر. تظهر الموافقة في الإشعارات، وتُفتح بعدها مساحة التعارف."/>
          <button onClick={() => { if (sent) onInbox(sent); }}>
            متابعة طلبي <ArrowLeft size={15} />
          </button>
        </div>
      )}
      {rowError&&!reportTarget&&<Banner alert text={rowError}/>}
      {interestNotice&&<p className="df-browse-memory" role="status"><Heart size={13}/>{interestNotice}<button className="btn-text" onClick={()=>setInterestNotice('')} aria-label="إخفاء تأكيد الاهتمام"><X size={13}/></button></p>}
      {hiddenNotice&&<p className="df-browse-memory" role="status"><EyeOff size={13}/>{hiddenNotice}<button className="btn-text" onClick={()=>setHiddenNotice('')} aria-label="إخفاء تأكيد الإخفاء"><X size={13}/></button></p>}
      {error && (
        <>
          <Banner alert text={error} />
          <button className="btn-secondary" onClick={() => void refresh()}>
            إعادة المحاولة
          </button>
        </>
      )}
      {loading && !error && !list.length && (
        <CommunitySkeleton variant={order === 'all' ? 'directory' : 'profile'} label={order === 'all' ? 'جارٍ تحميل الملفات…' : 'جارٍ تجهيز الترشيحات…'}/>
      )}
      {!error && !loading && !list.length && (
        <Panel
          icon={<Compass />}
          title={count || query.trim() ? 'لنوسّع مساحة البحث' : 'كل بداية لها وقتها'}
          description={
            count > 0 || query.trim()
              ? "لم تظهر ملفات بهذه التصفية. جرّب توسيع البحث."
              : availability.acceptedCount >= (connectionLimit??(premium?2:1)) ? 'اكتمل عدد الارتباطات المتاح لعضويتك. يمكنك تصفّح الملفات، وتتاح دعوة جديدة عند انتهاء ارتباط قائم.' : order==='recommended' ? 'انتهت ترشيحات هذا الأسبوع أو لم يعد بينها ملف مؤهل. يمكنك تصفّح بقية الملفات.' : 'لا تتوفر ملفات جديدة الآن.'
          }
          action={
            <div className="cm-empty-actions">
              {(count > 0 || Boolean(query.trim())) && <button className="btn-secondary" onClick={() => { setQuery(''); setFilters(emptyFilters); }}>مسح البحث والتصفية</button>}
              {availability.loaded && availability.acceptedCount >= (connectionLimit??(premium?2:1)) && availability.acceptedCount < 3 && <button className="btn-secondary" onClick={()=>upgrade(availability.acceptedCount===2?'seriousness':'premium')}>عرض عضوية تتيح تعارفًا إضافيًا</button>}
              {order === 'recommended' && <button className="btn-secondary" onClick={()=>setOrder('all')}>استكشف جميع الملفات</button>}
              <button className="btn-text" onClick={onAccount}>مراجعة ملفي وتفضيلاتي</button>
              <SupportContact subject="المساعدة في الترشيحات"/>
            </div>
          }
        />
      )}
      <DirectoryPullContent directory={order === 'all'} refreshing={pullRefreshing} distanceRef={updatePullDistance}>
      <div key={order} className={"cm-list df-feed"+(order === "all"?" dr-rows":"")} aria-label="ملفات للتعارف الجاد" aria-busy={loading}>
        {people.map((item, index) => (
          order==='all'?<DirectoryRow key={item.id} person={item} source={source} busy={busy||rowBusy!==null} open={button=>openProfile(item,button)} request={()=>item.connectionId?onInbox({id:item.connectionId,featured:false}):void sendRequest(item)} interest={()=>void rowAction(item,'interest')} explain={()=>setFitPerson(item)}/>:<PersonCard
            key={item.id}
            person={item}
            source={source}
            priority={index < 2} index={index}
            open={button => openProfile(item, button)}
            explain={()=>setFitPerson(item)}
          />
        ))}
      </div>
      {more && <button className="btn-secondary dr-more" disabled={loadingMore} onClick={()=>void loadMore()}>{loadingMore?"جارٍ التحميل…":"اكتشف المزيد"}<ArrowDown size={16}/></button>}
      {!!list.length && !loading && !more && <footer className="df-feed-end"><h2>{order === 'all' ? 'وصلت إلى نهاية الملفات المتاحة' : 'هذه ترشيحاتك لهذا الأسبوع'}</h2>
        <p>{order === "all" ? "يمكنك تعديل التصفية لرؤية ملفات أخرى تناسب تفضيلاتك." : "اختر «جميع الملفات» لرؤية المزيد، أو عدّل التصفية لتوسيع بحثك."}</p>
        </footer>}
      <div className="df-discovery-help"><HelpButton topic="discovery" label="كيف أبدأ؟ وما معنى التوافق؟"/></div>
      </DirectoryPullContent>
      </>}
      {reportTarget&&<SafetySheet action="report" busy={rowBusy!==null} error={rowError} apply={reason=>void rowAction(reportTarget,'report',reason)} close={()=>{if(!rowBusy)setReportTarget(null);}}/>}
      {!availability.exclusive&&premium&&!fitPerson?.compatibilityLocked&&fitPerson?.fit&&<Sheet title={`التوافق مع ${fitPerson.alias}`} onClose={()=>setFitPerson(null)}><FitDetails fit={fitPerson.fit}/></Sheet>}
      {!availability.exclusive && filterOpen && (
        <FilterSheet source={source} onSaved={()=>{setPreferenceRevision(n=>n+1);void refresh(false);}}
          filters={filters} allProfiles={order==='all'}
          close={() => setFilterOpen(false)}
          apply={(value) => {
            setFilterOpen(false);
            setNotice("");
            setFilters({...value,search:query});
          }}
        />
      )}
    </section>
  );
}

function SafetySheet({
  evidence = false, contextRows = [],
  action,
  apply,
  close,
  busy,
  error,
}: {
  evidence?: boolean; contextRows?:Message[];
  action: SafetyAction;
  apply: (reason: string, allowSafetyScreen?: boolean, contextIds?:string[]) => void;
  close: () => void;
  busy: boolean;
  error: string;
}) {
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState("");
  const [allowSafetyScreen, setAllowSafetyScreen] = useState(false);
  const [contextIds,setContextIds]=useState<string[]>([]);
  const reportReason = [category, reason.trim()].filter(Boolean).join('\n');
  return (
    <Sheet
      title={action === "report" ? memberAr.reportBlock : memberAr.block}
      onClose={close}
    >
      {action === "block" ? (
        <p>سيُغلق الطلب والمحادثة، ولن يظهر هذا العضو لك مجددًا.</p>
      ) : (
        <div className="cm-report-form">
        {evidence && <p>يُحفظ نص الرسالة المحددة أو نوع المرفق لمدة ٣٠ يومًا. يمكن لمالك المنصة أو المشرف المكلّف بالبلاغ مراجعته.</p>}
        {evidence && <label><input type="checkbox" checked={allowSafetyScreen} disabled={busy} onChange={e=>setAllowSafetyScreen(e.target.checked)}/> أطلب فرز هذه الرسالة آليًا. بإذن المرسل يمكن إرسال مقتطف منها إلى OpenAI لترتيب أولوية البلاغ بعد حجب وسائل التواصل. رسائل السياق للفريق فقط.</label>}
        {!!contextRows.length && <details><summary>إرفاق سياق الرسالة</summary>{contextRows.map(m=><label key={m.id} className="cm-report-context"><input type="checkbox" checked={contextIds.includes(m.id)} onChange={e=>setContextIds(v=>e.target.checked?[...v,m.id]:v.filter(id=>id!==m.id))} disabled={busy}/><span><strong>{m.senderIsMe?'رسالتك':'الطرف الآخر'}</strong><br/>{m.body}</span></label>)}</details>}
        <p>اختر ما يصف المشكلة. يكفي اختيار السبب لإرسال البلاغ، ويمكنك إضافة تفاصيل تساعد على فهمه.</p>
        <label className="cm-report-label">سبب البلاغ
          <select value={category} onChange={event=>setCategory(event.target.value)} disabled={busy}>
            <option value="">اختر السبب</option>{reportCategories.map(value=><option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="cm-report-label">
          تفاصيل إضافية · اختياري
          <textarea
            rows={3}
            maxLength={440}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
            placeholder="ماذا حدث، ومتى تقريبًا؟ لا تضف أرقام الهوية أو بيانات لا تتعلق بالبلاغ."
          />
        </label>
        <p className="cm-step-note">بإرسال البلاغ، يُغلق أي طلب أو تعارف قائم ويتوقف التواصل بينكما. يراجع فريق وُدَين السبب والتفاصيل التي ترفقها.</p>
        <SupportContact subject="المساعدة بشأن بلاغ" context="إذا احتجت مساعدة في تقديم البلاغ أو متابعته."/>
        </div>
      )}
      {error && <Banner alert text={error} />}
      <button
        className="btn-primary"
        disabled={busy || (action === "report" && !category)}
        onClick={() => apply(action === 'report' ? reportReason : '', evidence && allowSafetyScreen,contextIds)}
      >
        {action === "report" ? memberAr.sendReportBlock : memberAr.block}
      </button>
    </Sheet>
  );
}

function ExclusiveBadge() {
  return <span className="cm-exclusive-badge"><LockKeyhole size={10} strokeWidth={1.7} aria-hidden="true"/>تعارف حصري</span>;
}

function useChatJourney(source: CommunitySource, id: string, enabled: boolean) {
  const [progress, setProgress] = useState<StepProgress | null>(null);
  useEffect(() => {
    setProgress(null);
    if (!enabled || !source.progress) return;
    let active = true, fetching = false, dirty = false;
    async function refresh() {
      if (!source.progress || document.hidden) return;
      if (fetching) { dirty = true; return; }
      fetching = true;
      try { const next = await source.progress(id); if (active) setProgress(next); }
      catch { /* The guide provides an explicit retry action. */ }
      finally { fetching = false; if (active && dirty) { dirty = false; void refresh(); } }
    }
    void refresh(); const stop = source.watch(() => void refresh());
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; stop(); document.removeEventListener('visibilitychange', refresh); };
  }, [source, id, enabled]);
  return [progress, setProgress] as const;
}

function JourneySummary({ progress, name, open }: { progress: StepProgress | null; name: string; open: () => void }) {
  const next = journeyNext(progress, name);
  return <MotionPressButton className="cm-journey-summary nf-next-step" data-pending={next.yours || undefined} onClick={open} aria-haspopup="dialog" aria-label={`مسار التعارف: ${next.title}. ${next.waiting}. متفق عليه: ${next.agreed}`} title={next.title}>
    <Compass size={18} aria-hidden="true"/><span>مسار التعارف</span>
    {next.yours&&<span className="cm-journey-attention" role="status">بانتظارك</span>}
    <ChevronLeft size={12} aria-hidden="true"/>
  </MotionPressButton>;
}

function RematchChoice({checked,change,disabled}:{checked:boolean;change:(value:boolean)=>void;disabled:boolean}) {
  return <label className="cm-rematch-choice"><input type="checkbox" checked={checked} onChange={event=>change(event.target.checked)} disabled={disabled}/><span><strong>السماح بالتعارف مجددًا</strong><small>{checked?'يمكن لأي منكما إرسال طلب جديد؛ لن يبدأ التعارف إلا بعد قبول الطرف الآخر.':'لن تتمكّنا من إرسال طلب تعارف جديد لبعضكما.'}</small></span></label>;
}

function ConversationGuide({ source, connection, close, closed, choose, hasDraft, openInsights, openFamily, onCompletion, onProgress }: {
  source: CommunitySource; connection: Connection; close: () => void; closed: () => void;
  onProgress: (value: StepProgress) => void; choose: (text: string) => void; hasDraft: boolean; openInsights: () => void; openFamily?: () => void; onCompletion?: () => void;
}) {
  const [progress, setProgress] = useState<StepProgress | null>(null);
  const [otherConnections, setOtherConnections] = useState<Connection[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [allowRematch, setAllowRematch] = useState(false);
  const [exclusiveConsent, setExclusiveConsent] = useState(false);
  const [reviewCommitment, setReviewCommitment] = useState(false);
  const [rewindConfirm, setRewindConfirm] = useState(false);
  const [savedStep,setSavedStep]=useState<{title:string;detail:string;quiet?:boolean}|null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true, sequence = 0;
    async function read() {
      if (!source.progress || document.hidden) return;
      const current = ++sequence;
      try {
        const [value, inbox] = await Promise.all([source.progress(connection.id), source.inbox().catch(() => null)]);
        if (active && current === sequence) { setProgress(value); setOtherConnections(inbox?.filter(item=>item.id!==connection.id) ?? null); setError(""); }
      } catch (e) {
        if (active && current === sequence) { setProgress(null); setError(messageFor(e)); }
      }
    }
    void read();
    const stop = source.watch(read);
    return () => { active = false; stop(); };
  }, [source, connection.id, retry]);
  useEffect(()=>{setExclusiveConsent(false);},[progress?.exclusiveId]);
  async function act(end: boolean) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (end) { await source.act(connection.id, "cancel", undefined, allowRematch); feedback('success'); closed(); }
      else if (progress && source.nextStep) {
        const next=await source.nextStep(connection.id, !progress.exclusive ? 1 : progress.stage + 1, !(progress.exclusive ? progress.mine : progress.consentMine), exclusiveConsent);
        setProgress(next);onProgress(next);
        setSavedStep(next.stage>progress.stage||!progress.exclusive&&next.exclusive ? {title:'اتفقتما على المرحلة الجديدة',detail:journeyStages[next.stage]+' · حُفظ اختياركما معًا.'} : (next.exclusive ? next.mine : next.consentMine) ? {title:'وصل اقتراحك',detail:'بانتظار موافقة الطرف الآخر. تبقى المرحلة الحالية كما هي.',quiet:true} : {title:'سُحب الاقتراح',detail:'يمكنك اقتراح الخطوة مجددًا عندما تكون مستعدًا.',quiet:true});
        setExclusiveConsent(false);
        setRetry(n => n + 1);
      }
    } catch (e) { setError(messageFor(e)); }
    finally { setBusy(false); }
  }
  async function decide(topic:'exclusive'|'step', action:'propose'|'accept'|'clear',stage?:number) {
    if(!source.journeyChoice||busy||!progress)return;
    setBusy(true);setError('');
    try {
      const next=await source.journeyChoice(connection.id,topic,action,topic==='exclusive'?progress.exclusiveId:progress.stepId,stage);
      setProgress(next);onProgress(next);setReviewCommitment(false);setExclusiveConsent(false);
      setSavedStep({title:action==='clear'?'سُحب الاتفاق أو الطلب':action==='accept'?'سُجّلت موافقتكما':'أُرسل اقتراحك',detail:action==='propose'?'بانتظار موافقة الطرف الآخر.':'حُدّث مسار التعارف.',quiet:true});
    } catch(e){setError(messageFor(e));}finally{setBusy(false);setRetry(n=>n+1);}
  }
  async function rewind(agree: boolean) {
    if(busy||!progress||!source.rewindStep)return;setBusy(true);setError("");
    try{const next=await source.rewindStep(connection.id,progress.stage,agree);setProgress(next);onProgress(next);setSavedStep({title:next.stage<progress.stage?'اتفقتما على العودة خطوة':agree?'أُرسل اقتراح العودة':'بقيتما في المرحلة الحالية',detail:next.stage<progress.stage?'المحادثة والمدة المتفق عليها محفوظتان.':agree?'لا تتغيّر المرحلة أو الحصرية قبل موافقة الطرف الآخر.':'يمكنكما مراجعة المسار لاحقًا.',quiet:true});setRewindConfirm(false);setRetry(n=>n+1);}catch(e){setError(messageFor(e));}finally{setBusy(false);}
  }
  const stages = journeyStages;
  const commitmentOpen = reviewCommitment || Boolean(progress?.consentMine || progress?.consentPeer);
  return <Sheet title="مسار التعارف" onClose={() => { if (!busy) close(); }}>
    <div className="nf-journey-guide">
    <MotionReveal className="nf-journey-current" distance={6} duration={280}>
      <span className="nf-journey-eyebrow">خطوة بخطوة، باتفاقكما</span>
      <h3>{progress ? stages[progress.stage] : 'مسار واضح لكما'}</h3>
      <p>{progress?.exclusive ? 'اخترتما التركيز على بعضكما. الترشيحات الأخرى متوقفة ما دام التعارف حصريًا.' : 'للحديث وجهة: اتفقا على الوقت والخطوة التالية. كل انتقال يحدث بموافقتكما.'}</p>
      {progress && <ol className="nf-journey-track" aria-label="مراحل التعارف">{stages.map((label,index)=><li key={label} aria-current={index===progress.stage?'step':undefined} data-complete={index < progress.stage || undefined}><span aria-hidden="true">{index < progress.stage ? <Check size={12}/> : ar.format(index+1)}</span><small>{label}</small></li>)}</ol>}
    </MotionReveal>
    {savedStep&&<SuccessNotice {...savedStep} close={()=>setSavedStep(null)}/>}
    {progress && <section className="nf-journey-next" aria-label="الخطوة القادمة">
      {!progress.exclusive && <>
        <h3>{progress.consentPeer && !progress.consentMine ? 'لديك طلب التزام حصري' : progress.consentMine ? 'اقتراحك بانتظار الموافقة' : 'عندما تختاران التركيز على بعضكما'}</h3>
        <p className="nf-journey-next-note">{progress.consentMine ? 'تبقى المرحلة الحالية كما هي حتى يوافق الطرف الآخر.' : progress.consentPeer ? 'راجع ما سيتغيّر قبل اتخاذ قرارك.' : 'اختيار الحصرية خطوة مستقلة عن الحديث الجاد حول الزواج.'}</p>
        {!commitmentOpen ? <MotionPressButton className="btn-primary" disabled={busy} onClick={()=>setReviewCommitment(true)}>{memberAr.reviewExclusive}<ChevronLeft size={16}/></MotionPressButton> : <div className="nf-journey-consent">
        <p>{memberAr.exclusiveEffect}</p>
        <p>تبقى السجلات محفوظة. يمكنك إنهاء هذا التعارف في أي وقت؛ المحادثات المغلقة لا تُفتح تلقائيًا.</p>
        {otherConnections !== null && <details className="nf-journey-closure"><summary>ما سيُغلق في حسابك <span>{ar.format(otherConnections.length)}</span><ChevronLeft size={14}/></summary>{otherConnections.length ? <ul>{otherConnections.map(item=><li key={item.id}>{item.person.alias} · {item.status==='accepted'?'محادثة قائمة':'طلب قيد الانتظار'}</li>)}</ul> : <p>لا توجد طلبات أو محادثات أخرى ظاهرة في حسابك حاليًا.</p>}<small>هذه معاينة لحالتك الحالية. يُطبّق الإغلاق على التعارفات الأخرى لدى الطرفين عند موافقتكما، وقد تتغير القائمة قبل ذلك.</small></details>}
        {!progress.consentMine && <label className="nf-journey-consent-check"><input type="checkbox" checked={exclusiveConsent} onChange={e => setExclusiveConsent(e.target.checked)} disabled={busy}/> <span>{memberAr.exclusiveConsent}</span></label>}
        <p className="nf-journey-consent-state">{progress.consentMine ? 'سُجّلت موافقتك. بانتظار الطرف الآخر.' : progress.consentPeer ? 'موافقتك الآن ستفعّل الالتزام وتغلق التعارف الآخر.' : 'لن تُغلق أي محادثة قبل موافقتكما معًا.'}</p>
        <MotionPressButton className={progress.consentMine ? 'btn-secondary' : 'btn-primary'} disabled={busy || (!progress.consentMine && !exclusiveConsent)} onClick={() => source.journeyChoice ? void decide('exclusive',progress.consentMine?'clear':progress.consentPeer?'accept':'propose') : void act(false)}>{progress.consentMine ? memberAr.withdrawExclusive : progress.consentPeer ? memberAr.acceptExclusive : memberAr.proposeExclusive}</MotionPressButton>
         {source.journeyChoice&&progress.consentPeer&&!progress.consentMine&&<button type="button" className="btn-text" disabled={busy} onClick={()=>void decide('exclusive','clear')}>رفض طلب الحصرية</button>}
        {!progress.consentMine&&!progress.consentPeer&&<button type="button" className="btn-text" disabled={busy} onClick={()=>{setReviewCommitment(false);setExclusiveConsent(false);}}>ليس الآن</button>}
        </div>}
      </>}
       {progress.exclusive && source.journeyChoice && <><p>يمكن لأي منكما سحب الحصرية. تبقى هذه المحادثة متاحة، ولا تُفتح المحادثات السابقة تلقائيًا.</p><button className="btn-secondary" disabled={busy} onClick={()=>void decide('exclusive','clear')}>سحب موافقتي على الحصرية</button></>}
      {progress.stage===2 && source.journeyChoice && <button className="btn-secondary" disabled={busy} onClick={()=>void decide('step','clear',2)}>سحب الموافقة على المرحلة العائلية</button>}
      {progress.exclusive && progress.stage === 2 && <><h3>بداية الخطوة العائلية</h3><p className="nf-journey-next-note">اتفقا على التفاصيل بالوتيرة المناسبة لكما.</p>{onCompletion&&<MotionPressButton className="btn-primary" onClick={onCompletion}>نحو بداية جديدة<ChevronLeft size={16}/></MotionPressButton>}</>}
      {(source.journeyChoice || progress.exclusive) && progress.stage < 2 && <>
        <h3>{progress.mine ? 'اقتراحك بانتظار الموافقة' : progress.peer ? 'لديك طلب للخطوة التالية' : 'خطوتكما القادمة'}</h3>
        <p className="nf-journey-next-note">{progress.mine ? "تنتقلان للخطوة التالية بعد موافقة الطرف الآخر." : progress.peer ? "راجع الخطوة ووافق عندما تكون مستعدًا." : "يصل اقتراحك للطرف الآخر؛ لا تتغيّر المرحلة إلا باتفاقكما."}</p>
        <MotionPressButton className={progress.mine?'btn-secondary':'btn-primary'} disabled={busy} onClick={() => source.journeyChoice ? void decide('step', progress.mine?'clear':progress.peer?'accept':'propose',progress.stage+1) : void act(false)}>{(progress.mine ? memberAr.withdrawStage : progress.peer ? memberAr.acceptStage : memberAr.proposeStage)[progress.stage + 1]}</MotionPressButton>
        {source.journeyChoice && progress.peer && !progress.mine && <button className="btn-text" disabled={busy} onClick={()=>void decide('step','clear',progress.stage+1)}>ليس الآن</button>}
      </>}
    </section>}
    {progress?.stage===2&&!progress.exclusive&&onCompletion&&<MotionPressButton className="nf-journey-tool" disabled={busy} onClick={onCompletion}><Heart size={19}/><span><strong>نحو بداية جديدة</strong><small>خيارات الاستمرار خارج التطبيق وخصوصية الحساب</small></span><ChevronLeft size={15}/></MotionPressButton>}
    {openFamily&&<MotionPressButton className="nf-journey-tool" disabled={busy} onClick={openFamily}><UsersRound size={19}/><span><strong>جسر الأهل</strong><small>راجعا الموافقات أولًا؛ لا تُرسل دعوة تلقائيًا.</small></span><ChevronLeft size={15}/></MotionPressButton>}
    {progress && progress.stage > 0 && source.rewindStep && <details className="nf-journey-option" open={rewindConfirm || Boolean(progress.rewindPeer || progress.rewindMine)} data-pending={progress.rewindPeer || undefined}>
      <summary><RotateCcw size={18}/><span><strong>مساحة لخطوة أهدأ</strong><small>{progress.rewindPeer ? "اقتراح عودة · بانتظار موافقتك" : progress.rewindMine ? "اقتراحك بانتظار الطرف الآخر" : "العودة مرحلة واحدة باتفاقكما"}</small></span><ChevronLeft size={15}/></summary><div className="nf-journey-option-content">
      {(rewindConfirm || progress.rewindPeer) && <p className="dr-rewind-warning">{memberAr.rewindEffect[progress.stage - 1]}</p>}
      {progress.rewindMine ? <button className="btn-secondary" disabled={busy} onClick={()=>void rewind(false)}>{memberAr.withdrawRewind}</button> : rewindConfirm || progress.rewindPeer ? <><button className="btn-secondary" disabled={busy} onClick={()=>void rewind(true)}>{(progress.rewindPeer ? memberAr.acceptRewind : memberAr.proposeRewind)[progress.stage-1]}</button><button className="btn-text" disabled={busy} onClick={()=>progress.rewindPeer ? void rewind(false) : setRewindConfirm(false)}>{progress.rewindPeer?memberAr.keepStage:"تراجع"}</button></> : <button className="btn-secondary" onClick={()=>setRewindConfirm(true)}>{memberAr.rewind}</button>}
    </div></details>}
    {error && <><Banner alert text={error}/><button className="btn-text" onClick={() => setRetry(n => n+1)}>إعادة المحاولة</button></>}
    <details className="nf-journey-option"><summary><MessageCircle size={18}/><span><strong>أفكار تساعد الحوار</strong><small>من توافقكما ومن تفاصيل الحياة</small></span><ChevronLeft size={15}/></summary><div className="nf-journey-option-content">
      <button type="button" className="btn-secondary" disabled={busy} onClick={openInsights}><Sparkles size={16}/> حديث أقرب · أفكار من توافقكما</button>
      {hasDraft && <p className="cm-step-note">أكمل مسودتك أو امسحها لاختيار سؤال.</p>}
      <details className="cm-practical-questions"><summary>مواضيع عملية قبل الخطوة القادمة</summary><p>اختارا موضوعًا يناسب وقتكما. يُضاف السؤال كمسودة لتراجعه قبل الإرسال.</p><div className="cm-step-buttons">{practicalQuestions.map(([title,text])=><button key={title} className="btn-secondary" disabled={busy||hasDraft} onClick={()=>choose(text)}><strong>{title}</strong><span>{text}</span></button>)}</div></details>
    </div></details>
    <div className="nf-journey-footer"><HelpButton topic="journey" label="كيف يعمل المسار؟"/>
    {confirmClose ? <div className="nf-journey-end-confirm">
      <p className="cm-step-note">سيُغلق التعارف ولن يتمكّن أي منكما من إرسال رسائل أخرى.</p>
      <RematchChoice checked={allowRematch} change={setAllowRematch} disabled={busy}/>
      <button className="btn-primary" disabled={busy} onClick={() => void act(true)}>تأكيد إنهاء التعارف</button>
      <button className="btn-text" disabled={busy} onClick={() => setConfirmClose(false)}>تراجع</button>
    </div> : <button className="btn-text nf-journey-end" disabled={busy} onClick={() => setConfirmClose(true)}>إنهاء التعارف</button>}
    </div></div>
  </Sheet>;
}

function ChatComposer({ outbox, composer, canSend, conversationAllowed, typing, onSubmit, name, children }: {
  outbox: ReturnType<typeof useThread>['outbox'];
  composer: RefObject<HTMLTextAreaElement | null>;
  canSend: boolean;
  conversationAllowed: boolean;
  typing: ReturnType<typeof useTyping>;
  onSubmit: (event: FormEvent) => void;
  name: string;
  children: ReactNode;
}) {
  const { draft, reply } = useSyncExternalStore(outbox.subscribe, outbox.read);
  useLayoutEffect(() => {
    const element = composer.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = Math.min(element.scrollHeight, 110) + "px";
  }, [composer, draft]);
  return <div className="cm-chat-compose">
    {reply && <div className="cm-reply-draft" role="status"><Reply size={18} aria-hidden="true"/><div>
      <strong>رد على {reply.senderIsMe ? 'رسالتك' : name}</strong><span dir="auto">{reply.body}</span>
    </div><button type="button" className="icon-btn" aria-label="إلغاء الرد" onClick={() => outbox.replyTo()}><X size={18}/></button></div>}
    <div className="cm-composer-surface">
      {children}
      <form onSubmit={onSubmit}>
        <textarea
          ref={composer} aria-label="رسالتك" rows={1} maxLength={1000} dir="rtl"
          value={draft} placeholder={!conversationAllowed ? "مسودة حتى تفعيل الميثاق…" : reply ? "اكتب ردك…" : "رسالتك…"}
          onChange={(e) => { outbox.write(e.target.value); if (e.target.value.trim()) typing.touch(); else typing.stop(); }}
          onBlur={typing.stop}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && (e.metaKey || e.ctrlKey || window.matchMedia("(pointer: fine)").matches)) {
              e.preventDefault(); e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <MotionPressButton type="submit" aria-label="إرسال الرسالة" onPointerDown={event => { if (document.activeElement === composer.current) event.preventDefault(); }} disabled={!draft.trim() || !canSend}><Send size={19} /></MotionPressButton>
      </form>
    </div>
    {draft.length > 850 && <span className="cm-count">{ar.format(draft.length)} / ١٠٠٠</span>}
  </div>;
}

export function Chat({
  source, connection, back, close, backLabel, pushOwner, onReported, onCompletion, onEnded, initialMessage, initialRoom, initialAgreement, initialAnalysis, initialJourney, openFeedback,
}: {
  initialMessage?:string;initialRoom?:string;initialAgreement?:boolean|number;initialAnalysis?:boolean|number;initialJourney?:boolean|number;openFeedback?:boolean; source: CommunitySource; connection: Connection; back: () => void; close: () => void; backLabel: string;
  pushOwner?:string|null;
  onReported?: () => void;
  onEnded?: (id:string) => void;
  onCompletion?: () => void;
}) {
  const voice = useVoiceCalls();
  const [safety, setSafety] = useState<SafetyAction | null>(null);
  const [safetyError, setSafetyError] = useState("");
  const [safetyBusy, setSafetyBusy] = useState(false);
  const [showLatest, setShowLatest] = useState(false);
  const [guide, setGuide] = useState(Boolean(initialJourney));
  useEffect(()=>{if(initialJourney)setGuide(true);},[initialJourney]);
  const [recording, setRecording] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [muted,setMuted]=useState<boolean|null>(null);
  const [muting,setMuting]=useState(false);
  const [muteError,setMuteError]=useState('');
  const [insightsOpen, setInsightsOpen] = useState(false);
  const thread = useThread(source, connection.id, guide || insightsOpen);
  const [deepOpen, setDeepOpen] = useState(Boolean(initialAnalysis));
  const [deepTimelineAt, setDeepTimelineAt] = useState<string | null>(null);
  const [deepTimelineSlot, setDeepTimelineSlot] = useState<HTMLSpanElement | null>(null);
  useEffect(() => { if(initialAnalysis) setDeepOpen(true); },[initialAnalysis]);
  const [chatHelp,setChatHelp]=useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [familyOpen, setFamilyOpen] = useState(Boolean(initialRoom));
  useCapturePrivacy(profileOpen || (familyOpen && source.family) ? null : 'chat');
  useEffect(()=>{if(initialRoom)setFamilyOpen(true);},[initialRoom]);
  const [endMatch, setEndMatch] = useState(false);
  const [allowRematch, setAllowRematch] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<{id:string; submission:string} | null>(null);
  const [messageActionId, setMessageActionId] = useState<string | null>(null);
  const [messageActionAnchor, setMessageActionAnchor] = useState<HTMLElement | null>(null);
  const [reactionError, setReactionError] = useState('');
  const messageActionHelp = useId();
  const [deleting, setDeleting] = useState(false), [deleteError, setDeleteError] = useState('');
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const [pageHidden, setPageHidden] = useState(() => document.hidden);
  const privateHidden = pageHidden && nativePrivatePhoto();
  const [jumpToId, setJumpToId] = useState<string | null>(initialRoom?null:initialMessage??null);
  useEffect(()=>{if(initialMessage&&!initialRoom)setJumpToId(initialMessage);},[initialMessage,initialRoom]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [replyNotice, setReplyNotice] = useState('');
  const [agreementSlot, setAgreementSlot] = useState<HTMLDivElement | null>(null);
  const [conversationAllowed, setConversationAllowed] = useState(!source.agreement);
  const [journey, setJourney] = useChatJourney(source, connection.id, conversationAllowed && !thread.accessDenied);
  const exclusive = journey?.exclusive ?? connection.person.exclusive;
  const canDraft = thread.ready && !thread.accessDenied;
  const canSend = canDraft && conversationAllowed && thread.connectionState === 'online';
  const screen = useRef<HTMLElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const composedId = useRef<string | undefined>(undefined);
  const atBottom = useRef(true);
  const anchor = useRef<{ id: string; offset: number } | null>(null);
  const lastRow = thread.rows.at(-1);
  const lastId = lastRow?.clientId || lastRow?.id;
  const lastReactions = lastRow?.reactions?.map(reaction => `${reaction.emoji}:${reaction.count}:${reaction.mine}`).join('|');
  const firstId = thread.rows[0]?.id;
  const replyDraft = thread.replyDraft;
  const reading = useChatReading(source, connection.id, log, atBottom, thread, canDraft && !profileOpen && !familyOpen);
  const typing = useTyping(source, connection.id, canSend && !profileOpen && !familyOpen && !recording && !libraryOpen && !deepOpen && !pageHidden);
  const profileIdentity = useRef<HTMLElement>(null);
  const profileFlight = useWeeklyCardTransition();
  const canMute=Boolean(pushOwner&&!pushOwner.startsWith('tester:')&&!connection.person.isDemo);
  useEffect(()=>{
    let active=true;
    if(!canMute||!pushOwner){setMuted(null);return;}
    void pushThreadMute(pushOwner,connection.id).then(value=>{if(active)setMuted(value.muted);},()=>{if(active)setMuted(null);});
    return()=>{active=false;};
  },[canMute,pushOwner,connection.id]);
  async function toggleThreadMute(){
    if(!canMute||!pushOwner||muting)return;
    setMuting(true);setMuteError('');
    try{setMuted((await pushThreadMute(pushOwner,connection.id,!muted)).muted);feedback('selection');}
    catch{setMuteError('لم يتغير كتم المحادثة. حاول مجددًا.');}
    finally{setMuting(false);}
  }
  useReadPosition(source, connection.id, log, thread.rows.filter(m => !m.senderIsMe).at(-1)?.id, reading.positioned && canDraft && !pageHidden && !safety && !guide && !profileOpen && !familyOpen && !endMatch && !toolsOpen && !insightsOpen && !deepOpen && !deleteTarget && !messageActionId && !libraryOpen);
  function messagePermissions(msg: Message) {
    const status = 'status' in msg ? msg as Outgoing : undefined;
    const deleted = Boolean(msg.deletedAt) || deletedIds.has(msg.id);
    const saved = !status || status.status === 'saved';
    return { status, deleted,
      canReport: Boolean(source.reportIncident) && !msg.senderIsMe && saved,
      canReply: canDraft && !deleted && saved,
      canReact: Boolean(source.reactToMessage) && canSend && !deleted && saved,
      canDelete: Boolean(source.deleteMessage) && msg.senderIsMe && !deleted && saved && Date.now() - Date.parse(msg.createdAt) < 48 * 60 * 60 * 1000,
    };
  }
  const evidenceRow = evidence ? thread.rows.findIndex(m => m.id===evidence.id) : -1;
  const evidenceContext = evidenceRow<0 ? [] : [thread.rows[evidenceRow-1],thread.rows[evidenceRow+1]].filter((m):m is Message => !!m && !m.attachment && !m.deletedAt && !deletedIds.has(m.id) && (!('status' in m) || m.status==='saved'));
  const actionMessage = thread.rows.find(msg => msg.id === messageActionId);
  const actionPermissions = actionMessage ? messagePermissions(actionMessage) : null;
  const hasMessageActions = Boolean(actionPermissions?.canReport || actionPermissions?.canReply || actionPermissions?.canDelete || actionPermissions?.canReact);
  useEffect(() => {
    if (messageActionId && (!hasMessageActions || privateHidden)) setMessageActionId(null);
  }, [messageActionId, hasMessageActions, privateHidden]);

  function openMessageActions(message: Message) {
    const permissions = messagePermissions(message);
    if (!permissions.canReport && !permissions.canReply && !permissions.canDelete && !permissions.canReact) return;
    const row = Array.from(log.current?.querySelectorAll<HTMLElement>('[data-server-id]') ?? [])
      .find(element => element.dataset.serverId === message.id);
    setMessageActionAnchor(row?.querySelector<HTMLElement>('.cm-bubble') ?? null);
    feedback('selection'); setMessageActionId(message.id);
  }

  async function chooseReaction(message: Message, reaction: ReactionEmoji | null) {
    if (!messagePermissions(message).canReact || thread.pendingReactionIds.has(message.id)) return;
    setReactionError(''); setMessageActionId(null); feedback('selection');
    try { await thread.reactToMessage(message.id, reaction); }
    catch { setReactionError('لم يُحفظ التفاعل. اضغط مطولًا على الرسالة للمحاولة مجددًا.'); }
  }

  useEffect(() => {
    const hide = () => setPageHidden(document.hidden);
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  useEffect(() => {
    if (replyDraft && (deletedIds.has(replyDraft.id) || thread.rows.some(message => message.id === replyDraft.id && message.deletedAt))) thread.outbox.replyTo();
  }, [thread.rows, replyDraft, thread.outbox, deletedIds]);
  async function deleteForEveryone() {
    if (!deleteTarget || deleting || !source.deleteMessage) return;
    setDeleting(true); setDeleteError('');
    try {
      await source.deleteMessage(connection.id, deleteTarget);
      setDeletedIds(previous => new Set([...previous, deleteTarget]));
      if (thread.outbox.read().reply?.id === deleteTarget) thread.outbox.replyTo();
      setDeleteTarget(null); thread.refresh();
    } catch (cause) { setDeleteError(messageFor(cause)); }
    finally { setDeleting(false); }
  }
  const onDeepNotice = useCallback(() => {
    if (atBottom.current && log.current) log.current.scrollTop = log.current.scrollHeight;
    else setShowLatest(true);
  }, []);
  const onDeepTimelineChange = useCallback((at: string | null) => {
    setDeepTimelineAt(current => current === at ? current : at);
  }, []);
  function scrollToLatest() {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
    atBottom.current = true;
    setShowLatest(false);
  }
  useLayoutEffect(() => {
    if (!screen.current) return;
    const keepLatestVisible = () => {
      if (reading.positioned && atBottom.current && log.current) log.current.scrollTop = log.current.scrollHeight;
    };
    const unlock = lockChatViewport(screen.current, keepLatestVisible);
    const observer = new ResizeObserver(keepLatestVisible);
    if (log.current) observer.observe(log.current);
    return () => { observer.disconnect(); unlock(); };
  }, [profileOpen, familyOpen, conversationAllowed, reading.positioned]);
  useLayoutEffect(() => {
    if (!reading.positioned) return;
    if (atBottom.current) scrollToLatest();
    else if (lastId) setShowLatest(true);
  }, [lastId, profileOpen, conversationAllowed]);
  useLayoutEffect(() => {
    if (reading.positioned && atBottom.current) scrollToLatest();
  }, [replyDraft?.id, lastReactions, reading.firstUnreadId]);
  useLayoutEffect(() => {
    const saved = anchor.current;
    if (saved && !thread.loadingOlder && log.current) {
      const previous = Array.from(log.current.querySelectorAll<HTMLElement>("[data-row-id]")).find((el) => el.dataset.rowId === saved.id);
      if (previous) log.current.scrollTop += previous.getBoundingClientRect().top - saved.offset;
      anchor.current = null;
    }
  }, [firstId, thread.loadingOlder]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const body = thread.outbox.read().draft.trim();
    if (!canSend || !body || body.length > 1000) return;
    typing.stop();
    atBottom.current = true;
    composedId.current = thread.outbox.enqueue(body);
    composer.current?.focus({ preventScroll: true });
  }
  function chooseConversationPrompt(text: string) {
    const current = thread.outbox.read();
    if (!canSend || recording || current.draft || current.reply || !text.trim() || text.length > 1000) return;
    thread.outbox.write(text);
    setInsightsOpen(false);
    setGuide(false);
    requestAnimationFrame(() => composer.current?.focus({ preventScroll: true }));
  }
  function chooseReply(msg: Message) {
    if (!canDraft || msg.deletedAt || deletedIds.has(msg.id) || ('status' in msg && msg.status !== 'saved')) return;
    thread.outbox.replyTo({ id: msg.id, senderIsMe: msg.senderIsMe,
      body: msg.attachment ? (msg.attachment.kind === 'photo' ? msg.attachment.viewOnce ? 'صورة لمرة واحدة' : 'صورة' : 'رسالة صوتية') : msg.body.slice(0,240) });
    setReplyNotice('');
    composer.current?.focus({ preventScroll: true });
  }
  useEffect(() => {
    if (!jumpToId || !log.current || !thread.ready || thread.loading) return;
    const row = Array.from(log.current.querySelectorAll<HTMLElement>('[data-server-id]')).find(el => el.dataset.serverId === jumpToId);
    if (row) {
      atBottom.current = false;
      log.current.scrollTop += row.getBoundingClientRect().top - log.current.getBoundingClientRect().top - 20;
      row.focus({ preventScroll: true });
      setHighlightId(jumpToId); setJumpToId(null); setReplyNotice('');
    } else if (!thread.loadingOlder) {
      if (thread.hasOlder && !thread.error) void thread.older();
      else { setReplyNotice('الرسالة الأصلية غير متاحة في السجل الحالي.'); setJumpToId(null); }
    }
  }, [jumpToId, firstId, thread.ready, thread.loading, thread.loadingOlder, thread.hasOlder, thread.error, thread.older]);
  useEffect(() => {
    if (!highlightId) return;
    const timer = window.setTimeout(() => setHighlightId(null), 2200);
    return () => clearTimeout(timer);
  }, [highlightId]);
  function earlier() {
    const first = log.current?.querySelector<HTMLElement>("[data-row-id]");
    if (first?.dataset.rowId) anchor.current = { id: first.dataset.rowId, offset: first.getBoundingClientRect().top };
    void thread.older();
  }
  async function moderate(reason: string, allowSafetyScreen=false,contextIds?:string[]) {
    if (!safety || safetyBusy) return;
    setSafetyBusy(true);
    setSafetyError("");
    try {
      if (safety === 'report' && evidence && source.reportIncident) await source.reportIncident(connection.id,evidence.id,reason,evidence.submission,allowSafetyScreen,contextIds);
      else await source.act(connection.id, safety, reason || undefined);
      feedback('success');
      thread.outbox.clear();
      if (safety === 'report') onReported?.();
      close();
    } catch (e) {
      setSafetyError(messageFor(e));
    } finally {
      setSafetyBusy(false);
    }
  }
  async function finishMatch() {
    if (ending) return;
    setEnding(true); setEndError('');
    try { await source.act(connection.id, 'cancel', undefined, allowRematch); feedback('success'); thread.outbox.clear(); onEnded?.(connection.id); close(); }
    catch (e) { setEndError(messageFor(e)); }
    finally { setEnding(false); }
  }
  function returnToChat() {
    const origin = profileIdentity.current?.querySelector<HTMLElement>('.mp-portrait');
    const swap = () => {
      flushSync(() => setProfileOpen(false));
      const button = screen.current?.querySelector<HTMLButtonElement>('.cm-chat-person');
      button?.focus({ preventScroll: true });
      return button?.querySelector<HTMLElement>('.cm-avatar') ?? null;
    };
    if (origin) profileFlight(origin, swap); else swap();
  }
  function openPartnerProfile(origin: HTMLButtonElement) {
    reading.remember(); typing.stop();
    const swap = () => { flushSync(() => setProfileOpen(true)); return profileIdentity.current?.querySelector<HTMLElement>('.mp-portrait') ?? null; };
    const avatar = origin.querySelector<HTMLElement>('.cm-avatar');
    if (avatar && (connection.person.isDemo || !source.profileVisible)) profileFlight(avatar, swap); else swap();
    void source.noteProfileOpen?.(connection.person.id).catch(() => {});
  }
  function openFamily() { reading.remember(); typing.stop(); setFamilyOpen(true); }
  if (profileOpen) return <MotionReveal distance={10} fromOpacity={1} axis="x" duration={280}><Profile source={source} person={connection.person} identity={profileIdentity} connectionId={connection.id} back={returnToChat} backText="العودة للمحادثة"/></MotionReveal>;
  if (familyOpen && source.family) return <FamilyBridgePanel initialRoom={initialRoom} initialMessage={initialMessage} source={source} connectionId={connection.id} name={connection.person.alias} onBack={() => { setFamilyOpen(false); requestAnimationFrame(() => screen.current?.querySelector<HTMLButtonElement>('.cm-guide-button')?.focus()); }}/>;
  const deepEventIndex = deepTimelineIndex(thread.rows, deepTimelineAt);
  const deepTimelineMarker = <span key="deep-analysis-timeline" ref={setDeepTimelineSlot} style={{ display: 'contents' }}/>;
  const deepTimelineNode = conversationAllowed && !thread.accessDenied && !connection.person.isDemo
    ? <DeepCompatibility key={`deep:${connection.id}`} source={source.deepAnalysis} watch={source.watch} connectionId={connection.id} peerName={connection.person.alias} open={deepOpen} onNoticeChange={onDeepNotice} onTimelineChange={onDeepTimelineChange} timelineTarget={deepTimelineSlot}
      onOpenChange={value => { typing.stop(); setDeepOpen(value); }} sheet={content => <Sheet title="تحليل وُدَين المعمّق" className="wd-deep-sheet" onClose={() => setDeepOpen(false)}>{content}</Sheet>}/>
    : null;
  return (
    <section className="cm-chat" ref={screen} data-conversation-id={connection.id} data-private-hidden={privateHidden || undefined}>
      {privateHidden && <div className="cm-chat-privacy-cover" aria-label="المحادثة مخفية أثناء مغادرة التطبيق"><LockKeyhole size={32}/><span>خصوصيتكما أولًا</span></div>}
      <header className="cm-chat-head">
        <h1 className="mi-sr-only" tabIndex={-1}>محادثة مع {connection.person.alias}</h1>
        <button className="icon-btn cm-chat-back" onClick={() => { typing.stop(); back(); }} aria-label={backLabel}><ArrowRight size={15} /></button>
        <button type="button" className="cm-chat-person" aria-label={`عرض ملف ${connection.person.alias}`} onClick={event => openPartnerProfile(event.currentTarget)}>
          <PersonAvatar person={connection.person} source={source} className="cm-avatar" />
          <span className="cm-chat-person-copy"><strong>{connection.person.alias} <VerifiedBadge claims={connection.person.manualVerifications} compact interactive={false}/> {exclusive && <ExclusiveBadge/>}</strong><small>{typing.peerTyping ? <span className="cm-typing" role="status">يكتب الآن<span className="cm-typing-dots" aria-hidden="true"><i/><i/><i/></span></span> : 'الملف الشخصي'}</small></span>
        </button>
        {voice && <CallPermissionButton source={source} connection={connection} disabled={voice.occupied || !canSend || recording} onCall={() => voice.start(connection)}/>}
        <button className="cm-guide-button" aria-label="خيارات المحادثة" aria-haspopup="dialog" onClick={() => setToolsOpen(true)}><MoreHorizontal size={21}/></button>
      </header>

      <div className="cm-chat-stage">
        {conversationAllowed && !thread.accessDenied && (exclusive || journey?.exclusiveId) && <button type="button" className="cm-chat-exclusive-status" aria-haspopup="dialog" onClick={() => setGuide(true)}>
          {exclusive ? <CheckCheck size={15} aria-hidden="true"/> : <Clock3 size={14} aria-hidden="true"/>}
          <span>{exclusive ? 'اتفقتما على التعارف الحصري' : journey?.consentMine ? 'طلب الحصرية بانتظار الموافقة' : 'لديك طلب تعارف حصري'}</span>
          <ChevronLeft size={13} aria-hidden="true"/>
        </button>}
        {!thread.accessDenied && <ThreadConnection state={thread.connectionState} retry={thread.refresh}/>}
        <div ref={setAgreementSlot} className="cm-agreement-slot"/>
        <div
          ref={log} className="cm-chat-log" role="log" tabIndex={0} aria-label="رسائل المحادثة" aria-live="polite" aria-relevant="additions"
          onScroll={(e) => {
            const el = e.currentTarget;
            atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
            if (atBottom.current) setShowLatest(false);
          }}
          onLoadCapture={()=>{if(atBottom.current && reading.positioned && log.current) log.current.scrollTop=log.current.scrollHeight;}}
        >
          {thread.loading && !thread.ready && !thread.error && <CommunitySkeleton variant="messages" label="جارٍ تحميل المحادثة…"/>}
          {thread.ready && !reading.positioned && <p className="cm-reading-restore" role="status">جارٍ الوصول إلى موضع القراءة…</p>}
          {(replyNotice || jumpToId) && <p className="cm-reply-notice" role="status">{jumpToId ? 'جارٍ الوصول إلى الرسالة الأصلية…' : replyNotice}</p>}
          {reactionError && <div className="cm-reaction-error" role="alert"><span>{reactionError}</span><button type="button" aria-label="إغلاق تنبيه التفاعل" onClick={() => setReactionError('')}><X size={16}/></button></div>}
          {thread.error && (thread.accessDenied || thread.connectionState === 'online') && <div className="cm-chat-error" data-empty={!thread.rows.length || undefined}><Banner alert text={thread.error} />
            <button className="btn-text" onClick={thread.refresh}>إعادة تحميل المحادثة</button>
            {!thread.ready && <button className="btn-text" onClick={back}>{backLabel}</button>}</div>}
          {thread.hasOlder && <button className="cm-history" disabled={thread.loadingOlder} onClick={earlier}>
            {thread.loadingOlder ? "جارٍ تحميل الرسائل…" : "تحميل رسائل أقدم"}</button>}
          {conversationAllowed && thread.ready && !thread.rows.length && <div className="cm-first-message">
            <span className="cm-first-icon"><MessageCircle size={25} aria-hidden="true" /></span>
            <h2>كل بداية، حديث</h2>
            <p>مساحة لك ولـ{connection.person.alias}. ابدأ بتحية، أو بسؤال يفتح باب المعرفة.</p>
            <button type="button" className="cm-first-starter" disabled={!canSend} onClick={() => setInsightsOpen(true)}><Sparkles size={14}/> فكرة لبداية الحديث <ChevronLeft size={13}/></button>
          </div>}
          {thread.rows.map((msg, i) => {
            const day = messageDay(msg.createdAt);
            const newDay = day && (i === 0 || day !== messageDay(thread.rows[i - 1].createdAt));
            const { status, deleted, canReply, canDelete, canReact, canReport } = messagePermissions(msg);
            const key = (msg.senderIsMe && msg.clientId) || msg.id;
            const read = msg.readByPeer || Boolean(msg.readAt);
            const messageNode = <div className="cm-message-row" data-row-id={key} data-server-id={msg.id} data-reply-highlight={highlightId === msg.id || undefined} data-actions-open={messageActionId === msg.id || undefined} tabIndex={-1} key={key}>
              {newDay && <div className="cm-chat-day"><span>{day}</span></div>}
              {msg.id === reading.firstUnreadId && <div className="cm-unread-divider" role="separator" aria-label="رسائل لم تقرأها"><span>رسائل لم تقرأها</span></div>}
              <SwipeReply disabled={!canReply} onReply={() => chooseReply(msg)} actionsDisabled={!canReport && !canReply && !canDelete && !canReact}
                actionLabel={msg.senderIsMe ? 'رسالة منك' : 'رسالة من ' + connection.person.alias} actionDescriptionId={messageActionHelp}
                onHold={() => openMessageActions(msg)}>
              <div className={"cm-bubble" + (msg.senderIsMe ? " self" : "") + (status?.status === "failed" ? " failed" : "")}
                data-composed={msg.senderIsMe && msg.clientId === composedId.current && composedId.current ? "" : undefined}>
                {!deleted && msg.reply && <button type="button" className="cm-reply-quote" aria-label="الانتقال إلى الرسالة الأصلية" onClick={() => { setReplyNotice(''); atBottom.current = false; setJumpToId(msg.reply!.id); }}>
                  <strong>{msg.reply.senderIsMe ? 'أنت' : connection.person.alias}</strong><span dir="auto">{msg.reply.deletedAt || deletedIds.has(msg.reply.id) ? "تم حذف هذه الرسالة" : msg.reply.body}</span>
                </button>}
                {deleted ? <p className="cm-deleted-message"><Ban size={16}/>تم حذف هذه الرسالة</p> : msg.attachment ? <MessageMedia source={source} requestId={connection.id} attachment={msg.attachment} senderIsMe={msg.senderIsMe}/> : <p dir="auto">{msg.body}</p>}
                <div className="cm-message-meta">
                  <time dateTime={msg.createdAt}>{day ? time.format(new Date(msg.createdAt)) : ""}</time>
                  {!deleted && msg.senderIsMe && (status?.status === "sending" ?
                    <span role="img" aria-label="جارٍ الإرسال"><Clock3 size={12} aria-hidden="true"/></span> :
                    status?.status !== "failed" && <span role="img" data-receipt={read ? 'read' : msg.deliveredAt ? 'delivered' : 'sent'} aria-label={read ? 'قُرئت' : msg.deliveredAt ? 'تم التسليم' : 'أُرسلت'}>
                      {read || msg.deliveredAt ? <CheckCheck size={14} aria-hidden="true"/> : <Check size={13} aria-hidden="true"/>}
                      <span className="cm-receipt-label">{read ? 'قُرئت' : msg.deliveredAt ? 'تم التسليم' : 'أُرسلت'}</span></span>)}
                </div>
              </div>
              {!deleted && <MessageReactions reactions={msg.reactions} self={msg.senderIsMe} name={connection.person.alias}
                pending={thread.pendingReactionIds.has(msg.id)} disabled={!canReact}
                open={() => openMessageActions(msg)} />}
              </SwipeReply>
              {status?.status === "failed" && <div className="cm-message-retry" role="status">
                <span>{status.error}</span><button disabled={!canSend} onClick={() => { composer.current?.focus({preventScroll:true}); thread.outbox.retry(status.clientId); }}><RotateCcw size={13} /> إعادة الإرسال</button>
              </div>}
            </div>;
            return i === deepEventIndex ? [deepTimelineMarker, messageNode] : messageNode;
          })}
          {deepEventIndex === thread.rows.length && deepTimelineMarker}
          {source.reportChatScreenshot&&!connection.person.isDemo&&<ChatScreenshotNotice key={'screenshot-'+connection.id} source={source} requestId={connection.id}/>}
          {deepTimelineNode}
      {conversationAllowed && !thread.accessDenied && connection.person.isDemo && source.profileReading
        ? <DemoDeepReading key={connection.id} person={connection.person} read={source.profileReading} watch={source.watch} open={deepOpen && !privateHidden} onClose={()=>setDeepOpen(false)}/>
        : null}
        </div>
        {showLatest && <MotionPressButton className="cm-jump" onClick={scrollToLatest}><ArrowDown size={15} />{connection.unreadCount ? `${ar.format(connection.unreadCount)} رسالة جديدة` : 'أحدث الرسائل'}</MotionPressButton>}
      </div>
      {source.conversationPilot && <div className="cm-chat-feedback">
        <ConversationPilotFeedback requestId={connection.id} respond={source.conversationPilot}
          expanded={openFeedback} showUnavailable={openFeedback} resumeChat={()=>composer.current?.focus()}/>
      </div>}
      {canDraft && <ChatComposer outbox={thread.outbox} composer={composer} canSend={canSend} conversationAllowed={conversationAllowed}
        typing={typing} onSubmit={submit} name={connection.person.alias}>
        <ChatMediaComposer source={source} requestId={connection.id} disabled={!canSend || Boolean(replyDraft)} callActive={Boolean(voice?.occupied)} onRecording={setRecording} sent={() => { atBottom.current = true; thread.refresh(); }}/>
      </ChatComposer>}
      <div className="cm-chat-plan" data-ready>
        {conversationAllowed && source.progress && <JourneySummary progress={journey} name={connection.person.alias} open={() => setGuide(true)}/>}
        {agreementSlot && !thread.accessDenied && <ConversationAgreement peerAlias={connection.person.alias} noticeSlot={agreementSlot} hasHistory={thread.rows.length > 0} openDetails={initialAgreement} onEnd={()=>setEndMatch(true)} onJourney={()=>setGuide(true)} source={source} requestId={connection.id} onAllowed={setConversationAllowed}/>}
        <button className="cm-end-visible" type="button" aria-label="إنهاء التعارف" onClick={() => { setEndError(''); setAllowRematch(false); setEndMatch(true); }}><span>إنهاء</span></button>
      </div>
      <span id={messageActionHelp} className="cm-message-action-help">اضغط مطولًا على الرسالة للتفاعل أو الرد أو الحذف، أو انقر بزر الفأرة الأيمن. من لوحة المفاتيح اضغط Enter أو Shift مع F10. يمكنك أيضًا سحب الرسالة للرد.</span>
      {actionMessage && hasMessageActions && !privateHidden && <MessageFocus anchor={messageActionAnchor} self={actionMessage.senderIsMe}
        label={actionMessage.attachment ? actionMessage.attachment.kind === 'photo' ? actionMessage.attachment.viewOnce ? 'صورة لمرة واحدة' : 'صورة' : 'رسالة صوتية' : actionMessage.body}
        onClose={() => setMessageActionId(null)}
        reactions={actionPermissions?.canReact ? <ReactionPicker reactions={actionMessage.reactions} pending={thread.pendingReactionIds.has(actionMessage.id)} choose={reaction => void chooseReaction(actionMessage, reaction)}/> : undefined}>
          <div className="cm-message-action-list">
            {!actionMessage.senderIsMe && source.reportIncident && <MotionPressButton onClick={()=>{setMessageActionId(null);setEvidence({id:actionMessage.id,submission:crypto.randomUUID()});setSafetyError('');setSafety('report');}}>الإبلاغ عن هذه الرسالة</MotionPressButton>}
            {actionPermissions?.canReply && <MotionPressButton onClick={() => { flushSync(() => setMessageActionId(null)); chooseReply(actionMessage); }}><Reply size={19} aria-hidden="true"/><span>الرد على الرسالة</span><ChevronLeft size={16} aria-hidden="true"/></MotionPressButton>}
            {actionPermissions?.canDelete && <MotionPressButton className="cm-message-action-delete" onClick={() => { setMessageActionId(null); setDeleteError(''); setDeleteTarget(actionMessage.id); }}><Trash2 size={18} aria-hidden="true"/><span>حذف لدى الجميع</span><ChevronLeft size={16} aria-hidden="true"/></MotionPressButton>}
          </div>
      </MessageFocus>}
      {insightsOpen && <Sheet title="حديث أقرب" onClose={() => setInsightsOpen(false)}><ChatInsights fit={connection.person.compatibilityLocked ? undefined : connection.person.fit} name={connection.person.alias} disabled={!canSend || recording} hasDraft={thread.hasDraft || Boolean(replyDraft)} usedMessages={thread.rows.filter(message => !message.deletedAt && !deletedIds.has(message.id) && !message.attachment && (!('status' in message) || message.status === 'saved')).map(message => message.body)} choose={chooseConversationPrompt}/></Sheet>}
      {libraryOpen && <ChatLibrary source={source} requestId={connection.id} name={connection.person.alias} onClose={() => setLibraryOpen(false)} onJump={id => { setLibraryOpen(false); atBottom.current = false; setJumpToId(id); }} />}
      {deleteTarget && <Sheet title="حذف الرسالة للجميع" onClose={() => { if (!deleting) setDeleteTarget(null); }}>
        <div className="cm-delete-confirm"><span className="cm-delete-emblem"><Trash2 size={25}/></span><p>تُحذف الرسالة ومرفقها من المحادثة لدى الطرفين، وتظهر مكانها عبارة «تم حذف هذه الرسالة».</p><small>متاح لرسائلك خلال ٤٨ ساعة من الإرسال. قد يكون الطرف الآخر شاهدها أو حفظ نسخة منها بالفعل.</small></div>
        {deleteError && <Banner alert text={deleteError}/>}
        <button type="button" className="btn-primary" disabled={deleting} onClick={() => void deleteForEveryone()}>{deleting ? 'جارٍ الحذف…' : 'حذف لدى الجميع'}</button>
        <button type="button" className="btn-text" disabled={deleting} onClick={() => setDeleteTarget(null)}>الاحتفاظ بالرسالة</button>
      </Sheet>}
      {toolsOpen && <Sheet title="خيارات المحادثة" onClose={() => setToolsOpen(false)}>
        <div className="cm-chat-tools">
          {canMute&&<button disabled={muting||muted===null} onClick={()=>void toggleThreadMute()}>{muted?<Volume2 size={20}/>:<VolumeX size={20}/>}<span><strong>{muted?'إلغاء كتم المحادثة':'كتم إشعارات المحادثة'}</strong><small>{muted?'ستصلك الرسائل الجديدة على جهازك.':'تبقى الرسائل داخل وُدَين من دون تنبيه على الجهاز.'}</small></span><ChevronLeft size={16}/></button>}
          {source.searchMessages && <button disabled={!canDraft} onClick={() => { setToolsOpen(false); setLibraryOpen(true); }}><Search size={20}/><span><strong>البحث والوسائط</strong><small>رسائلكما، الصور، والتسجيلات الصوتية</small></span><ChevronLeft size={16}/></button>}
          <button disabled={!conversationAllowed || thread.accessDenied} onClick={() => { setToolsOpen(false); typing.stop(); setDeepOpen(true); }}><img className="wd-deep-menu-mark" src="/brand/wudayn-emblem-v2.png" width="24" height="24" alt=""/><span><strong>تحليل وُدَين المعمّق</strong><small>طلب تحليل شخصيتكما أو متابعة تحليل سابق</small></span><ChevronLeft size={16}/></button>
          <button disabled={!conversationAllowed} onClick={() => { setToolsOpen(false); setInsightsOpen(true); }}><Sparkles size={20}/><span><strong>حديث أقرب</strong><small>ما يجمعكما وما يستحق الحديث، في سؤال</small></span><ChevronLeft size={16}/></button>
          <button onClick={()=>{setToolsOpen(false);setChatHelp(true);}}><MessageCircle size={20}/><span><strong>دليل المحادثة</strong><small>علامات الرسائل، الصور، والصوت والمكالمات</small></span><ChevronLeft size={16}/></button>
          <button onClick={() => { setToolsOpen(false); setGuide(true); }}><Sparkles size={20}/><span><strong>مسار التعارف</strong><small>مراجعة المراحل والالتزام بينكما</small></span><ChevronLeft size={16}/></button>
          {source.family&&<button onClick={() => { setToolsOpen(false); openFamily(); }}><UsersRound size={20}/><span><strong>جسر الأهل</strong><small>دعوة الأهل إلى محادثة منفصلة بموافقتكما</small></span><ChevronLeft size={16}/></button>}
          <button onClick={() => { setToolsOpen(false); setSafety('report'); }}><Flag size={20}/><span><strong>{memberAr.reportBlock}</strong><small>إرسال بلاغ للمراجعة</small></span><ChevronLeft size={16}/></button>
          <button onClick={() => { setToolsOpen(false); setSafety('block'); }}><Ban size={20}/><span><strong>{memberAr.block}</strong><small>إيقاف التواصل مع هذا العضو</small></span><ChevronLeft size={16}/></button>
        </div>
        {muteError&&<p className="form-error" role="alert">{muteError}</p>}
      </Sheet>}
      {endMatch && <Sheet title="إنهاء التعارف" onClose={() => { if (!ending) setEndMatch(false); }}>
        <p className="cm-end-copy">هل ترغب بإنهاء التعارف مع {connection.person.alias}؟ ستُغلق المحادثة ولن يتمكّن أي منكما من إرسال رسائل أو بدء مكالمات.</p>
        <p className="cm-step-note">إذا كنتما تحتاجان وقتًا أهدأ فقط، يمكنكما اقتراح العودة مرحلة من «مسار التعارف». إنهاء التعارف لا يعيد فتح المحادثات المغلقة سابقًا.</p>
        {endError && <Banner alert text={endError}/>}
        <RematchChoice checked={allowRematch} change={setAllowRematch} disabled={ending}/>
        <button className="btn-primary" disabled={ending} onClick={() => void finishMatch()}>{ending ? 'جارٍ إنهاء التعارف…' : 'تأكيد إنهاء التعارف'}</button>
        <button className="btn-text" disabled={ending} onClick={() => setEndMatch(false)}>الاستمرار في التعارف</button>
      </Sheet>}
      {chatHelp&&<HelpCenter initialTopic="chat" close={()=>setChatHelp(false)}/>}
      {safety && <SafetySheet evidence={!!evidence} contextRows={evidenceContext} action={safety} apply={moderate} busy={safetyBusy} error={safetyError}
        close={() => { if (!safetyBusy) { setSafety(null); setEvidence(null); setSafetyError(""); } }}/>}
      {guide && <ConversationGuide source={source} connection={connection} onProgress={setJourney} hasDraft={thread.hasDraft || Boolean(replyDraft) || !canSend || recording} onCompletion={onCompletion}
        openInsights={() => { setGuide(false); setInsightsOpen(true); }}
        openFamily={source.family?()=>{setGuide(false);openFamily();}:undefined}
        close={() => setGuide(false)} closed={() => { thread.outbox.clear(); onEnded?.(connection.id); close(); }}
        choose={chooseConversationPrompt}/>}
    </section>
  );
}

const categories = [
  { id: "all", label: "الكل" },
  { id: "incoming", label: "واردة" },
  { id: "outgoing", label: "مرسلة" },
  { id: "accepted", label: "المحادثات" },
] as const;
type Category = (typeof categories)[number]["id"];
const requestScrollMemory = new WeakMap<CommunitySource, Map<string, number>>();
function Requests({
  source, pushOwner,
  onChatChange,
  onMutual,
  openConversation,
  openMessage,
  openRoom,openAgreement,openAnalysis,openJourney,openInterest,openUpdate,
  openRequest,
  onConversationOpened,
  conversations = false,
  matches = false,
  initialRequest,
  onCompletion,
  discoveryUnavailable = false,
  onBrowse,
  onMatches,
}: {
  pushOwner?: string | null;
  source: CommunitySource;
  onChatChange: (chat: boolean) => void;
  onMutual: (connection: Connection) => void;
  openConversation?: string;
  openMessage?: string;
  openRoom?:string;openAgreement?:boolean;openAnalysis?:boolean;openJourney?:boolean;openInterest?:string;
  openRequest?: string;
  openUpdate?: (update:PushOpen)=>void|Promise<void>;
  onConversationOpened: () => void;
  conversations?: boolean;
  matches?: boolean;
  initialRequest?: RequestEntry;
  onCompletion?: () => void;
  discoveryUnavailable?: boolean;
  onBrowse: () => void;
  onMatches?: () => void;
}) {
  const {premium,upgrade}=useMembershipAccess();
  // Keep the entry while the inbox fetch resolves; its parent consumes the handoff on mount.
  const [messageTarget,setMessageTarget]=useState<{connection:string;message?:string;room?:string;agreement?:number;analysis?:number;journey?:number}|null>(null);
  const [entry] = useState(initialRequest);
  const initialRequestId = entry?.id;
  const [list, setList] = useState<Connection[]>([]);
  const [selected, setSelected] = useState<string | null>(initialRequestId ?? null);
  const [declineTarget, setDeclineTarget] = useState<string | null>(null);
  const [chat, setChat] = useState(false);
  const [feedbackTarget, setFeedbackTarget] = useState<string | null>(null);
  const [filter, setFilter] = useState<Category>("all");
  const [query, setQuery] = useState("");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [visitPerson, setVisitPerson] = useState<PublicPerson | null>(null);
  const [endedFeedback, setEndedFeedback] = useState<string | null>(null);
  const exitFeedback = endedFeedback && source.conversationPilot && <ConversationPilotFeedback key={endedFeedback}
    requestId={endedFeedback} respond={source.conversationPilot} resumeChat={()=>{}}/>;
  const [reportSent, setReportSent] = useState<'local'|'sent'|null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recoverable, setRecoverable] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 6500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const [busy, setBusy] = useState(false);
  const [allowRematch, setAllowRematch] = useState(false);
  const [confirm, setConfirm] = useState<
    "decline" | "cancel" | SafetyAction | null
  >(null);
  const [actionError, setActionError] = useState("");
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const sequence = useRef(0);
  const acting = useRef(false);
  const navigation = useRef(0);
  const memoryKey = matches ? 'matches' : conversations ? 'chats' : 'notifications';
  const listScroll = useRef(requestScrollMemory.get(source)?.get(memoryKey) ?? 0);
  useLayoutEffect(() => {
    if (!loading && !selected && !visitPerson) window.scrollTo({ top:listScroll.current, behavior:'instant' });
  }, [loading, selected, visitPerson]);
  useEffect(() => {
    if (loading || selected || visitPerson) return;
    const remember = () => {
      listScroll.current = window.scrollY;
      let positions = requestScrollMemory.get(source);
      if (!positions) { positions = new Map(); requestScrollMemory.set(source, positions); }
      positions.set(memoryKey, listScroll.current);
    };
    window.addEventListener('scroll', remember, {passive:true});
    return () => window.removeEventListener('scroll', remember);
  }, [source, memoryKey, loading, selected, visitPerson]);
  const focusedInitial = useRef<string | null>(null);
  const pendingRead = useRef<Promise<void> | null>(null);
  const loadedRows = useRef<Connection[]>([]);
  const inboxReadSucceeded = useRef(false);
  const dirty = useRef(false);
  const refresh = useCallback(() => {
    if (pendingRead.current) { dirty.current = true; return pendingRead.current; }
    const seq = sequence.current;
    const read = async () => {
      do {
        dirty.current = false;
        try {
          const received = await source.inbox();
          const rows = discoveryUnavailable ? received.filter(row => row.status === 'accepted') : received;
          if (seq !== sequence.current) return;
          inboxReadSucceeded.current = true;
          loadedRows.current = rows;
          discardClosedDrafts(source, new Set(rows.filter((row) => row.status === "accepted").map((row) => row.id)));
          setList(rows);
          setError("");
          setRecoverable(false);
          setSelected((current) => current && rows.some((row) => row.id === current) ? current : null);
        } catch (e) {
          if (seq !== sequence.current) return;
          setError(messageFor(e));
          setRecoverable(canRetryRead(e));
          inboxReadSucceeded.current = false;
          if (denied(e)) {
            discardClosedDrafts(source, new Set());
            loadedRows.current = [];
            setList([]); setSelected(null); setConfirm(null); setChat(false);
          }
        } finally {
          if (seq === sequence.current) setLoading(false);
        }
      } while (dirty.current && seq === sequence.current);
    };
    pendingRead.current = read().finally(() => {
      if (seq === sequence.current) pendingRead.current = null;
    });
    return pendingRead.current;
  }, [source, discoveryUnavailable]);
  useReadRecovery(recoverable, refresh, source);
  useEffect(() => {
    void refresh();
    const unwatch = source.watch(refresh);
    return () => {
      navigation.current++;
      sequence.current++;
      pendingRead.current = null;
      unwatch();
    };
  }, [refresh]);
  const item = list.find((c) => c.id === selected);
  const inChat = !!item && item.status === "accepted" && chat;
  useCapturePrivacy(item || (visitPerson && !conversations) ? null : matches ? 'profile' : 'chat');
  useLayoutEffect(() => {
    if (!initialRequestId || item?.id !== initialRequestId || inChat || focusedInitial.current === initialRequestId) return;
    const heading = document.querySelector<HTMLElement>(".mp-profile h1");
    if (heading) {
      focusedInitial.current = initialRequestId;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }, [initialRequestId, item?.id, inChat]);
  useEffect(() => {
    onChatChange(inChat);
    return () => onChatChange(false);
  }, [inChat, onChatChange]);
  useEffect(() => {
    const targetId = openConversation || openRequest;
    if (!targetId) return;
    let active = true;
    const intent = ++navigation.current;
    void refresh().then(() => {
      if (!active) return;
      if (intent !== navigation.current) { onConversationOpened(); return; }
      if (!inboxReadSucceeded.current) { onConversationOpened(); return; }
      const target = loadedRows.current.find(row => row.id === targetId && (openConversation ? row.status === "accepted" : ["pending", "accepted"].includes(row.status)));
      if (target) {
        setMessageTarget({connection:target.id,message:openMessage,room:openRoom,agreement:openAgreement?intent:undefined,analysis:openAnalysis?intent:undefined,journey:openJourney?intent:undefined});
        setSelected(target.id);
        setChat(Boolean(openConversation));
        setActionError("");
        window.scrollTo(0, 0);
      } else {
        setActionError('لم يعد هذا النشاط متاحًا.');
      }
      onConversationOpened();
    });
    return () => { active = false; };
  }, [openConversation, openRequest, openMessage, openRoom, openAgreement, openAnalysis, openJourney, refresh, onConversationOpened]);
  useLayoutEffect(() => {
    if (inChat) document.querySelector<HTMLElement>(".cm-chat-head h1")?.focus({ preventScroll: true });
  }, [inChat]);
  const closeDetail = () => {
    navigation.current++;
    setSelected(null);
    setChat(false);
    setConfirm(null);
    setActionError("");
    void refresh();
  };
  function enterChat(id: string, origin: Element | null, justAccepted = false, openFeedback = false) {
    const intent = ++navigation.current;
    chatHandoff(origin, () => {
      if (intent !== navigation.current) return;
      setFeedbackTarget(openFeedback ? id : null);
      if (justAccepted) setList(rows => rows.map(row => row.id === id ? { ...row, status: "accepted" } : row));
      setSelected(id);
      setChat(true);
      setActionError("");
      setNotice("");
      window.scrollTo(0, 0);
    }, () => ({
      marker: document.querySelector(origin?.matches("svg") ? ".cm-chat-head h1 + span svg" : ".cm-chat-head .cm-avatar"),
      focus: document.querySelector<HTMLElement>(".cm-chat-head h1"),
    }));
  }
  function fromProfile(id: string, justAccepted: boolean) {
    const avatar = document.querySelector(".mp-profile .mp-portrait");
    const rect = avatar?.getBoundingClientRect();
    const mark = rect && rect.top >= 0 && rect.bottom <= innerHeight ? avatar :
      document.querySelector(".cm-detail-actions [data-chat-entry] svg");
    enterChat(id, mark, justAccepted);
  }
  function leaveChat() {
    if (!item) { closeDetail(); return; }
    const id = item.id;
    chatHandoff(document.querySelector(".cm-chat-head .cm-avatar"), closeDetail, () => {
      window.scrollTo(0, listScroll.current);
      const row = document.querySelector<HTMLElement>('[data-request-row="' + CSS.escape(id) + '"]');
      row?.scrollIntoView({ block: "nearest" });
      return { marker: row?.querySelector(".cm-avatar") ?? null,
        focus: row ?? document.querySelector<HTMLElement>(".cm-view .cm-title h1") };
    });
  }
  async function act(
    action: "accept" | "decline" | "cancel" | SafetyAction,
    reason?: string,
    target?: Connection,
  ) {
    const request = target ?? item;
    if (!request || acting.current || (discoveryUnavailable && request.status === 'pending')) return;
    acting.current = true;
    const intent = navigation.current;
    setBusy(true);
    setActionError("");
    try {
      await source.act(request.id, action, reason || undefined, allowRematch);
      if (intent !== navigation.current) return;
      feedback('success');
      setConfirm(null);
      setDeclineTarget(null);
      setRemoveTarget(null);
      if (action === "accept") {
        setList(rows => rows.map(row => row.id === request.id ? { ...row, status: "accepted" } : row));
        const accepted = (await source.inbox()).find(row=>row.id===request.id&&row.status==='accepted');
        if (intent !== navigation.current) return;
        onMutual(accepted || { ...request, status: "accepted" });
        void refresh();
      } else {
        if (action === 'report') setReportSent(request.person.isDemo?'local':'sent');
        if (action === 'cancel' && request.status === 'accepted') setEndedFeedback(request.id);
        setSelected(null);
        setChat(false);
        setList((previous) => previous.filter((c) => c.id !== request.id));
        setNotice(
          action === "report"
            ? ""
            : action === "block"
              ? "تم حظر العضو."
              : "أُغلق الطلب.",
        );
        await refresh();
      }
    } catch (e) {
      if (intent === navigation.current) setActionError(messageFor(e));
      await refresh();
    } finally {
      acting.current = false;
      setBusy(false);
    }
  }
  if (inChat && item)
    return (
      <Chat
        key={item.id}
        pushOwner={pushOwner}
        initialRoom={messageTarget?.connection===item.id?messageTarget.room:undefined}
        initialAnalysis={messageTarget?.connection===item.id&&messageTarget.analysis}
        initialJourney={messageTarget?.connection===item.id&&messageTarget.journey}
        initialAgreement={messageTarget?.connection===item.id&&messageTarget.agreement}
        openFeedback={feedbackTarget===item.id}
        initialMessage={messageTarget?.connection===item.id?messageTarget.message:undefined}
        source={item.person.isDemo?source.demoInteractions??source:source}
        onCompletion={onCompletion}
        onReported={()=>setReportSent(item.person.isDemo?'local':'sent')}
        onEnded={setEndedFeedback}
        connection={item}
        back={leaveChat}
        close={closeDetail}
        backLabel={conversations ? "العودة للمحادثات" : matches ? "العودة للتوافقات" : "العودة للإشعارات"}
      />
    );
  if (item)
    return (
      <Profile source={item.person.isDemo?source.demoInteractions??source:source} person={item.person} connectionId={item.status==='accepted'?item.id:undefined} back={closeDetail} backText={matches?'التوافقات':'الإشعارات'} featured={entry?.id === item.id && entry.featured} primary={<>
        {actionError && <Banner alert text={actionError} />}
        {item.status === 'pending' && <RequestWaiting connection={item}/>}
        {item.status === "accepted" ? (
          <button className="btn-primary" data-chat-entry="" onClick={() => fromProfile(item.id, false)}>
            <MessageCircle size={19} /> {memberAr.openChat} <ArrowLeft className="mp-action-arrow" size={17}/>
          </button>
        ) : item.direction === "incoming" ? (
          <>
            <p className="cm-help">
              <LockKeyhole size={15} /> بعد قبول الطلب، تبدأ المراسلة عند الموافقة على شروط التعارف ومدته.
            </p>
            <button
              className="btn-primary"
              data-chat-entry=""
              disabled={busy}
              onClick={() => void act("accept")}
            >
              <Check size={19} /> {busy?'جارٍ قبول الطلب…':memberAr.acceptRequest}
            </button>
            <button
              className="btn-text"
              disabled={busy}
              onClick={() => setConfirm("decline")}
            >
              <CircleMinus size={16}/> {memberAr.declineRequest}
            </button>
          </>
        ) : (
          <>
            <p className="cm-help">طلبك بانتظار ردّ الطرف الآخر.</p>
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => {setAllowRematch(false);setConfirm("cancel");}}
            >
              <RotateCcw size={16}/> {memberAr.cancelRequest}
            </button>
          </>
        )}
      </>}>
        <div className="cm-safety">
          <button disabled={busy} onClick={() => setConfirm("report")}>
            <Flag size={15} /> {memberAr.reportBlock}
          </button>
          <button disabled={busy} onClick={() => setConfirm("block")}>
            <Ban size={15} /> {memberAr.block}
          </button>
        </div>
        {(confirm === "report" || confirm === "block") && (
          <SafetySheet
            action={confirm}
            apply={(reason) => void act(confirm, reason)}
            busy={busy}
            error={actionError}
            close={() => {
              if (!busy) setConfirm(null);
            }}
          />
        )}
        {(confirm === "decline" || confirm === "cancel") && (
          <Sheet
            title={confirm === "decline" ? "الاعتذار عن الطلب؟" : "سحب الطلب؟"}
            onClose={() => {
              if (!busy) setConfirm(null);
            }}
          >
            <p>سيُغلق طلب التعارف.</p>
            {confirm==='cancel'&&<RematchChoice checked={allowRematch} change={setAllowRematch} disabled={busy}/>}
            {actionError && <Banner alert text={actionError} />}
            <button
              className="btn-primary"
              disabled={busy}
              onClick={() => void act(confirm)}
            >
              تأكيد
            </button>
          </Sheet>
        )}
      </Profile>
    );
  if (visitPerson && !conversations) {
    const existing = list.find(row => row.person.id === visitPerson.id);
    const unavailable = discoveryUnavailable || (!existing && (visitPerson.eligible===false || visitPerson.atCapacity || visitPerson.viewerAtCapacity));
    const openOrRequest = async () => {
      if (acting.current || unavailable) return;
      acting.current = true;
      setBusy(true); setActionError('');
      const intent = navigation.current;
      const show = (connection: Connection) => {
        if (intent !== navigation.current) return;
        setVisitPerson(null); setSelected(connection.id); setChat(connection.status === 'accepted');
        setNotice(''); window.scrollTo(0, 0);
      };
      try {
        if (existing) { show(existing); return; }
        if (!premium) { upgrade(); return; }
        const id = await source.request(visitPerson.id);
        feedback('success');
        await refresh();
        const connection = loadedRows.current.find(row => row.id === id);
        if (connection) show(connection);
        else if (intent === navigation.current) setActionError('أُرسل الطلب. حدّث الإشعارات لعرض حالته.');
      } catch (error) {
        // A retry after a lost response opens the server's existing request.
        await refresh();
        const connection = loadedRows.current.find(row => row.person.id === visitPerson.id);
        if (connection) show(connection);
        else if (intent === navigation.current) setActionError(messageFor(error));
      } finally { acting.current = false; setBusy(false); }
    };
    return <Profile source={source} person={existing?.person ?? visitPerson} back={() => { navigation.current++; setVisitPerson(null); setActionError(''); }} backText="العودة للإشعارات" primary={<>
      {actionError && <Banner alert text={actionError}/>}
      <button className="btn-primary" disabled={busy || unavailable} onClick={() => void openOrRequest()}>
        {!existing && <AddPersonMark/>}
        {busy ? 'جارٍ فتح الطلب…' : existing?.status === 'accepted' ? memberAr.openChat : existing ? 'عرض طلب التعارف' : unavailable ? 'طلب التعارف غير متاح حاليًا' : premium ? memberAr.request : 'اشترك وابدأ التعارف'}
      </button>
      {!existing && !unavailable && <p className="cm-help">يفتح قبول الطرف الآخر محادثة خاصة بينكما.</p>}
    </>}/>;
  }
  if (matches) return <>
    {exitFeedback}
    {actionError && <Banner alert text={actionError}/>}
    {notice && <Banner text={notice}/>}
    <MatchesOverview source={source} connections={list} loading={loading} error={error}
    busy={busy || Boolean(discoveryUnavailable)}
    onAccept={id=>{const row=list.find(row=>row.id===id&&row.status==='pending'&&row.direction==='incoming');if(row)void act('accept',undefined,row);}}
    onDecline={id=>{setActionError('');setDeclineTarget(id);}}
    onRemove={id=>{if(!busy&&list.some(row=>row.id===id&&row.status==='accepted')){setActionError('');setAllowRematch(false);setRemoveTarget(id);}}}
    onRetry={()=>void refresh()} onBrowse={onBrowse}
    onProfile={id=>{listScroll.current=window.scrollY;navigation.current++;flushSync(()=>{setSelected(id);setChat(false);setActionError('');setNotice('');});window.scrollTo({top:0,behavior:'instant'});}}
    onConversation={(id,origin)=>{listScroll.current=window.scrollY;enterChat(id,origin);}}/>
    {removeTarget && list.some(row=>row.id===removeTarget&&row.status==='accepted') && <Sheet title="إنهاء التعارف؟" onClose={()=>{if(!busy)setRemoveTarget(null);}}>
      <p>هل ترغب بإنهاء التعارف مع {list.find(row=>row.id===removeTarget)?.person.alias}؟ ستُغلق المحادثة ولن يتمكّن أي منكما من إرسال رسائل أو بدء مكالمات.</p>
      {actionError && <Banner alert text={actionError}/>}
      <RematchChoice checked={allowRematch} change={setAllowRematch} disabled={busy}/>
      <button className="btn-primary" disabled={busy} onClick={()=>{const row=list.find(row=>row.id===removeTarget&&row.status==='accepted');if(row)void act('cancel',undefined,row);}}>{busy?'جارٍ إنهاء التعارف…':'تأكيد إنهاء التعارف'}</button>
      <button className="btn-text" disabled={busy} onClick={()=>setRemoveTarget(null)}>الاستمرار في التعارف</button>
    </Sheet>}
    {declineTarget && list.some(row=>row.id===declineTarget&&row.status==='pending'&&row.direction==='incoming') && <Sheet title="رفض طلب التعارف؟" onClose={()=>{if(!busy)setDeclineTarget(null);}}>
      <p>سيُغلق طلب التعارف.</p>
      {actionError && <Banner alert text={actionError}/>}
      <button className="btn-primary" disabled={busy || Boolean(discoveryUnavailable)} onClick={()=>{const row=list.find(row=>row.id===declineTarget&&row.status==='pending'&&row.direction==='incoming');if(row)void act('decline',undefined,row);}}>{busy?'جارٍ إغلاق الطلب…':'تأكيد الرفض'}</button>
    </Sheet>}
  </>;
  if (!conversations) return <section className="screen-content cm-view cm-notifications-view">
    <header className="cm-header"><Brand /></header>
    <h1 className="mi-sr-only" tabIndex={-1}>الإشعارات</h1>
    {exitFeedback}
    {reportSent && <ReportReceipt demo={reportSent==='local'} close={()=>setReportSent(null)}/>}
    {notice && <Banner text={notice}/>}
    <NotificationFeed pushOwner={pushOwner} openUpdate={openUpdate} initialInterest={openInterest} onIntentOpened={onConversationOpened} source={source} connections={list} loading={loading} error={error} onBrowse={onBrowse} onRetry={()=>void refresh()}
      onProfile={person => { setVisitPerson(person); void source.noteProfileOpen?.(person.id).catch(() => {}); }}
      onConversation={(id, openFeedback) => { if (list.some(row => row.id === id && row.status === 'accepted')) enterChat(id, null, false, openFeedback); else setNotice('هذا التعارف لم يعد متاحًا.'); }}
      onRequest={id => { listScroll.current = window.scrollY; navigation.current++; setSelected(id); setChat(false); setActionError(''); setNotice(''); window.scrollTo(0,0); }} />
    {error && <button className="btn-text" onClick={() => void refresh()}>إعادة المحاولة</button>}
  </section>;
  const filtered = list.filter(
    (c) => conversations ? c.status === "accepted" && (!onlyUnread || !!c.unreadCount) :
      filter === "all" ||
      (filter === "accepted"
        ? c.status === "accepted"
        : c.status === "pending" && c.direction === filter),
  );
  const search = query.trim().normalize("NFKC");
  const rows = filtered.filter((c) => !search || c.person.alias.normalize("NFKC").includes(search));
  return (
    <section className="screen-content cm-view cm-conversations-view">
      {exitFeedback}
      <ScenePaths className="df-arrival-paths" parallax />
      <header className="cm-header">
        <Brand />
      </header>
      <h1 className="mi-sr-only" tabIndex={-1}>{conversations ? "المحادثات" : "الإشعارات"}</h1>
      {pushOwner && <NativePushAction key={pushOwner} owner={pushOwner}/>}
      {reportSent && <ReportReceipt demo={reportSent==='local'} close={()=>setReportSent(null)}/>}

      {conversations ? <div className="cm-segments" role="group" aria-label="عرض المحادثات">
        <button aria-pressed={!onlyUnread} onClick={() => setOnlyUnread(false)}>الكل</button>
        <button aria-pressed={onlyUnread} onClick={() => setOnlyUnread(true)}>غير المقروءة</button>
      </div> : <div className="cm-segments" role="group" aria-label="عرض الطلبات">
        {categories.map((c) => (
          <button
            key={c.id}
            aria-pressed={filter === c.id}
            onClick={() => setFilter(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>}
      {(loading || list.length > 0 || query) && <label className="cm-inbox-search">
        <Search size={17} aria-hidden="true" />
        <input aria-label="البحث بالاسم" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="البحث بالاسم" />
      </label>}
      {notice && <Banner text={notice} />}
      {loading && !error && !list.length && <CommunitySkeleton variant="conversations" label={conversations ? 'جارٍ تحميل المحادثات…' : 'جارٍ تحميل الطلبات…'}/>}
      {error && (
        <>
          <Banner alert text={error} />
          <button className="btn-secondary" onClick={() => void refresh()}>
            إعادة المحاولة
          </button>
        </>
      )}
      {!loading && !error && !rows.length && (
        <Panel
          icon={<InboxIcon />}
          title={
              search ? "لا توجد نتائج" : conversations && onlyUnread ? "قرأت جميع الرسائل" : conversations || filter === "accepted" ? "لا توجد محادثات بعد" : "لا توجد طلبات هنا"
          }
          description={
            search ? "جرّب اسمًا آخر أو امسح البحث." : conversations && onlyUnread ? undefined : conversations || filter === "accepted"
              ? "اختر ملفًا مناسبًا وأرسل طلب تعارف. تبدأ المراسلة بعد قبول الطلب والموافقة على شروط التعارف ومدته."
              : memberAr.requestsEmpty
          }
          action={search ? <button className="btn-secondary" onClick={() => setQuery('')}>مسح البحث</button> :
            conversations && onlyUnread ? <button className="btn-secondary" onClick={() => setOnlyUnread(false)}>عرض كل المحادثات</button> :
            conversations && list.some(row => row.status === 'pending') && onMatches ? <button className="btn-secondary" onClick={onMatches}>متابعة طلبات التعارف</button> :
            <button className="btn-secondary" onClick={onBrowse}>{discoveryUnavailable ? 'مراجعة حالة الترشيحات' : 'الذهاب إلى الاستكشاف'}</button>}
        />
      )}
      <div className="cm-list" aria-busy={loading} aria-label={conversations ? 'المحادثات المقبولة' : 'طلبات التعارف'}>
        {rows.map((row) => (
          <button
            className="cm-request"
            key={row.id}
            data-request-row={row.id}
            onClick={event => {
              listScroll.current = window.scrollY;
              if (row.status === "accepted") {
                enterChat(row.id, event.currentTarget.querySelector(".cm-avatar"));
                return;
              }
              navigation.current++;
              setSelected(row.id);
              setChat(false);
              setActionError("");
              setNotice("");
              window.scrollTo(0, 0);
            }}
            aria-label={`${row.status === "accepted" ? "فتح محادثة" : "عرض طلب"} ${row.person.alias}`}
            aria-describedby={row.unreadCount ? "unread-" + row.id : undefined}
          >
            <PersonAvatar person={row.person} source={source} className="cm-avatar" />
            <div className="cm-request-copy">
              <strong>{row.person.alias} <VerifiedBadge claims={row.person.manualVerifications} compact interactive={false}/> {row.person.exclusive && <ExclusiveBadge/>}</strong>
              <span className="cm-inbox-preview">
                {row.status === "accepted"
                  ? row.lastMessage ? (row.lastMessage.senderIsMe ? "أنت: " : "") + row.lastMessage.body : "ابدأ المحادثة"
                  : row.direction === "incoming"
                    ? "طلب تعارف وارد"
                    : "بانتظار الرد"}
              </span>
            </div>
            {row.status === "accepted" ? (
              <div className="cm-inbox-meta">
                {row.lastMessage && messageDay(row.lastMessage.createdAt) && <time dateTime={row.lastMessage.createdAt}>{messageDay(row.lastMessage.createdAt) === messageDay(new Date().toISOString()) ? time.format(new Date(row.lastMessage.createdAt)) : dateLabel.format(new Date(row.lastMessage.createdAt))}</time>}
                {!!row.unreadCount ? <><span className="cm-unread" aria-hidden="true">{ar.format(row.unreadCount)}</span>
                  <span className="mi-sr-only" id={"unread-" + row.id}>رسائل غير مقروءة: {ar.format(row.unreadCount)}</span></> : <MessageCircle className="cm-request-icon" size={17} />}
              </div>
            ) : (
              <ChevronLeft className="cm-chevron" size={18} />
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

export function Community(props: CommunityProps) {
  const [chat, setChat] = useState(false);
  const [requestToOpen, setRequestToOpen] = useState<RequestEntry>();
  const [conversationToOpen, setConversationToOpen] = useState<string>();
  const { tab, source, onTab, onAccount, onHome, paused, onResume } = props;
  const discoveryUnavailable = paused || Boolean(props.profileReviewPending);
  useEffect(() => {
    if (tab === "inbox" && requestToOpen) setRequestToOpen(undefined);
  }, [tab, requestToOpen]);
  return (
    <main className="app-screen cm-shell" dir="rtl" data-community-tab={tab} data-viewer-gender={props.viewerGender}>
      {discoveryUnavailable && tab === 'discover' ? (
        <section className="screen-content cm-view">
          <header className="cm-header">
            <Brand />
          </header>
          <Panel
            title={props.profileReviewPending ? 'تحديث ملفك قيد المراجعة' : 'الترشيحات متوقفة مؤقتًا'}
            description={props.profileReviewPending ? 'تعود الترشيحات وطلبات التعارف الجديدة بعد اعتماد التحديث. محادثاتك المقبولة مستمرة.' : 'ملفك مخفي عن الترشيحات وطلبات التعارف الجديدة متوقفة. محادثاتك المقبولة مستمرة.'}
            icon={<Pause />}
            action={
              <><button className="btn-primary" onClick={() => onTab('chats')}>متابعة محادثاتي</button><button className="btn-text" onClick={props.profileReviewPending ? onAccount : onResume}>{props.profileReviewPending ? 'متابعة حالة الملف' : 'استئناف الترشيحات'}</button></>
            }
          />
        </section>
      ) : tab === "discover" ? (
        <Discovery source={source} onAccount={onAccount} profileSaved={props.profileSaved} onBeena={props.onBeena} beenaAnswered={props.beenaAnswered} onInbox={entry => { setRequestToOpen(entry); onTab("inbox"); }} onConversation={id=>{setConversationToOpen(id);onTab('chats');}} />
      ) : (
        <Requests key={tab} pushOwner={props.pushOwner} source={source} onChatChange={setChat} conversations={tab === "chats"} matches={tab === 'curated'}
          onBrowse={() => onTab('discover')}
          onMatches={() => onTab('curated')}
          discoveryUnavailable={discoveryUnavailable} onCompletion={props.onCompletion}
          onMutual={props.onMutual} openConversation={props.openConversation??conversationToOpen}
          openRoom={props.openRoom} openAgreement={props.openAgreement} openAnalysis={props.openAnalysis} openJourney={props.openJourney} openInterest={props.openInterest}
          openMessage={props.openMessage}
          openRequest={props.openRequest} openUpdate={props.openUpdate}
          onConversationOpened={()=>{setConversationToOpen(undefined);props.onConversationOpened();}}
          initialRequest={tab === "inbox" ? requestToOpen : undefined} />
      )}
      {(!chat || tab === "discover") && (
        <MemberTabs
          active={tab === 'curated' ? 'home' : tab}
          onHome={onHome}
          onDiscover={() => onTab("discover")}
          onInbox={() => onTab("inbox")}
          onChats={props.onChats ?? (() => onTab("chats"))}
          source={source}
          chatUnread={props.chatUnread}
          onAccount={onAccount}
        />
      )}
    </main>
  );
}
import {WhyWudayn} from '../WhyWudayn';
