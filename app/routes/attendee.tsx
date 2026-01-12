import React, { useCallback, useEffect, useMemo, useState } from "react";
import { SlideShell } from "../components/attendee/SlideShell";
import type { AttendeeStage } from "../components/attendee/SlideShell";
import { OnboardingModal } from "../components/groups/OnboardingModal";
import { ProfessionalGameCard } from "../components/groups/ProfessionalGameCard";
import { Button } from "../components/ui/button";
import { ChevronRight, Users, Sparkles, Clock, PlayCircle } from "lucide-react";
import { HelpModal } from "../components/attendee/HelpModal";

// Lightweight helpers consisttent with existing token behavior
function getSavedToken(): string | null {
  try {
    const a = localStorage.getItem("blindmatch_result_token");
    const b = localStorage.getItem("blindmatch_returning_token");
    const s = sessionStorage.getItem("justCreatedTokenValue");
    return s || a || b || null;
  } catch {
    return null;
  }
}

function setSavedToken(val: string) {
  try {
    localStorage.setItem("blindmatch_result_token", val);
    localStorage.setItem("blindmatch_returning_token", val);
    sessionStorage.setItem("justCreatedToken", "true");
    sessionStorage.setItem("justCreatedTokenValue", val);
  } catch {}
}

function clearSavedTokens() {
  try {
    localStorage.removeItem("blindmatch_result_token");
    localStorage.removeItem("blindmatch_returning_token");
    sessionStorage.removeItem("justCreatedToken");
    sessionStorage.removeItem("justCreatedTokenValue");
  } catch {}
}

function useQueryToken() {
  const [tokenFromUrl, setTokenFromUrl] = useState<string | null>(null);
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const t = sp.get("token");
      setTokenFromUrl(t);
    } catch {}
  }, []);
  return tokenFromUrl;
}

// Compute time remaining from event state
function computeRemaining(active: boolean, startTime?: string | null, durationSec?: number | null): number {
  const duration = Number.isFinite(durationSec as any) ? (durationSec as number) : 1800;
  if (!active || !startTime) return duration;
  const started = Date.parse(startTime);
  if (!Number.isFinite(started)) return duration;
  const elapsed = Math.floor((Date.now() - started) / 1000);
  const rem = duration - elapsed;
  return rem > 0 ? rem : 0;
}

export default function AttendeeFlowRoute() {
  // Feature flag (local-only safe rollout)
  const [flagEnabled, setFlagEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem("blindmatch_attendee_flow_v1") === "true"; } catch { return false; }
  });
  useEffect(() => {
    const id = setInterval(() => {
      try { setFlagEnabled(localStorage.getItem("blindmatch_attendee_flow_v1") === "true"); } catch {}
    }, 1500);
    return () => clearInterval(id);
  }, []);

  // Participant identity after explicit confirmation
  const [secureToken, setSecureToken] = useState<string | null>(null);
  const [assignedNumber, setAssignedNumber] = useState<number | null>(null);
  const [participantName, setParticipantName] = useState<string | undefined>(undefined);

  // Event state (polled)
  const [eventState, setEventState] = useState<any>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  // Group info (fetched after user confirmation)
  const [groupInfo, setGroupInfo] = useState<{
    group_id: string;
    group_number: number;
    participant_numbers: number[];
    participant_names: string[];
    table_number: number | null;
    conversation_status?: string | null;
  } | null>(null);

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Prefer URL token, fallback to saved
  const urlToken = useQueryToken();
  useEffect(() => {
    const saved = getSavedToken();
    if (urlToken) {
      // Do not auto-resolve; just prefill for the user
      setSecureToken(urlToken);
    } else if (saved) {
      setSecureToken(saved);
    }
  }, [urlToken]);

  // Poll event state every 1s (read-only)
  useEffect(() => {
    let mounted = true;
    let id: any;
    const tick = async () => {
      try {
        const res = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get-event-state" }),
        });
        if (!res.ok) throw new Error("get-event-state failed");
        const data = await res.json();
        if (mounted) {
          setEventState(data);
          setPollError(null);
        }
      } catch (e: any) {
        if (mounted) setPollError(e?.message || "Failed to poll event state");
      } finally {
        id = setTimeout(tick, 1000);
      }
    };
    tick();
    return () => { mounted = false; if (id) clearTimeout(id); };
  }, []);

  // Derived stage (no server writes)
  const stage: AttendeeStage = useMemo(() => {
    if (!eventState) return "intro";
    const phase: string = eventState?.phase || "registration";
    const isRound = typeof phase === "string" && phase.startsWith("round_");
    if (phase === "finished") return "finished";
    if (isRound) return "rounds";
    // When in waiting or registration: treat as groups stage if participant has a group
    if (groupInfo) return "groups";
    return "intro";
  }, [eventState, groupInfo]);

  const timeRemaining = useMemo(() => {
    return computeRemaining(
      !!eventState?.global_timer_active,
      eventState?.global_timer_start_time,
      eventState?.global_timer_duration
    );
  }, [eventState]);

  // Explicit token resolve on user action (Confirm & Bind)
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const confirmAndBind = useCallback(async () => {
    if (!secureToken) return;
    setResolving(true);
    setResolveError(null);
    try {
      const res = await fetch("/api/participant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve-token", secure_token: secureToken }),
      });
      if (!res.ok) throw new Error("resolve-token failed");
      const data = await res.json();
      if (!data?.success) throw new Error("Invalid token");
      setAssignedNumber(data.assigned_number || null);
      setParticipantName(data.name || undefined);
      setSavedToken(secureToken);
    } catch (e: any) {
      setResolveError(e?.message || "Failed to resolve token");
    } finally {
      setResolving(false);
    }
  }, [secureToken]);

  // Auto navigate when entering rounds (seamless transition, but flagged)
  useEffect(() => {
    if (!flagEnabled) return;
    if (stage !== "rounds") return;
    if (!assignedNumber) return;
    const url = secureToken ? `/welcome?token=${encodeURIComponent(secureToken)}` : "/welcome";
    const t = setTimeout(() => { window.location.href = url; }, 1200);
    return () => clearTimeout(t);
  }, [flagEnabled, stage, assignedNumber, secureToken]);

  // Fetch my group (after token bound)
  const [loadingGroup, setLoadingGroup] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const loadMyGroup = useCallback(async () => {
    if (!secureToken) return;
    setLoadingGroup(true);
    setGroupError(null);
    try {
      const res = await fetch("/api/participant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-my-group", secure_token: secureToken }),
      });
      if (!res.ok) throw new Error("get-my-group failed");
      const data = await res.json();
      if (data?.success && data?.in_group && data.group) {
        setGroupInfo({
          group_id: data.group.group_id,
          group_number: data.group.group_number,
          participant_numbers: data.group.participant_numbers || [],
          participant_names: data.group.participant_names || [],
          table_number: data.group.table_number || null,
          conversation_status: data.group.conversation_status || null,
        });
      } else {
        setGroupInfo(null);
      }
    } catch (e: any) {
      setGroupError(e?.message || "Failed to load group");
    } finally {
      setLoadingGroup(false);
    }
  }, [secureToken]);

  // On first time entering groups stage after binding, show onboarding once
  useEffect(() => {
    if (stage === "groups" && secureToken && !localStorage.getItem("groups_onboarding_seen")) {
      setShowOnboarding(true);
    }
  }, [stage, secureToken]);

  // Header props derived
  const headerProps = {
    timeRemaining,
    participantName: participantName,
    participantNumber: assignedNumber,
    tableNumber: groupInfo?.table_number || null,
    groupMembers: groupInfo?.participant_names || [],
    currentGame: stage === "groups" ? "الأنشطة الجماعية" : (stage === "rounds" ? "جولة المطابقة" : undefined),
    onGoHome: () => { window.location.href = "/welcome"; },
    onShowHelp: () => { setShowHelp(true); },
  };

  // Slides
  const IntroSlide = (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-linear-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-400/30 text-cyan-200 text-xs">
          <Sparkles className="w-4 h-4" />
          <span>تجربة سلسة — من الترحيب إلى المجموعات ثم الجولات</span>
        </div>
        <h1 className="text-2xl font-extrabold text-white">مرحباً بك في BlindMatch</h1>
        <p className="text-slate-300">سنأخذك في رحلة جميلة خطوة بخطوة</p>
      </div>

      {/* Token input */}
      <div className="p-4 rounded-2xl bg-slate-800/70 border border-slate-700/60 space-y-3">
        <label className="block text-slate-300 text-sm mb-1">أدخل رمزك المميز (Token)</label>
        <input
          dir="ltr"
          value={secureToken || ""}
          onChange={(e) => setSecureToken(e.target.value)}
          placeholder="e.g. 307e7ab5bf77"
          className="w-full px-4 py-3 rounded-xl bg-slate-900/70 border border-slate-700/60 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
        />
        <div className="flex items-center justify-between">
          <Button onClick={confirmAndBind} disabled={!secureToken || resolving} className="bg-linear-to-r from-cyan-500 to-blue-600 text-white">
            {resolving ? "...جاري التأكيد" : "تأكيد ومتابعة"}
          </Button>
          <button onClick={clearSavedTokens} className="text-slate-400 hover:text-slate-200 text-sm">مسح الرمز المخزن</button>
        </div>
        {resolveError && <p className="text-red-400 text-sm">{resolveError}</p>}
        {assignedNumber && (
          <p className="text-emerald-400 text-sm">تم تأكيد الدخول كلاعب #{assignedNumber}{participantName ? ` • ${participantName}` : ''}</p>
        )}
      </div>

      {/* Next */}
      <div className="text-center">
        <button
          onClick={() => {
            if (!assignedNumber) return;
            loadMyGroup();
          }}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-200 hover:bg-slate-700/60 transition"
        >
          <Users className="w-4 h-4" />
          عرض مجموعتي
        </button>
        {groupError && <p className="text-red-400 text-sm mt-2">{groupError}</p>}
      </div>
    </div>
  );

  const GroupsSlide = (
    <div className="space-y-6">
      {showOnboarding && (
        <OnboardingModal
          isOpen={showOnboarding}
          onClose={() => setShowOnboarding(false)}
          groupMembers={(groupInfo?.participant_names || []) as string[]}
          tableNumber={groupInfo?.table_number || null}
        />
      )}

      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold text-white">الأنشطة الجماعية</h2>
        <p className="text-slate-300 text-sm">تعرف على مجموعتك وابدؤوا اللعب معاً</p>
      </div>

      {/* Mini group card */}
      <div className="p-4 rounded-2xl bg-slate-800/70 border border-slate-700/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-200">
            <Users className="w-5 h-5 text-cyan-400" />
            <span>مجموعة رقم</span>
            <span className="font-bold text-white">{groupInfo?.group_number ?? '—'}</span>
            {groupInfo?.table_number ? (
              <span className="text-cyan-400">• طاولة {groupInfo.table_number}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-slate-300 text-sm">
            <Clock className="w-4 h-4" />
            <span>الوقت المتبقي: {Math.floor(timeRemaining/60).toString().padStart(2,'0')}:{(timeRemaining%60).toString().padStart(2,'0')}</span>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(groupInfo?.participant_names || []).map((n, i) => (
            <div key={i} className="px-3 py-2 rounded-lg bg-slate-700/50 text-slate-200 text-sm">{n}</div>
          ))}
        </div>
      </div>

      {/* CTA to full groups experience */}
      <div className="text-center">
        <a href={secureToken ? `/groups?token=${encodeURIComponent(secureToken)}` : "/groups"} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-linear-to-r from-emerald-500 to-teal-600 text-white font-bold shadow-lg">
          <PlayCircle className="w-5 h-5" />
          ابدأ تجربة المجموعات الكاملة
        </a>
      </div>

      {/* Showcase cards (read-only, optional) */}
      <div className="space-y-3">
        <div className="text-slate-300 text-sm">ألعاب مقترحة:</div>
        <div className="space-y-3">
          <ProfessionalGameCard
            id="discussion-questions"
            nameAr="أسئلة للنقاش"
            descriptionAr="محادثات عميقة للتعرف على بعضكم البعض"
            icon={<Sparkles className="w-8 h-8" />}
            color="from-purple-500 to-pink-600"
            duration={30}
            onSelect={() => (window.location.href = "/groups")}
            recommended
          />
        </div>
      </div>
    </div>
  );

  const RoundsSlide = (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold text-white">جولة المطابقة</h2>
        <p className="text-slate-300 text-sm">{flagEnabled ? "سيتم الانتقال تلقائياً لوضع الجولة خلال ثوانٍ..." : "انتقل إلى وضع الجولة — الأسئلة جاهزة!"}</p>
      </div>

      <div className="p-4 rounded-2xl bg-slate-800/70 border border-slate-700/60">
        <p className="text-slate-200 text-sm">عند الضغط على الزر التالي سيتم فتح وضع الجولة في الصفحة الرئيسية.</p>
      </div>

      <div className="text-center">
        <a href={secureToken ? `/welcome?token=${encodeURIComponent(secureToken)}` : "/welcome"} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-linear-to-r from-blue-500 to-cyan-600 text-white font-bold shadow-lg">
          ابدأ الجولة الآن
          <ChevronRight className="w-5 h-5" />
        </a>
      </div>
    </div>
  );

  const FinishedSlide = (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold text-white">انتهى الحدث</h2>
        <p className="text-slate-300 text-sm">يمكنك عرض نتائجك وتقييماتك الآن</p>
      </div>

      <div className="p-4 rounded-2xl bg-slate-800/70 border border-slate-700/60">
        <p className="text-slate-200 text-sm">اضغط على الزر التالي لعرض النتائج في صفحتك الرئيسية.</p>
      </div>

      <div className="text-center">
        <a href={secureToken ? `/welcome?token=${encodeURIComponent(secureToken)}` : "/welcome"} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-linear-to-r from-emerald-500 to-teal-600 text-white font-bold shadow-lg">
          عرض النتائج
          <ChevronRight className="w-5 h-5" />
        </a>
      </div>
    </div>
  );

  return (
    <>
      <SlideShell
        stage={stage}
        headerProps={headerProps}
      >
        {stage === "intro" && IntroSlide}
        {stage === "groups" && GroupsSlide}
        {stage === "rounds" && RoundsSlide}
        {stage === "finished" && FinishedSlide}
      </SlideShell>
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} currentStage={stage} />
    </>
  );
}
