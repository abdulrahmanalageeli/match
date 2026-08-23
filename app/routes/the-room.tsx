import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import toast, { Toaster } from "react-hot-toast"
import {
  CalendarPlus, CheckCircle2, ChevronDown, Clipboard, DoorOpen, Eye, EyeOff,
  Loader2, LockKeyhole, LogOut, Minus, Plus, Printer, RefreshCw, Share2,
  Sparkles, Table2, UsersRound, WandSparkles, X,
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
  return "تعذّر تنفيذ الطلب. تأكد من الأعداد وحاول مرة أخرى."
}

function guestNumber(value: number) {
  return String(value).padStart(2, "0")
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
        {people.map(person => <button type="button" key={person.id} onClick={() => onGuest(person.id)} className="flex min-h-12 items-center justify-center rounded-2xl border border-white/[0.07] bg-black/20 text-lg font-extrabold text-[#efd89e]">ضيف {guestNumber(person.attendee_number)}</button>)}
      </div>
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
  const [view, setView] = useState<"tables" | "guest">("tables")
  const [selectedGuestId, setSelectedGuestId] = useState("")
  const [draft, setDraft] = useState<SetupValues>({ event_number: 1, minimum_attendees: 20, table_count: 5, round_count: 3 })

  const installBundle = (next: Bundle) => {
    setBundle(next)
    setDraft({
      event_number: next.event.event_number,
      minimum_attendees: Math.max(next.event.minimum_attendees, next.attendees.length),
      table_count: next.event.table_count,
      round_count: next.event.round_count,
    })
    setRound(value => Math.min(value, next.event.round_count))
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
    setDraft({ event_number: Math.max(0, ...events.map(item => item.event_number)) + 1, minimum_attendees: 20, table_count: 5, round_count: 3 })
  }

  const attendees = bundle?.attendees || []
  const included = attendees.filter(person => person.included_in_schedule && ["registered", "confirmed"].includes(person.attendance_status))
  const genderCounts = useMemo(() => included.reduce((counts, person) => {
    if (person.gender === "female") counts.women += 1
    if (person.gender === "male") counts.men += 1
    return counts
  }, { women: 0, men: 0 }), [included])
  const minimumPeople = creating ? 2 : Math.max(2, included.length)
  const validSetup = draft.minimum_attendees % 2 === 0 && draft.minimum_attendees >= draft.table_count * 2
  const selectedGuest = attendees.find(person => person.id === selectedGuestId) || attendees[0]
  const journey = selectedGuest && bundle ? bundle.seats.filter(seat => seat.attendee_id === selectedGuest.id).sort((a, b) => a.round_number - b.round_number) : []

  const saveAndGenerate = async () => {
    if (!validSetup) return
    try {
      let eventId = bundle?.event.id
      if (creating) {
        const data = await act("create-event", draft)
        eventId = data?.event?.id
        setCreating(false)
      } else if (eventId) {
        await act("update-event", { ...draft, event_id: eventId })
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
  }

  const shareGuest = async () => {
    if (!selectedGuest || !bundle) return
    const text = `ذا روم — ضيف ${guestNumber(selectedGuest.attendee_number)}\n${journey.map(seat => `الجولة ${seat.round_number}: الطاولة ${seat.table_number}`).join("\n")}`
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
          <p className="mx-auto mt-3 max-w-md text-base leading-7 text-stone-500">أدخل عدد الضيوف والطاولات، وسنجهّز لك التوزيع كاملًا.</p>
          <button onClick={() => setOrganizerOpen(true)} className="mt-7 inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-[#d7ba7d] px-8 text-base font-extrabold text-[#17130c] shadow-[0_20px_70px_rgba(201,169,104,.2)]"><WandSparkles size={20} /> فتح لوحة التنظيم</button>
        </div>
      </div>

      <AnimatePresence>
        {organizerOpen && (
          <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md sm:items-center sm:p-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.section role="dialog" aria-modal="true" aria-label="لوحة تنظيم ذا روم" initial={{ y: reduceMotion ? 0 : 30, opacity: 0, scale: reduceMotion ? 1 : 0.985 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 18, opacity: 0 }} className="flex max-h-[96dvh] w-full max-w-6xl flex-col overflow-hidden rounded-t-[2rem] border border-white/10 bg-[#11100f] shadow-2xl shadow-black/70 sm:max-h-[92dvh] sm:rounded-[2rem]">
              <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] bg-[#15130f] px-4 py-3 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#d7ba7d]/10 text-[#e4ca91]"><DoorOpen size={21} /></div>
                  <div className="min-w-0"><div className="flex items-center gap-2"><h2 className="truncate text-lg font-extrabold">لوحة المنظّم</h2>{preview && <span className="rounded-full bg-violet-400/10 px-2 py-1 text-[10px] font-bold text-violet-200">نسخة عرض</span>}</div><p className="text-xs text-stone-500">كل شيء في نافذة واحدة</p></div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={refresh} disabled={!bundle || refreshing || preview} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-stone-400 disabled:opacity-30" aria-label="تحديث"><RefreshCw size={17} className={refreshing ? "animate-spin" : ""} /></button>
                  <button onClick={() => setOrganizerOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-stone-400" aria-label="إغلاق"><X size={18} /></button>
                </div>
              </header>

              <div className="overflow-y-auto">
                <div className="border-b border-white/[0.07] px-4 py-4 sm:px-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-bold text-[#c9a968]">{creating ? "فعالية جديدة" : `فعالية رقم ${bundle?.event.event_number}`}</p>
                      <h3 className="mt-1 text-2xl font-extrabold">{creating ? "جهّز الفعالية في أقل من دقيقة" : bundle?.schedule ? "التوزيع جاهز للعرض" : "أدخل الأعداد ثم جهّز التوزيع"}</h3>
                    </div>
                    <div className="flex gap-2">
                      {!creating && events.length > 0 && <div className="relative flex-1 sm:min-w-44"><select value={bundle?.event.id || ""} onChange={async event => { const id = event.target.value; const next = preview ? DEMO_BUNDLE : await roomApi("get-event", { event_id: id }); installBundle(next); setCreating(false); setView("tables") }} className="h-12 w-full appearance-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 pl-10 text-sm font-bold text-white outline-none"><option value="" disabled>اختر فعالية</option>{events.map(item => <option key={item.id} value={item.id}>فعالية {item.event_number}</option>)}</select><ChevronDown size={16} className="pointer-events-none absolute left-4 top-4 text-stone-500" /></div>}
                      <button onClick={beginCreate} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#d7ba7d]/25 bg-[#d7ba7d]/10 px-4 text-sm font-bold text-[#e4ca91]"><CalendarPlus size={17} /> فعالية جديدة</button>
                    </div>
                  </div>
                </div>

                <div className="p-4 sm:p-6">
                  <section data-room-setup className="rounded-[1.75rem] border border-white/[0.08] bg-black/15 p-4 sm:p-5">
                    {creating && <label className="mb-4 block"><span className="mb-2 block text-sm font-bold text-stone-300">رقم الفعالية</span><input className={`${inputClass} max-w-44`} type="number" min="1" value={draft.event_number} onChange={event => setDraft(current => ({ ...current, event_number: Math.max(1, Number(event.target.value)) }))} /></label>}
                    <div className="grid gap-3 md:grid-cols-3">
                      <Counter label="عدد الضيوف" hint="يُنشأ نصفهم رجال ونصفهم نساء" value={draft.minimum_attendees} onChange={value => setDraft(current => ({ ...current, minimum_attendees: value }))} min={minimumPeople} max={500} step={2} />
                      <Counter label="عدد الطاولات" hint="طاولتان أو أكثر حسب المكان" value={draft.table_count} onChange={value => setDraft(current => ({ ...current, table_count: value }))} min={1} max={50} />
                      <Counter label="عدد الجولات" hint="كم مرة ينتقل الضيوف" value={draft.round_count} onChange={value => setDraft(current => ({ ...current, round_count: value }))} min={1} max={20} />
                    </div>
                    <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-[#d7ba7d]/15 bg-[#d7ba7d]/[0.055] p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"><span><strong className="text-rose-200">{creating ? draft.minimum_attendees / 2 : genderCounts.women}</strong> نساء</span><span><strong className="text-sky-200">{creating ? draft.minimum_attendees / 2 : genderCounts.men}</strong> رجال</span><span><strong className="text-[#efd89e]">{Math.floor(draft.minimum_attendees / draft.table_count)}–{Math.ceil(draft.minimum_attendees / draft.table_count)}</strong> لكل طاولة</span></div>
                      <button onClick={saveAndGenerate} disabled={busy || !validSetup} className="flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#d7ba7d] px-6 font-extrabold text-[#17130c] disabled:cursor-not-allowed disabled:opacity-35">{busy ? <Loader2 className="animate-spin" size={18} /> : <WandSparkles size={18} />} {bundle?.schedule && !creating ? "تحديث التوزيع" : "جهّز توزيع الطاولات"}</button>
                    </div>
                    {!validSetup && <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-xs text-amber-100/75">كل طاولة تحتاج ضيفين على الأقل، وعدد الضيوف يجب أن يكون زوجيًا.</p>}
                  </section>

                  {!creating && bundle?.schedule && (
                    <section data-room-results className="mt-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="grid grid-cols-2 rounded-2xl border border-white/[0.08] bg-black/20 p-1">
                          <button onClick={() => setView("tables")} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-extrabold ${view === "tables" ? "bg-[#d7ba7d] text-[#17130c]" : "text-stone-500"}`}><UsersRound size={17} /> توزيع الطاولات</button>
                          <button onClick={() => setView("guest")} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-extrabold ${view === "guest" ? "bg-[#d7ba7d] text-[#17130c]" : "text-stone-500"}`}><Share2 size={17} /> بطاقة الضيف</button>
                        </div>
                        <div className="flex gap-2"><button onClick={() => window.print()} className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-4 text-sm font-bold text-stone-300"><Printer size={16} /> طباعة</button></div>
                      </div>

                      {view === "tables" ? (
                        <div className="mt-5">
                          <div className="flex gap-2 overflow-x-auto pb-2">{Array.from({ length: bundle.event.round_count }, (_, index) => index + 1).map(value => <button key={value} onClick={() => setRound(value)} className={`min-h-11 min-w-28 rounded-2xl border px-4 text-sm font-extrabold ${round === value ? "border-[#d7ba7d]/40 bg-[#d7ba7d]/12 text-[#efd89e]" : "border-white/[0.08] bg-white/[0.025] text-stone-500"}`}>الجولة {value}</button>)}</div>
                          <AnimatePresence mode="wait"><motion.div key={round} initial={{ opacity: 0, x: reduceMotion ? 0 : -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="the-room-schedule-grid mt-3 grid gap-3 lg:grid-cols-2">{Array.from({ length: bundle.event.table_count }, (_, index) => index + 1).map(tableNumber => <TableCard key={tableNumber} tableNumber={tableNumber} seats={bundle.seats.filter(seat => seat.round_number === round && seat.table_number === tableNumber)} attendees={attendees} onGuest={showGuest} />)}</motion.div></AnimatePresence>
                        </div>
                      ) : (
                        <div className="mt-5 grid gap-4 lg:grid-cols-[280px_1fr]">
                          <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-4">
                            <label className="mb-2 block text-sm font-bold text-stone-300">اختر رقم الضيف</label>
                            <div className="relative"><select value={selectedGuest?.id || ""} onChange={event => setSelectedGuestId(event.target.value)} className="h-12 w-full appearance-none rounded-2xl border border-[#d7ba7d]/20 bg-[#d7ba7d]/[0.06] px-4 pl-10 font-extrabold text-[#efd89e] outline-none">{attendees.map(person => <option key={person.id} value={person.id}>ضيف {guestNumber(person.attendee_number)}</option>)}</select><ChevronDown size={16} className="pointer-events-none absolute left-4 top-4 text-[#aa8c52]" /></div>
                            <p className="mt-3 text-xs leading-6 text-stone-500">اعرض البطاقة للضيف أو شاركها معه مباشرة.</p>
                          </div>
                          {selectedGuest && <div className="relative overflow-hidden rounded-[2rem] border border-[#d7ba7d]/30 bg-[#0c0b09] p-5 sm:p-7" style={{ backgroundImage: "radial-gradient(circle at 100% 0%, rgba(216,183,109,.18), transparent 34%), radial-gradient(circle at 0% 100%, rgba(53,133,101,.16), transparent 36%)" }}>
                            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold text-[#c9a968]">بطاقة ضيف ذا روم</p><p className="mt-2 text-5xl font-extrabold text-white">ضيف {guestNumber(selectedGuest.attendee_number)}</p></div><div className="flex gap-2"><button onClick={shareGuest} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#d7ba7d] px-5 font-extrabold text-[#17130c]"><Share2 size={17} /> مشاركة</button><button onClick={async () => { const text = journey.map(seat => `الجولة ${seat.round_number}: الطاولة ${seat.table_number}`).join(" — "); await navigator.clipboard.writeText(text); toast.success("تم النسخ") }} className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-stone-300" aria-label="نسخ"><Clipboard size={17} /></button></div></div>
                            <div className="relative mt-6 grid gap-3 sm:grid-cols-3">{journey.map(seat => <div key={seat.id} className="rounded-2xl border border-white/[0.09] bg-white/[0.045] p-4"><p className="text-xs font-bold text-stone-500">الجولة {seat.round_number}</p><p className="mt-1 text-2xl font-extrabold text-[#efd89e]">الطاولة {seat.table_number}</p></div>)}</div>
                          </div>}
                        </div>
                      )}
                    </section>
                  )}

                  {!creating && !bundle?.schedule && <div className="mt-5 flex items-center gap-3 rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5"><Sparkles size={22} className="shrink-0 text-[#d7ba7d]" /><div><p className="font-extrabold">ابدأ من الأعداد أعلاه</p><p className="mt-1 text-sm text-stone-500">عند الضغط على «جهّز توزيع الطاولات» سيظهر التوزيع هنا مباشرة.</p></div></div>}
                </div>
              </div>

              <footer className="flex shrink-0 items-center justify-between border-t border-white/[0.07] bg-[#15130f] px-4 py-3 text-xs text-stone-600 sm:px-6">
                <span><CheckCircle2 size={14} className="ml-1 inline text-emerald-400" /> يُحفظ كل تغيير تلقائيًا عند تجهيز التوزيع</span>
                <button onClick={async () => { if (!preview) await roomApi("logout"); setAuthenticated(false); setBundle(null) }} className="flex items-center gap-2 text-stone-500 hover:text-white"><LogOut size={14} /> تسجيل الخروج</button>
              </footer>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}
