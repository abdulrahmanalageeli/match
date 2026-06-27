import { useState, useEffect, useCallback } from "react"
import toast, { Toaster } from "react-hot-toast"
import {
  Users, Play, Square, ChevronRight, RotateCcw, CheckCircle,
  Circle, RefreshCw, Table2, Trophy, Clock, BarChart3, Shuffle,
  Eye, EyeOff, ArrowRight, Sparkles, Brain, Shield, LogOut,
  Grid3x3, Star, Check, AlertCircle, Loader2, Copy, Heart,
} from "lucide-react"

const ADMIN_PASSWORD = "soulmatch2026"
const API = "/api/admin"

const PHASES = [
  { id: "setup",          label: "إعداد الفعالية",       icon: "⚙️", color: "gray" },
  { id: "round1",         label: "الجولة الأولى",        icon: "1️⃣", color: "blue" },
  { id: "ranking1",       label: "التصنيف — جولة 1",    icon: "🏆", color: "yellow" },
  { id: "round2",         label: "الجولة الثانية",       icon: "2️⃣", color: "indigo" },
  { id: "ranking2",       label: "التصنيف النهائي",      icon: "🏆", color: "yellow" },
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
  const [allRankings, setAllRankings] = useState<any[]>([])
  const [expandedRanker, setExpandedRanker] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [matchPairs, setMatchPairs] = useState<any[]>([])

  const copyRankings = () => {
    if (!allRankings.length) return
    const date = new Date().toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" })
    const lines: string[] = [`تصنيفات المشاركين — ${date}`, "═".repeat(40), ""]
    for (const r of allRankings) {
      if (r.submitted) {
        lines.push(`▌ ${r.name} (#${r.number}) — ${r.count} مرتّبين:`)
        for (const item of r.ranked_list) {
          lines.push(`   ${item.rank}. ${item.name} (#${item.number})`)
        }
      } else {
        lines.push(`▌ ${r.name} (#${r.number}) — لم يصوّت`)
      }
      lines.push("")
    }
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
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

  const fetchMatches = useCallback(async () => {
    const data = await api("e3-get-matches")
    setMatchPairs(data.pairs || [])
  }, [])

  const fetchRankStatus = useCallback(async () => {
    const data = await api("e3-get-rankings-status")
    setRankStatus(data)
    const allData = await api("e3-get-all-rankings")
    setAllRankings(allData.rankings || [])
    await fetchMatches()
  }, [fetchMatches])

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
    if (selectedNumbers.size < 4)
      return { error: `يجب اختيار 4 مشاركين على الأقل (تم اختيار ${selectedNumbers.size})` }
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
              { label: "المشاركون المختارون", value: `${state.participants_selected}`, icon: Users, ok: (state.participants_selected || 0) >= 6 },
              { label: "خطة الجلسات", value: state.seating_generated ? "جاهزة ✓" : "لم تُولَّد", icon: Grid3x3, ok: state.seating_generated },
              { label: "التصنيفات المقدمة", value: `${state.rankings_submitted}/${state.participants_selected || 0}`, icon: BarChart3, ok: state.rankings_submitted > 0 && state.rankings_submitted >= (state.participants_selected || 1) },
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
                  <span className={`text-sm px-2 py-0.5 rounded-full ${selectedNumbers.size >= 6 ? "bg-green-900 text-green-300" : "bg-gray-800 text-gray-400"}`}>
                    {selectedNumbers.size} مختار
                  </span>
                  <button
                    onClick={saveParticipants}
                    disabled={selectedNumbers.size < 6 || !!loading}
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
                    desc: `يتطلب ${state?.participants_selected || 0} مشاركاً محدداً`,
                    action: generateSeating,
                    icon: Grid3x3,
                    color: "blue",
                    enabled: (state?.participants_selected || 0) >= 6,
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
                    label: "التصنيف بعد الجولة 1",
                    desc: `${state?.rankings_submitted || 0} صوّتوا حتى الآن`,
                    action: () => setPhase("ranking1"),
                    icon: BarChart3,
                    color: "yellow",
                    enabled: true,
                    loadKey: "phase-ranking1",
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
                    label: "التصنيف بعد الجولة 2",
                    desc: `${state?.rankings_submitted || 0} صوّتوا حتى الآن`,
                    action: () => setPhase("ranking2"),
                    icon: BarChart3,
                    color: "yellow",
                    enabled: true,
                    loadKey: "phase-ranking2",
                  },
                  {
                    label: "تشغيل مطابقة المرحلة 2",
                    desc: "بناءً على التصنيفات النهائية",
                    action: triggerPhase2,
                    icon: Shuffle,
                    color: "pink",
                    enabled: (state?.rankings_submitted || 0) > 0,
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
                <p className="text-xs mt-1">اختر المشاركين ثم اضغط "توليد خطة الجلسات"</p>
              </div>
            ) : (
              [1, 2].map(round => (
                <div key={round} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h4 className="font-semibold mb-4 flex items-center gap-2">
                    <span className="bg-purple-900/50 text-purple-300 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold">{round}</span>
                    الجولة {round === 1 ? "الأولى" : round === 2 ? "الثانية" : "الثالثة"}
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.keys(seating?.[round] || {}).map(Number).sort((a,b) => a-b).map(table => {
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
              <div className="flex gap-2">
                <button
                  onClick={copyRankings}
                  disabled={!allRankings.length}
                  className="flex items-center gap-1.5 bg-sky-900/50 hover:bg-sky-800 border border-sky-700/50 text-sky-300 rounded-lg px-3 py-1.5 text-xs disabled:opacity-40"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "تم النسخ ✓" : "نسخ"}
                </button>
                <button
                  onClick={() => run("randomize", () => api("e3-randomize-rankings").then(d => { fetchRankStatus(); return d }))}
                  disabled={!!loading}
                  className="flex items-center gap-1.5 bg-violet-900/60 hover:bg-violet-800 border border-violet-700/50 text-violet-300 rounded-lg px-3 py-1.5 text-xs"
                >
                  {loading === "randomize" ? <RefreshCw size={12} className="animate-spin" /> : <Shuffle size={12} />}
                  عشوائي
                </button>
                <button
                  onClick={() => { if (confirm("حذف جميع التصنيفات؟")) run("clear-rank", () => api("e3-clear-rankings").then(d => { fetchRankStatus(); return d })) }}
                  disabled={!!loading}
                  className="flex items-center gap-1.5 bg-red-900/40 hover:bg-red-900/70 border border-red-800/50 text-red-400 rounded-lg px-3 py-1.5 text-xs"
                >
                  <RotateCcw size={12} /> حذف الكل
                </button>
                <button onClick={fetchRankStatus} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400">
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            {rankStatus && (
              <>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-gray-400 text-sm">التقدم — {rankStatus.submitted} من {rankStatus.total} صوّتوا</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-600 transition-all duration-500"
                      style={{ width: `${(rankStatus.submitted / (rankStatus.total || 1)) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  {allRankings.map((r: any) => (
                    <div key={r.number} className={`bg-gray-900 border rounded-xl overflow-hidden transition-colors ${
                      r.submitted ? "border-green-800" : "border-gray-800"
                    }`}>
                      <button
                        onClick={() => setExpandedRanker(expandedRanker === r.number ? null : r.number)}
                        className="w-full flex items-center gap-3 p-3 text-right hover:bg-gray-800/40 transition-colors"
                      >
                        {r.submitted
                          ? <CheckCircle size={15} className="text-green-400 flex-shrink-0" />
                          : <Circle size={15} className="text-gray-600 flex-shrink-0" />
                        }
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-gray-200 truncate">{r.name}</span>
                          <span className="text-gray-600 text-xs mr-2">#{r.number}</span>
                        </div>
                        <span className="text-gray-500 text-xs flex-shrink-0">{r.submitted ? `${r.count} مرتّبين` : "لم يصوّت"}</span>
                        <ChevronRight size={13} className={`text-gray-600 transition-transform flex-shrink-0 ${expandedRanker === r.number ? "rotate-90" : ""}`} />
                      </button>
                      {expandedRanker === r.number && r.submitted && (
                        <div className="px-4 pb-3 border-t border-gray-800/60 pt-2">
                          <div className="space-y-1">
                            {r.ranked_list.map((item: any, idx: number) => (
                              <div key={item.number} className="flex items-center gap-2 text-xs">
                                <span className="w-5 h-5 rounded-md bg-gray-800 text-gray-500 flex items-center justify-center font-bold flex-shrink-0">{idx + 1}</span>
                                <span className="text-gray-300">{item.name}</span>
                                <span className="text-gray-600 font-mono">#{item.number}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── Match Results ──────────────────────────────────────────── */}
            <div className="space-y-3 pt-2 border-t border-gray-800/60">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-gray-300 text-sm">نتائج المطابقة (اختيارك)</h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => run("phase2", () => api("e3-trigger-phase2-matching").then(d => { fetchMatches(); return d }))}
                    disabled={!!loading || (rankStatus?.submitted || 0) === 0}
                    className="flex items-center gap-1.5 bg-pink-900/40 hover:bg-pink-900/70 border border-pink-800/50 text-pink-300 rounded-lg px-3 py-1.5 text-xs disabled:opacity-40"
                  >
                    {loading === "phase2" ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    تشغيل المطابقة
                  </button>
                  <button onClick={fetchMatches} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400">
                    <RefreshCw size={14} />
                  </button>
                </div>
              </div>

              {matchPairs.length === 0 ? (
                <p className="text-gray-600 text-xs text-center py-4">لا توجد نتائج بعد — اضغط "تشغيل المطابقة" بعد اكتمال التصنيفات</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-gray-500 text-xs">{matchPairs.length} زوج</p>
                  {matchPairs.map((pair: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
                      <span className="text-gray-600 text-xs font-mono w-5 flex-shrink-0">{idx + 1}</span>
                      <div className="flex-1 flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${pair.aGender === "female" ? "bg-pink-400" : "bg-blue-400"}`} />
                        <span className="text-sm font-medium text-white truncate">{pair.aName}</span>
                        <span className="text-gray-600 text-xs font-mono">#{pair.a}</span>
                      </div>
                      <Heart size={13} className="text-pink-500 flex-shrink-0" />
                      <div className="flex-1 flex items-center gap-2 min-w-0 justify-end">
                        <span className="text-gray-600 text-xs font-mono">#{pair.b}</span>
                        <span className="text-sm font-medium text-white truncate">{pair.bName}</span>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${pair.bGender === "female" ? "bg-pink-400" : "bg-blue-400"}`} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
