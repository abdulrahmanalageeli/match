import { VerifiedBadge } from '../verification/VerifiedBadge';
import { ScenePaths } from '../ScenePaths';
import { MotionPressButton, MotionReveal } from '../motion/Reanimated';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
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
import { recommendationReason } from './recommendationReason';
import { canRetryRead } from './readRecovery';
import { useReadRecovery } from './useReadRecovery';
import { ThreadConnection } from './ThreadConnection';
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
  Eye,
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
  X,
} from "lucide-react";
import { Brand } from "../Brand";
import { MemberTabs } from "../Home";
import { interests } from "../compatibility/model";
import { marriageTimelineLabels } from "../compatibility/marriage";
import { cityOptions, nationalityChoices, canonicalCity, canonicalNationality, educationOptions, professionOptions, numericOptions } from '../profile/profileOptions';
import { ChoiceSelect } from '../ui/ChoiceSelect';
import { FitDetails, preferencePercentage, personalityPercentage } from "../compatibility/FitDetails";
import { BeenaSummary } from "../beena/BeenaSummary";
import { AvatarPortrait } from "../avatars/AvatarPortrait";
import { PersonAvatar } from "../avatars/PersonAvatar";
import { MatchesOverview } from './MatchesOverview';
import { dressStyles, type PublicAvatar } from "../compatibility/appearance";
import type { StepProgress } from "./data";
import { journeyStages } from '../notifications/ActivityAlerts';
import { NotificationFeed } from '../notifications/NotificationFeed';
import './chat-polish.css';
import './message-actions.css';
import './directory.css';
import { MemberProfile as Profile } from '../profile/MemberProfile';
import { PortraitPhoto } from '../photos/PortraitPhoto';
import { HelpButton, HelpCenter } from '../help/HelpCenter';
import { SupportContact } from '../help/SupportContact';
import { SuccessNotice } from './SuccessNotice';
import { RequestHistory } from './RequestHistory';
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
import { ConversationAgreement } from "./ConversationAgreement";
import { useReadPosition } from "./useReadPosition";
import { useVoiceCalls } from "../voice/VoiceCalls";
import { chatHandoff } from "./chatMotion";
import { PhotoSharing } from "../photos/Photos";
import { useWeeklyCardTransition } from "./useWeeklyCardTransition";
import "./community.css";
import "./weeklyCards.css";
import "./discovery.css";
import "./journey.css";
import './chat-continuity.css';

type Tab = "discover" | "curated" | "inbox" | "chats";
type CommunityProps = {
  onMutual: (connection: Connection) => void;
  openConversation?: string;
  openRequest?: string;
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
const reportCategories = ['إساءة أو ضغط غير مرغوب', 'انتحال أو معلومات مضللة', 'طلب أموال أو احتيال', 'انتهاك الخصوصية', 'محتوى غير مناسب', 'سبب آخر'];
const practicalQuestions = [
  ['السكن والمدينة', 'أين تتصور أن نستقر، وهل سيكون السكن مستقلًا؟ وما حدود المرونة في الانتقال؟'],
  ['تكاليف الزواج والمال', 'كيف نناقش المهر وتكاليف الزواج والميزانية بما يناسب ظروفنا، دون ضغط على أي منا؟'],
  ['العمل ومسؤوليات البيت', 'كيف تتصور عمل كل منا وتقاسم مسؤوليات البيت، خصوصًا عند ضغط العمل؟'],
  ['الأهل والخصوصية', 'كيف نوازن بين صلة الأهل وخصوصية بيتنا، ومن نرغب بإشراكه في الخطوة القادمة؟'],
  ['الأطفال والمسؤوليات السابقة', 'ما تصورك للأطفال وتوقيتهم؟ وإن كانت لأحدنا مسؤوليات أسرية سابقة، كيف نحترمها معًا؟'],
  ['الوتيرة والحدود', 'ما وتيرة التواصل التي تريحك؟ وما الذي تحتاج أن تعرفه قبل الخطوة العائلية أو الالتزام الحصري؟'],
];

function ProfileVisitNotice({ interest = false, compact = false }: { interest?: boolean; compact?: boolean }) {
  if (compact) return <p className="cm-awareness"><Eye size={16} aria-hidden="true"/><span>قد تظهر زيارتك لصاحب الملف.{interest && ' زر «مهتم» يرسل إشعارًا، ولا يفتح محادثة.'}</span></p>;
  return <p className="cm-awareness"><Eye size={18} aria-hidden="true"/><span>فتح الملف قد يُظهر لصاحبه زيارة باسمك.{interest && ' زر «مهتم» يرسل إشعارًا باهتمامك؛ لا يحفظ الملف بشكل خاص.'} الزيارة والاهتمام لا يفتحان محادثة.</span></p>;
}

function ReportReceipt({ demo, close }: { demo: boolean; close: () => void }) {
  return <div className="cm-report-receipt"><SuccessNotice title={demo ? 'اكتملت محاكاة البلاغ' : 'أُرسل بلاغك للمراجعة'} detail={demo ? 'هذا بلاغ تجريبي عن شخصية توضيحية.' : 'اكتمل إرسال البلاغ. يمكنك مراسلة الفريق إذا احتجت متابعة.'} close={close}/>{!demo && <SupportContact subject="متابعة بلاغ في نصفين" context="للمتابعة، اذكر اسم العرض والتاريخ التقريبي للبلاغ. تجنّب إرسال صور الهوية أو تفاصيل خاصة لا تحتاجها المتابعة."/>}</div>;
}

function RequestWaiting({ connection }: { connection: Connection }) {
  const sentDate = connection.createdAt && messageDay(connection.createdAt);
  const expiryDate = connection.expiresAt && messageDay(connection.expiresAt);
  return <div className="cm-request-waiting"><strong>{connection.direction === 'outgoing' ? 'الخطوة التالية لدى الطرف الآخر' : 'هذه دعوة للتعارف، والقرار لك'}</strong>{sentDate && <p>أُرسل الطلب في <time dateTime={connection.createdAt}>{sentDate}</time>.</p>}{expiryDate && <p>تنتهي مهلة الرد في <time dateTime={connection.expiresAt}>{expiryDate}، {time.format(new Date(connection.expiresAt!))}</time>. بعدها ينتقل الطلب إلى السجل المغلق.</p>}<p>{connection.direction === 'outgoing' ? 'يظهر الرد في الإشعارات داخل التطبيق. تأخر الرد وحده لا يوضح سبب الانتظار، ويمكنك سحب طلبك متى شئت.' : 'يمكنك قراءة الملف ثم القبول أو الاعتذار. قبول الطلب يفتح المحادثة، ولا يعني الالتزام الحصري.'}</p><small>تنبيهات الويب تظهر أثناء فتحه؛ إشعارات iPhone تعتمد على تفعيل الخدمة وإذن جهازك.</small></div>;
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
function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      dir="rtl"
      aria-label={title}
      className="cm-sheet"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="إغلاق">
          <X />
        </button>
      </header>
      {children}
    </dialog>
  );
}

function FilterSheet({
  filters,
  apply,
  close,
}: {
  filters: Filters;
  apply: (next: Filters) => void;
  close: () => void;
}) {
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
      ...extra, offset: undefined, afterId: undefined,
      excludeCities:excludedCities,excludeNationalities:excludedNationalities,
      minAge: min ? Number(min) : undefined,
      maxAge: max ? Number(max) : undefined,
      interest: interest || undefined,
    });
  }
  return (
    <Sheet title="مساحة تناسب اختياراتك" onClose={close}>
      <form className="cm-filter dr-filter-form" onSubmit={submit}>
        <p className="dr-filter-intro">اختر ما تريد رؤيته، وأخفِ ما لا يناسبك. هذه الفلاتر تخص الاستكشاف ولا تغيّر تفضيلات ملفك.</p>
        <fieldset>
          <legend>العمر</legend>
          <div className="cm-age-fields">
            <label>
              من
              <input
                type="number"
                inputMode="numeric"
                min={18}
                max={110}
                placeholder="١٨"
                value={min}
                onChange={(e) => setMin(e.target.value)}
              />
            </label>
            <label>
              إلى
              <input
                type="number"
                inputMode="numeric"
                min={18}
                max={110}
                placeholder="١١٠"
                value={max}
                onChange={(e) => setMax(e.target.value)}
              />
            </label>
          </div>
        </fieldset>
        <label>
          اهتمام مشترك
          <select
            value={interest}
            onChange={(e) => setInterest(e.target.value)}
          >
            <option value="">كل الاهتمامات</option>
            {interests.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <ChoiceSelect label="المدينة" value={extra.city??''} options={cityOptions} placeholder="كل المدن" allowClear onChange={city=>setExtra(current=>({...current,city:city||undefined}))}/>
        <details className="dr-filter-section" open={!!(extra.education||extra.profession||extra.children)}><summary><span>الدراسة والعمل والعائلة</span><ChevronLeft size={15}/></summary><div className="dr-filter-fields">
          <ChoiceSelect label="المؤهل التعليمي" value={extra.education??''} options={educationOptions} placeholder="كل المؤهلات" allowClear onChange={education=>setExtra(current=>({...current,education:education||undefined}))}/>
          <ChoiceSelect label="مجال العمل أو الوضع المهني" value={extra.profession??''} options={professionOptions} placeholder="كل المجالات" allowClear onChange={profession=>setExtra(current=>({...current,profession:profession||undefined}))}/>
          <label>الأبناء<select value={extra.children??''} onChange={event=>setExtra(current=>({...current,children:event.target.value as Filters['children']||undefined}))}><option value="">بدون تحديد</option><option value="none">ليس لديه / لديها أبناء</option><option value="has">لديه / لديها أبناء</option></select></label>
          <small>عند اختيار شرط، يظهر فقط من ذكر معلومة تطابقه. هذه الفلاتر لا تعدّل تفضيلات التوافق الخاصة بك.</small>
        </div></details>
        <details className="dr-filter-section" open={[extra.minHeight,extra.maxHeight,extra.minWeight,extra.maxWeight].some(value=>value!==undefined)}><summary><span>الطول والوزن</span><ChevronLeft size={15}/></summary><div className="dr-filter-fields">
          {([{label:'الطول',minKey:'minHeight',maxKey:'maxHeight',options:filterHeightOptions},{label:'الوزن',minKey:'minWeight',maxKey:'maxWeight',options:filterWeightOptions}] as const).map(({label,minKey,maxKey,options})=><div className="cm-age-fields" key={label}>
            <ChoiceSelect label={label+' من'} value={extra[minKey]?.toString()??''} options={options.filter(option=>extra[maxKey]===undefined||Number(option.value)<=extra[maxKey]!)} placeholder="دون حد أدنى" allowClear onChange={value=>setExtra(current=>({...current,[minKey]:value?Number(value):undefined}))}/>
            <ChoiceSelect label={label+' إلى'} value={extra[maxKey]?.toString()??''} options={options.filter(option=>extra[minKey]===undefined||Number(option.value)>=extra[minKey]!)} placeholder="دون حد أعلى" allowClear onChange={value=>setExtra(current=>({...current,[maxKey]:value?Number(value):undefined}))}/>
          </div>)}
          <small>تُستبعد الإجابات غير المذكورة عند تحديد نطاق.</small>
        </div></details>
        <div className="cm-age-fields"><label>الحالة الاجتماعية<select value={extra.maritalStatus??''} onChange={e=>setExtra({...extra,maritalStatus:e.target.value})}><option value="">الكل</option><option value="never_married">لم يسبق الزواج</option><option value="divorced">مطلق / مطلقة</option><option value="widowed">أرمل / أرملة</option></select></label>
        <label>التدخين<select value={extra.smoking??''} onChange={e=>setExtra({...extra,smoking:e.target.value})}><option value="">الكل</option><option value="never">لا يدخّن</option><option value="sometimes">أحيانًا</option><option value="yes">يدخّن</option></select></label></div>
        <label>غطاء الرأس<select value={extra.dressStyle??''} onChange={e=>setExtra({...extra,dressStyle:e.target.value})}><option value="">بدون تحديد</option>{dressStyles.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
        <label>الموقف من عمل الزوجة<select value={extra.work??''} onChange={e=>setExtra({...extra,work:e.target.value})}><option value="">بدون تحديد</option><option value="A">تفضيل العمل</option><option value="B">تفضيل عدم العمل</option><option value="C">المرونة حسب الاتفاق</option></select></label>
        <label>توافق التفضيلات<select value={extra.minFit??0} onChange={e=>setExtra({...extra,minFit:Number(e.target.value)})}><option value={0}>كل مستويات التوافق</option><option value={60}>٦٠٪ فأعلى</option><option value={75}>٧٥٪ فأعلى</option><option value={90}>٩٠٪ فأعلى</option></select><small>تظهر النسبة عند اكتمال التقييمين فقط.</small></label>
        <label className="dr-availability"><input type="checkbox" checked={!!extra.availableOnly} onChange={e=>setExtra({...extra,availableOnly:e.target.checked})}/> متاح لطلب تعارف جديد الآن</label>
        <label className="dr-availability"><input type="checkbox" checked={!!extra.onlineOnly} onChange={e=>setExtra({...extra,onlineOnly:e.target.checked})}/> نشط الآن فقط</label>
        <details className="dr-filter-section" open={!!(extra.nationality||extra.tribalBackground)}><summary><span>الجنسية والخلفية القبلية</span><ChevronLeft size={15}/></summary><div className="dr-filter-fields">
          <ChoiceSelect label="الجنسية المطلوبة" value={extra.nationality??''} options={nationalityChoices} placeholder="كل الجنسيات" allowClear onChange={nationality=>setExtra(current=>({...current,nationality:nationality||undefined}))}/>
          <label>الخلفية القبلية<select value={extra.tribalBackground??''} onChange={event=>setExtra({...extra,tribalBackground:event.target.value})}><option value="">الجميع</option><option value="tribal">قبلي</option><option value="non_tribal">غير قبلي</option><option value="prefer_not_to_say">لم يذكر الخلفية</option></select></label>
        </div></details>
        <details className="dr-filter-section dr-filter-exclusions" open={!!(excludedCities.length||excludedNationalities.length||extra.excludeTribalBackgrounds?.length||extra.excludeSmoking?.length||extra.excludeMaritalStatuses?.length)}><summary><span><Ban size={15}/> ما لا أرغب برؤيته</span><ChevronLeft size={15}/></summary><div className="dr-filter-fields">
          <p>الاستبعاد يتقدّم على التصفية؛ الملفات المطابقة لا تظهر لك.</p>
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
          <fieldset><legend>إخفاء حسب الخلفية القبلية</legend><div className="dr-exclusion-options">{[['tribal','قبلي'],['non_tribal','غير قبلي'],['prefer_not_to_say','لم يذكر الخلفية']].map(([value,label])=><label key={value}><input type="checkbox" checked={!!extra.excludeTribalBackgrounds?.includes(value)} onChange={()=>toggleExcluded('excludeTribalBackgrounds',value)}/>{label}</label>)}</div></fieldset>
          <fieldset><legend>إخفاء حسب التدخين</legend><div className="dr-exclusion-options">{[['never','لا يدخّن'],['sometimes','أحيانًا'],['yes','يدخّن']].map(([value,label])=><label key={value}><input type="checkbox" checked={!!extra.excludeSmoking?.includes(value)} onChange={()=>toggleExcluded('excludeSmoking',value)}/>{label}</label>)}</div></fieldset>
          <fieldset><legend>إخفاء حسب الحالة الاجتماعية</legend><div className="dr-exclusion-options">{[['never_married','لم يسبق الزواج'],['divorced','مطلق / مطلقة'],['widowed','أرمل / أرملة']].map(([value,label])=><label key={value}><input type="checkbox" checked={!!extra.excludeMaritalStatuses?.includes(value)} onChange={()=>toggleExcluded('excludeMaritalStatuses',value)}/>{label}</label>)}</div></fieldset>
        </div></details>
        {error && <Banner alert text={error} />}
        <button className="btn-primary" type="submit">
          تطبيق التصفية
        </button>
        <button
          className="btn-text"
          type="button"
          onClick={() => apply(emptyFilters)}
        >
          مسح التصفية
        </button>
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

function compatibilityPercentage(person: PublicPerson) {
  return preferencePercentage(person.fit);
}

function CompatibilityPill({ person }: { person: PublicPerson }) {
  const percentage = compatibilityPercentage(person);
  return <span className={"df-compatibility" + (percentage === null ? " pending" : "")}
    aria-label={percentage === null ? "توافق التفضيلات ينتظر اكتمال التقييمين" : `توافق التفضيلات ${ar.format(percentage)} بالمئة، بناءً على التقييمين`}>
    <Sparkles size={14} aria-hidden="true" />
    {percentage === null ? <span>التفضيلات قيد الاكتمال</span> : <><strong>{ar.format(percentage)}<small>٪</small></strong><span>توافق التفضيلات</span></>}
  </span>;
}

function DiscoveryPortrait({ person, source, priority = false, heading = false }: { person: PublicPerson; source: CommunitySource; priority?: boolean; heading?: boolean }) {
  const [failed, setFailed] = useState(false);
  const avatar = person.publicAvatar;
  const photo = !avatar && person.demoPhoto?.startsWith("/demo/portraits/") && !failed ? person.demoPhoto : undefined;
  return <>
    {person.portrait ? <PortraitPhoto portrait={person.portrait} source={source} className="df-portrait-image" alt={`الصورة الشخصية لـ ${person.alias}`} /> : avatar ? <AvatarPortrait avatar={avatar} className="df-selected-avatar" /> : photo ? <img className="df-portrait-image" src={photo} width="1122" height="1402"
      loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async"
      alt={`صورة مولّدة لشخصية ${person.alias} التوضيحية`} onError={() => setFailed(true)} /> :
      <div className="df-portrait-placeholder" aria-hidden="true"><WeeklyContours /><Avatar name={person.alias} large /></div>}
    <div className="df-portrait-shade" aria-hidden="true" />
    <div className="df-portrait-badges"><CompatibilityPill person={person} />
      {!(person.isDemo&&source.simulation)&&<span className="df-photo-label">{person.isDemo ? photo ? 'شخصية توضيحية · صورة مولّدة' : 'حساب توضيحي' : person.portrait ? person.portrait.blur > 0 ? "صورة مع تمويه اختياري" : "صورة شخصية" : avatar ? "صورة رمزية" : photo ? "شخصية توضيحية · صورة مولّدة" : <><LockKeyhole size={12} /> الصور تُشارك بخصوصية</>}</span>}
    </div>
    <div className="df-portrait-identity"><span className="df-intention"><Heart size={12} />{person.marriageIntent || "تعارف بقصد الزواج"}</span>
      <div className="df-identity-line">{heading ? <h1>{person.alias}</h1> : <h2>{person.alias}</h2>}{Number.isInteger(person.age)&&person.age>=18&&person.age<=110&&<span>{ar.format(person.age)}</span>}<VerifiedBadge claims={person.manualVerifications} compact interactive={false}/>{person.exclusive && <small className="cm-exclusive-badge">تعارف حصري</small>}</div>
      <div className="df-identity-meta">{person.city && <span><MapPin size={14} />{person.city}</span>}
        {person.occupation && <span><BriefcaseBusiness size={14} />{person.occupation}</span>}</div>
    </div>
  </>;
}

function PersonCard({
  person,
  source,
  open,
  priority = false,
  compact = false,
  index = 0,
}: {
  compact?: boolean; index?: number;
  person: PublicPerson;
  source: CommunitySource;
  open: (button: HTMLButtonElement) => void;
  priority?: boolean;
}) {
  return (
    <MotionPressButton
      className={"cm-person df-person"+(compact?" dr-compact":"")}
      style={{animationDelay: `${Math.min(index,7)*45}ms`}}
      onClick={event => open(event.currentTarget)}
      data-weekly-person={person.id}
      aria-label={`عرض ملف ${person.alias}`}
    >
      <div className="cm-person-top cm-weekly-identity df-card-portrait">
        <DiscoveryPortrait person={person} source={source} priority={priority} />
      </div>
      <div className="df-card-copy">
      {compact && <span className="dr-card-state" data-full={person.atCapacity||undefined}><i/>{person.connectionStatus === "accepted" ? "تعارف متبادل" : person.connectionStatus === "pending" ? "طلب قيد الانتظار" : person.atCapacity ? "مكتمل التعارف حاليًا" : "متاح للتعارف"}</span>}
      {person.bio && <p className="cm-person-bio" dir="auto">{person.bio}</p>}
      {!compact && <p className="df-card-reason"><Sparkles size={13} aria-hidden="true"/><span>{recommendationReason(person.fit)}</span></p>}
      {person.fit?.beena?.complete && <BeenaSummary fit={person.fit.beena} compact/>}
      <span className="df-card-footer"><span>{person.interests.slice(0, 2).map(safeInterest).join(" · ") || "تعارف بقصد الزواج"}</span>
        <span className="df-open-profile">الملف الكامل <ArrowLeft size={17} /></span></span>
      </div>
    </MotionPressButton>
  );
}

function DirectoryRow({person,source,open,explain,request,interest,dismiss,report,busy}:{person:PublicPerson;source:CommunitySource;open:(button:HTMLButtonElement)=>void;explain:()=>void;request:()=>void;interest:()=>void;dismiss:()=>void;report:()=>void;busy:boolean}) {
  const preference=compatibilityPercentage(person);
  const personality=personalityPercentage(person.fit);
  const timeline=person.marriageBasics?.marriageTimeline;
  const status=person.online===true?'متصل الآن':person.online===false?'غير متصل':'حالة الاتصال غير متاحة';
  return <article className="dr-person-row" aria-label={`ملف ${person.alias}`}>
    <div className="dr-row-overview">
      <button className="dr-row-profile" data-weekly-person={person.id} onClick={event=>open(event.currentTarget)} aria-label={`عرض ملف ${person.alias} · ${status}`}>
        <span className="cm-weekly-identity dr-row-avatar" title={status}>
          <span className="dr-row-image">{person.portrait?<PortraitPhoto portrait={person.portrait} source={source} alt={`الصورة الشخصية لـ ${person.alias}`}/>:person.demoPhoto?<img src={person.demoPhoto} loading="lazy" alt={`صورة توضيحية لـ ${person.alias}`}/>:person.publicAvatar?<AvatarPortrait avatar={person.publicAvatar}/>:<Avatar name={person.alias}/>}</span>
          <span className="dr-presence" data-status={person.online===true?'online':person.online===false?'offline':'unknown'} aria-label={status}/>
        </span>
        <span className="dr-row-identity"><span className="dr-row-name"><strong>{person.alias}</strong><VerifiedBadge claims={person.manualVerifications} compact interactive={false}/>{Number.isInteger(person.age)&&person.age>=18&&person.age<=110&&<span>{ar.format(person.age)}</span>}</span><span className="dr-row-meta">{person.city} {person.isDemo&&!source.simulation&&<span className="nf-demo-tag">توضيحي</span>}</span><span className="dr-row-occupation">{person.occupation}</span></span>
      </button>
      <button type="button" className="dr-row-fit" disabled={!person.fit} onClick={explain} aria-label={`فهم التوافق مع ${person.alias}`} title="اضغط لفهم نسب التوافق">
        <span className="dr-score dr-score-preference" title={preference===null?'توافق التفضيلات: التقييم غير مكتمل':'توافق تفضيلات الطرفين'}><strong>{preference===null?'—':<>{ar.format(preference)}<small>٪</small></>}</strong><span>التفضيلات</span></span>
        <span className="dr-score dr-score-personality" title={personality==null?'انسجام الشخصية: التقييم غير مكتمل':'انسجام الشخصية'}><strong>{personality==null?'—':<>{ar.format(personality)}<small>٪</small></>}</strong><span>الشخصية</span></span>
      </button>
    </div>
    <div className="dr-row-summary">
      <p className="dr-row-bio" dir="auto">{person.bio||'اكتشف التفاصيل التي اختار مشاركتها في ملفه.'}</p>
      {timeline&&marriageTimelineLabels[timeline]&&<span className="dr-row-timeline" title={`التوقيت المرغوب لإتمام الزواج: ${marriageTimelineLabels[timeline]}، عند العثور على الشخص المناسب`}><Clock3 size={12} aria-hidden="true"/><span>الزواج {timeline==='when_ready'?'حسب التوافق':marriageTimelineLabels[timeline]}</span></span>}
      {person.fit?.beena?.complete && <BeenaSummary fit={person.fit.beena} compact/>}
    </div>
    <div className="dr-row-actions">
      <button className="dr-row-request" onClick={request} disabled={busy||(!person.connectionId&&(person.atCapacity||person.viewerAtCapacity))} title={!person.connectionId&&(person.atCapacity||person.viewerAtCapacity)?'الحد الأقصى تعارفان متزامنان':undefined}><Send size={14}/>{person.connectionId?person.connectionStatus==='accepted'?'المحادثة':'عرض الطلب':'طلب تعارف'}</button>
      <button className="dr-row-interest" onClick={interest} disabled={busy} aria-pressed={!!person.interested} aria-label={`${person.interested?'إلغاء الاهتمام بـ':'مهتم بـ'} ${person.alias}`} title="يصل للطرف الآخر إشعار باهتمامك"><Heart size={16} fill={person.interested?'currentColor':'none'}/><span>مهتم</span></button>
      <button className="dr-row-dismiss" onClick={dismiss} disabled={busy} aria-label={`غير مهتم بـ ${person.alias}`}><EyeOff size={15}/><span>غير مهتم</span></button>
      <button className="dr-row-report" onClick={report} disabled={busy} aria-label={`الإبلاغ عن ${person.alias}`} title="إبلاغ"><Flag size={15}/></button>
    </div>
  </article>;
}

type RequestEntry = { id: string; featured: boolean };

function Discovery({
  source,
  onInbox,
  onConversation,
  onAccount,
  profileSaved = false,
  onBeena, beenaAnswered = 0,
}: {
  source: CommunitySource;
  onAccount: () => void;
  profileSaved?: boolean;
  onBeena?: () => void;
  beenaAnswered?: number;
  onInbox: (entry: RequestEntry) => void;
  onConversation: (id: string) => void;
}) {
  const [remembered] = useState(() => readBrowseMemory(source));
  const restoreBrowse = useRef<typeof remembered | null>(remembered.scroll > 0 ? remembered : null);
  const [filters, setFilters] = useState<Filters>(remembered.filters);
  const [order, setOrder] = useState<"recommended" | "all">(remembered.order);
  const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState(remembered.query);
  const [availability, setAvailability] = useState<NextStepState>({loaded:false,acceptedCount:0,exclusive:false,pendingIncomingCount:0});
  const [recoverable, setRecoverable] = useState(false);
  const [hiddenNotice, setHiddenNotice] = useState('');
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(()=>{const timer=window.setTimeout(()=>setFilters(f=>f.search===query?f:{...f,search:query}),250);return()=>clearTimeout(timer);},[query]);
  const [list, setList] = useState<PublicPerson[]>([]);
  const listRef=useRef(list);listRef.current=list;
  const [showReceipt, setShowReceipt] = useState(profileSaved);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<PublicPerson | null>(null);
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
  const [reportSent, setReportSent] = useState(false);
  const [rowError,setRowError]=useState("");
  const identity = useRef<HTMLElement>(null);
  const listPosition = useRef<{ id: string; top: number; scroll: number; featured: boolean } | null>(null);
  const move = useWeeklyCardTransition();
  const sequence = useRef(0);
  const needsRefresh = useRef(false);
  const actionPending = useRef(false);
  const refresh = useCallback(
    async () => {
      const seq = ++sequence.current;
      setLoading(true);
      setError("");
      try {
        const pages = order === 'all' ? restoreBrowse.current?.pages ?? 1 : 1;
        const results = await Promise.all(Array.from({length:pages},(_,page)=>source.discover({...filters,mode:order,offset:page*24})));
        const people = [...new Map(results.flat().map(person=>[person.id,person])).values()];
        if (seq !== sequence.current) return;
        setList(people); setMore(order === "all" && results.at(-1)?.length === 24); setRecoverable(false);
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
    [source, filters, order],
  );
  useReadRecovery(recoverable, refresh, source);
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
    const remember = () => {
      if (restoreBrowse.current || leaving) return;
      const cards = [...document.querySelectorAll<HTMLElement>('[data-weekly-person]')];
      const first = cards.find(card => card.getBoundingClientRect().bottom > 100);
      saveBrowseMemory(source,{filters,order,query,scroll:window.scrollY,pages:Math.max(1,Math.ceil(listRef.current.length/24)),
        anchor:first?.dataset.weeklyPerson?{id:first.dataset.weeklyPerson,top:first.getBoundingClientRect().top}:undefined});
    };
    const leave = () => { remember(); leaving = true; };
    remember(); window.addEventListener('scroll',remember,{passive:true});
    window.addEventListener('nisfayn:before-navigation',leave);
    return () => { window.removeEventListener('scroll',remember); window.removeEventListener('nisfayn:before-navigation',leave); };
  }, [source,filters,order,query,selected,loading,fitPerson,filterOpen,reportTarget,list.length]);
  useEffect(() => {
    setList([]);
    setSelected(null);
    setSelectedPerson(null);
    setFitPerson(null);
    void refresh();
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
        const pageCount=order==='all'?Math.max(1,Math.ceil(listRef.current.length/24)):1;
        const pages=await Promise.all(Array.from({length:pageCount},(_,page)=>source.discover({...filters,mode:order,offset:page*24})));
        if(!active||seq!==sequence.current||actionPending.current)return;
        const latest=new Map(pages.flat().map(person=>[person.id,person]));
        const details=new Map<string,PublicPerson|null>();
        // An open profile can move out of the first five while remaining eligible.
        // Re-query the authorized directory rather than freezing its old score.
        await Promise.all([...new Map(openPeople.current.map(person=>[person.id,person])).values()].map(async person=>{
          if(latest.has(person.id)){details.set(person.id,latest.get(person.id)!);return;}
          const eligible=await source.discover({...filters,mode:'all',search:person.alias,offset:0});
          details.set(person.id,eligible.find(candidate=>candidate.id===person.id)??null);
        }));
        if(!active||seq!==sequence.current||actionPending.current)return;
        // Reapply active filters as availability changes, including an initially empty online view.
        setList([...latest.values()]);setError('');setRecoverable(false);
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
    document.addEventListener('visibilitychange',updatePresence);
    window.addEventListener('online',updatePresence);
    if(needsRefresh.current)void updatePresence();
    return()=>{active=false;unwatch();clearInterval(timer);document.removeEventListener('visibilitychange',updatePresence);window.removeEventListener('online',updatePresence);};
  },[source,filters,order,loading,loadingMore]);
  async function loadMore() {
    if(loadingMore)return;setLoadingMore(true);const seq=sequence.current;
    try{const next=await source.discover({...filters,mode:order,offset:list.length});if(seq===sequence.current){setList(current=>[...current,...next.filter(n=>!current.some(p=>p.id===n.id))]);setMore(next.length===24);}}
    catch(e){if(seq===sequence.current)setError(messageFor(e));}finally{setLoadingMore(false);}
  }
  const person = selected ? list.find((p) => p.id === selected) ?? selectedPerson : null;
  function openProfile(item: PublicPerson, button: HTMLButtonElement) {
    const origin = button.querySelector<HTMLElement>(".cm-weekly-identity");
    if (!origin) return;
    listPosition.current = { id: item.id, top: button.getBoundingClientRect().top, scroll: window.scrollY, featured: order === "recommended" && button.matches(":first-child") };
    move(origin, () => {
      flushSync(() => { setNotice(""); setError(""); setSelected(item.id); setSelectedPerson(item); });
      const hero = identity.current;
      if (!hero) return null;
      window.scrollTo(0, 0);
      hero.closest(".mp-profile")?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
      void source.noteProfileOpen?.(item.id).catch(() => {});
      return hero;
    });
  }
  function closeProfile() {
    const origin = identity.current;
    const shell = origin?.closest(".cm-shell");
    const anchor = listPosition.current;
    if (!origin || !anchor || !shell) { setSelected(null); setSelectedPerson(null); return; }
    move(origin, () => {
      flushSync(() => {setSelected(null);setSelectedPerson(null);});
      const button = shell.querySelector<HTMLButtonElement>(`[data-weekly-person="${CSS.escape(anchor.id)}"]`);
      if (!button) { window.scrollTo(0, anchor.scroll); return null; }
      window.scrollTo(0, window.scrollY + button.getBoundingClientRect().top - anchor.top);
      button.focus({ preventScroll: true });
      return button.querySelector(".cm-weekly-identity");
    });
  }
  async function sendRequest(target=person) {
    if (!target || actionPending.current) return;
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
      void refresh();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }
  async function rowAction(item:PublicPerson,action:'interest'|'dismiss'|'report',reason?:string) {
    if(actionPending.current)return;
    actionPending.current=true;setRowBusy(item.id);setRowError('');
    try {
      if(action==='interest') {
        if(!source.setInterest)throw Error('الاهتمام غير متاح الآن.');
        await source.setInterest(item.id,!item.interested);
        setList(rows=>rows.map(row=>row.id===item.id?{...row,interested:!item.interested}:row));
      } else {
        if(action==='dismiss') {if(!source.dismissPerson)throw Error('الإخفاء غير متاح الآن.');await source.dismissPerson(item.id);setHiddenNotice(`أُخفي ملف ${item.alias} من الاستكشاف والترشيحات.`);}
        else {if(!source.reportPerson)throw Error('الإبلاغ غير متاح الآن.');await source.reportPerson(item.id,reason||'');feedback('success');setReportTarget(null);setReportSent(true);}
        setList(rows=>rows.filter(row=>row.id!==item.id));
      }
    }catch(e){setRowError(messageFor(e));}
    finally{actionPending.current=false;setRowBusy(null);}
  }
  if (person)
    return (
      <Profile source={source} person={person} back={closeProfile} backText="استكشف" identity={identity}
        featured={listPosition.current?.featured}
        primary={<>
          <button onClick={()=>person.connectionId ? onInbox({id:person.connectionId,featured:false}) : void sendRequest()} disabled={busy || (!person.connectionId && (person.atCapacity || person.viewerAtCapacity))} aria-busy={busy||undefined} className="btn-primary mp-action-main">
            <span className="mp-action-symbol">{person.connectionStatus==='accepted'?<MessageCircle size={20}/>:person.connectionStatus==='pending'?<Clock3 size={20}/>:<Send size={20}/>}</span><span className="mp-action-copy"><strong>{busy?'جارٍ إرسال الطلب…':person.connectionId ? person.connectionStatus === "accepted" ? "متابعة المحادثة" : "عرض طلب التعارف" : person.atCapacity || person.viewerAtCapacity ? "اكتمل عدد التعارفات حاليًا" : "طلب التعارف"}</strong><small>{person.connectionStatus==='accepted'?'مساحتكما لحديث جاد':person.connectionStatus==='pending'?'تفاصيل الطلب والخطوة التالية':'بداية حديث، بموافقة الطرفين'}</small></span><ArrowLeft size={18} className="mp-action-arrow"/>
          </button>
          <p className="cm-help"><LockKeyhole size={14} />{person.connectionId ? "تواصل خاص بينكما." : person.atCapacity || person.viewerAtCapacity ? "الحد الأقصى تعارفان متزامنان. يمكنك العودة لاحقًا." : "لن تُفتح المحادثة إلا بعد قبول الطرف الآخر."}</p>
          {error&&<Banner alert text={error}/>}
        </>}
      />
    );
  const count = Object.entries(filters).filter(([key,value])=>!["sort","offset","afterId","mode","search"].includes(key)&&(Array.isArray(value)?value.length>0:Boolean(value))).length;
  const people = order === "recommended" ? [...list].sort((a,b)=>(compatibilityPercentage(b)??-1)-(compatibilityPercentage(a)??-1)).slice(0,5) : list;
  return (
    <section className={"screen-content cm-view df-discovery"+(order==='all'?' dr-directory':'')}>
      <ScenePaths className="df-arrival-paths" parallax />
      <header className="cm-header df-header">
        <Brand />
        <span className="df-header-note"><span aria-hidden="true" /> {order === "all" ? "جميع الملفات" : "ترشيحاتك"}</span>
      </header>
      <MotionReveal className="cm-title df-title" duration={480}>
        <div><h1>استكشف</h1><p>ملفات وتفضيلات تساعدك على الاختيار.</p></div>
        <button
          className={"cm-filter-button" + (count ? " selected" : "")}
          onClick={() => setFilterOpen(true)}
          aria-label="تصفية الملفات"
        >
          <SlidersHorizontal size={16} /><span>تصفية</span>{" "}
          {count > 0 && <b>{ar.format(count)}</b>}
        </button>
      </MotionReveal>
      {showReceipt && <SuccessNotice title="حُفظ ملفك وتفضيلاتك" detail="ملفك جاهز للاستكشاف. ابدأ بأقرب الترشيحات، ويمكنك تعديل اختياراتك من الإعدادات." close={()=>setShowReceipt(false)}/>}
      {reportSent && <ReportReceipt demo={Boolean(source.demoAcceptOutgoing)} close={()=>setReportSent(false)}/>}
      <NextStep source={source} assessment={{completed:beenaAnswered,total:6,label:'بيننا'}} onAssessment={onBeena}
        onRequest={id=>onInbox({id,featured:false})} onConversation={onConversation} onStateChange={setAvailability}/>
      <div className="df-feed-controls">
        <div className="df-feed-tabs" role="group" aria-label="ترتيب الملفات">
          <button type="button" aria-pressed={order === "recommended"} onClick={() => setOrder("recommended")}><Sparkles size={16}/> ترشيحات لك</button>
          <button type="button" aria-pressed={order === "all"} onClick={() => setOrder("all")}><Compass size={16} /> جميع الملفات</button>
        </div>
      </div>
      <ProfileVisitNotice interest={order === 'all'} compact/>
      {order === "all" && <div className="dr-tools"><label className="dr-search"><Search size={17}/><input aria-label="البحث بالاسم أو المهنة" placeholder="ابحث بالاسم أو المهنة" value={query} onChange={e=>setQuery(e.target.value)} maxLength={80}/>{query&&<button onClick={()=>setQuery('')} aria-label="مسح البحث"><X size={14}/></button>}</label>
        <label className="dr-sort"><span>الترتيب</span><select aria-label="ترتيب الاستكشاف" value={filters.sort??'compatibility'} onChange={e=>setFilters(f=>({...f,sort:e.target.value as Filters['sort']}))}><option value="compatibility">الأقرب توافقًا</option><option value="youngest">الأصغر عمرًا</option><option value="oldest">الأكبر عمرًا</option></select></label>
        <button className="dr-filter-shortcut" aria-label="تصفية الملفات" onClick={()=>setFilterOpen(true)}><SlidersHorizontal size={18}/>{count>0&&<b>{ar.format(count)}</b>}</button><span className="dr-directory-note">الاهتمام يرسل إشعارًا · الطلب يفتح باب التعارف</span></div>}
      {count > 0 && (
        <div className="cm-applied" aria-label="التصفية النشطة"><button onClick={()=>setFilters({})}>مسح {ar.format(count)} فلاتر <X size={13}/></button>
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
          {([['city','المدينة'],['nationality','الجنسية'],['tribalBackground','الخلفية القبلية'],['maritalStatus','الحالة الاجتماعية'],['smoking','التدخين'],['dressStyle','غطاء الرأس'],['work','عمل الزوجة'],['minFit','حد التوافق'],['availableOnly','متاح للتعارف'],['onlineOnly','نشط الآن'],['excludeCities','إخفاء مدن'],['excludeNationalities','إخفاء جنسيات'],['excludeTribalBackgrounds','إخفاء خلفيات'],['excludeSmoking','إخفاء حسب التدخين'],['excludeMaritalStatuses','إخفاء حالات اجتماعية']] as const).map(([key,label])=>{
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
          title={availability.exclusive ? 'مساحة أهدأ لتعارفكما' : count || query.trim() ? 'لنوسّع مساحة البحث' : 'كل بداية لها وقتها'}
          description={
            availability.exclusive ? 'أنتما في تعارف حصري، لذلك تتوقف الترشيحات الجديدة. تابعا الحديث وخطوتكما المقبلة من المحادثة.' : count > 0 || query.trim()
              ? "لم تظهر ملفات ضمن البحث والفلاتر الحالية. يمكنك مراجعتها دون تغيير ما يهمك في شريك الحياة. قلة النتائج ليست حكمًا على ملفك."
              : availability.acceptedCount >= 2 ? 'لديك تعارفان حاليان، وهو الحد المتاح. يمكنك تصفّح الملفات المؤهلة، وتتاح دعوة جديدة عند انتهاء أحدهما.' : "لا توجد ترشيحات ضمن تفضيلات الطرفين حاليًا. استكشف الملفات الأخرى أو راجع تفضيلاتك؛ لا حاجة لتغيير ما يهمّك."
          }
          action={
            <div className="cm-empty-actions">
              {(count > 0 || Boolean(query.trim())) && <button className="btn-secondary" onClick={() => { setQuery(''); setFilters(emptyFilters); }}>مسح البحث والتصفية</button>}
              {!availability.exclusive && order === 'recommended' && <button className="btn-secondary" onClick={()=>setOrder('all')}>استكشف بقية الملفات المؤهلة</button>}
              <button className="btn-text" onClick={onAccount}>مراجعة ملفي وتفضيلاتي</button>
              <SupportContact subject="المساعدة في الترشيحات"/>
            </div>
          }
        />
      )}
      <div key={order} className={"cm-list df-feed"+(order === "all"?" dr-rows":"")} aria-label="ملفات للتعارف الجاد" aria-busy={loading}>
        {people.map((item, index) => (
          order==='all'?<DirectoryRow key={item.id} person={item} source={source} busy={busy||rowBusy!==null} open={button=>openProfile(item,button)} explain={()=>setFitPerson(item)} request={()=>item.connectionId?onInbox({id:item.connectionId,featured:false}):void sendRequest(item)} interest={()=>void rowAction(item,'interest')} dismiss={()=>void rowAction(item,'dismiss')} report={()=>{setRowError('');setReportTarget(item);}}/>:<PersonCard
            key={item.id}
            person={item}
            source={source}
            priority={index < 2} index={index}
            open={button => openProfile(item, button)}
          />
        ))}
      </div>
      {more && <button className="btn-secondary dr-more" disabled={loadingMore} onClick={()=>void loadMore()}>{loadingMore?"جارٍ التحميل…":"اكتشف المزيد"}<ArrowDown size={16}/></button>}
      {!!list.length && !loading && <footer className="df-feed-end"><h2>{order === 'all' ? 'هذه الملفات المتاحة حاليًا' : 'هذه ترشيحاتك لهذا الأسبوع'}</h2>
        <p>{order === "all" ? "يمكنك تعديل التصفية لرؤية ملفات أخرى تناسب تفضيلاتك." : "اختر «جميع الملفات» لرؤية المزيد، أو عدّل التصفية لتوسيع بحثك."}</p>
        <small><LockKeyhole size={12} /> تبدأ المحادثة بعد قبول الطرفين.</small></footer>}
      <div className="df-discovery-help"><HelpButton topic="discovery" label="كيف أبدأ؟ وما معنى التوافق؟"/></div>
      {reportTarget&&<SafetySheet action="report" busy={rowBusy!==null} error={rowError} apply={reason=>void rowAction(reportTarget,'report',reason)} close={()=>{if(!rowBusy)setReportTarget(null);}}/>}
      {fitPerson?.fit&&<Sheet title={`التوافق مع ${fitPerson.alias}`} onClose={()=>setFitPerson(null)}><FitDetails fit={fitPerson.fit}/></Sheet>}
      {filterOpen && (
        <FilterSheet
          filters={filters}
          close={() => setFilterOpen(false)}
          apply={(value) => {
            setFilterOpen(false);
            setNotice("");
            setOrder("all");
            setFilters(value);
          }}
        />
      )}
    </section>
  );
}

function SafetySheet({
  action,
  apply,
  close,
  busy,
  error,
}: {
  action: SafetyAction;
  apply: (reason: string) => void;
  close: () => void;
  busy: boolean;
  error: string;
}) {
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState("");
  const reportReason = [category, reason.trim()].filter(Boolean).join('\n');
  return (
    <Sheet
      title={action === "report" ? "إبلاغ عن عضو" : "حظر العضو"}
      onClose={close}
    >
      {action === "block" ? (
        <p>سيُغلق الطلب والمحادثة، ولن يظهر هذا العضو لك مجددًا.</p>
      ) : (
        <div className="cm-report-form">
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
        <p className="cm-step-note">بعد نجاح إرسال البلاغ، يُغلق أي طلب أو تعارف قائم مع هذا العضو ويتوقف التواصل بينكما. يُرسل السبب والتفاصيل التي تضيفها للإدارة للمراجعة. لا تحتاج إلى شرح قرارك للطرف الآخر أو إضافة معلومات خاصة لا تتعلق بالمشكلة.</p>
        <SupportContact subject="المساعدة بشأن بلاغ" context="إذا احتجت مساعدة في تقديم البلاغ أو متابعته."/>
        </div>
      )}
      {error && <Banner alert text={error} />}
      <button
        className="btn-primary"
        disabled={busy || (action === "report" && !category)}
        onClick={() => apply(action === 'report' ? reportReason : '')}
      >
        {action === "report" ? "إرسال البلاغ" : "تأكيد الحظر"}
      </button>
    </Sheet>
  );
}

function JourneySummary({ source, id, name, open }: { source: CommunitySource; id: string; name: string; open: () => void }) {
  const [progress, setProgress] = useState<StepProgress | null>(null);
  useEffect(() => {
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
  }, [source, id]);
  if (!source.progress) return null;
  const next = journeyNext(progress, name);
  return <MotionPressButton className="cm-journey-summary nf-next-step" data-pending={next.yours || undefined} onClick={open} aria-haspopup="dialog" aria-label="مسار التعارف">
    <span className="nf-journey-summary-mark" aria-hidden="true"><Sparkles size={17}/></span>
    <MotionReveal as="span" className="nf-next-copy" key={`${next.title}:${next.waiting}:${next.agreed}`} distance={4} duration={220}>
      <span className="nf-next-caption">خطوتكما القادمة<em>{next.waiting}</em></span>
      <strong>{next.title}</strong><small>متفق عليه: {next.agreed}</small>
    </MotionReveal><ChevronLeft size={14} aria-hidden="true"/>
  </MotionPressButton>;
}

function RematchChoice({checked,change,disabled}:{checked:boolean;change:(value:boolean)=>void;disabled:boolean}) {
  return <label className="cm-rematch-choice"><input type="checkbox" checked={checked} onChange={event=>change(event.target.checked)} disabled={disabled}/><span><strong>السماح بالتعارف مجددًا</strong><small>{checked?'يمكن لأي منكما إرسال طلب جديد؛ لن يبدأ التعارف إلا بعد قبول الطرف الآخر.':'لن تتمكّنا من إرسال طلب تعارف جديد لبعضكما.'}</small></span></label>;
}

function ConversationGuide({ source, connection, close, closed, choose, hasDraft, openInsights, openFamily, onCompletion }: {
  source: CommunitySource; connection: Connection; close: () => void; closed: () => void;
  choose: (text: string) => void; hasDraft: boolean; openInsights: () => void; openFamily?: () => void; onCompletion?: () => void;
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
  async function act(end: boolean) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (end) { await source.act(connection.id, "cancel", undefined, allowRematch); feedback('success'); closed(); }
      else if (progress && source.nextStep) {
        const next=await source.nextStep(connection.id, !progress.exclusive ? 1 : progress.stage + 1, !(progress.exclusive ? progress.mine : progress.consentMine), exclusiveConsent);
        setProgress(next);
        setSavedStep(next.stage>progress.stage||!progress.exclusive&&next.exclusive ? {title:'اتفقتما على المرحلة الجديدة',detail:journeyStages[next.stage]+' · حُفظ اختياركما معًا.'} : (next.exclusive ? next.mine : next.consentMine) ? {title:'وصل اقتراحك',detail:'بانتظار موافقة الطرف الآخر. تبقى المرحلة الحالية كما هي.',quiet:true} : {title:'سُحب الاقتراح',detail:'يمكنك اقتراح الخطوة مجددًا عندما تكون مستعدًا.',quiet:true});
        setExclusiveConsent(false);
        setRetry(n => n + 1);
      }
    } catch (e) { setError(messageFor(e)); }
    finally { setBusy(false); }
  }
  async function rewind(agree: boolean) {
    if(busy||!progress||!source.rewindStep)return;setBusy(true);setError("");
    try{const next=await source.rewindStep(connection.id,progress.stage,agree);setProgress(next);setSavedStep({title:next.stage<progress.stage?'اتفقتما على العودة خطوة':agree?'أُرسل اقتراح العودة':'بقيتما في المرحلة الحالية',detail:next.stage<progress.stage?'المحادثة والمدة المتفق عليها محفوظتان.':agree?'لا تتغيّر المرحلة أو الحصرية قبل موافقة الطرف الآخر.':'يمكنكما مراجعة المسار لاحقًا.',quiet:true});setRewindConfirm(false);setRetry(n=>n+1);}catch(e){setError(messageFor(e));}finally{setBusy(false);}
  }
  const stages = journeyStages;
  const commitmentOpen = reviewCommitment || Boolean(progress?.consentMine || progress?.consentPeer);
  return <Sheet title="مسار التعارف" onClose={() => { if (!busy) close(); }}>
    <div className="nf-journey-guide">
    <MotionReveal className="nf-journey-current" distance={6} duration={280}>
      <span className="nf-journey-eyebrow">خطوة بخطوة، باتفاقكما</span>
      <h3>{progress ? stages[progress.stage] : 'مسار واضح لكما'}</h3>
      <p>{progress?.exclusive ? 'تعارف حصري · ملتزمان ببعضكما' : 'تتعارفان على مهل. كل انتقال يحدث بموافقتكما.'}</p>
      {progress && <ol className="nf-journey-track" aria-label="مراحل التعارف">{['التعارف', 'النقاش الجاد', 'الخطوة العائلية'].map((label,index)=><li key={label} aria-current={index===progress.stage?'step':undefined} data-complete={index < progress.stage || undefined}><span aria-hidden="true">{index < progress.stage ? <Check size={12}/> : ar.format(index+1)}</span><small>{label}</small></li>)}</ol>}
    </MotionReveal>
    {savedStep&&<SuccessNotice {...savedStep} close={()=>setSavedStep(null)}/>}
    {progress && <section className="nf-journey-next" aria-label="الخطوة القادمة">
      {!progress.exclusive && <>
        <h3>{progress.consentPeer && !progress.consentMine ? 'لديك طلب التزام حصري' : progress.consentMine ? 'اقتراحك بانتظار الموافقة' : 'عندما تختاران التركيز على بعضكما'}</h3>
        <p className="nf-journey-next-note">{progress.consentMine ? 'تبقى المرحلة الحالية كما هي حتى يوافق الطرف الآخر.' : progress.consentPeer ? 'راجع ما سيتغيّر قبل اتخاذ قرارك.' : 'اختيار الحصرية خطوة مستقلة عن الحديث الجاد حول الزواج.'}</p>
        {!commitmentOpen ? <MotionPressButton className="btn-primary" disabled={busy} onClick={()=>setReviewCommitment(true)}>مراجعة الالتزام الحصري<ChevronLeft size={16}/></MotionPressButton> : <div className="nf-journey-consent">
        <p>عند موافقتكما معًا، تُغلق جميع طلبات التعارف والمحادثات الأخرى لكليكما، وتُوقف الترشيحات والتواصل مع أشخاص جدد. يظهر بجانب اسميكما «تعارف حصري».</p>
        <p>تبقى السجلات محفوظة. يمكنك إنهاء هذا التعارف في أي وقت؛ المحادثات المغلقة لا تُفتح تلقائيًا.</p>
        {otherConnections !== null && <details className="nf-journey-closure"><summary>ما سيُغلق في حسابك <span>{ar.format(otherConnections.length)}</span><ChevronLeft size={14}/></summary>{otherConnections.length ? <ul>{otherConnections.map(item=><li key={item.id}>{item.person.alias} · {item.status==='accepted'?'محادثة قائمة':'طلب قيد الانتظار'}</li>)}</ul> : <p>لا توجد طلبات أو محادثات أخرى ظاهرة في حسابك حاليًا.</p>}<small>هذه معاينة لحالتك الحالية. يُطبّق الإغلاق على التعارفات الأخرى لدى الطرفين عند موافقتكما، وقد تتغير القائمة قبل ذلك.</small></details>}
        {!progress.consentMine && <label className="nf-journey-consent-check"><input type="checkbox" checked={exclusiveConsent} onChange={e => setExclusiveConsent(e.target.checked)} disabled={busy}/> <span>أفهم أن موافقتنا معًا تُغلق علاقات التعارف الأخرى، وأوافق على الالتزام الحصري.</span></label>}
        <p className="nf-journey-consent-state">{progress.consentMine ? 'سُجّلت موافقتك. بانتظار الطرف الآخر.' : progress.consentPeer ? 'موافقتك الآن ستفعّل الالتزام وتغلق التعارف الآخر.' : 'لن تُغلق أي محادثة قبل موافقتكما معًا.'}</p>
        <MotionPressButton className={progress.consentMine ? 'btn-secondary' : 'btn-primary'} disabled={busy || (!progress.consentMine && !exclusiveConsent)} onClick={() => void act(false)}>{progress.consentMine ? 'سحب طلب الالتزام' : progress.consentPeer ? 'أوافق وأفعّل الالتزام الحصري' : 'اقتراح الالتزام الحصري'}</MotionPressButton>
        {!progress.consentMine&&!progress.consentPeer&&<button type="button" className="btn-text" disabled={busy} onClick={()=>{setReviewCommitment(false);setExclusiveConsent(false);}}>ليس الآن</button>}
        </div>}
      </>}
      {progress.exclusive && progress.stage === 2 && <><h3>بداية الخطوة العائلية</h3><p className="nf-journey-next-note">اتفقا على التفاصيل بالوتيرة المناسبة لكما.</p>{onCompletion&&<MotionPressButton className="btn-primary" onClick={onCompletion}>نحو بداية جديدة<ChevronLeft size={16}/></MotionPressButton>}</>}
      {progress.exclusive && progress.stage < 2 && <>
        <h3>{progress.mine ? 'اقتراحك بانتظار الموافقة' : progress.peer ? 'لديك طلب للخطوة التالية' : 'خطوتكما القادمة'}</h3>
        <p className="nf-journey-next-note">{progress.mine ? "تنتقلان للخطوة التالية بعد موافقة الطرف الآخر." : progress.peer ? "راجع الخطوة ووافق عندما تكون مستعدًا." : "يصل اقتراحك للطرف الآخر؛ لا تتغيّر المرحلة إلا باتفاقكما."}</p>
        <MotionPressButton className={progress.mine?'btn-secondary':'btn-primary'} disabled={busy} onClick={() => void act(false)}>{progress.mine ? "سحب طلبي" : (progress.peer ? "الموافقة على: " : "اقتراح: ") + stages[progress.stage + 1]}</MotionPressButton>
      </>}
    </section>}
    {progress?.stage===2&&!progress.exclusive&&onCompletion&&<MotionPressButton className="nf-journey-tool" disabled={busy} onClick={onCompletion}><Heart size={19}/><span><strong>نحو بداية جديدة</strong><small>خيارات الاستمرار خارج التطبيق وخصوصية الحساب</small></span><ChevronLeft size={15}/></MotionPressButton>}
    {openFamily&&<MotionPressButton className="nf-journey-tool" disabled={busy} onClick={openFamily}><UsersRound size={19}/><span><strong>جسر الأهل</strong><small>راجعا الموافقات أولًا؛ لا تُرسل دعوة تلقائيًا.</small></span><ChevronLeft size={15}/></MotionPressButton>}
    {progress && progress.stage > 0 && source.rewindStep && <details className="nf-journey-option" open={rewindConfirm || Boolean(progress.rewindPeer || progress.rewindMine)} data-pending={progress.rewindPeer || undefined}>
      <summary><RotateCcw size={18}/><span><strong>مساحة لخطوة أهدأ</strong><small>{progress.rewindPeer ? "اقتراح عودة · بانتظار موافقتك" : progress.rewindMine ? "اقتراحك بانتظار الطرف الآخر" : "العودة مرحلة واحدة باتفاقكما"}</small></span><ChevronLeft size={15}/></summary><div className="nf-journey-option-content">
      {(rewindConfirm || progress.rewindPeer) && <p className="dr-rewind-warning">{progress.stage === 1 ? "بعد موافقتكما يعود التعارف الأولي، وتُرفع علامة الحصرية ويصبح استكشاف الآخرين متاحًا. تبقى محادثتكما واتفاق الجدية والمدة محفوظة؛ لا تُفتح التعارفات المغلقة سابقًا." : "تعودان إلى النقاش الجاد حول الزواج مع استمرار الحصرية. تبقى المحادثة واتفاق الجدية والمدة محفوظة."}</p>}
      {progress.rewindMine ? <button className="btn-secondary" disabled={busy} onClick={()=>void rewind(false)}>سحب اقتراح العودة</button> : rewindConfirm || progress.rewindPeer ? <><button className="btn-secondary" disabled={busy} onClick={()=>void rewind(true)}>{progress.rewindPeer ? "أوافق على العودة إلى: " : "إرسال اقتراح العودة إلى: "}{stages[progress.stage-1]}</button><button className="btn-text" disabled={busy} onClick={()=>progress.rewindPeer ? void rewind(false) : setRewindConfirm(false)}>{progress.rewindPeer?"البقاء في المرحلة الحالية":"تراجع"}</button></> : <button className="btn-secondary" onClick={()=>setRewindConfirm(true)}>اقتراح خطوة إلى الوراء</button>}
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

export function Chat({
  source, connection, back, close, backLabel, onReported, onCompletion,
}: {
  source: CommunitySource; connection: Connection; back: () => void; close: () => void; backLabel: string;
  onReported?: () => void;
  onCompletion?: () => void;
}) {
  const thread = useThread(source, connection.id);
  const voice = useVoiceCalls();
  const [safety, setSafety] = useState<SafetyAction | null>(null);
  const [safetyError, setSafetyError] = useState("");
  const [safetyBusy, setSafetyBusy] = useState(false);
  const [showLatest, setShowLatest] = useState(false);
  const [guide, setGuide] = useState(false);
  const [photos, setPhotos] = useState(false);
  const [recording, setRecording] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [chatHelp,setChatHelp]=useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [endMatch, setEndMatch] = useState(false);
  const [allowRematch, setAllowRematch] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [messageActionId, setMessageActionId] = useState<string | null>(null);
  const [messageActionAnchor, setMessageActionAnchor] = useState<HTMLElement | null>(null);
  const [reactionError, setReactionError] = useState('');
  const messageActionHelp = useId();
  const [deleting, setDeleting] = useState(false), [deleteError, setDeleteError] = useState('');
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const [privateHidden, setPrivateHidden] = useState(() => document.hidden);
  const [jumpToId, setJumpToId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [replyNotice, setReplyNotice] = useState('');
  const [conversationAllowed, setConversationAllowed] = useState(!source.agreement);
  const chatReady = thread.ready && conversationAllowed;
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
  const replyDraft = thread.outbox.read().reply;
  const reading = useChatReading(source, connection.id, log, atBottom, thread, conversationAllowed && !profileOpen && !familyOpen);
  const typing = useTyping(source, connection.id, chatReady && !profileOpen && !familyOpen && !recording && !libraryOpen && !privateHidden);
  const profileIdentity = useRef<HTMLElement>(null);
  const profileFlight = useWeeklyCardTransition();
  useReadPosition(source, connection.id, log, thread.rows.filter(m => !m.senderIsMe).at(-1)?.id, reading.positioned && conversationAllowed && !safety && !guide && !photos && !profileOpen && !familyOpen && !endMatch && !toolsOpen && !insightsOpen && !deleteTarget && !messageActionId && !libraryOpen);
  function messagePermissions(msg: Message) {
    const status = 'status' in msg ? msg as Outgoing : undefined;
    const deleted = Boolean(msg.deletedAt) || deletedIds.has(msg.id);
    const saved = !status || status.status === 'saved';
    return { status, deleted,
      canReply: chatReady && !deleted && saved,
      canReact: Boolean(source.reactToMessage) && chatReady && !deleted && saved,
      canDelete: Boolean(source.deleteMessage) && msg.senderIsMe && !deleted && saved && Date.now() - Date.parse(msg.createdAt) < 48 * 60 * 60 * 1000,
    };
  }
  const actionMessage = thread.rows.find(msg => msg.id === messageActionId);
  const actionPermissions = actionMessage ? messagePermissions(actionMessage) : null;
  const hasMessageActions = Boolean(actionPermissions?.canReply || actionPermissions?.canDelete || actionPermissions?.canReact);
  useEffect(() => {
    if (messageActionId && (!hasMessageActions || privateHidden)) setMessageActionId(null);
  }, [messageActionId, hasMessageActions, privateHidden]);

  function openMessageActions(message: Message) {
    const permissions = messagePermissions(message);
    if (!permissions.canReply && !permissions.canDelete && !permissions.canReact) return;
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
    const hide = () => setPrivateHidden(document.hidden);
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
  function scrollToLatest() {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
    atBottom.current = true;
    setShowLatest(false);
  }
  useLayoutEffect(() => {
    const element = composer.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = Math.min(element.scrollHeight, 110) + "px";
  }, [thread.draft, conversationAllowed, profileOpen]);
  useLayoutEffect(() => {
    if (!screen.current) return;
    return lockChatViewport(screen.current, () => {
      if (reading.positioned && atBottom.current && log.current) log.current.scrollTop = log.current.scrollHeight;
    });
  }, [profileOpen, familyOpen, conversationAllowed, reading.positioned]);
  useLayoutEffect(() => {
    if (!reading.positioned) return;
    if (atBottom.current) scrollToLatest();
    else if (lastId) setShowLatest(true);
  }, [lastId, profileOpen, conversationAllowed]);
  useLayoutEffect(() => {
    if (reading.positioned && atBottom.current) scrollToLatest();
  }, [replyDraft?.id, lastReactions]);
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
    if (!chatReady || !body || body.length > 1000) return;
    typing.stop();
    atBottom.current = true;
    composedId.current = thread.outbox.enqueue(body);
  }
  function chooseConversationPrompt(text: string) {
    const current = thread.outbox.read();
    if (!chatReady || recording || current.draft || current.reply || !text.trim() || text.length > 1000) return;
    thread.outbox.write(text);
    setInsightsOpen(false);
    setGuide(false);
    requestAnimationFrame(() => composer.current?.focus({ preventScroll: true }));
  }
  function chooseReply(msg: Message) {
    if (!chatReady || msg.deletedAt || deletedIds.has(msg.id) || ('status' in msg && msg.status !== 'saved')) return;
    thread.outbox.replyTo({ id: msg.id, senderIsMe: msg.senderIsMe,
      body: msg.attachment ? (msg.attachment.kind === 'photo' ? msg.attachment.viewOnce ? 'صورة لمرة واحدة' : 'صورة' : 'رسالة صوتية') : msg.body.slice(0,240) });
    setReplyNotice('');
    composer.current?.focus({ preventScroll: true });
  }
  useEffect(() => {
    if (!jumpToId || !log.current) return;
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
  }, [jumpToId, firstId, thread.loadingOlder, thread.hasOlder, thread.error, thread.older]);
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
  async function moderate(reason: string) {
    if (!safety || safetyBusy) return;
    setSafetyBusy(true);
    setSafetyError("");
    try {
      await source.act(connection.id, safety, reason || undefined);
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
    try { await source.act(connection.id, 'cancel', undefined, allowRematch); feedback('success'); thread.outbox.clear(); close(); }
    catch (e) { setEndError(messageFor(e)); }
    finally { setEnding(false); }
  }
  function returnToChat() {
    const origin = profileIdentity.current?.querySelector<HTMLElement>('.mp-portrait');
    const swap = () => { flushSync(() => setProfileOpen(false)); return screen.current?.querySelector<HTMLElement>('.cm-chat-person .cm-avatar') ?? null; };
    if (origin) profileFlight(origin, swap); else swap();
    requestAnimationFrame(() => screen.current?.querySelector<HTMLButtonElement>('.cm-chat-person')?.focus({ preventScroll: true }));
  }
  function openPartnerProfile(origin: HTMLButtonElement) {
    reading.remember(); typing.stop();
    const swap = () => { flushSync(() => setProfileOpen(true)); return profileIdentity.current?.querySelector<HTMLElement>('.mp-portrait') ?? null; };
    const avatar = origin.querySelector<HTMLElement>('.cm-avatar');
    if (avatar) profileFlight(avatar, swap); else swap();
    void source.noteProfileOpen?.(connection.person.id).catch(() => {});
  }
  function openFamily() { reading.remember(); typing.stop(); setFamilyOpen(true); }
  if (profileOpen) return <MotionReveal distance={10} fromOpacity={1} axis="x" duration={280}><Profile source={source} person={connection.person} identity={profileIdentity} connectionId={connection.id} back={returnToChat} backText="العودة للمحادثة"/></MotionReveal>;
  if (familyOpen && source.family) return <FamilyBridgePanel source={source} connectionId={connection.id} name={connection.person.alias} onBack={() => { setFamilyOpen(false); requestAnimationFrame(() => screen.current?.querySelector<HTMLButtonElement>('.cm-guide-button')?.focus()); }}/>;
  return (
    <section className="cm-chat" ref={screen} data-conversation-id={connection.id} data-private-hidden={privateHidden || undefined}>
      {privateHidden && <div className="cm-chat-privacy-cover" aria-label="المحادثة مخفية أثناء مغادرة التطبيق"><LockKeyhole size={32}/><span>خصوصيتكما أولًا</span></div>}
      <header className="cm-chat-head">
        <ScenePaths className="cm-chat-arrival-paths" />
        <h1 className="mi-sr-only" tabIndex={-1}>محادثة مع {connection.person.alias}</h1>
        <button className="icon-btn" onClick={() => { reading.remember(); typing.stop(); back(); }} aria-label={backLabel}><ArrowRight /></button>
        <button type="button" className="cm-chat-person" aria-label={`عرض ملف ${connection.person.alias}`} onClick={event => openPartnerProfile(event.currentTarget)}>
          <PersonAvatar person={connection.person} source={source} className="cm-avatar" />
          <span className="cm-chat-person-copy"><strong>{connection.person.alias} <VerifiedBadge claims={connection.person.manualVerifications} compact interactive={false}/> {connection.person.isDemo&&!source.simulation&&<span className="nf-demo-tag">حساب توضيحي</span>} {connection.person.exclusive && <span className="cm-exclusive-badge">تعارف حصري</span>}</strong><small>{typing.peerTyping ? <span className="cm-typing" role="status">يكتب الآن<span className="cm-typing-dots" aria-hidden="true"><i/><i/><i/></span></span> : <>عرض الملف · قد تظهر زيارتك <ChevronLeft size={12}/></>}</small></span>
        </button>
        {voice && <CallPermissionButton source={source} connection={connection} disabled={voice.occupied || !chatReady || recording} onCall={() => voice.start(connection)}/>}
        <button className="cm-guide-button" aria-label="خيارات المحادثة" aria-haspopup="dialog" onClick={() => setToolsOpen(true)}><MoreHorizontal size={21}/></button>
      </header>
      <div className="cm-chat-plan" data-ready={conversationAllowed || undefined}>
        {conversationAllowed && <JourneySummary source={source} id={connection.id} name={connection.person.alias} open={() => setGuide(true)}/>}
        <ConversationAgreement source={source} requestId={connection.id} onAllowed={setConversationAllowed}/>
        <button className="cm-end-visible" type="button" onClick={() => { setEndError(''); setAllowRematch(false); setEndMatch(true); }}>إنهاء التعارف</button>
      </div>
      {conversationAllowed && <div className="cm-chat-stage">
        {!thread.accessDenied && <ThreadConnection state={thread.connectionState} retry={thread.refresh}/>}
        <div
          ref={log} className="cm-chat-log" role="log" tabIndex={0} aria-label="رسائل المحادثة" aria-live="polite" aria-relevant="additions"
          onScroll={(e) => {
            const el = e.currentTarget;
            atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
            if (atBottom.current) setShowLatest(false);
            reading.remember();
          }}
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
          {thread.ready && !thread.rows.length && <div className="cm-first-message">
            <span className="cm-first-icon"><MessageCircle size={25} aria-hidden="true" /></span>
            <h2>كل بداية، حديث</h2>
            <p>مساحة لك ولـ{connection.person.alias}. ابدأ بتحية، أو بسؤال يفتح باب المعرفة.</p>
            <p>من «حديث أقرب» يمكنك اختيار فكرة من توافقكما ومراجعتها قبل الإرسال.</p>
          </div>}
          {thread.rows.map((msg, i) => {
            const day = messageDay(msg.createdAt);
            const newDay = day && (i === 0 || day !== messageDay(thread.rows[i - 1].createdAt));
            const { status, deleted, canReply, canDelete, canReact } = messagePermissions(msg);
            const key = (msg.senderIsMe && msg.clientId) || msg.id;
            return <div className="cm-message-row" data-row-id={key} data-server-id={msg.id} data-reply-highlight={highlightId === msg.id || undefined} data-actions-open={messageActionId === msg.id || undefined} tabIndex={-1} key={key}>
              {newDay && <div className="cm-chat-day"><span>{day}</span></div>}
              {msg.id === reading.firstUnreadId && <div className="cm-unread-divider" role="separator" aria-label="رسائل لم تقرأها"><span>رسائل لم تقرأها</span></div>}
              <SwipeReply disabled={!canReply} onReply={() => chooseReply(msg)} actionsDisabled={!canReply && !canDelete && !canReact}
                actionLabel="خيارات الرسالة" actionDescriptionId={messageActionHelp}
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
                    <span aria-label="جارٍ الإرسال"><Clock3 size={12} aria-hidden="true"/></span> :
                    status?.status !== "failed" && <span data-receipt={msg.readAt ? 'read' : msg.deliveredAt ? 'delivered' : 'sent'} aria-label={msg.readAt ? 'قُرئت' : msg.deliveredAt ? 'تم التسليم' : 'أُرسلت'}>
                      {msg.readAt || msg.deliveredAt ? <CheckCheck size={14} aria-hidden="true"/> : <Check size={13} aria-hidden="true"/>}
                      <span className="cm-receipt-label">{msg.readAt ? 'قُرئت' : msg.deliveredAt ? 'تم التسليم' : 'أُرسلت'}</span></span>)}
                </div>
              </div>
              {!deleted && <MessageReactions reactions={msg.reactions} self={msg.senderIsMe} name={connection.person.alias}
                pending={thread.pendingReactionIds.has(msg.id)} disabled={!canReact}
                open={() => openMessageActions(msg)} />}
              </SwipeReply>
              {status?.status === "failed" && <div className="cm-message-retry" role="status">
                <span>{status.error}</span><button onClick={() => thread.outbox.retry(status.clientId)}><RotateCcw size={13} /> إعادة الإرسال</button>
              </div>}
            </div>;
          })}
        </div>
        {showLatest && <MotionPressButton className="cm-jump" onClick={scrollToLatest}><ArrowDown size={15} />{connection.unreadCount ? `${ar.format(connection.unreadCount)} رسالة جديدة` : 'أحدث الرسائل'}</MotionPressButton>}
      </div>}
      {conversationAllowed && <div className="cm-chat-compose">
       {!recording && !replyDraft && <MotionPressButton type="button" className="cm-chat-insight-trigger" disabled={!chatReady} aria-haspopup="dialog" onClick={() => setInsightsOpen(true)}><Sparkles size={15} aria-hidden="true"/><strong>حديث أقرب</strong><span>أفكار تفتح الحوار</span><ChevronLeft size={14} aria-hidden="true"/></MotionPressButton>}
       {replyDraft && <div className="cm-reply-draft" role="status"><Reply size={18} aria-hidden="true"/><div>
         <strong>رد على {replyDraft.senderIsMe ? 'رسالتك' : connection.person.alias}</strong><span dir="auto">{replyDraft.body}</span>
       </div><button type="button" className="icon-btn" aria-label="إلغاء الرد" onClick={() => thread.outbox.replyTo()}><X size={18}/></button></div>}
       <div className="cm-composer-surface">
        <ChatMediaComposer source={source} requestId={connection.id} disabled={!chatReady || Boolean(replyDraft)} callActive={Boolean(voice?.occupied)} onRecording={setRecording} sent={() => { atBottom.current = true; thread.refresh(); }}/>
        <form onSubmit={submit}>
          <textarea
            ref={composer} aria-label="رسالتك" rows={1} maxLength={1000} dir="rtl"
            value={thread.draft} disabled={!chatReady} placeholder={replyDraft ? "اكتب ردك…" : "رسالتك…"}
            onChange={(e) => { thread.outbox.write(e.target.value); if (e.target.value.trim()) typing.touch(); else typing.stop(); }}
            onBlur={typing.stop}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && (e.metaKey || e.ctrlKey || window.matchMedia("(pointer: fine)").matches)) {
                e.preventDefault(); e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <MotionPressButton type="submit" aria-label="إرسال الرسالة" disabled={!thread.draft.trim() || !chatReady}><Send size={19} /></MotionPressButton>
        </form>
       </div>
        {thread.draft.length > 850 && <span className="cm-count">{ar.format(thread.draft.length)} / ١٠٠٠</span>}
      </div>}
      <span id={messageActionHelp} className="cm-message-action-help">اضغط مطولًا على الرسالة للتفاعل أو الرد أو الحذف، أو انقر بزر الفأرة الأيمن. من لوحة المفاتيح اضغط Enter أو Shift مع F10. يمكنك أيضًا سحب الرسالة للرد.</span>
      {actionMessage && hasMessageActions && !privateHidden && <MessageFocus anchor={messageActionAnchor} self={actionMessage.senderIsMe}
        label={actionMessage.attachment ? actionMessage.attachment.kind === 'photo' ? actionMessage.attachment.viewOnce ? 'صورة لمرة واحدة' : 'صورة' : 'رسالة صوتية' : actionMessage.body}
        onClose={() => setMessageActionId(null)}
        reactions={actionPermissions?.canReact ? <ReactionPicker reactions={actionMessage.reactions} pending={thread.pendingReactionIds.has(actionMessage.id)} choose={reaction => void chooseReaction(actionMessage, reaction)}/> : undefined}>
          <div className="cm-message-action-list">
            {actionPermissions?.canReply && <MotionPressButton onClick={() => { flushSync(() => setMessageActionId(null)); chooseReply(actionMessage); }}><Reply size={19} aria-hidden="true"/><span>الرد على الرسالة</span><ChevronLeft size={16} aria-hidden="true"/></MotionPressButton>}
            {actionPermissions?.canDelete && <MotionPressButton className="cm-message-action-delete" onClick={() => { setMessageActionId(null); setDeleteError(''); setDeleteTarget(actionMessage.id); }}><Trash2 size={18} aria-hidden="true"/><span>حذف لدى الجميع</span><ChevronLeft size={16} aria-hidden="true"/></MotionPressButton>}
          </div>
      </MessageFocus>}
      {insightsOpen && <Sheet title="حديث أقرب" onClose={() => setInsightsOpen(false)}><ChatInsights fit={connection.person.fit} name={connection.person.alias} disabled={!chatReady || recording} hasDraft={Boolean(thread.draft) || Boolean(replyDraft)} usedMessages={thread.rows.filter(message => !message.deletedAt && !deletedIds.has(message.id) && !message.attachment && (!('status' in message) || message.status === 'saved')).map(message => message.body)} choose={chooseConversationPrompt}/></Sheet>}
      {libraryOpen && <ChatLibrary source={source} requestId={connection.id} name={connection.person.alias} onClose={() => setLibraryOpen(false)} onJump={id => { setLibraryOpen(false); atBottom.current = false; setJumpToId(id); }} />}
      {deleteTarget && <Sheet title="حذف الرسالة للجميع" onClose={() => { if (!deleting) setDeleteTarget(null); }}>
        <div className="cm-delete-confirm"><span className="cm-delete-emblem"><Trash2 size={25}/></span><p>تُحذف الرسالة ومرفقها من المحادثة لدى الطرفين، وتظهر مكانها عبارة «تم حذف هذه الرسالة».</p><small>متاح لرسائلك خلال ٤٨ ساعة من الإرسال. قد يكون الطرف الآخر شاهدها أو حفظ نسخة منها بالفعل.</small></div>
        {deleteError && <Banner alert text={deleteError}/>}
        <button type="button" className="btn-primary" disabled={deleting} onClick={() => void deleteForEveryone()}>{deleting ? 'جارٍ الحذف…' : 'حذف لدى الجميع'}</button>
        <button type="button" className="btn-text" disabled={deleting} onClick={() => setDeleteTarget(null)}>الاحتفاظ بالرسالة</button>
      </Sheet>}
      {toolsOpen && <Sheet title="خيارات المحادثة" onClose={() => setToolsOpen(false)}>
        <p className="cm-tools-intro">خصوصيتك وخيارات التواصل، في مكان واحد.</p>
        <div className="cm-chat-tools">
          {source.searchMessages && <button disabled={!conversationAllowed} onClick={() => { setToolsOpen(false); setLibraryOpen(true); }}><Search size={20}/><span><strong>البحث والوسائط</strong><small>رسائلكما، الصور، والتسجيلات الصوتية</small></span><ChevronLeft size={16}/></button>}
          <button disabled={!conversationAllowed} onClick={() => { setToolsOpen(false); setInsightsOpen(true); }}><Sparkles size={20}/><span><strong>حديث أقرب</strong><small>ما يجمعكما وما يستحق الحديث، في سؤال</small></span><ChevronLeft size={16}/></button>
          <button onClick={()=>{setToolsOpen(false);setChatHelp(true);}}><MessageCircle size={20}/><span><strong>دليل المحادثة</strong><small>علامات الرسائل، الصور، والصوت والمكالمات</small></span><ChevronLeft size={16}/></button>
          <button onClick={() => { setToolsOpen(false); setGuide(true); }}><Sparkles size={20}/><span><strong>مسار التعارف</strong><small>مراجعة المراحل والالتزام بينكما</small></span><ChevronLeft size={16}/></button>
          {source.family&&<button onClick={() => { setToolsOpen(false); openFamily(); }}><UsersRound size={20}/><span><strong>جسر الأهل</strong><small>دعوة الأهل إلى محادثة منفصلة بموافقتكما</small></span><ChevronLeft size={16}/></button>}
          <button onClick={() => { setToolsOpen(false); setPhotos(true); }}><LockKeyhole size={20}/><span><strong>الصور الخاصة</strong><small>إدارة الصور التي تختار مشاركتها</small></span><ChevronLeft size={16}/></button>
          <button onClick={() => { setToolsOpen(false); setSafety('report'); }}><Flag size={20}/><span><strong>إبلاغ</strong><small>إرسال بلاغ للمراجعة</small></span><ChevronLeft size={16}/></button>
          <button onClick={() => { setToolsOpen(false); setSafety('block'); }}><Ban size={20}/><span><strong>حظر</strong><small>إيقاف التواصل مع هذا العضو</small></span><ChevronLeft size={16}/></button>
        </div>
      </Sheet>}
      {endMatch && <Sheet title="إنهاء التعارف" onClose={() => { if (!ending) setEndMatch(false); }}>
        <p className="cm-end-copy">هل ترغب بإنهاء التعارف مع {connection.person.alias}؟ ستُغلق المحادثة ولن يتمكّن أي منكما من إرسال رسائل أو بدء مكالمات.</p>
        <p className="cm-step-note">إذا كنتما تحتاجان وقتًا أهدأ فقط، يمكنكما اقتراح العودة مرحلة من «مسار التعارف». إنهاء التعارف لا يعيد فتح المحادثات المغلقة سابقًا.</p>
        {endError && <Banner alert text={endError}/>}
        <RematchChoice checked={allowRematch} change={setAllowRematch} disabled={ending}/>
        <button className="btn-primary" disabled={ending} onClick={() => void finishMatch()}>{ending ? 'جارٍ إنهاء التعارف…' : 'تأكيد إنهاء التعارف'}</button>
        <button className="btn-text" disabled={ending} onClick={() => setEndMatch(false)}>الاستمرار في التعارف</button>
      </Sheet>}
      {photos && <PhotoSharing requestId={connection.id} name={connection.person.alias} demo={Boolean(source.demoAcceptOutgoing)} watch={source.watch} close={() => setPhotos(false)} />}
      {chatHelp&&<HelpCenter initialTopic="chat" close={()=>setChatHelp(false)}/>}
      {safety && <SafetySheet action={safety} apply={moderate} busy={safetyBusy} error={safetyError}
        close={() => { if (!safetyBusy) { setSafety(null); setSafetyError(""); } }}/>}
      {guide && <ConversationGuide source={source} connection={connection} hasDraft={Boolean(thread.draft) || Boolean(replyDraft) || !chatReady || recording} onCompletion={onCompletion}
        openInsights={() => { setGuide(false); setInsightsOpen(true); }}
        openFamily={source.family?()=>{setGuide(false);openFamily();}:undefined}
        close={() => setGuide(false)} closed={() => { thread.outbox.clear(); close(); }}
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
  source,
  onChatChange,
  onMutual,
  openConversation,
  openRequest,
  onConversationOpened,
  conversations = false,
  matches = false,
  initialRequest,
  onCompletion,
  discoveryUnavailable = false,
  onBrowse,
}: {
  source: CommunitySource;
  onChatChange: (chat: boolean) => void;
  onMutual: (connection: Connection) => void;
  openConversation?: string;
  openRequest?: string;
  onConversationOpened: () => void;
  conversations?: boolean;
  matches?: boolean;
  initialRequest?: RequestEntry;
  onCompletion?: () => void;
  discoveryUnavailable?: boolean;
  onBrowse: () => void;
}) {
  // Keep the entry while the inbox fetch resolves; its parent consumes the handoff on mount.
  const [entry] = useState(initialRequest);
  const initialRequestId = entry?.id;
  const [list, setList] = useState<Connection[]>([]);
  const [selected, setSelected] = useState<string | null>(initialRequestId ?? null);
  const [chat, setChat] = useState(false);
  const [filter, setFilter] = useState<Category>("all");
  const [query, setQuery] = useState("");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [visitPerson, setVisitPerson] = useState<PublicPerson | null>(null);
  const [reportSent, setReportSent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recoverable, setRecoverable] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [allowRematch, setAllowRematch] = useState(false);
  const [confirm, setConfirm] = useState<
    "decline" | "cancel" | SafetyAction | null
  >(null);
  const [actionError, setActionError] = useState("");
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
      const target = loadedRows.current.find(row => row.id === targetId && (openConversation ? row.status === "accepted" : ["pending", "accepted"].includes(row.status)));
      if (target) {
        setSelected(target.id);
        setChat(Boolean(openConversation));
        setActionError("");
        window.scrollTo(0, 0);
      }
      onConversationOpened();
    });
    return () => { active = false; };
  }, [openConversation, openRequest, refresh, onConversationOpened]);
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
  function enterChat(id: string, origin: Element | null, justAccepted = false) {
    const intent = ++navigation.current;
    chatHandoff(origin, () => {
      if (intent !== navigation.current) return;
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
    action: "accept" | "demoAccept" | "decline" | "cancel" | SafetyAction,
    reason?: string,
  ) {
    if (!item || acting.current || (discoveryUnavailable && item.status === 'pending')) return;
    acting.current = true;
    const intent = navigation.current;
    setBusy(true);
    setActionError("");
    try {
      if (action === "demoAccept") {
        if (!source.demoAcceptOutgoing) return;
        await source.demoAcceptOutgoing(item.id);
      } else await source.act(item.id, action, reason || undefined, allowRematch);
      if (intent !== navigation.current) return;
      feedback('success');
      setConfirm(null);
      if (action === "accept" || action === "demoAccept") {
        setList(rows => rows.map(row => row.id === item.id ? { ...row, status: "accepted" } : row));
        const accepted = (await source.inbox()).find(row=>row.id===item.id&&row.status==='accepted');
        if (intent !== navigation.current) return;
        onMutual(accepted || { ...item, status: "accepted" });
        void refresh();
      } else {
        if (action === 'report') setReportSent(true);
        setSelected(null);
        setChat(false);
        setList((previous) => previous.filter((c) => c.id !== item.id));
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
        source={source}
        onCompletion={onCompletion}
        onReported={()=>setReportSent(true)}
        connection={item}
        back={leaveChat}
        close={closeDetail}
        backLabel={conversations ? "العودة للمحادثات" : matches ? "العودة للتعارف" : "العودة للإشعارات"}
      />
    );
  if (item)
    return (
      <Profile source={source} person={item.person} connectionId={item.status==='accepted'?item.id:undefined} back={closeDetail} backText={matches?'التعارف':'الإشعارات'} featured={entry?.id === item.id && entry.featured} primary={<>
        {actionError && <Banner alert text={actionError} />}
        {item.status === 'pending' && <RequestWaiting connection={item}/>}
        {item.status === "accepted" ? (
          <button className="btn-primary" data-chat-entry="" onClick={() => fromProfile(item.id, false)}>
            <MessageCircle size={19} /> متابعة المحادثة <ArrowLeft className="mp-action-arrow" size={17}/>
          </button>
        ) : item.direction === "incoming" ? (
          <>
            <p className="cm-help">
              <LockKeyhole size={15} /> قبول الطلب يفتح محادثة خاصة بينكما.
            </p>
            <button
              className="btn-primary"
              data-chat-entry=""
              disabled={busy}
              onClick={() => void act("accept")}
            >
              <Check size={19} /> {busy?'جارٍ قبول الطلب…':'قبول طلب التعارف'}
            </button>
            <button
              className="btn-text"
              disabled={busy}
              onClick={() => setConfirm("decline")}
            >
              <CircleMinus size={16}/> الاعتذار عن الطلب
            </button>
          </>
        ) : (
          <>
            <p className="cm-help">طلبك بانتظار ردّ الطرف الآخر.</p>
            {source.demoAcceptOutgoing && item.id!=='tester-pair' && <button className="btn-secondary cm-demo-peer" data-chat-entry="" disabled={busy}
              onClick={() => void act("demoAccept")}><MessageCircle size={15} /> محاكاة قبول الطرف الآخر</button>}
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => {setAllowRematch(false);setConfirm("cancel");}}
            >
              <RotateCcw size={16}/> سحب طلب التعارف
            </button>
          </>
        )}
      </>}>
        <div className="cm-safety">
          <button disabled={busy} onClick={() => setConfirm("report")}>
            <Flag size={15} /> إبلاغ
          </button>
          <button disabled={busy} onClick={() => setConfirm("block")}>
            <Ban size={15} /> حظر
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
    const unavailable = discoveryUnavailable || (!existing && (visitPerson.atCapacity || visitPerson.viewerAtCapacity));
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
        {busy ? 'جارٍ فتح الطلب…' : existing?.status === 'accepted' ? 'متابعة المحادثة' : existing ? 'عرض طلب التعارف' : unavailable ? 'طلب التعارف غير متاح حاليًا' : 'إرسال طلب تعارف'}
      </button>
      {!existing && !unavailable && <p className="cm-help">يفتح قبول الطرف الآخر محادثة خاصة بينكما.</p>}
    </>}/>;
  }
  if (matches) return <MatchesOverview source={source} connections={list} loading={loading} error={error}
    onRetry={()=>void refresh()} onBrowse={onBrowse}
    onProfile={id=>{listScroll.current=window.scrollY;navigation.current++;flushSync(()=>{setSelected(id);setChat(false);setActionError('');setNotice('');});window.scrollTo({top:0,behavior:'instant'});}}
    onConversation={(id,origin)=>{listScroll.current=window.scrollY;enterChat(id,origin);}}/>;
  if (!conversations) return <section className="screen-content cm-view cm-notifications-view">
    <header className="cm-header"><Brand /></header>
    <div className="cm-title"><h1 tabIndex={-1}>الإشعارات</h1></div>
    <ProfileVisitNotice/>
    {reportSent && <ReportReceipt demo={Boolean(source.demoAcceptOutgoing)} close={()=>setReportSent(false)}/>}
    {notice && <Banner text={notice}/>}
    <NotificationFeed source={source} connections={list} loading={loading} error={error} onBrowse={onBrowse} onRetry={()=>void refresh()}
      onProfile={person => { setVisitPerson(person); void source.noteProfileOpen?.(person.id).catch(() => {}); }}
      onConversation={id => { if (list.some(row => row.id === id && row.status === 'accepted')) enterChat(id, null); else setNotice('هذا التعارف لم يعد متاحًا.'); }}
      onRequest={id => { listScroll.current = window.scrollY; navigation.current++; setSelected(id); setChat(false); setActionError(''); setNotice(''); window.scrollTo(0,0); }} />
    {error && <button className="btn-text" onClick={() => void refresh()}>إعادة المحاولة</button>}
    <RequestHistory source={source}/>
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
    <section className="screen-content cm-view">
      <ScenePaths className="df-arrival-paths" parallax />
      <header className="cm-header">
        <Brand />
      </header>
      <div className="cm-title">
        <h1 tabIndex={-1}>{conversations ? "المحادثات" : "الإشعارات"}</h1>
      </div>
      {reportSent && <ReportReceipt demo={Boolean(source.demoAcceptOutgoing)} close={()=>setReportSent(false)}/>}

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
              ? "تبدأ المحادثة عندما يقبل الطرفان طلب التعارف."
              : "تظهر هنا طلبات التعارف المتعلقة بملفك."
          }
          action={search ? <button className="btn-secondary" onClick={() => setQuery('')}>مسح البحث</button> :
            conversations && onlyUnread ? <button className="btn-secondary" onClick={() => setOnlyUnread(false)}>عرض كل المحادثات</button> :
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
              <strong>{row.person.alias} <VerifiedBadge claims={row.person.manualVerifications} compact interactive={false}/> {row.person.isDemo&&!source.simulation&&<span className="nf-demo-tag">توضيحي</span>} {row.person.exclusive && <span className="cm-exclusive-badge">تعارف حصري</span>}</strong>
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
      <RequestHistory source={source}/>
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
    <main className="app-screen cm-shell" dir="rtl" data-community-tab={tab}>
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
        <Requests key={tab} source={source} onChatChange={setChat} conversations={tab === "chats"} matches={tab === 'curated'}
          onBrowse={() => onTab('discover')}
          discoveryUnavailable={discoveryUnavailable} onCompletion={props.onCompletion}
          onMutual={props.onMutual} openConversation={props.openConversation??conversationToOpen}
          openRequest={props.openRequest}
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
          chatUnread={props.chatUnread}
          onAccount={onAccount}
        />
      )}
    </main>
  );
}
