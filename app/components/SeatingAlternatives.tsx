import { useEffect, useId, useRef, useState } from "react"
import { Check, Loader2, RefreshCw, Shuffle, X } from "lucide-react"
import toast from "react-hot-toast"

type Assignment = { round: number; table_number: number; participant_id: number }
type Person = { number: number; name: string; gender: "male" | "female" | "unknown"; age: number | null }
type Plan = {
  assignments: Assignment[]
  token?: string
  metrics: {
    repeated_pairs: number; max_repeats_per_person: number; moved_people: number
    average_age_gap: number | null; compatibility: number | null; scored_pairs: number; mixed_pairs: number
  }
}
type Preview = { current: Plan; alternatives: Plan[]; participants: Person[]; expires_at: number }
type Props = {
  eventId: number
  testMode: boolean
  disabled: boolean
  disabledReason: string
  request: (action: string, body?: Record<string, unknown>, options?: { signal?: AbortSignal }) => Promise<any>
  onApplied: () => Promise<void>
}

export default function SeatingAlternatives({ eventId, testMode, disabled, disabledReason, request, onApplied }: Props) {
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [selected, setSelected] = useState(0)
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null)
  const [error, setError] = useState("")
  const pending = useRef<AbortController | null>(null)
  const generation = useRef(0)
  useEffect(() => () => { generation.current++; pending.current?.abort() }, [])

  function close() {
    if (busy === "apply") return
    generation.current++
    pending.current?.abort(); pending.current = null
    setBusy(null); setOpen(false); setPreview(null); setError("")
  }

  async function load() {
    if (disabled || pending.current) return
    const controller = new AbortController()
    pending.current = controller
    const version = ++generation.current
    setOpen(true); setBusy("preview"); setError(""); setPreview(null)
    const timer = setTimeout(() => controller.abort(), 25_000)
    try {
      const data = await request("e3-get-seating-alternatives", { expected_event_id: eventId, expected_test_mode: testMode }, { signal: controller.signal })
      if (generation.current !== version) return
      if (controller.signal.aborted) throw new Error("استغرق تحميل البدائل وقتاً طويلاً؛ حاول مجدداً")
      if (data.error) throw new Error(data.error)
      if (!data.current || !Array.isArray(data.alternatives) || !Array.isArray(data.participants)) throw new Error("تعذّر تحميل البدائل")
      setPreview(data); setSelected(data.alternatives.length ? 1 : 0)
    } catch (err) {
      if (generation.current === version) setError(err instanceof Error ? err.message : "تعذّر تحميل البدائل")
    } finally {
      clearTimeout(timer)
      if (generation.current === version) { pending.current = null; setBusy(null) }
    }
  }

  async function apply() {
    const token = preview?.alternatives[selected - 1]?.token
    if (disabled || pending.current || !token) return
    if (Date.now() >= (preview?.expires_at || 0)) { setError("انتهت صلاحية المعاينة؛ اطلب بدائل جديدة"); return }
    const controller = new AbortController()
    pending.current = controller
    const version = ++generation.current
    setBusy("apply"); setError("")
    const timer = setTimeout(() => controller.abort(), 30_000)
    try {
      const data = await request("e3-apply-seating-alternative", { token, expected_event_id: eventId, expected_test_mode: testMode }, { signal: controller.signal })
      if (generation.current !== version) return
      if (controller.signal.aborted || data.error || !data.success) throw new Error(data.error || "تعذّر تأكيد الحفظ؛ راجع الخريطة الحالية قبل إعادة المحاولة")
      toast.success("تم تطبيق البديل على الجولتين")
      setOpen(false)
    } catch (err) {
      if (generation.current === version) setError(err instanceof Error ? err.message : "تعذّر تطبيق البديل")
    } finally {
      clearTimeout(timer)
      if (generation.current === version) {
        setPreview(null)
        // A lost response may still have committed: reload the real seating even on error.
        try { await onApplied() } finally {
          if (generation.current === version) { pending.current = null; setBusy(null) }
        }
      }
    }
  }

  const plans = preview ? [preview.current, ...preview.alternatives] : []
  const plan = plans[selected]
  const people = new Map(preview?.participants.map(person => [person.number, person]) || [])
  const original = new Map(preview?.current.assignments.map(row => [`${row.round}:${row.participant_id}`, row.table_number]) || [])
  const buttonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-400"

  return (
    <section dir="rtl" className="space-y-3">
      <button type="button" onClick={open ? close : load} disabled={disabled || busy === "apply"}
        aria-expanded={open} aria-controls={panelId} title={disabled ? disabledReason : undefined}
        className={`${buttonClass} border border-purple-700/60 bg-purple-950/40 text-purple-200 hover:bg-purple-900/50`}>
        <Shuffle size={16} /> {open ? "إغلاق البدائل" : "عرض بدائل الجلسات"}
      </button>
      {disabled && !open && <p className="text-xs text-gray-500">{disabledReason}</p>}
      {open && (
        <div id={panelId} aria-busy={busy !== null} className="rounded-2xl border border-purple-700/50 bg-gray-950 p-3 sm:p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="font-semibold text-purple-100">بدائل جولتي المجموعات {testMode && <span className="text-amber-300 text-xs">· وضع التجربة</span>}</h4>
              <p className="mt-1 text-xs leading-6 text-gray-400">اختر التوزيع المناسب، ثم طبّقه على الجولتين. المعاينة لا تغيّر الجلسات الحالية.</p>
            </div>
            <button type="button" onClick={close} disabled={busy === "apply"} aria-label="إغلاق بدائل الجلسات" className={`${buttonClass} px-2 text-gray-400 hover:bg-gray-800`}><X size={18} /></button>
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-950/40 p-3 text-sm text-red-200">{error}</p>}
          {disabled && <p role="status" className="text-sm text-amber-200">{disabledReason}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {plans.map((_, index) => (
              <button key={index} type="button" aria-pressed={selected === index} disabled={busy !== null}
                onClick={() => setSelected(index)} className={`${buttonClass} ${selected === index ? "bg-purple-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>
                {index === 0 ? "الحالية" : `البديل ${index}`}
              </button>
            ))}
            <button type="button" disabled={disabled || busy !== null} onClick={load} className={`${buttonClass} border border-gray-700 text-gray-300 hover:bg-gray-800`}>
              {busy === "preview" ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} {busy === "preview" ? "جارٍ تجهيز البدائل…" : "بدائل أخرى"}
            </button>
          </div>
          {preview?.alternatives.length === 0 && <p role="status" className="text-sm text-amber-200">لم نجد بديلاً مناسباً ضمن القيود الحالية. لم تتغيّر الجلسات.</p>}
          {plan && <>
            <dl className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
              <div className="rounded-lg bg-gray-900 p-3"><dt className="text-gray-400">أزواج تتكرر بين الجولتين</dt><dd className="mt-1 text-lg text-white">{plan.metrics.repeated_pairs}</dd></div>
              <div className="rounded-lg bg-gray-900 p-3"><dt className="text-gray-400">أشخاص تغيّرت طاولاتهم</dt><dd className="mt-1 text-lg text-amber-200">{plan.metrics.moved_people}</dd></div>
              <div className="rounded-lg bg-gray-900 p-3"><dt className="text-gray-400">متوسط فرق العمر</dt><dd className="mt-1 text-lg text-white">{plan.metrics.average_age_gap?.toFixed(1) ?? "—"} <span className="text-xs text-gray-400">سنة</span></dd></div>
              <div className="rounded-lg bg-gray-900 p-3"><dt className="text-gray-400">التوافق المحفوظ بين الجنسين</dt><dd className="mt-1 text-lg text-white">{plan.metrics.compatibility?.toFixed(1) ?? "—"}<span className="text-xs text-gray-400"> / 100</span></dd><dd className="text-gray-500">متاح لـ {plan.metrics.scored_pairs} من {plan.metrics.mixed_pairs} لقاء</dd></div>
            </dl>
            {selected > 0 && <p className="text-xs text-amber-200">الأسماء المظلّلة انتقلت من طاولة أخرى. عدد المقاعد وتوزيع الجنسين في كل طاولة محفوظان.</p>}
            <div className="grid xl:grid-cols-2 gap-5">
              {[1, 2].map(round => (
                <div key={round} className="min-w-0 space-y-3">
                  <h5 className="text-sm font-semibold text-gray-200">{round === 1 ? "الجولة الأولى" : "الجولة الثانية"}</h5>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {[...new Set(plan.assignments.filter(row => row.round === round).map(row => row.table_number))].sort((a, b) => a - b).map(table => {
                      const members = plan.assignments.filter(row => row.round === round && row.table_number === table).map(row => people.get(row.participant_id)!)
                      const women = members.filter(person => person.gender === "female").length
                      const men = members.filter(person => person.gender === "male").length
                      return <div key={table} className="min-w-0 rounded-xl border border-gray-800 bg-gray-900/70 p-3">
                        <div className="flex flex-wrap justify-between gap-2 text-xs mb-2"><span className="font-bold text-white">طاولة {table} <span className="text-gray-500">· {members.length}</span></span><span className="text-gray-400">{women} نساء · {men} رجال{members.length > women + men ? ` · ${members.length - women - men} غير محدد` : ""}</span></div>
                        <ul className="space-y-1">
                          {members.map(person => {
                            const from = original.get(`${round}:${person.number}`)
                            const moved = from !== table
                            return <li key={person.number} className={`rounded-md px-2 py-1.5 text-xs ${moved ? "bg-amber-900/25 text-amber-100" : "text-gray-300"}`}>
                              <div className="flex items-start justify-between gap-2"><span className="min-w-0 break-words">{person.name}</span><span className="shrink-0 text-gray-500" dir="ltr">#{person.number}</span></div>
                              {moved && <span className="block mt-1 text-[10px] text-amber-400">من طاولة {from}</span>}
                            </li>
                          })}
                        </ul>
                      </div>
                    })}
                  </div>
                </div>
              ))}
            </div>
            {selected > 0 && <div className="border-t border-gray-800 pt-4">
              <button type="button" disabled={disabled || busy !== null} onClick={apply} className={`${buttonClass} w-full sm:w-auto bg-emerald-700 text-white hover:bg-emerald-600`}>
                {busy === "apply" ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {busy === "apply" ? "جارٍ تطبيق الجولتين…" : "تطبيق هذا البديل على الجولتين"}
              </button>
            </div>}
          </>}
        </div>
      )}
    </section>
  )
}
