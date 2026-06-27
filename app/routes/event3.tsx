import { useState, useEffect, useCallback } from "react"
import { useSearchParams } from "react-router"
import toast, { Toaster } from "react-hot-toast"
import { motion, AnimatePresence, Reorder } from "framer-motion"
import confetti from "canvas-confetti"
import {
  Clock, Table2, Heart, Brain, ChevronDown, ExternalLink,
  CheckCircle, Send, RefreshCw, Sparkles, Home, Trophy, Lock, GripVertical,
} from "lucide-react"

const API = "/api/participant"

function call(action: string, token: string | null, extra: Record<string, any> = {}) {
  return fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, token, ...extra }),
  }).then(r => r.json())
}

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
}

// ─── Shared Design Components ─────────────────────────────────────────────────
function PageWrapper({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-h-screen bg-gray-950 relative overflow-hidden ${className}`} dir="rtl">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-600/8 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-pink-600/6 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
        <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] bg-violet-600/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  )
}

function GlassCard({ children, className = "", glow = "" }: { children: React.ReactNode; className?: string; glow?: string }) {
  return (
    <div className={`bg-gray-900/70 backdrop-blur-md border border-gray-800/60 rounded-2xl ${glow} ${className}`}>
      {children}
    </div>
  )
}

function Brand() {
  return (
    <div className="text-center">
      <div className="inline-flex items-center gap-1.5">
        <Sparkles size={14} className="text-purple-400" />
        <span className="text-sm font-semibold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent tracking-wider">
          التوافق الأعمى
        </span>
        <Sparkles size={14} className="text-pink-400" />
      </div>
      <div className="text-[10px] text-gray-600 tracking-widest font-medium mt-0.5">VERSION 3.0</div>
    </div>
  )
}

function Spinner({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
      <RefreshCw size={size} className={`text-purple-500 ${className}`} />
    </motion.div>
  )
}

// ─── Token Entry Screen ───────────────────────────────────────────────────────
function TokenEntry({ onToken }: { onToken: (t: string) => void }) {
  const [val, setVal] = useState(() => (typeof window !== "undefined" ? localStorage.getItem("blindmatch_result_token") : null) || "")

  const submit = () => {
    if (val.trim()) { localStorage.setItem("blindmatch_result_token", val.trim()); onToken(val.trim()) }
    else toast.error("أدخل رمزك أولاً")
  }

  return (
    <PageWrapper className="flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-sm space-y-8 text-center"
      >
        <div className="space-y-5">
          <motion.div
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 240, delay: 0.1 }}
            className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-purple-600 via-pink-600 to-rose-600 flex items-center justify-center shadow-2xl shadow-purple-600/40"
          >
            <Heart size={36} className="text-white" fill="white" />
          </motion.div>
          <Brand />
          <div>
            <h1 className="text-3xl font-black text-white">أهلاً بك</h1>
            <p className="text-gray-500 text-sm mt-2">أدخل رمزك الشخصي للانضمام إلى الفعالية</p>
          </div>
        </div>

        <GlassCard className="p-6 space-y-4 shadow-2xl shadow-black/30">
          <input
            type="text"
            placeholder="أدخل رمز الدخول هنا"
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submit()}
            className="w-full bg-gray-800/80 border border-gray-700/60 text-white rounded-xl px-4 py-3.5 text-center text-lg focus:outline-none focus:border-purple-500/70 focus:bg-gray-800/90 transition-all placeholder:text-gray-600"
          />
          <motion.button
            onClick={submit}
            whileTap={{ scale: 0.97 }}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl py-3.5 font-bold text-lg shadow-lg shadow-purple-600/30 transition-all"
          >
            دخول ✨
          </motion.button>
        </GlassCard>
      </motion.div>
    </PageWrapper>
  )
}

// ─── Waiting / Setup Screen ───────────────────────────────────────────────────
function SetupScreen() {
  return (
    <PageWrapper className="flex items-center justify-center p-6 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        className="space-y-6 max-w-sm w-full"
      >
        <motion.div
          animate={{ scale: [1, 1.08, 1], rotate: [0, 8, -8, 0] }}
          transition={{ duration: 3.5, repeat: Infinity, repeatDelay: 0.5 }}
          className="text-7xl mx-auto w-fit"
        >✨</motion.div>
        <Brand />
        <GlassCard className="p-8 space-y-4 shadow-xl shadow-black/20">
          <div className="flex justify-center gap-1.5">
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                className="w-2 h-2 bg-purple-500 rounded-full"
                animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1, 0.8] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.35 }}
              />
            ))}
          </div>
          <h1 className="text-xl font-bold text-white">الفعالية ستبدأ قريباً</h1>
          <p className="text-gray-500 text-sm">انتظر توجيهات المنظم</p>
        </GlassCard>
      </motion.div>
    </PageWrapper>
  )
}

// ─── Round Screen ─────────────────────────────────────────────────────────────
function RoundScreen({ token, phase, timerActive, timerStart, timerDuration }: {
  token: string; phase: string; timerActive: boolean; timerStart: string | null; timerDuration: number
}) {
  const round = parseInt(phase.replace("round", "")) || 1
  const [assignment, setAssignment] = useState<any>(null)
  const [timeLeft, setTimeLeft] = useState(0)

  useEffect(() => {
    call("e3-get-assignment", token, { round }).then(d => { if (!d.error) setAssignment(d) })
  }, [token, round])

  useEffect(() => {
    if (!timerActive || !timerStart) { setTimeLeft(0); return }
    const update = () => {
      const elapsed = Math.floor((Date.now() - new Date(timerStart).getTime()) / 1000)
      setTimeLeft(Math.max(0, timerDuration - elapsed))
    }
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [timerActive, timerStart, timerDuration])

  const roundAr = ["الأولى", "الثانية", "الثالثة"][round - 1] || round
  const RC = [
    { badge: "bg-blue-900/30 border-blue-700/40 text-blue-300", card: "border-blue-800/40", num: "text-blue-300", pill: "bg-blue-900/40 text-blue-300 border-blue-800/40" },
    { badge: "bg-indigo-900/30 border-indigo-700/40 text-indigo-300", card: "border-indigo-800/40", num: "text-indigo-300", pill: "bg-indigo-900/40 text-indigo-300 border-indigo-800/40" },
    { badge: "bg-violet-900/30 border-violet-700/40 text-violet-300", card: "border-violet-800/40", num: "text-violet-300", pill: "bg-violet-900/40 text-violet-300 border-violet-800/40" },
  ][round - 1] || { badge: "bg-purple-900/30 border-purple-700/40 text-purple-300", card: "border-purple-800/40", num: "text-purple-300", pill: "bg-purple-900/40 text-purple-300 border-purple-800/40" }

  return (
    <PageWrapper className="flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm space-y-5 text-center"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: "spring" }}
          className={`inline-flex items-center gap-2 ${RC.badge} border rounded-full px-6 py-2.5`}
        >
          <span className="font-bold text-sm">جولة التعارف {roundAr}</span>
          <span className="text-gray-600 text-xs">من 2</span>
        </motion.div>

        <AnimatePresence>
          {timerActive && timeLeft > 0 && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              <GlassCard className="p-5">
                <p className="text-gray-500 text-xs mb-2 flex items-center justify-center gap-1.5">
                  <Clock size={12} className="text-purple-400" /> الوقت المتبقي
                </p>
                <div className={`text-5xl font-mono font-black tabular-nums ${timeLeft < 60 ? "text-red-400" : "text-white"}`}>
                  {formatTime(timeLeft)}
                </div>
                <div className="mt-3 h-1.5 bg-gray-800/80 rounded-full overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${timeLeft < 60 ? "bg-red-500" : "bg-gradient-to-r from-purple-500 to-pink-500"}`}
                    animate={{ width: `${(timeLeft / timerDuration) * 100}%` }}
                    transition={{ duration: 1 }}
                  />
                </div>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>

        {assignment ? (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <GlassCard className={`p-7 space-y-4 border ${RC.card} shadow-xl shadow-black/20`}>
              <p className="text-gray-500 text-xs flex items-center justify-center gap-1.5">
                <Table2 size={12} /> مكانك هذه الجولة
              </p>
              <div className={`text-8xl font-black leading-none ${RC.num}`}>{assignment.table}</div>
              <p className="text-gray-500 text-sm font-medium">طاولة رقم</p>
              {assignment.tablemates?.length > 0 && (
                <div className="pt-4 border-t border-gray-800/60">
                  <p className="text-gray-600 text-xs mb-3">رفاقك في الطاولة</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {assignment.tablemates.map((m: any) => (
                      <span key={m.number} className={`${RC.pill} border rounded-full px-3 py-1 text-sm font-medium`}>
                        {m.first_name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </GlassCard>
          </motion.div>
        ) : (
          <GlassCard className="p-10 flex flex-col items-center gap-3">
            <Spinner size={22} />
            <p className="text-gray-500 text-sm">جاري تحميل مكانك...</p>
          </GlassCard>
        )}

        {/* Groups activities link */}
        <motion.a
          href="/groups"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className={`flex items-center justify-center gap-3 w-full py-4 rounded-2xl border font-bold text-base transition-all
            ${RC.badge} hover:brightness-125 active:scale-95`}
        >
          نشاطات المجموعة 🎯
          <ExternalLink size={15} />
        </motion.a>

        <p className="text-gray-600 text-xs">
          {round === 1 && "ستلتقي بأشخاص جدد في هذه الجولة"}
          {round === 2 && "آخر جولة تعارف — بعدها ستصنّف من أثار اهتمامك"}
          {round === 3 && "جولة إضافية — بعدها ستصنّف من أثار اهتمامك"}
        </p>
      </motion.div>
    </PageWrapper>
  )
}

// ─── Ranking Screen ───────────────────────────────────────────────────────────
function RankingScreen({ token, completedRounds }: { token: string, completedRounds: number }) {
  const [people, setPeople] = useState<any[]>([])
  const [order, setOrder] = useState<number[]>([])
  const [newNums, setNewNums] = useState<Set<number>>(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    call("e3-get-participants-met", token).then(d => {
      if (d.error) { toast.error(d.error); return }
      const allPeople: any[] = d.people || []
      const existingRankings: Record<number, number> = d.existing_rankings || {}
      if (d.already_submitted) setSubmitted(true)
      setPeople(allPeople)

      // People already ranked → keep their saved order
      const ranked = allPeople
        .filter(p => existingRankings[p.number] !== undefined)
        .sort((a, b) => existingRankings[a.number] - existingRankings[b.number])

      // People NOT yet ranked → new additions this session, go to bottom
      const fresh = allPeople
        .filter(p => existingRankings[p.number] === undefined)
        .sort((a, b) => a.round - b.round || a.number - b.number)

      setNewNums(new Set(fresh.map(p => p.number)))
      setOrder([...ranked.map(p => p.number), ...fresh.map(p => p.number)])
      setLoading(false)
    })
  }, [token])

  const submit = async () => {
    setSubmitting(true)
    const d = await call("e3-submit-ranking", token, { ranked_list: order })
    setSubmitting(false)
    if (d.error) { toast.error(d.error); return }
    setSubmitted(true)
    toast.success("تم حفظ تصنيفاتك! ✨")
  }

  const personMap = Object.fromEntries(people.map(p => [p.number, p]))

  const roundLabel = (r: number) => ["الجولة الأولى", "الجولة الثانية", "الجولة الثالثة"][r - 1] || `الجولة ${r}`
  const roundStyle = (r: number) => [
    "bg-blue-900/50 text-blue-300 border-blue-700/50",
    "bg-indigo-900/50 text-indigo-300 border-indigo-700/50",
    "bg-violet-900/50 text-violet-300 border-violet-700/50",
  ][r - 1] || "bg-gray-800/50 text-gray-400 border-gray-700/50"

  const rankStyle = (idx: number) => {
    if (idx === 0) return "bg-gradient-to-br from-amber-400 to-yellow-500 text-black shadow-lg shadow-amber-500/30"
    if (idx === 1) return "bg-gradient-to-br from-gray-300 to-gray-400 text-black"
    if (idx === 2) return "bg-gradient-to-br from-amber-700 to-amber-800 text-white"
    return "bg-gray-800/80 text-gray-500"
  }

  if (loading) return (
    <PageWrapper className="flex items-center justify-center">
      <Spinner size={28} />
    </PageWrapper>
  )

  return (
    <PageWrapper>
      <div className="max-w-md mx-auto pb-36">

        {/* Sticky header */}
        <div className="sticky top-0 bg-gray-950/95 backdrop-blur-md z-10 border-b border-gray-800/50">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Trophy size={16} className="text-amber-400" />
              <h1 className="text-lg font-bold text-white">من أثار اهتمامك أكثر؟</h1>
            </div>
            <p className="text-gray-500 text-xs text-center">
              قابلت <span className="text-white font-semibold">{people.length} أشخاص</span> عبر {completedRounds} {completedRounds === 1 ? "جولة" : "جولات"} — رتّبهم من الأكثر إثارة للاهتمام إلى الأقل
            </p>
            {newNums.size > 0 && (
              <p className="text-purple-400 text-[11px] text-center mt-1 font-medium">
                ✨ {newNums.size} أشخاص جدد من الجولة {completedRounds} أُضيفوا في الأسفل
              </p>
            )}
            <p className="text-gray-700 text-[11px] text-center mt-0.5">اسحب الأسماء لإعادة الترتيب · هذا التصنيف سري تماماً</p>
          </div>

          {/* Round legend */}
          <div className="px-5 pb-3 flex gap-2 justify-center flex-wrap">
            {[1, 2, 3].map(r => (
              <span key={r} className={`text-xs px-3 py-1 rounded-full border ${roundStyle(r)}`}>
                {roundLabel(r)}
              </span>
            ))}
          </div>

          {submitted && (
            <div className="mx-5 mb-3 flex items-center gap-2 bg-green-900/20 border border-green-800/40 rounded-xl px-3 py-2">
              <CheckCircle size={13} className="text-green-400" />
              <span className="text-green-400 text-xs">تصنيفك محفوظ — يمكنك التعديل وإعادة الإرسال</span>
            </div>
          )}
        </div>

        {/* Drag-to-reorder list */}
        <div className="p-4">
          <Reorder.Group axis="y" values={order} onReorder={setOrder} className="space-y-2.5" as="div">
            {order.map((num, idx) => {
              const p = personMap[num]
              if (!p) return null
              return (
                <Reorder.Item
                  key={num}
                  value={num}
                  as="div"
                  className="flex items-center gap-3 p-3.5 rounded-2xl border border-gray-800/60 bg-gray-900/70 backdrop-blur-sm cursor-grab active:cursor-grabbing touch-none select-none"
                  whileDrag={{
                    scale: 1.04,
                    boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
                    borderColor: "rgba(139,92,246,0.5)",
                    backgroundColor: "rgba(88,28,135,0.2)",
                    zIndex: 50,
                  }}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.02 }}
                >
                  {/* Rank badge */}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0 ${rankStyle(idx)}`}>
                    {idx + 1}
                  </div>

                  {/* Name + round */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-sm leading-tight">{p.first_name}</span>
                      {newNums.has(num) && (
                        <span className="text-[10px] bg-purple-900/60 text-purple-300 border border-purple-700/50 rounded-full px-1.5 py-0.5 font-semibold">جديد ✨</span>
                      )}
                    </div>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border mt-1 inline-block ${roundStyle(p.round)}`}>
                      {roundLabel(p.round)}
                    </span>
                  </div>

                  {/* Drag handle */}
                  <GripVertical size={17} className="text-gray-600 flex-shrink-0" />
                </Reorder.Item>
              )
            })}
          </Reorder.Group>
        </div>
      </div>

      {/* Fixed submit bar */}
      <div className="fixed bottom-0 inset-x-0 p-5 bg-gradient-to-t from-gray-950 via-gray-950/95 to-transparent pt-10">
        <div className="max-w-md mx-auto">
          <motion.button
            onClick={submit}
            disabled={submitting}
            whileTap={{ scale: 0.97 }}
            className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-60 text-white rounded-2xl py-4 font-bold text-base shadow-2xl shadow-purple-600/30 transition-all"
          >
            {submitting ? <Spinner size={18} className="!text-white" /> : <Send size={18} />}
            {submitted ? "تحديث التصنيف" : "إرسال التصنيف النهائي"}
          </motion.button>
          {submitted ? (
            <p className="text-center text-green-400 text-xs mt-2.5 flex items-center justify-center gap-1.5">
              <CheckCircle size={11} /> محفوظ — انتظر كشف النتائج
            </p>
          ) : (
            <p className="text-center text-gray-700 text-[11px] mt-2">
              النظام سيختار توافقك الأمثل من تصنيفاتك
            </p>
          )}
        </div>
      </div>
    </PageWrapper>
  )
}

// ─── Shared conversation starters ────────────────────────────────────────────
const CONVO_STARTERS = [
  "إذا كنت ستسافر غداً دون تخطيط، أين ستذهب؟",
  "ما الشيء الذي تعلمته مؤخراً وغيّر طريقة تفكيرك؟",
  "صِف يومك المثالي من الصباح حتى الليل.",
  "ما الهواية التي تتمنى أن تكون أفضل فيها؟",
  "ما الكتاب أو الفيلم الذي أثّر فيك كثيراً ولماذا؟",
  "ما أكثر شيء تقدّره في الصداقة؟",
]

// ─── Phase 2 Reveal Screen ────────────────────────────────────────────────────
function Phase2RevealScreen({ token, timerActive, timerStart, timerDuration }: {
  token: string; timerActive: boolean; timerStart: string | null; timerDuration: number
}) {
  const [data, setData] = useState<any>(null)
  const [revealed, setRevealed] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [word, setWord] = useState("")
  const [wordSubmitted, setWordSubmitted] = useState(false)
  const [showStarters, setShowStarters] = useState(false)

  useEffect(() => {
    call("e3-get-phase2-reveal", token).then(d => {
      if (!d.error) {
        setData(d)
        if (d.my_word) { setWord(d.my_word); setWordSubmitted(true) }
      }
    })
  }, [token])

  useEffect(() => {
    if (!timerActive || !timerStart) { setTimeLeft(0); return }
    const update = () => {
      const elapsed = Math.floor((Date.now() - new Date(timerStart).getTime()) / 1000)
      setTimeLeft(Math.max(0, timerDuration - elapsed))
    }
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [timerActive, timerStart, timerDuration])

  const handleReveal = () => {
    setRevealed(true)
    try { confetti({ particleCount: 55, spread: 65, origin: { y: 0.45 }, colors: ["#ec4899", "#f43f5e", "#fb7185", "#be185d"] }) } catch {}
  }

  const submitWord = async () => {
    if (!word.trim()) return
    const d = await call("e3-submit-phase2-word", token, { word: word.trim() })
    if (!d.error) { setWordSubmitted(true); toast.success("تم الحفظ! ✨") }
  }

  return (
    <PageWrapper>
      <div className="max-w-sm mx-auto p-5 pb-10 space-y-4">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="text-center pt-4 space-y-1">
          <div className="inline-flex items-center gap-2 bg-pink-900/30 border border-pink-700/40 text-pink-300 rounded-full px-4 py-1.5 text-sm font-semibold">
            <Heart size={13} fill="currentColor" /> الجلسة الأولى · اختيارك
          </div>
          <p className="text-gray-600 text-xs">هذا من قرّرت أنت لقاءه بعد جولات التعارف</p>
        </motion.div>

        <AnimatePresence mode="wait">
          {!revealed ? (
            <motion.div key="pre" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-4">
              <motion.button onClick={handleReveal} whileTap={{ scale: 0.97 }}
                className="w-full bg-gradient-to-br from-pink-600 via-rose-600 to-pink-700 text-white rounded-2xl py-8 font-bold text-xl shadow-2xl shadow-pink-600/40 border border-pink-500/30">
                <motion.span animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 1.8, repeat: Infinity }} className="flex items-center justify-center gap-3">
                  <Heart size={24} fill="white" /> اكشف اسمه / اسمها
                </motion.span>
              </motion.button>
              {timerActive && timeLeft > 0 && (
                <GlassCard className="p-4 text-center">
                  <p className="text-gray-600 text-xs mb-1">الجلسة تبدأ خلال</p>
                  <div className={`text-3xl font-mono font-black tabular-nums ${timeLeft < 60 ? "text-red-400" : "text-white"}`}>{formatTime(timeLeft)}</div>
                </GlassCard>
              )}
            </motion.div>
          ) : (
            <motion.div key="post" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <motion.div initial={{ scale: 0.88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, delay: 0.05 }}>
                <GlassCard className="p-6 border border-pink-800/40 shadow-2xl shadow-pink-500/10 text-center">
                  <p className="text-gray-500 text-xs mb-2">شريكك</p>
                  <p className="text-4xl font-black text-white mb-3">{data?.partner_first_name || "..."}</p>
                  <div className="inline-flex items-center gap-1.5 bg-pink-900/40 border border-pink-800/50 rounded-full px-3 py-1">
                    <Heart size={11} className="text-pink-400" fill="currentColor" />
                    <span className="text-pink-300 text-xs font-semibold">اختيارك الشخصي</span>
                  </div>
                </GlassCard>
              </motion.div>

              {timerActive && timeLeft > 0 && (
                <GlassCard className="p-5">
                  <p className="text-gray-500 text-xs mb-2 flex items-center justify-center gap-1.5"><Clock size={11} className="text-pink-400" /> وقت الجلسة المتبقّي</p>
                  <div className={`text-4xl font-mono font-black tabular-nums mb-3 ${timeLeft < 60 ? "text-red-400" : "text-white"}`}>{formatTime(timeLeft)}</div>
                  <div className="h-1.5 bg-gray-800/80 rounded-full overflow-hidden">
                    <motion.div className={`h-full rounded-full ${timeLeft < 60 ? "bg-red-500" : "bg-gradient-to-r from-pink-500 to-rose-500"}`}
                      animate={{ width: `${(timeLeft / timerDuration) * 100}%` }} transition={{ duration: 1 }} />
                  </div>
                </GlassCard>
              )}

              <GlassCard className="overflow-hidden">
                <button onClick={() => setShowStarters(s => !s)}
                  className="w-full flex items-center justify-between p-4 text-sm font-semibold text-white hover:bg-gray-800/30 transition-colors">
                  <span className="flex items-center gap-2"><Sparkles size={14} className="text-pink-400" /> أسئلة للنقاش ✨</span>
                  <motion.div animate={{ rotate: showStarters ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown size={15} className="text-gray-600" />
                  </motion.div>
                </button>
                <AnimatePresence>
                  {showStarters && (
                    <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden border-t border-gray-800/60">
                      <div className="p-4 space-y-2">
                        {CONVO_STARTERS.map((q, i) => (
                          <motion.div key={i} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                            className="text-sm text-gray-300 bg-gray-800/50 border border-gray-700/40 rounded-xl px-3 py-2.5">{q}</motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </GlassCard>

              <GlassCard className="p-4 space-y-3">
                <p className="text-gray-400 text-sm text-center">صف هذه الجلسة بكلمة واحدة</p>
                <div className="flex gap-2">
                  <input type="text" placeholder="مثلاً: ممتع، عميق..." value={word} maxLength={20}
                    onChange={e => setWord(e.target.value.split(" ")[0])} disabled={wordSubmitted}
                    className="flex-1 bg-gray-800/80 border border-gray-700/60 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-pink-500/60 disabled:opacity-50 transition-all placeholder:text-gray-600" />
                  {wordSubmitted
                    ? <div className="flex items-center px-2 text-green-400"><CheckCircle size={16} /></div>
                    : <button onClick={submitWord} disabled={!word.trim()}
                        className="bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 disabled:opacity-40 text-white rounded-xl px-4 py-2 shadow-md transition-all">
                        <Send size={14} /></button>
                  }
                </div>
              </GlassCard>

              <p className="text-gray-700 text-xs text-center">ابحث عن {data?.partner_first_name} وابدأ محادثتكما</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageWrapper>
  )
}

// ─── Phase 2 One-Word Screen ──────────────────────────────────────────────────
function Phase2WordScreen({ token }: { token: string }) {
  const [word, setWord] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [partnerName, setPartnerName] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    call("e3-get-phase2-reveal", token).then(d => {
      if (!d.error) {
        setPartnerName(d.partner_first_name || "")
        if (d.my_word) { setWord(d.my_word); setSubmitted(true) }
      }
    })
  }, [token])

  const submit = async () => {
    if (!word.trim()) { toast.error("اكتب كلمة واحدة فقط"); return }
    setSubmitting(true)
    const d = await call("e3-submit-phase2-word", token, { word: word.trim() })
    setSubmitting(false)
    if (d.error) { toast.error(d.error); return }
    setSubmitted(true)
    toast.success("تم الحفظ! ✨")
  }

  return (
    <PageWrapper className="flex flex-col items-center justify-center p-6 text-center">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm space-y-6">
        <div className="space-y-2">
          <div className="text-5xl">💬</div>
          <h1 className="text-xl font-bold text-white">كيف كانت الجلسة مع {partnerName}؟</h1>
          <p className="text-gray-500 text-sm">صفها بكلمة واحدة</p>
        </div>
        <GlassCard className="p-6 space-y-4 shadow-xl shadow-black/20">
          <input
            type="text"
            placeholder="مثلاً: ممتع، عميق، مريح..."
            value={word}
            maxLength={20}
            onChange={e => setWord(e.target.value.split(" ")[0])}
            onKeyDown={e => e.key === "Enter" && !submitted && submit()}
            disabled={submitted}
            className="w-full bg-gray-800/80 border border-gray-700/60 text-white rounded-xl px-4 py-4 text-center text-xl focus:outline-none focus:border-pink-500/60 disabled:opacity-60 transition-all placeholder:text-gray-600"
          />
          {!submitted ? (
            <motion.button
              onClick={submit}
              disabled={submitting || !word.trim()}
              whileTap={{ scale: 0.97 }}
              className="w-full bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 disabled:opacity-40 text-white rounded-xl py-3.5 font-bold shadow-lg shadow-pink-600/25 transition-all"
            >
              {submitting ? "جاري الحفظ..." : "تأكيد ✓"}
            </motion.button>
          ) : (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="flex items-center justify-center gap-2 py-3 text-green-400 font-medium">
              <CheckCircle size={18} /> تم الحفظ — انتظر المرحلة التالية
            </motion.div>
          )}
        </GlassCard>
      </motion.div>
    </PageWrapper>
  )
}

// ─── Phase 3 Reveal Screen ────────────────────────────────────────────────────
function Phase3RevealScreen({ token, timerActive, timerStart, timerDuration }: {
  token: string; timerActive: boolean; timerStart: string | null; timerDuration: number
}) {
  const [data, setData] = useState<any>(null)
  const [revealed, setRevealed] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [word, setWord] = useState("")
  const [wordSubmitted, setWordSubmitted] = useState(false)
  const [showStarters, setShowStarters] = useState(false)

  useEffect(() => {
    call("e3-get-phase3-reveal", token).then(d => {
      if (!d.error) {
        setData(d)
        if (d.word_submitted) setWordSubmitted(true)
      }
    })
  }, [token])

  useEffect(() => {
    if (!timerActive || !timerStart) { setTimeLeft(0); return }
    const update = () => {
      const elapsed = Math.floor((Date.now() - new Date(timerStart).getTime()) / 1000)
      setTimeLeft(Math.max(0, timerDuration - elapsed))
    }
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [timerActive, timerStart, timerDuration])

  const handleReveal = () => {
    setRevealed(true)
    try { confetti({ particleCount: 65, spread: 70, origin: { y: 0.4 }, colors: ["#7c3aed", "#8b5cf6", "#a78bfa", "#c4b5fd"] }) } catch {}
  }

  const submitWord = async () => {
    if (!word.trim()) return
    const d = await call("e3-submit-phase3-word", token, { word: word.trim() })
    if (!d.error) { setWordSubmitted(true); toast.success("تم الحفظ! ✨") }
  }

  return (
    <PageWrapper>
      <div className="max-w-sm mx-auto p-5 pb-10 space-y-4">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="text-center pt-4 space-y-1">
          <div className="inline-flex items-center gap-2 bg-purple-900/30 border border-purple-700/40 text-purple-300 rounded-full px-4 py-1.5 text-sm font-semibold">
            <Brain size={13} /> الجلسة الثانية · اختيار الخوارزمية
          </div>
          <p className="text-gray-600 text-xs">هذا من اختارته الخوارزمية من جميع المشاركين</p>
        </motion.div>

        <AnimatePresence mode="wait">
          {!revealed ? (
            <motion.div key="pre" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-4">
              <motion.button onClick={handleReveal} whileTap={{ scale: 0.97 }}
                className="w-full bg-gradient-to-br from-purple-600 via-violet-600 to-purple-700 text-white rounded-2xl py-8 font-bold text-xl shadow-2xl shadow-purple-600/40 border border-purple-500/30">
                <motion.span animate={{ rotate: [0, -4, 4, 0] }} transition={{ duration: 3, repeat: Infinity }} className="flex items-center justify-center gap-3">
                  <Brain size={24} /> اكشف اختيار الخوارزمية
                </motion.span>
              </motion.button>
              {timerActive && timeLeft > 0 && (
                <GlassCard className="p-4 text-center">
                  <p className="text-gray-600 text-xs mb-1">الجلسة تبدأ خلال</p>
                  <div className={`text-3xl font-mono font-black tabular-nums ${timeLeft < 60 ? "text-red-400" : "text-white"}`}>{formatTime(timeLeft)}</div>
                </GlassCard>
              )}
            </motion.div>
          ) : (
            <motion.div key="post" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              {data?.same_as_phase2 && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-r from-amber-900/40 to-yellow-900/30 border border-amber-700/50 rounded-2xl p-4 text-center">
                  <p className="text-amber-300 font-black text-base">🏆 مطابقة مثالية!</p>
                  <p className="text-amber-400/70 text-xs mt-0.5">اخترت نفس الشخص الذي اختارته الخوارزمية</p>
                </motion.div>
              )}

              <motion.div initial={{ scale: 0.88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, delay: 0.05 }}>
                <GlassCard className="p-6 border border-purple-800/40 shadow-2xl shadow-purple-500/10 text-center">
                  <p className="text-gray-500 text-xs mb-2">شريكك</p>
                  <p className="text-4xl font-black text-white mb-3">{data?.partner_first_name || "..."}</p>
                  <div className="inline-flex items-center gap-2 bg-purple-900/40 border border-purple-800/50 rounded-full px-4 py-1.5">
                    <Brain size={12} className="text-purple-400" />
                    <span className="text-purple-300 font-black text-lg">{data?.compatibility_score}%</span>
                    <span className="text-gray-500 text-xs">توافق</span>
                  </div>
                </GlassCard>
              </motion.div>

              {timerActive && timeLeft > 0 && (
                <GlassCard className="p-5">
                  <p className="text-gray-500 text-xs mb-2 flex items-center justify-center gap-1.5"><Clock size={11} className="text-purple-400" /> وقت الجلسة المتبقّي</p>
                  <div className={`text-4xl font-mono font-black tabular-nums mb-3 ${timeLeft < 60 ? "text-red-400" : "text-white"}`}>{formatTime(timeLeft)}</div>
                  <div className="h-1.5 bg-gray-800/80 rounded-full overflow-hidden">
                    <motion.div className={`h-full rounded-full ${timeLeft < 60 ? "bg-red-500" : "bg-gradient-to-r from-purple-500 to-violet-500"}`}
                      animate={{ width: `${(timeLeft / timerDuration) * 100}%` }} transition={{ duration: 1 }} />
                  </div>
                </GlassCard>
              )}

              <GlassCard className="overflow-hidden">
                <button onClick={() => setShowStarters(s => !s)}
                  className="w-full flex items-center justify-between p-4 text-sm font-semibold text-white hover:bg-gray-800/30 transition-colors">
                  <span className="flex items-center gap-2"><Sparkles size={14} className="text-purple-400" /> أسئلة للنقاش ✨</span>
                  <motion.div animate={{ rotate: showStarters ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown size={15} className="text-gray-600" />
                  </motion.div>
                </button>
                <AnimatePresence>
                  {showStarters && (
                    <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden border-t border-gray-800/60">
                      <div className="p-4 space-y-2">
                        {CONVO_STARTERS.map((q, i) => (
                          <motion.div key={i} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                            className="text-sm text-gray-300 bg-gray-800/50 border border-gray-700/40 rounded-xl px-3 py-2.5">{q}</motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </GlassCard>

              <GlassCard className="p-4 space-y-3">
                <p className="text-gray-400 text-sm text-center">صف هذه الجلسة بكلمة واحدة</p>
                <div className="flex gap-2">
                  <input type="text" placeholder="كلمة واحدة..." value={word} maxLength={20}
                    onChange={e => setWord(e.target.value.split(" ")[0])} disabled={wordSubmitted}
                    className="flex-1 bg-gray-800/80 border border-gray-700/60 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500/60 disabled:opacity-50 transition-all placeholder:text-gray-600" />
                  {wordSubmitted
                    ? <div className="flex items-center px-2 text-green-400"><CheckCircle size={16} /></div>
                    : <button onClick={submitWord} disabled={!word.trim()}
                        className="bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 disabled:opacity-40 text-white rounded-xl px-4 py-2 shadow-md transition-all">
                        <Send size={14} /></button>
                  }
                </div>
              </GlassCard>

              <p className="text-gray-700 text-xs text-center">ابحث عن {data?.partner_first_name} وابدأ محادثتكما</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageWrapper>
  )
}

// ─── Final Reveal Screen ──────────────────────────────────────────────────────
function FinalRevealScreen({ token }: { token: string }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    call("e3-get-final-reveal", token).then(d => {
      if (!d.error) setData(d)
      setLoading(false)
    })
  }, [token])

  useEffect(() => {
    if (!data) return
    if (data.same_match) {
      try {
        confetti({ particleCount: 100, spread: 80, origin: { y: 0.3 } })
        setTimeout(() => confetti({ particleCount: 60, spread: 90, origin: { y: 0.4 }, colors: ["#f59e0b", "#fbbf24", "#fcd34d", "#fef08a"] }), 400)
      } catch {}
    }
  }, [data])

  if (loading) return (
    <PageWrapper className="flex items-center justify-center"><Spinner size={28} /></PageWrapper>
  )

  if (!data) return (
    <PageWrapper className="flex items-center justify-center text-gray-500 text-sm">لا توجد نتائج بعد</PageWrapper>
  )

  return (
    <PageWrapper className="flex flex-col items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm space-y-5 text-center">
        <Brand />
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
          className="text-6xl">✨</motion.div>
        <h1 className="text-2xl font-black text-white">الكشف النهائي</h1>

        {data.same_match && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}
            className="bg-gradient-to-r from-amber-900/40 via-yellow-900/30 to-amber-900/40 border border-amber-600/50 rounded-2xl p-5 shadow-2xl shadow-amber-500/20">
            <div className="text-3xl mb-2">🏆</div>
            <p className="text-amber-300 font-black text-lg">مطابقة مثالية!</p>
            <p className="text-amber-400/70 text-sm mt-1">
              اخترت <strong className="text-amber-300">{data.phase2?.partner_first_name}</strong> والخوارزمية اختارت نفس الشخص
            </p>
          </motion.div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <motion.div initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
            <GlassCard className="p-5 space-y-2.5 border border-pink-800/40 shadow-xl shadow-pink-500/8 h-full flex flex-col items-center">
              <div className="text-2xl">💘</div>
              <p className="text-gray-500 text-xs">اخترت</p>
              <p className="text-xl font-black text-white leading-tight">{data.phase2?.partner_first_name}</p>
              {data.phase2?.word && (
                <span className="text-xs bg-pink-900/40 text-pink-300 border border-pink-800/40 rounded-full px-2.5 py-0.5">
                  "{data.phase2.word}"
                </span>
              )}
            </GlassCard>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
            <GlassCard className="p-5 space-y-2.5 border border-purple-800/40 shadow-xl shadow-purple-500/8 h-full flex flex-col items-center">
              <div className="text-2xl">🧠</div>
              <p className="text-gray-500 text-xs">الخوارزمية</p>
              <p className="text-xl font-black text-white leading-tight">{data.phase3?.partner_first_name}</p>
              <div className="flex items-center gap-1">
                <span className="text-purple-300 font-black text-sm">{data.phase3?.compatibility_score}%</span>
                <span className="text-gray-600 text-xs">توافق</span>
              </div>
              {data.phase3?.word && (
                <span className="text-xs bg-purple-900/40 text-purple-300 border border-purple-800/40 rounded-full px-2.5 py-0.5">
                  "{data.phase3.word}"
                </span>
              )}
            </GlassCard>
          </motion.div>
        </div>

        <p className="text-gray-500 text-xs leading-relaxed">
          {data.same_match
            ? "غريزتك والخوارزمية متوافقتان — هذا نادر الحدوث ✨"
            : "رأيت بعينيك، ورأت الخوارزمية بالبيانات — أيهما أصح؟"}
        </p>
      </motion.div>
    </PageWrapper>
  )
}

// ─── Not Enrolled Screen ──────────────────────────────────────────────────────
function NotEnrolledScreen() {
  return (
    <PageWrapper className="flex items-center justify-center p-6 text-center">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="space-y-5 max-w-xs">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gray-800/80 border border-gray-700/50 flex items-center justify-center">
          <Lock size={28} className="text-gray-500" />
        </div>
        <h2 className="text-xl font-bold text-white">أنت لست مسجلاً</h2>
        <p className="text-gray-500 text-sm">رمزك صحيح، لكن لم يتم تسجيلك في هذه الفعالية.</p>
        <p className="text-gray-600 text-xs">تواصل مع المنظم للمساعدة.</p>
        <a href="/welcome" className="inline-flex items-center gap-2 text-purple-400 text-sm hover:text-purple-300 transition-colors">
          <Home size={14} /> العودة للصفحة الرئيسية
        </a>
      </motion.div>
    </PageWrapper>
  )
}

// ─── Root Component ───────────────────────────────────────────────────────────
export default function Event3Page() {
  const [searchParams] = useSearchParams()
  const [token, setToken] = useState<string | null>(() => {
    const p = searchParams.get("token") || searchParams.get("t")
    return p || (typeof window !== "undefined" ? localStorage.getItem("blindmatch_result_token") : null) || null
  })

  const [eventState, setEventState] = useState<any>(null)
  const [enrolled, setEnrolled] = useState<boolean | null>(null)

  const fetchState = useCallback(async () => {
    if (!token) return
    const d = await call("e3-get-state", token)
    if (d.error) return
    setEventState(d)
    if (enrolled === null) setEnrolled(d.enrolled !== false)
  }, [token, enrolled])

  useEffect(() => {
    const p = searchParams.get("token") || searchParams.get("t")
    if (p) { setToken(p); localStorage.setItem("blindmatch_result_token", p) }
  }, [searchParams])

  useEffect(() => {
    if (!token) return
    fetchState()
    const iv = setInterval(fetchState, 2000)
    return () => clearInterval(iv)
  }, [token, fetchState])

  if (!token) return <TokenEntry onToken={t => { setToken(t); localStorage.setItem("blindmatch_result_token", t) }} />

  if (!eventState) return (
    <PageWrapper className="flex items-center justify-center">
      <Spinner size={28} />
    </PageWrapper>
  )

  const { phase, timer_active, timer_start, timer_duration } = eventState
  const timerProps = { timerActive: timer_active, timerStart: timer_start, timerDuration: timer_duration }

  if (enrolled === false) return <NotEnrolledScreen />

  const isRound = /^round[123]$/.test(phase)
  const rankingMatch = phase.match(/^ranking([123])$/)
  const completedRounds = rankingMatch ? parseInt(rankingMatch[1]) : null

  return (
    <>
      <Toaster position="top-center" toastOptions={{ style: { background: "#1f2937", color: "#f9fafb", border: "1px solid #374151", borderRadius: "12px" } }} />
      <AnimatePresence mode="wait">
        {phase === "setup" && <SetupScreen key="setup" />}
        {isRound && <RoundScreen key={phase} token={token} phase={phase} {...timerProps} />}
        {completedRounds && <RankingScreen key={phase} token={token} completedRounds={completedRounds} />}
        {phase === "phase2_reveal" && <Phase2RevealScreen key="p2r" token={token} {...timerProps} />}
        {phase === "phase2_oneword" && <Phase2WordScreen key="p2w" token={token} />}
        {phase === "phase3_reveal" && <Phase3RevealScreen key="p3r" token={token} {...timerProps} />}
        {phase === "final_reveal" && <FinalRevealScreen key="final" token={token} />}
      </AnimatePresence>
    </>
  )
}
