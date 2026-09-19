import { useCallback, useEffect, useRef, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { ArrowLeft, Check, CheckCircle2, Coffee, Heart, Loader2, LockKeyhole, MapPin, MessageCircle, ShieldCheck, Sparkles, Timer, Users, X } from "lucide-react"
import { QuestionSlideshow } from "./QuestionSlideshow"

export type MutualChoiceState = {
  session: {
    status: "setup" | "running" | "paused" | "complete"
    round_number: number
    total_rounds: number
    duration_seconds: number
    remaining_seconds: number
    ends_at: string | null
    server_now: string
    revision: number
  }
  assignment: { kind: "group" | "pair" | "break"; table_number: number | null; group_number?: number; partner_number?: number } | null
  members: { participant_number: number; name: string; gender?: string | null }[]
  choice: { chosen_number: number | null; submitted: boolean } | null
  previous_outcome: "mutual" | "continue" | null
  can_choose: boolean
  event3_session_key: string
}

const INTRO_STEPS = [
  { Icon: Users, label: "تعرّف براحتك", description: "نبدأ بمجموعة. خذ وقتك في السوالف، والتطبيق يوضح لك طاولتك في كل جولة.", color: "text-cyan-200 bg-cyan-400/10 border-cyan-300/15" },
  { Icon: Heart, label: "اختيار واحد، بينك وبين نفسك", description: "اختر شخصاً من مجموعتك ودّك تكمل معه لقاءً فردياً، أو اختر أن تكمل مع مجموعة.", color: "text-pink-200 bg-pink-400/10 border-pink-300/15" },
  { Icon: Sparkles, label: "إذا اخترتوا بعض، تكملون سوا", description: "الاختيار المتبادل يصنع لقاء الجولة التالية. وبعده ترجعون للمجموعات، وبقية المشاركين يكملون التعارف.", color: "text-violet-200 bg-violet-400/10 border-violet-300/15" },
]

function RoundProgress({ round, complete = false }: { round: number; complete?: boolean }) {
  return (
    <ol className="flex gap-2" aria-label="تقدم الجولات الست">
      {Array.from({ length: 6 }, (_, i) => i + 1).map(number => (
        <li key={number} aria-current={!complete && number === round ? "step" : undefined} className="flex-1">
          <span className={`flex h-1.5 rounded-full ${complete || number < round ? "bg-violet-300/80" : number === round ? "bg-gradient-to-l from-pink-300 to-violet-400 shadow-[0_0_14px_rgba(216,180,254,.4)]" : "bg-white/10"}`} />
          <span className="sr-only">الجولة {number}{complete || number < round ? "، مكتملة" : number === round ? "، الحالية" : "، قادمة"}</span>
        </li>
      ))}
    </ol>
  )
}

export function MutualChoiceWelcome({ onDone, onLogout }: { onDone: () => void; onLogout?: () => void }) {
  const reduceMotion = useReducedMotion()
  return (
    <div className="event3-shell min-h-[100dvh] overflow-x-hidden bg-[#080610] px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-white" dir="rtl" lang="ar">
      <motion.main initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="relative mx-auto max-w-md space-y-7">
        <div className="pointer-events-none absolute -top-10 right-0 h-64 w-64 rounded-full bg-purple-600/10 blur-3xl" aria-hidden="true" />
        <header className="relative space-y-4 pt-3 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-400/10 px-3 py-1.5 text-xs font-bold text-violet-200"><Sparkles size={14} /> التوافق الأعمى · الاختيار المتبادل</span>
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[1.8rem] border border-pink-200/20 bg-gradient-to-br from-purple-500/25 to-pink-500/15 shadow-[0_12px_60px_-15px_rgba(192,132,252,.45)]"><Heart size={35} strokeWidth={1.4} className="text-pink-200" /></div>
          <h1 className="text-3xl font-black leading-[1.5]">سوالف تبدأ بمجموعة.<br /><span className="bg-gradient-to-l from-pink-200 to-violet-300 bg-clip-text text-transparent">ولقاء تختارونه سوا.</span></h1>
          <p className="text-sm leading-7 text-gray-400">٦ جولات، بنفس المدة للجميع.<br />بين مجموعة جديدة ولقاء فردي باختيار متبادل.</p>
        </header>
        <div className="space-y-3">
          {INTRO_STEPS.map(({ Icon, label, description, color }, index) => (
            <div key={label} className="flex gap-3 rounded-2xl border border-white/[0.075] bg-white/[0.025] p-4">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${color}`}><Icon size={21} /></span>
              <div><p className="text-sm font-black text-white"><span className="ml-1.5 text-xs text-white/35">{index + 1}.</span>{label}</p><p className="mt-1 text-xs leading-6 text-gray-400">{description}</p></div>
            </div>
          ))}
        </div>
        <div className="flex gap-2.5 rounded-2xl border border-violet-300/15 bg-violet-400/[0.055] p-4">
          <ShieldCheck size={19} className="mt-0.5 shrink-0 text-violet-300" />
          <p className="text-xs leading-6 text-violet-100/80">اختيارك خاص، وتقدر تغيّره حتى ينتهي الوقت. ما نعرض اختيارات الآخرين؛ يظهر لك فقط إذا كان اختيارك متبادلاً. الجولة السادسة ختام التجربة، بدون اختيار لجولة إضافية.</p>
        </div>
        <button type="button" onClick={onDone} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-purple-600 to-pink-600 px-5 font-black shadow-[0_12px_35px_-16px_rgba(192,132,252,.7)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-4 focus-visible:ring-offset-[#080610]">جاهز للتعارف <ArrowLeft size={19} /></button>
        {onLogout && <button type="button" onClick={onLogout} className="mx-auto block min-h-11 px-5 text-xs text-gray-400 hover:text-white">تسجيل الخروج</button>}
      </motion.main>
    </div>
  )
}

type Props = {
  state: MutualChoiceState | null | undefined
  myInfo: { number: number; name: string; gender?: string | null } | null
  correctedNow: () => number
  onChoose: (chosenNumber: number | null) => Promise<MutualChoiceState>
  onRoundEnd?: () => void
  onActivityOpenChange?: (open: boolean) => void
}

function ActivitySheet({ pair, round, timerLabel, onClose }: { pair: boolean; round: number; timerLabel: string; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return }
      if (event.key !== "Tab") return
      const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select, textarea, [tabindex="0"]') || []).filter(item => item.getClientRects().length > 0)
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener("keydown", onKey)
    return () => { document.removeEventListener("keydown", onKey); opener?.focus() }
  }, [onClose])
  return (
    <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="mutual-activity-title" className="fixed inset-0 z-[180] flex flex-col overflow-hidden bg-[#080610]" dir="rtl">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 pb-3 pt-[max(.75rem,env(safe-area-inset-top))]">
        <div><h2 id="mutual-activity-title" className="text-sm font-black text-white">{pair ? "خلّوا السالفة تكمل" : "سوالف المجموعة"}</h2><p className="mt-1 text-xs text-gray-400">الجولة {round} · الوقت المتبقي <span dir="ltr" className="inline-block font-mono text-violet-200">{timerLabel}</span></p></div>
        <button ref={closeRef} type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 text-gray-300 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-violet-300" aria-label="العودة إلى الجولة"><X size={19} /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        <QuestionSlideshow defaultSet={pair ? round > 3 ? "partnership" : "rhythm" : "special"} />
      </div>
      {!pair && round < 6 && <div className="shrink-0 border-t border-white/10 bg-[#080610] px-4 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3"><button type="button" onClick={onClose} className="mx-auto flex min-h-12 w-full max-w-md items-center justify-center gap-2 rounded-xl border border-violet-300/20 bg-violet-400/10 text-sm font-bold text-violet-100"><LockKeyhole size={15} /> العودة لحفظ اختياري الخاص <ArrowLeft size={16} /></button></div>}
    </div>
  )
}

export default function MutualChoiceRound({ state, myInfo, correctedNow, onChoose, onRoundEnd, onActivityOpenChange }: Props) {
  const reduceMotion = useReducedMotion()
  const [now, setNow] = useState(correctedNow)
  const [draft, setDraft] = useState<number | null | undefined>(undefined)
  const [saved, setSaved] = useState<{ choice: MutualChoiceState["choice"]; revision: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [activityOpen, setActivityOpen] = useState(false)
  const requestedTransitionRef = useRef(false)
  const closeActivity = useCallback(() => setActivityOpen(false), [])
  const session = state?.session
  const round = session?.round_number || 0
  const status = session?.status || "setup"
  const kind = state?.assignment?.kind
  const pair = kind === "pair"
  const complete = status === "complete"
  const setup = status === "setup"
  const paused = status === "paused"
  const remaining = status === "running" && session?.ends_at
    ? Math.max(0, Math.ceil((Date.parse(session.ends_at) - now) / 1000))
    : Math.max(0, session?.remaining_seconds || 0)
  const timerLabel = `${Math.floor(remaining / 60).toString().padStart(2, "0")}:${(remaining % 60).toString().padStart(2, "0")}`
  const canChoose = Boolean(state?.can_choose && kind === "group" && round < 6 && status === "running" && remaining > 0)
  // An older heartbeat must not undo a confirmed save; newer server state wins.
  const choice = saved && saved.revision > (session?.revision ?? -1) ? saved.choice : state?.choice
  const displayedDraft = draft !== undefined ? draft : choice?.submitted ? choice.chosen_number : undefined
  const dirty = displayedDraft !== undefined && (!choice?.submitted || displayedDraft !== choice.chosen_number)
  const members = state?.members || []
  const candidates = members.filter(person => person.participant_number !== myInfo?.number)
  const partner = members.find(person => person.participant_number === state?.assignment?.partner_number) || candidates[0]
  const selectedName = members.find(person => person.participant_number === choice?.chosen_number)?.name
  const table = state?.assignment?.table_number ?? null

  useEffect(() => {
    const timer = window.setInterval(() => setNow(correctedNow()), 1000)
    return () => window.clearInterval(timer)
  }, [correctedNow])
  useEffect(() => {
    if (status !== "running" || remaining !== 0 || requestedTransitionRef.current) return
    requestedTransitionRef.current = true
    onRoundEnd?.()
  }, [status, remaining, onRoundEnd])
  useEffect(() => {
    onActivityOpenChange?.(activityOpen)
    return () => onActivityOpenChange?.(false)
  }, [activityOpen, onActivityOpenChange])

  async function saveChoice() {
    if (!canChoose || saving || displayedDraft === undefined) return
    setSaving(true)
    setError("")
    try {
      const result = await onChoose(displayedDraft)
      if (result.session.round_number !== round || result.session.status === "complete" || result.event3_session_key !== state?.event3_session_key) {
        setError("انتهت الجولة. نحدّث وجهتك الآن.")
        return
      }
      if (!result.choice?.submitted || result.choice.chosen_number !== displayedDraft) throw new Error("ما تأكد حفظ اختيارك. حاول مرة ثانية.")
      setSaved({ choice: result.choice, revision: result.session.revision })
      setDraft(undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : "ما قدرنا نحفظ اختيارك. حاول مرة ثانية.")
    } finally {
      setSaving(false)
    }
  }

  if (!state) return <div role="status" className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 text-sm text-violet-200"><Loader2 size={24} className="animate-spin" /> نجهّز تفاصيل جولتك…</div>

  return (
    <motion.main initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto w-full max-w-md space-y-5 px-5 pb-[max(7rem,env(safe-area-inset-bottom))] pt-6 text-white" dir="rtl" data-mutual-choice-screen={complete ? "complete" : setup ? "setup" : kind || "waiting"}>
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs"><span className="flex items-center gap-1.5 font-bold text-violet-200"><Sparkles size={13} /> الاختيار المتبادل</span><span className="text-gray-400">{complete ? "٦ جولات، حكايات كثيرة" : setup ? "٦ جولات معاً" : `الجولة ${round} من ٦`}</span></div>
        <RoundProgress round={round} complete={complete} />
      </div>

      {setup ? (
        <section className="relative overflow-hidden rounded-[1.8rem] border border-violet-300/15 bg-gradient-to-br from-violet-500/10 to-white/[0.025] p-6 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-200/15 bg-violet-400/10"><Sparkles size={28} className="text-violet-200" /></div>
          <p className="text-sm text-violet-200">يا هلا {myInfo?.name || "فيك"}</p><h1 className="mt-2 text-2xl font-black">أنت جاهز. والبداية قريبة.</h1>
          <p className="mt-3 text-sm leading-7 text-gray-400">أول ما تبدأ الفعالية، تظهر لك مجموعتك وطاولتك تلقائياً.</p>
          <div className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-emerald-300/15 bg-emerald-400/[0.055] p-3 text-xs text-emerald-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> بانتظار بدء المنظّم</div>
          {myInfo && <p className="mt-4 text-xs text-gray-500">رقمك في الفعالية <span className="font-bold text-gray-300">#{myInfo.number}</span></p>}
        </section>
      ) : complete ? (
        <section className="relative overflow-hidden rounded-[1.8rem] border border-pink-200/20 bg-gradient-to-br from-violet-500/15 via-purple-950/20 to-pink-500/10 px-6 py-10 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-pink-200/20 bg-pink-300/10"><Heart size={35} className="text-pink-200" strokeWidth={1.5} /></div>
          <p className="mt-6 text-xs font-bold text-pink-200">اكتملت الجولات الست</p><h1 className="mt-3 text-3xl font-black leading-relaxed">كل سالفة، بداية.</h1><p className="mt-3 text-sm leading-7 text-gray-300">شكراً لحضورك، وللمساحة اللي أعطيتها للتعارف.<br />نتمنى إنك لقيت سالفة ودّك تكملها.</p>
          <div className="mt-7 flex items-center justify-center gap-2 text-xs text-violet-200/80"><LockKeyhole size={14} /> تظل اختياراتك خاصة بك</div>
        </section>
      ) : (
        <>
          <section className={`relative overflow-hidden rounded-[1.8rem] border p-5 ${pair ? "border-pink-200/20 bg-gradient-to-br from-pink-500/15 via-purple-950/15 to-violet-500/10" : "border-violet-200/15 bg-gradient-to-br from-violet-500/10 to-white/[0.025]"}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0"><span className={`inline-flex items-center gap-1.5 text-xs font-bold ${pair ? "text-pink-200" : "text-violet-200"}`}>{pair ? <Heart size={14} /> : kind === "break" ? <Coffee size={14} /> : <Users size={14} />}{pair ? "اختيار متبادل" : kind === "break" ? "مساحة خفيفة لك" : "مجموعتك الآن"}</span><h1 className="mt-2 text-2xl font-black leading-9">{pair ? "اختَرْتوا بعض." : kind === "break" ? "خذ لك لحظة." : round === 1 ? "بداية حلوة، مع بعض." : "سوالف جديدة تنتظرك."}</h1></div>
              <div className="shrink-0 rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5 text-center"><p className="mb-1 flex items-center justify-center gap-1 text-[10px] text-gray-400"><Timer size={11} /> {paused ? "متوقف مؤقتاً" : "المتبقي"}</p><time dir="ltr" aria-label={`الوقت المتبقي ${Math.floor(remaining / 60)} دقيقة و${remaining % 60} ثانية`} className={`font-mono text-xl font-bold tabular-nums ${remaining <= 60 && !paused ? "text-amber-200" : "text-white"}`}>{timerLabel}</time></div>
            </div>
            <p className="mt-3 text-sm leading-7 text-gray-400">{pair ? `${partner?.name || "شريكك"} اختارك أيضاً. هذا وقتكم تكملون السالفة على راحتكم.` : kind === "break" ? "استراحة قصيرة ضمن توزيع هذه الجولة. خلك قريب؛ وجهتك التالية تظهر تلقائياً مع بداية الجولة القادمة." : "اجلسوا، تعرّفوا، وخذوا راحتكم. اللقاءات الفردية والمجموعات تبدأ وتنتهي مع بعض."}</p>
            {table !== null && <div className="mt-5 flex items-center justify-between rounded-2xl border border-white/[0.09] bg-black/20 px-4 py-3"><span className="flex items-center gap-2 text-sm text-gray-300"><MapPin size={17} className={pair ? "text-pink-300" : "text-violet-300"} /> {pair ? "طاولة لقائكم" : "طاولة مجموعتك"}</span><span className="text-3xl font-black tracking-tight text-white">{table}</span></div>}
            {pair && partner && <div className="mt-4 flex items-center gap-3 rounded-2xl border border-pink-200/15 bg-pink-400/[0.05] p-4"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-pink-400/10 text-xl font-black text-pink-100">{partner.name.slice(0, 1)}</span><div><p className="text-lg font-black">{partner.name}</p><p className="mt-1 text-xs text-pink-100/55">المشارك #{partner.participant_number}</p></div><Heart size={20} className="mr-auto text-pink-300" /></div>}
            {!pair && kind === "group" && <div className="mt-4 flex flex-wrap gap-2" aria-label="أفراد مجموعتك">{members.map(person => <span key={person.participant_number} className="rounded-full border border-white/[0.08] bg-white/[0.045] px-3 py-1.5 text-xs text-gray-300">{person.name}{person.participant_number === myInfo?.number && <span className="mr-1 text-violet-300">· أنت</span>}<span className="mr-1.5 text-gray-500">#{person.participant_number}</span></span>)}</div>}
          </section>

          {paused && <p role="status" className="rounded-2xl border border-amber-300/15 bg-amber-400/[0.055] p-4 text-sm leading-6 text-amber-100">أوقف المنظّم الوقت للجميع. خذ راحتك؛ نكمل معاً عند الاستئناف.</p>}
          {!paused && remaining === 0 && <p role="status" className="flex items-center gap-2 rounded-2xl border border-violet-300/20 bg-violet-400/10 p-4 text-sm text-violet-100"><Loader2 size={17} className="shrink-0 animate-spin" /> اكتملت الجولة. نجهّز وجهتك التالية…</p>}

          {(kind === "group" || pair) && <button type="button" onClick={() => setActivityOpen(true)} className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-right transition hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"><MessageCircle size={20} className="text-violet-300" /><span className="flex-1"><span className="block text-sm font-bold">{pair ? "سؤال يفتح سالفة" : "أسئلة وسوالف للمجموعة"}</span><span className="mt-1 block text-xs text-gray-500">{pair ? "أسئلة تقرّبكم من بعض" : "سؤال بسيط، وكل واحد له سالفة"}</span></span><ArrowLeft size={17} className="text-gray-400" /></button>}

          {kind === "group" && round < 6 && (
            <section className="rounded-[1.8rem] border border-violet-200/15 bg-white/[0.025] p-5" aria-labelledby="mutual-choice-title">
              <div className="flex items-center gap-2 text-xs font-bold text-violet-300"><LockKeyhole size={13} /> بينك وبين نفسك</div>
              <h2 id="mutual-choice-title" className="mt-2 text-xl font-black">مع مين ودّك تكمل السالفة؟</h2>
              <p className="mt-2 text-xs leading-6 text-gray-400">اختر شخصاً واحداً لهذه الجولة، أو كمل التعارف مع مجموعة. تقدر تغيّر اختيارك وتحفظه حتى ينتهي الوقت.</p>
              <fieldset disabled={!canChoose || saving} className="mt-4 space-y-2 disabled:opacity-70"><legend className="sr-only">اختيارك الخاص لهذه الجولة</legend>
                {candidates.map(person => <label key={person.participant_number} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition focus-within:ring-2 focus-within:ring-violet-300 ${displayedDraft === person.participant_number ? "border-violet-300/50 bg-violet-400/15" : "border-white/[0.09] bg-white/[0.025] hover:border-violet-300/25"}`}><input type="radio" name="mutual-choice" value={person.participant_number} checked={displayedDraft === person.participant_number} onChange={() => { setDraft(person.participant_number); setError("") }} className="sr-only" /><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black ${displayedDraft === person.participant_number ? "bg-violet-400/20 text-violet-100" : "bg-white/[0.055] text-gray-300"}`}>{person.name.slice(0, 1)}</span><span className="flex-1"><span className="block text-sm font-bold">{person.name}</span><span className="mt-0.5 block text-[11px] text-gray-500">#{person.participant_number}</span></span><span aria-hidden="true" className={`flex h-5 w-5 items-center justify-center rounded-full border ${displayedDraft === person.participant_number ? "border-violet-300 bg-violet-300 text-violet-950" : "border-white/20"}`}>{displayedDraft === person.participant_number && <Check size={13} strokeWidth={3} />}</span></label>)}
                <label className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition focus-within:ring-2 focus-within:ring-violet-300 ${displayedDraft === null ? "border-violet-300/50 bg-violet-400/15" : "border-white/[0.09] bg-white/[0.025]"}`}><input type="radio" name="mutual-choice" value="skip" checked={displayedDraft === null} onChange={() => { setDraft(null); setError("") }} className="sr-only" /><Users size={17} className="text-gray-400" /><span className="flex-1 text-xs font-medium text-gray-300">أفضّل أكمل التعارف مع مجموعة</span><span aria-hidden="true" className={`flex h-5 w-5 items-center justify-center rounded-full border ${displayedDraft === null ? "border-violet-300 bg-violet-300 text-violet-950" : "border-white/20"}`}>{displayedDraft === null && <Check size={13} strokeWidth={3} />}</span></label>
              </fieldset>
              {error && <p role="alert" className="mt-3 text-xs leading-6 text-rose-200">{error}</p>}
              <button type="button" disabled={!canChoose || saving || !dirty} onClick={() => void saveChoice()} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-purple-600 to-pink-600 px-4 text-sm font-black text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:cursor-default disabled:from-white/10 disabled:to-white/10 disabled:text-gray-400">{saving ? <><Loader2 size={16} className="animate-spin" /> نحفظ اختيارك…</> : choice?.submitted && !dirty ? <><CheckCircle2 size={16} /> اختيارك محفوظ</> : <><LockKeyhole size={15} /> {choice?.submitted ? "حفظ التغيير" : "حفظ اختياري"}</>}</button>
              <p role="status" aria-live="polite" className="mt-3 text-center text-[11px] leading-6 text-gray-400">{dirty ? "التغيير لم يُحفظ بعد." : choice?.submitted ? choice.chosen_number === null ? "محفوظ: تفضّل الاستمرار مع مجموعة." : `محفوظ: ${selectedName || `المشارك #${choice.chosen_number}`}. إذا اخترتوا بعض، يظهر لقاؤكم في الجولة التالية.` : "إذا ما اخترت أحداً، تكمل تلقائياً مع مجموعة."}</p>
            </section>
          )}
          {pair && <p className="flex items-start gap-2.5 px-1 text-xs leading-6 text-gray-400"><Users size={16} className="mt-1 shrink-0 text-violet-300" />{round < 6 ? "بعد هذا اللقاء ترجعون للمجموعات، وتبدأ فرصة جديدة للتعارف." : "هذا لقاؤكم في الجولة الأخيرة. استمتعوا بآخر السوالف."}</p>}
          {kind === "group" && round === 6 && <p className="flex items-start gap-2.5 rounded-2xl border border-violet-300/15 bg-violet-400/[0.055] p-4 text-xs leading-6 text-violet-100"><Sparkles size={17} className="mt-0.5 shrink-0" />هذه جولتنا الأخيرة. خذوا راحتكم في السوالف؛ ما فيه اختيار لجولة إضافية.</p>}
          {kind === "group" && <p className="flex items-start gap-2 px-1 text-[11px] leading-6 text-gray-500"><ShieldCheck size={15} className="mt-1 shrink-0" />ما نعرض مَن اختارك أو اختيارات غيرك. يظهر لك فقط اللقاء إذا اخترتوا بعض.</p>}
        </>
      )}
      {setup && <div className="space-y-4 px-1">{INTRO_STEPS.map(({ Icon, label, description }) => <div key={label} className="flex gap-3"><Icon size={17} className="mt-1 shrink-0 text-violet-300" /><div><p className="text-sm font-bold text-gray-200">{label}</p><p className="mt-1 text-xs leading-6 text-gray-500">{description}</p></div></div>)}</div>}
      {activityOpen && <ActivitySheet pair={pair} round={round} timerLabel={timerLabel} onClose={closeActivity} />}
    </motion.main>
  )
}

export function MutualChoicePreview({ mode }: { mode: string }) {
  const [state, setState] = useState<MutualChoiceState>(() => ({
    session: { status: mode === "mutualComplete" ? "complete" : mode === "mutualSetup" ? "setup" : mode === "mutualPaused" ? "paused" : "running", round_number: mode === "mutualComplete" || mode === "mutualFinal" ? 6 : mode === "mutualSetup" ? 0 : 2, total_rounds: 6, duration_seconds: 600, remaining_seconds: 462, ends_at: new Date(Date.now() + 462000).toISOString(), server_now: new Date().toISOString(), revision: 1 },
    assignment: { kind: mode === "mutualPair" ? "pair" : mode === "mutualBreak" ? "break" : "group", table_number: mode === "mutualBreak" ? null : 4, group_number: 1, partner_number: mode === "mutualPair" ? 17 : undefined },
    members: mode === "mutualPair" ? [{ participant_number: 8, name: "سارة" }, { participant_number: 17, name: "خالد" }] : [{ participant_number: 8, name: "سارة" }, { participant_number: 17, name: "خالد" }, { participant_number: 23, name: "نورة" }, { participant_number: 31, name: "ريان" }, { participant_number: 12, name: "لينا" }],
    choice: null, previous_outcome: mode === "mutualPair" ? "mutual" : "continue", can_choose: mode !== "mutualFinal", event3_session_key: "preview",
  }))
  if (mode === "mutualWelcome") return <MutualChoiceWelcome onDone={() => window.location.assign("?questionPreview=mutualGroup")} />
  return <div className="event3-shell min-h-[100dvh] bg-[#080610]" dir="rtl"><MutualChoiceRound state={state} myInfo={{ number: 8, name: "سارة" }} correctedNow={Date.now} onChoose={async chosenNumber => { const next = { ...state, session: { ...state.session, revision: state.session.revision + 1 }, choice: { chosen_number: chosenNumber, submitted: true } }; setState(next); return next }} /></div>
}
