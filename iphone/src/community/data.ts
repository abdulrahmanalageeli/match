import {rememberSupportDirectory} from '../help/support';
import type { LunaResults } from './lunaSearchClient';
import { captureForPhoto, verifyUploadedPhoto } from '../photos/verifyPhoto';
import type { PendingChatSends } from './pendingChatSends';
import { cloud } from "../cloud";
import { canonicalCity, canonicalNationality, canonicalEducation, canonicalProfession } from '../profile/profileOptions';
import { requestAi } from '../ai/client';
import { deepCompatibilitySource } from './deepCompatibilityClient';
import { createProfileReading } from './profileReading.ts';
import { demoAssessmentSeeds, demoSurvey } from './demoAssessmentSeeds.mjs';
import type { DeepAnalysisSource } from './deepCompatibilityModel';
import { manualVerificationSource } from '../verification/client';
import type { ManualVerificationClaim, ManualVerificationSource } from '../verification/model';
import { callRpc, CloudError } from "../cloud";
import { launchEvent } from '../launchEvents';
import { privateUpdates, type WatchUpdates } from "./updates";
import type { Profile, ProfilePortrait, PortraitRevealPolicy } from "../types";
import type { MarriageBasics, PartnerCriteria } from "../compatibility/marriage";
import type { PublicAvatar } from "../compatibility/appearance";
import { personalityQuestionsFor, partnerTraitQuestions } from "../compatibility/personality";
import { describeFit, normalizeNationality, preferencePercentage, assessmentVersion, dimensionsForVersion, interests, rankPreferences, type MatchFit } from "../compatibility/model";
import { sharedBeenaStory, type SharedBeenaStory } from "../beena/model";
import { createDemoReadiness, normalizeReadinessDraft, type ReadinessRequest } from '../readiness/model';
import { boundedFamilyPayload, createDemoFamily, unwrapFamilyResult, type FamilyRequest } from '../family/model';
import { createDemoSimulation, type DemoSimulationController, type DemoSimulationOptions, type SimulationRecord } from './simulation';
import { demoMembershipTier } from './simulationRhythm.ts';

export type GalleryPhoto = { id: string; path?: string };
export type PublicPerson = {
  membershipTier?:'free'|'premium'|'seriousness';
  premium?: boolean;
  compatibilityLocked?: boolean;
  recommendationPercentage?: number | null;
  manualVerifications?: ManualVerificationClaim[];
  isDemo?: boolean;
  eligible?: boolean;
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
export type MatchingExclusion = { id: string; alias: string; reason: 'blocked' | 'no_rematch'; since?: string };
export type RequestHistoryEntry = {
  id: string; alias: string; direction: "incoming" | "outgoing";
  createdAt: string; closedAt?: string | null; outcome: "closed" | "expired";
};
export type MessageReply = { id: string; body: string; senderIsMe: boolean; deletedAt?: string | null };
export const messageReactionEmojis = ['❤️', '😂', '😮', '😢', '🙏', '👍'] as const;
export type ReactionEmoji = typeof messageReactionEmojis[number];
export type MessageReaction = { emoji: ReactionEmoji; count: number; mine: boolean };
export function withOwnReaction(reactions: readonly MessageReaction[] | undefined, emoji: ReactionEmoji | null): MessageReaction[] {
  return messageReactionEmojis.flatMap(value => {
    const existing = reactions?.find(item => item.emoji === value);
    const count = Math.max(0, (existing?.count ?? 0) - Number(existing?.mine ?? false)) + Number(value === emoji);
    return count ? [{ emoji: value, count, mine: value === emoji }] : [];
  });
}
export type Message = {
  id: string;
  senderIsMe: boolean;
  body: string;
  createdAt: string;
  clientId?: string | null;
  attachment?: ChatAttachment | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  readByPeer?: boolean;
  reply?: MessageReply | null;
  deletedAt?: string | null;
  reactions?: MessageReaction[];
};
export type ChatAttachment = { id: string; kind: "photo" | "audio"; mime: string; size: number; duration?: number; viewOnce?: boolean; openedAt?: string | null; viewedAt?: string | null };
export type ThreadReadState = { firstUnreadId: string | null; unreadCount: number };
export function searchMessageRows(rows: readonly Message[], query: string, beforeId?: string, kind?: ChatAttachment['kind']): Message[] {
  const needle = query.trim().toLocaleLowerCase('ar');
  if (needle.length > 100) throw Error('اكتب بحثًا أقصر من ١٠٠ حرف.');
  const end = beforeId ? rows.findIndex(message => message.id === beforeId) : rows.length;
  return rows.slice(0, Math.max(0, end)).filter(message => !message.deletedAt && !message.attachment?.viewOnce
    && (!kind || message.attachment?.kind === kind)
    && (needle ? message.body.toLocaleLowerCase('ar').includes(needle) : Boolean(message.attachment))).slice(-50);
}
export const deletedMessageText = 'تم حذف هذه الرسالة';
export function sanitizeMessage(message: Message): Message {
  if (message.deletedAt) return { ...message, body: deletedMessageText, attachment: null, reply: null, reactions: [] };
  return message.reply?.deletedAt ? { ...message, reply: { ...message.reply, body: deletedMessageText } } : message;
}
export type CallPermissionState = { status: "none" | "pending" | "accepted" | "declined"; direction?: "incoming" | "outgoing" };
export type SeriousnessAgreement = {status:'none'|'proposed'|'accepted'|'expired'|'family';extension?:{id:string;actor:string;days:number};actor:'reham'|'abdulrahman';mineName?:string;peerName?:string;days?:number;proposalId?:string;deadline?:string;womanSignedAt?:string;manSignedAt?:string;familyProposalId?:string;familyAgreed?:Partial<Record<'reham'|'abdulrahman',boolean>>};
export const messagePageSize = 50;
export type Filters = {
  language?: string;
  education?: string; profession?: string; minHeight?: number; maxHeight?: number; minWeight?: number; maxWeight?: number; children?: 'none' | 'has';
  excludeCities?: string[]; excludeNationalities?: string[]; excludeTribalBackgrounds?: string[]; excludeSmoking?: string[]; excludeMaritalStatuses?: string[]; nationality?: string; tribalBackground?: string; onlineOnly?: boolean;
  minAge?: number;
  maxAge?: number;
  interest?: string;
  afterId?: string; subjectId?: string;
  mode?: "recommended" | "all"; offset?: number; search?: string; city?: string; maritalStatus?: string; smoking?: string; dressStyle?: string; work?: string; minFit?: number; availableOnly?: boolean; eligibleOnly?: boolean; sort?: "compatibility" | "youngest" | "oldest";
};
export function matchesDiscoveryFilters(p: PublicPerson, f: Filters): boolean {
  const b=p.marriageBasics;
  return (!f.language || !!b?.spokenLanguages?.includes(f.language)) && (!f.city||canonicalCity(p.city)===canonicalCity(f.city))&&(!f.search||(p.alias+' '+p.occupation+' '+p.bio).toLowerCase().includes(f.search.toLowerCase()))&&
    (!f.education||!!p.education&&canonicalEducation(p.education)===canonicalEducation(f.education))&&
    (!f.profession||!!p.occupation&&canonicalProfession(p.occupation)===canonicalProfession(f.profession))&&
    (f.minHeight===undefined||b?.heightCm!==undefined&&b.heightCm>=f.minHeight)&&(f.maxHeight===undefined||b?.heightCm!==undefined&&b.heightCm<=f.maxHeight)&&
    (f.minWeight===undefined||b?.weightKg!==undefined&&b.weightKg>=f.minWeight)&&(f.maxWeight===undefined||b?.weightKg!==undefined&&b.weightKg<=f.maxWeight)&&
    (!f.children||b?.childrenCount!==undefined&&(f.children==='none'?b.childrenCount===0:b.childrenCount>0))&&
    p.age>=(f.minAge??18)&&p.age<=(f.maxAge??110)&&(!f.smoking||b?.smoking===f.smoking)&&
    (!f.maritalStatus||b?.maritalStatus===f.maritalStatus)&&(!f.dressStyle||b?.dressStyle===f.dressStyle)&&
    (!f.eligibleOnly||p.eligible!==false)&&(!f.availableOnly||!p.atCapacity)&&(!f.minFit||(preferencePercentage(p.fit)??-1)>=f.minFit)&&
    (!f.interest||p.interests.some(value=>value===f.interest||value===interests.find(item=>item.id===f.interest)?.label))&&
    (!f.onlineOnly||p.online===true)&&(!f.nationality||normalizeNationality(canonicalNationality(b?.nationality??''))===normalizeNationality(canonicalNationality(f.nationality)))&&
    (!f.tribalBackground||b?.tribalBackground===f.tribalBackground)&&
    (!f.excludeCities?.length || !!canonicalCity(p.city) && !canonicalCity(p.city).startsWith('مدينة أخرى')) &&
    (!f.excludeNationalities?.length || !!b?.nationality && b.nationality!=='prefer_not_to_say') &&
    (!f.excludeTribalBackgrounds?.length || !!b?.tribalBackground && b.tribalBackground!=='prefer_not_to_say') &&
    (!f.excludeSmoking?.length || !!b?.smoking && (!['yes','sometimes'].includes(b.smoking) || !f.excludeSmoking.some(v=>['cigarettes','vape','shisha'].includes(v)))) && (!f.excludeMaritalStatuses?.length || !!b?.maritalStatus) &&
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
export type ActivityNotification = { id: string; kind: 'profile_visit' | 'exclusive' | 'interest' | 'screenshot'; createdAt: string; readAt?: string | null; requestId?: string; person: PublicPerson };
export type JourneyTopic = 'exclusive' | 'step';
export type JourneyDecision = 'propose' | 'accept' | 'clear';
export type StepProgress = { exclusiveId?:string; stepId?:string; rewindMine?: boolean; rewindPeer?: boolean; updatedAt?: string; stage: number; mine: boolean; peer: boolean; exclusive?: boolean; consentMine?: boolean; consentPeer?: boolean };
export interface CommunitySource extends ManualVerificationSource {
  pendingSends?: PendingChatSends;
  committedSends?(requestId: string, clientIds: string[]): Promise<string[]>;
  relocationCities?(destinations?:string[]):Promise<string[]>;
  lunaSearch?(query:string, filters:Filters):Promise<LunaResults>;
  deepAnalysis?: DeepAnalysisSource;
  profileReading?: DeepAnalysisSource;
  suggestOpener?(person: PublicPerson): Promise<string>;
  simulation?: DemoSimulationController;
  demoInteractions?: CommunitySource;
  family?: FamilyRequest;
  familyTestMode?: boolean;
  familyEligibleConnection?(connectionId: string): boolean;
  readiness?: ReadinessRequest;
  readinessTestMode?: boolean;
  readinessEligibleConnection?(connectionId: string): boolean;
  noteDiscoveryBrowse?(): void;
  discover(filters: Filters | LunaResults['options']): Promise<PublicPerson[]>;
  discoverPages?(filters: Filters | LunaResults['options'], pageCount: number): Promise<PublicPerson[][]>;
  /** The live download checks its authorized variant with the callback before reading Storage. */
  portraitUrlResolvesState?: true;
  portraitUrl(photo: ProfilePortrait, authorized?: (current: ProfilePortrait) => boolean | void): Promise<string>;
  portraitState?(photo: ProfilePortrait): Promise<ProfilePortrait>;
  setPortrait(file: Blob, blur: number, reveal?: { policy: PortraitRevealPolicy; clearBlob?: Blob }): Promise<ProfilePortrait>;
  setPortraitPolicy(photo: ProfilePortrait, policy: PortraitRevealPolicy): Promise<ProfilePortrait>;
  removePortrait(): Promise<void>;
  heartbeat?(): Promise<void>;
  setInterest?(memberId: string, interested: boolean): Promise<void>;
  dismissPerson?(memberId: string): Promise<void>;
  profileVisible?(memberId: string): Promise<boolean>;
  blockPerson?(memberId: string): Promise<void>;
  reportIncident?(requestId: string, messageId: string | null, reason: string, submissionId: string, allowSafetyScreen?: boolean, contextIds?:string[]): Promise<string>;
  directoryWork?(choice?: string | null): Promise<string | null>;
  reportPerson?(memberId: string, reason: string): Promise<void>;
  gallery?(subject?: string): Promise<GalleryPhoto[]>;
  galleryUrl?(photo: GalleryPhoto): Promise<string>;
  addGallery?(file: Blob): Promise<void>;
  removeGallery?(photo: GalleryPhoto): Promise<void>;
  rewindStep?(id: string, stage: number, agree: boolean): Promise<StepProgress>;
  noteProfileOpen?(candidateId: string): Promise<void>;
  reportChatScreenshot?(requestId: string, eventId: string): Promise<void>;
  notifications?(): Promise<ActivityNotification[]>;
  readNotifications?(ids: string[]): Promise<void>;
  inbox(): Promise<Connection[]>;
  requestHistory?(beforeId?: string): Promise<RequestHistoryEntry[]>;
  matchingExclusions?(): Promise<MatchingExclusion[]>;
  request(memberId: string): Promise<string>;
  demoAcceptOutgoing?(requestId: string): Promise<void>;
  act(requestId: string, action: RequestAction, reason?: string, allowRematch?: boolean): Promise<void>;
  acknowledgeMatch?(key: string): Promise<void>;
  thread(requestId: string, beforeId?: string): Promise<Message[]>;
  messageChanges?(requestId: string, messageIds: string[]): Promise<Message[]>;
  searchMessages?(requestId: string, query: string, beforeId?: string, kind?: ChatAttachment['kind']): Promise<Message[]>;
  readState?(requestId: string): Promise<ThreadReadState>;
  setTyping?(requestId: string, active: boolean): Promise<void>;
  typingState?(requestId: string): Promise<boolean>;
  send(requestId: string, body: string, clientId: string, replyToId?: string): Promise<string>;
  deleteMessage?(requestId: string, messageId: string): Promise<void>;
  reactToMessage?(requestId: string, messageId: string, reaction: ReactionEmoji | null): Promise<MessageReaction[]>;
  sendMedia?(requestId: string, file: Blob, kind: ChatAttachment["kind"], clientId: string, duration?: number, viewOnce?: boolean): Promise<string>;
  mediaUrl?(requestId: string, attachmentId: string): Promise<string>;
  confirmMediaViewed?(requestId: string, attachmentId: string): Promise<void>;
  openMedia?(requestId: string, attachmentId: string): Promise<string>;
  callPermission?(requestId: string): Promise<CallPermissionState>;
  requestCallPermission?(requestId: string, action: "invite" | "accept" | "decline"): Promise<CallPermissionState>;
  agreement?(requestId:string):Promise<SeriousnessAgreement>;
  conversationPilotNotices?(): Promise<FeedbackNotice[]>;
  conversationPilot?(requestId: string, action?: 'read' | 'save' | 'withdraw' | 'followup' | 'week' | 'exit',
    answer?: ConversationPilotAnswer | {followupTalked: boolean} | ConnectionReview): Promise<ConversationPilotState | null>;
  agree?(requestId:string,action:'propose'|'accept'|'family'|'family_propose'|'family_accept'|'family_clear'|'extend'|'extension_accept',payload?:{days?:number;signed?:boolean;proposalId?:string;confirmed?:boolean}):Promise<SeriousnessAgreement>;
  unreadCount(): Promise<number>;
  markRead(requestId: string, throughId: string): Promise<void>;
  progress?(requestId: string): Promise<StepProgress>;
  alertProgress?(requestIds: string[]): Promise<Record<string, StepProgress>>;
  journeyChoice?(id:string,topic:JourneyTopic,action:JourneyDecision,expectedId?:string,stage?:number):Promise<StepProgress>;
  nextStep?(requestId: string, stage: number, agree: boolean, exclusiveConsent?: boolean): Promise<StepProgress>;
  watch: WatchUpdates;
}

export type ConversationPilotAnswer = { talked: false } | { talked: true; enjoyed: boolean; continue: boolean };
export type FeedbackNotice = {requestId: string; stage: 'day2' | 'week'; at: string};
export type ConversationPilotState = {
  stage?: 'week' | 'exit';
  review?: ConnectionReview | null;
  answer: ConversationPilotAnswer | null;
  mutualContinue: boolean;
  initialOpen: boolean;
  followupOpen: boolean;
  followupTalked: boolean | null;
};
export type ConnectionReview = {
  instrument?: 'week-v2';
  contact: 'none' | 'once' | 'repeated';
  personalFit?: 'well' | 'partly' | 'poorly' | 'too_early';
  practicalFit?: 'aligned' | 'partial' | 'different' | 'not_discussed' | 'unclear';
  mainFactor?: string;
  enjoyed?: 'yes' | 'no' | 'unsure';
  continue?: 'yes' | 'no' | 'unsure';
  marriagePotential?: 'yes' | 'no' | 'too_early';
  familyContact?: 'yes' | 'no' | 'unknown';
  reason?: string;
  topic?: string;
};

export function cloudCommunity(userId: string, pendingSends?: PendingChatSends): CommunitySource {
  let inboxForTurn: Promise<Connection[]> | undefined;
  const media = () => import('./memberChatMedia').then(module => module.memberChatMediaSource(userId));
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
    pendingSends,
    committedSends: (request_id, client_ids) => timedRpc('marriage_committed_chat_sends', {request_id, client_ids}),
    async confirmMediaViewed(request_id, media_id) {
      await timedRpc('marriage_chat_media', { action: 'viewed', request_id, media_id });
    },
    relocationCities:destinations=>timedRpc('marriage_relocation_cities',{destinations:destinations??null}),
    async lunaSearch(query,filters) {
      const { searchWithLuna } = await import('./lunaSearchClient');
      const result = await searchWithLuna(userId, query, filters);
      launchEvent('activity', 'luna', userId);
      return result;
    },
    deepAnalysis: deepCompatibilitySource(userId),
    sendMedia: async (...args) => (await media()).sendMedia!(...args),
    mediaUrl: async (...args) => (await media()).mediaUrl!(...args),
    openMedia: async (...args) => (await media()).openMedia!(...args),
    agreement: request_id => timedRpc('marriage_agreement',{request_id}),
    conversationPilotNotices: () => timedRpc('marriage_conversation_pilot_notices',{}),
    conversationPilot: (request_key, action = 'read', answer) => timedRpc('marriage_conversation_pilot_response', {request_key, action, answer: answer ?? null}),
    agree: (request_id,action,payload={}) => timedRpc('marriage_agreement',{request_id,action,payload}),
    ...manualVerificationSource(),
    suggestOpener: () => requestAi({mode:'opener'}),
    family: async (action, payload = {}) => unwrapFamilyResult(await timedRpc('marriage_family', { action, payload: boundedFamilyPayload(action, payload) })),
    readiness: (action, payload = {}) => timedRpc('marriage_passport', { action, payload: action === 'save' ? normalizeReadinessDraft(payload) : payload }),
    portraitUrlResolvesState: true,
    async portraitState(photo) {
      const current = await timedRpc<ProfilePortrait | null>("marriage_portrait_view", { photo_id: photo.id });
      if (!current || current.id !== photo.id) throw Error("الصورة غير متاحة.");
      return current;
    },
    async portraitUrl(photo, authorized) {
      if (!cloud) throw Error("الصورة غير متاحة.");
      const current = await timedRpc<ProfilePortrait | null>("marriage_portrait_view", { photo_id: photo.id });
      if (!current || current.id !== photo.id) throw Error("الصورة غير متاحة.");
      if (authorized?.(current) === false) throw Error("الصورة غير متاحة.");
      const { data, error } = await cloud.storage.from("nisfayn-profile-portraits").download(current.path);
      if (error) throw Error("تعذّر تحميل الصورة.");
      return URL.createObjectURL(data);
    },
    async setPortrait(file, blur, reveal) {
      if (!cloud) throw Error("الخدمة غير متاحة.");
      validatePortraitUpload(file, blur);
      const policy = validatePortraitReveal(blur, reveal);
      const selfie = await captureForPhoto();
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
        await verifyUploadedPhoto(photo.id, "portrait", selfie);
        return await timedRpc<ProfilePortrait>("marriage_portrait_commit", { photo_id: photo.id });
      } catch (cause) {
        // A lost response can follow a successful commit. Never delete a possibly published photo.
        const current = await timedRpc<ProfilePortrait | null>("marriage_portrait_info", { subject: null }).catch(() => null);
        if (current?.id === photo.id) return current;
        await timedRpc("marriage_photo_discard", { photo: photo.id, photo_kind: "portrait" }).catch(() => null);
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
    profileVisible: subject => timedRpc("marriage_profile_visible", {subject}),
    blockPerson: memberId => timedRpc("marriage_discovery_action", {member_id:memberId,action:'block'}),
    reportIncident: (requestId,messageId,reason,submissionId,allowSafetyScreen=false,contextIds=[]) => {
      const input={request_id:requestId,message_id:messageId,reason,submission_id:submissionId};
      if (allowSafetyScreen && messageId) return timedRpc('wudayn_report_review_message',{...input,context_ids:contextIds});
      return contextIds.length ? timedRpc('marriage_report_incident_context',{...input,context_ids:contextIds,allow_screen:false}) :
        timedRpc('marriage_report_incident', input);
    },
    directoryWork: choice => timedRpc("marriage_directory_work", {choice:choice ?? null,writing:choice !== undefined}),
    reportPerson: (memberId, reason) => timedRpc("marriage_discovery_action", {member_id:memberId,action:'report',reason}),
    gallery: subject => timedRpc("marriage_gallery", { action: "list", subject: subject ?? null }),
    async galleryUrl(photo) {
      if (!cloud || !photo.path) throw Error("الصورة غير متاحة.");
      const { data, error } = await cloud.storage.from("nisfayn-profile-gallery").download(photo.path);
      if (error) throw Error("تعذّر تحميل الصورة."); return URL.createObjectURL(data);
    },
    async addGallery(file) {
      if (!cloud) throw Error("الخدمة غير متاحة.");
      const selfie = await captureForPhoto();
      const p = await timedRpc<GalleryPhoto>("marriage_gallery", { action: "prepare" });
      const { error } = await cloud.storage.from("nisfayn-profile-gallery").upload(p.path!, file, { contentType: "image/jpeg", upsert: false });
      if (error) { await timedRpc("marriage_gallery", { action: "remove", photo_id: p.id }); throw Error("تعذّر رفع الصورة."); }
      try {
        await verifyUploadedPhoto(p.id, "gallery", selfie);
        await timedRpc("marriage_gallery", { action: "commit", photo_id: p.id });
      } catch (cause) {
        await timedRpc("marriage_photo_discard", { photo: p.id, photo_kind: "gallery" }).catch(() => null);
        throw cause;
      }
    },
    async removeGallery(photo) {
      const p = await timedRpc<GalleryPhoto>("marriage_gallery", { action: "remove", photo_id: photo.id });
      if (cloud && p.path) await cloud.storage.from("nisfayn-profile-gallery").remove([p.path]);
    },
    rewindStep: (id, stage, agree) => timedRpc("marriage_rewind_step", { request_id: id, expected_stage: stage, agree }),
    async noteProfileOpen(candidateId) {
      await timedRpc("marriage_note_profile_open", { candidate_id: candidateId });
      launchEvent('activity', 'profile', userId);
    },
    noteDiscoveryBrowse: () => launchEvent('activity', 'discovery', userId),
    async discover(f) {
      const options={ ...f, mode: f.mode ?? 'recommended', includeIneligible: f.mode === 'all' && !f.eligibleOnly };
      const cards = await timedRpc<PublicPerson[]>('marriage_browse', { options });
      rememberSupportDirectory(userId,options);
      return cards;
    },
    inbox() {
      // Mounted widgets and realtime listeners read the same authorized inbox
      // in one turn. A later read always gets a fresh server snapshot.
      if (!inboxForTurn) {
        inboxForTurn = timedRpc<Connection[]>("marriage_inbox", {});
        queueMicrotask(() => { inboxForTurn = undefined; });
      }
      return inboxForTurn;
    },
    requestHistory: beforeId => beforeId ? timedRpc("marriage_request_history_page", {before_id:beforeId}) : timedRpc("marriage_request_history", {}),
    matchingExclusions: () => timedRpc("marriage_matching_exclusions", {}),
    reportChatScreenshot: (requestId, eventId) => timedRpc('marriage_chat_screenshot', { request_id: requestId, event_id: eventId }),
    notifications: () => timedRpc('marriage_notifications', {}),
    readNotifications: ids => timedRpc('marriage_notifications_read', { notification_ids: ids }),
    unreadCount: () => timedRpc("marriage_unread_count", {}),
    progress: (id) => timedRpc("marriage_progress", { request_id: id }),
    alertProgress: requestIds => timedRpc("marriage_alert_progress", { request_ids: requestIds }),
    journeyChoice: (id,topic,action,expectedId,stage) => timedRpc("marriage_journey_choice",{request_id:id,topic,action,expected_id:expectedId??null,stage_number:stage??null}),
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
    async thread(requestId, beforeId) {
      const rows = await timedRpc<Message[]>("marriage_thread_page", { request_id: requestId, before_id: beforeId ?? null });
      const received = rows.filter(row => !row.senderIsMe && !row.deletedAt && !row.deliveredAt).map(row => row.id);
      if (received.length) void timedRpc("marriage_confirm_thread_delivery", { request_id: requestId, message_ids: received }).catch(() => {});
      return rows;
    },
    messageChanges: (requestId, messageIds) => timedRpc("marriage_message_changes", { request_id: requestId, message_ids: messageIds }),
    searchMessages: (requestId, query, beforeId, kind) => timedRpc('marriage_search_messages', { request_id: requestId, search_query: query, before_id: beforeId ?? null, media_kind: kind ?? null }),
    readState: requestId => timedRpc('marriage_thread_read_state', { request_id: requestId }),
    async setTyping(requestId, active) { await timedRpc('marriage_set_typing', { request_id: requestId, active }); },
    typingState: requestId => timedRpc('marriage_typing_state', { request_id: requestId }),
    async deleteMessage(requestId, messageId) { await timedRpc('marriage_delete_message', { request_id: requestId, message_id: messageId }); },
    reactToMessage: (requestId, messageId, reaction) => timedRpc('marriage_react_to_message', { request_id: requestId, message_id: messageId, reaction }),
    send: (requestId, body, clientId, replyToId) =>
      timedRpc(
        replyToId ? "marriage_reply" : "marriage_message",
        { request_id: requestId, message_body: body, client_id: clientId, ...(replyToId ? { reply_to_id: replyToId } : {}) },
      ),
  };
}

const sampleLifeAnswers: Record<string, string> = {
  ...Object.fromEntries(dimensionsForVersion("marriage-v3").flatMap(d => [[d.id, d.options[0].code], [d.partnerId, d.options[0].code]])),
  children_plan: "A", partner_children_plan: "A", financial_provision: "B", partner_financial_provision: "B",
  repair_after_conflict: "B", partner_repair_after_conflict: "B", housing_arrangement: "A", partner_housing_arrangement: "A",
  closeness_pace: "B", partner_closeness_pace: "B", marriage_timeline: "B", partner_marriage_timeline: "B",
};
export const demoProfile: Profile = {
  displayName: "نورة",
  age: 28,
  city: "الرياض",
  gender: "woman",
  profession: "مصممة",
  bio: "",
  lookingFor: "أبحث عن شريك واضح في نيته، لطيف في اختلافه، ويؤمن بأن الزواج شراكة في التفاصيل والمسؤوليات.",
  valuesStatement: "الاحترام وقت الاختلاف، الصدق، وحفظ مساحة لكل منا دون أن نبتعد عن بعضنا.",
  lifeTogether: "بيت هادئ تملؤه الأحاديث، ومساحة لطموح كل منا، ووقت ثابت للأهل ولأنفسنا.",
  education: "بكالوريوس تصميم",
  marriageIntent: "تعارف جاد يهدف إلى الزواج",
  assessmentVersion: "marriage-v3",
  personalityVersion: "personality-v1" as const,
  beena: structuredClone(demoAssessmentSeeds.find(person => person.id === 'wp01')!.seed.beena),
  personalityAnswers: Object.fromEntries(personalityQuestionsFor("personality-v1").map((q, index) => [q.id, "BCDDE"[index % 5]])),
  marriageBasics: { polygynyPreference:"not_open", heightCm: 165, weightKg: 59, nationality: "سعودية", tribalBackground: "prefer_not_to_say", maritalStatus: "never_married", childrenCount: 0, smoking: "never", skinTone: "tone_3", dressStyle: "hijab", dressFlexibility: "keep" },
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
const demoPhotoIds = new Set(['p01', 'p02', 'p04', 'p06', 'p08', 'p11', 'p14', 'wp01', 'wp02', 'wp06', 'wp12']);
export const demoPeople = demoAssessmentSeeds.map(({ id, seed, index, genderIndex }) => {
  const woman = genderIndex === 1;
  const photo = demoPhotoIds.has(id) ? `/demo/portraits/${id}-everyday.webp` : undefined;
  const tone = (['tone_4','tone_5','tone_2','tone_8','tone_1','tone_6'] as const)[(index + (woman ? 0 : 1)) % 6];
  const dress = (['hijab','niqab','uncovered','hijab','hijab','uncovered','hijab','niqab','hijab','uncovered','niqab','hijab','hijab','uncovered','hijab'] as const)[index];
  const noChildren = seed.children === 'B';
  const partnerCriteria: PartnerCriteria = {
    sharedLanguage: {mode: 'prefer'},
    education: {mode: 'any'},
    profession: {mode: 'any'},
    height: {mode: 'any'},
    weight: {mode: 'any'},
    tribalBackground: {mode: 'any'},
    nationality: {mode: 'any'},
    maritalStatus: {mode: 'any'},
    children: noChildren ? {mode: 'require', target: 'none'} : {mode: 'any'},
    smoking: seed.smoking ? {mode: 'any'} : {mode: 'prefer', target: 'never'},
    skinTone: {mode: 'any'},
    ...(!woman && {dressStyle: {mode: 'any'}, dressFlexibility: {mode: 'any'}}),
  };
  const surveyAnswers = demoSurvey(seed, index, assessmentVersion);
  const originCities = woman
    ? ['الطائف','الرياض','جدة','القصيم','الرياض','المدينة المنورة','جدة','الخبر','أبها','الدمام','بريدة','جدة','حائل','الخرج','الطائف']
    : ['الرياض','الأحساء','جدة','الطائف','الرياض','المدينة المنورة','جدة','الخبر','أبها','الدمام','بريدة','مكة المكرمة','حائل','الرياض','الطائف'];
  const tribeName = (woman ? ['عتيبة', 'بني تميم'] : ['عنزة', 'بني تميم'])[index % 2];
  const tribal = index % 3 !== 2;
  const expensePlans = {A:'husband_essentials',B:'equal',C:'proportional',D:'discuss'} as const;
  const housingPlans = {A:'independent',B:'discuss',C:'with_family',D:'discuss'} as const;
  const marriageBasics: MarriageBasics = {
    heightCm: woman ? [165,169,162,167,164,166,160,171,158,163,155,168,161,172,159][index] : [179,183,174,181,176,178,172,180,185,175,170,177,182,168,175][index],
    weightKg: woman ? [59,64,55,62,58,60,54,67,52,65,68,71,63,75,74][index] : [78,85,72,82,76,80,69,87,84,75,83,71,98,69,92][index],
    nationality: seed.nationality ?? (woman ? 'سعودية' : 'سعودي'),
    originCity: originCities[index],
    spokenLanguages: index % 4 === 3 ? ['العربية'] : ['العربية','الإنجليزية'],
    preferredLanguage: 'العربية',
    languageOpenness: (['flexible','shared_required','open_to_learning'] as const)[index % 3],
    maritalStatus: seed.status ?? 'never_married',
    childrenCount: seed.childrenCount ?? 0,
    polygynyPreference: index % 5 === 3 ? 'open_to_discussion' : 'not_open',
    smoking: seed.smoking ?? 'never',
    tribalBackground: tribal ? 'tribal' : 'non_tribal',
    ...(tribal && {tribeName}),
    religiousAffiliation: index === 7 ? 'shia' : 'sunni',
    prayerPractice: index % 4 === 2 ? 'working_on_consistency' : 'regular',
    marriageTimeline: seed.timeline,
    meetingPreference: seed.meeting,
    skinTone: tone,
    weddingStyle: (['simple','moderate','discuss','larger'] as const)[index % 4],
    housingPlan: housingPlans[surveyAnswers.housing_arrangement as keyof typeof housingPlans],
    expenseSharing: expensePlans[surveyAnswers.financial_provision as keyof typeof expensePlans],
    ...(surveyAnswers.children_plan === 'A' && {
      childrenTiming: (['after_one_two_years','first_year','discuss','after_two_years'] as const)[index % 4],
    }),
    ...(woman && {
      mahrRange: (['from_30000','from_50000','under_30000','from_70000','from_100000'] as const)[index % 5],
      dressStyle: dress,
      dressFlexibility: index % 2 ? 'open_to_discussion' : 'keep',
    }),
  };
  return {
    id, isDemo:true as const,
    membershipTier: seed.membershipTier,
    alias:seed.alias,age:seed.age,city:seed.city,occupation:seed.occupation,profession:seed.occupation,bio:seed.bio,
    gender:woman?'woman' as const:'man' as const,education:seed.education,
    lookingFor:seed.lookingFor,valuesStatement:seed.values,lifeTogether:seed.home,interestIds:seed.interests,
    marriageIntent:seed.timeline==='when_ready'?'تعارف جاد على مهل':'تعارف جاد يهدف إلى الزواج',
    familyPreference:seed.meeting==='family_before_formal'||seed.meeting==='after_formal'?'من البداية':'بعد التعارف الأول',
    assessmentVersion:'marriage-v3' as const,personalityVersion: "personality-v1" as const,
    personalityAnswers:Object.fromEntries(personalityQuestionsFor("personality-v1").map((q,qi)=>[q.id,'ABCDE'[seed.traits[qi]-1]])),
    relocationCities:seed.relocate?['الرياض','جدة']:[],
    surveyAnswers:demoSurvey(seed,index,'marriage-v3'),beena:seed.beena,
    currentAssessment: {
      assessmentVersion, personalityVersion:'personality-v2' as const,
      surveyAnswers,
      personalityAnswers: Object.fromEntries([
        ...personalityQuestionsFor('personality-v2').map((question, i) => [question.id, seed.currentTraits[i]]),
        ...partnerTraitQuestions.map((question, i) => [question.id, seed.partnerTraits[i]]),
      ]),
    },
    preferredMinAge:Math.max(22,seed.age-7),preferredMaxAge:Math.min(48,seed.age+9),
    partnerCriteria,
    marriageBasics,
    publicAvatar:woman&&!photo?{style:dress,skinTone:tone} as PublicAvatar:null,
    demoPhoto:photo,
  };
});
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
  function demoAssessmentFor(person: (typeof examples)[number], member: Profile) {
    const peer = member.assessmentVersion === assessmentVersion ? { ...person, ...person.currentAssessment } : person;
    if (!simulationOptions.useAvailableTesterBasics) return peer;
    // An optional fixture preference must not force a tester to supply an omitted personal detail.
    const partnerCriteria = { ...peer.partnerCriteria };
    if (!member.marriageBasics?.spokenLanguages?.length && partnerCriteria.sharedLanguage?.mode === 'prefer') delete partnerCriteria.sharedLanguage;
    if (!member.marriageBasics?.smoking && partnerCriteria.smoking?.mode === 'prefer') delete partnerCriteria.smoking;
    return { ...peer, partnerCriteria };
  }
  const listeners = new Set<() => void>();
  let relocationCities:string[]=[];
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
          body: peerPrefix ? "هلا، أنا دايم أحتار بين مكتبة ومعرض إذا فضيت. وش تختار لو عندك ساعتين؟" : "هلا، أنا أحب المتاحف إذا سافرت. فيه مكان زرته وتحسين يستاهل الزيارة؟",
          createdAt: new Date().toISOString(),
        },
      ],
    ],
  ]);
  const mediaFiles = new Map<string, Blob>();
  if (!seedConnections) records.splice(0);
  const hiddenPeople = new Set<string>(), interestedPeople = new Set<string>(), blockedPeople = new Set<string>();
  const onlinePeople = new Set<string>();
  const typingPeople = new Set<string>();
  const activityRows: ActivityNotification[] = [];
  const celebrationsSeen = new Set<string>();
  const readThrough = new Map<string, string>();
  const steps = new Map<string, StepProgress>();
  const agreements = new Map<string, SeriousnessAgreement>();
  const callPermissions = new Map<string, CallPermissionState>();
  let weeklyPicks: string[] | undefined;
  let exclusiveId: string | null = null;
  const galleryPhotos: (GalleryPhoto & { url: string })[] = [];
  const storageKey = simulationOptions.storageKey ? `${simulationOptions.storageKey}:${viewer().gender}` : undefined;
  let persistedSimulation: import('./simulation').DemoSimulationHistory | undefined;
  function persist() {
    if (!storageKey || !simulation) return;
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(storageKey, JSON.stringify({version:1, records:records.slice(0,40),
        messages:[...messages].map(([id,rows])=>{const text=rows.filter(row=>!row.attachment);return [id,text.length>100?[...text.slice(0,4),...text.slice(-96)]:text];}),
        hidden:[...hiddenPeople],blocked:[...blockedPeople],interested:[...interestedPeople],read:[...readThrough],steps:[...steps],agreements:[...agreements],callPermissions:[...callPermissions],
        exclusiveId,activity:activityRows.slice(-40),seen:[...celebrationsSeen],simulation:simulation.snapshot()}));
    } catch { /* Quota/private browsing must not break the test app. */ }
  }
  if (storageKey) {
    try {
      // Safari can throw on the storage getter itself, before getItem is called.
      const saved = typeof localStorage === 'undefined' ? null : JSON.parse(localStorage.getItem(storageKey) || 'null');
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
        for (const entry of Array.isArray(saved.agreements)?saved.agreements:[]) if(Array.isArray(entry)&&records.some(r=>r.id===entry[0])&&entry[1]&&['none','proposed','accepted','expired','family'].includes(entry[1].status))agreements.set(entry[0],entry[1]);
        for (const entry of Array.isArray(saved.callPermissions)?saved.callPermissions:[]) if(Array.isArray(entry)&&records.some(r=>r.id===entry[0])&&entry[1]&&['none','pending','accepted','declined'].includes(entry[1].status))callPermissions.set(entry[0],entry[1]);
        exclusiveId=records.some(r=>r.id===saved.exclusiveId&&r.status==='accepted')?saved.exclusiveId:null;
        activityRows.push(...(Array.isArray(saved.activity)?saved.activity:[]).filter((n:ActivityNotification)=>n&&typeof n.id==='string'&&validPerson(n.person?.id)&&['profile_visit','interest'].includes(n.kind)).slice(-40));
        for(const id of Array.isArray(saved.seen)?saved.seen:[])if(typeof id==='string')celebrationsSeen.add(id);
        const sim = saved.simulation;
        if (sim && Number.isFinite(sim.eventCount) && Array.isArray(sim.log)) {
          const plan = sim.plannedActivity;
          const connectionPlan = plan && ['reply','match'].includes(plan.kind) && records.some(row=>row.id===plan.connectionId && row.peer===plan.personId);
          const draft = sim.preparedReply;
          persistedSimulation = {
            eventCount:sim.eventCount,
            log:sim.log.filter((event:import('./simulation').DemoSimulationEvent)=>event&&typeof event.id==='string'&&typeof event.detail==='string'&&Number.isFinite(Date.parse(event.at))&&typeof event.kind==='string').slice(-30),
            plannedActivity:plan && validPerson(plan.personId) && typeof plan.id === 'string' && Number.isFinite(plan.dueAt) && (connectionPlan || ['profile_visit','interest','request'].includes(plan.kind)) ? plan : undefined,
            preparedReply:connectionPlan && plan.kind==='reply' && draft?.planId===plan.id && typeof draft.turn==='string' && typeof draft.body==='string' && draft.body.length>0 && draft.body.length<=1000 && ['reply','ai_reply','reply_fallback'].includes(draft.kind) ? draft : undefined,
            socialHistory:Array.isArray(sim.socialHistory) ? sim.socialHistory.filter((r:{personId:string;stage:number;at:number})=>r && validPerson(r.personId) && [1,2,3].includes(r.stage) && Number.isFinite(r.at)).slice(0,examples.length) : [],
          };
        }
      }
    } catch { /* Ignore an older/corrupt local fixture. */ }
  }
  function unread(id: string) {
    const list = messages.get(id) ?? [];
    const last = list.findIndex((row) => row.id === readThrough.get(id));
    return list.slice(last + 1).filter((row) => !row.senderIsMe && !row.deletedAt).length;
  }
  function candidates() {
    const member = { ...viewer(), relocationCities, id: "demo-viewer" };
    const people = examples.map(person => demoAssessmentFor(person, member));
    return rankPreferences(member, people).map(({ person, ...fit }) => ({ ...card(person, fit), eligible: true }));
  }
  function card(person: ReturnType<typeof demoAssessmentFor>, { reasons, fit }: ReturnType<typeof describeFit>): PublicPerson {
    // This function only receives the built-in fictional roster. Its profile
    // details are authored for display. Real members use the separate server projection.
    const membershipTier = demoMembershipTier(person.id, person.membershipTier, Date.now());
    return {
      id: person.id, isDemo:true, online:onlinePeople.has(person.id), interested:interestedPeople.has(person.id),
      premium:membershipTier!=='free',membershipTier,
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
      marriageBasics: { ...person.marriageBasics },
      publicAvatar: person.publicAvatar,
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
  function agreement(id: string): SeriousnessAgreement {
    const record = open(id);
    if (record.status !== 'accepted') throw Error('التعارف غير متاح.');
    const value: SeriousnessAgreement = { status: simulationOptions.interactiveJourney && !(messages.get(id)?.length) ? 'none' : 'accepted', actor: viewer().gender === 'man' ? 'abdulrahman' : 'reham', ...agreements.get(id),
      mineName: viewer().displayName, peerName: examples.find(person => person.id === record.peer)?.alias };
    if (value.status === 'accepted' && value.deadline && Date.parse(value.deadline) <= Date.now()) value.status = 'expired';
    return value;
  }
  function chatReady(id: string) { return !simulationOptions.interactiveJourney || ['accepted','family'].includes(agreement(id).status); }
  function requireChat(id: string) { threadRows(id); if (!chatReady(id)) throw Error('تبدأ المراسلة بعد موافقتكما على شروط التعارف ومدته.'); }
  function advanceRelationship(record: Local): string | undefined {
    if (!simulationOptions.interactiveJourney) return;
    const person = examples.find(person => person.id === record.peer);
    if (!person) return;
    const value = agreement(record.id), now = new Date().toISOString();
    if (value.status === 'none' && viewer().gender === 'man') {
      agreements.set(record.id, { ...value, status:'proposed', days:person.age < 28 ? 14 : 7, proposalId:crypto.randomUUID(), womanSignedAt:now });
      return `${person.alias}: أرسلت اقتراح مدة التعارف`;
    }
    if (value.status === 'proposed' && viewer().gender === 'woman') {
      agreements.set(record.id, { ...value, status:'accepted', manSignedAt:now, deadline:new Date(Date.now() + value.days! * 86400000).toISOString() });
      return `${person.alias}: وافق على شروط التعارف ومدته`;
    }
    const actor=value.actor, peer=actor==='abdulrahman'?'reham':'abdulrahman';
    if (value.extension?.actor === actor && value.deadline) {
      agreements.set(record.id,{...value,status:'accepted',extension:undefined,deadline:new Date(Math.max(Date.now(),Date.parse(value.deadline))+value.extension.days*86400000).toISOString()});
      return `${person.alias}: وافق على تمديد مدة التعارف`;
    }
    if (value.familyAgreed?.[actor] && !value.familyAgreed[peer]) {
      agreements.set(record.id,{...value,status:'family',familyAgreed:{...value.familyAgreed,[peer]:true}});
      return `${person.alias}: وافق على الخطوة العائلية`;
    }
    const journey=steps.get(record.id);
    if (journey?.rewindMine) {
      const stage=Math.max(0,journey.stage-1);
      steps.set(record.id,{...journey,stage,mine:false,peer:false,stepId:undefined,rewindMine:false,rewindPeer:false,updatedAt:now});
      return `${person.alias}: وافق على العودة خطوة`;
    }
    if(journey?.exclusiveId && journey.consentMine && !journey.exclusive){
      steps.set(record.id,{...journey,exclusive:true,consentPeer:true,updatedAt:now});
      exclusiveId=record.id;records.filter(r=>r.id!==record.id).forEach(r=>{r.status='closed';});
      return `${person.alias}: وافق على الحصرية`;
    }
    if(journey?.stepId && journey.mine && journey.stage<2){
      const stage=journey.stage+1;
      steps.set(record.id,{...journey,stage,mine:false,peer:false,stepId:stage===2?journey.stepId:undefined,updatedAt:now});
      return `${person.alias}: وافق على المرحلة التالية`;
    }
    if (journey?.mine && journey.stage<2) {
      const stage=journey.stage+1;
      steps.set(record.id,{stage,mine:false,peer:false,exclusive:true,consentMine:true,consentPeer:true,updatedAt:now});
      exclusiveId=record.id;
      // The simulation owns these records only; the real paired tester is never touched.
      records.filter(row=>row.id!==record.id&&row.status!=='closed').forEach(row=>{row.status='closed';row.updatedAt=now;});
      return `${person.alias}: وافق على المرحلة التالية`;
    }
    const permission=callPermissions.get(record.id);
    if(permission?.status==='pending'&&permission.direction==='outgoing') {
      callPermissions.set(record.id,{status:'accepted'});
      return `${person.alias}: وافق على إذن المكالمات`;
    }
    const transcript=messages.get(record.id)??[];
    if(!permission&&chatReady(record.id)&&transcript.filter(row=>!row.deletedAt&&row.senderIsMe).length>=3&&transcript.filter(row=>!row.deletedAt&&!row.senderIsMe).length>=3) {
      callPermissions.set(record.id,{status:'pending',direction:'incoming'});
      return `${person.alias}: اقترح تفعيل المكالمات`;
    }
  }
  simulation = createDemoSimulation({
    people:()=>candidates(),records,messages,online:onlinePeople,typing:typingPeople,chatReady,
    conversationAllowed:id=>!exclusiveId||exclusiveId===id,advanceRelationship,
    available:id=>!hiddenPeople.has(id)&&!blockedPeople.has(id)&&!records.some(r=>r.peer===id&&r.status==='closed'&&!r.allowRematch),
    exclusive:()=>Boolean(exclusiveId),
    canRequestAt:(id,at)=>{
      const peer=examples.find(person=>person.id===id);
      return Boolean(peer && demoMembershipTier(id,peer.membershipTier,at)!=='free');
    },
    activityEligible:(kind,personId)=>!activityRows.some(row=>row.person.id===personId&&row.kind===kind&&!row.readAt),
    activity(kind,personId,event){
      const person=candidates().find(p=>p.id===personId);if(!person)return;
      // One unread event per person/kind is enough to exercise the UI without flooding it.
      if(activityRows.some(row=>row.person.id===personId&&row.kind===kind&&!row.readAt))return;
      activityRows.push({id:event?.id ?? crypto.randomUUID(),kind,createdAt:new Date(event?.dueAt ?? Date.now()).toISOString(),person});
      if(activityRows.length>40)activityRows.splice(0,activityRows.length-40);
    },
    changed:notify,
    reset(){records.splice(0);messages.clear();readThrough.clear();steps.clear();agreements.clear();callPermissions.clear();typingPeople.clear();hiddenPeople.clear();blockedPeople.clear();interestedPeople.clear();activityRows.splice(0);celebrationsSeen.clear();exclusiveId=null;weeklyPicks=undefined;mediaFiles.clear();},
  },simulationOptions,persistedSimulation);
  const profileReading = createProfileReading(id => {
    const member = viewer();
    const peer = examples.find(person => person.id === id && person.gender !== member.gender);
    if (!peer || hiddenPeople.has(id) || blockedPeople.has(id)) throw Error('الملف غير متاح.');
    const person = demoAssessmentFor(peer, member);
    return { member, person, fit: describeFit({...member,id:'demo-viewer'},person).fit };
  }, notify, simulationOptions.generateReading, () => simulationOptions.membershipTier?.()==='seriousness');
  return {
    simulation, profileReading,
    watch(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async notifications(){return activityRows.filter(row=>!blockedPeople.has(row.person.id)).slice().reverse().map(row=>({...row,person:candidates().find(p=>p.id===row.person.id)||row.person}));},
    async readNotifications(ids){const selected=new Set(ids);const time=new Date().toISOString();activityRows.forEach(row=>{if(selected.has(row.id))row.readAt??=time;});notify();},
    async acknowledgeMatch(key){celebrationsSeen.add(key);notify();},
    async relocationCities(next){if(next){relocationCities=[...next];notify();}return [...relocationCities];},
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
    async agreement(id) { return agreement(id); },
    async agree(id, action, payload={}) {
      const value=agreement(id),now=new Date().toISOString();
      if(action==='propose') {
        if(value.actor!=='reham'||!payload.signed||![7,14,30].includes(payload.days??0)||['accepted','family'].includes(value.status))throw Error('راجعي شروط التعارف واختاري المدة.');
        agreements.set(id,{...value,status:'proposed',days:payload.days,proposalId:crypto.randomUUID(),womanSignedAt:now});
      } else if(action==='accept') {
        if(value.actor!=='abdulrahman'||value.status!=='proposed'||!payload.signed||payload.proposalId!==value.proposalId)throw Error('راجع شروط التعارف والمدة المقترحة.');
        agreements.set(id,{...value,status:'accepted',manSignedAt:now,deadline:new Date(Date.now()+value.days!*86400000).toISOString()});
      } else if(action==='extend') {
        if(![7,14].includes(payload.days??0)||!['accepted','expired'].includes(value.status))throw Error('اختر مدة صالحة.');
        agreements.set(id,{...value,extension:{id:crypto.randomUUID(),actor:value.actor,days:payload.days!}});
      } else if(action==='extension_accept') {
        if(!value.extension||value.extension.actor===value.actor||payload.proposalId!==value.extension.id)throw Error('راجع الاقتراح الحالي.');
        agreements.set(id,{...value,status:'accepted',extension:undefined,deadline:new Date(Math.max(Date.now(),Date.parse(value.deadline!))+value.extension.days*86400000).toISOString()});
      } else if(action==='family_clear') {
        if(!value.familyProposalId || payload.proposalId!==value.familyProposalId)throw Error('تغيّر طلب التواصل العائلي.');
        agreements.set(id,{...value,status:'accepted',familyAgreed:{},familyProposalId:undefined});
      } else {
        if(action==='family_accept' && (!value.familyProposalId || value.familyProposalId!==payload.proposalId))throw Error('تغيّر طلب التواصل العائلي.');
        if(action==='family_propose' && value.familyProposalId)throw Error('راجع طلب التواصل العائلي الحالي.');
        if(!payload.confirmed||!['accepted','expired','family'].includes(value.status))throw Error('أكّد رغبتك بالخطوة العائلية.');
        agreements.set(id,{...value,status:action==='family_accept'?'family':value.status,familyProposalId:value.familyProposalId??crypto.randomUUID(),familyAgreed:{...value.familyAgreed,[value.actor]:true}});
      }
      notify();simulation.wake();return agreement(id);
    },
    async callPermission(id) { open(id);return callPermissions.get(id)??{status:'none'}; },
    async requestCallPermission(id,action) {
      requireChat(id);const current=callPermissions.get(id)??{status:'none'};
      if(action==='invite') { if(current.status==='accepted')return current;callPermissions.set(id,{status:'pending',direction:'outgoing'}); }
      else {if(current.status!=='pending'||current.direction!=='incoming')throw Error('لا توجد دعوة واردة.');callPermissions.set(id,{status:action==='accept'?'accepted':'declined'});}
      notify();simulation.wake();return callPermissions.get(id)!;
    },
    async gallery(subject) { return subject ? [] : galleryPhotos; },
    async galleryUrl(photo) { const p = galleryPhotos.find(p => p.id === photo.id); if (!p) throw Error("الصورة غير متاحة."); return URL.createObjectURL(await (await fetch(p.url)).blob()); },
    async addGallery(file) { if (galleryPhotos.length >= 3) throw Error("الحد الأقصى ثلاث صور."); galleryPhotos.push({id: crypto.randomUUID(), url: URL.createObjectURL(file)}); notify(); },
    async removeGallery(photo) { const i=galleryPhotos.findIndex(p=>p.id===photo.id); if(i>=0){URL.revokeObjectURL(galleryPhotos[i].url);galleryPhotos.splice(i,1);}notify(); },
    async rewindStep(id, stage, agree) {
      const p=progress(id); if(p.stage!==stage||stage<1)throw Error("تغيّرت المرحلة.");
      const next: StepProgress = agree && p.rewindPeer ? {...p,stage: stage-1,mine:false,peer:false,stepId:undefined,rewindMine:false,rewindPeer:false} : {...p,rewindMine:agree,rewindPeer:agree ? p.rewindPeer : false};

      next.updatedAt=new Date().toISOString();steps.set(id,next);notify();simulation.wake();return next;
    },
    async journeyChoice(id,topic,action,expectedId,stage) {
      const current:StepProgress=progress(id);
      const key=topic==='exclusive'?'exclusiveId':'stepId';
      if((current[key]??null)!==(expectedId??null))throw Error('تغيّر الطلب. راجع الحالة الحالية.');
      const next={...current,updatedAt:new Date().toISOString()};
      if(topic==='exclusive'){
        if(action==='accept' && !current.consentPeer)throw Error('لا يوجد طلب وارد.');
        next.exclusive=action==='accept';
        next.consentMine=action!=='clear'; next.consentPeer=next.exclusive;
        next.exclusiveId=action==='clear'?undefined:expectedId??crypto.randomUUID();
        if(next.exclusive){exclusiveId=id;records.filter(r=>r.id!==id).forEach(r=>{r.status='closed';});}
        else if(exclusiveId===id)exclusiveId=null;
      }else{
        if(stage!==current.stage+1 && !(action==='clear'&&stage===2&&current.stage===2))throw Error('تغيّرت المرحلة.');
        if(action==='accept' && !current.peer)throw Error('لا يوجد طلب وارد.');
        if(action==='accept')next.stage=stage!;
        if(action==='clear'&&current.stage===2)next.stage=1;
        next.mine=action==='propose'; next.peer=false;
        next.stepId=action==='propose'?crypto.randomUUID():next.stage===2?expectedId:undefined;
      }
      steps.set(id,next);notify();simulation.wake();return next;
    },
    async nextStep(id, stage, agree, consent = false) {
      const current = progress(id);
      if (stage === 1 && agree && !consent) throw new Error('أكّد موافقتك على الالتزام الحصري.');
      if (agree && stage <= current.stage) return current;
      if (stage !== current.stage + 1 || stage > 2) throw new Error("الخطوة غير متاحة.");
      const next = agree && current.peer ? { stage, mine: false, peer: false } : { ...current, mine: agree };
      const value = { ...next, updatedAt: new Date().toISOString(), exclusive: next.stage >= 1, consentMine: agree, consentPeer: current.peer };
      if (value.exclusive) { exclusiveId = id; records.forEach(r => { if (r.id !== id) r.status = 'closed'; }); }
      steps.set(id, value); notify(); simulation.wake(); return value;
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
          (!f.subjectId || p.id===f.subjectId) && !hiddenPeople.has(p.id) && !blockedPeople.has(p.id) && matchesDiscoveryFilters(p,f) &&
          !records.some((r) => r.peer === p.id && r.status === "closed" && !r.allowRematch) &&
          (f.mode === "all" || (!records.some(r => r.peer === p.id) && weekly().includes(p.id))) &&
          !f.work,
      );
      const cursor = f.afterId
        ? options.findIndex((p) => p.id === f.afterId) + 1
        : 0;
      if(f.sort === "youngest") options.sort((a,b)=>a.age-b.age);
      if(f.sort === "oldest") options.sort((a,b)=>b.age-a.age);
      return options.slice(f.offset ?? cursor, (f.offset ?? cursor) + 24);
    },
    async inbox() {
      const member = { ...viewer(), relocationCities, id: "demo-viewer" };
      return records.flatMap((r) => {
        if (r.status === "closed") return [];
        const peer = examples.find(p => p.id === r.peer);
        if (!peer || peer.gender === member.gender) return [];
        const comparable = demoAssessmentFor(peer, member);
        const fit = describeFit(member, comparable);
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
    async matchingExclusions() {
      const excluded = new Map<string, MatchingExclusion>();
      for (const r of records.filter(row => row.status === 'closed' && !row.allowRematch)) {
        const previous = excluded.get(r.peer);
        if (!previous?.since || previous.since < r.updatedAt) excluded.set(r.peer, { id: r.peer, alias: examples.find(p => p.id === r.peer)?.alias ?? 'عضو', reason: 'no_rematch', since: r.updatedAt });
      }
      for (const id of blockedPeople) excluded.set(id, { ...excluded.get(id), id, alias: examples.find(p => p.id === id)?.alias ?? 'عضو', reason: 'blocked' });
      return [...excluded.values()].sort((a, b) => (b.since ?? '').localeCompare(a.since ?? ''));
    },
    async request(memberId) {
      if (simulationOptions.membershipTier?.() === 'free') throw Error('المبادرة بطلب تعارف تتطلب عضوية مميزة أو وسام الجدية.');
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
      notify(); simulation.wake();
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
      notify(); simulation.wake();
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
      typingPeople.delete(id); notify(); simulation.wake();
    },
    async thread(id, beforeId) {
      const list = threadRows(id);
      const end = beforeId ? list.findIndex((m) => m.id === beforeId) : list.length;
      return end <= 0 ? [] : list.slice(Math.max(0, end - messagePageSize), end);
    },
    async messageChanges(id, messageIds) { const ids = new Set(messageIds); return threadRows(id).filter(row => ids.has(row.id)); },
    async searchMessages(id, query, beforeId, kind) { return searchMessageRows(threadRows(id), query, beforeId, kind); },
    async readState(id) {
      const rows = threadRows(id), last = rows.findIndex(row => row.id === readThrough.get(id));
      const unreadRows = rows.slice(last + 1).filter(row => !row.senderIsMe && !row.deletedAt);
      return { firstUnreadId: unreadRows[0]?.id ?? null, unreadCount: unreadRows.length };
    },
    async setTyping(id) { threadRows(id); },
    async typingState(id) { threadRows(id); return typingPeople.has(id) && chatReady(id); },
    async reactToMessage(id, messageId, reaction) {
      threadRows(id);
      const message = messages.get(id)?.find(row => row.id === messageId);
      if (!message || message.deletedAt) throw Error('الرسالة غير متاحة.');
      if (reaction !== null && !messageReactionEmojis.includes(reaction)) throw Error('اختر تفاعلًا صالحًا.');
      message.reactions = withOwnReaction(message.reactions, reaction);
      notify();
      return message.reactions;
    },
    async deleteMessage(id, messageId) {
      threadRows(id);
      const message = messages.get(id)?.find(row => row.id === messageId);
      if (!message?.senderIsMe) throw Error('يمكنك حذف رسائلك فقط.');
      if (message.deletedAt) return;
      if (Date.now() - Date.parse(message.createdAt) > 48 * 60 * 60 * 1000) throw Error('يمكن الحذف لدى الجميع خلال ٤٨ ساعة من الإرسال.');
      if (message.attachment) mediaFiles.delete(message.attachment.id);
      message.deletedAt = new Date().toISOString();
      message.body = deletedMessageText; message.attachment = null; message.reply = null; message.reactions = [];
      notify();
    },
    async sendMedia(id, file, kind, clientId, duration, viewOnce = false) {
      requireChat(id);
      if (!file.size || file.size > 8 * 1024 * 1024 || (kind === 'photo' ? file.type !== 'image/jpeg' : !file.type.startsWith('audio/'))) throw Error('اختر ملفًا صالحًا بحجم لا يتجاوز ٨ ميغابايت.');
      if (viewOnce && kind !== 'photo') throw Error('العرض لمرة واحدة متاح للصور فقط.');
      const list = messages.get(id) ?? [];
      if (list.some(row => row.clientId === clientId)) return clientId;
      mediaFiles.set(clientId, file);
      list.push({ id: clientId, clientId, senderIsMe: true, body: kind === 'photo' ? (viewOnce ? 'صورة لمرة واحدة' : 'صورة') : 'رسالة صوتية', createdAt: new Date().toISOString(), attachment: { id: clientId, kind, mime: file.type, size: file.size, duration, viewOnce, openedAt: null } });
      messages.set(id, list); notify(); simulation.wake(); return clientId;
    },
    async mediaUrl(id, attachmentId) {
      const message = mediaMessage(id, attachmentId);
      if (message.attachment?.viewOnce) throw Error('افتح الصورة من زر العرض لمرة واحدة.');
      return URL.createObjectURL(mediaFiles.get(attachmentId)!);
    },
    async confirmMediaViewed(id, attachmentId) {
      const message = threadRows(id).find(row => row.attachment?.id === attachmentId);
      if (message?.attachment?.openedAt && !message.senderIsMe && !message.deletedAt) {
        message.attachment.viewedAt ??= new Date().toISOString();
        notify();
      }
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
      requireChat(id);
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
      notify(); simulation.wake();
      return clientId;
    },
  };
}
