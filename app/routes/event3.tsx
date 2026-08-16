import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react"
import { useId } from "react"
import { GroupsPage } from "./groups"
import { useSearchParams } from "react-router"
import toast, { Toaster } from "react-hot-toast"
import { motion, AnimatePresence, Reorder, MotionConfig, useDragControls, useReducedMotion } from "framer-motion"

async function fireConfetti(opts: any) {
  try {
    const confetti = (await import("canvas-confetti")).default
    confetti(opts)
  } catch {}
}
import {
  Clock, MapPin, Brain, ExternalLink, ArrowLeft, KeyRound,
  CheckCircle, Send, RefreshCw, Sparkles, Home, Trophy, Lock, GripVertical,
  MessageSquare, ChevronRight, Users, PenLine, Shuffle, BarChart3, GitMerge, X, Heart,
  Frown, Meh, Smile, Layers, Zap,
  Snowflake, Target, Star, Drama, AlertTriangle, Lightbulb, PartyPopper, LifeBuoy,
  EyeOff, Smartphone, Handshake, Timer, Ban, ShieldCheck, Coffee, Bell, Info, Loader2,
  Crown, Medal, Award, Download,
} from "lucide-react"

import { QuestionSlideshow } from "~/components/QuestionSlideshow"

const PromptTopicsModal = lazy(() => import("~/components/PromptTopicsModal"))

// Create a shareable portrait card without relying on DOM screenshot libraries.
// Drawing it directly keeps Arabic text sharp and makes saving reliable on mobile.
async function createAiWelcomeImage(message: string): Promise<Blob> {
  await document.fonts?.ready
  const canvas = document.createElement("canvas")
  canvas.width = 1080
  canvas.height = 1350
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas is unavailable")

  const roundedRect = (x: number, y: number, width: number, height: number, radius: number) => {
    const r = Math.min(radius, width / 2, height / 2)
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + width - r, y)
    ctx.quadraticCurveTo(x + width, y, x + width, y + r)
    ctx.lineTo(x + width, y + height - r)
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
    ctx.lineTo(x + r, y + height)
    ctx.quadraticCurveTo(x, y + height, x, y + height - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
  }

  const background = ctx.createLinearGradient(0, 0, 1080, 1350)
  background.addColorStop(0, "#090312")
  background.addColorStop(0.52, "#17082e")
  background.addColorStop(1, "#07030f")
  ctx.fillStyle = background
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const drawGlow = (x: number, y: number, radius: number, color: string) => {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius)
    glow.addColorStop(0, color)
    glow.addColorStop(1, "rgba(0,0,0,0)")
    ctx.fillStyle = glow
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }
  drawGlow(930, 130, 430, "rgba(147,51,234,0.32)")
  drawGlow(120, 1180, 390, "rgba(236,72,153,0.22)")
  drawGlow(560, 660, 520, "rgba(99,102,241,0.10)")

  const mark = ctx.createLinearGradient(438, 90, 642, 294)
  mark.addColorStop(0, "#9333ea")
  mark.addColorStop(1, "#db2777")
  roundedRect(438, 86, 204, 204, 50)
  ctx.fillStyle = mark
  ctx.shadowColor = "rgba(168,85,247,0.45)"
  ctx.shadowBlur = 55
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.fillStyle = "#ffffff"
  ctx.font = "700 84px Tajawal, Arial, sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("✦", 540, 190)

  ctx.direction = "rtl"
  ctx.textBaseline = "alphabetic"
  ctx.fillStyle = "#f5e9ff"
  ctx.font = "700 58px Tajawal, Arial, sans-serif"
  ctx.fillText("التوافق الأعمى", 540, 370)
  ctx.fillStyle = "rgba(216,180,254,0.72)"
  ctx.font = "700 28px Tajawal, Arial, sans-serif"
  ctx.fillText("يرحّب بك", 540, 420)

  roundedRect(92, 480, 896, 680, 46)
  ctx.fillStyle = "rgba(255,255,255,0.055)"
  ctx.fill()
  ctx.strokeStyle = "rgba(255,255,255,0.12)"
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.fillStyle = "#d8b4fe"
  ctx.font = "700 27px Tajawal, Arial, sans-serif"
  ctx.fillText("رسالة خاصة لك", 540, 555)

  const maxTextWidth = 760
  const wrap = (fontSize: number) => {
    ctx.font = `500 ${fontSize}px Tajawal, Arial, sans-serif`
    const lines: string[] = []
    for (const paragraph of message.trim().split(/\n+/)) {
      let line = ""
      for (const word of paragraph.trim().split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word
        if (ctx.measureText(candidate).width <= maxTextWidth || !line) line = candidate
        else { lines.push(line); line = word }
      }
      if (line) lines.push(line)
    }
    return lines
  }

  let fontSize = 43
  let lines = wrap(fontSize)
  let lineHeight = Math.round(fontSize * 1.72)
  while (lines.length * lineHeight > 460 && fontSize > 23) {
    fontSize -= 2
    lines = wrap(fontSize)
    lineHeight = Math.round(fontSize * 1.72)
  }
  const textBlockHeight = lines.length * lineHeight
  let textY = 625 + Math.max(0, (460 - textBlockHeight) / 2)
  ctx.fillStyle = "#f3f4f6"
  ctx.font = `500 ${fontSize}px Tajawal, Arial, sans-serif`
  for (const line of lines) {
    ctx.fillText(line, 540, textY)
    textY += lineHeight
  }

  const footerGradient = ctx.createLinearGradient(300, 0, 780, 0)
  footerGradient.addColorStop(0, "rgba(236,72,153,0.75)")
  footerGradient.addColorStop(0.5, "rgba(192,132,252,0.9)")
  footerGradient.addColorStop(1, "rgba(99,102,241,0.75)")
  ctx.fillStyle = footerGradient
  roundedRect(390, 1220, 300, 4, 2)
  ctx.fill()
  ctx.fillStyle = "rgba(216,180,254,0.55)"
  ctx.font = "500 23px Tajawal, Arial, sans-serif"
  ctx.fillText("كُتبت خصيصاً لك بناءً على إجاباتك", 540, 1285)

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Image export failed")), "image/png", 1)
  })
}

const API = "/api/participant"

async function call(action: string, token: string | null, extra: Record<string, any> = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, token, ...extra }),
      signal: controller.signal,
    })
    const contentType = response.headers.get("content-type") || ""
    if (!contentType.includes("application/json")) {
      return { error: "تعذّر الاتصال بخدمة الفعالية. حاول مرة أخرى." }
    }
    const data = await response.json().catch(() => null)
    if (!data || typeof data !== "object") {
      return { error: "وصل رد غير متوقع. حاول مرة أخرى." }
    }
    if (!response.ok && !data.error) {
      return { ...data, error: "تعذّر إكمال الطلب. حاول مرة أخرى." }
    }
    return data
  } catch (error: any) {
    return {
      error: error?.name === "AbortError"
        ? "استغرق الاتصال وقتاً طويلاً. تحقق من الشبكة وحاول مرة أخرى."
        : "تعذّر الاتصال. تحقق من الشبكة وحاول مرة أخرى."
    }
  } finally {
    clearTimeout(timeout)
  }
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

  // Use refs for callback/option values that may change identity every render
  // (e.g. inline arrow functions) to avoid restarting the polling effect.
  const stopWhenRef = useRef(stopWhen)
  const enabledRef = useRef(enabled)
  const onErrorRef = useRef(onError)
  stopWhenRef.current = stopWhen
  enabledRef.current = enabled
  onErrorRef.current = onError

  const fetchOnce = useCallback(async (isRetry = false) => {
    if (!enabledRef.current) return
    if (isRetry) setLoading(true)
    try {
      const d = await fetcher()
      setData(d)
      setError(null)
      currentInterval.current = interval
      if (stopWhenRef.current && stopWhenRef.current(d)) stopped.current = true
      setRetryCount(0)
    } catch (err: any) {
      const msg = err?.message || "فشل الاتصال"
      setError(msg)
      onErrorRef.current?.(err)
      currentInterval.current = Math.min(currentInterval.current * 1.5, maxInterval)
      setRetryCount(c => c + 1)
    } finally {
      setLoading(false)
    }
  }, [fetcher, interval, maxInterval])

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

    // Let the first request finish before scheduling the next one. Starting a
    // second fixed timer here could overlap slow mobile-network requests and
    // apply stale responses out of order.
    tick()

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

// ─── Timer Warning Popup ─────────────────────────────────────────────────────
function TimerWarningPopup({ seconds, label, sublabel, theme = "red", onDone }: {
  seconds: number; label: string; sublabel?: string; theme?: "red" | "amber" | "teal"; onDone?: () => void
}) {
  const themes = {
    red:    { bg: "from-red-950/95 via-rose-950/90 to-red-950/80", border: "border-red-500/30", glow: "rgba(239,68,68,0.2)", iconBg: "from-red-500/30 to-rose-600/20", iconBorder: "border-red-400/30", iconColor: "text-red-300", iconGlow: "rgba(239,68,68,0.4)", text: "text-red-200", sub: "text-red-400/50", bar: "from-red-500 via-rose-500 to-red-400", barGlow: "rgba(239,68,68,0.6)" },
    amber:  { bg: "from-amber-950/95 via-orange-950/90 to-amber-950/80", border: "border-amber-500/30", glow: "rgba(251,191,36,0.2)", iconBg: "from-amber-500/30 to-orange-600/20", iconBorder: "border-amber-400/30", iconColor: "text-amber-300", iconGlow: "rgba(251,191,36,0.4)", text: "text-amber-200", sub: "text-amber-400/50", bar: "from-amber-500 via-orange-500 to-amber-400", barGlow: "rgba(251,191,36,0.6)" },
    teal:   { bg: "from-teal-950/95 via-cyan-950/90 to-teal-950/80", border: "border-teal-500/30", glow: "rgba(20,184,166,0.2)", iconBg: "from-teal-500/30 to-cyan-600/20", iconBorder: "border-teal-400/30", iconColor: "text-teal-300", iconGlow: "rgba(20,184,166,0.4)", text: "text-teal-200", sub: "text-teal-400/50", bar: "from-teal-500 via-cyan-500 to-teal-400", barGlow: "rgba(20,184,166,0.6)" },
  }
  const t = themes[theme]
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    const timer = setTimeout(() => onDoneRef.current?.(), 3000)
    return () => clearTimeout(timer)
  }, [])

  const dismiss = () => onDoneRef.current?.()

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[200] flex items-center justify-center px-6"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={dismiss}
    >
      <motion.div
        initial={{ scale: 0.7, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.8, y: 20, opacity: 0 }}
        transition={{ type: "spring", stiffness: 350, damping: 22 }}
        className={`relative overflow-hidden w-full max-w-xs rounded-3xl bg-gradient-to-br ${t.bg} border ${t.border} backdrop-blur-xl px-6 py-8 flex flex-col items-center text-center`}
        style={{ boxShadow: `0 0 40px ${t.glow}, inset 0 1px 0 rgba(255,255,255,0.06)` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Animated rings behind icon */}
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full border-2"
          style={{ borderColor: t.iconGlow.replace("0.4", "0.15") }}
          animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full border-2"
          style={{ borderColor: t.iconGlow.replace("0.4", "0.2") }}
          animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
        />

        {/* Icon */}
        <motion.div
          animate={{ scale: [1, 1.15, 1], rotate: [0, -8, 8, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className={`relative w-16 h-16 rounded-2xl bg-gradient-to-br ${t.iconBg} border ${t.iconBorder} flex items-center justify-center mb-4`}
          style={{ boxShadow: `0 0 24px ${t.iconGlow}` }}
        >
          <Timer size={28} className={t.iconColor} />
        </motion.div>

        {/* Big countdown number */}
        <motion.div
          initial={{ scale: 1.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 400, damping: 15 }}
          className={`text-5xl font-black font-mono tabular-nums ${t.text} mb-2`}
          style={{ textShadow: `0 0 30px ${t.glow}` }}
        >
          {seconds > 60 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : seconds}
        </motion.div>

        {/* Label */}
        <motion.p
          initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
          className={`text-sm font-bold ${t.text} tracking-wide`}
        >
          {label}
        </motion.p>
        {sublabel && (
          <motion.p
            initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.25 }}
            className={`text-[11px] mt-1.5 leading-relaxed ${t.sub}`}
          >
            {sublabel}
          </motion.p>
        )}

        {/* Auto-dismiss progress bar — single CSS animation, no state updates */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
          <div
            className={`h-full bg-gradient-to-r ${t.bar}`}
            style={{
              boxShadow: `0 0 8px ${t.barGlow}`,
              animation: "timerPopupBar 3s linear forwards",
            }}
          />
        </div>
      </motion.div>
    </motion.div>
  )
}

// Hook: manages timer warning popup state
function useTimerWarnings(timerActive: boolean, timeLeft: number, timerDuration: number, enabled = true, context?: { oneMinSublabel?: string }) {
  const [popup, setPopup] = useState<{ seconds: number; label: string; sublabel: string; theme: "red" | "amber" | "teal" } | null>(null)
  const firedRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    if (!timerActive || !enabled) return
    const totalMin = Math.floor(timerDuration / 60)

    if (timeLeft === 300 && totalMin > 5 && !firedRef.current.has(300)) {
      firedRef.current.add(300)
      vibrate(150); playTimerWarningSound()
      setPopup({ seconds: 300, label: "5 دقائق متبقية", sublabel: "استمتع بالجلسة — الوقت يمر بسرعة", theme: "teal" })
    }
    if (timeLeft === 60 && !firedRef.current.has(60)) {
      firedRef.current.add(60)
      vibrate([100, 50, 100]); playTimerWarningSound()
      setPopup({ seconds: 60, label: "دقيقة واحدة متبقية", sublabel: context?.oneMinSublabel ?? "ابدأ بتلخيص حديثك واستعد للنهاية", theme: "amber" })
    }
    if (timeLeft === 10 && !firedRef.current.has(10)) {
      firedRef.current.add(10)
      vibrate(200)
      setPopup({ seconds: 10, label: "10 ثوانٍ فقط!", sublabel: "الوقت ينتهي الآن", theme: "red" })
    }
    if (timeLeft === 0 && !firedRef.current.has(0)) {
      firedRef.current.add(0)
      vibrate([300, 100, 300]); playTimerUrgentSound()
    }
  }, [timeLeft, timerActive, timerDuration, enabled])

  // Reset fired set when timer resets
  useEffect(() => {
    if (!timerActive) firedRef.current.clear()
  }, [timerActive])

  return { popup, clearPopup: () => setPopup(null) }
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
    { key: "synergy", label: "الانسجام التفاعلي", value: breakdown.synergy || 0, max: 30, bar: "from-violet-500 to-purple-500" },
    { key: "vibe", label: "الطاقة والكيمياء", value: breakdown.vibe || 0, max: 25, bar: "from-purple-500 to-pink-500" },
    { key: "lifestyle", label: "نمط الحياة", value: breakdown.lifestyle || 0, max: 10, bar: "from-cyan-500 to-blue-500" },
    { key: "humorOpen", label: "الدعابة/الانفتاح", value: breakdown.humorOpen || 0, max: 15, bar: "from-amber-500 to-orange-500" },
    { key: "communication", label: "التواصل", value: breakdown.communication || 0, max: 3, bar: "from-indigo-500 to-sky-500" },
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
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      animate={pulse && !reduceMotion ? { scale: [1, 1.04, 1] } : {}}
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
  const reduceMotion = useReducedMotion()

  // Ranking demo — cycle the order so people SEE the drag-to-rank behaviour.
  const [rankOrder, setRankOrder] = useState([0, 1, 2, 3])
  const [faqOpen, setFaqOpen] = useState<number | null>(null)
  useEffect(() => {
    if (slide.key !== "ranking" || reduceMotion) return
    const orders = [[0,1,2,3],[1,0,2,3],[1,2,0,3],[2,1,0,3]]
    let i = 0
    const iv = setInterval(() => { i = (i + 1) % orders.length; setRankOrder(orders[i]) }, 1200)
    return () => clearInterval(iv)
  }, [slide.key, reduceMotion])

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
          <span className="inline-block bg-white/25 backdrop-blur-sm text-white text-xs font-black px-3 py-1 rounded-full tracking-widest">
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
                    <p className="text-gray-400 text-xs leading-snug">{r.d}</p>
                  </div>
                  <span className="text-gray-600 text-xs font-mono" aria-hidden="true">{i + 1}</span>
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
              <p className="text-gray-400 text-xs flex items-center justify-center gap-1"><MapPin size={12} /> رقم طاولتك يظهر هكذا</p>
              <div className="text-5xl font-black text-blue-300 leading-none">٧</div>
              <div className="flex flex-wrap gap-1.5 justify-center pt-1">
                {["سارة","خالد","نورة","ريان"].map((n, i) => (
                  <motion.span key={n} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 + i * 0.1 }}
                    className="bg-blue-900/40 text-blue-200 border border-blue-800/50 rounded-full px-2.5 py-0.5 text-xs">{n}</motion.span>
                ))}
              </div>
            </div>
            <DemoButton pulse className="w-full text-blue-200 bg-blue-900/40 border border-blue-700/40">
              <Target size={15} /> اختيار نشاط للمجموعة <ExternalLink size={13} />
            </DemoButton>
            <div className="flex items-start gap-2 bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5">
              <Shuffle size={15} className="text-cyan-400 shrink-0 mt-0.5" />
              <p className="text-gray-300 text-xs leading-relaxed">اختاروا معاً لعبة أو أسئلة نقاش تناسب المجموعة. وفي الجولة الثانية ستنتقل غالباً إلى <span className="text-cyan-300 font-bold">مجموعة جديدة</span>، وقد يتكرر شخص فقط عند الحاجة لتوازن التقسيم.</p>
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
                    <div className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-black shrink-0 ${rankBadge(rank)}`}>{rank + 1}</div>
                    <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${p.color} flex items-center justify-center text-white text-xs font-bold shrink-0`}>{p.init}</div>
                    <span className="text-gray-300 text-xs flex-1">شخص قابلته</span>
                    <GripVertical size={13} className="text-gray-600" />
                  </motion.div>
                )
              })}
            </div>
            {/* The crucial caveat */}
            <div className="rounded-xl border border-amber-700/40 bg-amber-950/30 px-3 py-2.5 space-y-1.5">
              <p className="text-amber-300 text-xs font-black flex items-center gap-1.5"><AlertTriangle size={13} /> مهم جداً — كيف تُحسم الجلسة</p>
              <p className="text-amber-100/80 text-xs leading-relaxed">
                الجلسة تحدث فقط عند <span className="text-amber-300 font-bold">التطابق المتبادل</span>. إذا رتّبت شخصاً أولاً لكنه لم يرتّبك عالياً، قد لا تجلس معه.
              </p>
              <p className="text-gray-300 text-xs leading-relaxed">
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
              <div><p className="text-white font-bold text-sm">جلسة اختيارك</p><p className="text-pink-200/80 text-xs">أفضل تطابق متبادل من ترتيبك</p></div>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.18 }}
              className="rounded-2xl border border-purple-700/40 bg-purple-950/30 p-3.5 flex items-center gap-3">
              <Brain size={22} className="text-purple-400 shrink-0" />
              <div><p className="text-white font-bold text-sm">جلسة التوافق الذكي</p><p className="text-purple-200/80 text-xs">النظام يرشّح لك بناءً على بياناتكما</p></div>
            </motion.div>
            {/* Demo: how you see the table + partner */}
            <div className="rounded-2xl border border-amber-700/40 bg-amber-950/25 p-3 text-center space-y-1">
              <p className="text-amber-300/80 text-xs">في كل جلسة سيظهر اسم شريكك ورقم طاولتك</p>
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
              <p className="text-gray-300 text-xs">مثال: كيف كانت المحادثة؟</p>
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
              <p className="text-emerald-100/80 text-xs leading-relaxed">إذا قال كلاكما <span className="text-emerald-300 font-bold">«نعم»</span> — تتبادلان معلومات التواصل في صفحة النتائج. لا أحد يعرف اختيارك إلا إذا وافق الطرف الآخر.</p>
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
              <p className="text-amber-300 text-xs font-black flex items-center gap-1.5"><Info size={13} /> تنويه مهم عن التوافق</p>
              <p className="text-amber-100/80 text-xs leading-relaxed">
                الكيمياء بين شخصين جزء كبير لا يمكن قياسه بالكامل. نحن <span className="text-amber-300 font-bold">لا نضمن التوافق</span> — لكننا نقلّل احتمال عدم التوافق بشكل كبير عبر التحليل.
              </p>
              <p className="text-gray-300 text-xs leading-relaxed">
                حتى لو لم تكن النتيجة مثالية، تبقى قد عشت تجربة اختيارك بنفسك — استمتع باللقاء والتجربة أكثر من الرقم.
              </p>
            </div>

            {/* FAQ */}
            <div className="space-y-2">
              <p className="text-violet-300 text-xs font-black flex items-center gap-1.5"><Lightbulb size={13} /> أهم الأسئلة</p>
              {[
                { q: "ماذا لو لم يعجبني أحد؟", a: "رتّب الجميع بأي ترتيب تريده — حتى لو لم يعجبك أحد، الترتيب إلزامي لإكمال المرحلة. النظام سيمنحك أفضل تطابق متاح." },
                { q: "هل ترتيبي ظاهر للآخرين؟", a: "لا أبداً — ترتيبك وتقييماتك سرّية تماماً. لا أحد يرى اختياراتك إلا إذا حدث تطابق متبادل بـ«نعم» للتواصل." },
                { q: "هل يمكنني تعديل ترتيبي بعد الإرسال؟", a: "لا، بمجرد الإرسال يُقفل الترتيب. خذ وقتك في التقييم قبل التأكيد." },
                { q: "ماذا لو احتجت مساعدة خلال الجلسة؟", a: "زر «المنظم» في أسفل الشاشة متاح دائماً — اضغطه لأي مساعدة أو طارئ." },
              ].map((item, i) => (
                <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                  <button onClick={() => setFaqOpen(faqOpen === i ? null : i)} aria-expanded={faqOpen === i} aria-controls={`tutorial-faq-${i}`}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-right focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400">
                    <span className="text-gray-200 text-xs font-semibold flex-1">{item.q}</span>
                    <motion.span animate={{ rotate: faqOpen === i ? 180 : 0 }} transition={{ duration: 0.2 }}
                      className="text-gray-500 shrink-0"><ChevronRight size={14} className="rotate-90" /></motion.span>
                  </button>
                  <AnimatePresence>
                    {faqOpen === i && (
                      <motion.div id={`tutorial-faq-${i}`} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }} className="overflow-hidden">
                        <p className="text-gray-300 text-xs leading-relaxed px-3 pb-2.5">{item.a}</p>
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
  const reduceMotion = useReducedMotion()

  const goNext = () => {
    if (step < WALK_SLIDES.length - 1) {
      setDir(1); setStep(s => s + 1)
    } else {
      onDone()
      if (!reduceMotion) fireConfetti({ particleCount: 90, spread: 75, origin: { y: 0.5 }, colors: ["#a855f7","#ec4899","#f43f5e","#fbbf24"] })
    }
  }
  const goPrev = () => { if (step > 0) { setDir(-1); setStep(s => s - 1) } }

  return (
    <MotionConfig reducedMotion="user">
    <div className="h-[100dvh] bg-gray-950 relative overflow-hidden flex flex-col" dir="rtl">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-20 w-[550px] h-[550px] bg-purple-600/20 rounded-full blur-[120px]" />
        <div className="absolute -bottom-32 -left-20 w-[500px] h-[500px] bg-pink-600/15 rounded-full blur-[100px]" />
        <motion.div
          className="absolute top-1/3 left-1/2 w-[420px] h-[420px] rounded-full blur-[110px] -translate-x-1/2 -translate-y-1/2"
          animate={reduceMotion ? undefined : { backgroundColor: ["rgba(139,92,246,0.07)","rgba(236,72,153,0.07)","rgba(59,130,246,0.05)","rgba(139,92,246,0.07)"] }}
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
                  animate={reduceMotion ? { opacity: 0.2 } : { scale: [1, 1.18], opacity: [0.5, 0] }}
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
                <span className="text-xs font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent tracking-[0.14em] uppercase">
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
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-2xl py-3.5 font-black text-base shadow-2xl shadow-purple-600/30 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
              >
                كيف تسير الفعالية؟ ←
              </motion.button>
              <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={onDone}
                className="group w-full rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3.5 text-right text-gray-200 shadow-lg shadow-black/10 backdrop-blur-sm transition-all duration-200 hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                <span className="flex items-center justify-between gap-3" dir="rtl">
                  <span className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/15 text-violet-300 transition-colors group-hover:bg-violet-500/25 group-hover:text-violet-200">
                      <KeyRound size={17} strokeWidth={2.25} />
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm font-bold">جاهز؟ ادخل الفعالية</span>
                      <span className="text-xs text-gray-400 group-hover:text-violet-200/70">قرأت الشرح؟ تقدر تبدأ الآن</span>
                    </span>
                  </span>
                  <ArrowLeft size={18} className="text-gray-500 transition-all group-hover:-translate-x-0.5 group-hover:text-violet-300" />
                </span>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  const storedToken = localStorage.getItem("blindmatch_result_token")
                  if (storedToken) {
                    window.location.href = `/results?token=${storedToken}`
                  } else {
                    window.location.href = "/results"
                  }
                }}
                className="group mx-auto flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold text-gray-500 transition-all hover:bg-emerald-400/[0.08] hover:text-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
              >
                <Trophy size={14} className="text-emerald-500/70 transition-colors group-hover:text-emerald-300" />
                <span>عرض صفحة النتائج</span>
                <ArrowLeft size={13} className="opacity-0 transition-all group-hover:-translate-x-0.5 group-hover:opacity-100" />
              </motion.button>
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
              <button onClick={() => setPhase("splash")} aria-label="الرجوع إلى شاشة الترحيب" className="flex items-center gap-1 text-gray-400 text-sm hover:text-white transition-colors rounded-lg px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400">
                <ChevronRight size={15} className="rotate-180" /> رجوع
              </button>
              <span className="text-xs font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent tracking-wide flex items-center gap-1"><Sparkles size={12} /> قواعد الجلسة</span>
            </div>

            {/* Rules list */}
            <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-2.5">
              {[
                { icon: <EyeOff size={20} className="text-purple-400" />, title: "حافظ على السرية", desc: "لا تكشف ترتيبك أو تقييماتك أو اختيارك — النتيجة تُكشف للجميع في النهاية" },
                { icon: <Drama size={20} className="text-purple-400" />, title: "كن نفسك", desc: "الخوارزمية تعمل بناءً على شخصيتك الحقيقية — التمثيل يضر نتيجتك" },
                { icon: <Smartphone size={20} className="text-purple-400" />, title: "التطبيق أداتك", desc: "استخدم التطبيق للتقييم والترتيب، لكن لا تُظهِر شاشتك للآخرين" },
                { icon: <Handshake size={20} className="text-purple-400" />, title: "احترم الجلسة", desc: "تعامل بلطف، وتجنب الأسئلة الشخصية المحرجة أو أي تعليق يسبب إحراجاً" },
                { icon: <Timer size={20} className="text-purple-400" />, title: "احترم الوقت", desc: "كل جلسة لها مؤقت — أنهِ المحادثة باحترام حين ينتهي الوقت" },
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
                    <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">{rule.desc}</p>
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
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-2xl py-3.5 font-black text-base shadow-2xl shadow-purple-600/30 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
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
            <div className="w-full h-1 bg-gray-800/50" role="progressbar" aria-label="تقدم شرح الفعالية" aria-valuemin={1} aria-valuemax={WALK_SLIDES.length} aria-valuenow={step + 1}>
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
                aria-label={step === 0 ? "الرجوع إلى قواعد الجلسة" : `الرجوع إلى الخطوة ${step}`}
                className="flex items-center gap-1 text-gray-400 text-sm hover:text-white transition-colors rounded-lg px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
              >
                <ChevronRight size={15} className="rotate-180" />
                {step === 0 ? "القواعد" : "السابق"}
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
                    aria-label={`الانتقال إلى خطوة ${i + 1}: ${WALK_SLIDES[i].label}`}
                    aria-current={i === step ? "step" : undefined}
                    className="w-8 h-8 -mx-1 flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                  >
                    <span aria-hidden="true" className={`block rounded-full transition-all duration-300 ${
                      i === step ? "w-6 h-2 bg-white" : "w-2 h-2 bg-gray-700 hover:bg-gray-500"
                    }`} />
                  </button>
                ))}
              </div>
              {/* Next + skip buttons */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={goNext}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-2xl py-3.5 font-black text-base shadow-xl shadow-purple-600/25 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
              >
                {step === WALK_SLIDES.length - 1 ? <span className="flex items-center justify-center gap-2">أبدأ رحلتي <Sparkles size={16} /></span> : "التالي ←"}
              </motion.button>
              {step < WALK_SLIDES.length - 1 && (
                <button
                  onClick={onDone}
                  className="w-full flex items-center justify-center gap-1.5 text-gray-400 hover:text-white text-xs font-medium transition-colors py-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
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
    </MotionConfig>
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
  const reduceMotion = useReducedMotion()
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const grad = accent === "pink" ? "from-pink-600 to-rose-600" : accent === "amber" ? "from-amber-500 to-orange-500" : "from-purple-600 to-pink-600"
  const ring = accent === "pink" ? "ring-pink-500/30" : accent === "amber" ? "ring-amber-500/30" : "ring-purple-500/30"
  const chipBg = accent === "pink" ? "bg-pink-600/25 border-pink-500/50 text-pink-200" : accent === "amber" ? "bg-amber-600/25 border-amber-500/50 text-amber-200" : "bg-purple-600/25 border-purple-500/50 text-purple-200"
  const ctaText = accent === "amber" ? "text-black" : "text-white"

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    focusable()[0]?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onClose(); return }
      if (event.key !== "Tab") return
      const items = focusable()
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[500] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
      dir="rtl"
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        className={`relative bg-gray-900/95 border border-gray-700/50 rounded-3xl p-4 sm:p-6 max-w-xs w-full max-h-[calc(100dvh-1.5rem)] text-center overflow-hidden ring-1 ${ring} flex flex-col`}
      >
        {/* Close */}
        <button onClick={onClose} aria-label="إغلاق التذكير" className="absolute top-3 left-3 w-9 h-9 rounded-full bg-gray-800/80 flex items-center justify-center text-gray-400 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400">
          <X size={13} />
        </button>

        {/* Label chip */}
        <span className={`inline-flex self-center shrink-0 items-center gap-1.5 ${chipBg} border rounded-full px-3 py-1 text-xs font-black tracking-wide mb-2 sm:mb-3`}>
          <Lightbulb size={12} /> {label}
        </span>

        {/* Icon */}
        <div className="relative mx-auto w-fit mb-2 sm:mb-3 shrink-0">
          <motion.div className="absolute inset-0 rounded-2xl border-2 border-current opacity-20"
            animate={reduceMotion ? { opacity: 0.2 } : { scale: [1, 1.3, 1], opacity: [0.3, 0, 0.3] }} transition={{ duration: 2.5, repeat: Infinity }} style={{ color: "currentColor" }} />
          <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl bg-gray-800/80 border border-gray-700/50 flex items-center justify-center">{icon}</div>
        </div>

        <h2 id={titleId} className="text-white font-black text-lg mb-2 sm:mb-3 shrink-0">{title}</h2>

        {/* Points */}
        <div className="space-y-1.5 sm:space-y-2 text-right mb-3 sm:mb-5 min-h-0 overflow-y-auto overscroll-contain pr-0.5">
          {points.map((p, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.08 }}
              className="flex items-start gap-2 bg-white/[0.03] border border-white/[0.06] rounded-xl px-2.5 sm:px-3 py-1.5 sm:py-2">
              <span className="shrink-0 mt-0.5">{p.icon}</span>
              <p className="text-gray-300 text-[12px] leading-relaxed flex-1">{p.text}</p>
            </motion.div>
          ))}
        </div>

        <motion.button whileTap={{ scale: 0.96 }} onClick={onClose}
          className={`w-full shrink-0 bg-gradient-to-r ${grad} ${ctaText} rounded-xl py-3 font-black text-sm shadow-lg shadow-black/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300`}>
          {cta}
        </motion.button>
        <p className="text-gray-500 text-[10px] sm:text-xs mt-1.5 shrink-0">شاهدت الشرح الكامل في البداية — هذا تذكير سريع فقط</p>
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
        { icon: <Target size={15} className="text-indigo-400" />, text: <>اضغط <span className="text-white font-bold">«اختيار نشاط للمجموعة»</span> واختاروا لعبة أو أسئلة نقاش تناسبكم</> },
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
    ? { text: "text-pink-300", bg: "bg-pink-500/15", border: "border-pink-500/30", dot: "bg-pink-400", grad: "from-pink-600/20 to-rose-600/10" }
    : { text: "text-purple-300", bg: "bg-purple-500/15", border: "border-purple-500/30", dot: "bg-purple-400", grad: "from-purple-600/20 to-violet-600/10" }

  const tips = [
    { icon: <Layers size={14} />, title: "مجموعات الأسئلة", desc: "بدّل بين المجموعات للوصول إلى أسئلة متنوعة تناسب نقاشكما" },
    { icon: <Zap size={14} />, title: "مستويات الأسئلة", desc: "الأسئلة مرتبة من خفيفة إلى عميقة — ابدأ بالأسهل وتدرّج" },
    { icon: <MessageSquare size={14} />, title: "أسئلة للنقاش", desc: "زر إضافي لمواضيع نقاش مفتوحة إذا احتجتم أفكاراً أخرى" },
    { icon: <CheckCircle size={14} />, title: "الانتهاء والتقييم", desc: "إذا أنهيتما مبكراً، اضغط الزر بالأسفل للانتقال إلى التقييم" },
  ]

  const goNext = () => { if (tip < tips.length - 1) setTip(t => t + 1); else onClose() }
  const t = tips[tip]

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={tip}
        initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 350, damping: 28 }}
        className={`relative overflow-hidden bg-gradient-to-br ${ac.grad} ${ac.border} border rounded-2xl px-4 py-3.5 space-y-3`}
        dir="rtl"
      >
        {/* Animated shimmer line */}
        <motion.div className={`absolute top-0 left-0 right-0 h-px ${ac.bg}`}
          animate={{ opacity: [0, 1, 0] }} transition={{ duration: 2, repeat: Infinity }} />
        <div className="flex items-start gap-2.5">
          <motion.div className={`w-8 h-8 rounded-xl ${ac.bg} ${ac.border} border flex items-center justify-center shrink-0 ${ac.text}`}
            animate={{ rotate: [0, -5, 5, 0] }} transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}>
            {t.icon}
          </motion.div>
          <div className="flex-1 space-y-0.5">
            <p className={`text-xs font-bold ${ac.text}`}>{t.title}</p>
            <p className="text-gray-400 text-[11px] leading-relaxed">{t.desc}</p>
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-400 transition-colors shrink-0">
            <X size={14} />
          </button>
        </div>
        {/* Footer: animated dots + next */}
        <div className="flex items-center justify-between pt-0.5">
          <div className="flex items-center gap-1">
            {tips.map((_, i) => (
              <motion.span key={i} className={`h-1 rounded-full transition-all ${i === tip ? `${ac.dot} w-4` : 'bg-gray-700 w-1'}`}
                animate={i === tip ? { opacity: [1, 0.6, 1] } : {}} transition={{ duration: 1.5, repeat: Infinity }} />
            ))}
          </div>
          <motion.button onClick={goNext} whileTap={{ scale: 0.95 }} className={`text-[11px] font-medium ${ac.text} hover:opacity-80 transition-opacity`}>
            {tip < tips.length - 1 ? "التالي ←" : "تم"}
          </motion.button>
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

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const s = [...arr]
  let state = seed
  const rand = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296 }
  for (let i = s.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[s[i], s[j]] = [s[j], s[i]]
  }
  return s
}

function IceBreaker({ round, tableNumber = 0, myInfo, tablemates }: {
  round: number; tableNumber?: number; myInfo: { number: number; name: string; gender: string | null } | null; tablemates: { number: number; first_name: string; gender: string | null }[]
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
    // Deterministic seed from table number + round — same order on every device at the table
    const seed = (tableNumber * 1000 + round) >>> 0
    setOrder(seededShuffle(all, seed))
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
              {p.name}{p.isMe ? " (أنت)" : ""}
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
function RockPaperScissors({ accent = "pink", autoDone = false, onDone }: { accent?: "pink" | "purple"; autoDone?: boolean; onDone?: () => void }) {
  const [done, setDone] = useState(autoDone)

  useEffect(() => {
    if (done && onDone) onDone()
  }, [done, onDone])

  if (done) return null

  const ac = accent === "pink"
    ? { border: "border-pink-800/40", bg: "from-pink-950/30 to-rose-950/20", text: "text-pink-300", btn: "from-pink-600 to-rose-600", glow: "shadow-pink-600/30" }
    : { border: "border-purple-800/40", bg: "from-purple-950/30 to-violet-950/20", text: "text-purple-300", btn: "from-purple-600 to-violet-600", glow: "shadow-purple-600/30" }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, type: "spring", stiffness: 260, damping: 24 }}>
      <GlassCard className={`relative overflow-hidden p-6 space-y-5 border ${ac.border} shadow-xl ${ac.glow}/20`}>
        {/* Animated top shimmer */}
        <motion.div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${accent === "pink" ? "via-pink-400/60" : "via-purple-400/60"} to-transparent`}
          animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 2.5, repeat: Infinity }} />

        {/* Title with animated icon */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
          className="flex flex-col items-center gap-2">
          <motion.div className={`w-12 h-12 rounded-2xl ${accent === "pink" ? "bg-pink-500/20 border-pink-500/30" : "bg-purple-500/20 border-purple-500/30"} border flex items-center justify-center`}
            animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.08, 1] }} transition={{ duration: 2, repeat: Infinity }}>
            <Zap size={22} className={ac.text} />
          </motion.div>
          <h4 className="text-white font-bold text-base">تحدي حجر، ورقة، مقص</h4>
        </motion.div>

        {/* Description */}
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}
          className="text-gray-400 text-xs text-center leading-relaxed">
          قبل ما تبدأ الجولة، العبوا حجر، ورقة، مقص — أفضل من ٣ جولات.
        </motion.p>

        {/* Winner rules card */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
          className={`relative overflow-hidden rounded-xl p-4 border ${ac.border} bg-gradient-to-br ${ac.bg} space-y-2.5`}>
          <motion.div className={`absolute top-0 left-0 right-0 h-px ${accent === "pink" ? "bg-pink-400/30" : "bg-purple-400/30"}`}
            animate={{ opacity: [0, 1, 0] }} transition={{ duration: 2, repeat: Infinity }} />
          <p className={`text-xs font-bold ${ac.text} flex items-center gap-1.5 justify-center`}>
            <motion.span animate={{ y: [0, -3, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
              <Trophy size={13} />
            </motion.span>
            الفائز
          </p>
          <ul className="text-gray-300 text-xs leading-relaxed space-y-1.5 text-center">
            <li>يقود الجلسة ويبدأ بطرح أول سؤال من أسئلة الجولة بالأسفل</li>
            <li>يملك تخطيًا واحدًا — يمكنه تخطي أي سؤال من الأسفل والانتقال لآخر</li>
            <li>كلاكما يجب أن يجيب على كل سؤال يُطرح</li>
          </ul>
        </motion.div>

        {/* Hint */}
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }}
          className="text-gray-500 text-[11px] leading-relaxed text-center">
          أسئلة هذه الجولة معروضة بالأسفل — يمكنكم البدء بعد انتهاء تحدي كسر الجليد
        </motion.p>

        {/* Done button */}
        <motion.button
          onClick={() => setDone(true)}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75 }}
          whileTap={{ scale: 0.97 }}
          className={`w-full py-3.5 rounded-xl bg-gradient-to-r ${ac.btn} text-white font-bold text-sm shadow-lg ${ac.glow} hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2`}
        >
          <CheckCircle size={16} /> خلّصنا التحدي — ابدأوا الجلسة
        </motion.button>
      </GlassCard>
    </motion.div>
  )
}

// ─── Round Screen ─────────────────────────────────────────────────────────────
function RoundScreen({ token, phase, timerActive, timerStart, timerDuration, correctedNow, myInfo, onGroupsOpenChange }: {
  token: string; phase: string; timerActive: boolean; timerStart: string | null; timerDuration: number; correctedNow?: () => number; myInfo: { number: number; name: string; gender: string | null } | null; onGroupsOpenChange?: (open: boolean) => void
}) {
  const round = parseInt(phase.replace("round", "")) || 1
  const [assignment, setAssignment] = useState<any>(null)
  const [assignmentError, setAssignmentError] = useState("")
  const [timeLeft, setTimeLeft] = useState(0)
  const [showGroups, setShowGroups] = useState(false)
  const [groupsHaveOpened, setGroupsHaveOpened] = useState(false)
  const [showGroupParticipationNudge, setShowGroupParticipationNudge] = useState(false)
  const participationNudgeTimerRef = useRef<string | null>(null)
  useEffect(() => { onGroupsOpenChange?.(showGroups) }, [showGroups, onGroupsOpenChange])
  const openGroups = useCallback(() => {
    setGroupsHaveOpened(true)
    setShowGroups(true)
  }, [])
  const closeGroups = useCallback(() => setShowGroups(false), [])

  // Treat the activities panel like a native sheet: Escape closes it and the
  // page behind it does not continue scrolling. Keeping it mounted after the
  // first open also preserves the selected activity and its progress.
  useEffect(() => {
    if (!showGroups) return
    const previousOverflow = document.body.style.overflow
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeGroups()
    }
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [showGroups, closeGroups])
  const [showTutorial, setShowTutorial] = useState(round === 1 && (typeof window === "undefined" || sessionStorage.getItem(`e3_tut_round_${round}`) !== "1"))
  const wakeLockRef = useRef<any>(null)
  const { popup, clearPopup } = useTimerWarnings(timerActive, timeLeft, timerDuration, true, {
    oneMinSublabel: "خلصوا النشاط وتأكدوا من أسماء الجميع — الترتيب يبدأ بعد دقيقة ومحدد بوقت"
  })

  const loadAssignment = useCallback(async () => {
    setAssignmentError("")
    const data = await call("e3-get-assignment", token, { round })
    if (data.error) { setAssignmentError(data.error); return }
    setAssignment(data)
  }, [token, round])

  useEffect(() => { loadAssignment() }, [loadAssignment])

  useEffect(() => {
    if (!timerActive || !timerStart) { setTimeLeft(0); return }
    const update = () => {
      const now = correctedNow ? correctedNow() : Date.now()
      const elapsed = Math.floor((now - new Date(timerStart).getTime()) / 1000)
      setTimeLeft(Math.max(0, timerDuration - elapsed))
    }
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [timerActive, timerStart, timerDuration, correctedNow])

  // This is intentionally tied to the round timer, not an individual activity:
  // every table gets one gentle inclusion reminder after ten minutes together.
  useEffect(() => {
    if (!timerActive || !timerStart) {
      participationNudgeTimerRef.current = null
      setShowGroupParticipationNudge(false)
      return
    }
    const timerKey = `${round}:${timerStart}`
    const now = correctedNow ? correctedNow() : Date.now()
    const elapsed = Math.floor((now - new Date(timerStart).getTime()) / 1000)
    if (elapsed >= 10 * 60 && participationNudgeTimerRef.current !== timerKey) {
      participationNudgeTimerRef.current = timerKey
      setShowGroupParticipationNudge(true)
    }
  }, [timerActive, timerStart, timeLeft, round, correctedNow])

  // Wake lock: prevent screen sleep during active round
  const wakeLockActive = timerActive && timeLeft > 0
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await (navigator as any).wakeLock.request("screen")
        }
      } catch {}
    }
    if (wakeLockActive) requestWakeLock()
    return () => {
      if (wakeLockRef.current) { try { wakeLockRef.current.release() } catch {} wakeLockRef.current = null }
    }
  }, [wakeLockActive])

  // Vibrate when timer starts or when 10 seconds remain
  // (sound/vibration handled by useTimerWarnings hook above)

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
              <div className="flex items-center gap-2 min-w-0">
                <Clock size={13} className="text-purple-400 flex-shrink-0" />
                <span className="text-gray-500 text-xs hidden sm:inline">الوقت المتبقي</span>
              </div>
              {myInfo && (
                <div className="absolute left-1/2 -translate-x-1/2 flex items-baseline gap-1 max-w-[120px] overflow-hidden">
                  <span className="text-gray-400/70 text-[12px] font-medium leading-none truncate">{myInfo.name}</span>
                  <span className={`text-[12px] font-mono font-bold leading-none flex-shrink-0 ${myInfo.gender === "female" ? "text-pink-400/60" : myInfo.gender === "male" ? "text-blue-400/60" : "text-purple-400/60"}`}>#{myInfo.number}</span>
                </div>
              )}
              <div className={`text-xl sm:text-2xl font-mono font-black tabular-nums flex-shrink-0 ${timeLeft < 60 ? "text-red-400" : "text-white"}`}>
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
              <GlassCard className={`p-0 overflow-hidden border ${RC.card} shadow-2xl shadow-black/30`}>
                <div className="relative px-5 pt-5 pb-4 text-center">
                  <div className="absolute inset-0 bg-gradient-to-br from-gray-900/60 via-gray-950/60 to-black/40" />
                  <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
                  <div className="absolute -top-20 -right-16 w-48 h-48 rounded-full bg-purple-600/15 blur-3xl pointer-events-none" />
                  <div className="absolute -bottom-24 -left-16 w-44 h-44 rounded-full bg-pink-600/10 blur-3xl pointer-events-none" />
                  <div className="relative z-10 space-y-2.5">
                    <div className={`inline-flex items-center justify-center gap-2 ${RC.badge} border rounded-full px-4 py-1.5 text-[11px] font-bold`}>
                      <MapPin size={12} /> مكانك هذه الجولة
                    </div>
                    <div className={`text-7xl font-black leading-none text-transparent bg-clip-text bg-gradient-to-br ${RC.bar}`}
                      style={{ textShadow: "0 0 28px rgba(255,255,255,0.10)" }}>
                      {assignment.table}
                    </div>
                    <p className="text-gray-500 text-sm font-medium">طاولة رقم</p>

                    {/* Tablemate count */}
                    {assignment.tablemates?.length > 0 && (
                      <div className="inline-flex items-center justify-center gap-2 bg-white/[0.04] border border-white/[0.06] rounded-full px-3 py-1.5 text-gray-400 text-xs">
                        <Users size={11} />
                        <span>{assignment.tablemates.length} أشخاص معك في الطاولة</span>
                      </div>
                    )}
                  </div>
                </div>

                {(myInfo || assignment.tablemates?.length > 0) && (
                  <div className="px-5 pb-5 pt-4 border-t border-white/[0.06] bg-black/10">
                    <p className="text-gray-500 text-xs mb-3">أعضاء طاولتك</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {myInfo && (
                        <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-sm font-black text-amber-200 ring-1 ring-amber-400/10">
                          <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.65)]" />
                          {myInfo.name} <span className="text-[11px] text-amber-400">(أنت)</span>
                        </span>
                      )}
                      {(assignment.tablemates || []).map((m: any) => (
                        <span
                          key={m.number}
                          className={`inline-flex items-center gap-2 border rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                            m.gender === 'female'
                              ? 'bg-pink-950/30 text-pink-200 border-pink-500/25'
                              : m.gender === 'male'
                                ? 'bg-blue-950/30 text-blue-200 border-blue-500/25'
                                : 'bg-white/[0.03] text-gray-200 border-white/[0.08]'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            m.gender === 'female'
                              ? 'bg-pink-400'
                              : m.gender === 'male'
                                ? 'bg-blue-400'
                                : 'bg-purple-400/70'
                          }`} />
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
                  className="px-5 pb-5 pt-4 border-t border-white/[0.06] text-center space-y-1"
                >
                  <Clock size={24} className="text-amber-400 mx-auto" />
                  <p className="text-white font-semibold text-sm">انتهت الجلسة</p>
                  <p className="text-gray-500 text-xs">انتظر توجيهات المنظم للمرحلة التالية</p>
                </motion.div>
              )}
              </GlassCard>
            </motion.div>
          ) : assignmentError ? (
            <GlassCard className="p-8 flex flex-col items-center gap-3 border border-red-500/20">
              <MapPin size={26} className="text-red-300" />
              <p className="text-white text-sm font-bold">لم نجد طاولتك لهذه الجولة</p>
              <p className="text-gray-500 text-xs leading-5">أخبر المنظم برقمك، ثم اضغط إعادة المحاولة.</p>
              <button onClick={loadAssignment} className="mt-1 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white/[0.06] px-5 text-xs font-bold text-white">
                <RefreshCw size={13} /> إعادة المحاولة
              </button>
            </GlassCard>
          ) : (
            <GlassCard className="p-10 flex flex-col items-center gap-3">
              <Spinner size={22} />
              <p className="text-gray-500 text-sm">جاري تحميل مكانك...</p>
            </GlassCard>
          )}

          {/* Ice Breaker — appears before group activities */}
          {assignment?.tablemates && (
            <IceBreaker round={round} tableNumber={assignment.table} myInfo={myInfo} tablemates={assignment.tablemates} />
          )}

          {/* Groups button */}
          <motion.button
            onClick={openGroups}
            disabled={!assignment}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
            className={`group flex items-center gap-3 w-full p-4 rounded-2xl text-right transition-all text-white bg-gradient-to-r ${RC.bar} shadow-lg shadow-black/25 border border-white/[0.08] hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
              <Target size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-black">{groupsHaveOpened ? "العودة إلى النشاط" : "اختيار نشاط للمجموعة"}</span>
              <span className="mt-0.5 block text-[11px] font-medium text-white/70">ألعاب وأسئلة قصيرة يشارك فيها كل من على الطاولة</span>
            </span>
            <ArrowLeft size={18} className="shrink-0 text-white/70 transition-transform group-hover:-translate-x-0.5" />
          </motion.button>

          <p className="text-gray-600 text-xs">
            {round === 1 && "تعارف جماعي على طاولتك — ستختار بعدها من تريد جلسة فردية معه"}
            {round === 2 && "آخر جولة جماعية — بعدها ستُرتّب الأولويات لتحديد جلستك الفردية"}
          </p>

          {typeof window !== "undefined" && new URLSearchParams(window.location.search).has("discussionPreview") && (
            <button onClick={() => setShowGroupParticipationNudge(true)} className="text-amber-300/80 hover:text-amber-200 text-[11px] font-medium transition-colors mx-auto">
              اختبار تنبيه المشاركة (10 دقائق)
            </button>
          )}

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
        {showTutorial && <RoundTutorial onClose={() => { setShowTutorial(false); try { sessionStorage.setItem(`e3_tut_round_${round}`, "1") } catch {} }} />}
      </AnimatePresence>

      {/* ── Groups Overlay Modal ────────────────────────────────────── */}
      <AnimatePresence>
        {groupsHaveOpened && (
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: showGroups ? 1 : 0, y: showGroups ? 0 : "100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 32 }}
            aria-hidden={!showGroups}
            className={`fixed inset-x-0 bottom-0 z-40 bg-gray-950 flex flex-col ${showGroups ? "pointer-events-auto" : "pointer-events-none"}`}
            style={{ top: timerActive && timeLeft > 0 ? "58px" : "0px" }}
          >
            {/* Groups content rendered inline */}
            <div className="flex-1 overflow-y-auto overscroll-contain relative z-10" tabIndex={-1}>
              <GroupsPage disableOnboarding onClose={closeGroups} round={round} tableNumber={assignment?.table} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGroupParticipationNudge && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] flex items-end bg-black/55 p-5 sm:items-center sm:justify-center" role="dialog" aria-modal="true">
            <motion.div initial={{ y: 20, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.98 }} className="w-full max-w-md rounded-3xl border border-amber-400/25 bg-gray-900 p-6 text-center shadow-2xl" dir="rtl">
              <Users className="mx-auto mb-3 h-8 w-8 text-amber-300" />
              <h2 className="text-lg font-black text-white">خلّوا الجميع يأخذ فرصته</h2>
              <p className="mt-2 text-sm leading-7 text-gray-300">إذا فيه شخص ما أخذ فرصته بالكلام، نحب نسمع منه — والمشاركة دائمًا اختيارية.</p>
              <button onClick={() => setShowGroupParticipationNudge(false)} className="mt-5 min-h-12 w-full rounded-2xl bg-amber-500 font-bold text-gray-950">نكمل</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Timer Warning Popup ─────────────────────────────────────── */}
      <AnimatePresence>
        {popup && <TimerWarningPopup {...popup} onDone={clearPopup} />}
      </AnimatePresence>
    </div>
  )
}

// ─── Ranking Tutorial Overlay ────────────────────────────────────────────────
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
        { icon: <Trophy size={14} className="text-amber-400" />, text: <>اسحب البطاقات لترتيب من <span className="text-white font-bold">الأعلى اهتماماً</span> للأقل — الأول هو أولويتك القصوى</> },
        { icon: <Heart size={14} className="text-emerald-400" />, text: <>إذا رتّبت شخصًا <span className="text-white font-bold">#1</span> ورتّبك هو أيضًا <span className="text-white font-bold">#1</span> ← تطابق مثالي وجلسة فردية!</> },
        { icon: <Sparkles size={14} className="text-cyan-400" />, text: <>مو لازم تكونوا بنفس المركز: ممكن ترتبه أول وهو يرتبك ثالث، ويختار النظام أعلى تطابق متاح للطرفين</> },
        { icon: <Handshake size={14} className="text-purple-400" />, text: <>التطابق يجب أن يكون <span className="text-white font-bold">متبادلاً</span> — ترتيبك وحده لا يكفي، الطرفان يجب أن يتقاربا</> },
        { icon: <Users size={14} className="text-pink-400" />, text: <>نتيجتك: <span className="text-white font-bold">جلستان فرديتان</span> — واحدة من اختيارك وواحدة يختارها النظام بناءً على التوافق</> },
      ]}
    />
  )
}

function RankingReorderCard({
  value,
  disabled,
  className,
  whileDrag,
  children,
}: {
  value: number
  disabled: boolean
  className: string
  whileDrag?: Record<string, string | number>
  children: (startDrag: (event: React.PointerEvent<HTMLElement>) => void) => React.ReactNode
}) {
  const dragControls = useDragControls()
  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!disabled) dragControls.start(event)
  }

  return (
    <Reorder.Item
      value={value}
      as="div"
      className={className}
      drag={disabled ? false : true}
      dragListener={false}
      dragControls={dragControls}
      whileDrag={disabled ? undefined : whileDrag}
    >
      {children(startDrag)}
    </Reorder.Item>
  )
}

// ─── Ranking Screen ───────────────────────────────────────────────────────────
function RankingScreen({ token, completedRounds, currentPhase, timerActive, timerStart, timerDuration, correctedNow, myInfo }: { token: string, completedRounds: number, currentPhase: string, timerActive: boolean, timerStart: string | null, timerDuration: number, correctedNow?: () => number, myInfo: { number: number; name: string; gender: string | null } | null }) {
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
  const [showRankTutorial, setShowRankTutorial] = useState(typeof window === "undefined" || sessionStorage.getItem('e3_tut_ranking') !== "1")
  const [timeLeft, setTimeLeft] = useState(300) // fallback, overwritten by server timer
  const [autoSaving, setAutoSaving] = useState(false)
  const [isShuffling, setIsShuffling] = useState(false)
  const [showTimeWarning, setShowTimeWarning] = useState(false)
  const initialPhaseRef = useRef(currentPhase)
  const submittedRef = useRef(false)
  const orderRef = useRef<number[]>([])
  const autoSavedRef = useRef(false)

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
      const now = correctedNow ? correctedNow() : Date.now()
      const elapsed = Math.floor((now - new Date(timerStart).getTime()) / 1000)
      const remaining = Math.max(0, timerDuration - elapsed)
      setTimeLeft(remaining)
      if (remaining === 90 && !submittedRef.current) {
        vibrate([100, 50, 100])
        playTimerWarningSound()
        setShowTimeWarning(true)
      }
      if (remaining === 31) {
        toast('باقي 30 ثانية — احفظ تصنيفك الآن!', { duration: 5000, icon: '⏰' })
      }
    }
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [timerActive, timerStart, timerDuration, correctedNow])

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

  const handleRandomize = () => {
    if (submitted || isShuffling || order.length < 2) return
    setIsShuffling(true)
    let count = 0
    const max = 9
    const iv = setInterval(() => {
      setOrder(prev => {
        const shuffled = [...prev]
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
        }
        return shuffled
      })
      count++
      if (count >= max) {
        clearInterval(iv)
        setIsShuffling(false)
      }
    }, 130)
  }

  const personMap = Object.fromEntries(people.map(p => [p.number, p]))

  const avatarColors = [
    "from-amber-500 to-orange-600",
    "from-slate-400 to-slate-500",
    "from-amber-700 to-orange-800",
    "from-purple-500 to-indigo-600",
    "from-cyan-500 to-blue-600",
    "from-pink-500 to-rose-600",
    "from-emerald-500 to-teal-600",
    "from-violet-500 to-purple-600",
  ]

  const getInitials = (name: string) => {
    if (!name) return "?"
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }

  const rankBadge = (idx: number) => {
    if (idx === 0) return { bg: "from-amber-400 to-yellow-500", text: "text-black", ring: "ring-amber-400/30", glow: "shadow-amber-500/20" }
    if (idx === 1) return { bg: "from-slate-300 to-slate-400", text: "text-black", ring: "ring-slate-300/20", glow: "shadow-slate-400/15" }
    if (idx === 2) return { bg: "from-amber-600 to-orange-700", text: "text-white", ring: "ring-amber-600/25", glow: "shadow-orange-600/20" }
    return { bg: "from-white/[0.06] to-white/[0.03]", text: "text-gray-400", ring: "ring-white/[0.04]", glow: "" }
  }

  const cardAccent = (idx: number) => {
    if (idx === 0) return "border-amber-500/20 bg-gradient-to-r from-amber-950/20 to-transparent"
    if (idx === 1) return "border-slate-400/15 bg-gradient-to-r from-slate-800/15 to-transparent"
    if (idx === 2) return "border-orange-700/15 bg-gradient-to-r from-orange-950/15 to-transparent"
    return "border-white/[0.05] bg-white/[0.02]"
  }

  if (loading) return (
    <PageWrapper className="flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Spinner size={28} />
        <p className="text-gray-500 text-xs">جاري تحميل الأشخاص...</p>
      </div>
    </PageWrapper>
  )

  const timerPct = timerDuration > 0 ? Math.min(100, (timeLeft / timerDuration) * 100) : 0
  const timerColor = timeLeft <= 30 ? "bg-red-500" : timeLeft <= 60 ? "bg-amber-500" : "bg-emerald-500"
  const timerText = timeLeft <= 30 ? "text-red-400" : timeLeft <= 60 ? "text-amber-400" : "text-gray-300"

  return (
    <PageWrapper className="overflow-y-auto bg-gray-950">
      {/* ── Sticky header with integrated timer ── */}
      <div className="sticky top-0 z-20 bg-gray-950/95 backdrop-blur-xl border-b border-white/[0.04]">
        <div className="w-full max-w-md mx-auto px-3 sm:px-4 pt-2.5 pb-2">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/10 border border-amber-500/20 flex items-center justify-center">
                <Trophy size={15} className="text-amber-400" />
              </div>
              <div>
                <h1 className="text-base font-black text-white leading-tight">رتّب أولوياتك</h1>
                <p className="text-gray-500 text-[10px] leading-tight mt-0.5">
                  {myInfo && <span className="font-bold text-amber-400/80">رقمك #{myInfo.number}</span>}
                  {myInfo && <span className="mx-1 text-gray-700">·</span>}
                  {people.length} أشخاص · اسحب للترتيب
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!submitted && order.length >= 2 && (
                <motion.button
                  onClick={handleRandomize}
                  disabled={isShuffling}
                  whileTap={{ scale: 0.85 }}
                  whileHover={{ scale: 1.08 }}
                  title="خلط عشوائي"
                  className={`w-9 h-9 flex items-center justify-center rounded-xl border transition-all ${
                    isShuffling
                      ? 'bg-cyan-900/30 border-cyan-700/40 text-cyan-300 cursor-wait'
                      : 'bg-white/[0.03] border-white/[0.06] text-gray-500 hover:border-cyan-600/40 hover:text-cyan-400'
                  }`}
                >
                  <motion.span
                    animate={isShuffling ? { rotate: 360 } : { rotate: 0 }}
                    transition={isShuffling ? { duration: 0.5, repeat: Infinity, ease: 'linear' } : { duration: 0.2 }}
                  >
                    <Shuffle size={15} />
                  </motion.span>
                </motion.button>
              )}
              {autoSaving ? (
                <span className="flex items-center gap-1.5 text-amber-300 text-[11px] font-semibold">
                  <Spinner size={12} className="!text-amber-400" /> حفظ...
                </span>
              ) : submitted ? (
                autoSavedRef.current ? (
                  <span className="flex items-center gap-1.5 text-amber-300 text-[11px] font-semibold">
                    <Lock size={13} className="text-amber-400" /> مقفل
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-emerald-300 text-[11px] font-semibold">
                    <CheckCircle size={13} className="text-emerald-400" /> تم
                  </span>
                )
              ) : timeLeft > 0 ? (
                <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl font-mono font-bold text-sm tabular-nums transition-colors ${timerText} ${
                  timeLeft <= 30 ? 'bg-red-950/30' : timeLeft <= 60 ? 'bg-amber-950/30' : 'bg-white/[0.04]'
                }`}>
                  <Clock size={13} />
                  {formatTime(timeLeft)}
                </div>
              ) : null}
            </div>
          </div>

          {/* Timer progress bar */}
          {!submitted && timeLeft > 0 && (
            <div className="h-[3px] rounded-full bg-white/[0.04] overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${timerColor}`}
                animate={{ width: `${timerPct}%` }}
                transition={{ duration: 0.5, ease: "linear" }}
              />
            </div>
          )}

          {/* Compact status row — replaces 3 separate banners */}
          {!submitted && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {newNums.size > 0 && (
                <span className="text-purple-300 text-[10px] bg-purple-900/20 border border-purple-800/25 rounded-full px-2.5 py-0.5 font-medium inline-flex items-center gap-1">
                  <Sparkles size={10} /> {newNums.size} جدد
                </span>
              )}
              {showPhaseWarning && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  className="text-amber-300 text-[10px] bg-amber-900/30 border border-amber-700/30 rounded-full px-2.5 py-0.5 font-medium inline-flex items-center gap-1 cursor-pointer"
                  onClick={() => setShowPhaseWarning(false)}
                >
                  <Clock size={10} /> عجّل — المنظم انتقل
                </motion.span>
              )}
              {timeLeft <= 30 && timeLeft > 0 && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  className="text-red-300 text-[10px] bg-red-900/30 border border-red-700/30 rounded-full px-2.5 py-0.5 font-bold inline-flex items-center gap-1"
                >
                  <Clock size={10} className="animate-pulse" /> باقي {timeLeft}ث
                </motion.span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Ranking list ── */}
      <div className="w-full max-w-md mx-auto pb-[calc(10rem+env(safe-area-inset-bottom))] px-3 sm:px-4 pt-2">
        {order.length > 4 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-2 flex items-center justify-center gap-2 rounded-xl border border-cyan-800/25 bg-cyan-950/20 px-3 py-2 text-[10px] font-semibold text-cyan-300"
          >
            <motion.span animate={{ y: [0, 3, 0] }} transition={{ duration: 1.4, repeat: Infinity }}>↓</motion.span>
            مرّر لرؤية كل الأسماء · اسحب من المقبض لترتيبهم
          </motion.div>
        )}
        <Reorder.Group axis="y" values={order} onReorder={setOrder} className="space-y-1.5" as="div">
          {order.map((num, idx) => {
            const p = personMap[num]
            if (!p) return null
            const rb = rankBadge(idx)
            const accent = cardAccent(idx)
            return (
              <RankingReorderCard
                key={num}
                value={num}
                className={`rounded-xl border transition-colors ${accent} ${
                  submitted
                    ? 'opacity-40 cursor-not-allowed'
                    : isShuffling
                    ? 'border-cyan-800/20 cursor-default pointer-events-none'
                    : 'hover:border-white/[0.1] select-none'
                }`}
                disabled={submitted || isShuffling}
                whileDrag={submitted ? undefined : {
                  scale: 1.03,
                  boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
                  borderColor: 'rgba(251,191,36,0.3)',
                  zIndex: 50,
                }}
              >
                {startDrag => <>
                <div className="flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 touch-pan-y">
                  {/* Rank badge with icon for top 3 */}
                  <div className={`flex items-center justify-center flex-shrink-0 bg-gradient-to-br ${rb.bg} ${rb.text} shadow-sm ${rb.glow} ring-1 ${rb.ring} ${
                    idx < 3 ? 'w-8 h-8 rounded-lg gap-0.5' : 'w-7 h-7 rounded-md'
                  }`}>
                    {idx === 0 ? (
                      <><Crown size={11} /><span className="text-[11px] font-black">{idx + 1}</span></>
                    ) : idx === 1 ? (
                      <><Medal size={11} /><span className="text-[11px] font-black">{idx + 1}</span></>
                    ) : idx === 2 ? (
                      <><Award size={11} /><span className="text-[11px] font-black">{idx + 1}</span></>
                    ) : (
                      <span className="text-[11px] font-black">{idx + 1}</span>
                    )}
                  </div>

                  {/* Name + number inline */}
                  <div className="flex-1 min-w-0 text-center flex items-center justify-center gap-1.5 flex-wrap">
                    <span className="font-bold text-white text-xs sm:text-sm leading-tight">{p.first_name}</span>
                    <span className="text-gray-700 text-[9px] font-mono">#{p.number}</span>
                    {newNums.has(num) && (
                      <span className="text-[8px] bg-purple-900/50 text-purple-300 border border-purple-800/40 rounded-full px-1.5 py-0.5 font-semibold flex items-center gap-0.5 flex-shrink-0">
                        <Sparkles size={6} /> جديد
                      </span>
                    )}
                  </div>

                  {/* Note button */}
                  <button
                    onClick={e => { e.stopPropagation(); setOpenNote(openNote === num ? null : num) }}
                    className={`w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-md transition-all ${
                      notes[num]
                        ? 'bg-amber-500/10 border border-amber-700/30 text-amber-400'
                        : 'text-gray-600 hover:text-gray-400 hover:bg-white/[0.04]'
                    }`}
                    title="ملاحظة خاصة"
                  >
                    <PenLine size={11} />
                  </button>

                  {/* Drag handle — keeping drag here leaves the rest of the card free for page scrolling. */}
                  <button
                    type="button"
                    onPointerDown={startDrag}
                    disabled={submitted || isShuffling}
                    aria-label={`اسحب لتغيير ترتيب ${p.first_name}`}
                    className="flex h-11 w-11 min-h-11 min-w-11 flex-shrink-0 touch-none cursor-grab items-center justify-center rounded-xl border border-amber-500/15 bg-amber-500/[0.06] text-amber-400/80 shadow-inner shadow-amber-950/20 transition-colors hover:border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-300 active:cursor-grabbing active:bg-amber-500/15 disabled:cursor-default disabled:border-white/[0.04] disabled:bg-white/[0.02] disabled:text-gray-700"
                  >
                    <GripVertical size={21} strokeWidth={2.5} />
                  </button>
                </div>

                {/* Collapsible note */}
                <AnimatePresence>
                  {openNote === num && (
                    <motion.div
                      key="note"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                      onPointerDown={e => e.stopPropagation()}
                    >
                      <div className="px-3.5 pb-3">
                        <div className="pt-2.5 border-t border-white/[0.05]">
                          <textarea
                            value={notes[num] || ''}
                            onChange={e => setNotes(prev => ({ ...prev, [num]: e.target.value }))}
                            onBlur={() => saveNote(num, notes[num] || '')}
                            placeholder="ملاحظة خاصة — لن يراها أحد غيرك..."
                            rows={2}
                            dir="rtl"
                            className="w-full bg-white/[0.03] border border-white/[0.06] focus:border-amber-600/40 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 resize-none outline-none transition-colors cursor-text"
                          />
                          <p className="text-[9px] mt-1 text-right transition-colors" style={{ color: savingNote === num ? '#f59e0b' : '#374151' }}>
                            {savingNote === num ? 'جاري الحفظ...' : notes[num]?.trim() ? '✓ محفوظة' : 'تُحفظ تلقائياً عند المغادرة'}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                </>}
              </RankingReorderCard>
            )
          })}
        </Reorder.Group>
      </div>

      {/* ── Fixed submit bar ── */}
      <div className="fixed bottom-0 inset-x-0 bg-gradient-to-t from-gray-950 via-gray-950/95 to-transparent pt-4 pb-3 px-3 sm:px-4">
        <div className="w-full max-w-md mx-auto">
          {submitted ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="space-y-2.5 text-center"
            >
              <div className={`flex flex-col items-center gap-2 rounded-2xl py-4 px-4 ${autoSavedRef.current ? 'bg-amber-900/15 border border-amber-800/25' : 'bg-emerald-900/15 border border-emerald-800/25'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${autoSavedRef.current ? 'bg-amber-500/15' : 'bg-emerald-500/15'}`}>
                  {autoSavedRef.current ? <Lock size={18} className="text-amber-400" /> : <CheckCircle size={18} className="text-emerald-400" />}
                </div>
                <span className={`font-bold text-xs ${autoSavedRef.current ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {autoSavedRef.current ? 'تم قفل التصنيف بانتهاء الوقت' : 'تم إرسال تصنيفك بنجاح'}
                </span>
                {autoSavedRef.current && (
                  <p className="text-amber-500/40 text-[10px] leading-relaxed">
                    تم حفظ ترتيبك الحالي تلقائياً — لا يمكن التعديل
                  </p>
                )}
              </div>
              <p className="text-gray-600 text-[10px]">انتظر المنظم للانتقال للمرحلة التالية</p>
              {!autoSavedRef.current && (
                <button onClick={() => setSubmitted(false)} disabled={submitting}
                  className="text-gray-500 hover:text-gray-300 text-[10px] underline transition-colors">
                  تعديل التصنيف
                </button>
              )}
            </motion.div>
          ) : (
            <>
              <motion.button
                onClick={() => setShowConfirm(true)}
                disabled={submitting}
                whileTap={{ scale: 0.97 }}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 text-black rounded-xl py-3 font-black text-sm shadow-lg shadow-amber-500/20 transition-all"
              >
                {submitting ? <Spinner size={16} className="!text-black" /> : <Send size={16} />}
                {completedRounds >= 2 ? 'إرسال التصنيف النهائي' : 'حفظ التصنيف'}
              </motion.button>
              <div className="flex items-center justify-center gap-1.5 mt-2">
                <p className="text-gray-600 text-[10px]">
                  النظام سيختار توافقك الأمثل من تصنيفاتك
                </p>
                {timeLeft > 0 && timeLeft <= 60 && (
                  <>
                    <span className="text-gray-700 text-[10px]">·</span>
                    <p className="text-amber-500/60 text-[10px]">
                      يُحفظ تلقائياً عند انتهاء الوقت
                    </p>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Ranking Tutorial Overlay */}
      <AnimatePresence>
        {showRankTutorial && <RankingTutorial onClose={() => { setShowRankTutorial(false); try { sessionStorage.setItem('e3_tut_ranking', "1") } catch {} }} />}
      </AnimatePresence>

      {/* 90-second auto-lock warning popup */}
      <AnimatePresence>
        {showTimeWarning && !submitted && (
          <TimerWarningPopup
            seconds={90}
            label="دقيقة ونصف متبقية"
            sublabel="إذا لم ترسل تصنيفك سيُحفظ تلقائياً ويُقفل"
            theme="amber"
            onDone={() => setShowTimeWarning(false)}
          />
        )}
      </AnimatePresence>

      {/* Confirmation modal */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[500] bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
            onClick={() => setShowConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 20 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="bg-gradient-to-br from-gray-900/95 to-gray-950/95 border border-amber-500/15 rounded-3xl p-6 max-w-xs w-full space-y-4 text-center ring-1 ring-amber-500/10"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-600/10 border border-amber-500/20 flex items-center justify-center">
                <Send size={22} className="text-amber-400" />
              </div>
              <h3 className="text-white font-black text-lg">تأكيد التصنيف</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                حفظ ترتيبك لـ <span className="text-white font-bold">{order.length}</span> شخص.
                {completedRounds >= 2 ? " تصنيفك النهائي — سيُستخدم للمطابقة." : " يمكنك التعديل في الجولة القادمة."}
              </p>
              {/* Top 3 podium preview */}
              <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-3.5 space-y-2">
                {order.slice(0, 3).map((num, i) => {
                  const p = personMap[num]
                  if (!p) return null
                  const rb = rankBadge(i)
                  return (
                    <div key={num} className="flex items-center gap-2.5">
                      <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black bg-gradient-to-br ${rb.bg} ${rb.text}`}>{i + 1}</span>
                      <span className="text-gray-200 font-semibold text-sm flex-1 text-right">{p.first_name}</span>
                      <span className="text-gray-600 text-[10px] font-mono">#{p.number}</span>
                    </div>
                  )
                })}
                {order.length > 3 && <p className="text-gray-600 text-[11px] pt-1 text-center">+ {order.length - 3} آخرون</p>}
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowConfirm(false)}
                  className="flex-1 py-3 rounded-2xl bg-white/[0.04] border border-white/[0.06] text-gray-400 font-bold text-sm hover:bg-white/[0.06] transition-colors">
                  إلغاء
                </button>
                <button onClick={submit} disabled={submitting}
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-black font-black text-sm hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20">
                  {submitting ? <Spinner size={16} className="!text-black" /> : <CheckCircle size={16} />}
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


// ─── Optional Group Reflection ────────────────────────────────────────────────
function GroupReflectionSheet({ token, sourcePhase, onClose, previewPeople }: {
  token: string | null
  sourcePhase: 'phase2_feedback' | 'phase3_feedback'
  onClose: () => void
  previewPeople?: { number: number; first_name: string; rounds: number[] }[]
}) {
  const [people, setPeople] = useState<{ number: number; first_name: string; rounds: number[] }[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (previewPeople) {
      setPeople(previewPeople)
      setLoading(false)
      return
    }
    if (!token) return
    let active = true
    call('e3-get-group-reflection', token).then(data => {
      if (!active) return
      if (data.error) {
        toast.error(data.error)
        onClose()
        return
      }
      setPeople(data.people || [])
      setSelected(Array.isArray(data.reflection?.ranked_numbers) ? data.reflection.ranked_numbers : [])
      setNote(data.reflection?.organizer_note || '')
      setLoading(false)
    })
    return () => { active = false }
  }, [token, previewPeople])

  const togglePerson = (number: number) => {
    setSaved(false)
    setSelected(current => {
      if (current.includes(number)) return current.filter(value => value !== number)
      if (current.length >= 3) {
        toast('اختر ثلاثة فقط — اضغط على اسم لإزالته', { icon: '✨' })
        return current
      }
      return [...current, number]
    })
  }

  const save = async () => {
    if (selected.length === 0 && !note.trim()) {
      toast.error('اختر شخصاً أو اكتب ملاحظة، أو اضغط تخطي')
      return
    }
    if (!token) { toast.success('معاينة فقط — التصميم جاهز'); return }
    setSaving(true)
    const data = await call('e3-submit-group-reflection', token, {
      ranked_numbers: selected,
      organizer_note: note.trim(),
      source_phase: sourcePhase,
    })
    setSaving(false)
    if (data.error) { toast.error(data.error); return }
    setSaved(true)
    toast.success('تم حفظ انطباعك بسرية')
    setTimeout(onClose, 700)
  }

  const medal = (index: number) => [Crown, Medal, Award][index] || Star
  const medalStyle = (index: number) => [
    'border-amber-400/40 bg-amber-500/15 text-amber-300',
    'border-slate-300/30 bg-slate-300/10 text-slate-200',
    'border-orange-500/30 bg-orange-600/10 text-orange-300',
  ][index]

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[550] bg-black/75 backdrop-blur-lg flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <motion.section
        initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 34 }}
        onClick={event => event.stopPropagation()}
        className="relative w-full sm:max-w-md max-h-[92dvh] overflow-hidden rounded-t-[2rem] sm:rounded-[2rem] border border-purple-400/15 bg-gradient-to-b from-[#171023] via-[#0d0a14] to-[#08070c] shadow-[0_-20px_80px_-20px_rgba(139,92,246,0.45)]"
        dir="rtl"
      >
        <div className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.20),transparent_70%)] pointer-events-none" />
        <div className="sm:hidden w-10 h-1 rounded-full bg-white/15 mx-auto mt-2.5" />
        <header className="relative flex items-start gap-3 px-5 pt-5 pb-4 border-b border-white/[0.06]">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-500/25 to-fuchsia-500/10 border border-purple-400/20 flex items-center justify-center shrink-0">
            <Trophy size={20} className="text-purple-300" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-white">مين ترك أفضل انطباع؟</h2>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[9px] font-bold text-gray-500">اختياري</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">اختر حتى 3 بالترتيب. خاص بالمنظم ولا يؤثر على تطابقك.</p>
          </div>
          <button onClick={onClose} aria-label="إغلاق" className="w-9 h-9 rounded-full bg-white/[0.05] text-gray-500 flex items-center justify-center active:scale-90 transition">
            <X size={17} />
          </button>
        </header>

        <div className="relative overflow-y-auto overscroll-contain px-5 py-4 space-y-4" style={{ maxHeight: 'calc(92dvh - 92px)' }}>
          {loading ? (
            <div className="h-64 flex items-center justify-center"><Spinner size={24} /></div>
          ) : people.length === 0 ? (
            <div className="py-14 text-center space-y-2">
              <Users size={28} className="mx-auto text-gray-700" />
              <p className="text-sm font-bold text-gray-400">ما لقينا مشاركين من جولاتك الجماعية</p>
              <button onClick={onClose} className="text-xs text-purple-300">رجوع</button>
            </div>
          ) : (
            <>
              {selected.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map(index => {
                    const number = selected[index]
                    const person = people.find(item => item.number === number)
                    const Icon = medal(index)
                    return (
                      <button key={index} disabled={!person} onClick={() => person && togglePerson(person.number)}
                        className={`min-h-[70px] rounded-2xl border p-2 flex flex-col items-center justify-center gap-1 transition ${person ? medalStyle(index) : 'border-dashed border-white/[0.06] text-gray-700'}`}>
                        <Icon size={14} />
                        <span className="max-w-full truncate text-xs font-black">{person?.first_name || `${index + 1}`}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              <div>
                <p className="mb-2 text-[10px] font-bold tracking-wide text-gray-600">اضغط بالترتيب: الأول، ثم الثاني، ثم الثالث</p>
                <div className="grid grid-cols-2 gap-2">
                  {people.map(person => {
                    const rank = selected.indexOf(person.number)
                    return (
                      <motion.button key={person.number} whileTap={{ scale: 0.96 }} onClick={() => togglePerson(person.number)}
                        className={`relative min-h-14 rounded-2xl border px-3 py-2.5 flex items-center gap-2.5 text-right transition-all ${rank >= 0 ? 'border-purple-400/45 bg-purple-500/15 shadow-[0_0_24px_-12px_rgba(168,85,247,0.8)]' : 'border-white/[0.06] bg-white/[0.035] active:bg-white/[0.07]'}`}>
                        <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${rank >= 0 ? 'bg-purple-400 text-gray-950' : 'bg-white/[0.05] text-gray-600'}`}>{rank >= 0 ? rank + 1 : '+'}</span>
                        <span className={`truncate text-sm font-bold ${rank >= 0 ? 'text-white' : 'text-gray-400'}`}>{person.first_name}</span>
                      </motion.button>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3.5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-gray-300"><PenLine size={14} className="text-purple-400" /><span className="text-xs font-bold">ملاحظة خاصة للمنظم</span></div>
                  <span className="text-[9px] tabular-nums text-gray-700">{note.length}/300</span>
                </div>
                <textarea value={note} onChange={event => { setSaved(false); setNote(event.target.value.slice(0, 300)) }} rows={3}
                  placeholder="شيء لفت انتباهك؟ اتركه هنا..."
                  className="w-full resize-none bg-transparent text-sm leading-relaxed text-gray-200 placeholder:text-gray-700 focus:outline-none" />
              </div>

              <div className="flex gap-2 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
                <button onClick={onClose} className="px-5 py-3.5 rounded-2xl border border-white/[0.07] bg-white/[0.035] text-sm font-bold text-gray-500 active:scale-95 transition">تخطي</button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={save} disabled={saving || saved}
                  className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-purple-500 via-violet-500 to-fuchsia-500 text-sm font-black text-white shadow-[0_10px_30px_-12px_rgba(168,85,247,0.9)] disabled:opacity-60 flex items-center justify-center gap-2">
                  {saving ? <Spinner size={16} /> : saved ? <CheckCircle size={17} /> : <Send size={16} />}
                  {saved ? 'تم الحفظ' : selected.length ? `حفظ أفضل ${selected.length}` : 'حفظ الملاحظة'}
                </motion.button>
              </div>
            </>
          )}
        </div>
      </motion.section>
    </motion.div>
  )
}

// ─── Shared Feedback Flow ─────────────────────────────────────────────────────
function FeedbackFlow({ partnerName, word, done, onDone, onBack, onSubmit, isLastSession, token, reflectionSource }: {
  partnerName: string | null; word: string; done: boolean
  onDone: () => void; onBack: () => void; onSubmit: (fb: Record<string, any>) => Promise<boolean>
  isLastSession?: boolean
  token: string
  reflectionSource: 'phase2_feedback' | 'phase3_feedback'
}) {
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [showGroupReflection, setShowGroupReflection] = useState(false)
  const [dir, setDir] = useState(1)
  const [fb, setFb] = useState({
    conversationQuality: 0, personalConnection: 0,
    wantConnect: null as boolean | null, organizerImpression: '',
    compatibilityRate: 50, sliderMoved: false, sharedInterests: 3, comfortLevel: 3,
    communicationStyle: 3, wouldMeetAgain: 3, overallExperience: 3, recommendations: '', participantMessage: ''
  })
  const STEPS = 5
  const goNext = (patch?: Partial<typeof fb>) => {
    if (patch) setFb(p => ({ ...p, ...patch }))
    setDir(1); setTimeout(() => setStep(s => Math.min(s + 1, STEPS - 1)), 150)
  }
  const goBack = () => { setDir(-1); setStep(s => Math.max(s - 1, 0)) }
  const handleSubmit = async () => {
    if (!fb.sliderMoved || fb.compatibilityRate === 50) { toast.error('رجاءً خمّن درجة التوافق في الخطوة 1'); return }
    if (fb.wantConnect === null) { toast.error('رجوع للخطوة 4 واختر رد'); return }
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
    <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
      {labels.map((label, i) => {
        const cfg = ratingConfigs[i]
        const selected = val === i + 1
        return (
          <motion.button key={i} whileTap={{ scale: 0.88 }}
            onClick={() => { setFb(p => ({ ...p, [field]: i + 1 })); setTimeout(() => goNext({ [field]: i + 1 }), 320) }}
            className={`flex flex-col items-center gap-1.5 py-3 sm:py-4 rounded-2xl transition-all duration-200 ${selected ? 'bg-white/[0.06] ring-2 scale-105 ' + cfg.ring + ' ' + cfg.glow : 'bg-white/[0.03] ring-1 ring-white/[0.05] active:bg-white/8'}`}>
            <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-gradient-to-br ${cfg.gradient} flex items-center justify-center text-white transition-transform duration-200 ${selected ? 'scale-110' : 'scale-95 opacity-70'}`}>
              {cfg.icon}
            </div>
            <span className={`text-[9px] sm:text-[10px] leading-tight text-center transition-colors duration-200 ${selected ? 'text-white font-semibold' : 'text-gray-600'}`}>{label}</span>
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
      <motion.button
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        onClick={() => setShowGroupReflection(true)} whileTap={{ scale: 0.97 }}
        className="w-full max-w-sm overflow-hidden rounded-3xl border border-purple-400/20 bg-gradient-to-br from-purple-500/15 via-violet-500/10 to-fuchsia-500/[0.07] p-4 text-right shadow-[0_18px_50px_-28px_rgba(168,85,247,0.85)]"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-purple-400/15 border border-purple-400/20 flex items-center justify-center shrink-0"><Trophy size={19} className="text-purple-300" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><p className="text-sm font-black text-white">مين برز في مجموعتك؟</p><span className="text-[9px] rounded-full bg-white/[0.05] px-2 py-0.5 text-gray-500">اختياري</span></div>
            <p className="mt-1 text-[11px] text-gray-500">اختر أفضل 3 أو اترك ملاحظة خاصة للمنظم</p>
          </div>
          <ChevronRight size={18} className="text-purple-300" />
        </div>
      </motion.button>
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
      <AnimatePresence>
        {showGroupReflection && <GroupReflectionSheet token={token} sourcePhase={reflectionSource} onClose={() => setShowGroupReflection(false)} />}
      </AnimatePresence>
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
              transition={{ type: 'spring', stiffness: 350, damping: 35 }} className="space-y-6">
              {/* Disclaimer banner — intellectual compatibility, not looks (only on this step) */}
              <div className="relative z-10">
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                  className="relative overflow-hidden rounded-2xl border border-amber-700/40 bg-gradient-to-br from-amber-950/50 via-orange-950/30 to-amber-950/20 px-4 py-3">
                  <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
                  <div className="flex items-start gap-2.5">
                    <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 2, repeat: Infinity }}
                      className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-600/30 flex items-center justify-center shrink-0 mt-0.5">
                      <AlertTriangle size={15} className="text-amber-400" />
                    </motion.div>
                    <div className="space-y-1">
                      <p className="text-amber-300 text-xs font-black">التوافق الفكري وليس الشكلي</p>
                      <p className="text-amber-200/60 text-[10px] leading-relaxed">
                        خمّن درجة التوافق بناءً على <span className="font-bold text-amber-300">الشخصية والتفكير</span>، وليس المظهر. التركيز على الشكل فقط قد يضر بمطابقاتك المستقبلية لأن النظام يعتمد على التوافق الفكري في الاختيار.
                      </p>
                    </div>
                  </div>
                </motion.div>
              </div>
              <div className="text-center space-y-2">
                <div className="inline-flex items-center gap-1.5 bg-purple-900/30 border border-purple-700/40 rounded-full px-3 py-1 mb-1">
                  <Brain size={11} className="text-purple-400" />
                  <span className="text-purple-300 text-[10px] font-semibold">توافق فكري</span>
                </div>
                <p className="text-2xl sm:text-3xl font-black text-white">خمّن درجة التوافق الفكري</p>
                <p className="text-gray-500 text-sm">لو كنت تخمّن نسبة التوافق الفكري بينكم — كم تعطي؟</p>
              </div>
              {/* Beautiful slider card */}
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                className="relative overflow-hidden rounded-3xl border border-purple-700/30 bg-gradient-to-br from-purple-950/40 via-violet-950/30 to-purple-950/20 p-6 space-y-5 shadow-xl shadow-purple-900/20">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-400/40 to-transparent" />
                {/* Floating glow orbs */}
                <motion.div className="absolute w-24 h-24 rounded-full bg-purple-500/10 blur-2xl"
                  animate={{ x: [0, 15, 0], y: [0, -10, 0] }} transition={{ duration: 4, repeat: Infinity }} style={{ top: '5%', left: '5%' }} />
                {/* Big percentage display */}
                <div className="relative z-10 text-center">
                  <motion.div
                    key={fb.compatibilityRate}
                    initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className={`text-6xl font-black font-mono tabular-nums ${
                      fb.compatibilityRate >= 80 ? 'text-emerald-400' :
                      fb.compatibilityRate >= 60 ? 'text-amber-400' :
                      fb.compatibilityRate >= 40 ? 'text-orange-400' : 'text-red-400'
                    }`}
                    style={{ textShadow: fb.compatibilityRate >= 80 ? '0 0 30px rgba(16,185,129,0.3)' : fb.compatibilityRate >= 60 ? '0 0 30px rgba(245,158,11,0.3)' : '0 0 30px rgba(239,68,68,0.2)' }}
                  >
                    {fb.compatibilityRate}%
                  </motion.div>
                  <p className="text-gray-500 text-[10px] mt-1">{fb.compatibilityRate >= 80 ? 'توافق عالي جداً!' : fb.compatibilityRate >= 60 ? 'توافق جيد' : fb.compatibilityRate >= 40 ? 'توافق متوسط' : 'توافق منخفض'}</p>
                </div>
                {/* Slider */}
                <div className="relative z-10">
                  <div className="relative" style={{ direction: 'ltr' }}>
                    <input
                      type="range" min="0" max="100" step="5"
                      value={fb.compatibilityRate}
                      onChange={e => setFb(p => ({ ...p, compatibilityRate: parseInt(e.target.value), sliderMoved: true }))}
                      aria-label="درجة التوافق الفكري"
                      className="w-full h-3 rounded-full appearance-none cursor-pointer focus:outline-none transition-all
                        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:h-7
                        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
                        [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:border-2
                        [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-all
                        [&::-webkit-slider-thumb]:duration-200 hover:[&::-webkit-slider-thumb]:scale-110
                        [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:rounded-full
                        [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:cursor-pointer"
                      style={{
                        background: `linear-gradient(to right,
                          ${fb.compatibilityRate >= 80 ? '#059669' : fb.compatibilityRate >= 60 ? '#d97706' : fb.compatibilityRate >= 40 ? '#ea580c' : '#dc2626'} 0%,
                          ${fb.compatibilityRate >= 80 ? '#10b981' : fb.compatibilityRate >= 60 ? '#f59e0b' : fb.compatibilityRate >= 40 ? '#f97316' : '#ef4444'} ${Math.max(fb.compatibilityRate - 2, 0)}%,
                          ${fb.compatibilityRate >= 80 ? '#34d399' : fb.compatibilityRate >= 60 ? '#fbbf24' : fb.compatibilityRate >= 40 ? '#fb923c' : '#f87171'} ${fb.compatibilityRate}%,
                          #334155 ${Math.min(fb.compatibilityRate + 2, 100)}%, #1e293b 100%)`,
                      }}
                    />
                    <style>{`
                      input[type="range"]::-webkit-slider-thumb {
                        border-color: ${fb.compatibilityRate >= 80 ? '#10b981' : fb.compatibilityRate >= 60 ? '#f59e0b' : fb.compatibilityRate >= 40 ? '#f97316' : '#ef4444'} !important;
                      }
                      input[type="range"]::-moz-range-thumb {
                        border-color: ${fb.compatibilityRate >= 80 ? '#10b981' : fb.compatibilityRate >= 60 ? '#f59e0b' : fb.compatibilityRate >= 40 ? '#f97316' : '#ef4444'} !important;
                      }
                    `}</style>
                  </div>
                  <div className="flex justify-between text-[10px] mt-2 text-gray-600">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>
                {/* Hint */}
                {!fb.sliderMoved && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                    className="relative z-10 text-center text-purple-300/60 text-[10px] flex items-center justify-center gap-1.5">
                    <motion.span animate={{ x: [0, 4, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>👈</motion.span>
                    حرّك المؤشر لتخمين الدرجة
                  </motion.p>
                )}
              </motion.div>
              {/* Next button */}
              <motion.button
                onClick={() => { if (!fb.sliderMoved || fb.compatibilityRate === 50) { toast.error('حرّك المؤشر أولاً'); return } goNext() }}
                whileTap={{ scale: 0.97 }}
                disabled={!fb.sliderMoved || fb.compatibilityRate === 50}
                className="w-full py-4 rounded-2xl font-bold text-sm bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-lg shadow-purple-600/20 disabled:opacity-30 disabled:shadow-none transition-all flex items-center justify-center gap-2">
                متابعة <ChevronRight size={16} />
              </motion.button>
              {fb.sliderMoved && fb.compatibilityRate === 50 && (
                <p className="text-center text-amber-500/70 text-[10px]">لا يمكن أن تكون 50% بالضبط — اختر قيمة أعلى أو أدنى</p>
              )}
            </motion.div>
          )}
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: dir * 70 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -dir * 70 }}
              transition={{ type: 'spring', stiffness: 350, damping: 35 }} className="space-y-8">
              <div className="text-center space-y-2">
                <p className="text-2xl sm:text-3xl font-black text-white">كيف كانت المحادثة؟</p>
                <p className="text-gray-500 text-sm">اختر ما يناسب شعورك</p>
              </div>
              <RatingRow labels={["سيئة","ضعيفة","مقبولة","جيدة","ممتازة"]} field="conversationQuality" val={fb.conversationQuality} />
            </motion.div>
          )}
          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: dir * 70 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -dir * 70 }}
              transition={{ type: 'spring', stiffness: 350, damping: 35 }} className="space-y-8">
              <div className="text-center space-y-2">
                <p className="text-2xl sm:text-3xl font-black text-white">التواصل الشخصي؟</p>
                <p className="text-gray-500 text-sm">مستوى الراحة والتفاهم</p>
              </div>
              <RatingRow labels={["لا شيء","ضعيف","مقبول","جيد","رائع"]} field="personalConnection" val={fb.personalConnection} />
            </motion.div>
          )}
          {step === 3 && (
            <motion.div key="s3" initial={{ opacity: 0, x: dir * 70 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -dir * 70 }}
              transition={{ type: 'spring', stiffness: 350, damping: 35 }} className="space-y-6">
              <div className="text-center space-y-2">
                <p className="text-2xl sm:text-3xl font-black text-white">هل تريد التواصل لاحقاً؟</p>
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
          {step === 4 && (
            <motion.div key="s4" initial={{ opacity: 0, x: dir * 70 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -dir * 70 }}
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
              {fb.wantConnect === null && <p className="text-center text-amber-500/70 text-xs">ارجع للخطوة 4 وأجب على سؤال التواصل</p>}
              {(!fb.sliderMoved || fb.compatibilityRate === 50) && <p className="text-center text-amber-500/70 text-xs">ارجع للخطوة 1 وحرّك مؤشر التوافق</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// ─── SOS / Organizer Chat Box ───────────────────────────────────────────────
function SOSButton({ token, position = 'top', sosRequests }: { token: string; position?: 'top' | 'bottom'; sosRequests?: any[] }) {
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
    if (!sosRequests) return
      const allMsgs: { id: string; text: string; from: 'user' | 'organizer'; status: string; timestamp?: string }[] = []
      let orgCount = 0
      for (const r of sosRequests) {
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
  }, [sosRequests])

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
function Phase2RevealScreen({ token, eventId, timerActive, timerStart, timerDuration, correctedNow }: {
  token: string; eventId?: number | string; timerActive: boolean; timerStart: string | null; timerDuration: number; correctedNow?: () => number
}) {
  const [revealed, setRevealed] = useState(false)
  const [tableRevealed, setTableRevealed] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [word, setWord] = useState("")
  const [wordSubmitted, setWordSubmitted] = useState(false)
  const [view, setView] = useState<'partner' | 'session' | 'feedback'>('partner')
  const [showPrompt, setShowPrompt] = useState(false)
  const [feedbackDone, setFeedbackDone] = useState(false)
  const [showTutorial, setShowTutorial] = useState(typeof window === "undefined" || sessionStorage.getItem('e3_tut_phase2') !== "1")
  const [showSessionTips, setShowSessionTips] = useState(false)
  const [rejoined, setRejoined] = useState(false)
  const [icebreakerDone, setIcebreakerDone] = useState(false)
  const [showTimeWarning, setShowTimeWarning] = useState(false)
  const { popup, clearPopup } = useTimerWarnings(timerActive, timeLeft, timerDuration, view === 'session')

  const fetchReveal = useCallback(async () => {
    const d = await call("e3-get-phase2-reveal", token)
    if (d.error) throw new Error(d.error)
    return d
  }, [token])

  const { data, loading, error, retry } = useApiPoll(fetchReveal, {
    interval: 5000,
    stopWhen: (d) => d.table_number != null
  })

  useEffect(() => {
    if (data?.my_word) { setWord(data.my_word); setWordSubmitted(true) }
    if (data?.feedback_submitted) setFeedbackDone(true)
  }, [data])

  useEffect(() => {
    if (!timerActive || !timerStart) { setTimeLeft(0); return }
    const update = () => {
      const now = correctedNow ? correctedNow() : Date.now()
      const elapsed = Math.floor((now - new Date(timerStart).getTime()) / 1000)
      setTimeLeft(Math.max(0, timerDuration - elapsed))
    }
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [timerActive, timerStart, timerDuration, correctedNow])

  // Timer warnings handled by useTimerWarnings hook (sound + vibration + popup)
  // 60s banner still shown separately for persistent visual
  useEffect(() => {
    if (timerActive && view === 'session' && timeLeft === 60) setShowTimeWarning(true)
  }, [timeLeft, timerActive, view])

  // Auto-rejoin sync: if timer already running when component mounts, jump to correct view
  // Only auto-rejoin if the participant had already clicked "وصلت إلى الطاولة" before refresh
  useEffect(() => {
    if (!data || !timerActive || !timerStart) return
    const now = correctedNow ? correctedNow() : Date.now()
    const elapsed = Math.floor((now - new Date(timerStart).getTime()) / 1000)
    const remaining = Math.max(0, timerDuration - elapsed)
    const arrived = hasArrived(eventId, "phase2")
    if (arrived && elapsed > 60 && remaining > 0) { setTableRevealed(true); setRevealed(true); setView('session'); setRejoined(true) }
    else if (arrived && remaining <= 0) { setTableRevealed(true); setRevealed(true); setView('feedback') }
    else if (!arrived && remaining <= 0) { setTableRevealed(true); setRevealed(true); setView('feedback') }
  }, [data, timerActive, timerStart, timerDuration, eventId, correctedNow])

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

  // Auto-advance: table animation → partner reveal (skip "I arrived" button)
  useEffect(() => {
    if (!tableRevealed || revealed) return
    if (!canArrive) return
    if (rejoined) return
    const timer = setTimeout(() => {
      setArrived(eventId, "phase2")
      setRevealed(true)
      fireConfetti({ particleCount: 55, spread: 65, origin: { y: 0.45 }, colors: ["#ec4899", "#f43f5e", "#fb7185", "#be185d"] })
    }, 2800)
    return () => clearTimeout(timer)
  }, [tableRevealed, revealed, canArrive, eventId, rejoined])

  // Auto-advance: partner reveal → session questions
  useEffect(() => {
    if (!revealed || view !== 'partner' || rejoined) return
    const timer = setTimeout(() => setView('session'), 4500)
    return () => clearTimeout(timer)
  }, [revealed, view, rejoined])

  const submitWord = async () => {
    if (!word.trim()) return
    const d = await call("e3-submit-phase2-word", token, { word: word.trim() })
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
        <p className="text-gray-500 text-sm">قد تكون المطابقة ما زالت قيد التجهيز. حاول مرة أخرى بعد لحظات.</p>
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
            <motion.div key="table-anim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-4">
              {/* Gorgeous table number animation */}
              <div className="relative flex flex-col items-center justify-center py-10">
                {/* Animated glow rings */}
                <motion.div className="absolute w-52 h-52 rounded-full border-2 border-pink-500/20"
                  animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0, 0.5] }} transition={{ duration: 2, repeat: Infinity }} />
                <motion.div className="absolute w-52 h-52 rounded-full border-2 border-pink-500/10"
                  animate={{ scale: [1, 1.55, 1], opacity: [0.3, 0, 0.3] }} transition={{ duration: 2.5, repeat: Infinity, delay: 0.3 }} />
                {/* Floating particles */}
                <motion.div className="absolute w-3 h-3 rounded-full bg-pink-400/40"
                  animate={{ y: [0, -20, 0], x: [0, 10, 0], opacity: [0, 1, 0] }} transition={{ duration: 3, repeat: Infinity, delay: 0.2 }} style={{ top: '20%', left: '30%' }} />
                <motion.div className="absolute w-2 h-2 rounded-full bg-rose-400/40"
                  animate={{ y: [0, 15, 0], x: [0, -12, 0], opacity: [0, 1, 0] }} transition={{ duration: 2.5, repeat: Infinity, delay: 0.8 }} style={{ top: '30%', right: '25%' }} />
                <motion.div className="absolute w-2.5 h-2.5 rounded-full bg-fuchsia-400/30"
                  animate={{ y: [0, -15, 0], x: [0, 8, 0], opacity: [0, 1, 0] }} transition={{ duration: 3.5, repeat: Infinity, delay: 1.2 }} style={{ bottom: '25%', left: '35%' }} />

                {/* Table number */}
                <motion.div
                  initial={{ scale: 0.3, opacity: 0, filter: "blur(20px)" }}
                  animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
                  transition={{ type: "spring", stiffness: 200, damping: 18 }}
                  className="relative z-10 text-center"
                >
                  <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 2, repeat: Infinity }}>
                    <MapPin size={28} className="text-pink-400 mx-auto mb-2" />
                  </motion.div>
                  <p className="text-gray-500 text-sm mb-1">توجّه إلى الطاولة رقم</p>
                  <motion.div
                    className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-pink-300 via-rose-400 to-pink-500"
                    animate={{ scale: [1, 1.04, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    style={{ filter: "drop-shadow(0 0 20px rgba(236,72,153,0.3))" }}
                  >
                    {data?.table_number ?? "—"}
                  </motion.div>
                </motion.div>
              </div>

              {/* Auto-advance indicator, manual button for rejoined, or wait timer */}
              {canArrive && rejoined ? (
                <motion.button onClick={handleReveal} whileTap={{ scale: 0.97 }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                  className="w-full bg-gradient-to-br from-pink-600 via-rose-600 to-pink-700 text-white rounded-2xl py-5 font-bold text-lg shadow-2xl shadow-pink-600/40 border border-pink-500/30">
                  <span className="flex items-center justify-center gap-3">
                    <MapPin size={22} /> اكشف شريكك
                  </span>
                </motion.button>
              ) : canArrive ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="text-center space-y-2">
                  <motion.div className="flex items-center justify-center gap-2 text-pink-400 text-sm font-medium"
                    animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.5, repeat: Infinity }}>
                    <Loader2 size={14} className="animate-spin" />
                    <span>جاري الكشف عن شريكك...</span>
                  </motion.div>
                  {/* Progress bar */}
                  <div className="h-0.5 bg-gray-800/60 rounded-full overflow-hidden max-w-[180px] mx-auto">
                    <motion.div className="h-full bg-gradient-to-r from-pink-500 to-rose-400"
                      initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 2.8, ease: "linear" }} />
                  </div>
                </motion.div>
              ) : (
                <div className="text-center">
                  <p className="text-gray-600 text-xs">انتظر دقيقة من بدء المؤقت</p>
                </div>
              )}

              {/* Timer */}
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
                  {/* Floating glow orbs */}
                  <motion.div className="absolute w-32 h-32 rounded-full bg-pink-500/10 blur-3xl"
                    animate={{ x: [0, 20, 0], y: [0, -15, 0] }} transition={{ duration: 4, repeat: Infinity }} style={{ top: '10%', left: '5%' }} />
                  <motion.div className="absolute w-24 h-24 rounded-full bg-rose-500/10 blur-3xl"
                    animate={{ x: [0, -15, 0], y: [0, 10, 0] }} transition={{ duration: 3.5, repeat: Infinity, delay: 0.5 }} style={{ bottom: '10%', right: '5%' }} />
                  <div className="relative z-10 px-6 pt-6 pb-7 text-center">
                    <div className="inline-flex items-center gap-1.5 bg-pink-900/50 border border-pink-700/40 rounded-full px-3 py-1 mb-4">
                      <Users size={10} className="text-pink-400" />
                      <span className="text-pink-300 text-[11px] font-semibold tracking-wide">{data?.is_backup ? "جلسة احتياطي · إقتراح المنظم" : "جلسة فردية · اختيارك الشخصي"}</span>
                    </div>
                    <motion.p className="text-5xl font-black text-white mb-2 tracking-tight" style={{ textShadow: '0 2px 20px rgba(236,72,153,0.3)' }}
                      initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}>{data?.partner_first_name || "..."}</motion.p>
                    <motion.p className="text-pink-400/50 text-xs mt-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>{data?.is_backup ? "شريكك في جلسة احتياطية" : "شريكك في جلسة الاختيار الشخصي"}</motion.p>
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

              {/* Auto-advance to session indicator */}
              {!rejoined && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="text-center space-y-2">
                  <motion.div className="flex items-center justify-center gap-2 text-pink-400/80 text-sm font-medium"
                    animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.5, repeat: Infinity }}>
                    <Loader2 size={14} className="animate-spin" />
                    <span>جاري التحضير للجلسة...</span>
                  </motion.div>
                  <div className="h-0.5 bg-gray-800/60 rounded-full overflow-hidden max-w-[200px] mx-auto">
                    <motion.div className="h-full bg-gradient-to-r from-pink-500 to-rose-400"
                      initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 4.5, ease: "linear" }} />
                  </div>
                </motion.div>
              )}

              {/* Manual skip for rejoined users */}
              {rejoined && (
                <motion.button
                  onClick={() => setView('session')}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                  className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl border font-bold text-base transition-all bg-pink-900/30 border-pink-700/40 text-pink-300 hover:brightness-125 active:scale-95"
                >
                  انتقل إلى أسئلة الجلسة
                  <ChevronRight size={16} />
                </motion.button>
              )}
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
            token={token}
            reflectionSource="phase2_feedback"
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

            {/* Ice breaker phase — full screen centered */}
            <AnimatePresence mode="wait">
              {!icebreakerDone ? (
                <motion.div key="icebreaker" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full p-5">
                  <RockPaperScissors accent="pink" autoDone={rejoined} onDone={() => setIcebreakerDone(true)} />
                </motion.div>
              ) : (
                <motion.div key="session-content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 max-w-sm mx-auto w-full p-5 space-y-5">
                  {/* Redesigned partner reminder bar */}
                  <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                    className="relative overflow-hidden rounded-2xl border border-pink-700/30 bg-gradient-to-r from-pink-950/40 via-rose-950/30 to-pink-950/20 px-4 py-3">
                    <motion.div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-pink-400/50 to-transparent"
                      animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 3, repeat: Infinity }} />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <motion.div className="w-9 h-9 rounded-xl bg-pink-500/20 border border-pink-500/30 flex items-center justify-center"
                          animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                          <Users size={15} className="text-pink-400" />
                        </motion.div>
                        <div>
                          <p className="text-gray-500 text-[10px] leading-none mb-0.5">شريكك</p>
                          <p className="text-pink-300 font-bold text-sm leading-none">{data?.partner_first_name}</p>
                        </div>
                      </div>
                      {data?.table_number && (
                        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 }}
                          className="flex items-center gap-2">
                          {data?.is_backup && <span className="text-amber-400 text-[10px] font-medium bg-amber-500/10 border border-amber-600/30 rounded-full px-2 py-0.5">احتياطي</span>}
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-600/30">
                            <MapPin size={12} className="text-amber-400" />
                            <span className="text-amber-300 text-xs font-bold">طاولة {data.table_number}</span>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>

                  {/* Live timer strip */}
                  {timerActive && timeLeft > 0 && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                      className="rounded-xl bg-gray-900/80 border border-white/[0.05] overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-gray-500 text-xs flex items-center gap-1.5"><Clock size={10} className="text-pink-400" /> الوقت المتبقي</span>
                        <span className={`font-mono font-black text-lg tabular-nums ${timeLeft < 60 ? 'text-red-400' : 'text-white'}`}>{formatTime(timeLeft)}</span>
                      </div>
                      <div className="h-[2px] bg-gray-800/60">
                        <motion.div className={`h-full ${timeLeft < 60 ? "bg-gradient-to-r from-red-500 to-red-400" : "bg-gradient-to-r from-pink-500 to-rose-400"}`}
                          style={{ boxShadow: timeLeft < 60 ? "0 0 6px rgba(239,68,68,0.6)" : "0 0 6px rgba(236,72,153,0.6)" }}
                          animate={{ width: `${(timeLeft / timerDuration) * 100}%` }} transition={{ duration: 1 }} />
                      </div>
                    </motion.div>
                  )}

                  {/* Time warning banner */}
                  <AnimatePresence>
                    {showTimeWarning && view === 'session' && timeLeft > 0 && timeLeft <= 60 && (
                      <motion.div
                        initial={{ opacity: 0, y: -10, height: 0, scale: 0.95 }} animate={{ opacity: 1, y: 0, height: 'auto', scale: 1 }} exit={{ opacity: 0, y: -10, height: 0, scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-950/90 via-rose-950/80 to-red-950/70 border border-red-500/30 backdrop-blur-md px-4 py-3 flex items-center gap-3"
                        style={{ boxShadow: "0 0 20px rgba(239,68,68,0.15), inset 0 1px 0 rgba(255,255,255,0.05)" }}
                      >
                        <motion.div animate={{ scale: [1, 1.2, 1], rotate: [0, -5, 5, 0] }} transition={{ duration: 1.5, repeat: Infinity }}
                          className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-500/30 to-rose-600/20 border border-red-400/30 flex items-center justify-center shrink-0"
                          style={{ boxShadow: "0 0 12px rgba(239,68,68,0.3)" }}>
                          <Timer size={16} className="text-red-300" />
                        </motion.div>
                        <div className="flex-1 min-w-0">
                          <p className="text-red-200 text-xs font-bold tracking-wide">باقي {timeLeft} ثانية — استعد لإنهاء الجلسة</p>
                          <p className="text-red-400/50 text-[10px] mt-0.5">سيتم نقلك للتقييم تلقائياً عند انتهاء الوقت</p>
                        </div>
                        <button onClick={() => setShowTimeWarning(false)} className="text-red-500/40 hover:text-red-300 transition-colors flex-shrink-0 p-1">
                          <X size={14} />
                        </button>
                        {/* Countdown progress bar */}
                        <motion.div
                          className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-red-500 via-rose-500 to-red-400"
                          style={{ boxShadow: "0 0 6px rgba(239,68,68,0.6)" }}
                          animate={{ width: `${(timeLeft / 60) * 100}%` }}
                          transition={{ duration: 1, ease: "linear" }}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Tips + Questions */}
                  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                    <AnimatePresence>
                      {showSessionTips && <SessionTips onClose={() => setShowSessionTips(false)} accent="pink" />}
                    </AnimatePresence>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
                    <QuestionSlideshow defaultSet="choice" />
                  </motion.div>

                  {/* PromptTopicsModal */}
                  <motion.button onClick={() => setShowPrompt(true)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-full text-sm font-medium bg-gradient-to-r from-purple-600/60 to-pink-600/60 hover:from-purple-600 hover:to-pink-600 text-white transition-all border border-purple-700/30">
                    <MessageSquare size={14} /> أسئلة للنقاش
                  </motion.button>

                  {/* Jump to feedback manually */}
                  <motion.button
                    onClick={() => setView('feedback')}
                    whileTap={{ scale: 0.97 }}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-pink-700/80 to-rose-700/80 hover:from-pink-600 hover:to-rose-600 text-white text-sm font-bold transition-all shadow-lg shadow-pink-900/30 border border-pink-600/30"
                  >
                    <CheckCircle size={16} />
                    انتهيت من الجلسة — انتقل للتقييم
                  </motion.button>

                  {/* Replay tutorial + tips buttons */}
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="flex items-center justify-center gap-4">
                    <button onClick={() => setShowTutorial(true)}
                      className="text-gray-600 hover:text-gray-400 text-[11px] font-medium transition-colors flex items-center gap-1.5">
                      <RefreshCw size={11} />
                      إعادة الشرح
                    </button>
                    <button onClick={() => setShowSessionTips(true)}
                      className="text-gray-600 hover:text-gray-400 text-[11px] font-medium transition-colors flex items-center gap-1.5">
                      <Sparkles size={11} />
                      نصائح سريعة
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <Suspense fallback={null}>
              {showPrompt && <PromptTopicsModal open={showPrompt} onClose={() => setShowPrompt(false)} />}
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Tutorial Overlay ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showTutorial && <OneToOneTutorial onClose={() => { setShowTutorial(false); try { sessionStorage.setItem('e3_tut_phase2', "1") } catch {} }} />}
      </AnimatePresence>

      {/* ── Timer Warning Popup ─────────────────────────────────────── */}
      <AnimatePresence>
        {popup && <TimerWarningPopup {...popup} onDone={clearPopup} />}
      </AnimatePresence>
    </PageWrapper>
  )
}

// ─── Phase 3 Reveal Screen ────────────────────────────────────────────────────
function Phase3RevealScreen({ token, eventId, timerActive, timerStart, timerDuration, correctedNow }: {
  token: string; eventId?: number | string; timerActive: boolean; timerStart: string | null; timerDuration: number; correctedNow?: () => number
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
  const [icebreakerDone, setIcebreakerDone] = useState(false)
  const [showTimeWarning, setShowTimeWarning] = useState(false)
  const { popup, clearPopup } = useTimerWarnings(timerActive, timeLeft, timerDuration, view === 'session')

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
    if (data?.feedback_submitted) setFeedbackDone(true)
  }, [data])

  useEffect(() => {
    if (!timerActive || !timerStart) { setTimeLeft(0); return }
    const update = () => {
      const now = correctedNow ? correctedNow() : Date.now()
      const elapsed = Math.floor((now - new Date(timerStart).getTime()) / 1000)
      setTimeLeft(Math.max(0, timerDuration - elapsed))
    }
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [timerActive, timerStart, timerDuration, correctedNow])

  // Timer warnings handled by useTimerWarnings hook (sound + vibration + popup)
  // 60s banner still shown separately for persistent visual
  useEffect(() => {
    if (timerActive && view === 'session' && timeLeft === 60) setShowTimeWarning(true)
  }, [timeLeft, timerActive, view])

  // Auto-rejoin sync: show the table number before the session when returning
  // Only auto-rejoin if the participant had already clicked "وصلت إلى الطاولة" before refresh
  useEffect(() => {
    if (!data || !timerActive || !timerStart) return
    const now = correctedNow ? correctedNow() : Date.now()
    const elapsed = Math.floor((now - new Date(timerStart).getTime()) / 1000)
    const remaining = Math.max(0, timerDuration - elapsed)
    const arrived = hasArrived(eventId, "phase3")
    if (arrived && elapsed > 60 && remaining > 0) { setTableRevealed(true); setRevealed(false); setView('partner'); setRejoined(true) }
    else if (arrived && remaining <= 0) { setTableRevealed(true); setRevealed(true); setView('feedback') }
    else if (!arrived && remaining <= 0) { setTableRevealed(true); setRevealed(true); setView('feedback') }
  }, [data, timerActive, timerStart, timerDuration, eventId, correctedNow])

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

  // Auto-advance: table animation → partner reveal (skip "I arrived" button)
  useEffect(() => {
    if (!tableRevealed || revealed) return
    if (!canArrive) return
    if (rejoined) return
    const timer = setTimeout(() => {
      setArrived(eventId, "phase3")
      setRevealed(true)
      fireConfetti({ particleCount: 65, spread: 70, origin: { y: 0.4 }, colors: ["#7c3aed", "#8b5cf6", "#a78bfa", "#c4b5fd"] })
    }, 2800)
    return () => clearTimeout(timer)
  }, [tableRevealed, revealed, canArrive, eventId, rejoined])

  // Auto-advance: partner reveal → session questions
  useEffect(() => {
    if (!revealed || view !== 'partner' || rejoined) return
    const timer = setTimeout(() => setView('session'), 4500)
    return () => clearTimeout(timer)
  }, [revealed, view, rejoined])

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
            <motion.div key="table-anim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-4">
              {/* Gorgeous table number animation */}
              <div className="relative flex flex-col items-center justify-center py-10">
                {/* Animated glow rings */}
                <motion.div className="absolute w-52 h-52 rounded-full border-2 border-purple-500/20"
                  animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0, 0.5] }} transition={{ duration: 2, repeat: Infinity }} />
                <motion.div className="absolute w-52 h-52 rounded-full border-2 border-purple-500/10"
                  animate={{ scale: [1, 1.55, 1], opacity: [0.3, 0, 0.3] }} transition={{ duration: 2.5, repeat: Infinity, delay: 0.3 }} />
                {/* Floating particles */}
                <motion.div className="absolute w-3 h-3 rounded-full bg-purple-400/40"
                  animate={{ y: [0, -20, 0], x: [0, 10, 0], opacity: [0, 1, 0] }} transition={{ duration: 3, repeat: Infinity, delay: 0.2 }} style={{ top: '20%', left: '30%' }} />
                <motion.div className="absolute w-2 h-2 rounded-full bg-violet-400/40"
                  animate={{ y: [0, 15, 0], x: [0, -12, 0], opacity: [0, 1, 0] }} transition={{ duration: 2.5, repeat: Infinity, delay: 0.8 }} style={{ top: '30%', right: '25%' }} />
                <motion.div className="absolute w-2.5 h-2.5 rounded-full bg-indigo-400/30"
                  animate={{ y: [0, -15, 0], x: [0, 8, 0], opacity: [0, 1, 0] }} transition={{ duration: 3.5, repeat: Infinity, delay: 1.2 }} style={{ bottom: '25%', left: '35%' }} />

                {/* Table number */}
                <motion.div
                  initial={{ scale: 0.3, opacity: 0, filter: "blur(20px)" }}
                  animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
                  transition={{ type: "spring", stiffness: 200, damping: 18 }}
                  className="relative z-10 text-center"
                >
                  <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 2, repeat: Infinity }}>
                    <MapPin size={28} className="text-purple-400 mx-auto mb-2" />
                  </motion.div>
                  <p className="text-gray-500 text-sm mb-1">توجّه إلى الطاولة رقم</p>
                  <motion.div
                    className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-purple-300 via-violet-400 to-purple-500"
                    animate={{ scale: [1, 1.04, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    style={{ filter: "drop-shadow(0 0 20px rgba(139,92,246,0.3))" }}
                  >
                    {data?.table_number ?? "—"}
                  </motion.div>
                </motion.div>
              </div>

              {/* Auto-advance indicator, manual button for rejoined, or wait timer */}
              {canArrive && rejoined ? (
                <motion.button onClick={handleReveal} whileTap={{ scale: 0.97 }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                  className="w-full bg-gradient-to-br from-purple-600 via-violet-600 to-purple-700 text-white rounded-2xl py-5 font-bold text-lg shadow-2xl shadow-purple-600/40 border border-purple-500/30">
                  <span className="flex items-center justify-center gap-3">
                    <MapPin size={22} /> اكشف شريكك
                  </span>
                </motion.button>
              ) : canArrive ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="text-center space-y-2">
                  <motion.div className="flex items-center justify-center gap-2 text-purple-400 text-sm font-medium"
                    animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.5, repeat: Infinity }}>
                    <Loader2 size={14} className="animate-spin" />
                    <span>جاري الكشف عن شريكك...</span>
                  </motion.div>
                  {/* Progress bar */}
                  <div className="h-0.5 bg-gray-800/60 rounded-full overflow-hidden max-w-[180px] mx-auto">
                    <motion.div className="h-full bg-gradient-to-r from-purple-500 to-violet-400"
                      initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 2.8, ease: "linear" }} />
                  </div>
                </motion.div>
              ) : (
                <div className="text-center">
                  <p className="text-gray-600 text-xs">انتظر دقيقة من بدء المؤقت</p>
                </div>
              )}

              {/* Timer */}
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
                  {/* Floating glow orbs */}
                  <motion.div className="absolute w-32 h-32 rounded-full bg-purple-500/10 blur-3xl"
                    animate={{ x: [0, 20, 0], y: [0, -15, 0] }} transition={{ duration: 4, repeat: Infinity }} style={{ top: '10%', left: '5%' }} />
                  <motion.div className="absolute w-24 h-24 rounded-full bg-violet-500/10 blur-3xl"
                    animate={{ x: [0, -15, 0], y: [0, 10, 0] }} transition={{ duration: 3.5, repeat: Infinity, delay: 0.5 }} style={{ bottom: '10%', right: '5%' }} />
                  <div className="relative z-10 px-6 pt-6 pb-7 text-center">
                    <div className="inline-flex items-center gap-1.5 bg-purple-900/50 border border-purple-700/40 rounded-full px-3 py-1 mb-4">
                      <Brain size={10} className="text-purple-400" />
                      <span className="text-purple-300 text-[11px] font-semibold tracking-wide">جلسة فردية · اختيار النظام</span>
                    </div>
                    <motion.p className="text-5xl font-black text-white mb-2 tracking-tight" style={{ textShadow: '0 2px 20px rgba(139,92,246,0.3)' }}
                      initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}>{data?.partner_first_name || "..."}</motion.p>
                    <motion.p className="text-purple-400/50 text-xs mt-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>شريكك في جلسة اختيار النظام</motion.p>
                  </div>
                </div>
              </motion.div>

              {/* Partner info card */}
              {data && <PartnerInfoCard data={data} accent="purple" />}

              {/* Auto-advance to session indicator */}
              {!rejoined && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="text-center space-y-2">
                  <motion.div className="flex items-center justify-center gap-2 text-purple-400/80 text-sm font-medium"
                    animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.5, repeat: Infinity }}>
                    <Loader2 size={14} className="animate-spin" />
                    <span>جاري التحضير للجلسة...</span>
                  </motion.div>
                  <div className="h-0.5 bg-gray-800/60 rounded-full overflow-hidden max-w-[200px] mx-auto">
                    <motion.div className="h-full bg-gradient-to-r from-purple-500 to-violet-400"
                      initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 4.5, ease: "linear" }} />
                  </div>
                </motion.div>
              )}

              {/* Manual skip for rejoined users */}
              {rejoined && (
                <motion.button
                  onClick={() => setView('session')}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                  className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl border font-bold text-base transition-all bg-purple-900/30 border-purple-700/40 text-purple-300 hover:brightness-125 active:scale-95"
                >
                  انتقل إلى أسئلة الجلسة
                  <ChevronRight size={16} />
                </motion.button>
              )}
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

            {/* Ice breaker phase — full screen centered */}
            <AnimatePresence mode="wait">
              {!icebreakerDone ? (
                <motion.div key="icebreaker" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full p-5">
                  <RockPaperScissors accent="purple" autoDone={rejoined} onDone={() => setIcebreakerDone(true)} />
                </motion.div>
              ) : (
                <motion.div key="session-content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 max-w-sm mx-auto w-full p-5 space-y-5">
                  {/* Redesigned partner reminder bar */}
                  <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                    className="relative overflow-hidden rounded-2xl border border-purple-700/30 bg-gradient-to-r from-purple-950/40 via-violet-950/30 to-purple-950/20 px-4 py-3">
                    <motion.div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-400/50 to-transparent"
                      animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 3, repeat: Infinity }} />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <motion.div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center"
                          animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                          <Brain size={15} className="text-purple-400" />
                        </motion.div>
                        <div>
                          <p className="text-gray-500 text-[10px] leading-none mb-0.5">شريكك</p>
                          <p className="text-purple-300 font-bold text-sm leading-none">{data?.partner_first_name}</p>
                        </div>
                      </div>
                      {data?.table_number && (
                        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 }}
                          className="flex items-center gap-2">
                          {data?.same_as_phase2 && <span className="text-amber-400 text-[10px] font-medium bg-amber-500/10 border border-amber-600/30 rounded-full px-2 py-0.5">مطابقة</span>}
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-600/30">
                            <MapPin size={12} className="text-amber-400" />
                            <span className="text-amber-300 text-xs font-bold">طاولة {data.table_number}</span>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>

                  {/* Live timer strip */}
                  {timerActive && timeLeft > 0 && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                      className="rounded-xl bg-gray-900/80 border border-white/[0.05] overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-gray-500 text-xs flex items-center gap-1.5"><Clock size={10} className="text-purple-400" /> الوقت المتبقي</span>
                        <span className={`font-mono font-black text-lg tabular-nums ${timeLeft < 60 ? 'text-red-400' : 'text-white'}`}>{formatTime(timeLeft)}</span>
                      </div>
                      <div className="h-[2px] bg-gray-800/60">
                        <motion.div className={`h-full ${timeLeft < 60 ? "bg-gradient-to-r from-red-500 to-red-400" : "bg-gradient-to-r from-purple-500 to-violet-400"}`}
                          style={{ boxShadow: timeLeft < 60 ? "0 0 6px rgba(239,68,68,0.6)" : "0 0 6px rgba(139,92,246,0.6)" }}
                          animate={{ width: `${(timeLeft / timerDuration) * 100}%` }} transition={{ duration: 1 }} />
                      </div>
                    </motion.div>
                  )}

                  {/* Time warning banner */}
                  <AnimatePresence>
                    {showTimeWarning && view === 'session' && timeLeft > 0 && timeLeft <= 60 && (
                      <motion.div
                        initial={{ opacity: 0, y: -10, height: 0, scale: 0.95 }} animate={{ opacity: 1, y: 0, height: 'auto', scale: 1 }} exit={{ opacity: 0, y: -10, height: 0, scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-950/90 via-rose-950/80 to-red-950/70 border border-red-500/30 backdrop-blur-md px-4 py-3 flex items-center gap-3"
                        style={{ boxShadow: "0 0 20px rgba(239,68,68,0.15), inset 0 1px 0 rgba(255,255,255,0.05)" }}
                      >
                        <motion.div animate={{ scale: [1, 1.2, 1], rotate: [0, -5, 5, 0] }} transition={{ duration: 1.5, repeat: Infinity }}
                          className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-500/30 to-rose-600/20 border border-red-400/30 flex items-center justify-center shrink-0"
                          style={{ boxShadow: "0 0 12px rgba(239,68,68,0.3)" }}>
                          <Timer size={16} className="text-red-300" />
                        </motion.div>
                        <div className="flex-1 min-w-0">
                          <p className="text-red-200 text-xs font-bold tracking-wide">باقي {timeLeft} ثانية — استعد لإنهاء الجلسة</p>
                          <p className="text-red-400/50 text-[10px] mt-0.5">سيتم نقلك للتقييم تلقائياً عند انتهاء الوقت</p>
                        </div>
                        <button onClick={() => setShowTimeWarning(false)} className="text-red-500/40 hover:text-red-300 transition-colors flex-shrink-0 p-1">
                          <X size={14} />
                        </button>
                        {/* Countdown progress bar */}
                        <motion.div
                          className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-red-500 via-rose-500 to-red-400"
                          style={{ boxShadow: "0 0 6px rgba(239,68,68,0.6)" }}
                          animate={{ width: `${(timeLeft / 60) * 100}%` }}
                          transition={{ duration: 1, ease: "linear" }}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Tips + Questions */}
                  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                    <AnimatePresence>
                      {showSessionTips && <SessionTips onClose={() => setShowSessionTips(false)} accent="purple" />}
                    </AnimatePresence>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
                    <QuestionSlideshow defaultSet="set1" />
                  </motion.div>

                  {/* PromptTopicsModal */}
                  <motion.button onClick={() => setShowPrompt(true)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-full text-sm font-medium bg-gradient-to-r from-purple-600/60 to-pink-600/60 hover:from-purple-600 hover:to-pink-600 text-white transition-all border border-purple-700/30">
                    <MessageSquare size={14} /> أسئلة للنقاش
                  </motion.button>

                  {/* Jump to feedback */}
                  <motion.button
                    onClick={() => setView('feedback')}
                    whileTap={{ scale: 0.97 }}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-purple-700/80 to-violet-700/80 hover:from-purple-600 hover:to-violet-600 text-white text-sm font-bold transition-all shadow-lg shadow-purple-900/30 border border-purple-600/30"
                  >
                    <CheckCircle size={16} />
                    انتهيت من الجلسة — انتقل للتقييم
                  </motion.button>

                  {/* Quick tips button */}
                  <motion.button
                    onClick={() => setShowSessionTips(true)}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
                    className="text-gray-600 hover:text-gray-400 text-[11px] font-medium transition-colors flex items-center gap-1.5 mx-auto"
                  >
                    <Sparkles size={11} />
                    نصائح سريعة
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>

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
            token={token}
            reflectionSource="phase3_feedback"
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

      {/* ── Timer Warning Popup ─────────────────────────────────────── */}
      <AnimatePresence>
        {popup && <TimerWarningPopup {...popup} onDone={clearPopup} />}
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
function BreakScreen({ timerActive, timerStart, timerDuration, correctedNow }: {
  timerActive: boolean; timerStart: string | null; timerDuration: number; correctedNow?: () => number
}) {
  const [timeLeft, setTimeLeft] = useState(0)
  const [showBreakWarning, setShowBreakWarning] = useState(false)
  const { popup, clearPopup } = useTimerWarnings(timerActive, timeLeft, timerDuration)

  useEffect(() => {
    if (!timerActive || !timerStart) { setTimeLeft(0); return }
    const update = () => {
      const now = correctedNow ? correctedNow() : Date.now()
      const elapsed = Math.floor((now - new Date(timerStart).getTime()) / 1000)
      setTimeLeft(Math.max(0, timerDuration - elapsed))
    }
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [timerActive, timerStart, timerDuration, correctedNow])

  // Timer warnings handled by useTimerWarnings hook (sound + vibration + popup)
  // 60s banner still shown separately for persistent visual
  useEffect(() => {
    if (timerActive && timeLeft === 60) setShowBreakWarning(true)
  }, [timeLeft, timerActive])

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

        <h1 className="text-3xl font-bold text-white mb-3">اشحن طاقتك للقاء القادم ☕</h1>
        <p className="text-gray-400 text-sm mb-8">
          الآن وقت القهوة — خذ قهوتك من المقهى واستعد لجولتك الفردية
        </p>

        {timerActive && timeLeft > 0 ? (
          <div className="mb-8">
            <motion.div
              animate={timeLeft <= 60 ? { scale: [1, 1.03, 1] } : {}}
              transition={timeLeft <= 60 ? { duration: 1, repeat: Infinity } : {}}
              className={`text-5xl font-bold font-mono mb-4 ${timeLeft <= 60 ? 'text-amber-400' : 'text-teal-400'}`}
              style={timeLeft <= 60 ? { textShadow: "0 0 20px rgba(251,191,36,0.3)" } : {}}
            >
              {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
            </motion.div>
            <div className="h-2 bg-teal-950/60 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${timeLeft <= 60 ? 'bg-gradient-to-r from-amber-400 to-orange-400' : 'bg-gradient-to-r from-teal-400 to-cyan-400'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <AnimatePresence>
              {showBreakWarning && timeLeft > 0 && timeLeft <= 60 && (
                <motion.div
                  initial={{ opacity: 0, y: -10, height: 0, scale: 0.95 }} animate={{ opacity: 1, y: 0, height: 'auto', scale: 1 }} exit={{ opacity: 0, y: -10, height: 0, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  className="relative overflow-hidden mt-4 rounded-2xl bg-gradient-to-br from-amber-950/90 via-orange-950/80 to-amber-950/70 border border-amber-500/30 backdrop-blur-md px-4 py-3 flex items-center gap-3"
                  style={{ boxShadow: "0 0 20px rgba(251,191,36,0.15), inset 0 1px 0 rgba(255,255,255,0.05)" }}
                >
                  <motion.div animate={{ scale: [1, 1.2, 1], rotate: [0, -5, 5, 0] }} transition={{ duration: 1.5, repeat: Infinity }}
                    className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/30 to-orange-600/20 border border-amber-400/30 flex items-center justify-center shrink-0"
                    style={{ boxShadow: "0 0 12px rgba(251,191,36,0.3)" }}>
                    <Timer size={16} className="text-amber-300" />
                  </motion.div>
                  <div className="flex-1 text-right min-w-0">
                    <p className="text-amber-200 text-xs font-bold tracking-wide">باقي {timeLeft} ثانية — استعد للعودة</p>
                    <p className="text-amber-400/50 text-[10px] mt-0.5">المرحلة التالية ستبدأ قريباً</p>
                  </div>
                  <button onClick={() => setShowBreakWarning(false)} className="text-amber-500/40 hover:text-amber-300 transition-colors flex-shrink-0 p-1">
                    <X size={14} />
                  </button>
                  {/* Countdown progress bar */}
                  <motion.div
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500 via-orange-500 to-amber-400"
                    style={{ boxShadow: "0 0 6px rgba(251,191,36,0.6)" }}
                    animate={{ width: `${(timeLeft / 60) * 100}%` }}
                    transition={{ duration: 1, ease: "linear" }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
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
              <span>ستعرف طاولتك وتتوجه إليها، ثم ستجلس <b className="text-pink-300">لقاء واحد لواحد مع اختيارك</b> لمدة 20 دقيقة. بعدها ستشاركنا انطباعك عن اللقاء.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-teal-400 mt-0.5 shrink-0">٢.</span>
              <span>ثم ستنتقل إلى طاولة جديدة وستجلس <b className="text-purple-300">لقاء واحد لواحد مع اختيارنا</b> لمدة 20 دقيقة. بعدها ستشاركنا انطباعك عن هذا اللقاء أيضًا.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-teal-400 mt-0.5 shrink-0">٣.</span>
              <span>أخيرًا، ستشاهد نتيجتك النهائية وتحليل التوافق لكلا اللقاءين. ✨</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Timer Warning Popup ─────────────────────────────────────── */}
      <AnimatePresence>
        {popup && <TimerWarningPopup {...popup} onDone={clearPopup} />}
      </AnimatePresence>
    </div>
  )
}

// ─── Final Reveal Screen ──────────────────────────────────────────────────────
function RevealCard({ icon, label, name, score, word, revealed, accent }: {
  icon: "heart" | "brain"; label: string; name: string; score: number; word: string | null; revealed: boolean; accent: "pink" | "purple"
}) {
  const Icon = icon === "heart" ? Heart : Brain
  const isPink = accent === "pink"
  return (
    <div className="relative" style={{ perspective: "1000px" }}>
      <motion.div
        animate={{ rotateY: revealed ? 0 : 180 }}
        transition={{ duration: 0.7, type: "spring", stiffness: 120, damping: 18 }}
        style={{ transformStyle: "preserve-3d" }}
        className="relative w-full min-h-[180px]"
      >
        {/* Front — revealed content */}
        <div
          className={`relative overflow-hidden rounded-2xl border shadow-xl h-full flex flex-col items-center justify-center p-5 space-y-2.5 ${isPink ? "border-pink-800/40 shadow-pink-900/20 bg-gradient-to-br from-pink-950/40 to-rose-950/20" : "border-purple-800/40 shadow-purple-900/20 bg-gradient-to-br from-purple-950/40 to-violet-950/20"}`}
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
        >
          <div className={`absolute top-0 inset-x-0 h-px ${isPink ? "bg-gradient-to-r from-transparent via-pink-400/50 to-transparent" : "bg-gradient-to-r from-transparent via-purple-400/50 to-transparent"}`} />
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isPink ? "bg-pink-900/50 border border-pink-700/40" : "bg-purple-900/50 border border-purple-700/40"}`}>
            <Icon size={18} className={isPink ? "text-pink-400" : "text-purple-400"} />
          </div>
          <p className={`text-[10px] font-semibold tracking-wide uppercase ${isPink ? "text-pink-400/70" : "text-purple-400/70"}`}>{label}</p>
          <motion.p className="text-lg sm:text-xl font-black text-white leading-tight truncate w-full text-center" initial={{ scale: 0.5 }} animate={{ scale: revealed ? 1 : 0.5 }} transition={{ delay: 0.4, type: "spring", stiffness: 300 }}>{name}</motion.p>
          <div className="flex items-baseline gap-0.5">
            <span className={`font-black text-lg ${isPink ? "text-pink-300" : "text-purple-300"}`}>{score}</span>
            <span className={isPink ? "text-pink-400/50 text-xs" : "text-purple-400/50 text-xs"}>%</span>
          </div>
          {word && (
            <span className={`text-xs rounded-full px-2.5 py-0.5 ${isPink ? "bg-pink-900/40 text-pink-300 border border-pink-800/40" : "bg-purple-900/40 text-purple-300 border border-purple-800/40"}`}>"{word}"</span>
          )}
        </div>
        {/* Back — hidden */}
        <div
          className="absolute inset-0 rounded-2xl border border-gray-800 bg-gradient-to-br from-gray-900 to-gray-950 flex flex-col items-center justify-center p-5"
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 1.5, repeat: Infinity }} className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center">
            <Sparkles size={18} className="text-gray-600" />
          </motion.div>
          <p className="text-gray-700 text-xs mt-2 font-bold">؟</p>
        </div>
      </motion.div>
    </div>
  )
}

function AiAnalysisCompact({ partnerNum, token, currentEventId, accent, title }: {
  partnerNum: number; token: string; currentEventId: number; accent: "pink" | "purple"; title: string
}) {
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [shown, setShown] = useState(false)
  const isPink = accent === "pink"

  const generate = async () => {
    if (analysis) { setShown(true); return }
    setGenerating(true)
    try {
      const res = await fetch("/api/participant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate-vibe-analysis", secure_token: token, partner_number: partnerNum, event_id: currentEventId })
      })
      const d = await res.json()
      if (d.success) { setAnalysis(d.analysis); setShown(true) }
      else toast.error("حدث خطأ أثناء التحليل")
    } catch { toast.error("تعذّر الاتصال بالخادم") }
    finally { setGenerating(false) }
  }

  if (shown && analysis) {
    return (
      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
        className={`rounded-2xl overflow-hidden border ${isPink ? "border-pink-800/30" : "border-purple-800/30"} bg-gradient-to-br from-gray-900/80 to-gray-950/80`}>
        <div className={`px-4 py-3 border-b flex items-center justify-between ${isPink ? "border-pink-800/30" : "border-purple-800/30"}`}>
          <div className="flex items-center gap-2">
            <Sparkles size={14} className={isPink ? "text-pink-400" : "text-purple-400"} />
            <span className={`font-bold text-xs ${isPink ? "text-pink-300" : "text-purple-300"}`}>التحليل الذكي</span>
          </div>
          <button onClick={() => setShown(false)} className="text-gray-600 hover:text-gray-400 transition-colors"><X size={14} /></button>
        </div>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
          className="text-gray-300 text-xs leading-relaxed whitespace-pre-wrap text-right p-4">{analysis}</motion.p>
      </motion.div>
    )
  }

  return (
    <motion.button onClick={generate} disabled={generating} whileTap={{ scale: 0.97 }}
      className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${isPink ? "bg-pink-950/30 border border-pink-800/40 text-pink-300 hover:bg-pink-950/50" : "bg-purple-950/30 border border-purple-800/40 text-purple-300 hover:bg-purple-950/50"}`}>
      {generating ? (
        <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> جاري التحليل…</>
      ) : (
        <><Sparkles size={13} /> {title}</>
      )}
    </motion.button>
  )
}

function FinalRevealScreen({ token, onQuestionViewerChange }: { token: string; onQuestionViewerChange?: (open: boolean) => void }) {
  const [revealed, setRevealed] = useState(false)
  const [matchPref, setMatchPref] = useState<string | null>(null)
  const [prefSubmitting, setPrefSubmitting] = useState(false)
  const [currentEventId, setCurrentEventId] = useState<number>(1)
  const [activeTab, setActiveTab] = useState<"choice" | "algorithm">("choice")
  const [screenMode, setScreenMode] = useState<"reveal" | "questions">("reveal")
  const [questionPhase, setQuestionPhase] = useState<"phase1" | "phase2">("phase2")
  const revealStarted = useRef(false)

  const fetchFinalReveal = useCallback(async () => {
    const d = await call("e3-get-final-reveal", token)
    if (d.error) throw new Error(d.error)
    return d
  }, [token])

  const { data, loading, error, retry } = useApiPoll(fetchFinalReveal, {
    interval: 5000,
    stopWhen: (d) => Boolean(d.phase2?.partner_number && d.phase3?.partner_number)
  })

  useEffect(() => {
    onQuestionViewerChange?.(screenMode === "questions")
  }, [screenMode, onQuestionViewerChange])

  useEffect(() => () => onQuestionViewerChange?.(false), [onQuestionViewerChange])

  useEffect(() => {
    if (!data) return
    setMatchPref(data.match_preference || null)
    setCurrentEventId(data.current_event_id || 1)
    if (revealStarted.current) return
    revealStarted.current = true
    const timer = setTimeout(() => {
      setRevealed(true)
      fireConfetti({ particleCount: 60, spread: 65, origin: { y: 0.35 }, colors: ["#a855f7", "#ec4899", "#f43f5e", "#fbbf24"] })
    }, 500)
    return () => clearTimeout(timer)
  }, [data])

  const submitPref = async (pref: string) => {
    setPrefSubmitting(true)
    const d = await call("e3-submit-match-preference", token, { preference: pref })
    setPrefSubmitting(false)
    if (!d.error) { setMatchPref(pref); toast.success("تم حفظ تفضيلك") }
    else toast.error("حدث خطأ")
  }

  if (loading) return <PageWrapper className="flex items-center justify-center"><Spinner size={28} /></PageWrapper>
  if (error && !data) return (
    <PageWrapper className="flex flex-col items-center justify-center gap-4 p-6 text-center">
      <AlertTriangle className="text-amber-400" size={30} />
      <div className="space-y-1">
        <p className="text-white font-semibold">النتائج النهائية ليست جاهزة بعد</p>
        <p className="text-gray-500 text-sm">انتظر لحظات ثم حاول مرة أخرى.</p>
      </div>
      <button onClick={retry} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium transition-colors">
        <RefreshCw size={16} /> إعادة المحاولة
      </button>
    </PageWrapper>
  )
  if (!data) return <PageWrapper className="flex items-center justify-center text-gray-500 text-sm">لا توجد نتائج بعد</PageWrapper>

  const p2 = data.phase2, p3 = data.phase3

  if (screenMode === "questions") {
    return (
      <PageWrapper className="overflow-y-auto">
        <div className="mx-auto max-w-md px-3 pb-8 pt-4" dir="rtl">
          <div className="mb-4 rounded-2xl border border-white/[0.07] bg-gray-900/60 p-3">
            <div className="mb-3 text-center">
              <p className="text-xs font-bold text-purple-300">متابعة الحوار</p>
              <h1 className="mt-1 text-xl font-black text-white">أسئلة الجلسات</h1>
              <p className="mt-1 text-xs text-gray-500">للعرض والنقاش فقط — لن يتم حفظ أي إجابات</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setQuestionPhase("phase1")}
                className={`min-h-11 rounded-xl border text-sm font-bold transition-all ${questionPhase === "phase1" ? "border-pink-500/50 bg-pink-500/15 text-pink-200" : "border-white/[0.07] bg-white/[0.03] text-gray-500"}`}
              >
                أسئلة المرحلة الأولى
              </button>
              <button
                onClick={() => setQuestionPhase("phase2")}
                className={`min-h-11 rounded-xl border text-sm font-bold transition-all ${questionPhase === "phase2" ? "border-purple-500/50 bg-purple-500/15 text-purple-200" : "border-white/[0.07] bg-white/[0.03] text-gray-500"}`}
              >
                أسئلة المرحلة الثانية
              </button>
            </div>
          </div>

          <QuestionSlideshow key={`final-${questionPhase}`} defaultSet={questionPhase === "phase1" ? "choice" : "set1"} />

          <nav className="sticky bottom-3 z-20 mt-4 grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-gray-950/90 p-2 shadow-2xl backdrop-blur-xl" aria-label="التنقل بعد الكشف النهائي">
            <a href="/welcome" className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl bg-white/[0.05] text-[11px] font-bold text-gray-300">
              <Home size={17} /> الرئيسية
            </a>
            <a href={`/results?token=${encodeURIComponent(token)}`} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl bg-white/[0.05] text-[11px] font-bold text-amber-200">
              <Trophy size={17} /> النتائج
            </a>
            <button onClick={() => setScreenMode("reveal")} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-[11px] font-black text-white">
              <ChevronRight size={17} /> الكشف النهائي
            </button>
          </nav>
        </div>
      </PageWrapper>
    )
  }

  return (
    <PageWrapper className="overflow-y-auto">
      <div className="max-w-sm mx-auto p-4 pb-8 space-y-4 text-center" dir="rtl">
        {/* Animated title */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 200, damping: 20 }} className="pt-4">
          <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.15, type: "spring", stiffness: 300 }}
            className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shadow-2xl shadow-purple-600/30 mb-3">
            <Trophy size={28} className="text-white" />
          </motion.div>
          <h1 className="text-2xl font-black text-white">الكشف النهائي</h1>
        </motion.div>

        {/* Same match banner */}
        {data.same_match && (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4, type: "spring" }}
            className="bg-gradient-to-r from-amber-900/40 via-yellow-900/30 to-amber-900/40 border border-amber-600/50 rounded-2xl p-4">
            <Trophy size={24} className="text-amber-400 mx-auto mb-1" />
            <p className="text-amber-300 font-black text-base">مطابقة مثالية!</p>
            <p className="text-amber-400/70 text-xs mt-0.5">اخترت والخوارزمية نفس الشخص</p>
          </motion.div>
        )}

        {/* Reveal cards with flip animation */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}>
            <RevealCard icon="heart" label="اختيارك" name={p2?.partner_first_name} score={p2?.compatibility_score} word={p2?.word} revealed={revealed} accent="pink" />
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 }}>
            <RevealCard icon="brain" label="اختيار النظام" name={p3?.partner_first_name} score={p3?.compatibility_score} word={p3?.word} revealed={revealed} accent="purple" />
          </motion.div>
        </div>

        {/* Comparison text */}
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="text-gray-500 text-xs leading-relaxed">
          {data.same_match ? "غريزتك والخوارزمية متوافقتان — نادر الحدوث!" : "رأيت بعينيك، ورأت الخوارزمية بالبيانات — أيهما أصح؟"}
        </motion.p>

        {/* Tabbed compatibility breakdown */}
        {!data.same_match && (p2?.breakdown || p3?.breakdown) && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
            <div className="flex gap-1.5 mb-3">
              <button onClick={() => setActiveTab('choice')} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${activeTab === 'choice' ? 'bg-pink-950/50 border-pink-700/40 text-pink-300' : 'bg-gray-900/40 border-gray-800/40 text-gray-500'}`}>
                <Heart size={12} className="inline ml-1" /> اختيارك
              </button>
              <button onClick={() => setActiveTab('algorithm')} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${activeTab === 'algorithm' ? 'bg-purple-950/50 border-purple-700/40 text-purple-300' : 'bg-gray-900/40 border-gray-800/40 text-gray-500'}`}>
                <Brain size={12} className="inline ml-1" /> اختيار النظام
              </button>
            </div>
            <AnimatePresence mode="wait">
              {activeTab === 'choice' && p2?.breakdown && (
                <motion.div key="choice" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.2 }}>
                  <CompatibilityBreakdown breakdown={p2.breakdown} accent="pink" partnerName={p2?.partner_first_name} />
                </motion.div>
              )}
              {activeTab === 'algorithm' && p3?.breakdown && (
                <motion.div key="algorithm" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }}>
                  <CompatibilityBreakdown breakdown={p3.breakdown} accent="purple" partnerName={p3?.partner_first_name} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* If same match, just show one breakdown */}
        {data.same_match && p2?.breakdown && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
            <CompatibilityBreakdown breakdown={p2.breakdown} accent="pink" partnerName={p2?.partner_first_name} />
          </motion.div>
        )}

        {/* AI Analysis — compact */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }} className="space-y-2">
          {p2?.partner_number && (
            <AiAnalysisCompact partnerNum={p2.partner_number} token={token} currentEventId={currentEventId} accent="pink" title="لماذا توافقتما؟" />
          )}
          {p3?.partner_number && !data.same_match && (
            <AiAnalysisCompact partnerNum={p3.partner_number} token={token} currentEventId={currentEventId} accent="purple" title="لماذا اختارتك الخوارزمية؟" />
          )}
        </motion.div>

        {/* Match preference — simplified */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
          className="rounded-2xl border border-gray-800/60 bg-gray-900/50 p-4 space-y-3">
          <p className="text-gray-300 font-bold text-sm">من تفضّل؟</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => submitPref("choice")} disabled={prefSubmitting || matchPref === "choice"}
              className={`py-2.5 rounded-xl text-xs font-bold transition-all border ${matchPref === "choice" ? "bg-pink-600/30 border-pink-500/50 text-pink-300" : "bg-pink-950/30 border-pink-800/40 text-pink-300 hover:bg-pink-950/50"}`}>
              {matchPref === "choice" ? "✓ " : ""}أفضّل اختياري
            </button>
            <button onClick={() => submitPref("algorithm")} disabled={prefSubmitting || matchPref === "algorithm"}
              className={`py-2.5 rounded-xl text-xs font-bold transition-all border ${matchPref === "algorithm" ? "bg-purple-600/30 border-purple-500/50 text-purple-300" : "bg-purple-950/30 border-purple-800/40 text-purple-300 hover:bg-purple-950/50"}`}>
              {matchPref === "algorithm" ? "✓ " : ""}أفضّل الخوارزمية
            </button>
            <button onClick={() => submitPref("both")} disabled={prefSubmitting || matchPref === "both"}
              className={`py-2.5 rounded-xl text-xs font-bold transition-all border col-span-2 ${matchPref === "both" ? "bg-emerald-600/30 border-emerald-500/50 text-emerald-300" : "bg-gray-800/40 border-gray-700/40 text-gray-300 hover:bg-gray-800/60"}`}>
              {matchPref === "both" ? "✓ " : ""}كلاهما ممتاز
            </button>
          </div>
        </motion.div>

        <motion.button
          onClick={() => setScreenMode("questions")}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.95 }}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-purple-700/40 bg-purple-950/30 text-sm font-bold text-purple-200 transition-all hover:bg-purple-950/50 active:scale-[0.98]"
        >
          <MessageSquare size={17} /> العودة ومتابعة أسئلة الجلسات
        </motion.button>

        {/* Simple home link */}
        <motion.a href="/welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
          className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-300 text-xs transition-colors">
          <Home size={14} /> العودة للصفحة الرئيسية
        </motion.a>
      </div>
    </PageWrapper>
  )
}

// ─── AI Welcome Popup ─────────────────────────────────────────────────────────
function AiWelcomePopup({ token, onDone }: { token: string; onDone: () => void }) {
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [typed, setTyped] = useState("")
  const [typing, setTyping] = useState(false)
  const [done, setDone] = useState(false)
  const [closing, setClosing] = useState(false)
  const [failed, setFailed] = useState(false)
  const [savingImage, setSavingImage] = useState(false)

  useEffect(() => {
    let active = true
    call("e3-ai-welcome", token).then(d => {
      if (!active) return
      if (d.success && d.message) {
        setMessage(d.message)
        setLoading(false)
      } else {
        setFailed(true)
        setLoading(false)
      }
    }).catch(() => { if (active) { setFailed(true); setLoading(false) } })
    return () => { active = false }
  }, [token])

  // Typewriter effect
  useEffect(() => {
    if (!message) return
    setTyped("")
    setTyping(true)
    let i = 0
    const speed = 32
    const iv = setInterval(() => {
      i++
      setTyped(message.slice(0, i))
      if (i >= message.length) {
        clearInterval(iv)
        setTyping(false)
        setDone(true)
        fireConfetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors: ["#a855f7", "#ec4899", "#f0abfc", "#c084fc"] })
      }
    }, speed)
    return () => clearInterval(iv)
  }, [message])

  const dismiss = () => {
    setClosing(true)
    setTimeout(() => onDone(), 400)
  }

  const saveImage = async () => {
    if (!message || savingImage) return
    setSavingImage(true)
    try {
      const blob = await createAiWelcomeImage(message)
      const file = new File([blob], "blindmatch-welcome.png", { type: "image/png" })
      const canShareFile = typeof navigator.share === "function"
        && typeof navigator.canShare === "function"
        && navigator.canShare({ files: [file] })
        && navigator.maxTouchPoints > 0

      if (canShareFile) {
        await navigator.share({ files: [file], title: "رسالتي من التوافق الأعمى" })
      } else {
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = file.name
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      toast.success("تم تجهيز الصورة")
    } catch (error: any) {
      if (error?.name !== "AbortError") toast.error("تعذّر حفظ الصورة — حاول مرة أخرى")
    } finally {
      setSavingImage(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        className="fixed inset-0 z-[290] flex items-center justify-center p-4 overflow-hidden"
        dir="rtl"
      >
        {/* ─── Full-screen animated background ─── */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0414] via-[#15082a] to-[#0a0414]" />
        <div className="absolute inset-0 bg-gradient-to-t from-purple-950/30 via-transparent to-pink-950/20" />

        {/* Animated mesh orbs */}
        <motion.div
          className="absolute top-[10%] right-[5%] w-72 h-72 rounded-full bg-purple-600/20 blur-[100px] pointer-events-none"
          animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0.5, 0.3], x: [0, -30, 0], y: [0, 20, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-[10%] left-[5%] w-64 h-64 rounded-full bg-pink-600/15 blur-[90px] pointer-events-none"
          animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.4, 0.2], x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />
        <motion.div
          className="absolute top-[50%] left-[40%] w-56 h-56 rounded-full bg-fuchsia-600/10 blur-[80px] pointer-events-none"
          animate={{ scale: [1, 1.5, 1], opacity: [0.15, 0.3, 0.15], x: [0, 20, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />

        {/* Floating sparkles */}
        {[...Array(12)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute pointer-events-none"
            style={{ top: `${15 + (i * 7) % 70}%`, left: `${10 + (i * 13) % 80}%` }}
            animate={{
              y: [0, -15, 0],
              opacity: [0, 0.8, 0],
              scale: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 3 + (i % 3),
              repeat: Infinity,
              delay: i * 0.4,
              ease: "easeInOut",
            }}
          >
            <Sparkles size={8 + (i % 3) * 4} className="text-purple-300/40" />
          </motion.div>
        ))}

        {/* ─── Main card ─── */}
        <motion.div
          initial={{ scale: 0.85, y: 50, opacity: 0 }}
          animate={{ scale: closing ? 0.9 : 1, y: closing ? 30 : 0, opacity: closing ? 0 : 1 }}
          transition={{ type: "spring", stiffness: 240, damping: 24 }}
          onClick={e => e.stopPropagation()}
          className="relative w-full max-w-md rounded-[32px] overflow-hidden border border-white/[0.08] shadow-2xl shadow-purple-900/50 z-10"
        >
          {/* Animated gradient border glow */}
          <motion.div
            className="absolute inset-0 rounded-[32px] pointer-events-none"
            style={{
              background: "linear-gradient(135deg, rgba(168,85,247,0.15), rgba(236,72,153,0.1), rgba(168,85,247,0.15))",
            }}
            animate={{ opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* Inner background */}
          <div className="relative bg-gradient-to-b from-gray-900/95 via-[#140a26]/95 to-gray-950/95 backdrop-blur-2xl">

            {/* ─── Brand Header — "التوافق الأعمى يرحب بك" ─── */}
            <div className="relative px-6 pt-8 pb-5 text-center overflow-hidden">
              {/* Shimmer sweep */}
              <motion.div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "linear-gradient(110deg, transparent 30%, rgba(168,85,247,0.08) 50%, transparent 70%)",
                }}
                animate={{ x: ["-100%", "200%"] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", repeatDelay: 2 }}
              />

              {/* Logo mark */}
              <motion.div
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 280, damping: 14 }}
                className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 shadow-xl shadow-purple-600/40 mb-3"
              >
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Sparkles size={26} className="text-white" />
                </motion.div>
              </motion.div>

              {/* Brand name */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <h1 className="text-xl font-black bg-gradient-to-r from-purple-300 via-pink-200 to-purple-300 bg-clip-text text-transparent tracking-tight">
                  التوافق الأعمى
                </h1>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="text-purple-300/50 text-[11px] mt-1 font-medium tracking-widest"
                >
                  يرحّب بك
                </motion.p>
              </motion.div>

              {/* Decorative line */}
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.6, duration: 0.6 }}
                className="mx-auto mt-4 h-px w-32 bg-gradient-to-r from-transparent via-purple-500/40 to-transparent origin-center"
              />
            </div>

            {/* ─── Loading State ─── */}
            {loading && (
              <div className="relative px-8 py-10 flex flex-col items-center gap-5 min-h-[240px] justify-center">
                <motion.div
                  className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-600/30 to-pink-600/30 border border-purple-500/20 flex items-center justify-center"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }}>
                    <Sparkles size={22} className="text-purple-300" />
                  </motion.div>
                </motion.div>
                <div className="text-center space-y-2">
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="text-white font-bold text-sm"
                  >
                    نكتب لك شيئاً خاصاً...
                  </motion.p>
                  <div className="flex items-center justify-center gap-1.5">
                    {[0, 1, 2].map(i => (
                      <motion.div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-purple-400"
                        animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                        transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                      />
                    ))}
                  </div>
                </div>
                {/* Shimmer lines */}
                <div className="w-full space-y-2.5 mt-2">
                  {[0.9, 0.7, 0.5].map((w, i) => (
                    <motion.div
                      key={i}
                      className="h-2.5 rounded-full bg-gradient-to-r from-transparent via-purple-500/15 to-transparent"
                      style={{ width: `${w * 100}%` }}
                      animate={{ opacity: [0.3, 0.6, 0.3] }}
                      transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ─── Failed / Fallback State ─── */}
            {!loading && failed && (
              <div className="relative px-8 py-10 flex flex-col items-center gap-4 min-h-[240px] justify-center">
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 280, damping: 20 }}
                  className="w-14 h-14 rounded-2xl bg-gray-800/80 border border-gray-700/50 flex items-center justify-center"
                >
                  <Sparkles size={24} className="text-gray-500" />
                </motion.div>
                <p className="text-gray-400 text-sm text-center">تعذّر توليد الرسالة، لا بأس — نكمل بدونها!</p>
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={dismiss}
                  className="mt-2 px-8 py-3 rounded-2xl font-bold text-sm bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-600/20"
                >
                  يلا نبدأ ←
                </motion.button>
              </div>
            )}

            {/* ─── Message Display ─── */}
            {!loading && !failed && message && (
              <>
                {/* Message card */}
                <div className="relative px-6 pb-5">
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.5 }}
                    className="relative rounded-2xl bg-white/[0.03] border border-white/[0.06] p-5 overflow-hidden"
                  >
                    {/* Corner glow */}
                    <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-purple-600/10 blur-2xl pointer-events-none" />

                    {/* Message label */}
                    <div className="relative flex items-center gap-2 mb-3">
                      <div className="w-1 h-4 rounded-full bg-gradient-to-b from-purple-400 to-pink-400" />
                      <span className="text-purple-300/70 text-[11px] font-bold tracking-wide">شيء خاص لك</span>
                    </div>

                    {/* Message body with typewriter */}
                    <div className="relative min-h-[120px] flex items-center justify-center">
                      <p className="text-gray-100 text-[15px] leading-[2.2] text-center whitespace-pre-wrap font-medium tracking-wide">
                        {typed}
                        {typing && (
                          <motion.span
                            animate={{ opacity: [1, 0, 1] }}
                            transition={{ duration: 0.6, repeat: Infinity }}
                            className="inline-block w-0.5 h-4 bg-purple-400 mr-0.5 align-middle rounded-full"
                          />
                        )}
                      </p>
                    </div>

                    {/* Subtle footer label */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: done ? 1 : 0 }}
                      transition={{ duration: 0.5 }}
                      className="relative flex items-center justify-center gap-1.5 mt-4 pt-3 border-t border-white/[0.04]"
                    >
                      <Sparkles size={10} className="text-purple-400/50" />
                      <span className="text-purple-300/40 text-[10px] font-medium tracking-wider">كُتب خصيصاً لك بناءً على إجاباتك</span>
                      <Sparkles size={10} className="text-pink-400/50" />
                    </motion.div>
                  </motion.div>
                </div>

                {/* Dismiss button — appears after typing completes */}
                <AnimatePresence>
                  {done && (
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4 }}
                      className="relative px-6 pb-7"
                    >
                      <div className="grid grid-cols-[0.9fr_1.1fr] gap-2.5">
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={saveImage}
                          disabled={savingImage}
                          className="flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm bg-white/[0.055] border border-white/[0.1] text-purple-200 hover:bg-purple-500/10 hover:border-purple-400/30 disabled:opacity-50 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
                        >
                          {savingImage
                            ? <><span className="w-4 h-4 border-2 border-purple-200/30 border-t-purple-200 rounded-full animate-spin" /> جاري الحفظ</>
                            : <><Download size={16} /> حفظ الصورة</>}
                        </motion.button>
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={dismiss}
                          className="py-3.5 rounded-2xl font-bold text-sm bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white transition-all shadow-lg shadow-purple-600/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
                        >
                          يلا نبدأ ←
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>
        </motion.div>

        {/* Tap to dismiss hint */}
        {done && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            transition={{ delay: 1 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 text-gray-500 text-[11px] z-20"
          >
            اضغط في أي مكان للمتابعة
          </motion.p>
        )}
      </motion.div>
    </AnimatePresence>
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
function NotificationModal({ token, notification }: { token: string; notification?: { pending: boolean; notif_id?: string; title?: string; body?: string | null; icon?: string; created_at?: string } }) {
  const [notif, setNotif] = useState<{ notif_id: string; title: string; body: string | null; icon: string; created_at: string } | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (notification?.pending && notification.notif_id && !dismissed.has(notification.notif_id)) {
      setNotif({ notif_id: notification.notif_id, title: notification.title!, body: notification.body ?? null, icon: notification.icon || 'info', created_at: notification.created_at! })
    } else {
      setNotif(null)
    }
  }, [notification, dismissed])

  const dismiss = () => {
    if (!notif) return
    const nid = notif.notif_id
    setClosing(true)
    call("e3-dismiss-notification", token, { notif_id: nid })
    setTimeout(() => {
      setDismissed(prev => new Set(prev).add(nid))
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
function MoodCheckModal({ token, name, moodCheck }: { token: string; name?: string | null; moodCheck?: { pending: boolean; check_id?: string; triggered_at?: string } }) {
  const [pendingCheck, setPendingCheck] = useState<{ check_id: string; triggered_at: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    if (!moodCheck) return
    if (moodCheck.pending && moodCheck.check_id && !dismissed.has(moodCheck.check_id)) {
      // Auto-expire after 5 minutes
      const ageMs = Date.now() - new Date(moodCheck.triggered_at!).getTime()
      if (ageMs > 5 * 60 * 1000) {
        call("e3-submit-mood-check", token, { check_id: moodCheck.check_id, mood: "expired" })
        setDismissed(prev => new Set(prev).add(moodCheck.check_id!))
        setPendingCheck(null)
      } else {
        setPendingCheck({ check_id: moodCheck.check_id, triggered_at: moodCheck.triggered_at! })
      }
    } else {
      setPendingCheck(null)
    }
  }, [moodCheck, dismissed, token])

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
function EventStatusHeader({ eventState, isOffline, correctedNow, impersonating }: {
  eventState: any; isOffline: boolean; correctedNow: () => number; impersonating?: boolean
}) {
  const [now, setNow] = useState(() => correctedNow())
  useEffect(() => {
    const update = () => setNow(correctedNow())
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [correctedNow])

  const phase = eventState?.phase || "setup"
  const labels: Record<string, string> = {
    setup: "الاستعداد", round1: "الجولة الأولى", ranking1: "ترتيب الجولة الأولى",
    round2: "الجولة الثانية", ranking2: "الترتيب النهائي", break: "استراحة",
    phase2_processing: "تجهيز اختيارك", phase2_reveal: "جلسة اختيارك",
    phase3_processing: "تجهيز اختيارنا", phase3_reveal: "جلسة اختيارنا",
    final_reveal: "النتيجة النهائية",
  }
  const progress: Record<string, string> = {
    round1: "1 من 4", ranking1: "1 من 4", round2: "2 من 4", ranking2: "2 من 4",
    phase2_processing: "3 من 4", phase2_reveal: "3 من 4",
    phase3_processing: "4 من 4", phase3_reveal: "4 من 4",
  }
  let remaining: number | null = null
  if (eventState?.timer_active && eventState?.timer_start) {
    const elapsed = Math.floor((now - new Date(eventState.timer_start).getTime()) / 1000)
    remaining = Math.max(0, Number(eventState.timer_duration || 0) - elapsed)
  }
  const table = eventState?.my_assignment?.table
  const topClass = impersonating ? "top-7" : "top-0"

  return (
    <div className={`sticky ${topClass} z-[90] border-b border-white/[0.07] bg-gray-950/90 backdrop-blur-xl px-4 py-2.5`} dir="rtl">
      <div className="max-w-md mx-auto flex items-center gap-3">
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isOffline ? "bg-orange-400 animate-pulse" : "bg-emerald-400"}`} title={isOffline ? "غير متصل" : "متصل"} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-white text-xs font-bold truncate">{labels[phase] || phase}</span>
            {progress[phase] && <span className="text-[10px] text-purple-300 bg-purple-900/30 border border-purple-800/40 rounded-full px-2 py-0.5 whitespace-nowrap">{progress[phase]}</span>}
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5">{isOffline ? "غير متصل — نعرض آخر معلومات محفوظة" : "متصل بالفعالية"}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {table != null && <span className="text-xs font-black text-amber-200 bg-amber-900/25 border border-amber-800/40 rounded-lg px-2.5 py-1.5">طاولة {table}</span>}
          {remaining != null && <span className={`font-mono text-sm font-black tabular-nums ${remaining <= 60 ? "text-red-400" : "text-cyan-300"}`}>{formatTime(remaining)}</span>}
        </div>
      </div>
    </div>
  )
}

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
  const [showAiWelcome, setShowAiWelcome] = useState(false)
  const [enrolled, setEnrolled] = useState<boolean | null>(null)
  const [myInfo, setMyInfo] = useState<{ number: number; name: string; gender: string | null } | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  const [tokenError, setTokenError] = useState(false)
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [finalQuestionsOpen, setFinalQuestionsOpen] = useState(false)
  const aiWelcomeSeenKey = token ? `e3_ai_welcome_seen_${token}` : null

  const fetchState = useCallback(async () => {
    if (!token) throw new Error("No token")
    const d = await call("e3-heartbeat", token)
    if (d.error) {
      if (d.error.includes("Invalid") || d.error.includes("token") || d.error.includes("expired") || d.error.includes("لم يتم العثور") || d.error.includes("غير مسجّل")) {
        setTokenError(true)
        if (!isImpersonating) localStorage.removeItem("blindmatch_result_token")
      }
      throw new Error(d.error)
    }
    setEnrolled(d.enrolled !== false)
    setMyInfo(prev => prev ?? (d.my_info || null))
    return d
  }, [token])

  const { data: eventState, loading: stateLoading, error: stateError, retry: retryState } = useApiPoll(fetchState, {
    interval: 5000,
    enabled: !!token && !tokenError
  })

  // Clock skew correction: offset between server time and local Date.now()
  const clockOffsetRef = useRef(0)
  useEffect(() => {
    if (eventState?.server_time) {
      const serverMs = new Date(eventState.server_time).getTime()
      const localMs = Date.now()
      clockOffsetRef.current = serverMs - localMs
    }
  }, [eventState?.server_time])
  const correctedNow = useCallback(() => Date.now() + clockOffsetRef.current, [])

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
    // Only show AI welcome if not already seen for this token
    if (aiWelcomeSeenKey && localStorage.getItem(aiWelcomeSeenKey) === "1") return
    setShowAiWelcome(true)
  }, [aiWelcomeSeenKey])

  // Lightweight, token-free visual QA for the two mobile question experiences.
  // This is intentionally read-only and does not touch event or participant data.
  const questionPreview = searchParams.get("questionPreview")
  if (questionPreview === "groupReflection") {
    return (
      <main className="min-h-[100dvh] bg-gray-950 text-white" dir="rtl">
        <GroupReflectionSheet
          token={null}
          sourcePhase="phase2_feedback"
          onClose={() => {}}
          previewPeople={[
            { number: 142, first_name: 'سارة', rounds: [1] },
            { number: 318, first_name: 'نورة', rounds: [1, 2] },
            { number: 507, first_name: 'ليان', rounds: [1] },
            { number: 664, first_name: 'ريم', rounds: [2] },
            { number: 831, first_name: 'جود', rounds: [2] },
            { number: 940, first_name: 'لمى', rounds: [2] },
          ]}
        />
      </main>
    )
  }
  if (questionPreview === "phase1" || questionPreview === "phase2") {
    const isPhaseOne = questionPreview === "phase1"
    return (
      <main className="min-h-[100dvh] bg-gray-950 px-3 py-5 text-white" dir="rtl">
        <div className="mx-auto max-w-md">
          <div className="mb-4 flex items-end justify-between gap-3 px-1">
            <div>
              <p className="text-xs font-bold text-purple-300">معاينة الجوال</p>
              <h1 className="mt-1 text-xl font-black">أسئلة المرحلة {isPhaseOne ? "الأولى" : "الثانية"}</h1>
            </div>
            <a
              href={`/event3?questionPreview=${isPhaseOne ? "phase2" : "phase1"}`}
              className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-bold text-gray-300"
            >
              عرض المرحلة {isPhaseOne ? "الثانية" : "الأولى"}
            </a>
          </div>
          <QuestionSlideshow defaultSet={isPhaseOne ? "choice" : "set1"} />
        </div>
      </main>
    )
  }

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
  const timerProps = { timerActive: timer_active, timerStart: timer_start, timerDuration: timer_duration, correctedNow }

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

      {!finalQuestionsOpen && !rankingMatch && <EventStatusHeader eventState={eventState} isOffline={isOffline} correctedNow={correctedNow} impersonating={isImpersonating} />}

      {/* Screen content fills available space */}
      <div className="flex-1 overflow-y-auto relative z-10">
        <AnimatePresence>
          {phase === "setup" && <SetupScreen key="setup" token={token} myInfo={myInfo} enrolledCount={eventState?.participants_selected ?? null} />}
          {isRound && <RoundScreen key={phase} token={token} phase={phase} {...timerProps} myInfo={myInfo} onGroupsOpenChange={setGroupsOpen} />}
          {completedRounds && <RankingScreen key={phase} token={token} completedRounds={completedRounds} currentPhase={phase} {...timerProps} myInfo={myInfo} />}
          {phase === "phase2_reveal" && <Phase2RevealScreen key="p2r" token={token} eventId={eventState?.event_id} {...timerProps} />}
          {phase === "phase3_reveal" && <Phase3RevealScreen key="p3r" token={token} eventId={eventState?.event_id} {...timerProps} />}
          {(phase === "phase2_processing" || phase === "phase3_processing") && <ProcessingScreen key="processing" phase={phase} />}
          {phase === "break" && <BreakScreen key="break" {...timerProps} />}
          {phase === "final_reveal" && <FinalRevealScreen key="final" token={token} onQuestionViewerChange={setFinalQuestionsOpen} />}
        </AnimatePresence>
      </div>

      {/* SOS button — hidden on final reveal, break, ranking pages, and when groups overlay is open */}
      {enrolled && !rankingMatch && phase !== "final_reveal" && phase !== "break" && !groupsOpen && <SOSButton token={token} position="bottom" sosRequests={eventState?.sos_requests} />}

      {/* Mood check popup — receives mood check data from heartbeat */}
      {enrolled && token && !finalQuestionsOpen && <MoodCheckModal token={token} name={myInfo?.name} moodCheck={eventState?.mood_check} />}
      {/* Notification popup — receives notification data from heartbeat */}
      {enrolled && token && !finalQuestionsOpen && <NotificationModal token={token} notification={eventState?.notification} />}

      {/* AI Welcome popup — shows once after welcome screen */}
      {showAiWelcome && token && !finalQuestionsOpen && <AiWelcomePopup token={token} onDone={() => {
        if (aiWelcomeSeenKey) localStorage.setItem(aiWelcomeSeenKey, "1")
        setShowAiWelcome(false)
      }} />}
    </div>
  )
}
