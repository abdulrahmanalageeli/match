import { useEffect, useId, useRef, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { ArrowDown, ArrowLeft, ArrowRight, Check, Clock3, Hand, HeartHandshake, MessageCircle, ShieldCheck, Users } from "lucide-react"

const RULES = [
  { title: "خذ مساحتك، واترك مساحة لغيرك", body: "شارك فكرتك بدون ما تطوّل، ثم أعطِ غيرك الدور. إذا تكلمت أكثر من مرة ولسه فيه أحد ما شارك، خلّ الفرصة له." },
  { title: "إذا أحد طول، رجّعوا الحوار بلطف", body: "تنظيم الكلام مسؤولية الجميع، مو بس المنسّق. لا تنتظرون الوقت يخلص؛ عادي تقولون:", quote: "خلّونا نسمع من البقية، عشان الكل ياخذ فرصته.", note: "ولو أحد ذكّرك، خذها بروح حلوة؛ التذكير بالوقت مو تقليل من كلامك." },
  { title: "عادي تتجاوز أي سؤال", body: "شارك بالقدر اللي يريحك. وإذا أحد ما حب يجاوب، نتجاوز السؤال بدون إلحاح أو طلب تبرير." },
  { title: "اختلفوا باحترام", body: "مو لازم تتفقون، لكن بدون سخرية أو تعليقات تقلّل من أحد. اسألوا بفضول بدل ما تحاولون تثبتون إن رأيكم الصح." },
  { title: "خلّوا القصص عند أصحابها", body: "لا تصوّرون أو تسجّلون أحد بدون إذنه، ولا تنقلون قصصه الشخصية خارج الجلسة." },
  { title: "تعرّفوا على الجميع قبل ما تحسمون", body: "لا تخلّون كل تفاعلكم مع شخص واحد. أعطوا كل شخص فرصة، وخلّوا ترتيبكم واختياراتكم خاصة فيكم." },
]
const CHAPTERS = [
  { label: "مساحة للجميع", title: "خلّونا نعطي بعض فرصة", Icon: Users },
  { label: "راحة واحترام", title: "على راحتك، وباحترام", Icon: HeartHandshake },
  { label: "ثقة وخصوصية", title: "الثقة تبدأ منّا", Icon: ShieldCheck },
]
const ar = (value: number) => value.toLocaleString("ar-SA")

export default function GroupRoundRules({ round, onAgree, secondsRemaining }: {
  round: number
  onAgree: () => void
  secondsRemaining?: number
}) {
  const [step, setStep] = useState(0)
  const [moreToRead, setMoreToRead] = useState(false)
  const reducedMotion = useReducedMotion()
  const titleId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const { title, Icon } = CHAPTERS[step]

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

  const enter = (delay = 0) => ({
    initial: { opacity: reducedMotion ? 1 : 0, y: reducedMotion ? 0 : 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reducedMotion ? 0 : 0.4, delay: reducedMotion ? 0 : delay, ease: "easeOut" as const },
  })

  return (
    <motion.section {...enter()} dir="rtl" aria-labelledby={titleId}
      className="event3-glass event3-sheet relative flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-[2rem] border border-violet-200/20 text-right shadow-[0_28px_100px_-38px_rgba(139,92,246,.5)]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div animate={reducedMotion ? {} : { opacity: [0.15, 0.3, 0.2], x: [12, -12, 0] }} transition={{ duration: 4 }} className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-violet-400/20 blur-3xl" />
        <div className="absolute -left-24 top-64 h-56 w-56 rounded-full bg-cyan-300/[0.08] blur-3xl" />
      </div>

      <header className="relative shrink-0 border-b border-white/[0.06] px-5 pb-4 pt-5 sm:px-7">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-xs font-bold text-violet-200"><HeartHandshake size={16} /> قبل الجولة {ar(round)}</span>
          <span className="text-[11px] text-white/40">{ar(step + 1)} من ٣</span>
        </div>
        <ol aria-label="قواعد الجلسة" className="mt-4 flex gap-2">
          {CHAPTERS.map((chapter, index) => <li key={chapter.label} aria-current={index === step ? "step" : undefined} className="min-w-0 flex-1">
            <div aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-white/[0.07]"><motion.div animate={{ width: index <= step ? "100%" : "0%" }} transition={{ duration: reducedMotion ? 0 : 0.35 }} className="h-full rounded-full bg-gradient-to-l from-violet-400 to-cyan-200" /></div>
            <span className={`mt-2 block text-[10px] sm:text-[11px] ${index === step ? "font-bold text-cyan-100" : "text-white/40"}`}>{chapter.label}</span>
          </li>)}
        </ol>
      </header>

      <div ref={contentRef} className="event3-scroll relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 sm:py-6">
        <motion.div key={step} {...enter()}>
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-200/15 bg-violet-400/10 text-violet-200"><Icon size={21} strokeWidth={1.6} /></div>
            <h1 ref={headingRef} id={titleId} tabIndex={-1} className="text-[1.4rem] font-black leading-[1.6] tracking-tight text-white outline-none sm:text-2xl">{title}</h1>
          </div>
          {step === 0 && <p className="mt-3 text-sm leading-7 text-slate-300">وقت الجلسة محدود، ونبي نطلع منها وقد تعرّفنا على الجميع. خلّونا نتفق على هالأشياء:</p>}
          {step === 0 && <div aria-hidden="true" className="my-4 flex items-center justify-center gap-2 rounded-2xl border border-white/[0.06] bg-black/10 px-3 py-3">
            {[{ Icon: MessageCircle, label: "شارك" }, { Icon: Hand, label: "افسح مجال" }, { Icon: Users, label: "اسمع غيرك" }].map((item, index) => <motion.div key={item.label} {...enter(0.12 + index * 0.12)} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-cyan-200/15 bg-cyan-200/[0.04] text-cyan-100"><item.Icon size={16} strokeWidth={1.6} /></span>
              <span className="text-[10px] font-medium text-white/60">{item.label}</span>
            </motion.div>)}
          </div>}

          <div className="mt-5 space-y-3">
            {RULES.slice(step * 2, step * 2 + 2).map((rule, index) => <motion.article key={rule.title} {...enter(0.12 + index * 0.1)}
              className={`rounded-2xl border p-4 ${step === 0 && index === 1 ? "border-cyan-200/20 bg-gradient-to-br from-cyan-300/[0.065] to-violet-400/[0.04]" : "border-white/[0.07] bg-white/[0.025]"}`}>
              <div className="flex items-start gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-violet-200/15 bg-violet-400/10 text-xs font-bold text-violet-100">{ar(step * 2 + index + 1)}</span>
                <h2 className="text-sm font-bold leading-7 text-white">{rule.title}</h2>
              </div>
              <p className="mt-2 text-sm leading-7 text-slate-300">{rule.body}</p>
              {rule.quote && <blockquote className="my-3 border-r-2 border-cyan-200/60 pr-3 text-base font-bold leading-8 text-cyan-100">«{rule.quote}»</blockquote>}
              {rule.note && <p className="text-xs leading-6 text-slate-300">{rule.note}</p>}
            </motion.article>)}
          </div>
          {step === 2 && <p className="mt-5 text-center text-sm font-bold leading-7 text-violet-100">كلنا مسؤولين إن الجلسة تكون مريحة وتعطي الجميع فرصة.</p>}
        </motion.div>
      </div>

      <footer className="relative shrink-0 border-t border-white/[0.07] bg-[#0b0913]/90 px-5 pb-5 pt-3 sm:px-7">
        {moreToRead && <button type="button" onClick={() => contentRef.current?.scrollBy({ top: contentRef.current.clientHeight * 0.7, behavior: reducedMotion ? "instant" : "smooth" })} className="mb-2 flex min-h-8 w-full items-center justify-center gap-1.5 text-[11px] text-cyan-200/80">مرّر لقراءة باقي القواعد <ArrowDown size={12} /></button>}
        {secondsRemaining !== undefined && <p className="mb-3 flex items-center justify-center gap-1.5 text-[10px] text-white/45"><Clock3 size={11} /> وقت الجولة مستمر · <span dir="ltr">{ar(Math.floor(Math.max(0, secondsRemaining) / 60))}:{ar(Math.max(0, secondsRemaining) % 60).padStart(2, "٠")}</span></p>}
        <div className="flex gap-2.5">
          {step > 0 && <button type="button" onClick={() => setStep(value => value - 1)} aria-label="القواعد السابقة" className="event3-soft-action flex min-h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 text-violet-100"><ArrowRight size={18} /></button>}
          <motion.button type="button" whileTap={reducedMotion ? undefined : { scale: 0.98 }} onClick={() => step === 2 ? onAgree() : setStep(value => value + 1)}
            className="event3-action event3-primary-action flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-violet-300/20 bg-gradient-to-l from-violet-500 via-purple-600 to-indigo-600 px-4 text-sm font-bold text-white shadow-[0_8px_24px_-12px_rgba(139,92,246,.65)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-200">
            {step === 2 ? <><Check size={18} /> اتفقنا — نبدأ الجولة</> : <>التالي <ArrowLeft size={17} /></>}
          </motion.button>
        </div>
      </footer>
    </motion.section>
  )
}
