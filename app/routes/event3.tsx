import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react"
import GroupsPage from "./groups"
import { useSearchParams } from "react-router"
import toast, { Toaster } from "react-hot-toast"
import { motion, AnimatePresence, Reorder } from "framer-motion"
import confetti from "canvas-confetti"
import {
  Clock, MapPin, Brain, ChevronDown, ExternalLink,
  CheckCircle, Send, RefreshCw, Sparkles, Home, Trophy, Lock, GripVertical,
  MessageSquare, ChevronRight, Users, PenLine, Shuffle, BarChart3, GitMerge, X, Heart,
  Frown, Meh, Smile, Layers, Zap,
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
    <div className={`h-full bg-gray-950 relative overflow-hidden ${className}`} dir="rtl">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-20 w-[400px] h-[400px] bg-purple-600/20 rounded-full blur-[100px]" />
        <div className="absolute -bottom-24 -left-16 w-[360px] h-[360px] bg-pink-600/15 rounded-full blur-[90px]" />
        <div className="absolute top-1/2 left-1/2 w-[280px] h-[280px] bg-violet-500/10 rounded-full blur-[80px] -translate-x-1/2 -translate-y-1/2" />
      </div>
      <div className={`relative z-10 h-full ${className.includes("flex") ? "flex items-center justify-center" : ""}`}>{children}</div>
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
    data?.partner_mbti && { icon: "🧠", label: "الشخصية", value: data.partner_mbti },
    data?.partner_communication && { icon: "💬", label: "التواصل", value: data.partner_communication },
    data?.partner_attachment && { icon: "🤝", label: "التعلق", value: data.partner_attachment },
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
  const [phase, setPhase] = useState<"splash" | "rules" | "steps">("splash")
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
              <span className="text-[11px] font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent tracking-wide">✨ قواعد الجلسة</span>
            </div>

            {/* Rules list */}
            <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-2.5">
              {[
                { icon: "🕶️", title: "ابقَ أعمى", desc: "لا تكشف لأحد ترتيبك أو تقييماتك — سرية الخيارات هي جوهر الفعالية" },
                { icon: "🎭", title: "كن نفسك", desc: "الخوارزمية تعمل بناءً على شخصيتك الحقيقية — التمثيل يضر نتيجتك" },
                { icon: "📱", title: "التطبيق أداتك", desc: "استخدم التطبيق للتقييم والترتيب، لكن لا تُظهِر شاشتك للآخرين" },
                { icon: "🤝", title: "احترم الجلسة", desc: "الجميع هنا بنفس الهدف — تعامل بلطف واحترام مع كل من تجلس معه" },
                { icon: "⏱️", title: "احترم الوقت", desc: "كل جلسة لها مؤقت — أنهِ المحادثة باحترام حين ينتهي الوقت" },
                { icon: "🚫", title: "لا إحراج", desc: "امتنع عن الأسئلة الشخصية المُحرجة أو أي تعليق يخلق إحراجاً" },
                { icon: "🔒", title: "النتيجة سرية حتى النهاية", desc: "لا تشارك أحداً من اخترت — الكشف يحدث في النهاية للجميع معاً" },
              ].map((rule, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.07, duration: 0.3 }}
                  className="flex items-start gap-3 bg-white/[0.04] border border-white/[0.07] rounded-2xl px-4 py-3.5"
                >
                  <span className="text-2xl flex-shrink-0 mt-0.5">{rule.icon}</span>
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
                animate={{ width: `${((step + 1) / FLOW_STEPS.length) * 100}%` }}
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
                    <div className={`bg-gradient-to-br ${s.gradient} px-6 pt-5 pb-4 text-center relative overflow-hidden`}>
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
                          <s.Icon size={56} className="text-white/90" strokeWidth={1.25} />
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
                      className="bg-gray-900/95 backdrop-blur-sm px-5 py-4"
                    >
                      <p className="text-gray-300 text-sm leading-relaxed text-center">{s.desc}</p>
                    </motion.div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Bottom navigation */}
            <div className="px-5 pb-4 pt-2 space-y-3">
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
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-2xl py-3.5 font-black text-base shadow-xl shadow-purple-600/25 transition-all"
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
              <span className="text-4xl">📱</span>
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
              {loading ? <><motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />جاري التحقق...</> : <>دخول ✨</>}
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
    { icon: "👥", label: "جلسة جماعية أولى", time: "20 دقيقة" },
    { icon: "🔀", label: "جلسة جماعية ثانية", time: "20 دقيقة" },
    { icon: "🏆", label: "ترتيب المشاركين", time: "5 دقائق" },
    { icon: "🌟", label: "جلسة فردية (اختيارك)", time: "15 دقيقة" },
    { icon: "🧠", label: "جلسة فردية (اختيار النظام)", time: "15 دقيقة" },
    { icon: "✨", label: "الكشف النهائي", time: "النتيجة" },
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

// ─── Round Tutorial Overlay ───────────────────────────────────────────────────
function RoundTutorial({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)

  const steps = [
    {
      icon: <Users size={28} className="text-blue-400" />,
      title: "الجولة الجماعية الأولى",
      desc: "ستلتقي بمجموعة من المشاركين على طاولتك للتعارف والمحادثة",
      accent: "from-blue-600/20 to-cyan-600/10",
      ring: "ring-blue-500/30",
    },
    {
      icon: <MapPin size={28} className="text-purple-400" />,
      title: "رقم طاولتك",
      desc: "هذا هو رقم الطاولة التي يجب أن تذهب إليها — ابحث عنها في المكان",
      accent: "from-purple-600/20 to-pink-600/10",
      ring: "ring-purple-500/30",
      hint: "ابحث عن الرقم الكبير في المنتصف",
    },
    {
      icon: <ExternalLink size={28} className="text-indigo-400" />,
      title: "نشاطات المجموعة",
      desc: "اضغط على هذا الزر لعرض نشاطات وأسئلة المجموعة لمساعدتكم في التعارف",
      accent: "from-indigo-600/20 to-purple-600/10",
      ring: "ring-indigo-500/30",
      hint: "الزر الكبير في الأسفل",
    },
    {
      icon: <MessageSquare size={28} className="text-emerald-400" />,
      title: "زر المنظم للطوارئ",
      desc: "إذا احتجت مساعدة أو كان لديك سؤال عاجل، اضغط على زر «المنظم» في أسفل الشاشة للتواصل مع المنظم مباشرة",
      accent: "from-emerald-600/20 to-teal-600/10",
      ring: "ring-emerald-500/30",
      hint: "في أسفل الشاشة",
    },
    {
      icon: <Clock size={28} className="text-amber-400" />,
      title: "المؤقت في الأعلى",
      desc: "يظهر المؤقت في أعلى الشاشة عند بدء الجولة — ينبهك عند اقتراب انتهاء الوقت",
      accent: "from-amber-600/20 to-orange-600/10",
      ring: "ring-amber-500/30",
    },
  ]

  const goNext = () => {
    if (step < steps.length - 1) { setDir(1); setStep(s => s + 1) }
    else onClose()
  }
  const goBack = () => { if (step > 0) { setDir(-1); setStep(s => s - 1) } }

  const s = steps[step]

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[500] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
      dir="rtl"
    >
      {/* Skip button */}
      <button
        onClick={onClose}
        className="absolute top-5 left-5 text-gray-500 hover:text-gray-300 text-xs font-medium transition-colors z-10"
      >
        تخطّي
      </button>

      {/* Step indicator dots */}
      <div className="absolute top-5 right-5 flex items-center gap-1.5 z-10">
        {steps.map((_, i) => (
          <motion.span
            key={i}
            animate={{ scale: i === step ? 1.2 : 1, opacity: i === step ? 1 : 0.4 }}
            className={`w-1.5 h-1.5 rounded-full ${i === step ? 'bg-purple-400' : 'bg-gray-600'}`}
          />
        ))}
      </div>

      {/* Card */}
      <motion.div
        key={step}
        initial={{ opacity: 0, x: dir * 40, scale: 0.95 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className={`relative bg-gray-900/95 border border-gray-700/50 rounded-3xl p-8 max-w-xs w-full text-center overflow-hidden ring-1 ${s.ring}`}
      >
        {/* Gradient backdrop */}
        <div className={`absolute inset-0 bg-gradient-to-br ${s.accent} pointer-events-none`} />

        {/* Content */}
        <div className="relative z-10 space-y-4">
          {/* Icon with pulse ring */}
          <div className="relative mx-auto w-fit">
            <motion.div
              className="absolute inset-0 rounded-2xl border-2 border-current opacity-20"
              animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0, 0.3] }}
              transition={{ duration: 2.5, repeat: Infinity }}
              style={{ color: 'currentColor' }}
            />
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gray-800/80 border border-gray-700/50 flex items-center justify-center">
              {s.icon}
            </div>
          </div>

          <h2 className="text-white font-bold text-lg">{s.title}</h2>
          <p className="text-gray-400 text-sm leading-relaxed">{s.desc}</p>

          {s.hint && (
            <motion.div
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="inline-flex items-center gap-1.5 bg-gray-800/60 border border-gray-700/40 rounded-full px-3 py-1.5"
            >
              <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
                <ChevronDown size={12} className="text-gray-500 rotate-180" />
              </motion.div>
              <span className="text-gray-500 text-[11px]">{s.hint}</span>
            </motion.div>
          )}

          {/* Navigation */}
          <div className="flex items-center gap-3 pt-2">
            {step > 0 && (
              <button
                onClick={goBack}
                className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-xs font-medium transition-colors px-3 py-2"
              >
                <ChevronRight size={14} />
                السابق
              </button>
            )}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={goNext}
              className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl py-3 font-bold text-sm transition-all shadow-lg shadow-purple-900/30"
            >
              {step < steps.length - 1 ? 'التالي' : 'ابدأ الجولة'}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── One-to-One Tutorial Overlay ─────────────────────────────────────────────
function OneToOneTutorial({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)

  const steps = [
    {
      icon: <Users size={28} className="text-pink-400" />,
      title: "جلستك الفردية الأولى",
      desc: "اخترت هذا الشخص من جولات التعارف الجماعية — الآن لديك جلسة خاصة 1:1 معه",
      accent: "from-pink-600/20 to-rose-600/10",
      ring: "ring-pink-500/30",
    },
    {
      icon: <Users size={28} className="text-rose-400" />,
      title: "اكشف اسم شريكك",
      desc: "اضغط على زر «اكشف اسمه / اسمها» لمعرفة الشخص الذي اخترته للجلسة الفردية",
      accent: "from-rose-600/20 to-pink-600/10",
      ring: "ring-rose-500/30",
      hint: "الزر الكبير في المنتصف",
    },
    {
      icon: <MapPin size={28} className="text-amber-400" />,
      title: "رقم طاولتك",
      desc: "بعد الكشف، سيظهر رقم الطاولة التي يجب أن تذهب إليها لمقابلة شريكك",
      accent: "from-amber-600/20 to-orange-600/10",
      ring: "ring-amber-500/30",
      hint: "ابحث عن الرقم الكبير",
    },
    {
      icon: <MessageSquare size={28} className="text-purple-400" />,
      title: "أسئلة الجلسة",
      desc: "اضغط «انتقل إلى أسئلة الجلسة» للوصول إلى أسئلة نقاش تساعدك في المحادثة مع شريكك",
      accent: "from-purple-600/20 to-violet-600/10",
      ring: "ring-purple-500/30",
      hint: "الزر في أسفل البطاقة",
    },
    {
      icon: <Clock size={28} className="text-amber-400" />,
      title: "المؤقت",
      desc: "يظهر المؤقت عند بدء الجلسة — ينبهك عند اقتراب انتهاء الوقت، انتقل للتقييم عند انتهائه",
      accent: "from-amber-600/20 to-orange-600/10",
      ring: "ring-amber-500/30",
    },
    {
      icon: <Heart size={28} className="text-emerald-400" />,
      title: "التقييم بعد الجلسة",
      desc: "عند انتهاء الجلسة، ستقيم تجربتك — إجاباتك سرية وتساعدنا في تحسين التجربة",
      accent: "from-emerald-600/20 to-teal-600/10",
      ring: "ring-emerald-500/30",
    },
  ]

  const goNext = () => {
    if (step < steps.length - 1) { setDir(1); setStep(s => s + 1) }
    else onClose()
  }
  const goBack = () => { if (step > 0) { setDir(-1); setStep(s => s - 1) } }

  const s = steps[step]

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[500] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
      dir="rtl"
    >
      <button
        onClick={onClose}
        className="absolute top-5 left-5 text-gray-500 hover:text-gray-300 text-xs font-medium transition-colors z-10"
      >
        تخطّي
      </button>

      <div className="absolute top-5 right-5 flex items-center gap-1.5 z-10">
        {steps.map((_, i) => (
          <motion.span
            key={i}
            animate={{ scale: i === step ? 1.2 : 1, opacity: i === step ? 1 : 0.4 }}
            className={`w-1.5 h-1.5 rounded-full ${i === step ? 'bg-pink-400' : 'bg-gray-600'}`}
          />
        ))}
      </div>

      <motion.div
        key={step}
        initial={{ opacity: 0, x: dir * 40, scale: 0.95 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className={`relative bg-gray-900/95 border border-gray-700/50 rounded-3xl p-8 max-w-xs w-full text-center overflow-hidden ring-1 ${s.ring}`}
      >
        <div className={`absolute inset-0 bg-gradient-to-br ${s.accent} pointer-events-none`} />

        <div className="relative z-10 space-y-4">
          <div className="relative mx-auto w-fit">
            <motion.div
              className="absolute inset-0 rounded-2xl border-2 border-current opacity-20"
              animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0, 0.3] }}
              transition={{ duration: 2.5, repeat: Infinity }}
              style={{ color: 'currentColor' }}
            />
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gray-800/80 border border-gray-700/50 flex items-center justify-center">
              {s.icon}
            </div>
          </div>

          <h2 className="text-white font-bold text-lg">{s.title}</h2>
          <p className="text-gray-400 text-sm leading-relaxed">{s.desc}</p>

          {s.hint && (
            <motion.div
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="inline-flex items-center gap-1.5 bg-gray-800/60 border border-gray-700/40 rounded-full px-3 py-1.5"
            >
              <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
                <ChevronDown size={12} className="text-gray-500 rotate-180" />
              </motion.div>
              <span className="text-gray-500 text-[11px]">{s.hint}</span>
            </motion.div>
          )}

          <div className="flex items-center gap-3 pt-2">
            {step > 0 && (
              <button
                onClick={goBack}
                className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-xs font-medium transition-colors px-3 py-2"
              >
                <ChevronRight size={14} />
                السابق
              </button>
            )}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={goNext}
              className="flex-1 bg-gradient-to-r from-pink-600 to-rose-600 text-white rounded-xl py-3 font-bold text-sm transition-all shadow-lg shadow-pink-900/30"
            >
              {step < steps.length - 1 ? 'التالي' : 'ابدأ الجلسة'}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
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
    if (timeLeft === 10 && "vibrate" in navigator) { try { navigator.vibrate(200) } catch {} }
    if (timeLeft === 0 && "vibrate" in navigator) { try { navigator.vibrate([300, 100, 300]) } catch {} }
  }, [timeLeft, timerActive])

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

// ─── Ranking Tutorial Overlay ─────────────────────────────────────────────────
function RankingTutorial({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [rankOrder, setRankOrder] = useState([1, 0, 3, 2])
  const TOTAL = 4

  const goNext = () => { if (step < TOTAL - 1) { setDir(1); setStep(s => s + 1) } else onClose() }
  const goPrev = () => { if (step > 0) { setDir(-1); setStep(s => s - 1) } }

  // Auto-animate ranking order on step 0
  useEffect(() => {
    if (step !== 0) return
    const orders = [[1,0,3,2], [0,2,1,3], [2,0,1,3], [0,1,2,3]]
    let i = 0
    const iv = setInterval(() => { i = (i + 1) % orders.length; setRankOrder(orders[i]) }, 1300)
    return () => clearInterval(iv)
  }, [step])

  const people = [
    { name: "سارة", init: "س", color: "from-pink-500 to-rose-500", dim: "bg-pink-900/30 border-pink-800/40" },
    { name: "لين",  init: "ل", color: "from-blue-500 to-cyan-500",  dim: "bg-blue-900/30 border-blue-800/40"  },
    { name: "نورة", init: "ن", color: "from-violet-500 to-purple-500", dim: "bg-violet-900/30 border-violet-800/40" },
    { name: "مي",   init: "م", color: "from-emerald-500 to-teal-500", dim: "bg-emerald-900/30 border-emerald-800/40" },
  ]
  const rankStyle = (i: number) =>
    i === 0 ? "bg-gradient-to-br from-amber-400 to-yellow-500 text-black shadow-lg shadow-amber-500/30" :
    i === 1 ? "bg-gradient-to-br from-gray-300 to-gray-400 text-black" :
    i === 2 ? "bg-gradient-to-br from-amber-700 to-amber-800 text-white" :
    "bg-gray-800 text-gray-500"

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[500] bg-black/90 backdrop-blur-sm flex flex-col items-center justify-between px-6 pt-14 pb-6"
      dir="rtl"
    >
      <button onClick={onClose} className="absolute top-5 left-5 text-gray-500 hover:text-gray-300 text-xs font-medium z-10">تخطّي</button>
      <div className="absolute top-5 right-5 flex items-center gap-1.5 z-10">
        {Array.from({ length: TOTAL }).map((_, i) => (
          <motion.span key={i}
            animate={{ scale: i === step ? 1.3 : 1, opacity: i === step ? 1 : i < step ? 0.6 : 0.3 }}
            className={`w-1.5 h-1.5 rounded-full ${i === step ? "bg-amber-400" : i < step ? "bg-amber-600" : "bg-gray-600"}`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait" custom={dir}>
        <motion.div key={step}
          initial={{ opacity: 0, x: dir * 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -dir * 50 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="w-full max-w-sm flex flex-col items-center gap-4 flex-1 justify-center"
        >

          {/* ── Step 0: Animated drag-to-rank list ──────────────────────── */}
          {step === 0 && (
            <>
              <div className="text-center space-y-1">
                <div className="text-4xl mb-2">🏆</div>
                <h2 className="text-white font-black text-xl">رتّب من أعجبك</h2>
                <p className="text-gray-400 text-sm">من الأعلى اهتماماً للأقل — الأول هو أولويتك القصوى</p>
              </div>
              <div className="w-full space-y-2">
                {rankOrder.map((pi, rank) => {
                  const p = people[pi]
                  return (
                    <motion.div key={pi} layout
                      transition={{ type: "spring", stiffness: 350, damping: 28 }}
                      className={`flex items-center gap-3 ${p.dim} border rounded-2xl px-4 py-3`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0 transition-all duration-300 ${rankStyle(rank)}`}>{rank + 1}</div>
                      <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${p.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>{p.init}</div>
                      <span className="text-white text-sm font-medium flex-1">{p.name}</span>
                      {rank === 0 && (
                        <motion.span key="star" initial={{ scale: 0 }} animate={{ scale: 1 }}
                          className="text-amber-400 text-[10px] font-semibold">⭐ أولوية</motion.span>
                      )}
                    </motion.div>
                  )
                })}
              </div>
              <p className="text-gray-600 text-xs text-center">↑↓ الترتيب يتغير بسحب البطاقات</p>
            </>
          )}

          {/* ── Step 1: Scenarios – what each ranking leads to ─────────── */}
          {step === 1 && (
            <>
              <div className="text-center space-y-1">
                <div className="text-4xl mb-2">🎭</div>
                <h2 className="text-white font-black text-xl">ماذا يحدث لكل اختيار؟</h2>
                <p className="text-gray-400 text-sm">النتيجة تعتمد على ترتيب الطرفين معاً</p>
              </div>
              <div className="w-full space-y-2.5">

                {/* Scenario A: mutual #1/#1 → MATCH */}
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 }}
                  className="bg-emerald-900/25 border border-emerald-700/40 rounded-2xl px-3.5 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-emerald-500 text-black text-[9px] font-black rounded-full px-2 py-0.5">✅ تطابق مثالي</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                      <div className="text-[10px] text-gray-400">رتّبتها</div>
                      <div className="w-7 h-7 rounded-full bg-amber-400 text-black text-[10px] font-black flex items-center justify-center">#1</div>
                    </div>
                    <div className="flex-1 flex flex-col items-center gap-0.5">
                      <div className="flex items-center w-full gap-1">
                        <div className="flex-1 border-t border-dashed border-emerald-600/50"/>
                        <motion.span animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} className="text-base">❤️</motion.span>
                        <div className="flex-1 border-t border-dashed border-emerald-600/50"/>
                      </div>
                      <span className="text-emerald-400 text-[9px] font-bold">متبادل → جلسة!</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                      <div className="text-[10px] text-gray-400">الشخص الآخر رتّبك</div>
                      <div className="w-7 h-7 rounded-full bg-amber-400 text-black text-[10px] font-black flex items-center justify-center">#1</div>
                    </div>
                  </div>
                </motion.div>

                {/* Scenario B: you #3 / they #1 → weak match */}
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}
                  className="bg-amber-950/30 border border-amber-800/30 rounded-2xl px-3.5 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-amber-900/50 text-amber-300 border border-amber-700/40 text-[9px] font-black rounded-full px-2 py-0.5">⚠️ تطابق ضعيف</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                      <div className="text-[10px] text-gray-400">رتّبتها</div>
                      <div className="w-7 h-7 rounded-full bg-gray-700 text-gray-400 text-[10px] font-black flex items-center justify-center">#3</div>
                    </div>
                    <div className="flex-1 flex flex-col items-center gap-0.5">
                      <div className="flex items-center w-full gap-1">
                        <div className="flex-1 border-t border-dashed border-amber-800/40"/>
                        <span className="text-amber-700 text-sm">↔</span>
                        <div className="flex-1 border-t border-dashed border-amber-800/40"/>
                      </div>
                      <span className="text-amber-700 text-[9px]">غير متكافئ</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                      <div className="text-[10px] text-gray-400">الشخص الآخر رتّبك</div>
                      <div className="w-7 h-7 rounded-full bg-amber-400 text-black text-[10px] font-black flex items-center justify-center">#1</div>
                    </div>
                  </div>
                </motion.div>

                {/* Scenario C: you #4 / they #1 → rejected */}
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 }}
                  className="bg-red-950/20 border border-red-900/30 rounded-2xl px-3.5 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-red-950/50 text-red-400 border border-red-900/40 text-[9px] font-black rounded-full px-2 py-0.5">❌ لا جلسة</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                      <div className="text-[10px] text-gray-400">رتّبته</div>
                      <div className="w-7 h-7 rounded-full bg-gray-800 text-gray-600 text-[10px] font-black flex items-center justify-center">#4</div>
                    </div>
                    <div className="flex-1 flex flex-col items-center gap-0.5">
                      <div className="flex items-center w-full gap-1">
                        <div className="flex-1 border-t border-dashed border-red-900/30"/>
                        <span className="text-red-800 text-sm font-black">✕</span>
                        <div className="flex-1 border-t border-dashed border-red-900/30"/>
                      </div>
                      <span className="text-red-800 text-[9px]">وضعك آخر الترتيب</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                      <div className="text-[10px] text-gray-400">الشخص الآخر رتّبك</div>
                      <div className="w-7 h-7 rounded-full bg-amber-400 text-black text-[10px] font-black flex items-center justify-center">#1</div>
                    </div>
                  </div>
                </motion.div>

              </div>
            </>
          )}

          {/* ── Step 2: The system finds the best mutual match ─────────── */}
          {step === 2 && (
            <>
              <div className="text-center space-y-1">
                <div className="text-4xl mb-2">🔍</div>
                <h2 className="text-white font-black text-xl">النظام يقارن الترتيبات</h2>
                <p className="text-gray-400 text-sm">يبحث عن أعلى تطابق متبادل بين الجميع</p>
              </div>
              <div className="w-full space-y-3">
                {/* Mutual – glowing */}
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                  className="relative bg-emerald-900/25 border border-emerald-700/50 rounded-2xl p-4 overflow-hidden">
                  <motion.div className="absolute inset-0 bg-emerald-500/8 rounded-2xl"
                    animate={{ opacity: [0, 1, 0] }} transition={{ duration: 1.8, repeat: Infinity }} />
                  <div className="relative flex items-center justify-between">
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-black">أ</div>
                      <span className="text-gray-400 text-[10px]">أنت</span>
                      <span className="text-amber-400 text-[9px] font-bold">رتّبها #1</span>
                    </div>
                    <div className="flex-1 flex flex-col items-center gap-1 px-2">
                      <div className="flex items-center w-full gap-1">
                        <motion.div className="flex-1 h-px bg-emerald-500/60"
                          animate={{ scaleX: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity }} />
                        <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 1, repeat: Infinity }} className="text-xl">❤️</motion.div>
                        <motion.div className="flex-1 h-px bg-emerald-500/60"
                          animate={{ scaleX: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity }} />
                      </div>
                      <span className="text-emerald-300 text-[10px] font-bold bg-emerald-900/50 border border-emerald-700/40 px-2 py-0.5 rounded-full">تطابق!</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-white font-black">س</div>
                      <span className="text-gray-400 text-[10px]">سارة</span>
                      <span className="text-amber-400 text-[9px] font-bold">رتّبتك #1 أيضاً</span>
                    </div>
                  </div>
                </motion.div>
                {/* Non-mutual – faded */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.38 }} transition={{ delay: 0.55 }}
                  className="bg-gray-900/50 border border-gray-800/50 rounded-2xl p-3.5 flex items-center justify-between">
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center text-gray-400 text-xs font-bold">ل</div>
                    <span className="text-gray-600 text-[9px]">لين رتّبتك #1</span>
                  </div>
                  <div className="flex-1 text-center">
                    <span className="text-gray-700 text-lg font-black">✕</span>
                    <p className="text-gray-700 text-[9px]">أنت رتّبتها #3</p>
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center text-gray-400 text-xs font-bold">أ</div>
                    <span className="text-gray-600 text-[9px]">لا جلسة</span>
                  </div>
                </motion.div>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
                  className="bg-amber-900/15 border border-amber-800/30 rounded-2xl px-4 py-2.5 text-center">
                  <p className="text-amber-400/70 text-xs">💡 كل شخص يحصل على أفضل تطابق متبادل ممكن</p>
                </motion.div>
              </div>
            </>
          )}

          {/* ── Step 3: Result ───────────────────────────────────────────── */}
          {step === 3 && (
            <>
              <div className="text-center space-y-1">
                <div className="text-4xl mb-2">✨</div>
                <h2 className="text-white font-black text-xl">نتيجتك: جلستان فرديتان</h2>
                <p className="text-gray-400 text-sm">ترتيبك يحدد من ستجلس معه في الجلستين الفرديتين</p>
              </div>
              <div className="w-full space-y-3">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                  className="bg-pink-900/25 border border-pink-700/40 rounded-2xl p-4 flex items-center gap-3">
                  <div className="text-2xl flex-shrink-0">💘</div>
                  <div>
                    <p className="text-white font-bold text-sm">جلسة اختيارك</p>
                    <p className="text-pink-300 text-xs mt-0.5">أعلى تطابق متبادل من ترتيبك — أنت من اختار</p>
                  </div>
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                  className="bg-purple-900/25 border border-purple-700/40 rounded-2xl p-4 flex items-center gap-3">
                  <div className="text-2xl flex-shrink-0">🧠</div>
                  <div>
                    <p className="text-white font-bold text-sm">جلسة التوافق الذكي</p>
                    <p className="text-purple-300 text-xs mt-0.5">النظام يختار أفضل توافق بناءً على بياناتكما معاً</p>
                  </div>
                </motion.div>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
                  className="bg-amber-900/15 border border-amber-800/30 rounded-2xl px-4 py-2.5 text-center space-y-1">
                  <p className="text-amber-300/80 text-xs">🔑 كلما كان ترتيبك متبادلاً — كانت جلستك أدق توافقاً</p>
                  <p className="text-gray-600 text-[11px]">قد تُطابق مع شخص رتّبته أخيراً إذا لم يخترك أي من أعلى خياراتك — النظام يبحث عن أفضل تطابق ممكن للجميع</p>
                </motion.div>
              </div>
            </>
          )}

        </motion.div>
      </AnimatePresence>

      <div className="w-full max-w-sm flex items-center gap-3 mt-4">
        {step > 0 && (
          <button onClick={goPrev} className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-sm px-3 py-3.5 transition-colors">
            <ChevronRight size={15} /> السابق
          </button>
        )}
        <motion.button whileTap={{ scale: 0.97 }} onClick={goNext}
          className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 text-black font-black rounded-2xl py-3.5 text-base shadow-2xl shadow-amber-500/30">
          {step < TOTAL - 1 ? "التالي ←" : "فهمت — ابدأ الترتيب! 🏆"}
        </motion.button>
      </div>
    </motion.div>
  )
}

// ─── Ranking Screen ───────────────────────────────────────────────────────────
function RankingScreen({ token, completedRounds, currentPhase }: { token: string, completedRounds: number, currentPhase: string }) {
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
  const initialPhaseRef = useRef(currentPhase)

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

  // Detect phase change while user is on ranking screen
  useEffect(() => {
    if (currentPhase !== initialPhaseRef.current && !submitted) {
      setShowPhaseWarning(true)
      toast('⏰ المنظم انتقل للمرحلة التالية — ارتب اختياراتك وأرسلها بسرعة!', { duration: 6000, icon: '⏰' })
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
    <PageWrapper className="overflow-y-auto">
      <div className="max-w-md mx-auto pb-6">

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

        {/* Sticky header — compact */}
        <div className="sticky top-0 bg-gray-950/95 backdrop-blur-md z-10 border-b border-gray-800/50">
          <div className="px-4 pt-3 pb-2">
            <div className="flex items-center justify-center gap-2">
              <Trophy size={15} className="text-amber-400" />
              <h1 className="text-base font-bold text-white">رتّب أولوياتك</h1>
              <span className="text-gray-500 text-[11px]">· {people.length} أشخاص</span>
              {submitted && (
                <span className="flex items-center gap-1 bg-emerald-900/30 border border-emerald-800/40 rounded-full px-2 py-0.5">
                  <CheckCircle size={9} className="text-emerald-400" />
                  <span className="text-emerald-300 text-[10px] font-semibold">تم الإرسال</span>
                </span>
              )}
            </div>
            <div className="flex items-center justify-center gap-2 mt-1.5">
              <span className="text-purple-300 text-[10px] bg-purple-900/30 border border-purple-800/40 rounded-full px-2.5 py-0.5 font-medium">
                اسحب للترتيب · سري تماماً
              </span>
              {newNums.size > 0 && (
                <span className="text-purple-400 text-[10px] bg-purple-900/20 rounded-full px-2 py-0.5">
                  ✨ {newNums.size} جديد
                </span>
              )}
            </div>
          </div>

          {/* Round legend */}
          <div className="px-4 pb-2 flex gap-1.5 justify-center flex-wrap">
            {Array.from({ length: completedRounds }, (_, i) => i + 1).map(r => (
              <span key={r} className={`text-[10px] px-2.5 py-0.5 rounded-full border ${roundStyle(r)}`}>
                {roundLabel(r)}
              </span>
            ))}
          </div>

        </div>

        {/* Scroll hint */}
        <div className="text-center pt-2">
          <InfoHint text="مرّر للأسفل لرؤية جميع الأشخاص · اسحب الأسماء لإعادة الترتيب" delay={0.5} duration={4} />
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

                    {/* Note toggle button — single tap opens notes, hold to drag */}
                    <button
                      onClick={e => { e.stopPropagation(); setOpenNote(openNote === num ? null : num) }}
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
          {submitted ? (
            <div className="space-y-2 text-center">
              <div className="flex items-center justify-center gap-2 bg-emerald-900/30 border border-emerald-700/40 rounded-2xl py-3.5 px-4">
                <CheckCircle size={18} className="text-emerald-400" />
                <span className="text-emerald-300 font-bold text-sm">تم إرسال تصنيفك</span>
              </div>
              <p className="text-gray-600 text-[11px]">انتظر المنظم للانتقال للمرحلة التالية</p>
              <button onClick={() => setSubmitted(false)} disabled={submitting}
                className="text-gray-500 hover:text-gray-300 text-xs underline transition-colors">
                تعديل التصنيف
              </button>
            </div>
          ) : (
            <>
              <motion.button
                onClick={() => setShowConfirm(true)}
                disabled={submitting}
                whileTap={{ scale: 0.97 }}
                className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-60 text-white rounded-2xl py-4 font-bold text-base shadow-2xl shadow-purple-600/30 transition-all"
              >
                {submitting ? <Spinner size={18} className="!text-white" /> : <Send size={18} />}
                إرسال التصنيف النهائي
              </motion.button>
              <p className="text-center text-gray-700 text-[11px] mt-2">
                النظام سيختار توافقك الأمثل من تصنيفاتك · قد تُطابق مع خيارك الأخير إذا لم يخترك أعلى خياراتك
              </p>
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
                ستقوم بإرسال ترتيبك النهائي لـ <span className="text-white font-semibold">{order.length}</span> شخص.
                {submitted ? " سيتم تحديث تصنيفك السابق." : " يمكنك تعديل تصنيفك لاحقاً بعد الإرسال."}
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
function FeedbackFlow({ partnerName, word, done, onDone, onBack, onSubmit }: {
  partnerName: string | null; word: string; done: boolean
  onDone: () => void; onBack: () => void; onSubmit: (fb: Record<string, any>) => Promise<boolean>
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
              transition={{ type: 'spring', stiffness: 350, damping: 35 }} className="space-y-8">
              <div className="text-center space-y-2">
                <p className="text-3xl font-black text-white">هل تريد التواصل لاحقاً؟</p>
              </div>
              {/* Highlighted info card */}
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-950/40 via-teal-950/30 to-emerald-950/20 px-4 py-3.5"
              >
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent" />
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                    <Sparkles size={14} className="text-emerald-400" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-emerald-300 text-[11px] font-bold">معلومة مهمة</p>
                    <p className="text-gray-300 text-[11px] leading-relaxed">إجابتك سرية — إذا أجاب كلاكما بـ«نعم» ستحصلان على رقم تواصل ومعلومات بعضكم في صفحة النتائج بعد الفعالية</p>
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
  const [messages, setMessages] = useState<{ id: string; text: string; from: 'user' | 'organizer'; status: string }[]>([])
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
      const userMsgs: { id: string; text: string; from: 'user'; status: string }[] = []
      const orgMsgs: { id: string; text: string; from: 'organizer'; status: string }[] = []
      for (const r of d.requests) {
        if (r.message) userMsgs.push({ id: r.id, text: r.message, from: 'user', status: r.status })
        if (r.organizer_reply) orgMsgs.push({ id: r.id + '-reply', text: r.organizer_reply, from: 'organizer', status: r.status })
      }
      const all = [...userMsgs, ...orgMsgs].sort((a, b) => a.id.localeCompare(b.id))
      setMessages(all)
      const prevCount = lastReplyCountRef.current
      if (orgMsgs.length > prevCount && prevCount >= 0) {
        setHasUnread(true)
        if (!openRef.current) {
          toast('💬 رسالة من المنظم!', { duration: 4000 })
        }
      }
      lastReplyCountRef.current = orgMsgs.length
      sessionStorage.setItem('sos_last_reply_count', String(orgMsgs.length))
      if (userMsgs.length > 0 || orgMsgs.length > 0) setShowOptions(false)
      else setShowOptions(true)
      if (orgMsgs.length === 0 && userMsgs.length === 0) setHasUnread(false)
    }
    doFetch()
    const iv = setInterval(doFetch, 10000)
    return () => clearInterval(iv)
  }, [token])

  useEffect(() => {
    if (open) { setHasUnread(false); scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }
  }, [open, messages])

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    const d = await call('e3-sos', token, { message: trimmed })
    setSending(false)
    if (!d.error) {
      setMessages(prev => [...prev, { id: d.id || String(Date.now()), text: trimmed, from: 'user', status: 'pending' }])
      setShowOptions(false)
      setInput("")
      toast.success('تم الإرسال ✅')
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
                    onClick={() => { setShowOptions(false); setInput(''); send('طلب مساعدة - أحتاج المنظم إلى طاولتي') }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-red-950/30 border border-red-800/40 hover:bg-red-950/50 transition-all text-right"
                  >
                    <span className="text-lg">🆘</span>
                    <div>
                      <p className="text-red-300 text-sm font-semibold">طلب مساعدة</p>
                      <p className="text-gray-500 text-[11px]">سيأتي المنظم إلى طاولتك</p>
                    </div>
                  </button>
                  <button
                    onClick={() => { setShowOptions(false); setInput('') }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-purple-950/30 border border-purple-800/40 hover:bg-purple-950/50 transition-all text-right"
                  >
                    <span className="text-lg">💬</span>
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
function Phase2RevealScreen({ token, timerActive, timerStart, timerDuration }: {
  token: string; timerActive: boolean; timerStart: string | null; timerDuration: number
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
    if (elapsed > 60 && remaining > 0) { setTableRevealed(true); setRevealed(true); setView('session') }
    else if (remaining <= 0) { setTableRevealed(true); setRevealed(true); setView('feedback') }
  }, [data, timerActive, timerStart, timerDuration])

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
                    <p className="text-gray-500 text-xs flex items-center justify-end gap-1.5 mb-1">الجلسة تبدأ خلال <Clock size={11} className="text-pink-400" /></p>
                    <div className={`text-4xl font-mono font-black tabular-nums ${timeLeft < 60 ? "text-red-400" : "text-white"}`}>{formatTime(timeLeft)}</div>
                  </div>
                  <div className="h-1 bg-gray-800/60">
                    <motion.div className={`h-full ${timeLeft < 60 ? "bg-gradient-to-r from-red-500 to-red-400" : "bg-gradient-to-r from-pink-500 via-rose-400 to-pink-600"}`}
                      style={{ boxShadow: timeLeft < 60 ? "0 0 8px rgba(239,68,68,0.7)" : "0 0 10px rgba(236,72,153,0.7)" }}
                      animate={{ width: `${(timeLeft / timerDuration) * 100}%` }} transition={{ duration: 1 }} />
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
              <motion.button onClick={handleReveal} whileTap={{ scale: 0.97 }}
                className="w-full bg-gradient-to-br from-pink-600 via-rose-600 to-pink-700 text-white rounded-2xl py-5 font-bold text-lg shadow-2xl shadow-pink-600/40 border border-pink-500/30">
                <motion.span animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 1.8, repeat: Infinity }} className="flex items-center justify-center gap-3">
                  <MapPin size={22} /> وصلت إلى الطاولة
                </motion.span>
              </motion.button>
              {timerActive && timeLeft > 0 && (
                <div className="rounded-2xl bg-gray-900/80 border border-white/[0.05] overflow-hidden">
                  <div className="px-5 pt-4 pb-3">
                    <p className="text-gray-500 text-xs flex items-center justify-end gap-1.5 mb-1">الجلسة تبدأ خلال <Clock size={11} className="text-pink-400" /></p>
                    <div className={`text-4xl font-mono font-black tabular-nums ${timeLeft < 60 ? "text-red-400" : "text-white"}`}>{formatTime(timeLeft)}</div>
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
                  <div className="relative z-10 px-6 pt-5 pb-6 text-center">
                    <div className="inline-flex items-center gap-1.5 bg-pink-900/50 border border-pink-700/40 rounded-full px-3 py-1 mb-4">
                      <Users size={10} className="text-pink-400" />
                      <span className="text-pink-300 text-[11px] font-semibold tracking-wide">جلسة فردية · اختيارك الشخصي</span>
                    </div>
                    <p className="text-5xl font-black text-white mb-2 tracking-tight" style={{ textShadow: '0 2px 20px rgba(236,72,153,0.3)' }}>{data?.partner_first_name || "..."}</p>
                    <p className="text-pink-400/50 text-xs mt-1">شريكك في جلسة الاختيار الشخصي</p>
                  </div>
                </div>
              </motion.div>

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
              if (!d.error) { toast.success('تم الحفظ ✨'); return true }
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
              <AnimatePresence>
                {showSessionTips && <SessionTips onClose={() => setShowSessionTips(false)} accent="pink" />}
              </AnimatePresence>
              <QuestionSlideshow defaultSet="special" />
              {/* PromptTopicsModal */}
              <button onClick={() => setShowPrompt(true)}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-full text-sm font-medium bg-gradient-to-r from-purple-600/60 to-pink-600/60 hover:from-purple-600 hover:to-pink-600 text-white transition-all border border-purple-700/30">
                <MessageSquare size={14} /> أسئلة للنقاش ✨
              </button>
              {/* Jump to feedback manually */}
              <button onClick={() => setView('feedback')} className="w-full py-2.5 rounded-xl text-xs text-gray-600 hover:text-gray-400 transition-colors">الانتهاء والتقييم →</button>
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
function Phase3RevealScreen({ token, timerActive, timerStart, timerDuration }: {
  token: string; timerActive: boolean; timerStart: string | null; timerDuration: number
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
  const [showSessionTips, setShowSessionTips] = useState(false)

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
    if (elapsed > 60 && remaining > 0) { setTableRevealed(true); setRevealed(true); setView('session') }
    else if (remaining <= 0) { setTableRevealed(true); setRevealed(true); setView('feedback') }
  }, [data, timerActive, timerStart, timerDuration])

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
                    <p className="text-gray-500 text-xs flex items-center justify-end gap-1.5 mb-1">الجلسة تبدأ خلال <Clock size={11} className="text-purple-400" /></p>
                    <div className={`text-4xl font-mono font-black tabular-nums ${timeLeft < 60 ? "text-red-400" : "text-white"}`}>{formatTime(timeLeft)}</div>
                  </div>
                  <div className="h-1 bg-gray-800/60">
                    <motion.div className={`h-full ${timeLeft < 60 ? "bg-gradient-to-r from-red-500 to-red-400" : "bg-gradient-to-r from-purple-500 via-violet-400 to-purple-600"}`}
                      style={{ boxShadow: timeLeft < 60 ? "0 0 8px rgba(239,68,68,0.7)" : "0 0 10px rgba(139,92,246,0.7)" }}
                      animate={{ width: `${(timeLeft / timerDuration) * 100}%` }} transition={{ duration: 1 }} />
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
              <motion.button onClick={handleReveal} whileTap={{ scale: 0.97 }}
                className="w-full bg-gradient-to-br from-purple-600 via-violet-600 to-purple-700 text-white rounded-2xl py-5 font-bold text-lg shadow-2xl shadow-purple-600/40 border border-purple-500/30">
                <motion.span animate={{ rotate: [0, -4, 4, 0] }} transition={{ duration: 3, repeat: Infinity }} className="flex items-center justify-center gap-3">
                  <MapPin size={22} /> وصلت إلى الطاولة
                </motion.span>
              </motion.button>
              {timerActive && timeLeft > 0 && (
                <div className="rounded-2xl bg-gray-900/80 border border-white/[0.05] overflow-hidden">
                  <div className="px-5 pt-4 pb-3">
                    <p className="text-gray-500 text-xs flex items-center justify-end gap-1.5 mb-1">الجلسة تبدأ خلال <Clock size={11} className="text-purple-400" /></p>
                    <div className={`text-4xl font-mono font-black tabular-nums ${timeLeft < 60 ? "text-red-400" : "text-white"}`}>{formatTime(timeLeft)}</div>
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
              <AnimatePresence>
                {showSessionTips && <SessionTips onClose={() => setShowSessionTips(false)} accent="purple" />}
              </AnimatePresence>
              <QuestionSlideshow defaultSet="set1" />
              <button onClick={() => setShowPrompt(true)}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-full text-sm font-medium bg-gradient-to-r from-purple-600/60 to-pink-600/60 hover:from-purple-600 hover:to-pink-600 text-white transition-all border border-purple-700/30">
                <MessageSquare size={14} /> أسئلة للنقاش ✨
              </button>
              {/* Jump to feedback */}
              <button onClick={() => setView('feedback')} className="w-full py-2.5 rounded-xl text-xs text-gray-600 hover:text-gray-400 transition-colors">الانتهاء والتقييم →</button>
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
            onSubmit={async (fbData) => {
              const d = await call('e3-submit-phase3-feedback', token, { feedback: fbData })
              if (!d.error) { toast.success('تم الحفظ ✨'); return true }
              return false
            }}
          />
        )}
      </AnimatePresence>
    </PageWrapper>
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
    if (!d.error) { setMatchPref(pref); toast.success("تم حفظ تفضيلك ✅") }
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
            <div className="text-3xl mb-2">🏆</div>
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
              <div className="text-4xl">🎉</div>
              <h2 className="text-xl font-black text-white">انتهت الفعالية!</h2>
              <p className="text-gray-400 text-sm leading-relaxed">
                راجع نتائجك وتفاصيل التوافق هنا. يمكنك العودة لأعلى الصفحة لمواصلة أسئلة الجلسات الفردية إذا أردت.
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
  const [isOffline, setIsOffline] = useState(false)
  const [tokenError, setTokenError] = useState(false)

  const fetchState = useCallback(async () => {
    if (!token) return
    const d = await call("e3-get-state", token)
    if (d.error) {
      if (d.error.includes("Invalid") || d.error.includes("token") || d.error.includes("expired")) {
        setTokenError(true)
        localStorage.removeItem("blindmatch_result_token")
      }
      return
    }
    setEventState(d)
    setEnrolled(prev => prev === null ? (d.enrolled !== false) : prev)
    setMyInfo(prev => prev ?? (d.my_info || null))
  }, [token])

  useEffect(() => {
    const p = searchParams.get("token") || searchParams.get("t")
    if (p) { setToken(p); localStorage.setItem("blindmatch_result_token", p) }
  }, [searchParams])

  useEffect(() => {
    if (!token) return
    fetchState()
    const iv = setInterval(fetchState, 5000)
    return () => clearInterval(iv)
  }, [token, fetchState])

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
    <div className="h-[100dvh] flex flex-col bg-gray-950 overflow-hidden" dir="rtl">
      <Toaster position="top-center" toastOptions={{ style: { background: "#1f2937", color: "#f9fafb", border: "1px solid #374151", borderRadius: "12px" } }} />

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
          {completedRounds && <RankingScreen key={phase} token={token} completedRounds={completedRounds} currentPhase={phase} />}
          {phase === "phase2_reveal" && <Phase2RevealScreen key="p2r" token={token} {...timerProps} />}
          {phase === "phase3_reveal" && <Phase3RevealScreen key="p3r" token={token} {...timerProps} />}
          {phase === "final_reveal" && <FinalRevealScreen key="final" token={token} />}
        </AnimatePresence>
      </div>

      {/* SOS button — hidden on final reveal and ranking pages */}
      {enrolled && !rankingMatch && phase !== "final_reveal" && <SOSButton token={token} position="bottom" />}
    </div>
  )
}
