import { useState, useEffect, useCallback } from "react"
import toast, { Toaster } from "react-hot-toast"
import {
  Users, Play, Square, ChevronRight, RotateCcw, CheckCircle,
  Circle, RefreshCw, Table2, Trophy, Clock, BarChart3, Shuffle,
  Eye, EyeOff, ArrowRight, Sparkles, Brain, Shield, LogOut,
  Grid3x3, Star, Check, AlertCircle, Loader2, Copy, Heart, Layers,
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
  const [expandedPair, setExpandedPair] = useState<number | null>(null)

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
  const [activeTab, setActiveTab] = useState<"control" | "seating" | "ranking" | "participants" | "overview">("control")
  const [overviewData, setOverviewData] = useState<any>(null)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [timerRemaining, setTimerRemaining] = useState(0)
  const [editingRanker, setEditingRanker] = useState<number | null>(null)
  const [editedOrder, setEditedOrder] = useState<any[]>([])
  const [swapA, setSwapA] = useState<number | null>(null)
  const [mapRound, setMapRound] = useState<1 | 2 | 20>(1)
  const [editingTable, setEditingTable] = useState<{ num: number; round: number; value: string } | null>(null)
  const [editingTableCard, setEditingTableCard] = useState<{ round: number; table: number; value: string } | null>(null)
  const [selectedParticipantNum, setSelectedParticipantNum] = useState<number | null>(null)
  const [participantPanelOpen, setParticipantPanelOpen] = useState(false)
  const [pairDetail, setPairDetail] = useState<any | null>(null)

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

  const fetchOverview = useCallback(async () => {
    setOverviewLoading(true)
    const data = await api("e3-get-overview")
    setOverviewData(data)
    setOverviewLoading(false)
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

  useEffect(() => {
    if (authenticated && activeTab === "seating") { fetchSeating(); fetchRankStatus() }
    if (authenticated && activeTab === "ranking") fetchRankStatus()
    if (authenticated && activeTab === "participants") { fetchParticipants(); fetchSeating(); fetchRankStatus(); fetchMatches() }
    if (authenticated && activeTab === "overview") fetchOverview()
  }, [activeTab, authenticated, fetchSeating, fetchRankStatus, fetchParticipants, fetchMatches, fetchOverview])

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
  const saveRanking = (rankerNum: number) =>
    run(`save-rank-${rankerNum}`, () => api("e3-set-ranking", { ranker_number: rankerNum, ranked_list: editedOrder.map(i => i.number) }).then(d => { if (!d.error) { setEditingRanker(null); fetchRankStatus() } return d }))

  const doSwap = (numB: number) =>
    run(`swap-${swapA}-${numB}`, () => api("e3-swap-seating", { num_a: swapA, num_b: numB }).then(d => { if (!d.error) { setSwapA(null); fetchSeating() } return d }))

  const handleMemberClick = (m: any) => {
    if (swapA) {
      if (swapA === m.number) setSwapA(null)
      else doSwap(m.number)
    } else {
      setSelectedParticipantNum(m.number)
      setParticipantPanelOpen(true)
    }
  }

  const moveTable = (num: number, round: number, newTable: number) =>
    run(`move-table-${num}-r${round}`, () => api("e3-move-table", { participant_number: num, round, new_table: newTable }).then(d => { if (!d.error) { setEditingTable(null); fetchSeating() } return d }))

  const renameTable = (round: number, oldTable: number, newTable: number) => {
    const members: any[] = seating?.[round]?.[oldTable] || []
    if (!members.length || newTable === oldTable) { setEditingTableCard(null); return }
    run(`rename-table-${round}-${oldTable}`, () =>
      Promise.all(members.map(m => api("e3-move-table", { participant_number: m.number, round, new_table: newTable })))
        .then(() => { setEditingTableCard(null); fetchSeating(); return { message: `Table renamed` } })
    )
  }

  const getParticipantTables = (num: number): Record<number, number> => {
    if (!seating) return {}
    const result: Record<number, number> = {}
    for (const r of [1, 2] as const) {
      for (const [table, members] of Object.entries(seating[r] || {})) {
        if ((members as any[]).some((m: any) => m.number === num)) {
          result[r] = Number(table)
        }
      }
    }
    return result
  }

  const getNextStep = (): { label: string; action: () => void; ready: boolean } | null => {
    if (!state) return null
    const ph = state.phase || "setup"
    const hasSeating = state.seating_generated
    const ranked = state.rankings_submitted || 0
    const hasMatches = state.phase2_matches_done
    const sel = state.participants_selected || 0
    if (ph === "setup" && !hasSeating) return { label: "توليد خطة الجلسات", action: generateSeating, ready: sel >= 6 }
    if (ph === "setup" && hasSeating) return { label: "⬅ بدء الجولة الأولى (20 دقيقة)", action: () => { setPhase("round1"); startTimer(1, 1200) }, ready: true }
    if (ph === "round1") return { label: "⬅ التصنيف بعد الجولة 1", action: () => setPhase("ranking1"), ready: true }
    if (ph === "ranking1") return { label: "⬅ بدء الجولة الثانية (20 دقيقة)", action: () => { setPhase("round2"); startTimer(2, 1200) }, ready: true }
    if (ph === "round2") return { label: "⬅ التصنيف النهائي", action: () => setPhase("ranking2"), ready: true }
    if (ph === "ranking2" && !hasMatches) return { label: "⬅ تشغيل مطابقة اختيار المشاركين", action: () => run("phase2", () => api("e3-trigger-phase2-matching").then(d => { fetchMatches(); fetchState(); return d })), ready: ranked > 0 }
    if (ph === "ranking2" && hasMatches) return { label: "⬅ بدء كشف المرحلة 2 (30 دقيقة)", action: () => { setPhase("phase2_reveal"); startTimer(4, 1800) }, ready: true }
    if (ph === "phase2_reveal" && !state.phase3_matches_done) return { label: "⬅ تشغيل مطابقة الخوارزمية", action: () => run("phase3", () => api("e3-trigger-phase3-matching").then(d => { fetchState(); return d })), ready: true }
    if (ph === "phase2_reveal" && state.phase3_matches_done) return { label: "⬅ كشف المرحلة 3 (30 دقيقة)", action: () => { setPhase("phase3_reveal"); startTimer(5, 1800) }, ready: true }
    if (ph === "phase3_reveal") return { label: "⬅ الكشف النهائي ✨", action: () => setPhase("final_reveal"), ready: true }
    return null
  }

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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "المشاركون المختارون", value: `${state.participants_selected}`, icon: Users, ok: (state.participants_selected || 0) >= 6 },
              { label: "خطة الجلسات", value: state.seating_generated ? "جاهزة ✓" : "لم تُولَّد", icon: Grid3x3, ok: state.seating_generated },
              { label: "التصنيفات المقدمة", value: `${state.rankings_submitted}/${state.participants_selected || 0}`, icon: BarChart3, ok: state.rankings_submitted > 0 && state.rankings_submitted >= (state.participants_selected || 1) },
              { label: "مطابقات المرحلة 2", value: state.phase2_matches_done ? "جاهزة ✓" : "—", icon: Trophy, ok: state.phase2_matches_done },
              { label: "مطابقات الخوارزمية", value: state.phase3_matches_done ? "جاهزة ✓" : "—", icon: Brain, ok: state.phase3_matches_done },
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
          <div className="bg-blue-900/30 border border-blue-700/50 rounded-xl overflow-hidden">
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock size={20} className="text-blue-400 animate-pulse" />
                <div>
                  <p className="font-medium text-blue-300">المؤقت نشط</p>
                  <p className="text-xs text-gray-400">الجولة {state.timer_round} · {formatTime(timerRemaining)} متبقية</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className={`text-3xl font-mono font-bold ${timerRemaining < 120 ? 'text-red-400' : 'text-blue-300'}`}>{formatTime(timerRemaining)}</div>
                <button onClick={stopTimer} disabled={!!loading} className="bg-red-600/80 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm flex items-center gap-2">
                  <Square size={14} /> إيقاف
                </button>
              </div>
            </div>
            <div className="h-1.5 bg-blue-950/60">
              <div
                className={`h-full transition-all duration-1000 ${timerRemaining < 120 ? 'bg-red-500' : 'bg-blue-400'}`}
                style={{ width: `${Math.min(100, (timerRemaining / (state.timer_duration || 1200)) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-800">
          {[
            { id: "control",      label: "التحكم",     icon: Play },
            { id: "seating",      label: "خريطة الجلسات", icon: Table2 },
            { id: "participants", label: "المشاركون",  icon: Users },
            { id: "ranking",      label: "التصنيفات",  icon: BarChart3 },
            { id: "overview",     label: "نظرة شاملة", icon: Layers },
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

            {/* Next Step */}
            {getNextStep() && (() => { const ns = getNextStep()!; return (
              <div className="bg-gradient-to-r from-emerald-900/40 to-teal-900/30 border border-emerald-700/50 rounded-xl p-4">
                <p className="text-emerald-400/70 text-xs mb-2 font-medium">الخطوة التالية الموصى بها</p>
                <button
                  onClick={ns.action}
                  disabled={!ns.ready || !!loading}
                  className="w-full py-3 rounded-xl font-bold text-base bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98] shadow-lg shadow-emerald-900/40"
                >{loading?.startsWith('phase') || loading === 'timer' || loading === 'seating' ? <RefreshCw size={16} className="animate-spin inline ml-2" /> : null}{ns.label}</button>
                {!ns.ready && <p className="text-emerald-600 text-xs mt-1.5 text-center">أكمل الخطوات السابقة أولاً</p>}
              </div>
            )})()}

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

        {/* TAB: SEATING MAP ──────────────────────────────────────────────────── */}
        {activeTab === "seating" && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-300">خريطة الجلسات التفاعلية</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => { fetchSeating(); fetchRankStatus() }} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400">
                  <RefreshCw size={14} />
                </button>
                {seating && (
                  <div className="flex bg-gray-800 rounded-lg p-0.5">
                    {([1, 2] as const).map(r => (
                      <button key={r} onClick={() => setMapRound(r)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${mapRound === r ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                      >
                        {r === 1 ? 'الجولة الأولى' : 'الجولة الثانية'}
                      </button>
                    ))}
                    {matchPairs.length > 0 && (
                      <button onClick={() => setMapRound(20)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${mapRound === 20 ? 'bg-emerald-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                      >
                        1:1 جلسات
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Swap mode banner */}
            {swapA !== null && (
              <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                  <span className="text-amber-300 text-sm font-medium">
                    تبديل: <span className="text-white">{participants.find(p => p.number === swapA)?.name}</span>
                    <span className="text-amber-600 text-xs mr-2">← اضغط على شخص آخر في أي طاولة للتبديل</span>
                  </span>
                </div>
                <button onClick={() => setSwapA(null)} className="text-amber-600 hover:text-amber-300 text-xs px-2 py-1 rounded-lg hover:bg-amber-900/30 transition-colors">
                  إلغاء ✕
                </button>
              </div>
            )}

            {!seating ? (
              <div className="text-center py-16 text-gray-500">
                <Grid3x3 size={40} className="mx-auto mb-4 opacity-20" />
                <p className="font-medium">لم تُولَّد خطة الجلسات بعد</p>
                <p className="text-xs mt-1.5 text-gray-600">اختر المشاركين ثم اضغط "توليد خطة الجلسات"</p>
              </div>
            ) : mapRound === 20 ? (
              /* ── 1:1 Pairs View ─────────────────── */
              <>
                {matchPairs.length === 0 ? (
                  <div className="text-center py-12 text-gray-600">
                    <Heart size={32} className="mx-auto mb-3 opacity-30" />
                    <p>لم تُجرَ مطابقة الاختيار بعد</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {matchPairs.map((pair: any, idx: number) => (
                      <div key={idx} className={`rounded-2xl p-4 border ${
                        pair.matchType === 'mutual' ? 'bg-emerald-950/20 border-emerald-800/40' : 'bg-amber-950/15 border-amber-800/30'
                      }`}>
                        {/* Pair header */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {pair.table ? (
                              <div className="w-9 h-9 rounded-xl bg-indigo-900/40 border border-indigo-800/50 flex items-center justify-center flex-shrink-0">
                                <span className="text-indigo-300 font-black text-base leading-none">{pair.table}</span>
                              </div>
                            ) : (
                              <div className="w-9 h-9 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center flex-shrink-0">
                                <span className="text-gray-600 text-xs">—</span>
                              </div>
                            )}
                            <div>
                              <p className="text-[10px] text-gray-500 leading-tight">{pair.table ? `طاولة ${pair.table}` : 'بدون طاولة'}</p>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                pair.matchType === 'mutual' ? 'text-emerald-300' : 'text-amber-400'
                              }`}>{pair.matchType === 'mutual' ? '🔁 تبادل' : '⚡ احتياطي'}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {pair.compatScore != null && pair.bothComplete ? (
                              <div className={`text-center px-2.5 py-1.5 rounded-xl border ${
                                pair.compatScore >= 75 ? 'bg-green-900/30 border-green-700/40 text-green-300' :
                                pair.compatScore >= 55 ? 'bg-blue-900/30 border-blue-700/40 text-blue-300' :
                                'bg-gray-800 border-gray-700 text-gray-400'
                              }`}>
                                <p className="text-lg font-black leading-none">{pair.compatScore}%</p>
                                <p className="text-[9px] opacity-60 mt-0.5">توافق</p>
                              </div>
                            ) : (
                              <div className="text-center px-2 py-1.5 rounded-xl bg-red-950/30 border border-red-800/30">
                                <p className="text-[9px] text-red-400 font-medium leading-tight">بيانات<br/>ناقصة</p>
                              </div>
                            )}
                            <button
                              onClick={() => setPairDetail(pair)}
                              className="text-[10px] text-indigo-400 hover:text-indigo-300 hover:bg-indigo-900/30 px-2 py-1.5 rounded-lg transition-colors border border-indigo-800/30 hover:border-indigo-700/50"
                            >📊 تفاصيل</button>
                          </div>
                        </div>
                        {/* Pair names */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-800/60 rounded-xl px-3 py-2 text-right">
                            <div className="flex items-center gap-1.5 justify-end">
                              <span className="text-sm font-semibold text-white truncate">{pair.aName}</span>
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${pair.aGender === 'female' ? 'bg-pink-400' : 'bg-blue-400'}`} />
                            </div>
                            {pair.rankBInA != null && <p className="text-[10px] text-gray-600 mt-0.5 text-right">رتّب الآخر #{pair.rankBInA}</p>}
                          </div>
                          <span className="text-gray-600 flex-shrink-0 text-lg">⇄</span>
                          <div className="flex-1 bg-gray-800/60 rounded-xl px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${pair.bGender === 'female' ? 'bg-pink-400' : 'bg-blue-400'}`} />
                              <span className="text-sm font-semibold text-white truncate">{pair.bName}</span>
                            </div>
                            {pair.rankAInB != null && <p className="text-[10px] text-gray-600 mt-0.5">رتّب الآخر #{pair.rankAInB}</p>}
                          </div>
                        </div>
                        {/* Move table */}
                        <div className="mt-2.5 flex items-center gap-2">
                          <span className="text-[10px] text-gray-600">تعديل الطاولة:</span>
                          <input
                            type="number" min={1} max={99}
                            defaultValue={pair.table || ''}
                            onBlur={e => {
                              const v = parseInt(e.target.value)
                              if (!isNaN(v) && v !== pair.table) {
                                run(`move-pair-${pair.a}`, () => Promise.all([
                                  api("e3-move-table", { participant_number: pair.a, round: 20, new_table: v }),
                                  api("e3-move-table", { participant_number: pair.b, round: 20, new_table: v }),
                                ]).then(() => { fetchMatches(); return { message: `Pair moved to table ${v}` } }))
                              }
                            }}
                            className="w-16 bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-2 py-1 text-center focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.keys(seating?.[mapRound] || {}).map(Number).sort((a, b) => a - b).map(table => {
                    const members: any[] = seating?.[mapRound]?.[table] || []
                    const males = members.filter(m => m.gender !== 'female').length
                    const females = members.filter(m => m.gender === 'female').length
                    const balanced = Math.abs(males - females) <= 1
                    const hasSwapMember = swapA !== null && members.some(m => m.number === swapA)
                    return (
                      <div key={table} className={`bg-gray-900 rounded-2xl p-4 border transition-all duration-200 ${
                        hasSwapMember ? 'border-amber-600/70 shadow-lg shadow-amber-900/20' :
                        swapA !== null ? 'border-blue-800/50 hover:border-blue-600/60' :
                        'border-gray-800 hover:border-gray-700'
                      }`}>
                        {/* Table header */}
                        <div className="flex items-center justify-between mb-3.5">
                          <div className="flex items-center gap-2.5">
                            {editingTableCard?.round === mapRound && editingTableCard?.table === table ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  autoFocus
                                  type="number" min={1} max={99}
                                  value={editingTableCard.value}
                                  onChange={e => setEditingTableCard({ ...editingTableCard, value: e.target.value })}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') { const v = parseInt(editingTableCard.value); if (!isNaN(v) && v > 0) renameTable(mapRound as number, table, v) }
                                    if (e.key === 'Escape') setEditingTableCard(null)
                                  }}
                                  className="w-14 h-9 bg-gray-700 border border-indigo-500 text-indigo-200 font-black text-base rounded-xl px-2 text-center focus:outline-none"
                                />
                                <button onClick={() => { const v = parseInt(editingTableCard.value); if (!isNaN(v) && v > 0) renameTable(mapRound as number, table, v) }}
                                  className="text-xs text-green-400 bg-green-900/30 hover:bg-green-900/50 px-2 py-1.5 rounded-lg font-bold transition-colors">✓</button>
                                <button onClick={() => setEditingTableCard(null)}
                                  className="text-xs text-gray-500 hover:text-gray-300 px-1.5 py-1.5 rounded-lg transition-colors">✕</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setEditingTableCard({ round: mapRound as number, table, value: String(table) })}
                                className="w-10 h-10 rounded-xl bg-indigo-900/40 hover:bg-indigo-800/60 border border-indigo-800/50 hover:border-indigo-600/60 flex items-center justify-center flex-shrink-0 transition-all group"
                                title="اضغط لتغيير رقم الطاولة"
                              >
                                <span className="text-indigo-300 font-black text-lg leading-none group-hover:hidden">{table}</span>
                                <span className="text-indigo-400 text-sm leading-none hidden group-hover:block">✏</span>
                              </button>
                            )}
                            <div>
                              <p className="text-sm font-semibold text-gray-200 leading-tight">طاولة {table}</p>
                              <p className="text-[10px] text-gray-600">{members.length} مشارك</p>
                            </div>
                          </div>
                          <span className={`flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-lg border ${
                            balanced ? 'bg-green-900/20 border-green-800/30 text-green-400' : 'bg-red-900/20 border-red-800/30 text-red-400'
                          }`}>
                            <span className="text-blue-400">{males}♂</span>
                            <span className="text-gray-600">·</span>
                            <span className="text-pink-400">{females}♀</span>
                          </span>
                        </div>
                        {/* Members */}
                        <div className="space-y-1.5">
                          {members.map((m: any) => {
                            const rankData = allRankings.find(r => r.number === m.number)
                            const isSwapSrc = swapA === m.number
                            const isViewing = selectedParticipantNum === m.number && participantPanelOpen
                            return (
                              <button key={m.number} onClick={() => handleMemberClick(m)}
                                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-right transition-all ${
                                  isSwapSrc
                                    ? 'bg-amber-900/40 border border-amber-600/50 text-amber-200 shadow-inner'
                                    : isViewing
                                    ? 'bg-purple-900/30 border border-purple-600/40 text-purple-100'
                                    : swapA !== null
                                    ? 'hover:bg-blue-900/20 border border-transparent hover:border-blue-700/40 text-gray-300 cursor-pointer'
                                    : 'hover:bg-gray-800/70 border border-transparent hover:border-gray-700/50 text-gray-300 active:scale-[0.98]'
                                }`}
                              >
                                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${m.gender === 'female' ? 'bg-pink-400' : 'bg-blue-400'}`} />
                                <span className="flex-1 text-sm font-medium truncate text-right">{m.name}</span>
                                <span className="text-[10px] text-gray-600 font-mono flex-shrink-0">#{m.number}</span>
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${rankData?.submitted ? 'bg-green-500' : 'bg-gray-700'}`} title={rankData?.submitted ? 'صوّت' : 'لم يصوّت'} />
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* Legend */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 border-t border-gray-800/60">
                  <p className="text-[10px] text-gray-600 font-semibold">المفتاح:</p>
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-600"><span className="w-2 h-2 rounded-full bg-green-500" /> صوّت</div>
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-600"><span className="w-2 h-2 rounded-full bg-gray-700" /> لم يصوّت</div>
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-600"><span className="w-2.5 h-2.5 rounded-full bg-blue-400" /> ذكر</div>
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-600"><span className="w-2.5 h-2.5 rounded-full bg-pink-400" /> أنثى</div>
                  <p className="text-[10px] text-gray-700">· اضغط على اسم لعرض التفاصيل · اضغط مرتين (مشارك ثم آخر) للتبديل</p>
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB: PARTICIPANTS ───────────────────────────────────────────────── */}
        {activeTab === "participants" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-300">نظرة شاملة على المشاركين</h3>
                <p className="text-xs text-gray-600 mt-0.5">{participants.filter(p => p.selected).length} مشارك مختار · اضغط لعرض التفاصيل</p>
              </div>
              <button onClick={() => { fetchParticipants(); fetchSeating(); fetchRankStatus(); fetchMatches() }} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400">
                <RefreshCw size={14} />
              </button>
            </div>

            {participants.filter(p => p.selected).length === 0 ? (
              <div className="text-center py-12 text-gray-600">
                <Users size={32} className="mx-auto mb-3 opacity-30" />
                <p>لم يُختَر مشاركون بعد</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {participants.filter(p => p.selected).sort((a, b) => a.number - b.number).map(p => {
                  const tables = getParticipantTables(p.number)
                  const rankData = allRankings.find(r => r.number === p.number)
                  return (
                    <button key={p.number}
                      onClick={() => { setSelectedParticipantNum(p.number); setParticipantPanelOpen(true) }}
                      className="bg-gray-900 border border-gray-800 hover:border-purple-700/50 rounded-xl p-4 text-right transition-all hover:shadow-lg hover:shadow-purple-900/10 active:scale-[0.99] group"
                    >
                      <div className="flex items-center gap-3 mb-2.5">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-base flex-shrink-0 ${
                          p.gender === 'female' ? 'bg-pink-900/40 border border-pink-800/40 text-pink-300' : 'bg-blue-900/40 border border-blue-800/40 text-blue-300'
                        }`}>
                          {(p.name || '?').charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-white text-sm">{p.name}</span>
                            <span className="text-[10px] text-gray-600 font-mono">#{p.number}</span>
                            {p.age && <span className="text-[10px] text-gray-600">· {p.age}</span>}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {p.mbti_personality_type && <span className="text-[10px] text-purple-400">{p.mbti_personality_type}</span>}
                            {p.communication_style && <span className="text-[10px] text-blue-400 opacity-70">{p.communication_style}</span>}
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          {rankData?.submitted
                            ? <span className="text-[10px] bg-green-900/30 text-green-400 px-2 py-0.5 rounded-full border border-green-800/30">✓ صوّت</span>
                            : <span className="text-[10px] text-gray-700">—</span>
                          }
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {([1, 2] as const).map(r => tables[r] ? (
                          <span key={r} className={`text-[10px] px-2 py-0.5 rounded-lg border ${
                            r === 1 ? 'bg-blue-900/20 border-blue-800/30 text-blue-400' : 'bg-indigo-900/20 border-indigo-800/30 text-indigo-400'
                          }`}>
                            ج{r}: طاولة {tables[r]}
                          </span>
                        ) : null)}
                        {!tables[1] && !tables[2] && (
                          <span className="text-[10px] text-gray-700">بدون طاولة محددة</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
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
                        <div className="px-4 pb-3 border-t border-gray-800/60 pt-2 space-y-2">
                          {editingRanker === r.number ? (
                            <>
                              <p className="text-amber-400 text-xs mb-1">اسحب أو استخدم الأسهم لإعادة الترتيب</p>
                              {editedOrder.map((item: any, idx: number) => {
                                const theyRankedMe = allRankings.find((x: any) => x.number === item.number)?.ranked_list?.find((y: any) => y.number === r.number)
                                return (
                                  <div key={item.number} className="flex items-center gap-2 text-xs bg-gray-800/60 rounded-lg px-2 py-1.5">
                                    <span className="w-5 h-5 rounded-md bg-amber-900/60 text-amber-300 flex items-center justify-center font-bold flex-shrink-0">{idx + 1}</span>
                                    <span className="text-gray-200 flex-1">{item.name} <span className="text-gray-600">#{item.number}</span></span>
                                    {theyRankedMe && <span className="text-purple-400 text-[10px]">رتّبك #{theyRankedMe.rank}</span>}
                                    <div className="flex gap-1">
                                      <button onClick={() => setEditedOrder(o => { const a=[...o]; if(idx>0){[a[idx-1],a[idx]]=[a[idx],a[idx-1]]}; return a })} disabled={idx===0} className="p-0.5 rounded hover:bg-gray-700 disabled:opacity-30">▲</button>
                                      <button onClick={() => setEditedOrder(o => { const a=[...o]; if(idx<a.length-1){[a[idx],a[idx+1]]=[a[idx+1],a[idx]]}; return a })} disabled={idx===editedOrder.length-1} className="p-0.5 rounded hover:bg-gray-700 disabled:opacity-30">▼</button>
                                    </div>
                                  </div>
                                )
                              })}
                              <div className="flex gap-2 pt-1">
                                <button onClick={() => saveRanking(r.number)} disabled={!!loading} className="flex-1 py-1.5 rounded-lg bg-emerald-700/60 hover:bg-emerald-700 text-emerald-200 text-xs font-medium">{loading===`save-rank-${r.number}` ? '...' : 'حفظ التغييرات'}</button>
                                <button onClick={() => setEditingRanker(null)} className="px-3 py-1.5 rounded-lg bg-gray-700 text-gray-400 text-xs">إلغاء</button>
                              </div>
                            </>
                          ) : (
                            <>
                              {r.ranked_list.map((item: any, idx: number) => {
                                const theyRankedMe = allRankings.find((x: any) => x.number === item.number)?.ranked_list?.find((y: any) => y.number === r.number)
                                const mutual = theyRankedMe && theyRankedMe.rank <= 3 && idx < 3
                                return (
                                  <div key={item.number} className={`flex items-center gap-2 text-xs rounded-lg px-2 py-1 ${mutual ? 'bg-emerald-900/25 border border-emerald-800/40' : ''}`}>
                                    <span className="w-5 h-5 rounded-md bg-gray-800 text-gray-500 flex items-center justify-center font-bold flex-shrink-0">{idx + 1}</span>
                                    <span className="text-gray-300 flex-1">{item.name} <span className="text-gray-600">#{item.number}</span></span>
                                    {theyRankedMe ? (
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${mutual ? 'bg-emerald-800/50 text-emerald-300' : 'text-gray-500'}`}>
                                        {mutual ? '🔁 تبادل' : `رتّبك #${theyRankedMe.rank}`}
                                      </span>
                                    ) : <span className="text-gray-700 text-[10px]">لم يرتّبك</span>}
                                  </div>
                                )
                              })}
                              <button onClick={() => { setEditingRanker(r.number); setEditedOrder([...r.ranked_list]) }} className="mt-1 w-full py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs">✏️ تعديل الترتيب</button>
                            </>
                          )}
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
                  <div className="flex items-center gap-3">
                    <p className="text-gray-500 text-xs">{matchPairs.length} زوج</p>
                    <p className="text-gray-600 text-xs">·</p>
                    <p className="text-emerald-600 text-xs">{matchPairs.filter((p: any) => p.matchType === 'mutual').length} تبادل متبادل</p>
                    {matchPairs.some((p: any) => p.matchType === 'fallback') && (
                      <p className="text-amber-600 text-xs">{matchPairs.filter((p: any) => p.matchType === 'fallback').length} احتياطي</p>
                    )}
                  </div>
                  {matchPairs.map((pair: any, idx: number) => (
                    <div key={idx} className={`border rounded-xl overflow-hidden ${
                      pair.matchType === 'mutual' ? 'border-emerald-800/50 bg-emerald-950/10' : 'border-amber-800/40 bg-amber-950/10'
                    }`}>
                      {/* Header row */}
                      <button
                        onClick={() => setExpandedPair(expandedPair === idx ? null : idx)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/5 transition-colors text-right"
                      >
                        <span className="text-gray-600 text-[10px] font-mono w-4 flex-shrink-0">{idx + 1}</span>
                        <div className="flex-1 flex items-center gap-1.5 min-w-0">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${pair.aGender === 'female' ? 'bg-pink-400' : 'bg-blue-400'}`} />
                          <span className="text-sm font-semibold text-white truncate">{pair.aName}</span>
                          {pair.rankBInA != null && (
                            <span className="text-[10px] text-gray-500 flex-shrink-0">رتّبه #{pair.rankBInA}</span>
                          )}
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 ${
                          pair.matchType === 'mutual'
                            ? 'bg-emerald-900/60 text-emerald-300'
                            : 'bg-amber-900/50 text-amber-400'
                        }`}>
                          {pair.matchType === 'mutual' ? '🔁 تبادل' : '⚡ احتياطي'}
                        </span>
                        <div className="flex-1 flex items-center gap-1.5 min-w-0 justify-end">
                          {pair.rankAInB != null && (
                            <span className="text-[10px] text-gray-500 flex-shrink-0">رتّبه #{pair.rankAInB}</span>
                          )}
                          <span className="text-sm font-semibold text-white truncate">{pair.bName}</span>
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${pair.bGender === 'female' ? 'bg-pink-400' : 'bg-blue-400'}`} />
                        </div>
                        <ChevronRight size={12} className={`text-gray-600 flex-shrink-0 transition-transform ${expandedPair === idx ? 'rotate-90' : ''}`} />
                      </button>

                      {/* Flow detail */}
                      {expandedPair === idx && (
                        <div className="border-t border-gray-800/40 px-3 py-3 space-y-3 bg-gray-950/50">
                          {/* Person A flow */}
                          {(pair.skippedByA?.length > 0 || pair.rankBInA != null) && (
                            <div className="space-y-1">
                              <p className="text-[10px] text-gray-500 font-semibold mb-1.5">مسار {pair.aName}</p>
                              {(pair.skippedByA || []).map((s: any) => (
                                <div key={s.number} className="flex items-center gap-2 text-[11px]">
                                  <span className="w-5 h-5 rounded-md bg-red-950/60 text-red-400 flex items-center justify-center font-bold text-[10px] flex-shrink-0">#{s.rank}</span>
                                  <span className="text-gray-300 flex-1 truncate">{s.name}</span>
                                  <span className="text-red-400/80 flex-shrink-0 text-[10px]">✗ {s.reason}</span>
                                </div>
                              ))}
                              {pair.rankBInA != null && (
                                <div className="flex items-center gap-2 text-[11px]">
                                  <span className="w-5 h-5 rounded-md bg-emerald-950/60 text-emerald-400 flex items-center justify-center font-bold text-[10px] flex-shrink-0">#{pair.rankBInA}</span>
                                  <span className="text-emerald-300 flex-1 truncate">{pair.bName}</span>
                                  <span className="text-emerald-400/80 flex-shrink-0 text-[10px]">✓ {pair.matchType === 'mutual' ? 'تبادل متبادل' : 'تعيين احتياطي'}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Divider if both flows shown */}
                          {(pair.skippedByA?.length > 0 || pair.rankBInA != null) && (pair.skippedByB?.length > 0 || pair.rankAInB != null) && (
                            <div className="border-t border-gray-800/30" />
                          )}

                          {/* Person B flow */}
                          {(pair.skippedByB?.length > 0 || pair.rankAInB != null) && (
                            <div className="space-y-1">
                              <p className="text-[10px] text-gray-500 font-semibold mb-1.5">مسار {pair.bName}</p>
                              {(pair.skippedByB || []).map((s: any) => (
                                <div key={s.number} className="flex items-center gap-2 text-[11px]">
                                  <span className="w-5 h-5 rounded-md bg-red-950/60 text-red-400 flex items-center justify-center font-bold text-[10px] flex-shrink-0">#{s.rank}</span>
                                  <span className="text-gray-300 flex-1 truncate">{s.name}</span>
                                  <span className="text-red-400/80 flex-shrink-0 text-[10px]">✗ {s.reason}</span>
                                </div>
                              ))}
                              {pair.rankAInB != null && (
                                <div className="flex items-center gap-2 text-[11px]">
                                  <span className="w-5 h-5 rounded-md bg-emerald-950/60 text-emerald-400 flex items-center justify-center font-bold text-[10px] flex-shrink-0">#{pair.rankAInB}</span>
                                  <span className="text-emerald-300 flex-1 truncate">{pair.aName}</span>
                                  <span className="text-emerald-400/80 flex-shrink-0 text-[10px]">✓ {pair.matchType === 'mutual' ? 'تبادل متبادل' : 'تعيين احتياطي'}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Fallback / no-rank explanation */}
                          {pair.matchType === 'fallback' && pair.rankBInA == null && pair.rankAInB == null && (
                            <p className="text-amber-500/70 text-[10px] text-center py-1">⚡ لم يرتّب أيٌّ منهما الآخر — تم التعيين الاحتياطي بعد انتهاء المطابقة المتبادلة</p>
                          )}
                          {pair.matchType === 'fallback' && (pair.rankBInA != null || pair.rankAInB != null) && !pair.rankBInA && (
                            <p className="text-amber-500/70 text-[10px] text-center py-1">⚡ {pair.aName} لم يُدرج {pair.bName} في قائمته — تعيين من جانب واحد</p>
                          )}
                          {pair.matchType === 'fallback' && (pair.rankBInA != null || pair.rankAInB != null) && !pair.rankAInB && pair.rankBInA != null && (
                            <p className="text-amber-500/70 text-[10px] text-center py-1">⚡ {pair.bName} لم يُدرج {pair.aName} في قائمته — تعيين من جانب واحد</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* ── Participant Detail Panel ─────────────────────────────────────── */}
      {participantPanelOpen && selectedParticipantNum !== null && (() => {
        const p = participants.find(x => x.number === selectedParticipantNum)
        const rankData = allRankings.find(r => r.number === selectedParticipantNum)
        const tables = getParticipantTables(selectedParticipantNum)
        if (!p) return null
        return (
          <>
            <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setParticipantPanelOpen(false)} />
            <div className="fixed top-0 left-0 h-full w-80 bg-gray-900 border-r border-gray-800 z-50 overflow-y-auto shadow-2xl flex flex-col" dir="rtl">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/95 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-xl flex-shrink-0 ${
                    p.gender === 'female' ? 'bg-pink-900/50 border border-pink-700/50 text-pink-300' : 'bg-blue-900/50 border border-blue-700/50 text-blue-300'
                  }`}>
                    {(p.name || '?').charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base leading-tight">{p.name}</h3>
                    <p className="text-[11px] text-gray-500">#{p.number} · {p.gender === 'female' ? 'أنثى' : 'ذكر'}{p.age ? ` · ${p.age} سنة` : ''}</p>
                  </div>
                </div>
                <button onClick={() => setParticipantPanelOpen(false)} className="p-2 rounded-xl hover:bg-gray-800 text-gray-500 hover:text-white transition-colors flex-shrink-0">✕</button>
              </div>

              <div className="p-4 space-y-4 flex-1">
                {/* Profile tags */}
                {(p.mbti_personality_type || p.communication_style || p.attachment_style) && (
                  <div className="flex flex-wrap gap-2">
                    {p.mbti_personality_type && (
                      <span className="bg-purple-900/40 border border-purple-700/40 text-purple-300 text-xs px-2.5 py-1 rounded-lg font-medium">{p.mbti_personality_type}</span>
                    )}
                    {p.communication_style && (
                      <span className="bg-blue-900/40 border border-blue-700/40 text-blue-300 text-xs px-2.5 py-1 rounded-lg">{p.communication_style}</span>
                    )}
                    {p.attachment_style && (
                      <span className="bg-teal-900/40 border border-teal-700/40 text-teal-300 text-xs px-2.5 py-1 rounded-lg">{p.attachment_style}</span>
                    )}
                  </div>
                )}

                {/* Table assignments */}
                <div className="bg-gray-800/50 rounded-xl p-3.5 space-y-2.5">
                  <h4 className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                    <Table2 size={11} /> توزيع الطاولات
                  </h4>
                  {([1, 2] as const).map(r => {
                    const isEditingThis = editingTable?.num === p.number && editingTable?.round === r
                    return (
                      <div key={r} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-400 flex-shrink-0">الجولة {r === 1 ? 'الأولى' : 'الثانية'}</span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {isEditingThis ? (
                            <>
                              <input
                                autoFocus
                                type="number" min={1} max={99}
                                value={editingTable.value}
                                onChange={e => setEditingTable({ ...editingTable, value: e.target.value })}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') { const v = parseInt(editingTable.value); if (!isNaN(v) && v > 0) moveTable(p.number, r, v) }
                                  if (e.key === 'Escape') setEditingTable(null)
                                }}
                                className="w-14 bg-gray-700 border border-indigo-500 text-white text-xs rounded-lg px-2 py-1 text-center focus:outline-none"
                              />
                              <button
                                onClick={() => { const v = parseInt(editingTable.value); if (!isNaN(v) && v > 0) moveTable(p.number, r, v) }}
                                className="text-[10px] text-green-400 hover:text-green-300 bg-green-900/30 hover:bg-green-900/50 px-2 py-1 rounded-lg transition-colors font-bold"
                              >✓</button>
                              <button onClick={() => setEditingTable(null)} className="text-[10px] text-gray-500 hover:text-gray-300 px-1.5 py-1 rounded-lg transition-colors">✕</button>
                            </>
                          ) : (
                            <>
                              {tables[r] ? (
                                <button
                                  onClick={() => setEditingTable({ num: p.number, round: r, value: String(tables[r]) })}
                                  className="text-xs font-bold text-indigo-300 bg-indigo-900/30 hover:bg-indigo-900/60 px-2.5 py-1 rounded-lg border border-indigo-800/40 hover:border-indigo-600/60 transition-all"
                                  title="اضغط لتعديل رقم الطاولة"
                                >
                                  طاولة {tables[r]} ✏
                                </button>
                              ) : (
                                <button
                                  onClick={() => setEditingTable({ num: p.number, round: r, value: '' })}
                                  className="text-xs text-gray-600 hover:text-gray-400 hover:bg-gray-800 px-2 py-1 rounded-lg transition-colors"
                                >
                                  + تعيين طاولة
                                </button>
                              )}
                              {tables[r] && (
                                <button
                                  onClick={() => { setParticipantPanelOpen(false); setSwapA(p.number); setActiveTab("seating"); setMapRound(r) }}
                                  className="text-[10px] text-amber-500 hover:text-amber-300 hover:bg-amber-900/30 px-1.5 py-1 rounded-lg transition-colors"
                                  title="تبديل مع شخص آخر"
                                >⇄</button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Ranking */}
                <div className="bg-gray-800/50 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                      <BarChart3 size={11} /> التصنيف
                    </h4>
                    {rankData?.submitted
                      ? <span className="text-[10px] bg-green-900/30 text-green-400 px-2 py-0.5 rounded-full border border-green-800/30">✓ صوّت</span>
                      : <span className="text-[10px] text-gray-700 bg-gray-800 px-2 py-0.5 rounded-full">لم يصوّت بعد</span>
                    }
                  </div>
                  {rankData?.submitted && rankData.ranked_list?.length > 0 ? (
                    <div className="space-y-1.5 pt-1">
                      {rankData.ranked_list.slice(0, 6).map((item: any) => {
                        const theyRankedBack = allRankings.find((x: any) => x.number === item.number)?.ranked_list?.find((y: any) => y.number === p.number)
                        return (
                          <div key={item.number} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg ${theyRankedBack ? 'bg-emerald-900/20 border border-emerald-800/30' : ''}`}>
                            <span className="w-5 h-5 rounded-lg bg-gray-700 text-gray-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0">{item.rank}</span>
                            <span className="text-gray-300 flex-1 truncate">{item.name}</span>
                            <span className="text-gray-600 text-[10px] flex-shrink-0">#{item.number}</span>
                            {theyRankedBack && (
                              <span className="text-emerald-400 text-[10px] flex-shrink-0">🔁 #{theyRankedBack.rank}</span>
                            )}
                          </div>
                        )
                      })}
                      {rankData.ranked_list.length > 6 && (
                        <p className="text-[10px] text-gray-600 text-center pt-0.5">+{rankData.ranked_list.length - 6} آخرون</p>
                      )}
                    </div>
                  ) : null}
                </div>

                {/* Actions */}
                <div className="pt-1">
                  <button
                    onClick={() => { setParticipantPanelOpen(false); setSwapA(p.number); setActiveTab("seating") }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-900/30 hover:bg-amber-900/50 border border-amber-700/40 text-amber-300 text-sm font-medium transition-all active:scale-[0.98]"
                  >
                    <Shuffle size={14} /> تبديل مكانه في الطاولات
                  </button>
                </div>
              </div>
            </div>
          </>
        )
      })()}

      {/* TAB: OVERVIEW ─────────────────────────────────────────── */}
      {activeTab === "overview" && (() => {
        const scoreColor = (score: number | null, bothComplete: boolean) => {
          if (!bothComplete || score == null) return { bg: 'rgba(31,41,55,0.8)', text: '#4b5563' }
          if (score >= 80) return { bg: 'rgba(16,185,129,0.22)', text: '#34d399' }
          if (score >= 68) return { bg: 'rgba(59,130,246,0.18)', text: '#60a5fa' }
          if (score >= 54) return { bg: 'rgba(139,92,246,0.15)', text: '#a78bfa' }
          if (score >= 40) return { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24' }
          return { bg: 'rgba(239,68,68,0.13)', text: '#f87171' }
        }
        const mbtiColor = (m: string) => {
          if (!m) return 'text-gray-600 bg-gray-800'
          const type = m.toUpperCase()
          if (['INFJ','INFP','ENFJ','ENFP'].includes(type)) return 'text-violet-300 bg-violet-950/60 border border-violet-800/40'
          if (['INTJ','INTP','ENTJ','ENTP'].includes(type)) return 'text-blue-300 bg-blue-950/60 border border-blue-800/40'
          if (['ISFJ','ISFP','ESFJ','ESFP'].includes(type)) return 'text-pink-300 bg-pink-950/60 border border-pink-800/40'
          return 'text-teal-300 bg-teal-950/60 border border-teal-800/40'
        }
        const attachColor = (a: string) => {
          if (!a) return 'text-gray-600'
          if (a === 'Secure') return 'text-green-400'
          if (a === 'Anxious') return 'text-yellow-400'
          if (a === 'Avoidant') return 'text-red-400'
          return 'text-gray-400'
        }
        const pts: any[] = overviewData?.participants || []
        const matrix: Record<string, { score: number | null; bothComplete: boolean }> = overviewData?.matrix || {}
        const sortedPts = [...pts].sort((a, b) => a.number - b.number)
        const males = sortedPts.filter(p => p.gender === 'male')
        const females = sortedPts.filter(p => p.gender === 'female')
        const getScore = (a: number, b: number) => {
          const key = a < b ? `${a}-${b}` : `${b}-${a}`
          return matrix[key] || null
        }
        if (overviewLoading) return (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 size={36} className="text-purple-400 animate-spin" />
            <p className="text-gray-400 text-sm">جاري حساب التوافق لجميع الأزواج…</p>
            <p className="text-gray-600 text-xs">قد يستغرق هذا دقيقة</p>
          </div>
        )
        if (!overviewData) return (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Layers size={36} className="text-gray-700" />
            <p className="text-gray-500">لا توجد بيانات. حدّث الصفحة.</p>
            <button onClick={fetchOverview} className="text-sm text-purple-400 hover:text-purple-300 bg-purple-900/20 px-4 py-2 rounded-xl border border-purple-800/30">تحديث</button>
          </div>
        )
        return (
          <div className="space-y-6 pb-8">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">نظرة شاملة</h2>
                <p className="text-xs text-gray-500 mt-0.5">{pts.length} مشارك · {Object.keys(matrix).length} زوج محسوب</p>
              </div>
              <button onClick={fetchOverview} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg border border-gray-700 transition-colors">
                <RefreshCw size={12} /> تحديث
              </button>
            </div>

            {/* ── SECTION 1: Participant Cards ─────────────────────── */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Users size={12} /> بيانات المشاركين
              </h3>
              {/* Males */}
              {males.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] text-blue-500 font-semibold mb-2 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />ذكور ({males.length})</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {males.map((p: any) => (
                      <div key={p.number} className={`rounded-xl p-3 border bg-blue-950/10 border-blue-900/30 relative overflow-hidden`}>
                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-600/0 via-blue-500/60 to-blue-600/0" />
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-semibold text-sm truncate">{p.name}</p>
                            <p className="text-gray-600 text-[10px]">#{p.number}{p.age ? ` · ${p.age}` : ''}</p>
                          </div>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${p.complete ? 'bg-green-900/40 text-green-400 border border-green-800/40' : 'bg-red-900/30 text-red-400 border border-red-800/30'}`}>
                            {p.complete ? '✓ مكتمل' : '⚠ ناقص'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {p.mbti && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${mbtiColor(p.mbti)}`}>{p.mbti}</span>}
                          {p.attachment && <span className={`text-[9px] px-1.5 py-0.5 rounded-full bg-gray-800 ${attachColor(p.attachment)}`}>{p.attachment}</span>}
                          {p.humor && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400">{p.humor === 'A' ? '😄 مرح' : p.humor === 'B' ? '🤗 دافئ' : p.humor === 'C' ? '🧘 هادئ' : '🎩 جدي'}</span>}
                        </div>
                        <div className="grid grid-cols-3 gap-1 mb-2 text-center">
                          {[1, 2, 20].map(r => (
                            <div key={r} className="bg-gray-800/60 rounded-lg px-1 py-1">
                              <p className="text-[8px] text-gray-600">{r === 20 ? '1:1' : `ج${r}`}</p>
                              <p className="text-[11px] font-bold text-gray-300">{(r === 1 ? p.r1Table : r === 2 ? p.r2Table : p.r20Table) ?? '—'}</p>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between text-[9px]">
                          <span className={`flex items-center gap-1 ${p.rankingSubmitted ? 'text-emerald-400' : 'text-gray-600'}`}>
                            {p.rankingSubmitted ? `✓ صوّت (${p.rankingCount})` : '○ لم يصوّت'}
                          </span>
                          {p.matchPartner ? (
                            <div className="text-right">
                              <span className="text-gray-500">مع: </span>
                              <span className="text-white font-medium">{p.matchPartnerName || `#${p.matchPartner}`}</span>
                              {p.matchCompatScore != null && <span className={`mr-1 font-bold ${p.matchCompatScore >= 68 ? 'text-green-400' : p.matchCompatScore >= 54 ? 'text-blue-400' : 'text-yellow-400'}`}>{p.matchCompatScore}%</span>}
                            </div>
                          ) : <span className="text-gray-700">لا مطابقة</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Females */}
              {females.length > 0 && (
                <div>
                  <p className="text-[10px] text-pink-500 font-semibold mb-2 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-pink-400 inline-block" />إناث ({females.length})</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {females.map((p: any) => (
                      <div key={p.number} className={`rounded-xl p-3 border bg-pink-950/10 border-pink-900/30 relative overflow-hidden`}>
                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-pink-600/0 via-pink-500/60 to-pink-600/0" />
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-semibold text-sm truncate">{p.name}</p>
                            <p className="text-gray-600 text-[10px]">#{p.number}{p.age ? ` · ${p.age}` : ''}</p>
                          </div>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${p.complete ? 'bg-green-900/40 text-green-400 border border-green-800/40' : 'bg-red-900/30 text-red-400 border border-red-800/30'}`}>
                            {p.complete ? '✓ مكتمل' : '⚠ ناقص'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {p.mbti && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${mbtiColor(p.mbti)}`}>{p.mbti}</span>}
                          {p.attachment && <span className={`text-[9px] px-1.5 py-0.5 rounded-full bg-gray-800 ${attachColor(p.attachment)}`}>{p.attachment}</span>}
                          {p.humor && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400">{p.humor === 'A' ? '😄 مرح' : p.humor === 'B' ? '🤗 دافئ' : p.humor === 'C' ? '🧘 هادئ' : '🎩 جدي'}</span>}
                        </div>
                        <div className="grid grid-cols-3 gap-1 mb-2 text-center">
                          {[1, 2, 20].map(r => (
                            <div key={r} className="bg-gray-800/60 rounded-lg px-1 py-1">
                              <p className="text-[8px] text-gray-600">{r === 20 ? '1:1' : `ج${r}`}</p>
                              <p className="text-[11px] font-bold text-gray-300">{(r === 1 ? p.r1Table : r === 2 ? p.r2Table : p.r20Table) ?? '—'}</p>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between text-[9px]">
                          <span className={`flex items-center gap-1 ${p.rankingSubmitted ? 'text-emerald-400' : 'text-gray-600'}`}>
                            {p.rankingSubmitted ? `✓ صوّت (${p.rankingCount})` : '○ لم يصوّت'}
                          </span>
                          {p.matchPartner ? (
                            <div className="text-right">
                              <span className="text-gray-500">مع: </span>
                              <span className="text-white font-medium">{p.matchPartnerName || `#${p.matchPartner}`}</span>
                              {p.matchCompatScore != null && <span className={`mr-1 font-bold ${p.matchCompatScore >= 68 ? 'text-green-400' : p.matchCompatScore >= 54 ? 'text-blue-400' : 'text-yellow-400'}`}>{p.matchCompatScore}%</span>}
                            </div>
                          ) : <span className="text-gray-700">لا مطابقة</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── SECTION 2: Activity Flow Table ───────────────────── */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <BarChart3 size={12} /> تدفق النشاط
              </h3>
              <div className="bg-gray-900/60 rounded-2xl border border-gray-800 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-800/60 border-b border-gray-700/50">
                      <th className="text-right px-3 py-2.5 text-gray-400 font-semibold">المشارك</th>
                      <th className="text-center px-2 py-2.5 text-gray-400 font-semibold">ج1</th>
                      <th className="text-center px-2 py-2.5 text-gray-400 font-semibold">ج2</th>
                      <th className="text-center px-2 py-2.5 text-gray-400 font-semibold">التصويت</th>
                      <th className="text-center px-2 py-2.5 text-gray-400 font-semibold">المطابقة النهائية</th>
                      <th className="text-center px-2 py-2.5 text-gray-400 font-semibold">التوافق</th>
                      <th className="text-center px-2 py-2.5 text-gray-400 font-semibold">الاستبيان</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPts.map((p: any, i: number) => (
                      <tr key={p.number} className={`border-b border-gray-800/40 ${i % 2 === 0 ? '' : 'bg-gray-900/30'} hover:bg-gray-800/20 transition-colors`}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.gender === 'female' ? 'bg-pink-400' : 'bg-blue-400'}`} />
                            <span className="text-white font-medium truncate max-w-[80px]">{p.name}</span>
                            <span className="text-gray-700">#{p.number}</span>
                          </div>
                        </td>
                        <td className="text-center px-2 py-2">
                          {p.r1Table != null ? <span className="text-indigo-300 font-bold">{p.r1Table}</span> : <span className="text-gray-700">—</span>}
                        </td>
                        <td className="text-center px-2 py-2">
                          {p.r2Table != null ? <span className="text-indigo-300 font-bold">{p.r2Table}</span> : <span className="text-gray-700">—</span>}
                        </td>
                        <td className="text-center px-2 py-2">
                          {p.rankingSubmitted
                            ? <span className="text-emerald-400 font-semibold">✓ {p.rankingCount}</span>
                            : <span className="text-gray-700">—</span>}
                        </td>
                        <td className="text-center px-2 py-2">
                          {p.matchPartner
                            ? <span className="text-white">{p.matchPartnerName || `#${p.matchPartner}`}</span>
                            : <span className="text-gray-700">—</span>}
                        </td>
                        <td className="text-center px-2 py-2">
                          {p.matchCompatScore != null
                            ? <span className={`font-bold ${p.matchCompatScore >= 68 ? 'text-green-400' : p.matchCompatScore >= 54 ? 'text-blue-400' : 'text-yellow-400'}`}>{p.matchCompatScore}%</span>
                            : <span className="text-gray-700">—</span>}
                        </td>
                        <td className="text-center px-2 py-2">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${p.complete ? 'text-green-400 bg-green-900/30' : 'text-red-400 bg-red-900/20'}`}>
                            {p.complete ? '✓' : '✗'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── SECTION 3: Compatibility Matrix ──────────────────── */}
            {sortedPts.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-2">
                  <Heart size={12} /> مصفوفة التوافق
                </h3>
                <p className="text-[10px] text-gray-600 mb-3">الصفوف = ذكور · الأعمدة = إناث · بدون AI (مع الكاش)</p>
                <div className="bg-gray-900/60 rounded-2xl border border-gray-800 overflow-auto">
                  {males.length > 0 && females.length > 0 ? (
                    <table className="text-[10px] w-full">
                      <thead>
                        <tr className="border-b border-gray-800">
                          <th className="bg-gray-800/70 px-2 py-2 text-gray-500 font-semibold sticky left-0 z-10 text-right min-w-[90px]">ذ \ أ</th>
                          {females.map((f: any) => (
                            <th key={f.number} className="bg-gray-800/70 px-2 py-2 text-pink-400 font-semibold text-center min-w-[52px] whitespace-nowrap">
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="truncate max-w-[44px] text-[9px]">{f.name.split(' ')[0]}</span>
                                <span className="text-gray-600 text-[8px]">#{f.number}</span>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {males.map((m: any, mi: number) => (
                          <tr key={m.number} className="border-b border-gray-800/40">
                            <td className={`sticky left-0 z-10 px-2 py-1.5 font-semibold text-blue-400 whitespace-nowrap ${mi % 2 === 0 ? 'bg-gray-900' : 'bg-gray-900/80'}`}>
                              <div className="flex flex-col gap-0">
                                <span className="text-[9px] truncate max-w-[80px]">{m.name.split(' ')[0]}</span>
                                <span className="text-gray-600 text-[8px]">#{m.number}</span>
                              </div>
                            </td>
                            {females.map((f: any) => {
                              const entry = getScore(m.number, f.number)
                              const { bg, text } = scoreColor(entry?.score ?? null, entry?.bothComplete ?? false)
                              return (
                                <td key={f.number} style={{ background: bg }} className="text-center px-1 py-1.5 transition-all hover:ring-1 hover:ring-white/20">
                                  {entry?.score != null && entry.bothComplete
                                    ? <span style={{ color: text }} className="font-black text-[11px]">{entry.score}</span>
                                    : <span className="text-gray-700 text-[10px]">{entry?.score != null ? entry.score : '?'}</span>
                                  }
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="py-8 text-center text-gray-600 text-sm">يتطلب وجود ذكور وإناث لعرض المصفوفة</div>
                  )}
                </div>
                {/* Legend */}
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span className="text-[9px] text-gray-600">الألوان:</span>
                  {[
                    { bg: 'rgba(16,185,129,0.22)', text: '#34d399', label: '≥80' },
                    { bg: 'rgba(59,130,246,0.18)', text: '#60a5fa', label: '68–79' },
                    { bg: 'rgba(139,92,246,0.15)', text: '#a78bfa', label: '54–67' },
                    { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24', label: '40–53' },
                    { bg: 'rgba(239,68,68,0.13)', text: '#f87171', label: '<40' },
                  ].map(l => (
                    <div key={l.label} className="flex items-center gap-1">
                      <div style={{ background: l.bg }} className="w-5 h-3.5 rounded-sm" />
                      <span style={{ color: l.text }} className="text-[9px] font-bold">{l.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Pair Detail Modal ─────────────────────────────────── */}
      {pairDetail && (() => {
        const pd = pairDetail
        const c = pd.compat || {}
        const getAns = (survey: any, key: string) => {
          const sd = survey && typeof survey === 'string' ? JSON.parse(survey) : (survey || {})
          return (sd?.answers?.[key] ?? sd?.[key] ?? '')?.toString()?.toUpperCase() || '—'
        }
        const sdA = pd.aSurvey && typeof pd.aSurvey === 'string' ? JSON.parse(pd.aSurvey) : (pd.aSurvey || {})
        const sdB = pd.bSurvey && typeof pd.bSurvey === 'string' ? JSON.parse(pd.bSurvey) : (pd.bSurvey || {})
        const ansA = sdA.answers || {}
        const ansB = sdB.answers || {}
        const qRows = [
          { label: 'Q35 الدور في الحديث', a: (ansA.conversational_role||'—').toUpperCase(), b: (ansB.conversational_role||'—').toUpperCase(), tip: 'A=مبادر B=مستجيب C=مستمع' },
          { label: 'Q36 عمق المحادثة', a: (ansA.conversation_depth_pref||'—').toUpperCase(), b: (ansB.conversation_depth_pref||'—').toUpperCase(), tip: 'A=عميق B=سطحي' },
          { label: 'Q37 الطاقة الاجتماعية', a: (ansA.social_battery||'—').toUpperCase(), b: (ansB.social_battery||'—').toUpperCase(), tip: 'A=اجتماعي B=هادئ' },
          { label: 'Q38 أسلوب الفكاهة', a: (ansA.humor_subtype||'—').toUpperCase(), b: (ansB.humor_subtype||'—').toUpperCase(), tip: 'A=سخرية B=دفء C=قصص D=هادئ' },
          { label: 'Q39 أسلوب الفضول', a: (ansA.curiosity_style||'—').toUpperCase(), b: (ansB.curiosity_style||'—').toUpperCase(), tip: 'A=متسائل B=مجيب C=متوازن' },
          { label: 'Q40 الهدف من اللقاء', a: (ansA.intent_goal||'—').toUpperCase(), b: (ansB.intent_goal||'—').toUpperCase(), tip: 'A=توسيع دائرة B=تواصل فكري C=اكتشاف' },
          { label: 'Q41 الراحة مع الصمت', a: (ansA.silence_comfort||'—').toUpperCase(), b: (ansB.silence_comfort||'—').toUpperCase(), tip: 'A=مريح B=غير مريح' },
          { label: 'أسلوب الفكاهة (humor_banter)', a: (pd.compat?.mbtiA ? (ansA.humor_banter_style||'—') : (ansA.humor_banter_style||'—')).toUpperCase(), b: (ansB.humor_banter_style||'—').toUpperCase(), tip: 'A=مرح B=دافئ C=هادئ D=جدي' },
          { label: 'الانفتاح المبكر (0-3)', a: String(ansA.early_openness_comfort ?? '—'), b: String(ansB.early_openness_comfort ?? '—'), tip: '0=مغلق 3=منفتح جداً' },
          { label: 'MBTI', a: c.mbtiA || sdA.mbtiType || ansA.mbti || '—', b: c.mbtiB || sdB.mbtiType || ansB.mbti || '—', tip: '' },
          { label: 'أسلوب التعلق', a: sdA.attachmentStyle || ansA.attachment_style || '—', b: sdB.attachmentStyle || ansB.attachment_style || '—', tip: '' },
          { label: 'أسلوب التواصل', a: sdA.communicationStyle || ansA.communication_style || '—', b: sdB.communicationStyle || ansB.communication_style || '—', tip: '' },
        ]
        const ScoreBar = ({ label, score, max, color = 'indigo' }: { label: string; score: number; max: number; color?: string }) => (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-gray-500">{label}</span>
              <span className={`text-${color}-300 font-bold`}>{score}/{max}</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div className={`h-full bg-${color}-500 rounded-full transition-all`} style={{ width: `${Math.min(100, (score / max) * 100)}%` }} />
            </div>
          </div>
        )
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setPairDetail(null)}>
            <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-gray-800 sticky top-0 bg-gray-950 z-10">
                <div>
                  <h2 className="text-white font-bold text-lg">تفاصيل المطابقة</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {pd.matchType === 'mutual' ? '🔁 تبادل مشترك' : '⚡ احتياطي'}
                    {pd.table ? ` · طاولة ${pd.table}` : ''}
                  </p>
                </div>
                <button onClick={() => setPairDetail(null)} className="p-2 hover:bg-gray-800 rounded-xl text-gray-500 hover:text-white transition-colors">✕</button>
              </div>

              <div className="p-5 space-y-5">
                {/* Participants */}
                <div className="grid grid-cols-2 gap-3">
                  {[{ name: pd.aName, gender: pd.aGender, num: pd.a, rank: pd.rankBInA }, { name: pd.bName, gender: pd.bGender, num: pd.b, rank: pd.rankAInB }].map((p, i) => (
                    <div key={i} className={`rounded-xl p-3 border ${p.gender === 'female' ? 'bg-pink-950/20 border-pink-800/30' : 'bg-blue-950/20 border-blue-800/30'}`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${p.gender === 'female' ? 'bg-pink-400' : 'bg-blue-400'}`} />
                        <span className="text-white font-semibold text-sm truncate">{p.name}</span>
                        <span className="text-gray-600 text-[10px]">#{p.num}</span>
                      </div>
                      {p.rank != null && <p className="text-[10px] text-gray-500 mt-1">رتّب الآخر: المركز #{p.rank}</p>}
                    </div>
                  ))}
                </div>

                {/* Incompleteness warning */}
                {!pd.bothComplete && (
                  <div className="bg-red-950/40 border border-red-800/50 rounded-xl p-3 flex items-start gap-2.5">
                    <span className="text-red-400 text-lg flex-shrink-0">⚠</span>
                    <div>
                      <p className="text-red-300 text-sm font-semibold">بيانات المسح غير مكتملة</p>
                      <p className="text-red-400/70 text-xs mt-0.5">أحد المشاركَين أو كلاهما لم يكملا المسح. نسبة التوافق المعروضة ليست دقيقة.</p>
                    </div>
                  </div>
                )}

                {/* Score */}
                {pd.compatScore != null && (
                  <div className="bg-gray-900 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-gray-300">تفصيل نسبة التوافق</h3>
                      <div className={`text-xl font-black px-3 py-1 rounded-xl ${pd.compatScore >= 75 ? 'text-green-300 bg-green-900/30' : pd.compatScore >= 55 ? 'text-blue-300 bg-blue-900/30' : 'text-gray-300 bg-gray-800'}`}>
                        {pd.compatScore}%
                      </div>
                    </div>
                    <p className="text-[10px] text-amber-400/70 mb-2">⚠ نسبة الـ vibe (ذكاء اصطناعي) محسوبة افتراضياً بـ 12/25 بدون AI</p>
                    <ScoreBar label="التناغم التفاعلي Synergy" score={c.synergyScore ?? 0} max={35} color="purple" />
                    <ScoreBar label="الفكاهة + الانفتاح" score={c.humorOpenScore ?? 0} max={15} color="amber" />
                    <ScoreBar label="أسلوب الحياة" score={c.lifestyleScore ?? 0} max={10} color="teal" />
                    <ScoreBar label="التواصل" score={c.communicationScore ?? 0} max={10} color="blue" />
                    <ScoreBar label="القيم الجوهرية (الخام)" score={c.coreValuesScore ?? 0} max={20} color="rose" />
                    <ScoreBar label="القيم (مرجّح ×0.25)" score={+(c.coreValuesScaled5 ?? 0)} max={5} color="pink" />
                    <ScoreBar label="الهدف / النية" score={c.intentScore ?? 0} max={5} color="green" />
                    <ScoreBar label="Vibe (افتراضي)" score={c.vibeScore ?? 12} max={25} color="indigo" />
                    {/* Flags */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {c.attachmentPenalty && <span className="text-[10px] bg-red-900/30 text-red-400 border border-red-800/40 px-2 py-0.5 rounded-full">⚠ عقوبة التعلق -5</span>}
                      {c.opennessZeroZero && <span className="text-[10px] bg-orange-900/30 text-orange-400 border border-orange-800/40 px-2 py-0.5 rounded-full">⚠ انفتاح 0×0 -5</span>}
                      {c.deadAirVeto && <span className="text-[10px] bg-red-900/30 text-red-400 border border-red-800/40 px-2 py-0.5 rounded-full">⛔ فيتو الصمت ≤40%</span>}
                      {c.humorClashVeto && <span className="text-[10px] bg-red-900/30 text-red-400 border border-red-800/40 px-2 py-0.5 rounded-full">⛔ فيتو الفكاهة ≤50%</span>}
                      {c.intentBoost && <span className="text-[10px] bg-green-900/30 text-green-400 border border-green-800/40 px-2 py-0.5 rounded-full">✅ دفعة الهدف</span>}
                    </div>
                  </div>
                )}

                {/* Side-by-side answers */}
                <div className="bg-gray-900 rounded-xl overflow-hidden">
                  <div className="grid grid-cols-3 gap-0 bg-gray-800/50 px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    <span>السؤال</span>
                    <span className={`text-center ${pd.aGender === 'female' ? 'text-pink-400' : 'text-blue-400'}`}>{pd.aName.split(' ')[0]}</span>
                    <span className={`text-center ${pd.bGender === 'female' ? 'text-pink-400' : 'text-blue-400'}`}>{pd.bName.split(' ')[0]}</span>
                  </div>
                  {qRows.map((row, i) => (
                    <div key={i} className={`grid grid-cols-3 gap-0 px-3 py-2 border-t border-gray-800/60 ${i % 2 === 0 ? '' : 'bg-gray-900/50'}`}>
                      <div>
                        <p className="text-[10px] text-gray-400 leading-tight">{row.label}</p>
                        {row.tip && <p className="text-[9px] text-gray-700 leading-tight mt-0.5">{row.tip}</p>}
                      </div>
                      <p className={`text-xs font-bold text-center self-center ${row.a === row.b ? 'text-green-400' : 'text-gray-300'}`}>{row.a}</p>
                      <p className={`text-xs font-bold text-center self-center ${row.a === row.b ? 'text-green-400' : 'text-gray-300'}`}>{row.b}</p>
                    </div>
                  ))}
                </div>

                {/* Skipped choices */}
                {(pd.skippedByA?.length > 0 || pd.skippedByB?.length > 0) && (
                  <div className="bg-gray-900 rounded-xl p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-gray-400">خيارات تم تخطيها</h3>
                    {pd.skippedByA?.length > 0 && (
                      <div>
                        <p className="text-[10px] text-gray-500 mb-1">{pd.aName} كان يفضل:</p>
                        <div className="space-y-1">
                          {pd.skippedByA.map((s: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-[10px] text-gray-400">
                              <span className="w-4 h-4 rounded bg-gray-800 text-gray-500 flex items-center justify-center font-bold flex-shrink-0">{s.rank}</span>
                              <span className="flex-1">{s.name} #{s.number}</span>
                              <span className="text-gray-600">{s.reason}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {pd.skippedByB?.length > 0 && (
                      <div>
                        <p className="text-[10px] text-gray-500 mb-1">{pd.bName} كان يفضل:</p>
                        <div className="space-y-1">
                          {pd.skippedByB.map((s: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-[10px] text-gray-400">
                              <span className="w-4 h-4 rounded bg-gray-800 text-gray-500 flex items-center justify-center font-bold flex-shrink-0">{s.rank}</span>
                              <span className="flex-1">{s.name} #{s.number}</span>
                              <span className="text-gray-600">{s.reason}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

    </div>
  )
}
