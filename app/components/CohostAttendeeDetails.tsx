import { useEffect, useId, useMemo, useRef, useState } from "react"
import { ChevronDown, Heart, History, Loader2, MessageSquare, RefreshCw, UserRound, Users, X } from "lucide-react"

export interface AttendeeOverview {
  number: number
  name: string
  age: number | null
  attended: boolean
  previous_event_count: number
  first_time: boolean
  tables?: Record<string, number>
  ranking_submitted?: boolean
}

interface Rating {
  compatibility: number | null
  conversation: number | null
  connection: number | null
}
interface PastMatch {
  phase: "choice" | "algorithm" | "individual"
  round: number | null
  partner_number: number
  partner_name: string
  score: number | null
  received_rating: Rating | null
  given_rating: Rating | null
  received_note: string | null
  given_note: string | null
  notes: string[]
}
interface GroupReview {
  reviewer_number?: number
  reviewer_name?: string
  member_number?: number
  member_name?: string
  experience: string | null
  tags: string[]
  organizer_note: string | null
}
interface PastGroup {
  round: number
  table: number | null
  members: Array<{ number: number; name: string }>
  received: GroupReview[]
  given: GroupReview[]
  notes: string[]
}
interface PastEvent {
  event_id: number
  matches: PastMatch[]
  groups: PastGroup[]
  notes: string[]
}
export interface AttendeeDetailsResponse {
  participant: AttendeeOverview
  history: PastEvent[]
  total_events: number
  has_more: boolean
  history_limit: number
  next_before_event_id?: number | null
}

type View = "overview" | "matches" | "groups" | "notes"
const card = "rounded-2xl border border-white/10 bg-white/[0.035] p-4"
const phaseLabels = { choice: "لقاء الاختيار", algorithm: "لقاء الخوارزمية", individual: "لقاء فردي" }
const tableLabels: Record<string, string> = { "1": "المجموعة الأولى", "2": "المجموعة الثانية", "3": "المجموعة الثالثة", "20": "لقاء الاختيار", "30": "لقاء الخوارزمية" }
const experienceLabels: Record<string, string> = { comfortable: "مريح", neutral: "عادي", uncomfortable: "غير مريح", great: "ممتاز", good: "جيد", okay: "مقبول", difficult: "صعب" }
const metric = (value: number | null | undefined, suffix: string) => value != null && Number.isFinite(value) ? `${Math.round(value)}${suffix}` : "—"

function RatingCard({ title, rating, note }: { title: string; rating: Rating | null; note: string | null }) {
  return <div className="rounded-xl bg-black/20 p-3">
    <p className="text-xs font-bold text-slate-300">{title}</p>
    {rating ? <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
      {[["التوافق", metric(rating.compatibility, "%")], ["المحادثة", metric(rating.conversation, "/5")], ["الراحة", metric(rating.connection, "/5")]].map(([label, value]) => <div key={label}><dt className="text-[11px] text-slate-400">{label}</dt><dd dir="ltr" className="mt-1 text-sm font-bold text-white">{value}</dd></div>)}
    </dl> : <p className="mt-2 text-xs text-slate-500">لا يوجد تقييم محفوظ</p>}
    {note ? <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-amber-100">{note}</p> : null}
  </div>
}

function GroupReviews({ reviews, direction }: { reviews: GroupReview[]; direction: "received" | "given" }) {
  return <details className="rounded-xl bg-black/15 p-3" open={direction === "received" && reviews.length > 0}>
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-xs font-bold text-slate-200"><span>{direction === "received" ? "ما قاله الآخرون عنه" : "تقييمه لأفراد المجموعة"} · {reviews.length}</span><ChevronDown size={16} /></summary>
    <div className="mt-2 space-y-3">
      {!reviews.length ? <p className="text-xs text-slate-500">لا توجد تقييمات محفوظة</p> : reviews.map((review, index) => <div key={index} className="border-t border-white/10 pt-3">
        <p className="text-sm font-bold">{direction === "received" ? review.reviewer_name : review.member_name} <span className="text-xs font-normal text-slate-500">#{direction === "received" ? review.reviewer_number : review.member_number}</span></p>
        {review.experience ? <p className="mt-1 text-xs text-teal-200">{experienceLabels[review.experience] || review.experience}</p> : null}
        {review.tags?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{review.tags.map((tag, i) => <span key={i} className="rounded-lg bg-teal-300/10 px-2 py-1 text-xs text-teal-100">{tag}</span>)}</div> : null}
        {review.organizer_note ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-amber-100">{review.organizer_note}</p> : null}
      </div>)}
    </div>
  </details>
}

function eventNotes(event: PastEvent) {
  return [
    ...event.notes.map(text => ({ context: "ملاحظة المنظم", text })),
    ...event.matches.flatMap(match => [
      ...(match.received_note ? [{ context: `${phaseLabels[match.phase]} · ${match.partner_name}`, text: match.received_note }] : []),
      ...match.notes.map(text => ({ context: `${phaseLabels[match.phase]} · ملاحظة المنظم`, text })),
    ]),
    ...event.groups.flatMap(group => [
      ...group.received.filter(review => review.organizer_note).map(review => ({ context: `مجموعة ${group.round} · ${review.reviewer_name}`, text: review.organizer_note! })),
      ...group.notes.map(text => ({ context: `مجموعة ${group.round} · ملاحظة المنظم`, text })),
    ]),
  ]
}

export default function CohostAttendeeDetails({ participant, eventId, loadDetails, onClose }: {
  participant: AttendeeOverview
  eventId: number
  loadDetails: (number: number, beforeEventId?: number) => Promise<AttendeeDetailsResponse>
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [view, setView] = useState<View>("overview")
  const [data, setData] = useState<AttendeeDetailsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  const [eventFilter, setEventFilter] = useState("")
  const active = useRef(true)
  useEffect(() => {
    const dialog = dialogRef.current
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement as HTMLElement | null
    document.body.style.overflow = "hidden"
    dialog?.showModal()
    active.current = true
    return () => { active.current = false; dialog?.close(); document.body.style.overflow = previousOverflow; previousFocus?.focus() }
  }, [])
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError("")
    setData(null)
    loadDetails(participant.number).then(result => {
      if (!cancelled) setData(result)
    }).catch(() => {
      if (!cancelled) setError("تعذر تحميل السجل. حاولي مرة أخرى.")
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [participant.number, eventId, loadDetails, retry])
  const history = data?.history || []
  const stats = useMemo(() => ({
    matches: history.reduce((sum, event) => sum + event.matches.length, 0),
    groups: history.reduce((sum, event) => sum + event.groups.length, 0),
    notes: history.reduce((sum, event) => sum + eventNotes(event).length, 0),
  }), [data?.history])
  const events = history.filter(event => !eventFilter || String(event.event_id) === eventFilter)
  const loadMore = async () => {
    if (!data?.next_before_event_id || loadingMore) return
    setLoadingMore(true)
    setError("")
    try {
      const next = await loadDetails(participant.number, data.next_before_event_id)
      if (active.current) setData(previous => previous ? { ...next, history: [...previous.history, ...next.history.filter(event => !previous.history.some(existing => existing.event_id === event.event_id))] } : next)
    } catch { if (active.current) setError("تعذر تحميل السجل الأقدم. حاولي مرة أخرى.") }
    finally { if (active.current) setLoadingMore(false) }
  }
  return <dialog ref={dialogRef} aria-labelledby={titleId} dir="rtl" onCancel={event => { event.preventDefault(); onClose() }} className="m-0 h-[100dvh] max-h-none w-full max-w-none overflow-hidden border-0 bg-[#0b111b] p-0 text-white backdrop:bg-black/70 sm:m-auto sm:h-[min(850px,92dvh)] sm:max-w-2xl sm:rounded-3xl sm:border sm:border-white/10">
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-white/10 px-4 pb-4 pt-[max(env(safe-area-inset-top),1rem)] sm:px-6">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-300/10 text-sm font-bold text-teal-200">#{participant.number}</div>
          <div className="min-w-0 flex-1"><p className="text-[11px] text-teal-200">ملف المشارك</p><h2 id={titleId} className="mt-1 break-words text-lg font-bold">{participant.name}</h2><p className="mt-1 text-xs text-slate-400">{participant.age ? `${participant.age} سنة · ` : ""}فعالية {eventId}</p></div>
          <button type="button" autoFocus onClick={onClose} aria-label="إغلاق ملف المشارك" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 text-slate-300 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"><X size={20} /></button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className={`rounded-full px-3 py-1.5 ${participant.attended ? "bg-teal-300/10 text-teal-200" : "bg-amber-300/10 text-amber-200"}`}>{participant.attended ? "حاضر الآن" : "لم يسجل الحضور"}</span><span className="rounded-full bg-white/5 px-3 py-1.5 text-slate-300">{participant.first_time ? "أول فعالية" : `${participant.previous_event_count} فعاليات سابقة`}</span></div>
      </header>
      <nav aria-label="تفاصيل المشارك" className="grid shrink-0 grid-cols-4 gap-1 border-b border-white/10 px-2 py-2">
        {([{ key: "overview", label: "نظرة عامة", icon: UserRound }, { key: "matches", label: "اللقاءات", icon: Heart }, { key: "groups", label: "المجموعات", icon: Users }, { key: "notes", label: "الملاحظات", icon: MessageSquare }] as const).map(item => <button key={item.key} type="button" aria-pressed={view === item.key} onClick={() => setView(item.key)} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-xs font-bold ${view === item.key ? "bg-teal-300/10 text-teal-200" : "text-slate-400 hover:bg-white/5"}`}><item.icon size={18} />{item.label}</button>)}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4 sm:px-6">
        {view === "overview" ? <div className="space-y-4">
          <div className={card}><h3 className="text-sm font-bold">الفعالية الحالية</h3><dl className="mt-3 space-y-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-slate-400">الحضور</dt><dd>{participant.attended ? "تم تسجيل الحضور" : "بانتظار الوصول"}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-400">الاختيارات</dt><dd>{participant.ranking_submitted ? "تم الإرسال" : "لم تُرسل بعد"}</dd></div></dl>{Object.entries(participant.tables || {}).length ? <div className="mt-4 flex flex-wrap gap-2">{Object.entries(participant.tables || {}).map(([round, table]) => <span key={round} className="rounded-lg bg-amber-300/10 px-2.5 py-2 text-xs text-amber-100">{tableLabels[round] || `جولة ${round}`} · طاولة {table}</span>)}</div> : null}</div>
          <div className="grid grid-cols-3 gap-2">{([{ key: "matches", label: "لقاءات سابقة", count: stats.matches }, { key: "groups", label: "جلسات جماعية", count: stats.groups }, { key: "notes", label: "ملاحظات عنه", count: stats.notes }] as const).map(item => <button type="button" key={item.key} onClick={() => setView(item.key)} className={`${card} min-h-24 px-2 text-center`}><span className="block text-xl font-bold text-teal-200">{loading ? "—" : item.count}</span><span className="mt-2 block text-[11px] text-slate-400">{item.label}</span></button>)}</div>
          {!loading && !error ? <p className="text-xs leading-6 text-slate-400">{history.length ? `السجل المتاح من ${history.length} فعاليات سابقة. اختاري أحد الأقسام لعرض التفاصيل.` : "لا يوجد سجل سابق متاح."}</p> : null}
        </div> : <div className="space-y-4">
          {history.length > 1 ? <div><label htmlFor={`${titleId}-event`} className="mb-2 block text-xs text-slate-400">الفعالية</label><select id={`${titleId}-event`} value={eventFilter} onChange={event => setEventFilter(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/10 bg-[#101a29] px-3 text-sm"><option value="">كل الفعاليات السابقة</option>{history.map(event => <option key={event.event_id} value={event.event_id}>فعالية {event.event_id}</option>)}</select></div> : null}
          {events.filter(event => view === "matches" ? event.matches.length : view === "groups" ? event.groups.length : eventNotes(event).length).map((event, index) => <details key={`${view}-${event.event_id}`} open={index === 0} className="rounded-2xl border border-white/10">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-bold"><span className="flex items-center gap-2"><History size={16} className="text-teal-200" />فعالية {event.event_id}</span><ChevronDown size={17} className="text-slate-400" /></summary>
            <div className="space-y-3 border-t border-white/10 p-3">
              {view === "matches" ? event.matches.map((match, i) => <article key={i} className={`${card} space-y-3`}><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] text-teal-200">{phaseLabels[match.phase]}</p><h4 className="mt-1 text-sm font-bold">{match.partner_name} <span className="text-xs font-normal text-slate-500">#{match.partner_number}</span></h4></div>{match.score != null ? <span dir="ltr" className="shrink-0 rounded-lg bg-white/5 px-2 py-1 text-xs text-slate-300">{metric(match.score, "%")}</span> : null}</div><RatingCard title="تقييم الطرف الآخر له" rating={match.received_rating} note={match.received_note} /><details><summary className="min-h-11 cursor-pointer py-3 text-xs text-slate-400">تقييمه للطرف الآخر</summary><RatingCard title="تقييمه" rating={match.given_rating} note={match.given_note} /></details>{match.notes.map((note, n) => <p key={n} className="whitespace-pre-wrap break-words rounded-xl bg-amber-300/[0.06] p-3 text-sm leading-7 text-amber-100">{note}</p>)}</article>) : view === "groups" ? event.groups.map((group, i) => <article key={i} className={`${card} space-y-3`}><div><h4 className="text-sm font-bold">الجولة {group.round}{group.table ? ` · طاولة ${group.table}` : ""}</h4><div className="mt-2 flex flex-wrap gap-1.5">{group.members.map(member => <span key={member.number} className="rounded-lg bg-white/5 px-2 py-1.5 text-xs text-slate-300">{member.name} <span className="text-slate-500">#{member.number}</span></span>)}</div></div><GroupReviews reviews={group.received} direction="received" /><GroupReviews reviews={group.given} direction="given" />{group.notes.map((note, n) => <p key={n} className="whitespace-pre-wrap break-words text-sm leading-7 text-amber-100">{note}</p>)}</article>) : eventNotes(event).map((note, i) => <article key={i} className={card}><p className="text-xs text-teal-200">{note.context}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-slate-200">{note.text}</p></article>)}
            </div>
          </details>)}
          {!loading && !error && !events.some(event => view === "matches" ? event.matches.length : view === "groups" ? event.groups.length : eventNotes(event).length) ? <p className={`${card} py-10 text-center text-sm text-slate-400`}>لا توجد {view === "matches" ? "لقاءات" : view === "groups" ? "جلسات جماعية" : "ملاحظات"} سابقة متاحة.</p> : null}
        </div>}
        {loading ? <p role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400"><Loader2 size={20} className="animate-spin" />جاري تحميل السجل…</p> : null}
        {error ? <div role="alert" className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-amber-100"><p>{error}</p><button type="button" onClick={() => data ? loadMore() : setRetry(value => value + 1)} className="mt-2 flex min-h-11 items-center gap-2 font-bold"><RefreshCw size={16} />إعادة المحاولة</button></div> : null}
        {data?.has_more ? <div className="mt-4">{data.next_before_event_id ? <button type="button" onClick={loadMore} disabled={loadingMore} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/10 text-sm text-teal-200 disabled:opacity-50">{loadingMore ? <Loader2 size={17} className="animate-spin" /> : <History size={17} />}عرض سجل أقدم</button> : <p className="text-center text-xs text-slate-400">يُعرض أحدث {data.history_limit} فعالية من السجل المتاح.</p>}</div> : null}
      </div>
    </div>
  </dialog>
}
