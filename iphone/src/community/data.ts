import { cloud } from "../cloud";
import { canonicalCity, canonicalNationality, canonicalEducation, canonicalProfession } from '../profile/profileOptions';
import { requestAi } from '../ai/client';
import { manualVerificationSource } from '../verification/client';
import type { ManualVerificationClaim, ManualVerificationSource } from '../verification/model';
import { callRpc, CloudError } from "../cloud";
import { privateUpdates, type WatchUpdates } from "./updates";
import type { Profile, ProfilePortrait, PortraitRevealPolicy } from "../types";
import type { MarriageBasics } from "../compatibility/marriage";
import type { PublicAvatar } from "../compatibility/appearance";
import { personalityQuestions, personalityVersion } from "../compatibility/personality";
import { comparePreferences, describeFit, normalizeNationality, preferencePercentage, dimensions, interests, rankPreferences, type MatchFit } from "../compatibility/model";
import { beenaScenarios, sharedBeenaStory, type BeenaProfile, type SharedBeenaStory } from "../beena/model";
import { createDemoReadiness, normalizeReadinessDraft, type ReadinessRequest } from '../readiness/model';
import { boundedFamilyPayload, createDemoFamily, unwrapFamilyResult, type FamilyRequest } from '../family/model';
import { createDemoSimulation, type DemoSimulationController, type DemoSimulationOptions, type SimulationRecord } from './simulation';

export type GalleryPhoto = { id: string; path?: string };
export type PublicPerson = {
  manualVerifications?: ManualVerificationClaim[];
  isDemo?: boolean;
  atCapacity?: boolean; viewerAtCapacity?: boolean; connectionId?: string; connectionStatus?: "pending" | "accepted";
  exclusive?: boolean; online?: boolean; interested?: boolean;
  fit?: MatchFit;
  id: string;
  alias: string;
  age: number;
  city: string;
  occupation: string;
  bio: string;
  lookingFor?: string;
  valuesStatement?: string;
  lifeTogether?: string;
  education?: string;
  marriageIntent?: string;
  familyPreference?: string;
  beenaStory?: SharedBeenaStory;
  marriageBasics?: MarriageBasics;
  publicAvatar?: PublicAvatar | null;
  portrait?: ProfilePortrait | null;
  /** Fictional demo portrait only. Never inferred from a private member photo. */
  demoPhoto?: string;
  interests: string[];
  reasons: string[];
};
export type Connection = {
  id: string;
  celebrationKey?: string;
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
  status: "pending" | "accepted";
  direction: "incoming" | "outgoing";
  person: PublicPerson;
  lastMessage?: Pick<Message, "body" | "senderIsMe" | "createdAt"> | null;
  unreadCount?: number;
};
export type RequestHistoryEntry = {
  id: string; alias: string; direction: "incoming" | "outgoing";
  createdAt: string; closedAt?: string | null; outcome: "closed" | "expired";
};
export type MessageReply = { id: string; body: string; senderIsMe: boolean; deletedAt?: string | null };
export type Message = {
  id: string;
  senderIsMe: boolean;
  body: string;
  createdAt: string;
  clientId?: string | null;
  attachment?: ChatAttachment | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  reply?: MessageReply | null;
  deletedAt?: string | null;
};
export type ChatAttachment = { id: string; kind: "photo" | "audio"; mime: string; size: number; duration?: number; viewOnce?: boolean; openedAt?: string | null };
export const deletedMessageText = 'تم حذف هذه الرسالة';
export function sanitizeMessage(message: Message): Message {
  if (message.deletedAt) return { ...message, body: deletedMessageText, attachment: null, reply: null };
  return message.reply?.deletedAt ? { ...message, reply: { ...message.reply, body: deletedMessageText } } : message;
}
export type CallPermissionState = { status: "none" | "pending" | "accepted" | "declined"; direction?: "incoming" | "outgoing" };
export type SeriousnessAgreement = {status:'none'|'proposed'|'accepted'|'expired'|'family';actor:'reham'|'abdulrahman';days?:number;proposalId?:string;deadline?:string;womanSignedAt?:string;manSignedAt?:string;familyAgreed?:Partial<Record<'reham'|'abdulrahman',boolean>>};
export const messagePageSize = 50;
export type Filters = {
  education?: string; profession?: string; minHeight?: number; maxHeight?: number; minWeight?: number; maxWeight?: number; children?: 'none' | 'has';
  excludeCities?: string[]; excludeNationalities?: string[]; excludeTribalBackgrounds?: string[]; excludeSmoking?: string[]; excludeMaritalStatuses?: string[]; nationality?: string; tribalBackground?: string; onlineOnly?: boolean;
  minAge?: number;
  maxAge?: number;
  interest?: string;
  afterId?: string;
  mode?: "recommended" | "all"; offset?: number; search?: string; city?: string; maritalStatus?: string; smoking?: string; dressStyle?: string; work?: string; minFit?: number; availableOnly?: boolean; sort?: "compatibility" | "youngest" | "oldest";
};
export function matchesDiscoveryFilters(p: PublicPerson, f: Filters): boolean {
  const b=p.marriageBasics;
  return (!f.city||canonicalCity(p.city)===canonicalCity(f.city))&&(!f.search||(p.alias+' '+p.occupation+' '+p.bio).includes(f.search))&&
    (!f.education||!!p.education&&canonicalEducation(p.education)===canonicalEducation(f.education))&&
    (!f.profession||!!p.occupation&&canonicalProfession(p.occupation)===canonicalProfession(f.profession))&&
    (f.minHeight===undefined||b?.heightCm!==undefined&&b.heightCm>=f.minHeight)&&(f.maxHeight===undefined||b?.heightCm!==undefined&&b.heightCm<=f.maxHeight)&&
    (f.minWeight===undefined||b?.weightKg!==undefined&&b.weightKg>=f.minWeight)&&(f.maxWeight===undefined||b?.weightKg!==undefined&&b.weightKg<=f.maxWeight)&&
    (!f.children||b?.childrenCount!==undefined&&(f.children==='none'?b.childrenCount===0:b.childrenCount>0))&&
    p.age>=(f.minAge??18)&&p.age<=(f.maxAge??110)&&(!f.smoking||b?.smoking===f.smoking)&&
    (!f.maritalStatus||b?.maritalStatus===f.maritalStatus)&&(!f.dressStyle||b?.dressStyle===f.dressStyle)&&
    (!f.availableOnly||!p.atCapacity)&&(!f.minFit||(preferencePercentage(p.fit)??-1)>=f.minFit)&&
    (!f.interest||p.interests.some(value=>value===f.interest||value===interests.find(item=>item.id===f.interest)?.label))&&
    (!f.onlineOnly||p.online===true)&&(!f.nationality||normalizeNationality(canonicalNationality(b?.nationality??''))===normalizeNationality(canonicalNationality(f.nationality)))&&
    (!f.tribalBackground||b?.tribalBackground===f.tribalBackground)&&
    !f.excludeCities?.some(value=>canonicalCity(value)===canonicalCity(p.city))&&!f.excludeNationalities?.some(value=>normalizeNationality(canonicalNationality(value))===normalizeNationality(canonicalNationality(b?.nationality??'')))&&
    !f.excludeTribalBackgrounds?.includes(b?.tribalBackground??'')&&!f.excludeSmoking?.includes(b?.smoking??'')&&
    !f.excludeMaritalStatuses?.includes(b?.maritalStatus??'');
}
export type RequestAction =
  | "accept"
  | "decline"
  | "cancel"
  | "block"
  | "report";
export type ActivityNotification = { id: string; kind: 'profile_visit' | 'exclusive' | 'interest'; createdAt: string; readAt?: string | null; requestId?: string; person: PublicPerson };
export type StepProgress = { rewindMine?: boolean; rewindPeer?: boolean; updatedAt?: string; stage: number; mine: boolean; peer: boolean; exclusive?: boolean; consentMine?: boolean; consentPeer?: boolean };
export interface CommunitySource extends ManualVerificationSource {
  suggestOpener?(person: PublicPerson): Promise<string>;
  simulation?: DemoSimulationController;
  family?: FamilyRequest;
  familyTestMode?: boolean;
  familyEligibleConnection?(connectionId: string): boolean;
  readiness?: ReadinessRequest;
  readinessTestMode?: boolean;
  readinessEligibleConnection?(connectionId: string): boolean;
  discover(filters: Filters): Promise<PublicPerson[]>;
  portraitUrl(photo: ProfilePortrait): Promise<string>;
  portraitState?(photo: ProfilePortrait): Promise<ProfilePortrait>;
  setPortrait(file: Blob, blur: number, reveal?: { policy: PortraitRevealPolicy; clearBlob?: Blob }): Promise<ProfilePortrait>;
  setPortraitPolicy(photo: ProfilePortrait, policy: PortraitRevealPolicy): Promise<ProfilePortrait>;
  removePortrait(): Promise<void>;
  heartbeat?(): Promise<void>;
  setInterest?(memberId: string, interested: boolean): Promise<void>;
  dismissPerson?(memberId: string): Promise<void>;
  reportPerson?(memberId: string, reason: string): Promise<void>;
  gallery?(subject?: string): Promise<GalleryPhoto[]>;
  galleryUrl?(photo: GalleryPhoto): Promise<string>;
  addGallery?(file: Blob): Promise<void>;
  removeGallery?(photo: GalleryPhoto): Promise<void>;
  rewindStep?(id: string, stage: number, agree: boolean): Promise<StepProgress>;
  noteProfileOpen?(candidateId: string): Promise<void>;
  notifications?(): Promise<ActivityNotification[]>;
  readNotifications?(ids: string[]): Promise<void>;
  inbox(): Promise<Connection[]>;
  requestHistory?(): Promise<RequestHistoryEntry[]>;
  request(memberId: string): Promise<string>;
  demoAcceptOutgoing?(requestId: string): Promise<void>;
  act(requestId: string, action: RequestAction, reason?: string, allowRematch?: boolean): Promise<void>;
  acknowledgeMatch?(key: string): Promise<void>;
  thread(requestId: string, beforeId?: string): Promise<Message[]>;
  messageChanges?(requestId: string, messageIds: string[]): Promise<Message[]>;
  send(requestId: string, body: string, clientId: string, replyToId?: string): Promise<string>;
  deleteMessage?(requestId: string, messageId: string): Promise<void>;
  sendMedia?(requestId: string, file: Blob, kind: ChatAttachment["kind"], clientId: string, duration?: number, viewOnce?: boolean): Promise<string>;
  mediaUrl?(requestId: string, attachmentId: string): Promise<string>;
  openMedia?(requestId: string, attachmentId: string): Promise<string>;
  callPermission?(requestId: string): Promise<CallPermissionState>;
  requestCallPermission?(requestId: string, action: "invite" | "accept" | "decline"): Promise<CallPermissionState>;
  agreement?(requestId:string):Promise<SeriousnessAgreement>;
  agree?(requestId:string,action:'propose'|'accept'|'family',payload?:{days?:number;signed?:boolean;proposalId?:string;confirmed?:boolean}):Promise<SeriousnessAgreement>;
  unreadCount(): Promise<number>;
  markRead(requestId: string, throughId: string): Promise<void>;
  progress?(requestId: string): Promise<StepProgress>;
  nextStep?(requestId: string, stage: number, agree: boolean, exclusiveConsent?: boolean): Promise<StepProgress>;
  watch: WatchUpdates;
}

export function cloudCommunity(userId: string): CommunitySource {
  async function timedRpc<T>(name: string, params: Record<string, unknown>): Promise<T> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15_000);
    try {
      return await callRpc<T>(name, params, userId, controller.signal);
    } finally {
      window.clearTimeout(timer);
    }
  }
  return {
    watch: privateUpdates(userId),
    ...manualVerificationSource(),
    suggestOpener: () => requestAi({mode:'opener'}),
    family: async (action, payload = {}) => unwrapFamilyResult(await timedRpc('marriage_family', { action, payload: boundedFamilyPayload(action, payload) })),
    readiness: (action, payload = {}) => timedRpc('marriage_passport', { action, payload: action === 'save' ? normalizeReadinessDraft(payload) : payload }),
    async portraitState(photo) {
      const current = await timedRpc<ProfilePortrait | null>("marriage_portrait_view", { photo_id: photo.id });
      if (!current || current.id !== photo.id) throw Error("الصورة غير متاحة.");
      return current;
    },
    async portraitUrl(photo) {
      if (!cloud) throw Error("الصورة غير متاحة.");
      const current = await timedRpc<ProfilePortrait | null>("marriage_portrait_view", { photo_id: photo.id });
      if (!current || current.id !== photo.id) throw Error("الصورة غير متاحة.");
      const { data, error } = await cloud.storage.from("nisfayn-profile-portraits").download(current.path);
      if (error) throw Error("تعذّر تحميل الصورة.");
      return URL.createObjectURL(data);
    },
    async setPortrait(file, blur, reveal) {
      if (!cloud) throw Error("الخدمة غير متاحة.");
      validatePortraitUpload(file, blur);
      const policy = validatePortraitReveal(blur, reveal);
      const photo = await timedRpc<ProfilePortrait & { clearPath?: string }>("marriage_portrait_prepare_v2", { blur_level: blur, reveal_policy: policy });
      const storage = cloud.storage.from("nisfayn-profile-portraits");
      const { error } = await storage.upload(photo.path, file, { contentType: "image/jpeg", upsert: false, cacheControl: "0" });
      if (error) throw Error("تعذّر رفع الصورة. أعد المحاولة.");
      if (policy !== 'never') {
        if (!photo.clearPath || !reveal?.clearBlob) throw Error('تعذّر تجهيز النسخة الخاصة. اختاري الصورة مجددًا.');
        const { error: clearError } = await storage.upload(photo.clearPath, reveal.clearBlob, { contentType: 'image/jpeg', upsert: false, cacheControl: '0' });
        if (clearError) throw Error('تعذّر رفع النسخة الخاصة. لم تتغير صورة ملفك الحالية.');
      }
      try {
        return await timedRpc<ProfilePortrait>("marriage_portrait_commit", { photo_id: photo.id });
      } catch (cause) {
        // A lost response can follow a successful commit. Never delete a possibly published photo.
        const current = await timedRpc<ProfilePortrait | null>("marriage_portrait_info", { subject: null }).catch(() => null);
        if (current?.id === photo.id) return current;
        throw cause;
      }
    },
    setPortraitPolicy(photo, policy) {
      return timedRpc<ProfilePortrait>('marriage_portrait_policy', { photo_id: photo.id, reveal_policy: policy });
    },
    async removePortrait() { await timedRpc("marriage_portrait_remove", {}); },
    heartbeat: () => timedRpc("marriage_heartbeat", {}),
    setInterest: (memberId, interested) => timedRpc("marriage_discovery_action", {member_id:memberId,action:interested?'interest':'uninterest'}),
    dismissPerson: memberId => timedRpc("marriage_discovery_action", {member_id:memberId,action:'dismiss'}),
    reportPerson: (memberId, reason) => timedRpc("marriage_discovery_action", {member_id:memberId,action:'report',reason}),
    gallery: subject => timedRpc("marriage_gallery", { action: "list", subject: subject ?? null }),
    async galleryUrl(photo) {
      if (!cloud || !photo.path) throw Error("الصورة غير متاحة.");
      const { data, error } = await cloud.storage.from("nisfayn-profile-gallery").download(photo.path);
      if (error) throw Error("تعذّر تحميل الصورة."); return URL.createObjectURL(data);
    },
    async addGallery(file) {
      if (!cloud) throw Error("الخدمة غير متاحة.");
      const p = await timedRpc<GalleryPhoto>("marriage_gallery", { action: "prepare" });
      const { error } = await cloud.storage.from("nisfayn-profile-gallery").upload(p.path!, file, { contentType: "image/jpeg", upsert: false });
      if (error) { await timedRpc("marriage_gallery", { action: "remove", photo_id: p.id }); throw Error("تعذّر رفع الصورة."); }
      await timedRpc("marriage_gallery", { action: "commit", photo_id: p.id });
    },
    async removeGallery(photo) {
      const p = await timedRpc<GalleryPhoto>("marriage_gallery", { action: "remove", photo_id: photo.id });
      if (cloud && p.path) await cloud.storage.from("nisfayn-profile-gallery").remove([p.path]);
    },
    rewindStep: (id, stage, agree) => timedRpc("marriage_rewind_step", { request_id: id, expected_stage: stage, agree }),
    async noteProfileOpen(candidateId) {
      await timedRpc("marriage_note_profile_open", { candidate_id: candidateId });
    },
    discover: (f) => timedRpc("marriage_browse", { options: { ...f, mode: f.mode ?? "recommended" } }),
    inbox: () => timedRpc("marriage_inbox", {}),
    requestHistory: () => timedRpc("marriage_request_history", {}),
    notifications: () => timedRpc('marriage_notifications', {}),
    readNotifications: ids => timedRpc('marriage_notifications_read', { notification_ids: ids }),
    unreadCount: () => timedRpc("marriage_unread_count", {}),
    progress: (id) => timedRpc("marriage_progress", { request_id: id }),
    nextStep: (id, stage, agree, consent = false) => timedRpc("marriage_next_step", { request_id: id, stage_number: stage, agree, exclusive_consent: consent }),
    async markRead(requestId, throughId) {
      await timedRpc("marriage_mark_thread_read", { request_id: requestId, through_id: throughId });
    },
    request: (memberId) =>
      callRpc("marriage_request", { member_id: memberId }, userId),
    async act(requestId, action, reason, allowRematch = false) {
      await callRpc(
        action === 'cancel' ? 'marriage_cancel' : 'marriage_act',
        action === 'cancel' ? {request_id:requestId,allow_rematch:allowRematch} : { request_id: requestId, action, reason: reason || null },
        userId,
      );
    },
    thread: (requestId, beforeId) =>
      timedRpc("marriage_thread_page", { request_id: requestId, before_id: beforeId ?? null }),
    messageChanges: (requestId, messageIds) => timedRpc("marriage_message_changes", { request_id: requestId, message_ids: messageIds }),
    async deleteMessage(requestId, messageId) { await timedRpc('marriage_delete_message', { request_id: requestId, message_id: messageId }); },
    send: (requestId, body, clientId, replyToId) =>
      timedRpc(
        replyToId ? "marriage_reply" : "marriage_message",
        { request_id: requestId, message_body: body, client_id: clientId, ...(replyToId ? { reply_to_id: replyToId } : {}) },
      ),
  };
}

const sampleLifeAnswers: Record<string, string> = {
  ...Object.fromEntries(dimensions.flatMap(d => [[d.id, d.options[0].code], [d.partnerId, d.options[0].code]])),
  children_plan: "A", partner_children_plan: "A", shared_budget: "B", partner_shared_budget: "B",
  repair_after_conflict: "B", partner_repair_after_conflict: "B", weekly_planning: "A", partner_weekly_planning: "A",
  closeness_pace: "B", partner_closeness_pace: "B", marriage_timeline: "B", partner_marriage_timeline: "B",
};
// Fictional examples only. Real testing accounts start with no Beena answers.
function fictionalBeena(index: number): BeenaProfile {
  const stories = [
    "إذا تعارض موعد عائلي مع وقت خططنا له معًا، أحب أن نفهم أهمية المناسبة ثم نختار موعدًا بديلًا يناسبنا ويحفظ قربنا من أهلنا.",
    "عند مصروف غير متوقع، أفضّل أن نراجع ميزانيتنا بهدوء، ونقرر معًا ما يمكن تأجيله قبل أن نغيّر خططنا الكبيرة.",
    "بعد سوء فهم، يساعدني وقت قصير للهدوء ثم حديث واضح. أقدّر أن يشرح كل منا ما قصده وما يحتاجه كي نبدأ صفحة أفضل.",
    "لو جاءت فرصة عمل مؤثرة في روتيننا، أتمنى أن نتحدث عن مكاسبها وتبعاتها على الطرفين، ثم نجرّب ترتيبًا نراجعه معًا.",
    "في أسبوع مزدحم، أحب أن نعيد توزيع مهام البيت حسب طاقة كل منا، وأن نطلب المساعدة عند الحاجة دون لوم.",
    "حين يمر أحدنا بيوم صعب، أسأله إن كان يحتاج إلى من يستمع أو إلى مساعدة عملية. ما يريحنا قد يختلف من يوم لآخر.",
  ];
  return { version: "beena-v1", answers: Object.fromEntries(beenaScenarios.map((scenario, position) => [scenario.id, {
    self: "ABCD"[(index + position) % 4], partner: ["ABCD"[(index + position + 1) % 4], "ABCD"[(index + position) % 4]],
    importance: position === index % beenaScenarios.length ? 2 : 1,
  }])), story: { scenarioId: beenaScenarios[index % beenaScenarios.length].id, text: stories[index % stories.length], share: true } };
}
export const demoProfile: Profile = {
  displayName: "عضوة تجريبية",
  age: 28,
  city: "الرياض",
  gender: "woman",
  profession: "مصممة",
  bio: "ملف توضيحي",
  lookingFor: "أبحث عن شريك واضح في نيته، لطيف في اختلافه، ويؤمن بأن الزواج شراكة في التفاصيل والمسؤوليات.",
  valuesStatement: "الاحترام وقت الاختلاف، الصدق، وحفظ مساحة لكل منا دون أن نبتعد عن بعضنا.",
  lifeTogether: "بيت هادئ تملؤه الأحاديث، ومساحة لطموح كل منا، ووقت ثابت للأهل ولأنفسنا.",
  education: "بكالوريوس تصميم",
  marriageIntent: "تعارف جاد يهدف إلى الزواج",
  assessmentVersion: "marriage-v2",
  personalityVersion,
  beena: fictionalBeena(0),
  personalityAnswers: Object.fromEntries(personalityQuestions.map((q, index) => [q.id, "BCDDE"[index % 5]])),
  marriageBasics: { heightCm: 165, weightKg: 59, nationality: "سعودية", tribalBackground: "prefer_not_to_say", maritalStatus: "never_married", childrenCount: 0, smoking: "never", skinTone: "tone_3", dressStyle: "hijab", dressFlexibility: "keep" },
  publicAvatar: { style: "hijab", skinTone: "tone_3" },
  appearanceVersion: "appearance-v1",
  partnerCriteria: { height: { mode: "prefer", min: 170 }, smoking: { mode: "prefer", target: "never" }, tribalBackground: { mode: "any" } },
  contact: "sample@example.invalid",
  preferredMinAge: 25,
  preferredMaxAge: 40,
  familyPreference: "بعد التعارف الأول",
  interestIds: ["reading", "travel"],
  surveyAnswers: {
    ...sampleLifeAnswers,
    conversation_initiative_preference: "C",
    partner_conversation_initiative_preference: "A",
    match_disagreement_style: "B",
    partner_match_disagreement_style: "B",
  },
};
type DemoSeed = {
  alias: string; age: number; city: string; occupation: string; education: string;
  bio: string; lookingFor: string; values: string; home: string; interests: string[];
  /** In catalog order: social energy, initiative, depth, openness, closeness,
   * reassurance, support, planning, novelty, conflict pace, directness, quiet. */
  traits: number[];
  timeline: NonNullable<MarriageBasics['marriageTimeline']>;
  meeting: NonNullable<MarriageBasics['meetingPreference']>;
  children?: 'A' | 'B' | 'C'; status?: 'divorced' | 'widowed'; childrenCount?: number;
  nationality?: string; relocate?: boolean; smoking?: 'sometimes' | 'yes';
};
const demoMen: DemoSeed[] = [
  { alias:'فهد',age:32,city:'الرياض',occupation:'محلّل بيانات',education:'ماجستير علوم البيانات',
    bio:'أعمل في تحليل البيانات، لكن أكثر ما يسعدني حديث طويل لا ننظر فيه إلى الساعة. أهوى الكتب والسفر الخفيف، وأخصص نهاية الأسبوع للأهل والمشي في مكان جديد.',
    lookingFor:'شريكة فضولية وواضحة، نتشارك الحديث والقرار دون استعجال القرب.',values:'الصدق من البداية، والوفاء بالوعود الصغيرة.',home:'مكتبة صغيرة وعشاء بلا هواتف، مع مساحة لعمل كل منا.',interests:['travel','reading'],traits:[2,2,5,3,3,2,3,5,3,2,4,5],timeline:'within_3_months',meeting:'public_before_formal' },
  { alias:'سعود',age:30,city:'الرياض',occupation:'مهندس مدني',education:'بكالوريوس هندسة مدنية',
    bio:'أبدأ عملي مبكرًا وأعود للمشي أو تجربة وصفة جديدة. هادئ في البداية، لكنني أحب اللمة الصغيرة. أيام المشاريع مزدحمة لذلك أقدّر وضوح المواعيد.',
    lookingFor:'شريكة تهتم بالعائلة ولها شغفها الخاص؛ نتفق دون أن يفقد أحدنا صوته.',values:'وضوح المسؤوليات وصلة الأهل.',home:'روتين مريح أيام العمل، وطبخ مشترك في نهاية الأسبوع.',interests:['walking','cooking'],traits:[3,2,3,2,3,3,2,5,2,2,4,4],timeline:'three_to_six_months',meeting:'family_before_formal' },
  { alias:'ياسر',age:29,city:'الرياض',occupation:'مصمم منتجات',education:'بكالوريوس تصميم',
    bio:'أصمم منتجات رقمية وألتقط صور الأماكن التي أمر بها. أحب الأفكار الجديدة أكثر من الجداول الطويلة، وأحتاج أحيانًا تذكيرًا بأن أغلق الكمبيوتر وأخرج.',
    lookingFor:'صداقة عميقة ونية واضحة، وحديث صريح عن الأمور الصعبة.',values:'اللطف والخصوصية ودعم الطموح.',home:'بيت فيه فن ونباتات، وخروجة عفوية بين حين وآخر.',interests:['photography','reading'],traits:[3,4,5,4,3,2,3,2,5,3,4,4],timeline:'within_3_months',meeting:'public_before_formal',relocate:true },
  { alias:'مازن',age:34,city:'الرياض',occupation:'معلم',education:'بكالوريوس تربية',
    bio:'أستمتع بعملي مع الطلاب وأحكي عن مواقفهم كثيرًا. أحب الأمسيات العائلية والمتاحف. بعد يوم مليء بالكلام أحتاج بعض الهدوء قبل أن أفتح موضوعًا مهمًا.',
    lookingFor:'شريكة حنونة وعملية، نبني الثقة على مهل.',values:'حسن الظن وتقدير وقت العائلة.',home:'قرب من الأهل مع وقت خاص لنا أسبوعيًا.',interests:['museums','travel'],traits:[4,3,3,4,4,4,4,4,2,2,3,4],timeline:'when_ready',meeting:'family_before_formal' },
  { alias:'نواف',age:35,city:'الرياض',occupation:'باحث',education:'ماجستير إدارة',
    bio:'أعمل في البحث وأكتب قصصًا قصيرة لنفسي. مطلق ولدي طفل أقضي معه وقتًا ثابتًا. أفضّل أن نتحدث بوضوح عن المسؤوليات قبل أن نبني توقعات كبيرة.',
    lookingFor:'شريكة مستقلة في رأيها تتقبل أن الأبوة جزء من حياتي.',values:'المساحة الشخصية والاعتذار عند الخطأ.',home:'أمسيات هادئة وترتيب يحترم مواعيد ابني وراحتنا.',interests:['creative_writing','walking'],traits:[1,2,5,2,2,3,2,4,3,1,4,5],timeline:'over_a_year',meeting:'discuss_together',status:'divorced',childrenCount:1,children:'C' },
  { alias:'عبدالله',age:31,city:'الرياض',occupation:'صيدلي',education:'دكتور صيدلة',
    bio:'دوامي بنظام المناوبات، لذلك قد أتأخر في الرد ولا يعني ذلك قلة الاهتمام. أحب الطبخ وألعاب الطاولة، ويسعدني أن نتشارك تفاصيل اليوم ولو بمكالمة قصيرة.',
    lookingFor:'شريكة نفهم ظروف عمل بعضنا ونعطي وقتنا المشترك أولوية.',values:'التعاون والثقة وطلب الاحتياج بوضوح.',home:'نقسم المسؤوليات وفق المناوبات ونحافظ على موعد أسبوعي.',interests:['board_games','cooking'],traits:[4,4,3,4,5,4,4,3,4,4,4,3],timeline:'six_to_twelve_months',meeting:'public_before_formal' },
  { alias:'عمر',age:27,city:'جدة',occupation:'مهندس برمجيات',education:'بكالوريوس علوم حاسب',
    bio:'أعمل عن بُعد وأعيش في جدة. أستمتع بالبحر وألعاب الطاولة أكثر من المناسبات الكبيرة. أكتب أفضل مما أتكلم في البداية، ثم يصبح الحديث أسهل.',
    lookingFor:'شريكة تحترم الهدوء وتحب مشاركة هواية دون أن نتشابه في كل شيء.',values:'الخصوصية والاتفاق على وقت للشاشات.',home:'وقت للعمل وآخر لنا؛ ويمكنني الانتقال إن اتفقنا.',interests:['board_games','walking','reading'],traits:[1,1,4,2,2,2,1,4,4,1,3,5],timeline:'six_to_twelve_months',meeting:'public_before_formal',relocate:true },
  { alias:'خالد',age:38,city:'الخبر',occupation:'مدير عمليات',education:'بكالوريوس إدارة أعمال',
    bio:'أحب العمل الواضح والقوائم القصيرة. أرمل وأب لطفلة، وأعيد ترتيب حياتي بهدوء. أخرج للمشي بعد العشاء وأجيد الاستماع أكثر من المجاملات الطويلة.',
    lookingFor:'شريكة نناقش معها شكل الأسرة والمسؤوليات من البداية.',values:'الاستقرار والصدق واحترام تجربة الآخر.',home:'بيت منتظم وقريب من مدرسة ابنتي، مع مساحة لاهتمامات الجميع.',interests:['walking','cooking'],traits:[2,3,3,2,3,2,2,5,1,3,5,4],timeline:'when_ready',meeting:'family_before_formal',status:'widowed',childrenCount:1,children:'C' },
  { alias:'راشد',age:26,city:'الرياض',occupation:'أخصائي تسويق',education:'بكالوريوس تسويق',
    bio:'غالبًا أنا من يقترح الخروجة ويجمع الأصدقاء. أحب التصوير والرحلات القصيرة، لكنني أتعلم ألّا أملأ كل نهاية أسبوع بخطة. أبحث عن تعارف جاد بروح خفيفة.',
    lookingFor:'شريكة تتكلم بصراحة وتستمتع بالتجربة حتى عندما لا تكون مثالية.',values:'المبادرة والمرح واحترام الرفض.',home:'بيت يستقبل الأصدقاء أحيانًا، مع أيام هادئة نلتزم بها.',interests:['travel','photography'],traits:[5,5,1,4,5,4,5,1,5,4,4,1],timeline:'three_to_six_months',meeting:'public_before_formal' },
  { alias:'حسن',age:36,city:'الدمام',occupation:'محاسب',education:'بكالوريوس محاسبة',
    bio:'أردني مقيم في الدمام منذ سنوات. أحب الأرقام والكتب التاريخية والطبخ نهاية الأسبوع. لست سريعًا في مشاركة التفاصيل، لكنني ثابت في التواصل عندما أرتاح.',
    lookingFor:'شريكة نتفق معها على مكان الاستقرار وعلاقة كل منا بأهله.',values:'الالتزام بالاتفاقات والعدل في المصاريف.',home:'ميزانية واضحة وزيارات عائلية نخطط لها مسبقًا.',interests:['reading','cooking'],traits:[2,1,4,1,3,3,2,5,2,2,4,5],timeline:'within_3_months',meeting:'family_before_formal',nationality:'أردني',relocate:true },
  { alias:'بندر',age:33,city:'الرياض',occupation:'صاحب مقهى',education:'دبلوم إدارة ضيافة',
    bio:'أدير مقهى صغيرًا وأعرف أن بداية المشروع تأخذ من وقتي. اجتماعي وأحب الناس، وأحتاج شريكة تعرف أن انشغالي يمكن تنظيمه لا أن يصبح عذرًا دائمًا.',
    lookingFor:'شريكة عملية وصريحة نضع معها حدودًا بين العمل والبيت.',values:'المسؤولية والمرونة وترك وقت للعلاقة.',home:'صباحات هادئة حين يسمح العمل، وسفر قصير خارج المواسم.',interests:['cooking','travel','photography'],traits:[5,5,2,3,4,2,3,2,5,5,5,2],timeline:'six_to_twelve_months',meeting:'discuss_together',smoking:'sometimes' },
  { alias:'سلمان',age:25,city:'المدينة المنورة',occupation:'أخصائي مختبر',education:'بكالوريوس علوم مختبرات',
    bio:'بدأت عملي منذ عامين وما زلت أبني استقراري. قريب من أهلي وأحب الزيارات البسيطة. أستمتع بالمشي والقراءة وأفضل أن يكون التعارف واضحًا للأهل.',
    lookingFor:'شريكة صبورة نخطط للاستقرار معًا ونتشارك القيم الأساسية.',values:'صلة الرحم والوضوح والتدرج.',home:'بداية بسيطة ضمن إمكاناتنا ثم نطورها مع الوقت.',interests:['walking','reading'],traits:[3,2,3,3,4,5,4,4,2,2,1,4],timeline:'over_a_year',meeting:'after_formal',relocate:true },
  { alias:'زياد',age:40,city:'جدة',occupation:'مهندس معماري',education:'ماجستير عمارة',
    bio:'مطلق دون أبناء. أحب العمارة القديمة والسفر البطيء والتقاط الصور. تعلمت أن إعجابنا بالشخص لا يغني عن السؤال عن شكل الحياة الذي يريده فعلًا.',
    lookingFor:'شريكة تعرف ما تريد، ونناقش موضوع الأطفال دون افتراضات.',values:'الاستقلال واحترام الحدود والوضوح.',home:'بيت هادئ ومساحة للعمل الإبداعي ورحلات نتفق عليها.',interests:['museums','photography','travel'],traits:[2,3,5,3,2,1,2,3,5,3,5,5],timeline:'when_ready',meeting:'public_before_formal',status:'divorced',children:'B',relocate:true },
  { alias:'إبراهيم',age:28,city:'الرياض',occupation:'أخصائي علاج طبيعي',education:'بكالوريوس علاج طبيعي',
    bio:'أحب عملي والحركة، وأرتاح بالحديث مع شخص قريب بعد يوم طويل. أتذكر التفاصيل الصغيرة وأحب التعبير عن الاهتمام، وأحاول ألا أقلق من تأخر الردود.',
    lookingFor:'شريكة حنونة وواضحة في تواصلها، ولكل منا هواياته وأصدقاؤه.',values:'التطمين المتبادل واللطف دون ضغط.',home:'تواصل يومي وعشاء بسيط ومشي مشترك حين تسمح الظروف.',interests:['walking','cooking'],traits:[4,4,4,5,5,5,5,3,3,4,3,2],timeline:'three_to_six_months',meeting:'public_before_formal' },
  { alias:'طارق',age:37,city:'أبها',occupation:'مصوّر مستقل',education:'بكالوريوس إعلام',
    bio:'أعيش في أبها ويأخذني عملي بين المدن. أحب الطبيعة والكتابة ولا ألتزم بروتين واحد طويلًا. أريد الاستقرار مع شخص نتفق معه على معنى الاستقرار نفسه.',
    lookingFor:'شريكة مرنة تحب تجربتها الخاصة وتستطيع قول ما يناسبها.',values:'حرية الرأي والصدق وحفظ المساحة الشخصية.',home:'قاعدة هادئة نعود إليها من العمل والسفر، مع مرونة في المدينة.',interests:['photography','creative_writing','travel'],traits:[3,3,4,4,2,1,3,1,5,2,4,5],timeline:'six_to_twelve_months',meeting:'discuss_together',relocate:true,children:'C' },
];
const demoWomen: DemoSeed[] = [
  { alias:'سارة',age:29,city:'الرياض',occupation:'محللة بيانات',education:'ماجستير تحليل أعمال',
    bio:'أحب عملي وما يعلّمني من فضول ودقة، وأجد توازني في الكتب والرحلات القصيرة. أحتاج وقتًا في البداية، ثم أشارك الحديث والضحك بسهولة.',
    lookingFor:'شريك فضولي وواضح نشارك الحديث والقرار.',values:'الصدق والخصوصية واحترام الطموح.',home:'وقت هادئ بعد العمل ورحلة نخطط لها معًا.',interests:['reading','travel'],traits:[2,2,5,3,3,3,2,4,4,2,4,5],timeline:'within_3_months',meeting:'public_before_formal' },
  { alias:'لولوة',age:28,city:'الرياض',occupation:'مهندسة مدنية',education:'بكالوريوس هندسة مدنية',
    bio:'مهندسة أؤمن أن أجمل الأشياء تُبنى على مهل. أبدأ يومي بالمشي وأجرب وصفة جديدة في الإجازة. أحب عملي، ويهمني أن نخطط لأوقاتنا بواقعية.',
    lookingFor:'شريك يساند عملي ونكون سندًا لبعضنا في الأيام المزدحمة.',values:'وضوح المسؤوليات وتقدير الجهد.',home:'بيت عملي ودافئ، نقسم مهامه وفق الوقت المتاح.',interests:['walking','cooking'],traits:[3,3,3,3,4,3,4,5,3,3,4,4],timeline:'three_to_six_months',meeting:'family_before_formal' },
  { alias:'نورة',age:27,city:'الرياض',occupation:'مصممة منتجات',education:'بكالوريوس تصميم',
    bio:'أحب تصوير التفاصيل الصغيرة وزيارة المعارض. أتحمس لأفكار كثيرة وأحتاج أحيانًا إلى تبسيط خططي. يسعدني حديث يجمع الجدية وخفة الروح.',
    lookingFor:'شريك صريح يحترم الاختلاف ويستمتع بفضول الحياة.',values:'اللطف وحرية التعبير والخصوصية.',home:'ركن للرسم وكتب ونباتات، ووقت نجرب فيه شيئًا جديدًا.',interests:['photography','museums'],traits:[4,4,4,5,4,3,4,2,5,3,4,3],timeline:'six_to_twelve_months',meeting:'public_before_formal',relocate:true },
  { alias:'أمل',age:31,city:'الرياض',occupation:'معلمة',education:'بكالوريوس تربية',
    bio:'أحب عملي مع الأطفال والوقت مع أهلي. هادئة في التجمعات الكبيرة، وأفضّل حديثًا طويلًا مع شخص قريب. أحتاج أن أشعر بالأمان قبل مشاركة كل التفاصيل.',
    lookingFor:'شريك حنون وعملي نتحدث معه عن المستقبل دون استعجال.',values:'المودة وحسن الظن وحفظ أسرار البيت.',home:'روتين دافئ وزيارات للأهل ووقت للقراءة.',interests:['reading','museums'],traits:[2,1,4,2,4,4,3,4,2,1,2,5],timeline:'when_ready',meeting:'after_formal' },
  { alias:'هند',age:34,city:'الرياض',occupation:'باحثة',education:'دكتوراه علوم اجتماعية',
    bio:'فضولي يقودني إلى البحث والكتابة والاستماع لقصص الآخرين. أحب استقلالي ومساحة عملي، وأرى أن القرب لا يعني أن نتشارك كل دقيقة من يومنا.',
    lookingFor:'شريك مستقل في رأيه يحترم المساحة الشخصية والحوار.',values:'الاحترام والوضوح والقدرة على مراجعة الرأي.',home:'أمسيات هادئة ومكتبة مشتركة واهتمامات يحتفظ بها كل منا.',interests:['creative_writing','walking'],traits:[1,2,5,2,1,1,2,4,4,2,5,5],timeline:'over_a_year',meeting:'discuss_together',children:'C' },
  { alias:'منال',age:30,city:'الرياض',occupation:'صيدلانية',education:'دكتور صيدلة',
    bio:'أستمتع بالجانب الإنساني من عملي وبالطبخ وألعاب الطاولة. مناوباتي تتغير، لذلك أقدّر من يتفق معي على وقت مناسب بدل انتظار الرد طوال اليوم.',
    lookingFor:'شريك متعاون نضع احتياجاتنا في كلمات واضحة.',values:'الثقة والاهتمام اليومي واحترام الانشغال.',home:'نخطط لأسبوعنا معًا ونترك مساحة لتغيّر الدوام.',interests:['board_games','cooking'],traits:[4,3,3,4,4,4,5,3,3,4,4,3],timeline:'six_to_twelve_months',meeting:'public_before_formal' },
  { alias:'ريم',age:25,city:'جدة',occupation:'كاتبة محتوى',education:'بكالوريوس لغة عربية',
    bio:'أكتب في عملي وفي دفتري، وأحب المشي قرب البحر. لست سريعة في بدء المحادثة، لكنني أحب الأسئلة التي تجعلنا نفهم بعضنا دون أن يبدو اللقاء مقابلة.',
    lookingFor:'شريك صبور ومبادر يحترم هدوئي دون أن يفسّره ببرود.',values:'الصدق والرفق ومساحة للتعبير.',home:'وقت للكتابة وطقوس بسيطة نبتكرها معًا.',interests:['creative_writing','walking','reading'],traits:[1,1,5,3,3,4,2,2,4,1,2,5],timeline:'six_to_twelve_months',meeting:'public_before_formal',relocate:true },
  { alias:'دانة',age:32,city:'الخبر',occupation:'مديرة مشاريع',education:'ماجستير إدارة مشاريع',
    bio:'أحب الخطط الواضحة والقرارات التي تتحول إلى عمل. اجتماعية في عملي وخارجه، لكنني أتعلم أن ليس كل موضوع يحتاج حلًا فورًا؛ أحيانًا يحتاج أن نسمعه فقط.',
    lookingFor:'شريك واضح في قراراته ونستطيع الاختلاف معه باحترام.',values:'الالتزام والمساواة في سماع الرأي.',home:'خطط واقعية ومسؤوليات نتفق عليها ووقت للراحة.',interests:['travel','board_games'],traits:[5,5,3,3,3,2,3,5,4,5,5,2],timeline:'three_to_six_months',meeting:'family_before_formal',relocate:true },
  { alias:'رغد',age:24,city:'الرياض',occupation:'معلمة فنون',education:'بكالوريوس تربية فنية',
    bio:'أحب المعارض والطبخ مع صديقاتي وأبدأ الحديث بسهولة. عاطفية وأعبّر عن الاهتمام بوضوح، وأفضّل أن نتفق على حدود التواصل حتى لا نسيء فهم انشغال بعضنا.',
    lookingFor:'شريك لطيف وصريح ويحب أن نتشارك التجارب الجديدة.',values:'الاهتمام والمرح وقبول اختلاف الذوق.',home:'ألوان وطبخ وتجارب جديدة، مع وقت قريب من الأهل.',interests:['museums','cooking','photography'],traits:[5,5,2,5,5,5,5,1,5,4,3,1],timeline:'over_a_year',meeting:'public_before_formal' },
  { alias:'عبير',age:37,city:'الدمام',occupation:'أخصائية موارد بشرية',education:'بكالوريوس إدارة أعمال',
    bio:'مطلقة وأم لابن في المرحلة الابتدائية. أحب القراءة والزيارات الصغيرة، وأفضّل الحديث الواضح عن الأبناء وحدود العائلة قبل أي خطوة جادة.',
    lookingFor:'شريك ناضج يتقبل مسؤولياتي ونبني معه ثقة بهدوء.',values:'الاحترام والثبات وعدم إدخال الأبناء في خلافات الكبار.',home:'بيت آمن ومنظم يحترم مواعيد ابني ووقت شريك حياتي.',interests:['reading','walking'],traits:[3,3,4,3,4,4,4,5,1,2,5,4],timeline:'when_ready',meeting:'family_before_formal',status:'divorced',childrenCount:1,children:'C' },
  { alias:'جود',age:28,city:'الرياض',occupation:'مؤسسة متجر إلكتروني',education:'بكالوريوس تجارة إلكترونية',
    bio:'أدير متجرًا صغيرًا وأحب التجربة والتعلّم من الأخطاء. أيامي ليست متشابهة، وأحيانًا أنسى الوقت في العمل. أحاول أن أضع حدودًا تحمي حياتي خارج المشروع.',
    lookingFor:'شريك عملي ومرن يشجع طموحي ويخبرني بما يحتاجه.',values:'المبادرة والصدق وتحمل المسؤولية.',home:'مساحة للطموح مع موعد ثابت لنا بعيدًا عن العمل.',interests:['travel','photography'],traits:[5,4,3,4,3,2,3,2,5,5,5,2],timeline:'six_to_twelve_months',meeting:'discuss_together' },
  { alias:'مريم',age:29,city:'المدينة المنورة',occupation:'مترجمة',education:'ماجستير ترجمة',
    bio:'مصرية مقيمة في المدينة، أحب اللغات والكتب والطبخ. علاقتي بأهلي قريبة، وأحتاج أن نناقش مكان السكن والزيارات والسفر بوضوح لأن العائلتين قد تكونان بعيدتين.',
    lookingFor:'شريك يحترم صلة الأهل ويشارك التخطيط لحياة مستقرة.',values:'الوضوح والوفاء والاحترام بين العائلتين.',home:'بيت دافئ وميزانية للزيارات ووقت نتعلم فيه من بعضنا.',interests:['reading','cooking'],traits:[2,2,4,4,5,4,4,4,3,2,3,4],timeline:'within_3_months',meeting:'family_before_formal',nationality:'مصرية',relocate:true },
  { alias:'أروى',age:39,city:'جدة',occupation:'مهندسة معمارية',education:'ماجستير عمارة',
    bio:'مطلقة دون أبناء، وأعرف أنني لا أرغب في الإنجاب. أحب عملي والسفر البطيء والتصوير. أذكر هذا مبكرًا حتى يبدأ التعارف على وضوح واحترام لا على أمل تغيير الآخر.',
    lookingFor:'شريك يشاركني قرار عدم الإنجاب ويحترم استقلالنا.',values:'وضوح القرارات واحترام الحدود.',home:'شراكة وصداقة وبيت هادئ نعود إليه بعد يوم مليء بالتجارب.',interests:['museums','photography','travel'],traits:[2,3,5,3,2,1,2,4,5,3,5,5],timeline:'when_ready',meeting:'public_before_formal',status:'divorced',children:'B',relocate:true },
  { alias:'شذى',age:26,city:'الرياض',occupation:'أخصائية تغذية',education:'بكالوريوس تغذية',
    bio:'أحب المشي وتجربة الوصفات والحديث مع المقربين. أقدّر التعبير المباشر عن الاهتمام، وأحاول أن أسأل بدل أن أخمّن عندما يتغير إيقاع التواصل.',
    lookingFor:'شريك دافئ وواضح نساند بعضنا دون أن نفقد مساحتنا الخاصة.',values:'الطمأنينة والصدق واللطف وقت الاختلاف.',home:'حديث يومي ومهام نتقاسمها ووقت للعائلة ولأنفسنا.',interests:['walking','cooking'],traits:[4,4,3,5,5,5,5,3,4,4,4,2],timeline:'three_to_six_months',meeting:'public_before_formal' },
  { alias:'ليان',age:33,city:'أبها',occupation:'مصممة داخلية',education:'بكالوريوس تصميم داخلي',
    bio:'أعمل على مشاريع بين أبها والرياض. أحب الطبيعة والأماكن القديمة، وأحتاج مساحة هادئة بعد السفر. لم أحسم قرار الإنجاب وأفضل أن أقول ذلك من البداية.',
    lookingFor:'شريك نناقش معه خطط المستقبل بمرونة وصراحة.',values:'المساحة الشخصية والتفاهم دون افتراضات.',home:'بيت قريب من الطبيعة ومرونة في المدينة عندما تكون الفرصة مناسبة.',interests:['photography','museums','walking'],traits:[1,2,4,3,2,2,1,2,5,1,4,5],timeline:'six_to_twelve_months',meeting:'discuss_together',relocate:true,children:'C' },
];

// This assessment measures behaviors, not MBTI categories. Fictional responses
// intentionally span all 12 measured dimensions; no types are inferred for users.
function demoSurvey(seed: DemoSeed, index: number): Record<string,string> {
  const [social,initiative,depth,openness,closeness,, ,planning,novelty,conflict,directness] = seed.traits;
  const self: Record<string,string> = {
    children_plan: seed.children ?? 'A', residence_plan: seed.relocate ? 'C' : 'A', wife_work: index % 5 === 3 ? 'C' : 'A',
    marriage_timeline: seed.timeline === 'over_a_year' ? 'C' : seed.timeline === 'when_ready' ? 'D' : seed.timeline === 'six_to_twelve_months' ? 'B' : 'A',
    family_boundaries: seed.meeting === 'family_before_formal' ? 'B' : index % 3 ? 'A' : 'C',
    shared_budget: planning >= 4 ? 'A' : planning === 3 ? 'B' : 'C', household_roles: planning >= 4 ? 'A' : index % 2 ? 'B' : 'C',
    weekly_planning: planning >= 4 ? 'A' : planning === 3 ? 'B' : 'C', social_rhythm: social <= 2 ? 'A' : social === 3 ? 'B' : 'C',
    conversation_initiative_preference: initiative <= 1 ? 'A' : initiative === 2 ? 'D' : initiative === 3 ? 'B' : 'C',
    match_disagreement_style: directness === 5 ? 'A' : novelty === 5 && social >= 4 ? 'C' : index % 2 ? 'B' : 'D',
    repair_after_conflict: conflict >= 4 ? 'A' : conflict <= 2 ? 'B' : 'C', conversation_depth: depth >= 4 ? 'A' : 'B',
    closeness_pace: closeness <= 2 ? 'C' : openness >= 4 ? 'B' : 'A', curiosity_style: depth >= 4 ? 'A' : social >= 4 ? 'C' : 'B',
    early_openness: openness <= 2 ? 'A' : openness === 3 ? 'B' : 'C',
  };
  return Object.fromEntries(dimensions.flatMap(d => [[d.id,self[d.id]], [d.partnerId,
    d.id === 'conversation_initiative_preference' && initiative <= 2 ? 'C' : self[d.id]] ]));
}

export const demoPeople = [demoMen,demoWomen].flatMap((group,genderIndex) => group.map((seed,index) => {
  const woman = genderIndex === 1;
  const menPhotos = ['fahad','saud','yasser','','nawaf','abdullah'];
  const womenPhotos = ['sarah','lulwa','noura','amal','hind','manal'];
  const photo = woman ? womenPhotos[index] : menPhotos[index];
  const tone = (['tone_3','tone_5','tone_2','tone_7','tone_4','tone_6'] as const)[index%6];
  const dress = (['hijab','niqab','uncovered','hijab','niqab','uncovered'] as const)[index%6];
  return {
    id:`${woman?'w':''}p${String(index+1).padStart(2,'0')}`, isDemo:true as const,
    alias:seed.alias,age:seed.age,city:seed.city,occupation:seed.occupation,profession:seed.occupation,bio:seed.bio,
    gender:woman?'woman' as const:'man' as const,education:seed.education,
    lookingFor:seed.lookingFor,valuesStatement:seed.values,lifeTogether:seed.home,interestIds:seed.interests,
    marriageIntent:seed.timeline==='when_ready'?'تعارف جاد على مهل':'تعارف جاد يهدف إلى الزواج',
    familyPreference:seed.meeting==='family_before_formal'||seed.meeting==='after_formal'?'من البداية':'بعد التعارف الأول',
    assessmentVersion:'marriage-v2' as const,personalityVersion,
    personalityAnswers:Object.fromEntries(personalityQuestions.map((q,qi)=>[q.id,'ABCDE'[seed.traits[qi]-1]])),
    surveyAnswers:demoSurvey(seed,index),beena:fictionalBeena(index+genderIndex*15+1),
    preferredMinAge:Math.max(22,seed.age-7),preferredMaxAge:Math.min(48,seed.age+9),
    partnerCriteria:{ tribalBackground:{mode:'any' as const},nationality:{mode:'any' as const},smoking:{mode:seed.smoking?'any' as const:'prefer' as const,target:'never' as const} },
    marriageBasics:{
      heightCm:woman?[165,169,162,167,164,166,160,171,158,163,168,161,170,164,166][index]:[179,183,174,181,176,178,172,180,185,175,177,173,182,179,178][index],
      weightKg:woman?[59,64,55,62,58,60,54,67,52,65,61,57,66,58,63][index]:[78,85,72,82,76,80,69,87,84,75,83,73,86,79,77][index],
      nationality:seed.nationality??(woman?'سعودية':'سعودي'),maritalStatus:seed.status??'never_married',childrenCount:seed.childrenCount??0,
      smoking:seed.smoking??'never',tribalBackground:index%5===4?'prefer_not_to_say':index%2?'tribal':'non_tribal',
      marriageTimeline:seed.timeline,meetingPreference:seed.meeting,
      ...(woman?{skinTone:tone,dressStyle:dress,dressFlexibility:index%2?'open_to_discussion':'keep'}:{}),
    } as MarriageBasics,
    publicAvatar:woman&&index>=6&&index%3===0?{style:dress,skinTone:tone} as PublicAvatar:null,
    demoPhoto:photo?`/demo/portraits/${photo}${woman?'-realistic-v2':''}.webp`:undefined,
  };
}));
const examples = demoPeople;


const demoPortraitFiles = new Map<string, { file: Blob; clearBlob?: Blob; policy: PortraitRevealPolicy }>();
function validatePortraitUpload(file: Blob, blur: number) {
  if (file.type !== "image/jpeg" || !file.size || file.size > 3 * 1024 * 1024) throw Error("استخدم صورة JPEG بحجم لا يتجاوز ٣ ميغابايت.");
  if (!Number.isInteger(blur) || blur < 0 || blur > 100) throw Error("اختر درجة تمويه من ٠ إلى ١٠٠.");
}
function validatePortraitReveal(blur: number, reveal?: { policy: PortraitRevealPolicy; clearBlob?: Blob }): PortraitRevealPolicy {
  const policy = reveal?.policy ?? 'never';
  if (!['never','matched','serious','family'].includes(policy)) throw Error('اختاري موعدًا صالحًا لإزالة التمويه.');
  if (policy !== 'never') {
    if (!blur || !reveal?.clearBlob) throw Error('اختاري الصورة مجددًا لحفظ نسخة واضحة خاصة.');
    validatePortraitUpload(reveal.clearBlob, 0);
  }
  return policy;
}

export function demoCommunity(viewer: () => Profile, seedConnections = true, simulationOptions: DemoSimulationOptions = {}): CommunitySource & { simulation: DemoSimulationController } {
  const listeners = new Set<() => void>();
  const peerPrefix = viewer().gender === "man" ? "w" : "";
  let simulation: DemoSimulationController;
  function notify() { persist(); listeners.forEach((listener) => listener()); }
  type Local = SimulationRecord;
  const fixtureCreatedAt = new Date().toISOString();
  const records: Local[] = [
    {
      id: "demo-incoming", createdAt: fixtureCreatedAt, updatedAt: fixtureCreatedAt,
      peer: peerPrefix + "p03",
      direction: "incoming",
      status: "pending",
    },
    {
      id: "demo-mutual", createdAt: fixtureCreatedAt, updatedAt: fixtureCreatedAt,
      peer: peerPrefix + "p04",
      direction: "incoming",
      status: "accepted",
    },
  ];
  const messages = new Map<string, Message[]>([
    [
      "demo-mutual",
      [
        {
          id: "welcome",
          senderIsMe: false,
          body: peerPrefix ? "أهلًا، ما المكان الذي تود زيارته؟" : "أهلًا، لفتني أننا نحب السفر. ما المكان الذي تودين زيارته؟",
          createdAt: new Date().toISOString(),
        },
      ],
    ],
  ]);
  const mediaFiles = new Map<string, Blob>();
  if (!seedConnections) records.splice(0);
  const hiddenPeople = new Set<string>(), interestedPeople = new Set<string>(), blockedPeople = new Set<string>();
  const onlinePeople = new Set<string>();
  const activityRows: ActivityNotification[] = [];
  const celebrationsSeen = new Set<string>();
  const readThrough = new Map<string, string>();
  const steps = new Map<string, StepProgress>();
  let weeklyPicks: string[] | undefined;
  let exclusiveId: string | null = null;
  const galleryPhotos: (GalleryPhoto & { url: string })[] = [];
  const storageKey = simulationOptions.storageKey ? `${simulationOptions.storageKey}:${viewer().gender}` : undefined;
  let persistedSimulation: { eventCount?: number; log?: import('./simulation').DemoSimulationEvent[] } | undefined;
  function persist() {
    if (!storageKey || typeof localStorage === 'undefined' || !simulation) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({version:1, records:records.slice(0,40),
        messages:[...messages].map(([id,rows])=>[id,rows.filter(row=>!row.attachment).slice(-100)]),
        hidden:[...hiddenPeople],blocked:[...blockedPeople],interested:[...interestedPeople],read:[...readThrough],steps:[...steps],
        exclusiveId,activity:activityRows.slice(-40),seen:[...celebrationsSeen],simulation:simulation.snapshot()}));
    } catch { /* Quota/private browsing must not break the test app. */ }
  }
  if (storageKey && typeof localStorage !== 'undefined') {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved?.version === 1 && Array.isArray(saved.records) && Array.isArray(saved.messages)) {
        const validPerson = (id: unknown) => typeof id === 'string' && examples.some(person=>person.id===id && person.gender!==viewer().gender);
        const restored: Local[] = saved.records.slice(0,40).filter((r:Local)=>r&&typeof r.id==='string'&&validPerson(r.peer)&&['incoming','outgoing'].includes(r.direction)&&['pending','accepted','closed'].includes(r.status)&&typeof r.createdAt==='string'&&typeof r.updatedAt==='string');
        records.splice(0,records.length,...restored); messages.clear();
        for (const item of saved.messages.slice(0,40)) {
          if (!Array.isArray(item)||!records.some(row=>row.id===item[0])||!Array.isArray(item[1])) continue;
          messages.set(item[0],item[1].filter((m:Message)=>m&&typeof m.id==='string'&&typeof m.body==='string'&&m.body.length<=1000&&typeof m.createdAt==='string'&&typeof m.senderIsMe==='boolean'&&!m.attachment).slice(-100));
        }
        for (const [key,set] of [['hidden',hiddenPeople],['blocked',blockedPeople],['interested',interestedPeople]] as const) {
          for (const id of Array.isArray(saved[key])?saved[key]:[]) if(validPerson(id))set.add(id);
        }
        for (const entry of Array.isArray(saved.read)?saved.read:[]) if(Array.isArray(entry)&&typeof entry[0]==='string'&&typeof entry[1]==='string')readThrough.set(entry[0],entry[1]);
        for (const entry of Array.isArray(saved.steps)?saved.steps:[]) if(Array.isArray(entry)&&records.some(r=>r.id===entry[0])&&entry[1]&&[0,1,2].includes(entry[1].stage))steps.set(entry[0],entry[1]);
        exclusiveId=records.some(r=>r.id===saved.exclusiveId&&r.status==='accepted')?saved.exclusiveId:null;
        activityRows.push(...(Array.isArray(saved.activity)?saved.activity:[]).filter((n:ActivityNotification)=>n&&typeof n.id==='string'&&validPerson(n.person?.id)&&['profile_visit','interest'].includes(n.kind)).slice(-40));
        for(const id of Array.isArray(saved.seen)?saved.seen:[])if(typeof id==='string')celebrationsSeen.add(id);
        if(saved.simulation&&Number.isFinite(saved.simulation.eventCount)&&Array.isArray(saved.simulation.log))persistedSimulation={eventCount:saved.simulation.eventCount,log:saved.simulation.log.filter((event:import('./simulation').DemoSimulationEvent)=>event&&typeof event.id==='string'&&typeof event.detail==='string'&&typeof event.at==='string'&&typeof event.kind==='string').slice(-30)};
      }
    } catch { /* Ignore an older/corrupt local fixture. */ }
  }
  function unread(id: string) {
    const list = messages.get(id) ?? [];
    const last = list.findIndex((row) => row.id === readThrough.get(id));
    return list.slice(last + 1).filter((row) => !row.senderIsMe && !row.deletedAt).length;
  }
  function candidates() {
    return rankPreferences({ ...viewer(), id: "demo-viewer" }, examples).map(({ person, ...fit }) => card(person, fit));
  }
  function card(person: (typeof examples)[number], { reasons, fit }: ReturnType<typeof describeFit>): PublicPerson {
    // Fixtures have no member consent receipt. Keep their private matching
    // inputs intact, while using the same default-hidden public presentation.
    const visibleBasics={...person.marriageBasics};
    for(const key of ['skinTone','tribalBackground','tribeName','religiousAffiliation','prayerPractice'] as const)delete visibleBasics[key];
    return {
      id: person.id, isDemo:true, online:onlinePeople.has(person.id), interested:interestedPeople.has(person.id),
      atCapacity: false, viewerAtCapacity: records.filter(r => r.status === "accepted").length + (simulationOptions.externalAccepted?.()??0) >= 2,
      connectionId: records.find(r => r.peer === person.id && r.status !== "closed")?.id,
      connectionStatus: records.find(r => r.peer === person.id && r.status !== "closed")?.status as "accepted" | "pending" | undefined,
      exclusive: records.some(r => r.id === exclusiveId && r.peer === person.id),
      alias: person.alias,
      age: person.age,
      city: person.city,
      occupation: person.occupation,
      bio: person.bio,
      lookingFor: person.lookingFor,
      valuesStatement: person.valuesStatement,
      lifeTogether: person.lifeTogether,
      education: person.education,
      marriageIntent: person.marriageIntent,
      familyPreference: person.familyPreference,
      beenaStory: sharedBeenaStory(person.beena),
      marriageBasics: visibleBasics,
      publicAvatar: null,
      demoPhoto: person.demoPhoto,
      reasons,
      fit,
      interests: interests
        .filter((i) => person.interestIds.includes(i.id))
        .map((i) => i.label),
    };
  }
  function open(id: string) {
    const r = records.find((r) => r.id === id && r.status !== "closed");
    if (!r) throw new CloudError("هذا الطلب غير متاح.", 403);
    return r;
  }
  function threadRows(id: string) {
    if (open(id).status !== 'accepted') throw new CloudError('المحادثة غير متاحة.', 403);
    return (messages.get(id) ?? []).map(message => {
      const original = message.reply ? messages.get(id)?.find(row => row.id === message.reply?.id) : undefined;
      return sanitizeMessage(original?.deletedAt && message.reply ? { ...message, reply: { ...message.reply, deletedAt: original.deletedAt } } : message);
    });
  }
  function mediaMessage(id: string, attachmentId: string) {
    const message = threadRows(id).find(row => row.attachment?.id === attachmentId && !row.deletedAt);
    if (!message?.attachment || !mediaFiles.has(attachmentId)) throw Error('الملف غير متاح.');
    return message;
  }
  function weekly() {
    weeklyPicks ??= candidates().filter(p => !records.some(r => r.peer === p.id)).slice(0, 5).map(p => p.id);
    return weeklyPicks;
  }
  function progress(id: string) {
    if (open(id).status !== "accepted") throw new Error("المحادثة غير متاحة.");
    return steps.get(id) ?? { stage: 0, mine: false, peer: id === "demo-mutual" };
  }
  simulation = createDemoSimulation({
    people:candidates,records,messages,online:onlinePeople,
    available:id=>!hiddenPeople.has(id)&&!blockedPeople.has(id)&&!records.some(r=>r.peer===id&&r.status==='closed'&&!r.allowRematch),
    exclusive:()=>Boolean(exclusiveId),
    activity(kind,personId){
      const person=candidates().find(p=>p.id===personId);if(!person)return;
      // One unread event per person/kind is enough to exercise the UI without flooding it.
      if(activityRows.some(row=>row.person.id===personId&&row.kind===kind&&!row.readAt))return;
      activityRows.push({id:crypto.randomUUID(),kind,createdAt:new Date().toISOString(),person});
      if(activityRows.length>40)activityRows.splice(0,activityRows.length-40);
    },
    changed:notify,
    reset(){records.splice(0);messages.clear();readThrough.clear();steps.clear();hiddenPeople.clear();blockedPeople.clear();interestedPeople.clear();activityRows.splice(0);celebrationsSeen.clear();exclusiveId=null;weeklyPicks=undefined;mediaFiles.clear();},
  },simulationOptions,persistedSimulation);
  return {
    simulation,
    watch(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async notifications(){return activityRows.filter(row=>!blockedPeople.has(row.person.id)).slice().reverse().map(row=>({...row,person:candidates().find(p=>p.id===row.person.id)||row.person}));},
    async readNotifications(ids){const selected=new Set(ids);const time=new Date().toISOString();activityRows.forEach(row=>{if(selected.has(row.id))row.readAt??=time;});notify();},
    async acknowledgeMatch(key){celebrationsSeen.add(key);notify();},
    readinessTestMode: true,
    familyTestMode: true,
    family: createDemoFamily(id => {
      const record = records.find(item => item.id === id && item.status === 'accepted' && !blockedPeople.has(item.peer));
      const peer = record && candidates().find(item => item.id === record.peer);
      return peer ? { id: peer.id, name: peer.alias } : null;
    }, () => viewer().displayName, notify),
    readiness: createDemoReadiness(id => records.some(record => record.id === id && record.status === 'accepted' && !blockedPeople.has(record.peer)), notify),
    async portraitState(photo) {
      const stored = demoPortraitFiles.get(photo.id);
      if (!stored) throw Error('الصورة غير متاحة في هذه الجلسة.');
      return { ...photo, revealPolicy: stored.policy, hasClear: Boolean(stored.clearBlob), revealed: false };
    },
    async portraitUrl(photo) {
      const stored = demoPortraitFiles.get(photo.id);
      if (!stored) throw Error("الصورة غير متاحة في هذه الجلسة.");
      return URL.createObjectURL(stored.file);
    },
    async setPortrait(file, blur, reveal) {
      validatePortraitUpload(file, blur);
      const policy = validatePortraitReveal(blur, reveal);
      const previous = viewer().portrait;
      const id = crypto.randomUUID();
      demoPortraitFiles.set(id, { file, policy, clearBlob: policy === 'never' ? undefined : reveal?.clearBlob });
      if (previous) demoPortraitFiles.delete(previous.id);
      notify();
      return { id, path: `demo-portraits/${id}.jpg`, blur, revealPolicy: policy, hasClear: policy !== 'never' };
    },
    async setPortraitPolicy(photo, policy) {
      const stored = demoPortraitFiles.get(photo.id);
      if (!stored || viewer().portrait?.id !== photo.id) throw Error('الصورة غير متاحة في هذه الجلسة.');
      if (!['never','matched','serious','family'].includes(policy)) throw Error('اختاري موعدًا صالحًا لإزالة التمويه.');
      if (policy !== 'never' && (!stored.clearBlob || !photo.blur)) throw Error('اختاري الصورة مجددًا لحفظ نسخة واضحة خاصة.');
      stored.policy = policy;
      if (policy === 'never') delete stored.clearBlob;
      notify();
      return { ...photo, revealPolicy: policy, hasClear: Boolean(stored.clearBlob), revealed: false };
    },
    async removePortrait() {
      const previous = viewer().portrait;
      if (previous) demoPortraitFiles.delete(previous.id);
      notify();
    },
    async setInterest(id, interested) { if(!examples.some(p=>p.id===id))throw Error('العضو غير متاح.');if(interested)interestedPeople.add(id);else interestedPeople.delete(id);notify(); },
    async dismissPerson(id) { hiddenPeople.add(id); notify(); },
    async reportPerson(id,reason) { if(reason.trim().length<3)throw Error('اكتب سبب البلاغ من ٣ أحرف على الأقل.');hiddenPeople.add(id);blockedPeople.add(id);for(const r of records.filter(r=>r.peer===id)){r.status='closed';r.allowRematch=false;}notify(); },
    async unreadCount() {
      return records.reduce((count, row) => count + (row.status === "accepted" ? unread(row.id) : 0), 0);
    },
    async progress(id) { return progress(id); },
    async gallery(subject) { return subject ? [] : galleryPhotos; },
    async galleryUrl(photo) { const p = galleryPhotos.find(p => p.id === photo.id); if (!p) throw Error("الصورة غير متاحة."); return URL.createObjectURL(await (await fetch(p.url)).blob()); },
    async addGallery(file) { if (galleryPhotos.length >= 3) throw Error("الحد الأقصى ثلاث صور."); galleryPhotos.push({id: crypto.randomUUID(), url: URL.createObjectURL(file)}); notify(); },
    async removeGallery(photo) { const i=galleryPhotos.findIndex(p=>p.id===photo.id); if(i>=0){URL.revokeObjectURL(galleryPhotos[i].url);galleryPhotos.splice(i,1);}notify(); },
    async rewindStep(id, stage, agree) {
      const p=progress(id); if(p.stage!==stage||stage<1)throw Error("تغيّرت المرحلة.");
      const next: StepProgress = agree && p.rewindPeer ? {stage: stage-1,mine:false,peer:false,exclusive:stage>1,rewindMine:false,rewindPeer:false} : {...p,rewindMine:agree,rewindPeer:agree ? p.rewindPeer : false};
      if(next.stage===0)exclusiveId=null;
      next.updatedAt=new Date().toISOString();steps.set(id,next);notify();return next;
    },
    async nextStep(id, stage, agree, consent = false) {
      const current = progress(id);
      if (stage === 1 && agree && !consent) throw new Error('أكّد موافقتك على الالتزام الحصري.');
      if (agree && stage <= current.stage) return current;
      if (stage !== current.stage + 1 || stage > 2) throw new Error("الخطوة غير متاحة.");
      const next = agree && current.peer ? { stage, mine: false, peer: false } : { ...current, mine: agree };
      const value = { ...next, updatedAt: new Date().toISOString(), exclusive: next.stage >= 1, consentMine: agree, consentPeer: current.peer };
      if (value.exclusive) { exclusiveId = id; records.forEach(r => { if (r.id !== id) r.status = 'closed'; }); }
      steps.set(id, value); notify(); return value;
    },
    async markRead(id, throughId) {
      if (open(id).status !== "accepted") throw new CloudError("المحادثة غير متاحة.", 403);
      const list = messages.get(id) ?? [];
      const next = list.findIndex((row) => row.id === throughId);
      const last = list.findIndex((row) => row.id === readThrough.get(id));
      if (next > last) { readThrough.set(id, throughId); notify(); }
    },
    async discover(f) {
      if (exclusiveId) return [];
      const options = candidates().filter(
        (p) =>
          !hiddenPeople.has(p.id) && matchesDiscoveryFilters(p,f) &&
          !records.some((r) => r.peer === p.id && r.status === "closed" && !r.allowRematch) &&
          (f.mode === "all" || (!records.some(r => r.peer === p.id) && weekly().includes(p.id))) &&
          (!f.work || (examples.find(x => x.id === p.id)?.surveyAnswers as Record<string, string> | undefined)?.wife_work === f.work),
      );
      const cursor = f.afterId
        ? options.findIndex((p) => p.id === f.afterId) + 1
        : 0;
      if(f.sort === "youngest") options.sort((a,b)=>a.age-b.age);
      if(f.sort === "oldest") options.sort((a,b)=>b.age-a.age);
      return options.slice(f.offset ?? cursor, (f.offset ?? cursor) + 24);
    },
    async inbox() {
      const member = { ...viewer(), id: "demo-viewer" };
      return records.flatMap((r) => {
        if (r.status === "closed") return [];
        const peer = examples.find(p => p.id === r.peer);
        if (!peer || peer.gender === member.gender) return [];
        const fit = r.status === "accepted" ? describeFit(member, peer) : comparePreferences(member, peer);
        if (!fit) return [];
        return [{ id: r.id, celebrationKey:r.celebrationKey&&!celebrationsSeen.has(r.celebrationKey)?r.celebrationKey:undefined, createdAt: r.createdAt, updatedAt: r.updatedAt, status: r.status, direction: r.direction, person: card(peer, fit),
              unreadCount: r.status === "accepted" ? unread(r.id) : 0,
              lastMessage: r.status === "accepted" ? threadRows(r.id).at(-1) : null }];
      });
    },
    async requestHistory() {
      return records.filter(r => r.status === 'closed').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 50).map(r => ({
        id: r.id, alias: examples.find(p => p.id === r.peer)?.alias ?? 'عضو',
        direction: r.direction, createdAt: r.createdAt, closedAt: r.updatedAt, outcome: 'closed' as const,
      }));
    },
    async request(memberId) {
      if (exclusiveId) throw new Error('أنت في تعارف حصري.');
      if (blockedPeople.has(memberId)) throw new Error('هذا العضو غير متاح.');
      const prior = records.find((r) => r.peer === memberId);
      if (prior?.status === "accepted") return prior.id;
      if (!candidates().some(p => p.id === memberId)) throw new Error("هذا العضو غير متاح.");
      if (prior?.status === "pending") return prior.id;
      if (records.some(r=>r.peer===memberId&&r.status==='closed'&&!r.allowRematch)) throw new Error("هذا العضو غير متاح.");
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      records.unshift({
        id, createdAt, updatedAt: createdAt,
        peer: memberId,
        direction: "outgoing",
        status: "pending",
      });
      notify();
      return id;
    },
    async demoAcceptOutgoing(id) {
      const invitation = open(id);
      if (invitation.direction !== "outgoing") throw new Error("هذا الطلب غير مرسل.");
      if (invitation.status === "accepted") return;
      if (!candidates().some(person => person.id === invitation.peer)) throw new Error("هذا العضو غير متاح.");
      if (records.filter(row => row.status === "accepted").length + (simulationOptions.externalAccepted?.()??0) >= 2) {
        throw new Error("الحد الأقصى تعارفان متزامنان.");
      }
      invitation.status = "accepted";
      invitation.celebrationKey=crypto.randomUUID();
      invitation.updatedAt = new Date().toISOString();
      notify();
    },
    async act(id, action, reason, allowRematch = false) {
      const r = open(id);
      if (action === "report" && !reason?.trim())
        throw new Error("اكتب سبب البلاغ.");
      if (action === "accept" || action === "decline") {
        if (r.direction !== "incoming" || r.status !== "pending")
          throw new Error("هذا الإجراء غير متاح.");
        if (!candidates().some(p => p.id === r.peer)) throw new Error("هذا العضو غير متاح.");
        if (action === "accept" && records.filter(entry => entry.status === "accepted").length + (simulationOptions.externalAccepted?.()??0) >= 2)
          throw new Error("الحد الأقصى تعارفان متزامنان.");
        r.status = action === "accept" ? "accepted" : "closed";
        if(action==='accept')r.celebrationKey=crypto.randomUUID();
      } else if (action === "cancel") {
        if (r.status !== "accepted" && (r.direction !== "outgoing" || r.status !== "pending"))
          throw new Error("هذا الإجراء غير متاح.");
        r.status = "closed";
        r.allowRematch = allowRematch;
      } else {
        r.status = "closed";
        blockedPeople.add(r.peer);hiddenPeople.add(r.peer);r.allowRematch=false;
        messages.delete(id);
      }
      r.updatedAt = new Date().toISOString();
      if (r.id === exclusiveId && r.status === 'closed') exclusiveId = null;
      notify();
    },
    async thread(id, beforeId) {
      const list = threadRows(id);
      const end = beforeId ? list.findIndex((m) => m.id === beforeId) : list.length;
      return end <= 0 ? [] : list.slice(Math.max(0, end - messagePageSize), end);
    },
    async messageChanges(id, messageIds) { const ids = new Set(messageIds); return threadRows(id).filter(row => ids.has(row.id)); },
    async deleteMessage(id, messageId) {
      threadRows(id);
      const message = messages.get(id)?.find(row => row.id === messageId);
      if (!message?.senderIsMe) throw Error('يمكنك حذف رسائلك فقط.');
      if (message.deletedAt) return;
      if (Date.now() - Date.parse(message.createdAt) > 48 * 60 * 60 * 1000) throw Error('يمكن الحذف لدى الجميع خلال ٤٨ ساعة من الإرسال.');
      if (message.attachment) mediaFiles.delete(message.attachment.id);
      message.deletedAt = new Date().toISOString();
      message.body = deletedMessageText; message.attachment = null; message.reply = null;
      notify();
    },
    async sendMedia(id, file, kind, clientId, duration, viewOnce = false) {
      threadRows(id);
      if (!file.size || file.size > 8 * 1024 * 1024 || (kind === 'photo' ? file.type !== 'image/jpeg' : !file.type.startsWith('audio/'))) throw Error('اختر ملفًا صالحًا بحجم لا يتجاوز ٨ ميغابايت.');
      if (viewOnce && kind !== 'photo') throw Error('العرض لمرة واحدة متاح للصور فقط.');
      const list = messages.get(id) ?? [];
      if (list.some(row => row.clientId === clientId)) return clientId;
      mediaFiles.set(clientId, file);
      list.push({ id: clientId, clientId, senderIsMe: true, body: kind === 'photo' ? (viewOnce ? 'صورة لمرة واحدة' : 'صورة') : 'رسالة صوتية', createdAt: new Date().toISOString(), attachment: { id: clientId, kind, mime: file.type, size: file.size, duration, viewOnce, openedAt: null } });
      messages.set(id, list); notify(); return clientId;
    },
    async mediaUrl(id, attachmentId) {
      const message = mediaMessage(id, attachmentId);
      if (message.attachment?.viewOnce) throw Error('افتح الصورة من زر العرض لمرة واحدة.');
      return URL.createObjectURL(mediaFiles.get(attachmentId)!);
    },
    async openMedia(id, attachmentId) {
      const message = mediaMessage(id, attachmentId);
      if (!message.attachment?.viewOnce || message.senderIsMe || message.attachment.openedAt) throw Error('الصورة لم تعد متاحة للفتح.');
      const file = mediaFiles.get(attachmentId)!;
      message.attachment.openedAt = new Date().toISOString();
      mediaFiles.delete(attachmentId); notify();
      return URL.createObjectURL(file);
    },
    async send(id, body, clientId, replyToId) {
      if (
        open(id).status !== "accepted" ||
        !body.trim() ||
        body.trim().length > 1000
      )
        throw new Error("تحقق من الرسالة وحالة الطلب.");
      const list = messages.get(id) ?? [];
      const original = replyToId ? list.find(m => m.id === replyToId) : undefined;
      if (replyToId && (!original || original.deletedAt)) throw new Error("الرسالة الأصلية غير متاحة.");
      if (!list.some((m) => m.id === clientId))
        list.push({
          id: clientId,
          clientId,
          senderIsMe: true,
          body: body.trim(),
          createdAt: new Date().toISOString(),
          ...(original ? { reply: { id: original.id, body: original.body.slice(0,240), senderIsMe: original.senderIsMe } } : {}),
        });
      messages.set(id, list);
      notify();
      return clientId;
    },
  };
}
