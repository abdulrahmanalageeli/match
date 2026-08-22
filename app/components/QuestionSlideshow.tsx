import { useEffect, useId, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Zap, Flame, Compass, Sparkles, Handshake, ChevronLeft, ChevronRight,
  List, X, Check, Layers3,
} from "lucide-react"
import { choiceQuestions, specialQuestions, round1Questions, eventQuestions, type QuestionItem } from "~/lib/e3questions"
import { rhythmQuestions, partnershipQuestions } from "~/lib/e3extraquestions"

// ─── Level styling helpers ─────────────────────────────────────────────────────
export const levelColor = (lv: number) => [
  { bg: "from-emerald-500/20 to-green-500/10",  border: "border-emerald-600/40", text: "text-emerald-200", bar: "from-emerald-400 to-green-500",  icon: "bg-gradient-to-r from-emerald-500 to-green-500"  },
  { bg: "from-cyan-500/20 to-blue-600/10",      border: "border-cyan-600/40",    text: "text-cyan-200",    bar: "from-cyan-400 to-blue-500",    icon: "bg-gradient-to-r from-cyan-500 to-blue-600"     },
  { bg: "from-amber-500/20 to-orange-600/10",   border: "border-amber-600/40",  text: "text-amber-200",  bar: "from-amber-400 to-orange-500",  icon: "bg-gradient-to-r from-amber-500 to-orange-600"  },
  { bg: "from-purple-500/20 to-pink-600/10",    border: "border-purple-600/40", text: "text-purple-200", bar: "from-purple-400 to-pink-500",    icon: "bg-gradient-to-r from-purple-500 to-pink-600"  },
  { bg: "from-teal-500/20 to-green-600/10",     border: "border-teal-600/40",   text: "text-teal-200",   bar: "from-teal-400 to-green-500",    icon: "bg-gradient-to-r from-teal-500 to-green-600"   },
][lv] ?? { bg: "from-gray-500/20 to-gray-600/10", border: "border-gray-600/40", text: "text-gray-200", bar: "from-gray-400 to-gray-500", icon: "bg-gray-600" }

export const levelDesc = (lv: number) => [
  "بداية خفيفة وسريعة",
  "الشغف والشخصية",
  "القيم وما يهمك",
  "تجارب صنعتك",
  "مواقف تكشف التوافق",
][lv] ?? ""

const levelShortLabel = ["بداية", "شرارة", "جوهر", "تجارب", "توافق"]

export function LevelIcon({ icon, className = "w-4 h-4 text-white" }: { icon: string; className?: string }) {
  if (icon === "Zap") return <Zap className={className} />
  if (icon === "Flame") return <Flame className={className} />
  if (icon === "Compass") return <Compass className={className} />
  if (icon === "Sparkles") return <Sparkles className={className} />
  if (icon === "Handshake") return <Handshake className={className} />
  return null
}

// ─── Shared Question Slideshow Component ──────────────────────────────────────
type QuestionSet = 'choice' | 'special' | 'set1' | 'set2' | 'rhythm' | 'partnership'

function availableQuestionSets(defaultSet: QuestionSet): QuestionSet[] {
  // Phase 2 opens with everyday rhythm; Phase 3 opens with partnership.
  // The other tracks remain available when a pair wants a different direction.
  if (defaultSet === 'choice') return ['rhythm', 'choice', 'set1', 'set2']
  if (defaultSet === 'special') return ['rhythm', 'special', 'set1', 'set2']
  return ['partnership', 'set1', 'set2']
}

const setDescription: Record<QuestionSet, string> = {
  rhythm: 'العادات، القرب، وكيف تعيش يومك',
  partnership: 'الثقة، الالتزام، وبناء علاقة متوازنة',
  choice: 'ما تحتاجه وتقدّره في العلاقات القريبة',
  special: 'الشخصية والتجارب من زوايا غير متوقعة',
  set1: 'ما يشكّلك وما لا تتنازل عنه',
  set2: 'قصص وقرارات تكشف طريقة تفكيرك',
}

const setLabel: Record<QuestionSet, string> = {
  rhythm: 'إيقاع الحياة',
  partnership: 'الشراكة والثقة',
  choice: 'ما يهمك',
  special: 'زوايا جديدة',
  set1: 'القيم والهوية',
  set2: 'قصص وقرارات',
}

const setMap: Record<QuestionSet, QuestionItem[]> = {
  choice: choiceQuestions,
  special: specialQuestions,
  set1: round1Questions,
  set2: eventQuestions,
  rhythm: rhythmQuestions,
  partnership: partnershipQuestions,
}

export function QuestionSlideshow({ defaultSet }: { defaultSet: QuestionSet }) {
  const availableSets = availableQuestionSets(defaultSet)
  const [activeSet, setActiveSet] = useState<QuestionSet>(() => availableSets[0])
  const [positions, setPositions] = useState<Partial<Record<QuestionSet, number>>>({})
  const [direction, setDirection] = useState(0)
  const [showQuestionList, setShowQuestionList] = useState(false)
  const questionHeadingRef = useRef<HTMLHeadingElement>(null)
  const questionListTriggerRef = useRef<HTMLButtonElement>(null)
  const questionListDialogRef = useRef<HTMLDivElement>(null)
  const questionListCloseRef = useRef<HTMLButtonElement>(null)
  const questionListReturnFocusRef = useRef<HTMLElement | null>(null)
  const restoreQuestionListFocusRef = useRef(true)
  const focusQuestionAfterChangeRef = useRef(false)
  const questionListTitleId = useId()

  const currentQs = setMap[activeSet]
  const qIdx = Math.min(positions[activeSet] ?? 0, currentQs.length - 1)
  const q = currentQs[qIdx]
  const lc = levelColor(q.level)
  const availableLevels = [...new Set(currentQs.map(item => item.level))].sort((a, b) => a - b)
  const phaseSetLabel = (set: QuestionSet) => setLabel[set]

  const moveTo = (index: number, focusQuestion = false) => {
    const safeIndex = Math.max(0, Math.min(index, currentQs.length - 1))
    focusQuestionAfterChangeRef.current = focusQuestion
    setDirection(safeIndex === qIdx ? 0 : safeIndex > qIdx ? 1 : -1)
    setPositions(previous => ({ ...previous, [activeSet]: safeIndex }))
    if (focusQuestion && safeIndex === qIdx) {
      window.requestAnimationFrame(() => questionHeadingRef.current?.focus({ preventScroll: true }))
    }
  }
  const pick = (set: QuestionSet) => {
    setDirection(0)
    setActiveSet(set)
  }
  const goPrev = () => moveTo(qIdx - 1)
  const goNext = () => moveTo(qIdx + 1)
  const openQuestionList = () => {
    questionListReturnFocusRef.current = questionListTriggerRef.current
    restoreQuestionListFocusRef.current = true
    setShowQuestionList(true)
  }

  const closeQuestionList = (focusQuestion = false) => {
    restoreQuestionListFocusRef.current = !focusQuestion
    if (focusQuestion) focusQuestionAfterChangeRef.current = true
    setShowQuestionList(false)
  }

  useEffect(() => {
    if (!focusQuestionAfterChangeRef.current || showQuestionList) return
    focusQuestionAfterChangeRef.current = false
    // The question card uses AnimatePresence in wait mode, so its heading is not
    // mounted until the outgoing card finishes. Focus after that short exit.
    const timer = window.setTimeout(() => questionHeadingRef.current?.focus({ preventScroll: true }), 300)
    return () => window.clearTimeout(timer)
  }, [activeSet, qIdx, showQuestionList])

  useEffect(() => {
    if (!showQuestionList) return
    const dialog = questionListDialogRef.current
    if (!dialog) return

    const previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => questionListCloseRef.current?.focus())
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ))
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        restoreQuestionListFocusRef.current = true
        setShowQuestionList(false)
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousBodyOverflow
      if (restoreQuestionListFocusRef.current) {
        const returnTarget = questionListReturnFocusRef.current
        window.requestAnimationFrame(() => {
          if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true })
        })
      }
      restoreQuestionListFocusRef.current = true
    }
  }, [showQuestionList])

  return (
    <section
      dir="rtl"
      aria-label="أسئلة الحوار"
      className={`relative overflow-hidden rounded-[1.75rem] border bg-gradient-to-br ${lc.bg} ${lc.border} p-3.5 sm:p-5 shadow-xl shadow-black/20`}
    >
      <div inert={showQuestionList} aria-hidden={showQuestionList || undefined}>
      {/* Track header: meaningful name and one clear way to browse everything. */}
      <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-gray-950/55 p-3">
        <div className="min-w-0">
          <div className="mb-0.5 flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
            <Layers3 className="h-3.5 w-3.5" /> مسار الحوار
          </div>
          <p className="truncate text-sm font-black text-white">{phaseSetLabel(activeSet)}</p>
          <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-400">{setDescription[activeSet]}</p>
        </div>
        <button
          ref={questionListTriggerRef}
          onClick={openQuestionList}
          type="button"
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-xs font-bold text-gray-200 active:scale-95"
          aria-label="عرض مسارات وقائمة الأسئلة"
        >
          <List className="h-4 w-4" /> تغيير المسار
        </button>
      </div>

      {/* Show the conversation getting deeper without asking the pair to make
          five extra navigation decisions. Exact jumps remain in Change track. */}
      <div className="mb-3 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/15 px-3 py-2" aria-label={`عمق الحوار: ${levelShortLabel[q.level]}`}>
        <span className="shrink-0 text-[10px] font-bold text-gray-400">عمق الحوار</span>
        <div className="flex flex-1 items-center gap-1" aria-hidden="true">
          {availableLevels.map(level => (
            <span key={level} className={`h-1.5 flex-1 rounded-full ${level <= q.level ? `bg-gradient-to-r ${levelColor(level).bar}` : 'bg-gray-800'}`} />
          ))}
        </div>
        <span className={`shrink-0 text-[10px] font-black ${lc.text}`}>{levelShortLabel[q.level]}</span>
      </div>

      {/* The question is the visual focus. Larger type and a stable height improve mobile use. */}
      <AnimatePresence mode="wait" custom={direction} initial={false}>
        <motion.article
          key={`${activeSet}-${qIdx}`}
          custom={direction}
          initial={{ opacity: 0, x: direction > 0 ? 28 : direction < 0 ? -28 : 0, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: direction > 0 ? -28 : 28, scale: 0.98 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.12}
          onDragEnd={(_, info) => {
            if (info.offset.x < -60 && qIdx < currentQs.length - 1) goNext()
            if (info.offset.x > 60 && qIdx > 0) goPrev()
          }}
          className="flex min-h-[250px] flex-col rounded-3xl border border-white/[0.07] bg-gray-950/75 p-5 text-center shadow-inner sm:min-h-[280px] sm:p-7"
        >
          <div className="flex items-center justify-between gap-3">
            <span className={`inline-flex items-center gap-2 text-xs font-bold ${lc.text}`}>
              <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${lc.icon} shadow-lg`}>
                <LevelIcon icon={q.levelIcon} />
              </span>
              {levelDesc(q.level)}
            </span>
            <span dir="ltr" className="shrink-0 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-mono text-gray-400">{qIdx + 1} / {currentQs.length}</span>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center py-6">
            <p className={`mb-3 text-sm font-black ${lc.text}`}>{q.title}</p>
            <h3 ref={questionHeadingRef} tabIndex={-1} className="text-balance text-[1.35rem] font-black leading-[1.75] text-white outline-none sm:text-2xl">{q.question}</h3>
          </div>

          <p className="border-t border-white/[0.07] pt-3 text-xs font-medium leading-5 text-gray-400">يجيب كل منكما، ثم ناقشا التشابه والاختلاف قبل السؤال التالي</p>
        </motion.article>
      </AnimatePresence>

      {/* Progress has its own row, leaving the navigation buttons easy to tap. */}
      <div className="mt-4 flex items-center gap-3 px-1">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-800">
          <motion.div
            className={`h-full rounded-full bg-gradient-to-r ${lc.bar}`}
            animate={{ width: `${((qIdx + 1) / currentQs.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <span className="text-[10px] font-bold text-gray-500">{Math.round(((qIdx + 1) / currentQs.length) * 100)}٪</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <button
          onClick={goPrev}
          disabled={qIdx === 0}
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/[0.07] bg-gray-900/70 text-sm font-bold text-gray-300 transition-all active:scale-[0.98] disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" /> السابق
        </button>
        <button
          onClick={goNext}
          disabled={qIdx === currentQs.length - 1}
          className={`flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r ${lc.bar} text-sm font-black text-gray-950 shadow-lg transition-all active:scale-[0.98] disabled:opacity-30`}
        >
          التالي <ChevronLeft className="h-5 w-5" />
        </button>
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {`السؤال ${qIdx + 1} من ${currentQs.length}: ${q.question}`}
      </p>
      </div>

      {/* Mobile-first browser: switch tracks, scan titles, or jump directly. */}
      <AnimatePresence>
        {showQuestionList && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end bg-black/70 backdrop-blur-sm sm:items-center sm:justify-center sm:p-5"
            onClick={event => { if (event.target === event.currentTarget) closeQuestionList() }}
          >
            <motion.div
              ref={questionListDialogRef}
              initial={{ y: 36 }} animate={{ y: 0 }} exit={{ y: 36 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[2rem] border border-white/10 bg-gray-950 text-white shadow-2xl sm:max-w-lg sm:rounded-[2rem]"
              role="dialog" aria-modal="true" aria-labelledby={questionListTitleId} tabIndex={-1}
            >
              <header className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
                <div>
                  <h2 id={questionListTitleId} className="font-black">اختاروا مسار الحوار</h2>
                  <p className="mt-0.5 text-xs text-gray-500">مكان واحد لتغيير الموضوع أو القفز لسؤال محدد</p>
                </div>
                <button ref={questionListCloseRef} type="button" onClick={() => closeQuestionList()} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.06] text-gray-300" aria-label="إغلاق">
                  <X className="h-5 w-5" />
                </button>
              </header>

              <div className="border-b border-white/[0.07] p-4">
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="مسارات الحوار">
                  {availableSets.map(set => (
                    <button
                      key={set}
                      type="button"
                      onClick={() => pick(set)}
                      aria-pressed={activeSet === set}
                      className={`rounded-2xl border p-3 text-right transition-all ${activeSet === set ? 'border-purple-400/50 bg-purple-500/15' : 'border-white/[0.06] bg-white/[0.03]'}`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-black text-white">{phaseSetLabel(set)}</span>
                        {activeSet === set && <Check className="h-4 w-4 text-purple-300" />}
                      </span>
                      <span className="mt-1 block text-[10px] leading-4 text-gray-500">{setDescription[set]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
                {availableLevels.map(level => {
                  const colors = levelColor(level)
                  const items = currentQs.map((item, index) => ({ item, index })).filter(entry => entry.item.level === level)
                  return (
                    <section key={level} className="mb-5">
                      <div className={`sticky top-0 z-10 mb-2 flex items-center gap-2 bg-gray-950/95 py-2 text-xs font-black backdrop-blur ${colors.text}`}>
                        <span className={`h-2 w-2 rounded-full bg-gradient-to-r ${colors.bar}`} />
                        {levelShortLabel[level]} <span className="font-normal text-gray-600">· {items.length} أسئلة</span>
                      </div>
                      <div className="space-y-1.5">
                        {items.map(({ item, index }) => (
                          <button
                            key={`${activeSet}-${index}`}
                            type="button"
                            onClick={() => { moveTo(index, true); closeQuestionList(true) }}
                            aria-current={index === qIdx ? 'true' : undefined}
                            className={`flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2 text-right ${index === qIdx ? `${colors.border} bg-white/[0.07]` : 'border-white/[0.04] bg-white/[0.025]'}`}
                          >
                            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-black ${index === qIdx ? `${colors.icon} text-white` : 'bg-gray-900 text-gray-500'}`}>{index + 1}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-bold text-gray-200">{item.title}</span>
                              <span className="mt-0.5 block truncate text-[11px] text-gray-600">{item.question}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
                  )
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
