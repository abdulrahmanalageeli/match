import { useState, useEffect, useCallback } from "react"
import toast, { Toaster } from "react-hot-toast"
import {
  Users, Play, Square, ChevronRight, RotateCcw, CheckCircle,
  Circle, RefreshCw, Table2, Trophy, Clock, BarChart3, Shuffle,
  Eye, EyeOff, ArrowRight, Sparkles, Brain, Shield, LogOut,
  Grid3x3, Star, Check, AlertCircle, Loader2,
} from "lucide-react"

const ADMIN_PASSWORD = "soulmatch2026"
const API = "/api/admin"

const PHASES = [
  { id: "setup",          label: "إعداد الفعالية",       icon: "⚙️", color: "gray" },
  { id: "round1",         label: "الجولة الأولى",        icon: "1️⃣", color: "blue" },
  { id: "round2",         label: "الجولة الثانية",       icon: "2️⃣", color: "indigo" },
  { id: "round3",         label: "الجولة الثالثة",       icon: "3️⃣", color: "violet" },
  { id: "ranking",        label: "التصنيف",              icon: "🏆", color: "yellow" },
  { id: "phase2_reveal",  label: "الكشف الأول",          icon: "💘", color: "pink" },
  { id: "phase2_oneword", label: "الكلمة الأولى",        icon: "💬", color: "rose" },
  { id: "phase3_reveal",  label: "الكشف الثاني",         icon: "🧠", color: "purple" },
  { id: "final_reveal",   label: "الكشف النهائي",        icon: "✨", color: "amber" },
]

function api(action: string, extra: Record<string, any> = {}) {
  return fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, password: ADMIN_PASSWORD, ...extra }),
  }).then(r => r.json())
}

export default function Admin3Page() {
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState("")

  const [state, setState] = useState<any>(null)
  const [participants, setParticipants] = useState<any[]>([])
  const [selectedNumbers, setSelectedNumbers] = useState<Set<number>>(new Set())
  const [seating, setSeating] = useState<any>(null)
  const [rankStatus, setRankStatus] = useState<any>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [genderFilter, setGenderFilter] = useState("all")
  const [activeTab, setActiveTab] = useState<"control" | "seating" | "ranking">("control")
  const [timerRemaining, setTimerRemaining] = useState(0)

  useEffect(() => {
    if (localStorage.getItem("admin3") === "authenticated") {
      setAuthenticated(true)
    }
  }, [])

  const login = () => {
    if (password === ADMIN_PASSWORD) {
      localStorage.setItem("admin3", "authenticated")
      setAuthenticated(true)
    } else {
      toast.error("كلمة المرور غير صحيحة")
    }
  }

  const logout = () => {
    localStorage.removeItem("admin3")
    setAuthenticated(false)
    setPassword("")
  }

  const fetchState = useCallback(async () => {
    const data = await api("e3-get-state")
    setState(data)
  }, [])

  const fetchParticipants = useCallback(async () => {
    const data = await api("e3-get-participants")
    if (data.participants) {
      setParticipants(data.participants)
      const sel = new Set<number>(data.participants.filter((p: any) => p.selected).map((p: any) => p.number))
      setSelectedNumbers(sel)
    }
  }, [])

  const fetchSeating = useCallback(async () => {
    const data = await api("e3-get-seating")
    setSeating(data.seating)
  }, [])

  const fetchRankStatus = useCallback(async () => {
    const data = await api("e3-get-rankings-status")
    setRankStatus(data)
  }, [])

  useEffect(() => {
    if (!authenticated) return
    fetchState()
    fetchParticipants()
    fetchSeating()
    const iv = setInterval(fetchState, 3000)
    return () => clearInterval(iv)
  }, [authenticated, fetchState, fetchParticipants, fetchSeating])

  // Timer countdown
  useEffect(() => {
    if (!state?.timer_active || !state?.timer_start) {
      setTimerRemaining(0)
      return
    }
    const update = () => {
      const elapsed = Math.floor((Date.now() - new Date(state.timer_start).getTime()) / 1000)
      setTimerRemaining(Math.max(0, (state.timer_duration || 1200) - elapsed))
    }
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [state?.timer_active, state?.timer_start, state?.timer_duration])

  const run = async (label: string, fn: () => Promise<any>) => {
    setLoading(label)
    try {
      const data = await fn()
      if (data.error) toast.error(data.error)
      else toast.success(data.message || "تم بنجاح")
      fetchState()
    } catch (e: any) {
      toast.error(e.message || "خطأ")
    } finally {
      setLoading(null)
    }
  }

  const setPhase = (phase: string) => run(`phase-${phase}`, () => api("e3-set-phase", { phase }))
  const startTimer = (round: number, duration = 1200) =>
    run("timer", () => api("e3-start-timer", { round, duration }))
  const stopTimer = () => run("timer-stop", () => api("e3-stop-timer"))

  const generateSeating = () => run("seating", async () => {
    const data = await api("e3-generate-seating")
    if (!data.error) { fetchSeating(); fetchParticipants() }
    return data
  })

  const saveParticipants = () => run("save-participants", async () => {
    if (selectedNumbers.size !== 36)
      return { error: `يجب اختيار 36 مشاركاً بالضبط (تم اختيار ${selectedNumbers.size})` }
    const data = await api("e3-set-participants", { participant_numbers: Array.from(selectedNumbers) })
    if (!data.error) fetchParticipants()
    return data
  })

  const triggerPhase2 = () => run("phase2", () => api("e3-trigger-phase2-matching"))
  const triggerPhase3 = () => run("phase3", () => api("e3-trigger-phase3-matching"))
  const resetEvent = () => {
    if (!confirm("هل أنت متأكد من إعادة تعيين الفعالية؟ سيتم حذف جميع البيانات.")) return
    run("reset", async () => {
      const d = await api("e3-reset-event")
      if (!d.error) { fetchState(); fetchParticipants(); setSeating(null); setRankStatus(null) }
      return d
    })
  }

  const toggleParticipant = (num: number) => {
    setSelectedNumbers(prev => {
      const next = new Set(prev)
      if (next.has(num)) next.delete(num)
      else next.add(num)
      return next
    })
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
  }

  const currentPhaseIdx = PHASES.findIndex(p => p.id === state?.phase)

  const filteredParticipants = participants.filter(p => {
    const matchSearch = !searchTerm || p.name.includes(searchTerm) || String(p.number).includes(searchTerm)
    const matchGender = genderFilter === "all" || p.gender === genderFilter || p.gender?.toLowerCase() === genderFilter
    return matchSearch && matchGender
  })

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">✨</div>
            <h1 className="text-xl font-bold text-white">التوافق الأعمى 3.0</h1>
            <p className="text-gray-400 text-sm mt-1">لوحة التحكم</p>
          </div>
          <input
            type="password"
            placeholder="كلمة المرور"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && login()}
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 text-right mb-4 focus:outline-none focus:border-purple-500"
          />
          <button
            onClick={login}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-lg py-3 font-medium transition-colors"
          >
            دخول
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white" dir="rtl">
      <Toaster position="top-center" />

      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">✨</span>
          <div>
            <h1 className="text-lg font-bold">التوافق الأعمى 3.0</h1>
            <p className="text-xs text-gray-400">لوحة التحكم</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {state && (
            <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5">
              <div className={`w-2 h-2 rounded-full ${state.phase !== "setup" ? "bg-green-400 animate-pulse" : "bg-gray-500"}`} />
              <span className="text-sm text-gray-300">
                {PHASES.find(p => p.id === state?.phase)?.label || "—"}
              </span>
            </div>
          )}
          <button onClick={logout} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6 space-y-6">

        {/* Phase Progress */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-medium text-gray-400 mb-3">مراحل الفعالية</h2>
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {PHASES.map((phase, idx) => (
              <div key={phase.id} className="flex items-center gap-1 flex-shrink-0">
                <div className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  idx === currentPhaseIdx
                    ? "bg-purple-600 text-white shadow-lg shadow-purple-500/30"
                    : idx < currentPhaseIdx
                    ? "bg-gray-700 text-green-400"
                    : "bg-gray-800 text-gray-500"
                }`}>
                  <span className="ml-1">{phase.icon}</span>{phase.label}
                  {idx < currentPhaseIdx && <Check size={10} className="inline mr-1" />}
                </div>
                {idx < PHASES.length - 1 && <ArrowRight size={12} className="text-gray-700 flex-shrink-0" />}
              </div>
            ))}
          </div>
        </div>

        {/* Stats Row */}
        {state && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "المشاركون المختارون", value: `${state.participants_selected}/36`, icon: Users, ok: state.participants_selected === 36 },
              { label: "خطة الجلسات", value: state.seating_generated ? "جاهزة ✓" : "لم تُولَّد", icon: Grid3x3, ok: state.seating_generated },
              { label: "التصنيفات المقدمة", value: `${state.rankings_submitted}/36`, icon: BarChart3, ok: state.rankings_submitted === 36 },
              { label: "مطابقات المرحلة 2", value: state.phase2_matches_done ? "جاهزة ✓" : "—", icon: Trophy, ok: state.phase2_matches_done },
            ].map(stat => (
              <div key={stat.label} className={`bg-gray-900 border rounded-xl p-4 ${stat.ok ? "border-green-800" : "border-gray-800"}`}>
                <div className="flex items-center justify-between mb-1">
                  <stat.icon size={16} className={stat.ok ? "text-green-400" : "text-gray-500"} />
                  <span className={`text-lg font-bold ${stat.ok ? "text-green-400" : "text-white"}`}>{stat.value}</span>
                </div>
                <p className="text-xs text-gray-500">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Timer */}
        {state?.timer_active && (
          <div className="bg-blue-900/30 border border-blue-700/50 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock size={20} className="text-blue-400 animate-pulse" />
              <div>
                <p className="font-medium text-blue-300">المؤقت نشط</p>
                <p className="text-xs text-gray-400">الجولة {state.timer_round}</p>
              </div>
            </div>
            <div className="text-3xl font-mono font-bold text-blue-300">{formatTime(timerRemaining)}</div>
            <button
              onClick={stopTimer}
              disabled={!!loading}
              className="bg-red-600/80 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm flex items-center gap-2"
            >
              <Square size={14} /> إيقاف
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-800">
          {[
            { id: "control",  label: "التحكم", icon: Play },
            { id: "seating",  label: "خطة الجلسات", icon: Table2 },
            { id: "ranking",  label: "التصنيفات", icon: BarChart3 },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id as any); if (tab.id === "ranking") fetchRankStatus() }}
              className={`flex items-center gap-2 px-4 py-2 border-b-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-purple-500 text-purple-400"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              <tab.icon size={14} />{tab.label}
            </button>
          ))}
        </div>

        {/* TAB: CONTROL ─────────────────────────────────────────────────────── */}
        {activeTab === "control" && (
          <div className="space-y-4">

            {/* Participant Selection */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Users size={16} className="text-purple-400" /> اختيار المشاركين
                </h3>
                <div className="flex items-center gap-2">
                  <span className={`text-sm px-2 py-0.5 rounded-full ${selectedNumbers.size === 36 ? "bg-green-900 text-green-300" : "bg-gray-800 text-gray-400"}`}>
                    {selectedNumbers.size}/36
                  </span>
                  <button
                    onClick={saveParticipants}
                    disabled={selectedNumbers.size !== 36 || !!loading}
                    className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg px-3 py-1.5 text-sm flex items-center gap-1"
                  >
                    {loading === "save-participants" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    حفظ
                  </button>
                </div>
              </div>

              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  placeholder="ابحث بالاسم أو الرقم..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:border-purple-500"
                />
                <select
                  value={genderFilter}
                  onChange={e => setGenderFilter(e.target.value)}
                  className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm"
                >
                  <option value="all">الجميع</option>
                  <option value="male">ذكر</option>
                  <option value="female">أنثى</option>
                </select>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-72 overflow-y-auto">
                {filteredParticipants.map(p => (
                  <button
                    key={p.number}
                    onClick={() => toggleParticipant(p.number)}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-right text-xs transition-all ${
                      selectedNumbers.has(p.number)
                        ? "border-purple-500 bg-purple-900/30 text-white"
                        : "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600"
                    }`}
                  >
                    <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center ${
                      selectedNumbers.has(p.number) ? "bg-purple-600" : "bg-gray-700"
                    }`}>
                      {selectedNumbers.has(p.number) && <Check size={10} />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-gray-500">#{p.number} · {p.age || "?"}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Phase & Timer Controls */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="font-semibold flex items-center gap-2 mb-4">
                <Play size={16} className="text-purple-400" /> التحكم في المراحل
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    label: "توليد خطة الجلسات",
                    desc: "يتطلب 36 مشاركاً",
                    action: generateSeating,
                    icon: Grid3x3,
                    color: "blue",
                    enabled: state?.participants_selected === 36,
                    loadKey: "seating",
                  },
                  {
                    label: "بدء الجولة الأولى",
                    desc: "20 دقيقة",
                    action: () => { setPhase("round1"); startTimer(1, 1200) },
                    icon: Play,
                    color: "green",
                    enabled: state?.seating_generated,
                    loadKey: "phase-round1",
                  },
                  {
                    label: "بدء الجولة الثانية",
                    desc: "20 دقيقة",
                    action: () => { setPhase("round2"); startTimer(2, 1200) },
                    icon: Play,
                    color: "green",
                    enabled: true,
                    loadKey: "phase-round2",
                  },
                  {
                    label: "بدء الجولة الثالثة",
                    desc: "20 دقيقة",
                    action: () => { setPhase("round3"); startTimer(3, 1200) },
                    icon: Play,
                    color: "green",
                    enabled: true,
                    loadKey: "phase-round3",
                  },
                  {
                    label: "فتح شاشة التصنيف",
                    desc: "5 دقائق",
                    action: () => setPhase("ranking"),
                    icon: BarChart3,
                    color: "yellow",
                    enabled: true,
                    loadKey: "phase-ranking",
                  },
                  {
                    label: "تشغيل مطابقة المرحلة 2",
                    desc: "بناءً على التصنيفات",
                    action: triggerPhase2,
                    icon: Shuffle,
                    color: "pink",
                    enabled: (state?.rankings_submitted || 0) >= 18,
                    loadKey: "phase2",
                  },
                  {
                    label: "كشف المرحلة 2",
                    desc: "30 دقيقة",
                    action: () => { setPhase("phase2_reveal"); startTimer(4, 1800) },
                    icon: Eye,
                    color: "pink",
                    enabled: state?.phase2_matches_done,
                    loadKey: "phase-phase2_reveal",
                  },
                  {
                    label: "شاشة الكلمة الواحدة",
                    desc: "بعد المرحلة 2",
                    action: () => setPhase("phase2_oneword"),
                    icon: Trophy,
                    color: "rose",
                    enabled: true,
                    loadKey: "phase-phase2_oneword",
                  },
                  {
                    label: "تشغيل مطابقة المرحلة 3",
                    desc: "الخوارزمية",
                    action: triggerPhase3,
                    icon: Brain,
                    color: "purple",
                    enabled: true,
                    loadKey: "phase3",
                  },
                  {
                    label: "كشف المرحلة 3",
                    desc: "30 دقيقة",
                    action: () => { setPhase("phase3_reveal"); startTimer(5, 1800) },
                    icon: Sparkles,
                    color: "purple",
                    enabled: true,
                    loadKey: "phase-phase3_reveal",
                  },
                  {
                    label: "الكشف النهائي",
                    desc: "المقارنة الأخيرة",
                    action: () => setPhase("final_reveal"),
                    icon: Star,
                    color: "amber",
                    enabled: true,
                    loadKey: "phase-final_reveal",
                  },
                ].map(btn => (
                  <button
                    key={btn.loadKey}
                    onClick={btn.action}
                    disabled={!btn.enabled || !!loading}
                    className={`flex items-center gap-3 p-3 rounded-lg border text-right transition-all ${
                      btn.enabled
                        ? "border-gray-700 bg-gray-800 hover:bg-gray-750 hover:border-purple-700 text-white"
                        : "border-gray-800 bg-gray-850 text-gray-600 cursor-not-allowed"
                    }`}
                  >
                    {loading === btn.loadKey
                      ? <Loader2 size={16} className="animate-spin text-purple-400 flex-shrink-0" />
                      : <btn.icon size={16} className={btn.enabled ? "text-purple-400" : "text-gray-700"} />
                    }
                    <div>
                      <div className="text-sm font-medium">{btn.label}</div>
                      <div className="text-xs text-gray-500">{btn.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Danger Zone */}
            <div className="bg-gray-900 border border-red-900/40 rounded-xl p-4">
              <h3 className="font-semibold text-red-400 flex items-center gap-2 mb-3">
                <AlertCircle size={16} /> منطقة الخطر
              </h3>
              <button
                onClick={resetEvent}
                disabled={!!loading}
                className="bg-red-900/50 hover:bg-red-900 border border-red-700/50 text-red-300 rounded-lg px-4 py-2 text-sm flex items-center gap-2"
              >
                <RotateCcw size={14} /> إعادة تعيين الفعالية بالكامل
              </button>
            </div>
          </div>
        )}

        {/* TAB: SEATING ─────────────────────────────────────────────────────── */}
        {activeTab === "seating" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-300">خطة توزيع الجلسات</h3>
              <button onClick={fetchSeating} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400">
                <RefreshCw size={14} />
              </button>
            </div>

            {!seating ? (
              <div className="text-center py-12 text-gray-500">
                <Grid3x3 size={32} className="mx-auto mb-3 opacity-30" />
                <p>لم تُولَّد خطة الجلسات بعد</p>
                <p className="text-xs mt-1">اختر 36 مشاركاً ثم اضغط "توليد خطة الجلسات"</p>
              </div>
            ) : (
              [1, 2, 3].map(round => (
                <div key={round} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h4 className="font-semibold mb-4 flex items-center gap-2">
                    <span className="bg-purple-900/50 text-purple-300 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold">{round}</span>
                    الجولة {round === 1 ? "الأولى" : round === 2 ? "الثانية" : "الثالثة"}
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[1, 2, 3, 4, 5, 6].map(table => {
                      const members = seating?.[round]?.[table] || []
                      return (
                        <div key={table} className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
                          <div className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-1">
                            <Table2 size={12} /> طاولة {table}
                          </div>
                          <div className="space-y-1">
                            {members.map((m: any) => (
                              <div key={m.number} className="text-xs flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${m.gender === "female" ? "bg-pink-400" : "bg-blue-400"}`} />
                                <span className="text-gray-300 truncate">{m.name}</span>
                                <span className="text-gray-600 flex-shrink-0">#{m.number}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB: RANKING ─────────────────────────────────────────────────────── */}
        {activeTab === "ranking" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-300">حالة التصنيفات</h3>
              <button onClick={fetchRankStatus} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400">
                <RefreshCw size={14} />
              </button>
            </div>

            {rankStatus && (
              <>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-gray-400 text-sm">التقدم</span>
                    <span className="font-bold text-white">{rankStatus.submitted}/{rankStatus.total}</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-600 transition-all duration-500"
                      style={{ width: `${(rankStatus.submitted / (rankStatus.total || 36)) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {(rankStatus.status || []).map((s: any) => (
                    <div key={s.number} className={`flex items-center gap-2 p-2 rounded-lg border text-xs ${
                      s.submitted ? "border-green-800 bg-green-900/20" : "border-gray-700 bg-gray-800"
                    }`}>
                      {s.submitted
                        ? <CheckCircle size={14} className="text-green-400 flex-shrink-0" />
                        : <Circle size={14} className="text-gray-600 flex-shrink-0" />
                      }
                      <div className="min-w-0">
                        <div className="truncate text-gray-300">{s.name}</div>
                        <div className="text-gray-600">#{s.number}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
