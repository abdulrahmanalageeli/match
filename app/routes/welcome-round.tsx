import { useState, lazy, Suspense } from "react"
import { motion } from "framer-motion"
import { Sparkles, MessageSquare } from "lucide-react"
import { QuestionSlideshow } from "~/components/QuestionSlideshow"

const PromptTopicsModal = lazy(() => import("~/components/PromptTopicsModal"))

// ─── WelcomeRoundPage ──────────────────────────────────────────────────────────
// Self-contained round discussion screen, embeddable as an overlay (like GroupsPage).
// round=1 → same-gender (specialQuestions default)
// round=2 → opposite-gender (round1Questions default)
export default function WelcomeRoundPage({ round = 1 }: { round?: 1 | 2 }) {
  const [showModal, setShowModal] = useState(false)

  const isFirst = round === 1

  return (
    <div className="min-h-full bg-gray-950 relative overflow-hidden" dir="rtl">
      {/* Background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className={`absolute top-0 right-0 w-[400px] h-[400px] rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 ${isFirst ? "bg-cyan-600/8" : "bg-pink-600/8"}`} />
        <div className={`absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 ${isFirst ? "bg-blue-600/6" : "bg-rose-600/6"}`} />
      </div>

      <div className="relative z-10 max-w-sm mx-auto p-5 pb-10 space-y-5">
        {/* Round badge */}
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          className="text-center pt-2"
        >
          <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold border ${
            isFirst
              ? "bg-cyan-900/30 border-cyan-700/40 text-cyan-300"
              : "bg-pink-900/30 border-pink-700/40 text-pink-300"
          }`}>
            <span className={`w-2 h-2 rounded-full ${isFirst ? "bg-cyan-400" : "bg-pink-400"}`} />
            {isFirst ? "الجولة الأولى · نفس الجنس" : "الجولة الثانية · الجنس الآخر"}
          </span>
        </motion.div>

        {/* PromptTopicsModal button */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="flex justify-center"
        >
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium bg-gradient-to-r from-purple-600/70 to-pink-600/70 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg shadow-purple-500/20 transition-all hover:scale-105 active:scale-95"
          >
            <MessageSquare size={15} />
            أسئلة للنقاش
            <Sparkles size={13} className="text-pink-300 animate-pulse" />
          </button>
        </motion.div>

        {/* Question Slideshow */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <QuestionSlideshow defaultSet={isFirst ? 'special' : 'set1'} />
        </motion.div>
      </div>

      {/* PromptTopicsModal */}
      <Suspense fallback={null}>
        {showModal && (
          <PromptTopicsModal open={showModal} onClose={() => setShowModal(false)} />
        )}
      </Suspense>
    </div>
  )
}
