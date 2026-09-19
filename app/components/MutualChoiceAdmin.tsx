import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Clock, Heart, Loader2, Pause, Play, RefreshCw, RotateCcw, Shield, Table2, Users } from "lucide-react"
import toast from "react-hot-toast"
import { useVisibilityPoll } from "~/hooks/useVisibilityPoll"

type Assignment = {
  participant_number: number
  kind: "group" | "pair" | "break"
  table_number: number | null
  partner_number?: number | null
  group_number?: number | null
}

type Runtime = {
  event3_session_key: string
  session: {
    status: "setup" | "running" | "paused" | "complete"
    round_number: number
    total_rounds: number
    duration_seconds: number
    remaining_seconds: number
    revision?: number
  }
  assignments: Assignment[]
  summary: { groups: number; pairs: number; breaks: number; participants: number }
}

type Props = {
  api: (action: string, extra?: Record<string, any>) => Promise<any>
  eventId: number
  testMode: boolean
  testSessionKey: string
  selectedCount: number
  participants: Array<{ number: number; name: string }>
  readOnly: boolean
  seatingOnly?: boolean
  onChanged: () => void | Promise<void>
}

const timeLabel = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`

export default function MutualChoiceAdmin({ api, eventId, testMode, testSessionKey, selectedCount, participants, readOnly, seatingOnly = false, onChanged }: Props) {
  const [runtime, setRuntime] = useState<Runtime | null>(null)
  const [receivedAt, setReceivedAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [minutes, setMinutes] = useState(20)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")
  const requestId = useRef(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; requestId.current += 1 }
  }, [])

  const refresh = useCallback(async () => {
    const id = ++requestId.current
    const data = await api("e3-mutual-state", {
      expected_event_id: eventId,
      expected_test_mode: testMode,
      expected_test_session_key: testSessionKey,
    })
    if (!mounted.current || id !== requestId.current) return
    if (data.error) { setError(data.error); return }
    setError("")
    setRuntime(data)
    setReceivedAt(Date.now())
    setNow(Date.now())
  }, [api, eventId, testMode, testSessionKey])

  useVisibilityPoll(refresh, 3000, !busy)
  useEffect(() => {
    if (runtime?.session?.status !== "running") return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [runtime?.session?.status])

  const status = runtime?.session?.status || "setup"
  const round = runtime?.session?.round_number || 0
  const remaining = Math.max(0, Math.ceil((runtime?.session?.remaining_seconds || 0) - (status === "running" ? (now - receivedAt) / 1000 : 0)))
  const locked = readOnly || busy !== null || runtime === null || !!error
  const summary = runtime?.summary
  const assignments = runtime?.assignments || []
  const tables = new Map<string, Assignment[]>()
  for (const assignment of assignments) {
    const key = assignment.kind === "break" ? "break" : `${assignment.kind}-${assignment.table_number ?? assignment.group_number}`
    tables.set(key, [...(tables.get(key) || []), assignment])
  }
  const names = new Map(participants.map(person => [Number(person.number), person.name]))

  const control = async (command: "start" | "pause" | "resume" | "reset") => {
    if (locked) return
    if (command === "reset" && !window.confirm("إعادة الجولات الست إلى الإعداد؟ ستُحذف اختيارات وجلسات هذا التشغيل، وتبقى قائمة المشاركين محفوظة.")) return
    requestId.current += 1
    setBusy(command)
    try {
      const data = await api(command === "start" ? "e3-mutual-start" : "e3-mutual-control", {
        expected_event_id: eventId,
        expected_test_mode: testMode,
        expected_test_session_key: testSessionKey,
        expected_event3_session_key: runtime?.event3_session_key,
        ...(command === "start" ? { duration_seconds: minutes * 60 } : { command }),
      })
      if (!mounted.current) return
      if (data.error) { toast.error(data.error); return }
      toast.success(command === "start" ? "بدأت الجولة الأولى" : command === "pause" ? "توقّفت الجلسات مؤقتاً" : command === "resume" ? "استؤنفت الجلسات معاً" : "عادت الجولات إلى الإعداد")
      await Promise.all([refresh(), onChanged()])
    } finally {
      if (mounted.current) setBusy(null)
    }
  }

  return (
    <section dir="rtl" aria-label={seatingOnly ? "جلسات الاختيار المتبادل الحالية" : "تشغيل جولات الاختيار المتبادل"} className="overflow-hidden rounded-2xl border border-teal-800/60 bg-gradient-to-bl from-teal-950/35 via-gray-900 to-gray-900">
      <div className="p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold text-teal-300"><span className="h-1.5 w-1.5 rounded-full bg-teal-400" /> 6 جولات · إيقاع واحد · اختيار متبادل</div>
            <h2 className="text-lg font-bold text-white">{seatingOnly ? "الجلسات الحالية" : "مساحة للتعارف، وحرية للاختيار"}</h2>
            <p className="mt-2 max-w-2xl text-xs leading-6 text-gray-400">بعد كل مجموعة يختار المشارك شخصاً واحداً أو يتخطّى. الاختيار المتبادل يصنع لقاءً فردياً في الجولة التالية؛ ويكمل الآخرون في مجموعات جديدة. بعد اللقاء الفردي يعود الطرفان للمجموعات.</p>
          </div>
          <span role="status" className={`rounded-full border px-3 py-1.5 text-[11px] font-bold ${status === "running" ? "border-teal-700/50 bg-teal-900/40 text-teal-200" : "border-gray-700 bg-gray-800 text-gray-300"}`}>
            {!runtime ? "جارٍ تحميل الحالة" : status === "running" ? "الجلسات جارية" : status === "paused" ? "متوقفة مؤقتاً" : status === "complete" ? "اكتملت الجولات الست" : "جاهزة للإعداد"}
          </span>
        </div>

        {error && <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-amber-800/50 bg-amber-950/30 p-3 text-xs text-amber-200"><span>{error}</span><button type="button" onClick={refresh} aria-label="إعادة تحميل حالة الجلسات" className="shrink-0 rounded-lg px-2 py-1 hover:bg-amber-900/30"><RefreshCw size={15} /></button></div>}

        <ol aria-label="تقدم الجولات الست" className="mt-5 grid grid-cols-6 gap-1.5 sm:gap-2">
          {Array.from({ length: 6 }, (_, index) => index + 1).map(number => (
            <li key={number} aria-current={number === round && status !== "complete" ? "step" : undefined} className={`rounded-xl border px-1 py-3 text-center ${number === round && status !== "complete" ? "border-teal-400/60 bg-teal-400/10 text-teal-100" : number < round || status === "complete" ? "border-teal-900/60 bg-teal-950/30 text-teal-400" : "border-gray-800 bg-black/10 text-gray-600"}`}>
              <div className="text-[9px] sm:text-[10px]">الجولة</div>
              <div className="mt-1 flex justify-center text-lg font-bold">{number < round || status === "complete" ? <Check size={22} /> : number}</div>
            </li>
          ))}
        </ol>

        {status !== "setup" && <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-800 bg-gray-950/40 p-4">
          <div><p className="text-xs text-gray-400">{status === "complete" ? "انتهت الفعالية" : `الجولة ${round} من 6`}</p><p className="mt-1 text-[10px] text-gray-500">المجموعات واللقاءات الفردية تبدأ وتنتهي معاً</p></div>
          <div className="flex items-center gap-2 text-teal-200"><Clock size={18} /><span dir="ltr" className="font-mono text-3xl font-bold tabular-nums">{timeLabel(remaining)}</span></div>
        </div>}

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "مشاركون", value: status === "setup" ? selectedCount : summary?.participants ?? selectedCount, Icon: Users },
            { label: "مجموعات حالية", value: summary?.groups ?? 0, Icon: Table2 },
            { label: "لقاءات فردية", value: summary?.pairs ?? 0, Icon: Heart },
            { label: "في استراحة", value: summary?.breaks ?? 0, Icon: Clock },
          ].map(({ label, value, Icon }) => <div key={label} className="rounded-xl border border-gray-800 bg-gray-950/30 p-3"><div className="flex items-center justify-between gap-2"><Icon size={14} className="text-gray-500" /><span className="text-xl font-bold text-gray-100">{value}</span></div><p className="mt-1 text-[10px] text-gray-500">{label}</p></div>)}
        </div>

        {!seatingOnly && <div className="mt-5">
          {status === "setup" ? <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block text-xs text-gray-300">مدة كل جلسة بالدقائق<div className="mt-2 flex items-center gap-2"><input type="number" min={1} max={60} step={1} value={minutes} onChange={event => setMinutes(Number(event.target.value))} disabled={readOnly || !!busy} className="w-24 rounded-xl border border-gray-700 bg-gray-950 px-3 py-2.5 text-center text-sm text-white focus:border-teal-400 focus:outline-none" /><span className="text-[10px] text-gray-500">للمجموعات واللقاءات الفردية معاً</span></div></label>
            <button type="button" onClick={() => control("start")} disabled={locked || selectedCount < 6 || !Number.isInteger(minutes) || minutes < 1 || minutes > 60} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal-400 px-5 py-3 text-xs font-bold text-teal-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:opacity-40">{busy === "start" ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} بدء الجولات الست</button>
          </div> : <div className="flex flex-wrap gap-2">
            {status !== "complete" && <button type="button" onClick={() => control(status === "paused" ? "resume" : "pause")} disabled={locked} className="flex min-h-11 items-center gap-2 rounded-xl bg-teal-400 px-5 py-3 text-xs font-bold text-teal-950 hover:bg-teal-300 disabled:opacity-40">{busy ? <Loader2 size={15} className="animate-spin" /> : status === "paused" ? <Play size={15} /> : <Pause size={15} />}{status === "paused" ? "استئناف الجميع" : "إيقاف مؤقت للجميع"}</button>}
            <button type="button" onClick={() => control("reset")} disabled={locked} className="flex min-h-11 items-center gap-2 rounded-xl border border-gray-700 px-4 py-3 text-xs font-bold text-gray-400 hover:bg-gray-800 hover:text-gray-200 disabled:opacity-40"><RotateCcw size={14} /> إعادة إلى الإعداد</button>
          </div>}
          {status === "setup" && <p className="mt-2 text-[10px] leading-5 text-gray-500">احفظ قائمة المشاركين أولاً (6 على الأقل). تتكوّن المجموعة الأولى عند البدء، ثم تتوزع الجلسات تلقائياً. الجولة السادسة ختام اللقاءات.</p>}
        </div>}

        {seatingOnly && <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from(tables.entries()).map(([key, members]) => {
            const kind = members[0].kind
            return <div key={key} className={`rounded-xl border p-4 ${kind === "pair" ? "border-pink-900/50 bg-pink-950/20" : "border-gray-800 bg-gray-950/30"}`}><div className="mb-3 flex items-center gap-2 text-xs font-bold text-gray-200">{kind === "pair" ? <Heart size={14} className="text-pink-300" /> : <Users size={14} className="text-teal-300" />}{kind === "break" ? "استراحة" : `${kind === "pair" ? "لقاء فردي" : "مجموعة"} · طاولة ${members[0].table_number ?? members[0].group_number}`}</div><div className="space-y-2">{members.map(member => <div key={member.participant_number} className="flex items-center gap-2 text-xs text-gray-300"><span className="font-mono text-[10px] text-gray-600">#{member.participant_number}</span>{names.get(member.participant_number) || "مشارك"}</div>)}</div></div>
          })}
          {!assignments.length && <p className="py-4 text-xs text-gray-500 sm:col-span-2">ستظهر طاولات الجولة الحالية هنا عند بدء الجلسات.</p>}
        </div>}
      </div>
      <div className="flex items-start gap-2 border-t border-teal-900/40 bg-teal-950/20 px-4 py-3 text-[10px] leading-5 text-teal-300/80 sm:px-6"><Shield size={14} className="mt-0.5 shrink-0" /> الاختيارات خاصة. لا تظهر هوية مَن اختار شخصاً ولم يبادله الاختيار؛ وتعرض لوحة التشغيل الجلسات الحالية وأعدادها فقط.</div>
    </section>
  )
}
