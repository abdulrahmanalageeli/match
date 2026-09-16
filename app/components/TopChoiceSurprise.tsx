import { useEffect, useId, useRef, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { ArrowLeft, Check, Copy, Crown, Gift, Heart, Sparkles, X } from "lucide-react"

export type ChoiceAward = {
  id: string; reward_code: string; discount_percent: number; tied_winners: number; is_test_mode: boolean; seen_at?: string | null
}

export default function TopChoiceSurprise({ award, onClose }: { award: ChoiceAward; onClose: () => void }) {
  const titleId = useId()
  const reduceMotion = useReducedMotion()
  const cardRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    const overlay = overlayRef.current
    const siblings = overlay?.parentElement ? Array.from(overlay.parentElement.children).filter(node => node !== overlay) as HTMLElement[] : []
    const previousInert = siblings.map(node => ({ node, inert: node.inert }))
    siblings.forEach(node => { node.inert = true })
    document.body.style.overflow = "hidden"
    closeRef.current?.focus({ preventScroll: true })
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose() }
      if (event.key !== "Tab") return
      const buttons = Array.from(cardRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") || [])
      const first = buttons[0], last = buttons.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener("keydown", keydown)
    return () => { previousInert.forEach(({ node, inert }) => { node.inert = inert }); document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", keydown); previouslyFocused?.focus({ preventScroll: true }) }
  }, [onClose])
  useEffect(() => {
    if (reduceMotion) return
    let active = true
    const timer = window.setTimeout(() => {
      import("canvas-confetti").then(({ default: confetti }) => {
        if (active) confetti({ particleCount: 65, spread: 72, startVelocity: 25, gravity: 0.85, scalar: 0.8, origin: { y: 0.35 }, colors: ["#f7d99c", "#c4b5fd", "#e9b1c7", "#ffffff"], disableForReducedMotion: true, zIndex: 330 })
      }).catch(() => {})
    }, 650)
    return () => { active = false; window.clearTimeout(timer) }
  }, [reduceMotion])
  return (
    <motion.div ref={overlayRef} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[320] flex items-center justify-center overflow-y-auto bg-[#070510]/90 p-3 backdrop-blur-xl" role="dialog" aria-modal="true" aria-labelledby={titleId} dir="rtl">
      <motion.div ref={cardRef} initial={reduceMotion ? false : { opacity: 0, y: 22, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} className="relative w-full max-w-sm overflow-y-auto rounded-[32px] border border-amber-100/20 text-center text-white shadow-[0_30px_100px_-25px_rgba(167,139,250,.4)]" style={{ maxHeight: "calc(100dvh - 24px)", background: "radial-gradient(ellipse at 50% 0%,#493052 0%,#1b122a 42%,#100c1b 80%)" }}>
        <button ref={closeRef} onClick={onClose} aria-label="إغلاق المفاجأة" className="absolute left-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200"><X size={18}/></button>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/80 to-transparent" />
        <div className="px-6 pb-6 pt-8 sm:px-8 sm:pt-10 [@media(max-height:650px)]:pb-4 [@media(max-height:650px)]:pt-6">
          <p className="text-[10px] font-bold tracking-[.16em] text-amber-100/65">{award.is_test_mode ? "معاينة تجريبية · بدون خصم فعلي" : "مفاجأة صغيرة، لك أنت"}</p>
          <div className="relative mx-auto mb-5 mt-5 flex h-24 w-24 items-center justify-center [@media(max-height:650px)]:my-3 [@media(max-height:650px)]:h-16 [@media(max-height:650px)]:w-16">
            <motion.div aria-hidden="true" initial={reduceMotion ? false : { rotate: -15, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 140, damping: 14, delay: 0.15 }} className="absolute inset-0 rounded-full border border-amber-200/25 bg-gradient-to-br from-amber-100/15 to-purple-300/5 shadow-[0_0_50px_rgba(249,217,156,.12)]"/>
            <Crown size={38} strokeWidth={1.3} className="relative text-[#f7d99c]" aria-hidden="true"/>
            <Sparkles size={16} className="absolute -right-3 top-2 text-amber-200/70" aria-hidden="true"/>
            <Heart size={13} className="absolute -left-3 bottom-3 text-pink-200/60" aria-hidden="true"/>
          </div>
          <h2 id={titleId} className="text-2xl font-black leading-relaxed text-[#f9e5bd] [@media(max-height:650px)]:text-xl">تركت أثر حلو اليوم</h2>
          <p className="mt-3 text-sm leading-7 text-purple-100/85">{award.tied_winners > 1 ? "مبروك! اسمك من أكثر الأسماء اللي اختاروها في المركز الأول اليوم 🤍" : "مبروك! أكثر شخص اختاروه في المركز الأول اليوم هو أنت 🤍"}</p>
          <p className="mt-2 text-xs leading-6 text-purple-100/50">وحبّينا نفرحك بشيء منّا.</p>
          <motion.div initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.45 }} className="relative mt-6 overflow-hidden rounded-2xl border border-amber-200/25 p-5" style={{ background: "linear-gradient(120deg,rgba(247,217,156,.12),rgba(196,181,253,.06))" }}>
            <div className="mb-2 flex items-center justify-center gap-2 text-xs font-bold text-amber-100/80"><Gift size={15}/> هديّتك للمرّة الجاية</div>
            <div className="font-black leading-none text-[#f9e5bd]" style={{ fontSize: "clamp(52px,15vw,70px)" }} dir="ltr">50<span className="text-3xl">%</span></div>
            <p className="mt-2 text-sm font-bold text-amber-50/90">خصم على مشاركتك القادمة</p>
            <div className="my-4 border-t border-dashed border-amber-100/20"/>
            {award.is_test_mode ? <p className="text-xs text-purple-200/65">تظهر هنا هديّة المشارك في الفعالية الفعلية</p> : <>
              <button onClick={async () => { try { await navigator.clipboard.writeText(award.reward_code); setCopied(true) } catch { setCopied(false) } }} className="mx-auto flex min-h-11 items-center gap-2 rounded-xl px-3 font-mono text-xs tracking-wider text-amber-100 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200" aria-label="نسخ رمز الخصم">
                <span dir="ltr">{award.reward_code}</span>{copied ? <Check size={14}/> : <Copy size={14}/>}
              </button>
              <p className="text-[10px] leading-5 text-purple-100/50" role="status">{copied ? "تم نسخ الرمز" : "الخصم محفوظ لك. ورّ الرمز للمنظّم عند تسجيلك الجاي."}</p>
            </>}
          </motion.div>
          <button onClick={onClose} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-amber-100/20 bg-gradient-to-l from-[#f5dab0] to-[#dbbedf] px-4 py-3 text-sm font-black text-[#26192f] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-200">يا حلو المفاجأة! <ArrowLeft size={16}/></button>
          <p className="mt-3 text-[10px] text-purple-100/35">{award.is_test_mode ? "للتجربة فقط" : "من التوافق الأعمى، بكل ودّ"}</p>
        </div>
      </motion.div>
    </motion.div>
  )
}
