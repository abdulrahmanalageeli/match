import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import toast, { Toaster } from "react-hot-toast"
import { useVisibilityPoll } from "../hooks/useVisibilityPoll"
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
type Bundle = { event: RoomEvent; attendees: Attendee[]; schedule: ScheduleRun | null; seats: Seat[] }
type SetupValues = { event_number: number; minimum_attendees: number; female_attendees: number; male_attendees: number; table_count: number; round_count: number }
type PlacementNotice = { attendeeNumber: number; gender: Gender; tables: { roundNumber: number; tableNumber: number }[] }

const demoAttendees: Attendee[] = Array.from({ length: 20 }, (_, index) => ({
  id: `demo-${index + 1}`,
  event_id: "demo-event",
  attendee_number: index + 1,
  full_name: `Guest ${index + 1}`,
  gender: index % 2 === 0 ? "female" : "male",
  attendance_status: "confirmed",
  included_in_schedule: true,
  checked_in: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}))

function demoSeats() {
  const seats: Seat[] = []
  let id = 1
  for (let round = 0; round < 3; round += 1) {
    for (let group = 0; group < 5; group += 1) {
      for (let position = 0; position < 4; position += 1) {
        seats.push({
          id: id++,
          schedule_run_id: "demo-run",
          event_id: "demo-event",
          round_number: round + 1,
          table_number: ((group + round * position) % 5) + 1,
          seat_number: position + 1,
          attendee_id: `demo-${group * 4 + position + 1}`,
        })
      }
    }
  }
  return seats
}

const DEMO_BUNDLE: Bundle = {
  event: {
    id: "demo-event", event_number: 12, name: "The Room", starts_at: null, venue: null,
    status: "ready", minimum_attendees: 20, table_count: 5, round_count: 3,
    active_round: 1,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
  attendees: demoAttendees,
  schedule: { id: "demo-run", participant_count: 20, table_count: 5, round_count: 3, metrics: {} },
  seats: demoSeats(),
}

async function roomApi(action: string, payload: Record<string, unknown> = {}) {
  const response = await fetch("/api/the-room", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  })
  const data = await response.json().catch(() => ({ error: "invalid-response" }))
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
  if (error?.code === "NO_BADGES_LEFT") return "تم تسليم جميع بطاقات هذا القسم."
  if (error?.code === "BADGE_ALREADY_ASSIGNED") return "تم تسليم هذه البطاقة للتو من جهاز آخر. حاول مرة أخرى."
  if (error?.code === "SAME_TABLE") return "الشخص موجود على هذه الطاولة أصلًا."
  if (error?.code === "INVALID_MOVE") return "تعذّر النقل. تأكد من الجولة والطاولة."
  if (error?.code === "MOVE_REPEATS_MEETING") return "هذا النقل بيكرر لقاء سابق. اختر طاولة ثانية."
  return "تعذّر تنفيذ الطلب. تأكد من الأعداد وحاول مرة أخرى."
}

function guestNumber(value: number) {
  return String(value).padStart(2, "0")
}

function genderStyle(gender: Gender) {
  if (gender === "female") return {
    label: "فتاة",
    chip: "border-rose-300/25 bg-rose-300/[0.09] text-rose-100 hover:border-rose-300/50",
    accent: "text-rose-200",
    surface: "border-rose-300/30 from-rose-950/85 via-[#130d0d] to-[#0b0b09]",
    glow: "bg-rose-400/20",
  }
  if (gender === "male") return {
    label: "ولد",
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
    bundle.schedule?.id || "no-schedule",
    ...bundle.attendees.map(person => `${person.id}:${person.updated_at || ""}:${person.checked_in}:${person.gender}`),
    ...bundle.seats.map(seat => `${seat.id}:${seat.round_number}:${seat.table_number}:${seat.seat_number}:${seat.attendee_id}`),
  ].join("|")
}

function balanceInfo(women: number, men: number) {
  const difference = Math.abs(women - men)
  if (difference <= 1) return { label: "التوازن ممتاز", tone: "border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-100", preferred: null }
  if (difference <= 3) return { label: "التوازن جيد", tone: "border-[#d7ba7d]/20 bg-[#d7ba7d]/[0.07] text-[#efd89e]", preferred: women < men ? "فتاة" : "ولد" }
  return { label: "يحتاج موازنة", tone: "border-amber-300/25 bg-amber-300/[0.08] text-amber-100", preferred: women < men ? "فتاة" : "ولد" }
}

function compareNumberScores(left: number[], right: number[]) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

function previewSeatNewGuest(bundle: Bundle, person: Attendee) {
  const nextSeats: Seat[] = []
  const pairKey = (left: string, right: string) => left < right ? `${left}|${right}` : `${right}|${left}`
  const priorPairs = new Set<string>()
  for (let roundNumber = 1; roundNumber <= bundle.event.round_count; roundNumber += 1) {
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

const inputClass = "h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-center text-lg font-extrabold text-white outline-none transition focus:border-[#d7ba7d]/70 focus:ring-2 focus:ring-[#d7ba7d]/10"

function Counter({ label, value, onChange, min, max, step = 1, hint }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number; step?: number; hint?: string }) {
  const update = (next: number) => onChange(Math.min(max, Math.max(min, next)))
  return (
    <div className="rounded-3xl border border-white/[0.08] bg-white/[0.035] p-3">
      <div className="mb-3 text-center">
        <p className="text-sm font-bold text-stone-200">{label}</p>
        {hint && <p className="mt-0.5 text-[11px] text-stone-500">{hint}</p>}
      </div>
      <div className="grid grid-cols-[44px_1fr_44px] gap-2" dir="ltr">
        <button type="button" onClick={() => update(value - step)} disabled={value <= min} className="flex h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-stone-300 disabled:opacity-25" aria-label={`تقليل ${label}`}><Minus size={18} /></button>
        <input className={inputClass} type="number" min={min} max={max} step={step} value={value} onChange={event => update(Number(event.target.value) || min)} aria-label={label} />
        <button type="button" onClick={() => update(value + step)} disabled={value >= max} className="flex h-12 items-center justify-center rounded-2xl bg-[#d7ba7d] text-[#17130c] disabled:opacity-25" aria-label={`زيادة ${label}`}><Plus size={18} /></button>
      </div>
    </div>
  )
}

function LoginScreen({ onLogin, checking, configured }: { onLogin: (key: string) => Promise<void>; checking: boolean; configured: boolean }) {
  const [key, setKey] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  return (
    <main dir="rtl" className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#080807] px-5 py-10 font-['Tajawal'] text-white">
      <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "radial-gradient(circle at 18% 12%, rgba(178,139,68,.18), transparent 28%), radial-gradient(circle at 82% 80%, rgba(48,94,76,.2), transparent 34%)" }} />
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md">
        <div className="mb-7 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[1.75rem] border border-[#d9bb7c]/30 bg-[#201c14] text-[#e4ca91]"><DoorOpen size={34} /></div>
          <p className="mt-5 text-sm font-bold text-[#c9a968]">لوحة المنظّم</p>
          <h1 className="mt-1 text-4xl font-extrabold">ذا روم</h1>
          <p className="mt-2 text-sm text-stone-500">كل ما تحتاجه لتنظيم الجلسات في مكان واحد.</p>
        </div>
        <form onSubmit={async event => { event.preventDefault(); setSubmitting(true); try { await onLogin(key) } finally { setSubmitting(false) } }} className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl">
          <label className="mb-2 block text-sm font-bold text-stone-300">رمز الدخول</label>
          <div className="relative">
            <input type={showKey ? "text" : "password"} value={key} onChange={event => setKey(event.target.value)} autoComplete="current-password" className={`${inputClass} pl-12 text-right text-sm`} placeholder="أدخل الرمز الخاص" />
            <button type="button" onClick={() => setShowKey(value => !value)} className="absolute left-1 top-1 flex h-10 w-10 items-center justify-center rounded-xl text-stone-500" aria-label={showKey ? "إخفاء الرمز" : "إظهار الرمز"}>{showKey ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          </div>
          <button type="submit" disabled={!key || submitting || checking || !configured} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#d7ba7d] px-5 font-extrabold text-[#17130c] disabled:opacity-40">{submitting || checking ? <Loader2 className="animate-spin" size={18} /> : <LockKeyhole size={18} />} دخول</button>
          {!checking && !configured && <p className="mt-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.07] px-3 py-2 text-xs text-amber-100/70">إعداد الدخول غير مكتمل. تواصل مع المسؤول التقني مرة واحدة لتفعيله.</p>}
        </form>
      </motion.div>
    </main>
  )
}

function TableCard({ tableNumber, seats, attendees, onGuest }: { tableNumber: number; seats: Seat[]; attendees: Attendee[]; onGuest: (id: string) => void }) {
  const people = seats.map(seat => attendees.find(person => person.id === seat.attendee_id)).filter(Boolean) as Attendee[]
  return (
    <section className="overflow-hidden rounded-3xl border border-white/[0.09] bg-white/[0.035]">
      <header className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
        <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#d7ba7d] font-extrabold text-[#17130c]">{tableNumber}</div><div><p className="font-extrabold text-white">الطاولة {tableNumber}</p><p className="text-xs text-stone-500">{people.length} ضيوف</p></div></div>
        <Table2 size={20} className="text-[#c9a968]" />
      </header>
      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
        {people.map(person => { const style = genderStyle(person.gender); return <button type="button" key={person.id} onClick={() => onGuest(person.id)} className={`flex min-h-14 flex-col items-center justify-center rounded-2xl border text-base font-extrabold transition ${style.chip}`}><span>رقم {guestNumber(person.attendee_number)}</span><span className="mt-0.5 text-[10px] font-bold opacity-55">{style.label}</span></button> })}
      </div>
    </section>
  )
}

function OrganizerSummary({ event, attendees, seats, activeRound, onNextRound }: { event: RoomEvent; attendees: Attendee[]; seats: Seat[]; activeRound: number; onNextRound: () => void }) {
  const checked = attendees.filter(person => person.checked_in).length
  const women = attendees.filter(person => person.gender === "female").length
  const men = attendees.filter(person => person.gender === "male").length
  const roundTables = Array.from({ length: event.table_count }, (_, index) => {
    const tableNumber = index + 1
    const members = seats.filter(seat => seat.round_number === activeRound && seat.table_number === tableNumber)
      .map(seat => attendees.find(person => person.id === seat.attendee_id)).filter(Boolean) as Attendee[]
    return { tableNumber, members, women: members.filter(person => person.gender === "female").length, men: members.filter(person => person.gender === "male").length }
  })
  const idealSize = Math.ceil(attendees.length / Math.max(1, event.table_count))
  const imbalanced = roundTables.filter(table => Math.abs(table.women - (women / event.table_count)) > 1 || Math.abs(table.men - (men / event.table_count)) > 1)
  const crowded = roundTables.filter(table => table.members.length > idealSize)
  const stats = [
    { label: "حضروا", value: checked, tone: "text-emerald-200" },
    { label: "بانتظارهم", value: attendees.length - checked, tone: "text-stone-200" },
    { label: "فتيات", value: women, tone: "text-rose-200" },
    { label: "أولاد", value: men, tone: "text-sky-200" },
  ]
  return (
    <section className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold text-[#c9a968]">ملخص المنظّم</p>
          <p className="mt-1 text-xl font-extrabold text-white">الجولة {activeRound} من {event.round_count}</p>
        </div>
        <button type="button" onClick={onNextRound} disabled={activeRound >= event.round_count} className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#d7ba7d] px-5 text-sm font-extrabold text-[#17130c] disabled:opacity-35"><Play size={16} /> {activeRound >= event.round_count ? "هذه آخر جولة" : `ابدأ الجولة ${activeRound + 1}`}</button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map(({ label, value, tone }) => <div key={label} className="rounded-2xl border border-white/[0.07] bg-black/20 p-3 text-center"><p className={`text-2xl font-extrabold ${tone}`}>{value}</p><p className="mt-1 text-[11px] font-bold text-stone-500">{label}</p></div>)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold">
        <span className={`rounded-full border px-3 py-1.5 ${imbalanced.length ? "border-amber-300/20 bg-amber-300/[0.07] text-amber-100" : "border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-100"}`}>{imbalanced.length ? `${imbalanced.length} طاولات تحتاج موازنة` : "الطاولات متوازنة"}</span>
        <span className={`rounded-full border px-3 py-1.5 ${crowded.length ? "border-amber-300/20 bg-amber-300/[0.07] text-amber-100" : "border-white/[0.08] bg-white/[0.035] text-stone-400"}`}>{crowded.length ? `${crowded.length} طاولات مزدحمة` : "ما فيه طاولات مزدحمة"}</span>
      </div>
    </section>
  )
}

function SimpleEventBar({ event, attendees, activeRound, onProjector, onNextRound }: { event: RoomEvent; attendees: Attendee[]; activeRound: number; onProjector: () => void; onNextRound: () => void }) {
  const checked = attendees.filter(person => person.checked_in).length
  const finalRound = activeRound >= event.round_count
  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-[#d7ba7d]/20 bg-[#d7ba7d]/[0.055]">
      <div className="flex items-center justify-between gap-4 p-4 sm:p-5">
        <div>
          <p className="text-xs font-bold text-[#c9a968]">الآن</p>
          <p className="mt-1 text-xl font-extrabold text-white">الجولة {activeRound} من {event.round_count}</p>
          <p className="mt-1 text-xs text-stone-400">حضر {checked} من {attendees.length}</p>
        </div>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#d7ba7d] text-2xl font-extrabold text-[#17130c]">{activeRound}</div>
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-white/[0.07] p-3">
        <button type="button" onClick={onProjector} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white/[0.07] px-3 text-sm font-extrabold text-white"><Monitor size={18} /> عرض الجولة</button>
        <button type="button" onClick={onNextRound} disabled={finalRound} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#d7ba7d] px-3 text-sm font-extrabold text-[#17130c] disabled:bg-white/[0.04] disabled:text-stone-500"><Play size={17} /> {finalRound ? "آخر جولة" : "الجولة التالية"}</button>
      </div>
    </section>
  )
}

function ProjectorView({ bundle, attendees, activeRound, onRound, onClose }: { bundle: Bundle; attendees: Attendee[]; activeRound: number; onRound: (round: number) => void; onClose: () => void }) {
  const tables = Array.from({ length: bundle.event.table_count }, (_, index) => index + 1)
  const close = async () => {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined)
    onClose()
  }
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !document.fullscreenElement) onClose() }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])
  return (
    <motion.div dir="rtl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[120] flex flex-col overflow-hidden bg-[#070706] text-white">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-[#11100e] px-4 py-3 sm:px-7 sm:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#d7ba7d] text-xl font-extrabold text-[#17130c]">{activeRound}</div>
          <div><p className="text-xs font-bold text-[#c9a968]">ذا روم · فعالية {bundle.event.event_number}</p><h2 className="text-[clamp(1.25rem,3vw,2rem)] font-extrabold">الجولة {activeRound}</h2></div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => document.documentElement.requestFullscreen?.().catch(() => undefined)} className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 px-3 text-sm font-bold text-stone-300"><Maximize2 size={17} /><span className="hidden sm:inline">ملء الشاشة</span></button>
          <button type="button" onClick={close} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 text-stone-300" aria-label="إغلاق شاشة العرض"><X size={19} /></button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(15rem,100%),1fr))] gap-3">
          {tables.map(tableNumber => {
            const people = bundle.seats.filter(seat => seat.round_number === activeRound && seat.table_number === tableNumber)
              .map(seat => attendees.find(person => person.id === seat.attendee_id)).filter(Boolean) as Attendee[]
            return <section key={tableNumber} className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.04]">
              <div className="flex items-center gap-3 border-b border-white/[0.07] p-3 sm:p-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#d7ba7d] text-xl font-extrabold text-[#17130c]">{tableNumber}</div><div><p className="text-lg font-extrabold">الطاولة {tableNumber}</p><p className="text-xs text-stone-500">{people.length} أشخاص</p></div></div>
              <div className="grid grid-cols-2 gap-2 p-3">
                {people.map(person => { const style = genderStyle(person.gender); return <div key={person.id} className={`flex min-h-14 items-center justify-center rounded-2xl border px-2 text-[clamp(.9rem,2vw,1.15rem)] font-extrabold ${style.chip}`}><span>{style.label} {guestNumber(person.attendee_number)}</span></div> })}
              </div>
            </section>
          })}
        </div>
      </main>
      <footer className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-white/10 bg-[#11100e] p-3 sm:px-7">
        <button type="button" onClick={() => onRound(Math.max(1, activeRound - 1))} disabled={activeRound === 1} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 px-4 font-extrabold text-stone-200 disabled:opacity-25"><ChevronRight size={19} /> السابقة</button>
        <p className="hidden text-center text-sm font-bold text-stone-500 sm:block">اعرض هذه الشاشة للضيوف</p>
        <button type="button" onClick={() => onRound(Math.min(bundle.event.round_count, activeRound + 1))} disabled={activeRound === bundle.event.round_count} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#d7ba7d] px-4 font-extrabold text-[#17130c] disabled:opacity-30">التالية <ChevronLeft size={19} /></button>
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

  const badgeGrid = (people: Attendee[]) => (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-10">
      {people.map(person => {
        const style = genderStyle(person.gender)
        return person.checked_in ? (
          <button type="button" key={person.id} onClick={() => onShow(person.id)} disabled={busy} className="group relative flex min-h-20 flex-col items-center justify-center rounded-2xl border border-emerald-300/35 bg-emerald-300/[0.1] text-emerald-100 disabled:opacity-50" title="عرض البطاقة المسلّمة">
            <CheckCircle2 size={18} />
            <span className="mt-1 text-lg font-extrabold">{guestNumber(person.attendee_number)}</span>
            <span className="text-[9px] font-bold">مقفلة · تم التسليم</span>
            <LockKeyhole size={12} className="absolute left-1.5 top-1.5 opacity-55" />
          </button>
        ) : (
          <div key={person.id} className={`flex min-h-20 flex-col items-center justify-center rounded-2xl border ${style.chip}`}>
            <span className="text-xl font-extrabold">{guestNumber(person.attendee_number)}</span>
            <span className="mt-1 text-[9px] font-bold opacity-60">متاحة · {style.label}</span>
          </div>
        )
      })}
    </div>
  )

  const arrivalButton = (gender: "female" | "male", person: Attendee | undefined) => {
    const woman = gender === "female"
    return (
      <button type="button" onClick={() => onNext(gender)} disabled={busy || !person} className={`relative min-h-32 overflow-hidden rounded-3xl border p-4 text-right transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${woman ? "border-rose-300/25 bg-rose-300/[0.07]" : "border-sky-300/25 bg-sky-300/[0.07]"}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={`text-sm font-extrabold ${woman ? "text-rose-200" : "text-sky-200"}`}>{woman ? "وصلت فتاة" : "وصل ولد"}</p>
            {person ? <p className="mt-1.5 text-xs text-stone-400">البطاقة التالية</p> : <p className="mt-1.5 text-xs text-stone-400">خلصت البطاقات</p>}
          </div>
          <BadgeCheck size={26} className={woman ? "text-rose-200" : "text-sky-200"} />
        </div>
        <div className="mt-3 flex items-end justify-between">
          <span className="max-w-20 text-[10px] font-bold leading-4 text-stone-500">اضغط للتسليم</span>
          <span className="text-4xl font-extrabold text-white">{person ? guestNumber(person.attendee_number) : "✓"}</span>
        </div>
      </button>
    )
  }

  return (
    <div className="mt-5 space-y-4">
      <section className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4"><div><p className="font-extrabold text-white">استقبال الضيوف</p><p className="mt-1 text-xs leading-5 text-stone-400">اضغط حسب الشخص الواصل، وبطاقته بتظهر مباشرة.</p></div><strong dir="ltr" className="shrink-0 text-2xl text-[#efd89e]">{checkedCount} / {attendees.length}</strong></div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/35"><div className="h-full rounded-full bg-[#d7ba7d] transition-all" style={{ width: `${progress}%` }} /></div>
      </section>

      {(!simple || balance.preferred) && <section className={`rounded-3xl border p-4 ${balance.tone}`}>
        <div className="flex items-center justify-between gap-3"><div><p className="font-extrabold">{balance.label}</p><p className="mt-1 text-xs opacity-70">{women} فتيات · {men} أولاد</p></div><Gauge size={24} /></div>
        {balance.preferred && <p className="mt-3 rounded-xl bg-black/15 px-3 py-2 text-xs font-bold">يفضّل تكون الإضافة الجاية: {balance.preferred}</p>}
      </section>}

      <div className="grid grid-cols-2 gap-3">
        {arrivalButton("female", nextWoman)}
        {arrivalButton("male", nextMan)}
      </div>

      {recent.length > 0 && <section className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-4"><p className="mb-3 font-extrabold text-white">آخر البطاقات المسلّمة</p><div className="space-y-2">{recent.map(person => <div key={person.id} className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.055] p-3"><button type="button" onClick={() => onShow(person.id)} className="flex min-w-0 flex-1 items-center gap-3 text-right"><CheckCircle2 size={18} className="shrink-0 text-emerald-300" /><div><p className="font-extrabold text-white">بطاقة {guestNumber(person.attendee_number)} · {genderStyle(person.gender).label}</p><p className="mt-0.5 flex items-center gap-1 text-[10px] text-stone-500"><Clock3 size={11} /> {checkInTime(person.updated_at)}</p></div></button><button type="button" onClick={() => onUndo(person)} disabled={busy} className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-xs font-bold text-stone-300 disabled:opacity-40"><Undo2 size={14} /> تراجع</button></div>)}</div></section>}

      <section className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-3 sm:p-4">
        {simple && !addGuestOpen ? <button type="button" onClick={() => setAddGuestOpen(true)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-bold text-stone-400"><UserPlus size={16} /> شخص جديد ما عنده بطاقة</button> : <>
          <div className="mb-3 flex items-start justify-between gap-3"><div><p className="font-extrabold text-white">إضافة شخص جديد</p><p className="mt-1 text-xs text-stone-500">ينضاف حضوره وتظهر بطاقته مباشرة.</p></div>{simple && <button type="button" onClick={() => setAddGuestOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-stone-500" aria-label="إلغاء الإضافة"><X size={15} /></button>}</div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onAdd("female")} disabled={busy} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-rose-300/25 bg-rose-300/[0.07] px-3 text-sm font-extrabold text-rose-100 disabled:opacity-40"><UserPlus size={17} /> فتاة</button>
            <button type="button" onClick={() => onAdd("male")} disabled={busy} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-sky-300/25 bg-sky-300/[0.07] px-3 text-sm font-extrabold text-sky-100 disabled:opacity-40"><UserPlus size={17} /> ولد</button>
          </div>
        </>}
      </section>

      {!simple && placementNotice && <section className="rounded-3xl border border-[#d7ba7d]/20 bg-[#d7ba7d]/[0.06] p-4"><div className="flex items-start gap-3"><ShieldCheck size={20} className="mt-0.5 shrink-0 text-[#e4ca91]" /><div><p className="font-extrabold text-white">آخر إضافة: {genderStyle(placementNotice.gender).label} {guestNumber(placementNotice.attendeeNumber)}</p><p className="mt-1 text-xs font-bold text-[#d9bb7c]">اختير أفضل توازن متاح</p><p className="mt-2 text-xs text-stone-400">{placementNotice.tables.map(item => `ج${item.roundNumber}: ط${item.tableNumber}`).join(" · ")}</p></div></div></section>}

      {simple && !allBadgesOpen ? <button type="button" onClick={() => setAllBadgesOpen(true)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.02] text-sm font-bold text-stone-500"><BadgeCheck size={16} /> عرض كل البطاقات</button> : <section className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-4">
        <div className="mb-3 flex items-center justify-between"><div><p className="font-extrabold text-white">حالة البطاقات</p><p className="mt-1 text-[11px] text-stone-500">وردي للفتاة · أزرق للولد · أخضر تم تسليمه</p></div><span className="text-xs font-bold text-stone-500">01–20</span></div>
        {badgeGrid(firstBadges)}
        {simple && <button type="button" onClick={() => setAllBadgesOpen(false)} className="mt-3 min-h-10 w-full text-xs font-bold text-stone-500">إخفاء البطاقات</button>}
      </section>}

      {extraBadges.length > 0 && (!simple || allBadgesOpen) && <section className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-4"><p className="mb-3 font-extrabold text-white">البطاقات الإضافية</p>{badgeGrid(extraBadges)}</section>}
    </div>
  )
}

function GuestBadgeFocus({ event, person, journey, activeRound, simple = false, onClose, onShare }: { event: RoomEvent; person: Attendee; journey: Seat[]; activeRound: number; simple?: boolean; onClose: () => void; onShare: () => void }) {
  const style = genderStyle(person.gender)
  const badgeRef = useRef<HTMLElement>(null)
  const [photoMode, setPhotoMode] = useState(simple)
  const [saving, setSaving] = useState(false)

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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-room-badge-overlay className={`room-badge-overlay absolute inset-0 z-40 overflow-y-auto overscroll-contain bg-black/80 backdrop-blur-2xl ${photoMode ? "room-badge-photo-mode" : ""}`}>
      <div className={`room-badge-shell mx-auto flex min-h-full w-full max-w-[430px] flex-col items-center px-[clamp(.625rem,4vw,1rem)] pb-[max(.75rem,env(safe-area-inset-bottom))] pt-[max(.625rem,env(safe-area-inset-top))] ${photoMode ? "justify-center" : ""}`}>
        {!photoMode && <div className="room-badge-toolbar sticky top-0 z-30 mb-2 flex w-full shrink-0 justify-end py-1">
          <button onClick={onClose} aria-label="إغلاق البطاقة" className="flex h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-black/65 px-4 text-sm font-bold text-white shadow-lg backdrop-blur-xl"><X size={17} /><span className="room-badge-close-label">إغلاق</span></button>
        </div>}
        <motion.article ref={badgeRef} onClick={() => { if (!photoMode) return; if (simple) onClose(); else setPhotoMode(false) }} aria-label={photoMode ? "اضغط للرجوع" : undefined} initial={{ y: 18, opacity: 0, scale: 0.97 }} animate={{ y: 0, opacity: 1, scale: 1 }} data-room-badge className={`room-badge-card relative w-full shrink-0 overflow-hidden rounded-[clamp(1.5rem,8vw,2.25rem)] border bg-gradient-to-b p-[clamp(.875rem,4.5vw,1.5rem)] shadow-[0_40px_120px_rgba(0,0,0,.75)] ${photoMode ? "cursor-pointer" : ""} ${style.surface}`}>
          <div className={`pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full blur-[75px] ${style.glow}`} />
          <div className="pointer-events-none absolute inset-[clamp(.5rem,3vw,.75rem)] rounded-[clamp(1.15rem,6vw,1.7rem)] border border-white/[0.07]" />
          <div className="room-badge-header relative flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0"><p className="text-[clamp(1.25rem,6vw,1.5rem)] font-extrabold leading-tight text-white">ذا روم</p><p className="room-badge-brand-subtitle mt-1 text-[10px] font-bold tracking-[.12em] text-stone-500">بطاقة مسار الضيف</p></div>
            <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.055] px-[clamp(.6rem,3vw,.75rem)] py-1.5 text-[clamp(.625rem,2.8vw,.6875rem)] font-bold text-stone-300">فعالية {event.event_number}</span>
          </div>
          <div className="room-badge-identity relative mt-[clamp(.75rem,4vh,1.25rem)] text-center">
            <div className={`room-badge-avatar mx-auto flex h-[clamp(2.5rem,12vw,3.5rem)] w-[clamp(2.5rem,12vw,3.5rem)] items-center justify-center rounded-full border border-current bg-white/[0.04] ${style.accent}`}><UserRound className="h-[45%] w-[45%]" /></div>
            <p className={`mt-1.5 text-[clamp(.6875rem,3vw,.75rem)] font-extrabold ${style.accent}`}>{style.label}</p>
            <p className="room-badge-number mt-0.5 break-words text-[clamp(2.25rem,12vw,3rem)] font-extrabold leading-none tracking-tight text-white">{person.gender === "female" ? "فتاة" : "ولد"} {guestNumber(person.attendee_number)}</p>
          </div>
          <div className="room-badge-divider relative my-[clamp(.65rem,3vh,1rem)] h-px bg-gradient-to-l from-transparent via-white/15 to-transparent" />
          <div className="room-badge-journey relative grid gap-[clamp(.375rem,1.2vh,.5rem)]">
            {journey.map(seat => {
              const active = seat.round_number === activeRound
              return <div key={seat.id} className={`room-badge-round flex items-center justify-between rounded-[clamp(.75rem,4vw,1rem)] border px-[clamp(.75rem,4vw,1rem)] py-[clamp(.4rem,1.4vh,.625rem)] ${active ? "min-h-14 border-[#e5c780]/45 bg-[#d7ba7d]/12" : "min-h-11 border-white/[0.08] bg-white/[0.035]"}`}><div><p className={`text-[clamp(.5625rem,2.6vw,.625rem)] font-bold ${active ? "text-[#e5c780]" : "text-stone-500"}`}>الجولة {seat.round_number}{active ? " · الآن" : ""}</p><p className={`${active ? "text-[clamp(1.05rem,5vw,1.25rem)]" : "text-[clamp(.9375rem,4.5vw,1.125rem)]"} font-extrabold leading-tight text-white`}>الطاولة {seat.table_number}</p></div><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${active ? "bg-[#d7ba7d] text-[#17130c]" : "bg-white/[0.05] text-stone-500"}`}><Table2 size={17} /></div></div>
            })}
          </div>
          <p className="room-badge-guidance relative mt-[clamp(.65rem,2vh,1rem)] px-1 text-center text-[clamp(.6875rem,3vw,.75rem)] leading-5 text-stone-400">احتفظ بنفس رقمك، وانتقل إلى طاولتك في كل جولة.</p>
        </motion.article>
        {!photoMode && <div className="mt-2 grid w-full shrink-0 grid-cols-3 gap-2">
          <button onClick={() => { setPhotoMode(true); toast("اضغط على البطاقة للرجوع", { icon: "📷" }) }} className="flex min-h-11 items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.05] px-2 text-[11px] font-extrabold text-white"><Camera size={16} /> تصوير</button>
          <button onClick={saveImage} disabled={saving} className="flex min-h-11 items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.05] px-2 text-[11px] font-extrabold text-white disabled:opacity-40">{saving ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />} حفظ صورة</button>
          <button onClick={onShare} className="flex min-h-11 items-center justify-center gap-1.5 rounded-2xl bg-[#d7ba7d] px-2 text-[11px] font-extrabold text-[#17130c]"><Share2 size={16} /> مشاركة</button>
        </div>}
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
        <div className="rounded-2xl border border-white/[0.08] bg-black/15 p-3"><p className="text-xs font-bold text-stone-400">تصحيح النوع أو البطاقة</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => onChangeGender(person, "female")} disabled={busy || person.gender === "female"} className="min-h-11 rounded-xl border border-rose-300/20 bg-rose-300/[0.07] text-sm font-extrabold text-rose-100 disabled:opacity-35">فتاة</button><button type="button" onClick={() => onChangeGender(person, "male")} disabled={busy || person.gender === "male"} className="min-h-11 rounded-xl border border-sky-300/20 bg-sky-300/[0.07] text-sm font-extrabold text-sky-100 disabled:opacity-35">ولد</button></div>{person.checked_in && <button type="button" onClick={() => onReturnBadge(person)} disabled={busy} className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 text-sm font-bold text-stone-300 disabled:opacity-40"><Undo2 size={15} /> رجّع البطاقة</button>}</div>
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
  const [refreshing, setRefreshing] = useState(false)
  const [organizerOpen, setOrganizerOpen] = useState(true)
  const [creating, setCreating] = useState(false)
  const [round, setRound] = useState(1)
  const [tableRound, setTableRound] = useState(1)
  const [view, setView] = useState<"tables" | "checkin" | "guest">(preview ? "checkin" : "tables")
  const [selectedGuestId, setSelectedGuestId] = useState("")
  const [badgeOpen, setBadgeOpen] = useState(false)
  const [emergencyOpen, setEmergencyOpen] = useState(false)
  const [placementNotice, setPlacementNotice] = useState<PlacementNotice | null>(null)
  const [setupOpen, setSetupOpen] = useState(!preview)
  const [advancedMode, setAdvancedMode] = useState(false)
  const [projectorOpen, setProjectorOpen] = useState(false)
  const [liveSyncFailed, setLiveSyncFailed] = useState(false)
  const [lastLiveSyncAt, setLastLiveSyncAt] = useState<number | null>(preview ? Date.now() : null)
  const [draft, setDraft] = useState<SetupValues>({ event_number: 1, minimum_attendees: 20, female_attendees: 10, male_attendees: 10, table_count: 5, round_count: 3 })
  const organizerScrollRef = useRef<HTMLDivElement>(null)
  const liveSyncInFlightRef = useRef(false)
  const mutationEpochRef = useRef(0)
  const bundleFingerprintRef = useRef(preview ? bundleFingerprint(DEMO_BUNDLE) : "")

  const installBundle = (next: Bundle) => {
    const nextWomen = next.attendees.filter(person => person.gender === "female" && person.included_in_schedule).length
    const nextMen = next.attendees.filter(person => person.gender === "male" && person.included_in_schedule).length
    const nextRound = Math.min(next.event.round_count, Math.max(1, Number(next.event.active_round) || 1))
    setBundle(next)
    bundleFingerprintRef.current = bundleFingerprint(next)
    setLastLiveSyncAt(Date.now())
    setLiveSyncFailed(false)
    setDraft({
      event_number: next.event.event_number,
      minimum_attendees: Math.max(next.event.minimum_attendees, next.attendees.length),
      female_attendees: nextWomen,
      male_attendees: nextMen,
      table_count: next.event.table_count,
      round_count: next.event.round_count,
    })
    setRound(nextRound)
    setTableRound(value => Math.min(value, next.event.round_count))
    setBadgeOpen(false)
    setPlacementNotice(null)
    setSetupOpen(false)
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
    requestAnimationFrame(() => organizerScrollRef.current?.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }))
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

  const beginCreate = () => {
    setCreating(true)
    setView("tables")
    setBadgeOpen(false)
    setSetupOpen(true)
    setDraft({ event_number: Math.max(0, ...events.map(item => item.event_number)) + 1, minimum_attendees: 20, female_attendees: 10, male_attendees: 10, table_count: 5, round_count: 3 })
  }

  const cancelCreate = () => {
    if (!bundle) return
    setCreating(false)
    installBundle(bundle)
  }

  const resetEvent = async () => {
    if (!bundle || !window.confirm("متأكد إنك تبغى تمسح توزيع الطاولات؟ الضيوف والإعدادات بتبقى محفوظة.")) return
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
        setCreating(true)
        setDraft({ event_number: bundle.event.event_number + 1, minimum_attendees: 20, female_attendees: 10, male_attendees: 10, table_count: 5, round_count: 3 })
      }
      toast.success("انحذفت الفعالية")
    } catch (error: any) {
      toast.error(arabicError(error))
    } finally {
      setBusy(false)
    }
  }

  const attendees = bundle?.attendees || []
  const included = attendees.filter(person => person.included_in_schedule && ["registered", "confirmed"].includes(person.attendance_status))
  const genderCounts = useMemo(() => included.reduce((counts, person) => {
    if (person.gender === "female") counts.women += 1
    if (person.gender === "male") counts.men += 1
    return counts
  }, { women: 0, men: 0 }), [included])
  const projectedGenderCounts = useMemo(() => {
    if (creating) return { women: draft.female_attendees, men: draft.male_attendees }
    let women = genderCounts.women
    let men = genderCounts.men
    const startingCount = creating ? 0 : included.length
    for (let index = startingCount; index < draft.minimum_attendees; index += 1) {
      if (women <= men) women += 1
      else men += 1
    }
    return { women, men }
  }, [creating, draft.female_attendees, draft.male_attendees, draft.minimum_attendees, genderCounts, included.length])
  const minimumPeople = creating ? 2 : Math.max(2, included.length)
  const draftGuestTotal = creating ? draft.female_attendees + draft.male_attendees : draft.minimum_attendees
  const validSetup = draftGuestTotal >= draft.table_count * 2 && draftGuestTotal <= 500
  const dimensionsChanged = Boolean(bundle && (draft.table_count !== bundle.event.table_count || draft.round_count !== bundle.event.round_count))
  const guestsToAdd = creating ? draft.minimum_attendees : Math.max(0, draft.minimum_attendees - included.length)
  const setupChanged = Boolean(creating || !bundle?.schedule || dimensionsChanged || guestsToAdd > 0)
  const selectedGuest = attendees.find(person => person.id === selectedGuestId) || attendees[0]
  const journey = selectedGuest && bundle ? bundle.seats.filter(seat => seat.attendee_id === selectedGuest.id).sort((a, b) => a.round_number - b.round_number) : []
  const activeView = advancedMode ? view : "checkin"

  const syncLiveEvent = async () => {
    if (!bundle || busy || preview || liveSyncInFlightRef.current) return
    const eventId = bundle.event.id
    const requestEpoch = mutationEpochRef.current
    liveSyncInFlightRef.current = true
    try {
      const next = await roomApi("get-event", { event_id: eventId }) as Bundle
      if (mutationEpochRef.current !== requestEpoch) return
      if (next.event.id !== eventId) return
      const nextFingerprint = bundleFingerprint(next)
      if (nextFingerprint !== bundleFingerprintRef.current) {
        bundleFingerprintRef.current = nextFingerprint
        setBundle(current => current?.event.id === eventId ? next : current)
        setEvents(current => current.map(event => event.id === eventId ? next.event : event))
        setRound(Math.min(next.event.round_count, Math.max(1, Number(next.event.active_round) || 1)))
        setSelectedGuestId(current => next.attendees.some(person => person.id === current) ? current : next.attendees[0]?.id || "")
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

  useVisibilityPoll(syncLiveEvent, 5_000, Boolean(authenticated && organizerOpen && bundle && !preview))

  const changeActiveRound = async (nextValue: number) => {
    if (!bundle || busy) return
    const nextRound = Math.min(bundle.event.round_count, Math.max(1, Math.round(nextValue)))
    if (nextRound === round) return
    if (preview) {
      setRound(nextRound)
      return
    }
    const previousRound = round
    setRound(nextRound)
    try {
      await act("set-active-round", { event_id: bundle.event.id, active_round: nextRound })
    } catch {
      setRound(previousRound)
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
    if (!validSetup || !setupChanged) return
    try {
      let eventId = bundle?.event.id
      if (creating) {
        const data = await act("create-event", { ...draft, minimum_attendees: draftGuestTotal })
        eventId = data?.event?.id
        setCreating(false)
      } else if (eventId) {
        const data = await act("update-event", { ...draft, event_id: eventId })
        if (data?.schedule_change === "extended" && data?.schedule) {
          setRound(1)
          setTableRound(1)
          setView("checkin")
          toast.success(`تم تحديث عدد الضيوف إلى ${data.attendees.length}`)
          return
        }
      }
      if (eventId) {
        await act("generate-schedule", { event_id: eventId })
        setRound(1)
        setTableRound(1)
        setView("checkin")
        toast.success("تم تجهيز توزيع الجلسات")
      }
    } catch {}
  }

  const showGuest = (id: string) => {
    setSelectedGuestId(id)
    setView("guest")
    setBadgeOpen(true)
  }

  const showBadge = (id: string) => {
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
      if (advancedMode) toast.success(`تم تسليم بطاقة ${guestNumber(data.assigned_attendee_number)}`)
    } catch {}
  }

  const addGuest = async (gender: "female" | "male") => {
    if (!bundle?.schedule) return
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
      const addedSeats = previewSeatNewGuest(bundle, addedPerson)
      installBundle({ ...bundle, attendees: [...bundle.attendees, addedPerson], seats: [...bundle.seats, ...addedSeats] })
      setPlacementNotice({ attendeeNumber, gender, tables: addedSeats.map(seat => ({ roundNumber: seat.round_number, tableNumber: seat.table_number })) })
      setSelectedGuestId(addedPerson.id)
      setView("checkin")
      setBadgeOpen(true)
      if (advancedMode) toast.success(`تمت إضافة ${gender === "female" ? "فتاة" : "ولد"} ${guestNumber(attendeeNumber)}`)
      return
    }
    try {
      const data = await act("add-attendee", { event_id: bundle.event.id, gender })
      const addedPerson = data.attendees?.find((person: Attendee) => person.id === data.added_attendee_id)
      if (addedPerson) setSelectedGuestId(addedPerson.id)
      setPlacementNotice({ attendeeNumber: data.added_attendee_number, gender, tables: data.placement_tables || [] })
      setView("checkin")
      setBadgeOpen(Boolean(addedPerson))
      if (advancedMode) toast.success(`تمت إضافة ${gender === "female" ? "فتاة" : "ولد"} ${guestNumber(data.added_attendee_number)}`)
    } catch {}
  }

  const undoCheckIn = async (person: Attendee) => {
    if (!bundle || !window.confirm(`إعادة البطاقة ${guestNumber(person.attendee_number)} إلى حالة «متاحة»؟`)) return
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
    const text = `ذا روم — ${selectedGuest.gender === "female" ? "فتاة" : "ولد"} ${guestNumber(selectedGuest.attendee_number)}\n${journey.map(seat => `الجولة ${seat.round_number}: الطاولة ${seat.table_number}`).join("\n")}`
    try {
      if (navigator.share) await navigator.share({ title: "مسار الضيف في ذا روم", text })
      else { await navigator.clipboard.writeText(text); toast.success("تم نسخ مسار الضيف") }
    } catch (error: any) {
      if (error?.name !== "AbortError") toast.error("تعذّرت المشاركة")
    }
  }

  const changeGuestGender = async (person: Attendee, gender: "female" | "male") => {
    if (!bundle || person.gender === gender) return
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
    if (!bundle || !window.confirm("ترجّع كل البطاقات إلى «متاحة» وتبدأ الاستقبال من جديد؟")) return
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
    if (!bundle?.schedule) return
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
  if (checking) return <main className="flex min-h-[100dvh] items-center justify-center bg-[#080807] text-[#d9bb7c]"><Loader2 className="animate-spin" size={28} /></main>

  return (
    <main dir="rtl" className="the-room-page relative min-h-[100dvh] overflow-hidden bg-[#080807] font-['Tajawal'] text-stone-100" style={{ backgroundImage: "radial-gradient(circle at 10% 0%, rgba(143,108,50,.16), transparent 30%), radial-gradient(circle at 92% 75%, rgba(39,89,72,.16), transparent 28%)" }}>
      <Toaster position="top-center" toastOptions={{ style: { direction: "rtl", fontFamily: "Tajawal", background: "#1b1915", color: "#f5f5f4", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16 } }} />
      <AnimatePresence>{projectorOpen && bundle?.schedule && <ProjectorView bundle={bundle} attendees={included} activeRound={round} onRound={changeActiveRound} onClose={() => setProjectorOpen(false)} />}</AnimatePresence>
      <div className="relative flex min-h-[100dvh] items-center justify-center px-5 py-10">
        <div className="max-w-xl text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[1.75rem] border border-[#d9bb7c]/30 bg-[#201c14] text-[#e4ca91]"><DoorOpen size={34} /></div>
          <p className="mt-6 text-sm font-bold text-[#c9a968]">لوحة تنظيم الجلسات</p>
          <h1 className="mt-2 text-5xl font-extrabold">ذا روم</h1>
          <p className="mx-auto mt-3 max-w-md text-base leading-7 text-stone-500">حدّد العدد، وخلك جاهز لاستقبال ضيوفك.</p>
          <button onClick={() => setOrganizerOpen(true)} className="mt-7 inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-[#d7ba7d] px-8 text-base font-extrabold text-[#17130c] shadow-[0_20px_70px_rgba(201,169,104,.2)]"><WandSparkles size={20} /> فتح لوحة التنظيم</button>
        </div>
      </div>

      <AnimatePresence>
        {organizerOpen && (
          <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md sm:items-center sm:p-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.section role="dialog" aria-modal="true" aria-label="لوحة تنظيم ذا روم" initial={{ y: reduceMotion ? 0 : 30, opacity: 0, scale: reduceMotion ? 1 : 0.985 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 18, opacity: 0 }} className="relative flex max-h-[96dvh] w-full max-w-6xl flex-col overflow-hidden rounded-t-[2rem] border border-white/10 bg-[#11100f] shadow-2xl shadow-black/70 sm:max-h-[92dvh] sm:rounded-[2rem]">
              <AnimatePresence>{badgeOpen && bundle && selectedGuest && <GuestBadgeFocus event={bundle.event} person={selectedGuest} journey={journey} activeRound={round} simple={!advancedMode} onClose={() => setBadgeOpen(false)} onShare={shareGuest} />}</AnimatePresence>
              <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] bg-[#15130f] px-4 py-3 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#d7ba7d]/10 text-[#e4ca91]"><DoorOpen size={21} /></div>
                  <div className="min-w-0"><div className="flex items-center gap-2"><h2 className="truncate text-lg font-extrabold">تشغيل الفعالية</h2>{preview && <span className="rounded-full bg-violet-400/10 px-2 py-1 text-[10px] font-bold text-violet-200">نسخة عرض</span>}</div><p className="text-xs text-stone-500">الاستقبال والجولات من مكان واحد</p></div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setAdvancedMode(value => !value); setView("checkin"); setEmergencyOpen(false) }} aria-label={advancedMode ? "إنهاء الوضع المتقدم" : "فتح المزيد من الخيارات"} aria-pressed={advancedMode} className={`flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-3 text-xs font-bold ${advancedMode ? "border-[#d7ba7d]/30 bg-[#d7ba7d]/10 text-[#e4ca91]" : "border-white/10 bg-white/[0.04] text-stone-400"}`}><SlidersHorizontal size={16} /><span>{advancedMode ? "إنهاء" : "المزيد"}</span></button>
                  {advancedMode && <button onClick={refresh} disabled={!bundle || refreshing || preview} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-stone-400 disabled:opacity-30" aria-label="تحديث"><RefreshCw size={17} className={refreshing ? "animate-spin" : ""} /></button>}
                  {advancedMode && <button onClick={() => setOrganizerOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-stone-400" aria-label="إغلاق"><X size={18} /></button>}
                </div>
              </header>

              <div ref={organizerScrollRef} className="overflow-y-auto">
                <div className="border-b border-white/[0.07] px-4 py-4 sm:px-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-bold text-[#c9a968]">{creating ? "تجهيز جديد" : `فعالية ${bundle?.event.event_number}`}</p>
                      <h3 className="mt-1 text-2xl font-extrabold">{creating ? "جهّز الفعالية" : activeView === "checkin" && bundle?.schedule ? "الاستقبال" : bundle?.schedule ? "التوزيع" : "جهّز الفعالية"}</h3>
                      {!advancedMode && <p className="mt-1 text-xs text-stone-500">{bundle?.schedule ? "اضغط حسب الشخص الواصل" : "حدّد الأعداد ثم اضغط جهّز"}</p>}
                    </div>
                    {advancedMode && <div className="flex flex-wrap gap-2">
                      {!creating && events.length > 0 && <div className="relative min-w-[9.5rem] flex-1 sm:min-w-44"><select value={bundle?.event.id || ""} onChange={async event => { mutationEpochRef.current += 1; const id = event.target.value; const next = preview ? DEMO_BUNDLE : await roomApi("get-event", { event_id: id }); installBundle(next); setCreating(false) }} className="h-12 w-full appearance-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 pl-10 text-sm font-bold text-white outline-none"><option value="" disabled>اختر فعالية</option>{events.map(item => <option key={item.id} value={item.id}>فعالية {item.event_number}</option>)}</select><ChevronDown size={16} className="pointer-events-none absolute left-4 top-4 text-stone-500" /></div>}
                      {creating && bundle ? <button onClick={cancelCreate} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-bold text-stone-300"><ArrowRight size={17} /> رجوع</button> : <button onClick={beginCreate} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#d7ba7d]/25 bg-[#d7ba7d]/10 px-4 text-sm font-bold text-[#e4ca91]"><CalendarPlus size={17} /> فعالية جديدة</button>}
                      {!creating && bundle && <details className="group relative"><summary className="flex h-12 cursor-pointer list-none items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-4 text-sm font-bold text-stone-400 [&::-webkit-details-marker]:hidden"><Settings2 size={17} /> خيارات</summary><div className="absolute right-0 top-14 z-30 w-56 space-y-2 rounded-2xl border border-white/10 bg-[#1b1916] p-2 shadow-2xl"><button onClick={() => setEmergencyOpen(true)} disabled={busy} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-right text-sm font-bold text-stone-200 hover:bg-white/[0.05] disabled:opacity-25"><UserCog size={16} /> تصحيح أو نقل شخص</button><button onClick={resetEvent} disabled={!bundle.schedule || busy} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-right text-sm font-bold text-amber-200 hover:bg-white/[0.05] disabled:opacity-25" title="يبقي الضيوف ويمسح توزيع الطاولات"><RotateCcw size={16} /> مسح التوزيع</button><button onClick={deleteEvent} disabled={busy} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-right text-sm font-bold text-red-200 hover:bg-white/[0.05] disabled:opacity-25" title="حذف الفعالية نهائيًا"><Trash2 size={16} /> حذف الفعالية</button></div></details>}
                    </div>}
                  </div>
                </div>

                <div className="p-4 sm:p-6">
                  {advancedMode && !creating && bundle && emergencyOpen && <EmergencyTools key={bundle.event.id} bundle={bundle} busy={busy} onClose={() => setEmergencyOpen(false)} onChangeGender={changeGuestGender} onReturnBadge={undoCheckIn} onMove={moveGuest} onResetCheckIns={resetCheckIns} />}
                  {advancedMode && !creating && bundle?.schedule && <button type="button" onClick={() => setSetupOpen(value => !value)} className="mb-4 flex min-h-11 items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.025] px-4 text-sm font-bold text-stone-400"><Settings2 size={16} /> {setupOpen ? "إخفاء تعديل الأعداد" : "تعديل الأعداد"}</button>}
                  <section data-room-setup className={`${!creating && bundle?.schedule && (!advancedMode || !setupOpen) ? "hidden" : ""} rounded-[1.75rem] border border-white/[0.08] bg-black/15 p-4 sm:p-5`}>
                    {creating && advancedMode && <label className="mb-4 block"><span className="mb-2 block text-sm font-bold text-stone-300">رقم الفعالية</span><input className={`${inputClass} max-w-44`} type="number" min="1" value={draft.event_number} onChange={event => setDraft(current => ({ ...current, event_number: Math.max(1, Number(event.target.value)) }))} /></label>}
                    <div className={`grid gap-3 ${creating ? "sm:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3"}`}>
                      {creating ? <>
                        <Counter label="كم فتاة؟" value={draft.female_attendees} onChange={value => setDraft(current => ({ ...current, female_attendees: value, minimum_attendees: value + current.male_attendees }))} min={0} max={500 - draft.male_attendees} />
                        <Counter label="كم ولد؟" value={draft.male_attendees} onChange={value => setDraft(current => ({ ...current, male_attendees: value, minimum_attendees: value + current.female_attendees }))} min={0} max={500 - draft.female_attendees} />
                      </> : (!bundle?.schedule ? <Counter label="عدد الأشخاص" value={draft.minimum_attendees} onChange={value => setDraft(current => ({ ...current, minimum_attendees: value }))} min={minimumPeople} max={500} /> : <div className="rounded-3xl border border-white/[0.08] bg-white/[0.035] p-3 text-center"><p className="text-sm font-bold text-stone-200">عدد الأشخاص</p><p className="mt-3 text-3xl font-extrabold text-white">{included.length}</p><p className="mt-1 text-[11px] text-stone-500">الإضافة من الاستقبال</p></div>)}
                      <Counter label="كم طاولة؟" value={draft.table_count} onChange={value => setDraft(current => ({ ...current, table_count: value }))} min={1} max={50} />
                      <Counter label="كم جولة؟" value={draft.round_count} onChange={value => setDraft(current => ({ ...current, round_count: value }))} min={1} max={20} />
                    </div>
                    <div className={`mt-4 flex flex-col gap-3 rounded-2xl border border-[#d7ba7d]/15 bg-[#d7ba7d]/[0.055] p-4 ${advancedMode ? "sm:flex-row sm:items-center sm:justify-between" : ""}`}>
                      {advancedMode && <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"><span><strong className="text-rose-200">{projectedGenderCounts.women}</strong> فتيات</span><span><strong className="text-sky-200">{projectedGenderCounts.men}</strong> أولاد</span><span><strong className="text-[#efd89e]">{Math.floor(draftGuestTotal / draft.table_count)}–{Math.ceil(draftGuestTotal / draft.table_count)}</strong> لكل طاولة</span></div>}
                      <button onClick={saveAndGenerate} disabled={busy || !validSetup || !setupChanged} className="flex min-h-14 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#d7ba7d] px-6 text-base font-extrabold text-[#17130c] disabled:cursor-not-allowed disabled:opacity-35">{busy ? <Loader2 className="animate-spin" size={18} /> : <WandSparkles size={18} />} {creating ? "جهّز الفعالية" : dimensionsChanged ? "طبّق التعديل" : guestsToAdd > 0 && bundle?.schedule ? `أضف ${guestsToAdd}` : bundle?.schedule ? "التوزيع محفوظ" : "جهّز الفعالية"}</button>
                    </div>
                    {!validSetup && <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-xs text-amber-100/75">كل طاولة تحتاج ضيفين على الأقل.</p>}
                  </section>

                  {!creating && bundle?.schedule && (
                    <section data-room-results className={activeView === "checkin" ? "" : "mt-5"}>
                      {advancedMode && <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="grid grid-cols-3 rounded-2xl border border-white/[0.08] bg-black/20 p-1">
                          <button onClick={() => { setTableRound(round); setView("tables") }} className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-[11px] font-extrabold sm:gap-2 sm:px-5 sm:text-sm ${view === "tables" ? "bg-[#d7ba7d] text-[#17130c]" : "text-stone-500"}`}><UsersRound size={16} /> الطاولات</button>
                          <button onClick={() => setView("checkin")} className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-[11px] font-extrabold sm:gap-2 sm:px-5 sm:text-sm ${view === "checkin" ? "bg-[#d7ba7d] text-[#17130c]" : "text-stone-500"}`}><BadgeCheck size={16} /> الاستقبال</button>
                          <button onClick={() => setView("guest")} className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-[11px] font-extrabold sm:gap-2 sm:px-5 sm:text-sm ${view === "guest" ? "bg-[#d7ba7d] text-[#17130c]" : "text-stone-500"}`}><Share2 size={16} /> البطاقات</button>
                        </div>
                        {view !== "checkin" && <div className="flex gap-2"><button onClick={() => window.print()} className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-4 text-sm font-bold text-stone-300"><Printer size={16} /> طباعة</button></div>}
                      </div>}

                      {activeView === "tables" ? (
                        <div className="mt-5">
                          <p className="mb-2 text-xs font-bold text-stone-500">للمراجعة فقط · الجولة الحالية تبقى {round}</p>
                          <div className="flex gap-2 overflow-x-auto pb-2">{Array.from({ length: bundle.event.round_count }, (_, index) => index + 1).map(value => <button key={value} onClick={() => setTableRound(value)} className={`min-h-11 min-w-28 rounded-2xl border px-4 text-sm font-extrabold ${tableRound === value ? "border-[#d7ba7d]/40 bg-[#d7ba7d]/12 text-[#efd89e]" : "border-white/[0.08] bg-white/[0.025] text-stone-500"}`}>الجولة {value}</button>)}</div>
                          <AnimatePresence mode="wait"><motion.div key={tableRound} initial={{ opacity: 0, x: reduceMotion ? 0 : -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="the-room-schedule-grid mt-3 grid gap-3 lg:grid-cols-2">{Array.from({ length: bundle.event.table_count }, (_, index) => index + 1).map(tableNumber => <TableCard key={tableNumber} tableNumber={tableNumber} seats={bundle.seats.filter(seat => seat.round_number === tableRound && seat.table_number === tableNumber)} attendees={attendees} onGuest={showGuest} />)}</motion.div></AnimatePresence>
                        </div>
                      ) : activeView === "checkin" ? (
                        <div className="mt-5 space-y-4">
                          {advancedMode ? <OrganizerSummary event={bundle.event} attendees={included} seats={bundle.seats} activeRound={round} onNextRound={advanceRound} /> : <SimpleEventBar event={bundle.event} attendees={included} activeRound={round} onProjector={openProjector} onNextRound={advanceRound} />}
                          <CheckInPanel attendees={included} busy={busy} placementNotice={placementNotice} simple={!advancedMode} onNext={checkInNext} onAdd={addGuest} onUndo={undoCheckIn} onShow={showBadge} />
                        </div>
                      ) : (
                        <div className="mt-5">
                          <div className="mb-4 flex flex-col gap-3 rounded-3xl border border-white/[0.08] bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-extrabold text-white">اختر البطاقة</p><p className="mt-1 text-xs text-stone-500">تفتح بشكل طولي وجاهزة للتصوير.</p></div>{selectedGuest && <button onClick={() => setBadgeOpen(true)} className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#d7ba7d] px-5 text-sm font-extrabold text-[#17130c]"><UserRound size={17} /> عرض بطاقة {guestNumber(selectedGuest.attendee_number)}</button>}</div>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">{attendees.filter(person => bundle.seats.some(seat => seat.attendee_id === person.id)).map(person => { const style = genderStyle(person.gender); return <button key={person.id} onClick={() => { setSelectedGuestId(person.id); setBadgeOpen(true) }} className={`flex min-h-16 flex-col items-center justify-center rounded-2xl border font-extrabold transition ${style.chip}`}><span className="text-lg">بطاقة {guestNumber(person.attendee_number)}</span><span className="mt-1 text-[10px] opacity-55">{style.label}</span></button> })}</div>
                        </div>
                      )}
                    </section>
                  )}

                  {!creating && !bundle?.schedule && <div className="mt-5 flex items-center gap-3 rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5"><Sparkles size={22} className="shrink-0 text-[#d7ba7d]" /><div><p className="font-extrabold">ابدأ من الأعداد أعلاه</p><p className="mt-1 text-sm text-stone-500">عند الضغط على «جهّز توزيع الطاولات» سيظهر التوزيع هنا مباشرة.</p></div></div>}
                </div>
              </div>

              <footer className="flex shrink-0 items-center justify-between border-t border-white/[0.07] bg-[#15130f] px-4 py-3 text-xs text-stone-600 sm:px-6">
                <span aria-live="polite"><CheckCircle2 size={14} className={`ml-1 inline ${liveSyncFailed ? "text-amber-400" : "text-emerald-400"}`} /> {preview ? "نسخة عرض غير متصلة" : liveSyncFailed ? "تعذّر التحديث التلقائي · نحاول مجددًا" : lastLiveSyncAt ? "متزامن بين الأجهزة" : "جارٍ مزامنة الأجهزة"}</span>
                {advancedMode && <button onClick={async () => { mutationEpochRef.current += 1; if (!preview) await roomApi("logout"); setAuthenticated(false); setBundle(null) }} className="flex items-center gap-2 text-stone-500 hover:text-white"><LogOut size={14} /> خروج</button>}
              </footer>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}
