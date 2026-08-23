import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import toast, { Toaster } from "react-hot-toast"
import {
  Camera, Check, CheckCircle2, ChevronDown, DoorOpen, Download, Eye, EyeOff,
  Hash, ImageDown, Loader2, LockKeyhole, LogOut, Navigation, Plus, RefreshCw,
  Sparkles, Table2, WandSparkles, X,
} from "lucide-react"

export const meta = () => [
  { title: "The Room — Seating Studio" },
  { name: "description", content: "Simple numbered, balanced, repeat-free event seating for The Room." },
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
  metrics: {
    repeatPairCount?: number
    uniquePairCount?: number
    genderSpreadMax?: number
    averageMeetingsPerAttendee?: number
  }
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
        const table = round === 0 ? group : (group + round * position) % 5
        seats.push({
          id: id++,
          schedule_run_id: "demo-run",
          event_id: "demo-event",
          round_number: round + 1,
          table_number: table + 1,
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
    id: "demo-event",
    event_number: 12,
    name: "The Room",
    starts_at: null,
    venue: null,
    status: "ready",
    minimum_attendees: 20,
    table_count: 5,
    round_count: 3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  attendees: demoAttendees,
  schedule: {
    id: "demo-run",
    participant_count: 20,
    table_count: 5,
    round_count: 3,
    metrics: { repeatPairCount: 0, uniquePairCount: 90, genderSpreadMax: 0, averageMeetingsPerAttendee: 9 },
  },
  seats: demoSeats(),
}

async function roomApi(action: string, payload: Record<string, unknown> = {}) {
  const response = await fetch("/api/the-room", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  })
  const data = await response.json().catch(() => ({ error: "The Room returned an invalid response" }))
  if (!response.ok) {
    throw Object.assign(new Error(data.error || "Request failed"), {
      status: response.status,
      code: data.code,
      details: data.details,
    })
  }
  return data
}

function guestNumber(value: number) {
  return String(value).padStart(2, "0")
}

function Panel({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  return <section id={id} className={`rounded-[1.75rem] border border-white/[0.08] bg-white/[0.045] shadow-2xl shadow-black/20 backdrop-blur-xl ${className}`}>{children}</section>
}

function Pill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-bold ${className}`}>{children}</span>
}

function MetricCard({ label, value, detail, accent }: { label: string; value: string | number; detail: string; accent: string }) {
  return (
    <Panel className="relative overflow-hidden p-4 sm:p-5">
      <div className={`absolute -right-8 -top-8 h-24 w-24 rounded-full blur-3xl ${accent}`} />
      <div className="relative">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-600">{label}</p>
        <p className="mt-2 text-2xl font-black tracking-tight text-white">{value}</p>
        <p className="mt-1 text-[11px] text-stone-500">{detail}</p>
      </div>
    </Panel>
  )
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold text-stone-300">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[11px] leading-relaxed text-stone-600">{hint}</span>}
    </label>
  )
}

function Modal({ title, eyebrow, onClose, children, wide = false }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <motion.div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 backdrop-blur-md sm:items-center sm:p-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.div role="dialog" aria-modal="true" aria-label={title} initial={{ y: 36, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 24, opacity: 0 }} onMouseDown={event => event.stopPropagation()} className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-[2rem] border border-white/10 bg-[#11100f] shadow-2xl shadow-black/70 sm:rounded-[2rem] ${wide ? "max-w-2xl" : "max-w-lg"}`}>
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.07] bg-[#11100f]/95 px-5 py-4 backdrop-blur-xl">
          <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c9a968]">{eyebrow}</p><h2 className="mt-1 text-xl font-black text-white">{title}</h2></div>
          <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-stone-400 hover:text-white" aria-label="Close"><X size={18} /></button>
        </header>
        {children}
      </motion.div>
    </motion.div>
  )
}

const inputClass = "min-h-12 w-full rounded-2xl border border-white/[0.09] bg-black/25 px-4 text-sm text-white outline-none transition placeholder:text-stone-700 focus:border-[#c9a968]/60 focus:ring-2 focus:ring-[#c9a968]/10"

function LoginScreen({ onLogin, checking, configured }: { onLogin: (key: string) => Promise<void>; checking: boolean; configured: boolean }) {
  const [key, setKey] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#080807] px-5 py-10 text-white">
      <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "radial-gradient(circle at 18% 12%, rgba(178,139,68,.18), transparent 28%), radial-gradient(circle at 82% 80%, rgba(48,94,76,.2), transparent 34%)" }} />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md">
        <div className="mb-8 text-center"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[1.75rem] border border-[#d9bb7c]/30 bg-gradient-to-br from-[#2a251b] to-[#11100d] shadow-[0_20px_70px_rgba(201,169,104,.18)]"><DoorOpen size={34} className="text-[#e4ca91]" /></div><p className="mt-6 text-[11px] font-black uppercase tracking-[0.36em] text-[#c9a968]">Private seating studio</p><h1 className="mt-2 font-serif text-5xl font-semibold tracking-[-0.04em] text-stone-50">The Room</h1><p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-stone-500">Number the room. Balance every table. Repeat no introduction.</p></div>
        <Panel className="p-5 sm:p-6">
          <form onSubmit={async event => { event.preventDefault(); setSubmitting(true); try { await onLogin(key) } finally { setSubmitting(false) } }} className="space-y-4">
            <Field label="Studio access key"><div className="relative"><input type={showKey ? "text" : "password"} value={key} onChange={event => setKey(event.target.value)} autoComplete="current-password" className={`${inputClass} pr-12`} placeholder="Enter the private key" /><button type="button" onClick={() => setShowKey(value => !value)} className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-xl text-stone-500" aria-label={showKey ? "Hide key" : "Show key"}>{showKey ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></Field>
            <button type="submit" disabled={!key || submitting || checking || !configured} className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#d1b273] to-[#f0d49b] px-5 font-black text-[#17130c] shadow-[0_16px_50px_rgba(201,169,104,.18)] disabled:cursor-not-allowed disabled:opacity-40">{submitting || checking ? <Loader2 className="animate-spin" size={18} /> : <LockKeyhole size={18} />} Enter the studio</button>
            {!checking && !configured && <p className="rounded-xl border border-amber-400/15 bg-amber-400/[0.07] px-3 py-2 text-xs leading-relaxed text-amber-100/70">Set THE_ROOM_ADMIN_KEY and THE_ROOM_SESSION_SECRET in the deployment environment first.</p>}
          </form>
        </Panel>
      </motion.div>
    </main>
  )
}

function CreateEventModal({ onClose, onCreate, busy, suggestedNumber }: { onClose: () => void; onCreate: (values: Record<string, number>) => Promise<void>; busy: boolean; suggestedNumber: number }) {
  const [values, setValues] = useState({ event_number: suggestedNumber, minimum_attendees: 20, table_count: 5, round_count: 3 })
  const set = (key: keyof typeof values, value: number) => setValues(current => ({ ...current, [key]: value }))
  const even = values.minimum_attendees >= 2 && values.minimum_attendees % 2 === 0
  const women = Math.floor(values.minimum_attendees / 2)
  const men = values.minimum_attendees - women
  const enoughForTables = values.minimum_attendees >= values.table_count * 2
  return (
    <Modal title="Open a new room" eyebrow="One-minute setup" onClose={onClose} wide>
      <form onSubmit={async event => { event.preventDefault(); if (even && enoughForTables) await onCreate(values) }} className="space-y-5 p-5 sm:p-6">
        <Field label="Event number" hint="The permanent number used to find this event later."><input className={inputClass} type="number" min="1" value={values.event_number} onChange={event => set("event_number", Number(event.target.value))} /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="People"><input className={inputClass} type="number" min="2" max="500" step="2" value={values.minimum_attendees} onChange={event => set("minimum_attendees", Number(event.target.value))} /></Field>
          <Field label="Tables"><input className={inputClass} type="number" min="1" max="50" value={values.table_count} onChange={event => set("table_count", Number(event.target.value))} /></Field>
          <Field label="Rounds"><input className={inputClass} type="number" min="1" max="20" value={values.round_count} onChange={event => set("round_count", Number(event.target.value))} /></Field>
        </div>
        <div className="overflow-hidden rounded-[1.5rem] border border-[#d9bb7c]/20 bg-gradient-to-br from-[#d9bb7c]/10 to-emerald-400/[0.04] p-5">
          <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#d9bb7c]/12 text-[#e4ca91]"><Sparkles size={18} /></div><div><h3 className="font-black text-white">Your roster appears automatically</h3><p className="mt-1 text-xs leading-relaxed text-stone-500">Guests <strong className="text-stone-300">#01–#{guestNumber(values.minimum_attendees)}</strong> will be created immediately—no names, phone numbers, or payments.</p></div></div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-center"><div className="rounded-2xl border border-rose-300/10 bg-rose-300/[0.05] p-3"><p className="text-2xl font-black text-rose-100">{women}</p><p className="text-[10px] font-bold uppercase tracking-wider text-rose-200/50">Women</p></div><div className="rounded-2xl border border-sky-300/10 bg-sky-300/[0.05] p-3"><p className="text-2xl font-black text-sky-100">{men}</p><p className="text-[10px] font-bold uppercase tracking-wider text-sky-200/50">Men</p></div></div>
        </div>
        {!even && <p className="rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-xs text-amber-100/75">Use an even starting number so the room can begin 50/50.</p>}
        {!enoughForTables && <p className="rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-xs text-amber-100/75">Each table needs at least two people. Reduce the tables or add people.</p>}
        <button disabled={busy || !even || !enoughForTables} className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#d7ba7d] font-black text-[#17130c] disabled:opacity-40">{busy ? <Loader2 className="animate-spin" size={18} /> : <DoorOpen size={18} />} Create Event {values.event_number} with {values.minimum_attendees} guests</button>
      </form>
    </Modal>
  )
}

function attendeeJourney(person: Attendee, seats: Seat[]) {
  return seats.filter(seat => seat.attendee_id === person.id).sort((left, right) => left.round_number - right.round_number)
}

async function downloadSeatPass(event: RoomEvent, person: Attendee, seats: Seat[], activeRound: number) {
  const journey = attendeeJourney(person, seats)
  const rows = Math.ceil(journey.length / 2)
  const height = Math.max(1240, 560 + rows * 190 + 220)
  const rounds = journey.map((seat, index) => {
    const column = index % 2
    const row = Math.floor(index / 2)
    const x = 90 + column * 465
    const y = 545 + row * 190
    const active = seat.round_number === activeRound
    return `<g transform="translate(${x} ${y})"><rect width="405" height="150" rx="30" fill="${active ? "#2a2418" : "#171611"}" stroke="${active ? "#d8b76d" : "#4b422f"}" stroke-width="${active ? 3 : 1}"/><text x="32" y="43" fill="${active ? "#e9cb87" : "#a49b8b"}" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="4">ROUND ${seat.round_number}${active ? " · NOW" : ""}</text><text x="32" y="112" fill="#f2d797" font-family="Georgia, serif" font-size="62" font-weight="700">TABLE ${seat.table_number}</text></g>`
  }).join("")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#090908"/><stop offset=".55" stop-color="#15130e"/><stop offset="1" stop-color="#071711"/></linearGradient></defs><rect width="1080" height="${height}" fill="url(#bg)"/><circle cx="960" cy="120" r="280" fill="#d8b76d" opacity=".08"/><circle cx="100" cy="${height - 80}" r="320" fill="#3d8e70" opacity=".08"/><rect x="34" y="34" width="1012" height="${height - 68}" rx="54" fill="none" stroke="#ad8d50" stroke-width="2" opacity=".55"/><g transform="translate(90 92)"><circle cx="42" cy="42" r="42" fill="#201c13" stroke="#b69451" stroke-width="2"/><text x="42" y="57" text-anchor="middle" fill="#e9cd8f" font-family="Georgia, serif" font-size="48">R</text></g><text x="196" y="122" fill="#fffaf0" font-family="Georgia, serif" font-size="52" font-weight="700">The Room</text><text x="198" y="158" fill="#a9905f" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="7">YOUR SEATING JOURNEY</text><text x="90" y="250" fill="#8d877a" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="4">EVENT ${event.event_number}</text><text x="90" y="365" fill="#ffffff" font-family="Georgia, serif" font-size="94" font-weight="700">GUEST #${guestNumber(person.attendee_number)}</text><line x1="90" x2="990" y1="435" y2="435" stroke="#5b4b2c"/><text x="90" y="500" fill="#d8b970" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="5">FOLLOW THE ROUND · FIND THE TABLE</text>${rounds}<text x="540" y="${height - 112}" text-anchor="middle" fill="#e7dfcf" font-family="Arial, sans-serif" font-size="24">Your number stays the same. Your table changes each round.</text></svg>`
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }))
  const image = new Image()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error("The pass image could not be rendered"))
    image.src = svgUrl
  })
  const canvas = document.createElement("canvas")
  canvas.width = 1080
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Image export is not supported in this browser")
  context.drawImage(image, 0, 0)
  URL.revokeObjectURL(svgUrl)
  const png = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png", 1))
  if (!png) throw new Error("The pass image could not be created")
  const pngUrl = URL.createObjectURL(png)
  const link = document.createElement("a")
  link.href = pngUrl
  link.download = `the-room-${event.event_number}-guest-${person.attendee_number}.png`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(pngUrl), 1000)
}

function SeatPassModal({ event, person, seats, activeRound, onClose }: { event: RoomEvent; person: Attendee; seats: Seat[]; activeRound: number; onClose: () => void }) {
  const journey = attendeeJourney(person, seats)
  const activeSeat = journey.find(seat => seat.round_number === activeRound)
  return (
    <Modal title="Photo-ready seat pass" eyebrow={`Event ${event.event_number} · Guest #${guestNumber(person.attendee_number)}`} onClose={onClose} wide>
      <div className="p-4 sm:p-6">
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="relative mx-auto max-w-md overflow-hidden rounded-[2rem] border border-[#d8b76d]/35 bg-[#0b0b09] p-6 shadow-[0_35px_100px_rgba(0,0,0,.6)] sm:p-8" style={{ backgroundImage: "radial-gradient(circle at 100% 0%, rgba(216,183,109,.2), transparent 32%), radial-gradient(circle at 0% 100%, rgba(53,133,101,.18), transparent 34%)" }}>
          <div className="absolute inset-3 rounded-[1.5rem] border border-[#d8b76d]/10" />
          <div className="relative">
            <div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#d8b76d]/30 bg-[#d8b76d]/10 font-serif text-2xl text-[#efd89e]">R</div><div><p className="font-serif text-2xl font-semibold text-white">The Room</p><p className="text-[8px] font-black uppercase tracking-[.28em] text-[#b79a5e]">Your seating journey</p></div></div><span className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 text-[10px] font-black text-stone-400">EVENT {event.event_number}</span></div>
            <div className="mt-9 text-center"><p className="text-[10px] font-black uppercase tracking-[.24em] text-stone-500">Your guest number</p><h3 className="mt-2 font-serif text-7xl font-semibold leading-none tracking-tight text-white">#{guestNumber(person.attendee_number)}</h3></div>
            <div className="my-7 h-px bg-gradient-to-r from-transparent via-[#d8b76d]/45 to-transparent" />
            {activeSeat && <div className="rounded-2xl border border-[#d8b76d]/35 bg-[#d8b76d]/10 p-4 text-center"><p className="text-[9px] font-black uppercase tracking-[.22em] text-[#caaa68]">Current destination · Round {activeRound}</p><p className="mt-1 font-serif text-3xl font-bold text-[#f5dda1]">Go to Table {activeSeat.table_number}</p></div>}
            <p className="mt-5 text-center text-[9px] font-black uppercase tracking-[.22em] text-[#d8b76d]">Every round</p>
            <div className="mt-4 grid grid-cols-2 gap-3">{journey.map((seat, index) => { const active = seat.round_number === activeRound; return <motion.div key={seat.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.07 }} className={`rounded-2xl border p-4 ${active ? "border-[#d8b76d]/45 bg-[#d8b76d]/10" : "border-white/[.08] bg-white/[.045]"}`}><p className={`text-[9px] font-black uppercase tracking-[.18em] ${active ? "text-[#d8b76d]" : "text-stone-500"}`}>Round {seat.round_number}{active ? " · Now" : ""}</p><p className="mt-1 font-serif text-2xl font-bold text-[#efd89e]">Table {seat.table_number}</p></motion.div> })}</div>
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-300/10 bg-emerald-300/[.05] p-3"><Navigation size={17} className="mt-0.5 shrink-0 text-emerald-300" /><p className="text-[11px] leading-relaxed text-emerald-100/65">Take a photo of this pass. Your guest number stays the same all night.</p></div>
          </div>
        </motion.div>
        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]"><p className="flex items-center gap-2 rounded-2xl border border-white/[.07] bg-white/[.025] px-4 py-3 text-xs leading-relaxed text-stone-500"><Camera size={17} className="shrink-0 text-[#d8b76d]" /> Show this on screen for a photo, or download the branded PNG.</p><button type="button" onClick={async () => { try { await downloadSeatPass(event, person, seats, activeRound); toast.success("Seat pass downloaded") } catch (error: any) { toast.error(error.message) } }} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#d8ba79] px-5 text-xs font-black text-[#17130c]"><ImageDown size={17} /> Download PNG</button></div>
      </div>
    </Modal>
  )
}

function VisualTable({ tableNumber, roundNumber, seats, attendees, onGuest }: { tableNumber: number; roundNumber: number; seats: Seat[]; attendees: Attendee[]; onGuest: (person: Attendee) => void }) {
  const reduceMotion = useReducedMotion()
  const assigned = seats.map(seat => ({ seat, person: attendees.find(person => person.id === seat.attendee_id) })).filter(item => item.person) as Array<{ seat: Seat; person: Attendee }>
  const useOrbit = assigned.length <= 6
  const women = assigned.filter(item => item.person.gender === "female").length
  const men = assigned.filter(item => item.person.gender === "male").length
  return (
    <motion.section layout initial={{ opacity: 0, y: reduceMotion ? 0 : 18, scale: reduceMotion ? 1 : 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.35, delay: tableNumber * 0.035 }} className="group relative overflow-hidden rounded-[2rem] border border-white/[.085] bg-gradient-to-b from-white/[.055] to-white/[.025] shadow-2xl shadow-black/25">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(214,181,109,.11),transparent_38%)] opacity-70 transition group-hover:opacity-100" />
      <header className="relative flex items-center justify-between border-b border-white/[.07] px-5 py-4"><div><p className="text-[9px] font-black uppercase tracking-[.22em] text-[#aa8c52]">Round {roundNumber}</p><h4 className="mt-1 font-serif text-xl font-bold text-white">Table {tableNumber}</h4></div><div className="flex gap-1.5"><Pill className="border-rose-300/10 bg-rose-300/[.05] text-rose-100">{women}W</Pill><Pill className="border-sky-300/10 bg-sky-300/[.05] text-sky-100">{men}M</Pill></div></header>
      {assigned.length === 0 ? <div className="relative flex h-64 items-center justify-center text-sm text-stone-700">No guests assigned</div> : useOrbit ? (
        <div className="relative mx-auto h-[390px] max-w-[420px]">
          <motion.div animate={reduceMotion ? undefined : { boxShadow: ["0 0 0 0 rgba(216,183,109,.08)", "0 0 0 18px rgba(216,183,109,0)"] }} transition={{ duration: 2.8, repeat: Infinity }} className="absolute left-1/2 top-1/2 flex h-36 w-36 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-[#d8b76d]/35 bg-gradient-to-br from-[#292318] to-[#100f0c] shadow-[0_24px_65px_rgba(0,0,0,.55)]"><Table2 size={20} className="text-[#d8b76d]" /><span className="mt-2 text-[9px] font-black uppercase tracking-[.2em] text-stone-500">Table</span><span className="font-serif text-5xl font-bold leading-none text-[#f0d89d]">{tableNumber}</span></motion.div>
          {assigned.map(({ seat, person }, index) => { const angle = -Math.PI / 2 + (Math.PI * 2 * index) / assigned.length; const left = 50 + Math.cos(angle) * 32; const top = 50 + Math.sin(angle) * 39; return <motion.button type="button" key={seat.id} onClick={() => onGuest(person)} aria-label={`Open seat pass for guest ${person.attendee_number}`} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: reduceMotion ? 0 : 0.12 + index * 0.055 }} whileHover={reduceMotion ? undefined : { scale: 1.06 }} whileTap={{ scale: 0.97 }} style={{ left: `${left}%`, top: `${top}%` }} className="absolute flex min-h-14 w-[104px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border border-white/[.1] bg-[#181713]/95 p-2 text-center shadow-xl backdrop-blur-xl hover:border-[#d8b76d]/40 sm:w-32"><span><span className="block font-serif text-2xl font-black text-[#e7ca88]">#{guestNumber(person.attendee_number)}</span><span className={`mt-0.5 block text-[9px] font-bold ${person.gender === "female" ? "text-rose-200/55" : "text-sky-200/55"}`}>{person.gender === "female" ? "Woman" : "Man"}</span></span></motion.button> })}
        </div>
      ) : (
        <div className="relative p-5"><div className="mx-auto flex h-28 w-28 flex-col items-center justify-center rounded-full border border-[#d8b76d]/35 bg-[#211d15]"><span className="text-[9px] font-black uppercase tracking-[.2em] text-stone-500">Table</span><span className="font-serif text-4xl font-bold text-[#efd89e]">{tableNumber}</span></div><div className="mt-5 grid grid-cols-2 gap-2">{assigned.map(({ seat, person }, index) => <motion.button type="button" key={seat.id} onClick={() => onGuest(person)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }} className="flex min-h-12 items-center justify-center rounded-xl border border-white/[.08] bg-white/[.035] p-2 font-serif text-lg font-black text-[#e7ca88]">#{guestNumber(person.attendee_number)}</motion.button>)}</div></div>
      )}
      <footer className="relative border-t border-white/[.06] px-5 py-3 text-center text-[10px] font-bold text-stone-600"><Camera size={12} className="mr-1.5 inline text-[#a78a52]" /> Tap a guest number for their photo pass</footer>
    </motion.section>
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
  const [seatPassGuest, setSeatPassGuest] = useState<Attendee | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [eventMenu, setEventMenu] = useState(false)
  const [round, setRound] = useState(1)
  const [eventDraft, setEventDraft] = useState({ minimum_attendees: 20, table_count: 5, round_count: 3 })

  const installBundle = (next: Bundle) => {
    setBundle(next)
    setEventDraft({ minimum_attendees: next.event.minimum_attendees, table_count: next.event.table_count, round_count: next.event.round_count })
    setRound(value => Math.min(value, next.event.round_count))
    setEvents(current => current.some(event => event.id === next.event.id) ? current.map(event => event.id === next.event.id ? next.event : event) : [next.event, ...current])
  }

  const loadEvents = async () => {
    const data = await roomApi("list-events")
    setEvents(data.events || [])
    if (!bundle && data.events?.[0]) installBundle(await roomApi("get-event", { event_id: data.events[0].id }))
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
    if (preview) { toast("Preview mode — no data was changed", { icon: "✦" }); return DEMO_BUNDLE }
    setBusy(true)
    try {
      const data = await roomApi(action, payload)
      if (data?.event) installBundle(data)
      return data
    } catch (error: any) {
      if (error.status === 401) { setAuthenticated(false); setBundle(null) }
      toast.error(error.message)
      throw error
    } finally { setBusy(false) }
  }

  const login = async (key: string) => {
    try { await roomApi("login", { key }); setAuthenticated(true); await loadEvents(); toast.success("Welcome to The Room") }
    catch (error: any) { toast.error(error.message); throw error }
  }

  const refresh = async () => {
    if (!bundle || preview) return
    setRefreshing(true)
    try { installBundle(await roomApi("get-event", { event_id: bundle.event.id })) }
    catch (error: any) { toast.error(error.message) }
    finally { setRefreshing(false) }
  }

  const attendees = bundle?.attendees || []
  const included = attendees.filter(person => person.included_in_schedule && ["registered", "confirmed"].includes(person.attendance_status))
  const genderCounts = useMemo(() => included.reduce((counts, person) => {
    if (person.gender === "female") counts.women += 1
    if (person.gender === "male") counts.men += 1
    return counts
  }, { women: 0, men: 0 }), [included])
  const nextNumber = attendees.reduce((maximum, person) => Math.max(maximum, person.attendee_number), 0) + 1
  const draftIsEven = eventDraft.minimum_attendees >= 2 && eventDraft.minimum_attendees % 2 === 0
  const enoughForTables = eventDraft.minimum_attendees >= eventDraft.table_count * 2

  if (!authenticated) return <><Toaster position="top-center" /><LoginScreen onLogin={login} checking={checking} configured={configured} /></>
  if (!bundle && checking) return <main className="flex min-h-[100dvh] items-center justify-center bg-[#080807] text-[#d9bb7c]"><Loader2 className="animate-spin" size={28} /></main>

  const event = bundle?.event
  return (
    <main className="the-room-page min-h-[100dvh] overflow-x-clip bg-[#080807] text-stone-100 selection:bg-[#c9a968]/30" style={{ backgroundImage: "radial-gradient(circle at 10% 0%, rgba(143,108,50,.13), transparent 26%), radial-gradient(circle at 92% 18%, rgba(39,89,72,.12), transparent 24%)" }}>
      <Toaster position="top-center" toastOptions={{ style: { background: "#1b1915", color: "#f5f5f4", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16 } }} />
      <AnimatePresence>{event && seatPassGuest && bundle?.schedule && <SeatPassModal event={event} person={seatPassGuest} seats={bundle.seats} activeRound={round} onClose={() => setSeatPassGuest(null)} />}</AnimatePresence>
      <header className="sticky top-0 z-40 border-b border-white/[0.065] bg-[#080807]/88 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#d9bb7c]/25 bg-[#d9bb7c]/[0.08] text-[#e4ca91]"><DoorOpen size={21} /></div><div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate font-serif text-xl font-semibold tracking-tight">The Room</h1>{preview && <Pill className="border-violet-300/20 bg-violet-300/10 text-violet-200">Preview</Pill>}</div><p className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-stone-600">Numbered seating studio</p></div></div>
          <div className="flex items-center gap-2"><button onClick={refresh} disabled={refreshing || preview} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.035] text-stone-500 hover:text-white disabled:opacity-40" aria-label="Refresh"><RefreshCw size={17} className={refreshing ? "animate-spin" : ""} /></button><button onClick={async () => { if (!preview) await roomApi("logout"); setAuthenticated(false); setBundle(null) }} className="hidden min-h-11 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-4 text-xs font-bold text-stone-500 hover:text-white sm:flex"><LogOut size={15} /> Sign out</button></div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-12 pt-5 sm:px-6 lg:px-8">
        {!event ? (
          <div className="flex min-h-[72dvh] items-center justify-center"><Panel className="max-w-lg p-8 text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[#c9a968]/10 text-[#d9bb7c]"><DoorOpen size={28} /></div><h2 className="mt-5 text-2xl font-black">Open the first room</h2><p className="mt-2 text-sm leading-relaxed text-stone-500">Choose the people, tables, and rounds. The balanced numbered roster is created for you.</p><button onClick={() => setCreateOpen(true)} className="mt-6 min-h-12 rounded-2xl bg-[#d7ba7d] px-6 font-black text-[#17130c]"><Plus size={17} className="mr-2 inline" /> New event</button></Panel></div>
        ) : (
          <div className="space-y-5">
            <section className="relative overflow-visible rounded-[2rem] border border-[#d9bb7c]/15 bg-gradient-to-br from-[#1c1913] via-[#11100e] to-[#0b1110] p-5 shadow-[0_30px_100px_rgba(0,0,0,.4)] sm:p-7">
              <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#b58d47]/10 blur-[80px]" />
              <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
                <div><div className="flex flex-wrap items-center gap-2"><Pill className="border-[#d9bb7c]/20 bg-[#d9bb7c]/[0.07] text-[#e4ca91]"><Hash size={12} /> Event {event.event_number}</Pill><Pill className="border-emerald-300/15 bg-emerald-300/[0.06] text-emerald-200"><CheckCircle2 size={12} /> {included.length} guests ready</Pill></div><h2 className="mt-4 font-serif text-4xl font-semibold tracking-[-0.04em] text-white sm:text-6xl">The Room <span className="text-[#d9bb7c]">#{event.event_number}</span></h2><p className="mt-3 max-w-2xl text-sm leading-relaxed text-stone-500">One continuous flow: set the room, confirm the numbers, generate the seating.</p></div>
                <div className="relative flex gap-2"><button onClick={() => setEventMenu(value => !value)} className="flex min-h-12 min-w-40 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm font-black"><span>Event {event.event_number}</span><ChevronDown size={16} className="text-stone-600" /></button><button onClick={() => setCreateOpen(true)} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#d7ba7d] text-[#17130c]" aria-label="New event"><Plus size={19} /></button>{eventMenu && <div className="absolute right-14 top-14 z-30 w-60 overflow-hidden rounded-2xl border border-white/10 bg-[#181612] p-2 shadow-2xl">{events.map(item => <button key={item.id} onClick={async () => { setEventMenu(false); if (item.id !== event.id) installBundle(preview ? DEMO_BUNDLE : await roomApi("get-event", { event_id: item.id })) }} className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-sm ${item.id === event.id ? "bg-[#c9a968]/10 text-[#e4ca91]" : "text-stone-400 hover:bg-white/[0.05]"}`}><span>The Room</span><span className="ml-3 text-[10px]">#{item.event_number}</span></button>)}</div>}</div>
              </div>
            </section>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard label="People" value={included.length} detail={`Numbers 01–${guestNumber(nextNumber - 1)}`} accent="bg-emerald-500/10" />
              <MetricCard label="Balance" value={`${genderCounts.women} / ${genderCounts.men}`} detail="Women / men" accent="bg-rose-500/10" />
              <MetricCard label="Tables" value={event.table_count} detail={`${Math.floor(included.length / event.table_count)}–${Math.ceil(included.length / event.table_count)} per table`} accent="bg-[#d9bb7c]/10" />
              <MetricCard label="Rounds" value={event.round_count} detail="No repeat meetings" accent="bg-violet-500/10" />
            </div>

            <Panel className="overflow-hidden">
              <header className="flex items-start gap-3 border-b border-white/[0.07] p-5 sm:p-6"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#d9bb7c]/10 text-[#e4ca91]"><span className="font-serif text-lg font-black">1</span></div><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#c9a968]">Room setup</p><h3 className="mt-1 text-xl font-black">People, tables, rounds</h3><p className="mt-1 text-xs leading-relaxed text-stone-600">Increasing the minimum creates the missing guest numbers automatically. Lowering it never deletes existing guests.</p></div></header>
              <div className="p-5 sm:p-6">
                <div className="grid grid-cols-3 gap-3 sm:gap-4">
                  <Field label="People"><input className={inputClass} type="number" min="2" max="500" step="2" value={eventDraft.minimum_attendees} onChange={change => setEventDraft(current => ({ ...current, minimum_attendees: Number(change.target.value) }))} /></Field>
                  <Field label="Tables"><input className={inputClass} type="number" min="1" max="50" value={eventDraft.table_count} onChange={change => setEventDraft(current => ({ ...current, table_count: Number(change.target.value) }))} /></Field>
                  <Field label="Rounds"><input className={inputClass} type="number" min="1" max="20" value={eventDraft.round_count} onChange={change => setEventDraft(current => ({ ...current, round_count: Number(change.target.value) }))} /></Field>
                </div>
                {!draftIsEven && <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-xs text-amber-100/75">Use an even minimum for a 50/50 starting roster.</p>}
                {!enoughForTables && <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-xs text-amber-100/75">Each table needs at least two guests.</p>}
                <button onClick={async () => { try { await act("update-event", { ...eventDraft, event_id: event.id }); toast.success("Room setup saved") } catch {} }} disabled={busy || !draftIsEven || !enoughForTables} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[#d9bb7c]/25 bg-[#d9bb7c]/10 font-black text-[#e4ca91] disabled:opacity-40">{busy ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />} Save setup</button>
              </div>
            </Panel>

            <Panel className="overflow-hidden">
              <header className="border-b border-white/[0.07] p-5 sm:p-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#d9bb7c]/10 text-[#e4ca91]"><span className="font-serif text-lg font-black">2</span></div><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#c9a968]">Numbered people</p><h3 className="mt-1 text-xl font-black">The complete roster</h3><p className="mt-1 text-xs leading-relaxed text-stone-600">No names needed. Choose a gender only when adding someone new; tap Woman or Man below to correct any guest.</p></div></div>
                  <div className="grid grid-cols-2 gap-2 sm:flex"><button onClick={async () => { try { const data = await act("add-attendee", { event_id: event.id, gender: "female" }); const added = data?.attendees?.at(-1); toast.success(`Guest #${guestNumber(added?.attendee_number || nextNumber)} added`) } catch {} }} disabled={busy} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-rose-300/15 bg-rose-300/[0.07] px-4 text-xs font-black text-rose-100 disabled:opacity-40"><Plus size={15} /> Woman #{guestNumber(nextNumber)}</button><button onClick={async () => { try { const data = await act("add-attendee", { event_id: event.id, gender: "male" }); const added = data?.attendees?.at(-1); toast.success(`Guest #${guestNumber(added?.attendee_number || nextNumber)} added`) } catch {} }} disabled={busy} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-sky-300/15 bg-sky-300/[0.07] px-4 text-xs font-black text-sky-100 disabled:opacity-40"><Plus size={15} /> Man #{guestNumber(nextNumber)}</button></div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-2xl border border-rose-300/10 bg-rose-300/[0.045] px-4 py-3"><p className="text-2xl font-black text-rose-100">{genderCounts.women}</p><p className="text-[10px] font-bold uppercase tracking-wider text-rose-200/45">Women</p></div><div className="rounded-2xl border border-sky-300/10 bg-sky-300/[0.045] px-4 py-3"><p className="text-2xl font-black text-sky-100">{genderCounts.men}</p><p className="text-[10px] font-bold uppercase tracking-wider text-sky-200/45">Men</p></div></div>
              </header>
              <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:p-5 lg:grid-cols-4 xl:grid-cols-5">
                {attendees.map((person, index) => (
                  <motion.article layout key={person.id} initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : Math.min(index * 0.018, 0.3) }} className="overflow-hidden rounded-[1.4rem] border border-white/[0.08] bg-gradient-to-br from-white/[0.055] to-white/[0.025] p-3 shadow-lg shadow-black/10">
                    <div className="flex items-start justify-between gap-2"><div><p className="text-[9px] font-black uppercase tracking-[.18em] text-stone-600">Guest</p><p className="mt-1 font-serif text-4xl font-black leading-none text-[#efd89e]">#{guestNumber(person.attendee_number)}</p></div><span className={`h-2.5 w-2.5 rounded-full ${person.gender === "female" ? "bg-rose-300 shadow-[0_0_16px_rgba(253,164,175,.45)]" : "bg-sky-300 shadow-[0_0_16px_rgba(125,211,252,.45)]"}`} /></div>
                    <div className="mt-4 grid grid-cols-2 rounded-xl border border-white/[0.07] bg-black/20 p-1"><button onClick={async () => { if (person.gender === "female") return; try { await act("set-attendee-gender", { event_id: event.id, attendee_id: person.id, gender: "female" }) } catch {} }} disabled={busy} className={`min-h-9 rounded-lg text-[10px] font-black transition ${person.gender === "female" ? "bg-rose-300/15 text-rose-100" : "text-stone-700 hover:text-stone-400"}`}>Woman</button><button onClick={async () => { if (person.gender === "male") return; try { await act("set-attendee-gender", { event_id: event.id, attendee_id: person.id, gender: "male" }) } catch {} }} disabled={busy} className={`min-h-9 rounded-lg text-[10px] font-black transition ${person.gender === "male" ? "bg-sky-300/15 text-sky-100" : "text-stone-700 hover:text-stone-400"}`}>Man</button></div>
                  </motion.article>
                ))}
              </div>
            </Panel>

            <Panel id="room-map" className="overflow-hidden">
              <header className="p-5 sm:p-6">
                <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
                  <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#d9bb7c]/10 text-[#e4ca91]"><span className="font-serif text-lg font-black">3</span></div><div><div className="flex items-center gap-2"><Pill className={bundle.schedule ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200" : "border-stone-400/15 bg-stone-400/[0.06] text-stone-400"}>{bundle.schedule ? <CheckCircle2 size={12} /> : <Sparkles size={12} />}{bundle.schedule ? "Validated schedule" : "Ready to generate"}</Pill></div><h3 className="mt-2 text-2xl font-black">{bundle.schedule ? "The live room map" : "Create the seating"}</h3><p className="mt-1 max-w-2xl text-xs leading-relaxed text-stone-500">{bundle.schedule ? `${bundle.schedule.participant_count} numbered guests · ${bundle.schedule.round_count} rounds · balanced tables · no repeated meetings` : `${included.length} numbered guests will be placed across ${event.table_count} tables for ${event.round_count} rounds.`}</p></div></div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">{bundle.schedule && <div className="relative min-w-56 flex-1 sm:flex-none"><Camera size={15} className="pointer-events-none absolute left-4 top-4 text-[#c9a968]" /><select aria-label="Open a guest seat pass" value="" onChange={change => { const person = attendees.find(attendee => attendee.id === change.target.value); if (person) setSeatPassGuest(person) }} className="min-h-12 w-full appearance-none rounded-2xl border border-[#d9bb7c]/20 bg-[#d9bb7c]/[.06] pl-10 pr-10 text-xs font-black text-[#e4ca91] outline-none"><option value="">Open guest pass…</option>{attendees.filter(person => bundle.seats.some(seat => seat.attendee_id === person.id)).map(person => <option key={person.id} value={person.id}>Guest #{guestNumber(person.attendee_number)}</option>)}</select><ChevronDown size={15} className="pointer-events-none absolute right-4 top-4 text-[#9f854f]" /></div>}<button onClick={() => window.print()} disabled={!bundle.schedule} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/[0.09] bg-white/[0.035] px-4 text-xs font-black text-stone-400 disabled:opacity-30"><Download size={16} /> Print map</button><button onClick={async () => { try { await act("generate-schedule", { event_id: event.id }); toast.success("Balanced seating is ready"); window.setTimeout(() => document.getElementById("room-map")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }), 80) } catch {} }} disabled={busy || included.length < event.minimum_attendees} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#c4a565] to-[#ead096] px-5 text-xs font-black text-[#17130c] disabled:cursor-not-allowed disabled:opacity-35">{busy ? <Loader2 size={17} className="animate-spin" /> : <WandSparkles size={17} />} {bundle.schedule ? "Regenerate" : "Generate seating"}</button></div>
                </div>
              </header>

              {bundle.schedule && (
                <div className="border-t border-white/[0.07] p-4 sm:p-5">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><MetricCard label="Repeat pairs" value={bundle.schedule.metrics.repeatPairCount ?? 0} detail="Hard validation" accent="bg-emerald-500/10" /><MetricCard label="Unique meetings" value={bundle.schedule.metrics.uniquePairCount ?? "—"} detail="Across the evening" accent="bg-[#d9bb7c]/10" /><MetricCard label="Gender spread" value={`≤${bundle.schedule.metrics.genderSpreadMax ?? 1}`} detail="Per table" accent="bg-sky-500/10" /><MetricCard label="Per guest" value={bundle.schedule.metrics.averageMeetingsPerAttendee ?? "—"} detail="New people met" accent="bg-violet-500/10" /></div>
                  <div className="mt-5 rounded-[1.5rem] border border-white/[0.07] bg-black/15 p-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#c9a968]">Live floor plan</p><h3 className="mt-1 text-xl font-black">Round {round}</h3><p className="mt-1 text-xs text-stone-600">Tap any guest number to open their complete photo pass.</p></div><div className="flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{Array.from({ length: event.round_count }, (_, index) => index + 1).map(value => <button key={value} onClick={() => setRound(value)} className={`flex min-h-12 min-w-28 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-black transition ${round === value ? "border-[#d9bb7c]/35 bg-[#d9bb7c]/12 text-[#efd89e] shadow-[0_10px_35px_rgba(201,169,104,.1)]" : "border-white/[0.07] bg-white/[0.025] text-stone-600"}`}><span className={`flex h-7 w-7 items-center justify-center rounded-full ${round === value ? "bg-[#d9bb7c] text-[#17130c]" : "bg-white/[.05]"}`}>{value}</span> Round</button>)}</div></div></div>
                  <AnimatePresence mode="wait"><motion.div key={round} initial={{ opacity: 0, x: reduceMotion ? 0 : 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduceMotion ? 0 : -18 }} className="the-room-schedule-grid mt-5 grid gap-5 xl:grid-cols-2">{Array.from({ length: event.table_count }, (_, index) => index + 1).map(tableNumber => <VisualTable key={tableNumber} tableNumber={tableNumber} roundNumber={round} seats={bundle.seats.filter(seat => seat.round_number === round && seat.table_number === tableNumber)} attendees={attendees} onGuest={setSeatPassGuest} />)}</motion.div></AnimatePresence>
                </div>
              )}
            </Panel>
          </div>
        )}
      </div>

      <AnimatePresence>{createOpen && <CreateEventModal suggestedNumber={Math.max(0, ...events.map(item => item.event_number)) + 1} busy={busy} onClose={() => setCreateOpen(false)} onCreate={async values => { try { const data = await act("create-event", values); if (data) { setCreateOpen(false); toast.success(`Event ${data.event.event_number} created with ${data.attendees.length} numbered guests`) } } catch {} }} />}</AnimatePresence>
    </main>
  )
}
