import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react"
import { GroupsPage } from "./groups"
import { useSearchParams } from "react-router"
import toast, { Toaster } from "react-hot-toast"
import { motion, AnimatePresence, Reorder } from "framer-motion"

async function fireConfetti(opts: any) {
  try {
    const confetti = (await import("canvas-confetti")).default
    confetti(opts)
  } catch {}
}
import {
  Clock, MapPin, Brain, ExternalLink,
  CheckCircle, Send, RefreshCw, Sparkles, Home, Trophy, Lock, GripVertical,
  MessageSquare, ChevronRight, Users, PenLine, Shuffle, BarChart3, GitMerge, X, Heart,
  Frown, Meh, Smile, Layers, Zap,
  Snowflake, Target, Star, Drama, AlertTriangle, Lightbulb, PartyPopper, LifeBuoy,
  EyeOff, Smartphone, Handshake, Timer, Ban, ShieldCheck, Coffee, Bell, Info,
} from "lucide-react"

import { QuestionSlideshow } from "~/components/QuestionSlideshow"

const PromptTopicsModal = lazy(() => import("~/components/PromptTopicsModal"))

const API = "/api/participant"

function call(action: string, token: string | null, extra: Record<string, any> = {}) {
  return fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, token, ...extra }),
  }).then(r => r.json())
}

// ─── "Arrived at table" tracking (sessionStorage, event-specific) ────────────
// Prevents auto-rejoin from skipping the "وصلت إلى الطاولة" step on page refresh.
// Keys are scoped per event_id so a new event never inherits a previous event's flags.
function arrivedKey(eventId: number | string | undefined, phase: string) {
  return `e3_arrived_${eventId ?? "unknown"}_${phase}`
}
function hasArrived(eventId: number | string | undefined, phase: string): boolean {
  if (typeof window === "undefined") return false
  return sessionStorage.getItem(arrivedKey(eventId, phase)) === "1"
}
function setArrived(eventId: number | string | undefined, phase: string) {
  if (typeof window === "undefined") return
  sessionStorage.setItem(arrivedKey(eventId, phase), "1")
}
function clearAllArrived() {
  if (typeof window === "undefined") return
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const k = sessionStorage.key(i)
    if (k && k.startsWith("e3_arrived_")) sessionStorage.removeItem(k)
  }
}

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
}

// ─── Sound & Vibration helpers (no external files needed) ─────────────────────
let _audioCtx: AudioContext | null = null
function getAudioCtx() {
  if (typeof window === "undefined") return null
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)() } catch { return null }
  }
  return _audioCtx
}

function playBeep(frequency: number, duration: number, volume = 0.15) {
  const ctx = getAudioCtx()
  if (!ctx) return
  try {
    if (ctx.state === "suspended") ctx.resume()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = frequency
    osc.type = "sine"
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + duration)
  } catch {}
}

function playEventStartSound() {
  playBeep(523.25, 0.15, 0.2)   // C5
  setTimeout(() => playBeep(659.25, 0.15, 0.2), 160) // E5
  setTimeout(() => playBeep(783.99, 0.25, 0.2), 320) // G5
}

function playTimerWarningSound() {
  playBeep(880, 0.12, 0.15)     // A5
  setTimeout(() => playBeep(880, 0.12, 0.15), 200)
}

function playTimerUrgentSound() {
  playBeep(1000, 0.1, 0.18)
  setTimeout(() => playBeep(1000, 0.1, 0.18), 150)
  setTimeout(() => playBeep(1000, 0.1, 0.18), 300)
}

function playSOSMessageSound() {
  playBeep(698.46, 0.1, 0.15)   // F5
  setTimeout(() => playBeep(880, 0.15, 0.15), 120) // A5
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try { navigator.vibrate(pattern) } catch {}
  }
}

// ─── Polling hook with error handling, retry, backoff, and visibility awareness ─
function useApiPoll<T>(
  fetcher: () => Promise<T>,
  options: {
    interval?: number
    maxInterval?: number
    stopWhen?: (data: T) => boolean
    enabled?: boolean
    onError?: (err: any) => void
  } = {}
) {
  const { interval = 5000, maxInterval = 60000, stopWhen, enabled = true, onError } = options
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const currentInterval = useRef(interval)
  const stopped = useRef(false)

  const fetchOnce = useCallback(async (isRetry = false) => {
    if (!enabled) return
    if (isRetry) setLoading(true)
    try {
      const d = await fetcher()
      setData(d)
      setError(null)
      currentInterval.current = interval
      if (stopWhen && stopWhen(d)) stopped.current = true
      setRetryCount(0)
    } catch (err: any) {
      const msg = err?.message || "فشل الاتصال"
      setError(msg)
      onError?.(err)
      currentInterval.current = Math.min(currentInterval.current * 1.5, maxInterval)
      setRetryCount(c => c + 1)
    } finally {
      setLoading(false)
    }
  }, [fetcher, enabled, interval, maxInterval, stopWhen, onError])

  useEffect(() => {
    if (!enabled) return
    stopped.current = false
    currentInterval.current = interval
    let timeout: ReturnType<typeof setTimeout> | null = null
    let active = true

    const tick = async () => {
      if (!active || document.hidden || stopped.current) return
      await fetchOnce()
      if (active && !stopped.current) timeout = setTimeout(tick, currentInterval.current)
    }

    fetchOnce()
    timeout = setTimeout(tick, interval)

    const onVisibility = () => {
      if (!document.hidden && !stopped.current) {
        if (timeout) clearTimeout(timeout)
        tick()
      }
    }
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      active = false
      if (timeout) clearTimeout(timeout)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [fetcher, enabled, interval, fetchOnce])

  const retry = useCallback(() => {
    setRetryCount(0)
    currentInterval.current = interval
    stopped.current = false
    fetchOnce(true)
  }, [fetcher, interval, fetchOnce])

  return { data, loading, error, retry, retryCount }
}

// ─── Shared Design Components ─────────────────────────────────────────────────

function InfoHint({ text, delay = 0.3, duration = 5 }: { text: string; delay?: number; duration?: number }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), delay * 1000)
    const t2 = setTimeout(() => setVisible(false), (delay + duration) * 1000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [delay, duration])
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="text-gray-500 text-[10px] leading-relaxed text-center px-3 py-1 bg-gray-900/40 rounded-lg border border-gray-800/40"
        >
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function PageWrapper({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-h-screen h-full bg-gray-950 relative overflow-hidden ${className}`} dir="rtl">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-20 w-[400px] h-[400px] bg-purple-600/20 rounded-full blur-[100px]" />
        <div className="absolute -bottom-24 -left-16 w-[360px] h-[360px] bg-pink-600/15 rounded-full blur-[90px]" />
        <div className="absolute top-1/2 left-1/2 w-[280px] h-[280px] bg-violet-500/10 rounded-full blur-[80px] -translate-x-1/2 -translate-y-1/2" />
      </div>
      <div className={`relative z-10 min-h-screen ${className.includes("flex") ? "flex items-center justify-center" : ""}`}>{children}</div>
    </div>
  )
}

function GlassCard({ children, className = "", glow = "" }: { children: React.ReactNode; className?: string; glow?: string }) {
  return (
    <div className={`bg-gray-900/70 backdrop-blur-md border border-gray-800/60 rounded-2xl ${glow} ${className}`}>
      {children}
    </div>
  )
}

function Brand() {
  return (
    <div className="text-center">
      <div className="inline-flex items-center gap-1.5">
        <Sparkles size={14} className="text-purple-400" />
        <span className="text-sm font-semibold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent tracking-wider">
          التوافق الأعمى
        </span>
        <Sparkles size={14} className="text-pink-400" />
      </div>
      <div className="text-[10px] text-gray-600 tracking-widest font-medium mt-0.5">VERSION 4.0</div>
    </div>
  )
}

function Spinner({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
      <RefreshCw size={size} className={`text-purple-500 ${className}`} />
    </motion.div>
  )
}

// ─── Partner Info Card ────────────────────────────────────────────────────────
function PartnerInfoCard({ data, accent = "pink" }: { data: any; accent?: "pink" | "purple" }) {
  const cl = accent === "pink"
    ? { border: "border-pink-800/30", bg: "from-pink-950/30 to-rose-950/20", text: "text-pink-300", label: "text-pink-400/70" }
    : { border: "border-purple-800/30", bg: "from-purple-950/30 to-violet-950/20", text: "text-purple-300", label: "text-purple-400/70" }

  const ageRange = (age: number | null) => {
    if (!age) return null
    if (age <= 22) return "18-22"
    if (age <= 27) return "23-27"
    if (age <= 32) return "28-32"
    if (age <= 37) return "33-37"
    return "38+"
  }

  const traits = [
    data?.partner_mbti && { icon: <Brain size={16} className={cl.text} />, label: "الشخصية", value: data.partner_mbti },
    data?.partner_communication && { icon: <MessageSquare size={16} className={cl.text} />, label: "التواصل", value: data.partner_communication },
    data?.partner_attachment && { icon: <Handshake size={16} className={cl.text} />, label: "التعلق", value: data.partner_attachment },
  ].filter(Boolean)

  if (traits.length === 0) return null

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
      className={`rounded-2xl border ${cl.border} bg-gradient-to-br ${cl.bg} p-4 space-y-3`}>
      <p className={`text-xs font-bold ${cl.label} flex items-center gap-1.5`}>
        <Sparkles size={11} /> نبذة عن شريكك
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {traits.map((t: any, i: number) => (
          <div key={i} className="flex items-center gap-2 bg-gray-900/40 rounded-xl px-3 py-2">
            <span className="text-base flex-shrink-0">{t.icon}</span>
            <div className="min-w-0">
              <p className="text-gray-600 text-[10px] leading-tight">{t.label}</p>
              <p className={`${cl.text} text-xs font-semibold leading-tight truncate`}>{t.value}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

// ─── Compatibility Breakdown ──────────────────────────────────────────────────
function CompatibilityBreakdown({ breakdown, accent = "purple", partnerName }: { breakdown: any; accent?: "pink" | "purple"; partnerName?: string }) {
  if (!breakdown) return null

  const percent = (v: number, max: number) => Math.max(0, Math.min(100, Math.round((v / max) * 100)))

  const dims = [
    { key: "synergy", label: "الانسجام التفاعلي", value: breakdown.synergy || 0, max: 35, bar: "from-violet-500 to-purple-500" },
    { key: "vibe", label: "الطاقة والكيمياء", value: breakdown.vibe || 0, max: 25, bar: "from-purple-500 to-pink-500" },
    { key: "lifestyle", label: "نمط الحياة", value: breakdown.lifestyle || 0, max: 15, bar: "from-cyan-500 to-blue-500" },
    { key: "humorOpen", label: "الدعابة/الانفتاح", value: breakdown.humorOpen || 0, max: 15, bar: "from-amber-500 to-orange-500" },
    { key: "communication", label: "التواصل", value: breakdown.communication || 0, max: 10, bar: "from-indigo-500 to-sky-500" },
    { key: "coreValues", label: "الأهداف/القيم", value: breakdown.coreValues || 0, max: 5, bar: "from-emerald-500 to-teal-500" },
  ]

  const intentDim = (breakdown.intent || 0) > 0
    ? [{ key: "intent", label: "الأهداف والتوقعات", value: breakdown.intent || 0, max: 10, bar: "from-rose-500 to-pink-500" }]
    : []
  const allDims = [...dims, ...intentDim]

  const sorted = [...allDims].sort((a, b) => percent(b.value, b.max) - percent(a.value, a.max))
  const topStrengths = sorted.filter(d => percent(d.value, d.max) >= 65).slice(0, 2)
  const growth = sorted.filter(d => percent(d.value, d.max) < 40).slice(0, 2)
  const totalPct = breakdown.total ?? percent(breakdown.synergy || 0, 35)

  const accentCl = accent === "pink" ? "text-pink-300" : "text-purple-300"

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
      className="rounded-2xl overflow-hidden border border-gray-800/60 bg-gradient-to-br from-gray-900/80 to-gray-950/80 shadow-lg">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-800/50 bg-gray-900/60">
        <h4 className={`text-base font-bold flex items-center gap-2 ${accentCl}`}>
          <BarChart3 size={16} /> تحليل التوافق
        </h4>
        <p className="text-gray-500 text-xs mt-0.5">
          هذا التحليل خاص بـ{partnerName ? ` ${partnerName}` : " هذا الشخص"} فقط — يعتمد على بيانات الاستبيان ولا يتأثر بالتقييمات
        </p>
      </div>

      {/* Synergy Overview */}
      <div className="px-5 pt-4">
        <div className="rounded-xl p-3.5 bg-gray-900/40 border border-gray-800/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-gray-200">التوافق الكلي</span>
            <span className={`text-sm font-extrabold ${totalPct >= 70 ? "text-emerald-400" : totalPct >= 50 ? "text-yellow-500" : "text-orange-500"}`}>{totalPct}%</span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-gray-800/70">
            <motion.div
              className={`h-full rounded-full bg-gradient-to-r ${totalPct >= 70 ? "from-emerald-500 to-teal-500" : totalPct >= 50 ? "from-amber-500 to-yellow-500" : "from-orange-500 to-red-500"}`}
              initial={{ width: 0 }} animate={{ width: `${totalPct}%` }} transition={{ duration: 0.8, delay: 0.4 }}
            />
          </div>

          {/* Dimension mini-bars */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3.5">
            {allDims.map((d, i) => (
              <div key={i} className="rounded-lg p-2.5 bg-gray-900/40 border border-gray-800/40">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-gray-300">{d.label}</span>
                  <span className="text-[11px] font-bold text-gray-400">{percent(d.value, d.max)}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-gray-800/70">
                  <motion.div
                    className={`h-full rounded-full bg-gradient-to-r ${d.bar}`}
                    initial={{ width: 0 }} animate={{ width: `${percent(d.value, d.max)}%` }} transition={{ duration: 0.6, delay: 0.5 + i * 0.08 }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Highlights & Growth */}
          <div className="grid grid-cols-1 gap-2.5 mt-3.5">
            {topStrengths.length > 0 && (
              <div className="bg-emerald-500/10 border border-emerald-400/30 rounded-lg p-3">
                <div className="text-[11px] font-bold mb-1 text-emerald-300">أبرز النقاط</div>
                <ul className="text-[11px] leading-relaxed text-emerald-100/80 list-disc pr-4">
                  {topStrengths.map((d, idx) => (
                    <li key={idx}>{d.label}: جانب قويّ يساعد على سهولة الانسجام.</li>
                  ))}
                </ul>
              </div>
            )}
            {growth.length > 0 && (
              <div className="bg-orange-500/10 border border-orange-400/30 rounded-lg p-3">
                <div className="text-[11px] font-bold mb-1 text-orange-300">مساحات للنمو</div>
                <ul className="text-[11px] leading-relaxed text-orange-100/80 list-disc pr-4">
                  {growth.map((d, idx) => (
                    <li key={idx}>{d.label}: قد يحتاج وقتاً للتأقلم.</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Welcome & Event Flow Onboarding ─────────────────────────────────────────
// Comprehensive first-time walkthrough. This is the SINGLE place that fully
// explains the whole event, so per-phase tutorials are reduced to one-popup
// reminders. Designed to be quick to read, animated, attractive, and skippable.
const WALK_SLIDES: { key: string; accent: keyof typeof WALK_ACCENTS; label: string }[] = [
  { key: "overview", accent: "purple",  label: "الفكرة باختصار" },
  { key: "groups",   accent: "blue",    label: "الجولات الجماعية" },
  { key: "ranking",  accent: "amber",   label: "الترتيب" },
  { key: "sessions", accent: "pink",    label: "الجلسات الفردية" },
  { key: "feedback", accent: "emerald", label: "التقييم والتواصل" },
  { key: "reveal",   accent: "violet",  label: "الكشف والتنويه" },
]

const WALK_ACCENTS = {
  purple:  { grad: "from-purple-600 via-violet-700 to-indigo-900", glow: "shadow-purple-600/40", text: "text-purple-300", chip: "bg-purple-500/15 border-purple-500/30 text-purple-300", dot: "bg-purple-400" },
  blue:    { grad: "from-blue-600 via-blue-700 to-cyan-900",       glow: "shadow-blue-600/40",   text: "text-blue-300",   chip: "bg-blue-500/15 border-blue-500/30 text-blue-300",     dot: "bg-blue-400" },
  amber:   { grad: "from-amber-500 via-orange-600 to-amber-800",   glow: "shadow-amber-500/40",  text: "text-amber-300",  chip: "bg-amber-500/15 border-amber-500/30 text-amber-300",   dot: "bg-amber-400" },
  pink:    { grad: "from-pink-600 via-rose-600 to-pink-900",       glow: "shadow-pink-600/40",   text: "text-pink-300",   chip: "bg-pink-500/15 border-pink-500/30 text-pink-300",     dot: "bg-pink-400" },
  emerald: { grad: "from-emerald-600 via-teal-700 to-emerald-900", glow: "shadow-emerald-600/40",text: "text-emerald-300",chip: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300", dot: "bg-emerald-400" },
  violet:  { grad: "from-violet-600 via-purple-700 to-indigo-900", glow: "shadow-violet-600/40", text: "text-violet-300", chip: "bg-violet-500/15 border-violet-500/30 text-violet-300", dot: "bg-violet-400" },
} as const

// A small pretend button used inside the walkthrough to show what a real control
// looks like — purely illustrative (not clickable to anything meaningful).
function DemoButton({ children, className = "", pulse = false }: { children: React.ReactNode; className?: string; pulse?: boolean }) {
  return (
    <motion.div
      animate={pulse ? { scale: [1, 1.04, 1] } : {}}
      transition={{ duration: 1.8, repeat: Infinity }}
      className={`relative pointer-events-none select-none rounded-2xl px-4 py-3 font-bold text-sm flex items-center justify-center gap-2 ${className}`}
    >
      {children}
      <span className="absolute -top-2 -left-2 bg-white text-black text-[8px] font-black px-1.5 py-0.5 rounded-full shadow">مثال</span>
    </motion.div>
  )
}

// The animated per-stage content shown inside the "steps" phase of WelcomeScreen.
function WalkSlide({ step }: { step: number }) {
  const slide = WALK_SLIDES[step]
  const ac = WALK_ACCENTS[slide.accent]

  // Ranking demo — cycle the order so people SEE the drag-to-rank behaviour.
  const [rankOrder, setRankOrder] = useState([0, 1, 2, 3])
  const [faqOpen, setFaqOpen] = useState<number | null>(null)
  useEffect(() => {
    if (slide.key !== "ranking") return
    const orders = [[0,1,2,3],[1,0,2,3],[1,2,0,3],[2,1,0,3]]
    let i = 0
    const iv = setInterval(() => { i = (i + 1) % orders.length; setRankOrder(orders[i]) }, 1200)
    return () => clearInterval(iv)
  }, [slide.key])

  const demoPeople = [
    { init: "س", color: "from-pink-500 to-rose-500" },
    { init: "ل", color: "from-blue-500 to-cyan-500" },
    { init: "ن", color: "from-violet-500 to-purple-500" },
    { init: "م", color: "from-emerald-500 to-teal-500" },
  ]
  const rankBadge = (i: number) =>
    i === 0 ? "bg-gradient-to-br from-amber-400 to-yellow-500 text-black" :
    i === 1 ? "bg-gradient-to-br from-gray-300 to-gray-400 text-black" :
    i === 2 ? "bg-gradient-to-br from-amber-700 to-amber-800 text-white" :
    "bg-gray-800 text-gray-500"

  return (
    <div className={`rounded-3xl overflow-hidden shadow-2xl ${ac.glow}`}>
      {/* Gradient header */}
      <div className={`bg-gradient-to-br ${ac.grad} px-6 pt-5 pb-4 text-center relative overflow-hidden`}>
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "26px 26px" }} />
        <div className="relative z-10 space-y-2">
          <span className="inline-block bg-white/25 backdrop-blur-sm text-white text-[10px] font-black px-3 py-1 rounded-full tracking-widest">
            {step + 1} / {WALK_SLIDES.length} · {slide.label}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="bg-gray-900/95 backdrop-blur-sm px-5 py-5 min-h-[300px]">
        {/* ── OVERVIEW ── */}
        {slide.key === "overview" && (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <h2 className="text-white font-black text-xl">كيف تسير الفعالية؟</h2>
              <p className="text-gray-400 text-xs leading-relaxed">اقرأ هذا الشرح مرة واحدة — سيغطّي كل شيء حتى لا تحتاج شرحاً لاحقاً</p>
            </div>
            <div className="space-y-2">
              {[
                { Icon: Users, c: "text-blue-400 bg-blue-500/15 border-blue-500/25", t: "جولتان جماعيتان", d: "تجلس مع مجموعات صغيرة وتتعرّف على الجميع" },
                { Icon: BarChart3, c: "text-amber-400 bg-amber-500/15 border-amber-500/25", t: "ترتيب من قابلت", d: "ترتّب من تفضّل جلسة فردية معه" },
                { Icon: Heart, c: "text-pink-400 bg-pink-500/15 border-pink-500/25", t: "جلسة اختيارك", d: "جلسة فردية مع أفضل تطابق متبادل من ترتيبك" },
                { Icon: Brain, c: "text-purple-400 bg-purple-500/15 border-purple-500/25", t: "جلسة التوافق الذكي", d: "جلسة فردية مع من يرشّحه النظام لك" },
                { Icon: Trophy, c: "text-violet-400 bg-violet-500/15 border-violet-500/25", t: "الكشف النهائي", d: "تكتشف نتائجك ومن تريد التواصل معه" },
              ].map((r, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.09 }}
                  className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-2xl px-3 py-2.5">
                  <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${r.c}`}><r.Icon size={17} /></div>
                  <div className="flex-1 text-right">
                    <p className="text-white font-bold text-[13px]">{r.t}</p>
                    <p className="text-gray-500 text-[11px] leading-snug">{r.d}</p>
                  </div>
                  <span className="text-gray-700 text-[10px] font-mono">{i + 1}</span>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* ── GROUP ROUNDS ── */}
        {slide.key === "groups" && (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <Users size={34} className="text-blue-400 mx-auto" />
              <h2 className="text-white font-black text-xl">الجولات الجماعية</h2>
              <p className="text-gray-400 text-xs leading-relaxed">جولتان تجلس فيهما مع ٤–٦ أشخاص على طاولة للتعارف</p>
            </div>
            {/* Demo table card */}
            <div className="rounded-2xl border border-blue-800/40 bg-blue-950/30 p-4 text-center space-y-2">
              <p className="text-gray-500 text-[10px] flex items-center justify-center gap-1"><MapPin size={11} /> رقم طاولتك يظهر هكذا</p>
              <div className="text-5xl font-black text-blue-300 leading-none">٧</div>
              <div className="flex flex-wrap gap-1.5 justify-center pt-1">
                {["سارة","خالد","نورة","ريان"].map((n, i) => (
                  <motion.span key={n} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 + i * 0.1 }}
                    className="bg-blue-900/40 text-blue-200 border border-blue-800/50 rounded-full px-2.5 py-0.5 text-[11px]">{n}</motion.span>
                ))}
              </div>
            </div>
            <DemoButton pulse className="w-full text-blue-200 bg-blue-900/40 border border-blue-700/40">
              <Target size={15} /> نشاطات المجموعة <ExternalLink size={13} />
            </DemoButton>
            <div className="flex items-start gap-2 bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5">
              <Shuffle size={15} className="text-cyan-400 shrink-0 mt-0.5" />
              <p className="text-gray-400 text-[11px] leading-relaxed">في الجولة الثانية ستكون المجموعة <span className="text-cyan-300 font-bold">مختلفة كلياً</span> — لن يتكرّر أحد قابلته سابقاً <span className="text-gray-500">(إلا في حالات نادرة)</span>.</p>
            </div>
          </div>
        )}

        {/* ── RANKING (the important one) ── */}
        {slide.key === "ranking" && (
          <div className="space-y-3.5">
            <div className="text-center space-y-1">
              <BarChart3 size={32} className="text-amber-400 mx-auto" />
              <h2 className="text-white font-black text-xl">رتّب من قابلت</h2>
              <p className="text-gray-400 text-xs leading-relaxed">اسحب الأسماء لترتيبهم — الأعلى = أكثر من تريد جلسة معه</p>
            </div>
            {/* Animated reorder demo */}
            <div className="space-y-1.5">
              {rankOrder.map((pi, rank) => {
                const p = demoPeople[pi]
                return (
                  <motion.div key={pi} layout transition={{ type: "spring", stiffness: 350, damping: 28 }}
                    className="flex items-center gap-2.5 bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2">
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 ${rankBadge(rank)}`}>{rank + 1}</div>
                    <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${p.color} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>{p.init}</div>
                    <span className="text-gray-300 text-xs flex-1">شخص قابلته</span>
                    <GripVertical size={13} className="text-gray-600" />
                  </motion.div>
                )
              })}
            </div>
            {/* The crucial caveat */}
            <div className="rounded-xl border border-amber-700/40 bg-amber-950/30 px-3 py-2.5 space-y-1.5">
              <p className="text-amber-300 text-[11px] font-black flex items-center gap-1.5"><AlertTriangle size={12} /> مهم جداً — كيف تُحسم الجلسة</p>
              <p className="text-amber-100/70 text-[11px] leading-relaxed">
                الجلسة تحدث فقط عند <span className="text-amber-300 font-bold">التطابق المتبادل</span>. إذا رتّبت شخصاً أولاً لكنه لم يرتّبك عالياً، قد لا تجلس معه.
              </p>
              <p className="text-gray-400 text-[11px] leading-relaxed">
                لا نضمن أن تجلس مع خياراتك الأولى — إذا لم يخترك أحد من أعلى قائمتك، سيمنحك النظام أفضل تطابق متبادل متاح لك.
              </p>
            </div>
          </div>
        )}

        {/* ── 1:1 SESSIONS ── */}
        {slide.key === "sessions" && (
          <div className="space-y-3.5">
            <div className="text-center space-y-1">
              <Users size={32} className="text-pink-400 mx-auto" />
              <h2 className="text-white font-black text-xl">جلستان فرديتان</h2>
              <p className="text-gray-400 text-xs leading-relaxed">جلستان خاصتان 1:1 — واحدة باختيارك وواحدة باختيار النظام</p>
            </div>
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 }}
              className="rounded-2xl border border-pink-700/40 bg-pink-950/30 p-3.5 flex items-center gap-3">
              <Heart size={22} className="text-pink-400 shrink-0" />
              <div><p className="text-white font-bold text-[13px]">جلسة اختيارك</p><p className="text-pink-300/80 text-[11px]">أفضل تطابق متبادل من ترتيبك</p></div>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.18 }}
              className="rounded-2xl border border-purple-700/40 bg-purple-950/30 p-3.5 flex items-center gap-3">
              <Brain size={22} className="text-purple-400 shrink-0" />
              <div><p className="text-white font-bold text-[13px]">جلسة التوافق الذكي</p><p className="text-purple-300/80 text-[11px]">النظام يرشّح لك بناءً على بياناتكما</p></div>
            </motion.div>
            {/* Demo: how you see the table + partner */}
            <div className="rounded-2xl border border-amber-700/40 bg-amber-950/25 p-3 text-center space-y-1">
              <p className="text-amber-400/70 text-[10px]">في كل جلسة سيظهر اسم شريكك ورقم طاولتك</p>
              <p className="text-white font-black text-lg leading-tight">سارة</p>
              <p className="text-amber-300 text-xs">طاولة رقم <span className="font-black">٣</span></p>
            </div>
          </div>
        )}

        {/* ── FEEDBACK & CONTACT ── */}
        {slide.key === "feedback" && (
          <div className="space-y-3.5">
            <div className="text-center space-y-1">
              <PenLine size={32} className="text-emerald-400 mx-auto" />
              <h2 className="text-white font-black text-xl">التقييم والتواصل</h2>
              <p className="text-gray-400 text-xs leading-relaxed">بعد كل جلسة تقيّم تجربتك — إجاباتك سرّية تماماً</p>
            </div>
            {/* Demo rating */}
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5 text-center space-y-2">
              <p className="text-gray-400 text-[11px]">مثال: كيف كانت المحادثة؟</p>
              <div className="flex items-center justify-center gap-1.5">
                {[0,1,2,3,4].map(i => (
                  <motion.span key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.1 + i * 0.08 }}>
                    <Star size={22} className={i < 4 ? "text-amber-400 fill-amber-400" : "text-gray-700"} />
                  </motion.span>
                ))}
              </div>
            </div>
            {/* Demo yes/no */}
            <div className="grid grid-cols-2 gap-2.5">
              <DemoButton className="text-emerald-300 bg-emerald-500/15 border border-emerald-500/40"><CheckCircle size={16} /> نعم</DemoButton>
              <DemoButton className="text-red-300 bg-red-500/10 border border-red-500/30"><X size={16} /> لا</DemoButton>
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-emerald-700/40 bg-emerald-950/30 px-3 py-2.5">
              <Heart size={15} className="text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-emerald-100/80 text-[11px] leading-relaxed">إذا قال كلاكما <span className="text-emerald-300 font-bold">«نعم»</span> — تتبادلان معلومات التواصل في صفحة النتائج. لا أحد يعرف اختيارك إلا إذا وافق الطرف الآخر.</p>
            </div>
          </div>
        )}

        {/* ── FINAL REVEAL + DISCLAIMER ── */}
        {slide.key === "reveal" && (
          <div className="space-y-3.5">
            <div className="text-center space-y-1">
              <Trophy size={32} className="text-violet-400 mx-auto" />
              <h2 className="text-white font-black text-xl">الكشف النهائي</h2>
              <p className="text-gray-400 text-xs leading-relaxed">في النهاية تكتشف نتائجك: اختيارك مقابل اختيار النظام والتوافق الكامل</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl border border-pink-700/40 bg-pink-950/30 p-3 text-center space-y-1">
                <Heart size={18} className="text-pink-400 mx-auto" /><p className="text-white font-bold text-[12px]">اختيارك</p>
              </div>
              <div className="rounded-2xl border border-purple-700/40 bg-purple-950/30 p-3 text-center space-y-1">
                <Brain size={18} className="text-purple-400 mx-auto" /><p className="text-white font-bold text-[12px]">اختيار النظام</p>
              </div>
            </div>
            {/* The compatibility disclaimer */}
            <div className="rounded-2xl border border-amber-700/40 bg-gradient-to-br from-amber-950/40 to-orange-950/20 px-3.5 py-3 space-y-1.5">
              <p className="text-amber-300 text-[11px] font-black flex items-center gap-1.5"><Info size={12} /> تنويه مهم عن التوافق</p>
              <p className="text-amber-100/80 text-[11px] leading-relaxed">
                الكيمياء بين شخصين جزء كبير لا يمكن قياسه بالكامل. نحن <span className="text-amber-300 font-bold">لا نضمن التوافق</span> — لكننا نقلّل احتمال عدم التوافق بشكل كبير عبر التحليل.
              </p>
              <p className="text-gray-400 text-[11px] leading-relaxed">
                حتى لو لم تكن النتيجة مثالية، تبقى قد عشت تجربة اختيارك بنفسك — استمتع باللقاء والتجربة أكثر من الرقم.
              </p>
            </div>

            {/* FAQ */}
            <div className="space-y-2">
              <p className="text-violet-300 text-[11px] font-black flex items-center gap-1.5"><Lightbulb size={12} /> أسئلة شائعة</p>
              {[
                { q: "ماذا لو لم يعجبني أحد؟", a: "رتّب الجميع بأي ترتيب تريده — حتى لو لم يعجبك أحد، الترتيب إلزامي لإكمال المرحلة. النظام سيمنحك أفضل تطابق متاح." },
                { q: "هل ترتيبي ظاهر للآخرين؟", a: "لا أبداً — ترتيبك وتقييماتك سرّية تماماً. لا أحد يرى اختياراتك إلا إذا حدث تطابق متبادل بـ«نعم» للتواصل." },
                { q: "هل يمكنني تعديل ترتيبي بعد الإرسال؟", a: "لا، بمجرد الإرسال يُقفل الترتيب. خذ وقتك في التقييم قبل التأكيد." },
                { q: "ماذا لو لم يخترني أحد من أعلى قائمتي؟", a: "النظام يبحث عن أفضل تطابق متبادل متاح للجميع. قد تُطابق مع شخص رتّبته في مرتبة أدنى — هذا أفضل متاح لك." },
                { q: "كم مدة كل جلسة فردية؟", a: "كل جلسة فردية مدتها ٢٠ دقيقة تقريباً. المؤقت ينبهك قبل انتهاء الوقت." },
                { q: "ماذا لو احتجت مساعدة خلال الجلسة؟", a: "زر «المنظم» في أسفل الشاشة متاح دائماً — اضغطه لأي مساعدة أو طارئ." },
                { q: "هل يمكنني التواصل مع شخص لم أجلس معه؟", a: "لا — معلومات التواصل تُتبادل فقط عند تطابق متبادل بـ«نعم» بعد جلسة فردية معاً." },
                { q: "ماذا لو قلت «لا» وندمت؟", a: "للأسف لا يمكن تغيير الإجابة بعد الإرسال. فكّر جيداً قبل الاختيار." },
              ].map((item, i) => (
                <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                  <button onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-right">
                    <span className="text-gray-300 text-[11px] font-semibold flex-1">{item.q}</span>
                    <motion.span animate={{ rotate: faqOpen === i ? 180 : 0 }} transition={{ duration: 0.2 }}
                      className="text-gray-500 shrink-0"><ChevronRight size={14} className="rotate-90" /></motion.span>
                  </button>
                  <AnimatePresence>
                    {faqOpen === i && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }} className="overflow-hidden">
                        <p className="text-gray-400 text-[11px] leading-relaxed px-3 pb-2.5">{item.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function WelcomeScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"splash" | "rules" | "steps">("splash")
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)

  const goNext = () => {
    if (step < WALK_SLIDES.length - 1) {
      setDir(1); setStep(s => s + 1)
    } else {
      onDone()
      fireConfetti({ particleCount: 90, spread: 75, origin: { y: 0.5 }, colors: ["#a855f7","#ec4899","#f43f5e","#fbbf24"] })
    }
  }
  const goPrev = () => { if (step > 0) { setDir(-1); setStep(s => s - 1) } }

  return (
    <div className="h-[100dvh] bg-gray-950 relative overflow-hidden flex flex-col" dir="rtl">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-20 w-[550px] h-[550px] bg-purple-600/20 rounded-full blur-[120px]" />
        <div className="absolute -bottom-32 -left-20 w-[500px] h-[500px] bg-pink-600/15 rounded-full blur-[100px]" />
        <motion.div
          className="absolute top-1/3 left-1/2 w-[420px] h-[420px] rounded-full blur-[110px] -translate-x-1/2 -translate-y-1/2"
          animate={{ backgroundColor: ["rgba(139,92,246,0.07)","rgba(236,72,153,0.07)","rgba(59,130,246,0.05)","rgba(139,92,246,0.07)"] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <AnimatePresence mode="wait">

        {/* ── SPLASH ─────────────────────────────────────────────────────── */}
        {phase === "splash" && (
          <motion.div
            key="splash"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.4 }}
            className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center"
          >
            {/* Logo + pulsing rings */}
            <div className="relative mb-6 flex items-center justify-center">
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  className="absolute rounded-full border border-purple-400/25"
                  style={{ width: `${110 + i * 38}px`, height: `${110 + i * 38}px` }}
                  animate={{ scale: [1, 1.18], opacity: [0.5, 0] }}
                  transition={{ duration: 2, delay: i * 0.55, repeat: Infinity, ease: "easeOut" }}
                />
              ))}
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.15 }}
                className="relative z-10 w-28 h-28 rounded-3xl bg-gradient-to-br from-purple-700 via-violet-700 to-indigo-800 flex items-center justify-center shadow-2xl shadow-purple-700/50"
              >
                <Users size={46} className="text-white" strokeWidth={1.5} />
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45, duration: 0.6 }}
              className="space-y-2 mb-6"
            >
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="flex items-center justify-center gap-2"
              >
                <Sparkles size={12} className="text-purple-400" />
                <span className="text-[11px] font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent tracking-[0.18em] uppercase">
                  التوافق الأعمى — الجيل الرابع
                </span>
                <Sparkles size={12} className="text-pink-400" />
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.65 }}
                className="text-[2.2rem] font-black text-white leading-tight"
              >
                التوافق الأعمى<br />
                <span className="bg-gradient-to-r from-purple-400 via-violet-400 to-indigo-400 bg-clip-text text-transparent">
                  الجيل الرابع
                </span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="text-gray-400 text-sm max-w-[250px] mx-auto leading-relaxed"
              >
                منهجية مبتكرة لاكتشاف مستوى التوافق بين الأشخاص بشكل موضوعي
              </motion.p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.95 }}
              className="w-full max-w-xs space-y-3"
            >
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setPhase("rules")}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-2xl py-3.5 font-black text-base shadow-2xl shadow-purple-600/30 transition-all"
              >
                كيف تسير الفعالية؟ ←
              </motion.button>
              <button
                onClick={onDone}
                className="w-full text-gray-600 text-sm py-2 hover:text-gray-500 transition-colors"
              >
                تخطّى — أدخل رمزك مباشرة
              </button>
            </motion.div>
          </motion.div>
        )}

        {/* ── RULES PHASE ─────────────────────────────────────────────── */}
        {phase === "rules" && (
          <motion.div
            key="rules"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 flex-1 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4">
              <button onClick={() => setPhase("splash")} className="flex items-center gap-1 text-gray-500 text-sm hover:text-gray-400 transition-colors">
                <ChevronRight size={15} className="rotate-180" /> رجوع
              </button>
              <span className="text-[11px] font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent tracking-wide flex items-center gap-1"><Sparkles size={11} /> قواعد الجلسة</span>
            </div>

            {/* Rules list */}
            <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-2.5">
              {[
                { icon: <EyeOff size={20} className="text-purple-400" />, title: "ابقَ أعمى", desc: "لا تكشف لأحد ترتيبك أو تقييماتك — سرية الخيارات هي جوهر الفعالية" },
                { icon: <Drama size={20} className="text-purple-400" />, title: "كن نفسك", desc: "الخوارزمية تعمل بناءً على شخصيتك الحقيقية — التمثيل يضر نتيجتك" },
                { icon: <Smartphone size={20} className="text-purple-400" />, title: "التطبيق أداتك", desc: "استخدم التطبيق للتقييم والترتيب، لكن لا تُظهِر شاشتك للآخرين" },
                { icon: <Handshake size={20} className="text-purple-400" />, title: "احترم الجلسة", desc: "الجميع هنا بنفس الهدف — تعامل بلطف واحترام مع كل من تجلس معه" },
                { icon: <Timer size={20} className="text-purple-400" />, title: "احترم الوقت", desc: "كل جلسة لها مؤقت — أنهِ المحادثة باحترام حين ينتهي الوقت" },
                { icon: <Ban size={20} className="text-purple-400" />, title: "لا إحراج", desc: "امتنع عن الأسئلة الشخصية المُحرجة أو أي تعليق يخلق إحراجاً" },
                { icon: <Lock size={20} className="text-purple-400" />, title: "النتيجة سرية حتى النهاية", desc: "لا تشارك أحداً من اخترت — الكشف يحدث في النهاية للجميع معاً" },
              ].map((rule, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.07, duration: 0.3 }}
                  className="flex items-start gap-3 bg-white/[0.04] border border-white/[0.07] rounded-2xl px-4 py-3.5"
                >
                  <span className="flex-shrink-0 mt-0.5 flex items-center justify-center w-7">{rule.icon}</span>
                  <div className="text-right">
                    <p className="text-white font-bold text-sm">{rule.title}</p>
                    <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">{rule.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* CTA */}
            <div className="px-5 pt-3 pb-5">
              <motion.button
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setPhase("steps")}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-2xl py-3.5 font-black text-base shadow-2xl shadow-purple-600/30 transition-all"
              >
                فهمت — كيف تسير الفعالية؟ ←
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ── WALKTHROUGH STEPS ─────────────────────────────────────────── */}
        {phase === "steps" && (
          <motion.div
            key="steps"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 flex-1 flex flex-col overflow-hidden"
          >
            {/* Top progress bar */}
            <div className="w-full h-1 bg-gray-800/50">
              <motion.div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                animate={{ width: `${((step + 1) / WALK_SLIDES.length) * 100}%` }}
                transition={{ duration: 0.45, ease: "easeInOut" }}
              />
            </div>

            {/* Header nav */}
            <div className="flex items-center justify-between px-5 py-4">
              <button
                onClick={() => step === 0 ? setPhase("rules") : goPrev()}
                className="flex items-center gap-1 text-gray-500 text-sm hover:text-gray-400 transition-colors"
              >
                <ChevronRight size={15} className="rotate-180" />
                {step === 0 ? "الشاشة الرئيسية" : "السابق"}
              </button>
              <span className="text-gray-600 text-xs font-mono tabular-nums">{step + 1} / {WALK_SLIDES.length}</span>
            </div>

            {/* Step card */}
            <div className="flex-1 flex flex-col items-center justify-start overflow-y-auto px-5 py-2">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  variants={{
                    enter: { opacity: 0, y: 50, scale: 0.92 },
                    center: { opacity: 1, y: 0, scale: 1 },
                    exit: { opacity: 0, y: -50, scale: 0.92 },
                  }}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                  className="w-full max-w-sm my-auto"
                >
                  <WalkSlide step={step} />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Bottom navigation */}
            <div className="px-5 pb-4 pt-2 space-y-3">
              {/* Dot indicators */}
              <div className="flex items-center justify-center gap-1.5">
                {WALK_SLIDES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => { setDir(i > step ? 1 : -1); setStep(i) }}
                    className={`rounded-full transition-all duration-300 ${
                      i === step ? "w-6 h-2 bg-white" : "w-2 h-2 bg-gray-700 hover:bg-gray-500"
                    }`}
                  />
                ))}
              </div>
              {/* Next + skip buttons */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={goNext}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-2xl py-3.5 font-black text-base shadow-xl shadow-purple-600/25 transition-all"
              >
                {step === WALK_SLIDES.length - 1 ? <span className="flex items-center justify-center gap-2">أبدأ رحلتي <Sparkles size={16} /></span> : "التالي ←"}
              </motion.button>
              {step < WALK_SLIDES.length - 1 && (
                <button
                  onClick={onDone}
                  className="w-full flex items-center justify-center gap-1.5 text-gray-500 hover:text-gray-300 text-xs font-medium transition-colors py-1"
                >
                  <X size={12} />
                  تخطّي الشرح وابدأ
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Phone Entry Screen ───────────────────────────────────────────────────────
function PhoneEntry({ onToken }: { onToken: (t: string) => void }) {
  const [phone, setPhone] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [shake, setShake] = useState(false)

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(e.target.value.replace(/[^\d+\s\-()]/g, ''))
    if (error) setError("")
  }

  const submit = async () => {
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length < 7) { setError("أدخل رقم جوال صحيح"); setShake(true); setTimeout(() => setShake(false), 500); return }
    setLoading(true); setError("")
    const d = await call("e3-login-by-phone", null, { phone: cleaned })
    setLoading(false)
    if (d.error) { setError(d.error); setShake(true); setTimeout(() => setShake(false), 500); return }
    localStorage.setItem("blindmatch_result_token", d.token)
    onToken(d.token)
  }

  return (
    <PageWrapper className="flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        className="w-full max-w-sm space-y-8 text-center"
      >
        {/* Icon */}
        <div className="space-y-5">
          <motion.div
            initial={{ scale: 0, rotate: -15 }} animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 14, delay: 0.1 }}
            className="relative w-24 h-24 mx-auto"
          >
            {[0, 1].map(i => (
              <motion.div key={i} className="absolute inset-0 rounded-3xl bg-gradient-to-br from-purple-500/30 to-pink-500/20"
                animate={{ scale: [1, 1.15 + i * 0.1], opacity: [0.5, 0] }}
                transition={{ duration: 2, delay: i * 0.7, repeat: Infinity, ease: "easeOut" }} />
            ))}
            <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-br from-purple-700 via-violet-700 to-indigo-800 flex items-center justify-center shadow-2xl shadow-purple-700/50">
              <Smartphone size={36} className="text-white" />
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <h1 className="text-3xl font-black text-white">أهلاً بك</h1>
            <p className="text-gray-400 text-sm mt-2 leading-relaxed">أدخل رقم جوالك المسجّل في الفعالية</p>
          </motion.div>
        </div>

        {/* Input card */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
          <GlassCard className="p-5 space-y-3 shadow-2xl shadow-black/30">
            <motion.div animate={shake ? { x: [-8, 8, -6, 6, -3, 3, 0] } : { x: 0 }} transition={{ duration: 0.4 }}>
              <input
                type="tel" inputMode="numeric" dir="ltr"
                placeholder="05XXXXXXXX"
                value={phone} onChange={handleInput}
                onKeyDown={e => e.key === "Enter" && submit()}
                className={`w-full bg-gray-800/80 border text-white rounded-2xl px-5 py-4 text-center text-xl font-bold tracking-widest focus:outline-none transition-all placeholder:text-gray-700 placeholder:font-normal placeholder:tracking-normal
                  ${error ? 'border-red-500/60 focus:border-red-400' : 'border-gray-700/60 focus:border-purple-500/70 focus:bg-gray-800/90'}`}
              />
            </motion.div>
            <AnimatePresence>
              {error && (
                <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="text-red-400 text-sm text-center leading-snug">{error}</motion.p>
              )}
            </AnimatePresence>
            <motion.button onClick={submit} disabled={loading} whileTap={{ scale: 0.97 }}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 text-white rounded-2xl py-4 font-black text-lg shadow-lg shadow-purple-600/30 transition-all flex items-center justify-center gap-2">
              {loading ? <><motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />جاري التحقق...</> : <span className="flex items-center justify-center gap-2">دخول <Sparkles size={16} /></span>}
            </motion.button>
          </GlassCard>
        </motion.div>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
          className="text-gray-600 text-xs">تواصل مع المنظم إذا واجهت أي مشكلة في الدخول</motion.p>
      </motion.div>
    </PageWrapper>
  )
}

// ─── Waiting / Setup Screen ───────────────────────────────────────────────────
function SetupScreen({ token, myInfo, enrolledCount }: { token: string; myInfo: { number: number; name: string; gender: string | null } | null; enrolledCount: number | null }) {

  const timeline = [
    { icon: <Users size={14} className="text-purple-400" />, label: "جلسة جماعية أولى", time: "30 دقيقة" },
    { icon: <Shuffle size={14} className="text-purple-400" />, label: "جلسة جماعية ثانية", time: "25 دقيقة" },
    { icon: <Trophy size={14} className="text-purple-400" />, label: "ترتيب المشاركين", time: "5 دقائق" },
    { icon: <Coffee size={14} className="text-orange-400" />, label: "استراحة", time: "10 دقائق" },
    { icon: <Star size={14} className="text-purple-400" />, label: "جلسة فردية (اختيارك)", time: "20 دقيقة" },
    { icon: <Brain size={14} className="text-purple-400" />, label: "جلسة فردية (اختيار النظام)", time: "20 دقيقة" },
    { icon: <Sparkles size={14} className="text-purple-400" />, label: "الكشف النهائي", time: "النتيجة" },
  ]

  return (
    <PageWrapper className="overflow-y-auto flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        className="space-y-5 max-w-sm w-full"
      >
        <Brand />

        {/* Participant info card */}
        {myInfo && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <GlassCard className="p-5 flex items-center gap-4 border border-purple-800/30 shadow-xl shadow-purple-900/20">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black flex-shrink-0 ${
                myInfo.gender === "female" ? "bg-pink-900/40 border border-pink-700/40 text-pink-300" :
                myInfo.gender === "male" ? "bg-blue-900/40 border border-blue-700/40 text-blue-300" :
                "bg-purple-900/40 border border-purple-700/40 text-purple-300"
              }`}>
                {myInfo.number}
              </div>
              <div className="flex-1 min-w-0 text-right">
                <p className="text-white font-bold text-base leading-tight">{myInfo.name}</p>
                <p className="text-gray-500 text-xs mt-0.5">رقمك في الفعالية</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-green-400 text-[11px] font-medium">جاهز</span>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        <GlassCard className="p-6 space-y-4 shadow-xl shadow-black/20 text-center">
          <div className="flex justify-center gap-1.5">
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                className="w-2 h-2 bg-purple-500 rounded-full"
                animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1, 0.8] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.35 }}
              />
            ))}
          </div>
          <h1 className="text-xl font-bold text-white">الفعالية ستبدأ قريباً</h1>
          <p className="text-gray-500 text-sm">انتظر توجيهات المنظم</p>
          <InfoHint text="ستنتقل تلقائياً عند بدء الجولات · لو احتجت أي مساعدة، استخدم زر «المنظم» في الأسفل" delay={0.5} duration={6} />
          {enrolledCount != null && enrolledCount > 0 && (
            <div className="flex items-center justify-center gap-2 pt-1">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-400 text-xs font-medium">{enrolledCount} مشارك مسجّل</span>
            </div>
          )}
        </GlassCard>

        {/* Event timeline preview */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <GlassCard className="p-5 space-y-3">
            <p className="text-gray-400 text-xs font-bold flex items-center gap-1.5">
              <Clock size={12} className="text-purple-400" /> رحلة الفعالية
            </p>
            <div className="space-y-2.5">
              {timeline.map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="relative flex items-center justify-center">
                    <div className="w-8 h-8 rounded-lg bg-gray-800/60 border border-gray-700/40 flex items-center justify-center text-sm flex-shrink-0">
                      {step.icon}
                    </div>
                    {i < timeline.length - 1 && (
                      <div className="absolute top-full w-px h-2.5 bg-gray-700/50" />
                    )}
                  </div>
                  <span className="text-gray-300 text-xs font-medium flex-1">{step.label}</span>
                  <span className="text-gray-600 text-[10px] font-mono">{step.time}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        </motion.div>
      </motion.div>
    </PageWrapper>
  )
}

// ─── One-popup reminder ───────────────────────────────────────────────────────
// The full event was already explained in the WelcomeScreen walkthrough, so each
// phase only needs a single lightweight reminder card (not a full multi-step tour).
function OnePopup({ onClose, accent, icon, label, title, points, cta = "فهمت — ابدأ" }: {
  onClose: () => void
  accent: "purple" | "pink" | "amber"
  icon: React.ReactNode
  label: string
  title: string
  points: { icon: React.ReactNode; text: React.ReactNode }[]
  cta?: string
}) {
  const grad = accent === "pink" ? "from-pink-600 to-rose-600" : accent === "amber" ? "from-amber-500 to-orange-500" : "from-purple-600 to-pink-600"
  const ring = accent === "pink" ? "ring-pink-500/30" : accent === "amber" ? "ring-amber-500/30" : "ring-purple-500/30"
  const chipBg = accent === "pink" ? "bg-pink-600/25 border-pink-500/50 text-pink-200" : accent === "amber" ? "bg-amber-600/25 border-amber-500/50 text-amber-200" : "bg-purple-600/25 border-purple-500/50 text-purple-200"
  const ctaText = accent === "amber" ? "text-black" : "text-white"

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[500] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
      dir="rtl"
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        className={`relative bg-gray-900/95 border border-gray-700/50 rounded-3xl p-6 max-w-xs w-full text-center overflow-hidden ring-1 ${ring}`}
      >
        {/* Close */}
        <button onClick={onClose} className="absolute top-3 left-3 w-7 h-7 rounded-full bg-gray-800/80 flex items-center justify-center text-gray-500 hover:text-white transition-colors">
          <X size={13} />
        </button>

        {/* Label chip */}
        <span className={`inline-flex items-center gap-1.5 ${chipBg} border rounded-full px-3 py-1 text-[10px] font-black tracking-wide mb-3`}>
          <Lightbulb size={11} /> {label}
        </span>

        {/* Icon */}
        <div className="relative mx-auto w-fit mb-3">
          <motion.div className="absolute inset-0 rounded-2xl border-2 border-current opacity-20"
            animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0, 0.3] }} transition={{ duration: 2.5, repeat: Infinity }} style={{ color: "currentColor" }} />
          <div className="w-14 h-14 rounded-2xl bg-gray-800/80 border border-gray-700/50 flex items-center justify-center">{icon}</div>
        </div>

        <h2 className="text-white font-black text-lg mb-3">{title}</h2>

        {/* Points */}
        <div className="space-y-2 text-right mb-5">
          {points.map((p, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.08 }}
              className="flex items-start gap-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2">
              <span className="shrink-0 mt-0.5">{p.icon}</span>
              <p className="text-gray-300 text-[12px] leading-relaxed flex-1">{p.text}</p>
            </motion.div>
          ))}
        </div>

        <motion.button whileTap={{ scale: 0.96 }} onClick={onClose}
          className={`w-full bg-gradient-to-r ${grad} ${ctaText} rounded-xl py-3 font-black text-sm shadow-lg shadow-black/30`}>
          {cta}
        </motion.button>
        <p className="text-gray-600 text-[10px] mt-2">شاهدت الشرح الكامل في البداية — هذا تذكير سريع فقط</p>
      </motion.div>
    </motion.div>
  )
}

// ─── Round Tutorial Overlay (single reminder) ────────────────────────────────
function RoundTutorial({ onClose }: { onClose: () => void }) {
  return (
    <OnePopup
      onClose={onClose}
      accent="purple"
      label="الجولة الجماعية"
      icon={<Users size={26} className="text-blue-400" />}
      title="جولة جماعية"
      cta="فهمت — ابدأ الجولة"
      points={[
        { icon: <MapPin size={15} className="text-purple-400" />, text: <>اذهب إلى <span className="text-white font-bold">رقم طاولتك</span> الظاهر في المنتصف واجلس مع مجموعتك</> },
        { icon: <Target size={15} className="text-indigo-400" />, text: <>اضغط <span className="text-white font-bold">«نشاطات المجموعة»</span> لأسئلة تساعدكم في التعارف</> },
        { icon: <MessageSquare size={15} className="text-emerald-400" />, text: <>زر <span className="text-white font-bold">«المنظم»</span> في الأسفل لأي مساعدة أو طارئ</> },
        { icon: <Clock size={15} className="text-amber-400" />, text: <>المؤقت في الأعلى ينبّهك عند اقتراب انتهاء الوقت</> },
      ]}
    />
  )
}

// ─── One-to-One Tutorial Overlay (single reminder) ───────────────────────────
function OneToOneTutorial({ onClose }: { onClose: () => void }) {
  return (
    <OnePopup
      onClose={onClose}
      accent="pink"
      label="الجلسة الفردية 1:1"
      icon={<Heart size={26} className="text-pink-400" />}
      title="جلستك الفردية"
      cta="فهمت — ابدأ الجلسة"
      points={[
        { icon: <MapPin size={15} className="text-amber-400" />, text: <>اذهب إلى <span className="text-white font-bold">رقم طاولتك</span> الظاهر في المنتصف لمقابلة شريكك</> },
        { icon: <MessageSquare size={15} className="text-purple-400" />, text: <>اضغط <span className="text-white font-bold">«أسئلة الجلسة»</span> لأسئلة نقاش — تأخذان أدوارًا: واحد يسأل والآخر يجيب</> },
        { icon: <Clock size={15} className="text-amber-400" />, text: <>المؤقت ينبهك عند اقتراب انتهاء الوقت</> },
        { icon: <Heart size={15} className="text-emerald-400" />, text: <>بعد الجلسة: قيّم تجربتك — إجاباتك سرية وتساعد في التحسين</> },
      ]}
    />
  )
}

// ─── Session Quick Tips (tooltips) ───────────────────────────────────────────
function SessionTips({ onClose, accent = "pink" }: { onClose: () => void; accent?: "pink" | "purple" }) {
  const [tip, setTip] = useState(0)
  const ac = accent === "pink"
    ? { text: "text-pink-300", bg: "bg-pink-500/15", border: "border-pink-500/30", dot: "bg-pink-400" }
    : { text: "text-purple-300", bg: "bg-purple-500/15", border: "border-purple-500/30", dot: "bg-purple-400" }

  const tips = [
    { icon: <Layers size={14} />, title: "مجموعات الأسئلة", desc: "بدّل بين المجموعات للوصول إلى أسئلة متنوعة تناسب نقاشكما" },
    { icon: <Zap size={14} />, title: "مستويات الأسئلة", desc: "الأسئلة مرتبة من خفيفة إلى عميقة — ابدأ بالأسهل وتدرّج" },
    { icon: <MessageSquare size={14} />, title: "أسئلة للنقاش", desc: "زر إضافي لمواضيع نقاش مفتوحة إذا احتجتم أفكاراً أخرى" },
    { icon: <CheckCircle size={14} />, title: "الانتهاء والتقييم", desc: "إذا أنهيتما مبكراً، اضغط الزر بالأسفل للانتقال إلى التقييم" },
  ]

  const goNext = () => { if (tip < tips.length - 1) setTip(t => t + 1); else onClose() }
  const t = tips[tip]

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className={`relative ${ac.bg} ${ac.border} border rounded-2xl px-4 py-3 space-y-2.5`}
        dir="rtl"
      >
        <div className="flex items-start gap-2.5">
          <div className={`w-7 h-7 rounded-lg ${ac.bg} ${ac.border} border flex items-center justify-center shrink-0 ${ac.text}`}>
            {t.icon}
          </div>
          <div className="flex-1 space-y-0.5">
            <p className={`text-xs font-bold ${ac.text}`}>{t.title}</p>
            <p className="text-gray-400 text-[11px] leading-relaxed">{t.desc}</p>
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-400 transition-colors shrink-0">
            <X size={14} />
          </button>
        </div>
        {/* Footer: dots + next */}
        <div className="flex items-center justify-between pt-0.5">
          <div className="flex items-center gap-1">
            {tips.map((_, i) => (
              <span key={i} className={`w-1 h-1 rounded-full transition-all ${i === tip ? `${ac.dot} w-3` : 'bg-gray-700'}`} />
            ))}
          </div>
          <button onClick={goNext} className={`text-[11px] font-medium ${ac.text} hover:opacity-80 transition-opacity`}>
            {tip < tips.length - 1 ? "التالي ←" : "تم"}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── Ice Breaker (Group Rounds) ──────────────────────────────────────────────
const ICE_BREAKERS: Record<number, { title: string; prompt: string; subPrompts?: string[] }> = {
  1: {
    title: "كسر الجليد",
    prompt: "اسمك، ثم أعطنا 3 أشياء تساعدنا نتعرف عليك أكثر — ممنوع تقول عمرك أو وظيفتك.",
    subPrompts: [
      "مثال: هواية غريبة عندك، حقيقة ما أحد يعرفها عنك، أو شيء تحب تسويه بوقتك الحر.",
      "مثال: موهبة مخفية، مكان تحب تزوره، أو أكلة ما تمل منها أبدًا.",
      "مثال: شيء تخطط له، تجربة غيّرت نظرتك، أو شي تحماس له هالفترة.",
    ],
  },
  2: {
    title: "كسر الجليد",
    prompt: "اسمك، وشارك 3 أشياء عنك:",
    subPrompts: [
      "شيء تحب تسويه.",
      "شيء الناس غالبًا ما يتوقعونه عنك.",
      "شيء تتمنى تجربه أو تتعلمه.",
    ],
  },
}

function IceBreaker({ round, myInfo, tablemates }: {
  round: number; myInfo: { number: number; name: string; gender: string | null } | null; tablemates: { number: number; first_name: string; gender: string | null }[]
}) {
  const ib = ICE_BREAKERS[round]
  const [started, setStarted] = useState(false)
  const [done, setDone] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [order, setOrder] = useState<{ name: string; number: number; isMe: boolean }[]>([])

  const startBreaker = () => {
    const all = [
      ...(myInfo ? [{ name: myInfo.name, number: myInfo.number, isMe: true }] : []),
      ...tablemates.map(m => ({ name: m.first_name, number: m.number, isMe: false })),
    ]
    // Shuffle and pick random start
    const shuffled = [...all]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    setOrder(shuffled)
    setCurrentIdx(0)
    setStarted(true)
  }

  const nextPerson = () => {
    if (currentIdx < order.length - 1) {
      setCurrentIdx(i => i + 1)
    } else {
      setDone(true)
    }
  }

  if (!ib || done) return null

  if (!started) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <GlassCard className="p-5 space-y-3 border-amber-800/40 shadow-lg shadow-amber-900/10">
          <div className="flex items-center justify-center gap-2">
            <Snowflake size={24} className="text-amber-400" />
            <h4 className="text-white font-bold text-sm">{ib.title}</h4>
          </div>
          <p className="text-gray-400 text-xs text-center leading-relaxed">
            قبل بدء الأسئلة — نشاط تعارف سريع يبدأ بشخص عشوائي ويمر على الجميع
          </p>
          <button
            onClick={startBreaker}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 text-white font-bold text-sm shadow-lg shadow-amber-600/30 hover:brightness-110 active:scale-95 transition-all"
          >
            <Sparkles size={14} className="inline" /> ابدأ كسر الجليد
          </button>
        </GlassCard>
      </motion.div>
    )
  }

  const current = order[currentIdx]
  const speakerClass = current.isMe
    ? "inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 bg-amber-500/20 border-2 border-amber-500/50"
    : "inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 bg-gray-800/60 border border-gray-700/50"

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <GlassCard className="p-5 space-y-4 border-amber-800/40 shadow-lg shadow-amber-900/10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Snowflake size={18} className="text-amber-400" />
            <h4 className="text-white font-bold text-sm">{ib.title}</h4>
          </div>
          <span className="text-amber-400/70 text-[10px] font-mono">{currentIdx + 1}/{order.length}</span>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5">
          {order.map((p, i) => (
            <div
              key={p.number}
              className={
                i < currentIdx ? "h-1.5 rounded-full transition-all duration-300 w-2 bg-amber-500/60"
                : i === currentIdx ? "h-1.5 rounded-full transition-all duration-300 w-6 bg-amber-400"
                : "h-1.5 rounded-full transition-all duration-300 w-2 bg-gray-700"
              }
            />
          ))}
        </div>

        {/* Current speaker */}
        <div className="text-center space-y-2 py-2">
          <p className="text-gray-500 text-[10px]">دور</p>
          <motion.div
            key={currentIdx}
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className={speakerClass}
          >
            <span className="text-white font-black text-lg">{current.name}</span>
            {current.isMe && <span className="text-amber-400 text-[10px] font-bold">أنت</span>}
          </motion.div>
        </div>

        {/* Prompt */}
        <div className="bg-amber-950/30 rounded-xl p-4 border border-amber-800/30 space-y-2">
          <p className="text-amber-200/90 text-sm leading-relaxed text-center font-medium">{ib.prompt}</p>
          {ib.subPrompts && (
            <div className="space-y-1 pt-1">
              {ib.subPrompts.map((sp, i) => (
                <p key={i} className="text-amber-300/70 text-xs leading-relaxed text-center">
                  {i + 1}. {sp}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Circle order preview */}
        <div className="flex flex-wrap gap-1.5 justify-center">
          {order.map((p, i) => (
            <span
              key={p.number}
              className={
                i === currentIdx
                  ? "text-[10px] px-2 py-0.5 rounded-full border transition-all bg-amber-500/30 border-amber-500/50 text-amber-200 font-bold"
                  : i < currentIdx
                    ? "text-[10px] px-2 py-0.5 rounded-full border transition-all bg-amber-900/20 border-amber-800/30 text-amber-500/40"
                    : "text-[10px] px-2 py-0.5 rounded-full border transition-all bg-gray-800/40 border-gray-700/40 text-gray-500"
              }
            >
              {p.name}
            </span>
          ))}
        </div>

        {/* Next button */}
        <button
          onClick={nextPerson}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 text-white font-bold text-sm shadow-lg shadow-amber-600/30 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          {currentIdx < order.length - 1 ? "الشخص التالي ←" : "تم النشاط ✓"}
        </button>
      </GlassCard>
    </motion.div>
  )
}

// ─── Rock Paper Scissors Icebreaker (1:1 Rounds) ─────────────────────────────
function RockPaperScissors({ accent = "pink", autoDone = false }: { accent?: "pink" | "purple"; autoDone?: boolean }) {
  const [done, setDone] = useState(autoDone)

  if (done) return null

  const ac = accent === "pink"
    ? { border: "border-pink-800/40", bg: "from-pink-950/30 to-rose-950/20", text: "text-pink-300", btn: "from-pink-600 to-rose-600", glow: "shadow-pink-600/30" }
    : { border: "border-purple-800/40", bg: "from-purple-950/30 to-violet-950/20", text: "text-purple-300", btn: "from-purple-600 to-violet-600", glow: "shadow-purple-600/30" }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
      <GlassCard className={`p-5 space-y-4 border ${ac.border} shadow-lg ${ac.glow}/10`}>
        <div className="flex items-center justify-center gap-2">
          <Zap size={20} className={ac.text} />
          <h4 className="text-white font-bold text-sm">تحدي حجر، ورقة، مقص</h4>
        </div>

        <p className="text-gray-400 text-xs text-center leading-relaxed">
          قبل ما تبدأ الجولة، العبوا حجر، ورقة، مقص — أفضل من ٣ جولات.
        </p>

        <div className={`rounded-xl p-4 border ${ac.border} bg-gradient-to-br ${ac.bg} space-y-2`}>
          <p className={`text-xs font-bold ${ac.text} flex items-center gap-1.5 justify-center`}>
            <Trophy size={13} /> الفائز
          </p>
          <ul className="text-gray-300 text-xs leading-relaxed space-y-1.5 text-center">
            <li>يقود الجلسة ويبدأ بطرح أول سؤال من أسئلة الجولة بالأسفل</li>
            <li>يملك تخطيًا واحدًا — يمكنه تخطي أي سؤال من الأسفل والانتقال لآخر</li>
            <li>كلاكما يجب أن يجيب على كل سؤال يُطرح</li>
          </ul>
        </div>

        <div className="text-center">
          <p className="text-gray-500 text-[11px] leading-relaxed">
            أسئلة هذه الجولة معروضة بالأسفل — يمكنكم البدء بعد انتهاء تحدي كسر الجليد
          </p>
        </div>

        <button
          onClick={() => setDone(true)}
          className={`w-full py-3 rounded-xl bg-gradient-to-r ${ac.btn} text-white font-bold text-sm shadow-lg ${ac.glow} hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2`}
        >
          <CheckCircle size={14} /> خلّصنا التحدي — ابدأوا الجلسة
        </button>
      </GlassCard>
    </motion.div>
  )
}

// ─── Round Screen ─────────────────────────────────────────────────────────────
function RoundScreen({ token, phase, timerActive, timerStart, timerDuration, myInfo }: {
  token: string; phase: string; timerActive: boolean; timerStart: string | null; timerDuration: number; myInfo: { number: number; name: string; gender: string | null } | null
}) {
  const round = parseInt(phase.replace("round", "")) || 1
  const [assignment, setAssignment] = useState<any>(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [showGroups, setShowGroups] = useState(false)
  const [showTutorial, setShowTutorial] = useState(round === 1)
  const wakeLockRef = useRef<any>(null)

  useEffect(() => {
    call("e3-get-assignment", token, { round }).then(d => { if (!d.error) setAssignment(d) })
  }, [token, round])

  useEffect(() => {
    if (!timerActive || !timerStart) { setTimeLeft(0); return }
    const update = () => {
      const elapsed = Math.floor((Date.now() - new Date(timerStart).getTime()) / 1000)
      setTimeLeft(Math.max(0, timerDuration - elapsed))
    }
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [timerActive, timerStart, timerDuration])

  // Wake lock: prevent screen sleep during active round
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await (navigator as any).wakeLock.request("screen")
        }
      } catch {}
    }
    if (timerActive && timeLeft > 0) requestWakeLock()
    return () => {
      if (wakeLockRef.current) { try { wakeLockRef.current.release() } catch {} wakeLockRef.current = null }
    }
  }, [timerActive, timeLeft])

  // Vibrate when timer starts or when 10 seconds remain
  useEffect(() => {
    if (!timerActive) return
    const totalMin = Math.floor(timerDuration / 60)
    if (timeLeft === 300 && totalMin > 5) { vibrate(150); playTimerWarningSound() }
    if (timeLeft === 60) { vibrate([100, 50, 100]); playTimerWarningSound() }
    if (timeLeft === 10 && "vibrate" in navigator) { try { navigator.vibrate(200) } catch {} }
    if (timeLeft === 0 && "vibrate" in navigator) { try { navigator.vibrate([300, 100, 300]) } catch {} }
  }, [timeLeft, timerActive, timerDuration])

  const roundAr = ["الأولى", "الثانية"][round - 1] || round
  const RC = [
    { badge: "bg-blue-900/30 border-blue-700/40 text-blue-300", card: "border-blue-800/40", num: "text-blue-300", pill: "bg-blue-900/40 text-blue-300 border-blue-800/40", bar: "from-blue-500 to-cyan-500" },
    { badge: "bg-indigo-900/30 border-indigo-700/40 text-indigo-300", card: "border-indigo-800/40", num: "text-indigo-300", pill: "bg-indigo-900/40 text-indigo-300 border-indigo-800/40", bar: "from-indigo-500 to-purple-500" },
  ][round - 1] || { badge: "bg-purple-900/30 border-purple-700/40 text-purple-300", card: "border-purple-800/40", num: "text-purple-300", pill: "bg-purple-900/40 text-purple-300 border-purple-800/40", bar: "from-purple-500 to-pink-500" }

  const timerBarH = timerActive && timeLeft > 0 ? "64px" : "0px"

  return (
    <div className="min-h-full bg-gray-950 relative overflow-hidden" dir="rtl">
      {/* Background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-24 -right-12 w-[380px] h-[380px] bg-purple-600/20 rounded-full blur-[90px]" />
        <div className="absolute -bottom-20 -left-12 w-[340px] h-[340px] bg-pink-600/15 rounded-full blur-[80px]" />
        <div className="absolute top-1/2 right-1/3 w-[260px] h-[260px] bg-blue-500/10 rounded-full blur-[70px] -translate-y-1/2" />
      </div>

      {/* ── Sticky Timer Strip ─────────────────────────────────────── */}
      <AnimatePresence>
        {timerActive && timeLeft > 0 && (
          <motion.div
            initial={{ y: -64 }} animate={{ y: 0 }} exit={{ y: -64 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed top-0 inset-x-0 z-50 bg-gray-950/90 backdrop-blur-xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 h-14 max-w-sm mx-auto relative">
              <div className="flex items-center gap-2">
                <Clock size={13} className="text-purple-400" />
                <span className="text-gray-500 text-xs">الوقت المتبقي</span>
              </div>
              {myInfo && (
                <div className="absolute left-1/2 -translate-x-1/2 flex items-baseline gap-1">
                  <span className="text-gray-400/70 text-[12px] font-medium leading-none">{myInfo.name}</span>
                  <span className={`text-[12px] font-mono font-bold leading-none ${myInfo.gender === "female" ? "text-pink-400/60" : myInfo.gender === "male" ? "text-blue-400/60" : "text-purple-400/60"}`}>#{myInfo.number}</span>
                </div>
              )}
              <div className={`text-2xl font-mono font-black tabular-nums ${timeLeft < 60 ? "text-red-400" : "text-white"}`}>
                {formatTime(timeLeft)}
              </div>
            </div>
            <div className="h-[2px] bg-gray-800/60">
              <motion.div
                className={`h-full bg-gradient-to-r ${timeLeft < 60 ? "from-red-500 to-red-400" : RC.bar}`}
                style={{ boxShadow: timeLeft < 60 ? "0 0 8px rgba(239,68,68,0.7)" : "0 0 8px rgba(139,92,246,0.7)" }}
                animate={{ width: `${(timeLeft / timerDuration) * 100}%` }}
                transition={{ duration: 1 }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Content ───────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="relative z-10 flex flex-col items-center justify-center p-6 h-full"
        style={{ paddingTop: `calc(1rem + ${timerBarH})` }}
      >
        <div className="w-full max-w-sm space-y-5 text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1, type: "spring" }}
            className={`inline-flex items-center gap-2 ${RC.badge} border rounded-full px-5 py-2`}
          >
            <Users size={13} />
            <span className="font-bold text-sm">الجولة الجماعية {roundAr}</span>
            <span className="text-gray-600 text-xs">من 2</span>
          </motion.div>
          <InfoHint text="اذهب إلى طاولتك · للطوارئ أو المساعدة، استخدم زر «المنظم» في الأسفل" delay={0.5} duration={5} />

          {assignment ? (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <GlassCard className={`p-5 space-y-3 border ${RC.card} shadow-xl shadow-black/20`}>
                <p className="text-gray-500 text-xs flex items-center justify-center gap-1.5">
                  <MapPin size={12} /> مكانك هذه الجولة
                </p>
                <div className={`text-7xl font-black leading-none ${RC.num}`}>{assignment.table}</div>
                <p className="text-gray-500 text-sm font-medium">طاولة رقم</p>

                {/* Tablemate count */}
                {assignment.tablemates?.length > 0 && (
                  <div className="flex items-center justify-center gap-1.5 text-gray-500 text-xs">
                    <Users size={11} />
                    <span>{assignment.tablemates.length} أشخاص معك في الطاولة</span>
                  </div>
                )}

                {assignment.tablemates?.length > 0 && (
                  <div className="pt-4 border-t border-gray-800/60">
                    <p className="text-gray-600 text-xs mb-3">رفاقك في الطاولة</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {assignment.tablemates.map((m: any) => (
                        <span key={m.number} className={`${m.gender === 'female' ? 'bg-pink-900/40 text-pink-300 border-pink-800/50' : m.gender === 'male' ? 'bg-blue-900/40 text-blue-300 border-blue-800/50' : RC.pill + ' border-gray-700/50'} border rounded-full px-3 py-1 text-sm font-medium`}>
                          {m.first_name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

              {/* Session ended overlay */}
              {timerActive && timeLeft === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className="mt-4 pt-4 border-t border-gray-800/60 text-center space-y-1"
                >
                  <Clock size={24} className="text-amber-400 mx-auto" />
                  <p className="text-white font-semibold text-sm">انتهت الجلسة</p>
                  <p className="text-gray-500 text-xs">انتظر توجيهات المنظم للمرحلة التالية</p>
                </motion.div>
              )}
              </GlassCard>
            </motion.div>
          ) : (
            <GlassCard className="p-10 flex flex-col items-center gap-3">
              <Spinner size={22} />
              <p className="text-gray-500 text-sm">جاري تحميل مكانك...</p>
            </GlassCard>
          )}

          {/* Ice Breaker — appears before group activities */}
          {assignment?.tablemates && (
            <IceBreaker round={round} myInfo={myInfo} tablemates={assignment.tablemates} />
          )}

          {/* Groups button */}
          <motion.button
            onClick={() => setShowGroups(true)}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
            className={`flex items-center justify-center gap-3 w-full py-4 rounded-2xl border font-bold text-base transition-all ${RC.badge} hover:brightness-125 active:scale-95`}
          >
            <Target size={16} className="inline" /> نشاطات المجموعة
            <ExternalLink size={15} />
          </motion.button>

          <p className="text-gray-600 text-xs">
            {round === 1 && "تعارف جماعي على طاولتك — ستختار بعدها من تريد جلسة فردية معه"}
            {round === 2 && "آخر جولة جماعية — بعدها ستُرتّب الأولويات لتحديد جلستك الفردية"}
          </p>

          {/* Replay tutorial button */}
          {round === 1 && (
            <motion.button
              onClick={() => setShowTutorial(true)}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
              className="text-gray-600 hover:text-gray-400 text-[11px] font-medium transition-colors flex items-center gap-1.5 mx-auto"
            >
              <RefreshCw size={11} />
              إعادة الشرح
            </motion.button>
          )}

        </div>
      </motion.div>

      {/* ── Tutorial Overlay ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showTutorial && <RoundTutorial onClose={() => setShowTutorial(false)} />}
      </AnimatePresence>

      {/* ── Groups Overlay Modal ────────────────────────────────────── */}
      <AnimatePresence>
        {showGroups && (
          <motion.div
            initial={{ opacity: 0, y: "100%" }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 32 }}
            className="fixed inset-x-0 bottom-0 z-40 bg-gray-950 flex flex-col"
            style={{ top: timerActive && timeLeft > 0 ? "64px" : "0px" }}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800/60 bg-gray-900/80 backdrop-blur-md flex-shrink-0">
              <span className="font-bold text-white flex items-center gap-2"><Target size={16} /> نشاطات المجموعة</span>
              <button
                onClick={() => setShowGroups(false)}
                className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm font-medium"
              >
                رجوع ← 
              </button>
            </div>
            {/* Groups content rendered inline */}
            <div className="flex-1 overflow-y-auto">
              <GroupsPage disableOnboarding />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Ranking Tutorial Overlay (single reminder) ──────────────────────────────
function RankingTutorial({ onClose }: { onClose: () => void }) {
  return (
    <OnePopup
      onClose={onClose}
      accent="amber"
      label="التقييم والترتيب"
      icon={<Trophy size={26} className="text-amber-400" />}
      title="رتّب من أعجبك"
      cta="فهمت — ابدأ الترتيب"
      points={[
        { icon: <Trophy size={15} className="text-amber-400" />, text: <>اسحب البطاقات لترتيب من <span className="text-white font-bold">الأعلى اهتماماً</span> للأقل — الأول هو أولويتك القصوى</> },
        { icon: <Heart size={15} className="text-emerald-400" />, text: <>إذا رتّبت شخصًا <span className="text-white font-bold">#1</span> ورتّبك هو أيضًا <span className="text-white font-bold">#1</span> ← تطابق مثالي وجلسة فردية!</> },
        { icon: <AlertTriangle size={15} className="text-amber-400" />, text: <>التطابق يجب أن يكون <span className="text-white font-bold">متبادلاً</span> — ترتيبك وحده لا يكفي، الطرفان يجب أن يتقاربا</> },
        { icon: <Sparkles size={15} className="text-pink-400" />, text: <>نتيجتك: جلستان فرديتان — واحدة من اختيارك وواحدة يختارها النظام بناءً على التوافق</> },
      ]}
    />
  )
}

// ─── Ranking Screen ───────────────────────────────────────────────────────────
function RankingScreen({ token, completedRounds, currentPhase, timerActive, timerStart, timerDuration }: { token: string, completedRounds: number, currentPhase: string, timerActive: boolean, timerStart: string | null, timerDuration: number }) {
  const [people, setPeople] = useState<any[]>([])
  const [order, setOrder] = useState<number[]>([])
  const [newNums, setNewNums] = useState<Set<number>>(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [openNote, setOpenNote] = useState<number | null>(null)
  const [savingNote, setSavingNote] = useState<number | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showPhaseWarning, setShowPhaseWarning] = useState(false)
  const [showRankTutorial, setShowRankTutorial] = useState(true)
  const [timeLeft, setTimeLeft] = useState(300) // fallback, overwritten by server timer
  const [showWarning, setShowWarning] = useState(false) // 30s warning
  const [autoSaving, setAutoSaving] = useState(false)
  const [showAutoSaveInfo, setShowAutoSaveInfo] = useState(true) // auto-save info banner
  const initialPhaseRef = useRef(currentPhase)
  const submittedRef = useRef(false)
  const orderRef = useRef<number[]>([])
  const autoSavedRef = useRef(false)

  // Auto-hide the info banner after 10s
  useEffect(() => {
    if (!showAutoSaveInfo) return
    const t = setTimeout(() => setShowAutoSaveInfo(false), 10000)
    return () => clearTimeout(t)
  }, [showAutoSaveInfo])

  useEffect(() => {
    Promise.all([
      call("e3-get-participants-met", token, { completed_rounds: completedRounds }),
      call("e3-get-notes", token),
    ]).then(([d, nd]) => {
      if (d.error) { toast.error(d.error); return }
      const allPeople: any[] = d.people || []
      const existingRankings: Record<number, number> = d.existing_rankings || {}
      setPeople(allPeople)

      // People already ranked → keep their saved order
      const ranked = allPeople
        .filter(p => existingRankings[p.number] !== undefined)
        .sort((a, b) => existingRankings[a.number] - existingRankings[b.number])

      // People NOT yet ranked → unranked, go to bottom sorted by round then number
      const fresh = allPeople
        .filter(p => existingRankings[p.number] === undefined)
        .sort((a, b) => a.round - b.round || a.number - b.number)

      // "new" badge only for people from the latest round (and only when completedRounds > 1)
      const newRound = completedRounds > 1 ? completedRounds : -1
      setNewNums(new Set(allPeople.filter(p => p.round === newRound).map(p => p.number)))
      setOrder([...ranked.map(p => p.number), ...fresh.map(p => p.number)])
      if (d.already_submitted) setSubmitted(true)
      setLoading(false)

      if (!nd.error && nd.notes) setNotes(nd.notes)
    })
  }, [token, completedRounds])

  // Keep refs in sync
  useEffect(() => { submittedRef.current = submitted }, [submitted])
  useEffect(() => { orderRef.current = order }, [order])

  // Server-side timer — calculate remaining time from server start + duration
  useEffect(() => {
    if (!timerActive || !timerStart) { setTimeLeft(timerDuration || 300); return }
    const update = () => {
      const elapsed = Math.floor((Date.now() - new Date(timerStart).getTime()) / 1000)
      const remaining = Math.max(0, timerDuration - elapsed)
      setTimeLeft(remaining)
      if (remaining === 31) {
        setShowWarning(true)
        toast('باقي 30 ثانية — احفظ تصنيفك الآن!', { duration: 5000, icon: '⏰' })
      }
    }
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [timerActive, timerStart, timerDuration])

  // Auto-save when timer hits 0 and not manually submitted
  useEffect(() => {
    if (timeLeft > 0 || submittedRef.current || autoSavedRef.current || loading) return
    const doAutoSave = async () => {
      setAutoSaving(true)
      autoSavedRef.current = true
      const d = await call('e3-submit-ranking', token, { ranked_list: orderRef.current, auto_saved: true })
      setAutoSaving(false)
      if (d.error) { toast.error(d.error); return }
      setSubmitted(true)
      toast('انتهى الوقت — تم حفظ تصنيفك تلقائياً', { duration: 5000, icon: '⏰' })
    }
    doAutoSave()
  }, [timeLeft, token, loading])

  // Detect phase change while user is on ranking screen
  useEffect(() => {
    if (currentPhase !== initialPhaseRef.current && !submitted) {
      setShowPhaseWarning(true)
      toast('المنظم انتقل للمرحلة التالية — ارتب اختياراتك وأرسلها بسرعة!', { duration: 6000 })
    }
  }, [currentPhase, submitted])

  const saveNote = async (aboutNumber: number, text: string) => {
    setSavingNote(aboutNumber)
    await call("e3-save-note", token, { about_number: aboutNumber, note: text })
    setSavingNote(null)
  }

  const submit = async () => {
    setSubmitting(true)
    const d = await call("e3-submit-ranking", token, { ranked_list: order })
    setSubmitting(false)
    if (d.error) { toast.error(d.error); return }
    setSubmitted(true)
    setShowConfirm(false)
    toast.success(completedRounds >= 2 ? "تم حفظ تصنيفك النهائي!" : "تم حفظ تصنيفك!")
  }

  const personMap = Object.fromEntries(people.map(p => [p.number, p]))

  const roundLabel = (r: number) => ["الجولة الجماعية الأولى", "الجولة الجماعية الثانية"][r - 1] || `الجولة ${r}`
  const roundStyle = (r: number) => [
    "bg-blue-900/50 text-blue-300 border-blue-700/50",
    "bg-indigo-900/50 text-indigo-300 border-indigo-700/50",
  ][r - 1] || "bg-gray-800/50 text-gray-400 border-gray-700/50"

  const rankStyle = (idx: number) => {
    if (idx === 0) return "bg-gradient-to-br from-amber-400 to-yellow-500 text-black shadow-lg shadow-amber-500/30"
    if (idx === 1) return "bg-gradient-to-br from-gray-300 to-gray-400 text-black"
    if (idx === 2) return "bg-gradient-to-br from-amber-700 to-amber-800 text-white"
    return "bg-gray-800/80 text-gray-500"
  }

  if (loading) return (
    <PageWrapper className="flex items-center justify-center">
      <Spinner size={28} />
    </PageWrapper>
  )

  return (
    <PageWrapper className="overflow-y-auto">
      <div className="max-w-md mx-auto pb-32">

        {/* Phase change warning banner — non-blocking */}
        <AnimatePresence>
          {showPhaseWarning && !submitted && (
            <motion.div
              initial={{ opacity: 0, y: -20, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -20, height: 0 }}
              className="bg-amber-950/80 border border-amber-700/40 rounded-xl mx-4 mt-2 px-4 py-2.5 flex items-center gap-2.5"
            >
              <Clock size={16} className="text-amber-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-amber-300 text-xs font-bold">المنظم انتقل للمرحلة التالية</p>
                <p className="text-amber-400/60 text-[10px]">ارتب اختياراتك وأرسلها بسرعة للمتابعة</p>
              </div>
              <button onClick={() => setShowPhaseWarning(false)} className="text-amber-500/60 hover:text-amber-400 flex-shrink-0">
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Auto-save info banner — shown once on load */}
        <AnimatePresence>
          {showAutoSaveInfo && !submitted && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              className="bg-blue-950/60 border border-blue-800/40 rounded-xl mx-4 mt-2 px-4 py-3 flex items-start gap-2.5"
            >
              <Info size={16} className="text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-blue-300 text-xs font-bold">معلومة مهمة عن التصنيف</p>
                <p className="text-blue-200/60 text-[10px] leading-relaxed mt-0.5">
                  إذا انتهى الوقت قبل أن ترسل تصنيفك، سيُحفظ ترتيبك الحالي تلقائياً ويُستخدم للمطابقة.
                  احرص على ترتيب الأشخاص أولاً ثم اضغط إرسال للتأكيد.
                </p>
              </div>
              <button onClick={() => setShowAutoSaveInfo(false)} className="text-blue-500/60 hover:text-blue-400 flex-shrink-0">
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 30s warning banner */}
        <AnimatePresence>
          {showWarning && !submitted && timeLeft > 0 && timeLeft <= 30 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="bg-red-950/80 border border-red-700/40 rounded-xl mx-4 mt-2 px-4 py-2.5 flex items-center gap-2.5"
            >
              <Clock size={16} className="text-red-400 flex-shrink-0 animate-pulse" />
              <div className="flex-1">
                <p className="text-red-300 text-xs font-bold">باقي {timeLeft} ثانية فقط!</p>
                <p className="text-red-400/60 text-[10px]">احفظ تصنيفك الآن — سيُحفظ تلقائياً عند انتهاء الوقت</p>
              </div>
              <button onClick={() => setShowWarning(false)} className="text-red-500/60 hover:text-red-400 flex-shrink-0">
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sticky header — sleek */}
        <div className="sticky top-0 z-10 bg-gray-950/90 backdrop-blur-xl">
          <div className="px-4 pt-3 pb-2.5 border-b border-white/[0.06]">
            {/* Title row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600/30 to-pink-600/20 border border-purple-500/20 flex items-center justify-center">
                  <Trophy size={15} className="text-purple-300" />
                </div>
                <div>
                  <h1 className="text-sm font-bold text-white leading-tight">رتّب أولوياتك</h1>
                  <p className="text-gray-600 text-[10px] leading-tight">{people.length} أشخاص · اسحب للترتيب</p>
                </div>
              </div>

              {/* Timer / status — right side */}
              <div className="flex items-center gap-2">
                {autoSaving ? (
                  <span className="flex items-center gap-1.5 text-amber-300 text-[11px] font-semibold">
                    <Spinner size={12} className="!text-amber-400" /> حفظ...
                  </span>
                ) : submitted ? (
                  <span className="flex items-center gap-1.5 text-emerald-300 text-[11px] font-semibold">
                    <CheckCircle size={13} className="text-emerald-400" /> تم الإرسال
                  </span>
                ) : timeLeft > 0 ? (
                  <span className={`flex items-center gap-1.5 font-mono font-bold text-sm tabular-nums transition-colors ${
                    timeLeft <= 30
                      ? 'text-red-400'
                      : timeLeft <= 60
                      ? 'text-amber-400'
                      : 'text-gray-300'
                  }`}>
                    <Clock size={13} className={timeLeft <= 30 ? 'text-red-400' : 'text-gray-500'} />
                    {formatTime(timeLeft)}
                  </span>
                ) : null}
              </div>
            </div>

            {/* New badge — only when relevant */}
            {newNums.size > 0 && !submitted && (
              <div className="mt-2">
                <span className="text-purple-400 text-[10px] bg-purple-900/20 border border-purple-800/30 rounded-full px-2.5 py-0.5 font-medium inline-flex items-center gap-1">
                  <Sparkles size={10} className="inline" /> {newNums.size} أشخاص جدد من الجولة الثانية
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Drag-to-reorder list */}
        <div className="px-3">
          <Reorder.Group axis="y" values={order} onReorder={setOrder} className="space-y-1.5" as="div">
            {order.map((num, idx) => {
              const p = personMap[num]
              if (!p) return null
              return (
                <Reorder.Item
                  key={num}
                  value={num}
                  as="div"
                  className={`py-2 px-3 rounded-xl border border-gray-800/60 bg-gray-900/70 backdrop-blur-sm ${submitted ? 'cursor-not-allowed opacity-50' : 'cursor-grab active:cursor-grabbing touch-none select-none'}`}
                  whileDrag={submitted ? undefined : {
                    scale: 1.04,
                    boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
                    borderColor: "rgba(139,92,246,0.5)",
                    backgroundColor: "rgba(88,28,135,0.2)",
                    zIndex: 50,
                  }}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: submitted ? 0.5 : 1, x: 0 }}
                  transition={{ delay: idx * 0.02 }}
                  drag={submitted ? false : true}
                >
                  {/* Single row — compact */}
                  <div className="flex items-center gap-2.5">
                    {/* Rank badge */}
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0 ${rankStyle(idx)}`}>
                      {idx + 1}
                    </div>

                    {/* Name + number + round badge inline */}
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className="font-semibold text-white text-sm leading-tight">{p.first_name}</span>
                      <span className="text-[10px] text-gray-600 font-mono flex-shrink-0">#{p.number}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full border flex-shrink-0 hidden xs:inline-block ${roundStyle(p.round)}`}>
                        {roundLabel(p.round)}
                      </span>
                      {newNums.has(num) && (
                        <span className="text-[9px] bg-purple-900/60 text-purple-300 border border-purple-700/50 rounded-full px-1.5 py-0.5 font-semibold flex items-center gap-0.5 flex-shrink-0"><Sparkles size={7} className="inline" /> جديد</span>
                      )}
                    </div>

                    {/* Note toggle button */}
                    <button
                      onClick={e => { e.stopPropagation(); setOpenNote(openNote === num ? null : num) }}
                      className={`w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg transition-all ${
                        notes[num]
                          ? "bg-amber-500/15 border border-amber-600/30 text-amber-400"
                          : "text-gray-700 hover:text-gray-500"
                      }`}
                      title="ملاحظة خاصة"
                    >
                      <PenLine size={12} />
                    </button>

                    {/* Drag handle */}
                    <GripVertical size={15} className="text-gray-600 flex-shrink-0" />
                  </div>

                  {/* Collapsible note area */}
                  <AnimatePresence>
                    {openNote === num && (
                      <motion.div
                        key="note"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                        onPointerDown={e => e.stopPropagation()}
                      >
                        <div className="pt-2 mt-2 border-t border-gray-800/50">
                          <textarea
                            value={notes[num] || ""}
                            onChange={e => setNotes(prev => ({ ...prev, [num]: e.target.value }))}
                            onBlur={() => saveNote(num, notes[num] || "")}
                            placeholder="ملاحظة خاصة — لن يراها أحد غيرك..."
                            rows={2}
                            dir="rtl"
                            className="w-full bg-gray-800/60 border border-gray-700/50 focus:border-amber-600/50 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 resize-none outline-none transition-colors cursor-text"
                          />
                          <p className="text-[9px] mt-0.5 text-right transition-colors" style={{ color: savingNote === num ? "#f59e0b" : "#374151" }}>
                            {savingNote === num ? "جاري الحفظ..." : notes[num]?.trim() ? "✓ محفوظة" : "تُحفظ تلقائياً عند المغادرة"}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Reorder.Item>
              )
            })}
          </Reorder.Group>
        </div>
      </div>

      {/* Fixed submit bar */}
      <div className="fixed bottom-0 inset-x-0 p-3 bg-gradient-to-t from-gray-950 via-gray-950/95 to-transparent pt-6">
        <div className="max-w-md mx-auto">
          {submitted ? (
            <div className="space-y-2 text-center">
              <div className={`flex items-center justify-center gap-2 rounded-xl py-3 px-4 ${autoSavedRef.current ? 'bg-amber-900/30 border border-amber-700/40' : 'bg-emerald-900/30 border border-emerald-700/40'}`}>
                {autoSavedRef.current ? <Lock size={16} className="text-amber-400" /> : <CheckCircle size={16} className="text-emerald-400" />}
                <span className={`font-bold text-xs ${autoSavedRef.current ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {autoSavedRef.current ? 'تم حفظ تصنيفك تلقائياً — لا يمكن التعديل' : 'تم إرسال تصنيفك'}
                </span>
              </div>
              {autoSavedRef.current && (
                <p className="text-gray-600 text-[10px] leading-relaxed">
                  انتهى الوقت وتم حفظ ترتيبك الحالي تلقائياً
                </p>
              )}
              <p className="text-gray-600 text-[10px]">انتظر المنظم للانتقال للمرحلة التالية</p>
              <button onClick={() => setSubmitted(false)} disabled={submitting}
                className="text-gray-600 hover:text-gray-400 text-[10px] underline transition-colors">
                تعديل التصنيف
              </button>
            </div>
          ) : (
            <>
              <motion.button
                onClick={() => setShowConfirm(true)}
                disabled={submitting}
                whileTap={{ scale: 0.97 }}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-60 text-white rounded-xl py-3 font-bold text-sm shadow-2xl shadow-purple-600/30 transition-all"
              >
                {submitting ? <Spinner size={16} className="!text-white" /> : <Send size={16} />}
                {completedRounds >= 2 ? 'إرسال التصنيف النهائي' : 'حفظ التصنيف'}
              </motion.button>
              <p className="text-center text-gray-700 text-[11px] mt-2">
                النظام سيختار توافقك الأمثل من تصنيفاتك · قد تُطابق مع خيارك الأخير إذا لم يخترك أعلى خياراتك
              </p>
              {timeLeft > 0 && timeLeft <= 60 && !submitted && (
                <p className="text-center text-amber-500/70 text-[10px] mt-1">
                  ⏰ سيُحفظ تصنيفك تلقائياً عند انتهاء الوقت
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Ranking Tutorial Overlay */}
      <AnimatePresence>
        {showRankTutorial && <RankingTutorial onClose={() => setShowRankTutorial(false)} />}
      </AnimatePresence>

      {/* Confirmation modal */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[500] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setShowConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="bg-gray-900 border border-gray-800 rounded-3xl p-6 max-w-sm w-full space-y-4 text-center"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-14 h-14 mx-auto rounded-2xl bg-purple-900/40 border border-purple-700/40 flex items-center justify-center">
                <Send size={24} className="text-purple-400" />
              </div>
              <h3 className="text-white font-bold text-lg">تأكيد التصنيف</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                ستقوم بحفظ ترتيبك لـ <span className="text-white font-semibold">{order.length}</span> شخص.
                {completedRounds >= 2 ? " هذا تصنيفك النهائي — سيُستخدم للمطابقة." : " يمكنك تعديل تصنيفك في الجولة القادمة."}
              </p>
              {/* Top 3 preview */}
              <div className="bg-gray-800/50 rounded-2xl p-3 space-y-1.5">
                {order.slice(0, 3).map((num, i) => {
                  const p = personMap[num]
                  if (!p) return null
                  return (
                    <div key={num} className="flex items-center gap-2 text-sm">
                      <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black ${rankStyle(i)}`}>{i + 1}</span>
                      <span className="text-gray-300 font-medium">{p.first_name}</span>
                      <span className="text-gray-600 text-[10px] font-mono">#{p.number}</span>
                    </div>
                  )
                })}
                {order.length > 3 && <p className="text-gray-600 text-[11px] pt-1">+ {order.length - 3} أخرون</p>}
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowConfirm(false)}
                  className="flex-1 py-3 rounded-2xl bg-gray-800 text-gray-400 font-bold text-sm hover:bg-gray-700 transition-colors">
                  إلغاء
                </button>
                <button onClick={submit} disabled={submitting}
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-sm hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                  {submitting ? <Spinner size={16} className="!text-white" /> : <CheckCircle size={16} />}
                  تأكيد
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageWrapper>
  )
}


// ─── Shared Feedback Flow ─────────────────────────────────────────────────────
function FeedbackFlow({ partnerName, word, done, onDone, onBack, onSubmit, isLastSession }: {
  partnerName: string | null; word: string; done: boolean
  onDone: () => void; onBack: () => void; onSubmit: (fb: Record<string, any>) => Promise<boolean>
  isLastSession?: boolean
}) {
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [dir, setDir] = useState(1)
  const [fb, setFb] = useState({
    conversationQuality: 0, personalConnection: 0,
    wantConnect: null as boolean | null, organizerImpression: '',
    compatibilityRate: 50, sliderMoved: false, sharedInterests: 3, comfortLevel: 3,
    communicationStyle: 3, wouldMeetAgain: 3, overallExperience: 3, recommendations: '', participantMessage: ''
  })
  const STEPS = 4
  const goNext = (patch?: Partial<typeof fb>) => {
    if (patch) setFb(p => ({ ...p, ...patch }))
    setDir(1); setTimeout(() => setStep(s => Math.min(s + 1, STEPS - 1)), 150)
  }
  const goBack = () => { setDir(-1); setStep(s => Math.max(s - 1, 0)) }
  const handleSubmit = async () => {
    if (fb.wantConnect === null) { toast.error('الرجوع للخطوة 3 واختر رد'); return }
    setSubmitting(true)
    const ok = await onSubmit({ ...fb, word })
    setSubmitting(false)
    if (ok) onDone()
  }
  const ratingConfigs = [
    { icon: <Frown size={18} />, gradient: 'from-red-500/80 to-rose-600/80', ring: 'ring-red-400/60', glow: 'shadow-[0_0_20px_-4px_rgba(239,68,68,0.5)]' },
    { icon: <Frown size={18} className="[&>path]:stroke-[1.5]" />, gradient: 'from-orange-500/80 to-amber-600/80', ring: 'ring-orange-400/60', glow: 'shadow-[0_0_20px_-4px_rgba(249,115,22,0.5)]' },
    { icon: <Meh size={18} />, gradient: 'from-amber-500/80 to-yellow-600/80', ring: 'ring-amber-400/60', glow: 'shadow-[0_0_20px_-4px_rgba(245,158,11,0.5)]' },
    { icon: <Smile size={18} />, gradient: 'from-lime-500/80 to-green-600/80', ring: 'ring-lime-400/60', glow: 'shadow-[0_0_20px_-4px_rgba(132,204,22,0.5)]' },
    { icon: <Sparkles size={18} />, gradient: 'from-emerald-500/80 to-teal-600/80', ring: 'ring-emerald-400/60', glow: 'shadow-[0_0_20px_-4px_rgba(16,185,129,0.5)]' },
  ]
  const RatingRow = ({ labels, field, val }: { labels: string[]; field: string; val: number }) => (
    <div className="flex gap-2">
      {labels.map((label, i) => {
        const cfg = ratingConfigs[i]
        const selected = val === i + 1
        return (
          <motion.button key={i} whileTap={{ scale: 0.88 }}
            onClick={() => { setFb(p => ({ ...p, [field]: i + 1 })); setTimeout(() => goNext({ [field]: i + 1 }), 320) }}
            className={`flex-1 flex flex-col items-center gap-2 py-4 rounded-2xl transition-all duration-200 ${selected ? 'bg-white/[0.06] ring-2 scale-105 ' + cfg.ring + ' ' + cfg.glow : 'bg-white/[0.03] ring-1 ring-white/[0.05] active:bg-white/8'}`}>
            <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${cfg.gradient} flex items-center justify-center text-white transition-transform duration-200 ${selected ? 'scale-110' : 'scale-95 opacity-70'}`}>
              {cfg.icon}
            </div>
            <span className={`text-[10px] leading-tight text-center transition-colors duration-200 ${selected ? 'text-white font-semibold' : 'text-gray-600'}`}>{label}</span>
          </motion.button>
        )
      })}
    </div>
  )
  if (done) return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-gray-950 flex flex-col items-center justify-center gap-6 p-8">
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
        className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500/25 to-teal-500/15 border border-emerald-500/30 flex items-center justify-center shadow-[0_0_60px_-8px_rgba(16,185,129,0.5)]">
        <CheckCircle size={40} className="text-emerald-400" />
      </motion.div>
      <div className="text-center space-y-2">
        <p className="text-white font-black text-2xl">شكراً!</p>
        <p className="text-gray-400 text-sm">تم حفظ تقييمك — انتظر المرحلة التالية</p>
      </div>
      {isLastSession && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          className="max-w-sm rounded-2xl border border-purple-700/30 bg-gradient-to-br from-purple-950/40 to-violet-950/20 p-5 text-center space-y-2"
        >
          <div className="flex items-center justify-center gap-2 text-purple-300">
            <Sparkles size={18} />
            <p className="font-bold text-sm">الكشف النهائي قادم</p>
          </div>
          <p className="text-gray-400 text-xs leading-relaxed">
            بعد أن يكمل جميع المشاركين تقييمهم، ستظهر لك صفحة النتائج النهائية مع تفاصيل التوافق الكاملة،
            مقارنة بين اختيارك واختيار الخوارزمية، وتحليل ذكي للكيمياء بينك وبين شريكك.
            ابقَ معنا — لا تغادر!
          </p>
        </motion.div>
      )}
    </motion.div>
  )
  return (
    <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed inset-0 z-50 bg-gray-950 flex flex-col" dir="rtl">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-80 h-80 bg-pink-600/20 rounded-full blur-[100px]" />
        <div className="absolute -bottom-20 right-1/4 w-72 h-72 bg-purple-600/15 rounded-full blur-[90px]" />
      </div>
      <div className="relative z-10 px-5 pt-5 pb-3 flex items-center gap-3">
        <button onClick={step === 0 ? onBack : goBack}
          className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center text-gray-400 hover:text-white active:scale-90 transition-all">
          <ChevronRight size={18} />
        </button>
        <div className="flex gap-1.5 flex-1 justify-center">
          {Array.from({ length: STEPS }).map((_, i) => (
            <motion.div key={i} className="rounded-full h-2"
              animate={{ width: i === step ? 24 : 8, backgroundColor: i < step ? 'rgba(139,92,246,0.85)' : i === step ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.12)' }}
              transition={{ duration: 0.3 }} />
          ))}
        </div>
        <span className="text-gray-600 text-xs font-mono w-9 text-left">{step + 1}/{STEPS}</span>
      </div>
      {partnerName && (
        <div className="relative z-10 mx-5 mb-1">
          <div className="inline-flex items-center gap-2 bg-pink-950/40 border border-pink-900/30 rounded-full px-3 py-1.5">
            <Users size={10} className="text-pink-400" />
            <span className="text-pink-300/80 text-xs font-medium">{partnerName}</span>
          </div>
        </div>
      )}
      <div className="relative z-10 flex-1 flex flex-col justify-center px-5 pb-10">
        <AnimatePresence mode="wait" custom={dir}>
          {step === 0 && (
            <motion.div key="s0" initial={{ opacity: 0, x: dir * 70 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -dir * 70 }}
              transition={{ type: 'spring', stiffness: 350, damping: 35 }} className="space-y-8">
              <div className="text-center space-y-2">
                <p className="text-3xl font-black text-white">كيف كانت المحادثة؟</p>
                <p className="text-gray-500 text-sm">اختر ما يناسب شعورك</p>
              </div>
              <RatingRow labels={["سيئة","ضعيفة","مقبولة","جيدة","ممتازة"]} field="conversationQuality" val={fb.conversationQuality} />
            </motion.div>
          )}
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: dir * 70 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -dir * 70 }}
              transition={{ type: 'spring', stiffness: 350, damping: 35 }} className="space-y-8">
              <div className="text-center space-y-2">
                <p className="text-3xl font-black text-white">التواصل الشخصي؟</p>
                <p className="text-gray-500 text-sm">مستوى الراحة والتفاهم</p>
              </div>
              <RatingRow labels={["لا شيء","ضعيف","مقبول","جيد","رائع"]} field="personalConnection" val={fb.personalConnection} />
            </motion.div>
          )}
          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: dir * 70 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -dir * 70 }}
              transition={{ type: 'spring', stiffness: 350, damping: 35 }} className="space-y-6">
              <div className="text-center space-y-2">
                <p className="text-3xl font-black text-white">هل تريد التواصل لاحقاً؟</p>
              </div>
              {/* Prominent info card — mutual match = contact exchange */}
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                className="relative overflow-hidden rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-950/50 via-teal-950/40 to-emerald-950/30 px-5 py-4 shadow-lg shadow-emerald-900/20"
              >
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent" />
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 w-9 h-9 rounded-xl bg-emerald-500/25 border border-emerald-500/40 flex items-center justify-center shrink-0">
                    <Heart size={18} className="text-emerald-400" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-emerald-300 text-sm font-black">معلومة مهمة جداً</p>
                    <p className="text-gray-200 text-xs leading-relaxed">
                      إجابتك سرية تماماً. إذا أجاب كلاكما بـ«نعم» — ستحصلان على رقم تواصل ومعلومات بعضكم في صفحة النتائج النهائية بعد الفعالية.
                    </p>
                    <p className="text-emerald-400/70 text-[10px] mt-1">لا أحد سيعرف باختيارك إلا إذا وافق الطرف الآخر أيضاً</p>
                  </div>
                </div>
              </motion.div>
              <div className="grid grid-cols-2 gap-4">
                {[{ val: true, icon: <CheckCircle size={26} />, label: "نعم", cls: fb.wantConnect === true ? 'bg-emerald-500/15 ring-2 ring-emerald-500/50 shadow-[0_0_30px_-4px_rgba(16,185,129,0.4)]' : 'bg-white/[0.04] ring-1 ring-white/[0.06]', iconCls: fb.wantConnect === true ? 'from-emerald-500/80 to-teal-600/80 text-white' : 'from-gray-600/40 to-gray-700/40 text-gray-500', textCls: fb.wantConnect === true ? 'text-emerald-300' : 'text-gray-500' },
                   { val: false, icon: <X size={26} />, label: "لا", cls: fb.wantConnect === false ? 'bg-red-500/15 ring-2 ring-red-500/50 shadow-[0_0_30px_-4px_rgba(239,68,68,0.4)]' : 'bg-white/[0.04] ring-1 ring-white/[0.06]', iconCls: fb.wantConnect === false ? 'from-red-500/80 to-rose-600/80 text-white' : 'from-gray-600/40 to-gray-700/40 text-gray-500', textCls: fb.wantConnect === false ? 'text-red-300' : 'text-gray-500' }
                ].map(opt => (
                  <motion.button key={String(opt.val)} whileTap={{ scale: 0.93 }}
                    onClick={() => { setFb(p => ({ ...p, wantConnect: opt.val })); setTimeout(() => goNext({ wantConnect: opt.val }), 350) }}
                    className={`min-h-[120px] rounded-3xl flex flex-col items-center justify-center gap-3 font-black transition-all duration-200 ${opt.cls}`}>
                    <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${opt.iconCls} flex items-center justify-center transition-transform duration-200 ${fb.wantConnect === opt.val ? 'scale-110' : 'scale-95'}`}>
                      {opt.icon}
                    </div>
                    <span className={`text-lg ${opt.textCls}`}>{opt.label}</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
          {step === 3 && (
            <motion.div key="s3" initial={{ opacity: 0, x: dir * 70 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -dir * 70 }}
              transition={{ type: 'spring', stiffness: 350, damping: 35 }} className="space-y-6">
              <div className="text-center space-y-2">
                <p className="text-2xl font-black text-white">ملاحظة للمنظم</p>
                <p className="text-gray-500 text-sm">اختياري — لن يراها الطرف الآخر</p>
              </div>
              <textarea value={fb.organizerImpression}
                onChange={e => e.target.value.length <= 300 && setFb(p => ({ ...p, organizerImpression: e.target.value }))}
                placeholder="شعرت بالراحة... / الوقت كان قصيراً..."
                rows={4}
                className="w-full bg-white/[0.04] border border-white/[0.08] text-white/90 rounded-2xl px-4 py-4 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500/40 resize-none placeholder:text-gray-700 transition-all" />
              <motion.button onClick={handleSubmit} disabled={submitting || fb.wantConnect === null} whileTap={{ scale: 0.97 }}
                className="w-full py-5 rounded-3xl font-black text-lg bg-gradient-to-r from-purple-500 via-violet-500 to-purple-600 text-white shadow-[0_8px_30px_-4px_rgba(139,92,246,0.6)] disabled:opacity-30 disabled:shadow-none transition-all flex items-center justify-center gap-2">
                {submitting
                  ? <><motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />جاري الإرسال...</>
                  : <><Send size={18} /> إرسال التقييم</>}
              </motion.button>
              {fb.wantConnect === null && <p className="text-center text-amber-500/70 text-xs">ارجع للخطوة 3 وأجب على سؤال التواصل</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// ─── SOS / Organizer Chat Box ───────────────────────────────────────────────
function SOSButton({ token, position = 'top' }: { token: string; position?: 'top' | 'bottom' }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<{ id: string; text: string; from: 'user' | 'organizer'; status: string; timestamp?: string }[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [showOptions, setShowOptions] = useState(true)
  const [hasUnread, setHasUnread] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const openRef = useRef(false)
  const lastReplyCountRef = useRef(parseInt(sessionStorage.getItem('sos_last_reply_count') || '0'))
  useEffect(() => { openRef.current = open }, [open])

  useEffect(() => {
    const doFetch = async () => {
      const d = await call('e3-sos-check', token)
      if (d.error || !d.requests) return
      const allMsgs: { id: string; text: string; from: 'user' | 'organizer'; status: string; timestamp?: string }[] = []
      let orgCount = 0
      for (const r of d.requests) {
        const history = Array.isArray(r.chat_history) ? r.chat_history : []
        for (const msg of history) {
          allMsgs.push({ id: r.id + '-' + msg.timestamp, text: msg.text, from: msg.from === 'organizer' ? 'organizer' : 'user', status: r.status, timestamp: msg.timestamp })
          if (msg.from === 'organizer') orgCount++
        }
      }
      allMsgs.sort((a, b) => a.id.localeCompare(b.id))
      setMessages(allMsgs)
      const prevCount = lastReplyCountRef.current
      if (orgCount > prevCount && prevCount >= 0) {
        setHasUnread(true)
        playSOSMessageSound()
        vibrate([100, 50, 100])
        if (!openRef.current) {
          toast('رسالة من المنظم!', { duration: 4000 })
        }
      }
      lastReplyCountRef.current = orgCount
      sessionStorage.setItem('sos_last_reply_count', String(orgCount))
      if (allMsgs.length > 0) setShowOptions(false)
      else setShowOptions(true)
      if (orgCount === 0 && allMsgs.length === 0) setHasUnread(false)
    }
    doFetch()
    const iv = setInterval(doFetch, 10000)
    return () => clearInterval(iv)
  }, [token])

  useEffect(() => {
    if (open) { setHasUnread(false); scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }
  }, [open, messages])

  const send = async (text: string, requestType?: string) => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    const d = await call('e3-sos', token, { message: trimmed, request_type: requestType || 'chat' })
    setSending(false)
    if (!d.error) {
      setMessages(prev => [...prev, { id: d.id || String(Date.now()), text: trimmed, from: 'user', status: 'pending' }])
      setShowOptions(false)
      setInput("")
      toast.success('تم الإرسال')
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    } else {
      toast.error('حدث خطأ')
    }
  }

  const pendingCount = messages.filter(m => m.from === 'user' && m.status === 'pending').length
  const hasActive = messages.length > 0

  const buttonLabel = hasUnread ? 'رسالة جديدة' : pendingCount > 0 ? 'في الانتظار...' : hasActive ? 'المنظم' : 'طلب مساعدة'
  const buttonState = hasUnread ? 'unread' : pendingCount > 0 ? 'pending' : hasActive ? 'active' : 'idle'

  return (
    <>
      {/* Organizer button — centered with separator lines beside it */}
      <div className={`${position === 'bottom' ? 'relative' : 'fixed top-[68px]'} left-0 right-0 z-[190] flex items-center justify-center px-4 pb-5 pt-3 bg-gradient-to-t from-gray-950 via-gray-950/80 to-transparent flex-shrink-0`} dir="rtl">
        {/* Left separator */}
        <div className="flex-1 h-px bg-gradient-to-l from-gray-700/30 to-transparent max-w-[80px]" />
        {/* Button */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.04 }}
          onClick={() => setOpen(o => !o)}
          animate={buttonState === 'idle' ? { scale: [1, 1.03, 1] } : {}}
          transition={buttonState === 'idle' ? { duration: 3, repeat: Infinity, ease: 'easeInOut' } : {}}
          className={`mx-3 flex items-center gap-2 px-5 py-2 rounded-full text-[12px] font-semibold transition-colors duration-300 ${
            buttonState === 'unread' ? 'text-emerald-300 bg-emerald-950/60 border border-emerald-700/40 shadow-lg shadow-emerald-900/30'
            : buttonState === 'pending' ? 'text-orange-300 bg-orange-950/50 border border-orange-700/40'
            : buttonState === 'active' ? 'text-gray-300 bg-gray-800/60 border border-gray-700/40'
            : 'text-gray-400 hover:text-gray-200 bg-gray-800/50 border border-gray-700/40'
          }`}
        >
          {/* Status indicator */}
          <span className="relative flex-shrink-0 flex items-center justify-center w-2.5 h-2.5">
            {buttonState === 'unread' && (
              <motion.span className="w-2.5 h-2.5 rounded-full bg-emerald-400"
                animate={{ scale: [1, 1.35, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />
            )}
            {buttonState === 'pending' && (
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
                className="w-2.5 h-2.5 border border-orange-500/40 border-t-orange-300 rounded-full" />
            )}
            {buttonState === 'active' && <span className="w-2 h-2 rounded-full bg-gray-500" />}
            {buttonState === 'idle' && (
              <motion.span className="w-1.5 h-1.5 rounded-full bg-red-500/70"
                animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 2, repeat: Infinity }} />
            )}
          </span>

          {/* Animated label — auto width */}
          <AnimatePresence mode="wait">
            <motion.span
              key={buttonLabel}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="whitespace-nowrap"
            >
              {buttonLabel}
            </motion.span>
          </AnimatePresence>
        </motion.button>
        {/* Right separator */}
        <div className="flex-1 h-px bg-gradient-to-r from-gray-700/30 to-transparent max-w-[80px]" />
      </div>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: position === 'bottom' ? 20 : -20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: position === 'bottom' ? 20 : -20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={`fixed z-[300] w-[300px] max-w-[calc(100vw-2rem)] bg-gray-950/95 backdrop-blur-xl border border-gray-800/80 rounded-3xl shadow-2xl flex flex-col overflow-hidden ${
              position === 'bottom' ? 'bottom-20 left-1/2 -translate-x-1/2' : 'top-[88px] left-1/2 -translate-x-1/2'
            }`}
            style={{ maxHeight: '60vh' }}
            dir="rtl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60 bg-gray-900/50">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-xs font-bold text-white">ع</div>
                <div>
                  <p className="text-white text-sm font-bold leading-tight">عبدالرحمن</p>
                  <p className="text-gray-500 text-[10px] leading-tight">المنظم — تواصل مباشر</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-full bg-gray-800/80 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
                <X size={13} />
              </button>
            </div>

            {/* Messages area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 min-h-[120px]">
              {messages.length === 0 && showOptions && (
                <div className="space-y-2.5 py-2">
                  <div className="bg-amber-950/30 border border-amber-800/30 rounded-xl p-3 text-[10px] leading-relaxed text-amber-200/80 space-y-1.5">
                    <p className="font-bold text-amber-300 text-[11px]">قبل أن تطلب المساعدة:</p>
                    <p>عدم الإعجاب بالشخص أو المجموعة ليس سبباً صحيحاً لطلب المساعدة — كل جولة تُحدّث وبناءً على تقييمك ستتحسن الخوارزمية.</p>
                    <p>استخدم هذا الزر فقط إذا: خالف أحدهم القواعد، أو لديك طارئ، أو لديك استفسار عام.</p>
                    <p className="text-amber-400/60">يمكنك استئناف المحادثات مع أي شخص بعد الفعالية إذا رغب الطرفان.</p>
                  </div>
                  <p className="text-center text-gray-600 text-xs mb-1">اختر نوع الطلب</p>
                  <button
                    onClick={() => { setShowOptions(false); setInput(''); send('طلب مساعدة - أحتاج المنظم إلى طاولتي', 'organizer_needed') }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-red-950/30 border border-red-800/40 hover:bg-red-950/50 transition-all text-right"
                  >
                    <LifeBuoy size={18} className="text-red-400" />
                    <div>
                      <p className="text-red-300 text-sm font-semibold">طلب مساعدة</p>
                      <p className="text-gray-500 text-[11px]">سيأتي المنظم إلى طاولتك</p>
                    </div>
                  </button>
                  <button
                    onClick={() => { setShowOptions(false); setInput('') }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-purple-950/30 border border-purple-800/40 hover:bg-purple-950/50 transition-all text-right"
                  >
                    <MessageSquare size={18} className="text-purple-400" />
                    <div>
                      <p className="text-purple-300 text-sm font-semibold">رسالة خاصة</p>
                      <p className="text-gray-500 text-[11px]">اكتب رسالة سرية للمنظم</p>
                    </div>
                  </button>
                </div>
              )}

              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.from === 'user' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.from === 'user'
                      ? 'bg-gradient-to-br from-purple-600/90 to-pink-600/90 text-white rounded-bl-md'
                      : 'bg-gray-800/80 text-gray-100 rounded-br-md border border-emerald-700/30'
                  }`}>
                    {msg.from === 'organizer' && (
                      <p className="text-emerald-400/80 text-[9px] font-bold mb-0.5">عبدالرحمن</p>
                    )}
                    {msg.text}
                    {msg.timestamp && (
                      <p className={`text-[8px] mt-1 ${msg.from === 'user' ? 'text-white/40' : 'text-gray-500'}`}>
                        {new Date(msg.timestamp).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                    {msg.from === 'user' && msg.status === 'pending' && (
                      <p className="text-white/50 text-[9px] mt-1 flex items-center gap-1">
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                          className="w-2 h-2 border border-white/30 border-t-white/60 rounded-full" />
                        في الانتظار
                      </p>
                    )}
                    {msg.from === 'user' && msg.status === 'seen' && (
                      <p className="text-white/50 text-[9px] mt-1">✓✓ تمت المشاهدة</p>
                    )}
                    {msg.from === 'user' && (msg.status === 'replied' || msg.status === 'resolved') && (
                      <p className="text-white/50 text-[9px] mt-1">✓✓ تم الرد</p>
                    )}
                  </div>
                </div>
              ))}

              {messages.length === 0 && !showOptions && (
                <p className="text-center text-gray-600 text-xs py-4">لا توجد رسائل</p>
              )}
            </div>

            {/* Input area */}
            {!showOptions && (
              <div className="border-t border-gray-800/60 p-2.5 bg-gray-900/30">
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={e => e.target.value.length <= 200 && setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
                    placeholder="اكتب رسالة..."
                    rows={1}
                    className="flex-1 bg-gray-900 border border-gray-700/50 text-white rounded-2xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500/40 resize-none placeholder:text-gray-700 transition-all max-h-20"
                    style={{ minHeight: '40px' }}
                  />
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => send(input)}
                    disabled={sending || !input.trim()}
                    className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white disabled:opacity-30 transition-all flex-shrink-0"
                  >
                    {sending
                      ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                          className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                      : <Send size={15} />}
                  </motion.button>
                </div>
              </div>
            )}

            {/* New request option after conversation started */}
            {hasActive && messages.length > 0 && (
              <button
                onClick={() => { setShowOptions(true); setInput('') }}
                className="text-center text-gray-600 text-[11px] py-2 hover:text-gray-400 transition-colors border-t border-gray-800/40"
              >
                + طلب جديد
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// ─── Phase 2 Reveal Screen ────────────────────────────────────────────────────
function Phase2RevealScreen({ token, eventId, timerActive, timerStart, timerDuration }: {
  token: string; eventId?: number | string; timerActive: boolean; timerStart: string | null; timerDuration: number
}) {
  const [data, setData] = useState<any>(null)
  const [revealed, setRevealed] = useState(false)
  const [tableRevealed, setTableRevealed] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [word, setWord] = useState("")
  const [wordSubmitted, setWordSubmitted] = useState(false)
  const [view, setView] = useState<'partner' | 'session' | 'feedback'>('partner')
  const [showPrompt, setShowPrompt] = useState(false)
  const [feedbackDone, setFeedbackDone] = useState(false)
  const [showTutorial, setShowTutorial] = useState(true)
  const [showSessionTips, setShowSessionTips] = useState(false)
  const [rejoined, setRejoined] = useState(false)

  useEffect(() => {
    call("e3-get-phase2-reveal", token).then(d => {
      if (!d.error) {
        setData(d)
        if (d.my_word) { setWord(d.my_word); setWordSubmitted(true) }
      }
    })
  }, [token])

  useEffect(() => {
    if (!timerActive || !timerStart) { setTimeLeft(0); return }
    const update = () => {
      const elapsed = Math.floor((Date.now() - new Date(timerStart).getTime()) / 1000)
      setTimeLeft(Math.max(0, timerDuration - elapsed))
    }
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [timerActive, timerStart, timerDuration])

  // Auto-rejoin sync: if timer already running when component mounts, jump to correct view
  // Only auto-rejoin if the participant had already clicked "وصلت إلى الطاولة" before refresh
  useEffect(() => {
    if (!data || !timerActive || !timerStart) return
    const elapsed = Math.floor((Date.now() - new Date(timerStart).getTime()) / 1000)
    const remaining = Math.max(0, timerDuration - elapsed)
    const arrived = hasArrived(eventId, "phase2")
    if (arrived && elapsed > 60 && remaining > 0) { setTableRevealed(true); setRevealed(true); setView('session'); setRejoined(true) }
    else if (arrived && remaining <= 0) { setTableRevealed(true); setRevealed(true); setView('feedback') }
    else if (!arrived && remaining <= 0) { setTableRevealed(true); setRevealed(true); setView('feedback') }
  }, [data, timerActive, timerStart, timerDuration, eventId])

  // Transition to feedback when session time runs out
  useEffect(() => {
    if (view === 'session' && timerActive && timeLeft === 0) setView('feedback')
  }, [timeLeft, view, timerActive])

  // Auto-show tips on first entry to session view
  const tipsShownRef = useRef(false)
  useEffect(() => {
    if (view === 'session' && !tipsShownRef.current) {
      tipsShownRef.current = true
      const t = setTimeout(() => setShowSessionTips(true), 600)
      return () => clearTimeout(t)
    }
  }, [view])

  // Wake lock: prevent screen sleep during 1:1 session
  const p2WakeLockRef = useRef<any>(null)
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          p2WakeLockRef.current = await (navigator as any).wakeLock.request("screen")
        }
      } catch {}
    }
    if (view === 'session') requestWakeLock()
    return () => {
      if (p2WakeLockRef.current) { try { p2WakeLockRef.current.release() } catch {} p2WakeLockRef.current = null }
    }
  }, [view])

  const canArrive = !timerActive || !timerStart || timeLeft <= timerDuration - 60
  const waitSeconds = Math.max(0, timeLeft - (timerDuration - 60))

  const handleReveal = () => {
    if (!canArrive) return
    setArrived(eventId, "phase2")
    setRevealed(true)
    fireConfetti({ particleCount: 55, spread: 65, origin: { y: 0.45 }, colors: ["#ec4899", "#f43f5e", "#fb7185", "#be185d"] })
  }

  const submitWord = async () => {
    if (!word.trim()) return
    const d = await call("e3-submit-phase2-word", token, { word: word.trim() })
    if (!d.error) { setWordSubmitted(true); toast.success("تم الحفظ!") }
  }

  return (
    <PageWrapper className="overflow-y-auto">
      <div className="max-w-sm mx-auto p-4 pb-6 space-y-3">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="text-center pt-4 space-y-1">
          <div className="flex flex-col items-center gap-1.5">
            <div className="inline-flex items-center gap-2 bg-pink-900/30 border border-pink-700/40 text-pink-300 rounded-full px-4 py-1.5 text-sm font-semibold">
              <Users size={13} /> جلسة فردية 1:1 · اختيارك أنت
            </div>
            <p className="text-gray-600 text-xs">جلسة خاصة مع الشخص الذي اخترته من جولات التعارف</p>
            <InfoHint text="اضغط لتأكيد وصولك للطاولة · لديك وقت محدد للمحادثة · يمكنك إرسال كلمة تصف تجربتك" delay={0.4} duration={5} />
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {!tableRevealed ? (
            <motion.div key="pre-table" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-4">
              <motion.button onClick={() => setTableRevealed(true)} whileTap={{ scale: 0.97 }}
                className="w-full bg-gradient-to-br from-pink-600 via-rose-600 to-pink-700 text-white rounded-2xl py-6 font-bold text-lg shadow-2xl shadow-pink-600/40 border border-pink-500/30">
                <motion.span animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 1.8, repeat: Infinity }} className="flex items-center justify-center gap-3">
                  <MapPin size={24} /> اعرف طاولتك
                </motion.span>
              </motion.button>
              {timerActive && timeLeft > 0 && (
                <div className="rounded-2xl bg-gray-900/80 border border-white/[0.05] overflow-hidden">
                  <div className="px-5 pt-4 pb-3">
                    <p className="text-gray-500 text-xs flex items-center justify-end gap-1.5 mb-1">{canArrive ? <>الوقت المتبقي للجلسة</> : <>الجلسة تبدأ خلال</>} <Clock size={11} className="text-pink-400" /></p>
                    <div className={`text-4xl font-mono font-black tabular-nums ${(canArrive ? timeLeft : waitSeconds) < 60 ? "text-red-400" : "text-white"}`}>{formatTime(canArrive ? timeLeft : Math.ceil(waitSeconds))}</div>
                  </div>
                  <div className="h-1 bg-gray-800/60">
                    <motion.div className={`h-full ${(canArrive ? timeLeft : waitSeconds) < 60 ? "bg-gradient-to-r from-red-500 to-red-400" : "bg-gradient-to-r from-pink-500 via-rose-400 to-pink-600"}`}
                      style={{ boxShadow: (canArrive ? timeLeft : waitSeconds) < 60 ? "0 0 8px rgba(239,68,68,0.7)" : "0 0 10px rgba(236,72,153,0.7)" }}
                      animate={{ width: `${canArrive ? (timeLeft / timerDuration) * 100 : (waitSeconds / 60) * 100}%` }} transition={{ duration: 1 }} />
                  </div>
                </div>
              )}
            </motion.div>
          ) : !revealed ? (
            <motion.div key="pre-name" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-4">
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 220 }}
                className="rounded-3xl bg-pink-950/40 border border-pink-700/40 p-6 text-center space-y-2">
                <MapPin size={18} className="text-pink-400 mx-auto" />
                <p className="text-gray-500 text-xs">توجّه إلى الطاولة رقم</p>
                <div className="text-6xl font-black text-pink-300">{data?.table_number ?? "—"}</div>
                <p className="text-gray-600 text-xs">بعد الوصول، اضغط لتأكيد وصولك</p>
              </motion.div>
              <motion.button onClick={handleReveal} whileTap={{ scale: canArrive ? 0.97 : 1 }} disabled={!canArrive}
                className={`w-full rounded-2xl py-5 font-bold text-lg border transition-all ${canArrive
                  ? "bg-gradient-to-br from-pink-600 via-rose-600 to-pink-700 text-white shadow-2xl shadow-pink-600/40 border-pink-500/30"
                  : "bg-gray-800 text-gray-500 border-gray-700/50 cursor-not-allowed"}`}>
                {canArrive ? (
                  <motion.span animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 1.8, repeat: Infinity }} className="flex items-center justify-center gap-3">
                    <MapPin size={22} /> وصلت إلى الطاولة
                  </motion.span>
                ) : (
                  <span className="flex flex-col items-center gap-1">
                    <span className="flex items-center justify-center gap-2">
                      <Clock size={20} /> سيكون الزر متاحاً خلال ({Math.ceil(waitSeconds)}ث)
                    </span>
                    <span className="text-[10px] font-normal text-gray-600">انتظر دقيقة من بدء المؤقت قبل تأكيد وصولك</span>
                  </span>
                )}
              </motion.button>
              {timerActive && timeLeft > 0 && (
                <div className="rounded-2xl bg-gray-900/80 border border-white/[0.05] overflow-hidden">
                  <div className="px-5 pt-4 pb-3">
                    <p className="text-gray-500 text-xs flex items-center justify-end gap-1.5 mb-1">{canArrive ? <>الوقت المتبقي للجلسة</> : <>الجلسة تبدأ خلال</>} <Clock size={11} className="text-pink-400" /></p>
                    <div className={`text-4xl font-mono font-black tabular-nums ${(canArrive ? timeLeft : waitSeconds) < 60 ? "text-red-400" : "text-white"}`}>{formatTime(canArrive ? timeLeft : Math.ceil(waitSeconds))}</div>
                  </div>
                  <div className="h-1 bg-gray-800/60">
                    <motion.div className={`h-full ${(canArrive ? timeLeft : waitSeconds) < 60 ? "bg-gradient-to-r from-red-500 to-red-400" : "bg-gradient-to-r from-pink-500 via-rose-400 to-pink-600"}`}
                      style={{ boxShadow: (canArrive ? timeLeft : waitSeconds) < 60 ? "0 0 8px rgba(239,68,68,0.7)" : "0 0 10px rgba(236,72,153,0.7)" }}
                      animate={{ width: `${canArrive ? (timeLeft / timerDuration) * 100 : (waitSeconds / 60) * 100}%` }} transition={{ duration: 1 }} />
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div key="post" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <motion.div initial={{ scale: 0.88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, delay: 0.05 }}>
                <div className="relative overflow-hidden rounded-3xl border border-pink-700/25 shadow-2xl shadow-pink-900/30">
                  <div className="absolute inset-0 bg-gradient-to-br from-pink-950 via-rose-950/80 to-pink-900/60" />
                  <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-pink-400/60 to-transparent" />
                  <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-black/30 to-transparent" />
                  <div className="relative z-10 px-6 pt-5 pb-6 text-center">
                    <div className="inline-flex items-center gap-1.5 bg-pink-900/50 border border-pink-700/40 rounded-full px-3 py-1 mb-4">
                      <Users size={10} className="text-pink-400" />
                      <span className="text-pink-300 text-[11px] font-semibold tracking-wide">{data?.is_backup ? "جلسة احتياطي · إقتراح المنظم" : "جلسة فردية · اختيارك الشخصي"}</span>
                    </div>
                    <p className="text-5xl font-black text-white mb-2 tracking-tight" style={{ textShadow: '0 2px 20px rgba(236,72,153,0.3)' }}>{data?.partner_first_name || "..."}</p>
                    <p className="text-pink-400/50 text-xs mt-1">{data?.is_backup ? "شريكك في جلسة احتياطية" : "شريكك في جلسة الاختيار الشخصي"}</p>
                  </div>
                </div>
              </motion.div>

              {/* Backup pairing explanation banner */}
              {data?.is_backup && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                  className="relative overflow-hidden rounded-2xl border border-amber-600/40 bg-gradient-to-br from-amber-950/50 via-orange-950/30 to-amber-950/40 p-4 shadow-lg shadow-amber-900/20">
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                      <Info size={16} className="text-amber-400" />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-amber-300 text-sm font-bold">جلسة احتياطية</p>
                      <p className="text-amber-100/70 text-xs leading-relaxed">
                        لم تختار هذا الشخص ولم يختارك في التصنيف — قد لا تكون قد جلست معه في جولات التعارف. هذا الاقتران جاء كحل احتياطي لضمان حصول الجميع على جلسة. استغل هذه الفرصة للتعرف على شخص جديد!
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Partner info card */}
              {data && <PartnerInfoCard data={data} accent="pink" />}

              {data?.table_number && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                  <div className="relative overflow-hidden rounded-2xl border border-amber-700/50 bg-gradient-to-br from-amber-900/40 via-orange-900/25 to-amber-900/30 p-5 text-center shadow-lg shadow-amber-900/20">
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber-500/60 to-transparent" />
                    <p className="text-amber-400/80 text-xs font-medium tracking-wider uppercase mb-3">توجّه الآن إلى</p>
                    <div className="flex items-center justify-center gap-4 mb-3">
                      <div className="text-center">
                        <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border-2 border-amber-500/40 flex flex-col items-center justify-center mx-auto mb-1.5">
                          <span className="text-3xl font-black text-amber-300 leading-none">{data.table_number}</span>
                        </div>
                        <p className="text-amber-500/80 text-xs font-semibold">طاولة</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-center gap-1.5 text-amber-400/70 text-xs">
                      <MapPin size={12} className="animate-bounce" />
                      <span>ستجد {data?.partner_first_name || 'شريكك'} هناك — انتظر بدء الجلسة</span>
                    </div>
                  </div>
                </motion.div>
              )}

              <motion.button
                onClick={() => setView('session')}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl border font-bold text-base transition-all bg-pink-900/30 border-pink-700/40 text-pink-300 hover:brightness-125 active:scale-95"
              >
                انتقل إلى أسئلة الجلسة
                <ChevronRight size={16} />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Feedback View (Phase 2) ──────────────────────────────────────────── */}
      <AnimatePresence>
        {view === 'feedback' && (
          <FeedbackFlow
            partnerName={data?.partner_first_name || null}
            word={word}
            done={feedbackDone}
            onDone={() => setFeedbackDone(true)}
            onBack={() => setView('session')}
            onSubmit={async (fbData) => {
              const d = await call('e3-submit-phase2-feedback', token, { feedback: fbData })
              if (!d.error) { toast.success('تم الحفظ'); return true }
              return false
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Session View (in-page, replaces partner card) ───────────────────── */}
      <AnimatePresence>
        {view === 'session' && (
          <motion.div
            initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-0 z-40 bg-gray-950 flex flex-col overflow-y-auto"
          >
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
              <div className="absolute -top-32 -left-24 w-96 h-96 bg-pink-500/20 rounded-full blur-[100px]" />
              <div className="absolute top-1/2 -right-20 w-80 h-80 bg-rose-500/15 rounded-full blur-[90px]" />
              <div className="absolute -bottom-20 left-1/3 w-72 h-72 bg-fuchsia-500/15 rounded-full blur-[80px]" />
            </div>
            {/* Sticky header */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-white/[0.06] bg-gray-950/80 backdrop-blur-xl">
              <button onClick={() => setView('partner')} className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm font-medium transition-colors">
                ← رجوع
              </button>
              <span className="text-white font-bold text-sm">أسئلة الجلسة الأولى</span>
              <span className={`font-mono text-sm font-black tabular-nums ${timeLeft < 300 ? 'text-red-400' : 'text-pink-300'}`}>{formatTime(timeLeft)}</span>
            </div>
            <div className="flex-1 max-w-sm mx-auto w-full p-5 space-y-5">
              {/* Compact partner reminder */}
              <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-pink-900/20 border border-pink-800/30">
                <span className="text-gray-500 text-xs">شريكك</span>
                <span className="text-pink-300 font-bold">{data?.partner_first_name}</span>
                <div className="flex items-center gap-2">
                  {data?.is_backup && <span className="text-amber-400 text-[10px] font-medium bg-amber-500/10 border border-amber-600/30 rounded-full px-2 py-0.5">احتياطي</span>}
                  {data?.table_number && <span className="text-amber-400 text-xs font-medium">طاولة {data.table_number}</span>}
                </div>
              </div>
              {/* Live timer strip */}
              {timerActive && timeLeft > 0 && (
                <div className="rounded-xl bg-gray-900/80 border border-white/[0.05] overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-gray-500 text-xs flex items-center gap-1.5"><Clock size={10} className="text-pink-400" /> الوقت المتبقي</span>
                    <span className={`font-mono font-black text-lg tabular-nums ${timeLeft < 60 ? 'text-red-400' : 'text-white'}`}>{formatTime(timeLeft)}</span>
                  </div>
                  <div className="h-[2px] bg-gray-800/60">
                    <motion.div className={`h-full ${timeLeft < 60 ? "bg-gradient-to-r from-red-500 to-red-400" : "bg-gradient-to-r from-pink-500 to-rose-400"}`}
                      style={{ boxShadow: timeLeft < 60 ? "0 0 6px rgba(239,68,68,0.6)" : "0 0 6px rgba(236,72,153,0.6)" }}
                      animate={{ width: `${(timeLeft / timerDuration) * 100}%` }} transition={{ duration: 1 }} />
                  </div>
                </div>
              )}
              {/* Questions */}
              <RockPaperScissors accent="pink" autoDone={rejoined} />
              <AnimatePresence>
                {showSessionTips && <SessionTips onClose={() => setShowSessionTips(false)} accent="pink" />}
              </AnimatePresence>
              <QuestionSlideshow defaultSet="choice" />
              {/* PromptTopicsModal */}
              <button onClick={() => setShowPrompt(true)}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-full text-sm font-medium bg-gradient-to-r from-purple-600/60 to-pink-600/60 hover:from-purple-600 hover:to-pink-600 text-white transition-all border border-purple-700/30">
                <MessageSquare size={14} /> أسئلة للنقاش
              </button>
              {/* Jump to feedback manually */}
              <motion.button
                onClick={() => setView('feedback')}
                whileTap={{ scale: 0.97 }}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-pink-700/80 to-rose-700/80 hover:from-pink-600 hover:to-rose-600 text-white text-sm font-bold transition-all shadow-lg shadow-pink-900/30 border border-pink-600/30"
              >
                <CheckCircle size={16} />
                انتهيت من الجلسة — انتقل للتقييم
              </motion.button>
              {/* Replay tutorial + tips buttons */}
              <div className="flex items-center justify-center gap-4">
                <motion.button
                  onClick={() => setShowTutorial(true)}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                  className="text-gray-600 hover:text-gray-400 text-[11px] font-medium transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw size={11} />
                  إعادة الشرح
                </motion.button>
                <motion.button
                  onClick={() => setShowSessionTips(true)}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                  className="text-gray-600 hover:text-gray-400 text-[11px] font-medium transition-colors flex items-center gap-1.5"
                >
                  <Sparkles size={11} />
                  نصائح سريعة
                </motion.button>
              </div>
            </div>
            <Suspense fallback={null}>
              {showPrompt && <PromptTopicsModal open={showPrompt} onClose={() => setShowPrompt(false)} />}
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Tutorial Overlay ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showTutorial && <OneToOneTutorial onClose={() => setShowTutorial(false)} />}
      </AnimatePresence>
    </PageWrapper>
  )
}

// ─── Phase 3 Reveal Screen ────────────────────────────────────────────────────
function Phase3RevealScreen({ token, eventId, timerActive, timerStart, timerDuration }: {
  token: string; eventId?: number | string; timerActive: boolean; timerStart: string | null; timerDuration: number
}) {
  const [revealed, setRevealed] = useState(false)
  const [tableRevealed, setTableRevealed] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [word, setWord] = useState("")
  const [wordSubmitted, setWordSubmitted] = useState(false)
  const [view, setView] = useState<'partner' | 'session' | 'feedback'>('partner')
  const [showPrompt, setShowPrompt] = useState(false)
  const [feedbackDone, setFeedbackDone] = useState(false)
  const [showSessionTips, setShowSessionTips] = useState(false)
  const [rejoined, setRejoined] = useState(false)

  const fetchReveal = useCallback(async () => {
    const d = await call("e3-get-phase3-reveal", token)
    if (d.error) throw new Error(d.error)
    return d
  }, [token])

  const { data, loading, error, retry } = useApiPoll(fetchReveal, {
    interval: 5000,
    stopWhen: (d) => d.table_number != null
  })

  useEffect(() => {
    if (data?.word_submitted) setWordSubmitted(true)
  }, [data])

  useEffect(() => {
    if (!timerActive || !timerStart) { setTimeLeft(0); return }
    const update = () => {
      const elapsed = Math.floor((Date.now() - new Date(timerStart).getTime()) / 1000)
      setTimeLeft(Math.max(0, timerDuration - elapsed))
    }
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [timerActive, timerStart, timerDuration])

  // Auto-rejoin sync: show the table number before the session when returning
  // Only auto-rejoin if the participant had already clicked "وصلت إلى الطاولة" before refresh
  useEffect(() => {
    if (!data || !timerActive || !timerStart) return
    const elapsed = Math.floor((Date.now() - new Date(timerStart).getTime()) / 1000)
    const remaining = Math.max(0, timerDuration - elapsed)
    const arrived = hasArrived(eventId, "phase3")
    if (arrived && elapsed > 60 && remaining > 0) { setTableRevealed(true); setRevealed(false); setView('partner'); setRejoined(true) }
    else if (arrived && remaining <= 0) { setTableRevealed(true); setRevealed(true); setView('feedback') }
    else if (!arrived && remaining <= 0) { setTableRevealed(true); setRevealed(true); setView('feedback') }
  }, [data, timerActive, timerStart, timerDuration, eventId])

  // Transition to feedback when session time runs out
  useEffect(() => {
    if (view === 'session' && timerActive && timeLeft === 0) setView('feedback')
  }, [timeLeft, view, timerActive])

  // Auto-show tips on first entry to session view
  const tipsShownRef = useRef(false)
  useEffect(() => {
    if (view === 'session' && !tipsShownRef.current) {
      tipsShownRef.current = true
      const t = setTimeout(() => setShowSessionTips(true), 600)
      return () => clearTimeout(t)
    }
  }, [view])

  // Wake lock: prevent screen sleep during 1:1 session
  const p3WakeLockRef = useRef<any>(null)
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          p3WakeLockRef.current = await (navigator as any).wakeLock.request("screen")
        }
      } catch {}
    }
    if (view === 'session') requestWakeLock()
    return () => {
      if (p3WakeLockRef.current) { try { p3WakeLockRef.current.release() } catch {} p3WakeLockRef.current = null }
    }
  }, [view])

  const canArrive = !timerActive || !timerStart || timeLeft <= timerDuration - 60
  const waitSeconds = Math.max(0, timeLeft - (timerDuration - 60))

  const handleReveal = () => {
    if (!canArrive) return
    setArrived(eventId, "phase3")
    setRevealed(true)
    fireConfetti({ particleCount: 65, spread: 70, origin: { y: 0.4 }, colors: ["#7c3aed", "#8b5cf6", "#a78bfa", "#c4b5fd"] })
  }

  const submitWord = async () => {
    if (!word.trim()) return
    const d = await call("e3-submit-phase3-word", token, { word: word.trim() })
    if (!d.error) { setWordSubmitted(true); toast.success("تم الحفظ!") }
  }

  if (loading && !data && !error) return (
    <PageWrapper className="flex items-center justify-center">
      <Spinner size={28} />
    </PageWrapper>
  )

  if (error && !data) return (
    <PageWrapper className="flex flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-red-950/40 border border-red-800/40 flex items-center justify-center">
        <AlertTriangle className="text-red-400" size={28} />
      </div>
      <div className="space-y-1">
        <p className="text-white font-semibold">تعذّر تحميل بيانات الجلسة</p>
        <p className="text-gray-500 text-sm">{error}</p>
      </div>
      <button onClick={retry} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium transition-colors">
        <RefreshCw size={16} />
        إعادة المحاولة
      </button>
    </PageWrapper>
  )

  return (
    <PageWrapper className="overflow-y-auto">
      <div className="max-w-sm mx-auto p-4 pb-6 space-y-3">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="text-center pt-4 space-y-1">
          <div className="flex flex-col items-center gap-1.5">
            <div className="inline-flex items-center gap-2 bg-purple-900/30 border border-purple-700/40 text-purple-300 rounded-full px-4 py-1.5 text-sm font-semibold">
              <Brain size={13} /> جلسة فردية 1:1 · اختيارنا لك
            </div>
            <p className="text-gray-600 text-xs">جلسة خاصة مع من رشّحه النظام بناءً على توافقكما</p>
            <InfoHint text="الخوارزمية اختارت هذا الشخص بناءً على بياناتك وبياناتهم · اضغط لتأكيد وصولك · ستحصل على أسئلة للنقاش" delay={0.4} duration={5} />
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {!tableRevealed ? (
            <motion.div key="pre-table" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-4">
              <motion.button onClick={() => setTableRevealed(true)} whileTap={{ scale: 0.97 }}
                className="w-full bg-gradient-to-br from-purple-600 via-violet-600 to-purple-700 text-white rounded-2xl py-6 font-bold text-lg shadow-2xl shadow-purple-600/40 border border-purple-500/30">
                <motion.span animate={{ rotate: [0, -4, 4, 0] }} transition={{ duration: 3, repeat: Infinity }} className="flex items-center justify-center gap-3">
                  <MapPin size={24} /> اعرف طاولتك
                </motion.span>
              </motion.button>
              {timerActive && timeLeft > 0 && (
                <div className="rounded-2xl bg-gray-900/80 border border-white/[0.05] overflow-hidden">
                  <div className="px-5 pt-4 pb-3">
                    <p className="text-gray-500 text-xs flex items-center justify-end gap-1.5 mb-1">{canArrive ? <>الوقت المتبقي للجلسة</> : <>الجلسة تبدأ خلال</>} <Clock size={11} className="text-purple-400" /></p>
                    <div className={`text-4xl font-mono font-black tabular-nums ${(canArrive ? timeLeft : waitSeconds) < 60 ? "text-red-400" : "text-white"}`}>{formatTime(canArrive ? timeLeft : Math.ceil(waitSeconds))}</div>
                  </div>
                  <div className="h-1 bg-gray-800/60">
                    <motion.div className={`h-full ${(canArrive ? timeLeft : waitSeconds) < 60 ? "bg-gradient-to-r from-red-500 to-red-400" : "bg-gradient-to-r from-purple-500 via-violet-400 to-purple-600"}`}
                      style={{ boxShadow: (canArrive ? timeLeft : waitSeconds) < 60 ? "0 0 8px rgba(239,68,68,0.7)" : "0 0 10px rgba(139,92,246,0.7)" }}
                      animate={{ width: `${canArrive ? (timeLeft / timerDuration) * 100 : (waitSeconds / 60) * 100}%` }} transition={{ duration: 1 }} />
                  </div>
                </div>
              )}
            </motion.div>
          ) : !revealed ? (
            <motion.div key="pre-name" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-4">
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 220 }}
                className="rounded-3xl bg-purple-950/40 border border-purple-700/40 p-6 text-center space-y-2">
                <MapPin size={18} className="text-purple-400 mx-auto" />
                <p className="text-gray-500 text-xs">توجّه إلى الطاولة رقم</p>
                <div className="text-6xl font-black text-purple-300">{data?.table_number ?? "—"}</div>
                <p className="text-gray-600 text-xs">بعد الوصول، اضغط لتأكيد وصولك
                </p>
              </motion.div>
              <motion.button onClick={handleReveal} whileTap={{ scale: canArrive ? 0.97 : 1 }} disabled={!canArrive}
                className={`w-full rounded-2xl py-5 font-bold text-lg border transition-all ${canArrive
                  ? "bg-gradient-to-br from-purple-600 via-violet-600 to-purple-700 text-white shadow-2xl shadow-purple-600/40 border-purple-500/30"
                  : "bg-gray-800 text-gray-500 border-gray-700/50 cursor-not-allowed"}`}>
                {canArrive ? (
                  <motion.span animate={{ rotate: [0, -4, 4, 0] }} transition={{ duration: 3, repeat: Infinity }} className="flex items-center justify-center gap-3">
                    <MapPin size={22} /> وصلت إلى الطاولة
                  </motion.span>
                ) : (
                  <span className="flex flex-col items-center gap-1">
                    <span className="flex items-center justify-center gap-2">
                      <Clock size={20} /> سيكون الزر متاحاً خلال ({Math.ceil(waitSeconds)}ث)
                    </span>
                    <span className="text-[10px] font-normal text-gray-600">انتظر دقيقة من بدء المؤقت قبل تأكيد وصولك</span>
                  </span>
                )}
              </motion.button>
              {timerActive && timeLeft > 0 && (
                <div className="rounded-2xl bg-gray-900/80 border border-white/[0.05] overflow-hidden">
                  <div className="px-5 pt-4 pb-3">
                    <p className="text-gray-500 text-xs flex items-center justify-end gap-1.5 mb-1">{canArrive ? <>الوقت المتبقي للجلسة</> : <>الجلسة تبدأ خلال</>} <Clock size={11} className="text-purple-400" /></p>
                    <div className={`text-4xl font-mono font-black tabular-nums ${(canArrive ? timeLeft : waitSeconds) < 60 ? "text-red-400" : "text-white"}`}>{formatTime(canArrive ? timeLeft : Math.ceil(waitSeconds))}</div>
                  </div>
                  <div className="h-1 bg-gray-800/60">
                    <motion.div className={`h-full ${(canArrive ? timeLeft : waitSeconds) < 60 ? "bg-gradient-to-r from-red-500 to-red-400" : "bg-gradient-to-r from-purple-500 via-violet-400 to-purple-600"}`}
                      style={{ boxShadow: (canArrive ? timeLeft : waitSeconds) < 60 ? "0 0 8px rgba(239,68,68,0.7)" : "0 0 10px rgba(139,92,246,0.7)" }}
                      animate={{ width: `${canArrive ? (timeLeft / timerDuration) * 100 : (waitSeconds / 60) * 100}%` }} transition={{ duration: 1 }} />
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div key="post" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              {data?.same_as_phase2 && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-r from-amber-900/40 to-yellow-900/30 border border-amber-700/50 rounded-2xl p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2"><Trophy size={22} className="text-amber-400" /></div>
                  <p className="text-amber-300 font-black text-base">مطابقة مثالية!</p>
                  <p className="text-amber-400/70 text-xs mt-0.5">اخترت نفس الشخص الذي اختارته الخوارزمية</p>
                </motion.div>
              )}

              <motion.div initial={{ scale: 0.88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, delay: 0.05 }}>
                <div className="relative overflow-hidden rounded-3xl border border-purple-700/25 shadow-2xl shadow-purple-900/30">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-950 via-violet-950/80 to-purple-900/60" />
                  <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-purple-400/60 to-transparent" />
                  <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-black/30 to-transparent" />
                  <div className="relative z-10 px-6 pt-5 pb-6 text-center">
                    <div className="inline-flex items-center gap-1.5 bg-purple-900/50 border border-purple-700/40 rounded-full px-3 py-1 mb-4">
                      <Brain size={10} className="text-purple-400" />
                      <span className="text-purple-300 text-[11px] font-semibold tracking-wide">جلسة فردية · اختيار النظام</span>
                    </div>
                    <p className="text-5xl font-black text-white mb-2 tracking-tight" style={{ textShadow: '0 2px 20px rgba(139,92,246,0.3)' }}>{data?.partner_first_name || "..."}</p>
                    <p className="text-purple-400/50 text-xs mt-1">شريكك في جلسة اختيار النظام</p>
                  </div>
                </div>
              </motion.div>

              {/* Partner info card */}
              {data && <PartnerInfoCard data={data} accent="purple" />}

              <motion.button
                onClick={() => setView('session')}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl border font-bold text-base transition-all bg-purple-900/30 border-purple-700/40 text-purple-300 hover:brightness-125 active:scale-95"
              >
                انتقل إلى أسئلة الجلسة
                <ChevronRight size={16} />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Session View (in-page, Phase 3 = opposite-gender round 2) ───────── */}
      <AnimatePresence>
        {view === 'session' && (
          <motion.div
            initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-0 z-40 bg-gray-950 flex flex-col overflow-y-auto"
          >
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
              <div className="absolute -top-32 -right-24 w-96 h-96 bg-purple-500/20 rounded-full blur-[100px]" />
              <div className="absolute top-1/2 -left-20 w-80 h-80 bg-violet-500/15 rounded-full blur-[90px]" />
              <div className="absolute -bottom-20 right-1/3 w-72 h-72 bg-indigo-500/15 rounded-full blur-[80px]" />
            </div>
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-white/[0.06] bg-gray-950/80 backdrop-blur-xl">
              <button onClick={() => { setView('partner'); setRevealed(false); setTableRevealed(true) }} className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm font-medium transition-colors">
                ← رجوع
              </button>
              <span className="text-white font-bold text-sm">أسئلة الجلسة الثانية</span>
              <span className={`font-mono text-sm font-black tabular-nums ${timeLeft < 300 ? 'text-red-400' : 'text-purple-300'}`}>{formatTime(timeLeft)}</span>
            </div>
            <div className="flex-1 max-w-sm mx-auto w-full p-5 space-y-5">
              <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-purple-900/20 border border-purple-800/30">
                <span className="text-gray-500 text-xs">شريكك</span>
                <span className="text-purple-300 font-bold">{data?.partner_first_name}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-violet-950/40 border border-violet-700/40">
                <span className="text-gray-500 text-xs flex items-center gap-1.5"><MapPin size={12} className="text-violet-400" /> طاولتك</span>
                <span className="text-violet-300 text-xl font-black">{data?.table_number ?? "—"}</span>
              </div>
              {timerActive && timeLeft > 0 && (
                <div className="rounded-xl bg-gray-900/80 border border-white/[0.05] overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-gray-500 text-xs flex items-center gap-1.5"><Clock size={10} className="text-purple-400" /> الوقت المتبقي</span>
                    <span className={`font-mono font-black text-lg tabular-nums ${timeLeft < 60 ? 'text-red-400' : 'text-white'}`}>{formatTime(timeLeft)}</span>
                  </div>
                  <div className="h-[2px] bg-gray-800/60">
                    <motion.div className={`h-full ${timeLeft < 60 ? "bg-gradient-to-r from-red-500 to-red-400" : "bg-gradient-to-r from-purple-500 to-violet-400"}`}
                      style={{ boxShadow: timeLeft < 60 ? "0 0 6px rgba(239,68,68,0.6)" : "0 0 6px rgba(139,92,246,0.6)" }}
                      animate={{ width: `${(timeLeft / timerDuration) * 100}%` }} transition={{ duration: 1 }} />
                  </div>
                </div>
              )}
              <RockPaperScissors accent="purple" autoDone={rejoined} />
              <AnimatePresence>
                {showSessionTips && <SessionTips onClose={() => setShowSessionTips(false)} accent="purple" />}
              </AnimatePresence>
              <QuestionSlideshow defaultSet="set1" />
              <button onClick={() => setShowPrompt(true)}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-full text-sm font-medium bg-gradient-to-r from-purple-600/60 to-pink-600/60 hover:from-purple-600 hover:to-pink-600 text-white transition-all border border-purple-700/30">
                <MessageSquare size={14} /> أسئلة للنقاش
              </button>
              {/* Jump to feedback */}
              <motion.button
                onClick={() => setView('feedback')}
                whileTap={{ scale: 0.97 }}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-purple-700/80 to-violet-700/80 hover:from-purple-600 hover:to-violet-600 text-white text-sm font-bold transition-all shadow-lg shadow-purple-900/30 border border-purple-600/30"
              >
                <CheckCircle size={16} />
                انتهيت من الجلسة — انتقل للتقييم
              </motion.button>
              {/* Quick tips button */}
              <motion.button
                onClick={() => setShowSessionTips(true)}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                className="text-gray-600 hover:text-gray-400 text-[11px] font-medium transition-colors flex items-center gap-1.5 mx-auto"
              >
                <Sparkles size={11} />
                نصائح سريعة
              </motion.button>
            </div>
            <Suspense fallback={null}>
              {showPrompt && <PromptTopicsModal open={showPrompt} onClose={() => setShowPrompt(false)} />}
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Feedback View (Phase 3) ──────────────────────────────────────────── */}
      <AnimatePresence>
        {view === 'feedback' && (
          <FeedbackFlow
            partnerName={data?.partner_first_name || null}
            word={word}
            done={feedbackDone}
            onDone={() => setFeedbackDone(true)}
            onBack={() => setView('session')}
            isLastSession
            onSubmit={async (fbData) => {
              const d = await call('e3-submit-phase3-feedback', token, { feedback: fbData })
              if (!d.error) { toast.success('تم الحفظ'); return true }
              return false
            }}
          />
        )}
      </AnimatePresence>
    </PageWrapper>
  )
}

// ─── Processing Screen (phase2_processing / phase3_processing) ────────────────
function ProcessingScreen({ phase }: { phase: string }) {
  const isPhase2 = phase === "phase2_processing"
  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] px-6 py-10" dir="rtl">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md text-center"
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
          className="w-20 h-20 mx-auto mb-6 rounded-full border-4 border-purple-500/20 border-t-purple-400"
        />
        <h1 className="text-2xl font-bold text-white mb-3">
          {isPhase2 ? "جاري حساب نتائج اختيارك" : "جاري حساب نتائج الخوارزمية"}
        </h1>
        <p className="text-gray-400 text-sm mb-8 leading-relaxed">
          {isPhase2
            ? "نقوم بمطابقة اختيارات المشاركين وحساب التوافق. قد تستغرق هذه العملية لحظات..."
            : "نقوم بتشغيل خوارزمية التوافق وحساب أفضل المطابقات. قد تستغرق هذه العملية لحظات..."}
        </p>
        <div className="bg-purple-950/20 border border-purple-800/30 rounded-2xl p-5">
          <p className="text-purple-300/80 text-sm leading-relaxed flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4" />
            الرجاء الانتظار — ستظهر النتائج قريبًا
          </p>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Break Screen ─────────────────────────────────────────────────────────────
function BreakScreen({ timerActive, timerStart, timerDuration }: {
  timerActive: boolean; timerStart: string | null; timerDuration: number
}) {
  const [timeLeft, setTimeLeft] = useState(0)

  useEffect(() => {
    if (!timerActive || !timerStart) { setTimeLeft(0); return }
    const update = () => {
      const elapsed = Math.floor((Date.now() - new Date(timerStart).getTime()) / 1000)
      setTimeLeft(Math.max(0, timerDuration - elapsed))
    }
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [timerActive, timerStart, timerDuration])

  const mins = Math.floor(timeLeft / 60)
  const secs = timeLeft % 60
  const pct = timerDuration > 0 ? (timeLeft / timerDuration) * 100 : 0

  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] px-6 py-10" dir="rtl">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md text-center"
      >
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="w-24 h-24 mx-auto mb-6 rounded-full bg-teal-500/20 border-2 border-teal-400/40 flex items-center justify-center"
        >
          <Coffee className="w-12 h-12 text-teal-400" />
        </motion.div>

        <h1 className="text-3xl font-bold text-white mb-3">استراحة</h1>
        <p className="text-gray-400 text-sm mb-8">
          خذ استراحة قصيرة، تناول شيئًا، وارجع للكشف عن نتائجك
        </p>

        {timerActive && timeLeft > 0 ? (
          <div className="mb-8">
            <div className="text-5xl font-bold text-teal-400 font-mono mb-4">
              {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
            </div>
            <div className="h-2 bg-teal-950/60 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal-400 to-cyan-400 rounded-full transition-all duration-1000"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="mb-8 text-gray-500 text-sm">
            انتظر بدء الكشف...
          </div>
        )}

        <div className="bg-gradient-to-br from-slate-900/80 to-teal-950/40 border border-teal-800/30 rounded-2xl p-5 space-y-3 text-right">
          <p className="text-teal-300 font-bold text-sm text-center">ماذا سيحدث بعد الاستراحة؟</p>
          <div className="space-y-3 text-gray-300 text-sm leading-relaxed">
            <div className="flex items-start gap-2">
              <span className="text-teal-400 mt-0.5 shrink-0">١.</span>
              <span>ستعرف طاولتك وتتوجه إليها، ثم ستجلس <b className="text-teal-200">لقاء واحد لواحد مع اختيارك</b> لمدة 20 دقيقة. بعدها ستشاركنا انطباعك عن اللقاء.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-teal-400 mt-0.5 shrink-0">٢.</span>
              <span>ثم ستنتقل إلى طاولة جديدة وستجلس <b className="text-teal-200">لقاء واحد لواحد مع اختيارنا</b> لمدة 20 دقيقة. بعدها ستشاركنا انطباعك عن هذا اللقاء أيضًا.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-teal-400 mt-0.5 shrink-0">٣.</span>
              <span>أخيرًا، ستشاهد نتائجك النهائية وتعرف مطابقتك المثالية بناءً على تقييماتك وتقييمات الآخرين. ✨</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Final Reveal Screen ──────────────────────────────────────────────────────
function FinalRevealScreen({ token }: { token: string }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showExitPopup, setShowExitPopup] = useState(false)
  const [matchPref, setMatchPref] = useState<string | null>(null)
  const [prefSubmitting, setPrefSubmitting] = useState(false)
  const [currentEventId, setCurrentEventId] = useState<number>(1)

  // AI analysis state — one per phase
  const [ai2, setAi2] = useState<string | null>(null)
  const [ai3, setAi3] = useState<string | null>(null)
  const [generating2, setGenerating2] = useState(false)
  const [generating3, setGenerating3] = useState(false)
  const [shown2, setShown2] = useState(false)
  const [shown3, setShown3] = useState(false)
  const [typed2, setTyped2] = useState("")
  const [typed3, setTyped3] = useState("")
  const [typing2, setTyping2] = useState(false)
  const [typing3, setTyping3] = useState(false)

  useEffect(() => {
    call("e3-get-final-reveal", token).then(d => {
      if (!d.error) { setData(d); setMatchPref(d.match_preference || null); setCurrentEventId(d.current_event_id || 1) }
      setLoading(false)
    })
  }, [token])

  useEffect(() => {
    if (!data) return
    const t = setTimeout(() => setShowExitPopup(true), 2500)
    return () => clearTimeout(t)
  }, [data])

  // Typewriter effect for phase 2
  useEffect(() => {
    if (!ai2 || !shown2) return
    setTyped2("")
    setTyping2(true)
    let i = 0
    const iv = setInterval(() => {
      i++
      setTyped2(ai2.slice(0, i))
      if (i >= ai2.length) { clearInterval(iv); setTyping2(false) }
    }, 18)
    return () => clearInterval(iv)
  }, [ai2, shown2])

  // Typewriter effect for phase 3
  useEffect(() => {
    if (!ai3 || !shown3) return
    setTyped3("")
    setTyping3(true)
    let i = 0
    const iv = setInterval(() => {
      i++
      setTyped3(ai3.slice(0, i))
      if (i >= ai3.length) { clearInterval(iv); setTyping3(false) }
    }, 18)
    return () => clearInterval(iv)
  }, [ai3, shown3])

  const generateAnalysis = async (partnerNum: number, phase: 2 | 3) => {
    const setGenerating = phase === 2 ? setGenerating2 : setGenerating3
    const setAi = phase === 2 ? setAi2 : setAi3
    const setShown = phase === 2 ? setShown2 : setShown3
    setGenerating(true)
    try {
      const res = await fetch("/api/participant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate-vibe-analysis", secure_token: token, partner_number: partnerNum, event_id: currentEventId })
      })
      const d = await res.json()
      if (d.success) { setAi(d.analysis); setShown(true) }
      else toast.error("حدث خطأ أثناء التحليل")
    } catch { toast.error("تعذّر الاتصال بالخادم") }
    finally { setGenerating(false) }
  }

  const submitPref = async (pref: string) => {
    setPrefSubmitting(true)
    const d = await call("e3-submit-match-preference", token, { preference: pref })
    setPrefSubmitting(false)
    if (!d.error) { setMatchPref(pref); toast.success("تم حفظ تفضيلك") }
    else toast.error("حدث خطأ")
  }

  if (loading) return (
    <PageWrapper className="flex items-center justify-center"><Spinner size={28} /></PageWrapper>
  )

  if (!data) return (
    <PageWrapper className="flex items-center justify-center text-gray-500 text-sm">لا توجد نتائج بعد</PageWrapper>
  )

  return (
    <PageWrapper className="overflow-y-auto">
      <div className="max-w-sm mx-auto p-4 pb-6 space-y-4 text-center">
        <Brand />
        <h1 className="text-2xl font-black text-white pt-2">الكشف النهائي</h1>
        <div className="flex gap-2">
          <a href="/welcome" className="flex-1 py-2.5 rounded-xl bg-gray-800/60 border border-gray-700/50 hover:bg-gray-800 text-gray-300 text-xs font-medium transition-all flex items-center justify-center gap-1.5">
            <ChevronRight size={14} /> العودة للجلسات الفردية
          </a>
        </div>
        <InfoHint text="قارنّا بين اختيارك الشخصي واختيار الخوارزمية · راجع تفاصيل التوافق لكل طرف · وأخبرنا بمن تفضّل" delay={0.3} duration={6} />

        {data.same_match && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}
            className="bg-gradient-to-r from-amber-900/40 via-yellow-900/30 to-amber-900/40 border border-amber-600/50 rounded-2xl p-5 shadow-2xl shadow-amber-500/20">
            <div className="flex items-center justify-center mb-2"><Trophy size={28} className="text-amber-400" /></div>
            <p className="text-amber-300 font-black text-lg">مطابقة مثالية!</p>
            <p className="text-amber-400/70 text-sm mt-1">
              اخترت <strong className="text-amber-300">{data.phase2?.partner_first_name}</strong> والخوارزمية اختارت نفس الشخص
            </p>
          </motion.div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <motion.div initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
            <div className="relative overflow-hidden rounded-2xl border border-pink-800/40 shadow-xl shadow-pink-900/20 h-full flex flex-col items-center p-5 space-y-2.5 bg-gradient-to-br from-pink-950/40 to-rose-950/20">
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-pink-400/50 to-transparent" />
              <div className="w-10 h-10 rounded-xl bg-pink-900/50 border border-pink-700/40 flex items-center justify-center">
                <Heart size={18} className="text-pink-400" />
              </div>
              <p className="text-pink-400/70 text-[10px] font-semibold tracking-wide uppercase">اختيارك الشخصي</p>
              <p className="text-xl font-black text-white leading-tight">{data.phase2?.partner_first_name}</p>
              <div className="w-full flex items-center justify-center gap-1.5 pt-1">
                <div className="flex items-baseline gap-0.5">
                  <span className="text-pink-300 font-black text-lg">{data.phase2?.compatibility_score}</span>
                  <span className="text-pink-400/50 text-xs">%</span>
                </div>
              </div>
              {data.phase2?.word && (
                <span className="text-xs bg-pink-900/40 text-pink-300 border border-pink-800/40 rounded-full px-2.5 py-0.5">
                  "{data.phase2.word}"
                </span>
              )}
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
            <div className="relative overflow-hidden rounded-2xl border border-purple-800/40 shadow-xl shadow-purple-900/20 h-full flex flex-col items-center p-5 space-y-2.5 bg-gradient-to-br from-purple-950/40 to-violet-950/20">
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-purple-400/50 to-transparent" />
              <div className="w-10 h-10 rounded-xl bg-purple-900/50 border border-purple-700/40 flex items-center justify-center">
                <Brain size={18} className="text-purple-400" />
              </div>
              <p className="text-purple-400/70 text-[10px] font-semibold tracking-wide uppercase">اختيار الخوارزمية</p>
              <p className="text-xl font-black text-white leading-tight">{data.phase3?.partner_first_name}</p>
              <div className="w-full flex items-center justify-center gap-1.5 pt-1">
                <div className="flex items-baseline gap-0.5">
                  <span className="text-purple-300 font-black text-lg">{data.phase3?.compatibility_score}</span>
                  <span className="text-purple-400/50 text-xs">%</span>
                </div>
              </div>
              {data.phase3?.word && (
                <span className="text-xs bg-purple-900/40 text-purple-300 border border-purple-800/40 rounded-full px-2.5 py-0.5">
                  "{data.phase3.word}"
                </span>
              )}
            </div>
          </motion.div>
        </div>

        <p className="text-gray-500 text-xs leading-relaxed">
          {data.same_match
            ? "غريزتك والخوارزمية متوافقتان — هذا نادر الحدوث!"
            : "رأيت بعينيك، ورأت الخوارزمية بالبيانات — أيهما أصح؟"}
        </p>

        {/* Compatibility breakdown for user's choice */}
        {data.phase2?.breakdown && (
          <div className="space-y-2">
            <p className="text-pink-400/70 text-xs font-semibold text-center">تفاصيل التوافق — اختيارك</p>
            <CompatibilityBreakdown breakdown={data.phase2.breakdown} accent="pink" partnerName={data.phase2?.partner_first_name} />
          </div>
        )}

        {/* AI analysis — phase 2 */}
        {data.phase2?.partner_number && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="rounded-2xl overflow-hidden border border-pink-800/30 bg-gradient-to-br from-gray-900/80 to-gray-950/80 shadow-lg">
            {!shown2 ? (
              <div className="p-6 text-center space-y-3">
                <div className="w-10 h-10 rounded-2xl bg-pink-900/40 flex items-center justify-center mx-auto">
                  <Sparkles size={20} className="text-pink-400" />
                </div>
                <p className="text-white font-bold text-sm">لماذا توافقتما؟</p>
                <p className="text-gray-500 text-xs">تحليل ذكي للكيمياء بينك وبين اختيارك</p>
                <motion.button
                  onClick={() => generateAnalysis(data.phase2.partner_number, 2)}
                  disabled={generating2}
                  whileTap={{ scale: 0.97 }}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-700 to-rose-700 text-white text-sm font-bold disabled:opacity-60">
                  {generating2 ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      جاري التحليل…
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Sparkles size={14} /> اعرض التحليل الذكي
                    </span>
                  )}
                </motion.button>
              </div>
            ) : (
              <div>
                <div className="px-5 py-3.5 border-b border-pink-800/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles size={15} className="text-pink-400" />
                    <span className="text-pink-300 font-bold text-sm">التحليل الذكي</span>
                  </div>
                  <button onClick={() => setShown2(false)} className="text-gray-600 hover:text-gray-400 transition-colors">
                    <X size={15} />
                  </button>
                </div>
                <div className="p-5">
                  <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap text-right">
                    {typed2}
                    {typing2 && <span className="inline-block w-0.5 h-4 bg-pink-400 mr-0.5 animate-pulse align-middle" />}
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Compatibility breakdown for algorithm choice */}
        {data.phase3?.breakdown && (
          <div className="space-y-2">
            <p className="text-purple-400/70 text-xs font-semibold text-center">تفاصيل التوافق — اختيار الخوارزمية</p>
            <CompatibilityBreakdown breakdown={data.phase3.breakdown} accent="purple" partnerName={data.phase3?.partner_first_name} />
          </div>
        )}

        {/* AI analysis — phase 3 */}
        {data.phase3?.partner_number && !data.same_match && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
            className="rounded-2xl overflow-hidden border border-purple-800/30 bg-gradient-to-br from-gray-900/80 to-gray-950/80 shadow-lg">
            {!shown3 ? (
              <div className="p-6 text-center space-y-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-900/40 flex items-center justify-center mx-auto">
                  <Sparkles size={20} className="text-purple-400" />
                </div>
                <p className="text-white font-bold text-sm">لماذا اختارتك الخوارزمية؟</p>
                <p className="text-gray-500 text-xs">تحليل ذكي للكيمياء بينك وبين اختيار الخوارزمية</p>
                <motion.button
                  onClick={() => generateAnalysis(data.phase3.partner_number, 3)}
                  disabled={generating3}
                  whileTap={{ scale: 0.97 }}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-700 to-violet-700 text-white text-sm font-bold disabled:opacity-60">
                  {generating3 ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      جاري التحليل…
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Sparkles size={14} /> اعرض التحليل الذكي
                    </span>
                  )}
                </motion.button>
              </div>
            ) : (
              <div>
                <div className="px-5 py-3.5 border-b border-purple-800/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles size={15} className="text-purple-400" />
                    <span className="text-purple-300 font-bold text-sm">التحليل الذكي</span>
                  </div>
                  <button onClick={() => setShown3(false)} className="text-gray-600 hover:text-gray-400 transition-colors">
                    <X size={15} />
                  </button>
                </div>
                <div className="p-5">
                  <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap text-right">
                    {typed3}
                    {typing3 && <span className="inline-block w-0.5 h-4 bg-purple-400 mr-0.5 animate-pulse align-middle" />}
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Match preference buttons */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="rounded-2xl border border-gray-800/60 bg-gray-900/50 p-5 space-y-3">
          <p className="text-gray-300 font-bold text-sm">من تفضّل؟</p>
          <p className="text-gray-500 text-xs leading-relaxed">رأيك يصل للمنظم لمساعدتنا في تحسين التجربة. اختر من تحب مواصلته:</p>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => submitPref("choice")}
              disabled={prefSubmitting || matchPref === "choice"}
              className={`py-3 rounded-xl text-sm font-bold transition-all border ${matchPref === "choice" ? "bg-pink-600/30 border-pink-500/50 text-pink-300" : "bg-pink-950/30 border-pink-800/40 text-pink-300 hover:bg-pink-950/50"}`}
            >
              {matchPref === "choice" ? "✓ " : ""}أفضّل اختياري
            </button>
            <button
              onClick={() => submitPref("algorithm")}
              disabled={prefSubmitting || matchPref === "algorithm"}
              className={`py-3 rounded-xl text-sm font-bold transition-all border ${matchPref === "algorithm" ? "bg-purple-600/30 border-purple-500/50 text-purple-300" : "bg-purple-950/30 border-purple-800/40 text-purple-300 hover:bg-purple-950/50"}`}
            >
              {matchPref === "algorithm" ? "✓ " : ""}أفضّل الخوارزمية
            </button>
            <button
              onClick={() => submitPref("both")}
              disabled={prefSubmitting || matchPref === "both"}
              className={`py-3 rounded-xl text-sm font-bold transition-all border col-span-2 ${matchPref === "both" ? "bg-emerald-600/30 border-emerald-500/50 text-emerald-300" : "bg-gray-800/40 border-gray-700/40 text-gray-300 hover:bg-gray-800/60"}`}
            >
              {matchPref === "both" ? "✓ " : ""}كلاهما ممتاز
            </button>
          </div>
        </motion.div>

        {/* What's next CTA */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          className="rounded-2xl border border-purple-800/30 bg-gradient-to-br from-purple-950/30 to-violet-950/20 p-5 space-y-3 text-center">
          <p className="text-purple-300 font-bold text-sm flex items-center justify-center gap-1.5">
            <Home size={14} /> ماذا بعد؟
          </p>
          <p className="text-gray-400 text-xs leading-relaxed">
            ستظهر نتائجك الكاملة مع تفاصيل التوافق في صفحتك الرئيسية قريباً.
            تواصل مع المنظم لمزيد من المعلومات.
          </p>
          <a href="/welcome" className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl px-5 py-2.5 text-sm font-bold transition-all">
            <Home size={14} /> صفحتي الرئيسية
          </a>
        </motion.div>
      </div>

      {/* Exit popup */}
      <AnimatePresence>
        {showExitPopup && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setShowExitPopup(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="bg-gray-900 border border-gray-700/60 rounded-3xl p-7 max-w-sm w-full text-center space-y-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-center mb-1"><PartyPopper size={32} className="text-purple-400" /></div>
              <h2 className="text-xl font-black text-white">انتهت الفعالية!</h2>
              <p className="text-gray-400 text-sm leading-relaxed">
                راجع نتائجك وتفاصيل التوافق هنا أولاً. بعد ذلك، يمكنك اختيار من تريد مواصلة التحدث معه — سواء شريك اختيارك أو شريك الخوارزمية. يمكنك أيضاً مواصلة التحدث مع أي شخص بعد الفعالية إذا رغب الطرفان.
              </p>
              <div className="flex flex-col gap-2.5 pt-1">
                <button
                  onClick={() => setShowExitPopup(false)}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-sm font-bold transition-all"
                >
                  مراجعة النتائج هنا
                </button>
              </div>
              <p className="text-gray-600 text-[11px] leading-relaxed pt-1">
                يمكنك استئناف المحادثات مع أي شخص بعد الفعالية إذا كان الطرفان مهتمين.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageWrapper>
  )
}

// ─── Not Enrolled Screen ──────────────────────────────────────────────────────
function NotEnrolledScreen() {
  return (
    <PageWrapper className="flex items-center justify-center p-6 text-center">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="space-y-5 max-w-xs">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gray-800/80 border border-gray-700/50 flex items-center justify-center">
          <Lock size={28} className="text-gray-500" />
        </div>
        <h2 className="text-xl font-bold text-white">أنت لست مسجلاً</h2>
        <p className="text-gray-500 text-sm">رمزك صحيح، لكن لم يتم تسجيلك في هذه الفعالية.</p>
        <p className="text-gray-600 text-xs">تواصل مع المنظم للمساعدة.</p>
        <a href="/welcome" className="inline-flex items-center gap-2 text-purple-400 text-sm hover:text-purple-300 transition-colors">
          <Home size={14} /> العودة للصفحة الرئيسية
        </a>
      </motion.div>
    </PageWrapper>
  )
}


// ─── Notification Modal ───────────────────────────────────────────────────────
function NotificationModal({ token }: { token: string }) {
  const [notif, setNotif] = useState<{ notif_id: string; title: string; body: string | null; icon: string; created_at: string } | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (!token) return
    let active = true
    const poll = async () => {
      const d = await call("e3-get-notification", token)
      if (!active) return
      if (d.pending && d.notif_id && !dismissed.has(d.notif_id)) {
        setNotif({ notif_id: d.notif_id, title: d.title, body: d.body, icon: d.icon, created_at: d.created_at })
      } else {
        setNotif(null)
      }
    }
    poll()
    const iv = setInterval(poll, 5000)
    return () => { active = false; clearInterval(iv) }
  }, [token, dismissed])

  const dismiss = async () => {
    if (!notif) return
    setClosing(true)
    await call("e3-dismiss-notification", token, { notif_id: notif.notif_id })
    setTimeout(() => {
      setDismissed(prev => new Set(prev).add(notif.notif_id))
      setNotif(null)
      setClosing(false)
    }, 300)
  }

  if (!notif) return null

  const iconMap: Record<string, { icon: typeof Info; gradient: string; ring: string }> = {
    info: { icon: Info, gradient: "from-blue-500/80 to-indigo-600/80", ring: "ring-blue-400/60" },
    heart: { icon: Heart, gradient: "from-pink-500/80 to-rose-600/80", ring: "ring-pink-400/60" },
    clock: { icon: Clock, gradient: "from-amber-500/80 to-orange-600/80", ring: "ring-amber-400/60" },
    star: { icon: Star, gradient: "from-yellow-500/80 to-amber-600/80", ring: "ring-yellow-400/60" },
    alert: { icon: AlertTriangle, gradient: "from-red-500/80 to-rose-600/80", ring: "ring-red-400/60" },
  }
  const cfg = iconMap[notif.icon] || iconMap.info
  const Icon = cfg.icon

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[280] bg-black/40 backdrop-blur-md flex items-center justify-center p-5"
        onClick={dismiss}
      >
        <motion.div
          initial={{ scale: 0.92, y: 16 }}
          animate={{ scale: closing ? 0.95 : 1, y: closing ? 8 : 0, opacity: closing ? 0.5 : 1 }}
          exit={{ scale: 0.92, y: 16 }}
          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-sm rounded-3xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-7 text-center"
          dir="rtl"
        >
          <div className={`w-14 h-14 mx-auto rounded-full bg-gradient-to-br ${cfg.gradient} flex items-center justify-center mb-4 shadow-lg`}>
            <Icon size={24} className="text-white" />
          </div>
          <p className="text-xl font-black text-white mb-2">{notif.title}</p>
          {notif.body && (
            <p className="text-gray-400 text-sm leading-relaxed mb-5">{notif.body}</p>
          )}
          {!notif.body && <div className="mb-5" />}
          <button
            onClick={dismiss}
            className="w-full py-3.5 rounded-2xl font-bold text-sm bg-white/[0.06] ring-1 ring-white/[0.08] text-gray-300 hover:bg-white/[0.1] hover:text-white transition-all active:scale-[0.98]"
          >
            تم
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── Mood Check Modal ─────────────────────────────────────────────────────────
function MoodCheckModal({ token, name }: { token: string; name?: string | null }) {
  const [pendingCheck, setPendingCheck] = useState<{ check_id: string; triggered_at: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let active = true
    const poll = async () => {
      const d = await call("e3-get-mood-check", token)
      if (!active) return
      if (d.pending && d.check_id && !dismissed.has(d.check_id)) {
        // Auto-expire after 5 minutes
        const ageMs = Date.now() - new Date(d.triggered_at).getTime()
        if (ageMs > 5 * 60 * 1000) {
          await call("e3-submit-mood-check", token, { check_id: d.check_id, mood: "expired" })
          setDismissed(prev => new Set(prev).add(d.check_id))
          setPendingCheck(null)
        } else {
          setPendingCheck({ check_id: d.check_id, triggered_at: d.triggered_at })
        }
      } else {
        setPendingCheck(null)
      }
    }
    poll()
    const iv = setInterval(poll, 5000)
    return () => { active = false; clearInterval(iv) }
  }, [token, dismissed])

  const submit = async (mood: "happy" | "neutral" | "not_great") => {
    if (!pendingCheck) return
    setSelected(mood)
    setSubmitting(true)
    const d = await call("e3-submit-mood-check", token, { check_id: pendingCheck.check_id, mood })
    setSubmitting(false)
    if (d.error) { toast.error(d.error); setSelected(null); return }
    setDismissed(prev => new Set(prev).add(pendingCheck.check_id))
    setPendingCheck(null)
    setSelected(null)
    toast.success("شكراً لك")
  }

  if (!pendingCheck) return null

  const options = [
    { mood: "happy" as const, icon: <Smile size={26} />, label: "ممتاز", gradient: "from-emerald-500/80 to-teal-600/80", ring: "ring-emerald-400/60", glow: "shadow-[0_0_30px_-4px_rgba(16,185,129,0.4)]", textCls: "text-emerald-300", bgCls: "bg-emerald-500/15" },
    { mood: "neutral" as const, icon: <Meh size={26} />, label: "عادي", gradient: "from-amber-500/80 to-yellow-600/80", ring: "ring-amber-400/60", glow: "shadow-[0_0_30px_-4px_rgba(245,158,11,0.4)]", textCls: "text-amber-300", bgCls: "bg-amber-500/15" },
    { mood: "not_great" as const, icon: <Frown size={26} />, label: "مو مره", gradient: "from-red-500/80 to-rose-600/80", ring: "ring-red-400/60", glow: "shadow-[0_0_30px_-4px_rgba(239,68,68,0.4)]", textCls: "text-red-300", bgCls: "bg-red-500/15" },
  ]

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[300] bg-black/40 backdrop-blur-md flex items-center justify-center p-5"
      >
        <motion.div
          initial={{ scale: 0.92, y: 16 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.92, y: 16 }}
          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          className="w-full max-w-sm rounded-3xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-7 text-center"
          dir="rtl"
        >
          {/* Header */}
          <div className="space-y-2 mb-7">
            <div className="w-12 h-12 mx-auto rounded-full bg-gradient-to-br from-purple-500/30 to-pink-500/20 border border-purple-400/20 flex items-center justify-center mb-1">
              <Heart size={20} className="text-purple-300" />
            </div>
            <p className="text-2xl font-black text-white">{name ? `هلا ${name}` : "شلونك الحين؟"}</p>
            <p className="text-gray-500 text-sm">{name ? "شلونك الحين؟" : "كيف حاسّك هذي اللحظة"}</p>
          </div>

          {/* Options */}
          <div className="space-y-3">
            {options.map(opt => {
              const isSelected = selected === opt.mood
              return (
                <motion.button key={opt.mood} whileTap={{ scale: 0.97 }}
                  disabled={submitting}
                  onClick={() => submit(opt.mood)}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all duration-200 ${
                    isSelected
                      ? `${opt.bgCls} ring-2 ${opt.ring} ${opt.glow}`
                      : 'bg-white/[0.04] ring-1 ring-white/[0.06] hover:bg-white/[0.07]'
                  }`}>
                  <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${opt.gradient} flex items-center justify-center text-white shrink-0 transition-transform duration-200 ${isSelected ? 'scale-110' : 'scale-95 opacity-80'}`}>
                    {opt.icon}
                  </div>
                  <div className="flex-1 text-right">
                    <p className={`font-bold text-base transition-colors ${isSelected ? opt.textCls : 'text-white'}`}>{opt.label}</p>
                  </div>
                </motion.button>
              )
            })}
          </div>

          <p className="text-gray-700 text-[10px] mt-6">سري · ما يطلع عليه أحد</p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}


// ─── Root Component ───────────────────────────────────────────────────────────
export default function Event3Page() {
  const [searchParams] = useSearchParams()
  const isImpersonating = searchParams.get("impersonate") === "1"
  const [token, setToken] = useState<string | null>(() => {
    const p = searchParams.get("token") || searchParams.get("t")
    if (p) return p
    if (isImpersonating) return null
    return (typeof window !== "undefined" ? localStorage.getItem("blindmatch_result_token") : null) || null
  })

  const [showWelcome, setShowWelcome] = useState(true)
  const [enrolled, setEnrolled] = useState<boolean | null>(null)
  const [myInfo, setMyInfo] = useState<{ number: number; name: string; gender: string | null } | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  const [tokenError, setTokenError] = useState(false)

  const fetchState = useCallback(async () => {
    if (!token) throw new Error("No token")
    const d = await call("e3-get-state", token)
    if (d.error) {
      if (d.error.includes("Invalid") || d.error.includes("token") || d.error.includes("expired") || d.error.includes("لم يتم العثور") || d.error.includes("غير مسجّل")) {
        setTokenError(true)
        if (!isImpersonating) localStorage.removeItem("blindmatch_result_token")
      }
      throw new Error(d.error)
    }
    setEnrolled(prev => prev === null ? (d.enrolled !== false) : prev)
    setMyInfo(prev => prev ?? (d.my_info || null))
    return d
  }, [token])

  const { data: eventState, loading: stateLoading, error: stateError, retry: retryState } = useApiPoll(fetchState, {
    interval: 5000,
    enabled: !!token && !tokenError
  })

  // Phase change detection — play sound + vibrate when event starts (setup → round1)
  const prevPhaseRef = useRef<string | null>(null)
  useEffect(() => {
    if (!eventState) return
    const cur = eventState.phase
    const prev = prevPhaseRef.current
    if (prev === "setup" && cur === "round1") {
      playEventStartSound()
      vibrate([200, 100, 200, 100, 400])
    }
    // Clear arrived flags when returning to setup (e.g. test mode reset)
    if (cur === "setup") {
      clearAllArrived()
    }
    prevPhaseRef.current = cur
  }, [eventState?.phase])

  useEffect(() => {
    const p = searchParams.get("token") || searchParams.get("t")
    if (p) { setToken(p); if (!isImpersonating) localStorage.setItem("blindmatch_result_token", p) }
  }, [searchParams])

  // Online/offline detection
  useEffect(() => {
    const goOffline = () => setIsOffline(true)
    const goOnline = () => setIsOffline(false)
    window.addEventListener("offline", goOffline)
    window.addEventListener("online", goOnline)
    setIsOffline(!navigator.onLine)
    return () => {
      window.removeEventListener("offline", goOffline)
      window.removeEventListener("online", goOnline)
    }
  }, [])

  const handleWelcomeDone = useCallback(() => {
    setShowWelcome(false)
  }, [])

  if (showWelcome) return <WelcomeScreen onDone={handleWelcomeDone} />
  if (!token || tokenError) return <PhoneEntry onToken={t => { setToken(t); setTokenError(false) }} />

  if (stateLoading && !eventState) return (
    <PageWrapper className="flex items-center justify-center">
      <Spinner size={28} />
    </PageWrapper>
  )

  if (stateError && !eventState) return (
    <PageWrapper className="flex flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-red-950/40 border border-red-800/40 flex items-center justify-center">
        <AlertTriangle className="text-red-400" size={28} />
      </div>
      <div className="space-y-1">
        <p className="text-white font-semibold">تعذّر تحميل بيانات الفعالية</p>
        <p className="text-gray-500 text-sm">{stateError}</p>
      </div>
      <button onClick={retryState} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium transition-colors">
        <RefreshCw size={16} />
        إعادة المحاولة
      </button>
    </PageWrapper>
  )

  const { phase, timer_active, timer_start, timer_duration } = eventState
  const timerProps = { timerActive: timer_active, timerStart: timer_start, timerDuration: timer_duration }

  if (enrolled === false) return <NotEnrolledScreen />

  const isRound = /^round[123]$/.test(phase)
  const rankingMatch = phase.match(/^ranking([123])$/)
  const completedRounds = rankingMatch ? parseInt(rankingMatch[1]) : null

  return (
    <div className="h-[100dvh] flex flex-col bg-gray-950 overflow-hidden" dir="rtl">
      <Toaster position="top-center" toastOptions={{ style: { background: "#1f2937", color: "#f9fafb", border: "1px solid #374151", borderRadius: "12px" } }} />

      {/* Impersonation banner */}
      {isImpersonating && (
        <div className="fixed top-0 left-0 right-0 z-[300] bg-amber-900/90 border-b border-amber-600/50 px-4 py-1.5 text-center">
          <span className="text-amber-200 text-xs font-medium">
            🎭 وضع تسجيل دخول مؤقت — أنت تتصرف كمشارك #{myInfo?.number ?? "?"} ({myInfo?.name ?? "..."})
          </span>
        </div>
      )}

      {/* Offline indicator */}
      {isOffline && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[250] bg-orange-950/90 backdrop-blur-md border border-orange-800/50 rounded-full px-4 py-1.5 shadow-lg">
          <span className="text-orange-300 text-xs font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
            لا يوجد اتصال — بعض الميزات قد لا تعمل
          </span>
        </div>
      )}

      {/* Screen content fills available space */}
      <div className="flex-1 overflow-y-auto relative z-10">
        <AnimatePresence>
          {phase === "setup" && <SetupScreen key="setup" token={token} myInfo={myInfo} enrolledCount={eventState?.participants_selected ?? null} />}
          {isRound && <RoundScreen key={phase} token={token} phase={phase} {...timerProps} myInfo={myInfo} />}
          {completedRounds && <RankingScreen key={phase} token={token} completedRounds={completedRounds} currentPhase={phase} {...timerProps} />}
          {phase === "phase2_reveal" && <Phase2RevealScreen key="p2r" token={token} eventId={eventState?.event_id} {...timerProps} />}
          {phase === "phase3_reveal" && <Phase3RevealScreen key="p3r" token={token} eventId={eventState?.event_id} {...timerProps} />}
          {(phase === "phase2_processing" || phase === "phase3_processing") && <ProcessingScreen key="processing" phase={phase} />}
          {phase === "break" && <BreakScreen key="break" {...timerProps} />}
          {phase === "final_reveal" && <FinalRevealScreen key="final" token={token} />}
        </AnimatePresence>
      </div>

      {/* SOS button — hidden on final reveal, break, and ranking pages */}
      {enrolled && !rankingMatch && phase !== "final_reveal" && phase !== "break" && <SOSButton token={token} position="bottom" />}

      {/* Mood check popup — polls for admin-triggered mood checks */}
      {enrolled && token && <MoodCheckModal token={token} name={myInfo?.name} />}
      {/* Notification popup — polls for admin-sent notifications */}
      {enrolled && token && <NotificationModal token={token} />}
    </div>
  )
}
