import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import toast, { Toaster } from "react-hot-toast"
import {
  ArrowRight, BadgeCheck, CalendarPlus, CheckCircle2, ChevronDown, DoorOpen, Eye, EyeOff,
  Loader2, LockKeyhole, LogOut, Minus, Plus, Printer, RefreshCw, RotateCcw, Settings2,
  Share2, Sparkles, Table2, Trash2, Undo2, UserRound, UsersRound, WandSparkles, X,
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
type SetupValues = { event_number: number; minimum_attendees: number; table_count: number; round_count: number }

const demoAttendees: Attendee[] = Array.from({ length: 20 }, (_, index) => ({
  id: `demo-${index + 1}`,
  event_id: "demo-event",
  attendee_number: index + 1,
  full_name: `Guest ${index + 1}`,
  gender: index % 2 === 0 ? "female" : "male",
  attendance_status: "confirmed",
  included_in_schedule: true,
  checked_in: false,
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
  return "تعذّر تنفيذ الطلب. تأكد من الأعداد وحاول مرة أخرى."
}

function guestNumber(value: number) {
  return String(value).padStart(2, "0")
}

function genderStyle(gender: Gender) {
  if (gender === "female") return {
    label: "ضيفة",
    chip: "border-rose-300/25 bg-rose-300/[0.09] text-rose-100 hover:border-rose-300/50",
    accent: "text-rose-200",
    surface: "border-rose-300/30 from-rose-950/85 via-[#130d0d] to-[#0b0b09]",
    glow: "bg-rose-400/20",
  }
  if (gender === "male") return {
    label: "ضيف",
    chip: "border-sky-300/25 bg-sky-300/[0.09] text-sky-100 hover:border-sky-300/50",
    accent: "text-sky-200",
    surface: "border-sky-300/30 from-sky-950/85 via-[#0c1115] to-[#0b0b09]",
    glow: "bg-sky-400/20",
  }
  return {
    label: "ضيف",
    chip: "border-violet-300/25 bg-violet-300/[0.09] text-violet-100 hover:border-violet-300/50",
    accent: "text-violet-200",
    surface: "border-violet-300/30 from-violet-950/85 via-[#100d15] to-[#0b0b09]",
    glow: "bg-violet-400/20",
  }
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

function CheckInPanel({ attendees, busy, onNext, onUndo }: { attendees: Attendee[]; busy: boolean; onNext: (gender: "female" | "male") => void; onUndo: (person: Attendee) => void }) {
  const firstBadges = attendees.slice(0, 20)
  const extraBadges = attendees.slice(20)
  const checkedFirst = firstBadges.filter(person => person.checked_in).length
  const nextWoman = attendees.find(person => person.gender === "female" && !person.checked_in)
  const nextMan = attendees.find(person => person.gender === "male" && !person.checked_in)
  const progress = firstBadges.length ? Math.round((checkedFirst / firstBadges.length) * 100) : 0

  const badgeGrid = (people: Attendee[]) => (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-10">
      {people.map(person => {
        const style = genderStyle(person.gender)
        return person.checked_in ? (
          <button type="button" key={person.id} onClick={() => onUndo(person)} disabled={busy} className="group relative flex min-h-20 flex-col items-center justify-center rounded-2xl border border-emerald-300/35 bg-emerald-300/[0.1] text-emerald-100 disabled:opacity-50" title="تراجع عن التسليم">
            <CheckCircle2 size={18} />
            <span className="mt-1 text-lg font-extrabold">{guestNumber(person.attendee_number)}</span>
            <span className="text-[9px] font-bold">تم التسليم</span>
            <Undo2 size={12} className="absolute left-1.5 top-1.5 opacity-45 group-hover:opacity-100" />
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
            <p className={`text-sm font-extrabold ${woman ? "text-rose-200" : "text-sky-200"}`}>{woman ? "وصلت ضيفة" : "وصل ضيف"}</p>
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
        <div className="flex items-center justify-between gap-4"><div><p className="font-extrabold text-white">استقبال أول 20 ضيف</p><p className="mt-1 text-xs leading-5 text-stone-400">سلّم البطاقة بعد ما تظهر علامة «تم التسليم».</p></div><strong dir="ltr" className="shrink-0 text-2xl text-[#efd89e]">{checkedFirst} / {firstBadges.length}</strong></div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/35"><div className="h-full rounded-full bg-[#d7ba7d] transition-all" style={{ width: `${progress}%` }} /></div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        {arrivalButton("female", nextWoman)}
        {arrivalButton("male", nextMan)}
      </div>

      <section className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-4">
        <div className="mb-3 flex items-center justify-between"><div><p className="font-extrabold text-white">حالة البطاقات</p><p className="mt-1 text-[11px] text-stone-500">وردي للضيفة · أزرق للضيف · أخضر تم تسليمه</p></div><span className="text-xs font-bold text-stone-500">01–20</span></div>
        {badgeGrid(firstBadges)}
      </section>

      {extraBadges.length > 0 && <section className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-4"><div className="mb-3"><p className="font-extrabold text-white">البطاقات الإضافية</p><p className="mt-1 text-[11px] text-stone-500">تُسلّم بعد أول 20 ضيف بنفس الطريقة.</p></div>{badgeGrid(extraBadges)}</section>}
    </div>
  )
}

function GuestBadgeFocus({ event, person, journey, activeRound, onClose, onShare }: { event: RoomEvent; person: Attendee; journey: Seat[]; activeRound: number; onClose: () => void; onShare: () => void }) {
  const style = genderStyle(person.gender)
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-40 flex flex-col items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-2xl sm:p-6">
      <button onClick={onClose} className="absolute left-4 top-4 z-10 flex h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-black/40 px-4 text-sm font-bold text-white backdrop-blur-xl"><X size={17} /> إغلاق</button>
      <motion.article initial={{ y: 18, opacity: 0, scale: 0.97 }} animate={{ y: 0, opacity: 1, scale: 1 }} className={`relative flex aspect-[9/16] max-h-[74dvh] w-full max-w-[390px] flex-col overflow-hidden rounded-[2.25rem] border bg-gradient-to-b p-6 shadow-[0_40px_120px_rgba(0,0,0,.75)] ${style.surface}`}>
        <div className={`pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full blur-[75px] ${style.glow}`} />
        <div className="pointer-events-none absolute inset-3 rounded-[1.7rem] border border-white/[0.07]" />
        <div className="relative flex items-start justify-between">
          <div><p className="text-2xl font-extrabold text-white">ذا روم</p><p className="mt-1 text-[10px] font-bold tracking-[.14em] text-stone-500">بطاقة مسار الضيف</p></div>
          <span className="rounded-full border border-white/10 bg-white/[0.055] px-3 py-1.5 text-[11px] font-bold text-stone-300">فعالية {event.event_number}</span>
        </div>
        <div className="relative mt-8 text-center">
          <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-current bg-white/[0.04] ${style.accent}`}><UserRound size={29} /></div>
          <p className={`mt-3 text-xs font-extrabold ${style.accent}`}>{style.label}</p>
          <p className="mt-1 text-6xl font-extrabold tracking-tight text-white">{person.gender === "female" ? "ضيفة" : "ضيف"} {guestNumber(person.attendee_number)}</p>
        </div>
        <div className="relative my-6 h-px bg-gradient-to-l from-transparent via-white/15 to-transparent" />
        <div className="relative flex-1 space-y-2.5 overflow-hidden">
          {journey.map(seat => {
            const active = seat.round_number === activeRound
            return <div key={seat.id} className={`flex min-h-14 items-center justify-between rounded-2xl border px-4 ${active ? "border-[#e5c780]/45 bg-[#d7ba7d]/12" : "border-white/[0.08] bg-white/[0.035]"}`}><div><p className={`text-[10px] font-bold ${active ? "text-[#e5c780]" : "text-stone-500"}`}>الجولة {seat.round_number}{active ? " · الآن" : ""}</p><p className="mt-0.5 text-xl font-extrabold text-white">الطاولة {seat.table_number}</p></div><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${active ? "bg-[#d7ba7d] text-[#17130c]" : "bg-white/[0.05] text-stone-500"}`}><Table2 size={18} /></div></div>
          })}
        </div>
        <p className="relative mt-5 text-center text-xs leading-5 text-stone-400">احتفظ بنفس رقمك، وانتقل إلى طاولتك في كل جولة.</p>
      </motion.article>
      <button onClick={onShare} className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#d7ba7d] px-6 font-extrabold text-[#17130c]"><Share2 size={17} /> مشاركة البطاقة</button>
    </motion.div>
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
  const [view, setView] = useState<"tables" | "checkin" | "guest">("tables")
  const [selectedGuestId, setSelectedGuestId] = useState("")
  const [badgeOpen, setBadgeOpen] = useState(false)
  const [setupOpen, setSetupOpen] = useState(!preview)
  const [draft, setDraft] = useState<SetupValues>({ event_number: 1, minimum_attendees: 20, table_count: 5, round_count: 3 })
  const organizerScrollRef = useRef<HTMLDivElement>(null)

  const installBundle = (next: Bundle) => {
    setBundle(next)
    setDraft({
      event_number: next.event.event_number,
      minimum_attendees: Math.max(next.event.minimum_attendees, next.attendees.length),
      table_count: next.event.table_count,
      round_count: next.event.round_count,
    })
    setRound(value => Math.min(value, next.event.round_count))
    setBadgeOpen(false)
    setSetupOpen(false)
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
    setDraft({ event_number: Math.max(0, ...events.map(item => item.event_number)) + 1, minimum_attendees: 20, table_count: 5, round_count: 3 })
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
      setView("tables")
      toast.success("انمسح التوزيع، والضيوف محفوظين")
    } catch {}
  }

  const deleteEvent = async () => {
    if (!bundle || !window.confirm(`متأكد إنك تبغى تحذف فعالية ${bundle.event.event_number}؟ الحذف نهائي ويشمل الضيوف والتوزيع.`)) return
    if (preview) { toast("هذه نسخة للعرض فقط", { icon: "✦" }); return }
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
        setDraft({ event_number: bundle.event.event_number + 1, minimum_attendees: 20, table_count: 5, round_count: 3 })
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
    let women = creating ? 0 : genderCounts.women
    let men = creating ? 0 : genderCounts.men
    const startingCount = creating ? 0 : included.length
    for (let index = startingCount; index < draft.minimum_attendees; index += 1) {
      if (women <= men) women += 1
      else men += 1
    }
    return { women, men }
  }, [creating, draft.minimum_attendees, genderCounts, included.length])
  const minimumPeople = creating ? 2 : Math.max(2, included.length)
  const validSetup = draft.minimum_attendees % 2 === 0 && draft.minimum_attendees >= draft.table_count * 2
  const dimensionsChanged = Boolean(bundle && (draft.table_count !== bundle.event.table_count || draft.round_count !== bundle.event.round_count))
  const guestsToAdd = creating ? draft.minimum_attendees : Math.max(0, draft.minimum_attendees - included.length)
  const setupChanged = Boolean(creating || !bundle?.schedule || dimensionsChanged || guestsToAdd > 0)
  const selectedGuest = attendees.find(person => person.id === selectedGuestId) || attendees[0]
  const journey = selectedGuest && bundle ? bundle.seats.filter(seat => seat.attendee_id === selectedGuest.id).sort((a, b) => a.round_number - b.round_number) : []

  const saveAndGenerate = async () => {
    if (!validSetup || !setupChanged) return
    try {
      let eventId = bundle?.event.id
      if (creating) {
        const data = await act("create-event", draft)
        eventId = data?.event?.id
        setCreating(false)
      } else if (eventId) {
        const data = await act("update-event", { ...draft, event_id: eventId })
        if (data?.schedule_change === "extended" && data?.schedule) {
          setRound(1)
          setView("tables")
          toast.success(`انضاف ${data.added_guest_count} ضيوف بدون تغيير أماكن السابقين`)
          return
        }
      }
      if (eventId) {
        await act("generate-schedule", { event_id: eventId })
        setRound(1)
        setView("tables")
        toast.success("تم تجهيز توزيع الجلسات")
      }
    } catch {}
  }

  const showGuest = (id: string) => {
    setSelectedGuestId(id)
    setView("guest")
    setBadgeOpen(true)
  }

  const checkInNext = async (gender: "female" | "male") => {
    if (!bundle) return
    if (preview) {
      const nextPerson = included.find(person => person.gender === gender && !person.checked_in)
      if (!nextPerson) { toast.error("تم تسليم جميع بطاقات هذا القسم"); return }
      installBundle({ ...bundle, attendees: bundle.attendees.map(person => person.id === nextPerson.id ? { ...person, checked_in: true } : person) })
      setView("checkin")
      toast.success(`تم تسليم بطاقة ${guestNumber(nextPerson.attendee_number)}`)
      return
    }
    try {
      const data = await act("check-in-next", { event_id: bundle.event.id, gender })
      setView("checkin")
      toast.success(`تم تسليم بطاقة ${guestNumber(data.assigned_attendee_number)}`)
    } catch {}
  }

  const undoCheckIn = async (person: Attendee) => {
    if (!bundle || !window.confirm(`إعادة البطاقة ${guestNumber(person.attendee_number)} إلى حالة «متاحة»؟`)) return
    if (preview) {
      installBundle({ ...bundle, attendees: bundle.attendees.map(item => item.id === person.id ? { ...item, checked_in: false } : item) })
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
    const text = `ذا روم — ${selectedGuest.gender === "female" ? "ضيفة" : "ضيف"} ${guestNumber(selectedGuest.attendee_number)}\n${journey.map(seat => `الجولة ${seat.round_number}: الطاولة ${seat.table_number}`).join("\n")}`
    try {
      if (navigator.share) await navigator.share({ title: "مسار الضيف في ذا روم", text })
      else { await navigator.clipboard.writeText(text); toast.success("تم نسخ مسار الضيف") }
    } catch (error: any) {
      if (error?.name !== "AbortError") toast.error("تعذّرت المشاركة")
    }
  }

  if (!authenticated) return <><Toaster position="top-center" /><LoginScreen onLogin={login} checking={checking} configured={configured} /></>
  if (checking) return <main className="flex min-h-[100dvh] items-center justify-center bg-[#080807] text-[#d9bb7c]"><Loader2 className="animate-spin" size={28} /></main>

  return (
    <main dir="rtl" className="the-room-page relative min-h-[100dvh] overflow-hidden bg-[#080807] font-['Tajawal'] text-stone-100" style={{ backgroundImage: "radial-gradient(circle at 10% 0%, rgba(143,108,50,.16), transparent 30%), radial-gradient(circle at 92% 75%, rgba(39,89,72,.16), transparent 28%)" }}>
      <Toaster position="top-center" toastOptions={{ style: { direction: "rtl", fontFamily: "Tajawal", background: "#1b1915", color: "#f5f5f4", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16 } }} />
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
              <AnimatePresence>{badgeOpen && bundle && selectedGuest && <GuestBadgeFocus event={bundle.event} person={selectedGuest} journey={journey} activeRound={round} onClose={() => setBadgeOpen(false)} onShare={shareGuest} />}</AnimatePresence>
              <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] bg-[#15130f] px-4 py-3 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#d7ba7d]/10 text-[#e4ca91]"><DoorOpen size={21} /></div>
                  <div className="min-w-0"><div className="flex items-center gap-2"><h2 className="truncate text-lg font-extrabold">لوحة التنظيم</h2>{preview && <span className="rounded-full bg-violet-400/10 px-2 py-1 text-[10px] font-bold text-violet-200">نسخة عرض</span>}</div><p className="text-xs text-stone-500">بسيطة وواضحة</p></div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={refresh} disabled={!bundle || refreshing || preview} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-stone-400 disabled:opacity-30" aria-label="تحديث"><RefreshCw size={17} className={refreshing ? "animate-spin" : ""} /></button>
                  <button onClick={() => setOrganizerOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-stone-400" aria-label="إغلاق"><X size={18} /></button>
                </div>
              </header>

              <div ref={organizerScrollRef} className="overflow-y-auto">
                <div className="border-b border-white/[0.07] px-4 py-4 sm:px-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-bold text-[#c9a968]">{creating ? "فعالية جديدة" : `فعالية رقم ${bundle?.event.event_number}`}</p>
                      <h3 className="mt-1 text-2xl font-extrabold">{creating ? "فعالية جديدة" : view === "checkin" && bundle?.schedule ? "استقبال الضيوف" : bundle?.schedule ? "التوزيع جاهز" : "جهّز التوزيع"}</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!creating && events.length > 0 && <div className="relative min-w-[9.5rem] flex-1 sm:min-w-44"><select value={bundle?.event.id || ""} onChange={async event => { const id = event.target.value; const next = preview ? DEMO_BUNDLE : await roomApi("get-event", { event_id: id }); installBundle(next); setCreating(false); setView("tables") }} className="h-12 w-full appearance-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 pl-10 text-sm font-bold text-white outline-none"><option value="" disabled>اختر فعالية</option>{events.map(item => <option key={item.id} value={item.id}>فعالية {item.event_number}</option>)}</select><ChevronDown size={16} className="pointer-events-none absolute left-4 top-4 text-stone-500" /></div>}
                      {creating && bundle ? <button onClick={cancelCreate} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-bold text-stone-300"><ArrowRight size={17} /> رجوع</button> : <button onClick={beginCreate} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#d7ba7d]/25 bg-[#d7ba7d]/10 px-4 text-sm font-bold text-[#e4ca91]"><CalendarPlus size={17} /> فعالية جديدة</button>}
                      {!creating && bundle && <details className="group relative"><summary className="flex h-12 cursor-pointer list-none items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-4 text-sm font-bold text-stone-400 [&::-webkit-details-marker]:hidden"><Settings2 size={17} /> خيارات</summary><div className="absolute right-0 top-14 z-30 w-52 space-y-2 rounded-2xl border border-white/10 bg-[#1b1916] p-2 shadow-2xl"><button onClick={resetEvent} disabled={!bundle.schedule || busy} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-right text-sm font-bold text-amber-200 hover:bg-white/[0.05] disabled:opacity-25" title="يبقي الضيوف ويمسح توزيع الطاولات"><RotateCcw size={16} /> مسح التوزيع</button><button onClick={deleteEvent} disabled={busy} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-right text-sm font-bold text-red-200 hover:bg-white/[0.05] disabled:opacity-25" title="حذف الفعالية نهائيًا"><Trash2 size={16} /> حذف الفعالية</button></div></details>}
                    </div>
                  </div>
                </div>

                <div className="p-4 sm:p-6">
                  {!creating && bundle?.schedule && view !== "checkin" && <button type="button" onClick={() => setSetupOpen(value => !value)} className="mb-4 flex min-h-11 items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.025] px-4 text-sm font-bold text-stone-400"><Settings2 size={16} /> {setupOpen ? "إخفاء الإعدادات" : "تعديل الأعداد"}</button>}
                  <section data-room-setup className={`${(view === "checkin" && bundle?.schedule && !creating) || (!setupOpen && bundle?.schedule && !creating) ? "hidden" : ""} rounded-[1.75rem] border border-white/[0.08] bg-black/15 p-4 sm:p-5`}>
                    {creating && <label className="mb-4 block"><span className="mb-2 block text-sm font-bold text-stone-300">رقم الفعالية</span><input className={`${inputClass} max-w-44`} type="number" min="1" value={draft.event_number} onChange={event => setDraft(current => ({ ...current, event_number: Math.max(1, Number(event.target.value)) }))} /></label>}
                    <div className="grid gap-3 md:grid-cols-3">
                      <Counter label="عدد الضيوف" hint={!creating && bundle?.schedule ? "الجدد ينضافون بدون تغيير السابقين" : "نقسمهم بالتساوي ضيوف وضيفات"} value={draft.minimum_attendees} onChange={value => setDraft(current => ({ ...current, minimum_attendees: value }))} min={minimumPeople} max={500} step={2} />
                      <Counter label="عدد الطاولات" hint="طاولتان أو أكثر حسب المكان" value={draft.table_count} onChange={value => setDraft(current => ({ ...current, table_count: value }))} min={1} max={50} />
                      <Counter label="عدد الجولات" hint="كم مرة ينتقل الضيوف" value={draft.round_count} onChange={value => setDraft(current => ({ ...current, round_count: value }))} min={1} max={20} />
                    </div>
                    <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-[#d7ba7d]/15 bg-[#d7ba7d]/[0.055] p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"><span><strong className="text-rose-200">{projectedGenderCounts.women}</strong> نساء</span><span><strong className="text-sky-200">{projectedGenderCounts.men}</strong> رجال</span><span><strong className="text-[#efd89e]">{Math.floor(draft.minimum_attendees / draft.table_count)}–{Math.ceil(draft.minimum_attendees / draft.table_count)}</strong> لكل طاولة</span></div>
                      <button onClick={saveAndGenerate} disabled={busy || !validSetup || !setupChanged} className="flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#d7ba7d] px-6 font-extrabold text-[#17130c] disabled:cursor-not-allowed disabled:opacity-35">{busy ? <Loader2 className="animate-spin" size={18} /> : <WandSparkles size={18} />} {creating ? "أنشئ الفعالية والتوزيع" : dimensionsChanged ? "طبّق وأعد توزيع الطاولات" : guestsToAdd > 0 && bundle?.schedule ? `أضف ${guestsToAdd} ضيوف فقط` : bundle?.schedule ? "التوزيع محفوظ" : "جهّز توزيع الطاولات"}</button>
                    </div>
                    {!validSetup && <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-xs text-amber-100/75">كل طاولة تحتاج ضيفين على الأقل، وعدد الضيوف يجب أن يكون زوجيًا.</p>}
                    {!creating && bundle?.schedule && guestsToAdd > 0 && !dimensionsChanged && <p className="mt-3 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.06] px-3 py-2 text-xs leading-6 text-emerald-100/75">بنضيف الضيوف الجدد للتوزيع الحالي بدون ما تتغيّر طاولات السابقين، وبنفصل الجدد عن بعض قدر الإمكان.</p>}
                  </section>

                  {!creating && bundle?.schedule && (
                    <section data-room-results className={view === "checkin" ? "" : "mt-5"}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="grid grid-cols-3 rounded-2xl border border-white/[0.08] bg-black/20 p-1">
                          <button onClick={() => setView("tables")} className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-[11px] font-extrabold sm:gap-2 sm:px-5 sm:text-sm ${view === "tables" ? "bg-[#d7ba7d] text-[#17130c]" : "text-stone-500"}`}><UsersRound size={16} /> توزيع الطاولات</button>
                          <button onClick={() => setView("checkin")} className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-[11px] font-extrabold sm:gap-2 sm:px-5 sm:text-sm ${view === "checkin" ? "bg-[#d7ba7d] text-[#17130c]" : "text-stone-500"}`}><BadgeCheck size={16} /> الاستقبال</button>
                          <button onClick={() => setView("guest")} className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-[11px] font-extrabold sm:gap-2 sm:px-5 sm:text-sm ${view === "guest" ? "bg-[#d7ba7d] text-[#17130c]" : "text-stone-500"}`}><Share2 size={16} /> بطاقة الضيف</button>
                        </div>
                        {view !== "checkin" && <div className="flex gap-2"><button onClick={() => window.print()} className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-4 text-sm font-bold text-stone-300"><Printer size={16} /> طباعة</button></div>}
                      </div>

                      {view === "tables" ? (
                        <div className="mt-5">
                          <div className="flex gap-2 overflow-x-auto pb-2">{Array.from({ length: bundle.event.round_count }, (_, index) => index + 1).map(value => <button key={value} onClick={() => setRound(value)} className={`min-h-11 min-w-28 rounded-2xl border px-4 text-sm font-extrabold ${round === value ? "border-[#d7ba7d]/40 bg-[#d7ba7d]/12 text-[#efd89e]" : "border-white/[0.08] bg-white/[0.025] text-stone-500"}`}>الجولة {value}</button>)}</div>
                          <AnimatePresence mode="wait"><motion.div key={round} initial={{ opacity: 0, x: reduceMotion ? 0 : -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="the-room-schedule-grid mt-3 grid gap-3 lg:grid-cols-2">{Array.from({ length: bundle.event.table_count }, (_, index) => index + 1).map(tableNumber => <TableCard key={tableNumber} tableNumber={tableNumber} seats={bundle.seats.filter(seat => seat.round_number === round && seat.table_number === tableNumber)} attendees={attendees} onGuest={showGuest} />)}</motion.div></AnimatePresence>
                        </div>
                      ) : view === "checkin" ? (
                        <CheckInPanel attendees={included} busy={busy} onNext={checkInNext} onUndo={undoCheckIn} />
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
                <span><CheckCircle2 size={14} className="ml-1 inline text-emerald-400" /> {view === "checkin" ? "تسليم البطاقات ينحفظ مباشرة" : "التغييرات تنحفظ عند تجهيز التوزيع"}</span>
                <button onClick={async () => { if (!preview) await roomApi("logout"); setAuthenticated(false); setBundle(null) }} className="flex items-center gap-2 text-stone-500 hover:text-white"><LogOut size={14} /> خروج</button>
              </footer>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}
