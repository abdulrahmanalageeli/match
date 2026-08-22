import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import toast, { Toaster } from "react-hot-toast"
import {
  CalendarDays, Camera, Check, CheckCircle2, ChevronDown, CircleDollarSign,
  CreditCard, DoorOpen, Download, Edit3, Eye, EyeOff, Filter,
  Gem, Grid2X2, Hash, LayoutDashboard, Loader2, LockKeyhole, LogOut, MapPin,
  ImageDown, Navigation, Plus, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Table2,
  TicketCheck, UserCheck, Users, WandSparkles, X,
} from "lucide-react"

export const meta = () => [
  { title: "The Room — Event Studio" },
  { name: "description", content: "Premium repeat-free event seating and payment operations for The Room." },
]

type EventStatus = "draft" | "registration" | "ready" | "live" | "completed" | "cancelled"
type PaymentStatus = "pending" | "partial" | "paid" | "waived" | "refunded"
type Gender = "male" | "female" | "nonbinary" | "unspecified"

type RoomEvent = {
  id: string; event_number: number; name: string; starts_at: string | null; venue: string | null
  status: EventStatus; minimum_attendees: number; table_count: number; round_count: number
  ticket_price: number; currency: string; notes: string | null; created_at: string; updated_at: string
}
type Attendee = {
  id: string; event_id: string; attendee_number: number; full_name: string; phone_e164: string | null
  gender: Gender; attendance_status: "registered" | "confirmed" | "waitlist" | "cancelled"
  included_in_schedule: boolean; checked_in: boolean; payment_status: PaymentStatus
  amount_due: number; amount_paid: number; paid_at: string | null; notes: string | null
}
type ScheduleRun = {
  id: string; event_id: string; seed: string; algorithm_version: string; participant_count: number
  table_count: number; round_count: number; metrics: {
    repeatPairCount?: number; uniquePairCount?: number; genderSpreadMax?: number
    minMeetingsPerAttendee?: number; maxMeetingsPerAttendee?: number; averageMeetingsPerAttendee?: number
  }; generated_at: string
}
type Seat = { id: number; schedule_run_id: string; event_id: string; round_number: number; table_number: number; seat_number: number; attendee_id: string }
type Bundle = { event: RoomEvent; attendees: Attendee[]; schedule: ScheduleRun | null; seats: Seat[]; payments: any[] }

const statusCopy: Record<EventStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "border-slate-400/20 bg-slate-400/10 text-slate-200" },
  registration: { label: "Registration", cls: "border-sky-400/20 bg-sky-400/10 text-sky-200" },
  ready: { label: "Ready", cls: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" },
  live: { label: "Live", cls: "border-amber-400/25 bg-amber-400/10 text-amber-100" },
  completed: { label: "Completed", cls: "border-violet-400/20 bg-violet-400/10 text-violet-200" },
  cancelled: { label: "Cancelled", cls: "border-rose-400/20 bg-rose-400/10 text-rose-200" },
}
const paymentCopy: Record<PaymentStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "border-amber-300/20 bg-amber-300/10 text-amber-100" },
  partial: { label: "Partial", cls: "border-sky-300/20 bg-sky-300/10 text-sky-100" },
  paid: { label: "Paid", cls: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100" },
  waived: { label: "Waived", cls: "border-violet-300/20 bg-violet-300/10 text-violet-100" },
  refunded: { label: "Refunded", cls: "border-rose-300/20 bg-rose-300/10 text-rose-100" },
}
const genderCopy: Record<Gender, string> = { male: "Man", female: "Woman", nonbinary: "Non-binary", unspecified: "Not set" }

const names = ["Lina", "Omar", "Sarah", "Faisal", "Noura", "Khalid", "Maya", "Saad", "Reem", "Yousef", "Dana", "Majed", "Hala", "Tariq", "Jana", "Ziad", "Rana", "Nawaf", "Lama", "Adel"]
const demoAttendees: Attendee[] = names.map((name, index) => ({
  id: `demo-${index + 1}`, event_id: "demo-event", attendee_number: index + 1, full_name: name,
  phone_e164: `+96650000${String(index + 1).padStart(3, "0")}`, gender: index % 2 ? "male" : "female",
  attendance_status: "confirmed", included_in_schedule: true, checked_in: index < 14,
  payment_status: index < 13 ? "paid" : index < 16 ? "partial" : "pending",
  amount_due: 180, amount_paid: index < 13 ? 180 : index < 16 ? 90 : 0, paid_at: index < 13 ? new Date().toISOString() : null, notes: null,
}))
function demoSeats() {
  const seats: Seat[] = []
  let id = 1
  for (let round = 0; round < 3; round += 1) {
    for (let group = 0; group < 5; group += 1) {
      for (let position = 0; position < 4; position += 1) {
        const table = round === 0 ? group : (group + round * position) % 5
        seats.push({ id: id++, schedule_run_id: "demo-run", event_id: "demo-event", round_number: round + 1, table_number: table + 1, seat_number: position + 1, attendee_id: `demo-${group * 4 + position + 1}` })
      }
    }
  }
  return seats
}
const DEMO_BUNDLE: Bundle = {
  event: { id: "demo-event", event_number: 12, name: "The Room — Founders' Night", starts_at: "2026-09-12T17:30:00.000Z", venue: "JAX District, Riyadh", status: "ready", minimum_attendees: 20, table_count: 5, round_count: 3, ticket_price: 180, currency: "SAR", notes: "Doors open 30 minutes before the first round.", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  attendees: demoAttendees,
  schedule: { id: "demo-run", event_id: "demo-event", seed: "the-room-event-12", algorithm_version: "the-room-social-table-v1", participant_count: 20, table_count: 5, round_count: 3, metrics: { repeatPairCount: 0, uniquePairCount: 90, genderSpreadMax: 0, minMeetingsPerAttendee: 9, maxMeetingsPerAttendee: 9, averageMeetingsPerAttendee: 9 }, generated_at: new Date().toISOString() },
  seats: demoSeats(), payments: [],
}

async function roomApi(action: string, payload: Record<string, unknown> = {}) {
  const response = await fetch("/api/the-room", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) })
  const data = await response.json().catch(() => ({ error: "The Room returned an invalid response" }))
  if (!response.ok) throw Object.assign(new Error(data.error || "Request failed"), { status: response.status, code: data.code, details: data.details })
  return data
}

function currency(value: number, code = "SAR") {
  return new Intl.NumberFormat("en-SA", { style: "currency", currency: code, maximumFractionDigits: 0 }).format(Number(value || 0))
}

function dateLabel(value: string | null) {
  if (!value) return "Date not set"
  return new Intl.DateTimeFormat("en-SA", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value))
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[1.75rem] border border-white/[0.08] bg-white/[0.045] shadow-2xl shadow-black/20 backdrop-blur-xl ${className}`}>{children}</section>
}

function Pill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-bold ${className}`}>{children}</span>
}

function MetricCard({ icon: Icon, label, value, detail, accent }: { icon: any; label: string; value: string | number; detail: string; accent: string }) {
  return (
    <Panel className="relative overflow-hidden p-4 sm:p-5">
      <div className={`absolute -right-8 -top-8 h-24 w-24 rounded-full blur-3xl ${accent}`} />
      <div className="relative flex items-start justify-between gap-3">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-stone-500">{label}</p><p className="mt-2 text-2xl font-black tracking-tight text-stone-50">{value}</p><p className="mt-1 text-xs text-stone-500">{detail}</p></div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-[#d9bb7c]"><Icon size={18} /></div>
      </div>
    </Panel>
  )
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="block"><span className="mb-2 block text-xs font-bold text-stone-300">{label}</span>{children}{hint && <span className="mt-1.5 block text-[11px] leading-relaxed text-stone-600">{hint}</span>}</label>
}

function Modal({ title, eyebrow, onClose, children, wide = false }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <motion.div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 p-0 backdrop-blur-md sm:items-center sm:p-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.div role="dialog" aria-modal="true" aria-label={title} initial={{ y: 40, opacity: 0, scale: 0.97 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0 }} onMouseDown={event => event.stopPropagation()} className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-[2rem] border border-white/10 bg-[#11100f] shadow-2xl shadow-black/70 sm:rounded-[2rem] ${wide ? "max-w-2xl" : "max-w-lg"}`}>
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
const selectClass = `${inputClass} appearance-none pr-10`

function LoginScreen({ onLogin, checking, configured }: { onLogin: (key: string) => Promise<void>; checking: boolean; configured: boolean }) {
  const [key, setKey] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#080807] px-5 py-10 text-white">
      <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "radial-gradient(circle at 18% 12%, rgba(178,139,68,.18), transparent 28%), radial-gradient(circle at 82% 80%, rgba(48,94,76,.2), transparent 34%)" }} />
      <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)", backgroundSize: "54px 54px" }} />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md">
        <div className="mb-8 text-center"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[1.75rem] border border-[#d9bb7c]/30 bg-gradient-to-br from-[#2a251b] to-[#11100d] shadow-[0_20px_70px_rgba(201,169,104,.18)]"><DoorOpen size={34} className="text-[#e4ca91]" /></div><p className="mt-6 text-[11px] font-black uppercase tracking-[0.36em] text-[#c9a968]">Private event studio</p><h1 className="mt-2 font-serif text-5xl font-semibold tracking-[-0.04em] text-stone-50">The Room</h1><p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-stone-500">Every table is intentional. Every introduction is new.</p></div>
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

function GuestModal({ event, guest, onClose, onSave, busy }: { event: RoomEvent; guest: Attendee | null; onClose: () => void; onSave: (values: any) => Promise<void>; busy: boolean }) {
  const [values, setValues] = useState({
    full_name: guest?.full_name || "", phone_e164: guest?.phone_e164 || "", gender: guest?.gender || "unspecified",
    attendance_status: guest?.attendance_status || "registered", included_in_schedule: guest?.included_in_schedule ?? true,
    checked_in: guest?.checked_in ?? false, amount_due: guest?.amount_due ?? event.ticket_price, notes: guest?.notes || "",
  })
  const set = (key: string, value: any) => setValues(current => ({ ...current, [key]: value }))
  return <Modal title={guest ? "Edit guest" : "Add a guest"} eyebrow={`Event ${event.event_number}`} onClose={onClose}>
    <form onSubmit={async eventForm => { eventForm.preventDefault(); await onSave(values) }} className="space-y-5 p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Full name"><input className={inputClass} value={values.full_name} onChange={e => set("full_name", e.target.value)} required placeholder="Guest name" /></Field><Field label="Phone"><input className={inputClass} value={values.phone_e164} onChange={e => set("phone_e164", e.target.value)} inputMode="tel" placeholder="+9665XXXXXXXX" /></Field></div>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Gender balance"><div className="relative"><select className={selectClass} value={values.gender} onChange={e => set("gender", e.target.value)}>{Object.entries(genderCopy).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-4 top-4 text-stone-600" size={16} /></div></Field><Field label="Attendance"><div className="relative"><select className={selectClass} value={values.attendance_status} onChange={e => set("attendance_status", e.target.value)}><option value="registered">Registered</option><option value="confirmed">Confirmed</option><option value="waitlist">Waitlist</option><option value="cancelled">Cancelled</option></select><ChevronDown className="pointer-events-none absolute right-4 top-4 text-stone-600" size={16} /></div></Field></div>
      <Field label={`Amount due (${event.currency})`}><input className={inputClass} type="number" min="0" step="1" value={values.amount_due} onChange={e => set("amount_due", Number(e.target.value))} /></Field>
      <div className="grid gap-3 sm:grid-cols-2"><label className="flex min-h-14 cursor-pointer items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 text-sm font-bold text-stone-300"><span className="flex items-center gap-2"><Table2 size={16} className="text-[#d9bb7c]" /> Include in seating</span><input type="checkbox" checked={values.included_in_schedule} onChange={e => set("included_in_schedule", e.target.checked)} className="h-5 w-5 accent-[#c9a968]" /></label><label className="flex min-h-14 cursor-pointer items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 text-sm font-bold text-stone-300"><span className="flex items-center gap-2"><UserCheck size={16} className="text-emerald-300" /> Checked in</span><input type="checkbox" checked={values.checked_in} onChange={e => set("checked_in", e.target.checked)} className="h-5 w-5 accent-emerald-400" /></label></div>
      <Field label="Private note"><textarea className={`${inputClass} min-h-24 resize-y py-3`} value={values.notes} onChange={e => set("notes", e.target.value)} placeholder="Accessibility, arrival, or host notes…" /></Field>
      <button disabled={busy} className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#d7ba7d] font-black text-[#17130c] disabled:opacity-50">{busy ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />} Save guest</button>
    </form>
  </Modal>
}

function PaymentModal({ guest, event, onClose, onSave, busy }: { guest: Attendee; event: RoomEvent; onClose: () => void; onSave: (values: any) => Promise<void>; busy: boolean }) {
  const [status, setStatus] = useState<PaymentStatus>(guest.payment_status)
  const [amount, setAmount] = useState(guest.amount_paid)
  const [note, setNote] = useState("")
  return <Modal title="Record payment" eyebrow={guest.full_name} onClose={onClose}>
    <form onSubmit={async e => { e.preventDefault(); await onSave({ payment_status: status, amount_paid: amount, note }) }} className="space-y-5 p-5 sm:p-6">
      <div className="rounded-2xl border border-[#c9a968]/15 bg-[#c9a968]/[0.06] p-4"><div className="flex items-center justify-between"><span className="text-xs text-stone-500">Amount due</span><span className="font-black text-stone-100">{currency(guest.amount_due, event.currency)}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/30"><div className="h-full rounded-full bg-gradient-to-r from-[#a8874e] to-[#e4ca91]" style={{ width: `${Math.min(100, guest.amount_due ? (amount / guest.amount_due) * 100 : 100)}%` }} /></div></div>
      <Field label="Payment status"><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{(["pending", "partial", "paid", "waived", "refunded"] as PaymentStatus[]).map(value => <button type="button" key={value} onClick={() => { setStatus(value); if (value === "paid") setAmount(guest.amount_due); if (value === "pending" || value === "waived") setAmount(0) }} className={`min-h-11 rounded-xl border text-xs font-bold transition ${status === value ? paymentCopy[value].cls : "border-white/[0.07] bg-white/[0.025] text-stone-500"}`}>{paymentCopy[value].label}</button>)}</div></Field>
      <Field label={`Amount received (${event.currency})`}><input className={inputClass} type="number" min="0" step="1" value={amount} onChange={e => setAmount(Number(e.target.value))} /></Field>
      <Field label="Ledger note"><input className={inputClass} value={note} onChange={e => setNote(e.target.value)} placeholder="Cash, transfer reference, adjustment…" /></Field>
      <button disabled={busy} className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#d7ba7d] font-black text-[#17130c] disabled:opacity-50">{busy ? <Loader2 className="animate-spin" size={18} /> : <CreditCard size={18} />} Save to payment history</button>
    </form>
  </Modal>
}

function CreateEventModal({ onClose, onCreate, busy, suggestedNumber }: { onClose: () => void; onCreate: (values: any) => Promise<void>; busy: boolean; suggestedNumber: number }) {
  const [values, setValues] = useState({ event_number: suggestedNumber, name: "The Room", starts_at: "", venue: "", minimum_attendees: 20, table_count: 5, round_count: 3, ticket_price: 180, currency: "SAR" })
  const set = (key: string, value: any) => setValues(current => ({ ...current, [key]: value }))
  return <Modal title="Create a new room" eyebrow="Independent event" onClose={onClose} wide>
    <form onSubmit={async e => { e.preventDefault(); await onCreate(values) }} className="space-y-5 p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Event number" hint="Permanent history key for this edition."><input className={inputClass} type="number" min="1" value={values.event_number} onChange={e => set("event_number", Number(e.target.value))} /></Field><Field label="Event name"><input className={inputClass} value={values.name} onChange={e => set("name", e.target.value)} /></Field></div>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Starts at"><input className={`${inputClass} [color-scheme:dark]`} type="datetime-local" value={values.starts_at} onChange={e => set("starts_at", e.target.value)} /></Field><Field label="Venue"><input className={inputClass} value={values.venue} onChange={e => set("venue", e.target.value)} placeholder="Venue or district" /></Field></div>
      <div className="grid grid-cols-3 gap-3"><Field label="Minimum"><input className={inputClass} type="number" min="2" value={values.minimum_attendees} onChange={e => set("minimum_attendees", Number(e.target.value))} /></Field><Field label="Tables"><input className={inputClass} type="number" min="1" value={values.table_count} onChange={e => set("table_count", Number(e.target.value))} /></Field><Field label="Rounds"><input className={inputClass} type="number" min="1" value={values.round_count} onChange={e => set("round_count", Number(e.target.value))} /></Field></div>
      <div className="grid gap-4 sm:grid-cols-[1fr_.5fr]"><Field label="Ticket price"><input className={inputClass} type="number" min="0" value={values.ticket_price} onChange={e => set("ticket_price", Number(e.target.value))} /></Field><Field label="Currency"><input className={inputClass} maxLength={3} value={values.currency} onChange={e => set("currency", e.target.value.toUpperCase())} /></Field></div>
      <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.06] p-4 text-xs leading-relaxed text-emerald-100/70"><ShieldCheck size={16} className="mb-2 text-emerald-300" />This creates a separate event record. Guests, payments, and schedules remain scoped to this event number.</div>
      <button disabled={busy} className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#d7ba7d] font-black text-[#17130c] disabled:opacity-50">{busy ? <Loader2 className="animate-spin" size={18} /> : <DoorOpen size={18} />} Create The Room #{values.event_number}</button>
    </form>
  </Modal>
}

function attendeeJourney(person: Attendee, seats: Seat[]) {
  return seats
    .filter(seat => seat.attendee_id === person.id)
    .sort((left, right) => left.round_number - right.round_number)
}

function escapeSvg(value: string | number) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  })[character] || character)
}

async function downloadSeatPass(event: RoomEvent, person: Attendee, seats: Seat[], activeRound: number) {
  const journey = attendeeJourney(person, seats)
  const rows = Math.ceil(journey.length / 2)
  const height = Math.max(1350, 630 + rows * 190 + 220)
  const rounds = journey.map((seat, index) => {
    const column = index % 2
    const row = Math.floor(index / 2)
    const x = 90 + column * 465
    const y = 590 + row * 190
    const active = seat.round_number === activeRound
    return `<g transform="translate(${x} ${y})">
      <rect width="405" height="150" rx="30" fill="${active ? "#2a2418" : "#171611"}" stroke="${active ? "#d8b76d" : "#4b422f"}" stroke-width="${active ? 3 : 1}"/>
      <text x="32" y="43" fill="${active ? "#e9cb87" : "#a49b8b"}" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="4">ROUND ${seat.round_number}${active ? " · NOW" : ""}</text>
      <text x="32" y="112" fill="#f2d797" font-family="Georgia, serif" font-size="62" font-weight="700">TABLE ${seat.table_number}</text>
    </g>`
  }).join("")
  const safeName = escapeSvg(person.full_name.slice(0, 38))
  const safeEvent = escapeSvg(event.name.slice(0, 54))
  const safeVenue = escapeSvg(event.venue || "Venue to be announced")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#090908"/><stop offset=".55" stop-color="#15130e"/><stop offset="1" stop-color="#071711"/></linearGradient>
      <radialGradient id="gold"><stop stop-color="#e9cb87"/><stop offset="1" stop-color="#9a783f"/></radialGradient>
    </defs>
    <rect width="1080" height="${height}" fill="url(#bg)"/>
    <circle cx="960" cy="120" r="280" fill="#d8b76d" opacity=".08"/><circle cx="100" cy="${height - 80}" r="320" fill="#3d8e70" opacity=".08"/>
    <rect x="34" y="34" width="1012" height="${height - 68}" rx="54" fill="none" stroke="#ad8d50" stroke-width="2" opacity=".55"/>
    <g transform="translate(90 92)"><circle cx="42" cy="42" r="42" fill="#201c13" stroke="#b69451" stroke-width="2"/><text x="42" y="57" text-anchor="middle" fill="#e9cd8f" font-family="Georgia, serif" font-size="48">R</text></g>
    <text x="196" y="122" fill="#fffaf0" font-family="Georgia, serif" font-size="52" font-weight="700">The Room</text>
    <text x="198" y="158" fill="#a9905f" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="7">YOUR SEATING JOURNEY</text>
    <text x="90" y="252" fill="#8d877a" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="4">EVENT ${event.event_number} · GUEST ${person.attendee_number}</text>
    <text x="90" y="335" fill="#ffffff" font-family="Georgia, serif" font-size="72" font-weight="700">${safeName}</text>
    <text x="90" y="390" fill="#b5ad9f" font-family="Arial, sans-serif" font-size="26">${safeEvent}</text>
    <line x1="90" x2="990" y1="460" y2="460" stroke="#5b4b2c"/>
    <text x="90" y="520" fill="#d8b970" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="5">FOLLOW THE ROUND · FIND THE NUMBER</text>
    ${rounds}
    <text x="540" y="${height - 138}" text-anchor="middle" fill="#e7dfcf" font-family="Arial, sans-serif" font-size="25">${safeVenue}</text>
    <text x="540" y="${height - 92}" text-anchor="middle" fill="#8e877a" font-family="Arial, sans-serif" font-size="20">Keep this pass on your phone. Your table changes every round.</text>
  </svg>`
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
  return <Modal title="Photo-ready seat pass" eyebrow={`Event ${event.event_number} · Guest ${person.attendee_number}`} onClose={onClose} wide>
    <div className="p-4 sm:p-6">
      <motion.div initial={{ opacity: 0, scale: .97 }} animate={{ opacity: 1, scale: 1 }} className="relative mx-auto max-w-md overflow-hidden rounded-[2rem] border border-[#d8b76d]/35 bg-[#0b0b09] p-6 shadow-[0_35px_100px_rgba(0,0,0,.6)] sm:p-8" style={{ backgroundImage: "radial-gradient(circle at 100% 0%, rgba(216,183,109,.2), transparent 32%), radial-gradient(circle at 0% 100%, rgba(53,133,101,.18), transparent 34%)" }}>
        <div className="absolute inset-3 rounded-[1.5rem] border border-[#d8b76d]/10" />
        <div className="relative"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#d8b76d]/30 bg-[#d8b76d]/10 font-serif text-2xl text-[#efd89e]">R</div><div><p className="font-serif text-2xl font-semibold text-white">The Room</p><p className="text-[8px] font-black uppercase tracking-[.28em] text-[#b79a5e]">Your seating journey</p></div></div><span className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 text-[10px] font-black text-stone-400">EVENT {event.event_number}</span></div>
          <div className="mt-8"><p className="text-[10px] font-black uppercase tracking-[.22em] text-stone-500">Guest {person.attendee_number}</p><h3 className="mt-2 font-serif text-4xl font-semibold leading-none tracking-tight text-white">{person.full_name}</h3><p className="mt-3 text-xs text-stone-500">{event.name}</p></div>
          <div className="my-6 h-px bg-gradient-to-r from-transparent via-[#d8b76d]/45 to-transparent" />
          {activeSeat && <div className="rounded-2xl border border-[#d8b76d]/35 bg-[#d8b76d]/10 p-4 text-center"><p className="text-[9px] font-black uppercase tracking-[.22em] text-[#caaa68]">Current destination · Round {activeRound}</p><p className="mt-1 font-serif text-3xl font-bold text-[#f5dda1]">Go to Table {activeSeat.table_number}</p></div>}
          <p className="mt-5 text-center text-[9px] font-black uppercase tracking-[.22em] text-[#d8b76d]">Your complete journey</p>
          <div className="mt-4 grid grid-cols-2 gap-3">{journey.map((seat, index) => { const active = seat.round_number === activeRound; return <motion.div key={seat.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .07 }} className={`rounded-2xl border p-4 ${active ? "border-[#d8b76d]/45 bg-[#d8b76d]/10" : "border-white/[.08] bg-white/[.045]"}`}><p className={`text-[9px] font-black uppercase tracking-[.18em] ${active ? "text-[#d8b76d]" : "text-stone-500"}`}>Round {seat.round_number}{active ? " · Now" : ""}</p><p className="mt-1 font-serif text-2xl font-bold text-[#efd89e]">Table {seat.table_number}</p></motion.div> })}</div>
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-300/10 bg-emerald-300/[.05] p-3"><Navigation size={17} className="mt-0.5 shrink-0 text-emerald-300" /><p className="text-[11px] leading-relaxed text-emerald-100/65">Keep this on your phone. Your table number changes each round; your guest number stays the same.</p></div>
          <div className="mt-6 text-center"><p className="text-[11px] font-bold text-stone-300">{event.venue || "Venue to be announced"}</p><p className="mt-1 text-[10px] text-stone-600">{dateLabel(event.starts_at)}</p></div>
        </div>
      </motion.div>
      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]"><p className="flex items-center gap-2 rounded-2xl border border-white/[.07] bg-white/[.025] px-4 py-3 text-xs leading-relaxed text-stone-500"><Camera size={17} className="shrink-0 text-[#d8b76d]" /> Attendees can photograph this screen, or you can send them the PNG.</p><button type="button" onClick={async () => { try { await downloadSeatPass(event, person, seats, activeRound); toast.success("Seat pass downloaded") } catch (error: any) { toast.error(error.message) } }} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#d8ba79] px-5 text-xs font-black text-[#17130c]"><ImageDown size={17} /> Download PNG</button></div>
    </div>
  </Modal>
}

function VisualTable({ tableNumber, roundNumber, seats, attendees, onGuest }: { tableNumber: number; roundNumber: number; seats: Seat[]; attendees: Attendee[]; onGuest: (person: Attendee) => void }) {
  const reduceMotion = useReducedMotion()
  const assigned = seats.map(seat => ({ seat, person: attendees.find(person => person.id === seat.attendee_id) })).filter(item => item.person) as Array<{ seat: Seat; person: Attendee }>
  const useOrbit = assigned.length <= 6
  return <motion.section layout initial={{ opacity: 0, y: reduceMotion ? 0 : 18, scale: reduceMotion ? 1 : .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .35, delay: tableNumber * .035 }} className="group relative overflow-hidden rounded-[2rem] border border-white/[.085] bg-gradient-to-b from-white/[.055] to-white/[.025] shadow-2xl shadow-black/25">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(214,181,109,.11),transparent_38%)] opacity-70 transition group-hover:opacity-100" />
    <header className="relative flex items-center justify-between border-b border-white/[.07] px-5 py-4"><div><p className="text-[9px] font-black uppercase tracking-[.22em] text-[#aa8c52]">Round {roundNumber}</p><h4 className="mt-1 font-serif text-xl font-bold text-white">Table {tableNumber}</h4></div><Pill className="border-emerald-300/15 bg-emerald-300/[.06] text-emerald-100"><Users size={12} /> {assigned.length} placed</Pill></header>
    {assigned.length === 0 ? <div className="relative flex h-64 items-center justify-center text-sm text-stone-700">No guests assigned</div> : useOrbit ? <div className="relative mx-auto h-[390px] max-w-[420px]">
      <motion.div animate={reduceMotion ? undefined : { boxShadow: ["0 0 0 0 rgba(216,183,109,.08)", "0 0 0 18px rgba(216,183,109,0)"] }} transition={{ duration: 2.8, repeat: Infinity }} className="absolute left-1/2 top-1/2 flex h-36 w-36 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-[#d8b76d]/35 bg-gradient-to-br from-[#292318] to-[#100f0c] shadow-[0_24px_65px_rgba(0,0,0,.55)]"><Table2 size={20} className="text-[#d8b76d]" /><span className="mt-2 text-[9px] font-black uppercase tracking-[.2em] text-stone-500">Table</span><span className="font-serif text-5xl font-bold leading-none text-[#f0d89d]">{tableNumber}</span></motion.div>
      {assigned.map(({ seat, person }, index) => { const angle = -Math.PI / 2 + (Math.PI * 2 * index) / assigned.length; const left = 50 + Math.cos(angle) * 32; const top = 50 + Math.sin(angle) * 39; return <motion.button type="button" key={seat.id} onClick={() => onGuest(person)} aria-label={`Open seat pass for ${person.full_name}`} initial={{ opacity: 0, scale: .8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: reduceMotion ? 0 : .12 + index * .055 }} whileHover={reduceMotion ? undefined : { scale: 1.06 }} whileTap={{ scale: .97 }} style={{ left: `${left}%`, top: `${top}%` }} className="absolute flex min-h-12 w-[104px] -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-2xl border border-white/[.1] bg-[#181713]/95 p-2 text-left shadow-xl backdrop-blur-xl hover:border-[#d8b76d]/40 sm:w-32 sm:p-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#d8b76d]/10 text-[11px] font-black text-[#e7ca88]">{seat.seat_number}</span><span className="min-w-0"><span className="block truncate text-[11px] font-black text-stone-100 sm:text-xs">{person.full_name}</span><span className="block text-[9px] text-stone-600">Guest {person.attendee_number}</span></span></motion.button> })}
    </div> : <div className="relative p-5"><div className="mx-auto flex h-28 w-28 flex-col items-center justify-center rounded-full border border-[#d8b76d]/35 bg-[#211d15]"><span className="text-[9px] font-black uppercase tracking-[.2em] text-stone-500">Table</span><span className="font-serif text-4xl font-bold text-[#efd89e]">{tableNumber}</span></div><div className="mt-5 grid grid-cols-2 gap-2">{assigned.map(({ seat, person }, index) => <motion.button type="button" key={seat.id} onClick={() => onGuest(person)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .03 }} className="flex min-h-12 min-w-0 items-center gap-2 rounded-xl border border-white/[.08] bg-white/[.035] p-2 text-left"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#d8b76d]/10 text-[10px] font-black text-[#e7ca88]">{seat.seat_number}</span><span className="truncate text-[11px] font-black">{person.full_name}</span></motion.button>)}</div></div>}
    <footer className="relative border-t border-white/[.06] px-5 py-3 text-center text-[10px] font-bold text-stone-600"><Camera size={12} className="mr-1.5 inline text-[#a78a52]" /> Tap a name for their photo pass</footer>
  </motion.section>
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
  const [tab, setTab] = useState<"overview" | "guests" | "schedule">("overview")
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState("")
  const [paymentFilter, setPaymentFilter] = useState<"all" | PaymentStatus>("all")
  const [guestModal, setGuestModal] = useState<Attendee | "new" | null>(null)
  const [paymentGuest, setPaymentGuest] = useState<Attendee | null>(null)
  const [seatPassGuest, setSeatPassGuest] = useState<Attendee | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [eventMenu, setEventMenu] = useState(false)
  const [round, setRound] = useState(1)
  const [eventDraft, setEventDraft] = useState<Partial<RoomEvent>>(preview ? DEMO_BUNDLE.event : {})

  const installBundle = (next: Bundle) => { setBundle(next); setEventDraft(next.event); setRound(value => Math.min(value, next.event.round_count)); setEvents(current => current.some(event => event.id === next.event.id) ? current.map(event => event.id === next.event.id ? next.event : event) : [next.event, ...current]) }
  const loadEvents = async () => { const data = await roomApi("list-events"); setEvents(data.events || []); if (!bundle && data.events?.[0]) installBundle(await roomApi("get-event", { event_id: data.events[0].id })) }

  useEffect(() => {
    if (preview) return
    roomApi("session").then(data => { setConfigured(data.configured !== false); setAuthenticated(data.authenticated === true); if (data.authenticated) return loadEvents() }).catch(() => setConfigured(false)).finally(() => setChecking(false))
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

  const login = async (key: string) => { try { await roomApi("login", { key }); setAuthenticated(true); await loadEvents(); toast.success("Welcome to The Room") } catch (error: any) { toast.error(error.message); throw error } }
  const refresh = async () => { if (!bundle || preview) return; setRefreshing(true); try { installBundle(await roomApi("get-event", { event_id: bundle.event.id })) } catch (error: any) { toast.error(error.message) } finally { setRefreshing(false) } }

  const attendees = bundle?.attendees || []
  const included = attendees.filter(person => person.included_in_schedule && !["waitlist", "cancelled"].includes(person.attendance_status))
  const paid = attendees.filter(person => ["paid", "waived"].includes(person.payment_status)).length
  const collected = attendees.reduce((sum, person) => sum + Number(person.amount_paid || 0), 0)
  const outstanding = attendees.reduce((sum, person) => sum + Math.max(0, Number(person.amount_due || 0) - Number(person.amount_paid || 0)), 0)
  const filteredGuests = attendees.filter(person => {
    const matchesSearch = `${person.full_name} ${person.phone_e164 || ""} ${person.attendee_number}`.toLowerCase().includes(search.toLowerCase())
    return matchesSearch && (paymentFilter === "all" || person.payment_status === paymentFilter)
  })

  if (!authenticated) return <><Toaster position="top-center" /><LoginScreen onLogin={login} checking={checking} configured={configured} /></>
  if (!bundle && checking) return <main className="flex min-h-[100dvh] items-center justify-center bg-[#080807] text-[#d9bb7c]"><Loader2 className="animate-spin" size={28} /></main>

  const event = bundle?.event
  return (
    <main className="the-room-page min-h-[100dvh] bg-[#080807] text-stone-100 selection:bg-[#c9a968]/30" style={{ backgroundImage: "radial-gradient(circle at 10% 0%, rgba(143,108,50,.13), transparent 26%), radial-gradient(circle at 92% 18%, rgba(39,89,72,.12), transparent 24%)" }}>
      <Toaster position="top-center" toastOptions={{ style: { background: "#1b1915", color: "#f5f5f4", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16 } }} />
      <AnimatePresence>{event && seatPassGuest && bundle?.schedule && <SeatPassModal event={event} person={seatPassGuest} seats={bundle.seats} activeRound={round} onClose={() => setSeatPassGuest(null)} />}</AnimatePresence>
      <header className="sticky top-0 z-40 border-b border-white/[0.065] bg-[#080807]/88 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#d9bb7c]/25 bg-[#d9bb7c]/[0.08] text-[#e4ca91]"><DoorOpen size={21} /></div><div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate font-serif text-xl font-semibold tracking-tight">The Room</h1>{preview && <Pill className="border-violet-300/20 bg-violet-300/10 text-violet-200">Preview</Pill>}</div><p className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-stone-600">Event operations studio</p></div></div>
          <div className="flex items-center gap-2"><button onClick={refresh} disabled={refreshing || preview} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.035] text-stone-500 hover:text-white disabled:opacity-40" aria-label="Refresh"><RefreshCw size={17} className={refreshing ? "animate-spin" : ""} /></button><button onClick={async () => { if (!preview) await roomApi("logout"); setAuthenticated(false); setBundle(null) }} className="hidden min-h-11 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-4 text-xs font-bold text-stone-500 hover:text-white sm:flex"><LogOut size={15} /> Sign out</button></div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-28 pt-5 sm:px-6 sm:pb-10 lg:px-8">
        {!event ? (
          <div className="flex min-h-[70dvh] items-center justify-center"><Panel className="max-w-lg p-8 text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[#c9a968]/10 text-[#d9bb7c]"><DoorOpen size={28} /></div><h2 className="mt-5 text-2xl font-black">Open the first room</h2><p className="mt-2 text-sm leading-relaxed text-stone-500">Create an event number, set tables and rounds, then build the guest list.</p><button onClick={() => setCreateOpen(true)} className="mt-6 min-h-12 rounded-2xl bg-[#d7ba7d] px-6 font-black text-[#17130c]"><Plus size={17} className="mr-2 inline" /> New event</button></Panel></div>
        ) : (
          <>
            <section className="relative overflow-hidden rounded-[2rem] border border-[#d9bb7c]/15 bg-gradient-to-br from-[#1c1913] via-[#11100e] to-[#0b1110] p-5 shadow-[0_30px_100px_rgba(0,0,0,.4)] sm:p-7">
              <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#b58d47]/10 blur-[80px]" />
              <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Pill className="border-[#d9bb7c]/20 bg-[#d9bb7c]/[0.07] text-[#e4ca91]"><Hash size={12} /> Event {event.event_number}</Pill><Pill className={statusCopy[event.status].cls}><span className={`h-1.5 w-1.5 rounded-full ${event.status === "live" ? "animate-pulse bg-amber-300" : "bg-current"}`} /> {statusCopy[event.status].label}</Pill><Pill className="border-emerald-300/15 bg-emerald-300/[0.06] text-emerald-200"><ShieldCheck size={12} /> Isolated data</Pill></div><h2 className="mt-4 max-w-3xl font-serif text-3xl font-semibold leading-tight tracking-[-0.035em] text-white sm:text-5xl">{event.name}</h2><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-stone-500"><span className="flex items-center gap-2"><CalendarDays size={14} className="text-[#c9a968]" /> {dateLabel(event.starts_at)}</span><span className="flex items-center gap-2"><MapPin size={14} className="text-[#c9a968]" /> {event.venue || "Venue not set"}</span></div></div>
                <div className="relative flex gap-2"><button onClick={() => setEventMenu(value => !value)} className="flex min-h-12 min-w-44 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm font-black"><span className="truncate">Event {event.event_number}</span><ChevronDown size={16} className="text-stone-600" /></button><button onClick={() => setCreateOpen(true)} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#d7ba7d] text-[#17130c]" aria-label="New event"><Plus size={19} /></button>{eventMenu && <div className="absolute bottom-14 right-14 z-30 w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#181612] p-2 shadow-2xl">{events.map(item => <button key={item.id} onClick={async () => { setEventMenu(false); if (item.id !== event.id) { const data = preview ? DEMO_BUNDLE : await roomApi("get-event", { event_id: item.id }); installBundle(data) } }} className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-sm ${item.id === event.id ? "bg-[#c9a968]/10 text-[#e4ca91]" : "text-stone-400 hover:bg-white/[0.05]"}`}><span className="truncate">{item.name}</span><span className="ml-3 text-[10px]">#{item.event_number}</span></button>)}</div>}</div>
              </div>
            </section>

            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4"><MetricCard icon={Users} label="Roster" value={attendees.length} detail={`${included.length} included in seating`} accent="bg-emerald-500/10" /><MetricCard icon={TicketCheck} label="Settled" value={`${paid}/${attendees.length}`} detail={`${Math.round(attendees.length ? paid / attendees.length * 100 : 0)}% payment complete`} accent="bg-[#d9bb7c]/10" /><MetricCard icon={CircleDollarSign} label="Collected" value={currency(collected, event.currency)} detail={`${currency(outstanding, event.currency)} outstanding`} accent="bg-sky-500/10" /><MetricCard icon={Table2} label="Experience" value={`${event.table_count} × ${event.round_count}`} detail={`${event.table_count} tables · ${event.round_count} rounds`} accent="bg-violet-500/10" /></div>

            <nav className="mt-5 grid grid-cols-3 gap-1 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-1.5 sm:max-w-lg">{([{ id: "overview", label: "Overview", icon: LayoutDashboard }, { id: "guests", label: "Guests", icon: Users }, { id: "schedule", label: "Schedule", icon: Grid2X2 }] as const).map(item => <button key={item.id} onClick={() => setTab(item.id)} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-xs font-black transition ${tab === item.id ? "bg-[#d7ba7d] text-[#17130c] shadow-lg" : "text-stone-500 hover:text-stone-200"}`}><item.icon size={15} /> {item.label}</button>)}</nav>

            <AnimatePresence mode="wait">
              {tab === "overview" && <motion.div key="overview" initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
                <Panel className="p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c9a968]">Room architecture</p><h3 className="mt-1 text-xl font-black">Design the evening</h3><p className="mt-1 text-xs leading-relaxed text-stone-600">Changing these settings archives the current schedule so it can never become silently stale.</p></div><Settings2 size={20} className="text-stone-700" /></div><div className="mt-6 grid gap-4 sm:grid-cols-3"><Field label="Minimum guests"><input className={inputClass} type="number" min="2" value={eventDraft.minimum_attendees ?? event.minimum_attendees} onChange={e => setEventDraft(current => ({ ...current, minimum_attendees: Number(e.target.value) }))} /></Field><Field label="Tables"><input className={inputClass} type="number" min="1" value={eventDraft.table_count ?? event.table_count} onChange={e => setEventDraft(current => ({ ...current, table_count: Number(e.target.value) }))} /></Field><Field label="Rounds"><input className={inputClass} type="number" min="1" value={eventDraft.round_count ?? event.round_count} onChange={e => setEventDraft(current => ({ ...current, round_count: Number(e.target.value) }))} /></Field></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Event name"><input className={inputClass} value={eventDraft.name ?? event.name} onChange={e => setEventDraft(current => ({ ...current, name: e.target.value }))} /></Field><Field label="Venue"><input className={inputClass} value={eventDraft.venue ?? event.venue ?? ""} onChange={e => setEventDraft(current => ({ ...current, venue: e.target.value }))} /></Field><Field label="Starts at"><input className={`${inputClass} [color-scheme:dark]`} type="datetime-local" value={(eventDraft.starts_at || event.starts_at || "").slice(0, 16)} onChange={e => setEventDraft(current => ({ ...current, starts_at: e.target.value }))} /></Field><Field label="Status"><div className="relative"><select className={selectClass} value={eventDraft.status ?? event.status} onChange={e => setEventDraft(current => ({ ...current, status: e.target.value as EventStatus }))}>{Object.entries(statusCopy).map(([value, copy]) => <option key={value} value={value}>{copy.label}</option>)}</select><ChevronDown size={16} className="pointer-events-none absolute right-4 top-4 text-stone-600" /></div></Field></div><Field label="Host note"><textarea className={`${inputClass} mt-4 min-h-24 py-3`} value={eventDraft.notes ?? event.notes ?? ""} onChange={e => setEventDraft(current => ({ ...current, notes: e.target.value }))} /></Field><button onClick={() => act("update-event", { ...eventDraft, event_id: event.id })} disabled={busy} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[#d9bb7c]/25 bg-[#d9bb7c]/10 font-black text-[#e4ca91] disabled:opacity-40">{busy ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />} Save event settings</button></Panel>
                <div className="space-y-5"><Panel className="overflow-hidden p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Readiness</p><h3 className="mt-1 text-xl font-black">{included.length >= event.minimum_attendees ? "The room can open" : `${event.minimum_attendees - included.length} guests to go`}</h3></div><div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${included.length >= event.minimum_attendees ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-200"}`}>{included.length >= event.minimum_attendees ? <CheckCircle2 size={23} /> : <Users size={23} />}</div></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-black/30"><motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, included.length / event.minimum_attendees * 100)}%` }} className="h-full rounded-full bg-gradient-to-r from-[#9b7a42] via-[#d3b574] to-emerald-400" /></div><div className="mt-3 flex justify-between text-[11px] text-stone-600"><span>{included.length} included</span><span>Minimum {event.minimum_attendees}</span></div></Panel><Panel className="p-5 sm:p-6"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-400/10 text-violet-200"><WandSparkles size={18} /></div><div><h3 className="font-black">The no-repeat promise</h3><p className="mt-1 text-xs leading-relaxed text-stone-500">The generator either produces a fully valid plan or stops with an actionable configuration change. It never quietly allows repeat meetings.</p></div></div><div className="mt-4 grid grid-cols-2 gap-2 text-center"><div className="rounded-xl bg-white/[0.035] p-3"><p className="text-lg font-black text-white">0</p><p className="text-[10px] text-stone-600">repeat pairs</p></div><div className="rounded-xl bg-white/[0.035] p-3"><p className="text-lg font-black text-white">≤1</p><p className="text-[10px] text-stone-600">gender spread</p></div></div></Panel></div>
              </motion.div>}

              {tab === "guests" && <motion.div key="guests" initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5"><Panel className="overflow-hidden"><header className="border-b border-white/[0.07] p-4 sm:p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="text-xl font-black">Guest ledger</h3><p className="mt-1 text-xs text-stone-600">Attendance and payment history stay attached to Event {event.event_number}.</p></div><button onClick={() => setGuestModal("new")} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#d7ba7d] px-4 text-xs font-black text-[#17130c]"><Plus size={15} /> Add guest</button></div><div className="mt-4 grid gap-2 sm:grid-cols-[1fr_180px]"><div className="relative"><Search size={16} className="absolute left-4 top-3.5 text-stone-700" /><input className={`${inputClass} pl-11`} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, or number" /></div><div className="relative"><Filter size={15} className="absolute left-4 top-4 text-stone-700" /><select className={`${selectClass} pl-10`} value={paymentFilter} onChange={e => setPaymentFilter(e.target.value as any)}><option value="all">All payments</option>{Object.entries(paymentCopy).map(([value, copy]) => <option key={value} value={value}>{copy.label}</option>)}</select><ChevronDown size={15} className="pointer-events-none absolute right-4 top-4 text-stone-700" /></div></div></header><div className="divide-y divide-white/[0.055]">{filteredGuests.length ? filteredGuests.map(person => <div key={person.id} className="group grid gap-3 p-4 transition hover:bg-white/[0.025] sm:grid-cols-[minmax(0,1fr)_150px_170px_auto] sm:items-center sm:p-5"><div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-sm font-black text-[#e4ca91]">{person.attendee_number}</div><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-black text-white">{person.full_name}</p>{person.checked_in && <UserCheck size={14} className="shrink-0 text-emerald-300" />}</div><p className="mt-1 truncate text-[11px] text-stone-600">{person.phone_e164 || "No phone"} · {genderCopy[person.gender]}</p></div></div><div><p className="text-[10px] uppercase tracking-wider text-stone-700">Attendance</p><p className="mt-1 text-xs font-bold capitalize text-stone-300">{person.attendance_status}</p></div><button onClick={() => setPaymentGuest(person)} className={`flex min-h-10 items-center justify-between gap-2 rounded-xl border px-3 text-xs font-black ${paymentCopy[person.payment_status].cls}`}><span>{paymentCopy[person.payment_status].label}</span><span>{currency(person.amount_paid, event.currency)}</span></button><button onClick={() => setGuestModal(person)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-stone-600 hover:text-white" aria-label={`Edit ${person.full_name}`}><Edit3 size={15} /></button></div>) : <div className="p-12 text-center"><Users size={28} className="mx-auto text-stone-800" /><p className="mt-3 text-sm font-bold text-stone-500">No guests match this view</p></div>}</div></Panel></motion.div>}

              {tab === "schedule" && <motion.div key="schedule" initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5 space-y-5">
                <Panel className="p-5 sm:p-6"><div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center"><div><div className="flex items-center gap-2"><Pill className={bundle?.schedule ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200" : "border-stone-400/15 bg-stone-400/[0.06] text-stone-400"}>{bundle?.schedule ? <CheckCircle2 size={12} /> : <Sparkles size={12} />}{bundle?.schedule ? "Validated schedule" : "Not generated"}</Pill></div><h3 className="mt-3 text-2xl font-black">{bundle?.schedule ? "The live room map" : "Build the room"}</h3><p className="mt-1 max-w-2xl text-xs leading-relaxed text-stone-500">{bundle?.schedule ? `${bundle.schedule.participant_count} guests placed visually · ${bundle.schedule.round_count} rounds · every name opens a photo-ready pass` : `We’ll seat ${included.length} included guests across ${event.table_count} tables for ${event.round_count} rounds.`}</p></div><div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">{bundle?.schedule && <div className="relative min-w-56 flex-1 sm:flex-none"><Camera size={15} className="pointer-events-none absolute left-4 top-4 text-[#c9a968]" /><select aria-label="Open a guest seat pass" value="" onChange={change => { const person = attendees.find(attendee => attendee.id === change.target.value); if (person) setSeatPassGuest(person) }} className="min-h-12 w-full appearance-none rounded-2xl border border-[#d9bb7c]/20 bg-[#d9bb7c]/[.06] pl-10 pr-10 text-xs font-black text-[#e4ca91] outline-none"><option value="">Open guest seat pass…</option>{attendees.filter(person => bundle.seats.some(seat => seat.attendee_id === person.id)).map(person => <option key={person.id} value={person.id}>{person.attendee_number}. {person.full_name}</option>)}</select><ChevronDown size={15} className="pointer-events-none absolute right-4 top-4 text-[#9f854f]" /></div>}<button onClick={() => window.print()} disabled={!bundle?.schedule} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/[0.09] bg-white/[0.035] px-4 text-xs font-black text-stone-400 disabled:opacity-30"><Download size={16} /> Print map</button><button onClick={async () => { try { await act("generate-schedule", { event_id: event.id }); toast.success("A repeat-free schedule is ready") } catch {} }} disabled={busy || included.length < event.minimum_attendees} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#c4a565] to-[#ead096] px-5 text-xs font-black text-[#17130c] disabled:cursor-not-allowed disabled:opacity-35">{busy ? <Loader2 size={17} className="animate-spin" /> : <WandSparkles size={17} />} {bundle?.schedule ? "Regenerate" : "Generate schedule"}</button></div></div>{included.length < event.minimum_attendees && <p className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-xs text-amber-100/70">Add {event.minimum_attendees - included.length} more included guests before generating.</p>}</Panel>
                {bundle?.schedule && <><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><MetricCard icon={ShieldCheck} label="Repeat pairs" value={bundle.schedule.metrics.repeatPairCount ?? 0} detail="Hard validation" accent="bg-emerald-500/10" /><MetricCard icon={Gem} label="Unique meetings" value={bundle.schedule.metrics.uniquePairCount ?? "—"} detail="Across the evening" accent="bg-[#d9bb7c]/10" /><MetricCard icon={Users} label="Gender spread" value={`≤${bundle.schedule.metrics.genderSpreadMax ?? 1}`} detail="Per table" accent="bg-sky-500/10" /><MetricCard icon={Sparkles} label="Per guest" value={bundle.schedule.metrics.averageMeetingsPerAttendee ?? "—"} detail="New people met" accent="bg-violet-500/10" /></div>
                  <Panel className="overflow-hidden p-4 sm:p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#c9a968]">Live floor plan</p><h3 className="mt-1 text-xl font-black">Round {round} placement</h3><p className="mt-1 text-xs text-stone-600">Every attendee is named. Tap anyone to open their complete table journey.</p></div><div className="flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{Array.from({ length: event.round_count }, (_, index) => index + 1).map(value => <button key={value} onClick={() => setRound(value)} className={`flex min-h-12 min-w-28 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-black transition ${round === value ? "border-[#d9bb7c]/35 bg-[#d9bb7c]/12 text-[#efd89e] shadow-[0_10px_35px_rgba(201,169,104,.1)]" : "border-white/[0.07] bg-white/[0.025] text-stone-600"}`}><span className={`flex h-7 w-7 items-center justify-center rounded-full ${round === value ? "bg-[#d9bb7c] text-[#17130c]" : "bg-white/[.05]"}`}>{value}</span> Round</button>)}</div></div></Panel>
                  <AnimatePresence mode="wait"><motion.div key={round} initial={{ opacity: 0, x: reduceMotion ? 0 : 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduceMotion ? 0 : -18 }} className="the-room-schedule-grid grid gap-5 xl:grid-cols-2">{Array.from({ length: event.table_count }, (_, index) => index + 1).map(tableNumber => <VisualTable key={tableNumber} tableNumber={tableNumber} roundNumber={round} seats={bundle.seats.filter(seat => seat.round_number === round && seat.table_number === tableNumber)} attendees={attendees} onGuest={setSeatPassGuest} />)}</motion.div></AnimatePresence>
                </>}
              </motion.div>}
            </AnimatePresence>
          </>
        )}
      </div>

      {event && <nav className="fixed inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-40 grid grid-cols-3 rounded-2xl border border-white/10 bg-[#13110e]/95 p-1.5 shadow-2xl backdrop-blur-2xl sm:hidden">{([{ id: "overview", label: "Overview", icon: LayoutDashboard }, { id: "guests", label: "Guests", icon: Users }, { id: "schedule", label: "Schedule", icon: Grid2X2 }] as const).map(item => <button key={item.id} onClick={() => setTab(item.id)} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-black ${tab === item.id ? "bg-[#d7ba7d] text-[#17130c]" : "text-stone-600"}`}><item.icon size={16} />{item.label}</button>)}</nav>}

      <AnimatePresence>{createOpen && <CreateEventModal suggestedNumber={Math.max(0, ...events.map(item => item.event_number)) + 1} busy={busy} onClose={() => setCreateOpen(false)} onCreate={async values => { try { const data = await act("create-event", values); if (data) { setCreateOpen(false); toast.success(`The Room #${data.event.event_number} is ready`) } } catch {} }} />}{event && guestModal && <GuestModal event={event} guest={guestModal === "new" ? null : guestModal} busy={busy} onClose={() => setGuestModal(null)} onSave={async values => { try { await act("save-attendee", { ...values, event_id: event.id, attendee_id: guestModal === "new" ? null : guestModal.id }); setGuestModal(null); toast.success("Guest ledger updated") } catch {} }} />}{event && paymentGuest && <PaymentModal event={event} guest={paymentGuest} busy={busy} onClose={() => setPaymentGuest(null)} onSave={async values => { try { await act("record-payment", { ...values, event_id: event.id, attendee_id: paymentGuest.id }); setPaymentGuest(null); toast.success("Payment history updated") } catch {} }} />}</AnimatePresence>
    </main>
  )
}
