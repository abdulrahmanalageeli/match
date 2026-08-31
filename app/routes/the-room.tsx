import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import toast, { Toaster } from "react-hot-toast"
import { useVisibilityPoll } from "../hooks/useVisibilityPoll"
import { RoomRoundTimer } from "../components/RoomRoundTimer"
import type { RoomTimerCommand } from "../components/RoomRoundTimer"
import { DEFAULT_ROOM_ROUND_SECONDS, roomTimerRemaining } from "../lib/the-room-timer.mjs"
import { planFixedRoute } from "../lib/the-room-fixed-routes.mjs"
import {
  ArrowLeftRight, ArrowRight, BadgeCheck, CalendarPlus, Camera, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, Clock3, DoorOpen, Download, Eye, EyeOff, Gauge,
  Loader2, LockKeyhole, LogOut, Maximize2, Minus, Monitor, Play, Plus, Printer, RefreshCw,
  RotateCcw, Settings2, Share2, ShieldCheck, SlidersHorizontal, Sparkles, Table2, Trash2,
  Undo2, UserCog, UserPlus, UserRound, UsersRound, WandSparkles, X,
} from "lucide-react"
import "@fontsource/tajawal/400.css"
import "@fontsource/tajawal/500.css"
import "@fontsource/tajawal/700.css"
import "@fontsource/tajawal/800.css"

export const meta = () => [
  { title: "ذا روم — تنظيم الجلسات" },
  { name: "description", content: "لوحة عربية بسيطة لتنظيم ضيوف وطاولات ذا روم." },
]

type Gender = "male" | "female" | "nonbinary" | "unspecified"
type RoomEvent = {
  id: string
  event_number: number
  name: string
  starts_at: string | null
  venue: string | null
  status: string
  minimum_attendees: number
  table_count: number
  round_count: number
  active_round: number
  seating_mode?: "planned" | "fixed_routes"
  route_revision?: number
  timer_duration_seconds: number
  timer_remaining_seconds: number
  timer_ends_at: string | null
  timer_revision: number
  created_at: string
  updated_at: string
}
type Attendee = {
  id: string
  event_id: string
  attendee_number: number
  full_name: string
  gender: Gender
  attendance_status: string
  included_in_schedule: boolean
  checked_in: boolean
  created_at?: string
  updated_at?: string
}
type ScheduleRun = {
  id: string
  participant_count: number
  table_count: number
  round_count: number
  metrics: Record<string, number>
}
type Seat = {
  id: number
  schedule_run_id: string
  event_id: string
  round_number: number
  table_number: number
  seat_number: number
  attendee_id: string
}
type Bundle = { event: RoomEvent; attendees: Attendee[]; schedule: ScheduleRun | null; seats: Seat[]; clock_offset_ms?: number }
type SetupValues = { event_number: number; minimum_attendees: number; female_attendees: number; male_attendees: number; table_count: number; round_count: number }
type PlacementNotice = { attendeeNumber: number; gender: Gender; tables: { roundNumber: number; tableNumber: number }[]; waitlisted?: boolean; repeatPairCount?: number }
type PendingArrival = { eventId: string; requestId: string; gender: "female" | "male" }

const DEMO_BUNDLE: Bundle = {
  event: {
    id: "demo-event", event_number: 12, name: "The Room", starts_at: null, venue: null,
    status: "ready", minimum_attendees: 0, table_count: 5, round_count: 3,
    active_round: 1, seating_mode: "fixed_routes", route_revision: 0,
    timer_duration_seconds: DEFAULT_ROOM_ROUND_SECONDS, timer_remaining_seconds: DEFAULT_ROOM_ROUND_SECONDS, timer_ends_at: null, timer_revision: 0,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
  attendees: [],
  schedule: { id: "demo-run", participant_count: 0, table_count: 5, round_count: 3, metrics: {} },
  seats: [],
}

async function roomApi(action: string, payload: Record<string, unknown> = {}) {
  const requestStartedAt = Date.now()
  const response = await fetch("/api/the-room", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  })
  const data = await response.json().catch(() => ({ error: "invalid-response" }))
  if (data.server_now) {
    const serverTime = Date.parse(data.server_now)
    if (Number.isFinite(serverTime)) data.clock_offset_ms = serverTime - (requestStartedAt + Date.now()) / 2
  }
  if (!response.ok) {
    throw Object.assign(new Error(data.error || "request-failed"), {
      status: response.status,
      code: data.code,
      details: data.details,
    })
  }
  return data
}

function arabicError(error: any) {
  if (error?.status === 401) return "انتهت الجلسة. سجّل الدخول مرة أخرى."
  if (error?.code === "MINIMUM_NOT_MET") return "عدد الحضور أقل من العدد المطلوب."
  if (error?.code === "TOO_MANY_TABLES") return "عدد الطاولات كبير مقارنة بعدد الحضور."
  if (["TABLE_GEOMETRY_IMPOSSIBLE", "PAIR_CAPACITY_EXCEEDED"].includes(error?.code)) return "هذا التوزيع غير ممكن. قلّل الجولات أو الطاولات ثم حاول مرة أخرى."
  if (error?.code === "NO_BADGES_LEFT") return "تم تسليم جميع البطاقات المتاحة. أضف شخصًا جديدًا إذا حضر شخص إضافي."
  if (error?.code === "BADGE_ALREADY_ASSIGNED") return "تم تسليم هذه البطاقة للتو من جهاز آخر. حاول مرة أخرى."
  if (error?.code === "ROUND_STATE_CHANGED") return "بدأت الجولة التالية من جهاز آخر وتم تحديث الشاشة."
  if (error?.code === "EVENT_CHANGED_RETRY") return "تغيّرت الفعالية من جهاز آخر. حدّث الشاشة ثم حاول مرة أخرى."
  if (error?.code === "INVALID_TIMER_CONTROL") return "تعذّر تغيير المؤقت. أوقفه قبل تغيير المدة، أو أعده بعد انتهاء الوقت."
  if (error?.code === "FIXED_ROUTES_LOCKED") return "المسارات المسلّمة ثابتة. لا يمكن تغيير الطاولات أو الجولات بعد إصدار أول بطاقة."
  if (error?.code === "REQUEST_ID_CONFLICT") return "طلب الوصول السابق محفوظ ببيانات مختلفة. حدّث الشاشة لاسترجاعه."
  if (error?.code === "FIXED_ROUTE_CONSTRAINT") return "تعذّر تثبيت مسار الضيف. حدّث الشاشة وأعد محاولة نفس الطلب."
  if (error?.code === "EVENT_NOT_OPEN") return "هذه الفعالية غير مفتوحة لاستقبال الضيوف."
  if (error?.code === "SCHEDULE_CHANGED_RETRY") return "تم حفظ الشخص. حدّث الشاشة مرة واحدة لإظهار طاولته."
  if (error?.code === "SAME_TABLE") return "الشخص موجود على هذه الطاولة أصلًا."
  if (error?.code === "INVALID_MOVE") return "تعذّر النقل. تأكد من الجولة والطاولة."
  if (error?.code === "MOVE_REPEATS_MEETING") return "هذا النقل بيكرر لقاء سابق. اختر طاولة ثانية."
  return "تعذّر تنفيذ الطلب. تأكد من الأعداد وحاول مرة أخرى."
}

function guestNumber(value: number) {
  return String(value).padStart(2, "0")
}

function guestRepeatCount(seats: Seat[], attendeeId: string) {
  const tables = new Set(seats.filter(seat => seat.attendee_id === attendeeId).map(seat => `${seat.round_number}:${seat.table_number}`))
  const meetings = new Map<string, number>()
  for (const seat of seats) {
    if (seat.attendee_id !== attendeeId && tables.has(`${seat.round_number}:${seat.table_number}`)) meetings.set(seat.attendee_id, (meetings.get(seat.attendee_id) || 0) + 1)
  }
  return [...meetings.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0)
}

function genderStyle(gender: Gender) {
  if (gender === "female") return {
    label: "سيدة",
    chip: "border-rose-300/25 bg-rose-300/[0.09] text-rose-100 hover:border-rose-300/50",
    accent: "text-rose-200",
    surface: "border-rose-300/30 from-rose-950/85 via-[#130d0d] to-[#0b0b09]",
    glow: "bg-rose-400/20",
  }
  if (gender === "male") return {
    label: "رجل",
    chip: "border-sky-300/25 bg-sky-300/[0.09] text-sky-100 hover:border-sky-300/50",
    accent: "text-sky-200",
    surface: "border-sky-300/30 from-sky-950/85 via-[#0c1115] to-[#0b0b09]",
    glow: "bg-sky-400/20",
  }
  return {
    label: "شخص",
    chip: "border-violet-300/25 bg-violet-300/[0.09] text-violet-100 hover:border-violet-300/50",
    accent: "text-violet-200",
    surface: "border-violet-300/30 from-violet-950/85 via-[#100d15] to-[#0b0b09]",
    glow: "bg-violet-400/20",
  }
}

function checkInTime(value?: string) {
  if (!value) return "الآن"
  return new Intl.DateTimeFormat("ar-SA", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(new Date(value))
}

function bundleFingerprint(bundle: Bundle) {
  return [
    bundle.event.id,
    bundle.event.updated_at,
    bundle.event.active_round,
    bundle.event.seating_mode,
    bundle.event.route_revision,
    bundle.event.timer_revision,
    bundle.event.timer_ends_at,
    bundle.event.timer_remaining_seconds,
    bundle.event.timer_duration_seconds,
    bundle.schedule?.id || "no-schedule",
    ...bundle.attendees.map(person => `${person.id}:${person.updated_at || ""}:${person.checked_in}:${person.gender}:${person.attendance_status}:${person.included_in_schedule}`),
    ...bundle.seats.map(seat => `${seat.id}:${seat.round_number}:${seat.table_number}:${seat.seat_number}:${seat.attendee_id}`),
  ].join("|")
}

function balanceInfo(women: number, men: number) {
  const difference = Math.abs(women - men)
  if (difference <= 1) return { label: "التوازن ممتاز", tone: "border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-100", preferred: null }
  if (difference <= 3) return { label: "التوازن جيد", tone: "border-[#d7ba7d]/20 bg-[#d7ba7d]/[0.07] text-[#efd89e]", preferred: women < men ? "سيدة" : "رجل" }
  return { label: "يحتاج موازنة", tone: "border-amber-300/25 bg-amber-300/[0.08] text-amber-100", preferred: women < men ? "سيدة" : "رجل" }
}

function compareNumberScores(left: number[], right: number[]) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

function previewSeatNewGuest(bundle: Bundle, person: Attendee, activeRound: number) {
  const nextSeats: Seat[] = []
  const pairKey = (left: string, right: string) => left < right ? `${left}|${right}` : `${right}|${left}`
  const priorPairs = new Set<string>()
  for (let roundNumber = activeRound; roundNumber <= bundle.event.round_count; roundNumber += 1) {
    const candidates = Array.from({ length: bundle.event.table_count }, (_, index) => {
      const tableNumber = index + 1
      const tableSeats = [...bundle.seats, ...nextSeats].filter(seat => seat.round_number === roundNumber && seat.table_number === tableNumber)
      const members = tableSeats.map(seat => bundle.attendees.find(attendee => attendee.id === seat.attendee_id)).filter(Boolean) as Attendee[]
      const sameGender = members.filter(member => member.gender === person.gender).length
      const women = members.filter(member => member.gender === "female").length + (person.gender === "female" ? 1 : 0)
      const men = members.filter(member => member.gender === "male").length + (person.gender === "male" ? 1 : 0)
      const repeats = members.reduce((count, member) => count + (priorPairs.has(pairKey(person.id, member.id)) ? 1 : 0), 0)
      return { tableNumber, tableSeats, score: [sameGender, Math.abs(women - men), repeats, members.length, (tableNumber + roundNumber) % bundle.event.table_count] }
    }).sort((left, right) => compareNumberScores(left.score, right.score))
    const selected = candidates[0]
    const id = Math.max(0, ...bundle.seats.map(seat => Number(seat.id)), ...nextSeats.map(seat => Number(seat.id))) + 1
    nextSeats.push({ id, schedule_run_id: bundle.schedule!.id, event_id: bundle.event.id, round_number: roundNumber, table_number: selected.tableNumber, seat_number: selected.tableSeats.reduce((maximum, seat) => Math.max(maximum, seat.seat_number), 0) + 1, attendee_id: person.id })
    selected.tableSeats.forEach(seat => priorPairs.add(pairKey(person.id, seat.attendee_id)))
  }
  return nextSeats
}

function Counter({ label, value, onChange, min, max, step = 1, hint }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number; step?: number; hint?: string }) {
  const update = (next: number) => onChange(Math.min(max, Math.max(min, next)))
  return (
    <div className="flex min-h-[5rem] items-center justify-between gap-3 border-b border-[#ebe6dd] px-1 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[15px] font-extrabold text-[#29261f]">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-[#6f685d]">{hint}</p>}
      </div>
      <div className="grid shrink-0 grid-cols-[44px_58px_44px] items-center gap-1.5" dir="ltr">
        <button type="button" onClick={() => update(value - step)} disabled={value <= min} className="flex h-11 items-center justify-center rounded-full border border-[#ded7cc] bg-white text-[#4f493f] transition active:scale-95 disabled:opacity-25" aria-label={`تقليل ${label}`}><Minus size={17} /></button>
        <input className="h-11 w-full rounded-xl border-0 bg-transparent px-1 text-center text-xl font-extrabold tabular-nums text-[#211f1a] outline-none focus:bg-[#f4efe6]" type="number" min={min} max={max} step={step} value={value} onChange={event => update(Number(event.target.value) || min)} aria-label={label} />
        <button type="button" onClick={() => update(value + step)} disabled={value >= max} className="flex h-11 items-center justify-center rounded-full bg-[#211f1a] text-white shadow-sm transition active:scale-95 disabled:opacity-25" aria-label={`زيادة ${label}`}><Plus size={17} /></button>
      </div>
    </div>
  )
}

function LoginScreen({ onLogin, checking, configured }: { onLogin: (key: string) => Promise<void>; checking: boolean; configured: boolean }) {
  const [key, setKey] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  return (
    <main dir="rtl" className="the-room-page relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#f3f0e9] px-5 py-10 font-['Tajawal'] text-[#211f1a]">
      <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "radial-gradient(circle at 15% 8%, rgba(184,143,85,.16), transparent 28%), radial-gradient(circle at 90% 88%, rgba(102,126,107,.12), transparent 30%)" }} />
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.35rem] bg-[#211f1a] text-[#e6c58c] shadow-[0_18px_45px_rgba(33,31,26,.18)]"><DoorOpen size={28} /></div>
          <p className="mt-5 text-xs font-extrabold tracking-wide text-[#9a733e]">لوحة المنظّم</p>
          <h1 className="mt-1 text-4xl font-extrabold tracking-tight">ذا روم</h1>
          <p className="mt-2 text-sm leading-6 text-[#777064]">دخول هادئ وسريع، وبعدها كل شيء قدامك.</p>
        </div>
        <form onSubmit={async event => { event.preventDefault(); setSubmitting(true); try { await onLogin(key) } finally { setSubmitting(false) } }} className="rounded-[2rem] border border-[#e4ded3] bg-white/90 p-5 shadow-[0_25px_80px_rgba(61,50,34,.09)] backdrop-blur-xl">
          <label htmlFor="room-access-key" className="mb-2 block text-sm font-extrabold text-[#4e493f]">رمز الدخول</label>
          <div className="relative">
            <input id="room-access-key" type={showKey ? "text" : "password"} value={key} onChange={event => setKey(event.target.value)} autoComplete="current-password" className="h-14 w-full rounded-2xl border border-[#ded8ce] bg-[#f8f6f1] px-4 pl-12 text-right text-base font-bold text-[#211f1a] outline-none transition placeholder:text-[#aaa397] focus:border-[#b58a4e] focus:ring-4 focus:ring-[#b58a4e]/10" placeholder="أدخل الرمز الخاص" />
            <button type="button" onClick={() => setShowKey(value => !value)} className="absolute left-1.5 top-1.5 flex h-11 w-11 items-center justify-center rounded-xl text-[#80796e]" aria-label={showKey ? "إخفاء الرمز" : "إظهار الرمز"}>{showKey ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          </div>
          <button type="submit" disabled={!key || submitting || checking || !configured} className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#211f1a] px-5 font-extrabold text-white shadow-lg shadow-[#211f1a]/10 transition active:scale-[.99] disabled:opacity-35">{submitting || checking ? <Loader2 className="animate-spin" size={18} /> : <LockKeyhole size={18} />} دخول</button>
          {!checking && !configured && <p className="mt-3 rounded-xl border border-amber-700/10 bg-amber-50 px-3 py-2 text-xs text-amber-900/70">إعداد الدخول غير مكتمل. تواصل مع المسؤول التقني مرة واحدة لتفعيله.</p>}
        </form>
      </motion.div>
    </main>
  )
}

function TableCard({ tableNumber, seats, attendees, fixedRoutes = false, onGuest }: { tableNumber: number; seats: Seat[]; attendees: Attendee[]; fixedRoutes?: boolean; onGuest: (id: string) => void }) {
  const people = seats.map(seat => attendees.find(person => person.id === seat.attendee_id)).filter(Boolean) as Attendee[]
  return (
    <section className="overflow-hidden rounded-3xl border border-[#e4ded4] bg-[#fbfaf7]">
      <header className="flex items-center justify-between border-b border-[#e9e4dc] px-4 py-3">
        <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#211f1a] font-extrabold text-[#e6c58c]">{tableNumber}</div><div><p className="font-extrabold text-[#29261f]">الطاولة {tableNumber}</p><p className="text-xs text-[#6f685d]">{fixedRoutes ? `${people.filter(person => person.gender === "male").length} رجال · ${people.filter(person => person.gender === "female").length} سيدات` : `${people.length} ضيوف`}</p></div></div>
        <Table2 size={20} className="text-[#9a733e]" />
      </header>
      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
        {people.map(person => { const style = genderStyle(person.gender); const woman = person.gender === "female"; return <button type="button" key={person.id} onClick={() => onGuest(person.id)} className={`flex min-h-14 flex-col items-center justify-center rounded-2xl border text-base font-extrabold transition active:scale-[.98] ${woman ? "border-[#ead1d5] bg-[#fbf2f3] text-[#6f3842]" : "border-[#cfdee6] bg-[#f1f6f9] text-[#365c70]"}`}><span>رقم {guestNumber(person.attendee_number)}</span><span className="mt-0.5 text-[10px] font-bold">{style.label}</span></button> })}
        {!people.length && <p className="col-span-full py-3 text-center text-xs text-[#817a6f]">{fixedRoutes ? "متاحة لاستقبال الضيوف" : "لا يوجد ضيوف"}</p>}
      </div>
    </section>
  )
}

function SimpleEventBar({ event, attendees, activeRound, onProjector, onNextRound }: { event: RoomEvent; attendees: Attendee[]; activeRound: number; onProjector: () => void; onNextRound: () => void }) {
  const checked = attendees.filter(person => person.checked_in).length
  const finalRound = activeRound >= event.round_count
  const readyForNextRound = attendees.length > 0 && checked === attendees.length
  return (
    <section className="bg-[#211f1a] px-4 pb-4 pt-5 text-white sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold text-[#d6b77f]">الفعالية الآن</p>
          <p className="mt-1 text-xl font-extrabold">الجولة {activeRound} من {event.round_count}</p>
          <p className="mt-1 text-xs text-white/55">{event.seating_mode === "fixed_routes" ? `${attendees.length} ضيف بمسار ثابت · ${event.table_count} طاولات متاحة` : `استقبلنا ${checked} من ${attendees.length}`}</p>
        </div>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-2xl font-extrabold text-[#e6c58c]">{activeRound}</div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={onProjector} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white/[0.08] px-3 text-sm font-extrabold text-white transition active:scale-[.98]"><Monitor size={18} /> عرض الجولة</button>
        <button type="button" onClick={onNextRound} disabled={finalRound} className={`flex min-h-12 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-extrabold transition active:scale-[.98] disabled:bg-white/[0.05] disabled:text-white/35 ${readyForNextRound ? "bg-[#e1bd7c] text-[#211f1a]" : "border border-white/10 bg-white/[0.05] text-white/65"}`}><Play size={17} /> {finalRound ? "الجولة الأخيرة" : readyForNextRound ? "الجولة التالية" : "بدء الجولة التالية"}</button>
      </div>
    </section>
  )
}

function ProjectorView({ bundle, attendees, activeRound, clockOffsetMs, stale, onClose }: { bundle: Bundle; attendees: Attendee[]; activeRound: number; clockOffsetMs: number; stale: boolean; onClose: () => void }) {
  const tables = Array.from({ length: bundle.event.table_count }, (_, index) => index + 1)
  const [previewRound, setPreviewRound] = useState<number | null>(null)
  const displayRound = previewRound === null ? activeRound : Math.min(previewRound, bundle.event.round_count)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  const close = async () => {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined)
    onClose()
  }
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (document.fullscreenElement) return
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== "Tab" || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')).filter(element => element.offsetParent !== null)
      if (!focusable.length) {
        event.preventDefault()
        dialogRef.current.focus()
        return
      }
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
    window.addEventListener("keydown", onKeyDown)
    return () => {
      cancelAnimationFrame(focusFrame)
      window.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])
  return (
    <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="room-projector-title" tabIndex={-1} dir="rtl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[120] flex flex-col overflow-hidden bg-[#070706] text-white outline-none">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-[#11100e] px-4 pb-3 pt-[max(.75rem,env(safe-area-inset-top))] sm:px-7 sm:pb-4 sm:pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#d7ba7d] text-xl font-extrabold text-[#17130c]">{displayRound}</div>
          <div><p className="text-xs font-bold text-[#c9a968]">ذا روم · فعالية {bundle.event.event_number}</p><h2 id="room-projector-title" className="text-[clamp(1.25rem,3vw,2rem)] font-extrabold">الجولة {displayRound}</h2></div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => document.documentElement.requestFullscreen?.().catch(() => undefined)} className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 px-3 text-sm font-bold text-stone-300"><Maximize2 size={17} /><span className="hidden sm:inline">ملء الشاشة</span></button>
          <button ref={closeButtonRef} type="button" onClick={close} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 text-stone-300" aria-label="إغلاق شاشة العرض"><X size={19} /></button>
        </div>
      </header>
      {previewRound === null ? <RoomRoundTimer event={bundle.event} clockOffsetMs={clockOffsetMs} stale={stale} projector /> : <div className="flex shrink-0 items-center justify-center gap-3 border-b border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm text-amber-100"><span>استعراض الجولة {displayRound} · الجولة الحالية {activeRound}</span><button type="button" onClick={() => setPreviewRound(null)} className="min-h-11 rounded-xl bg-[#d7ba7d] px-3 font-bold text-[#17130c]">العودة للمباشر</button></div>}
      <main className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(15rem,100%),1fr))] gap-3">
          {tables.map(tableNumber => {
            const people = bundle.seats.filter(seat => seat.round_number === displayRound && seat.table_number === tableNumber)
              .map(seat => attendees.find(person => person.id === seat.attendee_id)).filter(Boolean) as Attendee[]
            return <section key={tableNumber} className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.04]">
              <div className="flex items-center gap-3 border-b border-white/[0.07] p-3 sm:p-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#d7ba7d] text-xl font-extrabold text-[#17130c]">{tableNumber}</div><div><p className="text-lg font-extrabold">الطاولة {tableNumber}</p><p className="text-xs text-stone-400">{bundle.event.seating_mode === "fixed_routes" ? `${people.filter(person => person.gender === "male").length} رجال · ${people.filter(person => person.gender === "female").length} سيدات` : `${people.length} أشخاص`}</p></div></div>
              <div className="grid grid-cols-2 gap-2 p-3">
                {people.map(person => { const style = genderStyle(person.gender); return <div key={person.id} className={`flex min-h-14 items-center justify-center rounded-2xl border px-2 text-[clamp(.9rem,2vw,1.15rem)] font-extrabold ${style.chip}`}><span>{style.label} {guestNumber(person.attendee_number)}</span></div> })}
              </div>
            </section>
          })}
        </div>
      </main>
      <footer className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-white/10 bg-[#11100e] px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-7">
        <button type="button" onClick={() => setPreviewRound(Math.max(1, displayRound - 1))} disabled={displayRound === 1} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 px-4 font-extrabold text-stone-200 disabled:opacity-25"><ChevronRight size={19} /> السابقة</button>
        <p className="hidden text-center text-sm font-bold text-stone-500 sm:block">تصفّح الجولات · لا يغيّر الجولة الحالية</p>
        <button type="button" onClick={() => setPreviewRound(Math.min(bundle.event.round_count, displayRound + 1))} disabled={displayRound === bundle.event.round_count} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#d7ba7d] px-4 font-extrabold text-[#17130c] disabled:opacity-30">التالية <ChevronLeft size={19} /></button>
      </footer>
    </motion.div>
  )
}

function CheckInPanel({ attendees, busy, placementNotice, simple = false, onNext, onAdd, onUndo, onShow }: { attendees: Attendee[]; busy: boolean; placementNotice: PlacementNotice | null; simple?: boolean; onNext: (gender: "female" | "male") => void; onAdd: (gender: "female" | "male") => void; onUndo: (person: Attendee) => void; onShow: (id: string) => void }) {
  const [addGuestOpen, setAddGuestOpen] = useState(false)
  const [allBadgesOpen, setAllBadgesOpen] = useState(false)
  const firstBadges = attendees.slice(0, 20)
  const extraBadges = attendees.slice(20)
  const checkedCount = attendees.filter(person => person.checked_in).length
  const nextWoman = attendees.find(person => person.gender === "female" && !person.checked_in)
  const nextMan = attendees.find(person => person.gender === "male" && !person.checked_in)
  const women = attendees.filter(person => person.gender === "female").length
  const men = attendees.filter(person => person.gender === "male").length
  const balance = balanceInfo(women, men)
  const recent = attendees.filter(person => person.checked_in).sort((left, right) => new Date(right.updated_at || 0).getTime() - new Date(left.updated_at || 0).getTime()).slice(0, 3)
  const progress = attendees.length ? Math.round((checkedCount / attendees.length) * 100) : 0
  const visibleRecent = simple ? recent.slice(0, 1) : recent

  const badgeGrid = (people: Attendee[]) => (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-10">
      {people.map(person => {
        const style = genderStyle(person.gender)
        return person.checked_in ? (
          <button type="button" key={person.id} onClick={() => onShow(person.id)} disabled={busy} className="group relative flex min-h-20 flex-col items-center justify-center rounded-2xl border border-[#b9d1bf] bg-[#eef6f0] text-[#285d3c] disabled:opacity-50" title="عرض البطاقة المسلّمة">
            <CheckCircle2 size={17} />
            <span className="mt-1 text-lg font-extrabold tabular-nums">{guestNumber(person.attendee_number)}</span>
            <span className="text-[10px] font-bold">تم التسليم</span>
            <LockKeyhole size={12} className="absolute left-1.5 top-1.5 opacity-55" />
          </button>
        ) : (
          <div key={person.id} className={`flex min-h-20 flex-col items-center justify-center rounded-2xl border ${person.gender === "female" ? "border-[#ead1d5] bg-[#fbf2f3] text-[#7d414b]" : "border-[#cfdee6] bg-[#f1f6f9] text-[#3e6578]"}`}>
            <span className="text-xl font-extrabold tabular-nums">{guestNumber(person.attendee_number)}</span>
            <span className="mt-1 text-[10px] font-bold opacity-65">متاحة · {style.label}</span>
          </div>
        )
      })}
    </div>
  )

  const arrivalButton = (gender: "female" | "male", person: Attendee | undefined) => {
    const woman = gender === "female"
    return (
      <button type="button" onClick={() => onNext(gender)} disabled={busy || !person} className={`relative min-h-40 overflow-hidden rounded-[1.75rem] border p-4 text-right transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${woman ? "border-[#ead1d5] bg-[#fbf2f3] text-[#6f3842]" : "border-[#cfdee6] bg-[#f1f6f9] text-[#365c70]"}`}>
        <div className={`pointer-events-none absolute -left-7 -top-7 h-24 w-24 rounded-full blur-2xl ${woman ? "bg-[#e9bbc3]/35" : "bg-[#b9d6e5]/40"}`} />
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-extrabold">{woman ? "وصلت سيدة" : "وصل رجل"}</p>
            {person ? <p className="mt-1 text-xs text-[#655e54]">سلّم البطاقة التالية</p> : <p className="mt-1 text-xs text-[#655e54]">تم تسليم الكل</p>}
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/70"><BadgeCheck size={20} /></div>
        </div>
        <div className="mt-5 flex items-end justify-between">
          <span className="rounded-full bg-white/70 px-3 py-1.5 text-[11px] font-extrabold">اضغط للتسليم</span>
          <span className="text-5xl font-extrabold leading-none tabular-nums text-[#211f1a]">{person ? guestNumber(person.attendee_number) : "✓"}</span>
        </div>
      </button>
    )
  }

  return (
    <div className="px-4 pb-5 pt-5 sm:px-6 sm:pb-6">
      <div className="flex items-end justify-between gap-4">
        <div><p className="text-[11px] font-extrabold text-[#9a733e]">الخطوة الحالية</p><h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[#211f1a]">من وصل الآن؟</h2><p className="mt-1 text-sm text-[#777064]">اختَر فقط، والبطاقة بتظهر لحالها.</p></div>
        <strong dir="ltr" className="shrink-0 text-xl font-extrabold tabular-nums text-[#554f45]">{checkedCount} / {attendees.length}</strong>
      </div>
      <div role="progressbar" aria-label="تقدم استقبال الضيوف" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#ece7de]"><motion.div className="h-full rounded-full bg-[#ad8650]" initial={false} animate={{ width: `${progress}%` }} /></div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {arrivalButton("female", nextWoman)}
        {arrivalButton("male", nextMan)}
      </div>
      {balance.preferred && <div className="mt-3 flex items-center gap-2 rounded-2xl bg-[#fbf5e9] px-3 py-2.5 text-xs font-bold text-[#7a5a2d]"><Gauge size={16} className="shrink-0" /> للتوازن الأفضل، يفضّل يكون الشخص الإضافي القادم: {balance.preferred}</div>}

      {visibleRecent.length > 0 && <div className="mt-5 border-t border-[#ece7de] pt-4"><p className="mb-2 text-xs font-extrabold text-[#817a6f]">آخر بطاقة مسلّمة</p><div className="space-y-2">{visibleRecent.map(person => <div key={person.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[#f5f7f3] p-3"><button type="button" onClick={() => onShow(person.id)} className="flex min-w-0 flex-1 items-center gap-3 text-right"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#dcecdf] text-[#356247]"><CheckCircle2 size={17} /></div><div><p className="font-extrabold text-[#29261f]">بطاقة {guestNumber(person.attendee_number)} · {genderStyle(person.gender).label}</p><p className="mt-0.5 flex items-center gap-1 text-[11px] text-[#8a8378]"><Clock3 size={11} /> {checkInTime(person.updated_at)}</p></div></button><button type="button" onClick={() => onUndo(person)} disabled={busy} className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-[#ddd7cd] bg-white px-3 text-xs font-bold text-[#625c52] disabled:opacity-40"><Undo2 size={14} /> تراجع</button></div>)}</div></div>}

      <details open={!simple} className="group mt-4 border-t border-[#ece7de] pt-2">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between rounded-2xl px-2 text-sm font-extrabold text-[#6f685d] [&::-webkit-details-marker]:hidden"><span className="flex items-center gap-2"><UserPlus size={16} /> خيارات الاستقبال</span><ChevronDown size={17} className="transition group-open:rotate-180" /></summary>
        <div className="mt-2 space-y-3 rounded-[1.5rem] bg-[#f7f4ee] p-3">
          {simple && !addGuestOpen ? <button type="button" onClick={() => setAddGuestOpen(true)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-extrabold text-[#575147]"><UserPlus size={16} /> إضافة شخص حضر بدون تسجيل</button> : <section>
            <div className="mb-3 flex items-start justify-between gap-3"><div><p className="font-extrabold text-[#29261f]">إضافة شخص جديد</p><p className="mt-1 text-xs text-[#817a6f]">ينضاف للجدول وتظهر بطاقته مباشرة.</p></div>{simple && <button type="button" onClick={() => setAddGuestOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full border border-[#ddd7cd] bg-white text-[#777064]" aria-label="إلغاء الإضافة"><X size={15} /></button>}</div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => onAdd("female")} disabled={busy} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#ead1d5] bg-[#fbf2f3] px-3 text-sm font-extrabold text-[#6f3842] disabled:opacity-40"><UserPlus size={17} /> سيدة</button>
              <button type="button" onClick={() => onAdd("male")} disabled={busy} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#cfdee6] bg-[#f1f6f9] px-3 text-sm font-extrabold text-[#365c70] disabled:opacity-40"><UserPlus size={17} /> رجل</button>
            </div>
          </section>}

          {placementNotice && <div className="rounded-2xl border border-[#e7d7ba] bg-[#fffaf0] p-3"><div className="flex items-start gap-2"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#9b7238]" /><div><p className="text-sm font-extrabold text-[#4f3c22]">تمت إضافة {genderStyle(placementNotice.gender).label} {guestNumber(placementNotice.attendeeNumber)}</p><p className="mt-1 text-xs text-[#817057]">{placementNotice.tables.map(item => `ج${item.roundNumber}: ط${item.tableNumber}`).join(" · ")}</p></div></div></div>}

          {!allBadgesOpen ? <button type="button" onClick={() => setAllBadgesOpen(true)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-extrabold text-[#575147]"><BadgeCheck size={16} /> عرض حالة كل البطاقات</button> : <section className="rounded-2xl bg-white p-3">
            <div className="mb-3 flex items-center justify-between"><div><p className="font-extrabold text-[#29261f]">حالة البطاقات</p><p className="mt-1 text-[11px] text-[#817a6f]">الأخضر يعني تم التسليم</p></div><button type="button" onClick={() => setAllBadgesOpen(false)} className="min-h-9 px-2 text-xs font-bold text-[#817a6f]">إخفاء</button></div>
            {badgeGrid(firstBadges)}
            {extraBadges.length > 0 && <div className="mt-4"><p className="mb-2 text-xs font-extrabold text-[#817a6f]">البطاقات الإضافية</p>{badgeGrid(extraBadges)}</div>}
          </section>}
        </div>
      </details>
    </div>
  )
}

function FixedRouteCheckInPanel({ bundle, busy, pendingArrival, placementNotice, onAdd, onRetryArrival, onShow }: {
  bundle: Bundle; activeRound: number; busy: boolean; pendingArrival: PendingArrival | null; placementNotice: PlacementNotice | null
  onAdd: (gender: "female" | "male") => void; onRetryArrival: () => void; onShow: (id: string) => void
}) {
  const admittedIds = new Set(bundle.seats.map(seat => seat.attendee_id))
  const admitted = bundle.attendees.filter(person => admittedIds.has(person.id))

  return <div className="px-4 pb-5 pt-5 sm:px-6 sm:pb-6">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-extrabold text-[#9a733e]">استقبال مستمر · من صفر ضيوف</p><h2 className="mt-1 text-2xl font-extrabold text-[#211f1a]">من وصل الآن؟</h2><p className="mt-1 text-sm leading-6 text-[#777064]">نحجز مساره للجولات المتبقية، ثم تظهر بطاقته للتصوير.</p></div><span className="shrink-0 rounded-2xl bg-[#f2eee7] px-3 py-2 text-center"><strong className="block text-xl font-extrabold">{admitted.length}</strong><span className="text-[10px] font-bold text-[#6b6459]">تم تسكينهم</span></span></div>
    <div className="mt-4 grid grid-cols-2 gap-3">
      {(["female", "male"] as const).map(gender => {
        const woman = gender === "female"
        return <button key={gender} type="button" onClick={() => onAdd(gender)} disabled={busy || Boolean(pendingArrival)} className={`min-h-36 rounded-[1.5rem] border p-4 text-right transition active:scale-[.98] disabled:opacity-45 ${woman ? "border-[#ead1d5] bg-[#fbf2f3] text-[#6f3842]" : "border-[#cfdee6] bg-[#f1f6f9] text-[#365c70]"}`}><div className="flex items-center justify-between gap-2"><span className="text-base font-extrabold">{woman ? "وصلت سيدة" : "وصل رجل"}</span><UserPlus size={22} /></div><p className="mt-4 text-sm font-extrabold">إضافة مباشرة</p><p className="mt-1 text-[11px] leading-5 opacity-80">أضف الضيف واحجز مساره دون حدّ تقديري للعدد</p></button>
      })}
    </div>
    {pendingArrival && <div role="status" className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-[#795723]"><p className="text-sm font-extrabold">{busy ? "جارٍ تأكيد الوصول…" : "لم نتأكد من نتيجة آخر وصول"}</p><p className="mt-1 text-xs leading-5">{genderStyle(pendingArrival.gender).label} · إعادة المحاولة تسترجع نفس الطلب دون إضافة ضيف آخر.</p><button type="button" onClick={onRetryArrival} disabled={busy} className="mt-2 min-h-11 rounded-xl bg-[#211f1a] px-4 text-sm font-extrabold text-white disabled:opacity-40"><RefreshCw size={15} className="ml-2 inline" />تحقق وأعد المحاولة</button></div>}
    <p className="mt-3 flex items-start gap-2 rounded-2xl bg-[#f7f3eb] p-3 text-xs leading-5 text-[#6d655a]"><LockKeyhole size={16} className="mt-0.5 shrink-0" /><span>نستقبل كل ضيف. نفضّل أربعة أشخاص وتوازن الرجال والسيدات، ونزيد عدد الجالسين عند الحاجة. نقلّل التكرار قدر الإمكان، وتبقى الطاولات والبطاقات الصادرة ثابتة.</span></p>
    {placementNotice && <div role="status" className="mt-3 rounded-2xl border border-[#b9d1bf] bg-[#eef6f0] p-3 text-[#285d3c]"><p className="text-sm font-extrabold">{genderStyle(placementNotice.gender).label} {guestNumber(placementNotice.attendeeNumber)} · تم حجز المسار</p><p className="mt-1 text-xs leading-5">{placementNotice.tables.map(item => `ج${item.roundNumber}: ط${item.tableNumber}`).join(" · ")}</p>{Boolean(placementNotice.repeatPairCount) && <p className="mt-2 text-xs font-bold">تم تسكين الضيف مع {placementNotice.repeatPairCount} لقاءات متكررة. التكرار مسموح ولا يمنع إصدار البطاقة.</p>}</div>}
    {admitted.length > 0 && <details className="group mt-4 border-t border-[#ece7de] pt-2"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-sm font-extrabold text-[#625b50] [&::-webkit-details-marker]:hidden"><span>البطاقات الصادرة · {admitted.length}</span><ChevronDown size={17} className="transition group-open:rotate-180" /></summary><div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{admitted.map(person => <button type="button" key={person.id} onClick={() => onShow(person.id)} className={`min-h-16 rounded-2xl border px-2 text-sm font-extrabold ${person.gender === "female" ? "border-[#ead1d5] bg-[#fbf2f3] text-[#6f3842]" : "border-[#cfdee6] bg-[#f1f6f9] text-[#365c70]"}`}>{genderStyle(person.gender).label} {guestNumber(person.attendee_number)}</button>)}</div></details>}
  </div>
}

function GuestBadgeFocus({ event, person, journey, activeRound, repeatPairCount = 0, simple = false, onClose, onShare }: { event: RoomEvent; person: Attendee; journey: Seat[]; activeRound: number; repeatPairCount?: number; simple?: boolean; onClose: () => void; onShare: () => void }) {
  const style = genderStyle(person.gender)
  const dialogRef = useRef<HTMLDivElement>(null)
  const badgeRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const doneButtonRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  const [photoMode, setPhotoMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const photoModeRef = useRef(photoMode)

  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => { photoModeRef.current = photoMode }, [photoMode])
  useEffect(() => { if (photoMode) requestAnimationFrame(() => badgeRef.current?.focus()) }, [photoMode])
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const focusFrame = requestAnimationFrame(() => (simple ? doneButtonRef.current : closeButtonRef.current)?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        if (photoModeRef.current) setPhotoMode(false)
        else onCloseRef.current()
        return
      }
      if (event.key !== "Tab" || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(element => element.offsetParent !== null)
      if (!focusable.length) {
        event.preventDefault()
        dialogRef.current.focus()
        return
      }
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
    window.addEventListener("keydown", onKeyDown)
    return () => {
      cancelAnimationFrame(focusFrame)
      window.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [simple])

  const saveImage = async () => {
    if (!badgeRef.current || saving) return
    setSaving(true)
    try {
      const { toPng } = await import("html-to-image")
      const dataUrl = await toPng(badgeRef.current, { cacheBust: true, pixelRatio: 2, backgroundColor: "#0b0b09" })
      const link = document.createElement("a")
      link.download = `the-room-${person.gender === "female" ? "girl" : "boy"}-${guestNumber(person.attendee_number)}.png`
      link.href = dataUrl
      link.click()
      toast.success("تم حفظ البطاقة كصورة")
    } catch {
      toast.error("تعذّر حفظ الصورة على هذا الجهاز")
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="room-badge-title" aria-describedby="room-badge-journey" tabIndex={-1} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} data-room-badge-overlay className={`room-badge-overlay fixed inset-0 z-[140] overflow-y-auto overscroll-contain bg-black/85 backdrop-blur-2xl outline-none ${photoMode ? "room-badge-photo-mode" : ""}`}>
      <div className={`room-badge-shell mx-auto flex min-h-full w-full max-w-[430px] flex-col items-center px-[clamp(.625rem,4vw,1rem)] pb-[max(.75rem,env(safe-area-inset-bottom))] pt-[max(.625rem,env(safe-area-inset-top))] ${photoMode ? "justify-center" : ""}`}>
        {!photoMode && <div className="room-badge-toolbar sticky top-0 z-30 mb-2 flex w-full shrink-0 justify-end py-1">
          <button ref={closeButtonRef} onClick={onClose} aria-label="إغلاق البطاقة" className="flex h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-black/65 px-4 text-sm font-bold text-white shadow-lg backdrop-blur-xl"><X size={17} /><span className="room-badge-close-label">إغلاق</span></button>
        </div>}
        <motion.article ref={badgeRef} role={photoMode ? "button" : undefined} tabIndex={photoMode ? 0 : undefined} onKeyDown={event => { if (!photoMode || !["Enter", " "].includes(event.key)) return; event.preventDefault(); if (simple) onClose(); else setPhotoMode(false) }} onClick={() => { if (!photoMode) return; if (simple) onClose(); else setPhotoMode(false) }} aria-label={photoMode ? "اضغط للرجوع" : undefined} initial={{ y: 18, opacity: 0, scale: 0.97 }} animate={{ y: 0, opacity: 1, scale: 1 }} data-room-badge className={`room-badge-card relative w-full shrink-0 overflow-hidden rounded-[clamp(1.5rem,8vw,2.25rem)] border bg-gradient-to-b p-[clamp(.875rem,4.5vw,1.5rem)] shadow-[0_40px_120px_rgba(0,0,0,.75)] ${photoMode ? "cursor-pointer" : ""} ${style.surface}`}>
          <div className={`pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full blur-[75px] ${style.glow}`} />
          <div className="pointer-events-none absolute inset-[clamp(.5rem,3vw,.75rem)] rounded-[clamp(1.15rem,6vw,1.7rem)] border border-white/[0.07]" />
          <div className="room-badge-header relative flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0"><p id="room-badge-title" className="text-[clamp(1.25rem,6vw,1.5rem)] font-extrabold leading-tight text-white">ذا روم <span className="sr-only">— بطاقة {style.label} {guestNumber(person.attendee_number)}</span></p><p className="room-badge-brand-subtitle mt-1 text-[10px] font-bold tracking-[.12em] text-stone-500">بطاقة مسار الضيف</p></div>
            <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.055] px-[clamp(.6rem,3vw,.75rem)] py-1.5 text-[clamp(.625rem,2.8vw,.6875rem)] font-bold text-stone-300">فعالية {event.event_number}</span>
          </div>
          <div className="room-badge-identity relative mt-[clamp(.75rem,4vh,1.25rem)] text-center">
            <div className={`room-badge-avatar mx-auto flex h-[clamp(2.5rem,12vw,3.5rem)] w-[clamp(2.5rem,12vw,3.5rem)] items-center justify-center rounded-full border border-current bg-white/[0.04] ${style.accent}`}><UserRound className="h-[45%] w-[45%]" /></div>
            <p className={`mt-1.5 text-[clamp(.6875rem,3vw,.75rem)] font-extrabold ${style.accent}`}>{style.label}</p>
            <p className="room-badge-number mt-0.5 break-words text-[clamp(2.25rem,12vw,3rem)] font-extrabold leading-none tracking-tight text-white">{person.gender === "female" ? "سيدة" : "رجل"} {guestNumber(person.attendee_number)}</p>
          </div>
          <div className="room-badge-divider relative my-[clamp(.65rem,3vh,1rem)] h-px bg-gradient-to-l from-transparent via-white/15 to-transparent" />
          <div id="room-badge-journey" className="room-badge-journey relative grid gap-[clamp(.375rem,1.2vh,.5rem)]">
            {journey.map(seat => {
              const active = seat.round_number === activeRound
              return <div key={seat.id} className={`room-badge-round flex items-center justify-between rounded-[clamp(.75rem,4vw,1rem)] border px-[clamp(.75rem,4vw,1rem)] py-[clamp(.4rem,1.4vh,.625rem)] ${active ? "min-h-14 border-[#e5c780]/45 bg-[#d7ba7d]/12" : "min-h-11 border-white/[0.08] bg-white/[0.035]"}`}><div><p className={`text-[clamp(.5625rem,2.6vw,.625rem)] font-bold ${active ? "text-[#e5c780]" : "text-stone-500"}`}>الجولة {seat.round_number}{active ? " · الآن" : ""}</p><p className={`${active ? "text-[clamp(1.05rem,5vw,1.25rem)]" : "text-[clamp(.9375rem,4.5vw,1.125rem)]"} font-extrabold leading-tight text-white`}>الطاولة {seat.table_number}</p></div><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${active ? "bg-[#d7ba7d] text-[#17130c]" : "bg-white/[0.05] text-stone-500"}`}><Table2 size={17} /></div></div>
            })}
          </div>
          <p className="room-badge-guidance relative mt-[clamp(.65rem,2vh,1rem)] px-1 text-center text-[clamp(.6875rem,3vw,.75rem)] leading-5 text-stone-400">{event.seating_mode === "fixed_routes" ? "صوّر بطاقتك؛ مسارك ثابت للجولات الموضحة." : "احتفظ بنفس رقمك، وانتقل إلى طاولتك في كل جولة."}</p>
          {repeatPairCount > 0 && <p className="relative mt-2 text-center text-xs text-amber-200">قد تتكرر بعض اللقاءات في هذا المسار.</p>}
        </motion.article>
        {!photoMode && (simple ? <div className="mt-3 w-full shrink-0">
          <button ref={doneButtonRef} onClick={onClose} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#e1bd7c] px-4 text-base font-extrabold text-[#17130c] shadow-lg shadow-black/20"><CheckCircle2 size={19} /> تم — استقبل التالي</button>
          <p className="mt-2 text-center text-[11px] font-bold text-white/45">اضغط بعد ما تسلّم الضيف بطاقته</p>
        </div> : <div className="mt-2 grid w-full shrink-0 grid-cols-3 gap-2">
          <button onClick={() => { setPhotoMode(true); toast("اضغط على البطاقة للرجوع", { icon: "📷" }) }} className="flex min-h-11 items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.05] px-2 text-[11px] font-extrabold text-white"><Camera size={16} /> تصوير</button>
          <button onClick={saveImage} disabled={saving} className="flex min-h-11 items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.05] px-2 text-[11px] font-extrabold text-white disabled:opacity-40">{saving ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />} حفظ صورة</button>
          <button onClick={onShare} className="flex min-h-11 items-center justify-center gap-1.5 rounded-2xl bg-[#d7ba7d] px-2 text-[11px] font-extrabold text-[#17130c]"><Share2 size={16} /> مشاركة</button>
        </div>)}
      </div>
    </motion.div>
  )
}

function EmergencyTools({ bundle, busy, onClose, onChangeGender, onReturnBadge, onMove, onResetCheckIns }: { bundle: Bundle; busy: boolean; onClose: () => void; onChangeGender: (person: Attendee, gender: "female" | "male") => void; onReturnBadge: (person: Attendee) => void; onMove: (person: Attendee, round: number, table: number) => void; onResetCheckIns: () => void }) {
  const people = bundle.attendees.filter(person => person.included_in_schedule && ["registered", "confirmed"].includes(person.attendance_status))
  const [attendeeId, setAttendeeId] = useState(people[0]?.id || "")
  const [roundNumber, setRoundNumber] = useState(1)
  const [tableNumber, setTableNumber] = useState(1)
  const person = people.find(item => item.id === attendeeId) || people[0]
  const currentTable = bundle.seats.find(seat => seat.attendee_id === person?.id && seat.round_number === roundNumber)?.table_number

  return (
    <section className="mb-5 rounded-[1.75rem] border border-amber-300/15 bg-amber-300/[0.035] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-2 font-extrabold text-white"><UserCog size={19} className="text-amber-200" /> أدوات سريعة</p><p className="mt-1 text-xs leading-5 text-stone-500">استخدمها فقط لو صار خطأ أثناء الاستقبال.</p></div><button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 text-stone-400" aria-label="إغلاق الأدوات"><X size={16} /></button></div>
      <label className="mt-4 block"><span className="mb-2 block text-xs font-bold text-stone-400">اختر الشخص</span><select value={person?.id || ""} onChange={event => setAttendeeId(event.target.value)} className="h-12 w-full rounded-2xl border border-white/10 bg-[#171512] px-4 text-sm font-extrabold text-white outline-none">{people.map(item => <option key={item.id} value={item.id}>{genderStyle(item.gender).label} {guestNumber(item.attendee_number)} {item.checked_in ? "· تم التسليم" : "· بانتظار الحضور"}</option>)}</select></label>
      {person && <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.08] bg-black/15 p-3"><p className="text-xs font-bold text-stone-400">تصحيح النوع أو البطاقة</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => onChangeGender(person, "female")} disabled={busy || person.gender === "female"} className="min-h-11 rounded-xl border border-rose-300/20 bg-rose-300/[0.07] text-sm font-extrabold text-rose-100 disabled:opacity-35">سيدة</button><button type="button" onClick={() => onChangeGender(person, "male")} disabled={busy || person.gender === "male"} className="min-h-11 rounded-xl border border-sky-300/20 bg-sky-300/[0.07] text-sm font-extrabold text-sky-100 disabled:opacity-35">رجل</button></div>{person.checked_in && <button type="button" onClick={() => onReturnBadge(person)} disabled={busy} className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 text-sm font-bold text-stone-300 disabled:opacity-40"><Undo2 size={15} /> رجّع البطاقة</button>}</div>
        <div className="rounded-2xl border border-white/[0.08] bg-black/15 p-3"><p className="text-xs font-bold text-stone-400">نقل داخل جولة</p><div className="mt-3 grid grid-cols-2 gap-2"><select value={roundNumber} onChange={event => setRoundNumber(Number(event.target.value))} className="h-11 rounded-xl border border-white/10 bg-[#171512] px-3 text-sm font-bold text-white">{Array.from({ length: bundle.event.round_count }, (_, index) => index + 1).map(value => <option key={value} value={value}>الجولة {value}</option>)}</select><select value={tableNumber} onChange={event => setTableNumber(Number(event.target.value))} className="h-11 rounded-xl border border-white/10 bg-[#171512] px-3 text-sm font-bold text-white">{Array.from({ length: bundle.event.table_count }, (_, index) => index + 1).map(value => <option key={value} value={value}>الطاولة {value}</option>)}</select></div><button type="button" onClick={() => onMove(person, roundNumber, tableNumber)} disabled={busy || !bundle.schedule || currentTable === tableNumber} className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#d7ba7d]/25 bg-[#d7ba7d]/10 text-sm font-extrabold text-[#efd89e] disabled:opacity-35"><ArrowLeftRight size={15} /> نقل من طاولة {currentTable || "—"}</button></div>
      </div>}
      <div className="mt-4 border-t border-white/[0.07] pt-4"><button type="button" onClick={onResetCheckIns} disabled={busy || !people.some(person => person.checked_in)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] text-sm font-bold text-amber-100 disabled:opacity-35"><RotateCcw size={15} /> رجّع كل البطاقات إلى «متاحة»</button></div>
    </section>
  )
}

export default function TheRoomPage() {
  const [searchParams] = useSearchParams()
  const preview = searchParams.get("preview") === "1"
  const reduceMotion = useReducedMotion()
  const [checking, setChecking] = useState(!preview)
  const [configured, setConfigured] = useState(true)
  const [authenticated, setAuthenticated] = useState(preview)
  const [events, setEvents] = useState<RoomEvent[]>(preview ? [DEMO_BUNDLE.event] : [])
  const [bundle, setBundle] = useState<Bundle | null>(preview ? DEMO_BUNDLE : null)
  const [busy, setBusy] = useState(false)
  const [savingSetup, setSavingSetup] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [switchingEvent, setSwitchingEvent] = useState(false)
  const [creating, setCreating] = useState(false)
  const [round, setRound] = useState(1)
  const [tableRound, setTableRound] = useState(1)
  const [view, setView] = useState<"tables" | "checkin" | "guest">(preview ? "checkin" : "tables")
  const [selectedGuestId, setSelectedGuestId] = useState("")
  const [badgeOpen, setBadgeOpen] = useState(false)
  const [emergencyOpen, setEmergencyOpen] = useState(false)
  const [placementNotice, setPlacementNotice] = useState<PlacementNotice | null>(null)
  const [pendingArrival, setPendingArrival] = useState<PendingArrival | null>(null)
  const [advancedMode, setAdvancedMode] = useState(false)
  const [projectorOpen, setProjectorOpen] = useState(false)
  const [liveSyncFailed, setLiveSyncFailed] = useState(false)
  const [lastLiveSyncAt, setLastLiveSyncAt] = useState<number | null>(preview ? Date.now() : null)
  const [clockOffsetMs, setClockOffsetMs] = useState(0)
  const [draft, setDraft] = useState<SetupValues>({ event_number: 1, minimum_attendees: 0, female_attendees: 0, male_attendees: 0, table_count: 5, round_count: 3 })
  const [draftDirty, setDraftDirty] = useState(false)
  const liveSyncInFlightRef = useRef(false)
  const mutationEpochRef = useRef(0)
  const bundleFingerprintRef = useRef(preview ? bundleFingerprint(DEMO_BUNDLE) : "")
  const activeEventIdRef = useRef(preview ? DEMO_BUNDLE.event.id : "")
  const pendingArrivalRef = useRef<PendingArrival | null>(null)
  const arrivalInFlightRef = useRef(false)
  const previewBundlesRef = useRef(new Map<string, Bundle>([[DEMO_BUNDLE.event.id, DEMO_BUNDLE]]))

  useEffect(() => {
    const eventId = bundle?.event.id
    let pending: PendingArrival | null = null
    if (eventId && !preview) {
      try {
        const stored = JSON.parse(sessionStorage.getItem(`the-room.pending-arrival.${eventId}`) || "null")
        if (stored?.eventId === eventId && typeof stored.requestId === "string" && ["female", "male"].includes(stored.gender)) pending = stored
      } catch { /* A blocked storage provider must not stop reception. */ }
    }
    pendingArrivalRef.current = pending
    setPendingArrival(pending)
  }, [bundle?.event.id, preview])

  const rememberArrival = (pending: PendingArrival | null, eventId: string) => {
    pendingArrivalRef.current = pending
    setPendingArrival(pending)
    try {
      if (pending) sessionStorage.setItem(`the-room.pending-arrival.${eventId}`, JSON.stringify(pending))
      else sessionStorage.removeItem(`the-room.pending-arrival.${eventId}`)
    } catch { /* The in-memory request remains available when storage is blocked. */ }
  }

  const updateDraft = (updater: (current: SetupValues) => SetupValues) => {
    setDraftDirty(true)
    setDraft(updater)
  }

  const installBundle = (next: Bundle) => {
    if (preview) previewBundlesRef.current.set(next.event.id, next)
    const nextWomen = next.attendees.filter(person => person.gender === "female" && person.included_in_schedule).length
    const nextMen = next.attendees.filter(person => person.gender === "male" && person.included_in_schedule).length
    const nextRound = Math.min(next.event.round_count, Math.max(1, Number(next.event.active_round) || 1))
    setBundle(next)
    activeEventIdRef.current = next.event.id
    bundleFingerprintRef.current = bundleFingerprint(next)
    setLastLiveSyncAt(Date.now())
    setClockOffsetMs(next.clock_offset_ms ?? 0)
    setLiveSyncFailed(false)
    setDraft({
      event_number: next.event.event_number,
      minimum_attendees: Math.max(next.event.minimum_attendees, next.attendees.length),
      female_attendees: nextWomen,
      male_attendees: nextMen,
      table_count: next.event.table_count,
      round_count: next.event.round_count,
    })
    setDraftDirty(false)
    setRound(nextRound)
    setTableRound(value => Math.min(value, next.event.round_count))
    setBadgeOpen(false)
    setPlacementNotice(null)
    setView(next.schedule ? "checkin" : "tables")
    setSelectedGuestId(current => next.attendees.some(person => person.id === current) ? current : next.attendees[0]?.id || "")
    setEvents(current => current.some(event => event.id === next.event.id) ? current.map(event => event.id === next.event.id ? next.event : event) : [next.event, ...current])
  }

  const loadEvents = async () => {
    const data = await roomApi("list-events")
    setEvents(data.events || [])
    if (data.events?.[0]) installBundle(await roomApi("get-event", { event_id: data.events[0].id }))
    else setCreating(true)
  }

  useEffect(() => {
    if (preview) return
    roomApi("session").then(data => {
      setConfigured(data.configured !== false)
      setAuthenticated(data.authenticated === true)
      if (data.authenticated) return loadEvents()
    }).catch(() => setConfigured(false)).finally(() => setChecking(false))
  }, [])

  useEffect(() => {
    if (view !== "checkin") return
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }))
  }, [view, reduceMotion])

  const act = async (action: string, payload: Record<string, unknown> = {}) => {
    if (preview) { toast("هذه نسخة للعرض فقط", { icon: "✦" }); return DEMO_BUNDLE }
    mutationEpochRef.current += 1
    setBusy(true)
    try {
      const data = await roomApi(action, payload)
      if (data?.event) installBundle(data)
      return data
    } catch (error: any) {
      if (error.status === 401) { setAuthenticated(false); setBundle(null) }
      toast.error(arabicError(error))
      throw error
    } finally {
      setBusy(false)
    }
  }

  const login = async (key: string) => {
    try { await roomApi("login", { key }); setAuthenticated(true); await loadEvents(); toast.success("أهلًا بك") }
    catch (error: any) { toast.error(arabicError(error)); throw error }
  }

  const refresh = async () => {
    if (!bundle || preview) return
    mutationEpochRef.current += 1
    setRefreshing(true)
    try { installBundle(await roomApi("get-event", { event_id: bundle.event.id })); toast.success("تم تحديث البيانات") }
    catch (error: any) { toast.error(arabicError(error)) }
    finally { setRefreshing(false) }
  }

  const switchEvent = async (eventId: string) => {
    if (!eventId || switchingEvent || busy || refreshing) return
    if (preview && bundle) previewBundlesRef.current.set(bundle.event.id, bundle)
    const previousEventId = activeEventIdRef.current
    const requestEpoch = mutationEpochRef.current + 1
    mutationEpochRef.current = requestEpoch
    activeEventIdRef.current = eventId
    setSwitchingEvent(true)
    try {
      const next = preview ? previewBundlesRef.current.get(eventId) : await roomApi("get-event", { event_id: eventId }) as Bundle
      if (!next) throw new Error("preview-event-not-found")
      if (mutationEpochRef.current !== requestEpoch) return
      installBundle(next)
      setCreating(false)
      setAdvancedMode(true)
      setView(next.schedule ? "tables" : "checkin")
    } catch (error: any) {
      if (error?.status === 401) {
        setAuthenticated(false)
        setBundle(null)
        activeEventIdRef.current = ""
      } else if (activeEventIdRef.current === eventId) {
        activeEventIdRef.current = previousEventId
      }
      toast.error(arabicError(error))
    } finally {
      setSwitchingEvent(false)
    }
  }

  const beginCreate = () => {
    if (preview && bundle) previewBundlesRef.current.set(bundle.event.id, bundle)
    mutationEpochRef.current += 1
    setCreating(true)
    setView("tables")
    setBadgeOpen(false)
    setDraft({ event_number: Math.max(0, ...events.map(item => item.event_number)) + 1, minimum_attendees: 0, female_attendees: 0, male_attendees: 0, table_count: 5, round_count: 3 })
    setDraftDirty(false)
  }

  const cancelCreate = () => {
    if (!bundle) return
    setCreating(false)
    installBundle(bundle)
  }

  const resetEvent = async () => {
    if (!bundle || bundle.event.seating_mode === "fixed_routes" || !window.confirm("متأكد إنك تبغى تمسح توزيع الطاولات؟ الضيوف والإعدادات بتبقى محفوظة.")) return
    try {
      await act("reset-event", { event_id: bundle.event.id })
      setRound(1)
      setTableRound(1)
      setView("tables")
      toast.success("انمسح التوزيع، والضيوف محفوظين")
    } catch {}
  }

  const deleteEvent = async () => {
    if (!bundle || !window.confirm(`متأكد إنك تبغى تحذف فعالية ${bundle.event.event_number}؟ الحذف نهائي ويشمل الضيوف والتوزيع.`)) return
    if (preview) { toast("هذه نسخة للعرض فقط", { icon: "✦" }); return }
    mutationEpochRef.current += 1
    setBusy(true)
    try {
      await roomApi("delete-event", { event_id: bundle.event.id })
      const remaining = events.filter(item => item.id !== bundle.event.id)
      setEvents(remaining)
      setBadgeOpen(false)
      if (remaining[0]) {
        installBundle(await roomApi("get-event", { event_id: remaining[0].id }))
        setCreating(false)
      } else {
        setBundle(null)
        activeEventIdRef.current = ""
        setCreating(true)
        setDraft({ event_number: bundle.event.event_number + 1, minimum_attendees: 0, female_attendees: 0, male_attendees: 0, table_count: 5, round_count: 3 })
        setDraftDirty(false)
      }
      toast.success("انحذفت الفعالية")
    } catch (error: any) {
      toast.error(arabicError(error))
    } finally {
      setBusy(false)
    }
  }

  const attendees = bundle?.attendees || []
  const fixedRoutes = bundle?.event.seating_mode === "fixed_routes"
  const fixedSetup = creating || fixedRoutes
  const routesIssued = fixedRoutes && Boolean(bundle?.seats.length)
  const fixedSettingsLocked = routesIssued || (fixedRoutes && (bundle?.event.active_round || 1) > 1)
  const included = attendees.filter(person => person.included_in_schedule && ["registered", "confirmed"].includes(person.attendance_status))
  const minimumPeople = creating ? 2 : Math.max(2, included.length)
  const draftGuestTotal = creating ? 0 : draft.minimum_attendees
  const validSetup = fixedSetup ? Number.isInteger(draft.table_count) && draft.table_count >= 1 && draft.table_count <= 50 && Number.isInteger(draft.round_count) && draft.round_count >= 1 && draft.round_count <= 20 : draftGuestTotal >= draft.table_count * 2 && draftGuestTotal <= 500
  const dimensionsChanged = Boolean(bundle && (draft.table_count !== bundle.event.table_count || draft.round_count !== bundle.event.round_count))
  const guestsToAdd = fixedSetup ? 0 : Math.max(0, draft.minimum_attendees - included.length)
  const setupChanged = Boolean((creating || !fixedSettingsLocked) && (creating || !bundle?.schedule || dimensionsChanged || guestsToAdd > 0))
  const selectedGuest = attendees.find(person => person.id === selectedGuestId) || attendees[0]
  const journey = selectedGuest && bundle ? bundle.seats.filter(seat => seat.attendee_id === selectedGuest.id).sort((a, b) => a.round_number - b.round_number) : []
  const selectedGuestRepeatCount = fixedRoutes && selectedGuest && bundle ? guestRepeatCount(bundle.seats, selectedGuest.id) : 0
  const activeView = advancedMode ? view : "checkin"
  const scene: "setup" | "live" | "manage" = creating ? "setup" : advancedMode ? "manage" : bundle?.schedule ? "live" : "setup"
  const overlayOpen = badgeOpen || projectorOpen
  const checkedInCount = included.filter(person => person.checked_in).length
  const womenCount = included.filter(person => person.gender === "female").length
  const menCount = included.filter(person => person.gender === "male").length
  const currentRoundTables = bundle?.schedule ? Array.from({ length: bundle.event.table_count }, (_, index) => {
    const members = bundle.seats.filter(seat => seat.round_number === round && seat.table_number === index + 1)
      .map(seat => included.find(person => person.id === seat.attendee_id)).filter(Boolean) as Attendee[]
    return { members, women: members.filter(person => person.gender === "female").length, men: members.filter(person => person.gender === "male").length }
  }) : []
  const idealTableSize = Math.ceil(included.length / Math.max(1, bundle?.event.table_count || 1))
  const imbalancedTableCount = currentRoundTables.filter(table => Math.abs(table.women - (womenCount / Math.max(1, bundle?.event.table_count || 1))) > 1 || Math.abs(table.men - (menCount / Math.max(1, bundle?.event.table_count || 1))) > 1).length
  const crowdedTableCount = currentRoundTables.filter(table => table.members.length > idealTableSize).length

  const syncLiveEvent = async () => {
    if (!bundle || busy || preview || liveSyncInFlightRef.current) return
    const eventId = bundle.event.id
    const requestEpoch = mutationEpochRef.current
    liveSyncInFlightRef.current = true
    try {
      const next = await roomApi("get-event", { event_id: eventId }) as Bundle
      if (mutationEpochRef.current !== requestEpoch) return
      if (activeEventIdRef.current !== eventId) return
      if (next.event.id !== eventId) return
      setClockOffsetMs(next.clock_offset_ms ?? 0)
      const nextFingerprint = bundleFingerprint(next)
      if (nextFingerprint !== bundleFingerprintRef.current) {
        bundleFingerprintRef.current = nextFingerprint
        setBundle(current => current?.event.id === eventId ? next : current)
        setEvents(current => current.map(event => event.id === eventId ? next.event : event))
        setRound(Math.min(next.event.round_count, Math.max(1, Number(next.event.active_round) || 1)))
        setTableRound(value => Math.min(value, next.event.round_count))
        setSelectedGuestId(current => next.attendees.some(person => person.id === current) ? current : next.attendees[0]?.id || "")
        if (!draftDirty) {
          const nextWomen = next.attendees.filter(person => person.gender === "female" && person.included_in_schedule).length
          const nextMen = next.attendees.filter(person => person.gender === "male" && person.included_in_schedule).length
          setDraft({
            event_number: next.event.event_number,
            minimum_attendees: Math.max(next.event.minimum_attendees, next.attendees.length),
            female_attendees: nextWomen,
            male_attendees: nextMen,
            table_count: next.event.table_count,
            round_count: next.event.round_count,
          })
        }
      }
      setLastLiveSyncAt(Date.now())
      setLiveSyncFailed(false)
    } catch (error: any) {
      if (error?.status === 401) {
        setAuthenticated(false)
        setBundle(null)
      } else {
        setLiveSyncFailed(true)
      }
    } finally {
      liveSyncInFlightRef.current = false
    }
  }

  useVisibilityPoll(syncLiveEvent, 5_000, Boolean(authenticated && bundle && !preview && !switchingEvent && !creating && !savingSetup && !refreshing))

  const changeActiveRound = async (nextValue: number) => {
    if (!bundle || busy) return
    const nextRound = Math.min(bundle.event.round_count, Math.max(1, Math.round(nextValue)))
    if (nextRound === round) return
    if (preview) {
      setRound(nextRound)
      setBundle(current => current ? { ...current, event: { ...current.event, active_round: nextRound, timer_ends_at: null, timer_remaining_seconds: current.event.timer_duration_seconds, timer_revision: current.event.timer_revision + 1 } } : current)
      return
    }
    const previousRound = round
    setRound(nextRound)
    try {
      await act("set-active-round", { event_id: bundle.event.id, active_round: nextRound, expected_active_round: previousRound })
    } catch {
      setRound(previousRound)
    }
  }

  const controlTimer = async (command: RoomTimerCommand, durationSeconds?: number) => {
    if (!bundle?.schedule || busy || switchingEvent || savingSetup || refreshing) return
    if (command === "reset" && roomTimerRemaining(bundle.event, Date.now() + clockOffsetMs) > 0
      && !window.confirm("إعادة مؤقت الجولة إلى المدة الكاملة؟")) return
    const eventId = bundle.event.id
    const apply = (next: Bundle) => {
      if (activeEventIdRef.current !== eventId) return
      setBundle(next)
      bundleFingerprintRef.current = bundleFingerprint(next)
      setRound(next.event.active_round)
      setEvents(current => current.map(event => event.id === eventId ? next.event : event))
      setClockOffsetMs(next.clock_offset_ms ?? 0)
      if (!draftDirty) setDraft(current => ({
        ...current,
        minimum_attendees: Math.max(next.event.minimum_attendees, next.attendees.length),
        female_attendees: next.attendees.filter(person => person.included_in_schedule && person.gender === "female").length,
        male_attendees: next.attendees.filter(person => person.included_in_schedule && person.gender === "male").length,
        table_count: next.event.table_count,
        round_count: next.event.round_count,
      }))
      setLastLiveSyncAt(Date.now())
      setLiveSyncFailed(false)
    }
    mutationEpochRef.current += 1
    setBusy(true)
    try {
      if (preview) {
        const event = { ...bundle.event, timer_revision: bundle.event.timer_revision + 1 }
        const remaining = roomTimerRemaining(event)
        if (command === "start") event.timer_ends_at = new Date(Date.now() + remaining * 1000).toISOString()
        if (command === "pause") { event.timer_remaining_seconds = remaining; event.timer_ends_at = null }
        if (command === "reset" || command === "set-duration") {
          event.timer_duration_seconds = durationSeconds ?? event.timer_duration_seconds
          event.timer_remaining_seconds = event.timer_duration_seconds
          event.timer_ends_at = null
        }
        apply({ ...bundle, event })
      } else {
        apply(await roomApi("control-timer", {
          event_id: eventId, command, duration_seconds: durationSeconds,
          expected_active_round: bundle.event.active_round,
          expected_timer_revision: bundle.event.timer_revision,
        }))
      }
    } catch (error: any) {
      if (error.status === 401) { setAuthenticated(false); setBundle(null) }
      toast.error(arabicError(error))
      if (error.code === "EVENT_CHANGED_RETRY") {
        try { apply(await roomApi("get-event", { event_id: eventId })) }
        catch { setLiveSyncFailed(true) }
      } else if (!error.status || error.status >= 500) setLiveSyncFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const advanceRound = () => {
    if (!bundle || round >= bundle.event.round_count) return
    const waiting = included.filter(person => !person.checked_in).length
    const message = waiting > 0
      ? `باقي ${waiting} ما وصلوا. تبدأ الجولة ${round + 1}؟`
      : `تبدأ الجولة ${round + 1}؟`
    if (window.confirm(message)) void changeActiveRound(round + 1)
  }

  const openProjector = () => {
    setProjectorOpen(true)
  }

  const saveAndGenerate = async () => {
    if (!validSetup || !setupChanged || savingSetup) return
    const wasCreating = creating
    let createdEvent = false
    let eventId = creating ? undefined : bundle?.event.id
    setSavingSetup(true)
    try {
      if (creating) {
        const data = preview ? {
          ...DEMO_BUNDLE,
          event: { ...DEMO_BUNDLE.event, id: `demo-${crypto.randomUUID()}`, event_number: draft.event_number, table_count: draft.table_count, round_count: draft.round_count },
          schedule: { ...DEMO_BUNDLE.schedule!, id: `demo-run-${crypto.randomUUID()}`, table_count: draft.table_count, round_count: draft.round_count },
        } : await act("create-event", { event_number: draft.event_number, table_count: draft.table_count, round_count: draft.round_count, seating_mode: "fixed_routes" })
        if (preview) installBundle(data)
        eventId = data?.event?.id
        createdEvent = Boolean(eventId)
        if (data?.schedule) {
          setCreating(false)
          setAdvancedMode(false)
          setTableRound(data.event.active_round)
          setView("checkin")
          toast.success("الاستقبال جاهز من صفر ضيوف")
          return
        }
      } else if (eventId) {
        const data = bundle?.event.seating_mode === "fixed_routes" && preview ? {
          ...bundle,
          event: { ...bundle.event, table_count: draft.table_count, round_count: draft.round_count, route_revision: (bundle.event.route_revision || 0) + 1, timer_ends_at: null, timer_remaining_seconds: bundle.event.timer_duration_seconds, timer_revision: bundle.event.timer_revision + 1 },
          schedule: { ...bundle.schedule!, table_count: draft.table_count, round_count: draft.round_count },
        } : await act("update-event", bundle?.event.seating_mode === "fixed_routes"
          ? { event_id: eventId, table_count: draft.table_count, round_count: draft.round_count, expected_route_revision: bundle.event.route_revision }
          : { ...draft, event_id: eventId })
        if (bundle?.event.seating_mode === "fixed_routes" && preview) installBundle(data)
        if (data?.schedule) {
          // act() already installed the authoritative active round. Extending
          // a live schedule must not rewind this device to round one.
          setTableRound(data.event.active_round)
          setView("checkin")
          toast.success(data.schedule_change === "extended"
            ? `تم تحديث عدد الضيوف إلى ${data.attendees.length}`
            : "تم تجهيز توزيع الجلسات")
          return
        }
      }
      if (eventId) {
        await act("generate-schedule", { event_id: eventId })
        setCreating(false)
        if (wasCreating) setAdvancedMode(false)
        setTableRound(1)
        setView("checkin")
        toast.success("تم تجهيز توزيع الجلسات")
      }
    } catch {
      if (createdEvent) {
        setCreating(false)
        setAdvancedMode(true)
      }
    } finally {
      setSavingSetup(false)
    }
  }

  const showGuest = (id: string) => {
    if (fixedRoutes && !bundle?.seats.some(seat => seat.attendee_id === id)) return
    setSelectedGuestId(id)
    setView("guest")
    setBadgeOpen(true)
  }

  const showBadge = (id: string) => {
    if (fixedRoutes && !bundle?.seats.some(seat => seat.attendee_id === id)) return
    setSelectedGuestId(id)
    setBadgeOpen(true)
  }

  const checkInNext = async (gender: "female" | "male") => {
    if (!bundle) return
    if (preview) {
      const nextPerson = included.find(person => person.gender === gender && !person.checked_in)
      if (!nextPerson) { toast.error("تم تسليم جميع بطاقات هذا القسم"); return }
      installBundle({ ...bundle, attendees: bundle.attendees.map(person => person.id === nextPerson.id ? { ...person, checked_in: true, updated_at: new Date().toISOString() } : person) })
      setSelectedGuestId(nextPerson.id)
      setView("checkin")
      setBadgeOpen(true)
      if (advancedMode) toast.success(`تم تسليم بطاقة ${guestNumber(nextPerson.attendee_number)}`)
      return
    }
    try {
      const data = await act("check-in-next", { event_id: bundle.event.id, gender })
      const checkedInPerson = data.attendees?.find((person: Attendee) => person.attendee_number === data.assigned_attendee_number)
      if (checkedInPerson) setSelectedGuestId(checkedInPerson.id)
      setView("checkin")
      setBadgeOpen(Boolean(checkedInPerson))
      if (advancedMode) toast.success(data.badge_gender_reassigned
        ? `تم تعديل بطاقة متاحة وتسليم ${guestNumber(data.assigned_attendee_number)}`
        : `تم تسليم بطاقة ${guestNumber(data.assigned_attendee_number)}`)
    } catch {}
  }

  const previewFixedPlacement = (person: Attendee) => {
    if (!bundle?.schedule) return null
    const plan = planFixedRoute({
      attendee: person, participants: bundle.attendees, existingSeats: bundle.seats,
      tableCount: bundle.event.table_count, roundCount: bundle.event.round_count, activeRound: bundle.event.active_round,
    })
    const firstSeatId = Math.max(0, ...bundle.seats.map(seat => seat.id)) + 1
    const addedSeats: Seat[] = plan.rows.map((row, index) => ({ ...row, id: firstSeatId + index, event_id: bundle.event.id, schedule_run_id: bundle.schedule!.id }))
    const updatedPerson = { ...person, attendance_status: "confirmed", included_in_schedule: true, checked_in: true, updated_at: new Date().toISOString() }
    const nextAttendees = [...bundle.attendees.filter(item => item.id !== person.id), updatedPerson].sort((left, right) => left.attendee_number - right.attendee_number)
    return {
      ...bundle,
      event: { ...bundle.event, route_revision: (bundle.event.route_revision || 0) + 1 },
      attendees: nextAttendees,
      seats: [...bundle.seats, ...addedSeats],
      schedule: { ...bundle.schedule, participant_count: nextAttendees.filter(item => item.included_in_schedule).length },
      added_attendee_id: person.id,
      added_attendee_number: person.attendee_number,
      added_attendee_gender: person.gender,
      placement_tables: addedSeats.map(seat => ({ roundNumber: seat.round_number, tableNumber: seat.table_number })),
      repeat_pair_count: plan.repeatPairCount,
      waitlisted: false,
    }
  }

  const showFixedPlacement = (data: Bundle & { added_attendee_id: string; added_attendee_number: number; added_attendee_gender?: Gender; placement_tables?: PlacementNotice["tables"]; repeat_pair_count?: number; waitlisted?: boolean }, gender: Gender) => {
    const person = data.attendees.find(item => item.id === data.added_attendee_id)
    const hasRoute = data.seats.some(seat => seat.attendee_id === data.added_attendee_id)
    if (!person || !hasRoute || data.waitlisted) throw new Error("invalid-arrival-response")
    installBundle(data)
    setPlacementNotice({ attendeeNumber: data.added_attendee_number, gender: person.gender || gender, tables: data.placement_tables || [], repeatPairCount: data.repeat_pair_count || 0 })
    if (person) setSelectedGuestId(person.id)
    setView("checkin")
    setBadgeOpen(true)
  }

  const addFixedGuest = async (gender: "female" | "male", retry = false) => {
    if (!bundle?.schedule || !fixedRoutes || busy || refreshing || switchingEvent || savingSetup || arrivalInFlightRef.current) return
    const eventId = bundle.event.id
    const pending = pendingArrivalRef.current?.eventId === eventId ? pendingArrivalRef.current : null
    if (pending && !retry) return
    const request = pending || { eventId, requestId: crypto.randomUUID(), gender }
    arrivalInFlightRef.current = true
    mutationEpochRef.current += 1
    setBusy(true)
    if (!preview) rememberArrival(request, eventId)
    try {
      let data
      if (preview) {
        const attendeeNumber = Math.max(0, ...bundle.attendees.map(person => person.attendee_number)) + 1
        data = previewFixedPlacement({ id: `demo-${crypto.randomUUID()}`, event_id: eventId, attendee_number: attendeeNumber, full_name: `Guest ${attendeeNumber}`, gender: request.gender, attendance_status: "confirmed", included_in_schedule: false, checked_in: true, created_at: new Date().toISOString() })
      } else {
        data = await roomApi("add-attendee", { event_id: eventId, gender: request.gender, request_id: request.requestId })
      }
      if (!data) return
      if (data.event?.id !== eventId || !Array.isArray(data.attendees) || !Array.isArray(data.seats) || !data.attendees.some((person: Attendee) => person.id === data.added_attendee_id)) throw new Error("invalid-arrival-response")
      showFixedPlacement(data, request.gender)
      if (!preview) rememberArrival(null, eventId)
    } catch (error: any) {
      if (error.status === 401) { setAuthenticated(false); setBundle(null) }
      if (!error.status || error.status >= 500) setLiveSyncFailed(true)
      if ((error.status === 400 && error.code !== "REQUEST_ID_CONFLICT") || error.status === 422 || error.code === "EVENT_NOT_OPEN") rememberArrival(null, eventId)
      toast.error(arabicError(error))
    } finally {
      arrivalInFlightRef.current = false
      setBusy(false)
    }
  }

  const addGuest = async (gender: "female" | "male") => {
    if (!bundle?.schedule || busy || arrivalInFlightRef.current) return
    if (fixedRoutes) {
      const priorRequest = pendingArrivalRef.current
      if (priorRequest?.eventId === bundle.event.id) return
      await addFixedGuest(gender)
      return
    }
    if (preview) {
      const attendeeNumber = Math.max(0, ...bundle.attendees.map(person => person.attendee_number)) + 1
      const addedPerson: Attendee = {
        id: `demo-${attendeeNumber}`,
        event_id: bundle.event.id,
        attendee_number: attendeeNumber,
        full_name: `Guest ${attendeeNumber}`,
        gender,
        attendance_status: "confirmed",
        included_in_schedule: true,
        checked_in: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      const addedSeats = previewSeatNewGuest(bundle, addedPerson, round)
      installBundle({ ...bundle, attendees: [...bundle.attendees, addedPerson], seats: [...bundle.seats, ...addedSeats] })
      setPlacementNotice({ attendeeNumber, gender, tables: addedSeats.map(seat => ({ roundNumber: seat.round_number, tableNumber: seat.table_number })) })
      setSelectedGuestId(addedPerson.id)
      setView("checkin")
      setBadgeOpen(true)
      if (advancedMode) toast.success(`تمت إضافة ${gender === "female" ? "سيدة" : "رجل"} ${guestNumber(attendeeNumber)}`)
      return
    }
    try {
      const data = await act("add-attendee", { event_id: bundle.event.id, gender })
      const addedPerson = data.attendees?.find((person: Attendee) => person.id === data.added_attendee_id)
      if (addedPerson) setSelectedGuestId(addedPerson.id)
      setPlacementNotice({ attendeeNumber: data.added_attendee_number, gender, tables: data.placement_tables || [] })
      setView("checkin")
      setBadgeOpen(Boolean(addedPerson))
      if (advancedMode) toast.success(`تمت إضافة ${gender === "female" ? "سيدة" : "رجل"} ${guestNumber(data.added_attendee_number)}`)
    } catch {}
  }

  const undoCheckIn = async (person: Attendee) => {
    if (!bundle || fixedRoutes || !window.confirm(`إعادة البطاقة ${guestNumber(person.attendee_number)} إلى حالة «متاحة»؟`)) return
    if (preview) {
      installBundle({ ...bundle, attendees: bundle.attendees.map(item => item.id === person.id ? { ...item, checked_in: false, updated_at: new Date().toISOString() } : item) })
      setView("checkin")
      toast.success(`أصبحت البطاقة ${guestNumber(person.attendee_number)} متاحة`)
      return
    }
    try {
      await act("set-attendee-check-in", { event_id: bundle.event.id, attendee_id: person.id, checked_in: false })
      setView("checkin")
      toast.success(`أصبحت البطاقة ${guestNumber(person.attendee_number)} متاحة`)
    } catch {}
  }

  const shareGuest = async () => {
    if (!selectedGuest || !bundle) return
    const text = `ذا روم — ${selectedGuest.gender === "female" ? "سيدة" : "رجل"} ${guestNumber(selectedGuest.attendee_number)}\n${journey.map(seat => `الجولة ${seat.round_number}: الطاولة ${seat.table_number}`).join("\n")}`
    try {
      if (navigator.share) await navigator.share({ title: "مسار الضيف في ذا روم", text })
      else { await navigator.clipboard.writeText(text); toast.success("تم نسخ مسار الضيف") }
    } catch (error: any) {
      if (error?.name !== "AbortError") toast.error("تعذّرت المشاركة")
    }
  }

  const changeGuestGender = async (person: Attendee, gender: "female" | "male") => {
    if (!bundle || fixedRoutes || person.gender === gender) return
    if (preview) {
      installBundle({ ...bundle, attendees: bundle.attendees.map(item => item.id === person.id ? { ...item, gender, updated_at: new Date().toISOString() } : item) })
      setEmergencyOpen(true)
      toast.success(`تم تصحيح بطاقة ${guestNumber(person.attendee_number)}`)
      return
    }
    try {
      await act("set-attendee-gender", { event_id: bundle.event.id, attendee_id: person.id, gender })
      setEmergencyOpen(true)
      toast.success(`تم تصحيح بطاقة ${guestNumber(person.attendee_number)}`)
    } catch {}
  }

  const resetCheckIns = async () => {
    if (!bundle || fixedRoutes || !window.confirm("ترجّع كل البطاقات إلى «متاحة» وتبدأ الاستقبال من جديد؟")) return
    if (preview) {
      installBundle({ ...bundle, attendees: bundle.attendees.map(person => ({ ...person, checked_in: false, updated_at: new Date().toISOString() })) })
      setEmergencyOpen(true)
      toast.success("رجعت كل البطاقات إلى متاحة")
      return
    }
    try {
      await act("reset-check-ins", { event_id: bundle.event.id })
      setEmergencyOpen(true)
      toast.success("رجعت كل البطاقات إلى متاحة")
    } catch {}
  }

  const moveGuest = async (person: Attendee, roundNumber: number, tableNumber: number) => {
    if (!bundle?.schedule || fixedRoutes) return
    if (preview) {
      const currentSeat = bundle.seats.find(seat => seat.attendee_id === person.id && seat.round_number === roundNumber)
      if (!currentSeat || currentSeat.table_number === tableNumber) return
      const nextSeat = Math.max(0, ...bundle.seats.filter(seat => seat.round_number === roundNumber && seat.table_number === tableNumber).map(seat => seat.seat_number)) + 1
      installBundle({ ...bundle, seats: bundle.seats.map(seat => seat.id === currentSeat.id ? { ...seat, table_number: tableNumber, seat_number: nextSeat } : seat) })
      setEmergencyOpen(true)
      toast.success(`انتقلت بطاقة ${guestNumber(person.attendee_number)} إلى الطاولة ${tableNumber}`)
      return
    }
    const sendMove = async (force: boolean) => roomApi("move-attendee", { event_id: bundle.event.id, attendee_id: person.id, round_number: roundNumber, table_number: tableNumber, force })
    mutationEpochRef.current += 1
    setBusy(true)
    try {
      let data
      try {
        data = await sendMove(false)
      } catch (error: any) {
        if (error.code !== "MOVE_REPEATS_MEETING") throw error
        const numbers = error.details?.repeated_attendee_numbers?.map((value: number) => guestNumber(value)).join("، ") || "شخص سابق"
        if (!window.confirm(`هذا النقل يخلي البطاقة ${guestNumber(person.attendee_number)} تقابل ${numbers} مرة ثانية. تنقلها رغم ذلك؟`)) return
        data = await sendMove(true)
      }
      installBundle(data)
      setEmergencyOpen(true)
      toast.success(`انتقلت بطاقة ${guestNumber(person.attendee_number)} إلى الطاولة ${tableNumber}`)
    } catch (error: any) {
      if (error.status === 401) setAuthenticated(false)
      toast.error(arabicError(error))
    } finally {
      setBusy(false)
    }
  }

  if (!authenticated) return <><Toaster position="top-center" /><LoginScreen onLogin={login} checking={checking} configured={configured} /></>
  if (checking) return <main className="flex min-h-[100dvh] items-center justify-center bg-[#f3f0e9] text-[#9a733e]"><Loader2 className="animate-spin" size={28} /></main>

  return (
    <main dir="rtl" className="the-room-page relative min-h-[100dvh] overflow-x-hidden bg-[#f3f0e9] font-['Tajawal'] text-[#211f1a]" style={{ backgroundImage: "radial-gradient(circle at 8% 2%, rgba(184,143,85,.14), transparent 25%), radial-gradient(circle at 94% 82%, rgba(102,126,107,.1), transparent 24%)" }}>
      <Toaster position="top-center" toastOptions={{ style: { direction: "rtl", fontFamily: "Tajawal", background: "#211f1a", color: "#fff", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16 } }} />
      <AnimatePresence>{projectorOpen && bundle?.schedule && <ProjectorView key={bundle.event.id} bundle={bundle} attendees={included} activeRound={round} clockOffsetMs={clockOffsetMs} stale={liveSyncFailed} onClose={() => setProjectorOpen(false)} />}</AnimatePresence>
      <AnimatePresence>{badgeOpen && bundle && selectedGuest && (!fixedRoutes || journey.length > 0) && <GuestBadgeFocus event={bundle.event} person={selectedGuest} journey={journey} activeRound={round} repeatPairCount={selectedGuestRepeatCount} simple={!advancedMode} onClose={() => setBadgeOpen(false)} onShare={shareGuest} />}</AnimatePresence>

      <header inert={overlayOpen ? true : undefined} aria-hidden={overlayOpen ? true : undefined} data-room-chrome className="sticky top-0 z-30 border-b border-[#ded8ce]/80 bg-[#f3f0e9]/90 px-4 pb-3 pt-[max(.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <motion.div layoutId="room-mark" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#211f1a] text-[#e6c58c] shadow-sm"><DoorOpen size={20} /></motion.div>
            <div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-base font-extrabold">ذا روم</p>{preview && <span className="rounded-full bg-[#e9e0f5] px-2 py-0.5 text-[9px] font-extrabold text-[#694f85]">عرض</span>}</div><p className="truncate text-[11px] font-bold text-[#817a6f]">{creating ? `تجهيز فعالية ${draft.event_number}` : bundle ? `فعالية ${bundle.event.event_number}` : "تجهيز أول فعالية"}</p></div>
          </div>
          {creating && bundle ? <button onClick={cancelCreate} disabled={busy || savingSetup} className="flex min-h-11 shrink-0 items-center gap-2 rounded-2xl border border-[#ddd7cd] bg-white/70 px-3 text-xs font-extrabold text-[#5f594f] disabled:opacity-35"><ArrowRight size={16} /> إلغاء</button> : bundle ? <button onClick={() => { setAdvancedMode(value => !value); setView(advancedMode ? "checkin" : "tables"); setEmergencyOpen(false) }} aria-pressed={advancedMode} className={`flex min-h-11 shrink-0 items-center gap-2 rounded-2xl px-3 text-xs font-extrabold transition ${advancedMode ? "bg-[#211f1a] text-white" : "border border-[#ddd7cd] bg-white/70 text-[#5f594f]"}`}>{advancedMode ? <ArrowRight size={16} /> : <Settings2 size={16} />} {advancedMode ? "رجوع" : "إدارة"}</button> : null}
        </div>
      </header>

      <div inert={overlayOpen ? true : undefined} aria-hidden={overlayOpen ? true : undefined} className={`relative mx-auto w-full max-w-4xl px-4 pt-5 sm:px-6 sm:pt-8 ${scene === "setup" ? "pb-28" : "pb-8"}`}>
        <AnimatePresence mode="wait" initial={false}>
          {scene === "setup" ? <motion.section key="setup" initial={{ opacity: 0, x: reduceMotion ? 0 : 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduceMotion ? 0 : -12 }} transition={{ duration: reduceMotion ? 0 : .24 }} className="mx-auto max-w-xl">
            <div className="mb-5 px-1 text-center sm:mb-7">
              <motion.div layoutId="room-stage-orb" className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#e6dbc7] text-[#835f2f]"><Sparkles size={20} /></motion.div>
              <p className="mt-4 text-[11px] font-extrabold text-[#9a733e]">خطوة واحدة قبل الاستقبال</p>
              <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">خلّنا نجهّز الفعالية</h1>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#777064]">{fixedSetup ? "ابدأ بصفر ضيوف. حدّد الطاولات الموجودة والجولات، وأضف الضيوف وقت وصولهم." : "حدّد الأعداد بهدوء. الباقي نرتّبه لك تلقائيًا."}</p>
            </div>
            <section data-room-setup className="rounded-[2rem] border border-[#e3ddd3] bg-white/95 p-4 shadow-[0_24px_80px_rgba(61,50,34,.08)] sm:p-6">
              {creating && advancedMode && <label htmlFor="room-event-number" className="mb-2 flex min-h-[4.5rem] items-center justify-between gap-4 border-b border-[#ebe6dd] px-1 py-3"><span><span className="block text-[15px] font-extrabold text-[#29261f]">رقم الفعالية</span><span className="mt-0.5 block text-xs text-[#6f685d]">للتنظيم الداخلي</span></span><input id="room-event-number" type="number" min={1} value={draft.event_number} onChange={event => updateDraft(current => ({ ...current, event_number: Math.max(1, Number(event.target.value) || 1) }))} className="h-11 w-24 rounded-xl border border-[#ded7cc] bg-[#f8f6f1] px-3 text-center text-lg font-extrabold text-[#211f1a] outline-none" /></label>}
              <div className="divide-y divide-[#ebe6dd]">
                {!fixedSetup && <Counter label="عدد الأشخاص" hint="العدد المتوقع في الفعالية" value={draft.minimum_attendees} onChange={value => updateDraft(current => ({ ...current, minimum_attendees: value }))} min={minimumPeople} max={500} />}
                <Counter label="عدد الطاولات" hint={fixedSetup ? "الطاولات الموجودة فعليًا · تبقى أرقامها ثابتة" : undefined} value={draft.table_count} onChange={value => updateDraft(current => ({ ...current, table_count: value }))} min={1} max={50} />
                <Counter label="عدد الجولات" value={draft.round_count} onChange={value => updateDraft(current => ({ ...current, round_count: value }))} min={1} max={20} />
              </div>
              <div className="mt-4 rounded-[1.5rem] bg-[#f7f3eb] p-4">
                {fixedSetup ? <><p className="text-center text-sm font-bold leading-6 text-[#6d655a]">صفر ضيوف مسجّلين · <strong className="text-[#211f1a]">{draft.table_count} طاولات ثابتة</strong> · دون حدّ تقديري للضيوف</p><p className="mt-2 text-center text-xs leading-6 text-[#777064]">نفضّل أربعة أشخاص وتوازن الرجال والسيدات، ونزيد عدد الجالسين عند الحاجة · الجولة {DEFAULT_ROOM_ROUND_SECONDS / 60} دقيقة افتراضيًا.<br />كل ضيف يحصل على مسار ثابت عند وصوله دون قائمة انتظار.</p></> : <p className="text-center text-sm font-bold leading-6 text-[#6d655a]"><strong className="text-[#211f1a]">{draftGuestTotal}</strong> ضيف · قرابة <strong className="text-[#211f1a]">{Math.floor(draftGuestTotal / Math.max(1, draft.table_count))}–{Math.ceil(draftGuestTotal / Math.max(1, draft.table_count))}</strong> لكل طاولة · <strong className="text-[#211f1a]">{draft.round_count}</strong> جولات</p>}
              </div>
              {!validSetup && <p className="mt-3 rounded-xl bg-[#fff4dc] px-3 py-2 text-center text-xs font-bold text-[#805d27]">{fixedSetup ? "اختر من 1 إلى 50 طاولة ومن 1 إلى 20 جولة." : "كل طاولة تحتاج ضيفين على الأقل."}</p>}
            </section>
          </motion.section> : scene === "live" && bundle?.schedule ? <motion.section key="live" initial={{ opacity: 0, x: reduceMotion ? 0 : 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduceMotion ? 0 : -12 }} transition={{ duration: reduceMotion ? 0 : .24 }} className="mx-auto max-w-xl">
            <motion.div layoutId="room-workspace" className="overflow-hidden rounded-[2.15rem] border border-[#dfd9cf] bg-white shadow-[0_25px_90px_rgba(61,50,34,.1)]">
              <SimpleEventBar event={bundle.event} attendees={included} activeRound={round} onProjector={openProjector} onNextRound={advanceRound} />
              <div className="bg-[#211f1a] px-3 pb-3 sm:px-5"><RoomRoundTimer event={bundle.event} clockOffsetMs={clockOffsetMs} disabled={busy || switchingEvent || savingSetup || refreshing} stale={liveSyncFailed} onCommand={controlTimer} /></div>
              {fixedRoutes ? <FixedRouteCheckInPanel bundle={bundle} activeRound={round} busy={busy || refreshing || switchingEvent || savingSetup} pendingArrival={pendingArrival?.eventId === bundle.event.id ? pendingArrival : null} placementNotice={placementNotice} onAdd={addGuest} onRetryArrival={() => { if (pendingArrival) void addFixedGuest(pendingArrival.gender, true) }} onShow={showBadge} /> : <CheckInPanel attendees={included} busy={busy} placementNotice={placementNotice} simple onNext={checkInNext} onAdd={addGuest} onUndo={undoCheckIn} onShow={showBadge} />}
            </motion.div>
          </motion.section> : bundle ? <motion.section key="manage" initial={{ opacity: 0, x: reduceMotion ? 0 : -18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduceMotion ? 0 : 12 }} transition={{ duration: reduceMotion ? 0 : .24 }}>
            <div data-room-chrome className="mb-5 px-1"><p className="text-[11px] font-extrabold text-[#9a733e]">بعيدًا عن شاشة الاستقبال</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight">إدارة الفعالية</h1><p className="mt-1 text-sm text-[#777064]">المراجعة والتصحيح هنا فقط. ارجع للاستقبال وقت ما تخلص.</p></div>

            <section data-room-chrome className="rounded-[1.75rem] border border-[#e1dbd1] bg-white/90 p-3 shadow-sm sm:p-4">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <div className="relative"><select value={bundle.event.id} onChange={event => void switchEvent(event.target.value)} disabled={switchingEvent || busy || refreshing} className="h-12 w-full appearance-none rounded-2xl border border-[#ded8ce] bg-[#f8f6f1] px-4 pl-10 text-sm font-extrabold text-[#29261f] outline-none disabled:opacity-45"><option value="" disabled>اختر فعالية</option>{events.map(item => <option key={item.id} value={item.id}>فعالية {item.event_number}</option>)}</select>{switchingEvent ? <Loader2 size={16} className="pointer-events-none absolute left-4 top-4 animate-spin text-[#817a6f]" /> : <ChevronDown size={16} className="pointer-events-none absolute left-4 top-4 text-[#817a6f]" />}</div>
                <button onClick={beginCreate} disabled={switchingEvent || busy} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#ded8ce] bg-white px-4 text-sm font-extrabold text-[#5f594f] disabled:opacity-35"><CalendarPlus size={17} /> فعالية جديدة</button>
                <button onClick={refresh} disabled={refreshing || switchingEvent || busy || preview} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#ded8ce] bg-white px-4 text-sm font-extrabold text-[#5f594f] disabled:opacity-35"><RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> تحديث</button>
              </div>
              {bundle.schedule && <div className="mt-3 grid grid-cols-3 rounded-2xl bg-[#f2eee7] p-1" aria-label="أقسام إدارة الفعالية">
                <button aria-pressed={view === "tables"} onClick={() => { setTableRound(round); setView("tables") }} className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-extrabold transition ${view === "tables" ? "bg-[#211f1a] text-white shadow-sm" : "text-[#746d62]"}`}><UsersRound size={16} /> الطاولات</button>
                <button aria-pressed={view === "checkin"} onClick={() => setView("checkin")} className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-extrabold transition ${view === "checkin" ? "bg-[#211f1a] text-white shadow-sm" : "text-[#746d62]"}`}><BadgeCheck size={16} /> الحضور</button>
                <button aria-pressed={view === "guest"} onClick={() => setView("guest")} className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-extrabold transition ${view === "guest" ? "bg-[#211f1a] text-white shadow-sm" : "text-[#746d62]"}`}><Share2 size={16} /> البطاقات</button>
              </div>}
            </section>

            {bundle.schedule && <div className="mt-4" data-room-chrome><RoomRoundTimer event={bundle.event} clockOffsetMs={clockOffsetMs} disabled={busy || switchingEvent || savingSetup || refreshing} stale={liveSyncFailed} onCommand={controlTimer} /></div>}
            {bundle.schedule ? <section data-room-results className="mt-4 rounded-[2rem] border border-[#e1dbd1] bg-white/95 p-4 shadow-[0_20px_70px_rgba(61,50,34,.06)] sm:p-5">
              {activeView === "tables" ? <div>
                <div className="flex items-center justify-between gap-3"><div><p className="font-extrabold">توزيع الطاولات</p><p className="mt-1 text-xs text-[#817a6f]">للمراجعة فقط · الجولة الحالية تبقى {round}</p></div><button onClick={() => window.print()} className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[#ded8ce] px-4 text-sm font-extrabold text-[#5f594f]"><Printer size={16} /> طباعة</button></div>
                <div className="mt-4 flex gap-2 overflow-x-auto pb-2">{Array.from({ length: bundle.event.round_count }, (_, index) => index + 1).map(value => <button key={value} onClick={() => setTableRound(value)} className={`min-h-11 min-w-28 rounded-2xl border px-4 text-sm font-extrabold ${tableRound === value ? "border-[#211f1a] bg-[#211f1a] text-white" : "border-[#ded8ce] bg-white text-[#6f685d]"}`}>الجولة {value}</button>)}</div>
                {fixedRoutes && <p className="mt-3 rounded-xl bg-[#f7f3eb] px-3 py-2 text-xs leading-5 text-[#6d655a]">أرقام الطاولات والمسارات الصادرة ثابتة. استقبال ضيف جديد لا يغيّر بطاقات الآخرين.</p>}
                <AnimatePresence mode="wait"><motion.div key={tableRound} initial={{ opacity: 0, x: reduceMotion ? 0 : -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="the-room-schedule-grid mt-3 grid gap-3 lg:grid-cols-2">{Array.from({ length: bundle.event.table_count }, (_, index) => index + 1).map(tableNumber => <TableCard key={tableNumber} tableNumber={tableNumber} fixedRoutes={fixedRoutes} seats={bundle.seats.filter(seat => seat.round_number === tableRound && seat.table_number === tableNumber)} attendees={attendees} onGuest={showGuest} />)}</motion.div></AnimatePresence>
              </div> : activeView === "checkin" ? <div>
                <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[{ label: fixedRoutes ? "تم تسكينهم" : "حضروا", value: checkedInCount }, { label: fixedRoutes ? "الطاولات" : "بانتظارهم", value: fixedRoutes ? bundle.event.table_count : included.length - checkedInCount }, { label: "سيدات", value: womenCount }, { label: "رجال", value: menCount }].map(item => <div key={item.label} className="rounded-2xl bg-[#f5f1ea] p-3 text-center"><p className="text-2xl font-extrabold">{item.value}</p><p className="mt-1 text-[11px] font-bold text-[#6b6459]">{item.label}</p></div>)}
                </div>
                {!fixedRoutes && <div className="mb-3 flex flex-wrap gap-2 text-xs font-bold"><span className={`rounded-full px-3 py-2 ${imbalancedTableCount ? "bg-[#fff4dc] text-[#805d27]" : "bg-[#eef6f0] text-[#356247]"}`}>{imbalancedTableCount ? `${imbalancedTableCount} طاولات تحتاج موازنة` : "الطاولات متوازنة"}</span><span className={`rounded-full px-3 py-2 ${crowdedTableCount ? "bg-[#fff4dc] text-[#805d27]" : "bg-[#f2eee7] text-[#655e54]"}`}>{crowdedTableCount ? `${crowdedTableCount} طاولات مزدحمة` : "لا توجد طاولات مزدحمة"}</span></div>}
                <div className="overflow-hidden rounded-[1.75rem] border border-[#e6e0d7]">{fixedRoutes ? <FixedRouteCheckInPanel bundle={bundle} activeRound={round} busy={busy || refreshing || switchingEvent || savingSetup} pendingArrival={pendingArrival?.eventId === bundle.event.id ? pendingArrival : null} placementNotice={placementNotice} onAdd={addGuest} onRetryArrival={() => { if (pendingArrival) void addFixedGuest(pendingArrival.gender, true) }} onShow={showBadge} /> : <CheckInPanel attendees={included} busy={busy} placementNotice={placementNotice} onNext={checkInNext} onAdd={addGuest} onUndo={undoCheckIn} onShow={showBadge} />}</div>
              </div> : <div>
                <div className="mb-4"><p className="font-extrabold">كل البطاقات</p><p className="mt-1 text-xs text-[#817a6f]">اختر أي بطاقة للمراجعة أو المشاركة.</p></div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">{attendees.filter(person => bundle.seats.some(seat => seat.attendee_id === person.id)).map(person => { const woman = person.gender === "female"; return <button key={person.id} onClick={() => { setSelectedGuestId(person.id); setBadgeOpen(true) }} className={`flex min-h-20 flex-col items-center justify-center rounded-2xl border font-extrabold transition ${woman ? "border-[#ead1d5] bg-[#fbf2f3] text-[#6f3842]" : "border-[#cfdee6] bg-[#f1f6f9] text-[#365c70]"}`}><span className="text-lg">بطاقة {guestNumber(person.attendee_number)}</span><span className="mt-1 text-[10px] opacity-60">{genderStyle(person.gender).label}</span></button> })}</div>
              </div>}
            </section> : <section data-room-chrome className="mt-4 rounded-[2rem] border border-[#e1dbd1] bg-white/95 p-5 text-center shadow-sm sm:p-7">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#f0e8da] text-[#8b6736]"><WandSparkles size={20} /></div>
              <h2 className="mt-4 text-xl font-extrabold">هذه الفعالية تحتاج توزيعًا</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6f685d]">تقدر تبدّل الفعالية أو تحذفها من هنا، أو ترجع للإعداد وتجهّز التوزيع.</p>
              <button onClick={() => setAdvancedMode(false)} className="mt-4 min-h-12 rounded-2xl bg-[#211f1a] px-6 font-extrabold text-white"><ArrowRight size={17} className="ml-2 inline" /> رجوع للإعداد</button>
            </section>}

            <div data-room-chrome className="mt-4 grid gap-3 lg:grid-cols-2">
              <details className="group rounded-[1.75rem] border border-[#e1dbd1] bg-white/90 p-3">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between rounded-2xl px-2 font-extrabold [&::-webkit-details-marker]:hidden"><span className="flex items-center gap-2"><Settings2 size={17} /> {fixedRoutes ? "الطاولات والجولات" : "تعديل الأعداد والجولات"}</span><ChevronDown size={17} className="transition group-open:rotate-180" /></summary>
                <div data-room-setup className="mt-2 border-t border-[#ebe6dd] px-1 pt-2">
                  {fixedRoutes && <p className="mb-2 rounded-xl bg-[#f7f3eb] p-3 text-xs leading-6 text-[#6d655a]">{fixedSettingsLocked ? "الطاولات والجولات مقفلة بعد إصدار البطاقات أو الانتقال للجولة التالية، لحماية المسارات والصور المسلّمة." : "يمكن تعديل الطاولات والجولات قبل أول بطاقة أو الانتقال للجولة التالية. أضف الضيوف من شاشة الاستقبال فقط."}</p>}
                  <fieldset disabled={fixedSettingsLocked || busy || savingSetup} className="min-w-0 disabled:opacity-50">
                  {!fixedRoutes && <Counter label="عدد الأشخاص" hint="يمكنك إضافة أشخاص فقط" value={draft.minimum_attendees} onChange={value => updateDraft(current => ({ ...current, minimum_attendees: value }))} min={minimumPeople} max={500} />}
                  <Counter label="عدد الطاولات" value={draft.table_count} onChange={value => updateDraft(current => ({ ...current, table_count: value }))} min={1} max={50} />
                  <Counter label="عدد الجولات" value={draft.round_count} onChange={value => updateDraft(current => ({ ...current, round_count: value }))} min={1} max={20} />
                  <button onClick={saveAndGenerate} disabled={busy || savingSetup || !validSetup || !setupChanged} className="mt-3 flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#211f1a] px-5 font-extrabold text-white disabled:opacity-35">{savingSetup ? <Loader2 className="animate-spin" size={17} /> : fixedSettingsLocked ? <LockKeyhole size={17} /> : <WandSparkles size={17} />} {fixedSettingsLocked ? "الإعدادات مقفلة" : fixedRoutes ? dimensionsChanged ? "احفظ الإعدادات" : "لا توجد تغييرات" : !bundle.schedule ? "جهّز التوزيع" : dimensionsChanged ? "طبّق وأعد التوزيع" : guestsToAdd > 0 ? `أضف ${guestsToAdd} أشخاص` : "لا توجد تغييرات"}</button>
                  </fieldset>
                  {!validSetup && <p className="mt-2 text-center text-xs font-bold text-[#805d27]">{fixedRoutes ? "اختر عددًا صحيحًا للطاولات والجولات." : "كل طاولة تحتاج ضيفين على الأقل."}</p>}
                </div>
              </details>

              <details className="group rounded-[1.75rem] border border-[#e1dbd1] bg-white/90 p-3">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between rounded-2xl px-2 font-extrabold [&::-webkit-details-marker]:hidden"><span className="flex items-center gap-2"><SlidersHorizontal size={17} /> التصحيح والإجراءات</span><ChevronDown size={17} className="transition group-open:rotate-180" /></summary>
                <div className="mt-2 grid gap-2 border-t border-[#ebe6dd] pt-3">
                  {fixedRoutes ? <p className="rounded-2xl bg-[#f7f3eb] p-3 text-xs leading-6 text-[#6d655a]">لا يمكن نقل الضيوف أو إرجاع بطاقاتهم أو تغيير النوع أو مسح المسارات في هذا النظام، حتى تبقى الصور صالحة.</p> : <><button onClick={() => setEmergencyOpen(value => !value)} disabled={busy} className="flex min-h-12 items-center gap-3 rounded-2xl bg-[#f5f1ea] px-4 text-sm font-extrabold text-[#4e493f] disabled:opacity-35"><UserCog size={17} /> تصحيح أو نقل شخص</button>
                  <button onClick={resetEvent} disabled={!bundle.schedule || busy} className="flex min-h-12 items-center gap-3 rounded-2xl bg-[#fff6e7] px-4 text-sm font-extrabold text-[#7b5928] disabled:opacity-35"><RotateCcw size={17} /> مسح توزيع الطاولات</button></>}
                  <button onClick={deleteEvent} disabled={busy} className="flex min-h-12 items-center gap-3 rounded-2xl bg-[#fff0ef] px-4 text-sm font-extrabold text-[#8a403b] disabled:opacity-35"><Trash2 size={17} /> حذف الفعالية</button>
                </div>
              </details>
            </div>

            {emergencyOpen && !fixedRoutes && <div data-room-chrome className="mt-4 rounded-[1.75rem] bg-[#211f1a] p-px"><EmergencyTools key={bundle.event.id} bundle={bundle} busy={busy} onClose={() => setEmergencyOpen(false)} onChangeGender={changeGuestGender} onReturnBadge={undoCheckIn} onMove={moveGuest} onResetCheckIns={resetCheckIns} /></div>}
          </motion.section> : null}
        </AnimatePresence>
      </div>

      {scene === "setup" && <div inert={overlayOpen ? true : undefined} aria-hidden={overlayOpen ? true : undefined} data-room-chrome className="fixed inset-x-0 bottom-0 z-30 border-t border-[#ddd7cd]/80 bg-[#f3f0e9]/90 px-4 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
        <div className="mx-auto max-w-xl"><button onClick={saveAndGenerate} disabled={busy || savingSetup || !validSetup || !setupChanged} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#211f1a] px-6 text-base font-extrabold text-white shadow-lg shadow-[#211f1a]/10 transition active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-35">{savingSetup ? <Loader2 className="animate-spin" size={18} /> : <WandSparkles size={18} />} {creating ? "افتح الاستقبال من صفر" : dimensionsChanged ? "طبّق التعديل" : guestsToAdd > 0 && bundle?.schedule ? `أضف ${guestsToAdd}` : bundle?.schedule ? "التوزيع محفوظ" : "جهّز الفعالية"}</button></div>
      </div>}

      <footer inert={overlayOpen ? true : undefined} aria-hidden={overlayOpen ? true : undefined} data-room-chrome className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1 text-[11px] font-bold text-[#8a8378] sm:px-6">
        <span aria-live="polite"><CheckCircle2 size={13} className={`ml-1 inline ${liveSyncFailed ? "text-amber-600" : "text-emerald-600"}`} /> {preview ? "نسخة عرض غير متصلة" : liveSyncFailed ? "تعذّر التحديث التلقائي · نحاول مجددًا" : lastLiveSyncAt ? "متزامن بين الأجهزة" : "جارٍ مزامنة الأجهزة"}</span>
        {advancedMode && <button onClick={async () => { mutationEpochRef.current += 1; if (!preview) await roomApi("logout"); setAuthenticated(false); setBundle(null) }} className="flex min-h-10 items-center gap-2 px-2 text-[#746d62]"><LogOut size={14} /> خروج</button>}
      </footer>
    </main>
  )
}
