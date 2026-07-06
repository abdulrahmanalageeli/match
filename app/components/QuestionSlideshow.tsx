import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Zap, Flame, Compass, Sparkles, Handshake, ChevronLeft, ChevronRight } from "lucide-react"
import { choiceQuestions, specialQuestions, round1Questions, eventQuestions, type QuestionItem } from "~/lib/e3questions"

// ─── Level styling helpers ─────────────────────────────────────────────────────
export const levelColor = (lv: number) => [
  { bg: "from-emerald-500/20 to-green-500/10",  border: "border-emerald-700/40", text: "text-emerald-300", bar: "from-emerald-500 to-green-500",  icon: "bg-gradient-to-r from-emerald-500 to-green-500"  },
  { bg: "from-cyan-500/20 to-blue-600/10",      border: "border-cyan-700/40",    text: "text-cyan-300",    bar: "from-cyan-500 to-blue-500",    icon: "bg-gradient-to-r from-cyan-500 to-blue-600"     },
  { bg: "from-amber-500/20 to-orange-600/10",   border: "border-amber-700/40",  text: "text-amber-300",  bar: "from-amber-500 to-orange-500",  icon: "bg-gradient-to-r from-amber-500 to-orange-600"  },
  { bg: "from-purple-500/20 to-pink-600/10",    border: "border-purple-700/40", text: "text-purple-300", bar: "from-purple-500 to-pink-500",    icon: "bg-gradient-to-r from-purple-500 to-pink-600"  },
  { bg: "from-teal-500/20 to-green-600/10",     border: "border-teal-700/40",   text: "text-teal-300",   bar: "from-teal-500 to-green-500",    icon: "bg-gradient-to-r from-teal-500 to-green-600"   },
][lv] ?? { bg: "from-gray-500/20 to-gray-600/10", border: "border-gray-700/40", text: "text-gray-300", bar: "from-gray-500 to-gray-400", icon: "bg-gray-600" }

export const levelDesc = (lv: number) => [
  "يركز على إيجاد نقاط التواصل السريع والاهتمامات المشتركة",
  "يركز على الشغف، الشخصية، ووجهات النظر بطريقة خفيفة",
  "يركز على القيم الأساسية والمبادئ الشخصية العميقة",
  "يركز على مشاركة التجارب الشخصية والذكريات المؤثرة",
  "يركز على استكشاف السيناريوهات والتوافق في المواقف المختلفة",
][lv] ?? ""

export function LevelIcon({ icon, className = "w-4 h-4 text-white" }: { icon: string; className?: string }) {
  if (icon === "Zap") return <Zap className={className} />
  if (icon === "Flame") return <Flame className={className} />
  if (icon === "Compass") return <Compass className={className} />
  if (icon === "Sparkles") return <Sparkles className={className} />
  if (icon === "Handshake") return <Handshake className={className} />
  return null
}

// ─── Shared Question Slideshow Component ──────────────────────────────────────
type QuestionSet = 'choice' | 'special' | 'set1' | 'set2'

export function QuestionSlideshow({ defaultSet }: { defaultSet: QuestionSet }) {
  const [qIdx, setQIdx] = useState(0)
  const [activeSet, setActiveSet] = useState<QuestionSet>(defaultSet)
  const [qTrans, setQTrans] = useState<'none' | 'next' | 'prev'>('none')

  const setMap: Record<QuestionSet, QuestionItem[]> = {
    choice: choiceQuestions,
    special: specialQuestions,
    set1: round1Questions,
    set2: eventQuestions,
  }
  const setLabel: Record<QuestionSet, string> = {
    choice: 'اختياري',
    special: 'المميزة',
    set1: 'المجموعة ١',
    set2: 'المجموعة ٢',
  }

  const currentQs = setMap[activeSet]
  const q = currentQs[Math.min(qIdx, currentQs.length - 1)]
  const lc = levelColor(q.level)

  const pick = (s: QuestionSet) => { setActiveSet(s); setQIdx(0) }
  const goPrev = () => { if (qIdx <= 0) return; setQTrans('prev'); setQIdx(i => i - 1); setTimeout(() => setQTrans('none'), 300) }
  const goNext = () => { if (qIdx >= currentQs.length - 1) return; setQTrans('next'); setQIdx(i => i + 1); setTimeout(() => setQTrans('none'), 300) }

  const availableSets: QuestionSet[] = defaultSet === 'choice'
    ? ['choice', 'set1', 'set2']
    : defaultSet === 'special'
      ? ['special', 'set1', 'set2']
      : ['set1', 'set2']

  return (
    <div className={`rounded-3xl border bg-gradient-to-br ${lc.bg} ${lc.border} p-5 space-y-4 shadow-xl shadow-black/20`}>
      {/* Tabs */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-0.5 bg-gray-900/70 border border-gray-700/50 rounded-full p-1 shadow-inner">
          {availableSets.map(s => (
            <button key={s} onClick={() => pick(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                activeSet === s ? 'bg-purple-600 text-white shadow-md' : 'text-gray-400 hover:text-white'
              }`}>
              {setLabel[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Level badge */}
      <div className="flex items-center justify-center gap-2.5">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${lc.icon} shadow-lg`}>
          <LevelIcon icon={q.levelIcon} />
        </div>
        <div className="text-center">
          <p className={`text-xs font-bold ${lc.text}`}>{q.levelTitle}</p>
          <p className="text-gray-600 text-[10px] mt-0.5">{levelDesc(q.level)}</p>
        </div>
      </div>

      {/* Question card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${activeSet}-${qIdx}`}
          initial={{ opacity: 0, x: qTrans === 'next' ? 24 : qTrans === 'prev' ? -24 : 0, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: qTrans === 'next' ? -24 : 24, scale: 0.96 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="bg-gray-900/70 backdrop-blur-sm rounded-2xl p-5 space-y-3 border border-white/[0.04]"
        >
          <div className="flex items-center gap-2.5">
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0 ${lc.icon} text-white shadow-md`}>
              {qIdx + 1}
            </span>
            <h5 className="text-white text-sm font-bold leading-snug">{q.title}</h5>
          </div>
          <p className="text-gray-300 text-sm leading-relaxed pr-9">{q.question}</p>
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3">
        <button onClick={goPrev} disabled={qIdx === 0}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-gray-800/60 text-gray-400 hover:text-white hover:bg-gray-700/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
          <ChevronRight size={14} /> السابق
        </button>
        <div className="flex-1 h-1.5 bg-gray-800/80 rounded-full overflow-hidden">
          <motion.div className={`h-full rounded-full bg-gradient-to-r ${lc.bar}`}
            animate={{ width: `${((qIdx + 1) / currentQs.length) * 100}%` }} transition={{ duration: 0.4 }} />
        </div>
        <span className="text-gray-600 text-[10px] font-mono whitespace-nowrap">{qIdx + 1}/{currentQs.length}</span>
        <button onClick={goNext} disabled={qIdx === currentQs.length - 1}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-gray-800/60 text-gray-400 hover:text-white hover:bg-gray-700/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
          التالي <ChevronLeft size={14} />
        </button>
      </div>
    </div>
  )
}
