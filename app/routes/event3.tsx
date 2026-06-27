import { useState, useEffect, useCallback, useRef } from "react"
import { useSearchParams } from "react-router"
import toast, { Toaster } from "react-hot-toast"
import {
  Clock, Table2, Heart, Brain, Star, ChevronUp, ChevronDown,
  CheckCircle, Send, RefreshCw, Sparkles, ArrowRight, Home,
  Users, Trophy, MessageCircle, ArrowUp, ArrowDown,
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

// ─── Token Entry Screen ───────────────────────────────────────────────────────
function TokenEntry({ onToken }: { onToken: (t: string) => void }) {
  const [val, setVal] = useState(() => localStorage.getItem("blindmatch_result_token") || "")

  const submit = () => {
    if (val.trim()) { localStorage.setItem("blindmatch_result_token", val.trim()); onToken(val.trim()) }
    else toast.error("أدخل رمزك أولاً")
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6" dir="rtl">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="text-5xl mb-2">✨</div>
        <h1 className="text-2xl font-bold text-white">التوافق الأعمى 3.0</h1>
        <p className="text-gray-400 text-sm">أدخل رمزك للدخول</p>
        <input
          type="text"
          placeholder="رمز الدخول"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          className="w-full bg-gray-900 border border-gray-700 text-white rounded-xl px-4 py-3 text-center text-lg focus:outline-none focus:border-purple-500"
        />
        <button
          onClick={submit}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-xl py-3 font-semibold text-lg transition-colors"
        >
          دخول
        </button>
      </div>
    </div>
  )
}

// ─── Waiting / Setup Screen ───────────────────────────────────────────────────
function SetupScreen() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6 text-center" dir="rtl">
      <div className="space-y-4 animate-pulse">
        <div className="text-6xl">✨</div>
        <h1 className="text-2xl font-bold text-white">التوافق الأعمى 3.0</h1>
        <p className="text-gray-400">الفعالية ستبدأ قريباً...</p>
        <p className="text-gray-600 text-sm">انتظر توجيهات المنظم</p>
      </div>
    </div>
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

  return (
    <div className="min-h-screen bg-gray-950 p-6 flex flex-col items-center justify-center" dir="rtl">
      <div className="w-full max-w-sm space-y-6 text-center">

        {/* Round badge */}
        <div className="inline-flex items-center gap-2 bg-purple-900/30 border border-purple-700/40 rounded-full px-5 py-2">
          <span className="text-purple-300 font-semibold">الجولة {roundAr}</span>
          <span className="text-gray-500">من 3</span>
        </div>

        {/* Timer */}
        {timerActive && timeLeft > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <p className="text-gray-400 text-sm mb-1">الوقت المتبقي</p>
            <div className="text-5xl font-mono font-bold text-white">{formatTime(timeLeft)}</div>
            <div className="mt-3 h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-600 transition-all duration-1000"
                style={{ width: `${(timeLeft / timerDuration) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Table assignment */}
        {assignment ? (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
              <Table2 size={16} /> مكانك هذه الجولة
            </div>
            <div className="text-6xl font-bold text-white">{assignment.table}</div>
            <div className="text-gray-400 text-sm">طاولة رقم</div>

            {assignment.tablemates?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-800">
                <p className="text-gray-500 text-xs mb-3">رفاقك في الطاولة</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {assignment.tablemates.map((m: any) => (
                    <span key={m.number} className="bg-gray-800 text-gray-300 rounded-full px-3 py-1 text-sm">
                      {m.first_name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 flex flex-col items-center gap-3">
            <RefreshCw size={20} className="text-gray-600 animate-spin" />
            <p className="text-gray-500 text-sm">جاري تحميل مكانك...</p>
          </div>
        )}

        <p className="text-gray-600 text-xs">
          {round === 1 && "ستلتقي بـ 5 أشخاص جدد في هذه الجولة"}
          {round === 2 && "وجوه جديدة تماماً — لا أحد التقيت به من قبل"}
          {round === 3 && "آخر 5 أشخاص — بعد ذلك ستصنّفهم جميعاً"}
        </p>
      </div>
    </div>
  )
}

// ─── Ranking Screen ───────────────────────────────────────────────────────────
function RankingScreen({ token }: { token: string }) {
  const [people, setPeople] = useState<any[]>([])
  const [order, setOrder] = useState<number[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

  useEffect(() => {
    call("e3-get-participants-met", token).then(d => {
      if (d.error) { toast.error(d.error); return }
      setPeople(d.people || [])
      if (d.already_submitted) setSubmitted(true)
      // Initial order: sorted by round met, then number
      const sorted = [...(d.people || [])].sort((a, b) => a.round - b.round || a.number - b.number)
      setOrder(sorted.map((p: any) => p.number))
      setLoading(false)
    })
  }, [token])

  const moveUp = (idx: number) => {
    if (idx === 0) return
    setOrder(prev => { const n = [...prev]; [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]]; return n })
  }
  const moveDown = (idx: number) => {
    if (idx === order.length - 1) return
    setOrder(prev => { const n = [...prev]; [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]]; return n })
  }

  const tapItem = (idx: number) => {
    if (selectedIdx === null) {
      setSelectedIdx(idx)
    } else if (selectedIdx === idx) {
      setSelectedIdx(null)
    } else {
      // Swap selected with tapped
      setOrder(prev => {
        const n = [...prev]
        ;[n[selectedIdx], n[idx]] = [n[idx], n[selectedIdx]]
        return n
      })
      setSelectedIdx(null)
    }
  }

  const submit = async () => {
    setSubmitting(true)
    const d = await call("e3-submit-ranking", token, { ranked_list: order })
    setSubmitting(false)
    if (d.error) { toast.error(d.error); return }
    setSubmitted(true)
    toast.success("تم حفظ تصنيفاتك بنجاح!")
  }

  const personMap = Object.fromEntries(people.map(p => [p.number, p]))

  const roundBadge = (r: number) => {
    const colors = ["bg-blue-900/50 text-blue-300", "bg-indigo-900/50 text-indigo-300", "bg-violet-900/50 text-violet-300"]
    return colors[r - 1] || colors[0]
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center" dir="rtl">
      <RefreshCw size={24} className="text-gray-500 animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 pb-32" dir="rtl">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gray-950/95 backdrop-blur z-10 p-5 pb-3 border-b border-gray-800">
          <h1 className="text-xl font-bold text-white text-center">صنّف من أثار اهتمامك</h1>
          <p className="text-gray-500 text-xs text-center mt-1">
            {submitted ? "✓ تم التصنيف — يمكنك التعديل" : "اضغط على شخص لتحديده، ثم اضغط على موضع آخر للمبادلة"}
          </p>
        </div>

        <div className="p-4 space-y-2">
          {order.map((num, idx) => {
            const p = personMap[num]
            if (!p) return null
            const isSelected = selectedIdx === idx

            return (
              <div
                key={num}
                onClick={() => tapItem(idx)}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none ${
                  isSelected
                    ? "border-purple-500 bg-purple-900/30 shadow-lg shadow-purple-500/20"
                    : "border-gray-800 bg-gray-900 hover:border-gray-700"
                }`}
              >
                {/* Rank number */}
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                  idx === 0 ? "bg-amber-500 text-black" :
                  idx === 1 ? "bg-gray-400 text-black" :
                  idx === 2 ? "bg-amber-700 text-white" :
                  "bg-gray-800 text-gray-400"
                }`}>
                  {idx + 1}
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white text-sm">{p.first_name}</div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${roundBadge(p.round)}`}>
                    جولة {p.round}
                  </span>
                </div>

                {/* Move buttons */}
                <div className="flex flex-col gap-0.5" onClick={e => e.stopPropagation()}>
                  <button onClick={() => moveUp(idx)} disabled={idx === 0}
                    className="p-1 rounded hover:bg-gray-700 text-gray-600 hover:text-gray-300 disabled:opacity-20">
                    <ChevronUp size={14} />
                  </button>
                  <button onClick={() => moveDown(idx)} disabled={idx === order.length - 1}
                    className="p-1 rounded hover:bg-gray-700 text-gray-600 hover:text-gray-300 disabled:opacity-20">
                    <ChevronDown size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Submit button */}
      <div className="fixed bottom-0 inset-x-0 p-5 bg-gradient-to-t from-gray-950 pt-8">
        <button
          onClick={submit}
          disabled={submitting}
          className="w-full max-w-md mx-auto flex items-center justify-center gap-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-70 text-white rounded-2xl py-4 font-semibold text-lg shadow-lg shadow-purple-600/30 transition-all"
        >
          {submitting ? <RefreshCw size={20} className="animate-spin" /> : <Send size={20} />}
          {submitted ? "تحديث التصنيف" : "تأكيد التصنيف"}
        </button>
        {submitted && (
          <p className="text-center text-green-400 text-xs mt-2">✓ محفوظ — انتظر كشف النتائج</p>
        )}
      </div>
    </div>
  )
}

// ─── Phase 2 Reveal Screen ────────────────────────────────────────────────────
function Phase2RevealScreen({ token, timerActive, timerStart, timerDuration }: {
  token: string; timerActive: boolean; timerStart: string | null; timerDuration: number
}) {
  const [data, setData] = useState<any>(null)
  const [revealed, setRevealed] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)

  useEffect(() => {
    call("e3-get-phase2-reveal", token).then(d => { if (!d.error) setData(d) })
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

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center" dir="rtl">
      <div className="w-full max-w-sm space-y-6">

        <div>
          <div className="text-4xl mb-2">💘</div>
          <h1 className="text-2xl font-bold text-white">الجلسة الأولى</h1>
          <p className="text-gray-500 text-sm mt-1">هذا من اخترته أنت</p>
        </div>

        {!revealed ? (
          <button
            onClick={() => setRevealed(true)}
            className="w-full bg-gradient-to-br from-pink-600 to-rose-700 text-white rounded-2xl py-6 font-bold text-xl shadow-2xl shadow-pink-600/30 active:scale-95 transition-transform"
          >
            اكشف اسمه / اسمها
          </button>
        ) : (
          <div className="bg-gray-900 border border-pink-800/40 rounded-2xl p-8 space-y-3 animate-in fade-in duration-500">
            {data ? (
              <>
                <div className="text-5xl font-bold text-white">{data.partner_first_name}</div>
                <p className="text-pink-300 text-sm">هذا هو اختيارك</p>
              </>
            ) : (
              <div className="text-gray-500">جاري التحميل...</div>
            )}
          </div>
        )}

        {revealed && timerActive && timeLeft > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-400 text-xs mb-1">وقت الجلسة</p>
            <div className="text-3xl font-mono font-bold text-white">{formatTime(timeLeft)}</div>
          </div>
        )}

        <p className="text-gray-600 text-xs">ابحث عن {data?.partner_first_name || "شريكك"} وابدأ محادثتكم</p>
      </div>
    </div>
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
    toast.success("تم الحفظ!")
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center" dir="rtl">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <div className="text-4xl mb-2">💬</div>
          <h1 className="text-xl font-bold text-white">كيف كانت الجلسة مع {partnerName}؟</h1>
          <p className="text-gray-500 text-sm mt-1">صفها بكلمة واحدة</p>
        </div>

        <input
          type="text"
          placeholder="مثلاً: ممتع، عميق، مريح..."
          value={word}
          maxLength={20}
          onChange={e => setWord(e.target.value.split(" ")[0])}
          onKeyDown={e => e.key === "Enter" && !submitted && submit()}
          disabled={submitted}
          className="w-full bg-gray-900 border border-gray-700 text-white rounded-xl px-4 py-4 text-center text-xl focus:outline-none focus:border-purple-500 disabled:opacity-60"
        />

        {!submitted ? (
          <button
            onClick={submit}
            disabled={submitting || !word.trim()}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl py-3 font-semibold transition-colors"
          >
            {submitting ? "جاري الحفظ..." : "تأكيد"}
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 text-green-400">
            <CheckCircle size={18} />
            <span>تم الحفظ — انتظر المرحلة التالية</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Phase 3 Reveal Screen ────────────────────────────────────────────────────
function Phase3RevealScreen({ token, timerActive, timerStart, timerDuration }: {
  token: string; timerActive: boolean; timerStart: string | null; timerDuration: number
}) {
  const [data, setData] = useState<any>(null)
  const [revealed, setRevealed] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [wordInput, setWordInput] = useState("")
  const [wordSubmitted, setWordSubmitted] = useState(false)

  useEffect(() => {
    call("e3-get-phase3-reveal", token).then(d => { if (!d.error) setData(d) })
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

  const submitWord = async () => {
    if (!wordInput.trim()) return
    const d = await call("e3-submit-phase3-word", token, { word: wordInput.trim() })
    if (!d.error) setWordSubmitted(true)
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center" dir="rtl">
      <div className="w-full max-w-sm space-y-6">

        <div>
          <div className="text-4xl mb-2">🧠</div>
          <h1 className="text-2xl font-bold text-white">الجلسة الثانية</h1>
          <p className="text-gray-500 text-sm mt-1">هذا من اختارته الخوارزمية لك</p>
        </div>

        {!revealed ? (
          <button
            onClick={() => setRevealed(true)}
            className="w-full bg-gradient-to-br from-purple-600 to-violet-700 text-white rounded-2xl py-6 font-bold text-xl shadow-2xl shadow-purple-600/30 active:scale-95 transition-transform"
          >
            اكشف اسمه / اسمها
          </button>
        ) : (
          <div className="space-y-4 animate-in fade-in duration-500">
            <div className="bg-gray-900 border border-purple-800/40 rounded-2xl p-8 space-y-3">
              {data ? (
                <>
                  {data.same_as_phase2 && (
                    <div className="bg-amber-900/30 border border-amber-700/40 rounded-xl p-3 mb-2">
                      <p className="text-amber-300 text-sm font-medium">✨ مطابقة مثالية!</p>
                      <p className="text-amber-400/70 text-xs">اخترت نفس الشخص الذي اختارته الخوارزمية</p>
                    </div>
                  )}
                  <div className="text-5xl font-bold text-white">{data.partner_first_name}</div>
                  <div className="flex items-center justify-center gap-2">
                    <Brain size={14} className="text-purple-400" />
                    <span className="text-purple-300 font-bold text-xl">{data.compatibility_score}%</span>
                    <span className="text-gray-500 text-sm">توافق</span>
                  </div>
                </>
              ) : (
                <div className="text-gray-500">جاري التحميل...</div>
              )}
            </div>

            {timerActive && timeLeft > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-gray-400 text-xs mb-1">وقت الجلسة</p>
                <div className="text-3xl font-mono font-bold text-white">{formatTime(timeLeft)}</div>
              </div>
            )}

            {data && !wordSubmitted && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                <p className="text-gray-400 text-sm">صف هذه الجلسة بكلمة واحدة</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="كلمة واحدة..."
                    value={wordInput}
                    maxLength={20}
                    onChange={e => setWordInput(e.target.value.split(" ")[0])}
                    className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                  />
                  <button onClick={submitWord} className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-3 py-2">
                    <Send size={14} />
                  </button>
                </div>
              </div>
            )}
            {wordSubmitted && (
              <div className="flex items-center justify-center gap-2 text-green-400 text-sm">
                <CheckCircle size={14} /> تم الحفظ
              </div>
            )}
          </div>
        )}

        <p className="text-gray-600 text-xs">ابحث عن {data?.partner_first_name || "شريكك"} وابدأ محادثتكم</p>
      </div>
    </div>
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

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center" dir="rtl">
      <RefreshCw size={24} className="text-gray-500 animate-spin" />
    </div>
  )

  if (!data) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500" dir="rtl">
      لا توجد نتائج بعد
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6" dir="rtl">
      <div className="w-full max-w-sm space-y-5 text-center">

        <div className="text-5xl">✨</div>
        <h1 className="text-2xl font-bold text-white">الكشف النهائي</h1>

        {data.same_match ? (
          <div className="bg-amber-900/20 border border-amber-600/40 rounded-2xl p-5">
            <div className="text-3xl mb-2">🏆</div>
            <p className="text-amber-300 font-bold text-lg">مطابقة مثالية!</p>
            <p className="text-amber-400/70 text-sm mt-1">
              اخترت <strong>{data.phase2.partner_first_name}</strong> والخوارزمية اختارت نفس الشخص
            </p>
          </div>
        ) : null}

        {/* Side by side */}
        <div className="grid grid-cols-2 gap-3">
          {/* Phase 2 - Your choice */}
          <div className="bg-gray-900 border border-pink-800/40 rounded-2xl p-4 space-y-2">
            <div className="text-xl">💘</div>
            <p className="text-xs text-gray-500">اخترت</p>
            <p className="text-xl font-bold text-white">{data.phase2.partner_first_name}</p>
            {data.phase2.word && (
              <span className="text-xs bg-pink-900/40 text-pink-300 rounded-full px-2 py-0.5">
                "{data.phase2.word}"
              </span>
            )}
          </div>

          {/* Phase 3 - Algorithm */}
          <div className="bg-gray-900 border border-purple-800/40 rounded-2xl p-4 space-y-2">
            <div className="text-xl">🧠</div>
            <p className="text-xs text-gray-500">الخوارزمية</p>
            <p className="text-xl font-bold text-white">{data.phase3.partner_first_name}</p>
            <div className="flex items-center justify-center gap-1">
              <span className="text-purple-300 font-bold text-sm">{data.phase3.compatibility_score}%</span>
              <span className="text-xs text-gray-600">توافق</span>
            </div>
            {data.phase3.word && (
              <span className="text-xs bg-purple-900/40 text-purple-300 rounded-full px-2 py-0.5">
                "{data.phase3.word}"
              </span>
            )}
          </div>
        </div>

        <p className="text-gray-500 text-xs mt-4">
          {data.same_match
            ? "غريزتك والخوارزمية متوافقتان — هذا نادر الحدوث ✨"
            : "رأيت بعينيك، ورأت الخوارزمية بالبيانات — أيهما أصح؟"
          }
        </p>
      </div>
    </div>
  )
}

// ─── Not Enrolled Screen ──────────────────────────────────────────────────────
function NotEnrolledScreen() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6 text-center" dir="rtl">
      <div className="space-y-4">
        <div className="text-4xl">🔒</div>
        <h2 className="text-xl font-bold text-white">أنت لست مسجلاً</h2>
        <p className="text-gray-500 text-sm">رمزك صحيح، لكن لم يتم تسجيلك في هذه الفعالية.</p>
        <p className="text-gray-600 text-xs">تواصل مع المنظم للمساعدة.</p>
        <a href="/welcome" className="inline-flex items-center gap-2 text-purple-400 text-sm hover:text-purple-300">
          <Home size={14} /> العودة للصفحة الرئيسية
        </a>
      </div>
    </div>
  )
}

// ─── Root Component ───────────────────────────────────────────────────────────
export default function Event3Page() {
  const [searchParams] = useSearchParams()
  const [token, setToken] = useState<string | null>(() => {
    const p = searchParams.get("token") || searchParams.get("t")
    return p || localStorage.getItem("blindmatch_result_token") || null
  })

  const [eventState, setEventState] = useState<any>(null)
  const [enrolled, setEnrolled] = useState<boolean | null>(null) // null = unknown
  const [polling, setPolling] = useState(false)

  const fetchState = useCallback(async () => {
    if (!token) return
    const d = await call("e3-get-state", token)
    if (d.error) return
    setEventState(d)
    if (enrolled === null) setEnrolled(d.enrolled !== false)
  }, [token, enrolled])

  // Save token if from URL
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

  if (!eventState) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center" dir="rtl">
        <RefreshCw size={24} className="text-gray-500 animate-spin" />
      </div>
    )
  }

  const { phase, timer_active, timer_start, timer_duration } = eventState
  const timerProps = { timerActive: timer_active, timerStart: timer_start, timerDuration: timer_duration }

  // Check enrollment (only once state is loaded)
  if (enrolled === false) return <NotEnrolledScreen />

  const isRound = /^round[123]$/.test(phase)

  return (
    <>
      <Toaster position="top-center" />
      {phase === "setup" && <SetupScreen />}
      {isRound && <RoundScreen token={token} phase={phase} {...timerProps} />}
      {phase === "ranking" && <RankingScreen token={token} />}
      {phase === "phase2_reveal" && <Phase2RevealScreen token={token} {...timerProps} />}
      {phase === "phase2_oneword" && <Phase2WordScreen token={token} />}
      {phase === "phase3_reveal" && <Phase3RevealScreen token={token} {...timerProps} />}
      {phase === "final_reveal" && <FinalRevealScreen token={token} />}
    </>
  )
}
