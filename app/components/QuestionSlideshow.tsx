import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Zap, Flame, Compass, Sparkles, Handshake, ChevronLeft, ChevronRight } from "lucide-react"
import { specialQuestions, round1Questions, eventQuestions } from "~/lib/e3questions"

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
export function QuestionSlideshow({ defaultSet }: { defaultSet: 'special' | 'set1' }) {
  const [qIdx, setQIdx] = useState(0)
  const [activeSet, setActiveSet] = useState<'special' | 'set1' | 'set2'>(defaultSet)
  const [qTrans, setQTrans] = useState<'none' | 'next' | 'prev'>('none')

  const currentQs = activeSet === 'special' ? specialQuestions : activeSet === 'set2' ? eventQuestions : round1Questions
  const q = currentQs[Math.min(qIdx, currentQs.length - 1)]
  const lc = levelColor(q.level)

  const pick = (s: 'special' | 'set1' | 'set2') => { setActiveSet(s); setQIdx(0) }
  const goPrev = () => { if (qIdx <= 0) return; setQTrans('prev'); setQIdx(i => i - 1); setTimeout(() => setQTrans('none'), 300) }
  const goNext = () => { if (qIdx >= currentQs.length - 1) return; setQTrans('next'); setQIdx(i => i + 1); setTimeout(() => setQTrans('none'), 300) }

  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${lc.bg} ${lc.border} p-5 space-y-4`}>
      {/* Tabs */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-0.5 bg-gray-900/60 border border-gray-700/50 rounded-full p-1">
          {defaultSet === 'special' && (
            <button onClick={() => pick('special')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                activeSet === 'special' ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}>
              المميزة
            </button>
          )}
          <button onClick={() => pick('set1')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              activeSet === 'set1' ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'
            }`}>
            المجموعة ١
          </button>
          <button onClick={() => pick('set2')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              activeSet === 'set2' ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'
            }`}>
            المجموعة ٢
          </button>
        </div>
      </div>

      {/* Level badge */}
      <div className="flex items-center justify-center gap-2">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${lc.icon}`}>
          <LevelIcon icon={q.levelIcon} />
        </div>
        <div className="text-center">
          <p className={`text-xs font-semibold ${lc.text}`}>{q.levelTitle}</p>
          <p className="text-gray-600 text-[10px]">{levelDesc(q.level)}</p>
        </div>
      </div>

      {/* Question card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${activeSet}-${qIdx}`}
          initial={{ opacity: 0, x: qTrans === 'next' ? 20 : qTrans === 'prev' ? -20 : 0 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: qTrans === 'next' ? -20 : 20 }}
          transition={{ duration: 0.25 }}
          className="bg-gray-900/60 rounded-xl p-4 space-y-2"
        >
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${lc.icon} text-white`}>
              {qIdx + 1}
            </span>
            <h5 className="text-white text-sm font-bold">{q.title}</h5>
          </div>
          <p className="text-gray-300 text-sm leading-relaxed pr-8">{q.question}</p>
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3">
        <button onClick={goPrev} disabled={qIdx === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800/60 text-gray-400 hover:text-white hover:bg-gray-700/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
          <ChevronRight size={14} /> السابق
        </button>
        <div className="flex-1 h-1 bg-gray-800/80 rounded-full overflow-hidden">
          <motion.div className={`h-full rounded-full bg-gradient-to-r ${lc.bar}`}
            animate={{ width: `${((qIdx + 1) / currentQs.length) * 100}%` }} transition={{ duration: 0.4 }} />
        </div>
        <span className="text-gray-600 text-[10px] font-mono whitespace-nowrap">{qIdx + 1}/{currentQs.length}</span>
        <button onClick={goNext} disabled={qIdx === currentQs.length - 1}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800/60 text-gray-400 hover:text-white hover:bg-gray-700/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
          التالي <ChevronLeft size={14} />
        </button>
      </div>
    </div>
  )
}
