import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, X } from "./BrandIcons";
import { welcomeNavigation } from "./welcomeNavigation";
import { MemberPasswordRecovery } from './auth/MemberPasswordRecovery';
import { readRecoveryLink, type RecoveryLink } from './auth/passwordRecovery';
import type { SignupReturn, SignupAgreements } from './auth/signupReturn';
import "./ambient.css";
import type { PortraitDraft } from './photos/portraitPreparation';
import { LEGAL_NOTICE_VERSION } from './legal/LegalNotice';
import { SupportContact, SupportProvider } from './help/SupportContact';
import { createSupportSource } from './help/support';
import { feedback } from './feedback/haptics';
import { RoutePlaceholder } from './feedback/RoutePlaceholder';
import { Home, MemberTabs, ProposalDetail } from "./Home";
import {
  Auth,
  DemoNotice,
  Frame,
  Membership,
  Pending,
  Policy,
  Welcome,
} from "./Screens";
import { request, ServiceError, serviceReady } from "./api";
import { clearSession, readSession, saveSession } from "./session";
import {
  cloud,
  cloudSelected,
  cloudSessionId,
  cloudLogout,
  CloudError,
} from "./cloud";
import { demoProfile, demoCommunity, cloudCommunity } from "./community/data";
import { discardClosedDrafts } from "./community/chatOutbox";
import { useUnreadCount } from "./community/useUnreadCount";
import { useMutualMatches } from "./community/useMutualMatches";
import { MatchCelebration } from "./community/MatchCelebration";
import { initializeMatchSound } from "./community/matchSound";
import { usePushNotifications } from "./notifications/push";
import { ActivityAlerts } from "./notifications/ActivityAlerts";
import { VoiceCallsProvider } from "./voice/VoiceCalls";
import { pairSource, testProfile, type TestSession } from "./testing/pair";
import type { ApplicationDraft } from "./onboarding/GuidedApplication";
import type { Chapter } from "./onboarding/draft";
import { beenaProgress } from './beena/model';
import { clearSavedIntake, discardLocalIntake } from "./onboarding/persistence";
import {
  completeMembership,
  currentMembership,
  getMembershipOffer,
  isIOSBilling,
  manageMembership,
  onMembershipUpdate,
  purchaseMembership,
  restoreMembership,
} from "./billing";
import { demoProposals } from "./demo";
import { SimulationPanel } from './testing/SimulationPanel';
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
  | "application"
  | "discover"
  | "inbox"
  | "chats";
type Confirmation = "pass" | "block" | "report" | "delete" | null;
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
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      dir="rtl"
      ref={ref}
      className="action-dialog"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      aria-labelledby="dialog-title"
    >
      <header>
        <h2 id="dialog-title">{title}</h2>
        <button className="f-icon" onClick={close} aria-label="إغلاق">
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

export default function App({ recoveryLink, signupReturn, ...props }: {tester?:TestSession;onTesterExit?:()=>void;recoveryLink?:RecoveryLink|null;signupReturn?:SignupReturn|null} = {}) {
  const [recovery, setRecovery] = useState(() => recoveryLink ?? readRecoveryLink(window.location.href));
  const [returnToLogin, setReturnToLogin] = useState(false);
  // Do not mount member session restoration, chat, or discovery for recovery links.
  return recovery ? <div className="phone-app"><MemberPasswordRecovery callback={recovery} onBack={() => {
    setReturnToLogin(true); setRecovery(null);
  }}/></div> : <MemberApp {...props} startAtLogin={returnToLogin || Boolean(signupReturn)} signupReturn={signupReturn}/>;
}

function MemberApp({tester,onTesterExit,startAtLogin=false,signupReturn}:{tester?:TestSession;onTesterExit?:()=>void;startAtLogin?:boolean;signupReturn?:SignupReturn|null}={}) {
  useEffect(initializeMatchSound, []);
  const [view, setView] = useState<View>(startAtLogin ? 'login' : 'main');
  const viewRef = useRef(view);
  viewRef.current = view;
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [live, setLive] = useState<AccountState | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const inflight = useRef(false);
  const version = useRef(0);
  const refreshSequence = useRef(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(signupReturn === 'invalid'
    ? "رابط تأكيد البريد غير صالح أو انتهت صلاحيته. سجّل الدخول أو تواصل مع فريق نصفين للمساعدة."
    : signupReturn ? "سجّل الدخول لإكمال حسابك بعد تأكيد البريد الإلكتروني." : "");
  const [fromIntake, setFromIntake] = useState(false);
  const navigationVersion = useRef(0);
  const tabScroll = useRef(new Map<View, number>());
  const pendingScroll = useRef<number | null>(null);
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
  const intakeDraft = useRef<ApplicationDraft | null>(null);
  const welcomeIntent = useRef(0);
  const welcomeFocus = useRef(".nf-join");
  const liveDraftOwner = useRef<string | null>(null);
  const source = useMemo(
    () =>
      pair ? pair.source : demo
        ? demoCommunity(() => sampleProfileRef.current)
        : token && cloud
          ? cloudCommunity(token)
          : null,
    [demo, token, sampleSession, pair],
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
  const [price, setPrice] = useState<string | null>(null);
  const [returnFromMembership, setReturnFromMembership] =
    useState<View>("main");
  const active = demo || Boolean(live?.membership.active);
  const paused = demo ? samplePaused : Boolean(live?.user.paused);
  const chatUnread = useUnreadCount(active ? source : null);
  const mutual = useMutualMatches(active && !paused ? source : null);
  const [conversationIntent, setConversationIntent] = useState<{ source: NonNullable<typeof source>; id: string; requestOnly?: boolean } | null>(null);
  const clearConversationIntent = useCallback(() => setConversationIntent(null), []);
  usePushNotifications(!demo && active ? token : null, (id, kind) => {
    if (!source || demo) return;
    // A notification carries navigation intent only. The inbox re-fetches the
    // authenticated connection before it can open a profile or conversation.
    setConversationIntent({ source, id, requestOnly: kind === "request" });
    go(kind === "request" ? "inbox" : "chats");
  });
  const curatedPrevious = useRef<{ owner: string | null; id?: string; status?: Proposal["status"] } | null>(null);
  const [curatedMatch, setCuratedMatch] = useState<{ owner: string | null; id: string; name: string } | null>(null);
  useEffect(() => {
    if (!source || !active) return;
    return () => discardClosedDrafts(source, new Set());
  }, [source, active]);
  const accepted = live?.user.applicationStatus === "approved";
  const ios = isIOSBilling();

  function remember(t: string | null, draftCleared = false) {
    if (tokenRef.current !== t) {
      if (liveDraftOwner.current && !draftCleared) {
        void discardLocalIntake(liveDraftOwner.current).catch(() => {
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
    if (next === view) return;
    // Capture the outgoing tab before replacing it; never visibly scroll that page.
    window.dispatchEvent(new Event('nisfayn:before-navigation'));
    const tab = (value: View) => value === 'main' ? 'discover' : value;
    const remembered = (value: View) => ['discover', 'curated', 'inbox', 'chats', 'settings'].includes(value);
    if (remembered(tab(view)) && !document.querySelector('[data-conversation-id], .mp-profile')) tabScroll.current.set(tab(view), window.scrollY);
    pendingScroll.current = remembered(tab(next)) ? tabScroll.current.get(tab(next)) ?? 0 : 0;
    navigationVersion.current++;
    setFromIntake(false);
    setView(next);
    setError("");
    setNotice("");
  }
  useLayoutEffect(() => {
    const top = pendingScroll.current;
    if (top === null) return;
    pendingScroll.current = null;
    // Lists also restore their precise anchor after their asynchronous data load.
    window.scrollTo({ top, behavior: 'instant' });
  }, [view]);
  const atWelcome = !loading && !demo && !token && !live && view === "main";
  useEffect(() => {
    if (active && (view === "application" || view === "main") && !warmCommunity)
      void loadCommunity().catch(() => {});
  }, [active, view]);
  useLayoutEffect(() => {
    if (!fromIntake) return;
    const heading = document.querySelector<HTMLElement>(".phone-app main h1");
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  }, [fromIntake]);
  useEffect(() => {
    if (atWelcome && !warmIntake) void loadIntake().catch(() => {});
    if (atWelcome && !warmCommunity) void loadCommunity().catch(() => {});
  }, [atWelcome]);
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
  function openMembership() {
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
    if(tester){onTesterExit?.();return;}
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
        if (disposed || !t) return;
        remember(t);
        await refresh(t);
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
    return () => {
      disposed = true;
      stop?.();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
      window.removeEventListener("online", tick);
    };
  }, [token, demo, source]);
  useEffect(() => {
    if (!ios || !token || !accepted || demo) return;
    let disposed = false;
    const processing = new Set<string>();
    const sync = async (jws: string) => {
      if (disposed || tokenRef.current !== token || processing.has(jws)) return;
      processing.add(jws);
      try {
        const s = await request<AccountState>("/membership", "POST", token, {
          signedTransaction: jws,
        });
        if (!disposed && tokenRef.current === token) {
          version.current++;
          setLive(s);
          await completeMembership(jws);
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
    void currentMembership()
      .then((jws) => {
        if (jws) void sync(jws);
      })
      .catch(() => {});
    return () => {
      disposed = true;
      void cleanup.then((handle) => handle.remove()).catch(() => {});
    };
  }, [token, accepted, demo, ios]);
  useEffect(() => {
    if (!ios || !accepted || demo) return;
    let disposed = false;
    getMembershipOffer()
      .then((offer) => {
        if (!disposed) setPrice(offer.price);
      })
      .catch(() => {
        if (!disposed) setPrice(null);
      });
    return () => {
      disposed = true;
    };
  }, [ios, accepted, demo, view]);

  function signIn(email: string, password: string, consent?: SignupAgreements) {
    void run(async () => {
      const endpoint = view === "login" ? "/login" : "/register";
      const result = await request<
        | { token: string; state: AccountState; needsConfirmation?: false }
        | { needsConfirmation: true }
      >(endpoint, "POST", undefined, { email, password, consent });
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
  function saveApplication(p: Profile, portraitChange?:PortraitDraft|null, portraitPolicy?:PortraitRevealPolicy) {
    const editingExisting = demo ? !newDemoIntake : Boolean(live?.profile) && live?.user.applicationStatus !== 'draft';
    if (tester) p = { ...p, gender: tester.actor === 'reham' ? 'woman' : 'man' };
    const currentNavigation = navigationVersion.current;
    void run(async () => {
      const owner = demo ? null : liveDraftOwner.current;
      let canSeeMatches = demo && !samplePaused;
      if(pair && tester) { const saved = await pair.save(p); p = testProfile(tester.actor, saved.profiles[tester.actor]); }
      if (!demo) {
        const saved = await update("/application", "PUT", {
          ...p,
          consentVersion: p.signupConsents ? LEGAL_NOTICE_VERSION : cloud && ["marriage-v1", "marriage-v2"].includes(p.assessmentVersion ?? "") ? "2026-11-06-assessment" : "2026-11-05",
        });
        if (!saved) return;
        canSeeMatches = Boolean(cloud && saved.membership.active && saved.user.applicationStatus === "approved" && !saved.user.paused);
      }
      if(portraitChange!==undefined||(portraitPolicy!==undefined&&p.portrait&&portraitPolicy!==(p.portrait.revealPolicy??'never'))){
        try {
          if(portraitChange){if(!source?.setPortrait)throw Error('خدمة صور الملف غير متاحة.');p={...p,portrait:await source.setPortrait(portraitChange.blob,portraitChange.blur,{policy:portraitChange.revealPolicy,clearBlob:portraitChange.clearBlob})};}
          else if(portraitChange===null){await source?.removePortrait?.();p={...p,portrait:null};}
          else if(p.portrait&&portraitPolicy!==undefined){if(!source?.setPortraitPolicy)throw Error('إعداد كشف الصورة غير متاح.');p={...p,portrait:await source.setPortraitPolicy(p.portrait,portraitPolicy)};}
          if(!demo&&token)await refresh(token);
        } catch(e){throw Error('حُفظت بيانات الملف، لكن لم يُحفظ تغيير الصورة. '+(e instanceof Error?e.message:'حاول مجددًا.'));}
      }
      // Clearing the signed-in member's device draft is ordered by the vault.
      // Once the server has saved the profile, the next screen needn't wait for Keychain I/O.
      const cleanup = owner ? clearSavedIntake(owner).then(() => true, () => false) : null;
      let weeklyReady = canSeeMatches;
      if (canSeeMatches && !editingExisting && !warmCommunity) {
        try { await loadCommunity(); }
        catch { weeklyReady = false; }
      }
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
      go(editingExisting ? "settings" : weeklyReady ? "discover" : "main");
      feedback('success');
      setFromIntake(!editingExisting);
      if(editingExisting)setNotice("حُفظت تعديلات ملفك. يمكنك معاينته من الإعدادات.");
      const destination = navigationVersion.current;
      void cleanup?.then(cleared => {
        if (!cleared && navigationVersion.current === destination && liveDraftOwner.current === owner)
          setError("حُفظ ملفك، لكن تعذّر مسح المسودة من هذا الجهاز.");
      });
      if (canSeeMatches && !weeklyReady) setNotice("حُفظ ملفك. يمكنك فتح ترشيحات الأسبوع من «استكشف».");
    });
  }
  function verifyPurchase(restore: boolean) {
    void run(async () => {
      if (!live || !ios) throw new Error("الشراء متاح عبر تطبيق iPhone.");
      if (!restore && token) {
        const latest = await refresh(token);
        if (!latest?.membership.canStart)
          throw new Error("لم تفتح مجموعتك بعد. حدّث الحالة لاحقًا.");
      }
      const jws = restore
        ? await restoreMembership()
        : await purchaseMembership(live.user.appAccountToken);
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
      back={back}
      active={active}
      demo={demo}
      price={demo ? "١٢٩ ر.س." : price}
      expiry={live?.membership.expiresAt ?? null}
      canStart={Boolean(live?.membership.canStart)}
      canBuy={ios}
      busy={busy}
      buy={() => verifyPurchase(false)}
      restore={() => verifyPurchase(true)}
      manage={() =>
        void run(async () => {
          await manageMembership();
        })
      }
      refresh={() =>
        void run(async () => {
          if (token) await refresh(token);
          if (ios) setPrice((await getMembershipOffer()).price);
        })
      }
      onPolicy={() => setPolicy(true)}
    />
  );
  const Application = demo && newDemoIntake && warmIntake ? warmIntake : LazyIntake;
  const Community = warmCommunity ?? LazyCommunity;
  let screen: ReactNode;
  if (loading)
    screen = (
      <div className="loading-stage">
        <img className="nf-opening-logo" src="/brand/nisfayn-lockup.png" alt="نصفين" />
        <div className="nf-opening-caption">
          <strong>توافق ذكي للزواج</strong>
          <span role="status">جارٍ فتح التطبيق…</span>
        </div>
        <img className="nf-opening-horizon" src="/brand/nisfayn-horizon.svg" alt="" />
      </div>
    );
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
        onPhoneVerified={phoneSignedIn}
        busy={busy}
        ready={serviceReady}
        onDemo={startDemo}
        onPrivacy={() => setPolicy(true)}
      />
    );
  else if (!demo && !live)
    screen = (
      <Welcome
        onRegister={() => leaveWelcome("register")}
        onLogin={() => leaveWelcome("login")}
        onDemo={() => leaveWelcome("demo")}
        onDemoIntake={() => leaveWelcome("intake")}
        onPrivacy={() => { welcomeIntent.current++; setNotice(""); setPolicy(true); }}
      />
    );
  else if (view === "settings")
    screen = (
      <Settings source={source}
        completionEntry={completionEntry}
        onProfileChanged={() => { if (token) void run(async () => { await refresh(token); }); }}
        state={live}
        demoMember={demo ? sampleProfile : undefined}
        onTryOnboarding={demo?()=>setOnboardingPreview(true):undefined}
        previewPhoto={tester?.actor === 'abdulrahman' && sampleProfile.gender === 'man' ? '/demo/portraits/tester-shemagh.webp' : undefined}
        paused={demo ? samplePaused : Boolean(live?.user.paused)}
        demo={demo}
        onBack={active ? undefined : () => go("main")}
        onMembership={openMembership}
        onEdit={() => {setApplicationChapter(undefined);go("application");}}
        onBeena={demo||cloud ? ()=>{setApplicationChapter('beena');go('application');}:undefined}
        onToggle={togglePause}
        onExit={signOut}
        onDelete={() => setConfirm("delete")}
        onPrivacy={() => setPolicy(true)}
        busy={busy}
      >
        {active && <MemberTabs active="settings" onHome={() => go("curated")}
          onDiscover={source ? () => go("discover") : undefined}
          onInbox={source ? () => go("inbox") : undefined} onChats={source ? () => go("chats") : undefined}
          chatUnread={chatUnread} onAccount={openAccount} />}
      </Settings>
    );
  else if (view === "membership" && active)
    screen = membership(() => go(returnFromMembership));
  else if (view === "application" || (!demo && live?.user.applicationStatus === "draft"))
    screen = (
      <Application
        key={demo ? 'demo-'+sampleSession : live?.user.id}
        startAt={demo ? newDemoIntake ? undefined : applicationChapter : live?.profile ? applicationChapter : undefined}
        initial={demo ? (newDemoIntake ? null : sampleProfile) : live?.profile ?? null}
        preview={demo && newDemoIntake}
        exitPreview={demo && newDemoIntake ? exitDemo : undefined}
        demo={demo} draftRef={intakeDraft}
        draftOwner={demo ? 'demo-'+sampleSession : live?.user.id}
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
  else if (!demo && !accepted && !live?.user.profileReviewPending)
    screen = (
      <Pending
        back={openAccount}
        refresh={() =>
          void run(async () => {
            if (token) await refresh(token);
          })
        }
        busy={busy}
      />
    );
  else if (!active || view === "membership")
    screen = membership(() =>
      view === "membership" ? go(returnFromMembership) : openAccount(),
    );
  else if ((view === "main" || view === "curated" || view === "discover" || view === "inbox" || view === "chats") && source) {
    screen = (
      <Community
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
        proposal={proposal}
        paused={demo ? samplePaused : Boolean(live?.user.paused)}
        onOpen={() => go("proposal")}
        onAccount={openAccount}
        onSubscription={openMembership}
        onResume={togglePause}
        onDiscover={source ? () => go("discover") : undefined}
        onInbox={source ? () => go("inbox") : undefined}
        onChats={source ? () => go("chats") : undefined} chatUnread={chatUnread}
      />
    );
  if(onboardingPreview)screen=<OnboardingSandbox close={()=>{setOnboardingPreview(false);window.scrollTo(0,0);}}/>;
  return (
    <SupportProvider key={demo ? 'demo-' + sampleSession : token} source={supportSource}>
    <VoiceCallsProvider key={`${demo ? "demo-" + sampleSession : token}-${active}`}
      source={active ? source : null} owner={demo ? null : token} demo={demo && !tester} testApi={active?pair?.voice:undefined}>
    <div className="phone-app" dir="rtl" lang="ar" data-from-intake={fromIntake || undefined}>
      {tester && !onboardingPreview && <details className="nf-tester-tools">
        <summary aria-label="أدوات الاختبار الخاص" className={tester.actor==='abdulrahman'?'nf-simulation-toggle':undefined}>{tester.actor==='abdulrahman'&&<span>محاكاة</span>}<ChevronDown size={16} aria-hidden="true" /></summary>
        <div className="nf-tester-drawer">
        <div className="nf-tester-bar"><strong>{tester.actor==='reham'?'رهام':'عبدالرحمن'} · اختبار خاص</strong><span>الرسائل والمكالمات مشتركة بينكما</span>{tester.actor==='abdulrahman'&&<><select aria-label="نوع الملفات في التجربة" value={sampleProfile.gender} onChange={e=>changeDemoPool(e.target.value as Profile['gender'])}><option value="man">ملفات النساء</option><option value="woman">ملفات الرجال</option></select><button onClick={()=>void run(async()=>{await pair!.reset();go('chats');})}>إعادة فتح التعارف</button></>}<button onClick={exitDemo}>خروج</button></div>
        {source?.simulation && <SimulationPanel source={source} paused={paused}/>}
        </div>
      </details>}
      {demo && !tester && !onboardingPreview && <DemoNotice onExit={exitDemo} gender={sampleProfile.gender}
        onGenderChange={view === "application" ? undefined : changeDemoPool} />}
      {error && (
        <div className="feedback error" role="alert">
          {error}
          <button aria-label="إغلاق التنبيه" onClick={() => setError("")}>
            <X size={17} />
          </button>
        </div>
      )}
      {notice && (
        <div className="feedback" role="status">
          {notice}
          <button aria-label="إغلاق الإشعار" onClick={() => setNotice("")}>
            <X size={17} />
          </button>
        </div>
      )}
      <Suspense fallback={<RoutePlaceholder form={view === 'application' || onboardingPreview}/>}>{screen}</Suspense>
      {source && active && !paused && !onboardingPreview && !(demo && newDemoIntake && view === 'application') && <ActivityAlerts source={source} celebrationsBlocked={Boolean(mutual.match || curatedMatch || policy || confirm || view === 'application')} onNotifications={() => go('inbox')} onOpen={id => {
        setConversationIntent({ source, id }); go('chats');
      }}/>}
      {mutual.match && !policy && !confirm && !onboardingPreview && view !== "application" && (
        <MatchCelebration key={mutual.match.id} name={mutual.match.person.alias}
          onClose={() => mutual.dismiss(mutual.match!.id)}
          onContinue={() => {
            if (!source || !mutual.match) return;
            setConversationIntent({ source, id: mutual.match.id });
            mutual.dismiss(mutual.match.id);
            go("chats");
          }} />
      )}
      {!mutual.match && curatedMatch?.owner === curatedOwner && curatedMatch?.id === proposal?.id && curatedMatch && active && !paused &&
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
              ? "سيُحذف حسابك وملفك. إذا كان لديك اشتراك لدى Apple فألغِه من إعدادات الاشتراكات."
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
            <SupportContact subject="مساعدة بشأن بلاغ في نصفين" />
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
              ? "حذف الحساب نهائيًا"
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
        <p>{reportReceipt.demo ? 'هذه محاكاة بملف خيالي؛ لم يُرسل بلاغ حقيقي.' : 'وصل البلاغ للمراجعة وأُغلق هذا الترشيح. تأكيد الإرسال لا يعني صدور قرار، ولا يوجد وقت استجابة محدد معلن.'}</p>
        {!reportReceipt.demo && <p>معرّف الترشيح للمتابعة: <bdi>{reportReceipt.reference}</bdi></p>}
        <SupportContact subject="متابعة بلاغ في نصفين" context={reportReceipt.demo ? undefined : `معرّف الترشيح: ${reportReceipt.reference}`} />
        <button className="f-primary" onClick={() => setReportReceipt(null)}>فهمت</button>
      </Modal>}
    </div>
    </VoiceCallsProvider>
    </SupportProvider>
  );
}
