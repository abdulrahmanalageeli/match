import { SignupBasicsSlides, type SignupSlidesHandle } from './SignupBasicsSlides';
import { MensPhotoChoice } from './MensPhotoChoice';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCheck, ChevronLeft, Feather, HeartHandshake, LockKeyhole, MapPin, Pencil, ShieldCheck, Sparkles, UserRound, X } from "../BrandIcons";
import { Brand } from "../Brand";
import { ScenePaths } from '../ScenePaths';
import { MotionPressButton, MotionReveal } from '../motion/Reanimated';
import { CompatibilityFields } from "../compatibility/CompatibilityFields";
import { categories, dimensions, interests } from "../compatibility/model";
import type { Profile, PortraitRevealPolicy } from "../types";
import { arabicNumber, chapters, initialDraft, profileBaseline, toProfile, validateStep, type Answers, type ApplicationDraft, type Chapter, type Issue } from "./draft";
import { ageFromBirthday, latestAdultBirthday } from "../profile/birthday";
import { SheetChoiceSelect as ChoiceSelect } from '../ui/SheetChoiceSelect';
import { ageOptions, cityOptions, educationOptions, professionOptions } from '../profile/profileOptions';
import { intakeVault, accountDraftsAvailable } from "./persistence";
import "./onboarding.css";
import { MarriageBasicsFields, PartnerCriteriaFields, PersonalityFields, maritalLabels, tribalLabels, smokingLabels } from "./MarriageFields";
import { personalityQuestions } from "../compatibility/personality";
import { criteriaModes, polygynyLabels, religiousAffiliationLabels, prayerPracticeLabels, marriageTimelineLabels, meetingPreferenceLabels } from "../compatibility/marriage";
import { dressStyles, dressFlexibilities, skinTones } from "../compatibility/appearance";
import { ProfilePhotoChoice } from "./ProfilePhotoChoice";
import type { PortraitDraft } from '../photos/portraitPreparation';
import { resumeStagedPortrait } from '../photos/stagedPortrait';
import type { CommunitySource } from '../community/data';
import { emptyConsents, recordedAccountAgreements, applyConsentChoices, publicSensitiveFields, withoutSensitive, withoutAssessment, type SignupConsents } from '../legal/consent';
import { ConsentChoice, ConsentGate, SignupConsentReview } from '../legal/ConsentChoices';
import { ProfilePreview, ProfileStudio, ProfilePortraitPreview } from './ProfileStudio';
import { ProfilePromptFields } from './ProfilePromptFields';
import { HelpButton } from '../help/HelpCenter';
import { KeyboardDismiss } from '../mobile/KeyboardDismiss';
import { feedback } from '../feedback/haptics';
import { BeenaFields } from '../beena/BeenaFields';
import { beenaProgress, beenaScenarios } from '../beena/model';
import { InterviewEntry, InterviewPanel } from '../interview/InterviewPanel';
import { applyInterviewAnswers } from '../interview/model';
import { applyProfileProposals, profileContextFromAnswers, type ProfileProposal } from '../interview/profileCapture';
import { assessmentContextFromAnswers } from '../interview/assessmentContext';
import { buildProfileAnswerProvenance, type ProfileAnswerProvenance } from '../interview/profileProvenance';
import { requestInterview, type InterviewAuth } from '../interview/api';
import type { InterviewDocument } from '../interview/types';
import type { SignupAgreements } from '../auth/signupReturn';
import './journey.css';

export type { ApplicationDraft } from "./draft";

type Props = {
  initial: Profile | null;
  previouslyApproved: boolean;
  nextPublicProfileEditAt?: string | null;
  profileReviewPending?: boolean;
  busy: boolean;
  back: () => void;
  onPrivacy: () => void;
  save: (p: Profile, portrait?:PortraitDraft|null, portraitPolicy?:PortraitRevealPolicy, provenance?:ProfileAnswerProvenance[]) => void;
  portraitSource?:CommunitySource|null;
  preview?:boolean;
  exitPreview?: () => void;
  startAt?:Chapter;
  includeCompatibility?: boolean;
  draftRef?: RefObject<ApplicationDraft | null>;
  draftOwner?: string;
  demo?: boolean;
  interviewAuth?: InterviewAuth | null;
  accountAgreements?: SignupAgreements | null;
  defaultContact?: string;
};

const chapterIcons = { identity: UserRound, story: Feather, details: UserRound, avatar: ShieldCheck, criteria: HeartHandshake, compatibility: Sparkles, personality: Sparkles, beena: BookOpen, preferences: HeartHandshake, review: CheckCheck };
const appearanceNames = Object.fromEntries([...skinTones, ...dressStyles, ...dressFlexibilities].map(option => [option.value, option.label]));
const chapterFields: Partial<Record<Chapter,(keyof Answers)[]>> = {
  identity:['displayName','birthDate','age','gender','city'], story:['profession','bio','education','marriageIntent','lookingFor','valuesStatement','lifeTogether'],
  details:['marriageBasics'], avatar:['publicAvatar','portrait'], criteria:['partnerCriteria'],
  compatibility:['interestIds','surveyAnswers','hardRequirements','priorityCategories'], personality:['personalityAnswers'],
  beena:['beena'],
  preferences:['preferredMinAge','preferredMaxAge','familyPreference','contact'],
};

const registrationMilestones = [
  { key: 'basics', label: 'الأساسيات', chapters: ['identity'] },
  { key: 'assessment', label: 'جلسة التوافق', chapters: ['compatibility'] },
  { key: 'details', label: 'تفاصيلك', chapters: ['details'] },
  { key: 'criteria', label: 'معايير الشريك', chapters: ['criteria', 'preferences'] },
  { key: 'profile', label: 'ملفك وصورتك', chapters: ['story', 'avatar'] },
  { key: 'review', label: 'المراجعة', chapters: ['review'] },
] as const satisfies ReadonlyArray<{ key: string; label: string; chapters: readonly Chapter[] }>;

function withDefaultContact(draft: ApplicationDraft, value?: string): ApplicationDraft {
  const contact = value?.trim();
  if (!contact || draft.baseline !== 'new' || draft.answers.contact.trim()) return draft;
  return { ...draft, answers: { ...draft.answers, contact } };
}

function ReviewGroup({ title, edit, children, visible=true, expanded=false }: { title: string; edit: () => void; children: ReactNode; visible?:boolean; expanded?:boolean }) {
  if(!visible)return null;
  return (
    <details className="nf-intake-review-group" open={expanded||undefined}>
      <summary><span>{title}</span><ChevronLeft size={16} aria-hidden="true"/></summary>
      <div className="nf-review-group-content">{children}<button className="nf-review-edit" type="button" onClick={edit} aria-label={"تعديل " + title}><Pencil size={13} aria-hidden="true" /> تعديل هذا القسم</button></div>
    </details>
  );
}

function Review({ p, edit, withCompatibility, registration = false, changed, portraitChange, portraitSource, portraitPolicy, sensitivePublication }: { p: Answers; edit: (step: Chapter) => void; withCompatibility: boolean; registration?:boolean; changed?:Set<Chapter>; portraitChange?:PortraitDraft|null; portraitSource?:CommunitySource|null; portraitPolicy?:PortraitRevealPolicy; sensitivePublication:boolean }) {
  const groupProps=(step:Chapter)=>({visible:!changed||changed.has(step),expanded:changed?.size===1});
  const photoUrl=portraitChange===null?null:portraitChange?.url;
  const hasPortrait=Boolean(photoUrl||(photoUrl!==null&&p.portrait));
  const reveal=portraitChange?.revealPolicy??portraitPolicy??p.portrait?.revealPolicy??'never';
  const chosen = interests.filter(item => p.interestIds?.includes(item.id));
  const priorities = categories.filter(item => p.priorityCategories?.includes(item.id));
  const requirements = dimensions.filter(item => p.hardRequirements?.includes(item.id));
  const styles = dimensions.flatMap(dimension => {
    const self = dimension.options.find(option => option.code === p.surveyAnswers?.[dimension.id]);
    const partner = dimension.options.find(option => option.code === p.surveyAnswers?.[dimension.partnerId]);
    return [self && { key: dimension.id, label: dimension.selfPrompt, value: self.self },
      partner && { key: dimension.partnerId, label: dimension.partnerPrompt, value: partner.partner }].filter(item => !!item);
  });
  return (
    <div className="nf-intake-reviews">
      <ReviewGroup title="الأساسيات" edit={() => edit("identity")} {...groupProps('identity')}>
        <strong className="nf-review-alias" dir="auto">{p.displayName}</strong>
        <p className="nf-review-meta"><MapPin size={14} aria-hidden="true" />{p.city}<span aria-hidden="true">·</span>{arabicNumber(Number(p.age))} عامًا<span aria-hidden="true">·</span>{p.gender === "woman" ? "امرأة" : "رجل"}</p>
      </ReviewGroup>
      <ReviewGroup title="تفاصيلك الشخصية" edit={() => edit("details")} {...groupProps('details')}>
        <p>{sensitivePublication?'اخترت عرض التفاصيل الحساسة للأعضاء المؤهلين.':'التفاصيل الحساسة أدناه خاصة؛ لن تظهر للأعضاء ما لم توافق على عرضها.'}</p>
        {p.marriageBasics?.heightCm && <p>الطول: {arabicNumber(p.marriageBasics.heightCm)} سم</p>}
        {p.marriageBasics?.weightKg && <p>الوزن: {arabicNumber(p.marriageBasics.weightKg)} كجم</p>}
        {p.marriageBasics?.spokenLanguages?.length ? <p>اللغات: {p.marriageBasics.spokenLanguages.join(' · ')}</p> : null}
        {p.marriageBasics?.preferredLanguage && <p>لغة التواصل المفضلة: {p.marriageBasics.preferredLanguage}</p>}
        {p.marriageBasics?.nationality && <p>الجنسية: {p.marriageBasics.nationality}</p>}
        {p.marriageBasics?.tribalBackground && p.marriageBasics.tribalBackground !== 'prefer_not_to_say' && <p>الخلفية القبلية: {tribalLabels[p.marriageBasics.tribalBackground]}{p.marriageBasics.tribeName ? " — " + p.marriageBasics.tribeName : ""}</p>}
        {p.marriageBasics?.maritalStatus && <p>الحالة الاجتماعية: {maritalLabels[p.marriageBasics.maritalStatus]}</p>}
        {p.marriageBasics?.maritalStatus === 'married' && p.marriageBasics.currentWives !== undefined && <p>عدد الزوجات حاليًا: {arabicNumber(p.marriageBasics.currentWives)}</p>}
        {p.marriageBasics?.polygynyPreference && p.marriageBasics.polygynyPreference !== 'prefer_not_to_say' && <p>الموقف من التعدد: {p.gender === 'woman' ? ({not_open:'لا أقبل التعدد',open_to_discussion:'منفتحة على النقاش',open:'منفتحة على التعدد'})[p.marriageBasics.polygynyPreference] : polygynyLabels[p.marriageBasics.polygynyPreference]}</p>}
        {p.marriageBasics?.religiousAffiliation && p.marriageBasics.religiousAffiliation !== 'prefer_not_to_say' && <p>المذهب: {religiousAffiliationLabels[p.marriageBasics.religiousAffiliation]}</p>}
        {p.marriageBasics?.prayerPractice && p.marriageBasics.prayerPractice !== 'prefer_not_to_say' && <p>الصلاة في حياتي: {prayerPracticeLabels[p.marriageBasics.prayerPractice]}</p>}
        {p.marriageBasics?.marriageTimeline && <p>توقيت الزواج: {marriageTimelineLabels[p.marriageBasics.marriageTimeline]}</p>}
        {p.marriageBasics?.meetingPreference && <p>تفضيل اللقاء: {meetingPreferenceLabels[p.marriageBasics.meetingPreference]}</p>}
        {p.marriageBasics?.childrenCount !== undefined && <p>عدد الأبناء: {arabicNumber(p.marriageBasics.childrenCount)}</p>}
        {p.marriageBasics?.smoking && <p>التدخين: {smokingLabels[p.marriageBasics.smoking]}</p>}
        {p.marriageBasics?.skinTone && <p>البشرة: <span className="nf-review-skin" style={{ backgroundColor: skinTones.find(t => t.value === p.marriageBasics?.skinTone)?.color }} aria-hidden="true" />{appearanceNames[p.marriageBasics.skinTone]}</p>}
        {p.marriageBasics?.dressStyle && <p>اللباس الحالي: {appearanceNames[p.marriageBasics.dressStyle]}</p>}
        {p.marriageBasics?.dressFlexibility && <p>مناقشة اللباس: {appearanceNames[p.marriageBasics.dressFlexibility]}</p>}
        {!Object.values(p.marriageBasics ?? {}).some(v => v !== undefined && v !== "" && v !== 'prefer_not_to_say') && <p>لم تضف تفاصيل اختيارية.</p>}
      </ReviewGroup>
      {<ReviewGroup title="صورة ملفك" edit={() => edit("avatar")} {...groupProps('avatar')}>
        <div className="nf-review-avatar"><div className="nf-studio-avatar nf-review-portrait"><ProfilePortraitPreview answers={{...p,publicAvatar:sensitivePublication?p.publicAvatar:null}} photoUrl={photoUrl} portraitSource={portraitSource}/></div><p>{hasPortrait ? <>صورتك كما ستظهر للأعضاء المؤهلين.<br/>درجة التمويه: {arabicNumber(portraitChange?.blur??p.portrait?.blur??0)}٪</> : p.publicAvatar&&sensitivePublication ? <>{appearanceNames[p.publicAvatar.style]} · {appearanceNames[p.publicAvatar.skinTone]}<br/>رسم توضيحي يظهر في ملفك، دون صورة شخصية.</> : <>سيظهر حرف من اسمك. عرض الرسم الذي يعكس البشرة يحتاج إلى موافقتك على عرض التفاصيل الحساسة.</>}</p></div>
        {hasPortrait&&<p>إزالة التمويه: {{never:'لا تُزال تلقائيًا',matched:'بعد قبول التعارف من الطرفين',serious:'عند النقاش الجاد حول الزواج',family:'عند الخطوة الرسمية أو العائلية'}[reveal]}{reveal!=='never'&&' · للطرف المؤهل فقط، مع حفظ نسخة واضحة خاصة.'}</p>}
      </ReviewGroup>}
      {withCompatibility && <ReviewGroup title="متطلبات الشريك الخاصة" edit={() => edit("criteria")} {...groupProps('criteria')}>
        {([['sharedLanguage', 'لغة مشتركة'], ['education', 'المؤهل التعليمي'], ['profession', 'المجال المهني'], ['height', 'الطول'], ['weight', 'الوزن'], ['tribalBackground', 'الخلفية القبلية'], ['nationality', 'جنسية الشريك'], ['maritalStatus', 'الحالة الاجتماعية'], ['children', 'وجود أبناء'], ['smoking', 'التدخين'], ['skinTone', 'لون البشرة'], ['dressStyle', 'اللباس الحالي'], ['dressFlexibility', 'مناقشة اللباس']] as const).map(([key, label]) => {
          const criterion = p.partnerCriteria?.[key];
          if (!criterion || criterion.mode === "any") return null;
          let target = "";
          if ("min" in criterion || "max" in criterion) target = `${criterion.min ?? "…"} – ${criterion.max ?? "…"}`;
          if ("values" in criterion) target = criterion.values?.map(v => ({ ...maritalLabels, ...appearanceNames } as Record<string, string>)[v] ?? v).join("، ") ?? "";
          if ("target" in criterion) target = ({ tribal: "قبلي", non_tribal: "غير قبلي", same_tribe: "من نفس قبيلتي", none: "دون أبناء", any: "لا يهمني", never: "لا يدخّن", open_to_discussion: "منفتحة على النقاش", open_to_change: "منفتحة على التغيير إذا اقتنعت به" })[criterion.target ?? "any"];
          if ('exclude' in criterion && criterion.exclude) target='باستثناء: '+target;
          return <p key={key}>{label}: {criteriaModes.find(m => m.value === criterion.mode)?.label} — {target}</p>;
        })}
        {!Object.values(p.partnerCriteria ?? {}).some(c => c.mode !== "any") && <p>ليس لديك تفضيل محدد لهذه التفاصيل.</p>}
      </ReviewGroup>}
      <ReviewGroup title="حياتك" edit={() => edit("story")} {...groupProps('story')}>
        <strong>{p.profession}</strong><p className="nf-review-bio" dir="auto">{p.bio}</p>
        {p.education && <p>الدراسة: {p.education}</p>}
        {p.marriageIntent && <p>نيّتي من التعارف: {p.marriageIntent}</p>}
        {p.lookingFor && <><strong>ما أبحث عنه</strong><p className="nf-review-bio" dir="auto">{p.lookingFor}</p></>}
        {p.valuesStatement && <><strong>ما أقدّره ولا أستغني عنه</strong><p className="nf-review-bio" dir="auto">{p.valuesStatement}</p></>}
        {p.lifeTogether && <><strong>الحياة التي أتخيلها</strong><p className="nf-review-bio" dir="auto">{p.lifeTogether}</p></>}
      </ReviewGroup>
      {withCompatibility && <ReviewGroup title="التوافق" edit={() => edit("compatibility")} {...groupProps('compatibility')}>
        {chosen.length > 0 && <ul className="nf-review-interests">{chosen.map(item => <li key={item.id}>{item.label}</li>)}</ul>}
        {priorities.length > 0 && <p>أولوياتي: {priorities.map(c => c.label).join("، ")}</p>}
        {requirements.length > 0 && <p>شروطي الأساسية: {requirements.map(d => d.title).join("، ")}</p>}
        {styles.length > 0 && <details className="nf-review-styles"><summary>إجاباتي الخاصة ({arabicNumber(styles.length)})</summary>
          <dl>{styles.map(item => <div key={item.key}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
        </details>}
        {!chosen.length && !styles.length && !priorities.length && <p>لم تضف تفضيلات اختيارية.</p>}
      </ReviewGroup>}
      {withCompatibility && <ReviewGroup title={registration ? "ملامح شخصيتك" : "تقييم الشخصية الخاص"} edit={() => edit(registration ? "compatibility" : "personality")} {...groupProps('personality')}>
        <p>أجبت عن {arabicNumber(personalityQuestions.filter(q => p.personalityAnswers?.[q.id]).length)} من {arabicNumber(personalityQuestions.length)} سؤالًا.</p>
        <details className="nf-review-styles"><summary>مراجعة إجاباتي</summary><dl>{personalityQuestions.flatMap(q => { const answer = q.options.find(o => o.code === p.personalityAnswers?.[q.id]); return answer ? [<div key={q.id}><dt>{q.prompt}</dt><dd>{answer.label}</dd></div>] : []; })}</dl></details>
      </ReviewGroup>}
      {withCompatibility && !registration && <ReviewGroup title="بيننا · مواقف الحياة" edit={() => edit('beena')} {...groupProps('beena')}>
        <p>أكملت {arabicNumber(beenaProgress(p.beena).answered)} من ٦ مواقف. إجاباتك فردية وخاصة.</p>
        {!!p.beena?.story?.text.trim() && <><strong>قصتي · {p.beena.story.share ? 'تظهر للأعضاء المؤهلين' : 'خاصة بي'}</strong><p dir="auto">{p.beena.story.text}</p></>}
        <details className="nf-review-styles"><summary>مراجعة إجاباتي</summary><dl>{beenaScenarios.map(s=>{const a=p.beena?.answers[s.id];return a&&(a.self||a.partner?.length)?<div key={s.id}><dt>{s.title}</dt><dd>أسلوبي: {s.options.find(o=>o.code===a.self)?.label??'لم أحدد بعد'}<br/>أرحّب بـ: {s.options.filter(o=>a.partner?.includes(o.code)).map(o=>o.label).join('، ')||'لم أحدد بعد'}{a.importance===2&&' · مهم جدًا لي'}</dd></div>:null;})}</dl></details>
      </ReviewGroup>}
      <ReviewGroup title="تفضيلات التعارف" edit={() => edit("preferences")} {...groupProps('preferences')}>
        <p>العمر من {arabicNumber(Number(p.preferredMinAge))} إلى {arabicNumber(Number(p.preferredMaxAge))} عامًا</p>
        <p>إشراك الأهل: {p.familyPreference}</p>
        <p className="nf-review-contact"><LockKeyhole size={13} aria-hidden="true" />وسيلة التواصل الخاصة <bdi dir="auto">{p.contact}</bdi></p>
      </ReviewGroup>
    </div>
  );
}

export function GuidedApplication({ initial, previouslyApproved, nextPublicProfileEditAt, profileReviewPending=false, save, busy, back, onPrivacy, portraitSource, preview=false, exitPreview, startAt,
  includeCompatibility = true, draftRef, draftOwner = "", demo = false, interviewAuth = null, accountAgreements = null, defaultContact }: Props) {
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [fallbackAvailable, setFallbackAvailable] = useState(false);
  const [aiComplete, setAiComplete] = useState(false);
  const [interviewApplied, setInterviewApplied] = useState(false);
  const [interviewRevision, setInterviewRevision] = useState(0);
  const confirmedProfileProposals = useRef<ProfileProposal[]>([]);
  const interviewVersion = useRef<{model?:string|null;promptVersion?:string|null;confirmedAt?:string|null}>({});
  const baseline = profileBaseline(initial);
  const deviceDraft = !demo && intakeVault.available(draftOwner);
  const accountDraft = deviceDraft && accountDraftsAvailable();
  const [draft, setDraft] = useState<ApplicationDraft>(() => {
    const saved = draftOwner && draftRef?.current?.owner === draftOwner && draftRef.current.baseline === baseline
      ? draftRef.current : initialDraft(draftOwner, initial);
    const requestedStep = startAt ?? saved.step;
    const step = !initial && requestedStep !== 'identity' && validateStep('identity', saved.answers, true, true, includeCompatibility)
      ? 'identity' : requestedStep;
    return withDefaultContact({...saved, step: !initial && ["personality", "beena"].includes(step) ? "compatibility" : step, returnToReview: startAt ? Boolean(initial) : saved.returnToReview}, defaultContact);
  });
  const [assessmentPath, setAssessmentPath] = useState<'choice'|'questions'>(() =>
    dimensions.some(d => d.options.some(o => o.code === draft.answers.surveyAnswers?.[d.id] || o.code === draft.answers.surveyAnswers?.[d.partnerId])) ? 'questions' : 'choice');
  const [reviewAllCompatibility, setReviewAllCompatibility] = useState(false);
  const [reviewAllBeena, setReviewAllBeena] = useState(false);
  const [reviewAllPersonality, setReviewAllPersonality] = useState(false);
  const [personalityDirect, setPersonalityDirect] = useState(false);
  const current = useRef(draft);
  const [consents,setConsents]=useState<SignupConsents>(()=>({...emptyConsents(),...recordedAccountAgreements(initial?.signupConsents ?? accountAgreements),sensitiveProfile:draft.permissions?.sensitiveProfile??initial?.signupConsents?.sensitiveProfile===true,sensitivePublication:initial?.signupConsents?.version==='2026-11-07-privacy'&&initial.signupConsents.sensitiveProfile===true&&initial.signupConsents.sensitivePublication===true,assessment:draft.permissions?.assessment??initial?.signupConsents?.assessment===true,photo:initial?.signupConsents?.photo===true}));
  const consentRef = useRef(consents);
  consentRef.current = consents;
  const [saveProgress, setSaveProgress] = useState<'idle'|'pending'|'saving'|'saved'|'error'>('idle');
  const savedSnapshot = useRef('');
  const loadFailed = useRef(false);
  const [portraitChange,setPortraitChange]=useState<PortraitDraft|null|undefined>();
  const portraitChoice = useRef(portraitChange);
  portraitChoice.current = portraitChange;
  const resumedPortraitOwner = useRef<string | null>(null);
  const [portraitPolicy,setPortraitPolicy]=useState<PortraitRevealPolicy>();
  const [photoBusy,setPhotoBusy]=useState(false);
  const portraitUrl = portraitChange?.url;
  useEffect(() => () => { if (portraitUrl) URL.revokeObjectURL(portraitUrl); }, [portraitUrl]);
  const latestInitial = useRef(initial);
  latestInitial.current = initial;
  const touched = useRef(false);
  const lease = useRef(intakeVault.revision(draftOwner));
  const mounted = useRef(true);
  const savingLater = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const [confirmPhotoDraftLoss,setConfirmPhotoDraftLoss]=useState(false);
  const photoDraftWarning=useRef<HTMLElement>(null);
  useEffect(()=>{if(confirmPhotoDraftLoss){photoDraftWarning.current?.focus();photoDraftWarning.current?.scrollIntoView({block:'center'});}},[confirmPhotoDraftLoss]);
  const [checkingDevice, setCheckingDevice] = useState(() =>
    deviceDraft && !(draftRef?.current?.owner === draftOwner && draftRef.current.baseline === baseline));
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  useEffect(() => {
    if (demo || preview || !portraitSource || checkingDevice || resumedPortraitOwner.current === draftOwner) return;
    resumedPortraitOwner.current = draftOwner;
    let active = true, finished = false;
    void resumeStagedPortrait().then(restored => {
      if (!restored) return;
      if (!active || portraitChoice.current !== undefined) { URL.revokeObjectURL(restored.url); return; }
      portraitChoice.current = restored;
      setPortraitChange(restored);
      setConsents(previous => ({ ...previous, photo: true }));
    }).catch(() => { /* The photo step remains available for retry or a fresh selection. */ }).finally(() => { finished = true; });
    return () => { active = false; if (!finished) resumedPortraitOwner.current = null; };
  }, [demo, preview, portraitSource, checkingDevice, draftOwner]);
  const [storageState, setStorageState] = useState<"restored" | "loadError" | "saveError" | null>(null);
  const [error, setError] = useState<Issue | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const basicSlides = useRef<SignupSlidesHandle>(null);
  const previousStep = useRef(draft.step);
  const direction = useRef<"next" | "back">("next");
  const editing = Boolean(initial);
  const registrationOrder: Chapter[] = ['identity','compatibility','details','criteria','preferences','story','avatar','review'];
  const steps = (editing ? chapters : registrationOrder.map(key => chapters.find(entry => entry.key === key)!)).filter(entry => includeCompatibility || !['compatibility','criteria','personality','beena'].includes(entry.key));
  const idx = Math.max(0, steps.findIndex(entry => entry.key === draft.step));
  const chapter = steps[idx];
  const milestones = registrationMilestones.filter(milestone => milestone.chapters.some(key => steps.some(step => step.key === key)));
  const milestoneIdx = Math.max(0, milestones.findIndex(milestone => (milestone.chapters as readonly Chapter[]).includes(chapter.key)));
  const milestone = milestones[milestoneIdx];
  const Icon = chapterIcons[chapter.key];
  const usesBasicSlides = !editing && ['identity','story','details'].includes(chapter.key);
  const p = draft.answers;
  let reviewAnswers=consents.sensitiveProfile?p:withoutSensitive(p);
  if(!consents.assessment)reviewAnswers=withoutAssessment(reviewAnswers);
  if(reviewAnswers.gender==='woman'&&reviewAnswers.publicAvatar===undefined&&reviewAnswers.marriageBasics?.dressStyle&&reviewAnswers.marriageBasics?.skinTone&&!portraitChange&&!initial?.portrait)
    reviewAnswers={...reviewAnswers,publicAvatar:{style:reviewAnswers.marriageBasics.dressStyle,skinTone:reviewAnswers.marriageBasics.skinTone}};
  const [editorHome, setEditorHome] = useState(() => Boolean(initial) && draft.step === 'identity' && !draft.returnToReview);
  const originalAnswers=initialDraft(draftOwner,initial).answers;
  const changedSections=new Set<Chapter>((Object.keys(chapterFields) as Chapter[]).filter(key=>chapterFields[key]!.some(field=>JSON.stringify(p[field])!==JSON.stringify(originalAnswers[field]))));
  if(portraitChange!==undefined)changedSections.add('avatar');
  if(portraitPolicy!==undefined&&portraitPolicy!==(initial?.portrait?.revealPolicy??'never'))changedSections.add('avatar');
  if((['sensitiveProfile','sensitivePublication','assessment','photo'] as const).some(kind=>consents[kind] !== (initial?.signupConsents?.[kind] === true))
    || (['adult','terms','privacy'] as const).some(kind=>consents[kind] !== recordedAccountAgreements(initial?.signupConsents ?? accountAgreements)[kind]))changedSections.add('review');
  function chooseConsent(kind:Exclude<keyof SignupConsents,'version'>,value:boolean){
    if(error?.field==='consent')setError(null);
    const next = {...consentRef.current,[kind]:value,...(kind==='sensitiveProfile'&&!value?{sensitivePublication:false}:{})};
    consentRef.current = next;
    touched.current = true;
    setConsents(next);
    commit({permissions:{...current.current.permissions,version:next.version,sensitiveProfile:next.sensitiveProfile,assessment:next.assessment,...(kind==='assessment'?{interview:value}: {})}});
    if(kind==='sensitiveProfile'&&!value)update(withoutSensitive(current.current.answers));
    if(kind==='assessment'&&!value){confirmedProfileProposals.current=[];interviewVersion.current={};update(withoutAssessment(current.current.answers));setInterviewOpen(false);setInterviewApplied(false);setAssessmentPath('choice');setReviewAllCompatibility(false);setReviewAllBeena(false);setReviewAllPersonality(false);setPersonalityDirect(false);}
    if(kind==='photo'&&!value){setPortraitChange(null);setPortraitPolicy('never');}
  }

  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const recorded = recordedAccountAgreements(initial?.signupConsents ?? accountAgreements);
    setConsents(previous => ({ ...previous, adult: previous.adult || recorded.adult, terms: previous.terms || recorded.terms, privacy: previous.privacy || recorded.privacy }));
  }, [accountAgreements, initial?.signupConsents]);
  useEffect(() => {
    if (editing || checkingDevice || !interviewAuth || !consentRef.current.assessment) return;
    let active = true;
    void requestInterview(interviewAuth, { action: 'load' }).then(snapshot => {
      if (!active) return;
      setFallbackAvailable(snapshot.fallbackAvailable === true);
      confirmedProfileProposals.current = snapshot.document?.profileConfirmed ?? [];
      interviewVersion.current = snapshot.document ? { model:snapshot.document.model, promptVersion:snapshot.document.promptVersion, confirmedAt:snapshot.document.confirmedAt } : {};
      if (snapshot.document?.profileConfirmed?.length) setInterviewApplied(true);
      const knownProfileFields = new Set(profileContextFromAnswers(current.current.answers, consentRef.current.sensitiveProfile).map(field => field.fieldId));
      const restoreProfile = (snapshot.document?.profileConfirmed ?? []).filter(field => !knownProfileFields.has(field.fieldId));
      if (restoreProfile.length) update(applyProfileProposals(current.current.answers, restoreProfile, consentRef.current.sensitiveProfile));
      const confirmed = snapshot.document?.status === 'confirmed' ? snapshot.document.confirmed.filter(item => item.kind !== 'beena') : [];
      const complete = confirmed.length === dimensions.length * 2 + personalityQuestions.length;
      setAiComplete(complete);
      if (complete) {
        const saved = current.current.answers, restored = applyInterviewAnswers(saved, confirmed);
        update({ surveyAnswers: restored.surveyAnswers, personalityAnswers: restored.personalityAnswers });
      }
    }).catch(() => { /* The session itself offers a retry; a network error is not a bypass. */ });
    return () => { active = false; };
  }, [checkingDevice, consents.assessment, editing, interviewAuth?.token, interviewAuth?.testSession]);
  useEffect(() => {
    if (current.current.baseline !== baseline || current.current.owner !== draftOwner) {
      const fresh = withDefaultContact(initialDraft(draftOwner, latestInitial.current), defaultContact);
      current.current = fresh;
      touched.current = false;
      if (draftRef) draftRef.current = null;
      setStorageState(null);
      setDraft(fresh);
      confirmedProfileProposals.current=[];interviewVersion.current={};
      setAssessmentPath('choice');setReviewAllCompatibility(false);setReviewAllBeena(false);setReviewAllPersonality(false);setPersonalityDirect(false);setInterviewApplied(false);setInterviewOpen(false);setInterviewRevision(value=>value+1);
    }
    if (!deviceDraft || touched.current || (draftRef?.current?.owner === draftOwner && draftRef.current.baseline === baseline)) {
      setCheckingDevice(false);
      return;
    }
    let active = true;
    loadFailed.current = false;
    setCheckingDevice(true);
    void intakeVault.load(draftOwner, baseline, lease.current).then(restored => {
      if (!active || touched.current || !restored || !intakeVault.current(draftOwner, lease.current)) return;
      if(startAt){restored.step=startAt;restored.returnToReview=Boolean(latestInitial.current);}
      restored=withDefaultContact(restored,defaultContact);
      if(!latestInitial.current && ['personality','beena'].includes(restored.step)) restored.step='compatibility';
      if (!includeCompatibility && ["compatibility", "criteria", "personality", "beena"].includes(restored.step)) restored.step = "preferences";
      if (!latestInitial.current && restored.step !== 'identity' && validateStep('identity', restored.answers, true, true, includeCompatibility)) restored.step='identity';

      current.current = restored;
      if (restored.permissions) {
        const choices = {...consentRef.current, sensitiveProfile:restored.permissions.sensitiveProfile, assessment:restored.permissions.assessment};
        consentRef.current = choices;
        setConsents(choices);
      }
      if (draftRef) draftRef.current = restored;
      setDraft(restored);
      if(dimensions.some(d => d.options.some(o => o.code === restored.answers.surveyAnswers?.[d.id] || o.code === restored.answers.surveyAnswers?.[d.partnerId])))setAssessmentPath('questions');
      setEditorHome(false);
      setStorageState("restored");
    }).catch(() => { if (active && !touched.current) { loadFailed.current = true; setStorageState("loadError"); } })
      .finally(() => { if (active) setCheckingDevice(false); });
    return () => { active = false; };
  }, [baseline, defaultContact, deviceDraft, draftOwner, draftRef, includeCompatibility, restoreAttempt, startAt]);
  function privateSnapshot():ApplicationDraft {
    const choices=consentRef.current;
    let answers=choices.sensitiveProfile?current.current.answers:withoutSensitive(current.current.answers);
    if(!choices.assessment)answers=withoutAssessment(answers);
    return {...current.current,answers,consent:false,permissions:{...current.current.permissions,version:choices.version,sensitiveProfile:choices.sensitiveProfile,assessment:choices.assessment}};
  }
  async function saveProgressNow() {
    if (!deviceDraft || !touched.current || checkingDevice || loadFailed.current || busy || savingLater.current) return;
    const snapshot=privateSnapshot(), fingerprint=JSON.stringify(snapshot);
    if (fingerprint===savedSnapshot.current) { setSaveProgress('saved');return; }
    setSaveProgress('saving');
    try {
      const saved=await intakeVault.save(snapshot,lease.current);
      if(saved&&mounted.current){savedSnapshot.current=fingerprint;setSaveProgress(JSON.stringify(privateSnapshot())===fingerprint?'saved':'pending');}
    } catch { if(mounted.current)setSaveProgress('error'); }
  }
  useEffect(()=>{
    if(!deviceDraft||!touched.current||checkingDevice||busy||loadFailed.current)return;
    setSaveProgress('pending');
    const timer=window.setTimeout(()=>void saveProgressNow(),600);
    return()=>window.clearTimeout(timer);
  },[draft,consents,deviceDraft,checkingDevice,busy]);
  useEffect(()=>{
    if(!deviceDraft)return;
    const flush=()=>{if(document.visibilityState==='hidden')void saveProgressNow();};
    const warn=(event:BeforeUnloadEvent)=>{
      if(touched.current&&JSON.stringify(privateSnapshot())!==savedSnapshot.current){event.preventDefault();event.returnValue='';}
    };
    document.addEventListener('visibilitychange',flush);window.addEventListener('beforeunload',warn);
    return()=>{document.removeEventListener('visibilitychange',flush);window.removeEventListener('beforeunload',warn);};
  },[deviceDraft,checkingDevice,busy]);
  useLayoutEffect(() => {
    if (editorHome) return;
    previousStep.current = draft.step;
    heading.current?.focus({ preventScroll: true });
    heading.current?.closest<HTMLElement>('[data-nf-keyboard-form]')?.scrollTo({ top: 0, behavior: 'instant' });
    window.scrollTo(0, 0);
  }, [draft.step, editorHome]);
  useLayoutEffect(() => {
    if (!error) return;
    const target = form.current?.querySelector<HTMLElement>('[data-field="' + error.field + '"]');
    for (let parent = target?.parentElement; parent; parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    }
    target?.focus();
  }, [error, chapter.key]);
  function commit(update: Partial<ApplicationDraft>) {
    touched.current = true;
    setStorageState(null);
    const next = { ...current.current, ...update };
    current.current = next;
    if (draftRef && draftOwner) draftRef.current = next;
    setDraft(next);
  }
  function update(values: Partial<Answers>) {
    if (error && error.field in values) setError(null);
    commit({ answers: { ...current.current.answers, ...values }, consent: false });
  }
  function applyCapturedProfile(proposals: ProfileProposal[], document: InterviewDocument) {
    confirmedProfileProposals.current=document.profileConfirmed ?? proposals;
    interviewVersion.current={model:document.model,promptVersion:document.promptVersion,confirmedAt:document.confirmedAt};
    update(applyProfileProposals(current.current.answers, proposals, consentRef.current.sensitiveProfile));
    void saveProgressNow();
  }
  function selectGender(gender: Profile["gender"]) {
    if (gender === p.gender) return;
    const marriageBasics = { ...p.marriageBasics }, partnerCriteria = { ...p.partnerCriteria };
    if (gender === "man") { delete marriageBasics.dressStyle; delete marriageBasics.dressFlexibility; }
    else { delete partnerCriteria.dressStyle; delete partnerCriteria.dressFlexibility; }
    setPortraitChange(undefined); setPortraitPolicy(undefined); chooseConsent('photo',false);
    update({ gender, marriageBasics, partnerCriteria, ...(gender === "man" ? { publicAvatar: null } : {}) });
  }
  function move(step: Chapter, returnToReview = false) {
    setEditorHome(false);
    direction.current = steps.findIndex(entry => entry.key === step) < idx ? "back" : "next";
    setError(null);
    commit({ step, returnToReview });
    if (step !== chapter.key) feedback('selection');
  }
  function goBack() {
    if (usesBasicSlides && basicSlides.current?.back()) return;
    if (editorHome) { void leaveForLater(); return; }
    if (draft.returnToReview) { move("review"); return; }
    if (editing) { setEditorHome(true); window.scrollTo(0, 0); return; }
    if (idx > 0) { move(steps[idx - 1].key); return; }
    void leaveForLater();
  }
  async function leaveForLater(photoLossAcknowledged=false) {
    if (busy || savingLater.current || (checkingDevice && !touched.current)) return;
    if (!photoLossAcknowledged && ((portraitChange!==undefined&&!portraitChange?.staged) || (portraitPolicy!==undefined&&portraitPolicy!==portraitChange?.revealPolicy))) { setConfirmPhotoDraftLoss(true); return; }
    if (storageState === "loadError" && !touched.current) { back(); return; }
    const snapshot = privateSnapshot();
    commit(snapshot);
    if (!deviceDraft) { back(); return; }
    savingLater.current = true;
    setLeaving(true);
    try {
      if (await intakeVault.save(snapshot, lease.current) && mounted.current) { savedSnapshot.current=JSON.stringify(snapshot);back(); }
    } catch {
      if (mounted.current) setStorageState("saveError");
    } finally {
      savingLater.current = false;
      if (mounted.current) setLeaving(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy||photoBusy) return;
    if (usesBasicSlides && basicSlides.current?.advance()) return;
    const agreed=consents.adult&&consents.terms&&consents.privacy;
    if(!editing && includeCompatibility && ['compatibility','criteria','review'].includes(chapter.key)) {
      if(!consents.assessment){setError({field:'consent',text:'جلسة التوافق جزء أساسي من إعداد الملف. راجع موافقة التحليل لنبدأ.'});if(chapter.key!=='compatibility')move('compatibility');return;}
      if(!demo&&!preview&&!aiComplete&&!fallbackAvailable){if(chapter.key!=='compatibility')move('compatibility');setError({field:'surveyAnswers',text:'أكمل جلسة التوافق واعتمد ملخصك أولًا.'});setInterviewOpen(true);return;}
    }
    const issue = validateStep(chapter.key, chapter.key==='review'?reviewAnswers:p, agreed, !editing, !editing&&includeCompatibility, !editing&&consents.sensitiveProfile);
    if (issue) {
      setError(issue);
      return;
    }
    if (["avatar","review"].includes(chapter.key) && p.gender === "man" && !editing && !portraitChange && !initial?.portrait) { move("avatar",true);setError({field:"portrait",text:"أضف صورة واضحة لك للمتابعة."});return; }
    if (["avatar","review"].includes(chapter.key) && !demo && !preview && portraitChange) {
      const allowed = p.gender === 'man' ? ['verified','moderation','approved'] : ['ready','verified','moderation','approved'];
      if (!portraitChange.staged || !allowed.includes(portraitChange.staged.status)) { move('avatar',true); setError({field:'portrait',text:'أكمل التحقق من الصورة، أو أرسلها للمراجعة قبل المتابعة.'}); return; }
    }
    if (chapter.key === "review") {
      for (const entry of steps) {
        const sectionIssue = entry.key !== 'review' ? validateStep(entry.key, reviewAnswers, agreed, !editing, !editing&&includeCompatibility, !editing&&consents.sensitiveProfile) : null;
        if (sectionIssue) {
          move(entry.key, true);
          setError(sectionIssue);
          return;
        }
      }
      if(portraitChange&&!consents.photo){move('avatar',true);setError({field:'consent',text:'راجعي موافقة عرض الصورة، أو أزيليها للمتابعة.'});return;}
      if(portraitChange&&portraitPolicy!==undefined&&portraitChange.revealPolicy!==portraitPolicy){move('avatar',true);setError({field:'portrait',text:'لم يكتمل تجهيز إعداد الصورة الجديد. أعيدي اختيار الصورة قبل الحفظ.'});return;}
      if(portraitPolicy&&portraitPolicy!=='never'&&!consents.photo){move('avatar',true);setError({field:'consent',text:'راجعي موافقة استخدام الصورة قبل تفعيل كشفها.'});return;}
      const profile=applyConsentChoices(toProfile(reviewAnswers),consents);
      save(profile,portraitChange,portraitPolicy,buildProfileAnswerProvenance(profile,confirmedProfileProposals.current,interviewVersion.current));
    } else if (editing && !draft.returnToReview) {
      setEditorHome(true); window.scrollTo(0, 0);
    } else {
      move(draft.returnToReview ? "review" : steps[idx + 1].key);
    }
  }
  function field(key: keyof Answers | "consent") {
    return { "data-field": key, "aria-invalid": error?.field === key || undefined, "aria-describedby": error?.field === key ? "nf-intake-error" : undefined };
  }
  const assessmentStep = !editing && consents.assessment && ['compatibility','personality','beena'].includes(chapter.key);
  const savedCompatibilityCount = dimensions.reduce((count,d) => count + Number(d.options.some(o=>o.code===p.surveyAnswers?.[d.id])) + Number(d.options.some(o=>o.code===p.surveyAnswers?.[d.partnerId])),0);
  const savedPersonalityCount = personalityQuestions.filter(q=>q.options.some(o=>o.code===p.personalityAnswers?.[q.id])).length;
  const choosingAssessment = !editing && chapter.key==='compatibility' && !aiComplete && !(fallbackAvailable && assessmentPath==='questions') && !demo && !preview;
  const submitLabel = usesBasicSlides ? "متابعة" : chapter.key === "review" ? (busy ? "جارٍ الحفظ…" : preview || demo ? "إكمال الملف" : initial ? "إرسال التعديلات" : "إرسال طلب العضوية") :
    draft.returnToReview ? "العودة للمراجعة" : editing ? "العودة إلى ملفي" : choosingAssessment ? 'إكمال جلسة التوافق' : steps[idx + 1]?.key === "review" ? "شاهد ملفك" : assessmentStep ? `متابعة إلى ${steps[idx + 1]?.label}` : "متابعة";
  return (
    <main className={`nf-intake${editing ? '' : ' nf-intake--new'}`} dir="rtl" data-editing={editing||undefined} data-basic-slides={usesBasicSlides||undefined} data-preview={preview||undefined} data-assessment={assessmentStep||undefined} data-chapter={editorHome ? 'studio' : chapter.key}>
      {!editing && <ScenePaths className="nf-intake-arrival-paths" parallax />}
      <header className="nf-intake-header">
        <button className="f-icon" type="button" onClick={goBack} disabled={busy || leaving} aria-label="رجوع"><ArrowRight size={19} aria-hidden="true" /></button>
        <div className="nf-intake-brand"><Brand compact /></div>
        <div className="nf-intake-header-actions"><HelpButton topic="profile" label="مساعدة"/>{draftRef && <button type="button" className="nf-intake-later" onClick={() => void leaveForLater()} disabled={busy || leaving || (checkingDevice && !touched.current)}>{leaving ? "جارٍ الحفظ…" : "لاحقًا"}</button>}{exitPreview && <button type="button" className="f-icon" onClick={exitPreview} aria-label="العودة للبداية"><X size={19} aria-hidden="true"/></button>}</div>
      </header>
      <div className="nf-intake-main">
          {storageState === "restored" && <p role="status" className="nf-intake-note">{accountDraft?'استعدنا مسودتك الخاصة من حسابك.':'استعدنا مسودتك المحفوظة على جهازك.'} راجع موافقات النشر والإقرار قبل الإرسال.</p>}
          {storageState === "loadError" && <div className="nf-intake-error" role="alert">تعذّرت قراءة مسودتك. <button type="button" className="nf-intake-policy" onClick={() => { touched.current=false;setStorageState(null); setRestoreAttempt(n => n + 1); }}>حاول مجددًا</button></div>}
          {storageState === "saveError" && <p className="nf-intake-error" role="alert">تعذّر حفظ المسودة. اضغط «إكمال لاحقًا» لإعادة المحاولة.</p>}
       {editorHome ? <ProfileStudio answers={p} photoUrl={portraitChange===null?null:portraitChange?.url} portraitSource={portraitSource} withCompatibility={includeCompatibility} busy={busy || leaving} changed={changedSections.size>0} selectedChapter={draft.step} open={step => move(step)} review={() => move('review')}/> : <>
        <div className="nf-intake-progress">
          <div className="nf-intake-kicker"><span>{editing ? `ملفك / ${chapter.label}` : milestone?.label ?? chapter.label}</span><span>{editing ? 'تعديل الملف' : `المرحلة ${arabicNumber(milestoneIdx + 1)} من ${arabicNumber(milestones.length)}`}</span></div>
          {!editing && <div className="nf-intake-meter" aria-label="مراحل إعداد الملف" role="progressbar" aria-valuemin={1} aria-valuemax={milestones.length} aria-valuenow={milestoneIdx + 1} aria-valuetext={`المرحلة ${arabicNumber(milestoneIdx + 1)} من ${arabicNumber(milestones.length)}: ${milestone?.label ?? chapter.label}`}>
            {milestones.map((entry, n) => <i key={entry.key} aria-hidden="true" data-state={n < milestoneIdx ? "done" : n === milestoneIdx ? "current" : undefined} />)}
          </div>}
        </div>
        {assessmentStep&&<WhyWudayn label="كيف تتحول إجاباتي إلى توافق مفهوم؟"/>}
        <form className="nf-intake-form" onSubmit={submit} ref={form} noValidate>
          <MotionReveal className="nf-intake-stage" key={chapter.key} axis="x" distance={direction.current === 'back' ? 8 : -8} duration={240} data-dir={direction.current} inert={busy || leaving || checkingDevice || storageState==='loadError'}>
            <div className="nf-intake-title">
              <svg className="nf-intake-ridge" viewBox="0 0 160 48" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                <path d="M-10 23 Q20 9 53 24 T115 27 Q137 16 165 19" />
                <path d="M-10 30 Q21 18 53 31 T116 33 Q142 23 165 26" />
              </svg>
              <div className="nf-intake-heading-tools"><div className="nf-intake-seal" aria-hidden="true"><Icon size={21} strokeWidth={1.55} /></div></div>
              {assessmentStep ? <details className="nf-intake-section-guide"><summary aria-label={`عن هذا القسم: ${chapter.title}`}><h1 ref={heading} tabIndex={-1}>{chapter.title}</h1><ChevronLeft size={14} aria-hidden="true"/></summary><p>{chapter.note}</p></details> : <><h1 ref={heading} tabIndex={-1}>{chapter.key === 'review' ? editing ? 'مراجعة التعديلات' : 'هذه صورتك الأولى.' : chapter.key === 'identity' && !editing ? 'نبدأ بك' : chapter.title}</h1><p>{chapter.key==='review'&&editing?'هذه الأقسام التي عدّلتها. راجعها، ثم أكّد الحفظ.':chapter.key==='identity'&&!editing?'هذه التفاصيل تظهر في ملفك.':chapter.note}</p></>}
            </div>
            <div className="flow-form nf-intake-fields">
              {usesBasicSlides && <SignupBasicsSlides key={chapter.key} ref={basicSlides} chapter={chapter.key} answers={p} update={update} gender={selectGender} consents={consents} consent={chooseConsent} required={includeCompatibility} aiDraftsReady={chapter.key==='story'&&interviewApplied}/>}
              {!usesBasicSlides && chapter.key === "identity" && <>
                <div className="nf-name-entry"><span className="nf-name-avatar" aria-hidden="true"><UserRound size={25} strokeWidth={1.4}/></span><label>الاسم المعروض<input {...field("displayName")} autoComplete="nickname" enterKeyHint="done" value={p.displayName} onChange={e => update({ displayName: e.target.value })} maxLength={60} placeholder="اسمك الأول أو اسم مستعار" required /></label></div>
                <fieldset className="nf-gender-segment"><legend>أنا</legend><div className="choice-row">
                  {(["woman","man"] as const).map((gender, n) => <button key={gender} type="button" {...(n === 0 ? field("gender") : {})}
                    aria-pressed={p.gender === gender} onClick={() => selectGender(gender)}><span>{gender === "woman" ? "امرأة" : "رجل"}</span>{p.gender === gender && <Check size={15} aria-hidden="true"/>}</button>)}
                </div></fieldset>
                <div className="field-pair nf-identity-group"><label className="nf-birthday-row"><span className="nf-intake-field-label">تاريخ الميلاد <span>ميلادي</span></span><input {...field('birthDate')} type="date" dir="ltr" autoComplete="bday" aria-describedby={[error?.field==='birthDate'?'nf-intake-error':'','nf-birthday-help'].filter(Boolean).join(' ')} value={p.birthDate ?? ''} max={latestAdultBirthday()} min="1900-01-01" required={!editing || !!initial?.birthDate} onChange={e => { const birthDate=e.target.value; const age=ageFromBirthday(birthDate); update({birthDate,age:age===null?'':String(age)}); }} /></label>
                  <ChoiceSelect {...field('city')} label="مدينة الإقامة" value={p.city} onChange={city => update({ city })} options={cityOptions} placeholder="اختر مدينتك" required /></div>
                <small id="nf-birthday-help" className="nf-intake-field-help"><LockKeyhole size={13} aria-hidden="true"/>{p.birthDate && ageFromBirthday(p.birthDate)! >= 18 ? `يظهر عمرك ${arabicNumber(ageFromBirthday(p.birthDate)!)} عامًا، وليس تاريخ ميلادك.` : editing && !p.birthDate ? `العمر المسجّل: ${arabicNumber(Number(p.age))} عامًا. أضف ميلادك لتحديثه.` : 'تاريخ ميلادك خاص بك. التسجيل من عمر ١٨ عامًا.'}</small>
              </>}
              {!usesBasicSlides && chapter.key === "story" && <>
                <ChoiceSelect {...field('profession')} label="مجال العمل أو الوضع المهني" value={p.profession} onChange={profession => update({ profession })} options={professionOptions} placeholder="اختر ما يصف حياتك اليوم" required />
                <small>يمكنك ذكر مسمّاك المهني وتخصصك بكلماتك في النبذة.</small>
                <label>نبذة قصيرة<textarea {...field("bio")} value={p.bio} onChange={e => update({bio: e.target.value})} maxLength={1200} rows={4} required placeholder="ما الذي تحب أن يعرفه الطرف الآخر عنك؟" /></label>
                <div className="nf-intake-wordcount">{arabicNumber(p.bio.length)} / {arabicNumber(1200)}</div>
                <details className="nf-story-more nf-story-prompts" open={!editing || undefined}><summary><span>المزيد عنك<small>{editing ? "ثلاثة أسئلة اختيارية" : "ثلاث لمحات قصيرة"}</small></span><ChevronLeft size={17}/></summary><div><ProfilePromptFields required={!editing&&includeCompatibility} answers={p} update={update} invalidField={error?.field}/></div></details>
                <details className="nf-story-more" open={!editing || undefined}><summary><span><Feather size={17}/> الدراسة وبداية التعارف<small>{editing ? "معلومات إضافية · اختياري" : "عن دراستك ونيّتك"}</small></span><ChevronLeft size={17}/></summary><div>
                <ChoiceSelect {...field('education')} label="أعلى مؤهل تعليمي مكتمل" value={p.education ?? ''} onChange={education => update({ education })} options={educationOptions} placeholder={editing ? "اختر المؤهل · اختياري" : "اختر المؤهل"} required={!editing} allowClear={editing} />
                <label>نيّتي من التعارف<select {...field("marriageIntent")} value={p.marriageIntent ?? ""} onChange={e => update({ marriageIntent: e.target.value })}>
                  <option value="">{editing ? "أفضل إضافتها لاحقًا" : "اختر ما يعبّر عنك"}</option>
                  {!!p.marriageIntent && !["تعارف جاد يهدف إلى الزواج", "مستعد للخطوة الرسمية عند التوافق", "أبحث عن توافق قبل تحديد الموعد"].includes(p.marriageIntent) && <option>{p.marriageIntent}</option>}
                  <option>تعارف جاد يهدف إلى الزواج</option><option>مستعد للخطوة الرسمية عند التوافق</option><option>أبحث عن توافق قبل تحديد الموعد</option>
                </select></label>
                </div></details>
              </>}
              {!usesBasicSlides && chapter.key === "details" && <><ConsentGate kind="sensitiveProfile" checked={consents.sensitiveProfile} change={v=>chooseConsent('sensitiveProfile',v)} compact={!editing}/>{consents.sensitiveProfile&&<ConsentChoice kind="sensitivePublication" checked={consents.sensitivePublication} change={v=>chooseConsent('sensitivePublication',v)}/>}<MarriageBasicsFields required={!editing&&includeCompatibility} value={p.marriageBasics} sensitiveAllowed={consents.sensitiveProfile} gender={p.gender} onChange={marriageBasics => update({ marriageBasics })} /></>}
              {chapter.key === "avatar" && p.gender === "man" && <MensPhotoChoice change={portraitChange} onChange={setPortraitChange} existing={initial?.portrait} source={portraitSource} immediateVerification={!demo&&!!portraitSource} consented={consents.photo} onConsent={v=>chooseConsent('photo',v)} onBusy={setPhotoBusy}/>}
              {chapter.key === "avatar" && p.gender === "woman" && <ProfilePhotoChoice avatar={p.publicAvatar} onAvatar={publicAvatar=>update({publicAvatar})} inferred={{style:p.marriageBasics?.dressStyle??'hijab',skinTone:p.marriageBasics?.skinTone??'tone_4'}} change={portraitChange} onChange={setPortraitChange} existing={initial?.portrait} source={portraitSource} immediateVerification={!demo&&!!portraitSource} consented={consents.photo} consentError={error?.field==='consent'?error.text:undefined} onConsent={v=>chooseConsent('photo',v)} sensitiveAllowed={consents.sensitiveProfile} onSensitiveConsent={()=>move('details')} onBusy={setPhotoBusy} revealPolicy={portraitPolicy} onPolicyChange={setPortraitPolicy}/>}
              {((editing&&['criteria','personality','compatibility','beena'].includes(chapter.key)&&!consents.assessment)||(!editing&&chapter.key==='compatibility'&&!consents.assessment))&&<ConsentGate kind="assessment" checked={consents.assessment} change={v=>chooseConsent('assessment',v)} compact={!editing} required={!editing}/>}
              {chapter.key === 'beena' && consents.assessment && <>
                {!editing && Boolean(Object.keys(p.beena?.answers??{}).length) && <div className="wi-onboarding-summary"><div><BookOpen size={17} aria-hidden="true"/><p><strong>نبني على ما أجبت عنه</strong><span>إجابات المواقف التي حفظتها موجودة هنا. أكمل فقط ما تبقّى، أو راجع اختياراتك.</span></p></div><button type="button" onClick={()=>setReviewAllBeena(value=>!value)}>{reviewAllBeena ? 'إظهار المتبقي فقط' : 'مراجعة كل المواقف'}<ChevronLeft size={14}/></button></div>}
                <BeenaFields key={interviewRevision} value={p.beena} onChange={beena=>update({beena})} storyReview={!demo} registration={!editing} remainingOnly={!editing&&!reviewAllBeena}/>
              </>}
              {chapter.key === "criteria" && consents.assessment && <PartnerCriteriaFields required={!editing&&includeCompatibility} value={p.partnerCriteria} sensitiveAllowed={consents.sensitiveProfile} gender={p.gender} basics={p.marriageBasics} onChange={partnerCriteria => update({ partnerCriteria })} />}
              {chapter.key === "personality" && consents.assessment && <>
                {editing || !interviewAuth ? <PersonalityFields answers={p.personalityAnswers ?? {}} onChange={update} registration={!editing} /> : <>
                  {savedPersonalityCount>0 ? <div className="wi-onboarding-summary"><div><CheckCheck size={18} aria-hidden="true"/><p><strong>{savedPersonalityCount===personalityQuestions.length ? 'ملامحك مؤكدة. لا تحتاج لإعادتها.' : 'نبني على ما أكّدته'}<small>{arabicNumber(savedPersonalityCount)} من {arabicNumber(personalityQuestions.length)} ملمحًا</small></strong><span>{savedPersonalityCount===personalityQuestions.length ? 'تُستخدم اختياراتك في انسجام الشخصية بعد حفظ ملفك. يمكنك مراجعتها وتعديلها متى شئت.' : 'المؤكد محفوظ، وما لم يتضح يبقى مفتوحًا. أكمل الحوار، أو أجب مباشرة عن المتبقي.'}</span></p></div><button type="button" onClick={()=>{setReviewAllPersonality(value=>!value);setPersonalityDirect(true);}}>{reviewAllPersonality ? 'إظهار المتبقي فقط' : 'مراجعة ملامح شخصيتي'}<ChevronLeft size={14}/></button></div> : <InterviewEntry available open={()=>setInterviewOpen(true)}/>}
                  {savedPersonalityCount>0&&savedPersonalityCount<personalityQuestions.length&&<div className="wi-personality-actions"><MotionPressButton className="wi-button wi-button-primary" onClick={()=>setInterviewOpen(true)}>أكمل ملامحي عبر الحوار<ArrowLeft size={17}/></MotionPressButton></div>}
                  {(savedPersonalityCount<personalityQuestions.length||reviewAllPersonality)&&<details className="wi-manual wi-personality-manual" open={personalityDirect||reviewAllPersonality||undefined}><summary><span>{savedPersonalityCount===personalityQuestions.length ? 'مراجعة الإجابات وتعديلها' : 'أفضّل إكمال المتبقي مباشرة'}</span><ChevronLeft size={16}/></summary><PersonalityFields key={`${interviewRevision}:${reviewAllPersonality}`} answers={p.personalityAnswers ?? {}} onChange={update} registration remainingOnly={!reviewAllPersonality}/></details>}
                </>}
              </>}
              {chapter.key === "compatibility" && consents.assessment && <>
                {editing ? <>
                  <InterviewEntry available={!!interviewAuth} open={() => setInterviewOpen(true)}/>
                  {interviewApplied && <p className="wi-applied-note" role="status"><Check size={15}/>أُضيفت إجاباتك المؤكدة إلى المسودة. راجع الملف قبل حفظه.</p>}
                  {interviewAuth ? <details className="wi-manual" open={interviewApplied || undefined}><summary><span>مراجعة التفضيلات وتعديلها</span><ChevronLeft size={16}/></summary><CompatibilityFields gender={p.gender || undefined} interestIds={p.interestIds ?? []} surveyAnswers={p.surveyAnswers ?? {}} hardRequirements={p.hardRequirements ?? []} priorityCategories={p.priorityCategories ?? []} onChange={update}/></details> : <CompatibilityFields gender={p.gender || undefined} interestIds={p.interestIds ?? []} surveyAnswers={p.surveyAnswers ?? {}} hardRequirements={p.hardRequirements ?? []} priorityCategories={p.priorityCategories ?? []} onChange={update}/>}
                </> : <div className="nf-session-stage" data-field="surveyAnswers" tabIndex={-1}>
                  {aiComplete && savedCompatibilityCount===dimensions.length*2 && savedPersonalityCount===personalityQuestions.length ? <div className="wi-onboarding-summary"><div><CheckCheck size={22}/><p><strong>ملخصك معتمد</strong><span>حفظنا تفضيلاتك وملامح شخصيتك. نكمل الآن بقية الملف.</span></p></div><button type="button" onClick={()=>setInterviewOpen(true)}>عرض الملخص<ChevronLeft size={15}/></button></div> : <>
                    {interviewAuth && <InterviewEntry available open={()=>setInterviewOpen(true)}/>}
                    {!(demo||preview)&&!interviewAuth&&<p role="alert" className="nf-intake-error">تعذّر فتح الجلسة. سجّل الدخول مجددًا للمتابعة.</p>}
                  </>}
                  {(demo||preview||(fallbackAvailable&&assessmentPath==='questions'))&&<div className="nf-session-fallback">
                    <p className="nf-intake-note">{demo||preview?'معاينة الأسئلة. في التسجيل الفعلي نبدأ بالحوار.':'تعذّر إكمال الحوار. نكمل النقاط المتبقية هنا، وإجاباتك السابقة محفوظة.'}</p>
                    <section aria-label="تفضيلات التوافق"><h2>عن حياتك وشريكك</h2><CompatibilityFields key={interviewRevision} registration required remainingOnly={!reviewAllCompatibility} gender={p.gender || undefined} interestIds={p.interestIds ?? []} surveyAnswers={p.surveyAnswers ?? {}} hardRequirements={p.hardRequirements ?? []} priorityCategories={p.priorityCategories ?? []} onChange={update}/></section>
                    {savedCompatibilityCount===dimensions.length*2 && <section data-field="personalityAnswers" tabIndex={-1} aria-label="ملامح الشخصية"><h2>طريقتك في الحياة</h2><PersonalityFields key={interviewRevision} answers={p.personalityAnswers ?? {}} onChange={update} registration required remainingOnly/></section>}
                  </div>}
                </div>}
              </>}
              {chapter.key === "preferences" && <>
                <fieldset><legend>العمر المناسب للطرف الآخر</legend><div className="field-pair">
                  <ChoiceSelect {...field('preferredMinAge')} label="من عمر" value={p.preferredMinAge} onChange={preferredMinAge => update({ preferredMinAge })} options={ageOptions.filter(option => !p.preferredMaxAge || Number(option.value) <= Number(p.preferredMaxAge))} required />
                  <ChoiceSelect {...field('preferredMaxAge')} label="إلى عمر" value={p.preferredMaxAge} onChange={preferredMaxAge => update({ preferredMaxAge })} options={ageOptions.filter(option => !p.preferredMinAge || Number(option.value) >= Number(p.preferredMinAge))} required />
                </div></fieldset>
                <fieldset className="nf-family-choice"><legend>متى تفضّل إشراك الأهل؟</legend><div>{['من البداية','بعد التعارف الأول','نتفق على ذلك لاحقًا'].map(value=><MotionPressButton type="button" key={value} aria-pressed={p.familyPreference===value} onClick={()=>update({familyPreference:value})}><span>{value}</span>{p.familyPreference===value&&<Check size={15} aria-hidden="true"/>}</MotionPressButton>)}</div><small>يظهر اختيارك في ملفك للأعضاء المؤهلين.</small></fieldset>
                <div className="nf-intake-private"><label>وسيلة التواصل الخاصة<input {...field("contact")} dir="auto" autoComplete="off" type="text" value={p.contact} onChange={e => update({ contact: e.target.value })} maxLength={180} required placeholder="name@example.com أو +9665…" /></label>
                  <small><LockKeyhole size={14} aria-hidden="true" />تظهر في الترشيح الخاص بعد موافقتكما معًا فقط.</small></div>
              </>}
              {chapter.key === "review" && <>
                {!editing&&<ProfilePreview answers={{...reviewAnswers,...publicSensitiveFields({...reviewAnswers,signupConsents:consents})}} photoUrl={portraitChange===null?null:portraitChange?.url} portraitSource={portraitSource}/>}
                {!editing && <div className="nf-studio-finish"><HeartHandshake size={24}/><div><strong>خطوتك القادمة، تعارف له معنى.</strong><p>{preview || demo ? 'راجع تفاصيلك وخيارات الخصوصية، ثم أكمل إعداد ملفك.' : 'أرسل ملفك للمراجعة. بعد اعتماده، يمكنك استكشاف خيارات العضوية وبدء التعارف.'}</p></div></div>}
                <Review p={reviewAnswers} edit={step => move(step, true)} withCompatibility={includeCompatibility} registration={!editing} changed={editing?changedSections:undefined} portraitChange={portraitChange} portraitSource={portraitSource} portraitPolicy={portraitPolicy} sensitivePublication={consents.sensitiveProfile&&consents.sensitivePublication}/>
                {includeCompatibility && <details className="nf-intake-audience" aria-label="ما يراه الآخرون">
                  <summary><ShieldCheck size={17} aria-hidden="true" /> ما يراه الآخرون وما يبقى خاصًا<ChevronLeft size={16}/></summary>
                  <p>يرى الأعضاء المؤهلون اسمك المعروض وعمرك ومدينتك ومهنتك ونبذتك واهتماماتك، والتفاصيل العامة التي كتبتها عن الدراسة وما تبحث عنه وقيمك واحتياجاتك والحياة المشتركة ونيّتك من التعارف وتفضيل إشراك الأهل.</p>
                  <p>تظهر أيضًا التفاصيل الاختيارية التي وافقت على مشاركتها عن المظهر واللباس والخلفية والعائلة والزواج والتعدد والدين، وصورة ملفك بدرجة التمويه المختارة أو الصورة الرمزية. الانفتاح على النقاش ليس التزامًا بالتغيير.</p>
                  <p>تبقى متطلبات الشريك وإجاباتك الخاصة مخفية. نعرض مؤشرات التوافق بعد اكتمال الإجابات لدى الطرفين، وهي لا تتنبأ بنجاح الزواج.</p>
                  <p>تظهر وسيلة التواصل في الترشيح الخاص بعد موافقتكما معًا.</p>
                </details>}
                {previouslyApproved && <p className="nf-intake-note"><ShieldCheck size={16} aria-hidden="true" />تعديل الملف العام متاح مرة كل ٣٠ يومًا ويعيده للمراجعة. تبقى المحادثات المقبولة متاحة، ويرى الطرف الآخر النص المعتمد السابق دون الصورة حتى اعتماد التعديل. يتوقف الظهور والطلبات الجديدة مؤقتًا، ويستمر اشتراك Apple إلى أن تغيّره من إعدادات الاشتراك. إجابات «بيننا» الخاصة لا تستهلك هذا التعديل، أما نشر قصة جديدة فيخضع له.</p>}
                {profileReviewPending ? <p className="nf-intake-note">ملفك الآن قيد مراجعة التعديل. يمكنك إرسال التصحيحات اللازمة دون انتظار موعد التعديل التالي.</p> : previouslyApproved && nextPublicProfileEditAt && Date.parse(nextPublicProfileEditAt)>Date.now() && <p className="nf-intake-note">موعد تعديل ملفك العام التالي: {new Date(nextPublicProfileEditAt).toLocaleString('ar-SA',{calendar:'gregory',timeZone:'Asia/Riyadh',dateStyle:'long',timeStyle:'short'})} بتوقيت السعودية. يمكنك حفظ مسودتك لهذا الموعد، وتحديث إجاباتك الخاصة دون انتظار.</p>}
                <SignupConsentReview recorded={Object.values(recordedAccountAgreements(initial?.signupConsents ?? accountAgreements)).every(Boolean)} requiredAssessment={!editing&&includeCompatibility} value={consents} change={chooseConsent} onPrivacy={onPrivacy} preview={preview}/>
              </>}
            </div>
          </MotionReveal>
          <footer className={`nf-intake-actions${assessmentStep ? ' nf-intake-actions--chapter' : ''}`}>
            {error && <p role="alert" id="nf-intake-error" className="nf-intake-error">{error.text}</p>}
            <MotionPressButton type="submit" className='f-primary' disabled={busy || leaving || photoBusy || checkingDevice || storageState==='loadError'}><span>{submitLabel}</span>{chapter.key === "review" ? <Check size={18} aria-hidden="true" /> : <ArrowLeft size={18} aria-hidden="true" />}</MotionPressButton><KeyboardDismiss/>
            {deviceDraft&&<p className="nf-intake-save-status" role="status" data-state={saveProgress}>{checkingDevice?'جارٍ استعادة مسودتك…':saveProgress==='error'?<>تعذّر الحفظ التلقائي. <button type="button" className="nf-intake-policy" onClick={()=>void saveProgressNow()}>إعادة المحاولة</button></>:saveProgress==='saved'?<><Check size={13} aria-hidden="true"/> {accountDraft?'حُفظت إجاباتك في حسابك بخصوصية':'حُفظت إجاباتك على جهازك'}</>:saveProgress==='pending'||saveProgress==='saving'?'جارٍ حفظ إجاباتك…':accountDraft?'تُحفظ إجاباتك تلقائيًا وبخصوصية':'تُحفظ إجاباتك تلقائيًا على جهازك'}</p>}
            <div className="nf-intake-action-meta">
              {!editing && chapter.key !== 'review' && !draft.returnToReview && <small>التالي: {steps[idx + 1]?.label}</small>}
              {draftRef && <details className="nf-intake-draft-help"><summary><LockKeyhole size={14} aria-hidden="true"/><span>كيف تُحفظ إجاباتي؟</span><ChevronLeft size={14} aria-hidden="true"/></summary><p>{accountDraft ? "تُحفظ إجاباتك تلقائيًا في مسودة خاصة بحسابك لمدة ثلاثين يومًا من آخر حفظ. يمكنك تسجيل الدخول والمتابعة من جهاز آخر. لا تظهر للأعضاء قبل إرسال الملف ومراجعته، ولا تُعد موافقة على نشره." : deviceDraft ? "تُحفظ إجاباتك تلقائيًا على هذا الجهاز لثلاثين يومًا." : "يمكنك إكمال إجاباتك لاحقًا ما دام التطبيق مفتوحًا."} الصورة التي أكملت رفعها محفوظة بخصوصية مع حالة التحقق. أما اختيار صورة لم يكتمل رفعها أو تعديل إعداداتها، فيحتاج إلى إكماله قبل المغادرة.</p></details>}
            </div>
          </footer>
          {confirmPhotoDraftLoss && <section ref={photoDraftWarning} tabIndex={-1} role="alertdialog" aria-modal="false" aria-labelledby="photo-draft-warning" className="nf-intake-photo-warning"><h2 id="photo-draft-warning">حفظ الإجابات دون تعديل الصورة؟</h2><p>هذا التعديل على الصورة لم يُحفظ بعد. يمكنك العودة لإكماله، أو حفظ إجاباتك الآن واختياره مجددًا لاحقًا. صورتك المحفوظة لن تتغير.</p><button type="button" className="f-secondary" onClick={()=>setConfirmPhotoDraftLoss(false)}>العودة إلى الملف</button><button type="button" className="f-primary" disabled={leaving} onClick={()=>{setConfirmPhotoDraftLoss(false);void leaveForLater(true);}}>حفظ الإجابات والمتابعة لاحقًا</button></section>}
        </form>
       </>}
      </div>
      {interviewAuth && consents.assessment && <InterviewPanel key={draftOwner + ':' + (interviewAuth.testSession ?? interviewAuth.token ?? '')} open={interviewOpen} auth={interviewAuth} onboarding={!editing} profileContext={profileContextFromAnswers(p,consents.sensitiveProfile)} assessmentContext={assessmentContextFromAnswers(p)} onProfileApply={applyCapturedProfile} sensitiveProfileAllowed={consents.sensitiveProfile} consentGranted={consents.assessment&&draft.permissions?.interview===true} onUnavailable={()=>setFallbackAvailable(true)} onClose={() => setInterviewOpen(false)} onDirectQuestions={()=>{setInterviewOpen(false);setAssessmentPath('questions');if(current.current.step==='personality')setPersonalityDirect(true);}} onFallbackApply={confirmed=>{update(applyInterviewAnswers(current.current.answers,confirmed.filter(item=>item.kind!=='beena')));setInterviewRevision(value=>value+1);setAssessmentPath('questions');void saveProgressNow();}} onApply={confirmed => { setAiComplete(true); update(applyInterviewAnswers(current.current.answers, !editing?confirmed.filter(p=>p.kind!=='beena'):confirmed)); setInterviewApplied(true);setInterviewRevision(value=>value+1);setAssessmentPath('questions');setReviewAllCompatibility(false);setReviewAllBeena(false);setReviewAllPersonality(false);setPersonalityDirect(false);void saveProgressNow(); }}/>}
    </main>
  );
}
import {WhyWudayn} from '../WhyWudayn';
