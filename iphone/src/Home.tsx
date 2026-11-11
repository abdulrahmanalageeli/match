import {
  ArrowLeft,
  ArrowRight,
  Ban,
  BriefcaseBusiness,
  Check,
  ChevronLeft,
  CirclePause,
  Compass,
  Flag,
  Heart,
  LockKeyhole,
  Bell,
  MapPin,
  MessageCircle,
  ShieldCheck,
  BookOpen,
  Navigation2,
  Settings2,
  WalletCards,
} from "./BrandIcons";
import type { Proposal } from "./types";
import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Brand } from "./Brand";
import { FitDetails } from "./compatibility/FitDetails";
import { useDevicePreferences, useSystemReducedMotion } from "./settings/preferences";
import "./home.css";

type HomeProps = {
  proposal: Proposal | null;
  onOpen: () => void;
  onAccount: () => void;
  onSubscription: () => void;
  paused: boolean;
  onResume: () => void;
  onDiscover?: () => void;
  onInbox?: () => void;
  onChats?: () => void;
  chatUnread?: number;
};

type DetailProps = {
  proposal: Proposal;
  onBack: () => void;
  onInterested: () => void;
  onPass: () => void;
  onReport: () => void;
  onBlock: () => void;
  busy?: boolean;
};

const statuses = {
  pending: "ترشيح جديد",
  interested: "تم إرسال اهتمامك",
  mutual: "اهتمام متبادل",
};

const arabicNumber = new Intl.NumberFormat("ar-SA");
const arabicDate = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Asia/Riyadh",
});

let profileTransition: ViewTransition | undefined;

function navigateProfile(button: HTMLButtonElement, navigate: () => void, focusSelector: string) {
  const root = document.documentElement;
  const changeScreen = () => {
    if (!button.isConnected) return;
    flushSync(navigate);
    document.querySelector<HTMLElement>(focusSelector)?.focus({ preventScroll: true });
  };
  if (!document.startViewTransition || document.hidden || root.dataset.nfMotion === "reduced" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    profileTransition?.skipTransition();
    changeScreen();
    return;
  }

  profileTransition?.skipTransition();
  root.dataset.nfProfileTransition = "";
  const transition = document.startViewTransition(() => {
    changeScreen();
    // Capture the destination at rest instead of layering its entrance over the moving hero.
    const page = document.querySelector(".mi-home, .mi-detail");
    for (const animation of page?.getAnimations({ subtree: true }) ?? []) {
      if (animation instanceof CSSAnimation && animation.effect?.getTiming().iterations === 1) animation.finish();
    }
  });
  profileTransition = transition;
  void transition.ready.catch(() => {}); // A rapid second tap can skip the first capture.
  const cleanUp = () => {
    if (profileTransition !== transition) return;
    delete root.dataset.nfProfileTransition;
    profileTransition = undefined;
  };
  void transition.finished.then(cleanUp, cleanUp);
}

function Metadata({ proposal }: { proposal: Proposal }) {
  return (
    <div className="mi-metadata">
      {proposal.city && (
        <span>
          <MapPin aria-hidden="true" />
          {proposal.city}
        </span>
      )}
      {proposal.occupation && (
        <span>
          <BriefcaseBusiness aria-hidden="true" />
          {proposal.occupation}
        </span>
      )}
    </div>
  );
}

function Status({ status }: { status: Proposal["status"] }) {
  return (
    <span className={`mi-status mi-status-${status}`}>
      <span className="mi-status-dot" />
      {statuses[status]}
    </span>
  );
}

function ProfileHero({ proposal }: { proposal: Proposal }) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const photo = proposal.demoPhoto?.startsWith('/demo/portraits/') && failedPhoto !== proposal.demoPhoto ? proposal.demoPhoto : undefined;
  return (
    <div className="mi-profile-hero" data-has-photo={Boolean(photo)||undefined}>
      {photo && <img className="mi-demo-portrait" src={photo} width="900" height="1125" alt={`صورة مولّدة لشخصية ${proposal.alias} التوضيحية`} decoding="async" onError={()=>setFailedPhoto(photo)}/>}
      <svg className="mi-architecture" aria-hidden="true" viewBox="0 0 170 252" fill="none" preserveAspectRatio="xMidYMax meet">
        <path fill="currentColor" opacity=".21" d="M-31 252v-79c0-57 59-68 67-123 9 55 69 66 69 123v79z" />
        <path fill="currentColor" opacity=".13" d="M40 252v-65c0-51 49-66 58-112 9 46 58 61 58 112v65z" />
        <g stroke="currentColor" strokeWidth=".9">
          <path d="M-41 252v-95c0-65 65-78 77-142 12 64 77 77 77 142v95"/>
          <path d="M-31 252v-79c0-57 59-68 67-123 9 55 69 66 69 123v79"/>
          <path d="M-20 252v-72c0-45 46-62 56-99 12 39 57 54 57 99v72"/>
          <path opacity=".75" d="M40 252v-65c0-51 49-66 58-112 9 46 58 61 58 112v65"/>
          <path opacity=".6" d="M50 252v-61c0-41 37-55 48-85 10 30 48 44 48 85v61"/>
          <path opacity=".5" d="M0 229h151m-151 5h151"/>
        </g>
        <path fill="currentColor" d="m36 9 3 6-3 6-3-6zM98 71l2 4-2 4-2-4z"/>
      </svg>
      <Status status={proposal.status} />
      <div className="mi-profile-identity">
        <h2>{proposal.alias}</h2>
        <span>{arabicNumber.format(proposal.age)} عامًا</span>
      </div>
      <Metadata proposal={proposal} />
      {photo && <small className="mi-demo-photo-label">شخصية توضيحية · صورة مولّدة</small>}
    </div>
  );
}

type TabsProps = {
  active: "home" | "discover" | "inbox" | "chats" | "settings";
  onHome?: () => void;
  onDiscover?: () => void;
  onInbox?: () => void;
  onChats?: () => void;
  chatUnread?: number;
  requestUnread?: number;
  onAccount: () => void;
};

// Each screen owns its tab bar. Hand off only the visible marker position on a tab tap.
let tabGlide: { target: string; left: number; started: number } | null = null;

export function MemberTabs({
  active,
  onHome,
  onDiscover,
  onInbox,
  onChats,
  chatUnread = 0,
  requestUnread = 0,
  onAccount,
}: TabsProps) {
  const marker = useRef<HTMLSpanElement>(null);
  const device = useDevicePreferences();
  const systemReduced = useSystemReducedMotion();
  const reduced = systemReduced || device.value.reducedMotion;
  useLayoutEffect(() => {
    const origin = tabGlide;
    tabGlide = null;
    const element = marker.current;
    if (!origin || origin.target !== active || !element?.animate || reduced ||
        document.hidden || performance.now() - origin.started > 700) return;
    const distance = origin.left - element.getBoundingClientRect().left;
    if (Math.abs(distance) < 1) return;
    const glide = element.animate(
      [{ transform: `translateX(${distance}px)` }, { transform: "translateX(0)" }],
      { duration: 225, easing: "cubic-bezier(.22,.78,.28,1)" },
    );
    return () => glide.cancel();
  }, [active, reduced]);
  const items = [
    { id: "discover", text: "استكشف", icon: Compass, open: onDiscover },
    { id: "home", text: "التعارف", icon: Heart, open: onHome },
    { id: "inbox", text: "الإشعارات", icon: Bell, open: onInbox },
    { id: "chats", text: "المحادثات", icon: MessageCircle, open: onChats },
    { id: "settings", text: "الإعدادات", icon: Settings2, open: onAccount },
  ];
  return (
    <nav className="mi-tabbar" aria-label="التنقل الرئيسي">
      {items.map(({ id, text, icon: Icon, open }) => {
        if (!open && active !== id) return null;
        const count = id === "chats" ? chatUnread : id === "home" ? requestUnread : 0;
        const unread = count > 0;
        const label = <>
          <span className="mi-tab-icon"><Icon aria-hidden="true" />{unread &&
            <b className="mi-tab-count" aria-hidden="true">{count > 99 ? "٩٩+" : arabicNumber.format(count)}</b>}</span>
          <span>{text}</span>{unread && <span className="mi-sr-only">{arabicNumber.format(count)} {id === "home" ? "طلبات تعارف بانتظار ردك" : "غير مقروءة"}</span>}
        </>;
        return active === id
          ? <span className="mi-tab mi-tab-active" key={id} aria-current="page">
              <span ref={marker} className="mi-tab-marker" aria-hidden="true" />{label}
            </span>
          : <button className="mi-tab" key={id} type="button" onClick={() => {
              const element = marker.current;
              tabGlide = element && !reduced ? {
                target: id, left: element.getBoundingClientRect().left, started: performance.now(),
              } : null;
              open?.();
            }}>{label}</button>;
      })}
    </nav>
  );
}

export function Home({
  proposal,
  onOpen,
  onAccount,
  onSubscription,
  paused,
  onResume,
  onDiscover,
  onInbox,
  onChats,
  chatUnread,
}: HomeProps) {
  return (
    <main className="app-screen mi-home" dir="rtl">
      <div className="screen-content mi-home-content">
        <header className="mi-header">
          <Brand />
          <button
            className="mi-membership-button"
            onClick={onSubscription}
            type="button"
            aria-label="العضوية"
          >
            <WalletCards size={17} aria-hidden="true" />
            <span>العضوية</span>
          </button>
        </header>
        <div className="mi-heading-row">
          <h1 className="mi-title">ترشيحاتك</h1>
          <time className="mi-date">{arabicDate.format(new Date())}</time>
        </div>
        {proposal ? (
          <>
            {paused && (
              <div className="mi-paused-note">
                <span>الترشيحات الجديدة متوقفة</span>
                <button type="button" onClick={onResume}>
                  استئناف
                </button>
              </div>
            )}
            <article className="mi-feature">
              <ProfileHero proposal={proposal} />
              {proposal.bio && <p className="mi-bio-preview">{proposal.bio}</p>}
              <button
                className="mi-feature-link"
                type="button"
                onClick={event => navigateProfile(event.currentTarget, onOpen, ".mi-detail .mi-back")}
              >
                <span>
                  {proposal.status === "mutual"
                    ? "عرض بيانات التواصل"
                    : "عرض الترشيح"}
                </span>
                <span className="mi-arrow-disc">
                  <ArrowLeft size={19} aria-hidden="true" />
                </span>
              </button>
            </article>
            {!!proposal.reasons.length && (
              <section className="mi-rationale">
                <span className="mi-rationale-icon">
                  <Navigation2 size={18} aria-hidden="true" />
                </span>
                <div>
                  <h2>سبب الترشيح</h2>
                  <p>{proposal.reasons[0]}</p>
                </div>
              </section>
            )}
          </>
        ) : (
          <section className="mi-empty">
            <div className="mi-empty-mark" aria-hidden="true">
              <img
                src="/brand/wudayn-emblem-v2.png"
                alt=""
                width="72"
                height="72"
              />
            </div>
            <div className="mi-empty-body">
              {paused ? (
                <CirclePause aria-hidden="true" />
              ) : (
                <BookOpen aria-hidden="true" />
              )}
              <h2>
                {paused ? "ترشيحاتك متوقفة مؤقتًا" : "لا يوجد ترشيح حاليًا"}
              </h2>
              <p>
                {paused
                  ? "يمكنك استئناف استقبال الترشيحات متى شئت."
                  : "سيظهر الترشيح هنا عندما يتوافق ملفان وتتوفر فرصة للتعارف."}
              </p>
              <button
                className="btn-secondary"
                type="button"
                onClick={paused ? onResume : onAccount}
              >
                {paused ? "استئناف الترشيحات" : "مراجعة ملفي"}
                <ArrowLeft size={16} aria-hidden="true" />
              </button>
            </div>
          </section>
        )}
        <div className="mi-privacy">
          <LockKeyhole size={15} aria-hidden="true" />
          <p>تظهر بيانات التواصل بعد موافقة الطرفين فقط.</p>
        </div>
      </div>
      <MemberTabs
        active="home"
        onDiscover={onDiscover}
        onInbox={onInbox}
        onChats={onChats}
        chatUnread={chatUnread}
        onAccount={onAccount}
      />
    </main>
  );
}

export function ProposalDetail({
  proposal,
  onBack,
  onInterested,
  onPass,
  onReport,
  onBlock,
  busy = false,
}: DetailProps) {
  return (
    <main className="app-screen mi-detail" dir="rtl">
      <div className="screen-content mi-detail-content">
        <header className="mi-detail-header">
          <button className="mi-back" type="button"
            onClick={event => navigateProfile(event.currentTarget, onBack, ".mi-home .mi-feature-link")}>
            <ArrowRight size={19} aria-hidden="true" />
            الترشيحات
          </button>
          <span className="mi-detail-private">
            <LockKeyhole size={14} aria-hidden="true" />
            ملف خاص
          </span>
        </header>
        <h1 className="mi-sr-only">ملف {proposal.alias}</h1>
        <div className="mi-detail-profile">
          <ProfileHero proposal={proposal} />
        </div>
        {proposal.bio && (
          <section className="mi-detail-section">
            <h2>نبذة</h2>
            <p>{proposal.bio}</p>
          </section>
        )}
        {!!proposal.interests.length && (
          <section className="mi-detail-section">
            <h2>الاهتمامات</h2>
            <div className="mi-chips">
              {proposal.interests.map((interest, i) => (
                <span key={i}>{interest}</span>
              ))}
            </div>
          </section>
        )}
        {proposal.fit && <FitDetails fit={proposal.fit} />}
        {!proposal.fit && !!proposal.reasons.length && (
          <section className="mi-detail-section">
            <h2>لماذا هذا الترشيح؟</h2>
            <ul className="mi-reasons">
              {proposal.reasons.map((reason, i) => (
                <li key={i}>
                  <Check size={16} aria-hidden="true" />
                  {reason}
                </li>
              ))}
            </ul>
          </section>
        )}
        {proposal.status === "pending" && (
          <section className="mi-decision-panel">
            <div className="mi-privacy mi-decision-note">
              <ShieldCheck size={18} aria-hidden="true" />
              <p>
                اهتمامك خاص حتى يوافق الطرف الآخر. عندها تُعرض وسيلة التواصل
                لكليكما.
              </p>
            </div>
            <button
              className="btn-primary"
              disabled={busy}
              type="button"
              onClick={onInterested}
            >
              <Heart size={18} aria-hidden="true" />
              أرغب في التعارف
            </button>
            <button
              className="mi-pass"
              disabled={busy}
              type="button"
              onClick={onPass}
            >
              تجاوز الترشيح
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
          </section>
        )}
        {proposal.status === "interested" && (
          <section className="mi-outcome">
            <Heart size={20} aria-hidden="true" />
            <div>
              <h2>اهتمامك محفوظ</h2>
              <p>ستظهر وسيلة التواصل هنا إذا وافق الطرف الآخر.</p>
            </div>
          </section>
        )}
        {proposal.status === "mutual" && (
          <section className="mi-outcome">
            <MessageCircle size={21} aria-hidden="true" />
            <div>
              <h2>وافق كلاكما على التعارف</h2>
              <p>
                {proposal.contact
                  ? "وسيلة التواصل التي اختارها الطرف الآخر"
                  : "لم يشارك الطرف الآخر وسيلة تواصل بعد."}
              </p>
              {proposal.contact && (
                <bdi className="mi-contact" dir="auto">
                  {proposal.contact}
                </bdi>
              )}
            </div>
          </section>
        )}
        <div className="mi-safety-actions">
          <button disabled={busy} type="button" onClick={onReport}>
            <Flag size={15} aria-hidden="true" />
            إبلاغ
          </button>
          <button disabled={busy} type="button" onClick={onBlock}>
            <Ban size={15} aria-hidden="true" />
            حظر
          </button>
        </div>
      </div>
    </main>
  );
}
