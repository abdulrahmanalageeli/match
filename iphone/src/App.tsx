import { FeatureOverview, overviewSeen, rememberOverview } from './help/FeatureOverview';
import memberAr from './member-copy.ts';
import {MembershipAccess} from './membership/access';
import { finalizeStagedPortrait, finalizePortraitStage, pendingPortraitStage } from './photos/stagedPortrait';
import type { SignupVerification } from './auth/registrationDevice';
import { BrandWordmark } from './Brand';
import { withTestingDiscovery } from './community/testingDiscovery';
import {membershipPriceLabel,type MembershipPlan} from './membershipPricing';
import {MembershipChangeNotice} from './membership/MembershipEntry';
import type {GiftRecipient} from './membership/GiftMembership';
import './testingTrial.css';
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, X } from "./BrandIcons";
import { welcomeNavigation } from "./welcomeNavigation";
import { MemberPasswordRecovery } from './auth/MemberPasswordRecovery';
import { readRecoveryLink, type RecoveryLink } from './auth/passwordRecovery';
import { currentRegistrationReceipt, type SignupReturn, type SignupAgreements } from './auth/signupReturn';
import { CompleteRegistrationAgreements } from './auth/CompleteRegistrationAgreements';
import "./ambient.css";
import type { PortraitDraft } from './photos/portraitPreparation';
import { APPLICATION_INTEGRITY_VERSION, LEGAL_NOTICE_VERSION } from './legal/LegalNotice';
import { socialSignIn } from './auth/social';
import { SocialOnboarding } from './auth/SocialOnboarding';
import { DeviceUnlockOffer } from './auth/DeviceUnlockOffer';
import { SupportContact, SupportProvider } from './help/SupportContact';
import { createSupportSource } from './help/support';
import { feedback } from './feedback/haptics';
import { RoutePlaceholder } from './feedback/RoutePlaceholder';
import { Home, MemberTabs, ProposalDetail } from "./Home";
import {
  Auth,
  Frame,
  Membership,
  Pending,
  Policy,
  Welcome,
} from "./Screens";
import { request, ServiceError, serviceReady } from "./api";
import { memberPendingSends } from "./community/nativePendingSends";
import { clearSession, readSession, saveSession } from "./session";
import {
  cloud,
  callRpc,
  cloudSelected,
  cloudSessionId,
  cloudLogout,
  CloudError,
} from "./cloud";
import { demoProfile, demoCommunity, cloudCommunity } from "./community/data";
import { releaseChatSource, sendNotificationReply } from "./community/chatOutbox";
import { useUnreadCount } from "./community/useUnreadCount";
import { useMutualMatches } from "./community/useMutualMatches";
import { MatchCelebration } from "./community/MatchCelebration";
import { initializeMatchSound } from "./community/matchSound";
import { PublicationCenter } from './publishing/PublicationCenter';
import { ConductCenter } from './conduct/ConductCenter';
import { usePushNotifications, setPushBadge, detachNotifications, syncNativePushOwner } from "./notifications/push";
import { NotificationSetup } from './notifications/NotificationSetup';
import { simulationActivityDestination } from "./notifications/simulationDeviceAlerts";
import { RegistrationWait } from "./release/RegistrationWait";
import { ActivityAlerts } from "./notifications/ActivityAlerts";
import { VoiceCallsProvider } from "./voice/VoiceCalls";
import { useNativeCalls } from './voice/nativeCalls';
import { pairSource, testProfile, type TestSession } from "./testing/pair";
import type { ApplicationDraft } from "./onboarding/GuidedApplication";
import type { ProfileAnswerProvenance } from './interview/profileProvenance';
import type { MembershipReadiness } from './onboarding/membershipReadiness';
import type { Chapter } from "./onboarding/draft";
import { beenaProgress } from './beena/model';
import { clearSavedIntake, discardLocalIntake, releaseIntake } from "./onboarding/persistence";
import {
  completeMembership,
  currentMembership,
  getMembershipOffer,
  MembershipOfferChangedError,
  type MembershipOffer,
  isIOSBilling,
  manageMembership,
  onMembershipUpdate,
  onGiftUpdate,
  unfinishedGifts,
  purchaseMembership,
  restoreMembership,
} from "./billing";
import { demoProposals } from "./demo";
import './testing/simulation-panel.css';
import { generateDemoReading } from './community/deepCompatibilityClient';
import {
  toProposal,
  type AccountState,
  type Decision,
  type Profile,
  type PortraitRevealPolicy,
  type Proposal,
} from "./types";

let warmCommunity: typeof import("./community/Community").Community | undefined;
async function loadCommunity() {
  const module = await import("./community/Community");
  warmCommunity = module.Community;
  return { default: module.Community };
}
const LazyCommunity = lazy(loadCommunity);
const Settings = lazy(() => import("./settings/Settings").then(m => ({ default: m.Settings })));
const GiftMembership = lazy(()=>import('./membership/GiftMembership').then(m=>({default:m.GiftMembership})));
let warmIntake: typeof import("./onboarding/GuidedApplication").GuidedApplication | undefined;
async function loadIntake() {
  const module = await import("./onboarding/GuidedApplication");
  warmIntake = module.GuidedApplication;
  return { default: warmIntake };
}
const LazyIntake = lazy(loadIntake);
const OnboardingSandbox = lazy(()=>import('./onboarding/OnboardingSandbox').then(m=>({default:m.OnboardingSandbox})));

type View =
  | "main"
  | "curated"
  | "login"
  | "register"
  | "settings"
  | "proposal"
  | "membership"
  | "gifting"
  | "application"
  | "discover"
  | "inbox"
  | "chats";
type Confirmation = "pass" | "block" | "report" | "delete" | null;
const memberNavigationOrder: Partial<Record<View, number>> = { main: 0, discover: 0, curated: 1, inbox: 2, chats: 3, settings: 4, proposal: 5, membership: 6, gifting: 7 };
function MemberRouteArrival({view, pending}: {view: View; pending: {current: number}}) {
  useLayoutEffect(() => {
    const direction = pending.current;
    pending.current = 0;
    if (!direction || document.hidden || document.documentElement.dataset.nfMotion === 'reduced' ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const page = document.querySelector('.phone-app main');
    const content = page?.querySelector<HTMLElement>(':scope > .screen-content, :scope > .flow-body, :scope > .cm-view') ?? page;
    if (!content?.animate) return;
    // Animate the live destination. Browser snapshots can retain private profile or chat pixels.
    const x = direction * -32;
    const edge = direction > 0 ? '0 12% 0 0' : '0 0 0 12%';
    const arrival = content.animate([
      { opacity: .16, transform: `translate3d(${x}px,8px,0) scale(.988)`, filter: 'blur(5px)', clipPath: `inset(${edge} round 18px)` },
      { opacity: .9, transform: `translate3d(${x * -.08}px,-1px,0) scale(1.002)`, filter: 'blur(0)', clipPath: 'inset(0 round 0)', offset: .7 },
      { opacity: 1, transform: 'translate3d(0,0,0) scale(1)', filter: 'blur(0)', clipPath: 'inset(0 round 0)' },
    ], { duration: 430, easing: 'cubic-bezier(.18,.78,.2,1)' });
    return () => arrival.cancel();
  }, [view, pending]);
  return null;
}
function problem(err: unknown) {
  return err instanceof Error && /[\u0600-\u06ff]/.test(err.message)
    ? err.message
    : "تعذّر إتمام العملية. حاول مجددًا.";
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closing = useRef<Animation | null>(null);
  const closeRef = useRef(close);
  useLayoutEffect(() => { closeRef.current = close; }, [close]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => { closing.current?.cancel(); dialog.close(); };
  }, []);
  function dismiss() {
    const dialog = ref.current;
    if (!dialog || closing.current) return;
    if (!dialog.animate || document.hidden || document.documentElement.dataset.nfMotion === 'reduced' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) { closeRef.current(); return; }
    dialog.dataset.dismissing = '';
    closing.current = dialog.animate([
      { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0)' },
      { opacity: 0, transform: 'translateY(16px) scale(.975)', filter: 'blur(2px)' },
    ], { duration: 190, easing: 'cubic-bezier(.4,0,.7,.2)', fill: 'forwards' });
    closing.current.onfinish = () => closeRef.current();
  }
  return (
    <dialog
      dir="rtl"
      ref={ref}
      className="action-dialog"
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
      aria-labelledby="dialog-title"
    >
      <header>
        <h2 id="dialog-title">{title}</h2>
        <button className="f-icon" onClick={dismiss} aria-label="إغلاق">
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

export default function App({ recoveryLink, signupReturn, openLogin, ...props }: {tester?:TestSession;onTesterExit?:()=>void;recoveryLink?:RecoveryLink|null;signupReturn?:SignupReturn|null;openLogin?:boolean} = {}) {
  const [recovery, setRecovery] = useState(() => recoveryLink ?? readRecoveryLink(window.location.href));
  const [returnToLogin, setReturnToLogin] = useState(false);
  // Do not mount member session restoration, chat, or discovery for recovery links.
  return recovery ? <div className="phone-app"><MemberPasswordRecovery callback={recovery} onBack={() => {
    setReturnToLogin(true); setRecovery(null);
  }}/></div> : <MemberApp {...props} startAtLogin={returnToLogin || Boolean(signupReturn)} openLogin={openLogin} signupReturn={signupReturn}/>;
}

function MemberApp({tester,onTesterExit,startAtLogin=false,openLogin=false,signupReturn}:{tester?:TestSession;onTesterExit?:()=>void;startAtLogin?:boolean;openLogin?:boolean;signupReturn?:SignupReturn|null}={}) {
  useEffect(initializeMatchSound, []);
  const [view, setView] = useState<View>(startAtLogin || openLogin ? 'login' : 'main');
  const [publicationOpen,setPublicationOpen]=useState<{id:string;owner:string|null}|null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [live, setLive] = useState<AccountState | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [dismissedReceipts, setDismissedReceipts] = useState<string[]>([]);
  const sentReceiptAcks = useRef(new Set<string>());
  const membershipReceipt = live?.membershipNotice;
  const receiptDismissed = Boolean(membershipReceipt && dismissedReceipts.includes(membershipReceipt.id));
  useEffect(() => {
    if (!membershipReceipt || !receiptDismissed || !token || live?.user.id !== token) return;
    const id = membershipReceipt.id;
    const sent = sentReceiptAcks.current;
    if (sent.has(id)) return;
    sent.add(id);
    // A failed acknowledgement can retry when the next account refresh returns the receipt.
    void callRpc('wudayn_ack_membership_notice', { notice_id: id }, token).catch(() => sent.delete(id));
  }, [membershipReceipt, receiptDismissed, token, live?.user.id]);
  const [entryReceipt, setEntryReceipt] = useState<{ owner: string; value: SignupAgreements | null } | null>(null);
  const [notificationSetupOwner,setNotificationSetupOwner]=useState<string|null>(null);
  const completeNotificationSetup=useCallback(()=>setNotificationSetupOwner(token),[token]);
  const accountAgreements = entryReceipt?.owner === token ? entryReceipt?.value : undefined;
  useEffect(() => {
    let active = true;
    function load() {
      if (token && cloud) void cloud.auth.getUser().then(({ data, error }) => {
        if (active && (error || data.user?.id === token)) setEntryReceipt({ owner: token, value: data.user?.app_metadata?.signupConsent ?? null });
      }).catch(() => { if (active) setEntryReceipt({ owner: token, value: null }); });
    }
    load();
    window.addEventListener('wudayn:entry-agreements', load);
    return () => { active = false; window.removeEventListener('wudayn:entry-agreements', load); };
  }, [token]);
  const tokenRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [socialPending, setSocialPending] = useState<{ userId: string; email: string; initialReceipt?: SignupAgreements } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const showLunaNotice = (event: Event) => setError((event as CustomEvent<string>).detail);
    window.addEventListener('wudayn:luna-notice', showLunaNotice);
    return () => window.removeEventListener('wudayn:luna-notice', showLunaNotice);
  }, []);
  const inflight = useRef(false);
  const version = useRef(0);
  const refreshSequence = useRef(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(signupReturn === 'invalid'
    ? "رابط تأكيد البريد غير صالح أو انتهت صلاحيته. سجّل الدخول أو تواصل مع فريق وُدَين للمساعدة."
    : signupReturn ? "سجّل الدخول لإكمال حسابك بعد تأكيد البريد الإلكتروني." : "");
  const [fromIntake, setFromIntake] = useState(false);
  const navigationVersion = useRef(0);
  const tabScroll = useRef(new Map<View, number>());
  const pendingScroll = useRef<number | null>(null);
  const routeDirection = useRef(0);
  const routeExit = useRef<Animation | null>(null);
  const [demo, setDemo] = useState(Boolean(tester));
  const [sampleIndex, setSampleIndex] = useState(0);
  const [sampleStatus, setSampleStatus] =
    useState<Proposal["status"]>("pending");
  const [samplePaused, setSamplePaused] = useState(false);
  const [sampleProfile, setSampleProfile] = useState<Profile>(tester?.profile||demoProfile);
  const sampleProfileRef = useRef(sampleProfile);
  const [sampleSession, setSampleSession] = useState(0);
  const pairOwner = useRef<object | null>(null);
  const pair = useMemo(() => {
    const owner = {};
    pairOwner.current = owner;
    return tester ? pairSource(tester, () => sampleProfileRef.current, profile => {
      // Do not replace an unfinished assessment or accept its newer write revision.
      if (!mounted.current || pairOwner.current !== owner || viewRef.current === 'application' || inflight.current) return false;
      const next = { ...profile, gender: sampleProfileRef.current.gender };
      sampleProfileRef.current = next;
      setSampleProfile(next);
      return true;
    }) : null;
  }, [tester, sampleSession]);
  const [newDemoIntake, setNewDemoIntake] = useState(false);
  const [onboardingPreview,setOnboardingPreview]=useState(false);
  const [applicationChapter,setApplicationChapter]=useState<Chapter>();
  const [supportField,setSupportField]=useState<{owner:string;chapter:Chapter;field:string}>();
  const intakeDraft = useRef<ApplicationDraft | null>(null);
  const welcomeIntent = useRef(0);
  const welcomeFocus = useRef(".nf-join");
  const liveDraftOwner = useRef<string | null>(null);
  const realProfileRef = useRef(live?.profile);
  realProfileRef.current = live?.profile;
  const tier = demo ? 'premium' : live?.membership.tier ?? (live?.membership.active ? 'premium' : 'free');
  const tierRef = useRef(tier);
  tierRef.current = tier;
  const source = useMemo(
    () =>
      pair ? pair.source : demo
        ? demoCommunity(() => sampleProfileRef.current, true, {interactiveJourney:true})
        : token && cloud
          ? live?.demoDiscoveryEnabled && live.demoInteractionsEnabled
            ? withTestingDiscovery(cloudCommunity(token, memberPendingSends(token)), () => realProfileRef.current ?? demoProfile, live.demoInteractionsEnabled ? live.user.id : undefined, () => tierRef.current, id=>generateDemoReading(id,live.user.id))
            : cloudCommunity(token, memberPendingSends(token))
          : null,
    [demo, token, sampleSession, pair, live?.demoDiscoveryEnabled, live?.demoInteractionsEnabled, live?.user.id],
  );
  const [policy, setPolicy] = useState(false);
  const supportSource = useMemo(() => cloud && token && !demo && !tester ? createSupportSource(cloud, token) : null, [token, demo, tester]);
  const [completionEntry, setCompletionEntry] = useState(0);
  useEffect(() => { if (view !== 'settings') setCompletionEntry(0); }, [view]);
  const [confirm, setConfirm] = useState<Confirmation>(null);
  const [reason, setReason] = useState("");
  const [reportCategory, setReportCategory] = useState("");
  const [reportReceipt, setReportReceipt] = useState<{ owner: string | null; reference: string; demo: boolean } | null>(null);
  useEffect(() => { setReportReceipt(null); }, [token, demo, sampleSession]);
  const [price, setPrice] = useState<(MembershipOffer & {gender:'man'|'woman'})|null>(null);
  const [priceFailed,setPriceFailed]=useState(false);
  const [offerRevision,setOfferRevision]=useState(0);
  const [returnFromMembership, setReturnFromMembership] =
    useState<View>("main");
  const [requestedPlan,setRequestedPlan]=useState<MembershipPlan>();
  const [giftRoute,setGiftRoute]=useState<{from:View;target?:GiftRecipient}>({from:'membership'});
  const active = tier !== 'free';
  const waitingForLaunch = !demo && live?.prelaunch?.locked === true;
  const memberAccess = demo || Boolean(!waitingForLaunch && live && (live.user.applicationStatus === "approved" || live.user.profileReviewPending));
  const paused = demo ? samplePaused : Boolean(live?.user.paused);
  useEffect(() => {
    if (!demo || paused || onboardingPreview || !source?.simulation) return;
    source.simulation.start();
    return () => source.simulation?.dispose();
  }, [demo, source, paused, onboardingPreview]);

  const badgeOwner = tester ? 'tester:' + tester.session : !demo ? token : null;
  const updatePushBadge = useCallback((count: number) => {
    if (badgeOwner) void setPushBadge(count, badgeOwner).catch(() => {});
  }, [badgeOwner]);
  const chatUnread = useUnreadCount(memberAccess ? source : null, updatePushBadge);
  const mutual = useMutualMatches(memberAccess && !paused ? source : null);
  const [conversationIntent, setConversationIntent] = useState<{ source: NonNullable<typeof source>; id: string; requestOnly?: boolean; messageId?:string;roomId?:string;agreement?:boolean;analysis?:boolean } | null>(null);
  const clearConversationIntent = useCallback(() => setConversationIntent(null), []);
  useNativeCalls(!demo && memberAccess ? token : null,tester?.session);
  const simulationAlerts = !demo && token && (!live || live.user.id !== token) ? undefined
    : !memberAccess || paused || onboardingPreview ? null
    : tester ? (tester.actor === 'abdulrahman' ? source : null)
    : !demo && live?.demoDeviceAlertsEnabled ? source?.demoInteractions ?? null : null;
  const currentSimulationAlerts = useRef(simulationAlerts);
  currentSimulationAlerts.current = simulationAlerts;
  usePushNotifications(tester ? `tester:${tester.session}` : !demo ? token : null, async (id, kind,event) => {
    if(kind==='publication'){setPublicationOpen({id,owner:token});return;}
    if(!memberAccess)return;
    if (!source || (demo && !tester)) return;
    if (kind === 'simulation') {
      if (!simulationAlerts) return;
      const destination = await simulationActivityDestination(simulationAlerts,id);
      if (currentSimulationAlerts.current !== simulationAlerts) return;
      setConversationIntent(destination ? {source,...destination} : null);
      go(destination && !destination.requestOnly ? 'chats' : 'inbox');
      return;
    }
    // A notification carries navigation intent only. The inbox re-fetches the
    // authenticated connection before it can open a profile or conversation.
    if (event?.action && !(await source.inbox()).some(row => row.id === id && row.status === 'accepted')) {
      setNotice('لم يعد هذا النشاط متاحًا.');
      go('chats');
      return;
    }
    setConversationIntent({ source, id, requestOnly: kind === "request", messageId:event?.messageId,roomId:event?.roomId,agreement:kind==='reminder',analysis:kind==='analysis' });
    go(kind === "request" ? "inbox" : "chats");
    try{
      if(event?.action==='reply'&&event.text?.trim()&&event.actionId){
        await sendNotificationReply(source,id,event.text.trim().slice(0,1000),event.actionId);
      }
      if(event?.messageId&&['read','reply'].includes(event.action||''))await source.markRead(id,event.messageId);
    }catch(cause){setNotice('تعذّر إتمام إجراء الإشعار. سنعيد المحاولة عند فتح وُدَين.');throw cause;}
  }, simulationAlerts);
  const curatedPrevious = useRef<{ owner: string | null; id?: string; status?: Proposal["status"] } | null>(null);
  const [curatedMatch, setCuratedMatch] = useState<{ owner: string | null; id: string; name: string } | null>(null);
  useEffect(() => {
    if (!source || !memberAccess) return;
    return () => releaseChatSource(source);
  }, [source, memberAccess]);
  const accepted = live?.user.applicationStatus === "approved";
  const canSyncBilling = accepted || Boolean(live?.user.profileReviewPending);
  const ios = isIOSBilling();
  const giftingAvailable=Boolean(!demo && cloudSelected && accepted && !live?.user.profileReviewPending && !paused && !waitingForLaunch);
  const giftAttention=(live?.giftInvitations??0)+(live?.giftsReady??0);
  function openGifts(target?:GiftRecipient) {
    if(!giftingAvailable)return;
    setGiftRoute({from:view,target});
    go('gifting');
  }
  async function settleGift(jws:string) {
    const owner=tokenRef.current;
    if(!owner || owner!==token)throw Error('سجّل الدخول بالحساب الذي اشترى الهدية.');
    const state=await request<AccountState>('/membership','POST',owner,{signedTransaction:jws});
    if(tokenRef.current!==owner)throw Error('تغيّر الحساب.');
    await completeMembership(jws);
    if(tokenRef.current===owner){version.current++;setLive(state);window.dispatchEvent(new Event('wudayn:gift-settled'));}
  }

  function remember(t: string | null, draftCleared = false) {
    if (tokenRef.current !== t) {
      setDismissedReceipts([]);
      sentReceiptAcks.current = new Set();
      void syncNativePushOwner(t).catch(()=>{});
      if (liveDraftOwner.current && !draftCleared) {
        void (cloudSelected ? releaseIntake(liveDraftOwner.current) : discardLocalIntake(liveDraftOwner.current)).catch(() => {
          setNotice("تعذّر مسح المسودة من هذا الجهاز. افتح قفل الجهاز وحاول مجددًا.");
        });
      }
      liveDraftOwner.current = null;
      intakeDraft.current = null;
    }
    tokenRef.current = t;
    setToken(t);
    version.current++;
  }
  function go(next: View) {
    if (next === view || routeExit.current) return;
    // Capture the outgoing tab before replacing it; never visibly scroll that page.
    window.dispatchEvent(new Event('nisfayn:before-navigation'));
    const tab = (value: View) => value === 'main' ? 'discover' : value;
    const remembered = (value: View) => ['discover', 'curated', 'inbox', 'chats', 'settings'].includes(value);
    if (remembered(tab(view)) && !document.querySelector('[data-conversation-id], .mp-profile')) tabScroll.current.set(tab(view), window.scrollY);
    pendingScroll.current = remembered(tab(next)) ? tabScroll.current.get(tab(next)) ?? 0 : 0;
    const from = memberNavigationOrder[view], to = memberNavigationOrder[next];
    routeDirection.current = memberAccess && from !== undefined && to !== undefined ? Math.sign(to - from) : 0;
    const commit = () => {
      navigationVersion.current++;
      setFromIntake(false);
      setView(next);
      setError("");
      setNotice("");
    };
    const page = document.querySelector('.phone-app main');
    const content = page?.querySelector<HTMLElement>(':scope > .screen-content, :scope > .flow-body, :scope > .cm-view') ?? page;
    const reduced = document.hidden || document.documentElement.dataset.nfMotion === 'reduced' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!memberAccess || !routeDirection.current || !content?.animate || reduced) { commit(); return; }
    const x = routeDirection.current * 13;
    const duration = 145;
    const navigationOwner = tokenRef.current;
    const animation = content.animate([
      { opacity: 1, transform: 'translate3d(0,0,0) scale(1)', filter: 'blur(0)', clipPath: 'inset(0 round 0)' },
      { opacity: .72, transform: `translate3d(${x}px,-2px,0) scale(.994)`, filter: 'blur(2px)', clipPath: `inset(0 ${routeDirection.current > 0 ? '0 0 4%' : '4% 0 0'} round 14px)` },
    ], { duration, easing: 'cubic-bezier(.4,0,.75,.3)', fill: 'forwards' });
    routeExit.current = animation;
    const finish = () => {
      if (routeExit.current !== animation) return;
      window.clearTimeout(fallback);
      routeExit.current = null;
      animation.onfinish = animation.oncancel = null;
      animation.cancel();
      if (mounted.current && viewRef.current === view && tokenRef.current === navigationOwner) commit();
    };
    // WebKit can suspend an exit animation before delivering either animation event.
    const fallback = window.setTimeout(finish, duration + 100);
    animation.onfinish = animation.oncancel = finish;
  }
  useLayoutEffect(() => {
    const top = pendingScroll.current;
    if (top === null) return;
    pendingScroll.current = null;
    // Lists also restore their precise anchor after their asynchronous data load.
    window.scrollTo({ top, behavior: 'instant' });
  }, [view, ios]);
  const atWelcome = !loading && !demo && !token && !live && view === "main";
  const [guideSeen, setGuideSeen] = useState(overviewSeen);
  const [guideReplayed, setGuideReplayed] = useState(false);
  const [guideClosedHere, setGuideClosedHere] = useState(false);
  const guideEntry = atWelcome || Boolean((tester || live) && (view === 'main' || view === 'discover'));
  const canShowArrivalPrompt = guideEntry && !loading && !socialPending && !conversationIntent &&
    !publicationOpen && !policy && !confirm && !onboardingPreview && !mutual.match && !curatedMatch && !error;
  const showArrivalGuide = canShowArrivalPrompt && (!guideSeen || guideReplayed) &&
    (guideReplayed || (!startAtLogin && !openLogin));
  function closeArrivalGuide() {
    rememberOverview();
    setGuideSeen(true);
    setGuideClosedHere(true);
    setGuideReplayed(false);
    window.scrollTo({top:0, behavior:'instant'});
  }
  useEffect(() => {
    if (!showArrivalGuide && active && (view === "application" || view === "main") && !warmCommunity)
      void loadCommunity().catch(() => {});
  }, [active, view, showArrivalGuide]);
  useLayoutEffect(() => {
    if (!fromIntake) return;
    const heading = document.querySelector<HTMLElement>(".phone-app main h1");
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  }, [fromIntake]);
  useEffect(() => {
    if (atWelcome && !showArrivalGuide && !warmIntake) void loadIntake().catch(() => {});
    if (atWelcome && !showArrivalGuide && !warmCommunity) void loadCommunity().catch(() => {});
  }, [atWelcome, showArrivalGuide]);
  useEffect(()=>{
    if (view==='register' && !demo) void import('./launchEvents').then(({noteSignupStart})=>noteSignupStart());
  },[view,demo]);
  function leaveWelcome(target: "register" | "login" | "demo" | "intake") {

    const intent = ++welcomeIntent.current;
    const welcome = document.querySelector(".nf-welcome");
    const move = () => {
      if (intent !== welcomeIntent.current || !welcome?.isConnected) return;
      if (target === "intake" || target === "demo") enterDemo(target === "intake");
      else {
        welcomeFocus.current = target === "login" ? ".nf-mast-login" : ".nf-join";
        go(target);
      }
    };
    const open = () => {
      if (intent === welcomeIntent.current && welcome?.isConnected)
        welcomeNavigation(move, "forward", ".phone-app main h1");
    };
    const warmDestination = target === "intake" ? warmIntake : target === "demo" ? warmCommunity : true;
    if (warmDestination) { open(); return; }
    // Keep the welcome illustration and all actions live until the local chunk can render.
    setNotice(target === "demo" ? "جارٍ فتح تجربة الاكتشاف…" : "جارٍ فتح نموذج الملف…");
    void (target === "demo" ? loadCommunity() : loadIntake()).then(open, () => {
      if (intent !== welcomeIntent.current || !welcome?.isConnected) return;
      setNotice("");
      setError("تعذّر فتح الصفحة. حاول مجددًا.");
    });
  }
  function openAccount() {
    go("settings");
  }
  function openMembership(plan?:MembershipPlan) {
    setRequestedPlan(plan);
    setReturnFromMembership(view === "membership" ? "main" : view);
    go("membership");
  }
  function enterDemo(intake: boolean) {
    intakeDraft.current = null;
    setNewDemoIntake(intake);
    setDemo(true);
    sampleProfileRef.current = demoProfile;
    setSampleProfile(demoProfile);
    setSampleSession((s) => s + 1);
    setSampleIndex(0);
    setSampleStatus("pending");
    setSamplePaused(false);
    go(intake ? "application" : "main");
  }
  const startDemo = () => enterDemo(false);
  function changeDemoPool(gender: Profile["gender"]) {
    if (!demo || gender === sampleProfileRef.current.gender) return;
    const next = { ...sampleProfileRef.current, gender };
    sampleProfileRef.current = next;
    setSampleProfile(next);
    setSampleSession(session => session + 1);
    setSampleIndex(0);
    setSampleStatus("pending");
    setConversationIntent(null);
    setConfirm(null);
    go("discover");
  }
  function exitDemo() {
    if(tester){void detachNotifications('tester:'+tester.session).catch(()=>{}).finally(()=>onTesterExit?.());return;}
    intakeDraft.current = null;
    sampleProfileRef.current = demoProfile;
    setSampleProfile(demoProfile);
    setNewDemoIntake(false);
    setDemo(false);
    setConfirm(null);
    setPolicy(false);
    go("main");
  }
  function acceptLive(s: AccountState, t: string, seq: number) {
    if (tokenRef.current === t && version.current === seq) {
      liveDraftOwner.current = s.user.id;
      setLive(s);
    }
  }
  async function refresh(t: string, quiet = false) {
    const seq = version.current;
    const read = ++refreshSequence.current;
    try {
      const s = await request<AccountState>("/me", "GET", t);
      if (read === refreshSequence.current) acceptLive(s, t, seq);
      return s;
    } catch (err) {
      if (tokenRef.current !== t || version.current !== seq || read !== refreshSequence.current) return;
      if (
        (err instanceof ServiceError || err instanceof CloudError) &&
        err.status === 401
      ) {
        remember(null);
        setLive(null);
        setView("login");
        if (cloudSelected) await cloudLogout().catch(() => {});
        else await clearSession();
      }
      if (!quiet) throw err;
    }
  }
  async function run(work: () => Promise<void>) {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(problem(e));
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    // Auth email returns require explicit login, even if old storage remains.
    // Do not restore a previous token or start member activity behind this screen.
    if (startAtLogin || tester) { setLoading(false); return; }
    let disposed = false;
    async function init() {
      try {
        const t = await (cloudSelected ? cloudSessionId() : readSession());
        if (disposed) return;
        if (!t) { await syncNativePushOwner(null); return; }
        await syncNativePushOwner(t).catch(()=>{});
        if (disposed) return;
        if (cloudSelected) {
          const status = await callRpc<{ required: boolean; email: string }>('marriage_social_onboarding_status', {}, t);
          if (disposed) return;
          if (status.required) { setSocialPending({ userId: t, email: status.email }); return; }
        }
        remember(t);
        await refresh(t);
        if (!disposed && openLogin && tokenRef.current === t) setView('main');
      } catch (e) {
        if (!disposed) setError(problem(e));
      } finally {
        if (!disposed) setLoading(false);
      }
    }
    void init();
    return () => {
      disposed = true;
    };
  }, []);
  useEffect(() => {
    if (!token || demo) return;
    let disposed = false, reading = false, queued = false;
    const tick = () => {
      if (disposed || document.hidden || inflight.current) return;
      if (reading) { queued = true; return; }
      reading = true;
      void (async () => {
        try {
          do {
            queued = false;
            await refresh(token, true);
          } while (queued && !disposed && !document.hidden && !inflight.current);
        } finally { reading = false; }
      })();
    };
    const stop = source?.watch(tick);
    const timer = window.setInterval(tick, 20000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    window.addEventListener("online", tick);
    window.addEventListener("wudayn:registration-phase", tick);
    return () => {
      disposed = true;
      stop?.();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
      window.removeEventListener("online", tick);
      window.removeEventListener("wudayn:registration-phase", tick);
    };
  }, [token, demo, source]);
  useEffect(() => {
    if (!ios || !token || !canSyncBilling || demo) return;
    let disposed = false;
    const processing = new Set<string>();
    const pending = new Map<string,boolean>();
    const sync = async (jws: string, gift=false) => {
      if (disposed || tokenRef.current !== token || processing.has(jws)) return;
      pending.set(jws,gift);
      processing.add(jws);
      try {
        const s = await request<AccountState>("/membership", "POST", token, {
          signedTransaction: jws,
        });
        if (!disposed && tokenRef.current === token) {
          version.current++;
          setLive(s);
          await completeMembership(jws);
          pending.delete(jws);
          if(gift)window.dispatchEvent(new Event('wudayn:gift-settled'));
        }
      } catch {
        /* Keep StoreKit transaction unfinished until the server can verify it. */
      } finally {
        processing.delete(jws);
      }
    };
    const cleanup = Promise.resolve(
      onMembershipUpdate((jws) => {
        void sync(jws);
      }),
    );
    const giftListener = onGiftUpdate(jws=>{void sync(jws,true);}).catch(()=>null);
    const retryPending = () => {
      if (disposed || document.hidden || tokenRef.current !== token) return;
      for (const [jws,gift] of pending) void sync(jws,gift);
    };
    const resume = () => {
      if (disposed || document.hidden || tokenRef.current !== token) return;
      retryPending();
      void unfinishedGifts().then(rows=>{for(const jws of rows)void sync(jws,true);}).catch(()=>{});
      void currentMembership().then(jws => { if (jws) void sync(jws); }).catch(() => {});
    };
    resume();
    const retryTimer = window.setInterval(retryPending, 30000);
    window.addEventListener('online', resume);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      disposed = true;
      pending.clear();
      window.clearInterval(retryTimer);
      window.removeEventListener('online', resume);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
      void cleanup.then((handle) => handle.remove()).catch(() => {});
      void giftListener.then(handle=>handle?.remove()).catch(()=>{});
    };
  }, [token, canSyncBilling, demo, ios]);
  useEffect(() => {
    if (!ios || !canSyncBilling || demo || view!=='membership' || !live?.profile?.gender) return;
    let disposed = false;
    const gender=live.profile.gender;
    setPrice(null);
    setPriceFailed(false);
    getMembershipOffer(gender)
      .then((offer) => {
        if (!disposed) setPrice({gender,...offer});
      })
      .catch(() => {
        if (!disposed) setPriceFailed(true);
      });
    return () => {
      disposed = true;
    };
  }, [ios, canSyncBilling, demo, view, live?.profile?.gender, token, offerRevision]);

  function signIn(email: string, password: string, consent?: SignupAgreements, verification?: SignupVerification) {
    void run(async () => {
      const endpoint = view === "login" ? "/login" : "/register";
      const result = await request<
        | { token: string; state: AccountState; needsConfirmation?: false }
        | { needsConfirmation: true }
      >(endpoint, "POST", undefined, { email, password, consent, ...verification });
      if (result.needsConfirmation) {
        go("login");
        setNotice("أرسلنا لك رابط تأكيد البريد. افتح الرابط ثم سجّل الدخول.");
        return;
      }
      if (!cloudSelected) await saveSession(result.token);
      remember(result.token);
      liveDraftOwner.current = result.state.user.id;
      setLive(result.state);
      setDemo(false);
      go("main");
    });
  }
  function signInSocial(provider: 'apple' | 'google', initialReceipt?: SignupAgreements) {
    void run(async () => {
      const userId = await socialSignIn(provider);
      const status = await callRpc<{ required: boolean; email: string }>('marriage_social_onboarding_status', {}, userId);
      if (status.required) { setSocialPending({ userId, email: status.email, initialReceipt }); return; }
      remember(userId);
      await refresh(userId);
      setDemo(false);
      go('main');
    });
  }
  function finishSocialOnboarding(userId: string) {
    setSocialPending(null);
    remember(userId);
    setDemo(false);
    go('main');
    void run(async () => { await refresh(userId); });
  }
  function phoneSignedIn(memberId: string) {
    remember(memberId);
    setDemo(false);
    go("main");
    void run(async () => { await refresh(memberId); });
  }
  async function update(path: string, method: string, data: unknown) {
    const t = tokenRef.current;
    if (!t) throw new Error("سجّل الدخول أولًا.");
    const seq = ++version.current;
    const s = await request<AccountState>(path, method, t, data);
    acceptLive(s, t, seq);
    if (tokenRef.current === t && version.current === seq) return s;
  }
  const [portraitRetry, setPortraitRetry] = useState<{ owner: string; id: string; previousId?: string } | null>(null);
  const recoverPortrait = !demo && cloud && token && live?.profile && !live.profile.portrait
    && live.profile.signupConsents?.photo && live.user.applicationStatus !== 'draft' && view !== 'application';
  const pendingPhoto = portraitRetry?.owner === token && !demo ? portraitRetry : null;
  useEffect(() => {
    if (!recoverPortrait || !token) return;
    let active = true;
    void pendingPortraitStage().then(id => {
      if (active && id && tokenRef.current === token) setPortraitRetry({ owner: token, id });
    }).catch(() => {});
    return () => { active = false; };
  }, [recoverPortrait, token]);
  function retryPortrait() {
    const retry = portraitRetry;
    if (!retry || tokenRef.current !== retry.owner) return;
    void run(async () => {
      let latest = await refresh(retry.owner);
      if (!latest || tokenRef.current !== retry.owner) return;
      if (!latest.profile?.signupConsents?.photo || (latest.profile.portrait?.id !== retry.previousId && latest.profile.portrait?.id !== retry.id)) {
        setPortraitRetry(null);
        return;
      }
      if (latest.profile.portrait?.id !== retry.id) {
        await finalizePortraitStage(retry.id);
        latest = await refresh(retry.owner);
        if (!latest || tokenRef.current !== retry.owner) return;
      }
      if (tokenRef.current === retry.owner) {
        setPortraitRetry(null);
        if (latest.profile?.portrait?.id === retry.id) setNotice('اكتمل حفظ خطوة الصورة.');
      }
    });
  }
  function saveApplication(p: Profile, portraitChange?:PortraitDraft|null, portraitPolicy?:PortraitRevealPolicy, provenance?:ProfileAnswerProvenance[], readiness?:MembershipReadiness, integrity?:typeof APPLICATION_INTEGRITY_VERSION) {
    const editingExisting = demo ? !newDemoIntake : Boolean(live?.profile) && live?.user.applicationStatus !== 'draft';
    if (tester) p = { ...p, gender: tester.actor === 'reham' ? 'woman' : 'man' };
    const currentNavigation = navigationVersion.current;
    void run(async () => {
      const owner = demo ? null : liveDraftOwner.current;
      let submitted: AccountState | undefined;
      const member = tokenRef.current;
      const submissionVersion = member && !demo ? ++version.current : version.current;
      if(pair && tester) { const saved = await pair.save(p); p = testProfile(tester.actor, saved.profiles[tester.actor]); }
      if (!demo) {
        if (!member) throw Error("سجّل الدخول أولًا.");
        submitted = await request<AccountState>("/application", "PUT", member, {
          ...p,
          ...(provenance ? { _answerProvenance: provenance } : {}),
          ...(readiness ? { _membershipReadiness: readiness } : {}),
          ...(integrity ? { _applicationIntegrity: integrity } : {}),
          consentVersion: p.signupConsents ? LEGAL_NOTICE_VERSION : cloud && ["marriage-v1", "marriage-v2", "marriage-v3", "marriage-v4"].includes(p.assessmentVersion ?? "") ? "2026-11-06-assessment" : "2026-11-05",
        }).catch(problem => {
          if (!editingExisting && owner) void import('./launchEvents').then(({launchEvent})=>launchEvent('fault','review',owner));
          throw problem;
        });
        if (!editingExisting && owner) void import('./launchEvents').then(({launchEvent})=>launchEvent('success','review',owner));
        if (tokenRef.current !== member || version.current !== submissionVersion) return;
      }
      if(portraitChange!==undefined||(portraitPolicy!==undefined&&p.portrait&&portraitPolicy!==(p.portrait.revealPolicy??'never'))){
        try {
          if(portraitChange){if(portraitChange.staged){p={...p,portrait:await finalizeStagedPortrait(portraitChange)};}else{if(!source?.setPortrait)throw Error('خدمة صور الملف غير متاحة.');p={...p,portrait:await source.setPortrait(portraitChange.blob,portraitChange.blur,{policy:portraitChange.revealPolicy,clearBlob:portraitChange.clearBlob})};}}
          else if(portraitChange===null){await source?.removePortrait?.();p={...p,portrait:null};}
          else if(p.portrait&&portraitPolicy!==undefined){if(!source?.setPortraitPolicy)throw Error('إعداد كشف الصورة غير متاح.');p={...p,portrait:await source.setPortraitPolicy(p.portrait,portraitPolicy)};}
          if (!demo && member) {
            submitted = await request<AccountState>("/me", "GET", member);
          }
        } catch(e){
          if (!demo && owner && portraitChange?.staged) {
            if (tokenRef.current === owner) setPortraitRetry({ owner, id: portraitChange.staged.id, previousId: live?.profile?.portrait?.id });
          } else {
            if (submitted && member) acceptLive(submitted, member, submissionVersion);
            throw Error('حُفظت بيانات الملف، لكن لم يُحفظ تغيير الصورة. '+(e instanceof Error?e.message:'حاول مجددًا.'));
          }
        }
      }
      if (member && submitted) {
        if (tokenRef.current !== member || version.current !== submissionVersion) return;
        acceptLive(submitted, member, submissionVersion);
      }
      // Clearing the signed-in member's device draft is ordered by the vault.
      // Once the server has saved the profile, the next screen needn't wait for Keychain I/O.
      const cleanup = owner ? clearSavedIntake(owner).then(() => true, () => false) : null;
      const approved = demo || submitted?.user.applicationStatus === 'approved';
      if (navigationVersion.current !== currentNavigation) return;
      if (demo) {
        if (sampleProfileRef.current.gender !== p.gender) setSampleSession(s => s + 1);
        setSampleIndex(0);
        setSampleStatus("pending");
        sampleProfileRef.current = p;
        setSampleProfile(p);
        setNewDemoIntake(false);
      }
      intakeDraft.current = null;
      go(editingExisting ? "settings" : approved && source ? "discover" : "main");
      feedback('success');
      setFromIntake(!editingExisting && approved);
      if(editingExisting)setNotice("حُفظت تعديلات ملفك. يمكنك معاينته من الإعدادات.");
      const destination = navigationVersion.current;
      void cleanup?.then(cleared => {
        if (!cleared && navigationVersion.current === destination && liveDraftOwner.current === owner)
          setError("حُفظ ملفك، لكن تعذّر مسح المسودة من هذا الجهاز.");
      });
    });
  }
  function verifyPurchase(restore: boolean,plan: 'premium'|'seriousness'='premium',offer?:MembershipOffer) {
    void run(async () => {
      if (!live || !ios) throw new Error("الشراء متاح عبر تطبيق iPhone.");
      let buyer=live;
      let sandboxOnly=false;
      const displayedOffer=plan==='seriousness'?offer:price??undefined;
      if (!restore) {
        if(!token || !displayedOffer)throw new MembershipOfferChangedError('حدّث عرض العضوية قبل إكمال الشراء.');
        const latest = await refresh(token);
        if(!latest || latest.user.id!==live.user.id)throw new Error('تعذّر تأكيد حساب العضوية. أعد المحاولة.');
        buyer=latest;
        const upgrading=plan==='seriousness' && latest.membership.active && latest.membership.tier==='premium';
        sandboxOnly=!latest.membership.canStart && !upgrading;
        if(sandboxOnly && !(displayedOffer.sandboxCheckout && latest.user.applicationStatus==='approved' && !latest.user.paused && !latest.user.profileReviewPending))
          throw new Error('لا يتاح بدء هذا الاشتراك لحسابك حاليًا.');
        if (plan==='premium' && price?.gender !== buyer.profile?.gender) {
          setPrice(null);
          throw new Error('تغيّرت بيانات العضوية. حدّث السعر وراجعه قبل الشراء.');
        }
      }
      let jws: string;
      try {
        jws = restore
          ? await restoreMembership()
          : await purchaseMembership(buyer.user.appAccountToken, buyer.profile?.gender, plan==='seriousness'?false:price?.trialEligible, displayedOffer,plan,sandboxOnly);
      } catch (error) {
        if (error instanceof MembershipOfferChangedError) { setPrice(null); setOfferRevision(revision=>revision+1); }
        throw error;
      }
      await update("/membership", "POST", { signedTransaction: jws });
      await completeMembership(jws);
      go("main");
    });
  }
  function signOut() {
    if (demo) {
      exitDemo();
      return;
    }
    void run(async () => {
      const t = tokenRef.current;
      if (liveDraftOwner.current) await discardLocalIntake(liveDraftOwner.current);
      if (cloudSelected) await cloudLogout();
      else {
        if (t) void request("/logout", "POST", t).catch(() => {});
        await clearSession();
      }
      remember(null, true);
      setLive(null);
      go("main");
    });
  }
  function decide(decision: Decision, why?: string) {
    void run(async () => {
      if (!proposal) return;
      if (demo) {
        if (decision === "accept") setSampleStatus("interested");
        else {
          setSampleIndex((i) => i + 1);
          setSampleStatus("pending");
        }
      } else {
        await update("/introduction/respond", "POST", {
          id: proposal.id,
          decision,
          ...(why ? { reason: why } : {}),
        });
      }
      setConfirm(null);
      setReason("");
      setReportCategory("");
      if (decision === 'report') setReportReceipt({ owner: demo ? 'demo-' + sampleSession : token, reference: proposal.id, demo });
      feedback('success');
      if (decision !== "accept") go("main");
      setNotice(
        decision === "report"
          ? demo
            ? "عُرضت طريقة الإبلاغ في التجربة."
            : "تم إرسال البلاغ للمراجعة."
          : decision === "block"
            ? "تم حظر هذا الترشيح."
            : decision === "pass"
              ? "تم تسجيل اعتذارك."
              : "سُجّل قبولك.",
      );
    });
  }
  function togglePause() {
    void run(async () => {
      const wasPaused = demo ? samplePaused : Boolean(live?.user.paused);
      if (demo) {
        if (!samplePaused && effectiveSampleStatus !== 'mutual') {
          setSampleIndex((i) => i + 1);
          setSampleStatus("pending");
        }
        setSamplePaused((p) => !p);
      } else await update("/settings", "PATCH", { paused: !live?.user.paused });
      feedback('selection');
      go(view === "settings" ? "settings" : "main");
      setNotice(wasPaused ? 'استؤنفت الترشيحات.' : 'توقفت الترشيحات وأُخفي ملفك عن الطلبات الجديدة. إيقاف الترشيحات لا يلغي اشتراك Apple.');
    });
  }
  function deleteAccount() {
    void run(async () => {
      const t = tokenRef.current;
      if (!t) return;
      if (liveDraftOwner.current) await clearSavedIntake(liveDraftOwner.current);
      await request("/me", "DELETE", t);
      if (cloudSelected) await cloudLogout().catch(() => {});
      else await clearSession();
      remember(null, true);
      setLive(null);
      setConfirm(null);
      go("main");
      setNotice("تم حذف حسابك.");
    });
  }
  const sample = useMemo(() => demo ? demoProposals(sampleProfile)[sampleIndex] : null, [demo, sampleProfile, sampleIndex]);
  // Requested test acceptance for Reem (31), scoped to Abdulrahman's private preview.
  const effectiveSampleStatus = tester?.actor === 'abdulrahman' && sampleProfile.gender === 'man' && sample?.id === 'sample-1'
    ? 'mutual' : sampleStatus;
  const proposal: Proposal | null = demo
    ? sample && (!samplePaused || effectiveSampleStatus === 'mutual')
      ? {
          ...sample,
          status: effectiveSampleStatus,
          ...(effectiveSampleStatus === "mutual"
            ? { contact: "عضو توضيحي · قناة تواصل افتراضية" }
            : {}),
        }
      : null
    : toProposal(live?.introduction || null);
  const curatedOwner = demo ? "demo-" + sampleSession : token;
  useEffect(() => {
    const previous = curatedPrevious.current;
    if (active && !paused && proposal?.status === "mutual" && previous?.owner === curatedOwner &&
        previous.id === proposal.id && previous.status !== "mutual") {
      setCuratedMatch({ owner: curatedOwner, id: proposal.id, name: proposal.alias });
    } else if (!active || paused || proposal?.status !== "mutual" || previous?.owner !== curatedOwner || previous?.id !== proposal?.id) {
      setCuratedMatch(null);
    }
    curatedPrevious.current = { owner: curatedOwner, id: proposal?.id, status: proposal?.status };
  }, [curatedOwner, proposal?.id, proposal?.status, proposal?.alias, active, paused]);
  function dismiss() {
    if (!busy) {
      setConfirm(null);
      setReason("");
    }
  }
  const membership = (back: () => void) => (
    <Membership
      measurementOwner={token ?? undefined}
      openGifts={giftingAvailable?()=>openGifts():undefined}
      giftAttention={giftAttention}
      back={back}
      active={active}
      currentTier={tier}
      initialPlan={requestedPlan}
      gender={(demo?sampleProfile:live?.profile)?.gender}
      currency={demo?"SAR":price?.gender===live?.profile?.gender?price?.currency:undefined}
      trialEligible={price?.gender===live?.profile?.gender&&price?.trialEligible}
      demo={demo}
      price={demo ? membershipPriceLabel(sampleProfile.gender) : price?.gender===live?.profile?.gender ? price?.price??null : null}
      pilotEligible={Boolean(!demo && live?.testingTrial?.eligible)} startPilot={()=>void run(async()=>{
        const owner=tokenRef.current;
        if(!owner)return;
        await callRpc('marriage_accept_testing_trial',{offer_version:'testing-7d-12999-v1'},owner);
        await refresh(owner);
      })}
      period={price?.gender===live?.profile?.gender?price?.period:undefined} introduction={price?.gender===live?.profile?.gender?price?.introduction:undefined} status={live?.membership.status}
      giftUntil={live?.currentGiftUntil}
      memberGiftUntil={live?.currentMemberGiftUntil}
      promotion={price?.gender===live?.profile?.gender?price?.promotion:undefined}
      expiry={live?.membership.expiresAt ?? null}
      canStart={Boolean(live?.membership.canStart)}
      sandboxCheckout={Boolean(price?.gender===live?.profile?.gender && price?.sandboxCheckout)}
      priceFailed={priceFailed}
      offerRevision={offerRevision}
      canBuy={ios}
      busy={busy}
      buy={(plan,offer) => verifyPurchase(false,plan,offer)}
      restore={() => verifyPurchase(true)}
      manage={() =>
        void run(async () => {
          await manageMembership();
        })
      }
      refresh={() =>
        void run(async () => {
          if (token) await refresh(token);
          setOfferRevision(revision=>revision+1);
        })
      }
      onPolicy={() => setPolicy(true)}
    />
  );
  const Application = demo && newDemoIntake && warmIntake ? warmIntake : LazyIntake;
  const Community = warmCommunity ?? LazyCommunity;
  let screen: ReactNode;
  let publicationScreen: string = view;
  if (loading)
    screen = (
      <div className="loading-stage">
        <div className="wudayn-opening-brand"><img className="nf-opening-logo" src="/brand/wudayn-emblem-v2.png" alt="" /><BrandWordmark /></div>
        <div className="nf-opening-caption">
          <strong>توافق ذكي للزواج</strong>
          <span role="status">جارٍ فتح التطبيق…</span>
        </div>
        <img className="nf-opening-horizon" src="/brand/nisfayn-horizon.svg" alt="" />
      </div>
    );
  else if (socialPending) {
    publicationScreen = 'register';
    screen = <SocialOnboarding initialReceipt={socialPending.initialReceipt} email={socialPending.email} userId={socialPending.userId} busy={busy} onComplete={finishSocialOnboarding} onLogout={() => void run(async () => { await cloudLogout(); setSocialPending(null); go('login'); })} onPrivacy={() => setPolicy(true)} />;
  }
  else if (token && !live && !demo)
    screen = (
      <Frame title="حسابي" back={signOut}>
        <h1>استعادة الجلسة</h1>
        <p className="flow-intro">أعد الاتصال بالخدمة لعرض حسابك.</p>
        <button
          className="f-primary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await refresh(token);
            })
          }
        >
          إعادة المحاولة
        </button>
        <button className="f-link centered" onClick={signOut}>
          تسجيل الخروج
        </button>
      </Frame>
    );
  else if (view === "login" || view === "register")
    screen = (
      <Auth
        key={view}
        login={view === "login"}
        back={() => welcomeNavigation(() => go("main"), "back", welcomeFocus.current)}
        switchMode={() => go(view === "login" ? "register" : "login")}
        submit={signIn}
        onSocial={signInSocial}
        onPhoneVerified={phoneSignedIn}
        busy={busy}
        ready={serviceReady}
        onDemo={startDemo}
        onPrivacy={() => setPolicy(true)}
      />
    );
  else if (!demo && !live) {
    publicationScreen = 'welcome';
    screen = (
      <Welcome
        skipOpening={guideClosedHere} onGuide={()=>{window.scrollTo({top:0,behavior:'instant'});setGuideReplayed(true);}}
        onRegister={() => leaveWelcome("register")}
        onLogin={() => leaveWelcome("login")}
        onDemo={() => leaveWelcome("demo")}
        onDemoIntake={() => leaveWelcome("intake")}
        onPrivacy={() => { welcomeIntent.current++; setNotice(""); setPolicy(true); }}
      />
    );
  }
  else if (view === "settings")
    screen = (
      <Settings key={tester?.session ?? (demo?'demo':live?.user.id)} source={source} testerSession={tester?.session}
        onTestMembership={tier=>void run(async()=>{
          const owner=tokenRef.current;if(!owner)return;
          const seq=++version.current;
          const state=await callRpc<AccountState>('marriage_test_membership',{selected_tier:tier},owner);
          acceptLive(state,owner,seq);
        })}
        completionEntry={completionEntry}
        onProfileChanged={() => { if (token) void run(async () => { await refresh(token); }); }}
        state={live}
        demoMember={demo ? sampleProfile : undefined}
        onTryOnboarding={demo?()=>setOnboardingPreview(true):undefined}
        previewPhoto={tester?.actor === 'abdulrahman' && sampleProfile.gender === 'man' ? '/demo/portraits/tester-shemagh.webp' : undefined}
        paused={demo ? samplePaused : Boolean(live?.user.paused)}
        demo={demo}
        onBack={memberAccess ? undefined : () => go("main")}
        onMembership={()=>openMembership()}
        onEdit={() => {setApplicationChapter(undefined);go("application");}}
        onBeena={demo||cloud ? ()=>{setApplicationChapter('beena');go('application');}:undefined}
        onToggle={togglePause}
        onExit={signOut}
        onDelete={() => setConfirm("delete")}
        onPrivacy={() => setPolicy(true)}
        busy={busy}
      >
        {memberAccess && <MemberTabs source={source} active="settings" onHome={() => go("curated")}
          onDiscover={source ? () => go("discover") : undefined}
          onInbox={source ? () => go("inbox") : undefined} onChats={source ? () => go("chats") : undefined}
          chatUnread={chatUnread} onAccount={openAccount} />}
      </Settings>
    );
  else if (waitingForLaunch && live && token && view !== "application" && live.user.applicationStatus !== "draft") {
    publicationScreen = 'prelaunch';
    screen = <RegistrationWait key={token} owner={token} subscribed={live.prelaunch?.subscribed === true} onSettings={openAccount} onRefresh={() => refresh(token,true)}/>;
  }
  else if(view==='gifting' && giftingAvailable && token){
    publicationScreen='membership';
    screen=<GiftMembership key={token} owner={token} target={giftRoute.target} attention={giftAttention}
      back={()=>go(giftRoute.from)} settle={settleGift} refreshAccount={()=>refresh(token,true)}/>;
  }
  else if (view === "membership" && !waitingForLaunch && (active || accepted || live?.user.profileReviewPending))
    screen = membership(() => go(returnFromMembership));
  else if (!demo && cloud && token && live?.user.applicationStatus === 'draft' && !currentRegistrationReceipt(accountAgreements)) {
    publicationScreen = 'register';
    screen = accountAgreements === undefined ? <p className="flow-note" role="status">جارٍ فتح طلب العضوية…</p> :
      <CompleteRegistrationAgreements key={token} owner={token} onPrivacy={() => setPolicy(true)} onBack={openAccount}
        onSaved={receipt => setEntryReceipt({ owner: token, value: receipt })}/>;
  }
  else if (!demo && cloud && token && live?.user.applicationStatus === 'draft' && notificationSetupOwner!==token) {
    publicationScreen='register';
    screen=<NotificationSetup key={token} owner={token} onDone={completeNotificationSetup} onExit={signOut}/>;
  }
  else if (view === "application" || (!demo && live?.user.applicationStatus === "draft")) {
    publicationScreen = 'application';
    screen = (
      <Application
        key={demo ? 'demo-'+sampleSession : live?.user.id}
        startAt={demo ? newDemoIntake ? undefined : applicationChapter : live?.profile || supportField?.owner===live?.user.id ? applicationChapter : undefined}
        supportField={supportField && !demo && supportField.owner===live?.user.id && applicationChapter===supportField.chapter ? supportField.field : undefined}
        initial={demo ? (newDemoIntake ? null : sampleProfile) : live?.profile ?? null}
        preview={demo && newDemoIntake}
        exitPreview={demo && newDemoIntake ? exitDemo : undefined}
        demo={demo} draftRef={intakeDraft}
        draftOwner={demo ? 'demo-'+sampleSession : live?.user.id}
        defaultContact={demo ? undefined : live?.user.email ?? undefined}
        interviewAuth={tester ? {testSession:tester.session} : !demo && token ? {token} : null}
        accountAgreements={accountAgreements}
        previouslyApproved={!demo && (accepted || Boolean(live?.user.profileReviewPending))}
        nextPublicProfileEditAt={live?.user.nextPublicProfileEditAt}
        profileReviewPending={Boolean(live?.user.profileReviewPending)}
        busy={busy}
        save={saveApplication}
        portraitSource={source}
        back={openAccount}
        onPrivacy={() => setPolicy(true)}
        includeCompatibility={demo || Boolean(cloud)}
      />
    );
  }
  else if (!demo && !accepted && !live?.user.profileReviewPending) {
    publicationScreen = 'pending';
    screen = (
      <Pending
        back={openAccount}
        retryPhoto={pendingPhoto ? retryPortrait : undefined}
        refresh={() =>
          void run(async () => {
            if (token) await refresh(token);
          })
        }
        busy={busy}
      />
    );
  }
  else if (view === "membership")
    screen = membership(() =>
      view === "membership" ? go(returnFromMembership) : openAccount(),
    );
  else if ((view === "main" || view === "curated" || view === "discover" || view === "inbox" || view === "chats") && source) {
    publicationScreen = view === 'main' ? 'discover' : view;
    screen = (
      <Community
        pushOwner={tester ? "tester:" + tester.session : !demo ? token : null}
        viewerGender={(demo ? sampleProfile : live?.profile)?.gender}
        key={demo ? "walkthrough-" + sampleSession : token}
        tab={view === "main" ? "discover" : view}
        profileSaved={fromIntake}
        beenaAnswered={beenaProgress((demo?sampleProfile:live?.profile)?.beena).answered}
        onBeena={()=>{setApplicationChapter('beena');go('application');}}
        onCompletion={() => { setCompletionEntry(value => value + 1); go('settings'); }}
        profileReviewPending={Boolean(live?.user.profileReviewPending)}
        source={source}
        onMutual={mutual.announce}
        openConversation={conversationIntent?.source === source && !conversationIntent.requestOnly ? conversationIntent.id : undefined}
        openRoom={conversationIntent?.source===source?conversationIntent.roomId:undefined}
        openAnalysis={conversationIntent?.source===source&&conversationIntent.analysis}
        openAgreement={conversationIntent?.source===source&&conversationIntent.agreement}
        openMessage={conversationIntent?.source === source ? conversationIntent.messageId : undefined}
        openRequest={conversationIntent?.source === source && conversationIntent.requestOnly ? conversationIntent.id : undefined}
        onConversationOpened={clearConversationIntent}
        onTab={go}
        onHome={() => go("curated")}
        onAccount={openAccount}
        onChats={() => go("chats")} chatUnread={chatUnread}
        paused={demo ? samplePaused : Boolean(live?.user.paused)}
        onResume={togglePause}
      />
    );
  } else if (view === "proposal" && proposal)
    screen = (
      <>
        <ProposalDetail
          proposal={proposal}
          onBack={() => go("curated")}
          onInterested={() => decide("accept")}
          onPass={() => setConfirm("pass")}
          onBlock={() => setConfirm("block")}
          onReport={() => {
            setReason("");
            setReportCategory("");
            setConfirm("report");
          }}
          busy={busy}
        />
        {demo && effectiveSampleStatus === "interested" && (
          <div className="demo-simulate">
            <button
              className="f-secondary"
              onClick={() => {
                setSampleStatus("mutual");
                setNotice("محاكاة توضيحية لقبول الطرف الآخر.");
              }}
            >
              محاكاة قبول الطرف الآخر
            </button>
          </div>
        )}
      </>
    );
  else
    screen = (
      <Home
        source={source}
        proposal={proposal}
        paused={demo ? samplePaused : Boolean(live?.user.paused)}
        onOpen={() => go("proposal")}
        onAccount={openAccount}
        onSubscription={()=>openMembership()}
        onResume={togglePause}
        onDiscover={source ? () => go("discover") : undefined}
        onInbox={source ? () => go("inbox") : undefined}
        onChats={source ? () => go("chats") : undefined} chatUnread={chatUnread}
      />
    );
  const deviceOfferOwner = tester ? 'tester:' + tester.actor : !demo && token && live ? live.user.id : null;
  if(showArrivalGuide) screen=<FeatureOverview close={closeArrivalGuide}/>;
  if(onboardingPreview)screen=<OnboardingSandbox close={()=>{setOnboardingPreview(false);window.scrollTo(0,0);}}/>;
  const showMembershipNotices = !demo && !loading && !socialPending && !showArrivalGuide && Boolean(live);
  const giftReceipt = showMembershipNotices && !receiptDismissed ? membershipReceipt : null;
  return (
    <MembershipAccess.Provider value={{premium:active,tier,demo,connectionLimit:live?.membership.connectionLimit??(active?2:1),upgrade:openMembership,gift:giftingAvailable?openGifts:undefined,giftAttention}}>
    {ios && deviceOfferOwner && canShowArrivalPrompt && !showArrivalGuide && !giftReceipt && !dismissedReceipts.length &&
      <DeviceUnlockOffer key={deviceOfferOwner} owner={deviceOfferOwner}/>}
    <SupportProvider key={demo ? 'demo-' + sampleSession : token} source={supportSource} onReview={live?.user.id && !demo ? (chapter,field)=>{setSupportField({owner:live.user.id,chapter,field});setApplicationChapter(chapter);go("application");} : undefined}>
    <VoiceCallsProvider key={`${demo ? "demo-" + sampleSession : token}-${memberAccess}`}
      source={memberAccess ? source : null} owner={demo ? null : token} demo={demo && !tester} testApi={memberAccess?pair?.voice:undefined}>
    <div className="phone-app" dir="rtl" lang="ar" data-from-intake={fromIntake || undefined}>
      {tester && !onboardingPreview && !showArrivalGuide && <details className="nf-tester-tools">
        <summary aria-label="أدوات الاختبار الخاص" className="nf-simulation-toggle"><span>إعدادات الحساب</span><ChevronDown size={16} aria-hidden="true" /></summary>
        <div className="nf-tester-drawer">
          <div className="nf-tester-bar"><strong>{tester.actor==='reham'?'رهام':'عبدالرحمن'} · اختبار خاص</strong><span>الرسائل والمكالمات مشتركة بينكما</span><select aria-label="نوع الملفات في التجربة" value={sampleProfile.gender} onChange={e=>changeDemoPool(e.target.value as Profile['gender'])}><option value="man">ملفات النساء</option><option value="woman">ملفات الرجال</option></select>{tester.actor==='abdulrahman'&&<button onClick={()=>void run(async()=>{await pair!.reset();go('chats');})}>إعادة فتح التعارف</button>}<button onClick={exitDemo}>خروج</button></div>
        </div>
      </details>}
      {pendingPhoto && (memberAccess || waitingForLaunch || view === 'settings') && <div className="feedback" role="status">
        <span>حُفظ ملفك. بقي إكمال خطوة الصورة.</span>
        <button type="button" onClick={retryPortrait} disabled={busy}>إعادة محاولة حفظ الصورة</button>
      </div>}
      {error && (
        <div className="feedback error" role="alert">
          {error}
          <button aria-label="إغلاق التنبيه" onClick={() => setError("")}>
            <X size={17} />
          </button>
        </div>
      )}
      {showMembershipNotices&&live&&<MembershipChangeNotice key={live.user.id} tier={tier} receipt={giftReceipt}
        ack={id=>setDismissedReceipts(previous=>previous.includes(id)?previous:[...previous,id])}/>}
      {notice && (
        <div className="feedback" role="status">
          {notice}
          <button aria-label="إغلاق الإشعار" onClick={() => setNotice("")}>
            <X size={17} />
          </button>
        </div>
      )}
      {!demo && cloudSelected && token && !socialPending && <ConductCenter key={token} owner={token}/>}
      <PublicationCenter key={demo?'demo':token??'public'} enabled={!showArrivalGuide && !demo && !tester && !loading && cloudSelected} owner={token} screen={publicationScreen}
        openedId={publicationOpen?.owner===token?publicationOpen.id:null} onConsumed={()=>setPublicationOpen(null)} navigate={go}>
        <Suspense fallback={<RoutePlaceholder form={view === 'application' || onboardingPreview}/>}>
          {screen}
          <MemberRouteArrival view={view} pending={routeDirection}/>
        </Suspense>
      </PublicationCenter>

      {source && memberAccess && !paused && !onboardingPreview && !showArrivalGuide && !(demo && newDemoIntake && view === 'application') && <ActivityAlerts pushOwner={tester ? 'tester:'+tester.session : !demo ? token : null} source={source} celebrationsBlocked={Boolean(mutual.match || curatedMatch || policy || confirm || view === 'application')} onNotifications={() => go('inbox')} onOpen={id => {
        setConversationIntent({ source, id }); go('chats');
      }}/>}
      {memberAccess && mutual.match && !policy && !confirm && !onboardingPreview && view !== "application" && (
        <MatchCelebration key={mutual.match.id} name={mutual.match.person.alias}
          onClose={() => mutual.dismiss(mutual.match!.id)}
          onContinue={() => {
            if (!source || !mutual.match) return;
            setConversationIntent({ source, id: mutual.match.id });
            mutual.dismiss(mutual.match.id);
            go("chats");
          }} />
      )}
      {memberAccess && !mutual.match && curatedMatch?.owner === curatedOwner && curatedMatch?.id === proposal?.id && curatedMatch && active && !paused &&
        !policy && !confirm && !onboardingPreview && view !== "application" && (
        <MatchCelebration key={curatedMatch.id} name={curatedMatch.name} continueLabel="عرض التعارف"
          onClose={() => setCuratedMatch(null)}
          onContinue={() => { setCuratedMatch(null); go("proposal"); }} />
      )}
      {policy && (
        <Modal title="الخصوصية وشروط العضوية" close={() => setPolicy(false)}>
          <Policy />
        </Modal>
      )}
      {confirm && (
        <Modal
          title={
            {
              pass: "الاعتذار عن الترشيح",
              block: "حظر هذا العضو",
              report: "الإبلاغ عن الترشيح",
              delete: "حذف حسابك",
            }[confirm]
          }
          close={dismiss}
        >
          <p>
            {confirm === "delete"
              ? memberAr.deleteWarning
              : confirm === "pass"
                ? "سيُغلق هذا الترشيح بعد تأكيد اعتذارك."
                : confirm === "block"
                  ? "سيُغلق الترشيح، ولن نقترح هذا العضو عليك مجددًا."
                  : "اختر سبب البلاغ ليتمكن الفريق من مراجعته. إضافة التفاصيل اختيارية؛ لا تحتاج إلى شرح قرارك للطرف الآخر. سيُغلق هذا الترشيح بعد الإبلاغ."}
          </p>
          {confirm === "report" && (<>
            <label className="nf-report-label">سبب البلاغ<select value={reportCategory} onChange={event => setReportCategory(event.target.value)} disabled={busy}>
              <option value="">اختر السبب</option>{['إساءة أو ضغط غير مرغوب', 'انتحال أو معلومات مضللة', 'طلب مال أو اشتباه احتيال', 'مشاركة معلومات أو صور دون إذن', 'مشكلة أخرى'].map(category => <option key={category}>{category}</option>)}
            </select></label>
            <label className="nf-report-label">تفاصيل إضافية · اختياري<textarea
              className="report-input"
              rows={3}
              maxLength={440}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
            /></label>
            <p>يصل السبب وما تكتبه إلى الفريق للمراجعة. لا تُرفق بيانات هوية أو معلومات لا تتعلق بالمشكلة. انتظر تأكيد الإرسال؛ لا يوجد وقت استجابة محدد معلن.</p>
            <SupportContact subject="مساعدة بشأن بلاغ في وُدَين" />
          </>)}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button
            className="f-primary"
            disabled={
              busy || (confirm === "report" && !reportCategory)
            }
            onClick={() =>
              confirm === "delete"
                ? deleteAccount()
                : decide(confirm, confirm === 'report' ? [reportCategory, reason.trim()].filter(Boolean).join('\n') : reason.trim())
            }
          >
            {confirm === "delete"
              ? memberAr.deleteAccount
              : confirm === "report"
                ? "إرسال البلاغ"
                : "تأكيد"}
          </button>
          <button className="f-link centered" onClick={dismiss} disabled={busy}>
            رجوع
          </button>
        </Modal>
      )}
      {reportReceipt && reportReceipt.owner === (demo ? 'demo-' + sampleSession : token) && <Modal title={reportReceipt.demo ? 'تجربة الإبلاغ' : 'تم إرسال البلاغ'} close={() => setReportReceipt(null)}>
        <p>{reportReceipt.demo ? 'هذه معاينة للبلاغ؛ لم يُرسل إلى الفريق.' : 'وصل البلاغ للمراجعة وأُغلق هذا الترشيح. تأكيد الإرسال لا يعني صدور قرار، ولا يوجد وقت استجابة محدد معلن.'}</p>
        {!reportReceipt.demo && <p>معرّف الترشيح للمتابعة: <bdi>{reportReceipt.reference}</bdi></p>}
        <SupportContact subject="متابعة بلاغ في وُدَين" context={reportReceipt.demo ? undefined : `معرّف الترشيح: ${reportReceipt.reference}`} />
        <button className="f-primary" onClick={() => setReportReceipt(null)}>فهمت</button>
      </Modal>}
    </div>
    </VoiceCallsProvider>
    </SupportProvider>
    </MembershipAccess.Provider>
  );
}
