import { useEffect, useId, useRef, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { ArrowDown, ArrowLeft, ArrowRight, Check, Clock3, Heart, ListOrdered, LockKeyhole, Sparkles, Users } from "lucide-react"

const STEPS = [
  { label: "ترتيبك", title: "مين ودك تكمل معه السالفة؟", Icon: ListOrdered },
  { label: "اختياراتكم", title: "طيب، لو ما صار مع الأول؟", Icon: Heart },
  { label: "لقاءاتك", title: "خلّ مكان لفرصة جديدة", Icon: Sparkles },
]
const ar = (value: number) => value.toLocaleString("ar-SA")

export default function RankingDisclaimer({ onContinue, choiceOnly, secondsRemaining }: {
  onContinue: () => void
  choiceOnly: boolean
  secondsRemaining?: number
}) {
  const [step, setStep] = useState(0)
  const [moreToRead, setMoreToRead] = useState(false)
  const reducedMotion = useReducedMotion()
  const titleId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const { title, Icon } = STEPS[step]

  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    content.scrollTop = 0
    headingRef.current?.focus({ preventScroll: true })
    const measure = () => setMoreToRead(content.scrollHeight - content.clientHeight - content.scrollTop > 8)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    if (content.firstElementChild) observer.observe(content.firstElementChild)
    content.addEventListener("scroll", measure, { passive: true })
    return () => { observer.disconnect(); content.removeEventListener("scroll", measure) }
  }, [step])

  const entrance = (delay = 0) => ({
    initial: { opacity: reducedMotion ? 1 : 0, y: reducedMotion ? 0 : 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reducedMotion ? 0 : 0.4, delay: reducedMotion ? 0 : delay, ease: "easeOut" as const },
  })

  return (
    <motion.section {...entrance()} dir="rtl" aria-labelledby={titleId}
      className="event3-glass event3-sheet relative flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-[2rem] border border-violet-300/20 text-right shadow-[0_28px_100px_-38px_rgba(139,92,246,.5)]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div animate={reducedMotion ? {} : { x: [20, -10, 0], opacity: [0.2, 0.35, 0.2] }} transition={{ duration: 5 }}
          className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="absolute -left-20 top-48 h-56 w-56 rounded-full bg-cyan-400/[0.08] blur-3xl" />
      </div>

      <header className="relative shrink-0 border-b border-white/[0.06] px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-xs font-bold text-violet-200"><Sparkles size={14} /> قبل ما ترتّب</span>
          <span className="text-[11px] font-medium text-white/40">{ar(step + 1)} من ٣</span>
        </div>
        <ol aria-label="خطوات شرح الترتيب" className="mt-4 flex gap-2">
          {STEPS.map((item, index) => (
            <li key={item.label} aria-current={step === index ? "step" : undefined} className="min-w-0 flex-1">
              <div aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-white/[0.07]">
                <motion.div animate={{ width: index <= step ? "100%" : "0%" }} transition={{ duration: reducedMotion ? 0 : 0.35 }} className="h-full rounded-full bg-gradient-to-l from-violet-400 to-cyan-300" />
              </div>
              <span className={`mt-2 block text-[11px] ${index === step ? "font-bold text-cyan-100" : "text-white/35"}`}>{item.label}</span>
            </li>
          ))}
        </ol>
      </header>

      <div ref={contentRef} className="event3-scroll relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 sm:py-6">
        <motion.div key={step} {...entrance()}>
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-200/15 bg-gradient-to-br from-violet-400/15 to-cyan-300/5 text-violet-200 shadow-[inset_0_1px_0_rgba(255,255,255,.1)]"><Icon size={20} strokeWidth={1.6} /></div>
            <h1 id={titleId} ref={headingRef} tabIndex={-1} className="text-[1.4rem] font-black leading-[1.6] tracking-tight text-white outline-none sm:text-2xl">{title}</h1>
          </div>

          {step === 0 && <>
            <p className="mt-3 text-sm leading-7 text-slate-300">حط أكثر شخص ودك تقابله أول، وبعده فكّر:</p>
            <p className="mt-2 text-lg font-bold leading-8 text-violet-100">«طيب لو ما صار لي لقاء معه، مين أبي بعده؟»</p>
            <p className="mt-2 text-sm leading-7 text-slate-300">وكمّل كذا إلى آخر اسم. بعد كل جولة، رتّب اللي قابلتهم كلهم في قائمة واحدة.</p>
            <div aria-hidden="true" className="my-5 space-y-2 rounded-2xl border border-white/[0.07] bg-black/15 p-3">
              {["أكثر شخص ودي أقابله", "لو ما صار، هذا اللي بعده", "وبعده هذا…"].map((label, index) => (
                <motion.div key={label} {...entrance(0.12 + index * 0.1)} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.035] px-3 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-violet-200/15 bg-violet-400/10 text-sm font-bold text-violet-100">{ar(index + 1)}</span>
                  <span className="text-xs font-medium text-slate-200">{label}</span>
                  <span className="mr-auto text-white/20">⠿</span>
                </motion.div>
              ))}
              <p className="pt-1 text-center text-[11px] text-white/40">وكمّل إلى آخر اسم</p>
            </div>
            <div className="flex items-start gap-2.5 rounded-2xl border border-cyan-200/10 bg-cyan-300/[0.045] p-3.5 text-xs leading-6 text-cyan-50/80">
              <Users size={16} className="mt-1 shrink-0 text-cyan-200" />
              <p>ما تحتاج تختار واحد من كل طاولة. لو أكثر ثلاثة ارتحت لهم كانوا في نفس الطاولة، عادي تحطهم أول ثلاثة.</p>
            </div>
          </>}

          {step === 1 && <>
            <p className="mt-3 text-sm leading-7 text-slate-300">كل شخص عنده ترتيب مثلك. لو اختيارك الأول صار له لقاء مع شخص ثاني، نحاول نرتّب لك مع اللي بعده <strong className="font-bold text-white">حسب اختياراتكم أنتم الاثنين.</strong></p>
            <div aria-hidden="true" className="my-5 rounded-2xl border border-white/[0.07] bg-black/15 p-3">
              <p className="mb-3 text-[10px] font-bold text-white/35">مثال توضيحي</p>
              {[1, 2].map((rank, index) => (
                <motion.div key={rank} {...entrance(0.15 + index * 0.18)} className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-white/[0.025] px-3 py-2.5 text-xs text-white/45">
                  <span className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10">{ar(rank)}</span> اختيارك {rank === 1 ? "الأول" : "الثاني"}</span>
                  <span className="rounded-full border border-white/[0.07] px-2 py-1 text-[10px]">عنده لقاء آخر</span>
                </motion.div>
              ))}
              <motion.div {...entrance(0.5)} className="py-1 text-center text-sm text-white/25">⋮</motion.div>
              <motion.div {...entrance(0.65)} className="flex items-center gap-3 rounded-xl border border-cyan-200/25 bg-gradient-to-l from-cyan-300/10 to-violet-400/10 px-3 py-3 shadow-[0_0_24px_-12px_rgba(103,232,249,.4)]">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-200/10 font-bold text-cyan-100">٦</span>
                <span className="text-xs font-bold text-cyan-50">ممكن يكون لقاؤك هنا</span><Heart size={15} className="mr-auto text-cyan-200" />
              </motion.div>
            </div>
            <p className="text-sm leading-7 text-slate-300">وممكن الأسماء اللي فوق تكون مرتبطة بلقاءات ثانية، فيصير لقاؤك مع <strong className="text-cyan-100">رقم ٦ أو حتى ١٠.</strong></p>
            <p className="mt-3 text-xs leading-6 text-white/50">عشان كذا، لا ترتّب أول ثلاثة وتترك الباقي عشوائي.</p>
          </>}

          {step === 2 && <>
            <p className="mt-3 text-sm leading-7 text-slate-300">وممكن تقابل <strong className="text-white">شخص ما كان معك في أي مجموعة.</strong></p>
            <p className="mt-2 text-sm leading-7 text-slate-300">مثلًا، لو كل اللي قابلتهم صار لهم لقاء مع ناس من مجموعات ثانية، نرتّب لك لقاء مع شخص من خارج قائمتك عشان تكون لك فرصة تتعرف على أحد جديد.</p>
            <div aria-hidden="true" className="my-5 overflow-hidden rounded-2xl border border-violet-200/15 bg-gradient-to-br from-violet-400/[0.08] to-cyan-300/[0.04] p-5 text-center">
              <div className="flex items-center justify-center gap-4">
                <motion.div {...entrance(0.15)} className="flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-300/25 bg-violet-400/10 text-sm font-bold text-violet-100">أنت</motion.div>
                <div className="flex gap-1.5">{[0, 1, 2].map(i => <motion.span key={i} {...entrance(0.3 + i * 0.12)} className="h-1 w-1 rounded-full bg-cyan-200/60" />)}</div>
                <motion.div {...entrance(0.65)} className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-200/25 bg-cyan-300/10 text-cyan-100"><Sparkles size={24} strokeWidth={1.5} /></motion.div>
              </div>
              <p className="mt-4 text-sm font-bold text-white">شخص جديد، وسالفة جديدة</p>
              <p className="mt-1 text-[11px] text-white/45">فرصة من خارج قائمتك</p>
            </div>
            <div className="rounded-2xl border border-violet-200/15 bg-violet-400/[0.06] p-4">
              <p className="text-sm font-bold leading-7 text-violet-100">{choiceOnly ? "عندك ٣ لقاءات، لكن مو شرط تكون مع أول ٣ في قائمتك." : "ترتيبك يساعدنا في لقاء اختيارك، وعندك أيضًا لقاء يرشّحه النظام."}</p>
              <p className="mt-1 text-xs leading-6 text-slate-300">رتّب القائمة كاملة بعناية؛ كل اسم فيها ممكن يصير أحد لقاءاتك.</p>
            </div>
          </>}
        </motion.div>
      </div>

      <footer className="relative shrink-0 border-t border-white/[0.07] bg-[#0b0913]/90 px-5 pb-5 pt-4 sm:px-7">
        {moreToRead && <button type="button" onClick={() => contentRef.current?.scrollBy({ top: contentRef.current.clientHeight * 0.7, behavior: reducedMotion ? "instant" : "smooth" })} className="mb-2 flex min-h-8 w-full items-center justify-center gap-1.5 text-[11px] text-cyan-200/80">مرّر لقراءة باقي التوضيح <ArrowDown size={12} /></button>}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-white/45">
          <span className="flex items-center gap-1.5"><LockKeyhole size={11} /> ترتيبك سرّي</span>
          {secondsRemaining !== undefined && <span className={`flex items-center gap-1.5 tabular-nums ${secondsRemaining <= 60 ? "text-amber-200" : ""}`}><Clock3 size={11} /> وقت الترتيب مستمر · <span dir="ltr">{ar(Math.floor(Math.max(0, secondsRemaining) / 60))}:{ar(Math.max(0, secondsRemaining) % 60).padStart(2, "٠")}</span></span>}
        </div>
        <div className="flex gap-2.5">
          {step > 0 && <button type="button" onClick={() => setStep(value => value - 1)} aria-label="الخطوة السابقة" className="event3-soft-action flex min-h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 text-violet-100"><ArrowRight size={18} /></button>}
          <motion.button type="button" whileTap={reducedMotion ? undefined : { scale: 0.98 }} onClick={() => step === 2 ? onContinue() : setStep(value => value + 1)}
            className="event3-action event3-primary-action flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-violet-300/20 bg-gradient-to-l from-violet-500 via-purple-600 to-indigo-600 px-4 text-sm font-bold text-white shadow-[0_8px_24px_-12px_rgba(139,92,246,.65)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-200">
            {step === 2 ? <><Check size={18} /> فهمت — أبدأ ترتيبي</> : <>التالي <ArrowLeft size={17} /></>}
          </motion.button>
        </div>
      </footer>
    </motion.section>
  )
}
