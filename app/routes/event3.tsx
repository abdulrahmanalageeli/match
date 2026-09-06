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
  Clock, MapPin, Brain, ExternalLink, ArrowLeft,
  CheckCircle, Send, RefreshCw, Sparkles, Home, Trophy, Lock, GripVertical,
  MessageSquare, ChevronRight, Users, PenLine, Shuffle, BarChart3, X, Heart, LogOut,
  Frown, Meh, Smile, Layers, Zap,
  Snowflake, Target, Star, AlertTriangle, Lightbulb, PartyPopper, LifeBuoy,
  Eye, EyeOff, KeyRound, Smartphone, Handshake, Timer, Ban, ShieldCheck, Coffee, Bell, Info, Loader2,
  Crown, Medal, Award, Download,
} from "lucide-react"

import { QuestionSlideshow } from "~/components/QuestionSlideshow"
import {
  CURRENT_BALANCED_SCORE_MODEL,
  currentBalancedGroupedDimensionsForDisplay,
} from "~/lib/compatibility-model"
import { clearParticipantBrowserIdentity, getParticipantBrowserToken } from "~/lib/participant-browser-auth.mjs"
import { hasEvent3AdminUriOverride } from "~/lib/event3-admin-uri.mjs"
import {
  EVENT3_CONTACT_MESSAGE_MAX_LENGTH,
  EVENT3_MEMORY_WORD_MAX_LENGTH,
} from "~/lib/event3-contact-sharing.mjs"

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

type Event3Format = "classic" | "choice_only_three_groups"
type Event3GroupRound = 1 | 2 | 3
type GroupReflectionPerson = {
  number: number
  first_name: string
  rounds: number[]
  table_numbers?: number[]
}
type GroupReflectionEntry = {
  member_number: number
  experience: string
  tags: string[]
  organizer_note: string
}
type GroupReflectionGroup = {
  round: Event3GroupRound
  people: GroupReflectionPerson[]
  feedback: GroupReflectionEntry[]
}

const CHOICE_ONLY_EVENT3_FORMAT: Event3Format = "choice_only_three_groups"

function normalizeEvent3Format(...values: unknown[]): Event3Format {
  const firstDefinedFormat = values.find(value => value === "classic" || value === CHOICE_ONLY_EVENT3_FORMAT)
  return firstDefinedFormat === CHOICE_ONLY_EVENT3_FORMAT
    ? CHOICE_ONLY_EVENT3_FORMAT
    : "classic"
}

function isChoiceOnlyEvent3(format: Event3Format) {
  return format === CHOICE_ONLY_EVENT3_FORMAT
}

function event3GroupRoundCount(format: Event3Format) {
  return isChoiceOnlyEvent3(format) ? 3 : 2
}

const EVENT3_GROUP_ORDINALS: Record<Event3GroupRound, string> = {
  1: "الأولى",
  2: "الثانية",
  3: "الثالثة",
}

const GROUP_REFLECTION_EXPERIENCE_LABELS: Record<string, { label: string; style: string }> = {
  great: { label: "ممتاز", style: "border-emerald-400/25 bg-emerald-500/10 text-emerald-300" },
  good: { label: "جيد", style: "border-cyan-400/25 bg-cyan-500/10 text-cyan-300" },
  neutral: { label: "عادي", style: "border-amber-400/25 bg-amber-500/10 text-amber-300" },
  uncomfortable: { label: "غير مريح", style: "border-rose-400/25 bg-rose-500/10 text-rose-300" },
}

function event3GroupLabel(round: Event3GroupRound) {
  return `مجموعة الجولة ${EVENT3_GROUP_ORDINALS[round]}`
}

const BREAK_GROUP_FEEDBACK_PREVIEW: GroupReflectionGroup[] = [
  {
    round: 1,
    people: [
      { number: 142, first_name: "سارة", rounds: [1] },
      { number: 318, first_name: "نورة", rounds: [1] },
      { number: 507, first_name: "ليان", rounds: [1] },
    ],
    feedback: [
      { member_number: 142, experience: "great", tags: ["fun"], organizer_note: "" },
      { member_number: 318, experience: "good", tags: [], organizer_note: "" },
    ],
  },
  {
    round: 2,
    people: [
      { number: 664, first_name: "ريم", rounds: [2] },
      { number: 831, first_name: "جود", rounds: [2] },
      { number: 940, first_name: "لمى", rounds: [2] },
    ],
    feedback: [
      { member_number: 664, experience: "neutral", tags: [], organizer_note: "" },
    ],
  },
  {
    round: 3,
    people: [
      { number: 142, first_name: "سارة", rounds: [3] },
      { number: 275, first_name: "هيا", rounds: [3] },
    ],
    feedback: [],
  },
]

const EVENT3_SESSION_DISCOVERY_ACTIONS = new Set([
  "e3-heartbeat",
  "e3-get-public-format",
  "e3-request-login-otp",
  "e3-verify-login-otp",
])

async function call(action: string, token: string | null, extra: Record<string, any> = {}, sessionRefreshAttempted = false) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const expectedSessionKey = typeof window !== "undefined"
      ? window.sessionStorage.getItem("event3_runtime_session_key")
      : null
    const expectedEventId = typeof window !== "undefined"
      ? window.sessionStorage.getItem("event3_runtime_event_id")
      : null
    const response = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        token,
        impersonate: typeof window !== "undefined" && new URLSearchParams(window.location.search).get("impersonate") === "1",
        admin_override: typeof window !== "undefined" && hasEvent3AdminUriOverride(window.location.search),
        ...(expectedSessionKey ? { expected_event3_session_key: expectedSessionKey } : {}),
        ...(expectedEventId ? { expected_event_id: Number(expectedEventId) } : {}),
        ...extra,
      }),
      signal: controller.signal,
    })
    const contentType = response.headers.get("content-type") || ""
    if (!contentType.includes("application/json")) {
      return {
        error: "تعذّر الاتصال بخدمة الفعالية. حاول مرة أخرى.",
        code: "EVENT3_SERVICE_UNAVAILABLE",
        http_status: response.status,
        retryable: true,
      }
    }
    const data = await response.json().catch(() => null)
    if (!data || typeof data !== "object") {
      return {
        error: "وصل رد غير متوقع. حاول مرة أخرى.",
        code: "EVENT3_SERVICE_UNAVAILABLE",
        http_status: response.status,
        retryable: true,
      }
    }
    if (!response.ok && !data.error) {
      return {
        ...data,
        error: "تعذّر إكمال الطلب. حاول مرة أخرى.",
        code: data.code || "EVENT3_SERVICE_UNAVAILABLE",
        http_status: response.status,
        retryable: data.retryable !== false,
      }
    }
    if (typeof window !== "undefined"
        && data.code === "EVENT3_SESSION_CHANGED"
        && expectedSessionKey
        && EVENT3_SESSION_DISCOVERY_ACTIONS.has(action)
        && !sessionRefreshAttempted) {
      window.sessionStorage.removeItem("event3_runtime_session_key")
      window.sessionStorage.removeItem("event3_runtime_event_id")
      return call(action, token, extra, true)
    }
    if (typeof window !== "undefined" && typeof data.event3_session_key === "string" && data.event3_session_key) {
      window.sessionStorage.setItem("event3_runtime_session_key", data.event3_session_key)
      if (Number.isInteger(Number(data.event_id)) && Number(data.event_id) > 0) {
        window.sessionStorage.setItem("event3_runtime_event_id", String(data.event_id))
      }
    }
    return { ...data, http_status: response.status }
  } catch (error: any) {
    return {
      error: error?.name === "AbortError"
        ? "استغرق الاتصال وقتاً طويلاً. تحقق من الشبكة وحاول مرة أخرى."
        : "تعذّر الاتصال. تحقق من الشبكة وحاول مرة أخرى.",
      code: error?.name === "AbortError" ? "EVENT3_REQUEST_TIMEOUT" : "EVENT3_NETWORK_UNAVAILABLE",
      http_status: 0,
      retryable: true,
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

const EVENT3_ONBOARDING_KEY = "e3_onboarding_event3_v5_0_v1"

function clearStoredParticipantIdentity() {
  if (typeof window === "undefined") return
  try { clearParticipantBrowserIdentity(window.localStorage) } catch {}
}

function clearBrowserSessionArtifacts() {
  if (typeof window === "undefined") return

  // Event 3 OTP login grants the regular participant session, so logging out
  // clears every alias that could restore that full-site identity.
  try {
    clearStoredParticipantIdentity()
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith("e3_")) {
        localStorage.removeItem(key)
      }
    }
  } catch {}
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i)
      if (key?.startsWith("e3_") || key?.startsWith("sos_")) {
        sessionStorage.removeItem(key)
      }
    }
  } catch {}
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
    resetKey?: string | number | null
  } = {}
) {
  const { interval = 5000, maxInterval = 60000, stopWhen, enabled = true, onError, resetKey = null } = options
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null)
  const [activeResetKey, setActiveResetKey] = useState(resetKey)
  const currentInterval = useRef(interval)
  const stopped = useRef(false)
  const requestSequenceRef = useRef(0)
  const latestResetKeyRef = useRef(resetKey)
  latestResetKeyRef.current = resetKey

  // Use refs for callback/option values that may change identity every render
  // (e.g. inline arrow functions) to avoid restarting the polling effect.
  const stopWhenRef = useRef(stopWhen)
  const enabledRef = useRef(enabled)
  const onErrorRef = useRef(onError)
  stopWhenRef.current = stopWhen
  enabledRef.current = enabled
  onErrorRef.current = onError

  // Never expose data from a previous participant while a new token is being
  // resolved. The synchronous return guard protects the first render after a
  // key switch; the effect clears the retained state for following renders.
  const resetKeyChanged = !Object.is(activeResetKey, resetKey)
  useEffect(() => {
    if (!resetKeyChanged) return
    requestSequenceRef.current += 1
    stopped.current = false
    currentInterval.current = interval
    setActiveResetKey(resetKey)
    setData(null)
    setError(null)
    setRetryCount(0)
    setLastSuccessAt(null)
    setLoading(enabled)
  }, [enabled, interval, resetKey, resetKeyChanged])

  const fetchOnce = useCallback(async (isRetry = false) => {
    if (!enabledRef.current) return
    const requestSequence = ++requestSequenceRef.current
    const requestResetKey = resetKey
    const isLatestRequest = () => requestSequence === requestSequenceRef.current
      && Object.is(requestResetKey, latestResetKeyRef.current)
    if (isRetry) setLoading(true)
    try {
      const d = await fetcher()
      if (!isLatestRequest()) return
      setData(d)
      setError(null)
      setLastSuccessAt(Date.now())
      currentInterval.current = interval
      if (stopWhenRef.current && stopWhenRef.current(d)) stopped.current = true
      setRetryCount(0)
    } catch (err: any) {
      if (!isLatestRequest()) return
      const msg = err?.message || "فشل الاتصال"
      setError(msg)
      onErrorRef.current?.(err)
      currentInterval.current = Math.min(currentInterval.current * 1.5, maxInterval)
      setRetryCount(c => c + 1)
    } finally {
      if (isLatestRequest()) setLoading(false)
    }
  }, [fetcher, interval, maxInterval, resetKey])

  useEffect(() => {
    if (!enabled) return
    stopped.current = false
    currentInterval.current = interval
    let timeout: ReturnType<typeof setTimeout> | null = null
    let active = true
    let inFlight = false
    let refreshAfterFlight = false

    const tick = async () => {
      if (!active || document.hidden || stopped.current) return
      if (inFlight) {
        refreshAfterFlight = true
        return
      }
      inFlight = true
      await fetchOnce()
      inFlight = false
      if (!active || stopped.current) return
      if (refreshAfterFlight && !document.hidden) {
        refreshAfterFlight = false
        void tick()
        return
      }
      timeout = setTimeout(tick, currentInterval.current)
    }

    // Let the first request finish before scheduling the next one. Starting a
    // second fixed timer here could overlap slow mobile-network requests and
    // apply stale responses out of order.
    tick()

    const onVisibility = () => {
      if (!document.hidden && !stopped.current) {
        if (timeout) clearTimeout(timeout)
        timeout = null
        void tick()
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

  return {
    data: resetKeyChanged ? null : data,
    loading: resetKeyChanged ? enabled : loading,
    error: resetKeyChanged ? null : error,
    retry,
    retryCount: resetKeyChanged ? 0 : retryCount,
    lastSuccessAt: resetKeyChanged ? null : lastSuccessAt,
  }
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
          className="event3-glass rounded-xl border px-3 py-2 text-center text-xs leading-relaxed text-gray-300"
        >
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function PageWrapper({ children, className = "", embedded = false, ...contentProps }: React.HTMLAttributes<HTMLDivElement> & { embedded?: boolean }) {
  const heightClass = embedded ? "min-h-full" : "min-h-[100dvh]"
  return (
    <MotionConfig reducedMotion="user">
    <div className={`event3-shell relative ${heightClass} overflow-x-hidden`} dir="rtl" lang="ar">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -right-32 -top-44 h-[430px] w-[430px] rounded-full bg-purple-600/[0.16] blur-[110px]" />
        <div className="absolute -bottom-32 -left-28 h-[390px] w-[390px] rounded-full bg-cyan-500/[0.09] blur-[105px]" />
        <div className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-500/[0.055] blur-[95px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,.42)_100%)]" />
      </div>
      <div {...contentProps} className={`relative ${heightClass} ${className}`}>{children}</div>
    </div>
    </MotionConfig>
  )
}

function ParticipantLogoutButton({ onLogout, compact = false, className = "" }: {
  onLogout: () => void
  compact?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onLogout}
      aria-label="تسجيل الخروج"
      title="تسجيل الخروج واستخدام حساب آخر"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.09] bg-black/25 px-3 py-2 text-xs font-bold text-gray-300 shadow-[inset_0_1px_0_rgba(255,255,255,.055)] backdrop-blur-xl transition-colors hover:border-rose-300/25 hover:bg-rose-500/[0.1] hover:text-rose-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/80 ${className}`}
    >
      <LogOut size={15} aria-hidden="true" />
      <span className={compact ? "sr-only" : ""}>تسجيل الخروج</span>
    </button>
  )
}

function GlassCard({ children, className = "", glow = "" }: { children: React.ReactNode; className?: string; glow?: string }) {
  return (
    <div className={`event3-glass rounded-2xl border border-white/[0.09] ${glow} ${className}`}>
      {children}
    </div>
  )
}

type JourneyAccent = "blue" | "amber" | "pink" | "purple" | "emerald"

const JOURNEY_ACCENTS: Record<JourneyAccent, {
  border: string
  wash: string
  pill: string
  text: string
  dot: string
  line: string
}> = {
  blue: {
    border: "border-cyan-400/20",
    wash: "from-cyan-500/[0.12] via-blue-500/[0.06] to-transparent",
    pill: "border-cyan-400/25 bg-cyan-400/10 text-cyan-200",
    text: "text-cyan-200",
    dot: "bg-cyan-300",
    line: "bg-cyan-400/35",
  },
  amber: {
    border: "border-amber-400/20",
    wash: "from-amber-500/[0.12] via-orange-500/[0.06] to-transparent",
    pill: "border-amber-400/25 bg-amber-400/10 text-amber-200",
    text: "text-amber-200",
    dot: "bg-amber-300",
    line: "bg-amber-400/35",
  },
  pink: {
    border: "border-pink-400/20",
    wash: "from-pink-500/[0.13] via-rose-500/[0.06] to-transparent",
    pill: "border-pink-400/25 bg-pink-400/10 text-pink-200",
    text: "text-pink-200",
    dot: "bg-pink-300",
    line: "bg-pink-400/35",
  },
  purple: {
    border: "border-violet-400/20",
    wash: "from-violet-500/[0.13] via-purple-500/[0.06] to-transparent",
    pill: "border-violet-400/25 bg-violet-400/10 text-violet-200",
    text: "text-violet-200",
    dot: "bg-violet-300",
    line: "bg-violet-400/35",
  },
  emerald: {
    border: "border-emerald-400/20",
    wash: "from-emerald-500/[0.12] via-teal-500/[0.06] to-transparent",
    pill: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
    text: "text-emerald-200",
    dot: "bg-emerald-300",
    line: "bg-emerald-400/35",
  },
}

/**
 * A persistent answer to the attendee's two most important questions:
 * "what do I do now?" and "what happens immediately after?". Critical live
 * guidance belongs here rather than in a disappearing hint or a tutorial that
 * has to be reopened from another screen.
 */
function JourneyCue({
  eyebrow = "الآن",
  title,
  description,
  steps,
  currentStep = 0,
  accent = "purple",
  aside,
  className = "",
}: {
  eyebrow?: string
  title: string
  description?: string
  steps: string[]
  currentStep?: number
  accent?: JourneyAccent
  aside?: React.ReactNode
  className?: string
}) {
  const theme = JOURNEY_ACCENTS[accent]
  return (
    <section className={`event3-glass relative overflow-hidden rounded-3xl border p-4 text-right ${theme.border} ${className}`} aria-label={`${eyebrow}: ${title}`}>
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-bl ${theme.wash}`} />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${theme.pill}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${theme.dot}`} />
            {eyebrow}
          </span>
          {aside}
        </div>
        <h2 className="mt-3 text-lg font-black leading-snug text-white">{title}</h2>
        {description && <p className="mt-1 text-xs leading-6 text-gray-300">{description}</p>}

        <ol className="mt-4 grid grid-cols-3 gap-2" aria-label="خطوات هذه المرحلة">
          {steps.map((step, index) => {
            const done = index < currentStep
            const active = index === currentStep
            return (
              <li key={step} className="relative min-w-0 text-center">
                {index > 0 && <span aria-hidden="true" className={`absolute left-1/2 right-[-50%] top-3 h-px ${done || active ? theme.line : "bg-white/[0.08]"}`} />}
                <span className={`relative z-10 mx-auto flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-black ${
                  done ? `${theme.dot} border-transparent text-gray-950` : active ? `${theme.pill} ring-4 ring-black/20` : "border-white/10 bg-gray-950 text-gray-600"
                }`}>
                  {done ? <CheckCircle size={13} /> : index + 1}
                </span>
                <span className={`mt-1.5 block text-[10px] leading-4 ${active ? `${theme.text} font-black` : done ? "font-bold text-gray-300" : "text-gray-600"}`}>{step}</span>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

function MeetingPass({
  accent,
  kind,
  partnerName,
  tableNumber,
  partnerHidden = false,
  badge,
}: {
  accent: "pink" | "purple"
  kind: string
  partnerName?: string | null
  tableNumber?: number | string | null
  partnerHidden?: boolean
  badge?: string | null
}) {
  const pink = accent === "pink"
  const border = pink ? "border-pink-400/25" : "border-violet-400/25"
  const wash = pink ? "from-pink-500/20 via-rose-500/[0.07] to-transparent" : "from-violet-500/20 via-purple-500/[0.07] to-transparent"
  const text = pink ? "text-pink-200" : "text-violet-200"
  const square = pink ? "border-pink-400/25 bg-pink-400/10" : "border-violet-400/25 bg-violet-400/10"
  const Icon = pink ? Heart : Brain

  return (
    <section className={`event3-glass relative overflow-hidden rounded-[1.75rem] border p-5 text-right ${border}`} aria-label={`بطاقة ${kind}`}>
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-bl ${wash}`} />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <span className={`inline-flex items-center gap-2 text-xs font-black ${text}`}><Icon size={14} /> بطاقة اللقاء</span>
          {badge && <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[10px] font-black text-amber-200">{badge}</span>}
        </div>
        <p className="mt-1 text-[11px] text-gray-400">{kind}</p>

        <div className="mt-5 grid grid-cols-[1fr_auto] items-stretch gap-3">
          <div className="flex min-w-0 flex-col justify-center rounded-2xl border border-white/[0.07] bg-black/20 px-4 py-3">
            <span className="text-[10px] font-bold text-gray-500">شريك اللقاء</span>
            {partnerHidden ? (
              <span className="mt-1 text-base font-black text-gray-300">يظهر بعد وصولك</span>
            ) : (
              <span className="mt-1 truncate text-2xl font-black text-white">{partnerName || "جاري التجهيز"}</span>
            )}
          </div>
          <div className={`flex min-w-[5.25rem] flex-col items-center justify-center rounded-2xl border px-3 py-3 ${square}`}>
            <MapPin size={15} className={text} />
            <span className={`mt-1 text-3xl font-black leading-none ${text}`}>{tableNumber ?? "—"}</span>
            <span className="mt-1 text-[10px] font-bold text-gray-400">الطاولة</span>
          </div>
        </div>
      </div>
    </section>
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
  const [displaySeconds, setDisplaySeconds] = useState(seconds)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    const timer = setTimeout(() => onDoneRef.current?.(), 3000)
    const countdown = setInterval(() => setDisplaySeconds(value => Math.max(0, value - 1)), 1000)
    return () => { clearTimeout(timer); clearInterval(countdown) }
  }, [])

  const dismiss = () => onDoneRef.current?.()

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="pointer-events-none fixed inset-x-0 top-[max(5rem,calc(env(safe-area-inset-top)+4rem))] z-[480] flex justify-center px-4"
    >
      <motion.div
        initial={{ scale: 0.7, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.8, y: 20, opacity: 0 }}
        transition={{ type: "spring", stiffness: 350, damping: 22 }}
        className={`pointer-events-auto relative flex w-full max-w-xs flex-col items-center overflow-hidden rounded-3xl border bg-gradient-to-br px-5 py-5 text-center ${t.bg} ${t.border} backdrop-blur-xl`}
        style={{ boxShadow: `0 0 40px ${t.glow}, inset 0 1px 0 rgba(255,255,255,0.06)` }}
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        aria-label={`${label}، ${sublabel || ""}`}
      >
        <button type="button" onClick={dismiss} aria-label="إخفاء التنبيه" className="absolute left-3 top-3 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/20 text-white/70 transition hover:bg-black/30 hover:text-white">
          <X size={17} />
        </button>
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
          {displaySeconds > 60 ? `${Math.floor(displaySeconds / 60)}:${String(displaySeconds % 60).padStart(2, "0")}` : displaySeconds}
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
function useTimerWarnings(
  timerActive: boolean,
  timeLeft: number,
  timerDuration: number,
  enabled = true,
  context?: { oneMinSublabel?: string },
  timerKey?: string | null,
) {
  const [popup, setPopup] = useState<{ seconds: number; label: string; sublabel: string; theme: "red" | "amber" | "teal" } | null>(null)
  const firedRef = useRef<Set<number>>(new Set())
  const hasObservedPositiveTimeRef = useRef(false)
  const previousTimerKeyRef = useRef(timerKey)

  useEffect(() => {
    if (!Object.is(previousTimerKeyRef.current, timerKey)) {
      previousTimerKeyRef.current = timerKey
      firedRef.current.clear()
      hasObservedPositiveTimeRef.current = false
      setPopup(null)
    }
    if (!timerActive || !enabled) return
    const totalMin = Math.floor(timerDuration / 60)

    if (timeLeft > 0) hasObservedPositiveTimeRef.current = true
    if (!hasObservedPositiveTimeRef.current) return

    let warning: 300 | 60 | 10 | null = null
    if (timeLeft > 0 && timeLeft <= 10 && !firedRef.current.has(10)) warning = 10
    else if (timeLeft > 10 && timeLeft <= 60 && !firedRef.current.has(60)) warning = 60
    else if (timeLeft > 60 && timeLeft <= 300 && totalMin > 5 && !firedRef.current.has(300)) warning = 300

    if (timeLeft <= 300 && totalMin > 5) firedRef.current.add(300)
    if (timeLeft <= 60) firedRef.current.add(60)
    if (timeLeft <= 10) firedRef.current.add(10)

    if (warning === 300) {
      vibrate(150); playTimerWarningSound()
      setPopup({ seconds: 300, label: "5 دقائق متبقية", sublabel: "استمتع بالجلسة — الوقت يمر بسرعة", theme: "teal" })
    } else if (warning === 60) {
      vibrate([100, 50, 100]); playTimerWarningSound()
      setPopup({ seconds: 60, label: "دقيقة واحدة متبقية", sublabel: context?.oneMinSublabel ?? "ابدأ بتلخيص حديثك واستعد للنهاية", theme: "amber" })
    } else if (warning === 10) {
      vibrate(200)
      setPopup({ seconds: 10, label: "10 ثوانٍ فقط!", sublabel: "الوقت ينتهي الآن", theme: "red" })
    }

    if (timeLeft <= 0 && !firedRef.current.has(0)) {
      firedRef.current.add(0)
      vibrate([300, 100, 300]); playTimerUrgentSound()
    }
  }, [timeLeft, timerActive, timerDuration, enabled, context?.oneMinSublabel, timerKey])

  // Reset fired set when timer resets
  useEffect(() => {
    if (!timerActive) {
      firedRef.current.clear()
      hasObservedPositiveTimeRef.current = false
      setPopup(null)
    }
  }, [timerActive])

  return { popup, clearPopup: () => setPopup(null) }
}

function useScreenWakeLock(active: boolean) {
  const wakeLockRef = useRef<any>(null)

  useEffect(() => {
    let cancelled = false
    const requestWakeLock = async () => {
      if (!active || document.visibilityState !== "visible" || wakeLockRef.current) return
      try {
        if ("wakeLock" in navigator) {
          const sentinel = await (navigator as any).wakeLock.request("screen")
          if (cancelled) {
            try { await sentinel.release() } catch {}
            return
          }
          wakeLockRef.current = sentinel
          sentinel.addEventListener?.("release", () => { wakeLockRef.current = null })
        }
      } catch {}
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void requestWakeLock()
    }
    void requestWakeLock()
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVisibilityChange)
      const sentinel = wakeLockRef.current
      wakeLockRef.current = null
      if (sentinel) { try { void sentinel.release() } catch {} }
    }
  }, [active])
}

function useModalFocus({
  open,
  overlayRef,
  dialogRef,
  initialFocusRef,
  onEscape,
}: {
  open: boolean
  overlayRef: React.RefObject<HTMLElement | null>
  dialogRef: React.RefObject<HTMLElement | null>
  initialFocusRef?: React.RefObject<HTMLElement | null>
  onEscape?: () => void
}) {
  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    const overlay = overlayRef.current
    const siblings = overlay?.parentElement
      ? Array.from(overlay.parentElement.children).filter(node => node !== overlay) as HTMLElement[]
      : []
    const siblingState = siblings.map(node => ({ node, inert: node.inert, ariaHidden: node.getAttribute("aria-hidden") }))
    siblings.forEach(node => { node.inert = true; node.setAttribute("aria-hidden", "true") })
    document.body.style.overflow = "hidden"

    const focusTimer = window.setTimeout(() => {
      const firstControl = dialogRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      ;(initialFocusRef?.current || firstControl || dialogRef.current)?.focus()
    }, 60)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onEscapeRef.current) {
        event.preventDefault()
        onEscapeRef.current()
        return
      }
      if (event.key !== "Tab") return
      const dialog = dialogRef.current
      const controls = Array.from(dialog?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) || [])
      if (!dialog || !controls.length) {
        event.preventDefault()
        dialog?.focus()
        return
      }
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (!dialog.contains(document.activeElement)) { event.preventDefault(); first.focus() }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = previousOverflow
      siblingState.forEach(({ node, inert, ariaHidden }) => {
        node.inert = inert
        if (ariaHidden == null) node.removeAttribute("aria-hidden")
        else node.setAttribute("aria-hidden", ariaHidden)
      })
      if (opener?.isConnected) opener.focus()
    }
  }, [open, overlayRef, dialogRef, initialFocusRef])
}

function Event3Mark({ size = "hero", className = "" }: { size?: "compact" | "hero"; className?: string }) {
  const dimensions = size === "compact" ? "h-14 w-14" : "h-24 w-24"
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.78, filter: "blur(5px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.62, ease: [0.16, 1, 0.3, 1] }}
      className={`relative mx-auto ${dimensions} ${className}`}
      aria-hidden="true"
    >
      <span className="absolute -inset-4 rounded-full bg-[radial-gradient(circle,rgba(124,58,237,.2),rgba(34,211,238,.06)_38%,transparent_68%)] blur-xl" />
      <span
        className="absolute -inset-1 rounded-full opacity-75"
        style={{
          background: "conic-gradient(from 35deg, transparent 0 18%, rgba(192,132,252,.78) 28%, rgba(96,165,250,.22) 44%, transparent 55% 70%, rgba(34,211,238,.78) 80%, transparent 93%)",
          WebkitMaskImage: "radial-gradient(farthest-side, transparent calc(100% - 1.5px), #000 calc(100% - 1px))",
          maskImage: "radial-gradient(farthest-side, transparent calc(100% - 1.5px), #000 calc(100% - 1px))",
        }}
      />
      <img
        src="/blindmatch-welcome-loading-logo.png"
        alt=""
        width={96}
        height={96}
        decoding="async"
        className="relative h-full w-full object-contain [filter:drop-shadow(0_0_10px_rgba(168,85,247,.34))_drop-shadow(0_0_16px_rgba(34,211,238,.14))]"
      />
    </motion.div>
  )
}

function Brand() {
  return (
    <div className="text-center">
      <Event3Mark size="compact" />
      <div className="mt-2 inline-flex items-center gap-2.5">
        <span className="h-px w-5 bg-gradient-to-l from-purple-300/60 to-transparent" aria-hidden="true" />
        <span className="bg-gradient-to-l from-cyan-100 via-white to-purple-200 bg-clip-text text-sm font-black tracking-wide text-transparent">
          التوافق الأعمى
        </span>
        <span className="h-px w-5 bg-gradient-to-r from-cyan-300/60 to-transparent" aria-hidden="true" />
      </div>
      <div dir="ltr" className="mt-1 text-[7px] font-bold uppercase tracking-[0.3em] text-cyan-100/40">Blind Match · Edition 5.0</div>
    </div>
  )
}

function Spinner({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <motion.div role="status" aria-label="جاري التحميل" className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <span className="absolute -inset-1 rounded-full bg-purple-500/10 blur-md" aria-hidden="true" />
      <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }} className="relative flex items-center justify-center">
        <RefreshCw aria-hidden="true" size={size} strokeWidth={1.7} className={`text-purple-300 [filter:drop-shadow(0_0_7px_rgba(168,85,247,.55))] ${className}`} />
      </motion.span>
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
      className={`event3-glass space-y-3 rounded-[1.35rem] border ${cl.border} bg-gradient-to-br ${cl.bg} p-4`}>
      <p className={`text-xs font-bold ${cl.label} flex items-center gap-1.5`}>
        <Sparkles size={11} /> نبذة عن شريكك
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {traits.map((t: any, i: number) => (
          <div key={i} className="flex items-center gap-2 rounded-xl border border-white/[0.055] bg-black/20 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,.035)]">
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
function CompatibilityBreakdown({ breakdown, scoreRow, accent = "purple", partnerName }: { breakdown: any; scoreRow?: any; accent?: "pink" | "purple"; partnerName?: string }) {
  if (!breakdown) return null

  const percent = (v: number, max: number) => Math.max(0, Math.min(100, Math.round((v / max) * 100)))
  const scoreModelVersion = String(breakdown.scoreModelVersion ?? breakdown.score_model_version ?? "")
  const isBalanced = scoreModelVersion === CURRENT_BALANCED_SCORE_MODEL
  const dimensionSource = scoreRow
    ? { ...scoreRow, score_model_version: scoreModelVersion, score_breakdown: breakdown }
    : breakdown
  const dimensionBars: Record<string, string> = {
    commonGround: "from-purple-500 to-pink-500",
    interaction: "from-violet-500 to-purple-500",
    humor: "from-amber-500 to-orange-500",
    attachment: "from-rose-500 to-pink-500",
    lifestyle: "from-cyan-500 to-blue-500",
    values: "from-emerald-500 to-teal-500",
    communication: "from-indigo-500 to-sky-500",
    intent: "from-fuchsia-500 to-rose-500",
  }
  const allDims = isBalanced
    ? (currentBalancedGroupedDimensionsForDisplay(dimensionSource)
        ?? currentBalancedGroupedDimensionsForDisplay(breakdown)
        ?? []).map(dimension => ({
        ...dimension,
        value: dimension.value ?? 0,
        bar: dimensionBars[dimension.key] ?? "from-purple-500 to-pink-500",
      }))
    : []

  const sorted = [...allDims].sort((a, b) => percent(b.value, b.max) - percent(a.value, a.max))
  const topStrengths = sorted.filter(d => percent(d.value, d.max) >= 65).slice(0, 2)
  const growth = sorted.filter(d => percent(d.value, d.max) < 40).slice(0, 2)
  const storedTotal = Number(breakdown.total)
  const totalPct = Number.isFinite(storedTotal)
    ? Math.max(0, Math.min(100, storedTotal))
    : Math.max(0, Math.min(100, allDims.reduce((sum, dimension) => sum + dimension.value, 0)))

  const accentCl = accent === "pink" ? "text-pink-300" : "text-purple-300"

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
      className="event3-glass overflow-hidden rounded-[1.35rem] border border-purple-300/[0.1]">
      {/* Header */}
      <div className="border-b border-white/[0.065] bg-white/[0.025] px-5 py-4">
        <h4 className={`text-base font-bold flex items-center gap-2 ${accentCl}`}>
          <BarChart3 size={16} /> تحليل التوافق
        </h4>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${isBalanced ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-300" : "border-amber-400/25 bg-amber-500/10 text-amber-300"}`}>
            {isBalanced ? "النموذج المتوازن · 100 نقطة" : "حسبة تاريخية موروثة"}
          </span>
          {scoreModelVersion && <span className="font-mono text-[9px] text-gray-600">{scoreModelVersion}</span>}
        </div>
        <p className="text-gray-500 text-xs mt-0.5">
          هذا التحليل خاص بـ{partnerName ? ` ${partnerName}` : " هذا الشخص"} فقط — يعتمد على بيانات الاستبيان ولا يتأثر بالتقييمات
        </p>
        {!isBalanced && (
          <p className="mt-1 text-[11px] leading-5 text-amber-300/80">
            نعرض المجموع التاريخي فقط لأن تفاصيل الأبعاد لا تتوافق مع النموذج الحالي.
          </p>
        )}
      </div>

      {/* Synergy Overview */}
      <div className="px-5 py-4">
        <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,.035)]">
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

          {isBalanced && (
            <>
              {/* Dimension mini-bars */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3.5">
                {allDims.map((d, i) => (
                  <div key={i} className="rounded-xl border border-white/[0.055] bg-white/[0.025] p-2.5">
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
            </>
          )}
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
  { key: "overview", accent: "purple",  label: "رحلتك الليلة" },
  { key: "ranking",  accent: "amber",   label: "الترتيب" },
  { key: "feedback", accent: "emerald", label: "الخصوصية والنهاية" },
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

const EVENT3_TUTORIAL_FORMATS: Array<{
  value: Event3Format
  label: string
  description: string
}> = [
  {
    value: CHOICE_ONLY_EVENT3_FORMAT,
    label: "نسخة الاختيارات فقط",
    description: "٣ لقاءات من اختيارات متبادلة",
  },
  {
    value: "classic",
    label: "النسخة العادية",
    description: "اختيارك + التوافق الذكي",
  },
]

function Event3TutorialTabs({
  value,
  onChange,
}: {
  value: Event3Format
  onChange: (format: Event3Format) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="اختر نسخة شرح الفعالية"
      className="grid grid-cols-2 gap-1 rounded-2xl border border-white/[0.09] bg-black/25 p-1"
    >
      {EVENT3_TUTORIAL_FORMATS.map((format) => {
        const selected = format.value === value
        const tabId = `event3-${format.value}-tutorial-tab`
        const selectAdjacentTab = (direction: -1 | 1) => {
          const currentIndex = EVENT3_TUTORIAL_FORMATS.findIndex((item) => item.value === format.value)
          const nextIndex = (currentIndex + direction + EVENT3_TUTORIAL_FORMATS.length) % EVENT3_TUTORIAL_FORMATS.length
          const nextFormat = EVENT3_TUTORIAL_FORMATS[nextIndex]
          onChange(nextFormat.value)
          window.requestAnimationFrame(() => {
            document.getElementById(`event3-${nextFormat.value}-tutorial-tab`)?.focus()
          })
        }

        return (
          <button
            key={format.value}
            id={tabId}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls="event3-tutorial-format-panel"
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(format.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault()
                selectAdjacentTab(-1)
              } else if (event.key === "ArrowLeft") {
                event.preventDefault()
                selectAdjacentTab(1)
              } else if (event.key === "Home" || event.key === "End") {
                event.preventDefault()
                const targetFormat = event.key === "Home"
                  ? EVENT3_TUTORIAL_FORMATS[0]
                  : EVENT3_TUTORIAL_FORMATS[EVENT3_TUTORIAL_FORMATS.length - 1]
                onChange(targetFormat.value)
                window.requestAnimationFrame(() => {
                  document.getElementById(`event3-${targetFormat.value}-tutorial-tab`)?.focus()
                })
              }
            }}
            className={`min-h-[4.5rem] rounded-xl px-2 py-2 text-right transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 ${
              selected
                ? "bg-gradient-to-br from-purple-600 to-violet-700 text-white shadow-lg shadow-purple-950/40"
                : "text-gray-400 hover:bg-white/[0.05] hover:text-gray-100"
            }`}
          >
            <span className="block text-xs font-black leading-5">{format.label}</span>
            <span className={`mt-0.5 block text-[9px] font-medium leading-4 ${selected ? "text-white/75" : "text-gray-500"}`}>
              {format.description}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// The animated per-stage content shown inside the "steps" phase of WelcomeScreen.
function WalkSlide({ step, headingRef, eventFormat }: { step: number; headingRef?: React.RefObject<HTMLHeadingElement | null>; eventFormat: Event3Format }) {
  const slide = WALK_SLIDES[step]
  const ac = WALK_ACCENTS[slide.accent]
  const reduceMotion = useReducedMotion()
  const choiceOnly = isChoiceOnlyEvent3(eventFormat)

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
              <h2 ref={headingRef} tabIndex={-1} className="text-white font-black text-xl focus:outline-none">كيف تسير الفعالية؟</h2>
              <p className="text-gray-400 text-xs leading-relaxed">ثلاث محطات واضحة، والشاشة تقودك في كل خطوة</p>
            </div>
            <div className="relative space-y-2.5 before:absolute before:bottom-8 before:right-[1.15rem] before:top-8 before:w-px before:bg-gradient-to-b before:from-purple-500/60 before:via-pink-500/40 before:to-transparent">
              {[
                { Icon: Users, c: "text-blue-300 bg-blue-500/15 border-blue-400/25", t: choiceOnly ? "٣ جولات جماعية" : "جولتان جماعيتان", d: "تتعرّف على وجوه جديدة في مجموعات صغيرة" },
                { Icon: BarChart3, c: "text-amber-300 bg-amber-500/15 border-amber-400/25", t: "ترتيب سري", d: "ترتّب من شعرت براحة أكبر في الحديث معه" },
                { Icon: Heart, c: "text-pink-300 bg-pink-500/15 border-pink-400/25", t: choiceOnly ? "٣ لقاءات فردية" : "لقاءان فرديان", d: "تنتقل للقاءات مختلفة بناءً على الاختيارات المتبادلة" },
              ].map((r, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.09 }}
                  className="relative flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.035] px-3 py-3">
                  <div className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${r.c}`}><r.Icon size={17} /></div>
                  <div className="flex-1 text-right">
                    <p className="text-white font-bold text-[13px]">{r.t}</p>
                    <p className="text-gray-400 text-xs leading-snug">{r.d}</p>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-1.5 rounded-xl border border-purple-400/15 bg-purple-500/[0.07] px-3 py-2 text-[11px] font-semibold text-purple-200">
              <Sparkles size={13} aria-hidden="true" />
              لا تحتاج لحفظ شيء — سنخبرك بما تفعله لحظياً
            </div>
          </div>
        )}

        {/* ── GROUP ROUNDS ── */}
        {slide.key === "groups" && (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <Users size={34} className="text-blue-400 mx-auto" />
              <h2 ref={headingRef} tabIndex={-1} className="text-white font-black text-xl focus:outline-none">الجولات الجماعية</h2>
              <p className="text-gray-400 text-xs leading-relaxed">{choiceOnly ? "ثلاث جولات، في كل جولة مجموعة لا تتجاوز ٦ أشخاص؛ وعند اكتمال ٤٢ مشاركاً تكون هناك ٧ طاولات" : "جولتان تجلس فيهما مع ٤–٦ أشخاص على طاولة للتعارف"}</p>
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
              <p className="text-gray-300 text-xs leading-relaxed">اختاروا معاً لعبة أو أسئلة نقاش تناسب المجموعة. وفي {choiceOnly ? "الجولتين التاليتين" : "الجولة الثانية"} ستنتقل غالباً إلى <span className="text-cyan-300 font-bold">مجموعة جديدة</span>، وقد يتكرر شخص فقط عند الحاجة لتوازن التقسيم.</p>
            </div>
          </div>
        )}

        {/* ── RANKING (the important one) ── */}
        {slide.key === "ranking" && (
          <div className="space-y-3.5">
            <div className="text-center space-y-1">
              <BarChart3 size={32} className="text-amber-400 mx-auto" />
              <h2 ref={headingRef} tabIndex={-1} className="text-white font-black text-xl focus:outline-none">رتّب من قابلت</h2>
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
            <div className="rounded-xl border border-amber-500/25 bg-amber-400/[0.08] px-3 py-3 space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-black text-amber-200"><Heart size={13} fill="currentColor" aria-hidden="true" /> الاختيار متبادل</p>
              <p className="text-xs leading-relaxed text-amber-50/80">
                ترتيب شخص أولاً لا يضمن اللقاء؛ يجب أن يكون الاهتمام متبادلاً. سنبحث دائماً عن أفضل اختيار متاح للطرفين.
              </p>
              {choiceOnly ? (
                <details className="group border-t border-amber-500/20 pt-2">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg py-1 text-[11px] font-bold text-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                    كيف يتم توزيع اللقاءات؟
                    <ChevronRight size={13} className="rotate-90 transition-transform group-open:-rotate-90" aria-hidden="true" />
                  </summary>
                  <p className="pt-2 text-[11px] leading-relaxed text-gray-300">
                    اللقاءان الأول والثاني يعطيان الأولوية لأقوى الرتب المتبادلة، والثالث يختار أفضل توزيع شامل متبقٍ مع شخص مختلف. لا تدخل درجات الشخصية أو العمر أو الجنسية في الاختيار.
                  </p>
                </details>
              ) : null}
            </div>
          </div>
        )}

        {/* ── 1:1 SESSIONS ── */}
        {slide.key === "sessions" && (
          <div className="space-y-3.5">
            <div className="text-center space-y-1">
              <Users size={32} className="text-pink-400 mx-auto" />
              <h2 ref={headingRef} tabIndex={-1} className="text-white font-black text-xl focus:outline-none">{choiceOnly ? "ثلاث جلسات فردية" : "جلستان فرديتان"}</h2>
              <p className="text-gray-400 text-xs leading-relaxed">{choiceOnly ? "ثلاث جلسات 1:1 متبادلة مع ثلاثة أشخاص مختلفين: أول جلستين بأولوية الاختيار الفردي، والثالثة بأفضل توزيع شامل متبقٍ" : "جلستان خاصتان 1:1 — واحدة باختيارك وواحدة باختيار النظام"}</p>
            </div>
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 }}
              className="rounded-2xl border border-pink-700/40 bg-pink-950/30 p-3.5 flex items-center gap-3">
              <Heart size={22} className="text-pink-400 shrink-0" />
              <div><p className="text-white font-bold text-sm">{choiceOnly ? "لقاء الاختيار الأول" : "جلسة اختيارك"}</p><p className="text-pink-200/80 text-xs">{choiceOnly ? "أقوى اختيار متبادل يمكن إكمال الجولة معه" : "أفضل تطابق متبادل من ترتيبك"}</p></div>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.18 }}
              className="rounded-2xl border border-purple-700/40 bg-purple-950/30 p-3.5 flex items-center gap-3">
              {choiceOnly ? <Heart size={22} className="text-purple-400 shrink-0" /> : <Brain size={22} className="text-purple-400 shrink-0" />}
              <div><p className="text-white font-bold text-sm">{choiceOnly ? "لقاء الاختيار الثاني" : "جلسة التوافق الذكي"}</p><p className="text-purple-200/80 text-xs">{choiceOnly ? "لقاء متبادل جديد بعد استبعاد شريك اللقاء الأول" : "النظام يرشّح لك بناءً على بياناتكما"}</p></div>
            </motion.div>
            {choiceOnly && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.28 }}
                className="rounded-2xl border border-violet-700/40 bg-violet-950/30 p-3.5 flex items-center gap-3">
                <Heart size={22} className="text-violet-400 shrink-0" />
                <div><p className="text-white font-bold text-sm">لقاء الاختيار الثالث</p><p className="text-violet-200/80 text-xs">لقاء متبادل مع شخص ثالث بعد استبعاد الشريكين السابقين</p></div>
              </motion.div>
            )}
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
              <ShieldCheck size={32} className="text-emerald-400 mx-auto" />
              <h2 ref={headingRef} tabIndex={-1} className="text-white font-black text-xl focus:outline-none">خصوصيتك أولاً</h2>
              <p className="text-gray-400 text-xs leading-relaxed">ترتيبك وتقييمك لا يراهما أي مشارك آخر</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.09] p-3 text-center">
                <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300"><CheckCircle size={18} /></div>
                <p className="text-xs font-black text-white">نعم من الطرفين</p>
                <p className="mt-1 text-[11px] leading-snug text-emerald-100/65">تظهر وسيلة التواصل لكما فقط</p>
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3 text-center">
                <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] text-gray-400"><EyeOff size={18} /></div>
                <p className="text-xs font-black text-white">أي اختيار آخر</p>
                <p className="mt-1 text-[11px] leading-snug text-gray-400">يبقى قرار كل طرف سرياً تماماً</p>
              </motion.div>
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-purple-500/20 bg-purple-500/[0.07] px-3 py-2.5">
              <Handshake size={15} className="text-purple-300 shrink-0 mt-0.5" />
              <p className="text-purple-100/75 text-xs leading-relaxed">الراحة والاحترام أولاً. يمكنك تجاوز أي سؤال أو اختيار عدم مشاركة التواصل في أي وقت.</p>
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
              <LifeBuoy size={15} className="mt-0.5 shrink-0 text-cyan-300" />
              <p className="text-xs leading-relaxed text-gray-300">تحتاج مساعدة؟ زر <span className="font-bold text-white">المنظم</span> يبقى متاحاً لك طوال الفعالية.</p>
            </div>
          </div>
        )}

        {/* ── FINAL REVEAL + DISCLAIMER ── */}
        {slide.key === "reveal" && (
          <div className="space-y-3.5">
            <div className="text-center space-y-1">
              <Trophy size={32} className="text-violet-400 mx-auto" />
              <h2 ref={headingRef} tabIndex={-1} className="text-white font-black text-xl focus:outline-none">الكشف النهائي</h2>
              <p className="text-gray-400 text-xs leading-relaxed">في النهاية تكتشف نتائجك: {choiceOnly ? "لقاءاتك الفردية الثلاثة" : "اختيارك مقابل اختيار النظام والتوافق الكامل"}</p>
            </div>
            <div className={`grid gap-2.5 ${choiceOnly ? "grid-cols-3" : "grid-cols-2"}`}>
              <div className="rounded-2xl border border-pink-700/40 bg-pink-950/30 p-3 text-center space-y-1">
                <Heart size={18} className="text-pink-400 mx-auto" /><p className="text-white font-bold text-[12px]">{choiceOnly ? "الاختيار الأول" : "اختيارك"}</p>
              </div>
              <div className="rounded-2xl border border-purple-700/40 bg-purple-950/30 p-3 text-center space-y-1">
                {choiceOnly ? <Heart size={18} className="text-purple-400 mx-auto" /> : <Brain size={18} className="text-purple-400 mx-auto" />}<p className="text-white font-bold text-[12px]">{choiceOnly ? "الاختيار الثاني" : "اختيار النظام"}</p>
              </div>
              {choiceOnly && (
                <div className="rounded-2xl border border-violet-700/40 bg-violet-950/30 p-3 text-center space-y-1">
                  <Heart size={18} className="text-violet-400 mx-auto" /><p className="text-white font-bold text-[12px]">الاختيار الثالث</p>
                </div>
              )}
            </div>
            {/* How the final matches were selected. */}
            <div className="rounded-2xl border border-amber-700/40 bg-gradient-to-br from-amber-950/40 to-orange-950/20 px-3.5 py-3 space-y-1.5">
              <p className="text-amber-300 text-xs font-black flex items-center gap-1.5"><Info size={13} /> {choiceOnly ? "كيف اخترنا اللقاءات" : "تنويه مهم عن التوافق"}</p>
              {choiceOnly ? (
                <p className="text-amber-100/80 text-xs leading-relaxed">
                  اللقاءات الثلاثة تُبنى من <span className="text-amber-300 font-bold">ترتيبات المشاركين المتبادلة</span>. الأول والثاني يحافظان على أولوية أقوى الأزواج الفردية الممكنة؛ الثالث يختار أفضل توزيع شامل بعد استبعاد الشريكين السابقين. لا تدخل درجات التوافق أو خوارزمية الشخصية في الاختيار.
                </p>
              ) : (
                <>
                  <p className="text-amber-100/80 text-xs leading-relaxed">
                    الكيمياء بين شخصين جزء كبير لا يمكن قياسه بالكامل. نحن <span className="text-amber-300 font-bold">لا نضمن التوافق</span> — لكننا نقلّل احتمال عدم التوافق بشكل كبير عبر التحليل.
                  </p>
                  <p className="text-gray-300 text-xs leading-relaxed">
                    حتى لو لم تكن النتيجة مثالية، تبقى قد عشت تجربة اختيارك بنفسك — استمتع باللقاء والتجربة أكثر من الرقم.
                  </p>
                </>
              )}
            </div>

            {/* FAQ */}
            <div className="space-y-2">
              <p className="text-violet-300 text-xs font-black flex items-center gap-1.5"><Lightbulb size={13} /> أهم الأسئلة</p>
              {[
                { q: "ماذا لو لم يعجبني أحد؟", a: "الترتيب هنا نسبي لتوزيع الجلسات، وليس موافقة على التواصل. رتّب من شعرت معه براحة أكبر، ويمكنك بعد كل لقاء اختيار عدم مشاركة أي وسيلة تواصل." },
                { q: "هل ترتيبي ظاهر للآخرين؟", a: "لا أبداً — ترتيبك وتقييماتك سرّية تماماً. لا أحد يرى اختياراتك إلا إذا حدث تطابق متبادل بـ«نعم» للتواصل." },
                { q: "هل يمكنني تعديل ترتيبي بعد الإرسال؟", a: "يمكنك الرجوع للتعديل ما دام وقت الترتيب مفتوحاً. عند انتهاء الوقت يُحفظ ترتيبك الحالي ويُقفل." },
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

const WELCOME_BINARY_STREAMS = [
  "01100101 10011010 00110101 11001010 01001101 10110010",
  "10110100 01001011 11100010 00011101 10100110 01101001",
  "00101110 11010001 01010110 10101001 01110010 10001101",
  "11001001 00110110 10010101 01101010 01011001 10100110",
  "01010111 10101000 00111010 11000101 10010011 01101100",
  "10001101 01110010 11001010 00110101 10100100 01011011",
  "00110011 11001100 01001010 10110101 01100110 10011001",
  "11100001 00011110 10101001 01010110 11010010 00101101",
  "01001110 10110001 01100101 10011010 00110100 11001011",
  "10101010 01010101 11000110 00111001 10010100 01101011",
  "00110101 11001010 01011010 10100101 01101100 10010011",
  "11010010 00101101 10000111 01111000 01010101 10101010",
]

function WelcomeScreen({ onDone, onLogout, showLogout, eventFormat }: {
  onDone: () => void
  onLogout?: () => void
  showLogout?: boolean
  eventFormat: Event3Format
}) {
  const [phase, setPhase] = useState<"splash" | "steps">("splash")
  const [step, setStep] = useState(0)
  const [introStage, setIntroStage] = useState<"code" | "brand" | "welcome">("code")
  const reduceMotion = useReducedMotion()
  const splashHeadingRef = useRef<HTMLHeadingElement>(null)
  const walkHeadingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (reduceMotion) {
      setIntroStage("welcome")
      return
    }
    const brandTimer = window.setTimeout(() => setIntroStage("brand"), 1050)
    const welcomeTimer = window.setTimeout(() => setIntroStage("welcome"), 2350)
    return () => {
      window.clearTimeout(brandTimer)
      window.clearTimeout(welcomeTimer)
    }
  }, [reduceMotion])

  useEffect(() => {
    if (reduceMotion || introStage === "welcome") return

    let frameId = 0
    let previousFrame: number | null = null
    let consecutiveSlowFrames = 0

    const resetFrameSample = () => {
      previousFrame = null
      consecutiveSlowFrames = 0
    }

    const watchFramePacing = (timestamp: number) => {
      if (previousFrame !== null && document.visibilityState === "visible") {
        const frameGap = timestamp - previousFrame

        if (frameGap >= 250) {
          setIntroStage("welcome")
          return
        }

        consecutiveSlowFrames = frameGap >= 50 ? consecutiveSlowFrames + 1 : 0
        if (consecutiveSlowFrames >= 4) {
          setIntroStage("welcome")
          return
        }
      }

      previousFrame = timestamp
      frameId = window.requestAnimationFrame(watchFramePacing)
    }

    document.addEventListener("visibilitychange", resetFrameSample)
    frameId = window.requestAnimationFrame(watchFramePacing)

    return () => {
      document.removeEventListener("visibilitychange", resetFrameSample)
      window.cancelAnimationFrame(frameId)
    }
  }, [introStage, reduceMotion])

  useEffect(() => {
    if (introStage !== "welcome") return
    const focusTimer = window.setTimeout(() => {
      const target = phase === "splash" ? splashHeadingRef.current : walkHeadingRef.current
      target?.focus({ preventScroll: true })
    }, reduceMotion ? 0 : 420)
    return () => window.clearTimeout(focusTimer)
  }, [phase, step, reduceMotion, introStage])

  const goNext = () => {
    if (step < WALK_SLIDES.length - 1) {
      setStep(s => s + 1)
    } else {
      onDone()
      if (!reduceMotion) fireConfetti({ particleCount: 90, spread: 75, origin: { y: 0.5 }, colors: ["#a855f7","#ec4899","#f43f5e","#fbbf24"] })
    }
  }
  const goPrev = () => { if (step > 0) setStep(s => s - 1) }

  const openResults = () => {
    const storedToken = localStorage.getItem("blindmatch_result_token")
    window.location.href = storedToken ? `/results?token=${storedToken}` : "/results"
  }

  const journeyStats = isChoiceOnlyEvent3(eventFormat)
    ? [
        { value: "٣", label: "جولات جماعية", Icon: Users, tone: "text-blue-300 bg-blue-400/10 border-blue-300/15" },
        { value: "٣", label: "لقاءات فردية", Icon: Heart, tone: "text-pink-300 bg-pink-400/10 border-pink-300/15" },
        { value: "١٠٠٪", label: "اختيارات سرية", Icon: ShieldCheck, tone: "text-emerald-300 bg-emerald-400/10 border-emerald-300/15" },
      ]
    : [
        { value: "٢", label: "جولات جماعية", Icon: Users, tone: "text-blue-300 bg-blue-400/10 border-blue-300/15" },
        { value: "٢", label: "لقاءات فردية", Icon: Heart, tone: "text-pink-300 bg-pink-400/10 border-pink-300/15" },
        { value: "١٠٠٪", label: "اختيارات سرية", Icon: ShieldCheck, tone: "text-emerald-300 bg-emerald-400/10 border-emerald-300/15" },
      ]

  return (
    <MotionConfig reducedMotion="user">
    <div className="event3-shell relative flex h-[100dvh] flex-col overflow-hidden bg-[#06040b]" dir="rtl" lang="ar">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 opacity-[0.035]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.7) 1px, transparent 1px)", backgroundSize: "38px 38px", maskImage: "linear-gradient(to bottom, black, transparent 72%)" }} />
        <div className="absolute -right-32 -top-44 h-[540px] w-[540px] rounded-full bg-purple-600/25 blur-[120px]" />
        <div className="absolute -bottom-56 -left-32 h-[520px] w-[520px] rounded-full bg-fuchsia-600/15 blur-[120px]" />
        <div className="absolute left-1/2 top-[42%] h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-500/[0.08] blur-[100px]" />
        <motion.div
          initial={{ opacity: 0, scale: 0.55 }}
          animate={{ opacity: reduceMotion ? 0.14 : [0, 0.28, 0.14], scale: reduceMotion ? 1 : [0.55, 1.08, 1] }}
          transition={{ duration: 1.35, ease: [0.22, 1, 0.36, 1] }}
          className="absolute left-1/2 top-[5%] h-72 w-72 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(168,85,247,.55)_0%,rgba(59,130,246,.18)_38%,transparent_72%)] blur-2xl"
        />
      </div>

      <AnimatePresence>
        {phase === "splash" && introStage !== "welcome" && (
          <motion.section
            key="binary-intro"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.035, filter: "blur(10px)" }}
            transition={{ duration: 0.58, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 z-50 overflow-hidden bg-[#03030a]"
            aria-label="عرض افتتاحي للتوافق الأعمى"
          >
            <div className="pointer-events-none absolute inset-0" aria-hidden="true">
              <motion.div
                animate={{ opacity: introStage === "brand" ? 0.72 : 0.38, scale: introStage === "brand" ? 1.05 : 0.8 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="absolute left-1/2 top-1/2 h-[26rem] w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(124,58,237,.32)_0%,rgba(6,182,212,.12)_38%,transparent_70%)] blur-2xl"
              />
              <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(168,85,247,.03)_1px,transparent_1px)] bg-[size:32px_32px]" />
              {WELCOME_BINARY_STREAMS.map((stream, index) => {
                const columnLeft = 4 + index * 8.35
                const color = index % 3 === 0 ? "text-purple-300" : index % 3 === 1 ? "text-cyan-300" : "text-blue-300"
                return (
                  <motion.span
                    key={stream}
                    initial={{ opacity: 0, y: index % 2 === 0 ? "-18vh" : "18vh", left: `${columnLeft}%` }}
                    animate={introStage === "code"
                      ? { opacity: [0, 0.7, 0.34], y: index % 2 === 0 ? ["-18vh", "8vh"] : ["18vh", "-8vh"], left: `${columnLeft}%` }
                      : { opacity: 0, y: 0, left: "50%", scaleY: 0.08, filter: "blur(5px)" }}
                    transition={introStage === "code"
                      ? { duration: 1.2 + (index % 4) * 0.14, delay: index * 0.035, ease: "easeOut" }
                      : { duration: 0.72, delay: Math.abs(5.5 - index) * 0.025, ease: [0.22, 1, 0.36, 1] }}
                    className={`absolute -top-20 h-[130vh] whitespace-pre-wrap font-mono text-[9px] font-bold leading-[1.85] tracking-[0.2em] ${color}`}
                    style={{ writingMode: "vertical-rl", textOrientation: "upright", direction: "ltr" }}
                  >
                    {stream}
                  </motion.span>
                )
              })}
              <motion.div
                initial={{ y: "-15vh", opacity: 0 }}
                animate={introStage === "code" ? { y: "115vh", opacity: [0, 0.7, 0] } : { opacity: 0 }}
                transition={{ duration: 1.35, ease: "linear" }}
                className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/80 to-transparent shadow-[0_0_18px_3px_rgba(34,211,238,.3)]"
              />
            </div>

            <button
              type="button"
              onClick={() => setIntroStage("welcome")}
              className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-20 min-h-11 rounded-full px-3 text-[10px] font-bold tracking-wide text-white/40 transition-colors hover:text-white/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              تخطّي
            </button>

            <AnimatePresence>
              {introStage === "brand" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.82, filter: "blur(14px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 1.2, filter: "blur(8px)" }}
                  transition={{ duration: 0.72, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
                >
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    className="mb-5 h-px w-32 bg-gradient-to-r from-transparent via-cyan-200/80 to-transparent shadow-[0_0_14px_rgba(34,211,238,.45)]"
                    aria-hidden="true"
                  />
                  <motion.h1
                    initial={{ letterSpacing: "0.18em" }}
                    animate={{ letterSpacing: "0.035em" }}
                    transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                    className="bg-gradient-to-l from-cyan-100 via-white to-purple-200 bg-clip-text text-4xl font-black leading-tight text-transparent [text-shadow:0_0_34px_rgba(168,85,247,.34)] sm:text-5xl"
                  >
                    التوافق الأعمى
                  </motion.h1>
                  <motion.p
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 0.55, y: 0 }}
                    transition={{ delay: 0.28, duration: 0.4 }}
                    dir="ltr"
                    className="mt-3 font-mono text-[9px] font-bold uppercase tracking-[0.42em] text-cyan-100"
                  >
                    Connection beyond the surface
                  </motion.p>
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    className="mt-5 h-px w-32 bg-gradient-to-r from-transparent via-purple-200/80 to-transparent shadow-[0_0_14px_rgba(192,132,252,.4)]"
                    aria-hidden="true"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <div className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 h-px w-24 -translate-x-1/2 overflow-hidden bg-white/10" aria-hidden="true">
              <motion.span
                initial={{ scaleX: 0 }}
                animate={{ scaleX: introStage === "brand" ? 1 : 0.46 }}
                transition={{ duration: introStage === "brand" ? 1.15 : 1.05, ease: "easeOut" }}
                className="block h-full origin-left bg-gradient-to-r from-purple-400 to-cyan-300 shadow-[0_0_10px_rgba(34,211,238,.55)]"
              />
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {phase === "splash" && introStage === "welcome" && (
          <motion.div
            key="splash"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35 }}
            className={`event3-scroll relative z-10 flex min-h-0 flex-1 flex-col items-center overflow-y-auto overscroll-contain px-5 pb-[max(1rem,env(safe-area-inset-bottom))] text-center ${showLogout ? "pt-[max(4.25rem,env(safe-area-inset-top))]" : "pt-[max(1rem,env(safe-area-inset-top))]"}`}
            style={{ justifyContent: "safe center" }}
          >
            {showLogout && onLogout && (
              <ParticipantLogoutButton
                onLogout={onLogout}
                className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))]"
              />
            )}
            <div className="flex w-full max-w-sm flex-col items-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.52, y: 14, filter: "blur(10px)" }}
                animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
                transition={reduceMotion ? { duration: 0.2 } : { duration: 0.72, ease: [0.16, 1, 0.3, 1] }}
                className="relative h-[6.15rem] w-[6.15rem] sm:h-[6.6rem] sm:w-[6.6rem]"
              >
                <motion.div
                  animate={reduceMotion ? undefined : { y: [0, -3, 0] }}
                  transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
                  className="relative flex h-full w-full items-center justify-center"
                >
                  <motion.span
                    className="absolute -inset-3 rounded-full"
                    style={{
                      background: "conic-gradient(from 45deg, transparent 0 18%, rgba(192,132,252,.85) 28%, rgba(96,165,250,.25) 43%, transparent 54% 69%, rgba(34,211,238,.9) 79%, transparent 92%)",
                      WebkitMaskImage: "radial-gradient(farthest-side, transparent calc(100% - 1.5px), #000 calc(100% - 1px))",
                      maskImage: "radial-gradient(farthest-side, transparent calc(100% - 1.5px), #000 calc(100% - 1px))",
                    }}
                    initial={{ opacity: 0, rotate: -70, scale: 0.7 }}
                    animate={reduceMotion ? { opacity: 0.55, rotate: 0, scale: 1 } : { opacity: 0.72, rotate: 360, scale: 1 }}
                    transition={reduceMotion ? { duration: 0.2 } : { opacity: { duration: 0.6, delay: 0.18 }, scale: { duration: 0.7, ease: [0.16, 1, 0.3, 1] }, rotate: { duration: 11, repeat: Infinity, ease: "linear" } }}
                    aria-hidden="true"
                  />
                  <motion.span
                    className="absolute inset-1 rounded-full border border-cyan-100/15"
                    animate={reduceMotion ? { opacity: 0.24 } : { scale: [0.92, 1.12, 0.92], opacity: [0, 0.42, 0] }}
                    transition={{ duration: 3.4, repeat: Infinity, ease: "easeOut", delay: 1 }}
                    aria-hidden="true"
                  />
                  <motion.span
                    className="absolute inset-4 rounded-full bg-gradient-to-br from-purple-500/70 via-blue-500/45 to-cyan-400/60 blur-xl"
                    animate={reduceMotion ? { opacity: 0.5 } : { scale: [0.82, 1.15, 0.86], opacity: [0.42, 0.82, 0.46] }}
                    transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
                    aria-hidden="true"
                  />
                  <motion.span
                    className="absolute -right-0.5 top-3 h-1.5 w-1.5 rounded-full bg-cyan-100 shadow-[0_0_12px_3px_rgba(34,211,238,.65)]"
                    animate={reduceMotion ? { opacity: 0.45 } : { opacity: [0, 1, 0], scale: [0.4, 1.1, 0.4], y: [3, -4, -8] }}
                    transition={{ duration: 2.8, repeat: Infinity, repeatDelay: 1.1, ease: "easeOut", delay: 0.9 }}
                    aria-hidden="true"
                  />
                  <motion.span
                    className="absolute -left-1 bottom-5 h-1 w-1 rounded-full bg-purple-100 shadow-[0_0_10px_3px_rgba(192,132,252,.55)]"
                    animate={reduceMotion ? { opacity: 0.38 } : { opacity: [0, 0.9, 0], scale: [0.5, 1.2, 0.5], y: [2, -5, -9] }}
                    transition={{ duration: 3.2, repeat: Infinity, repeatDelay: 1.4, ease: "easeOut", delay: 1.6 }}
                    aria-hidden="true"
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.76, filter: "brightness(1.5) blur(3px)" }}
                    animate={{ opacity: 1, scale: 1, filter: "brightness(1.08) blur(0px)" }}
                    transition={reduceMotion ? { duration: 0.15 } : { duration: 0.68, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
                    className="relative h-full w-full"
                  >
                    <img
                      src="/blindmatch-welcome-loading-logo.png"
                      alt=""
                      width={106}
                      height={106}
                      decoding="async"
                      aria-hidden="true"
                      className="h-full w-full object-contain [filter:drop-shadow(0_0_10px_rgba(168,85,247,.4))_drop-shadow(0_0_16px_rgba(34,211,238,.18))]"
                    />
                  </motion.div>
                </motion.div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduceMotion ? 0 : 0.36, duration: 0.46, ease: [0.22, 1, 0.36, 1] }}
                className="mb-4 mt-6 flex flex-col items-center"
              >
                <div className="flex items-center gap-3">
                  <motion.span
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    transition={{ delay: reduceMotion ? 0 : 0.48, duration: 0.42 }}
                    className="h-px w-7 origin-right bg-gradient-to-l from-purple-300/70 to-transparent"
                    aria-hidden="true"
                  />
                  <span className="bg-gradient-to-l from-cyan-100 via-white to-purple-100 bg-clip-text text-[15px] font-black tracking-[0.035em] text-transparent [text-shadow:0_0_20px_rgba(192,132,252,.28)] sm:text-base">
                    التوافق الأعمى
                  </span>
                  <motion.span
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    transition={{ delay: reduceMotion ? 0 : 0.48, duration: 0.42 }}
                    className="h-px w-7 origin-left bg-gradient-to-r from-cyan-300/70 to-transparent"
                    aria-hidden="true"
                  />
                </div>
                <span dir="ltr" className="mt-1.5 text-[8px] font-extrabold uppercase tracking-[0.34em] text-cyan-100/45">
                  Blind Match <span className="text-purple-200/60">·</span> Edition 5.0
                </span>
              </motion.div>

              <motion.h1 ref={splashHeadingRef} tabIndex={-1} initial={{ opacity: 0, y: 16, filter: "blur(5px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ delay: reduceMotion ? 0 : 0.43, duration: 0.52, ease: [0.22, 1, 0.36, 1] }} className="text-[1.85rem] font-black leading-[1.15] text-white focus:outline-none sm:text-[2.1rem]">
                جاهز لرحلتك
                <span className="block bg-gradient-to-l from-purple-300 via-fuchsia-300 to-pink-300 bg-clip-text text-transparent">الليلة؟</span>
              </motion.h1>
              <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : 0.5, duration: 0.42 }} className="mx-auto mt-2 max-w-[290px] text-[13px] font-medium leading-6 text-gray-400">
                لقاءات حقيقية تقودها اختيارات متبادلة — بخطوات واضحة وخصوصية كاملة.
              </motion.p>

              <motion.div initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: reduceMotion ? 0 : 0.58, duration: 0.46, ease: [0.22, 1, 0.36, 1] }} className="relative mt-5 w-full overflow-hidden rounded-[1.65rem] border border-white/[0.1] bg-[linear-gradient(145deg,rgba(255,255,255,.075),rgba(255,255,255,.018))] p-px shadow-[0_24px_70px_-44px_rgba(139,92,246,.85),inset_0_1px_0_rgba(255,255,255,.08)]">
                <span className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-purple-200/55 to-transparent" aria-hidden="true" />
                <div className="relative grid grid-cols-3 overflow-hidden rounded-[calc(1.65rem-1px)] bg-[#0d0a16]/85 px-1 py-2.5">
                  <span className="pointer-events-none absolute -right-10 -top-14 h-28 w-28 rounded-full bg-blue-500/[0.08] blur-2xl" aria-hidden="true" />
                  <span className="pointer-events-none absolute -left-10 -bottom-14 h-28 w-28 rounded-full bg-fuchsia-500/[0.07] blur-2xl" aria-hidden="true" />
                  {journeyStats.map(({ value, label, Icon, tone }, index) => (
                    <motion.div key={label} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : 0.66 + index * 0.055, duration: 0.32 }} className={`relative flex min-w-0 flex-col items-center px-1 py-1.5 ${index > 0 ? "border-r border-white/[0.055]" : ""}`}>
                      <div className={`relative mb-2 flex h-8 w-8 items-center justify-center rounded-[0.7rem] border shadow-[inset_0_1px_0_rgba(255,255,255,.09),0_8px_20px_-12px_currentColor] ${tone}`}>
                        <Icon size={14} strokeWidth={1.8} />
                      </div>
                      <span className="bg-gradient-to-b from-white to-white/75 bg-clip-text text-[15px] font-black leading-none text-transparent">{value}</span>
                      <span className="mt-1.5 text-[9px] font-bold leading-3 text-gray-400">{label}</span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : 0.75, duration: 0.48, ease: [0.22, 1, 0.36, 1] }} className="mt-3.5 w-full space-y-2.5">
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={onDone}
                className="group relative isolate min-h-[4.65rem] w-full overflow-hidden rounded-[1.45rem] bg-[linear-gradient(108deg,#4c1d95_0%,#7e22ce_46%,#c026d3_100%)] px-3.5 py-3 text-right text-white shadow-[0_22px_48px_-24px_rgba(168,85,247,.82)] transition-[filter,transform] hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-200"
              >
                <span className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full bg-white/[0.13] blur-2xl" aria-hidden="true" />
                <motion.span initial={{ x: "-125%" }} animate={{ x: reduceMotion ? "-125%" : "150%" }} transition={{ delay: 1.15, duration: 0.95, ease: "easeInOut" }} className="pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/[0.16] to-transparent" aria-hidden="true" />
                <span className="relative flex items-center justify-between gap-2.5">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.85rem] border border-white/[0.14] bg-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,.16)]"><Smartphone size={18} strokeWidth={1.9} /></span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-black leading-5 sm:text-base">{showLogout ? "متابعة الفعالية" : "الدخول برقم الجوال"}</span>
                      <span className="mt-0.5 block text-[10px] font-semibold text-white/65 sm:text-[11px]">{showLogout ? "تم التعرّف على هذا الجهاز" : "سنرسل لك رمز تحقق آمن"}</span>
                    </span>
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.16] bg-black/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,.1)]"><ArrowLeft size={17} className="transition-transform group-hover:-translate-x-0.5" /></span>
                </span>
              </motion.button>

              <button
                type="button"
                onClick={() => { setStep(0); setPhase("steps") }}
                className="group relative flex min-h-[3.8rem] w-full items-center justify-between overflow-hidden rounded-[1.25rem] border border-white/[0.095] bg-[linear-gradient(115deg,rgba(255,255,255,.065),rgba(124,58,237,.075),rgba(255,255,255,.025))] px-3 text-right text-gray-200 shadow-[inset_0_1px_0_rgba(255,255,255,.055)] transition-all hover:border-purple-300/25 hover:bg-white/[0.075] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
              >
                <span className="pointer-events-none absolute -right-8 top-1/2 h-20 w-20 -translate-y-1/2 rounded-full bg-purple-500/[0.08] blur-xl" aria-hidden="true" />
                <span className="relative flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-purple-300/[0.12] bg-purple-400/[0.09] text-purple-200 shadow-[inset_0_1px_0_rgba(255,255,255,.06)]"><Sparkles size={15} /></span><span><span className="block text-xs font-black text-white/90">كيف تعمل الفعالية؟</span><span className="mt-0.5 block text-[9px] font-medium text-gray-500">كل ما تحتاج معرفته قبل البداية</span></span></span>
                <span className="relative flex items-center gap-2"><span className="rounded-full border border-white/[0.07] bg-black/10 px-2 py-1 text-[8px] font-bold text-purple-200/65">٣ خطوات</span><ChevronRight size={14} className="rotate-180 text-gray-500 transition-transform group-hover:-translate-x-0.5" /></span>
              </button>

              <div className="flex min-h-11 items-center justify-between gap-2 rounded-2xl border border-white/[0.055] bg-black/[0.12] px-2.5">
                <span className="flex min-w-0 items-center gap-1.5 text-[9px] font-semibold text-gray-500 sm:text-[10px]"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-400/[0.06]"><ShieldCheck size={12} className="text-emerald-400/80" /></span> بياناتك واختياراتك سرية</span>
                <button
                  type="button"
                  onClick={openResults}
                  className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.025] px-2.5 text-[11px] font-bold text-gray-300 transition-colors hover:border-emerald-300/15 hover:bg-emerald-400/[0.07] hover:text-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  <Trophy size={13} className="text-emerald-300/80" /> النتائج
                </button>
              </div>
              </motion.div>
            </div>
          </motion.div>
        )}
        {phase === "steps" && (
          <motion.div
            key="steps"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 flex-1 min-h-0 flex flex-col overflow-hidden"
          >
            {/* Top progress bar */}
            <div className="w-full h-1 bg-gray-800/50" role="progressbar" aria-label="تقدم شرح الفعالية" aria-valuemin={1} aria-valuemax={WALK_SLIDES.length} aria-valuenow={step + 1}>
              <motion.div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                animate={{ width: `${((step + 1) / WALK_SLIDES.length) * 100}%` }}
                transition={{ duration: 0.45, ease: "easeInOut" }}
              />
            </div>
            <p className="sr-only" aria-live="polite" aria-atomic="true">الخطوة {step + 1} من {WALK_SLIDES.length}: {WALK_SLIDES[step].label}</p>

            {/* Header nav */}
            <div className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
              <button
                type="button"
                onClick={() => step === 0 ? setPhase("splash") : goPrev()}
                aria-label={step === 0 ? "الرجوع إلى شاشة الدخول" : `الرجوع إلى الخطوة ${step}`}
                className="flex min-h-11 items-center gap-1 rounded-lg px-2 py-1 text-sm text-gray-300 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
              >
                <ChevronRight size={15} className="rotate-180" />
                {step === 0 ? "الدخول" : "السابق"}
              </button>
              <span className="flex items-center gap-1.5 text-xs font-black text-purple-200"><Sparkles size={12} /> دليل الفعالية</span>
              <span className="text-gray-500 text-xs font-mono tabular-nums">{step + 1} / {WALK_SLIDES.length}</span>
            </div>

            {/* Step card */}
            <div className="event3-scroll flex-1 min-h-0 flex flex-col items-center justify-start overflow-y-auto px-5 py-2">
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
                  <WalkSlide step={step} headingRef={walkHeadingRef} eventFormat={eventFormat} />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Bottom navigation */}
            <div className="shrink-0 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 space-y-2">
              {/* Dot indicators */}
              <div className="flex items-center justify-center gap-1.5">
                {WALK_SLIDES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    aria-label={`الانتقال إلى خطوة ${i + 1}: ${WALK_SLIDES[i].label}`}
                    aria-current={i === step ? "step" : undefined}
                    className="-mx-1 flex h-11 w-11 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                  >
                    <span aria-hidden="true" className={`block rounded-full transition-all duration-300 ${
                      i === step ? "w-6 h-2 bg-white" : "w-2 h-2 bg-gray-700 hover:bg-gray-500"
                    }`} />
                  </button>
                ))}
              </div>
              {/* Next + skip buttons */}
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={goNext}
                className="event3-action w-full rounded-2xl bg-gradient-to-l from-fuchsia-500 via-purple-600 to-violet-700 py-3.5 text-base font-black text-white shadow-[0_16px_42px_-18px_rgba(168,85,247,.9)] transition-all hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
              >
                {step === WALK_SLIDES.length - 1 ? <span className="flex items-center justify-center gap-2">جاهز — ابدأ الفعالية <Sparkles size={16} /></span> : "التالي ←"}
              </motion.button>
              {step < WALK_SLIDES.length - 1 && (
                <button
                  type="button"
                  onClick={onDone}
                  className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-medium text-gray-300 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                >
                  <ArrowLeft size={12} />
                  {showLogout ? "متابعة الفعالية الآن" : "الدخول مباشرة برقم الجوال"}
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

// ─── Participant Entry Screen ─────────────────────────────────────────────────
type ParticipantLoginMethod = "sms" | "token"

function PhoneEntry({
  onToken,
  initialMethod = "sms",
}: {
  onToken: (t: string) => void
  initialMethod?: ParticipantLoginMethod
}) {
  const [loginMethod, setLoginMethod] = useState<ParticipantLoginMethod>(initialMethod)
  const [phone, setPhone] = useState("")
  const [otp, setOtp] = useState("")
  const [secureToken, setSecureToken] = useState("")
  const [showToken, setShowToken] = useState(false)
  const [step, setStep] = useState<"phone" | "otp">("phone")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [shake, setShake] = useState(false)
  const submitInFlightRef = useRef(false)

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(e.target.value.replace(/[^\d+\s\-()]/g, ''))
    if (error) setError("")
  }

  const showError = (message: string) => {
    setError(message)
    setShake(true)
    setTimeout(() => setShake(false), 500)
  }

  const completeParticipantLogin = (
    participantToken: string,
    identity?: { name?: string | null; assignedNumber?: number | null },
  ) => {
    // Keep Event3 and the main welcome page on one participant session. Storage
    // failures should not block the current tab from entering the event.
    try {
      localStorage.setItem("blindmatch_result_token", participantToken)
      localStorage.setItem("blindmatch_returning_token", participantToken)
      if (identity?.name) localStorage.setItem("blindmatch_participant_name", identity.name)
      if (identity?.assignedNumber != null) localStorage.setItem("blindmatch_participant_number", String(identity.assignedNumber))
      localStorage.removeItem("blindmatch_event3_participant_token")
    } catch {}
    onToken(participantToken)
  }

  const selectLoginMethod = (method: ParticipantLoginMethod) => {
    if (loading || method === loginMethod) return
    setLoginMethod(method)
    setError("")
    setShake(false)
  }

  const requestOtp = async () => {
    if (submitInFlightRef.current) return
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length < 9) { showError("أدخل رقم جوال صحيح"); return }
    submitInFlightRef.current = true
    setLoading(true); setError("")
    try {
      const d = await call("e3-request-login-otp", null, { phone })
      if (d.error) { showError(d.error); return }
      setOtp("")
      setStep("otp")
      toast.success("تم إرسال رمز التحقق برسالة SMS")
    } catch {
      showError("تعذّر إرسال الرمز — تحقق من اتصالك وحاول مرة أخرى")
    } finally {
      submitInFlightRef.current = false
      setLoading(false)
    }
  }

  const verifyOtp = async () => {
    if (submitInFlightRef.current) return
    const code = otp.replace(/\D/g, '')
    if (!/^\d{4,8}$/.test(code)) { showError("أدخل رمز التحقق المرسل إلى جوالك"); return }
    submitInFlightRef.current = true
    setLoading(true); setError("")
    try {
      const d = await call("e3-verify-login-otp", null, { phone, otp: code })
      if (d.error || !d.success || !d.token) { showError(d.error || "تعذّر التحقق من الرمز"); return }

      // This is intentionally a normal participant login: once the provider
      // verifies the phone, every main-site page may restore this account.
      completeParticipantLogin(d.token, { name: d.name, assignedNumber: d.assigned_number })
    } catch {
      showError("تعذّر التحقق — تحقق من اتصالك وحاول مرة أخرى")
    } finally {
      submitInFlightRef.current = false
      setLoading(false)
    }
  }

  const verifySecureToken = async () => {
    if (submitInFlightRef.current) return
    const enteredToken = secureToken.trim()
    if (!enteredToken) { showError("أدخل رمز الدخول المميز"); return }
    submitInFlightRef.current = true
    setLoading(true); setError("")
    try {
      // Heartbeat validates the token server-side and applies the exact same
      // paid/swapped-in admission rules as the rest of Event3.
      const d = await call("e3-heartbeat", enteredToken)
      if (d.error) {
        showError(
          d.code === "PARTICIPANT_TOKEN_INVALID"
            ? "رمز الدخول غير صحيح. انسخه كاملاً من صفحة الترحيب."
            : d.error || "تعذّر التحقق من رمز الدخول",
        )
        return
      }
      if (d.enrolled !== true) {
        showError("رمز الدخول صحيح، لكنك غير مسجّل في هذه الفعالية. تواصل مع المنظّم.")
        return
      }

      completeParticipantLogin(enteredToken, {
        name: d.my_info?.name,
        assignedNumber: d.my_info?.number,
      })
      toast.success("تم التحقق من رمز الدخول")
    } catch {
      showError("تعذّر التحقق — تحقق من اتصالك وحاول مرة أخرى")
    } finally {
      submitInFlightRef.current = false
      setLoading(false)
    }
  }

  const submit = () => loginMethod === "token" ? verifySecureToken() : step === "phone" ? requestOtp() : verifyOtp()

  const editPhone = () => {
    if (loading) return
    setStep("phone")
    setOtp("")
    setError("")
  }

  const isTokenLogin = loginMethod === "token"
  const loginTitle = isTokenLogin ? "دخول بالرمز المميز" : step === "phone" ? "دخول الفعالية" : "رمز التحقق"
  const loginSubtitle = isTokenLogin
    ? "بديل فوري وآمن إذا تعذّرت رسالة التحقق"
    : step === "phone"
      ? "أدخل رقم جوالك المسجّل في الفعالية"
      : "أدخل رمز التحقق المرسل إليك عبر SMS"
  const inputId = isTokenLogin ? "event3-secure-token" : step === "phone" ? "event3-phone" : "event3-otp"

  return (
    <PageWrapper className="flex items-center justify-center p-5 sm:p-6">
      <motion.div
        initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        className="w-full max-w-sm space-y-6 text-center"
      >
        <div className="space-y-3">
          <Event3Mark />
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-cyan-300/[0.12] bg-cyan-300/[0.055] px-2.5 py-1 text-[9px] font-black tracking-wide text-cyan-100/75">
              <ShieldCheck size={11} /> دخول آمن ومشفّر
            </span>
            <h1 className="bg-gradient-to-l from-white via-purple-100 to-fuchsia-200 bg-clip-text text-[1.85rem] font-black leading-tight text-transparent">
              {loginTitle}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-gray-400">
              {loginSubtitle}
            </p>
          </motion.div>
        </div>

        {/* Input card */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
          <GlassCard className="rounded-[1.65rem] p-5">
            <form onSubmit={event => { event.preventDefault(); submit() }} className="space-y-3.5" noValidate>
              <div className="grid grid-cols-2 gap-1 rounded-[1.15rem] border border-white/[0.07] bg-black/25 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,.025)]" role="group" aria-label="طريقة تسجيل الدخول">
                <button
                  type="button"
                  aria-pressed={loginMethod === "sms"}
                  disabled={loading}
                  onClick={() => selectLoginMethod("sms")}
                  className={`relative flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-[0.9rem] px-2 text-xs font-black transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 disabled:cursor-wait ${
                    loginMethod === "sms"
                      ? "border border-purple-300/20 bg-gradient-to-br from-purple-500/30 via-violet-500/20 to-fuchsia-500/20 text-white shadow-[0_10px_30px_-16px_rgba(168,85,247,.9),inset_0_1px_0_rgba(255,255,255,.12)]"
                      : "border border-transparent text-gray-500 hover:bg-white/[0.035] hover:text-gray-300"
                  }`}
                >
                  {loginMethod === "sms" && <span aria-hidden="true" className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-purple-200/70 to-transparent" />}
                  <Smartphone size={15} className={loginMethod === "sms" ? "text-purple-200" : "text-gray-600"} />
                  <span className="whitespace-nowrap">رسالة SMS</span>
                </button>
                <button
                  type="button"
                  aria-pressed={loginMethod === "token"}
                  disabled={loading}
                  onClick={() => selectLoginMethod("token")}
                  className={`relative flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-[0.9rem] px-2 text-xs font-black transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-wait ${
                    loginMethod === "token"
                      ? "border border-cyan-200/20 bg-gradient-to-br from-cyan-400/20 via-violet-500/20 to-fuchsia-500/25 text-white shadow-[0_10px_30px_-16px_rgba(34,211,238,.8),inset_0_1px_0_rgba(255,255,255,.12)]"
                      : "border border-transparent text-gray-500 hover:bg-white/[0.035] hover:text-gray-300"
                  }`}
                >
                  {loginMethod === "token" && <span aria-hidden="true" className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-cyan-100/75 to-transparent" />}
                  <KeyRound size={15} className={loginMethod === "token" ? "text-cyan-200" : "text-gray-600"} />
                  <span className="whitespace-nowrap">رمز الدخول</span>
                </button>
              </div>

              <div className="flex items-center justify-between px-0.5">
                <label htmlFor={inputId} className="block text-right text-xs font-black text-gray-200">
                  {isTokenLogin ? "الرمز المميز" : step === "phone" ? "رقم الجوال" : "رمز التحقق"}
                </label>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-purple-300/[0.12] bg-purple-400/[0.08] text-purple-200">
                  {isTokenLogin ? <KeyRound size={13} className="text-cyan-200" /> : step === "phone" ? <Smartphone size={13} /> : <Lock size={13} />}
                </span>
              </div>
              <motion.div animate={shake ? { x: [-8, 8, -6, 6, -3, 3, 0] } : { x: 0 }} transition={{ duration: 0.4 }}>
                {isTokenLogin ? (
                  <div className="relative">
                    <input
                      id="event3-secure-token"
                      name="secure-token"
                      type={showToken ? "text" : "password"}
                      autoComplete="off"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="done"
                      dir="ltr"
                      placeholder="••••••••••••"
                      value={secureToken}
                      onChange={event => { setSecureToken(event.target.value); if (error) setError("") }}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? "event3-login-error event3-login-help" : "event3-login-help"}
                      autoFocus
                      className={`w-full rounded-2xl border bg-[linear-gradient(135deg,rgba(0,0,0,.36),rgba(30,11,55,.28))] py-4 pl-14 pr-5 text-center font-mono text-base font-bold tracking-[0.12em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.04),0_12px_32px_-24px_rgba(34,211,238,.55)] transition-all placeholder:tracking-[0.22em] placeholder:text-gray-600 focus:outline-none focus:ring-4 focus:ring-cyan-400/[0.08]
                        ${error ? 'border-red-500/70 focus:border-red-400' : 'border-white/[0.09] focus:border-cyan-200/40 focus:bg-black/40'}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(current => !current)}
                      className="absolute left-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-white/[0.055] hover:text-cyan-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                      aria-label={showToken ? "إخفاء رمز الدخول" : "إظهار رمز الدخول"}
                      aria-pressed={showToken}
                    >
                      {showToken ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                ) : step === "phone" ? (
                  <input
                    id="event3-phone"
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    enterKeyHint="send"
                    maxLength={24}
                    dir="ltr"
                    placeholder="05XXXXXXXX"
                    value={phone}
                    onChange={handleInput}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "event3-login-error event3-login-help" : "event3-login-help"}
                    className={`w-full rounded-2xl border bg-black/30 px-5 py-4 text-center text-xl font-bold tracking-widest text-white shadow-[inset_0_1px_0_rgba(255,255,255,.035)] transition-all placeholder:font-normal placeholder:tracking-normal placeholder:text-gray-600 focus:outline-none focus:ring-4 focus:ring-purple-500/[0.08]
                      ${error ? 'border-red-500/70 focus:border-red-400' : 'border-white/[0.09] focus:border-purple-300/45 focus:bg-black/40'}`}
                  />
                ) : (
                  <input
                    id="event3-otp"
                    name="otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    enterKeyHint="done"
                    maxLength={8}
                    dir="ltr"
                    placeholder="••••••"
                    value={otp}
                    onChange={event => { setOtp(event.target.value.replace(/\D/g, '').slice(0, 8)); if (error) setError("") }}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "event3-login-error event3-login-help" : "event3-login-help"}
                    autoFocus
                    className={`w-full rounded-2xl border bg-black/30 px-5 py-4 text-center text-2xl font-black tracking-[0.4em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.035)] transition-all placeholder:text-gray-600 focus:outline-none focus:ring-4 focus:ring-purple-500/[0.08]
                      ${error ? 'border-red-500/70 focus:border-red-400' : 'border-white/[0.09] focus:border-purple-300/45 focus:bg-black/40'}`}
                  />
                )}
              </motion.div>
              <p id="event3-login-help" className="text-center text-xs leading-relaxed text-gray-400">
                {isTokenLogin ? "استخدم الرمز المميز نفسه من صفحة الترحيب الرئيسية" : step === "phone" ? "استخدم الرقم نفسه المسجّل لدى المنظم" : `أرسلنا الرمز إلى ${phone}`}
              </p>
              <AnimatePresence>
                {error && (
                  <motion.p id="event3-login-error" role="alert" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="text-red-300 text-sm text-center font-bold leading-snug">{error}</motion.p>
                )}
              </AnimatePresence>
              <motion.button type="submit" disabled={loading} aria-busy={loading} whileTap={{ scale: 0.97 }}
                className="event3-action flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-[#c026d3] via-[#7e22ce] to-[#4c1d95] px-4 py-4 text-lg font-black text-white transition-all hover:brightness-110 disabled:opacity-50">
                {loading ? (
                  <><motion.div aria-hidden="true" animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />{isTokenLogin ? "جاري فحص الرمز..." : step === "phone" ? "جاري الإرسال..." : "جاري التحقق..."}</>
                ) : (
                  <span className="flex items-center justify-center gap-2">{isTokenLogin ? "تأكيد الرمز والدخول" : step === "phone" ? "إرسال رمز التحقق" : "تأكيد ودخول"} {isTokenLogin ? <KeyRound size={17} /> : <Sparkles size={16} />}</span>
                )}
              </motion.button>
              {!isTokenLogin && step === "otp" && (
                <div className="flex items-center justify-center gap-3 pt-1 text-xs font-bold">
                  <button type="button" onClick={requestOtp} disabled={loading} className="min-h-11 text-purple-300 disabled:opacity-50">إعادة إرسال الرمز</button>
                  <span className="text-gray-700">•</span>
                  <button type="button" onClick={editPhone} disabled={loading} className="min-h-11 text-gray-300 disabled:opacity-50">تغيير الرقم</button>
                </div>
              )}
            </form>
          </GlassCard>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
          className="space-y-1 text-center text-xs text-gray-500">
          <p className="inline-flex items-center justify-center gap-1.5"><ShieldCheck size={12} className="text-emerald-300/65" /> {isTokenLogin ? "رمزك خاص بك ولا يظهر لأي مشارك" : "بيانات الدخول لا تظهر لبقية المشاركين"}</p>
          <p className="text-[11px] text-gray-600">{isTokenLogin ? "يتم التحقق مباشرة من دون إرسال رسالة جديدة." : "إذا لم يصلك الرمز، استخدم رمز الدخول أو تواصل مع المنظم."}</p>
        </motion.div>
      </motion.div>
    </PageWrapper>
  )
}

// ─── Waiting / Setup Screen ───────────────────────────────────────────────────
function SetupScreen({ token, myInfo, enrolledCount, eventFormat }: { token: string; myInfo: { number: number; name: string; gender: string | null } | null; enrolledCount: number | null; eventFormat: Event3Format }) {

  const choiceOnly = isChoiceOnlyEvent3(eventFormat)

  const timeline = choiceOnly ? [
    { icon: <Users size={14} className="text-cyan-400" />, label: "مجموعة التعارف الأولى · ترتيب", time: "المحطة 1" },
    { icon: <Shuffle size={14} className="text-indigo-400" />, label: "مجموعة التعارف الثانية · ترتيب", time: "المحطة 2" },
    { icon: <Shuffle size={14} className="text-violet-400" />, label: "مجموعة التعارف الثالثة · ترتيب نهائي", time: "المحطة 3" },
    { icon: <Coffee size={14} className="text-orange-400" />, label: "استراحة واستعداد", time: "فاصل" },
    { icon: <Heart size={14} className="text-pink-400" />, label: "لقاء الاختيار الأول · تقييم", time: "المحطة 4" },
    { icon: <Heart size={14} className="text-violet-400" />, label: "لقاء الاختيار الثاني · تقييم", time: "المحطة 5" },
    { icon: <Heart size={14} className="text-purple-400" />, label: "لقاء الاختيار الثالث · تقييم", time: "المحطة 6" },
    { icon: <Sparkles size={14} className="text-emerald-400" />, label: "الكشف النهائي والنتائج", time: "المحطة 7" },
  ] : [
    { icon: <Users size={14} className="text-cyan-400" />, label: "مجموعة التعارف الأولى · ترتيب", time: "المحطة 1" },
    { icon: <Shuffle size={14} className="text-indigo-400" />, label: "مجموعة التعارف الثانية · ترتيب نهائي", time: "المحطة 2" },
    { icon: <Coffee size={14} className="text-orange-400" />, label: "استراحة واستعداد", time: "فاصل" },
    { icon: <Heart size={14} className="text-pink-400" />, label: "لقاء اختيارك · تقييم", time: "المحطة 3" },
    { icon: <Brain size={14} className="text-violet-400" />, label: "لقاء اختيار النظام · تقييم", time: "المحطة 4" },
    { icon: <Sparkles size={14} className="text-emerald-400" />, label: "الكشف النهائي والنتائج", time: "المحطة 5" },
  ]

  return (
    <PageWrapper embedded className="flex items-center justify-center px-5 py-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm space-y-4"
      >
        <Brand />

        {/* Participant info card */}
        {myInfo && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <GlassCard className="flex items-center gap-4 rounded-[1.35rem] border-purple-300/[0.12] p-4">
              <div className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl border text-2xl font-black shadow-[inset_0_1px_0_rgba(255,255,255,.1),0_12px_28px_-18px_currentColor] ${
                myInfo.gender === "female" ? "border-pink-400/20 bg-gradient-to-br from-pink-500/25 to-fuchsia-950/40 text-pink-200" :
                myInfo.gender === "male" ? "border-cyan-400/20 bg-gradient-to-br from-cyan-500/20 to-blue-950/40 text-cyan-200" :
                "border-purple-400/20 bg-gradient-to-br from-purple-500/25 to-violet-950/40 text-purple-200"
              }`}>
                {myInfo.number}
              </div>
              <div className="flex-1 min-w-0 text-right">
                <p className="text-base font-black leading-tight text-white">{myInfo.name}</p>
                <p className="mt-1 text-[11px] font-medium text-gray-500">هويتك داخل الفعالية · الرقم {myInfo.number}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/[0.12] bg-emerald-400/[0.07] px-2 py-1">
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,.75)]" />
                  <span className="text-[10px] font-black text-emerald-200">جاهز</span>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        <GlassCard className="space-y-3.5 rounded-[1.5rem] border-purple-300/[0.12] p-5 text-center">
          <div className="flex justify-center gap-1.5">
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                className={`h-1.5 rounded-full ${i === 1 ? "w-6 bg-gradient-to-r from-purple-400 to-cyan-300" : "w-1.5 bg-purple-400/45"}`}
                animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1, 0.8] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.35 }}
              />
            ))}
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-purple-200/55">READY ROOM</p>
            <h1 className="mt-1 bg-gradient-to-l from-white via-purple-100 to-cyan-100 bg-clip-text text-xl font-black text-transparent">الفعالية ستبدأ قريباً</h1>
            <p className="mt-1 text-xs text-gray-500">انتظر توجيهات المنظم</p>
          </div>
          <p className="rounded-xl border border-emerald-300/[0.12] bg-emerald-400/[0.055] px-3 py-2 text-xs leading-5 text-emerald-100/80">
            لا تحتاج أن تفعل شيئاً الآن — ستنتقل الشاشة تلقائياً عند بدء الجولة.
          </p>
          {enrolledCount != null && enrolledCount > 0 && (
            <div className="flex items-center justify-center gap-2 pt-1">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-400 text-xs font-medium">{enrolledCount} مشارك مسجّل</span>
            </div>
          )}
        </GlassCard>

        {/* Event timeline preview */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <GlassCard className="space-y-3 rounded-[1.35rem] p-4">
            <p className="flex items-center justify-between text-xs font-black text-gray-300">
              <span className="flex items-center gap-1.5"><Clock size={12} className="text-purple-300" /> رحلة الفعالية</span>
              <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-cyan-100/35">THE JOURNEY</span>
            </p>
            <div className="space-y-2">
              {timeline.map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="relative flex items-center justify-center">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[0.65rem] border border-white/[0.08] bg-white/[0.045] text-sm shadow-[inset_0_1px_0_rgba(255,255,255,.05)]">
                      {step.icon}
                    </div>
                    {i < timeline.length - 1 && (
                      <div className="absolute top-full h-2 w-px bg-gradient-to-b from-purple-400/35 to-transparent" />
                    )}
                  </div>
                  <span className="flex-1 text-xs font-medium text-gray-300">{step.label}</span>
                  <span className="rounded-full border border-white/[0.055] bg-black/20 px-2 py-0.5 font-mono text-[9px] text-gray-500">{step.time}</span>
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
      className="fixed inset-0 z-[500] flex items-center justify-center bg-[#02030a]/86 p-3 backdrop-blur-md sm:p-6"
      dir="rtl"
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        className={`event3-glass relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xs flex-col overflow-hidden rounded-3xl border border-white/[0.1] p-4 text-center ring-1 sm:p-6 ${ring}`}
      >
        {/* Close */}
        <button onClick={onClose} aria-label="إغلاق التذكير" className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-black/25 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400">
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
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.09] bg-gradient-to-br from-white/[0.08] to-white/[0.025] shadow-[inset_0_1px_0_rgba(255,255,255,.08)] sm:h-14 sm:w-14">{icon}</div>
        </div>

        <h2 id={titleId} className="text-white font-black text-lg mb-2 sm:mb-3 shrink-0">{title}</h2>

        {/* Points */}
        <div className="space-y-1.5 sm:space-y-2 text-right mb-3 sm:mb-5 min-h-0 overflow-y-auto overscroll-contain pr-0.5">
          {points.map((p, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.08 }}
              className="flex items-start gap-2 rounded-xl border border-white/[0.065] bg-black/[0.18] px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,.025)] sm:px-3 sm:py-2">
              <span className="shrink-0 mt-0.5">{p.icon}</span>
              <p className="text-gray-300 text-[12px] leading-relaxed flex-1">{p.text}</p>
            </motion.div>
          ))}
        </div>

        <motion.button whileTap={{ scale: 0.96 }} onClick={onClose}
          className={`event3-action w-full shrink-0 rounded-xl bg-gradient-to-r py-3 text-sm font-black focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 ${grad} ${ctaText}`}>
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
          <button type="button" onClick={onClose} aria-label="إغلاق النصائح" className="-m-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300">
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
          <motion.button type="button" onClick={goNext} whileTap={{ scale: 0.95 }} className={`min-h-11 rounded-xl px-3 text-xs font-bold ${ac.text} transition-opacity hover:bg-white/5 hover:opacity-80`}>
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
      "مثال: شيء تخطط له، تجربة غيّرت نظرتك، أو شيء متحمّس له هالفترة.",
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
  3: {
    title: "بداية الجولة الثالثة",
    prompt: "اسمك، ثم اختر سؤالاً واحداً يفتح حواراً جديداً:",
    subPrompts: [
      "ما تجربة بسيطة غيّرت رأيك في شيء مهم؟",
      "ما الشيء الذي يعطيك طاقة هذه الفترة؟",
      "ما عادة أو قيمة تحب أن يعرفها الناس عنك؟",
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

function IceBreaker({ round, tableNumber = 0, myInfo, tablemates, onDone }: {
  round: number; tableNumber?: number; myInfo: { number: number; name: string; gender: string | null } | null; tablemates: { number: number; first_name: string; gender: string | null }[]; onDone?: () => void
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
      onDone?.()
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
            className="event3-action w-full rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 py-3 text-sm font-bold text-white transition-all hover:brightness-110 active:scale-95"
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
          className="event3-action flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 py-3 text-sm font-bold text-white transition-all hover:brightness-110 active:scale-95"
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
          className={`event3-action flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:brightness-110 active:scale-95 ${ac.btn} ${ac.glow}`}
        >
          <CheckCircle size={16} /> خلّصنا التحدي — ابدأوا الجلسة
        </motion.button>
        <button type="button" onClick={() => setDone(true)} className="mx-auto flex min-h-11 items-center justify-center rounded-xl px-4 text-xs font-bold text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200">
          تخطي التحدي والبدء بالأسئلة
        </button>
      </GlassCard>
    </motion.div>
  )
}

// ─── Round Screen ─────────────────────────────────────────────────────────────
function RoundScreen({ token, phase, timerActive, timerStart, timerDuration, correctedNow, myInfo, onGroupsOpenChange, eventFormat }: {
  token: string; phase: string; timerActive: boolean; timerStart: string | null; timerDuration: number; correctedNow?: () => number; myInfo: { number: number; name: string; gender: string | null } | null; onGroupsOpenChange?: (open: boolean) => void; eventFormat: Event3Format
}) {
  const round = parseInt(phase.replace("round", "")) || 1
  const groupRoundCount = event3GroupRoundCount(eventFormat)
  const choiceOnly = isChoiceOnlyEvent3(eventFormat)
  const [assignment, setAssignment] = useState<any>(null)
  const [assignmentError, setAssignmentError] = useState("")
  const [timeLeft, setTimeLeft] = useState(0)
  const [showGroups, setShowGroups] = useState(false)
  const [groupsHaveOpened, setGroupsHaveOpened] = useState(false)
  const [groupActivityStage, setGroupActivityStage] = useState<"warmup" | "activities">("warmup")
  const [showGroupParticipationNudge, setShowGroupParticipationNudge] = useState(false)
  const [participationNudgePending, setParticipationNudgePending] = useState(false)
  const participationNudgeTimerRef = useRef<string | null>(null)
  const participationNudgeButtonRef = useRef<HTMLButtonElement>(null)
  const participationNudgeTitleId = useId()
  const groupsDialogRef = useRef<HTMLDivElement>(null)
  const groupsOpenerRef = useRef<HTMLElement | null>(null)
  const openGroups = useCallback(() => {
    groupsOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setGroupsHaveOpened(true)
    setShowGroups(true)
  }, [])
  const closeGroups = useCallback(() => setShowGroups(false), [])

  // Treat the activities panel like a native modal sheet while keeping it
  // mounted off-screen so selected activities retain their progress.
  useEffect(() => {
    if (!showGroups) return
    const previousOverflow = document.body.style.overflow
    const focusTimer = window.setTimeout(() => {
      const firstControl = groupsDialogRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      ;(firstControl || groupsDialogRef.current)?.focus()
    }, 80)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        closeGroups()
        return
      }
      if (event.key !== "Tab") return
      const controls = Array.from(groupsDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) || [])
      if (!controls.length) {
        event.preventDefault()
        groupsDialogRef.current?.focus()
        return
      }
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKeyDown)
      groupsOpenerRef.current?.focus()
    }
  }, [showGroups, closeGroups])
  const [showTutorial, setShowTutorial] = useState(false)
  useEffect(() => {
    onGroupsOpenChange?.(showGroups || showTutorial || showGroupParticipationNudge)
  }, [showGroups, showTutorial, showGroupParticipationNudge, onGroupsOpenChange])

  useEffect(() => {
    if (!showGroupParticipationNudge) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    const focusTimer = window.setTimeout(() => participationNudgeButtonRef.current?.focus(), 50)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowGroupParticipationNudge(false)
      if (event.key === "Tab") {
        event.preventDefault()
        participationNudgeButtonRef.current?.focus()
      }
    }
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKeyDown)
      opener?.focus()
    }
  }, [showGroupParticipationNudge])

  const { popup, clearPopup } = useTimerWarnings(timerActive, timeLeft, timerDuration, true, {
    oneMinSublabel: "خلصوا النشاط وتأكدوا من أسماء الجميع — الترتيب يبدأ بعد دقيقة ومحدد بوقت"
  }, timerStart)

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
      setParticipationNudgePending(false)
      setShowGroupParticipationNudge(false)
      return
    }
    const timerKey = `${round}:${timerStart}`
    const now = correctedNow ? correctedNow() : Date.now()
    const elapsed = Math.floor((now - new Date(timerStart).getTime()) / 1000)
    if (elapsed >= 10 * 60 && participationNudgeTimerRef.current !== timerKey) {
      participationNudgeTimerRef.current = timerKey
      setParticipationNudgePending(true)
    }
  }, [timerActive, timerStart, timeLeft, round, correctedNow])

  // Queue this gentle reminder until the current sheet/tutorial is closed.
  // Only one Round overlay owns focus and the body scroll lock at a time.
  useEffect(() => {
    if (!participationNudgePending || showGroups || showTutorial || showGroupParticipationNudge) return
    setParticipationNudgePending(false)
    setShowGroupParticipationNudge(true)
  }, [participationNudgePending, showGroups, showTutorial, showGroupParticipationNudge])

  // Wake lock: prevent screen sleep during active round
  const wakeLockActive = timerActive && timeLeft > 0
  useScreenWakeLock(wakeLockActive)

  // Vibrate when timer starts or when 10 seconds remain
  // (sound/vibration handled by useTimerWarnings hook above)

  const roundAr = ["الأولى", "الثانية", "الثالثة"][round - 1] || round
  const RC = [
    { badge: "bg-blue-900/30 border-blue-700/40 text-blue-300", card: "border-blue-800/40", num: "text-blue-300", pill: "bg-blue-900/40 text-blue-300 border-blue-800/40", bar: "from-blue-500 to-cyan-500" },
    { badge: "bg-indigo-900/30 border-indigo-700/40 text-indigo-300", card: "border-indigo-800/40", num: "text-indigo-300", pill: "bg-indigo-900/40 text-indigo-300 border-indigo-800/40", bar: "from-indigo-500 to-purple-500" },
  ][round - 1] || { badge: "bg-purple-900/30 border-purple-700/40 text-purple-300", card: "border-purple-800/40", num: "text-purple-300", pill: "bg-purple-900/40 text-purple-300 border-purple-800/40", bar: "from-purple-500 to-pink-500" }

  return (
    <div className="relative min-h-full overflow-hidden" dir="rtl">
      {/* Background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -right-24 -top-32 h-[380px] w-[380px] rounded-full bg-purple-600/[0.16] blur-[105px]" />
        <div className="absolute -bottom-24 -left-20 h-[340px] w-[340px] rounded-full bg-cyan-500/[0.09] blur-[95px]" />
        <div className="absolute right-1/3 top-1/2 h-[260px] w-[260px] -translate-y-1/2 rounded-full bg-fuchsia-500/[0.055] blur-[80px]" />
      </div>

      {/* ── Main Content ───────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="relative z-10 flex h-full flex-col items-center justify-center p-4 sm:p-6"
        aria-hidden={showGroups || undefined}
        inert={showGroups}
      >
        <div className="w-full max-w-sm space-y-5 text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1, type: "spring" }}
            className={`inline-flex items-center gap-2 ${RC.badge} border rounded-full px-5 py-2`}
          >
            <Users size={13} />
            <span className="font-bold text-sm">الجولة الجماعية {roundAr}</span>
            <span className="text-gray-600 text-xs">من {groupRoundCount}</span>
          </motion.div>
          <JourneyCue
            accent={round === 1 ? "blue" : "purple"}
            title={assignment ? `توجّه الآن إلى طاولة ${assignment.table}` : "نجهّز مكانك في الجولة"}
            description="بعد الوصول ستبدأون بكسر جليد قصير، ثم تختارون نشاطاً واحداً للمجموعة."
            steps={["الوصول", "كسر الجليد", "نشاط المجموعة"]}
            currentStep={groupActivityStage === "activities" ? 2 : groupsHaveOpened ? 1 : 0}
          />

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
              <button onClick={loadAssignment} className="event3-action mt-1 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-rose-600 via-red-600 to-red-700 px-5 text-xs font-black text-white">
                <RefreshCw size={13} /> إعادة المحاولة
              </button>
            </GlassCard>
          ) : (
            <GlassCard className="p-10 flex flex-col items-center gap-3">
              <Spinner size={22} />
              <p className="text-gray-500 text-sm">جاري تحميل مكانك...</p>
            </GlassCard>
          )}

          {/* One linear entry point owns the warm-up and shared activity. */}
          <motion.button
            type="button"
            onClick={openGroups}
            disabled={!assignment}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
            className={`event3-action group flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r p-4 text-right text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${RC.bar}`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
              <Target size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-black">{
                !groupsHaveOpened ? "وصلت — ابدأوا معاً" : groupActivityStage === "warmup" ? "متابعة كسر الجليد" : "العودة إلى نشاط المجموعة"
              }</span>
              <span className="mt-0.5 block text-xs font-medium text-white/75">تعارف سريع، ثم ألعاب وأسئلة يشارك فيها الجميع</span>
            </span>
            <ArrowLeft size={18} className="shrink-0 text-white/70 transition-transform group-hover:-translate-x-0.5" />
          </motion.button>

          <p className="text-gray-600 text-xs">
            {round === 1 && "تعارف جماعي على طاولتك — ستختار بعدها من تريد جلسة فردية معه"}
            {round === 2 && (choiceOnly ? "بعد هذه الجولة ستحدّث ترتيبك، ثم تنتقل إلى مجموعة ثالثة" : "آخر جولة جماعية — بعدها ستُرتّب الأولويات لتحديد جلستك الفردية")}
            {round === 3 && "آخر جولة جماعية — بعدها ستحسم ترتيبك النهائي للقاءات الاختيار الثلاثة"}
          </p>

          {typeof window !== "undefined" && new URLSearchParams(window.location.search).has("discussionPreview") && (
            <button onClick={() => setShowGroupParticipationNudge(true)} className="text-amber-300/80 hover:text-amber-200 text-[11px] font-medium transition-colors mx-auto">
              اختبار تنبيه المشاركة (10 دقائق)
            </button>
          )}

          {/* Contextual help is optional and never interrupts the live task. */}
          {round === 1 && (
            <motion.button
              onClick={() => setShowTutorial(true)}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
              className="text-gray-600 hover:text-gray-400 text-[11px] font-medium transition-colors flex items-center gap-1.5 mx-auto"
            >
              <RefreshCw size={11} />
              كيف تسير الجولة؟
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
            ref={groupsDialogRef}
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: showGroups ? 1 : 0, y: showGroups ? 0 : "100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 32 }}
            aria-hidden={!showGroups}
            inert={!showGroups}
            role="dialog"
            aria-modal={showGroups ? "true" : undefined}
            aria-label="أنشطة المجموعة"
            tabIndex={-1}
            className={`event3-shell fixed inset-0 z-[210] flex flex-col ${showGroups ? "pointer-events-auto" : "pointer-events-none"}`}
          >
            {groupActivityStage === "warmup" && assignment?.tablemates ? (
              <div className="event3-scroll relative z-10 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]" tabIndex={-1}>
                <div className="mx-auto w-full max-w-sm space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-right">
                      <p className="text-xs font-bold text-amber-300">الخطوة 1 من 2</p>
                      <h2 className="mt-0.5 text-lg font-black text-white">ابدأوا بتعارف سريع</h2>
                    </div>
                    <button type="button" onClick={closeGroups} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-gray-300" aria-label="إغلاق أنشطة المجموعة"><X size={18} /></button>
                  </div>
                  <JourneyCue accent="amber" eyebrow="قبل النشاط" title="خلّوا كل شخص يأخذ دوره" description="بعد آخر شخص سننقلكم مباشرة إلى قائمة الأنشطة — لا تحتاجون الرجوع لهذه الشاشة." steps={["تعارف", "اختيار نشاط", "مشاركة"]} currentStep={0} />
                  <IceBreaker
                    round={round}
                    tableNumber={assignment.table}
                    myInfo={myInfo}
                    tablemates={assignment.tablemates}
                    onDone={() => setGroupActivityStage("activities")}
                  />
                  <button type="button" onClick={() => setGroupActivityStage("activities")} className="mx-auto flex min-h-11 items-center justify-center rounded-xl px-4 text-xs font-bold text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200">
                    تخطي كسر الجليد والذهاب للأنشطة
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative z-10 flex-1 overflow-y-auto overscroll-contain" tabIndex={-1}>
                <GroupsPage disableOnboarding onClose={closeGroups} round={round} tableNumber={assignment?.table} participantSeed={token} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGroupParticipationNudge && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[520] flex items-end bg-black/55 p-5 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-labelledby={participationNudgeTitleId}>
            <motion.div initial={{ y: 20, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.98 }} className="event3-glass w-full max-w-md rounded-3xl border border-amber-400/25 p-6 text-center" dir="rtl">
              <Users className="mx-auto mb-3 h-8 w-8 text-amber-300" />
              <h2 id={participationNudgeTitleId} className="text-lg font-black text-white">خلّوا الجميع يأخذ فرصته</h2>
              <p className="mt-2 text-sm leading-7 text-gray-300">إذا فيه شخص ما أخذ فرصته بالكلام، نحب نسمع منه — والمشاركة دائمًا اختيارية.</p>
              <button ref={participationNudgeButtonRef} type="button" onClick={() => setShowGroupParticipationNudge(false)} className="event3-action mt-5 min-h-12 w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 font-black text-gray-950">نكمل</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Timer Warning Popup ─────────────────────────────────────── */}
      <AnimatePresence>
        {popup && <TimerWarningPopup key={popup.seconds} {...popup} onDone={clearPopup} />}
      </AnimatePresence>
    </div>
  )
}

// ─── Ranking Tutorial Overlay ────────────────────────────────────────────────
function RankingTutorial({ onClose, choiceOnly }: { onClose: () => void; choiceOnly: boolean }) {
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
        { icon: <Heart size={14} className="text-emerald-400" />, text: <>إذا رتّبت شخصًا <span className="text-white font-bold">#1</span> ورتّبك هو أيضًا <span className="text-white font-bold">#1</span> فهذا أقوى نوع من الاختيار المتبادل في اللقاءين الأول والثاني.</> },
        { icon: <Sparkles size={14} className="text-cyan-400" />, text: <>مو لازم تكونوا بنفس المركز: ممكن ترتبه أول وهو يرتبك ثالث. ننتقل للخيار المتبادل التالي فقط عندما يلزم ذلك لإكمال أزواج الجولة، ثم نحسب اللقاء الثالث كأفضل توزيع شامل متبقٍ.</> },
        { icon: <Handshake size={14} className="text-purple-400" />, text: <>التطابق يجب أن يكون <span className="text-white font-bold">متبادلاً</span> — ترتيبك وحده لا يكفي، الطرفان يجب أن يتقاربا</> },
        { icon: <Users size={14} className="text-pink-400" />, text: choiceOnly
          ? <>نتيجتك: <span className="text-white font-bold">ثلاث جلسات فردية متبادلة</span> مع أشخاص مختلفين؛ أول جلستين بأولوية الاختيار الفردي والثالثة بأفضل خطة شاملة متبقية</>
          : <>نتيجتك: <span className="text-white font-bold">جلستان فرديتان</span> — واحدة من اختيارك وواحدة يختارها النظام بناءً على التوافق</> },
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
      role="listitem"
      className={className}
      drag={disabled ? false : "y"}
      dragListener={false}
      dragControls={dragControls}
      whileDrag={disabled ? undefined : whileDrag}
    >
      {children(startDrag)}
    </Reorder.Item>
  )
}

// ─── Ranking Screen ───────────────────────────────────────────────────────────
function RankingScreen({ token, completedRounds, currentPhase, timerActive, timerStart, timerDuration, correctedNow, myInfo, onOpenGroupFeedback, onRankingResolved, onRankingDirty, eventFormat }: {
  token: string
  completedRounds: number
  currentPhase: string
  timerActive: boolean
  timerStart: string | null
  timerDuration: number
  correctedNow?: () => number
  myInfo: { number: number; name: string; gender: string | null } | null
  onOpenGroupFeedback: (round: Event3GroupRound) => void
  onRankingResolved: (round: number) => void
  onRankingDirty: () => void
  eventFormat: Event3Format
}) {
  const finalGroupRound = event3GroupRoundCount(eventFormat)
  const isFinalRanking = completedRounds >= finalGroupRound
  const choiceOnly = isChoiceOnlyEvent3(eventFormat)
  const [people, setPeople] = useState<any[]>([])
  const [order, setOrder] = useState<number[]>([])
  const [newNums, setNewNums] = useState<Set<number>>(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [rankAnnouncement, setRankAnnouncement] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [openNote, setOpenNote] = useState<number | null>(null)
  const [savingNote, setSavingNote] = useState<number | null>(null)
  const [noteSaveErrors, setNoteSaveErrors] = useState<Set<number>>(new Set())
  const [showConfirm, setShowConfirm] = useState(false)
  const [showPhaseWarning, setShowPhaseWarning] = useState(false)
  const [showRankTutorial, setShowRankTutorial] = useState(false)
  const [timeLeft, setTimeLeft] = useState(300) // fallback, overwritten by server timer
  const [autoSaving, setAutoSaving] = useState(false)
  const [draftSync, setDraftSync] = useState<"saving" | "saved" | "error">("saving")
  const [showTimeWarning, setShowTimeWarning] = useState(false)
  const rankingEventRef = useRef<number | null>(null)
  const revisionRef = useRef(0)
  const savingRef = useRef(false)
  const submittedRef = useRef(false)
  const orderRef = useRef<number[]>([])
  const autoSavedRef = useRef(false)
  const rankingWarningsRef = useRef<Set<number>>(new Set())
  const rankingConfirmOverlayRef = useRef<HTMLDivElement>(null)
  const rankingConfirmDialogRef = useRef<HTMLDivElement>(null)
  const rankingConfirmCancelRef = useRef<HTMLButtonElement>(null)

  useModalFocus({
    open: showConfirm && !autoSaving && !autoSavedRef.current && timeLeft > 0,
    overlayRef: rankingConfirmOverlayRef,
    dialogRef: rankingConfirmDialogRef,
    initialFocusRef: rankingConfirmCancelRef,
    onEscape: () => setShowConfirm(false),
  })

  useEffect(() => {
    Promise.all([
      call("e3-get-participants-met", token, { completed_rounds: completedRounds }),
      call("e3-get-notes", token),
    ]).then(([d, nd]) => {
      if (d.error) {
        setLoadError(d.error)
        setLoading(false)
        toast.error(d.error)
        return
      }
      setLoadError(null)
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
      rankingEventRef.current = d.event_id
      revisionRef.current = Math.max(Date.now(), Number(d.draft_revision || 0) + 1)
      setOrder(d.draft_order || [...ranked.map(p => p.number), ...fresh.map(p => p.number)])
      if (d.already_submitted) {
        setSubmitted(true)
        onRankingResolved(completedRounds)
      }
      setLoading(false)

      if (!nd.error && nd.notes) setNotes(nd.notes)
    })
  }, [token, completedRounds, reloadKey, onRankingResolved])

  // Keep refs in sync
  useEffect(() => { submittedRef.current = submitted }, [submitted])
  useEffect(() => { orderRef.current = order }, [order])
  useEffect(() => {
    rankingWarningsRef.current.clear()
    autoSavedRef.current = false
    setShowTimeWarning(false)
    setShowConfirm(false)
  }, [timerStart, completedRounds])

  // Server-side timer — calculate remaining time from server start + duration
  useEffect(() => {
    if (!timerActive || !timerStart) { setTimeLeft(timerDuration || 300); return }
    const update = () => {
      const now = correctedNow ? correctedNow() : Date.now()
      const elapsed = Math.floor((now - new Date(timerStart).getTime()) / 1000)
      const remaining = Math.max(0, timerDuration - elapsed)
      setTimeLeft(remaining)
      if (remaining > 0 && remaining <= 30 && !rankingWarningsRef.current.has(30) && !submittedRef.current) {
        rankingWarningsRef.current.add(90)
        rankingWarningsRef.current.add(30)
        toast('باقي 30 ثانية — احفظ تصنيفك الآن!', { duration: 5000, icon: '⏰' })
      } else if (remaining > 30 && remaining <= 90 && !rankingWarningsRef.current.has(90) && !submittedRef.current) {
        rankingWarningsRef.current.add(90)
        vibrate([100, 50, 100])
        playTimerWarningSound()
        setShowTimeWarning(true)
      }
    }
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [timerActive, timerStart, timerDuration, correctedNow])

  const rankingClosed = currentPhase !== `ranking${completedRounds}`
  const rankingExpired = timeLeft <= 0

  // Sync unfinished orders so phase advancement can finalize even sleeping phones.
  useEffect(() => {
    if (loading || loadError || submitted || !order.length || rankingClosed || rankingExpired) return
    let cancelled = false
    let retry: ReturnType<typeof setTimeout>
    const revision = revisionRef.current = Math.max(Date.now(), revisionRef.current + 1)
    setDraftSync("saving")
    const sync = async () => {
      const d = await call("e3-save-ranking-draft", token, {
        ranked_list: order, completed_rounds: completedRounds, event_id: rankingEventRef.current, revision,
      })
      if (cancelled) return
      if (d.error) {
        setDraftSync("error")
        retry = setTimeout(sync, 3000)
        return
      }
      setDraftSync("saved")
      if (d.complete) {
        submittedRef.current = true
        setSubmitted(true)
        onRankingResolved(completedRounds)
      }
    }
    retry = setTimeout(sync, 150)
    return () => { cancelled = true; clearTimeout(retry) }
  }, [token, completedRounds, order, loading, loadError, submitted, rankingClosed, rankingExpired, onRankingResolved])

  // Timer expiry and host advancement both resolve the ranking. Failed saves retry.
  useEffect(() => {
    if ((!rankingExpired && !rankingClosed) || submitted || autoSavedRef.current || loading || loadError || !order.length || submitting) return
    let cancelled = false
    let retry: ReturnType<typeof setTimeout>
    const doAutoSave = async () => {
      if (savingRef.current) { retry = setTimeout(doAutoSave, 1000); return }
      savingRef.current = true
      setShowConfirm(false)
      setAutoSaving(true)
      const revision = revisionRef.current = Math.max(Date.now(), revisionRef.current + 1)
      const d = await call('e3-submit-ranking', token, {
        ranked_list: orderRef.current, auto_saved: true,
        completed_rounds: completedRounds, event_id: rankingEventRef.current, revision,
      })
      savingRef.current = false
      if (cancelled) return
      setAutoSaving(false)
      if (d.error) {
        setDraftSync("error")
        toast.error(d.error, { id: "ranking-autosave-error" })
        retry = setTimeout(doAutoSave, 3000)
        return
      }
      autoSavedRef.current = true
      submittedRef.current = true
      setSubmitted(true)
      onRankingResolved(completedRounds)
      toast('تم حفظ تصنيفك تلقائياً', { duration: 5000, icon: '⏰' })
    }
    doAutoSave()
    return () => { cancelled = true; clearTimeout(retry) }
  }, [rankingExpired, rankingClosed, token, loading, loadError, order.length, submitted, submitting, completedRounds, onRankingResolved])

  useEffect(() => {
    if (timeLeft <= 0 || submitted || autoSaving) setShowConfirm(false)
  }, [timeLeft, submitted, autoSaving])

  // Detect phase change while user is on ranking screen
  useEffect(() => {
    if (rankingClosed && !submitted) {
      setShowPhaseWarning(true)
    }
  }, [rankingClosed, submitted])

  const saveNote = async (aboutNumber: number, text: string) => {
    setSavingNote(aboutNumber)
    const result = await call("e3-save-note", token, { about_number: aboutNumber, note: text })
    setSavingNote(null)
    if (result.error) {
      setNoteSaveErrors(current => new Set(current).add(aboutNumber))
      toast.error('تعذّر حفظ الملاحظة — بقي النص لديك ويمكنك المحاولة مجدداً')
      return
    }
    setNoteSaveErrors(current => {
      const next = new Set(current)
      next.delete(aboutNumber)
      return next
    })
  }

  const submit = async () => {
    if (savingRef.current || submitting || autoSaving || autoSavedRef.current || submittedRef.current || rankingClosed || timeLeft <= 0) {
      setShowConfirm(false)
      return
    }
    setSubmitting(true)
    savingRef.current = true
    const revision = revisionRef.current = Math.max(Date.now(), revisionRef.current + 1)
    const d = await call("e3-submit-ranking", token, { ranked_list: order, completed_rounds: completedRounds, event_id: rankingEventRef.current, revision })
    savingRef.current = false
    setSubmitting(false)
    if (d.error) { toast.error(d.error); return }
    setShowConfirm(false)
    submittedRef.current = true
    setSubmitted(true)
    onRankingResolved(completedRounds)
    onOpenGroupFeedback(completedRounds as Event3GroupRound)
    toast.success(isFinalRanking ? "تم حفظ تصنيفك النهائي!" : "تم حفظ تصنيفك!")
  }

  const personMap = Object.fromEntries(people.map(p => [p.number, p]))

  const moveToRank = (number: number, nextIndex: number) => {
    if (submitted || submitting || autoSaving || rankingClosed || rankingExpired) return
    setOrder(current => {
      const fromIndex = current.indexOf(number)
      if (fromIndex < 0 || fromIndex === nextIndex) return current
      const next = current.filter(value => value !== number)
      next.splice(Math.max(0, Math.min(nextIndex, next.length)), 0, number)
      return next
    })
    setRankAnnouncement(`تم نقل ${personMap[number]?.first_name || "المشارك"} إلى المركز ${nextIndex + 1}`)
  }

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
    <PageWrapper embedded className="flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Spinner size={28} />
        <p className="text-gray-500 text-xs">جاري تحميل الأشخاص...</p>
      </div>
    </PageWrapper>
  )

  if (loadError) return (
    <PageWrapper embedded className="flex items-center justify-center p-5 text-center">
      <div className="event3-glass w-full max-w-sm rounded-3xl border border-red-400/[0.16] p-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/25 bg-red-500/10">
          <AlertTriangle size={26} className="text-red-300" />
        </div>
        <h1 className="mt-4 text-lg font-black text-white">تعذّر تحميل قائمة الترتيب</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-300">{loadError}</p>
        <button type="button" onClick={() => { setLoading(true); setLoadError(null); setReloadKey(value => value + 1) }} className="event3-action mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-rose-600 via-red-600 to-red-700 px-4 text-sm font-black text-white">
          <RefreshCw size={16} /> إعادة المحاولة
        </button>
      </div>
    </PageWrapper>
  )

  const timerPct = timerDuration > 0 ? Math.min(100, (timeLeft / timerDuration) * 100) : 0
  const timerColor = timeLeft <= 30 ? "bg-red-500" : timeLeft <= 60 ? "bg-amber-500" : "bg-emerald-500"
  const timerText = timeLeft <= 30 ? "text-red-400" : timeLeft <= 60 ? "text-amber-400" : "text-gray-300"

  return (
    <PageWrapper embedded>
      {/* ── Sticky header with integrated timer ── */}
      <div className="event3-status-header sticky top-0 z-20 border-b border-white/[0.07]">
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
                  {people.length} أشخاص · اسحب أو اضغط رقم المركز
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
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
                  <Clock size={10} /> انتقل المنظم — جارٍ تأكيد الحفظ التلقائي
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
        {!submitted && (
          <JourneyCue
            accent="amber"
            eyebrow={isFinalRanking ? "قرارك النهائي" : "قرار هذه الجولة"}
            title="ضع الأكثر رغبة في اللقاء بالمركز الأول"
            description="الترتيب الحالي نقطة بداية فقط؛ غيّره ليعكس اختيارك، ثم راجع أول ثلاثة قبل الحفظ."
            steps={["رتّب", "راجع الأعلى", "احفظ"]}
            currentStep={0}
            className="mb-3"
            aside={(
              <button type="button" onClick={() => setShowRankTutorial(true)} className="min-h-9 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-[11px] font-bold text-gray-300">
                كيف تُحسم؟
              </button>
            )}
          />
        )}
        {order.length > 4 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-2 flex items-center justify-center gap-2 rounded-xl border border-cyan-800/25 bg-cyan-950/20 px-3 py-2 text-xs font-semibold text-cyan-200"
          >
            <motion.span animate={{ y: [0, 3, 0] }} transition={{ duration: 1.4, repeat: Infinity }}>↓</motion.span>
            مرّر لرؤية كل الأسماء · اسحب المقبض أو اضغط رقم المركز
          </motion.div>
        )}
        <p className="sr-only" aria-live="polite">{rankAnnouncement}</p>
        {!submitted && <p role="status" className={`mb-2 text-center text-[11px] ${draftSync === "error" ? "text-amber-300" : "text-gray-400"}`}>
          {draftSync === "error" ? "تعذّرت مزامنة الترتيب — نحاول مجدداً، أبقِ الصفحة مفتوحة" : draftSync === "saving" ? "جارٍ مزامنة ترتيبك..." : "تمت مزامنة ترتيبك — يُحفظ تلقائياً عند انتهاء المرحلة"}
        </p>}
        <Reorder.Group axis="y" values={order} onReorder={next => { if (!submitted && !submitting && !autoSaving && !rankingClosed && !rankingExpired) setOrder(next) }} className="space-y-1.5" as="div" role="list" aria-label="ترتيب المشاركين">
          {order.map((num, idx) => {
            const p = personMap[num]
            if (!p) return null
            const rb = rankBadge(idx)
            const accent = cardAccent(idx)
            return (
              <RankingReorderCard
                key={num}
                value={num}
                className={`relative rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,.035),0_14px_35px_-30px_rgba(124,58,237,.75)] transition-colors ${accent} ${submitted ? 'cursor-not-allowed opacity-40' : 'select-none hover:border-white/[0.13]'}`}
                disabled={submitted || submitting || autoSaving || rankingClosed || rankingExpired}
                whileDrag={submitted ? undefined : {
                  scale: 1.03,
                  boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
                  borderColor: 'rgba(251,191,36,0.3)',
                  zIndex: 50,
                }}
              >
                {startDrag => <>
                <div className="flex items-center justify-center gap-2 px-2 py-2.5 touch-pan-y sm:px-3">
                  {/* Rank badge with icon for top 3 */}
                  <div className={`relative flex h-11 w-11 flex-shrink-0 items-center justify-center gap-0.5 rounded-xl bg-gradient-to-br ${rb.bg} ${rb.text} shadow-sm ${rb.glow} ring-1 ${rb.ring}`}>
                    <span aria-hidden="true" className="flex items-center gap-0.5">
                      {idx === 0 ? <Crown size={12} /> : idx === 1 ? <Medal size={12} /> : idx === 2 ? <Award size={12} /> : null}
                      <span className="text-xs font-black">{idx + 1}</span>
                    </span>
                    <select
                      value={idx}
                      onChange={event => moveToRank(num, Number(event.target.value))}
                      disabled={submitted || submitting || autoSaving || rankingClosed || rankingExpired}
                      aria-label={`غيّر مركز ${p.first_name}، المركز الحالي ${idx + 1}`}
                      className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-xl opacity-0 disabled:cursor-default"
                    >
                      {order.map((_, rankIndex) => <option key={rankIndex} value={rankIndex}>المركز {rankIndex + 1}</option>)}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setOpenNote(openNote === num ? null : num) }}
                    aria-expanded={openNote === num}
                    aria-label={`${notes[num] ? 'تعديل' : 'إضافة'} ملاحظة خاصة عن ${p.first_name} من الجولة ${p.round}${p.table_number != null ? `، المجموعة ${p.table_number}` : ''}`}
                    className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-center transition hover:bg-white/[0.04]"
                  >
                    <span className="flex min-w-0 flex-1 flex-col items-center gap-1">
                      <span className="flex max-w-full items-center justify-center gap-1.5">
                        <span className="truncate text-sm font-bold leading-tight text-white">{p.first_name}</span>
                        <span className="shrink-0 text-[11px] font-mono text-gray-400">#{p.number}</span>
                        {newNums.has(num) && (
                          <span className="flex shrink-0 items-center gap-0.5 rounded-full border border-purple-800/50 bg-purple-900/50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-200">
                            <Sparkles size={8} /> جديد
                          </span>
                        )}
                      </span>
                      <span className="flex flex-wrap items-center justify-center gap-1.5">
                        <span className="shrink-0 rounded-full border border-white/[0.07] bg-white/[0.035] px-2 py-0.5 text-[9px] font-semibold text-gray-400">
                          الجولة {p.round}
                        </span>
                        {p.table_number != null && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-cyan-300/25 bg-gradient-to-r from-cyan-500/[0.13] to-blue-500/[0.08] px-2.5 py-0.5 text-[10px] font-black text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,.08)]">
                            <Users size={9} aria-hidden="true" /> المجموعة {p.table_number}
                          </span>
                        )}
                      </span>
                    </span>
                    <PenLine size={14} className={notes[num] ? 'shrink-0 text-amber-300' : 'shrink-0 text-gray-400'} />
                  </button>

                  {/* Drag handle — keeping drag here leaves the rest of the card free for page scrolling. */}
                  <button
                    type="button"
                    onPointerDown={startDrag}
                    disabled={submitted || submitting || autoSaving || rankingClosed || rankingExpired}
                    // Inline touch-action must beat the shell's unlayered button rule.
                    style={{ touchAction: "none" }}
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
                            maxLength={300}
                            aria-label={`ملاحظة خاصة عن ${p.first_name}`}
                            dir="rtl"
                            className="w-full cursor-text resize-none rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-base text-white outline-none transition-colors placeholder:text-gray-500 focus:border-amber-500/50 sm:text-sm"
                          />
                          <p className={`mt-1 text-right text-xs transition-colors ${noteSaveErrors.has(num) ? 'text-red-300' : 'text-gray-400'}`} aria-live="polite">
                            {savingNote === num ? 'جاري الحفظ...' : noteSaveErrors.has(num) ? 'تعذّر الحفظ — المس الحقل ثم غادره للمحاولة مجدداً' : notes[num]?.trim() ? '✓ محفوظة' : 'تُحفظ تلقائياً عند المغادرة'}
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
      <div className="fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-[#02030a] via-[#02030a]/95 to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 sm:px-4">
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
              <motion.button
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                onClick={() => onOpenGroupFeedback(completedRounds as Event3GroupRound)} whileTap={{ scale: 0.97 }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-purple-400/20 bg-purple-500/10 py-3 text-xs font-black text-purple-200"
              >
                <Trophy size={14} />
                تقييم أفراد المجموعة {completedRounds}
              </motion.button>
              <p className="text-gray-600 text-[10px]">انتظر المنظم للانتقال للمرحلة التالية</p>
              {!autoSavedRef.current && (
                <button onClick={() => { submittedRef.current = false; setSubmitted(false); onRankingDirty() }} disabled={submitting || rankingClosed || rankingExpired}
                  className="text-gray-500 hover:text-gray-300 text-[10px] underline transition-colors">
                  تعديل التصنيف
                </button>
              )}
            </motion.div>
          ) : (
            <>
              <motion.button
                onClick={() => { if (!autoSaving && !autoSavedRef.current && timeLeft > 0) setShowConfirm(true) }}
                disabled={submitting || autoSaving || timeLeft <= 0}
                whileTap={{ scale: 0.97 }}
                className="event3-action flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 text-sm font-black text-black transition-all hover:from-amber-400 hover:to-orange-400 disabled:opacity-50"
              >
                {submitting ? <Spinner size={16} className="!text-black" /> : <Send size={16} />}
                {isFinalRanking ? 'إرسال التصنيف النهائي' : 'حفظ التصنيف'}
              </motion.button>
              <div className="flex items-center justify-center gap-1.5 mt-2">
                <p className="text-gray-600 text-[10px]">
                  {choiceOnly ? "سنكوّن ثلاثة لقاءات متبادلة مع أشخاص مختلفين؛ الأول والثاني بأولوية الاختيار الفردي والثالث بأفضل توزيع شامل متبقٍ" : "النظام سيختار توافقك الأمثل من تصنيفاتك"}
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
        {showRankTutorial && <RankingTutorial choiceOnly={choiceOnly} onClose={() => { setShowRankTutorial(false); try { sessionStorage.setItem('e3_tut_ranking', "1") } catch {} }} />}
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
        {showConfirm && !autoSaving && !autoSavedRef.current && timeLeft > 0 && (
          <motion.div
            ref={rankingConfirmOverlayRef}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[500] flex items-center justify-center bg-[#02030a]/86 p-4 backdrop-blur-md sm:p-6"
            onClick={() => setShowConfirm(false)}
          >
            <motion.div
              ref={rankingConfirmDialogRef}
              initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 20 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="event3-glass w-full max-w-xs space-y-4 rounded-3xl border border-amber-500/20 p-6 text-center ring-1 ring-amber-500/10"
              onClick={e => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="ranking-confirm-title"
            >
              <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-600/10 border border-amber-500/20 flex items-center justify-center">
                <Send size={22} className="text-amber-400" />
              </div>
              <h3 id="ranking-confirm-title" className="text-white font-black text-lg">تأكيد التصنيف</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                حفظ ترتيبك لـ <span className="text-white font-bold">{order.length}</span> شخص.
                {isFinalRanking ? " تصنيفك النهائي — سيُستخدم للمطابقة." : " يمكنك التعديل في الجولة القادمة."}
              </p>
              <p className="rounded-xl border border-amber-500/15 bg-amber-500/[0.06] px-3 py-2 text-xs leading-relaxed text-amber-100/80">
                تأكد أن القائمة تعبّر عن رغبتك، وليست مجرد الترتيب المبدئي.
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
                      {p.table_number != null && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-cyan-300/20 bg-cyan-400/[0.08] px-2 py-0.5 text-[9px] font-black text-cyan-100">
                          <Users size={8} aria-hidden="true" /> المجموعة {p.table_number}
                        </span>
                      )}
                      <span className="text-gray-600 text-[10px] font-mono">#{p.number}</span>
                    </div>
                  )
                })}
                {order.length > 3 && <p className="text-gray-600 text-[11px] pt-1 text-center">+ {order.length - 3} آخرون</p>}
              </div>
              <div className="flex gap-3 pt-1">
                <button ref={rankingConfirmCancelRef} type="button" onClick={() => setShowConfirm(false)} disabled={autoSaving}
                  className="flex-1 py-3 rounded-2xl bg-white/[0.04] border border-white/[0.06] text-gray-400 font-bold text-sm hover:bg-white/[0.06] transition-colors disabled:opacity-50">
                  إلغاء
                </button>
                <button type="button" onClick={submit} disabled={submitting || autoSaving || autoSavedRef.current || timeLeft <= 0}
                  className="event3-action flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 text-sm font-black text-black transition-all hover:from-amber-400 hover:to-orange-400 disabled:opacity-50">
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
function GroupReflectionSheet({ token, groupRound, onClose, previewPeople, previewFeedback, reviewMode = false }: {
  token: string | null
  groupRound: Event3GroupRound
  onClose: () => void
  previewPeople?: GroupReflectionPerson[]
  previewFeedback?: GroupReflectionEntry[]
  reviewMode?: boolean
}) {
  const [people, setPeople] = useState<GroupReflectionPerson[]>([])
  const [drafts, setDrafts] = useState<Record<number, { experience: string; tags: string[]; organizer_note: string }>>({})
  const [expanded, setExpanded] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const titleId = useId()
  const overlayRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overlay = overlayRef.current
    const siblings = overlay?.parentElement
      ? Array.from(overlay.parentElement.children).filter(node => node !== overlay) as HTMLElement[]
      : []
    const siblingState = siblings.map(node => ({
      node,
      inert: node.inert,
      ariaHidden: node.getAttribute('aria-hidden'),
    }))
    siblings.forEach(node => {
      node.inert = true
      node.setAttribute('aria-hidden', 'true')
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) || []).filter(node => !node.hasAttribute('hidden'))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 120)
    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      siblingState.forEach(({ node, inert, ariaHidden }) => {
        node.inert = inert
        if (ariaHidden == null) node.removeAttribute('aria-hidden')
        else node.setAttribute('aria-hidden', ariaHidden)
      })
      opener?.focus()
    }
  }, [])

  useEffect(() => {
    if (previewPeople) {
      setPeople(previewPeople)
      const existing: Record<number, { experience: string; tags: string[]; organizer_note: string }> = {}
      for (const row of previewFeedback || []) {
        existing[row.member_number] = {
          experience: row.experience,
          tags: row.tags,
          organizer_note: row.organizer_note,
        }
      }
      setDrafts(existing)
      setLoading(false)
      return
    }
    if (!token) return
    let active = true
    call('e3-get-group-reflection', token, { group_round: groupRound }).then(data => {
      if (!active) return
      if (data.error) {
        toast.error(data.error)
        onClose()
        return
      }
      setPeople(data.people || [])
      const existing: Record<number, { experience: string; tags: string[]; organizer_note: string }> = {}
      for (const row of data.feedback || []) {
        existing[row.member_number] = {
          experience: row.experience,
          tags: Array.isArray(row.tags) ? row.tags : [],
          organizer_note: row.organizer_note || '',
        }
      }
      setDrafts(existing)
      setLoading(false)
    })
    return () => { active = false }
  }, [token, previewPeople, previewFeedback, groupRound])

  const setExperience = (number: number, experience: string) => {
    setSaved(false)
    setDrafts(current => ({
      ...current,
      [number]: { experience, tags: current[number]?.tags || [], organizer_note: current[number]?.organizer_note || '' },
    }))
  }

  const toggleTag = (number: number, tag: string) => {
    setSaved(false)
    setDrafts(current => {
      const item = current[number]
      if (!item?.experience) return current
      const tags = item.tags.includes(tag) ? item.tags.filter(value => value !== tag) : [...item.tags, tag]
      if (tags.length > 3) { toast('اختر حتى 3 صفات فقط', { icon: '✨' }); return current }
      return { ...current, [number]: { ...item, tags } }
    })
  }

  const save = async () => {
    const entries = Object.entries(drafts)
      .filter(([, value]) => value.experience)
      .map(([memberNumber, value]) => ({
        member_number: Number(memberNumber),
        experience: value.experience,
        tags: value.tags,
        organizer_note: value.organizer_note.trim(),
      }))
    if (entries.length === 0) {
      toast.error('قيّم شخصاً واحداً على الأقل، أو اضغط تخطي')
      return
    }
    if (!token) return
    setSaving(true)
    const data = await call('e3-submit-group-reflection', token, {
      group_round: groupRound,
      entries,
    })
    setSaving(false)
    if (data.error) { toast.error(data.error); return }
    setSaved(true)
    toast.success(reviewMode ? 'تم حفظ تعديلاتك بسرية' : 'تم حفظ انطباعك بسرية')
    setTimeout(onClose, 700)
  }

  const reviewedCount = Object.values(drafts).filter(value => value.experience).length
  const experiences = [
    { value: 'great', label: 'ممتاز', icon: Sparkles, style: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300' },
    { value: 'good', label: 'جيد', icon: Smile, style: 'border-cyan-400/35 bg-cyan-500/12 text-cyan-300' },
    { value: 'neutral', label: 'عادي', icon: Meh, style: 'border-amber-400/35 bg-amber-500/12 text-amber-300' },
    { value: 'uncomfortable', label: 'غير مريح', icon: Frown, style: 'border-rose-400/35 bg-rose-500/12 text-rose-300' },
  ]
  const tags = [
    ['fun', 'ممتع'], ['comfortable', 'مريح'], ['good_listener', 'مستمع جيد'], ['respectful', 'محترم'], ['engaging', 'متفاعل'],
    ['quiet', 'هادئ'], ['hard_to_connect', 'صعب التواصل'], ['interrupts', 'يقاطع'], ['dominates', 'يسيطر على الحوار'], ['disrespectful', 'غير محترم'],
  ]

  return (
    <motion.div
      ref={overlayRef}
      initial={previewPeople ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="event3-shell fixed inset-0 z-[550] flex items-end justify-center bg-black/75 backdrop-blur-lg sm:items-center sm:p-4"
    >
      <motion.section
        ref={dialogRef}
        initial={previewPeople ? false : { y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 34 }}
        onClick={event => event.stopPropagation()}
        className="relative flex w-full max-h-[94dvh] flex-col overflow-hidden rounded-t-[2rem] border border-purple-400/15 bg-gradient-to-b from-[#171023] via-[#0d0a14] to-[#08070c] shadow-[0_-20px_80px_-20px_rgba(139,92,246,0.45)] sm:max-w-md sm:rounded-[2rem]"
        style={{ height: 'min(94dvh, 800px)' }}
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.20),transparent_70%)] pointer-events-none" />
        <div className="sm:hidden w-10 h-1 rounded-full bg-white/15 mx-auto mt-2.5" />
        <header className="relative flex shrink-0 items-start gap-2.5 border-b border-white/[0.06] px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-5 sm:pb-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-purple-400/20 bg-gradient-to-br from-purple-500/25 to-fuchsia-500/10">
            {reviewMode ? <PenLine size={20} className="text-purple-300" /> : <Trophy size={20} className="text-purple-300" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 id={titleId} className="text-base font-black leading-snug text-white sm:text-lg">{reviewMode ? `راجع تقييمات ${event3GroupLabel(groupRound)}` : 'كيف كانت تجربتك مع كل شخص؟'}</h2>
              <span className="rounded-full border border-white/[0.1] bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-gray-300">اختياري</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-gray-400">{reviewMode ? 'عدّل انطباعك السابق أو أضف تقييماً لمن فاتك.' : `الجولة ${groupRound} · قيّم شخصاً أو الجميع. خاص بالمنظم ولا يؤثر على تطابقك.`}</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="إغلاق" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-gray-300 transition hover:bg-white/[0.1] hover:text-white active:scale-90">
            <X size={17} />
          </button>
        </header>

        <div className="event3-scroll relative min-h-0 flex-1 overflow-y-auto px-3 py-3 space-y-3 sm:px-5 sm:py-4">
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
              {reviewMode && (
                <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.07] px-3.5 py-3 text-right">
                  <EyeOff size={17} className="mt-0.5 shrink-0 text-emerald-300" />
                  <p className="text-xs leading-relaxed text-emerald-100/85">لن يطّلع أي مشارك آخر على تقييمك أو ملاحظاتك؛ يراها المنظّم فقط.</p>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.035] px-3.5 py-2.5">
                <p className="text-xs leading-relaxed text-gray-300">{reviewMode ? 'يمكنك تغيير أي تقييم أو إكمال الأشخاص غير المقيّمين' : 'اختر انطباعاً سريعاً لكل شخص ترغب بمراجعته'}</p>
                <span aria-live="polite" className="shrink-0 rounded-full bg-purple-500/15 px-2.5 py-1 text-xs font-black text-purple-200">{reviewedCount}/{people.length}</span>
              </div>

              <div className="space-y-2">
                {people.map(person => {
                  const draft = drafts[person.number]
                  const isExpanded = expanded === person.number
                  const hasPersonalDetails = Boolean(draft?.organizer_note.trim() || draft?.tags.length)
                  return (
                    <motion.div layout key={person.number} className={`overflow-hidden rounded-2xl border transition ${draft?.experience ? 'border-purple-400/25 bg-purple-500/[0.07]' : 'border-white/[0.06] bg-white/[0.025]'}`}>
                      <div className="px-3 py-3">
                        <button type="button" disabled={!draft?.experience} onClick={() => draft?.experience && setExpanded(isExpanded ? null : person.number)} aria-expanded={isExpanded} className="flex min-h-10 w-full min-w-0 items-center justify-between gap-2 text-right disabled:cursor-default">
                          <span className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black text-white">{person.first_name}</p>
                          <p className="mt-0.5 text-[11px] text-gray-400">{draft?.experience ? (isExpanded ? 'إخفاء التفاصيل' : 'يمكنك إضافة ملاحظة خاصة') : 'اختر تقييماً سريعاً'}</p>
                          </span>
                          {draft?.experience && <ChevronRight aria-hidden="true" size={16} className={`shrink-0 text-purple-300 transition-transform ${isExpanded ? '-rotate-90' : 'rotate-90'}`} />}
                        </button>
                        <div className="mt-2 grid grid-cols-4 gap-1.5" role="group" aria-label={`تقييم تجربتك مع ${person.first_name}`}>
                          {experiences.map(option => {
                            const Icon = option.icon
                            const active = draft?.experience === option.value
                            return (
                              <button type="button" key={option.value} onClick={() => setExperience(person.number, option.value)} aria-pressed={active} aria-label={`${option.label} — ${person.first_name}`}
                                className={`flex min-h-14 min-w-0 flex-col items-center justify-center rounded-xl border px-1 transition active:scale-95 ${active ? option.style : 'border-white/[0.07] bg-white/[0.035] text-gray-400'}`}>
                                <Icon size={16} />
                                <span className="mt-1 text-[10px] font-bold leading-tight">{option.label}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {draft?.experience && !isExpanded && (
                        <button type="button" onClick={() => setExpanded(person.number)} className="flex min-h-11 w-full items-center justify-center gap-1.5 border-t border-purple-400/10 bg-purple-500/[0.04] px-3 py-2 text-xs font-bold text-purple-200 transition active:bg-purple-500/10">
                          <PenLine size={11} />
                          <span>{hasPersonalDetails ? `تعديل ملاحظتك والصفات الخاصة بـ ${person.first_name}` : `أضف ملاحظة خاصة عن ${person.first_name} أو صفات`}</span>
                        </button>
                      )}

                      <AnimatePresence initial={false}>
                        {isExpanded && draft?.experience && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="border-t border-white/[0.05] px-3 pb-3 pt-2.5">
                              <p className="mb-2 text-xs font-bold text-gray-400">صفات اختيارية · حتى 3</p>
                              <div className="flex flex-wrap gap-1.5">
                                {tags.map(([value, label]) => {
                                  const active = draft.tags.includes(value)
                                  return <button type="button" key={value} onClick={() => toggleTag(person.number, value)} aria-pressed={active} className={`min-h-9 rounded-full border px-3 py-1.5 text-xs font-bold transition ${active ? 'border-purple-400/35 bg-purple-500/15 text-purple-100' : 'border-white/[0.08] bg-white/[0.035] text-gray-300'}`}>{label}</button>
                                })}
                              </div>
                              <div className="mt-3 rounded-xl border border-white/[0.05] bg-black/15 p-2.5">
                                <div className="mb-1.5 flex items-center justify-between gap-3"><span className="text-xs font-bold text-gray-300">ملاحظة خاصة عن {person.first_name} للمنظم</span><span className="shrink-0 text-[10px] text-gray-500">{draft.organizer_note.length}/300</span></div>
                                <textarea value={draft.organizer_note} rows={2} maxLength={300} aria-label={`ملاحظة خاصة عن ${person.first_name} للمنظم`} onChange={event => { const value = event.target.value; setSaved(false); setDrafts(current => ({ ...current, [person.number]: { ...current[person.number], organizer_note: value } })) }} placeholder={`اكتب ملاحظة عن ${person.first_name}...`} className="w-full resize-none bg-transparent text-base leading-relaxed text-gray-100 placeholder:text-gray-500 focus:outline-none sm:text-sm" />
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )
                })}
              </div>
            </>
          )}
        </div>
        {!loading && people.length > 0 && (
          <footer className="relative z-20 flex shrink-0 gap-2 border-t border-white/[0.08] bg-[#09070e]/95 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:px-5">
            <button type="button" onClick={onClose} className="min-h-12 rounded-2xl border border-white/[0.09] bg-white/[0.05] px-5 text-sm font-bold text-gray-300 transition active:scale-95">{reviewMode ? 'المجموعات' : 'تخطي'}</button>
            <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={save} disabled={saving || saved || reviewedCount === 0} aria-busy={saving}
              className="event3-action flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-500 via-violet-500 to-fuchsia-500 px-4 text-sm font-black text-white disabled:opacity-60">
              {saving ? <Spinner size={16} /> : saved ? <CheckCircle size={17} /> : <Send size={16} />}
              {saved ? 'تم الحفظ' : reviewedCount ? (reviewMode ? 'حفظ التعديلات' : `حفظ ${reviewedCount} تقييم`) : 'اختر تقييماً للبدء'}
            </motion.button>
          </footer>
        )}
      </motion.section>
    </motion.div>
  )
}

// ─── Break-time Group Feedback Review ────────────────────────────────────────
function BreakGroupFeedbackSheet({ token, eventFormat, onClose, onSelectRound, previewGroups }: {
  token: string | null
  eventFormat: Event3Format
  onClose: () => void
  onSelectRound: (round: Event3GroupRound) => void
  previewGroups?: GroupReflectionGroup[]
}) {
  const [groups, setGroups] = useState<GroupReflectionGroup[]>(previewGroups || [])
  const [loading, setLoading] = useState(!previewGroups)
  const [error, setError] = useState<string | null>(null)
  const [retryVersion, setRetryVersion] = useState(0)
  const titleId = useId()
  const overlayRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useModalFocus({
    open: true,
    overlayRef,
    dialogRef,
    initialFocusRef: closeButtonRef,
    onEscape: onClose,
  })

  useEffect(() => {
    if (previewGroups) {
      setGroups(previewGroups)
      setLoading(false)
      setError(null)
      return
    }
    if (!token) {
      setLoading(false)
      setError('تعذّر تحميل تقييماتك. حاول مرة أخرى.')
      return
    }

    let active = true
    const loadGroups = async () => {
      setLoading(true)
      setError(null)
      try {
        const rounds = Array.from(
          { length: event3GroupRoundCount(eventFormat) },
          (_, index) => (index + 1) as Event3GroupRound,
        )
        const responses = await Promise.all(rounds.map(async round => ({
          round,
          data: await call('e3-get-group-reflection', token, { group_round: round }),
        })))
        if (!active) return
        const failed = responses.find(({ data }) => data.error)
        if (failed) {
          setError(failed.data.error || 'تعذّر تحميل تقييماتك. حاول مرة أخرى.')
          setGroups([])
          return
        }
        setGroups(responses.map(({ round, data }) => ({
          round,
          people: Array.isArray(data.people) ? data.people : [],
          feedback: (Array.isArray(data.feedback) ? data.feedback : []).map((entry: any) => ({
            member_number: Number(entry.member_number),
            experience: String(entry.experience || ''),
            tags: Array.isArray(entry.tags) ? entry.tags : [],
            organizer_note: String(entry.organizer_note || ''),
          })),
        })))
      } catch {
        if (active) {
          setError('تعذّر تحميل تقييماتك. تحقق من الاتصال وحاول مرة أخرى.')
          setGroups([])
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadGroups()
    return () => { active = false }
  }, [token, eventFormat, previewGroups, retryVersion])

  let totalPeople = 0
  let totalReviewed = 0
  for (const group of groups) {
    totalPeople += group.people.length
    totalReviewed += group.feedback.filter(entry => Boolean(entry.experience)).length
  }
  const completionPercent = totalPeople > 0 ? Math.round((totalReviewed / totalPeople) * 100) : 0

  return (
    <motion.div
      ref={overlayRef}
      initial={previewGroups ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="event3-shell fixed inset-0 z-[545] flex items-end justify-center bg-black/75 backdrop-blur-lg sm:items-center sm:p-4"
    >
      <motion.section
        ref={dialogRef}
        tabIndex={-1}
        initial={previewGroups ? false : { y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 34 }}
        className="relative flex w-full max-h-[94dvh] flex-col overflow-hidden rounded-t-[2rem] border border-teal-300/15 bg-gradient-to-b from-[#0d2022] via-[#0c1017] to-[#08090d] shadow-[0_-20px_90px_-20px_rgba(45,212,191,0.35)] sm:max-w-md sm:rounded-[2rem]"
        style={{ height: 'min(94dvh, 820px)' }}
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(circle_at_top,rgba(45,212,191,0.18),transparent_68%)]" />
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-white/15 sm:hidden" />
        <header className="relative flex shrink-0 items-start gap-2.5 border-b border-white/[0.06] px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-5 sm:pb-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-teal-300/20 bg-gradient-to-br from-teal-400/25 to-purple-500/10">
            <PenLine size={20} className="text-teal-200" />
          </div>
          <div className="min-w-0 flex-1 text-right">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 id={titleId} className="text-lg font-black leading-snug text-white">راجع وعدّل تقييماتك</h2>
              <span className="rounded-full border border-teal-300/15 bg-teal-400/10 px-2 py-0.5 text-[10px] font-bold text-teal-200">وقت الاستراحة</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-gray-400">الأشخاص مرتّبون حسب المجموعة التي قابلتهم فيها.</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="إغلاق" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-gray-300 transition hover:bg-white/[0.1] hover:text-white active:scale-90">
            <X size={17} />
          </button>
        </header>

        <div className="event3-scroll relative min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-300/15 bg-gradient-to-br from-emerald-500/[0.10] to-teal-500/[0.04] px-3.5 py-3 text-right">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-300/15 bg-emerald-400/10">
              <EyeOff size={17} className="text-emerald-300" />
            </div>
            <div>
              <p className="text-xs font-black text-emerald-100">مساحتك خاصة وآمنة</p>
              <p className="mt-1 text-xs leading-relaxed text-emerald-100/70">لن يطّلع أي مشارك آخر على تقييمك أو ملاحظاتك. هذه المعلومات خاصة ويراها المنظّم فقط.</p>
            </div>
          </div>

          {loading ? (
            <div className="flex h-64 items-center justify-center" role="status" aria-label="جاري تحميل التقييمات"><Spinner size={24} /></div>
          ) : error ? (
            <div className="space-y-4 rounded-2xl border border-rose-400/15 bg-rose-500/[0.06] px-5 py-8 text-center" role="alert">
              <AlertTriangle size={27} className="mx-auto text-rose-300" />
              <p className="text-sm leading-relaxed text-gray-300">{error}</p>
              <button type="button" onClick={() => setRetryVersion(value => value + 1)} className="event3-action inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-rose-600 via-red-600 to-red-700 px-4 text-sm font-black text-white">
                <RefreshCw size={15} /> إعادة المحاولة
              </button>
            </div>
          ) : totalPeople === 0 ? (
            <div className="space-y-2 py-14 text-center">
              <Users size={30} className="mx-auto text-gray-700" />
              <p className="text-sm font-bold text-gray-400">لا توجد مجموعات سابقة لعرضها الآن</p>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3.5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-right">
                    <p className="text-xs font-black text-white">تقدّمك في التقييم</p>
                    <p className="mt-0.5 text-[11px] text-gray-500">يمكنك العودة لأي مجموعة والتعديل في أي وقت خلال الاستراحة</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-teal-300/15 bg-teal-400/10 px-2.5 py-1 text-xs font-black text-teal-200">{totalReviewed}/{totalPeople}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${completionPercent}%` }} className="h-full rounded-full bg-gradient-to-r from-teal-400 via-cyan-400 to-purple-400" />
                </div>
              </div>

              <div className="space-y-3">
                {groups.map(group => {
                  const feedbackByMember = new Map(group.feedback.map(entry => [entry.member_number, entry]))
                  const reviewed = group.people.filter(person => Boolean(feedbackByMember.get(person.number)?.experience)).length
                  const complete = group.people.length > 0 && reviewed === group.people.length
                  return (
                    <section key={group.round} className="overflow-hidden rounded-[1.4rem] border border-white/[0.08] bg-gradient-to-br from-white/[0.055] to-white/[0.018] shadow-lg shadow-black/10">
                      <div className="flex items-center gap-3 border-b border-white/[0.06] px-3.5 py-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-purple-300/15 bg-purple-500/10 text-sm font-black text-purple-200">{group.round}</div>
                        <div className="min-w-0 flex-1 text-right">
                          <h3 className="text-sm font-black text-white">{event3GroupLabel(group.round)}</h3>
                          <p className="mt-0.5 text-[11px] text-gray-500">{group.people.length} {group.people.length === 1 ? 'شخص' : 'أشخاص'} · تم تقييم {reviewed}</p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black ${complete ? 'border-emerald-300/15 bg-emerald-400/10 text-emerald-300' : 'border-amber-300/15 bg-amber-400/10 text-amber-200'}`}>
                          {complete ? 'مكتملة' : `${group.people.length - reviewed} بانتظارك`}
                        </span>
                      </div>

                      <div className="space-y-1 px-2.5 py-2.5">
                        {group.people.map(person => {
                          const feedback = feedbackByMember.get(person.number)
                          const experience = feedback?.experience ? GROUP_REFLECTION_EXPERIENCE_LABELS[feedback.experience] : null
                          return (
                            <div key={person.number} className="flex min-h-11 items-center gap-2.5 rounded-xl px-2 py-1.5 text-right">
                              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${experience ? 'border-purple-300/15 bg-purple-500/10 text-purple-200' : 'border-white/[0.07] bg-white/[0.035] text-gray-500'}`}>
                                {experience ? <CheckCircle size={15} /> : <Clock size={15} />}
                              </div>
                              <span className="min-w-0 flex-1 truncate text-sm font-bold text-gray-100">{person.first_name}</span>
                              {experience ? (
                                <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold ${experience.style}`}>{experience.label}</span>
                              ) : (
                                <span className="shrink-0 rounded-full border border-white/[0.07] bg-white/[0.035] px-2 py-1 text-[10px] font-bold text-gray-500">لم يُقيّم بعد</span>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      <button type="button" onClick={() => onSelectRound(group.round)} className="event3-action flex min-h-12 w-full items-center justify-center gap-2 rounded-b-[1.35rem] border-t border-teal-300/10 bg-gradient-to-r from-teal-500/[0.09] via-cyan-500/[0.07] to-purple-500/[0.09] px-4 text-sm font-black text-teal-100 transition hover:from-teal-500/[0.14] hover:to-purple-500/[0.14] active:scale-[0.99]">
                        <PenLine size={15} />
                        {reviewed > 0 ? 'مراجعة وتعديل هذه المجموعة' : 'ابدأ تقييم هذه المجموعة'}
                        <ChevronRight size={15} className="rotate-180" />
                      </button>
                    </section>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </motion.section>
    </motion.div>
  )
}

function BreakGroupFeedbackPreview() {
  const [selectedRound, setSelectedRound] = useState<Event3GroupRound | null>(null)
  const selectedGroup = selectedRound == null
    ? null
    : BREAK_GROUP_FEEDBACK_PREVIEW.find(group => group.round === selectedRound) || null

  return selectedGroup ? (
    <GroupReflectionSheet
      token={null}
      groupRound={selectedGroup.round}
      previewPeople={selectedGroup.people}
      previewFeedback={selectedGroup.feedback}
      reviewMode
      onClose={() => setSelectedRound(null)}
    />
  ) : (
    <BreakGroupFeedbackSheet
      token={null}
      eventFormat="choice_only_three_groups"
      previewGroups={BREAK_GROUP_FEEDBACK_PREVIEW}
      onClose={() => {}}
      onSelectRound={setSelectedRound}
    />
  )
}

// ─── Shared Feedback Flow ─────────────────────────────────────────────────────
function FeedbackFlow({ partnerName, word, wordSubmitted, done, onDone, onBack, onWordChange, onSubmitWord, onSubmit, isLastSession, accent = "pink", choiceOnly = false, backDisabled = false }: {
  partnerName: string | null; word: string; wordSubmitted: boolean; done: boolean
  onDone: () => void; onBack: () => void; onWordChange: (word: string) => void
  onSubmitWord: () => Promise<boolean>; onSubmit: (fb: Record<string, any>) => Promise<boolean>
  isLastSession?: boolean; accent?: "pink" | "purple"; choiceOnly?: boolean; backDisabled?: boolean
}) {
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [dir, setDir] = useState(1)
  const feedbackTitleId = useId()
  const memoryWordId = useId()
  const stepHeadingRef = useRef<HTMLHeadingElement>(null)
  const stepTransitionLockedRef = useRef(false)
  const stepTransitionTimerRef = useRef<number | null>(null)
  const [fb, setFb] = useState({
    conversationQuality: 0, personalConnection: 0,
    wantConnect: null as boolean | null,
    contactMethod: null as 'phone' | 'message' | null,
    contactMessage: '',
    organizerImpression: '',
    compatibilityRate: 50, sliderMoved: false,
  })
  const STEPS = 3
  useEffect(() => {
    const focusTimer = window.setTimeout(() => stepHeadingRef.current?.focus({ preventScroll: true }), 220)
    return () => window.clearTimeout(focusTimer)
  }, [step])
  useEffect(() => () => {
    if (stepTransitionTimerRef.current != null) window.clearTimeout(stepTransitionTimerRef.current)
  }, [])
  const moveStep = (direction: 1 | -1) => {
    if (stepTransitionLockedRef.current) return false
    stepTransitionLockedRef.current = true
    setDir(direction)
    setStep(current => Math.max(0, Math.min(current + direction, STEPS - 1)))
    stepTransitionTimerRef.current = window.setTimeout(() => {
      stepTransitionLockedRef.current = false
      stepTransitionTimerRef.current = null
    }, 300)
    return true
  }
  const goNext = (patch?: Partial<typeof fb>) => {
    if (stepTransitionLockedRef.current) return
    if (patch) setFb(p => ({ ...p, ...patch }))
    moveStep(1)
  }
  const goBack = () => { moveStep(-1) }
  const handleSubmit = async () => {
    if (!fb.sliderMoved) { toast.error('رجاءً خمّن درجة التوافق في الخطوة 1'); return }
    if (fb.wantConnect === null) { toast.error('اختر ما إذا كنت تريد التواصل لاحقاً'); return }
    if (fb.wantConnect && !fb.contactMethod) { toast.error('اختر طريقة مشاركة معلومات التواصل'); return }
    if (fb.wantConnect && fb.contactMethod === 'message' && !fb.contactMessage.trim()) {
      toast.error('اكتب وسيلة التواصل التي تريد مشاركتها')
      return
    }
    setSubmitting(true)
    if (word.trim() && !wordSubmitted) {
      const wordOk = await onSubmitWord()
      if (!wordOk) {
        setSubmitting(false)
        return
      }
    }
    const ok = await onSubmit(fb)
    setSubmitting(false)
    if (ok) onDone()
  }
  const saveMemoryWord = async () => {
    if (!word.trim() || wordSubmitted || submitting) return
    setSubmitting(true)
    await onSubmitWord()
    setSubmitting(false)
  }
  const updateMemoryWord = (value: string) => {
    const firstWord = value.trimStart().split(/\s/u)[0] || ''
    onWordChange(Array.from(firstWord).slice(0, EVENT3_MEMORY_WORD_MAX_LENGTH).join(''))
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
          <motion.button type="button" key={i} whileTap={{ scale: 0.88 }} aria-pressed={selected} aria-label={`${label}، ${i + 1} من 5`}
            onClick={() => setFb(p => ({ ...p, [field]: i + 1 }))}
            className={`flex flex-col items-center gap-1.5 py-3 sm:py-4 rounded-2xl transition-all duration-200 ${selected ? 'bg-white/[0.06] ring-2 scale-105 ' + cfg.ring + ' ' + cfg.glow : 'bg-white/[0.03] ring-1 ring-white/[0.05] active:bg-white/8'}`}>
            <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-gradient-to-br ${cfg.gradient} flex items-center justify-center text-white transition-transform duration-200 ${selected ? 'scale-110' : 'scale-95 opacity-70'}`}>
              {cfg.icon}
            </div>
            <span className={`text-[11px] leading-tight text-center transition-colors duration-200 ${selected ? 'text-white font-semibold' : 'text-gray-300'}`}>{label}</span>
          </motion.button>
        )
      })}
    </div>
  )
  if (done) return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="event3-shell fixed inset-0 z-[240] flex flex-col items-center justify-start gap-6 overflow-y-auto bg-gray-950 px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] sm:justify-center sm:p-8" lang="ar" dir="rtl">
      <div className="relative">
        <Event3Mark size="compact" />
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 17, delay: 0.16 }}
          className="absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-300/25 bg-emerald-950/90 shadow-[0_0_30px_-5px_rgba(52,211,153,.75),inset_0_1px_0_rgba(255,255,255,.12)]">
          <CheckCircle size={20} className="text-emerald-300" />
        </motion.div>
      </div>
      <div className="space-y-2 text-center">
        <p dir="ltr" className="text-[9px] font-black uppercase tracking-[0.25em] text-emerald-200/55">FEEDBACK SECURED</p>
        <h2 className="bg-gradient-to-l from-white via-emerald-100 to-cyan-100 bg-clip-text text-2xl font-black text-transparent">شكراً لك</h2>
        <p className="text-sm text-gray-400">تم حفظ تقييمك بأمان — انتظر المرحلة التالية</p>
      </div>
      {!wordSubmitted && (
        <div className="event3-glass w-full max-w-sm rounded-[1.35rem] border border-violet-300/[0.14] p-4 text-right">
          <label htmlFor={`${memoryWordId}-done`} className="block text-sm font-black text-violet-100">كلمة واحدة تحفظ إحساسك باللقاء — اختياري</label>
          <p className="mt-1 text-xs leading-5 text-violet-100/60">تظهر لك أنت فقط في الكشف النهائي.</p>
          <div className="mt-3 flex gap-2">
            <input id={`${memoryWordId}-done`} value={word} onChange={event => updateMemoryWord(event.target.value)} maxLength={EVENT3_MEMORY_WORD_MAX_LENGTH} dir="auto" placeholder="مثال: مريح" className="min-h-12 min-w-0 flex-1 rounded-xl border border-white/[0.09] bg-black/30 px-3 text-base text-white outline-none placeholder:text-gray-600 focus:border-violet-300/40" />
            <button type="button" onClick={saveMemoryWord} disabled={!word.trim() || submitting} className="event3-action min-h-12 rounded-xl bg-gradient-to-l from-fuchsia-600 via-purple-600 to-violet-700 px-4 text-sm font-black text-white disabled:opacity-35">
              {submitting ? <Spinner size={16} /> : "حفظ"}
            </button>
          </div>
        </div>
      )}
      {isLastSession && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          className="event3-glass max-w-sm space-y-2 rounded-[1.35rem] border border-purple-300/[0.14] p-5 text-center"
        >
          <div className="flex items-center justify-center gap-2 text-purple-300">
            <Sparkles size={18} />
            <p className="font-bold text-sm">الكشف النهائي قادم</p>
          </div>
          <p className="text-gray-400 text-xs leading-relaxed">
            {choiceOnly
              ? "بعد أن تجهز النتائج، ستظهر لك مقارنة لقاءات الاختيار الثلاثة، والكلمات التي حفظتها، وقرارات التواصل المتبادلة."
              : "بعد أن يكمل جميع المشاركين تقييمهم، ستظهر لك صفحة النتائج النهائية مع تفاصيل التوافق الكاملة، ومقارنة بين اختيارك واختيار الخوارزمية، وتحليل ذكي للكيمياء بينك وبين شريكك."}
            ابقَ معنا — لا تغادر!
          </p>
        </motion.div>
      )}
    </motion.div>
  )
  return (
    <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="event3-shell fixed inset-0 z-[240] flex h-[100dvh] flex-col overflow-hidden bg-gray-950" dir="rtl" lang="ar" role="dialog" aria-modal="true" aria-labelledby={feedbackTitleId}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-80 h-80 bg-pink-600/20 rounded-full blur-[100px]" />
        <div className="absolute -bottom-20 right-1/4 w-72 h-72 bg-purple-600/15 rounded-full blur-[90px]" />
      </div>
      <div className="relative z-10 flex shrink-0 items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 sm:px-5">
        {step === 0 && backDisabled ? <span className="h-11 w-11" aria-hidden="true" /> : (
          <button type="button" onClick={step === 0 ? onBack : goBack} aria-label={step === 0 ? "العودة إلى الجلسة" : "الخطوة السابقة"}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.07] text-gray-300 transition-all hover:bg-white/[0.1] hover:text-white active:scale-90">
            <ChevronRight size={18} />
          </button>
        )}
        <div className="flex gap-1.5 flex-1 justify-center" role="progressbar" aria-label="تقدم تقييم الجلسة" aria-valuemin={1} aria-valuemax={STEPS} aria-valuenow={step + 1}>
          {Array.from({ length: STEPS }).map((_, i) => (
            <motion.div key={i} className="rounded-full h-2"
              animate={{ width: i === step ? 24 : 8, backgroundColor: i < step ? 'rgba(139,92,246,0.85)' : i === step ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.12)' }}
              transition={{ duration: 0.3 }} />
          ))}
        </div>
        <span className="w-11 text-left font-mono text-xs text-gray-300">{step + 1}/{STEPS}</span>
      </div>
      {partnerName && (
        <div className="relative z-10 mx-5 mb-1">
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${accent === "purple" ? "border-violet-900/40 bg-violet-950/40" : "border-pink-900/30 bg-pink-950/40"}`}>
            <Users size={10} className={accent === "purple" ? "text-violet-400" : "text-pink-400"} />
            <span className={`text-xs font-medium ${accent === "purple" ? "text-violet-300/80" : "text-pink-300/80"}`}>{partnerName}</span>
          </div>
        </div>
      )}
      <div className="event3-scroll relative z-10 min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 [scroll-padding-bottom:7rem] sm:px-5">
        <AnimatePresence mode="wait" custom={dir}>
          {step === 0 && (
            <motion.div key="s0" initial={{ opacity: 0, x: dir * 70 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -dir * 70 }}
              transition={{ type: 'spring', stiffness: 350, damping: 35 }} className="flex min-h-full flex-col justify-center space-y-5 py-2">
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
                      <p className="text-amber-300 text-xs font-black">قيّم اللقاء كما عشته</p>
                      <p className="text-xs leading-relaxed text-amber-100/75">
                        {choiceOnly
                          ? <>خمّن التوافق بناءً على <span className="font-bold text-amber-300">الشخصية والتفكير</span>. هذا التقدير يساعد المنظم على فهم جودة التجربة، ولا يغيّر ترتيبك أو شركاء هذه النسخة.</>
                          : <>خمّن التوافق بناءً على <span className="font-bold text-amber-300">الشخصية والتفكير</span>، وليس المظهر. نستخدم تقديرك لتحسين جودة المطابقات المستقبلية.</>}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </div>
              <div className="text-center space-y-2">
                <div className="inline-flex items-center gap-1.5 bg-purple-900/30 border border-purple-700/40 rounded-full px-3 py-1 mb-1">
                  <Brain size={11} className="text-purple-400" />
                  <span className="text-xs font-semibold text-purple-200">توافق فكري</span>
                </div>
                <h2 id={feedbackTitleId} ref={stepHeadingRef} tabIndex={-1} className="text-2xl font-black text-white focus:outline-none sm:text-3xl">خمّن درجة التوافق الفكري</h2>
                <p className="text-sm text-gray-300">لو كنت تخمّن نسبة التوافق الفكري بينكم — كم تعطي؟</p>
              </div>
              {/* Beautiful slider card */}
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                className="relative space-y-4 overflow-hidden rounded-3xl border border-purple-700/30 bg-gradient-to-br from-purple-950/40 via-violet-950/30 to-purple-950/20 p-4 shadow-xl shadow-purple-900/20 sm:space-y-5 sm:p-6">
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
                    className={`text-5xl font-black font-mono tabular-nums sm:text-6xl ${
                      fb.compatibilityRate >= 80 ? 'text-emerald-400' :
                      fb.compatibilityRate >= 60 ? 'text-amber-400' :
                      fb.compatibilityRate >= 40 ? 'text-orange-400' : 'text-red-400'
                    }`}
                    style={{ textShadow: fb.compatibilityRate >= 80 ? '0 0 30px rgba(16,185,129,0.3)' : fb.compatibilityRate >= 60 ? '0 0 30px rgba(245,158,11,0.3)' : '0 0 30px rgba(239,68,68,0.2)' }}
                  >
                    {fb.compatibilityRate}%
                  </motion.div>
                  <p className="mt-1 text-xs text-gray-300">{fb.compatibilityRate >= 80 ? 'توافق عالي جداً!' : fb.compatibilityRate >= 60 ? 'توافق جيد' : fb.compatibilityRate >= 40 ? 'توافق متوسط' : 'توافق منخفض'}</p>
                </div>
                {/* Slider */}
                <div className="relative z-10">
                  <div className="relative" style={{ direction: 'ltr' }}>
                    <input
                      type="range" min="0" max="100" step="5"
                      value={fb.compatibilityRate}
                      onChange={e => setFb(p => ({ ...p, compatibilityRate: parseInt(e.target.value), sliderMoved: true }))}
                      aria-label="درجة التوافق الفكري"
                      aria-valuetext={`${fb.compatibilityRate} بالمئة`}
                      className="e3-feedback-range h-11 w-full cursor-pointer appearance-none rounded-full py-4 [background-clip:content-box] focus:outline-none transition-all
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
                      .e3-feedback-range::-webkit-slider-thumb {
                        border-color: ${fb.compatibilityRate >= 80 ? '#10b981' : fb.compatibilityRate >= 60 ? '#f59e0b' : fb.compatibilityRate >= 40 ? '#f97316' : '#ef4444'} !important;
                      }
                      .e3-feedback-range::-moz-range-thumb {
                        border-color: ${fb.compatibilityRate >= 80 ? '#10b981' : fb.compatibilityRate >= 60 ? '#f59e0b' : fb.compatibilityRate >= 40 ? '#f97316' : '#ef4444'} !important;
                      }
                    `}</style>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-gray-400">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>
                {/* Hint */}
                {!fb.sliderMoved && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="relative z-10 text-center">
                    <p className="flex items-center justify-center gap-1.5 text-xs text-purple-200/80"><motion.span animate={{ x: [0, 4, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>👈</motion.span>حرّك المؤشر، أو ثبّت الدرجة الحالية</p>
                    <button type="button" onClick={() => setFb(p => ({ ...p, sliderMoved: true }))} className="mt-2 min-h-11 rounded-xl border border-purple-400/20 bg-purple-400/10 px-4 text-xs font-bold text-purple-200">50٪ يناسبني</button>
                  </motion.div>
                )}
              </motion.div>
              {/* Next button */}
              <motion.button type="button"
                onClick={() => { if (!fb.sliderMoved) { toast.error('حرّك المؤشر أولاً'); return } goNext() }}
                whileTap={{ scale: 0.97 }}
                disabled={!fb.sliderMoved}
                className="event3-action flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 to-violet-600 py-4 text-sm font-bold text-white transition-all disabled:opacity-30 disabled:shadow-none">
                متابعة <ChevronRight size={16} />
              </motion.button>
            </motion.div>
          )}
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: dir * 70 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -dir * 70 }}
              transition={{ type: 'spring', stiffness: 350, damping: 35 }} className="flex min-h-full flex-col justify-center space-y-5 py-4">
              <div className="text-center space-y-2">
                <h2 id={feedbackTitleId} ref={stepHeadingRef} tabIndex={-1} className="text-2xl font-black text-white focus:outline-none sm:text-3xl">كيف كان اللقاء؟</h2>
                <p className="text-sm text-gray-400">سؤالان سريعا — اختر أول إحساس صادق</p>
              </div>
              <p className="text-xs font-bold text-gray-300">جودة المحادثة</p>
              <RatingRow labels={["سيئة","ضعيفة","مقبولة","جيدة","ممتازة"]} field="conversationQuality" val={fb.conversationQuality} />
              <p className="text-xs font-bold text-gray-300">الراحة والتفاهم</p>
              <RatingRow labels={["لا شيء","ضعيف","مقبول","جيد","رائع"]} field="personalConnection" val={fb.personalConnection} />
              <motion.button type="button" onClick={() => goNext()} disabled={!fb.conversationQuality || !fb.personalConnection} whileTap={{ scale: 0.97 }} className="event3-action flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 to-violet-600 px-4 text-sm font-bold text-white transition disabled:opacity-30">
                متابعة <ChevronRight size={16} />
              </motion.button>
            </motion.div>
          )}
          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: dir * 70 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -dir * 70 }}
              transition={{ type: 'spring', stiffness: 350, damping: 35 }} className="flex min-h-full flex-col justify-center space-y-5 py-4">
              <div className="text-center space-y-2">
                <h2 id={feedbackTitleId} ref={stepHeadingRef} tabIndex={-1} className="text-2xl font-black text-white focus:outline-none sm:text-3xl">هل تريد التواصل لاحقاً؟</h2>
                <p className="text-sm text-gray-400">اختيارك سري، ولا يظهر إلا عند الموافقة المتبادلة</p>
              </div>
              <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.07] px-4 py-3 text-right">
                <p className="text-sm font-black text-emerald-200">موافقة متبادلة فقط</p>
                <p className="mt-1 text-xs leading-6 text-emerald-100/70">إذا اخترتما «نعم» كلاكما، تظهر معلومات التواصل في النتائج. غير ذلك لا يعرف الطرف الآخر إجابتك.</p>
              </div>
              <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="الرغبة في التواصل لاحقاً">
                <button type="button" role="radio" aria-checked={fb.wantConnect === true} onClick={() => setFb(p => ({ ...p, wantConnect: true }))}
                  className={`min-h-24 rounded-2xl border text-base font-black transition-all ${fb.wantConnect === true ? "border-emerald-400/55 bg-emerald-400/15 text-emerald-200 ring-2 ring-emerald-400/20" : "border-white/[0.08] bg-white/[0.035] text-gray-300"}`}>
                  <CheckCircle size={24} className="mx-auto mb-2" />نعم
                </button>
                <button type="button" role="radio" aria-checked={fb.wantConnect === false} onClick={() => setFb(p => ({ ...p, wantConnect: false, contactMethod: null, contactMessage: '' }))}
                  className={`min-h-24 rounded-2xl border text-base font-black transition-all ${fb.wantConnect === false ? "border-slate-300/35 bg-slate-300/10 text-slate-100 ring-2 ring-slate-300/15" : "border-white/[0.08] bg-white/[0.035] text-gray-300"}`}>
                  <X size={24} className="mx-auto mb-2" />لا
                </button>
              </div>
              <AnimatePresence initial={false}>
                {fb.wantConnect === true && (
                  <motion.div
                    key="contact-sharing-method"
                    initial={{ opacity: 0, height: 0, y: -8 }}
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -8 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.06] p-3.5 text-right">
                      <div>
                        <p className="text-sm font-black text-cyan-100">كيف تريد أن يتواصل معك؟</p>
                        <p className="mt-1 text-xs leading-5 text-cyan-100/60">لن نشارك إلا الخيار الذي تحدده، وفقط عند الموافقة المتبادلة.</p>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="طريقة مشاركة معلومات التواصل">
                        <button
                          type="button"
                          role="radio"
                          aria-checked={fb.contactMethod === 'phone'}
                          onClick={() => setFb(p => ({ ...p, contactMethod: 'phone', contactMessage: '' }))}
                          className={`flex min-h-14 items-center gap-3 rounded-xl border px-3 text-right transition ${fb.contactMethod === 'phone' ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-100 ring-1 ring-emerald-400/20' : 'border-white/[0.08] bg-white/[0.035] text-gray-300'}`}
                        >
                          <Smartphone size={19} className="shrink-0" />
                          <span>
                            <span className="block text-sm font-black">مشاركة رقم جوالي</span>
                            <span className="block text-[10px] font-medium opacity-65">يظهر رقمك المسجل للطرف الآخر</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={fb.contactMethod === 'message'}
                          onClick={() => setFb(p => ({ ...p, contactMethod: 'message' }))}
                          className={`flex min-h-14 items-center gap-3 rounded-xl border px-3 text-right transition ${fb.contactMethod === 'message' ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-100 ring-1 ring-cyan-400/20' : 'border-white/[0.08] bg-white/[0.035] text-gray-300'}`}
                        >
                          <MessageSquare size={19} className="shrink-0" />
                          <span>
                            <span className="block text-sm font-black">مشاركة وسيلة أخرى</span>
                            <span className="block text-[10px] font-medium opacity-65">بدون إظهار رقم جوالك</span>
                          </span>
                        </button>
                      </div>
                      <AnimatePresence initial={false}>
                        {fb.contactMethod === 'message' && (
                          <motion.div key="custom-contact-message" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                            <label htmlFor="event3-contact-message" className="mb-1.5 block text-xs font-bold text-cyan-100">اكتب وسيلة التواصل كما تريد أن تظهر</label>
                            <textarea
                              id="event3-contact-message"
                              value={fb.contactMessage}
                              onChange={event => setFb(p => ({ ...p, contactMessage: event.target.value }))}
                              placeholder="مثال: Instagram: @username أو Telegram: @username"
                              rows={3}
                              maxLength={EVENT3_CONTACT_MESSAGE_MAX_LENGTH}
                              dir="auto"
                              className="w-full resize-none rounded-xl border border-cyan-300/20 bg-slate-950/45 px-3 py-3 text-base text-white outline-none placeholder:text-gray-600 focus:border-cyan-300/45 focus:ring-2 focus:ring-cyan-400/10 sm:text-sm"
                            />
                            <div className="mt-1.5 flex items-start justify-between gap-3 text-[10px] leading-5 text-cyan-100/55">
                              <p>ستظهر هذه الرسالة للطرف الآخر كما كتبتها، ولن يظهر رقم جوالك.</p>
                              <span className="shrink-0 tabular-nums">{Array.from(fb.contactMessage).length}/{EVENT3_CONTACT_MESSAGE_MAX_LENGTH}</span>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="rounded-2xl border border-violet-400/20 bg-violet-400/[0.06] p-3.5 text-right">
                <label htmlFor={memoryWordId} className="block text-sm font-black text-violet-100">كلمة واحدة تحفظ إحساسك باللقاء — اختياري</label>
                <p className="mt-1 text-xs leading-5 text-violet-100/60">ستظهر لك أنت فقط في الكشف النهائي، ولن يراها شريكك.</p>
                <div className="mt-2 flex items-center gap-2">
                  <input id={memoryWordId} value={word} onChange={event => updateMemoryWord(event.target.value)} disabled={wordSubmitted} maxLength={EVENT3_MEMORY_WORD_MAX_LENGTH} dir="auto" placeholder="مثال: عفوي" className="min-h-12 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 text-base text-white outline-none placeholder:text-gray-600 disabled:text-violet-200" />
                  {wordSubmitted && <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-emerald-300"><CheckCircle size={15} /> محفوظة</span>}
                </div>
              </div>
              <details className="group rounded-2xl border border-white/[0.07] bg-white/[0.025] text-right">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-xs font-bold text-gray-400">
                  إضافة ملاحظة خاصة للمنظم — اختياري
                  <ChevronRight size={15} className="rotate-90 transition-transform group-open:-rotate-90" />
                </summary>
                <div className="border-t border-white/[0.06] p-3">
                  <textarea value={fb.organizerImpression} onChange={e => setFb(p => ({ ...p, organizerImpression: e.target.value }))} placeholder="مثلاً: شعرت بالراحة، أو احتجت وقتاً أطول..." rows={3} maxLength={300} aria-label="ملاحظة اختيارية للمنظم" className="w-full resize-none rounded-xl border border-white/[0.09] bg-white/[0.04] px-3 py-3 text-base text-white outline-none placeholder:text-gray-600 sm:text-sm" />
                </div>
              </details>
              <motion.button type="button" onClick={handleSubmit} disabled={submitting || fb.wantConnect === null || (fb.wantConnect === true && (!fb.contactMethod || (fb.contactMethod === 'message' && !fb.contactMessage.trim())))} aria-busy={submitting} whileTap={{ scale: 0.97 }} className="event3-action flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-500 via-violet-500 to-purple-600 px-4 text-base font-black text-white transition disabled:opacity-30">
                {submitting ? <><Spinner size={17} />جاري الإرسال...</> : <><Send size={17} />إرسال التقييم</>}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// ─── SOS / Organizer Chat Box ───────────────────────────────────────────────
function SOSButton({ token, position = 'top', sosRequests, suppressed = false }: { token: string; position?: 'top' | 'bottom'; sosRequests?: any[]; suppressed?: boolean }) {
  const panelId = useId()
  const panelTitleId = useId()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<{ id: string; text: string; from: 'user' | 'organizer'; status: string; timestamp?: string }[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [showOptions, setShowOptions] = useState(true)
  const [hasUnread, setHasUnread] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

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
    if (open) {
      setHasUnread(false)
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [open, messages])

  useEffect(() => {
    if (!open) return
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 50)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

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
    <div className={suppressed ? "hidden" : "contents"} aria-hidden={suppressed || undefined} inert={suppressed}>
      {/* Organizer button — centered with separator lines beside it */}
      <div className={`${position === 'bottom' ? 'relative' : 'fixed top-[68px]'} left-0 right-0 z-[190] flex items-center justify-center px-4 pb-5 pt-3 bg-gradient-to-t from-gray-950 via-gray-950/80 to-transparent flex-shrink-0`} dir="rtl">
        {/* Left separator */}
        <div className="flex-1 h-px bg-gradient-to-l from-gray-700/30 to-transparent max-w-[80px]" />
        {/* Button */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.04 }}
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`${buttonLabel} — تواصل مع المنظم`}
          animate={buttonState === 'idle' ? { scale: [1, 1.03, 1] } : {}}
          transition={buttonState === 'idle' ? { duration: 3, repeat: Infinity, ease: 'easeInOut' } : {}}
          className={`mx-3 flex min-h-11 items-center gap-2 rounded-full px-5 py-2 text-xs font-semibold transition-colors duration-300 ${
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
            id={panelId}
            initial={{ opacity: 0, y: position === 'bottom' ? 20 : -20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: position === 'bottom' ? 20 : -20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={`event3-glass fixed z-[300] flex w-[300px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-3xl border border-purple-300/[0.13] ${
              position === 'bottom' ? 'bottom-20 left-1/2 -translate-x-1/2' : 'top-[88px] left-1/2 -translate-x-1/2'
            }`}
            style={{ maxHeight: '60vh' }}
            role="dialog"
            aria-modal="false"
            aria-labelledby={panelTitleId}
            dir="rtl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.065] bg-white/[0.025] px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-xs font-bold text-white">ع</div>
                <div>
                  <h2 id={panelTitleId} className="text-white text-sm font-bold leading-tight">عبدالرحمن</h2>
                  <p className="text-gray-500 text-[10px] leading-tight">المنظم — تواصل مباشر</p>
                </div>
              </div>
              <button ref={closeButtonRef} type="button" onClick={() => setOpen(false)} aria-label="إغلاق محادثة المنظم"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.045] text-gray-300 transition-colors hover:bg-white/[0.08] hover:text-white">
                <X size={13} />
              </button>
            </div>

            {/* Messages area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 min-h-[120px]">
              {messages.length === 0 && showOptions && (
                <div className="space-y-2.5 py-2">
                  <div className="bg-amber-950/30 border border-amber-800/30 rounded-xl p-3 text-[10px] leading-relaxed text-amber-200/80 space-y-1.5">
                    <p className="font-bold text-amber-300 text-[11px]">قبل أن تطلب المساعدة:</p>
                    <p>عدم الإعجاب بالشخص أو المجموعة ليس سبباً صحيحاً لطلب المساعدة — كل جولة جديدة فرصة مختلفة، وتقييمك يساعدنا على تحسين التجربة.</p>
                    <p>استخدم هذا الزر فقط إذا: خالف أحدهم القواعد، أو لديك طارئ، أو لديك استفسار عام.</p>
                    <p className="text-amber-400/60">يمكنك استئناف المحادثات مع أي شخص بعد الفعالية إذا رغب الطرفان.</p>
                  </div>
                  <p className="text-center text-gray-600 text-xs mb-1">اختر نوع الطلب</p>
                  <button
                    type="button"
                    onClick={() => { setShowOptions(false); setInput(''); send('طلب مساعدة - أحتاج المنظم إلى طاولتي', 'organizer_needed') }}
                    className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-red-800/40 bg-red-950/30 px-4 py-3.5 text-right transition-all hover:bg-red-950/50"
                  >
                    <LifeBuoy size={18} className="text-red-400" />
                    <div>
                      <p className="text-red-300 text-sm font-semibold">طلب مساعدة</p>
                      <p className="text-gray-500 text-[11px]">سيأتي المنظم إلى طاولتك</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowOptions(false); setInput('') }}
                    className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-purple-800/40 bg-purple-950/30 px-4 py-3.5 text-right transition-all hover:bg-purple-950/50"
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
              <div className="border-t border-white/[0.065] bg-white/[0.02] p-2.5">
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={e => e.target.value.length <= 200 && setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
                    placeholder="اكتب رسالة..."
                    aria-label="رسالة خاصة إلى المنظم"
                    maxLength={200}
                    rows={1}
                    className="max-h-20 flex-1 resize-none rounded-2xl border border-white/[0.08] bg-black/30 px-3.5 py-2.5 text-base text-white transition-all placeholder:text-gray-500 focus:border-purple-300/35 focus:outline-none focus:ring-2 focus:ring-purple-500/10 sm:text-sm"
                    style={{ minHeight: '40px' }}
                  />
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={() => send(input)}
                    disabled={sending || !input.trim()}
                    aria-label="إرسال الرسالة"
                    aria-busy={sending}
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-pink-600 text-white transition-all disabled:opacity-30"
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
    </div>
  )
}

// ─── Phase 2 Reveal Screen ────────────────────────────────────────────────────
function Phase2RevealScreen({ token, eventId, timerActive, timerStart, timerDuration, correctedNow, eventFormat, onFeedbackOpenChange, feedbackLocked = false }: {
  token: string; eventId?: number | string; timerActive: boolean; timerStart: string | null; timerDuration: number; correctedNow?: () => number; eventFormat: Event3Format
  onFeedbackOpenChange?: (open: boolean) => void; feedbackLocked?: boolean
}) {
  const reduceMotion = useReducedMotion()
  const [revealed, setRevealed] = useState(false)
  const [tableRevealed, setTableRevealed] = useState(true)
  const [timeLeft, setTimeLeft] = useState(0)
  const [word, setWord] = useState("")
  const [wordSubmitted, setWordSubmitted] = useState(false)
  const [view, setView] = useState<'partner' | 'session' | 'feedback'>('partner')
  const [feedbackDone, setFeedbackDone] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const [showSessionTips, setShowSessionTips] = useState(false)
  const [rejoined, setRejoined] = useState(false)
  const [icebreakerDone, setIcebreakerDone] = useState(false)
  const [showTimeWarning, setShowTimeWarning] = useState(false)
  const { popup, clearPopup } = useTimerWarnings(timerActive, timeLeft, timerDuration, view === 'session', undefined, timerStart)

  useEffect(() => {
    onFeedbackOpenChange?.(view === 'feedback' && !feedbackDone)
  }, [view, feedbackDone, onFeedbackOpenChange])

  const fetchReveal = useCallback(async () => {
    const d = await call("e3-get-phase2-reveal", token)
    if (d.error) throw new Error(d.error)
    return d
  }, [token])

  const { data, loading, error, retry } = useApiPoll(fetchReveal, {
    interval: 5000,
    stopWhen: (d) => Boolean(d.partner_number && d.partner_first_name && d.table_number != null)
  })
  const choiceOnly = isChoiceOnlyEvent3(normalizeEvent3Format(data?.event_format, eventFormat))

  useEffect(() => {
    if (data?.my_word) { setWord(data.my_word); setWordSubmitted(true) }
    else setWordSubmitted(Boolean(data?.word_submitted))
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

  // The shared timer warning is the single escalation surface. Keeping a
  // second persistent banner here made the final minute feel alarm-heavy.

  const rejoinContext = useRef<string | null>(null)
  // Initialize once per meeting; timer edits and polling must not close feedback.
  // Auto-rejoin sync: if timer already running when component mounts, jump to correct view
  // Only auto-rejoin if the participant had already clicked "وصلت إلى الطاولة" before refresh
  useEffect(() => {
    if (!data || !timerActive || !timerStart) return
    const meetingKey = `${eventId}:phase2:${data.partner_number}`
    if (rejoinContext.current === meetingKey) return
    const firstSync = rejoinContext.current === null
    rejoinContext.current = meetingKey
    if (firstSync && view === 'feedback') return
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
  // Mobile browsers release wake locks when backgrounded; the shared hook
  // reacquires it when the participant returns to the active session.
  useScreenWakeLock(view === 'session')

  const canArrive = !timerActive || !timerStart || timeLeft <= timerDuration - 60
  const waitSeconds = Math.max(0, timeLeft - (timerDuration - 60))

  const handleReveal = () => {
    if (!canArrive) return
    setArrived(eventId, "phase2")
    setRevealed(true)
    if (!reduceMotion) fireConfetti({ particleCount: 55, spread: 65, origin: { y: 0.45 }, colors: ["#ec4899", "#f43f5e", "#fb7185", "#be185d"] })
  }

  const submitWord = async () => {
    if (!word.trim()) return false
    const d = await call("e3-submit-phase2-word", token, { word: word.trim() })
    if (!d.error) { setWordSubmitted(true); toast.success("تم حفظ كلمتك"); return true }
    toast.error(d.error || "تعذّر حفظ الكلمة. تحقق من الاتصال وحاول مجدداً.")
    return false
  }

  if (loading && !data && !error) return (
    <PageWrapper embedded className="flex items-center justify-center">
      <Spinner size={28} />
    </PageWrapper>
  )

  if (error && !data) return (
    <PageWrapper embedded className="flex items-center justify-center p-6 text-center">
      <GlassCard className="w-full max-w-sm space-y-4 rounded-[1.65rem] border-red-300/[0.13] p-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-red-400/20 bg-red-500/[0.08]">
          <AlertTriangle className="text-red-300" size={27} />
        </div>
        <div className="space-y-1">
          <p className="font-black text-white">تعذّر تحميل بيانات الجلسة</p>
          <p className="text-sm leading-6 text-gray-400">قد تكون المطابقة ما زالت قيد التجهيز. حاول مرة أخرى بعد لحظات.</p>
        </div>
        <button onClick={retry} className="event3-action flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-rose-600 via-red-600 to-red-700 px-5 text-sm font-black text-white">
          <RefreshCw size={16} /> إعادة المحاولة
        </button>
      </GlassCard>
    </PageWrapper>
  )

  return (
    <PageWrapper embedded>
      <div className="max-w-sm mx-auto p-4 pb-6 space-y-3">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="text-center pt-4 space-y-1">
          <div className="flex flex-col items-center gap-1.5">
            <div className="inline-flex items-center gap-2 bg-pink-900/30 border border-pink-700/40 text-pink-300 rounded-full px-4 py-1.5 text-sm font-semibold">
              <Users size={13} /> {data?.is_backup ? "جلسة فردية 1:1 · فرصة جديدة" : choiceOnly ? "جلسة فردية 1:1 · الاختيار الأول" : "جلسة فردية 1:1 · اختيارك أنت"}
            </div>
            <p className="text-gray-400 text-xs">{data?.is_backup ? "لقاء رتّبناه لك حتى يعيش الجميع التجربة كاملة" : choiceOnly ? "لقاء متبادل من أقوى الرتب الممكنة لهذه الجولة" : "لقاء خاص مع أفضل اختيار متبادل متاح من ترتيبك"}</p>
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {!tableRevealed ? (
            <motion.div key="pre-table" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-4">
              <motion.button onClick={() => setTableRevealed(true)} whileTap={{ scale: 0.97 }}
                className="event3-action w-full rounded-2xl bg-gradient-to-br from-pink-600 via-rose-600 to-pink-700 py-6 text-lg font-bold text-white">
                <motion.span animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 1.8, repeat: Infinity }} className="flex items-center justify-center gap-3">
                  <MapPin size={24} /> اعرف طاولتك
                </motion.span>
              </motion.button>
              {timerActive && timeLeft > 0 && (
                <div className="event3-glass overflow-hidden rounded-2xl border border-pink-300/[0.11]">
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
              <JourneyCue
                accent="pink"
                title={`اتجه الآن إلى طاولة ${data?.table_number ?? "—"}`}
                description="اسم شريكك يظهر هنا بمجرد تأكيد وصولك — ولن تحتاج للرجوع بحثاً عن التفاصيل."
                steps={["اتجه للطاولة", "قابل شريكك", "ابدأ الحوار"]}
                currentStep={0}
              />
              <MeetingPass accent="pink" kind={data?.is_backup ? "لقاء رتّبناه لك" : choiceOnly ? "لقاء الاختيار الأول" : "لقاء اختيارك"} tableNumber={data?.table_number} partnerHidden />

              {/* Arrival is an explicit confirmation so the reveal cannot disappear mid-read. */}
              {canArrive ? (
                <motion.button type="button" onClick={handleReveal} whileTap={{ scale: 0.97 }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
                  className="event3-action min-h-14 w-full rounded-2xl bg-gradient-to-br from-pink-600 via-rose-600 to-pink-700 px-4 py-4 text-lg font-bold text-white">
                  <span className="flex items-center justify-center gap-3">
                    <MapPin size={22} /> وصلت إلى الطاولة — اكشف شريكك
                  </span>
                </motion.button>
              ) : (
                <div className="text-center">
                  <p className="text-gray-400 text-xs">الدقيقة الأولى مخصّصة للانتقال — سيُفتح الكشف بعدها</p>
                </div>
              )}

              {/* Timer */}
              {timerActive && timeLeft > 0 && (
                <div className="event3-glass overflow-hidden rounded-2xl border border-pink-300/[0.11]">
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
              <MeetingPass
                accent="pink"
                kind={data?.is_backup ? "لقاء رتّبناه لك لضمان مشاركة الجميع" : choiceOnly ? "لقاء الاختيار الأول" : "لقاء اختيارك"}
                partnerName={data?.partner_first_name}
                tableNumber={data?.table_number}
                badge={data?.is_backup ? "لقاء جديد" : null}
              />
              <JourneyCue accent="pink" title={`ابدأ اللقاء مع ${data?.partner_first_name || "شريكك"}`} description="اسم الشريك والطاولة سيبقيان ظاهرين داخل مساحة الأسئلة." steps={["وصلت", "ابدأ الحوار", "قيّم اللقاء"]} currentStep={1} />

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
                      <p className="text-amber-300 text-sm font-bold">لقاء جديد</p>
                      <p className="text-amber-100/70 text-xs leading-relaxed">
                        رتّبنا لك هذا اللقاء لضمان مشاركة الجميع. قد يكون مع شخص لم تتعرف عليه جيداً بعد — خذه كفرصة جديدة بلا توقعات مسبقة.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {data && (
                <details className="group rounded-2xl border border-white/[0.07] bg-white/[0.03] text-right">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-xs font-bold text-gray-300">
                    لمحة اختيارية قبل اللقاء
                    <ChevronRight size={15} className="rotate-90 text-gray-500 transition-transform group-open:-rotate-90" />
                  </summary>
                  <div className="px-3 pb-3"><PartnerInfoCard data={data} accent="pink" /></div>
                </details>
              )}

              <motion.button
                type="button"
                onClick={() => setView('session')}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                className="event3-action flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-600 px-4 py-4 text-base font-black text-white transition-all hover:brightness-110 active:scale-[0.98]"
              >
                وصلت — ابدأ اللقاء
                <ArrowLeft size={17} />
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
            wordSubmitted={wordSubmitted}
            done={feedbackDone}
            onDone={() => setFeedbackDone(true)}
            onBack={() => setView('session')}
            backDisabled={feedbackLocked}
            onWordChange={setWord}
            onSubmitWord={submitWord}
            choiceOnly={choiceOnly}
            onSubmit={async (fbData) => {
              const d = await call('e3-submit-phase2-feedback', token, { feedback: fbData })
              if (!d.error) { toast.success('تم الحفظ'); return true }
              toast.error(d.error || 'تعذّر حفظ التقييم. تحقق من الاتصال وحاول مجددًا.')
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
            className="event3-shell fixed inset-0 z-[220] flex h-[100dvh] flex-col overflow-y-auto bg-gray-950"
          >
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
              <div className="absolute -top-32 -left-24 w-96 h-96 bg-pink-500/20 rounded-full blur-[100px]" />
              <div className="absolute top-1/2 -right-20 w-80 h-80 bg-rose-500/15 rounded-full blur-[90px]" />
              <div className="absolute -bottom-20 left-1/3 w-72 h-72 bg-fuchsia-500/15 rounded-full blur-[80px]" />
            </div>
            {/* Sticky header */}
            <div className="event3-status-header sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.06] px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <div className="min-w-0 text-right">
                <p className="text-[10px] font-bold text-pink-300">{choiceOnly ? "لقاء الاختيار الأول" : "لقاء اختيارك"} · طاولة {data?.table_number ?? "—"}</p>
                <p className="mt-0.5 truncate text-sm font-black text-white">مع {data?.partner_first_name || "شريكك"}</p>
              </div>
              <span className={`font-mono text-sm font-black tabular-nums ${timeLeft < 300 ? 'text-red-400' : 'text-pink-300'}`}>{formatTime(timeLeft)}</span>
            </div>

            {/* Ice breaker phase — full screen centered */}
            <AnimatePresence mode="wait">
              {!icebreakerDone ? (
                <motion.div key="icebreaker" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 p-5">
                  <JourneyCue accent="pink" eyebrow="بداية اللقاء" title="اختاروا بداية تناسبكم" description="التحدي اختياري؛ يمكنكم تخطيه والبدء مباشرة بأول سؤال." steps={["كسر جليد", "حوار", "تقييم"]} currentStep={0} />
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

                  <JourneyCue accent="pink" eyebrow="مساحة اللقاء" title="ابدأوا بالسؤال الظاهر" description="يجيب كل منكما، ثم اضغطوا التالي. غيّروا المسار فقط إذا أردتم موضوعاً مختلفاً." steps={["بدأتم", "حوار", "تقييم"]} currentStep={1} />

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
                        <button type="button" onClick={() => setShowTimeWarning(false)} aria-label="إخفاء تنبيه الوقت" className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-red-400/70 transition-colors hover:bg-white/5 hover:text-red-200">
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

                  <details className="group rounded-2xl border border-white/[0.07] bg-white/[0.025] text-right">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-xs font-bold text-gray-400">
                      تحتاجون مساعدة في إدارة الحوار؟
                      <ChevronRight size={15} className="rotate-90 transition-transform group-open:-rotate-90" />
                    </summary>
                    <div className="grid grid-cols-2 gap-2 border-t border-white/[0.06] p-3">
                      <button type="button" onClick={() => setShowSessionTips(true)} className="min-h-11 rounded-xl border border-white/[0.07] bg-white/[0.04] text-xs font-bold text-gray-300"><Sparkles size={13} className="ml-1 inline" />نصائح سريعة</button>
                      <button type="button" onClick={() => setShowTutorial(true)} className="min-h-11 rounded-xl border border-white/[0.07] bg-white/[0.04] text-xs font-bold text-gray-300"><Info size={13} className="ml-1 inline" />طريقة اللقاء</button>
                    </div>
                  </details>

                  {/* Jump to feedback manually */}
                  <motion.button
                    onClick={() => setView('feedback')}
                    whileTap={{ scale: 0.97 }}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                    className={`event3-action flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border py-3.5 text-sm font-bold transition-all ${timeLeft > 120 ? "border-white/[0.08] bg-white/[0.035] text-gray-400" : "border-pink-500/30 bg-gradient-to-r from-pink-700/80 to-rose-700/80 text-white shadow-lg shadow-pink-900/30"}`}
                  >
                    <CheckCircle size={16} />
                    إنهاء اللقاء والبدء بالتقييم
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>

          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Tutorial Overlay ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showTutorial && <OneToOneTutorial onClose={() => { setShowTutorial(false); try { sessionStorage.setItem('e3_tut_phase2', "1") } catch {} }} />}
      </AnimatePresence>

      {/* ── Timer Warning Popup ─────────────────────────────────────── */}
      <AnimatePresence>
        {popup && <TimerWarningPopup key={popup.seconds} {...popup} onDone={clearPopup} />}
      </AnimatePresence>
    </PageWrapper>
  )
}

// ─── Later one-to-one reveal screens ──────────────────────────────────────────
function Phase3RevealScreen({ token, eventId, timerActive, timerStart, timerDuration, correctedNow, eventFormat, matchSlot = 2, onFeedbackOpenChange, feedbackLocked = false }: {
  token: string; eventId?: number | string; timerActive: boolean; timerStart: string | null; timerDuration: number; correctedNow?: () => number; eventFormat: Event3Format; matchSlot?: 2 | 3
  onFeedbackOpenChange?: (open: boolean) => void; feedbackLocked?: boolean
}) {
  const reduceMotion = useReducedMotion()
  const [revealed, setRevealed] = useState(false)
  const [tableRevealed, setTableRevealed] = useState(true)
  const [timeLeft, setTimeLeft] = useState(0)
  const [word, setWord] = useState("")
  const [wordSubmitted, setWordSubmitted] = useState(false)
  const [view, setView] = useState<'partner' | 'session' | 'feedback'>('partner')
  const [feedbackDone, setFeedbackDone] = useState(false)
  const [showSessionTips, setShowSessionTips] = useState(false)
  const [showTimeWarning, setShowTimeWarning] = useState(false)
  const { popup, clearPopup } = useTimerWarnings(timerActive, timeLeft, timerDuration, view === 'session', undefined, timerStart)
  const isThirdChoice = matchSlot === 3
  const phaseKey = isThirdChoice ? "phase4" : "phase3"

  useEffect(() => {
    onFeedbackOpenChange?.(view === 'feedback' && !feedbackDone)
  }, [view, feedbackDone, onFeedbackOpenChange])

  const fetchReveal = useCallback(async () => {
    const d = await call(isThirdChoice ? "e3-get-phase4-reveal" : "e3-get-phase3-reveal", token)
    if (d.error) throw new Error(d.error)
    return d
  }, [token, isThirdChoice])

  const { data, loading, error, retry } = useApiPoll(fetchReveal, {
    // Keep polling while this screen is mounted so an organizer's live
    // algorithm-match replacement reaches every affected phone immediately.
    interval: 5000,
  })
  const choiceOnly = isChoiceOnlyEvent3(normalizeEvent3Format(data?.event_format, eventFormat))
  const meetingLabel = choiceOnly ? (isThirdChoice ? "لقاء الاختيار الثالث" : "لقاء الاختيار الثاني") : "لقاء اختيار النظام"
  const meetingKind = choiceOnly ? (isThirdChoice ? "الاختيار الثالث" : "الاختيار الثاني") : "اختيارنا لك"

  useEffect(() => {
    setWordSubmitted(Boolean(data?.word_submitted))
    if (data?.my_word) setWord(data.my_word)
    setFeedbackDone(Boolean(data?.feedback_submitted))
  }, [data?.partner_number, data?.word_submitted, data?.my_word, data?.feedback_submitted])

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

  // The shared timer warning is the single escalation surface.

  const rejoinContext = useRef<string | null>(null)
  // Auto-rejoin sync: show the table number before the session when returning
  // Only auto-rejoin if the participant had already clicked "وصلت إلى الطاولة" before refresh
  useEffect(() => {
    if (!data || !timerActive || !timerStart) return
    const meetingKey = `${eventId}:${phaseKey}:${data.partner_number}`
    if (rejoinContext.current === meetingKey) return
    const firstSync = rejoinContext.current === null
    rejoinContext.current = meetingKey
    if (firstSync && view === 'feedback') return
    const now = correctedNow ? correctedNow() : Date.now()
    const elapsed = Math.floor((now - new Date(timerStart).getTime()) / 1000)
    const remaining = Math.max(0, timerDuration - elapsed)
    const arrived = hasArrived(eventId, phaseKey)
    if (arrived && elapsed > 60 && remaining > 0) { setTableRevealed(true); setRevealed(true); setView('session') }
    else if (arrived && remaining <= 0) { setTableRevealed(true); setRevealed(true); setView('feedback') }
    else if (!arrived && remaining <= 0) { setTableRevealed(true); setRevealed(true); setView('feedback') }
  }, [data, timerActive, timerStart, timerDuration, eventId, correctedNow, phaseKey])

  // Transition to feedback when session time runs out
  useEffect(() => {
    if (view === 'session' && timerActive && timeLeft === 0) setView('feedback')
  }, [timeLeft, view, timerActive])

  // Auto-show tips on first entry to session view
  useScreenWakeLock(view === 'session')

  const canArrive = !timerActive || !timerStart || timeLeft <= timerDuration - 60
  const waitSeconds = Math.max(0, timeLeft - (timerDuration - 60))

  const handleReveal = () => {
    if (!canArrive) return
    setArrived(eventId, phaseKey)
    setRevealed(true)
    if (!reduceMotion) fireConfetti({ particleCount: 65, spread: 70, origin: { y: 0.4 }, colors: ["#7c3aed", "#8b5cf6", "#a78bfa", "#c4b5fd"] })
  }

  const submitWord = async () => {
    if (!word.trim()) return false
    const d = await call(isThirdChoice ? "e3-submit-phase4-word" : "e3-submit-phase3-word", token, { word: word.trim() })
    if (!d.error) { setWordSubmitted(true); toast.success("تم حفظ كلمتك"); return true }
    toast.error(d.error || "تعذّر حفظ الكلمة. تحقق من الاتصال وحاول مجدداً.")
    return false
  }

  if (loading && !data && !error) return (
    <PageWrapper embedded className="flex items-center justify-center">
      <Spinner size={28} />
    </PageWrapper>
  )

  if (error && !data) return (
    <PageWrapper embedded className="flex items-center justify-center p-6 text-center">
      <GlassCard className="w-full max-w-sm space-y-4 rounded-[1.65rem] border-red-300/[0.13] p-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-red-400/20 bg-red-500/[0.08]">
          <AlertTriangle className="text-red-300" size={27} />
        </div>
        <div className="space-y-1">
          <p className="font-black text-white">تعذّر تحميل بيانات الجلسة</p>
          <p className="text-sm leading-6 text-gray-400">{error}</p>
        </div>
        <button onClick={retry} className="event3-action flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-rose-600 via-red-600 to-red-700 px-5 text-sm font-black text-white">
          <RefreshCw size={16} /> إعادة المحاولة
        </button>
      </GlassCard>
    </PageWrapper>
  )

  return (
    <PageWrapper embedded>
      <div className="max-w-sm mx-auto p-4 pb-6 space-y-3">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="text-center pt-4 space-y-1">
          <div className="flex flex-col items-center gap-1.5">
            <div className="inline-flex items-center gap-2 bg-purple-900/30 border border-purple-700/40 text-purple-300 rounded-full px-4 py-1.5 text-sm font-semibold">
              {choiceOnly ? <Heart size={13} /> : <Brain size={13} />} جلسة فردية 1:1 · {meetingKind}
            </div>
            <p className="text-gray-400 text-xs">{choiceOnly ? (isThirdChoice ? "لقاء متبادل مع شخص ثالث بعد استبعاد الشريكين السابقين" : "لقاء متبادل جديد بعد استبعاد شريك اللقاء الأول") : "لقاء مع من رشّحه النظام بناءً على توافقكما — اكتشفه بلا توقعات مسبقة"}</p>
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {!tableRevealed ? (
            <motion.div key="pre-table" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-4">
              <motion.button onClick={() => setTableRevealed(true)} whileTap={{ scale: 0.97 }}
                className="event3-action w-full rounded-2xl bg-gradient-to-br from-purple-600 via-violet-600 to-purple-700 py-6 text-lg font-bold text-white">
                <motion.span animate={{ rotate: [0, -4, 4, 0] }} transition={{ duration: 3, repeat: Infinity }} className="flex items-center justify-center gap-3">
                  <MapPin size={24} /> اعرف طاولتك
                </motion.span>
              </motion.button>
              {timerActive && timeLeft > 0 && (
                <div className="event3-glass overflow-hidden rounded-2xl border border-purple-300/[0.11]">
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
              <JourneyCue
                accent="purple"
                title={`اتجه الآن إلى طاولة ${data?.table_number ?? "—"}`}
                description="اسم شريكك يظهر هنا بمجرد تأكيد وصولك — ولن تحتاج للرجوع بحثاً عن التفاصيل."
                steps={["اتجه للطاولة", "قابل شريكك", "ابدأ الحوار"]}
                currentStep={0}
              />
              <MeetingPass accent="purple" kind={meetingLabel} tableNumber={data?.table_number} partnerHidden />

              {/* Arrival is an explicit confirmation so the reveal cannot disappear mid-read. */}
              {canArrive ? (
                <motion.button type="button" onClick={handleReveal} whileTap={{ scale: 0.97 }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
                  className="event3-action min-h-14 w-full rounded-2xl bg-gradient-to-br from-purple-600 via-violet-600 to-purple-700 px-4 py-4 text-lg font-bold text-white">
                  <span className="flex items-center justify-center gap-3">
                    <MapPin size={22} /> وصلت إلى الطاولة — اكشف شريكك
                  </span>
                </motion.button>
              ) : (
                <div className="text-center">
                  <p className="text-gray-400 text-xs">الدقيقة الأولى مخصّصة للانتقال — سيُفتح الكشف بعدها</p>
                </div>
              )}

              {/* Timer */}
              {timerActive && timeLeft > 0 && (
                <div className="event3-glass overflow-hidden rounded-2xl border border-purple-300/[0.11]">
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
              {!choiceOnly && data?.same_as_phase2 && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-r from-amber-900/40 to-yellow-900/30 border border-amber-700/50 rounded-2xl p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2"><Trophy size={22} className="text-amber-400" /></div>
                  <p className="text-amber-300 font-black text-base">مطابقة مثالية!</p>
                  <p className="text-amber-400/70 text-xs mt-0.5">اخترت نفس الشخص الذي اختارته الخوارزمية</p>
                </motion.div>
              )}

              <MeetingPass accent="purple" kind={meetingLabel} partnerName={data?.partner_first_name} tableNumber={data?.table_number} badge={!choiceOnly && data?.same_as_phase2 ? "تطابق مثالي" : null} />
              <JourneyCue accent="purple" title={`ابدأ اللقاء مع ${data?.partner_first_name || "شريكك"}`} description="اسم الشريك والطاولة سيبقيان ظاهرين داخل مساحة الأسئلة." steps={["وصلت", "ابدأ الحوار", "قيّم اللقاء"]} currentStep={1} />

              {data && (
                <details className="group rounded-2xl border border-white/[0.07] bg-white/[0.03] text-right">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-xs font-bold text-gray-300">
                    لمحة اختيارية قبل اللقاء
                    <ChevronRight size={15} className="rotate-90 text-gray-500 transition-transform group-open:-rotate-90" />
                  </summary>
                  <div className="px-3 pb-3"><PartnerInfoCard data={data} accent="purple" /></div>
                </details>
              )}

              <motion.button
                type="button"
                onClick={() => setView('session')}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                className="event3-action flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-4 text-base font-black text-white transition-all hover:brightness-110 active:scale-[0.98]"
              >
                وصلت — ابدأ اللقاء
                <ArrowLeft size={17} />
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
            className="event3-shell fixed inset-0 z-[220] flex h-[100dvh] flex-col overflow-y-auto bg-gray-950"
          >
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
              <div className="absolute -top-32 -right-24 w-96 h-96 bg-purple-500/20 rounded-full blur-[100px]" />
              <div className="absolute top-1/2 -left-20 w-80 h-80 bg-violet-500/15 rounded-full blur-[90px]" />
              <div className="absolute -bottom-20 right-1/3 w-72 h-72 bg-indigo-500/15 rounded-full blur-[80px]" />
            </div>
            <div className="event3-status-header sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.06] px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <div className="min-w-0 text-right">
                <p className="text-[10px] font-bold text-violet-300">{meetingLabel} · طاولة {data?.table_number ?? "—"}</p>
                <p className="mt-0.5 truncate text-sm font-black text-white">مع {data?.partner_first_name || "شريكك"}</p>
              </div>
              <span className={`font-mono text-sm font-black tabular-nums ${timeLeft < 300 ? 'text-red-400' : 'text-purple-300'}`}>{formatTime(timeLeft)}</span>
            </div>

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
                          {choiceOnly ? <Heart size={15} className="text-purple-400" /> : <Brain size={15} className="text-purple-400" />}
                        </motion.div>
                        <div>
                          <p className="text-gray-500 text-[10px] leading-none mb-0.5">شريكك</p>
                          <p className="text-purple-300 font-bold text-sm leading-none">{data?.partner_first_name}</p>
                        </div>
                      </div>
                      {data?.table_number && (
                        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 }}
                          className="flex items-center gap-2">
                          {!choiceOnly && data?.same_as_phase2 && <span className="text-amber-400 text-[10px] font-medium bg-amber-500/10 border border-amber-600/30 rounded-full px-2 py-0.5">مطابقة</span>}
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-600/30">
                            <MapPin size={12} className="text-amber-400" />
                            <span className="text-amber-300 text-xs font-bold">طاولة {data.table_number}</span>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>

                  <JourneyCue accent="purple" eyebrow="مساحة اللقاء" title="ابدأوا بالسؤال الظاهر" description="يجيب كل منكما، ثم اضغطوا التالي. غيّروا المسار فقط إذا أردتم موضوعاً مختلفاً." steps={["بدأتم", "حوار", "تقييم"]} currentStep={1} />

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
                        <button type="button" onClick={() => setShowTimeWarning(false)} aria-label="إخفاء تنبيه الوقت" className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-red-400/70 transition-colors hover:bg-white/5 hover:text-red-200">
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
                    <QuestionSlideshow defaultSet={isThirdChoice ? "set2" : "set1"} />
                  </motion.div>

                  <details className="group rounded-2xl border border-white/[0.07] bg-white/[0.025] text-right">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-xs font-bold text-gray-400">
                      تحتاجون مساعدة في إدارة الحوار؟
                      <ChevronRight size={15} className="rotate-90 transition-transform group-open:-rotate-90" />
                    </summary>
                    <div className="border-t border-white/[0.06] p-3">
                      <button type="button" onClick={() => setShowSessionTips(true)} className="min-h-11 w-full rounded-xl border border-white/[0.07] bg-white/[0.04] text-xs font-bold text-gray-300"><Sparkles size={13} className="ml-1 inline" />طريقة استخدام الأسئلة</button>
                    </div>
                  </details>

                  {/* Jump to feedback */}
                  <motion.button
                    onClick={() => setView('feedback')}
                    whileTap={{ scale: 0.97 }}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                    className={`event3-action flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border py-3.5 text-sm font-bold transition-all ${timeLeft > 120 ? "border-white/[0.08] bg-white/[0.035] text-gray-400" : "border-violet-500/30 bg-gradient-to-r from-purple-700/80 to-violet-700/80 text-white shadow-lg shadow-purple-900/30"}`}
                  >
                    <CheckCircle size={16} />
                    إنهاء اللقاء والبدء بالتقييم
                  </motion.button>
            </motion.div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Feedback View (Phase 3) ──────────────────────────────────────────── */}
      <AnimatePresence>
        {view === 'feedback' && (
          <FeedbackFlow
            partnerName={data?.partner_first_name || null}
            word={word}
            wordSubmitted={wordSubmitted}
            done={feedbackDone}
            onDone={() => setFeedbackDone(true)}
            onBack={() => setView('session')}
            backDisabled={feedbackLocked}
            onWordChange={setWord}
            onSubmitWord={submitWord}
            isLastSession={!choiceOnly || isThirdChoice}
            accent="purple"
            choiceOnly={choiceOnly}
            onSubmit={async (fbData) => {
              const d = await call(isThirdChoice ? 'e3-submit-phase4-feedback' : 'e3-submit-phase3-feedback', token, { feedback: fbData })
              if (!d.error) { toast.success('تم الحفظ'); return true }
              toast.error(d.error || 'تعذّر حفظ التقييم. تحقق من الاتصال وحاول مجددًا.')
              return false
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Timer Warning Popup ─────────────────────────────────────── */}
      <AnimatePresence>
        {popup && <TimerWarningPopup key={popup.seconds} {...popup} onDone={clearPopup} />}
      </AnimatePresence>
    </PageWrapper>
  )
}

// ─── Processing Screen (phase2_processing / phase3_processing) ────────────────
function ProcessingScreen({ phase, eventFormat }: { phase: string; eventFormat: Event3Format }) {
  const isPhase2 = phase === "phase2_processing"
  const isPhase4 = phase === "phase4_processing"
  const choiceOnly = isChoiceOnlyEvent3(eventFormat)
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-10" dir="rtl">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.58, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md space-y-4 text-center"
      >
        <section className="event3-glass relative overflow-hidden rounded-[2rem] border border-purple-300/[0.12] px-6 py-7">
          <div className="pointer-events-none absolute -right-20 -top-20 h-44 w-44 rounded-full bg-purple-500/[0.13] blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-40 w-40 rounded-full bg-cyan-500/[0.08] blur-3xl" aria-hidden="true" />
          <Event3Mark className="mb-3" />
          <span dir="ltr" className="inline-flex items-center gap-2 rounded-full border border-cyan-300/[0.12] bg-cyan-300/[0.05] px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.24em] text-cyan-100/60">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,.7)]" /> Match Engine · Live
          </span>
          <h1 className="mt-3 bg-gradient-to-l from-white via-purple-100 to-fuchsia-200 bg-clip-text text-2xl font-black text-transparent">
            {isPhase2 ? (choiceOnly ? "ننسّق لقاء الاختيار الأول" : "ننسّق اختيارك") : isPhase4 ? "ننسّق لقاء الاختيار الثالث" : (choiceOnly ? "ننسّق لقاء الاختيار الثاني" : "نجهّز ترشيح النظام")}
          </h1>
          <p className="mx-auto mt-3 max-w-xs text-sm leading-7 text-gray-400">
            لا تحتاج إلى إجراء أي شيء الآن. ابقَ في هذه الشاشة وسننقلك تلقائيًا عند جاهزية اللقاء.
          </p>
          <div className="mt-5 flex items-center justify-center gap-1.5" aria-hidden="true">
            {[0, 1, 2].map(index => (
              <motion.span key={index} className={`h-1.5 rounded-full ${index === 1 ? "w-8 bg-gradient-to-r from-purple-400 to-cyan-300" : "w-1.5 bg-purple-300/40"}`} animate={{ opacity: [0.25, 1, 0.25] }} transition={{ duration: 1.35, repeat: Infinity, delay: index * 0.22 }} />
            ))}
          </div>
        </section>
        <JourneyCue
          eyebrow="الآن"
          title="استراحة قصيرة"
          description={isPhase2
            ? `التالي: سنعرض ${choiceOnly ? "لقاءك المتبادل الأول" : "اسم الشخص الذي اختارك أيضاً"} ورقم طاولتك.`
            : `التالي: سنعرض ${choiceOnly ? (isPhase4 ? "لقاءك المتبادل الثالث مع شخص جديد" : "لقاءك المتبادل الثاني مع شخص جديد") : "ترشيح النظام"} ورقم طاولتك.`}
          steps={["انتظر هنا", "اعرف الشريك والطاولة", "ابدأ اللقاء"]}
          currentStep={0}
          accent={isPhase2 ? "pink" : "purple"}
        />
      </motion.div>
    </div>
  )
}

// ─── Break Screen ─────────────────────────────────────────────────────────────
function BreakScreen({ timerActive, timerStart, timerDuration, correctedNow, eventFormat, onOpenGroupFeedback }: {
  timerActive: boolean; timerStart: string | null; timerDuration: number; correctedNow?: () => number; eventFormat: Event3Format; onOpenGroupFeedback: () => void
}) {
  const choiceOnly = isChoiceOnlyEvent3(eventFormat)
  const [timeLeft, setTimeLeft] = useState(0)
  const [showBreakWarning, setShowBreakWarning] = useState(false)
  const { popup, clearPopup } = useTimerWarnings(timerActive, timeLeft, timerDuration, true, undefined, timerStart)

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
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-10" dir="rtl">
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
          className="relative mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full"
        >
          <span className="absolute -inset-4 rounded-full bg-teal-400/[0.11] blur-2xl" aria-hidden="true" />
          <span className="absolute inset-0 rounded-full border border-teal-300/25 bg-gradient-to-br from-teal-400/[0.14] via-cyan-400/[0.06] to-purple-500/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,.12),0_18px_45px_-22px_rgba(45,212,191,.75)]" aria-hidden="true" />
          <span className="absolute inset-2 rounded-full border border-white/[0.08] bg-black/25" aria-hidden="true" />
          <Coffee className="relative h-11 w-11 text-teal-200 [filter:drop-shadow(0_0_10px_rgba(45,212,191,.45))]" />
        </motion.div>

        <p dir="ltr" className="mb-2 text-[8px] font-black uppercase tracking-[0.28em] text-teal-100/45">INTERMISSION · RESET</p>
        <h1 className="mb-3 bg-gradient-to-l from-white via-teal-100 to-cyan-200 bg-clip-text text-3xl font-black text-transparent">اشحن طاقتك للقاء القادم ☕</h1>
        <p className="mb-7 text-sm leading-6 text-gray-400">
          الآن وقت القهوة — خذ قهوتك من المقهى واستعد لجولتك الفردية
        </p>

        {timerActive && timeLeft > 0 ? (
          <div className="event3-glass mb-7 rounded-[1.4rem] border border-teal-300/[0.12] px-4 py-4">
            <motion.div
              animate={timeLeft <= 60 ? { scale: [1, 1.03, 1] } : {}}
              transition={timeLeft <= 60 ? { duration: 1, repeat: Infinity } : {}}
              className={`mb-4 font-mono text-5xl font-black ${timeLeft <= 60 ? 'text-amber-300' : 'text-teal-200'}`}
              style={timeLeft <= 60 ? { textShadow: "0 0 20px rgba(251,191,36,0.3)" } : {}}
            >
              {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
            </motion.div>
            <div className="h-1.5 overflow-hidden rounded-full bg-black/35 ring-1 ring-white/[0.04]">
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
                  <button type="button" onClick={() => setShowBreakWarning(false)} aria-label="إخفاء تنبيه الوقت" className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-amber-400/70 transition-colors hover:bg-white/5 hover:text-amber-200">
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

        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={onOpenGroupFeedback}
          className="event3-action group mb-4 flex min-h-16 w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-purple-500/[0.2] via-fuchsia-500/[0.13] to-teal-500/[0.16] px-4 py-3 text-right transition hover:brightness-110"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-purple-300/20 bg-purple-400/15 text-purple-200 transition group-hover:scale-105">
            <PenLine size={19} />
          </div>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black text-white">راجع وعدّل تقييمات المجموعات</span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-gray-400">أكمل من فاتك أو غيّر انطباعك السابق بسرية</span>
          </span>
          <span className="hidden shrink-0 rounded-full border border-emerald-300/15 bg-emerald-400/10 px-2 py-1 text-[9px] font-black text-emerald-200 min-[360px]:inline-flex">تقييمك سري</span>
          <ChevronRight size={16} className="hidden shrink-0 rotate-180 text-purple-200/70 min-[360px]:block" />
        </motion.button>

        <div className="event3-glass space-y-3 rounded-2xl border border-teal-300/[0.12] p-5 text-right">
          <p className="text-teal-300 font-bold text-sm text-center">ماذا سيحدث بعد الاستراحة؟</p>
          <div className="space-y-3 text-gray-300 text-sm leading-relaxed">
            <div className="flex items-start gap-2">
              <span className="text-teal-400 mt-0.5 shrink-0">١.</span>
              <span>تبدأ مرحلة مدتها <b className="text-white">20 دقيقة</b>: الدقيقة الأولى للتوجه إلى الطاولة وكشف الشريك، ثم <b className="text-pink-300">{choiceOnly ? "لقاء واحد لواحد مع اختيارك الأول" : "لقاء واحد لواحد مع اختيارك"}</b>. بعدها ستشاركنا انطباعك.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-teal-400 mt-0.5 shrink-0">٢.</span>
              <span>ثم تبدأ مرحلة ثانية مدتها <b className="text-white">20 دقيقة</b>، تشمل دقيقة الانتقال، للقاء <b className="text-purple-300">{choiceOnly ? "اختيارك الثاني" : "اختيارنا"}</b>. {choiceOnly ? "سيكون مع شخص مختلف عن اللقاء الأول،" : ""} وبعدها تقيّمه.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-teal-400 mt-0.5 shrink-0">٣.</span>
              <span>{choiceOnly ? <>بعدها تبدأ مرحلة ثالثة مدتها <b className="text-white">20 دقيقة</b>، تشمل دقيقة الانتقال، للقاء <b className="text-violet-300">اختيارك الثالث</b> مع شخص مختلف عن اللقاءين السابقين، ثم تقيّمه.</> : <>أخيرًا، ستشاهد نتيجتك النهائية وتحليل التوافق لكلا اللقاءين. ✨</>}</span>
            </div>
            {choiceOnly && (
              <div className="flex items-start gap-2">
                <span className="text-teal-400 mt-0.5 shrink-0">٤.</span>
                <span>أخيرًا، ستشاهد نتيجتك النهائية وتقارن اللقاءات الثلاثة. ✨</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Timer Warning Popup ─────────────────────────────────────── */}
      <AnimatePresence>
        {popup && <TimerWarningPopup key={popup.seconds} {...popup} onDone={clearPopup} />}
      </AnimatePresence>
    </div>
  )
}

// ─── Final Reveal Screen ──────────────────────────────────────────────────────
function RevealCard({ icon, label, name, score, word, revealed, accent }: {
  icon: "heart" | "brain"; label: string; name: string; score: number | null | undefined; word: string | null; revealed: boolean; accent: "pink" | "purple"
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
          aria-hidden={!revealed}
          inert={!revealed}
          className={`relative overflow-hidden rounded-2xl border shadow-xl h-full flex flex-col items-center justify-center p-5 space-y-2.5 ${isPink ? "border-pink-800/40 shadow-pink-900/20 bg-gradient-to-br from-pink-950/40 to-rose-950/20" : "border-purple-800/40 shadow-purple-900/20 bg-gradient-to-br from-purple-950/40 to-violet-950/20"}`}
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
        >
          <div className={`absolute top-0 inset-x-0 h-px ${isPink ? "bg-gradient-to-r from-transparent via-pink-400/50 to-transparent" : "bg-gradient-to-r from-transparent via-purple-400/50 to-transparent"}`} />
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isPink ? "bg-pink-900/50 border border-pink-700/40" : "bg-purple-900/50 border border-purple-700/40"}`}>
            <Icon size={18} className={isPink ? "text-pink-400" : "text-purple-400"} />
          </div>
          <p className={`text-[10px] font-semibold tracking-wide uppercase ${isPink ? "text-pink-400/70" : "text-purple-400/70"}`}>{label}</p>
          <motion.p className="line-clamp-2 w-full break-words text-center text-lg font-black leading-tight text-white sm:text-xl" initial={{ scale: 0.5 }} animate={{ scale: revealed ? 1 : 0.5 }} transition={{ delay: 0.4, type: "spring", stiffness: 300 }}>{name}</motion.p>
          {typeof score === "number" && Number.isFinite(score) && (
            <div className="flex items-baseline gap-0.5">
              <span className={`font-black text-lg ${isPink ? "text-pink-300" : "text-purple-300"}`}>{score}</span>
              <span className={isPink ? "text-pink-400/50 text-xs" : "text-purple-400/50 text-xs"}>%</span>
            </div>
          )}
          {word && (
            <span className={`text-xs rounded-full px-2.5 py-0.5 ${isPink ? "bg-pink-900/40 text-pink-300 border border-pink-800/40" : "bg-purple-900/40 text-purple-300 border border-purple-800/40"}`}>"{word}"</span>
          )}
        </div>
        {/* Back — hidden */}
        <div
          aria-hidden={revealed}
          inert={revealed}
          className="event3-glass absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-purple-300/[0.1] p-5"
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 1.8, repeat: Infinity }} className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-300/[0.1] bg-purple-400/[0.07] shadow-[0_0_22px_-8px_rgba(192,132,252,.8)]">
            <Sparkles size={18} className="text-purple-200/50" />
          </motion.div>
          <p className="mt-2 text-xs font-bold text-purple-100/25">؟</p>
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
        role="status" aria-live="polite" className={`event3-glass overflow-hidden rounded-2xl border ${isPink ? "border-pink-400/[0.14]" : "border-purple-400/[0.14]"}`}>
        <div className={`px-4 py-3 border-b flex items-center justify-between ${isPink ? "border-pink-800/30" : "border-purple-800/30"}`}>
          <div className="flex items-center gap-2">
            <Sparkles size={14} className={isPink ? "text-pink-400" : "text-purple-400"} />
            <span className={`font-bold text-xs ${isPink ? "text-pink-300" : "text-purple-300"}`}>التحليل الذكي</span>
          </div>
          <button type="button" onClick={() => setShown(false)} aria-label="إغلاق التحليل الذكي" className="flex h-11 w-11 items-center justify-center rounded-full text-gray-300 transition-colors hover:bg-white/[0.06] hover:text-white"><X size={16} /></button>
        </div>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
          className="text-gray-300 text-xs leading-relaxed whitespace-pre-wrap text-right p-4">{analysis}</motion.p>
      </motion.div>
    )
  }

  return (
    <motion.button type="button" onClick={generate} disabled={generating} aria-busy={generating} whileTap={{ scale: 0.97 }}
      className={`event3-action flex min-h-11 w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all disabled:opacity-60 ${isPink ? "bg-pink-950/30 border border-pink-400/[0.16] text-pink-300 hover:bg-pink-950/50" : "bg-purple-950/30 border border-purple-400/[0.16] text-purple-300 hover:bg-purple-950/50"}`}>
      {generating ? (
        <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> جاري التحليل…</>
      ) : (
        <><Sparkles size={13} /> {title}</>
      )}
    </motion.button>
  )
}

function FinalRevealScreen({ token, impersonating = false, onQuestionViewerChange, eventFormat }: { token: string; impersonating?: boolean; onQuestionViewerChange?: (open: boolean) => void; eventFormat: Event3Format }) {
  const reduceMotion = useReducedMotion()
  const [revealed, setRevealed] = useState(false)
  const [matchPref, setMatchPref] = useState<string | null>(null)
  const [prefSubmitting, setPrefSubmitting] = useState(false)
  const [currentEventId, setCurrentEventId] = useState<number>(1)
  const [activeTab, setActiveTab] = useState<"choice" | "algorithm">("choice")
  const [screenMode, setScreenMode] = useState<"reveal" | "questions">("reveal")
  const [questionPhase, setQuestionPhase] = useState<"phase1" | "phase2" | "phase3">("phase2")
  const [readinessTimedOut, setReadinessTimedOut] = useState(false)
  const [readinessAttempt, setReadinessAttempt] = useState(0)
  const revealStarted = useRef(false)

  const fetchFinalReveal = useCallback(async () => {
    const d = await call("e3-get-final-reveal", token)
    if (d.error) throw new Error(d.error)
    return d
  }, [token])

  const { data, loading, error, retry } = useApiPoll(fetchFinalReveal, {
    interval: 5000,
    stopWhen: (d) => Boolean(
      d.phase2?.partner_number
      && d.phase2?.partner_first_name
      && d.phase3?.partner_number
      && d.phase3?.partner_first_name
      && (!isChoiceOnlyEvent3(normalizeEvent3Format(d?.event_format, eventFormat)) || (d.phase4?.partner_number && d.phase4?.partner_first_name))
    )
  })
  const choiceOnly = isChoiceOnlyEvent3(normalizeEvent3Format(data?.event_format, eventFormat))
  const finalResultsReady = Boolean(
    data?.phase2?.partner_number
    && data?.phase2?.partner_first_name
    && data?.phase3?.partner_number
    && data?.phase3?.partner_first_name
    && (!choiceOnly || (data?.phase4?.partner_number && data?.phase4?.partner_first_name))
  )
  const sameMatch = !choiceOnly && Boolean(data?.same_match)
  const resultsHref = `/results?token=${encodeURIComponent(token)}${impersonating ? "&impersonate=1" : ""}`

  useEffect(() => {
    if (finalResultsReady) {
      setReadinessTimedOut(false)
      return
    }
    const timeout = window.setTimeout(() => setReadinessTimedOut(true), 30_000)
    return () => window.clearTimeout(timeout)
  }, [finalResultsReady, readinessAttempt])

  useEffect(() => {
    onQuestionViewerChange?.(screenMode === "questions")
  }, [screenMode, onQuestionViewerChange])

  useEffect(() => () => onQuestionViewerChange?.(false), [onQuestionViewerChange])

  useEffect(() => {
    if (!data) return
    setMatchPref(data.match_preference || null)
    setCurrentEventId(data.current_event_id || 1)
    if (!finalResultsReady) return
    if (revealStarted.current) return
    revealStarted.current = true
    const timer = setTimeout(() => {
      setRevealed(true)
      if (!reduceMotion) fireConfetti({ particleCount: 60, spread: 65, origin: { y: 0.35 }, colors: ["#a855f7", "#ec4899", "#f43f5e", "#fbbf24"] })
    }, 500)
    return () => clearTimeout(timer)
  }, [data, finalResultsReady, reduceMotion])

  const submitPref = async (pref: string) => {
    setPrefSubmitting(true)
    const d = await call("e3-submit-match-preference", token, { preference: pref })
    setPrefSubmitting(false)
    if (!d.error) { setMatchPref(pref); toast.success("تم حفظ تفضيلك") }
    else toast.error("حدث خطأ")
  }
  const retryFinalReveal = () => {
    setReadinessTimedOut(false)
    setReadinessAttempt(attempt => attempt + 1)
    retry()
  }

  if (loading) return <PageWrapper embedded className="flex items-center justify-center"><Spinner size={28} /></PageWrapper>
  if (error && !data) return (
    <PageWrapper embedded className="flex items-center justify-center p-6 text-center">
      <GlassCard className="w-full max-w-sm space-y-4 rounded-[1.65rem] border-amber-300/[0.14] p-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-400/[0.08]"><AlertTriangle className="text-amber-300" size={27} /></div>
        <div className="space-y-1">
          <p className="font-black text-white">النتائج النهائية ليست جاهزة بعد</p>
          <p className="text-sm text-gray-400">انتظر لحظات ثم حاول مرة أخرى.</p>
        </div>
        <button onClick={retryFinalReveal} className="event3-action flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 text-sm font-black text-gray-950">
          <RefreshCw size={16} /> إعادة المحاولة
        </button>
      </GlassCard>
    </PageWrapper>
  )
  if (!data) return <PageWrapper embedded className="flex items-center justify-center text-gray-500 text-sm">لا توجد نتائج بعد</PageWrapper>
  if (!finalResultsReady && readinessTimedOut) return (
    <PageWrapper embedded className="flex items-center justify-center p-6 text-center" role="alert">
      <GlassCard className="w-full max-w-sm space-y-4 rounded-[1.65rem] border-amber-300/[0.14] p-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-400/[0.08]"><AlertTriangle className="text-amber-300" size={27} /></div>
        <div className="space-y-2">
          <p className="font-black text-white">إحدى نتائجك لم تكتمل بعد</p>
          <p className="text-sm leading-6 text-gray-400">أبلغ المنظم ليراجع توزيع اللقاءات قبل الكشف النهائي. سنواصل التحقق تلقائياً، ويمكنك المحاولة الآن أيضاً.</p>
        </div>
        <button type="button" onClick={retryFinalReveal} className="event3-action flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 text-sm font-black text-gray-950">
          <RefreshCw size={16} /> تحقق الآن
        </button>
      </GlassCard>
    </PageWrapper>
  )
  if (!finalResultsReady) return (
    <PageWrapper embedded className="flex flex-col items-center justify-center gap-4 p-6 text-center" role="status" aria-live="polite">
      <Spinner size={28} />
      <div>
        <p className="font-bold text-white">نجهّز نتيجتك النهائية</p>
        <p className="mt-1 text-sm text-gray-400">سنحدّث هذه الصفحة تلقائياً عند اكتمال {choiceOnly ? "النتائج الثلاث" : "النتيجتين"}.</p>
      </div>
    </PageWrapper>
  )

  const p2 = data.phase2, p3 = data.phase3, p4 = data.phase4

  if (screenMode === "questions") {
    return (
      <PageWrapper embedded>
        <div className="mx-auto max-w-md px-3 pb-8 pt-4" dir="rtl">
          <div className="event3-glass mb-4 rounded-2xl border border-white/[0.09] p-3">
            <div className="mb-3 text-center">
              <p className="text-xs font-bold text-purple-300">متابعة الحوار</p>
              <h1 className="mt-1 text-xl font-black text-white">أسئلة الجلسات</h1>
              <p className="mt-1 text-xs text-gray-500">للعرض والنقاش فقط — لن يتم حفظ أي إجابات</p>
            </div>
            <div className={`grid gap-2 ${choiceOnly ? "grid-cols-3" : "grid-cols-2"}`} role="tablist" aria-label="مرحلة أسئلة الجلسة">
              <button
                type="button"
                role="tab"
                aria-selected={questionPhase === "phase1"}
                onClick={() => setQuestionPhase("phase1")}
                className={`min-h-11 rounded-xl border text-sm font-bold transition-all ${questionPhase === "phase1" ? "border-pink-500/50 bg-pink-500/15 text-pink-200" : "border-white/[0.07] bg-white/[0.03] text-gray-500"}`}
              >
                {choiceOnly ? "أسئلة اللقاء الأول" : "أسئلة المرحلة الأولى"}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={questionPhase === "phase2"}
                onClick={() => setQuestionPhase("phase2")}
                className={`min-h-11 rounded-xl border text-sm font-bold transition-all ${questionPhase === "phase2" ? "border-purple-500/50 bg-purple-500/15 text-purple-200" : "border-white/[0.07] bg-white/[0.03] text-gray-500"}`}
              >
                {choiceOnly ? "أسئلة اللقاء الثاني" : "أسئلة المرحلة الثانية"}
              </button>
              {choiceOnly && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={questionPhase === "phase3"}
                  onClick={() => setQuestionPhase("phase3")}
                  className={`min-h-11 rounded-xl border text-sm font-bold transition-all ${questionPhase === "phase3" ? "border-violet-500/50 bg-violet-500/15 text-violet-200" : "border-white/[0.07] bg-white/[0.03] text-gray-500"}`}
                >
                  أسئلة اللقاء الثالث
                </button>
              )}
            </div>
          </div>

          <div role="tabpanel" aria-label={questionPhase === "phase1" ? "أسئلة اللقاء الأول" : questionPhase === "phase2" ? "أسئلة اللقاء الثاني" : "أسئلة اللقاء الثالث"}>
            <QuestionSlideshow key={`final-${questionPhase}`} defaultSet={questionPhase === "phase1" ? "choice" : questionPhase === "phase2" ? "set1" : "set2"} />
          </div>

          <nav className="event3-status-header sticky bottom-3 z-20 mt-4 grid grid-cols-3 gap-2 rounded-2xl border border-white/10 p-2" aria-label="التنقل بعد الكشف النهائي">
            <a href="/welcome" className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl bg-white/[0.05] text-[11px] font-bold text-gray-300">
              <Home size={17} /> الرئيسية
            </a>
            <a href={resultsHref} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl bg-white/[0.05] text-[11px] font-bold text-amber-200">
              <Trophy size={17} /> النتائج
            </a>
            <button onClick={() => setScreenMode("reveal")} className="event3-action flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-[11px] font-black text-white">
              <ChevronRight size={17} /> الكشف النهائي
            </button>
          </nav>
        </div>
      </PageWrapper>
    )
  }

  return (
    <PageWrapper embedded>
      <div className="max-w-sm mx-auto p-4 pb-8 space-y-4 text-center" dir="rtl">
        {/* Animated title */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 200, damping: 20 }} className="pt-4">
          <Event3Mark size="compact" className="mb-2" />
          <p dir="ltr" className="text-[8px] font-black uppercase tracking-[0.28em] text-cyan-100/40">FINAL REVEAL</p>
          <h1 className="mt-1 bg-gradient-to-l from-white via-purple-100 to-fuchsia-200 bg-clip-text text-2xl font-black text-transparent">الكشف النهائي</h1>
        </motion.div>

        {/* Same match banner */}
        {!choiceOnly && sameMatch && (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4, type: "spring" }}
            className="bg-gradient-to-r from-amber-900/40 via-yellow-900/30 to-amber-900/40 border border-amber-600/50 rounded-2xl p-4">
            <Trophy size={24} className="text-amber-400 mx-auto mb-1" />
            <p className="text-amber-300 font-black text-base">مطابقة مثالية!</p>
            <p className="text-amber-400/70 text-xs mt-0.5">اخترت والخوارزمية نفس الشخص</p>
          </motion.div>
        )}

        {/* Reveal cards with flip animation */}
        <p className="sr-only" aria-live="polite" aria-atomic="true">{revealed
          ? choiceOnly
            ? `تم الكشف: اختيارك الأول ${p2?.partner_first_name}، واختيارك الثاني ${p3?.partner_first_name}، واختيارك الثالث ${p4?.partner_first_name}`
            : `تم الكشف: اختيارك ${p2?.partner_first_name} بنسبة ${p2?.compatibility_score} بالمئة، واختيار النظام ${p3?.partner_first_name} بنسبة ${p3?.compatibility_score} بالمئة`
          : "جاري تجهيز الكشف النهائي"}</p>
        <div className={`grid grid-cols-1 gap-2 sm:gap-3 ${choiceOnly ? "sm:grid-cols-3" : "min-[380px]:grid-cols-2"}`}>
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}>
            <RevealCard icon="heart" label={choiceOnly ? "الاختيار الأول" : "اختيارك"} name={p2?.partner_first_name} score={choiceOnly ? null : p2?.compatibility_score} word={p2?.word} revealed={revealed} accent="pink" />
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 }}>
            <RevealCard icon={choiceOnly ? "heart" : "brain"} label={choiceOnly ? "الاختيار الثاني" : "اختيار النظام"} name={p3?.partner_first_name} score={choiceOnly ? null : p3?.compatibility_score} word={p3?.word} revealed={revealed} accent="purple" />
          </motion.div>
          {choiceOnly && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.45 }}>
              <RevealCard icon="heart" label="الاختيار الثالث" name={p4?.partner_first_name} score={null} word={p4?.word} revealed={revealed} accent="purple" />
            </motion.div>
          )}
        </div>

        {/* Comparison text */}
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="text-gray-500 text-xs leading-relaxed">
          {choiceOnly ? "ثلاثة لقاءات متبادلة مع ثلاثة أشخاص مختلفين — أيها كان أقرب لك؟" : sameMatch ? "غريزتك والخوارزمية متوافقتان — نادر الحدوث!" : "رأيت بعينيك، ورأت الخوارزمية بالبيانات — أيهما أصح؟"}
        </motion.p>

        <motion.a href={resultsHref} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }} className="event3-action flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 px-4 text-base font-black text-white">
          <Trophy size={18} /> فتح النتائج والتواصل
        </motion.a>

        {!choiceOnly && (
        <details className="group rounded-3xl border border-white/[0.08] bg-white/[0.025] text-right">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-black text-gray-200">
            فهم النتيجة بالتفصيل
            <ChevronRight size={17} className="rotate-90 text-gray-500 transition-transform group-open:-rotate-90" />
          </summary>
          <div className="space-y-3 border-t border-white/[0.06] p-3">

        {/* Tabbed compatibility breakdown */}
        {!sameMatch && (p2?.breakdown || p3?.breakdown) && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
            <div className="mb-3 flex gap-1.5" role="tablist" aria-label="تفاصيل التوافق">
              <button type="button" role="tab" aria-selected={activeTab === 'choice'} onClick={() => setActiveTab('choice')} className={`min-h-11 flex-1 rounded-xl border py-2 text-xs font-bold transition-all ${activeTab === 'choice' ? 'bg-pink-950/50 border-pink-700/40 text-pink-300' : 'border-white/[0.07] bg-black/20 text-gray-400'}`}>
                <Heart size={12} className="inline ml-1" /> {choiceOnly ? "الاختيار الأول" : "اختيارك"}
              </button>
              <button type="button" role="tab" aria-selected={activeTab === 'algorithm'} onClick={() => setActiveTab('algorithm')} className={`min-h-11 flex-1 rounded-xl border py-2 text-xs font-bold transition-all ${activeTab === 'algorithm' ? 'bg-purple-950/50 border-purple-700/40 text-purple-300' : 'border-white/[0.07] bg-black/20 text-gray-400'}`}>
                {choiceOnly ? <Heart size={12} className="inline ml-1" /> : <Brain size={12} className="inline ml-1" />} {choiceOnly ? "الاختيار الثاني" : "اختيار النظام"}
              </button>
            </div>
            <AnimatePresence mode="wait">
              {activeTab === 'choice' && p2?.breakdown && (
                <motion.div key="choice" role="tabpanel" aria-label={choiceOnly ? "تفاصيل توافق الاختيار الأول" : "تفاصيل توافق اختيارك"} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.2 }}>
                  <CompatibilityBreakdown breakdown={p2.breakdown} scoreRow={p2} accent="pink" partnerName={p2?.partner_first_name} />
                </motion.div>
              )}
              {activeTab === 'algorithm' && p3?.breakdown && (
                <motion.div key="algorithm" role="tabpanel" aria-label={choiceOnly ? "تفاصيل توافق الاختيار الثاني" : "تفاصيل توافق اختيار النظام"} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }}>
                  <CompatibilityBreakdown breakdown={p3.breakdown} scoreRow={p3} accent="purple" partnerName={p3?.partner_first_name} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* If same match, just show one breakdown */}
        {sameMatch && p2?.breakdown && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
            <CompatibilityBreakdown breakdown={p2.breakdown} scoreRow={p2} accent="pink" partnerName={p2?.partner_first_name} />
          </motion.div>
        )}

        {/* AI Analysis — compact */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }} className="space-y-2">
          {p2?.partner_number && (
            <AiAnalysisCompact partnerNum={p2.partner_number} token={token} currentEventId={currentEventId} accent="pink" title="لماذا توافقتما؟" />
          )}
          {p3?.partner_number && !sameMatch && (
            <AiAnalysisCompact partnerNum={p3.partner_number} token={token} currentEventId={currentEventId} accent="purple" title={choiceOnly ? "لماذا توافقتما؟" : "لماذا اختارتك الخوارزمية؟"} />
          )}
          {choiceOnly && p4?.partner_number && (
            <AiAnalysisCompact partnerNum={p4.partner_number} token={token} currentEventId={currentEventId} accent="purple" title="لماذا توافقتما؟" />
          )}
        </motion.div>
          </div>
        </details>
        )}

        {/* Match preference — simplified */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
          className="event3-glass space-y-3 rounded-2xl border border-white/[0.09] p-4">
          <div>
            <p className="text-gray-300 font-bold text-sm">مَن كان أقرب لك؟ <span className="font-medium text-gray-600">— اختياري</span></p>
            <p className="mt-1 text-[11px] leading-5 text-gray-500">نستخدم الإجابة لتحسين التجربة فقط، ولا يراها أي شريك.</p>
          </div>
          {choiceOnly ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="الشخص المفضّل">
              {([
                ["first", "أفضّل الاختيار الأول"],
                ["second", "أفضّل الاختيار الثاني"],
                ["third", "أفضّل الاختيار الثالث"],
              ] as const).map(([value, label]) => (
                <button key={value} type="button" role="radio" aria-checked={matchPref === value} onClick={() => submitPref(value)} disabled={prefSubmitting || matchPref === value}
                  className={`min-h-11 rounded-xl border py-2.5 text-xs font-bold transition-all ${matchPref === value ? "border-pink-500/50 bg-pink-600/30 text-pink-200" : "border-pink-800/40 bg-pink-950/30 text-pink-300 hover:bg-pink-950/50"}`}>
                  {matchPref === value ? "✓ " : ""}{label}
                </button>
              ))}
              <button type="button" role="radio" aria-checked={matchPref === "multiple"} onClick={() => submitPref("multiple")} disabled={prefSubmitting || matchPref === "multiple"}
                className={`min-h-11 rounded-xl border py-2.5 text-xs font-bold transition-all sm:col-span-3 ${matchPref === "multiple" ? "border-emerald-500/50 bg-emerald-600/30 text-emerald-300" : "border-gray-700/40 bg-gray-800/40 text-gray-300 hover:bg-gray-800/60"}`}>
                {matchPref === "multiple" ? "✓ " : ""}أكثر من لقاء كان ممتازاً
              </button>
              <button type="button" role="radio" aria-checked={matchPref === "none"} onClick={() => submitPref("none")} disabled={prefSubmitting || matchPref === "none"}
                className={`min-h-11 rounded-xl border py-2.5 text-xs font-bold transition-all sm:col-span-3 ${matchPref === "none" ? "border-slate-300/35 bg-slate-300/10 text-slate-100" : "border-white/[0.065] bg-black/15 text-gray-500 hover:bg-white/[0.045]"}`}>
                {matchPref === "none" ? "✓ " : ""}لا أفضل أي لقاء الآن
              </button>
            </div>
          ) : (
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="الشخص المفضّل">
            <button type="button" role="radio" aria-checked={matchPref === "choice"} onClick={() => submitPref("choice")} disabled={prefSubmitting || matchPref === "choice"}
              className={`min-h-11 rounded-xl border py-2.5 text-xs font-bold transition-all ${matchPref === "choice" ? "bg-pink-600/30 border-pink-500/50 text-pink-300" : "bg-pink-950/30 border-pink-800/40 text-pink-300 hover:bg-pink-950/50"}`}>
              {matchPref === "choice" ? "✓ " : ""}{choiceOnly ? "أفضّل الاختيار الأول" : "أفضّل اختياري"}
            </button>
            <button type="button" role="radio" aria-checked={matchPref === "algorithm"} onClick={() => submitPref("algorithm")} disabled={prefSubmitting || matchPref === "algorithm"}
              className={`min-h-11 rounded-xl border py-2.5 text-xs font-bold transition-all ${matchPref === "algorithm" ? "bg-purple-600/30 border-purple-500/50 text-purple-300" : "bg-purple-950/30 border-purple-800/40 text-purple-300 hover:bg-purple-950/50"}`}>
              {matchPref === "algorithm" ? "✓ " : ""}{choiceOnly ? "أفضّل الاختيار الثاني" : "أفضّل الخوارزمية"}
            </button>
            <button type="button" role="radio" aria-checked={matchPref === "both"} onClick={() => submitPref("both")} disabled={prefSubmitting || matchPref === "both"}
              className={`col-span-2 min-h-11 rounded-xl border py-2.5 text-xs font-bold transition-all ${matchPref === "both" ? "bg-emerald-600/30 border-emerald-500/50 text-emerald-300" : "bg-gray-800/40 border-gray-700/40 text-gray-300 hover:bg-gray-800/60"}`}>
              {matchPref === "both" ? "✓ " : ""}كلاهما ممتاز
            </button>
            <button type="button" role="radio" aria-checked={matchPref === "neither"} onClick={() => submitPref("neither")} disabled={prefSubmitting || matchPref === "neither"}
              className={`col-span-2 min-h-11 rounded-xl border py-2.5 text-xs font-bold transition-all ${matchPref === "neither" ? "border-slate-300/35 bg-slate-300/10 text-slate-100" : "border-white/[0.065] bg-black/15 text-gray-500 hover:bg-white/[0.045]"}`}>
              {matchPref === "neither" ? "✓ " : ""}لا أفضل أحدهما الآن
            </button>
          </div>
          )}
        </motion.div>

        <motion.button
          type="button"
          onClick={() => setScreenMode("questions")}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.95 }}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-purple-700/40 bg-purple-950/30 text-sm font-bold text-purple-200 transition-all hover:bg-purple-950/50 active:scale-[0.98]"
        >
          <MessageSquare size={17} /> مواصلة الحوار بأسئلة إضافية
        </motion.button>

        {/* Simple home link */}
        <motion.a href="/welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
          className="inline-flex min-h-11 items-center gap-2 text-xs text-gray-400 transition-colors hover:text-gray-200">
          <Home size={14} /> العودة للصفحة الرئيسية
        </motion.a>
      </div>
    </PageWrapper>
  )
}

// ─── AI Welcome Popup ─────────────────────────────────────────────────────────
function AiWelcomePopup({ token, onDone, previewMessage, previewFailed = false }: { token: string; onDone: () => void; previewMessage?: string; previewFailed?: boolean }) {
  const titleId = useId()
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [typed, setTyped] = useState("")
  const [typing, setTyping] = useState(false)
  const [done, setDone] = useState(false)
  const [closing, setClosing] = useState(false)
  const [failed, setFailed] = useState(false)
  const [savingImage, setSavingImage] = useState(false)
  const typingRunRef = useRef(0)
  const overlayRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const dismissButtonRef = useRef<HTMLButtonElement>(null)
  const onDoneRef = useRef(onDone)
  const closingRef = useRef(false)
  const reduceMotion = useReducedMotion()
  onDoneRef.current = onDone

  useEffect(() => {
    if (previewFailed) {
      setFailed(true)
      setLoading(false)
      return
    }
    if (previewMessage) {
      setMessage(previewMessage)
      setLoading(false)
      return
    }
    let active = true
    let settled = false
    const timeoutId = window.setTimeout(() => {
      if (!active || settled) return
      settled = true
      setFailed(true)
      setLoading(false)
    }, 18000)
    call("e3-ai-welcome", token).then(d => {
      if (!active || settled) return
      settled = true
      window.clearTimeout(timeoutId)
      if (d.success && d.message) {
        setMessage(d.message)
        setLoading(false)
      } else {
        setFailed(true)
        setLoading(false)
      }
    }).catch(() => {
      if (!active || settled) return
      settled = true
      window.clearTimeout(timeoutId)
      setFailed(true)
      setLoading(false)
    })
    return () => { active = false; window.clearTimeout(timeoutId) }
  }, [token, previewMessage, previewFailed])

  const finishTyping = useCallback(() => {
    if (!message) return
    typingRunRef.current += 1
    setTyped(message)
    setTyping(false)
    setDone(true)
  }, [message])

  // Time-based and throttled so slow phones never have to render every character.
  useEffect(() => {
    if (!message) return
    const runId = ++typingRunRef.current
    setTyped("")
    setTyping(true)
    setDone(false)

    if (reduceMotion) {
      setTyped(message)
      setTyping(false)
      setDone(true)
      return
    }

    const duration = Math.min(5200, Math.max(2200, message.length * 18))
    let frame = 0
    let startedAt = 0
    let lastPaint = 0
    const tick = (now: number) => {
      if (typingRunRef.current !== runId) return
      if (!startedAt) startedAt = now
      const elapsed = now - startedAt
      const nextIndex = Math.min(message.length, Math.floor((elapsed / duration) * message.length))

      if (nextIndex >= message.length) {
        setTyped(message)
        setTyping(false)
        setDone(true)
        const compactScreen = window.matchMedia('(max-width: 639px)').matches
        if (!reduceMotion) fireConfetti({ particleCount: compactScreen ? 36 : 80, spread: 70, origin: { y: 0.6 }, colors: ["#a855f7", "#ec4899", "#f0abfc", "#c084fc"] })
        return
      }

      if (now - lastPaint >= 50) {
        lastPaint = now
        setTyped(message.slice(0, nextIndex))
      }
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => {
      typingRunRef.current += 1
      window.cancelAnimationFrame(frame)
    }
  }, [message, reduceMotion])

  const dismiss = () => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    setTimeout(() => onDoneRef.current(), 400)
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const overlay = overlayRef.current
    const siblings = overlay?.parentElement
      ? Array.from(overlay.parentElement.children).filter(node => node !== overlay) as HTMLElement[]
      : []
    const siblingState = siblings.map(node => ({ node, inert: node.inert, ariaHidden: node.getAttribute('aria-hidden') }))
    siblings.forEach(node => { node.inert = true; node.setAttribute('aria-hidden', 'true') })
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => {
      const initialFocusTarget = dismissButtonRef.current || cardRef.current
      initialFocusTarget?.focus({ preventScroll: true })
    }, 80)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        dismiss()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(cardRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) || [])
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      siblingState.forEach(({ node, inert, ariaHidden }) => {
        node.inert = inert
        if (ariaHidden == null) node.removeAttribute('aria-hidden')
        else node.setAttribute('aria-hidden', ariaHidden)
      })
    }
  }, [])

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
        ref={overlayRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        className="event3-shell fixed inset-0 z-[290] flex items-center justify-center overflow-hidden p-2 sm:p-4"
        onClick={() => done && dismiss()}
        onKeyDown={event => { if (event.key === "Escape") dismiss() }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        dir="rtl"
      >
        {/* ─── Full-screen animated background ─── */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#03040d]/95 via-[#0a0618]/90 to-[#02030a]/95" />
        <div className="absolute inset-0 bg-gradient-to-t from-cyan-950/[0.12] via-transparent to-purple-950/25" />

        {/* Animated mesh orbs */}
        <motion.div
          className="absolute top-[10%] right-[5%] hidden w-72 h-72 rounded-full bg-purple-600/20 blur-[100px] pointer-events-none sm:block"
          animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0.5, 0.3], x: [0, -30, 0], y: [0, 20, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-[10%] left-[5%] hidden w-64 h-64 rounded-full bg-pink-600/15 blur-[90px] pointer-events-none sm:block"
          animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.4, 0.2], x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />
        <motion.div
          className="absolute top-[50%] left-[40%] hidden w-56 h-56 rounded-full bg-fuchsia-600/10 blur-[80px] pointer-events-none sm:block"
          animate={{ scale: [1, 1.5, 1], opacity: [0.15, 0.3, 0.15], x: [0, 20, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />

        {/* Floating sparkles */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute hidden pointer-events-none sm:block"
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
          ref={cardRef}
          initial={{ scale: 0.85, y: 50, opacity: 0 }}
          animate={{ scale: closing ? 0.9 : 1, y: closing ? 30 : 0, opacity: closing ? 0 : 1 }}
          transition={{ type: "spring", stiffness: 240, damping: 24 }}
          onClick={e => e.stopPropagation()}
          tabIndex={-1}
          className="event3-glass relative z-10 flex max-h-[calc(100dvh-1rem)] w-full max-w-md flex-col overflow-hidden rounded-[32px] border border-white/[0.1] focus:outline-none"
        >
          <AnimatePresence>
            {loading && (
              <motion.button
                ref={dismissButtonRef}
                type="button"
                onClick={dismiss}
                aria-label="تخطّي الرسالة والدخول إلى الفعالية"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6, scale: 0.96 }}
                transition={{ duration: 0.22 }}
                className="absolute left-4 top-4 z-30 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3.5 text-[11px] font-bold text-gray-400 shadow-[inset_0_1px_0_rgba(255,255,255,.045),0_12px_28px_-22px_rgba(192,132,252,.65)] backdrop-blur-xl transition-all hover:border-purple-300/20 hover:bg-purple-300/[0.07] hover:text-purple-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-purple-300/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0718]"
              >
                <span>تخطّي</span>
                <ArrowLeft size={12} aria-hidden="true" />
              </motion.button>
            )}
          </AnimatePresence>
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
          <div className="relative min-h-0 overflow-y-auto overscroll-contain bg-gradient-to-b from-[#0d0b1b]/90 via-[#0b0718]/92 to-[#040611]/96 backdrop-blur-2xl">

            {/* ─── Brand Header — "التوافق الأعمى يرحب بك" ─── */}
            <div className="relative overflow-hidden px-4 pb-3 pt-4 text-center sm:px-6 sm:pb-5 sm:pt-8">
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
              <Event3Mark size="compact" className="mb-2 sm:mb-3" />

              {/* Brand name */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <h1 id={titleId} className="text-xl font-black bg-gradient-to-r from-purple-300 via-pink-200 to-purple-300 bg-clip-text text-transparent tracking-tight">
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
                  className="flex h-14 w-14 items-center justify-center rounded-2xl border border-purple-300/[0.14] bg-purple-400/[0.08] shadow-[0_16px_36px_-20px_rgba(192,132,252,.8)]"
                >
                  <Sparkles size={24} className="text-purple-200/65" />
                </motion.div>
                <p className="text-gray-400 text-sm text-center">تعذّر توليد الرسالة، لا بأس — نكمل بدونها!</p>
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={dismiss}
                  className="event3-action mt-2 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 px-8 py-3 text-sm font-bold text-white"
                >
                  يلا نبدأ ←
                </motion.button>
              </div>
            )}

            {/* ─── Message Display ─── */}
            {!loading && !failed && message && (
              <>
                {/* Message card */}
                <div className="relative px-4 pb-3 sm:px-6 sm:pb-5">
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.5 }}
                    className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 sm:p-5"
                  >
                    {/* Corner glow */}
                    <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-purple-600/10 blur-2xl pointer-events-none" />

                    {/* Message label */}
                    <div className="relative flex items-center gap-2 mb-3">
                      <div className="w-1 h-4 rounded-full bg-gradient-to-b from-purple-400 to-pink-400" />
                      <span className="text-purple-300/70 text-[11px] font-bold tracking-wide">شيء خاص لك</span>
                    </div>

                    {/* Message body with typewriter */}
                    <div className="relative flex min-h-[96px] items-center justify-center sm:min-h-[120px]">
                      <p className="whitespace-pre-wrap text-center text-sm font-medium leading-7 tracking-wide text-gray-100 sm:text-[15px] sm:leading-[2.2]">
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

                {typing && (
                  <div className="sticky bottom-0 z-20 bg-gradient-to-t from-gray-950 via-gray-950/95 to-transparent px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
                    <button
                      onClick={finishTyping}
                      className="w-full rounded-2xl border border-purple-400/20 bg-purple-500/10 py-3 text-sm font-bold text-purple-200 transition active:scale-[0.98]"
                    >
                      عرض الرسالة كاملة
                    </button>
                  </div>
                )}

                {/* Dismiss button — appears after typing completes */}
                <AnimatePresence>
                  {done && (
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4 }}
                      className="sticky bottom-0 z-20 bg-gradient-to-t from-gray-950 via-gray-950/95 to-transparent px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-7"
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
                          className="event3-action rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 py-3.5 text-sm font-bold text-white transition-all hover:from-purple-500 hover:to-pink-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
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
            className="absolute bottom-6 left-1/2 z-20 hidden -translate-x-1/2 text-[11px] text-gray-500 sm:block"
          >
            اضغط في أي مكان للمتابعة
          </motion.p>
        )}
      </motion.div>
    </AnimatePresence>
  )
}

// ─── Not Enrolled Screen ──────────────────────────────────────────────────────
function NotEnrolledScreen({ onUseAnotherNumber, onLogout }: { onUseAnotherNumber: () => void; onLogout: () => void }) {
  return (
    <PageWrapper className="flex items-center justify-center p-6 text-center">
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="w-full max-w-sm">
        <GlassCard className="space-y-5 rounded-[1.75rem] p-6">
          <Event3Mark size="compact" />
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.09] bg-white/[0.045] shadow-[inset_0_1px_0_rgba(255,255,255,.06)]">
            <Lock size={21} className="text-purple-200" />
          </div>
          <div>
            <p dir="ltr" className="text-[8px] font-black uppercase tracking-[0.25em] text-cyan-100/35">ACCESS CHECK</p>
            <h2 className="mt-1 bg-gradient-to-l from-white to-purple-200 bg-clip-text text-xl font-black text-transparent">أنت لست مسجلاً</h2>
            <p className="mt-3 text-sm leading-6 text-gray-400">رمزك صحيح، لكن لم يتم تسجيلك في هذه الفعالية.</p>
            <p className="mt-1 text-xs text-gray-500">تأكد من الرقم أو تواصل مع المنظم للمساعدة.</p>
          </div>
          <div className="flex flex-col gap-2.5">
            <button type="button" onClick={onUseAnotherNumber} className="event3-action min-h-12 rounded-2xl bg-gradient-to-l from-fuchsia-600 via-purple-600 to-violet-700 px-5 text-sm font-black text-white transition hover:brightness-110">
              الدخول برقم آخر
            </button>
            <ParticipantLogoutButton onLogout={onLogout} />
            <a href="/welcome" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm text-purple-200/75 transition-colors hover:text-purple-100">
              <Home size={14} /> العودة للصفحة الرئيسية
            </a>
          </div>
        </GlassCard>
      </motion.div>
    </PageWrapper>
  )
}


// ─── Notification Modal ───────────────────────────────────────────────────────
function NotificationModal({ token, notification }: { token: string; notification?: { pending: boolean; notif_id?: string; title?: string; body?: string | null; icon?: string; created_at?: string } }) {
  const titleId = useId()
  const overlayRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const dismissButtonRef = useRef<HTMLButtonElement>(null)
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

  const dismiss = async () => {
    if (!notif || closing) return
    const nid = notif.notif_id
    setClosing(true)
    const result = await call("e3-dismiss-notification", token, { notif_id: nid })
    if (result.error) {
      setClosing(false)
      toast.error("تعذّر تأكيد الاستلام. حاول مجددًا.")
      return
    }
    setTimeout(() => {
      setDismissed(prev => new Set(prev).add(nid))
      setNotif(null)
      setClosing(false)
    }, 300)
  }

  useModalFocus({
    open: Boolean(notif),
    overlayRef,
    dialogRef,
    initialFocusRef: dismissButtonRef,
    onEscape: () => { if (notif?.icon !== 'alert') void dismiss() },
  })

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
        ref={overlayRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[600] flex items-center justify-center bg-[#03050d]/80 p-5 backdrop-blur-xl"
      >
        <motion.div
          ref={dialogRef}
          initial={{ scale: 0.92, y: 16 }}
          animate={{ scale: closing ? 0.95 : 1, y: closing ? 8 : 0, opacity: closing ? 0.5 : 1 }}
          exit={{ scale: 0.92, y: 16 }}
          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          className="event3-glass w-full max-w-sm rounded-[1.65rem] border border-purple-300/[0.13] p-7 text-center"
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
        >
          <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.14] bg-gradient-to-br ${cfg.gradient} shadow-[0_16px_36px_-18px_currentColor,inset_0_1px_0_rgba(255,255,255,.18)]`}>
            <Icon size={24} className="text-white" />
          </div>
          <h2 id={titleId} className="mb-2 text-xl font-black text-white">{notif.title}</h2>
          {notif.body && (
            <p className="text-gray-400 text-sm leading-relaxed mb-5">{notif.body}</p>
          )}
          {!notif.body && <div className="mb-5" />}
          <button
            ref={dismissButtonRef}
            type="button"
            disabled={closing}
            onClick={dismiss}
            className="event3-action min-h-12 w-full rounded-2xl bg-gradient-to-l from-fuchsia-600 via-purple-600 to-violet-700 py-3.5 text-sm font-black text-white transition-all hover:brightness-110 active:scale-[0.98]"
          >
            {closing ? "جارٍ التأكيد…" : notif.icon === 'alert' ? "استلمت التنبيه" : "تم"}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── Mood Check Modal ─────────────────────────────────────────────────────────
function MoodCheckModal({ token, name, moodCheck }: { token: string; name?: string | null; moodCheck?: { pending: boolean; check_id?: string; triggered_at?: string } }) {
  const titleId = useId()
  const overlayRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const moodSubmitInFlightRef = useRef(false)
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

  const submit = async (mood: "happy" | "neutral" | "not_great" | "expired") => {
    if (!pendingCheck || moodSubmitInFlightRef.current) return
    const checkId = pendingCheck.check_id
    moodSubmitInFlightRef.current = true
    setSelected(mood === "expired" ? null : mood)
    setSubmitting(true)
    try {
      const d = await call("e3-submit-mood-check", token, { check_id: checkId, mood })
      if (d.error) { toast.error(d.error); setSelected(null); return }
      setDismissed(prev => new Set(prev).add(checkId))
      setPendingCheck(null)
      setSelected(null)
      if (mood !== "expired") toast.success("شكراً لك")
    } finally {
      moodSubmitInFlightRef.current = false
      setSubmitting(false)
    }
  }

  useModalFocus({
    open: Boolean(pendingCheck),
    overlayRef,
    dialogRef,
    onEscape: () => { if (!submitting) void submit("expired") },
  })

  if (!pendingCheck) return null

  const options = [
    { mood: "happy" as const, icon: <Smile size={26} />, label: "ممتاز", gradient: "from-emerald-500/80 to-teal-600/80", ring: "ring-emerald-400/60", glow: "shadow-[0_0_30px_-4px_rgba(16,185,129,0.4)]", textCls: "text-emerald-300", bgCls: "bg-emerald-500/15" },
    { mood: "neutral" as const, icon: <Meh size={26} />, label: "عادي", gradient: "from-amber-500/80 to-yellow-600/80", ring: "ring-amber-400/60", glow: "shadow-[0_0_30px_-4px_rgba(245,158,11,0.4)]", textCls: "text-amber-300", bgCls: "bg-amber-500/15" },
    { mood: "not_great" as const, icon: <Frown size={26} />, label: "مو مره", gradient: "from-red-500/80 to-rose-600/80", ring: "ring-red-400/60", glow: "shadow-[0_0_30px_-4px_rgba(239,68,68,0.4)]", textCls: "text-red-300", bgCls: "bg-red-500/15" },
  ]

  return (
    <AnimatePresence>
      <motion.div
        ref={overlayRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[300] flex items-center justify-center bg-[#03050d]/80 p-5 backdrop-blur-xl"
      >
        <motion.div
          ref={dialogRef}
          initial={{ scale: 0.92, y: 16 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.92, y: 16 }}
          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          className="event3-glass w-full max-w-sm rounded-[1.65rem] border border-purple-300/[0.13] p-7 text-center"
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
        >
          {/* Header */}
          <div className="space-y-2 mb-7">
            <div className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-2xl border border-purple-300/20 bg-gradient-to-br from-purple-500/30 to-pink-500/20 shadow-[0_14px_30px_-18px_rgba(192,132,252,.8),inset_0_1px_0_rgba(255,255,255,.1)]">
              <Heart size={20} className="text-purple-300" />
            </div>
            <h2 id={titleId} className="text-2xl font-black text-white">{name ? `هلا ${name}` : "شلونك الحين؟"}</h2>
            <p className="text-gray-500 text-sm">{name ? "شلونك الحين؟" : "كيف حاسّك هذي اللحظة"}</p>
          </div>

          {/* Options */}
          <div className="space-y-3">
            {options.map(opt => {
              const isSelected = selected === opt.mood
              return (
                <motion.button type="button" key={opt.mood} whileTap={{ scale: 0.97 }}
                  autoFocus={opt.mood === "happy"}
                  disabled={submitting}
                  aria-pressed={isSelected}
                  aria-busy={submitting && isSelected}
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

          <button type="button" onClick={() => submit("expired")} disabled={submitting} className="mt-3 min-h-11 rounded-xl px-4 text-xs font-bold text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200 disabled:opacity-40">
            ليس الآن
          </button>

          <p className="text-gray-700 text-[10px] mt-6">سري · ما يطلع عليه أحد</p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}


// ─── Root Component ───────────────────────────────────────────────────────────
const EVENT_PHASE_LABELS: Record<string, string> = {
  setup: "الاستعداد",
  round1: "الجولة الأولى",
  ranking1: "ترتيب الجولة الأولى",
  round2: "الجولة الثانية",
  ranking2: "الترتيب النهائي",
  round3: "الجولة الثالثة",
  ranking3: "الترتيب النهائي",
  break: "استراحة",
  phase2_processing: "تجهيز اختيارك",
  phase2_reveal: "جلسة اختيارك",
  phase3_processing: "تجهيز اختيارنا",
  phase3_reveal: "جلسة اختيارنا",
  phase4_processing: "تجهيز الاختيار الثالث",
  phase4_reveal: "جلسة الاختيار الثالث",
  final_reveal: "النتيجة النهائية",
}

const EVENT_PHASE_GUIDANCE: Record<string, string> = {
  setup: "لا شيء مطلوب الآن — ستنتقل الشاشة تلقائياً",
  round1: "اتجه إلى طاولتك، ثم ابدأوا معاً",
  ranking1: "رتّب من قابلتهم، راجع الأولوية، ثم احفظ",
  round2: "اتجه إلى طاولتك الجديدة، ثم ابدأوا معاً",
  ranking2: "احسم ترتيبك النهائي، ثم أرسله",
  round3: "اتجه إلى طاولتك الثالثة، ثم ابدأوا معاً",
  ranking3: "احسم ترتيبك النهائي للقاءات الاختيار الثلاثة، ثم أرسله",
  break: "استرح وخلك قريباً — لقاؤك الفردي هو التالي",
  phase2_processing: "نجهّز اسم شريكك ورقم طاولتك",
  phase2_reveal: "اتجه إلى الطاولة، قابل اختيارك، ثم ابدأ الحوار",
  phase3_processing: "نجهّز ترشيح النظام ورقم طاولتك",
  phase3_reveal: "اتجه إلى الطاولة، قابل ترشيحنا، ثم ابدأ الحوار",
  phase4_processing: "نجهّز الاختيار الثالث ورقم طاولتك",
  phase4_reveal: "اتجه إلى الطاولة، قابل اختيارك الثالث، ثم ابدأ الحوار",
  final_reveal: "شاهد النتيجة أولاً، ثم افتح التفاصيل إذا رغبت",
}

function event3PhaseLabel(phase: string, eventFormat: Event3Format) {
  if (isChoiceOnlyEvent3(eventFormat)) {
    const choiceOnlyLabels: Record<string, string> = {
      ranking2: "ترتيب الجولة الثانية",
      phase2_processing: "تجهيز الاختيار الأول",
      phase2_reveal: "لقاء الاختيار الأول",
      phase3_processing: "تجهيز الاختيار الثاني",
      phase3_reveal: "لقاء الاختيار الثاني",
      phase4_processing: "تجهيز الاختيار الثالث",
      phase4_reveal: "لقاء الاختيار الثالث",
    }
    if (choiceOnlyLabels[phase]) return choiceOnlyLabels[phase]
  }
  return EVENT_PHASE_LABELS[phase] || phase
}

function event3PhaseGuidance(phase: string, eventFormat: Event3Format) {
  if (isChoiceOnlyEvent3(eventFormat)) {
    const choiceOnlyGuidance: Record<string, string> = {
      ranking2: "حدّث ترتيبك بعد المجموعة الثانية، ثم احفظ",
      phase2_processing: "نجهّز لقاءك المتبادل الأول ورقم طاولتك",
      phase2_reveal: "اتجه إلى الطاولة، قابل اختيارك الأول، ثم ابدأ الحوار",
      phase3_processing: "نجهّز لقاءك المتبادل الثاني مع شخص جديد",
      phase3_reveal: "اتجه إلى الطاولة، قابل اختيارك الثاني، ثم ابدأ الحوار",
      phase4_processing: "نجهّز لقاءك المتبادل الثالث مع شخص جديد",
      phase4_reveal: "اتجه إلى الطاولة، قابل اختيارك الثالث، ثم ابدأ الحوار",
    }
    if (choiceOnlyGuidance[phase]) return choiceOnlyGuidance[phase]
  }
  return EVENT_PHASE_GUIDANCE[phase] || "اتبع الخطوة الظاهرة في الشاشة"
}

function EventStatusHeader({ eventState, isOffline, pollError, lastSuccessAt, correctedNow, impersonating, onLogout }: {
  eventState: any; isOffline: boolean; pollError?: string | null; lastSuccessAt?: number | null; correctedNow: () => number; impersonating?: boolean; onLogout?: () => void
}) {
  const [now, setNow] = useState(() => correctedNow())
  useEffect(() => {
    const update = () => setNow(correctedNow())
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [correctedNow])

  const phase = eventState?.phase || "setup"
  const eventFormat = normalizeEvent3Format(eventState?.event_format)
  const choiceOnly = isChoiceOnlyEvent3(eventFormat)
  const progress: Record<string, string> = choiceOnly ? {
    round1: "1 من 7", ranking1: "1 من 7", round2: "2 من 7", ranking2: "2 من 7", round3: "3 من 7", ranking3: "3 من 7",
    phase2_processing: "4 من 7", phase2_reveal: "4 من 7",
    phase3_processing: "5 من 7", phase3_reveal: "5 من 7",
    phase4_processing: "6 من 7", phase4_reveal: "6 من 7", final_reveal: "7 من 7",
  } : {
    round1: "1 من 5", ranking1: "1 من 5", round2: "2 من 5", ranking2: "2 من 5",
    phase2_processing: "3 من 5", phase2_reveal: "3 من 5",
    phase3_processing: "4 من 5", phase3_reveal: "4 من 5", final_reveal: "5 من 5",
  }
  let remaining: number | null = null
  if (eventState?.timer_active && eventState?.timer_start) {
    const elapsed = Math.floor((now - new Date(eventState.timer_start).getTime()) / 1000)
    remaining = Math.max(0, Number(eventState.timer_duration || 0) - elapsed)
  }
  const table = eventState?.my_assignment?.table
  const safeTopClass = impersonating ? "" : "pt-[env(safe-area-inset-top)]"
  const secondsSinceSuccess = lastSuccessAt ? Math.max(0, Math.floor((Date.now() - lastSuccessAt) / 1000)) : 0
  const connectionState = isOffline ? "offline" : (pollError || secondsSinceSuccess > 15) ? "unstable" : "online"
  const connectionLabel = connectionState === "offline"
    ? "غير متصل — نعرض آخر معلومات محفوظة"
    : connectionState === "unstable"
      ? `الاتصال غير مستقر${lastSuccessAt ? ` — آخر تحديث قبل ${Math.max(1, secondsSinceSuccess)}ث` : ""}`
      : "متصل بالفعالية"
  const phaseGuidance = event3PhaseGuidance(phase, eventFormat)

  return (
    <div className={`event3-status-header sticky top-0 z-[90] border-b px-4 pb-2.5 pt-2.5 ${safeTopClass}`} dir="rtl">
      <div className="mx-auto flex max-w-md items-center gap-2.5">
        <div aria-hidden="true" title={connectionLabel} className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,.06)]">
          <span className={`h-1.5 w-1.5 rounded-full shadow-[0_0_7px_currentColor] ${connectionState === "online" ? "bg-emerald-300 text-emerald-300" : connectionState === "unstable" ? "animate-pulse bg-amber-300 text-amber-300" : "animate-pulse bg-orange-300 text-orange-300"}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate text-[13px] font-black text-white">{event3PhaseLabel(phase, eventFormat)}</span>
            {progress[phase] && <span className="whitespace-nowrap rounded-full border border-purple-300/[0.13] bg-purple-400/[0.08] px-2 py-0.5 text-[10px] font-bold text-purple-100/80">{progress[phase]}</span>}
          </div>
          <p className="mt-0.5 truncate text-[10px] font-medium text-gray-400"><span className="text-cyan-100/35">الآن · </span>{phaseGuidance}</p>
          {connectionState !== "online" && <p className="mt-0.5 text-[10px] text-amber-300">{connectionLabel}</p>}
          <span className="sr-only" aria-live="polite">{connectionState === "online" ? "الاتصال مستقر" : connectionState === "unstable" ? "الاتصال غير مستقر" : "لا يوجد اتصال"}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {table != null && <span className="rounded-xl border border-amber-300/[0.14] bg-amber-400/[0.075] px-2.5 py-1.5 text-xs font-black text-amber-100">طاولة {table}</span>}
          {remaining != null && <span aria-label={`الوقت المتبقي ${formatTime(remaining)}`} className={`rounded-lg border border-white/[0.07] bg-black/20 px-2 py-1 font-mono text-sm font-black tabular-nums ${remaining <= 60 ? "text-red-300" : "text-cyan-100"}`}>{formatTime(remaining)}</span>}
          {onLogout && <ParticipantLogoutButton onLogout={onLogout} compact={table != null || remaining != null} />}
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
    return typeof window !== "undefined" ? getParticipantBrowserToken(window.localStorage) : null
  })

  // Keep the server and first client render identical, then resolve persisted
  // onboarding state before showing either the welcome or participant screen.
  const [showWelcome, setShowWelcome] = useState(true)
  const [storageReady, setStorageReady] = useState(false)
  const [showAiWelcome, setShowAiWelcome] = useState(false)
  const [enrolled, setEnrolled] = useState<boolean | null>(null)
  const [myInfo, setMyInfo] = useState<{ number: number; name: string; gender: string | null } | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  const [tokenError, setTokenError] = useState(false)
  const [testModeBlocked, setTestModeBlocked] = useState(false)
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [finalQuestionsOpen, setFinalQuestionsOpen] = useState(false)
  const [pendingGroupFeedbackRound, setPendingGroupFeedbackRound] = useState<Event3GroupRound | null>(null)
  const [breakFeedbackOpen, setBreakFeedbackOpen] = useState(false)
  const [breakFeedbackRound, setBreakFeedbackRound] = useState<Event3GroupRound | null>(null)
  const [activeMatchFeedbackSlot, setActiveMatchFeedbackSlot] = useState<1 | 2 | 3 | null>(null)
  const [rankingDraftContext, setRankingDraftContext] = useState<{
    round: number
    timerActive: boolean
    timerStart: string | null
    timerDuration: number
  } | null>(null)
  const [resolvedRankingRound, setResolvedRankingRound] = useState<number | null>(null)
  const eventContentRef = useRef<HTMLDivElement>(null)
  const phaseAnnouncementRef = useRef<HTMLDivElement>(null)
  const aiWelcomeSeenKey = token ? `e3_ai_welcome_seen_${token}` : null

  useEffect(() => {
    if (isImpersonating) {
      setStorageReady(true)
      return
    }
    try {
      const parameterToken = searchParams.get("token") || searchParams.get("t")
      const hasToken = Boolean(parameterToken || getParticipantBrowserToken(window.localStorage))
      setShowWelcome(!(hasToken && localStorage.getItem(EVENT3_ONBOARDING_KEY) === "1"))
    } catch {
      setShowWelcome(true)
    }
    setStorageReady(true)
  }, [isImpersonating, searchParams])

  const handleLogout = useCallback(() => {
    if (typeof window === "undefined") return
    const confirmed = window.confirm("هل أنت متأكد من تسجيل الخروج من الفعالية؟")
    if (!confirmed) return

    clearBrowserSessionArtifacts()
    setToken(null)
    setTokenError(false)
    setEnrolled(null)
    setMyInfo(null)
    setRankingDraftContext(null)
    setResolvedRankingRound(null)
    setBreakFeedbackOpen(false)
    setBreakFeedbackRound(null)
    setActiveMatchFeedbackSlot(null)
    setShowWelcome(true)
    setShowAiWelcome(false)

    window.history.replaceState({}, "", "/event3")
    window.location.replace("/event3")
  }, [])

  const handleUseAnotherNumber = useCallback(() => {
    if (typeof window === "undefined") return
    clearStoredParticipantIdentity()
    clearAllArrived()
    setToken(null)
    setTokenError(false)
    setBreakFeedbackOpen(false)
    setBreakFeedbackRound(null)
    setActiveMatchFeedbackSlot(null)
    setEnrolled(null)
    setMyInfo(null)
    setRankingDraftContext(null)
    setResolvedRankingRound(null)
    setShowWelcome(false)
    setShowAiWelcome(false)
    window.history.replaceState({}, "", "/event3")
  }, [])

  const fetchState = useCallback(async () => {
    if (!token) throw new Error("No token")
    const d = await call("e3-heartbeat", token)
    if (d.error) {
      if (d.code === "EVENT3_TEST_MODE_LOCKED") setTestModeBlocked(true)
      // Only a structured, non-retriable authentication response proves the
      // token is invalid. Network, timeout, database, and malformed responses
      // keep the participant identity and the last successful event state.
      if (d.code === "PARTICIPANT_TOKEN_INVALID" && d.retryable === false) {
        setTokenError(true)
        if (!isImpersonating) clearStoredParticipantIdentity()
      }
      const heartbeatError = new Error(d.error)
      Object.assign(heartbeatError, {
        code: d.code,
        retryable: d.retryable,
        httpStatus: d.http_status,
      })
      throw heartbeatError
    }
    setTestModeBlocked(false)
    setTokenError(false)
    if (typeof d.enrolled === "boolean") setEnrolled(d.enrolled)
    if (d.my_info && typeof d.my_info === "object") setMyInfo(d.my_info)
    return d
  }, [token, isImpersonating])

  const { data: eventState, loading: stateLoading, error: stateError, retry: retryState, lastSuccessAt } = useApiPoll(fetchState, {
    interval: 5000,
    enabled: !!token && !tokenError,
    resetKey: token,
  })

  const fetchPublicFormat = useCallback(async () => {
    const d = await call("e3-get-public-format", null)
    if (d.error) throw new Error(d.error)
    return d as { event_format?: unknown; group_round_count?: number; participant_access_locked?: boolean }
  }, [])
  const { data: publicFormatState, loading: publicFormatLoading, error: publicFormatError, retry: retryPublicFormat } = useApiPoll(fetchPublicFormat, {
    interval: 5000,
  })
  const eventFormat = normalizeEvent3Format(
    eventState?.event_format ?? publicFormatState?.event_format,
  )

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

  // Keep an unfinished ranking screen alive if the organizer advances. This
  // gives backgrounded/slow phones a chance to submit instead of losing their
  // local order when the heartbeat phase changes underneath them.
  useEffect(() => {
    const match = String(eventState?.phase || "").match(/^ranking([123])$/)
    if (match) {
      const round = Number(match[1])
      if (resolvedRankingRound === round) return
      setRankingDraftContext({
        round,
        timerActive: Boolean(eventState?.timer_active),
        timerStart: eventState?.timer_start || null,
        timerDuration: Number(eventState?.timer_duration || 0),
      })
    } else if (eventState?.phase === "setup") {
      setRankingDraftContext(null)
      setResolvedRankingRound(null)
    }
  }, [eventState?.phase, eventState?.timer_active, eventState?.timer_start, eventState?.timer_duration, resolvedRankingRound])

  const handleRankingResolved = useCallback((round: number) => {
    setResolvedRankingRound(round)
    setRankingDraftContext(null)
  }, [])
  const handleRankingDirty = useCallback(() => {
    const match = String(eventState?.phase || "").match(/^ranking([123])$/)
    if (!match) return
    setResolvedRankingRound(null)
    setRankingDraftContext({
      round: Number(match[1]),
      timerActive: Boolean(eventState?.timer_active),
      timerStart: eventState?.timer_start || null,
      timerDuration: Number(eventState?.timer_duration || 0),
    })
  }, [eventState?.phase, eventState?.timer_active, eventState?.timer_start, eventState?.timer_duration])

  const trackMatchFeedback = useCallback((slot: 1 | 2 | 3, open: boolean) => {
    setActiveMatchFeedbackSlot(current => open ? slot : current === slot ? null : current)
  }, [])
  const trackFirstMatchFeedback = useCallback((open: boolean) => trackMatchFeedback(1, open), [trackMatchFeedback])
  const trackSecondMatchFeedback = useCallback((open: boolean) => trackMatchFeedback(2, open), [trackMatchFeedback])
  const trackThirdMatchFeedback = useCallback((open: boolean) => trackMatchFeedback(3, open), [trackMatchFeedback])

  useEffect(() => {
    if (eventState?.phase === "setup") setActiveMatchFeedbackSlot(null)
  }, [eventState?.phase, eventState?.event_id])

  useEffect(() => {
    if (!eventState?.phase || showWelcome || showAiWelcome || pendingGroupFeedbackRound || breakFeedbackOpen || activeMatchFeedbackSlot) return
    eventContentRef.current?.scrollTo({ top: 0, behavior: "auto" })
    const focusTimer = window.setTimeout(() => phaseAnnouncementRef.current?.focus(), 80)
    return () => window.clearTimeout(focusTimer)
  }, [eventState?.phase, showWelcome, showAiWelcome, pendingGroupFeedbackRound, breakFeedbackOpen, activeMatchFeedbackSlot])

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

  // Feedback belongs to one completed group round. It may remain open while
  // the organizer advances to the following phase, but stale round-1 feedback
  // must never cover the second ranking screen.
  useEffect(() => {
    if (!pendingGroupFeedbackRound) return
    const phase = String(eventState?.phase || "")
    const nextRanking = phase.match(/^ranking([123])$/)
    if (phase === "setup" || (nextRanking && Number(nextRanking[1]) !== pendingGroupFeedbackRound)) {
      setPendingGroupFeedbackRound(null)
    }
  }, [eventState?.phase, pendingGroupFeedbackRound])

  useEffect(() => {
    if (!breakFeedbackOpen && breakFeedbackRound == null) return
    if (eventState?.phase !== "break") {
      setBreakFeedbackOpen(false)
      setBreakFeedbackRound(null)
    }
  }, [eventState?.phase, breakFeedbackOpen, breakFeedbackRound])

  useEffect(() => {
    const p = searchParams.get("token") || searchParams.get("t")
    if (p) {
      setToken(p)
      if (!isImpersonating) {
        localStorage.setItem("blindmatch_result_token", p)
        localStorage.setItem("blindmatch_returning_token", p)
      }
    }
  }, [searchParams, isImpersonating])

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
    try { localStorage.setItem(EVENT3_ONBOARDING_KEY, "1") } catch {}
    setShowWelcome(false)
    // Only show AI welcome if not already seen for this token
    if (aiWelcomeSeenKey && localStorage.getItem(aiWelcomeSeenKey) === "1") return
    setShowAiWelcome(true)
  }, [aiWelcomeSeenKey])

  useEffect(() => {
    if (!showAiWelcome || !eventState?.phase || eventState.phase === "setup") return
    if (aiWelcomeSeenKey) localStorage.setItem(aiWelcomeSeenKey, "1")
    setShowAiWelcome(false)
  }, [showAiWelcome, eventState?.phase, aiWelcomeSeenKey])

  // Lightweight, token-free visual QA for the mobile question experiences.
  // This is intentionally read-only and does not touch event or participant data.
  const questionPreview = searchParams.get("questionPreview")
  if (questionPreview === "mobileQA") {
    return (
      <main className="flex min-h-[100dvh] flex-wrap items-center justify-center gap-6 bg-slate-950 p-6">
        <iframe title="معاينة شاشة الاستراحة" src="/event3?questionPreview=breakScreen" className="h-[568px] w-[320px] rounded-xl border border-slate-700 bg-gray-950" />
        <iframe title="معاينة تقييم المجموعة" src="/event3?questionPreview=groupReflection" className="h-[568px] w-[320px] rounded-xl border border-slate-700 bg-gray-950" />
        <iframe title="معاينة مراجعة تقييمات الاستراحة" src="/event3?questionPreview=breakGroupFeedback" className="h-[568px] w-[320px] rounded-xl border border-slate-700 bg-gray-950" />
        <iframe title="معاينة رسالة الترحيب" src="/event3?questionPreview=aiWelcome" className="h-[568px] w-[320px] rounded-xl border border-slate-700 bg-gray-950" />
      </main>
    )
  }
  if (questionPreview === "welcome") {
    return <WelcomeScreen onDone={() => {}} eventFormat={CHOICE_ONLY_EVENT3_FORMAT} />
  }
  if (questionPreview === "login" || questionPreview === "loginToken") {
    return <PhoneEntry initialMethod={questionPreview === "loginToken" ? "token" : "sms"} onToken={() => {}} />
  }
  if (questionPreview === "aiWelcome" || questionPreview === "aiWelcomeFailed") {
    return (
      <main className="min-h-[100dvh] bg-gray-950 text-white" dir="rtl">
        <AiWelcomePopup
          token="preview"
          onDone={() => {}}
          previewFailed={questionPreview === "aiWelcomeFailed"}
          previewMessage={questionPreview === "aiWelcome" ? "هذه رسالتك الخاصة: حضورك الهادئ وفضولك تجاه الناس يعطيانك فرصة جميلة لاكتشاف أشخاص يشبهونك بطرق لم تتوقعها. خذ وقتك، اسأل بصدق، ولا تشغل بالك بإعطاء الانطباع المثالي. أجمل الحوارات تبدأ عندما يكون كل شخص على طبيعته ويترك مساحة حقيقية للطرف الآخر." : undefined}
        />
      </main>
    )
  }
  if (questionPreview === "groupReflection") {
    return (
      <main className="min-h-[100dvh] bg-gray-950 text-white" dir="rtl">
        <GroupReflectionSheet
          token={null}
          groupRound={1}
          onClose={() => {}}
          previewPeople={[
            { number: 142, first_name: 'سارة', rounds: [1] },
            { number: 318, first_name: 'نورة', rounds: [1] },
            { number: 507, first_name: 'ليان', rounds: [1] },
            { number: 664, first_name: 'ريم', rounds: [1] },
            { number: 831, first_name: 'جود', rounds: [1] },
            { number: 940, first_name: 'لمى', rounds: [1] },
          ]}
        />
      </main>
    )
  }
  if (questionPreview === "breakGroupFeedback") {
    return (
      <main className="min-h-[100dvh] bg-gray-950 text-white" dir="rtl">
        <BreakGroupFeedbackPreview />
      </main>
    )
  }
  if (questionPreview === "breakScreen") {
    return (
      <main className="event3-shell min-h-[100dvh] bg-gray-950 text-white" dir="rtl">
        <BreakScreen
          timerActive={false}
          timerStart={null}
          timerDuration={900}
          eventFormat="choice_only_three_groups"
          onOpenGroupFeedback={() => {}}
        />
      </main>
    )
  }
  if (questionPreview === "journey") {
    return (
      <main className="event3-shell flex h-[100dvh] flex-col overflow-hidden bg-gray-950 text-white" dir="rtl" lang="ar">
        <div className="z-10 flex shrink-0 items-center justify-between border-b border-white/[0.07] bg-gray-950/90 px-4 py-3 backdrop-blur-xl">
          <div>
            <p className="text-[10px] font-bold text-pink-300">لقاء اختيارك · طاولة 7</p>
            <p className="mt-0.5 text-sm font-black">مع سارة</p>
          </div>
          <span className="font-mono text-sm font-black text-pink-200">21:42</span>
        </div>
        <div className="event3-scroll min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-sm space-y-4 p-4 pb-8">
            <MeetingPass accent="pink" kind="لقاء اختيارك" partnerName="سارة" tableNumber={7} />
            <JourneyCue accent="pink" title="ابدأ اللقاء مع سارة" description="اسم الشريك والطاولة يبقيان ظاهرين — ركّز الآن على الحوار." steps={["وصلت", "ابدأ الحوار", "قيّم اللقاء"]} currentStep={1} />
            <QuestionSlideshow defaultSet="choice" />
            <details className="group rounded-2xl border border-white/[0.07] bg-white/[0.025] text-right">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-xs font-bold text-gray-400">تحتاجون مساعدة في إدارة الحوار؟ <ChevronRight size={15} className="rotate-90" /></summary>
            </details>
            <button type="button" className="min-h-12 w-full rounded-2xl border border-white/[0.08] bg-white/[0.035] text-sm font-bold text-gray-400">إنهاء اللقاء والبدء بالتقييم</button>
          </div>
        </div>
      </main>
    )
  }
  if (questionPreview === "feedbackFlow") {
    return (
      <main className="event3-shell min-h-[100dvh] bg-gray-950 text-white" dir="rtl" lang="ar">
        <FeedbackFlow
          partnerName="سارة"
          word="فضول"
          wordSubmitted={false}
          done={false}
          onDone={() => {}}
          onBack={() => {}}
          onWordChange={() => {}}
          onSubmitWord={async () => true}
          onSubmit={async () => true}
          choiceOnly
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

  if (!storageReady) return (
    <PageWrapper className="flex items-center justify-center" aria-label="جاري تجهيز تجربتك">
      <Spinner size={28} />
    </PageWrapper>
  )

  if (showWelcome && publicFormatLoading && !publicFormatState && !eventState) return (
    <PageWrapper className="flex items-center justify-center" aria-label="جاري تحميل تفاصيل الفعالية">
      <Spinner size={28} />
    </PageWrapper>
  )
  if (showWelcome && publicFormatError && !publicFormatState && !eventState) return (
    <PageWrapper className="flex items-center justify-center p-6 text-center" role="alert">
      <GlassCard className="w-full max-w-sm space-y-4 rounded-[1.65rem] p-6">
        <Event3Mark size="compact" />
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-400/[0.08]"><AlertTriangle className="text-amber-300" size={23} /></div>
        <div className="space-y-1">
          <p className="font-black text-white">تعذّر تحميل نسخة الفعالية</p>
          <p className="text-sm leading-6 text-gray-400">نحتاج هذه المعلومة لعرض الشرح الصحيح قبل دخولك.</p>
        </div>
        <button type="button" onClick={retryPublicFormat} className="event3-action flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 text-sm font-black text-gray-950">
          <RefreshCw size={16} /> إعادة المحاولة
        </button>
      </GlassCard>
    </PageWrapper>
  )

  if (showWelcome) return <WelcomeScreen onDone={handleWelcomeDone} onLogout={handleLogout} showLogout={!!token && !isImpersonating} eventFormat={eventFormat} />

  if (testModeBlocked || publicFormatState?.participant_access_locked === true) return (
    <PageWrapper className="flex items-center justify-center p-6 text-center">
      <div className="event3-glass w-full max-w-sm rounded-3xl border border-amber-300/[0.16] p-7">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-500/25 bg-amber-500/10">
          <ShieldCheck className="text-amber-300" size={31} />
        </div>
        <p className="mb-2 text-xs font-bold tracking-wide text-amber-300">الفعالية الرئيسية</p>
        <h1 className="text-xl font-black text-white">غير مفتوحة بعد</h1>
        <p className="mt-3 text-sm leading-7 text-gray-400">نجهّز الفعالية الآن. سيُفتح دخول المشاركين تلقائياً عند انتهاء الاختبار.</p>
        <div className="mt-6 flex flex-col items-stretch gap-3">
          <button onClick={() => { setTestModeBlocked(false); retryPublicFormat(); if (token) retryState() }} className="event3-action inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-black text-gray-950">
            <RefreshCw size={15} />
            التحقق مجدداً
          </button>
          {token && !isImpersonating && <ParticipantLogoutButton onLogout={handleLogout} />}
        </div>
      </div>
    </PageWrapper>
  )

  if (!token || tokenError) return <PhoneEntry onToken={t => { setToken(t); setTokenError(false) }} />

  if (stateLoading && !eventState) return (
    <PageWrapper className="flex items-center justify-center">
      {!isImpersonating && <ParticipantLogoutButton onLogout={handleLogout} className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))]" />}
      <Spinner size={28} />
    </PageWrapper>
  )

  if (stateError && !eventState) return (
    <PageWrapper className="flex items-center justify-center p-6 text-center" role="alert">
      <GlassCard className="w-full max-w-sm space-y-4 rounded-[1.65rem] p-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-red-400/20 bg-red-500/[0.08]">
          <AlertTriangle className="text-red-300" size={26} />
        </div>
        <div className="space-y-1">
          <p className="font-black text-white">تعذّر تحميل بيانات الفعالية</p>
          <p className="text-sm text-gray-500">{stateError}</p>
        </div>
        <button type="button" onClick={retryState} className="event3-action flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-5 py-2.5 text-sm font-black text-white">
          <RefreshCw size={16} />
          إعادة المحاولة
        </button>
        {!isImpersonating && <ParticipantLogoutButton onLogout={handleLogout} />}
      </GlassCard>
    </PageWrapper>
  )

  const { phase, timer_active, timer_start, timer_duration } = eventState
  const timerProps = { timerActive: timer_active, timerStart: timer_start, timerDuration: timer_duration, correctedNow }
  const activeMatchFeedbackPhase = activeMatchFeedbackSlot === 1
    ? "phase2_reveal"
    : activeMatchFeedbackSlot === 2
      ? "phase3_reveal"
      : activeMatchFeedbackSlot === 3
        ? "phase4_reveal"
        : null
  const holdingMatchFeedback = Boolean(activeMatchFeedbackPhase && phase !== activeMatchFeedbackPhase)

  if (enrolled === false) return <NotEnrolledScreen onUseAnotherNumber={handleUseAnotherNumber} onLogout={handleLogout} />

  const isRound = /^round[123]$/.test(phase)
  const rankingMatch = phase.match(/^ranking([123])$/)
  const completedRounds = rankingMatch ? parseInt(rankingMatch[1]) : null
  const rankingRoundToRender = completedRounds ?? rankingDraftContext?.round ?? null
  const holdingRankingDraft = Boolean(!completedRounds && rankingDraftContext)
  const rankingTimerProps = completedRounds || !rankingDraftContext
    ? timerProps
    : {
        timerActive: rankingDraftContext.timerActive,
        timerStart: rankingDraftContext.timerStart,
        timerDuration: rankingDraftContext.timerDuration,
        correctedNow,
      }
  const visibleGroupFeedbackRound = pendingGroupFeedbackRound
    && phase !== "setup"
    && !(completedRounds && completedRounds !== pendingGroupFeedbackRound)
    ? pendingGroupFeedbackRound
    : null
  const hasPendingMoodCheck = Boolean(!finalQuestionsOpen && eventState?.mood_check?.pending)
  const hasPendingNotification = Boolean(eventState?.notification?.pending)
  const hasUrgentNotification = hasPendingNotification && eventState?.notification?.icon === "alert"
  const isSafePromptMoment = ["setup", "break", "phase2_processing", "phase3_processing", "phase4_processing"].includes(phase)
  const isActiveMoodMoment = ["round1", "round2", "round3", "phase2_reveal", "phase3_reveal", "phase4_reveal"].includes(phase)
  // Once a reflection sheet is open, keep it mounted until the participant
  // finishes or closes it. Heartbeat-driven prompts queue behind it so locally
  // drafted ratings and notes are never destroyed.
  const activeGroupFeedbackRound = visibleGroupFeedbackRound
  const activeBreakFeedback = phase === "break" && breakFeedbackOpen
  const feedbackOverlayOpen = Boolean(activeGroupFeedbackRound || activeBreakFeedback || activeMatchFeedbackSlot)
  const canShowMoodCheck = !hasUrgentNotification && hasPendingMoodCheck && (isSafePromptMoment || isActiveMoodMoment) && !feedbackOverlayOpen
  // Urgent alerts overlay the current screen without unmounting its draft.
  const canShowNotification = hasPendingNotification && (hasUrgentNotification || (!finalQuestionsOpen && isSafePromptMoment && !feedbackOverlayOpen && !hasPendingMoodCheck))
  const canShowAiWelcome = showAiWelcome
    && phase === "setup"
    && !finalQuestionsOpen
    && !hasPendingMoodCheck
    && !hasPendingNotification
    && !feedbackOverlayOpen
  const showStatusHeader = !finalQuestionsOpen && !rankingRoundToRender && !groupsOpen

  return (
    <MotionConfig reducedMotion="user">
    <div className="event3-shell flex h-[100dvh] flex-col overflow-hidden" dir="rtl" lang="ar">
      <Toaster position="top-center" toastOptions={{ style: { background: "rgba(10, 8, 24, .94)", color: "#f9fafb", border: "1px solid rgba(255, 255, 255, .1)", borderRadius: "16px", boxShadow: "0 20px 55px -30px rgba(168, 85, 247, .75)", backdropFilter: "blur(18px)" } }} />

      {/* Impersonation banner */}
      {isImpersonating && (
        <div className="relative z-[300] shrink-0 border-b border-amber-600/50 bg-amber-900/90 px-4 pb-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] text-center">
          <span className="text-amber-200 text-xs font-medium">
            🎭 وضع تسجيل دخول مؤقت — أنت تتصرف كمشارك #{myInfo?.number ?? "?"} ({myInfo?.name ?? "..."})
          </span>
        </div>
      )}

      {showStatusHeader && <EventStatusHeader eventState={eventState} isOffline={isOffline} pollError={stateError} lastSuccessAt={lastSuccessAt} correctedNow={correctedNow} impersonating={isImpersonating} onLogout={!isImpersonating ? handleLogout : undefined} />}
      {!showStatusHeader && !isImpersonating && (
        <ParticipantLogoutButton
          onLogout={handleLogout}
          compact
          className="fixed left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[180]"
        />
      )}

      <div ref={phaseAnnouncementRef} tabIndex={-1} className="sr-only" aria-live="polite">
        {`المرحلة الحالية: ${event3PhaseLabel(phase, eventFormat)}`}
      </div>

      {/* Screen content fills available space */}
      <motion.div ref={eventContentRef} layoutScroll className="event3-scroll relative min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence>
          {!holdingRankingDraft && !activeMatchFeedbackSlot && phase === "setup" && <SetupScreen key="setup" token={token} myInfo={myInfo} enrolledCount={eventState?.participants_selected ?? null} eventFormat={eventFormat} />}
          {!holdingRankingDraft && !activeMatchFeedbackSlot && isRound && <RoundScreen key={phase} token={token} phase={phase} {...timerProps} myInfo={myInfo} onGroupsOpenChange={setGroupsOpen} eventFormat={eventFormat} />}
          {rankingRoundToRender && <RankingScreen key={`ranking-${rankingRoundToRender}`} token={token} completedRounds={rankingRoundToRender} currentPhase={phase} {...rankingTimerProps} myInfo={myInfo} onOpenGroupFeedback={setPendingGroupFeedbackRound} onRankingResolved={handleRankingResolved} onRankingDirty={handleRankingDirty} eventFormat={eventFormat} />}
          {!holdingRankingDraft && (activeMatchFeedbackSlot === 1 || (!activeMatchFeedbackSlot && phase === "phase2_reveal")) && <Phase2RevealScreen key="p2r" token={token} eventId={eventState?.event_id} {...timerProps} eventFormat={eventFormat} onFeedbackOpenChange={trackFirstMatchFeedback} feedbackLocked={holdingMatchFeedback} />}
          {!holdingRankingDraft && (activeMatchFeedbackSlot === 2 || (!activeMatchFeedbackSlot && phase === "phase3_reveal")) && <Phase3RevealScreen key="p3r" token={token} eventId={eventState?.event_id} {...timerProps} eventFormat={eventFormat} onFeedbackOpenChange={trackSecondMatchFeedback} feedbackLocked={holdingMatchFeedback} />}
          {!holdingRankingDraft && (activeMatchFeedbackSlot === 3 || (!activeMatchFeedbackSlot && phase === "phase4_reveal")) && <Phase3RevealScreen key="p4r" token={token} eventId={eventState?.event_id} {...timerProps} eventFormat={eventFormat} matchSlot={3} onFeedbackOpenChange={trackThirdMatchFeedback} feedbackLocked={holdingMatchFeedback} />}
          {!holdingRankingDraft && !activeMatchFeedbackSlot && (phase === "phase2_processing" || phase === "phase3_processing" || phase === "phase4_processing") && <ProcessingScreen key="processing" phase={phase} eventFormat={eventFormat} />}
          {!holdingRankingDraft && !activeMatchFeedbackSlot && phase === "break" && <BreakScreen key="break" {...timerProps} eventFormat={eventFormat} onOpenGroupFeedback={() => { setBreakFeedbackRound(null); setBreakFeedbackOpen(true) }} />}
          {!holdingRankingDraft && !activeMatchFeedbackSlot && phase === "final_reveal" && <FinalRevealScreen key="final" token={token} impersonating={isImpersonating} onQuestionViewerChange={setFinalQuestionsOpen} eventFormat={eventFormat} />}
        </AnimatePresence>
      </motion.div>

      {/* Keep help-chat state mounted while higher-priority overlays are visible,
          so an unsent organizer message is restored instead of discarded. */}
      {enrolled && (
        <SOSButton
          token={token}
          position="bottom"
          sosRequests={eventState?.sos_requests}
          suppressed={Boolean(rankingRoundToRender) || phase === "final_reveal" || phase === "break" || groupsOpen || canShowMoodCheck || canShowNotification || feedbackOverlayOpen || canShowAiWelcome}
        />
      )}

      {/* Mood check popup — receives mood check data from heartbeat */}
      {enrolled && token && canShowMoodCheck && <MoodCheckModal token={token} name={myInfo?.name} moodCheck={eventState?.mood_check} />}
      {/* Notification popup — receives notification data from heartbeat */}
      {enrolled && token && canShowNotification && <NotificationModal token={token} notification={eventState?.notification} />}

      <AnimatePresence mode="wait">
        {activeGroupFeedbackRound && (
          <GroupReflectionSheet
            key={`group-feedback-${activeGroupFeedbackRound}`}
            token={token}
            groupRound={activeGroupFeedbackRound}
            onClose={() => setPendingGroupFeedbackRound(null)}
          />
        )}
        {!activeGroupFeedbackRound && activeBreakFeedback && breakFeedbackRound == null && (
          <BreakGroupFeedbackSheet
            key="break-group-feedback"
            token={token}
            eventFormat={eventFormat}
            onClose={() => setBreakFeedbackOpen(false)}
            onSelectRound={setBreakFeedbackRound}
          />
        )}
        {!activeGroupFeedbackRound && activeBreakFeedback && breakFeedbackRound != null && (
          <GroupReflectionSheet
            key={`break-group-feedback-${breakFeedbackRound}`}
            token={token}
            groupRound={breakFeedbackRound}
            reviewMode
            onClose={() => setBreakFeedbackRound(null)}
          />
        )}
      </AnimatePresence>

      {/* AI Welcome popup — shows once after welcome screen */}
      {canShowAiWelcome && token && <AiWelcomePopup token={token} onDone={() => {
        if (aiWelcomeSeenKey) localStorage.setItem(aiWelcomeSeenKey, "1")
        setShowAiWelcome(false)
      }} />}
    </div>
    </MotionConfig>
  )
}
