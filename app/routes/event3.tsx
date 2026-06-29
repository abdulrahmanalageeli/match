import { useState, useEffect, useCallback, lazy, Suspense } from "react"
import GroupsPage from "./groups"
import { useSearchParams } from "react-router"
import toast, { Toaster } from "react-hot-toast"
import { motion, AnimatePresence, Reorder } from "framer-motion"
import confetti from "canvas-confetti"
import {
  Clock, MapPin, Heart, Brain, ChevronDown, ExternalLink,
  CheckCircle, Send, RefreshCw, Sparkles, Home, Trophy, Lock, GripVertical,
  MessageSquare, ChevronRight, Users, PenLine, Shuffle, BarChart3, GitMerge,
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

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
}

// ─── Shared Design Components ─────────────────────────────────────────────────
function PageWrapper({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-h-screen bg-gray-950 relative overflow-hidden ${className}`} dir="rtl">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-20 w-[550px] h-[550px] bg-purple-600/20 rounded-full blur-[120px]" />
        <div className="absolute -bottom-32 -left-20 w-[500px] h-[500px] bg-pink-600/18 rounded-full blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 w-[380px] h-[380px] bg-violet-500/12 rounded-full blur-[90px] -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute top-1/4 -left-16 w-[300px] h-[300px] bg-rose-500/10 rounded-full blur-[80px]" />
        <div className="absolute bottom-1/4 -right-10 w-[260px] h-[260px] bg-fuchsia-600/10 rounded-full blur-[80px]" />
      </div>
      <div className="relative z-10">{children}</div>
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
      <div className="text-[10px] text-gray-600 tracking-widest font-medium mt-0.5">VERSION 3.0</div>
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

// ─── Welcome & Event Flow Onboarding ─────────────────────────────────────────
const FLOW_STEPS = [
  {
    Icon: Users,
    gradient: "from-blue-600 via-blue-700 to-blue-900",
    glowClass: "shadow-blue-600/40",
    badge: "الخطوة ١",
    phase: "الجلسة الأولى",
    title: "تعرّف على مجموعتك",
    desc: "تجلس مع ٤ إلى ٦ أشخاص في جلسة تفاعلية منظّمة — فرصة حقيقية للتعارف في بيئة محايدة.",
  },
  {
    Icon: Shuffle,
    gradient: "from-teal-600 via-teal-700 to-cyan-900",
    glowClass: "shadow-teal-500/40",
    badge: "الخطوة ٢",
    phase: "الجلسة الثانية",
    title: "مجموعة مختلفة كلياً",
    desc: "الخوارزمية تضمن ألّا يتكرر أحد — ستنضم لمجموعة جديدة لم تلتقِ بأحد أفرادها من قبل.",
  },
  {
    Icon: BarChart3,
    gradient: "from-indigo-600 via-indigo-700 to-violet-900",
    glowClass: "shadow-indigo-600/40",
    badge: "الخطوة ٣",
    phase: "التصنيف",
    title: "رتّب اختياراتك",
    desc: "بعد الجلستين، رتّب الأشخاص الذين قابلتهم بحسب مستوى التوافق الذي شعرت به — ترتيبك يصنع نتيجتك.",
  },
  {
    Icon: GitMerge,
    gradient: "from-slate-600 via-slate-700 to-blue-900",
    glowClass: "shadow-slate-500/30",
    badge: "الخطوة ٤",
    phase: "الكشف الأول",
    title: "التوافق المتبادل",
    desc: "يُكشف الأزواج الذين اختار كل منهم الآخر — جلسة ثنائية لاستكشاف أوجه التشابه والاختلاف.",
  },
  {
    Icon: Brain,
    gradient: "from-violet-600 via-purple-700 to-indigo-900",
    glowClass: "shadow-violet-600/40",
    badge: "الخطوة ٥",
    phase: "تحليل الخوارزمية",
    title: "ما يقوله العلم",
    desc: "خوارزمية متخصصة تحلّل بياناتك وبيانات جميع المشاركين لتحديد التوافق الأمثل بشكل موضوعي.",
  },
  {
    Icon: Trophy,
    gradient: "from-amber-500 via-orange-600 to-amber-700",
    glowClass: "shadow-amber-500/40",
    badge: "الخطوة ٦",
    phase: "النتيجة النهائية",
    title: "مقارنة النتيجتين",
    desc: "هل تطابق اختيارك الشخصي مع اختيار الخوارزمية؟ اكتشف مدى انسجام حدسك مع التحليل العلمي.",
  },
]

function WelcomeScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"splash" | "steps">("splash")
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)

  const goNext = () => {
    if (step < FLOW_STEPS.length - 1) {
      setDir(1); setStep(s => s + 1)
    } else {
      try { confetti({ particleCount: 90, spread: 75, origin: { y: 0.5 }, colors: ["#a855f7","#ec4899","#f43f5e","#fbbf24"] }) } catch {}
      setTimeout(onDone, 450)
    }
  }
  const goPrev = () => { if (step > 0) { setDir(-1); setStep(s => s - 1) } }

  const s = FLOW_STEPS[step]

  return (
    <div className="min-h-screen bg-gray-950 relative overflow-hidden" dir="rtl">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none">
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
            className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 text-center"
          >
            {/* Logo + pulsing rings */}
            <div className="relative mb-8 flex items-center justify-center">
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  className="absolute rounded-full border border-purple-400/25"
                  style={{ width: `${128 + i * 44}px`, height: `${128 + i * 44}px` }}
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
              className="space-y-3 mb-10"
            >
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="flex items-center justify-center gap-2"
              >
                <Sparkles size={12} className="text-purple-400" />
                <span className="text-[11px] font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent tracking-[0.18em] uppercase">
                  التوافق الأعمى — الجيل الثالث
                </span>
                <Sparkles size={12} className="text-pink-400" />
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.65 }}
                className="text-[2.6rem] font-black text-white leading-tight"
              >
                التوافق الأعمى<br />
                <span className="bg-gradient-to-r from-purple-400 via-violet-400 to-indigo-400 bg-clip-text text-transparent">
                  الجيل الثالث
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
                onClick={() => setPhase("steps")}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-2xl py-4 font-black text-lg shadow-2xl shadow-purple-600/30 transition-all"
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

        {/* ── WALKTHROUGH STEPS ─────────────────────────────────────────── */}
        {phase === "steps" && (
          <motion.div
            key="steps"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 min-h-screen flex flex-col"
          >
            {/* Top progress bar */}
            <div className="w-full h-1 bg-gray-800/50">
              <motion.div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                animate={{ width: `${((step + 1) / FLOW_STEPS.length) * 100}%` }}
                transition={{ duration: 0.45, ease: "easeInOut" }}
              />
            </div>

            {/* Header nav */}
            <div className="flex items-center justify-between px-5 py-4">
              <button
                onClick={() => step === 0 ? setPhase("splash") : goPrev()}
                className="flex items-center gap-1 text-gray-500 text-sm hover:text-gray-400 transition-colors"
              >
                <ChevronRight size={15} className="rotate-180" />
                {step === 0 ? "الشاشة الرئيسية" : "السابق"}
              </button>
              <span className="text-gray-600 text-xs font-mono tabular-nums">{step + 1} / {FLOW_STEPS.length}</span>
            </div>

            {/* Step card */}
            <div className="flex-1 flex flex-col items-center justify-center px-5 py-2">
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
                  className="w-full max-w-sm"
                >
                  <div className={`rounded-3xl overflow-hidden shadow-2xl ${s.glowClass}`}>
                    {/* Gradient header */}
                    <div className={`bg-gradient-to-br ${s.gradient} px-7 pt-7 pb-6 text-center relative overflow-hidden`}>
                      {/* Subtle dot pattern */}
                      <div
                        className="absolute inset-0 opacity-[0.07]"
                        style={{
                          backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
                          backgroundSize: "28px 28px",
                        }}
                      />
                      <div className="relative z-10 space-y-3">
                        {/* Badges */}
                        <div className="flex items-center justify-center gap-2">
                          <span className="bg-white/25 backdrop-blur-sm text-white text-[10px] font-black px-3 py-1 rounded-full tracking-widest">
                            {s.badge}
                          </span>
                          <span className="bg-black/20 text-white/70 text-[10px] px-2.5 py-1 rounded-full">
                            {s.phase}
                          </span>
                        </div>
                        {/* Step icon */}
                        <motion.div
                          initial={{ scale: 0.2, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.08 }}
                          className="py-4 flex items-center justify-center"
                        >
                          <s.Icon size={68} className="text-white/90" strokeWidth={1.25} />
                        </motion.div>
                        {/* Title */}
                        <motion.h2
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.12 }}
                          className="text-2xl font-black text-white leading-tight"
                        >
                          {s.title}
                        </motion.h2>
                      </div>
                    </div>
                    {/* Description panel */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.18 }}
                      className="bg-gray-900/95 backdrop-blur-sm px-6 py-5"
                    >
                      <p className="text-gray-300 text-sm leading-relaxed text-center">{s.desc}</p>
                    </motion.div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Bottom navigation */}
            <div className="px-5 pb-8 pt-3 space-y-4">
              {/* Dot indicators */}
              <div className="flex items-center justify-center gap-1.5">
                {FLOW_STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => { setDir(i > step ? 1 : -1); setStep(i) }}
                    className={`rounded-full transition-all duration-300 ${
                      i === step ? "w-6 h-2 bg-white" : "w-2 h-2 bg-gray-700 hover:bg-gray-500"
                    }`}
                  />
                ))}
              </div>
              {/* Next button */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={goNext}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-2xl py-4 font-black text-lg shadow-xl shadow-purple-600/25 transition-all"
              >
                {step === FLOW_STEPS.length - 1 ? "أبدأ رحلتي ✨" : "التالي ←"}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Token Entry Screen ───────────────────────────────────────────────────────
function TokenEntry({ onToken }: { onToken: (t: string) => void }) {
  const [val, setVal] = useState(() => (typeof window !== "undefined" ? localStorage.getItem("blindmatch_result_token") : null) || "")

  const submit = () => {
    if (val.trim()) { localStorage.setItem("blindmatch_result_token", val.trim()); onToken(val.trim()) }
    else toast.error("أدخل رمزك أولاً")
  }

  return (
    <PageWrapper className="flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-sm space-y-8 text-center"
      >
        <div className="space-y-5">
          <motion.div
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 240, delay: 0.1 }}
            className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-purple-600 via-pink-600 to-rose-600 flex items-center justify-center shadow-2xl shadow-purple-600/40"
          >
            <Heart size={36} className="text-white" fill="white" />
          </motion.div>
          <Brand />
          <div>
            <h1 className="text-3xl font-black text-white">أهلاً بك</h1>
            <p className="text-gray-500 text-sm mt-2">أدخل رمزك الشخصي للانضمام إلى الفعالية</p>
          </div>
        </div>

        <GlassCard className="p-6 space-y-4 shadow-2xl shadow-black/30">
          <input
            type="text"
            placeholder="أدخل رمز الدخول هنا"
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submit()}
            className="w-full bg-gray-800/80 border border-gray-700/60 text-white rounded-xl px-4 py-3.5 text-center text-lg focus:outline-none focus:border-purple-500/70 focus:bg-gray-800/90 transition-all placeholder:text-gray-600"
          />
          <motion.button
            onClick={submit}
            whileTap={{ scale: 0.97 }}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl py-3.5 font-bold text-lg shadow-lg shadow-purple-600/30 transition-all"
          >
            دخول ✨
          </motion.button>
        </GlassCard>
      </motion.div>
    </PageWrapper>
  )
}

// ─── Waiting / Setup Screen ───────────────────────────────────────────────────
function SetupScreen({ token }: { token: string }) {
  const [enrolledCount, setEnrolledCount] = useState<number | null>(null)

  useEffect(() => {
    const fetchCount = () => call("e3-get-state", token).then(d => {
      if (d && !d.error && d.participants_selected != null) setEnrolledCount(d.participants_selected)
    })
    fetchCount()
    const iv = setInterval(fetchCount, 5000)
    return () => clearInterval(iv)
  }, [token])

  return (
    <PageWrapper className="flex items-center justify-center p-6 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        className="space-y-6 max-w-sm w-full"
      >
        <motion.div
          animate={{ scale: [1, 1.08, 1], rotate: [0, 8, -8, 0] }}
          transition={{ duration: 3.5, repeat: Infinity, repeatDelay: 0.5 }}
          className="text-7xl mx-auto w-fit"
        >✨</motion.div>
        <Brand />
        <GlassCard className="p-8 space-y-4 shadow-xl shadow-black/20">
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
          {enrolledCount != null && enrolledCount > 0 && (
            <div className="flex items-center justify-center gap-2 pt-1">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-400 text-xs font-medium">{enrolledCount} مشارك مسجّل</span>
            </div>
          )}
        </GlassCard>
      </motion.div>
    </PageWrapper>
  )
}

// ─── Round Screen ─────────────────────────────────────────────────────────────
function RoundScreen({ token, phase, timerActive, timerStart, timerDuration }: {
  token: string; phase: string; timerActive: boolean; timerStart: string | null; timerDuration: number
}) {
  const round = parseInt(phase.replace("round", "")) || 1
  const [assignment, setAssignment] = useState<any>(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [showGroups, setShowGroups] = useState(false)

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

  const roundAr = ["الأولى", "الثانية"][round - 1] || round
  const RC = [
    { badge: "bg-blue-900/30 border-blue-700/40 text-blue-300", card: "border-blue-800/40", num: "text-blue-300", pill: "bg-blue-900/40 text-blue-300 border-blue-800/40", bar: "from-blue-500 to-cyan-500" },
    { badge: "bg-indigo-900/30 border-indigo-700/40 text-indigo-300", card: "border-indigo-800/40", num: "text-indigo-300", pill: "bg-indigo-900/40 text-indigo-300 border-indigo-800/40", bar: "from-indigo-500 to-purple-500" },
  ][round - 1] || { badge: "bg-purple-900/30 border-purple-700/40 text-purple-300", card: "border-purple-800/40", num: "text-purple-300", pill: "bg-purple-900/40 text-purple-300 border-purple-800/40", bar: "from-purple-500 to-pink-500" }

  const timerBarH = timerActive && timeLeft > 0 ? "64px" : "0px"

  return (
    <div className="min-h-screen bg-gray-950 relative overflow-hidden" dir="rtl">
      {/* Background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-16 w-[520px] h-[520px] bg-purple-600/20 rounded-full blur-[110px]" />
        <div className="absolute -bottom-24 -left-16 w-[460px] h-[460px] bg-pink-600/18 rounded-full blur-[100px]" />
        <div className="absolute top-1/2 right-1/3 w-[340px] h-[340px] bg-blue-500/10 rounded-full blur-[90px] -translate-y-1/2" />
        <div className="absolute top-1/4 left-1/4 w-[260px] h-[260px] bg-cyan-500/8 rounded-full blur-[80px]" />
      </div>

      {/* ── Sticky Timer Strip ─────────────────────────────────────── */}
      <AnimatePresence>
        {timerActive && timeLeft > 0 && (
          <motion.div
            initial={{ y: -64 }} animate={{ y: 0 }} exit={{ y: -64 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed top-0 inset-x-0 z-50 bg-gray-950/90 backdrop-blur-xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 h-14 max-w-sm mx-auto">
              <div className="flex items-center gap-2">
                <Clock size={13} className="text-purple-400" />
                <span className="text-gray-500 text-xs">الوقت المتبقي</span>
              </div>
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
        className="relative z-10 flex flex-col items-center justify-center p-6 min-h-screen"
        style={{ paddingTop: `calc(1.5rem + ${timerBarH})` }}
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

          {assignment ? (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <GlassCard className={`p-7 space-y-4 border ${RC.card} shadow-xl shadow-black/20`}>
                <p className="text-gray-500 text-xs flex items-center justify-center gap-1.5">
                  <MapPin size={12} /> مكانك هذه الجولة
                </p>
                <div className={`text-8xl font-black leading-none ${RC.num}`}>{assignment.table}</div>
                <p className="text-gray-500 text-sm font-medium">طاولة رقم</p>
                {assignment.tablemates?.length > 0 && (
                  <div className="pt-4 border-t border-gray-800/60">
                    <p className="text-gray-600 text-xs mb-3">رفاقك في الطاولة</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {assignment.tablemates.map((m: any) => (
                        <span key={m.number} className={`${RC.pill} border rounded-full px-3 py-1 text-sm font-medium`}>
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
                  <div className="text-2xl">⏰</div>
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

          {/* Groups button */}
          <motion.button
            onClick={() => setShowGroups(true)}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
            className={`flex items-center justify-center gap-3 w-full py-4 rounded-2xl border font-bold text-base transition-all ${RC.badge} hover:brightness-125 active:scale-95`}
          >
            نشاطات المجموعة 🎯
            <ExternalLink size={15} />
          </motion.button>

          <p className="text-gray-600 text-xs">
            {round === 1 && "تعارف جماعي على طاولتك — ستختار بعدها من تريد جلسة فردية معه"}
            {round === 2 && "آخر جولة جماعية — بعدها ستُرتّب الأولويات لتحديد جلستك الفردية"}
          </p>

        </div>
      </motion.div>

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
              <span className="font-bold text-white flex items-center gap-2">🎯 نشاطات المجموعة</span>
              <button
                onClick={() => setShowGroups(false)}
                className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm font-medium"
              >
                رجوع ← 
              </button>
            </div>
            {/* Groups content rendered inline */}
            <div className="flex-1 overflow-y-auto">
              <GroupsPage />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Ranking Screen ───────────────────────────────────────────────────────────
function RankingScreen({ token, completedRounds }: { token: string, completedRounds: number }) {
  const [people, setPeople] = useState<any[]>([])
  const [order, setOrder] = useState<number[]>([])
  const [newNums, setNewNums] = useState<Set<number>>(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [openNote, setOpenNote] = useState<number | null>(null)
  const [savingNote, setSavingNote] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      call("e3-get-participants-met", token, { completed_rounds: completedRounds }),
      call("e3-get-notes", token),
    ]).then(([d, nd]) => {
      if (d.error) { toast.error(d.error); return }
      const allPeople: any[] = d.people || []
      const existingRankings: Record<number, number> = d.existing_rankings || {}
      if (d.already_submitted) setSubmitted(true)
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
      setLoading(false)

      if (!nd.error && nd.notes) setNotes(nd.notes)
    })
  }, [token, completedRounds])

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
    toast.success("تم حفظ تصنيفاتك! ✨")
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
    <PageWrapper>
      <div className="max-w-md mx-auto pb-36">

        {/* Sticky header */}
        <div className="sticky top-0 bg-gray-950/95 backdrop-blur-md z-10 border-b border-gray-800/50">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Trophy size={16} className="text-amber-400" />
              <h1 className="text-lg font-bold text-white">رتّب أولوياتك</h1>
            </div>
            <p className="text-gray-500 text-xs text-center">
              قابلت <span className="text-white font-semibold">{people.length} أشخاص</span> في الجولات الجماعية — رتّبهم لتحديد جلستك الفردية
            </p>
            <p className="text-purple-400/80 text-[11px] text-center mt-1">✨ ترتيبك سيُستخدم لاختيار من ستلتقيه في جلستك الفردية الأولى</p>
            {newNums.size > 0 && (
              <p className="text-purple-400 text-[11px] text-center mt-1 font-medium">
                ✨ {newNums.size} أشخاص جدد من الجولة {completedRounds} أُضيفوا في الأسفل
              </p>
            )}
            <p className="text-gray-700 text-[11px] text-center mt-0.5">اسحب الأسماء لإعادة الترتيب · هذا التصنيف سري تماماً</p>
          </div>

          {/* Round legend */}
          <div className="px-5 pb-3 flex gap-2 justify-center flex-wrap">
            {[1, 2].map(r => (
              <span key={r} className={`text-xs px-3 py-1 rounded-full border ${roundStyle(r)}`}>
                {roundLabel(r)}
              </span>
            ))}
          </div>

          {submitted && (
            <div className="mx-5 mb-3 flex items-center gap-2 bg-green-900/20 border border-green-800/40 rounded-xl px-3 py-2">
              <CheckCircle size={13} className="text-green-400" />
              <span className="text-green-400 text-xs">تصنيفك محفوظ — يمكنك التعديل وإعادة الإرسال</span>
            </div>
          )}
        </div>

        {/* Drag-to-reorder list */}
        <div className="p-4">
          <Reorder.Group axis="y" values={order} onReorder={setOrder} className="space-y-2.5" as="div">
            {order.map((num, idx) => {
              const p = personMap[num]
              if (!p) return null
              return (
                <Reorder.Item
                  key={num}
                  value={num}
                  as="div"
                  className="p-3.5 rounded-2xl border border-gray-800/60 bg-gray-900/70 backdrop-blur-sm cursor-grab active:cursor-grabbing touch-none select-none"
                  whileDrag={{
                    scale: 1.04,
                    boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
                    borderColor: "rgba(139,92,246,0.5)",
                    backgroundColor: "rgba(88,28,135,0.2)",
                    zIndex: 50,
                  }}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.02 }}
                >
                  {/* Top row */}
                  <div className="flex items-center gap-3">
                    {/* Rank badge */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0 ${rankStyle(idx)}`}>
                      {idx + 1}
                    </div>

                    {/* Name + number + round */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-sm leading-tight">{p.first_name}</span>
                        <span className="text-[10px] text-gray-600 font-mono">#{p.number}</span>
                        {newNums.has(num) && (
                          <span className="text-[10px] bg-purple-900/60 text-purple-300 border border-purple-700/50 rounded-full px-1.5 py-0.5 font-semibold">جديد ✨</span>
                        )}
                      </div>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border mt-1 inline-block ${roundStyle(p.round)}`}>
                        {roundLabel(p.round)}
                      </span>
                    </div>

                    {/* Note toggle button */}
                    <button
                      onClick={e => { e.stopPropagation(); setOpenNote(openNote === num ? null : num) }}
                      onPointerDown={e => e.stopPropagation()}
                      className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg transition-all ${
                        notes[num]
                          ? "bg-amber-500/15 border border-amber-600/30 text-amber-400"
                          : "text-gray-700 hover:text-gray-500"
                      }`}
                      title="ملاحظة خاصة"
                    >
                      <PenLine size={13} />
                    </button>

                    {/* Drag handle */}
                    <GripVertical size={17} className="text-gray-600 flex-shrink-0" />
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
                        <div className="pt-3 mt-3 border-t border-gray-800/50">
                          <textarea
                            value={notes[num] || ""}
                            onChange={e => setNotes(prev => ({ ...prev, [num]: e.target.value }))}
                            onBlur={() => saveNote(num, notes[num] || "")}
                            placeholder="ملاحظة خاصة — لن يراها أحد غيرك..."
                            rows={2}
                            dir="rtl"
                            className="w-full bg-gray-800/60 border border-gray-700/50 focus:border-amber-600/50 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 resize-none outline-none transition-colors cursor-text"
                          />
                          <p className="text-[10px] mt-1 text-right transition-colors" style={{ color: savingNote === num ? "#f59e0b" : "#374151" }}>
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
      <div className="fixed bottom-0 inset-x-0 p-5 bg-gradient-to-t from-gray-950 via-gray-950/95 to-transparent pt-10">
        <div className="max-w-md mx-auto">
          <motion.button
            onClick={submit}
            disabled={submitting}
            whileTap={{ scale: 0.97 }}
            className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-60 text-white rounded-2xl py-4 font-bold text-base shadow-2xl shadow-purple-600/30 transition-all"
          >
            {submitting ? <Spinner size={18} className="!text-white" /> : <Send size={18} />}
            {submitted ? "تحديث التصنيف" : "إرسال التصنيف النهائي"}
          </motion.button>
          {submitted ? (
            <p className="text-center text-green-400 text-xs mt-2.5 flex items-center justify-center gap-1.5">
              <CheckCircle size={11} /> محفوظ — انتظر كشف النتائج
            </p>
          ) : (
            <p className="text-center text-gray-700 text-[11px] mt-2">
              النظام سيختار توافقك الأمثل من تصنيفاتك
            </p>
          )}
        </div>
      </div>
    </PageWrapper>
  )
}


// ─── Phase 2 Reveal Screen ────────────────────────────────────────────────────
function Phase2RevealScreen({ token, timerActive, timerStart, timerDuration }: {
  token: string; timerActive: boolean; timerStart: string | null; timerDuration: number
}) {
  const [data, setData] = useState<any>(null)
  const [revealed, setRevealed] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [word, setWord] = useState("")
  const [wordSubmitted, setWordSubmitted] = useState(false)
  const [view, setView] = useState<'partner' | 'session' | 'feedback'>('partner')
  const [showPrompt, setShowPrompt] = useState(false)
  const [feedbackDone, setFeedbackDone] = useState(false)
  const [fb, setFb] = useState({ compatibilityRate: 50, sliderMoved: false, conversationQuality: 3, personalConnection: 3, sharedInterests: 3, comfortLevel: 3, communicationStyle: 3, wouldMeetAgain: 3, overallExperience: 3, wantConnect: null as boolean | null, organizerImpression: '', recommendations: '', participantMessage: '' })
  const [submittingFb, setSubmittingFb] = useState(false)

  const submitFb = async () => {
    if (fb.wantConnect === null) { toast.error('يرجى الإجابة على سؤال التواصل'); return }
    setSubmittingFb(true)
    const d = await call('e3-submit-phase2-feedback', token, { feedback: { ...fb, word } })
    setSubmittingFb(false)
    if (!d.error) { setFeedbackDone(true); toast.success('تم الحفظ ✨') }
  }

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
  useEffect(() => {
    if (!data || !timerActive || !timerStart) return
    const elapsed = Math.floor((Date.now() - new Date(timerStart).getTime()) / 1000)
    const remaining = Math.max(0, timerDuration - elapsed)
    if (elapsed > 60 && remaining > 0) { setRevealed(true); setView('session') }
    else if (remaining <= 0) { setRevealed(true); setView('feedback') }
  }, [data, timerActive, timerStart, timerDuration])

  // Transition to feedback when session time runs out
  useEffect(() => {
    if (view === 'session' && timerActive && timeLeft === 0) setView('feedback')
  }, [timeLeft, view, timerActive])

  const handleReveal = () => {
    setRevealed(true)
    try { confetti({ particleCount: 55, spread: 65, origin: { y: 0.45 }, colors: ["#ec4899", "#f43f5e", "#fb7185", "#be185d"] }) } catch {}
  }

  const submitWord = async () => {
    if (!word.trim()) return
    const d = await call("e3-submit-phase2-word", token, { word: word.trim() })
    if (!d.error) { setWordSubmitted(true); toast.success("تم الحفظ! ✨") }
  }

  return (
    <PageWrapper>
      <div className="max-w-sm mx-auto p-5 pb-10 space-y-4">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="text-center pt-4 space-y-1">
          <div className="flex flex-col items-center gap-1.5">
            <div className="inline-flex items-center gap-2 bg-pink-900/30 border border-pink-700/40 text-pink-300 rounded-full px-4 py-1.5 text-sm font-semibold">
              <Heart size={13} fill="currentColor" /> جلسة فردية 1:1 · اختيارك أنت
            </div>
            <p className="text-gray-600 text-xs">جلسة خاصة مع الشخص الذي اخترته من جولات التعارف</p>
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {!revealed ? (
            <motion.div key="pre" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-4">
              <motion.button onClick={handleReveal} whileTap={{ scale: 0.97 }}
                className="w-full bg-gradient-to-br from-pink-600 via-rose-600 to-pink-700 text-white rounded-2xl py-8 font-bold text-xl shadow-2xl shadow-pink-600/40 border border-pink-500/30">
                <motion.span animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 1.8, repeat: Infinity }} className="flex items-center justify-center gap-3">
                  <Heart size={24} fill="white" /> اكشف اسمه / اسمها
                </motion.span>
              </motion.button>
              {timerActive && timeLeft > 0 && (
                <div className="rounded-2xl bg-gray-900/80 border border-white/[0.05] overflow-hidden">
                  <div className="px-5 pt-4 pb-3">
                    <p className="text-gray-500 text-xs flex items-center justify-end gap-1.5 mb-1">الجلسة تبدأ خلال <Clock size={11} className="text-pink-400" /></p>
                    <div className={`text-5xl font-mono font-black tabular-nums ${timeLeft < 60 ? "text-red-400" : "text-white"}`}>{formatTime(timeLeft)}</div>
                  </div>
                  <div className="h-1 bg-gray-800/60">
                    <motion.div className={`h-full ${timeLeft < 60 ? "bg-gradient-to-r from-red-500 to-red-400" : "bg-gradient-to-r from-pink-500 via-rose-400 to-pink-600"}`}
                      style={{ boxShadow: timeLeft < 60 ? "0 0 8px rgba(239,68,68,0.7)" : "0 0 10px rgba(236,72,153,0.7)" }}
                      animate={{ width: `${(timeLeft / timerDuration) * 100}%` }} transition={{ duration: 1 }} />
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
                  <div className="relative z-10 px-6 pt-7 pb-8 text-center">
                    <div className="inline-flex items-center gap-1.5 bg-pink-900/50 border border-pink-700/40 rounded-full px-3 py-1 mb-5">
                      <Heart size={10} className="text-pink-400" fill="currentColor" />
                      <span className="text-pink-300 text-[11px] font-semibold tracking-wide">جلسة فردية · اختيارك الشخصي</span>
                    </div>
                    <p className="text-6xl font-black text-white mb-2 tracking-tight" style={{ textShadow: '0 2px 20px rgba(236,72,153,0.3)' }}>{data?.partner_first_name || "..."}</p>
                    <p className="text-pink-400/50 text-xs mt-1">شريكك في جلسة الاختيار الشخصي</p>
                  </div>
                </div>
              </motion.div>

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

              {timerActive && timeLeft > 0 && (
                <div className="rounded-2xl bg-gray-900/80 border border-white/[0.05] overflow-hidden">
                  <div className="px-5 pt-4 pb-3">
                    <p className="text-gray-500 text-xs flex items-center justify-end gap-1.5 mb-1">وقت الجلسة المتبقّي <Clock size={11} className="text-pink-400" /></p>
                    <div className={`text-5xl font-mono font-black tabular-nums ${timeLeft < 60 ? "text-red-400" : "text-white"}`}>{formatTime(timeLeft)}</div>
                  </div>
                  <div className="h-1 bg-gray-800/60">
                    <motion.div className={`h-full ${timeLeft < 60 ? "bg-gradient-to-r from-red-500 to-red-400" : "bg-gradient-to-r from-pink-500 via-rose-400 to-pink-600"}`}
                      style={{ boxShadow: timeLeft < 60 ? "0 0 8px rgba(239,68,68,0.7)" : "0 0 10px rgba(236,72,153,0.7)" }}
                      animate={{ width: `${(timeLeft / timerDuration) * 100}%` }} transition={{ duration: 1 }} />
                  </div>
                </div>
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
          <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-0 z-50 bg-gray-950 flex flex-col overflow-y-auto relative">
            {/* Background orbs */}
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
              <div className="absolute -top-32 -left-32 w-96 h-96 bg-pink-600/25 rounded-full blur-[100px]" />
              <div className="absolute top-1/3 -right-24 w-80 h-80 bg-rose-500/20 rounded-full blur-[90px]" />
              <div className="absolute -bottom-24 left-1/4 w-72 h-72 bg-fuchsia-600/20 rounded-full blur-[80px]" />
              <div className="absolute bottom-1/4 right-1/3 w-60 h-60 bg-pink-400/10 rounded-full blur-[70px]" />
            </div>
            <div className="sticky top-0 z-10 bg-gray-950/80 backdrop-blur-xl px-5 pt-4 pb-3">
              <div className="flex items-center gap-3 mb-2.5">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-pink-500/40 to-transparent" />
                <div className="flex items-center gap-1.5 bg-pink-900/25 border border-pink-700/30 rounded-full px-3 py-1">
                  <Heart size={10} className="text-pink-400" fill="currentColor" />
                  <span className="text-pink-300 text-xs font-semibold">تقييم الجلسة الفردية الأولى</span>
                </div>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-pink-500/40 to-transparent" />
              </div>
              <button onClick={() => setView('session')} className="flex items-center gap-1 text-gray-600 hover:text-gray-300 text-xs transition-colors mx-auto">
                <ChevronRight size={11} /> العودة إلى أسئلة الجلسة
              </button>
            </div>
            {feedbackDone ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center shadow-[0_0_40px_-8px_rgba(16,185,129,0.5)]">
                  <span className="text-4xl">✨</span>
                </div>
                <div className="text-center space-y-1.5">
                  <p className="text-white font-bold text-xl">شكراً على تقييمك!</p>
                  <p className="text-gray-500 text-sm">تم الحفظ — انتظر المرحلة التالية</p>
                </div>
              </div>
            ) : (
              <div className="max-w-sm mx-auto w-full p-4 space-y-3 pb-12">
                <div className="flex items-center justify-between px-5 py-3.5 rounded-2xl bg-gradient-to-l from-pink-950/70 to-rose-950/40 border border-pink-900/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <span className="text-pink-400/60 text-xs font-medium tracking-wide">شريكك في الجلسة</span>
                  <span className="text-white font-bold">{data?.partner_first_name}</span>
                </div>
                <div className="flex items-center justify-center gap-1.5 py-1">
                  <span className="text-gray-600 text-xs">🔒</span>
                  <span className="text-gray-600 text-xs">تقييمك سري — لا يراه إلا المنظم</span>
                </div>
                {/* Compatibility slider — force LTR so 0% stays left, 100% stays right */}
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 space-y-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <div>
                    <p className="text-white/90 text-sm font-semibold">⭐ التوافق المقدَّر <span className="text-red-400">*</span></p>
                    <p className="text-gray-600 text-xs mt-0.5">حرّك المؤشر — النتيجة الحقيقية تُكشف بعد الإرسال</p>
                  </div>
                  <div dir="ltr" className="space-y-2">
                    <input type="range" min="0" max="100" step="5" value={fb.compatibilityRate}
                      onChange={e => setFb(p => ({ ...p, compatibilityRate: parseInt(e.target.value), sliderMoved: true }))}
                      className="compat-slider w-full rounded-full touch-none"
                      style={{
                        height: '20px',
                        background: `linear-gradient(to right, ${fb.compatibilityRate >= 70 ? '#10b981' : fb.compatibilityRate >= 40 ? '#f59e0b' : '#ef4444'} ${fb.compatibilityRate}%, #374151 ${fb.compatibilityRate}%)`,
                      }} />
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>0%</span>
                      <span className={`font-black text-sm ${fb.compatibilityRate >= 70 ? 'text-emerald-400' : fb.compatibilityRate >= 40 ? 'text-amber-400' : 'text-red-400'}`}>{fb.compatibilityRate}%</span>
                      <span>100%</span>
                    </div>
                  </div>
                </div>
                {/* Rating questions */}
                {([{ key: 'conversationQuality', label: 'جودة المحادثة', hint: '1 = سيئة، 5 = ممتازة' }, { key: 'personalConnection', label: 'التواصل الشخصي', hint: '1 = لا يوجد، 5 = قوي جداً' }, { key: 'sharedInterests', label: 'اهتمامات مشتركة', hint: '1 = لا يوجد، 5 = كثيرة جداً' }, { key: 'comfortLevel', label: 'مستوى الراحة', hint: '1 = غير مرتاح، 5 = مرتاح جداً' }, { key: 'communicationStyle', label: 'توافق أسلوب التواصل', hint: '1 = مختلف جداً، 5 = متطابق تماماً' }, { key: 'overallExperience', label: 'التقييم العام للتجربة', hint: '1 = سيئة، 5 = ممتازة' }] as { key: keyof typeof fb; label: string; hint: string }[]).map(({ key, label, hint }) => (
                  <div key={key} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div>
                      <p className="text-white/90 text-sm font-semibold">{label}</p>
                      <p className="text-gray-600 text-xs mt-0.5">{hint}</p>
                    </div>
                    <div className="flex gap-2 justify-between" dir="ltr">
                      {[1,2,3,4,5].map(v => (
                        <button key={v} onClick={() => setFb(p => ({ ...p, [key]: v }))}
                          className={`flex-1 min-h-[48px] rounded-xl font-bold text-sm transition-all duration-150 active:scale-95 ${
                            (fb[key] as number) === v
                              ? v <= 2 ? 'bg-red-500/20 text-red-300 ring-1 ring-red-500/50 shadow-[0_0_16px_-4px_rgba(239,68,68,0.5)]' : v === 3 ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/50 shadow-[0_0_16px_-4px_rgba(245,158,11,0.5)]' : 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/50 shadow-[0_0_16px_-4px_rgba(16,185,129,0.5)]'
                              : 'bg-white/[0.03] text-gray-500 ring-1 ring-white/[0.06]'
                          }`}>{v}</button>
                      ))}
                    </div>
                  </div>
                ))}
                {/* Want to connect */}
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 space-y-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <div>
                    <p className="text-white/90 text-sm font-semibold">هل ترغب في التواصل معه/معها بعد الفعالية؟ <span className="text-red-400">*</span></p>
                    <p className="text-gray-500 text-xs mt-1.5 leading-relaxed">إجابتك سرية تماماً ولن يعلم بها الطرف الآخر. فقط في حال أجاب كلاكما بـ«نعم» سيتواصل معكما المنظم لتسهيل تبادل معلومات التواصل 🤝</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setFb(p => ({ ...p, wantConnect: true }))}
                      className={`min-h-[60px] rounded-xl font-bold text-base transition-all duration-150 active:scale-95 ${fb.wantConnect === true ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/50 shadow-[0_0_20px_-4px_rgba(16,185,129,0.4)]' : 'bg-white/[0.03] text-gray-500 ring-1 ring-white/[0.06]'}`}>نعم ✅</button>
                    <button onClick={() => setFb(p => ({ ...p, wantConnect: false }))}
                      className={`min-h-[60px] rounded-xl font-bold text-base transition-all duration-150 active:scale-95 ${fb.wantConnect === false ? 'bg-red-500/15 text-red-300 ring-1 ring-red-500/50 shadow-[0_0_20px_-4px_rgba(239,68,68,0.4)]' : 'bg-white/[0.03] text-gray-500 ring-1 ring-white/[0.06]'}`}>لا ❌</button>
                  </div>
                </div>
                {/* Organizer impression */}
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <p className="text-white/80 text-sm font-medium">انطباعك عن الشخص <span className="text-gray-600 text-xs font-normal">(سري — للمنظم فقط)</span></p>
                  <textarea value={fb.organizerImpression} onChange={e => e.target.value.length <= 500 && setFb(p => ({ ...p, organizerImpression: e.target.value }))}
                    placeholder="شعرت بالراحة أثناء الحديث..." rows={3}
                    className="w-full bg-black/30 border border-white/[0.06] text-white/90 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-white/10 resize-none placeholder:text-gray-700 transition-all" />
                  <p className="text-gray-700 text-xs" dir="ltr">{fb.organizerImpression.length}/500</p>
                </div>
                {/* Recommendations */}
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <p className="text-white/80 text-sm font-medium">اقتراحاتك لتحسين الفعالية <span className="text-gray-600 text-xs font-normal">(اختياري)</span></p>
                  <textarea value={fb.recommendations} onChange={e => e.target.value.length <= 500 && setFb(p => ({ ...p, recommendations: e.target.value }))}
                    placeholder="زيادة الوقت بين الجلسات..." rows={3}
                    className="w-full bg-black/30 border border-white/[0.06] text-white/90 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-white/10 resize-none placeholder:text-gray-700 transition-all" />
                  <p className="text-gray-700 text-xs" dir="ltr">{fb.recommendations.length}/500</p>
                </div>
                {/* Message to partner */}
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <p className="text-white/80 text-sm font-medium">رسالة للطرف الآخر <span className="text-gray-600 text-xs font-normal">(اختياري)</span></p>
                  <textarea value={fb.participantMessage} onChange={e => e.target.value.length <= 500 && setFb(p => ({ ...p, participantMessage: e.target.value }))}
                    placeholder="سعدت بالتعرّف عليك اليوم!" rows={3}
                    className="w-full bg-black/30 border border-white/[0.06] text-white/90 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-white/10 resize-none placeholder:text-gray-700 transition-all" />
                  <p className="text-gray-700 text-xs" dir="ltr">{fb.participantMessage.length}/500</p>
                </div>
                <motion.button whileTap={{ scale: 0.97 }} onClick={submitFb} disabled={submittingFb || fb.wantConnect === null}
                  className="w-full py-4 rounded-2xl font-bold text-base bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 text-white shadow-[0_4px_24px_-4px_rgba(236,72,153,0.6)] disabled:opacity-30 disabled:shadow-none transition-all">
                  {submittingFb ? 'جاري الحفظ...' : 'إرسال التقييم ✨'}
                </motion.button>
              </div>
            )}
          </motion.div>
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
                {data?.table_number && <span className="text-amber-400 text-xs font-medium">طاولة {data.table_number}</span>}
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
              <QuestionSlideshow defaultSet="special" />
              {/* PromptTopicsModal */}
              <button onClick={() => setShowPrompt(true)}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-full text-sm font-medium bg-gradient-to-r from-purple-600/60 to-pink-600/60 hover:from-purple-600 hover:to-pink-600 text-white transition-all border border-purple-700/30">
                <MessageSquare size={14} /> أسئلة للنقاش ✨
              </button>
              {/* One-word feedback */}
              <div className="rounded-2xl border border-gray-800/60 bg-gray-900/60 p-4 space-y-3">
                <p className="text-gray-400 text-sm text-center">صف هذه الجلسة بكلمة واحدة</p>
                <div className="flex gap-2">
                  <input type="text" placeholder="مثلاً: ممتع، عميق..." value={word} maxLength={20}
                    onChange={e => setWord(e.target.value.split(" ")[0])} disabled={wordSubmitted}
                    className="flex-1 bg-gray-800/80 border border-gray-700/60 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-pink-500/60 disabled:opacity-50 transition-all placeholder:text-gray-600" />
                  {wordSubmitted
                    ? <div className="flex items-center px-2 text-green-400"><CheckCircle size={16} /></div>
                    : <button onClick={submitWord} disabled={!word.trim()}
                        className="bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 disabled:opacity-40 text-white rounded-xl px-4 py-2 shadow-md transition-all">
                        <Send size={14} /></button>
                  }
                </div>
              </div>
              {/* Jump to feedback manually */}
              <button onClick={() => setView('feedback')} className="w-full py-2.5 rounded-xl text-xs text-gray-600 hover:text-gray-400 transition-colors">الانتهاء والتقييم →</button>
            </div>
            <Suspense fallback={null}>
              {showPrompt && <PromptTopicsModal open={showPrompt} onClose={() => setShowPrompt(false)} />}
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>
    </PageWrapper>
  )
}

// ─── Phase 3 Reveal Screen ────────────────────────────────────────────────────
function Phase3RevealScreen({ token, timerActive, timerStart, timerDuration }: {
  token: string; timerActive: boolean; timerStart: string | null; timerDuration: number
}) {
  const [data, setData] = useState<any>(null)
  const [revealed, setRevealed] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [word, setWord] = useState("")
  const [wordSubmitted, setWordSubmitted] = useState(false)
  const [view, setView] = useState<'partner' | 'session' | 'feedback'>('partner')
  const [showPrompt, setShowPrompt] = useState(false)
  const [feedbackDone, setFeedbackDone] = useState(false)
  const [fb, setFb] = useState({ compatibilityRate: 50, sliderMoved: false, conversationQuality: 3, personalConnection: 3, sharedInterests: 3, comfortLevel: 3, communicationStyle: 3, wouldMeetAgain: 3, overallExperience: 3, wantConnect: null as boolean | null, organizerImpression: '', recommendations: '', participantMessage: '' })
  const [submittingFb, setSubmittingFb] = useState(false)

  const submitFb = async () => {
    if (fb.wantConnect === null) { toast.error('يرجى الإجابة على سؤال التواصل'); return }
    setSubmittingFb(true)
    const d = await call('e3-submit-phase3-feedback', token, { feedback: { ...fb, word } })
    setSubmittingFb(false)
    if (!d.error) { setFeedbackDone(true); toast.success('تم الحفظ ✨') }
  }

  useEffect(() => {
    call("e3-get-phase3-reveal", token).then(d => {
      if (!d.error) {
        setData(d)
        if (d.word_submitted) setWordSubmitted(true)
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
  useEffect(() => {
    if (!data || !timerActive || !timerStart) return
    const elapsed = Math.floor((Date.now() - new Date(timerStart).getTime()) / 1000)
    const remaining = Math.max(0, timerDuration - elapsed)
    if (elapsed > 60 && remaining > 0) { setRevealed(true); setView('session') }
    else if (remaining <= 0) { setRevealed(true); setView('feedback') }
  }, [data, timerActive, timerStart, timerDuration])

  // Transition to feedback when session time runs out
  useEffect(() => {
    if (view === 'session' && timerActive && timeLeft === 0) setView('feedback')
  }, [timeLeft, view, timerActive])

  const handleReveal = () => {
    setRevealed(true)
    try { confetti({ particleCount: 65, spread: 70, origin: { y: 0.4 }, colors: ["#7c3aed", "#8b5cf6", "#a78bfa", "#c4b5fd"] }) } catch {}
  }

  const submitWord = async () => {
    if (!word.trim()) return
    const d = await call("e3-submit-phase3-word", token, { word: word.trim() })
    if (!d.error) { setWordSubmitted(true); toast.success("تم الحفظ! ✨") }
  }

  return (
    <PageWrapper>
      <div className="max-w-sm mx-auto p-5 pb-10 space-y-4">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="text-center pt-4 space-y-1">
          <div className="flex flex-col items-center gap-1.5">
            <div className="inline-flex items-center gap-2 bg-purple-900/30 border border-purple-700/40 text-purple-300 rounded-full px-4 py-1.5 text-sm font-semibold">
              <Brain size={13} /> جلسة فردية 1:1 · اختيارنا لك
            </div>
            <p className="text-gray-600 text-xs">جلسة خاصة مع من رشّحه النظام بناءً على توافقكما</p>
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {!revealed ? (
            <motion.div key="pre" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-4">
              <motion.button onClick={handleReveal} whileTap={{ scale: 0.97 }}
                className="w-full bg-gradient-to-br from-purple-600 via-violet-600 to-purple-700 text-white rounded-2xl py-8 font-bold text-xl shadow-2xl shadow-purple-600/40 border border-purple-500/30">
                <motion.span animate={{ rotate: [0, -4, 4, 0] }} transition={{ duration: 3, repeat: Infinity }} className="flex items-center justify-center gap-3">
                  <Brain size={24} /> اكشف اختيار الخوارزمية
                </motion.span>
              </motion.button>
              {timerActive && timeLeft > 0 && (
                <div className="rounded-2xl bg-gray-900/80 border border-white/[0.05] overflow-hidden">
                  <div className="px-5 pt-4 pb-3">
                    <p className="text-gray-500 text-xs flex items-center justify-end gap-1.5 mb-1">الجلسة تبدأ خلال <Clock size={11} className="text-purple-400" /></p>
                    <div className={`text-5xl font-mono font-black tabular-nums ${timeLeft < 60 ? "text-red-400" : "text-white"}`}>{formatTime(timeLeft)}</div>
                  </div>
                  <div className="h-1 bg-gray-800/60">
                    <motion.div className={`h-full ${timeLeft < 60 ? "bg-gradient-to-r from-red-500 to-red-400" : "bg-gradient-to-r from-purple-500 via-violet-400 to-purple-600"}`}
                      style={{ boxShadow: timeLeft < 60 ? "0 0 8px rgba(239,68,68,0.7)" : "0 0 10px rgba(139,92,246,0.7)" }}
                      animate={{ width: `${(timeLeft / timerDuration) * 100}%` }} transition={{ duration: 1 }} />
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div key="post" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              {data?.same_as_phase2 && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-r from-amber-900/40 to-yellow-900/30 border border-amber-700/50 rounded-2xl p-4 text-center">
                  <p className="text-amber-300 font-black text-base">🏆 مطابقة مثالية!</p>
                  <p className="text-amber-400/70 text-xs mt-0.5">اخترت نفس الشخص الذي اختارته الخوارزمية</p>
                </motion.div>
              )}

              <motion.div initial={{ scale: 0.88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, delay: 0.05 }}>
                <div className="relative overflow-hidden rounded-3xl border border-purple-700/25 shadow-2xl shadow-purple-900/30">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-950 via-violet-950/80 to-purple-900/60" />
                  <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-purple-400/60 to-transparent" />
                  <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-black/30 to-transparent" />
                  <div className="relative z-10 px-6 pt-7 pb-8 text-center">
                    <div className="inline-flex items-center gap-1.5 bg-purple-900/50 border border-purple-700/40 rounded-full px-3 py-1 mb-5">
                      <Brain size={10} className="text-purple-400" />
                      <span className="text-purple-300 text-[11px] font-semibold tracking-wide">جلسة فردية · اختيار النظام</span>
                    </div>
                    <p className="text-6xl font-black text-white mb-2 tracking-tight" style={{ textShadow: '0 2px 20px rgba(139,92,246,0.3)' }}>{data?.partner_first_name || "..."}</p>
                    <p className="text-purple-400/50 text-xs mt-1">شريكك في جلسة اختيار النظام</p>
                  </div>
                </div>
              </motion.div>

              {timerActive && timeLeft > 0 && (
                <div className="rounded-2xl bg-gray-900/80 border border-white/[0.05] overflow-hidden">
                  <div className="px-5 pt-4 pb-3">
                    <p className="text-gray-500 text-xs flex items-center justify-end gap-1.5 mb-1">وقت الجلسة المتبقّي <Clock size={11} className="text-purple-400" /></p>
                    <div className={`text-5xl font-mono font-black tabular-nums ${timeLeft < 60 ? "text-red-400" : "text-white"}`}>{formatTime(timeLeft)}</div>
                  </div>
                  <div className="h-1 bg-gray-800/60">
                    <motion.div className={`h-full ${timeLeft < 60 ? "bg-gradient-to-r from-red-500 to-red-400" : "bg-gradient-to-r from-purple-500 via-violet-400 to-purple-600"}`}
                      style={{ boxShadow: timeLeft < 60 ? "0 0 8px rgba(239,68,68,0.7)" : "0 0 10px rgba(139,92,246,0.7)" }}
                      animate={{ width: `${(timeLeft / timerDuration) * 100}%` }} transition={{ duration: 1 }} />
                  </div>
                </div>
              )}

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
              <button onClick={() => setView('partner')} className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm font-medium transition-colors">
                ← رجوع
              </button>
              <span className="text-white font-bold text-sm">أسئلة الجلسة الثانية</span>
              <span className={`font-mono text-sm font-black tabular-nums ${timeLeft < 300 ? 'text-red-400' : 'text-purple-300'}`}>{formatTime(timeLeft)}</span>
            </div>
            <div className="flex-1 max-w-sm mx-auto w-full p-5 space-y-5">
              <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-purple-900/20 border border-purple-800/30">
                <span className="text-gray-500 text-xs">شريكك</span>
                <span className="text-purple-300 font-bold">{data?.partner_first_name}</span>
                {data?.compatibility_score && <span className="text-purple-400 text-xs font-medium">{data.compatibility_score}% توافق</span>}
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
              <QuestionSlideshow defaultSet="set1" />
              <button onClick={() => setShowPrompt(true)}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-full text-sm font-medium bg-gradient-to-r from-purple-600/60 to-pink-600/60 hover:from-purple-600 hover:to-pink-600 text-white transition-all border border-purple-700/30">
                <MessageSquare size={14} /> أسئلة للنقاش ✨
              </button>
              {/* Jump to feedback */}
              <button onClick={() => setView('feedback')} className="w-full py-2.5 rounded-xl text-xs text-gray-600 hover:text-gray-400 transition-colors">الانتهاء والتقييم →</button>
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
          <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-0 z-50 bg-gray-950 flex flex-col overflow-y-auto relative">
            {/* Background orbs */}
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
              <div className="absolute -top-32 -right-32 w-96 h-96 bg-purple-600/25 rounded-full blur-[100px]" />
              <div className="absolute top-1/3 -left-24 w-80 h-80 bg-violet-500/20 rounded-full blur-[90px]" />
              <div className="absolute -bottom-24 right-1/4 w-72 h-72 bg-indigo-600/20 rounded-full blur-[80px]" />
              <div className="absolute bottom-1/4 left-1/3 w-60 h-60 bg-purple-400/10 rounded-full blur-[70px]" />
            </div>
            <div className="sticky top-0 z-10 bg-gray-950/80 backdrop-blur-xl px-5 pt-4 pb-3">
              <div className="flex items-center gap-3 mb-2.5">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-purple-500/40 to-transparent" />
                <div className="flex items-center gap-1.5 bg-purple-900/25 border border-purple-700/30 rounded-full px-3 py-1">
                  <Brain size={10} className="text-purple-400" />
                  <span className="text-purple-300 text-xs font-semibold">تقييم الجلسة الفردية الثانية</span>
                </div>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-purple-500/40 to-transparent" />
              </div>
              <button onClick={() => setView('session')} className="flex items-center gap-1 text-gray-600 hover:text-gray-300 text-xs transition-colors mx-auto">
                <ChevronRight size={11} /> العودة إلى أسئلة الجلسة
              </button>
            </div>
            {feedbackDone ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center shadow-[0_0_40px_-8px_rgba(16,185,129,0.5)]">
                  <span className="text-4xl">✨</span>
                </div>
                <div className="text-center space-y-1.5">
                  <p className="text-white font-bold text-xl">شكراً على تقييمك!</p>
                  <p className="text-gray-500 text-sm">تم الحفظ — انتظر الكشف النهائي</p>
                </div>
              </div>
            ) : (
              <div className="max-w-sm mx-auto w-full p-4 space-y-3 pb-12">
                <div className="flex items-center justify-between px-5 py-3.5 rounded-2xl bg-gradient-to-l from-purple-950/70 to-violet-950/40 border border-purple-900/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <span className="text-purple-400/60 text-xs font-medium tracking-wide">شريكك في الجلسة</span>
                  <span className="text-white font-bold">{data?.partner_first_name}</span>
                  {data?.compatibility_score && <span className="text-purple-400/70 text-xs">{data.compatibility_score}%</span>}
                </div>
                <div className="flex items-center justify-center gap-1.5 py-1">
                  <span className="text-gray-600 text-xs">🔒</span>
                  <span className="text-gray-600 text-xs">تقييمك سري — لا يراه إلا المنظم</span>
                </div>
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 space-y-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <div>
                    <p className="text-white/90 text-sm font-semibold">⭐ التوافق المقدَّر <span className="text-red-400">*</span></p>
                    <p className="text-gray-600 text-xs mt-0.5">حرّك المؤشر — النتيجة الحقيقية تُكشف بعد الإرسال</p>
                  </div>
                  <div dir="ltr" className="space-y-2">
                    <input type="range" min="0" max="100" step="5" value={fb.compatibilityRate}
                      onChange={e => setFb(p => ({ ...p, compatibilityRate: parseInt(e.target.value), sliderMoved: true }))}
                      className="compat-slider w-full rounded-full touch-none"
                      style={{
                        height: '20px',
                        background: `linear-gradient(to right, ${fb.compatibilityRate >= 70 ? '#10b981' : fb.compatibilityRate >= 40 ? '#f59e0b' : '#ef4444'} ${fb.compatibilityRate}%, #374151 ${fb.compatibilityRate}%)`,
                      }} />
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>0%</span>
                      <span className={`font-black text-sm ${fb.compatibilityRate >= 70 ? 'text-emerald-400' : fb.compatibilityRate >= 40 ? 'text-amber-400' : 'text-red-400'}`}>{fb.compatibilityRate}%</span>
                      <span>100%</span>
                    </div>
                  </div>
                </div>
                {([{ key: 'conversationQuality', label: 'جودة المحادثة', hint: '1 = سيئة، 5 = ممتازة' }, { key: 'personalConnection', label: 'التواصل الشخصي', hint: '1 = لا يوجد، 5 = قوي جداً' }, { key: 'sharedInterests', label: 'اهتمامات مشتركة', hint: '1 = لا يوجد، 5 = كثيرة جداً' }, { key: 'comfortLevel', label: 'مستوى الراحة', hint: '1 = غير مرتاح، 5 = مرتاح جداً' }, { key: 'communicationStyle', label: 'توافق أسلوب التواصل', hint: '1 = مختلف جداً، 5 = متطابق تماماً' }, { key: 'overallExperience', label: 'التقييم العام للتجربة', hint: '1 = سيئة، 5 = ممتازة' }] as { key: keyof typeof fb; label: string; hint: string }[]).map(({ key, label, hint }) => (
                  <div key={key} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div>
                      <p className="text-white/90 text-sm font-semibold">{label}</p>
                      <p className="text-gray-600 text-xs mt-0.5">{hint}</p>
                    </div>
                    <div className="flex gap-2 justify-between" dir="ltr">
                      {[1,2,3,4,5].map(v => (
                        <button key={v} onClick={() => setFb(p => ({ ...p, [key]: v }))}
                          className={`flex-1 min-h-[48px] rounded-xl font-bold text-sm transition-all duration-150 active:scale-95 ${
                            (fb[key] as number) === v
                              ? v <= 2 ? 'bg-red-500/20 text-red-300 ring-1 ring-red-500/50 shadow-[0_0_16px_-4px_rgba(239,68,68,0.5)]' : v === 3 ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/50 shadow-[0_0_16px_-4px_rgba(245,158,11,0.5)]' : 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/50 shadow-[0_0_16px_-4px_rgba(16,185,129,0.5)]'
                              : 'bg-white/[0.03] text-gray-500 ring-1 ring-white/[0.06]'
                          }`}>{v}</button>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 space-y-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <div className="space-y-1.5">
                    <p className="text-white/90 text-sm font-semibold">هل ترغب في التواصل معه/معها بعد الفعالية؟ <span className="text-red-400">*</span></p>
                    <p className="text-gray-500 text-xs leading-relaxed">إجابتك سرية تماماً ولن يعلم بها الطرف الآخر. فقط في حال أجاب كلاكما بـ«نعم» سيتواصل معكما المنظم لتسهيل تبادل معلومات التواصل 🤝</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setFb(p => ({ ...p, wantConnect: true }))}
                      className={`min-h-[60px] rounded-xl font-bold text-base transition-all duration-150 active:scale-95 ${fb.wantConnect === true ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/50 shadow-[0_0_20px_-4px_rgba(16,185,129,0.4)]' : 'bg-white/[0.03] text-gray-500 ring-1 ring-white/[0.06]'}`}>نعم ✅</button>
                    <button onClick={() => setFb(p => ({ ...p, wantConnect: false }))}
                      className={`min-h-[60px] rounded-xl font-bold text-base transition-all duration-150 active:scale-95 ${fb.wantConnect === false ? 'bg-red-500/15 text-red-300 ring-1 ring-red-500/50 shadow-[0_0_20px_-4px_rgba(239,68,68,0.4)]' : 'bg-white/[0.03] text-gray-500 ring-1 ring-white/[0.06]'}`}>لا ❌</button>
                  </div>
                </div>
                {/* Organizer impression */}
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <p className="text-white/80 text-sm font-medium">انطباعك عن الشخص <span className="text-gray-600 text-xs font-normal">(سري — للمنظم فقط)</span></p>
                  <textarea value={fb.organizerImpression} onChange={e => e.target.value.length <= 500 && setFb(p => ({ ...p, organizerImpression: e.target.value }))}
                    placeholder="شعرت بالراحة أثناء الحديث..." rows={3}
                    className="w-full bg-black/30 border border-white/[0.06] text-white/90 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-white/10 resize-none placeholder:text-gray-700 transition-all" />
                  <p className="text-gray-700 text-xs" dir="ltr">{fb.organizerImpression.length}/500</p>
                </div>
                {/* Recommendations */}
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <p className="text-white/80 text-sm font-medium">اقتراحاتك لتحسين الفعالية <span className="text-gray-600 text-xs font-normal">(اختياري)</span></p>
                  <textarea value={fb.recommendations} onChange={e => e.target.value.length <= 500 && setFb(p => ({ ...p, recommendations: e.target.value }))}
                    placeholder="زيادة الوقت بين الجلسات..." rows={3}
                    className="w-full bg-black/30 border border-white/[0.06] text-white/90 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-white/10 resize-none placeholder:text-gray-700 transition-all" />
                  <p className="text-gray-700 text-xs" dir="ltr">{fb.recommendations.length}/500</p>
                </div>
                {/* Message to partner */}
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <p className="text-white/80 text-sm font-medium">رسالة للطرف الآخر <span className="text-gray-600 text-xs font-normal">(اختياري)</span></p>
                  <textarea value={fb.participantMessage} onChange={e => e.target.value.length <= 500 && setFb(p => ({ ...p, participantMessage: e.target.value }))}
                    placeholder="سعدت بالتعرّف عليك اليوم!" rows={3}
                    className="w-full bg-black/30 border border-white/[0.06] text-white/90 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-white/10 resize-none placeholder:text-gray-700 transition-all" />
                  <p className="text-gray-700 text-xs" dir="ltr">{fb.participantMessage.length}/500</p>
                </div>
                <motion.button whileTap={{ scale: 0.97 }} onClick={submitFb} disabled={submittingFb || fb.wantConnect === null}
                  className="w-full py-4 rounded-2xl font-bold text-base bg-gradient-to-r from-purple-500 via-violet-500 to-purple-600 text-white shadow-[0_4px_24px_-4px_rgba(139,92,246,0.6)] disabled:opacity-30 disabled:shadow-none transition-all">
                  {submittingFb ? 'جاري الحفظ...' : 'إرسال التقييم ✨'}
                </motion.button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </PageWrapper>
  )
}

// ─── Final Reveal Screen ──────────────────────────────────────────────────────
function FinalRevealScreen({ token }: { token: string }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    call("e3-get-final-reveal", token).then(d => {
      if (!d.error) setData(d)
      setLoading(false)
    })
  }, [token])

  useEffect(() => {
    if (!data) return
    if (data.same_match) {
      try {
        confetti({ particleCount: 100, spread: 80, origin: { y: 0.3 } })
        setTimeout(() => confetti({ particleCount: 60, spread: 90, origin: { y: 0.4 }, colors: ["#f59e0b", "#fbbf24", "#fcd34d", "#fef08a"] }), 400)
      } catch {}
    }
  }, [data])

  if (loading) return (
    <PageWrapper className="flex items-center justify-center"><Spinner size={28} /></PageWrapper>
  )

  if (!data) return (
    <PageWrapper className="flex items-center justify-center text-gray-500 text-sm">لا توجد نتائج بعد</PageWrapper>
  )

  return (
    <PageWrapper className="flex flex-col items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm space-y-5 text-center">
        <Brand />
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
          className="text-6xl">✨</motion.div>
        <h1 className="text-2xl font-black text-white">الكشف النهائي</h1>

        {data.same_match && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}
            className="bg-gradient-to-r from-amber-900/40 via-yellow-900/30 to-amber-900/40 border border-amber-600/50 rounded-2xl p-5 shadow-2xl shadow-amber-500/20">
            <div className="text-3xl mb-2">🏆</div>
            <p className="text-amber-300 font-black text-lg">مطابقة مثالية!</p>
            <p className="text-amber-400/70 text-sm mt-1">
              اخترت <strong className="text-amber-300">{data.phase2?.partner_first_name}</strong> والخوارزمية اختارت نفس الشخص
            </p>
          </motion.div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <motion.div initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
            <GlassCard className="p-5 space-y-2.5 border border-pink-800/40 shadow-xl shadow-pink-500/8 h-full flex flex-col items-center">
              <div className="text-2xl">💘</div>
              <p className="text-gray-500 text-xs">اخترت</p>
              <p className="text-xl font-black text-white leading-tight">{data.phase2?.partner_first_name}</p>
              {data.phase2?.word && (
                <span className="text-xs bg-pink-900/40 text-pink-300 border border-pink-800/40 rounded-full px-2.5 py-0.5">
                  "{data.phase2.word}"
                </span>
              )}
            </GlassCard>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
            <GlassCard className="p-5 space-y-2.5 border border-purple-800/40 shadow-xl shadow-purple-500/8 h-full flex flex-col items-center">
              <div className="text-2xl">🧠</div>
              <p className="text-gray-500 text-xs">الخوارزمية</p>
              <p className="text-xl font-black text-white leading-tight">{data.phase3?.partner_first_name}</p>
              <div className="flex items-center gap-1">
                <span className="text-purple-300 font-black text-sm">{data.phase3?.compatibility_score}%</span>
                <span className="text-gray-600 text-xs">توافق</span>
              </div>
              {data.phase3?.word && (
                <span className="text-xs bg-purple-900/40 text-purple-300 border border-purple-800/40 rounded-full px-2.5 py-0.5">
                  "{data.phase3.word}"
                </span>
              )}
            </GlassCard>
          </motion.div>
        </div>

        <p className="text-gray-500 text-xs leading-relaxed">
          {data.same_match
            ? "غريزتك والخوارزمية متوافقتان — هذا نادر الحدوث ✨"
            : "رأيت بعينيك، ورأت الخوارزمية بالبيانات — أيهما أصح؟"}
        </p>
      </motion.div>
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

// ─── Root Component ───────────────────────────────────────────────────────────
export default function Event3Page() {
  const [searchParams] = useSearchParams()
  const [token, setToken] = useState<string | null>(() => {
    const p = searchParams.get("token") || searchParams.get("t")
    return p || (typeof window !== "undefined" ? localStorage.getItem("blindmatch_result_token") : null) || null
  })

  const [showWelcome, setShowWelcome] = useState(true)
  const [eventState, setEventState] = useState<any>(null)
  const [enrolled, setEnrolled] = useState<boolean | null>(null)
  const [myInfo, setMyInfo] = useState<{ number: number; name: string; gender: string | null } | null>(null)

  const fetchState = useCallback(async () => {
    if (!token) return
    const d = await call("e3-get-state", token)
    if (d.error) return
    setEventState(d)
    if (enrolled === null) setEnrolled(d.enrolled !== false)
    if (d.my_info && !myInfo) setMyInfo(d.my_info)
  }, [token, enrolled, myInfo])

  useEffect(() => {
    const p = searchParams.get("token") || searchParams.get("t")
    if (p) { setToken(p); localStorage.setItem("blindmatch_result_token", p) }
  }, [searchParams])

  useEffect(() => {
    if (!token) return
    fetchState()
    const iv = setInterval(fetchState, 2000)
    return () => clearInterval(iv)
  }, [token, fetchState])

  if (showWelcome) return <WelcomeScreen onDone={() => setShowWelcome(false)} />
  if (!token) return <TokenEntry onToken={t => { setToken(t); localStorage.setItem("blindmatch_result_token", t) }} />

  if (!eventState) return (
    <PageWrapper className="flex items-center justify-center">
      <Spinner size={28} />
    </PageWrapper>
  )

  const { phase, timer_active, timer_start, timer_duration } = eventState
  const timerProps = { timerActive: timer_active, timerStart: timer_start, timerDuration: timer_duration }

  if (enrolled === false) return <NotEnrolledScreen />

  const isRound = /^round[123]$/.test(phase)
  const rankingMatch = phase.match(/^ranking([123])$/)
  const completedRounds = rankingMatch ? parseInt(rankingMatch[1]) : null

  return (
    <>
      <Toaster position="top-center" toastOptions={{ style: { background: "#1f2937", color: "#f9fafb", border: "1px solid #374151", borderRadius: "12px" } }} />

      {/* Fixed participant info chip */}
      {myInfo && enrolled && (
        <div className="fixed top-3 left-3 z-[200] flex items-center gap-2 bg-gray-900/90 backdrop-blur-md border border-gray-700/60 rounded-xl px-3 py-1.5 shadow-lg shadow-black/30">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${myInfo.gender === "female" ? "bg-pink-400" : myInfo.gender === "male" ? "bg-blue-400" : "bg-purple-400"}`} />
          <span className="text-white text-xs font-semibold leading-none">{myInfo.name}</span>
          <span className="text-gray-500 text-[10px] font-mono leading-none">#{myInfo.number}</span>
        </div>
      )}

      <AnimatePresence mode="wait">
        {phase === "setup" && <SetupScreen key="setup" token={token} />}
        {isRound && <RoundScreen key={phase} token={token} phase={phase} {...timerProps} />}
        {completedRounds && <RankingScreen key={phase} token={token} completedRounds={completedRounds} />}
        {phase === "phase2_reveal" && <Phase2RevealScreen key="p2r" token={token} {...timerProps} />}
        {phase === "phase3_reveal" && <Phase3RevealScreen key="p3r" token={token} {...timerProps} />}
        {phase === "final_reveal" && <FinalRevealScreen key="final" token={token} />}
      </AnimatePresence>
    </>
  )
}
